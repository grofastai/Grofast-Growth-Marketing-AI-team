export const revalidate = 30

import { createServerClient } from "@/lib/supabase/server"
import { redirect } from "next/navigation"
import MemberTasksClient from "./tasks-client"

export default async function MemberTasksPage() {
  const supabase = await createServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect("/login")

  const today = new Date().toISOString().split("T")[0]

  type AttLog  = { clock_in: string | null; clock_out: string | null }
  type DayUpd  = { working_hours: number | null }

  const [
    { data: tasksRaw },
    { data: clockRaw },
    { data: updateRaw },
  ] = await Promise.all([
    supabase
      .from("tasks")
      .select("id, title, description, status, priority, due_date, projects(id, business_name)")
      .eq("assigned_to", user.id)
      .order("due_date", { ascending: true, nullsFirst: false }),
    supabase
      .from("attendance_logs")
      .select("clock_in, clock_out")
      .eq("user_id", user.id)
      .eq("date", today)
      .maybeSingle(),
    supabase
      .from("daily_updates")
      .select("working_hours")
      .eq("user_id", user.id)
      .eq("date", today)
      .maybeSingle(),
  ])

  const clockLog = clockRaw as unknown as AttLog | null
  const dayUpd   = updateRaw as unknown as DayUpd | null

  // Derive today's worked hours
  let todayHours = 0
  if (clockLog?.clock_in) {
    const end = clockLog.clock_out ? new Date(clockLog.clock_out).getTime() : Date.now()
    todayHours = Math.round(((end - new Date(clockLog.clock_in).getTime()) / 3600000) * 10) / 10
  } else if (dayUpd?.working_hours) {
    todayHours = dayUpd.working_hours
  }

  return (
    <MemberTasksClient
      tasks={tasksRaw ?? []}
      todayHours={todayHours}
    />
  )
}
