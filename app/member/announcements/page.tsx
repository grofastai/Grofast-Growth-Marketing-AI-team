export const revalidate = 0

import { createServerClient } from "@/lib/supabase/server"
import { createClient } from "@supabase/supabase-js"
import { cookies } from "next/headers"
import { redirect } from "next/navigation"
import AnnouncementsClient from "./announcements-client"

type AnnouncementRow = {
  id: string
  title: string
  message: string
  pinned: boolean
  category: string
  created_at: string
  users: { name: string } | null
}

function adminClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  )
}

export default async function MemberAnnouncementsPage({
  searchParams,
}: {
  searchParams: Promise<{ search?: string }>
}) {
  const { search: initialSearch } = await searchParams
  const supabase = await createServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect("/login")
  const cookieStore = await cookies()
  const impersonateId = cookieStore.get("gf_impersonate")?.value
  const effectiveUserId = impersonateId ?? user.id

  const admin = adminClient()
  const { data: profile } = await admin
    .from("users")
    .select("company_id")
    .eq("id", effectiveUserId)
    .single()

  if (!profile) redirect("/login")

  const { data: raw } = await admin
    .from("announcements")
    .select("id, title, message, pinned, category, created_at, users(name)")
    .eq("company_id", profile.company_id)
    .order("pinned", { ascending: false })
    .order("created_at", { ascending: false })
    .limit(30)

  const announcements = (raw ?? []) as unknown as AnnouncementRow[]

  return <AnnouncementsClient announcements={announcements} initialSearch={initialSearch ?? ""} />
}
