"use client"

import { useState, useMemo } from "react"
import { useRouter, usePathname } from "next/navigation"
import {
  Activity, Clock, Camera, BookOpen, Filter, AlertTriangle,
  Target, Edit2, MapPin, ChevronDown, ChevronUp,
  Calendar, Users, BarChart2, GraduationCap, Building2, Bell, TrendingUp,
} from "lucide-react"

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
  users: { id: string; name: string; employee_id: string; role: string; team?: string | null } | null
  tasks: { title: string } | null
  tasks_list: TaskItem[]
  tasks_completed: number
  tasks_total: number
}

interface Member { id: string; name: string; employee_id: string; team?: string | null; role?: string }
interface PendingLeave { id: string; user_id: string; from_date: string; to_date: string; reason: string | null }
interface PendingCollab { collaborator_id: string; date: string; status: string }

const ATTENDANCE_STYLE: Record<string, { bg: string; color: string; label: string }> = {
  present: { bg: "rgba(34,197,94,0.08)",  color: "#16a34a", label: "Present" },
  absent:  { bg: "rgba(239,68,68,0.08)",  color: "#dc2626", label: "On Leave" },
  leave:   { bg: "rgba(239,68,68,0.08)",  color: "#dc2626", label: "On Leave" },
  holiday: { bg: "rgba(245,158,11,0.08)", color: "#d97706", label: "Holiday" },
  outside: { bg: "rgba(99,102,241,0.08)", color: "#6366F1", label: "Outside" },
}

const WORK_TYPE: Record<string, string> = { office: "Office", outside: "Outside", wfh: "WFH" }

