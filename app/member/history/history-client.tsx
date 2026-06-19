"use client"

import { useState, useMemo, useRef } from "react"
import { LineChart, Line, XAxis, YAxis, Tooltip, ReferenceLine, ResponsiveContainer } from "recharts"
import { useRouter } from "next/navigation"
import { deleteDailyUpdate, updatePastDailyUpdate, updateDailyUpdateLearning, addEntryToDate } from "@/lib/actions/daily-updates"

const INTERNAL_BRANDS = ["GROFAST DIGITAL", "KARTHICK BRANDS", "GROFAST AI"]
import Image from "next/image"
import {
  Camera, Film, Clock, CalendarDays,
  TrendingUp, Zap, BookOpen, Coffee, GraduationCap,
  CheckCircle2, Search, Trash2,
  ArrowRight, Flame, Star, X, Pencil, Check, ChevronDown,
  Mic, ImageIcon,
} from "lucide-react"

interface WorkEntry {
  id?: string; task_type: "shoot" | "edit" | "other" | "break" | "learning" | "voiceover" | "poster"
  title: string; client_name: string; duration_hours: number
  notes: string; start_time?: string | null; end_time?: string | null
  screenshot_url?: string | null; video_link?: string | null
  description?: string | null; project_name?: string | null
  is_multi_client?: boolean; client_names?: string[]
  video_type?: string | null; video_duration?: string | null; revisions?: number | null
  participant_ids?: string[]
  _travel_hours?: number | null; _location?: string | null
  _camera_hours?: number | null; _drone_hours?: number | null
  video_uploaded?: boolean | null
  date_given?: string | null; date_finished?: string | null
  drive_updated?: boolean | null; hooks_completed?: number | null
  _custom_label?: string | null
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
  absent:  { label:"On Leave", color:"#9CA3AF", bg:"rgba(0,0,0,0.06)",      dot:"#9CA3AF" },
  leave:   { label:"On Leave", color:"#9CA3AF", bg:"rgba(0,0,0,0.06)",      dot:"#9CA3AF" },
  holiday: { label:"Holiday",  color:"#6B7280", bg:"rgba(0,0,0,0.06)",      dot:"#9CA3AF" },
  wfh:     { label:"WFH",      color:"#6366F1", bg:"rgba(99,102,241,0.1)",  dot:"#6366F1" },
}
const TASK_CFG = {
  shoot:     { Icon: Camera,       color:"#EF4444", bg:"rgba(239,68,68,0.1)",    label:"Shoot"     },
  edit:      { Icon: Film,         color:"#6366F1", bg:"rgba(99,102,241,0.1)",   label:"Editing"   },
  other:     { Icon: BookOpen,     color:"#F59E0B", bg:"rgba(245,158,11,0.1)",   label:"Work"      },
  break:     { Icon: Coffee,       color:"#78716C", bg:"rgba(120,113,108,0.1)",  label:"Break"     },
  learning:  { Icon: GraduationCap, color:"#059669", bg:"rgba(5,150,105,0.12)", label:"Learning"  },
  voiceover: { Icon: Mic,          color:"#8B5CF6", bg:"rgba(139,92,246,0.1)",   label:"Voiceover" },
  poster:    { Icon: ImageIcon,    color:"#EC4899", bg:"rgba(236,72,153,0.1)",   label:"Poster"    },
}
const DOT_COLORS = ["#22C55E","#F59E0B","#6366F1","#EF4444","#0EA5E9","#EC4899"]

function parseLearningTitle(title: string | null): { client: string; topic: string } {
  if (!title) return { client: "", topic: "" }
  const m = title.match(/^\[([^\]]+)\]\s*(.*)$/)
  return m ? { client: m[1], topic: m[2] } : { client: "", topic: title }
}

function stripShootNotes(notes: string): string {
  if (!notes) return ""
  return notes.split(" | ").filter(p => !p.match(/^(Brand:|Shop:|Location:|Travel:|Client:)/)).join(" | ").trim()
}

function fmtTravel(h: number): string {
  const hrs = Math.floor(h), mins = Math.round((h % 1) * 60)
  return mins > 0 ? `${hrs}h ${mins}m` : `${hrs}h`
}

function calcDur(start?: string | null, end?: string | null): number {
  if (!start || !end) return 0
  const [sh, sm] = start.split(":").map(Number)
  const [eh, em] = end.split(":").map(Number)
  const diff = (eh * 60 + em) - (sh * 60 + sm)
  return diff > 0 ? Math.round((diff / 60) * 10) / 10 : 0
}
function toMins(t: string) { const [h, m] = t.split(":").map(Number); return h * 60 + m }

// Calculates net work hours by merging work intervals then subtracting any break
// intervals that overlap — so a break taken inside a work window doesn't count as work.
function calcNetWorkHours(entries: WorkEntry[]): number {
  const workEntries  = entries.filter(e => e.task_type !== "break" && e.task_type !== "learning")
  const breakEntries = entries.filter(e => e.task_type === "break")

  // Build and merge work intervals
  const workIntervals = workEntries
    .filter(e => e.start_time && e.end_time)
    .map(e => ({ start: toMins(e.start_time!), end: toMins(e.end_time!) }))
    .filter(i => i.end > i.start)
    .sort((a, b) => a.start - b.start)

  let merged: { start: number; end: number }[] = []
  if (workIntervals.length > 0) {
    let cs = workIntervals[0].start, ce = workIntervals[0].end
    for (let i = 1; i < workIntervals.length; i++) {
      if (workIntervals[i].start < ce) { ce = Math.max(ce, workIntervals[i].end) }
      else { merged.push({ start: cs, end: ce }); cs = workIntervals[i].start; ce = workIntervals[i].end }
    }
    merged.push({ start: cs, end: ce })
  }

  // Subtract break intervals that overlap with work intervals
  const breakIntervals = breakEntries
    .filter(e => e.start_time && e.end_time)
    .map(e => ({ start: toMins(e.start_time!), end: toMins(e.end_time!) }))
    .filter(i => i.end > i.start)
  for (const brk of breakIntervals) {
    const next: { start: number; end: number }[] = []
    for (const w of merged) {
      if (brk.end <= w.start || brk.start >= w.end) {
        next.push(w)
      } else {
        if (brk.start > w.start) next.push({ start: w.start, end: brk.start })
        if (brk.end < w.end)   next.push({ start: brk.end,  end: w.end   })
      }
    }
    merged = next
  }

  const timedMins = merged.reduce((s, i) => s + (i.end - i.start), 0)

  // Travel hours for shoots are always additive (travel happens outside shoot window)
  const travelH = workEntries
    .filter(e => e.task_type === "shoot")
    .reduce((s, e) => s + (e._travel_hours ?? 0), 0)
  // Entries with no time range — use their stored duration_hours directly
  const untimedH = workEntries
    .filter(e => !e.start_time || !e.end_time)
    .reduce((s, e) => s + (e.duration_hours ?? 0), 0)
  return Math.round((timedMins / 60 + travelH + untimedH) * 10) / 10
}

function HTimePicker({ value, onChange, style: extra }: { value: string; onChange: (v: string) => void; style?: React.CSSProperties }) {
  const [local, setLocal] = useState(value || "09:00")
  const prev = useRef(value)
  if (prev.current !== value) { prev.current = value; setLocal(value || "09:00") }
  return (
    <input type="time" value={local}
      onChange={e => { setLocal(e.target.value); if (e.target.value) onChange(e.target.value) }}
      style={{ fontSize:13, fontWeight:700, color:"#111827", background:"#F9FAFB", border:"1.5px solid #EBEDF2", borderRadius:8, padding:"7px 10px", outline:"none", colorScheme:"light", cursor:"pointer", ...extra }}
    />
  )
}

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

interface ApprovedLeave {
  id: string; leave_type: string; from_date: string; to_date: string
  reason: string | null; permission_time: string | null; permission_end_time: string | null
  permission_hours: number | null; half_day_from_time: string | null
  half_day_to_time: string | null; half_day_period: string | null
}

interface CompanyHoliday {
  id: string
  date: string
  name: string
}

