export const revalidate = 0

import { createServerClient } from "@/lib/supabase/server"
import { createClient } from "@supabase/supabase-js"
import GoalsClient from "./goals-client"

function adminSupabase() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  )
}

export default async function GoalsPage() {
  const supabase = await createServerClient()
  const { data: { user } } = await supabase.auth.getUser()

  const admin = adminSupabase()
  const { data: profile } = await admin
    .from("users").select("company_id").eq("id", user!.id).single()
  const cid = profile?.company_id as string

  const [{ data: tasks }, { data: members }, { data: projects }, { data: clients }, { data: pastClients }] = await Promise.all([
    admin.from("tasks")
      .select("*, users!tasks_assigned_to_fkey(id, name, employee_id, team), creator:users!tasks_created_by_fkey(id, name, photo_url), projects(id, business_name)")
      .eq("company_id", cid)
      .order("created_at", { ascending: false })
      .limit(100),
    admin.from("users")
      .select("id, name, employee_id, team, gender, photo_url")
      .eq("company_id", cid)
      .eq("role", "MEMBER")
      .order("name"),
    admin.from("projects")
      .select("id, business_name, client_name, created_at")
      .eq("company_id", cid)
      .eq("status", "active")
      .order("business_name")
      .order("created_at", { ascending: true }),
    admin.from("clients")
      .select("id, name")
      .eq("company_id", cid)
      .eq("status", "active")
      .order("name"),
    admin.from("clients")
      .select("id, name")
      .eq("company_id", cid)
      .eq("status", "past")
      .order("name"),
  ])

  // Members can self-create a "quick project" for a one-off client/brand (marked
  // client_name = '__member_quick__') when there's no matching project yet. Each
  // member creating one for the same brand results in a duplicate row — collapse
  // to the earliest one per business_name so the dropdown doesn't show the same
  // brand 4-5 times. Real (non-quick) projects are never deduped.
  const seenQuickBrands = new Set<string>()
  const dedupedProjects = (projects ?? [])
    .filter(p => {
      if (p.client_name !== "__member_quick__") return true
      if (seenQuickBrands.has(p.business_name)) return false
      seenQuickBrands.add(p.business_name)
      return true
    })
    .map(({ id, business_name, client_name }) => ({ id, business_name, client_name }))

  return <GoalsClient tasks={tasks ?? []} members={members ?? []} projects={dedupedProjects} clients={(clients ?? []) as { id: string; name: string }[]} pastClients={(pastClients ?? []) as { id: string; name: string }[]} />
}
