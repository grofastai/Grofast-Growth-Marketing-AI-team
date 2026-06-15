"use client"

import { useState, useMemo } from "react"
import { LineChart, Line, XAxis, YAxis, Tooltip, ReferenceLine, ResponsiveContainer } from "recharts"
import { useRouter } from "next/navigation"
import { deleteDailyUpdate, updatePastDailyUpdate, updateDailyUpdateLearning, addEntryToDate } from "@/lib/actions/daily-updates"

const INTERNAL_BRANDS = ["GROFAST DIGITAL", "KARTHICK BRANDS", "GROFAST AI"]
import Image from "next/image"
import {
  Camera, Film, Clock, CalendarDays,
  TrendingUp, Zap, BookOpen, Coffee, GraduationCap,
  CheckCircle2, Search, Trash2,
  ArrowRight, Flame, Star, X, Pencil, Check,
} from "lucide-react"

interface WorkEntry {
  id?: string; task_type: "shoot" | "edit" | "other" | "break" | "learning"
  title: string; client_name: string; duration_hours: number
  notes: string; start_time?: string | null; end_time?: string | null
  screenshot_url?: string | null; video_link?: string | null
  description?: string | null; project_name?: string | null
  is_multi_client?: boolean; client_names?: string[]
  video_type?: string | null; video_duration?: string | null; revisions?: number | null
}
interface UpdateRow {
  id: string; date: string; attendance_status: string
  work_type: string | null; working_hours: number | null
  learning_hours: number | null; learning_topic: string | null; learning_notes: string | null
  learning_start_time: string | null; learning_end_time: string | null
  shoot_count: number | null
  work_entries: WorkEntry[] | null; created_at: string
}

