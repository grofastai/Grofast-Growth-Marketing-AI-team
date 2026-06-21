"use client"

import { useState, useMemo } from "react"
import { useRouter, usePathname } from "next/navigation"
import { Search, Filter, Clock, Users, AlertCircle, TrendingUp, Bell, Star } from "lucide-react"
import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip } from "recharts"

type WorkEntry = Record<string, unknown>

interface Update {
  id: string
  date: string
  created_at?: string
  attendance_status: string
  work_type: string | null
  working_hours: number | null
  learning_hours: number
  learning_topic: string | null
  notes: string | null
  task_id: string | null
  work_entries: WorkEntry[] | null
  participant_ids: string[] | null
  users: { id: string; name: string; employee_id: string; role: string; team?: string | null } | null
  tasks_list: { id: string; title: string; status: string; priority: string | null }[]
  tasks_completed: number
  tasks_total: number
}

interface Member { id: string; name: string; employee_id: string; team?: string | null; role?: string }
interface PendingLeave { id: string; user_id: string; from_date: string; to_date: string; reason: string | null }
interface PendingCollab { collaborator_id: string; date: string; status: string }

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

function getDescription(u: Update): string {
  const entries = (Array.isArray(u.work_entries) ? u.work_entries : []) as WorkEntry[]
  const first = entries.find(e => e.task_type !== "break")
  if (first) {
    const title = (first.title || first.task_name || first.description) as string | undefined
    if (title) return title
    const client = (first.client_name || first._brand || first._custom_client || first.client) as string | undefined
    if (client) return `Worked on ${client}`
  }
  if (u.notes) return u.notes
  if (u.attendance_status === "leave") return "On approved leave"
  return "Submitted daily update"
}

function getTeamBadge(team: string | null | undefined): { label: string; bg: string; color: string } {
  const t = (team ?? "").toLowerCase()
  if (t.includes("media")) return { label: "Media & Tech", bg: "rgba(99,102,241,0.1)", color: "#6366F1" }
  if (t.includes("meta") || t.includes("ads")) return { label: "Meta Ads", bg: "rgba(245,158,11,0.1)", color: "#d97706" }
  if (t.includes("creative") || t.includes("design")) return { label: "Creative", bg: "rgba(236,72,153,0.1)", color: "#ec4899" }
  if (t.includes("ai")) return { label: "AI", bg: "rgba(34,197,94,0.1)", color: "#16a34a" }
  if (t.includes("content")) return { label: "Content", bg: "rgba(34,197,94,0.1)", color: "#16a34a" }
  if (t.includes("analytics") || t.includes("ops")) return { label: "Analytics", bg: "rgba(245,158,11,0.1)", color: "#d97706" }
  return { label: team ?? "Team", bg: "rgba(99,102,241,0.1)", color: "#6366F1" }
}

function fmtTime(isoOrDate: string | undefined): string {
  if (!isoOrDate) return ""
  try {
    const d = new Date(isoOrDate)
    return d.toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit", hour12: true })
  } catch { return "" }
}

const AVATAR_COLORS = [
  ["#E31E24","#fff"], ["#7C3AED","#fff"], ["#0EA5E9","#fff"],
  ["#16A34A","#fff"], ["#D97706","#fff"], ["#EC4899","#fff"],
  ["#6366F1","#fff"], ["#14B8A6","#fff"],
]

function avatarColor(name: string) {
  let h = 0; for (const c of name) h += c.charCodeAt(0)
  return AVATAR_COLORS[h % AVATAR_COLORS.length]
}

