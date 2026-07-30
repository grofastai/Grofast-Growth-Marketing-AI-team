export const revalidate = 30 // was force-fresh — safe to cache: every write to this page already calls revalidatePath() (2026-07-30)

import { createServerClient } from "@/lib/supabase/server"
import { createClient } from "@supabase/supabase-js"
import { cookies } from "next/headers"
import { redirect } from "next/navigation"
import HistoryClient from "./history-client"
import { todayIST } from "@/lib/utils/ist-date"

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
  participant_ids?: string[]
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
    .select("name, company_id, team, work_layout")
    .eq("id", effectiveUserId)
    .single()

  const companyId = profileResult.data?.company_id ?? ""

  // Full year — one entry/day max, so ~170 rows at most; matches annual leave cycle
  const fromDateStr = `${todayIST().slice(0, 4)}-01-01`

  const [updatesResult, clientsResult, pastClientsResult, participatedResult, membersResult, attLogsResult, leavesResult, companyLeavesResult, confirmationsResult, rejectedEntriesResult] = await Promise.all([
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
          .eq("role", "MEMBER")
          .or("work_layout.neq.freelance_media,work_layout.is.null")
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
    // Entry ids this member already rejected — a rejected tag must never surface
    // as "Collaborated" again, even if the submitter's participant_ids array
    // still (incorrectly) lists this member.
    companyId
      ? admin
          .from("collaboration_confirmations")
          .select("entry_id")
          .eq("collaborator_id", effectiveUserId)
          .eq("company_id", companyId)
          .eq("status", "rejected")
      : Promise.resolve({ data: [] as { entry_id: string }[] }),
  ])

  // Build a set of dates where the member actually clocked in
  const clockedInDates = new Set(
    ((attLogsResult.data ?? []) as { date: string }[]).map(r => r.date)
  )

  // Build set of dates covered by an approved full_day leave (these win over clock-in)
  const fullDayLeaveDates = new Set<string>()
  // Every date covered by ANY approved leave, of any type — a clocked-in day that
  // falls under one of these already has an explanation on file, so it shouldn't
  // be flagged as a missing submission even if the daily update itself is absent.
  const anyLeaveDates = new Set<string>()
  for (const leave of (leavesResult.data ?? []) as { leave_type: string; from_date: string; to_date: string }[]) {
    const from = new Date(leave.from_date)
    const to   = new Date(leave.to_date)
    for (const d = new Date(from); d <= to; d.setDate(d.getDate() + 1)) {
      const ds = d.toISOString().split('T')[0]
      anyLeaveDates.add(ds)
      if (leave.leave_type === 'full_day') fullDayLeaveDates.add(ds)
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
  const team = profileResult.data?.team ?? ""
  const workLayout = (profileResult.data as { work_layout?: string } | null)?.work_layout as 'media' | 'non_media' | 'freelance_media' | undefined
  const clients = ((clientsResult.data ?? []) as { name: string }[]).map(c => c.name)
  const pastClients = ((pastClientsResult.data ?? []) as { name: string }[]).map(c => c.name)
  const rejectedEntryIds = new Set(
    ((rejectedEntriesResult.data ?? []) as { entry_id: string }[]).map(r => r.entry_id)
  )
  // Drop any entry this member already rejected, and drop the whole participated
  // row if nothing tagging this member survives — otherwise a rejected collab tag
  // keeps showing as "Collaborated" and wrongly wins priority over a real leave day.
  // A confirmation record is the real source of truth for "this collaboration belongs to
  // me" — an entry's own participant_ids can go stale (edited/re-tagged after the
  // confirmation was created) while the confirmation itself still correctly points at this
  // entry_id. Trusting participant_ids alone silently hid the whole day, pending-confirmation
  // card and all, whenever that drift happened.
  const myConfirmationEntryIds = new Set(
    ((confirmationsResult.data ?? []) as { entry_id: string }[]).map(c => c.entry_id)
  )
  // The .contains("participant_ids", ...) filter above reads the daily_updates row's
  // top-level column, which can drift out of sync with an entry's own participant_ids
  // (tagged on the entry, but the parent row's column never resynced) — when that
  // happens the whole row is dropped before it ever reaches the client, so the
  // collaboration is invisible in the member's timeline even though a confirmation
  // (and its hours) exist for it. A confirmation's daily_update_id is the same
  // authoritative source already trusted below for myConfirmationEntryIds, so
  // backfill any row it points at that the .contains() filter missed.
  const fetchedParticipatedIds = new Set(
    ((participatedResult.data ?? []) as unknown as ParticipatedUpdate[]).map(pu => pu.id)
  )
  const missingDailyUpdateIds = Array.from(new Set(
    ((confirmationsResult.data ?? []) as CollaborationConfirmation[])
      .map(c => c.daily_update_id)
      .filter(id => id && !fetchedParticipatedIds.has(id))
  ))
  const backfillResult = (missingDailyUpdateIds.length && companyId)
    ? await admin
        .from("daily_updates")
        .select("id, date, user_id, attendance_status, working_hours, work_entries")
        .in("id", missingDailyUpdateIds)
        .neq("user_id", effectiveUserId)
    : { data: [] as unknown as ParticipatedUpdate[] }
  const allParticipatedRows = [
    ...((participatedResult.data ?? []) as unknown as ParticipatedUpdate[]),
    ...((backfillResult.data ?? []) as unknown as ParticipatedUpdate[]),
  ]
  const participatedUpdates = allParticipatedRows
    .map(pu => ({
      ...pu,
      work_entries: (Array.isArray(pu.work_entries) ? pu.work_entries : []).filter(
        e => !e.id || !rejectedEntryIds.has(e.id)
      ),
    }))
    .filter(pu =>
      pu.work_entries.some(e =>
        (Array.isArray(e.participant_ids) && e.participant_ids.includes(effectiveUserId)) ||
        (e.id && myConfirmationEntryIds.has(e.id))
      )
    )
  const members = (membersResult.data ?? []) as MemberInfo[]
  const attendanceDates = Array.from(clockedInDates)

  // Days that genuinely fell through the cracks: clocked in, no daily update
  // ever submitted, and no approved leave of any kind on file to explain it.
  // These need to be visible and flagged, not silently skipped.
  const updateDateSet = new Set(rawUpdates.map(u => u.date))
  const missingSubmissionDates = attendanceDates.filter(
    d => !updateDateSet.has(d) && !anyLeaveDates.has(d)
  )

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
      team={team}
      workLayout={workLayout}
      clients={clients}
      pastClients={pastClients}
      participatedUpdates={participatedUpdates}
      members={members}
      attendanceDates={attendanceDates}
      missingSubmissionDates={missingSubmissionDates}
      approvedLeaves={approvedLeaves}
      companyLeaves={companyLeaves}
      defaultDate={defaultDate}
      collaborationConfirmations={collaborationConfirmations}
    />
  )
}
