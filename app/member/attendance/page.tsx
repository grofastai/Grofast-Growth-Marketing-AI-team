import { createServerClient } from "@/lib/supabase/server"
import { createClient } from "@supabase/supabase-js"
import { cookies } from "next/headers"
import { redirect } from "next/navigation"
import AttendanceClient from "./attendance-client"

function adminSupabase() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  )
}

export default async function AttendancePage() {
  const supabase = await createServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect("/login")

  const cookieStore = await cookies()
  const impersonateId = cookieStore.get("gf_impersonate")?.value
  const effectiveUserId = impersonateId ?? user.id

  const now   = new Date()
  const today = now.toISOString().split("T")[0]

  // Week range: Monday → Sunday of current week
  const dow    = now.getDay()
  const monday = new Date(now)
  monday.setDate(now.getDate() - (dow === 0 ? 6 : dow - 1))
  const sunday = new Date(monday)
  sunday.setDate(monday.getDate() + 6)
  const weekStart = monday.toISOString().split("T")[0]
  const weekEnd   = sunday.toISOString().split("T")[0]

  // Month range
  const monthStart = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-01`

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
  type DailyUpdate = {
    working_hours: number | null
    learning_hours: number | null
    shoot_count: number | null
  }

  const admin = adminSupabase()

  const [
    { data: todayLogRaw },
    { data: weekLogsRaw },
    { data: todayUpdateRaw },
    { data: weekPermissions },
    { data: monthAttLogsRaw },
    { data: monthUpdatesRaw },
    { count: pendingLeavesCount },
    { data: approvedLeavesRaw },
  ] = await Promise.all([
    supabase.from("attendance_logs")
      .select("id, date, clock_in, clock_out, break_in, break_out, break_total_mins, break_sessions, work_type, status, paused_seconds")
      .eq("user_id", effectiveUserId).eq("date", today).maybeSingle(),
    supabase.from("attendance_logs")
      .select("id, date, clock_in, clock_out, break_in, break_out, break_total_mins, break_sessions, work_type, status, paused_seconds")
      .eq("user_id", effectiveUserId).gte("date", weekStart).lte("date", weekEnd),
    supabase.from("daily_updates")
      .select("working_hours, learning_hours, shoot_count")
      .eq("user_id", effectiveUserId).eq("date", today).maybeSingle(),
    supabase.from("leaves")
      .select("from_date, permission_hours")
      .eq("user_id", effectiveUserId)
      .eq("leave_type", "permission")
      .eq("status", "approved")
      .gte("from_date", weekStart)
      .lte("from_date", weekEnd),
    // Monthly attendance logs
    admin.from("attendance_logs")
      .select("work_type, status, clock_in, clock_out, break_total_mins")
      .eq("user_id", effectiveUserId)
      .gte("date", monthStart)
      .lte("date", today),
    // Monthly daily_updates for worked hours
    admin.from("daily_updates")
      .select("working_hours, learning_hours")
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
      .select("from_date, to_date")
      .eq("user_id", effectiveUserId)
      .eq("status", "approved")
      .gte("from_date", monthStart)
      .lte("from_date", today),
  ])

  // Sum approved permission hours per date
  const permHoursByDate: Record<string, number> = {}
  for (const p of (weekPermissions ?? []) as { from_date: string; permission_hours: number | null }[]) {
    permHoursByDate[p.from_date] = (permHoursByDate[p.from_date] ?? 0) + (p.permission_hours ?? 1)
  }
  const todayPermissionHours = permHoursByDate[today] ?? 0

  // Monthly stats computation
  type MonthAttLog = { work_type: string | null; status: string; clock_in: string | null; clock_out: string | null; break_total_mins: number }
  const monthAttLogs = (monthAttLogsRaw ?? []) as MonthAttLog[]
  const monthUpdates = (monthUpdatesRaw ?? []) as { working_hours: number | null; learning_hours: number | null }[]
  const approvedLeaves = (approvedLeavesRaw ?? []) as { from_date: string; to_date: string }[]

  const presentLogs = monthAttLogs.filter(l => l.status === "present")
  const monthOfficeDays  = presentLogs.filter(l => l.work_type === "office").length
  const monthWfhDays     = presentLogs.filter(l => l.work_type === "wfh").length
  const monthPresentDays = presentLogs.length
  const monthAbsentDays  = monthAttLogs.filter(l => l.status === "absent").length

  const monthTotalHrs = Math.round(
    monthUpdates.reduce((s, u) => s + (u.working_hours ?? 0) + (u.learning_hours ?? 0), 0) * 10
  ) / 10

  const monthAvgHrs = monthPresentDays > 0
    ? Math.round((monthTotalHrs / monthPresentDays) * 10) / 10
    : 0

  const monthLeaveDays = approvedLeaves.reduce((sum, l) => {
    return sum + Math.ceil((new Date(l.to_date).getTime() - new Date(l.from_date).getTime()) / 86400000) + 1
  }, 0)

  const monthlyPerf = {
    presentDays:  monthPresentDays,
    absentDays:   monthAbsentDays,
    officeDays:   monthOfficeDays,
    wfhDays:      monthWfhDays,
    leaveDays:    monthLeaveDays,
    pendingLeaves: pendingLeavesCount ?? 0,
    totalHours:   monthTotalHrs,
    avgHours:     monthAvgHrs,
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
      monthlyPerf={monthlyPerf}
    />
  )
}
