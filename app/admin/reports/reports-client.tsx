"use client"

import Image from "next/image"
import { useRouter } from "next/navigation"
import { ChevronLeft, ChevronRight, CalendarDays, Send, MoreHorizontal, Eye } from "lucide-react"

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

// ── Sparkline ──────────────────────────────────────────────────────────────────
function Spark({ color }: { color: string }) {
  const paths = [
    "M0,12 C8,8 16,14 24,10 C32,6 40,11 48,7 C56,3 64,9 72,6",
    "M0,10 C10,14 20,6 30,10 C40,14 50,4 60,8 C68,11 72,5 80,9",
    "M0,8 C12,12 24,4 36,8 C48,12 60,3 72,7",
    "M0,14 C10,8 22,12 32,6 C42,10 54,4 64,9 C70,11 74,6 80,10",
  ]
  return (
    <svg width="80" height="20" viewBox="0 0 80 20" fill="none">
      <path d={paths[Math.floor(Math.random() * 4)]} stroke={color} strokeWidth="2" strokeLinecap="round" fill="none" />
    </svg>
  )
}

// Deterministic sparkline by index
const SPARK_PATHS = [
  "M0,12 C8,8 16,14 24,10 C32,6 40,11 48,7 C56,3 64,9 72,6",
  "M0,10 C10,14 20,6 30,10 C40,14 50,4 60,8 C68,11 72,5 80,9",
  "M0,8 C12,12 24,4 36,8 C48,12 60,3 72,7",
  "M0,14 C10,8 22,12 32,6 C42,10 54,4 64,9 C70,11 74,6 80,10",
]

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

  // mood score based on avg hours
  const avgHours = hasData && topPerformers.length > 0
    ? topPerformers.reduce((s, p) => s + p.hours, 0) / topPerformers.length
    : 0
  const moodScore = avgHours > 7 ? 4.8 : avgHours > 5 ? 4.2 : avgHours > 3 ? 3.5 : 3.0
  const moodLabel = moodScore >= 4.5 ? "Very Happy" : moodScore >= 4.0 ? "Happy" : moodScore >= 3.5 ? "Neutral" : "Tired"

  return (
    <div style={{ padding: "20px 16px 40px", background: "#F8F9FB", minHeight: "100vh" }} className="sm:px-7">

      {/* ── Page Header ──────────────────────────────────────────────────────── */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between" style={{ marginBottom: 24 }}>
        <div>
          <h1 style={{ fontSize: 28, fontWeight: 800, color: "#111827", fontFamily: "var(--font-jakarta)", lineHeight: 1.2, margin: 0 }}>
            Daily Intelligence
          </h1>
          <div style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 4 }}>
            <span style={{ fontSize: 13, color: "#6B7280" }}>{getLongDate(date)}</span>
            {isToday && (
              <span style={{ fontSize: 11, fontWeight: 700, background: "rgba(249,115,22,0.12)", color: "#F97316", borderRadius: 20, padding: "2px 10px" }}>
                Today
              </span>
            )}
          </div>
        </div>

        {/* Date nav */}
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <button onClick={() => router.push(`/admin/reports?date=${prevDay}`)}
            style={{ width: 36, height: 36, borderRadius: 10, border: "1px solid #E5E7EB", background: "#FFF", display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer", color: "#6B7280" }}>
            <ChevronLeft size={16} />
          </button>
          <div style={{ display: "flex", alignItems: "center", gap: 8, background: "#FFF", border: "1px solid #E5E7EB", borderRadius: 10, padding: "6px 14px" }}>
            <CalendarDays size={15} style={{ color: "#DE1A1A" }} />
            <span style={{ fontSize: 13, fontWeight: 600, color: "#111827" }}>
              {date.split("-").reverse().join("-")}
            </span>
          </div>
          <button onClick={() => !isToday && router.push(`/admin/reports?date=${nextDay}`)}
            style={{ width: 36, height: 36, borderRadius: 10, border: "1px solid #E5E7EB", background: "#FFF", display: "flex", alignItems: "center", justifyContent: "center", cursor: isToday ? "not-allowed" : "pointer", color: isToday ? "#D1D5DB" : "#6B7280", opacity: isToday ? 0.4 : 1 }}>
            <ChevronRight size={16} />
          </button>
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

          {/* Hero card: illustration + empty state or stats */}
          <div style={{ background: "#FFF", borderRadius: 16, border: "1px solid #F3F4F6", overflow: "hidden" }}>
            <div className="flex flex-col sm:flex-row sm:items-center" style={{ minHeight: 260 }}>
              {/* Illustration */}
              <div className="relative w-full sm:w-auto sm:flex-shrink-0" style={{ height: 200, maxWidth: "100%" }}>
                <div className="hidden sm:block" style={{ width: 340, height: 260, position: "relative" }}>
                  <Image src="/brand/report/team.png" alt="Team" fill style={{ objectFit: "cover", objectPosition: "center" }} />
                </div>
                <div className="block sm:hidden" style={{ position: "relative", width: "100%", height: 200 }}>
                  <Image src="/brand/report/team.png" alt="Team" fill style={{ objectFit: "cover", objectPosition: "center" }} />
                </div>
              </div>
              {/* Content */}
              <div style={{ flex: 1, padding: "24px 24px", display: "flex", flexDirection: "column", alignItems: "flex-start", gap: 16 }} className="sm:px-10 sm:py-8">
                {!hasData ? (
                  <>
                    <div style={{ width: 48, height: 48, background: "#FFF5F5", borderRadius: 12, display: "flex", alignItems: "center", justifyContent: "center" }}>
                      <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#DE1A1A" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/>
                      </svg>
                    </div>
                    <div>
                      <p style={{ fontSize: 20, fontWeight: 700, color: "#111827", margin: 0, fontFamily: "var(--font-jakarta)" }}>
                        No updates submitted today
                      </p>
                      <p style={{ fontSize: 13, color: "#6B7280", margin: "6px 0 0" }}>
                        Team members haven't submitted their daily reports yet.
                      </p>
                    </div>
                    <button style={{
                      display: "flex", alignItems: "center", gap: 8,
                      background: "#DE1A1A", color: "#FFF", border: "none", borderRadius: 10,
                      padding: "11px 24px", fontSize: 14, fontWeight: 600, cursor: "pointer"
                    }}>
                      Request Updates <Send size={14} />
                    </button>
                  </>
                ) : (
                  <>
                    <p style={{ fontSize: 20, fontWeight: 700, color: "#111827", margin: 0, fontFamily: "var(--font-jakarta)" }}>
                      {presentCount} members reported today
                    </p>
                    <p style={{ fontSize: 13, color: "#6B7280", margin: "6px 0 0" }}>
                      {totalHours.toFixed(1)}h total · {totalLearning.toFixed(1)}h learning · {absentCount} absent
                    </p>
                    {topPerformers.length > 0 && (
                      <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginTop: 4 }}>
                        {topPerformers.slice(0, 3).map((p) => (
                          <div key={p.employee_id} style={{ display: "flex", alignItems: "center", gap: 6, background: "#F9FAFB", borderRadius: 20, padding: "4px 12px 4px 4px", border: "1px solid #F3F4F6" }}>
                            <div style={{ width: 26, height: 26, borderRadius: "50%", background: avatarColor(p.name), display: "flex", alignItems: "center", justifyContent: "center" }}>
                              <span style={{ fontSize: 9, fontWeight: 700, color: "#FFF" }}>{getInitials(p.name)}</span>
                            </div>
                            <span style={{ fontSize: 12, fontWeight: 600, color: "#374151" }}>{p.name.split(" ")[0]}</span>
                            <span style={{ fontSize: 11, color: "#F59E0B", fontWeight: 600 }}>{p.hours.toFixed(1)}h</span>
                          </div>
                        ))}
                      </div>
                    )}
                  </>
                )}
              </div>
            </div>
          </div>

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
                      {["Issue","Status","Due Date","Priority","Assigned To","Progress","Action"].map((col) => (
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
                      const progPct = Math.max(10, Math.min(90, 60 - days * 5))
                      const progColor = progPct >= 60 ? "#10B981" : progPct >= 35 ? "#F59E0B" : "#EF4444"
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
                          {/* Progress */}
                          <td style={{ padding: "14px 16px", minWidth: 120 }}>
                            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                              <span style={{ fontSize: 12, fontWeight: 600, color: "#374151", minWidth: 32 }}>{progPct}%</span>
                              <div style={{ flex: 1, height: 6, background: "#F3F4F6", borderRadius: 4, overflow: "hidden" }}>
                                <div style={{ width: `${progPct}%`, height: "100%", background: progColor, borderRadius: 4 }} />
                              </div>
                            </div>
                          </td>
                          {/* Action */}
                          <td style={{ padding: "14px 16px" }}>
                            <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                              <button style={{ display: "flex", alignItems: "center", gap: 5, fontSize: 11, fontWeight: 600, color: "#374151", background: "#FFF", border: "1px solid #E5E7EB", borderRadius: 7, padding: "5px 12px", cursor: "pointer", whiteSpace: "nowrap" }}>
                                <Eye size={12} /> View Details
                              </button>
                              <button style={{ width: 28, height: 28, background: "#F9FAFB", border: "1px solid #F3F4F6", borderRadius: 7, display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer" }}>
                                <MoreHorizontal size={14} style={{ color: "#9CA3AF" }} />
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
                          <td style={{ padding: "14px 16px", minWidth: 120 }}>
                            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                              <span style={{ fontSize: 12, fontWeight: 600, color: "#374151", minWidth: 32 }}>20%</span>
                              <div style={{ flex: 1, height: 6, background: "#F3F4F6", borderRadius: 4, overflow: "hidden" }}>
                                <div style={{ width: "20%", height: "100%", background: "#EF4444", borderRadius: 4 }} />
                              </div>
                            </div>
                          </td>
                          <td style={{ padding: "14px 16px" }}>
                            <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                              <button style={{ display: "flex", alignItems: "center", gap: 5, fontSize: 11, fontWeight: 600, color: "#374151", background: "#FFF", border: "1px solid #E5E7EB", borderRadius: 7, padding: "5px 12px", cursor: "pointer", whiteSpace: "nowrap" }}>
                                <Eye size={12} /> View Details
                              </button>
                              <button style={{ width: 28, height: 28, background: "#F9FAFB", border: "1px solid #F3F4F6", borderRadius: 7, display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer" }}>
                                <MoreHorizontal size={14} style={{ color: "#9CA3AF" }} />
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
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 16 }}>
              <span style={{ fontSize: 14, fontWeight: 700, color: "#111827" }}>Team Productivity</span>
              <MoreHorizontal size={16} style={{ color: "#9CA3AF", cursor: "pointer" }} />
            </div>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "center", position: "relative", marginBottom: 12 }}>
              <DonutChart pct={productivityPct} color="#10B981" size={110} />
              <div style={{ position: "absolute", textAlign: "center" }}>
                <p style={{ fontSize: 22, fontWeight: 800, color: "#111827", margin: 0, fontFamily: "var(--font-jakarta)" }}>{productivityPct}%</p>
                <p style={{ fontSize: 10, color: "#6B7280", margin: 0 }}>Productive</p>
              </div>
            </div>
            <div style={{ display: "flex", alignItems: "center", gap: 4, justifyContent: "center" }}>
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#10B981" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <polyline points="18 15 12 9 6 15"/>
              </svg>
              <span style={{ fontSize: 12, color: "#10B981", fontWeight: 600 }}>12% vs yesterday</span>
            </div>
          </div>

          {/* Team Mood */}
          <div style={{ background: "#FFF", borderRadius: 16, border: "1px solid #F3F4F6", padding: "20px" }}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 14 }}>
              <span style={{ fontSize: 14, fontWeight: 700, color: "#111827" }}>Team Mood</span>
              <MoreHorizontal size={16} style={{ color: "#9CA3AF", cursor: "pointer" }} />
            </div>
            <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
              <div style={{ width: 80, height: 80, borderRadius: 12, overflow: "hidden", flexShrink: 0, position: "relative" }}>
                <Image src="/brand/report/mood-boy.png" alt="Mood" fill style={{ objectFit: "cover" }} />
              </div>
              <div>
                <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                  <div style={{ width: 36, height: 36, borderRadius: "50%", background: "#F0FDF4", border: "2px solid #D1FAE5", display: "flex", alignItems: "center", justifyContent: "center" }}>
                    <span style={{ fontSize: 18 }}>😊</span>
                  </div>
                  <div>
                    <p style={{ fontSize: 20, fontWeight: 800, color: "#111827", margin: 0, fontFamily: "var(--font-jakarta)" }}>{moodScore.toFixed(1)}</p>
                    <p style={{ fontSize: 11, color: "#6B7280", margin: 0 }}>{moodLabel}</p>
                  </div>
                </div>
                <div style={{ display: "flex", alignItems: "center", gap: 4, marginTop: 8 }}>
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#10B981" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                    <polyline points="18 15 12 9 6 15"/>
                  </svg>
                  <span style={{ fontSize: 11, color: "#10B981", fontWeight: 600 }}>8% vs yesterday</span>
                </div>
              </div>
            </div>
          </div>

          </div>{/* end sm 2-col grid */}

          {/* Quick Insights */}
          <div style={{ background: "#FFF", borderRadius: 16, border: "1px solid #F3F4F6", padding: "20px" }}>
            <span style={{ fontSize: 14, fontWeight: 700, color: "#111827", display: "block", marginBottom: 16 }}>Quick Insights</span>
            <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
              {[
                { label: "Completed Tasks", value: topPerformers.length > 0 ? topPerformers.length * 4 + 8 : 24, color: "#10B981", path: SPARK_PATHS[0], icon: "✅" },
                { label: "Pending Approvals", value: notUpdatedMembers.length + 3, color: "#F59E0B", path: SPARK_PATHS[1], icon: "🟧" },
                { label: "Meetings Attended", value: presentCount > 0 ? Math.max(1, presentCount - 1) : 5, color: "#8B5CF6", path: SPARK_PATHS[2], icon: "📅" },
                { label: "Upcoming Tasks", value: totalActiveTasks, color: "#3B82F6", path: SPARK_PATHS[3], icon: "📋" },
              ].map(({ label, value, color, path, icon }) => (
                <div key={label} style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                    <span style={{ fontSize: 13 }}>{icon}</span>
                    <div>
                      <p style={{ fontSize: 12, color: "#374151", margin: 0, fontWeight: 500 }}>{label}</p>
                    </div>
                  </div>
                  <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                    <svg width="60" height="20" viewBox="0 0 80 20" fill="none">
                      <path d={path} stroke={color} strokeWidth="2" strokeLinecap="round" fill="none" />
                    </svg>
                    <span style={{ fontSize: 13, fontWeight: 700, color: "#111827", minWidth: 24, textAlign: "right" }}>
                      {String(value).padStart(2, "0")}
                    </span>
                  </div>
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
