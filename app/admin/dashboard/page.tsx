import { createServerClient } from "@/lib/supabase/server"
import { createClient } from "@supabase/supabase-js"
import {
  Users, FolderOpen, Target, CalendarCheck, Clock, CheckCircle2,
  AlertTriangle, Plus, Megaphone, ChevronRight, TrendingUp, TrendingDown,
  Minus, ArrowRight, ListTodo, BarChart2,
} from "lucide-react"
import Link from "next/link"
import DashboardFilterBar from "./dashboard-filter"
import { getAlerts } from "@/lib/alerts"
import PendingApprovalsCard from "./pending-approvals"
import AnalyticsChart, { type ChartPoint } from "./analytics-chart"

function adminSupabase() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  )
}

type UpdateRow = {
  attendance_status: string
  work_type: string | null
  working_hours: number | null
  created_at: string
  users: { name: string; employee_id: string } | null
}

type LeaveRow = {
  id: string
  from_date: string
  to_date: string
  reason: string
  users: { name: string; employee_id: string } | null
}

export default async function DashboardPage({
  searchParams,
}: {
  searchParams: Promise<{ filter?: string; from?: string; to?: string }>
}) {
  const params    = await searchParams
  const filter    = (params.filter ?? "today") as "today" | "yesterday" | "custom"
  const supabase  = await createServerClient()
  const now       = new Date()
  const today     = now.toISOString().split("T")[0]
  const yesterday = new Date(Date.now() - 86400000).toISOString().split("T")[0]
  const monthStart = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-01`

  // Determine the selected date range from the filter
  let dateStart = today
  let dateEnd   = today
  let prevStart = yesterday
  let prevEnd   = yesterday
  let rangeLabel = "Today"

  if (filter === "yesterday") {
    dateStart = yesterday; dateEnd = yesterday
    prevStart = new Date(Date.now() - 2 * 86400000).toISOString().split("T")[0]
    prevEnd   = prevStart
    rangeLabel = "Yesterday"
  } else if (filter === "custom" && params.from && params.to) {
    dateStart = params.from; dateEnd = params.to
    rangeLabel = `${params.from} → ${params.to}`
  }

  // Last 7 days for analytics
  const last7Days = Array.from({ length: 7 }, (_, i) => {
    const d = new Date(Date.now() - (6 - i) * 86400000)
    return d.toISOString().split("T")[0]
  })
  const sevenDaysAgo = last7Days[0]

  const { data: { user } } = await supabase.auth.getUser()
  const admin = adminSupabase()
  const { data: profile } = await admin
    .from("users")
    .select("company_id")
    .eq("id", user!.id)
    .single()
  const cid = profile?.company_id as string

  const [
    { count: presentSelected },
    { count: presentPrev },
    { count: absentSelected },
    { count: activeTasks },
    { count: activeClients },
    { count: pendingLeaves },
    { data: todayUpdatesRaw },
    { data: pendingLeavesRaw },
    { data: analyticsRaw },
    { data: monthlyPerfRaw },
    alerts,
  ] = await Promise.all([
    admin.from("daily_updates").select("*", { count: "exact", head: true })
      .eq("company_id", cid).gte("date", dateStart).lte("date", dateEnd).eq("attendance_status", "present"),
    admin.from("daily_updates").select("*", { count: "exact", head: true })
      .eq("company_id", cid).gte("date", prevStart).lte("date", prevEnd).eq("attendance_status", "present"),
    admin.from("daily_updates").select("*", { count: "exact", head: true })
      .eq("company_id", cid).gte("date", dateStart).lte("date", dateEnd).eq("attendance_status", "absent"),
    supabase.from("tasks").select("*", { count: "exact", head: true }).neq("status", "completed"),
    supabase.from("projects").select("*", { count: "exact", head: true }).eq("status", "active"),
    supabase.from("leaves").select("*", { count: "exact", head: true }).eq("status", "pending"),
    admin.from("daily_updates")
      .select("attendance_status, work_type, working_hours, created_at, users(name, employee_id)")
      .eq("company_id", cid).gte("date", dateStart).lte("date", dateEnd)
      .order("created_at", { ascending: false }).limit(5),
    admin.from("leaves")
      .select("id, from_date, to_date, reason, users(name, employee_id)")
      .eq("company_id", cid).eq("status", "pending")
      .order("created_at", { ascending: false }).limit(5),
    admin.from("daily_updates")
      .select("date, attendance_status")
      .eq("company_id", cid)
      .gte("date", sevenDaysAgo),
    // Monthly performance: all present-day updates this month per member
    admin.from("daily_updates")
      .select("user_id, working_hours, users(name, employee_id)")
      .eq("company_id", cid)
      .gte("date", monthStart)
      .lte("date", today)
      .eq("attendance_status", "present"),
    cid ? getAlerts(cid) : Promise.resolve({ notUpdatedCount: 0, notUpdatedNames: [], overdueTaskCount: 0, overdueProjectCount: 0, total: 0 }),
  ])

  // Build monthly performance per member
  type PerfRow = { user_id: string; working_hours: number | null; users: { name: string; employee_id: string } | { name: string; employee_id: string }[] | null }
  const perfMap: Record<string, { name: string; employee_id: string; days: number; totalHrs: number }> = {}
  for (const row of (monthlyPerfRaw ?? []) as unknown as PerfRow[]) {
    const u = Array.isArray(row.users) ? row.users[0] : row.users
    if (!perfMap[row.user_id]) {
      perfMap[row.user_id] = { name: u?.name ?? "—", employee_id: u?.employee_id ?? "", days: 0, totalHrs: 0 }
    }
    perfMap[row.user_id].days++
    perfMap[row.user_id].totalHrs += row.working_hours ?? 0
  }
  const memberPerf = Object.values(perfMap)
    .map((m) => ({ ...m, avgHrs: m.days > 0 ? Math.round((m.totalHrs / m.days) * 10) / 10 : 0 }))
    .sort((a, b) => a.avgHrs - b.avgHrs)
  const teamAvgHrs = memberPerf.length > 0
    ? Math.round((memberPerf.reduce((s, m) => s + m.avgHrs, 0) / memberPerf.length) * 10) / 10
    : 0
  const belowTarget = memberPerf.filter((m) => m.avgHrs < 9 && m.days > 0).length

  const recentUpdates     = (todayUpdatesRaw ?? []) as unknown as UpdateRow[]
  const pendingLeavesList = (pendingLeavesRaw ?? []) as unknown as LeaveRow[]
  const presentTodayN     = presentSelected ?? 0
  const presentYesterdayN = presentPrev ?? 0
  const presentDiff       = presentTodayN - presentYesterdayN

  // Build 7-day chart data
  const chartData: ChartPoint[] = last7Days.map(day => {
    const rows = (analyticsRaw ?? []).filter((r: any) => r.date === day)
    return {
      day: new Date(day + "T12:00:00").toLocaleDateString("en-US", { weekday: "short" }),
      present: rows.filter((r: any) => r.attendance_status === "present").length,
      absent: rows.filter((r: any) => r.attendance_status === "absent").length,
    }
  })

  const hour = now.getHours()
  const greeting = hour < 12 ? "Good morning" : hour < 18 ? "Good afternoon" : "Good evening"
  const dateStr = now.toLocaleDateString("en-US", { weekday: "long", day: "numeric", month: "long", year: "numeric" })

  // Build action items
  const actionItems: { label: string; href: string; color: string; bg: string; border: string; emoji: string }[] = []
  if (alerts.notUpdatedCount > 0) {
    const names = alerts.notUpdatedNames.slice(0, 2).join(", ")
    const extra = alerts.notUpdatedCount > 2 ? ` +${alerts.notUpdatedCount - 2} more` : ""
    actionItems.push({
      label: `${alerts.notUpdatedCount} member${alerts.notUpdatedCount > 1 ? "s" : ""} didn't submit update — ${names}${extra}`,
      href: "/admin/activities", emoji: "❗",
      color: "#D97706", bg: "rgba(217,119,6,0.06)", border: "rgba(217,119,6,0.18)",
    })
  }
  if (alerts.overdueTaskCount > 0) {
    actionItems.push({
      label: `${alerts.overdueTaskCount} task${alerts.overdueTaskCount > 1 ? "s" : ""} overdue — check and reassign`,
      href: "/admin/goals", emoji: "⏰",
      color: "#DC2626", bg: "rgba(220,38,38,0.06)", border: "rgba(220,38,38,0.15)",
    })
  }
  if ((pendingLeaves ?? 0) > 0) {
    actionItems.push({
      label: `${pendingLeaves} leave request${(pendingLeaves ?? 0) > 1 ? "s" : ""} waiting for approval`,
      href: "/admin/leaves", emoji: "📝",
      color: "#DC2626", bg: "rgba(220,38,38,0.06)", border: "rgba(220,38,38,0.15)",
    })
  }
  if (alerts.overdueProjectCount > 0) {
    actionItems.push({
      label: `${alerts.overdueProjectCount} project${alerts.overdueProjectCount > 1 ? "s" : ""} past deadline`,
      href: "/admin/clients", emoji: "🚨",
      color: "#DC2626", bg: "rgba(220,38,38,0.06)", border: "rgba(220,38,38,0.15)",
    })
  }

  const stats = [
    {
      label: filter === "today" ? "Present Today" : filter === "yesterday" ? "Present Yesterday" : "Present", value: presentTodayN, icon: Users,
      href: "/admin/attendance",
      trendLabel: presentDiff > 0 ? `+${presentDiff} from yesterday` : presentDiff < 0 ? `${presentDiff} from yesterday` : "Same as yesterday",
      trendDir: presentDiff,
      accent: "#16A34A", accentBg: "rgba(22,163,74,0.1)",
    },
    {
      label: "Active Tasks", value: activeTasks ?? 0, icon: Target,
      href: "/admin/goals",
      trendLabel: alerts.overdueTaskCount > 0 ? `${alerts.overdueTaskCount} overdue` : "All on track",
      trendDir: null,
      accent: alerts.overdueTaskCount > 0 ? "#D97706" : "#DC2626",
      accentBg: alerts.overdueTaskCount > 0 ? "rgba(217,119,6,0.1)" : "rgba(220,38,38,0.1)",
    },
    {
      label: "Active Clients", value: activeClients ?? 0, icon: FolderOpen,
      href: "/admin/clients",
      trendLabel: alerts.overdueProjectCount > 0 ? `${alerts.overdueProjectCount} delayed` : "All on track",
      trendDir: null,
      accent: alerts.overdueProjectCount > 0 ? "#DC2626" : "#DC2626",
      accentBg: "rgba(220,38,38,0.1)",
    },
    {
      label: "Pending Leaves", value: pendingLeaves ?? 0, icon: CalendarCheck,
      href: "/admin/leaves",
      trendLabel: (pendingLeaves ?? 0) > 0 ? "Action needed" : "No pending",
      trendDir: null,
      accent: "#DC2626",
      accentBg: "rgba(220,38,38,0.1)",
    },
  ]

  // Analytics summary
  const totalPresent = chartData.reduce((s, d) => s + d.present, 0)
  const peakDay = chartData.reduce((a, b) => a.present >= b.present ? a : b, chartData[0])

  return (
    <div className="p-8 max-w-[1400px] space-y-5">

      {/* ── Red Gradient Header ─────────────────────────────── */}
      <div className="rounded-2xl p-6 relative overflow-hidden"
        style={{ background: "linear-gradient(135deg, #B91C1C 0%, #7F1D1D 60%, #450A0A 100%)" }}>
        {/* Decorative circles */}
        <div className="absolute top-0 right-0 w-64 h-64 rounded-full opacity-10 pointer-events-none"
          style={{ background: "radial-gradient(circle, #FFFFFF 0%, transparent 70%)", transform: "translate(30%, -40%)" }} />
        <div className="absolute bottom-0 left-1/3 w-40 h-40 rounded-full opacity-5 pointer-events-none"
          style={{ background: "radial-gradient(circle, #FFFFFF 0%, transparent 70%)", transform: "translateY(50%)" }} />

        <div className="relative space-y-4">
          <div className="flex items-start justify-between gap-4">
            <div>
              <h1 className="text-[28px] leading-tight font-black text-white">
                {greeting} 👋
              </h1>
              <p className="text-sm mt-1" style={{ color: "rgba(255,255,255,0.65)" }}>{dateStr}</p>
            </div>
            <div className="flex items-center gap-2 mt-1 flex-shrink-0">
              <Link href="/admin/team"
                className="flex items-center gap-2 px-4 py-2.5 rounded-xl text-[13px] font-semibold transition-all hover:opacity-90"
                style={{ background: "rgba(255,255,255,0.15)", border: "1px solid rgba(255,255,255,0.25)", color: "#FFFFFF" }}>
                <Plus size={14} /> Add Member
              </Link>
              <Link href="/admin/announcements"
                className="flex items-center gap-2 px-4 py-2.5 rounded-xl text-[13px] font-semibold transition-all hover:opacity-90"
                style={{ background: "rgba(255,255,255,0.15)", border: "1px solid rgba(255,255,255,0.25)", color: "#FFFFFF" }}>
                <Megaphone size={14} /> Announcement
              </Link>
              <Link href="/admin/goals"
                className="flex items-center gap-2 px-4 py-2.5 rounded-xl text-[13px] font-bold transition-all hover:opacity-90"
                style={{ background: "#FFFFFF", color: "#B91C1C" }}>
                <ListTodo size={14} /> Assign Task
              </Link>
            </div>
          </div>

          {/* Date filter */}
          <DashboardFilterBar currentFilter={filter} from={params.from} to={params.to} />
        </div>
      </div>

      {/* ── Stats Cards ────────────────────────────────────────── */}
      <div className="grid grid-cols-4 gap-4">
        {stats.map(({ label, value, icon: Icon, href, trendLabel, trendDir, accent, accentBg }) => (
          <Link key={label} href={href}
            className="rounded-2xl p-5 transition-all duration-200 hover:-translate-y-0.5 hover:shadow-md group"
            style={{ background: "#FFFFFF", border: "1px solid #F0F0F0", boxShadow: "0 1px 3px rgba(0,0,0,0.06), 0 4px 16px rgba(0,0,0,0.04)" }}>
            <div className="flex items-center justify-between mb-4">
              <div className="w-9 h-9 rounded-xl flex items-center justify-center" style={{ background: accentBg }}>
                <Icon size={16} style={{ color: accent }} />
              </div>
              <ChevronRight size={14} style={{ color: "#D1D5DB" }}
                className="group-hover:translate-x-0.5 transition-transform" />
            </div>
            <p className="text-[38px] leading-none font-black" style={{ fontFamily: "var(--font-jakarta)", color: "#111827" }}>
              {value}
            </p>
            <p className="text-[12px] font-medium mt-1.5" style={{ color: "#6B7280" }}>{label}</p>
            <p className="text-[11px] font-semibold mt-1.5 flex items-center gap-1" style={{ color: accent }}>
              {trendDir !== null && (
                trendDir > 0 ? <TrendingUp size={10} /> :
                trendDir < 0 ? <TrendingDown size={10} /> :
                <Minus size={10} />
              )}
              {trendLabel}
            </p>
          </Link>
        ))}
      </div>

      {/* ── 7-Day Analytics ────────────────────────────────────── */}
      <div className="rounded-2xl p-5" style={{ background: "#FFFFFF", border: "1px solid #F0F0F0", boxShadow: "0 1px 3px rgba(0,0,0,0.06), 0 4px 16px rgba(0,0,0,0.04)" }}>
        <div className="flex items-center justify-between mb-5">
          <div className="flex items-center gap-2.5">
            <div className="w-7 h-7 rounded-lg flex items-center justify-center"
              style={{ background: "rgba(220,38,38,0.1)" }}>
              <BarChart2 size={14} style={{ color: "#DC2626" }} />
            </div>
            <h3 className="text-[14px] font-bold" style={{ color: "#111827" }}>7-Day Attendance Trend</h3>
          </div>
          <div className="flex items-center gap-4">
            <div className="text-right">
              <p className="text-[11px] font-medium" style={{ color: "#9CA3AF" }}>Total present</p>
              <p className="text-[15px] font-black" style={{ color: "#DC2626" }}>{totalPresent}</p>
            </div>
            <div className="text-right">
              <p className="text-[11px] font-medium" style={{ color: "#9CA3AF" }}>Peak day</p>
              <p className="text-[15px] font-black" style={{ color: "#111827" }}>
                {peakDay?.day ?? "—"} <span style={{ color: "#DC2626" }}>({peakDay?.present ?? 0})</span>
              </p>
            </div>
          </div>
        </div>
        <AnalyticsChart data={chartData} />
      </div>

      {/* ── Monthly Team Performance ────────────────────────────── */}
      {memberPerf.length > 0 && (
        <div className="rounded-2xl p-5" style={{ background: "#FFFFFF", border: "1px solid #F0F0F0", boxShadow: "0 1px 3px rgba(0,0,0,0.06), 0 4px 16px rgba(0,0,0,0.04)" }}>
          <div className="flex items-center justify-between mb-5">
            <div className="flex items-center gap-2.5">
              <div className="w-7 h-7 rounded-lg flex items-center justify-center"
                style={{ background: belowTarget > 0 ? "rgba(220,38,38,0.1)" : "rgba(22,163,74,0.1)" }}>
                <Clock size={14} style={{ color: belowTarget > 0 ? "#DC2626" : "#16A34A" }} />
              </div>
              <h3 className="text-[14px] font-bold" style={{ color: "#111827" }}>Monthly Performance</h3>
              <span className="text-[11px]" style={{ color: "#9CA3AF" }}>
                {now.toLocaleString("en-US", { month: "long", year: "numeric" })} · 9h/day target · working days only
              </span>
            </div>
            <div className="flex items-center gap-3">
              <div className="text-right">
                <p className="text-[11px]" style={{ color: "#9CA3AF" }}>Team avg</p>
                <p className="text-[16px] font-black" style={{ color: teamAvgHrs >= 9 ? "#16A34A" : "#DC2626" }}>
                  {teamAvgHrs}h/day
                </p>
              </div>
              {belowTarget > 0 && (
                <span className="text-[11px] font-bold px-2.5 py-1 rounded-full"
                  style={{ background: "rgba(220,38,38,0.1)", color: "#DC2626" }}>
                  ⚠ {belowTarget} below 9h
                </span>
              )}
            </div>
          </div>

          <div className="space-y-1.5">
            {memberPerf.map((m) => {
              const pct   = Math.min((m.avgHrs / 9) * 100, 100)
              const color = m.avgHrs >= 9 ? "#16A34A" : m.avgHrs >= 7 ? "#D97706" : "#DC2626"
              const bg    = m.avgHrs >= 9 ? "rgba(22,163,74,0.05)" : m.avgHrs >= 7 ? "rgba(217,119,6,0.05)" : "rgba(220,38,38,0.04)"
              return (
                <div key={m.employee_id} className="flex items-center gap-3 px-3 py-2.5 rounded-xl" style={{ background: bg }}>
                  <div className="w-7 h-7 rounded-full flex items-center justify-center flex-shrink-0 text-[11px] font-bold"
                    style={{ background: "rgba(220,38,38,0.1)", color: "#DC2626" }}>
                    {m.name[0].toUpperCase()}
                  </div>
                  <p className="text-[12px] font-semibold flex-1 truncate" style={{ color: "#111827" }}>{m.name}</p>
                  <p className="text-[11px] flex-shrink-0" style={{ color: "#9CA3AF" }}>{m.days}d worked</p>
                  <div className="w-24 h-1.5 rounded-full overflow-hidden flex-shrink-0" style={{ background: "#E5E7EB" }}>
                    <div className="h-full rounded-full" style={{ width: `${pct}%`, background: color }} />
                  </div>
                  <span className="text-[12px] font-black w-14 text-right flex-shrink-0" style={{ color }}>
                    {m.avgHrs}h/d
                  </span>
                  {m.avgHrs < 9 && m.days > 0 && (
                    <span className="text-[10px] font-bold px-1.5 py-0.5 rounded flex-shrink-0"
                      style={{ background: "rgba(220,38,38,0.1)", color: "#DC2626" }}>⚠</span>
                  )}
                </div>
              )
            })}
          </div>
        </div>
      )}

      {/* ── Action Required ────────────────────────────────────── */}
      <div className="rounded-2xl p-5" style={{ background: "#FFFFFF", border: "1px solid #F0F0F0", boxShadow: "0 1px 3px rgba(0,0,0,0.06), 0 4px 16px rgba(0,0,0,0.04)" }}>
        <div className="flex items-center gap-2.5 mb-4">
          <div className="w-7 h-7 rounded-lg flex items-center justify-center"
            style={{ background: actionItems.length > 0 ? "rgba(220,38,38,0.1)" : "rgba(22,163,74,0.1)" }}>
            {actionItems.length > 0
              ? <AlertTriangle size={14} style={{ color: "#DC2626" }} />
              : <CheckCircle2 size={14} style={{ color: "#16A34A" }} />
            }
          </div>
          <h3 className="text-[14px] font-bold" style={{ color: "#111827" }}>Action Required</h3>
          {actionItems.length > 0 && (
            <span className="text-[11px] font-bold px-2 py-0.5 rounded-full"
              style={{ background: "rgba(220,38,38,0.1)", color: "#DC2626" }}>
              {actionItems.length} item{actionItems.length > 1 ? "s" : ""}
            </span>
          )}
        </div>
        {actionItems.length === 0 ? (
          <div className="flex items-center gap-2">
            <CheckCircle2 size={15} style={{ color: "#16A34A" }} />
            <p className="text-[13px] font-medium" style={{ color: "#6B7280" }}>
              All clear — no actions required right now.
            </p>
          </div>
        ) : (
          <div className="grid sm:grid-cols-2 gap-2">
            {actionItems.map((item, i) => (
              <Link key={i} href={item.href}
                className="flex items-center gap-3 px-4 py-3 rounded-xl transition-all hover:opacity-90"
                style={{ background: item.bg, border: `1px solid ${item.border}` }}>
                <span className="text-[15px]">{item.emoji}</span>
                <p className="text-[12px] font-semibold flex-1 leading-snug" style={{ color: item.color }}>
                  {item.label}
                </p>
                <ArrowRight size={13} style={{ color: item.color, opacity: 0.5, flexShrink: 0 }} />
              </Link>
            ))}
          </div>
        )}
      </div>

      {/* ── Team Status + Pending Approvals ────────────────────── */}
      <div className="grid grid-cols-3 gap-4">

        {/* Team Status */}
        <div className="rounded-2xl p-5" style={{ background: "#FFFFFF", border: "1px solid #F0F0F0", boxShadow: "0 1px 3px rgba(0,0,0,0.06), 0 4px 16px rgba(0,0,0,0.04)" }}>
          <div className="flex items-center gap-2 mb-4">
            <div className="w-7 h-7 rounded-lg flex items-center justify-center" style={{ background: "rgba(220,38,38,0.1)" }}>
              <Users size={14} style={{ color: "#DC2626" }} />
            </div>
            <h3 className="text-[14px] font-bold" style={{ color: "#111827" }}>Today's Team</h3>
          </div>

          {/* Counts */}
          <div className="grid grid-cols-3 gap-2 mb-4">
            <div className="text-center py-3 rounded-xl" style={{ background: "rgba(22,163,74,0.08)" }}>
              <p className="text-[26px] font-black leading-none" style={{ fontFamily: "var(--font-jakarta)", color: "#16A34A" }}>
                {presentTodayN}
              </p>
              <p className="text-[10px] font-semibold mt-1" style={{ color: "#16A34A" }}>Present</p>
            </div>
            <div className="text-center py-3 rounded-xl" style={{ background: "rgba(220,38,38,0.06)" }}>
              <p className="text-[26px] font-black leading-none" style={{ fontFamily: "var(--font-jakarta)", color: "#DC2626" }}>
                {absentSelected ?? 0}
              </p>
              <p className="text-[10px] font-semibold mt-1" style={{ color: "#DC2626" }}>Absent</p>
            </div>
            <div className="text-center py-3 rounded-xl" style={{ background: "rgba(217,119,6,0.06)" }}>
              <p className="text-[26px] font-black leading-none" style={{ fontFamily: "var(--font-jakarta)", color: "#D97706" }}>
                {alerts.notUpdatedCount}
              </p>
              <p className="text-[10px] font-semibold mt-1" style={{ color: "#D97706" }}>No Update</p>
            </div>
          </div>

          {/* Member rows */}
          <div className="space-y-1">
            {recentUpdates.slice(0, 4).map((u, i) => {
              const m = Array.isArray(u.users) ? u.users[0] : u.users
              const isPresent = u.attendance_status === "present"
              const isAbsent = u.attendance_status === "absent"
              return (
                <div key={i} className="flex items-center gap-2.5 py-1.5">
                  <div className="w-7 h-7 rounded-full flex items-center justify-center flex-shrink-0 text-[11px] font-bold"
                    style={{ background: "rgba(220,38,38,0.1)", color: "#DC2626" }}>
                    {(m?.name ?? "?")[0].toUpperCase()}
                  </div>
                  <p className="text-[12px] font-medium flex-1 truncate" style={{ color: "#374151" }}>
                    {m?.name ?? "—"}
                  </p>
                  <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full flex-shrink-0" style={
                    isPresent ? { background: "rgba(22,163,74,0.1)", color: "#16A34A" } :
                    isAbsent  ? { background: "rgba(220,38,38,0.1)", color: "#DC2626" } :
                                { background: "rgba(217,119,6,0.1)", color: "#D97706" }
                  }>
                    {u.attendance_status}
                  </span>
                </div>
              )
            })}
            {alerts.notUpdatedNames
              .slice(0, Math.max(0, 4 - recentUpdates.length))
              .map((name, i) => (
                <div key={`nu-${i}`} className="flex items-center gap-2.5 py-1.5">
                  <div className="w-7 h-7 rounded-full flex items-center justify-center flex-shrink-0 text-[11px] font-bold"
                    style={{ background: "rgba(217,119,6,0.08)", color: "#D97706" }}>
                    {name[0].toUpperCase()}
                  </div>
                  <p className="text-[12px] font-medium flex-1 truncate" style={{ color: "#374151" }}>{name}</p>
                  <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full flex-shrink-0"
                    style={{ background: "rgba(217,119,6,0.1)", color: "#D97706" }}>
                    No update
                  </span>
                </div>
              ))}
            {recentUpdates.length === 0 && alerts.notUpdatedCount === 0 && (
              <p className="text-[12px] text-center py-4" style={{ color: "#9CA3AF" }}>
                No activity yet today
              </p>
            )}
          </div>
        </div>

        {/* Pending Approvals */}
        <div className="col-span-2">
          <PendingApprovalsCard leaves={pendingLeavesList} />
        </div>
      </div>

      {/* ── Today's Updates ────────────────────────────────────── */}
      <div className="rounded-2xl p-5" style={{ background: "#FFFFFF", border: "1px solid #F0F0F0", boxShadow: "0 1px 3px rgba(0,0,0,0.06), 0 4px 16px rgba(0,0,0,0.04)" }}>
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2">
            <div className="w-7 h-7 rounded-lg flex items-center justify-center" style={{ background: "rgba(220,38,38,0.1)" }}>
              <Clock size={14} style={{ color: "#DC2626" }} />
            </div>
            <h3 className="text-[14px] font-bold" style={{ color: "#111827" }}>Today's Updates</h3>
            {recentUpdates.length > 0 && (
              <span className="text-[11px] font-semibold px-2 py-0.5 rounded-full"
                style={{ background: "rgba(220,38,38,0.1)", color: "#DC2626" }}>
                {recentUpdates.length} submitted
              </span>
            )}
          </div>
          <Link href="/admin/activities"
            className="text-[12px] font-semibold flex items-center gap-1 transition-opacity hover:opacity-70"
            style={{ color: "#DC2626" }}>
            View All <ArrowRight size={12} />
          </Link>
        </div>

        {recentUpdates.length === 0 ? (
          <div className="flex flex-col items-center py-12 gap-2">
            <Clock size={28} style={{ color: "#E5E7EB" }} />
            <p className="text-[13px]" style={{ color: "#9CA3AF" }}>No updates submitted yet today</p>
          </div>
        ) : (
          <div className="divide-y" style={{ borderColor: "#F3F4F6" }}>
            {recentUpdates.map((u, i) => {
              const m = Array.isArray(u.users) ? u.users[0] : u.users
              const isPresent = u.attendance_status === "present"
              const time = new Date(u.created_at).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit", hour12: true })
              return (
                <div key={i} className="flex items-center gap-4 py-3">
                  <div className="w-9 h-9 rounded-full flex items-center justify-center flex-shrink-0 text-[12px] font-bold"
                    style={{ background: "rgba(220,38,38,0.1)", color: "#DC2626" }}>
                    {(m?.name ?? "?")[0].toUpperCase()}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-[13px] font-semibold" style={{ color: "#111827" }}>{m?.name ?? "—"}</p>
                    <p className="text-[11px] mt-0.5" style={{ color: "#9CA3AF" }}>
                      {u.work_type ?? "—"}{u.working_hours != null ? ` · ${u.working_hours}h` : ""}
                    </p>
                  </div>
                  <p className="text-[11px] flex-shrink-0" style={{ color: "#9CA3AF" }}>{time}</p>
                  <span className="text-[11px] font-semibold px-2.5 py-1 rounded-full flex-shrink-0" style={
                    isPresent
                      ? { background: "rgba(22,163,74,0.1)", color: "#16A34A" }
                      : { background: "rgba(220,38,38,0.08)", color: "#DC2626" }
                  }>
                    {u.attendance_status}
                  </span>
                </div>
              )
            })}
          </div>
        )}
      </div>

    </div>
  )
}
