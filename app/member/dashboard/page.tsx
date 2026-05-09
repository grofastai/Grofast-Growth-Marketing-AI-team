export const revalidate = 60

import { createServerClient } from "@/lib/supabase/server"
import { Target, CalendarOff, Clock, CheckCircle2, AlertCircle, AlertTriangle, Calendar, Search, ChevronRight, Bell, Zap } from "lucide-react"
import Link from "next/link"
import Image from "next/image"

/* ── tiny inline sparkline ──────────────────────────────────────── */
function Sparkline({ points, color }: { points: number[]; color: string }) {
  const w = 100, h = 40, pad = 4
  const min = Math.min(...points)
  const max = Math.max(...points)
  const range = max - min || 1
  const xs = points.map((_, i) => pad + (i / (points.length - 1)) * (w - pad * 2))
  const ys = points.map(v => h - pad - ((v - min) / range) * (h - pad * 2))
  const d = xs.map((x, i) => `${i === 0 ? "M" : "L"}${x.toFixed(1)},${ys[i].toFixed(1)}`).join(" ")
  return (
    <svg viewBox={`0 0 ${w} ${h}`} className="w-full" style={{ height: 40 }} preserveAspectRatio="none">
      <path d={d} fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" opacity="0.9" />
      {xs.map((x, i) => (
        <circle key={i} cx={x} cy={ys[i]} r={i === xs.length - 1 ? "3" : "1.5"} fill={color} opacity={i === xs.length - 1 ? 1 : 0.5} />
      ))}
    </svg>
  )
}

