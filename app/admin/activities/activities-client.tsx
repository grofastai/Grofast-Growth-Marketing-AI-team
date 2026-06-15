"use client"

import { useState, useMemo } from "react"
import { useRouter, usePathname } from "next/navigation"
import { Activity, Clock, Camera, BookOpen, Filter, AlertTriangle, UserX, Target, Edit2, MapPin, ChevronDown, ChevronUp, Calendar } from "lucide-react"

type WorkEntry = Record<string, unknown>

interface TaskItem { id: string; title: string; status: string; priority: string | null }

interface Update {
  id: string
  date: string
  attendance_status: string
  work_type: string | null
  working_hours: number | null
  learning_hours: number
  learning_topic: string | null
  learning_notes: string | null
  shoot_count: number
  editing_count: number | null
  active_tab: string | null
  notes: string | null
  task_id: string | null
  work_entries: WorkEntry[] | null
  participant_ids: string[] | null
  users: { id: string; name: string; employee_id: string; role: string } | null
  tasks: { title: string } | null
  tasks_list: TaskItem[]
  tasks_completed: number
  tasks_total: number
}

interface Member { id: string; name: string; employee_id: string }

const ATTENDANCE_STYLE: Record<string, { bg: string; color: string; label: string }> = {
  present: { bg: "rgba(222,26,26,0.1)",  color: "#de1a1a", label: "Present" },
  absent:  { bg: "rgba(255,107,87,0.1)",  color: "#FF6B57", label: "Absent" },
  holiday: { bg: "rgba(245,158,11,0.1)",  color: "#F59E0B", label: "Holiday" },
  outside: { bg: "rgba(0,0,0,0.05)", color: "#4B5563", label: "Outside" },
}

const WORK_TYPE: Record<string, string> = { office: "Office", outside: "Outside", wfh: "WFH" }

function getInitials(name: string) {
  return name.split(" ").map((n) => n[0]).join("").slice(0, 2).toUpperCase()
}

function ControlFlag({ hours, attendance }: { hours: number | null; attendance: string }) {
  if (attendance !== "present") return null
  if (hours == null) return (
    <span className="text-[10px] font-bold px-2 py-0.5 rounded-full"
      style={{ background: "rgba(255,107,87,0.1)", color: "#FF6B57" }}>
      No hours logged
    </span>
  )
  if (hours < 6) return (
    <span className="flex items-center gap-1 text-[10px] font-bold px-2 py-0.5 rounded-full"
      style={{ background: "rgba(245,158,11,0.1)", color: "#F59E0B" }}>
      <AlertTriangle size={9} /> Low ({hours}h)
    </span>
  )
  return null
}

function fmtHours(h: unknown): string {
  const n = Number(h)
  if (!n) return "—"
  const hrs = Math.floor(n)
  const mins = Math.round((n - hrs) * 60)
  if (hrs && mins) return `${hrs}h ${mins}m`
  if (hrs) return `${hrs}h`
  return `${mins}m`
}

function clientLabel(entry: WorkEntry): string {
  const ct = entry._client_type as string | undefined
  const brand = entry._brand as string | undefined
  const custom = entry._custom_client as string | undefined
  const client = entry.client as string | undefined
  if (ct === "Promotion" && brand) return `📣 ${brand}`
  if (ct === "__custom__" && custom) return `✏️ ${custom}`
  return client || "—"
}

