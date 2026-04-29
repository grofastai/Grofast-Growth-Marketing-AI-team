import { createServerClient } from "@/lib/supabase/server"
import ActivitiesClient from "./activities-client"

export default async function ActivitiesPage({
  searchParams,
}: {
  searchParams: Promise<{ date?: string; member?: string }>
}) {
  const params = await searchParams
  const supabase = await createServerClient()
  const today = new Date().toISOString().split("T")[0]
  const dateFilter = params.date ?? today

  let query = supabase
    .from("daily_updates")
    .select("*, users(id, name, employee_id, role), tasks(title)")
    .eq("date", dateFilter)
    .order("created_at", { ascending: false })

  if (params.member) {
    query = query.eq("user_id", params.member)
  }

  const [{ data: updates }, { data: members }] = await Promise.all([
    query,
    supabase.from("users").select("id, name, employee_id").eq("role", "MEMBER").order("name"),
  ])

  return <ActivitiesClient updates={updates ?? []} members={members ?? []} dateFilter={dateFilter} memberFilter={params.member ?? ""} />
}
