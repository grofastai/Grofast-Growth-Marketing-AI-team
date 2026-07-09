export const revalidate = 30

import { createServerClient } from "@/lib/supabase/server"
import { createClient } from "@supabase/supabase-js"
import { redirect } from "next/navigation"
import { getContentTrackerData } from "@/lib/data/content-tracker"
import ContentTrackerClient from "@/components/content-tracker/content-tracker-client"

function adminSupabase() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  )
}

export default async function AdminContentTrackerPage() {
  const supabase = await createServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect("/login")

  const admin = adminSupabase()
  const { data: profile } = await admin.from("users").select("company_id").eq("id", user.id).single()
  const companyId = profile?.company_id
  if (!companyId) redirect("/login")

  const [{ items, ads }, clientsResult, pastClientsResult] = await Promise.all([
    getContentTrackerData(companyId),
    admin.from("clients").select("id, name").eq("company_id", companyId).eq("status", "active").order("name"),
    admin.from("clients").select("id, name").eq("company_id", companyId).eq("status", "past").order("name"),
  ])

  return (
    <ContentTrackerClient
      initialItems={items}
      initialAds={ads}
      currentUserId={user.id}
      clients={(clientsResult.data ?? []) as { id: string; name: string }[]}
      pastClients={(pastClientsResult.data ?? []) as { id: string; name: string }[]}
    />
  )
}
