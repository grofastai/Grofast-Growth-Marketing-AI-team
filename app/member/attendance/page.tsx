import { createServerClient } from "@/lib/supabase/server"
import { createClient } from "@supabase/supabase-js"
import { cookies } from "next/headers"
import { redirect } from "next/navigation"
import AttendanceClient from "./attendance-client"
import { blockFreelancerMedia } from "@/lib/utils/freelancer-guard"
import { findLastWorkingDayIssues } from "@/lib/actions/attendance"
import { todayIST, nowISTShifted } from "@/lib/utils/ist-date"
import { sumLeaveDays, overtimeHoursByMonth } from "@/lib/utils/leave-balance"
import { summarizeAttendanceDays, dailyWorkHours } from "@/lib/utils/attendance-stats"

function adminSupabase() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  )
}

export default async function AttendancePage() {
  await blockFreelancerMedia()
  const supabase = await createServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect("/login")

  const cookieStore = await cookies()
  const impersonateId = cookieStore.get("gf_impersonate")?.value
  const effectiveUserId = impersonateId ?? user.id

  // nowISTShifted() reads as IST wall-clock time via its UTC getters — plain new Date()
  // reads the server's own clock (UTC on Vercel), which is wrong for "today"/"this week"/
  // "this month" during the 00:00-05:30 IST window every day.
  const now   = nowISTShifted()
  const today = todayIST()

  // Week range: Monday → Sunday of current week (IST)
  const dow    = now.getUTCDay()
  const monday = new Date(now)
  monday.setUTCDate(now.getUTCDate() - (dow === 0 ? 6 : dow - 1))
  const sunday = new Date(monday)
  sunday.setUTCDate(monday.getUTCDate() + 6)
  const weekStart = monday.toISOString().split("T")[0]
  const weekEnd   = sunday.toISOString().split("T")[0]

  // Month range (IST)
  const monthStart = `${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, "0")}-01`
  // Leave Taken should count the WHOLE month, including already-approved leave dated
  // later this month — unlike attendance data (clipped to today, since there's no data
  // for days that haven't happened), a leave already approved for next week is already
  // "used" against the allowance right now. Matches Dashboard/History (confirmed 2026-07-28).
  const leaveRangeEnd = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 0)).toISOString().split("T")[0]

  type BreakSession = { in: string; out: string | null; mins: number | null }
  type AttLog = {
    id: string; date: string
    clock_in: string | null; clock_out: string | null
    break_in: string | null; break_out: string | null
    break_total_mins: number
    break_sessions: BreakSession[] | null
    work_type: string | null; status: string
    paused_seconds: number
  }
  type WorkEntryLike = { task_type: string; start_time?: string | null; end_time?: string | null; duration_hours?: number | null; _travel_hours?: number | null }
  type DailyUpdate = {
    working_hours: number | null
    learning_hours: number | null
    shoot_count: number | null
  }

  const admin = adminSupabase()
  // When impersonating, the RLS-bound `supabase` client is still authenticated as
  // the admin, so member-scoped queries return zero rows. Read through the
  // service-role client instead, still scoped to effectiveUserId.
  const db = impersonateId ? admin : supabase

  const [
    { data: profileRaw },
    { data: todayLogRaw },
    { data: weekLogsRaw },
    { data: todayUpdateRaw },
    { data: weekPermissions },
    { data: monthAttLogsRaw },
    { data: monthUpdatesRaw },
    { count: pendingLeavesCount },
    { data: approvedLeavesRaw },
    { data: weekUpdatesRaw },
    { data: monthCollabRaw },
  ] = await Promise.all([
    db.from("users").select("team, is_management, work_layout, company_id").eq("id", effectiveUserId).maybeSingle(),
    db.from("attendance_logs")
      .select("id, date, clock_in, clock_out, break_in, break_out, break_total_mins, break_sessions, work_type, status, paused_seconds")
      .eq("user_id", effectiveUserId).eq("date", today).maybeSingle(),
    db.from("attendance_logs")
      .select("id, date, clock_in, clock_out, break_in, break_out, break_total_mins, break_sessions, work_type, status, paused_seconds")
      .eq("user_id", effectiveUserId).gte("date", weekStart).lte("date", weekEnd),
    db.from("daily_updates")
      .select("working_hours, learning_hours, shoot_count")
      .eq("user_id", effectiveUserId).eq("date", today).maybeSingle(),
    db.from("leaves")
      .select("from_date, permission_hours")
      .eq("user_id", effectiveUserId)
      .eq("leave_type", "permission")
      .eq("status", "approved")
      .gte("from_date", weekStart)
      .lte("from_date", weekEnd),
    // Monthly attendance logs
    admin.from("attendance_logs")
      .select("date, work_type, status, clock_in, clock_out, break_total_mins")
      .eq("user_id", effectiveUserId)
      .gte("date", monthStart)
      .lte("date", today),
    // Monthly daily_updates for worked hours
    admin.from("daily_updates")
      .select("date, working_hours, learning_hours, work_entries")
      .eq("user_id", effectiveUserId)
      .gte("date", monthStart)
      .lte("date", today),
    // Pending leaves count
    admin.from("leaves")
      .select("*", { count: "exact", head: true })
      .eq("user_id", effectiveUserId)
      .eq("status", "pending"),
    // Approved leaves this month
    admin.from("leaves")
      .select("from_date, to_date, leave_type, permission_hours")
      .eq("user_id", effectiveUserId)
      .eq("status", "approved")
      .gte("from_date", monthStart)
      .lte("from_date", leaveRangeEnd),
    // Weekly daily_updates — used to show accurate worked hours in weekly view
    admin.from("daily_updates")
      .select("date, working_hours, learning_hours, work_entries")
      .eq("user_id", effectiveUserId)
      .gte("date", weekStart)
      .lte("date", weekEnd),
    // Monthly collab hours (confirmed)
    admin.from("collaboration_confirmations")
      .select("date, confirmed_hours")
      .eq("collaborator_id", effectiveUserId)
      .in("status", ["confirmed", "edited_confirmed"])
      .gte("date", monthStart)
      .lte("date", today),
  ])

  // Work hours per day from daily_updates (for accurate weekly display) — computed from work_entries
  const weekUpdatesByDate: Record<string, number> = {}
  for (const u of (weekUpdatesRaw ?? []) as { date: string; working_hours: number | null; learning_hours: number | null; work_entries: WorkEntryLike[] | null }[]) {
    const computedH = dailyWorkHours(u)
    if (computedH > 0) weekUpdatesByDate[u.date] = computedH
  }
  // Add confirmed collab hours to weekly per-day totals (reuse monthCollabRaw which covers this week)
  for (const c of (monthCollabRaw ?? []) as { date: string; confirmed_hours: number | null }[]) {
    if (c.confirmed_hours && c.confirmed_hours > 0)
      weekUpdatesByDate[c.date] = (weekUpdatesByDate[c.date] ?? 0) + c.confirmed_hours
  }

  // Sum approved permission hours per date
  const permHoursByDate: Record<string, number> = {}
  for (const p of (weekPermissions ?? []) as { from_date: string; permission_hours: number | null }[]) {
    permHoursByDate[p.from_date] = (permHoursByDate[p.from_date] ?? 0) + (p.permission_hours ?? 1)
  }
  const todayPermissionHours = permHoursByDate[today] ?? 0

  // Check if today has an approved full-day or half-day leave (no login required)
  const { data: todayLeaveRaw } = await admin.from("leaves")
    .select("leave_type, reason, half_day_from_time, half_day_to_time")
    .eq("user_id", effectiveUserId)
    .eq("status", "approved")
    .in("leave_type", ["full_day", "half_day"])
    .lte("from_date", today)
    .gte("to_date", today)
    .maybeSingle()
  const todayApprovedLeave = todayLeaveRaw as { leave_type: string; reason: string | null; half_day_from_time?: string | null; half_day_to_time?: string | null } | null

  // Check WFH / Shoot Day leave status for today (pending or approved)
  const { data: todayWfhLeaveRaw } = await admin.from("leaves")
    .select("leave_type, status, created_at")
    .eq("user_id", effectiveUserId)
    .lte("from_date", today)
    .gte("to_date", today)
    .in("leave_type", ["wfh", "shoot_day"])
    .not("status", "eq", "rejected")
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle()
  const todayWfhLeave = todayWfhLeaveRaw as { leave_type: string; status: string; created_at: string } | null

  // Monthly stats computation
  type MonthAttLog = { date: string; work_type: string | null; status: string; clock_in: string | null; clock_out: string | null; break_total_mins: number }
  type MonthUpdate = { date: string; working_hours: number | null; learning_hours: number | null; work_entries: WorkEntryLike[] | null }
  const monthAttLogs   = (monthAttLogsRaw ?? []) as MonthAttLog[]
  const monthUpdates   = (monthUpdatesRaw ?? []) as MonthUpdate[]
  const approvedLeaves = (approvedLeavesRaw ?? []) as { from_date: string; to_date: string; leave_type: string | null; permission_hours: number | string | null }[]

  const profile      = profileRaw as { team?: string | null; is_management?: boolean | null; work_layout?: string | null; company_id?: string | null } | null
  const isMedia      = profile?.team === "Media Team" || profile?.team === "Media Production Team"
  const isManagement = profile?.is_management === true
  const isFreelancer = profile?.work_layout === "freelance_media"

  const presentLogs      = monthAttLogs.filter(l => l.status === "present")
  const monthOfficeDays  = presentLogs.filter(l => l.work_type === "office").length
  const monthWfhDays     = presentLogs.filter(l => l.work_type === "wfh").length
  const monthShootDays   = presentLogs.filter(l => l.work_type === "shoot" || l.work_type === "outside").length

  // Login hours = raw span (no break deduction)
  const monthLoginHrs = Math.round(
    presentLogs
      .filter(l => l.clock_in && l.clock_out)
      .reduce((s, l) => s + (new Date(l.clock_out!).getTime() - new Date(l.clock_in!).getTime()) / 3600000, 0) * 10
  ) / 10

  // Collab hours this month (change 7)
  const monthCollabByDate: Record<string, number> = {}
  for (const c of (monthCollabRaw ?? []) as { date: string; confirmed_hours: number | null }[]) {
    monthCollabByDate[c.date] = (monthCollabByDate[c.date] ?? 0) + (c.confirmed_hours ?? 0)
  }
  const monthCollabHrs = Object.values(monthCollabByDate).reduce((s, h) => s + h, 0)

  // Working hours from daily_updates + confirmed collab
  const monthTotalHrs = Math.round(
    (monthUpdates.reduce((s, u) => s + dailyWorkHours(u), 0) + monthCollabHrs) * 10
  ) / 10

  // LEAVE-1 fix: cap leave dates to current month boundaries; half_day = 0.5,
  // permission = cumulative hours converted to day-equivalents, net of that
  // same month's overtime (work before 09:30 / at-or-after 19:00) — see
  // overtimeHoursByMonth in lib/utils/leave-balance.ts.
  const monthOvertimeByMonth = overtimeHoursByMonth(monthUpdates)
  const monthLeaveDays = sumLeaveDays(approvedLeaves, monthStart, leaveRangeEnd, monthOvertimeByMonth)

  // Present Days / Half Days / Absent Days — shared classifier
  // (lib/utils/attendance-stats.ts) so this matches Dashboard, History,
  // Admin Payroll, and the Payslip PDF for the same person/month.
  const monthLeaveDateMap = new Map<string, "full" | "half">()
  for (const l of approvedLeaves) {
    if (l.leave_type === "permission" || l.leave_type === "wfh" || l.leave_type === "shoot_day") continue
    const weight = l.leave_type === "half_day" ? "half" : "full"
    const cur = new Date(l.from_date + "T12:00:00")
    const end = new Date(l.to_date   + "T12:00:00")
    while (cur <= end) {
      const d = cur.toISOString().split("T")[0]
      if (d >= monthStart && d <= today) monthLeaveDateMap.set(d, weight)
      cur.setDate(cur.getDate() + 1)
    }
  }
  const monthClockInDates = new Set(monthAttLogs.filter(l => l.clock_in !== null || l.status === "present").map(l => l.date))
  const monthWorkHoursByDate: Record<string, number> = {}
  for (const u of monthUpdates) monthWorkHoursByDate[u.date] = dailyWorkHours(u) + (monthCollabByDate[u.date] ?? 0)
  const monthRangeDates: string[] = []
  for (let d = new Date(monthStart + "T12:00:00"); d.toISOString().split("T")[0] <= today; d.setDate(d.getDate() + 1)) {
    monthRangeDates.push(d.toISOString().split("T")[0])
  }
  const monthAttendanceSummary = summarizeAttendanceDays(monthRangeDates.map(date => ({
    hasClockIn: monthClockInDates.has(date),
    workHours: monthWorkHoursByDate[date] ?? 0,
    leaveType: monthLeaveDateMap.get(date),
  })))
  const monthPresentDays = monthAttendanceSummary.presentDays
  const monthAbsentDays  = monthAttendanceSummary.absentDays

  const monthAvgLoginHrs = monthPresentDays > 0
    ? Math.round((monthLoginHrs / monthPresentDays) * 10) / 10
    : 0
  const monthAvgHrs = monthPresentDays > 0
    ? Math.round((monthTotalHrs / monthPresentDays) * 10) / 10
    : 0

  const monthlyPerf = {
    presentDays: monthPresentDays, absentDays: monthAbsentDays,
    officeDays: monthOfficeDays, wfhDays: monthWfhDays, shootDays: monthShootDays,
    leaveDays: monthLeaveDays, pendingLeaves: pendingLeavesCount ?? 0,
    totalHours: monthTotalHrs, avgHours: monthAvgHrs,
    loginHours: monthLoginHrs, avgLoginHours: monthAvgLoginHrs,
  }

  // ── Last working day status check (Changes 2A, 2B) ─────────────────────────
  // Skip entirely for management team, freelancer media, or when impersonating.
  // Shares the same walk-back logic as the full-screen gate (lib/actions/attendance.ts)
  // instead of a separate yesterday-only check, so a leave/blank day in between can
  // no longer hide an older unfinished session or missing update.
  type YesterdayStatus = 'ok' | 'no_login' | 'no_logout' | 'missing_update'
  let yesterdayStatus: YesterdayStatus = 'ok'
  let yesterdayStr = ''

  if (!isManagement && !isFreelancer && !impersonateId && profile?.company_id) {
    const issues = await findLastWorkingDayIssues({ userId: effectiveUserId, companyId: profile.company_id })
    if (issues.forgotLogout) {
      yesterdayStatus = 'no_logout'
      yesterdayStr = issues.forgotLogoutDate
    } else if (issues.missingUpdate) {
      yesterdayStatus = issues.missingUpdateHadClockIn ? 'missing_update' : 'no_login'
      yesterdayStr = issues.missingUpdateDate
    }
  }

  return (
    <AttendanceClient
      todayLog={todayLogRaw as unknown as AttLog | null}
      weekLogs={(weekLogsRaw ?? []) as unknown as AttLog[]}
      todayUpdate={todayUpdateRaw as unknown as DailyUpdate | null}
      today={today}
      weekStart={weekStart}
      todayPermissionHours={todayPermissionHours}
      permHoursByDate={permHoursByDate}
      weekUpdatesByDate={weekUpdatesByDate}
      monthlyPerf={monthlyPerf}
      todayApprovedLeave={todayApprovedLeave}
      todayWfhLeave={todayWfhLeave}
      isMedia={isMedia}
      yesterdayStatus={yesterdayStatus}
      yesterdayStr={yesterdayStr}
    />
  )
}
