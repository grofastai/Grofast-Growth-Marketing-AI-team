"use client"

import { useState, useTransition, useMemo, useEffect, useRef, type CSSProperties } from "react"
import { useRouter } from "next/navigation"
import Image from "next/image"
import {
  Camera, Film, Plus, Trash2, CheckCircle2,
  Loader2, SendHorizonal, Clock, BookOpen, Coffee,
  ChevronDown, Upload, Link2, Zap, BarChart2, MoreHorizontal, Calendar,
} from "lucide-react"
import { submitDailyUpdate, deleteDailyUpdate, updatePastDailyUpdate } from "@/lib/actions/daily-updates"

interface Project { id: string; business_name: string }
interface TeamMember { id: string; name: string; employee_id: string; role: string }

const INTERNAL_BRANDS = ["GROFAST DIGITAL", "KARTHICK BRANDS", "GROFAST AI"]

interface ShootEntry {
  id: string; clientName: string; customClient: string; title: string
  startTime: string; endTime: string; durationHours: number
  cameraHours: number; droneHours: number
  travelHours: number
  brand: string; shopName: string
  location: string; driveLink: string
  notes: string; videoUploaded: boolean
  participantIds: string[]
}
interface EditEntry {
  id: string; clientName: string; brand: string; customClient: string; title: string
  videoType: string; customVideoType: string; videoDuration: string
  startTime: string; endTime: string
  dateGiven: string; dateFinished: string
  timeTaken: number; driveUpdated: boolean
  revisions: number; videoLink: string; notes: string
  participantIds: string[]
}
interface TimeBlock {
  id: string; isBreak: boolean; breakLabel: string
  startTime: string; endTime: string
  durationHours: number; description: string
  projectName: string; brand: string; customClient: string
  status: "completed" | "in_progress" | "not_started"
  isMultiClient: boolean; clientNames: string[]
  participantIds: string[]
}
interface MediaBreakEntry {
  id: string; startTime: string; endTime: string
  durationHours: number; label: string
}

function fmt12(t: string) {
  if (!t) return ""
  const [h, m] = t.split(":").map(Number)
  return `${h % 12 || 12}:${String(m).padStart(2, "0")} ${h >= 12 ? "PM" : "AM"}`
}

