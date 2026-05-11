export const revalidate = 60

import { createServerClient } from "@/lib/supabase/server"
import { redirect } from "next/navigation"
import HistoryClient from "./history-client"

type WorkEntry = {
  id?: string
  task_type: "shoot" | "edit" | "other"
  title: string
  client_name: string
  duration_hours: number
  notes: string
  start_time?: string | null
  end_time?: string | null
  screenshot_url?: string | null
}

type UpdateRow = {
  id: string
  date: string
  attendance_status: string
  work_type: string | null
  working_hours: number | null
  learning_hours: number | null
  shoot_count: number | null
  work_entries: WorkEntry[] | null
  created_at: string
}

export default async function HistoryPage() {
  const supabase = await createServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect("/login")

  const { data: raw } = await supabase
    .from("daily_updates")
    .select("id, date, attendance_status, work_type, working_hours, learning_hours, shoot_count, work_entries, created_at")
    .eq("user_id", user.id)
    .order("date", { ascending: false })
    .limit(90)

  const updates = (raw ?? []) as unknown as UpdateRow[]

  return <HistoryClient updates={updates} />
}
