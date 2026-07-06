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
      .select("id, name, employee_id, team, gender")
      .eq("company_id", cid)
      .eq("role", "MEMBER")
      .order("name"),
    admin.from("projects")
      .select("id, business_name, client_name")
      .eq("company_id", cid)
      .eq("status", "active")
      .neq("client_name", "__member_quick__") // internal marker for members' self-created quick projects — not a real admin-assignable project
      .order("business_name"),
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

  return <GoalsClient tasks={tasks ?? []} members={members ?? []} projects={projects ?? []} clients={(clients ?? []) as { id: string; name: string }[]} pastClients={(pastClients ?? []) as { id: string; name: string }[]} />
}
