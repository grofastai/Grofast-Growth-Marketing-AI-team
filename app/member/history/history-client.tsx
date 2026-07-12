"use client"

import { useState, useMemo, useRef, useEffect } from "react"
import { LineChart, Line, XAxis, YAxis, Tooltip, ReferenceLine, ResponsiveContainer } from "recharts"
import { useRouter } from "next/navigation"
import { deleteDailyUpdate, updatePastDailyUpdate, updateDailyUpdateLearning, addEntryToDate } from "@/lib/actions/daily-updates"
import { VideoDurationPicker } from "@/components/ui/VideoDurationPicker"
import { useToast } from "@/components/ui/useToast"
import ClientSelector from "@/components/ui/ClientSelector"
import { useConfirm } from "@/components/ui/ConfirmDialog"
import { confirmCollaboration, editCollaborationTime, rejectCollaboration, deleteCollaborationsByEntry } from "@/lib/actions/collaboration"

const INTERNAL_BRANDS = ["GROFAST DIGITAL", "KARTHICK BRANDS", "GROFAST AI"]
import Image from "next/image"
import {
  Camera, Film, Clock, CalendarDays,
  TrendingUp, Zap, BookOpen, Coffee, GraduationCap,
  CheckCircle2, Search, Trash2,
  ArrowRight, Flame, Star, X, Pencil, Check, ChevronDown,
  Mic, ImageIcon, FileText, Code2, CalendarClock,
} from "lucide-react"

interface WorkEntry {
  id?: string; task_type: "shoot" | "edit" | "other" | "break" | "learning" | "voiceover" | "poster" | "scripting" | "development" | "other_activity"
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
  is_rework?: boolean | null; linked_to_title?: string | null; linked_to_client?: string | null; linked_to_date?: string | null
  _other_type?: string | null
}
interface UpdateRow {
  id: string; date: string; attendance_status: string
  work_type: string | null; working_hours: number | null
  learning_hours: number | null; learning_topic: string | null; learning_notes: string | null
  learning_start_time: string | null; learning_end_time: string | null
  shoot_count: number | null
  work_entries: WorkEntry[] | null; created_at: string
  participant_ids?: string[] | null
}

const STATUS_STYLE: Record<string, { label: string; color: string; bg: string; dot: string }> = {
  present: { label:"Present",  color:"#16A34A", bg:"rgba(22,163,74,0.12)",  dot:"#22C55E" },
  absent:  { label:"On Leave", color:"#9CA3AF", bg:"rgba(0,0,0,0.06)",      dot:"#9CA3AF" },
  leave:   { label:"On Leave", color:"#9CA3AF", bg:"rgba(0,0,0,0.06)",      dot:"#9CA3AF" },
  holiday: { label:"Holiday",  color:"#6B7280", bg:"rgba(0,0,0,0.06)",      dot:"#9CA3AF" },
  wfh:     { label:"WFH",      color:"#6366F1", bg:"rgba(99,102,241,0.1)",  dot:"#6366F1" },
}
// 'other' below = the generic Technical/Working block (historical naming) — distinct
// from 'other_activity' (Meeting/Teaching/Misc), which is a genuinely different type.
const TASK_CFG = {
  shoot:     { Icon: Camera,       color:"#EF4444", bg:"rgba(239,68,68,0.1)",    label:"Shoot"     },
  edit:      { Icon: Film,         color:"#6366F1", bg:"rgba(99,102,241,0.1)",   label:"Editing"   },
  other:     { Icon: BookOpen,     color:"#F59E0B", bg:"rgba(245,158,11,0.1)",   label:"Work"      },
  break:     { Icon: Coffee,       color:"#78716C", bg:"rgba(120,113,108,0.1)",  label:"Break"     },
  learning:  { Icon: GraduationCap, color:"#059669", bg:"rgba(5,150,105,0.12)", label:"Learning"  },
  voiceover: { Icon: Mic,          color:"#8B5CF6", bg:"rgba(139,92,246,0.1)",   label:"Voiceover" },
  poster:    { Icon: ImageIcon,    color:"#EC4899", bg:"rgba(236,72,153,0.1)",   label:"Poster"    },
  scripting:     { Icon: FileText,     color:"#EAB308", bg:"rgba(234,179,8,0.1)",   label:"Scripting" },
  development:   { Icon: Code2,        color:"#6366F1", bg:"rgba(99,102,241,0.1)",  label:"Development" },
  other_activity:{ Icon: CalendarClock,color:"#6B7280", bg:"rgba(107,114,128,0.1)", label:"Other" },
}
const DOT_COLORS = ["#22C55E","#F59E0B","#6366F1","#EF4444","#0EA5E9","#EC4899"]

