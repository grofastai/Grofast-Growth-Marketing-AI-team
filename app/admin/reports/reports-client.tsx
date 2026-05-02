"use client"

import { useRouter } from "next/navigation"
import {
  ChevronLeft, ChevronRight, Clock, Camera, BookOpen,
  TrendingUp, AlertTriangle, CheckCircle2, Users,
  UserX, CalendarDays, Target, FolderOpen, Zap,
} from "lucide-react"

interface Performer {
  name: string
  employee_id: string
  hours: number
  shoots: number
  learning: number
}

interface ReportsClientProps {
  date: string
  today: string
  totalHours: number
  totalShoots: number
  totalLearning: number
  presentCount: number
  absentCount: number
  notUpdatedMembers: { name: string; employee_id: string }[]
  topPerformers: Performer[]
  lowHoursMembers: Performer[]
  totalActiveTasks: number
  overdueTasks: { id: string; title: string; due_date: string }[]
  tasksNoActivity: { id: string; title: string }[]
  activeProjects: number
  overdueProjects: { id: string; business_name: string; deadline: string }[]
}

function getInitials(name: string) {
  return name.split(" ").map((n) => n[0]).join("").slice(0, 2).toUpperCase()
}

function formatDate(s: string) {
  return new Date(s).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" })
}

function shiftDate(dateStr: string, days: number) {
  const d = new Date(dateStr)
  d.setDate(d.getDate() + days)
  return d.toISOString().split("T")[0]
}

function getLongDate(dateStr: string) {
  return new Date(dateStr).toLocaleDateString("en-IN", {
    weekday: "long", day: "numeric", month: "long", year: "numeric",
  })
}

// ── Section Shell ──────────────────────────────────────────────────────────────

function Section({ title, icon: Icon, iconColor = "#DC2626", children }: {
  title: string
  icon: React.ElementType
  iconColor?: string
  children: React.ReactNode
}) {
  return (
    <div className="rounded-xl overflow-hidden" style={{ background: "#262626", border: "1px solid #2A2A2A" }}>
      <div className="flex items-center gap-2.5 px-5 py-4" style={{ borderBottom: "1px solid #1A1A1A" }}>
        <Icon size={14} style={{ color: iconColor }} />
        <h2 className="text-[12px] font-black uppercase tracking-wider"
          style={{ fontFamily: "var(--font-jakarta)", color: "#FFFFFF" }}>{title}</h2>
      </div>
      {children}
    </div>
  )
}

// ── Alert Block ────────────────────────────────────────────────────────────────