export default function ActivitiesClient({
  updates,
  members,
  from,
  to,
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
  const [search, setSearch] = useState("")
  const [customFrom, setCustomFrom] = useState(from)
  const [customTo, setCustomTo]     = useState(to)
  const [showCustom, setShowCustom] = useState(false)

  // suppress unused-var lint for these required props
  void onLeaveIds; void leaveDays; void clockInDays; void pendingLeaves; void pendingCollabs

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

  function activePreset() {
    return DATE_PRESETS.find(p => p.from === from && p.to === to)?.label ?? "Custom"
  }

  function navigate(f: string, t: string) {
    const p = new URLSearchParams()
    if (f === t) p.set("date", f)
    else { p.set("from", f); p.set("to", t) }
    router.push(`${pathname}?${p.toString()}`)
  }

  // ── Stats ──────────────────────────────────────────────────────────────────
  const stats = useMemo(() => {
    const presentSet = new Set<string>()
    const onLeaveSet = new Set<string>()
    let totalHours = 0

    for (const u of updates) {
      const user = Array.isArray(u.users) ? u.users[0] : u.users
      if (!user) continue
      const collabH = collabHoursMap[`${user.id}:${u.date}`] ?? 0
      const hrs = (u.working_hours ?? 0) + collabH
      if (u.attendance_status === "present") {
        presentSet.add(user.id)
        totalHours += hrs
      } else if (u.attendance_status === "leave" || u.attendance_status === "absent") {
        onLeaveSet.add(user.id)
      }
    }

    const activeMembers = members.filter(m => m.role !== "ADMIN")
    const updatedIds = new Set(updates.map(u => {
      const user = Array.isArray(u.users) ? u.users[0] : u.users
      return user?.id
    }).filter(Boolean))
    const notUpdated = activeMembers.filter(m => !updatedIds.has(m.id))

    return {
      totalUpdates: updates.length,
      present: presentSet.size,
      onLeave: onLeaveSet.size,
      totalHours,
      notUpdated: notUpdated.length,
      notUpdatedMembers: notUpdated,
    }
  }, [updates, members, collabHoursMap])

  // ── Donut chart data ────────────────────────────────────────────────────────
  const donutData = useMemo(() => {
    const total = members.filter(m => m.role !== "ADMIN").length || 1
    const completed = stats.present
    const onLeave   = stats.onLeave
    const notUpd    = Math.max(0, total - completed - onLeave)
    const pct = (n: number) => Math.round((n / total) * 100)
    return [
      { name: "Completed",   value: completed, pct: pct(completed), color: "#16A34A" },
      { name: "On Leave",    value: onLeave,   pct: pct(onLeave),   color: "#F59E0B" },
      { name: "Not Updated", value: notUpd,    pct: pct(notUpd),    color: "#E31E24" },
    ]
  }, [stats, members])

  const completionPct = donutData[0].pct

  // ── Top contributor ─────────────────────────────────────────────────────────
  const topContributor = useMemo(() => {
    const map: Record<string, { name: string; count: number; hours: number }> = {}
    for (const u of updates) {
      if (u.attendance_status !== "present") continue
      const user = Array.isArray(u.users) ? u.users[0] : u.users
      if (!user) continue
      if (!map[user.id]) map[user.id] = { name: user.name, count: 0, hours: 0 }
      map[user.id].count++
      map[user.id].hours += u.working_hours ?? 0
    }
    const sorted = Object.values(map).sort((a, b) => b.hours - a.hours || b.count - a.count)
    return sorted[0] ?? null
  }, [updates])

  // ── Filtered activities for timeline ────────────────────────────────────────
  const filteredActivities = useMemo(() => {
    const q = search.toLowerCase()
    return updates
      .filter(u => {
        if (!q) return true
        const user = Array.isArray(u.users) ? u.users[0] : u.users
        return user?.name.toLowerCase().includes(q) || getDescription(u).toLowerCase().includes(q)
      })
      .slice(0, 20)
  }, [updates, search])

  // ── Format display date ──────────────────────────────────────────────────────
  const displayDate = useMemo(() => {
    try {
      const d = new Date(to + "T12:00:00")
      return d.toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" })
    } catch { return to }
  }, [to])

  const curPreset = activePreset()

  // ─────────────────────────────────────────────────────────────────────────
  return (
    <div style={{ padding: "24px 24px 64px", maxWidth: 1400, margin: "0 auto", fontFamily: "var(--font-jakarta, Inter, sans-serif)" }}>

      {/* ── Hero Banner ── */}
      <div style={{
        position: "relative", borderRadius: 20, overflow: "hidden", marginBottom: 24,
        background: "linear-gradient(135deg, #080000 0%, #180000 28%, #4A0000 58%, #B80000 100%)",
        minHeight: 220,
      }}>
        {/* Mesh orbs */}
        <div style={{ position: "absolute", inset: 0, pointerEvents: "none" }}>
          <div style={{ position: "absolute", top: -60, left: -40, width: 280, height: 280, borderRadius: "50%", background: "radial-gradient(circle, rgba(227,30,36,0.2) 0%, transparent 70%)" }} />
          <div style={{ position: "absolute", bottom: -40, left: 180, width: 200, height: 200, borderRadius: "50%", background: "radial-gradient(circle, rgba(227,30,36,0.12) 0%, transparent 70%)" }} />
        </div>

        {/* Left text content */}
        <div style={{ position: "relative", zIndex: 2, padding: "32px 0 32px 32px", maxWidth: 440 }}>
          <h1 style={{ fontSize: 36, fontWeight: 900, color: "#FFFFFF", lineHeight: 1.1, margin: "0 0 8px" }}>
            Activities
          </h1>
          <p style={{ fontSize: 13, color: "rgba(255,255,255,0.6)", margin: "0 0 20px", lineHeight: 1.5 }}>
            Track real-time updates and progress from your amazing team.
          </p>

          {/* Search bar */}
          <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
            <div style={{ position: "relative", flex: 1 }}>
              <Search size={14} style={{ position: "absolute", left: 12, top: "50%", transform: "translateY(-50%)", color: "rgba(255,255,255,0.4)", pointerEvents: "none" }} />
              <input
                value={search}
                onChange={e => setSearch(e.target.value)}
                placeholder="Search members, updates..."
                style={{
                  width: "100%", boxSizing: "border-box",
                  padding: "10px 12px 10px 34px", border: "1px solid rgba(255,255,255,0.15)",
                  borderRadius: 12, background: "rgba(255,255,255,0.08)", backdropFilter: "blur(8px)",
                  color: "#fff", fontSize: 13, outline: "none",
                }}
              />
            </div>
            <button style={{
              padding: "10px 14px", borderRadius: 12, background: "rgba(255,255,255,0.12)",
              border: "1px solid rgba(255,255,255,0.15)", cursor: "pointer", display: "flex", alignItems: "center",
            }}>
              <Filter size={15} color="rgba(255,255,255,0.7)" />
            </button>
          </div>
        </div>

        {/* 3D character image */}
        <img
          src="/brand/activities-hero.png"
          alt=""
          style={{
            position: "absolute",
            left: "30%",
            right: "22%",
            bottom: 0,
            height: "100%",
            objectFit: "contain",
            objectPosition: "bottom center",
            pointerEvents: "none",
            userSelect: "none",
          }}
        />

        {/* Top-right: date + motivation card */}
        <div style={{ position: "absolute", top: 20, right: 20, zIndex: 3, display: "flex", flexDirection: "column", gap: 8, alignItems: "flex-end" }}>
          {/* Date selector */}
          <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "8px 14px", borderRadius: 10, background: "rgba(255,255,255,0.1)", border: "1px solid rgba(255,255,255,0.15)", backdropFilter: "blur(8px)", cursor: "pointer" }}>
            <span style={{ fontSize: 12, color: "#fff", fontWeight: 600 }}>{displayDate}</span>
            <svg width="12" height="12" viewBox="0 0 12 12" fill="none"><path d="M3 4.5L6 7.5L9 4.5" stroke="rgba(255,255,255,0.6)" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/></svg>
          </div>

          {/* Motivation card */}
          <div style={{ padding: "10px 14px", borderRadius: 12, background: "rgba(255,255,255,0.1)", border: "1px solid rgba(255,255,255,0.15)", backdropFilter: "blur(8px)", maxWidth: 200 }}>
            <div style={{ fontSize: 12, fontWeight: 700, color: "#fff", marginBottom: 2 }}>Keep it up! 🚀</div>
            <div style={{ fontSize: 11, color: "rgba(255,255,255,0.6)", lineHeight: 1.4 }}>Your team&apos;s updates are on track today.</div>
            {/* mini sparkline */}
            <svg width="100%" height="24" style={{ marginTop: 4 }}>
              <polyline points="0,18 20,12 40,15 60,8 80,10 100,5 120,8 140,4 160,6" fill="none" stroke="#E31E24" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
            </svg>
          </div>
        </div>
      </div>

      {/* ── 5 KPI Cards ── */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(5, 1fr)", gap: 14, marginBottom: 20 }}>
        {[
          { label: "Total Updates", value: stats.totalUpdates, sub: "Today", icon: <TrendingUp size={18} color="#E31E24" />, iconBg: "rgba(227,30,36,0.1)" },
          { label: "Present",       value: stats.present,      sub: "Members", icon: <Users size={18} color="#16A34A" />, iconBg: "rgba(22,163,74,0.1)" },
          { label: "On Leave",      value: stats.onLeave,      sub: "Member",  icon: <AlertCircle size={18} color="#F59E0B" />, iconBg: "rgba(245,158,11,0.1)" },
          { label: "Total Hours",   value: fmtHours(stats.totalHours), sub: "Logged", icon: <Clock size={18} color="#6366F1" />, iconBg: "rgba(99,102,241,0.1)" },
          { label: "Not Updated",   value: stats.notUpdated,   sub: "Members", icon: <Bell size={18} color="#E31E24" />, iconBg: "rgba(227,30,36,0.1)" },
        ].map(card => (
          <div key={card.label} style={{
            background: "#fff", borderRadius: 16, padding: "18px 20px",
            boxShadow: "0 1px 3px rgba(0,0,0,0.06), 0 4px 16px rgba(0,0,0,0.04)",
            display: "flex", alignItems: "center", justifyContent: "space-between",
          }}>
            <div>
              <div style={{ fontSize: 11, color: "#9CA3AF", fontWeight: 500, marginBottom: 4 }}>{card.label}</div>
              <div style={{ fontSize: 26, fontWeight: 800, color: "#111827", lineHeight: 1 }}>{card.value}</div>
              <div style={{ fontSize: 11, color: "#9CA3AF", marginTop: 3 }}>{card.sub}</div>
            </div>
            <div style={{ width: 40, height: 40, borderRadius: 12, background: card.iconBg, display: "flex", alignItems: "center", justifyContent: "center" }}>
              {card.icon}
            </div>
          </div>
        ))}
      </div>

      {/* ── Filter Tabs ── */}
      <div style={{ display: "flex", gap: 8, marginBottom: 20, flexWrap: "wrap", alignItems: "center" }}>
        {DATE_PRESETS.map(p => (
          <button
            key={p.label}
            onClick={() => { setShowCustom(false); navigate(p.from, p.to) }}
            style={{
              padding: "8px 18px", borderRadius: 10, fontSize: 13, fontWeight: 600, cursor: "pointer", border: "none",
              background: curPreset === p.label ? "#E31E24" : "#F3F4F6",
              color: curPreset === p.label ? "#fff" : "#374151",
              transition: "all 0.15s",
            }}
          >
            {p.label}
          </button>
        ))}
        <button
          onClick={() => setShowCustom(v => !v)}
          style={{
            padding: "8px 18px", borderRadius: 10, fontSize: 13, fontWeight: 600, cursor: "pointer", border: "none",
            background: curPreset === "Custom" ? "#E31E24" : "#F3F4F6",
            color: curPreset === "Custom" ? "#fff" : "#374151",
          }}
        >
          Custom
        </button>
        {showCustom && (
          <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
            <input type="date" value={customFrom} onChange={e => setCustomFrom(e.target.value)}
              style={{ padding: "6px 10px", borderRadius: 8, border: "1px solid #E5E7EB", fontSize: 12, color: "#374151" }} />
            <span style={{ fontSize: 12, color: "#9CA3AF" }}>to</span>
            <input type="date" value={customTo} onChange={e => setCustomTo(e.target.value)}
              style={{ padding: "6px 10px", borderRadius: 8, border: "1px solid #E5E7EB", fontSize: 12, color: "#374151" }} />
            <button onClick={() => { navigate(customFrom, customTo); setShowCustom(false) }}
              style={{ padding: "6px 14px", borderRadius: 8, background: "#E31E24", color: "#fff", border: "none", cursor: "pointer", fontSize: 12, fontWeight: 600 }}>
              Apply
            </button>
          </div>
        )}
      </div>

      {/* ── Main content ── */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 340px", gap: 20 }}>

        {/* ── Left: Recent Activities Timeline ── */}
        <div style={{ background: "#fff", borderRadius: 20, boxShadow: "0 1px 3px rgba(0,0,0,0.06), 0 4px 20px rgba(0,0,0,0.04)", overflow: "hidden" }}>
          {/* Header */}
          <div style={{ padding: "20px 24px 0", borderBottom: "1px solid #F3F4F6", paddingBottom: 16, display: "flex", alignItems: "center", gap: 10 }}>
            <div style={{ width: 32, height: 32, borderRadius: 8, background: "rgba(227,30,36,0.08)", display: "flex", alignItems: "center", justifyContent: "center" }}>
              <TrendingUp size={16} color="#E31E24" />
            </div>
            <div>
              <div style={{ fontSize: 15, fontWeight: 700, color: "#111827" }}>Recent Activities</div>
              <div style={{ fontSize: 11, color: "#9CA3AF" }}>{filteredActivities.length} updates</div>
            </div>
          </div>

          {/* Timeline */}
          <div style={{ padding: "8px 0 16px" }}>
            {filteredActivities.length === 0 && (
              <div style={{ textAlign: "center", padding: "48px 24px", color: "#9CA3AF", fontSize: 13 }}>
                No activities found
              </div>
            )}
            {filteredActivities.map((u, idx) => {
              const user    = Array.isArray(u.users) ? u.users[0] : u.users
              if (!user) return null
              const desc    = getDescription(u)
              const badge   = getTeamBadge(user.team)
              const [bg, fg] = avatarColor(user.name)
              const initials = getInitials(user.name)
              const time    = fmtTime(u.created_at ?? u.date)
              const isLast  = idx === filteredActivities.length - 1

              return (
                <div key={u.id} style={{ display: "flex", padding: "0 24px", gap: 16 }}>
                  {/* Timeline line */}
                  <div style={{ display: "flex", flexDirection: "column", alignItems: "center", flexShrink: 0 }}>
                    <div style={{ width: 10, height: 10, borderRadius: "50%", background: "#E31E24", marginTop: 18, flexShrink: 0, boxShadow: "0 0 0 3px rgba(227,30,36,0.15)" }} />
                    {!isLast && <div style={{ width: 1.5, flex: 1, background: "rgba(227,30,36,0.15)", minHeight: 20 }} />}
                  </div>

                  {/* Content */}
                  <div style={{ flex: 1, padding: "10px 0", borderBottom: isLast ? "none" : "1px solid #F9FAFB", display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12 }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 12, flex: 1, minWidth: 0 }}>
                      {/* Avatar */}
                      <div style={{ width: 36, height: 36, borderRadius: "50%", background: bg, color: fg, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 12, fontWeight: 700, flexShrink: 0 }}>
                        {initials}
                      </div>
                      {/* Text */}
                      <div style={{ minWidth: 0 }}>
                        <div style={{ fontSize: 13, fontWeight: 700, color: "#111827" }}>{user.name}</div>
                        <div style={{ fontSize: 12, color: "#6B7280", marginTop: 1, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{desc}</div>
                      </div>
                    </div>

                    {/* Right: badge + time */}
                    <div style={{ display: "flex", alignItems: "center", gap: 10, flexShrink: 0 }}>
                      <span style={{ padding: "3px 10px", borderRadius: 8, background: badge.bg, color: badge.color, fontSize: 11, fontWeight: 600, whiteSpace: "nowrap" }}>
                        {badge.label}
                      </span>
                      <span style={{ fontSize: 11, color: "#9CA3AF", whiteSpace: "nowrap" }}>{time}</span>
                      <button style={{ width: 24, height: 24, border: "none", background: "transparent", cursor: "pointer", color: "#D1D5DB", display: "flex", alignItems: "center", justifyContent: "center" }}>
                        <svg width="14" height="14" viewBox="0 0 16 16" fill="currentColor"><circle cx="8" cy="3" r="1.5"/><circle cx="8" cy="8" r="1.5"/><circle cx="8" cy="13" r="1.5"/></svg>
                      </button>
                    </div>
                  </div>
                </div>
              )
            })}
          </div>

          {updates.length > 20 && (
            <div style={{ padding: "0 24px 20px", textAlign: "center" }}>
              <button style={{ padding: "8px 20px", borderRadius: 10, background: "transparent", border: "1px solid #E5E7EB", color: "#E31E24", fontSize: 13, fontWeight: 600, cursor: "pointer" }}>
                View all updates →
              </button>
            </div>
          )}
        </div>

        {/* ── Right Sidebar ── */}
        <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>

          {/* Team Update Overview */}
          <div style={{ background: "#fff", borderRadius: 20, padding: "20px", boxShadow: "0 1px 3px rgba(0,0,0,0.06), 0 4px 20px rgba(0,0,0,0.04)" }}>
            <div style={{ fontSize: 14, fontWeight: 700, color: "#111827", marginBottom: 16 }}>Team Update Overview</div>
            <div style={{ position: "relative", height: 160 }}>
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie data={donutData} cx="50%" cy="50%" innerRadius={52} outerRadius={72} dataKey="value" startAngle={90} endAngle={-270} strokeWidth={0}>
                    {donutData.map((d, i) => <Cell key={i} fill={d.color} />)}
                  </Pie>
                  <Tooltip />
                </PieChart>
              </ResponsiveContainer>
              {/* Center text */}
              <div style={{ position: "absolute", top: "50%", left: "50%", transform: "translate(-50%, -50%)", textAlign: "center", pointerEvents: "none" }}>
                <div style={{ fontSize: 22, fontWeight: 800, color: "#111827" }}>{completionPct}%</div>
                <div style={{ fontSize: 10, color: "#9CA3AF", lineHeight: 1.2 }}>Update<br/>Completion</div>
              </div>
            </div>
            {/* Legend */}
            <div style={{ display: "flex", flexDirection: "column", gap: 8, marginTop: 8 }}>
              {donutData.map(d => (
                <div key={d.name} style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                    <div style={{ width: 10, height: 10, borderRadius: "50%", background: d.color }} />
                    <span style={{ fontSize: 12, color: "#374151" }}>{d.name}</span>
                  </div>
                  <span style={{ fontSize: 12, fontWeight: 600, color: "#374151" }}>{d.pct}% ({d.value})</span>
                </div>
              ))}
            </div>
          </div>

          {/* Members Awaiting Update */}
          <div style={{ background: "#fff", borderRadius: 20, padding: "20px", boxShadow: "0 1px 3px rgba(0,0,0,0.06), 0 4px 20px rgba(0,0,0,0.04)", position: "relative", overflow: "hidden" }}>
            <div style={{ fontSize: 14, fontWeight: 700, color: "#111827", marginBottom: 4 }}>Members Awaiting Update</div>
            <div style={{ fontSize: 11, color: "#9CA3AF", marginBottom: 16 }}>{stats.notUpdated} member{stats.notUpdated !== 1 ? "s" : ""} haven&apos;t updated yet</div>

            {/* Avatar group */}
            {stats.notUpdatedMembers.length > 0 ? (
              <div style={{ display: "flex", alignItems: "center", gap: 0, marginBottom: 16 }}>
                {stats.notUpdatedMembers.slice(0, 5).map((m, i) => {
                  const [bg, fg] = avatarColor(m.name)
                  return (
                    <div key={m.id} title={m.name} style={{
                      width: 32, height: 32, borderRadius: "50%", background: bg, color: fg,
                      fontSize: 11, fontWeight: 700, display: "flex", alignItems: "center", justifyContent: "center",
                      border: "2px solid #fff", marginLeft: i === 0 ? 0 : -8,
                    }}>
                      {getInitials(m.name)}
                    </div>
                  )
                })}
                {stats.notUpdatedMembers.length > 5 && (
                  <div style={{
                    width: 32, height: 32, borderRadius: "50%", background: "#F3F4F6", color: "#6B7280",
                    fontSize: 10, fontWeight: 700, display: "flex", alignItems: "center", justifyContent: "center",
                    border: "2px solid #fff", marginLeft: -8,
                  }}>
                    +{stats.notUpdatedMembers.length - 5}
                  </div>
                )}
              </div>
            ) : (
              <div style={{ fontSize: 12, color: "#16A34A", fontWeight: 600, marginBottom: 16 }}>All members updated ✓</div>
            )}

            <button style={{
              width: "100%", padding: "10px", borderRadius: 10, background: "#E31E24", color: "#fff",
              border: "none", cursor: "pointer", fontSize: 13, fontWeight: 700, display: "flex", alignItems: "center", justifyContent: "center", gap: 6,
            }}>
              <Bell size={14} />
              Send Reminder
            </button>

            {/* Notification bell illustration */}
            <div style={{ position: "absolute", right: -8, bottom: -8, opacity: 0.06 }}>
              <Bell size={100} color="#E31E24" />
            </div>
          </div>

          {/* Top Contributor */}
          {topContributor && (
            <div style={{ background: "#fff", borderRadius: 20, padding: "20px", boxShadow: "0 1px 3px rgba(0,0,0,0.06), 0 4px 20px rgba(0,0,0,0.04)" }}>
              <div style={{ fontSize: 14, fontWeight: 700, color: "#111827", marginBottom: 16 }}>Top Contributor Today</div>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                  {(() => {
                    const [bg, fg] = avatarColor(topContributor.name)
                    return (
                      <div style={{ width: 44, height: 44, borderRadius: "50%", background: bg, color: fg, fontSize: 14, fontWeight: 700, display: "flex", alignItems: "center", justifyContent: "center" }}>
                        {getInitials(topContributor.name)}
                      </div>
                    )
                  })()}
                  <div>
                    <div style={{ fontSize: 14, fontWeight: 700, color: "#111827" }}>{topContributor.name}</div>
                    <div style={{ fontSize: 11, color: "#9CA3AF", marginTop: 2 }}>{topContributor.count} Update{topContributor.count !== 1 ? "s" : ""}</div>
                  </div>
                </div>
                <div style={{ width: 40, height: 40, borderRadius: 12, background: "rgba(227,30,36,0.08)", display: "flex", alignItems: "center", justifyContent: "center" }}>
                  <Star size={20} color="#E31E24" fill="#E31E24" />
                </div>
              </div>
            </div>
          )}

        </div>
      </div>
    </div>
  )
}
