export const revalidate = 0

import { createServerClient } from "@/lib/supabase/server"
import { createClient } from "@supabase/supabase-js"
import { cookies } from "next/headers"
import { redirect } from "next/navigation"
import HistoryClient from "./history-client"

type WorkEntry = {
  id?: string
  task_type: "shoot" | "edit" | "other" | "break" | "learning"
  title: string
  client_name: string
  duration_hours: number
  notes: string
  start_time?: string | null
  end_time?: string | null
  screenshot_url?: string | null
}

type UpdateRow = {
  id: string
  date: string
  attendance_status: string
  work_type: string | null
  working_hours: number | null
  learning_hours: number | null
  learning_topic: string | null
  learning_notes: string | null
  learning_start_time: string | null
  learning_end_time: string | null
  shoot_count: number | null
  work_entries: WorkEntry[] | null
  created_at: string
}

type ParticipatedUpdate = {
  id: string
  date: string
  user_id: string
  attendance_status: string
  working_hours: number | null
  work_entries: WorkEntry[] | null
}

type CollaborationConfirmation = {
  id: string
  date: string
  status: 'pending' | 'confirmed' | 'edited_confirmed' | 'rejected'
  submitter_id: string
  entry_id: string
  daily_update_id: string
  original_start_time: string | null
  original_end_time: string | null
  original_duration_hours: number | null
  confirmed_start_time: string | null
  confirmed_end_time: string | null
  confirmed_hours: number | null
  rejection_reason: string | null
  entry_snapshot: { title?: string; task_type?: string; client_name?: string } | null
}

type MemberInfo = { id: string; name: string }

function adminSupabase() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  )
}

