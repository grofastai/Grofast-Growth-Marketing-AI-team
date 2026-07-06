"use client"

import { useState, useMemo } from "react"
import { useRouter, usePathname } from "next/navigation"
import { Search, Filter, Clock, Users, AlertCircle, TrendingUp, Bell, Star, X, ChevronRight } from "lucide-react"
import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip } from "recharts"
import { calcNetWorkHours } from "@/lib/utils/work-hours"
import { PageHero } from "@/components/admin/PageHero"

type WorkEntry = Record<string, unknown>

function getUpdateHours(u: { work_entries: WorkEntry[] | null; working_hours: number | null; learning_hours?: number | null }): number {
  const entries = Array.isArray(u.work_entries) ? u.work_entries : []
  if (entries.length > 0) return calcNetWorkHours(entries as Parameters<typeof calcNetWorkHours>[0])
  return (u.working_hours ?? 0) + (u.learning_hours ?? 0)
}

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

interface Member { id: string; name: string; employee_id: string; team?: string | null; role?: string; monthly_salary?: number | null; hourly_rate?: number | null }
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
  if (t.includes("media production") || team === "Media Team" || team === "Media") return { label: "Media Production", bg: "rgba(236,72,153,0.1)", color: "#EC4899" }
  if (team === "Freelance Videography") return { label: "FL Videography", bg: "rgba(239,68,68,0.1)", color: "#EF4444" }
  if (team === "Freelance Video Editing") return { label: "FL Editing", bg: "rgba(99,102,241,0.1)", color: "#6366F1" }
  if (team === "Freelance RJ Voiceover") return { label: "FL Voiceover", bg: "rgba(168,85,247,0.1)", color: "#A855F7" }
  if (team === "Freelance Graphics Designer") return { label: "FL Graphics", bg: "rgba(249,115,22,0.1)", color: "#F97316" }
  if (team === "Freelance Content Writer") return { label: "FL Content", bg: "rgba(20,184,166,0.1)", color: "#14B8A6" }
  if (team === "Creative Studio" || team === "Creative Team") return { label: "Creative Studio", bg: "rgba(245,158,11,0.1)", color: "#F59E0B" }
  if (t.includes("ai development & auto") || t.includes("automation")) return { label: "AI Dev & Auto", bg: "rgba(99,102,241,0.1)", color: "#6366F1" }
  if (t.includes("performance marketing") || t.includes("marketing & op") || t.includes("tech & ops") || t.includes("technology & op")) return { label: "Perf. Marketing", bg: "rgba(16,185,129,0.1)", color: "#10B981" }
  if (t.includes("ai development & media") || t.includes("media & tech") || t.includes("it technology")) return { label: "AI Dev & Media", bg: "rgba(139,92,246,0.1)", color: "#8B5CF6" }
  if (t.includes("media")) return { label: "Media Production", bg: "rgba(236,72,153,0.1)", color: "#EC4899" }
  return { label: team ?? "Team", bg: "rgba(99,102,241,0.1)", color: "#6366F1" }
}

function fmtTime(isoOrDate: string | undefined): string {
  if (!isoOrDate) return ""
  try {
    const d = new Date(isoOrDate)
    return d.toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit", hour12: true })
  } catch { return "" }
}

function parseLearningTitle(title: string | undefined): { client: string; topic: string } {
  if (!title) return { client: "", topic: "" }
  const m = title.match(/^\[([^\]]+)\]\s*(.*)$/)
  return m ? { client: m[1], topic: m[2] } : { client: "", topic: title }
}

