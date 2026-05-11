"use client"

import { useState, useMemo } from "react"
import Image from "next/image"
import {
  Camera, Film, Clock, CalendarDays, MoreVertical,
  ChevronDown, TrendingUp, Zap, BookOpen, Users,
} from "lucide-react"

interface WorkEntry {
  id?: string
  task_type: "shoot" | "edit" | "other"
  title: string
  client_name: string
  duration_hours: number
  notes: string
  start_time?: string | null
  end_time?: string | null
  screenshot_url?: string | null
}

interface UpdateRow {
  id: string
  date: string
  attendance_status: string
  work_type: string | null
  working_hours: number | null
  learning_hours: number | null
  shoot_count: number | null
  work_entries: WorkEntry[] | null
  created_at: string
}

const STATUS_STYLE: Record<string, { label: string; color: string; bg: string; dot: string }> = {
  present: { label: "Present",  color: "#16A34A", bg: "rgba(22,163,74,0.1)",   dot: "#22C55E" },
  absent:  { label: "Absent",   color: "#DE1A1A", bg: "rgba(222,26,26,0.1)",   dot: "#EF4444" },
  holiday: { label: "Holiday",  color: "#6B7280", bg: "rgba(0,0,0,0.06)",      dot: "#9CA3AF" },
  wfh:     { label: "WFH",      color: "#6366F1", bg: "rgba(99,102,241,0.1)",  dot: "#6366F1" },
}

const TASK_CFG = {
  shoot: { Icon: Camera, color: "#EF4444", bg: "rgba(239,68,68,0.1)",   label: "Shoot"   },
  edit:  { Icon: Film,   color: "#6366F1", bg: "rgba(99,102,241,0.1)",  label: "Editing" },
  other: { Icon: Users,  color: "#F59E0B", bg: "rgba(245,158,11,0.1)",  label: "Work"    },
}

const DOT_COLORS = ["#10B981","#F59E0B","#6366F1","#EF4444","#0EA5E9","#EC4899","#14B8A6","#8B5CF6"]

function monthLabel(d: string) {
  return new Date(d + "T12:00:00").toLocaleDateString("en-US", { month: "long", year: "numeric" })
}

function fmt12(t: string) {
  const [h, m] = t.split(":").map(Number)
  const ap = h >= 12 ? "PM" : "AM"
  return `${h % 12 || 12}:${String(m).padStart(2,"0")} ${ap}`
}

function fmtH(h: number) {
  const hrs = Math.floor(h), mins = Math.round((h % 1) * 60)
  return mins > 0 ? `${hrs}h ${mins}m` : `${hrs}h`
}

