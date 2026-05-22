export const revalidate = 0

import { createServerClient } from "@/lib/supabase/server"
import { createClient } from "@supabase/supabase-js"
import { redirect } from "next/navigation"
import ActivitiesClient from "./activities-client"

function adminSupabase() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  )
}

export default async function ActivitiesPage({
  searchParams,
}: {
  searchParams: Promise<{ date?: string; member?: string }>
}) {
  const params = await searchParams
  const supabase = await createServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect("/login")

  const admin = adminSupabase()
  const today = new Date().toISOString().split("T")[0]
  const dateFilter = params.date ?? today

  // Get company_id for this admin
  const { data: profile } = await admin
    .from("users")
    .select("company_id")
    .eq("id", user.id)
    .single()

  const companyId = profile?.company_id ?? ""

  const [{ data: members }, updatesResult, { data: allTasks }] = await Promise.all([
    admin
      .from("users")
      .select("id, name, employee_id, role")
      .eq("company_id", companyId)
      .order("name"),
    (async () => {
      let q = admin
        .from("daily_updates")
        .select("*")
        .eq("company_id", companyId)
        .eq("date", dateFilter)
        .order("created_at", { ascending: false })
      if (params.member) q = q.eq("user_id", params.member)
      return q
    })(),
    admin
      .from("tasks")
      .select("id, assigned_to, title, status, priority")
      .eq("company_id", companyId),
  ])

  if (updatesResult.error) {
    console.error("[activities] daily_updates query error:", updatesResult.error)
  }

  // Group tasks by user
  const tasksByUser: Record<string, { id: string; title: string; status: string; priority: string | null }[]> = {}
  for (const t of allTasks ?? []) {
    if (!t.assigned_to) continue
    if (!tasksByUser[t.assigned_to]) tasksByUser[t.assigned_to] = []
    tasksByUser[t.assigned_to].push({ id: t.id, title: t.title, status: t.status, priority: t.priority })
  }

  // Attach user info and tasks list
  const membersMap = Object.fromEntries((members ?? []).map(m => [m.id, m]))
  const updates = (updatesResult.data ?? []).map(u => ({
    ...u,
    users: membersMap[u.user_id] ?? null,
    tasks: null,
    tasks_list: tasksByUser[u.user_id] ?? [],
    tasks_completed: (tasksByUser[u.user_id] ?? []).filter(t => t.status === "completed").length,
    tasks_total: (tasksByUser[u.user_id] ?? []).length,
  }))

  return <ActivitiesClient updates={updates} members={members ?? []} dateFilter={dateFilter} memberFilter={params.member ?? ""} />
}
