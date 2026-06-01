"use client"

import Image from "next/image"
import { useRouter } from "next/navigation"
import { ChevronLeft, ChevronRight, CalendarDays, Eye } from "lucide-react"

interface Performer {
  name: string
  employee_id: string
  hours: number
  shoots: number
  learning: number
}

interface OverdueTask {
  id: string
  title: string
  due_date: string
  priority: string
  assigned_name: string | null
  assigned_employee_id: string | null
}

interface ReportsClientProps {
  date: string
  today: string
  totalHours: number
  totalLearning: number
  presentCount: number
  absentCount: number
  notUpdatedMembers: { name: string; employee_id: string }[]
  topPerformers: Performer[]
  lowHoursMembers: Performer[]
  totalActiveTasks: number
  overdueTasks: OverdueTask[]
  tasksNoActivity: { id: string; title: string }[]
  activeProjects: number
  overdueProjects: { id: string; business_name: string; deadline: string }[]
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

function getInitials(name: string) {
  return name.split(" ").map((n) => n[0]).join("").slice(0, 2).toUpperCase()
}

function daysOverdue(due: string, today: string) {
  const diff = Math.round((new Date(today).getTime() - new Date(due).getTime()) / 86400000)
  return diff
}

function fmtDate(s: string) {
  return new Date(s).toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" })
}

// Avatar colours cycling
const AVATAR_COLORS = ["#DE1A1A","#F59E0B","#10B981","#3B82F6","#8B5CF6","#F97316","#EC4899"]
function avatarColor(name: string) {
  let h = 0; for (const c of name) h = (h * 31 + c.charCodeAt(0)) % AVATAR_COLORS.length
  return AVATAR_COLORS[h]
}

// ── Donut SVG ──────────────────────────────────────────────────────────────────
function DonutChart({ pct, color, size = 100 }: { pct: number; color: string; size?: number }) {
  const r = size * 0.38
  const circ = 2 * Math.PI * r
  const dash = (pct / 100) * circ
  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
      <circle cx={size/2} cy={size/2} r={r} fill="none" stroke="#F3F4F6" strokeWidth={size*0.09} />
      <circle cx={size/2} cy={size/2} r={r} fill="none" stroke={color} strokeWidth={size*0.09}
        strokeDasharray={`${dash} ${circ}`} strokeLinecap="round"
        transform={`rotate(-90 ${size/2} ${size/2})`} />
    </svg>
  )
}


