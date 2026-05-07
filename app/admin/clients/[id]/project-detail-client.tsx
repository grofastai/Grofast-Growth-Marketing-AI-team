"use client"

import { useMemo } from "react"
import Link from "next/link"
import {
  ArrowLeft, MapPin, CalendarDays, Clock, Camera, Target,
  AlertTriangle, CheckCircle2, PauseCircle, Circle, Activity,
  TrendingUp, Users, Zap, User, BarChart3, UserX, Timer,
} from "lucide-react"

interface Project {
  id: string
  business_name: string
  client_name: string
  location: string | null
  service_types: string[]
  status: "active" | "completed" | "on_hold"
  deadline: string | null
  progress_pct: number
  created_at: string
}

interface Task {
  id: string
  title: string
  status: "todo" | "in_progress" | "completed"
  priority: "low" | "medium" | "high"
  due_date: string | null
  assigned_to: string | null
  users: { id: string; name: string; employee_id: string } | { id: string; name: string; employee_id: string }[] | null
}

interface DailyUpdate {
  id: string
  user_id: string
  date: string
  working_hours: number | null
  shoot_count: number
  task_id: string | null
  notes: string | null
  attendance_status: string
  users: { id: string; name: string; employee_id: string } | { id: string; name: string; employee_id: string }[] | null
}

const TASK_STATUS = {
  todo:        { label: "To Do",       color: "rgba(255,255,255,0.5)", bg: "rgba(255,255,255,0.05)", border: "rgba(255,255,255,0.08)", Icon: Circle },
  in_progress: { label: "In Progress", color: "#F59E0B",               bg: "rgba(245,158,11,0.08)",  border: "rgba(245,158,11,0.18)",  Icon: Clock },
  completed:   { label: "Done",        color: "#DC2626",               bg: "rgba(220,38,38,0.08)",  border: "rgba(220,38,38,0.18)",  Icon: CheckCircle2 },
} as const

const PRIORITY_CONFIG = {
  high:   { color: "#FF6B57", bg: "rgba(255,107,87,0.08)",   label: "High" },
  medium: { color: "#F59E0B", bg: "rgba(245,158,11,0.08)",   label: "Med" },
  low:    { color: "rgba(255,255,255,0.3)", bg: "rgba(255,255,255,0.04)", label: "Low" },
} as const

const PROJECT_STATUS = {
  active:    { label: "Active",    color: "#DC2626", bg: "rgba(220,38,38,0.1)",  border: "rgba(220,38,38,0.2)" },
  completed: { label: "Completed", color: "#FFFFFF", bg: "rgba(255,255,255,0.06)", border: "rgba(255,255,255,0.1)" },
  on_hold:   { label: "On Hold",   color: "#F59E0B", bg: "rgba(245,158,11,0.1)",  border: "rgba(245,158,11,0.2)" },
} as const

function resolveUser(u: DailyUpdate["users"]) {
  if (!u) return null
  return Array.isArray(u) ? u[0] ?? null : u
}

function resolveTaskUser(u: Task["users"]) {
  if (!u) return null
  return Array.isArray(u) ? u[0] ?? null : u
}

function getInitials(name: string) {
  return name.split(" ").map((n) => n[0]).join("").slice(0, 2).toUpperCase()
}

function formatDate(s: string | null) {
  if (!s) return "—"
  return new Date(s).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" })
}

function isOverdue(due: string | null, status: string) {
  if (!due || status === "completed") return false
  return new Date(due) < new Date()
}

function daysAgo(dateStr: string) {
  const diff = Date.now() - new Date(dateStr).getTime()
  return Math.floor(diff / 86_400_000)
}

// ── Stat Chip ─────────────────────────────────────────────────────────────────

