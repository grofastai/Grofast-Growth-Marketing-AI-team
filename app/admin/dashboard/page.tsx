import { createServerClient } from "@/lib/supabase/server"
import { createClient } from "@supabase/supabase-js"
import type { CSSProperties } from "react"
import { cacheGet, cacheSet } from "@/lib/cache"
import {
  Users, FolderOpen, Target, CalendarOff, Clock, CheckCircle2,
  Plus, Megaphone, UserX, UmbrellaOff,
  ArrowRight, ListTodo, CalendarDays, BarChart3, Handshake,
} from "lucide-react"
import Link from "next/link"
import Image from "next/image"
import { getAlerts } from "@/lib/alerts"
import PendingApprovalsCard from "./pending-approvals"
import TaskSummaryChart from "./task-summary-chart"
import MiniCalendar from "./mini-calendar"
import DashboardSearch from "@/components/admin/DashboardSearch"

function adminSupabase() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  )
}

type LeaveRow = {
  id: string
  from_date: string
  to_date: string
  reason: string
  users: { name: string; employee_id: string } | { name: string; employee_id: string }[] | null
}

type TodayLeaveRow = {
  id: string
  leave_type: string | null
  reason: string
  users: { name: string; employee_id: string } | { name: string; employee_id: string }[] | null
}

type CalLeaveRow = {
  from_date: string
  to_date: string
  leave_type: string | null
  users: { id: string; name: string } | { id: string; name: string }[] | null
}

type UpdateRow = {
  attendance_status: string
  work_type: string | null
  working_hours: number | null
  created_at: string
  users: { name: string; employee_id: string } | { name: string; employee_id: string }[] | null
}

