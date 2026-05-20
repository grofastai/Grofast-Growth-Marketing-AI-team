import { createServerClient } from "@/lib/supabase/server"
import { redirect } from "next/navigation"
import AttendanceClient from "./attendance-client"

export default async function AttendancePage() {
  const supabase = await createServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect("/login")

  const today = new Date().toISOString().split("T")[0]

  // Week range: Monday → Saturday of current week
  const nowDate  = new Date()
  const dow      = nowDate.getDay() // 0=Sun
  const monday   = new Date(nowDate)
  monday.setDate(nowDate.getDate() - (dow === 0 ? 6 : dow - 1))
  const saturday = new Date(monday)
  saturday.setDate(monday.getDate() + 5)
  const weekStart = monday.toISOString().split("T")[0]
  const weekEnd   = saturday.toISOString().split("T")[0]

  type AttLog = {
    id: string; date: string
    clock_in: string | null; clock_out: string | null
    break_in: string | null; break_out: string | null
    break_total_mins: number
    work_type: string | null; status: string
  }
  type DailyUpdate = {
    working_hours: number | null
    learning_hours: number | null
    shoot_count: number | null
  }

  const [{ data: todayLogRaw }, { data: weekLogsRaw }, { data: todayUpdateRaw }] = await Promise.all([
    supabase.from("attendance_logs")
      .select("id, date, clock_in, clock_out, break_in, break_out, break_total_mins, work_type, status")
      .eq("user_id", user.id).eq("date", today).maybeSingle(),
    supabase.from("attendance_logs")
      .select("id, date, clock_in, clock_out, break_in, break_out, break_total_mins, work_type, status")
      .eq("user_id", user.id).gte("date", weekStart).lte("date", weekEnd),
    supabase.from("daily_updates")
      .select("working_hours, learning_hours, shoot_count")
      .eq("user_id", user.id).eq("date", today).maybeSingle(),
  ])

  return (
    <AttendanceClient
      todayLog={todayLogRaw as unknown as AttLog | null}
      weekLogs={(weekLogsRaw ?? []) as unknown as AttLog[]}
      todayUpdate={todayUpdateRaw as unknown as DailyUpdate | null}
      today={today}
      weekStart={weekStart}
    />
  )
}
