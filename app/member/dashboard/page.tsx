export const revalidate = 60

import { createServerClient } from "@/lib/supabase/server"
import { Target, CalendarOff, Clock, CheckCircle2, AlertCircle, Zap, AlertTriangle, Calendar } from "lucide-react"
import Link from "next/link"

export default async function MemberDashboardPage() {
  const supabase = await createServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return null

  const now      = new Date()
  const today    = now.toISOString().split("T")[0]
  const monthStart = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-01`
  const monthName  = now.toLocaleString("en-US", { month: "long", year: "numeric" })

  type ProfileRow     = { name: string; employee_id: string }
  type UpdateRow      = { working_hours: number | null; shoot_count: number | null }
  type TaskRow        = { id: string; title: string; status: string; priority: string; due_date: string | null }
  type AttLog         = { clock_in: string | null; clock_out: string | null }
  type MonthlyUpdate  = { working_hours: number | null; work_type: string | null; attendance_status: string }
  type LeaveRow       = { from_date: string; to_date: string }
  type AnnRow         = { id: string; title: string; message: string }

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
    { data: announcementsRaw },
  ] = await Promise.all([
    supabase.from("users").select("name, employee_id").eq("id", user.id).single(),
    supabase.from("daily_updates").select("working_hours, shoot_count").eq("user_id", user.id).eq("date", today).maybeSingle(),
    supabase.from("tasks").select("*", { count: "exact", head: true }).eq("assigned_to", user.id).neq("status", "completed"),
    supabase.from("tasks").select("*", { count: "exact", head: true }).eq("assigned_to", user.id).eq("status", "completed"),
    supabase.from("leaves").select("*", { count: "exact", head: true }).eq("user_id", user.id).eq("status", "pending"),
    supabase.from("tasks").select("id, title, status, priority, due_date").eq("assigned_to", user.id).neq("status", "completed").order("due_date", { ascending: true }).limit(8),
    supabase.from("attendance_logs").select("clock_in, clock_out").eq("user_id", user.id).eq("date", today).maybeSingle(),
    supabase.from("daily_updates").select("working_hours, work_type, attendance_status").eq("user_id", user.id).gte("date", monthStart).lte("date", today),
    supabase.from("leaves").select("from_date, to_date").eq("user_id", user.id).eq("status", "approved").gte("from_date", monthStart),
    supabase.from("announcements").select("id, title, message").order("pinned", { ascending: false }).order("created_at", { ascending: false }).limit(5),
  ])

  const profile         = profileRaw as unknown as ProfileRow | null
  const todayUpdate     = todayUpdateRaw as unknown as UpdateRow | null
  const myTasks         = (myTasksRaw ?? []) as unknown as TaskRow[]
  const clockLog        = clockLogRaw as unknown as AttLog | null
  const monthlyUpdates  = (monthlyUpdatesRaw ?? []) as unknown as MonthlyUpdate[]
  const approvedLeaves  = (approvedLeavesRaw ?? []) as unknown as LeaveRow[]
  const announcements   = (announcementsRaw ?? []) as unknown as AnnRow[]

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
  const todayOverdue   = myTasks.filter(t => t.due_date && t.due_date < today)

  // Monthly calculations — only count 'present' days for hours avg
  const presentRows    = monthlyUpdates.filter(u => u.attendance_status === "present")
  const workingDays    = presentRows.length
  const officeDays     = presentRows.filter(u => u.work_type === "office").length
  const wfhDays        = presentRows.filter(u => u.work_type === "wfh").length
  const holidayDays    = monthlyUpdates.filter(u => u.attendance_status === "holiday").length
  const totalMonthHrs  = presentRows.reduce((s, u) => s + (u.working_hours ?? 0), 0)
  const avgHoursPerDay = workingDays > 0 ? Math.round((totalMonthHrs / workingDays) * 10) / 10 : 0

  // Leave days — sum date ranges of approved leaves this month
  const leaveDays = approvedLeaves.reduce((sum, l) => {
    const days = Math.ceil((new Date(l.to_date).getTime() - new Date(l.from_date).getTime()) / 86400000) + 1
    return sum + days
  }, 0)

  const hour      = now.getHours()
  const greeting  = hour < 12 ? "Good morning" : hour < 18 ? "Good afternoon" : "Good evening"
  const dateStr   = now.toLocaleDateString("en-US", { weekday: "long", day: "numeric", month: "long" })
  const firstName = profile?.name?.split(" ")[0] ?? user.email?.split("@")[0] ?? "there"

  let productivitySignal: { icon: "zap" | "warn"; text: string; color: string } | null = null
  if (clockLog?.clock_in) {
    if (todayHours >= 6)
      productivitySignal = { icon: "zap",  text: "You're on track today",        color: "#DC2626" }
    else if (todayHours < 4)
      productivitySignal = { icon: "warn", text: "You are below expected hours", color: "#F59E0B" }
  }

  const PRIORITY_STYLE: Record<string, { color: string; bg: string }> = {
    low:    { color: "#9CA3AF", bg: "rgba(0,0,0,0.03)" },
    medium: { color: "#F59E0B", bg: "rgba(245,158,11,0.08)" },
    high:   { color: "#FF6464", bg: "rgba(255,100,100,0.08)" },
  }

  // Monthly stats config
  const avgColor = avgHoursPerDay >= 9 ? "#16A34A" : avgHoursPerDay >= 7 ? "#D97706" : avgHoursPerDay > 0 ? "#DC2626" : "#D1D5DB"
  const monthlyStats = [
    { label: "Avg Hours / Day", value: avgHoursPerDay > 0 ? `${avgHoursPerDay}h` : "—", color: avgColor, sub: avgHoursPerDay > 0 ? (avgHoursPerDay >= 9 ? "On target ✓" : `${(9 - avgHoursPerDay).toFixed(1)}h below 9h`) : undefined },
    { label: "Working Days",    value: workingDays,  color: "#111111" },
    { label: "Leave Days",      value: leaveDays,    color: leaveDays > 0 ? "#D97706" : "#D1D5DB" },
    { label: "Office Days",     value: officeDays,   color: "#DC2626" },
    { label: "WFH Days",        value: wfhDays,      color: "#6366F1" },
    { label: "Holidays",        value: holidayDays,  color: "#9CA3AF" },
  ]

  // Duplicate announcements text for seamless marquee loop
  const annTicker = announcements.map(a => `${a.title}: ${a.message}`).join("   ·   ")

  return (
    <div className="p-6 md:p-8 max-w-[1400px]">

      {/* ── Announcements Ticker ── */}
      {announcements.length > 0 && (
        <div className="overflow-hidden rounded-xl mb-5 flex items-center gap-0"
          style={{ background: "linear-gradient(90deg, #7F1D1D 0%, #DC2626 100%)", height: "38px" }}>
          <div className="flex-shrink-0 flex items-center gap-1.5 px-3 border-r"
            style={{ borderColor: "rgba(255,255,255,0.2)", height: "100%" }}>
            <span className="text-[10px] font-black uppercase tracking-[0.2em]" style={{ color: "rgba(255,255,255,0.9)" }}>News</span>
          </div>
          <div className="flex-1 overflow-hidden relative">
            <div className="marquee-track whitespace-nowrap">
              <span className="text-[12px] font-medium px-6" style={{ color: "rgba(255,255,255,0.92)" }}>
                {annTicker}&nbsp;&nbsp;&nbsp;·&nbsp;&nbsp;&nbsp;{annTicker}
              </span>
            </div>
          </div>
        </div>
      )}

      {/* ── Header ── */}
      <div className="mb-7">
        <div className="flex items-start justify-between">
          <div>
            <h1 className="gradient-heading text-[28px] md:text-[32px] leading-tight font-black"
              style={{ fontFamily: "var(--font-jakarta)" }}>
              {greeting}, {firstName}
            </h1>
            <p className="text-[13px] mt-1" style={{ color: "#9CA3AF" }}>{dateStr}</p>
          </div>
          <div className="text-right mt-1">
            <p className="text-[9px] uppercase tracking-[0.2em] font-bold mb-1"
              style={{ color: "rgba(0,0,0,0.08)" }}>Employee ID</p>
            <p className="text-[14px] font-black"
              style={{ fontFamily: "var(--font-jakarta)", color: "#DC2626" }}>
              {profile?.employee_id ? `#${profile.employee_id}` : "—"}
            </p>
          </div>
        </div>
        {activeTasks > 0 && (
          <p className="text-[12px] mt-2 font-medium" style={{ color: "#9CA3AF" }}>
            Today&apos;s focus:&nbsp;
            <span style={{ color: "#DC2626" }}>{activeTasks} task{activeTasks > 1 ? "s" : ""} pending</span>
          </p>
        )}
      </div>

      {/* ── 4-stat Summary Row ── */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-5">
        {[
          { label: "Present Days",   value: workingDays,                                   color: "#DC2626" },
          { label: "Total Hours",    value: totalMonthHrs > 0 ? `${totalMonthHrs}h` : "—", color: "#6366F1" },
          { label: "Pending Leave",  value: pendingLeavesCount ?? 0,                        color: "#F59E0B" },
          { label: "Active Tasks",   value: activeTasks,                                    color: "#16A34A" },
        ].map((s) => (
          <div key={s.label} className="rounded-xl p-4"
            style={{ background: "#FFFFFF", border: "1px solid #F0F0F0" }}>
            <p className="text-[24px] font-black leading-none mb-1"
              style={{ fontFamily: "var(--font-jakarta)", color: s.color }}>{s.value}</p>
            <p className="text-[11px] font-medium" style={{ color: "#9CA3AF" }}>{s.label}</p>
          </div>
        ))}
      </div>

      {/* ── 2-column grid ── */}
      <div className="grid grid-cols-1 lg:grid-cols-[1fr_360px] gap-5">

        {/* ── LEFT ── */}
        <div className="space-y-5">

          {/* Daily Update */}
          <div className="rounded-xl p-5" style={{
            background: "#FFFFFF",
            border: todayUpdate ? "1px solid rgba(220,38,38,0.2)" : "1px solid rgba(245,158,11,0.25)",
          }}>
            <div className="flex items-center justify-between gap-4">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-lg flex items-center justify-center flex-shrink-0"
                  style={{ background: todayUpdate ? "rgba(220,38,38,0.08)" : "rgba(245,158,11,0.08)" }}>
                  {todayUpdate
                    ? <CheckCircle2 size={18} style={{ color: "#DC2626" }} />
                    : <AlertCircle  size={18} style={{ color: "#F59E0B" }} />
                  }
                </div>
                <div>
                  <p className="text-[14px] font-bold" style={{ color: "#111111" }}>
                    {todayUpdate ? "Daily update submitted ✓" : "You haven't submitted today's update"}
                  </p>
                  <p className="text-[12px] mt-0.5" style={{ color: "#9CA3AF" }}>
                    {todayUpdate
                      ? `${todayUpdate.working_hours ?? "—"}h logged · ${shootCount} shoot${shootCount !== 1 ? "s" : ""}`
                      : "Submit before 9 PM to avoid alerts"}
                  </p>
                </div>
              </div>
              {!todayUpdate && (
                <Link href="/member/update"
                  className="px-5 py-2.5 rounded-lg text-[13px] font-bold flex-shrink-0 transition-all"
                  style={{ background: "#DC2626", color: "#FFFFFF" }}>
                  Submit Update
                </Link>
              )}
            </div>
          </div>

          {/* My Tasks */}
          <div className="rounded-xl p-5" style={{ background: "#FFFFFF", border: "1px solid #2A2A2A" }}>
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-2">
                <Target size={14} style={{ color: "#DC2626" }} />
                <h3 className="text-[13px] font-bold" style={{ color: "#111111" }}>My Tasks</h3>
                {todayOverdue.length > 0 && (
                  <span className="text-[10px] font-bold px-2 py-0.5 rounded-full"
                    style={{ background: "rgba(255,100,100,0.1)", color: "#FF6464" }}>
                    {todayOverdue.length} overdue
                  </span>
                )}
              </div>
              <Link href="/member/tasks" className="text-[12px] font-semibold" style={{ color: "#DC2626" }}>
                View all →
              </Link>
            </div>

            {myTasks.length === 0 ? (
              <div className="flex flex-col items-center py-8 gap-2">
                <CheckCircle2 size={26} style={{ color: "#E5E7EB" }} />
                <p className="text-[13px]" style={{ color: "rgba(0,0,0,0.1)" }}>All tasks completed</p>
              </div>
            ) : (
              <div className="space-y-1.5">
                {myTasks.map((task) => {
                  const isOverdue = !!task.due_date && task.due_date < today
                  const pr = isOverdue
                    ? { color: "#FF6464", bg: "rgba(255,100,100,0.06)" }
                    : PRIORITY_STYLE[task.priority] ?? PRIORITY_STYLE.medium
                  return (
                    <div key={task.id} className="flex items-center gap-3 px-3 py-2.5 rounded-lg"
                      style={{ background: isOverdue ? "rgba(255,100,100,0.04)" : "rgba(0,0,0,0.02)" }}>
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
        </div>

        {/* ── RIGHT ── */}
        <div className="space-y-4">
          {[
            { label: "Active Tasks",   value: activeTasks,                              icon: Target,      href: "/member/tasks",      accent: "#DC2626" },
            { label: "Today's Hours",  value: todayHours > 0 ? `${todayHours}h` : "—", icon: Clock,       href: "/member/attendance", accent: "#DC2626" },
            { label: "Pending Leaves", value: pendingLeavesCount ?? 0,                  icon: CalendarOff, href: "/member/leaves",     accent: "#DC2626" },
          ].map((stat) => {
            const Icon = stat.icon
            return (
              <Link key={stat.label} href={stat.href}
                className="rounded-xl p-4 flex items-center gap-4 transition-all hover:-translate-y-0.5"
                style={{ background: "#FFFFFF", border: "1px solid #2A2A2A", display: "flex" }}>
                <div className="w-9 h-9 rounded-lg flex items-center justify-center flex-shrink-0"
                  style={{ background: "rgba(220,38,38,0.08)" }}>
                  <Icon size={16} style={{ color: stat.accent }} />
                </div>
                <div className="flex-1">
                  <p className="text-[24px] font-black leading-none"
                    style={{ fontFamily: "var(--font-jakarta)", color: stat.accent }}>
                    {stat.value}
                  </p>
                  <p className="text-[11px] font-medium mt-0.5" style={{ color: "#9CA3AF" }}>{stat.label}</p>
                </div>
              </Link>
            )
          })}

          {/* Today Summary */}
          <div className="rounded-xl p-5" style={{ background: "#FFFFFF", border: "1px solid #2A2A2A" }}>
            <p className="text-[10px] uppercase tracking-[0.2em] font-bold mb-4" style={{ color: "#D1D5DB" }}>
              Today Summary
            </p>
            <div className="grid grid-cols-3 gap-2">
              {[
                { label: "Hours",  value: todayHours > 0 ? `${todayHours}h` : "—" },
                { label: "Done",   value: completedTasks },
                { label: "Shoots", value: shootCount },
              ].map((item) => (
                <div key={item.label} className="rounded-lg p-3 text-center"
                  style={{ background: "#F9FAFB", border: "1px solid #F0F0F0" }}>
                  <p className="text-[22px] font-black leading-none mb-1"
                    style={{ fontFamily: "var(--font-jakarta)", color: "#111111" }}>
                    {item.value}
                  </p>
                  <p className="text-[10px]" style={{ color: "#9CA3AF" }}>{item.label}</p>
                </div>
              ))}
            </div>

            {productivitySignal && (
              <div className="flex items-center gap-2 mt-4 pt-4" style={{ borderTop: "1px solid #1A1A1A" }}>
                {productivitySignal.icon === "zap"
                  ? <Zap size={13} style={{ color: productivitySignal.color }} />
                  : <AlertTriangle size={13} style={{ color: productivitySignal.color }} />
                }
                <p className="text-[12px] font-semibold" style={{ color: productivitySignal.color }}>
                  {productivitySignal.text}
                </p>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* ── This Month ─────────────────────────────────────────── */}
      <div className="mt-5 rounded-xl p-5" style={{ background: "#FFFFFF", border: "1px solid #2A2A2A" }}>
        <div className="flex items-center gap-2 mb-4">
          <div className="w-7 h-7 rounded-lg flex items-center justify-center"
            style={{ background: "rgba(220,38,38,0.08)" }}>
            <Calendar size={14} style={{ color: "#DC2626" }} />
          </div>
          <h3 className="text-[13px] font-bold" style={{ color: "#111111" }}>This Month</h3>
          <span className="text-[11px]" style={{ color: "#9CA3AF" }}>{monthName}</span>
          {avgHoursPerDay > 0 && avgHoursPerDay < 9 && (
            <span className="text-[10px] font-bold px-2 py-0.5 rounded-full ml-auto"
              style={{ background: "rgba(220,38,38,0.1)", color: "#DC2626" }}>
              ⚠ {(9 - avgHoursPerDay).toFixed(1)}h below daily target
            </span>
          )}
          {avgHoursPerDay >= 9 && (
            <span className="text-[10px] font-bold px-2 py-0.5 rounded-full ml-auto"
              style={{ background: "rgba(22,163,74,0.1)", color: "#16A34A" }}>
              ✓ On target
            </span>
          )}
        </div>

        <div className="grid grid-cols-3 md:grid-cols-6 gap-3">
          {monthlyStats.map((stat) => (
            <div key={stat.label} className="rounded-xl p-3.5 text-center"
              style={{ background: "#F9FAFB", border: "1px solid #F0F0F0" }}>
              <p className="text-[22px] font-black leading-none mb-1"
                style={{ fontFamily: "var(--font-jakarta)", color: stat.color }}>
                {stat.value}
              </p>
              <p className="text-[9px] uppercase tracking-wide font-semibold" style={{ color: "#9CA3AF" }}>
                {stat.label}
              </p>
              {stat.sub && (
                <p className="text-[9px] mt-1 font-semibold"
                  style={{ color: avgHoursPerDay >= 9 ? "#16A34A" : "#DC2626" }}>
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
