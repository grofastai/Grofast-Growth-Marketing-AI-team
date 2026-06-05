export const revalidate = 0

import { createServerClient } from "@/lib/supabase/server"
import { createClient } from "@supabase/supabase-js"
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
  learning_topic: string | null
  learning_notes: string | null
  shoot_count: number | null
  work_entries: WorkEntry[] | null
  created_at: string
}

function adminSupabase() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  )
}

export default async function HistoryPage() {
  const supabase = await createServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect("/login")

  const admin = adminSupabase()

  const [updatesResult, profileResult, projectsResult] = await Promise.all([
    supabase
      .from("daily_updates")
      .select("id, date, attendance_status, work_type, working_hours, learning_hours, learning_topic, learning_notes, shoot_count, editing_count, work_entries, created_at")
      .eq("user_id", user.id)
      .order("date", { ascending: false })
      .limit(90),
    admin
      .from("users")
      .select("name")
      .eq("id", user.id)
      .single(),
    supabase
      .from("projects")
      .select("business_name")
      .order("business_name", { ascending: true }),
  ])

  const updates = (updatesResult.data ?? []) as unknown as UpdateRow[]
  const name = (profileResult.data?.name ?? "").split(" ")[0] || "there"
  const clients = (projectsResult.data ?? []).map((p: { business_name: string }) => p.business_name).filter(Boolean)

  return <HistoryClient updates={updates} userName={name} clients={clients} />
}