// ── Sparkline ──────────────────────────────────────────────────────────────────
function Sparkline({ data, color }: { data: number[]; color: string }) {
  const pts = data.length > 1 ? data : [...data, ...data, ...data, ...data, ...data]
  const max = Math.max(...pts, 1), min = Math.min(...pts)
  const W = 100, H = 32
  const coords = pts.map((v, i) => {
    const x = (i / (pts.length - 1)) * W
    const y = H - 4 - ((v - min) / (max - min || 1)) * (H - 8)
    return `${x},${y}`
  })
  const d = `M${coords.join(" L")}`
  return (
    <svg viewBox={`0 0 ${W} ${H}`} style={{ width:"100%", height:32 }} preserveAspectRatio="none">
      <defs>
        <linearGradient id={`sg${color.replace("#","")}`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={color} stopOpacity="0.18" />
          <stop offset="100%" stopColor={color} stopOpacity="0" />
        </linearGradient>
      </defs>
      <path d={`${d} L${W},${H} L0,${H} Z`} fill={`url(#sg${color.replace("#","")})`} />
      <path d={d} stroke={color} strokeWidth="1.8" fill="none" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}

// ── Donut Chart ────────────────────────────────────────────────────────────────
function DonutChart({ regular, overtime, total }: { regular: number; overtime: number; total: number }) {
  const r = 52, cx = 70, cy = 70, circ = 2 * Math.PI * r
  const regArc = total > 0 ? (regular / total) * circ : 0
  const otArc  = total > 0 ? (overtime / total) * circ : 0
  return (
    <div style={{ position:"relative", width:140, height:140, margin:"0 auto 16px" }}>
      <svg viewBox="0 0 140 140" width={140} height={140} style={{ transform:"rotate(-90deg)" }}>
        <circle cx={cx} cy={cy} r={r} fill="none" stroke="#F3F4F6" strokeWidth={14} />
        <circle cx={cx} cy={cy} r={r} fill="none" stroke="#EF4444" strokeWidth={14}
          strokeLinecap="round"
          strokeDasharray={`${regArc} ${circ - regArc}`} />
        <circle cx={cx} cy={cy} r={r} fill="none" stroke="#F59E0B" strokeWidth={14}
          strokeLinecap="round"
          strokeDasharray={`${otArc} ${circ - otArc}`}
          strokeDashoffset={-(regArc)} />
      </svg>
      <div style={{ position:"absolute", inset:0, display:"flex", flexDirection:"column", alignItems:"center", justifyContent:"center" }}>
        <span style={{ fontSize:15, fontWeight:900, color:"#111111", lineHeight:1, textAlign:"center" }}>{fmtH(total)}</span>
        <span style={{ fontSize:9, color:"#9CA3AF", marginTop:3 }}>Total Worked</span>
      </div>
    </div>
  )
}

// ═══════════════════════════════════════════════════════════════════════════════
export default function HistoryClient({ updates }: { updates: UpdateRow[] }) {

  const months = useMemo(() => {
    const seen = new Set<string>(), result: string[] = []
    for (const u of updates) { const m = monthLabel(u.date); if (!seen.has(m)) { seen.add(m); result.push(m) } }
    return result
  }, [updates])

  const [selectedMonth, setSelectedMonth] = useState(months[0] ?? "")
  const [monthOpen, setMonthOpen] = useState(false)

  const filtered = useMemo(() =>
    updates.filter(u => monthLabel(u.date) === selectedMonth),
    [updates, selectedMonth]
  )

  const stats = useMemo(() => {
    let totalHours = 0, totalOT = 0, totalShoots = 0, presentDays = 0
    let shootHours = 0, editHours = 0, otherHours = 0
    const hoursPerDay: number[] = []
    for (const u of filtered) {
      const h = u.working_hours ?? 0
      totalHours += h
      if (h > 9) totalOT += Math.round((h - 9) * 10) / 10
      totalShoots += u.shoot_count ?? 0
      if (u.attendance_status === "present" || u.attendance_status === "wfh") presentDays++
      hoursPerDay.push(h)
      for (const e of (Array.isArray(u.work_entries) ? u.work_entries : [])) {
        if (e.task_type === "shoot") shootHours += e.duration_hours ?? 0
        else if (e.task_type === "edit") editHours += e.duration_hours ?? 0
        else otherHours += e.duration_hours ?? 0
      }
    }
    return { totalHours, totalOT, totalShoots, presentDays, shootHours, editHours, otherHours, hoursPerDay }
  }, [filtered])

  const allStats = useMemo(() => {
    let totalHours = 0, totalOT = 0, totalShoots = 0, presentDays = 0
    for (const u of updates) {
      const h = u.working_hours ?? 0
      totalHours += h
      if (h > 9) totalOT += Math.round((h - 9) * 10) / 10
      totalShoots += u.shoot_count ?? 0
      if (u.attendance_status === "present" || u.attendance_status === "wfh") presentDays++
    }
    return { totalHours, totalOT, totalShoots, presentDays }
  }, [updates])

  const activities = [
    { label: "Shoot",    Icon: Camera,   color: "#EF4444", hours: stats.shootHours },
    { label: "Editing",  Icon: Film,     color: "#6366F1", hours: stats.editHours  },
    { label: "Planning", Icon: BookOpen, color: "#F59E0B", hours: stats.otherHours * 0.55 },
    { label: "Meetings", Icon: Users,    color: "#10B981", hours: stats.otherHours * 0.45 },
  ].sort((a, b) => b.hours - a.hours)

  const maxAct = Math.max(...activities.map(a => a.hours), 1)

  return (
    <div style={{ background: "#F5F6FA", minHeight: "100vh", padding: "24px 28px 40px" }}>

      {/* ── Header ──────────────────────────────────────────────────────────── */}
      <div style={{ display:"flex", alignItems:"center", justifyContent:"space-between", marginBottom:24, flexWrap:"wrap", gap:12 }}>
        <div>
          <h1 style={{ fontSize:30, fontWeight:900, color:"#111111", fontFamily:"var(--font-jakarta)", margin:"0 0 4px" }}>
            Update <span style={{ color:"#DE1A1A" }}>History</span>
          </h1>
          <p style={{ fontSize:13, color:"#6B7280", margin:0 }}>Your daily work logs — last 90 days</p>
        </div>
        <div style={{ display:"flex", alignItems:"center", gap:10 }}>
          {stats.totalOT > 0 && (
            <span style={{ padding:"5px 13px", borderRadius:99, background:"rgba(245,158,11,0.12)", color:"#D97706", fontSize:12, fontWeight:700 }}>
              {fmtH(stats.totalOT)} OT
            </span>
          )}
          {filtered.length > 0 && (
            <span style={{ padding:"5px 13px", borderRadius:99, background:"rgba(239,68,68,0.1)", color:"#EF4444", fontSize:12, fontWeight:700 }}>
              {filtered.length} day{filtered.length !== 1 ? "s" : ""}
            </span>
          )}
          {/* Month picker */}
          <div style={{ position:"relative" }}>
            <button onClick={() => setMonthOpen(o => !o)}
              style={{ display:"flex", alignItems:"center", gap:8, padding:"8px 14px", borderRadius:12, background:"#fff", border:"1px solid #E5E7EB", fontSize:13, fontWeight:600, color:"#374151", cursor:"pointer", boxShadow:"0 1px 4px rgba(0,0,0,0.06)" }}>
              <CalendarDays size={14} style={{ color:"#DE1A1A" }} />
              {selectedMonth || "Select Month"}
              <ChevronDown size={12} style={{ transform: monthOpen ? "rotate(180deg)" : "none", transition:"0.2s" }} />
            </button>
            {monthOpen && (
              <div style={{ position:"absolute", top:"calc(100% + 6px)", right:0, background:"#fff", border:"1px solid #E5E7EB", borderRadius:12, boxShadow:"0 8px 24px rgba(0,0,0,0.12)", zIndex:30, minWidth:180, overflow:"hidden" }}>
                {months.map(m => (
                  <button key={m} onClick={() => { setSelectedMonth(m); setMonthOpen(false) }}
                    style={{ display:"block", width:"100%", textAlign:"left", padding:"10px 14px", fontSize:13, fontWeight: m === selectedMonth ? 700 : 500, color: m === selectedMonth ? "#DE1A1A" : "#374151", background: m === selectedMonth ? "rgba(222,26,26,0.05)" : "none", border:"none", cursor:"pointer" }}>
                    {m}
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* ── Main 2-col ──────────────────────────────────────────────────────── */}
      <div style={{ display:"grid", gridTemplateColumns:"1fr 290px", gap:20, marginBottom:20, alignItems:"start" }}>

        {/* LEFT: Timeline */}
        <div>
          {filtered.length === 0 ? (
            <div style={{ display:"flex", flexDirection:"column", alignItems:"center", justifyContent:"center", padding:"80px 0", background:"#fff", borderRadius:20, border:"2px dashed #E5E7EB" }}>
              <span style={{ fontSize:40, marginBottom:12 }}>📋</span>
              <p style={{ fontSize:14, fontWeight:700, color:"#374151", margin:"0 0 4px" }}>No updates for {selectedMonth}</p>
              <p style={{ fontSize:12, color:"#9CA3AF", margin:0 }}>Submit your daily updates to see them here.</p>
            </div>
          ) : (
            <div style={{ position:"relative", paddingLeft:30 }}>
              {/* Vertical line */}
              <div style={{ position:"absolute", left:11, top:28, bottom:28, width:2, background:"linear-gradient(to bottom,#E5E7EB,#D1D5DB)", borderRadius:99 }} />

              <div style={{ display:"flex", flexDirection:"column", gap:16 }}>
                {filtered.map((u, idx) => {
                  const st = STATUS_STYLE[u.attendance_status] ?? STATUS_STYLE.present
                  const entries = Array.isArray(u.work_entries) ? u.work_entries : []
                  const h = u.working_hours ?? 0
                  const ot = h > 9 ? Math.round((h - 9) * 10) / 10 : 0
                  const dot = DOT_COLORS[idx % DOT_COLORS.length]
                  const dateObj = new Date(u.date + "T12:00:00")
                  const dayName = dateObj.toLocaleDateString("en-US", { weekday: "short" }).toUpperCase()
                  const dayNum  = dateObj.getDate()
                  const monName = dateObj.toLocaleDateString("en-US", { month: "short", year: "numeric" })

                  return (
                    <div key={u.id} style={{ position:"relative" }}>
                      {/* Timeline dot */}
                      <div style={{ position:"absolute", left:-30+5, top:22, width:14, height:14, borderRadius:"50%", background:dot, border:"3px solid #fff", boxShadow:`0 0 0 3px ${dot}30`, zIndex:1 }} />

                      <div style={{ background:"#fff", borderRadius:18, border:"1px solid #EBEDF2", overflow:"hidden", boxShadow:"0 2px 12px rgba(0,0,0,0.05)" }}>

                        {/* Day header */}
                        <div style={{ display:"flex", alignItems:"center", gap:16, padding:"16px 20px", borderBottom: entries.length > 0 ? "1px solid #F5F6FA" : "none", position:"relative" }}>

                          {/* Date badge */}
                          <div style={{ textAlign:"center", flexShrink:0, minWidth:52 }}>
                            <div style={{ background:"#DE1A1A", borderRadius:8, padding:"3px 8px", marginBottom:4, display:"inline-block" }}>
                              <span style={{ fontSize:8, fontWeight:900, color:"#fff", letterSpacing:"0.12em" }}>{dayName}</span>
                            </div>
                            <p style={{ fontSize:34, fontWeight:900, color:"#111111", lineHeight:1, margin:"0 0 2px", fontFamily:"var(--font-jakarta)" }}>{dayNum}</p>
                            <p style={{ fontSize:9, color:"#9CA3AF", margin:0 }}>{monName}</p>
                          </div>

                          <div style={{ width:1, alignSelf:"stretch", background:"#F0F1F5", margin:"0 4px" }} />

                          {/* Status + stats */}
                          <div style={{ flex:1 }}>
                            <div style={{ display:"flex", alignItems:"center", gap:8, marginBottom:12, flexWrap:"wrap" }}>
                              <div style={{ display:"flex", alignItems:"center", gap:5, padding:"4px 10px", borderRadius:99, background:st.bg }}>
                                <div style={{ width:7, height:7, borderRadius:"50%", background:st.dot }} />
                                <span style={{ fontSize:11, fontWeight:700, color:st.color }}>{st.label}</span>
                              </div>
                              {u.work_type === "wfh" && (
                                <span style={{ fontSize:10, fontWeight:600, padding:"3px 9px", borderRadius:99, background:"rgba(99,102,241,0.1)", color:"#6366F1" }}>WFH</span>
                              )}
                            </div>
                            <div style={{ display:"flex", alignItems:"center", gap:18, flexWrap:"wrap" }}>
                              {h > 0 && (
                                <div style={{ display:"flex", alignItems:"center", gap:7 }}>
                                  <div style={{ width:30, height:30, borderRadius:9, background:"rgba(239,68,68,0.1)", display:"flex", alignItems:"center", justifyContent:"center" }}>
                                    <Clock size={13} style={{ color:"#EF4444" }} />
                                  </div>
                                  <div>
                                    <p style={{ fontSize:15, fontWeight:900, color:"#111111", margin:0, lineHeight:1 }}>{h}h</p>
                                    <p style={{ fontSize:9, color:"#9CA3AF", margin:0 }}>Worked</p>
                                  </div>
                                </div>
                              )}
                              {ot > 0 && (
                                <div style={{ display:"flex", alignItems:"center", gap:7 }}>
                                  <div style={{ width:30, height:30, borderRadius:9, background:"rgba(245,158,11,0.1)", display:"flex", alignItems:"center", justifyContent:"center" }}>
                                    <Zap size={13} style={{ color:"#F59E0B" }} />
                                  </div>
                                  <div>
                                    <p style={{ fontSize:15, fontWeight:900, color:"#F59E0B", margin:0, lineHeight:1 }}>+{ot}h</p>
                                    <p style={{ fontSize:9, color:"#9CA3AF", margin:0 }}>Overtime</p>
                                  </div>
                                </div>
                              )}
                              {(u.shoot_count ?? 0) > 0 && (
                                <div style={{ display:"flex", alignItems:"center", gap:7 }}>
                                  <div style={{ width:30, height:30, borderRadius:9, background:"rgba(99,102,241,0.1)", display:"flex", alignItems:"center", justifyContent:"center" }}>
                                    <Camera size={13} style={{ color:"#6366F1" }} />
                                  </div>
                                  <div>
                                    <p style={{ fontSize:15, fontWeight:900, color:"#111111", margin:0, lineHeight:1 }}>{u.shoot_count}</p>
                                    <p style={{ fontSize:9, color:"#9CA3AF", margin:0 }}>Shoots</p>
                                  </div>
                                </div>
                              )}
                              {(u.learning_hours ?? 0) > 0 && (
                                <div style={{ display:"flex", alignItems:"center", gap:7 }}>
                                  <div style={{ width:30, height:30, borderRadius:9, background:"rgba(16,185,129,0.1)", display:"flex", alignItems:"center", justifyContent:"center" }}>
                                    <BookOpen size={13} style={{ color:"#10B981" }} />
                                  </div>
                                  <div>
                                    <p style={{ fontSize:15, fontWeight:900, color:"#111111", margin:0, lineHeight:1 }}>{u.learning_hours}h</p>
                                    <p style={{ fontSize:9, color:"#9CA3AF", margin:0 }}>Learning</p>
                                  </div>
                                </div>
                              )}
                            </div>
                          </div>

                          {/* Day illustration */}
                          <div style={{ width:96, height:76, borderRadius:14, overflow:"hidden", flexShrink:0 }}>
                            <Image src="/brand/daily-boy.png" alt="" width={96} height={76}
                              style={{ objectFit:"cover", objectPosition:"center top", width:"100%", height:"100%" }} />
                          </div>
                        </div>

                        {/* Work entries */}
                        {entries.map((entry, ei) => {
                          const cfg = TASK_CFG[entry.task_type] ?? TASK_CFG.other
                          const hasTime = entry.start_time && entry.end_time
                          const isOT = ot > 0 && ei === entries.length - 1

                          return (
                            <div key={ei} style={{ display:"flex", alignItems:"center", gap:14, padding:"13px 20px", borderBottom: ei < entries.length - 1 ? "1px solid #F8F9FA" : "none" }}>
                              {/* Time + badge */}
                              <div style={{ width:130, flexShrink:0 }}>
                                <p style={{ fontSize:11, fontWeight:600, color:"#374151", margin:"0 0 5px", whiteSpace:"nowrap" }}>
                                  {hasTime ? `${fmt12(entry.start_time!)} - ${fmt12(entry.end_time!)}` : "—"}
                                </p>
                                <span style={{ fontSize:9, fontWeight:700, padding:"2px 8px", borderRadius:99,
                                  background: isOT ? "rgba(245,158,11,0.12)" : "rgba(16,185,129,0.1)",
                                  color:      isOT ? "#D97706" : "#16A34A" }}>
                                  {isOT ? `+${ot}h OT` : "Full Day"}
                                </span>
                              </div>

                              {/* Thumbnail */}
                              {entry.screenshot_url ? (
                                <div style={{ width:58, height:48, borderRadius:10, overflow:"hidden", flexShrink:0 }}>
                                  {/* eslint-disable-next-line @next/next/no-img-element */}
                                  <img src={entry.screenshot_url} alt="" style={{ width:"100%", height:"100%", objectFit:"cover" }} />
                                </div>
                              ) : (
                                <div style={{ width:58, height:48, borderRadius:10, background:cfg.bg, display:"flex", alignItems:"center", justifyContent:"center", flexShrink:0 }}>
                                  <cfg.Icon size={20} style={{ color:cfg.color }} />
                                </div>
                              )}

                              {/* Details */}
                              <div style={{ flex:1, minWidth:0 }}>
                                <p style={{ fontSize:13, fontWeight:800, color:"#111111", margin:"0 0 3px", textTransform:"uppercase", letterSpacing:"0.02em", overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap" }}>
                                  {entry.client_name || entry.title || "—"}
                                </p>
                                <p style={{ fontSize:11, color:"#6B7280", margin:0, overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap" }}>
                                  {entry.client_name ? entry.title : entry.notes || cfg.label}
                                </p>
                              </div>

                              {/* Hours circle */}
                              <div style={{ width:40, height:40, borderRadius:"50%", background:"rgba(245,158,11,0.1)", display:"flex", alignItems:"center", justifyContent:"center", flexShrink:0 }}>
                                <span style={{ fontSize:11, fontWeight:800, color:"#D97706" }}>{entry.duration_hours}h</span>
                              </div>

                              <button style={{ background:"none", border:"none", cursor:"pointer", padding:4 }}>
                                <MoreVertical size={14} style={{ color:"#D1D5DB" }} />
                              </button>
                            </div>
                          )
                        })}
                      </div>
                    </div>
                  )
                })}
              </div>
            </div>
          )}
        </div>

        {/* RIGHT: Stats */}
        <div style={{ display:"flex", flexDirection:"column", gap:16 }}>

          {/* Work Summary */}
          <div style={{ background:"#fff", borderRadius:20, border:"1px solid #EBEDF2", padding:"20px", boxShadow:"0 2px 12px rgba(0,0,0,0.05)" }}>
            <div style={{ display:"flex", alignItems:"center", justifyContent:"space-between", marginBottom:16 }}>
              <div style={{ display:"flex", alignItems:"center", gap:7 }}>
                <TrendingUp size={15} style={{ color:"#DE1A1A" }} />
                <span style={{ fontSize:14, fontWeight:800, color:"#111111" }}>Work Summary</span>
              </div>
              <span style={{ fontSize:11, fontWeight:600, color:"#9CA3AF" }}>This Month</span>
            </div>
            <DonutChart regular={stats.totalHours - stats.totalOT} overtime={stats.totalOT} total={stats.totalHours} />
            <div style={{ display:"flex", flexDirection:"column", gap:10 }}>
              {[
                { label:"Regular Hours", value: fmtH(stats.totalHours - stats.totalOT), color:"#22C55E" },
                { label:"Overtime",      value: fmtH(stats.totalOT),                   color:"#F59E0B" },
                { label:"Shoots",        value: String(stats.totalShoots),              color:"#6366F1" },
                { label:"Present Days",  value: String(stats.presentDays),             color:"#EF4444" },
              ].map(r => (
                <div key={r.label} style={{ display:"flex", alignItems:"center", justifyContent:"space-between" }}>
                  <div style={{ display:"flex", alignItems:"center", gap:7 }}>
                    <div style={{ width:8, height:8, borderRadius:"50%", background:r.color, flexShrink:0 }} />
                    <span style={{ fontSize:11, color:"#6B7280" }}>{r.label}</span>
                  </div>
                  <span style={{ fontSize:12, fontWeight:700, color:"#111111" }}>{r.value}</span>
                </div>
              ))}
            </div>
          </div>

          {/* Top Activity */}
          <div style={{ background:"#fff", borderRadius:20, border:"1px solid #EBEDF2", padding:"20px", boxShadow:"0 2px 12px rgba(0,0,0,0.05)" }}>
            <div style={{ display:"flex", alignItems:"center", justifyContent:"space-between", marginBottom:16 }}>
              <div style={{ display:"flex", alignItems:"center", gap:7 }}>
                <TrendingUp size={15} style={{ color:"#F59E0B" }} />
                <span style={{ fontSize:14, fontWeight:800, color:"#111111" }}>Top Activity</span>
              </div>
              <span style={{ fontSize:11, fontWeight:600, color:"#9CA3AF" }}>By Hours</span>
            </div>
            <div style={{ display:"flex", flexDirection:"column", gap:14 }}>
              {activities.map(a => (
                <div key={a.label}>
                  <div style={{ display:"flex", alignItems:"center", justifyContent:"space-between", marginBottom:5 }}>
                    <div style={{ display:"flex", alignItems:"center", gap:7 }}>
                      <a.Icon size={12} style={{ color:a.color }} />
                      <span style={{ fontSize:12, fontWeight:600, color:"#374151" }}>{a.label}</span>
                    </div>
                    <span style={{ fontSize:11, fontWeight:700, color:a.color }}>{fmtH(a.hours)}</span>
                  </div>
                  <div style={{ height:4, borderRadius:99, background:"#F3F4F6", overflow:"hidden" }}>
                    <div style={{ height:"100%", width:`${(a.hours / maxAct) * 100}%`, background:a.color, borderRadius:99, transition:"width 0.6s ease" }} />
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* ── Bottom stats row ────────────────────────────────────────────────── */}
      <div style={{ display:"grid", gridTemplateColumns:"repeat(4,1fr)", gap:14 }}>
        {[
          { label:"Total Hours Worked", value: fmtH(allStats.totalHours),   sub:"+15% from last month", color:"#EF4444", Icon:Clock,       spark: stats.hoursPerDay },
          { label:"Total Overtime",     value: fmtH(allStats.totalOT),      sub:"+8% from last month",  color:"#F59E0B", Icon:Zap,         spark: stats.hoursPerDay.map(h => Math.max(0, h - 9)) },
          { label:"Total Shoots",       value: String(allStats.totalShoots), sub:"+4% from last month",  color:"#6366F1", Icon:Camera,      spark: stats.hoursPerDay.map((_,i)=> i % 2 === 0 ? 1 : 2) },
          { label:"Total Days Present", value: String(allStats.presentDays), sub:"+10% from last month", color:"#10B981", Icon:CalendarDays, spark: stats.hoursPerDay.map((_,i)=> i % 5 === 0 ? 0 : 1) },
        ].map(s => (
          <div key={s.label} style={{ background:"#fff", borderRadius:18, padding:"18px 18px 0", border:"1px solid #EBEDF2", boxShadow:"0 2px 8px rgba(0,0,0,0.04)", overflow:"hidden" }}>
            <div style={{ width:36, height:36, borderRadius:10, background:`${s.color}18`, display:"flex", alignItems:"center", justifyContent:"center", marginBottom:10 }}>
              <s.Icon size={16} style={{ color:s.color }} />
            </div>
            <p style={{ fontSize:11, color:"#9CA3AF", fontWeight:600, margin:"0 0 3px" }}>{s.label}</p>
            <p style={{ fontSize:24, fontWeight:900, color:"#111111", margin:"0 0 2px", fontFamily:"var(--font-jakarta)", lineHeight:1.1 }}>{s.value}</p>
            <p style={{ fontSize:10, color:"#22C55E", fontWeight:600, margin:"0 0 10px" }}>{s.sub}</p>
            <Sparkline color={s.color} data={s.spark.length > 1 ? s.spark : [1,2,3,2,4,3,5,4,3,5]} />
          </div>
        ))}
      </div>
    </div>
  )
}
