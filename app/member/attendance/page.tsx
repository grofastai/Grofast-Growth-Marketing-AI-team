import { createServerClient } from "@/lib/supabase/server"
import { redirect } from "next/navigation"
import AttendanceClient from "./attendance-client"

export default async function AttendancePage() {
  const supabase = await createServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect("/login")

  const today = new Date().toISOString().split("T")[0]

  type AttLog = {
    id: string
    date: string
    clock_in: string | null
    clock_out: string | null
    work_type: string | null
    status: string
  }

  const [{ data: todayLogRaw }, { data: historyRaw }] = await Promise.all([
    supabase
      .from("attendance_logs")
      .select("id, date, clock_in, clock_out, work_type, status")
      .eq("user_id", user.id)
      .eq("date", today)
      .maybeSingle(),
    supabase
      .from("attendance_logs")
      .select("id, date, clock_in, clock_out, work_type, status")
      .eq("user_id", user.id)
      .neq("date", today)
      .order("date", { ascending: false })
      .limit(14),
  ])

  const todayLog = todayLogRaw as unknown as AttLog | null
  const history = (historyRaw ?? []) as unknown as AttLog[]

  return (
    <AttendanceClient
      todayLog={todayLog}
      history={history}
      today={today}
    />
  )
}