function getInitials(name: string) {
  return name.split(" ").map(n => n[0]).join("").slice(0, 2).toUpperCase()
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

function getClientNames(entries: WorkEntry[]): string[] {
  const names = new Set<string>()
  for (const e of entries) {
    if (e.task_type === "break") continue
    if (e.is_multi_client && Array.isArray(e.client_names)) {
      ;(e.client_names as string[]).forEach(c => c && names.add(c))
    } else if (e._brand) {
      names.add(e._brand as string)
    } else if (e._custom_client) {
      names.add(e._custom_client as string)
    } else if (e.client_name) {
      names.add(e.client_name as string)
    } else if (e.client) {
      names.add(e.client as string)
    }
  }
  return Array.from(names)
}

function perfTier(hours: number) {
  if (hours >= 8) return { label: "High",        color: "#16a34a", bg: "rgba(34,197,94,0.1)"  }
  if (hours >= 4) return { label: "Average",     color: "#d97706", bg: "rgba(245,158,11,0.1)" }
  return               { label: "Needs Review", color: "#dc2626", bg: "rgba(239,68,68,0.1)"  }
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
  collabHoursMap = {},
  pendingLeaves = [],
  pendingCollabs = [],
}: {
  updates: Update[]
  members: Member[]
  from: string
  to: string
  memberFilter: string
  onLeaveIds: Set<string>
  leaveDays?: Set<string>
  clockInDays?: Set<string>
  collabHoursMap?: Record<string, number>
  pendingLeaves?: PendingLeave[]
  pendingCollabs?: PendingCollab[]
}) {
  const router = useRouter()
  const pathname = usePathname()
  const [expandedIds, setExpandedIds] = useState<Set<string>>(new Set())
  const [customFrom, setCustomFrom] = useState(from)
  const [customTo, setCustomTo]     = useState(to)
  const [showCustom, setShowCustom] = useState(false)
  const [teamFilter, setTeamFilter] = useState("")
  const [activeTab, setActiveTab]   = useState<"team" | "clients" | "workload" | "learning">("team")

  const isSingleDay = from === to

  const todayDate        = new Date()
  const todayStr         = todayDate.toISOString().split("T")[0]
  const yesterdayStr     = new Date(todayDate.getTime() - 86400000).toISOString().split("T")[0]
  const weekStart        = new Date(todayDate); weekStart.setDate(todayDate.getDate() - (todayDate.getDay() || 7) + 1)
  const weekStartStr     = weekStart.toISOString().split("T")[0]
  const monthStartStr    = `${todayDate.getFullYear()}-${String(todayDate.getMonth() + 1).padStart(2, "0")}-01`
  const prevMonthStart   = new Date(todayDate.getFullYear(), todayDate.getMonth() - 1, 1)
  const prevMonthStartStr = prevMonthStart.toISOString().split("T")[0]
  const prevMonthEndStr  = new Date(todayDate.getFullYear(), todayDate.getMonth(), 0).toISOString().split("T")[0]

  const DATE_PRESETS = [
    { label: "Today",      from: todayStr,          to: todayStr },
    { label: "Yesterday",  from: yesterdayStr,      to: yesterdayStr },
    { label: "This Week",  from: weekStartStr,      to: todayStr },
    { label: "This Month", from: monthStartStr,     to: todayStr },
    { label: "Last Month", from: prevMonthStartStr, to: prevMonthEndStr },
  ]

  const teamOptions = useMemo(() => {
    const teams = new Set(members.map(m => m.team).filter(Boolean) as string[])
    return Array.from(teams).sort()
  }, [members])

  function toggleExpand(id: string) {
    setExpandedIds(prev => { const n = new Set(prev); n.has(id) ? n.delete(id) : n.add(id); return n })
  }

  function navigate(f: string, t: string, member: string) {
    const p = new URLSearchParams()
    if (f === t) p.set("date", f)
    else { p.set("from", f); p.set("to", t) }
    if (member) p.set("member", member)
    router.push(`${pathname}?${p.toString()}`)
  }

  const filteredUpdates = useMemo(() => {
    if (!teamFilter) return updates
    return updates.filter(u => {
      const user = Array.isArray(u.users) ? u.users[0] : u.users
      if (!user) return false
      return members.find(m => m.id === user.id)?.team === teamFilter
    })
  }, [updates, teamFilter, members])

  const filteredMembers = useMemo(() => {
    if (!teamFilter) return members
    return members.filter(m => m.team === teamFilter)
  }, [members, teamFilter])

  // ── Summary ──────────────────────────────────────────────────────────────
  const summary = useMemo(() => {
    let present = 0, leave = 0, holiday = 0, outside = 0
    let totalHours = 0, totalTasks = 0, high = 0, avg = 0, needsReview = 0
    const allClients = new Set<string>()

    for (const u of filteredUpdates) {
      const user    = Array.isArray(u.users) ? u.users[0] : u.users
      const collabH = user ? (collabHoursMap[`${user.id}:${u.date}`] ?? 0) : 0
      const hrs     = (u.working_hours ?? 0) + collabH
      const entries = (Array.isArray(u.work_entries) ? u.work_entries : []) as WorkEntry[]

      if (u.attendance_status === "present") {
        present++
        if (u.work_type === "outside") outside++
        if (isSingleDay) {
          if (hrs >= 8) high++
          else if (hrs >= 4) avg++
          else needsReview++
        }
      } else if (u.attendance_status === "leave" || u.attendance_status === "absent") {
        leave++
      } else if (u.attendance_status === "holiday") {
        holiday++
      }

      totalHours += hrs
      totalTasks += u.tasks_completed ?? 0
      getClientNames(entries).forEach(c => allClients.add(c))
    }

    const submittedIds = new Set(filteredUpdates.map(u => {
      const user = Array.isArray(u.users) ? u.users[0] : u.users
      return user?.id
    }).filter(Boolean))

    const notUpdated = (isSingleDay && !memberFilter)
      ? filteredMembers.filter(m => !submittedIds.has(m.id) && !onLeaveIds.has(m.id))
      : []
    needsReview += notUpdated.length

    return {
      present, leave, holiday, outside,
      totalHours: Math.round(totalHours * 10) / 10,
      totalClients: allClients.size,
      totalTasks, high, avg, needsReview, notUpdated,
    }
  }, [filteredUpdates, filteredMembers, collabHoursMap, isSingleDay, memberFilter, onLeaveIds])

  // ── Attention Required ───────────────────────────────────────────────────
  const attention = useMemo(() => {
    if (!isSingleDay) return { noUpdate: [] as Member[], lowHours: [] as { name: string; hours: number }[], pendingCollabMembers: [] as { name: string; count: number }[] }

    const lowHours = filteredUpdates
      .filter(u => {
        const user    = Array.isArray(u.users) ? u.users[0] : u.users
        const collabH = user ? (collabHoursMap[`${user.id}:${u.date}`] ?? 0) : 0
        const hrs     = (u.working_hours ?? 0) + collabH
        return u.attendance_status === "present" && hrs > 0 && hrs < 4
      })
      .map(u => {
        const user    = Array.isArray(u.users) ? u.users[0] : u.users
        const collabH = user ? (collabHoursMap[`${user.id}:${u.date}`] ?? 0) : 0
        return { name: user?.name ?? "Unknown", hours: (u.working_hours ?? 0) + collabH }
      })

    const pendingCollabMap: Record<string, number> = {}
    for (const pc of pendingCollabs) {
      if (pc.date >= from && pc.date <= to) {
        const m = members.find(m => m.id === pc.collaborator_id)
        if (m) pendingCollabMap[m.name] = (pendingCollabMap[m.name] ?? 0) + 1
      }
    }

    return {
      noUpdate: summary.notUpdated,
      lowHours,
      pendingCollabMembers: Object.entries(pendingCollabMap).map(([name, count]) => ({ name, count })),
    }
  }, [filteredUpdates, summary.notUpdated, pendingCollabs, members, from, to, isSingleDay, collabHoursMap])

  const totalAttention      = attention.noUpdate.length + attention.lowHours.length + attention.pendingCollabMembers.length
  const pendingActionsTotal = pendingLeaves.length + pendingCollabs.length

  // ── Client Activity Monitor ──────────────────────────────────────────────
  const clientActivity = useMemo(() => {
    const map: Record<string, { memberName: string; taskType: string; title: string; duration: number }[]> = {}
    for (const u of filteredUpdates) {
      const user = Array.isArray(u.users) ? u.users[0] : u.users
      if (!user) continue
      const entries = (Array.isArray(u.work_entries) ? u.work_entries : []) as WorkEntry[]
      for (const e of entries) {
        if (e.task_type === "break") continue
        const duration  = Number(e.duration_hours) || 0
        const taskType  = String(e.task_type || "work")
        const title     = String(e.title || e.task_title || "")
        const clientNames: string[] = []
        if (e.is_multi_client && Array.isArray(e.client_names)) clientNames.push(...(e.client_names as string[]).filter(Boolean))
        else if (e._brand)         clientNames.push(e._brand as string)
        else if (e._custom_client) clientNames.push(e._custom_client as string)
        else if (e.client_name)    clientNames.push(e.client_name as string)
        else if (e.client)         clientNames.push(e.client as string)
        for (const cn of clientNames) {
          if (!map[cn]) map[cn] = []
          map[cn].push({ memberName: user.name, taskType, title, duration })
        }
      }
    }
    return Object.entries(map)
      .map(([client, entries]) => ({ client, entries, totalHours: entries.reduce((s, e) => s + e.duration, 0) }))
      .sort((a, b) => b.totalHours - a.totalHours)
  }, [filteredUpdates])

  // ── Workload Monitor ─────────────────────────────────────────────────────
  const workloadData = useMemo(() => {
    const map: Record<string, { name: string; employee_id: string; hours: number; hasUpdate: boolean }> = {}
    for (const u of filteredUpdates) {
      const user = Array.isArray(u.users) ? u.users[0] : u.users
      if (!user || u.attendance_status !== "present") continue
      const collabH = collabHoursMap[`${user.id}:${u.date}`] ?? 0
      const hrs     = (u.working_hours ?? 0) + collabH
      if (!map[user.id]) map[user.id] = { name: user.name, employee_id: user.employee_id, hours: 0, hasUpdate: false }
      map[user.id].hours += hrs
      map[user.id].hasUpdate = true
    }
    if (isSingleDay) {
      const submitted = new Set(Object.keys(map))
      for (const m of filteredMembers) {
        if (!submitted.has(m.id) && !onLeaveIds.has(m.id))
          map[m.id] = { name: m.name, employee_id: m.employee_id, hours: 0, hasUpdate: false }
      }
    }
    const maxH = Math.max(...Object.values(map).map(m => m.hours), 1)
    return Object.values(map).sort((a, b) => b.hours - a.hours).map(m => ({
      ...m,
      pct:    Math.round((m.hours / maxH) * 100),
      status: !m.hasUpdate ? "no-update" : m.hours >= 9 ? "overloaded" : m.hours >= 4 ? "balanced" : "low",
    }))
  }, [filteredUpdates, filteredMembers, collabHoursMap, isSingleDay, onLeaveIds])

  // ── Learning Tracker ─────────────────────────────────────────────────────
  const learningData = useMemo(() => {
    const submitted = filteredUpdates
      .filter(u => (u.learning_hours ?? 0) > 0)
      .map(u => {
        const user = Array.isArray(u.users) ? u.users[0] : u.users
        return { name: user?.name ?? "Unknown", topic: u.learning_topic ?? "—", hours: u.learning_hours ?? 0, notes: u.learning_notes ?? null }
      })
    const submittedNames = new Set(submitted.map(s => s.name))
    const missing = filteredUpdates
      .filter(u => u.attendance_status === "present" && (u.learning_hours ?? 0) === 0)
      .map(u => { const user = Array.isArray(u.users) ? u.users[0] : u.users; return user?.name ?? "Unknown" })
      .filter(name => !submittedNames.has(name))
    return { submitted, missing }
  }, [filteredUpdates])

  // ── Multi-day member summary ─────────────────────────────────────────────
  const memberSummary = useMemo(() => {
    if (isSingleDay) return []
    const map: Record<string, { id: string; name: string; employee_id: string; days: number; present: number; absent: number; onLeave: number; totalHours: number }> = {}
    for (const u of filteredUpdates) {
      const user = Array.isArray(u.users) ? u.users[0] : u.users
      if (!user) continue
      if (!map[user.id]) map[user.id] = { id: user.id, name: user.name, employee_id: user.employee_id, days: 0, present: 0, absent: 0, onLeave: 0, totalHours: 0 }
      const key        = `${user.id}:${u.date}`
      const isLeaveDay = leaveDays?.has(key) ?? false
      const clockedIn  = clockInDays?.has(key) ?? false
      if (u.attendance_status === "present" || clockedIn) { map[user.id].present++; map[user.id].days++ }
      else if (u.attendance_status === "leave" || u.attendance_status === "absent") {
        if (isLeaveDay) { map[user.id].onLeave++; map[user.id].days++ }
        else { map[user.id].absent++; map[user.id].days++ }
      }
      const collabH = collabHoursMap[`${user.id}:${u.date}`] ?? 0
      map[user.id].totalHours = Math.round((map[user.id].totalHours + (u.working_hours ?? 0) + collabH) * 10) / 10
    }
    return Object.values(map).sort((a, b) => b.totalHours - a.totalHours)
  }, [filteredUpdates, isSingleDay, leaveDays, clockInDays, collabHoursMap])

  const tabs = [
    { key: "team",     label: "Team",     Icon: Users },
    ...(isSingleDay ? [
      { key: "clients",  label: "Clients",  Icon: Building2 },
      { key: "workload", label: "Workload", Icon: BarChart2 },
      { key: "learning", label: "Learning", Icon: GraduationCap },
    ] : []),
  ] as { key: string; label: string; Icon: React.ElementType }[]

  // ─────────────────────────────────────────────────────────────────────────
  return (
    <div style={{ padding: "24px 24px 64px", maxWidth: 1400, margin: "0 auto" }}>

      {/* Header */}
      <div style={{ marginBottom: 20 }}>
        <h1 className="gradient-heading" style={{ fontSize: 28, fontWeight: 900, lineHeight: 1.2, fontFamily: "var(--font-jakarta)" }}>
          Activities
        </h1>
        <p style={{ fontSize: 13, color: "#6B7280", marginTop: 4 }}>Daily operations monitor — attendance, work, clients &amp; performance.</p>
      </div>

      {/* Filters */}
      <div style={{ display: "flex", flexDirection: "column", gap: 8, marginBottom: 20 }}>
        <div style={{ display: "flex", flexWrap: "wrap", gap: 6, alignItems: "center" }}>
          {DATE_PRESETS.map(p => {
            const active = from === p.from && to === p.to
            return (
              <button key={p.label} onClick={() => { setShowCustom(false); navigate(p.from, p.to, memberFilter) }}
                style={{ padding: "6px 14px", borderRadius: 8, fontSize: 12, fontWeight: 600, cursor: "pointer", border: "1px solid transparent", background: active ? "#111" : "#F3F4F6", color: active ? "#fff" : "#6B7280" }}>
                {p.label}
              </button>
            )
          })}
          <button onClick={() => setShowCustom(s => !s)}
            style={{ display: "flex", alignItems: "center", gap: 5, padding: "6px 12px", borderRadius: 8, fontSize: 12, fontWeight: 600, cursor: "pointer", border: "1px solid #E5E7EB", background: showCustom ? "#111" : "#fff", color: showCustom ? "#fff" : "#6B7280" }}>
            <Filter size={11} /> Custom
          </button>
        </div>
        {showCustom && (
          <div style={{ display: "flex", flexWrap: "wrap", alignItems: "center", gap: 8, padding: "10px 14px", borderRadius: 10, background: "#fff", border: "1px solid #E5E7EB" }}>
            <span style={{ fontSize: 12, color: "#6B7280", fontWeight: 600 }}>From</span>
            <input type="date" value={customFrom} onChange={e => setCustomFrom(e.target.value)} style={{ fontSize: 13, border: "1px solid #E5E7EB", borderRadius: 8, padding: "4px 10px", outline: "none", colorScheme: "light" as const }} />
            <span style={{ fontSize: 12, color: "#6B7280", fontWeight: 600 }}>To</span>
            <input type="date" value={customTo}   onChange={e => setCustomTo(e.target.value)}   style={{ fontSize: 13, border: "1px solid #E5E7EB", borderRadius: 8, padding: "4px 10px", outline: "none", colorScheme: "light" as const }} />
            <button onClick={() => navigate(customFrom, customTo, memberFilter)}
              style={{ padding: "5px 14px", borderRadius: 8, fontSize: 12, fontWeight: 700, background: "#DE1A1A", color: "#fff", border: "none", cursor: "pointer" }}>Apply</button>
          </div>
        )}
        <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
          <select value={memberFilter} onChange={e => navigate(from, to, e.target.value)}
            style={{ padding: "7px 12px", borderRadius: 8, fontSize: 13, border: "1px solid #E5E7EB", background: "#fff", color: "#111", outline: "none", minWidth: 160 }}>
            <option value="">All Members</option>
            {members.map(m => <option key={m.id} value={m.id}>{m.name} (#{m.employee_id})</option>)}
          </select>
          {teamOptions.length > 0 && (
            <select value={teamFilter} onChange={e => setTeamFilter(e.target.value)}
              style={{ padding: "7px 12px", borderRadius: 8, fontSize: 13, border: "1px solid #E5E7EB", background: "#fff", color: "#111", outline: "none", minWidth: 160 }}>
              <option value="">All Teams</option>
              {teamOptions.map(t => <option key={t} value={t}>{t}</option>)}
            </select>
          )}
          {!isSingleDay && (
            <div style={{ display: "flex", alignItems: "center", gap: 6, padding: "7px 12px", borderRadius: 8, border: "1px solid #E5E7EB", background: "#fff", fontSize: 12, color: "#6B7280" }}>
              <Calendar size={12} /> {from} → {to}
            </div>
          )}
        </div>
      </div>

      {/* ── Section 1: Summary Cards ── */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(210px, 1fr))", gap: 12, marginBottom: 16 }}>

        {/* Team Status */}
        <div style={{ padding: "16px 18px", borderRadius: 14, background: "#fff", border: "1px solid #E5E7EB" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 14 }}>
            <div style={{ width: 30, height: 30, borderRadius: 8, background: "rgba(222,26,26,0.08)", display: "flex", alignItems: "center", justifyContent: "center" }}>
              <Users size={14} style={{ color: "#DE1A1A" }} />
            </div>
            <span style={{ fontSize: 11, fontWeight: 700, color: "#9CA3AF", textTransform: "uppercase", letterSpacing: "0.05em" }}>Team Status</span>
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
            {[
              { label: "Present",  value: summary.present,  color: "#16a34a" },
              { label: "On Leave", value: summary.leave,    color: "#dc2626" },
              { label: "Holiday",  value: summary.holiday,  color: "#d97706" },
              { label: "Outside",  value: summary.outside,  color: "#6366F1" },
            ].map(s => (
              <div key={s.label}>
                <p style={{ fontSize: 24, fontWeight: 900, color: s.color, lineHeight: 1, fontFamily: "var(--font-jakarta)" }}>{s.value}</p>
                <p style={{ fontSize: 10, color: "#9CA3AF", fontWeight: 600, marginTop: 3 }}>{s.label}</p>
              </div>
            ))}
          </div>
        </div>

        {/* Work Summary */}
        <div style={{ padding: "16px 18px", borderRadius: 14, background: "#fff", border: "1px solid #E5E7EB" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 14 }}>
            <div style={{ width: 30, height: 30, borderRadius: 8, background: "rgba(99,102,241,0.08)", display: "flex", alignItems: "center", justifyContent: "center" }}>
              <BarChart2 size={14} style={{ color: "#6366F1" }} />
            </div>
            <span style={{ fontSize: 11, fontWeight: 700, color: "#9CA3AF", textTransform: "uppercase", letterSpacing: "0.05em" }}>Work Summary</span>
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            {[
              { label: "Total Hours",     value: `${summary.totalHours}h`, color: "#111" },
              { label: "Clients Worked",  value: summary.totalClients,     color: "#374151" },
              { label: "Tasks Completed", value: summary.totalTasks,       color: "#374151" },
            ].map(s => (
              <div key={s.label} style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                <span style={{ fontSize: 12, color: "#6B7280" }}>{s.label}</span>
                <span style={{ fontSize: 16, fontWeight: 800, color: s.color, fontFamily: "var(--font-jakarta)" }}>{s.value}</span>
              </div>
            ))}
          </div>
        </div>

        {/* Pending Actions */}
        <div style={{ padding: "16px 18px", borderRadius: 14, background: pendingActionsTotal > 0 ? "rgba(245,158,11,0.03)" : "#fff", border: `1px solid ${pendingActionsTotal > 0 ? "rgba(245,158,11,0.2)" : "#E5E7EB"}` }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 14 }}>
            <div style={{ width: 30, height: 30, borderRadius: 8, background: "rgba(245,158,11,0.1)", display: "flex", alignItems: "center", justifyContent: "center" }}>
              <Bell size={14} style={{ color: "#d97706" }} />
            </div>
            <span style={{ fontSize: 11, fontWeight: 700, color: "#9CA3AF", textTransform: "uppercase", letterSpacing: "0.05em" }}>Pending Actions</span>
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            {[
              { label: "Leave Requests",       value: pendingLeaves.length,         color: pendingLeaves.length   > 0 ? "#dc2626" : "#9CA3AF" },
              { label: "Collab Confirmations", value: pendingCollabs.length,        color: pendingCollabs.length  > 0 ? "#d97706" : "#9CA3AF" },
              { label: "No Updates Today",     value: summary.notUpdated.length,    color: summary.notUpdated.length > 0 ? "#dc2626" : "#9CA3AF" },
            ].map(s => (
              <div key={s.label} style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                <span style={{ fontSize: 12, color: "#6B7280" }}>{s.label}</span>
                <span style={{ fontSize: 16, fontWeight: 800, color: s.color, fontFamily: "var(--font-jakarta)" }}>{s.value}</span>
              </div>
            ))}
          </div>
        </div>

        {/* Performance (single day only) */}
        {isSingleDay && (
          <div style={{ padding: "16px 18px", borderRadius: 14, background: "#fff", border: "1px solid #E5E7EB" }}>
            <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 14 }}>
              <div style={{ width: 30, height: 30, borderRadius: 8, background: "rgba(34,197,94,0.08)", display: "flex", alignItems: "center", justifyContent: "center" }}>
                <TrendingUp size={14} style={{ color: "#16a34a" }} />
              </div>
              <span style={{ fontSize: 11, fontWeight: 700, color: "#9CA3AF", textTransform: "uppercase", letterSpacing: "0.05em" }}>Performance</span>
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 6 }}>
              {[
                { label: "High",   value: summary.high,         color: "#16a34a", bg: "rgba(34,197,94,0.08)"  },
                { label: "Avg",    value: summary.avg,          color: "#d97706", bg: "rgba(245,158,11,0.08)" },
                { label: "Review", value: summary.needsReview,  color: "#dc2626", bg: "rgba(239,68,68,0.08)"  },
              ].map(s => (
                <div key={s.label} style={{ padding: "8px 4px", borderRadius: 8, background: s.bg, textAlign: "center" }}>
                  <p style={{ fontSize: 22, fontWeight: 900, color: s.color, lineHeight: 1, fontFamily: "var(--font-jakarta)" }}>{s.value}</p>
                  <p style={{ fontSize: 10, color: "#9CA3AF", fontWeight: 600, marginTop: 3 }}>{s.label}</p>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* ── Section 2: Attention Required ── */}
      {totalAttention > 0 && isSingleDay && (
        <div style={{ padding: "12px 16px", borderRadius: 12, background: "rgba(239,68,68,0.03)", border: "1px solid rgba(239,68,68,0.15)", marginBottom: 16 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 10 }}>
            <AlertTriangle size={13} style={{ color: "#dc2626" }} />
            <span style={{ fontSize: 11, fontWeight: 700, color: "#dc2626", textTransform: "uppercase", letterSpacing: "0.05em" }}>
              Attention Required ({totalAttention})
            </span>
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 7 }}>
            {attention.noUpdate.map(m => (
              <div key={m.id} style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <span style={{ fontSize: 13, color: "#dc2626" }}>⚠</span>
                <span style={{ fontSize: 12, fontWeight: 700, color: "#374151" }}>{m.name}</span>
                <span style={{ fontSize: 11, color: "#9CA3AF" }}>— Attendance marked but no work update submitted</span>
              </div>
            ))}
            {attention.lowHours.map((m, i) => (
              <div key={i} style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <span style={{ fontSize: 13, color: "#d97706" }}>⚠</span>
                <span style={{ fontSize: 12, fontWeight: 700, color: "#374151" }}>{m.name}</span>
                <span style={{ fontSize: 11, color: "#9CA3AF" }}>— Only {fmtHours(m.hours)} logged today</span>
              </div>
            ))}
            {attention.pendingCollabMembers.map((m, i) => (
              <div key={i} style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <span style={{ fontSize: 13, color: "#6366F1" }}>⚠</span>
                <span style={{ fontSize: 12, fontWeight: 700, color: "#374151" }}>{m.name}</span>
                <span style={{ fontSize: 11, color: "#9CA3AF" }}>— {m.count} collaboration request{m.count > 1 ? "s" : ""} pending confirmation</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ── Tab Navigation ── */}
      <div style={{ display: "flex", gap: 0, borderBottom: "1px solid #F3F4F6", marginBottom: 16 }}>
        {tabs.map(tab => (
          <button key={tab.key} onClick={() => setActiveTab(tab.key as typeof activeTab)}
            style={{ display: "flex", alignItems: "center", gap: 6, padding: "9px 16px", fontSize: 13, fontWeight: 600, cursor: "pointer", border: "none", background: "transparent", color: activeTab === tab.key ? "#DE1A1A" : "#9CA3AF", borderBottom: `2px solid ${activeTab === tab.key ? "#DE1A1A" : "transparent"}`, marginBottom: -1, transition: "all 0.15s" }}>
            <tab.Icon size={13} />{tab.label}
          </button>
        ))}
      </div>

      {/* ══ TEAM TAB ══ */}
      {activeTab === "team" && (
        <>
          {!isSingleDay && memberSummary.length > 0 && (
            <div style={{ borderRadius: 12, overflow: "hidden", background: "#fff", border: "1px solid #E5E7EB", marginBottom: 12 }}>
              <div style={{ padding: "10px 16px", borderBottom: "1px solid #F3F4F6", background: "#FAFAFA", display: "flex", alignItems: "center", gap: 6 }}>
                <Activity size={12} style={{ color: "#6B7280" }} />
                <span style={{ fontSize: 10, fontWeight: 700, color: "#9CA3AF", textTransform: "uppercase", letterSpacing: "0.05em" }}>Member Summary — {from} to {to}</span>
              </div>
              <div style={{ overflowX: "auto" }}>
                <table style={{ width: "100%", borderCollapse: "collapse" }}>
                  <thead>
                    <tr style={{ borderBottom: "1px solid #F3F4F6" }}>
                      {["Member", "Days", "Present", "Leave", "Total Hours", "Avg / Day", ""].map(h => (
                        <th key={h} style={{ padding: "8px 14px", textAlign: "left", fontSize: 10, fontWeight: 700, color: "#9CA3AF", textTransform: "uppercase", letterSpacing: "0.05em" }}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {memberSummary.map((m, i) => {
                      const avg = m.days > 0 ? Math.round(m.totalHours / m.days * 10) / 10 : 0
                      return (
                        <tr key={m.id} style={{ borderBottom: i < memberSummary.length - 1 ? "1px solid #F9FAFB" : "none" }}>
                          <td style={{ padding: "10px 14px" }}>
                            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                              <div style={{ width: 28, height: 28, borderRadius: "50%", background: "rgba(222,26,26,0.08)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 10, fontWeight: 700, color: "#DE1A1A", flexShrink: 0 }}>
                                {getInitials(m.name)}
                              </div>
                              <div>
                                <p style={{ fontSize: 13, fontWeight: 600, color: "#111827" }}>{m.name}</p>
                                <p style={{ fontSize: 10, color: "#9CA3AF" }}>#{m.employee_id}</p>
                              </div>
                            </div>
                          </td>
                          <td style={{ padding: "10px 14px", fontSize: 13, color: "#374151" }}>{m.days}</td>
                          <td style={{ padding: "10px 14px" }}>
                            <span style={{ fontSize: 12, fontWeight: 700, padding: "2px 8px", borderRadius: 20, background: "rgba(34,197,94,0.08)", color: "#16a34a" }}>{m.present}</span>
                          </td>
                          <td style={{ padding: "10px 14px" }}>
                            {(m.absent + m.onLeave) > 0
                              ? <span style={{ fontSize: 12, fontWeight: 700, padding: "2px 8px", borderRadius: 20, background: "rgba(239,68,68,0.08)", color: "#dc2626" }}>{m.absent + m.onLeave}</span>
                              : <span style={{ fontSize: 12, color: "#E5E7EB" }}>—</span>}
                          </td>
                          <td style={{ padding: "10px 14px", fontSize: 13, fontWeight: 700, color: "#111827" }}>{m.totalHours}h</td>
                          <td style={{ padding: "10px 14px" }}>
                            <span style={{ fontSize: 12, fontWeight: 600, color: avg < 6 && m.present > 0 ? "#d97706" : "#374151" }}>
                              {avg}h {avg < 6 && m.present > 0 ? "⚠" : ""}
                            </span>
                          </td>
                          <td style={{ padding: "10px 14px" }}>
                            <button onClick={() => navigate(from, to, m.id)} style={{ fontSize: 11, fontWeight: 600, color: "#9CA3AF", background: "none", border: "none", cursor: "pointer" }}>Filter →</button>
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {filteredUpdates.length === 0 ? (
            <div style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", padding: "80px 24px", borderRadius: 14, background: "#fff", border: "1px solid #E5E7EB" }}>
              <Activity size={32} style={{ color: "#E5E7EB", marginBottom: 12 }} />
              <p style={{ fontSize: 14, fontWeight: 600, color: "#9CA3AF" }}>No updates for this period</p>
              <p style={{ fontSize: 12, color: "#D1D5DB", marginTop: 4 }}>Team members haven&apos;t submitted yet.</p>
            </div>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              {filteredUpdates.map(u => {
                const sc    = ATTENDANCE_STYLE[u.attendance_status] ?? ATTENDANCE_STYLE.present
                const wt    = u.work_type ? WORK_TYPE[u.work_type] : null
                const user  = Array.isArray(u.users) ? u.users[0] : u.users
                const isExp = expandedIds.has(u.id)
                const entries = (Array.isArray(u.work_entries)
                  ? [...(u.work_entries as { task_type: string; start_time?: string | null; [k: string]: unknown }[])]
                  : []).sort((a, b) => {
                    const ta = (a.start_time as string | null | undefined) ?? ""
                    const tb = (b.start_time as string | null | undefined) ?? ""
                    if (!ta && !tb) return 0; if (!ta) return 1; if (!tb) return -1
                    return ta.localeCompare(tb)
                  })
                const workEntries  = entries.filter(e => e.task_type === "work")
                const shootEntries = entries.filter(e => e.task_type === "shoot")
                const editEntries  = entries.filter(e => e.task_type === "edit")
                const otherEntries = entries.filter(e => !["work","shoot","edit","break"].includes(String(e.task_type ?? "")))
                const allWorkLike  = [...workEntries, ...otherEntries]
                const workHrs  = Math.round(allWorkLike.reduce((s, e) => s + (Number(e.duration_hours) || 0), 0) * 10) / 10
                const mediaHrs = Math.round([...shootEntries,...editEntries].reduce((s, e) => {
                  const h = Number(e.duration_hours) || 0
                  const tr = e.task_type === "shoot" ? (Number(e._travel_hours) || 0) : 0
                  return s + Math.max(0, h - tr)
                }, 0) * 10) / 10
                const hasMedia       = shootEntries.length > 0 || editEntries.length > 0
                const collabH        = user ? (collabHoursMap[`${user.id}:${u.date}`] ?? 0) : 0
                const totalHrs       = (u.working_hours ?? 0) + collabH
                const clientsWorked  = getClientNames(entries)
                const tier           = (isSingleDay && u.attendance_status === "present" && totalHrs > 0) ? perfTier(totalHrs) : null
                const noHrsFlag      = isSingleDay && u.attendance_status === "present" && totalHrs === 0
                const lowHrsFlag     = isSingleDay && u.attendance_status === "present" && totalHrs > 0 && totalHrs < 4
                const tasksList      = u.tasks_list ?? []
                const tasksCompleted = u.tasks_completed ?? 0
                const tasksTotal     = u.tasks_total ?? 0
                const hasDetails     = entries.length > 0 || u.active_tab === "learning" || tasksList.length > 0

                return (
                  <div key={u.id} style={{ borderRadius: 12, overflow: "hidden", background: "#fff", border: "1px solid #E5E7EB" }}>
                    <div style={{ padding: "14px 16px" }}>
                      <div style={{ display: "flex", alignItems: "flex-start", gap: 12 }}>
                        {/* Avatar */}
                        <div style={{ width: 40, height: 40, borderRadius: "50%", background: "rgba(222,26,26,0.08)", border: "1px solid rgba(222,26,26,0.15)", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0, fontSize: 11, fontWeight: 700, color: "#DE1A1A" }}>
                          {user?.name ? getInitials(user.name) : "?"}
                        </div>

                        <div style={{ flex: 1, minWidth: 0 }}>
                          {/* Name row */}
                          <div style={{ display: "flex", flexWrap: "wrap", alignItems: "center", gap: 6, marginBottom: 8 }}>
                            <span style={{ fontSize: 14, fontWeight: 700, color: "#111" }}>{user?.name ?? "Unknown"}</span>
                            <span style={{ fontSize: 11, color: "#9CA3AF" }}>#{user?.employee_id}</span>
                            <span style={{ fontSize: 11, fontWeight: 600, padding: "2px 8px", borderRadius: 20, background: sc.bg, color: sc.color }}>{sc.label}</span>
                            {wt && <span style={{ fontSize: 11, padding: "2px 8px", borderRadius: 20, background: "rgba(0,0,0,0.04)", color: "#6B7280" }}>{wt}</span>}
                            {tier && <span style={{ fontSize: 10, fontWeight: 700, padding: "2px 8px", borderRadius: 20, background: tier.bg, color: tier.color }}>{tier.label}</span>}
                            {noHrsFlag  && <span style={{ fontSize: 10, fontWeight: 700, padding: "2px 8px", borderRadius: 20, background: "rgba(239,68,68,0.08)", color: "#dc2626" }}>No hours logged</span>}
                            {lowHrsFlag && <span style={{ fontSize: 10, fontWeight: 700, padding: "2px 8px", borderRadius: 20, background: "rgba(245,158,11,0.08)", color: "#d97706", display: "flex", alignItems: "center", gap: 3 }}><AlertTriangle size={9} />Low</span>}
                          </div>

                          {/* Stat chips */}
                          <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
                            {allWorkLike.length > 0 ? (
                              <span style={{ display: "flex", alignItems: "center", gap: 4, padding: "4px 10px", borderRadius: 8, fontSize: 11, fontWeight: 600, background: "rgba(0,0,0,0.03)", border: "1px solid #F0F1F5", color: "#374151" }}>
                                <Clock size={10} style={{ color: "#6B7280" }} /> Work · {fmtHours(workHrs)}
                              </span>
                            ) : u.working_hours != null ? (
                              <span style={{ display: "flex", alignItems: "center", gap: 4, padding: "4px 10px", borderRadius: 8, fontSize: 11, background: "rgba(0,0,0,0.03)", border: "1px solid #F0F1F5", color: "#6B7280" }}>
                                <Clock size={10} /> {u.working_hours}h
                              </span>
                            ) : null}
                            {hasMedia && (
                              <span style={{ display: "flex", alignItems: "center", gap: 4, padding: "4px 10px", borderRadius: 8, fontSize: 11, fontWeight: 600, background: "rgba(222,26,26,0.04)", border: "1px solid rgba(222,26,26,0.12)", color: "#DE1A1A" }}>
                                <Camera size={10} /> Media · {fmtHours(mediaHrs)}
                                <span style={{ opacity: 0.6, fontWeight: 400 }}>
                                  {shootEntries.length > 0 ? ` ${shootEntries.length}S` : ""}
                                  {editEntries.length > 0  ? ` ${editEntries.length}E`  : ""}
                                </span>
                              </span>
                            )}
                            {(u.learning_hours ?? 0) > 0 && (
                              <span style={{ display: "flex", alignItems: "center", gap: 4, padding: "4px 10px", borderRadius: 8, fontSize: 11, fontWeight: 600, background: "rgba(99,102,241,0.05)", border: "1px solid rgba(99,102,241,0.15)", color: "#6366F1" }}>
                                <BookOpen size={10} /> Learning · {fmtHours(u.learning_hours)}
                              </span>
                            )}
                            {collabH > 0 && (
                              <span style={{ display: "flex", alignItems: "center", gap: 4, padding: "4px 10px", borderRadius: 8, fontSize: 11, fontWeight: 600, background: "rgba(99,102,241,0.06)", border: "1px solid rgba(99,102,241,0.15)", color: "#6366F1" }}>
                                +{collabH.toFixed(1)}h collab
                              </span>
                            )}
                            {tasksTotal > 0 && (
                              <span style={{ display: "flex", alignItems: "center", gap: 4, padding: "4px 10px", borderRadius: 8, fontSize: 11, fontWeight: 600, background: tasksCompleted === tasksTotal ? "rgba(34,197,94,0.06)" : "rgba(245,158,11,0.06)", border: `1px solid ${tasksCompleted === tasksTotal ? "rgba(34,197,94,0.2)" : "rgba(245,158,11,0.2)"}`, color: tasksCompleted === tasksTotal ? "#22C55E" : "#F59E0B" }}>
                                <Target size={10} /> Tasks · {tasksCompleted}/{tasksTotal}
                              </span>
                            )}
                          </div>

                          {/* Clients */}
                          {clientsWorked.length > 0 && (
                            <div style={{ display: "flex", alignItems: "center", flexWrap: "wrap", gap: 6, marginTop: 8 }}>
                              <span style={{ fontSize: 10, fontWeight: 700, color: "#9CA3AF" }}>🏢</span>
                              {clientsWorked.map(c => (
                                <span key={c} style={{ padding: "2px 8px", borderRadius: 20, fontSize: 11, fontWeight: 600, background: "rgba(222,26,26,0.06)", border: "1px solid rgba(222,26,26,0.12)", color: "#DE1A1A" }}>{c}</span>
                              ))}
                            </div>
                          )}

                          {/* Participants */}
                          {(u.participant_ids ?? []).length > 0 && (() => {
                            const participants = (u.participant_ids ?? []).map(pid => members.find(m => m.id === pid)).filter(Boolean)
                            if (!participants.length) return null
                            return (
                              <div style={{ display: "flex", alignItems: "center", flexWrap: "wrap", gap: 6, marginTop: 6 }}>
                                <span style={{ fontSize: 10, fontWeight: 700, color: "#9CA3AF" }}>👥</span>
                                {participants.map(p => (
                                  <span key={p!.id} style={{ display: "flex", alignItems: "center", gap: 4, padding: "2px 8px", borderRadius: 20, fontSize: 11, fontWeight: 600, background: "rgba(99,102,241,0.08)", border: "1px solid rgba(99,102,241,0.2)", color: "#6366F1" }}>
                                    <span style={{ width: 14, height: 14, borderRadius: "50%", background: "#6366F1", display: "inline-flex", alignItems: "center", justifyContent: "center", fontSize: 7, fontWeight: 900, color: "#fff", flexShrink: 0 }}>
                                      {p!.name.split(" ").map((n: string) => n[0]).join("").slice(0, 2)}
                                    </span>
                                    {p!.name.split(" ")[0]}
                                  </span>
                                ))}
                              </div>
                            )
                          })()}
                        </div>

                        {hasDetails && (
                          <button onClick={() => toggleExpand(u.id)}
                            style={{ display: "flex", alignItems: "center", gap: 5, padding: "7px 12px", borderRadius: 8, fontSize: 12, fontWeight: 600, cursor: "pointer", flexShrink: 0, background: isExp ? "rgba(222,26,26,0.08)" : "#F9FAFB", color: isExp ? "#DE1A1A" : "#374151", border: `1px solid ${isExp ? "rgba(222,26,26,0.2)" : "#E5E7EB"}` }}>
                            {isExp ? <ChevronUp size={12} /> : <ChevronDown size={12} />}
                            {isExp ? "Hide" : "Details"}
                          </button>
                        )}
                      </div>
                    </div>

                    {isExp && (
                      <div style={{ borderTop: "1px solid #F3F4F6", padding: "14px 16px", background: "#FAFAFA", display: "flex", flexDirection: "column", gap: 16 }}>
                        {allWorkLike.length > 0 && (
                          <div>
                            <p style={{ fontSize: 10, fontWeight: 700, color: "#9CA3AF", textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: 8 }}>Work · {fmtHours(workHrs)}</p>
                            <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                              {allWorkLike.map((e, i) => (
                                <div key={i} style={{ display: "flex", alignItems: "center", gap: 10, padding: "10px 12px", borderRadius: 8, background: "#fff", border: "1px solid #F3F4F6" }}>
                                  <div style={{ flex: 1, minWidth: 0 }}>
                                    <p style={{ fontSize: 12, fontWeight: 600, color: "#111827" }}>{String(e.title || e.task_title || "—")}</p>
                                    {!!(e.client || e._custom_client || e.client_name) && (
                                      <p style={{ fontSize: 11, color: "#DE1A1A", marginTop: 2 }}>{String(e.client || e._custom_client || e.client_name)}</p>
                                    )}
                                  </div>
                                  <div style={{ flexShrink: 0, textAlign: "right" }}>
                                    {!!(e.start_time || e.end_time) && <p style={{ fontSize: 10, color: "#9CA3AF" }}>{String(e.start_time ?? "")} – {String(e.end_time ?? "")}</p>}
                                    <p style={{ fontSize: 12, fontWeight: 700, color: "#374151" }}>{fmtHours(e.duration_hours)}</p>
                                  </div>
                                </div>
                              ))}
                            </div>
                          </div>
                        )}

                        {hasMedia && (
                          <div>
                            <p style={{ fontSize: 10, fontWeight: 700, color: "#9CA3AF", textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: 8 }}>
                              Media · {fmtHours(mediaHrs)} · {shootEntries.length} shoot{shootEntries.length !== 1 ? "s" : ""}{editEntries.length > 0 ? ` · ${editEntries.length} edit${editEntries.length !== 1 ? "s" : ""}` : ""}
                            </p>
                            <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                              {[...shootEntries, ...editEntries].map((e, i) => {
                                const isShoot = e.task_type === "shoot"
                                return (
                                  <div key={i} style={{ display: "flex", alignItems: "center", gap: 10, padding: "10px 12px", borderRadius: 8, background: isShoot ? "rgba(222,26,26,0.03)" : "rgba(99,102,241,0.03)", border: `1px solid ${isShoot ? "rgba(222,26,26,0.1)" : "rgba(99,102,241,0.1)"}` }}>
                                    {isShoot ? <Camera size={12} style={{ color: "#DE1A1A", flexShrink: 0 }} /> : <Edit2 size={12} style={{ color: "#6366F1", flexShrink: 0 }} />}
                                    <div style={{ flex: 1, minWidth: 0 }}>
                                      <p style={{ fontSize: 12, fontWeight: 600, color: "#111827" }}>{String(e.title || "—")}</p>
                                      {!!(e._brand || e._custom_client || e.client) && <p style={{ fontSize: 11, color: isShoot ? "#DE1A1A" : "#6366F1" }}>{String(e._brand || e._custom_client || e.client)}</p>}
                                      {!!e._location && <p style={{ fontSize: 10, color: "#9CA3AF", marginTop: 2, display: "flex", alignItems: "center", gap: 3 }}><MapPin size={8} />{String(e._location)}</p>}
                                    </div>
                                    <p style={{ fontSize: 12, fontWeight: 700, color: "#374151", flexShrink: 0 }}>{fmtHours(e.duration_hours)}</p>
                                  </div>
                                )
                              })}
                            </div>
                          </div>
                        )}

                        {u.active_tab === "learning" && (
                          <div>
                            <p style={{ fontSize: 10, fontWeight: 700, color: "#9CA3AF", textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: 8 }}>Learning · {fmtHours(u.learning_hours)}</p>
                            <div style={{ padding: "10px 12px", borderRadius: 8, background: "rgba(99,102,241,0.05)", border: "1px solid rgba(99,102,241,0.15)" }}>
                              <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 4 }}>
                                <BookOpen size={12} style={{ color: "#6366F1" }} />
                                <span style={{ fontSize: 12, fontWeight: 600, color: "#6366F1" }}>{u.learning_topic ?? "—"}</span>
                              </div>
                              {u.learning_notes && <p style={{ fontSize: 11, color: "#6B7280", marginLeft: 18 }}>{u.learning_notes}</p>}
                            </div>
                          </div>
                        )}

                        {tasksList.length > 0 && (
                          <div>
                            <p style={{ fontSize: 10, fontWeight: 700, color: "#9CA3AF", textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: 8 }}>Tasks · {tasksCompleted}/{tasksTotal} completed</p>
                            <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                              {tasksList.map(t => {
                                const done   = t.status === "completed"
                                const inProg = t.status === "in_progress"
                                return (
                                  <div key={t.id} style={{ display: "flex", alignItems: "center", gap: 8, padding: "7px 12px", borderRadius: 8, background: "#fff", border: `1px solid ${done ? "rgba(34,197,94,0.15)" : "#F3F4F6"}` }}>
                                    <div style={{ width: 16, height: 16, borderRadius: "50%", flexShrink: 0, display: "flex", alignItems: "center", justifyContent: "center", background: done ? "#22C55E" : inProg ? "#F59E0B" : "#E5E7EB", fontSize: 9, color: "#fff" }}>
                                      {done ? "✓" : inProg ? "→" : ""}
                                    </div>
                                    <span style={{ flex: 1, fontSize: 12, color: done ? "#9CA3AF" : "#111827", textDecoration: done ? "line-through" : "none" }}>{t.title}</span>
                                    <span style={{ fontSize: 10, fontWeight: 700, padding: "2px 8px", borderRadius: 20, background: done ? "rgba(34,197,94,0.1)" : inProg ? "rgba(245,158,11,0.1)" : "rgba(0,0,0,0.05)", color: done ? "#22C55E" : inProg ? "#F59E0B" : "#9CA3AF" }}>
                                      {done ? "Done" : inProg ? "In Progress" : "To Do"}
                                    </span>
                                  </div>
                                )
                              })}
                            </div>
                          </div>
                        )}

                        {entries.length === 0 && u.active_tab !== "learning" && (
                          <p style={{ fontSize: 12, color: "#D1D5DB", fontStyle: "italic" }}>No detailed work entries recorded.</p>
                        )}
                      </div>
                    )}
                  </div>
                )
              })}
            </div>
          )}
        </>
      )}

      {/* ══ CLIENTS TAB ══ */}
      {activeTab === "clients" && isSingleDay && (
        clientActivity.length === 0 ? (
          <div style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", padding: "80px 24px", borderRadius: 14, background: "#fff", border: "1px solid #E5E7EB" }}>
            <Building2 size={28} style={{ color: "#E5E7EB", marginBottom: 10 }} />
            <p style={{ fontSize: 14, color: "#9CA3AF", fontWeight: 600 }}>No client work recorded today</p>
          </div>
        ) : (
          <>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: 10, marginBottom: 14 }}>
              {[
                { label: "Total Clients",  value: clientActivity.length,                        color: "#111" },
                { label: "Most Active",    value: clientActivity[0]?.client ?? "—",              color: "#DE1A1A" },
                { label: "Top Hours",      value: fmtHours(clientActivity[0]?.totalHours ?? 0), color: "#6366F1" },
              ].map(s => (
                <div key={s.label} style={{ padding: "12px 16px", borderRadius: 10, background: "#fff", border: "1px solid #E5E7EB" }}>
                  <p style={{ fontSize: 11, color: "#9CA3AF", fontWeight: 600 }}>{s.label}</p>
                  <p style={{ fontSize: 18, fontWeight: 800, color: s.color, marginTop: 4, fontFamily: "var(--font-jakarta)" }}>{s.value}</p>
                </div>
              ))}
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              {clientActivity.map(({ client, entries, totalHours }) => (
                <div key={client} style={{ borderRadius: 12, overflow: "hidden", background: "#fff", border: "1px solid #E5E7EB" }}>
                  <div style={{ padding: "11px 16px", borderBottom: "1px solid #F3F4F6", background: "#FAFAFA", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                      <div style={{ width: 28, height: 28, borderRadius: 8, background: "rgba(222,26,26,0.08)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 10, fontWeight: 700, color: "#DE1A1A" }}>
                        {client.slice(0, 2).toUpperCase()}
                      </div>
                      <span style={{ fontSize: 13, fontWeight: 700, color: "#111827" }}>{client}</span>
                    </div>
                    <span style={{ fontSize: 12, fontWeight: 700, color: "#6B7280", background: "#F3F4F6", padding: "2px 8px", borderRadius: 6 }}>{fmtHours(totalHours)}</span>
                  </div>
                  <div style={{ padding: "10px 16px", display: "flex", flexDirection: "column", gap: 7 }}>
                    {entries.map((e, i) => (
                      <div key={i} style={{ display: "flex", alignItems: "center", gap: 8 }}>
                        <div style={{ width: 6, height: 6, borderRadius: "50%", flexShrink: 0, background: e.taskType === "shoot" ? "#DE1A1A" : e.taskType === "edit" ? "#6366F1" : "#9CA3AF" }} />
                        <span style={{ fontSize: 12, color: "#374151", fontWeight: 600 }}>{e.memberName}</span>
                        {e.title && <span style={{ fontSize: 11, color: "#9CA3AF" }}>· {e.title}</span>}
                        <span style={{ fontSize: 11, color: "#9CA3AF", marginLeft: "auto", flexShrink: 0 }}>{fmtHours(e.duration)}</span>
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </>
        )
      )}

      {/* ══ WORKLOAD TAB ══ */}
      {activeTab === "workload" && (
        workloadData.length === 0 ? (
          <div style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", padding: "80px 24px", borderRadius: 14, background: "#fff", border: "1px solid #E5E7EB" }}>
            <BarChart2 size={28} style={{ color: "#E5E7EB", marginBottom: 10 }} />
            <p style={{ fontSize: 14, color: "#9CA3AF", fontWeight: 600 }}>No workload data for this period</p>
          </div>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {workloadData.map(m => {
              const cfg = ({
                overloaded:  { color: "#dc2626", bar: "#dc2626", label: "Overloaded"   },
                balanced:    { color: "#16a34a", bar: "#16a34a", label: "Balanced"     },
                low:         { color: "#d97706", bar: "#d97706", label: "Low Workload" },
                "no-update": { color: "#9CA3AF", bar: "#E5E7EB", label: "No Update"   },
              } as Record<string, { color: string; bar: string; label: string }>)[m.status]
              return (
                <div key={m.employee_id} style={{ padding: "14px 16px", borderRadius: 12, background: "#fff", border: "1px solid #E5E7EB" }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 10 }}>
                    <div style={{ width: 36, height: 36, borderRadius: "50%", background: "rgba(222,26,26,0.08)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 11, fontWeight: 700, color: "#DE1A1A", flexShrink: 0 }}>
                      {getInitials(m.name)}
                    </div>
                    <div style={{ flex: 1 }}>
                      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                        <span style={{ fontSize: 13, fontWeight: 700, color: "#111827" }}>{m.name}</span>
                        {cfg && <span style={{ fontSize: 10, fontWeight: 700, padding: "2px 8px", borderRadius: 20, background: `${cfg.color}18`, color: cfg.color }}>{cfg.label}</span>}
                      </div>
                      <span style={{ fontSize: 11, color: "#9CA3AF" }}>#{m.employee_id}</span>
                    </div>
                    <span style={{ fontSize: 20, fontWeight: 900, color: "#111827", fontFamily: "var(--font-jakarta)" }}>{fmtHours(m.hours)}</span>
                  </div>
                  <div style={{ height: 6, borderRadius: 3, background: "#F3F4F6", overflow: "hidden" }}>
                    <div style={{ height: "100%", borderRadius: 3, width: `${m.pct}%`, background: cfg?.bar ?? "#E5E7EB", transition: "width 0.3s ease" }} />
                  </div>
                  <div style={{ display: "flex", justifyContent: "space-between", marginTop: 4, fontSize: 10, color: "#C4C4C4" }}>
                    <span>0h</span><span>4h balanced</span><span>9h+ overloaded</span>
                  </div>
                </div>
              )
            })}
          </div>
        )
      )}

      {/* ══ LEARNING TAB ══ */}
      {activeTab === "learning" && (
        <>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))", gap: 10, marginBottom: 16 }}>
            {[
              { label: "Submitted", value: learningData.submitted.length, color: "#16a34a", bg: "rgba(34,197,94,0.06)",  border: "rgba(34,197,94,0.15)"  },
              { label: "Missing",   value: learningData.missing.length,   color: "#dc2626", bg: "rgba(239,68,68,0.06)",  border: "rgba(239,68,68,0.15)"  },
            ].map(s => (
              <div key={s.label} style={{ padding: "14px 18px", borderRadius: 12, background: s.bg, border: `1px solid ${s.border}` }}>
                <p style={{ fontSize: 28, fontWeight: 900, color: s.color, fontFamily: "var(--font-jakarta)" }}>{s.value}</p>
                <p style={{ fontSize: 12, color: "#6B7280", marginTop: 2 }}>Learning {s.label}</p>
              </div>
            ))}
          </div>

          {learningData.submitted.length > 0 && (
            <div style={{ marginBottom: 16 }}>
              <p style={{ fontSize: 11, fontWeight: 700, color: "#9CA3AF", textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: 8 }}>Submitted</p>
              <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                {learningData.submitted.map((s, i) => (
                  <div key={i} style={{ display: "flex", alignItems: "flex-start", gap: 12, padding: "12px 16px", borderRadius: 10, background: "#fff", border: "1px solid #E5E7EB" }}>
                    <div style={{ width: 32, height: 32, borderRadius: 8, background: "rgba(99,102,241,0.08)", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                      <GraduationCap size={14} style={{ color: "#6366F1" }} />
                    </div>
                    <div style={{ flex: 1 }}>
                      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
                        <div>
                          <p style={{ fontSize: 13, fontWeight: 700, color: "#111827" }}>{s.name}</p>
                          <p style={{ fontSize: 12, color: "#6366F1", marginTop: 2 }}>{s.topic}</p>
                          {s.notes && <p style={{ fontSize: 11, color: "#6B7280", marginTop: 4 }}>{s.notes}</p>}
                        </div>
                        <span style={{ fontSize: 12, fontWeight: 700, color: "#6366F1", flexShrink: 0, marginLeft: 12 }}>{fmtHours(s.hours)}</span>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {learningData.missing.length > 0 && (
            <div>
              <p style={{ fontSize: 11, fontWeight: 700, color: "#9CA3AF", textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: 8 }}>Missing Learning Update</p>
              <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
                {learningData.missing.map((name, i) => (
                  <span key={i} style={{ fontSize: 12, fontWeight: 600, padding: "4px 12px", borderRadius: 20, background: "rgba(239,68,68,0.06)", border: "1px solid rgba(239,68,68,0.15)", color: "#dc2626" }}>
                    {name}
                  </span>
                ))}
              </div>
            </div>
          )}

          {learningData.submitted.length === 0 && learningData.missing.length === 0 && (
            <div style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", padding: "80px 24px", borderRadius: 14, background: "#fff", border: "1px solid #E5E7EB" }}>
              <GraduationCap size={28} style={{ color: "#E5E7EB", marginBottom: 10 }} />
              <p style={{ fontSize: 14, color: "#9CA3AF", fontWeight: 600 }}>No learning data for this period</p>
            </div>
          )}
        </>
      )}
    </div>
  )
}
