export const revalidate = 30

import { createServerClient } from "@/lib/supabase/server"
import GoalsClient from "./goals-client"

export default async function GoalsPage() {
  const supabase = await createServerClient()

  const [{ data: tasks }, { data: members }, { data: projects }] = await Promise.all([
    supabase.from("tasks").select("*, users(id, name, employee_id), projects(business_name)").order("created_at", { ascending: false }),
    supabase.from("users").select("id, name, employee_id").eq("role", "MEMBER").order("name"),
    supabase.from("projects").select("id, business_name").eq("status", "active").order("business_name"),
  ])

  return <GoalsClient tasks={tasks ?? []} members={members ?? []} projects={projects ?? []} />
}
