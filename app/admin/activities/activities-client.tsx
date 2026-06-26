"use client"

import { useState, useMemo } from "react"
import { useRouter, usePathname } from "next/navigation"
import { Search, Filter, Clock, Users, AlertCircle, TrendingUp, Bell, Star, X, ChevronRight, BarChart3 } from "lucide-react"
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

function fmtRupee(n: number) { return `₹${Math.round(n).toLocaleString("en-IN")}` }

// ── Score ring ────────────────────────────────────────────────────────────────
function ScoreRing({ score, size = 40 }: { score: number; size?: number }) {
  const r = size * 0.38, cx = size / 2, cy = size / 2
  const circ = 2 * Math.PI * r
  const filled = (Math.min(score, 100) / 100) * circ
  const [c1, c2] = score >= 70 ? ["#10B981","#34D399"] : score >= 40 ? ["#F59E0B","#FCD34D"] : ["#EF4444","#F87171"]
  const gid = `sg${score}`
  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
      <defs>
        <linearGradient id={gid} x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stopColor={c1} /><stop offset="100%" stopColor={c2} />
        </linearGradient>
      </defs>
      <circle cx={cx} cy={cy} r={r} fill="none" stroke="#F0F0F0" strokeWidth={size * 0.11} />
      <circle cx={cx} cy={cy} r={r} fill="none" stroke={`url(#${gid})`} strokeWidth={size * 0.11}
        strokeDasharray={`${filled} ${circ - filled}`} strokeLinecap="round"
        transform={`rotate(-90 ${cx} ${cy})`} />
      <text x={cx} y={cy + 1} textAnchor="middle" dominantBaseline="middle"
        fontSize={size * 0.22} fontWeight="900" fill="#111">{score}</text>
    </svg>
  )
}

