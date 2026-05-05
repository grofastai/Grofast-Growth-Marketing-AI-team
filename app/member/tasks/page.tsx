export const revalidate = 30

import { createServerClient } from "@/lib/supabase/server"
import { createClient } from "@supabase/supabase-js"
import { redirect } from "next/navigation"
import MemberTasksClient from "./tasks-client"

function adminSupabase() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  )
}

export default async function MemberTasksPage() {
  const supabase = await createServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect("/login")

  const today = new Date().toISOString().split("T")[0]

  type AttLog  = { clock_in: string | null; clock_out: string | null }
  type DayUpd  = { working_hours: number | null }

  const admin = adminSupabase()

  const [tasksResult, clockResult, updateResult] = await Promise.all([
    // Use admin client to bypass RLS; created_by + assigner join only when column exists
    admin
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

  const clockLog = clockResult.data as unknown as AttLog | null
  const dayUpd   = updateResult.data as unknown as DayUpd | null

  // Derive today's worked hours
  let todayHours = 0
  if (clockLog?.clock_in) {
    const end = clockLog.clock_out ? new Date(clockLog.clock_out).getTime() : Date.now()
    todayHours = Math.round(((end - new Date(clockLog.clock_in).getTime()) / 3600000) * 10) / 10
  } else if (dayUpd?.working_hours) {
    todayHours = dayUpd.working_hours
  }

  if (tasksResult.error) {
    console.error("[MemberTasksPage] tasks query failed:", tasksResult.error.message)
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const tasks = (tasksResult.data ?? []) as any[]

  return (
    <MemberTasksClient
      tasks={tasks}
      todayHours={todayHours}
    />
  )
}
