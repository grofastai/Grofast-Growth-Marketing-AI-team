export const revalidate = 60

import { createServerClient } from "@/lib/supabase/server"
import { createClient } from "@supabase/supabase-js"
import { redirect } from "next/navigation"
import ProjectsClient from "@/app/admin/projects/projects-client"
import ClientsSheetView from "./clients-sheet-view"
import { fetchSheetClients, stripFinancialFields } from "@/lib/google/sheets"

function adminClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  )
}

export interface WorkSummary {
  workTypes: Record<string, number>
  shoots: number
  hours: number
  days: number
}

export default async function ClientsPage() {
  const supabase = await createServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect("/login")

  const admin = adminClient()
  const { data: profile } = await admin.from("users").select("company_id").eq("id", user.id).single()
  if (!profile) redirect("/login")

  const cid = profile.company_id
  const sheetId  = process.env.GOOGLE_CLIENTS_SHEET_ID
  const sheetGid = process.env.GOOGLE_CLIENTS_SHEET_GID
  const pastGid  = process.env.GOOGLE_PAST_CLIENTS_SHEET_GID

  // Build client→workSummary map from Supabase for both paths
  const buildWorkMap = async (): Promise<Record<string, WorkSummary>> => {
    const [{ data: projects }, { data: tasks }, { data: updates }] = await Promise.all([
      admin.from("projects").select("id, business_name, client_name").eq("company_id", cid),
      admin.from("tasks").select("id, project_id").eq("company_id", cid).not("project_id", "is", null),
      admin.from("daily_updates")
        .select("task_id, work_type, shoot_count, working_hours, date")
        .eq("company_id", cid),
    ])

    // task_id → project_id
    const taskToProject: Record<string, string> = {}
    for (const t of tasks ?? []) {
      if (t.project_id) taskToProject[t.id] = t.project_id
    }

    // project_id → WorkSummary
    const projectWork: Record<string, { workTypes: Record<string, number>; shoots: number; hours: number; dates: Set<string> }> = {}
    for (const u of updates ?? []) {
      const pid = u.task_id ? taskToProject[u.task_id] : null
      if (!pid) continue
      if (!projectWork[pid]) projectWork[pid] = { workTypes: {}, shoots: 0, hours: 0, dates: new Set() }
      const wt = (u.work_type ?? "").toLowerCase().trim()
      if (wt) projectWork[pid].workTypes[wt] = (projectWork[pid].workTypes[wt] ?? 0) + 1
      projectWork[pid].shoots += u.shoot_count ?? 0
      projectWork[pid].hours  += u.working_hours ?? 0
      if (u.date) projectWork[pid].dates.add(u.date)
    }

    // client name → WorkSummary (match by business_name or client_name)
    const map: Record<string, WorkSummary> = {}
    for (const p of projects ?? []) {
      const raw = projectWork[p.id]
      if (!raw) continue
      const ws: WorkSummary = { workTypes: raw.workTypes, shoots: raw.shoots, hours: raw.hours, days: raw.dates.size }
      if (p.business_name) map[p.business_name.toLowerCase()] = ws
      if (p.client_name)   map[p.client_name.toLowerCase()]   = ws
    }
    return map
  }

  // ── Google Sheets path ──────────────────────────────────────────────────────
  if (sheetId) {
    const [rawActive, rawPast, clientWorkMap] = await Promise.all([
      fetchSheetClients(sheetId, sheetGid).catch(() => []),
      pastGid ? fetchSheetClients(sheetId, pastGid).catch(() => []) : Promise.resolve([]),
      buildWorkMap().catch(() => ({} as Record<string, WorkSummary>)),
    ])
    const activeClients = stripFinancialFields(rawActive)
    const pastClients   = stripFinancialFields(rawPast)
    return <ClientsSheetView activeClients={activeClients} pastClients={pastClients} clientWorkMap={clientWorkMap} />
  }

  // ── Supabase fallback path ─────────────────────────────────────────────────
  const [{ data: projects }, { data: tasks }] = await Promise.all([
    admin.from("projects")
      .select("id, business_name, client_name, location, service_types, status, package_name, start_month, end_month, progress_pct, created_at")
      .eq("company_id", cid)
      .order("created_at", { ascending: false }),
    admin.from("tasks")
      .select("id, project_id, status")
      .eq("company_id", cid)
      .not("project_id", "is", null),
  ])

  const taskStats: Record<string, { total: number; completed: number; active: number }> = {}
  for (const t of tasks ?? []) {
    if (!t.project_id) continue
    if (!taskStats[t.project_id]) taskStats[t.project_id] = { total: 0, completed: 0, active: 0 }
    taskStats[t.project_id].total++
    if (t.status === "completed") taskStats[t.project_id].completed++
    else taskStats[t.project_id].active++
  }

  return <ProjectsClient projects={projects ?? []} taskStats={taskStats} />
}