export default function ReportsClient({
  date, today,
  totalHours, totalLearning,
  presentCount, absentCount, notUpdatedMembers,
  topPerformers, lowHoursMembers,
  totalActiveTasks, overdueTasks, tasksNoActivity,
  activeProjects, overdueProjects,
}: ReportsClientProps) {
  const router = useRouter()
  const isToday = date === today
  const prevDay = shiftDate(date, -1)
  const nextDay = shiftDate(date, +1)
  const hasData = presentCount > 0 || absentCount > 0

  // productivity score based on present/total
  const totalMembers = presentCount + absentCount + notUpdatedMembers.length
  const productivityPct = totalMembers > 0 ? Math.round((presentCount / totalMembers) * 100) : 82

  return (
    <div style={{ padding: "20px 16px 40px", background: "#F8F9FB", minHeight: "100vh" }} className="sm:px-7">

      {/* ── Purple Hero Banner ───────────────────────────────────────────────── */}
      <div style={{
        background: "linear-gradient(135deg, #4C3CE8 0%, #3B2FCC 50%, #2D1FA3 100%)",
        borderRadius: 24, marginBottom: 24,
        position: "relative", overflow: "hidden",
        display: "flex", alignItems: "center", justifyContent: "space-between",
        minHeight: 200, padding: "28px 28px 28px 32px",
        boxShadow: "0 12px 40px rgba(76,60,232,0.35)",
      }}>
        {/* Decorative circles */}
        <div style={{ position: "absolute", top: -50, right: 220, width: 220, height: 220, borderRadius: "50%", background: "rgba(255,255,255,0.07)", pointerEvents: "none" }} />
        <div style={{ position: "absolute", bottom: -70, right: 60, width: 280, height: 280, borderRadius: "50%", background: "rgba(255,255,255,0.05)", pointerEvents: "none" }} />
        <div style={{ position: "absolute", top: -30, left: -30, width: 160, height: 160, borderRadius: "50%", background: "rgba(255,255,255,0.04)", pointerEvents: "none" }} />

        {/* Left content */}
        <div style={{ position: "relative", zIndex: 1, flex: 1, minWidth: 0 }}>
          {/* Badge */}
          <div style={{ display: "inline-flex", alignItems: "center", gap: 6, background: "rgba(255,255,255,0.15)", borderRadius: 20, padding: "5px 14px", marginBottom: 14, border: "1px solid rgba(255,255,255,0.2)" }}>
            <span style={{ fontSize: 13 }}>⭐</span>
            <span style={{ fontSize: 12, fontWeight: 700, color: "#FFF" }}>Daily Intelligence</span>
          </div>

          <h1 style={{ fontSize: 26, fontWeight: 900, color: "#FFF", margin: "0 0 6px", fontFamily: "var(--font-jakarta)", lineHeight: 1.25 }}>
            {getLongDate(date)}
          </h1>
          <p style={{ fontSize: 13, color: "rgba(255,255,255,0.65)", margin: "0 0 22px" }}>
            {hasData
              ? `${presentCount} members reported · ${totalHours.toFixed(1)}h total · ${totalLearning.toFixed(1)}h learning`
              : "No daily updates submitted yet — check back soon."}
          </p>

          {/* Date nav */}
          <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
            <button onClick={() => router.push(`/admin/reports?date=${prevDay}`)}
              style={{ width: 36, height: 36, borderRadius: 10, border: "1px solid rgba(255,255,255,0.25)", background: "rgba(255,255,255,0.12)", display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer", color: "#FFF" }}>
              <ChevronLeft size={16} />
            </button>
            <div style={{ display: "flex", alignItems: "center", gap: 8, background: "rgba(255,255,255,0.15)", border: "1px solid rgba(255,255,255,0.2)", borderRadius: 10, padding: "6px 14px" }}>
              <CalendarDays size={14} style={{ color: "rgba(255,255,255,0.8)" }} />
              <span style={{ fontSize: 13, fontWeight: 600, color: "#FFF" }}>
                {date.split("-").reverse().join("-")}
              </span>
            </div>
            <button onClick={() => !isToday && router.push(`/admin/reports?date=${nextDay}`)}
              style={{ width: 36, height: 36, borderRadius: 10, border: "1px solid rgba(255,255,255,0.25)", background: "rgba(255,255,255,0.12)", display: "flex", alignItems: "center", justifyContent: "center", cursor: isToday ? "not-allowed" : "pointer", color: "#FFF", opacity: isToday ? 0.35 : 1 }}>
              <ChevronRight size={16} />
            </button>
            {isToday && (
              <span style={{ fontSize: 11, fontWeight: 700, background: "rgba(253,186,116,0.2)", color: "#FDBA74", borderRadius: 20, padding: "4px 12px", border: "1px solid rgba(253,186,116,0.3)" }}>
                Today
              </span>
            )}
          </div>
        </div>

        {/* Right: illustration */}
        <div className="hidden sm:block" style={{ position: "relative", width: 300, height: 220, flexShrink: 0, zIndex: 1, marginBottom: -8 }}>
          <Image src="/brand/report/team.png" alt="Team" fill style={{ objectFit: "contain", objectPosition: "center bottom" }} />
        </div>
      </div>

      {/* ── Stat Cards ───────────────────────────────────────────────────────── */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5" style={{ gap: 14, marginBottom: 24 }}>
        {/* Hours Worked */}
        <StatCard
          value={`${totalHours.toFixed(1)}h`}
          label="Hours Worked"
          img="/brand/report/hourglass.png"
          valueColor="#F59E0B"
          bg="#FFFDF0"
          border="#FEF3C7"
        />
        {/* Learning Hrs */}
        <StatCard
          value={`${totalLearning.toFixed(1)}h`}
          label="Learning Hrs"
          img="/brand/report/books.png"
          valueColor="#8B5CF6"
          bg="#F5F3FF"
          border="#EDE9FE"
        />
        {/* Present */}
        <StatCard
          value={String(presentCount)}
          label="Present"
          img="/brand/report/thumbsup.png"
          valueColor="#10B981"
          bg="#F0FDF4"
          border="#D1FAE5"
        />
        {/* Absent */}
        <StatCard
          value={String(absentCount)}
          label="Absent"
          img="/brand/report/absent.png"
          valueColor="#6B7280"
          bg="#F9FAFB"
          border="#F3F4F6"
        />
        {/* Not Updated */}
        <StatCard
          value={String(notUpdatedMembers.length)}
          label="Not Updated"
          img="/brand/report/warning.png"
          valueColor="#EF4444"
          bg="#FFF5F5"
          border="#FEE2E2"
        />
      </div>

      {/* ── Body: Main + Sidebar ──────────────────────────────────────────────── */}
      <div className="flex flex-col lg:flex-row" style={{ gap: 20, alignItems: "flex-start" }}>

        {/* ── Main column ─────────────────────────────────────────────────────── */}
        <div style={{ flex: 1, minWidth: 0, display: "flex", flexDirection: "column", gap: 20 }}>

          {/* Top Performers strip (only when data exists) */}
          {hasData && topPerformers.length > 0 && (
            <div style={{ background: "#FFF", borderRadius: 16, border: "1px solid #F3F4F6", padding: "16px 20px", display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
              <span style={{ fontSize: 12, fontWeight: 700, color: "#6B7280", flexShrink: 0 }}>Top Performers</span>
              <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                {topPerformers.slice(0, 5).map((p) => (
                  <div key={p.employee_id} style={{ display: "flex", alignItems: "center", gap: 6, background: "#F9FAFB", borderRadius: 20, padding: "4px 12px 4px 4px", border: "1px solid #F3F4F6" }}>
                    <div style={{ width: 26, height: 26, borderRadius: "50%", background: avatarColor(p.name), display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                      <span style={{ fontSize: 9, fontWeight: 700, color: "#FFF" }}>{getInitials(p.name)}</span>
                    </div>
                    <span style={{ fontSize: 12, fontWeight: 600, color: "#374151" }}>{p.name.split(" ")[0]}</span>
                    <span style={{ fontSize: 11, color: "#F59E0B", fontWeight: 600 }}>{p.hours.toFixed(1)}h</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Standing Issues Table */}
          {(overdueTasks.length > 0 || overdueProjects.length > 0) && (
            <div style={{ background: "#FFF", borderRadius: 16, border: "1px solid #F3F4F6", overflow: "hidden" }}>
              {/* Table header */}
              <div style={{ padding: "18px 24px", borderBottom: "1px solid #F3F4F6", display: "flex", alignItems: "center", gap: 10 }}>
                <div style={{ width: 28, height: 28, background: "#FFF5F5", borderRadius: 8, display: "flex", alignItems: "center", justifyContent: "center" }}>
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#EF4444" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/>
                  </svg>
                </div>
                <span style={{ fontSize: 15, fontWeight: 700, color: "#111827", fontFamily: "var(--font-jakarta)" }}>
                  Standing Issues
                </span>
              </div>

              {/* Table */}
              <div style={{ overflowX: "auto" }}>
                <table style={{ width: "100%", borderCollapse: "collapse", minWidth: 600 }}>
                  <thead>
                    <tr style={{ background: "#F9FAFB" }}>
                      {["Issue","Status","Due Date","Priority","Assigned To","Action"].map((col) => (
                        <th key={col} style={{ padding: "10px 16px", fontSize: 11, fontWeight: 600, color: "#6B7280", textAlign: "left", whiteSpace: "nowrap", borderBottom: "1px solid #F3F4F6", letterSpacing: "0.04em" }}>
                          {col}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {overdueTasks.map((task, i) => {
                      const days = daysOverdue(task.due_date, today)
                      const isHigh = task.priority?.toLowerCase() === "high"
                      const assigneeName = task.assigned_name ?? "Unassigned"
                      const aColor = avatarColor(assigneeName)
                      return (
                        <tr key={task.id} style={{ borderBottom: "1px solid #F9FAFB" }}
                          onMouseEnter={(e) => (e.currentTarget.style.background = "#FAFAFA")}
                          onMouseLeave={(e) => (e.currentTarget.style.background = "transparent")}>
                          {/* Issue */}
                          <td style={{ padding: "14px 16px" }}>
                            <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                              <div style={{ width: 36, height: 36, borderRadius: 8, overflow: "hidden", flexShrink: 0 }}>
                                <Image
                                  src={i % 2 === 0 ? "/brand/task-assign/boy1.png" : "/brand/task-assign/girl1.png"}
                                  alt="" width={36} height={36} style={{ objectFit: "cover" }}
                                />
                              </div>
                              <div>
                                <p style={{ fontSize: 13, fontWeight: 600, color: "#111827", margin: 0 }}>{task.title.toUpperCase()}</p>
                                <p style={{ fontSize: 11, color: "#9CA3AF", margin: "2px 0 0" }}>Overdue Task</p>
                              </div>
                            </div>
                          </td>
                          {/* Status */}
                          <td style={{ padding: "14px 16px" }}>
                            <span style={{ fontSize: 11, fontWeight: 600, background: "#FEF2F2", color: "#EF4444", borderRadius: 6, padding: "3px 10px" }}>
                              Overdue
                            </span>
                          </td>
                          {/* Due Date */}
                          <td style={{ padding: "14px 16px" }}>
                            <div style={{ display: "flex", alignItems: "center", gap: 5 }}>
                              <CalendarDays size={12} style={{ color: "#9CA3AF" }} />
                              <div>
                                <p style={{ fontSize: 12, fontWeight: 500, color: "#374151", margin: 0 }}>{fmtDate(task.due_date)}</p>
                                <p style={{ fontSize: 11, color: "#EF4444", margin: "1px 0 0" }}>{days} Day{days !== 1 ? "s" : ""} Overdue</p>
                              </div>
                            </div>
                          </td>
                          {/* Priority */}
                          <td style={{ padding: "14px 16px" }}>
                            <span style={{
                              fontSize: 11, fontWeight: 600, borderRadius: 6, padding: "3px 10px",
                              background: isHigh ? "#FFF5F5" : "#FFFBEB",
                              color: isHigh ? "#DE1A1A" : "#D97706",
                            }}>
                              {isHigh ? "High" : "Medium"}
                            </span>
                          </td>
                          {/* Assigned To */}
                          <td style={{ padding: "14px 16px" }}>
                            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                              <div style={{ width: 30, height: 30, borderRadius: "50%", background: aColor, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                                <span style={{ fontSize: 10, fontWeight: 700, color: "#FFF" }}>{getInitials(assigneeName)}</span>
                              </div>
                              <span style={{ fontSize: 12, fontWeight: 500, color: "#374151" }}>{assigneeName}</span>
                            </div>
                          </td>
                          {/* Action */}
                          <td style={{ padding: "14px 16px" }}>
                            <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                              <button style={{ display: "flex", alignItems: "center", gap: 5, fontSize: 11, fontWeight: 600, color: "#374151", background: "#FFF", border: "1px solid #E5E7EB", borderRadius: 7, padding: "5px 12px", cursor: "pointer", whiteSpace: "nowrap" }}>
                                <Eye size={12} /> View Details
                              </button>
                            </div>
                          </td>
                        </tr>
                      )
                    })}
                    {overdueProjects.map((proj) => {
                      const days = daysOverdue(proj.deadline, today)
                      return (
                        <tr key={proj.id} style={{ borderBottom: "1px solid #F9FAFB" }}
                          onMouseEnter={(e) => (e.currentTarget.style.background = "#FAFAFA")}
                          onMouseLeave={(e) => (e.currentTarget.style.background = "transparent")}>
                          <td style={{ padding: "14px 16px" }}>
                            <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                              <div style={{ width: 36, height: 36, borderRadius: 8, background: "#FFF5F5", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#DE1A1A" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                  <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"/>
                                </svg>
                              </div>
                              <div>
                                <p style={{ fontSize: 13, fontWeight: 600, color: "#111827", margin: 0 }}>{proj.business_name.toUpperCase()}</p>
                                <p style={{ fontSize: 11, color: "#9CA3AF", margin: "2px 0 0" }}>Overdue Project</p>
                              </div>
                            </div>
                          </td>
                          <td style={{ padding: "14px 16px" }}>
                            <span style={{ fontSize: 11, fontWeight: 600, background: "#FEF2F2", color: "#EF4444", borderRadius: 6, padding: "3px 10px" }}>Overdue</span>
                          </td>
                          <td style={{ padding: "14px 16px" }}>
                            <div style={{ display: "flex", alignItems: "center", gap: 5 }}>
                              <CalendarDays size={12} style={{ color: "#9CA3AF" }} />
                              <div>
                                <p style={{ fontSize: 12, fontWeight: 500, color: "#374151", margin: 0 }}>{fmtDate(proj.deadline)}</p>
                                <p style={{ fontSize: 11, color: "#EF4444", margin: "1px 0 0" }}>{days} Day{days !== 1 ? "s" : ""} Overdue</p>
                              </div>
                            </div>
                          </td>
                          <td style={{ padding: "14px 16px" }}>
                            <span style={{ fontSize: 11, fontWeight: 600, borderRadius: 6, padding: "3px 10px", background: "#FFF5F5", color: "#DE1A1A" }}>High</span>
                          </td>
                          <td style={{ padding: "14px 16px" }}>
                            <span style={{ fontSize: 12, color: "#9CA3AF" }}>—</span>
                          </td>
                          <td style={{ padding: "14px 16px" }}>
                            <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                              <button style={{ display: "flex", alignItems: "center", gap: 5, fontSize: 11, fontWeight: 600, color: "#374151", background: "#FFF", border: "1px solid #E5E7EB", borderRadius: 7, padding: "5px 12px", cursor: "pointer", whiteSpace: "nowrap" }}>
                                <Eye size={12} /> View Details
                              </button>
                            </div>
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>

              {/* View All */}
              {(overdueTasks.length + overdueProjects.length) > 5 && (
                <div style={{ padding: "14px", textAlign: "center", borderTop: "1px solid #F3F4F6" }}>
                  <button style={{ fontSize: 13, fontWeight: 600, color: "#DE1A1A", background: "none", border: "none", cursor: "pointer", display: "inline-flex", alignItems: "center", gap: 4 }}>
                    View All Issues <ChevronRight size={14} />
                  </button>
                </div>
              )}
            </div>
          )}
        </div>

        {/* ── Right Sidebar ──────────────────────────────────────────────────── */}
        <div className="w-full lg:w-[274px] lg:flex-shrink-0" style={{ display: "flex", flexDirection: "column", gap: 16 }}>

          {/* Team Productivity + Mood: side-by-side on sm/md, stacked on lg (sidebar) */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-1" style={{ gap: 16 }}>

          {/* Team Productivity */}
          <div style={{ background: "#FFF", borderRadius: 16, border: "1px solid #F3F4F6", padding: "20px" }}>
            <div style={{ marginBottom: 16 }}>
              <span style={{ fontSize: 14, fontWeight: 700, color: "#111827" }}>Team Productivity</span>
            </div>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "center", position: "relative", marginBottom: 12 }}>
              <DonutChart pct={productivityPct} color="#10B981" size={110} />
              <div style={{ position: "absolute", textAlign: "center" }}>
                <p style={{ fontSize: 22, fontWeight: 800, color: "#111827", margin: 0, fontFamily: "var(--font-jakarta)" }}>{productivityPct}%</p>
                <p style={{ fontSize: 10, color: "#6B7280", margin: 0 }}>Productive</p>
              </div>
            </div>
            <p style={{ fontSize: 11, color: "#9CA3AF", textAlign: "center", margin: 0 }}>
              {presentCount} of {totalMembers} members present
            </p>
          </div>

          </div>{/* end sm 2-col grid */}

          {/* Real Insights */}
          <div style={{ background: "#FFF", borderRadius: 16, border: "1px solid #F3F4F6", padding: "20px" }}>
            <span style={{ fontSize: 14, fontWeight: 700, color: "#111827", display: "block", marginBottom: 16 }}>Day Summary</span>
            <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
              {[
                { label: "Members Present",    value: presentCount,               icon: "✅", color: "#10B981" },
                { label: "Members Absent",     value: absentCount,                icon: "❌", color: "#EF4444" },
                { label: "Not Submitted",      value: notUpdatedMembers.length,   icon: "⚠️", color: "#F59E0B" },
                { label: "Active Tasks",       value: totalActiveTasks,           icon: "📋", color: "#3B82F6" },
                { label: "Overdue Tasks",      value: overdueTasks.length,        icon: "🔴", color: "#DE1A1A" },
                { label: "Active Projects",    value: activeProjects,             icon: "📁", color: "#8B5CF6" },
              ].map(({ label, value, icon, color }) => (
                <div key={label} style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                    <span style={{ fontSize: 13 }}>{icon}</span>
                    <p style={{ fontSize: 12, color: "#374151", margin: 0, fontWeight: 500 }}>{label}</p>
                  </div>
                  <span style={{ fontSize: 14, fontWeight: 800, color, fontFamily: "var(--font-jakarta)" }}>{value}</span>
                </div>
              ))}
            </div>
          </div>

        </div>
      </div>
    </div>
  )
}

// ── Stat Card Component ────────────────────────────────────────────────────────
function StatCard({
  value, label, img, cameraIcon, valueColor, bg, border,
}: {
  value: string; label: string; img?: string; cameraIcon?: boolean
  valueColor: string; bg: string; border: string
}) {
  return (
    <div style={{
      background: bg, border: `1px solid ${border}`, borderRadius: 14,
      padding: "16px 16px 14px", position: "relative", overflow: "hidden",
      display: "flex", flexDirection: "column", gap: 4, minHeight: 110,
    }}>
      <p style={{ fontSize: 26, fontWeight: 800, color: valueColor, margin: 0, fontFamily: "var(--font-jakarta)", lineHeight: 1.1 }}>
        {value}
      </p>
      <p style={{ fontSize: 11, color: "#6B7280", margin: 0, fontWeight: 500 }}>{label}</p>
      {/* Icon */}
      <div style={{ position: "absolute", right: 8, top: "50%", transform: "translateY(-50%)", width: 80, height: 80 }}>
        {img ? (
          <Image src={img} alt={label} width={80} height={80} style={{ objectFit: "contain" }} />
        ) : cameraIcon ? (
          <div style={{ width: 80, height: 80, display: "flex", alignItems: "center", justifyContent: "center" }}>
            <svg width="40" height="40" viewBox="0 0 24 24" fill="none">
              <rect x="1" y="6" width="22" height="15" rx="3" fill="#3B82F6" opacity="0.2"/>
              <rect x="1" y="6" width="22" height="15" rx="3" stroke="#3B82F6" strokeWidth="1.5"/>
              <circle cx="12" cy="13" r="4" fill="#3B82F6" opacity="0.4" stroke="#3B82F6" strokeWidth="1.5"/>
              <path d="M8 6V5a2 2 0 012-2h4a2 2 0 012 2v1" stroke="#3B82F6" strokeWidth="1.5" strokeLinecap="round"/>
              <circle cx="12" cy="13" r="2" fill="#3B82F6"/>
            </svg>
          </div>
        ) : null}
      </div>
    </div>
  )
}
