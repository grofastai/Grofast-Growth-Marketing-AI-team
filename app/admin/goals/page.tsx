export const revalidate = 30

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

  const [{ data: tasks }, { data: members }, { data: projects }] = await Promise.all([
    admin.from("tasks")
      .select("*, users(id, name, employee_id, team), projects(id, business_name)")
      .eq("company_id", cid)
      .order("created_at", { ascending: false }),
    admin.from("users")
      .select("id, name, employee_id, team, gender")
      .eq("company_id", cid)
      .eq("role", "MEMBER")
      .order("name"),
    admin.from("projects")
      .select("id, business_name, client_name")
      .eq("company_id", cid)
      .eq("status", "active")
      .order("business_name"),
  ])

  return <GoalsClient tasks={tasks ?? []} members={members ?? []} projects={projects ?? []} />
}
