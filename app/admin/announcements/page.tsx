export const revalidate = 30

import { createServerClient } from "@/lib/supabase/server"
import AnnouncementsClient from "./announcements-client"

export default async function AnnouncementsPage() {
  const supabase = await createServerClient()

  const { data: announcements } = await supabase
    .from("announcements")
    .select("*, users(name)")
    .order("pinned", { ascending: false })
    .order("created_at", { ascending: false })

  return <AnnouncementsClient announcements={announcements ?? []} />
}
