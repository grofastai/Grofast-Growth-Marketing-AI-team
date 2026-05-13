export const dynamic = "force-dynamic"

import { createServerClient } from "@/lib/supabase/server"
import { createClient } from "@supabase/supabase-js"
import { redirect } from "next/navigation"
import ReportsClient from "./reports-client"

function adminClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  )
}

function resolveUser(u: unknown) {
  if (!u) return null
  return Array.isArray(u) ? (u[0] ?? null) : (u as { id: string; name: string; employee_id: string })
}

export default async function ReportsPage({
  searchParams,
}: {
  searchParams: Promise<{ date?: string }>
}) {
  const { date } = await searchParams
  const today = new Date().toISOString().split("T")[0]
  const dateFilter = date ?? today

  const supabase = await createServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect("/login")

  const admin = adminClient()
  const { data: profile } = await admin
    .from("users")
    .select("company_id, role")
    .eq("id", user.id)
    .single()
  if (!profile) redirect("/login")
  if (profile.role !== "ADMIN") redirect("/member/dashboard")

  const cid = profile.company_id

  const [
    { data: updatesRaw },
    { data: membersRaw },
    { data: tasksRaw },
    { data: projectsRaw },
    { data: taskActivityRaw },
  ] = await Promise.all([
    admin
      .from("daily_updates")
      .select("id, user_id, working_hours, shoot_count, learning_hours, attendance_status, work_type, task_id, users(id, name, employee_id)")
      .eq("date", dateFilter)
      .eq("company_id", cid),
    admin
      .from("users")
      .select("id, name, employee_id")
      .eq("company_id", cid)
      .eq("role", "MEMBER")
      .order("name"),
    admin
      .from("tasks")
      .select("id, title, status, due_date, priority, assigned_to, users(id, name, employee_id)")
      .eq("company_id", cid)
      .neq("status", "completed"),
    admin
      .from("projects")
      .select("id, business_name, status, deadline")
      .eq("company_id", cid)
      .eq("status", "active"),
    admin
      .from("daily_updates")
      .select("task_id")
      .eq("company_id", cid)
      .not("task_id", "is", null),
  ])

  const updates   = updatesRaw   ?? []
  const members   = membersRaw   ?? []
  const tasks     = tasksRaw     ?? []
  const projects  = projectsRaw  ?? []
  const taskActivitySet = new Set((taskActivityRaw ?? []).map((r: any) => r.task_id))


  // ── Summary numbers ─────────────────────────────────────────────────────────
  const presentUpdates = updates.filter((u: any) => u.attendance_status === "present")
  const absentUpdates  = updates.filter((u: any) => u.attendance_status === "absent")

  const totalHours    = updates.reduce((s: number, u: any) => s + (u.working_hours  ?? 0), 0)
  const totalLearning = updates.reduce((s: number, u: any) => s + (u.learning_hours ?? 0), 0)

  // ── Not updated members ──────────────────────────────────────────────────────
  const submittedIds = new Set(updates.map((u: any) => u.user_id))
  const notUpdatedMembers = members
    .filter((m: any) => !submittedIds.has(m.id))
    .map((m: any) => ({ name: m.name, employee_id: m.employee_id }))

  // ── Performers ───────────────────────────────────────────────────────────────
  const allPerformers = presentUpdates
    .map((u: any) => {
      const usr = resolveUser(u.users)
      return {
        name:        usr?.name        ?? "Unknown",
        employee_id: usr?.employee_id ?? "",
        hours:       u.working_hours  ?? 0,
        shoots:      u.shoot_count    ?? 0,
        learning:    u.learning_hours ?? 0,
      }
    })
    .sort((a: any, b: any) => b.hours - a.hours)

  const lowHoursMembers = allPerformers.filter((p: any) => p.hours < 6)

  // ── Task problems ────────────────────────────────────────────────────────────
  const overdueTasks = tasks
    .filter((t: any) => t.due_date && t.due_date < today)
    .map((t: any) => {
      const usr = resolveUser(t.users)
      return {
        id: t.id,
        title: t.title,
        due_date: t.due_date as string,
        priority: (t.priority ?? "medium") as string,
        assigned_name: usr?.name ?? null,
        assigned_employee_id: usr?.employee_id ?? null,
      }
    })

  const tasksNoActivity = tasks
    .filter((t: any) => !taskActivitySet.has(t.id))
    .slice(0, 8)
    .map((t: any) => ({ id: t.id, title: t.title }))

  // ── Project problems ─────────────────────────────────────────────────────────
  const overdueProjects = projects
    .filter((p: any) => p.deadline && p.deadline < today)
    .map((p: any) => ({ id: p.id, business_name: p.business_name, deadline: p.deadline as string }))

  return (
    <ReportsClient
      date={dateFilter}
      today={today}
      totalHours={totalHours}
      totalLearning={totalLearning}
      presentCount={presentUpdates.length}
      absentCount={absentUpdates.length}
      notUpdatedMembers={notUpdatedMembers}
      topPerformers={allPerformers.slice(0, 5)}
      lowHoursMembers={lowHoursMembers}
      totalActiveTasks={tasks.length}
      overdueTasks={overdueTasks}
      tasksNoActivity={tasksNoActivity}
      activeProjects={projects.length}
      overdueProjects={overdueProjects}
    />
  )
}