function StatChip({
  label, value, color = "#FFFFFF", bg = "#262626", border = "#2A2A2A",
}: { label: string; value: string | number; color?: string; bg?: string; border?: string }) {
  return (
    <div className="flex items-center gap-3 px-5 py-3 rounded-xl"
      style={{ background: bg, border: `1px solid ${border}` }}>
      <span className="text-[24px] font-black leading-none"
        style={{ fontFamily: "var(--font-jakarta)", color }}>{value}</span>
      <span className="text-[11px] font-medium" style={{ color: "rgba(255,255,255,0.4)" }}>{label}</span>
    </div>
  )
}

// ── Section Shell ──────────────────────────────────────────────────────────────

function Section({ title, icon: Icon, count, children }: {
  title: string; icon: React.ElementType; count?: number; children: React.ReactNode
}) {
  return (
    <div className="rounded-xl overflow-hidden" style={{ background: "#262626", border: "1px solid #2A2A2A" }}>
      <div className="flex items-center gap-2.5 px-5 py-4" style={{ borderBottom: "1px solid #1A1A1A" }}>
        <Icon size={14} style={{ color: "#DC2626" }} />
        <h2 className="text-[13px] font-black uppercase tracking-wider"
          style={{ fontFamily: "var(--font-jakarta)", color: "#FFFFFF" }}>{title}</h2>
        {count != null && (
          <span className="ml-auto text-[11px] font-bold px-2 py-0.5 rounded-full"
            style={{ background: "rgba(255,255,255,0.06)", color: "rgba(255,255,255,0.4)" }}>
            {count}
          </span>
        )}
      </div>
      <div>{children}</div>
    </div>
  )
}

// ── Main Component ─────────────────────────────────────────────────────────────