const STATUS_STYLE: Record<string, { label: string; color: string; bg: string; dot: string }> = {
  present: { label:"Present",  color:"#16A34A", bg:"rgba(22,163,74,0.12)",  dot:"#22C55E" },
  absent:  { label:"Absent",   color:"#9CA3AF", bg:"rgba(0,0,0,0.06)",      dot:"#9CA3AF" },
  holiday: { label:"Holiday",  color:"#6B7280", bg:"rgba(0,0,0,0.06)",      dot:"#9CA3AF" },
  wfh:     { label:"WFH",      color:"#6366F1", bg:"rgba(99,102,241,0.1)",  dot:"#6366F1" },
}
const TASK_CFG = {
  shoot:    { Icon: Camera,   color:"#EF4444", bg:"rgba(239,68,68,0.1)",    label:"Shoot"    },
  edit:     { Icon: Film,     color:"#6366F1", bg:"rgba(99,102,241,0.1)",   label:"Editing"  },
  other:    { Icon: BookOpen, color:"#F59E0B", bg:"rgba(245,158,11,0.1)",   label:"Work"     },
  break:    { Icon: Coffee,   color:"#78716C", bg:"rgba(120,113,108,0.1)",  label:"Break"    },
  learning: { Icon: GraduationCap, color:"#059669", bg:"rgba(5,150,105,0.12)", label:"Learning" },
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

function calcDurationFromTimes(start?: string | null, end?: string | null): number | null {
  if (!start || !end) return null
  const [sh, sm] = start.split(":").map(Number)
  const [eh, em] = end.split(":").map(Number)
  const diff = (eh * 60 + em) - (sh * 60 + sm)
  return diff > 0 ? diff / 60 : null
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

interface ParticipatedUpdate {
  id: string
  date: string
  user_id: string
  attendance_status: string
  working_hours: number | null
  work_entries: WorkEntry[] | null
}

interface MemberInfo { id: string; name: string }

// ═══════════════════════════════════════════════════════════════════════════════
export default function HistoryClient({
  updates, userName, clients = [], pastClients = [], participatedUpdates = [], members = [], attendanceDates = [],
}: {
  updates: UpdateRow[]
  userName: string
  clients?: string[]
  pastClients?: string[]
  participatedUpdates?: ParticipatedUpdate[]
  members?: MemberInfo[]
  attendanceDates?: string[]   // all dates with a clock-in (from attendance_logs)
}) {

  const months = useMemo(() => {
    const seen = new Set<string>(), result: string[] = []
    for (const u of updates) { const m = monthLabel(u.date); if (!seen.has(m)) { seen.add(m); result.push(m) } }
    return result
  }, [updates])

  // Active clients for edit dropdown: INTERNAL_BRANDS first, then sheet clients (deduped)
  const activeClientsForEdit = useMemo(() => {
    const norm = (s: string) => s.toLowerCase().replace(/\s+/g, " ").trim()
    const seen = new Set(INTERNAL_BRANDS.map(norm))
    const result = [...INTERNAL_BRANDS]
    for (const c of clients) {
      if (!seen.has(norm(c))) { seen.add(norm(c)); result.push(c) }
    }
    return result
  }, [clients])

  // Past clients deduped against active list
  const pastClientsOnly = useMemo(() =>
    pastClients.filter(c => !activeClientsForEdit.some(a => a.toLowerCase() === c.toLowerCase())),
    [pastClients, activeClientsForEdit]
  )

  const router = useRouter()
  const [deletingId, setDeletingId]       = useState<string | null>(null)
  const [infoDismissed, setInfoDismissed] = useState(false)

  // Per-entry edit state
  const [editingKey, setEditingKey]   = useState<string | null>(null) // "updateId:entryIdx"
  const [editDraft, setEditDraft]     = useState<Partial<WorkEntry>>({})
  const [editEntryStatus, setEditEntryStatus] = useState<"completed" | "in_progress" | "not_started">("not_started")
  const [savingKey, setSavingKey]     = useState<string | null>(null)
  const [deletingKey, setDeletingKey] = useState<string | null>(null)

  // Learning edit state
  const [editingLearningId, setEditingLearningId] = useState<string | null>(null)
  const [learningDraft, setLearningDraft] = useState<{ client: string; topic: string; notes: string; hours: string; startTime: string; endTime: string }>({ client: "GROFAST DIGITAL", topic: "", notes: "", hours: "", startTime: "", endTime: "" })
  const [savingLearning, setSavingLearning] = useState(false)

  // Per-entry date change state
  const [editDraftDate, setEditDraftDate] = useState<string>("")
  const [editOrigDate, setEditOrigDate] = useState<string>("")

  // Past-client mode for edit dropdown (mirrors daily update form)
  const [editClientShowPast, setEditClientShowPast] = useState(false)

  const [selectedMonth, setSelectedMonth] = useState(() => {
    const now = new Date()
    return now.toLocaleDateString("en-US", { month: "long", year: "numeric" })
  })
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

  function startEditEntry(updateId: string, entryIdx: number, entry: WorkEntry, updateDate: string) {
    setEditClientShowPast(false)
    setEditDraftDate(updateDate)
    setEditOrigDate(updateDate)
    setEditingKey(`${updateId}:${entryIdx}`)
    let notes = entry.notes ?? ""
    let parsedStatus: "completed" | "in_progress" | "not_started" = "not_started"
    if (entry.task_type === "other") {
      const m = notes.match(/^\[(completed|in_progress|not_started)\]$/)
      if (m) { parsedStatus = m[1] as typeof parsedStatus; notes = "" }
    }
    setEditEntryStatus(parsedStatus)
    setEditDraft({
      task_type: entry.task_type,
      title: entry.title,
      client_name: entry.client_name,
      duration_hours: entry.duration_hours,
      notes,
      start_time: entry.start_time ?? "",
      end_time: entry.end_time ?? "",
      video_link: entry.video_link ?? "",
      project_name: entry.project_name ?? "",
      is_multi_client: entry.is_multi_client ?? false,
      client_names: entry.client_names ?? [],
      video_type: entry.video_type ?? "",
      video_duration: entry.video_duration ?? "",
      revisions: entry.revisions ?? 0,
    })
  }

  async function saveEntry(updateId: string, allEntries: WorkEntry[], entryIdx: number) {
    const key = `${updateId}:${entryIdx}`
    setSavingKey(key)
    const draftToSave = editDraft.task_type === "other"
      ? { ...editDraft, notes: `[${editEntryStatus}]` }
      : editDraft
    const updatedEntry = { ...(allEntries[entryIdx] as unknown as Record<string, unknown>), ...draftToSave }

    if (editDraftDate && editDraftDate !== editOrigDate) {
      // Move entry to a different date
      const withoutEntry = (allEntries as unknown as Record<string, unknown>[]).filter((_, i) => i !== entryIdx)
      const r1 = await updatePastDailyUpdate(updateId, withoutEntry)
      if (!r1.success) { alert("Failed to move entry: " + r1.error); setSavingKey(null); return }
      const r2 = await addEntryToDate(editDraftDate, updatedEntry)
      if (!r2.success) { alert("Entry removed from old date but failed to add to new date: " + r2.error); setSavingKey(null); return }
    } else {
      const updated = allEntries.map((e, i) =>
        i === entryIdx ? updatedEntry : (e as unknown as Record<string, unknown>)
      )
      const result = await updatePastDailyUpdate(updateId, updated)
      if (!result.success) { alert("Failed to save: " + result.error); setSavingKey(null); return }
    }

    setEditingKey(null)
    setEditDraft({})
    router.refresh()
    setSavingKey(null)
  }

  async function deleteEntry(updateId: string, allEntries: WorkEntry[], entryIdx: number) {
    if (!confirm("Remove this entry? This cannot be undone.")) return
    const key = `${updateId}:${entryIdx}`
    setDeletingKey(key)
    const updated = (allEntries as unknown as Record<string, unknown>[]).filter((_, i) => i !== entryIdx)
    const result = await updatePastDailyUpdate(updateId, updated)
    if (result.success) {
      router.refresh()
    } else {
      alert("Failed to delete entry: " + result.error)
    }
    setDeletingKey(null)
  }

  function startEditLearning(u: UpdateRow) {
    setEditingLearningId(u.id)
    const raw = u.learning_topic ?? ""
    const m = raw.match(/^\[([^\]]+)\]\s*(.*)$/)
    setLearningDraft({
      client:    m ? m[1] : "GROFAST DIGITAL",
      topic:     m ? m[2] : raw,
      notes:     u.learning_notes ?? "",
      hours:     u.learning_hours != null ? String(u.learning_hours) : "",
      startTime: u.learning_start_time ?? "",
      endTime:   u.learning_end_time   ?? "",
    })
  }

  async function saveLearning(id: string) {
    setSavingLearning(true)
    const [fh, fm] = learningDraft.startTime ? learningDraft.startTime.split(":").map(Number) : [0, 0]
    const [th, tm] = learningDraft.endTime   ? learningDraft.endTime.split(":").map(Number)   : [0, 0]
    const computedHrs = (learningDraft.startTime && learningDraft.endTime)
      ? Math.max(0, (th * 60 + tm - fh * 60 - fm) / 60)
      : parseFloat(learningDraft.hours) || null
    const fullTopic = learningDraft.topic.trim()
      ? `[${learningDraft.client}] ${learningDraft.topic.trim()}`
      : null
    const result = await updateDailyUpdateLearning(id, {
      learning_hours:      computedHrs,
      learning_topic:      fullTopic,
      learning_notes:      learningDraft.notes || null,
      learning_start_time: learningDraft.startTime || null,
      learning_end_time:   learningDraft.endTime   || null,
    })
    if (result.success) {
      setEditingLearningId(null)
      router.refresh()
    } else {
      alert("Failed to save: " + result.error)
    }
    setSavingLearning(false)
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
    let totalHours = 0, totalOT = 0, totalTasks = 0, presentDays = 0, totalLearning = 0
    let shootH = 0, editH = 0, otherH = 0
    const hoursPerDay: number[] = []
    const dailyData: { day: string; hours: number }[] = []
    for (const u of monthFiltered) {
      const entries = Array.isArray(u.work_entries) ? u.work_entries : []
      const workH = entries.filter(e => e.task_type !== "break" && e.task_type !== "learning").reduce((sum, e) => sum + (e.duration_hours ?? 0), 0)
      const learnFromEntries = entries.filter(e => e.task_type === "learning").reduce((sum, e) => sum + (e.duration_hours ?? 0), 0)
      const learnH = learnFromEntries > 0 ? learnFromEntries : (u.learning_hours ?? 0)
      const h = workH + learnH
      totalHours += h; if (h > 9.5) totalOT += Math.round((h - 9.5) * 10) / 10
      totalLearning += learnH
      if (u.attendance_status === "present" || u.attendance_status === "wfh") presentDays++
      hoursPerDay.push(h)
      dailyData.push({ day: new Date(u.date + "T12:00:00").getDate().toString(), hours: Math.round(h * 10) / 10 })
      totalTasks += entries.filter(e => e.task_type !== "break" && e.task_type !== "learning").length
      for (const e of entries) {
        if (e.task_type === "shoot") shootH += e.duration_hours ?? 0
        else if (e.task_type === "edit") editH += e.duration_hours ?? 0
        else if (e.task_type !== "break" && e.task_type !== "learning") otherH += e.duration_hours ?? 0
      }
    }
    // Also count clock-in dates in the selected month that have no daily_update record
    const updateDates = new Set(monthFiltered.map(u => u.date))
    const monthPrefix = selectedMonth
      ? new Date(monthFiltered[0]?.date + "T12:00:00" || Date.now()).toISOString().slice(0, 7)
      : null
    for (const d of attendanceDates) {
      if (updateDates.has(d)) continue  // already counted above
      if (monthPrefix && !d.startsWith(monthPrefix)) continue
      presentDays++
    }

    const productivity = filtered.length > 0
      ? Math.min(100, Math.round((presentDays / filtered.length) * 100 * 0.6 + (totalHours > 0 ? Math.min(40, (totalHours / (filtered.length * 9.5)) * 40) : 0)))
      : 0
    return { totalHours, totalOT, totalTasks, presentDays, totalLearning, shootH, editH, otherH, hoursPerDay, dailyData: dailyData.reverse(), productivity }
  }, [filtered, attendanceDates, selectedMonth, monthFiltered])

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
  // Group participated updates by date for inline display
  const participatedByDate = useMemo(() => {
    const map = new Map<string, ParticipatedUpdate[]>()
    for (const u of participatedUpdates) {
      const arr = map.get(u.date) ?? []
      arr.push(u)
      map.set(u.date, arr)
    }
    return map
  }, [participatedUpdates])

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

  // Latest day stats — sum from work_entries only (not attendance-derived working_hours)
  const latestEntries = Array.isArray(latest?.work_entries) ? latest!.work_entries! : []
  const latestWorkH  = latestEntries.filter(e => e.task_type !== "break" && e.task_type !== "learning").reduce((sum, e) => sum + (e.duration_hours ?? 0), 0)
  const latestLearnFromEntries = latestEntries.filter(e => e.task_type === "learning").reduce((sum, e) => sum + (e.duration_hours ?? 0), 0)
  const latestLearnH = latestLearnFromEntries > 0 ? latestLearnFromEntries : (latest?.learning_hours ?? 0)
  const latestH  = latestWorkH + latestLearnH
  const latestOT = latestH > 9.5 ? Math.round((latestH - 9.5) * 10) / 10 : 0
  const latestTasks = latestEntries.filter(e => e.task_type !== "break" && e.task_type !== "learning").length
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

        {/* Explanatory banner */}
        {!infoDismissed && (
          <div style={{ display:"flex", alignItems:"center", justifyContent:"space-between", gap:12, margin:"0 0 16px", padding:"12px 16px", borderRadius:14, background:"#F0F4FF", border:"1px solid #DBEAFE" }}>
            <p style={{ fontSize:12, color:"#374151", margin:0 }}>
              <span style={{ fontWeight:700 }}>Your personal work diary.</span>{" "}
              Every daily update you submit appears here — filter by month, pick a date, or search by task or client.
            </p>
            <button onClick={() => setInfoDismissed(true)} style={{ flexShrink:0, background:"none", border:"none", cursor:"pointer", color:"#6B7280", padding:4 }}>
              <X size={14} />
            </button>
          </div>
        )}

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
                        <p style={{ fontSize:10, color:"#9CA3AF", margin:0 }}>
                          {(() => {
                            const workCount = entries.filter(e => e.task_type !== "break" && e.task_type !== "learning").length
                            const learnCount = entries.filter(e => e.task_type === "learning").length + (u.learning_topic && !entries.some(e => e.task_type === "learning") ? 1 : 0)
                            const parts = []
                            if (workCount > 0) parts.push(`${workCount} work ${workCount === 1 ? "entry" : "entries"}`)
                            if (learnCount > 0) parts.push(`${learnCount} learning`)
                            return parts.length > 0 ? parts.join(" + ") : "No entries"
                          })()}
                        </p>
                      </div>
                    </div>
                    <div style={{ display:"flex", alignItems:"center", gap:8 }}>
                      {(() => {
                        const learnFromEntries = entries.filter(e => e.task_type === "learning").reduce((sum, e) => sum + (e.duration_hours ?? 0), 0)
                        const dayEntryH = entries.filter(e => e.task_type !== "break" && e.task_type !== "learning").reduce((sum, e) => sum + (e.duration_hours ?? 0), 0) + (learnFromEntries > 0 ? learnFromEntries : (u.learning_hours ?? 0))
                        return dayEntryH > 0 ? (
                          <span style={{ fontSize:11, fontWeight:700, color:"#374151", display:"flex", alignItems:"center", gap:4 }}>
                            <Clock size={11} style={{ color:"#9CA3AF" }}/>
                            {fmtH(dayEntryH)}
                          </span>
                        ) : null
                      })()}
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
                  {entries.length === 0 && u.learning_topic ? (
                    <div>
                      <div style={{ display:"flex", gap:14, padding:"14px 18px", alignItems:"flex-start" }}>
                        <div style={{ width:34, height:34, borderRadius:10, background:"rgba(5,150,105,0.12)", display:"flex", alignItems:"center", justifyContent:"center", flexShrink:0 }}>
                          <GraduationCap size={15} style={{ color:"#059669" }}/>
                        </div>
                        <div style={{ flex:1, minWidth:0 }}>
                          <div style={{ display:"flex", alignItems:"center", gap:8, marginBottom:3, flexWrap:"wrap" }}>
                            <span style={{ fontSize:13, fontWeight:800, color:"#111111" }}>{u.learning_topic}</span>
                            <span style={{ fontSize:10, fontWeight:700, color:"#059669", background:"rgba(5,150,105,0.12)", padding:"2px 8px", borderRadius:99 }}>Learning</span>
                          </div>
                          {u.learning_notes && (
                            <p style={{ fontSize:11, color:"#9CA3AF", margin:"0 0 4px", lineHeight:1.5 }}>{u.learning_notes}</p>
                          )}
                          <span style={{ fontSize:10, fontWeight:700, color:"#374151", display:"inline-flex", alignItems:"center", gap:6, marginTop:4 }}>
                            {(u.learning_hours ?? 0) > 0 && <><Clock size={9} style={{ color:"#9CA3AF" }}/>{fmtH(u.learning_hours!)}</>}
                            {u.learning_start_time && u.learning_end_time && (
                              <span style={{ color:"#9CA3AF", fontWeight:500 }}>{fmt12(u.learning_start_time)} – {fmt12(u.learning_end_time)}</span>
                            )}
                          </span>
                        </div>
                        <div style={{ display:"flex", gap:5, flexShrink:0 }}>
                          <button
                            onClick={() => editingLearningId === u.id ? setEditingLearningId(null) : startEditLearning(u)}
                            title="Edit learning"
                            style={{ width:26, height:26, borderRadius:7, background: editingLearningId === u.id ? "rgba(245,158,11,0.2)" : "rgba(245,158,11,0.1)", border:"1px solid rgba(245,158,11,0.35)", display:"flex", alignItems:"center", justifyContent:"center", cursor:"pointer" }}>
                            <Pencil size={11} style={{ color:"#D97706" }}/>
                          </button>
                          <button
                            onClick={async () => { if (!confirm("Delete this learning entry?")) return; await updateDailyUpdateLearning(u.id, { learning_hours: null, learning_topic: null, learning_notes: null, learning_start_time: null, learning_end_time: null }); router.refresh() }}
                            title="Delete learning"
                            style={{ width:26, height:26, borderRadius:7, background:"rgba(239,68,68,0.08)", border:"1px solid rgba(239,68,68,0.2)", display:"flex", alignItems:"center", justifyContent:"center", cursor:"pointer" }}>
                            <Trash2 size={11} style={{ color:"#EF4444" }}/>
                          </button>
                        </div>
                      </div>
                      {editingLearningId === u.id && (
                        <div style={{ margin:"0 18px 14px", padding:"14px", borderRadius:12, background:"rgba(245,158,11,0.05)", border:"1.5px solid rgba(245,158,11,0.25)" }}>
                          <p style={{ fontSize:11, fontWeight:700, color:"#D97706", margin:"0 0 10px" }}>Edit Learning</p>
                          <div style={{ display:"flex", flexDirection:"column", gap:8 }}>
                            <div>
                              <label style={{ fontSize:10, fontWeight:600, color:"#6B7280", display:"block", marginBottom:3 }}>Client</label>
                              <select value={learningDraft.client} onChange={e => setLearningDraft(d => ({ ...d, client: e.target.value }))}
                                style={{ width:"100%", padding:"7px 10px", borderRadius:8, border:"1px solid #E5E7EB", fontSize:12, color:"#111111", outline:"none", background:"#fff", boxSizing:"border-box" }}>
                                <option value="GROFAST DIGITAL">GROFAST DIGITAL</option>
                                <option value="GROFAST AI">GROFAST AI</option>
                                <option value="KARTHICK BRANDS">KARTHICK BRANDS</option>
                              </select>
                            </div>
                            <div>
                              <label style={{ fontSize:10, fontWeight:600, color:"#6B7280", display:"block", marginBottom:3 }}>Topic</label>
                              <input value={learningDraft.topic} onChange={e => setLearningDraft(d => ({ ...d, topic: e.target.value }))}
                                placeholder="What did you learn?"
                                style={{ width:"100%", padding:"7px 10px", borderRadius:8, border:"1px solid #E5E7EB", fontSize:12, color:"#111111", outline:"none", background:"#fff", boxSizing:"border-box" }}/>
                            </div>
                            <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr 80px", gap:8 }}>
                              <div>
                                <label style={{ fontSize:10, fontWeight:600, color:"#6B7280", display:"block", marginBottom:3 }}>From</label>
                                <input type="time" value={learningDraft.startTime} onChange={e => setLearningDraft(d => ({ ...d, startTime: e.target.value }))}
                                  style={{ width:"100%", padding:"7px 10px", borderRadius:8, border:"1px solid #E5E7EB", fontSize:12, color:"#111111", outline:"none", background:"#fff", boxSizing:"border-box" }}/>
                              </div>
                              <div>
                                <label style={{ fontSize:10, fontWeight:600, color:"#6B7280", display:"block", marginBottom:3 }}>To</label>
                                <input type="time" value={learningDraft.endTime} onChange={e => setLearningDraft(d => ({ ...d, endTime: e.target.value }))}
                                  style={{ width:"100%", padding:"7px 10px", borderRadius:8, border:"1px solid #E5E7EB", fontSize:12, color:"#111111", outline:"none", background:"#fff", boxSizing:"border-box" }}/>
                              </div>
                              <div>
                                <label style={{ fontSize:10, fontWeight:600, color:"#6B7280", display:"block", marginBottom:3 }}>Total</label>
                                <div style={{ padding:"7px 10px", borderRadius:8, border:"1px solid #E5E7EB", fontSize:12, fontWeight:700, color: learningDraft.startTime && learningDraft.endTime ? "#111111" : "#9CA3AF", background:"#F9FAFB" }}>
                                  {(() => { const [fh,fm] = learningDraft.startTime ? learningDraft.startTime.split(":").map(Number) : [0,0]; const [th,tm] = learningDraft.endTime ? learningDraft.endTime.split(":").map(Number) : [0,0]; const h = Math.max(0,(th*60+tm-fh*60-fm)/60); return h > 0 ? fmtH(h) : "—" })()}
                                </div>
                              </div>
                            </div>
                            <div>
                              <label style={{ fontSize:10, fontWeight:600, color:"#6B7280", display:"block", marginBottom:3 }}>Notes</label>
                              <textarea rows={2} value={learningDraft.notes} onChange={e => setLearningDraft(d => ({ ...d, notes: e.target.value }))}
                                placeholder="Any notes or details…"
                                style={{ width:"100%", padding:"7px 10px", borderRadius:8, border:"1px solid #E5E7EB", fontSize:12, color:"#111111", outline:"none", background:"#fff", resize:"none", boxSizing:"border-box" }}/>
                            </div>
                            <div style={{ display:"flex", gap:8, justifyContent:"flex-end" }}>
                              <button onClick={() => setEditingLearningId(null)}
                                style={{ padding:"7px 14px", borderRadius:8, background:"#F3F4F6", border:"none", fontSize:12, fontWeight:600, color:"#6B7280", cursor:"pointer" }}>
                                Cancel
                              </button>
                              <button onClick={() => saveLearning(u.id)} disabled={savingLearning}
                                style={{ display:"flex", alignItems:"center", gap:5, padding:"7px 14px", borderRadius:8, background:"#F59E0B", border:"none", fontSize:12, fontWeight:700, color:"#fff", cursor:"pointer", opacity: savingLearning ? 0.6 : 1 }}>
                                <Check size={12}/> {savingLearning ? "Saving…" : "Save"}
                              </button>
                            </div>
                          </div>
                        </div>
                      )}
                    </div>
                  ) : entries.length === 0 ? (
                    <p style={{ fontSize:12, color:"#9CA3AF", padding:"16px 18px", margin:0 }}>
                      {u.attendance_status === "absent" ? "You didn't submit an update for this day." : "No work entries logged"}
                    </p>
                  ) : (
                    <div>
                      {u.learning_topic && (
                        <div style={{ borderBottom:"1px solid #F5F6FA", background:"rgba(245,158,11,0.03)" }}>
                          <div style={{ display:"flex", gap:14, padding:"14px 18px", alignItems:"flex-start" }}>
                            <div style={{ width:34, height:34, borderRadius:10, background:"rgba(245,158,11,0.12)", display:"flex", alignItems:"center", justifyContent:"center", flexShrink:0 }}>
                              <BookOpen size={15} style={{ color:"#D97706" }}/>
                            </div>
                            <div style={{ flex:1, minWidth:0 }}>
                              <div style={{ display:"flex", alignItems:"center", gap:8, marginBottom:3, flexWrap:"wrap" }}>
                                <span style={{ fontSize:13, fontWeight:800, color:"#111111" }}>{u.learning_topic}</span>
                                <span style={{ fontSize:10, fontWeight:700, color:"#059669", background:"rgba(5,150,105,0.12)", padding:"2px 8px", borderRadius:99 }}>Learning</span>
                              </div>
                              {u.learning_notes && (
                                <p style={{ fontSize:11, color:"#9CA3AF", margin:"0 0 4px", lineHeight:1.5 }}>{u.learning_notes}</p>
                              )}
                              <span style={{ fontSize:10, fontWeight:700, color:"#374151", display:"inline-flex", alignItems:"center", gap:6, marginTop:4 }}>
                                {(u.learning_hours ?? 0) > 0 && <><Clock size={9} style={{ color:"#9CA3AF" }}/>{fmtH(u.learning_hours!)}</>}
                                {u.learning_start_time && u.learning_end_time && (
                                  <span style={{ color:"#9CA3AF", fontWeight:500 }}>{fmt12(u.learning_start_time)} – {fmt12(u.learning_end_time)}</span>
                                )}
                              </span>
                            </div>
                            <button
                              onClick={() => editingLearningId === u.id ? setEditingLearningId(null) : startEditLearning(u)}
                              title="Edit learning"
                              style={{ width:26, height:26, borderRadius:7, background: editingLearningId === u.id ? "rgba(245,158,11,0.2)" : "rgba(245,158,11,0.1)", border:"1px solid rgba(245,158,11,0.35)", display:"flex", alignItems:"center", justifyContent:"center", cursor:"pointer", flexShrink:0 }}>
                              <Pencil size={11} style={{ color:"#D97706" }}/>
                            </button>
                          </div>
                          {editingLearningId === u.id && (
                            <div style={{ margin:"0 18px 14px", padding:"14px", borderRadius:12, background:"rgba(245,158,11,0.05)", border:"1.5px solid rgba(245,158,11,0.25)" }}>
                              <p style={{ fontSize:11, fontWeight:700, color:"#D97706", margin:"0 0 10px" }}>Edit Learning</p>
                              <div style={{ display:"flex", flexDirection:"column", gap:8 }}>
                                <div style={{ display:"grid", gridTemplateColumns:"1fr 100px", gap:8 }}>
                                  <div>
                                    <label style={{ fontSize:10, fontWeight:600, color:"#6B7280", display:"block", marginBottom:3 }}>Topic</label>
                                    <input value={learningDraft.topic} onChange={e => setLearningDraft(d => ({ ...d, topic: e.target.value }))}
                                      placeholder="What did you learn?"
                                      style={{ width:"100%", padding:"7px 10px", borderRadius:8, border:"1px solid #E5E7EB", fontSize:12, color:"#111111", outline:"none", background:"#fff", boxSizing:"border-box" }}/>
                                  </div>
                                  <div>
                                    <label style={{ fontSize:10, fontWeight:600, color:"#6B7280", display:"block", marginBottom:3 }}>Hours</label>
                                    <input type="number" min="0" step="0.25" value={learningDraft.hours} onChange={e => setLearningDraft(d => ({ ...d, hours: e.target.value }))}
                                      placeholder="e.g. 1.5"
                                      style={{ width:"100%", padding:"7px 10px", borderRadius:8, border:"1px solid #E5E7EB", fontSize:12, color:"#111111", outline:"none", background:"#fff", boxSizing:"border-box" }}/>
                                  </div>
                                </div>
                                <div>
                                  <label style={{ fontSize:10, fontWeight:600, color:"#6B7280", display:"block", marginBottom:3 }}>Notes</label>
                                  <textarea rows={2} value={learningDraft.notes} onChange={e => setLearningDraft(d => ({ ...d, notes: e.target.value }))}
                                    placeholder="Any notes or details…"
                                    style={{ width:"100%", padding:"7px 10px", borderRadius:8, border:"1px solid #E5E7EB", fontSize:12, color:"#111111", outline:"none", background:"#fff", resize:"none", boxSizing:"border-box" }}/>
                                </div>
                                <div style={{ display:"flex", gap:8, justifyContent:"flex-end" }}>
                                  <button onClick={() => setEditingLearningId(null)}
                                    style={{ padding:"7px 14px", borderRadius:8, background:"#F3F4F6", border:"none", fontSize:12, fontWeight:600, color:"#6B7280", cursor:"pointer" }}>
                                    Cancel
                                  </button>
                                  <button onClick={() => saveLearning(u.id)} disabled={savingLearning}
                                    style={{ display:"flex", alignItems:"center", gap:5, padding:"7px 14px", borderRadius:8, background:"#F59E0B", border:"none", fontSize:12, fontWeight:700, color:"#fff", cursor:"pointer", opacity: savingLearning ? 0.6 : 1 }}>
                                    <Check size={12}/> {savingLearning ? "Saving…" : "Save"}
                                  </button>
                                </div>
                              </div>
                            </div>
                          )}
                        </div>
                      )}
                      {entries.map((e, ei) => {
                        const cfg = TASK_CFG[e.task_type] ?? TASK_CFG.other
                        const { Icon } = cfg
                        const eKey = `${u.id}:${ei}`
                        const isEditingEntry = editingKey === eKey
                        return (
                          <div key={ei} style={{ borderBottom: ei < entries.length - 1 ? "1px solid #F5F6FA" : "none" }}>
                            {/* Entry row */}
                            <div style={{ display:"flex", gap:14, padding:"14px 18px", alignItems:"flex-start" }}>
                              <div style={{ width:34, height:34, borderRadius:10, background:cfg.bg, display:"flex", alignItems:"center", justifyContent:"center", flexShrink:0 }}>
                                <Icon size={15} style={{ color:cfg.color }}/>
                              </div>
                              <div style={{ flex:1, minWidth:0 }}>
                                <div style={{ display:"flex", alignItems:"center", gap:8, marginBottom:3, flexWrap:"wrap" }}>
                                  <span style={{ fontSize:13, fontWeight:800, color:"#111111" }}>{e.title || cfg.label}</span>
                                  <span style={{ fontSize:10, fontWeight:700, color:cfg.color, background:cfg.bg, padding:"2px 8px", borderRadius:99 }}>{cfg.label}</span>
                                </div>
                                {(e.is_multi_client && e.client_names && e.client_names.length > 0)
                                  ? <p style={{ fontSize:11, color:"#6B7280", margin:"0 0 3px", fontWeight:600 }}>{e.client_names.join(" · ")}</p>
                                  : e.client_name
                                    ? <p style={{ fontSize:11, color:"#6B7280", margin:"0 0 3px", fontWeight:600 }}>{e.client_name}</p>
                                    : null
                                }
                                {(e.notes || e.description) && (
                                  <p style={{ fontSize:11, color:"#9CA3AF", margin:"0 0 4px", lineHeight:1.5 }}>{e.notes || e.description}</p>
                                )}
                                <div style={{ display:"flex", alignItems:"center", gap:12, marginTop:4, flexWrap:"wrap" }}>
                                  {(() => {
                                    const d = calcDurationFromTimes(e.start_time, e.end_time) ?? (e.duration_hours ?? 0)
                                    return d > 0 ? (
                                      <span style={{ fontSize:10, fontWeight:700, color:"#374151", display:"flex", alignItems:"center", gap:3 }}>
                                        <Clock size={9} style={{ color:"#9CA3AF" }}/> {fmtH(d)}
                                      </span>
                                    ) : null
                                  })()}
                                  {e.start_time && e.end_time && (
                                    <span style={{ fontSize:10, color:"#9CA3AF" }}>{fmt12(e.start_time)} – {fmt12(e.end_time)}</span>
                                  )}
                                  {e.video_link && (
                                    <a href={e.video_link} target="_blank" rel="noopener noreferrer" style={{ fontSize:10, fontWeight:700, color:"#6366F1", textDecoration:"none", display:"flex", alignItems:"center", gap:2 }}>
                                      🔗 Drive Link
                                    </a>
                                  )}
                                </div>
                              </div>
                              {/* Per-entry actions */}
                              <div style={{ display:"flex", gap:5, flexShrink:0 }}>
                                <button
                                  onClick={() => isEditingEntry ? (setEditingKey(null), setEditDraft({})) : startEditEntry(u.id, ei, e, u.date)}
                                  title={isEditingEntry ? "Cancel edit" : "Edit this entry"}
                                  style={{ width:26, height:26, borderRadius:7, background: isEditingEntry ? "rgba(99,102,241,0.15)" : "rgba(99,102,241,0.08)", border:"1px solid rgba(99,102,241,0.25)", display:"flex", alignItems:"center", justifyContent:"center", cursor:"pointer" }}>
                                  <Pencil size={11} style={{ color:"#6366F1" }}/>
                                </button>
                                <button
                                  onClick={() => deleteEntry(u.id, entries, ei)}
                                  disabled={deletingKey === eKey}
                                  title="Remove this entry"
                                  style={{ width:26, height:26, borderRadius:7, background:"rgba(239,68,68,0.08)", border:"1px solid rgba(239,68,68,0.2)", display:"flex", alignItems:"center", justifyContent:"center", cursor:"pointer", opacity: deletingKey === eKey ? 0.4 : 1 }}>
                                  <Trash2 size={11} style={{ color:"#EF4444" }}/>
                                </button>
                              </div>
                            </div>

                            {/* Inline edit form */}
                            {isEditingEntry && (
                              <div style={{ margin:"0 18px 14px", padding:"14px", borderRadius:12, background:"#F8F9FF", border:"1.5px solid rgba(99,102,241,0.25)" }}>
                                <p style={{ fontSize:11, fontWeight:700, color:"#6366F1", margin:"0 0 10px" }}>Edit Entry</p>
                                <div style={{ display:"flex", flexDirection:"column", gap:8 }}>

                                  {/* Date field — move entry to a different day */}
                                  <div>
                                    <label style={{ fontSize:10, fontWeight:600, color:"#6B7280", display:"block", marginBottom:3 }}>Date</label>
                                    <input
                                      type="date"
                                      value={editDraftDate}
                                      onChange={ev => setEditDraftDate(ev.target.value)}
                                      style={{ width:"100%", padding:"7px 10px", borderRadius:8, border: editDraftDate !== editOrigDate ? "1.5px solid #6366F1" : "1px solid #E5E7EB", fontSize:12, color:"#111111", outline:"none", background:"#fff", boxSizing:"border-box" }}
                                    />
                                    {editDraftDate !== editOrigDate && (
                                      <p style={{ fontSize:10, color:"#6366F1", margin:"3px 0 0", fontWeight:600 }}>This entry will move to {new Date(editDraftDate + "T12:00:00").toLocaleDateString("en-US", { day:"numeric", month:"short", year:"numeric" })}</p>
                                    )}
                                  </div>

                                  {/* Title + Client — all types */}
                                  <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:8 }}>
                                    <div>
                                      <label style={{ fontSize:10, fontWeight:600, color:"#6B7280", display:"block", marginBottom:3 }}>Title</label>
                                      <input
                                        value={editDraft.title ?? ""}
                                        onChange={ev => setEditDraft(d => ({ ...d, title: ev.target.value }))}
                                        style={{ width:"100%", padding:"7px 10px", borderRadius:8, border:"1px solid #E5E7EB", fontSize:12, color:"#111111", outline:"none", background:"#fff", boxSizing:"border-box" }}
                                      />
                                    </div>
                                    <div>
                                      <label style={{ fontSize:10, fontWeight:600, color:"#6B7280", display:"block", marginBottom:3 }}>Client</label>
                                      {editDraft.task_type === "learning"
                                        ? <select
                                            value={editDraft.client_name ?? ""}
                                            onChange={ev => setEditDraft(d => ({ ...d, client_name: ev.target.value }))}
                                            style={{ width:"100%", padding:"7px 10px", borderRadius:8, border:"1px solid #E5E7EB", fontSize:12, color:"#111111", outline:"none", background:"#fff", boxSizing:"border-box" }}>
                                            <option value="GROFAST DIGITAL">GROFAST DIGITAL</option>
                                            <option value="GROFAST AI">GROFAST AI</option>
                                            <option value="KARTHICK BRANDS">KARTHICK BRANDS</option>
                                          </select>
                                        : editDraft.task_type === "other" && editDraft.is_multi_client
                                        ? <p style={{ fontSize:11, fontWeight:700, color:"#374151", padding:"7px 0" }}>{(editDraft.client_names ?? []).join(" · ") || "—"}</p>
                                        : editClientShowPast
                                          ? <div>
                                              <button type="button" onClick={() => setEditClientShowPast(false)}
                                                style={{ width:"100%", padding:"6px 10px", borderRadius:8, border:"1px solid #E5E7EB", fontSize:12, color:"#6366F1", fontWeight:700, background:"rgba(99,102,241,0.06)", cursor:"pointer", textAlign:"left", marginBottom:4 }}>
                                                ← Back to Active Clients
                                              </button>
                                              <select value=""
                                                onChange={ev => { const v = ev.target.value; if (v) { setEditDraft(d => ({ ...d, client_name: v })); setEditClientShowPast(false) } }}
                                                style={{ width:"100%", padding:"7px 10px", borderRadius:8, border:"1px solid #E5E7EB", fontSize:12, color:"#111111", outline:"none", background:"#fff", boxSizing:"border-box" }}>
                                                <option value="">— Select past client —</option>
                                                {pastClientsOnly.map(c => <option key={c} value={c}>{c}</option>)}
                                              </select>
                                            </div>
                                          : <select
                                              value={editDraft.client_name ?? ""}
                                              onChange={ev => { const v = ev.target.value; if (v === "__past_clients__") { setEditClientShowPast(true) } else if (v === "__custom__") { setEditDraft(d => ({ ...d, client_name: "" })) } else { setEditDraft(d => ({ ...d, client_name: v })) } }}
                                              style={{ width:"100%", padding:"7px 10px", borderRadius:8, border:"1px solid #E5E7EB", fontSize:12, color:"#111111", outline:"none", background:"#fff", boxSizing:"border-box" }}>
                                              <option value="">— Select client —</option>
                                              {activeClientsForEdit.map(c => <option key={c} value={c}>{c}</option>)}
                                              {pastClientsOnly.length > 0 && <option value="__past_clients__">📁 Past Clients →</option>}
                                              <option value="__custom__">✏️ Other (type manually)</option>
                                            </select>
                                      }
                                    </div>
                                  </div>

                                  {/* Multi-client toggle + selector (working entries only) */}
                                  {editDraft.task_type === "other" && (
                                    <div>
                                      <label style={{ display:"flex", alignItems:"center", gap:6, cursor:"pointer", fontSize:11, fontWeight:600, color:"#374151", marginBottom:6 }}>
                                        <input
                                          type="checkbox"
                                          checked={editDraft.is_multi_client ?? false}
                                          onChange={ev => setEditDraft(d => ({ ...d, is_multi_client: ev.target.checked, client_names: [] }))}
                                          style={{ accentColor:"#de1a1a" }}
                                        />
                                        Split cost across multiple clients
                                      </label>
                                      {editDraft.is_multi_client && activeClientsForEdit.length > 0 && (
                                        <div style={{ display:"flex", flexWrap:"wrap", gap:5 }}>
                                          {activeClientsForEdit.map(name => {
                                            const selected = (editDraft.client_names ?? []).includes(name)
                                            return (
                                              <button key={name} type="button"
                                                onClick={() => {
                                                  const next = selected
                                                    ? (editDraft.client_names ?? []).filter(n => n !== name)
                                                    : [...(editDraft.client_names ?? []), name]
                                                  setEditDraft(d => ({ ...d, client_names: next, client_name: next[0] || d.client_name }))
                                                }}
                                                style={{ padding:"4px 10px", borderRadius:20, fontSize:11, fontWeight:600, cursor:"pointer", border:`1.5px solid ${selected ? "#de1a1a" : "#EBEDF2"}`, background: selected ? "rgba(222,26,26,0.08)" : "#F9FAFB", color: selected ? "#de1a1a" : "#6B7280" }}>
                                                {name}
                                              </button>
                                            )
                                          })}
                                        </div>
                                      )}
                                    </div>
                                  )}

                                  {/* Shoot, Other & Learning: start/end time */}
                                  {(editDraft.task_type === "shoot" || editDraft.task_type === "other" || editDraft.task_type === "learning") && (
                                    <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:8 }}>
                                      <div>
                                        <label style={{ fontSize:10, fontWeight:600, color:"#6B7280", display:"block", marginBottom:3 }}>Start Time</label>
                                        <input
                                          type="time"
                                          value={editDraft.start_time ?? ""}
                                          onChange={ev => setEditDraft(d => ({ ...d, start_time: ev.target.value }))}
                                          style={{ width:"100%", padding:"7px 10px", borderRadius:8, border:"1px solid #E5E7EB", fontSize:12, color:"#111111", outline:"none", background:"#fff", boxSizing:"border-box" }}
                                        />
                                      </div>
                                      <div>
                                        <label style={{ fontSize:10, fontWeight:600, color:"#6B7280", display:"block", marginBottom:3 }}>End Time</label>
                                        <input
                                          type="time"
                                          value={editDraft.end_time ?? ""}
                                          onChange={ev => setEditDraft(d => ({ ...d, end_time: ev.target.value }))}
                                          style={{ width:"100%", padding:"7px 10px", borderRadius:8, border:"1px solid #E5E7EB", fontSize:12, color:"#111111", outline:"none", background:"#fff", boxSizing:"border-box" }}
                                        />
                                      </div>
                                    </div>
                                  )}

                                  {/* Shoot: video type, duration, revisions */}
                                  {editDraft.task_type === "shoot" && (
                                    <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr 90px", gap:8 }}>
                                      <div>
                                        <label style={{ fontSize:10, fontWeight:600, color:"#6B7280", display:"block", marginBottom:3 }}>Video Type</label>
                                        <select
                                          value={editDraft.video_type ?? ""}
                                          onChange={ev => setEditDraft(d => ({ ...d, video_type: ev.target.value }))}
                                          style={{ width:"100%", padding:"7px 10px", borderRadius:8, border:"1px solid #E5E7EB", fontSize:12, color:"#111111", outline:"none", background:"#fff", boxSizing:"border-box" }}>
                                          <option value="">Select type…</option>
                                          {["Instagram Reels","Personal Branding","Ads and Hooks","Long Videos","Cinematic","YouTube Shorts"].map(t => <option key={t} value={t}>{t}</option>)}
                                        </select>
                                      </div>
                                      <div>
                                        <label style={{ fontSize:10, fontWeight:600, color:"#6B7280", display:"block", marginBottom:3 }}>Duration (mins)</label>
                                        <select
                                          value={editDraft.video_duration ?? ""}
                                          onChange={ev => setEditDraft(d => ({ ...d, video_duration: ev.target.value }))}
                                          style={{ width:"100%", padding:"7px 10px", borderRadius:8, border:"1px solid #E5E7EB", fontSize:12, color:"#111111", outline:"none", background:"#fff", boxSizing:"border-box" }}>
                                          <option value="">Select…</option>
                                          {[1,1.5,2,2.5,3,3.5,4,4.5,5,6,7,8].map(m => <option key={m} value={`${m} min`}>{m} min</option>)}
                                        </select>
                                      </div>
                                      <div>
                                        <label style={{ fontSize:10, fontWeight:600, color:"#6B7280", display:"block", marginBottom:3 }}>Revisions</label>
                                        <input
                                          type="number" min="0" max="99"
                                          value={editDraft.revisions ?? 0}
                                          onChange={ev => setEditDraft(d => ({ ...d, revisions: parseInt(ev.target.value) || 0 }))}
                                          style={{ width:"100%", padding:"7px 10px", borderRadius:8, border:"1px solid #E5E7EB", fontSize:12, color:"#111111", outline:"none", background:"#fff", boxSizing:"border-box" }}
                                        />
                                      </div>
                                    </div>
                                  )}

                                  {/* Edit: start/end time (mirrors daily update form) */}
                                  {editDraft.task_type === "edit" && (
                                    <div>
                                      <label style={{ fontSize:10, fontWeight:600, color:"#6B7280", display:"block", marginBottom:3 }}>Editing Time</label>
                                      <div style={{ display:"flex", alignItems:"center", gap:8 }}>
                                        <input type="time" value={editDraft.start_time ?? ""}
                                          onChange={ev => {
                                            const st = ev.target.value
                                            const dur = calcDurationFromTimes(st, editDraft.end_time ?? "")
                                            setEditDraft(d => ({ ...d, start_time: st, duration_hours: dur ?? d.duration_hours }))
                                          }}
                                          style={{ flex:1, padding:"7px 10px", borderRadius:8, border:"1px solid #E5E7EB", fontSize:12, color:"#111111", outline:"none", background:"#fff", boxSizing:"border-box" }}
                                        />
                                        <span style={{ fontSize:11, color:"#9CA3AF", flexShrink:0 }}>to</span>
                                        <input type="time" value={editDraft.end_time ?? ""}
                                          onChange={ev => {
                                            const et = ev.target.value
                                            const dur = calcDurationFromTimes(editDraft.start_time ?? "", et)
                                            setEditDraft(d => ({ ...d, end_time: et, duration_hours: dur ?? d.duration_hours }))
                                          }}
                                          style={{ flex:1, padding:"7px 10px", borderRadius:8, border:"1px solid #E5E7EB", fontSize:12, color:"#111111", outline:"none", background:"#fff", boxSizing:"border-box" }}
                                        />
                                        {(() => { const d = calcDurationFromTimes(editDraft.start_time, editDraft.end_time); return d != null && d > 0 ? (
                                          <span style={{ fontSize:12, fontWeight:700, color:"#DE1A1A", flexShrink:0 }}>{fmtH(d)}</span>
                                        ) : null })()}
                                      </div>
                                    </div>
                                  )}

                                  {/* Shoot & Edit: drive link */}
                                  {(editDraft.task_type === "shoot" || editDraft.task_type === "edit") && (
                                    <div>
                                      <label style={{ fontSize:10, fontWeight:600, color:"#6B7280", display:"block", marginBottom:3 }}>Drive Link</label>
                                      <input
                                        type="url"
                                        value={editDraft.video_link ?? ""}
                                        onChange={ev => setEditDraft(d => ({ ...d, video_link: ev.target.value }))}
                                        placeholder="https://drive.google.com/…"
                                        style={{ width:"100%", padding:"7px 10px", borderRadius:8, border:"1px solid #E5E7EB", fontSize:12, color:"#111111", outline:"none", background:"#fff", boxSizing:"border-box" }}
                                      />
                                    </div>
                                  )}

                                  {/* Other: project name + status */}
                                  {editDraft.task_type === "other" && (
                                    <>
                                      <div>
                                        <label style={{ fontSize:10, fontWeight:600, color:"#6B7280", display:"block", marginBottom:3 }}>Project / Task Name</label>
                                        <input
                                          value={editDraft.project_name ?? ""}
                                          onChange={ev => setEditDraft(d => ({ ...d, project_name: ev.target.value }))}
                                          style={{ width:"100%", padding:"7px 10px", borderRadius:8, border:"1px solid #E5E7EB", fontSize:12, color:"#111111", outline:"none", background:"#fff", boxSizing:"border-box" }}
                                        />
                                      </div>
                                      <div>
                                        <label style={{ fontSize:10, fontWeight:600, color:"#6B7280", display:"block", marginBottom:3 }}>Status</label>
                                        <select
                                          value={editEntryStatus}
                                          onChange={ev => setEditEntryStatus(ev.target.value as typeof editEntryStatus)}
                                          style={{ width:"100%", padding:"7px 10px", borderRadius:8, border:"1px solid #E5E7EB", fontSize:12, color:"#111111", outline:"none", background:"#fff", boxSizing:"border-box" }}>
                                          <option value="not_started">Not Started</option>
                                          <option value="in_progress">In Progress</option>
                                          <option value="completed">Completed ✓</option>
                                        </select>
                                      </div>
                                    </>
                                  )}

                                  {/* Notes — shoot + edit types only */}
                                  {editDraft.task_type !== "other" && (
                                    <div>
                                      <label style={{ fontSize:10, fontWeight:600, color:"#6B7280", display:"block", marginBottom:3 }}>Notes</label>
                                      <textarea
                                        rows={2}
                                        value={editDraft.notes ?? ""}
                                        onChange={ev => setEditDraft(d => ({ ...d, notes: ev.target.value }))}
                                        style={{ width:"100%", padding:"7px 10px", borderRadius:8, border:"1px solid #E5E7EB", fontSize:12, color:"#111111", outline:"none", background:"#fff", resize:"none", boxSizing:"border-box" }}
                                      />
                                    </div>
                                  )}

                                  <div style={{ display:"flex", gap:8, justifyContent:"flex-end" }}>
                                    <button
                                      onClick={() => { setEditingKey(null); setEditDraft({}) }}
                                      style={{ padding:"7px 14px", borderRadius:8, background:"#F3F4F6", border:"none", fontSize:12, fontWeight:600, color:"#6B7280", cursor:"pointer" }}>
                                      Cancel
                                    </button>
                                    <button
                                      onClick={() => saveEntry(u.id, entries, ei)}
                                      disabled={savingKey === eKey}
                                      style={{ display:"flex", alignItems:"center", gap:5, padding:"7px 14px", borderRadius:8, background:"#6366F1", border:"none", fontSize:12, fontWeight:700, color:"#fff", cursor:"pointer", opacity: savingKey === eKey ? 0.6 : 1 }}>
                                      <Check size={12}/> {savingKey === eKey ? "Saving…" : "Save"}
                                    </button>
                                  </div>
                                </div>
                              </div>
                            )}
                          </div>
                        )
                      })}
                    </div>
                  )}

                {/* ── Collaborated entries for this day ── */}
                {(participatedByDate.get(u.date) ?? []).map(pu => {
                  const submitter = members.find(m => m.id === pu.user_id)
                  const puEntries = Array.isArray(pu.work_entries) ? pu.work_entries : []
                  return (
                    <div key={pu.id} style={{ borderTop: "1px dashed #E5E7EB", padding: "10px 18px", background: "rgba(99,102,241,0.03)" }}>
                      <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: puEntries.length > 0 ? 8 : 0 }}>
                        <span style={{ fontSize: 11, fontWeight: 700, color: "#6366F1" }}>👥 Collaborated</span>
                        <span style={{ fontSize: 11, color: "#9CA3AF" }}>
                          · by <span style={{ fontWeight: 700, color: "#6366F1" }}>{submitter?.name ?? "Teammate"}</span>
                        </span>
                        {(pu.working_hours ?? 0) > 0 && (
                          <span style={{ marginLeft: "auto", fontSize: 11, fontWeight: 700, color: "#6366F1" }}>
                            {fmtH(pu.working_hours!)}
                          </span>
                        )}
                      </div>
                      {puEntries.length > 0 && (
                        <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
                          {puEntries.slice(0, 5).map((e, i) => {
                            const cfg = TASK_CFG[(e as WorkEntry).task_type] ?? TASK_CFG.other
                            return (
                              <span key={i} style={{ fontSize: 11, fontWeight: 600, padding: "3px 10px", borderRadius: 99, background: "rgba(99,102,241,0.08)", color: "#6366F1", border: "1px solid rgba(99,102,241,0.15)" }}>
                                {(e as WorkEntry).title || cfg.label}
                                {(e as WorkEntry).client_name ? ` · ${(e as WorkEntry).client_name}` : ""}
                              </span>
                            )
                          })}
                          {puEntries.length > 5 && (
                            <span style={{ fontSize: 11, fontWeight: 600, padding: "3px 10px", borderRadius: 99, background: "rgba(156,163,175,0.1)", color: "#9CA3AF" }}>
                              +{puEntries.length - 5} more
                            </span>
                          )}
                        </div>
                      )}
                    </div>
                  )
                })}
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
                <span style={{ fontSize:10, fontWeight:600, color:"#9CA3AF" }}>{selectedMonth || "All Data"}</span>
              </div>
              {/* Line chart — hours per day */}
              <div style={{ height:120, marginBottom:12 }}>
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={stats.dailyData} margin={{ top:4, right:4, left:-28, bottom:0 }}>
                    <XAxis dataKey="day" tick={{ fontSize:9, fill:"#9CA3AF" }} tickLine={false} axisLine={false} />
                    <YAxis tick={{ fontSize:9, fill:"#9CA3AF" }} tickLine={false} axisLine={false} />
                    <Tooltip
                      contentStyle={{ fontSize:11, borderRadius:8, border:"1px solid #E5E7EB", background:"#fff" }}
                      formatter={(v) => [`${v as number}h`, "Hours"]}
                      labelFormatter={l => `Day ${l}`}
                    />
                    <ReferenceLine y={9.5} stroke="#F59E0B" strokeDasharray="4 3" strokeWidth={1.5} label={{ value:"9.5h", fontSize:9, fill:"#F59E0B", position:"right" }} />
                    <Line type="monotone" dataKey="hours" stroke="#DE1A1A" strokeWidth={2} dot={{ r:2, fill:"#DE1A1A" }} activeDot={{ r:4 }} />
                  </LineChart>
                </ResponsiveContainer>
              </div>
              <div style={{ display:"flex", flexDirection:"column", gap:9 }}>
                {[
                  { label:"Working Hours",   value: fmtH(stats.totalHours - stats.totalLearning), color:"#22C55E" },
                  { label:"Learning Hours",  value: fmtH(stats.totalLearning),                    color:"#6366F1" },
                  { label:"Overtime",        value: fmtH(stats.totalOT),                          color:"#F59E0B" },
                  { label:"Present Days",    value: String(stats.presentDays),                     color:"#DE1A1A" },
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
            </div>

            {/* Productivity Score */}
            <div style={{ background:"#fff", borderRadius:20, border:"1px solid #EBEDF2", padding:"18px", boxShadow:"0 2px 12px rgba(0,0,0,0.05)" }}>
              <div style={{ display:"flex", alignItems:"center", justifyContent:"space-between", marginBottom:16 }}>
                <span style={{ fontSize:13, fontWeight:800, color:"#111111" }}>Productivity Score</span>
                <span style={{ fontSize:10, fontWeight:600, color:"#9CA3AF" }}>{selectedMonth || "All Data"}</span>
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
                const ot = Math.max(0, h - 9.5)
                const max = Math.max(...stats.hoursPerDay.map(x => Math.max(0, x - 9.5)), 1)
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