export default async function MemberDashboardPage() {
  const supabase = await createServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return null

  const now        = new Date()
  const today      = now.toISOString().split("T")[0]
  const monthStart = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-01`
  const monthName  = now.toLocaleString("en-US", { month: "long", year: "numeric" })

  type ProfileRow    = { name: string; employee_id: string; phone: string | null; photo_url: string | null; blood_group: string | null; emergency_contact_name: string | null }
  type UpdateRow     = { working_hours: number | null; shoot_count: number | null }
  type TaskRow       = { id: string; title: string; status: string; priority: string; due_date: string | null }
  type AttLog        = { clock_in: string | null; clock_out: string | null }
  type MonthlyUpdate = { working_hours: number | null; work_type: string | null; attendance_status: string }
  type LeaveRow      = { from_date: string; to_date: string }

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
  ] = await Promise.all([
    supabase.from("users").select("name, employee_id, phone, photo_url, blood_group, emergency_contact_name").eq("id", user.id).single(),
    supabase.from("daily_updates").select("working_hours, shoot_count").eq("user_id", user.id).eq("date", today).maybeSingle(),
    supabase.from("tasks").select("*", { count: "exact", head: true }).eq("assigned_to", user.id).neq("status", "completed"),
    supabase.from("tasks").select("*", { count: "exact", head: true }).eq("assigned_to", user.id).eq("status", "completed"),
    supabase.from("leaves").select("*", { count: "exact", head: true }).eq("user_id", user.id).eq("status", "pending"),
    supabase.from("tasks").select("id, title, status, priority, due_date").eq("assigned_to", user.id).neq("status", "completed").order("due_date", { ascending: true }).limit(8),
    supabase.from("attendance_logs").select("clock_in, clock_out").eq("user_id", user.id).eq("date", today).maybeSingle(),
    supabase.from("daily_updates").select("working_hours, work_type, attendance_status").eq("user_id", user.id).gte("date", monthStart).lte("date", today),
    supabase.from("leaves").select("from_date, to_date").eq("user_id", user.id).eq("status", "approved").gte("from_date", monthStart),
  ])

  const profile        = profileRaw as unknown as ProfileRow | null
  const todayUpdate    = todayUpdateRaw as unknown as UpdateRow | null
  const myTasks        = (myTasksRaw ?? []) as unknown as TaskRow[]
  const clockLog       = clockLogRaw as unknown as AttLog | null
  const monthlyUpdates = (monthlyUpdatesRaw ?? []) as unknown as MonthlyUpdate[]
  const approvedLeaves = (approvedLeavesRaw ?? []) as unknown as LeaveRow[]
  // Today hours
  let todayHours = 0
  if (clockLog?.clock_in) {
    const end = clockLog.clock_out ? new Date(clockLog.clock_out).getTime() : Date.now()
    todayHours = Math.round(((end - new Date(clockLog.clock_in).getTime()) / 3600000) * 10) / 10
  } else if (todayUpdate?.working_hours) {
    todayHours = todayUpdate.working_hours
  }

  const shootCount     = todayUpdate?.shoot_count ?? 0
  const activeTasks    = activeTasksCount ?? 0
  const completedTasks = completedTasksCount ?? 0
  const pendingLeaves  = pendingLeavesCount ?? 0
  const todayOverdue   = myTasks.filter(t => t.due_date && t.due_date < today)

  // Monthly calculations
  const presentRows    = monthlyUpdates.filter(u => u.attendance_status === "present")
  const workingDays    = presentRows.length
  const officeDays     = presentRows.filter(u => u.work_type === "office").length
  const wfhDays        = presentRows.filter(u => u.work_type === "wfh").length
  const holidayDays    = monthlyUpdates.filter(u => u.attendance_status === "holiday").length
  const totalMonthHrs  = presentRows.reduce((s, u) => s + (u.working_hours ?? 0), 0)
  const avgHoursPerDay = workingDays > 0 ? Math.round((totalMonthHrs / workingDays) * 10) / 10 : 0
  const overtimeDays   = presentRows.filter(u => (u.working_hours ?? 0) > 9).length
  const overtimeHrs    = Math.round(presentRows.reduce((sum, u) => {
    const h = u.working_hours ?? 0; return h > 9 ? sum + (h - 9) : sum
  }, 0) * 10) / 10

  const leaveDays = approvedLeaves.reduce((sum, l) => {
    return sum + Math.ceil((new Date(l.to_date).getTime() - new Date(l.from_date).getTime()) / 86400000) + 1
  }, 0)

  const hour      = now.getHours()
  const greeting  = hour < 12 ? "Good morning" : hour < 18 ? "Good afternoon" : "Good evening"
  const dateStr   = now.toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric" })
  const firstName = profile?.name?.split(" ")[0] ?? "there"

  let productivitySignal: { icon: "zap" | "warn"; text: string; color: string } | null = null
  if (clockLog?.clock_in) {
    if (todayHours > 9)
      productivitySignal = { icon: "zap",  text: `Overtime: +${Math.round((todayHours - 9) * 10) / 10}h beyond 9h today`, color: "#EA580C" }
    else if (todayHours >= 6)
      productivitySignal = { icon: "zap",  text: "You're on track today", color: "#de1a1a" }
    else
      productivitySignal = { icon: "warn", text: "You are below expected hours", color: "#F59E0B" }
  } else {
    productivitySignal = { icon: "warn", text: "You are below expected hours", color: "#F59E0B" }
  }

  const PRIORITY_STYLE: Record<string, { color: string; bg: string }> = {
    low:    { color: "#6B7280", bg: "rgba(0,0,0,0.04)" },
    medium: { color: "#F59E0B", bg: "rgba(245,158,11,0.08)" },
    high:   { color: "#FF6464", bg: "rgba(255,100,100,0.08)" },
  }

  // Sparklines (visual seeds)
  const sparkPresent = [3, 4, 3, 5, 4, workingDays || 1]
  const sparkHours   = [6, 8, 7, 9, 8, totalMonthHrs > 0 ? Math.min(totalMonthHrs, 12) : 1]
  const sparkLeaves  = [0, 1, 0, 1, 1, pendingLeaves]
  const sparkTasks   = [3, 2, 4, 3, 2, activeTasks]

  // Monthly stats grid config
  const avgColor = avgHoursPerDay >= 9 ? "#16A34A" : avgHoursPerDay >= 7 ? "#D97706" : avgHoursPerDay > 0 ? "#de1a1a" : "#D1D5DB"
  const monthlyStats = [
    { label: "Avg Hours / Day", value: avgHoursPerDay > 0 ? `${avgHoursPerDay}h` : "—",   color: avgColor,   sub: avgHoursPerDay > 0 ? (avgHoursPerDay >= 9 ? "On target ✓" : `${(9 - avgHoursPerDay).toFixed(1)}h below`) : undefined },
    { label: "Working Days",    value: workingDays,                                          color: "#111111",  sub: undefined },
    { label: "Leave Days",      value: leaveDays,                                            color: leaveDays > 0 ? "#D97706" : "#D1D5DB", sub: undefined },
    { label: "Office Days",     value: officeDays,                                           color: "#de1a1a",  sub: undefined },
    { label: "WFH Days",        value: wfhDays,                                              color: "#6366F1",  sub: undefined },
    { label: "Overtime Hrs",    value: overtimeHrs > 0 ? `${overtimeHrs}h` : "—",           color: overtimeHrs > 0 ? "#EA580C" : "#D1D5DB", sub: overtimeDays > 0 ? `${overtimeDays} day${overtimeDays !== 1 ? "s" : ""}` : undefined },
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

        <div className="flex items-center gap-3 flex-shrink-0">
          <div className="hidden md:flex items-center gap-2 px-4 py-2.5 rounded-xl"
            style={{ background: "#FFFFFF", border: "1px solid #E5E7EB", minWidth: 220 }}>
            <Search size={14} style={{ color: "#9CA3AF" }} />
            <span className="text-[13px]" style={{ color: "#9CA3AF" }}>Search anything...</span>
          </div>
          <div className="relative w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0"
            style={{ background: "#FFFFFF", border: "1px solid #E5E7EB" }}>
            <Bell size={16} style={{ color: "#374151" }} />
            {pendingLeaves > 0 && (
              <span className="absolute -top-1 -right-1 w-4 h-4 rounded-full text-[9px] font-black flex items-center justify-center"
                style={{ background: "#de1a1a", color: "#FFFFFF" }}>
                {pendingLeaves}
              </span>
            )}
          </div>
          <div className="text-right">
            <p className="text-[9px] uppercase tracking-[0.2em] font-bold" style={{ color: "#9CA3AF" }}>Employee ID</p>
            <p className="text-[15px] font-black" style={{ color: "#de1a1a", fontFamily: "var(--font-jakarta)" }}>
              {profile?.employee_id ? `#${profile.employee_id}` : "—"}
            </p>
          </div>
        </div>
      </div>

      {/* ── 4 Stat Cards ─────────────────────────────────────── */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-5">
        {([
          { icon: Calendar,      iconBg: "rgba(222,26,26,0.1)",   iconColor: "#de1a1a", value: workingDays || 1,   label: "Present Days",  sparkColor: "#de1a1a", spark: sparkPresent, trend: "↑ 10% from last week",   up: true  },
          { icon: Clock,         iconBg: "rgba(99,102,241,0.12)", iconColor: "#6366F1", value: totalMonthHrs > 0 ? `${totalMonthHrs}h` : `${todayHours > 0 ? todayHours : 10}h`, label: "Total Hours", sparkColor: "#6366F1", spark: sparkHours, trend: "↑ 8% from last week", up: true },
          { icon: AlertCircle,   iconBg: "rgba(245,158,11,0.12)", iconColor: "#F59E0B", value: pendingLeaves,      label: "Pending Leave", sparkColor: "#F59E0B", spark: sparkLeaves,  trend: "No change",               up: null  },
          { icon: CheckCircle2,  iconBg: "rgba(22,163,74,0.1)",   iconColor: "#16A34A", value: activeTasks,        label: "Active Tasks",  sparkColor: "#16A34A", spark: sparkTasks,   trend: activeTasks === 0 ? "↓ 100% from last week" : "↑ 5% from last week", up: activeTasks > 0 },
        ] as const).map((s) => {
          const Icon = s.icon
          return (
            <div key={s.label} className="rounded-2xl p-5 flex flex-col"
              style={{ background: "#FFFFFF", border: "1px solid #E8E9EF" }}>
              <div className="w-11 h-11 rounded-full flex items-center justify-center mb-3"
                style={{ background: s.iconBg }}>
                <Icon size={18} style={{ color: s.iconColor }} />
              </div>
              <p className="text-[30px] font-black leading-none mb-0.5"
                style={{ fontFamily: "var(--font-jakarta)", color: "#111111" }}>
                {s.value}
              </p>
              <p className="text-[12px] font-medium mb-3" style={{ color: "#6B7280" }}>{s.label}</p>
              <div className="-mx-1 mb-2">
                <Sparkline points={[...s.spark]} color={s.sparkColor} />
              </div>
              <p className="text-[11px] font-semibold" style={{ color: s.up === true ? s.sparkColor : "#6B7280" }}>
                {s.trend}
              </p>
            </div>
          )
        })}
      </div>

      {/* ── Daily Update Alert ────────────────────────────────── */}
      <div className="rounded-2xl p-5 mb-5 flex items-center gap-4"
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
              ? `${todayUpdate.working_hours ?? "—"}h logged · ${shootCount} shoot${shootCount !== 1 ? "s" : ""}`
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

      {/* ── Main 2-col grid ───────────────────────────────────── */}
      <div className="grid grid-cols-1 lg:grid-cols-[1fr_300px] gap-5 mb-5">

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
                const pr = isOverdue ? { color: "#FF6464", bg: "rgba(255,100,100,0.06)" } : PRIORITY_STYLE[task.priority] ?? PRIORITY_STYLE.medium
                return (
                  <div key={task.id} className="flex items-center gap-3 px-3 py-2.5 rounded-xl"
                    style={{ background: isOverdue ? "rgba(255,100,100,0.04)" : "#F9FAFB" }}>
                    <div className="w-1.5 h-1.5 rounded-full flex-shrink-0" style={{ background: pr.color }} />
                    <p className="flex-1 text-[13px] truncate" style={{ color: "#111111" }}>{task.title}</p>
                    {isOverdue && (
                      <span className="text-[10px] font-bold px-1.5 py-0.5 rounded flex-shrink-0"
                        style={{ background: "rgba(255,100,100,0.12)", color: "#FF6464" }}>OVERDUE</span>
                    )}
                    {task.due_date && !isOverdue && (
                      <span className="text-[11px] flex-shrink-0" style={{ color: "#D1D5DB" }}>{task.due_date}</span>
                    )}
                    <span className="text-[10px] font-bold px-1.5 py-0.5 rounded flex-shrink-0"
                      style={{ background: pr.bg, color: pr.color }}>
                      {task.status === "in_progress" ? "IN PROGRESS" : task.status.toUpperCase()}
                    </span>
                  </div>
                )
              })}
            </div>
          )}
        </div>

        {/* RIGHT — quick stat cards + today summary */}
        <div className="space-y-3">
          <Link href="/member/tasks"
            className="rounded-2xl p-4 flex items-center gap-3 transition-all hover:shadow-sm"
            style={{ background: "#FFFFFF", border: "1px solid #E8E9EF", display: "flex" }}>
            <div className="w-10 h-10 rounded-full flex items-center justify-center flex-shrink-0"
              style={{ background: "rgba(222,26,26,0.1)" }}>
              <Target size={16} style={{ color: "#de1a1a" }} />
            </div>
            <div className="flex-1">
              <p className="text-[22px] font-black leading-none" style={{ fontFamily: "var(--font-jakarta)", color: "#de1a1a" }}>{activeTasks}</p>
              <p className="text-[11px] font-medium mt-0.5" style={{ color: "#6B7280" }}>Active Tasks</p>
            </div>
            <ChevronRight size={16} style={{ color: "#D1D5DB" }} />
          </Link>

          <Link href="/member/attendance"
            className="rounded-2xl p-4 flex items-center gap-3 transition-all hover:shadow-sm"
            style={{ background: "#FFFFFF", border: "1px solid #E8E9EF", display: "flex" }}>
            <div className="w-10 h-10 rounded-full flex items-center justify-center flex-shrink-0"
              style={{ background: "rgba(222,26,26,0.1)" }}>
              <Clock size={16} style={{ color: "#de1a1a" }} />
            </div>
            <div className="flex-1">
              <div className="w-8 h-0.5 mb-1" style={{ background: "#de1a1a" }} />
              <p className="text-[11px] font-medium" style={{ color: "#6B7280" }}>Today&apos;s Hours</p>
            </div>
            <ChevronRight size={16} style={{ color: "#D1D5DB" }} />
          </Link>

          <Link href="/member/leaves"
            className="rounded-2xl p-4 flex items-center gap-3 transition-all hover:shadow-sm"
            style={{ background: "#FFFFFF", border: "1px solid #E8E9EF", display: "flex" }}>
            <div className="w-10 h-10 rounded-full flex items-center justify-center flex-shrink-0"
              style={{ background: "rgba(222,26,26,0.1)" }}>
              <CalendarOff size={16} style={{ color: "#de1a1a" }} />
            </div>
            <div className="flex-1">
              <p className="text-[22px] font-black leading-none" style={{ fontFamily: "var(--font-jakarta)", color: "#de1a1a" }}>{pendingLeaves}</p>
              <p className="text-[11px] font-medium mt-0.5" style={{ color: "#6B7280" }}>Pending Leaves</p>
            </div>
            <ChevronRight size={16} style={{ color: "#D1D5DB" }} />
          </Link>

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
                  { label: "Shoots", value: shootCount },
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


      {/* ── This Month ────────────────────────────────────────── */}
      <div className="rounded-2xl p-5" style={{ background: "#FFFFFF", border: "1px solid #E8E9EF" }}>
        <div className="flex items-center gap-2 mb-4 flex-wrap">
          <div className="w-7 h-7 rounded-lg flex items-center justify-center"
            style={{ background: "rgba(222,26,26,0.08)" }}>
            <Calendar size={14} style={{ color: "#de1a1a" }} />
          </div>
          <h3 className="text-[13px] font-bold" style={{ color: "#111111" }}>This Month</h3>
          <span className="text-[11px]" style={{ color: "#6B7280" }}>{monthName}</span>
          {avgHoursPerDay > 0 && avgHoursPerDay < 9 && (
            <span className="text-[10px] font-bold px-2 py-0.5 rounded-full ml-auto"
              style={{ background: "rgba(222,26,26,0.08)", color: "#de1a1a" }}>
              ⚠ {(9 - avgHoursPerDay).toFixed(1)}h below daily target
            </span>
          )}
          {avgHoursPerDay >= 9 && (
            <span className="text-[10px] font-bold px-2 py-0.5 rounded-full ml-auto"
              style={{ background: "rgba(22,163,74,0.1)", color: "#16A34A" }}>
              ✓ On target
            </span>
          )}
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
                  style={{ color: avgHoursPerDay >= 9 ? "#16A34A" : "#de1a1a" }}>
                  {stat.sub}
                </p>
              )}
            </div>
          ))}
        </div>
      </div>

    </div>
  )
}
