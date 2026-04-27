import { createServerClient } from "@/lib/supabase/server"
import { redirect } from "next/navigation"
import MemberTasksClient from "./tasks-client"

export default async function MemberTasksPage() {
  const supabase = await createServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect("/login")

  const { data: tasks } = await supabase
    .from("tasks")
    .select("*, projects(business_name)")
    .eq("assigned_to", user.id)
    .order("created_at", { ascending: false })

  return <MemberTasksClient tasks={tasks ?? []} />
}
