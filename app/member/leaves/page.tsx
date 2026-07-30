export const revalidate = 30

import { createServerClient } from "@/lib/supabase/server"
import { createClient } from "@supabase/supabase-js"
import { cookies } from "next/headers"
import { redirect } from "next/navigation"
import MemberLeavesClient from "./leaves-client"
import { blockFreelancerMedia } from "@/lib/utils/freelancer-guard"
import { todayIST } from "@/lib/utils/ist-date"
import { sumLeaveDays, overtimeHoursByMonth } from "@/lib/utils/leave-balance"

function adminSupabase() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  )
}

export default async function MemberLeavesPage() {
  await blockFreelancerMedia()
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

  const yearStart = `${todayIST().slice(0, 4)}-01-01`

  const { data: profileData } = await admin
    .from("users")
    .select("name, paid_leave_days, company_id, team")
    .eq("id", effectiveUserId)
    .single()

  const companyId = profileData?.company_id ?? ""

  const yearEndForQuery = `${todayIST().slice(0, 4)}-12-31`

  const [leavesResult, usedResult, absentResult, companyLeavesResult, updatesResult] = await Promise.all([
    // Ordered by from_date (the actual leave date), not created_at — a bulk backfill
    // that inserts many rows at once all stamped with today's created_at could otherwise
    // crowd out older-but-still-relevant real submissions once past a row-count limit.
    // No cap: one employee's full leave history is at most a few hundred rows, never
    // worth risking silently dropping real leaves for.
    db
      .from("leaves")
      .select("*")
      .eq("user_id", effectiveUserId)
      .order("from_date", { ascending: false }),
    admin
      .from("leaves")
      .select("from_date, to_date, leave_type, permission_hours")
      .eq("user_id", effectiveUserId)
      .eq("status", "approved")
      .gte("from_date", yearStart),
    admin
      .from("attendance_logs")
      .select("id, date")
      .eq("user_id", effectiveUserId)
      .eq("status", "leave")
      .gte("date", yearStart)
      .order("date", { ascending: false }),
    companyId
      ? admin.from("company_leaves").select("id, date, name").eq("company_id", companyId).order("date")
      : Promise.resolve({ data: [] }),
    // Same-month overtime (work before 09:30 / at-or-after 19:00) nets against
    // Permission hours before they convert into leave days — see sumLeaveDays'
    // overtimeByMonth param. Fetched for the whole year so both the monthly
    // and yearly split-bar cards on this page can use it.
    admin
      .from("daily_updates")
      .select("date, work_entries")
      .eq("user_id", effectiveUserId)
      .gte("date", yearStart)
      .lte("date", yearEndForQuery),
  ])

  const leaves        = leavesResult.data ?? []
  const overtimeByMonth = overtimeHoursByMonth((updatesResult.data ?? []) as { date: string; work_entries: { task_type?: string | null; start_time?: string | null; duration_hours?: number | string | null }[] | null }[])
  const name          = (profileData?.name ?? "").split(" ")[0] || "there"
  const paidLeaveDays = profileData?.paid_leave_days ?? 0
  const isMedia       = (profileData as { team?: string | null } | null)?.team === "Media Team" || (profileData as { team?: string | null } | null)?.team === "Media Production Team"
  const absentDays    = (absentResult.data ?? []) as { id: string; date: string }[]
  const companyLeaves = (companyLeavesResult.data ?? []) as { id: string; date: string; name: string }[]

  // Calculate used days: full_day = exact days, half_day = 0.5, permission = cumulative
  // hours converted to day-equivalents, wfh/shoot_day = 0 (work arrangement, not absence), absent = 1
  const yearEnd = yearEndForQuery
  const leaveUsedDays = sumLeaveDays((usedResult.data ?? []) as { leave_type: string | null; from_date: string; to_date: string; permission_hours: number | string | null }[], yearStart, yearEnd, overtimeByMonth)
  // Approving a Full Day leave also mirrors that date into attendance_logs as
  // status='leave' (lib/actions/leaves.ts) — so every one of those dates is already
  // inside leaveUsedDays above. Without this same dedup, "Annual Leave Remaining"
  // counted each approved Full Day leave twice. Matches the dedup leaves-client.tsx
  // already applies when merging absentDays into its own timeline.
  const undupedAbsentDays = absentDays.filter(a => !leaves.some(l => a.date >= l.from_date && a.date <= l.to_date))
  const usedDays = leaveUsedDays + undupedAbsentDays.length

  return (
    <MemberLeavesClient
      leaves={leaves}
      userName={name}
      paidLeaveDays={paidLeaveDays}
      usedLeaveDays={usedDays}
      absentDays={absentDays}
      companyLeaves={companyLeaves}
      isMedia={isMedia}
      overtimeByMonth={overtimeByMonth}
    />
  )
}
