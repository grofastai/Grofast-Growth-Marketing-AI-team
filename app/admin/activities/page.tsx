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
  searchParams: Promise<{ date?: string; from?: string; to?: string; member?: string }>
}) {
  const params = await searchParams
  const supabase = await createServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect("/login")

  const admin = adminSupabase()
  const today = new Date().toISOString().split("T")[0]

  const from = params.from ?? params.date ?? today
  const to   = params.to   ?? params.from ?? params.date ?? today

  const { data: profile } = await admin
    .from("users")
    .select("company_id")
    .eq("id", user.id)
    .single()

  const companyId = profile?.company_id ?? ""

  const [
    { data: members },
    updatesResult,
    { data: allTasks },
    { data: approvedLeaves },
    { data: clockIns },
    { data: collabConfirmsRaw },
    { data: pendingLeavesRaw },
    { data: pendingCollabsRaw },
  ] = await Promise.all([
    admin
      .from("users")
      .select("id, name, employee_id, role, team")
      .eq("company_id", companyId)
      .order("name"),
    (async () => {
      let q = admin
        .from("daily_updates")
        .select("*")
        .eq("company_id", companyId)
        .gte("date", from)
        .lte("date", to)
        .order("date", { ascending: false })
        .order("created_at", { ascending: false })
      if (params.member) q = q.eq("user_id", params.member)
      return q
    })(),
    admin
      .from("tasks")
      .select("id, assigned_to, title, status, priority")
      .eq("company_id", companyId)
      .order("created_at", { ascending: false })
      .limit(200),
    admin
      .from("leaves")
      .select("user_id, from_date, to_date")
      .eq("company_id", companyId)
      .eq("status", "approved")
      .lte("from_date", to)
      .gte("to_date", from),
    admin
      .from("attendance_logs")
      .select("user_id, date")
      .eq("company_id", companyId)
      .gte("date", from)
      .lte("date", to)
      .not("clock_in", "is", null),
    admin
      .from("collaboration_confirmations")
      .select("collaborator_id, date, confirmed_hours, status")
      .eq("company_id", companyId)
      .in("status", ["confirmed", "edited_confirmed"])
      .gte("date", from)
      .lte("date", to),
    // Pending leave requests (all — for global count in summary card)
    admin
      .from("leaves")
      .select("id, user_id, from_date, to_date, reason")
      .eq("company_id", companyId)
      .eq("status", "pending"),
    // Pending collab confirmations (all — for attention required section)
    admin
      .from("collaboration_confirmations")
      .select("collaborator_id, date, status")
      .eq("company_id", companyId)
      .eq("status", "pending"),
  ])

  // Group tasks by user
  const tasksByUser: Record<string, { id: string; title: string; status: string; priority: string | null }[]> = {}
  for (const t of allTasks ?? []) {
    if (!t.assigned_to) continue
    if (!tasksByUser[t.assigned_to]) tasksByUser[t.assigned_to] = []
    tasksByUser[t.assigned_to].push({ id: t.id, title: t.title, status: t.status, priority: t.priority })
  }

  const membersMap = Object.fromEntries((members ?? []).map(m => [m.id, m]))
  const updates = (updatesResult.data ?? []).map(u => ({
    ...u,
    users: membersMap[u.user_id] ?? null,
    tasks: null,
    tasks_list: tasksByUser[u.user_id] ?? [],
    tasks_completed: (tasksByUser[u.user_id] ?? []).filter(t => t.status === "completed").length,
    tasks_total: (tasksByUser[u.user_id] ?? []).length,
  }))

  // Build collab hours map: "userId:date" → total confirmed collab hours
  const collabHoursMap: Record<string, number> = {}
  for (const c of (collabConfirmsRaw ?? []) as { collaborator_id: string; date: string; confirmed_hours: number | null }[]) {
    const key = `${c.collaborator_id}:${c.date}`
    collabHoursMap[key] = (collabHoursMap[key] ?? 0) + (c.confirmed_hours ?? 0)
  }

  const onLeaveIds = new Set((approvedLeaves ?? []).map((l: { user_id: string }) => l.user_id))

  const leaveDaySet = new Set<string>()
  for (const leave of (approvedLeaves ?? []) as { user_id: string; from_date: string; to_date: string }[]) {
    const start = new Date(leave.from_date + "T12:00:00")
    const end   = new Date(leave.to_date   + "T12:00:00")
    const cur   = new Date(start)
    while (cur <= end) {
      leaveDaySet.add(`${leave.user_id}:${cur.toISOString().split("T")[0]}`)
      cur.setDate(cur.getDate() + 1)
    }
  }

  const clockInDaySet = new Set<string>()
  for (const log of (clockIns ?? []) as { user_id: string; date: string }[]) {
    clockInDaySet.add(`${log.user_id}:${log.date}`)
  }

  return (
    <ActivitiesClient
      updates={updates}
      members={members ?? []}
      from={from}
      to={to}
      memberFilter={params.member ?? ""}
      onLeaveIds={onLeaveIds}
      leaveDays={leaveDaySet}
      clockInDays={clockInDaySet}
      collabHoursMap={collabHoursMap}
      pendingLeaves={pendingLeavesRaw ?? []}
      pendingCollabs={pendingCollabsRaw ?? []}
    />
  )
}