function labelToMonthInput(label: string): string {
  const d = new Date(label + " 1")
  if (isNaN(d.getTime())) return ""
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`
}
function monthInputToLabel(val: string): string {
  return new Date(val + "-01T12:00:00").toLocaleDateString("en-US", { month: "long", year: "numeric" })
}

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
  let hrs = Math.floor(h); let mins = Math.round((h % 1) * 60)
  if (mins === 60) { hrs += 1; mins = 0 }
  return mins > 0 ? `${hrs}h ${mins}m` : `${hrs}h`
}

function calcDur(start?: string | null, end?: string | null): number {
  if (!start || !end) return 0
  const [sh, sm] = start.split(":").map(Number)
  const [eh, em] = end.split(":").map(Number)
  let diff = (eh * 60 + em) - (sh * 60 + sm)
  if (diff <= 0) diff += 1440 // crosses midnight into the next day
  return diff > 0 ? Math.round((diff / 60) * 10) / 10 : 0
}
function toMins(t: string) { const [h, m] = t.split(":").map(Number); return h * 60 + m }
function clampDate(v: string) { if (!v) return v; const [yr = '', mo = '', dy = ''] = v.split('-'); const y = yr.length > 4 ? yr.slice(0, 4) : yr; const m = mo && +mo > 12 ? '12' : mo; const d = dy && +dy > 31 ? '31' : dy; return [y, m, d].filter(Boolean).join('-') }

// Calculates net work hours by merging work intervals then subtracting any break
// intervals that overlap — so a break taken inside a work window doesn't count as work.
function calcNetWorkHours(entries: WorkEntry[], layout?: string): number {
  const workEntries  = layout === "freelance_media"
    ? entries.filter(e => e.task_type === "shoot" || e.task_type === "edit")
    : entries.filter(e => e.task_type !== "break" && e.task_type !== "learning")
  const breakEntries = entries.filter(e => e.task_type === "break")

  // Build and merge work intervals
  const workIntervals = workEntries
    .filter(e => e.start_time && e.end_time)
    .map(e => {
      const start = toMins(e.start_time!)
      let end = toMins(e.end_time!)
      if (end <= start) end += 1440 // crosses midnight into the next day
      return { start, end }
    })
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
    .map(e => {
      const start = toMins(e.start_time!)
      let end = toMins(e.end_time!)
      if (end <= start) end += 1440 // crosses midnight into the next day
      return { start, end }
    })
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

  // NOTE: _travel_hours is NOT added — travel is already inside the shoot window the employee entered
  const untimedH = workEntries
    .filter(e => !e.start_time || !e.end_time)
    .reduce((s, e) => s + (e.duration_hours ?? 0), 0)
  return Math.round((timedMins / 60 + untimedH) * 10) / 10
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
  let hrs = Math.floor(h); let mins = Math.round((h % 1) * 60)
  if (mins === 60) { hrs += 1; mins = 0 }
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
type CollaborationConfirmation = {
  id: string
  date: string
  status: 'pending' | 'confirmed' | 'edited_confirmed' | 'rejected'
  submitter_id: string
  entry_id: string
  daily_update_id: string
  original_start_time: string | null
  original_end_time: string | null
  original_duration_hours: number | null
  confirmed_start_time: string | null
  confirmed_end_time: string | null
  confirmed_hours: number | null
  rejection_reason: string | null
  entry_snapshot: { title?: string; task_type?: string; client_name?: string } | null
}

export default function HistoryClient({
  updates, userName, userId = "", team = "", workLayout, clients = [], pastClients = [], participatedUpdates = [], members = [], attendanceDates = [], approvedLeaves = [], companyLeaves = [], defaultDate = "", collaborationConfirmations = [],
}: {
  updates: UpdateRow[]
  userName: string
  userId?: string
  team?: string
  workLayout?: 'media' | 'non_media' | 'freelance_media'
  clients?: string[]
  pastClients?: string[]
  participatedUpdates?: ParticipatedUpdate[]
  members?: MemberInfo[]
  attendanceDates?: string[]
  approvedLeaves?: ApprovedLeave[]
  companyLeaves?: CompanyHoliday[]
  defaultDate?: string
  collaborationConfirmations?: CollaborationConfirmation[]
}) {
  const confirm = useConfirm()
  const isFreelancerMedia = workLayout ? workLayout === 'freelance_media' : team === "Freelance Media Production"
  const isMedia = workLayout ? workLayout !== 'non_media' : (team === "Media Team" || team === "Media Production Team" || team === "Freelance Media Production")

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
  const { toastEl, showToast } = useToast()

  // Collaboration confirmation state
  const [collabConfirms, setCollabConfirms] = useState<CollaborationConfirmation[]>(collaborationConfirmations)
  useEffect(() => { setCollabConfirms(collaborationConfirmations) }, [collaborationConfirmations])
  const [collabLoading, setCollabLoading] = useState<string | null>(null)
  const [collabEditId, setCollabEditId] = useState<string | null>(null)
  const [collabEditStart, setCollabEditStart] = useState("")
  const [collabEditEnd, setCollabEditEnd] = useState("")
  const [collabRejectId, setCollabRejectId] = useState<string | null>(null)
  const [collabRejectReason, setCollabRejectReason] = useState("")

  const confirmsByDate = useMemo(() => {
    const m = new Map<string, CollaborationConfirmation[]>()
    for (const c of collabConfirms) {
      if (!m.has(c.date)) m.set(c.date, [])
      m.get(c.date)!.push(c)
    }
    return m
  }, [collabConfirms])

  // Sum of confirmed collaboration hours per date (confirmed + edited_confirmed)
  const collabHoursByDate = useMemo(() => {
    const m = new Map<string, number>()
    for (const c of collabConfirms) {
      if ((c.status === 'confirmed' || c.status === 'edited_confirmed') && c.confirmed_hours) {
        m.set(c.date, (m.get(c.date) ?? 0) + c.confirmed_hours)
      }
    }
    return m
  }, [collabConfirms])

  const pendingCount = useMemo(() => collabConfirms.filter(c => c.status === 'pending').length, [collabConfirms])

  // Jump-to-pending: clicking the banner clears any month/date filter that could be
  // hiding the pending item, then scrolls to + briefly highlights the actual card.
  const [scrollToConfirmId, setScrollToConfirmId] = useState<string | null>(null)
  const [highlightConfirmId, setHighlightConfirmId] = useState<string | null>(null)
  function handleJumpToPendingCollab() {
    const firstPending = collabConfirms.find(c => c.status === 'pending')
    if (!firstPending) return
    setSelectedMonth("")
    setSelectedDate("")
    setScrollToConfirmId(firstPending.id)
  }

  // Revision picker options — scanned from all loaded updates, newest first
  const revisionOptionsByType = useMemo(() => {
    type RevOpt = { key: string; label: string; title: string; client: string; date: string }
    const edits: RevOpt[] = [], voiceovers: RevOpt[] = [], posters: RevOpt[] = [], scriptings: RevOpt[] = []
    for (const u of updates) {
      const entries = Array.isArray(u.work_entries) ? u.work_entries as WorkEntry[] : []
      for (const e of entries) {
        if (e.is_rework) continue
        const title = (e.title as string) || ""
        const client = (e.client_name as string) || ""
        if (!title) continue
        const dateLabel = new Date(u.date + "T12:00:00").toLocaleDateString("en-US", { day: "numeric", month: "short", year: "numeric" })
        const key = `${client}||${title}||${u.date}`
        if (e.task_type === "edit") edits.push({ key, label:`🎬  ${client}  ·  ${title}  ·  ${dateLabel}`, title, client, date: u.date })
        else if (e.task_type === "voiceover") voiceovers.push({ key, label:`🎙️  ${client}  ·  ${title}  ·  ${dateLabel}`, title, client, date: u.date })
        else if (e.task_type === "poster") posters.push({ key, label:`🖼️  ${client}  ·  ${title}  ·  ${dateLabel}`, title, client, date: u.date })
        else if (e.task_type === "scripting") scriptings.push({ key, label:`📝  ${client}  ·  ${title}  ·  ${dateLabel}`, title, client, date: u.date })
      }
    }
    const byDate = (a: RevOpt, b: RevOpt) => b.date.localeCompare(a.date)
    return { edits: edits.sort(byDate), voiceovers: voiceovers.sort(byDate), posters: posters.sort(byDate), scriptings: scriptings.sort(byDate) }
  }, [updates])

  // Per-entry edit state
  const [editingKey, setEditingKey]   = useState<string | null>(null) // "updateId:entryIdx"
  const [editDraft, setEditDraft]     = useState<Partial<WorkEntry>>({})
  const [savingKey, setSavingKey]     = useState<string | null>(null)
  const [deletingKey, setDeletingKey] = useState<string | null>(null)

  // Learning edit state
  const [editingLearningId, setEditingLearningId] = useState<string | null>(null)
  const [learningDraft, setLearningDraft] = useState<{ client: string; topic: string; notes: string; hours: string; startTime: string; endTime: string; participantIds: string[] }>({ client: "", topic: "", notes: "", hours: "", startTime: "09:00", endTime: "09:00", participantIds: [] })
  const [savingLearning, setSavingLearning] = useState(false)

  // Per-entry date change state
  const [editDraftDate, setEditDraftDate] = useState<string>("")
  const [editOrigDate, setEditOrigDate] = useState<string>("")

  const currentMonthLabel = new Date().toLocaleDateString("en-US", { month: "long", year: "numeric" })
  const [selectedMonth, setSelectedMonth] = useState(() => {
    const hasCurrentMonth = updates.some(u => monthLabel(u.date) === currentMonthLabel)
    if (hasCurrentMonth) return currentMonthLabel
    // Fall back to most recent month with data (updates are sorted newest-first)
    return updates.length > 0 ? monthLabel(updates[0].date) : currentMonthLabel
  })
  const [search, setSearch]               = useState("")
  const [selectedDate, setSelectedDate]   = useState(defaultDate ?? "")

  async function handleDelete(id: string) {
    if (!(await confirm("Delete this day's submission? This cannot be undone."))) return
    setDeletingId(id)
    const result = await deleteDailyUpdate(id)
    if (result.success) {
      router.refresh()
    } else {
      showToast("Failed to delete: " + result.error)
    }
    setDeletingId(null)
  }

  function startEditEntry(updateId: string, entryIdx: number, entry: WorkEntry, updateDate: string) {
    setEditDraftDate(updateDate)
    setEditOrigDate(updateDate)
    setEditingKey(`${updateId}:${entryIdx}`)
    let notes = entry.notes ?? ""
    if (entry.task_type === "other") {
      // Strip the leading [status] marker so it never shows in the notes field —
      // any real free-text notes typed after it are kept for editing.
      notes = notes.replace(/^\[(completed|in_progress|not_started)\]\s*/, "")
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
    const BREAK_LABELS = ["Lunch Break", "Tea", "Short Break", "Personal", "Early Logoff", "Late Login"]
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
      client_names: (() => {
        const allKnown = [...activeClientsForEdit, ...pastClients]
        const normalize = (cn: string) => allKnown.find(a => a.toLowerCase() === cn.toLowerCase()) ?? cn
        if (entry.is_multi_client && entry.client_names?.length) {
          return entry.client_names.map(normalize)
        }
        // Seed from single client_name so chip grid shows it pre-selected
        return entry.client_name ? [normalize(entry.client_name)] : []
      })(),
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
      is_rework: entry.is_rework ?? false,
      linked_to_title: entry.linked_to_title ?? null,
      linked_to_client: entry.linked_to_client ?? null,
      linked_to_date: entry.linked_to_date ?? null,
      _other_type: entry._other_type ?? "Meeting",
    })
  }

  async function saveEntry(updateId: string, allEntries: WorkEntry[], entryIdx: number) {
    const key = `${updateId}:${entryIdx}`
    // Common: client + title required for most types. Break is the only exemption.
    const NO_CLIENT_TYPES = ["break"]
    if (!NO_CLIENT_TYPES.includes(editDraft.task_type ?? "")) {
      const clientVal = (editDraft.client_names && editDraft.client_names.length > 0) ? editDraft.client_names[0] : editDraft.client_name
      if (!clientVal || clientVal === "Internal" || clientVal === "") { showToast("Select a client before saving."); return }
      if (editDraft.task_type !== "shoot" && !editDraft.title?.trim()) { showToast("Enter a title / video name before saving."); return }
    }
    if ((editDraft.task_type === "development" || editDraft.task_type === "other_activity") && !editDraft.title?.trim()) {
      showToast(editDraft.task_type === "development" ? "Enter what you worked on before saving." : "Enter a title before saving."); return
    }
    if (editDraft.task_type === "development" && !editDraft.project_name?.trim()) {
      showToast("Select or create a project before saving."); return
    }
    if (editDraft.task_type === "edit" && isMedia) {
      if (!editDraft.video_type) { showToast("Select a video type before saving."); return }
      if (!editDraft.date_given) { showToast("Please set Date Given before saving."); return }
      if (!editDraft.date_finished) { showToast("Please set Date Finished before saving."); return }
      if (!editDraft.start_time || !editDraft.end_time) { showToast("Please set Edit Start & End Time before saving."); return }
      if (editDraft.start_time >= (editDraft.end_time ?? "")) { showToast("Edit End Time must be after Start Time."); return }
      if (!editDraft.video_duration) { showToast("Please select the video Duration before saving."); return }
    } else if (editDraft.task_type === "edit" && !isMedia) {
      if (!editDraft.video_type) { showToast("Select a video type before saving."); return }
      if (!editDraft.start_time || !editDraft.end_time) { showToast("Please set Start & End Time before saving."); return }
      if (editDraft.start_time >= (editDraft.end_time ?? "")) { showToast("End time must be after Start time."); return }
    } else if (editDraft.task_type === "other") {
      if (!editDraft.start_time || !editDraft.end_time) { showToast("Please set Working Time before saving."); return }
      if (editDraft.start_time >= (editDraft.end_time ?? "")) { showToast("End time must be after Start time."); return }
    } else if (editDraft.task_type === "voiceover" || editDraft.task_type === "poster" || editDraft.task_type === "scripting") {
      if (!editDraft.start_time || !editDraft.end_time) { showToast("Please set Start & End Time before saving."); return }
      if (editDraft.start_time >= (editDraft.end_time ?? "")) { showToast("End time must be after Start time."); return }
    } else if (editDraft.task_type === "development" || editDraft.task_type === "other_activity") {
      if (!editDraft.start_time || !editDraft.end_time) { showToast("Please set Start & End Time before saving."); return }
      if (editDraft.start_time >= (editDraft.end_time ?? "")) { showToast("End time must be after Start time."); return }
    }
    setSavingKey(key)
    let draftToSave: Partial<WorkEntry> = { ...editDraft }
    if (editDraft.task_type === "shoot") {
      const travelH = editDraft._travel_hours ?? 0
      const dur = calcDur(editDraft.start_time, editDraft.end_time) || editDraft.duration_hours || 0
      const droneH = editDraft._drone_hours ?? 0
      const rebuiltNotes = [editDraft._location ? `Location: ${editDraft._location}` : "", editDraft.notes || "", travelH > 0 ? `Travel: ${travelH}h` : ""].filter(Boolean).join(" | ")
      draftToSave = { ...editDraft, notes: rebuiltNotes, duration_hours: dur, _camera_hours: (editDraft._camera_hours ?? 0) > 0 ? Math.max(0, dur - droneH) : 0 }
    } else if (editDraft.task_type === "edit") {
      draftToSave = { ...editDraft, duration_hours: calcDur(editDraft.start_time, editDraft.end_time) || editDraft.duration_hours || 0 }
    } else if (editDraft.task_type === "break") {
      const VALID_BREAKS = ["Lunch Break", "Tea", "Short Break", "Personal", "Early Logoff", "Late Login"]
      const finalTitle = VALID_BREAKS.includes(editDraft.title || "") ? editDraft.title! : "Lunch Break"
      draftToSave = { ...editDraft, title: finalTitle, client_name: "Break", duration_hours: calcDur(editDraft.start_time, editDraft.end_time) || editDraft.duration_hours || 0 }
    } else if (editDraft.task_type === "voiceover" || editDraft.task_type === "poster" || editDraft.task_type === "scripting") {
      draftToSave = { ...editDraft, duration_hours: calcDur(editDraft.start_time, editDraft.end_time) || editDraft.duration_hours || 0 }
    } else if (editDraft.task_type === "development" || editDraft.task_type === "other_activity") {
      draftToSave = { ...editDraft, duration_hours: calcDur(editDraft.start_time, editDraft.end_time) || editDraft.duration_hours || 0 }
    }
    const updatedEntry = { ...(allEntries[entryIdx] as unknown as Record<string, unknown>), ...draftToSave }

    // Overlap check: new times must not overlap any other entry on same date by >3 min
    const newStart = draftToSave.start_time as string | undefined
    const newEnd   = draftToSave.end_time   as string | undefined
    if (newStart && newEnd && toMins(newEnd) > toMins(newStart)) {
      const others = (allEntries as unknown as Record<string,unknown>[]).filter((_, i) => i !== entryIdx).filter(e => e.start_time && e.end_time)
      for (const other of others) {
        const s1 = toMins(newStart), e1 = toMins(newEnd)
        const s2 = toMins(other.start_time as string), e2 = toMins(other.end_time as string)
        if (e2 > s2 && Math.min(e1, e2) - Math.max(s1, s2) > 3) {
          showToast(`Time ${newStart}–${newEnd} overlaps with "${other.title}" (${other.start_time}–${other.end_time}). Please fix the times.`)
          setSavingKey(null); return
        }
      }
    }

    if (editDraftDate && editDraftDate !== editOrigDate) {
      // Move entry to a different date
      const movedEntryId = (allEntries[entryIdx] as unknown as Record<string, unknown>)?.id as string | undefined
      const withoutEntry = (allEntries as unknown as Record<string, unknown>[]).filter((_, i) => i !== entryIdx)
      const r1 = await updatePastDailyUpdate(updateId, withoutEntry)
      if (!r1.success) { showToast("Failed to move entry: " + r1.error); setSavingKey(null); return }
      // Drop the old date's collab confirmation for this entry — addEntryToDate below
      // creates a fresh one under the new date, so leaving the old one would double it up.
      if (movedEntryId) {
        deleteCollaborationsByEntry(updateId, movedEntryId).catch(console.error)
        setCollabConfirms(prev => prev.filter(c => !(c.daily_update_id === updateId && c.entry_id === movedEntryId)))
      }
      const r2 = await addEntryToDate(editDraftDate, updatedEntry)
      if (!r2.success) { showToast("Entry removed from old date but failed to add to new date: " + r2.error); setSavingKey(null); return }
    } else {
      const updated = allEntries.map((e, i) =>
        i === entryIdx ? updatedEntry : (e as unknown as Record<string, unknown>)
      )
      const result = await updatePastDailyUpdate(updateId, updated)
      if (!result.success) { showToast("Failed to save: " + result.error); setSavingKey(null); return }
    }

    setEditingKey(null)
    setEditDraft({})
    router.refresh()
    setSavingKey(null)
  }

  async function deleteEntry(updateId: string, allEntries: WorkEntry[], entryIdx: number) {
    if (!(await confirm("Remove this entry? This cannot be undone."))) return
    const key = `${updateId}:${entryIdx}`
    setDeletingKey(key)
    const deletedEntry = allEntries[entryIdx]
    const updated = (allEntries as unknown as Record<string, unknown>[]).filter((_, i) => i !== entryIdx)
    const result = await updatePastDailyUpdate(updateId, updated)
    if (result.success) {
      // Remove collab confirmations for the deleted entry so hours update immediately
      if ((deletedEntry?.participant_ids ?? []).length > 0) {
        deleteCollaborationsByEntry(updateId, deletedEntry?.id).catch(console.error)
        if (deletedEntry?.id) {
          setCollabConfirms(prev => prev.filter(c => !(c.daily_update_id === updateId && c.entry_id === deletedEntry.id)))
        } else {
          setCollabConfirms(prev => prev.filter(c => c.daily_update_id !== updateId))
        }
      }
      router.refresh()
    } else {
      showToast("Failed to delete entry: " + result.error)
    }
    setDeletingKey(null)
  }

  function startEditLearning(u: UpdateRow) {
    setEditingLearningId(u.id)
    const raw = u.learning_topic ?? ""
    const m = raw.match(/^\[([^\]]+)\]\s*(.*)$/)
    setLearningDraft({
      client:         m ? m[1] : "",
      topic:          m ? m[2] : raw,
      notes:          u.learning_notes ?? "",
      hours:          u.learning_hours != null ? String(u.learning_hours) : "",
      startTime:      u.learning_start_time ?? "09:00",
      endTime:        u.learning_end_time   ?? "09:00",
      participantIds: u.participant_ids ?? [],
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
      participant_ids:     learningDraft.participantIds.length > 0 ? learningDraft.participantIds : null,
    })
    if (result.success) {
      setEditingLearningId(null)
      router.refresh()
    } else {
      showToast("Failed to save: " + result.error)
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
    let shootH = 0, editH = 0, otherH = 0, shootCount = 0, editCount = 0
    let travelH = 0, worklogCount = 0, voiceoverCount = 0, voiceoverH = 0, posterCount = 0, posterH = 0
    let scriptingH = 0, scriptingCount = 0, developmentH = 0, developmentCount = 0, otherActivityH = 0
    // workLayout drives media/non-media formula; fall back to detecting from entries
    const isMedia = workLayout
      ? workLayout !== 'non_media'
      : (isFreelancerMedia || monthFiltered.some(u => (u.work_entries ?? []).some((e: { task_type?: string }) => e.task_type === "shoot" || e.task_type === "edit")))
    const hoursPerDay: number[] = []
    const dailyData: { day: string; hours: number }[] = []
    for (const u of monthFiltered) {
      const entries = Array.isArray(u.work_entries) ? u.work_entries : []
      const workH = entries.length > 0 ? calcNetWorkHours(entries) : (u.working_hours ?? 0)
      const learnFromEntries = entries.filter(e => e.task_type === "learning").reduce((sum, e) => sum + (e.duration_hours ?? 0), 0)
      const learnH = entries.length > 0 ? learnFromEntries : (u.learning_hours ?? 0)
      const breakH = entries.filter(e => e.task_type === "break").reduce((sum, e) => sum + (e.duration_hours ?? 0), 0)
      const collabH = collabHoursByDate.get(u.date) ?? 0
      const h = workH + learnH + collabH
      totalHours += h
      totalLearning += learnH
      totalBreak += breakH
      if (u.attendance_status === "present" || u.attendance_status === "wfh") presentDays++
      hoursPerDay.push(h)
      dailyData.push({ day: new Date(u.date + "T12:00:00").getDate().toString(), hours: Math.round(h * 10) / 10 })
      totalTasks += entries.filter(e => e.task_type !== "break" && e.task_type !== "learning").length
      for (const e of entries) {
        // UNIQUE COUNT RULE: edit/voiceover/poster with is_rework=true are revisions — hours still count, but NOT the unique item count
        if (e.task_type === "shoot") {
          shootH += (e.duration_hours ?? 0); shootCount++
          travelH += (e._travel_hours ?? 0)
        } else if (e.task_type === "edit") { editH += e.duration_hours ?? 0; if (!e.is_rework) editCount++ }
        else if (e.task_type === "other") { otherH += e.duration_hours ?? 0; worklogCount++ }
        else if (e.task_type === "voiceover") { voiceoverH += e.duration_hours ?? 0; if (!e.is_rework) voiceoverCount++ }
        else if (e.task_type === "poster") { posterH += e.duration_hours ?? 0; if (!e.is_rework) posterCount++ }
        else if (e.task_type === "scripting") { scriptingH += e.duration_hours ?? 0; if (!e.is_rework) scriptingCount++ }
        else if (e.task_type === "development") { developmentH += e.duration_hours ?? 0; developmentCount++ }
        else if (e.task_type === "other_activity") { otherActivityH += e.duration_hours ?? 0 }
      }
    }
    // Also count clock-in dates in the selected month that have no daily_update record
    const updateDates = new Set(monthFiltered.map(u => u.date))
    const monthPrefix = selectedMonth
      ? (monthFiltered[0]?.date ? new Date(monthFiltered[0].date + "T12:00:00").toISOString().slice(0, 7) : selectedMonth)
      : null
    for (const d of attendanceDates) {
      if (updateDates.has(d)) continue
      if (monthPrefix && !d.startsWith(monthPrefix)) continue
      presentDays++
    }

    // Leave days: count full approved leave range (incl. future dates within an approved leave)
    // WFH, shoot_day, permission are NOT leaves — they don't count against quota
    let leaveDays = 0
    for (const leave of approvedLeaves) {
      if (leave.leave_type === "permission" || leave.leave_type === "wfh" || leave.leave_type === "shoot_day") continue
      const isHalfDay = leave.leave_type === "half_day"
      const start = new Date(leave.from_date + "T12:00:00")
      const end = new Date(leave.to_date + "T12:00:00")
      for (let d = new Date(start); d <= end; d.setDate(d.getDate() + 1)) {
        const ds = d.toISOString().split("T")[0]
        if (monthPrefix && !ds.startsWith(monthPrefix)) continue
        leaveDays += isHalfDay ? 0.5 : 1
      }
    }

    // Office holiday days in the selected month period (include future holidays in the month)
    let holidayDays = 0
    for (const h of companyLeaves) {
      if (monthPrefix && !h.date.startsWith(monthPrefix)) continue
      holidayDays++
    }

    // Absent days: elapsed calendar days in period minus present days
    const todayStr = new Date(Date.now() + 5.5 * 60 * 60 * 1000).toISOString().split("T")[0]
    const firstDate = monthFiltered.length > 0 ? monthFiltered[monthFiltered.length - 1].date : todayStr
    const elapsedDays = Math.floor((new Date(todayStr + "T12:00:00").getTime() - new Date(firstDate + "T12:00:00").getTime()) / 86400000) + 1
    const absentDays = Math.max(0, elapsedDays - presentDays)

    // Overtime = total hours above fixed monthly target (25 days × 8.5h = 212.5h)
    const totalOT = Math.round(Math.max(0, totalHours - 212.5) * 10) / 10

    const productivity = filtered.length > 0
      ? Math.min(100, Math.round((presentDays / filtered.length) * 100 * 0.6 + (totalHours > 0 ? Math.min(40, (totalHours / (filtered.length * 9.5)) * 40) : 0)))
      : 0
    // Media working = shoot + edit + learning + other activity (travel already inside shoot window)
    const mediaWorkH = shootH + editH + totalLearning + otherActivityH
    // Non-media working = worklogs + voiceovers + posters + editing + scripting + development + learning + other activity
    const nonMediaWorkH = otherH + voiceoverH + posterH + editH + scriptingH + developmentH + totalLearning + otherActivityH
    const workForAvg = isMedia ? mediaWorkH : nonMediaWorkH
    const daysSubmitted = monthFiltered.length
    const avgDivisor = isFreelancerMedia ? daysSubmitted : presentDays
    const avgH = avgDivisor > 0 ? Math.round((workForAvg / avgDivisor) * 10) / 10 : 0
    return { totalHours, totalOT, totalTasks, presentDays, absentDays, leaveDays, holidayDays, totalLearning, totalBreak, travelH, shootH, editH, otherH, shootCount, editCount, worklogCount, voiceoverCount, voiceoverH, posterCount, posterH, scriptingH, scriptingCount, developmentH, developmentCount, otherActivityH, mediaWorkH, nonMediaWorkH, isMedia, avgH, hoursPerDay, dailyData: dailyData.reverse(), productivity, daysSubmitted }
  }, [filtered, attendanceDates, selectedMonth, monthFiltered, approvedLeaves, companyLeaves])

  // Which work types this person has EVER logged (scoped to `updates`, i.e. this
  // calendar year — matches the page's own fetch window) — decides which summary
  // rows appear at all; the VALUES on those rows still come from `stats` above (selected month).
  const everTypes = useMemo(() => {
    const set = new Set<string>()
    for (const u of updates) {
      for (const e of (u.work_entries ?? [])) {
        if (e.task_type) set.add(e.task_type.toLowerCase())
      }
    }
    return set
  }, [updates])

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
    // Freelancers (login) have no leave/holiday features, so skip entirely for them
    const leaveDates = new Set(leaveItems.map(l => l.date))
    const holidayItems: MergedItem[] = []
    for (const holiday of (isFreelancerMedia ? [] : companyLeaves)) {
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

  useEffect(() => {
    if (!scrollToConfirmId) return
    const el = document.getElementById(`collab-confirm-${scrollToConfirmId}`)
    if (!el) return
    el.scrollIntoView({ behavior: 'smooth', block: 'center' })
    setHighlightConfirmId(scrollToConfirmId)
    setScrollToConfirmId(null)
    const t = setTimeout(() => setHighlightConfirmId(null), 2200)
    return () => clearTimeout(t)
  }, [scrollToConfirmId, mergedList])

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

  // Latest day stats — use stored working_hours (server interval-merge) with entry sum as fallback
  const latestEntries = Array.isArray(latest?.work_entries) ? latest!.work_entries! : []
  const latestWorkH  = Number(latest?.working_hours) || latestEntries.filter(e => e.task_type !== "break" && e.task_type !== "learning").reduce((sum, e) => sum + (e.duration_hours ?? 0), 0)
  const latestLearnFromEntries = latestEntries.filter(e => e.task_type === "learning").reduce((sum, e) => sum + (e.duration_hours ?? 0), 0)
  const latestLearnH = latestLearnFromEntries > 0 ? latestLearnFromEntries : (latest?.learning_hours ?? 0)
  const latestH  = latestWorkH + latestLearnH
  const latestOT = latestH > 9.5 ? Math.round((latestH - 9.5) * 10) / 10 : 0
  const latestTasks = latestEntries.filter(e => e.task_type !== "break" && e.task_type !== "learning").length
  const latestSt = latest ? (STATUS_STYLE[latest.attendance_status] ?? STATUS_STYLE.present) : STATUS_STYLE.present


  return (
    <div style={{ background:"#F8F9FC", minHeight:"100vh", padding:"0" }}>

      {toastEl}

      {/* ── HERO ─────────────────────────────────────────────────────────── */}
      <div className="px-4 md:px-7 pt-5">
        <div style={{ background:"linear-gradient(135deg, #DE1A1A 0%, #8B1212 55%, #1A0808 100%)", borderRadius:20, padding:"20px 24px", boxShadow:"0 8px 32px rgba(180,0,0,0.35)", position:"relative", overflow:"hidden", minHeight:150 }}>
          <div style={{ position:"absolute", top:-50, right:-30, width:200, height:200, borderRadius:"50%", background:"rgba(255,255,255,0.05)", pointerEvents:"none" }} />
          <div style={{ position:"absolute", bottom:-40, left:60, width:150, height:150, borderRadius:"50%", background:"rgba(255,255,255,0.04)", pointerEvents:"none" }} />

          {/* Illustration — visible at every width, right side */}
          <div style={{ position:"absolute", right:12, bottom:0, zIndex:1, pointerEvents:"none" }}>
            <Image src="/brand/history-hero.png" alt="" width={340} height={227}
              style={{ objectFit:"contain", objectPosition:"bottom right", display:"block", height:"clamp(80px,26vw,150px)", width:"auto" }} priority />
          </div>

          {/* Text capped at every width so it never runs under the illustration */}
          <div style={{ position:"relative", zIndex:2 }} className="max-w-[56%] sm:max-w-[62%] lg:max-w-[55%]">
            <span style={{ display:"inline-flex", alignItems:"center", gap:6, fontSize:11, fontWeight:700, padding:"4px 12px", borderRadius:99, background:"rgba(255,255,255,0.15)", color:"#fff", marginBottom:10, border:"1px solid rgba(255,255,255,0.2)", letterSpacing:"0.04em" }}>
              📋 History
            </span>
            <h1 style={{ fontSize:26, fontWeight:900, color:"#fff", fontFamily:"var(--font-jakarta)", margin:"0 0 4px" }}>Update History</h1>
            <p style={{ fontSize:12, color:"rgba(255,255,255,0.7)", margin:0 }}>Your personal work diary — every submission, all in one place.</p>
          </div>
        </div>
      </div>

      {/* ── TOOLBAR ──────────────────────────────────────────────────────── */}
      <div style={{ background:"#fff", borderBottom:"1px solid #EBEDF2" }} className="px-4 md:px-7 py-3 mt-4 flex flex-wrap items-center gap-3">
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
              min="2025-01-01"
              max={new Date().toISOString().split("T")[0]}
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

      {/* ── PENDING COLLABORATION BANNER ─────────────────────────────────── */}
      {pendingCount > 0 && (
        <button onClick={handleJumpToPendingCollab}
          style={{ width:"100%", textAlign:"left", background:"rgba(99,102,241,0.08)", borderBottom:"1px solid rgba(99,102,241,0.15)", border:"none", borderBottomWidth:1, padding:"10px 20px", display:"flex", alignItems:"center", gap:10, cursor:"pointer" }}>
          <div style={{ width:28, height:28, borderRadius:"50%", background:"#6366F1", display:"flex", alignItems:"center", justifyContent:"center", flexShrink:0 }}>
            <span style={{ fontSize:12, fontWeight:900, color:"#fff" }}>{pendingCount}</span>
          </div>
          <span style={{ fontSize:13, fontWeight:700, color:"#4338CA", flex:1 }}>
            You have {pendingCount} collaboration {pendingCount === 1 ? "request" : "requests"} pending confirmation — tap to review
          </span>
          <ArrowRight size={15} style={{ color:"#6366F1", flexShrink:0 }} />
        </button>
      )}

      {/* ── MONTH PILLS ───────────────────────────────────────────────────── */}
      <div style={{ background:"#fff", borderBottom:"1px solid #EBEDF2" }} className="px-4 md:px-7 py-2.5">
        <div style={{ display:"flex", alignItems:"center", gap:8, overflowX:"auto", paddingBottom:2 }}>
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
            <div style={{ background:"linear-gradient(135deg, #DE1A1A 0%, #8B1212 55%, #1A0808 100%)", borderRadius:22, overflow:"hidden", boxShadow:"0 8px 32px rgba(180,0,0,0.4)", position:"relative", minHeight:240, maxWidth:"100%" }}>
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

              {/* Left content — fixed 27px heading didn't shrink with the 44% maxWidth box on narrow
                  screens, so long words like "productive"/"impactful" could overflow past the box and
                  into the illustration/quote-bubble zone; clamp() ties the font size to the same
                  shrinking box, and overflowWrap is a safety net for any remaining long word. */}
              <div style={{ position:"relative", zIndex:3, padding:"52px 28px 0 28px", maxWidth:"44%", overflowWrap:"break-word" }}>
                <p style={{ fontSize:13, fontWeight:600, color:"rgba(255,255,255,0.7)", margin:"0 0 10px" }}>{greeting}, {fn}! 👋</p>
                <h2 style={{ fontSize:"clamp(17px,5.5vw,27px)", fontWeight:900, color:"#fff", margin:"0 0 4px", fontFamily:"var(--font-jakarta)", lineHeight:1.25 }}>
                  Let&apos;s make today
                </h2>
                <h2 style={{ fontSize:"clamp(17px,5.5vw,27px)", fontWeight:900, color:"#FACC15", margin:"0 0 18px", fontFamily:"var(--font-jakarta)", lineHeight:1.25 }}>
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
                    {/* Pending confirmations for collab-only day */}
                    {(confirmsByDate.get(item.date) ?? []).filter(c => c.status === 'pending').map(conf => {
                      const submitter = members.find(m => m.id === conf.submitter_id)
                      const snap = conf.entry_snapshot
                      const taskType = (snap?.task_type ?? 'other') as keyof typeof TASK_CFG
                      const cfg = TASK_CFG[taskType] ?? TASK_CFG.other
                      const { Icon } = cfg
                      const isEditing = collabEditId === conf.id
                      const isRejecting = collabRejectId === conf.id
                      const loading = collabLoading === conf.id
                      const isHighlighted = highlightConfirmId === conf.id
                      return (
                        <div key={conf.id} id={`collab-confirm-${conf.id}`} style={{ borderTop: "2px solid rgba(99,102,241,0.2)", background: isHighlighted ? "rgba(99,102,241,0.14)" : "rgba(99,102,241,0.04)", padding: "12px 18px", transition: "box-shadow 0.3s, background 0.3s", boxShadow: isHighlighted ? "inset 0 0 0 2px #6366F1" : "none" }}>
                          <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 10 }}>
                            <span style={{ fontSize: 10, fontWeight: 800, color: "#6366F1", background: "rgba(99,102,241,0.12)", padding: "2px 8px", borderRadius: 99 }}>⏳ PENDING CONFIRMATION</span>
                            <span style={{ fontSize: 11, color: "#9CA3AF" }}>· by <span style={{ fontWeight: 700, color: "#6366F1" }}>{submitter?.name ?? "Teammate"}</span></span>
                          </div>
                          <div style={{ display: "flex", gap: 10, marginBottom: 10 }}>
                            <div style={{ width: 30, height: 30, borderRadius: 8, background: cfg.bg, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                              <Icon size={13} style={{ color: cfg.color }}/>
                            </div>
                            <div style={{ flex: 1 }}>
                              <div style={{ fontSize: 12, fontWeight: 800, color: "#111111", marginBottom: 2 }}>{snap?.title || cfg.label}</div>
                              {snap?.client_name && <div style={{ fontSize: 10, color: "#6B7280", fontWeight: 600, marginBottom: 3 }}>{snap.client_name}</div>}
                              {conf.original_start_time && conf.original_end_time && (
                                <div style={{ fontSize: 11, fontWeight: 700, color: "#6366F1" }}>
                                  🕐 {fmt12(conf.original_start_time)} – {fmt12(conf.original_end_time)}
                                  {conf.original_duration_hours ? ` · ${fmtH(conf.original_duration_hours)}` : ""}
                                </div>
                              )}
                            </div>
                          </div>
                          {isEditing ? (
                            <div style={{ display: "flex", flexDirection: "column", gap: 8, padding: "10px", background: "#fff", borderRadius: 10, border: "1px solid rgba(99,102,241,0.2)" }}>
                              <div style={{ fontSize: 11, fontWeight: 700, color: "#374151" }}>My actual time:</div>
                              <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                                <div><div style={{ fontSize: 10, color: "#9CA3AF", marginBottom: 2 }}>Start</div>
                                  <input type="time" value={collabEditStart} onChange={e => setCollabEditStart(e.target.value)} style={{ border: "1px solid #EBEDF2", borderRadius: 8, padding: "6px 8px", fontSize: 12, outline: "none" }}/></div>
                                <div style={{ marginTop: 14, color: "#9CA3AF" }}>–</div>
                                <div><div style={{ fontSize: 10, color: "#9CA3AF", marginBottom: 2 }}>End</div>
                                  <input type="time" value={collabEditEnd} onChange={e => setCollabEditEnd(e.target.value)} style={{ border: "1px solid #EBEDF2", borderRadius: 8, padding: "6px 8px", fontSize: 12, outline: "none" }}/></div>
                              </div>
                              <div style={{ display: "flex", gap: 6 }}>
                                <button disabled={loading} onClick={async () => {
                                  if (!collabEditStart || !collabEditEnd) return
                                  setCollabLoading(conf.id)
                                  const r = await editCollaborationTime(conf.id, collabEditStart, collabEditEnd)
                                  if (r.success) setCollabConfirms(prev => prev.map(c => c.id === conf.id ? { ...c, status: 'edited_confirmed', confirmed_start_time: collabEditStart, confirmed_end_time: collabEditEnd } : c))
                                  setCollabLoading(null); setCollabEditId(null)
                                }} style={{ flex: 1, padding: "7px", borderRadius: 8, background: "#6366F1", color: "#fff", fontSize: 12, fontWeight: 700, border: "none", cursor: "pointer" }}>
                                  {loading ? "Saving…" : "Save My Time"}
                                </button>
                                <button onClick={() => setCollabEditId(null)} style={{ padding: "7px 12px", borderRadius: 8, background: "#F5F6FA", color: "#374151", fontSize: 12, fontWeight: 700, border: "none", cursor: "pointer" }}>Cancel</button>
                              </div>
                            </div>
                          ) : isRejecting ? (
                            <div style={{ display: "flex", flexDirection: "column", gap: 8, padding: "10px", background: "#fff", borderRadius: 10, border: "1px solid rgba(239,68,68,0.2)" }}>
                              <input value={collabRejectReason} onChange={e => setCollabRejectReason(e.target.value)} placeholder="I was not involved in this task"
                                style={{ border: "1px solid #EBEDF2", borderRadius: 8, padding: "7px 10px", fontSize: 12, outline: "none" }}/>
                              <div style={{ display: "flex", gap: 6 }}>
                                <button disabled={loading} onClick={async () => {
                                  setCollabLoading(conf.id)
                                  const r = await rejectCollaboration(conf.id, collabRejectReason)
                                  if (r.success) setCollabConfirms(prev => prev.filter(c => c.id !== conf.id))
                                  setCollabLoading(null); setCollabRejectId(null); setCollabRejectReason("")
                                }} style={{ flex: 1, padding: "7px", borderRadius: 8, background: "#EF4444", color: "#fff", fontSize: 12, fontWeight: 700, border: "none", cursor: "pointer" }}>
                                  {loading ? "Rejecting…" : "Reject"}
                                </button>
                                <button onClick={() => setCollabRejectId(null)} style={{ padding: "7px 12px", borderRadius: 8, background: "#F5F6FA", color: "#374151", fontSize: 12, fontWeight: 700, border: "none", cursor: "pointer" }}>Cancel</button>
                              </div>
                            </div>
                          ) : (
                            <div style={{ display: "flex", gap: 6 }}>
                              <button disabled={loading} onClick={async () => {
                                setCollabLoading(conf.id)
                                const r = await confirmCollaboration(conf.id)
                                if (r.success) setCollabConfirms(prev => prev.map(c => c.id === conf.id ? { ...c, status: 'confirmed' } : c))
                                else showToast(r.error ?? "Failed to confirm. Try again.")
                                setCollabLoading(null)
                              }} style={{ flex: 1, padding: "8px", borderRadius: 8, background: "#22C55E", color: "#fff", fontSize: 12, fontWeight: 700, border: "none", cursor: "pointer" }}>
                                {loading ? "…" : "✓ Confirm"}
                              </button>
                              <button disabled={loading} onClick={() => { setCollabEditId(conf.id); setCollabEditStart(conf.original_start_time ?? ""); setCollabEditEnd(conf.original_end_time ?? "") }}
                                style={{ flex: 1, padding: "8px", borderRadius: 8, background: "#6366F1", color: "#fff", fontSize: 12, fontWeight: 700, border: "none", cursor: "pointer" }}>
                                ✏ Edit Time
                              </button>
                              <button disabled={loading} onClick={() => setCollabRejectId(conf.id)}
                                style={{ flex: 1, padding: "8px", borderRadius: 8, background: "#FEE2E2", color: "#DC2626", fontSize: 12, fontWeight: 700, border: "none", cursor: "pointer" }}>
                                ✗ Reject
                              </button>
                            </div>
                          )}
                        </div>
                      )
                    })}
                    {item.pus.map(pu => {
                      const submitter = members.find(m => m.id === pu.user_id)
                      const allEnt = (Array.isArray(pu.work_entries) ? pu.work_entries : []) as WorkEntry[]
                      const puEntries = userId ? allEnt.filter(e => Array.isArray(e.participant_ids) && e.participant_ids.includes(userId)) : []
                      if (puEntries.length === 0) return null
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
                            // Overlay confirmed/edited time if user already confirmed this entry
                            const entryConf = collabConfirms.find(c =>
                              c.daily_update_id === pu.id &&
                              (c.status === "confirmed" || c.status === "edited_confirmed") &&
                              (pe.id ? c.entry_id === pe.id : true)
                            )
                            const showStart = entryConf?.confirmed_start_time ?? pe.start_time
                            const showEnd   = entryConf?.confirmed_end_time   ?? pe.end_time
                            const dur = entryConf?.confirmed_hours ?? (calcDurationFromTimes(showStart, showEnd) ?? (pe.duration_hours ?? 0))
                            return (
                              <div key={pi} style={{ display:"flex", gap:10, padding: pi > 0 ? "10px 0 0" : "0", borderTop: pi > 0 ? "1px solid rgba(99,102,241,0.08)" : "none", alignItems:"flex-start" }}>
                                <div style={{ width:30, height:30, borderRadius:8, background:cfg.bg, display:"flex", alignItems:"center", justifyContent:"center", flexShrink:0 }}>
                                  <Icon size={13} style={{ color:cfg.color }}/>
                                </div>
                                <div style={{ flex:1, minWidth:0 }}>
                                  <div style={{ display:"flex", alignItems:"center", gap:6, flexWrap:"wrap", marginBottom:2 }}>
                                    <span style={{ fontSize:12, fontWeight:800, color:"#111111" }}>{displayTitle}</span>
                                    <span style={{ fontSize:9, fontWeight:700, color:cfg.color, background:cfg.bg, padding:"1px 6px", borderRadius:99 }}>{cfg.label}</span>
                                    {entryConf?.status === "edited_confirmed" && <span style={{ fontSize:9, fontWeight:700, color:"#10B981", background:"rgba(16,185,129,0.1)", padding:"1px 6px", borderRadius:99 }}>✓ Your time</span>}
                                    {entryConf?.status === "confirmed" && <span style={{ fontSize:9, fontWeight:700, color:"#10B981", background:"rgba(16,185,129,0.1)", padding:"1px 6px", borderRadius:99 }}>✓ Confirmed</span>}
                                  </div>
                                  {displayClient && <p style={{ fontSize:10, color:"#6B7280", margin:"0 0 2px", fontWeight:600 }}>{displayClient}</p>}
                                  <div style={{ display:"flex", alignItems:"center", gap:10, flexWrap:"wrap" }}>
                                    {dur + tH > 0 && <span style={{ fontSize:10, fontWeight:700, color:"#374151", display:"flex", alignItems:"center", gap:3 }}><Clock size={9} style={{ color:"#9CA3AF" }}/>{fmtH(dur + tH)}</span>}
                                    {showStart && showEnd && <span style={{ fontSize:10, color:"#9CA3AF" }}>{fmt12(showStart)} – {fmt12(showEnd)}</span>}
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

                if (leave.leave_type === "wfh") {
                  return (
                    <div key={`leave-${item.date}`} style={{ background:"#fff", borderRadius:20, border:"1px solid rgba(14,165,233,0.2)", overflow:"hidden", boxShadow:"0 2px 10px rgba(0,0,0,0.05)" }}>
                      <div style={{ display:"flex", alignItems:"center", justifyContent:"space-between", padding:"14px 18px", borderBottom:"1px solid rgba(14,165,233,0.1)", background:"rgba(14,165,233,0.02)" }}>
                        <div style={{ display:"flex", alignItems:"center", gap:10 }}>
                          <div style={{ width:38, height:38, borderRadius:10, background:"rgba(14,165,233,0.1)", display:"flex", flexDirection:"column", alignItems:"center", justifyContent:"center", flexShrink:0 }}>
                            <span style={{ fontSize:14, fontWeight:900, color:"#0EA5E9", lineHeight:1 }}>{ld.getDate()}</span>
                            <span style={{ fontSize:8, fontWeight:700, color:"#0EA5E9", textTransform:"uppercase" }}>{ldMon}</span>
                          </div>
                          <div>
                            <p style={{ fontSize:13, fontWeight:800, color:"#111111", margin:0 }}>{ldLabel}</p>
                            <p style={{ fontSize:10, color:"#9CA3AF", margin:0 }}>Work From Home</p>
                          </div>
                        </div>
                        <span style={{ fontSize:11, fontWeight:700, color:"#0EA5E9", background:"rgba(14,165,233,0.12)", padding:"3px 10px", borderRadius:99 }}>Approved</span>
                      </div>
                      <div style={{ display:"flex", alignItems:"center", gap:16, padding:"20px 18px" }}>
                        <div style={{ fontSize:36, lineHeight:1 }}>🏠</div>
                        <div>
                          <p style={{ fontSize:14, fontWeight:900, color:"#0EA5E9", margin:"0 0 3px" }}>Work From Home</p>
                          <p style={{ fontSize:12, color:"#6B7280", margin:0 }}>{leave.reason ?? "Approved WFH"}</p>
                        </div>
                      </div>
                    </div>
                  )
                }

                if (leave.leave_type === "shoot_day") {
                  return (
                    <div key={`leave-${item.date}`} style={{ background:"#fff", borderRadius:20, border:"1px solid rgba(219,39,119,0.2)", overflow:"hidden", boxShadow:"0 2px 10px rgba(0,0,0,0.05)" }}>
                      <div style={{ display:"flex", alignItems:"center", justifyContent:"space-between", padding:"14px 18px", borderBottom:"1px solid rgba(219,39,119,0.1)", background:"rgba(219,39,119,0.02)" }}>
                        <div style={{ display:"flex", alignItems:"center", gap:10 }}>
                          <div style={{ width:38, height:38, borderRadius:10, background:"rgba(219,39,119,0.1)", display:"flex", flexDirection:"column", alignItems:"center", justifyContent:"center", flexShrink:0 }}>
                            <span style={{ fontSize:14, fontWeight:900, color:"#DB2777", lineHeight:1 }}>{ld.getDate()}</span>
                            <span style={{ fontSize:8, fontWeight:700, color:"#DB2777", textTransform:"uppercase" }}>{ldMon}</span>
                          </div>
                          <div>
                            <p style={{ fontSize:13, fontWeight:800, color:"#111111", margin:0 }}>{ldLabel}</p>
                            <p style={{ fontSize:10, color:"#9CA3AF", margin:0 }}>Shoot Day</p>
                          </div>
                        </div>
                        <span style={{ fontSize:11, fontWeight:700, color:"#DB2777", background:"rgba(219,39,119,0.12)", padding:"3px 10px", borderRadius:99 }}>Approved</span>
                      </div>
                      <div style={{ display:"flex", alignItems:"center", gap:16, padding:"20px 18px" }}>
                        <div style={{ fontSize:36, lineHeight:1 }}>🎥</div>
                        <div>
                          <p style={{ fontSize:14, fontWeight:900, color:"#DB2777", margin:"0 0 3px" }}>Shoot Day</p>
                          <p style={{ fontSize:12, color:"#6B7280", margin:0 }}>{leave.reason ?? "Approved Shoot Day"}</p>
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
              const toMS = (t?: string | null) => { if (!t) return 99999; const p = t.split(':'); return parseInt(p[0]) * 60 + (parseInt(p[1] ?? '0') || 0) }
              const collabForDate = (participatedByDate.get(u.date) ?? []).flatMap(pu => {
                const submitter = members.find(m => m.id === pu.user_id)
                const allEnts = (Array.isArray(pu.work_entries) ? pu.work_entries : []) as WorkEntry[]
                const puEnts = userId ? allEnts.filter(e => Array.isArray(e.participant_ids) && e.participant_ids.includes(userId)) : []
                return puEnts.map(entry => ({ type: 'collab' as const, entry, submitter, puId: pu.id }))
              })
              // Half day / permission / WFH / shoot-day leave — shown in its actual chronological
              // slot among the real entries (unlike full_day, these leave types normally coexist
              // with a logged partial day), not as a separate banner pinned above everything.
              const leaveOnDay = approvedLeaves.find(l => l.leave_type !== "full_day" && u.date >= l.from_date && u.date <= l.to_date)
              const leaveBannerStyle: Record<string, { emoji: string; title: string; color: string; bg: string }> = {
                half_day:   { emoji: "🌗", title: "Half Day Leave" + (leaveOnDay?.half_day_period ? ` · ${leaveOnDay.half_day_period}` : ""), color: "#D97706", bg: "rgba(245,158,11,0.06)" },
                permission: { emoji: "🕐", title: "Permission", color: "#6366F1", bg: "rgba(99,102,241,0.06)" },
                wfh:        { emoji: "🏠", title: "Work From Home", color: "#0EA5E9", bg: "rgba(14,165,233,0.06)" },
                shoot_day:  { emoji: "🎥", title: "Shoot Day", color: "#DB2777", bg: "rgba(219,39,119,0.06)" },
              }
              const leaveBanner = leaveOnDay ? leaveBannerStyle[leaveOnDay.leave_type] : undefined
              let leaveStartT = "", leaveEndT = ""
              if (leaveOnDay?.leave_type === "half_day") {
                leaveStartT = leaveOnDay.half_day_from_time ?? ""
                leaveEndT   = leaveOnDay.half_day_to_time ?? ""
              } else if (leaveOnDay?.leave_type === "permission") {
                leaveStartT = leaveOnDay.permission_time ?? ""
                leaveEndT   = leaveOnDay.permission_end_time ?? ""
                if (!leaveEndT && leaveStartT && leaveOnDay.permission_hours) {
                  const [fh, fm] = leaveStartT.split(":").map(Number)
                  const totalMins = fh * 60 + fm + Math.round(leaveOnDay.permission_hours * 60)
                  leaveEndT = `${String(Math.floor(totalMins / 60)).padStart(2,"0")}:${String(totalMins % 60).padStart(2,"0")}`
                }
              }
              const leaveDur = leaveStartT && leaveEndT ? calcDurationFromTimes(leaveStartT, leaveEndT) : null
              // WFH/shoot_day are whole-day context, not a partial-day time slot to fill in —
              // they're reflected in the day-header badge below instead of a banner or strip.
              const isWholeDayContext = leaveOnDay?.leave_type === "wfh" || leaveOnDay?.leave_type === "shoot_day"
              // Only fall back to a compact top strip when there's no time on file to place it.
              const leaveNeedsFallbackBanner = leaveBanner && !(leaveStartT && leaveEndT) && !isWholeDayContext
              const leaveTLItem = (leaveOnDay && leaveBanner && leaveStartT && leaveEndT)
                ? [{ type: 'leave' as const, entry: { start_time: leaveStartT, end_time: leaveEndT }, leave: leaveOnDay, banner: leaveBanner, dur: leaveDur }]
                : []
              const mergedTL = [
                ...entries.map((e, idx) => ({ type: 'own' as const, entry: e, origIdx: idx })),
                ...collabForDate,
                ...leaveTLItem,
              ].sort((a, b) => toMS(a.entry.start_time) - toMS(b.entry.start_time))
              // Day-header badge: WFH/Shoot Day override the generic status; a normal present
              // day reads as "Office" rather than the less specific "Present".
              const st = leaveOnDay?.leave_type === "wfh"
                ? { label:"WFH", color:"#0EA5E9", bg:"rgba(14,165,233,0.1)", dot:"#0EA5E9" }
                : leaveOnDay?.leave_type === "shoot_day"
                ? { label:"Shoot", color:"#DB2777", bg:"rgba(219,39,119,0.1)", dot:"#DB2777" }
                : u.attendance_status === "present"
                ? { ...STATUS_STYLE.present, label:"Office" }
                : (STATUS_STYLE[u.attendance_status] ?? STATUS_STYLE.present)
              const dateLabel = new Date(u.date + "T12:00:00").toLocaleDateString("en-US", { weekday:"long", day:"numeric", month:"long", year:"numeric" })
              const holidayOnDay = holidayMap.get(u.date)
              return (
                <div key={u.id} style={{ background:"#fff", borderRadius:20, border:"1px solid #EBEDF2", overflow:"hidden", boxShadow:"0 2px 10px rgba(0,0,0,0.05)" }}>
                  {/* Leave banner fallback — only when no time window is recorded on the leave */}
                  {leaveNeedsFallbackBanner && (
                    <div style={{ display:"flex", alignItems:"center", gap:8, padding:"8px 18px", background:leaveBanner!.bg, borderBottom:`1px solid ${leaveBanner!.color}20` }}>
                      <span style={{ fontSize:14 }}>{leaveBanner!.emoji}</span>
                      <span style={{ fontSize:11, fontWeight:700, color:leaveBanner!.color }}>{leaveBanner!.title}{leaveOnDay?.reason ? `: ${leaveOnDay.reason}` : ""}</span>
                    </div>
                  )}
                  {/* Holiday banner */}
                  {holidayOnDay && (
                    <div style={{ display:"flex", alignItems:"center", gap:8, padding:"8px 18px", background:"rgba(30,64,175,0.08)", borderBottom:"1px solid rgba(30,64,175,0.12)" }}>
                      <span style={{ fontSize:14 }}>🏢</span>
                      <span style={{ fontSize:11, fontWeight:700, color:"#1E40AF" }}>Company Holiday: {holidayOnDay.name}</span>
                    </div>
                  )}
                  {/* Day header */}
                  <div style={{ display:"flex", alignItems:"center", justifyContent:"space-between", padding:"14px 18px", borderBottom:"1px solid #F5F6FA", gap:8, flexWrap:"nowrap", overflowX:"auto" }}>
                    <div style={{ display:"flex", alignItems:"center", gap:10, flexShrink:0 }}>
                      <div style={{ width:38, height:38, borderRadius:10, background:"rgba(222,26,26,0.08)", display:"flex", flexDirection:"column", alignItems:"center", justifyContent:"center", flexShrink:0 }}>
                        <span style={{ fontSize:14, fontWeight:900, color:"#DE1A1A", lineHeight:1 }}>
                          {new Date(u.date + "T12:00:00").getDate()}
                        </span>
                        <span style={{ fontSize:8, fontWeight:700, color:"#DE1A1A", textTransform:"uppercase" }}>
                          {new Date(u.date + "T12:00:00").toLocaleDateString("en-US", { month:"short" })}
                        </span>
                      </div>
                      <div style={{ minWidth:0 }}>
                        <p style={{ fontSize:13, fontWeight:800, color:"#111111", margin:0, whiteSpace:"nowrap" }}>{dateLabel}</p>
                        <p style={{ fontSize:10, color:"#9CA3AF", margin:0, whiteSpace:"nowrap" }}>
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
                    <div style={{ display:"flex", alignItems:"center", gap:6, flexWrap:"nowrap", flexShrink:0 }}>
                      {(() => {
                        const workH   = calcNetWorkHours(entries, workLayout ?? undefined)
                        const travelH = entries.filter(e => e.task_type === "shoot").reduce((s, e) => s + (e._travel_hours ?? 0), 0)
                        const learnEntryH = entries.filter(e => e.task_type === "learning").reduce((s, e) => s + (e.duration_hours ?? 0), 0)
                        const learnH  = learnEntryH > 0 ? learnEntryH : (u.learning_hours ?? 0)
                        const breakH  = entries.filter(e => e.task_type === "break").reduce((s, e) => s + (e.duration_hours ?? 0), 0)
                        const collabH = collabHoursByDate.get(u.date) ?? 0
                        const displayH = workH + collabH || (u.working_hours ?? 0)
                        return (
                          <>
                            {displayH > 0 && (
                              <span style={{ fontSize:11, fontWeight:700, color:"#374151", display:"flex", alignItems:"center", gap:4, whiteSpace:"nowrap" }}>
                                <Clock size={11} style={{ color:"#9CA3AF" }}/>
                                {fmtH(displayH)}
                                {collabH > 0 && <span style={{ fontSize:9, fontWeight:600, color:"#6366F1", whiteSpace:"nowrap" }}>(+{fmtH(collabH)})</span>}
                              </span>
                            )}
                            {travelH > 0 && (
                              <span style={{ fontSize:10, fontWeight:700, color:"#D97706", display:"flex", alignItems:"center", gap:3, background:"rgba(245,158,11,0.08)", border:"1px solid rgba(245,158,11,0.2)", borderRadius:99, padding:"2px 7px", whiteSpace:"nowrap" }}>
                                🚗 {fmtH(travelH)}
                              </span>
                            )}
                            {learnH > 0 && (
                              <span style={{ fontSize:10, fontWeight:700, color:"#6366F1", display:"flex", alignItems:"center", gap:3, background:"rgba(99,102,241,0.08)", border:"1px solid rgba(99,102,241,0.2)", borderRadius:99, padding:"2px 7px", whiteSpace:"nowrap" }}>
                                📚 {fmtH(learnH)}
                              </span>
                            )}
                            {breakH > 0 && (
                              <span style={{ fontSize:10, fontWeight:700, color:"#78716C", display:"flex", alignItems:"center", gap:3, background:"rgba(120,113,108,0.08)", border:"1px solid rgba(120,113,108,0.18)", borderRadius:99, padding:"2px 7px", whiteSpace:"nowrap" }}>
                                ☕ {fmtH(breakH)}
                              </span>
                            )}
                          </>
                        )
                      })()}
                      <span style={{ fontSize:11, fontWeight:700, color:st.color, background:st.bg, padding:"3px 10px", borderRadius:99, whiteSpace:"nowrap", flexShrink:0 }}>
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
                  {entries.length === 0 && collabForDate.length === 0 && u.learning_topic ? (
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
                            onClick={async () => { if (!(await confirm("Delete this learning entry?"))) return; await updateDailyUpdateLearning(u.id, { learning_hours: null, learning_topic: null, learning_notes: null, learning_start_time: null, learning_end_time: null }); router.refresh() }}
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
                            <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:8 }}>
                              <div>
                                <label style={{ fontSize:10, fontWeight:600, color:"#6B7280", display:"block", marginBottom:3 }}>For Client</label>
                                <div style={{ position:"relative" }}>
                                  <select value={learningDraft.client} onChange={e => setLearningDraft(d => ({ ...d, client: e.target.value }))}
                                    style={{ width:"100%", padding:"7px 28px 7px 10px", borderRadius:8, border:"1px solid #E5E7EB", fontSize:12, color:"#111111", outline:"none", background:"#fff", boxSizing:"border-box", appearance:"none" }}>
                                    <option value="">Select client…</option>
                                    <option value="GROFAST DIGITAL">GROFAST DIGITAL</option>
                                    <option value="GROFAST AI">GROFAST AI</option>
                                    <option value="KARTHICK BRANDS">KARTHICK BRANDS</option>
                                  </select>
                                  <ChevronDown size={11} style={{ position:"absolute", right:8, top:"50%", transform:"translateY(-50%)", color:"#9CA3AF", pointerEvents:"none" }} />
                                </div>
                              </div>
                              <div>
                                <label style={{ fontSize:10, fontWeight:600, color:"#6B7280", display:"block", marginBottom:3 }}>Topic / Course</label>
                                <input value={learningDraft.topic} onChange={e => setLearningDraft(d => ({ ...d, topic: e.target.value }))}
                                  placeholder="What did you learn?"
                                  style={{ width:"100%", padding:"7px 10px", borderRadius:8, border:"1px solid #E5E7EB", fontSize:12, color:"#111111", outline:"none", background:"#fff", boxSizing:"border-box" }}/>
                              </div>
                            </div>
                            <div>
                              <label style={{ fontSize:10, fontWeight:600, color:"#6B7280", display:"block", marginBottom:3 }}>📘 Learning Time</label>
                              <div style={{ display:"flex", alignItems:"center", gap:8, flexWrap:"wrap" }}>
                                <HTimePicker value={learningDraft.startTime || "09:00"} onChange={v => setLearningDraft(d => ({ ...d, startTime: v }))} />
                                <span style={{ fontSize:11, color:"#9CA3AF", flexShrink:0 }}>to</span>
                                <HTimePicker value={learningDraft.endTime || "09:00"} onChange={v => setLearningDraft(d => ({ ...d, endTime: v }))} />
                                {(() => { const [fh,fm] = learningDraft.startTime ? learningDraft.startTime.split(":").map(Number) : [0,0]; const [th,tm] = learningDraft.endTime ? learningDraft.endTime.split(":").map(Number) : [0,0]; const h = Math.max(0,(th*60+tm-fh*60-fm)/60); return <span style={{ fontSize:10, fontWeight:700, padding:"3px 8px", borderRadius:99, background:h>0?"rgba(245,158,11,0.1)":"#F9FAFB", color:h>0?"#B45309":"#9CA3AF" }}>{h>0?fmtH(h):"—"}</span> })()}
                              </div>
                            </div>
                            <div className={`grid ${members.length > 0 ? "md:grid-cols-[7fr_3fr]" : ""}`} style={{ gap:10, alignItems:"start" }}>
                              <div>
                                <label style={{ fontSize:10, fontWeight:600, color:"#6B7280", display:"block", marginBottom:3 }}>Notes</label>
                                <textarea rows={2} value={learningDraft.notes} onChange={e => setLearningDraft(d => ({ ...d, notes: e.target.value }))}
                                  placeholder="Any notes or details…"
                                  style={{ width:"100%", padding:"7px 10px", borderRadius:8, border:"1px solid #E5E7EB", fontSize:12, color:"#111111", outline:"none", background:"#fff", resize:"none", boxSizing:"border-box" }}/>
                              </div>
                              {members.length > 0 && (
                                <div>
                                  <label style={{ fontSize:10, fontWeight:600, color:"#6B7280", display:"block", marginBottom:3 }}>👥 Learned With</label>
                                  <div style={{ position:"relative" }}>
                                    <select value="" onChange={ev => { const id = ev.target.value; if (id && !learningDraft.participantIds.includes(id)) setLearningDraft(d => ({ ...d, participantIds: [...d.participantIds, id] })) }}
                                      style={{ width:"100%", padding:"7px 24px 7px 10px", borderRadius:8, border:"1px solid #E5E7EB", fontSize:12, color:"#111111", outline:"none", background:"#fff", boxSizing:"border-box", appearance:"none" }}>
                                      <option value="">Add teammate…</option>
                                      {members.filter(m => !learningDraft.participantIds.includes(m.id)).map(m => <option key={m.id} value={m.id}>{m.name}</option>)}
                                    </select>
                                    <ChevronDown size={11} style={{ position:"absolute", right:8, top:"50%", transform:"translateY(-50%)", color:"#9CA3AF", pointerEvents:"none" }} />
                                  </div>
                                  {learningDraft.participantIds.length > 0 && (
                                    <div style={{ display:"flex", flexWrap:"wrap", gap:4, marginTop:6 }}>
                                      {learningDraft.participantIds.map(pid => {
                                        const m = members.find(t => t.id === pid); if (!m) return null
                                        const ini = m.name.split(" ").map((n:string)=>n[0]).join("").slice(0,2).toUpperCase()
                                        return (<button key={pid} type="button" onClick={() => setLearningDraft(d => ({ ...d, participantIds: d.participantIds.filter(p => p !== pid) }))}
                                          style={{ display:"flex", alignItems:"center", gap:4, padding:"3px 8px 3px 5px", borderRadius:99, background:"rgba(16,185,129,0.1)", border:"1.5px solid rgba(16,185,129,0.3)", cursor:"pointer" }}>
                                          <div style={{ width:16, height:16, borderRadius:"50%", background:"#10B981", display:"flex", alignItems:"center", justifyContent:"center", fontSize:7, fontWeight:900, color:"#fff" }}>{ini}</div>
                                          <span style={{ fontSize:10, fontWeight:700, color:"#065F46" }}>{m.name.split(" ")[0]}</span>
                                          <span style={{ fontSize:8, color:"#10B981" }}>✕</span>
                                        </button>)
                                      })}
                                    </div>
                                  )}
                                </div>
                              )}
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
                  ) : entries.length === 0 && collabForDate.length === 0 ? (() => {
                    // Driven entirely by the leaves table, not attendance_status — the DB's
                    // attendance_status column can only ever be present/absent/holiday/outside
                    // (see check constraint), so a stored 'leave' value can never exist and
                    // must never be relied on here.
                    const leaveForDay = approvedLeaves.find(l => u.date >= l.from_date && u.date <= l.to_date)
                    if (leaveForDay?.leave_type === "full_day") {
                      return (
                        <div style={{ display:"flex", alignItems:"center", gap:16, padding:"20px 18px", background:"linear-gradient(135deg,rgba(16,185,129,0.06) 0%,rgba(16,185,129,0.02) 100%)", borderTop:"1px solid rgba(16,185,129,0.12)" }}>
                          <div style={{ fontSize:40, lineHeight:1 }}>🌴</div>
                          <div>
                            <p style={{ fontSize:14, fontWeight:900, color:"#059669", margin:"0 0 3px" }}>Full Day Leave</p>
                            <p style={{ fontSize:12, color:"#6B7280", margin:0 }}>{leaveForDay.reason ?? "Approved Leave"}</p>
                          </div>
                          <span style={{ marginLeft:"auto", fontSize:11, fontWeight:700, padding:"4px 12px", borderRadius:99, background:"rgba(16,185,129,0.12)", color:"#10B981" }}>Approved</span>
                        </div>
                      )
                    }
                    // half_day/permission/wfh/shoot_day now render via the unconditional
                    // leaveBanner at the top of the card (see leaveOnDay above), so they're
                    // intentionally not duplicated here.
                    return (
                      <p style={{ fontSize:12, color:"#9CA3AF", padding:"16px 18px", margin:0 }}>
                        {leaveForDay ? "You were on leave this day." : "No work entries logged"}
                      </p>
                    )
                  })() : (
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
                                <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:8 }}>
                                  <div>
                                    <label style={{ fontSize:10, fontWeight:600, color:"#6B7280", display:"block", marginBottom:3 }}>For Client</label>
                                    <div style={{ position:"relative" }}>
                                      <select value={learningDraft.client} onChange={e => setLearningDraft(d => ({ ...d, client: e.target.value }))}
                                        style={{ width:"100%", padding:"7px 28px 7px 10px", borderRadius:8, border:"1px solid #E5E7EB", fontSize:12, color:"#111111", outline:"none", background:"#fff", boxSizing:"border-box", appearance:"none" }}>
                                        <option value="">Select client…</option>
                                        {activeClientsForEdit.map(c => <option key={c} value={c}>{c}</option>)}
                                        {pastClientsOnly.map(c => <option key={`p-${c}`} value={c}>{c}</option>)}
                                      </select>
                                      <ChevronDown size={11} style={{ position:"absolute", right:8, top:"50%", transform:"translateY(-50%)", color:"#9CA3AF", pointerEvents:"none" }} />
                                    </div>
                                  </div>
                                  <div>
                                    <label style={{ fontSize:10, fontWeight:600, color:"#6B7280", display:"block", marginBottom:3 }}>Topic / Course</label>
                                    <input value={learningDraft.topic} onChange={e => setLearningDraft(d => ({ ...d, topic: e.target.value }))}
                                      placeholder="What did you learn?"
                                      style={{ width:"100%", padding:"7px 10px", borderRadius:8, border:"1px solid #E5E7EB", fontSize:12, color:"#111111", outline:"none", background:"#fff", boxSizing:"border-box" }}/>
                                  </div>
                                </div>
                                <div>
                                  <label style={{ fontSize:10, fontWeight:600, color:"#6B7280", display:"block", marginBottom:3 }}>📘 Learning Time</label>
                                  <div style={{ display:"flex", alignItems:"center", gap:8, flexWrap:"wrap" }}>
                                    <HTimePicker value={learningDraft.startTime || "09:00"} onChange={v => setLearningDraft(d => ({ ...d, startTime: v }))} />
                                    <span style={{ fontSize:11, color:"#9CA3AF", flexShrink:0 }}>to</span>
                                    <HTimePicker value={learningDraft.endTime || "09:00"} onChange={v => setLearningDraft(d => ({ ...d, endTime: v }))} />
                                    {(() => { const [fh,fm] = learningDraft.startTime ? learningDraft.startTime.split(":").map(Number) : [0,0]; const [th,tm] = learningDraft.endTime ? learningDraft.endTime.split(":").map(Number) : [0,0]; const h = Math.max(0,(th*60+tm-fh*60-fm)/60); return <span style={{ fontSize:10, fontWeight:700, padding:"3px 8px", borderRadius:99, background:h>0?"rgba(245,158,11,0.1)":"#F9FAFB", color:h>0?"#B45309":"#9CA3AF" }}>{h>0?fmtH(h):"—"}</span> })()}
                                  </div>
                                </div>
                                <div className={`grid ${members.length > 0 ? "md:grid-cols-[7fr_3fr]" : ""}`} style={{ gap:10, alignItems:"start" }}>
                                  <div>
                                    <label style={{ fontSize:10, fontWeight:600, color:"#6B7280", display:"block", marginBottom:3 }}>Notes</label>
                                    <textarea rows={2} value={learningDraft.notes} onChange={e => setLearningDraft(d => ({ ...d, notes: e.target.value }))}
                                      placeholder="Any notes or details…"
                                      style={{ width:"100%", padding:"7px 10px", borderRadius:8, border:"1px solid #E5E7EB", fontSize:12, color:"#111111", outline:"none", background:"#fff", resize:"none", boxSizing:"border-box" }}/>
                                  </div>
                                  {members.length > 0 && (
                                    <div>
                                      <label style={{ fontSize:10, fontWeight:600, color:"#6B7280", display:"block", marginBottom:3 }}>👥 Learned With</label>
                                      <div style={{ position:"relative" }}>
                                        <select value="" onChange={ev => { const id = ev.target.value; if (id && !learningDraft.participantIds.includes(id)) setLearningDraft(d => ({ ...d, participantIds: [...d.participantIds, id] })) }}
                                          style={{ width:"100%", padding:"7px 24px 7px 10px", borderRadius:8, border:"1px solid #E5E7EB", fontSize:12, color:"#111111", outline:"none", background:"#fff", boxSizing:"border-box", appearance:"none" }}>
                                          <option value="">Add teammate…</option>
                                          {members.filter(m => !learningDraft.participantIds.includes(m.id)).map(m => <option key={m.id} value={m.id}>{m.name}</option>)}
                                        </select>
                                        <ChevronDown size={11} style={{ position:"absolute", right:8, top:"50%", transform:"translateY(-50%)", color:"#9CA3AF", pointerEvents:"none" }} />
                                      </div>
                                      {learningDraft.participantIds.length > 0 && (
                                        <div style={{ display:"flex", flexWrap:"wrap", gap:4, marginTop:6 }}>
                                          {learningDraft.participantIds.map(pid => {
                                            const m = members.find(t => t.id === pid); if (!m) return null
                                            const ini = m.name.split(" ").map((n:string)=>n[0]).join("").slice(0,2).toUpperCase()
                                            return (<button key={pid} type="button" onClick={() => setLearningDraft(d => ({ ...d, participantIds: d.participantIds.filter(p => p !== pid) }))}
                                              style={{ display:"flex", alignItems:"center", gap:4, padding:"3px 8px 3px 5px", borderRadius:99, background:"rgba(16,185,129,0.1)", border:"1.5px solid rgba(16,185,129,0.3)", cursor:"pointer" }}>
                                              <div style={{ width:16, height:16, borderRadius:"50%", background:"#10B981", display:"flex", alignItems:"center", justifyContent:"center", fontSize:7, fontWeight:900, color:"#fff" }}>{ini}</div>
                                              <span style={{ fontSize:10, fontWeight:700, color:"#065F46" }}>{m.name.split(" ")[0]}</span>
                                              <span style={{ fontSize:8, color:"#10B981" }}>✕</span>
                                            </button>)
                                          })}
                                        </div>
                                      )}
                                    </div>
                                  )}
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

                      {mergedTL.map((item, itemIdx) => {
                        const isLast = itemIdx === mergedTL.length - 1
                        if (item.type === 'leave') {
                          const { leave, banner, dur } = item
                          return (
                            <div key={`leave-${leave.id}`} style={{ borderBottom: isLast ? "none" : "1px solid #F5F6FA", background: banner.bg, borderLeft:`3px solid ${banner.color}` }}>
                              <div style={{ display:"flex", gap:14, padding:"14px 18px 14px 15px", alignItems:"flex-start" }}>
                                <div style={{ width:34, height:34, borderRadius:10, background:banner.color, display:"flex", alignItems:"center", justifyContent:"center", flexShrink:0, boxShadow:`0 2px 8px ${banner.color}40` }}>
                                  <span style={{ fontSize:16 }}>{banner.emoji}</span>
                                </div>
                                <div style={{ flex:1, minWidth:0 }}>
                                  <div style={{ display:"flex", alignItems:"center", gap:8, marginBottom:3, flexWrap:"wrap" }}>
                                    <span style={{ fontSize:13, fontWeight:900, color:banner.color }}>{banner.title}</span>
                                    <span style={{ fontSize:10, fontWeight:700, color:banner.color, background:`${banner.color}1A`, padding:"2px 8px", borderRadius:99 }}>Approved</span>
                                  </div>
                                  {leave.reason && <p style={{ fontSize:11, color:"#6B7280", margin:"0 0 3px", fontWeight:600 }}>{leave.reason}</p>}
                                  <div style={{ display:"flex", alignItems:"center", gap:12, marginTop:4, flexWrap:"wrap" }}>
                                    {dur && dur > 0 && (
                                      <span style={{ fontSize:10, fontWeight:700, color:"#374151", display:"flex", alignItems:"center", gap:3 }}>
                                        <Clock size={9} style={{ color:"#9CA3AF" }}/> {fmtH(dur)}
                                      </span>
                                    )}
                                    <span style={{ fontSize:10, color:"#9CA3AF" }}>{fmt12(item.entry.start_time)} – {fmt12(item.entry.end_time)}</span>
                                  </div>
                                </div>
                              </div>
                            </div>
                          )
                        }
                        if (item.type === 'collab') {
                          const { entry: pe, submitter, puId } = item
                          const cfg = TASK_CFG[pe.task_type as keyof typeof TASK_CFG] ?? TASK_CFG.other
                          const { Icon } = cfg
                          const displayTitle = pe.title || cfg.label
                          const displayClient = (pe.is_multi_client && pe.client_names && pe.client_names.length > 0) ? pe.client_names.join(" · ") : pe.client_name || ""
                          const tH = pe.task_type === "shoot" ? (pe._travel_hours ?? 0) : 0
                          const entryConf = collabConfirms.find(c => c.daily_update_id === puId && (c.status === "confirmed" || c.status === "edited_confirmed") && (pe.id ? c.entry_id === pe.id : true))
                          const showStart = entryConf?.confirmed_start_time ?? pe.start_time
                          const showEnd   = entryConf?.confirmed_end_time   ?? pe.end_time
                          const dur = entryConf?.confirmed_hours ?? (calcDurationFromTimes(showStart, showEnd) ?? (pe.duration_hours ?? 0))
                          const isEditingConf = entryConf && collabEditId === entryConf.id
                          const loading = entryConf ? collabLoading === entryConf.id : false
                          return (
                            <div key={`cl-${puId}-${pe.id ?? itemIdx}`} style={{ borderBottom: isLast ? "none" : "1px solid #F5F6FA", background: "rgba(99,102,241,0.025)" }}>
                              <div style={{ display: "flex", gap: 10, padding: "10px 18px", alignItems: "flex-start" }}>
                                <div style={{ width: 30, height: 30, borderRadius: 8, background: cfg.bg, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0, marginTop: 2 }}>
                                  <Icon size={13} style={{ color: cfg.color }}/>
                                </div>
                                <div style={{ flex: 1, minWidth: 0 }}>
                                  <div style={{ display: "flex", alignItems: "center", gap: 5, marginBottom: 4 }}>
                                    <span style={{ fontSize: 9, fontWeight: 800, color: "#6366F1", background: "rgba(99,102,241,0.1)", padding: "1px 6px", borderRadius: 99 }}>👥 {submitter?.name ?? "Teammate"}</span>
                                  </div>
                                  <div style={{ display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap", marginBottom: 2 }}>
                                    <span style={{ fontSize: 12, fontWeight: 800, color: "#111111" }}>{displayTitle}</span>
                                    <span style={{ fontSize: 9, fontWeight: 700, color: cfg.color, background: cfg.bg, padding: "1px 6px", borderRadius: 99 }}>{cfg.label}</span>
                                    {entryConf?.status === "edited_confirmed" && <span style={{ fontSize: 9, fontWeight: 700, color: "#10B981", background: "rgba(16,185,129,0.1)", padding: "1px 6px", borderRadius: 99 }}>✓ Your time</span>}
                                    {entryConf?.status === "confirmed" && <span style={{ fontSize: 9, fontWeight: 700, color: "#10B981", background: "rgba(16,185,129,0.1)", padding: "1px 6px", borderRadius: 99 }}>✓ Confirmed</span>}
                                  </div>
                                  {displayClient && <p style={{ fontSize: 10, color: "#6B7280", margin: "0 0 2px", fontWeight: 600 }}>{displayClient}</p>}
                                  <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
                                    {dur + tH > 0 && <span style={{ fontSize: 10, fontWeight: 700, color: "#374151", display: "flex", alignItems: "center", gap: 3 }}><Clock size={9} style={{ color: "#9CA3AF" }}/>{fmtH(dur + tH)}</span>}
                                    {showStart && showEnd && <span style={{ fontSize: 10, color: "#9CA3AF" }}>{fmt12(showStart)} – {fmt12(showEnd)}</span>}
                                    {tH > 0 && <span style={{ fontSize: 10, color: "#F59E0B", fontWeight: 700 }}>🚗 {fmtTravel(tH)}</span>}
                                  </div>
                                </div>
                                {entryConf && (
                                  <button title="Edit your collaboration time"
                                    onClick={() => { if (isEditingConf) { setCollabEditId(null) } else { setCollabEditId(entryConf.id); setCollabEditStart(entryConf.confirmed_start_time ?? entryConf.original_start_time ?? ""); setCollabEditEnd(entryConf.confirmed_end_time ?? entryConf.original_end_time ?? "") } }}
                                    style={{ width: 26, height: 26, borderRadius: 7, background: isEditingConf ? "rgba(99,102,241,0.2)" : "rgba(99,102,241,0.1)", border: "1px solid rgba(99,102,241,0.3)", display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer", flexShrink: 0 }}>
                                    <Pencil size={11} style={{ color: "#6366F1" }}/>
                                  </button>
                                )}
                              </div>
                              {isEditingConf && entryConf && (
                                <div style={{ margin: "0 18px 12px", padding: "12px", borderRadius: 10, background: "rgba(99,102,241,0.06)", border: "1.5px solid rgba(99,102,241,0.2)" }}>
                                  <p style={{ fontSize: 11, fontWeight: 700, color: "#6366F1", margin: "0 0 8px" }}>Edit Your Collaboration Time</p>
                                  <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, marginBottom: 10 }}>
                                    <div><label style={{ fontSize: 10, fontWeight: 600, color: "#6B7280", display: "block", marginBottom: 3 }}>Your Start Time</label><input type="time" value={collabEditStart} onChange={e => setCollabEditStart(e.target.value)} style={{ width: "100%", padding: "7px 10px", borderRadius: 8, border: "1px solid #E5E7EB", fontSize: 12, color: "#111111", outline: "none", background: "#fff", boxSizing: "border-box" }} /></div>
                                    <div><label style={{ fontSize: 10, fontWeight: 600, color: "#6B7280", display: "block", marginBottom: 3 }}>Your End Time</label><input type="time" value={collabEditEnd} onChange={e => setCollabEditEnd(e.target.value)} style={{ width: "100%", padding: "7px 10px", borderRadius: 8, border: "1px solid #E5E7EB", fontSize: 12, color: "#111111", outline: "none", background: "#fff", boxSizing: "border-box" }} /></div>
                                  </div>
                                  <div style={{ display: "flex", gap: 8 }}>
                                    <button onClick={() => setCollabEditId(null)} style={{ flex: 1, padding: "8px", borderRadius: 8, background: "#F3F4F6", color: "#6B7280", fontSize: 12, fontWeight: 600, border: "none", cursor: "pointer" }}>Cancel</button>
                                    <button disabled={loading} onClick={async () => { setCollabLoading(entryConf.id); const r = await editCollaborationTime(entryConf.id, collabEditStart, collabEditEnd); if (r.success) setCollabConfirms(prev => prev.map(c => c.id === entryConf.id ? { ...c, status: 'edited_confirmed' as const, confirmed_start_time: collabEditStart, confirmed_end_time: collabEditEnd } : c)); setCollabLoading(null); setCollabEditId(null) }}
                                      style={{ flex: 1, padding: "8px", borderRadius: 8, background: "#6366F1", color: "#fff", fontSize: 12, fontWeight: 700, border: "none", cursor: loading ? "not-allowed" : "pointer", opacity: loading ? 0.6 : 1 }}>
                                      {loading ? "Saving…" : "Save My Time"}
                                    </button>
                                  </div>
                                </div>
                              )}
                            </div>
                          )
                        }
                        const e = item.entry
                        const ei = item.origIdx
                        const cfg = (e.task_type === "edit" && !isMedia)
                          ? { Icon: TASK_CFG.edit.Icon, color:"#0D9488", bg:"rgba(13,148,136,0.1)", label:"Editing" }
                          : (TASK_CFG[e.task_type] ?? TASK_CFG.other)
                        const { Icon } = cfg
                        const eKey = `${u.id}:${ei}`
                        const isEditingEntry = editingKey === eKey
                        return (
                          <div key={`own-${ei}`} style={{ borderBottom: isLast ? "none" : "1px solid #F5F6FA" }}>
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
                                      {e.is_rework && <span style={{ fontSize:10, fontWeight:700, color:"#92400E", background:"rgba(245,158,11,0.12)", padding:"2px 8px", borderRadius:99, border:"1px solid rgba(245,158,11,0.3)" }}>Revision</span>}
                                    </div>
                                    {e.is_rework && e.linked_to_title && (
                                      <p style={{ fontSize:10, color:"#B45309", margin:"0 0 3px", fontWeight:600 }}>↩ of: {e.linked_to_client} – {e.linked_to_title}</p>
                                    )}
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
                                      const rawTxt = e.notes || e.description
                                      const txt = (rawTxt ?? "").replace(/^\[(completed|in_progress|not_started)\]\s*/, "").trim() || null
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
                                      <input type="date" min="2025-01-01" max={new Date().toISOString().split("T")[0]} value={editDraftDate} onChange={ev=>setEditDraftDate(clampDate(ev.target.value))} style={{ width:"100%", padding:"7px 10px", borderRadius:8, border: editDraftDate!==editOrigDate?"1.5px solid #6366F1":"1px solid #E5E7EB", fontSize:12, color:"#111111", outline:"none", background:"#fff", boxSizing:"border-box" }} />
                                      {editDraftDate!==editOrigDate && <p style={{ fontSize:10, color:"#6366F1", margin:"3px 0 0", fontWeight:600 }}>Moves to {new Date(editDraftDate+"T12:00:00").toLocaleDateString("en-US",{day:"numeric",month:"short",year:"numeric"})}</p>}
                                    </div>
                                    <div style={{ background:"#FFFBEB", borderRadius:12, border:"1.5px solid rgba(245,158,11,0.3)", padding:"10px 14px", display:"flex", alignItems:"center", gap:10, flexWrap:"wrap" }}>
                                      <HTimePicker value={editDraft.start_time??"13:00"} onChange={v=>setEditDraft(d=>({...d,start_time:v}))} />
                                      <span style={{ fontSize:11, color:"#9CA3AF", flexShrink:0 }}>to</span>
                                      <HTimePicker value={editDraft.end_time??"13:30"} onChange={v=>setEditDraft(d=>({...d,end_time:v}))} />
                                      {dur>0 && <span style={{ fontSize:10, fontWeight:700, padding:"3px 8px", borderRadius:99, background:"rgba(245,158,11,0.12)", color:"#D97706" }}>{fmtTravel(dur)}</span>}
                                      <select value={["Lunch Break","Tea","Short Break","Personal","Early Logoff","Late Login"].includes(editDraft.title||"") ? editDraft.title : "Lunch Break"} onChange={ev=>setEditDraft(d=>({...d,title:ev.target.value,_custom_label:""}))}
                                        style={{ fontSize:11, fontWeight:700, color:"#D97706", background:"#FEF3C7", border:"1.5px solid rgba(245,158,11,0.35)", borderRadius:8, padding:"4px 10px", cursor:"pointer", outline:"none" }}>
                                        <option value="Tea">☕ Tea</option>
                                        <option value="Lunch Break">🍱 Lunch Break</option>
                                        <option value="Personal">🏠 Personal</option>
                                        <option value="Short Break">🚶 Short Break</option>
                                        <option value="Early Logoff">🌙 Early Logoff</option>
                                        <option value="Late Login">⏰ Late Login</option>
                                      </select>
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
                                      <label style={HL}>Entry Date</label>
                                      <input type="date" min="2025-01-01" max={new Date().toISOString().split("T")[0]} value={editDraftDate} onChange={ev=>setEditDraftDate(clampDate(ev.target.value))} style={{ ...HF, colorScheme:"light" }} />
                                      {editDraftDate!==editOrigDate && <p style={{ fontSize:10, color:"#6366F1", margin:"3px 0 0", fontWeight:600 }}>Moves to {new Date(editDraftDate+"T12:00:00").toLocaleDateString("en-US",{day:"numeric",month:"short",year:"numeric"})}</p>}
                                    </div>
                                    <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:10 }}>
                                      <div>
                                        <label style={HL}>Client Name *</label>
                                        <ClientSelector
                                          label=""
                                          value={editDraft.client_name??""}
                                          clientOptions={activeClientsForEdit}
                                          pastClientOptions={pastClientsOnly}
                                          placeholder="Select client…"
                                          fieldStyle={HF}
                                          onValueChange={v=>setEditDraft(d=>({...d,client_name:v}))}
                                        />
                                      </div>
                                      <div>
                                        <label style={HL}>Shoot Name *</label>
                                        <input value={editDraft.title??""} onChange={ev=>setEditDraft(d=>({...d,title:ev.target.value}))} placeholder="e.g. Basketball Tournament Shoot" style={HF} />
                                      </div>
                                    </div>
                                    <div>
                                      <label style={HL}>Shooting Time</label>
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
                                      <button type="button" onClick={()=>setEditDraft(d=>({...d,video_uploaded:!d.video_uploaded}))} style={{ display:"flex", alignItems:"center", gap:6, padding:"9px 14px", borderRadius:10, border:"1.5px solid", cursor:"pointer", fontSize:11, fontWeight:700, background:editDraft.video_uploaded?"rgba(34,197,94,0.1)":"#F9FAFB", borderColor:editDraft.video_uploaded?"rgba(34,197,94,0.4)":"#EBEDF2", color:editDraft.video_uploaded?"#16A34A":"#9CA3AF" }}>{editDraft.video_uploaded?"Uploaded ✓":"Video Uploaded?"}</button>
                                    </div>
                                    {members.length>0 && (
                                      <div style={{ paddingTop:8, borderTop:"1px dashed #F0F1F5" }}>
                                        <p style={{ fontSize:10, fontWeight:700, color:"#9CA3AF", textTransform:"uppercase", letterSpacing:"0.07em", margin:"0 0 7px" }}>👥 Shot With</p>
                                        <div style={{ position:"relative" }}>
                                          <select value="" onChange={ev=>{const id=ev.target.value;if(id&&!(editDraft.participant_ids??[]).includes(id))setEditDraft(d=>({...d,participant_ids:[...(d.participant_ids??[]),id]}))}} style={{ width:"100%", fontSize:12, fontWeight:600, color:"#374151", background:"#fff", border:"1.5px solid #EBEDF2", borderRadius:10, padding:"8px 28px 8px 10px", cursor:"pointer", outline:"none", appearance:"none" }}>
                                            <option value="">Add teammate…</option>
                                            {members.filter(m=>!(editDraft.participant_ids??[]).includes(m.id)).map(m=><option key={m.id} value={m.id}>{m.name}</option>)}
                                          </select>
                                          <ChevronDown size={11} style={{ position:"absolute", right:10, top:"50%", transform:"translateY(-50%)", color:"#9CA3AF", pointerEvents:"none" }} />
                                        </div>
                                        {(editDraft.participant_ids??[]).length>0 && <div style={{ display:"flex", flexWrap:"wrap", gap:4, marginTop:6 }}>{(editDraft.participant_ids??[]).map(pid=>{const m=members.find(t=>t.id===pid);if(!m)return null;const ini=m.name.split(" ").map((n:string)=>n[0]).join("").slice(0,2).toUpperCase();return(<button key={pid} type="button" onClick={()=>setEditDraft(d=>({...d,participant_ids:(d.participant_ids??[]).filter(p=>p!==pid)}))} style={{ display:"flex", alignItems:"center", gap:4, padding:"3px 8px 3px 5px", borderRadius:99, background:"rgba(239,68,68,0.1)", border:"1.5px solid rgba(239,68,68,0.3)", cursor:"pointer" }}><div style={{ width:16, height:16, borderRadius:"50%", background:"#EF4444", display:"flex", alignItems:"center", justifyContent:"center", fontSize:7, fontWeight:900, color:"#fff" }}>{ini}</div><span style={{ fontSize:10, fontWeight:700, color:"#B91C1C" }}>{m.name.split(" ")[0]}</span><span style={{ fontSize:8, color:"#EF4444" }}>✕</span></button>)})}</div>}
                                      </div>
                                    )}
                                    <div style={{ display:"flex", gap:8, justifyContent:"flex-end", borderTop:"1px solid #F0F1F5", paddingTop:12, marginTop:4 }}>
                                      <button onClick={()=>{setEditingKey(null);setEditDraft({})}} style={{ padding:"7px 14px", borderRadius:8, background:"#F3F4F6", border:"none", fontSize:12, fontWeight:600, color:"#6B7280", cursor:"pointer" }}>Cancel</button>
                                      <button onClick={()=>saveEntry(u.id,entries,ei)} disabled={savingKey===eKey} style={{ display:"flex", alignItems:"center", gap:5, padding:"9px 20px", borderRadius:10, background:"#DE1A1A", border:"none", fontSize:12, fontWeight:700, color:"#fff", cursor:"pointer", opacity:savingKey===eKey?0.7:1, boxShadow:"0 4px 12px rgba(222,26,26,0.3)" }}><Check size={12}/> {savingKey===eKey?"Saving…":"Save Shoot"}</button>
                                    </div>
                                  </div>)
                                })()}

                                {/* ── EDITING ENTRY (media only) ── */}
                                {editDraft.task_type === "edit" && isMedia && (()=>{
                                  const HF: React.CSSProperties = { background:"#F9FAFB", border:"1.5px solid #EBEDF2", color:"#111827", borderRadius:10, padding:"9px 12px", fontSize:13, outline:"none", width:"100%", boxSizing:"border-box" as const }
                                  const HL: React.CSSProperties = { display:"block", fontSize:10, fontWeight:700, color:"#374151", textTransform:"uppercase" as const, letterSpacing:"0.1em", marginBottom:5 }
                                  const dur = calcDur(editDraft.start_time, editDraft.end_time)
                                  return (<div style={{ display:"flex", flexDirection:"column", gap:10 }}>
                                    <p style={{ fontSize:11, fontWeight:800, color:"#6366F1", margin:"0 0 2px", textTransform:"uppercase", letterSpacing:"0.1em" }}>✏️ Edit Editing Entry</p>
                                    {/* Revision toggle in edit modal */}
                                    <div style={{ display:"flex", flexDirection:"column", gap:6, padding:"7px 12px", borderRadius:10, background:editDraft.is_rework?"rgba(245,158,11,0.08)":"rgba(99,102,241,0.04)", border:editDraft.is_rework?"1px solid rgba(245,158,11,0.3)":"1px solid rgba(99,102,241,0.1)" }}>
                                      <button type="button" onClick={()=>setEditDraft(d=>({...d, is_rework:!d.is_rework, linked_to_title:null, linked_to_client:null, linked_to_date:null}))}
                                        style={{ padding:"4px 10px", borderRadius:8, border:"none", cursor:"pointer", fontSize:11, fontWeight:700, background:editDraft.is_rework?"rgba(245,158,11,0.2)":"rgba(99,102,241,0.12)", color:editDraft.is_rework?"#92400E":"#4F46E5", whiteSpace:"nowrap", alignSelf:"flex-start" }}>
                                        {editDraft.is_rework ? "✓ Revision" : "Revision of existing?"}
                                      </button>
                                      {editDraft.is_rework && (
                                        <div style={{ position:"relative" }}>
                                          <select
                                            value={editDraft.linked_to_title ? `${editDraft.linked_to_client||""}||${editDraft.linked_to_title}||${editDraft.linked_to_date||""}` : ""}
                                            onChange={ev=>{const val=ev.target.value;if(!val){setEditDraft(d=>({...d,linked_to_title:null,linked_to_client:null,linked_to_date:null}));return}const p=val.split("||");setEditDraft(d=>({...d,linked_to_client:p[0]||null,linked_to_title:p[1]||null,linked_to_date:p[2]||null}))}}
                                            style={{...HF,paddingRight:28,appearance:"none"}}>
                                            <option value="">— Pick original editing video —</option>
                                            {revisionOptionsByType.edits.map(o=><option key={o.key} value={o.key}>{o.label}</option>)}
                                            {editDraft.linked_to_title&&!revisionOptionsByType.edits.find(o=>o.title===editDraft.linked_to_title&&o.client===(editDraft.linked_to_client??""))&&(
                                              <option value={`${editDraft.linked_to_client||""}||${editDraft.linked_to_title}||${editDraft.linked_to_date||""}`}>{editDraft.linked_to_client?editDraft.linked_to_client+" – ":""}{editDraft.linked_to_title} ↩</option>
                                            )}
                                          </select>
                                          <ChevronDown size={11} style={{position:"absolute",right:10,top:"50%",transform:"translateY(-50%)",color:"#9CA3AF",pointerEvents:"none"}} />
                                        </div>
                                      )}
                                    </div>
                                    <div>
                                      <label style={HL}>Entry Date</label>
                                      <input type="date" min="2025-01-01" max={new Date().toISOString().split("T")[0]} value={editDraftDate} onChange={ev=>setEditDraftDate(clampDate(ev.target.value))} style={{ ...HF, colorScheme:"light" }} />
                                      {editDraftDate!==editOrigDate && <p style={{ fontSize:10, color:"#6366F1", margin:"3px 0 0", fontWeight:600 }}>Moves to {new Date(editDraftDate+"T12:00:00").toLocaleDateString("en-US",{day:"numeric",month:"short",year:"numeric"})}</p>}
                                    </div>
                                    <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:10 }}>
                                      <div><label style={HL}>Date Given <span style={{ color:"#EF4444" }}>*</span></label><input type="date" min="2025-01-01" max={new Date().toISOString().split("T")[0]} value={editDraft.date_given??""} onChange={ev=>setEditDraft(d=>({...d,date_given:clampDate(ev.target.value)}))} style={{ ...HF, colorScheme:"light", borderColor: !editDraft.date_given ? "#EF4444" : "#EBEDF2" }} /></div>
                                      <div><label style={HL}>Date Finished <span style={{ color:"#EF4444" }}>*</span></label><input type="date" min="2025-01-01" max={new Date().toISOString().split("T")[0]} value={editDraft.date_finished??""} onChange={ev=>setEditDraft(d=>({...d,date_finished:clampDate(ev.target.value)}))} style={{ ...HF, colorScheme:"light", borderColor: !editDraft.date_finished ? "#EF4444" : "#EBEDF2" }} /></div>
                                    </div>
                                    <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:10 }}>
                                      <div>
                                        <label style={HL}>Client Name *</label>
                                        <ClientSelector
                                          label=""
                                          value={editDraft.client_name??""}
                                          clientOptions={activeClientsForEdit}
                                          pastClientOptions={pastClientsOnly}
                                          placeholder="Select client…"
                                          fieldStyle={HF}
                                          onValueChange={v=>setEditDraft(d=>({...d,client_name:v}))}
                                        />
                                      </div>
                                      <div>
                                        <label style={HL}>Video Type</label>
                                        <div style={{ position:"relative" }}>
                                          <select value={editDraft.video_type??""} onChange={ev=>setEditDraft(d=>({...d,video_type:ev.target.value}))} style={{ ...HF, paddingRight:28, appearance:"none" }}>
                                            <option value="">Select type…</option>
                                            {["ADVERTISEMENT","ADVERTISEMENT WITH HOOKS","LONG FORMAT VIDEO","CINEMATIC","PROMOTION VIDEOS","INSTAGRAM REELS","YOUTUBE SHORTS","GREEN SCREEN EDITING","PERSONAL BRANDING"].map(t=><option key={t} value={t}>{t}</option>)}
                                            <option value="__other__">✏️ Other</option>
                                          </select>
                                          <ChevronDown size={11} style={{ position:"absolute", right:10, top:"50%", transform:"translateY(-50%)", color:"#9CA3AF", pointerEvents:"none" }} />
                                        </div>
                                      </div>
                                    </div>
                                    <div><label style={HL}>Video Name *</label><input value={editDraft.title??""} onChange={ev=>setEditDraft(d=>({...d,title:ev.target.value}))} placeholder="e.g. Evan Styles Makeover Reel" style={HF} /></div>
                                    <div style={{ display:"flex", flexWrap:"wrap", alignItems:"flex-start", gap:8 }}>
                                      <div className="w-full md:w-auto">
                                        <label style={HL}>Video Length</label>
                                        <VideoDurationPicker value={editDraft.video_duration??""} onChange={v=>setEditDraft(d=>({...d,video_duration:v}))} inputStyle={{ background:"#F9FAFB", border:"1.5px solid #EBEDF2", borderRadius:10, padding:"9px 10px", fontSize:13 }} />
                                      </div>
                                      <div className="flex justify-start md:justify-center" style={{ flex:1, gap:8, alignItems:"flex-start" }}>
                                        <div style={{ width:80, flexShrink:0 }}><label style={HL}>Revisions</label><input type="number" min="0" max="99" value={editDraft.revisions??0} onChange={ev=>setEditDraft(d=>({...d,revisions:parseInt(ev.target.value)||0}))} placeholder="0" style={HF} /></div>
                                        <div style={{ width:80, flexShrink:0 }}><label style={HL}>🪝 Hooks</label><input type="number" min="0" max="99" value={editDraft.hooks_completed??0} onChange={ev=>setEditDraft(d=>({...d,hooks_completed:Math.max(0,parseInt(ev.target.value)||0)}))} placeholder="0" style={HF} /></div>
                                      </div>
                                    </div>
                                    <div>
                                      <label style={HL}>✏️ Editing Time <span style={{ color:"#EF4444" }}>*</span></label>
                                      <div style={{ display:"flex", alignItems:"center", gap:8, flexWrap:"wrap" }}>
                                        <HTimePicker value={editDraft.start_time??"09:00"} onChange={v=>setEditDraft(d=>({...d,start_time:v}))} style={{ borderColor: !editDraft.start_time ? "#EF4444" : "#EBEDF2" }} />
                                        <span style={{ fontSize:11, color:"#9CA3AF", flexShrink:0 }}>to</span>
                                        <HTimePicker value={editDraft.end_time??"09:00"} onChange={v=>setEditDraft(d=>({...d,end_time:v}))} style={{ borderColor: !editDraft.end_time ? "#EF4444" : "#EBEDF2" }} />
                                        <div style={{ display:"inline-flex", alignItems:"center", gap:6, padding:"6px 10px", borderRadius:8, background:dur>0?"rgba(222,26,26,0.06)":"#F9FAFB", border:dur>0?"1.5px solid rgba(222,26,26,0.2)":"1.5px solid #EBEDF2" }}>
                                          <span style={{ fontSize:12, fontWeight:700, color:dur>0?"#DE1A1A":"#9CA3AF" }}>{dur>0?fmtTravel(dur):"—"}</span>
                                          <span style={{ fontSize:10, color:"#9CA3AF", fontWeight:500 }}>auto</span>
                                        </div>
                                      </div>
                                    </div>
                                    <div><label style={HL}>Notes</label><textarea rows={2} value={editDraft.notes??""} onChange={ev=>setEditDraft(d=>({...d,notes:ev.target.value}))} placeholder="Software used, challenges…" style={{ ...HF, resize:"none" }} /></div>
                                    <div><label style={HL}>Drive / Video Link</label><input value={editDraft.video_link??""} onChange={ev=>setEditDraft(d=>({...d,video_link:ev.target.value}))} placeholder="https://drive.google.com/…" style={HF} /></div>
                                    <div>
                                      <button type="button" onClick={()=>setEditDraft(d=>({...d,drive_updated:!d.drive_updated}))} style={{ display:"flex", alignItems:"center", gap:6, padding:"9px 14px", borderRadius:10, border:"1.5px solid", cursor:"pointer", fontSize:11, fontWeight:700, background:editDraft.drive_updated?"rgba(34,197,94,0.1)":"#F9FAFB", borderColor:editDraft.drive_updated?"rgba(34,197,94,0.4)":"#EBEDF2", color:editDraft.drive_updated?"#16A34A":"#9CA3AF" }}>{editDraft.drive_updated?"Drive Updated ✓":"Drive Updated?"}</button>
                                    </div>
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
                                      <input type="date" min="2025-01-01" max={new Date().toISOString().split("T")[0]} value={editDraftDate} onChange={ev=>setEditDraftDate(clampDate(ev.target.value))} style={{ width:"100%", padding:"7px 10px", borderRadius:8, border:editDraftDate!==editOrigDate?"1.5px solid #6366F1":"1px solid #E5E7EB", fontSize:12, color:"#111111", outline:"none", background:"#fff", boxSizing:"border-box" }} />
                                      {editDraftDate!==editOrigDate && <p style={{ fontSize:10, color:"#6366F1", margin:"3px 0 0", fontWeight:600 }}>Moves to {new Date(editDraftDate+"T12:00:00").toLocaleDateString("en-US",{day:"numeric",month:"short",year:"numeric"})}</p>}
                                    </div>
                                    {editDraft.task_type==="learning" ? (
                                      <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:8 }}>
                                        <div>
                                          <label style={{ fontSize:10, fontWeight:600, color:"#6B7280", display:"block", marginBottom:3 }}>For Client *</label>
                                          <div style={{ position:"relative" }}>
                                            <select value={editDraft.client_name??""} onChange={ev=>{const v=ev.target.value;const topic=parseLearningTitle(editDraft.title??"").topic;setEditDraft(d=>({...d,client_name:v,title:v?`[${v}] ${topic}`:topic}))}} style={{ width:"100%", padding:"7px 24px 7px 10px", borderRadius:8, border:"1px solid #E5E7EB", fontSize:12, color:"#111111", outline:"none", background:"#fff", boxSizing:"border-box", appearance:"none" }}>
                                              <option value="">Select client…</option>
                                              <option value="GROFAST DIGITAL">GROFAST DIGITAL</option>
                                              <option value="GROFAST AI">GROFAST AI</option>
                                              <option value="KARTHICK BRANDS">KARTHICK BRANDS</option>
                                            </select>
                                            <ChevronDown size={11} style={{ position:"absolute", right:8, top:"50%", transform:"translateY(-50%)", color:"#9CA3AF", pointerEvents:"none" }} />
                                          </div>
                                        </div>
                                        <div>
                                          <label style={{ fontSize:10, fontWeight:600, color:"#6B7280", display:"block", marginBottom:3 }}>Topic / Course *</label>
                                          <input value={parseLearningTitle(editDraft.title??"").topic} onChange={ev=>{const topic=ev.target.value;const client=editDraft.client_name??"";setEditDraft(d=>({...d,title:client?`[${client}] ${topic}`:topic}))}} placeholder="What did you learn?" style={{ width:"100%", padding:"7px 10px", borderRadius:8, border:"1px solid #E5E7EB", fontSize:12, color:"#111111", outline:"none", background:"#fff", boxSizing:"border-box" }} />
                                        </div>
                                      </div>
                                    ) : (
                                      <div className="grid md:grid-cols-2" style={{ gap:8 }}>
                                        <div>
                                          <label style={{ fontSize:10, fontWeight:600, color:"#6B7280", display:"block", marginBottom:3 }}>
                                            Client Name {(editDraft.client_names??[]).length > 1 && <span style={{ color:"#de1a1a", fontWeight:700 }}>· Split ({(editDraft.client_names??[]).length})</span>}
                                          </label>
                                          <ClientSelector
                                            label=""
                                            value=""
                                            clientOptions={activeClientsForEdit}
                                            pastClientOptions={pastClientsOnly}
                                            excludeOptions={editDraft.client_names??[]}
                                            placeholder="Add client / project…"
                                            onValueChange={v=>{if(!v)return;const cur=editDraft.client_names??[];if(!cur.some(n=>n.toLowerCase()===v.toLowerCase())){const next=[...cur,v];setEditDraft(d=>({...d,client_names:next,client_name:next[0]||d.client_name,is_multi_client:next.length>1}))}}}
                                          />
                                          {(editDraft.client_names??[]).length>0 && (
                                            <div style={{ display:"flex", flexWrap:"wrap", gap:4, marginTop:6 }}>
                                              {(editDraft.client_names??[]).map(name=>(
                                                <button key={name} type="button" onClick={()=>{const next=(editDraft.client_names??[]).filter(n=>n.toLowerCase()!==name.toLowerCase());setEditDraft(d=>({...d,client_names:next,client_name:next[0]||"",is_multi_client:next.length>1}))}} style={{ display:"flex", alignItems:"center", gap:4, padding:"3px 8px", borderRadius:99, background:"rgba(222,26,26,0.08)", border:"1.5px solid rgba(222,26,26,0.25)", cursor:"pointer" }}>
                                                  <span style={{ fontSize:10, fontWeight:700, color:"#de1a1a" }}>{name}</span>
                                                  <span style={{ fontSize:8, color:"#de1a1a" }}>✕</span>
                                                </button>
                                              ))}
                                            </div>
                                          )}
                                        </div>
                                        <div>
                                          <label style={{ fontSize:10, fontWeight:600, color:"#6B7280", display:"block", marginBottom:3 }}>Title</label>
                                          <input value={editDraft.title??""} onChange={ev=>setEditDraft(d=>({...d,title:ev.target.value}))} style={{ width:"100%", padding:"7px 10px", borderRadius:8, border:"1px solid #E5E7EB", fontSize:12, color:"#111111", outline:"none", background:"#fff", boxSizing:"border-box" }} />
                                        </div>
                                      </div>
                                    )}
                                    {editDraft.task_type==="learning" ? (
                                      <div>
                                        <label style={{ fontSize:10, fontWeight:600, color:"#6B7280", display:"block", marginBottom:3 }}>📘 Learning Time</label>
                                        <div style={{ display:"flex", alignItems:"center", gap:8, flexWrap:"wrap" }}>
                                          <HTimePicker value={editDraft.start_time??"09:00"} onChange={v=>setEditDraft(d=>({...d,start_time:v}))} />
                                          <span style={{ fontSize:11, color:"#9CA3AF", flexShrink:0 }}>to</span>
                                          <HTimePicker value={editDraft.end_time??"09:00"} onChange={v=>setEditDraft(d=>({...d,end_time:v}))} />
                                          {(()=>{const h=calcDur(editDraft.start_time,editDraft.end_time);return <span style={{ fontSize:10, fontWeight:700, padding:"3px 8px", borderRadius:99, background:h>0?"rgba(245,158,11,0.1)":"#F9FAFB", color:h>0?"#B45309":"#9CA3AF" }}>{h>0?fmtH(h):"—"}</span>})()}
                                        </div>
                                      </div>
                                    ) : editDraft.task_type==="other" ? (
                                      <div>
                                        <label style={{ fontSize:10, fontWeight:600, color:"#6B7280", display:"block", marginBottom:3 }}>⏱ Working Time</label>
                                        <div style={{ display:"flex", alignItems:"center", gap:8, flexWrap:"wrap" }}>
                                          <HTimePicker value={editDraft.start_time??"09:00"} onChange={v=>setEditDraft(d=>({...d,start_time:v}))} />
                                          <span style={{ fontSize:11, color:"#9CA3AF", flexShrink:0 }}>to</span>
                                          <HTimePicker value={editDraft.end_time??"09:00"} onChange={v=>setEditDraft(d=>({...d,end_time:v}))} />
                                          {(()=>{const h=calcDur(editDraft.start_time,editDraft.end_time);return h>0?(<div style={{ display:"inline-flex", alignItems:"center", gap:6, padding:"6px 10px", borderRadius:8, background:"rgba(99,102,241,0.08)", border:"1.5px solid rgba(99,102,241,0.2)" }}><span style={{ fontSize:12, fontWeight:700, color:"#6366F1" }}>{fmtH(h)}</span><span style={{ fontSize:10, color:"#9CA3AF", fontWeight:500 }}>auto</span></div>):null})()}
                                        </div>
                                      </div>
                                    ) : null}
                                    {editDraft.task_type==="learning" ? (
                                      <div className={`grid ${members.length > 0 ? "md:grid-cols-[7fr_3fr]" : ""}`} style={{ gap:10, alignItems:"start" }}>
                                        <div>
                                          <label style={{ fontSize:10, fontWeight:600, color:"#6B7280", display:"block", marginBottom:3 }}>Notes</label>
                                          <textarea rows={2} value={editDraft.notes??""} onChange={ev=>setEditDraft(d=>({...d,notes:ev.target.value}))} style={{ width:"100%", padding:"7px 10px", borderRadius:8, border:"1px solid #E5E7EB", fontSize:12, color:"#111111", outline:"none", background:"#fff", resize:"none", boxSizing:"border-box" }} />
                                        </div>
                                        {members.length>0 && (
                                          <div>
                                            <label style={{ fontSize:10, fontWeight:600, color:"#6B7280", display:"block", marginBottom:3 }}>👥 Learned With</label>
                                            <div style={{ position:"relative" }}>
                                              <select value="" onChange={ev=>{const id=ev.target.value;if(id&&!(editDraft.participant_ids??[]).includes(id))setEditDraft(d=>({...d,participant_ids:[...(d.participant_ids??[]),id]}))}} style={{ width:"100%", fontSize:12, fontWeight:600, color:"#374151", background:"#fff", border:"1px solid #E5E7EB", borderRadius:8, padding:"7px 24px 7px 10px", cursor:"pointer", outline:"none", appearance:"none" }}>
                                                <option value="">Add teammate…</option>
                                                {members.filter(m=>!(editDraft.participant_ids??[]).includes(m.id)).map(m=>(<option key={m.id} value={m.id}>{m.name}</option>))}
                                              </select>
                                              <ChevronDown size={11} style={{ position:"absolute", right:8, top:"50%", transform:"translateY(-50%)", color:"#9CA3AF", pointerEvents:"none" }} />
                                            </div>
                                            {(editDraft.participant_ids??[]).length>0 && (
                                              <div style={{ display:"flex", flexWrap:"wrap", gap:4, marginTop:6 }}>
                                                {(editDraft.participant_ids??[]).map(pid=>{const m=members.find(t=>t.id===pid);if(!m)return null;const ini=m.name.split(" ").map((n:string)=>n[0]).join("").slice(0,2).toUpperCase();return(<button key={pid} type="button" onClick={()=>setEditDraft(d=>({...d,participant_ids:(d.participant_ids??[]).filter(p=>p!==pid)}))} style={{ display:"flex", alignItems:"center", gap:4, padding:"3px 8px 3px 5px", borderRadius:99, background:"rgba(16,185,129,0.1)", border:"1.5px solid rgba(16,185,129,0.3)", cursor:"pointer" }}><div style={{ width:16, height:16, borderRadius:"50%", background:"#10B981", display:"flex", alignItems:"center", justifyContent:"center", fontSize:7, fontWeight:900, color:"#fff" }}>{ini}</div><span style={{ fontSize:10, fontWeight:700, color:"#065F46" }}>{m.name.split(" ")[0]}</span><span style={{ fontSize:8, color:"#10B981" }}>✕</span></button>)})}
                                              </div>
                                            )}
                                          </div>
                                        )}
                                      </div>
                                    ) : editDraft.task_type!=="other" ? (
                                      <div><label style={{ fontSize:10, fontWeight:600, color:"#6B7280", display:"block", marginBottom:3 }}>Notes</label><textarea rows={2} value={editDraft.notes??""} onChange={ev=>setEditDraft(d=>({...d,notes:ev.target.value}))} style={{ width:"100%", padding:"7px 10px", borderRadius:8, border:"1px solid #E5E7EB", fontSize:12, color:"#111111", outline:"none", background:"#fff", resize:"none", boxSizing:"border-box" }} /></div>
                                    ) : null}
                                    {editDraft.task_type==="other" && members.length>0 && (
                                      <div className="w-full md:w-1/2">
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

                                {/* ── VOICEOVER ── */}
                                {editDraft.task_type === "voiceover" && (()=>{
                                  const HF: React.CSSProperties = { background:"#F9FAFB", border:"1.5px solid #EBEDF2", color:"#111827", borderRadius:10, padding:"9px 12px", fontSize:13, outline:"none", width:"100%", boxSizing:"border-box" as const }
                                  const HL: React.CSSProperties = { display:"block", fontSize:10, fontWeight:700, color:"#374151", textTransform:"uppercase" as const, letterSpacing:"0.1em", marginBottom:5 }
                                  const dur = calcDur(editDraft.start_time, editDraft.end_time)
                                  return (<div style={{ display:"flex", flexDirection:"column", gap:10 }}>
                                    <p style={{ fontSize:11, fontWeight:800, color:"#8B5CF6", margin:"0 0 2px", textTransform:"uppercase", letterSpacing:"0.1em" }}>✏️ Edit Voiceover</p>
                                    {/* Revision toggle */}
                                    <div style={{ display:"flex", flexDirection:"column", gap:6, padding:"7px 12px", borderRadius:10, background:editDraft.is_rework?"rgba(245,158,11,0.08)":"rgba(139,92,246,0.04)", border:editDraft.is_rework?"1px solid rgba(245,158,11,0.3)":"1px solid rgba(139,92,246,0.1)" }}>
                                      <button type="button" onClick={()=>setEditDraft(d=>({...d, is_rework:!d.is_rework, linked_to_title:null, linked_to_client:null, linked_to_date:null}))}
                                        style={{ padding:"4px 10px", borderRadius:8, border:"none", cursor:"pointer", fontSize:11, fontWeight:700, background:editDraft.is_rework?"rgba(245,158,11,0.2)":"rgba(139,92,246,0.12)", color:editDraft.is_rework?"#92400E":"#7C3AED", whiteSpace:"nowrap", alignSelf:"flex-start" }}>
                                        {editDraft.is_rework ? "✓ Revision" : "Revision of existing?"}
                                      </button>
                                      {editDraft.is_rework && (
                                        <div style={{ position:"relative" }}>
                                          <select
                                            value={editDraft.linked_to_title ? `${editDraft.linked_to_client||""}||${editDraft.linked_to_title}||${editDraft.linked_to_date||""}` : ""}
                                            onChange={ev=>{const val=ev.target.value;if(!val){setEditDraft(d=>({...d,linked_to_title:null,linked_to_client:null,linked_to_date:null}));return}const p=val.split("||");setEditDraft(d=>({...d,linked_to_client:p[0]||null,linked_to_title:p[1]||null,linked_to_date:p[2]||null}))}}
                                            style={{...HF,paddingRight:28,appearance:"none"}}>
                                            <option value="">— Pick original voiceover —</option>
                                            {revisionOptionsByType.voiceovers.map(o=><option key={o.key} value={o.key}>{o.label}</option>)}
                                            {editDraft.linked_to_title&&!revisionOptionsByType.voiceovers.find(o=>o.title===editDraft.linked_to_title&&o.client===(editDraft.linked_to_client??""))&&(
                                              <option value={`${editDraft.linked_to_client||""}||${editDraft.linked_to_title}||${editDraft.linked_to_date||""}`}>{editDraft.linked_to_client?editDraft.linked_to_client+" – ":""}{editDraft.linked_to_title} ↩</option>
                                            )}
                                          </select>
                                          <ChevronDown size={11} style={{position:"absolute",right:10,top:"50%",transform:"translateY(-50%)",color:"#9CA3AF",pointerEvents:"none"}} />
                                        </div>
                                      )}
                                    </div>
                                    <div>
                                      <label style={HL}>Entry Date</label>
                                      <input type="date" min="2025-01-01" max={new Date().toISOString().split("T")[0]} value={editDraftDate} onChange={ev=>setEditDraftDate(clampDate(ev.target.value))} style={{ ...HF, colorScheme:"light" }} />
                                      {editDraftDate!==editOrigDate && <p style={{ fontSize:10, color:"#6366F1", margin:"3px 0 0", fontWeight:600 }}>Moves to {new Date(editDraftDate+"T12:00:00").toLocaleDateString("en-US",{day:"numeric",month:"short",year:"numeric"})}</p>}
                                    </div>
                                    <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:10 }}>
                                      <div>
                                        <label style={HL}>Client Name *</label>
                                        <ClientSelector
                                          label=""
                                          value={editDraft.client_name??""}
                                          clientOptions={activeClientsForEdit}
                                          pastClientOptions={pastClientsOnly}
                                          placeholder="Select client…"
                                          fieldStyle={HF}
                                          onValueChange={v=>setEditDraft(d=>({...d,client_name:v}))}
                                        />
                                      </div>
                                      <div><label style={HL}>Script Name</label><input value={editDraft.title??""} onChange={ev=>setEditDraft(d=>({...d,title:ev.target.value}))} placeholder="Script or project name" style={HF} /></div>
                                    </div>
                                    <div>
                                      <label style={HL}>🎙 Voiceover Time</label>
                                      <div style={{ display:"flex", alignItems:"center", gap:8, flexWrap:"wrap" }}>
                                        <HTimePicker value={editDraft.start_time??"09:00"} onChange={v=>setEditDraft(d=>({...d,start_time:v}))} />
                                        <span style={{ fontSize:11, color:"#9CA3AF", flexShrink:0 }}>to</span>
                                        <HTimePicker value={editDraft.end_time??"09:00"} onChange={v=>setEditDraft(d=>({...d,end_time:v}))} />
                                        {dur>0 && <span style={{ fontSize:10, fontWeight:700, padding:"3px 8px", borderRadius:99, background:"rgba(139,92,246,0.1)", color:"#8B5CF6" }}>{fmtTravel(dur)}</span>}
                                      </div>
                                    </div>
                                    <div><label style={HL}>Drive / Audio Link</label><input value={editDraft.video_link??""} onChange={ev=>setEditDraft(d=>({...d,video_link:ev.target.value}))} placeholder="https://drive.google.com/…" style={HF} /></div>
                                    <div><label style={HL}>Notes</label><textarea rows={2} value={editDraft.notes??""} onChange={ev=>setEditDraft(d=>({...d,notes:ev.target.value}))} placeholder="Script details, revisions…" style={{ ...HF, resize:"none" }} /></div>
                                    <div style={{ display:"flex", gap:8, justifyContent:"flex-end", borderTop:"1px solid #F0F1F5", paddingTop:12, marginTop:4 }}>
                                      <button onClick={()=>{setEditingKey(null);setEditDraft({})}} style={{ padding:"7px 14px", borderRadius:8, background:"#F3F4F6", border:"none", fontSize:12, fontWeight:600, color:"#6B7280", cursor:"pointer" }}>Cancel</button>
                                      <button onClick={()=>saveEntry(u.id,entries,ei)} disabled={savingKey===eKey} style={{ display:"flex", alignItems:"center", gap:5, padding:"9px 20px", borderRadius:10, background:"#8B5CF6", border:"none", fontSize:12, fontWeight:700, color:"#fff", cursor:"pointer", opacity:savingKey===eKey?0.7:1, boxShadow:"0 4px 12px rgba(139,92,246,0.3)" }}><Check size={12}/> {savingKey===eKey?"Saving…":"Save Voiceover"}</button>
                                    </div>
                                  </div>)
                                })()}

                                {/* ── POSTER ── */}
                                {editDraft.task_type === "poster" && (()=>{
                                  const HF: React.CSSProperties = { background:"#F9FAFB", border:"1.5px solid #EBEDF2", color:"#111827", borderRadius:10, padding:"9px 12px", fontSize:13, outline:"none", width:"100%", boxSizing:"border-box" as const }
                                  const HL: React.CSSProperties = { display:"block", fontSize:10, fontWeight:700, color:"#374151", textTransform:"uppercase" as const, letterSpacing:"0.1em", marginBottom:5 }
                                  const dur = calcDur(editDraft.start_time, editDraft.end_time)
                                  return (<div style={{ display:"flex", flexDirection:"column", gap:10 }}>
                                    <p style={{ fontSize:11, fontWeight:800, color:"#EC4899", margin:"0 0 2px", textTransform:"uppercase", letterSpacing:"0.1em" }}>✏️ Edit Poster</p>
                                    {/* Revision toggle */}
                                    <div style={{ display:"flex", flexDirection:"column", gap:6, padding:"7px 12px", borderRadius:10, background:editDraft.is_rework?"rgba(245,158,11,0.08)":"rgba(236,72,153,0.04)", border:editDraft.is_rework?"1px solid rgba(245,158,11,0.3)":"1px solid rgba(236,72,153,0.1)" }}>
                                      <button type="button" onClick={()=>setEditDraft(d=>({...d, is_rework:!d.is_rework, linked_to_title:null, linked_to_client:null, linked_to_date:null}))}
                                        style={{ padding:"4px 10px", borderRadius:8, border:"none", cursor:"pointer", fontSize:11, fontWeight:700, background:editDraft.is_rework?"rgba(245,158,11,0.2)":"rgba(236,72,153,0.12)", color:editDraft.is_rework?"#92400E":"#BE185D", whiteSpace:"nowrap", alignSelf:"flex-start" }}>
                                        {editDraft.is_rework ? "✓ Revision" : "Revision of existing?"}
                                      </button>
                                      {editDraft.is_rework && (
                                        <div style={{ position:"relative" }}>
                                          <select
                                            value={editDraft.linked_to_title ? `${editDraft.linked_to_client||""}||${editDraft.linked_to_title}||${editDraft.linked_to_date||""}` : ""}
                                            onChange={ev=>{const val=ev.target.value;if(!val){setEditDraft(d=>({...d,linked_to_title:null,linked_to_client:null,linked_to_date:null}));return}const p=val.split("||");setEditDraft(d=>({...d,linked_to_client:p[0]||null,linked_to_title:p[1]||null,linked_to_date:p[2]||null}))}}
                                            style={{...HF,paddingRight:28,appearance:"none"}}>
                                            <option value="">— Pick original poster —</option>
                                            {revisionOptionsByType.posters.map(o=><option key={o.key} value={o.key}>{o.label}</option>)}
                                            {editDraft.linked_to_title&&!revisionOptionsByType.posters.find(o=>o.title===editDraft.linked_to_title&&o.client===(editDraft.linked_to_client??""))&&(
                                              <option value={`${editDraft.linked_to_client||""}||${editDraft.linked_to_title}||${editDraft.linked_to_date||""}`}>{editDraft.linked_to_client?editDraft.linked_to_client+" – ":""}{editDraft.linked_to_title} ↩</option>
                                            )}
                                          </select>
                                          <ChevronDown size={11} style={{position:"absolute",right:10,top:"50%",transform:"translateY(-50%)",color:"#9CA3AF",pointerEvents:"none"}} />
                                        </div>
                                      )}
                                    </div>
                                    <div>
                                      <label style={HL}>Entry Date</label>
                                      <input type="date" min="2025-01-01" max={new Date().toISOString().split("T")[0]} value={editDraftDate} onChange={ev=>setEditDraftDate(clampDate(ev.target.value))} style={{ ...HF, colorScheme:"light" }} />
                                      {editDraftDate!==editOrigDate && <p style={{ fontSize:10, color:"#6366F1", margin:"3px 0 0", fontWeight:600 }}>Moves to {new Date(editDraftDate+"T12:00:00").toLocaleDateString("en-US",{day:"numeric",month:"short",year:"numeric"})}</p>}
                                    </div>
                                    <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:10 }}>
                                      <div>
                                        <label style={HL}>Client Name *</label>
                                        <ClientSelector
                                          label=""
                                          value={editDraft.client_name??""}
                                          clientOptions={activeClientsForEdit}
                                          pastClientOptions={pastClientsOnly}
                                          placeholder="Select client…"
                                          fieldStyle={HF}
                                          onValueChange={v=>setEditDraft(d=>({...d,client_name:v}))}
                                        />
                                      </div>
                                      <div><label style={HL}>Poster Name</label><input value={editDraft.title??""} onChange={ev=>setEditDraft(d=>({...d,title:ev.target.value}))} placeholder="Poster or design name" style={HF} /></div>
                                    </div>
                                    <div>
                                      <label style={HL}>🎨 Design Time</label>
                                      <div style={{ display:"flex", alignItems:"center", gap:8, flexWrap:"wrap" }}>
                                        <HTimePicker value={editDraft.start_time??"09:00"} onChange={v=>setEditDraft(d=>({...d,start_time:v}))} />
                                        <span style={{ fontSize:11, color:"#9CA3AF", flexShrink:0 }}>to</span>
                                        <HTimePicker value={editDraft.end_time??"09:00"} onChange={v=>setEditDraft(d=>({...d,end_time:v}))} />
                                        {dur>0 && <span style={{ fontSize:10, fontWeight:700, padding:"3px 8px", borderRadius:99, background:"rgba(236,72,153,0.1)", color:"#EC4899" }}>{fmtTravel(dur)}</span>}
                                      </div>
                                    </div>
                                    <div><label style={HL}>Drive / File Link</label><input value={editDraft.video_link??""} onChange={ev=>setEditDraft(d=>({...d,video_link:ev.target.value}))} placeholder="https://drive.google.com/…" style={HF} /></div>
                                    <div><label style={HL}>Notes</label><textarea rows={2} value={editDraft.notes??""} onChange={ev=>setEditDraft(d=>({...d,notes:ev.target.value}))} placeholder="Design details, revisions…" style={{ ...HF, resize:"none" }} /></div>
                                    {members.length > 0 && (
                                      <div>
                                        <label style={HL}>👥 Worked With</label>
                                        <div style={{ position:"relative" }}>
                                          <select value="" onChange={ev=>{const id=ev.target.value;if(id&&!(editDraft.participant_ids??[]).includes(id))setEditDraft(d=>({...d,participant_ids:[...(d.participant_ids??[]),id]}))}} style={{ ...HF, paddingRight:28, appearance:"none" }}>
                                            <option value="">Add teammate…</option>
                                            {members.filter(m=>!(editDraft.participant_ids??[]).includes(m.id)).map(m=><option key={m.id} value={m.id}>{m.name}</option>)}
                                          </select>
                                          <ChevronDown size={11} style={{ position:"absolute", right:10, top:"50%", transform:"translateY(-50%)", color:"#9CA3AF", pointerEvents:"none" }} />
                                        </div>
                                        {(editDraft.participant_ids??[]).length > 0 && (
                                          <div style={{ display:"flex", flexWrap:"wrap", gap:4, marginTop:6 }}>
                                            {(editDraft.participant_ids??[]).map(pid=>{
                                              const m=members.find(t=>t.id===pid); if(!m) return null
                                              const initials=m.name.split(" ").map((n:string)=>n[0]).join("").slice(0,2).toUpperCase()
                                              return (<button key={pid} type="button" onClick={()=>setEditDraft(d=>({...d,participant_ids:(d.participant_ids??[]).filter(p=>p!==pid)}))}
                                                style={{ display:"flex", alignItems:"center", gap:4, padding:"3px 8px 3px 5px", borderRadius:99, background:"rgba(236,72,153,0.1)", border:"1.5px solid rgba(236,72,153,0.3)", cursor:"pointer" }}>
                                                <div style={{ width:16, height:16, borderRadius:"50%", background:"#EC4899", display:"flex", alignItems:"center", justifyContent:"center", fontSize:7, fontWeight:900, color:"#fff" }}>{initials}</div>
                                                <span style={{ fontSize:10, fontWeight:700, color:"#BE185D" }}>{m.name.split(" ")[0]}</span>
                                                <span style={{ fontSize:8, color:"#F472B6" }}>✕</span>
                                              </button>)
                                            })}
                                          </div>
                                        )}
                                      </div>
                                    )}
                                    <div style={{ display:"flex", gap:8, justifyContent:"flex-end", borderTop:"1px solid #F0F1F5", paddingTop:12, marginTop:4 }}>
                                      <button onClick={()=>{setEditingKey(null);setEditDraft({})}} style={{ padding:"7px 14px", borderRadius:8, background:"#F3F4F6", border:"none", fontSize:12, fontWeight:600, color:"#6B7280", cursor:"pointer" }}>Cancel</button>
                                      <button onClick={()=>saveEntry(u.id,entries,ei)} disabled={savingKey===eKey} style={{ display:"flex", alignItems:"center", gap:5, padding:"9px 20px", borderRadius:10, background:"#EC4899", border:"none", fontSize:12, fontWeight:700, color:"#fff", cursor:"pointer", opacity:savingKey===eKey?0.7:1, boxShadow:"0 4px 12px rgba(236,72,153,0.3)" }}><Check size={12}/> {savingKey===eKey?"Saving…":"Save Poster"}</button>
                                    </div>
                                  </div>)
                                })()}

                                {/* ── SCRIPTING EDIT ── */}
                                {editDraft.task_type === "scripting" && (()=>{
                                  const HF: React.CSSProperties = { background:"#F9FAFB", border:"1.5px solid #EBEDF2", color:"#111827", borderRadius:10, padding:"9px 12px", fontSize:13, outline:"none", width:"100%", boxSizing:"border-box" as const }
                                  const HL: React.CSSProperties = { display:"block", fontSize:10, fontWeight:700, color:"#374151", textTransform:"uppercase" as const, letterSpacing:"0.1em", marginBottom:5 }
                                  const dur = calcDur(editDraft.start_time, editDraft.end_time)
                                  return (<div style={{ display:"flex", flexDirection:"column", gap:10 }}>
                                    <p style={{ fontSize:11, fontWeight:800, color:"#92620B", margin:"0 0 2px", textTransform:"uppercase", letterSpacing:"0.1em" }}>✏️ Edit Scripting</p>
                                    {/* Revision toggle */}
                                    <div style={{ display:"flex", flexDirection:"column", gap:6, padding:"7px 12px", borderRadius:10, background:editDraft.is_rework?"rgba(245,158,11,0.08)":"rgba(234,179,8,0.05)", border:editDraft.is_rework?"1px solid rgba(245,158,11,0.3)":"1px solid rgba(234,179,8,0.15)" }}>
                                      <button type="button" onClick={()=>setEditDraft(d=>({...d, is_rework:!d.is_rework, linked_to_title:null, linked_to_client:null, linked_to_date:null}))}
                                        style={{ padding:"4px 10px", borderRadius:8, border:"none", cursor:"pointer", fontSize:11, fontWeight:700, background:editDraft.is_rework?"rgba(245,158,11,0.2)":"rgba(234,179,8,0.15)", color:editDraft.is_rework?"#92400E":"#92620B", whiteSpace:"nowrap", alignSelf:"flex-start" }}>
                                        {editDraft.is_rework ? "✓ Revision" : "Revision of existing?"}
                                      </button>
                                      {editDraft.is_rework && (
                                        <div style={{ position:"relative" }}>
                                          <select
                                            value={editDraft.linked_to_title ? `${editDraft.linked_to_client||""}||${editDraft.linked_to_title}||${editDraft.linked_to_date||""}` : ""}
                                            onChange={ev=>{const val=ev.target.value;if(!val){setEditDraft(d=>({...d,linked_to_title:null,linked_to_client:null,linked_to_date:null}));return}const p=val.split("||");setEditDraft(d=>({...d,linked_to_client:p[0]||null,linked_to_title:p[1]||null,linked_to_date:p[2]||null}))}}
                                            style={{...HF,paddingRight:28,appearance:"none"}}>
                                            <option value="">— Pick original script —</option>
                                            {revisionOptionsByType.scriptings.map(o=><option key={o.key} value={o.key}>{o.label}</option>)}
                                            {editDraft.linked_to_title&&!revisionOptionsByType.scriptings.find(o=>o.title===editDraft.linked_to_title&&o.client===(editDraft.linked_to_client??""))&&(
                                              <option value={`${editDraft.linked_to_client||""}||${editDraft.linked_to_title}||${editDraft.linked_to_date||""}`}>{editDraft.linked_to_client?editDraft.linked_to_client+" – ":""}{editDraft.linked_to_title} ↩</option>
                                            )}
                                          </select>
                                          <ChevronDown size={11} style={{position:"absolute",right:10,top:"50%",transform:"translateY(-50%)",color:"#9CA3AF",pointerEvents:"none"}} />
                                        </div>
                                      )}
                                    </div>
                                    <div>
                                      <label style={HL}>Entry Date</label>
                                      <input type="date" min="2025-01-01" max={new Date().toISOString().split("T")[0]} value={editDraftDate} onChange={ev=>setEditDraftDate(clampDate(ev.target.value))} style={{ ...HF, colorScheme:"light" }} />
                                      {editDraftDate!==editOrigDate && <p style={{ fontSize:10, color:"#6366F1", margin:"3px 0 0", fontWeight:600 }}>Moves to {new Date(editDraftDate+"T12:00:00").toLocaleDateString("en-US",{day:"numeric",month:"short",year:"numeric"})}</p>}
                                    </div>
                                    <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:10 }}>
                                      <div>
                                        <label style={HL}>Client Name *</label>
                                        <ClientSelector
                                          label=""
                                          value={editDraft.client_name??""}
                                          clientOptions={activeClientsForEdit}
                                          pastClientOptions={pastClientsOnly}
                                          placeholder="Select client…"
                                          fieldStyle={HF}
                                          onValueChange={v=>setEditDraft(d=>({...d,client_name:v}))}
                                        />
                                      </div>
                                      <div><label style={HL}>Script Title *</label><input value={editDraft.title??""} onChange={ev=>setEditDraft(d=>({...d,title:ev.target.value}))} placeholder="e.g. Independence Day Reel Script" style={HF} /></div>
                                    </div>
                                    <div>
                                      <label style={HL}>📝 Scripting Time</label>
                                      <div style={{ display:"flex", alignItems:"center", gap:8, flexWrap:"wrap" }}>
                                        <HTimePicker value={editDraft.start_time??"09:00"} onChange={v=>setEditDraft(d=>({...d,start_time:v}))} />
                                        <span style={{ fontSize:11, color:"#9CA3AF", flexShrink:0 }}>to</span>
                                        <HTimePicker value={editDraft.end_time??"09:00"} onChange={v=>setEditDraft(d=>({...d,end_time:v}))} />
                                        {dur>0 && <span style={{ fontSize:10, fontWeight:700, padding:"3px 8px", borderRadius:99, background:"rgba(234,179,8,0.12)", color:"#92620B" }}>{fmtTravel(dur)}</span>}
                                      </div>
                                    </div>
                                    <div><label style={HL}>Notes</label><textarea rows={2} value={editDraft.notes??""} onChange={ev=>setEditDraft(d=>({...d,notes:ev.target.value}))} placeholder="Script details, revisions…" style={{ ...HF, resize:"none" }} /></div>
                                    {members.length > 0 && (
                                      <div>
                                        <label style={HL}>👥 Worked With</label>
                                        <div style={{ position:"relative" }}>
                                          <select value="" onChange={ev=>{const id=ev.target.value;if(id&&!(editDraft.participant_ids??[]).includes(id))setEditDraft(d=>({...d,participant_ids:[...(d.participant_ids??[]),id]}))}} style={{ ...HF, paddingRight:28, appearance:"none" }}>
                                            <option value="">Add teammate…</option>
                                            {members.filter(m=>!(editDraft.participant_ids??[]).includes(m.id)).map(m=><option key={m.id} value={m.id}>{m.name}</option>)}
                                          </select>
                                          <ChevronDown size={11} style={{ position:"absolute", right:10, top:"50%", transform:"translateY(-50%)", color:"#9CA3AF", pointerEvents:"none" }} />
                                        </div>
                                        {(editDraft.participant_ids??[]).length > 0 && (
                                          <div style={{ display:"flex", flexWrap:"wrap", gap:4, marginTop:6 }}>
                                            {(editDraft.participant_ids??[]).map(pid=>{
                                              const m=members.find(t=>t.id===pid); if(!m) return null
                                              const initials=m.name.split(" ").map((n:string)=>n[0]).join("").slice(0,2).toUpperCase()
                                              return (<button key={pid} type="button" onClick={()=>setEditDraft(d=>({...d,participant_ids:(d.participant_ids??[]).filter(p=>p!==pid)}))}
                                                style={{ display:"flex", alignItems:"center", gap:4, padding:"3px 8px 3px 5px", borderRadius:99, background:"rgba(234,179,8,0.12)", border:"1.5px solid rgba(234,179,8,0.3)", cursor:"pointer" }}>
                                                <div style={{ width:16, height:16, borderRadius:"50%", background:"#EAB308", display:"flex", alignItems:"center", justifyContent:"center", fontSize:7, fontWeight:900, color:"#fff" }}>{initials}</div>
                                                <span style={{ fontSize:10, fontWeight:700, color:"#92620B" }}>{m.name.split(" ")[0]}</span>
                                                <span style={{ fontSize:8, color:"#B45309" }}>✕</span>
                                              </button>)
                                            })}
                                          </div>
                                        )}
                                      </div>
                                    )}
                                    <div style={{ display:"flex", gap:8, justifyContent:"flex-end", borderTop:"1px solid #F0F1F5", paddingTop:12, marginTop:4 }}>
                                      <button onClick={()=>{setEditingKey(null);setEditDraft({})}} style={{ padding:"7px 14px", borderRadius:8, background:"#F3F4F6", border:"none", fontSize:12, fontWeight:600, color:"#6B7280", cursor:"pointer" }}>Cancel</button>
                                      <button onClick={()=>saveEntry(u.id,entries,ei)} disabled={savingKey===eKey} style={{ display:"flex", alignItems:"center", gap:5, padding:"9px 20px", borderRadius:10, background:"#EAB308", border:"none", fontSize:12, fontWeight:700, color:"#fff", cursor:"pointer", opacity:savingKey===eKey?0.7:1, boxShadow:"0 4px 12px rgba(234,179,8,0.3)" }}><Check size={12}/> {savingKey===eKey?"Saving…":"Save Scripting"}</button>
                                    </div>
                                  </div>)
                                })()}

                                {/* ── DEVELOPMENT EDIT ── */}
                                {editDraft.task_type === "development" && (()=>{
                                  const HF: React.CSSProperties = { background:"#F9FAFB", border:"1.5px solid #EBEDF2", color:"#111827", borderRadius:10, padding:"9px 12px", fontSize:13, outline:"none", width:"100%", boxSizing:"border-box" as const }
                                  const HL: React.CSSProperties = { display:"block", fontSize:10, fontWeight:700, color:"#374151", textTransform:"uppercase" as const, letterSpacing:"0.1em", marginBottom:5 }
                                  const dur = calcDur(editDraft.start_time, editDraft.end_time)
                                  return (<div style={{ display:"flex", flexDirection:"column", gap:10 }}>
                                    <p style={{ fontSize:11, fontWeight:800, color:"#4338CA", margin:"0 0 2px", textTransform:"uppercase", letterSpacing:"0.1em" }}>✏️ Edit Development</p>
                                    <div>
                                      <label style={HL}>Entry Date</label>
                                      <input type="date" min="2025-01-01" max={new Date().toISOString().split("T")[0]} value={editDraftDate} onChange={ev=>setEditDraftDate(clampDate(ev.target.value))} style={{ ...HF, colorScheme:"light" }} />
                                      {editDraftDate!==editOrigDate && <p style={{ fontSize:10, color:"#6366F1", margin:"3px 0 0", fontWeight:600 }}>Moves to {new Date(editDraftDate+"T12:00:00").toLocaleDateString("en-US",{day:"numeric",month:"short",year:"numeric"})}</p>}
                                    </div>
                                    <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:10 }}>
                                      <div>
                                        <label style={HL}>Project</label>
                                        <input value={editDraft.project_name??""} onChange={ev=>setEditDraft(d=>({...d,project_name:ev.target.value}))} placeholder="e.g. TEAM APP" style={HF} />
                                      </div>
                                      <div>
                                        <label style={HL}>Client Name *</label>
                                        <ClientSelector
                                          label=""
                                          value={editDraft.client_name??""}
                                          clientOptions={activeClientsForEdit}
                                          pastClientOptions={pastClientsOnly}
                                          placeholder="Select client…"
                                          fieldStyle={HF}
                                          onValueChange={v=>setEditDraft(d=>({...d,client_name:v}))}
                                        />
                                      </div>
                                    </div>
                                    <div><label style={HL}>Sub-title — what did you work on? *</label><input value={editDraft.title??""} onChange={ev=>setEditDraft(d=>({...d,title:ev.target.value}))} placeholder="e.g. Fixed dashboard filter bug" style={HF} /></div>
                                    <div>
                                      <label style={HL}>💻 Dev Time</label>
                                      <div style={{ display:"flex", alignItems:"center", gap:8, flexWrap:"wrap" }}>
                                        <HTimePicker value={editDraft.start_time??"09:00"} onChange={v=>setEditDraft(d=>({...d,start_time:v}))} />
                                        <span style={{ fontSize:11, color:"#9CA3AF", flexShrink:0 }}>to</span>
                                        <HTimePicker value={editDraft.end_time??"09:00"} onChange={v=>setEditDraft(d=>({...d,end_time:v}))} />
                                        {dur>0 && <span style={{ fontSize:10, fontWeight:700, padding:"3px 8px", borderRadius:99, background:"rgba(99,102,241,0.1)", color:"#4338CA" }}>{fmtTravel(dur)}</span>}
                                      </div>
                                    </div>
                                    {members.length > 0 && (
                                      <div>
                                        <label style={HL}>👥 Worked With</label>
                                        <div style={{ position:"relative" }}>
                                          <select value="" onChange={ev=>{const id=ev.target.value;if(id&&!(editDraft.participant_ids??[]).includes(id))setEditDraft(d=>({...d,participant_ids:[...(d.participant_ids??[]),id]}))}} style={{ ...HF, paddingRight:28, appearance:"none" }}>
                                            <option value="">Add teammate…</option>
                                            {members.filter(m=>!(editDraft.participant_ids??[]).includes(m.id)).map(m=><option key={m.id} value={m.id}>{m.name}</option>)}
                                          </select>
                                          <ChevronDown size={11} style={{ position:"absolute", right:10, top:"50%", transform:"translateY(-50%)", color:"#9CA3AF", pointerEvents:"none" }} />
                                        </div>
                                        {(editDraft.participant_ids??[]).length > 0 && (
                                          <div style={{ display:"flex", flexWrap:"wrap", gap:4, marginTop:6 }}>
                                            {(editDraft.participant_ids??[]).map(pid=>{
                                              const m=members.find(t=>t.id===pid); if(!m) return null
                                              const initials=m.name.split(" ").map((n:string)=>n[0]).join("").slice(0,2).toUpperCase()
                                              return (<button key={pid} type="button" onClick={()=>setEditDraft(d=>({...d,participant_ids:(d.participant_ids??[]).filter(p=>p!==pid)}))}
                                                style={{ display:"flex", alignItems:"center", gap:4, padding:"3px 8px 3px 5px", borderRadius:99, background:"rgba(99,102,241,0.1)", border:"1.5px solid rgba(99,102,241,0.3)", cursor:"pointer" }}>
                                                <div style={{ width:16, height:16, borderRadius:"50%", background:"#6366F1", display:"flex", alignItems:"center", justifyContent:"center", fontSize:7, fontWeight:900, color:"#fff" }}>{initials}</div>
                                                <span style={{ fontSize:10, fontWeight:700, color:"#3730A3" }}>{m.name.split(" ")[0]}</span>
                                                <span style={{ fontSize:8, color:"#6366F1" }}>✕</span>
                                              </button>)
                                            })}
                                          </div>
                                        )}
                                      </div>
                                    )}
                                    <div style={{ display:"flex", gap:8, justifyContent:"flex-end", borderTop:"1px solid #F0F1F5", paddingTop:12, marginTop:4 }}>
                                      <button onClick={()=>{setEditingKey(null);setEditDraft({})}} style={{ padding:"7px 14px", borderRadius:8, background:"#F3F4F6", border:"none", fontSize:12, fontWeight:600, color:"#6B7280", cursor:"pointer" }}>Cancel</button>
                                      <button onClick={()=>saveEntry(u.id,entries,ei)} disabled={savingKey===eKey} style={{ display:"flex", alignItems:"center", gap:5, padding:"9px 20px", borderRadius:10, background:"#6366F1", border:"none", fontSize:12, fontWeight:700, color:"#fff", cursor:"pointer", opacity:savingKey===eKey?0.7:1, boxShadow:"0 4px 12px rgba(99,102,241,0.3)" }}><Check size={12}/> {savingKey===eKey?"Saving…":"Save Development"}</button>
                                    </div>
                                  </div>)
                                })()}

                                {/* ── OTHER (Meeting/Teaching/Misc) EDIT ── */}
                                {editDraft.task_type === "other_activity" && (()=>{
                                  const HF: React.CSSProperties = { background:"#F9FAFB", border:"1.5px solid #EBEDF2", color:"#111827", borderRadius:10, padding:"9px 12px", fontSize:13, outline:"none", width:"100%", boxSizing:"border-box" as const }
                                  const HL: React.CSSProperties = { display:"block", fontSize:10, fontWeight:700, color:"#374151", textTransform:"uppercase" as const, letterSpacing:"0.1em", marginBottom:5 }
                                  const dur = calcDur(editDraft.start_time, editDraft.end_time)
                                  return (<div style={{ display:"flex", flexDirection:"column", gap:10 }}>
                                    <p style={{ fontSize:11, fontWeight:800, color:"#374151", margin:"0 0 2px", textTransform:"uppercase", letterSpacing:"0.1em" }}>✏️ Edit Other</p>
                                    <div>
                                      <label style={HL}>Entry Date</label>
                                      <input type="date" min="2025-01-01" max={new Date().toISOString().split("T")[0]} value={editDraftDate} onChange={ev=>setEditDraftDate(clampDate(ev.target.value))} style={{ ...HF, colorScheme:"light" }} />
                                      {editDraftDate!==editOrigDate && <p style={{ fontSize:10, color:"#6366F1", margin:"3px 0 0", fontWeight:600 }}>Moves to {new Date(editDraftDate+"T12:00:00").toLocaleDateString("en-US",{day:"numeric",month:"short",year:"numeric"})}</p>}
                                    </div>
                                    <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:10 }}>
                                      <div>
                                        <label style={HL}>Type</label>
                                        <select value={editDraft._other_type??"Meeting"} onChange={ev=>setEditDraft(d=>({...d,_other_type:ev.target.value}))} style={{...HF,appearance:"none"}}>
                                          <option value="Meeting">Meeting</option>
                                          <option value="Teaching">Teaching</option>
                                          <option value="Other">Other</option>
                                        </select>
                                      </div>
                                      <div><label style={HL}>Title / What was it? *</label><input value={editDraft.title??""} onChange={ev=>setEditDraft(d=>({...d,title:ev.target.value}))} placeholder="e.g. Weekly Sync with Marketing Team" style={HF} /></div>
                                    </div>
                                    <div>
                                      <label style={HL}>Client Name *</label>
                                      <ClientSelector
                                        label=""
                                        value={editDraft.client_name??""}
                                        clientOptions={activeClientsForEdit}
                                        pastClientOptions={pastClientsOnly}
                                        placeholder="Select client…"
                                        fieldStyle={HF}
                                        onValueChange={v=>setEditDraft(d=>({...d,client_name:v}))}
                                      />
                                    </div>
                                    <div>
                                      <label style={HL}>🗓️ Time</label>
                                      <div style={{ display:"flex", alignItems:"center", gap:8, flexWrap:"wrap" }}>
                                        <HTimePicker value={editDraft.start_time??"09:00"} onChange={v=>setEditDraft(d=>({...d,start_time:v}))} />
                                        <span style={{ fontSize:11, color:"#9CA3AF", flexShrink:0 }}>to</span>
                                        <HTimePicker value={editDraft.end_time??"09:00"} onChange={v=>setEditDraft(d=>({...d,end_time:v}))} />
                                        {dur>0 && <span style={{ fontSize:10, fontWeight:700, padding:"3px 8px", borderRadius:99, background:"rgba(107,114,128,0.12)", color:"#374151" }}>{fmtTravel(dur)}</span>}
                                      </div>
                                    </div>
                                    <div><label style={HL}>Notes</label><textarea rows={2} value={editDraft.notes??""} onChange={ev=>setEditDraft(d=>({...d,notes:ev.target.value}))} placeholder="What was discussed / covered…" style={{ ...HF, resize:"none" }} /></div>
                                    {members.length > 0 && (
                                      <div>
                                        <label style={HL}>👥 Worked With</label>
                                        <div style={{ position:"relative" }}>
                                          <select value="" onChange={ev=>{const id=ev.target.value;if(id&&!(editDraft.participant_ids??[]).includes(id))setEditDraft(d=>({...d,participant_ids:[...(d.participant_ids??[]),id]}))}} style={{ ...HF, paddingRight:28, appearance:"none" }}>
                                            <option value="">Add teammate…</option>
                                            {members.filter(m=>!(editDraft.participant_ids??[]).includes(m.id)).map(m=><option key={m.id} value={m.id}>{m.name}</option>)}
                                          </select>
                                          <ChevronDown size={11} style={{ position:"absolute", right:10, top:"50%", transform:"translateY(-50%)", color:"#9CA3AF", pointerEvents:"none" }} />
                                        </div>
                                        {(editDraft.participant_ids??[]).length > 0 && (
                                          <div style={{ display:"flex", flexWrap:"wrap", gap:4, marginTop:6 }}>
                                            {(editDraft.participant_ids??[]).map(pid=>{
                                              const m=members.find(t=>t.id===pid); if(!m) return null
                                              const initials=m.name.split(" ").map((n:string)=>n[0]).join("").slice(0,2).toUpperCase()
                                              return (<button key={pid} type="button" onClick={()=>setEditDraft(d=>({...d,participant_ids:(d.participant_ids??[]).filter(p=>p!==pid)}))}
                                                style={{ display:"flex", alignItems:"center", gap:4, padding:"3px 8px 3px 5px", borderRadius:99, background:"rgba(107,114,128,0.12)", border:"1.5px solid rgba(107,114,128,0.3)", cursor:"pointer" }}>
                                                <div style={{ width:16, height:16, borderRadius:"50%", background:"#6B7280", display:"flex", alignItems:"center", justifyContent:"center", fontSize:7, fontWeight:900, color:"#fff" }}>{initials}</div>
                                                <span style={{ fontSize:10, fontWeight:700, color:"#374151" }}>{m.name.split(" ")[0]}</span>
                                                <span style={{ fontSize:8, color:"#6B7280" }}>✕</span>
                                              </button>)
                                            })}
                                          </div>
                                        )}
                                      </div>
                                    )}
                                    <div style={{ display:"flex", gap:8, justifyContent:"flex-end", borderTop:"1px solid #F0F1F5", paddingTop:12, marginTop:4 }}>
                                      <button onClick={()=>{setEditingKey(null);setEditDraft({})}} style={{ padding:"7px 14px", borderRadius:8, background:"#F3F4F6", border:"none", fontSize:12, fontWeight:600, color:"#6B7280", cursor:"pointer" }}>Cancel</button>
                                      <button onClick={()=>saveEntry(u.id,entries,ei)} disabled={savingKey===eKey} style={{ display:"flex", alignItems:"center", gap:5, padding:"9px 20px", borderRadius:10, background:"#6B7280", border:"none", fontSize:12, fontWeight:700, color:"#fff", cursor:"pointer", opacity:savingKey===eKey?0.7:1, boxShadow:"0 4px 12px rgba(107,114,128,0.3)" }}><Check size={12}/> {savingKey===eKey?"Saving…":"Save Other"}</button>
                                    </div>
                                  </div>)
                                })()}

                                {/* ── NON-MEDIA EDIT ── */}
                                {editDraft.task_type === "edit" && !isMedia && (()=>{
                                  const HF: React.CSSProperties = { background:"#F9FAFB", border:"1.5px solid #EBEDF2", color:"#111827", borderRadius:10, padding:"9px 12px", fontSize:13, outline:"none", width:"100%", boxSizing:"border-box" as const }
                                  const HL: React.CSSProperties = { display:"block", fontSize:10, fontWeight:700, color:"#374151", textTransform:"uppercase" as const, letterSpacing:"0.1em", marginBottom:5 }
                                  const dur = calcDur(editDraft.start_time, editDraft.end_time)
                                  return (<div style={{ display:"flex", flexDirection:"column", gap:10 }}>
                                    <p style={{ fontSize:11, fontWeight:800, color:"#0D9488", margin:"0 0 2px", textTransform:"uppercase", letterSpacing:"0.1em" }}>✏️ Edit Editing Entry</p>
                                    <div style={{ display:"flex", flexDirection:"column", gap:6, padding:"7px 12px", borderRadius:10, background:editDraft.is_rework?"rgba(245,158,11,0.08)":"rgba(13,148,136,0.04)", border:editDraft.is_rework?"1px solid rgba(245,158,11,0.3)":"1px solid rgba(13,148,136,0.1)" }}>
                                      <button type="button" onClick={()=>setEditDraft(d=>({...d, is_rework:!d.is_rework, linked_to_title:null, linked_to_client:null, linked_to_date:null}))}
                                        style={{ padding:"4px 10px", borderRadius:8, border:"none", cursor:"pointer", fontSize:11, fontWeight:700, background:editDraft.is_rework?"rgba(245,158,11,0.2)":"rgba(13,148,136,0.12)", color:editDraft.is_rework?"#92400E":"#0D9488", whiteSpace:"nowrap", alignSelf:"flex-start" }}>
                                        {editDraft.is_rework ? "✓ Revision" : "Revision of existing?"}
                                      </button>
                                      {editDraft.is_rework && (
                                        <div style={{ position:"relative" }}>
                                          <select
                                            value={editDraft.linked_to_title ? `${editDraft.linked_to_client||""}||${editDraft.linked_to_title}||${editDraft.linked_to_date||""}` : ""}
                                            onChange={ev=>{const val=ev.target.value;if(!val){setEditDraft(d=>({...d,linked_to_title:null,linked_to_client:null,linked_to_date:null}));return}const p=val.split("||");setEditDraft(d=>({...d,linked_to_client:p[0]||null,linked_to_title:p[1]||null,linked_to_date:p[2]||null}))}}
                                            style={{...HF,paddingRight:28,appearance:"none"}}>
                                            <option value="">— Pick original editing video —</option>
                                            {revisionOptionsByType.edits.map(o=><option key={o.key} value={o.key}>{o.label}</option>)}
                                            {editDraft.linked_to_title&&!revisionOptionsByType.edits.find(o=>o.title===editDraft.linked_to_title&&o.client===(editDraft.linked_to_client??""))&&(
                                              <option value={`${editDraft.linked_to_client||""}||${editDraft.linked_to_title}||${editDraft.linked_to_date||""}`}>{editDraft.linked_to_client?editDraft.linked_to_client+" – ":""}{editDraft.linked_to_title} ↩</option>
                                            )}
                                          </select>
                                          <ChevronDown size={11} style={{position:"absolute",right:10,top:"50%",transform:"translateY(-50%)",color:"#9CA3AF",pointerEvents:"none"}} />
                                        </div>
                                      )}
                                    </div>
                                    <div>
                                      <label style={HL}>Entry Date</label>
                                      <input type="date" min="2025-01-01" max={new Date().toISOString().split("T")[0]} value={editDraftDate} onChange={ev=>setEditDraftDate(clampDate(ev.target.value))} style={{ ...HF, colorScheme:"light" }} />
                                      {editDraftDate!==editOrigDate && <p style={{ fontSize:10, color:"#6366F1", margin:"3px 0 0", fontWeight:600 }}>Moves to {new Date(editDraftDate+"T12:00:00").toLocaleDateString("en-US",{day:"numeric",month:"short",year:"numeric"})}</p>}
                                    </div>
                                    <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:10 }}>
                                      <div>
                                        <label style={HL}>Client Name *</label>
                                        <ClientSelector
                                          label=""
                                          value={editDraft.client_name??""}
                                          clientOptions={activeClientsForEdit}
                                          pastClientOptions={pastClientsOnly}
                                          placeholder="Select client…"
                                          fieldStyle={HF}
                                          onValueChange={v=>setEditDraft(d=>({...d,client_name:v}))}
                                        />
                                      </div>
                                      <div>
                                        <label style={HL}>Video Type</label>
                                        <div style={{ position:"relative" }}>
                                          <select value={editDraft.video_type??""} onChange={ev=>setEditDraft(d=>({...d,video_type:ev.target.value}))} style={{ ...HF, paddingRight:28, appearance:"none" }}>
                                            <option value="">Select type…</option>
                                            <option value="AI GENERATED">AI Generated</option>
                                            <option value="SIMPLE EDIT">Simple Edit</option>
                                            <option value="EDIT + AI">Edit + AI</option>
                                          </select>
                                          <ChevronDown size={11} style={{ position:"absolute", right:10, top:"50%", transform:"translateY(-50%)", color:"#9CA3AF", pointerEvents:"none" }} />
                                        </div>
                                      </div>
                                    </div>
                                    <div><label style={HL}>Video Name</label><input value={editDraft.title??""} onChange={ev=>setEditDraft(d=>({...d,title:ev.target.value}))} placeholder="Video or project name" style={HF} /></div>
                                    <div>
                                      <label style={HL}>⏱ Editing Time</label>
                                      <div style={{ display:"flex", alignItems:"center", gap:8, flexWrap:"wrap" }}>
                                        <HTimePicker value={editDraft.start_time??"09:00"} onChange={v=>setEditDraft(d=>({...d,start_time:v}))} />
                                        <span style={{ fontSize:11, color:"#9CA3AF", flexShrink:0 }}>to</span>
                                        <HTimePicker value={editDraft.end_time??"09:00"} onChange={v=>setEditDraft(d=>({...d,end_time:v}))} />
                                        {dur>0 && <span style={{ fontSize:10, fontWeight:700, padding:"3px 8px", borderRadius:99, background:"rgba(13,148,136,0.1)", color:"#0D9488" }}>{fmtTravel(dur)}</span>}
                                      </div>
                                    </div>
                                    {members.length > 0 && (
                                      <div>
                                        <label style={HL}>👥 Edited With</label>
                                        <div style={{ position:"relative" }}>
                                          <select value="" onChange={ev=>{const id=ev.target.value;if(id&&!(editDraft.participant_ids??[]).includes(id))setEditDraft(d=>({...d,participant_ids:[...(d.participant_ids??[]),id]}))}} style={{ ...HF, paddingRight:28, appearance:"none" }}>
                                            <option value="">Add teammate…</option>
                                            {members.filter(m=>!(editDraft.participant_ids??[]).includes(m.id)).map(m=><option key={m.id} value={m.id}>{m.name}</option>)}
                                          </select>
                                          <ChevronDown size={11} style={{ position:"absolute", right:10, top:"50%", transform:"translateY(-50%)", color:"#9CA3AF", pointerEvents:"none" }} />
                                        </div>
                                        {(editDraft.participant_ids??[]).length > 0 && (
                                          <div style={{ display:"flex", flexWrap:"wrap", gap:4, marginTop:6 }}>
                                            {(editDraft.participant_ids??[]).map(pid=>{
                                              const m=members.find(t=>t.id===pid); if(!m) return null
                                              const initials=m.name.split(" ").map((n:string)=>n[0]).join("").slice(0,2).toUpperCase()
                                              return (<button key={pid} type="button" onClick={()=>setEditDraft(d=>({...d,participant_ids:(d.participant_ids??[]).filter(p=>p!==pid)}))}
                                                style={{ display:"flex", alignItems:"center", gap:4, padding:"3px 8px 3px 5px", borderRadius:99, background:"rgba(13,148,136,0.1)", border:"1.5px solid rgba(13,148,136,0.3)", cursor:"pointer" }}>
                                                <div style={{ width:16, height:16, borderRadius:"50%", background:"#0D9488", display:"flex", alignItems:"center", justifyContent:"center", fontSize:7, fontWeight:900, color:"#fff" }}>{initials}</div>
                                                <span style={{ fontSize:10, fontWeight:700, color:"#0F766E" }}>{m.name.split(" ")[0]}</span>
                                                <span style={{ fontSize:8, color:"#5EEAD4" }}>✕</span>
                                              </button>)
                                            })}
                                          </div>
                                        )}
                                      </div>
                                    )}
                                    <div style={{ display:"flex", gap:8, justifyContent:"flex-end", borderTop:"1px solid #F0F1F5", paddingTop:12, marginTop:4 }}>
                                      <button onClick={()=>{setEditingKey(null);setEditDraft({})}} style={{ padding:"7px 14px", borderRadius:8, background:"#F3F4F6", border:"none", fontSize:12, fontWeight:600, color:"#6B7280", cursor:"pointer" }}>Cancel</button>
                                      <button onClick={()=>saveEntry(u.id,entries,ei)} disabled={savingKey===eKey} style={{ display:"flex", alignItems:"center", gap:5, padding:"9px 20px", borderRadius:10, background:"#0D9488", border:"none", fontSize:12, fontWeight:700, color:"#fff", cursor:"pointer", opacity:savingKey===eKey?0.7:1, boxShadow:"0 4px 12px rgba(13,148,136,0.3)" }}><Check size={12}/> {savingKey===eKey?"Saving…":"Save Edit"}</button>
                                    </div>
                                  </div>)
                                })()}

                              </div>
                            )}
                          </div>
                        )
                      })}
                    </div>
                  )}

                {/* ── Pending collaboration confirmations for this day ── */}
                {(confirmsByDate.get(u.date) ?? []).filter(c => c.status === 'pending').map(conf => {
                  const submitter = members.find(m => m.id === conf.submitter_id)
                  const snap = conf.entry_snapshot
                  const taskType = (snap?.task_type ?? 'other') as keyof typeof TASK_CFG
                  const cfg = TASK_CFG[taskType] ?? TASK_CFG.other
                  const { Icon } = cfg
                  const isEditing = collabEditId === conf.id
                  const isRejecting = collabRejectId === conf.id
                  const loading = collabLoading === conf.id
                  const isHighlighted = highlightConfirmId === conf.id
                  return (
                    <div key={conf.id} id={`collab-confirm-${conf.id}`} style={{ borderTop: "2px solid rgba(99,102,241,0.2)", background: isHighlighted ? "rgba(99,102,241,0.14)" : "rgba(99,102,241,0.04)", padding: "12px 18px", transition: "box-shadow 0.3s, background 0.3s", boxShadow: isHighlighted ? "inset 0 0 0 2px #6366F1" : "none" }}>
                      <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 10 }}>
                        <span style={{ fontSize: 10, fontWeight: 800, color: "#6366F1", background: "rgba(99,102,241,0.12)", padding: "2px 8px", borderRadius: 99 }}>⏳ PENDING CONFIRMATION</span>
                        <span style={{ fontSize: 11, color: "#9CA3AF" }}>· by <span style={{ fontWeight: 700, color: "#6366F1" }}>{submitter?.name ?? "Teammate"}</span></span>
                      </div>
                      <div style={{ display: "flex", gap: 10, marginBottom: 10 }}>
                        <div style={{ width: 30, height: 30, borderRadius: 8, background: cfg.bg, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                          <Icon size={13} style={{ color: cfg.color }}/>
                        </div>
                        <div style={{ flex: 1 }}>
                          <div style={{ fontSize: 12, fontWeight: 800, color: "#111111", marginBottom: 2 }}>{snap?.title || cfg.label}</div>
                          {snap?.client_name && <div style={{ fontSize: 10, color: "#6B7280", fontWeight: 600, marginBottom: 3 }}>{snap.client_name}</div>}
                          {conf.original_start_time && conf.original_end_time && (
                            <div style={{ fontSize: 11, fontWeight: 700, color: "#6366F1" }}>
                              🕐 {fmt12(conf.original_start_time)} – {fmt12(conf.original_end_time)}
                              {conf.original_duration_hours ? ` · ${fmtH(conf.original_duration_hours)}` : ""}
                            </div>
                          )}
                        </div>
                      </div>
                      {isEditing ? (
                        <div style={{ display: "flex", flexDirection: "column", gap: 8, padding: "10px", background: "#fff", borderRadius: 10, border: "1px solid rgba(99,102,241,0.2)" }}>
                          <div style={{ fontSize: 11, fontWeight: 700, color: "#374151" }}>My actual time for this task:</div>
                          <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                            <div>
                              <div style={{ fontSize: 10, color: "#9CA3AF", marginBottom: 2 }}>Start</div>
                              <input type="time" value={collabEditStart} onChange={e => setCollabEditStart(e.target.value)}
                                style={{ border: "1px solid #EBEDF2", borderRadius: 8, padding: "6px 8px", fontSize: 12, outline: "none" }}/>
                            </div>
                            <div style={{ marginTop: 14, color: "#9CA3AF" }}>–</div>
                            <div>
                              <div style={{ fontSize: 10, color: "#9CA3AF", marginBottom: 2 }}>End</div>
                              <input type="time" value={collabEditEnd} onChange={e => setCollabEditEnd(e.target.value)}
                                style={{ border: "1px solid #EBEDF2", borderRadius: 8, padding: "6px 8px", fontSize: 12, outline: "none" }}/>
                            </div>
                          </div>
                          <div style={{ display: "flex", gap: 6 }}>
                            <button disabled={loading} onClick={async () => {
                              if (!collabEditStart || !collabEditEnd) return
                              setCollabLoading(conf.id)
                              const r = await editCollaborationTime(conf.id, collabEditStart, collabEditEnd)
                              if (r.success) setCollabConfirms(prev => prev.map(c => c.id === conf.id ? { ...c, status: 'edited_confirmed', confirmed_start_time: collabEditStart, confirmed_end_time: collabEditEnd } : c))
                              setCollabLoading(null); setCollabEditId(null)
                            }} style={{ flex: 1, padding: "7px", borderRadius: 8, background: "#6366F1", color: "#fff", fontSize: 12, fontWeight: 700, border: "none", cursor: "pointer" }}>
                              {loading ? "Saving…" : "Save My Time"}
                            </button>
                            <button onClick={() => setCollabEditId(null)} style={{ padding: "7px 12px", borderRadius: 8, background: "#F5F6FA", color: "#374151", fontSize: 12, fontWeight: 700, border: "none", cursor: "pointer" }}>Cancel</button>
                          </div>
                        </div>
                      ) : isRejecting ? (
                        <div style={{ display: "flex", flexDirection: "column", gap: 8, padding: "10px", background: "#fff", borderRadius: 10, border: "1px solid rgba(239,68,68,0.2)" }}>
                          <div style={{ fontSize: 11, fontWeight: 700, color: "#374151" }}>Reason (optional):</div>
                          <input value={collabRejectReason} onChange={e => setCollabRejectReason(e.target.value)} placeholder="I was not involved in this task"
                            style={{ border: "1px solid #EBEDF2", borderRadius: 8, padding: "7px 10px", fontSize: 12, outline: "none" }}/>
                          <div style={{ display: "flex", gap: 6 }}>
                            <button disabled={loading} onClick={async () => {
                              setCollabLoading(conf.id)
                              const r = await rejectCollaboration(conf.id, collabRejectReason)
                              if (r.success) setCollabConfirms(prev => prev.filter(c => c.id !== conf.id))
                              setCollabLoading(null); setCollabRejectId(null); setCollabRejectReason("")
                            }} style={{ flex: 1, padding: "7px", borderRadius: 8, background: "#EF4444", color: "#fff", fontSize: 12, fontWeight: 700, border: "none", cursor: "pointer" }}>
                              {loading ? "Rejecting…" : "Reject"}
                            </button>
                            <button onClick={() => setCollabRejectId(null)} style={{ padding: "7px 12px", borderRadius: 8, background: "#F5F6FA", color: "#374151", fontSize: 12, fontWeight: 700, border: "none", cursor: "pointer" }}>Cancel</button>
                          </div>
                        </div>
                      ) : (
                        <div style={{ display: "flex", gap: 6 }}>
                          <button disabled={loading} onClick={async () => {
                            setCollabLoading(conf.id)
                            const r = await confirmCollaboration(conf.id)
                            if (r.success) setCollabConfirms(prev => prev.map(c => c.id === conf.id ? { ...c, status: 'confirmed', confirmed_start_time: c.original_start_time, confirmed_end_time: c.original_end_time, confirmed_hours: c.original_duration_hours } : c))
                            else showToast(r.error ?? "Failed to confirm. Try again.")
                            setCollabLoading(null)
                          }} style={{ flex: 1, padding: "8px", borderRadius: 8, background: "#22C55E", color: "#fff", fontSize: 12, fontWeight: 700, border: "none", cursor: "pointer" }}>
                            {loading ? "…" : "✓ Confirm"}
                          </button>
                          <button disabled={loading} onClick={() => { setCollabEditId(conf.id); setCollabEditStart(conf.original_start_time ?? ""); setCollabEditEnd(conf.original_end_time ?? "") }}
                            style={{ flex: 1, padding: "8px", borderRadius: 8, background: "#6366F1", color: "#fff", fontSize: 12, fontWeight: 700, border: "none", cursor: "pointer" }}>
                            ✏ Edit Time
                          </button>
                          <button disabled={loading} onClick={() => setCollabRejectId(conf.id)}
                            style={{ flex: 1, padding: "8px", borderRadius: 8, background: "#FEE2E2", color: "#DC2626", fontSize: 12, fontWeight: 700, border: "none", cursor: "pointer" }}>
                            ✗ Reject
                          </button>
                        </div>
                      )}
                    </div>
                  )
                })}

                {/* placeholder – collaborated section moved above own entries */}
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
                {(isFreelancerMedia ? [
                  { label:"Working Hours",    value: fmtH(stats.mediaWorkH),              dot:"#22C55E" },
                  { label:"Avg Working Hrs",  value: fmtH(stats.avgH),                    dot: stats.avgH >= 8.5 ? "#22C55E" : "#EF4444", isAvg: true },
                  { label:"Total Shoots",     value: String(stats.shootCount),             dot:"#EF4444" },
                  { label:"Videos Edited",    value: String(stats.editCount),              dot:"#6366F1" },
                  { label:"Learning Hours",   value: fmtH(stats.totalLearning),           dot:"#A78BFA" },
                  { label:"Travel Hours",     value: fmtH(stats.travelH),                 dot:"#F59E0B" },
                  { label:"Days Submitted",   value: String(stats.daysSubmitted),          dot:"#059669" },
                ] : stats.isMedia ? [
                  { label:"Working Hours",    value: fmtH(stats.mediaWorkH),              dot:"#22C55E" },
                  { label:"Avg Working Hrs",  value: fmtH(stats.avgH),                    dot: stats.avgH >= 8.5 ? "#22C55E" : "#EF4444", isAvg: true },
                  { label:"Total Shoots",     value: String(stats.shootCount),             dot:"#EF4444" },
                  { label:"Videos Edited",    value: String(stats.editCount),              dot:"#6366F1" },
                  { label:"Learning Hours",   value: fmtH(stats.totalLearning),           dot:"#A78BFA" },
                  { label:"Travel Hours",     value: fmtH(stats.travelH),                 dot:"#F59E0B" },
                  { label:"Break Hours",      value: fmtH(stats.totalBreak),              dot:"#78716C" },
                  { label:"Present Days",     value: String(stats.presentDays),            dot:"#059669" },
                  { label:"Leave Days",       value: String(stats.leaveDays),              dot:"#F97316" },
                  { label:"Office Holidays",  value: String(stats.holidayDays),            dot:"#9CA3AF" },
                  { label:"Overtime",         value: fmtH(stats.totalOT),                 dot:"#FACC15" },
                  ...(everTypes.has("other_activity") ? [{ label:"Other", value: fmtH(stats.otherActivityH), dot:"#6B7280" }] : []),
                ] : [
                  { label:"Working Hours",    value: fmtH(stats.nonMediaWorkH),                        dot:"#22C55E" },
                  { label:"Avg Working Hrs",  value: fmtH(stats.avgH),                                 dot: stats.avgH >= 8.5 ? "#22C55E" : "#EF4444", isAvg: true },
                  ...(everTypes.has("other") ? [{ label:"Technical", value: fmtH(stats.otherH), dot:"#3B82F6" }] : []),
                  ...(everTypes.has("poster") ? [{ label:"Posters", value: String(stats.posterCount), dot:"#EC4899" }] : []),
                  ...(everTypes.has("voiceover") ? [{ label:"Voiceovers", value: String(stats.voiceoverCount), dot:"#8B5CF6" }] : []),
                  ...(everTypes.has("edit") ? [{ label:"Editing", value: String(stats.editCount), dot:"#0D9488" }] : []),
                  ...(everTypes.has("scripting") ? [{ label:"Scripting", value: fmtH(stats.scriptingH), dot:"#EAB308" }] : []),
                  ...(everTypes.has("development") ? [{ label:"Development", value: fmtH(stats.developmentH), dot:"#6366F1" }] : []),
                  { label:"Learning Hours",   value: fmtH(stats.totalLearning),                         dot:"#6366F1" },
                  ...(everTypes.has("other_activity") ? [{ label:"Other", value: fmtH(stats.otherActivityH), dot:"#6B7280" }] : []),
                  { label:"Break Hours",      value: fmtH(stats.totalBreak),                            dot:"#78716C" },
                  { label:"Present Days",     value: String(stats.presentDays),                          dot:"#059669" },
                  { label:"Leave Days",       value: String(stats.leaveDays),                            dot:"#F97316" },
                  { label:"Office Holidays",  value: String(stats.holidayDays),                          dot:"#9CA3AF" },
                  { label:"Overtime",         value: fmtH(stats.totalOT),                                dot:"#FACC15" },
                ] as { label: string; value: string; dot: string; isAvg?: boolean }[]).map((r, i, arr) => (
                  <div key={r.label} style={{ display:"flex", alignItems:"center", justifyContent:"space-between", padding:"9px 0", borderBottom: i < arr.length - 1 ? "1px solid #F5F6FA" : "none" }}>
                    <div style={{ display:"flex", alignItems:"center", gap:7 }}>
                      <div style={{ width:8, height:8, borderRadius:"50%", background:r.dot, flexShrink:0 }}/>
                      <span style={{ fontSize:11, color:"#6B7280" }}>{r.label}</span>
                    </div>
                    {r.isAvg ? (
                      <div style={{ display:"flex", alignItems:"center", gap:4 }}>
                        <span style={{ fontSize:12, fontWeight:800, color:"#111111" }}>{r.value}</span>
                        <span style={{ fontSize:14, fontWeight:900, color: stats.avgH >= 8.5 ? "#22C55E" : "#EF4444" }}>{stats.avgH >= 8.5 ? "↑" : "↓"}</span>
                      </div>
                    ) : (
                      <span style={{ fontSize:12, fontWeight:800, color:"#111111" }}>{r.value}</span>
                    )}
                  </div>
                ))}
              </div>
            </div>

          </div>
        </div>


      </div>
    </div>
  )
}
