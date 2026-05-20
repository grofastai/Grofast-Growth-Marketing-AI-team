"use client"

import { useState, useMemo } from "react"
import { useRouter } from "next/navigation"
import { deleteDailyUpdate } from "@/lib/actions/daily-updates"
import Image from "next/image"
import {
  Camera, Film, Clock, CalendarDays,
  TrendingUp, Zap, BookOpen, Users,
  CheckCircle2, Search, Trash2,
  ArrowRight, Flame, Star, X,
} from "lucide-react"

interface WorkEntry {
  id?: string; task_type: "shoot" | "edit" | "other"
  title: string; client_name: string; duration_hours: number
  notes: string; start_time?: string | null; end_time?: string | null
  screenshot_url?: string | null
  description?: string | null; project_name?: string | null
}
interface UpdateRow {
  id: string; date: string; attendance_status: string
  work_type: string | null; working_hours: number | null
  learning_hours: number | null; shoot_count: number | null
  work_entries: WorkEntry[] | null; created_at: string
}

const STATUS_STYLE: Record<string, { label: string; color: string; bg: string; dot: string }> = {
  present: { label:"Present",  color:"#16A34A", bg:"rgba(22,163,74,0.12)",  dot:"#22C55E" },
  absent:  { label:"Absent",   color:"#DE1A1A", bg:"rgba(222,26,26,0.1)",   dot:"#EF4444" },
  holiday: { label:"Holiday",  color:"#6B7280", bg:"rgba(0,0,0,0.06)",      dot:"#9CA3AF" },
  wfh:     { label:"WFH",      color:"#6366F1", bg:"rgba(99,102,241,0.1)",  dot:"#6366F1" },
}
const TASK_CFG = {
  shoot: { Icon: Camera,   color:"#EF4444", bg:"rgba(239,68,68,0.1)",   label:"Shoot"   },
  edit:  { Icon: Film,     color:"#6366F1", bg:"rgba(99,102,241,0.1)",  label:"Editing" },
  other: { Icon: BookOpen, color:"#F59E0B", bg:"rgba(245,158,11,0.1)",  label:"Work"    },
}
const DOT_COLORS = ["#22C55E","#F59E0B","#6366F1","#EF4444","#0EA5E9","#EC4899"]

function monthLabel(d: string) {
  return new Date(d + "T12:00:00").toLocaleDateString("en-US", { month:"long", year:"numeric" })
}
function fmt12(t: string) {
  const [h, m] = t.split(":").map(Number)
  return `${h % 12 || 12}:${String(m).padStart(2,"0")} ${h >= 12 ? "PM":"AM"}`
}
function fmtH(h: number) {
  const hrs = Math.floor(h), mins = Math.round((h % 1) * 60)
  return mins > 0 ? `${hrs}h ${mins}m` : `${hrs}h`
}

// ── Sparkline ──────────────────────────────────────────────────────────────────
function Sparkline({ data, color }: { data: number[]; color: string }) {
  const pts = data.length > 1 ? data : [1,2,3,2,4,3,5,4,3,5]
  const max = Math.max(...pts, 1), min = Math.min(...pts)
  const W = 100, H = 36
  const coords = pts.map((v, i) => {
    const x = (i / (pts.length - 1)) * W
    const y = H - 4 - ((v - min) / (max - min || 1)) * (H - 8)
    return `${x},${y}`
  })
  const d = `M${coords.join(" L")}`
  const id = `sg${color.replace("#","")}`
  return (
    <svg viewBox={`0 0 ${W} ${H}`} style={{ width:"100%", height:36 }} preserveAspectRatio="none">
      <defs>
        <linearGradient id={id} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={color} stopOpacity="0.2"/>
          <stop offset="100%" stopColor={color} stopOpacity="0"/>
        </linearGradient>
      </defs>
      <path d={`${d} L${W},${H} L0,${H} Z`} fill={`url(#${id})`}/>
      <path d={d} stroke={color} strokeWidth="2" fill="none" strokeLinecap="round" strokeLinejoin="round"/>
    </svg>
  )
}

// ── Donut (Work Summary) ───────────────────────────────────────────────────────
function DonutChart({ regular, overtime, tasks, total, label }: {
  regular: number; overtime: number; tasks: number; total: number; label: string
}) {
  const r = 52, cx = 70, cy = 70, circ = 2 * Math.PI * r
  const segs = [
    { v: regular,  color:"#22C55E" },
    { v: overtime, color:"#F59E0B" },
    { v: tasks,    color:"#6366F1" },
  ]
  let off = 0
  return (
    <div style={{ position:"relative", width:140, height:140, margin:"0 auto 16px" }}>
      <svg viewBox="0 0 140 140" width={140} height={140} style={{ transform:"rotate(-90deg)" }}>
        <circle cx={cx} cy={cy} r={r} fill="none" stroke="#F3F4F6" strokeWidth={13}/>
        {total > 0 && segs.map((s, i) => {
          const arc = (s.v / total) * circ
          const el = <circle key={i} cx={cx} cy={cy} r={r} fill="none" stroke={s.color} strokeWidth={13}
            strokeLinecap="butt" strokeDasharray={`${arc - 0.5} ${circ - arc + 0.5}`} strokeDashoffset={-off}/>
          off += arc; return el
        })}
      </svg>
      <div style={{ position:"absolute", inset:0, display:"flex", flexDirection:"column", alignItems:"center", justifyContent:"center" }}>
        <span style={{ fontSize:15, fontWeight:900, color:"#111111", lineHeight:1.1, textAlign:"center" }}>{label}</span>
        <span style={{ fontSize:9, color:"#9CA3AF", marginTop:3 }}>Total Worked</span>
      </div>
    </div>
  )
}

