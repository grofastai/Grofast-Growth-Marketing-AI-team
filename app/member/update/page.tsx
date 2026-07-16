export const revalidate = 0

import { createServerClient } from "@/lib/supabase/server"
import { createClient } from "@supabase/supabase-js"
import { cookies } from "next/headers"
import { redirect } from "next/navigation"
import { Suspense } from "react"
import DailyUpdateForm, { type ActiveLeave, type CollabWindow } from "./daily-update-form"
import { hasFiledUpdate, findUnfiledUpdateDate } from "@/lib/attendance-gate"
import { Loader2 } from "lucide-react"

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
  const cookieStore = await cookies()
  const impersonateId = cookieStore.get("gf_impersonate")?.value
  const effectiveUserId = impersonateId ?? user.id

  const admin = adminSupabase()
  const today = new Date().toISOString().split("T")[0]

  const { data: profile } = await admin
    .from("users")
    .select("company_id, team, name, work_layout, is_management, enabled_blocks")
    .eq("id", effectiveUserId)
    .single()

  const companyId      = profile?.company_id ?? ""
  const isManagement   = (profile as { is_management?: boolean | null } | null)?.is_management === true
  const isFreelancer   = (profile as { work_layout?: string | null } | null)?.work_layout === "freelance_media"

  const thirtyDaysAgo = new Date(); thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30)
  const thirtyDaysAgoStr = thirtyDaysAgo.toISOString().split("T")[0]

  // Yesterday date (IST)
  const yesterdayIST = new Date()
  yesterdayIST.setDate(yesterdayIST.getDate() - 1)
  const yesterdayStr = yesterdayIST.toLocaleString('en-CA', { timeZone: 'Asia/Kolkata' }).split(',')[0]

  const [
    { data: projectsRaw },
    { data: supabaseClientsRaw },
    { data: pastClientsRaw },
    { data: existingUpdate },
    { data: pastUpdates },
    { data: teamMembersRaw },
    { data: approvedLeavesRaw },
    { data: activeLeavesList },
    { data: collabWindowsRaw },
    { data: todayClockLog },
    { data: yesterdayUpdate },
    { data: yesterdayLeave },
    { data: yesterdayHoliday },
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
      .from("clients")
      .select("name")
      .eq("company_id", companyId)
      .eq("status", "past")
      .order("name"),
    admin
      .from("daily_updates")
      .select("id, date, working_hours, shoot_count, editing_count, learning_hours, work_entries, learning_topic, learning_notes")
      .eq("user_id", effectiveUserId)
      .eq("date", today)
      .maybeSingle(),
    admin
      .from("daily_updates")
      .select("id, date, working_hours, learning_hours, shoot_count, editing_count, shoot_time_hours, editing_time_hours, work_entries, learning_topic")
      .eq("user_id", effectiveUserId)
      .neq("date", today)
      .order("date", { ascending: false })
      .limit(60),
    admin
      .from("users")
      .select("id, name, employee_id, role, team")
      .eq("company_id", companyId)
      .eq("status", "active")
      .eq("role", "MEMBER")
      .neq("id", effectiveUserId)
      .or("work_layout.neq.freelance_media,work_layout.is.null")
      .order("name"),
    admin
      .from("leaves")
      .select("from_date, to_date, leave_type")
      .eq("user_id", effectiveUserId)
      .eq("status", "approved")
      .gte("to_date", thirtyDaysAgoStr),
    // Overlap validation: half_day + permission leaves (pending OR approved) with time bounds
    admin
      .from("leaves")
      .select("from_date, to_date, leave_type, status, half_day_from_time, half_day_to_time, permission_time, permission_hours")
      .eq("user_id", effectiveUserId)
      .in("status", ["approved", "pending"])
      .in("leave_type", ["half_day", "permission"])
      .gte("to_date", thirtyDaysAgoStr),
    // Direction 2: confirmed collab windows block new work entries at same time
    admin
      .from("collaboration_confirmations")
      .select("date, confirmed_start_time, confirmed_end_time")
      .eq("collaborator_id", effectiveUserId)
      .in("status", ["confirmed", "edited_confirmed"])
      .gte("date", thirtyDaysAgoStr),
    // 4A: did the member clock in today?
    admin
      .from("attendance_logs")
      .select("clock_in")
      .eq("user_id", effectiveUserId)
      .eq("date", today)
      .maybeSingle(),
    // 4B: did yesterday have a submitted update? A row that exists but holds no entries
    // is not a submission — see hasFiledUpdate.
    admin
      .from("daily_updates")
      .select("work_entries, learning_hours")
      .eq("user_id", effectiveUserId)
      .eq("date", yesterdayStr)
      .maybeSingle(),
    // 4B: was yesterday a leave or holiday? (skip auto-select if so)
    admin
      .from("leaves")
      .select("id")
      .eq("user_id", effectiveUserId)
      .lte("from_date", yesterdayStr)
      .gte("to_date", yesterdayStr)
      .in("status", ["approved"])
      .maybeSingle(),
    admin
      .from("company_leaves")
      .select("id")
      .eq("company_id", companyId)
      .eq("date", yesterdayStr)
      .maybeSingle(),
  ])

  type Project = { id: string; business_name: string }
  type TeamMember = { id: string; name: string; employee_id: string; role: string; team: string | null }
  const projects = (projectsRaw ?? []) as unknown as Project[]
  const supabaseClientNames = (supabaseClientsRaw ?? []).map((c: { name: string }) => c.name)
  const teamMembers = (teamMembersRaw ?? []) as TeamMember[]

  const clientNames = supabaseClientNames
  const pastClientNames = (pastClientsRaw ?? []).map((c: { name: string }) => c.name)
  const userName = (profile as { name?: string } | null)?.name ?? ""

  // Expand approved leave date ranges into individual YYYY-MM-DD strings
  const approvedLeaveDates: string[] = []
  for (const lv of (approvedLeavesRaw ?? [])) {
    const cur = new Date(lv.from_date + "T12:00:00")
    const end = new Date(lv.to_date + "T12:00:00")
    while (cur <= end) {
      approvedLeaveDates.push(cur.toISOString().split("T")[0])
      cur.setDate(cur.getDate() + 1)
    }
  }

  // 4A: requires today clock-in (skip for management, freelancer, when impersonating,
  // and on an approved leave day — there's nothing to clock in for if you're off today)
  const todayClockedIn = !!(todayClockLog as { clock_in: string | null } | null)?.clock_in
  const requiresClockIn = !isManagement && !isFreelancer && !impersonateId && !approvedLeaveDates.includes(today)

  // 4B: open the form on the day the gate is blocking, so "Submit This Day's Update" lands
  // on the right date. That's the oldest worked day with no entries — which may be older
  // than yesterday if a past day was emptied out — falling back to yesterday when the member
  // simply never showed up and filed nothing.
  const unfiledDate = (!isManagement && !isFreelancer)
    ? await findUnfiledUpdateDate(admin, companyId, effectiveUserId, today)
    : null
  const yesterdayMissing = !hasFiledUpdate(yesterdayUpdate) && !yesterdayLeave && !yesterdayHoliday
  const defaultDate = unfiledDate
    ?? ((!isManagement && !isFreelancer && yesterdayMissing) ? yesterdayStr : undefined)

  const fallback = (
    <div className="flex items-center justify-center py-16">
      <Loader2 size={20} className="animate-spin" style={{ color: "#de1a1a" }} />
    </div>
  )

  // DailyUpdateForm handles all teams: Media Team gets shoot/edit tabs, everyone else gets working+learning
  return (
    <Suspense fallback={fallback}>
      <DailyUpdateForm
        projects={projects}
        sheetClientNames={clientNames}
        pastClientNames={pastClientNames}
        team={profile?.team ?? null}
        workLayout={(profile as { work_layout?: string } | null)?.work_layout as 'media' | 'non_media' | 'freelance_media' | undefined}
        enabledBlocks={(profile as { enabled_blocks?: string[] | null } | null)?.enabled_blocks ?? null}
        userName={userName}
        existingUpdate={existingUpdate ?? null}
        pastUpdates={pastUpdates ?? []}
        teamMembers={teamMembers}
        approvedLeaveDates={approvedLeaveDates}
        todayClockedIn={todayClockedIn}
        requiresClockIn={requiresClockIn}
        defaultDate={defaultDate}
        activeLeavesList={(activeLeavesList ?? []) as ActiveLeave[]}
        collabWindows={
          ((collabWindowsRaw ?? []) as { date: string; confirmed_start_time: string | null; confirmed_end_time: string | null }[])
            .filter(c => c.confirmed_start_time && c.confirmed_end_time)
            .map(c => ({ date: c.date, from: c.confirmed_start_time!, to: c.confirmed_end_time! })) as CollabWindow[]
        }
      />
    </Suspense>
  )
}
