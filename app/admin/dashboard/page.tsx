import { createServerClient } from "@/lib/supabase/server"
import { createClient } from "@supabase/supabase-js"
import {
  Users, FolderOpen, Target, CalendarOff, Clock, CheckCircle2,
  AlertTriangle, Plus, Megaphone, ChevronRight, TrendingUp, TrendingDown,
  Minus, ArrowRight, ListTodo, CalendarDays, UserX, Timer,
} from "lucide-react"
import Link from "next/link"
import DashboardFilterBar from "./dashboard-filter"
import { getAlerts } from "@/lib/alerts"
import PendingApprovalsCard from "./pending-approvals"

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
  users: { name: string; employee_id: string } | { name: string; employee_id: string }[] | null
}

type LeaveRow = {
  id: string
  from_date: string
  to_date: string
  reason: string
  users: { name: string; employee_id: string } | { name: string; employee_id: string }[] | null
}

type OnLeaveRow = {
  from_date: string
  to_date: string
  users: { name: string; employee_id: string } | { name: string; employee_id: string }[] | null
}

type LateRow = {
  user_id: string
  clock_in: string
  users: { name: string; employee_id: string } | { name: string; employee_id: string }[] | null
}

type CalLeaveRow = {
  from_date: string
  to_date: string
  users: { name: string } | { name: string }[] | null
}

type PerfRow = {
  user_id: string
  working_hours: number | null
  users: { name: string; employee_id: string } | { name: string; employee_id: string }[] | null
}

function toIST(utcStr: string): string {
  return new Date(utcStr).toLocaleTimeString("en-IN", {
    hour: "numeric", minute: "2-digit", hour12: true,
    timeZone: "Asia/Kolkata",
  })
}

function latenessStr(clockInUTC: string): string {
  const d = new Date(clockInUTC)
  const utcMins = d.getUTCHours() * 60 + d.getUTCMinutes()
  const istMins = (utcMins + 330) % 1440
  const lateMins = istMins - 600 // 10:00 AM = 600 mins
  if (lateMins <= 0) return ""
  const h = Math.floor(lateMins / 60)
  const m = lateMins % 60
  return h > 0 ? `${h}h ${m}m late` : `${m}m late`
}

