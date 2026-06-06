export const revalidate = 0

import { createServerClient } from "@/lib/supabase/server"
import { createClient } from "@supabase/supabase-js"
import { redirect } from "next/navigation"
import { Suspense } from "react"
import DailyUpdateForm from "./daily-update-form"
import ActivityUpdateForm from "./activity-update-form"
import { Loader2 } from "lucide-react"
import { fetchSheetClients, stripFinancialFields } from "@/lib/google/sheets"

function adminSupabase() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  )
}

export default async function UpdatePage() {
  const supabase = await createServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect("/login")

  type Project = { id: string; business_name: string }

  const admin = adminSupabase()
  const today = new Date().toISOString().split("T")[0]

  const { data: profile } = await admin
    .from("users")
    .select("company_id, team, name, hourly_rate, monthly_salary")
    .eq("id", user.id)
    .single()

  const companyId = profile?.company_id ?? ""

  const [
    { data: projectsRaw },
    { data: supabaseClientsRaw },
    { data: existingUpdate },
    { data: pastUpdates },
    { data: teamMembersRaw },
    { data: activitiesRaw },
    { data: existingWorkLogsRaw },
    { data: existingWorkPostsRaw },
  ] = await Promise.all([
    admin
      .from("projects")
      .select("id, business_name")
      .eq("company_id", companyId)
      .eq("status", "active")
      .order("business_name"),
    admin
      .from("clients")
      .select("name")
      .eq("company_id", companyId)
      .eq("status", "active")
      .order("name"),
    admin
      .from("daily_updates")
      .select("id, date, working_hours, shoot_count, editing_count, learning_hours, active_tab, work_entries, learning_topic, learning_notes")
      .eq("user_id", user.id)
      .eq("date", today)
      .maybeSingle(),
    admin
      .from("daily_updates")
      .select("id, date, working_hours, learning_hours, shoot_count, editing_count, work_entries, active_tab, learning_topic")
      .eq("user_id", user.id)
      .neq("date", today)
      .order("date", { ascending: false })
      .limit(30),
    admin
      .from("users")
      .select("id, name, employee_id, role")
      .eq("company_id", companyId)
      .eq("status", "active")
      .neq("id", user.id)
      .order("name"),
    admin
      .from("activities")
      .select("id, name, team_category, unit_type, emoji, sort_order")
      .eq("company_id", companyId)
      .order("sort_order"),
    admin
      .from("work_logs")
      .select("activity_id, client_name, hours, unit_count, item_titles, notes")
      .eq("user_id", user.id)
      .eq("date", today)
      .eq("company_id", companyId),
    admin
      .from("content_posts")
      .select("title, client_name, platform, post_type, post_link, notes")
      .eq("user_id", user.id)
      .eq("date", today)
      .eq("company_id", companyId),
  ])

  type TeamMember = { id: string; name: string; employee_id: string; role: string }
  const projects = (projectsRaw ?? []) as unknown as Project[]
  const supabaseClientNames = (supabaseClientsRaw ?? []).map((c: { name: string }) => c.name)
  const teamMembers = (teamMembersRaw ?? []) as TeamMember[]

  let sheetClientNames: string[] = []
  if (supabaseClientNames.length === 0) {
    const sheetId  = process.env.GOOGLE_CLIENTS_SHEET_ID
    const sheetGid = process.env.GOOGLE_CLIENTS_SHEET_GID
    const sheetClients = sheetId
      ? await fetchSheetClients(sheetId, sheetGid).catch(() => [])
      : []
    sheetClientNames = stripFinancialFields(sheetClients)
      .map(c => (c.company_name || c.customer_name).trim())
      .filter(Boolean)
  }

  const clientNames = supabaseClientNames.length > 0 ? supabaseClientNames : sheetClientNames
  const userName = (profile as { name?: string } | null)?.name ?? ""

  // Media teams use the shoot/edit daily update form; all others use the activity work log form
  const isMediaTeam = !profile?.team ||
    profile.team === "Media Team" ||
    profile.team === "Media & Technology Team"

  const hourlyRate = profile?.monthly_salary && (profile.monthly_salary as number) > 0
    ? (profile.monthly_salary as number) / 25 / 9
    : ((profile?.hourly_rate as number) ?? 0)

  const fallback = (
    <div className="flex items-center justify-center py-16">
      <Loader2 size={20} className="animate-spin" style={{ color: "#de1a1a" }} />
    </div>
  )

  if (isMediaTeam) {
    return (
      <Suspense fallback={fallback}>
        <DailyUpdateForm
          projects={projects}
          sheetClientNames={clientNames}
          team={profile?.team ?? null}
          userName={userName}
          existingUpdate={existingUpdate ?? null}
          pastUpdates={pastUpdates ?? []}
          teamMembers={teamMembers}
        />
      </Suspense>
    )
  }

  return (
    <Suspense fallback={fallback}>
      <ActivityUpdateForm
        activities={(activitiesRaw ?? []) as Parameters<typeof ActivityUpdateForm>[0]["activities"]}
        clientNames={clientNames}
        today={today}
        userName={userName}
        hourlyRate={hourlyRate}
        existingLogs={(existingWorkLogsRaw ?? []) as Parameters<typeof ActivityUpdateForm>[0]["existingLogs"]}
        existingPosts={(existingWorkPostsRaw ?? []) as Parameters<typeof ActivityUpdateForm>[0]["existingPosts"]}
        teamMembers={teamMembers}
      />
    </Suspense>
  )
}
