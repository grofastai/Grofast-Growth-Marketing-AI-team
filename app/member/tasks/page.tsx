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

  const { data: currentUserProfile } = await admin
    .from('users')
    .select('company_id')
    .eq('id', user.id)
    .single()
  const companyId = currentUserProfile?.company_id

  const [tasksResult, clockResult, updateResult, teamMembersResult, projectsResult] = await Promise.all([
    // Fetch tasks assigned to me OR created by me (for "To Others" tab)
    admin
      .from("tasks")
      .select("id, title, description, status, priority, due_date, created_by, assigned_to, projects(id, business_name), assignedBy:users!tasks_created_by_fkey(id, name), assignedToUser:users!tasks_assigned_to_fkey(id, name)")
      .or(`assigned_to.eq.${user.id},created_by.eq.${user.id}`)
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
    companyId
      ? admin
          .from("users")
          .select("id, name, employee_id")
          .eq("company_id", companyId)
          .eq("status", "active")
          .order("name")
      : Promise.resolve({ data: [] as { id: string; name: string; employee_id: string }[] }),
    companyId
      ? admin
          .from("projects")
          .select("id, business_name, client_name")
          .eq("company_id", companyId)
          .eq("status", "active")
          .order("business_name")
      : Promise.resolve({ data: [] as { id: string; business_name: string; client_name: string | null }[] }),
  ])

  const clockLog     = clockResult.data as unknown as AttLog | null
  const dayUpd       = updateResult.data as unknown as DayUpd | null
  const teamMembers  = (teamMembersResult.data ?? []) as { id: string; name: string; employee_id: string }[]
  const projects     = (projectsResult.data ?? []) as { id: string; business_name: string; client_name: string | null }[]

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

  // Auto-delete completed tasks older than 7 days for this company
  if (companyId) {
    const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString()
    await admin
      .from("tasks")
      .delete()
      .eq("company_id", companyId)
      .eq("status", "completed")
      .lt("completed_at", sevenDaysAgo)
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const tasks = (tasksResult.data ?? []) as any[]

  return (
    <MemberTasksClient
      tasks={tasks}
      todayHours={todayHours}
      teamMembers={teamMembers}
      currentUserId={user.id}
      projects={projects}
    />
  )
}
