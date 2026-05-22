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

  const [{ data: members }, updatesResult] = await Promise.all([
    admin
      .from("users")
      .select("id, name, employee_id, role")
      .eq("company_id", companyId)
      .order("name"),
    (async () => {
      let q = admin
        .from("daily_updates")
        .select("*")
        .eq("company_id", companyId)
        .eq("date", dateFilter)
        .order("created_at", { ascending: false })
      if (params.member) q = q.eq("user_id", params.member)
      return q
    })(),
  ])

  if (updatesResult.error) {
    console.error("[activities] daily_updates query error:", updatesResult.error)
  }

  // Attach user info from members list (avoids FK join failures)
  const membersMap = Object.fromEntries((members ?? []).map(m => [m.id, m]))
  const updates = (updatesResult.data ?? []).map(u => ({
    ...u,
    users: membersMap[u.user_id] ?? null,
    tasks: null,
  }))

  return <ActivitiesClient updates={updates} members={members ?? []} dateFilter={dateFilter} memberFilter={params.member ?? ""} />
}