export default function ActivitiesClient({
  updates,
  members,
  from,
  to,
  memberFilter,
  onLeaveIds,
  leaveDays,
  clockInDays,
}: {
  updates: Update[]
  members: Member[]
  from: string
  to: string
  memberFilter: string
  onLeaveIds: Set<string>
  leaveDays?: Set<string>
  clockInDays?: Set<string>
}) {
  const router = useRouter()
  const pathname = usePathname()
  const [expandedIds, setExpandedIds] = useState<Set<string>>(new Set())
  const [customFrom, setCustomFrom] = useState(from)
  const [customTo, setCustomTo] = useState(to)
  const [showCustom, setShowCustom] = useState(false)

  const isSingleDay = from === to

  // Date preset helpers
  const todayDate = new Date()
  const todayStr = todayDate.toISOString().split("T")[0]
  const yesterdayStr = new Date(todayDate.getTime() - 86400000).toISOString().split("T")[0]
  const weekStartDate = new Date(todayDate)
  weekStartDate.setDate(todayDate.getDate() - (todayDate.getDay() || 7) + 1)
  const weekStartStr = weekStartDate.toISOString().split("T")[0]
  const monthStartStr = `${todayDate.getFullYear()}-${String(todayDate.getMonth() + 1).padStart(2, "0")}-01`
  const prevMonthDate = new Date(todayDate.getFullYear(), todayDate.getMonth() - 1, 1)
  const prevMonthStartStr = prevMonthDate.toISOString().split("T")[0]
  const prevMonthEndStr = new Date(todayDate.getFullYear(), todayDate.getMonth(), 0).toISOString().split("T")[0]

  const DATE_PRESETS = [
    { label: "Today",      from: todayStr,         to: todayStr },
    { label: "Yesterday",  from: yesterdayStr,     to: yesterdayStr },
    { label: "This Week",  from: weekStartStr,     to: todayStr },
    { label: "This Month", from: monthStartStr,    to: todayStr },
    { label: "Last Month", from: prevMonthStartStr, to: prevMonthEndStr },
  ]

  function toggleExpand(id: string) {
    setExpandedIds(prev => {
      const next = new Set(prev)
      next.has(id) ? next.delete(id) : next.add(id)
      return next
    })
  }

  function navigate(f: string, t: string, member: string) {
    const params = new URLSearchParams()
    if (f === t) params.set("date", f)
    else { params.set("from", f); params.set("to", t) }
    if (member) params.set("member", member)
    router.push(`${pathname}?${params.toString()}`)
  }

  // Per-member summary for multi-day range view
  const memberSummary = useMemo(() => {
    if (isSingleDay) return []
    const map: Record<string, { id: string; name: string; employee_id: string; days: number; present: number; absent: number; onLeave: number; totalHours: number }> = {}
    for (const u of updates) {
      const user = Array.isArray(u.users) ? u.users[0] : u.users
      if (!user) continue
      if (!map[user.id]) map[user.id] = { id: user.id, name: user.name, employee_id: user.employee_id, days: 0, present: 0, absent: 0, onLeave: 0, totalHours: 0 }
      const key = `${user.id}:${u.date}`
      const isLeaveDay  = leaveDays?.has(key)   ?? false
      const clockedIn   = clockInDays?.has(key) ?? false

      if (u.attendance_status === "present" || clockedIn) {
        // Count as present if they submitted present OR actually clocked in
        map[user.id].present++
        map[user.id].days++
      } else if (u.attendance_status === "absent") {
        if (isLeaveDay) {
          map[user.id].onLeave++
          map[user.id].days++
        } else {
          // Only count as absent if no clock-in and not on approved leave
          map[user.id].absent++
          map[user.id].days++
        }
      }
      map[user.id].totalHours = Math.round((map[user.id].totalHours + (u.working_hours ?? 0)) * 10) / 10
    }
    return Object.values(map).sort((a, b) => b.totalHours - a.totalHours)
  }, [updates, isSingleDay, leaveDays, clockInDays])

  const submittedIds = new Set(updates.map((u) => {
    const user = Array.isArray(u.users) ? u.users[0] : u.users
    return user?.id
  }))
  const notUpdated = (memberFilter || !isSingleDay) ? [] : members.filter((m) => !submittedIds.has(m.id) && !onLeaveIds.has(m.id))

  const presentCount = updates.filter((u) => u.attendance_status === "present").length
  const absentCount  = updates.filter((u) => u.attendance_status === "absent").length
  const totalHours   = updates.reduce((sum, u) => sum + (u.working_hours ?? 0), 0)
  const lowHoursCount = updates.filter((u) => u.attendance_status === "present" && (u.working_hours ?? 0) < 6).length

  return (
    <div className="p-4 md:p-6 xl:p-8 max-w-[1400px]">
      {/* Header */}
      <div className="mb-6">
        <h1 className="gradient-heading text-[30px] font-black leading-tight" style={{ fontFamily: "var(--font-jakarta)" }}>
          Activities
        </h1>
        <p className="text-sm mt-1" style={{ color: "#6B7280" }}>Daily updates from all team members.</p>
      </div>

      {/* Summary chips */}
      <div className="flex flex-wrap gap-2 md:gap-3 mb-5 md:mb-6">
        {[
          { label: "Updates",    value: updates.length,          color: "#111111",  bg: "#FFFFFF", border: "#E5E7EB" },
          { label: "Present",    value: presentCount,            color: "#de1a1a",  bg: "rgba(222,26,26,0.06)",  border: "rgba(222,26,26,0.15)" },
          { label: "Absent",     value: absentCount,             color: "#FF6B57",  bg: "rgba(255,107,87,0.06)",  border: "rgba(255,107,87,0.15)" },
          { label: "Total Hours",value: `${totalHours.toFixed(1)}h`, color: "#F59E0B", bg: "rgba(245,158,11,0.06)", border: "rgba(245,158,11,0.15)" },
          { label: "Not Updated",value: notUpdated.length,        color: notUpdated.length > 0 ? "#FF6B57" : "#6B7280", bg: notUpdated.length > 0 ? "rgba(255,107,87,0.06)" : "#FFFFFF", border: notUpdated.length > 0 ? "rgba(255,107,87,0.15)" : "#E5E7EB" },
        ].map((chip) => (
          <div key={chip.label} className="flex items-center gap-2 px-4 py-2 rounded-lg"
            style={{ background: chip.bg, border: `1px solid ${chip.border}` }}>
            <span className="text-[15px] font-black" style={{ fontFamily: "var(--font-jakarta)", color: chip.color }}>{chip.value}</span>
            <span className="text-[11px] font-medium" style={{ color: "#6B7280" }}>{chip.label}</span>
          </div>
        ))}
        {lowHoursCount > 0 && (
          <div className="flex items-center gap-2 px-4 py-2 rounded-lg"
            style={{ background: "rgba(245,158,11,0.06)", border: "1px solid rgba(245,158,11,0.15)" }}>
            <AlertTriangle size={13} style={{ color: "#F59E0B" }} />
            <span className="text-[11px] font-bold" style={{ color: "#F59E0B" }}>{lowHoursCount} low productivity</span>
          </div>
        )}
      </div>

      {/* Date range filters */}
      <div className="flex flex-col gap-3 mb-6">
        {/* Preset buttons */}
        <div className="flex flex-wrap items-center gap-2">
          {DATE_PRESETS.map(preset => {
            const isActive = from === preset.from && to === preset.to
            return (
              <button key={preset.label}
                onClick={() => { setShowCustom(false); navigate(preset.from, preset.to, memberFilter) }}
                className="px-3 py-1.5 rounded-lg text-[12px] font-semibold transition-all flex-shrink-0"
                style={isActive
                  ? { background: "#111111", color: "#FFFFFF" }
                  : { background: "#FFFFFF", color: "#6B7280", border: "1px solid #E5E7EB" }
                }>
                {preset.label}
              </button>
            )
          })}
          <button
            onClick={() => setShowCustom(s => !s)}
            className="px-3 py-1.5 rounded-lg text-[12px] font-semibold transition-all flex-shrink-0 flex items-center gap-1.5"
            style={showCustom
              ? { background: "#111111", color: "#FFFFFF" }
              : { background: "#FFFFFF", color: "#6B7280", border: "1px solid #E5E7EB" }
            }>
            <Filter size={11} /> Custom
          </button>
        </div>

        {/* Custom range picker */}
        {showCustom && (
          <div className="flex flex-wrap items-center gap-2 px-4 py-3 rounded-xl"
            style={{ background: "#FFFFFF", border: "1px solid #E5E7EB" }}>
            <span className="text-[12px] font-semibold text-gray-500">From</span>
            <input type="date" value={customFrom} onChange={e => setCustomFrom(e.target.value)}
              className="text-[13px] outline-none border border-gray-200 rounded-lg px-2.5 py-1.5"
              style={{ colorScheme: "light" }} />
            <span className="text-[12px] font-semibold text-gray-500">To</span>
            <input type="date" value={customTo} onChange={e => setCustomTo(e.target.value)}
              className="text-[13px] outline-none border border-gray-200 rounded-lg px-2.5 py-1.5"
              style={{ colorScheme: "light" }} />
            <button onClick={() => navigate(customFrom, customTo, memberFilter)}
              className="px-3 py-1.5 rounded-lg text-[12px] font-bold text-white"
              style={{ background: "#DE1A1A" }}>
              Apply
            </button>
          </div>
        )}

        {/* Member + date display */}
        <div className="flex flex-wrap gap-2">
          <select value={memberFilter} onChange={(e) => navigate(from, to, e.target.value)}
            className="px-3 py-2 rounded-lg text-[13px] outline-none flex-1 min-w-[160px]"
            style={{ background: "#FFFFFF", border: "1px solid #E5E7EB", color: "#111111" }}>
            <option value="">All Members</option>
            {members.map((m) => (
              <option key={m.id} value={m.id}>{m.name} ({m.employee_id})</option>
            ))}
          </select>
          {!isSingleDay && (
            <div className="flex items-center gap-1.5 px-3 py-2 rounded-lg text-[12px] font-medium text-gray-500"
              style={{ background: "#FFFFFF", border: "1px solid #E5E7EB" }}>
              <Calendar size={12} />
              {from} → {to}
            </div>
          )}
        </div>
      </div>

      {/* Multi-day summary table */}
      {!isSingleDay && memberSummary.length > 0 && (
        <div className="rounded-xl overflow-hidden mb-6" style={{ background: "#FFFFFF", border: "1px solid #E5E7EB" }}>
          <div className="px-5 py-3 flex items-center gap-2" style={{ borderBottom: "1px solid #F3F4F6", background: "#FAFAFA" }}>
            <Activity size={13} style={{ color: "#6B7280" }} />
            <span className="text-[11px] font-bold uppercase tracking-wider text-gray-500">Member Summary — {from} to {to}</span>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr style={{ borderBottom: "1px solid #F3F4F6" }}>
                  {["Member", "Days Updated", "Present", "Absent", "On Leave", "Total Hours", "Avg / Day", ""].map(h => (
                    <th key={h} className="px-4 py-2.5 text-left text-[10px] font-bold uppercase tracking-wider text-gray-400">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {memberSummary.map((m, i) => {
                  const avg = m.days > 0 ? Math.round(m.totalHours / m.days * 10) / 10 : 0
                  const lowAvg = avg < 6 && m.present > 0
                  return (
                    <tr key={m.id} style={{ borderBottom: i < memberSummary.length - 1 ? "1px solid #F9FAFB" : "none" }}
                      className="hover:bg-gray-50 transition-colors">
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-2.5">
                          <div className="w-7 h-7 rounded-full flex items-center justify-center flex-shrink-0 text-[10px] font-bold"
                            style={{ background: "rgba(222,26,26,0.08)", color: "#de1a1a" }}>
                            {getInitials(m.name)}
                          </div>
                          <div>
                            <p className="text-[13px] font-semibold text-gray-800">{m.name}</p>
                            <p className="text-[10px] text-gray-400">#{m.employee_id}</p>
                          </div>
                        </div>
                      </td>
                      <td className="px-4 py-3 text-[13px] font-semibold text-gray-700">{m.days}</td>
                      <td className="px-4 py-3">
                        <span className="text-[12px] font-bold px-2 py-0.5 rounded-full" style={{ background: "rgba(34,197,94,0.08)", color: "#16a34a" }}>{m.present}</span>
                      </td>
                      <td className="px-4 py-3">
                        {m.absent > 0
                          ? <span className="text-[12px] font-bold px-2 py-0.5 rounded-full" style={{ background: "rgba(239,68,68,0.08)", color: "#dc2626" }}>{m.absent}</span>
                          : <span className="text-[12px] text-gray-300">—</span>
                        }
                      </td>
                      <td className="px-4 py-3">
                        {m.onLeave > 0
                          ? <span className="text-[12px] font-bold px-2 py-0.5 rounded-full" style={{ background: "rgba(99,102,241,0.08)", color: "#6366F1" }}>{m.onLeave}</span>
                          : <span className="text-[12px] text-gray-300">—</span>
                        }
                      </td>
                      <td className="px-4 py-3 text-[13px] font-bold text-gray-800">{m.totalHours}h</td>
                      <td className="px-4 py-3">
                        <span className="text-[12px] font-semibold" style={{ color: lowAvg ? "#f59e0b" : "#374151" }}>
                          {avg}h {lowAvg ? "⚠" : ""}
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        <button onClick={() => navigate(from, to, m.id)}
                          className="text-[11px] font-semibold text-gray-400 hover:text-gray-700 transition-colors">
                          Filter →
                        </button>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Not updated members */}
      {notUpdated.length > 0 && (
        <div className="rounded-xl p-4 mb-5" style={{ background: "rgba(255,107,87,0.04)", border: "1px solid rgba(255,107,87,0.15)" }}>
          <div className="flex items-center gap-2 mb-3">
            <UserX size={13} style={{ color: "#FF6B57" }} />
            <span className="text-[12px] font-bold uppercase tracking-wider" style={{ color: "#FF6B57" }}>
              Not Updated ({notUpdated.length})
            </span>
          </div>
          <div className="flex flex-wrap gap-2">
            {notUpdated.map((m) => (
              <span key={m.id} className="text-[12px] font-semibold px-3 py-1 rounded-full"
                style={{ background: "rgba(255,107,87,0.1)", color: "#FF6B57" }}>
                {m.name} <span style={{ opacity: 0.6 }}>#{m.employee_id}</span>
              </span>
            ))}
          </div>
        </div>
      )}

      {/* Updates list */}
      {updates.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-24 rounded-xl"
          style={{ background: "#FFFFFF", border: "1px solid #2A2A2A" }}>
          <Activity size={36} style={{ color: "rgba(0,0,0,0.06)" }} className="mb-3" />
          <p className="text-[14px] font-semibold" style={{ color: "#6B7280" }}>No updates for this date</p>
          <p className="text-[12px] mt-1" style={{ color: "rgba(0,0,0,0.08)" }}>Team members haven&apos;t submitted yet.</p>
        </div>
      ) : (
        <div className="space-y-2">
          {updates.map((u) => {
            const sc = ATTENDANCE_STYLE[u.attendance_status] ?? ATTENDANCE_STYLE.present
            const wt = u.work_type ? WORK_TYPE[u.work_type] : null
            const user = Array.isArray(u.users) ? u.users[0] : u.users
            const isExpanded = expandedIds.has(u.id)
            const entries = Array.isArray(u.work_entries) ? u.work_entries : []
            const workEntries  = entries.filter(e => e.task_type === "work")
            const shootEntries = entries.filter(e => e.task_type === "shoot")
            const editEntries  = entries.filter(e => e.task_type === "edit")
            const otherEntries = entries.filter(e => !["work","shoot","edit"].includes(String(e.task_type ?? "")))
            const allWorkLike  = [...workEntries, ...otherEntries]
            const workHrs  = Math.round(allWorkLike.reduce((s, e) => s + (Number(e.duration_hours) || 0), 0) * 10) / 10
            const mediaHrs = Math.round([...shootEntries,...editEntries].reduce((s, e) => s + (Number(e.duration_hours) || 0), 0) * 10) / 10
            const hasMedia = shootEntries.length > 0 || editEntries.length > 0
            const tasksCompleted = u.tasks_completed ?? 0
            const tasksTotal = u.tasks_total ?? 0
            const tasksList = u.tasks_list ?? []
            const hasDetails = entries.length > 0 || u.active_tab === "learning" || tasksList.length > 0

            return (
              <div key={u.id} className="rounded-xl overflow-hidden"
                style={{ background: "#FFFFFF", border: "1px solid #E5E7EB" }}>

                {/* ── Compact header row ── */}
                <div className="p-4 md:p-5">
                  <div className="flex items-center gap-3">
                    {/* Avatar */}
                    <div className="w-10 h-10 rounded-full flex items-center justify-center flex-shrink-0"
                      style={{ background: "rgba(222,26,26,0.08)", border: "1px solid rgba(222,26,26,0.15)" }}>
                      <span className="text-[11px] font-bold" style={{ color: "#de1a1a" }}>
                        {user?.name ? getInitials(user.name) : "?"}
                      </span>
                    </div>

                    {/* Name + badges */}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center flex-wrap gap-2 mb-2">
                        <p className="text-[14px] font-bold" style={{ color: "#111111" }}>{user?.name ?? "Unknown"}</p>
                        <span className="text-[11px]" style={{ color: "#9CA3AF" }}>#{user?.employee_id}</span>
                        <span className="text-[11px] font-bold px-2 py-0.5 rounded-full" style={{ background: sc.bg, color: sc.color }}>{sc.label}</span>
                        {wt && <span className="text-[11px] px-2 py-0.5 rounded-full" style={{ background: "rgba(0,0,0,0.04)", color: "#6B7280" }}>{wt}</span>}
                        <ControlFlag hours={u.working_hours} attendance={u.attendance_status} />
                      </div>

                      {/* Stat chips */}
                      <div className="flex flex-wrap gap-2">
                        {allWorkLike.length > 0 ? (
                          <span className="flex items-center gap-1 px-2.5 py-1 rounded-lg text-[11px] font-semibold"
                            style={{ background: "rgba(0,0,0,0.03)", border: "1px solid #F0F1F5", color: "#374151" }}>
                            <Clock size={10} style={{ color: "#6B7280" }} />
                            Work · {fmtHours(workHrs)}
                          </span>
                        ) : u.working_hours != null ? (
                          <span className="flex items-center gap-1 px-2.5 py-1 rounded-lg text-[11px]"
                            style={{ background: "rgba(0,0,0,0.03)", border: "1px solid #F0F1F5", color: "#6B7280" }}>
                            <Clock size={10} /> {u.working_hours}h
                          </span>
                        ) : null}
                        {hasMedia && (
                          <span className="flex items-center gap-1 px-2.5 py-1 rounded-lg text-[11px] font-semibold"
                            style={{ background: "rgba(222,26,26,0.04)", border: "1px solid rgba(222,26,26,0.12)", color: "#de1a1a" }}>
                            <Camera size={10} />
                            Media · {fmtHours(mediaHrs)}
                            <span style={{ opacity: 0.6, fontWeight: 400 }}>
                              {shootEntries.length > 0 ? ` ${shootEntries.length}S` : ""}
                              {editEntries.length > 0 ? ` ${editEntries.length}E` : ""}
                            </span>
                          </span>
                        )}
                        {(u.learning_hours ?? 0) > 0 && (
                          <span className="flex items-center gap-1 px-2.5 py-1 rounded-lg text-[11px] font-semibold"
                            style={{ background: "rgba(99,102,241,0.05)", border: "1px solid rgba(99,102,241,0.15)", color: "#6366F1" }}>
                            <BookOpen size={10} />
                            Learning · {fmtHours(u.learning_hours)}
                          </span>
                        )}
                        {tasksTotal > 0 && (
                          <span className="flex items-center gap-1 px-2.5 py-1 rounded-lg text-[11px] font-semibold"
                            style={{
                              background: tasksCompleted === tasksTotal ? "rgba(34,197,94,0.06)" : "rgba(245,158,11,0.06)",
                              border: `1px solid ${tasksCompleted === tasksTotal ? "rgba(34,197,94,0.2)" : "rgba(245,158,11,0.2)"}`,
                              color: tasksCompleted === tasksTotal ? "#22C55E" : "#F59E0B",
                            }}>
                            <Target size={10} />
                            Tasks · {tasksCompleted}/{tasksTotal}
                          </span>
                        )}
                      </div>

                      {/* Clients worked on */}
                      {(() => {
                        const clientsWorked = [...new Set(entries.flatMap(e => {
                          if (e.task_type === "break") return []
                          const names: string[] = []
                          if (Array.isArray(e.client_names) && (e.client_names as string[]).length > 0)
                            names.push(...(e.client_names as string[]))
                          else if (e.client_name && e.client_name !== "Break" && e.client_name !== "Internal")
                            names.push(e.client_name as string)
                          if (e._brand) names.push(e._brand as string)
                          else if (e._custom_client) names.push(e._custom_client as string)
                          else if (e.client && !names.length) names.push(e.client as string)
                          return names
                        }).filter(Boolean))]
                        if (clientsWorked.length === 0) return null
                        return (
                          <div className="flex items-center gap-2 flex-wrap mt-1.5">
                            <span className="text-[10px] font-bold uppercase tracking-wider" style={{ color: "#9CA3AF" }}>🏢 Client</span>
                            {clientsWorked.map(c => (
                              <span key={c} className="px-2 py-0.5 rounded-full text-[11px] font-semibold"
                                style={{ background: "rgba(222,26,26,0.07)", border: "1px solid rgba(222,26,26,0.15)", color: "#de1a1a" }}>
                                {c}
                              </span>
                            ))}
                          </div>
                        )
                      })()}

                      {/* Participants */}
                      {(u.participant_ids ?? []).length > 0 && (() => {
                        const participants = (u.participant_ids ?? [])
                          .map(pid => members.find(m => m.id === pid))
                          .filter(Boolean)
                        if (participants.length === 0) return null
                        return (
                          <div className="flex items-center gap-2 flex-wrap mt-1.5">
                            <span className="text-[10px] font-bold uppercase tracking-wider" style={{ color: "#9CA3AF" }}>👥 With</span>
                            {participants.map(p => (
                              <span key={p!.id} className="flex items-center gap-1.5 px-2 py-0.5 rounded-full text-[11px] font-semibold"
                                style={{ background: "rgba(99,102,241,0.08)", border: "1px solid rgba(99,102,241,0.2)", color: "#6366F1" }}>
                                <span style={{ width: 16, height: 16, borderRadius: "50%", background: "#6366F1", display: "inline-flex", alignItems: "center", justifyContent: "center", fontSize: 8, fontWeight: 900, color: "#fff" }}>
                                  {p!.name.split(" ").map((n: string) => n[0]).join("").slice(0,2)}
                                </span>
                                {p!.name.split(" ")[0]}
                              </span>
                            ))}
                          </div>
                        )
                      })()}
                    </div>

                    {/* View Details button */}
                    {hasDetails && (
                      <button onClick={() => toggleExpand(u.id)}
                        className="flex items-center gap-1.5 px-3 py-2 rounded-lg text-[12px] font-semibold flex-shrink-0 transition-all"
                        style={{
                          background: isExpanded ? "rgba(222,26,26,0.08)" : "#F9FAFB",
                          color: isExpanded ? "#de1a1a" : "#374151",
                          border: `1px solid ${isExpanded ? "rgba(222,26,26,0.2)" : "#E5E7EB"}`,
                        }}>
                        {isExpanded ? <ChevronUp size={13} /> : <ChevronDown size={13} />}
                        {isExpanded ? "Hide" : "View Details"}
                      </button>
                    )}
                  </div>
                </div>

                {/* ── Expanded Details ── */}
                {isExpanded && (
                  <div className="border-t px-4 md:px-5 py-4 space-y-4" style={{ borderColor: "#F3F4F6", background: "#FAFAFA" }}>

                    {/* Work entries */}
                    {allWorkLike.length > 0 && (
                      <div>
                        <p className="text-[10px] font-bold uppercase tracking-wider mb-2" style={{ color: "#9CA3AF" }}>Work · {fmtHours(workHrs)}</p>
                        <div className="space-y-1.5">
                          {allWorkLike.map((e, i) => (
                            <div key={i} className="flex items-center gap-3 px-3 py-2.5 rounded-lg bg-white"
                              style={{ border: "1px solid #F3F4F6" }}>
                              <div className="flex-1 min-w-0">
                                <p className="text-[12px] font-semibold" style={{ color: "#111827" }}>{String(e.title || e.task_title || "—")}</p>
                                {!!(e.client || e._custom_client) && (
                                  <p className="text-[11px] mt-0.5" style={{ color: "#de1a1a" }}>{String(e.client || e._custom_client)}</p>
                                )}
                              </div>
                              <div className="flex-shrink-0 text-right">
                                {!!(e.start_time || e.end_time) && <p className="text-[10px]" style={{ color: "#9CA3AF" }}>{String(e.start_time ?? "")} – {String(e.end_time ?? "")}</p>}
                                <p className="text-[12px] font-bold" style={{ color: "#374151" }}>{fmtHours(e.duration_hours)}</p>
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}

                    {/* Media entries */}
                    {hasMedia && (
                      <div>
                        <p className="text-[10px] font-bold uppercase tracking-wider mb-2" style={{ color: "#9CA3AF" }}>
                          Media · {fmtHours(mediaHrs)} · {shootEntries.length} shoot{shootEntries.length !== 1 ? "s" : ""} {editEntries.length > 0 ? `· ${editEntries.length} edit${editEntries.length !== 1 ? "s" : ""}` : ""}
                        </p>
                        <div className="space-y-1.5">
                          {[...shootEntries, ...editEntries].map((e, i) => {
                            const isShoot = e.task_type === "shoot"
                            return (
                              <div key={i} className="flex items-center gap-3 px-3 py-2.5 rounded-lg"
                                style={{ background: isShoot ? "rgba(222,26,26,0.03)" : "rgba(99,102,241,0.03)", border: `1px solid ${isShoot ? "rgba(222,26,26,0.1)" : "rgba(99,102,241,0.1)"}` }}>
                                {isShoot ? <Camera size={12} style={{ color: "#de1a1a", flexShrink: 0 }} /> : <Edit2 size={12} style={{ color: "#6366F1", flexShrink: 0 }} />}
                                <div className="flex-1 min-w-0">
                                  <p className="text-[12px] font-semibold" style={{ color: "#111827" }}>{String(e.title || "—")}</p>
                                  {!!(e._brand || e._custom_client || e.client) && (
                                    <p className="text-[11px]" style={{ color: isShoot ? "#de1a1a" : "#6366F1" }}>{String(e._brand || e._custom_client || e.client)}</p>
                                  )}
                                  {!!e._location && <p className="text-[10px] flex items-center gap-1 mt-0.5" style={{ color: "#9CA3AF" }}><MapPin size={9} />{String(e._location)}</p>}
                                </div>
                                <p className="text-[12px] font-bold flex-shrink-0" style={{ color: "#374151" }}>{fmtHours(e.duration_hours)}</p>
                              </div>
                            )
                          })}
                        </div>
                      </div>
                    )}

                    {/* Learning */}
                    {u.active_tab === "learning" && (
                      <div>
                        <p className="text-[10px] font-bold uppercase tracking-wider mb-2" style={{ color: "#9CA3AF" }}>Learning · {fmtHours(u.learning_hours)}</p>
                        <div className="px-3 py-2.5 rounded-lg" style={{ background: "rgba(99,102,241,0.05)", border: "1px solid rgba(99,102,241,0.15)" }}>
                          <div className="flex items-center gap-2 mb-1">
                            <BookOpen size={12} style={{ color: "#6366F1" }} />
                            <span className="text-[12px] font-semibold" style={{ color: "#6366F1" }}>{u.learning_topic ?? "—"}</span>
                          </div>
                          {u.learning_notes && <p className="text-[11px] ml-5" style={{ color: "#6B7280" }}>{u.learning_notes}</p>}
                        </div>
                      </div>
                    )}

                    {/* Tasks list */}
                    {tasksList.length > 0 && (
                      <div>
                        <p className="text-[10px] font-bold uppercase tracking-wider mb-2" style={{ color: "#9CA3AF" }}>Tasks · {tasksCompleted}/{tasksTotal} completed</p>
                        <div className="space-y-1.5">
                          {tasksList.map((t) => {
                            const done = t.status === "completed"
                            const inProg = t.status === "in_progress"
                            return (
                              <div key={t.id} className="flex items-center gap-2.5 px-3 py-2 rounded-lg bg-white"
                                style={{ border: `1px solid ${done ? "rgba(34,197,94,0.15)" : "#F3F4F6"}` }}>
                                <div className="w-4 h-4 rounded-full flex-shrink-0 flex items-center justify-center"
                                  style={{ background: done ? "#22C55E" : inProg ? "#F59E0B" : "#E5E7EB" }}>
                                  {done && <span style={{ color: "#fff", fontSize: 9 }}>✓</span>}
                                  {inProg && <span style={{ color: "#fff", fontSize: 9 }}>→</span>}
                                </div>
                                <span className="flex-1 text-[12px] font-medium" style={{ color: done ? "#9CA3AF" : "#111827", textDecoration: done ? "line-through" : "none" }}>{t.title}</span>
                                <span className="text-[10px] font-bold px-2 py-0.5 rounded-full flex-shrink-0"
                                  style={{ background: done ? "rgba(34,197,94,0.1)" : inProg ? "rgba(245,158,11,0.1)" : "rgba(0,0,0,0.05)", color: done ? "#22C55E" : inProg ? "#F59E0B" : "#9CA3AF" }}>
                                  {done ? "Done" : inProg ? "In Progress" : "To Do"}
                                </span>
                              </div>
                            )
                          })}
                        </div>
                      </div>
                    )}

                    {entries.length === 0 && u.active_tab !== "learning" && (
                      <p className="text-[12px] italic" style={{ color: "#D1D5DB" }}>No detailed work entries recorded for this day.</p>
                    )}
                  </div>
                )}
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