export default async function HistoryPage({ searchParams }: { searchParams: Promise<{ date?: string }> }) {
  const { date: defaultDate } = await searchParams
  const supabase = await createServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect("/login")

  const cookieStore = await cookies()
  const impersonateId = cookieStore.get("gf_impersonate")?.value
  const effectiveUserId = impersonateId ?? user.id

  const admin = adminSupabase()
  // When impersonating, the RLS-bound `supabase` client is still authed as the
  // admin, so member-scoped queries return zero rows. Read through the service-role
  // client instead, scoped to effectiveUserId.
  const db = impersonateId ? admin : supabase

  // Profile first — needed for company_id to query participated updates
  const profileResult = await admin
    .from("users")
    .select("name, company_id")
    .eq("id", effectiveUserId)
    .single()

  const companyId = profileResult.data?.company_id ?? ""

  // Full year — one entry/day max, so ~170 rows at most; matches annual leave cycle
  const fromDateStr = `${new Date().getFullYear()}-01-01`

  const [updatesResult, clientsResult, pastClientsResult, participatedResult, membersResult, attLogsResult, leavesResult, companyLeavesResult, confirmationsResult] = await Promise.all([
    db
      .from("daily_updates")
      .select("id, date, attendance_status, work_type, working_hours, learning_hours, learning_topic, learning_notes, learning_start_time, learning_end_time, shoot_count, editing_count, work_entries, created_at")
      .eq("user_id", effectiveUserId)
      .gte("date", fromDateStr)
      .order("date", { ascending: false }),
    // Active clients
    admin.from("clients").select("name").eq("company_id", companyId).eq("status", "active").order("name"),
    // Past clients (for edit dropdown — user may have old entries for these)
    admin.from("clients").select("name").eq("company_id", companyId).eq("status", "past").order("name"),
    companyId
      ? admin
          .from("daily_updates")
          .select("id, date, user_id, attendance_status, working_hours, work_entries")
          .eq("company_id", companyId)
          .contains("participant_ids", [effectiveUserId])
          .neq("user_id", effectiveUserId)
          .gte("date", fromDateStr)
          .order("date", { ascending: false })
      : Promise.resolve({ data: [] as ParticipatedUpdate[] }),
    companyId
      ? admin
          .from("users")
          .select("id, name")
          .eq("company_id", companyId)
          .eq("status", "active")
      : Promise.resolve({ data: [] as MemberInfo[] }),
    // Attendance logs for the full year
    admin
      .from("attendance_logs")
      .select("date")
      .eq("user_id", effectiveUserId)
      .not("clock_in", "is", null)
      .gte("date", fromDateStr)
      .order("date", { ascending: false }),
    // Approved leaves for the full year (client will cap at today)
    admin
      .from("leaves")
      .select("id, leave_type, from_date, to_date, reason, permission_time, permission_end_time, permission_hours, half_day_from_time, half_day_to_time, half_day_period")
      .eq("user_id", effectiveUserId)
      .eq("status", "approved")
      .gte("from_date", fromDateStr)
      .order("from_date", { ascending: false }),
    // Company holidays for the full year (client will cap at today)
    companyId
      ? admin.from("company_leaves").select("id, date, name").eq("company_id", companyId).gte("date", fromDateStr).order("date", { ascending: false })
      : Promise.resolve({ data: [] }),
    companyId
      ? admin
          .from("collaboration_confirmations")
          .select("id, date, status, submitter_id, entry_id, daily_update_id, original_start_time, original_end_time, original_duration_hours, confirmed_start_time, confirmed_end_time, confirmed_hours, rejection_reason, entry_snapshot")
          .eq("collaborator_id", effectiveUserId)
          .eq("company_id", companyId)
          .neq("status", "rejected")
          .gte("date", fromDateStr)
          .order("date", { ascending: false })
      : Promise.resolve({ data: [] as CollaborationConfirmation[] }),
  ])

  // Build a set of dates where the member actually clocked in
  const clockedInDates = new Set(
    ((attLogsResult.data ?? []) as { date: string }[]).map(r => r.date)
  )

  // Build set of dates covered by an approved full_day leave (these win over clock-in)
  const fullDayLeaveDates = new Set<string>()
  for (const leave of (leavesResult.data ?? []) as { leave_type: string; from_date: string; to_date: string }[]) {
    if (leave.leave_type === 'full_day') {
      const from = new Date(leave.from_date)
      const to   = new Date(leave.to_date)
      for (const d = new Date(from); d <= to; d.setDate(d.getDate() + 1)) {
        fullDayLeaveDates.add(d.toISOString().split('T')[0])
      }
    }
  }

  // Override attendance_status to 'present' for any day with a clock-in,
  // UNLESS that day has an approved full_day leave (leave takes priority)
  const rawUpdates = (updatesResult.data ?? []) as unknown as UpdateRow[]
  const updates = rawUpdates.map(u => ({
    ...u,
    attendance_status: (clockedInDates.has(u.date) && !fullDayLeaveDates.has(u.date))
      ? "present"
      : u.attendance_status,
  }))
  const name = (profileResult.data?.name ?? "").split(" ")[0] || "there"
  const clients = ((clientsResult.data ?? []) as { name: string }[]).map(c => c.name)
  const pastClients = ((pastClientsResult.data ?? []) as { name: string }[]).map(c => c.name)
  const participatedUpdates = (participatedResult.data ?? []) as unknown as ParticipatedUpdate[]
  const members = (membersResult.data ?? []) as MemberInfo[]
  const attendanceDates = Array.from(clockedInDates)

  type ApprovedLeave = {
    id: string; leave_type: string; from_date: string; to_date: string
    reason: string | null; permission_time: string | null; permission_end_time: string | null
    permission_hours: number | null; half_day_from_time: string | null
    half_day_to_time: string | null; half_day_period: string | null
  }
  const approvedLeaves = (leavesResult.data ?? []) as ApprovedLeave[]
  const companyLeaves  = (companyLeavesResult.data ?? []) as { id: string; date: string; name: string }[]
  const collaborationConfirmations = (confirmationsResult.data ?? []) as CollaborationConfirmation[]

  return (
    <HistoryClient
      updates={updates}
      userName={name}
      userId={effectiveUserId}
      clients={clients}
      pastClients={pastClients}
      participatedUpdates={participatedUpdates}
      members={members}
      attendanceDates={attendanceDates}
      approvedLeaves={approvedLeaves}
      companyLeaves={companyLeaves}
      defaultDate={defaultDate}
      collaborationConfirmations={collaborationConfirmations}
    />
  )
}
