export const revalidate = 30

import { createServerClient } from "@/lib/supabase/server"
import { createClient } from "@supabase/supabase-js"
import { redirect, notFound } from "next/navigation"
import ProjectDetailClient from "./project-detail-client"

function adminClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  )
}

export default async function ProjectDetailPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id: projectId } = await params

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

  const [{ data: project }, { data: tasks }] = await Promise.all([
    admin
      .from("projects")
      .select("id, business_name, client_name, location, service_types, status, deadline, progress_pct, created_at")
      .eq("id", projectId)
      .eq("company_id", cid)
      .single(),
    admin
      .from("tasks")
      .select("id, title, status, priority, due_date, assigned_to, users:assigned_to(id, name, employee_id)")
      .eq("project_id", projectId)
      .eq("company_id", cid)
      .order("created_at", { ascending: true }),
  ])

  if (!project) notFound()

  const taskIds = (tasks ?? []).map((t) => t.id)

  const { data: activities } = taskIds.length > 0
    ? await admin
        .from("daily_updates")
        .select("id, user_id, date, working_hours, shoot_count, task_id, notes, attendance_status, users(id, name, employee_id)")
        .in("task_id", taskIds)
        .order("date", { ascending: false })
    : { data: [] as any[] }

  return (
    <ProjectDetailClient
      project={project as any}
      tasks={(tasks ?? []) as any}
      activities={(activities ?? []) as any}
    />
  )
}
