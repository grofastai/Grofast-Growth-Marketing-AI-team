export const revalidate = 60

import { createServerClient } from "@/lib/supabase/server"
import AnnouncementsClient from "./announcements-client"

type AnnouncementRow = {
  id: string
  title: string
  message: string
  pinned: boolean
  created_at: string
  users: { name: string } | null
}

export default async function MemberAnnouncementsPage() {
  const supabase = await createServerClient()
  const { data: raw } = await supabase
    .from("announcements")
    .select("id, title, message, pinned, created_at, users(name)")
    .order("pinned", { ascending: false })
    .order("created_at", { ascending: false })

  const announcements = (raw ?? []) as unknown as AnnouncementRow[]

  return <AnnouncementsClient announcements={announcements} />
}
