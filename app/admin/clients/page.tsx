export const revalidate = 60

import { createServerClient } from "@/lib/supabase/server"
import { createClient } from "@supabase/supabase-js"
import { redirect } from "next/navigation"
import ProjectsClient from "@/app/admin/projects/projects-client"
import ClientsSheetView from "./clients-sheet-view"
import { fetchSheetClients } from "@/lib/google/sheets"

function adminClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  )
}

export default async function ClientsPage() {
  const supabase = await createServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect("/login")

  const admin = adminClient()
  const { data: profile } = await admin.from("users").select("company_id").eq("id", user.id).single()
  if (!profile) redirect("/login")

  const sheetId  = process.env.GOOGLE_CLIENTS_SHEET_ID
  const sheetUrl = process.env.GOOGLE_CLIENTS_SHEET_URL ?? null

  // If a Google Sheet ID is configured, read from there (read-only)
  if (sheetId) {
    let clients: Awaited<ReturnType<typeof fetchSheetClients>> = []
    try {
      clients = await fetchSheetClients(sheetId)
    } catch (err) {
      console.error("[ClientsPage] Failed to fetch Google Sheet:", err)
    }
    return <ClientsSheetView clients={clients} sheetUrl={sheetUrl} />
  }

  // Fallback: read from Supabase (editable)
  const cid = profile.company_id
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