export default async function DashboardPage({
  searchParams,
}: {
  searchParams: Promise<{ filter?: string; from?: string; to?: string }>
}) {
  const params   = await searchParams
  const filter   = (params.filter ?? "today") as "today" | "yesterday" | "custom"
  const supabase = await createServerClient()
  const now      = new Date()
  const today    = now.toISOString().split("T")[0]
  const yesterday = new Date(Date.now() - 86400000).toISOString().split("T")[0]
  const monthStart = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-01`
  const monthEnd   = new Date(now.getFullYear(), now.getMonth() + 1, 0).toISOString().split("T")[0]
  const daysInMonth    = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate()
  const firstDayOfWeek = new Date(now.getFullYear(), now.getMonth(), 1).getDay()

  let dateStart = today, dateEnd = today
  let prevStart = yesterday, prevEnd = yesterday

  if (filter === "yesterday") {
    dateStart = yesterday; dateEnd = yesterday
    prevStart = new Date(Date.now() - 2 * 86400000).toISOString().split("T")[0]
    prevEnd   = prevStart
  } else if (filter === "custom" && params.from && params.to) {
    dateStart = params.from; dateEnd = params.to
  }

  const { data: { user } } = await supabase.auth.getUser()
  const admin = adminSupabase()
  const { data: profile } = await admin
    .from("users").select("company_id").eq("id", user!.id).single()
  const cid = profile?.company_id as string

  const [
    { count: presentSelected },
    { count: presentPrev },
    { count: absentSelected },
    { count: activeTasks },
    { count: activeClients },      // FIXED: admin client + company_id
    { count: pendingLeaves },
    { count: onLeaveTodayCount },
    { data: todayUpdatesRaw },
    { data: pendingLeavesRaw },
    { data: monthlyPerfRaw },
    { data: onLeaveTodayRaw },
    { data: lateArrivalsRaw },
    { data: monthLeavesRaw },
    alerts,
  ] = await Promise.all([
    admin.from("attendance_logs").select("*", { count: "exact", head: true })
      .eq("company_id", cid).gte("date", dateStart).lte("date", dateEnd).eq("status", "present"),
    admin.from("attendance_logs").select("*", { count: "exact", head: true })
      .eq("company_id", cid).gte("date", prevStart).lte("date", prevEnd).eq("status", "present"),
    admin.from("attendance_logs").select("*", { count: "exact", head: true })
      .eq("company_id", cid).gte("date", dateStart).lte("date", dateEnd).eq("status", "absent"),
    admin.from("tasks").select("*", { count: "exact", head: true })
      .eq("company_id", cid).neq("status", "completed"),
    // FIXED — was using session client which breaks RLS for admin
    admin.from("projects").select("*", { count: "exact", head: true })
      .eq("company_id", cid).eq("status", "active"),
    admin.from("leaves").select("*", { count: "exact", head: true })
      .eq("company_id", cid).eq("status", "pending"),
    // On leave today count
    admin.from("leaves").select("*", { count: "exact", head: true })
      .eq("company_id", cid).eq("status", "approved")
      .lte("from_date", today).gte("to_date", today),
    admin.from("daily_updates")
      .select("attendance_status, work_type, working_hours, created_at, users(name, employee_id)")
      .eq("company_id", cid).gte("date", dateStart).lte("date", dateEnd)
      .order("created_at", { ascending: false }).limit(5),
    admin.from("leaves")
      .select("id, from_date, to_date, reason, users(name, employee_id)")
      .eq("company_id", cid).eq("status", "pending")
      .order("created_at", { ascending: false }).limit(5),
    // Monthly performance data
    admin.from("daily_updates")
      .select("user_id, working_hours, users(name, employee_id)")
      .eq("company_id", cid).gte("date", monthStart).lte("date", today)
      .eq("attendance_status", "present"),
    // On leave today names
    admin.from("leaves")
      .select("from_date, to_date, users(name, employee_id)")
      .eq("company_id", cid).eq("status", "approved")
      .lte("from_date", today).gte("to_date", today),
    // Late arrivals today — clock_in after 10 AM IST (04:30 UTC)
    admin.from("attendance_logs")
      .select("user_id, clock_in, users(name, employee_id)")
      .eq("company_id", cid).eq("date", dateStart)
      .gt("clock_in", `${dateStart}T04:30:00.000Z`),
    // Approved leaves this month for calendar
    admin.from("leaves")
      .select("from_date, to_date, users(name)")
      .eq("company_id", cid).eq("status", "approved")
      .lte("from_date", monthEnd).gte("to_date", monthStart),
    cid ? getAlerts(cid) : Promise.resolve({ notUpdatedCount: 0, notUpdatedNames: [], overdueTaskCount: 0, overdueProjectCount: 0, total: 0 }),
  ])

  // Build monthly performance per member
  const perfMap: Record<string, { name: string; employee_id: string; days: number; totalHrs: number }> = {}
  for (const row of (monthlyPerfRaw ?? []) as unknown as PerfRow[]) {
    const u = Array.isArray(row.users) ? row.users[0] : row.users
    if (!perfMap[row.user_id])
      perfMap[row.user_id] = { name: u?.name ?? "—", employee_id: u?.employee_id ?? "", days: 0, totalHrs: 0 }
    perfMap[row.user_id].days++
    perfMap[row.user_id].totalHrs += row.working_hours ?? 0
  }
  const memberPerf = Object.values(perfMap)
    .map(m => ({ ...m, avgHrs: m.days > 0 ? Math.round((m.totalHrs / m.days) * 10) / 10 : 0 }))
    .sort((a, b) => b.avgHrs - a.avgHrs)
  const teamAvgHrs = memberPerf.length > 0
    ? Math.round((memberPerf.reduce((s, m) => s + m.avgHrs, 0) / memberPerf.length) * 10) / 10 : 0
  const belowTarget = memberPerf.filter(m => m.avgHrs < 9 && m.days > 0).length

  const recentUpdates = (todayUpdatesRaw ?? []) as unknown as UpdateRow[]
  // Normalize users from join (Supabase may return array) to single object for PendingApprovalsCard
  const pendingLeavesList = ((pendingLeavesRaw ?? []) as unknown as LeaveRow[]).map(l => ({
    ...l,
    users: Array.isArray(l.users) ? (l.users[0] ?? null) : l.users,
  }))
  const onLeaveTodayList  = (onLeaveTodayRaw  ?? []) as unknown as OnLeaveRow[]
  const lateArrivals      = (lateArrivalsRaw  ?? []) as unknown as LateRow[]
  const monthLeaves       = (monthLeavesRaw   ?? []) as unknown as CalLeaveRow[]

  const presentTodayN     = presentSelected ?? 0
  const presentYesterdayN = presentPrev ?? 0
  const presentDiff       = presentTodayN - presentYesterdayN

  // Build leave calendar map: day string → [names]
  const leaveCalMap: Record<string, string[]> = {}
  for (const leave of monthLeaves) {
    const u    = Array.isArray(leave.users) ? leave.users[0] : leave.users
    const name = u?.name ?? "?"
    const curr = new Date(leave.from_date + "T12:00:00")
    const end  = new Date(leave.to_date   + "T12:00:00")
    while (curr <= end) {
      const ds = curr.toISOString().split("T")[0]
      if (!leaveCalMap[ds]) leaveCalMap[ds] = []
      leaveCalMap[ds].push(name)
      curr.setDate(curr.getDate() + 1)
    }
  }

  const hour     = now.getHours()
  const greeting = hour < 12 ? "Good morning" : hour < 18 ? "Good afternoon" : "Good evening"
  const dateStr  = now.toLocaleDateString("en-US", { weekday: "long", day: "numeric", month: "long", year: "numeric" })
  const monthName = now.toLocaleString("en-US", { month: "long", year: "numeric" })

  // Build action items
  const actionItems: { label: string; href: string; color: string; bg: string; border: string; emoji: string }[] = []
  if (alerts.notUpdatedCount > 0) {
    const names = alerts.notUpdatedNames.slice(0, 2).join(", ")
    const extra = alerts.notUpdatedCount > 2 ? ` +${alerts.notUpdatedCount - 2} more` : ""
    actionItems.push({ label: `${alerts.notUpdatedCount} member${alerts.notUpdatedCount > 1 ? "s" : ""} didn't submit update — ${names}${extra}`, href: "/admin/reports", emoji: "❗", color: "#D97706", bg: "rgba(217,119,6,0.06)", border: "rgba(217,119,6,0.18)" })
  }
  if (alerts.overdueTaskCount > 0)
    actionItems.push({ label: `${alerts.overdueTaskCount} task${alerts.overdueTaskCount > 1 ? "s" : ""} overdue`, href: "/admin/goals", emoji: "⏰", color: "#de1a1a", bg: "rgba(222,26,26,0.06)", border: "rgba(222,26,26,0.15)" })
  if ((pendingLeaves ?? 0) > 0)
    actionItems.push({ label: `${pendingLeaves} leave request${(pendingLeaves ?? 0) > 1 ? "s" : ""} waiting for approval`, href: "/admin/leaves", emoji: "📝", color: "#de1a1a", bg: "rgba(222,26,26,0.06)", border: "rgba(222,26,26,0.15)" })
  if (alerts.overdueProjectCount > 0)
    actionItems.push({ label: `${alerts.overdueProjectCount} project${alerts.overdueProjectCount > 1 ? "s" : ""} past deadline`, href: "/admin/clients", emoji: "🚨", color: "#de1a1a", bg: "rgba(222,26,26,0.06)", border: "rgba(222,26,26,0.15)" })

  const onLeaveTodayNames = onLeaveTodayList.slice(0, 2).map(l => {
    const u = Array.isArray(l.users) ? l.users[0] : l.users
    return u?.name?.split(" ")[0] ?? "?"
  }).join(", ")

  const stats = [
    {
      label: filter === "today" ? "Present Today" : filter === "yesterday" ? "Present Yesterday" : "Present",
      value: presentTodayN, icon: Users, href: "/admin/attendance",
      trendLabel: presentDiff > 0 ? `+${presentDiff} from yesterday` : presentDiff < 0 ? `${presentDiff} from yesterday` : "Same as yesterday",
      trendDir: presentDiff, accent: "#16A34A", accentBg: "rgba(22,163,74,0.1)",
    },
    {
      label: "Active Tasks", value: activeTasks ?? 0, icon: Target, href: "/admin/goals",
      trendLabel: alerts.overdueTaskCount > 0 ? `${alerts.overdueTaskCount} overdue` : "All on track",
      trendDir: null, accent: alerts.overdueTaskCount > 0 ? "#D97706" : "#de1a1a",
      accentBg: alerts.overdueTaskCount > 0 ? "rgba(217,119,6,0.1)" : "rgba(222,26,26,0.1)",
    },
    {
      label: "Active Clients", value: activeClients ?? 0, icon: FolderOpen, href: "/admin/clients",
      trendLabel: alerts.overdueProjectCount > 0 ? `${alerts.overdueProjectCount} delayed` : "All on track",
      trendDir: null, accent: "#de1a1a", accentBg: "rgba(222,26,26,0.1)",
    },
    {
      label: "On Leave Today", value: onLeaveTodayCount ?? 0, icon: CalendarOff, href: "/admin/leaves",
      trendLabel: (onLeaveTodayCount ?? 0) > 0 ? onLeaveTodayNames : "Nobody on leave",
      trendDir: null,
      accent: (onLeaveTodayCount ?? 0) > 0 ? "#D97706" : "#16A34A",
      accentBg: (onLeaveTodayCount ?? 0) > 0 ? "rgba(217,119,6,0.1)" : "rgba(22,163,74,0.1)",
    },
  ]

  return (
    <div className="p-5 lg:p-7 space-y-5 w-full max-w-[1600px]">

      {/* ── Header ─────────────────────────────────────── */}
      <div className="rounded-2xl p-6 relative overflow-hidden"
        style={{ background: "linear-gradient(135deg, #B91C1C 0%, #7F1D1D 60%, #450A0A 100%)" }}>
        <div className="absolute top-0 right-0 w-64 h-64 rounded-full opacity-10 pointer-events-none"
          style={{ background: "radial-gradient(circle, #FFFFFF 0%, transparent 70%)", transform: "translate(30%, -40%)" }} />
        <div className="relative space-y-4">
          <div className="flex items-start justify-between gap-4">
            <div>
              <h1 className="text-[28px] leading-tight font-black text-white">{greeting} 👋</h1>
              <p className="text-sm mt-1" style={{ color: "rgba(255,255,255,0.65)" }}>{dateStr}</p>
            </div>
            <div className="flex flex-wrap items-center gap-2 mt-1">
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
          <DashboardFilterBar currentFilter={filter} from={params.from} to={params.to} />
        </div>
      </div>

      {/* ── Stats ──────────────────────────────────────── */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 lg:gap-4">
        {stats.map(({ label, value, icon: Icon, href, trendLabel, trendDir, accent, accentBg }) => (
          <Link key={label} href={href}
            className="stat-card group block"
            style={{ textDecoration: "none" }}>
            <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
              <div className="w-9 h-9 rounded-xl flex items-center justify-center" style={{ background: accentBg }}>
                <Icon size={16} style={{ color: accent }} />
              </div>
              <ChevronRight size={14} style={{ color: "#D1D5DB" }} className="group-hover:translate-x-0.5 transition-transform" />
            </div>
            <p className="stat-value">{value}</p>
            <p className="stat-label">{label}</p>
            <p className="text-[11px] font-semibold mt-1.5 flex items-center gap-1" style={{ color: accent }}>
              {trendDir !== null && (trendDir > 0 ? <TrendingUp size={10} /> : trendDir < 0 ? <TrendingDown size={10} /> : <Minus size={10} />)}
              {trendLabel}
            </p>
          </Link>
        ))}
      </div>

      {/* ── Not Updated + Late Arrivals ─────────────────── */}
      {(alerts.notUpdatedCount > 0 || lateArrivals.length > 0) && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">

          {alerts.notUpdatedCount > 0 && (
            <div className="rounded-2xl p-5" style={{ background: "#FFFFFF", border: "1px solid rgba(217,119,6,0.25)", boxShadow: "0 1px 3px rgba(0,0,0,0.06)" }}>
              <div className="flex items-center gap-2 mb-4">
                <div className="w-7 h-7 rounded-lg flex items-center justify-center" style={{ background: "rgba(217,119,6,0.1)" }}>
                  <UserX size={14} style={{ color: "#D97706" }} />
                </div>
                <h3 className="text-[14px] font-bold" style={{ color: "#111827" }}>Not Updated Today</h3>
                <span className="text-[11px] font-bold px-2 py-0.5 rounded-full" style={{ background: "rgba(217,119,6,0.1)", color: "#D97706" }}>
                  {alerts.notUpdatedCount}
                </span>
              </div>
              <div className="flex flex-wrap gap-2">
                {alerts.notUpdatedNames.map((name, i) => (
                  <div key={i} className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl"
                    style={{ background: "rgba(217,119,6,0.06)", border: "1px solid rgba(217,119,6,0.15)" }}>
                    <div className="w-5 h-5 rounded-full flex items-center justify-center text-[9px] font-bold"
                      style={{ background: "rgba(217,119,6,0.2)", color: "#D97706" }}>
                      {name[0].toUpperCase()}
                    </div>
                    <span className="text-[12px] font-semibold" style={{ color: "#92400E" }}>{name}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {lateArrivals.length > 0 && (
            <div className="rounded-2xl p-5" style={{ background: "#FFFFFF", border: "1px solid rgba(222,26,26,0.2)", boxShadow: "0 1px 3px rgba(0,0,0,0.06)" }}>
              <div className="flex items-center gap-2 mb-4">
                <div className="w-7 h-7 rounded-lg flex items-center justify-center" style={{ background: "rgba(222,26,26,0.1)" }}>
                  <Timer size={14} style={{ color: "#de1a1a" }} />
                </div>
                <h3 className="text-[14px] font-bold" style={{ color: "#111827" }}>Late Arrivals Today</h3>
                <span className="text-[11px] font-bold px-2 py-0.5 rounded-full" style={{ background: "rgba(222,26,26,0.1)", color: "#de1a1a" }}>
                  {lateArrivals.length} after 10 AM
                </span>
              </div>
              <div className="space-y-2">
                {lateArrivals.map((row, i) => {
                  const u    = Array.isArray(row.users) ? row.users[0] : row.users
                  const late = latenessStr(row.clock_in)
                  return (
                    <div key={i} className="flex items-center gap-3 py-1">
                      <div className="w-7 h-7 rounded-full flex items-center justify-center text-[10px] font-bold flex-shrink-0"
                        style={{ background: "rgba(222,26,26,0.1)", color: "#de1a1a" }}>
                        {(u?.name ?? "?")[0].toUpperCase()}
                      </div>
                      <p className="text-[12px] font-semibold flex-1" style={{ color: "#111827" }}>{u?.name ?? "—"}</p>
                      <span className="text-[11px] font-mono flex-shrink-0" style={{ color: "#6B7280" }}>{toIST(row.clock_in)}</span>
                      {late && (
                        <span className="text-[10px] font-bold px-1.5 py-0.5 rounded flex-shrink-0"
                          style={{ background: "rgba(222,26,26,0.1)", color: "#de1a1a" }}>{late}</span>
                      )}
                    </div>
                  )
                })}
              </div>
            </div>
          )}
        </div>
      )}

      {/* ── Team Performance ────────────────────────────── */}
      {memberPerf.length > 0 && (
        <div className="rounded-2xl p-5" style={{ background: "#FFFFFF", border: "1px solid #E5E7EB", boxShadow: "0 1px 2px rgba(0,0,0,0.04), 0 4px 12px rgba(0,0,0,0.04)" }}>
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 mb-5">
            <div className="flex items-center gap-2.5">
              <div className="w-7 h-7 rounded-lg flex items-center justify-center"
                style={{ background: belowTarget > 0 ? "rgba(222,26,26,0.1)" : "rgba(22,163,74,0.1)" }}>
                <Clock size={14} style={{ color: belowTarget > 0 ? "#de1a1a" : "#16A34A" }} />
              </div>
              <h3 className="text-[14px] font-bold" style={{ color: "#111827" }}>Team Performance</h3>
              <span className="text-[11px]" style={{ color: "#6B7280" }}>{monthName} · 9h/day target</span>
            </div>
            <div className="flex items-center gap-3">
              <div className="text-right">
                <p className="text-[11px]" style={{ color: "#6B7280" }}>Team avg</p>
                <p className="text-[16px] font-black" style={{ color: teamAvgHrs >= 9 ? "#16A34A" : "#de1a1a" }}>{teamAvgHrs}h/day</p>
              </div>
              {belowTarget > 0 && (
                <span className="text-[11px] font-bold px-2.5 py-1 rounded-full"
                  style={{ background: "rgba(222,26,26,0.1)", color: "#de1a1a" }}>
                  ⚠ {belowTarget} below 9h
                </span>
              )}
            </div>
          </div>
          <div className="space-y-1.5">
            {memberPerf.map(m => {
              const pct   = Math.min((m.avgHrs / 9) * 100, 100)
              const color = m.avgHrs >= 9 ? "#16A34A" : m.avgHrs >= 7 ? "#D97706" : "#de1a1a"
              const bg    = m.avgHrs >= 9 ? "rgba(22,163,74,0.05)" : m.avgHrs >= 7 ? "rgba(217,119,6,0.05)" : "rgba(222,26,26,0.04)"
              return (
                <div key={m.employee_id} className="flex items-center gap-3 px-3 py-2.5 rounded-xl" style={{ background: bg }}>
                  <div className="w-7 h-7 rounded-full flex items-center justify-center flex-shrink-0 text-[11px] font-bold"
                    style={{ background: "rgba(222,26,26,0.1)", color: "#de1a1a" }}>
                    {m.name[0].toUpperCase()}
                  </div>
                  <p className="text-[12px] font-semibold flex-1 truncate" style={{ color: "#111827" }}>{m.name}</p>
                  <p className="text-[11px] flex-shrink-0" style={{ color: "#6B7280" }}>{m.days}d worked</p>
                  <div className="w-32 h-1.5 rounded-full overflow-hidden flex-shrink-0" style={{ background: "#E5E7EB" }}>
                    <div className="h-full rounded-full" style={{ width: `${pct}%`, background: color }} />
                  </div>
                  <span className="text-[12px] font-black w-14 text-right flex-shrink-0" style={{ color }}>{m.avgHrs}h/d</span>
                  {m.avgHrs < 9 && m.days > 0 && (
                    <span className="text-[10px] font-bold px-1.5 py-0.5 rounded flex-shrink-0"
                      style={{ background: "rgba(222,26,26,0.1)", color: "#de1a1a" }}>⚠</span>
                  )}
                </div>
              )
            })}
          </div>
        </div>
      )}

      {/* ── Action Required ─────────────────────────────── */}
      <div className="rounded-2xl p-5" style={{ background: "#FFFFFF", border: "1px solid #E5E7EB", boxShadow: "0 1px 2px rgba(0,0,0,0.04), 0 4px 12px rgba(0,0,0,0.04)" }}>
        <div className="flex items-center gap-2.5 mb-4">
          <div className="w-7 h-7 rounded-lg flex items-center justify-center"
            style={{ background: actionItems.length > 0 ? "rgba(222,26,26,0.1)" : "rgba(22,163,74,0.1)" }}>
            {actionItems.length > 0
              ? <AlertTriangle size={14} style={{ color: "#de1a1a" }} />
              : <CheckCircle2  size={14} style={{ color: "#16A34A" }} />}
          </div>
          <h3 className="text-[14px] font-bold" style={{ color: "#111827" }}>Action Required</h3>
          {actionItems.length > 0 && (
            <span className="text-[11px] font-bold px-2 py-0.5 rounded-full"
              style={{ background: "rgba(222,26,26,0.1)", color: "#de1a1a" }}>
              {actionItems.length} item{actionItems.length > 1 ? "s" : ""}
            </span>
          )}
        </div>
        {actionItems.length === 0 ? (
          <div className="flex items-center gap-2">
            <CheckCircle2 size={15} style={{ color: "#16A34A" }} />
            <p className="text-[13px] font-medium" style={{ color: "#6B7280" }}>All clear — no actions required right now.</p>
          </div>
        ) : (
          <div className="grid sm:grid-cols-2 gap-2">
            {actionItems.map((item, i) => (
              <Link key={i} href={item.href}
                className="flex items-center gap-3 px-4 py-3 rounded-xl transition-all hover:opacity-90"
                style={{ background: item.bg, border: `1px solid ${item.border}` }}>
                <span className="text-[15px]">{item.emoji}</span>
                <p className="text-[12px] font-semibold flex-1 leading-snug" style={{ color: item.color }}>{item.label}</p>
                <ArrowRight size={13} style={{ color: item.color, opacity: 0.5, flexShrink: 0 }} />
              </Link>
            ))}
          </div>
        )}
      </div>

      {/* ── Team Status + Pending Approvals ─────────────── */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        <div className="rounded-2xl p-5" style={{ background: "#FFFFFF", border: "1px solid #E5E7EB", boxShadow: "0 1px 2px rgba(0,0,0,0.04), 0 4px 12px rgba(0,0,0,0.04)" }}>
          <div className="flex items-center gap-2 mb-1">
            <div className="w-7 h-7 rounded-lg flex items-center justify-center" style={{ background: "rgba(222,26,26,0.1)" }}>
              <Users size={14} style={{ color: "#de1a1a" }} />
            </div>
            <h3 className="text-[14px] font-bold" style={{ color: "#111827" }}>Today's Team</h3>
          </div>
          <p className="text-[10px] mb-4 px-1" style={{ color: "#6B7280" }}>
            Attendance — who signed in today
          </p>
          <div className="grid grid-cols-3 gap-2 mb-4">
            {[
              { val: presentTodayN,       label: "Present",   color: "#16A34A", bg: "rgba(22,163,74,0.08)"  },
              { val: absentSelected ?? 0, label: "Absent",    color: "#de1a1a", bg: "rgba(222,26,26,0.06)"  },
              { val: alerts.notUpdatedCount, label: "No Update", color: "#D97706", bg: "rgba(217,119,6,0.06)" },
            ].map(s => (
              <div key={s.label} className="text-center py-3 rounded-xl" style={{ background: s.bg }}>
                <p className="text-[26px] font-black leading-none" style={{ fontFamily: "var(--font-jakarta)", color: s.color }}>{s.val}</p>
                <p className="text-[10px] font-semibold mt-1" style={{ color: s.color }}>{s.label}</p>
              </div>
            ))}
          </div>
          <div className="space-y-1">
            {recentUpdates.slice(0, 4).map((u, i) => {
              const m = Array.isArray(u.users) ? u.users[0] : u.users
              return (
                <div key={i} className="flex items-center gap-2.5 py-1.5">
                  <div className="w-7 h-7 rounded-full flex items-center justify-center flex-shrink-0 text-[11px] font-bold"
                    style={{ background: "rgba(222,26,26,0.1)", color: "#de1a1a" }}>
                    {(m?.name ?? "?")[0].toUpperCase()}
                  </div>
                  <p className="text-[12px] font-medium flex-1 truncate" style={{ color: "#374151" }}>{m?.name ?? "—"}</p>
                  <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full flex-shrink-0" style={
                    u.attendance_status === "present" ? { background: "rgba(22,163,74,0.1)",  color: "#16A34A" } :
                    u.attendance_status === "absent"  ? { background: "rgba(222,26,26,0.1)",  color: "#de1a1a" } :
                                                        { background: "rgba(217,119,6,0.1)",  color: "#D97706" }
                  }>{u.attendance_status}</span>
                </div>
              )
            })}
            {alerts.notUpdatedNames.slice(0, Math.max(0, 4 - recentUpdates.length)).map((name, i) => (
              <div key={`nu-${i}`} className="flex items-center gap-2.5 py-1.5">
                <div className="w-7 h-7 rounded-full flex items-center justify-center flex-shrink-0 text-[11px] font-bold"
                  style={{ background: "rgba(217,119,6,0.08)", color: "#D97706" }}>
                  {name[0].toUpperCase()}
                </div>
                <p className="text-[12px] font-medium flex-1 truncate" style={{ color: "#374151" }}>{name}</p>
                <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full flex-shrink-0"
                  style={{ background: "rgba(217,119,6,0.1)", color: "#D97706" }}>No update</span>
              </div>
            ))}
            {recentUpdates.length === 0 && alerts.notUpdatedCount === 0 && (
              <p className="text-[12px] text-center py-4" style={{ color: "#6B7280" }}>No activity yet today</p>
            )}
          </div>
        </div>
        <div className="md:col-span-2">
          <PendingApprovalsCard leaves={pendingLeavesList} />
        </div>
      </div>

      {/* ── Today's Updates ─────────────────────────────── */}
      <div className="rounded-2xl p-5" style={{ background: "#FFFFFF", border: "1px solid #E5E7EB", boxShadow: "0 1px 2px rgba(0,0,0,0.04), 0 4px 12px rgba(0,0,0,0.04)" }}>
        <div className="flex items-center justify-between mb-1">
          <div className="flex items-center gap-2">
            <div className="w-7 h-7 rounded-lg flex items-center justify-center" style={{ background: "rgba(222,26,26,0.1)" }}>
              <Clock size={14} style={{ color: "#de1a1a" }} />
            </div>
            <h3 className="text-[14px] font-bold" style={{ color: "#111827" }}>Today's Updates</h3>
            {recentUpdates.length > 0 && (
              <span className="text-[11px] font-semibold px-2 py-0.5 rounded-full"
                style={{ background: "rgba(222,26,26,0.1)", color: "#de1a1a" }}>
                {recentUpdates.length} submitted
              </span>
            )}
          </div>
          <Link href="/admin/reports"
            className="text-[12px] font-semibold flex items-center gap-1 transition-opacity hover:opacity-70"
            style={{ color: "#de1a1a" }}>
            View All <ArrowRight size={12} />
          </Link>
        </div>
        <p className="text-[10px] mb-4 px-1" style={{ color: "#6B7280" }}>
          Daily work reports — different from attendance. Someone can sign in but not submit a report, or vice versa.
        </p>
        {recentUpdates.length === 0 ? (
          <div className="flex flex-col items-center py-12 gap-2">
            <Clock size={28} style={{ color: "#E5E7EB" }} />
            <p className="text-[13px]" style={{ color: "#6B7280" }}>No updates submitted yet today</p>
          </div>
        ) : (
          <div className="divide-y" style={{ borderColor: "#F3F4F6" }}>
            {recentUpdates.map((u, i) => {
              const m    = Array.isArray(u.users) ? u.users[0] : u.users
              const time = new Date(u.created_at).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit", hour12: true })
              return (
                <div key={i} className="flex items-center gap-4 py-3">
                  <div className="w-9 h-9 rounded-full flex items-center justify-center flex-shrink-0 text-[12px] font-bold"
                    style={{ background: "rgba(222,26,26,0.1)", color: "#de1a1a" }}>
                    {(m?.name ?? "?")[0].toUpperCase()}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-[13px] font-semibold" style={{ color: "#111827" }}>{m?.name ?? "—"}</p>
                    <p className="text-[11px] mt-0.5" style={{ color: "#6B7280" }}>
                      {u.work_type ?? "—"}{u.working_hours != null ? ` · ${u.working_hours}h` : ""}
                    </p>
                  </div>
                  <p className="text-[11px] flex-shrink-0" style={{ color: "#6B7280" }}>{time}</p>
                  <span className="text-[11px] font-semibold px-2.5 py-1 rounded-full flex-shrink-0" style={
                    u.attendance_status === "present"
                      ? { background: "rgba(22,163,74,0.1)",  color: "#16A34A" }
                      : { background: "rgba(222,26,26,0.08)", color: "#de1a1a" }
                  }>{u.attendance_status}</span>
                </div>
              )
            })}
          </div>
        )}
      </div>

      {/* ── Monthly Leave Calendar ───────────────────────── */}
      <div className="rounded-2xl p-5" style={{ background: "#FFFFFF", border: "1px solid #E5E7EB", boxShadow: "0 1px 2px rgba(0,0,0,0.04), 0 4px 12px rgba(0,0,0,0.04)" }}>
        <div className="flex items-center gap-2.5 mb-5">
          <div className="w-7 h-7 rounded-lg flex items-center justify-center" style={{ background: "rgba(222,26,26,0.1)" }}>
            <CalendarDays size={14} style={{ color: "#de1a1a" }} />
          </div>
          <h3 className="text-[14px] font-bold" style={{ color: "#111827" }}>Leave Calendar</h3>
          <span className="text-[11px]" style={{ color: "#6B7280" }}>{monthName} — approved leaves</span>
          {Object.keys(leaveCalMap).length > 0 && (
            <span className="text-[11px] font-bold px-2 py-0.5 rounded-full ml-auto"
              style={{ background: "rgba(217,119,6,0.1)", color: "#D97706" }}>
              {Object.keys(leaveCalMap).length} day{Object.keys(leaveCalMap).length > 1 ? "s" : ""} booked
            </span>
          )}
        </div>

        {/* Day headers */}
        <div className="grid grid-cols-7 gap-1 mb-1">
          {["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].map(d => (
            <div key={d} className="text-center text-[10px] font-bold py-1" style={{ color: "#6B7280" }}>{d}</div>
          ))}
        </div>

        {/* Calendar grid */}
        <div className="grid grid-cols-7 gap-1">
          {Array.from({ length: firstDayOfWeek }, (_, i) => <div key={`e-${i}`} className="h-14 rounded-lg" />)}
          {Array.from({ length: daysInMonth }, (_, i) => {
            const day    = i + 1
            const dayStr = `${monthStart.slice(0, 7)}-${String(day).padStart(2, "0")}`
            const leaves = leaveCalMap[dayStr] ?? []
            const isToday   = dayStr === today
            const dow       = new Date(dayStr + "T12:00:00").getDay()
            const isWeekend = dow === 0 || dow === 6
            return (
              <div key={day} className="h-14 rounded-lg p-1.5 flex flex-col"
                style={{
                  background: isToday ? "rgba(222,26,26,0.08)" : leaves.length > 0 ? "rgba(217,119,6,0.06)" : isWeekend ? "rgba(0,0,0,0.02)" : "#F9FAFB",
                  border: isToday ? "1.5px solid rgba(222,26,26,0.3)" : leaves.length > 0 ? "1px solid rgba(217,119,6,0.2)" : "1px solid #E5E7EB",
                }}>
                <p className="text-[11px] font-bold leading-none" style={{ color: isToday ? "#de1a1a" : isWeekend ? "#D1D5DB" : "#374151" }}>
                  {day}
                </p>
                {leaves.length > 0 && (
                  <div className="flex flex-wrap gap-0.5 mt-0.5">
                    {leaves.slice(0, 2).map((name, li) => (
                      <span key={li} className="text-[8px] font-bold px-1 py-0.5 rounded leading-none"
                        style={{ background: "rgba(217,119,6,0.15)", color: "#D97706" }}>
                        {name.split(" ")[0]}
                      </span>
                    ))}
                    {leaves.length > 2 && (
                      <span className="text-[8px] font-bold leading-none" style={{ color: "#6B7280" }}>+{leaves.length - 2}</span>
                    )}
                  </div>
                )}
              </div>
            )
          })}
        </div>
      </div>

    </div>
  )
}
