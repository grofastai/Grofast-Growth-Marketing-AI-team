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
      .select("assigned_to, status")
      .eq("company_id", companyId),
  ])

  if (updatesResult.error) {
    console.error("[activities] daily_updates query error:", updatesResult.error)
  }

  // Build task stats per user: { userId: { total, completed } }
  const taskStatsMap: Record<string, { total: number; completed: number }> = {}
  for (const t of allTasks ?? []) {
    if (!t.assigned_to) continue
    if (!taskStatsMap[t.assigned_to]) taskStatsMap[t.assigned_to] = { total: 0, completed: 0 }
    taskStatsMap[t.assigned_to].total++
    if (t.status === "completed") taskStatsMap[t.assigned_to].completed++
  }

  // Attach user info and task stats (avoids FK join failures)
  const membersMap = Object.fromEntries((members ?? []).map(m => [m.id, m]))
  const updates = (updatesResult.data ?? []).map(u => ({
    ...u,
    users: membersMap[u.user_id] ?? null,
    tasks: null,
    tasks_completed: taskStatsMap[u.user_id]?.completed ?? 0,
    tasks_total: taskStatsMap[u.user_id]?.total ?? 0,
  }))

  return <ActivitiesClient updates={updates} members={members ?? []} dateFilter={dateFilter} memberFilter={params.member ?? ""} />
}