// ═══════════════════════════════════════════════════════════════════════════════
export default function HistoryClient({
  updates, userName, userId = "", clients = [], pastClients = [], participatedUpdates = [], members = [], attendanceDates = [], approvedLeaves = [], companyLeaves = [],
}: {
  updates: UpdateRow[]
  userName: string
  userId?: string
  clients?: string[]
  pastClients?: string[]
  participatedUpdates?: ParticipatedUpdate[]
  members?: MemberInfo[]
  attendanceDates?: string[]
  approvedLeaves?: ApprovedLeave[]
  companyLeaves?: CompanyHoliday[]
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
    // For shoot entries: parse _travel_hours and _location from old concatenated notes as fallback
    let parsedTravelHours = entry._travel_hours ?? 0
    let parsedLocation = entry._location ?? ""
    if (entry.task_type === "shoot") {
      const rawNotes = entry.notes ?? ""
      if (!parsedTravelHours) {
        const travelMatch = rawNotes.match(/Travel:\s*([\d.]+)h/)
        if (travelMatch) parsedTravelHours = parseFloat(travelMatch[1])
      }
      if (!parsedLocation) {
        const locMatch = rawNotes.match(/Location:\s*([^|]+)/)
        if (locMatch) parsedLocation = locMatch[1].trim()
      }
      notes = stripShootNotes(notes)
    }
    setEditEntryStatus(parsedStatus)
    const BREAK_LABELS = ["Lunch", "Lunch Break", "Tea", "Short Break", "Personal", "Permission", "Early Logoff", "Late Login"]
    const isCustomBreak = entry.task_type === "break" && !BREAK_LABELS.includes(entry.title)
    setEditDraft({
      task_type: entry.task_type,
      title: entry.task_type === "break" ? (isCustomBreak ? "__other__" : entry.title) : entry.title,
      _custom_label: isCustomBreak ? entry.title : "",
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
      participant_ids: entry.participant_ids ?? [],
      _travel_hours: parsedTravelHours,
      _location: parsedLocation,
      _camera_hours: entry._camera_hours ?? 0,
      _drone_hours: entry._drone_hours ?? 0,
      video_uploaded: entry.video_uploaded ?? false,
      date_given: entry.date_given ?? "",
      date_finished: entry.date_finished ?? "",
      drive_updated: entry.drive_updated ?? false,
      hooks_completed: entry.hooks_completed ?? 0,
    })
  }

  async function saveEntry(updateId: string, allEntries: WorkEntry[], entryIdx: number) {
    const key = `${updateId}:${entryIdx}`
    if (editDraft.task_type === "edit") {
      if (!editDraft.date_given) { alert("Please set Date Given before saving."); return }
      if (!editDraft.date_finished) { alert("Please set Date Finished before saving."); return }
      if (!editDraft.start_time || !editDraft.end_time) { alert("Please set Edit Start & End Time before saving."); return }
      if (editDraft.start_time >= (editDraft.end_time ?? "")) { alert("Edit End Time must be after Start Time."); return }
      if (!editDraft.video_duration) { alert("Please select the video Duration before saving."); return }
    }
    setSavingKey(key)
    let draftToSave: Partial<WorkEntry> = { ...editDraft }
    if (editDraft.task_type === "other") {
      draftToSave = { ...editDraft, notes: `[${editEntryStatus}]` }
    } else if (editDraft.task_type === "shoot") {
      const travelH = editDraft._travel_hours ?? 0
      const dur = calcDur(editDraft.start_time, editDraft.end_time) || editDraft.duration_hours || 0
      const droneH = editDraft._drone_hours ?? 0
      const rebuiltNotes = [editDraft._location ? `Location: ${editDraft._location}` : "", editDraft.notes || "", travelH > 0 ? `Travel: ${travelH}h` : ""].filter(Boolean).join(" | ")
      draftToSave = { ...editDraft, notes: rebuiltNotes, duration_hours: dur, _camera_hours: (editDraft._camera_hours ?? 0) > 0 ? Math.max(0, dur - droneH) : 0 }
    } else if (editDraft.task_type === "edit") {
      draftToSave = { ...editDraft, duration_hours: calcDur(editDraft.start_time, editDraft.end_time) || editDraft.duration_hours || 0 }
    } else if (editDraft.task_type === "break") {
      const finalTitle = editDraft.title === "__other__" ? (editDraft._custom_label || "Break") : (editDraft.title || "Break")
      draftToSave = { ...editDraft, title: finalTitle, client_name: "Break", duration_hours: calcDur(editDraft.start_time, editDraft.end_time) || editDraft.duration_hours || 0 }
    }
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
    let totalHours = 0, totalTasks = 0, presentDays = 0, totalLearning = 0, totalBreak = 0
    let shootH = 0, editH = 0, otherH = 0
    let isMedia = false
    const hoursPerDay: number[] = []
    const dailyData: { day: string; hours: number }[] = []
    for (const u of monthFiltered) {
      const entries = Array.isArray(u.work_entries) ? u.work_entries : []
      const workH = calcNetWorkHours(entries)
      const learnFromEntries = entries.filter(e => e.task_type === "learning").reduce((sum, e) => sum + (e.duration_hours ?? 0), 0)
      const learnH = learnFromEntries > 0 ? learnFromEntries : (u.learning_hours ?? 0)
      const breakH = entries.filter(e => e.task_type === "break").reduce((sum, e) => sum + (e.duration_hours ?? 0), 0)
      const h = workH + learnH
      totalHours += h
      totalLearning += learnH
      totalBreak += breakH
      if (entries.some(e => e.task_type === "shoot" || e.task_type === "edit")) isMedia = true
      if (u.attendance_status === "present" || u.attendance_status === "wfh") presentDays++
      hoursPerDay.push(h)
      dailyData.push({ day: new Date(u.date + "T12:00:00").getDate().toString(), hours: Math.round(h * 10) / 10 })
      totalTasks += entries.filter(e => e.task_type !== "break" && e.task_type !== "learning").length
      for (const e of entries) {
        if (e.task_type === "shoot") shootH += (e.duration_hours ?? 0) + (e._travel_hours ?? 0)
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
      if (updateDates.has(d)) continue
      if (monthPrefix && !d.startsWith(monthPrefix)) continue
      presentDays++
    }

    // Absent days: elapsed calendar days in period minus present days
    const todayStr = new Date().toISOString().split("T")[0]
    const firstDate = monthFiltered.length > 0 ? monthFiltered[monthFiltered.length - 1].date : todayStr
    const elapsedDays = Math.floor((new Date(todayStr + "T12:00:00").getTime() - new Date(firstDate + "T12:00:00").getTime()) / 86400000) + 1
    const absentDays = Math.max(0, elapsedDays - presentDays)

    // Overtime = total monthly hours above (8.5h × presentDays). Zero if avg < 8.5h.
    const totalOT = Math.round(Math.max(0, totalHours - 8.5 * presentDays) * 10) / 10
    const avgH = presentDays > 0 ? Math.round((totalHours / presentDays) * 10) / 10 : 0

    const productivity = filtered.length > 0
      ? Math.min(100, Math.round((presentDays / filtered.length) * 100 * 0.6 + (totalHours > 0 ? Math.min(40, (totalHours / (filtered.length * 9.5)) * 40) : 0)))
      : 0
    return { totalHours, totalOT, totalTasks, presentDays, absentDays, totalLearning, totalBreak, shootH, editH, otherH, isMedia, avgH, hoursPerDay, dailyData: dailyData.reverse(), productivity }
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

  // Build holiday lookup maps
  const holidayMap = useMemo(() => new Map(companyLeaves.map(h => [h.date, h])), [companyLeaves])

  // Merge own updates + collab orphans + approved leave-only dates + company holidays
  type MergedItem =
    | { type: "own"; date: string; u: UpdateRow }
    | { type: "collab"; date: string; pus: ParticipatedUpdate[] }
    | { type: "leave"; date: string; leave: ApprovedLeave }
    | { type: "company_holiday"; date: string; holiday: CompanyHoliday }
  const mergedList = useMemo((): MergedItem[] => {
    // Show today, past, and tomorrow only (so member can see if tmr is a holiday/leave)
    const nowIST = new Date(Date.now() + 5.5 * 60 * 60 * 1000)
    nowIST.setDate(nowIST.getDate() + 1)
    const todayIST = nowIST.toISOString().split("T")[0]

    const ownDates = new Set(filtered.map(u => u.date))
    const monthPrefix = selectedMonth && monthFiltered[0]?.date ? monthFiltered[0].date.slice(0, 7) : null

    // Collab orphans — only past/today
    const orphans: { date: string; pus: ParticipatedUpdate[] }[] = []
    for (const [date, pus] of participatedByDate.entries()) {
      if (date > todayIST) continue
      if (ownDates.has(date)) continue
      if (dateActive && date !== selectedDate) continue
      if (monthPrefix && !date.startsWith(monthPrefix)) continue
      orphans.push({ date, pus })
    }
    orphans.sort((a, b) => b.date.localeCompare(a.date))

    // Approved leave dates — only days that have already arrived (ds <= todayIST)
    const leaveItems: MergedItem[] = []
    const collabDates = new Set(orphans.map(o => o.date))
    for (const leave of approvedLeaves) {
      const start = new Date(leave.from_date + "T12:00:00")
      const end   = new Date(leave.to_date   + "T12:00:00")
      const cur   = new Date(start)
      while (cur <= end) {
        const ds = cur.toISOString().split("T")[0]
        if (ds > todayIST) { cur.setDate(cur.getDate() + 1); continue }
        if (!ownDates.has(ds) && !collabDates.has(ds)) {
          if (!monthPrefix || ds.startsWith(monthPrefix)) {
            leaveItems.push({ type: "leave", date: ds, leave })
          }
        }
        cur.setDate(cur.getDate() + 1)
      }
    }

    // Company holidays — only days that have already arrived (date <= todayIST)
    const leaveDates = new Set(leaveItems.map(l => l.date))
    const holidayItems: MergedItem[] = []
    for (const holiday of companyLeaves) {
      if (holiday.date > todayIST) continue
      if (ownDates.has(holiday.date)) continue
      if (collabDates.has(holiday.date)) continue
      if (leaveDates.has(holiday.date)) continue
      if (dateActive && holiday.date !== selectedDate) continue
      if (monthPrefix && !holiday.date.startsWith(monthPrefix)) continue
      holidayItems.push({ type: "company_holiday", date: holiday.date, holiday })
    }

    const ownItems: MergedItem[]    = filtered.map(u => ({ type: "own", date: u.date, u }))
    const collabItems: MergedItem[] = orphans.map(o => ({ type: "collab", date: o.date, pus: o.pus }))
    return [...ownItems, ...collabItems, ...leaveItems, ...holidayItems].sort((a, b) => b.date.localeCompare(a.date))
  }, [filtered, participatedByDate, selectedMonth, monthFiltered, approvedLeaves, companyLeaves, dateActive, selectedDate])

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
          <div className="order-2 lg:order-none" style={{ display:"flex", flexDirection:"column", gap:16 }}>

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

            {/* ── STATS ROW ───────────────────────────────────────────────── */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">

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
                    const ot = Math.max(0, h - 8.5)
                    const max = Math.max(...stats.hoursPerDay.map(x => Math.max(0, x - 8.5)), 1)
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

            {/* ── ENTRIES LIST ────────────────────────────────────────────── */}
            {mergedList.length === 0 ? (
              <div style={{ background:"#fff", borderRadius:20, border:"1px solid #EBEDF2", padding:"48px 24px", textAlign:"center", boxShadow:"0 2px 10px rgba(0,0,0,0.05)" }}>
                <p style={{ fontSize:36, margin:"0 0 12px" }}>📋</p>
                <p style={{ fontSize:16, fontWeight:800, color:"#111111", margin:"0 0 6px" }}>No entries found</p>
                <p style={{ fontSize:13, color:"#9CA3AF", margin:0 }}>
                  {searchActive || dateActive || selectedMonth ? "Try clearing your filters" : "No daily updates submitted yet"}
                </p>
              </div>
            ) : mergedList.map(item => {
              // ── Collab-only card (no own update that day) ──
              if (item.type === "collab") {
                const collabDate = new Date(item.date + "T12:00:00")
                const collabDateLabel = collabDate.toLocaleDateString("en-US", { weekday:"long", day:"numeric", month:"long", year:"numeric" })
                return (
                  <div key={`c-${item.date}`} style={{ background:"#fff", borderRadius:20, border:"1.5px dashed rgba(99,102,241,0.3)", overflow:"hidden", boxShadow:"0 2px 10px rgba(0,0,0,0.04)" }}>
                    <div style={{ display:"flex", alignItems:"center", justifyContent:"space-between", padding:"12px 18px", borderBottom:"1px solid #F5F6FA", background:"rgba(99,102,241,0.03)" }}>
                      <div style={{ display:"flex", alignItems:"center", gap:10 }}>
                        <div style={{ minWidth:36, textAlign:"center" }}>
                          <span style={{ fontSize:16, fontWeight:900, color:"#6366F1", display:"block", lineHeight:1 }}>{collabDate.getDate()}</span>
                          <span style={{ fontSize:8, fontWeight:700, color:"#6366F1", textTransform:"uppercase" }}>{collabDate.toLocaleDateString("en-US",{month:"short"})}</span>
                        </div>
                        <div>
                          <p style={{ fontSize:12, fontWeight:800, color:"#111111", margin:0 }}>{collabDateLabel}</p>
                          <p style={{ fontSize:10, color:"#9CA3AF", margin:0 }}>Collaborated — no own submission</p>
                        </div>
                      </div>
                    </div>
                    {item.pus.map(pu => {
                      const submitter = members.find(m => m.id === pu.user_id)
                      const allEnt = (Array.isArray(pu.work_entries) ? pu.work_entries : []) as WorkEntry[]
                      const perEntry = userId ? allEnt.filter(e => Array.isArray(e.participant_ids) && e.participant_ids.includes(userId)) : allEnt
                      const puEntries = perEntry.length > 0 ? perEntry : allEnt.filter(e => e.task_type !== "break" && e.task_type !== "learning")
                      return (
                        <div key={pu.id} style={{ padding:"12px 18px", borderTop:"1px dashed rgba(99,102,241,0.15)" }}>
                          <div style={{ display:"flex", alignItems:"center", gap:6, marginBottom: puEntries.length > 0 ? 10 : 0 }}>
                            <span style={{ fontSize:11, fontWeight:700, color:"#6366F1" }}>👥 Collaborated</span>
                            <span style={{ fontSize:11, color:"#9CA3AF" }}>· by <span style={{ fontWeight:700, color:"#6366F1" }}>{submitter?.name ?? "Teammate"}</span></span>
                          </div>
                          {puEntries.map((pe, pi) => {
                            const cfg = TASK_CFG[pe.task_type] ?? TASK_CFG.other
                            const { Icon } = cfg
                            const displayTitle = pe.title || cfg.label
                            const displayClient = (pe.is_multi_client && pe.client_names?.length) ? pe.client_names.join(" · ") : pe.client_name || ""
                            const tH = pe.task_type === "shoot" ? (pe._travel_hours ?? 0) : 0
                            const dur = calcDurationFromTimes(pe.start_time, pe.end_time) ?? (pe.duration_hours ?? 0)
                            return (
                              <div key={pi} style={{ display:"flex", gap:10, padding: pi > 0 ? "10px 0 0" : "0", borderTop: pi > 0 ? "1px solid rgba(99,102,241,0.08)" : "none", alignItems:"flex-start" }}>
                                <div style={{ width:30, height:30, borderRadius:8, background:cfg.bg, display:"flex", alignItems:"center", justifyContent:"center", flexShrink:0 }}>
                                  <Icon size={13} style={{ color:cfg.color }}/>
                                </div>
                                <div style={{ flex:1, minWidth:0 }}>
                                  <div style={{ display:"flex", alignItems:"center", gap:6, flexWrap:"wrap", marginBottom:2 }}>
                                    <span style={{ fontSize:12, fontWeight:800, color:"#111111" }}>{displayTitle}</span>
                                    <span style={{ fontSize:9, fontWeight:700, color:cfg.color, background:cfg.bg, padding:"1px 6px", borderRadius:99 }}>{cfg.label}</span>
                                  </div>
                                  {displayClient && <p style={{ fontSize:10, color:"#6B7280", margin:"0 0 2px", fontWeight:600 }}>{displayClient}</p>}
                                  <div style={{ display:"flex", alignItems:"center", gap:10, flexWrap:"wrap" }}>
                                    {dur + tH > 0 && <span style={{ fontSize:10, fontWeight:700, color:"#374151", display:"flex", alignItems:"center", gap:3 }}><Clock size={9} style={{ color:"#9CA3AF" }}/>{fmtH(dur + tH)}</span>}
                                    {pe.start_time && pe.end_time && <span style={{ fontSize:10, color:"#9CA3AF" }}>{fmt12(pe.start_time)} – {fmt12(pe.end_time)}</span>}
                                    {tH > 0 && <span style={{ fontSize:10, color:"#F59E0B", fontWeight:700 }}>🚗 {fmtTravel(tH)}</span>}
                                  </div>
                                </div>
                              </div>
                            )
                          })}
                        </div>
                      )
                    })}
                  </div>
                )
              }

              // ── Approved leave card (no daily_updates entry) ──
              if (item.type === "leave") {
                const leave = item.leave
                const ld = new Date(item.date + "T12:00:00")
                const ldLabel = ld.toLocaleDateString("en-US", { weekday:"long", day:"numeric", month:"long", year:"numeric" })
                const ldMon = ld.toLocaleDateString("en-US", { month:"short" })

                if (leave.leave_type === "full_day") {
                  return (
                    <div key={`leave-${item.date}`} style={{ background:"#fff", borderRadius:20, border:"1px solid rgba(16,185,129,0.2)", overflow:"hidden", boxShadow:"0 2px 10px rgba(0,0,0,0.05)" }}>
                      <div style={{ display:"flex", alignItems:"center", justifyContent:"space-between", padding:"14px 18px", borderBottom:"1px solid rgba(16,185,129,0.1)", background:"rgba(16,185,129,0.02)" }}>
                        <div style={{ display:"flex", alignItems:"center", gap:10 }}>
                          <div style={{ width:38, height:38, borderRadius:10, background:"rgba(16,185,129,0.1)", display:"flex", flexDirection:"column", alignItems:"center", justifyContent:"center", flexShrink:0 }}>
                            <span style={{ fontSize:14, fontWeight:900, color:"#059669", lineHeight:1 }}>{ld.getDate()}</span>
                            <span style={{ fontSize:8, fontWeight:700, color:"#059669", textTransform:"uppercase" }}>{ldMon}</span>
                          </div>
                          <div>
                            <p style={{ fontSize:13, fontWeight:800, color:"#111111", margin:0 }}>{ldLabel}</p>
                            <p style={{ fontSize:10, color:"#9CA3AF", margin:0 }}>Full Day Leave</p>
                          </div>
                        </div>
                        <span style={{ fontSize:11, fontWeight:700, color:"#10B981", background:"rgba(16,185,129,0.12)", padding:"3px 10px", borderRadius:99 }}>Approved</span>
                      </div>
                      <div style={{ display:"flex", alignItems:"center", gap:16, padding:"20px 18px", background:"linear-gradient(135deg,rgba(16,185,129,0.06) 0%,rgba(16,185,129,0.02) 100%)" }}>
                        <div style={{ fontSize:36, lineHeight:1 }}>🌴</div>
                        <div>
                          <p style={{ fontSize:14, fontWeight:900, color:"#059669", margin:"0 0 3px" }}>Full Day Leave</p>
                          <p style={{ fontSize:12, color:"#6B7280", margin:0 }}>{leave.reason ?? "Approved Leave"}</p>
                        </div>
                      </div>
                    </div>
                  )
                }

                if (leave.leave_type === "permission") {
                  const startT = leave.permission_time ?? ""
                  let endT = leave.permission_end_time ?? ""
                  if (!endT && leave.permission_hours && startT) {
                    const [fh, fm] = startT.split(":").map(Number)
                    const totalMins = fh * 60 + fm + Math.round(leave.permission_hours * 60)
                    endT = `${String(Math.floor(totalMins / 60)).padStart(2,"0")}:${String(totalMins % 60).padStart(2,"0")}`
                  }
                  const dur = startT && endT ? calcDurationFromTimes(startT, endT) : null
                  return (
                    <div key={`leave-${item.date}`} style={{ background:"#fff", borderRadius:20, border:"1px solid rgba(99,102,241,0.2)", overflow:"hidden", boxShadow:"0 2px 10px rgba(0,0,0,0.05)" }}>
                      <div style={{ display:"flex", alignItems:"center", justifyContent:"space-between", padding:"14px 18px", borderBottom:"1px solid rgba(99,102,241,0.1)", background:"rgba(99,102,241,0.02)" }}>
                        <div style={{ display:"flex", alignItems:"center", gap:10 }}>
                          <div style={{ width:38, height:38, borderRadius:10, background:"rgba(99,102,241,0.1)", display:"flex", flexDirection:"column", alignItems:"center", justifyContent:"center", flexShrink:0 }}>
                            <span style={{ fontSize:14, fontWeight:900, color:"#6366F1", lineHeight:1 }}>{ld.getDate()}</span>
                            <span style={{ fontSize:8, fontWeight:700, color:"#6366F1", textTransform:"uppercase" }}>{ldMon}</span>
                          </div>
                          <div>
                            <p style={{ fontSize:13, fontWeight:800, color:"#111111", margin:0 }}>{ldLabel}</p>
                            <p style={{ fontSize:10, color:"#9CA3AF", margin:0 }}>Permission Leave</p>
                          </div>
                        </div>
                        <span style={{ fontSize:11, fontWeight:700, color:"#6366F1", background:"rgba(99,102,241,0.12)", padding:"3px 10px", borderRadius:99 }}>Approved</span>
                      </div>
                      <div style={{ display:"flex", alignItems:"center", gap:16, padding:"18px 18px" }}>
                        <div style={{ fontSize:32, lineHeight:1 }}>🕐</div>
                        <div style={{ flex:1 }}>
                          <p style={{ fontSize:14, fontWeight:900, color:"#6366F1", margin:"0 0 3px" }}>Permission</p>
                          <p style={{ fontSize:12, color:"#6B7280", margin:"0 0 6px" }}>{leave.reason ?? "Permission Leave"}</p>
                          {startT && (
                            <div style={{ display:"flex", alignItems:"center", gap:8, flexWrap:"wrap" }}>
                              <span style={{ fontSize:11, fontWeight:700, color:"#374151", display:"flex", alignItems:"center", gap:4 }}>
                                <Clock size={11} style={{ color:"#9CA3AF" }}/>
                                {fmt12(startT)}{endT ? ` – ${fmt12(endT)}` : ""}
                              </span>
                              {dur && dur > 0 && (
                                <span style={{ fontSize:10, fontWeight:700, color:"#6366F1", background:"rgba(99,102,241,0.1)", padding:"2px 8px", borderRadius:99 }}>{fmtH(dur)}</span>
                              )}
                            </div>
                          )}
                        </div>
                      </div>
                    </div>
                  )
                }

                if (leave.leave_type === "half_day") {
                  const startT = leave.half_day_from_time ?? ""
                  const endT   = leave.half_day_to_time   ?? ""
                  const dur    = startT && endT ? calcDurationFromTimes(startT, endT) : null
                  const period = leave.half_day_period ?? ""
                  return (
                    <div key={`leave-${item.date}`} style={{ background:"#fff", borderRadius:20, border:"1px solid rgba(245,158,11,0.2)", overflow:"hidden", boxShadow:"0 2px 10px rgba(0,0,0,0.05)" }}>
                      <div style={{ display:"flex", alignItems:"center", justifyContent:"space-between", padding:"14px 18px", borderBottom:"1px solid rgba(245,158,11,0.1)", background:"rgba(245,158,11,0.02)" }}>
                        <div style={{ display:"flex", alignItems:"center", gap:10 }}>
                          <div style={{ width:38, height:38, borderRadius:10, background:"rgba(245,158,11,0.1)", display:"flex", flexDirection:"column", alignItems:"center", justifyContent:"center", flexShrink:0 }}>
                            <span style={{ fontSize:14, fontWeight:900, color:"#D97706", lineHeight:1 }}>{ld.getDate()}</span>
                            <span style={{ fontSize:8, fontWeight:700, color:"#D97706", textTransform:"uppercase" }}>{ldMon}</span>
                          </div>
                          <div>
                            <p style={{ fontSize:13, fontWeight:800, color:"#111111", margin:0 }}>{ldLabel}</p>
                            <p style={{ fontSize:10, color:"#9CA3AF", margin:0 }}>Half Day Leave{period ? ` · ${period}` : ""}</p>
                          </div>
                        </div>
                        <span style={{ fontSize:11, fontWeight:700, color:"#D97706", background:"rgba(245,158,11,0.12)", padding:"3px 10px", borderRadius:99 }}>Approved</span>
                      </div>
                      <div style={{ display:"flex", alignItems:"center", gap:16, padding:"18px 18px" }}>
                        <div style={{ fontSize:32, lineHeight:1 }}>🌓</div>
                        <div style={{ flex:1 }}>
                          <p style={{ fontSize:14, fontWeight:900, color:"#D97706", margin:"0 0 3px" }}>Half Day Leave</p>
                          <p style={{ fontSize:12, color:"#6B7280", margin:"0 0 6px" }}>{leave.reason ?? "Half Day Leave"}</p>
                          {startT && endT && (
                            <div style={{ display:"flex", alignItems:"center", gap:8, flexWrap:"wrap" }}>
                              <span style={{ fontSize:11, fontWeight:700, color:"#374151", display:"flex", alignItems:"center", gap:4 }}>
                                <Clock size={11} style={{ color:"#9CA3AF" }}/>
                                {fmt12(startT)} – {fmt12(endT)}
                              </span>
                              {dur && dur > 0 && (
                                <span style={{ fontSize:10, fontWeight:700, color:"#D97706", background:"rgba(245,158,11,0.1)", padding:"2px 8px", borderRadius:99 }}>{fmtH(dur)}</span>
                              )}
                            </div>
                          )}
                        </div>
                      </div>
                    </div>
                  )
                }

                return null
              }

              // ── Company holiday card ──
              if (item.type === "company_holiday") {
                const hd = new Date(item.date + "T12:00:00")
                const hdLabel = hd.toLocaleDateString("en-US", { weekday:"long", day:"numeric", month:"long", year:"numeric" })
                const hdMon   = hd.toLocaleDateString("en-US", { month:"short" })
                return (
                  <div key={`holiday-${item.date}`} style={{ background:"#FFFFFF", borderRadius:20, border:"1px solid rgba(30,64,175,0.2)", overflow:"hidden", boxShadow:"0 2px 10px rgba(0,0,0,0.05)" }}>
                    <div style={{ display:"flex", alignItems:"center", justifyContent:"space-between", padding:"14px 18px", borderBottom:"1px solid rgba(30,64,175,0.1)", background:"rgba(30,64,175,0.02)" }}>
                      <div style={{ display:"flex", alignItems:"center", gap:10 }}>
                        <div style={{ width:38, height:38, borderRadius:10, background:"rgba(30,64,175,0.1)", display:"flex", flexDirection:"column", alignItems:"center", justifyContent:"center", flexShrink:0 }}>
                          <span style={{ fontSize:14, fontWeight:900, color:"#1E40AF", lineHeight:1 }}>{hd.getDate()}</span>
                          <span style={{ fontSize:8, fontWeight:700, color:"#1E40AF", textTransform:"uppercase" }}>{hdMon}</span>
                        </div>
                        <div>
                          <p style={{ fontSize:13, fontWeight:800, color:"#111111", margin:0 }}>{hdLabel}</p>
                          <p style={{ fontSize:10, color:"#9CA3AF", margin:0 }}>Company Holiday</p>
                        </div>
                      </div>
                      <span style={{ fontSize:11, fontWeight:700, color:"#1E40AF", background:"rgba(30,64,175,0.12)", padding:"3px 10px", borderRadius:99 }}>Holiday</span>
                    </div>
                    <div style={{ display:"flex", alignItems:"center", gap:16, padding:"20px 18px", background:"linear-gradient(135deg,rgba(30,64,175,0.06) 0%,rgba(30,64,175,0.02) 100%)" }}>
                      <div style={{ fontSize:36, lineHeight:1 }}>🏢</div>
                      <div>
                        <p style={{ fontSize:14, fontWeight:900, color:"#1E40AF", margin:"0 0 3px" }}>{item.holiday.name}</p>
                        <p style={{ fontSize:12, color:"#6B7280", margin:0 }}>Company Holiday · No work required</p>
                      </div>
                    </div>
                  </div>
                )
              }

              // ── Own update card ──
              const u = item.u
              const entries = (Array.isArray(u.work_entries) ? [...u.work_entries] : []).sort((a, b) => {
                const ta = a.start_time ?? ""
                const tb = b.start_time ?? ""
                if (!ta && !tb) return 0
                if (!ta) return 1
                if (!tb) return -1
                return ta.localeCompare(tb)
              })
              const st = STATUS_STYLE[u.attendance_status] ?? STATUS_STYLE.present
              const dateLabel = new Date(u.date + "T12:00:00").toLocaleDateString("en-US", { weekday:"long", day:"numeric", month:"long", year:"numeric" })
              const holidayOnDay = holidayMap.get(u.date)
              return (
                <div key={u.id} style={{ background:"#fff", borderRadius:20, border:"1px solid #EBEDF2", overflow:"hidden", boxShadow:"0 2px 10px rgba(0,0,0,0.05)" }}>
                  {/* Holiday banner */}
                  {holidayOnDay && (
                    <div style={{ display:"flex", alignItems:"center", gap:8, padding:"8px 18px", background:"rgba(30,64,175,0.08)", borderBottom:"1px solid rgba(30,64,175,0.12)" }}>
                      <span style={{ fontSize:14 }}>🏢</span>
                      <span style={{ fontSize:11, fontWeight:700, color:"#1E40AF" }}>Company Holiday: {holidayOnDay.name}</span>
                    </div>
                  )}
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
                            const workCount  = entries.filter(e => e.task_type !== "break" && e.task_type !== "learning").length
                            const learnCount = entries.filter(e => e.task_type === "learning").length + (u.learning_topic && !entries.some(e => e.task_type === "learning") ? 1 : 0)
                            const breakCount = entries.filter(e => e.task_type === "break").length
                            const parts = []
                            if (workCount > 0) parts.push(`${workCount} work ${workCount === 1 ? "entry" : "entries"}`)
                            if (learnCount > 0) parts.push(`${learnCount} learning`)
                            if (breakCount > 0 && workCount === 0) parts.push(`${breakCount} break${breakCount > 1 ? "s" : ""} only`)
                            return parts.length > 0 ? parts.join(" + ") : "No entries"
                          })()}
                        </p>
                      </div>
                    </div>
                    <div style={{ display:"flex", alignItems:"center", gap:8 }}>
                      {(() => {
                        const learnFromEntries = entries.filter(e => e.task_type === "learning").reduce((sum, e) => sum + (e.duration_hours ?? 0), 0)
                        const entryCalcH = calcNetWorkHours(entries) + (learnFromEntries > 0 ? learnFromEntries : (u.learning_hours ?? 0))
                        const dayEntryH = entryCalcH > 0 ? entryCalcH : (u.working_hours ?? 0)
                        const breakH = entries.filter(e => e.task_type === "break").reduce((sum, e) => sum + (e.duration_hours ?? 0), 0)
                        return (
                          <>
                            {dayEntryH > 0 && (
                              <span style={{ fontSize:11, fontWeight:700, color:"#374151", display:"flex", alignItems:"center", gap:4 }}>
                                <Clock size={11} style={{ color:"#9CA3AF" }}/>
                                {fmtH(dayEntryH)}
                              </span>
                            )}
                            {breakH > 0 && (
                              <span style={{ fontSize:10, fontWeight:700, color:"#78716C", display:"flex", alignItems:"center", gap:3, background:"rgba(120,113,108,0.08)", border:"1px solid rgba(120,113,108,0.18)", borderRadius:99, padding:"2px 8px" }}>
                                ☕ {fmtH(breakH)} break
                              </span>
                            )}
                          </>
                        )
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
                        {(() => { const { client, topic } = parseLearningTitle(u.learning_topic); return (
                        <div style={{ flex:1, minWidth:0 }}>
                          <div style={{ display:"flex", alignItems:"center", gap:8, marginBottom:3, flexWrap:"wrap" }}>
                            <span style={{ fontSize:13, fontWeight:800, color:"#111111" }}>{topic || u.learning_topic}</span>
                            <span style={{ fontSize:10, fontWeight:700, color:"#059669", background:"rgba(5,150,105,0.12)", padding:"2px 8px", borderRadius:99 }}>Learning</span>
                          </div>
                          {client && <p style={{ fontSize:11, color:"#6B7280", margin:"0 0 3px", fontWeight:600 }}>{client}</p>}
                          <span style={{ fontSize:10, fontWeight:700, color:"#374151", display:"inline-flex", alignItems:"center", gap:6, marginTop:4 }}>
                            {(u.learning_hours ?? 0) > 0 && <><Clock size={9} style={{ color:"#9CA3AF" }}/>{fmtH(u.learning_hours!)}</>}
                            {u.learning_start_time && u.learning_end_time && (
                              <span style={{ color:"#9CA3AF", fontWeight:500 }}>{fmt12(u.learning_start_time)} – {fmt12(u.learning_end_time)}</span>
                            )}
                          </span>
                        </div>
                        )})()}
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
                  ) : entries.length === 1 && entries[0]?.title?.includes("Full Day Leave") ? (
                    <div style={{ display:"flex", alignItems:"center", gap:16, padding:"20px 18px", background:"linear-gradient(135deg, rgba(16,185,129,0.06) 0%, rgba(16,185,129,0.02) 100%)", borderTop:"1px solid rgba(16,185,129,0.12)" }}>
                      <div style={{ fontSize:40, lineHeight:1 }}>🌴</div>
                      <div>
                        <p style={{ fontSize:14, fontWeight:900, color:"#059669", margin:"0 0 3px" }}>Full Day Leave</p>
                        <p style={{ fontSize:12, color:"#6B7280", margin:0 }}>{entries[0]?.client_name ?? "Approved Leave"}</p>
                      </div>
                      <span style={{ marginLeft:"auto", fontSize:11, fontWeight:700, padding:"4px 12px", borderRadius:99, background:"rgba(16,185,129,0.12)", color:"#10B981" }}>Approved</span>
                    </div>
                  ) : entries.length === 0 ? (
                    <p style={{ fontSize:12, color:"#9CA3AF", padding:"16px 18px", margin:0 }}>
                      {(u.attendance_status === "leave" || u.attendance_status === "absent") ? "You were on leave this day." : "No work entries logged"}
                    </p>
                  ) : (
                    <div>
                      {u.learning_topic && (
                        <div style={{ borderBottom:"1px solid #F5F6FA", background:"rgba(245,158,11,0.03)" }}>
                          <div style={{ display:"flex", gap:14, padding:"14px 18px", alignItems:"flex-start" }}>
                            <div style={{ width:34, height:34, borderRadius:10, background:"rgba(245,158,11,0.12)", display:"flex", alignItems:"center", justifyContent:"center", flexShrink:0 }}>
                              <BookOpen size={15} style={{ color:"#D97706" }}/>
                            </div>
                            {(() => { const { client, topic } = parseLearningTitle(u.learning_topic); return (
                            <div style={{ flex:1, minWidth:0 }}>
                              <div style={{ display:"flex", alignItems:"center", gap:8, marginBottom:3, flexWrap:"wrap" }}>
                                <span style={{ fontSize:13, fontWeight:800, color:"#111111" }}>{topic || u.learning_topic}</span>
                                <span style={{ fontSize:10, fontWeight:700, color:"#059669", background:"rgba(5,150,105,0.12)", padding:"2px 8px", borderRadius:99 }}>Learning</span>
                              </div>
                              {client && <p style={{ fontSize:11, color:"#6B7280", margin:"0 0 3px", fontWeight:600 }}>{client}</p>}
                              <span style={{ fontSize:10, fontWeight:700, color:"#374151", display:"inline-flex", alignItems:"center", gap:6, marginTop:4 }}>
                                {(u.learning_hours ?? 0) > 0 && <><Clock size={9} style={{ color:"#9CA3AF" }}/>{fmtH(u.learning_hours!)}</>}
                                {u.learning_start_time && u.learning_end_time && (
                                  <span style={{ color:"#9CA3AF", fontWeight:500 }}>{fmt12(u.learning_start_time)} – {fmt12(u.learning_end_time)}</span>
                                )}
                              </span>
                            </div>
                            )})()}
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
                                {(() => {
                                  const isLearning = e.task_type === "learning"
                                  const { client: parsedClient, topic: parsedTopic } = isLearning ? parseLearningTitle(e.title) : { client: "", topic: "" }
                                  const displayTitle = isLearning ? (parsedTopic || e.title || cfg.label) : (e.title || cfg.label)
                                  const displayClient = isLearning
                                    ? parsedClient
                                    : (e.is_multi_client && e.client_names && e.client_names.length > 0)
                                      ? e.client_names.join(" · ")
                                      : (e.client_name || "")
                                  return (<>
                                    <div style={{ display:"flex", alignItems:"center", gap:8, marginBottom:3, flexWrap:"wrap" }}>
                                      <span style={{ fontSize:13, fontWeight:800, color:"#111111" }}>{displayTitle}</span>
                                      <span style={{ fontSize:10, fontWeight:700, color:cfg.color, background:cfg.bg, padding:"2px 8px", borderRadius:99 }}>{cfg.label}</span>
                                    </div>
                                    {displayClient && <p style={{ fontSize:11, color:"#6B7280", margin:"0 0 3px", fontWeight:600 }}>{displayClient}</p>}
                                    {!isLearning && (() => {
                                      if (e.task_type === "shoot") {
                                        const tH = e._travel_hours ?? (() => { const m = (e.notes??"").match(/Travel:\s*([\d.]+)h/); return m ? parseFloat(m[1]) : 0 })()
                                        const loc = e._location ?? (() => { const m = (e.notes??"").match(/Location:\s*([^|]+)/); return m ? m[1].trim() : "" })()
                                        const realNotes = stripShootNotes(e.notes ?? "")
                                        return (<>
                                          {(loc || tH > 0) && <p style={{ fontSize:10, fontWeight:700, color:"#F59E0B", margin:"0 0 3px" }}>{loc ? `📍 ${loc}` : ""}{loc && tH > 0 ? " · " : ""}{tH > 0 ? `🚗 ${fmtTravel(tH)} travel` : ""}</p>}
                                          {realNotes && <p style={{ fontSize:11, color:"#9CA3AF", margin:"0 0 4px", lineHeight:1.5 }}>{realNotes}</p>}
                                        </>)
                                      }
                                      const txt = e.notes || e.description
                                      return txt ? <p style={{ fontSize:11, color:"#9CA3AF", margin:"0 0 4px", lineHeight:1.5 }}>{txt}</p> : null
                                    })()}
                                  </>)
                                })()}
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
                                  {(e.participant_ids ?? []).length > 0 && (
                                    <span style={{ fontSize:10, fontWeight:700, color:"#6366F1", display:"flex", alignItems:"center", gap:3 }}>
                                      👥 {(e.participant_ids ?? []).map(pid => members.find(m => m.id === pid)?.name ?? "Teammate").join(", ")}
                                    </span>
                                  )}
                                </div>
                              </div>
                              {/* Per-entry actions — locked for auto-inserted leave entries */}
                              {!(e as unknown as Record<string, unknown>)._is_leave && (
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
                              )}
                            </div>

                            {/* Inline edit form */}
                            {isEditingEntry && (
                              <div style={{ margin:"0 18px 14px", padding:"14px", borderRadius:12, background:"#F8F9FF", border:"1.5px solid rgba(99,102,241,0.25)" }}>

                                {/* ── BREAK ── */}
                                {editDraft.task_type === "break" && (()=>{
                                  const dur = calcDur(editDraft.start_time, editDraft.end_time)
                                  return (<div style={{ display:"flex", flexDirection:"column", gap:8 }}>
                                    <p style={{ fontSize:11, fontWeight:700, color:"#D97706", margin:"0 0 2px" }}>✏️ Edit Break</p>
                                    <div>
                                      <label style={{ fontSize:10, fontWeight:600, color:"#6B7280", display:"block", marginBottom:3 }}>Date</label>
                                      <input type="date" value={editDraftDate} onChange={ev=>setEditDraftDate(ev.target.value)} style={{ width:"100%", padding:"7px 10px", borderRadius:8, border: editDraftDate!==editOrigDate?"1.5px solid #6366F1":"1px solid #E5E7EB", fontSize:12, color:"#111111", outline:"none", background:"#fff", boxSizing:"border-box" }} />
                                      {editDraftDate!==editOrigDate && <p style={{ fontSize:10, color:"#6366F1", margin:"3px 0 0", fontWeight:600 }}>Moves to {new Date(editDraftDate+"T12:00:00").toLocaleDateString("en-US",{day:"numeric",month:"short",year:"numeric"})}</p>}
                                    </div>
                                    <div style={{ background:"#FFFBEB", borderRadius:12, border:"1.5px solid rgba(245,158,11,0.3)", padding:"10px 14px", display:"flex", alignItems:"center", gap:10, flexWrap:"wrap" }}>
                                      <HTimePicker value={editDraft.start_time??"13:00"} onChange={v=>setEditDraft(d=>({...d,start_time:v}))} />
                                      <span style={{ fontSize:11, color:"#9CA3AF", flexShrink:0 }}>to</span>
                                      <HTimePicker value={editDraft.end_time??"13:30"} onChange={v=>setEditDraft(d=>({...d,end_time:v}))} />
                                      {dur>0 && <span style={{ fontSize:10, fontWeight:700, padding:"3px 8px", borderRadius:99, background:"rgba(245,158,11,0.12)", color:"#D97706" }}>{fmtTravel(dur)}</span>}
                                      <select value={editDraft.title??"Lunch"} onChange={ev=>setEditDraft(d=>({...d,title:ev.target.value,_custom_label:""}))}
                                        style={{ fontSize:11, fontWeight:700, color:"#D97706", background:"#FEF3C7", border:"1.5px solid rgba(245,158,11,0.35)", borderRadius:8, padding:"4px 10px", cursor:"pointer", outline:"none" }}>
                                        <option value="Permission">🙋 Permission</option>
                                        <option value="Tea">☕ Tea</option>
                                        <option value="Lunch Break">🍱 Lunch Break</option>
                                        <option value="Personal">🏠 Personal</option>
                                        <option value="Short Break">🚶 Short Break</option>
                                        <option value="Early Logoff">🌙 Early Logoff</option>
                                        <option value="Late Login">⏰ Late Login</option>
                                        <option value="__other__">✏️ Other</option>
                                      </select>
                                      {editDraft.title==="__other__" && <input value={editDraft._custom_label??""} onChange={ev=>setEditDraft(d=>({...d,_custom_label:ev.target.value}))} placeholder="Type break name…" style={{ fontSize:11, fontWeight:700, color:"#D97706", background:"#FEF3C7", border:"1.5px solid rgba(245,158,11,0.4)", borderRadius:8, padding:"4px 10px", outline:"none", width:130 }} />}
                                    </div>
                                    <div style={{ display:"flex", gap:8, justifyContent:"flex-end" }}>
                                      <button onClick={()=>{setEditingKey(null);setEditDraft({})}} style={{ padding:"7px 14px", borderRadius:8, background:"#F3F4F6", border:"none", fontSize:12, fontWeight:600, color:"#6B7280", cursor:"pointer" }}>Cancel</button>
                                      <button onClick={()=>saveEntry(u.id,entries,ei)} disabled={savingKey===eKey} style={{ display:"flex", alignItems:"center", gap:5, padding:"7px 14px", borderRadius:8, background:"#D97706", border:"none", fontSize:12, fontWeight:700, color:"#fff", cursor:"pointer", opacity:savingKey===eKey?0.6:1 }}><Check size={12}/> {savingKey===eKey?"Saving…":"Save"}</button>
                                    </div>
                                  </div>)
                                })()}

                                {/* ── SHOOT ── */}
                                {editDraft.task_type === "shoot" && (()=>{
                                  const HF: React.CSSProperties = { background:"#F9FAFB", border:"1.5px solid #EBEDF2", color:"#111827", borderRadius:10, padding:"9px 12px", fontSize:13, outline:"none", width:"100%", boxSizing:"border-box" as const }
                                  const HL: React.CSSProperties = { display:"block", fontSize:10, fontWeight:700, color:"#374151", textTransform:"uppercase" as const, letterSpacing:"0.1em", marginBottom:5 }
                                  const dur = calcDur(editDraft.start_time, editDraft.end_time)
                                  const droneH = editDraft._drone_hours ?? 0
                                  const cameraOn = (editDraft._camera_hours ?? 0) > 0
                                  const droneOn = droneH > 0
                                  return (<div style={{ display:"flex", flexDirection:"column", gap:10 }}>
                                    <p style={{ fontSize:11, fontWeight:800, color:"#EF4444", margin:"0 0 2px", textTransform:"uppercase", letterSpacing:"0.1em" }}>✏️ Edit Shoot</p>
                                    <div>
                                      <label style={HL}>Date</label>
                                      <input type="date" value={editDraftDate} onChange={ev=>setEditDraftDate(ev.target.value)} style={{ ...HF, colorScheme:"light" }} />
                                      {editDraftDate!==editOrigDate && <p style={{ fontSize:10, color:"#6366F1", margin:"3px 0 0", fontWeight:600 }}>Moves to {new Date(editDraftDate+"T12:00:00").toLocaleDateString("en-US",{day:"numeric",month:"short",year:"numeric"})}</p>}
                                    </div>
                                    <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:10 }}>
                                      <div>
                                        <label style={HL}>Client / Project *</label>
                                        <div style={{ position:"relative" }}>
                                          {editClientShowPast
                                            ? <div>
                                                <button type="button" onClick={()=>setEditClientShowPast(false)} style={{ fontSize:11, fontWeight:700, color:"#6366F1", background:"none", border:"none", cursor:"pointer", padding:"0 0 6px", display:"block" }}>← Back</button>
                                                <div style={{ position:"relative" }}>
                                                  <select value="" onChange={ev=>{if(ev.target.value){setEditDraft(d=>({...d,client_name:ev.target.value}));setEditClientShowPast(false)}}} style={{ ...HF, paddingRight:28, appearance:"none" }}>
                                                    <option value="">— Select past client —</option>
                                                    {pastClientsOnly.map(c=><option key={c} value={c}>{c}</option>)}
                                                  </select>
                                                  <ChevronDown size={11} style={{ position:"absolute", right:10, top:"50%", transform:"translateY(-50%)", color:"#9CA3AF", pointerEvents:"none" }} />
                                                </div>
                                              </div>
                                            : <select value={editDraft.client_name??""} onChange={ev=>{const v=ev.target.value;if(v==="__past_clients__")setEditClientShowPast(true);else setEditDraft(d=>({...d,client_name:v}))}} style={{ ...HF, paddingRight:28, appearance:"none" }}>
                                                <option value="">Select client…</option>
                                                {activeClientsForEdit.map(c=><option key={c} value={c}>{c}</option>)}
                                                {editDraft.client_name && !activeClientsForEdit.includes(editDraft.client_name) && pastClientsOnly.includes(editDraft.client_name) && <option key={editDraft.client_name} value={editDraft.client_name}>{editDraft.client_name}</option>}
                                                {pastClientsOnly.length>0 && <option value="__past_clients__">📁 Past Clients →</option>}
                                              </select>
                                          }
                                          <ChevronDown size={11} style={{ position:"absolute", right:10, top:"50%", transform:"translateY(-50%)", color:"#9CA3AF", pointerEvents:"none" }} />
                                        </div>
                                      </div>
                                      <div>
                                        <label style={HL}>Shoot Type / Title *</label>
                                        <input value={editDraft.title??""} onChange={ev=>setEditDraft(d=>({...d,title:ev.target.value}))} placeholder="e.g. Basketball Tournament Shoot" style={HF} />
                                      </div>
                                    </div>
                                    <div>
                                      <label style={HL}>Time</label>
                                      <div style={{ display:"flex", alignItems:"center", gap:8, flexWrap:"wrap" }}>
                                        <HTimePicker value={editDraft.start_time??"09:00"} onChange={v=>setEditDraft(d=>({...d,start_time:v}))} />
                                        <span style={{ fontSize:11, color:"#9CA3AF", flexShrink:0 }}>to</span>
                                        <HTimePicker value={editDraft.end_time??"17:00"} onChange={v=>setEditDraft(d=>({...d,end_time:v}))} />
                                      </div>
                                    </div>
                                    <div>
                                      <label style={HL}>Duration</label>
                                      <div style={{ display:"inline-flex", alignItems:"center", gap:6, padding:"8px 14px", borderRadius:8, background:dur>0?"rgba(222,26,26,0.06)":"#F9FAFB", border:dur>0?"1.5px solid rgba(222,26,26,0.2)":"1.5px solid #EBEDF2" }}>
                                        <span style={{ fontSize:13, fontWeight:700, color:dur>0?"#DE1A1A":"#9CA3AF" }}>{dur>0?fmtTravel(dur):"—"}</span>
                                        <span style={{ fontSize:10, color:"#9CA3AF", fontWeight:500 }}>auto</span>
                                      </div>
                                    </div>
                                    <div>
                                      <label style={HL}>Shoot Type</label>
                                      <div style={{ display:"flex", gap:8, marginBottom:8 }}>
                                        <button type="button" onClick={()=>setEditDraft(d=>({...d,_camera_hours:cameraOn?0:1}))} style={{ display:"flex", alignItems:"center", gap:6, padding:"8px 14px", borderRadius:10, border:cameraOn?"2px solid #6366F1":"1.5px solid #EBEDF2", background:cameraOn?"rgba(99,102,241,0.1)":"#F9FAFB", color:cameraOn?"#4338CA":"#6B7280", fontSize:12, fontWeight:700, cursor:"pointer" }}>📷 Camera Shoot</button>
                                        <button type="button" onClick={()=>setEditDraft(d=>({...d,_drone_hours:droneOn?0:1}))} style={{ display:"flex", alignItems:"center", gap:6, padding:"8px 14px", borderRadius:10, border:droneOn?"2px solid #D97706":"1.5px solid #EBEDF2", background:droneOn?"rgba(245,158,11,0.1)":"#F9FAFB", color:droneOn?"#D97706":"#6B7280", fontSize:12, fontWeight:700, cursor:"pointer" }}>🚁 Drone Shooting</button>
                                      </div>
                                      {cameraOn && <div style={{ marginBottom:6, padding:"8px 14px", borderRadius:8, background:"rgba(99,102,241,0.06)", border:"1.5px solid rgba(99,102,241,0.2)", display:"inline-flex", alignItems:"center", gap:6 }}><span style={{ fontSize:13, fontWeight:700, color:"#4338CA" }}>{fmtTravel(Math.max(0,dur-droneH))}</span><span style={{ fontSize:10, color:"#9CA3AF" }}>camera (auto: total − drone)</span></div>}
                                      {droneOn && <div style={{ marginBottom:6 }}>
                                        <label style={{ display:"block", fontSize:10, fontWeight:600, color:"#6B7280", marginBottom:4 }}>🚁 Drone Hours</label>
                                        <select value={String(droneH)} onChange={ev=>setEditDraft(d=>({...d,_drone_hours:parseFloat(ev.target.value)||0}))} style={{ ...HF, width:"auto" }}>
                                          {[0.25,0.5,0.75,1,1.5,2,2.5,3,4,5].map(v=><option key={v} value={String(v)}>{fmtTravel(v)}</option>)}
                                        </select>
                                      </div>}
                                    </div>
                                    <div>
                                      <label style={HL}>🚗 Travel Time</label>
                                      <div style={{ display:"flex", alignItems:"center", gap:6 }}>
                                        <input type="number" min={0} max={12} placeholder="0" value={Math.floor(editDraft._travel_hours??0)||""} onChange={ev=>{const h=Math.max(0,Math.min(12,Number(ev.target.value)||0));const m=Math.round(((editDraft._travel_hours??0)-Math.floor(editDraft._travel_hours??0))*60);setEditDraft(d=>({...d,_travel_hours:h+m/60}))}} style={{ ...HF, width:60, textAlign:"center" }} />
                                        <span style={{ fontSize:11, color:"#6B7280", fontWeight:600 }}>hr</span>
                                        <input type="number" min={0} max={59} placeholder="0" value={Math.round(((editDraft._travel_hours??0)-Math.floor(editDraft._travel_hours??0))*60)||""} onChange={ev=>{const m=Math.max(0,Math.min(59,Number(ev.target.value)||0));const h=Math.floor(editDraft._travel_hours??0);setEditDraft(d=>({...d,_travel_hours:h+m/60}))}} style={{ ...HF, width:60, textAlign:"center" }} />
                                        <span style={{ fontSize:11, color:"#6B7280", fontWeight:600 }}>min</span>
                                        {(editDraft._travel_hours??0)>0 && <span style={{ fontSize:11, fontWeight:700, color:"#F59E0B" }}>+{fmtTravel(editDraft._travel_hours??0)} travel</span>}
                                      </div>
                                    </div>
                                    <div>
                                      <label style={HL}>📍 Location</label>
                                      <input value={editDraft._location??""} onChange={ev=>setEditDraft(d=>({...d,_location:ev.target.value}))} placeholder="e.g. Anna Nagar, Chennai" style={HF} />
                                    </div>
                                    <div>
                                      <label style={HL}>🔗 Drive Link</label>
                                      <input value={editDraft.video_link??""} onChange={ev=>setEditDraft(d=>({...d,video_link:ev.target.value}))} placeholder="Paste Google Drive / folder link…" style={HF} />
                                    </div>
                                    <div style={{ display:"grid", gridTemplateColumns:"1fr auto", gap:10, alignItems:"end" }}>
                                      <div>
                                        <label style={HL}>Notes</label>
                                        <textarea rows={2} value={editDraft.notes??""} onChange={ev=>setEditDraft(d=>({...d,notes:ev.target.value}))} placeholder="Shots taken, any issues…" style={{ ...HF, resize:"none" }} />
                                      </div>
                                      <button type="button" onClick={()=>setEditDraft(d=>({...d,video_uploaded:!d.video_uploaded}))} style={{ display:"flex", alignItems:"center", gap:6, padding:"9px 14px", borderRadius:10, border:"1.5px solid", cursor:"pointer", fontSize:11, fontWeight:700, whiteSpace:"nowrap", background:editDraft.video_uploaded?"rgba(34,197,94,0.1)":"#F9FAFB", borderColor:editDraft.video_uploaded?"rgba(34,197,94,0.4)":"#EBEDF2", color:editDraft.video_uploaded?"#16A34A":"#9CA3AF" }}>{editDraft.video_uploaded?"Uploaded ✓":"Video Uploaded?"}</button>
                                    </div>
                                    {members.length>0 && (
                                      <div style={{ paddingTop:8, borderTop:"1px dashed #F0F1F5" }}>
                                        <p style={{ fontSize:10, fontWeight:700, color:"#9CA3AF", textTransform:"uppercase", letterSpacing:"0.07em", margin:"0 0 7px" }}>👥 Shot With</p>
                                        {(editDraft.participant_ids??[]).length>0 && <div style={{ display:"flex", flexWrap:"wrap", gap:4, marginBottom:6 }}>{(editDraft.participant_ids??[]).map(pid=>{const m=members.find(t=>t.id===pid);if(!m)return null;const ini=m.name.split(" ").map((n:string)=>n[0]).join("").slice(0,2).toUpperCase();return(<button key={pid} type="button" onClick={()=>setEditDraft(d=>({...d,participant_ids:(d.participant_ids??[]).filter(p=>p!==pid)}))} style={{ display:"flex", alignItems:"center", gap:4, padding:"3px 8px 3px 5px", borderRadius:99, background:"rgba(239,68,68,0.1)", border:"1.5px solid rgba(239,68,68,0.3)", cursor:"pointer" }}><div style={{ width:16, height:16, borderRadius:"50%", background:"#EF4444", display:"flex", alignItems:"center", justifyContent:"center", fontSize:7, fontWeight:900, color:"#fff" }}>{ini}</div><span style={{ fontSize:10, fontWeight:700, color:"#B91C1C" }}>{m.name.split(" ")[0]}</span><span style={{ fontSize:8, color:"#EF4444" }}>✕</span></button>)})}</div>}
                                        <div style={{ display:"flex", flexWrap:"wrap", gap:4 }}>{members.map(m=>{const sel=(editDraft.participant_ids??[]).includes(m.id);const ini=m.name.split(" ").map((n:string)=>n[0]).join("").slice(0,2).toUpperCase();return(<button key={m.id} type="button" onClick={()=>setEditDraft(d=>({...d,participant_ids:sel?(d.participant_ids??[]).filter(p=>p!==m.id):[...(d.participant_ids??[]),m.id]}))} style={{ display:"flex", alignItems:"center", gap:4, padding:"3px 8px 3px 5px", borderRadius:99, cursor:"pointer", background:sel?"rgba(239,68,68,0.1)":"#F9FAFB", border:`1.5px solid ${sel?"rgba(239,68,68,0.4)":"#EBEDF2"}` }}><div style={{ width:16, height:16, borderRadius:"50%", background:sel?"#EF4444":"#E5E7EB", display:"flex", alignItems:"center", justifyContent:"center", fontSize:7, fontWeight:900, color:sel?"#fff":"#9CA3AF" }}>{ini}</div><span style={{ fontSize:10, fontWeight:700, color:sel?"#B91C1C":"#374151" }}>{m.name.split(" ")[0]}</span>{sel&&<span style={{ fontSize:8, color:"#EF4444" }}>✓</span>}</button>)})}</div>
                                      </div>
                                    )}
                                    <div style={{ display:"flex", gap:8, justifyContent:"flex-end", borderTop:"1px solid #F0F1F5", paddingTop:12, marginTop:4 }}>
                                      <button onClick={()=>{setEditingKey(null);setEditDraft({})}} style={{ padding:"7px 14px", borderRadius:8, background:"#F3F4F6", border:"none", fontSize:12, fontWeight:600, color:"#6B7280", cursor:"pointer" }}>Cancel</button>
                                      <button onClick={()=>saveEntry(u.id,entries,ei)} disabled={savingKey===eKey} style={{ display:"flex", alignItems:"center", gap:5, padding:"9px 20px", borderRadius:10, background:"#DE1A1A", border:"none", fontSize:12, fontWeight:700, color:"#fff", cursor:"pointer", opacity:savingKey===eKey?0.7:1, boxShadow:"0 4px 12px rgba(222,26,26,0.3)" }}><Check size={12}/> {savingKey===eKey?"Saving…":"Save Shoot"}</button>
                                    </div>
                                  </div>)
                                })()}

                                {/* ── EDITING ENTRY ── */}
                                {editDraft.task_type === "edit" && (()=>{
                                  const HF: React.CSSProperties = { background:"#F9FAFB", border:"1.5px solid #EBEDF2", color:"#111827", borderRadius:10, padding:"9px 12px", fontSize:13, outline:"none", width:"100%", boxSizing:"border-box" as const }
                                  const HL: React.CSSProperties = { display:"block", fontSize:10, fontWeight:700, color:"#374151", textTransform:"uppercase" as const, letterSpacing:"0.1em", marginBottom:5 }
                                  const dur = calcDur(editDraft.start_time, editDraft.end_time)
                                  return (<div style={{ display:"flex", flexDirection:"column", gap:10 }}>
                                    <p style={{ fontSize:11, fontWeight:800, color:"#6366F1", margin:"0 0 2px", textTransform:"uppercase", letterSpacing:"0.1em" }}>✏️ Edit Editing Entry</p>
                                    <div>
                                      <label style={HL}>Date</label>
                                      <input type="date" value={editDraftDate} onChange={ev=>setEditDraftDate(ev.target.value)} style={{ ...HF, colorScheme:"light" }} />
                                      {editDraftDate!==editOrigDate && <p style={{ fontSize:10, color:"#6366F1", margin:"3px 0 0", fontWeight:600 }}>Moves to {new Date(editDraftDate+"T12:00:00").toLocaleDateString("en-US",{day:"numeric",month:"short",year:"numeric"})}</p>}
                                    </div>
                                    <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:10 }}>
                                      <div><label style={HL}>Date Given <span style={{ color:"#EF4444" }}>*</span></label><input type="date" value={editDraft.date_given??""} onChange={ev=>setEditDraft(d=>({...d,date_given:ev.target.value}))} style={{ ...HF, colorScheme:"light", borderColor: !editDraft.date_given ? "#EF4444" : "#EBEDF2" }} /></div>
                                      <div><label style={HL}>Date Finished <span style={{ color:"#EF4444" }}>*</span></label><input type="date" value={editDraft.date_finished??""} onChange={ev=>setEditDraft(d=>({...d,date_finished:ev.target.value}))} style={{ ...HF, colorScheme:"light", borderColor: !editDraft.date_finished ? "#EF4444" : "#EBEDF2" }} /></div>
                                    </div>
                                    <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:10 }}>
                                      <div>
                                        <label style={HL}>Client Name *</label>
                                        <div style={{ position:"relative" }}>
                                          {editClientShowPast
                                            ? <div>
                                                <button type="button" onClick={()=>setEditClientShowPast(false)} style={{ fontSize:11, fontWeight:700, color:"#6366F1", background:"none", border:"none", cursor:"pointer", padding:"0 0 6px", display:"block" }}>← Back</button>
                                                <div style={{ position:"relative" }}>
                                                  <select value="" onChange={ev=>{if(ev.target.value){setEditDraft(d=>({...d,client_name:ev.target.value}));setEditClientShowPast(false)}}} style={{ ...HF, paddingRight:28, appearance:"none" }}>
                                                    <option value="">— Select past client —</option>
                                                    {pastClientsOnly.map(c=><option key={c} value={c}>{c}</option>)}
                                                  </select>
                                                  <ChevronDown size={11} style={{ position:"absolute", right:10, top:"50%", transform:"translateY(-50%)", color:"#9CA3AF", pointerEvents:"none" }} />
                                                </div>
                                              </div>
                                            : <select value={editDraft.client_name??""} onChange={ev=>{const v=ev.target.value;if(v==="__past_clients__")setEditClientShowPast(true);else setEditDraft(d=>({...d,client_name:v}))}} style={{ ...HF, paddingRight:28, appearance:"none" }}>
                                                <option value="">Select client…</option>
                                                {activeClientsForEdit.map(c=><option key={c} value={c}>{c}</option>)}
                                                {editDraft.client_name && !activeClientsForEdit.includes(editDraft.client_name) && pastClientsOnly.includes(editDraft.client_name) && <option key={editDraft.client_name} value={editDraft.client_name}>{editDraft.client_name}</option>}
                                                {pastClientsOnly.length>0 && <option value="__past_clients__">📁 Past Clients →</option>}
                                              </select>
                                          }
                                          <ChevronDown size={11} style={{ position:"absolute", right:10, top:"50%", transform:"translateY(-50%)", color:"#9CA3AF", pointerEvents:"none" }} />
                                        </div>
                                      </div>
                                      <div><label style={HL}>Video Name *</label><input value={editDraft.title??""} onChange={ev=>setEditDraft(d=>({...d,title:ev.target.value}))} placeholder="e.g. Evan Styles Makeover Reel" style={HF} /></div>
                                    </div>
                                    <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr 110px", gap:10 }}>
                                      <div>
                                        <label style={HL}>Video Type</label>
                                        <div style={{ position:"relative" }}>
                                          <select value={editDraft.video_type??""} onChange={ev=>setEditDraft(d=>({...d,video_type:ev.target.value}))} style={{ ...HF, paddingRight:28, appearance:"none" }}>
                                            <option value="">Select type…</option>
                                            {["Instagram Reels","Hook","Personal Branding","Ads and Hooks","Long Videos","Cinematic","YouTube Shorts"].map(t=><option key={t} value={t}>{t}</option>)}
                                            <option value="__other__">✏️ Other</option>
                                          </select>
                                          <ChevronDown size={11} style={{ position:"absolute", right:10, top:"50%", transform:"translateY(-50%)", color:"#9CA3AF", pointerEvents:"none" }} />
                                        </div>
                                      </div>
                                      <div>
                                        <label style={HL}>Duration (mins)</label>
                                        <div style={{ position:"relative" }}>
                                          <select value={editDraft.video_duration??""} onChange={ev=>setEditDraft(d=>({...d,video_duration:ev.target.value}))} style={{ ...HF, paddingRight:28, appearance:"none" }}>
                                            <option value="">Select…</option>
                                            <option value="15 sec">15 sec</option>
                                            <option value="30 sec">30 sec</option>
                                            <option value="45 sec">45 sec</option>
                                            {[1,1.5,2,2.5,3,3.5,4,4.5,5,10].map(m=><option key={m} value={`${m} min`}>{m} min</option>)}
                                          </select>
                                          <ChevronDown size={11} style={{ position:"absolute", right:10, top:"50%", transform:"translateY(-50%)", color:"#9CA3AF", pointerEvents:"none" }} />
                                        </div>
                                      </div>
                                      <div><label style={HL}>Revisions</label><input type="number" min="0" max="99" value={editDraft.revisions??0} onChange={ev=>setEditDraft(d=>({...d,revisions:parseInt(ev.target.value)||0}))} placeholder="0" style={HF} /></div>
                                    </div>
                                    <div>
                                      <label style={HL}>🪝 Hooks Completed</label>
                                      <input type="number" min="0" max="99" value={editDraft.hooks_completed??0} onChange={ev=>setEditDraft(d=>({...d,hooks_completed:Math.max(0,parseInt(ev.target.value)||0)}))} placeholder="0" style={{ ...HF, width:100 }} />
                                    </div>
                                    <div>
                                      <label style={HL}>✏️ Editing Time <span style={{ color:"#EF4444" }}>*</span></label>
                                      <div style={{ display:"flex", alignItems:"center", gap:8, flexWrap:"wrap" }}>
                                        <HTimePicker value={editDraft.start_time??"09:00"} onChange={v=>setEditDraft(d=>({...d,start_time:v}))} style={{ borderColor: !editDraft.start_time ? "#EF4444" : "#EBEDF2" }} />
                                        <span style={{ fontSize:11, color:"#9CA3AF", flexShrink:0 }}>to</span>
                                        <HTimePicker value={editDraft.end_time??"09:00"} onChange={v=>setEditDraft(d=>({...d,end_time:v}))} style={{ borderColor: !editDraft.end_time ? "#EF4444" : "#EBEDF2" }} />
                                      </div>
                                    </div>
                                    <div style={{ display:"flex", alignItems:"center", justifyContent:"space-between" }}>
                                      <div style={{ display:"inline-flex", alignItems:"center", gap:6, padding:"8px 14px", borderRadius:8, background:dur>0?"rgba(222,26,26,0.06)":"#F9FAFB", border:dur>0?"1.5px solid rgba(222,26,26,0.2)":"1.5px solid #EBEDF2" }}>
                                        <span style={{ fontSize:13, fontWeight:700, color:dur>0?"#DE1A1A":"#9CA3AF" }}>{dur>0?fmtTravel(dur):"—"}</span>
                                        <span style={{ fontSize:10, color:"#9CA3AF", fontWeight:500 }}>auto</span>
                                      </div>
                                      <button type="button" onClick={()=>setEditDraft(d=>({...d,drive_updated:!d.drive_updated}))} style={{ display:"flex", alignItems:"center", gap:6, padding:"9px 14px", borderRadius:10, border:"1.5px solid", cursor:"pointer", fontSize:11, fontWeight:700, background:editDraft.drive_updated?"rgba(34,197,94,0.1)":"#F9FAFB", borderColor:editDraft.drive_updated?"rgba(34,197,94,0.4)":"#EBEDF2", color:editDraft.drive_updated?"#16A34A":"#9CA3AF" }}>{editDraft.drive_updated?"Drive Updated ✓":"Drive Updated?"}</button>
                                    </div>
                                    <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:10 }}>
                                      <div><label style={HL}>Notes</label><textarea rows={2} value={editDraft.notes??""} onChange={ev=>setEditDraft(d=>({...d,notes:ev.target.value}))} placeholder="Software used, challenges…" style={{ ...HF, resize:"none" }} /></div>
                                      <div><label style={HL}>Drive / Video Link</label><input value={editDraft.video_link??""} onChange={ev=>setEditDraft(d=>({...d,video_link:ev.target.value}))} placeholder="https://drive.google.com/…" style={HF} /></div>
                                    </div>
                                    {members.length>0 && (
                                      <div style={{ paddingTop:8, borderTop:"1px dashed #F0F1F5" }}>
                                        <p style={{ fontSize:10, fontWeight:700, color:"#9CA3AF", textTransform:"uppercase", letterSpacing:"0.07em", margin:"0 0 7px" }}>👥 Edited With</p>
                                        {(editDraft.participant_ids??[]).length>0 && <div style={{ display:"flex", flexWrap:"wrap", gap:4, marginBottom:6 }}>{(editDraft.participant_ids??[]).map(pid=>{const m=members.find(t=>t.id===pid);if(!m)return null;const ini=m.name.split(" ").map((n:string)=>n[0]).join("").slice(0,2).toUpperCase();return(<button key={pid} type="button" onClick={()=>setEditDraft(d=>({...d,participant_ids:(d.participant_ids??[]).filter(p=>p!==pid)}))} style={{ display:"flex", alignItems:"center", gap:4, padding:"3px 8px 3px 5px", borderRadius:99, background:"rgba(99,102,241,0.1)", border:"1.5px solid rgba(99,102,241,0.3)", cursor:"pointer" }}><div style={{ width:16, height:16, borderRadius:"50%", background:"#6366F1", display:"flex", alignItems:"center", justifyContent:"center", fontSize:7, fontWeight:900, color:"#fff" }}>{ini}</div><span style={{ fontSize:10, fontWeight:700, color:"#4338CA" }}>{m.name.split(" ")[0]}</span><span style={{ fontSize:8, color:"#6366F1" }}>✕</span></button>)})}</div>}
                                        <div style={{ display:"flex", flexWrap:"wrap", gap:4 }}>{members.map(m=>{const sel=(editDraft.participant_ids??[]).includes(m.id);const ini=m.name.split(" ").map((n:string)=>n[0]).join("").slice(0,2).toUpperCase();return(<button key={m.id} type="button" onClick={()=>setEditDraft(d=>({...d,participant_ids:sel?(d.participant_ids??[]).filter(p=>p!==m.id):[...(d.participant_ids??[]),m.id]}))} style={{ display:"flex", alignItems:"center", gap:4, padding:"3px 8px 3px 5px", borderRadius:99, cursor:"pointer", background:sel?"rgba(99,102,241,0.1)":"#F9FAFB", border:`1.5px solid ${sel?"rgba(99,102,241,0.4)":"#EBEDF2"}` }}><div style={{ width:16, height:16, borderRadius:"50%", background:sel?"#6366F1":"#E5E7EB", display:"flex", alignItems:"center", justifyContent:"center", fontSize:7, fontWeight:900, color:sel?"#fff":"#9CA3AF" }}>{ini}</div><span style={{ fontSize:10, fontWeight:700, color:sel?"#4338CA":"#374151" }}>{m.name.split(" ")[0]}</span>{sel&&<span style={{ fontSize:8, color:"#6366F1" }}>✓</span>}</button>)})}</div>
                                      </div>
                                    )}
                                    <div style={{ display:"flex", gap:8, justifyContent:"flex-end", borderTop:"1px solid #F0F1F5", paddingTop:12, marginTop:4 }}>
                                      <button onClick={()=>{setEditingKey(null);setEditDraft({})}} style={{ padding:"7px 14px", borderRadius:8, background:"#F3F4F6", border:"none", fontSize:12, fontWeight:600, color:"#6B7280", cursor:"pointer" }}>Cancel</button>
                                      <button onClick={()=>saveEntry(u.id,entries,ei)} disabled={savingKey===eKey} style={{ display:"flex", alignItems:"center", gap:5, padding:"9px 20px", borderRadius:10, background:"#6366F1", border:"none", fontSize:12, fontWeight:700, color:"#fff", cursor:"pointer", opacity:savingKey===eKey?0.7:1, boxShadow:"0 4px 12px rgba(99,102,241,0.3)" }}><Check size={12}/> {savingKey===eKey?"Saving…":"Save Edit"}</button>
                                    </div>
                                  </div>)
                                })()}

                                {/* ── OTHER / LEARNING ── */}
                                {(editDraft.task_type === "other" || editDraft.task_type === "learning") && (
                                  <div style={{ display:"flex", flexDirection:"column", gap:8 }}>
                                    <p style={{ fontSize:11, fontWeight:700, color:"#6366F1", margin:"0 0 2px" }}>Edit Entry</p>
                                    <div>
                                      <label style={{ fontSize:10, fontWeight:600, color:"#6B7280", display:"block", marginBottom:3 }}>Date</label>
                                      <input type="date" value={editDraftDate} onChange={ev=>setEditDraftDate(ev.target.value)} style={{ width:"100%", padding:"7px 10px", borderRadius:8, border:editDraftDate!==editOrigDate?"1.5px solid #6366F1":"1px solid #E5E7EB", fontSize:12, color:"#111111", outline:"none", background:"#fff", boxSizing:"border-box" }} />
                                      {editDraftDate!==editOrigDate && <p style={{ fontSize:10, color:"#6366F1", margin:"3px 0 0", fontWeight:600 }}>Moves to {new Date(editDraftDate+"T12:00:00").toLocaleDateString("en-US",{day:"numeric",month:"short",year:"numeric"})}</p>}
                                    </div>
                                    <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:8 }}>
                                      <div>
                                        <label style={{ fontSize:10, fontWeight:600, color:"#6B7280", display:"block", marginBottom:3 }}>Title</label>
                                        <input value={editDraft.title??""} onChange={ev=>setEditDraft(d=>({...d,title:ev.target.value}))} style={{ width:"100%", padding:"7px 10px", borderRadius:8, border:"1px solid #E5E7EB", fontSize:12, color:"#111111", outline:"none", background:"#fff", boxSizing:"border-box" }} />
                                      </div>
                                      <div>
                                        <label style={{ fontSize:10, fontWeight:600, color:"#6B7280", display:"block", marginBottom:3 }}>Client</label>
                                        {editDraft.task_type==="learning"
                                          ? <select value={editDraft.client_name??""} onChange={ev=>setEditDraft(d=>({...d,client_name:ev.target.value}))} style={{ width:"100%", padding:"7px 10px", borderRadius:8, border:"1px solid #E5E7EB", fontSize:12, color:"#111111", outline:"none", background:"#fff", boxSizing:"border-box" }}>
                                              <option value="GROFAST DIGITAL">GROFAST DIGITAL</option>
                                              <option value="GROFAST AI">GROFAST AI</option>
                                              <option value="KARTHICK BRANDS">KARTHICK BRANDS</option>
                                            </select>
                                          : editDraft.is_multi_client
                                          ? <p style={{ fontSize:11, fontWeight:700, color:"#374151", padding:"7px 0" }}>{(editDraft.client_names??[]).join(" · ")||"—"}</p>
                                          : editClientShowPast
                                          ? <div>
                                              <button type="button" onClick={()=>setEditClientShowPast(false)} style={{ width:"100%", padding:"6px 10px", borderRadius:8, border:"1px solid #E5E7EB", fontSize:12, color:"#6366F1", fontWeight:700, background:"rgba(99,102,241,0.06)", cursor:"pointer", textAlign:"left", marginBottom:4 }}>← Back to Active Clients</button>
                                              <select value="" onChange={ev=>{const v=ev.target.value;if(v){setEditDraft(d=>({...d,client_name:v}));setEditClientShowPast(false)}}} style={{ width:"100%", padding:"7px 10px", borderRadius:8, border:"1px solid #E5E7EB", fontSize:12, color:"#111111", outline:"none", background:"#fff", boxSizing:"border-box" }}>
                                                <option value="">— Select past client —</option>
                                                {pastClientsOnly.map(c=><option key={c} value={c}>{c}</option>)}
                                              </select>
                                            </div>
                                          : <select value={editDraft.client_name??""} onChange={ev=>{const v=ev.target.value;if(v==="__past_clients__"){setEditClientShowPast(true)}else if(v==="__custom__"){setEditDraft(d=>({...d,client_name:""}))}else{setEditDraft(d=>({...d,client_name:v}))}}} style={{ width:"100%", padding:"7px 10px", borderRadius:8, border:"1px solid #E5E7EB", fontSize:12, color:"#111111", outline:"none", background:"#fff", boxSizing:"border-box" }}>
                                              <option value="">— Select client —</option>
                                              {activeClientsForEdit.map(c=><option key={c} value={c}>{c}</option>)}
                                              {editDraft.client_name && !activeClientsForEdit.includes(editDraft.client_name) && pastClientsOnly.includes(editDraft.client_name) && <option key={editDraft.client_name} value={editDraft.client_name}>{editDraft.client_name}</option>}
                                              {pastClientsOnly.length>0 && <option value="__past_clients__">📁 Past Clients →</option>}
                                              <option value="__custom__">✏️ Other (type manually)</option>
                                            </select>
                                        }
                                      </div>
                                    </div>
                                    {editDraft.task_type==="other" && (
                                      <div>
                                        <label style={{ display:"flex", alignItems:"center", gap:6, cursor:"pointer", fontSize:11, fontWeight:600, color:"#374151", marginBottom:6 }}>
                                          <input type="checkbox" checked={editDraft.is_multi_client??false} onChange={ev=>setEditDraft(d=>({...d,is_multi_client:ev.target.checked,client_names:[]}))} style={{ accentColor:"#de1a1a" }} />
                                          Split cost across multiple clients
                                        </label>
                                        {editDraft.is_multi_client && activeClientsForEdit.length>0 && (
                                          <div style={{ display:"flex", flexWrap:"wrap", gap:5 }}>
                                            {activeClientsForEdit.map(name=>{const selected=(editDraft.client_names??[]).includes(name);return(<button key={name} type="button" onClick={()=>{const next=selected?(editDraft.client_names??[]).filter(n=>n!==name):[...(editDraft.client_names??[]),name];setEditDraft(d=>({...d,client_names:next,client_name:next[0]||d.client_name}))}} style={{ padding:"4px 10px", borderRadius:20, fontSize:11, fontWeight:600, cursor:"pointer", border:`1.5px solid ${selected?"#de1a1a":"#EBEDF2"}`, background:selected?"rgba(222,26,26,0.08)":"#F9FAFB", color:selected?"#de1a1a":"#6B7280" }}>{name}</button>)})}
                                          </div>
                                        )}
                                      </div>
                                    )}
                                    {(editDraft.task_type==="other"||editDraft.task_type==="learning") && (
                                      <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:8 }}>
                                        <div><label style={{ fontSize:10, fontWeight:600, color:"#6B7280", display:"block", marginBottom:3 }}>Start Time</label><input type="time" value={editDraft.start_time??""} onChange={ev=>setEditDraft(d=>({...d,start_time:ev.target.value}))} style={{ width:"100%", padding:"7px 10px", borderRadius:8, border:"1px solid #E5E7EB", fontSize:12, color:"#111111", outline:"none", background:"#fff", boxSizing:"border-box" }} /></div>
                                        <div><label style={{ fontSize:10, fontWeight:600, color:"#6B7280", display:"block", marginBottom:3 }}>End Time</label><input type="time" value={editDraft.end_time??""} onChange={ev=>setEditDraft(d=>({...d,end_time:ev.target.value}))} style={{ width:"100%", padding:"7px 10px", borderRadius:8, border:"1px solid #E5E7EB", fontSize:12, color:"#111111", outline:"none", background:"#fff", boxSizing:"border-box" }} /></div>
                                      </div>
                                    )}
                                    {editDraft.task_type==="other" && (
                                      <>
                                        <div><label style={{ fontSize:10, fontWeight:600, color:"#6B7280", display:"block", marginBottom:3 }}>Project / Task Name</label><input value={editDraft.project_name??""} onChange={ev=>setEditDraft(d=>({...d,project_name:ev.target.value}))} style={{ width:"100%", padding:"7px 10px", borderRadius:8, border:"1px solid #E5E7EB", fontSize:12, color:"#111111", outline:"none", background:"#fff", boxSizing:"border-box" }} /></div>
                                        <div><label style={{ fontSize:10, fontWeight:600, color:"#6B7280", display:"block", marginBottom:3 }}>Status</label><select value={editEntryStatus} onChange={ev=>setEditEntryStatus(ev.target.value as typeof editEntryStatus)} style={{ width:"100%", padding:"7px 10px", borderRadius:8, border:"1px solid #E5E7EB", fontSize:12, color:"#111111", outline:"none", background:"#fff", boxSizing:"border-box" }}><option value="not_started">Not Started</option><option value="in_progress">In Progress</option><option value="completed">Completed ✓</option></select></div>
                                      </>
                                    )}
                                    {editDraft.task_type!=="other" && (
                                      <div><label style={{ fontSize:10, fontWeight:600, color:"#6B7280", display:"block", marginBottom:3 }}>Notes</label><textarea rows={2} value={editDraft.notes??""} onChange={ev=>setEditDraft(d=>({...d,notes:ev.target.value}))} style={{ width:"100%", padding:"7px 10px", borderRadius:8, border:"1px solid #E5E7EB", fontSize:12, color:"#111111", outline:"none", background:"#fff", resize:"none", boxSizing:"border-box" }} /></div>
                                    )}
                                    {members.length>0 && (
                                      <div style={{ paddingTop:8, borderTop:"1px dashed #EBEDF2" }}>
                                        <label style={{ fontSize:10, fontWeight:600, color:"#6B7280", display:"block", marginBottom:5 }}>👥 Worked With</label>
                                        <div style={{ position:"relative" }}>
                                          <select value="" onChange={ev=>{const id=ev.target.value;if(id&&!(editDraft.participant_ids??[]).includes(id))setEditDraft(d=>({...d,participant_ids:[...(d.participant_ids??[]),id]}))}} style={{ width:"100%", fontSize:12, fontWeight:600, color:"#374151", background:"#fff", border:"1px solid #E5E7EB", borderRadius:8, padding:"7px 24px 7px 10px", cursor:"pointer", outline:"none", appearance:"none" }}>
                                            <option value="">Add teammate…</option>
                                            {members.filter(m=>!(editDraft.participant_ids??[]).includes(m.id)).map(m=>(<option key={m.id} value={m.id}>{m.name}</option>))}
                                          </select>
                                          <ChevronDown size={11} style={{ position:"absolute", right:8, top:"50%", transform:"translateY(-50%)", color:"#9CA3AF", pointerEvents:"none" }} />
                                        </div>
                                        {(editDraft.participant_ids??[]).length>0 && (
                                          <div style={{ display:"flex", flexWrap:"wrap", gap:4, marginTop:6 }}>
                                            {(editDraft.participant_ids??[]).map(pid=>{const m=members.find(t=>t.id===pid);if(!m)return null;const initials=m.name.split(" ").map((n:string)=>n[0]).join("").slice(0,2).toUpperCase();return(<button key={pid} type="button" onClick={()=>setEditDraft(d=>({...d,participant_ids:(d.participant_ids??[]).filter(p=>p!==pid)}))} style={{ display:"flex", alignItems:"center", gap:4, padding:"3px 8px 3px 5px", borderRadius:99, background:"rgba(99,102,241,0.1)", border:"1.5px solid rgba(99,102,241,0.3)", cursor:"pointer" }}><div style={{ width:16, height:16, borderRadius:"50%", background:"#6366F1", display:"flex", alignItems:"center", justifyContent:"center", fontSize:7, fontWeight:900, color:"#fff" }}>{initials}</div><span style={{ fontSize:10, fontWeight:700, color:"#4338CA" }}>{m.name.split(" ")[0]}</span><span style={{ fontSize:8, color:"#6366F1" }}>✕</span></button>)})}
                                          </div>
                                        )}
                                      </div>
                                    )}
                                    <div style={{ display:"flex", gap:8, justifyContent:"flex-end" }}>
                                      <button onClick={()=>{setEditingKey(null);setEditDraft({})}} style={{ padding:"7px 14px", borderRadius:8, background:"#F3F4F6", border:"none", fontSize:12, fontWeight:600, color:"#6B7280", cursor:"pointer" }}>Cancel</button>
                                      <button onClick={()=>saveEntry(u.id,entries,ei)} disabled={savingKey===eKey} style={{ display:"flex", alignItems:"center", gap:5, padding:"7px 14px", borderRadius:8, background:"#6366F1", border:"none", fontSize:12, fontWeight:700, color:"#fff", cursor:"pointer", opacity:savingKey===eKey?0.6:1 }}><Check size={12}/> {savingKey===eKey?"Saving…":"Save"}</button>
                                    </div>
                                  </div>
                                )}

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
                  const allEntries = (Array.isArray(pu.work_entries) ? pu.work_entries : []) as WorkEntry[]
                  const perEntryFiltered = userId
                    ? allEntries.filter(e => Array.isArray(e.participant_ids) && e.participant_ids.includes(userId))
                    : allEntries
                  // If no entry-level tagging found, show all non-break work entries (update was already confirmed participated)
                  const puEntries = perEntryFiltered.length > 0
                    ? perEntryFiltered
                    : allEntries.filter(e => e.task_type !== "break" && e.task_type !== "learning")
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
                        <div style={{ display: "flex", flexDirection: "column", gap: 0 }}>
                          {puEntries.map((pe, pi) => {
                            const cfg = TASK_CFG[pe.task_type] ?? TASK_CFG.other
                            const { Icon } = cfg
                            const displayTitle = pe.title || cfg.label
                            const displayClient = (pe.is_multi_client && pe.client_names && pe.client_names.length > 0)
                              ? pe.client_names.join(" · ")
                              : pe.client_name || ""
                            const tH = pe.task_type === "shoot" ? (pe._travel_hours ?? 0) : 0
                            const dur = calcDurationFromTimes(pe.start_time, pe.end_time) ?? (pe.duration_hours ?? 0)
                            return (
                              <div key={pi} style={{ display: "flex", gap: 10, padding: pi > 0 ? "10px 0 0" : "0", borderTop: pi > 0 ? "1px solid rgba(99,102,241,0.08)" : "none", alignItems: "flex-start" }}>
                                <div style={{ width: 30, height: 30, borderRadius: 8, background: cfg.bg, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                                  <Icon size={13} style={{ color: cfg.color }}/>
                                </div>
                                <div style={{ flex: 1, minWidth: 0 }}>
                                  <div style={{ display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap", marginBottom: 2 }}>
                                    <span style={{ fontSize: 12, fontWeight: 800, color: "#111111" }}>{displayTitle}</span>
                                    <span style={{ fontSize: 9, fontWeight: 700, color: cfg.color, background: cfg.bg, padding: "1px 6px", borderRadius: 99 }}>{cfg.label}</span>
                                  </div>
                                  {displayClient && <p style={{ fontSize: 10, color: "#6B7280", margin: "0 0 2px", fontWeight: 600 }}>{displayClient}</p>}
                                  <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
                                    {dur + tH > 0 && (
                                      <span style={{ fontSize: 10, fontWeight: 700, color: "#374151", display: "flex", alignItems: "center", gap: 3 }}>
                                        <Clock size={9} style={{ color: "#9CA3AF" }}/>{fmtH(dur + tH)}
                                      </span>
                                    )}
                                    {pe.start_time && pe.end_time && (
                                      <span style={{ fontSize: 10, color: "#9CA3AF" }}>{fmt12(pe.start_time)} – {fmt12(pe.end_time)}</span>
                                    )}
                                    {tH > 0 && <span style={{ fontSize: 10, color: "#F59E0B", fontWeight: 700 }}>🚗 {fmtTravel(tH)}</span>}
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
            )
            })}

          </div>

          {/* RIGHT ── Stats panel ─────────────────────────────────────────── */}
          <div className="order-1 lg:order-none" style={{ display:"flex", flexDirection:"column", gap:14 }}>

            {/* Anna's Stats Card */}
            <div style={{ background:"#fff", borderRadius:20, border:"1px solid #EBEDF2", padding:"18px", boxShadow:"0 2px 12px rgba(0,0,0,0.05)" }}>
              <div style={{ display:"flex", alignItems:"center", justifyContent:"space-between", marginBottom:14 }}>
                <div style={{ display:"flex", alignItems:"center", gap:7 }}>
                  <TrendingUp size={14} style={{ color:"#DE1A1A" }}/>
                  <span style={{ fontSize:13, fontWeight:800, color:"#111111" }}>{stats.isMedia ? "Media" : "Work"} Summary</span>
                </div>
                <span style={{ fontSize:10, fontWeight:600, color:"#9CA3AF" }}>{selectedMonth || "All Data"}</span>
              </div>

              {/* Hours trend mini-chart */}
              <div style={{ height:80, marginBottom:14 }}>
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={stats.dailyData} margin={{ top:4, right:4, left:-28, bottom:0 }}>
                    <XAxis dataKey="day" tick={{ fontSize:9, fill:"#9CA3AF" }} tickLine={false} axisLine={false} />
                    <YAxis tick={{ fontSize:9, fill:"#9CA3AF" }} tickLine={false} axisLine={false} />
                    <Tooltip contentStyle={{ fontSize:11, borderRadius:8, border:"1px solid #E5E7EB", background:"#fff" }} formatter={(v) => [`${v as number}h`, "Hours"]} labelFormatter={l => `Day ${l}`} />
                    <ReferenceLine y={8.5} stroke="#F59E0B" strokeDasharray="4 3" strokeWidth={1.5} label={{ value:"8.5h", fontSize:9, fill:"#F59E0B", position:"right" }} />
                    <Line type="monotone" dataKey="hours" stroke="#DE1A1A" strokeWidth={2} dot={{ r:2, fill:"#DE1A1A" }} activeDot={{ r:4 }} />
                  </LineChart>
                </ResponsiveContainer>
              </div>

              {/* Stats rows */}
              <div style={{ display:"flex", flexDirection:"column", gap:0 }}>
                {(stats.isMedia ? [
                  { label:"Working Hours",   value: fmtH(stats.shootH + stats.editH),    color:"#22C55E", dot:"#22C55E" },
                  { label:"Shooting Hours",  value: fmtH(stats.shootH),                  color:"#EF4444", dot:"#EF4444" },
                  { label:"Editing Hours",   value: fmtH(stats.editH),                   color:"#6366F1", dot:"#6366F1" },
                  { label:"Break Hours",     value: fmtH(stats.totalBreak),              color:"#78716C", dot:"#78716C" },
                  { label:"Present Days",    value: String(stats.presentDays),            color:"#059669", dot:"#059669" },
                  { label:"Leave Days",      value: String(stats.absentDays),             color:"#EF4444", dot:"#EF4444" },
                  { label:"Overtime",        value: fmtH(stats.totalOT),                 color:"#F59E0B", dot:"#F59E0B" },
                ] : [
                  { label:"Working Hours",   value: fmtH(stats.totalHours - stats.totalLearning), color:"#22C55E", dot:"#22C55E" },
                  { label:"Learning Hours",  value: fmtH(stats.totalLearning),                    color:"#6366F1", dot:"#6366F1" },
                  { label:"Break Hours",     value: fmtH(stats.totalBreak),                       color:"#78716C", dot:"#78716C" },
                  { label:"Overtime",        value: fmtH(stats.totalOT),                          color:"#F59E0B", dot:"#F59E0B" },
                  { label:"Present Days",    value: String(stats.presentDays),                     color:"#059669", dot:"#059669" },
                  { label:"Absent Days",     value: String(stats.absentDays),                      color:"#EF4444", dot:"#EF4444" },
                ]).map((r, i, arr) => (
                  <div key={r.label} style={{ display:"flex", alignItems:"center", justifyContent:"space-between", padding:"9px 0", borderBottom: i < arr.length - 1 ? "1px solid #F5F6FA" : "none" }}>
                    <div style={{ display:"flex", alignItems:"center", gap:7 }}>
                      <div style={{ width:8, height:8, borderRadius:"50%", background:r.dot, flexShrink:0 }}/>
                      <span style={{ fontSize:11, color:"#6B7280" }}>{r.label}</span>
                    </div>
                    <span style={{ fontSize:12, fontWeight:800, color:"#111111" }}>{r.value}</span>
                  </div>
                ))}

                {/* Avg Working Hours with up/down indicator */}
                <div style={{ display:"flex", alignItems:"center", justifyContent:"space-between", paddingTop:9 }}>
                  <div style={{ display:"flex", alignItems:"center", gap:7 }}>
                    <div style={{ width:8, height:8, borderRadius:"50%", background: stats.avgH >= 8.5 ? "#22C55E" : "#EF4444", flexShrink:0 }}/>
                    <span style={{ fontSize:11, color:"#6B7280" }}>Avg Working Hrs</span>
                  </div>
                  <div style={{ display:"flex", alignItems:"center", gap:4 }}>
                    <span style={{ fontSize:12, fontWeight:800, color:"#111111" }}>{fmtH(stats.avgH)}</span>
                    <span style={{ fontSize:14, fontWeight:900, color: stats.avgH >= 8.5 ? "#22C55E" : "#EF4444" }}>
                      {stats.avgH >= 8.5 ? "↑" : "↓"}
                    </span>
                  </div>
                </div>
              </div>
            </div>

          </div>
        </div>


      </div>
    </div>
  )
}
