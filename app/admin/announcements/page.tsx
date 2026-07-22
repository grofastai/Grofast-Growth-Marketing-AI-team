export const dynamic = "force-dynamic"

import { createServerClient } from "@/lib/supabase/server"
import { createClient } from "@supabase/supabase-js"
import { redirect } from "next/navigation"
import AnnouncementsClient from "./announcements-client"

function adminClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  )
}

export default async function AnnouncementsPage({
  searchParams,
}: {
  searchParams: Promise<{ search?: string }>
}) {
  const { search: initialSearch } = await searchParams
  const supabase = await createServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect("/login")

  const admin = adminClient()
  const { data: profile } = await admin
    .from("users")
    .select("company_id, role")
    .eq("id", user.id)
    .single()

  if (!profile) redirect("/login")
  if (profile.role !== "ADMIN") redirect("/member/dashboard")

  const cid = profile.company_id

  const [
    { data: announcements },
    { count: memberCount },
  ] = await Promise.all([
    admin
      .from("announcements")
      .select("*, users(name)")
      .eq("company_id", cid)
      .order("pinned", { ascending: false })
      .order("created_at", { ascending: false }),
    admin
      .from("users")
      .select("*", { count: "exact", head: true })
      .eq("company_id", cid)
      .eq("role", "MEMBER"),
  ])

  return (
    <AnnouncementsClient
      announcements={announcements ?? []}
      memberCount={memberCount ?? 0}
      initialSearch={initialSearch ?? ""}
    />
  )
}
