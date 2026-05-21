"use client"

import { useState, useTransition, useMemo, useEffect, useRef } from "react"
import { useRouter } from "next/navigation"
import Image from "next/image"
import {
  Camera, Film, Plus, Trash2, CheckCircle2,
  Loader2, SendHorizonal, Clock, BookOpen,
  ChevronDown, Upload, Link2, Zap, BarChart2, MoreHorizontal,
} from "lucide-react"
import { submitDailyUpdate } from "@/lib/actions/daily-updates"

interface Project { id: string; business_name: string }

interface ShootEntry {
  id: string; clientName: string; title: string
  startTime: string; endTime: string; durationHours: number
  notes: string; videoUploaded: boolean
}
interface EditEntry {
  id: string; clientName: string; title: string
  videoType: string; videoDuration: string
  dateGiven: string; dateFinished: string
  timeTaken: number; driveUpdated: boolean
  revisions: number; videoLink: string; notes: string
}
interface TimeBlock {
  id: string; startTime: string; endTime: string
  durationHours: number; description: string
  projectName: string; status: "completed" | "in_progress" | "not_started"
  isMultiClient: boolean; clientNames: string[]
}

// 15-min intervals: 6:00–7:00, then 9:00–22:00
const TIME_OPTIONS_15 = [
  ...Array.from({ length: 5 }, (_, i) => {
    const mins = 6 * 60 + i * 15
    return `${String(Math.floor(mins / 60)).padStart(2, "0")}:${String(mins % 60).padStart(2, "0")}`
  }),
  ...Array.from({ length: 53 }, (_, i) => {
    const mins = 9 * 60 + i * 15
    return `${String(Math.floor(mins / 60)).padStart(2, "0")}:${String(mins % 60).padStart(2, "0")}`
  }),
]

const TIME_OPTIONS = [
  "07:00","07:30","08:00","08:30","09:00","09:30","10:00","10:30","11:00","11:30",
  "12:00","12:30","13:00","13:30","14:00","14:30","15:00","15:30","16:00","16:30",
  "17:00","17:30","18:00","18:30","19:00","19:30","20:00","20:30","21:00","21:30","22:00",
]

function fmt12(t: string) {
  if (!t) return ""
  const [h, m] = t.split(":").map(Number)
  return `${h % 12 || 12}:${String(m).padStart(2, "0")} ${h >= 12 ? "PM" : "AM"}`
}
function calcDuration(start: string, end: string) {
  if (!start || !end) return 0
  const [sh, sm] = start.split(":").map(Number)
  const [eh, em] = end.split(":").map(Number)
  const diff = (eh * 60 + em) - (sh * 60 + sm)
  return diff > 0 ? Math.round((diff / 60) * 10) / 10 : 0
}

const F: React.CSSProperties = {
  background: "#F9FAFB", border: "1.5px solid #EBEDF2", color: "#111827",
  borderRadius: 10, padding: "9px 12px", fontSize: 13, outline: "none", width: "100%",
}

function DurationPicker({ value, onChange }: { value: number; onChange: (v: number) => void }) {
  const steps = [1,1.5,2,2.5,3,3.5,4,4.5,5,6,7,8]
  return (
    <select value={value} onChange={e => onChange(Number(e.target.value))} style={{ ...F, width:"auto", minWidth:80 }}>
      {steps.map(s => <option key={s} value={s}>{s}h</option>)}
    </select>
  )
}

const DRAFT_KEY = "gf_daily_update_draft"
function getTodayStr() { return new Date().toLocaleDateString("en-CA") }
function loadDraft(): TimeBlock[] {
  try {
    const raw = typeof window !== "undefined" ? localStorage.getItem(DRAFT_KEY) : null
    if (!raw) return []
    const parsed = JSON.parse(raw) as { date?: string; blocks?: TimeBlock[] }
    if (parsed.date !== getTodayStr()) { localStorage.removeItem(DRAFT_KEY); return [] }
    return Array.isArray(parsed.blocks) ? parsed.blocks : []
  } catch { return [] }
}

type SavedEntry = {
  id?: string; task_type: string; title: string
  client_name?: string; is_multi_client?: boolean; client_names?: string[]
  start_time?: string | null; end_time?: string | null
  duration_hours?: number; notes?: string | null
}

function parseExistingBlocks(existingUpdate: Record<string, unknown>): TimeBlock[] {
  const entries = existingUpdate?.work_entries as SavedEntry[] | null
  if (!Array.isArray(entries)) return []
  return entries
    .filter(e => e.task_type === 'other')
    .map(e => ({
      id: e.id ?? crypto.randomUUID(),
      startTime: e.start_time ?? '09:00',
      endTime: e.end_time ?? '10:00',
      durationHours: e.duration_hours ?? 1,
      description: e.title ?? '',
      projectName: e.is_multi_client ? '' : (e.client_name === 'Internal' ? '' : (e.client_name ?? '')),
      status: (() => {
        const rawStatus = e.notes?.replace(/^\[/, '').replace(/\]$/, '') ?? ''
        const VALID = ['completed', 'in_progress', 'not_started'] as const
        return (VALID.includes(rawStatus as TimeBlock['status']) ? rawStatus : 'not_started') as TimeBlock['status']
      })(),
      isMultiClient: e.is_multi_client ?? false,
      clientNames: e.client_names ?? [],
    }))
}