// ── Person Detail Drawer ──────────────────────────────────────────────────────
function PersonDetailDrawer({ updates, onClose }: { updates: Update[]; onClose: () => void }) {
  const firstUpdate = updates[0]
  const user = Array.isArray(firstUpdate?.users) ? firstUpdate.users[0] : firstUpdate?.users
  if (!user) return null

  const [bg, fg] = avatarColor(user.name)
  const badge = getTeamBadge(user.team)

  const totalHours = updates.reduce((s, u) => s + (u.working_hours ?? 0), 0)
  const allEntries = updates.flatMap(u => (Array.isArray(u.work_entries) ? u.work_entries : []) as WorkEntry[])
  const workEntries = allEntries.filter(e => e.task_type !== "break")
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
        position: "fixed", top: 0, right: 0, height: "100vh", width: 480, zIndex: 50,
        background: "#fff", boxShadow: "-8px 0 48px rgba(0,0,0,0.14)",
        display: "flex", flexDirection: "column", overflow: "hidden",
      }}>
        {/* Header */}
        <div style={{ padding: "20px 24px", borderBottom: "1px solid #F3F4F6", flexShrink: 0 }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 14 }}>
            <span style={{ fontSize: 11, fontWeight: 700, color: "#9CA3AF", textTransform: "uppercase", letterSpacing: "0.1em" }}>Update Details</span>
            <button onClick={onClose} style={{ width: 30, height: 30, borderRadius: 8, border: "1px solid #E5E7EB", background: "#F9FAFB", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center" }}>
              <X size={13} color="#6B7280" />
            </button>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
            <div style={{ width: 52, height: 52, borderRadius: "50%", background: bg, color: fg, fontSize: 16, fontWeight: 800, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
              {getInitials(user.name)}
            </div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: 17, fontWeight: 800, color: "#111827" }}>{user.name}</div>
              <div style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 4 }}>
                <span style={{ padding: "2px 10px", borderRadius: 6, background: badge.bg, color: badge.color, fontSize: 11, fontWeight: 700 }}>{badge.label}</span>
                {totalHours > 0 && (
                  <span style={{ fontSize: 11, color: "#6B7280", fontWeight: 600, display: "flex", alignItems: "center", gap: 3 }}>
                    <Clock size={11} /> {fmtHours(totalHours)}
                  </span>
                )}
              </div>
            </div>
            <div style={{ textAlign: "right", flexShrink: 0 }}>
              <div style={{ fontSize: 22, fontWeight: 900, color: "#111827" }}>{workEntries.length}</div>
              <div style={{ fontSize: 10, color: "#9CA3AF", fontWeight: 600, textTransform: "uppercase" }}>entries</div>
            </div>
          </div>
        </div>

        {/* Scrollable body */}
        <div style={{ flex: 1, overflowY: "auto", padding: "16px 24px 32px" }}>

          {/* Work entries */}
          {workEntries.length === 0 ? (
            <div style={{ textAlign: "center", padding: "48px 0", color: "#9CA3AF", fontSize: 13 }}>No work entries recorded</div>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
              {workEntries.map((e, i) => {
                const typeInfo = getEntryTypeLabel(e.task_type)
                const title = (e.title || e.task_name || e.description || "") as string
                const client = (e.client_name || e._brand || e._custom_client || e.client || "") as string
                const clientNames = Array.isArray(e.client_names) ? (e.client_names as string[]).join(", ") : client
                const durationH = (e.duration_hours || e.working_hours || 0) as number
                const startTime = e.start_time as string | undefined
                const endTime = e.end_time as string | undefined
                const videoType = e.video_type as string | undefined
                const entryNotes = e.notes as string | undefined

                return (
                  <div key={i} style={{
                    background: "#FAFAFA", borderRadius: 14, padding: "14px 16px",
                    border: "1.5px solid #F0F0F5",
                  }}>
                    {/* Entry header */}
                    <div style={{ display: "flex", alignItems: "flex-start", gap: 10, marginBottom: 8 }}>
                      <span style={{ fontSize: 18, flexShrink: 0, marginTop: 1 }}>{typeInfo.emoji}</span>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ fontSize: 13, fontWeight: 800, color: "#111827", lineHeight: 1.3 }}>
                          {title || typeInfo.label}
                        </div>
                        {clientNames && (
                          <div style={{ fontSize: 11, fontWeight: 700, color: typeInfo.color, marginTop: 3,
                            background: typeInfo.bg, display: "inline-block", padding: "1px 8px", borderRadius: 6 }}>
                            {clientNames}
                          </div>
                        )}
                      </div>
                      <span style={{ padding: "3px 8px", borderRadius: 6, background: typeInfo.bg, color: typeInfo.color, fontSize: 10, fontWeight: 700, whiteSpace: "nowrap", flexShrink: 0 }}>
                        {typeInfo.label}
                      </span>
                    </div>

                    {/* Meta row */}
                    <div style={{ display: "flex", flexWrap: "wrap", gap: "4px 14px", paddingLeft: 28 }}>
                      {durationH > 0 && (
                        <span style={{ fontSize: 11, color: "#6B7280", display: "flex", alignItems: "center", gap: 3 }}>
                          <Clock size={10} /> {fmtHours(durationH)}
                        </span>
                      )}
                      {startTime && endTime && (
                        <span style={{ fontSize: 11, color: "#6B7280" }}>{startTime} – {endTime}</span>
                      )}
                      {videoType && videoType !== "__other__" && (
                        <span style={{ fontSize: 11, color: "#6B7280" }}>{videoType}</span>
                      )}
                      {entryNotes && (
                        <div style={{ width: "100%", fontSize: 11, color: "#9CA3AF", fontStyle: "italic", marginTop: 4, lineHeight: 1.5 }}>
                          {entryNotes}
                        </div>
                      )}
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

// ── Team Insights View ────────────────────────────────────────────────────────
function TeamInsightsView({
  members,
  groupedByUser,
}: {
  members: Member[]
  groupedByUser: Map<string, Update[]>
}) {
  const rows = useMemo(() => {
    const getTotalHours = (userId: string) => {
      const userUpdates = groupedByUser.get(userId) ?? []
      const allEntries = userUpdates.flatMap(u => Array.isArray(u.work_entries) ? u.work_entries : []) as WorkEntry[]
      return allEntries.filter(e => e.task_type !== "break").reduce((s, e) => s + ((e.duration_minutes as number ?? 0) / 60), 0)
    }

    const maxHours = Math.max(...members.map(m => getTotalHours(m.id)), 1)

    return members.map(m => {
      const userUpdates = groupedByUser.get(m.id) ?? []
      const allEntries = userUpdates.flatMap(u => Array.isArray(u.work_entries) ? u.work_entries : []) as WorkEntry[]
      const nonBreakEntries = allEntries.filter(e => e.task_type !== "break")
      const breakEntries = allEntries.filter(e => e.task_type === "break")
      const workedHours = getTotalHours(m.id)
      const breakHours = breakEntries.reduce((s, e) => s + ((e.duration_minutes as number ?? 0) / 60), 0)
      const entryCount = nonBreakEntries.length
      const workTypes = [...new Set(nonBreakEntries.filter(e => e.task_type).map(e => getEntryTypeLabel(e.task_type).emoji))]

      const effectiveRate = (m.hourly_rate && m.hourly_rate > 0)
        ? m.hourly_rate
        : (m.monthly_salary ? Math.round(m.monthly_salary / 176) : 0)
      const workValue = workedHours * effectiveRate
      const breakCost = breakHours * effectiveRate
      const salary = m.monthly_salary ?? 0
      const ratio = salary > 0 ? Math.round((workValue / salary) * 100) : null

      // Score: 50pts value/salary, 20pts hours vs team max, 30pts entries
      const valuePts = salary > 0 ? Math.min(50, (workValue / salary) * 50) : 0
      const hoursPts = Math.min(20, (workedHours / maxHours) * 20)
      const entryPts = Math.min(30, entryCount * 3)
      const score = Math.round(valuePts + hoursPts + entryPts)

      return { member: m, workedHours, breakHours, breakCost, workValue, salary, effectiveRate, ratio, score, entryCount, workTypes, hasUpdate: userUpdates.length > 0 }
    }).sort((a, b) => b.score - a.score || b.workedHours - a.workedHours)
  }, [members, groupedByUser])

  const totalHours = rows.reduce((s, r) => s + r.workedHours, 0)
  const totalValue = rows.reduce((s, r) => s + r.workValue, 0)
  const totalSalary = rows.reduce((s, r) => s + r.salary, 0)

  return (
    <div style={{ background: "#fff", borderRadius: 20, boxShadow: "0 1px 3px rgba(0,0,0,0.06), 0 4px 20px rgba(0,0,0,0.04)", overflow: "hidden" }}>
      {/* Header */}
      <div style={{ padding: "20px 24px 16px", borderBottom: "1px solid #F3F4F6", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <div style={{ width: 32, height: 32, borderRadius: 8, background: "rgba(227,30,36,0.08)", display: "flex", alignItems: "center", justifyContent: "center" }}>
            <BarChart3 size={16} color="#E31E24" />
          </div>
          <div>
            <div style={{ fontSize: 15, fontWeight: 700, color: "#111827" }}>Team Insights</div>
            <div style={{ fontSize: 11, color: "#9CA3AF" }}>Work value vs salary · sorted by score</div>
          </div>
        </div>
        {/* Summary chips */}
        <div style={{ display: "flex", gap: 8 }}>
          {[
            { label: "Total Hours", value: `${totalHours.toFixed(1)}h`, color: "#6366F1" },
            { label: "Work Value", value: fmtRupee(totalValue), color: "#10B981" },
            { label: "Salary Cost", value: fmtRupee(totalSalary), color: "#F59E0B" },
          ].map(chip => (
            <div key={chip.label} style={{ textAlign: "right" }}>
              <div style={{ fontSize: 13, fontWeight: 800, color: chip.color }}>{chip.value}</div>
              <div style={{ fontSize: 9, color: "#9CA3AF", fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.07em" }}>{chip.label}</div>
            </div>
          ))}
        </div>
      </div>

      {/* Column headers */}
      <div style={{ display: "grid", gridTemplateColumns: "2fr 120px 120px 100px 90px 60px", gap: 0, padding: "8px 24px", background: "#FAFAFA", borderBottom: "1px solid #F3F4F6" }}>
        {["Employee", "Worked / Free Time", "Work Value", "Salary", "Value vs Pay", "Score"].map(h => (
          <div key={h} style={{ fontSize: 10, fontWeight: 700, color: "#9CA3AF", textTransform: "uppercase", letterSpacing: "0.08em" }}>{h}</div>
        ))}
      </div>

      {/* Rows */}
      <div>
        {rows.map(({ member: m, workedHours, breakHours, breakCost, workValue, salary, effectiveRate, ratio, score, entryCount, workTypes, hasUpdate }, i) => {
          const [bg, fg] = avatarColor(m.name)
          const badge = getTeamBadge(m.team)
          const noRate = effectiveRate === 0
          const [rg1] = ratio == null ? ["#9CA3AF"] : ratio >= 100 ? ["#10B981"] : ratio >= 60 ? ["#F59E0B"] : ["#EF4444"]
          const [ag] = avatarColor(m.name)

          return (
            <div key={m.id} style={{
              display: "grid", gridTemplateColumns: "2fr 120px 120px 100px 90px 60px",
              gap: 0, padding: "14px 24px", alignItems: "center",
              borderBottom: "1px solid #F9FAFB",
              background: i % 2 === 0 ? "#fff" : "#FAFBFF",
              opacity: hasUpdate ? 1 : 0.5,
            }}>
              {/* Employee */}
              <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                <div style={{ width: 38, height: 38, borderRadius: "50%", background: bg, color: fg, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 12, fontWeight: 700, flexShrink: 0 }}>
                  {getInitials(m.name)}
                </div>
                <div style={{ minWidth: 0 }}>
                  <div style={{ fontSize: 13, fontWeight: 800, color: "#111827" }}>{m.name}</div>
                  <div style={{ display: "flex", alignItems: "center", gap: 5, marginTop: 3 }}>
                    <span style={{ padding: "1px 7px", borderRadius: 5, background: badge.bg, color: badge.color, fontSize: 9, fontWeight: 700 }}>{badge.label}</span>
                    {workTypes.length > 0 && <span style={{ fontSize: 11 }}>{workTypes.join(" ")}</span>}
                    {entryCount > 0 && <span style={{ fontSize: 10, color: "#9CA3AF" }}>{entryCount} entries</span>}
                    {!hasUpdate && <span style={{ fontSize: 10, color: "#EF4444", fontWeight: 700 }}>No update</span>}
                  </div>
                </div>
              </div>

              {/* Worked / Free Time */}
              <div>
                <div style={{ display: "flex", alignItems: "center", gap: 5 }}>
                  <span style={{ fontSize: 13, fontWeight: 900, color: workedHours > 0 ? ag : "#D1D5DB" }}>
                    {workedHours > 0 ? `${workedHours.toFixed(1)}h` : "—"}
                  </span>
                  {breakHours > 0 && (
                    <span style={{ fontSize: 10, fontWeight: 700, color: "#F97316", background: "rgba(249,115,22,0.08)", padding: "1px 5px", borderRadius: 4 }}>
                      ☕ {breakHours.toFixed(1)}h
                    </span>
                  )}
                </div>
                {!noRate && workedHours > 0 && <div style={{ fontSize: 9, color: "#9CA3AF", marginTop: 2 }}>{fmtRupee(effectiveRate)}/hr</div>}
                {!noRate && breakHours > 0 && <div style={{ fontSize: 9, color: "#F97316", marginTop: 1 }}>free {fmtRupee(breakCost)} wasted</div>}
              </div>

              {/* Work Value */}
              <div style={{ fontSize: 13, fontWeight: 800, color: workValue > 0 ? "#10B981" : "#D1D5DB" }}>
                {workValue > 0 ? fmtRupee(workValue) : "—"}
              </div>

              {/* Salary */}
              <div style={{ fontSize: 12, fontWeight: 700, color: salary > 0 ? "#374151" : "#D1D5DB" }}>
                {salary > 0 ? fmtRupee(salary) : "Not set"}
              </div>

              {/* Value vs Pay */}
              <div>
                {ratio != null
                  ? <span style={{ fontSize: 12, fontWeight: 800, padding: "3px 10px", borderRadius: 7, background: `${rg1}18`, color: rg1, border: `1px solid ${rg1}30` }}>{ratio}%</span>
                  : <span style={{ fontSize: 11, color: "#D1D5DB" }}>—</span>}
              </div>

              {/* Score */}
              <ScoreRing score={score} size={40} />
            </div>
          )
        })}
      </div>

      {/* Legend */}
      <div style={{ padding: "12px 24px", background: "#FAFAFA", borderTop: "1px solid #F3F4F6", display: "flex", gap: 20, flexWrap: "wrap" }}>
        {[["#10B981","≥100% · generating more value than salary"],["#F59E0B","60–99% · moderate"],["#EF4444","<60% · below expected"]].map(([c, l]) => (
          <div key={l} style={{ display: "flex", alignItems: "center", gap: 5 }}>
            <div style={{ width: 7, height: 7, borderRadius: "50%", background: c }} />
            <span style={{ fontSize: 10, color: "#6B7280" }}>{l}</span>
          </div>
        ))}
        <div style={{ marginLeft: "auto", fontSize: 10, color: "#9CA3AF" }}>Score = Value (50pts) + Hours (20pts) + Entries (30pts)</div>
      </div>
    </div>
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
  const [activeTab, setActiveTab] = useState<"updates" | "insights">("updates")

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
      map[user.id].hours += u.working_hours ?? 0
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
      const totalHours = userUpdates.reduce((s, u) => s + (u.working_hours ?? 0), 0)
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
      <div style={{
        position: "relative", borderRadius: 20, overflow: "hidden", marginBottom: 24,
        background: "linear-gradient(100deg, #080808 0%, #1A0000 25%, #420000 55%, #C10000 100%)",
        height: 260,
      }}>
        <div style={{
          position: "absolute", inset: 0, pointerEvents: "none",
          background: "radial-gradient(ellipse 38% 70% at 55% 100%, rgba(220,0,0,0.45) 0%, transparent 70%)",
        }} />
        <img
          src="/brand/activities-hero.png"
          alt=""
          style={{
            position: "absolute", bottom: -85, left: "50%", transform: "translateX(-50%)",
            height: 300, width: "auto", objectFit: "contain",
            pointerEvents: "none", userSelect: "none", zIndex: 1,
          }}
        />
        <div style={{ display: "grid", gridTemplateColumns: "40% 40% 20%", height: "100%", position: "relative", zIndex: 2 }}>
          <div style={{ padding: "0 24px 0 32px", display: "flex", flexDirection: "column", justifyContent: "center" }}>
            <h1 style={{ fontSize: 36, fontWeight: 900, color: "#FFFFFF", lineHeight: 1.1, margin: "0 0 8px" }}>Activities</h1>
            <p style={{ fontSize: 13, color: "rgba(255,255,255,0.6)", margin: "0 0 20px", lineHeight: 1.5 }}>
              Track real-time updates and progress from your amazing team.
            </p>
            <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
              <div style={{ position: "relative", width: 280 }}>
                <Search size={14} style={{ position: "absolute", left: 14, top: "50%", transform: "translateY(-50%)", color: "rgba(255,255,255,0.45)", pointerEvents: "none" }} />
                <input
                  value={search}
                  onChange={e => setSearch(e.target.value)}
                  placeholder="Search members, updates..."
                  style={{
                    width: "100%", boxSizing: "border-box", height: 52,
                    padding: "0 14px 0 38px", border: "1px solid rgba(255,255,255,0.18)",
                    borderRadius: 14, background: "rgba(255,255,255,0.09)", backdropFilter: "blur(10px)",
                    color: "#fff", fontSize: 13, outline: "none",
                  }}
                />
              </div>
              <button style={{
                width: 52, height: 52, borderRadius: 14, background: "rgba(255,255,255,0.12)",
                border: "1px solid rgba(255,255,255,0.18)", cursor: "pointer",
                display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0,
              }}>
                <Filter size={16} color="rgba(255,255,255,0.75)" />
              </button>
            </div>
          </div>
          <div />
          <div style={{ padding: "20px 20px 20px 0", display: "flex", flexDirection: "column", gap: 8, alignItems: "flex-end", justifyContent: "flex-start" }}>
            <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "8px 14px", borderRadius: 10, background: "rgba(255,255,255,0.1)", border: "1px solid rgba(255,255,255,0.18)", backdropFilter: "blur(8px)", cursor: "pointer", whiteSpace: "nowrap" }}>
              <span style={{ fontSize: 12, color: "#fff", fontWeight: 600 }}>{displayDate}</span>
              <svg width="12" height="12" viewBox="0 0 12 12" fill="none"><path d="M3 4.5L6 7.5L9 4.5" stroke="rgba(255,255,255,0.6)" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/></svg>
            </div>
            <div style={{ padding: "10px 14px", borderRadius: 12, background: "rgba(255,255,255,0.1)", border: "1px solid rgba(255,255,255,0.18)", backdropFilter: "blur(8px)", width: "100%" }}>
              <div style={{ fontSize: 12, fontWeight: 700, color: "#fff", marginBottom: 2 }}>Keep it up! 🚀</div>
              <div style={{ fontSize: 11, color: "rgba(255,255,255,0.6)", lineHeight: 1.4 }}>Team updates are on track today.</div>
              <svg width="100%" height="24" style={{ marginTop: 4 }}>
                <polyline points="0,18 20,12 40,15 60,8 80,10 100,5 120,8 140,4 160,6" fill="none" stroke="#E31E24" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
              </svg>
            </div>
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

      {/* ── View Toggle ── */}
      <div style={{ display: "flex", gap: 0, marginBottom: 20, background: "#F3F4F6", borderRadius: 12, padding: 4, width: "fit-content" }}>
        {([
          { key: "updates",  label: "Updates",      icon: <TrendingUp size={14} /> },
          { key: "insights", label: "Team Insights", icon: <BarChart3 size={14} /> },
        ] as const).map(tab => (
          <button
            key={tab.key}
            onClick={() => { setActiveTab(tab.key); setSelectedUserId(null) }}
            style={{
              display: "flex", alignItems: "center", gap: 6,
              padding: "8px 20px", borderRadius: 9, fontSize: 13, fontWeight: 700,
              cursor: "pointer", border: "none", transition: "all 0.18s",
              background: activeTab === tab.key ? "#fff" : "transparent",
              color: activeTab === tab.key ? "#E31E24" : "#6B7280",
              boxShadow: activeTab === tab.key ? "0 1px 6px rgba(0,0,0,0.1)" : "none",
            }}
          >
            {tab.icon}
            {tab.label}
          </button>
        ))}
      </div>

      {/* ── Main content ── */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 340px", gap: 20 }}>

        {/* ── Left: People who updated OR Team Insights ── */}
        {activeTab === "insights" ? (
          <TeamInsightsView members={members} groupedByUser={groupedByUser} />
        ) : (
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
        )} {/* end updates/insights conditional */}

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
        />
      )}
    </div>
  )
}