function getEntryTypeLabel(type: unknown): { label: string; color: string; bg: string; emoji: string } {
  const t = String(type ?? "").toLowerCase()
  if (t === "shoot")     return { label: "Shoot",      color: "#0EA5E9", bg: "rgba(14,165,233,0.1)",  emoji: "📹" }
  if (t === "edit")      return { label: "Edit",        color: "#6366F1", bg: "rgba(99,102,241,0.1)",  emoji: "🎬" }
  if (t === "voiceover") return { label: "Voiceover",  color: "#A855F7", bg: "rgba(168,85,247,0.1)", emoji: "🎙️" }
  if (t === "poster")    return { label: "Poster",     color: "#F97316", bg: "rgba(249,115,22,0.1)",  emoji: "🎨" }
  if (t === "log")       return { label: "Log",         color: "#10B981", bg: "rgba(16,185,129,0.1)", emoji: "📋" }
  if (t === "learning")  return { label: "Learning",   color: "#F59E0B", bg: "rgba(245,158,11,0.1)",  emoji: "📚" }
  if (t === "break")     return { label: "Break",      color: "#9CA3AF", bg: "rgba(156,163,175,0.1)", emoji: "☕" }
  return { label: "Work", color: "#374151", bg: "rgba(55,65,81,0.08)", emoji: "💼" }
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

// ── Person Detail Drawer ──────────────────────────────────────────────────────
function PersonDetailDrawer({ updates, onClose, collabHoursMap = {} }: { updates: Update[]; onClose: () => void; collabHoursMap?: Record<string, number> }) {
  const firstUpdate = updates[0]
  const user = Array.isArray(firstUpdate?.users) ? firstUpdate.users[0] : firstUpdate?.users
  if (!user) return null

  const [bg, fg] = avatarColor(user.name)
  const badge = getTeamBadge(user.team)

  const totalHours = updates.reduce((s, u) => s + getUpdateHours(u) + (collabHoursMap[`${user.id}:${u.date}`] ?? 0), 0)

  // Group entries by date, latest first
  const byDate = new Map<string, WorkEntry[]>()
  for (const u of [...updates].sort((a, b) => (b.date ?? "").localeCompare(a.date ?? ""))) {
    const entries = (Array.isArray(u.work_entries) ? u.work_entries : []) as WorkEntry[]
    const work = entries.filter(e => e.task_type !== "break" && e.task_type !== "not_started")
    if (work.length > 0) {
      const d = u.date ?? u.created_at?.split("T")[0] ?? "Unknown"
      byDate.set(d, [...(byDate.get(d) ?? []), ...work])
    }
  }
  const dateGroups = [...byDate.entries()] // already sorted latest first
  const totalEntryCount = dateGroups.reduce((s, [, e]) => s + e.length, 0)
  const notes = updates.map(u => u.notes).filter(Boolean).join(" | ")

  return (
    <>
      {/* Backdrop */}
      <div
        onClick={onClose}
        style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.45)", backdropFilter: "blur(3px)", zIndex: 40 }}
      />
      {/* Drawer */}
      <div style={{
        position: "fixed", top: 0, right: 0, height: "100vh", width: "min(560px, 100vw)", zIndex: 50,
        background: "#fff", boxShadow: "-8px 0 48px rgba(0,0,0,0.14)",
        display: "flex", flexDirection: "column", overflow: "hidden",
      }}>
        {/* Header */}
        <div style={{ padding: "16px 20px", borderBottom: "1px solid #F3F4F6", flexShrink: 0 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
            <div style={{ width: 46, height: 46, borderRadius: "50%", background: bg, color: fg, fontSize: 15, fontWeight: 800, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
              {getInitials(user.name)}
            </div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: 16, fontWeight: 800, color: "#111827", lineHeight: 1.2 }}>{user.name}</div>
              <span style={{ display: "inline-block", padding: "2px 9px", borderRadius: 6, background: badge.bg, color: badge.color, fontSize: 10, fontWeight: 700, marginTop: 4 }}>{badge.label}</span>
            </div>
            <button onClick={onClose} style={{ width: 30, height: 30, borderRadius: 8, border: "1px solid #E5E7EB", background: "#F9FAFB", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
              <X size={13} color="#6B7280" />
            </button>
          </div>
        </div>

        {/* Scrollable body */}
        <div style={{ flex: 1, overflowY: "auto", padding: "16px 24px 32px" }}>

          {/* Work entries grouped by date */}
          {dateGroups.length === 0 ? (
            <div style={{ textAlign: "center", padding: "48px 0", color: "#9CA3AF", fontSize: 13 }}>No work entries recorded</div>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
              {dateGroups.map(([date, entries]) => (
                <div key={date}>
                  {/* Date header */}
                  <div style={{ fontSize: 11, fontWeight: 800, color: "#6B7280", textTransform: "uppercase", letterSpacing: "0.1em", marginBottom: 8, paddingBottom: 6, borderBottom: "1px solid #F0F0F5" }}>
                    {(() => { try { return new Date(date + "T12:00:00").toLocaleDateString("en-IN", { weekday: "short", day: "numeric", month: "short", year: "numeric" }) } catch { return date } })()}
                  </div>
                  <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
              {entries.map((e, i) => {
                const typeInfo = getEntryTypeLabel(e.task_type)
                const rawTitle = (e.title || e.task_name || e.description || "") as string
                const isLearning = e.task_type === "learning"
                const { client: parsedClient, topic: parsedTopic } = isLearning ? parseLearningTitle(rawTitle) : { client: "", topic: "" }
                const title = isLearning ? (parsedTopic || rawTitle) : rawTitle
                const client = (e.client_name || e._brand || e._custom_client || e.client || "") as string
                const clientNames = isLearning
                  ? parsedClient
                  : (Array.isArray(e.client_names) ? (e.client_names as string[]).join(", ") : client)
                const durationH = (e.duration_hours || e.working_hours || 0) as number
                const startTime = e.start_time as string | undefined
                const endTime = e.end_time as string | undefined
                const videoType = e.video_type as string | undefined
                const entryNotes = e.notes as string | undefined

                return (
                  <div key={i} style={{
                    background: "#FFFFFF", borderRadius: 10, padding: "12px 14px",
                    border: "1px solid #F0F0F5", borderLeft: `3px solid ${typeInfo.color}`,
                    display: "flex", alignItems: "center", gap: 12,
                  }}>
                    {/* Type icon square */}
                    <div style={{ width: 34, height: 34, borderRadius: 9, flexShrink: 0, background: typeInfo.bg, display: "flex", alignItems: "center", justifyContent: "center" }}>
                      <span style={{ fontSize: 16 }}>{typeInfo.emoji}</span>
                    </div>
                    {/* Center info */}
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <p style={{ fontSize: 12, fontWeight: 800, color: "#111827", margin: 0, lineHeight: 1.3, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                        {title || typeInfo.label}
                      </p>
                      {clientNames && (
                        <div style={{ marginTop: 5 }}>
                          <span style={{ fontSize: 10, fontWeight: 700, color: typeInfo.color, background: typeInfo.bg, padding: "2px 8px", borderRadius: 5 }}>
                            {clientNames}
                          </span>
                        </div>
                      )}
                      {startTime && endTime && (
                        <p style={{ fontSize: 10, color: "#9CA3AF", margin: "5px 0 0" }}>{startTime} – {endTime}</p>
                      )}
                    </div>
                    {/* Duration */}
                    {durationH > 0 && (
                      <div style={{ flexShrink: 0, textAlign: "right" }}>
                        <div style={{ fontSize: 12, fontWeight: 800, color: typeInfo.color }}>{fmtHours(durationH)}</div>
                        <div style={{ fontSize: 9, color: "#9CA3AF", textTransform: "uppercase", marginTop: 1 }}>⏱</div>
                      </div>
                    )}
                  </div>
                )
              })}
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* Notes */}
          {notes && (
            <div style={{ marginTop: 16, padding: "12px 16px", borderRadius: 12, background: "rgba(99,102,241,0.05)", border: "1px solid rgba(99,102,241,0.15)" }}>
              <div style={{ fontSize: 10, fontWeight: 700, color: "#6366F1", textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: 5 }}>Notes</div>
              <div style={{ fontSize: 12, color: "#374151", lineHeight: 1.6 }}>{notes}</div>
            </div>
          )}

          {/* Submission time */}
          {firstUpdate.created_at && (
            <div style={{ marginTop: 14, fontSize: 11, color: "#D1D5DB", textAlign: "center" }}>
              Submitted at {fmtTime(firstUpdate.created_at)}
            </div>
          )}
        </div>
      </div>
    </>
  )
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
  const [selectedUserId, setSelectedUserId] = useState<string | null>(null)

  void onLeaveIds; void pendingLeaves; void pendingCollabs

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

  // ── Group updates by user ──────────────────────────────────────────────────
  const groupedByUser = useMemo(() => {
    const map = new Map<string, Update[]>()
    for (const u of updates) {
      const user = Array.isArray(u.users) ? u.users[0] : u.users
      if (!user) continue
      if (!map.has(user.id)) map.set(user.id, [])
      map.get(user.id)!.push(u)
    }
    return map
  }, [updates])

  // ── Stats ──────────────────────────────────────────────────────────────────
  const stats = useMemo(() => {
    const activeMembers = members.filter(m => m.role !== "ADMIN")
    const activeMemberIds = new Set(activeMembers.map(m => m.id))

    // Present/on-leave come from the same clock-in / approved-leave data the
    // Dashboard and Attendance pages use — not from each update's own
    // attendance_status flag, which only exists if that member happened to
    // submit a daily update (independent of whether they actually clocked in).
    const presentSet = new Set<string>()
    for (const key of clockInDays ?? []) {
      const sep = key.lastIndexOf(":")
      const userId = key.slice(0, sep)
      if (activeMemberIds.has(userId)) presentSet.add(userId)
    }

    const onLeaveSet = new Set<string>()
    for (const key of leaveDays ?? []) {
      const sep = key.lastIndexOf(":")
      const userId = key.slice(0, sep)
      if (activeMemberIds.has(userId)) onLeaveSet.add(userId)
    }

    let totalHours = 0
    for (const u of updates) {
      const user = Array.isArray(u.users) ? u.users[0] : u.users
      if (!user) continue
      if (u.attendance_status !== "present") continue
      const collabH = collabHoursMap[`${user.id}:${u.date}`] ?? 0
      totalHours += getUpdateHours(u) + collabH
    }

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
  }, [updates, members, collabHoursMap, clockInDays, leaveDays])

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

  const topContributor = useMemo(() => {
    const map: Record<string, { name: string; count: number; hours: number }> = {}
    for (const u of updates) {
      if (u.attendance_status !== "present") continue
      const user = Array.isArray(u.users) ? u.users[0] : u.users
      if (!user) continue
      if (!map[user.id]) map[user.id] = { name: user.name, count: 0, hours: 0 }
      map[user.id].count++
      map[user.id].hours += getUpdateHours(u)
    }
    const sorted = Object.values(map).sort((a, b) => b.hours - a.hours || b.count - a.count)
    return sorted[0] ?? null
  }, [updates])

  // ── Filtered people list (grouped) ────────────────────────────────────────
  const filteredPeople = useMemo(() => {
    const q = search.toLowerCase()
    const people: Array<{ userId: string; user: NonNullable<Update["users"]>; userUpdates: Update[]; totalHours: number; entryCount: number; time: string }> = []

    for (const [userId, userUpdates] of groupedByUser) {
      const user = Array.isArray(userUpdates[0]?.users) ? userUpdates[0].users[0] : userUpdates[0]?.users
      if (!user) continue
      if (q && !user.name.toLowerCase().includes(q) && !userUpdates.some(u => getDescription(u).toLowerCase().includes(q))) continue
      const totalHours = userUpdates.reduce((s, u) => s + getUpdateHours(u), 0)
      const allEntries = userUpdates.flatMap(u => Array.isArray(u.work_entries) ? u.work_entries : []) as WorkEntry[]
      const entryCount = allEntries.filter(e => e.task_type !== "break").length
      const time = fmtTime(userUpdates[0]?.created_at ?? userUpdates[0]?.date)
      people.push({ userId, user, userUpdates, totalHours, entryCount, time })
    }

    return people.sort((a, b) => (b.userUpdates[0]?.created_at ?? "") .localeCompare(a.userUpdates[0]?.created_at ?? ""))
  }, [groupedByUser, search])

  const displayDate = useMemo(() => {
    try {
      const d = new Date(to + "T12:00:00")
      return d.toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" })
    } catch { return to }
  }, [to])

  const curPreset = activePreset()

  // Selected person's updates
  const selectedUserUpdates = selectedUserId ? groupedByUser.get(selectedUserId) ?? null : null

  return (
    <div style={{ padding: "24px 24px 64px", maxWidth: 1400, margin: "0 auto", fontFamily: "var(--font-jakarta, Inter, sans-serif)" }}>

      {/* ── Hero Banner ── */}
      <div style={{ marginBottom: 24 }}>
        <PageHero
          title="Activities"
          subtitle="Track real-time updates and progress from your amazing team."
          illustration={
            <div style={{ position: "absolute", bottom: "clamp(-30px,-9vw,-85px)", left: "54%", transform: "translateX(-50%)", zIndex: 1, pointerEvents: "none" }}>
              <img
                src="/brand/activities-hero.png"
                alt=""
                style={{ height: "clamp(120px,36vw,300px)", width: "auto", objectFit: "contain", userSelect: "none" }}
              />
            </div>
          }
          belowSubtitle={
            <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
              <div style={{ position: "relative", flex: 1, maxWidth: 280 }}>
                <Search size={14} style={{ position: "absolute", left: 14, top: "50%", transform: "translateY(-50%)", color: "rgba(255,255,255,0.45)", pointerEvents: "none" }} />
                <input
                  value={search}
                  onChange={e => setSearch(e.target.value)}
                  placeholder="Search members, updates..."
                  style={{
                    width: "100%", boxSizing: "border-box", height: 44,
                    padding: "0 14px 0 38px", border: "1px solid rgba(255,255,255,0.18)",
                    borderRadius: 14, background: "rgba(255,255,255,0.09)", backdropFilter: "blur(10px)",
                    color: "#fff", fontSize: 13, outline: "none",
                  }}
                />
              </div>
              <button style={{
                width: 44, height: 44, borderRadius: 14, background: "rgba(255,255,255,0.12)",
                border: "1px solid rgba(255,255,255,0.18)", cursor: "pointer",
                display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0,
              }}>
                <Filter size={16} color="rgba(255,255,255,0.75)" />
              </button>
            </div>
          }
          rightSlot={
            <div className="hidden md:flex" style={{ flexDirection: "column", gap: 8, alignItems: "flex-end", justifyContent: "flex-start" }}>
              <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "8px 14px", borderRadius: 10, background: "rgba(255,255,255,0.1)", border: "1px solid rgba(255,255,255,0.18)", backdropFilter: "blur(8px)", cursor: "pointer", whiteSpace: "nowrap" }}>
                <span style={{ fontSize: 12, color: "#fff", fontWeight: 600 }}>{displayDate}</span>
                <svg width="12" height="12" viewBox="0 0 12 12" fill="none"><path d="M3 4.5L6 7.5L9 4.5" stroke="rgba(255,255,255,0.6)" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/></svg>
              </div>
              <div style={{ padding: "10px 14px", borderRadius: 12, background: "rgba(255,255,255,0.1)", border: "1px solid rgba(255,255,255,0.18)", backdropFilter: "blur(8px)", width: 200 }}>
                <div style={{ fontSize: 12, fontWeight: 700, color: "#fff", marginBottom: 2 }}>Keep it up! 🚀</div>
                <div style={{ fontSize: 11, color: "rgba(255,255,255,0.6)", lineHeight: 1.4 }}>Team updates are on track today.</div>
                <svg width="100%" height="24" style={{ marginTop: 4 }}>
                  <polyline points="0,18 20,12 40,15 60,8 80,10 100,5 120,8 140,4 160,6" fill="none" stroke="#E31E24" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
                </svg>
              </div>
            </div>
          }
        />
      </div>

      {/* ── 5 KPI Cards ── */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5" style={{ gap: 14, marginBottom: 20 }}>
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
      <div style={{ display: "flex", gap: 8, marginBottom: 20, overflowX: "auto", flexWrap: "nowrap", alignItems: "center", paddingBottom: 4 }}>
        {DATE_PRESETS.map(p => (
          <button
            key={p.label}
            onClick={() => { setShowCustom(false); navigate(p.from, p.to) }}
            style={{
              padding: "8px 18px", borderRadius: 10, fontSize: 13, fontWeight: 600, cursor: "pointer", border: "none",
              background: curPreset === p.label ? "#E31E24" : "#F3F4F6",
              color: curPreset === p.label ? "#fff" : "#374151",
              transition: "all 0.15s", flexShrink: 0, whiteSpace: "nowrap",
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
            flexShrink: 0, whiteSpace: "nowrap",
          }}
        >
          Custom
        </button>
        {showCustom && (
          <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
            <input type="date" max="2099-12-31" value={customFrom} onChange={e => setCustomFrom(e.target.value)}
              style={{ padding: "6px 10px", borderRadius: 8, border: "1px solid #E5E7EB", fontSize: 12, color: "#374151" }} />
            <span style={{ fontSize: 12, color: "#9CA3AF" }}>to</span>
            <input type="date" max="2099-12-31" value={customTo} onChange={e => setCustomTo(e.target.value)}
              style={{ padding: "6px 10px", borderRadius: 8, border: "1px solid #E5E7EB", fontSize: 12, color: "#374151" }} />
            <button onClick={() => { navigate(customFrom, customTo); setShowCustom(false) }}
              style={{ padding: "6px 14px", borderRadius: 8, background: "#E31E24", color: "#fff", border: "none", cursor: "pointer", fontSize: 12, fontWeight: 600 }}>
              Apply
            </button>
          </div>
        )}
      </div>

      {/* ── Main content ── */}
      <div className="grid grid-cols-1 lg:grid-cols-[1fr_340px]" style={{ gap: 20 }}>

        {/* ── Left: People who updated ── */}
        <div style={{ background: "#fff", borderRadius: 20, boxShadow: "0 1px 3px rgba(0,0,0,0.06), 0 4px 20px rgba(0,0,0,0.04)", overflow: "hidden" }}>
          {/* Header */}
          <div style={{ padding: "20px 24px 16px", borderBottom: "1px solid #F3F4F6", display: "flex", alignItems: "center", gap: 10 }}>
            <div style={{ width: 32, height: 32, borderRadius: 8, background: "rgba(227,30,36,0.08)", display: "flex", alignItems: "center", justifyContent: "center" }}>
              <TrendingUp size={16} color="#E31E24" />
            </div>
            <div>
              <div style={{ fontSize: 15, fontWeight: 700, color: "#111827" }}>Recent Activities</div>
              <div style={{ fontSize: 11, color: "#9CA3AF" }}>{filteredPeople.length} member{filteredPeople.length !== 1 ? "s" : ""} updated · click to view details</div>
            </div>
          </div>

          {/* People list */}
          <div style={{ padding: "8px 0 16px" }}>
            {filteredPeople.length === 0 && (
              <div style={{ textAlign: "center", padding: "48px 24px", color: "#9CA3AF", fontSize: 13 }}>
                No activities found
              </div>
            )}
            {filteredPeople.map(({ userId, user, userUpdates, totalHours, entryCount, time }, idx) => {
              const badge    = getTeamBadge(user.team)
              const [bg, fg] = avatarColor(user.name)
              const isLast   = idx === filteredPeople.length - 1
              const isSelected = selectedUserId === userId
              const allEntries = userUpdates.flatMap(u => Array.isArray(u.work_entries) ? u.work_entries : []) as WorkEntry[]
              const workTypes = [...new Set(allEntries.filter(e => e.task_type && e.task_type !== "break").map(e => getEntryTypeLabel(e.task_type).emoji))]

              return (
                <div
                  key={userId}
                  onClick={() => setSelectedUserId(isSelected ? null : userId)}
                  style={{
                    display: "flex", padding: "0 24px", gap: 16, cursor: "pointer",
                    background: isSelected ? "rgba(227,30,36,0.03)" : "transparent",
                    transition: "background 0.15s",
                  }}
                  onMouseEnter={e => { if (!isSelected) (e.currentTarget as HTMLElement).style.background = "#FAFAFA" }}
                  onMouseLeave={e => { if (!isSelected) (e.currentTarget as HTMLElement).style.background = "transparent" }}
                >
                  {/* Timeline line */}
                  <div style={{ display: "flex", flexDirection: "column", alignItems: "center", flexShrink: 0 }}>
                    <div style={{
                      width: 10, height: 10, borderRadius: "50%",
                      background: isSelected ? "#E31E24" : "#E31E24",
                      marginTop: 22, flexShrink: 0,
                      boxShadow: isSelected ? "0 0 0 4px rgba(227,30,36,0.2)" : "0 0 0 3px rgba(227,30,36,0.15)",
                    }} />
                    {!isLast && <div style={{ width: 1.5, flex: 1, background: "rgba(227,30,36,0.15)", minHeight: 20 }} />}
                  </div>

                  {/* Content row */}
                  <div style={{
                    flex: 1, padding: "12px 0",
                    borderBottom: isLast ? "none" : "1px solid #F9FAFB",
                    display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12,
                  }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 12, flex: 1, minWidth: 0 }}>
                      {/* Avatar */}
                      <div style={{ width: 40, height: 40, borderRadius: "50%", background: bg, color: fg, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 13, fontWeight: 700, flexShrink: 0, boxShadow: isSelected ? `0 0 0 2.5px ${bg}` : "none" }}>
                        {getInitials(user.name)}
                      </div>
                      {/* Info */}
                      <div style={{ minWidth: 0 }}>
                        <div style={{ fontSize: 13, fontWeight: 700, color: "#111827" }}>{user.name}</div>
                        <div style={{ display: "flex", alignItems: "center", gap: 6, marginTop: 3, flexWrap: "wrap" }}>
                          <span style={{ padding: "1px 8px", borderRadius: 6, background: badge.bg, color: badge.color, fontSize: 10, fontWeight: 700 }}>{badge.label}</span>
                          {workTypes.length > 0 && (
                            <span style={{ fontSize: 12, letterSpacing: "0.05em" }}>{workTypes.join(" ")}</span>
                          )}
                          {entryCount > 0 && (
                            <span style={{ fontSize: 10, color: "#9CA3AF", fontWeight: 600 }}>{entryCount} {entryCount === 1 ? "entry" : "entries"}</span>
                          )}
                        </div>
                      </div>
                    </div>

                    {/* Right: hours + time + arrow */}
                    <div style={{ display: "flex", alignItems: "center", gap: 10, flexShrink: 0 }}>
                      {totalHours > 0 && (
                        <span style={{ fontSize: 12, fontWeight: 700, color: "#374151", display: "flex", alignItems: "center", gap: 3 }}>
                          <Clock size={11} color="#9CA3AF" /> {fmtHours(totalHours)}
                        </span>
                      )}
                      <span style={{ fontSize: 11, color: "#9CA3AF", whiteSpace: "nowrap" }}>{time}</span>
                      <ChevronRight size={15} color={isSelected ? "#E31E24" : "#D1D5DB"} style={{ transition: "color 0.15s" }} />
                    </div>
                  </div>
                </div>
              )
            })}
          </div>
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
              <div style={{ position: "absolute", top: "50%", left: "50%", transform: "translate(-50%, -50%)", textAlign: "center", pointerEvents: "none" }}>
                <div style={{ fontSize: 22, fontWeight: 800, color: "#111827" }}>{completionPct}%</div>
                <div style={{ fontSize: 10, color: "#9CA3AF", lineHeight: 1.2 }}>Update<br/>Completion</div>
              </div>
            </div>
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

      {/* ── Person Detail Drawer ── */}
      {selectedUserUpdates && (
        <PersonDetailDrawer
          updates={selectedUserUpdates}
          onClose={() => setSelectedUserId(null)}
          collabHoursMap={collabHoursMap}
        />
      )}
    </div>
  )
}
