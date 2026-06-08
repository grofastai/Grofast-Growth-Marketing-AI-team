import { createServerClient } from "@/lib/supabase/server"
import { cookies } from "next/headers"
import { redirect } from "next/navigation"
import AttendanceClient from "./attendance-client"

export default async function AttendancePage() {
  const supabase = await createServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect("/login")

  const cookieStore = await cookies()
  const impersonateId = cookieStore.get("gf_impersonate")?.value
  const effectiveUserId = impersonateId ?? user.id

  const today = new Date().toISOString().split("T")[0]

  // Week range: Monday → Sunday of current week
  const nowDate  = new Date()
  const dow      = nowDate.getDay() // 0=Sun
  const monday   = new Date(nowDate)
  monday.setDate(nowDate.getDate() - (dow === 0 ? 6 : dow - 1))
  const sunday = new Date(monday)
  sunday.setDate(monday.getDate() + 6)
  const weekStart = monday.toISOString().split("T")[0]
  const weekEnd   = sunday.toISOString().split("T")[0]

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

  const [{ data: todayLogRaw }, { data: weekLogsRaw }, { data: todayUpdateRaw }, { data: weekPermissions }] = await Promise.all([
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
  ])

  // Sum approved permission hours per date
  const permHoursByDate: Record<string, number> = {}
  for (const p of (weekPermissions ?? []) as { from_date: string; permission_hours: number | null }[]) {
    permHoursByDate[p.from_date] = (permHoursByDate[p.from_date] ?? 0) + (p.permission_hours ?? 1)
  }
  const todayPermissionHours = permHoursByDate[today] ?? 0

  return (
    <AttendanceClient
      todayLog={todayLogRaw as unknown as AttLog | null}
      weekLogs={(weekLogsRaw ?? []) as unknown as AttLog[]}
      todayUpdate={todayUpdateRaw as unknown as DailyUpdate | null}
      today={today}
      weekStart={weekStart}
      todayPermissionHours={todayPermissionHours}
      permHoursByDate={permHoursByDate}
    />
  )
}