export default async function DashboardPage() {
  const supabase = await createServerClient()
  const { data: { user } } = await supabase.auth.getUser()

  const now        = new Date()
  const today      = now.toISOString().split("T")[0]
  const yesterday  = new Date(now.getTime() - 86400000).toISOString().split("T")[0]
  const monthStart = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-01`
  const monthEnd   = new Date(now.getFullYear(), now.getMonth() + 1, 0).toISOString().split("T")[0]

  const admin = adminSupabase()
  const { data: profile } = await admin
    .from("users")
    .select("company_id, name, photo_url")
    .eq("id", user!.id)
    .single()
  const cid = profile?.company_id as string

  // Stat counts are cached per company per day (60s TTL) — reduces 8 DB round-trips to 1 cache read
  type StatCache = { presentToday: number; activeTasks: number; activeClients: number; onLeaveTodayCount: number; taskCompleted: number; taskInProgress: number; taskTodo: number; taskOverdue: number }
  const statsKey = `dashboard:stats:${cid}:${today}`
  let statCounts = await cacheGet<StatCache>(statsKey)

  if (!statCounts) {
    // attendance_logs.user_id has no FK constraint to users.id in this schema, so
    // PostgREST can't resolve an embedded users!inner(...) join — fetch the filtered
    // member id list first, then scope the attendance_logs count to it.
    const { data: realMembersForCount } = await admin
      .from("users")
      .select("id")
      .eq("company_id", cid).eq("role", "MEMBER").eq("status", "active")
      .eq("is_management", false).eq("is_freelancer_login", false)
    const realMemberIds = (realMembersForCount ?? []).map(m => m.id)

    const [p, a, c, l, tc, ti, tt, to] = await Promise.all([
      realMemberIds.length > 0
        ? admin.from("attendance_logs").select("*", { count: "exact", head: true })
            .eq("company_id", cid).eq("date", today).eq("status", "present")
            .in("user_id", realMemberIds)
        : Promise.resolve({ count: 0 }),
      admin.from("tasks").select("*", { count: "exact", head: true })
        .eq("company_id", cid).neq("status", "completed"),
      admin.from("clients").select("*", { count: "exact", head: true })
        .eq("company_id", cid).eq("status", "active"),
      admin.from("leaves").select("*", { count: "exact", head: true })
        .eq("company_id", cid).eq("status", "approved")
        .in("leave_type", ["full_day", "half_day"])
        .lte("from_date", today).gte("to_date", today),
      admin.from("tasks").select("*", { count: "exact", head: true })
        .eq("company_id", cid).eq("status", "completed"),
      admin.from("tasks").select("*", { count: "exact", head: true })
        .eq("company_id", cid).eq("status", "in_progress"),
      admin.from("tasks").select("*", { count: "exact", head: true })
        .eq("company_id", cid).eq("status", "todo"),
      admin.from("tasks").select("*", { count: "exact", head: true })
        .eq("company_id", cid).neq("status", "completed").lt("due_date", today),
    ])
    statCounts = {
      presentToday:     p.count ?? 0,
      activeTasks:      a.count ?? 0,
      activeClients:    c.count ?? 0,
      onLeaveTodayCount: l.count ?? 0,
      taskCompleted:    tc.count ?? 0,
      taskInProgress:   ti.count ?? 0,
      taskTodo:         tt.count ?? 0,
      taskOverdue:      to.count ?? 0,
    }
    await cacheSet(statsKey, statCounts, 60)
  }

  const { presentToday, activeTasks, activeClients, onLeaveTodayCount, taskCompleted, taskInProgress, taskTodo, taskOverdue } = statCounts

  const [
    { data: pendingLeavesRaw },
    { data: recentUpdatesRaw },
    { data: monthLeavesRaw },
    alerts,
    { data: collabRaw },
    { data: todayLeavesRaw },
  ] = await Promise.all([
    admin.from("leaves")
      .select("id, from_date, to_date, reason, users(name, employee_id)")
      .eq("company_id", cid).eq("status", "pending")
      .order("created_at", { ascending: false }).limit(5),
    admin.from("daily_updates")
      .select("attendance_status, work_type, working_hours, created_at, users(name, employee_id)")
      .eq("company_id", cid).eq("date", today)
      .order("created_at", { ascending: false }).limit(6),
    admin.from("leaves")
      .select("from_date, to_date, leave_type, users(id, name)")
      .eq("company_id", cid).eq("status", "approved")
      .lte("from_date", monthEnd).gte("to_date", monthStart),
    cid ? getAlerts(cid) : Promise.resolve({ notUpdatedCount: 0, notUpdatedNames: [], overdueTaskCount: 0, overdueProjectCount: 0, total: 0 }),
    admin.from("daily_updates")
      .select("date, participant_ids")
      .eq("company_id", cid)
      .gte("date", monthStart)
      .lte("date", today),
    admin.from("leaves")
      .select("id, leave_type, reason, users(name, employee_id)")
      .eq("company_id", cid).eq("status", "approved")
      .in("leave_type", ["full_day", "half_day"])
      .lte("from_date", today).gte("to_date", today),
  ])

  // Yesterday not-updated members
  const [{ data: yesterdayUpdatesRaw }, { data: activeMembersRaw }, { data: yesterdayLeavesRaw }, { data: yesterdayHolidayRaw }] = await Promise.all([
    admin.from("daily_updates").select("user_id").eq("company_id", cid).eq("date", yesterday),
    admin.from("users").select("id, name, is_management, is_freelancer_login").eq("company_id", cid).eq("role", "MEMBER").eq("status", "active"),
    // Members on approved full_day or half_day leave yesterday (exempt from update requirement)
    admin.from("leaves").select("user_id")
      .eq("company_id", cid).eq("status", "approved")
      .in("leave_type", ["full_day", "half_day"])
      .lte("from_date", yesterday).gte("to_date", yesterday),
    // Company holiday yesterday — if so, nobody needs to update
    admin.from("company_leaves").select("id").eq("company_id", cid).eq("date", yesterday).maybeSingle(),
  ])
  const yesterdayUpdatedIds  = new Set((yesterdayUpdatesRaw  ?? []).map((u: { user_id: string }) => u.user_id))
  const yesterdayOnLeaveIds  = new Set((yesterdayLeavesRaw   ?? []).map((l: { user_id: string }) => l.user_id))
  const yesterdayWasHoliday  = !!yesterdayHolidayRaw
  const notUpdatedYesterdayNames = yesterdayWasHoliday ? [] : (activeMembersRaw ?? [])
    .filter((m: { id: string; is_management?: boolean | null; is_freelancer_login?: boolean | null }) =>
      !m.is_management && !m.is_freelancer_login && !yesterdayUpdatedIds.has(m.id) && !yesterdayOnLeaveIds.has(m.id))
    .map((m: { name: string }) => m.name)

  // Build leave calendar map — excludes WFH/Shoot Day, those members are working, not absent
  const leaveCalMap: Record<string, { id: string; name: string }[]> = {}
  for (const leave of (monthLeavesRaw ?? []) as unknown as CalLeaveRow[]) {
    if (leave.leave_type === "wfh" || leave.leave_type === "shoot_day") continue
    const u    = Array.isArray(leave.users) ? leave.users[0] : leave.users
    const id   = u?.id ?? ""
    const name = u?.name ?? "?"
    const curr = new Date(leave.from_date + "T12:00:00")
    const end  = new Date(leave.to_date   + "T12:00:00")
    while (curr <= end) {
      const ds = curr.toISOString().split("T")[0]
      if (!leaveCalMap[ds]) leaveCalMap[ds] = []
      leaveCalMap[ds].push({ id, name })
      curr.setDate(curr.getDate() + 1)
    }
  }

  const collabRows = collabRaw ?? []
  const collabToday = collabRows.filter(u => u.date === today && Array.isArray(u.participant_ids) && (u.participant_ids as string[]).length > 0).length
  const collabMonth = collabRows.filter(u => Array.isArray(u.participant_ids) && (u.participant_ids as string[]).length > 0).length
  const totalTagsMonth = collabRows.reduce((acc, u) => acc + ((u.participant_ids as string[])?.length ?? 0), 0)

  const pendingLeavesList = ((pendingLeavesRaw ?? []) as unknown as LeaveRow[]).map(l => ({
    ...l,
    users: Array.isArray(l.users) ? (l.users[0] ?? null) : l.users,
  }))

  const recentUpdates = (recentUpdatesRaw ?? []) as unknown as UpdateRow[]

  const todayLeaves = ((todayLeavesRaw ?? []) as unknown as TodayLeaveRow[]).map(l => ({
    ...l,
    users: Array.isArray(l.users) ? (l.users[0] ?? null) : l.users,
  }))

  const hour     = now.getHours()
  const greeting = hour < 12 ? "Good morning" : hour < 18 ? "Good afternoon" : "Good evening"
  const dateStr  = now.toLocaleDateString("en-US", { weekday: "long", day: "numeric", month: "long", year: "numeric" })

  const adminName = profile?.name ?? "Admin"
  const firstName = adminName.split(" ")[0]
  const isSanjay  = adminName.toLowerCase().includes("sanjay")
  const characterImg   = isSanjay ? "/brand/sanjay-ceo.png" : "/brand/admin-hero.png"
  const characterTitle = isSanjay ? "CEO" : "Founder"

  const taskBreakdown = {
    completed:  taskCompleted  ?? 0,
    inProgress: taskInProgress ?? 0,
    todo:       taskTodo       ?? 0,
    overdue:    taskOverdue    ?? 0,
  }

  const CARD: CSSProperties = {
    background: "#FFFFFF",
    borderRadius: 16,
    border: "1px solid #E5E7EB",
    boxShadow: "0 1px 3px rgba(0,0,0,0.05), 0 4px 12px rgba(0,0,0,0.04)",
  }

  const quickActions = [
    { label: "Add Member",       href: "/admin/team",          icon: Plus,        color: "#16A34A", bg: "rgba(22,163,74,0.08)"   },
    { label: "Assign Task",      href: "/admin/goals",         icon: ListTodo,    color: "#DE1A1A", bg: "rgba(222,26,26,0.06)"   },
    { label: "Announcement",     href: "/admin/announcements", icon: Megaphone,   color: "#D97706", bg: "rgba(217,119,6,0.06)"   },
    { label: "View Reports",     href: "/admin/activities",    icon: BarChart3,   color: "#6366F1", bg: "rgba(99,102,241,0.06)"  },
    { label: "Leave Requests",   href: "/admin/leaves",        icon: CalendarOff, color: "#DE1A1A", bg: "rgba(222,26,26,0.06)"   },
    { label: "Attendance",       href: "/admin/attendance",    icon: CalendarDays,color: "#0EA5E9", bg: "rgba(14,165,233,0.06)"  },
  ]

  return (
    <div style={{ background: "#F5F6FA", minHeight: "100vh" }} className="p-4 lg:p-6 space-y-4">

      {/* ── Header ─────────────────────────────────────── */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between" style={{ background: "linear-gradient(135deg, #DE1A1A 0%, #9B1C1C 50%, #450A0A 100%)", borderRadius: 20, padding: "18px 24px", gap: 12, position: "relative", overflow: "hidden" }}>
        {/* Decorative circles */}
        <div style={{ position: "absolute", top: -30, right: 120, width: 160, height: 160, borderRadius: "50%", background: "rgba(255,255,255,0.05)", pointerEvents: "none" }} />
        <div style={{ position: "absolute", bottom: -40, right: -20, width: 120, height: 120, borderRadius: "50%", background: "rgba(255,255,255,0.04)", pointerEvents: "none" }} />
        <div style={{ position: "relative" }}>
          <h1 style={{ fontSize: 22, fontWeight: 900, color: "#FFFFFF", margin: 0, lineHeight: 1.2 }}>
            {greeting}, <span style={{ color: "#FCA5A5" }}>{firstName}</span> 👋
          </h1>
          <p style={{ fontSize: 12, color: "rgba(255,255,255,0.6)", margin: "4px 0 0", fontWeight: 500 }}>{dateStr}</p>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 10, position: "relative" }}>
          <div className="hidden sm:flex" style={{ alignItems: "center", gap: 8, background: "rgba(255,255,255,0.12)", border: "1px solid rgba(255,255,255,0.2)", borderRadius: 10, padding: "7px 12px", backdropFilter: "blur(8px)" }}>
            <DashboardSearch />
          </div>
        </div>
      </div>

      {/* ── 4 Stat Cards ───────────────────────────────── */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        {[
          {
            label: "Present Today", value: presentToday ?? 0,
            icon: Users, href: "/admin/attendance",
            color: "#16A34A", bg: "rgba(22,163,74,0.08)",
            sub: alerts.notUpdatedCount > 0 ? `${alerts.notUpdatedCount} not updated` : "All submitted",
            subColor: alerts.notUpdatedCount > 0 ? "#D97706" : "#16A34A",
          },
          {
            label: "Active Tasks", value: activeTasks ?? 0,
            icon: Target, href: "/admin/goals",
            color: "#DE1A1A", bg: "rgba(222,26,26,0.08)",
            sub: alerts.overdueTaskCount > 0 ? `${alerts.overdueTaskCount} overdue` : "All on track",
            subColor: alerts.overdueTaskCount > 0 ? "#DE1A1A" : "#16A34A",
          },
          {
            label: "Active Clients", value: activeClients ?? 0,
            icon: FolderOpen, href: "/admin/clients",
            color: "#6366F1", bg: "rgba(99,102,241,0.08)",
            sub: alerts.overdueProjectCount > 0 ? `${alerts.overdueProjectCount} delayed` : "All on track",
            subColor: alerts.overdueProjectCount > 0 ? "#DE1A1A" : "#16A34A",
          },
          {
            label: "On Leave Today", value: onLeaveTodayCount ?? 0,
            icon: CalendarOff, href: "/admin/leaves",
            color: "#D97706", bg: "rgba(217,119,6,0.08)",
            sub: (onLeaveTodayCount ?? 0) > 0 ? "View who's away" : "Nobody on leave",
            subColor: (onLeaveTodayCount ?? 0) > 0 ? "#D97706" : "#16A34A",
          },
        ].map(s => {
          const Icon = s.icon
          return (
            <Link key={s.label} href={s.href} style={{ textDecoration: "none", display: "block", height: "100%" }}>
              <div style={{ ...CARD, padding: "18px 20px", height: "100%", boxSizing: "border-box" }} className="hover:shadow-md transition-shadow">
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 14 }}>
                  <div style={{ width: 38, height: 38, borderRadius: 11, background: s.bg, display: "flex", alignItems: "center", justifyContent: "center" }}>
                    <Icon size={17} style={{ color: s.color }} />
                  </div>
                  <ArrowRight size={13} style={{ color: "#1E3A5F" }} />
                </div>
                <p style={{ fontSize: 32, fontWeight: 900, color: "#111827", margin: 0, lineHeight: 1 }}>{s.value}</p>
                <p style={{ fontSize: 12, color: "#1E3A5F", margin: "4px 0 6px", fontWeight: 600 }}>{s.label}</p>
                <p style={{ fontSize: 11, color: s.subColor, margin: 0, fontWeight: 600 }}>{s.sub}</p>
              </div>
            </Link>
          )
        })}
      </div>

      {/* ── Middle Row: Overview | Task Summary | Calendar ── */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">

        {/* Today's Overview */}
        <div style={{ ...CARD, overflow: "hidden" }}>
          <div style={{ position: "relative", height: 220, background: "#F9FAFB" }}>
            <Image
              src={characterImg}
              alt={adminName}
              fill
              style={{ objectFit: "cover", objectPosition: "top center" }}
            />
            <div style={{ position: "absolute", inset: 0, background: "linear-gradient(to bottom, transparent 55%, #FFFFFF 100%)" }} />
            <div style={{ position: "absolute", top: 12, left: 12, background: "rgba(0,0,0,0.45)", borderRadius: 8, padding: "4px 10px" }}>
              <span style={{ fontSize: 11, fontWeight: 700, color: "#FFFFFF" }}>{characterTitle}</span>
            </div>
          </div>
          <div style={{ padding: "4px 18px 18px" }}>
            <p style={{ fontSize: 11, color: "#1E3A5F", margin: "0 0 2px", fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.05em" }}>Today&apos;s Overview</p>
            <h3 style={{ fontSize: 16, fontWeight: 800, color: "#111827", margin: "0 0 8px" }}>{adminName}</h3>
            <p style={{ fontSize: 11, color: "#1E3A5F", margin: 0, lineHeight: 1.6 }}>
              {presentToday ?? 0} present · {onLeaveTodayCount ?? 0} on leave · {recentUpdates.length} updates submitted
            </p>
          </div>
        </div>

        {/* Task Summary */}
        <div style={{ ...CARD, padding: 20 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 16 }}>
            <div style={{ width: 30, height: 30, borderRadius: 9, background: "rgba(222,26,26,0.08)", display: "flex", alignItems: "center", justifyContent: "center" }}>
              <Target size={14} style={{ color: "#DE1A1A" }} />
            </div>
            <div>
              <h3 style={{ fontSize: 14, fontWeight: 800, color: "#111827", margin: 0 }}>Task Summary</h3>
              <p style={{ fontSize: 10, color: "#1E3A5F", margin: 0, fontWeight: 600 }}>All tasks overview</p>
            </div>
          </div>
          <TaskSummaryChart {...taskBreakdown} />
          <Link href="/admin/goals"
            style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 6, marginTop: 14, padding: "9px 0", borderRadius: 10, background: "rgba(222,26,26,0.06)", border: "1px solid rgba(222,26,26,0.15)", textDecoration: "none" }}>
            <span style={{ fontSize: 12, fontWeight: 700, color: "#DE1A1A" }}>Manage Tasks</span>
            <ArrowRight size={12} style={{ color: "#DE1A1A" }} />
          </Link>
        </div>

        {/* Mini Calendar */}
        <div style={{ ...CARD, padding: 20 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 16 }}>
            <div style={{ width: 30, height: 30, borderRadius: 9, background: "rgba(222,26,26,0.08)", display: "flex", alignItems: "center", justifyContent: "center" }}>
              <CalendarDays size={14} style={{ color: "#DE1A1A" }} />
            </div>
            <div>
              <h3 style={{ fontSize: 14, fontWeight: 800, color: "#111827", margin: 0 }}>Leave Calendar</h3>
              <p style={{ fontSize: 10, color: "#1E3A5F", margin: 0, fontWeight: 600 }}>Approved leaves</p>
            </div>
          </div>
          <MiniCalendar
            leaveMap={leaveCalMap}
            today={today}
            initYear={now.getFullYear()}
            initMonth={now.getMonth()}
          />
        </div>
      </div>

      {/* ── Bottom Row: Pending | Not Updated | Quick Actions | Collaboration ── */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">

        {/* Pending Approvals */}
        <PendingApprovalsCard leaves={pendingLeavesList} />

        {/* Not Updated Yesterday */}
        <div style={{ ...CARD, padding: 20 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 16 }}>
            <div style={{ width: 30, height: 30, borderRadius: 9, background: "rgba(217,119,6,0.08)", display: "flex", alignItems: "center", justifyContent: "center" }}>
              <UserX size={14} style={{ color: "#D97706" }} />
            </div>
            <h3 style={{ fontSize: 14, fontWeight: 800, color: "#111827", margin: 0 }}>Not Updated Yesterday</h3>
            {notUpdatedYesterdayNames.length > 0 && (
              <span style={{ fontSize: 11, fontWeight: 700, padding: "2px 8px", borderRadius: 99, background: "rgba(217,119,6,0.1)", color: "#D97706", marginLeft: "auto" }}>
                {notUpdatedYesterdayNames.length}
              </span>
            )}
          </div>

          {notUpdatedYesterdayNames.length === 0 ? (
            <div style={{ display: "flex", flexDirection: "column", alignItems: "center", padding: "28px 0", gap: 8 }}>
              <CheckCircle2 size={28} style={{ color: "#E5E7EB" }} />
              <p style={{ fontSize: 13, color: "#1E3A5F", margin: 0, fontWeight: 600 }}>Everyone submitted yesterday</p>
            </div>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              {notUpdatedYesterdayNames.map((name, i) => (
                <div key={i} style={{ display: "flex", alignItems: "center", gap: 10, padding: "10px 12px", borderRadius: 10, background: "rgba(217,119,6,0.05)", border: "1px solid rgba(217,119,6,0.15)" }}>
                  <div style={{ width: 32, height: 32, borderRadius: "50%", background: "rgba(217,119,6,0.12)", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                    <span style={{ fontSize: 12, fontWeight: 800, color: "#D97706" }}>{name[0].toUpperCase()}</span>
                  </div>
                  <p style={{ fontSize: 13, fontWeight: 600, color: "#111827", flex: 1, margin: 0 }}>{name}</p>
                  <span style={{ fontSize: 10, fontWeight: 700, padding: "3px 7px", borderRadius: 6, background: "rgba(217,119,6,0.1)", color: "#D97706" }}>Missed</span>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Quick Actions */}
        <div style={{ ...CARD, padding: 20 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 16 }}>
            <div style={{ width: 30, height: 30, borderRadius: 9, background: "rgba(99,102,241,0.08)", display: "flex", alignItems: "center", justifyContent: "center" }}>
              <Clock size={14} style={{ color: "#6366F1" }} />
            </div>
            <h3 style={{ fontSize: 14, fontWeight: 800, color: "#111827", margin: 0 }}>Quick Actions</h3>
          </div>
          <div className="grid grid-cols-2 gap-2">
            {quickActions.map(a => {
              const Icon = a.icon
              return (
                <Link key={a.label} href={a.href}
                  style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 6, padding: "14px 8px", borderRadius: 12, background: a.bg, border: `1px solid ${a.color}22`, textDecoration: "none", transition: "opacity 0.15s" }}
                  className="hover:opacity-80">
                  <Icon size={18} style={{ color: a.color }} />
                  <span style={{ fontSize: 11, fontWeight: 700, color: a.color, textAlign: "center", lineHeight: 1.2 }}>{a.label}</span>
                </Link>
              )
            })}
          </div>
        </div>

        {/* Team Collaboration */}
        <div style={{ ...CARD, padding: 20 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 16 }}>
            <div style={{ width: 30, height: 30, borderRadius: 9, background: "rgba(99,102,241,0.08)", display: "flex", alignItems: "center", justifyContent: "center" }}>
              <Handshake size={14} style={{ color: "#6366F1" }} />
            </div>
            <h3 style={{ fontSize: 14, fontWeight: 800, color: "#111827", margin: 0 }}>Collaboration</h3>
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
            <div style={{ padding: "14px 16px", borderRadius: 12, background: "rgba(99,102,241,0.06)", border: "1px solid rgba(99,102,241,0.15)" }}>
              <p style={{ fontSize: 28, fontWeight: 900, color: "#4F46E5", margin: 0, lineHeight: 1 }}>{collabToday}</p>
              <p style={{ fontSize: 11, color: "#1E3A5F", margin: "4px 0 0", fontWeight: 600 }}>Collaborative sessions today</p>
            </div>
            <div style={{ display: "flex", gap: 8 }}>
              <div style={{ flex: 1, padding: "10px 12px", borderRadius: 10, background: "#F9FAFB", border: "1px solid #E5E7EB" }}>
                <p style={{ fontSize: 18, fontWeight: 900, color: "#111827", margin: 0 }}>{collabMonth}</p>
                <p style={{ fontSize: 10, color: "#1E3A5F", margin: "2px 0 0", fontWeight: 600 }}>This month</p>
              </div>
              <div style={{ flex: 1, padding: "10px 12px", borderRadius: 10, background: "#F9FAFB", border: "1px solid #E5E7EB" }}>
                <p style={{ fontSize: 18, fontWeight: 900, color: "#111827", margin: 0 }}>{totalTagsMonth}</p>
                <p style={{ fontSize: 10, color: "#1E3A5F", margin: "2px 0 0", fontWeight: 600 }}>Member tags</p>
              </div>
            </div>
            <Link href="/admin/activities"
              style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 6, padding: "9px 0", borderRadius: 10, background: "rgba(99,102,241,0.06)", border: "1px solid rgba(99,102,241,0.15)", textDecoration: "none" }}>
              <span style={{ fontSize: 12, fontWeight: 700, color: "#6366F1" }}>View Activities</span>
              <ArrowRight size={12} style={{ color: "#6366F1" }} />
            </Link>
          </div>
        </div>
      </div>

      {/* ── On Leave Today ─────────────────────────────── */}
      {todayLeaves.length > 0 && (
        <div style={{ ...CARD, padding: 20 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 16 }}>
            <div style={{ width: 30, height: 30, borderRadius: 9, background: "rgba(222,26,26,0.08)", display: "flex", alignItems: "center", justifyContent: "center" }}>
              <UmbrellaOff size={14} style={{ color: "#DE1A1A" }} />
            </div>
            <h3 style={{ fontSize: 14, fontWeight: 800, color: "#111827", margin: 0 }}>On Leave Today</h3>
            <span style={{ fontSize: 11, fontWeight: 700, padding: "2px 8px", borderRadius: 99, background: "rgba(222,26,26,0.08)", color: "#DE1A1A", marginLeft: "auto" }}>
              {todayLeaves.length} {todayLeaves.length === 1 ? "person" : "people"}
            </span>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3">
            {todayLeaves.map(l => {
              const name = l.users?.name ?? "Unknown"
              const empId = l.users?.employee_id ?? ""
              const typeLabel = l.leave_type === "half_day" ? "Half Day" : l.leave_type === "permission" ? "Permission" : "Full Day"
              const typeColor = l.leave_type === "half_day" ? "#D97706" : l.leave_type === "permission" ? "#6366F1" : "#DE1A1A"
              const typeBg   = l.leave_type === "half_day" ? "rgba(217,119,6,0.08)" : l.leave_type === "permission" ? "rgba(99,102,241,0.08)" : "rgba(222,26,26,0.06)"
              return (
                <div key={l.id} style={{ display: "flex", alignItems: "center", gap: 12, padding: "12px 14px", borderRadius: 12, background: "#F9FAFB", border: "1px solid #E5E7EB" }}>
                  <div style={{ width: 36, height: 36, borderRadius: "50%", background: typeBg, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                    <span style={{ fontSize: 14, fontWeight: 800, color: typeColor }}>{name[0]?.toUpperCase()}</span>
                  </div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <p style={{ fontSize: 13, fontWeight: 700, color: "#111827", margin: 0, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{name}</p>
                    <p style={{ fontSize: 11, color: "#1E3A5F", margin: "2px 0 0", fontWeight: 600 }}>{empId}</p>
                  </div>
                  <span style={{ fontSize: 10, fontWeight: 700, padding: "3px 8px", borderRadius: 6, background: typeBg, color: typeColor, flexShrink: 0 }}>{typeLabel}</span>
                </div>
              )
            })}
          </div>
        </div>
      )}

      {/* ── Stay Productive Banner ──────────────────────── */}
      <div style={{ background: "linear-gradient(135deg, #DE1A1A 0%, #7F1D1D 100%)", borderRadius: 16, padding: "20px 24px", display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: 12, position: "relative", overflow: "hidden" }}>
        <div style={{ position: "absolute", right: -30, top: -30, width: 160, height: 160, borderRadius: "50%", background: "rgba(255,255,255,0.05)" }} />
        <div style={{ position: "absolute", right: 60, bottom: -40, width: 120, height: 120, borderRadius: "50%", background: "rgba(255,255,255,0.04)" }} />
        <div style={{ position: "relative" }}>
          <p style={{ fontSize: 18, fontWeight: 900, color: "#FFFFFF", margin: 0 }}>Stay productive! 🚀</p>
          <p style={{ fontSize: 12, color: "rgba(255,255,255,0.7)", margin: "4px 0 0", fontWeight: 500 }}>
            Great work managing your team, {firstName}. Keep the momentum going!
          </p>
        </div>
        <div style={{ display: "flex", gap: 10, position: "relative" }}>
          <Link href="/admin/activities"
            style={{ display: "flex", alignItems: "center", gap: 6, padding: "10px 18px", borderRadius: 10, background: "rgba(255,255,255,0.15)", border: "1px solid rgba(255,255,255,0.3)", textDecoration: "none" }}>
            <span style={{ fontSize: 13, fontWeight: 700, color: "#FFFFFF" }}>View Reports</span>
            <ArrowRight size={13} style={{ color: "#FFFFFF" }} />
          </Link>
          <Link href="/admin/team"
            style={{ display: "flex", alignItems: "center", gap: 6, padding: "10px 18px", borderRadius: 10, background: "#FFFFFF", textDecoration: "none" }}>
            <span style={{ fontSize: 13, fontWeight: 700, color: "#DE1A1A" }}>Manage Team</span>
          </Link>
        </div>
      </div>

    </div>
  )
}
