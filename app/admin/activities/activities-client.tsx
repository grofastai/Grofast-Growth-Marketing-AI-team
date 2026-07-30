"use client"

import { useState, useMemo } from "react"
import { useRouter, usePathname } from "next/navigation"
import { Clock, Users, AlertCircle, TrendingUp, Bell, Star, X, ChevronRight, Camera, Film, BookOpen, Coffee, GraduationCap, Mic, Image as ImageIcon, FileText, Code2, CalendarClock } from "lucide-react"
import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip } from "recharts"
import { calcNetWorkHours } from "@/lib/utils/work-hours"
import { PageHero } from "@/components/admin/PageHero"
import { todayIST } from "@/lib/utils/ist-date"
import type { TeamRow } from "@/lib/actions/teams"
import { hexToRgba } from "@/lib/utils/team-colors"

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

function getTeamBadge(team: string | null | undefined, teams: TeamRow[] = []): { label: string; bg: string; color: string } {
  const row = teams.find(x => x.name === team)
  if (row?.color) return { label: row.name, bg: hexToRgba(row.color, 0.1), color: row.color }
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

// Counts distinct pieces of work, not entries — a video edited/revised 3 times
// is 1 unique work, not 3, so revisions of the same title don't inflate the count.
function countUniqueWork(rows: Array<{ title: string }>): number {
  const seen = new Set<string>()
  let count = 0
  for (const r of rows) {
    const key = r.title.trim().toLowerCase()
    if (!key) { count++; continue }
    if (seen.has(key)) continue
    seen.add(key)
    count++
  }
  return count
}

// Same exact rule as app/admin/insights/page.tsx's isMediaTeam — only these two
// team names count as "media"; everything else (incl. AI Dev & Creative teams) is non-media.
function isMediaTeam(team: string | null | undefined): boolean {
  const t = (team ?? "").toLowerCase().trim()
  return t === "media production team" || t === "media team"
}

function fmt12(t: string | undefined): string {
  if (!t) return ""
  const [h, m] = t.split(":").map(Number)
  if (Number.isNaN(h) || Number.isNaN(m)) return t
  return `${h % 12 || 12}:${String(m).padStart(2, "0")} ${h >= 12 ? "PM" : "AM"}`
}

function calcDurationFromTimes(start?: string, end?: string): number | null {
  if (!start || !end) return null
  const [sh, sm] = start.split(":").map(Number)
  const [eh, em] = end.split(":").map(Number)
  const diff = (eh * 60 + em) - (sh * 60 + sm)
  return diff > 0 ? diff / 60 : null
}

function shiftYm(ym: string, delta: number): string {
  const [y, m] = ym.split("-").map(Number)
  const d = new Date(y, m - 1 + delta, 1)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`
}

function ymRange(ym: string): [string, string] {
  const [y, m] = ym.split("-").map(Number)
  const first = `${y}-${String(m).padStart(2, "0")}-01`
  const lastDay = new Date(y, m, 0).getDate()
  const last = `${y}-${String(m).padStart(2, "0")}-${String(lastDay).padStart(2, "0")}`
  return [first, last]
}

function monthLabel(ym: string): string {
  try {
    const [y, m] = ym.split("-").map(Number)
    return new Date(y, m - 1, 1).toLocaleDateString("en-US", { month: "long", year: "numeric" })
  } catch { return ym }
}

function fmtTravel(h: number): string {
  let hrs = Math.floor(h); let mins = Math.round((h % 1) * 60)
  if (mins === 60) { hrs += 1; mins = 0 }
  return mins > 0 ? `${hrs}h ${mins}m` : `${hrs}h`
}

function stripShootNotes(notes: string): string {
  if (!notes) return ""
  return notes.split(" | ").filter(p => !p.match(/^(Brand:|Shop:|Location:|Travel:|Client:)/)).join(" | ").trim()
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
  if (t === "scripting")     return { label: "Scripting",   color: "#EAB308", bg: "rgba(234,179,8,0.1)",   emoji: "📝" }
  if (t === "development")   return { label: "Development", color: "#4338CA", bg: "rgba(67,56,202,0.1)",   emoji: "💻" }
  if (t === "other_activity") return { label: "Other",      color: "#6B7280", bg: "rgba(107,114,128,0.1)", emoji: "🗓️" }
  // 'other' below = generic Technical/Working block (historical naming) — distinct from 'other_activity' above
  return { label: "Work", color: "#374151", bg: "rgba(55,65,81,0.08)", emoji: "💼" }
}

// Exact same icon/color/label config as app/member/history/history-client.tsx's
// TASK_CFG, so the drawer reads as visually identical to History for a given person.
const TASK_CFG: Record<string, { Icon: typeof Camera; color: string; bg: string; label: string }> = {
  shoot:          { Icon: Camera,        color: "#EF4444", bg: "rgba(239,68,68,0.1)",   label: "Shoot" },
  edit:           { Icon: Film,          color: "#6366F1", bg: "rgba(99,102,241,0.1)",  label: "Editing" },
  other:          { Icon: BookOpen,      color: "#F59E0B", bg: "rgba(245,158,11,0.1)",  label: "Work" },
  break:          { Icon: Coffee,        color: "#78716C", bg: "rgba(120,113,108,0.1)", label: "Break" },
  learning:       { Icon: GraduationCap, color: "#059669", bg: "rgba(5,150,105,0.12)",  label: "Learning" },
  voiceover:      { Icon: Mic,           color: "#8B5CF6", bg: "rgba(139,92,246,0.1)",  label: "Voiceover" },
  poster:         { Icon: ImageIcon,     color: "#EC4899", bg: "rgba(236,72,153,0.1)",  label: "Poster" },
  scripting:      { Icon: FileText,      color: "#EAB308", bg: "rgba(234,179,8,0.1)",   label: "Scripting" },
  development:    { Icon: Code2,         color: "#6366F1", bg: "rgba(99,102,241,0.1)",  label: "Development" },
  other_activity: { Icon: CalendarClock, color: "#6B7280", bg: "rgba(107,114,128,0.1)", label: "Other" },
}

// Priority order for the up-to-5 Work Analysis KPI slots: real work types first
// (shoot/edit/voiceover/poster/scripting/development/other-technical), then
// Learning, then Other(activity) only fill remaining slots — so a person with
// 5+ real work types never gets Learning/Other bumping one out, per explicit
// user spec (2026-07-31).
const PROPER_WORK_TYPES = ["shoot", "edit", "voiceover", "poster", "scripting", "development", "other"]

// Copied verbatim from app/admin/clients/clients-unified-client.tsx's StatChip —
// the exact card the user pointed at as the reference to match, not approximate.
function StatChip({ label, emoji, hours, count, color, isCost }: {
  label: string; emoji: string; hours: string; count?: number | string; color: string; isCost?: boolean
}) {
  const hasHours = hours && hours !== '0.0h' && hours !== '₹0'
  return (
    <div style={{
      background: '#fff', borderRadius: 16,
      border: `1.5px solid ${color}22`,
      borderTop: `3px solid ${color}`,
      padding: '14px 16px 16px', flex: 1, minWidth: 120,
      boxShadow: `0 4px 16px ${color}12, 0 1px 4px rgba(0,0,0,0.05)`,
      display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8,
      textAlign: 'center',
    }}>
      {/* Line 1 — emoji + colored label */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
        <span style={{ fontSize: 15, lineHeight: 1 }}>{emoji}</span>
        <span style={{
          fontSize: 10, fontWeight: 800, color,
          textTransform: 'uppercase', letterSpacing: '0.08em',
        }}>{label}</span>
      </div>

      {/* Line 2 — value + 3D count badge */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8 }}>
        <p style={{
          fontSize: 22, fontWeight: 900, margin: 0, lineHeight: 1,
          fontFamily: 'var(--font-jakarta)',
          color: isCost ? color : '#111827',
        }}>
          {hasHours ? hours : (count != null ? String(count) : hours)}
        </p>
        {/* 3D badge — only when we have both a real value and a count */}
        {count != null && hasHours && (
          <div style={{
            width: 26, height: 26, borderRadius: '50%', flexShrink: 0,
            background: `linear-gradient(145deg, ${color}EE 0%, ${color} 100%)`,
            boxShadow: `0 4px 10px ${color}55, 0 1px 3px rgba(0,0,0,0.18), inset 0 1px 0 rgba(255,255,255,0.3)`,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontSize: 10, fontWeight: 900, color: '#fff',
          }}>
            {count}
          </div>
        )}
      </div>
    </div>
  )
}

// Emoji per work type for StatChip — same glyphs as clients-unified-client.tsx's
// StatChip usages, extended with the extra types Work Analysis needs.
const TASK_EMOJI: Record<string, string> = {
  shoot: "📸", edit: "🎬", other: "💼", voiceover: "🎙️", poster: "🖼️",
  scripting: "📝", development: "💻", learning: "📚", other_activity: "🗓️", break: "☕",
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
function PersonDetailDrawer({ updates, onClose, collabHoursMap = {}, members, teams = [] }: { updates: Update[]; onClose: () => void; collabHoursMap?: Record<string, number>; members: Member[]; teams?: TeamRow[] }) {
  const firstUpdate = updates[0]
  const user = Array.isArray(firstUpdate?.users) ? firstUpdate.users[0] : firstUpdate?.users
  if (!user) return null

  const [bg, fg] = avatarColor(user.name)
  const badge = getTeamBadge(user.team, teams)

  const totalHours = updates.reduce((s, u) => s + getUpdateHours(u) + (collabHoursMap[`${user.id}:${u.date}`] ?? 0), 0)

  // Group entries by date, latest first
  const byDate = new Map<string, WorkEntry[]>()
  for (const u of [...updates].sort((a, b) => (b.date ?? "").localeCompare(a.date ?? ""))) {
    const entries = (Array.isArray(u.work_entries) ? u.work_entries : []) as WorkEntry[]
    const work = entries.filter(e => e.task_type !== "not_started")
    if (work.length > 0) {
      const d = u.date ?? u.created_at?.split("T")[0] ?? "Unknown"
      byDate.set(d, [...(byDate.get(d) ?? []), ...work])
    }
  }
  // Within each day, order entries by actual clock time (not DB/edit insertion order)
  for (const entries of byDate.values()) {
    entries.sort((a, b) => {
      const ta = (a.start_time as string | undefined) ?? ""
      const tb = (b.start_time as string | undefined) ?? ""
      if (!ta && !tb) return 0
      if (!ta) return 1
      if (!tb) return -1
      return ta.localeCompare(tb)
    })
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
              <X size={13} color="#1E3A5F" />
            </button>
          </div>
        </div>

        {/* Scrollable body */}
        <div style={{ flex: 1, overflowY: "auto", padding: "16px 24px 32px" }}>

          {/* Work entries grouped by date — visually identical to Member > History's day cards */}
          {dateGroups.length === 0 ? (
            <div style={{ textAlign: "center", padding: "48px 0", color: "#1E3A5F", fontSize: 13 }}>No work entries recorded</div>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
              {dateGroups.map(([date, entries]) => {
                const dObj = (() => { try { return new Date(date + "T12:00:00") } catch { return null } })()
                const dateLabel = dObj ? dObj.toLocaleDateString("en-US", { weekday: "long", day: "numeric", month: "long", year: "numeric" }) : date

                return (
                  <div key={date} style={{ background: "#fff", borderRadius: 20, border: "1px solid #EBEDF2", overflow: "hidden", boxShadow: "0 2px 10px rgba(0,0,0,0.05)" }}>
                    {/* Day header */}
                    <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "14px 18px", borderBottom: "1px solid #F5F6FA" }}>
                      <div style={{ width: 38, height: 38, borderRadius: 10, background: "rgba(222,26,26,0.08)", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                        <span style={{ fontSize: 14, fontWeight: 900, color: "#DE1A1A", lineHeight: 1 }}>{dObj ? dObj.getDate() : ""}</span>
                        <span style={{ fontSize: 8, fontWeight: 700, color: "#DE1A1A", textTransform: "uppercase" }}>{dObj ? dObj.toLocaleDateString("en-US", { month: "short" }) : ""}</span>
                      </div>
                      <div style={{ minWidth: 0 }}>
                        <p style={{ fontSize: 13, fontWeight: 800, color: "#111111", margin: 0, whiteSpace: "nowrap" }}>{dateLabel}</p>
                        <p style={{ fontSize: 10, color: "#9CA3AF", margin: 0 }}>{entries.length} {entries.length === 1 ? "entry" : "entries"}</p>
                      </div>
                    </div>

                    {/* Day stats — same figures as History's header, wrapped to its own row */}
                    {(() => {
                      const workH   = calcNetWorkHours(entries as Parameters<typeof calcNetWorkHours>[0])
                      const travelH = entries.filter(e => e.task_type === "shoot").reduce((s, e) => s + ((e._travel_hours as number | undefined) ?? 0), 0)
                      const learnH  = entries.filter(e => e.task_type === "learning").reduce((s, e) => s + ((e.duration_hours as number | undefined) ?? 0), 0)
                      const breakH  = entries.filter(e => e.task_type === "break").reduce((s, e) => s + ((e.duration_hours as number | undefined) ?? 0), 0)
                      const collabH = collabHoursMap[`${user.id}:${date}`] ?? 0
                      const displayH = workH + collabH
                      if (displayH <= 0 && travelH <= 0 && learnH <= 0 && breakH <= 0) return null
                      return (
                        <div style={{ display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap", padding: "10px 18px", borderBottom: "1px solid #F5F6FA" }}>
                          {displayH > 0 && (
                            <span style={{ fontSize: 11, fontWeight: 700, color: "#374151", display: "flex", alignItems: "center", gap: 4 }}>
                              <Clock size={11} style={{ color: "#9CA3AF" }} /> {fmtHours(displayH)}
                              {/* Only "+X" when it's on top of their own logged hours — see the matching
                                  fix in History's header for why workH=0 must never pair with "(+collabH)". */}
                              {collabH > 0 && workH > 0 && <span style={{ fontSize: 9, fontWeight: 600, color: "#6366F1" }}>(+{fmtHours(collabH)})</span>}
                            </span>
                          )}
                          {travelH > 0 && (
                            <span style={{ fontSize: 10, fontWeight: 700, color: "#D97706", display: "flex", alignItems: "center", gap: 3, background: "rgba(245,158,11,0.08)", border: "1px solid rgba(245,158,11,0.2)", borderRadius: 99, padding: "2px 7px" }}>
                              🚗 {fmtHours(travelH)}
                            </span>
                          )}
                          {learnH > 0 && (
                            <span style={{ fontSize: 10, fontWeight: 700, color: "#6366F1", display: "flex", alignItems: "center", gap: 3, background: "rgba(99,102,241,0.08)", border: "1px solid rgba(99,102,241,0.2)", borderRadius: 99, padding: "2px 7px" }}>
                              📚 {fmtHours(learnH)}
                            </span>
                          )}
                          {breakH > 0 && (
                            <span style={{ fontSize: 10, fontWeight: 700, color: "#78716C", display: "flex", alignItems: "center", gap: 3, background: "rgba(120,113,108,0.08)", border: "1px solid rgba(120,113,108,0.18)", borderRadius: 99, padding: "2px 7px" }}>
                              ☕ {fmtHours(breakH)}
                            </span>
                          )}
                        </div>
                      )
                    })()}

                    {/* Entries — plain divided rows, no per-entry card/border */}
                    <div>
                      {entries.map((e, i) => {
                        const cfg = TASK_CFG[String(e.task_type ?? "other")] ?? TASK_CFG.other
                        const { Icon } = cfg
                        const rawTitle = (e.title || e.task_name || e.description || "") as string
                        const isLearning = e.task_type === "learning"
                        const isShoot = e.task_type === "shoot"
                        const { client: parsedClient, topic: parsedTopic } = isLearning ? parseLearningTitle(rawTitle) : { client: "", topic: "" }
                        const title = isLearning ? (parsedTopic || rawTitle) : rawTitle
                        const client = (e.client_name || e._brand || e._custom_client || e.client || "") as string
                        const clientNames = isLearning
                          ? parsedClient
                          : (e.is_multi_client && Array.isArray(e.client_names) && e.client_names.length > 0
                              ? (e.client_names as string[]).join(", ")
                              : client)
                        const startTime = e.start_time as string | undefined
                        const endTime = e.end_time as string | undefined
                        const durationH = calcDurationFromTimes(startTime, endTime) ?? ((e.duration_hours || e.working_hours || 0) as number)
                        const videoLink = e.video_link as string | undefined
                        const participantIds = (e.participant_ids ?? []) as string[]
                        const isRework = !!e.is_rework
                        const travelH = (e._travel_hours as number | undefined) ?? 0
                        const location = (e._location as string | undefined) ?? ""
                        const notes = (e.notes ?? e.description ?? "") as string
                        const cleanNotes = isShoot ? stripShootNotes(notes) : notes.replace(/^\[(completed|in_progress|not_started)\]\s*/, "").trim()
                        const isLast = i === entries.length - 1

                        return (
                          <div key={i} style={{ borderBottom: isLast ? "none" : "1px solid #F5F6FA" }}>
                            <div style={{ display: "flex", gap: 14, padding: "14px 18px", alignItems: "flex-start" }}>
                              {/* Type icon square */}
                              <div style={{ width: 34, height: 34, borderRadius: 10, background: cfg.bg, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                                <Icon size={15} style={{ color: cfg.color }} />
                              </div>
                              {/* Content */}
                              <div style={{ flex: 1, minWidth: 0 }}>
                                <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 3, flexWrap: "wrap" }}>
                                  <span style={{ fontSize: 13, fontWeight: 800, color: "#111111" }}>{title || cfg.label}</span>
                                  <span style={{ fontSize: 10, fontWeight: 700, color: cfg.color, background: cfg.bg, padding: "2px 8px", borderRadius: 99 }}>{cfg.label}</span>
                                  {isRework && <span style={{ fontSize: 10, fontWeight: 700, color: "#92400E", background: "rgba(245,158,11,0.12)", padding: "2px 8px", borderRadius: 99, border: "1px solid rgba(245,158,11,0.3)" }}>Revision</span>}
                                </div>
                                {isRework && e.linked_to_title != null && (
                                  <p style={{ fontSize: 10, color: "#B45309", margin: "0 0 3px", fontWeight: 600 }}>↩ of: {String(e.linked_to_client ?? "")} – {String(e.linked_to_title)}</p>
                                )}
                                {clientNames && <p style={{ fontSize: 11, color: "#6B7280", margin: "0 0 3px", fontWeight: 600 }}>{clientNames}</p>}
                                {isShoot && (location || travelH > 0) && (
                                  <p style={{ fontSize: 10, fontWeight: 700, color: "#F59E0B", margin: "0 0 3px" }}>
                                    {location ? `📍 ${location}` : ""}{location && travelH > 0 ? " · " : ""}{travelH > 0 ? `🚗 ${fmtTravel(travelH)} travel` : ""}
                                  </p>
                                )}
                                {cleanNotes && <p style={{ fontSize: 11, color: "#9CA3AF", margin: "0 0 4px", lineHeight: 1.5 }}>{cleanNotes}</p>}
                                <div style={{ display: "flex", alignItems: "center", gap: 12, marginTop: 4, flexWrap: "wrap" }}>
                                  {durationH > 0 && (
                                    <span style={{ fontSize: 10, fontWeight: 700, color: "#374151", display: "flex", alignItems: "center", gap: 3 }}>
                                      <Clock size={9} style={{ color: "#9CA3AF" }} /> {fmtHours(durationH)}
                                    </span>
                                  )}
                                  {startTime && endTime && (
                                    <span style={{ fontSize: 10, color: "#9CA3AF" }}>{fmt12(startTime)} – {fmt12(endTime)}</span>
                                  )}
                                  {videoLink && (
                                    <a href={videoLink} target="_blank" rel="noopener noreferrer" style={{ fontSize: 10, fontWeight: 700, color: "#6366F1", textDecoration: "none" }}>
                                      🔗 Drive Link
                                    </a>
                                  )}
                                  {participantIds.length > 0 && (
                                    <span style={{ fontSize: 10, fontWeight: 700, color: "#6366F1" }}>
                                      👥 {participantIds.map(pid => members.find(m => m.id === pid)?.name ?? "Teammate").join(", ")}
                                    </span>
                                  )}
                                </div>
                              </div>
                            </div>
                          </div>
                        )
                      })}
                    </div>
                  </div>
                )
              })}
            </div>
          )}

          {/* Notes */}
          {notes && (
            <div style={{ marginTop: 16, padding: "12px 16px", borderRadius: 12, background: "rgba(99,102,241,0.05)", border: "1px solid rgba(99,102,241,0.15)" }}>
              <div style={{ fontSize: 10, fontWeight: 700, color: "#6366F1", textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: 5 }}>Notes</div>
              <div style={{ fontSize: 12, color: "#1E3A5F", lineHeight: 1.6 }}>{notes}</div>
            </div>
          )}

          {/* Submission time */}
          {firstUpdate.created_at && (
            <div style={{ marginTop: 14, fontSize: 11, color: "#1E3A5F", textAlign: "center" }}>
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
  teams = [],
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
  teams?: TeamRow[]
}) {
  const router = useRouter()
  const pathname = usePathname()
  const [customFrom, setCustomFrom] = useState(from)
  const [customTo, setCustomTo]     = useState(to)
  const [showCustom, setShowCustom] = useState(false)
  const [selectedUserId, setSelectedUserId] = useState<string | null>(null)
  // Header toggle — design review only for now (2026-07-31): switches which
  // button is highlighted. The actual "Work Analysis" view isn't built yet;
  // this just proves out the button placement before the real feature lands.
  const [viewMode, setViewMode] = useState<"activities" | "work-analysis">("activities")
  // Separate picker state for Work Analysis — must not reuse selectedUserId,
  // which belongs to the existing per-day drill-down drawer above.
  const [waEmployeeId, setWaEmployeeId] = useState<string | null>(null)

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

  // ── People list (grouped) ────────────────────────────────────────────────
  const filteredPeople = useMemo(() => {
    const people: Array<{ userId: string; user: NonNullable<Update["users"]>; userUpdates: Update[]; totalHours: number; entryCount: number; time: string }> = []

    for (const [userId, userUpdates] of groupedByUser) {
      const user = Array.isArray(userUpdates[0]?.users) ? userUpdates[0].users[0] : userUpdates[0]?.users
      if (!user) continue
      const totalHours = userUpdates.reduce((s, u) => s + getUpdateHours(u), 0)
      const allEntries = userUpdates.flatMap(u => Array.isArray(u.work_entries) ? u.work_entries : []) as WorkEntry[]
      const entryCount = allEntries.filter(e => e.task_type !== "break").length
      const time = fmtTime(userUpdates[0]?.created_at ?? userUpdates[0]?.date)
      people.push({ userId, user, userUpdates, totalHours, entryCount, time })
    }

    return people.sort((a, b) => (b.userUpdates[0]?.created_at ?? "") .localeCompare(a.userUpdates[0]?.created_at ?? ""))
  }, [groupedByUser])

  const curPreset = activePreset()

  // Selected person's updates
  const selectedUserUpdates = selectedUserId ? groupedByUser.get(selectedUserId) ?? null : null

  // ── Work Analysis: selected employee's entries, grouped by work type ──────
  const activeWaId = waEmployeeId ?? filteredPeople[0]?.userId ?? null

  const waEntries = useMemo(() => {
    if (!activeWaId) return []
    const userUpdates = groupedByUser.get(activeWaId) ?? []
    const rows: Array<{ date: string; task_type: string; title: string; client: string; durationH: number; isRework: boolean; videoDuration: string; travelH: number }> = []
    for (const u of userUpdates) {
      const entries = (Array.isArray(u.work_entries) ? u.work_entries : []) as WorkEntry[]
      for (const e of entries) {
        const tt = String(e.task_type ?? "")
        if (!tt || tt === "break" || tt === "not_started") continue
        const isLearning = tt === "learning"
        const rawTitle = (e.title || e.task_name || e.description || "") as string
        const { client: parsedClient, topic: parsedTopic } = isLearning ? parseLearningTitle(rawTitle) : { client: "", topic: "" }
        const title = isLearning ? (parsedTopic || rawTitle) : rawTitle
        const clientVal = (e.client_name || e._brand || e._custom_client || e.client || "") as string
        const clientNames = isLearning
          ? parsedClient
          : (e.is_multi_client && Array.isArray(e.client_names) && e.client_names.length > 0
              ? (e.client_names as string[]).join(", ")
              : clientVal)
        const durationH = calcDurationFromTimes(e.start_time as string | undefined, e.end_time as string | undefined)
          ?? ((e.duration_hours || e.working_hours || 0) as number)
        const videoDuration = (e.video_duration as string | undefined) ?? ""
        const travelH = (e._travel_hours as number | undefined) ?? 0
        rows.push({ date: u.date, task_type: tt, title: title || (TASK_CFG[tt]?.label ?? tt), client: clientNames, durationH, isRework: !!e.is_rework, videoDuration, travelH })
      }
    }
    // 1st date to latest, per explicit spec.
    return rows.sort((a, b) => a.date.localeCompare(b.date))
  }, [groupedByUser, activeWaId])

  // Break isn't a "work" type so it's excluded from waEntries/waByType above,
  // but it's a valid KPI-tile filler (see waKpiTypes) — tracked separately.
  const waBreakStats = useMemo(() => {
    if (!activeWaId) return { count: 0, hours: 0 }
    const userUpdates = groupedByUser.get(activeWaId) ?? []
    let count = 0, hours = 0
    for (const u of userUpdates) {
      const entries = (Array.isArray(u.work_entries) ? u.work_entries : []) as WorkEntry[]
      for (const e of entries) {
        if (String(e.task_type ?? "") !== "break") continue
        count++
        hours += (e.duration_hours || e.working_hours || 0) as number
      }
    }
    return { count, hours }
  }, [groupedByUser, activeWaId])

  const waByType = useMemo(() => {
    const map = new Map<string, typeof waEntries>()
    for (const r of waEntries) {
      if (!map.has(r.task_type)) map.set(r.task_type, [])
      map.get(r.task_type)!.push(r)
    }
    return [...map.entries()].sort((a, b) => b[1].length - a[1].length)
  }, [waEntries])

  // Always target 5 KPI slots so the row looks the same shape for everyone:
  // real work types the person has, in fixed priority order, first — then
  // Learning, then Other, then Break fill any remaining slots even at 0h/0
  // entries (so the row never looks "incomplete" for someone with few types).
  const waIsMedia = isMediaTeam(members.find(m => m.id === activeWaId)?.team)

  const waKpiTypes = useMemo(() => {
    const present = new Set(waByType.map(([tt]) => tt))
    const slots: string[] = []
    if (waIsMedia) {
      // Media: real work types the person has, in priority order, first.
      for (const tt of PROPER_WORK_TYPES) {
        if (present.has(tt)) slots.push(tt)
        if (slots.length === 5) break
      }
    } else {
      // Non-media: Technical/Work is always the guaranteed first slot (even at
      // 0h), then whichever other real skill types they have — including
      // edit/shoot, since a non-media person can still have those entries
      // (e.g. Raghul does real editing work despite not being on Media Team).
      slots.push("other")
      for (const tt of ["edit", "shoot", "voiceover", "poster", "scripting", "development"]) {
        if (present.has(tt)) slots.push(tt)
        if (slots.length === 5) break
      }
    }
    for (const filler of ["learning", "other_activity", "break"]) {
      if (slots.length === 5) break
      if (!slots.includes(filler)) slots.push(filler)
    }
    return slots.slice(0, 5)
  }, [waByType, waIsMedia])

  const waYm = (to || from || todayIST()).slice(0, 7)
  const waIsCurrentMonth = waYm >= todayIST().slice(0, 7)

  return (
    <div style={{ padding: "24px 24px 64px", maxWidth: 1400, margin: "0 auto", fontFamily: "var(--font-jakarta, Inter, sans-serif)" }}>

      {/* ── Hero Banner ── */}
      <div style={{ marginBottom: 24 }}>
        <PageHero
          title="Activities"
          subtitle="Track real-time updates and progress from your amazing team."
          maxContentWidth={420}
          illustration={
            /* Mobile: right-anchored and flush with the bottom (no negative offset, so overflow:hidden
               can't crop mid-figure). md+: centered, nudged down a touch (top-[58%] instead of top-1/2)
               and capped shorter than before so it sits with breathing room instead of clipping flush
               against the banner's top/bottom edges now that the search row below it is gone and the
               banner itself is shorter. */
            /* Nudged slightly left (was left-[54%]) to make room for the new
               view-toggle buttons in rightSlot below, without touching the
               image itself or anything else in this hero (2026-07-31). */
            <div className="absolute right-2 bottom-2 top-auto md:left-[48%] md:right-auto md:top-[58%] md:bottom-auto md:-translate-x-1/2 md:-translate-y-1/2" style={{ zIndex: 1, pointerEvents: "none" }}>
              <img
                src="/brand/activities-hero.png"
                alt=""
                className="h-[clamp(64px,20vw,110px)] md:h-[clamp(84px,18vw,140px)]"
                style={{ width: "auto", objectFit: "contain", userSelect: "none" }}
              />
            </div>
          }
          rightSlot={
            <div className="flex flex-wrap" style={{ gap: 8, alignItems: "flex-start", justifyContent: "flex-end" }}>
              {/* View toggle — sits beside the date picker, same row, not stacked
                  above it (2026-07-31, design review only — see viewMode note above). */}
              <div style={{ display: "flex", background: "rgba(0,0,0,0.18)", border: "1px solid rgba(255,255,255,0.22)", borderRadius: 10, padding: 3, gap: 2 }}>
                <button
                  onClick={() => setViewMode("activities")}
                  style={{
                    border: "none", cursor: "pointer", borderRadius: 8, padding: "7px 13px", fontSize: 11.5, fontWeight: 800, whiteSpace: "nowrap", textTransform: "uppercase",
                    background: viewMode === "activities" ? "#fff" : "transparent",
                    color: viewMode === "activities" ? "#7F1D1D" : "rgba(255,255,255,0.7)",
                  }}>
                  Activities
                </button>
                <button
                  onClick={() => {
                    setViewMode("work-analysis")
                    // A bare page load (no date in the URL) defaults from/to to
                    // "today" only — a single day, not a month. Work Analysis
                    // always needs a full month, so expand to it here instead of
                    // silently showing an empty "today only" scope that looks
                    // stuck/broken (2026-07-31 fix).
                    if (from === to) {
                      const [f, t] = ymRange(from.slice(0, 7))
                      navigate(f, t)
                    }
                  }}
                  style={{
                    border: "none", cursor: "pointer", borderRadius: 8, padding: "7px 13px", fontSize: 11.5, fontWeight: 800, whiteSpace: "nowrap", textTransform: "uppercase",
                    background: viewMode === "work-analysis" ? "#fff" : "transparent",
                    color: viewMode === "work-analysis" ? "#7F1D1D" : "rgba(255,255,255,0.7)",
                  }}>
                  Work Analysis
                </button>
              </div>
            </div>
          }
        />
      </div>

      {/* ── 5 KPI Cards ── */}
      {viewMode === "activities" ? (
        /* bright/dark gradient fill per metric, matches the Insights page's stat-tile treatment */
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5" style={{ gap: 14, marginBottom: 20 }}>
          {[
            { label: "Total Updates", value: stats.totalUpdates, sub: "Today", icon: <TrendingUp size={18} color="#fff" />, gradient: "linear-gradient(135deg, #E31E24, #7F1D1D)", shadow: "rgba(227,30,36,0.35)" },
            { label: "Present",       value: stats.present,      sub: "Members", icon: <Users size={18} color="#fff" />, gradient: "linear-gradient(135deg, #22C55E, #15803D)", shadow: "rgba(22,163,74,0.35)" },
            { label: "On Leave",      value: stats.onLeave,      sub: "Member",  icon: <AlertCircle size={18} color="#fff" />, gradient: "linear-gradient(135deg, #F59E0B, #B45309)", shadow: "rgba(245,158,11,0.35)" },
            { label: "Total Hours",   value: fmtHours(stats.totalHours), sub: "Logged", icon: <Clock size={18} color="#fff" />, gradient: "linear-gradient(135deg, #6366F1, #3730A3)", shadow: "rgba(99,102,241,0.35)" },
            { label: "Not Updated",   value: stats.notUpdated,   sub: "Members", icon: <Bell size={18} color="#fff" />, gradient: "linear-gradient(135deg, #F43F5E, #9F1239)", shadow: "rgba(244,63,94,0.35)" },
          ].map(card => (
            <div key={card.label} style={{
              background: card.gradient, borderRadius: 16, padding: "18px 20px",
              boxShadow: `0 4px 20px ${card.shadow}`,
              display: "flex", alignItems: "center", justifyContent: "space-between",
              position: "relative", overflow: "hidden",
            }}>
              <div style={{ position: "absolute", top: -18, right: -18, width: 72, height: 72, borderRadius: "50%", background: "rgba(255,255,255,0.15)", pointerEvents: "none" }} />
              <div style={{ position: "relative" }}>
                <div style={{ fontSize: 11, color: "rgba(255,255,255,0.8)", fontWeight: 600, marginBottom: 4 }}>{card.label}</div>
                <div style={{ fontSize: 26, fontWeight: 800, color: "#fff", lineHeight: 1 }}>{card.value}</div>
                <div style={{ fontSize: 11, color: "rgba(255,255,255,0.8)", marginTop: 3 }}>{card.sub}</div>
              </div>
              <div style={{ width: 40, height: 40, borderRadius: 12, background: "rgba(255,255,255,0.18)", display: "flex", alignItems: "center", justifyContent: "center", position: "relative", flexShrink: 0 }}>
                {card.icon}
              </div>
            </div>
          ))}
        </div>
      ) : (
        /* Work-type hour tiles for the selected employee — the exact StatChip
           card already used on the Clients page, so it's a 100% match, not an
           approximation. Always 5 slots: real work types first, then
           Learning/Other/Break fill any remaining gaps. */
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5" style={{ gap: 10, marginBottom: 20 }}>
          {waKpiTypes.length === 0 ? (
            <div style={{ gridColumn: "1 / -1", padding: "18px 20px", borderRadius: 16, background: "#F9FAFB", border: "1px dashed #E5E7EB", textAlign: "center", color: "#1E3A5F", fontSize: 13 }}>
              Select a member to see their work-type breakdown
            </div>
          ) : waKpiTypes.map(tt => {
            const cfg = TASK_CFG[tt] ?? TASK_CFG.other
            const rows = tt === "break" ? [] : (waByType.find(([t]) => t === tt)?.[1] ?? [])
            const count = tt === "break" ? waBreakStats.count : countUniqueWork(rows)
            const hours = tt === "break" ? waBreakStats.hours : rows.reduce((s, r) => s + r.durationH, 0)
            return (
              <StatChip key={tt} label={cfg.label} emoji={TASK_EMOJI[tt] ?? "💼"} hours={`${hours.toFixed(1)}h`} count={count > 0 ? count : undefined} color={cfg.color} />
            )
          })}
        </div>
      )}

      {/* ── Filter row ── */}
      {viewMode === "activities" ? (
        <div style={{ display: "flex", gap: 8, marginBottom: 20, overflowX: "auto", flexWrap: "nowrap", alignItems: "center", paddingBottom: 4 }}>
          {DATE_PRESETS.map(p => (
            <button
              key={p.label}
              onClick={() => { setShowCustom(false); navigate(p.from, p.to) }}
              style={{
                padding: "8px 18px", borderRadius: 10, fontSize: 13, fontWeight: 600, cursor: "pointer", border: "none",
                background: curPreset === p.label ? "#E31E24" : "#F3F4F6",
                color: curPreset === p.label ? "#fff" : "#1E3A5F",
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
              color: curPreset === "Custom" ? "#fff" : "#1E3A5F",
              flexShrink: 0, whiteSpace: "nowrap",
            }}
          >
            Custom
          </button>
          {showCustom && (
            <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
              <input type="date" min="2025-01-01" max={todayIST()} value={customFrom} onChange={e => setCustomFrom(e.target.value)}
                style={{ padding: "6px 10px", borderRadius: 8, border: "1px solid #E5E7EB", fontSize: 12, color: "#1E3A5F" }} />
              <span style={{ fontSize: 12, color: "#1E3A5F" }}>to</span>
              <input type="date" min={customFrom || "2025-01-01"} max={todayIST()} value={customTo} onChange={e => setCustomTo(e.target.value)}
                style={{ padding: "6px 10px", borderRadius: 8, border: "1px solid #E5E7EB", fontSize: 12, color: "#1E3A5F" }} />
              <button onClick={() => { navigate(customFrom, customTo); setShowCustom(false) }}
                style={{ padding: "6px 14px", borderRadius: 8, background: "#E31E24", color: "#fff", border: "none", cursor: "pointer", fontSize: 12, fontWeight: 600 }}>
                Apply
              </button>
            </div>
          )}
        </div>
      ) : (
        /* Work Analysis only needs a month-level filter — day-by-day/custom-range
           presets don't apply here. Same pill styling as Team Insights' month nav.
           Employee picker sits beside it as a dropdown (not a row of chips —
           doesn't scale once the team is 100+ people). */
        <div style={{ display: "flex", flexWrap: "wrap", gap: 10, marginBottom: 20 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 10, background: "linear-gradient(135deg, #DE1A1A, #7F1D1D)", borderRadius: 14, padding: "8px 10px", boxShadow: "0 4px 16px rgba(227,30,36,0.25)" }}>
            <button
              onClick={() => { const [f, t] = ymRange(shiftYm(waYm, -1)); navigate(f, t) }}
              aria-label="Previous month"
              style={{ width: 28, height: 28, borderRadius: 8, border: "none", background: "rgba(255,255,255,0.15)", cursor: "pointer", fontSize: 15, color: "#fff", display: "flex", alignItems: "center", justifyContent: "center" }}
            >‹</button>
            <span style={{ fontSize: 13, fontWeight: 800, color: "#fff", minWidth: 118, textAlign: "center" }}>{monthLabel(waYm)}</span>
            <button
              onClick={() => { const [f, t] = ymRange(shiftYm(waYm, 1)); navigate(f, t) }}
              disabled={waIsCurrentMonth}
              aria-label="Next month"
              style={{ width: 28, height: 28, borderRadius: 8, border: "none", background: "rgba(255,255,255,0.15)", cursor: waIsCurrentMonth ? "not-allowed" : "pointer", fontSize: 15, color: "#fff", display: "flex", alignItems: "center", justifyContent: "center", opacity: waIsCurrentMonth ? 0.4 : 1 }}
            >›</button>
          </div>
          <select
            value={activeWaId ?? ""}
            onChange={e => setWaEmployeeId(e.target.value)}
            style={{
              padding: "0 16px", height: 44, borderRadius: 14, border: "1px solid #E5E7EB", background: "#fff",
              fontSize: 13, fontWeight: 700, color: "#111827", cursor: "pointer", minWidth: 180,
              boxShadow: "0 1px 3px rgba(0,0,0,0.04)", textTransform: "uppercase",
            }}
          >
            {filteredPeople.length === 0 && <option value="">No members in this range</option>}
            {filteredPeople.map(({ userId, user }) => (
              <option key={userId} value={userId}>{user.name}</option>
            ))}
          </select>
        </div>
      )}

      {/* ── Main content ── */}
      {viewMode === "activities" ? (
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
              <div style={{ fontSize: 11, color: "#1E3A5F" }}>{filteredPeople.length} member{filteredPeople.length !== 1 ? "s" : ""} updated · click to view details</div>
            </div>
          </div>

          {/* People list */}
          <div style={{ padding: "8px 0 16px" }}>
            {filteredPeople.length === 0 && (
              <div style={{ textAlign: "center", padding: "48px 24px", color: "#1E3A5F", fontSize: 13 }}>
                No activities found
              </div>
            )}
            {filteredPeople.map(({ userId, user, userUpdates, totalHours, entryCount, time }, idx) => {
              const badge    = getTeamBadge(user.team, teams)
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
                            <span style={{ fontSize: 10, color: "#1E3A5F", fontWeight: 600 }}>{entryCount} {entryCount === 1 ? "entry" : "entries"}</span>
                          )}
                        </div>
                      </div>
                    </div>

                    {/* Right: hours + time + arrow */}
                    <div style={{ display: "flex", alignItems: "center", gap: 10, flexShrink: 0 }}>
                      {totalHours > 0 && (
                        <span style={{ fontSize: 12, fontWeight: 700, color: "#1E3A5F", display: "flex", alignItems: "center", gap: 3 }}>
                          <Clock size={11} color="#1E3A5F" /> {fmtHours(totalHours)}
                        </span>
                      )}
                      <span style={{ fontSize: 11, color: "#1E3A5F", whiteSpace: "nowrap" }}>{time}</span>
                      <ChevronRight size={15} color={isSelected ? "#E31E24" : "#1E3A5F"} style={{ transition: "color 0.15s" }} />
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
                <div style={{ fontSize: 10, color: "#1E3A5F", lineHeight: 1.2 }}>Update<br/>Completion</div>
              </div>
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: 8, marginTop: 8 }}>
              {donutData.map(d => (
                <div key={d.name} style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                    <div style={{ width: 10, height: 10, borderRadius: "50%", background: d.color }} />
                    <span style={{ fontSize: 12, color: "#1E3A5F" }}>{d.name}</span>
                  </div>
                  <span style={{ fontSize: 12, fontWeight: 600, color: "#1E3A5F" }}>{d.pct}% ({d.value})</span>
                </div>
              ))}
            </div>
          </div>

          {/* Members Awaiting Update */}
          <div style={{ background: "#fff", borderRadius: 20, padding: "20px", boxShadow: "0 1px 3px rgba(0,0,0,0.06), 0 4px 20px rgba(0,0,0,0.04)", position: "relative", overflow: "hidden" }}>
            <div style={{ fontSize: 14, fontWeight: 700, color: "#111827", marginBottom: 4 }}>Members Awaiting Update</div>
            <div style={{ fontSize: 11, color: "#1E3A5F", marginBottom: 16 }}>{stats.notUpdated} member{stats.notUpdated !== 1 ? "s" : ""} haven&apos;t updated yet</div>
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
                    width: 32, height: 32, borderRadius: "50%", background: "#F3F4F6", color: "#1E3A5F",
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
                    <div style={{ fontSize: 11, color: "#1E3A5F", marginTop: 2 }}>{topContributor.count} Update{topContributor.count !== 1 ? "s" : ""}</div>
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
      ) : (
        /* ── Work Analysis view — same header/KPI/filter row above, only this
            section swaps in place of the Recent Activities + sidebar grid. ── */
        <div style={{ background: "#fff", borderRadius: 20, boxShadow: "0 1px 3px rgba(0,0,0,0.06), 0 4px 20px rgba(0,0,0,0.04)", overflow: "hidden" }}>
          {/* Grouped-by-type detail — each work type gets its own premium card with
              a fixed-height, internally-scrollable entry list (not one endlessly
              growing page — same idea as a bounded scroll panel). */}
          {activeWaId && (
            <div style={{ padding: "20px 24px 28px" }}>
              {waByType.length === 0 ? (
                <div style={{ textAlign: "center", padding: "40px 0", color: "#1E3A5F", fontSize: 13 }}>No work entries for this person in this range</div>
              ) : (
                <div style={{ display: "flex", flexDirection: "column", gap: 18 }}>
                  {waByType.map(([tt, rows]) => {
                    const cfg = TASK_CFG[tt] ?? TASK_CFG.other
                    const { Icon } = cfg
                    return (
                      <div key={tt} style={{
                        background: "#fff", borderRadius: 20, overflow: "hidden",
                        border: "1px solid #F1F2F6",
                        boxShadow: "0 1px 3px rgba(0,0,0,0.04), 0 10px 28px rgba(0,0,0,0.05)",
                      }}>
                        {/* Section header — accent rail + gradient icon tile + embossed count badge (no subtext) */}
                        <div style={{
                          display: "flex", alignItems: "center", gap: 14, padding: "14px 18px",
                          borderLeft: `4px solid ${cfg.color}`,
                          background: `linear-gradient(90deg, ${cfg.bg} 0%, rgba(255,255,255,0) 75%)`,
                        }}>
                          <div style={{
                            width: 38, height: 38, borderRadius: 12, flexShrink: 0,
                            background: `linear-gradient(145deg, ${cfg.color}, ${cfg.color}CC)`,
                            display: "flex", alignItems: "center", justifyContent: "center",
                            boxShadow: `0 4px 12px ${cfg.color}55`,
                          }}>
                            <Icon size={17} color="#fff" />
                          </div>
                          <div style={{ flex: 1, minWidth: 0, fontSize: 15, fontWeight: 800, color: "#111827", letterSpacing: "-0.01em" }}>{cfg.label}</div>
                          <div style={{
                            minWidth: 34, height: 30, padding: "0 10px", borderRadius: 10, flexShrink: 0,
                            background: `linear-gradient(145deg, ${cfg.color}, ${cfg.color}CC)`,
                            color: "#fff", fontSize: 13, fontWeight: 800,
                            display: "flex", alignItems: "center", justifyContent: "center",
                            boxShadow: `0 3px 0 ${cfg.color}66, 0 2px 6px rgba(0,0,0,0.12), inset 0 1px 0 rgba(255,255,255,0.35)`,
                          }}>
                            {countUniqueWork(rows)}
                          </div>
                        </div>

                        {/* Scrollable entry list — everything on one line: date badge, title,
                            client, an extra type-specific field, then time taken. A revision
                            entry is signalled purely by tinting that row amber — no Clean/
                            Revision text pill. */}
                        <div style={{ maxHeight: 340, overflowY: "auto", padding: "10px 12px 12px" }}>
                          <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                            {rows.map((r, i) => {
                              const dObj = (() => { try { return new Date(r.date + "T12:00:00") } catch { return null } })()
                              const dayNum = dObj ? dObj.getDate() : ""
                              const monthAbbr = dObj ? dObj.toLocaleDateString("en-US", { month: "short" }) : ""
                              const extra = tt === "edit" ? r.videoDuration : (tt === "shoot" && r.travelH > 0 ? fmtTravel(r.travelH) : "")
                              const hasExtra = tt === "edit" || tt === "shoot"
                              return (
                                <div key={i} style={{
                                  display: "grid",
                                  gridTemplateColumns: hasExtra ? "44px minmax(0,1fr) 150px 84px 64px" : "44px minmax(0,1fr) 150px 64px",
                                  alignItems: "center", gap: 10, padding: "8px 12px",
                                  borderRadius: 10,
                                  background: r.isRework ? "rgba(245,158,11,0.08)" : "#FAFAFB",
                                  border: r.isRework ? "1px solid rgba(245,158,11,0.3)" : "1px solid #F3F4F6",
                                }}>
                                  {/* Date — mini calendar tile: colored month tab + white day body, embossed */}
                                  <div style={{
                                    width: 40, height: 40, borderRadius: 10, overflow: "hidden",
                                    background: "#fff", boxShadow: "0 2px 6px rgba(0,0,0,0.10), 0 1px 2px rgba(0,0,0,0.06)",
                                    display: "flex", flexDirection: "column",
                                  }}>
                                    <div style={{ height: 13, flexShrink: 0, background: `linear-gradient(180deg, ${cfg.color}, ${cfg.color}CC)`, display: "flex", alignItems: "center", justifyContent: "center" }}>
                                      <span style={{ fontSize: 7, fontWeight: 800, color: "#fff", textTransform: "uppercase", letterSpacing: "0.03em" }}>{monthAbbr}</span>
                                    </div>
                                    <div style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center" }}>
                                      <span style={{ fontSize: 14, fontWeight: 900, color: "#111827", lineHeight: 1 }}>{dayNum}</span>
                                    </div>
                                  </div>
                                  <span style={{ fontSize: 12.5, fontWeight: 800, color: "#111111", textTransform: "uppercase", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", minWidth: 0 }}>{r.title || cfg.label}</span>
                                  <span style={{ fontSize: 11, color: "#6B7280", fontWeight: 600, textTransform: "uppercase", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", minWidth: 0 }}>{r.client}</span>
                                  {hasExtra && (
                                    extra ? (
                                      <span style={{ fontSize: 10, fontWeight: 700, color: "#D97706", background: "rgba(245,158,11,0.1)", padding: "3px 8px", borderRadius: 99, textAlign: "center", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                                        {tt === "edit" ? `🎞️ ${extra}` : `🚗 ${extra}`}
                                      </span>
                                    ) : <span />
                                  )}
                                  <span style={{ fontSize: 11.5, fontWeight: 800, color: "#374151", textAlign: "right", whiteSpace: "nowrap" }}>{r.durationH > 0 ? fmtHours(r.durationH) : "—"}</span>
                                </div>
                              )
                            })}
                          </div>
                        </div>
                      </div>
                    )
                  })}
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {/* ── Person Detail Drawer ── */}
      {viewMode === "activities" && selectedUserUpdates && (
        <PersonDetailDrawer
          updates={selectedUserUpdates}
          onClose={() => setSelectedUserId(null)}
          collabHoursMap={collabHoursMap}
          members={members}
          teams={teams}
        />
      )}
    </div>
  )
}
