export const revalidate = 0

import { redirect } from "next/navigation"
import { createServerClient } from "@/lib/supabase/server"
import { createClient } from "@supabase/supabase-js"
import MemberContentCalendarClient from "./content-calendar-client"

function adminSupabase() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  )
}

export default async function MemberContentCalendarPage() {
  const supabase = await createServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect("/login")

  const admin = adminSupabase()
  const { data: profile } = await admin
    .from("users").select("company_id, name").eq("id", user.id).single()
  if (!profile) redirect("/login")

  const cid = profile.company_id
  const now = new Date()
  const monthStart = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-01`
  const monthEnd   = new Date(now.getFullYear(), now.getMonth() + 2, 0).toISOString().split("T")[0]

  const [
    { data: posts },
    { data: shoots },
    { data: tasks },
    { data: members },
    { data: projects },
  ] = await Promise.all([
    admin.from("content_posts")
      .select("*, assignee:users!assigned_to(name)")
      .eq("company_id", cid)
      .gte("scheduled_date", monthStart)
      .lte("scheduled_date", monthEnd)
      .order("scheduled_date"),
    admin.from("shoots")
      .select("id, title, start_time, client, status")
      .eq("company_id", cid)
      .gte("start_time", monthStart)
      .lte("start_time", monthEnd + "T23:59:59"),
    admin.from("tasks")
      .select("id, title, due_date, status")
      .eq("assigned_to", user.id)
      .not("due_date", "is", null)
      .gte("due_date", monthStart)
      .lte("due_date", monthEnd)
      .neq("status", "completed"),
    admin.from("users")
      .select("id, name")
      .eq("company_id", cid)
      .eq("status", "active")
      .order("name"),
    admin.from("projects")
      .select("business_name")
      .eq("company_id", cid)
      .order("business_name"),
  ])

  return (
    <MemberContentCalendarClient
      posts={posts ?? []}
      shoots={shoots ?? []}
      tasks={tasks ?? []}
      members={members ?? []}
      clientNames={(projects ?? []).map(p => p.business_name).filter(Boolean) as string[]}
      userId={user.id}
      initialYear={now.getFullYear()}
      initialMonth={now.getMonth()}
    />
  )
}
