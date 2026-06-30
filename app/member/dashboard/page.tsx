export const revalidate = 0

import { createServerClient } from "@/lib/supabase/server"
import { createClient } from "@supabase/supabase-js"
import { cookies } from "next/headers"
import type React from "react"
import { Target, CalendarOff, Clock, CheckCircle2, AlertCircle, AlertTriangle, Calendar, ChevronRight, Zap, Camera, Film, Coffee, BookOpen, Mic, Monitor, Layers } from "lucide-react"
import Link from "next/link"
import Image from "next/image"
import DashboardHeaderControls from "@/components/member/DashboardHeaderControls"
import MonthFilterTabs from "@/components/member/MonthFilterTabs"
import { calcNetWorkHours } from "@/lib/utils/work-hours"

function adminClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  )
}

export default async function MemberDashboardPage({ searchParams }: { searchParams: Promise<{ month?: string }> }) {
  const supabase = await createServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return null

  const cookieStore = await cookies()
  const impersonateId = cookieStore.get("gf_impersonate")?.value
  const effectiveUserId = impersonateId ?? user.id

  // When an admin is impersonating, the RLS-bound `supabase` client is still
  // authenticated as the admin, so member-scoped policies (user_id = auth.uid())
  // would return zero rows. Read through the service-role client instead — still
  // explicitly scoped to effectiveUserId. The member layout already verified the
  // admin may impersonate this same-company user.
  const db = impersonateId ? adminClient() : supabase

  const params = await searchParams
  const monthParam = params.month ?? ""

  const now   = new Date()
  const today = now.toISOString().split("T")[0]

  // Month range based on filter
  let monthStart: string, monthEnd: string, monthName: string
  let monthMode: "this" | "last" | "all" | "custom"

  if (monthParam === "last") {
    monthMode = "last"
    const y = now.getMonth() === 0 ? now.getFullYear() - 1 : now.getFullYear()
    const m = now.getMonth() === 0 ? 12 : now.getMonth()
    monthStart = `${y}-${String(m).padStart(2, "0")}-01`
    const lastDay = new Date(now.getFullYear(), now.getMonth(), 0)
    monthEnd  = lastDay.toISOString().split("T")[0]
    monthName = new Date(y, m - 1, 1).toLocaleString("en-US", { month: "long", year: "numeric" })
  } else if (monthParam === "all") {
    monthMode  = "all"
    monthStart = "2020-01-01"
    monthEnd   = today
    monthName  = "All Time"
  } else if (/^\d{4}-\d{2}$/.test(monthParam)) {
    monthMode = "custom"
    const [yr, mo] = monthParam.split("-").map(Number)
    monthStart = `${yr}-${String(mo).padStart(2, "0")}-01`
    monthEnd   = new Date(yr, mo, 0).toISOString().split("T")[0]
    monthName  = new Date(yr, mo - 1, 1).toLocaleString("en-US", { month: "long", year: "numeric" })
  } else {
    monthMode  = "this"
    monthStart = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-01`
    monthEnd   = today
    monthName  = now.toLocaleString("en-US", { month: "long", year: "numeric" })
  }

  type ProfileRow    = { name: string; employee_id: string; phone: string | null; photo_url: string | null; blood_group: string | null; emergency_contact_name: string | null; team: string | null }
  type UpdateRow     = { working_hours: number | null; shoot_count: number | null }
  type TaskRow       = { id: string; title: string; status: string; priority: string; due_date: string | null }
  type AttLog        = { clock_in: string | null; clock_out: string | null }
  type WorkEntryLike = { task_type: string; start_time?: string | null; end_time?: string | null; duration_hours?: number | null; _travel_hours?: number | null }
  type MonthlyUpdate = { date: string; working_hours: number | null; attendance_status: string; learning_hours: number | null; shoot_count: number | null; editing_count: number | null; work_entries: WorkEntryLike[] | null }
  type MonthlyAttLog = { work_type: string | null; status: string; date: string; break_total_mins: number | null; clock_in: string | null; clock_out: string | null }
  type LeaveRow      = { from_date: string; to_date: string; leave_type: string | null }

  const [
    { data: profileRaw },
    { data: todayUpdateRaw },
    { count: activeTasksCount },
    { count: completedTasksCount },
    { count: pendingLeavesCount },
    { data: myTasksRaw },
    { data: clockLogRaw },
    { data: monthlyUpdatesRaw },
    { data: approvedLeavesRaw },
    { data: monthlyAttLogsRaw },
    { data: collabConfirmsRaw },
  ] = await Promise.all([
    db.from("users").select("name, employee_id, phone, photo_url, blood_group, emergency_contact_name, team").eq("id", effectiveUserId).single(),
    db.from("daily_updates").select("working_hours, shoot_count").eq("user_id", effectiveUserId).eq("date", today).maybeSingle(),
    db.from("tasks").select("*", { count: "exact", head: true }).eq("assigned_to", effectiveUserId).neq("status", "completed"),
    db.from("tasks").select("*", { count: "exact", head: true }).eq("assigned_to", effectiveUserId).eq("status", "completed"),
    db.from("leaves").select("*", { count: "exact", head: true }).eq("user_id", effectiveUserId).eq("status", "pending"),
    db.from("tasks").select("id, title, status, priority, due_date").eq("assigned_to", effectiveUserId).neq("status", "completed").order("due_date", { ascending: true }).limit(8),
    db.from("attendance_logs").select("clock_in, clock_out").eq("user_id", effectiveUserId).eq("date", today).maybeSingle(),
    db.from("daily_updates").select("date, working_hours, attendance_status, learning_hours, shoot_count, editing_count, work_entries").eq("user_id", effectiveUserId).gte("date", monthStart).lte("date", monthEnd),
    adminClient().from("leaves").select("from_date, to_date, leave_type").eq("user_id", effectiveUserId).eq("status", "approved").gte("from_date", monthStart).lte("from_date", monthEnd),
    db.from("attendance_logs").select("work_type, status, date, break_total_mins, clock_in, clock_out").eq("user_id", effectiveUserId).gte("date", monthStart).lte("date", monthEnd),
    db.from("collaboration_confirmations").select("date, confirmed_hours").eq("collaborator_id", effectiveUserId).in("status", ["confirmed", "edited_confirmed"]).gte("date", monthStart).lte("date", monthEnd),
  ])

  const profile        = profileRaw as unknown as ProfileRow | null
  const todayUpdate    = todayUpdateRaw as unknown as UpdateRow | null
  const myTasks        = (myTasksRaw ?? []) as unknown as TaskRow[]
  const clockLog       = clockLogRaw as unknown as AttLog | null
  const monthlyUpdates = (monthlyUpdatesRaw ?? []) as unknown as MonthlyUpdate[]
  const approvedLeaves = (approvedLeavesRaw ?? []) as unknown as LeaveRow[]
  const monthlyAttLogs = (monthlyAttLogsRaw ?? []) as unknown as MonthlyAttLog[]
  const collabConfirms = (collabConfirmsRaw ?? []) as { date: string; confirmed_hours: number | null }[]

  // Build collab hours by date map
  const collabByDate: Record<string, number> = {}
  for (const c of collabConfirms) {
    collabByDate[c.date] = (collabByDate[c.date] ?? 0) + (c.confirmed_hours ?? 0)
  }
  const todayCollabH = collabByDate[today] ?? 0

  // Today hours
  let todayHours = 0
  if (clockLog?.clock_in) {
    const end = clockLog.clock_out ? new Date(clockLog.clock_out).getTime() : Date.now()
    todayHours = Math.round(((end - new Date(clockLog.clock_in).getTime()) / 3600000) * 10) / 10
  } else if (todayUpdate?.working_hours) {
    todayHours = todayUpdate.working_hours
  }
  todayHours = Math.round((todayHours + todayCollabH) * 10) / 10

  const shootCount     = todayUpdate?.shoot_count ?? 0
  const activeTasks    = activeTasksCount ?? 0
  const completedTasks = completedTasksCount ?? 0
  const pendingLeaves  = pendingLeavesCount ?? 0
  const todayOverdue   = myTasks.filter(t => t.due_date && t.due_date < today)

  // Monthly calculations — use attendance_logs as source of truth for presence
  const presentAttLogs = monthlyAttLogs.filter(l => l.status === "present")
  const officeDays     = presentAttLogs.filter(l => l.work_type === "office").length
  const wfhDays        = presentAttLogs.filter(l => l.work_type === "wfh").length
  const shootDays      = presentAttLogs.filter(l => l.work_type === "shoot" || l.work_type === "outside").length
  const presentDays    = presentAttLogs.length  // all present (office + wfh + shoot)
  const holidayDays    = monthlyUpdates.filter(u => u.attendance_status === "holiday").length

  // Per-day working hours computed from work_entries + confirmed collab hours
  const monthlyDayHours = monthlyUpdates.map(u => {
    const entries = Array.isArray(u.work_entries) ? u.work_entries as WorkEntryLike[] : []
    // calcNetWorkHours already includes learning entries (filters task_type !== 'break').
    // Only add learning separately when falling back to stored fields (no entries).
    const workH = entries.length > 0
      ? calcNetWorkHours(entries)
      : (u.working_hours ?? 0) + (u.learning_hours ?? 0)
    const dayCollabH = collabByDate[u.date] ?? 0
    return { totalH: workH + dayCollabH, attendanceStatus: u.attendance_status }
  })
  const totalMonthHrs  = Math.round(monthlyDayHours.reduce((s, d) => s + d.totalH, 0) * 10) / 10
  const MONTHLY_TARGET_HRS = 25 * 8.5  // 212.5h — fixed for all months
  const monthlyAvgHrs = presentDays > 0 ? Math.round((totalMonthHrs / presentDays) * 10) / 10 : 0
  const overtimeHrs   = Math.round(Math.max(0, totalMonthHrs - MONTHLY_TARGET_HRS) * 10) / 10

  // Dates that are WFH/shoot_day/permission — NOT actual leave days
  const nonLeaveDates = new Set<string>()
  for (const l of approvedLeaves) {
    if (l.leave_type !== "permission" && l.leave_type !== "wfh" && l.leave_type !== "shoot_day") continue
    const cur = new Date(l.from_date + "T12:00:00")
    const end = new Date(l.to_date   + "T12:00:00")
    while (cur <= end) { nonLeaveDates.add(cur.toISOString().split("T")[0]); cur.setDate(cur.getDate() + 1) }
  }

  // LEAVE-1: cap leave date ranges to current month [monthStart..today]
  // LEAVE-2: only count approved leave records (not absence logs)
  // half_day counts as 0.5 not 1
  let leaveDays = 0
  for (const l of approvedLeaves) {
    if (l.leave_type === "permission" || l.leave_type === "wfh" || l.leave_type === "shoot_day") continue
    const start = l.from_date > monthStart ? l.from_date : monthStart
    const end   = l.to_date   < today      ? l.to_date   : today
    if (start > end) continue
    const days = Math.ceil((new Date(end + "T12:00:00").getTime() - new Date(start + "T12:00:00").getTime()) / 86400000) + 1
    leaveDays += l.leave_type === "half_day" ? days * 0.5 : days
  }

  // Login hours — raw clock_in → clock_out span, no break deduction
  const logsWithClockData = presentAttLogs.filter(l => l.clock_in && l.clock_out)
  const totalLoginHrs = Math.round(logsWithClockData.reduce((s, l) =>
    s + (new Date(l.clock_out!).getTime() - new Date(l.clock_in!).getTime()) / 3600000, 0
  ) * 10) / 10
  const avgLoginHrs = logsWithClockData.length > 0
    ? Math.round((totalLoginHrs / logsWithClockData.length) * 10) / 10
    : 0

  // Right-panel stats — media vs non-media
  const isMedia        = profile?.team === "Media Team" || profile?.team === "Media Production Team"
  const totalShoots    = monthlyUpdates.reduce((s, u) => {
    const entries = Array.isArray(u.work_entries) ? u.work_entries as WorkEntryLike[] : []
    if (entries.length > 0) return s + entries.filter(e => e.task_type === 'shoot').length
    return s + (u.shoot_count ?? 0)
  }, 0)
  // UNIQUE COUNT RULE: skip is_rework=true for edit/voiceover/poster — revisions are not new unique deliverables.
  // Dual-source for edit: new records use work_entries (filter is_rework); old records (work_entries=null) fall back
  // to editing_count column — safe because revisions didn't exist when those old records were created.
  const totalEdited    = monthlyUpdates.reduce((s, u) => {
    const entries = Array.isArray(u.work_entries) ? u.work_entries as WorkEntryLike[] : []
    if (entries.length > 0) return s + entries.filter(e => e.task_type === 'edit' && !(e as unknown as Record<string,unknown>).is_rework).length
    return s + (u.editing_count ?? 0)
  }, 0)
  const totalLearningHrs = Math.round(monthlyUpdates.reduce((s, u) => {
    const entries = Array.isArray(u.work_entries) ? u.work_entries as WorkEntryLike[] : []
    if (entries.length > 0) return s + entries.filter(e => e.task_type === 'learning').reduce((sum, e) => sum + (e.duration_hours ?? 0), 0)
    return s + (u.learning_hours ?? 0)
  }, 0) * 10) / 10
  const totalBreakHrs  = Math.round(monthlyUpdates.reduce((s, u) => {
    const entries = Array.isArray(u.work_entries) ? u.work_entries : []
    return s + (entries as WorkEntryLike[]).filter(e => e.task_type === "break").reduce((sum, e) => sum + (e.duration_hours ?? 0), 0)
  }, 0) * 10) / 10

  // Avg working hrs = totalMonthHrs / presentDays — same formula for media and non-media
  const avgWorkingHrs = presentDays > 0
    ? Math.round((totalMonthHrs / presentDays) * 10) / 10
    : 0

  // Freelancer-media (login freelancer, team "Freelance Media Production") —
  // work-entry-based stats instead of attendance-based (no clock, no leave, no break).
  const isFreelancerMedia = profile?.team === "Freelance Media Production"
  function entryDurH(e: WorkEntryLike): number {
    if (e.start_time && e.end_time) {
      const [sh, sm] = e.start_time.split(":").map(Number)
      const [eh, em] = e.end_time.split(":").map(Number)
      const d = (eh * 60 + em - sh * 60 - sm) / 60
      return d > 0 ? d : (e.duration_hours ?? 0)
    }
    return e.duration_hours ?? 0
  }
  let flEditCount = 0, flShootCount = 0, flEditHrs = 0, flShootHrs = 0
  for (const u of monthlyUpdates) {
    const entries = Array.isArray(u.work_entries) ? u.work_entries : []
    for (const e of entries) {
      if (e.task_type === "edit")       { flEditCount++;  flEditHrs  += entryDurH(e) }
      else if (e.task_type === "shoot") { flShootCount++; flShootHrs += entryDurH(e) }
    }
  }
  const flTotalVideos = flEditCount + flShootCount
  const flWorkingHrs  = totalMonthHrs // edit+shoot+learning+collab, merged per day
  const flAvgEdit     = flEditCount  > 0 ? Math.round((flEditHrs / flEditCount) * 10) / 10 : 0
  const flAvgShoot    = flShootCount > 0 ? Math.round((flShootHrs / flShootCount) * 10) / 10 : 0
  const flAvgVideo    = flTotalVideos > 0 ? Math.round(((flEditHrs + flShootHrs) / flTotalVideos) * 10) / 10 : 0

  // Media team right-panel: shooting hrs + editing hrs + counts from work_entries
  let mediaShootHrs = 0, mediaEditHrs = 0, mediaShootCount = 0, mediaEditCount = 0
  if (isMedia) {
    for (const u of monthlyUpdates) {
      const entries = Array.isArray(u.work_entries) ? u.work_entries as WorkEntryLike[] : []
      for (const e of entries) {
        if (e.task_type === "shoot") { mediaShootHrs += e.duration_hours ?? 0; mediaShootCount++ }
        else if (e.task_type === "edit") { mediaEditHrs += e.duration_hours ?? 0; if (!(e as unknown as Record<string,unknown>).is_rework) mediaEditCount++ }
      }
    }
    mediaShootHrs = Math.round(mediaShootHrs * 10) / 10
    mediaEditHrs  = Math.round(mediaEditHrs  * 10) / 10
  }

  // Non-media right-panel: poster/edit/voiceover counts + technical (work_log) hrs
  // UNIQUE COUNT RULE: always guard with !is_rework — revisions must not increment these counts
  let nmPosterCount = 0, nmEditCount = 0, nmVoiceoverCount = 0, nmTechHrs = 0
  if (!isMedia && !isFreelancerMedia) {
    for (const u of monthlyUpdates) {
      const entries = Array.isArray(u.work_entries) ? u.work_entries as WorkEntryLike[] : []
      for (const e of entries) {
        if      (e.task_type === "poster"    && !(e as unknown as Record<string,unknown>).is_rework) nmPosterCount++
        else if (e.task_type === "edit"      && !(e as unknown as Record<string,unknown>).is_rework) nmEditCount++
        else if (e.task_type === "voiceover" && !(e as unknown as Record<string,unknown>).is_rework) nmVoiceoverCount++
        else if (e.task_type === "other")     nmTechHrs += e.duration_hours ?? 0
      }
    }
    nmTechHrs = Math.round(nmTechHrs * 10) / 10
  }

  const hour      = now.getHours()
  const greeting  = hour < 12 ? "Good morning" : hour < 18 ? "Good afternoon" : "Good evening"
  const dateStr   = now.toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric" })
  const firstName = profile?.name?.split(" ")[0] ?? "there"

  // Next salary date: 5th of current month if today < 5, else 5th of next month
  const todayDay = now.getDate()
  const nextSalaryDate = todayDay < 5
    ? new Date(now.getFullYear(), now.getMonth(), 5)
    : new Date(now.getFullYear(), now.getMonth() + 1, 5)
  const nextSalaryDaysLeft = Math.max(0, Math.ceil((nextSalaryDate.getTime() - new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime()) / 86400000))
  const nextSalaryLabel = nextSalaryDate.toLocaleDateString("en-IN", { day: "numeric", month: "long" })

  let productivitySignal: { icon: "zap" | "warn"; text: string; color: string } | null = null
  if (clockLog?.clock_in) {
    if (todayHours > 8.5)
      productivitySignal = { icon: "zap",  text: `Overtime: +${Math.round((todayHours - 8.5) * 10) / 10}h beyond 8.5h today`, color: "#EA580C" }
    else if (todayHours >= 6)
      productivitySignal = { icon: "zap",  text: "You're on track today", color: "#de1a1a" }
    else
      productivitySignal = { icon: "warn", text: "You are below expected hours", color: "#F59E0B" }
  }

  const PRIORITY_STYLE: Record<string, { color: string; bg: string }> = {
    low:    { color: "#6B7280", bg: "rgba(0,0,0,0.04)" },
    medium: { color: "#F59E0B", bg: "rgba(245,158,11,0.08)" },
    high:   { color: "#FF6464", bg: "rgba(255,100,100,0.08)" },
  }
  const STATUS_STYLE: Record<string, { color: string; bg: string; label: string }> = {
    todo:        { color: "#5B21B6", bg: "rgba(91,33,182,0.12)",  label: "TODO"        },
    in_progress: { color: "#D97706", bg: "rgba(217,119,6,0.13)",  label: "IN PROGRESS" },
    completed:   { color: "#16A34A", bg: "rgba(22,163,74,0.12)",  label: "DONE"        },
  }

  // Monthly stats grid
  const monthlyStats: { label: string; value: string | number; color: string; sub: string | undefined }[] = isFreelancerMedia ? [
    { label: "Total Working Hrs", value: flWorkingHrs > 0 ? `${flWorkingHrs}h` : "—",  color: "#111111", sub: undefined },
    { label: "Videos Edited",     value: flEditCount,                                  color: "#de1a1a", sub: undefined },
    { label: "Videos Shot",       value: flShootCount,                                 color: "#6366F1", sub: undefined },
    { label: "Avg Time / Edit",   value: flAvgEdit > 0 ? `${flAvgEdit}h` : "—",        color: "#10B981", sub: undefined },
    { label: "Avg Time / Shoot",  value: flAvgShoot > 0 ? `${flAvgShoot}h` : "—",      color: "#F59E0B", sub: undefined },
    { label: "Learning Hrs",      value: totalLearningHrs > 0 ? `${totalLearningHrs}h` : "—", color: "#A78BFA", sub: undefined },
  ] : [
    { label: "Avg Login Hrs",        value: avgLoginHrs > 0 ? `${avgLoginHrs}h` : "—",       color: "#6366F1", sub: undefined },
    { label: "Avg Working Hrs",      value: avgWorkingHrs > 0 ? `${avgWorkingHrs}h` : "—",   color: "#111111", sub: undefined },
    { label: "Office Days",          value: officeDays,                                       color: "#de1a1a",  sub: undefined },
    { label: isMedia ? "Shoot Days" : "WFH Days", value: isMedia ? shootDays : wfhDays,      color: "#6366F1",  sub: undefined },
    { label: "Leave Taken This Month", value: leaveDays,                                      color: leaveDays > 0 ? "#D97706" : "#D1D5DB", sub: `${Math.max(0, 5 - leaveDays)} days left` },
    { label: "Overtime Hrs",         value: overtimeHrs > 0 ? `${overtimeHrs}h` : "—",       color: overtimeHrs > 0 ? "#EA580C" : "#D1D5DB", sub: overtimeHrs > 0 ? `above 212.5h target` : undefined },
  ]

  // Top 5 stat cards — work-entry based for freelancer-media
  const topCards: { icon: React.ElementType; iconBg: string; iconColor: string; value: string | number; label: string }[] = isFreelancerMedia ? [
    { icon: Film,         iconBg: "rgba(222,26,26,0.1)",   iconColor: "#de1a1a", value: flEditCount,  label: "Videos Edited" },
    { icon: Camera,       iconBg: "rgba(99,102,241,0.12)", iconColor: "#6366F1", value: flShootCount, label: "Videos Shot" },
    { icon: Clock,        iconBg: "rgba(16,185,129,0.12)", iconColor: "#10B981", value: flWorkingHrs > 0 ? `${flWorkingHrs}h` : "—", label: "Working Hrs" },
    { icon: Zap,          iconBg: "rgba(245,158,11,0.12)", iconColor: "#F59E0B", value: flAvgVideo > 0 ? `${flAvgVideo}h` : "—", label: "Avg / Video" },
    { icon: CheckCircle2, iconBg: "rgba(22,163,74,0.1)",   iconColor: "#16A34A", value: activeTasks, label: "Active Tasks" },
  ] : [
    { icon: Calendar,     iconBg: "rgba(222,26,26,0.1)",   iconColor: "#de1a1a", value: presentDays || 0,   label: "Present Days"  },
    { icon: Clock,        iconBg: "rgba(99,102,241,0.12)", iconColor: "#6366F1", value: totalMonthHrs > 0 ? `${totalMonthHrs}h` : (todayHours > 0 ? `${Math.round(todayHours * 10) / 10}h` : "—"), label: "Working Hrs"  },
    { icon: Target,       iconBg: "rgba(16,185,129,0.12)", iconColor: "#10B981", value: totalLoginHrs > 0 ? `${totalLoginHrs}h` : "—", label: "Login Hrs" },
    { icon: AlertCircle,  iconBg: "rgba(245,158,11,0.12)", iconColor: "#F59E0B", value: Math.max(0, 5 - leaveDays), label: "Leave Left" },
    { icon: CheckCircle2, iconBg: "rgba(22,163,74,0.1)",   iconColor: "#16A34A", value: activeTasks,        label: "Active Tasks"  },
  ]

  // Right-panel quick stats
  const rightStats: { icon: React.ElementType; iconBg: string; iconColor: string; value: string | number; label: string; href: string }[] = isFreelancerMedia ? [
    { icon: Film,     iconBg: "rgba(222,26,26,0.1)",   iconColor: "#de1a1a", value: flEditCount,  label: "Videos Edited", href: "/member/history" },
    { icon: Camera,   iconBg: "rgba(99,102,241,0.1)",  iconColor: "#6366F1", value: flShootCount, label: "Videos Shot",   href: "/member/history" },
    { icon: BookOpen, iconBg: "rgba(16,185,129,0.1)",  iconColor: "#10B981", value: totalLearningHrs > 0 ? `${totalLearningHrs}h` : "—", label: "Learning Hrs", href: "/member/history" },
  ] : isMedia ? [
    { icon: Camera,   iconBg: "rgba(99,102,241,0.1)",  iconColor: "#6366F1", value: mediaShootHrs > 0 ? `${mediaShootHrs}h` : "—",      label: "Shooting Hrs",     href: "/member/history" },
    { icon: Camera,   iconBg: "rgba(99,102,241,0.08)", iconColor: "#6366F1", value: mediaShootCount > 0 ? mediaShootCount : "—",         label: "Shooting Sessions", href: "/member/history" },
    { icon: Film,     iconBg: "rgba(222,26,26,0.1)",   iconColor: "#de1a1a", value: mediaEditHrs > 0 ? `${mediaEditHrs}h` : "—",        label: "Editing Hrs",      href: "/member/history" },
    { icon: Film,     iconBg: "rgba(222,26,26,0.08)",  iconColor: "#de1a1a", value: mediaEditCount > 0 ? mediaEditCount : "—",           label: "Edited Videos",    href: "/member/history" },
    { icon: BookOpen, iconBg: "rgba(16,185,129,0.1)",  iconColor: "#10B981", value: totalLearningHrs > 0 ? `${totalLearningHrs}h` : "—", label: "Learning Hrs",     href: "/member/history" },
  ] : [
    { icon: Layers,   iconBg: "rgba(99,102,241,0.1)",  iconColor: "#6366F1", value: nmPosterCount,                                       label: "Poster",       href: "/member/history" },
    { icon: Film,     iconBg: "rgba(222,26,26,0.1)",   iconColor: "#de1a1a", value: nmEditCount,                                         label: "Editing",      href: "/member/history" },
    { icon: Mic,      iconBg: "rgba(16,185,129,0.1)",  iconColor: "#10B981", value: nmVoiceoverCount,                                    label: "Voiceover",    href: "/member/history" },
    { icon: Monitor,  iconBg: "rgba(245,158,11,0.1)",  iconColor: "#F59E0B", value: nmTechHrs > 0 ? `${nmTechHrs}h` : "—",              label: "Technical",    href: "/member/history" },
    { icon: BookOpen, iconBg: "rgba(167,139,250,0.1)", iconColor: "#A78BFA", value: totalLearningHrs > 0 ? `${totalLearningHrs}h` : "—", label: "Learning Hrs", href: "/member/history" },
  ]

  return (
    <div className="p-5 md:p-6 xl:p-8 max-w-[1600px]" style={{ background: "#F1F2F6", minHeight: "100vh" }}>

      {/* ── Top Header ────────────────────────────────────────── */}
      <div className="flex items-start justify-between gap-4 mb-7">
        <div>
          <h1 className="text-[26px] md:text-[30px] font-black leading-tight" style={{ color: "#111111", fontFamily: "var(--font-jakarta)" }}>
            {greeting},&nbsp;<span style={{ color: "#de1a1a" }}>{firstName}</span>&nbsp;👋
          </h1>
          <p className="text-[13px] mt-1 font-medium" style={{ color: "#6B7280" }}>{dateStr}</p>
        </div>

        <DashboardHeaderControls
          pendingLeaves={pendingLeaves}
          employeeId={profile?.employee_id ?? ""}
        />
      </div>

      {/* ── 5 Stat Cards ─────────────────────────────────────── */}
      <div className="grid grid-cols-2 lg:grid-cols-5 gap-4 mb-5">
        {topCards.map((s) => {
          const Icon = s.icon
          return (
            <div key={s.label} className="rounded-2xl p-4 flex flex-col"
              style={{ background: "#FFFFFF", boxShadow: "0 2px 16px rgba(0,0,0,0.06)" }}>

              {/* Icon + label */}
              <div className="flex items-center gap-2 mb-3">
                <div className="w-8 h-8 rounded-xl flex items-center justify-center flex-shrink-0"
                  style={{ background: s.iconBg }}>
                  <Icon size={15} style={{ color: s.iconColor }} />
                </div>
                <p className="text-[11px] font-bold uppercase tracking-wider" style={{ color: "#9CA3AF" }}>{s.label}</p>
              </div>

              {/* Big value */}
              <p className="text-[30px] font-black leading-none"
                style={{ fontFamily: "var(--font-jakarta)", color: "#111111" }}>
                {s.value}
              </p>
            </div>
          )
        })}
      </div>

      {/* ── Monthly Target Progress Bar ──────────────────────── */}
      {!isFreelancerMedia && (
        <div className="rounded-2xl px-5 py-4 mb-5" style={{ background: "#FFFFFF", border: "1px solid #E8E9EF", overflowX: "auto" }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 10, gap: 8, flexWrap: "nowrap", minWidth: 290 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 6, flexShrink: 0 }}>
              <span style={{ fontSize: 12, fontWeight: 700, color: "#111111", whiteSpace: "nowrap" }}>Monthly Target</span>
              <span style={{ fontSize: 9, fontWeight: 600, padding: "2px 7px", borderRadius: 99, background: "rgba(99,102,241,0.08)", color: "#6366F1", whiteSpace: "nowrap" }}>
                25d × 8.5h = 212.5h
              </span>
            </div>
            <div style={{ display: "flex", alignItems: "center", gap: 8, flexShrink: 0 }}>
              {overtimeHrs > 0 ? (
                <span style={{ fontSize: 11, fontWeight: 700, color: "#EA580C", whiteSpace: "nowrap" }}>+{overtimeHrs}h OT</span>
              ) : (
                <span style={{ fontSize: 11, fontWeight: 600, color: "#9CA3AF", whiteSpace: "nowrap" }}>
                  {Math.max(0, Math.round((212.5 - totalMonthHrs) * 10) / 10)}h left
                </span>
              )}
              <span style={{ fontSize: 13, fontWeight: 900, color: overtimeHrs > 0 ? "#EA580C" : "#111111", whiteSpace: "nowrap" }}>
                {Math.min(100, Math.round((totalMonthHrs / 212.5) * 100))}%
              </span>
            </div>
          </div>
          <div style={{ height: 10, borderRadius: 99, background: "#F3F4F6", overflow: "hidden", minWidth: 290 }}>
            <div style={{
              height: "100%",
              width: `${Math.min(100, (totalMonthHrs / 212.5) * 100)}%`,
              borderRadius: 99,
              background: overtimeHrs > 0
                ? "linear-gradient(90deg, #10B981 0%, #EA580C 100%)"
                : totalMonthHrs >= 170
                  ? "linear-gradient(90deg, #6366F1 0%, #10B981 100%)"
                  : "linear-gradient(90deg, #6366F1 0%, #818CF8 100%)",
              transition: "width 0.6s ease",
            }} />
          </div>
          <div style={{ display: "flex", justifyContent: "space-between", marginTop: 6, minWidth: 290 }}>
            <span style={{ fontSize: 10, fontWeight: 600, color: "#9CA3AF", whiteSpace: "nowrap" }}>{totalMonthHrs}h worked</span>
            <span style={{ fontSize: 10, fontWeight: 600, color: "#9CA3AF", whiteSpace: "nowrap" }}>212.5h</span>
          </div>
        </div>
      )}

      {/* ── This Month ────────────────────────────────────────── */}
      <div className="rounded-2xl p-5 mb-5" style={{ background: "#FFFFFF", border: "1px solid #E8E9EF" }}>
        <div className="flex items-center gap-2 mb-4 flex-wrap">
          <div className="w-7 h-7 rounded-lg flex items-center justify-center"
            style={{ background: "rgba(222,26,26,0.08)" }}>
            <Calendar size={14} style={{ color: "#de1a1a" }} />
          </div>
          <h3 className="text-[13px] font-bold" style={{ color: "#111111" }}>
            {monthMode === "last" ? "Last Month" : monthMode === "all" ? "All Time" : monthMode === "custom" ? "Custom" : "This Month"}
          </h3>
          <span className="text-[11px]" style={{ color: "#6B7280" }}>{monthName}</span>

          <MonthFilterTabs mode={monthMode} customParam={monthMode === "custom" ? monthParam : undefined} />

          {holidayDays > 0 && (
            <span className="text-[10px] font-medium px-2 py-0.5 rounded-full"
              style={{ background: "rgba(99,102,241,0.08)", color: "#6366F1" }}>
              {holidayDays} holiday{holidayDays !== 1 ? "s" : ""}
            </span>
          )}
        </div>
        <div className="grid grid-cols-3 md:grid-cols-6 gap-3">
          {monthlyStats.map((stat) => (
            <div key={stat.label} className="rounded-xl p-3.5 text-center"
              style={{ background: "#F9FAFB", border: "1px solid #E8E9EF" }}>
              <p className="text-[22px] font-black leading-none mb-1"
                style={{ fontFamily: "var(--font-jakarta)", color: stat.color }}>
                {stat.value}
              </p>
              <p className="text-[9px] uppercase tracking-wide font-semibold" style={{ color: "#6B7280" }}>
                {stat.label}
              </p>
              {stat.sub && (
                <p className="text-[9px] mt-1 font-semibold"
                  style={{ color: stat.label === "Leave Days" ? "#D97706" : stat.label === "Overtime Hrs" ? "#EA580C" : "#6B7280" }}>
                  {stat.sub}
                </p>
              )}
            </div>
          ))}
        </div>
      </div>

      {/* ── Daily Update Alert — hidden for freelancer-media (no daily obligation) */}
      {!isFreelancerMedia && (
      <div className="rounded-2xl p-4 md:p-5 mb-5 flex items-start md:items-center gap-3 md:gap-4 flex-wrap"
        style={{ background: "#FFFFFF", border: todayUpdate ? "1px solid rgba(22,163,74,0.25)" : "1px solid #E8E9EF" }}>
        <div className="w-11 h-11 rounded-full flex items-center justify-center flex-shrink-0"
          style={{ background: todayUpdate ? "rgba(22,163,74,0.1)" : "rgba(222,26,26,0.1)" }}>
          {todayUpdate
            ? <CheckCircle2 size={20} style={{ color: "#16A34A" }} />
            : <AlertCircle  size={20} style={{ color: "#de1a1a" }} />}
        </div>
        <div className="flex-1">
          <p className="text-[14px] font-bold" style={{ color: "#111111" }}>
            {todayUpdate ? "Daily update submitted ✓" : "You haven't submitted today's update"}
          </p>
          <p className="text-[12px] mt-0.5" style={{ color: "#6B7280" }}>
            {todayUpdate
              ? isMedia ? `${todayUpdate.working_hours ?? "—"}h logged · ${shootCount} shoot${shootCount !== 1 ? "s" : ""}` : `${todayUpdate.working_hours ?? "—"}h logged`
              : "Submit before 9 PM to avoid alerts"}
          </p>
        </div>
        {!todayUpdate && (
          <Link href="/member/update"
            className="flex items-center gap-2 px-5 py-2.5 rounded-xl text-[13px] font-bold flex-shrink-0 transition-all hover:opacity-90"
            style={{ background: "#de1a1a", color: "#FFFFFF" }}>
            Submit Update <ChevronRight size={15} />
          </Link>
        )}
      </div>
      )}

      {/* ── Main 2-col grid ───────────────────────────────────── */}
      <div className="grid grid-cols-1 md:grid-cols-[1fr_280px] lg:grid-cols-[1fr_300px] gap-5">

        {/* LEFT — My Tasks */}
        <div className="rounded-2xl p-5" style={{ background: "#FFFFFF", border: "1px solid #E8E9EF" }}>
          <div className="flex items-center justify-between mb-5">
            <div className="flex items-center gap-2">
              <div className="w-7 h-7 rounded-full flex items-center justify-center"
                style={{ background: "rgba(222,26,26,0.1)" }}>
                <Target size={13} style={{ color: "#de1a1a" }} />
              </div>
              <h3 className="text-[14px] font-bold" style={{ color: "#111111" }}>My Tasks</h3>
              {todayOverdue.length > 0 && (
                <span className="text-[10px] font-bold px-2 py-0.5 rounded-full"
                  style={{ background: "rgba(255,100,100,0.1)", color: "#FF6464" }}>
                  {todayOverdue.length} overdue
                </span>
              )}
            </div>
            <Link href="/member/tasks" className="text-[12px] font-semibold" style={{ color: "#de1a1a" }}>
              View all →
            </Link>
          </div>

          {myTasks.length === 0 ? (
            <div className="flex flex-col items-center py-8 gap-3">
              <Image
                src="/brand/tasks-complete.png"
                alt="All tasks completed"
                width={200}
                height={180}
                style={{ objectFit: "contain", filter: "drop-shadow(0 8px 24px rgba(222,26,26,0.15))" }}
              />
              <div className="text-center">
                <p className="text-[15px] font-bold" style={{ color: "#111111" }}>All tasks completed</p>
                <p className="text-[12px] mt-1" style={{ color: "#9CA3AF" }}>Great job! You&apos;re all caught up.</p>
              </div>
            </div>
          ) : (
            <div className="space-y-1.5">
              {myTasks.map((task) => {
                const isOverdue = !!task.due_date && task.due_date < today
                const pr  = isOverdue ? { color: "#FF6464" } : PRIORITY_STYLE[task.priority] ?? PRIORITY_STYLE.medium
                const st  = STATUS_STYLE[task.status] ?? STATUS_STYLE.todo
                return (
                  <div key={task.id} className="flex items-center gap-3 px-3 py-2.5 rounded-xl"
                    style={{ background: isOverdue ? "rgba(255,100,100,0.05)" : "#F9FAFB", border: isOverdue ? "1px solid rgba(255,100,100,0.15)" : "1px solid transparent" }}>
                    <div className="w-2 h-2 rounded-full flex-shrink-0" style={{ background: pr.color }} />
                    <p className="flex-1 text-[13px] font-semibold truncate" style={{ color: "#111111" }}>{task.title}</p>
                    {isOverdue && (
                      <span className="text-[9px] font-black px-2 py-0.5 rounded-full flex-shrink-0"
                        style={{ background: "rgba(255,100,100,0.15)", color: "#EF4444", border: "1px solid rgba(255,100,100,0.2)" }}>OVERDUE</span>
                    )}
                    {task.due_date && !isOverdue && (
                      <span className="text-[11px] flex-shrink-0" style={{ color: "#9CA3AF" }}>{task.due_date}</span>
                    )}
                    <span className="text-[9px] font-black px-2 py-0.5 rounded-full flex-shrink-0"
                      style={{ background: st.bg, color: st.color, border: `1px solid ${st.color}30` }}>
                      {st.label}
                    </span>
                  </div>
                )
              })}
            </div>
          )}
        </div>

        {/* RIGHT — monthly quick stats (media/non-media) + salary + today summary */}
        <div className="space-y-3">
          {!isFreelancerMedia && rightStats.map(stat => (
            <Link key={stat.label} href={stat.href}
              className="rounded-2xl p-4 flex items-center gap-3 transition-all hover:shadow-sm"
              style={{ background: "#FFFFFF", border: "1px solid #E8E9EF", display: "flex" }}>
              <div className="w-10 h-10 rounded-full flex items-center justify-center flex-shrink-0"
                style={{ background: stat.iconBg }}>
                <stat.icon size={16} style={{ color: stat.iconColor }} />
              </div>
              <div className="flex-1">
                <p className="text-[22px] font-black leading-none" style={{ fontFamily: "var(--font-jakarta)", color: stat.iconColor }}>{stat.value}</p>
                <p className="text-[11px] font-medium mt-0.5" style={{ color: "#6B7280" }}>{stat.label}</p>
              </div>
              <ChevronRight size={16} style={{ color: "#D1D5DB" }} />
            </Link>
          ))}

          {/* Salary Date Card — hidden for freelancers (paid per work entry, not monthly) */}
          {!isFreelancerMedia && (
          <div className="rounded-2xl p-4 flex items-center gap-3"
            style={{
              background: nextSalaryDaysLeft <= 2
                ? "linear-gradient(135deg, #FEF3C7, #FDE68A)"
                : "linear-gradient(135deg, #F0FDF4, #DCFCE7)",
              border: nextSalaryDaysLeft <= 2 ? "1px solid #FCD34D" : "1px solid #86EFAC",
            }}>
            <div className="w-10 h-10 rounded-full flex items-center justify-center flex-shrink-0"
              style={{ background: nextSalaryDaysLeft <= 2 ? "#FDE68A" : "#DCFCE7" }}>
              <span style={{ fontSize: 20 }}>💰</span>
            </div>
            <div className="flex-1">
              <p className="text-[12px] font-black leading-none"
                style={{ color: nextSalaryDaysLeft <= 2 ? "#92400E" : "#15803D", fontFamily: "var(--font-jakarta)" }}>
                {nextSalaryDaysLeft === 0 ? "Salary Day! 🎉" : nextSalaryDaysLeft === 1 ? "Salary tomorrow! 🎉" : `Salary in ${nextSalaryDaysLeft} days`}
              </p>
              <p className="text-[10px] font-medium mt-0.5"
                style={{ color: nextSalaryDaysLeft <= 2 ? "#78350F" : "#16A34A" }}>
                {nextSalaryLabel} · 5th every month
              </p>
            </div>
          </div>
          )}

          {/* Today Summary — red wave card */}
          <div className="rounded-2xl p-4 relative overflow-hidden" style={{ background: "#0a0a0a" }}>
            {/* Wave background art */}
            <svg viewBox="0 0 300 160" className="absolute inset-0 w-full h-full" preserveAspectRatio="xMidYMid slice" style={{ opacity: 1 }}>
              <defs>
                <radialGradient id="sg1" cx="85%" cy="85%" r="55%">
                  <stop offset="0%" stopColor="#de1a1a" stopOpacity="0.6"/>
                  <stop offset="100%" stopColor="#0a0a0a" stopOpacity="0"/>
                </radialGradient>
                <radialGradient id="sg2" cx="70%" cy="100%" r="45%">
                  <stop offset="0%" stopColor="#9b0000" stopOpacity="0.45"/>
                  <stop offset="100%" stopColor="#0a0a0a" stopOpacity="0"/>
                </radialGradient>
                <radialGradient id="sg3" cx="100%" cy="60%" r="35%">
                  <stop offset="0%" stopColor="#ff3333" stopOpacity="0.3"/>
                  <stop offset="100%" stopColor="#0a0a0a" stopOpacity="0"/>
                </radialGradient>
              </defs>
              <ellipse cx="260" cy="140" rx="160" ry="100" fill="url(#sg1)"/>
              <ellipse cx="220" cy="160" rx="130" ry="70"  fill="url(#sg2)"/>
              <ellipse cx="290" cy="100" rx="90" ry="80" fill="url(#sg3)"/>
              <path d="M340,160 C280,130 180,140 140,110 C100,80 180,55 200,30" fill="none" stroke="#de1a1a" strokeWidth="1" strokeOpacity="0.35"/>
              <path d="M360,160 C300,140 200,150 160,120 C120,90 200,60 210,35" fill="none" stroke="#ff4444" strokeWidth="0.6" strokeOpacity="0.2"/>
              <path d="M320,160 C260,140 160,120 180,90 C200,60 280,50 270,20" fill="none" stroke="#c00000" strokeWidth="1.2" strokeOpacity="0.25"/>
              {([
                [245,70,1.2],[265,90,0.8],[235,110,1.6],[270,125,1],[250,140,1.4],[280,150,0.8]
              ] as [number,number,number][]).map(([cx,cy,r],i) => (
                <circle key={i} cx={cx} cy={cy} r={r} fill="#ff4444" opacity="0.45"/>
              ))}
            </svg>

            {/* Content */}
            <div className="relative z-10">
              <div className="flex items-center justify-between mb-3">
                <p className="text-[13px] font-bold" style={{ color: "#FFFFFF" }}>Today Summary</p>
                <ChevronRight size={14} style={{ color: "rgba(255,255,255,0.35)" }} />
              </div>
              <div className="grid grid-cols-3 gap-2 mb-3">
                {[
                  { label: "Hours",  value: todayHours > 0 ? `${todayHours}h` : "—" },
                  { label: "Done",   value: completedTasks },
                  { label: "Active", value: activeTasks },
                ].map((item) => (
                  <div key={item.label} className="rounded-xl p-3 text-center"
                    style={{ background: "rgba(255,255,255,0.07)", backdropFilter: "blur(4px)" }}>
                    <p className="text-[20px] font-black leading-none mb-1"
                      style={{ fontFamily: "var(--font-jakarta)", color: "#FFFFFF" }}>
                      {item.value}
                    </p>
                    <p className="text-[9px] font-semibold uppercase tracking-wider" style={{ color: "rgba(255,255,255,0.4)" }}>{item.label}</p>
                  </div>
                ))}
              </div>
              {productivitySignal && (
                <div className="flex items-center gap-1.5 pt-2.5" style={{ borderTop: "1px solid rgba(255,255,255,0.1)" }}>
                  {productivitySignal.icon === "zap"
                    ? <Zap size={12} style={{ color: productivitySignal.color }} />
                    : <AlertTriangle size={12} style={{ color: productivitySignal.color }} />}
                  <p className="text-[11px] font-semibold" style={{ color: productivitySignal.color }}>
                    {productivitySignal.text}
                  </p>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>

    </div>
  )
}