// ═══════════════════════════════════════════════════════════════════════════════
export default function DailyUpdateForm({
  projects, userName, team, existingUpdate,
}: {
  projects: Project[]; userName: string; team?: string | null; existingUpdate?: Record<string, unknown> | null
}) {
  const router = useRouter()
  const existingUpdateRef = useRef(existingUpdate)
  useEffect(() => { existingUpdateRef.current = existingUpdate }, [existingUpdate])
  const [isPending, startTransition] = useTransition()

  const firstName = userName.split(" ")[0] || "there"
  const now       = new Date()
  const h         = now.getHours()
  const greeting  = h < 12 ? "Good morning" : h < 17 ? "Good afternoon" : "Good evening"
  const dateLabel = now.toLocaleDateString("en-US", { weekday:"long", day:"numeric", month:"long", year:"numeric" })

  const isMediaTeam = team === "Media Team"

  const [tab, setTab] = useState<"working" | "media" | "learning">(isMediaTeam ? "media" : "working")

  // ── Shoots (media) ───────────────────────────────────────────────────────
  const [shoots, setShoots] = useState<ShootEntry[]>([])
  const addShoot    = () => setShoots(p => [...p, { id: crypto.randomUUID(), clientName:"", title:"", startTime:"09:00", endTime:"17:00", durationHours:8, notes:"", videoUploaded:false }])
  const patchShoot  = (id: string, patch: Partial<ShootEntry>) => setShoots(p => p.map(s => s.id === id ? { ...s, ...patch } : s))
  const removeShoot = (id: string) => setShoots(p => p.filter(s => s.id !== id))

  const todayStr = new Date().toISOString().split("T")[0]

  // ── Edits (media) ────────────────────────────────────────────────────────
  const [edits, setEdits] = useState<EditEntry[]>([])
  const addEdit    = () => setEdits(p => [...p, {
    id: crypto.randomUUID(), clientName: "", title: "", videoType: "", videoDuration: "",
    dateGiven: todayStr, dateFinished: todayStr, timeTaken: 2,
    driveUpdated: false, revisions: 0, videoLink: "", notes: "",
  }])
  const patchEdit  = (id: string, patch: Partial<EditEntry>) => setEdits(p => p.map(e => e.id === id ? { ...e, ...patch } : e))
  const removeEdit = (id: string) => setEdits(p => p.filter(e => e.id !== id))

  // ── Time blocks (working) ────────────────────────────────────────────────
  const [timeBlocks, setTimeBlocks] = useState<TimeBlock[]>(() =>
    existingUpdate ? parseExistingBlocks(existingUpdate) : loadDraft()
  )
  const addTimeBlock = () => setTimeBlocks(p => [...p, {
    id: crypto.randomUUID(), startTime: "09:00", endTime: "10:00",
    durationHours: 1, description: "", projectName: "", status: "not_started" as const,
    isMultiClient: false, clientNames: [],
  }])
  const patchBlock = (id: string, patch: Partial<TimeBlock>) =>
    setTimeBlocks(p => p.map(b => {
      const updated = { ...b, ...patch }
      if (patch.startTime || patch.endTime) updated.durationHours = calcDuration(updated.startTime, updated.endTime)
      return b.id === id ? updated : b
    }))
  const removeBlock = (id: string) => setTimeBlocks(p => p.filter(b => b.id !== id))

  // ── Learning ─────────────────────────────────────────────────────────────
  const [learningTopic, setLearningTopic] = useState(
    (existingUpdate?.learning_topic as string) ?? ""
  )
  const [learningHours, setLearningHours] = useState(
    (existingUpdate?.learning_hours as number) ?? 1
  )
  const [learningNotes, setLearningNotes] = useState(
    (existingUpdate?.learning_notes as string) ?? ""
  )

  const [error,         setError]         = useState<string | null>(null)
  const [workingError,  setWorkingError]  = useState<string | null>(null)
  const [learningError, setLearningError] = useState<string | null>(null)
  const [submitted,     setSubmitted]     = useState(false)
  const [workingDone,   setWorkingDone]   = useState(!!(existingUpdate && (existingUpdate as Record<string,unknown>).working_hours))
  const [learningDone,  setLearningDone]  = useState(!!(existingUpdate && (existingUpdate as Record<string,unknown>).learning_hours))
  const [editMode,      setEditMode]      = useState(false)
  const [savedIds,      setSavedIds]      = useState<Set<string>>(new Set())

  // Autosave time blocks
  useEffect(() => {
    if (workingDone || existingUpdate) return
    try { localStorage.setItem(DRAFT_KEY, JSON.stringify({ date: getTodayStr(), blocks: timeBlocks })) } catch { /* ignore */ }
  }, [timeBlocks, workingDone, existingUpdate]) // eslint-disable-line react-hooks/exhaustive-deps

  const totalShootHours = useMemo(() => shoots.reduce((s, e) => s + e.durationHours, 0), [shoots])
  const totalEditHours  = useMemo(() => edits.reduce((s, e) => s + e.timeTaken, 0), [edits])
  const totalMediaHours = totalShootHours + totalEditHours
  const totalLoggedHours = useMemo(() => timeBlocks.reduce((s, b) => s + b.durationHours, 0), [timeBlocks])
  const filledBlocks     = timeBlocks.filter(b => b.description.trim())
  const generalProductivity = useMemo(() => {
    if (filledBlocks.length === 0) return 0
    return Math.round((filledBlocks.filter(b => b.status === "completed").length / filledBlocks.length) * 100)
  }, [filledBlocks])

  // ── Submit: working (time blocks) ────────────────────────────────────────
  function handleWorkingSubmit() {
    setWorkingError(null)
    if (filledBlocks.length === 0) { setWorkingError("Add at least one time block with a description."); return }
    const work_entries = filledBlocks.map(t => ({
      id: t.id,
      client_id: projects.find(p => p.business_name === t.projectName)?.id ?? null,
      client_name: t.isMultiClient ? (t.clientNames[0] || "Internal") : (t.projectName || "Internal"),
      client_names: t.isMultiClient ? t.clientNames : (t.projectName ? [t.projectName] : []),
      is_multi_client: t.isMultiClient,
      task_type: "other" as const,
      title: t.description, start_time: t.startTime, end_time: t.endTime,
      duration_hours: t.durationHours, notes: `[${t.status}]`,
      video_uploaded: null, screenshot_url: "", video_link: "", editing_videos: [],
    }))
    startTransition(async () => {
      const res = await submitDailyUpdate({
        active_tab: "working", work_entries, links: [],
        shoot_count: 0, editing_count: 0,
        shoot_time_hours: 0, editing_time_hours: 0, learning_hours: 0,
      })
      if (!res.success) setWorkingError(res.error ?? "Submission failed.")
      else { try { localStorage.removeItem(DRAFT_KEY) } catch { /* ignore */ }; setWorkingDone(true); router.refresh() }
    })
  }

  // ── Submit: media (shoots + edits) ───────────────────────────────────────
  function handleMediaSubmit() {
    setError(null)
    if (shoots.length === 0 && edits.length === 0) { setError("Add at least one shoot or edit entry."); return }
    const work_entries = [
      ...shoots.map(s => ({
        id: s.id, client_id: projects.find(p => p.business_name === s.clientName)?.id ?? null,
        client_name: s.clientName || "Internal", task_type: "shoot" as const,
        title: s.title || "Shoot", start_time: s.startTime, end_time: s.endTime,
        duration_hours: s.durationHours, notes: s.notes, video_uploaded: s.videoUploaded,
        screenshot_url: "", video_link: "", editing_videos: [],
      })),
      ...edits.map(e => ({
        id: e.id, client_id: projects.find(p => p.business_name === e.clientName)?.id ?? null,
        client_name: e.clientName || "Internal", task_type: "edit" as const,
        title: e.title || "Editing", start_time: "", end_time: "",
        duration_hours: e.timeTaken, notes: e.notes, video_uploaded: null,
        screenshot_url: "", video_link: e.videoLink, editing_videos: [],
        video_type: e.videoType, video_duration: e.videoDuration,
        date_given: e.dateGiven, date_finished: e.dateFinished,
        drive_updated: e.driveUpdated, revisions: e.revisions,
      })),
    ]
    startTransition(async () => {
      const res = await submitDailyUpdate({
        active_tab: "media", work_entries, links: [],
        shoot_count: shoots.length, editing_count: edits.length,
        shoot_time_hours: totalShootHours, editing_time_hours: totalEditHours,
        learning_hours: 0,
      })
      if (!res.success) setError(res.error ?? "Submission failed.")
      else { setSubmitted(true); router.refresh() }
    })
  }

  // ── Per-entry save (media) ────────────────────────────────────────────────
  function handleSaveEntry(entryId: string) {
    setError(null)
    const editEntry = edits.find(e => e.id === entryId)
    if (editEntry && !editEntry.videoLink.trim()) { setError("Drive link is required before saving."); return }
    const work_entries = [
      ...shoots.map(s => ({
        id: s.id, client_id: projects.find(p => p.business_name === s.clientName)?.id ?? null,
        client_name: s.clientName || "Internal", task_type: "shoot" as const,
        title: s.title || "Shoot", start_time: s.startTime, end_time: s.endTime,
        duration_hours: s.durationHours, notes: s.notes, video_uploaded: s.videoUploaded,
        screenshot_url: "", video_link: "", editing_videos: [],
      })),
      ...edits.map(e => ({
        id: e.id, client_id: projects.find(p => p.business_name === e.clientName)?.id ?? null,
        client_name: e.clientName || "Internal", task_type: "edit" as const,
        title: e.title || "Editing", start_time: "", end_time: "",
        duration_hours: e.timeTaken, notes: e.notes, video_uploaded: null,
        screenshot_url: "", video_link: e.videoLink, editing_videos: [],
        video_type: e.videoType, video_duration: e.videoDuration,
        date_given: e.dateGiven, date_finished: e.dateFinished,
        drive_updated: e.driveUpdated, revisions: e.revisions,
      })),
    ]
    startTransition(async () => {
      const res = await submitDailyUpdate({
        active_tab: "media", work_entries, links: [],
        shoot_count: shoots.length, editing_count: edits.length,
        shoot_time_hours: totalShootHours, editing_time_hours: totalEditHours,
        learning_hours: 0,
      })
      if (!res.success) setError(res.error ?? "Save failed.")
      else setSavedIds(prev => new Set([...prev, entryId]))
    })
  }

  // ── Submit: learning ─────────────────────────────────────────────────────
  function handleLearningSubmit() {
    setLearningError(null)
    if (!learningTopic.trim()) { setLearningError("Enter what you learned today."); return }
    startTransition(async () => {
      const res = await submitDailyUpdate({
        active_tab: "learning", work_entries: [], links: [],
        shoot_count: 0, editing_count: 0,
        shoot_time_hours: 0, editing_time_hours: 0,
        learning_hours: learningHours,
        learning_topic: learningTopic,
        learning_notes: learningNotes,
      })
      if (!res.success) setLearningError(res.error ?? "Submission failed.")
      else { setLearningDone(true); router.refresh() }
    })
  }

  function handleSubmit() {
    if (tab === "working") handleWorkingSubmit()
    else if (tab === "media") handleMediaSubmit()
    else handleLearningSubmit()
  }

  // ── Section header ────────────────────────────────────────────────────────
  function SectionHead({ icon, label, count, color }: { icon: React.ReactNode; label: string; count: number; color: string }) {
    return (
      <div style={{ display:"flex", alignItems:"center", justifyContent:"space-between", marginBottom:16 }}>
        <div style={{ display:"flex", alignItems:"center", gap:10 }}>
          <div style={{ width:34, height:34, borderRadius:10, background:`${color}18`, display:"flex", alignItems:"center", justifyContent:"center" }}>
            {icon}
          </div>
          <div>
            <p style={{ fontSize:14, fontWeight:800, color:"#111111", margin:0 }}>{label}</p>
            <p style={{ fontSize:10, color:"#9CA3AF", margin:0 }}>{count} entr{count !== 1 ? "ies" : "y"} today</p>
          </div>
        </div>
        <button style={{ background:"none", border:"none", cursor:"pointer", color:"#9CA3AF", padding:4, borderRadius:6, display:"flex" }}>
          <MoreHorizontal size={16} />
        </button>
      </div>
    )
  }

  // ── Already submitted screen ──────────────────────────────────────────────
  const allDone = isMediaTeam ? (submitted || !!existingUpdate) : (workingDone && learningDone)
  if (allDone && !editMode) {
    return (
      <div style={{ background:"#F5F6FA", minHeight:"100vh", display:"flex", alignItems:"center", justifyContent:"center" }}>
        <div style={{ textAlign:"center" }}>
          <CheckCircle2 size={56} style={{ color:"#22C55E", marginBottom:16 }} />
          <p style={{ fontSize:20, fontWeight:900, color:"#111111", margin:"0 0 8px", fontFamily:"var(--font-jakarta)" }}>Daily Update Submitted!</p>
          <p style={{ fontSize:13, color:"#6B7280", margin:"0 0 20px" }}>Great work, {firstName}. See you tomorrow!</p>
          <button onClick={() => {
            setTimeBlocks(parseExistingBlocks(existingUpdateRef.current ?? {}))
            setEditMode(true)
            if (!isMediaTeam) { setWorkingDone(false); setLearningDone(false) }
          }}
            style={{ display:"inline-flex", alignItems:"center", gap:8, padding:"10px 24px", borderRadius:12, border:"1.5px solid #DE1A1A", background:"#FFFFFF", color:"#DE1A1A", fontSize:13, fontWeight:700, cursor:"pointer" }}>
            Edit Today&apos;s Update
          </button>
        </div>
      </div>
    )
  }

  // day progress ring
  const workStart = 9, workEnd = 22, totalWorkHours = workEnd - workStart
  const elapsed = Math.max(0, Math.min(h - workStart, totalWorkHours))
  const dayPct = Math.round((elapsed / totalWorkHours) * 100)
  const ringR = 32, ringCirc = 2 * Math.PI * ringR
  const ringFilled = (dayPct / 100) * ringCirc
  const calDay = now.getDate()
  const calMonth = now.toLocaleDateString("en-US", { month:"short", year:"numeric" })
  const calWeekday = now.toLocaleDateString("en-US", { weekday:"long" })

  // ── TAB CONFIG ────────────────────────────────────────────────────────────
  const ALL_TABS = [
    { id: "working" as const, label: "⏰  Working",  desc: "Log your time blocks" },
    { id: "media"   as const, label: "🎬  Media",    desc: "Shoots & editing" },
    { id: "learning"as const, label: "📚  Learning", desc: "Skills & growth" },
  ]
  const TABS = isMediaTeam
    ? ALL_TABS.filter(t => t.id === "media" || t.id === "learning")
    : ALL_TABS.filter(t => t.id === "working" || t.id === "learning")

  return (
    <div className="p-4 md:p-6" style={{ background:"#F5F6FA", minHeight:"100vh" }}>

      {/* ── HEADER ────────────────────────────────────────────────────────── */}
      <div style={{ background:"linear-gradient(135deg, #DE1A1A 0%, #8B1212 55%, #1A0808 100%)", borderRadius:20, padding:"18px 24px", display:"flex", alignItems:"center", justifyContent:"space-between", gap:16, boxShadow:"0 8px 32px rgba(180,0,0,0.35)", flexWrap:"wrap", position:"relative", overflow:"hidden", marginBottom:20 }}>
        <div style={{ position:"absolute", top:-50, right:-30, width:200, height:200, borderRadius:"50%", background:"rgba(255,255,255,0.05)", pointerEvents:"none" }} />
        <div style={{ position:"absolute", bottom:-40, left:60, width:150, height:150, borderRadius:"50%", background:"rgba(255,255,255,0.04)", pointerEvents:"none" }} />

        <div style={{ flexShrink:0, position:"relative", zIndex:1 }}>
          <span style={{ display:"inline-flex", alignItems:"center", gap:6, fontSize:11, fontWeight:700, padding:"4px 12px", borderRadius:99, background:"rgba(255,255,255,0.15)", color:"#fff", marginBottom:10, border:"1px solid rgba(255,255,255,0.2)", letterSpacing:"0.04em" }}>
            ⭐ Daily Update
          </span>
          <h1 style={{ fontSize:26, fontWeight:900, color:"#fff", fontFamily:"var(--font-jakarta)", margin:"0 0 3px" }}>Daily Update</h1>
          <p style={{ fontSize:11, color:"rgba(255,255,255,0.65)", margin:0 }}>{dateLabel}</p>
        </div>

        <div style={{ display:"flex", alignItems:"center", borderRadius:16, overflow:"hidden", background:"rgba(255,255,255,0.12)", border:"1px solid rgba(255,255,255,0.2)", flex:1, maxWidth:340, position:"relative", zIndex:1 }}>
          <div style={{ position:"relative", width:70, height:80, flexShrink:0 }}>
            <Image src="/brand/assistant-girl.jpg" alt="" fill style={{ objectFit:"cover", objectPosition:"top center" }} />
          </div>
          <div style={{ padding:"10px 16px" }}>
            <p style={{ fontSize:13, fontWeight:800, color:"#fff", margin:"0 0 3px", fontFamily:"var(--font-jakarta)" }}>{greeting}, {firstName}! 👋</p>
            <p style={{ fontSize:11, color:"rgba(255,255,255,0.7)", margin:0 }}>What did you work on today?</p>
          </div>
        </div>

        <div style={{ background:"rgba(255,255,255,0.12)", border:"1px solid rgba(255,255,255,0.2)", borderRadius:16, padding:"12px 18px", textAlign:"center", flexShrink:0, position:"relative", zIndex:1 }}>
          <p style={{ fontSize:10, color:"rgba(255,255,255,0.6)", margin:"0 0 4px", fontWeight:600, textTransform:"uppercase", letterSpacing:"0.08em" }}>{calMonth}</p>
          <p style={{ fontSize:32, fontWeight:900, color:"#fff", margin:"0 0 2px", lineHeight:1, fontFamily:"var(--font-jakarta)" }}>{calDay}</p>
          <p style={{ fontSize:10, color:"rgba(255,255,255,0.7)", margin:0, fontWeight:600 }}>{calWeekday}</p>
        </div>

        <div style={{ display:"flex", flexDirection:"column", alignItems:"center", gap:6, flexShrink:0, position:"relative", zIndex:1 }}>
          <div style={{ position:"relative", width:80, height:80 }}>
            <svg viewBox="0 0 80 80" width="80" height="80">
              <circle cx="40" cy="40" r={ringR} fill="none" stroke="rgba(255,255,255,0.2)" strokeWidth="8" />
              <circle cx="40" cy="40" r={ringR} fill="none" stroke="#FACC15" strokeWidth="8"
                strokeDasharray={`${ringFilled} ${ringCirc}`} strokeLinecap="round"
                transform="rotate(-90 40 40)" style={{ transition:"stroke-dasharray 0.5s ease" }} />
            </svg>
            <div style={{ position:"absolute", inset:0, display:"flex", alignItems:"center", justifyContent:"center" }}>
              <span style={{ fontSize:15, fontWeight:900, color:"#fff" }}>{dayPct}%</span>
            </div>
          </div>
          <div style={{ textAlign:"center" }}>
            <p style={{ fontSize:10, fontWeight:700, color:"rgba(255,255,255,0.85)", margin:"0 0 1px" }}>Day Progress</p>
            <p style={{ fontSize:9, color:"rgba(255,255,255,0.55)", margin:0 }}>{elapsed}/{totalWorkHours} hrs</p>
          </div>
        </div>
      </div>

      {/* ── TABS (media team only) ────────────────────────────────────────── */}
      {isMediaTeam && (
        <div style={{ display:"flex", gap:8, marginBottom:20, flexWrap:"wrap" }}>
          {TABS.map(t => (
            <button key={t.id} onClick={() => { setTab(t.id); setError(null) }}
              style={{ display:"flex", flexDirection:"column", alignItems:"flex-start", padding:"12px 20px", borderRadius:14, cursor:"pointer", transition:"all 0.18s", flex:"1 1 120px",
                background: tab === t.id ? "#DE1A1A" : "#FFFFFF",
                color:      tab === t.id ? "#fff"    : "#6B7280",
                boxShadow:  tab === t.id ? "0 4px 18px rgba(222,26,26,0.4)" : "0 1px 4px rgba(0,0,0,0.06)",
                border:     tab === t.id ? "none" : "1px solid #EBEDF2",
              }}>
              <span style={{ fontSize:14, fontWeight:800 }}>{t.label}</span>
              <span style={{ fontSize:10, opacity:0.7, marginTop:2 }}>{t.desc}</span>
            </button>
          ))}
        </div>
      )}

      {/* ── MAIN GRID ─────────────────────────────────────────────────────── */}
      <div className="grid grid-cols-1 lg:grid-cols-[1fr_280px] gap-[18px] items-start">

        {/* ── LEFT ─────────────────────────────────────────────────────────── */}
        <div style={{ display:"flex", flexDirection:"column", gap:16 }}>

          {/* Two-step progress indicator (non-media team only) */}
          {!isMediaTeam && (
            <div style={{ display:"flex", alignItems:"center", gap:8 }}>
              <div style={{ display:"flex", alignItems:"center", gap:6, padding:"8px 14px", borderRadius:12, flex:1, justifyContent:"center",
                background: workingDone ? "rgba(34,197,94,0.08)" : "#F8F9FC",
                border: workingDone ? "1.5px solid rgba(34,197,94,0.3)" : "1.5px solid #EBEDF2" }}>
                <div style={{ width:16, height:16, borderRadius:"50%", display:"flex", alignItems:"center", justifyContent:"center", flexShrink:0,
                  background: workingDone ? "#22C55E" : "#E5E7EB" }}>
                  {workingDone && <span style={{ fontSize:9, color:"#fff", fontWeight:900 }}>✓</span>}
                </div>
                <span style={{ fontSize:11, fontWeight:700, color: workingDone ? "#16A34A" : "#9CA3AF" }}>
                  {workingDone ? "Work Log ✓" : "Work Log"}
                </span>
              </div>
              <div style={{ display:"flex", alignItems:"center", gap:6, padding:"8px 14px", borderRadius:12, flex:1, justifyContent:"center",
                background: learningDone ? "rgba(34,197,94,0.08)" : "#F8F9FC",
                border: learningDone ? "1.5px solid rgba(34,197,94,0.3)" : "1.5px solid #EBEDF2" }}>
                <div style={{ width:16, height:16, borderRadius:"50%", display:"flex", alignItems:"center", justifyContent:"center", flexShrink:0,
                  background: learningDone ? "#22C55E" : "#E5E7EB" }}>
                  {learningDone && <span style={{ fontSize:9, color:"#fff", fontWeight:900 }}>✓</span>}
                </div>
                <span style={{ fontSize:11, fontWeight:700, color: learningDone ? "#16A34A" : "#9CA3AF" }}>
                  {learningDone ? "Learning ✓" : "Learning"}
                </span>
              </div>
            </div>
          )}

          {/* ══ WORKING: Time Blocks ══════════════════════════════════════════ */}
          {(!isMediaTeam || tab === "working") && (
            <div style={{ background:"#FFFFFF", borderRadius:20, border:"1px solid #EBEDF2", padding:"20px 22px", boxShadow:"0 2px 10px rgba(0,0,0,0.05)" }}>
              <div style={{ display:"flex", alignItems:"center", justifyContent:"space-between", marginBottom:20 }}>
                <div style={{ display:"flex", alignItems:"center", gap:10 }}>
                  <div style={{ width:34, height:34, borderRadius:10, background:"rgba(222,26,26,0.1)", display:"flex", alignItems:"center", justifyContent:"center" }}>
                    <Clock size={16} style={{ color:"#DE1A1A" }} />
                  </div>
                  <div>
                    <p style={{ fontSize:14, fontWeight:800, color:"#111111", margin:0 }}>Today&apos;s Time Log</p>
                    <p style={{ fontSize:10, color:"#9CA3AF", margin:0 }}>{filledBlocks.length} {filledBlocks.length === 1 ? "block" : "blocks"} · {totalLoggedHours.toFixed(1)}h logged</p>
                  </div>
                </div>
                <button onClick={addTimeBlock}
                  style={{ display:"flex", alignItems:"center", gap:6, padding:"8px 16px", borderRadius:10, border:"none", background:"#DE1A1A", color:"#FFFFFF", fontSize:12, fontWeight:700, cursor:"pointer" }}>
                  <Plus size={13} /> Add Time Block
                </button>
              </div>

              {timeBlocks.length === 0 ? (
                <div style={{ display:"flex", flexDirection:"column", alignItems:"center", justifyContent:"center", padding:"48px 24px", border:"2px dashed #E5E7EB", borderRadius:16, background:"#FAFBFC" }}>
                  <span style={{ fontSize:36, marginBottom:12 }}>⏰</span>
                  <p style={{ fontSize:13, fontWeight:700, color:"#374151", margin:"0 0 4px" }}>No time blocks yet</p>
                  <p style={{ fontSize:12, color:"#9CA3AF", margin:"0 0 16px", textAlign:"center" }}>Click &quot;Add Time Block&quot; to log your work.</p>
                  <button onClick={addTimeBlock}
                    style={{ display:"flex", alignItems:"center", gap:6, padding:"10px 22px", borderRadius:12, border:"none", background:"#DE1A1A", color:"#FFFFFF", fontSize:12, fontWeight:700, cursor:"pointer" }}>
                    <Plus size={13} /> Add First Block
                  </button>
                </div>
              ) : (
                <div style={{ display:"flex", flexDirection:"column", gap:10 }}>
                  {timeBlocks.map(block => {
                    const statusCfg = block.status === "completed"
                      ? { bg:"rgba(34,197,94,0.08)", color:"#16A34A", border:"rgba(34,197,94,0.25)" }
                      : block.status === "in_progress"
                      ? { bg:"rgba(245,158,11,0.08)", color:"#D97706", border:"rgba(245,158,11,0.25)" }
                      : { bg:"#F9FAFB", color:"#9CA3AF", border:"#E5E7EB" }
                    return (
                      <div key={block.id} style={{ background:"#F9FAFB", borderRadius:14, border:"1px solid #EBEDF2", padding:"12px 14px", display:"flex", flexDirection:"column", gap:10 }}>
                        <div style={{ display:"flex", alignItems:"center", gap:8, flexWrap:"wrap" }}>
                          <Clock size={13} style={{ color:"#DE1A1A", flexShrink:0 }} />
                          <select value={block.startTime} onChange={e => patchBlock(block.id, { startTime: e.target.value })}
                            style={{ fontSize:12, fontWeight:700, color:"#111827", background:"#FFFFFF", border:"1.5px solid #EBEDF2", borderRadius:8, padding:"5px 8px", cursor:"pointer", outline:"none" }}>
                            {TIME_OPTIONS_15.map(t => <option key={t} value={t}>{fmt12(t)}</option>)}
                          </select>
                          <span style={{ fontSize:11, color:"#9CA3AF" }}>to</span>
                          <select value={block.endTime} onChange={e => patchBlock(block.id, { endTime: e.target.value })}
                            style={{ fontSize:12, fontWeight:700, color:"#111827", background:"#FFFFFF", border:"1.5px solid #EBEDF2", borderRadius:8, padding:"5px 8px", cursor:"pointer", outline:"none" }}>
                            {TIME_OPTIONS_15.map(t => <option key={t} value={t}>{fmt12(t)}</option>)}
                          </select>
                          {block.durationHours > 0 && (
                            <span style={{ fontSize:10, fontWeight:700, padding:"3px 8px", borderRadius:99, background:"rgba(99,102,241,0.1)", color:"#6366F1" }}>{block.durationHours}h</span>
                          )}
                          <button onClick={() => removeBlock(block.id)} style={{ marginLeft:"auto", background:"none", border:"none", cursor:"pointer", padding:4, borderRadius:8, display:"flex" }}>
                            <Trash2 size={13} style={{ color:"#EF4444" }} />
                          </button>
                        </div>
                        <div style={{ display:"flex", alignItems:"center", gap:8, flexWrap:"wrap" }}>
                          <input value={block.description} onChange={e => patchBlock(block.id, { description: e.target.value })}
                            placeholder="What did you work on?"
                            style={{ flex:1, minWidth:140, background:"#FFFFFF", border:"1.5px solid #EBEDF2", borderRadius:8, padding:"7px 10px", fontSize:12, color:"#111827", outline:"none" }} />
                          <select value={block.projectName} onChange={e => patchBlock(block.id, { projectName: e.target.value })}
                            style={{ fontSize:11, fontWeight:700, color: block.projectName ? "#DE1A1A" : "#9CA3AF", background: block.projectName ? "rgba(222,26,26,0.06)" : "#FFFFFF", border:"1.5px solid #EBEDF2", borderRadius:8, padding:"7px 10px", cursor:"pointer", outline:"none" }}>
                            <option value="">Project</option>
                            <option value="GroFast (Internal)">GroFast (Internal)</option>
                            {projects.map(p => <option key={p.id} value={p.business_name}>{p.business_name}</option>)}
                          </select>
                          <select value={block.status} onChange={e => patchBlock(block.id, { status: e.target.value as TimeBlock["status"] })}
                            style={{ fontSize:11, fontWeight:700, color:statusCfg.color, background:statusCfg.bg, border:`1.5px solid ${statusCfg.border}`, borderRadius:8, padding:"7px 10px", cursor:"pointer", outline:"none" }}>
                            <option value="not_started">Not Started</option>
                            <option value="in_progress">In Progress</option>
                            <option value="completed">Completed ✓</option>
                          </select>
                        </div>
                        <div>
                          <label style={{ display:"flex", alignItems:"center", gap:6, cursor:"pointer", fontSize:11, fontWeight:600, color:"#374151" }}>
                            <input type="checkbox" checked={block.isMultiClient}
                              onChange={e => patchBlock(block.id, { isMultiClient: e.target.checked, clientNames: [] })}
                              style={{ accentColor:"#de1a1a" }} />
                            Split cost across multiple clients
                          </label>
                          {block.isMultiClient && (
                            <div style={{ marginTop:8 }}>
                              <p style={{ fontSize:10, fontWeight:700, color:"#9CA3AF", textTransform:"uppercase", letterSpacing:"0.1em", marginBottom:6 }}>Select clients (cost split equally)</p>
                              <div style={{ display:"flex", flexWrap:"wrap", gap:6 }}>
                                {projects.map(p => {
                                  const selected = block.clientNames.includes(p.business_name)
                                  return (
                                    <button key={p.id} type="button"
                                      onClick={() => { const next = selected ? block.clientNames.filter(n => n !== p.business_name) : [...block.clientNames, p.business_name]; patchBlock(block.id, { clientNames: next }) }}
                                      style={{ padding:"4px 10px", borderRadius:20, fontSize:11, fontWeight:600, cursor:"pointer", border:`1.5px solid ${selected ? "#de1a1a" : "#EBEDF2"}`, background: selected ? "rgba(222,26,26,0.08)" : "#F9FAFB", color: selected ? "#de1a1a" : "#6B7280" }}>
                                      {p.business_name}
                                    </button>
                                  )
                                })}
                              </div>
                              {block.clientNames.length > 1 && (
                                <p style={{ fontSize:10, color:"#9CA3AF", marginTop:5 }}>{block.durationHours}h ÷ {block.clientNames.length} clients = {(block.durationHours / block.clientNames.length).toFixed(2)}h each</p>
                              )}
                            </div>
                          )}
                        </div>
                      </div>
                    )
                  })}
                </div>
              )}

              {/* Submit button for non-media team */}
              {!isMediaTeam && (
                <div style={{ marginTop:16, paddingTop:14, borderTop:"1px solid #EBEDF2", display:"flex", alignItems:"center", justifyContent:"space-between", gap:12 }}>
                  <div>
                    {workingError && <p style={{ fontSize:12, fontWeight:600, color:"#DE1A1A", margin:0 }}>{workingError}</p>}
                    {!workingError && <p style={{ fontSize:12, color:"#9CA3AF", margin:0 }}>{filledBlocks.length} block{filledBlocks.length !== 1 ? "s" : ""} · {totalLoggedHours.toFixed(1)}h logged</p>}
                  </div>
                  {workingDone ? (
                    <span style={{ fontSize:12, fontWeight:700, color:"#22C55E", display:"flex", alignItems:"center", gap:6 }}>
                      <CheckCircle2 size={14} /> Submitted ✓
                    </span>
                  ) : (
                    <button onClick={handleWorkingSubmit} disabled={isPending}
                      style={{ display:"flex", alignItems:"center", gap:8, padding:"11px 24px", borderRadius:14, fontSize:13, fontWeight:700, border:"none", cursor:isPending?"not-allowed":"pointer", opacity:isPending?0.7:1, background:"#DE1A1A", color:"#fff", boxShadow:"0 4px 14px rgba(222,26,26,0.4)" }}>
                      {isPending ? <Loader2 size={14} className="animate-spin" /> : <SendHorizonal size={14} />}
                      {isPending ? "Submitting…" : "Submit Work Log"}
                    </button>
                  )}
                </div>
              )}
              {!isMediaTeam && (
                <p style={{ fontSize:11, marginTop:6, color:"#9CA3AF" }}>
                  Saved entries appear in your{" "}
                  <a href="/member/history" style={{ color:"#6366F1", fontWeight:600 }}>History tab ↗</a>
                </p>
              )}
            </div>
          )}

          {/* ══ MEDIA TAB: Shoots + Edits ═════════════════════════════════════ */}
          {tab === "media" && (<>

            {/* ── Media Stats Row ─────────────────────────────────────────── */}
            <div style={{ display:"grid", gridTemplateColumns:"repeat(4, 1fr)", gap:10 }}>
              {[
                { label:"HRS WORKED",   value:`${totalMediaHours}h`,    color:"#DE1A1A", bg:"rgba(222,26,26,0.07)",   icon:"⏱️" },
                { label:"HRS LEARN",    value:`${learningHours}h`,      color:"#10B981", bg:"rgba(16,185,129,0.07)",  icon:"📚" },
                { label:"HRS SHOOTING", value:`${totalShootHours}h`,    color:"#EF4444", bg:"rgba(239,68,68,0.07)",   icon:"🎥" },
                { label:"EDITED COUNT", value:`${edits.length}`,        color:"#6366F1", bg:"rgba(99,102,241,0.07)",  icon:"🎬" },
              ].map(s => (
                <div key={s.label} style={{ background:"#FFFFFF", borderRadius:16, border:`1.5px solid ${s.color}22`, padding:"14px 12px", textAlign:"center", boxShadow:"0 2px 8px rgba(0,0,0,0.04)" }}>
                  <div style={{ fontSize:20, marginBottom:4 }}>{s.icon}</div>
                  <p style={{ fontSize:20, fontWeight:900, color:s.color, margin:"0 0 3px", fontFamily:"var(--font-jakarta)", lineHeight:1 }}>{s.value}</p>
                  <p style={{ fontSize:9, fontWeight:800, color:"#9CA3AF", margin:0, textTransform:"uppercase", letterSpacing:"0.08em" }}>{s.label}</p>
                </div>
              ))}
            </div>

            {/* Shoots */}
            <div style={{ background:"#FFFFFF", borderRadius:20, border:"1px solid #EBEDF2", padding:"20px 22px", boxShadow:"0 2px 10px rgba(0,0,0,0.05)" }}>
              <SectionHead icon={<Camera size={16} style={{ color:"#EF4444" }} />} label="Shoots Today" count={shoots.length} color="#EF4444" />
              {shoots.length === 0 ? (
                <div onClick={addShoot} style={{ display:"flex", flexDirection:"column", alignItems:"center", justifyContent:"center", gap:14, padding:"32px 0", borderRadius:16, border:"2px dashed #FECACA", background:"rgba(239,68,68,0.02)", cursor:"pointer" }}>
                  <div style={{ position:"relative", width:180, height:140 }}>
                    <Image src="/brand/shoot-illustration.png" alt="Shoots" fill style={{ objectFit:"contain" }} />
                  </div>
                  <p style={{ fontSize:13, fontWeight:600, color:"#9CA3AF", margin:0 }}>No shoots logged yet</p>
                  <span style={{ fontSize:12, color:"#FFFFFF", fontWeight:700, background:"#DE1A1A", padding:"9px 22px", borderRadius:10, boxShadow:"0 4px 14px rgba(222,26,26,0.35)" }}>+ Add shoot</span>
                </div>
              ) : (
                <div style={{ display:"flex", flexDirection:"column", gap:12 }}>
                  {shoots.map((s, i) => (
                    <div key={s.id} style={{ background:"#FAFBFC", borderRadius:14, border:"1px solid #F0F1F5", padding:"14px 16px" }}>
                      <div style={{ display:"flex", alignItems:"center", justifyContent:"space-between", marginBottom:12 }}>
                        <span style={{ fontSize:11, fontWeight:800, color:"#EF4444", textTransform:"uppercase", letterSpacing:"0.1em" }}>Shoot #{i + 1}</span>
                        <button onClick={() => removeShoot(s.id)} style={{ width:26, height:26, borderRadius:8, background:"rgba(239,68,68,0.08)", border:"none", cursor:"pointer", display:"flex", alignItems:"center", justifyContent:"center" }}>
                          <Trash2 size={12} style={{ color:"#EF4444" }} />
                        </button>
                      </div>
                      <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:10, marginBottom:10 }}>
                        <div>
                          <label style={{ display:"block", fontSize:10, fontWeight:700, color:"#374151", textTransform:"uppercase", letterSpacing:"0.1em", marginBottom:5 }}>Client / Project *</label>
                          {projects.length > 0 ? (
                            <div style={{ position:"relative" }}>
                              <select value={s.clientName} onChange={e => patchShoot(s.id, { clientName: e.target.value })} style={{ ...F, paddingRight:28, appearance:"none" }}>
                                <option value="">Select project…</option>
                                {projects.map(p => <option key={p.id} value={p.business_name}>{p.business_name}</option>)}
                              </select>
                              <ChevronDown size={11} style={{ position:"absolute", right:10, top:"50%", transform:"translateY(-50%)", color:"#9CA3AF", pointerEvents:"none" }} />
                            </div>
                          ) : (
                            <input value={s.clientName} onChange={e => patchShoot(s.id, { clientName: e.target.value })} placeholder="Client name…" style={F} />
                          )}
                        </div>
                        <div>
                          <label style={{ display:"block", fontSize:10, fontWeight:700, color:"#374151", textTransform:"uppercase", letterSpacing:"0.1em", marginBottom:5 }}>Shoot Type / Title *</label>
                          <input value={s.title} onChange={e => patchShoot(s.id, { title: e.target.value })} placeholder="e.g. Basketball Tournament Shoot" style={F} />
                        </div>
                      </div>
                      <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr 100px", gap:10, marginBottom:10 }}>
                        <div>
                          <label style={{ display:"block", fontSize:10, fontWeight:700, color:"#374151", textTransform:"uppercase", letterSpacing:"0.1em", marginBottom:5 }}>Start Time</label>
                          <div style={{ position:"relative" }}>
                            <select value={s.startTime} onChange={e => { const st = e.target.value; patchShoot(s.id, { startTime: st, durationHours: calcDuration(st, s.endTime) || s.durationHours }) }} style={{ ...F, paddingRight:28, appearance:"none" }}>
                              {TIME_OPTIONS.map(t => <option key={t} value={t}>{fmt12(t)}</option>)}
                            </select>
                            <ChevronDown size={11} style={{ position:"absolute", right:10, top:"50%", transform:"translateY(-50%)", color:"#9CA3AF", pointerEvents:"none" }} />
                          </div>
                        </div>
                        <div>
                          <label style={{ display:"block", fontSize:10, fontWeight:700, color:"#374151", textTransform:"uppercase", letterSpacing:"0.1em", marginBottom:5 }}>End Time</label>
                          <div style={{ position:"relative" }}>
                            <select value={s.endTime} onChange={e => { const et = e.target.value; patchShoot(s.id, { endTime: et, durationHours: calcDuration(s.startTime, et) || s.durationHours }) }} style={{ ...F, paddingRight:28, appearance:"none" }}>
                              {TIME_OPTIONS.map(t => <option key={t} value={t}>{fmt12(t)}</option>)}
                            </select>
                            <ChevronDown size={11} style={{ position:"absolute", right:10, top:"50%", transform:"translateY(-50%)", color:"#9CA3AF", pointerEvents:"none" }} />
                          </div>
                        </div>
                        <div>
                          <label style={{ display:"block", fontSize:10, fontWeight:700, color:"#374151", textTransform:"uppercase", letterSpacing:"0.1em", marginBottom:5 }}>Duration</label>
                          <DurationPicker value={s.durationHours} onChange={v => patchShoot(s.id, { durationHours: v })} />
                        </div>
                      </div>
                      <div style={{ display:"grid", gridTemplateColumns:"1fr auto", gap:10, alignItems:"start" }}>
                        <div>
                          <label style={{ display:"block", fontSize:10, fontWeight:700, color:"#374151", textTransform:"uppercase", letterSpacing:"0.1em", marginBottom:5 }}>Notes</label>
                          <input value={s.notes} onChange={e => patchShoot(s.id, { notes: e.target.value })} placeholder="Location, shots taken, any issues…" style={F} />
                        </div>
                        <div style={{ paddingTop:24 }}>
                          <button onClick={() => patchShoot(s.id, { videoUploaded: !s.videoUploaded })}
                            style={{ display:"flex", alignItems:"center", gap:6, padding:"9px 14px", borderRadius:10, border:"1.5px solid", cursor:"pointer", fontSize:11, fontWeight:700, transition:"all 0.15s", background: s.videoUploaded ? "rgba(34,197,94,0.1)" : "#F9FAFB", borderColor: s.videoUploaded ? "rgba(34,197,94,0.4)" : "#EBEDF2", color: s.videoUploaded ? "#16A34A" : "#9CA3AF" }}>
                            <Upload size={12} /> {s.videoUploaded ? "Uploaded ✓" : "Video Uploaded?"}
                          </button>
                        </div>
                      </div>
                      <div style={{ borderTop:"1px solid #F0F1F5", paddingTop:12, marginTop:12, display:"flex", justifyContent:"flex-end", alignItems:"center", gap:10 }}>
                        {savedIds.has(s.id) && <span style={{ fontSize:11, fontWeight:700, color:"#16A34A", display:"flex", alignItems:"center", gap:4 }}><CheckCircle2 size={12} /> Saved ✓</span>}
                        <button onClick={() => handleSaveEntry(s.id)} disabled={isPending}
                          style={{ display:"flex", alignItems:"center", gap:7, padding:"9px 20px", borderRadius:10, background:"#DE1A1A", border:"none", color:"#FFFFFF", fontSize:12, fontWeight:700, cursor: isPending?"not-allowed":"pointer", opacity: isPending?0.7:1, boxShadow:"0 4px 12px rgba(222,26,26,0.3)" }}>
                          {isPending ? <Loader2 size={12} className="animate-spin" /> : <SendHorizonal size={12} />}
                          {isPending ? "Saving…" : "Save Shoot"}
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
              {shoots.length > 0 && (
                <button onClick={addShoot} style={{ display:"flex", alignItems:"center", gap:7, marginTop:12, padding:"9px 16px", borderRadius:10, background:"rgba(239,68,68,0.06)", border:"1.5px dashed rgba(239,68,68,0.3)", color:"#EF4444", fontSize:12, fontWeight:700, cursor:"pointer" }}>
                  <Plus size={13} /> Add Another Shoot
                </button>
              )}
            </div>

            {/* Edits */}
            <div style={{ background:"#FFFFFF", borderRadius:20, border:"1px solid #EBEDF2", padding:"20px 22px", boxShadow:"0 2px 10px rgba(0,0,0,0.05)" }}>
              <SectionHead icon={<Film size={16} style={{ color:"#6366F1" }} />} label="Editing Today" count={edits.length} color="#6366F1" />
              {edits.length === 0 ? (
                <div onClick={addEdit} style={{ display:"flex", flexDirection:"column", alignItems:"center", justifyContent:"center", gap:14, padding:"32px 0", borderRadius:16, border:"2px dashed #C7D2FE", background:"rgba(99,102,241,0.02)", cursor:"pointer" }}>
                  <div style={{ position:"relative", width:180, height:140 }}>
                    <Image src="/brand/edit-illustration.png" alt="Editing" fill style={{ objectFit:"contain" }} />
                  </div>
                  <p style={{ fontSize:13, fontWeight:600, color:"#9CA3AF", margin:0 }}>No editing logged yet</p>
                  <span style={{ fontSize:12, color:"#FFFFFF", fontWeight:700, background:"#6366F1", padding:"9px 22px", borderRadius:10, boxShadow:"0 4px 14px rgba(99,102,241,0.35)" }}>+ Add edit</span>
                </div>
              ) : (
                <div style={{ display:"flex", flexDirection:"column", gap:12 }}>
                  {edits.map((e, i) => (
                    <div key={e.id} style={{ background:"#FAFBFC", borderRadius:14, border:"1px solid #F0F1F5", padding:"14px 16px" }}>
                      <div style={{ display:"flex", alignItems:"center", justifyContent:"space-between", marginBottom:14 }}>
                        <span style={{ fontSize:11, fontWeight:800, color:"#6366F1", textTransform:"uppercase", letterSpacing:"0.1em" }}>Edit #{i + 1}</span>
                        <button onClick={() => removeEdit(e.id)} style={{ width:26, height:26, borderRadius:8, background:"rgba(99,102,241,0.08)", border:"none", cursor:"pointer", display:"flex", alignItems:"center", justifyContent:"center" }}>
                          <Trash2 size={12} style={{ color:"#6366F1" }} />
                        </button>
                      </div>
                      <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:10, marginBottom:10 }}>
                        <div>
                          <label style={{ display:"block", fontSize:10, fontWeight:700, color:"#374151", textTransform:"uppercase", letterSpacing:"0.1em", marginBottom:5 }}>Date Given</label>
                          <input type="date" value={e.dateGiven} onChange={ev => patchEdit(e.id, { dateGiven: ev.target.value })} style={{ ...F, colorScheme:"light" }} />
                        </div>
                        <div>
                          <label style={{ display:"block", fontSize:10, fontWeight:700, color:"#374151", textTransform:"uppercase", letterSpacing:"0.1em", marginBottom:5 }}>Date Finished</label>
                          <input type="date" value={e.dateFinished} onChange={ev => patchEdit(e.id, { dateFinished: ev.target.value })} style={{ ...F, colorScheme:"light" }} />
                        </div>
                      </div>
                      <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:10, marginBottom:10 }}>
                        <div>
                          <label style={{ display:"block", fontSize:10, fontWeight:700, color:"#374151", textTransform:"uppercase", letterSpacing:"0.1em", marginBottom:5 }}>Client Name *</label>
                          {projects.length > 0 ? (
                            <div style={{ position:"relative" }}>
                              <select value={e.clientName} onChange={ev => patchEdit(e.id, { clientName: ev.target.value })} style={{ ...F, paddingRight:28, appearance:"none" }}>
                                <option value="">Select project…</option>
                                {projects.map(p => <option key={p.id} value={p.business_name}>{p.business_name}</option>)}
                              </select>
                              <ChevronDown size={11} style={{ position:"absolute", right:10, top:"50%", transform:"translateY(-50%)", color:"#9CA3AF", pointerEvents:"none" }} />
                            </div>
                          ) : (
                            <input value={e.clientName} onChange={ev => patchEdit(e.id, { clientName: ev.target.value })} placeholder="Client name…" style={F} />
                          )}
                        </div>
                        <div>
                          <label style={{ display:"block", fontSize:10, fontWeight:700, color:"#374151", textTransform:"uppercase", letterSpacing:"0.1em", marginBottom:5 }}>Video Name *</label>
                          <input value={e.title} onChange={ev => patchEdit(e.id, { title: ev.target.value })} placeholder="e.g. Evan Styles Makeover Reel" style={F} />
                        </div>
                      </div>
                      <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr 110px", gap:10, marginBottom:10 }}>
                        <div>
                          <label style={{ display:"block", fontSize:10, fontWeight:700, color:"#374151", textTransform:"uppercase", letterSpacing:"0.1em", marginBottom:5 }}>Video Type</label>
                          <div style={{ position:"relative" }}>
                            <select value={e.videoType} onChange={ev => patchEdit(e.id, { videoType: ev.target.value })} style={{ ...F, paddingRight:28, appearance:"none" }}>
                              <option value="">Select type…</option>
                              {["Instagram Reels","Personal Branding","Ads and Hooks","Long Videos","Cinematic","YouTube Shorts"].map(t => <option key={t} value={t}>{t}</option>)}
                            </select>
                            <ChevronDown size={11} style={{ position:"absolute", right:10, top:"50%", transform:"translateY(-50%)", color:"#9CA3AF", pointerEvents:"none" }} />
                          </div>
                        </div>
                        <div>
                          <label style={{ display:"block", fontSize:10, fontWeight:700, color:"#374151", textTransform:"uppercase", letterSpacing:"0.1em", marginBottom:5 }}>Duration (mins)</label>
                          <div style={{ position:"relative" }}>
                            <select value={e.videoDuration} onChange={ev => patchEdit(e.id, { videoDuration: ev.target.value })} style={{ ...F, paddingRight:28, appearance:"none" }}>
                              <option value="">Select…</option>
                              {[1,1.5,2,2.5,3,3.5,4,4.5,5,6,7,8].map(m => <option key={m} value={`${m} min`}>{m} min</option>)}
                            </select>
                            <ChevronDown size={11} style={{ position:"absolute", right:10, top:"50%", transform:"translateY(-50%)", color:"#9CA3AF", pointerEvents:"none" }} />
                          </div>
                        </div>
                        <div>
                          <label style={{ display:"block", fontSize:10, fontWeight:700, color:"#374151", textTransform:"uppercase", letterSpacing:"0.1em", marginBottom:5 }}>Revisions</label>
                          <input type="number" min="0" max="99" value={e.revisions} onChange={ev => patchEdit(e.id, { revisions: parseInt(ev.target.value) || 0 })} placeholder="0" style={F} />
                        </div>
                      </div>
                      <div style={{ display:"grid", gridTemplateColumns:"1fr auto", gap:10, alignItems:"end", marginBottom:10 }}>
                        <div>
                          <label style={{ display:"block", fontSize:10, fontWeight:700, color:"#374151", textTransform:"uppercase", letterSpacing:"0.1em", marginBottom:5 }}>Time Taken (editing hours)</label>
                          <DurationPicker value={e.timeTaken} onChange={v => patchEdit(e.id, { timeTaken: v })} />
                        </div>
                        <button onClick={() => patchEdit(e.id, { driveUpdated: !e.driveUpdated })}
                          style={{ display:"flex", alignItems:"center", gap:6, padding:"9px 14px", borderRadius:10, border:"1.5px solid", cursor:"pointer", fontSize:11, fontWeight:700, whiteSpace:"nowrap", background: e.driveUpdated ? "rgba(34,197,94,0.1)" : "#F9FAFB", borderColor: e.driveUpdated ? "rgba(34,197,94,0.4)" : "#EBEDF2", color: e.driveUpdated ? "#16A34A" : "#9CA3AF" }}>
                          <Upload size={12} /> {e.driveUpdated ? "Drive Updated ✓" : "Drive Updated?"}
                        </button>
                      </div>
                      <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:10 }}>
                        <div>
                          <label style={{ display:"block", fontSize:10, fontWeight:700, color:"#374151", textTransform:"uppercase", letterSpacing:"0.1em", marginBottom:5 }}>Notes</label>
                          <input value={e.notes} onChange={ev => patchEdit(e.id, { notes: ev.target.value })} placeholder="Software used, challenges…" style={F} />
                        </div>
                        <div>
                          <label style={{ display:"block", fontSize:10, fontWeight:700, color:"#374151", textTransform:"uppercase", letterSpacing:"0.1em", marginBottom:5 }}>
                            <Link2 size={9} style={{ display:"inline", marginRight:4 }} />Drive / Video Link <span style={{ color:"#de1a1a" }}>*</span>
                          </label>
                          <input value={e.videoLink} onChange={ev => patchEdit(e.id, { videoLink: ev.target.value })} placeholder="https://drive.google.com/… (required)" style={{ ...F, borderColor: !e.videoLink.trim() ? "rgba(222,26,26,0.4)" : "#EBEDF2" }} />
                        </div>
                      </div>
                      <div style={{ borderTop:"1px solid #F0F1F5", paddingTop:12, marginTop:12, display:"flex", justifyContent:"flex-end", alignItems:"center", gap:10 }}>
                        {savedIds.has(e.id) && <span style={{ fontSize:11, fontWeight:700, color:"#16A34A", display:"flex", alignItems:"center", gap:4 }}><CheckCircle2 size={12} /> Saved ✓</span>}
                        <button onClick={() => handleSaveEntry(e.id)} disabled={isPending}
                          style={{ display:"flex", alignItems:"center", gap:7, padding:"9px 20px", borderRadius:10, background:"#6366F1", border:"none", color:"#FFFFFF", fontSize:12, fontWeight:700, cursor: isPending?"not-allowed":"pointer", opacity: isPending?0.7:1, boxShadow:"0 4px 12px rgba(99,102,241,0.3)" }}>
                          {isPending ? <Loader2 size={12} className="animate-spin" /> : <SendHorizonal size={12} />}
                          {isPending ? "Saving…" : "Save Edit"}
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
              {edits.length > 0 && (
                <button onClick={addEdit} style={{ display:"flex", alignItems:"center", gap:7, marginTop:12, padding:"9px 16px", borderRadius:10, background:"rgba(99,102,241,0.06)", border:"1.5px dashed rgba(99,102,241,0.3)", color:"#6366F1", fontSize:12, fontWeight:700, cursor:"pointer" }}>
                  <Plus size={13} /> Add Another Edit
                </button>
              )}
            </div>
          </>)}

          {/* ══ LEARNING ══════════════════════════════════════════════════════ */}
          {(!isMediaTeam || tab === "learning") && (
            <div style={{ background:"#FFFFFF", borderRadius:20, border:"1px solid #EBEDF2", padding:"20px 22px", boxShadow:"0 2px 10px rgba(0,0,0,0.05)" }}>
              <SectionHead icon={<BookOpen size={16} style={{ color:"#10B981" }} />} label="What did you learn today?" count={0} color="#10B981" />
              <div style={{ display:"flex", flexDirection:"column", gap:14 }}>
                <div>
                  <label style={{ display:"block", fontSize:10, fontWeight:700, color:"#374151", textTransform:"uppercase", letterSpacing:"0.1em", marginBottom:6 }}>Topic / Course *</label>
                  <input value={learningTopic} onChange={e => setLearningTopic(e.target.value)} placeholder="e.g. DaVinci Resolve color grading, Adobe Premiere…" style={F} />
                </div>
                <div style={{ display:"grid", gridTemplateColumns:"160px 1fr", gap:14 }}>
                  <div>
                    <label style={{ display:"block", fontSize:10, fontWeight:700, color:"#374151", textTransform:"uppercase", letterSpacing:"0.1em", marginBottom:6 }}>Hours Spent *</label>
                    <DurationPicker value={learningHours} onChange={setLearningHours} />
                  </div>
                  <div>
                    <label style={{ display:"block", fontSize:10, fontWeight:700, color:"#374151", textTransform:"uppercase", letterSpacing:"0.1em", marginBottom:6 }}>Notes</label>
                    <input value={learningNotes} onChange={e => setLearningNotes(e.target.value)} placeholder="Key takeaways, resources used…" style={F} />
                  </div>
                </div>
              </div>

              {/* Submit button for non-media team */}
              {!isMediaTeam && (
                <div style={{ marginTop:16, paddingTop:14, borderTop:"1px solid #EBEDF2", display:"flex", alignItems:"center", justifyContent:"space-between", gap:12 }}>
                  <div>
                    {learningError && <p style={{ fontSize:12, fontWeight:600, color:"#DE1A1A", margin:0 }}>{learningError}</p>}
                    {!learningError && <p style={{ fontSize:12, color:"#9CA3AF", margin:0 }}>Learning: {learningTopic || "not set"} · {learningHours}h</p>}
                  </div>
                  {learningDone ? (
                    <span style={{ fontSize:12, fontWeight:700, color:"#22C55E", display:"flex", alignItems:"center", gap:6 }}>
                      <CheckCircle2 size={14} /> Submitted ✓
                    </span>
                  ) : (
                    <button onClick={handleLearningSubmit} disabled={isPending}
                      style={{ display:"flex", alignItems:"center", gap:8, padding:"11px 24px", borderRadius:14, fontSize:13, fontWeight:700, border:"none", cursor:isPending?"not-allowed":"pointer", opacity:isPending?0.7:1, background:"#10B981", color:"#fff", boxShadow:"0 4px 14px rgba(16,185,129,0.4)" }}>
                      {isPending ? <Loader2 size={14} className="animate-spin" /> : <SendHorizonal size={14} />}
                      {isPending ? "Submitting…" : "Submit Learning"}
                    </button>
                  )}
                </div>
              )}
              {!isMediaTeam && (
                <p style={{ fontSize:11, marginTop:6, color:"#9CA3AF" }}>
                  Saved entries appear in your{" "}
                  <a href="/member/history" style={{ color:"#6366F1", fontWeight:600 }}>History tab ↗</a>
                </p>
              )}
            </div>
          )}

          {/* ── Submit bar (media team only) ───────────────────────────────── */}
          {isMediaTeam && (
            <div style={{ background:"#FFFFFF", borderRadius:16, border:"1px solid #EBEDF2", padding:"14px 18px", display:"flex", alignItems:"center", justifyContent:"space-between", gap:12, boxShadow:"0 2px 10px rgba(0,0,0,0.05)" }}>
              <div>
                {error && <p style={{ fontSize:12, fontWeight:600, color:"#DE1A1A", margin:0 }}>{error}</p>}
                {!error && tab === "media"   && <p style={{ fontSize:12, color:"#9CA3AF", margin:0 }}>{shoots.length} shoot{shoots.length !== 1 ? "s" : ""} · {edits.length} edit{edits.length !== 1 ? "s" : ""} · {totalMediaHours}h total</p>}
                {!error && tab === "learning"&& <p style={{ fontSize:12, color:"#9CA3AF", margin:0 }}>Learning: {learningTopic || "not set"} · {learningHours}h</p>}
              </div>
              <button onClick={handleSubmit} disabled={isPending || submitted}
                style={{ display:"flex", alignItems:"center", gap:8, padding:"11px 24px", borderRadius:14, fontSize:13, fontWeight:700, border:"none", cursor: isPending || submitted ? "not-allowed" : "pointer", transition:"all 0.2s", opacity: isPending ? 0.7 : 1,
                  background: submitted ? "#22C55E" : "#DE1A1A",
                  color:"#fff", boxShadow: submitted ? "0 4px 14px rgba(34,197,94,0.4)" : "0 4px 14px rgba(222,26,26,0.4)" }}>
                {isPending ? <Loader2 size={14} className="animate-spin" /> : submitted ? <CheckCircle2 size={14} /> : <SendHorizonal size={14} />}
                {isPending ? "Submitting…" : submitted ? "Submitted! ✓" : "Submit Daily Update"}
              </button>
            </div>
          )}
        </div>

        {/* ── RIGHT: summary panel ──────────────────────────────────────────── */}
        <div style={{ display:"flex", flexDirection:"column", gap:14 }}>
          <div style={{ background:"#FFFFFF", borderRadius:20, border:"1px solid #EBEDF2", overflow:"hidden", boxShadow:"0 2px 10px rgba(0,0,0,0.05)" }}>
            <div style={{ position:"relative", height:150 }}>
              <Image src="/brand/daily-boy.png" alt="" fill style={{ objectFit:"cover", objectPosition:"center top" }} />
              <div style={{ position:"absolute", inset:0, background:"linear-gradient(to bottom, transparent 40%, #FFFFFF 100%)" }} />
            </div>
            <div style={{ padding:"14px 16px" }}>
              <p style={{ fontSize:13, fontWeight:800, color:"#111111", margin:"0 0 14px", display:"flex", alignItems:"center", gap:7 }}>
                <BarChart2 size={13} style={{ color:"#DE1A1A" }} /> Today&apos;s Overview
              </p>

              {/* Non-media team: show both working + learning stats */}
              {!isMediaTeam && (
                <div style={{ display:"flex", flexDirection:"column", gap:9 }}>
                  <p style={{ fontSize:10, fontWeight:700, color:"#DE1A1A", textTransform:"uppercase", letterSpacing:"0.08em", margin:"0 0 2px" }}>⏰ Work Log</p>
                  {([
                    { label:"Hours Logged",  value:`${totalLoggedHours.toFixed(1)}h`, color: totalLoggedHours >= 8 ? "#22C55E" : "#111111" },
                    { label:"Blocks Filled", value:`${filledBlocks.length}`,           color:"#6366F1" },
                    { label:"Productivity",  value:`${generalProductivity}%`,          color: generalProductivity >= 70 ? "#22C55E" : generalProductivity > 0 ? "#F59E0B" : "#9CA3AF" },
                  ] as Array<{label:string;value:string;color:string}>).map((r,i) => (
                    <div key={i} style={{ display:"flex", alignItems:"center", justifyContent:"space-between" }}>
                      <span style={{ fontSize:11, color:"#9CA3AF" }}>{r.label}</span>
                      <span style={{ fontSize:11, fontWeight:700, color:r.color }}>{r.value}</span>
                    </div>
                  ))}
                  <div style={{ borderTop:"1px solid #F0F1F5", paddingTop:9, marginTop:2 }}>
                    <p style={{ fontSize:10, fontWeight:700, color:"#10B981", textTransform:"uppercase", letterSpacing:"0.08em", margin:"0 0 6px" }}>📚 Learning</p>
                    {([
                      { label:"Topic", value: learningTopic || "Not set", color:"#10B981" },
                      { label:"Hours", value:`${learningHours}h`,          color:"#6366F1" },
                    ] as Array<{label:string;value:string;color:string}>).map((r,i) => (
                      <div key={i} style={{ display:"flex", alignItems:"center", justifyContent:"space-between", marginBottom:4 }}>
                        <span style={{ fontSize:11, color:"#9CA3AF" }}>{r.label}</span>
                        <span style={{ fontSize:11, fontWeight:700, color:r.color, maxWidth:130, textOverflow:"ellipsis", overflow:"hidden", whiteSpace:"nowrap" }}>{r.value}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {(isMediaTeam && tab === "media") && (
                <div style={{ display:"flex", flexDirection:"column", gap:9 }}>
                  {([
                    { label:"Shoots",      value:`${shoots.length}`,         color: shoots.length > 0 ? "#EF4444" : "#9CA3AF" },
                    { label:"Edits",       value:`${edits.length}`,          color: edits.length > 0  ? "#6366F1" : "#9CA3AF" },
                    { label:"Shoot Hours", value:`${totalShootHours}h`,      color:"#EF4444" },
                    { label:"Edit Hours",  value:`${totalEditHours}h`,       color:"#6366F1" },
                    { label:"Total Hours", value:`${totalMediaHours}h`,      color: totalMediaHours >= 8 ? "#22C55E" : "#111111" },
                  ] as Array<{label:string;value:string;color:string}>).map((r,i) => (
                    <div key={i} style={{ display:"flex", alignItems:"center", justifyContent:"space-between" }}>
                      <span style={{ fontSize:11, color:"#9CA3AF" }}>{r.label}</span>
                      <span style={{ fontSize:11, fontWeight:700, color:r.color }}>{r.value}</span>
                    </div>
                  ))}
                </div>
              )}

              {(isMediaTeam && tab === "learning") && (
                <div style={{ display:"flex", flexDirection:"column", gap:9 }}>
                  {([
                    { label:"Topic",       value: learningTopic || "Not set", color:"#10B981" },
                    { label:"Hours",       value:`${learningHours}h`,          color:"#6366F1" },
                  ] as Array<{label:string;value:string;color:string}>).map((r,i) => (
                    <div key={i} style={{ display:"flex", alignItems:"center", justifyContent:"space-between" }}>
                      <span style={{ fontSize:11, color:"#9CA3AF" }}>{r.label}</span>
                      <span style={{ fontSize:11, fontWeight:700, color:r.color, maxWidth:140, textOverflow:"ellipsis", overflow:"hidden", whiteSpace:"nowrap" }}>{r.value}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>

          {/* Hours breakdown for media */}
          {tab === "media" && (totalShootHours > 0 || totalEditHours > 0) && (
            <div style={{ background:"#FFFFFF", borderRadius:20, border:"1px solid #EBEDF2", padding:"16px", boxShadow:"0 2px 10px rgba(0,0,0,0.05)" }}>
              <div style={{ display:"flex", alignItems:"center", gap:7, marginBottom:14 }}>
                <Zap size={14} style={{ color:"#F59E0B" }} />
                <p style={{ fontSize:13, fontWeight:800, color:"#111111", margin:0 }}>Hours Breakdown</p>
              </div>
              {[
                { label:"Shoot Time", hours: totalShootHours, color:"#EF4444", Icon:Camera },
                { label:"Edit Time",  hours: totalEditHours,  color:"#6366F1", Icon:Film   },
              ].map(b => (
                <div key={b.label} style={{ marginBottom:10 }}>
                  <div style={{ display:"flex", justifyContent:"space-between", marginBottom:5 }}>
                    <span style={{ fontSize:11, color:"#6B7280", display:"flex", alignItems:"center", gap:5 }}>
                      <b.Icon size={11} style={{ color:b.color }} />{b.label}
                    </span>
                    <span style={{ fontSize:11, fontWeight:700, color:b.color }}>{b.hours}h</span>
                  </div>
                  <div style={{ height:5, borderRadius:99, background:"#F3F4F6", overflow:"hidden" }}>
                    <div style={{ height:"100%", borderRadius:99, background:b.color, width:`${totalMediaHours > 0 ? (b.hours/totalMediaHours)*100 : 0}%`, transition:"width 0.4s ease" }} />
                  </div>
                </div>
              ))}
              <div style={{ marginTop:12, paddingTop:10, borderTop:"1px solid #F0F1F5", display:"flex", justifyContent:"space-between" }}>
                <span style={{ fontSize:12, fontWeight:700, color:"#374151" }}>Total</span>
                <span style={{ fontSize:13, fontWeight:900, color:"#DE1A1A" }}>{totalMediaHours}h</span>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