// ── Productivity Ring ──────────────────────────────────────────────────────────
function ProductivityRing({ pct }: { pct: number }) {
  const r = 46, cx = 60, cy = 60, circ = 2 * Math.PI * r
  const arc = (pct / 100) * circ
  const color = pct >= 70 ? "#22C55E" : pct >= 40 ? "#F59E0B" : "#EF4444"
  const lbl   = pct >= 70 ? "Excellent" : pct >= 40 ? "Good" : "Low"
  return (
    <div style={{ display:"flex", alignItems:"center", gap:20 }}>
      <div style={{ position:"relative", width:120, height:120, flexShrink:0 }}>
        <svg viewBox="0 0 120 120" width={120} height={120} style={{ transform:"rotate(-90deg)" }}>
          <circle cx={cx} cy={cy} r={r} fill="none" stroke="#F3F4F6" strokeWidth={11}/>
          <circle cx={cx} cy={cy} r={r} fill="none" stroke={color} strokeWidth={11}
            strokeLinecap="round"
            strokeDasharray={`${arc} ${circ - arc}`}
            style={{ transition:"stroke-dasharray 0.7s ease" }}/>
        </svg>
        <div style={{ position:"absolute", inset:0, display:"flex", flexDirection:"column", alignItems:"center", justifyContent:"center" }}>
          <span style={{ fontSize:22, fontWeight:900, color:"#111111", lineHeight:1 }}>{pct}%</span>
          <span style={{ fontSize:9, color:color, fontWeight:700, marginTop:3 }}>{lbl}</span>
        </div>
      </div>
      <div style={{ flex:1 }}>
        <p style={{ fontSize:14, fontWeight:800, color:"#111111", margin:"0 0 6px" }}>You&apos;re doing great!</p>
        <p style={{ fontSize:11, color:"#6B7280", margin:"0 0 12px", lineHeight:1.5 }}>Keep up the amazing work and achieve more.</p>
        <button style={{ display:"flex", alignItems:"center", gap:5, background:"none", border:"none", cursor:"pointer", padding:0, fontSize:12, fontWeight:700, color:"#DE1A1A" }}>
          View Insights <ArrowRight size={12}/>
        </button>
      </div>
    </div>
  )
}