// Native time picker — mobile triggers system drum-roll, stores as "HH:MM" (24h)
function TimePicker({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  return (
    <input
      type="time"
      value={value || "09:00"}
      onChange={e => e.target.value && onChange(e.target.value)}
      style={{
        fontSize: 13, fontWeight: 700, color: "#111827",
        background: "#fff", border: "1.5px solid #EBEDF2",
        borderRadius: 8, padding: "6px 10px", outline: "none",
        colorScheme: "light", cursor: "pointer",
      }}
    />
  )
}
function calcDuration(start: string, end: string) {
  if (!start || !end) return 0
  const [sh, sm] = start.split(":").map(Number)
  const [eh, em] = end.split(":").map(Number)
  const diff = (eh * 60 + em) - (sh * 60 + sm)
  return diff > 0 ? Math.round((diff / 60) * 10) / 10 : 0
}
function toMins(t: string) { const [h, m] = t.split(":").map(Number); return h * 60 + m }
function calcOverlapHours(editStart: string, editEnd: string, shoots: { startTime: string; endTime: string }[]): number {
  if (!editStart || !editEnd) return 0
  const eS = toMins(editStart), eE = toMins(editEnd)
  if (eE <= eS) return 0
  const overlapMins = shoots.reduce((acc, s) => {
    if (!s.startTime || !s.endTime) return acc
    const sS = toMins(s.startTime), sE = toMins(s.endTime)
    if (sE <= sS) return acc
    return acc + Math.max(0, Math.min(eE, sE) - Math.max(eS, sS))
  }, 0)
  return Math.round((overlapMins / 60) * 10) / 10
}

const F: React.CSSProperties = {
  background: "#F9FAFB", border: "1.5px solid #EBEDF2", color: "#111827",
  borderRadius: 10, padding: "9px 12px", fontSize: 13, outline: "none", width: "100%",
}

function DurationPicker({ value, onChange }: { value: number; onChange: (v: number) => void }) {
  const steps: { val: number; label: string }[] = [
    { val: 0.25, label: "15 min" },
    { val: 0.5,  label: "30 min" },
    { val: 0.75, label: "45 min" },
    { val: 1,    label: "1h" },
    { val: 1.5,  label: "1.5h" },
    { val: 2,    label: "2h" },
    { val: 2.5,  label: "2.5h" },
    { val: 3,    label: "3h" },
    { val: 3.5,  label: "3.5h" },
    { val: 4,    label: "4h" },
    { val: 4.5,  label: "4.5h" },
    { val: 5,    label: "5h" },
    { val: 6,    label: "6h" },
    { val: 7,    label: "7h" },
    { val: 8,    label: "8h" },
  ]
  return (
    <select value={value} onChange={e => onChange(Number(e.target.value))} style={{ ...F, width:"auto", minWidth:90 }}>
      {steps.map(s => <option key={s.val} value={s.val}>{s.label}</option>)}
    </select>
  )
}

function fmtTravel(h: number) {
  const hrs = Math.floor(h)
  const mins = Math.round((h - hrs) * 60)
  if (hrs === 0 && mins === 0) return null
  if (hrs === 0) return `${mins} min`
  if (mins === 0) return `${hrs} hr`
  return `${hrs} hr ${mins} min`
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
  video_uploaded?: boolean | null; video_link?: string
  video_type?: string; video_duration?: string
  date_given?: string; date_finished?: string
  drive_updated?: boolean; revisions?: number
  _client_type?: string; _brand?: string; _shop_name?: string
  _custom_client?: string; _location?: string; _travel_hours?: number
  _camera_hours?: number; _drone_hours?: number
}

function parseExistingBlocks(existingUpdate: Record<string, unknown>): TimeBlock[] {
  const entries = existingUpdate?.work_entries as SavedEntry[] | null
  if (!Array.isArray(entries)) return []
  return entries
    .filter(e => e.task_type === 'other' || e.task_type === 'break')
    .map(e => ({
      id: e.id ?? crypto.randomUUID(),
      isBreak: e.task_type === 'break',
      breakLabel: e.task_type === 'break' ? (e.title ?? 'Break') : '',
      startTime: e.start_time ?? '09:00',
      endTime: e.end_time ?? '10:00',
      durationHours: e.duration_hours ?? 1,
      description: e.task_type === 'break' ? '' : (e.title ?? ''),
      projectName: '',
      brand: '', customClient: '',
      status: (() => {
        const rawStatus = e.notes?.replace(/^\[/, '').replace(/\]$/, '') ?? ''
        const VALID = ['completed', 'in_progress', 'not_started'] as const
        return (VALID.includes(rawStatus as TimeBlock['status']) ? rawStatus : 'not_started') as TimeBlock['status']
      })(),
      isMultiClient: (e.client_names?.length ?? 0) > 1,
      clientNames: e.is_multi_client ? (e.client_names ?? []) : (e.client_name && e.client_name !== 'Internal' && e.task_type !== 'break' ? [e.client_name] : []),
      participantIds: (e as Record<string, unknown>).participant_ids as string[] ?? [],
    }))
}

function parseExistingMediaBreaks(existingUpdate: Record<string, unknown>): MediaBreakEntry[] {
  const entries = existingUpdate?.work_entries as SavedEntry[] | null
  if (!Array.isArray(entries)) return []
  return entries
    .filter(e => e.task_type === 'break')
    .map(e => ({
      id: e.id ?? crypto.randomUUID(),
      startTime: e.start_time ?? '13:00',
      endTime: e.end_time ?? '13:30',
      durationHours: e.duration_hours ?? 0.5,
      label: e.title ?? 'Lunch',
    }))
}

function parseExistingShoots(existingUpdate: Record<string, unknown>): ShootEntry[] {
  const entries = existingUpdate?.work_entries as SavedEntry[] | null
  if (!Array.isArray(entries)) return []
  return entries
    .filter(e => e.task_type === 'shoot')
    .map(e => ({
      id: e.id ?? crypto.randomUUID(),
      clientName: e._client_type ?? e.client_name ?? "",
      customClient: e._custom_client ?? "",
      title: e.title ?? "",
      startTime: e.start_time ?? "09:00",
      endTime: e.end_time ?? "17:00",
      durationHours: e.duration_hours ?? 0,
      travelHours: e._travel_hours ?? 0,
      cameraHours: e._camera_hours ?? 0,
      droneHours: e._drone_hours ?? 0,
      brand: e._brand ?? "",
      shopName: e._shop_name ?? "",
      location: e._location ?? "",
      driveLink: e.video_link ?? "",
      notes: "",
      videoUploaded: e.video_uploaded ?? false,
      participantIds: (e as Record<string, unknown>).participant_ids as string[] ?? [],
    }))
}

function parseExistingEdits(existingUpdate: Record<string, unknown>): EditEntry[] {
  const entries = existingUpdate?.work_entries as SavedEntry[] | null
  if (!Array.isArray(entries)) return []
  return entries
    .filter(e => e.task_type === 'edit')
    .map(e => ({
      id: e.id ?? crypto.randomUUID(),
      clientName: e._client_type ?? e.client_name ?? "",
      brand: e._brand ?? "",
      customClient: e._custom_client ?? "",
      title: e.title ?? "",
      videoType: e.video_type ?? "",
      customVideoType: "",
      videoDuration: e.video_duration ?? "",
      startTime: e.start_time ?? "",
      endTime: e.end_time ?? "",
      dateGiven: e.date_given ?? new Date().toISOString().split("T")[0],
      dateFinished: e.date_finished ?? new Date().toISOString().split("T")[0],
      timeTaken: e.duration_hours ?? 0,
      driveUpdated: e.drive_updated ?? false,
      revisions: e.revisions ?? 0,
      videoLink: e.video_link ?? "",
      notes: e.notes ?? "",
      participantIds: (e as Record<string, unknown>).participant_ids as string[] ?? [],
    }))
}

// ═══════════════════════════════════════════════════════════════════════════════
type PastUpdate = {
  id: string; date: string; working_hours: number | null; learning_hours: number | null
  shoot_count: number | null; editing_count: number | null
  work_entries: Record<string, unknown>[] | null; active_tab: string | null; learning_topic: string | null
}

export default function DailyUpdateForm({
  projects, sheetClientNames = [], pastClientNames = [], userName, team, existingUpdate, pastUpdates = [], teamMembers = [],
}: {
  projects: Project[]; sheetClientNames?: string[]; pastClientNames?: string[]; userName: string; team?: string | null
  existingUpdate?: Record<string, unknown> | null; pastUpdates?: PastUpdate[]
  teamMembers?: TeamMember[]
}) {
  const router = useRouter()
  const existingUpdateRef = useRef(existingUpdate)
  useEffect(() => { existingUpdateRef.current = existingUpdate }, [existingUpdate])
  const [isPending, startTransition] = useTransition()

  const firstName = userName.split(" ")[0] || "there"
  const now       = new Date()
  const h         = now.getHours()
  const greeting  = h < 12 ? "Good morning" : h < 17 ? "Good afternoon" : "Good evening"

  const isMediaTeam = team === "Media Team"

  const todayStr = new Date().toISOString().split("T")[0]

  // ── Date selector ────────────────────────────────────────────────────────
  const [selectedDate, setSelectedDate] = useState(todayStr)
  const [activeUpdate, setActiveUpdate] = useState<Record<string, unknown> | null>(existingUpdate ?? null)

  const dateLabel = new Date(selectedDate + "T12:00:00").toLocaleDateString("en-US", { weekday:"long", day:"numeric", month:"long", year:"numeric" })
  const isToday = selectedDate === todayStr
  const isPastDate = !isToday

  function handleDateChange(date: string) {
    if (date > todayStr) return
    setSelectedDate(date)

    let found: Record<string, unknown> | null = null
    if (date === todayStr) {
      found = existingUpdate ?? null
    } else {
      const past = pastUpdates.find(u => u.date === date)
      found = past ? (past as unknown as Record<string, unknown>) : null
    }
    setActiveUpdate(found)

    setShoots(found ? parseExistingShoots(found) : [])
    setEdits(found ? parseExistingEdits(found) : [])
    setTimeBlocks(found ? parseExistingBlocks(found) : [])
    setMediaBreaks(found ? parseExistingMediaBreaks(found) : [])
    setLearningTopic((found?.learning_topic as string) ?? "")
    setLearningFrom(""); setLearningTo("")
    setLearningNotes((found?.learning_notes as string) ?? "")
    setLearningParticipantIds(found?.active_tab === "learning" ? ((found?.participant_ids as string[]) ?? []) : [])
    setWorkingDone(!!(found && (found as Record<string, unknown>).working_hours))
    setLearningDone(!!(found && (found as Record<string, unknown>).learning_hours))
    setSubmitted(false)
    setEditMode(false)
    setError(null)
    setWorkingError(null)
    setLearningError(null)

    const foundTab = (found?.active_tab as string) ?? null
    if (foundTab === "media" || foundTab === "learning" || foundTab === "working" || foundTab === "break") {
      setTab(foundTab as "working" | "media" | "learning" | "break")
    } else {
      setTab(isMediaTeam ? "media" : "working")
    }
  }

  const [tab, setTab] = useState<"working" | "media" | "learning" | "break">(isMediaTeam ? "media" : "working")

  // Normalize: collapse all whitespace (including non-breaking spaces) to single space, lowercase
  const norm = (s: string) => s.replace(/[\s ]+/g, " ").trim().toLowerCase()
  const seenLower = new Set(INTERNAL_BRANDS.map(norm))
  const activeClientOptions: string[] = [...INTERNAL_BRANDS]
  for (const n of [...projects.map(p => p.business_name), ...sheetClientNames]) {
    const t = n?.replace(/[\s ]+/g, " ").trim()
    if (t && !seenLower.has(norm(t))) { seenLower.add(norm(t)); activeClientOptions.push(t) }
  }
  // Past clients — deduped against active list
  const pastClientOptions: string[] = []
  for (const n of pastClientNames) {
    const t = n?.replace(/[\s ]+/g, " ").trim()
    if (t && !seenLower.has(norm(t))) { seenLower.add(norm(t)); pastClientOptions.push(t) }
  }
  const allClientOptions = activeClientOptions

  // Tracks which entry IDs are in "past clients" mode
  const [showPastFor, setShowPastFor] = useState<Set<string>>(new Set())
  const enterPastMode  = (id: string) => setShowPastFor(p => new Set([...p, id]))
  const exitPastMode   = (id: string) => setShowPastFor(p => { const n = new Set(p); n.delete(id); return n })

  // ── Shoots (media) ───────────────────────────────────────────────────────
  const [shoots, setShoots] = useState<ShootEntry[]>(() => existingUpdate ? parseExistingShoots(existingUpdate) : [])
  const addShoot    = () => setShoots(p => [...p, { id: crypto.randomUUID(), clientName:"", customClient:"", title:"", startTime:"09:00", endTime:"17:00", durationHours:8, cameraHours:0, droneHours:0, travelHours:0, brand:"", shopName:"", location:"", driveLink:"", notes:"", videoUploaded:false, participantIds:[] }])
  const patchShoot  = (id: string, patch: Partial<ShootEntry>) => setShoots(p => p.map(s => s.id === id ? { ...s, ...patch } : s))
  const removeShoot = (id: string) => setShoots(p => p.filter(s => s.id !== id))

  // ── Edits (media) ────────────────────────────────────────────────────────
  const [edits, setEdits] = useState<EditEntry[]>(() => existingUpdate ? parseExistingEdits(existingUpdate) : [])
  const addEdit    = () => setEdits(p => [...p, {
    id: crypto.randomUUID(), clientName: "", brand: "", customClient: "", title: "",
    videoType: "", customVideoType: "", videoDuration: "",
    startTime: "", endTime: "",
    dateGiven: todayStr, dateFinished: todayStr, timeTaken: 2,
    driveUpdated: false, revisions: 0, videoLink: "", notes: "", participantIds: [],
  }])
  const patchEdit  = (id: string, patch: Partial<EditEntry>) => setEdits(p => p.map(e => {
    if (e.id !== id) return e
    const updated = { ...e, ...patch }
    if (patch.startTime !== undefined || patch.endTime !== undefined) {
      const dur = calcDuration(updated.startTime, updated.endTime)
      if (dur > 0) updated.timeTaken = dur
    }
    return updated
  }))
  const removeEdit = (id: string) => setEdits(p => p.filter(e => e.id !== id))

  // ── Time blocks (working) ────────────────────────────────────────────────
  const [timeBlocks, setTimeBlocks] = useState<TimeBlock[]>(() =>
    existingUpdate ? parseExistingBlocks(existingUpdate) : loadDraft()
  )
  const addTimeBlock = () => setTimeBlocks(p => [...p, {
    id: crypto.randomUUID(), isBreak: false, breakLabel: "",
    startTime: "09:00", endTime: "10:00",
    durationHours: 1, description: "", projectName: "", brand: "", customClient: "",
    status: "not_started" as const, isMultiClient: false, clientNames: [], participantIds: [],
  }])
  const addBreakBlock = () => setTimeBlocks(p => [...p, {
    id: crypto.randomUUID(), isBreak: true, breakLabel: "Lunch",
    startTime: "13:00", endTime: "13:30",
    durationHours: 0.5, description: "", projectName: "", brand: "", customClient: "",
    status: "not_started" as const, isMultiClient: false, clientNames: [], participantIds: [],
  }])
  const patchBlock = (id: string, patch: Partial<TimeBlock>) =>
    setTimeBlocks(p => p.map(b => {
      const updated = { ...b, ...patch }
      if (patch.startTime || patch.endTime) updated.durationHours = calcDuration(updated.startTime, updated.endTime)
      return b.id === id ? updated : b
    }))
  const removeBlock = (id: string) => setTimeBlocks(p => p.filter(b => b.id !== id))

  // ── Media Breaks ─────────────────────────────────────────────
  const [mediaBreaks, setMediaBreaks] = useState<MediaBreakEntry[]>(() =>
    existingUpdate ? parseExistingMediaBreaks(existingUpdate) : []
  )
  const addMediaBreak    = () => setMediaBreaks(p => [...p, { id: crypto.randomUUID(), startTime: "13:00", endTime: "13:30", durationHours: 0.5, label: "Lunch" }])
  const patchMediaBreak  = (id: string, patch: Partial<MediaBreakEntry>) => setMediaBreaks(p => p.map(b => {
    const updated = { ...b, ...patch }
    if (patch.startTime || patch.endTime) updated.durationHours = calcDuration(updated.startTime, updated.endTime)
    return b.id === id ? updated : b
  }))
  const removeMediaBreak = (id: string) => setMediaBreaks(p => p.filter(b => b.id !== id))

  // ── Learning ─────────────────────────────────────────────────────────────
  const [learningClient, setLearningClient] = useState("GROFAST DIGITAL")
  const [learningTopic, setLearningTopic] = useState(
    (existingUpdate?.learning_topic as string) ?? ""
  )
  const [learningFrom, setLearningFrom] = useState("")
  const [learningTo,   setLearningTo]   = useState("")
  const learningHours = (() => {
    if (!learningFrom || !learningTo) return 0
    const [fh, fm] = learningFrom.split(":").map(Number)
    const [th, tm] = learningTo.split(":").map(Number)
    const diff = (th * 60 + tm) - (fh * 60 + fm)
    return diff > 0 ? Math.round(diff / 60 * 100) / 100 : 0
  })()
  const [learningNotes, setLearningNotes] = useState(
    (existingUpdate?.learning_notes as string) ?? ""
  )
  const [learningParticipantIds, setLearningParticipantIds] = useState<string[]>(
    existingUpdate?.active_tab === "learning" ? ((existingUpdate?.participant_ids as string[]) ?? []) : []
  )

  const [error,         setError]         = useState<string | null>(null)
  const [workingError,  setWorkingError]  = useState<string | null>(null)
  const [learningError, setLearningError] = useState<string | null>(null)
  const [submitted,     setSubmitted]     = useState(false)
  const [workingDone,   setWorkingDone]   = useState(!!(existingUpdate && (existingUpdate as Record<string,unknown>).working_hours))
  const [learningDone,  setLearningDone]  = useState(!!(existingUpdate && (existingUpdate as Record<string,unknown>).learning_hours))
  const [editMode,      setEditMode]      = useState(false)
  const [savedIds,      setSavedIds]      = useState<Set<string>>(new Set())
  const [expandedId,    setExpandedId]    = useState<string | null>(null)
  const [deletingId,    setDeletingId]    = useState<string | null>(null)
  const [editingUpdateId, setEditingUpdateId] = useState<string | null>(null)
  const [editEntries,   setEditEntries]   = useState<Record<string, unknown>[]>([])
  const [savingEdit,    setSavingEdit]    = useState(false)
  const [editError,     setEditError]     = useState<string | null>(null)

  // ── Participants (Worked With) ────────────────────────────────────────────────
  const [participantIds,    setParticipantIds]    = useState<string[]>(
    (existingUpdate?.participant_ids as string[]) ?? []
  )
  const [participantSearch, setParticipantSearch] = useState("")

  function toggleParticipant(id: string) {
    setParticipantIds(prev => prev.includes(id) ? prev.filter(p => p !== id) : [...prev, id])
  }

  const filteredMembers = participantSearch.trim()
    ? teamMembers.filter(m => m.name.toLowerCase().includes(participantSearch.toLowerCase()) || m.employee_id.toLowerCase().includes(participantSearch.toLowerCase()))
    : teamMembers

  // Autosave time blocks
  useEffect(() => {
    if (workingDone || existingUpdate) return
    try { localStorage.setItem(DRAFT_KEY, JSON.stringify({ date: getTodayStr(), blocks: timeBlocks })) } catch { /* ignore */ }
  }, [timeBlocks, workingDone, existingUpdate]) // eslint-disable-line react-hooks/exhaustive-deps

  const totalShootHours  = useMemo(() => shoots.reduce((s, e) => s + e.durationHours, 0), [shoots])
  const totalTravelHours = useMemo(() => shoots.reduce((s, e) => s + e.travelHours, 0), [shoots])
  const totalEditHours  = useMemo(() => edits.reduce((s, e) => s + calcDuration(e.startTime, e.endTime), 0), [edits])
  const totalMediaHours = totalShootHours + totalEditHours
  const totalLoggedHours = useMemo(() => timeBlocks.reduce((s, b) => s + b.durationHours, 0), [timeBlocks])
  const filledBlocks     = timeBlocks.filter(b => !b.isBreak && b.description.trim())
  const breakBlocks      = timeBlocks.filter(b => b.isBreak && b.durationHours > 0)
  const generalProductivity = useMemo(() => {
    if (filledBlocks.length === 0) return 0
    return Math.round((filledBlocks.filter(b => b.status === "completed").length / filledBlocks.length) * 100)
  }, [filledBlocks])

  // ── Submit: working (time blocks) ────────────────────────────────────────
  function handleWorkingSubmit() {
    setWorkingError(null)
    if (filledBlocks.length === 0) { setWorkingError("Add at least one time block with a description."); return }
    const work_entries = [
      ...filledBlocks.map(t => {
        const effClient = t.projectName === "Promotion" ? (t.brand || "Our Brand")
          : t.projectName === "__custom__" ? (t.customClient || "Internal")
          : (t.projectName || "Internal")
        const isMulti = t.clientNames.length > 1
        return {
          id: t.id,
          client_id: projects.find(p => p.business_name === (t.clientNames[0] || effClient))?.id ?? null,
          client_name: t.clientNames.length > 0 ? t.clientNames[0] : effClient,
          client_names: t.clientNames.length > 0 ? t.clientNames : (effClient !== "Internal" ? [effClient] : []),
          is_multi_client: isMulti,
          task_type: "other" as const,
          title: t.description, start_time: t.startTime, end_time: t.endTime,
          duration_hours: t.durationHours, notes: `[${t.status}]`,
          video_uploaded: null, screenshot_url: "", video_link: "", editing_videos: [],
        }
      }),
      ...breakBlocks.map(t => ({
        id: t.id,
        client_id: null,
        client_name: "Break",
        client_names: [],
        is_multi_client: false,
        task_type: "break" as const,
        title: t.breakLabel || "Break",
        start_time: t.startTime, end_time: t.endTime,
        duration_hours: t.durationHours, notes: undefined,
        video_uploaded: null, screenshot_url: "", video_link: "", editing_videos: [],
      })),
    ]
    const allParticipantIds = [...new Set(filledBlocks.flatMap(b => b.participantIds))]
    startTransition(async () => {
      const res = await submitDailyUpdate({
        active_tab: "working", date: selectedDate, work_entries, links: [],
        shoot_count: 0, editing_count: 0,
        shoot_time_hours: 0, editing_time_hours: 0, learning_hours: 0,
        participant_ids: allParticipantIds,
      })
      if (!res.success) setWorkingError(res.error ?? "Submission failed.")
      else { try { localStorage.removeItem(DRAFT_KEY) } catch { /* ignore */ }; setWorkingDone(true); router.refresh() }
    })
  }

  // ── Submit: media (shoots + edits + breaks) ──────────────────────────────
  function handleMediaSubmit() {
    setError(null)
    if (tab !== "break" && shoots.length === 0 && edits.length === 0) { setError("Add at least one shoot or edit entry."); return }
    const work_entries = [
      ...shoots.map(s => ({
        id: s.id, client_id: projects.find(p => p.business_name === s.clientName)?.id ?? null,
        client_name: s.clientName === "__custom__" ? (s.customClient || "Custom") : s.clientName === "Promotion" ? (s.brand || "Promotion") : s.clientName || "Internal",
        task_type: "shoot" as const,
        title: s.title || "Shoot", start_time: s.startTime, end_time: s.endTime,
        duration_hours: s.durationHours, notes: [s.clientName === "Promotion" && s.brand ? `Brand: ${s.brand}` : "", (s.clientName === "Promotion" || s.clientName === "__custom__") && s.shopName ? `Shop: ${s.shopName}` : "", s.clientName === "__custom__" && s.customClient ? `Client: ${s.customClient}` : "", s.location ? `Location: ${s.location}` : "", s.notes, s.travelHours > 0 ? `Travel: ${s.travelHours}h` : ""].filter(Boolean).join(" | "), video_uploaded: s.videoUploaded,
        screenshot_url: "", video_link: s.driveLink, editing_videos: [],
        _client_type: s.clientName, _brand: s.brand, _shop_name: s.shopName, _custom_client: s.customClient, _location: s.location, _travel_hours: s.travelHours, _camera_hours: s.cameraHours, _drone_hours: s.droneHours,
        participant_ids: s.participantIds,
      })),
      ...edits.map(e => {
        const overlapH = calcOverlapHours(e.startTime, e.endTime, shoots)
        const validH = Math.max(0, e.timeTaken - overlapH)
        const finalVideoType = e.videoType === "__other__" ? (e.customVideoType || "Other") : e.videoType
        return {
          id: e.id, client_id: projects.find(p => p.business_name === e.clientName)?.id ?? null,
          client_name: e.clientName === "__custom__" ? (e.customClient || "Custom") : e.clientName === "Promotion" ? (e.brand || "Promotion") : e.clientName || "Internal",
          task_type: "edit" as const,
          title: e.title || "Editing", start_time: e.startTime, end_time: e.endTime,
          duration_hours: validH || e.timeTaken, notes: overlapH > 0 ? `[overlap:${overlapH}h] ${e.notes}`.trim() : e.notes, video_uploaded: null,
          screenshot_url: "", video_link: e.videoLink, editing_videos: [],
          video_type: finalVideoType, video_duration: e.videoDuration,
          date_given: e.dateGiven, date_finished: e.dateFinished,
          drive_updated: e.driveUpdated, revisions: e.revisions,
          _client_type: e.clientName, _brand: e.brand, _custom_client: e.customClient, _overlap_hours: overlapH,
          participant_ids: e.participantIds,
        }
      }),
      ...mediaBreaks.filter(b => b.durationHours > 0).map(b => ({
        id: b.id, client_id: null, client_name: "Break", client_names: [], is_multi_client: false,
        task_type: "break" as const,
        title: b.label || "Break", start_time: b.startTime, end_time: b.endTime,
        duration_hours: b.durationHours, notes: undefined,
        video_uploaded: null, screenshot_url: "", video_link: "", editing_videos: [],
      })),
    ]
    const totalOverlapHours = edits.reduce((acc, e) => acc + calcOverlapHours(e.startTime, e.endTime, shoots), 0)
    const validEditHours = Math.max(0, totalEditHours - totalOverlapHours)
    startTransition(async () => {
      const res = await submitDailyUpdate({
        active_tab: "media", date: selectedDate, work_entries, links: [],
        shoot_count: shoots.length, editing_count: edits.length,
        shoot_time_hours: totalShootHours, editing_time_hours: validEditHours,
        learning_hours: 0,
        participant_ids: participantIds,
      })
      if (!res.success) setError(res.error ?? "Submission failed.")
      else { setSubmitted(true); router.refresh() }
    })
  }

  // ── Per-entry save (media) ────────────────────────────────────────────────
  function handleSaveEntry(entryId: string) {
    setError(null)
    const editEntry = edits.find(e => e.id === entryId)
    // drive link optional — just warn, don't block
    const shootEntry = shoots.find(s => s.id === entryId)
    const work_entries = [
      ...shoots.map(s => ({
        id: s.id, client_id: projects.find(p => p.business_name === s.clientName)?.id ?? null,
        client_name: s.clientName === "__custom__" ? (s.customClient || "Custom") : s.clientName === "Promotion" ? (s.brand || "Promotion") : s.clientName || "Internal",
        task_type: "shoot" as const,
        title: s.title || "Shoot", start_time: s.startTime, end_time: s.endTime,
        duration_hours: s.durationHours, notes: [s.clientName === "Promotion" && s.brand ? `Brand: ${s.brand}` : "", (s.clientName === "Promotion" || s.clientName === "__custom__") && s.shopName ? `Shop: ${s.shopName}` : "", s.clientName === "__custom__" && s.customClient ? `Client: ${s.customClient}` : "", s.location ? `Location: ${s.location}` : "", s.notes, s.travelHours > 0 ? `Travel: ${s.travelHours}h` : ""].filter(Boolean).join(" | "), video_uploaded: s.videoUploaded,
        screenshot_url: "", video_link: s.driveLink, editing_videos: [],
        _client_type: s.clientName, _brand: s.brand, _shop_name: s.shopName, _custom_client: s.customClient, _location: s.location, _travel_hours: s.travelHours, _camera_hours: s.cameraHours, _drone_hours: s.droneHours,
        participant_ids: s.participantIds,
      })),
      ...edits.map(e => {
        const overlapH = calcOverlapHours(e.startTime, e.endTime, shoots)
        const validH = Math.max(0, e.timeTaken - overlapH)
        const finalVideoType = e.videoType === "__other__" ? (e.customVideoType || "Other") : e.videoType
        return {
          id: e.id, client_id: projects.find(p => p.business_name === e.clientName)?.id ?? null,
          client_name: e.clientName === "__custom__" ? (e.customClient || "Custom") : e.clientName === "Promotion" ? (e.brand || "Promotion") : e.clientName || "Internal",
          task_type: "edit" as const,
          title: e.title || "Editing", start_time: e.startTime, end_time: e.endTime,
          duration_hours: validH || e.timeTaken, notes: overlapH > 0 ? `[overlap:${overlapH}h] ${e.notes}`.trim() : e.notes, video_uploaded: null,
          screenshot_url: "", video_link: e.videoLink, editing_videos: [],
          video_type: finalVideoType, video_duration: e.videoDuration,
          date_given: e.dateGiven, date_finished: e.dateFinished,
          drive_updated: e.driveUpdated, revisions: e.revisions,
          _client_type: e.clientName, _brand: e.brand, _custom_client: e.customClient, _overlap_hours: overlapH,
          participant_ids: e.participantIds,
        }
      }),
    ]
    const saveOverlapHours = edits.reduce((acc, e) => acc + calcOverlapHours(e.startTime, e.endTime, shoots), 0)
    const saveValidEditHours = Math.max(0, totalEditHours - saveOverlapHours)
    startTransition(async () => {
      const res = await submitDailyUpdate({
        active_tab: "media", date: selectedDate, work_entries, links: [],
        shoot_count: shoots.length, editing_count: edits.length,
        shoot_time_hours: totalShootHours, editing_time_hours: saveValidEditHours,
        learning_hours: 0,
        participant_ids: participantIds,
      })
      if (!res.success) setError(res.error ?? "Save failed.")
      else setSavedIds(prev => new Set([...prev, entryId]))
    })
  }

  // ── Submit: learning ─────────────────────────────────────────────────────
  function handleLearningSubmit() {
    setLearningError(null)
    if (!learningTopic.trim()) { setLearningError("Enter what you learned today."); return }
    if (!learningFrom || !learningTo) { setLearningError("Set the From and To time."); return }
    if (learningHours <= 0) { setLearningError("To time must be after From time."); return }
    startTransition(async () => {
      const res = await submitDailyUpdate({
        active_tab: "learning", date: selectedDate, work_entries: [], links: [],
        shoot_count: 0, editing_count: 0,
        shoot_time_hours: 0, editing_time_hours: 0,
        learning_hours: learningHours,
        learning_topic: `[${learningClient}] ${learningTopic}`.trim(),
        learning_notes: learningNotes,
        participant_ids: learningParticipantIds,
      })
      if (!res.success) setLearningError(res.error ?? "Submission failed.")
      else { setLearningDone(true); router.refresh() }
    })
  }

  function handleBreakSubmit() {
    setError(null)
    const breakEntries = isMediaTeam
      ? mediaBreaks.filter(b => b.durationHours > 0).map(b => ({
          id: b.id, client_id: null, client_name: "Break", client_names: [], is_multi_client: false,
          task_type: "break" as const,
          title: b.label || "Break", start_time: b.startTime, end_time: b.endTime,
          duration_hours: b.durationHours, notes: undefined,
          video_uploaded: null, screenshot_url: "", video_link: "", editing_videos: [],
        }))
      : breakBlocks.map(t => ({
          id: t.id, client_id: null, client_name: "Break", client_names: [], is_multi_client: false,
          task_type: "break" as const,
          title: t.breakLabel || "Break", start_time: t.startTime, end_time: t.endTime,
          duration_hours: t.durationHours, notes: undefined,
          video_uploaded: null, screenshot_url: "", video_link: "", editing_videos: [],
        }))
    if (breakEntries.length === 0) { setError("Add at least one break with a duration."); return }
    startTransition(async () => {
      const res = await submitDailyUpdate({
        active_tab: "break", date: selectedDate, work_entries: breakEntries, links: [],
        shoot_count: 0, editing_count: 0,
        shoot_time_hours: 0, editing_time_hours: 0, learning_hours: 0,
        participant_ids: [],
      })
      if (!res.success) setError(res.error ?? "Submission failed.")
      else { if (isMediaTeam) setSubmitted(true); router.refresh() }
    })
  }

  function handleSubmit() {
    if (tab === "working") handleWorkingSubmit()
    else if (tab === "media") handleMediaSubmit()
    else if (tab === "break") handleBreakSubmit()
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
  const allDone = isMediaTeam ? (submitted || !!activeUpdate) : (workingDone && learningDone)
  if (allDone && !editMode) {
    return (
      <div style={{ background:"#F5F6FA", minHeight:"100vh", display:"flex", alignItems:"center", justifyContent:"center" }}>
        <div style={{ textAlign:"center" }}>
          <CheckCircle2 size={56} style={{ color:"#22C55E", marginBottom:16 }} />
          <p style={{ fontSize:20, fontWeight:900, color:"#111111", margin:"0 0 8px", fontFamily:"var(--font-jakarta)" }}>Daily Update Submitted!</p>
          <p style={{ fontSize:13, color:"#6B7280", margin:"0 0 20px" }}>Great work, {firstName}. See you tomorrow!</p>
          <button onClick={() => {
            const cur = activeUpdate ?? existingUpdateRef.current ?? {}
            setTimeBlocks(parseExistingBlocks(cur))
            setShoots(parseExistingShoots(cur))
            setEdits(parseExistingEdits(cur))
            setMediaBreaks(parseExistingMediaBreaks(cur))
            setEditMode(true)
            setSubmitted(false)
            if (!isMediaTeam) { setWorkingDone(false); setLearningDone(false) }
          }}
            style={{ display:"inline-flex", alignItems:"center", gap:8, padding:"10px 24px", borderRadius:12, border:"1.5px solid #DE1A1A", background:"#FFFFFF", color:"#DE1A1A", fontSize:13, fontWeight:700, cursor:"pointer" }}>
            Edit {isToday ? "Today's" : dateLabel.split(",")[0] + "'s"} Update
          </button>
        </div>
      </div>
    )
  }

  // day progress ring
  const workStart = 9, workEnd = 18, totalWorkHours = workEnd - workStart
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
    { id: "break"   as const, label: "☕  Break",     desc: "Break in / break out" },
  ]
  const TABS = isMediaTeam
    ? ALL_TABS.filter(t => t.id === "media" || t.id === "learning" || t.id === "break")
    : ALL_TABS.filter(t => t.id === "working" || t.id === "learning" || t.id === "break")

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


      {/* ── DATE SELECTOR ────────────────────────────────────────────────── */}
      <div style={{ background:"#FFFFFF", borderRadius:14, border: isPastDate ? "1.5px solid #F59E0B" : "1px solid #EBEDF2", padding:"10px 16px", display:"flex", alignItems:"center", gap:12, marginBottom:16, boxShadow:"0 1px 4px rgba(0,0,0,0.05)", flexWrap:"wrap" }}>
        <div style={{ display:"flex", alignItems:"center", gap:8, flex:1, minWidth:200 }}>
          <div style={{ width:32, height:32, borderRadius:10, background: isPastDate ? "rgba(245,158,11,0.12)" : "rgba(222,26,26,0.08)", display:"flex", alignItems:"center", justifyContent:"center", flexShrink:0 }}>
            <Calendar size={15} style={{ color: isPastDate ? "#D97706" : "#DE1A1A" }} />
          </div>
          <div>
            <p style={{ fontSize:10, fontWeight:700, color:"#9CA3AF", textTransform:"uppercase", letterSpacing:"0.08em", margin:"0 0 1px" }}>
              {isPastDate ? "Submitting for past date" : "Submitting for today"}
            </p>
            <p style={{ fontSize:13, fontWeight:800, color: isPastDate ? "#D97706" : "#111827", margin:0 }}>
              {dateLabel}
            </p>
          </div>
        </div>
        <div style={{ display:"flex", alignItems:"center", gap:8 }}>
          {isPastDate && (
            <button onClick={() => handleDateChange(todayStr)}
              style={{ fontSize:11, fontWeight:700, padding:"5px 12px", borderRadius:8, border:"1.5px solid #DE1A1A", background:"rgba(222,26,26,0.06)", color:"#DE1A1A", cursor:"pointer", whiteSpace:"nowrap" }}>
              Back to Today
            </button>
          )}
          <label style={{ fontSize:11, fontWeight:700, color:"#6B7280", display:"flex", alignItems:"center", gap:6, cursor:"pointer" }}>
            <span style={{ whiteSpace:"nowrap" }}>{isPastDate ? "Change date" : "Pick past date"}</span>
            <input
              type="date"
              value={selectedDate}
              max={todayStr}
              min={(() => { const d = new Date(); d.setDate(d.getDate() - 30); return d.toISOString().split("T")[0] })()}
              onChange={e => e.target.value && handleDateChange(e.target.value)}
              style={{ fontSize:12, fontWeight:600, color:"#374151", background:"#F9FAFB", border:"1.5px solid #EBEDF2", borderRadius:8, padding:"5px 8px", cursor:"pointer", outline:"none" }}
            />
          </label>
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

          {/* Two-step progress indicator (non-media team) */}
          {!isMediaTeam && (
            <div style={{ background:"#FFFFFF", borderRadius:14, border:"1px solid #EBEDF2", padding:"12px 16px", boxShadow:"0 1px 4px rgba(0,0,0,0.05)", display:"flex", alignItems:"center", gap:8 }}>
              {/* Step 1: Work Log */}
              <div style={{ flex:1, minWidth:0, display:"flex", alignItems:"center", gap:10 }}>
                <div style={{ width:24, height:24, borderRadius:"50%", flexShrink:0, display:"flex", alignItems:"center", justifyContent:"center",
                  background: workingDone ? "#22C55E" : tab === "working" ? "#DE1A1A" : "#E5E7EB",
                  border: workingDone ? "none" : tab === "working" ? "none" : "2px solid #D1D5DB",
                }}>
                  {workingDone
                    ? <span style={{ fontSize:11, color:"#fff", fontWeight:900, lineHeight:1 }}>✓</span>
                    : <span style={{ fontSize:10, color: tab === "working" ? "#fff" : "#9CA3AF", fontWeight:900, lineHeight:1 }}>1</span>
                  }
                </div>
                <div>
                  <p style={{ margin:0, fontSize:12, fontWeight:800, color: workingDone ? "#16A34A" : tab === "working" ? "#111827" : "#9CA3AF" }}>
                    Work Log{workingDone ? " submitted" : ""}
                  </p>
                  <p style={{ margin:0, fontSize:10, color: workingDone ? "#16A34A" : tab === "working" ? "#6B7280" : "#C4C9D4" }}>
                    {workingDone ? "Done ✓" : tab === "working" ? "Fill & submit below" : "Pending"}
                  </p>
                </div>
              </div>

              {/* Connector line */}
              <div style={{ width:24, height:2, borderRadius:99, flexShrink:0, background: workingDone ? "#22C55E" : "#E5E7EB" }} />

              {/* Step 2: Learning */}
              <div style={{ flex:1, minWidth:0, display:"flex", alignItems:"center", gap:10 }}>
                <div style={{ width:24, height:24, borderRadius:"50%", flexShrink:0, display:"flex", alignItems:"center", justifyContent:"center",
                  background: learningDone ? "#22C55E" : tab === "learning" ? "#DE1A1A" : "#E5E7EB",
                  border: learningDone ? "none" : tab === "learning" ? "none" : "2px solid #D1D5DB",
                }}>
                  {learningDone
                    ? <span style={{ fontSize:11, color:"#fff", fontWeight:900, lineHeight:1 }}>✓</span>
                    : <span style={{ fontSize:10, color: tab === "learning" ? "#fff" : "#9CA3AF", fontWeight:900, lineHeight:1 }}>2</span>
                  }
                </div>
                <div>
                  <p style={{ margin:0, fontSize:12, fontWeight:800, color: learningDone ? "#16A34A" : tab === "learning" ? "#111827" : "#9CA3AF" }}>
                    Learning{learningDone ? " submitted" : ""}
                  </p>
                  <p style={{ margin:0, fontSize:10, color: learningDone ? "#16A34A" : tab === "learning" ? "#6B7280" : "#C4C9D4" }}>
                    {learningDone ? "Done ✓" : tab === "learning" ? "Fill & submit below" : "Pending"}
                  </p>
                </div>
              </div>

              {/* Connector line */}
              <div style={{ width:24, height:2, borderRadius:99, flexShrink:0, background: "#E5E7EB" }} />

              {/* Step 3: Break */}
              <div style={{ flex:1, minWidth:0, display:"flex", alignItems:"center", gap:10 }}>
                <div style={{ width:24, height:24, borderRadius:"50%", flexShrink:0, display:"flex", alignItems:"center", justifyContent:"center",
                  background: tab === "break" ? "#D97706" : "#E5E7EB",
                  border: tab === "break" ? "none" : "2px solid #D1D5DB",
                }}>
                  <span style={{ fontSize:10, color: tab === "break" ? "#fff" : "#9CA3AF", fontWeight:900, lineHeight:1 }}>3</span>
                </div>
                <div>
                  <p style={{ margin:0, fontSize:12, fontWeight:800, color: tab === "break" ? "#111827" : "#9CA3AF" }}>Break</p>
                  <p style={{ margin:0, fontSize:10, color: tab === "break" ? "#6B7280" : "#C4C9D4" }}>
                    {tab === "break" ? "Log breaks below" : "Optional"}
                  </p>
                </div>
              </div>
            </div>
          )}

          {/* Tab switcher (non-media team) */}
          {!isMediaTeam && (
            <div style={{ display:"flex", alignItems:"center", gap:8 }}>
              <button onClick={() => setTab("working")} style={{ display:"flex", alignItems:"center", gap:6, padding:"10px 18px", borderRadius:12, flex:1, justifyContent:"center", cursor:"pointer", border:"none", transition:"all 0.18s",
                background: tab === "working" ? "#DE1A1A" : workingDone ? "rgba(34,197,94,0.08)" : "#FFFFFF",
                boxShadow: tab === "working" ? "0 4px 14px rgba(222,26,26,0.35)" : "0 1px 4px rgba(0,0,0,0.06)",
                outline: tab === "working" ? "none" : workingDone ? "1.5px solid rgba(34,197,94,0.3)" : "1.5px solid #EBEDF2",
              }}>
                <div style={{ width:16, height:16, borderRadius:"50%", display:"flex", alignItems:"center", justifyContent:"center", flexShrink:0,
                  background: tab === "working" ? "rgba(255,255,255,0.3)" : workingDone ? "#22C55E" : "#E5E7EB" }}>
                  {workingDone && tab !== "working" && <span style={{ fontSize:9, color:"#fff", fontWeight:900 }}>✓</span>}
                </div>
                <span style={{ fontSize:12, fontWeight:800, color: tab === "working" ? "#fff" : workingDone ? "#16A34A" : "#6B7280" }}>
                  Work Log{workingDone && tab !== "working" ? " ✓" : ""}
                </span>
              </button>
              <button onClick={() => setTab("learning")} style={{ display:"flex", alignItems:"center", gap:6, padding:"10px 18px", borderRadius:12, flex:1, justifyContent:"center", cursor:"pointer", border:"none", transition:"all 0.18s",
                background: tab === "learning" ? "#DE1A1A" : learningDone ? "rgba(34,197,94,0.08)" : "#FFFFFF",
                boxShadow: tab === "learning" ? "0 4px 14px rgba(222,26,26,0.35)" : "0 1px 4px rgba(0,0,0,0.06)",
                outline: tab === "learning" ? "none" : learningDone ? "1.5px solid rgba(34,197,94,0.3)" : "1.5px solid #EBEDF2",
              }}>
                <div style={{ width:16, height:16, borderRadius:"50%", display:"flex", alignItems:"center", justifyContent:"center", flexShrink:0,
                  background: tab === "learning" ? "rgba(255,255,255,0.3)" : learningDone ? "#22C55E" : "#E5E7EB" }}>
                  {learningDone && tab !== "learning" && <span style={{ fontSize:9, color:"#fff", fontWeight:900 }}>✓</span>}
                </div>
                <span style={{ fontSize:12, fontWeight:800, color: tab === "learning" ? "#fff" : learningDone ? "#16A34A" : "#6B7280" }}>
                  Learning{learningDone && tab !== "learning" ? " ✓" : ""}
                </span>
              </button>
              <button onClick={() => setTab("break")} style={{ display:"flex", alignItems:"center", gap:6, padding:"10px 18px", borderRadius:12, flex:1, justifyContent:"center", cursor:"pointer", border:"none", transition:"all 0.18s",
                background: tab === "break" ? "#D97706" : "#FFFFFF",
                boxShadow: tab === "break" ? "0 4px 14px rgba(217,119,6,0.35)" : "0 1px 4px rgba(0,0,0,0.06)",
                outline: tab === "break" ? "none" : "1.5px solid #EBEDF2",
              }}>
                <span style={{ fontSize:12, fontWeight:800, color: tab === "break" ? "#fff" : "#6B7280" }}>☕ Break</span>
              </button>
            </div>
          )}

          {/* ══ WORKING: Time Blocks ══════════════════════════════════════════ */}
          {tab === "working" && (
            <div style={{ background:"#FFFFFF", borderRadius:20, border:"1px solid #EBEDF2", padding:"20px 22px", boxShadow:"0 2px 10px rgba(0,0,0,0.05)" }}>
              <div style={{ display:"flex", alignItems:"center", justifyContent:"space-between", marginBottom:20 }}>
                <div style={{ display:"flex", alignItems:"center", gap:10 }}>
                  <div style={{ width:34, height:34, borderRadius:10, background:"rgba(222,26,26,0.1)", display:"flex", alignItems:"center", justifyContent:"center" }}>
                    <Clock size={16} style={{ color:"#DE1A1A" }} />
                  </div>
                  <div>
                    <p style={{ fontSize:14, fontWeight:800, color:"#111111", margin:0 }}>Today&apos;s Time Log</p>
                    <p style={{ fontSize:10, color:"#9CA3AF", margin:0 }}>{filledBlocks.length} {filledBlocks.length === 1 ? "block" : "blocks"} · {totalLoggedHours.toFixed(1)}h logged{breakBlocks.length > 0 ? ` · ${breakBlocks.length} break${breakBlocks.length > 1 ? "s" : ""}` : ""}</p>
                  </div>
                </div>
                <div style={{ display:"flex", gap:8 }}>
                  <button onClick={addTimeBlock}
                    style={{ display:"flex", alignItems:"center", gap:6, padding:"8px 16px", borderRadius:10, border:"none", background:"#DE1A1A", color:"#FFFFFF", fontSize:12, fontWeight:700, cursor:"pointer" }}>
                    <Plus size={13} /> Add Time Block
                  </button>
                  <button onClick={addBreakBlock} style={{ display:"none" }}>
                    <Coffee size={13} /> Break
                  </button>
                </div>
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
                    const usedByOthers = new Set(
                      timeBlocks
                        .filter(b => b.id !== block.id)
                        .flatMap(b => [b.startTime, b.endTime])
                    )
                    const statusCfg = block.status === "completed"
                      ? { bg:"rgba(34,197,94,0.08)", color:"#16A34A", border:"rgba(34,197,94,0.25)" }
                      : block.status === "in_progress"
                      ? { bg:"rgba(245,158,11,0.08)", color:"#D97706", border:"rgba(245,158,11,0.25)" }
                      : { bg:"#F9FAFB", color:"#9CA3AF", border:"#E5E7EB" }
                    return (
                      <div key={block.id} style={{ background: block.isBreak ? "#FFFBEB" : "#F9FAFB", borderRadius:14, border: block.isBreak ? "1.5px solid rgba(245,158,11,0.35)" : "1px solid #EBEDF2", padding:"12px 14px", display:"flex", flexDirection:"column", gap:10 }}>

                        {/* ── Block header: Work/Break toggle + break label + delete ── */}
                        <div style={{ display:"flex", alignItems:"center", gap:8, flexWrap:"wrap" }}>
                          <div style={{ display:"flex", alignItems:"center", background:"#F3F4F6", borderRadius:8, padding:"2px 3px", gap:2 }}>
                            <button type="button" onClick={() => patchBlock(block.id, { isBreak: false })}
                              style={{ padding:"4px 10px", borderRadius:6, fontSize:11, fontWeight:700, border:"none", cursor:"pointer", background: !block.isBreak ? "#FFFFFF" : "transparent", color: !block.isBreak ? "#111827" : "#9CA3AF", boxShadow: !block.isBreak ? "0 1px 3px rgba(0,0,0,0.1)" : "none" }}>
                              ⏰ Work
                            </button>
                            <button type="button" onClick={() => patchBlock(block.id, { isBreak: true, description:"", clientNames:[], projectName:"", status:"not_started" as const })}
                              style={{ padding:"4px 10px", borderRadius:6, fontSize:11, fontWeight:700, border:"none", cursor:"pointer", background: block.isBreak ? "#FEF3C7" : "transparent", color: block.isBreak ? "#D97706" : "#9CA3AF", boxShadow: block.isBreak ? "0 1px 3px rgba(0,0,0,0.1)" : "none" }}>
                              ☕ Break
                            </button>
                          </div>
                          {block.isBreak && (
                            <select value={block.breakLabel} onChange={e => patchBlock(block.id, { breakLabel: e.target.value })}
                              style={{ fontSize:11, fontWeight:700, color:"#D97706", background:"#FEF3C7", border:"1.5px solid rgba(245,158,11,0.4)", borderRadius:8, padding:"4px 10px", cursor:"pointer", outline:"none" }}>
                              <option value="Lunch">🍱 Lunch</option>
                              <option value="Tea">☕ Tea Break</option>
                              <option value="Short Break">🚶 Short Break</option>
                              <option value="Personal">🏠 Personal</option>
                            </select>
                          )}
                          <button onClick={() => removeBlock(block.id)} style={{ marginLeft:"auto", background:"none", border:"none", cursor:"pointer", padding:4, borderRadius:8, display:"flex", flexShrink:0 }}>
                            <Trash2 size={13} style={{ color:"#EF4444" }} />
                          </button>
                        </div>

                        {/* ── Time row ── */}
                        <div style={{ display:"flex", alignItems:"center", gap:8, flexWrap:"wrap" }}>
                          {block.isBreak
                            ? <Coffee size={13} style={{ color:"#D97706", flexShrink:0 }} />
                            : <Clock size={13} style={{ color:"#DE1A1A", flexShrink:0 }} />}
                          <div style={{ display:"flex", alignItems:"center", gap:6, flex:1, minWidth:200 }}>
                            <TimePicker value={block.startTime} onChange={v => patchBlock(block.id, { startTime: v })} />
                            <span style={{ fontSize:11, color:"#9CA3AF", flexShrink:0 }}>to</span>
                            <TimePicker value={block.endTime} onChange={v => patchBlock(block.id, { endTime: v })} />
                            {block.durationHours > 0 && (
                              <span style={{ fontSize:10, fontWeight:700, padding:"3px 8px", borderRadius:99, background: block.isBreak ? "rgba(245,158,11,0.12)" : "rgba(99,102,241,0.1)", color: block.isBreak ? "#D97706" : "#6366F1", flexShrink:0 }}>{fmtTravel(block.durationHours)}</span>
                            )}
                          </div>
                        </div>

                        {/* ── Work-only fields ── */}
                        {!block.isBreak && (<>
                          <div style={{ display:"flex", alignItems:"center", gap:8, flexWrap:"wrap" }}>
                            <input value={block.description} onChange={e => patchBlock(block.id, { description: e.target.value })}
                              placeholder="What did you work on?"
                              style={{ flex:1, minWidth:140, background:"#FFFFFF", border:"1.5px solid #EBEDF2", borderRadius:8, padding:"7px 10px", fontSize:12, color:"#111827", outline:"none" }} />
                            <select value={block.status} onChange={e => patchBlock(block.id, { status: e.target.value as TimeBlock["status"] })}
                              style={{ fontSize:11, fontWeight:700, color:statusCfg.color, background:statusCfg.bg, border:`1.5px solid ${statusCfg.border}`, borderRadius:8, padding:"7px 10px", cursor:"pointer", outline:"none" }}>
                              <option value="not_started">Not Started</option>
                              <option value="in_progress">In Progress</option>
                              <option value="completed">Completed ✓</option>
                            </select>
                          </div>
                          {/* Client / Project multi-select */}
                          <div style={{ marginTop:4 }}>
                            <p style={{ fontSize:10, fontWeight:700, color:"#9CA3AF", textTransform:"uppercase", letterSpacing:"0.1em", marginBottom:5 }}>Client / Project</p>
                            <div style={{ position:"relative" }}>
                              {showPastFor.has(`blk-${block.id}`) ? (
                                <select value="" onChange={e => { const v = e.target.value; if (!v) return; if (v === "__back__") { exitPastMode(`blk-${block.id}`); return } if (!block.clientNames.includes(v)) patchBlock(block.id, { clientNames: [...block.clientNames, v], isMultiClient: block.clientNames.length >= 1, projectName: "", brand: "", customClient: "" }); exitPastMode(`blk-${block.id}`) }}
                                  style={{ width:"100%", fontSize:12, fontWeight:600, color:"#374151", background:"#fff", border:"1.5px solid #EBEDF2", borderRadius:10, padding:"8px 28px 8px 10px", cursor:"pointer", outline:"none", appearance:"none" }}>
                                  <option value="__back__">← Back to Active Clients</option>
                                  {pastClientOptions.filter(n => !block.clientNames.includes(n)).map(n => <option key={n} value={n}>{n}</option>)}
                                </select>
                              ) : (
                              <select value="" onChange={e => { const v = e.target.value; if (!v) return; if (v === "__past_clients__") { enterPastMode(`blk-${block.id}`) } else if (v === "__custom__") { patchBlock(block.id, { projectName: v, clientNames: [], brand: "", customClient: "" }) } else { if (!block.clientNames.includes(v)) patchBlock(block.id, { clientNames: [...block.clientNames, v], isMultiClient: block.clientNames.length >= 1, projectName: "", brand: "", customClient: "" }) } }}
                                style={{ width:"100%", fontSize:12, fontWeight:600, color:"#374151", background:"#fff", border:"1.5px solid #EBEDF2", borderRadius:10, padding:"8px 28px 8px 10px", cursor:"pointer", outline:"none", appearance:"none" }}>
                                <option value="">Add client / project…</option>
                                {activeClientOptions.filter(n => !block.clientNames.includes(n)).map(n => <option key={n} value={n}>{n}</option>)}
                                {pastClientOptions.length > 0 && <option value="__past_clients__">📁 Past Clients →</option>}
                                {!block.projectName && <option value="__custom__">✏️ Other (type manually)</option>}
                              </select>
                              )}
                              <ChevronDown size={11} style={{ position:"absolute", right:10, top:"50%", transform:"translateY(-50%)", color:"#9CA3AF", pointerEvents:"none" }} />
                            </div>
                            {(block.clientNames.length > 0 || block.projectName) && (
                              <div style={{ display:"flex", flexWrap:"wrap", gap:4, marginTop:6 }}>
                                {block.clientNames.map(name => (
                                  <button key={name} type="button"
                                    onClick={() => patchBlock(block.id, { clientNames: block.clientNames.filter(n => n !== name), isMultiClient: block.clientNames.length > 2 })}
                                    style={{ display:"flex", alignItems:"center", gap:4, padding:"3px 8px", borderRadius:99, background:"rgba(222,26,26,0.08)", border:"1.5px solid rgba(222,26,26,0.25)", cursor:"pointer" }}>
                                    <span style={{ fontSize:10, fontWeight:700, color:"#de1a1a" }}>{name}</span>
                                    <span style={{ fontSize:8, color:"#de1a1a" }}>✕</span>
                                  </button>
                                ))}
                                {block.projectName === "__custom__" && (
                                  <button type="button" onClick={() => patchBlock(block.id, { projectName: "", brand: "", customClient: "" })}
                                    style={{ display:"flex", alignItems:"center", gap:4, padding:"3px 8px", borderRadius:99, background:"rgba(99,102,241,0.08)", border:"1.5px solid rgba(99,102,241,0.3)", cursor:"pointer" }}>
                                    <span style={{ fontSize:10, fontWeight:700, color:"#6366F1" }}>✏️ Other</span>
                                    <span style={{ fontSize:8, color:"#6366F1" }}>✕</span>
                                  </button>
                                )}
                              </div>
                            )}
                            {block.projectName === "__custom__" && (
                              <input value={block.customClient} onChange={e => patchBlock(block.id, { customClient: e.target.value })}
                                placeholder="Type client name…"
                                style={{ width:"100%", fontSize:11, fontWeight:600, color:"#111827", background:"#fff", border:"1.5px solid #EBEDF2", borderRadius:8, padding:"7px 10px", outline:"none", boxSizing:"border-box", marginTop:6 }} />
                            )}
                            {/* Worked With — per block */}
                            {teamMembers.length > 0 && (
                              <div style={{ marginTop:10, paddingTop:10, borderTop:"1px dashed #EBEDF2" }}>
                                <p style={{ fontSize:10, fontWeight:700, color:"#9CA3AF", textTransform:"uppercase", letterSpacing:"0.07em", margin:"0 0 7px" }}>👥 Worked With</p>
                                <div style={{ position:"relative" }}>
                                  <select value="" onChange={e => {
                                    const id = e.target.value
                                    if (id && !block.participantIds.includes(id))
                                      patchBlock(block.id, { participantIds: [...block.participantIds, id] })
                                  }} style={{ width:"100%", fontSize:12, fontWeight:600, color:"#374151", background:"#fff", border:"1.5px solid #EBEDF2", borderRadius:10, padding:"8px 28px 8px 10px", cursor:"pointer", outline:"none", appearance:"none" }}>
                                    <option value="">Add teammate…</option>
                                    {teamMembers.filter(m => !block.participantIds.includes(m.id)).map(m => (
                                      <option key={m.id} value={m.id}>{m.name}</option>
                                    ))}
                                  </select>
                                  <ChevronDown size={11} style={{ position:"absolute", right:10, top:"50%", transform:"translateY(-50%)", color:"#9CA3AF", pointerEvents:"none" }} />
                                </div>
                                {block.participantIds.length > 0 && (
                                  <div style={{ display:"flex", flexWrap:"wrap", gap:4, marginTop:6 }}>
                                    {block.participantIds.map(pid => {
                                      const m = teamMembers.find(t => t.id === pid)
                                      if (!m) return null
                                      const initials = m.name.split(" ").map((n:string) => n[0]).join("").slice(0,2).toUpperCase()
                                      return (
                                        <button key={pid} type="button"
                                          onClick={() => patchBlock(block.id, { participantIds: block.participantIds.filter(p => p !== pid) })}
                                          style={{ display:"flex", alignItems:"center", gap:4, padding:"3px 8px 3px 5px", borderRadius:99, background:"rgba(99,102,241,0.1)", border:"1.5px solid rgba(99,102,241,0.3)", cursor:"pointer" }}>
                                          <div style={{ width:16, height:16, borderRadius:"50%", background:"#6366F1", display:"flex", alignItems:"center", justifyContent:"center", fontSize:7, fontWeight:900, color:"#fff" }}>{initials}</div>
                                          <span style={{ fontSize:10, fontWeight:700, color:"#4338CA" }}>{m.name.split(" ")[0]}</span>
                                          <span style={{ fontSize:8, color:"#818CF8" }}>✕</span>
                                        </button>
                                      )
                                    })}
                                  </div>
                                )}
                              </div>
                            )}
                          </div>
                        </>)}
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
                { label:"SHOOTS",       value:`${shoots.length}`,        color:"#DE1A1A", bg:"rgba(222,26,26,0.07)",   icon:"📸" },
                { label:"HRS SHOOTING", value:`${totalShootHours}h`,    color:"#EF4444", bg:"rgba(239,68,68,0.07)",   icon:"🎥" },
                { label:"TRAVEL HRS",   value: fmtTravel(totalTravelHours) ?? "0",   color:"#F59E0B", bg:"rgba(245,158,11,0.07)",  icon:"🚗" },
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
                          <div style={{ position:"relative" }}>
                            {(showPastFor.has(s.id) || pastClientOptions.includes(s.clientName)) ? (
                              <div>
                                <button type="button" onClick={() => { exitPastMode(s.id); patchShoot(s.id, { clientName: "", brand:"", shopName:"", customClient:"" }) }}
                                  style={{ fontSize:11, fontWeight:700, color:"#6366F1", background:"none", border:"none", cursor:"pointer", padding:"0 0 6px", display:"block" }}>
                                  ← Back to Active Clients
                                </button>
                                <div style={{ position:"relative" }}>
                                  <select value={s.clientName}
                                    onChange={e => { patchShoot(s.id, { clientName: e.target.value, brand:"", shopName:"", customClient:"" }); exitPastMode(s.id) }}
                                    style={{ ...F, paddingRight:28, appearance:"none" }}>
                                    <option value="">Select past client…</option>
                                    {pastClientOptions.map(n => <option key={n} value={n}>{n}</option>)}
                                  </select>
                                  <ChevronDown size={11} style={{ position:"absolute", right:10, top:"50%", transform:"translateY(-50%)", color:"#9CA3AF", pointerEvents:"none" }} />
                                </div>
                              </div>
                            ) : (
                            <select value={s.clientName} onChange={e => { const v = e.target.value; if (v === "__past_clients__") { enterPastMode(s.id) } else { patchShoot(s.id, { clientName: v, brand:"", shopName:"", customClient:"" }) } }} style={{ ...F, paddingRight:28, appearance:"none" }}>
                              <option value="">Select client…</option>
                              {activeClientOptions.map(n => <option key={n} value={n}>{n}</option>)}
                              {pastClientOptions.length > 0 && <option value="__past_clients__">📁 Past Clients →</option>}
                              <option value="__custom__">✏️ Other (type manually)</option>
                            </select>
                            )}
                            <ChevronDown size={11} style={{ position:"absolute", right:10, top:"50%", transform:"translateY(-50%)", color:"#9CA3AF", pointerEvents:"none" }} />
                          </div>
                        </div>
                        <div>
                          <label style={{ display:"block", fontSize:10, fontWeight:700, color:"#374151", textTransform:"uppercase", letterSpacing:"0.1em", marginBottom:5 }}>Shoot Type / Title *</label>
                          <input value={s.title} onChange={e => patchShoot(s.id, { title: e.target.value })} placeholder="e.g. Basketball Tournament Shoot" style={F} />
                        </div>
                      </div>

                      {/* Custom client sub-fields */}
                      {s.clientName === "__custom__" && (
                        <div style={{ marginBottom:10, padding:"12px 14px", borderRadius:12, background:"rgba(99,102,241,0.05)", border:"1.5px solid rgba(99,102,241,0.2)" }}>
                          <label style={{ display:"block", fontSize:10, fontWeight:700, color:"#6366F1", textTransform:"uppercase", letterSpacing:"0.1em", marginBottom:5 }}>✏️ Client Name *</label>
                          <input value={s.customClient} onChange={e => patchShoot(s.id, { customClient: e.target.value })} placeholder="Type client name…" style={F} />
                        </div>
                      )}



                      <div style={{ marginBottom:10 }}>
                        <label style={{ display:"block", fontSize:10, fontWeight:700, color:"#374151", textTransform:"uppercase", letterSpacing:"0.1em", marginBottom:5 }}>Time</label>
                        <div style={{ display:"flex", alignItems:"center", gap:8, flexWrap:"wrap" }}>
                          <TimePicker value={s.startTime} onChange={st => patchShoot(s.id, { startTime: st, durationHours: calcDuration(st, s.endTime) })} />
                          <span style={{ fontSize:11, color:"#9CA3AF", flexShrink:0 }}>to</span>
                          <TimePicker value={s.endTime} onChange={et => patchShoot(s.id, { endTime: et, durationHours: calcDuration(s.startTime, et) })} />
                        </div>
                      </div>
                      <div style={{ marginBottom:10 }}>
                        <label style={{ display:"block", fontSize:10, fontWeight:700, color:"#374151", textTransform:"uppercase", letterSpacing:"0.1em", marginBottom:5 }}>Duration</label>
                        <div style={{ display:"inline-flex", alignItems:"center", gap:6, padding:"8px 14px", borderRadius:8, background: calcDuration(s.startTime, s.endTime) > 0 ? "rgba(222,26,26,0.06)" : "#F9FAFB", border: calcDuration(s.startTime, s.endTime) > 0 ? "1.5px solid rgba(222,26,26,0.2)" : "1.5px solid #EBEDF2" }}>
                          <span style={{ fontSize:13, fontWeight:700, color: calcDuration(s.startTime, s.endTime) > 0 ? "#DE1A1A" : "#9CA3AF" }}>
                            {calcDuration(s.startTime, s.endTime) > 0 ? fmtTravel(calcDuration(s.startTime, s.endTime)) : "—"}
                          </span>
                          <span style={{ fontSize:10, color:"#9CA3AF", fontWeight:500 }}>auto</span>
                        </div>
                      </div>
                      {/* Shoot type toggles + hours */}
                      <div style={{ marginBottom:10 }}>
                        <label style={{ display:"block", fontSize:10, fontWeight:700, color:"#374151", textTransform:"uppercase", letterSpacing:"0.1em", marginBottom:8 }}>Shoot Type</label>
                        <div style={{ display:"flex", gap:8, marginBottom:10 }}>
                          <button type="button"
                            onClick={() => patchShoot(s.id, { cameraHours: s.cameraHours > 0 ? 0 : 1 })}
                            style={{ display:"flex", alignItems:"center", gap:6, padding:"8px 14px", borderRadius:10, border: s.cameraHours > 0 ? "2px solid #6366F1" : "1.5px solid #EBEDF2", background: s.cameraHours > 0 ? "rgba(99,102,241,0.1)" : "#F9FAFB", color: s.cameraHours > 0 ? "#4338CA" : "#6B7280", fontSize:12, fontWeight:700, cursor:"pointer" }}>
                            📷 Camera Shoot
                          </button>
                          <button type="button"
                            onClick={() => patchShoot(s.id, { droneHours: s.droneHours > 0 ? 0 : 1 })}
                            style={{ display:"flex", alignItems:"center", gap:6, padding:"8px 14px", borderRadius:10, border: s.droneHours > 0 ? "2px solid #D97706" : "1.5px solid #EBEDF2", background: s.droneHours > 0 ? "rgba(245,158,11,0.1)" : "#F9FAFB", color: s.droneHours > 0 ? "#D97706" : "#6B7280", fontSize:12, fontWeight:700, cursor:"pointer" }}>
                            🚁 Drone Shooting
                          </button>
                        </div>
                        {s.cameraHours > 0 && (
                          <div style={{ marginBottom:8 }}>
                            <label style={{ display:"block", fontSize:10, fontWeight:600, color:"#6B7280", marginBottom:5 }}>📷 Camera Hours</label>
                            <DurationPicker value={s.cameraHours} onChange={v => patchShoot(s.id, { cameraHours: v })} />
                          </div>
                        )}
                        {s.droneHours > 0 && (
                          <div style={{ marginBottom:8 }}>
                            <label style={{ display:"block", fontSize:10, fontWeight:600, color:"#6B7280", marginBottom:5 }}>🚁 Drone Hours</label>
                            <DurationPicker value={s.droneHours} onChange={v => patchShoot(s.id, { droneHours: v })} />
                          </div>
                        )}
                        {s.droneHours > 0 && (
                          <div style={{ padding:"8px 12px", borderRadius:8, background:"rgba(245,158,11,0.08)", border:"1px solid rgba(245,158,11,0.25)" }}>
                            <span style={{ fontSize:11, fontWeight:700, color:"#D97706" }}>🚁 Drone Expense: ₹{Math.round(s.droneHours * 500).toLocaleString()} (₹500/hr × {fmtTravel(s.droneHours)}) — only your entry, not teammates</span>
                          </div>
                        )}
                      </div>

                      <div style={{ display:"grid", gridTemplateColumns:"auto 1fr", gap:10, marginBottom:10, alignItems:"end" }}>
                        <div>
                          <label style={{ display:"block", fontSize:10, fontWeight:700, color:"#374151", textTransform:"uppercase", letterSpacing:"0.1em", marginBottom:5 }}>🚗 Travel Time</label>
                          <div style={{ display:"flex", alignItems:"center", gap:6 }}>
                            <input
                              type="number" min={0} max={12} placeholder="0"
                              value={Math.floor(s.travelHours) || ""}
                              onChange={e => {
                                const h = Math.max(0, Math.min(12, Number(e.target.value) || 0))
                                const m = Math.round((s.travelHours - Math.floor(s.travelHours)) * 60)
                                patchShoot(s.id, { travelHours: h + m / 60 })
                              }}
                              style={{ ...F, width:52, textAlign:"center", padding:"9px 6px" }}
                            />
                            <span style={{ fontSize:11, color:"#6B7280", fontWeight:600, flexShrink:0 }}>hr</span>
                            <input
                              type="number" min={0} max={59} placeholder="0"
                              value={Math.round((s.travelHours - Math.floor(s.travelHours)) * 60) || ""}
                              onChange={e => {
                                const m = Math.max(0, Math.min(59, Number(e.target.value) || 0))
                                const h = Math.floor(s.travelHours)
                                patchShoot(s.id, { travelHours: h + m / 60 })
                              }}
                              style={{ ...F, width:52, textAlign:"center", padding:"9px 6px" }}
                            />
                            <span style={{ fontSize:11, color:"#6B7280", fontWeight:600, flexShrink:0 }}>min</span>
                          </div>
                        </div>
                        <div style={{ fontSize:10, color:"#9CA3AF", paddingBottom:10 }}>
                          {s.travelHours > 0 && <span style={{ fontWeight:700, color:"#F59E0B" }}>+{fmtTravel(s.travelHours)} travel included</span>}
                        </div>
                      </div>
                      <div style={{ marginBottom:10 }}>
                        <label style={{ display:"block", fontSize:10, fontWeight:700, color:"#374151", textTransform:"uppercase", letterSpacing:"0.1em", marginBottom:5 }}>📍 Location</label>
                        <input value={s.location} onChange={e => patchShoot(s.id, { location: e.target.value })} placeholder="e.g. Anna Nagar, Chennai" style={F} />
                      </div>
                      <div style={{ marginBottom:10 }}>
                        <label style={{ display:"block", fontSize:10, fontWeight:700, color:"#374151", textTransform:"uppercase", letterSpacing:"0.1em", marginBottom:5 }}>
                          🔗 Drive Link
                        </label>
                        <div style={{ position:"relative" }}>
                          <Link2 size={13} style={{ position:"absolute", left:10, top:"50%", transform:"translateY(-50%)", color: s.driveLink.trim() ? "#16A34A" : "#9CA3AF", pointerEvents:"none" }} />
                          <input
                            value={s.driveLink}
                            onChange={e => patchShoot(s.id, { driveLink: e.target.value })}
                            placeholder="Paste Google Drive / folder link…"
                            style={{ ...F, paddingLeft:32 }}
                          />
                        </div>
                      </div>
                      <div style={{ display:"grid", gridTemplateColumns:"1fr auto", gap:10, alignItems:"start" }}>
                        <div>
                          <label style={{ display:"block", fontSize:10, fontWeight:700, color:"#374151", textTransform:"uppercase", letterSpacing:"0.1em", marginBottom:5 }}>Notes</label>
                          <input value={s.notes} onChange={e => patchShoot(s.id, { notes: e.target.value })} placeholder="Shots taken, any issues…" style={F} />
                        </div>
                        <div style={{ paddingTop:24 }}>
                          <button onClick={() => patchShoot(s.id, { videoUploaded: !s.videoUploaded })}
                            style={{ display:"flex", alignItems:"center", gap:6, padding:"9px 14px", borderRadius:10, border:"1.5px solid", cursor:"pointer", fontSize:11, fontWeight:700, transition:"all 0.15s", background: s.videoUploaded ? "rgba(34,197,94,0.1)" : "#F9FAFB", borderColor: s.videoUploaded ? "rgba(34,197,94,0.4)" : "#EBEDF2", color: s.videoUploaded ? "#16A34A" : "#9CA3AF" }}>
                            <Upload size={12} /> {s.videoUploaded ? "Uploaded ✓" : "Video Uploaded?"}
                          </button>
                        </div>
                      </div>
                      {/* Partner picker per shoot */}
                      {teamMembers.length > 0 && (
                        <div style={{ marginTop:10, paddingTop:10, borderTop:"1px dashed #F0F1F5" }}>
                          <p style={{ fontSize:10, fontWeight:700, color:"#9CA3AF", textTransform:"uppercase", letterSpacing:"0.07em", margin:"0 0 7px" }}>👥 Shot With</p>
                          {s.participantIds.length > 0 && (
                            <div style={{ display:"flex", flexWrap:"wrap", gap:4, marginBottom:6 }}>
                              {s.participantIds.map(pid => {
                                const m = teamMembers.find(t => t.id === pid)
                                if (!m) return null
                                const initials = m.name.split(" ").map((n:string) => n[0]).join("").slice(0,2).toUpperCase()
                                return (
                                  <button key={pid} onClick={() => patchShoot(s.id, { participantIds: s.participantIds.filter(p => p !== pid) })}
                                    style={{ display:"flex", alignItems:"center", gap:4, padding:"3px 8px 3px 5px", borderRadius:99, background:"rgba(239,68,68,0.1)", border:"1.5px solid rgba(239,68,68,0.3)", cursor:"pointer" }}>
                                    <div style={{ width:16, height:16, borderRadius:"50%", background:"#EF4444", display:"flex", alignItems:"center", justifyContent:"center", fontSize:7, fontWeight:900, color:"#fff" }}>{initials}</div>
                                    <span style={{ fontSize:10, fontWeight:700, color:"#B91C1C" }}>{m.name.split(" ")[0]}</span>
                                    <span style={{ fontSize:8, color:"#EF4444" }}>✕</span>
                                  </button>
                                )
                              })}
                            </div>
                          )}
                          <div style={{ display:"flex", flexWrap:"wrap", gap:4 }}>
                            {teamMembers.slice(0, 20).map(m => {
                              const selected = s.participantIds.includes(m.id)
                              const initials = m.name.split(" ").map((n:string) => n[0]).join("").slice(0,2).toUpperCase()
                              return (
                                <button key={m.id} onClick={() => patchShoot(s.id, { participantIds: selected ? s.participantIds.filter(p => p !== m.id) : [...s.participantIds, m.id] })}
                                  style={{ display:"flex", alignItems:"center", gap:4, padding:"3px 8px 3px 5px", borderRadius:99, cursor:"pointer", background: selected ? "rgba(239,68,68,0.1)" : "#F9FAFB", border:`1.5px solid ${selected ? "rgba(239,68,68,0.4)" : "#EBEDF2"}` }}>
                                  <div style={{ width:16, height:16, borderRadius:"50%", background: selected ? "#EF4444" : "#E5E7EB", display:"flex", alignItems:"center", justifyContent:"center", fontSize:7, fontWeight:900, color: selected ? "#fff" : "#9CA3AF" }}>{initials}</div>
                                  <span style={{ fontSize:10, fontWeight:700, color: selected ? "#B91C1C" : "#374151" }}>{m.name.split(" ")[0]}</span>
                                  {selected && <span style={{ fontSize:8, color:"#EF4444" }}>✓</span>}
                                </button>
                              )
                            })}
                          </div>
                        </div>
                      )}
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
                          <div style={{ position:"relative" }}>
                            {(showPastFor.has(e.id) || pastClientOptions.includes(e.clientName)) ? (
                              <div>
                                <button type="button" onClick={() => { exitPastMode(e.id); patchEdit(e.id, { clientName: "", brand:"", customClient:"" }) }}
                                  style={{ fontSize:11, fontWeight:700, color:"#6366F1", background:"none", border:"none", cursor:"pointer", padding:"0 0 6px", display:"block" }}>
                                  ← Back to Active Clients
                                </button>
                                <div style={{ position:"relative" }}>
                                  <select value={e.clientName}
                                    onChange={ev => { patchEdit(e.id, { clientName: ev.target.value, brand:"", customClient:"" }); exitPastMode(e.id) }}
                                    style={{ ...F, paddingRight:28, appearance:"none" }}>
                                    <option value="">Select past client…</option>
                                    {pastClientOptions.map(n => <option key={n} value={n}>{n}</option>)}
                                  </select>
                                  <ChevronDown size={11} style={{ position:"absolute", right:10, top:"50%", transform:"translateY(-50%)", color:"#9CA3AF", pointerEvents:"none" }} />
                                </div>
                              </div>
                            ) : (
                            <select value={e.clientName} onChange={ev => { const v = ev.target.value; if (v === "__past_clients__") { enterPastMode(e.id) } else { patchEdit(e.id, { clientName: v, brand:"", customClient:"" }) } }} style={{ ...F, paddingRight:28, appearance:"none" }}>
                              <option value="">Select client…</option>
                              {activeClientOptions.map(n => <option key={n} value={n}>{n}</option>)}
                              {pastClientOptions.length > 0 && <option value="__past_clients__">📁 Past Clients →</option>}
                              <option value="__custom__">✏️ Other (type manually)</option>
                            </select>
                            )}
                            <ChevronDown size={11} style={{ position:"absolute", right:10, top:"50%", transform:"translateY(-50%)", color:"#9CA3AF", pointerEvents:"none" }} />
                          </div>
                          {e.clientName === "__custom__" && (
                            <input value={e.customClient} onChange={ev => patchEdit(e.id, { customClient: ev.target.value })} placeholder="Type client name…" style={{ ...F, marginTop:8, background:"rgba(99,102,241,0.05)", borderColor:"rgba(99,102,241,0.25)" }} />
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
                              {["Instagram Reels","Hook","Personal Branding","Ads and Hooks","Long Videos","Cinematic","YouTube Shorts"].map(t => <option key={t} value={t}>{t}</option>)}
                              <option value="__other__">✏️ Other (type…)</option>
                            </select>
                            <ChevronDown size={11} style={{ position:"absolute", right:10, top:"50%", transform:"translateY(-50%)", color:"#9CA3AF", pointerEvents:"none" }} />
                          </div>
                          {e.videoType === "__other__" && (
                            <input value={e.customVideoType} onChange={ev => patchEdit(e.id, { customVideoType: ev.target.value })} placeholder="Type video type…" style={{ ...F, marginTop:6, background:"rgba(99,102,241,0.05)", borderColor:"rgba(99,102,241,0.25)" }} />
                          )}
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
                      {/* ── Editing time window (for shoot overlap detection) ── */}
                      <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:10, marginBottom:8 }}>
                        <div>
                          <label style={{ display:"block", fontSize:10, fontWeight:700, color:"#374151", textTransform:"uppercase", letterSpacing:"0.1em", marginBottom:5 }}>✏️ Edit Start Time</label>
                          <TimePicker value={e.startTime} onChange={v => patchEdit(e.id, { startTime: v })} />
                        </div>
                        <div>
                          <label style={{ display:"block", fontSize:10, fontWeight:700, color:"#374151", textTransform:"uppercase", letterSpacing:"0.1em", marginBottom:5 }}>✏️ Edit End Time</label>
                          <TimePicker value={e.endTime} onChange={v => patchEdit(e.id, { endTime: v })} />
                        </div>
                      </div>
                      {(() => {
                        if (!e.startTime || !e.endTime || shoots.length === 0) return null
                        const overlapH = calcOverlapHours(e.startTime, e.endTime, shoots)
                        const editDur = calcDuration(e.startTime, e.endTime)
                        const validH = Math.max(0, editDur - overlapH)
                        if (overlapH <= 0) return (
                          <div style={{ padding:"7px 12px", borderRadius:8, background:"rgba(34,197,94,0.08)", border:"1px solid rgba(34,197,94,0.25)", marginBottom:8, fontSize:11, fontWeight:700, color:"#16A34A" }}>
                            ✓ No overlap with shoot time — {editDur}h valid editing
                          </div>
                        )
                        return (
                          <div style={{ padding:"7px 12px", borderRadius:8, background:"rgba(245,158,11,0.1)", border:"1px solid rgba(245,158,11,0.35)", marginBottom:8 }}>
                            <span style={{ fontSize:11, fontWeight:700, color:"#D97706" }}>
                              ⚠️ {overlapH}h overlaps with shoot time ({fmt12(e.startTime)}–{fmt12(e.endTime)})
                            </span>
                            <span style={{ fontSize:11, color:"#92400E", marginLeft:8 }}>
                              → {validH}h counted as valid editing
                            </span>
                          </div>
                        )
                      })()}
                      <div style={{ display:"grid", gridTemplateColumns:"1fr auto", gap:10, alignItems:"end", marginBottom:10 }}>
                        <div>
                          <label style={{ display:"block", fontSize:10, fontWeight:700, color:"#374151", textTransform:"uppercase", letterSpacing:"0.1em", marginBottom:5 }}>Duration</label>
                          <div style={{ display:"inline-flex", alignItems:"center", gap:6, padding:"8px 14px", borderRadius:8, background: calcDuration(e.startTime, e.endTime) > 0 ? "rgba(222,26,26,0.06)" : "#F9FAFB", border: calcDuration(e.startTime, e.endTime) > 0 ? "1.5px solid rgba(222,26,26,0.2)" : "1.5px solid #EBEDF2" }}>
                            <span style={{ fontSize:13, fontWeight:700, color: calcDuration(e.startTime, e.endTime) > 0 ? "#DE1A1A" : "#9CA3AF" }}>
                              {calcDuration(e.startTime, e.endTime) > 0 ? fmtTravel(calcDuration(e.startTime, e.endTime)) : "—"}
                            </span>
                            <span style={{ fontSize:10, color:"#9CA3AF", fontWeight:500 }}>auto</span>
                          </div>
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
                            <Link2 size={9} style={{ display:"inline", marginRight:4 }} />Drive / Video Link
                          </label>
                          <input value={e.videoLink} onChange={ev => patchEdit(e.id, { videoLink: ev.target.value })} placeholder="https://drive.google.com/… (optional)" style={F} />
                        </div>
                      </div>
                      {/* Partner picker per edit */}
                      {teamMembers.length > 0 && (
                        <div style={{ marginTop:10, paddingTop:10, borderTop:"1px dashed #F0F1F5" }}>
                          <p style={{ fontSize:10, fontWeight:700, color:"#9CA3AF", textTransform:"uppercase", letterSpacing:"0.07em", margin:"0 0 7px" }}>👥 Edited With</p>
                          {e.participantIds.length > 0 && (
                            <div style={{ display:"flex", flexWrap:"wrap", gap:4, marginBottom:6 }}>
                              {e.participantIds.map(pid => {
                                const tm = teamMembers.find(t => t.id === pid)
                                if (!tm) return null
                                const initials = tm.name.split(" ").map((n:string) => n[0]).join("").slice(0,2).toUpperCase()
                                return (
                                  <button key={pid} onClick={() => patchEdit(e.id, { participantIds: e.participantIds.filter(p => p !== pid) })}
                                    style={{ display:"flex", alignItems:"center", gap:4, padding:"3px 8px 3px 5px", borderRadius:99, background:"rgba(99,102,241,0.1)", border:"1.5px solid rgba(99,102,241,0.3)", cursor:"pointer" }}>
                                    <div style={{ width:16, height:16, borderRadius:"50%", background:"#6366F1", display:"flex", alignItems:"center", justifyContent:"center", fontSize:7, fontWeight:900, color:"#fff" }}>{initials}</div>
                                    <span style={{ fontSize:10, fontWeight:700, color:"#4338CA" }}>{tm.name.split(" ")[0]}</span>
                                    <span style={{ fontSize:8, color:"#6366F1" }}>✕</span>
                                  </button>
                                )
                              })}
                            </div>
                          )}
                          <div style={{ display:"flex", flexWrap:"wrap", gap:4 }}>
                            {teamMembers.slice(0, 20).map(tm => {
                              const selected = e.participantIds.includes(tm.id)
                              const initials = tm.name.split(" ").map((n:string) => n[0]).join("").slice(0,2).toUpperCase()
                              return (
                                <button key={tm.id} onClick={() => patchEdit(e.id, { participantIds: selected ? e.participantIds.filter(p => p !== tm.id) : [...e.participantIds, tm.id] })}
                                  style={{ display:"flex", alignItems:"center", gap:4, padding:"3px 8px 3px 5px", borderRadius:99, cursor:"pointer", background: selected ? "rgba(99,102,241,0.1)" : "#F9FAFB", border:`1.5px solid ${selected ? "rgba(99,102,241,0.4)" : "#EBEDF2"}` }}>
                                  <div style={{ width:16, height:16, borderRadius:"50%", background: selected ? "#6366F1" : "#E5E7EB", display:"flex", alignItems:"center", justifyContent:"center", fontSize:7, fontWeight:900, color: selected ? "#fff" : "#9CA3AF" }}>{initials}</div>
                                  <span style={{ fontSize:10, fontWeight:700, color: selected ? "#4338CA" : "#374151" }}>{tm.name.split(" ")[0]}</span>
                                  {selected && <span style={{ fontSize:8, color:"#6366F1" }}>✓</span>}
                                </button>
                              )
                            })}
                          </div>
                        </div>
                      )}
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

          {/* ══ BREAK TAB ════════════════════════════════════════════════════ */}
          {tab === "break" && (
            <div style={{ background:"#FFFFFF", borderRadius:20, border:"1.5px solid rgba(245,158,11,0.25)", padding:"20px 22px", boxShadow:"0 2px 10px rgba(0,0,0,0.04)" }}>
              <div style={{ display:"flex", alignItems:"center", justifyContent:"space-between", marginBottom:16 }}>
                <div style={{ display:"flex", alignItems:"center", gap:10 }}>
                  <div style={{ width:34, height:34, borderRadius:10, background:"rgba(245,158,11,0.1)", display:"flex", alignItems:"center", justifyContent:"center" }}>
                    <Coffee size={16} style={{ color:"#D97706" }} />
                  </div>
                  <div>
                    <p style={{ fontSize:14, fontWeight:800, color:"#111111", margin:0 }}>{isPastDate ? "Breaks" : "Breaks Today"}</p>
                    <p style={{ fontSize:10, color:"#9CA3AF", margin:0 }}>
                      {isMediaTeam
                        ? `${mediaBreaks.length} break${mediaBreaks.length !== 1 ? "s" : ""} · ${mediaBreaks.reduce((s,b) => s + b.durationHours, 0).toFixed(1)}h total`
                        : `${breakBlocks.length} break${breakBlocks.length !== 1 ? "s" : ""} · ${breakBlocks.reduce((s,b) => s + b.durationHours, 0).toFixed(1)}h total`
                      } · {isPastDate ? "synced to past attendance" : "synced to attendance"}
                    </p>
                  </div>
                </div>
                <button onClick={isMediaTeam ? addMediaBreak : addBreakBlock}
                  style={{ display:"flex", alignItems:"center", gap:6, padding:"8px 14px", borderRadius:10, border:"1.5px solid rgba(245,158,11,0.4)", background:"#FEF3C7", color:"#D97706", fontSize:12, fontWeight:700, cursor:"pointer" }}>
                  <Plus size={13} /> Add Break
                </button>
              </div>

              {/* Media breaks */}
              {isMediaTeam && (mediaBreaks.length === 0 ? (
                <div onClick={addMediaBreak} style={{ display:"flex", flexDirection:"column", alignItems:"center", justifyContent:"center", gap:10, padding:"24px 0", borderRadius:14, border:"2px dashed rgba(245,158,11,0.3)", background:"rgba(245,158,11,0.03)", cursor:"pointer" }}>
                  <Coffee size={28} style={{ color:"#FCD34D" }} />
                  <p style={{ fontSize:12, fontWeight:600, color:"#9CA3AF", margin:0 }}>No breaks logged — tap to add one</p>
                </div>
              ) : (
                <div style={{ display:"flex", flexDirection:"column", gap:8 }}>
                  {mediaBreaks.map((b, i) => (
                    <div key={b.id} style={{ background:"#FFFBEB", borderRadius:12, border:"1.5px solid rgba(245,158,11,0.3)", padding:"10px 14px", display:"flex", alignItems:"center", gap:10, flexWrap:"wrap" }}>
                      <span style={{ fontSize:11, fontWeight:800, color:"#D97706", flexShrink:0 }}>☕ #{i+1}</span>
                      <TimePicker value={b.startTime} onChange={v => patchMediaBreak(b.id, { startTime: v })} />
                      <span style={{ fontSize:11, color:"#9CA3AF", flexShrink:0 }}>to</span>
                      <TimePicker value={b.endTime} onChange={v => patchMediaBreak(b.id, { endTime: v })} />
                      {b.durationHours > 0 && (
                        <span style={{ fontSize:10, fontWeight:700, padding:"3px 8px", borderRadius:99, background:"rgba(245,158,11,0.12)", color:"#D97706" }}>{fmtTravel(b.durationHours)}</span>
                      )}
                      <select value={b.label} onChange={e => patchMediaBreak(b.id, { label: e.target.value })}
                        style={{ fontSize:11, fontWeight:700, color:"#D97706", background:"#FEF3C7", border:"1.5px solid rgba(245,158,11,0.35)", borderRadius:8, padding:"4px 10px", cursor:"pointer", outline:"none" }}>
                        <option value="Lunch">🍱 Lunch</option>
                        <option value="Tea">☕ Tea</option>
                        <option value="Short Break">🚶 Short Break</option>
                        <option value="Personal">🏠 Personal</option>
                      </select>
                      <button onClick={() => removeMediaBreak(b.id)} style={{ marginLeft:"auto", background:"none", border:"none", cursor:"pointer", padding:4, borderRadius:8, display:"flex", flexShrink:0 }}>
                        <Trash2 size={13} style={{ color:"#EF4444" }} />
                      </button>
                    </div>
                  ))}
                </div>
              ))}

              {/* Non-media breaks (from timeBlocks where isBreak=true) */}
              {!isMediaTeam && (breakBlocks.length === 0 ? (
                <div onClick={addBreakBlock} style={{ display:"flex", flexDirection:"column", alignItems:"center", justifyContent:"center", gap:10, padding:"24px 0", borderRadius:14, border:"2px dashed rgba(245,158,11,0.3)", background:"rgba(245,158,11,0.03)", cursor:"pointer" }}>
                  <Coffee size={28} style={{ color:"#FCD34D" }} />
                  <p style={{ fontSize:12, fontWeight:600, color:"#9CA3AF", margin:0 }}>No breaks logged — tap to add one</p>
                </div>
              ) : (
                <div style={{ display:"flex", flexDirection:"column", gap:8 }}>
                  {breakBlocks.map((b, i) => (
                    <div key={b.id} style={{ background:"#FFFBEB", borderRadius:12, border:"1.5px solid rgba(245,158,11,0.3)", padding:"10px 14px", display:"flex", alignItems:"center", gap:10, flexWrap:"wrap" }}>
                      <span style={{ fontSize:11, fontWeight:800, color:"#D97706", flexShrink:0 }}>☕ #{i+1}</span>
                      <TimePicker value={b.startTime} onChange={v => patchBlock(b.id, { startTime: v })} />
                      <span style={{ fontSize:11, color:"#9CA3AF", flexShrink:0 }}>to</span>
                      <TimePicker value={b.endTime} onChange={v => patchBlock(b.id, { endTime: v })} />
                      {b.durationHours > 0 && (
                        <span style={{ fontSize:10, fontWeight:700, padding:"3px 8px", borderRadius:99, background:"rgba(245,158,11,0.12)", color:"#D97706" }}>{fmtTravel(b.durationHours)}</span>
                      )}
                      <select value={b.breakLabel} onChange={e => patchBlock(b.id, { breakLabel: e.target.value })}
                        style={{ fontSize:11, fontWeight:700, color:"#D97706", background:"#FEF3C7", border:"1.5px solid rgba(245,158,11,0.35)", borderRadius:8, padding:"4px 10px", cursor:"pointer", outline:"none" }}>
                        <option value="Lunch">🍱 Lunch</option>
                        <option value="Tea">☕ Tea</option>
                        <option value="Short Break">🚶 Short Break</option>
                        <option value="Personal">🏠 Personal</option>
                      </select>
                      <button onClick={() => removeBlock(b.id)} style={{ marginLeft:"auto", background:"none", border:"none", cursor:"pointer", padding:4, borderRadius:8, display:"flex", flexShrink:0 }}>
                        <Trash2 size={13} style={{ color:"#EF4444" }} />
                      </button>
                    </div>
                  ))}
                </div>
              ))}
            </div>
          )}

          {/* ══ LEARNING ══════════════════════════════════════════════════════ */}
          {tab === "learning" && (
            <div style={{ background:"#FFFFFF", borderRadius:20, border:"1px solid #EBEDF2", padding:"20px 22px", boxShadow:"0 2px 10px rgba(0,0,0,0.05)" }}>
              <SectionHead icon={<BookOpen size={16} style={{ color:"#10B981" }} />} label="What did you learn today?" count={0} color="#10B981" />
              <div style={{ display:"flex", flexDirection:"column", gap:14 }}>
                <div>
                  <label style={{ display:"block", fontSize:10, fontWeight:700, color:"#374151", textTransform:"uppercase", letterSpacing:"0.1em", marginBottom:6 }}>For Client *</label>
                  <div style={{ display:"flex", gap:8 }}>
                    {["GROFAST DIGITAL", "GROFAST AI"].map(c => (
                      <button key={c} type="button" onClick={() => setLearningClient(c)}
                        style={{ flex:1, padding:"9px 14px", borderRadius:10, fontSize:12, fontWeight:700, cursor:"pointer",
                          border: learningClient === c ? "2px solid #10B981" : "1.5px solid #EBEDF2",
                          background: learningClient === c ? "rgba(16,185,129,0.1)" : "#F9FAFB",
                          color: learningClient === c ? "#059669" : "#6B7280" }}>
                        {c}
                      </button>
                    ))}
                  </div>
                </div>
                <div>
                  <label style={{ display:"block", fontSize:10, fontWeight:700, color:"#374151", textTransform:"uppercase", letterSpacing:"0.1em", marginBottom:6 }}>Topic / Course *</label>
                  <input value={learningTopic} onChange={e => setLearningTopic(e.target.value)} placeholder="e.g. DaVinci Resolve color grading, Adobe Premiere…" style={F} />
                </div>
                <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr 1fr", gap:12 }}>
                  <div>
                    <label style={{ display:"block", fontSize:10, fontWeight:700, color:"#374151", textTransform:"uppercase", letterSpacing:"0.1em", marginBottom:6 }}>From *</label>
                    <input type="time" value={learningFrom} onChange={e => setLearningFrom(e.target.value)} style={{ ...F, fontVariantNumeric:"tabular-nums" }} />
                  </div>
                  <div>
                    <label style={{ display:"block", fontSize:10, fontWeight:700, color:"#374151", textTransform:"uppercase", letterSpacing:"0.1em", marginBottom:6 }}>To *</label>
                    <input type="time" value={learningTo} onChange={e => setLearningTo(e.target.value)} style={{ ...F, fontVariantNumeric:"tabular-nums" }} />
                  </div>
                  <div>
                    <label style={{ display:"block", fontSize:10, fontWeight:700, color:"#374151", textTransform:"uppercase", letterSpacing:"0.1em", marginBottom:6 }}>Duration</label>
                    <div style={{ ...F, background:"#F9FAFB", color: learningHours > 0 ? "#111827" : "#9CA3AF", fontWeight:700, display:"flex", alignItems:"center" }}>
                      {learningHours > 0 ? `${learningHours}h` : "—"}
                    </div>
                  </div>
                </div>
                <div>
                  <label style={{ display:"block", fontSize:10, fontWeight:700, color:"#374151", textTransform:"uppercase", letterSpacing:"0.1em", marginBottom:6 }}>Notes</label>
                  <input value={learningNotes} onChange={e => setLearningNotes(e.target.value)} placeholder="Key takeaways, resources used…" style={F} />
                </div>
                {/* Learned With */}
                {teamMembers.length > 0 && (
                  <div style={{ paddingTop:10, borderTop:"1px dashed #EBEDF2" }}>
                    <p style={{ fontSize:10, fontWeight:700, color:"#9CA3AF", textTransform:"uppercase", letterSpacing:"0.07em", margin:"0 0 7px" }}>👥 Learned With</p>
                    <div style={{ position:"relative" }}>
                      <select
                        value=""
                        onChange={e => {
                          const id = e.target.value
                          if (id && !learningParticipantIds.includes(id))
                            setLearningParticipantIds(prev => [...prev, id])
                        }}
                        style={{ width:"100%", fontSize:12, fontWeight:600, color:"#374151", background:"#fff", border:"1.5px solid #EBEDF2", borderRadius:10, padding:"8px 28px 8px 10px", cursor:"pointer", outline:"none", appearance:"none" }}>
                        <option value="">Add teammate…</option>
                        {teamMembers.filter(m => !learningParticipantIds.includes(m.id)).map(m => (
                          <option key={m.id} value={m.id}>{m.name}</option>
                        ))}
                      </select>
                      <ChevronDown size={11} style={{ position:"absolute", right:10, top:"50%", transform:"translateY(-50%)", color:"#9CA3AF", pointerEvents:"none" }} />
                    </div>
                    {learningParticipantIds.length > 0 && (
                      <div style={{ display:"flex", flexWrap:"wrap", gap:4, marginTop:6 }}>
                        {learningParticipantIds.map(pid => {
                          const m = teamMembers.find(t => t.id === pid)
                          if (!m) return null
                          const initials = m.name.split(" ").map((n: string) => n[0]).join("").slice(0, 2).toUpperCase()
                          return (
                            <button key={pid} type="button"
                              onClick={() => setLearningParticipantIds(prev => prev.filter(p => p !== pid))}
                              style={{ display:"flex", alignItems:"center", gap:4, padding:"3px 8px 3px 5px", borderRadius:99, background:"rgba(16,185,129,0.1)", border:"1.5px solid rgba(16,185,129,0.3)", cursor:"pointer" }}>
                              <div style={{ width:16, height:16, borderRadius:"50%", background:"#10B981", display:"flex", alignItems:"center", justifyContent:"center", fontSize:7, fontWeight:900, color:"#fff" }}>{initials}</div>
                              <span style={{ fontSize:10, fontWeight:700, color:"#065F46" }}>{m.name.split(" ")[0]}</span>
                              <span style={{ fontSize:8, color:"#10B981" }}>✕</span>
                            </button>
                          )
                        })}
                      </div>
                    )}
                  </div>
                )}
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

          {/* ── Submit bar ─────────────────────────────────────────────────── */}
          {(isMediaTeam || tab === "break") && (
            <div style={{ background:"#FFFFFF", borderRadius:16, border:"1px solid #EBEDF2", padding:"14px 18px", display:"flex", alignItems:"center", justifyContent:"space-between", gap:12, boxShadow:"0 2px 10px rgba(0,0,0,0.05)" }}>
              <div>
                {error && <p style={{ fontSize:12, fontWeight:600, color:"#DE1A1A", margin:0 }}>{error}</p>}
                {!error && tab === "media"   && <p style={{ fontSize:12, color:"#9CA3AF", margin:0 }}>{shoots.length} shoot{shoots.length !== 1 ? "s" : ""} · {edits.length} edit{edits.length !== 1 ? "s" : ""} · {totalMediaHours}h total</p>}
                {!error && tab === "learning"&& <p style={{ fontSize:12, color:"#9CA3AF", margin:0 }}>Learning: {learningTopic || "not set"} · {learningHours}h</p>}
                {!error && tab === "break"   && <p style={{ fontSize:12, color:"#9CA3AF", margin:0 }}>
                  {isMediaTeam ? `${mediaBreaks.length} break${mediaBreaks.length !== 1 ? "s" : ""} · ${mediaBreaks.reduce((s,b) => s+b.durationHours,0).toFixed(1)}h` : `${breakBlocks.length} break${breakBlocks.length !== 1 ? "s" : ""} · ${breakBlocks.reduce((s,b) => s+b.durationHours,0).toFixed(1)}h`}
                </p>}
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

              {/* Non-media team: stats based on active tab */}
              {!isMediaTeam && tab === "working" && (
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
                </div>
              )}
              {!isMediaTeam && tab === "learning" && (
                <div style={{ display:"flex", flexDirection:"column", gap:9 }}>
                  <p style={{ fontSize:10, fontWeight:700, color:"#10B981", textTransform:"uppercase", letterSpacing:"0.08em", margin:"0 0 2px" }}>📚 Learning</p>
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

          {/* Past Updates */}
          {pastUpdates.length > 0 && (
            <div style={{ background:"#FFFFFF", borderRadius:20, border:"1px solid #EBEDF2", padding:"16px", boxShadow:"0 2px 10px rgba(0,0,0,0.05)" }}>
              <div style={{ display:"flex", alignItems:"center", gap:7, marginBottom:14 }}>
                <Clock size={14} style={{ color:"#6366F1" }} />
                <p style={{ fontSize:13, fontWeight:800, color:"#111111", margin:0 }}>Past Updates</p>
                <span style={{ fontSize:10, fontWeight:700, padding:"2px 8px", borderRadius:99, background:"rgba(99,102,241,0.1)", color:"#6366F1" }}>{pastUpdates.length}</span>
              </div>
              <div style={{ display:"flex", flexDirection:"column", gap:8 }}>
                {pastUpdates.map(u => {
                  const isExpanded  = expandedId === u.id
                  const isEditing   = editingUpdateId === u.id
                  const rawEntries  = Array.isArray(u.work_entries) ? u.work_entries as Record<string,unknown>[] : []
                  const tabKey      = u.active_tab ?? "working"
                  const dateStr     = new Date(u.date + "T12:00:00").toLocaleDateString("en-US", { weekday:"short", day:"numeric", month:"short" })
                  const hoursLabel  = u.working_hours ? `${u.working_hours}h` : u.learning_hours ? `${u.learning_hours}h` : "—"
                  const tabColor    = tabKey === "media" ? "#EF4444" : tabKey === "learning" ? "#10B981" : "#6366F1"
                  const tabLabel    = tabKey === "media" ? "🎬 Media" : tabKey === "learning" ? "📚 Learning" : "⏰ Working"

                  return (
                    <div key={u.id} style={{ borderRadius:12, border: isEditing ? "1.5px solid #6366F1" : "1px solid #EBEDF2", overflow:"hidden" }}>

                      {/* Row header */}
                      <div style={{ display:"flex", alignItems:"center", gap:10, padding:"10px 12px", cursor:"pointer", background: isExpanded || isEditing ? "#F9FAFB" : "#FFFFFF" }}
                        onClick={() => { if (!isEditing) setExpandedId(isExpanded ? null : u.id) }}>
                        <div style={{ flex:1, minWidth:0 }}>
                          <div style={{ display:"flex", alignItems:"center", gap:8, flexWrap:"wrap" }}>
                            <span style={{ fontSize:12, fontWeight:800, color:"#111827" }}>{dateStr}</span>
                            <span style={{ fontSize:10, fontWeight:700, padding:"2px 8px", borderRadius:99, background:`${tabColor}18`, color:tabColor }}>{tabLabel}</span>
                            <span style={{ fontSize:11, fontWeight:700, color:"#374151" }}>{hoursLabel}</span>
                            {u.shoot_count ? <span style={{ fontSize:10, color:"#9CA3AF" }}>{u.shoot_count} shoot{u.shoot_count > 1?"s":""}</span> : null}
                          </div>
                        </div>
                        <div style={{ display:"flex", alignItems:"center", gap:6, flexShrink:0 }} onClick={e => e.stopPropagation()}>
                          {!isEditing && (
                            <button onClick={() => {
                              setEditEntries(JSON.parse(JSON.stringify(rawEntries)))
                              setEditingUpdateId(u.id)
                              setExpandedId(null)
                              setEditError(null)
                            }} style={{ fontSize:11, fontWeight:700, padding:"4px 10px", borderRadius:8, border:"1.5px solid #6366F1", background:"rgba(99,102,241,0.07)", color:"#6366F1", cursor:"pointer" }}>
                              Edit
                            </button>
                          )}
                          <button disabled={deletingId === u.id} onClick={async () => {
                            if (!confirm("Delete this day's update? This cannot be undone.")) return
                            setDeletingId(u.id)
                            await deleteDailyUpdate(u.id)
                            setDeletingId(null)
                            router.refresh()
                          }} style={{ display:"flex", alignItems:"center", justifyContent:"center", width:28, height:28, borderRadius:8, border:"none", background:"rgba(239,68,68,0.08)", cursor:"pointer", opacity: deletingId === u.id ? 0.5 : 1 }}>
                            {deletingId === u.id ? <Loader2 size={12} className="animate-spin" style={{ color:"#EF4444" }} /> : <Trash2 size={12} style={{ color:"#EF4444" }} />}
                          </button>
                          {!isEditing && <ChevronDown size={14} style={{ color:"#9CA3AF", transform: isExpanded ? "rotate(180deg)" : "none", transition:"transform 0.2s" }} />}
                        </div>
                      </div>

                      {/* VIEW mode */}
                      {isExpanded && !isEditing && (
                        <div style={{ borderTop:"1px solid #F0F1F5", padding:"10px 12px", display:"flex", flexDirection:"column", gap:6, background:"#FAFBFC" }}>
                          {rawEntries.length === 0
                            ? <p style={{ fontSize:12, color:"#9CA3AF", margin:0 }}>{u.learning_topic ? `📚 ${u.learning_topic}` : "No entries recorded."}</p>
                            : rawEntries.map((e, idx) => {
                                const type = e.task_type as string
                                const color = type === "shoot" ? "#EF4444" : type === "edit" ? "#6366F1" : "#F59E0B"
                                const icon  = type === "shoot" ? "📷" : type === "edit" ? "🎞️" : "🕐"
                                return (
                                  <div key={idx} style={{ display:"flex", alignItems:"flex-start", gap:8, padding:"7px 10px", borderRadius:8, background:"#FFFFFF", border:"1px solid #F0F1F5" }}>
                                    <span style={{ fontSize:13, flexShrink:0 }}>{icon}</span>
                                    <div style={{ flex:1, minWidth:0 }}>
                                      <div style={{ display:"flex", gap:6, flexWrap:"wrap", alignItems:"center" }}>
                                        <span style={{ fontSize:12, fontWeight:700, color:"#111827" }}>{(e.title as string) || "—"}</span>
                                        {!!(e.client_name) && <span style={{ fontSize:10, color, fontWeight:600 }}>{e.client_name as string}</span>}
                                        {!!(e.duration_hours) && <span style={{ fontSize:10, color:"#9CA3AF" }}>{e.duration_hours as number}h</span>}
                                      </div>
                                      {!!(e.notes) && <p style={{ fontSize:10, color:"#6B7280", margin:"2px 0 0", lineHeight:1.4 }}>{e.notes as string}</p>}
                                    </div>
                                  </div>
                                )
                              })
                          }
                        </div>
                      )}

                      {/* EDIT mode */}
                      {isEditing && (
                        <div style={{ borderTop:"1.5px solid #6366F1", padding:"12px", background:"#FAFBFC" }}>
                          {editError && <p style={{ fontSize:11, color:"#EF4444", fontWeight:600, margin:"0 0 8px" }}>{editError}</p>}
                          <div style={{ display:"flex", flexDirection:"column", gap:8, marginBottom:10 }}>
                            {editEntries.map((e, idx) => {
                              const type = e.task_type as string
                              const icon = type === "shoot" ? "📷" : type === "edit" ? "🎞️" : "🕐"
                              const patch = (field: string, val: unknown) => {
                                setEditEntries(prev => prev.map((en, i) => {
                                  if (i !== idx) return en
                                  const updated = { ...en, [field]: val }
                                  if (field === "start_time" || field === "end_time") {
                                    const st = field === "start_time" ? val as string : en.start_time as string
                                    const et = field === "end_time" ? val as string : en.end_time as string
                                    const dur = calcDuration(st ?? "", et ?? "")
                                    if (dur > 0) updated.duration_hours = dur
                                  }
                                  return updated
                                }))
                              }
                              // Parse status from notes for "other" type
                              const rawNotes = (e.notes as string) ?? ""
                              const statusMatch = type === "other" ? rawNotes.match(/^\[(completed|in_progress|not_started)\]$/) : null
                              const entryStatus = statusMatch ? statusMatch[1] : "not_started"
                              const LBL: CSSProperties = { display:"block", fontSize:9, fontWeight:700, color:"#9CA3AF", textTransform:"uppercase", letterSpacing:"0.08em", marginBottom:3 }
                              const INP: CSSProperties = { width:"100%", fontSize:12, padding:"6px 8px", borderRadius:7, border:"1.5px solid #E5E7EB", outline:"none", background:"#F9FAFB", boxSizing:"border-box" }
                              return (
                                <div key={idx} style={{ background:"#FFFFFF", borderRadius:10, border:"1px solid #E5E7EB", padding:"10px 12px" }}>
                                  <div style={{ display:"flex", alignItems:"center", justifyContent:"space-between", marginBottom:8 }}>
                                    <span style={{ fontSize:11, fontWeight:700, color:"#6B7280" }}>{icon} Entry {idx + 1}</span>
                                    <button onClick={() => setEditEntries(prev => prev.filter((_, i) => i !== idx))}
                                      style={{ display:"flex", alignItems:"center", gap:4, fontSize:10, fontWeight:700, color:"#EF4444", background:"rgba(239,68,68,0.07)", border:"none", borderRadius:6, padding:"3px 8px", cursor:"pointer" }}>
                                      <Trash2 size={10} /> Remove
                                    </button>
                                  </div>
                                  {/* Title + Client — all types */}
                                  <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:8, marginBottom:6 }}>
                                    <div>
                                      <label style={LBL}>Title</label>
                                      <input value={(e.title as string) ?? ""} onChange={ev => patch("title", ev.target.value)} style={INP} />
                                    </div>
                                    <div>
                                      <label style={LBL}>Client</label>
                                      <input value={(e.client_name as string) ?? ""} onChange={ev => patch("client_name", ev.target.value)} style={INP} />
                                    </div>
                                  </div>
                                  {/* Shoot + Other: start/end time */}
                                  {(type === "shoot" || type === "other") && (
                                    <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:8, marginBottom:6 }}>
                                      <div>
                                        <label style={LBL}>Start Time</label>
                                        <input type="time" value={(e.start_time as string) ?? ""} onChange={ev => patch("start_time", ev.target.value)} style={INP} />
                                      </div>
                                      <div>
                                        <label style={LBL}>End Time</label>
                                        <input type="time" value={(e.end_time as string) ?? ""} onChange={ev => patch("end_time", ev.target.value)} style={INP} />
                                      </div>
                                    </div>
                                  )}
                                  {/* Edit: hours */}
                                  {type === "edit" && (
                                    <div style={{ marginBottom:6 }}>
                                      <label style={LBL}>Editing Hours</label>
                                      <input type="number" min={0} max={24} step={0.5} value={(e.duration_hours as number) ?? 0}
                                        onChange={ev => patch("duration_hours", parseFloat(ev.target.value) || 0)} style={{ ...INP, width:90 }} />
                                    </div>
                                  )}
                                  {/* Shoot + Edit: drive link */}
                                  {(type === "shoot" || type === "edit") && (
                                    <div style={{ marginBottom:6 }}>
                                      <label style={LBL}>Drive Link</label>
                                      <input type="url" value={(e.video_link as string) ?? ""} onChange={ev => patch("video_link", ev.target.value)}
                                        placeholder="https://drive.google.com/…" style={INP} />
                                    </div>
                                  )}
                                  {/* Other: project name + status */}
                                  {type === "other" && (
                                    <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:8, marginBottom:6 }}>
                                      <div>
                                        <label style={LBL}>Project / Task</label>
                                        <input value={(e.project_name as string) ?? ""} onChange={ev => patch("project_name", ev.target.value)} style={INP} />
                                      </div>
                                      <div>
                                        <label style={LBL}>Status</label>
                                        <select value={entryStatus} onChange={ev => patch("notes", `[${ev.target.value}]`)} style={INP}>
                                          <option value="not_started">Not Started</option>
                                          <option value="in_progress">In Progress</option>
                                          <option value="completed">Completed ✓</option>
                                        </select>
                                      </div>
                                    </div>
                                  )}
                                  {/* Notes for shoot + edit */}
                                  {type !== "other" && (
                                    <div>
                                      <label style={LBL}>Notes</label>
                                      <input value={rawNotes} onChange={ev => patch("notes", ev.target.value)} style={INP} />
                                    </div>
                                  )}
                                </div>
                              )
                            })}
                          </div>
                          <div style={{ display:"flex", gap:8 }}>
                            <button onClick={() => { setEditingUpdateId(null); setEditEntries([]) }}
                              style={{ flex:1, padding:"8px 0", borderRadius:10, border:"1.5px solid #E5E7EB", background:"#F9FAFB", color:"#6B7280", fontSize:12, fontWeight:700, cursor:"pointer" }}>
                              Cancel
                            </button>
                            <button disabled={savingEdit} onClick={async () => {
                              setSavingEdit(true); setEditError(null)
                              const res = await updatePastDailyUpdate(u.id, editEntries)
                              setSavingEdit(false)
                              if (res.success) { setEditingUpdateId(null); setEditEntries([]); router.refresh() }
                              else setEditError(res.error ?? "Save failed.")
                            }} style={{ flex:2, padding:"8px 0", borderRadius:10, border:"none", background:"#6366F1", color:"#FFFFFF", fontSize:12, fontWeight:700, cursor: savingEdit ? "not-allowed" : "pointer", opacity: savingEdit ? 0.7 : 1, display:"flex", alignItems:"center", justifyContent:"center", gap:6 }}>
                              {savingEdit ? <Loader2 size={12} className="animate-spin" /> : <CheckCircle2 size={12} />}
                              {savingEdit ? "Saving…" : "Save Changes"}
                            </button>
                          </div>
                        </div>
                      )}
                    </div>
                  )
                })}
              </div>
            </div>
          )}

          {/* ══ WORKED WITH / PARTICIPANTS ════════════════════════════════════════ */}
          {teamMembers.length > 0 && (
            <div style={{ background:"#FFFFFF", borderRadius:20, border:"1.5px solid rgba(99,102,241,0.2)", padding:"18px 20px", boxShadow:"0 2px 10px rgba(0,0,0,0.04)" }}>
              <div style={{ display:"flex", alignItems:"center", gap:10, marginBottom:14 }}>
                <div style={{ width:34, height:34, borderRadius:10, background:"rgba(99,102,241,0.1)", display:"flex", alignItems:"center", justifyContent:"center", flexShrink:0 }}>
                  <span style={{ fontSize:16 }}>👥</span>
                </div>
                <div>
                  <p style={{ fontSize:14, fontWeight:800, color:"#111111", margin:0 }}>Worked With</p>
                  <p style={{ fontSize:10, color:"#9CA3AF", margin:0 }}>Tag teammates who participated — they get auto-tracked</p>
                </div>
                {participantIds.length > 0 && (
                  <span style={{ marginLeft:"auto", fontSize:11, fontWeight:700, padding:"3px 10px", borderRadius:99, background:"rgba(99,102,241,0.1)", color:"#6366F1" }}>
                    {participantIds.length} selected
                  </span>
                )}
              </div>

              {/* Selected chips */}
              {participantIds.length > 0 && (
                <div style={{ display:"flex", flexWrap:"wrap", gap:6, marginBottom:10 }}>
                  {participantIds.map(pid => {
                    const m = teamMembers.find(t => t.id === pid)
                    if (!m) return null
                    const initials = m.name.split(" ").map((n:string) => n[0]).join("").slice(0,2).toUpperCase()
                    return (
                      <button key={pid} onClick={() => toggleParticipant(pid)}
                        style={{ display:"flex", alignItems:"center", gap:6, padding:"5px 10px 5px 6px", borderRadius:99, background:"rgba(99,102,241,0.1)", border:"1.5px solid rgba(99,102,241,0.3)", cursor:"pointer" }}>
                        <div style={{ width:22, height:22, borderRadius:"50%", background:"#6366F1", display:"flex", alignItems:"center", justifyContent:"center", fontSize:9, fontWeight:800, color:"#fff", flexShrink:0 }}>
                          {initials}
                        </div>
                        <span style={{ fontSize:12, fontWeight:700, color:"#4338CA" }}>{m.name.split(" ")[0]}</span>
                        <span style={{ fontSize:10, color:"#818CF8", lineHeight:1 }}>✕</span>
                      </button>
                    )
                  })}
                </div>
              )}

              {/* Search input */}
              <input
                value={participantSearch}
                onChange={e => setParticipantSearch(e.target.value)}
                placeholder="Search team members…"
                style={{ width:"100%", boxSizing:"border-box", fontSize:12, padding:"8px 12px", borderRadius:10, border:"1.5px solid #EBEDF2", background:"#F9FAFB", color:"#111827", outline:"none", marginBottom:10 }}
              />

              {/* Member chips */}
              <div style={{ display:"flex", flexWrap:"wrap", gap:6 }}>
                {filteredMembers.slice(0,20).map(m => {
                  const selected = participantIds.includes(m.id)
                  const initials = m.name.split(" ").map((n:string) => n[0]).join("").slice(0,2).toUpperCase()
                  return (
                    <button key={m.id} onClick={() => toggleParticipant(m.id)}
                      style={{ display:"flex", alignItems:"center", gap:6, padding:"5px 12px 5px 6px", borderRadius:99, cursor:"pointer", transition:"all 0.15s",
                        background: selected ? "rgba(99,102,241,0.1)" : "#F9FAFB",
                        border: `1.5px solid ${selected ? "rgba(99,102,241,0.4)" : "#EBEDF2"}`,
                      }}>
                      <div style={{ width:22, height:22, borderRadius:"50%", background: selected ? "#6366F1" : "#E5E7EB", display:"flex", alignItems:"center", justifyContent:"center", fontSize:9, fontWeight:800, color: selected ? "#fff" : "#9CA3AF", flexShrink:0 }}>
                        {initials}
                      </div>
                      <div style={{ textAlign:"left" }}>
                        <p style={{ fontSize:11, fontWeight:700, color: selected ? "#4338CA" : "#374151", margin:0 }}>{m.name.split(" ")[0]}</p>
                        <p style={{ fontSize:9, color:"#9CA3AF", margin:0 }}>{m.employee_id}</p>
                      </div>
                      {selected && <span style={{ fontSize:10, color:"#6366F1", flexShrink:0 }}>✓</span>}
                    </button>
                  )
                })}
                {filteredMembers.length === 0 && (
                  <p style={{ fontSize:12, color:"#9CA3AF", margin:"4px 0" }}>No members found</p>
                )}
              </div>
            </div>
          )}

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
