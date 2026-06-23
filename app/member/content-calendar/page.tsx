export const revalidate = 0

import { cookies } from "next/headers"
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

export default async function MemberContentCalendarPage({ searchParams }: { searchParams: Promise<{ year?: string; month?: string }> }) {
  const supabase = await createServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect("/login")
  const cookieStore = await cookies()
  const impersonateId = cookieStore.get("gf_impersonate")?.value
  const effectiveUserId = impersonateId ?? user.id

  const admin = adminSupabase()
  const { data: profile } = await admin
    .from("users").select("company_id, name, role").eq("id", effectiveUserId).single()
  if (!profile) redirect("/login")

  const cid = profile.company_id
  const now = new Date()
  const sp = await searchParams
  const year  = sp.year  ? parseInt(sp.year)  : now.getFullYear()
  const month = sp.month ? parseInt(sp.month) : now.getMonth() // 0-based
  const monthStart = `${year}-${String(month + 1).padStart(2, "0")}-01`
  const monthEnd   = new Date(year, month + 2, 0).toISOString().split("T")[0]

  const [
    { data: posts },
    { data: shoots },
    { data: tasks },
    { data: members },
    { data: projects },
    { data: activeClients },
    { data: pastClients },
  ] = await Promise.all([
    admin.from("content_posts")
      .select("*, assignee:users!assigned_to(name), creator:users!created_by(name)")
      .eq("company_id", cid)
      .gte("scheduled_date", monthStart)
      .lte("scheduled_date", monthEnd)
      .order("scheduled_date"),
    admin.from("shoots")
      .select("id, title, start_time, client, status, creator:users!created_by(name)")
      .eq("company_id", cid)
      .gte("start_time", monthStart)
      .lte("start_time", monthEnd + "T23:59:59"),
    admin.from("tasks")
      .select("id, title, due_date, status")
      .eq("assigned_to", effectiveUserId)
      .not("due_date", "is", null)
      .gte("due_date", monthStart)
      .lte("due_date", monthEnd)
      .neq("status", "completed"),
    admin.from("users")
      .select("id, name")
      .eq("company_id", cid)
      .eq("status", "active")
      .eq("role", "MEMBER")
      .order("name"),
    admin.from("projects")
      .select("business_name")
      .eq("company_id", cid)
      .eq("status", "active")
      .order("business_name"),
    admin.from("clients")
      .select("name")
      .eq("company_id", cid)
      .eq("status", "active")
      .order("name"),
    admin.from("clients")
      .select("name")
      .eq("company_id", cid)
      .eq("status", "past")
      .order("name"),
  ])

  const projectNames = (projects ?? []).map(p => p.business_name).filter(Boolean) as string[]
  const activeClientNames = (activeClients ?? []).map(c => c.name).filter(Boolean) as string[]
  const allActiveNames = [...new Set([...projectNames, ...activeClientNames])]

  return (
    <MemberContentCalendarClient
      posts={posts ?? []}
      shoots={(shoots ?? []).map(s => ({ ...s, creator: Array.isArray(s.creator) ? (s.creator[0] ?? null) : s.creator }))}
      tasks={tasks ?? []}
      members={members ?? []}
      clientNames={allActiveNames}
      pastClientNames={(pastClients ?? []).map(c => c.name).filter(Boolean) as string[]}
      userId={effectiveUserId}
      role={profile.role ?? "MEMBER"}
      initialYear={year}
      initialMonth={month}
    />
  )
}