export default function ProjectDetailClient({
  project,
  tasks,
  activities,
}: {
  project: Project
  tasks: Task[]
  activities: DailyUpdate[]
}) {
  const psc = PROJECT_STATUS[project.status]
  const overdueProject = isOverdue(project.deadline, project.status)

  // ── Derived stats ──────────────────────────────────────────────────────────

  const stats = useMemo(() => {
    const totalTasks    = tasks.length
    const completed     = tasks.filter((t) => t.status === "completed").length
    const totalHours    = activities.reduce((s, a) => s + (a.working_hours ?? 0), 0)
    const totalShoots   = activities.reduce((s, a) => s + (a.shoot_count ?? 0), 0)
    const activeDates   = new Set(activities.map((a) => a.date)).size
    const avgHoursPerDay = activeDates > 0 ? totalHours / activeDates : 0
    const shootsPerHour  = totalHours > 0 ? totalShoots / totalHours : 0

    // Per-employee stats
    const empMap: Record<string, { name: string; employee_id: string; hours: number; shoots: number; days: Set<string> }> = {}
    for (const a of activities) {
      const u = resolveUser(a.users)
      if (!u) continue
      if (!empMap[u.id]) empMap[u.id] = { name: u.name, employee_id: u.employee_id, hours: 0, shoots: 0, days: new Set() }
      empMap[u.id].hours  += a.working_hours ?? 0
      empMap[u.id].shoots += a.shoot_count   ?? 0
      empMap[u.id].days.add(a.date)
    }
    const employees = Object.values(empMap).sort((a, b) => b.hours - a.hours)

    // Task activity sets
    const tasksWithActivity = new Set(activities.map((a) => a.task_id).filter(Boolean))

    // Problem detection
    const noActivityTasks = tasks.filter((t) => t.status !== "completed" && !tasksWithActivity.has(t.id))
    const overdueTasks    = tasks.filter((t) => isOverdue(t.due_date, t.status))
    const stuckTasks      = tasks.filter((t) => {
      if (t.status !== "in_progress") return false
      const lastActivity = activities
        .filter((a) => a.task_id === t.id)
        .sort((a, b) => b.date.localeCompare(a.date))[0]
      if (!lastActivity) return true
      return daysAgo(lastActivity.date) >= 3
    })
    const lowHourEmployees = employees.filter((e) => {
      const avgH = e.days.size > 0 ? e.hours / e.days.size : 0
      return avgH < 5 && e.days.size > 0
    })

    return {
      totalTasks, completed, totalHours, totalShoots,
      activeDates, avgHoursPerDay, shootsPerHour,
      employees, tasksWithActivity,
      noActivityTasks, overdueTasks, stuckTasks, lowHourEmployees,
    }
  }, [tasks, activities])

  const problemCount = stats.noActivityTasks.length + stats.overdueTasks.length + stats.stuckTasks.length + stats.lowHourEmployees.length

  return (
    <div className="p-4 md:p-6 xl:p-8 max-w-[1400px]">

      {/* Back */}
      <Link href="/admin/clients"
        className="inline-flex items-center gap-2 mb-6 text-[12px] font-semibold transition-opacity hover:opacity-60"
        style={{ color: "rgba(255,255,255,0.4)" }}>
        <ArrowLeft size={13} /> Back to Clients
      </Link>

      {/* ── Header ─────────────────────────────────────────────────────────── */}
      <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-4 mb-6">
        <div>
          <div className="flex items-center gap-2.5 flex-wrap mb-2">
            <span className="text-[11px] font-bold px-2.5 py-1 rounded-full"
              style={{ background: psc.bg, color: psc.color, border: `1px solid ${psc.border}` }}>
              {psc.label}
            </span>
            {overdueProject && (
              <span className="flex items-center gap-1 text-[11px] font-bold px-2.5 py-1 rounded-full"
                style={{ background: "rgba(255,107,87,0.1)", color: "#FF6B57" }}>
                <AlertTriangle size={10} /> Overdue
              </span>
            )}
            {problemCount > 0 && (
              <span className="flex items-center gap-1 text-[11px] font-bold px-2.5 py-1 rounded-full"
                style={{ background: "rgba(245,158,11,0.1)", color: "#F59E0B" }}>
                <AlertTriangle size={10} /> {problemCount} problem{problemCount > 1 ? "s" : ""}
              </span>
            )}
          </div>
          <h1 className="text-[32px] font-black leading-tight mb-1"
            style={{ fontFamily: "var(--font-jakarta)", color: "#FFFFFF" }}>
            {project.business_name}
          </h1>
          <div className="flex items-center flex-wrap gap-4">
            <div className="flex items-center gap-1.5">
              <User size={12} style={{ color: "rgba(255,255,255,0.3)" }} />
              <span className="text-[13px]" style={{ color: "rgba(255,255,255,0.55)" }}>{project.client_name}</span>
            </div>
            {project.location && (
              <div className="flex items-center gap-1.5">
                <MapPin size={12} style={{ color: "rgba(255,255,255,0.3)" }} />
                <span className="text-[13px]" style={{ color: "rgba(255,255,255,0.4)" }}>{project.location}</span>
              </div>
            )}
            <div className="flex items-center gap-1.5">
              <CalendarDays size={12} style={{ color: overdueProject ? "#FF6B57" : "rgba(255,255,255,0.3)" }} />
              <span className="text-[13px]" style={{ color: overdueProject ? "#FF6B57" : "rgba(255,255,255,0.4)" }}>
                {formatDate(project.deadline)}
              </span>
            </div>
          </div>
        </div>
      </div>

      {/* ── Stats Row ──────────────────────────────────────────────────────── */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-8">
        <StatChip label="Total Tasks"  value={stats.totalTasks}  />
        <StatChip label="Completed"    value={stats.completed}   color="#DC2626" bg="rgba(220,38,38,0.05)" border="rgba(220,38,38,0.15)" />
        <StatChip label="Hours Logged" value={`${stats.totalHours.toFixed(1)}h`} color="#F59E0B" bg="rgba(245,158,11,0.05)" border="rgba(245,158,11,0.15)" />
        <StatChip label="Shoots"       value={stats.totalShoots} color="rgba(255,255,255,0.7)" />
      </div>

      <div className="space-y-6">

        {/* ── Task List ──────────────────────────────────────────────────────── */}
        <Section title="Tasks" icon={Target} count={tasks.length}>
          {tasks.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-14">
              <Target size={28} style={{ color: "rgba(255,255,255,0.06)" }} className="mb-2" />
              <p className="text-[13px]" style={{ color: "rgba(255,255,255,0.25)" }}>No tasks yet</p>
            </div>
          ) : (
            <div>
              {/* Table header */}
              <div className="grid gap-4 px-5 py-2.5" style={{ gridTemplateColumns: "1fr 140px 110px 60px 100px", borderBottom: "1px solid #1A1A1A" }}>
                {["Task", "Assigned To", "Status", "Priority", "Due Date"].map((h) => (
                  <span key={h} className="text-[10px] font-bold uppercase tracking-wider"
                    style={{ color: "rgba(255,255,255,0.25)" }}>{h}</span>
                ))}
              </div>
              {tasks.map((task, i) => {
                const tsc    = TASK_STATUS[task.status] ?? TASK_STATUS.todo
                const prc    = PRIORITY_CONFIG[task.priority] ?? PRIORITY_CONFIG.medium
                const overdue = isOverdue(task.due_date, task.status)
                const member  = resolveTaskUser(task.users)
                return (
                  <div key={task.id}
                    className="grid gap-4 px-5 py-3.5 items-center transition-colors"
                    style={{
                      gridTemplateColumns: "1fr 140px 110px 60px 100px",
                      borderBottom: i < tasks.length - 1 ? "1px solid rgba(255,255,255,0.04)" : "none",
                      background: overdue ? "rgba(255,107,87,0.025)" : "transparent",
                    }}>
                    {/* Title */}
                    <div className="flex items-center gap-2 min-w-0">
                      {overdue && <AlertTriangle size={12} style={{ color: "#FF6B57", flexShrink: 0 }} />}
                      <span className="text-[13px] font-semibold truncate" style={{ color: overdue ? "#FF6B57" : "#FFFFFF" }}>
                        {task.title}
                      </span>
                    </div>
                    {/* Assigned */}
                    <div className="flex items-center gap-2 min-w-0">
                      {member ? (
                        <>
                          <div className="w-6 h-6 rounded-full flex items-center justify-center flex-shrink-0"
                            style={{ background: "rgba(220,38,38,0.1)", border: "1px solid rgba(220,38,38,0.15)" }}>
                            <span className="text-[9px] font-bold" style={{ color: "#DC2626" }}>
                              {getInitials(member.name)}
                            </span>
                          </div>
                          <span className="text-[12px] truncate" style={{ color: "rgba(255,255,255,0.6)" }}>{member.name}</span>
                        </>
                      ) : (
                        <span className="text-[12px]" style={{ color: "rgba(255,255,255,0.2)" }}>Unassigned</span>
                      )}
                    </div>
                    {/* Status */}
                    <div>
                      <span className="text-[11px] font-bold px-2.5 py-1 rounded-full"
                        style={{ background: tsc.bg, color: tsc.color, border: `1px solid ${tsc.border}` }}>
                        {tsc.label}
                      </span>
                    </div>
                    {/* Priority */}
                    <div>
                      <span className="text-[10px] font-bold px-2 py-0.5 rounded-full"
                        style={{ background: prc.bg, color: prc.color }}>
                        {prc.label}
                      </span>
                    </div>
                    {/* Due */}
                    <span className="text-[12px]" style={{ color: overdue ? "#FF6B57" : "rgba(255,255,255,0.4)" }}>
                      {formatDate(task.due_date)}
                    </span>
                  </div>
                )
              })}
            </div>
          )}
        </Section>

        {/* ── Work Log ───────────────────────────────────────────────────────── */}
        <Section title="Work Log" icon={Activity} count={activities.length}>
          {activities.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-14">
              <Activity size={28} style={{ color: "rgba(255,255,255,0.06)" }} className="mb-2" />
              <p className="text-[13px]" style={{ color: "rgba(255,255,255,0.25)" }}>No activity logged yet</p>
            </div>
          ) : (
            <div>
              {/* Table header */}
              <div className="grid gap-4 px-5 py-2.5" style={{ gridTemplateColumns: "160px 110px 1fr 70px 60px", borderBottom: "1px solid #1A1A1A" }}>
                {["Employee", "Date", "Task", "Hours", "Shoots"].map((h) => (
                  <span key={h} className="text-[10px] font-bold uppercase tracking-wider"
                    style={{ color: "rgba(255,255,255,0.25)" }}>{h}</span>
                ))}
              </div>
              {activities.map((a, i) => {
                const u       = resolveUser(a.users)
                const taskRow = tasks.find((t) => t.id === a.task_id)
                const lowHours = a.working_hours != null && a.working_hours < 5
                return (
                  <div key={a.id}
                    className="grid gap-4 px-5 py-3.5 items-center"
                    style={{
                      gridTemplateColumns: "160px 110px 1fr 70px 60px",
                      borderBottom: i < activities.length - 1 ? "1px solid rgba(255,255,255,0.04)" : "none",
                    }}>
                    {/* Employee */}
                    <div className="flex items-center gap-2 min-w-0">
                      <div className="w-7 h-7 rounded-full flex items-center justify-center flex-shrink-0"
                        style={{ background: "rgba(220,38,38,0.08)", border: "1px solid rgba(220,38,38,0.12)" }}>
                        <span className="text-[9px] font-bold" style={{ color: "#DC2626" }}>
                          {u ? getInitials(u.name) : "?"}
                        </span>
                      </div>
                      <div className="min-w-0">
                        <p className="text-[12px] font-semibold truncate" style={{ color: "#FFFFFF" }}>
                          {u?.name ?? "Unknown"}
                        </p>
                        <p className="text-[10px]" style={{ color: "rgba(255,255,255,0.3)" }}>#{u?.employee_id}</p>
                      </div>
                    </div>
                    {/* Date */}
                    <span className="text-[12px]" style={{ color: "rgba(255,255,255,0.45)" }}>
                      {formatDate(a.date)}
                    </span>
                    {/* Task */}
                    <div className="min-w-0">
                      {taskRow ? (
                        <span className="text-[12px] font-medium truncate block" style={{ color: "rgba(220,38,38,0.8)" }}>
                          {taskRow.title}
                        </span>
                      ) : (
                        <span className="text-[12px]" style={{ color: "rgba(255,255,255,0.2)" }}>—</span>
                      )}
                      {a.notes && (
                        <p className="text-[11px] truncate mt-0.5" style={{ color: "rgba(255,255,255,0.3)" }}>{a.notes}</p>
                      )}
                    </div>
                    {/* Hours */}
                    <div className="flex items-center gap-1.5">
                      <Clock size={11} style={{ color: lowHours ? "#F59E0B" : "rgba(255,255,255,0.25)" }} />
                      <span className="text-[12px] font-semibold"
                        style={{ color: lowHours ? "#F59E0B" : "rgba(255,255,255,0.6)" }}>
                        {a.working_hours != null ? `${a.working_hours}h` : "—"}
                      </span>
                    </div>
                    {/* Shoots */}
                    <div className="flex items-center gap-1.5">
                      {a.shoot_count > 0 ? (
                        <>
                          <Camera size={11} style={{ color: "rgba(255,255,255,0.25)" }} />
                          <span className="text-[12px]" style={{ color: "rgba(255,255,255,0.5)" }}>{a.shoot_count}</span>
                        </>
                      ) : (
                        <span className="text-[12px]" style={{ color: "rgba(255,255,255,0.18)" }}>—</span>
                      )}
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </Section>

        {/* ── Performance + Problems Row ─────────────────────────────────────── */}
        <div className="grid md:grid-cols-2 gap-6">

          {/* Performance Summary */}
          <Section title="Performance" icon={BarChart3}>
            <div className="p-5 space-y-4">
              {[
                {
                  label: "Total Hours",
                  value: `${stats.totalHours.toFixed(1)}h`,
                  color: "#F59E0B",
                  icon: Clock,
                },
                {
                  label: "Total Shoots",
                  value: stats.totalShoots,
                  color: "rgba(255,255,255,0.7)",
                  icon: Camera,
                },
                {
                  label: "Active Days",
                  value: stats.activeDates,
                  color: "#DC2626",
                  icon: CalendarDays,
                },
                {
                  label: "Avg Hours / Day",
                  value: `${stats.avgHoursPerDay.toFixed(1)}h`,
                  color: stats.avgHoursPerDay < 5 ? "#FF6B57" : "rgba(255,255,255,0.7)",
                  icon: TrendingUp,
                },
                {
                  label: "Shoots / Hour",
                  value: stats.shootsPerHour > 0 ? stats.shootsPerHour.toFixed(2) : "—",
                  color: "rgba(255,255,255,0.5)",
                  icon: Zap,
                },
              ].map(({ label, value, color, icon: Icon }) => (
                <div key={label} className="flex items-center justify-between">
                  <div className="flex items-center gap-2.5">
                    <Icon size={13} style={{ color: "rgba(255,255,255,0.25)" }} />
                    <span className="text-[13px]" style={{ color: "rgba(255,255,255,0.5)" }}>{label}</span>
                  </div>
                  <span className="text-[15px] font-black" style={{ fontFamily: "var(--font-jakarta)", color }}>{value}</span>
                </div>
              ))}

              {/* Top Contributors */}
              {stats.employees.length > 0 && (
                <div className="pt-3" style={{ borderTop: "1px solid rgba(255,255,255,0.06)" }}>
                  <p className="text-[10px] font-bold uppercase tracking-wider mb-3"
                    style={{ color: "rgba(255,255,255,0.25)" }}>Top Contributors</p>
                  <div className="space-y-2.5">
                    {stats.employees.slice(0, 3).map((emp, idx) => (
                      <div key={emp.employee_id} className="flex items-center gap-3">
                        <div className="w-7 h-7 rounded-full flex items-center justify-center flex-shrink-0"
                          style={{
                            background: idx === 0 ? "rgba(220,38,38,0.1)" : "rgba(255,255,255,0.04)",
                            border: `1px solid ${idx === 0 ? "rgba(220,38,38,0.2)" : "rgba(255,255,255,0.06)"}`,
                          }}>
                          <span className="text-[9px] font-bold"
                            style={{ color: idx === 0 ? "#DC2626" : "rgba(255,255,255,0.4)" }}>
                            {getInitials(emp.name)}
                          </span>
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="text-[12px] font-semibold truncate" style={{ color: "#FFFFFF" }}>{emp.name}</p>
                        </div>
                        <div className="text-right flex-shrink-0">
                          <p className="text-[12px] font-bold" style={{ color: "#F59E0B" }}>{emp.hours.toFixed(1)}h</p>
                          {emp.shoots > 0 && (
                            <p className="text-[10px]" style={{ color: "rgba(255,255,255,0.3)" }}>{emp.shoots} shoots</p>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </Section>

          {/* Problem Detection */}
          <Section title="Problems Detected" icon={AlertTriangle} count={problemCount > 0 ? problemCount : undefined}>
            {problemCount === 0 ? (
              <div className="flex flex-col items-center justify-center py-14">
                <CheckCircle2 size={28} style={{ color: "rgba(220,38,38,0.2)" }} className="mb-2" />
                <p className="text-[13px] font-semibold" style={{ color: "rgba(220,38,38,0.6)" }}>All clear</p>
                <p className="text-[12px] mt-1" style={{ color: "rgba(255,255,255,0.2)" }}>No issues detected</p>
              </div>
            ) : (
              <div className="p-5 space-y-4">

                {/* Overdue tasks */}
                {stats.overdueTasks.length > 0 && (
                  <div className="rounded-xl p-4" style={{ background: "rgba(255,107,87,0.04)", border: "1px solid rgba(255,107,87,0.12)" }}>
                    <div className="flex items-center gap-2 mb-3">
                      <CalendarDays size={12} style={{ color: "#FF6B57" }} />
                      <span className="text-[11px] font-bold uppercase tracking-wider" style={{ color: "#FF6B57" }}>
                        Overdue ({stats.overdueTasks.length})
                      </span>
                    </div>
                    <div className="space-y-1.5">
                      {stats.overdueTasks.map((t) => (
                        <div key={t.id} className="flex items-center justify-between gap-2">
                          <span className="text-[12px] truncate" style={{ color: "rgba(255,255,255,0.6)" }}>{t.title}</span>
                          <span className="text-[11px] flex-shrink-0" style={{ color: "#FF6B57" }}>{formatDate(t.due_date)}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* No activity */}
                {stats.noActivityTasks.length > 0 && (
                  <div className="rounded-xl p-4" style={{ background: "rgba(245,158,11,0.04)", border: "1px solid rgba(245,158,11,0.12)" }}>
                    <div className="flex items-center gap-2 mb-3">
                      <Timer size={12} style={{ color: "#F59E0B" }} />
                      <span className="text-[11px] font-bold uppercase tracking-wider" style={{ color: "#F59E0B" }}>
                        No Activity ({stats.noActivityTasks.length})
                      </span>
                    </div>
                    <div className="space-y-1.5">
                      {stats.noActivityTasks.map((t) => {
                        const tsc = TASK_STATUS[t.status] ?? TASK_STATUS.todo
                        return (
                          <div key={t.id} className="flex items-center justify-between gap-2">
                            <span className="text-[12px] truncate" style={{ color: "rgba(255,255,255,0.6)" }}>{t.title}</span>
                            <span className="text-[11px] flex-shrink-0 px-2 py-0.5 rounded-full"
                              style={{ background: tsc.bg, color: tsc.color }}>{tsc.label}</span>
                          </div>
                        )
                      })}
                    </div>
                  </div>
                )}

                {/* Stuck in progress */}
                {stats.stuckTasks.length > 0 && (
                  <div className="rounded-xl p-4" style={{ background: "rgba(245,158,11,0.04)", border: "1px solid rgba(245,158,11,0.12)" }}>
                    <div className="flex items-center gap-2 mb-3">
                      <PauseCircle size={12} style={{ color: "#F59E0B" }} />
                      <span className="text-[11px] font-bold uppercase tracking-wider" style={{ color: "#F59E0B" }}>
                        Stuck &gt; 3 Days ({stats.stuckTasks.length})
                      </span>
                    </div>
                    <div className="space-y-1.5">
                      {stats.stuckTasks.map((t) => (
                        <div key={t.id} className="flex items-center gap-2">
                          <Clock size={10} style={{ color: "#F59E0B", flexShrink: 0 }} />
                          <span className="text-[12px] truncate" style={{ color: "rgba(255,255,255,0.6)" }}>{t.title}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Low hour employees */}
                {stats.lowHourEmployees.length > 0 && (
                  <div className="rounded-xl p-4" style={{ background: "rgba(255,255,255,0.02)", border: "1px solid rgba(255,255,255,0.08)" }}>
                    <div className="flex items-center gap-2 mb-3">
                      <UserX size={12} style={{ color: "rgba(255,255,255,0.45)" }} />
                      <span className="text-[11px] font-bold uppercase tracking-wider" style={{ color: "rgba(255,255,255,0.45)" }}>
                        Low Output ({stats.lowHourEmployees.length})
                      </span>
                    </div>
                    <div className="space-y-1.5">
                      {stats.lowHourEmployees.map((e) => (
                        <div key={e.employee_id} className="flex items-center justify-between gap-2">
                          <span className="text-[12px]" style={{ color: "rgba(255,255,255,0.5)" }}>{e.name}</span>
                          <span className="text-[11px] font-bold" style={{ color: "#F59E0B" }}>
                            avg {(e.hours / e.days.size).toFixed(1)}h/day
                          </span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

              </div>
            )}
          </Section>

        </div>
      </div>
    </div>
  )
}