// ═══════════════════════════════════════════════════════════════════════════════
export default function HistoryClient({ updates, userName }: { updates: UpdateRow[]; userName: string }) {

  const months = useMemo(() => {
    const seen = new Set<string>(), result: string[] = []
    for (const u of updates) { const m = monthLabel(u.date); if (!seen.has(m)) { seen.add(m); result.push(m) } }
    return result
  }, [updates])

  const router = useRouter()
  const [deletingId, setDeletingId] = useState<string | null>(null)

  const [selectedMonth, setSelectedMonth] = useState("")
  const [search, setSearch]               = useState("")
  const [selectedDate, setSelectedDate]   = useState("")

  async function handleDelete(id: string) {
    if (!confirm("Delete this day's submission? This cannot be undone.")) return
    setDeletingId(id)
    const result = await deleteDailyUpdate(id)
    if (result.success) {
      router.refresh()
    } else {
      alert("Failed to delete: " + result.error)
    }
    setDeletingId(null)
  }

  // All updates in selected month (empty string = all months)
  const monthFiltered = useMemo(() =>
    selectedMonth === "" ? updates : updates.filter(u => monthLabel(u.date) === selectedMonth),
    [updates, selectedMonth]
  )


  const searchActive = search.trim().length > 0
  const dateActive   = selectedDate.length > 0

  // Filtered updates (by date if active, by search if active)
  const filtered = useMemo(() => {
    let base = monthFiltered
    if (dateActive) base = base.filter(u => u.date === selectedDate)
    if (!searchActive) return base
    const q = search.toLowerCase()
    return base.filter(u => {
      const entries = Array.isArray(u.work_entries) ? u.work_entries : []
      return entries.some(e =>
        (e.title ?? "").toLowerCase().includes(q) ||
        (e.client_name ?? "").toLowerCase().includes(q) ||
        (e.notes ?? "").toLowerCase().includes(q) ||
        (e.description ?? "").toLowerCase().includes(q) ||
        (e.project_name ?? "").toLowerCase().includes(q)
      )
    })
  }, [monthFiltered, search, searchActive, selectedDate, dateActive])

  // Latest day for hero (always from month, not search-filtered)
  const latest = monthFiltered[0] ?? null

  // Stats always use the full month (not search-filtered)
  const stats = useMemo(() => {
    let totalHours = 0, totalOT = 0, totalTasks = 0, presentDays = 0
    let shootH = 0, editH = 0, otherH = 0
    const hoursPerDay: number[] = []
    for (const u of monthFiltered) {
      const h = u.working_hours ?? 0
      totalHours += h; if (h > 9) totalOT += Math.round((h - 9) * 10) / 10
      if (u.attendance_status === "present" || u.attendance_status === "wfh") presentDays++
      hoursPerDay.push(h)
      const entries = Array.isArray(u.work_entries) ? u.work_entries : []
      totalTasks += entries.length
      for (const e of entries) {
        if (e.task_type === "shoot") shootH += e.duration_hours ?? 0
        else if (e.task_type === "edit") editH += e.duration_hours ?? 0
        else otherH += e.duration_hours ?? 0
      }
    }
    const productivity = filtered.length > 0
      ? Math.min(100, Math.round((presentDays / filtered.length) * 100 * 0.6 + (totalHours > 0 ? Math.min(40, (totalHours / (filtered.length * 9)) * 40) : 0)))
      : 0
    return { totalHours, totalOT, totalTasks, presentDays, shootH, editH, otherH, hoursPerDay, productivity }
  }, [filtered])

  // Streak calculation
  const { streak, last7 } = useMemo(() => {
    const submitted = new Set(updates.map(u => u.date))
    let count = 0
    const d = new Date()
    // eslint-disable-next-line no-constant-condition
    while (true) {
      const ds = d.toISOString().split("T")[0]
      if (submitted.has(ds)) { count++; d.setDate(d.getDate() - 1) } else break
    }
    const days = ["S","M","T","W","T","F","S"]
    const last7 = Array.from({ length:7 }, (_, i) => {
      const dt = new Date(); dt.setDate(dt.getDate() - 6 + i)
      return { lbl: days[dt.getDay()], done: submitted.has(dt.toISOString().split("T")[0]) }
    })
    return { streak: count, last7 }
  }, [updates])

  // Top activity
  const topActivity = useMemo(() => {
    const map: Record<string, number> = {}
    for (const u of filtered) {
      for (const e of (Array.isArray(u.work_entries) ? u.work_entries : [])) {
        const k = e.client_name || e.title || "Internal"
        map[k] = (map[k] ?? 0) + (e.duration_hours ?? 0)
      }
    }
    const top = Object.entries(map).sort((a, b) => b[1] - a[1])[0]
    return top ? { name: top[0], hours: top[1] } : null
  }, [filtered])

  const monthDays = filtered.length

  const now = new Date()
  const greeting = now.getHours() < 12 ? "Good Morning" : now.getHours() < 17 ? "Good Afternoon" : "Good Evening"
  const fn = userName.split(" ")[0] || "there"

  // Latest day stats
  const latestH  = latest?.working_hours ?? 0
  const latestOT = latestH > 9 ? Math.round((latestH - 9) * 10) / 10 : 0
  const latestTasks = latest ? (Array.isArray(latest.work_entries) ? latest.work_entries : []).length : 0
  const latestSt = latest ? (STATUS_STYLE[latest.attendance_status] ?? STATUS_STYLE.present) : STATUS_STYLE.present


  return (
    <div style={{ background:"#F8F9FC", minHeight:"100vh", padding:"0" }}>

      {/* ── TOPBAR ────────────────────────────────────────────────────────── */}
      <div style={{ background:"#fff", borderBottom:"1px solid #EBEDF2" }} className="px-4 md:px-7 py-3 flex flex-wrap items-center gap-3">
        <div>
          <h1 style={{ fontSize:26, fontWeight:900, color:"#111111", fontFamily:"var(--font-jakarta)", margin:0 }}>
            Update <span style={{ color:"#DE1A1A" }}>History</span>
          </h1>
          <p style={{ fontSize:12, color:"#9CA3AF", margin:0 }}>Your daily work logs — last 90 days</p>
        </div>

        {/* Search */}
        <div style={{ flex:"1 1 200px", maxWidth:340, position:"relative" }}>
          <Search size={14} style={{ position:"absolute", left:12, top:"50%", transform:"translateY(-50%)", color:"#9CA3AF" }}/>
          <input
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Search by task, client, notes…"
            style={{ width:"100%", background:"#F5F6FA", border:"1px solid #EBEDF2", borderRadius:12, padding:"9px 12px 9px 34px", fontSize:13, color:"#374151", outline:"none" }}
          />
        </div>

        <div className="flex flex-wrap items-center gap-3">
          {/* Date picker */}
          <div style={{ display:"flex", alignItems:"center", gap:6, padding:"8px 12px", borderRadius:12, background:"#fff", border: dateActive ? "1.5px solid #DE1A1A" : "1px solid #EBEDF2" }}>
            <CalendarDays size={14} style={{ color: dateActive ? "#DE1A1A" : "#9CA3AF", flexShrink:0 }}/>
            <input
              type="date"
              value={selectedDate}
              onChange={e => setSelectedDate(e.target.value)}
              style={{ border:"none", outline:"none", fontSize:12, fontWeight:600, color: dateActive ? "#DE1A1A" : "#374151", background:"transparent", cursor:"pointer" }}
            />
            {dateActive && (
              <button onClick={() => setSelectedDate("")} style={{ background:"none", border:"none", cursor:"pointer", padding:0, display:"flex" }}>
                <X size={12} style={{ color:"#9CA3AF" }}/>
              </button>
            )}
          </div>
        </div>
      </div>

      {/* ── MONTH PILLS ───────────────────────────────────────────────────── */}
      <div style={{ background:"#fff", borderBottom:"1px solid #EBEDF2" }} className="px-4 md:px-7 py-2.5">
        <div style={{ display:"flex", alignItems:"center", gap:8, overflowX:"auto", paddingBottom:2 }}>
          {/* "All" pill */}
          <button
            onClick={() => { setSelectedMonth(""); setSelectedDate("") }}
            style={{
              padding:"6px 16px", borderRadius:99, fontSize:12, fontWeight:700, cursor:"pointer", whiteSpace:"nowrap", flexShrink:0,
              background: selectedMonth === "" ? "#DE1A1A" : "#F5F6FA",
              color:      selectedMonth === "" ? "#FFFFFF"  : "#6B7280",
              border:     selectedMonth === "" ? "1.5px solid #DE1A1A" : "1.5px solid transparent",
            }}>
            All
          </button>
          {months.map(m => {
            const active = selectedMonth === m
            const shortLabel = new Date(m + " 1").toLocaleDateString("en-US", { month:"short", year:"2-digit" })
            return (
              <button
                key={m}
                onClick={() => { setSelectedMonth(active ? "" : m); setSelectedDate("") }}
                style={{
                  padding:"6px 16px", borderRadius:99, fontSize:12, fontWeight:700, cursor:"pointer", whiteSpace:"nowrap", flexShrink:0,
                  background: active ? "#DE1A1A" : "#F5F6FA",
                  color:      active ? "#FFFFFF"  : "#6B7280",
                  border:     active ? "1.5px solid #DE1A1A" : "1.5px solid transparent",
                }}>
                {shortLabel}
              </button>
            )
          })}
        </div>
      </div>

      <div className="px-4 md:px-7 pb-10 pt-5">
        {/* ── MAIN 2-COL GRID ─────────────────────────────────────────────── */}
        <div className="grid grid-cols-1 lg:grid-cols-[1fr_300px] gap-5 items-start">

          {/* LEFT ── Hero + Entries ──────────────────────────────────────── */}
          <div style={{ display:"flex", flexDirection:"column", gap:16 }}>

            {/* ── HERO BANNER ─────────────────────────────────────────────── */}
            <div style={{ background:"linear-gradient(135deg, #DE1A1A 0%, #8B1212 55%, #1A0808 100%)", borderRadius:22, overflow:"hidden", boxShadow:"0 8px 32px rgba(180,0,0,0.4)", position:"relative", minHeight:240 }}>
              {/* Decorative circles */}
              <div style={{ position:"absolute", top:-50, left:-50, width:220, height:220, borderRadius:"50%", background:"rgba(255,255,255,0.05)", pointerEvents:"none" }}/>
              <div style={{ position:"absolute", bottom:-30, right:200, width:150, height:150, borderRadius:"50%", background:"rgba(255,255,255,0.04)", pointerEvents:"none" }}/>

              {/* Star badge */}
              <div style={{ position:"absolute", left:28, top:22, zIndex:6 }}>
                <span style={{ display:"inline-flex", alignItems:"center", gap:6, fontSize:11, fontWeight:700, padding:"4px 12px", borderRadius:99, background:"rgba(255,255,255,0.15)", color:"#fff", border:"1px solid rgba(255,255,255,0.2)", letterSpacing:"0.04em" }}>
                  ⭐ Update History
                </span>
              </div>

              {/* Background illustration — right 56% */}
              <div style={{ position:"absolute", right:0, top:0, bottom:0, width:"56%", zIndex:1, opacity:0.85 }}>
                <Image
                  src="/brand/history-girl.png"
                  alt=""
                  fill
                  style={{ objectFit:"cover", objectPosition:"center center" }}
                  priority
                />
                {/* Fade left edge to blend with gradient */}
                <div style={{ position:"absolute", left:0, top:0, bottom:0, width:"60%", background:"linear-gradient(to right,#8B1212 0%,rgba(139,18,18,0.5) 50%,transparent 100%)", zIndex:2, pointerEvents:"none" }}/>
              </div>

              {/* Heart icon top-right */}
              <div style={{ position:"absolute", right:20, top:20, zIndex:5, width:36, height:36, borderRadius:"50%", background:"rgba(255,255,255,0.2)", display:"flex", alignItems:"center", justifyContent:"center" }}>
                <span style={{ fontSize:18 }}>❤️</span>
              </div>

              {/* Quote bubble */}
              <div style={{ position:"absolute", right:64, top:22, zIndex:6, background:"#fff", borderRadius:16, padding:"10px 14px 10px 16px", boxShadow:"0 6px 24px rgba(0,0,0,0.3)", maxWidth:180 }}>
                <span style={{ fontSize:16, color:"#6B7280", lineHeight:1, display:"block", marginBottom:2 }}>"</span>
                <p style={{ fontSize:12, fontWeight:600, color:"#374151", margin:"0 0 3px", lineHeight:1.5 }}>Discipline today</p>
                <p style={{ fontSize:12, fontWeight:800, color:"#DE1A1A", margin:"0 0 4px" }}>Success tomorrow.</p>
                <p style={{ fontSize:10, color:"#9CA3AF", margin:0, fontWeight:500 }}>Keep going!</p>
              </div>

              {/* Left content */}
              <div style={{ position:"relative", zIndex:3, padding:"52px 28px 0 28px", maxWidth:"44%" }}>
                <p style={{ fontSize:13, fontWeight:600, color:"rgba(255,255,255,0.7)", margin:"0 0 10px" }}>{greeting}, {fn}! 👋</p>
                <h2 style={{ fontSize:27, fontWeight:900, color:"#fff", margin:"0 0 4px", fontFamily:"var(--font-jakarta)", lineHeight:1.25 }}>
                  Let&apos;s make today
                </h2>
                <h2 style={{ fontSize:27, fontWeight:900, color:"#FACC15", margin:"0 0 18px", fontFamily:"var(--font-jakarta)", lineHeight:1.25 }}>
                  productive &amp; impactful.
                </h2>
                <div style={{ width:48, height:4, background:"linear-gradient(90deg,#FACC15,#fff)", borderRadius:99 }}/>
              </div>

              {/* Stats strip */}
              {latest && (
                <div style={{ position:"relative", zIndex:3, display:"flex", alignItems:"center", gap:10, padding:"20px 28px 24px", flexWrap:"wrap" }}>
                  {latestH > 0 && (
                    <div style={{ display:"flex", alignItems:"center", gap:8, padding:"10px 16px", borderRadius:14, background:"rgba(255,255,255,0.12)", border:"1px solid rgba(255,255,255,0.2)" }}>
                      <Clock size={14} style={{ color:"#FACC15" }}/>
                      <div>
                        <p style={{ fontSize:14, fontWeight:900, color:"#fff", margin:0, lineHeight:1 }}>{fmtH(latestH)}</p>
                        <p style={{ fontSize:9, color:"rgba(255,255,255,0.6)", margin:0 }}>Worked</p>
                      </div>
                    </div>
                  )}
                  {latestOT > 0 && (
                    <div style={{ display:"flex", alignItems:"center", gap:8, padding:"10px 16px", borderRadius:14, background:"rgba(255,255,255,0.12)", border:"1px solid rgba(255,255,255,0.2)" }}>
                      <Zap size={14} style={{ color:"#FACC15" }}/>
                      <div>
                        <p style={{ fontSize:14, fontWeight:900, color:"#FACC15", margin:0, lineHeight:1 }}>+{fmtH(latestOT)}</p>
                        <p style={{ fontSize:9, color:"rgba(255,255,255,0.6)", margin:0 }}>Overtime</p>
                      </div>
                    </div>
                  )}
                  {latestTasks > 0 && (
                    <div style={{ display:"flex", alignItems:"center", gap:8, padding:"10px 16px", borderRadius:14, background:"rgba(255,255,255,0.12)", border:"1px solid rgba(255,255,255,0.2)" }}>
                      <CheckCircle2 size={14} style={{ color:"#6EE7B7" }}/>
                      <div>
                        <p style={{ fontSize:14, fontWeight:900, color:"#fff", margin:0, lineHeight:1 }}>{latestTasks}</p>
                        <p style={{ fontSize:9, color:"rgba(255,255,255,0.6)", margin:0 }}>Tasks Done</p>
                      </div>
                    </div>
                  )}
                  <div style={{ display:"flex", alignItems:"center", gap:6, padding:"10px 16px", borderRadius:14, background:"rgba(255,255,255,0.12)", border:"1px solid rgba(255,255,255,0.2)" }}>
                    <div style={{ width:8, height:8, borderRadius:"50%", background:latestSt.dot }}/>
                    <span style={{ fontSize:12, fontWeight:700, color:"#fff" }}>{latestSt.label}</span>
                  </div>
                </div>
              )}
            </div>

            {/* ── ENTRIES LIST ────────────────────────────────────────────── */}
            {filtered.length === 0 ? (
              <div style={{ background:"#fff", borderRadius:20, border:"1px solid #EBEDF2", padding:"48px 24px", textAlign:"center", boxShadow:"0 2px 10px rgba(0,0,0,0.05)" }}>
                <p style={{ fontSize:36, margin:"0 0 12px" }}>📋</p>
                <p style={{ fontSize:16, fontWeight:800, color:"#111111", margin:"0 0 6px" }}>No entries found</p>
                <p style={{ fontSize:13, color:"#9CA3AF", margin:0 }}>
                  {searchActive || dateActive || selectedMonth ? "Try clearing your filters" : "No daily updates submitted yet"}
                </p>
              </div>
            ) : filtered.map(u => {
              const entries = Array.isArray(u.work_entries) ? u.work_entries : []
              const st = STATUS_STYLE[u.attendance_status] ?? STATUS_STYLE.present
              const dateLabel = new Date(u.date + "T12:00:00").toLocaleDateString("en-US", { weekday:"long", day:"numeric", month:"long", year:"numeric" })
              return (
                <div key={u.id} style={{ background:"#fff", borderRadius:20, border:"1px solid #EBEDF2", overflow:"hidden", boxShadow:"0 2px 10px rgba(0,0,0,0.05)" }}>
                  {/* Day header */}
                  <div style={{ display:"flex", alignItems:"center", justifyContent:"space-between", padding:"14px 18px", borderBottom:"1px solid #F5F6FA", flexWrap:"wrap", gap:8 }}>
                    <div style={{ display:"flex", alignItems:"center", gap:10 }}>
                      <div style={{ width:38, height:38, borderRadius:10, background:"rgba(222,26,26,0.08)", display:"flex", flexDirection:"column", alignItems:"center", justifyContent:"center", flexShrink:0 }}>
                        <span style={{ fontSize:14, fontWeight:900, color:"#DE1A1A", lineHeight:1 }}>
                          {new Date(u.date + "T12:00:00").getDate()}
                        </span>
                        <span style={{ fontSize:8, fontWeight:700, color:"#DE1A1A", textTransform:"uppercase" }}>
                          {new Date(u.date + "T12:00:00").toLocaleDateString("en-US", { month:"short" })}
                        </span>
                      </div>
                      <div>
                        <p style={{ fontSize:13, fontWeight:800, color:"#111111", margin:0 }}>{dateLabel}</p>
                        <p style={{ fontSize:10, color:"#9CA3AF", margin:0 }}>{entries.length} work {entries.length === 1 ? "entry" : "entries"}</p>
                      </div>
                    </div>
                    <div style={{ display:"flex", alignItems:"center", gap:8 }}>
                      {(u.working_hours ?? 0) > 0 && (
                        <span style={{ fontSize:11, fontWeight:700, color:"#374151", display:"flex", alignItems:"center", gap:4 }}>
                          <Clock size={11} style={{ color:"#9CA3AF" }}/> {fmtH(u.working_hours ?? 0)}
                        </span>
                      )}
                      <span style={{ fontSize:11, fontWeight:700, color:st.color, background:st.bg, padding:"3px 10px", borderRadius:99 }}>
                        {st.label}
                      </span>
                      <button
                        onClick={() => handleDelete(u.id)}
                        disabled={deletingId === u.id}
                        title="Delete this submission"
                        style={{ width:28, height:28, borderRadius:8, background:"rgba(239,68,68,0.08)", border:"1px solid rgba(239,68,68,0.2)", display:"flex", alignItems:"center", justifyContent:"center", cursor:"pointer", flexShrink:0, opacity: deletingId === u.id ? 0.4 : 1 }}>
                        <Trash2 size={12} style={{ color:"#EF4444" }}/>
                      </button>
                    </div>
                  </div>

                  {/* Work entries */}
                  {entries.length === 0 ? (
                    <p style={{ fontSize:12, color:"#9CA3AF", padding:"16px 18px", margin:0 }}>No work entries logged</p>
                  ) : (
                    <div>
                      {entries.map((e, ei) => {
                        const cfg = TASK_CFG[e.task_type] ?? TASK_CFG.other
                        const { Icon } = cfg
                        return (
                          <div key={ei} style={{ display:"flex", gap:14, padding:"14px 18px", borderBottom: ei < entries.length - 1 ? "1px solid #F5F6FA" : "none", alignItems:"flex-start" }}>
                            <div style={{ width:34, height:34, borderRadius:10, background:cfg.bg, display:"flex", alignItems:"center", justifyContent:"center", flexShrink:0 }}>
                              <Icon size={15} style={{ color:cfg.color }}/>
                            </div>
                            <div style={{ flex:1, minWidth:0 }}>
                              <div style={{ display:"flex", alignItems:"center", gap:8, marginBottom:3, flexWrap:"wrap" }}>
                                <span style={{ fontSize:13, fontWeight:800, color:"#111111" }}>{e.title || cfg.label}</span>
                                <span style={{ fontSize:10, fontWeight:700, color:cfg.color, background:cfg.bg, padding:"2px 8px", borderRadius:99 }}>{cfg.label}</span>
                              </div>
                              {e.client_name && (
                                <p style={{ fontSize:11, color:"#6B7280", margin:"0 0 3px", fontWeight:600 }}>{e.client_name}</p>
                              )}
                              {(e.notes || e.description) && (
                                <p style={{ fontSize:11, color:"#9CA3AF", margin:"0 0 4px", lineHeight:1.5 }}>{e.notes || e.description}</p>
                              )}
                              <div style={{ display:"flex", alignItems:"center", gap:12, marginTop:4 }}>
                                {(e.duration_hours ?? 0) > 0 && (
                                  <span style={{ fontSize:10, fontWeight:700, color:"#374151", display:"flex", alignItems:"center", gap:3 }}>
                                    <Clock size={9} style={{ color:"#9CA3AF" }}/> {fmtH(e.duration_hours)}
                                  </span>
                                )}
                                {e.start_time && e.end_time && (
                                  <span style={{ fontSize:10, color:"#9CA3AF" }}>{fmt12(e.start_time)} – {fmt12(e.end_time)}</span>
                                )}
                              </div>
                            </div>
                          </div>
                        )
                      })}
                    </div>
                  )}
                </div>
              )
            })}

          </div>

          {/* RIGHT ── Stats panel ─────────────────────────────────────────── */}
          <div style={{ display:"flex", flexDirection:"column", gap:14 }}>

            {/* Work Summary */}
            <div style={{ background:"#fff", borderRadius:20, border:"1px solid #EBEDF2", padding:"18px", boxShadow:"0 2px 12px rgba(0,0,0,0.05)" }}>
              <div style={{ display:"flex", alignItems:"center", justifyContent:"space-between", marginBottom:14 }}>
                <div style={{ display:"flex", alignItems:"center", gap:7 }}>
                  <TrendingUp size={14} style={{ color:"#DE1A1A" }}/>
                  <span style={{ fontSize:13, fontWeight:800, color:"#111111" }}>Work Summary</span>
                </div>
                <span style={{ fontSize:10, fontWeight:600, color:"#9CA3AF" }}>This Month</span>
              </div>
              <DonutChart
                regular={stats.totalHours - stats.totalOT}
                overtime={stats.totalOT}
                tasks={stats.totalTasks * 0.8}
                total={Math.max(stats.totalHours + stats.totalTasks * 0.8, 1)}
                label={fmtH(stats.totalHours)}
              />
              <div style={{ display:"flex", flexDirection:"column", gap:9 }}>
                {[
                  { label:"Regular Hours",   value: fmtH(stats.totalHours - stats.totalOT), color:"#22C55E" },
                  { label:"Overtime",        value: fmtH(stats.totalOT),                   color:"#F59E0B" },
                  { label:"Tasks Completed", value: String(stats.totalTasks),               color:"#6366F1" },
                  { label:"Present Days",    value: String(stats.presentDays),              color:"#EF4444" },
                ].map(r => (
                  <div key={r.label} style={{ display:"flex", alignItems:"center", justifyContent:"space-between" }}>
                    <div style={{ display:"flex", alignItems:"center", gap:7 }}>
                      <div style={{ width:8, height:8, borderRadius:"50%", background:r.color }}/>
                      <span style={{ fontSize:11, color:"#6B7280" }}>{r.label}</span>
                    </div>
                    <span style={{ fontSize:11, fontWeight:700, color:"#111111" }}>{r.value}</span>
                  </div>
                ))}
              </div>
              {/* Trend footer */}
              <div style={{ marginTop:12, paddingTop:10, borderTop:"1px solid #F5F6FA", display:"flex", alignItems:"center", gap:5 }}>
                <TrendingUp size={11} style={{ color:"#22C55E" }}/>
                <span style={{ fontSize:10, color:"#22C55E", fontWeight:700 }}>14% more hours</span>
                <span style={{ fontSize:10, color:"#9CA3AF" }}>than last month</span>
              </div>
            </div>

            {/* Productivity Score */}
            <div style={{ background:"#fff", borderRadius:20, border:"1px solid #EBEDF2", padding:"18px", boxShadow:"0 2px 12px rgba(0,0,0,0.05)" }}>
              <div style={{ display:"flex", alignItems:"center", justifyContent:"space-between", marginBottom:16 }}>
                <span style={{ fontSize:13, fontWeight:800, color:"#111111" }}>Productivity Score</span>
                <span style={{ fontSize:10, fontWeight:600, color:"#9CA3AF" }}>This Month</span>
              </div>
              <ProductivityRing pct={stats.productivity} />
            </div>

          </div>
        </div>

        {/* ── BOTTOM STATS ROW ─────────────────────────────────────────────── */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mt-5">

          {/* Work Streak */}
          <div style={{ background:"linear-gradient(135deg, #1E3A8A 0%, #1D4ED8 55%, #3B82F6 100%)", borderRadius:18, padding:"18px 18px 14px", boxShadow:"0 6px 24px rgba(29,78,216,0.35)", position:"relative", overflow:"hidden" }}>
            <div style={{ position:"absolute", top:-20, right:-20, width:100, height:100, borderRadius:"50%", background:"rgba(255,255,255,0.07)", pointerEvents:"none" }}/>
            <div style={{ display:"flex", alignItems:"center", gap:8, marginBottom:4, position:"relative", zIndex:1 }}>
              <Flame size={16} style={{ color:"#FCA5A5" }}/>
              <span style={{ fontSize:11, fontWeight:700, color:"rgba(255,255,255,0.75)", textTransform:"uppercase", letterSpacing:"0.08em" }}>Work Streak</span>
            </div>
            <p style={{ fontSize:24, fontWeight:900, color:"#FFFFFF", margin:"0 0 2px", fontFamily:"var(--font-jakarta)", position:"relative", zIndex:1 }}>{streak} Days</p>
            <p style={{ fontSize:10, color:"#6EE7B7", fontWeight:600, margin:"0 0 12px", position:"relative", zIndex:1 }}>Keep it up!</p>
            <div style={{ display:"flex", justifyContent:"space-between", position:"relative", zIndex:1 }}>
              {last7.map((d, i) => (
                <div key={i} style={{ display:"flex", flexDirection:"column", alignItems:"center", gap:4 }}>
                  <span style={{ fontSize:9, color:"rgba(255,255,255,0.55)", fontWeight:600 }}>{d.lbl}</span>
                  <div style={{ width:22, height:22, borderRadius:"50%", display:"flex", alignItems:"center", justifyContent:"center", fontSize:10,
                    background: d.done ? "rgba(110,231,183,0.25)" : "rgba(255,255,255,0.1)",
                    color:      d.done ? "#6EE7B7" : "rgba(255,255,255,0.35)",
                  }}>
                    {d.done ? "✓" : "×"}
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Top Activity */}
          <div style={{ background:"linear-gradient(135deg, #1E3A8A 0%, #1D4ED8 55%, #3B82F6 100%)", borderRadius:18, padding:"18px 18px 0", boxShadow:"0 6px 24px rgba(29,78,216,0.35)", overflow:"hidden", position:"relative" }}>
            <div style={{ position:"absolute", bottom:-20, left:-20, width:90, height:90, borderRadius:"50%", background:"rgba(255,255,255,0.06)", pointerEvents:"none" }}/>
            <div style={{ display:"flex", alignItems:"center", gap:8, marginBottom:4, position:"relative", zIndex:1 }}>
              <Star size={15} style={{ color:"#FACC15" }}/>
              <span style={{ fontSize:11, fontWeight:700, color:"rgba(255,255,255,0.75)", textTransform:"uppercase", letterSpacing:"0.08em" }}>Top Activity</span>
            </div>
            <p style={{ fontSize:16, fontWeight:900, color:"#FFFFFF", margin:"0 0 2px", fontFamily:"var(--font-jakarta)", overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap", position:"relative", zIndex:1 }}>
              {topActivity?.name || "—"}
            </p>
            <p style={{ fontSize:10, color:"rgba(255,255,255,0.6)", fontWeight:600, margin:"0 0 8px", position:"relative", zIndex:1 }}>{fmtH(topActivity?.hours ?? 0)}</p>
            <div style={{ position:"relative", zIndex:1 }}>
              <Sparkline data={stats.hoursPerDay} color="#FACC15"/>
            </div>
          </div>

          {/* Overtime */}
          <div style={{ background:"linear-gradient(135deg, #1E3A8A 0%, #1D4ED8 55%, #3B82F6 100%)", borderRadius:18, padding:"18px 18px 14px", boxShadow:"0 6px 24px rgba(29,78,216,0.35)", position:"relative", overflow:"hidden" }}>
            <div style={{ position:"absolute", top:-20, right:-20, width:100, height:100, borderRadius:"50%", background:"rgba(255,255,255,0.07)", pointerEvents:"none" }}/>
            <div style={{ display:"flex", alignItems:"center", gap:8, marginBottom:4, position:"relative", zIndex:1 }}>
              <Zap size={15} style={{ color:"#FACC15" }}/>
              <span style={{ fontSize:11, fontWeight:700, color:"rgba(255,255,255,0.75)", textTransform:"uppercase", letterSpacing:"0.08em" }}>Overtime</span>
            </div>
            <p style={{ fontSize:24, fontWeight:900, color:"#FFFFFF", margin:"0 0 2px", fontFamily:"var(--font-jakarta)", position:"relative", zIndex:1 }}>{fmtH(stats.totalOT)}</p>
            <p style={{ fontSize:10, color:"rgba(255,255,255,0.6)", fontWeight:600, margin:"0 0 14px", position:"relative", zIndex:1 }}>{stats.totalOT > 0 ? "Extra hours logged" : "No overtime this period"}</p>
            <div style={{ display:"flex", alignItems:"flex-end", gap:4, height:36, position:"relative", zIndex:1 }}>
              {stats.hoursPerDay.slice(-7).map((h, i) => {
                const ot = Math.max(0, h - 9)
                const max = Math.max(...stats.hoursPerDay.map(x => Math.max(0, x - 9)), 1)
                return (
                  <div key={i} style={{ flex:1, borderRadius:3,
                    background: ot > 0 ? "#FACC15" : "rgba(255,255,255,0.15)",
                    height:`${Math.max(8, (ot / max) * 36)}px` }}/>
                )
              })}
            </div>
          </div>

          {/* Updates Submitted */}
          <div style={{ background:"linear-gradient(135deg, #1E3A8A 0%, #1D4ED8 55%, #3B82F6 100%)", borderRadius:18, padding:"18px 18px 14px", boxShadow:"0 6px 24px rgba(29,78,216,0.35)", position:"relative", overflow:"hidden" }}>
            <div style={{ position:"absolute", bottom:-20, right:-20, width:90, height:90, borderRadius:"50%", background:"rgba(255,255,255,0.06)", pointerEvents:"none" }}/>
            <div style={{ display:"flex", alignItems:"center", gap:8, marginBottom:4, position:"relative", zIndex:1 }}>
              <CheckCircle2 size={15} style={{ color:"#6EE7B7" }}/>
              <span style={{ fontSize:11, fontWeight:700, color:"rgba(255,255,255,0.75)", textTransform:"uppercase", letterSpacing:"0.08em" }}>Updates Submitted</span>
            </div>
            <p style={{ fontSize:24, fontWeight:900, color:"#FFFFFF", margin:"0 0 2px", fontFamily:"var(--font-jakarta)", position:"relative", zIndex:1 }}>
              {stats.presentDays} / {monthDays}
            </p>
            <p style={{ fontSize:10, color:"#6EE7B7", fontWeight:600, margin:"0 0 12px", position:"relative", zIndex:1 }}>
              {monthDays > 0 ? Math.round((stats.presentDays / monthDays) * 100) : 0}% Submitted
            </p>
            <div style={{ height:8, borderRadius:99, background:"rgba(255,255,255,0.2)", overflow:"hidden", position:"relative", zIndex:1 }}>
              <div style={{ height:"100%", borderRadius:99, background:"linear-gradient(90deg,#6EE7B7,#FACC15)",
                width:`${monthDays > 0 ? Math.round((stats.presentDays / monthDays) * 100) : 0}%`,
                transition:"width 0.6s ease" }}/>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
