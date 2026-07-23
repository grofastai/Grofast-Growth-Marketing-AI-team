export const revalidate = 0

import { redirect } from "next/navigation"
import { createServerClient } from "@/lib/supabase/server"
import { createClient } from "@supabase/supabase-js"
import type { Freelancer, WorkEntry } from "@/app/member/freelancers/freelancers-member-client"
import type { FlMediaMember, FlMediaEntry } from "./fl-media-client"
import { listTeams } from "@/lib/actions/teams"

function adminSupabase() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  )
}

export default async function AdminFreelancersPage() {
  const supabase = await createServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect("/login")

  const admin = adminSupabase()

  const { data: profile } = await admin
    .from("users")
    .select("company_id")
    .eq("id", user.id)
    .single()
  if (!profile?.company_id) redirect("/login")
  const cid = profile.company_id
  const teams = await listTeams()

  // Fetch all data in parallel
  const [freelancersResult, workEntriesResult, clientsResult, pastClientsResult, flMembersResult] = await Promise.all([
    admin.from("freelancers").select("id, name, team, phone, rating, status, created_at")
      .eq("company_id", cid).not("team", "is", null).order("name"),
    admin.from("freelancer_work_entries_v2").select("*")
      .eq("company_id", cid).order("date_finished", { ascending: false }),
    admin.from("clients").select("name").eq("company_id", cid).eq("status", "active").order("name"),
    admin.from("clients").select("name").eq("company_id", cid).eq("status", "past").order("name"),
    admin.from("users").select("id, name, employee_id")
      .eq("company_id", cid)
      .eq("team", "Freelance Media Production")
      .eq("status", "active")
      .order("name"),
  ])

  const freelancers = (freelancersResult.data ?? []) as Freelancer[]
  const workEntries = (workEntriesResult.data ?? []) as WorkEntry[]
  const clientNames = (clientsResult.data ?? []).map((c: { name: string }) => c.name).filter(Boolean)
  const pastClientNames = (pastClientsResult.data ?? []).map((c: { name: string }) => c.name).filter(Boolean)
  const flMembers = (flMembersResult.data ?? []) as FlMediaMember[]

  // Fetch daily_updates for all FL Media Production members
  let flEntries: FlMediaEntry[] = []
  if (flMembers.length > 0) {
    const flMemberIds = flMembers.map(m => m.id)
    const { data: dailyUpdates } = await admin
      .from("daily_updates")
      .select("id, user_id, date, work_entries")
      .eq("company_id", cid)
      .in("user_id", flMemberIds)
      .order("date", { ascending: false })

    if (dailyUpdates) {
      for (const du of dailyUpdates) {
        const entries = Array.isArray(du.work_entries) ? du.work_entries as Record<string, unknown>[] : []
        const member = flMembers.find(m => m.id === du.user_id)
        if (!member) continue

        for (const e of entries) {
          const tt = e.task_type as string
          if (tt !== "edit" && tt !== "shoot") continue

          flEntries.push({
            daily_update_id: du.id as string,
            entry_id: (e.id as string) ?? "",
            user_id: du.user_id as string,
            user_name: member.name,
            date: du.date as string,
            task_type: tt as "edit" | "shoot",
            client_name: (e.client_name as string) ?? "",
            title: (e.title as string) ?? "",
            video_type: e.video_type as string | undefined,
            video_duration: e.video_duration as string | undefined,
            duration_hours: e.duration_hours as number | undefined,
            hooks_completed: e.hooks_completed as number | undefined,
            start_time: e.start_time as string | undefined,
            end_time: e.end_time as string | undefined,
            price: (e.price as number | null | undefined) ?? null,
          })
        }
      }
    }
  }

  return (
    <AdminFreelancersTabs
      flMembers={flMembers}
      flEntries={flEntries}
      freelancers={freelancers}
      workEntries={workEntries}
      clientNames={clientNames}
      pastClientNames={pastClientNames}
      teams={teams}
    />
  )
}

import AdminFreelancersTabs from "./admin-freelancers-tabs"
