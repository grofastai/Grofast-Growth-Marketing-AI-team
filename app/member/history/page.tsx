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

type MemberInfo = { id: string; name: string }

function adminSupabase() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  )
}

export default async function HistoryPage() {
  const supabase = await createServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect("/login")

  const cookieStore = await cookies()
  const impersonateId = cookieStore.get("gf_impersonate")?.value
  const effectiveUserId = impersonateId ?? user.id

  const admin = adminSupabase()

  // Profile first — needed for company_id to query participated updates
  const profileResult = await admin
    .from("users")
    .select("name, company_id")
    .eq("id", user.id)
    .single()

  const companyId = profileResult.data?.company_id ?? ""

  const [updatesResult, clientsResult, pastClientsResult, participatedResult, membersResult, attLogsResult] = await Promise.all([
    supabase
      .from("daily_updates")
      .select("id, date, attendance_status, work_type, working_hours, learning_hours, learning_topic, learning_notes, learning_start_time, learning_end_time, shoot_count, editing_count, work_entries, created_at")
      .eq("user_id", effectiveUserId)
      .order("date", { ascending: false })
      .limit(90),
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
          .order("date", { ascending: false })
          .limit(60)
      : Promise.resolve({ data: [] as ParticipatedUpdate[] }),
    companyId
      ? admin
          .from("users")
          .select("id, name")
          .eq("company_id", companyId)
          .eq("status", "active")
      : Promise.resolve({ data: [] as MemberInfo[] }),
    // Fetch attendance_logs to verify actual clock-in presence
    admin
      .from("attendance_logs")
      .select("date")
      .eq("user_id", effectiveUserId)
      .not("clock_in", "is", null)
      .order("date", { ascending: false })
      .limit(90),
  ])

  // Build a set of dates where the member actually clocked in
  const clockedInDates = new Set(
    ((attLogsResult.data ?? []) as { date: string }[]).map(r => r.date)
  )

  // Override attendance_status to 'present' for any day with a clock-in
  const rawUpdates = (updatesResult.data ?? []) as unknown as UpdateRow[]
  const updates = rawUpdates.map(u => ({
    ...u,
    attendance_status: clockedInDates.has(u.date) ? "present" : u.attendance_status,
  }))
  const name = (profileResult.data?.name ?? "").split(" ")[0] || "there"
  const clients = ((clientsResult.data ?? []) as { name: string }[]).map(c => c.name)
  const pastClients = ((pastClientsResult.data ?? []) as { name: string }[]).map(c => c.name)
  const participatedUpdates = (participatedResult.data ?? []) as unknown as ParticipatedUpdate[]
  const members = (membersResult.data ?? []) as MemberInfo[]
  const attendanceDates = Array.from(clockedInDates)

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
    />
  )
}
