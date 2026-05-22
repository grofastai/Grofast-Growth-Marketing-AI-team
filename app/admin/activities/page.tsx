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

  // Get all company member IDs first (reliable tenant filter for daily_updates)
  const { data: members } = await admin
    .from("users")
    .select("id, name, employee_id, role")
    .eq("company_id", companyId)
    .order("name")

  const memberIds = (members ?? []).map(m => m.id)

  let query = admin
    .from("daily_updates")
    .select("*, users(id, name, employee_id, role), tasks(title), work_entries, learning_topic, learning_notes, active_tab, editing_count")
    .in("user_id", memberIds.length > 0 ? memberIds : ["00000000-0000-0000-0000-000000000000"])
    .eq("date", dateFilter)
    .order("created_at", { ascending: false })

  if (params.member) {
    query = query.eq("user_id", params.member)
  }

  const { data: updates } = await query

  return <ActivitiesClient updates={updates ?? []} members={members ?? []} dateFilter={dateFilter} memberFilter={params.member ?? ""} />
}