function AlertBlock({
  color, bg, border, icon: Icon, title, items, emptyLabel,
}: {
  color: string; bg: string; border: string
  icon: React.ElementType; title: string
  items: { label: string; sub?: string }[]; emptyLabel?: string
}) {
  return (
    <div className="rounded-xl p-4" style={{ background: bg, border: `1px solid ${border}` }}>
      <div className="flex items-center gap-2 mb-3">
        <Icon size={12} style={{ color }} />
        <span className="text-[10px] font-bold uppercase tracking-wider" style={{ color }}>{title}</span>
        <span className="ml-auto text-[11px] font-bold px-1.5 py-0.5 rounded-full"
          style={{ background: `${color}20`, color }}>{items.length}</span>
      </div>
      {items.length === 0 ? (
        <p className="text-[12px]" style={{ color: "rgba(255,255,255,0.25)" }}>{emptyLabel ?? "None"}</p>
      ) : (
        <div className="space-y-1.5">
          {items.map((item, i) => (
            <div key={i} className="flex items-start justify-between gap-2">
              <span className="text-[12px] leading-snug" style={{ color: "rgba(255,255,255,0.6)" }}>{item.label}</span>
              {item.sub && <span className="text-[11px] flex-shrink-0" style={{ color }}>{item.sub}</span>}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

// ── Main ───────────────────────────────────────────────────────────────────────

export default function ReportsClient({
  date, today,
  totalHours, totalShoots, totalLearning,
  presentCount, absentCount, notUpdatedMembers,
  topPerformers, lowHoursMembers,
  totalActiveTasks, overdueTasks, tasksNoActivity,
  activeProjects, overdueProjects,
}: ReportsClientProps) {
  const router = useRouter()
  const isToday = date === today
  const prevDay = shiftDate(date, -1)
  const nextDay = shiftDate(date, +1)

  function go(d: string) {
    router.push(`/admin/reports?date=${d}`)
  }

  const totalProblems =
    notUpdatedMembers.length + lowHoursMembers.length +
    overdueTasks.length + tasksNoActivity.length + overdueProjects.length

  const hasData = presentCount > 0 || absentCount > 0

  return (
    <div className="p-8 max-w-[1200px]">

      {/* ── Header ─────────────────────────────────────────────────────────── */}
      <div className="flex items-start justify-between mb-6">
        <div>
          <h1 className="text-[30px] font-black leading-tight"
            style={{ fontFamily: "var(--font-jakarta)", color: "#FFFFFF" }}>
            Daily Intelligence
          </h1>
          <p className="text-sm mt-1" style={{ color: "rgba(255,255,255,0.35)" }}>
            {getLongDate(date)}
            {isToday && (
              <span className="ml-2 text-[11px] font-bold px-2 py-0.5 rounded-full"
                style={{ background: "rgba(220,38,38,0.1)", color: "#DC2626" }}>
                Today
              </span>
            )}
          </p>
        </div>

        {/* Date Navigation */}
        <div className="flex items-center gap-2 mt-1">
          <button onClick={() => go(prevDay)}
            className="w-9 h-9 rounded-lg flex items-center justify-center transition-all"
            style={{ background: "#262626", border: "1px solid #2A2A2A", color: "rgba(255,255,255,0.5)" }}>
            <ChevronLeft size={16} />
          </button>
          <input
            type="date" value={date}
            onChange={(e) => e.target.value && go(e.target.value)}
            className="px-3 py-2 rounded-lg text-[13px] outline-none"
            style={{ background: "#262626", border: "1px solid #2A2A2A", color: "#FFFFFF", colorScheme: "dark" }}
          />
          <button onClick={() => go(nextDay)} disabled={isToday}
            className="w-9 h-9 rounded-lg flex items-center justify-center transition-all disabled:opacity-30"
            style={{ background: "#262626", border: "1px solid #2A2A2A", color: "rgba(255,255,255,0.5)" }}>
            <ChevronRight size={16} />
          </button>
          {!isToday && (
            <button onClick={() => go(today)}
              className="px-3 py-2 rounded-lg text-[12px] font-bold transition-all"
              style={{ background: "rgba(220,38,38,0.1)", border: "1px solid rgba(220,38,38,0.2)", color: "#DC2626" }}>
              Today
            </button>
          )}
        </div>
      </div>

      {/* ── Summary Row ────────────────────────────────────────────────────── */}
      <div className="grid grid-cols-3 md:grid-cols-6 gap-3 mb-8">
        {[
          { label: "Hours Worked",  value: `${totalHours.toFixed(1)}h`,    color: "#F59E0B", bg: "rgba(245,158,11,0.05)",  border: "rgba(245,158,11,0.15)",  icon: Clock },
          { label: "Shoots",        value: totalShoots,                     color: "#FFFFFF",  bg: "#262626",               border: "#2A2A2A",                 icon: Camera },
          { label: "Learning Hrs",  value: `${totalLearning.toFixed(1)}h`, color: "rgba(255,255,255,0.55)", bg: "#262626", border: "#2A2A2A",                 icon: BookOpen },
          { label: "Present",       value: presentCount,                    color: "#DC2626",  bg: "rgba(220,38,38,0.05)", border: "rgba(220,38,38,0.15)",  icon: Users },
          { label: "Absent",        value: absentCount,                     color: absentCount > 0 ? "#FF6B57" : "rgba(255,255,255,0.3)", bg: absentCount > 0 ? "rgba(255,107,87,0.05)" : "#262626", border: absentCount > 0 ? "rgba(255,107,87,0.15)" : "#2A2A2A", icon: UserX },
          { label: "Not Updated",   value: notUpdatedMembers.length,        color: notUpdatedMembers.length > 0 ? "#FF6B57" : "rgba(255,255,255,0.3)", bg: notUpdatedMembers.length > 0 ? "rgba(255,107,87,0.05)" : "#262626", border: notUpdatedMembers.length > 0 ? "rgba(255,107,87,0.15)" : "#2A2A2A", icon: AlertTriangle },
        ].map(({ label, value, color, bg, border, icon: Icon }) => (
          <div key={label} className="rounded-xl p-4 flex flex-col gap-2"
            style={{ background: bg, border: `1px solid ${border}` }}>
            <Icon size={13} style={{ color: "rgba(255,255,255,0.25)" }} />
            <p className="text-[26px] font-black leading-none"
              style={{ fontFamily: "var(--font-jakarta)", color }}>{value}</p>
            <p className="text-[10px] font-medium" style={{ color: "rgba(255,255,255,0.35)" }}>{label}</p>
          </div>
        ))}
      </div>

      {/* ── No Data ────────────────────────────────────────────────────────── */}
      {!hasData && (
        <div className="flex flex-col items-center justify-center py-20 rounded-xl mb-8"
          style={{ background: "#262626", border: "1px solid #2A2A2A" }}>
          <Clock size={36} style={{ color: "rgba(255,255,255,0.06)" }} className="mb-3" />
          <p className="text-[14px] font-semibold" style={{ color: "rgba(255,255,255,0.3)" }}>
            No updates submitted for this date
          </p>
          <p className="text-[12px] mt-1" style={{ color: "rgba(255,255,255,0.18)" }}>
            Team members haven't submitted their daily reports yet.
          </p>
        </div>
      )}

      {hasData && (
        <div className="space-y-6">
          {/* ── Top Performers + Problems ──────────────────────────────────── */}
          <div className="grid md:grid-cols-2 gap-6">

            {/* Top Performers */}
            <Section title="Top Performers" icon={TrendingUp}>
              {topPerformers.length === 0 ? (
                <div className="flex flex-col items-center py-12">
                  <Users size={28} style={{ color: "rgba(255,255,255,0.06)" }} className="mb-2" />
                  <p className="text-[13px]" style={{ color: "rgba(255,255,255,0.25)" }}>No data for this date</p>
                </div>
              ) : (
                <div className="p-2">
                  {topPerformers.map((p, i) => {
                    const isTop  = i === 0
                    const barPct = topPerformers[0].hours > 0 ? (p.hours / topPerformers[0].hours) * 100 : 0
                    return (
                      <div key={p.employee_id}
                        className="flex items-center gap-4 px-3 py-3.5 rounded-xl mb-1"
                        style={isTop
                          ? { background: "rgba(220,38,38,0.05)", border: "1px solid rgba(220,38,38,0.1)" }
                          : {}
                        }>
                        {/* Rank */}
                        <div className="w-6 text-center flex-shrink-0">
                          {isTop
                            ? <Zap size={14} style={{ color: "#DC2626" }} />
                            : <span className="text-[11px] font-bold" style={{ color: "rgba(255,255,255,0.25)" }}>#{i + 1}</span>
                          }
                        </div>
                        {/* Avatar */}
                        <div className="w-9 h-9 rounded-full flex items-center justify-center flex-shrink-0"
                          style={{
                            background: isTop ? "rgba(220,38,38,0.12)" : "rgba(255,255,255,0.05)",
                            border: `1px solid ${isTop ? "rgba(220,38,38,0.2)" : "rgba(255,255,255,0.08)"}`,
                          }}>
                          <span className="text-[10px] font-bold"
                            style={{ color: isTop ? "#DC2626" : "rgba(255,255,255,0.5)" }}>
                            {getInitials(p.name)}
                          </span>
                        </div>
                        {/* Info */}
                        <div className="flex-1 min-w-0">
                          <p className="text-[13px] font-semibold truncate" style={{ color: "#FFFFFF" }}>{p.name}</p>
                          <div className="mt-1.5 h-1.5 rounded-full overflow-hidden" style={{ background: "#1A1A1A" }}>
                            <div className="h-full rounded-full transition-all"
                              style={{ width: `${barPct}%`, background: isTop ? "#DC2626" : "rgba(255,255,255,0.2)" }} />
                          </div>
                        </div>
                        {/* Stats */}
                        <div className="text-right flex-shrink-0">
                          <p className="text-[14px] font-black" style={{ fontFamily: "var(--font-jakarta)", color: isTop ? "#F59E0B" : "rgba(255,255,255,0.6)" }}>
                            {p.hours.toFixed(1)}h
                          </p>
                          {p.shoots > 0 && (
                            <p className="text-[11px]" style={{ color: "rgba(255,255,255,0.3)" }}>
                              {p.shoots} shoot{p.shoots !== 1 ? "s" : ""}
                            </p>
                          )}
                        </div>
                      </div>
                    )
                  })}
                </div>
              )}
            </Section>

            {/* Problems */}
            <Section
              title={totalProblems > 0 ? `Problems — ${totalProblems} flagged` : "Problems"}
              icon={AlertTriangle}
              iconColor={totalProblems > 0 ? "#F59E0B" : "#DC2626"}>
              {totalProblems === 0 ? (
                <div className="flex flex-col items-center py-12">
                  <CheckCircle2 size={28} style={{ color: "rgba(220,38,38,0.2)" }} className="mb-2" />
                  <p className="text-[13px] font-semibold" style={{ color: "rgba(220,38,38,0.6)" }}>All clear</p>
                  <p className="text-[12px] mt-1" style={{ color: "rgba(255,255,255,0.2)" }}>
                    No issues detected for this date
                  </p>
                </div>
              ) : (
                <div className="p-4 space-y-3">
                  <AlertBlock
                    color="#FF6B57" bg="rgba(255,107,87,0.04)" border="rgba(255,107,87,0.12)"
                    icon={UserX} title="Didn't Update"
                    items={notUpdatedMembers.map((m) => ({ label: m.name, sub: `#${m.employee_id}` }))}
                    emptyLabel="All members updated"
                  />
                  <AlertBlock
                    color="#F59E0B" bg="rgba(245,158,11,0.04)" border="rgba(245,158,11,0.12)"
                    icon={Clock} title="Low Hours (< 6h)"
                    items={lowHoursMembers.map((m) => ({ label: m.name, sub: `${m.hours}h` }))}
                    emptyLabel="No low-hour flags"
                  />
                  <AlertBlock
                    color="#FF6B57" bg="rgba(255,107,87,0.04)" border="rgba(255,107,87,0.12)"
                    icon={CalendarDays} title="Overdue Tasks"
                    items={overdueTasks.map((t) => ({ label: t.title, sub: formatDate(t.due_date) }))}
                    emptyLabel="No overdue tasks"
                  />
                </div>
              )}
            </Section>
          </div>

          {/* ── Health Overview ─────────────────────────────────────────────── */}
          <div className="grid md:grid-cols-2 gap-6">

            {/* Task Health */}
            <Section title="Task Health" icon={Target}>
              <div className="p-5 space-y-4">
                <div className="grid grid-cols-2 gap-3">
                  {[
                    { label: "Active Tasks",    value: totalActiveTasks,        color: "#FFFFFF",  bg: "#1A1A1A",                   border: "#2A2A2A" },
                    { label: "Overdue Tasks",   value: overdueTasks.length,     color: overdueTasks.length > 0 ? "#FF6B57" : "rgba(255,255,255,0.3)", bg: overdueTasks.length > 0 ? "rgba(255,107,87,0.08)" : "#1A1A1A", border: overdueTasks.length > 0 ? "rgba(255,107,87,0.18)" : "#2A2A2A" },
                    { label: "No Activity",     value: tasksNoActivity.length,  color: tasksNoActivity.length > 0 ? "#F59E0B" : "rgba(255,255,255,0.3)", bg: tasksNoActivity.length > 0 ? "rgba(245,158,11,0.08)" : "#1A1A1A", border: tasksNoActivity.length > 0 ? "rgba(245,158,11,0.18)" : "#2A2A2A" },
                    { label: "Completion Rate", value: totalActiveTasks > 0 ? "—" : "100%", color: "#DC2626", bg: "#1A1A1A", border: "#2A2A2A" },
                  ].map(({ label, value, color, bg, border }) => (
                    <div key={label} className="rounded-xl px-4 py-3"
                      style={{ background: bg, border: `1px solid ${border}` }}>
                      <p className="text-[22px] font-black leading-none mb-1"
                        style={{ fontFamily: "var(--font-jakarta)", color }}>{value}</p>
                      <p className="text-[10px]" style={{ color: "rgba(255,255,255,0.35)" }}>{label}</p>
                    </div>
                  ))}
                </div>
                {tasksNoActivity.length > 0 && (
                  <div className="rounded-xl p-3" style={{ background: "rgba(245,158,11,0.04)", border: "1px solid rgba(245,158,11,0.1)" }}>
                    <p className="text-[10px] font-bold uppercase tracking-wider mb-2" style={{ color: "#F59E0B" }}>
                      Tasks with Zero Activity
                    </p>
                    <div className="space-y-1">
                      {tasksNoActivity.map((t) => (
                        <p key={t.id} className="text-[12px] truncate" style={{ color: "rgba(255,255,255,0.5)" }}>
                          · {t.title}
                        </p>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            </Section>

            {/* Project Health */}
            <Section title="Project Health" icon={FolderOpen}>
              <div className="p-5 space-y-4">
                <div className="grid grid-cols-2 gap-3">
                  {[
                    { label: "Active Projects",   value: activeProjects,          color: "#DC2626",  bg: "rgba(220,38,38,0.05)", border: "rgba(220,38,38,0.12)" },
                    { label: "Overdue Projects",  value: overdueProjects.length,  color: overdueProjects.length > 0 ? "#FF6B57" : "rgba(255,255,255,0.3)", bg: overdueProjects.length > 0 ? "rgba(255,107,87,0.08)" : "#1A1A1A", border: overdueProjects.length > 0 ? "rgba(255,107,87,0.18)" : "#2A2A2A" },
                    { label: "On Track",          value: activeProjects - overdueProjects.length, color: "#DC2626", bg: "#1A1A1A", border: "#2A2A2A" },
                    { label: "Health Score",      value: activeProjects > 0 ? `${Math.round(((activeProjects - overdueProjects.length) / activeProjects) * 100)}%` : "—", color: "#FFFFFF", bg: "#1A1A1A", border: "#2A2A2A" },
                  ].map(({ label, value, color, bg, border }) => (
                    <div key={label} className="rounded-xl px-4 py-3"
                      style={{ background: bg, border: `1px solid ${border}` }}>
                      <p className="text-[22px] font-black leading-none mb-1"
                        style={{ fontFamily: "var(--font-jakarta)", color }}>{value}</p>
                      <p className="text-[10px]" style={{ color: "rgba(255,255,255,0.35)" }}>{label}</p>
                    </div>
                  ))}
                </div>
                {overdueProjects.length > 0 && (
                  <div className="rounded-xl p-3" style={{ background: "rgba(255,107,87,0.04)", border: "1px solid rgba(255,107,87,0.1)" }}>
                    <p className="text-[10px] font-bold uppercase tracking-wider mb-2" style={{ color: "#FF6B57" }}>
                      Overdue Projects
                    </p>
                    <div className="space-y-1">
                      {overdueProjects.map((p) => (
                        <div key={p.id} className="flex items-center justify-between gap-2">
                          <p className="text-[12px] truncate" style={{ color: "rgba(255,255,255,0.5)" }}>
                            {p.business_name}
                          </p>
                          <span className="text-[11px] flex-shrink-0" style={{ color: "#FF6B57" }}>
                            {formatDate(p.deadline)}
                          </span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            </Section>

          </div>
        </div>
      )}

      {/* Problems visible even with no submissions (task/project health) */}
      {!hasData && (overdueTasks.length > 0 || overdueProjects.length > 0 || tasksNoActivity.length > 0) && (
        <div className="rounded-xl overflow-hidden" style={{ background: "#262626", border: "1px solid #2A2A2A" }}>
          <div className="flex items-center gap-2.5 px-5 py-4" style={{ borderBottom: "1px solid #1A1A1A" }}>
            <AlertTriangle size={14} style={{ color: "#F59E0B" }} />
            <h2 className="text-[12px] font-black uppercase tracking-wider"
              style={{ fontFamily: "var(--font-jakarta)", color: "#FFFFFF" }}>
              Standing Issues
            </h2>
          </div>
          <div className="p-4 space-y-3">
            {overdueTasks.length > 0 && (
              <AlertBlock
                color="#FF6B57" bg="rgba(255,107,87,0.04)" border="rgba(255,107,87,0.12)"
                icon={CalendarDays} title={`${overdueTasks.length} Overdue Tasks`}
                items={overdueTasks.slice(0, 5).map((t) => ({ label: t.title, sub: formatDate(t.due_date) }))}
              />
            )}
            {overdueProjects.length > 0 && (
              <AlertBlock
                color="#FF6B57" bg="rgba(255,107,87,0.04)" border="rgba(255,107,87,0.12)"
                icon={FolderOpen} title={`${overdueProjects.length} Overdue Projects`}
                items={overdueProjects.map((p) => ({ label: p.business_name, sub: formatDate(p.deadline) }))}
              />
            )}
          </div>
        </div>
      )}

    </div>
  )
}
