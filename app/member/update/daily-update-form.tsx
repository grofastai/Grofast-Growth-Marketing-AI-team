"use client"

import { useState, useTransition, useMemo, useEffect, useRef, Fragment, type CSSProperties } from "react"
import { useRouter } from "next/navigation"
import Image from "next/image"
import {
  Camera, Film, Plus, Trash2, CheckCircle2,
  Loader2, SendHorizonal, Clock, BookOpen, Coffee,
  ChevronDown, Upload, Link2, Zap, BarChart2, MoreHorizontal, Calendar, X,
} from "lucide-react"
import { submitDailyUpdate, deleteDailyUpdate, updatePastDailyUpdate } from "@/lib/actions/daily-updates"
import { buildClientOptions } from "@/lib/utils/client-options"
import ClientSelector from "@/components/ui/ClientSelector"
import { VideoDurationPicker } from "@/components/ui/VideoDurationPicker"
import { useToast } from "@/components/ui/useToast"
import { useConfirm } from "@/components/ui/ConfirmDialog"

interface Project { id: string; business_name: string }
interface TeamMember { id: string; name: string; employee_id: string; role: string; team?: string | null }

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
  revisions: number; hooksCompleted: number; videoLink: string; notes: string
  participantIds: string[]
  isRework: boolean; linkedToTitle: string; linkedToClient: string; linkedToDate: string
}
interface DevEntry {
  id: string; clientName: string; customClient: string; project: string; isCreatingNew: boolean; subtitle: string
  startTime: string; endTime: string; timeTaken: number
  participantIds: string[]
}
interface OtherEntry {
  id: string; clientName: string; customClient: string; otherType: string; title: string
  startTime: string; endTime: string; timeTaken: number
  notes: string; participantIds: string[]
}
interface TimeBlock {
  id: string; isBreak: boolean; breakLabel: string; breakCustom?: string
  startTime: string; endTime: string
  durationHours: number; description: string
  projectName: string; brand: string; customClient: string
  status: "completed" | "in_progress" | "not_started"
  isMultiClient: boolean; clientNames: string[]
  participantIds: string[]
}
interface MediaBreakEntry {
  id: string; startTime: string; endTime: string
  durationHours: number; label: string; customLabel?: string
}

function fmt12(t: string) {
  if (!t) return ""
  const [h, m] = t.split(":").map(Number)
  return `${h % 12 || 12}:${String(m).padStart(2, "0")} ${h >= 12 ? "PM" : "AM"}`
}

// Native time picker — mobile triggers system drum-roll, stores as "HH:MM" (24h)
// allowEmpty: show --:-- when no value set (used for Learning from/to)
function TimePicker({ value, onChange, allowEmpty, style: extraStyle }: { value: string; onChange: (v: string) => void; allowEmpty?: boolean; style?: React.CSSProperties }) {
  const initial = allowEmpty ? (value || "") : (value || "09:00")
  const [local, setLocal] = useState(initial)
  const prev = useRef(value)
  if (prev.current !== value) { prev.current = value; setLocal(allowEmpty ? (value || "") : (value || "09:00")) }
  return (
    <input
      type="time"
      value={local}
      onChange={e => {
        setLocal(e.target.value)
        if (e.target.value) onChange(e.target.value)
        // empty = user is mid-type; don't push to parent (prevents row disappearing)
      }}
      style={{
        fontSize: 13, fontWeight: 700, color: "#111827",
        background: "#fff", border: "1.5px solid #EBEDF2",
        borderRadius: 8, padding: "6px 10px", outline: "none",
        colorScheme: "light", cursor: "pointer",
        ...extraStyle,
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
function timesOverlap(s1: string, e1: string, s2: string, e2: string, thresholdMins = 0): boolean {
  if (!s1 || !e1 || !s2 || !e2) return false
  const a = toMins(s1), b = toMins(e1), c = toMins(s2), d = toMins(e2)
  if (b <= a || d <= c) return false
  return Math.min(b, d) - Math.max(a, c) > thresholdMins
}
export type ActiveLeave = {
  from_date: string; to_date: string; leave_type: string; status: string
  half_day_from_time?: string | null; half_day_to_time?: string | null
  permission_time?: string | null; permission_hours?: number | string | null
}
export type CollabWindow = { date: string; from: string; to: string }
type OverlapEntry = { id?: string; start: string; end: string; title: string }
function findOverlapError(
  newEntries: OverlapEntry[],
  savedEntries: Record<string, unknown>[],
  activeLeaves: ActiveLeave[],
  date: string,
  collabWindows: CollabWindow[] = []
): string | null {
  const valid = newEntries.filter(n => n.start && n.end)
  if (valid.length === 0) return null
  // Build blocked time windows: leave + confirmed collabs for this date
  const blockedWindows: { from: string; to: string; label: string }[] = []
  for (const l of activeLeaves) {
    if (l.from_date > date || l.to_date < date) continue
    if (l.leave_type === 'half_day' && l.half_day_from_time && l.half_day_to_time) {
      blockedWindows.push({ from: l.half_day_from_time, to: l.half_day_to_time, label: 'Half Day Leave' })
    } else if (l.leave_type === 'permission' && l.permission_time && l.permission_hours) {
      const [h, m] = (l.permission_time as string).split(':').map(Number)
      const totalMins = h * 60 + m + Math.round(Number(l.permission_hours) * 60)
      const endH = String(Math.floor(totalMins / 60)).padStart(2, '0')
      const endM = String(totalMins % 60).padStart(2, '0')
      blockedWindows.push({ from: l.permission_time as string, to: `${endH}:${endM}`, label: 'Permission Leave' })
    }
  }
  for (const c of collabWindows) {
    if (c.date === date && c.from && c.to)
      blockedWindows.push({ from: c.from, to: c.to, label: `Confirmed Collab (${c.from}–${c.to})` })
  }
  const newIds = new Set(valid.map(n => n.id).filter(Boolean))
  const saved = savedEntries.filter(e => e.start_time && e.end_time && !newIds.has(e.id as string))
  for (const n of valid) {
    for (const ex of saved) {
      if (timesOverlap(n.start, n.end, ex.start_time as string, ex.end_time as string, 3))
        return `Time ${n.start}–${n.end} overlaps with "${ex.title}" (${ex.start_time}–${ex.end_time}). Please fix the times.`
    }
    for (const w of blockedWindows) {
      if (timesOverlap(n.start, n.end, w.from, w.to, 0))
        return `"${n.title}" (${n.start}–${n.end}) overlaps with your ${w.label}. No entries allowed during that time.`
    }
  }
  for (let i = 0; i < valid.length; i++) {
    for (let j = i + 1; j < valid.length; j++) {
      if (timesOverlap(valid[i].start, valid[i].end, valid[j].start, valid[j].end, 3))
        return `Time ${valid[i].start}–${valid[i].end} overlaps with "${valid[j].title}" (${valid[j].start}–${valid[j].end}). Please fix the times.`
    }
  }
  return null
}
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
  price?: number | null
  project_name?: string; _other_type?: string
}

function parseExistingBlocks(existingUpdate: Record<string, unknown>): TimeBlock[] {
  const entries = existingUpdate?.work_entries as SavedEntry[] | null
  if (!Array.isArray(entries)) return []
  return entries
    .filter(e => e.task_type === 'other')
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

// ── Learning blocks ─────────────────────────────────────────────────────────
interface LearningBlock {
  id: string; client: string; topic: string
  from: string; to: string; notes: string
}
function newLearningBlock(): LearningBlock {
  return { id: crypto.randomUUID(), client: "", topic: "", from: "09:00", to: "09:00", notes: "" }
}
function calcLearningHours(from: string, to: string): number {
  if (!from || !to) return 0
  const [fh, fm] = from.split(":").map(Number)
  const [th, tm] = to.split(":").map(Number)
  const diff = (th * 60 + tm) - (fh * 60 + fm)
  return diff > 0 ? Math.round(diff / 60 * 100) / 100 : 0
}
function parseExistingLearningBlocks(existingUpdate: Record<string, unknown>): LearningBlock[] {
  const entries = existingUpdate?.work_entries as SavedEntry[] | null
  const learnEntries = Array.isArray(entries) ? entries.filter(e => e.task_type === 'learning') : []
  if (learnEntries.length > 0) {
    return learnEntries.map(e => {
      const rawTitle = e.title ?? ''
      const m = rawTitle.match(/^\[([^\]]+)\]\s*(.*)$/)
      return {
        id: e.id ?? crypto.randomUUID(),
        client: m ? m[1] : 'GROFAST DIGITAL',
        topic: m ? m[2] : rawTitle,
        from: e.start_time ?? '',
        to: e.end_time ?? '',
        notes: e.notes ?? '',
      }
    })
  }
  // Legacy fallback: single learning_topic column
  const legacyTopic = existingUpdate?.learning_topic as string | null
  if (legacyTopic) {
    return [{
      id: crypto.randomUUID(), client: 'GROFAST DIGITAL', topic: legacyTopic,
      from: '', to: '', notes: (existingUpdate?.learning_notes as string) ?? '',
    }]
  }
  return [newLearningBlock()]
}

function parseExistingNonMediaBreaks(existingUpdate: Record<string, unknown>): MediaBreakEntry[] {
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
      hooksCompleted: (e as Record<string, unknown>).hooks_completed as number ?? 0,
      videoLink: e.video_link ?? "",
      notes: e.notes ?? "",
      participantIds: (e as Record<string, unknown>).participant_ids as string[] ?? [],
      isRework: (e as Record<string, unknown>).is_rework as boolean ?? false,
      linkedToTitle: (e as Record<string, unknown>).linked_to_title as string ?? "",
      linkedToClient: (e as Record<string, unknown>).linked_to_client as string ?? "",
      linkedToDate: (e as Record<string, unknown>).linked_to_date as string ?? "",
    }))
}

function parseExistingVoiceovers(existingUpdate: Record<string, unknown>): EditEntry[] {
  const entries = existingUpdate?.work_entries as SavedEntry[] | null
  if (!Array.isArray(entries)) return []
  return entries
    .filter(e => e.task_type === 'voiceover')
    .map(e => ({
      id: e.id ?? crypto.randomUUID(),
      clientName: e._client_type ?? e.client_name ?? "",
      brand: "", customClient: e._custom_client ?? "",
      title: e.title ?? "", videoType: "", customVideoType: "", videoDuration: "",
      startTime: e.start_time ?? "", endTime: e.end_time ?? "",
      dateGiven: "", dateFinished: "",
      timeTaken: e.duration_hours ?? 0,
      driveUpdated: false, revisions: 0, hooksCompleted: 0,
      videoLink: e.video_link ?? "", notes: e.notes ?? "",
      participantIds: (e as Record<string, unknown>).participant_ids as string[] ?? [],
      isRework: (e as Record<string, unknown>).is_rework as boolean ?? false,
      linkedToTitle: (e as Record<string, unknown>).linked_to_title as string ?? "",
      linkedToClient: (e as Record<string, unknown>).linked_to_client as string ?? "",
      linkedToDate: (e as Record<string, unknown>).linked_to_date as string ?? "",
    }))
}

function parseExistingPosters(existingUpdate: Record<string, unknown>): EditEntry[] {
  const entries = existingUpdate?.work_entries as SavedEntry[] | null
  if (!Array.isArray(entries)) return []
  return entries
    .filter(e => e.task_type === 'poster')
    .map(e => ({
      id: e.id ?? crypto.randomUUID(),
      clientName: e._client_type ?? e.client_name ?? "",
      brand: "", customClient: e._custom_client ?? "",
      title: e.title ?? "", videoType: "", customVideoType: "", videoDuration: "",
      startTime: e.start_time ?? "", endTime: e.end_time ?? "",
      dateGiven: "", dateFinished: "",
      timeTaken: e.duration_hours ?? 0,
      driveUpdated: false, revisions: 0, hooksCompleted: 0,
      videoLink: e.video_link ?? "", notes: e.notes ?? "",
      participantIds: (e as Record<string, unknown>).participant_ids as string[] ?? [],
      isRework: (e as Record<string, unknown>).is_rework as boolean ?? false,
      linkedToTitle: (e as Record<string, unknown>).linked_to_title as string ?? "",
      linkedToClient: (e as Record<string, unknown>).linked_to_client as string ?? "",
      linkedToDate: (e as Record<string, unknown>).linked_to_date as string ?? "",
    }))
}

function parseExistingNmEdits(existingUpdate: Record<string, unknown>): EditEntry[] {
  const entries = existingUpdate?.work_entries as SavedEntry[] | null
  if (!Array.isArray(entries)) return []
  return entries
    .filter(e => e.task_type === 'edit')
    .map(e => ({
      id: e.id ?? crypto.randomUUID(),
      clientName: e._client_type ?? e.client_name ?? "",
      brand: "", customClient: e._custom_client ?? "",
      title: e.title ?? "", videoType: e.video_type ?? "", customVideoType: "", videoDuration: "",
      startTime: e.start_time ?? "", endTime: e.end_time ?? "",
      dateGiven: "", dateFinished: "",
      timeTaken: e.duration_hours ?? 0,
      driveUpdated: false, revisions: 0, hooksCompleted: 0,
      videoLink: e.video_link ?? "", notes: e.notes ?? "",
      participantIds: (e as Record<string, unknown>).participant_ids as string[] ?? [],
      isRework: (e as Record<string, unknown>).is_rework as boolean ?? false,
      linkedToTitle: (e as Record<string, unknown>).linked_to_title as string ?? "",
      linkedToClient: (e as Record<string, unknown>).linked_to_client as string ?? "",
      linkedToDate: (e as Record<string, unknown>).linked_to_date as string ?? "",
    }))
}

function parseExistingScriptings(existingUpdate: Record<string, unknown>): EditEntry[] {
  const entries = existingUpdate?.work_entries as SavedEntry[] | null
  if (!Array.isArray(entries)) return []
  return entries
    .filter(e => e.task_type === 'scripting')
    .map(e => ({
      id: e.id ?? crypto.randomUUID(),
      clientName: e._client_type ?? e.client_name ?? "",
      brand: "", customClient: e._custom_client ?? "",
      title: e.title ?? "", videoType: "", customVideoType: "", videoDuration: "",
      startTime: e.start_time ?? "", endTime: e.end_time ?? "",
      dateGiven: "", dateFinished: "",
      timeTaken: e.duration_hours ?? 0,
      driveUpdated: false, revisions: 0, hooksCompleted: 0,
      videoLink: e.video_link ?? "", notes: e.notes ?? "",
      participantIds: (e as Record<string, unknown>).participant_ids as string[] ?? [],
      isRework: (e as Record<string, unknown>).is_rework as boolean ?? false,
      linkedToTitle: (e as Record<string, unknown>).linked_to_title as string ?? "",
      linkedToClient: (e as Record<string, unknown>).linked_to_client as string ?? "",
      linkedToDate: (e as Record<string, unknown>).linked_to_date as string ?? "",
    }))
}

function parseExistingDevelopments(existingUpdate: Record<string, unknown>): DevEntry[] {
  const entries = existingUpdate?.work_entries as SavedEntry[] | null
  if (!Array.isArray(entries)) return []
  return entries
    .filter(e => e.task_type === 'development')
    .map(e => ({
      id: e.id ?? crypto.randomUUID(),
      clientName: e._client_type ?? e.client_name ?? "",
      customClient: e._custom_client ?? "",
      project: e.project_name ?? "",
      isCreatingNew: false,
      subtitle: e.title ?? "",
      startTime: e.start_time ?? "", endTime: e.end_time ?? "",
      timeTaken: e.duration_hours ?? 0,
      participantIds: (e as Record<string, unknown>).participant_ids as string[] ?? [],
    }))
}

function parseExistingOthers(existingUpdate: Record<string, unknown>): OtherEntry[] {
  const entries = existingUpdate?.work_entries as SavedEntry[] | null
  if (!Array.isArray(entries)) return []
  return entries
    .filter(e => e.task_type === 'other_activity')
    .map(e => ({
      id: e.id ?? crypto.randomUUID(),
      clientName: e._client_type ?? e.client_name ?? "",
      customClient: e._custom_client ?? "",
      otherType: e._other_type ?? "Meeting",
      title: e.title ?? "",
      startTime: e.start_time ?? "", endTime: e.end_time ?? "",
      timeTaken: e.duration_hours ?? 0,
      notes: e.notes ?? "",
      participantIds: (e as Record<string, unknown>).participant_ids as string[] ?? [],
    }))
}

// ═══════════════════════════════════════════════════════════════════════════════
type PastUpdate = {
  id: string; date: string; working_hours: number | null; learning_hours: number | null
  shoot_count: number | null; editing_count: number | null
  shoot_time_hours: number | null; editing_time_hours: number | null
  work_entries: Record<string, unknown>[] | null; active_tab?: string | null; learning_topic: string | null
}

function clampDate(v: string) { if (!v) return v; const [yr = '', mo = '', dy = ''] = v.split('-'); const y = yr.length > 4 ? yr.slice(0, 4) : yr; const m = mo && +mo > 12 ? '12' : mo; const d = dy && +dy > 31 ? '31' : dy; return [y, m, d].filter(Boolean).join('-') }

export default function DailyUpdateForm({
  projects, sheetClientNames = [], pastClientNames = [], userName, team, workLayout, enabledBlocks, existingUpdate, pastUpdates = [], teamMembers = [], approvedLeaveDates = [],
  todayClockedIn = true, requiresClockIn = false, defaultDate, activeLeavesList = [], collabWindows = [],
}: {
  projects: Project[]; sheetClientNames?: string[]; pastClientNames?: string[]; userName: string; team?: string | null
  workLayout?: 'media' | 'non_media' | 'freelance_media'
  enabledBlocks?: string[] | null
  existingUpdate?: Record<string, unknown> | null; pastUpdates?: PastUpdate[]
  teamMembers?: TeamMember[]; approvedLeaveDates?: string[]
  todayClockedIn?: boolean; requiresClockIn?: boolean; defaultDate?: string
  activeLeavesList?: ActiveLeave[]
  collabWindows?: CollabWindow[]
}) {
  const router = useRouter()
  const confirm = useConfirm()
  const existingUpdateRef = useRef(existingUpdate)
  useEffect(() => { existingUpdateRef.current = existingUpdate }, [existingUpdate])
  const [isPending, startTransition] = useTransition()

  const firstName = userName.split(" ")[0] || "there"
  const now       = new Date()
  const h         = now.getHours()
  const greeting  = h < 12 ? "Good morning" : h < 17 ? "Good afternoon" : "Good evening"

  // Use workLayout if provided (new); fall back to team name for backward compat
  const isMediaTeam = workLayout
    ? workLayout !== 'non_media'
    : (team === "Media Team" || team === "Media Production Team" || team === "Freelance Media Production")
  const isFreelancerLayout = workLayout ? workLayout === 'freelance_media' : team === "Freelance Media Production"
  // Per-person non-media block checklist — null/unset means everything enabled (back-compat default).
  const blockEnabled = (key: string) => !enabledBlocks || enabledBlocks.includes(key)

  const todayStr = new Date().toISOString().split("T")[0]

  // ── Date selector ────────────────────────────────────────────────────────
  const [selectedDate, setSelectedDate] = useState(defaultDate ?? todayStr)
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

    const isPast = date !== todayStr
    // Past date: always show clean empty form (existing entries viewable in History)
    // Today: pre-fill with existing data so user can continue where they left off
    setShoots(isPast ? [] : (found ? parseExistingShoots(found) : []))
    setEdits(isPast ? [] : (found ? parseExistingEdits(found) : []))
    setVoiceovers(isPast ? [] : (found ? parseExistingVoiceovers(found) : []))
    setPosters(isPast ? [] : (found ? parseExistingPosters(found) : []))
    setScriptings(isPast ? [] : (found ? parseExistingScriptings(found) : []))
    setDevelopments(isPast ? [] : (found ? parseExistingDevelopments(found) : []))
    setOthers(isPast ? [] : (found ? parseExistingOthers(found) : []))
    setNmEdits(isPast ? [] : (!isMediaTeam && found ? parseExistingNmEdits(found) : []))
    setTimeBlocks(isPast ? [] : (found ? parseExistingBlocks(found) : []))
    setMediaBreaks(isPast ? [] : (found ? parseExistingMediaBreaks(found) : []))
    setNonMediaBreaks(isPast ? [] : (found ? parseExistingNonMediaBreaks(found) : []))
    setLearningBlocks(isPast ? [newLearningBlock()] : (found ? parseExistingLearningBlocks(found) : [newLearningBlock()]))
    setLearningParticipantIds(isPast ? [] : (found?.active_tab === "learning" ? ((found?.participant_ids as string[]) ?? []) : []))
    // Past date: never mark as done — always show fresh form regardless of existing data
    setWorkingDone(isPast ? false : !!(found && (found as Record<string, unknown>).working_hours))
    setLearningDone(isPast ? false : !!(found && (found as Record<string, unknown>).learning_hours))
    setMediaDone(isPast ? false : (isMediaTeam && existingHasMedia(found)))
    setBreaksDone(isPast ? false : (isMediaTeam && existingHasBreaks(found)))
    setSubmitted(false)
    setEditMode(false)
    setError(null)
    setWorkingError(null)
    setLearningError(null)

    setTab(isMediaTeam ? "media" : "working")
  }

  const [tab, setTab] = useState<"working" | "media" | "learning" | "break">(isMediaTeam ? "media" : "working")

  const { activeOptions: activeClientOptions, pastOptions: pastClientOptions } = buildClientOptions(
    sheetClientNames, pastClientNames
  )
  const allClientOptions = activeClientOptions

  // ── Shoots (media) ───────────────────────────────────────────────────────
  const [shoots, setShoots] = useState<ShootEntry[]>(() => existingUpdate ? parseExistingShoots(existingUpdate) : [])
  const addShoot    = () => setShoots(p => [...p, { id: crypto.randomUUID(), clientName:"", customClient:"", title:"", startTime:"09:00", endTime:"17:00", durationHours:8, cameraHours:0, droneHours:0, travelHours:0, brand:"", shopName:"", location:"", driveLink:"", notes:"", videoUploaded:false, participantIds:[] }])
  const patchShoot  = (id: string, patch: Partial<ShootEntry>) => setShoots(p => p.map(s => s.id === id ? { ...s, ...patch } : s))
  const removeShoot = (id: string) => setShoots(p => p.filter(s => s.id !== id))

  // ── Edits (media) ────────────────────────────────────────────────────────
  const [edits, setEdits] = useState<EditEntry[]>(() => existingUpdate ? parseExistingEdits(existingUpdate) : [])
  const addEdit    = () => setEdits(p => [...p, {
    id: crypto.randomUUID(), clientName: "", brand: "", customClient: "", title: "",
    videoType: "", customVideoType: "", videoDuration: "", hooksCompleted: 0,
    startTime: "09:00", endTime: "09:00",
    dateGiven: todayStr, dateFinished: todayStr, timeTaken: 2,
    driveUpdated: false, revisions: 0, videoLink: "", notes: "", participantIds: [],
    isRework: false, linkedToTitle: "", linkedToClient: "", linkedToDate: "",
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

  // ── Voiceovers (media) ───────────────────────────────────────────────────
  const [voiceovers, setVoiceovers] = useState<EditEntry[]>(() => existingUpdate ? parseExistingVoiceovers(existingUpdate) : [])
  const addVoiceover    = () => setVoiceovers(p => [...p, { id: crypto.randomUUID(), clientName:"", brand:"", customClient:"", title:"", videoType:"", customVideoType:"", videoDuration:"", startTime:"09:00", endTime:"09:00", dateGiven:"", dateFinished:"", timeTaken:1, driveUpdated:false, revisions:0, hooksCompleted:0, videoLink:"", notes:"", participantIds:[], isRework:false, linkedToTitle:"", linkedToClient:"", linkedToDate:"" }])
  const patchVoiceover  = (id: string, patch: Partial<EditEntry>) => setVoiceovers(p => p.map(e => { if (e.id !== id) return e; const u = { ...e, ...patch }; if (patch.startTime !== undefined || patch.endTime !== undefined) { const d = calcDuration(u.startTime, u.endTime); if (d > 0) u.timeTaken = d } return u }))
  const removeVoiceover = (id: string) => setVoiceovers(p => p.filter(e => e.id !== id))

  // ── Posters (media) ──────────────────────────────────────────────────────
  const [posters, setPosters] = useState<EditEntry[]>(() => existingUpdate ? parseExistingPosters(existingUpdate) : [])
  const addPoster    = () => setPosters(p => [...p, { id: crypto.randomUUID(), clientName:"", brand:"", customClient:"", title:"", videoType:"", customVideoType:"", videoDuration:"", startTime:"09:00", endTime:"09:00", dateGiven:"", dateFinished:"", timeTaken:1, driveUpdated:false, revisions:0, hooksCompleted:0, videoLink:"", notes:"", participantIds:[], isRework:false, linkedToTitle:"", linkedToClient:"", linkedToDate:"" }])
  const patchPoster  = (id: string, patch: Partial<EditEntry>) => setPosters(p => p.map(e => { if (e.id !== id) return e; const u = { ...e, ...patch }; if (patch.startTime !== undefined || patch.endTime !== undefined) { const d = calcDuration(u.startTime, u.endTime); if (d > 0) u.timeTaken = d } return u }))
  const removePoster = (id: string) => setPosters(p => p.filter(e => e.id !== id))

  // ── Scripting (non-media) ────────────────────────────────────────────────
  const [scriptings, setScriptings] = useState<EditEntry[]>(() => existingUpdate ? parseExistingScriptings(existingUpdate) : [])
  const addScripting    = () => setScriptings(p => [...p, { id: crypto.randomUUID(), clientName:"", brand:"", customClient:"", title:"", videoType:"", customVideoType:"", videoDuration:"", startTime:"09:00", endTime:"09:00", dateGiven:"", dateFinished:"", timeTaken:1, driveUpdated:false, revisions:0, hooksCompleted:0, videoLink:"", notes:"", participantIds:[], isRework:false, linkedToTitle:"", linkedToClient:"", linkedToDate:"" }])
  const patchScripting  = (id: string, patch: Partial<EditEntry>) => setScriptings(p => p.map(e => { if (e.id !== id) return e; const u = { ...e, ...patch }; if (patch.startTime !== undefined || patch.endTime !== undefined) { const d = calcDuration(u.startTime, u.endTime); if (d > 0) u.timeTaken = d } return u }))
  const removeScripting = (id: string) => setScriptings(p => p.filter(e => e.id !== id))

  // ── Development (non-media) ──────────────────────────────────────────────
  const [developments, setDevelopments] = useState<DevEntry[]>(() => existingUpdate ? parseExistingDevelopments(existingUpdate) : [])
  const addDevelopment    = () => setDevelopments(p => [...p, { id: crypto.randomUUID(), clientName:"", customClient:"", project:"", isCreatingNew:false, subtitle:"", startTime:"09:00", endTime:"09:00", timeTaken:1, participantIds:[] }])
  const patchDevelopment  = (id: string, patch: Partial<DevEntry>) => setDevelopments(p => p.map(e => { if (e.id !== id) return e; const u = { ...e, ...patch }; if (patch.startTime !== undefined || patch.endTime !== undefined) { const d = calcDuration(u.startTime, u.endTime); if (d > 0) u.timeTaken = d } return u }))
  const removeDevelopment = (id: string) => setDevelopments(p => p.filter(e => e.id !== id))

  // ── Non-media editing ─────────────────────────────────────────────────────
  const [nmEdits, setNmEdits] = useState<EditEntry[]>(() => (!isMediaTeam && existingUpdate) ? parseExistingNmEdits(existingUpdate) : [])
  const addNmEdit    = () => setNmEdits(p => [...p, { id: crypto.randomUUID(), clientName:"", brand:"", customClient:"", title:"", videoType:"", customVideoType:"", videoDuration:"", startTime:"09:00", endTime:"09:00", dateGiven:"", dateFinished:"", timeTaken:1, driveUpdated:false, revisions:0, hooksCompleted:0, videoLink:"", notes:"", participantIds:[], isRework:false, linkedToTitle:"", linkedToClient:"", linkedToDate:"" }])
  const patchNmEdit  = (id: string, patch: Partial<EditEntry>) => setNmEdits(p => p.map(e => { if (e.id !== id) return e; const u = { ...e, ...patch }; if (patch.startTime !== undefined || patch.endTime !== undefined) { const d = calcDuration(u.startTime, u.endTime); if (d > 0) u.timeTaken = d } return u }))
  const removeNmEdit = (id: string) => setNmEdits(p => p.filter(e => e.id !== id))

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
    id: crypto.randomUUID(), isBreak: true, breakLabel: "Lunch Break",
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
  const addMediaBreak    = () => setMediaBreaks(p => [...p, { id: crypto.randomUUID(), startTime: "13:00", endTime: "13:30", durationHours: 0.5, label: "Lunch Break" }])
  const patchMediaBreak  = (id: string, patch: Partial<MediaBreakEntry>) => setMediaBreaks(p => p.map(b => {
    const updated = { ...b, ...patch }
    if (patch.startTime || patch.endTime) updated.durationHours = calcDuration(updated.startTime, updated.endTime)
    return b.id === id ? updated : b
  }))
  const removeMediaBreak = (id: string) => setMediaBreaks(p => p.filter(b => b.id !== id))

  // ── Non-Media Breaks (own state, mirrors media break approach) ───────────
  const [nonMediaBreaks, setNonMediaBreaks] = useState<MediaBreakEntry[]>(() =>
    !isMediaTeam && existingUpdate ? parseExistingNonMediaBreaks(existingUpdate) : []
  )
  const addNonMediaBreak    = () => setNonMediaBreaks(p => [...p, { id: crypto.randomUUID(), startTime: "13:00", endTime: "13:30", durationHours: 0.5, label: "Lunch Break" }])
  const patchNonMediaBreak  = (id: string, patch: Partial<MediaBreakEntry>) => setNonMediaBreaks(p => p.map(b => {
    const updated = { ...b, ...patch }
    if (patch.startTime || patch.endTime) updated.durationHours = calcDuration(updated.startTime, updated.endTime)
    return b.id === id ? updated : b
  }))
  const removeNonMediaBreak = (id: string) => setNonMediaBreaks(p => p.filter(b => b.id !== id))

  // ── Learning (multi-block) ───────────────────────────────────────────────
  const [learningBlocks, setLearningBlocks] = useState<LearningBlock[]>(() =>
    existingUpdate ? parseExistingLearningBlocks(existingUpdate) : [newLearningBlock()]
  )
  const addLearningBlock = () => setLearningBlocks(p => [...p, newLearningBlock()])
  const removeLearningBlock = (id: string) =>
    setLearningBlocks(p => {
      const next = p.filter(b => b.id !== id)
      // Removing the last remaining block resets to the empty "Add Learning" prompt
      // instead of leaving a single blank block with no way to clear it.
      if (next.length === 0) { setLearningStarted(false); return [newLearningBlock()] }
      return next
    })
  const patchLearningBlock = (id: string, patch: Partial<LearningBlock>) =>
    setLearningBlocks(p => p.map(b => b.id === id ? { ...b, ...patch } : b))
  const learningHours = Math.round(
    learningBlocks.reduce((s, b) => s + calcLearningHours(b.from, b.to), 0) * 100
  ) / 100
  const learningSummaryTopic = learningBlocks.find(b => b.topic.trim())?.topic ?? ""
  const filledLearningBlocks = learningBlocks.filter(
    b => b.client.trim() && b.topic.trim() && b.from && b.to && calcLearningHours(b.from, b.to) > 0
  )

  // ── Other (Meeting / Teaching / Misc) — Learning tab, both Media & Non-Media ──
  const [others, setOthers] = useState<OtherEntry[]>(() => existingUpdate ? parseExistingOthers(existingUpdate) : [])
  const addOther    = () => setOthers(p => [...p, { id: crypto.randomUUID(), clientName:"", customClient:"", otherType:"Meeting", title:"", startTime:"09:00", endTime:"09:00", timeTaken:0.5, notes:"", participantIds:[] }])
  const patchOther  = (id: string, patch: Partial<OtherEntry>) => setOthers(p => p.map(e => { if (e.id !== id) return e; const u = { ...e, ...patch }; if (patch.startTime !== undefined || patch.endTime !== undefined) { const d = calcDuration(u.startTime, u.endTime); if (d > 0) u.timeTaken = d } return u }))
  const removeOther = (id: string) => setOthers(p => p.filter(e => e.id !== id))
  const [learningParticipantIds, setLearningParticipantIds] = useState<string[]>(
    existingUpdate?.active_tab === "learning" ? ((existingUpdate?.participant_ids as string[]) ?? []) : []
  )

  const { toastEl, showToast } = useToast()
  const [error,         setError]         = useState<string | null>(null)
  const [workingError,  setWorkingError]  = useState<string | null>(null)
  const [learningError, setLearningError] = useState<string | null>(null)
  useEffect(() => { if (error) showToast(error) }, [error])
  const existingHasMedia = (u: Record<string, unknown> | null) =>
    !!(u && (
      (Array.isArray((u as Record<string,unknown>).work_entries) &&
        ((u as Record<string,unknown>).work_entries as Record<string,unknown>[])
          .some(e => ['shoot', 'edit', 'voiceover', 'poster'].includes(e.task_type as string)))
      || Number((u as Record<string,unknown>).shoot_count) > 0
      || Number((u as Record<string,unknown>).editing_count) > 0
    ))
  const existingHasBreaks = (u: Record<string, unknown> | null) =>
    !!(u && Array.isArray((u as Record<string,unknown>).work_entries) &&
      ((u as Record<string,unknown>).work_entries as Record<string,unknown>[])
        .some(e => e.task_type === 'break' && Number(e.duration_hours) > 0))

  const [submitted,       setSubmitted]       = useState(false)
  const [breakSubmitting, setBreakSubmitting] = useState(false)
  const [successPopup,  setSuccessPopup]  = useState<string | null>(null)
  useEffect(() => {
    if (!successPopup) return
    const t = setTimeout(() => setSuccessPopup(null), 2500)
    return () => clearTimeout(t)
  }, [successPopup])
  const [workingDone,   setWorkingDone]   = useState(!!(existingUpdate && (existingUpdate as Record<string,unknown>).working_hours))
  const [learningDone,  setLearningDone]  = useState(!!(existingUpdate && (existingUpdate as Record<string,unknown>).learning_hours))
  const [learningStarted, setLearningStarted] = useState(!!(existingUpdate && (existingUpdate as Record<string,unknown>).learning_hours))
  const [mediaDone,     setMediaDone]     = useState(() => isMediaTeam && existingHasMedia(existingUpdate as unknown as Record<string,unknown> | null))
  const [breaksDone,    setBreaksDone]    = useState(() => isMediaTeam && existingHasBreaks(existingUpdate as unknown as Record<string,unknown> | null))
  const [editMode,      setEditMode]      = useState(false)
  const [savedIds,      setSavedIds]      = useState<Set<string>>(new Set())
  const [entryErrors,   setEntryErrors]   = useState<Record<string, string>>({})
  const [expandedId,    setExpandedId]    = useState<string | null>(null)
  const [deletingId,    setDeletingId]    = useState<string | null>(null)
  const [editingUpdateId, setEditingUpdateId] = useState<string | null>(null)
  const [editEntries,   setEditEntries]   = useState<Record<string, unknown>[]>([])
  const [savingEdit,    setSavingEdit]    = useState(false)
  const [editError,     setEditError]     = useState<string | null>(null)

  // ── Participants (Worked With) ────────────────────────────────────────────────
  const [participantIds,    setParticipantIds]    = useState<string[]>([])
  const [participantSearch, setParticipantSearch] = useState("")

  function toggleParticipant(id: string) {
    setParticipantIds(prev => prev.includes(id) ? prev.filter(p => p !== id) : [...prev, id])
  }

  const filteredMembers = participantSearch.trim()
    ? teamMembers.filter(m => m.name.toLowerCase().includes(participantSearch.toLowerCase()) || m.employee_id.toLowerCase().includes(participantSearch.toLowerCase()))
    : teamMembers

  // After router.refresh() updates pastUpdates, sync activeUpdate + tab-done states for current past date
  useEffect(() => {
    const isDone = isMediaTeam ? mediaDone : workingDone
    if (isDone && isPastDate && !activeUpdate) {
      const found = pastUpdates.find(u => u.date === selectedDate)
      if (found) {
        const rec = found as unknown as Record<string, unknown>
        setActiveUpdate(rec)
        if (isMediaTeam) {
          setMediaDone(existingHasMedia(rec))
          setBreaksDone(existingHasBreaks(rec))
          setLearningDone(!!(rec.learning_hours))
        }
      }
    }
  }, [pastUpdates]) // eslint-disable-line react-hooks/exhaustive-deps

  // Autosave time blocks
  useEffect(() => {
    if (workingDone || existingUpdate) return
    try { localStorage.setItem(DRAFT_KEY, JSON.stringify({ date: getTodayStr(), blocks: timeBlocks })) } catch { /* ignore */ }
  }, [timeBlocks, workingDone, existingUpdate]) // eslint-disable-line react-hooks/exhaustive-deps

  // Warn before closing/refreshing if form has unsaved data
  const hasUnsaved = !workingDone && (
    shoots.length > 0 || edits.length > 0 ||
    timeBlocks.some(b => b.description.trim()) ||
    learningBlocks.some(b => b.topic.trim().length > 0)
  )
  useEffect(() => {
    const handler = (e: BeforeUnloadEvent) => {
      if (!hasUnsaved) return
      e.preventDefault()
      e.returnValue = ""
    }
    window.addEventListener("beforeunload", handler)
    return () => window.removeEventListener("beforeunload", handler)
  }, [hasUnsaved])

  // Intercept in-app link navigation when form has unsaved data
  const [pendingNav, setPendingNav] = useState<string | null>(null)
  useEffect(() => {
    if (!hasUnsaved) return
    const handler = (e: MouseEvent) => {
      const anchor = (e.target as HTMLElement).closest("a")
      if (!anchor?.href) return
      try {
        const url = new URL(anchor.href)
        if (url.origin !== window.location.origin) return
        if (url.pathname === window.location.pathname) return
        e.preventDefault()
        e.stopPropagation()
        setPendingNav(url.pathname)
      } catch { /* ignore non-parseable hrefs */ }
    }
    document.addEventListener("click", handler, true)
    return () => document.removeEventListener("click", handler, true)
  }, [hasUnsaved])

  // Last 50 entries per type for revision picker (includes same-day, no date cutoff)
  const past15Options = useMemo(() => {
    const MAX = 50
    type Opt = { key: string; label: string; title: string; client: string; date: string }
    type Source = { date: string; work_entries: Record<string, unknown>[] | null }
    const editsOpts: Opt[] = [], voiceoversOpts: Opt[] = [], postersOpts: Opt[] = [], scriptingsOpts: Opt[] = []
    // existingUpdate (today's row) is fetched separately from pastUpdates (which excludes today),
    // so it must be merged in here — otherwise entries added today can never appear as a revision target.
    const sources: Source[] = [
      ...(existingUpdate ? [existingUpdate as unknown as Source] : []),
      ...(pastUpdates as unknown as Source[]),
    ]
    for (const u of sources) {
      if (u.date > selectedDate) continue
      if (editsOpts.length >= MAX && voiceoversOpts.length >= MAX && postersOpts.length >= MAX) break
      const entries = Array.isArray(u.work_entries) ? u.work_entries as Record<string, unknown>[] : []
      for (const e of entries) {
        if (e.is_rework) continue
        const title = (e.title as string) || ""
        const client = (e.client_name as string) || ""
        if (!title) continue
        const dateLabel = new Date(u.date + "T12:00:00").toLocaleDateString("en-US", { day:"numeric", month:"short", year:"numeric" })
        const key = `${u.date}||${client}||${title}`
        if (e.task_type === "edit" && editsOpts.length < MAX) editsOpts.push({ key, label:`🎬  ${client}  ·  ${title}  ·  ${dateLabel}`, title, client, date: u.date })
        else if (e.task_type === "voiceover" && voiceoversOpts.length < MAX) voiceoversOpts.push({ key, label:`🎙️  ${client}  ·  ${title}  ·  ${dateLabel}`, title, client, date: u.date })
        else if (e.task_type === "poster" && postersOpts.length < MAX) postersOpts.push({ key, label:`🖼️  ${client}  ·  ${title}  ·  ${dateLabel}`, title, client, date: u.date })
        else if (e.task_type === "scripting" && scriptingsOpts.length < MAX) scriptingsOpts.push({ key, label:`📝  ${client}  ·  ${title}  ·  ${dateLabel}`, title, client, date: u.date })
      }
    }
    return { edits: editsOpts, voiceovers: voiceoversOpts, posters: postersOpts, scriptings: scriptingsOpts }
  }, [pastUpdates, existingUpdate, selectedDate])

  // Development project picker — grows from this person's own past Development entries.
  // No "finished" status: a project just stops being picked once nobody logs against it anymore.
  const pastProjectNames = useMemo(() => {
    const names = new Set<string>()
    const sources = [
      ...(existingUpdate ? [existingUpdate as unknown as { work_entries: Record<string, unknown>[] | null }] : []),
      ...(pastUpdates as unknown as { work_entries: Record<string, unknown>[] | null }[]),
    ]
    for (const u of sources) {
      const entries = Array.isArray(u.work_entries) ? u.work_entries as Record<string, unknown>[] : []
      for (const e of entries) {
        if (e.task_type !== "development") continue
        const name = (e.project_name as string) || (e.client_name as string) || ""
        if (name) names.add(name)
      }
    }
    return Array.from(names).sort()
  }, [pastUpdates, existingUpdate])

  const totalShootHours     = useMemo(() => shoots.reduce((s, e) => s + e.durationHours, 0), [shoots])
  const totalTravelHours    = useMemo(() => shoots.reduce((s, e) => s + e.travelHours, 0), [shoots])
  const totalEditHours      = useMemo(() => edits.reduce((s, e) => s + calcDuration(e.startTime, e.endTime), 0), [edits])
  const totalVoiceoverHours = useMemo(() => voiceovers.reduce((s, e) => s + (calcDuration(e.startTime, e.endTime) || e.timeTaken), 0), [voiceovers])
  const totalPosterHours    = useMemo(() => posters.reduce((s, e) => s + (calcDuration(e.startTime, e.endTime) || e.timeTaken), 0), [posters])
  const totalMediaHours = totalShootHours + totalEditHours + totalVoiceoverHours + totalPosterHours
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
    if (requiresClockIn && !todayClockedIn && selectedDate === todayStr) { setWorkingError("Please clock in on the Attendance page before submitting today's work log."); return }
    if (filledBlocks.length === 0 && posters.length === 0 && voiceovers.length === 0 && nmEdits.length === 0 && scriptings.length === 0 && developments.length === 0) { setWorkingError("Add at least one time block, poster, voiceover, editing, scripting, or development entry."); return }

    // Per-block validation: timings + description + client are all mandatory
    for (let i = 0; i < filledBlocks.length; i++) {
      const b = filledBlocks[i]
      const label = filledBlocks.length > 1 ? `Block ${i + 1}: ` : ""
      if (!b.startTime || !b.endTime || toMins(b.endTime) <= toMins(b.startTime)) {
        setWorkingError(`${label}End time must be after start time.`); return
      }
      if (!b.description.trim()) {
        setWorkingError(`${label}Enter what you worked on.`); return
      }
      const hasClient = b.clientNames.length > 0
      if (!hasClient) {
        setWorkingError(`${label}Select a client / project.`); return
      }
    }

    // Overlap check: all new entries vs saved + within batch + leave windows (today AND past dates)
    {
      const existingEntries = activeUpdate ? (activeUpdate.work_entries as Record<string,unknown>[] | null) ?? [] : []
      const newEntries: OverlapEntry[] = [
        ...filledBlocks.map(b => ({ id: b.id, start: b.startTime, end: b.endTime, title: b.description || 'Work' })),
        ...nonMediaBreaks.filter(b => b.durationHours > 0).map(b => ({ id: b.id, start: b.startTime ?? '', end: b.endTime ?? '', title: 'Break' })),
        ...voiceovers.map(v => ({ id: v.id, start: v.startTime, end: v.endTime, title: v.title || 'Voiceover' })),
        ...posters.map(p => ({ id: p.id, start: p.startTime, end: p.endTime, title: p.title || 'Poster' })),
        ...nmEdits.map(n => ({ id: n.id, start: n.startTime, end: n.endTime, title: n.title || 'Edit' })),
        ...scriptings.map(s => ({ id: s.id, start: s.startTime, end: s.endTime, title: s.title || 'Scripting' })),
        ...developments.map(d => ({ id: d.id, start: d.startTime, end: d.endTime, title: d.subtitle || 'Development' })),
      ]
      const overlapErr = findOverlapError(newEntries, existingEntries, activeLeavesList, selectedDate, collabWindows)
      if (overlapErr) { setWorkingError(overlapErr); return }
    }

    // Voiceover mandatory: client, title, start time, end time
    for (let i = 0; i < voiceovers.length; i++) {
      const v = voiceovers[i]
      const label = voiceovers.length > 1 ? `Voiceover ${i + 1}: ` : "Voiceover: "
      const client = v.clientName
      if (!client) { setWorkingError(`${label}Select a client.`); return }
      if (!v.title.trim()) { setWorkingError(`${label}Enter a script name.`); return }
      if (!v.startTime) { setWorkingError(`${label}Enter start time.`); return }
      if (!v.endTime)   { setWorkingError(`${label}Enter end time.`); return }
      if (toMins(v.endTime) <= toMins(v.startTime)) { setWorkingError(`${label}End time must be after start time.`); return }
    }

    // Poster mandatory: client, title, start time, end time
    for (let i = 0; i < posters.length; i++) {
      const p = posters[i]
      const label = posters.length > 1 ? `Poster ${i + 1}: ` : "Poster: "
      const client = p.clientName
      if (!client) { setWorkingError(`${label}Select a client.`); return }
      if (!p.title.trim()) { setWorkingError(`${label}Enter a poster name.`); return }
      if (!p.startTime) { setWorkingError(`${label}Enter start time.`); return }
      if (!p.endTime)   { setWorkingError(`${label}Enter end time.`); return }
      if (toMins(p.endTime) <= toMins(p.startTime)) { setWorkingError(`${label}End time must be after start time.`); return }
    }

    // Scripting mandatory: client, title, start time, end time
    for (let i = 0; i < scriptings.length; i++) {
      const s = scriptings[i]
      const label = scriptings.length > 1 ? `Scripting ${i + 1}: ` : "Scripting: "
      if (!s.clientName) { setWorkingError(`${label}Select a client.`); return }
      if (!s.title.trim()) { setWorkingError(`${label}Enter a script title.`); return }
      if (!s.startTime) { setWorkingError(`${label}Enter start time.`); return }
      if (!s.endTime)   { setWorkingError(`${label}Enter end time.`); return }
      if (toMins(s.endTime) <= toMins(s.startTime)) { setWorkingError(`${label}End time must be after start time.`); return }
    }

    // Development mandatory: client, project, sub-title, start/end time
    for (let i = 0; i < developments.length; i++) {
      const d = developments[i]
      const label = developments.length > 1 ? `Development ${i + 1}: ` : "Development: "
      if (!d.clientName) { setWorkingError(`${label}Select a client.`); return }
      if (!d.project.trim()) { setWorkingError(`${label}Select or create a project.`); return }
      if (!d.subtitle.trim()) { setWorkingError(`${label}Enter what you worked on today.`); return }
      if (!d.startTime) { setWorkingError(`${label}Enter start time.`); return }
      if (!d.endTime)   { setWorkingError(`${label}Enter end time.`); return }
      if (toMins(d.endTime) <= toMins(d.startTime)) { setWorkingError(`${label}End time must be after start time.`); return }
    }

    // Editing (non-media) mandatory: client, video name, video type, start/end time
    for (let i = 0; i < nmEdits.length; i++) {
      const n = nmEdits[i]
      const label = nmEdits.length > 1 ? `Edit ${i + 1}: ` : "Edit: "
      const client = n.clientName
      if (!client) { setWorkingError(`${label}Select a client.`); return }
      if (!n.title.trim()) { setWorkingError(`${label}Enter a video name.`); return }
      if (!n.videoType || n.videoType === "") { setWorkingError(`${label}Select a video type.`); return }
      if (!n.startTime) { setWorkingError(`${label}Enter start time.`); return }
      if (!n.endTime)   { setWorkingError(`${label}Enter end time.`); return }
      if (toMins(n.endTime) <= toMins(n.startTime)) { setWorkingError(`${label}End time must be after start time.`); return }
    }

    const work_entries = [
      ...filledBlocks.map(t => {
        const effClient = t.projectName === "Promotion" ? (t.brand || "Our Brand")
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
          duration_hours: t.durationHours, notes: "",
          participant_ids: t.participantIds ?? [],
          video_uploaded: null, screenshot_url: "", video_link: "", editing_videos: [],
        }
      }),
      ...nonMediaBreaks.filter(b => b.durationHours > 0).map(b => ({
        id: b.id,
        client_id: null,
        client_name: "Break",
        client_names: [],
        is_multi_client: false,
        task_type: "break" as const,
        title: b.label === "__other__" ? (b.customLabel || "Break") : (b.label || "Break"),
        start_time: b.startTime, end_time: b.endTime,
        duration_hours: b.durationHours, notes: undefined,
        video_uploaded: null, screenshot_url: "", video_link: "", editing_videos: [],
      })),
      ...voiceovers.map(e => ({
        id: e.id,
        client_id: projects.find(p => p.business_name === e.clientName)?.id ?? null,
        client_name: e.clientName || "Internal",
        client_names: [] as string[],
        is_multi_client: false,
        task_type: "voiceover" as const,
        title: e.title || "Voiceover", start_time: e.startTime, end_time: e.endTime,
        duration_hours: calcDuration(e.startTime, e.endTime) || e.timeTaken,
        notes: e.notes, video_uploaded: null, screenshot_url: "", video_link: e.videoLink, editing_videos: [],
        _client_type: e.clientName, _custom_client: e.customClient,
        participant_ids: e.participantIds,
        is_rework: e.isRework || false, linked_to_title: e.linkedToTitle || null, linked_to_client: e.linkedToClient || null, linked_to_date: e.linkedToDate || null,
      })),
      ...posters.map(e => ({
        id: e.id,
        client_id: projects.find(p => p.business_name === e.clientName)?.id ?? null,
        client_name: e.clientName || "Internal",
        client_names: [] as string[],
        is_multi_client: false,
        task_type: "poster" as const,
        title: e.title || "Poster", start_time: e.startTime, end_time: e.endTime,
        duration_hours: calcDuration(e.startTime, e.endTime) || e.timeTaken,
        notes: e.notes, video_uploaded: null, screenshot_url: "", video_link: e.videoLink, editing_videos: [],
        _client_type: e.clientName, _custom_client: e.customClient,
        participant_ids: e.participantIds,
        is_rework: e.isRework || false, linked_to_title: e.linkedToTitle || null, linked_to_client: e.linkedToClient || null, linked_to_date: e.linkedToDate || null,
      })),
      ...nmEdits.map(e => ({
        id: e.id,
        client_id: projects.find(p => p.business_name === e.clientName)?.id ?? null,
        client_name: e.clientName || "Internal",
        client_names: [] as string[],
        is_multi_client: false,
        task_type: "edit" as const,
        title: e.title || "Editing", start_time: e.startTime, end_time: e.endTime,
        duration_hours: calcDuration(e.startTime, e.endTime) || e.timeTaken,
        notes: e.notes || undefined, video_uploaded: null, screenshot_url: "", video_link: e.videoLink, editing_videos: [],
        video_type: e.videoType,
        _client_type: e.clientName, _custom_client: e.customClient,
        participant_ids: e.participantIds,
        is_rework: e.isRework || false, linked_to_title: e.linkedToTitle || null, linked_to_client: e.linkedToClient || null, linked_to_date: e.linkedToDate || null,
      })),
      ...scriptings.map(e => ({
        id: e.id,
        client_id: projects.find(p => p.business_name === e.clientName)?.id ?? null,
        client_name: e.clientName || "Internal",
        client_names: [] as string[],
        is_multi_client: false,
        task_type: "scripting" as const,
        title: e.title || "Scripting", start_time: e.startTime, end_time: e.endTime,
        duration_hours: calcDuration(e.startTime, e.endTime) || e.timeTaken,
        notes: e.notes, video_uploaded: null, screenshot_url: "", video_link: e.videoLink, editing_videos: [],
        _client_type: e.clientName, _custom_client: e.customClient,
        participant_ids: e.participantIds,
        is_rework: e.isRework || false, linked_to_title: e.linkedToTitle || null, linked_to_client: e.linkedToClient || null, linked_to_date: e.linkedToDate || null,
      })),
      ...developments.map(e => ({
        id: e.id,
        client_id: projects.find(p => p.business_name === e.clientName)?.id ?? null,
        client_name: e.clientName || "Internal",
        client_names: [] as string[],
        is_multi_client: false,
        task_type: "development" as const,
        title: e.subtitle || "Development", start_time: e.startTime, end_time: e.endTime,
        duration_hours: calcDuration(e.startTime, e.endTime) || e.timeTaken,
        notes: undefined, video_uploaded: null, screenshot_url: "", video_link: "", editing_videos: [],
        project_name: e.project,
        _client_type: e.clientName, _custom_client: e.customClient,
        participant_ids: e.participantIds,
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
      else {
        try { localStorage.removeItem(DRAFT_KEY) } catch { /* ignore */ }
        if (isPastDate) {
          // Past date: show success banner, reset form for another entry, refresh data
          setSubmitted(true)
          setSuccessPopup("working")
          setTimeBlocks([])
          setVoiceovers([])
          setPosters([])
          setScriptings([])
          setDevelopments([])
          setNmEdits([])
          router.refresh()
        } else {
          setSuccessPopup("working")
          setWorkingDone(true); router.refresh()
        }
      }
    })
  }

  // ── Submit: media (shoots + edits + breaks) ──────────────────────────────
  function handleMediaSubmit() {
    setError(null)
    if (requiresClockIn && !todayClockedIn && selectedDate === todayStr) { setError("Please clock in on the Attendance page before submitting today's work log."); return }
    if (tab !== "break" && shoots.length === 0 && edits.length === 0) { setError("Add at least one shoot or edit entry."); return }

    // Overlap check: all new entries vs saved + within batch + leave windows (today AND past dates)
    {
      const existingEntries = activeUpdate ? (activeUpdate.work_entries as Record<string,unknown>[] | null) ?? [] : []
      const newEntries: OverlapEntry[] = [
        ...shoots.map(s => ({ id: s.id, start: s.startTime, end: s.endTime, title: s.title || 'Shoot' })),
        ...edits.map(e => ({ id: e.id, start: e.startTime, end: e.endTime, title: e.title || 'Edit' })),
      ]
      const overlapErr = findOverlapError(newEntries, existingEntries, activeLeavesList, selectedDate, collabWindows)
      if (overlapErr) { setError(overlapErr); return }
    }

    // Per-entry field validation — runs on Submit (not just per-entry Save)
    for (let i = 0; i < shoots.length; i++) {
      const s = shoots[i]
      const label = shoots.length > 1 ? `Shoot ${i + 1}: ` : "Shoot: "
      if (!s.clientName || s.clientName === "") { setError(`${label}Select a client.`); return }
      if (!s.title.trim()) { setError(`${label}Enter a shoot name.`); return }
      if (!s.startTime || !s.endTime) { setError(`${label}Set start and end time.`); return }
      if (toMins(s.endTime) <= toMins(s.startTime)) { setError(`${label}End time must be after start time.`); return }
    }
    for (let i = 0; i < edits.length; i++) {
      const e = edits[i]
      const label = edits.length > 1 ? `Edit ${i + 1}: ` : "Edit: "
      if (!e.clientName || e.clientName === "") { setError(`${label}Select a client.`); return }
      if (!e.title.trim()) { setError(`${label}Enter a video name.`); return }
      if (!e.videoType || e.videoType === "") { setError(`${label}Select a video type.`); return }
      if (!e.dateGiven) { setError(`${label}Set the Date Given.`); return }
      if (!e.dateFinished) { setError(`${label}Set the Date Finished.`); return }
      if (!e.videoDuration) { setError(`${label}Select the video length.`); return }
      if (e.revisions === null || e.revisions === undefined || isNaN(Number(e.revisions)) || !Number.isInteger(Number(e.revisions)) || Number(e.revisions) < 0) { setError(`${label}Revisions must be a whole number (0, 1, 2…).`); return }
      if (e.hooksCompleted === null || e.hooksCompleted === undefined || isNaN(Number(e.hooksCompleted)) || !Number.isInteger(Number(e.hooksCompleted)) || Number(e.hooksCompleted) < 0) { setError(`${label}Hooks Completed must be a whole number (0, 1, 2…).`); return }
      if (!e.startTime || !e.endTime) { setError(`${label}Set start and end time.`); return }
      if (toMins(e.endTime) <= toMins(e.startTime)) { setError(`${label}End time must be after start time.`); return }
      if (!e.videoLink?.trim()) { setError(`${label}Add the Drive / Video link.`); return }
    }

    const work_entries = [
      ...shoots.map(s => ({
        id: s.id, client_id: projects.find(p => p.business_name === s.clientName)?.id ?? null,
        client_name: s.clientName === "Promotion" ? (s.brand || "Promotion") : s.clientName || "Internal",
        task_type: "shoot" as const,
        title: s.title || "Shoot", start_time: s.startTime, end_time: s.endTime,
        duration_hours: s.durationHours, notes: [s.clientName === "Promotion" && s.brand ? `Brand: ${s.brand}` : "", s.clientName === "Promotion" && s.shopName ? `Shop: ${s.shopName}` : "", s.location ? `Location: ${s.location}` : "", s.notes, s.travelHours > 0 ? `Travel: ${s.travelHours}h` : ""].filter(Boolean).join(" | "), video_uploaded: s.videoUploaded,
        screenshot_url: "", video_link: s.driveLink, editing_videos: [],
        _client_type: s.clientName, _brand: s.brand, _shop_name: s.shopName, _custom_client: s.customClient, _location: s.location, _travel_hours: s.travelHours, _camera_hours: s.cameraHours > 0 ? Math.max(0, s.durationHours - s.droneHours) : 0, _drone_hours: s.droneHours,
        participant_ids: [...new Set([...participantIds, ...s.participantIds])],
      })),
      ...edits.map(e => {
        const overlapH = calcOverlapHours(e.startTime, e.endTime, shoots)
        const validH = Math.max(0, e.timeTaken - overlapH)
        const finalVideoType = e.videoType === "__other__" ? (e.customVideoType || "Other") : e.videoType
        return {
          id: e.id, client_id: projects.find(p => p.business_name === e.clientName)?.id ?? null,
          client_name: e.clientName === "Promotion" ? (e.brand || "Promotion") : e.clientName || "Internal",
          task_type: "edit" as const,
          title: e.title || "Editing", start_time: e.startTime, end_time: e.endTime,
          duration_hours: validH || e.timeTaken, notes: overlapH > 0 ? `[overlap:${overlapH}h] ${e.notes}`.trim() : e.notes, video_uploaded: null,
          screenshot_url: "", video_link: e.videoLink, editing_videos: [],
          video_type: finalVideoType, video_duration: e.videoDuration,
          date_given: e.dateGiven, date_finished: e.dateFinished,
          drive_updated: e.driveUpdated, revisions: e.revisions, hooks_completed: e.hooksCompleted || 0,
          _client_type: e.clientName, _brand: e.brand, _custom_client: e.customClient, _overlap_hours: overlapH,
          participant_ids: [...new Set([...participantIds, ...e.participantIds])],
          is_rework: e.isRework || false, linked_to_title: e.linkedToTitle || null, linked_to_client: e.linkedToClient || null, linked_to_date: e.linkedToDate || null,
        }
      }),
      ...mediaBreaks.map(b => ({
        id: b.id, client_id: null, client_name: "Break", client_names: [], is_multi_client: false,
        task_type: "break" as const,
        title: b.label || "Break", start_time: b.startTime, end_time: b.endTime,
        duration_hours: b.durationHours, notes: undefined,
        video_uploaded: null, screenshot_url: "", video_link: "", editing_videos: [],
      })),
    ]
    const totalOverlapHours = edits.reduce((acc, e) => acc + calcOverlapHours(e.startTime, e.endTime, shoots), 0)
    const validEditHours = Math.max(0, totalEditHours - totalOverlapHours)
    const allMediaParticipantIds = [...new Set([
      ...participantIds,
      ...shoots.flatMap(s => s.participantIds),
      ...edits.flatMap(e => e.participantIds),
    ])]
    startTransition(async () => {
      const res = await submitDailyUpdate({
        active_tab: "media", date: selectedDate, work_entries, links: [],
        shoot_count: shoots.length, editing_count: edits.length,
        shoot_time_hours: totalShootHours, editing_time_hours: validEditHours,
        learning_hours: 0,
        participant_ids: allMediaParticipantIds,
      })
      if (!res.success) setError(res.error ?? "Submission failed.")
      else {
        if (isPastDate) {
          setSubmitted(true)
          setSuccessPopup("media")
          setShoots([]); setEdits([])
          router.refresh()
        } else {
          setSuccessPopup("media")
          setMediaDone(true); setEditMode(false); router.refresh()
        }
      }
    })
  }

  // ── Per-entry save (media) ────────────────────────────────────────────────
  function handleSaveEntry(entryId: string) {
    setError(null)
    const shootEntry = shoots.find(s => s.id === entryId)
    const editEntry  = edits.find(e => e.id === entryId)

    // ── Shoot validation ──────────────────────────────────────────────────
    if (shootEntry) {
      if (!shootEntry.clientName || shootEntry.clientName === "")
        return setEntryErrors(p => ({ ...p, [entryId]: "Select a client before saving." }))
      if (!shootEntry.title.trim())
        return setEntryErrors(p => ({ ...p, [entryId]: "Enter a shoot name before saving." }))
      if (!shootEntry.startTime || !shootEntry.endTime)
        return setEntryErrors(p => ({ ...p, [entryId]: "Set start and end time before saving." }))
      if (toMins(shootEntry.endTime) <= toMins(shootEntry.startTime))
        return setEntryErrors(p => ({ ...p, [entryId]: "End time must be after start time." }))
      // Overlap check against all other shoots and edits
      const otherShoots = shoots.filter(s => s.id !== entryId)
      for (const other of otherShoots) {
        if (timesOverlap(shootEntry.startTime, shootEntry.endTime, other.startTime, other.endTime))
          return setEntryErrors(p => ({ ...p, [entryId]: `Time overlaps with another shoot "${other.title || other.clientName}" (${other.startTime}–${other.endTime}). Fix times first.` }))
      }
      for (const other of edits) {
        if (timesOverlap(shootEntry.startTime, shootEntry.endTime, other.startTime, other.endTime))
          return setEntryErrors(p => ({ ...p, [entryId]: `Time overlaps with edit "${other.title || other.clientName}" (${other.startTime}–${other.endTime}). Fix times first.` }))
      }
    }

    // ── Edit validation ───────────────────────────────────────────────────
    if (editEntry) {
      if (!editEntry.clientName || editEntry.clientName === "")
        return setEntryErrors(p => ({ ...p, [entryId]: "Select a client before saving." }))
      if (!editEntry.title.trim())
        return setEntryErrors(p => ({ ...p, [entryId]: "Enter a video name before saving." }))
      if (!editEntry.videoType || editEntry.videoType === "")
        return setEntryErrors(p => ({ ...p, [entryId]: "Select a video type before saving." }))
      if (!editEntry.dateGiven)
        return setEntryErrors(p => ({ ...p, [entryId]: "Set the Date Given before saving." }))
      if (!editEntry.dateFinished)
        return setEntryErrors(p => ({ ...p, [entryId]: "Set the Date Finished before saving." }))
      if (!editEntry.startTime || !editEntry.endTime)
        return setEntryErrors(p => ({ ...p, [entryId]: "Set start and end time before saving." }))
      if (toMins(editEntry.endTime) <= toMins(editEntry.startTime))
        return setEntryErrors(p => ({ ...p, [entryId]: "End time must be after start time." }))
      if (!editEntry.videoDuration)
        return setEntryErrors(p => ({ ...p, [entryId]: "Select the video length (e.g. 30 sec, 1 min) before saving." }))
      if (!editEntry.videoLink?.trim())
        return setEntryErrors(p => ({ ...p, [entryId]: "Add the Drive / Video link before saving." }))
      if (editEntry.revisions === null || editEntry.revisions === undefined || isNaN(Number(editEntry.revisions)) || !Number.isInteger(Number(editEntry.revisions)) || Number(editEntry.revisions) < 0)
        return setEntryErrors(p => ({ ...p, [entryId]: "Revisions must be a whole number (0, 1, 2…)." }))
      if (editEntry.hooksCompleted === null || editEntry.hooksCompleted === undefined || isNaN(Number(editEntry.hooksCompleted)) || !Number.isInteger(Number(editEntry.hooksCompleted)) || Number(editEntry.hooksCompleted) < 0)
        return setEntryErrors(p => ({ ...p, [entryId]: "Hooks Completed must be a whole number (0, 1, 2, 3…)." }))
      // Overlap check against other edits only (shoot overlap is handled separately)
      const otherEdits = edits.filter(e => e.id !== entryId)
      for (const other of otherEdits) {
        if (timesOverlap(editEntry.startTime, editEntry.endTime, other.startTime, other.endTime))
          return setEntryErrors(p => ({ ...p, [entryId]: `Time overlaps with edit "${other.title || other.clientName}" (${other.startTime}–${other.endTime}). Fix times first.` }))
      }
    }

    setEntryErrors(p => { const n = { ...p }; delete n[entryId]; return n })
    const work_entries = [
      ...shoots.map(s => ({
        id: s.id, client_id: projects.find(p => p.business_name === s.clientName)?.id ?? null,
        client_name: s.clientName === "Promotion" ? (s.brand || "Promotion") : s.clientName || "Internal",
        task_type: "shoot" as const,
        title: s.title || "Shoot", start_time: s.startTime, end_time: s.endTime,
        duration_hours: s.durationHours, notes: [s.clientName === "Promotion" && s.brand ? `Brand: ${s.brand}` : "", s.clientName === "Promotion" && s.shopName ? `Shop: ${s.shopName}` : "", s.location ? `Location: ${s.location}` : "", s.notes, s.travelHours > 0 ? `Travel: ${s.travelHours}h` : ""].filter(Boolean).join(" | "), video_uploaded: s.videoUploaded,
        screenshot_url: "", video_link: s.driveLink, editing_videos: [],
        _client_type: s.clientName, _brand: s.brand, _shop_name: s.shopName, _custom_client: s.customClient, _location: s.location, _travel_hours: s.travelHours, _camera_hours: s.cameraHours > 0 ? Math.max(0, s.durationHours - s.droneHours) : 0, _drone_hours: s.droneHours,
        participant_ids: [...new Set([...participantIds, ...s.participantIds])],
      })),
      ...edits.map(e => {
        const overlapH = calcOverlapHours(e.startTime, e.endTime, shoots)
        const validH = Math.max(0, e.timeTaken - overlapH)
        const finalVideoType = e.videoType === "__other__" ? (e.customVideoType || "Other") : e.videoType
        return {
          id: e.id, client_id: projects.find(p => p.business_name === e.clientName)?.id ?? null,
          client_name: e.clientName === "Promotion" ? (e.brand || "Promotion") : e.clientName || "Internal",
          task_type: "edit" as const,
          title: e.title || "Editing", start_time: e.startTime, end_time: e.endTime,
          duration_hours: validH || e.timeTaken, notes: overlapH > 0 ? `[overlap:${overlapH}h] ${e.notes}`.trim() : e.notes, video_uploaded: null,
          screenshot_url: "", video_link: e.videoLink, editing_videos: [],
          video_type: finalVideoType, video_duration: e.videoDuration,
          date_given: e.dateGiven, date_finished: e.dateFinished,
          drive_updated: e.driveUpdated, revisions: e.revisions, hooks_completed: e.hooksCompleted || 0,
          _client_type: e.clientName, _brand: e.brand, _custom_client: e.customClient, _overlap_hours: overlapH,
          participant_ids: [...new Set([...participantIds, ...e.participantIds])],
          is_rework: e.isRework || false, linked_to_title: e.linkedToTitle || null, linked_to_client: e.linkedToClient || null, linked_to_date: e.linkedToDate || null,
        }
      }),
    ]
    const saveOverlapHours = edits.reduce((acc, e) => acc + calcOverlapHours(e.startTime, e.endTime, shoots), 0)
    const saveValidEditHours = Math.max(0, totalEditHours - saveOverlapHours)
    const saveMediaParticipantIds = [...new Set([
      ...participantIds,
      ...shoots.flatMap(s => s.participantIds),
      ...edits.flatMap(e => e.participantIds),
    ])]
    startTransition(async () => {
      const res = await submitDailyUpdate({
        active_tab: "media", date: selectedDate, work_entries, links: [],
        shoot_count: shoots.length, editing_count: edits.length,
        shoot_time_hours: totalShootHours, editing_time_hours: saveValidEditHours,
        learning_hours: 0,
        participant_ids: saveMediaParticipantIds,
      })
      if (!res.success) setError(res.error ?? "Save failed.")
      else setSavedIds(prev => new Set([...prev, entryId]))
    })
  }

  // ── Submit: learning ─────────────────────────────────────────────────────
  function handleLearningSubmit() {
    setLearningError(null)
    for (let i = 0; i < learningBlocks.length; i++) {
      const b = learningBlocks[i]
      const hasAny = b.client.trim() || b.topic.trim() || calcLearningHours(b.from, b.to) > 0
      if (!hasAny) continue
      const label = learningBlocks.length > 1 ? `Learning ${i + 1}: ` : ""
      if (!b.client.trim()) { setLearningError(`${label}Select a client.`); return }
      if (!b.topic.trim()) { setLearningError(`${label}Enter what you learned (Topic / Course).`); return }
      if (!b.from || !b.to || calcLearningHours(b.from, b.to) <= 0) { setLearningError(`${label}Set a valid From and To time.`); return }
    }
    // Other (Meeting/Teaching/Misc) mandatory: client, title, start/end time
    for (let i = 0; i < others.length; i++) {
      const o = others[i]
      const label = others.length > 1 ? `Other ${i + 1}: ` : "Other: "
      if (!o.clientName) { setLearningError(`${label}Select a client.`); return }
      if (!o.title.trim()) { setLearningError(`${label}Enter a title.`); return }
      if (!o.startTime) { setLearningError(`${label}Enter start time.`); return }
      if (!o.endTime)   { setLearningError(`${label}Enter end time.`); return }
      if (toMins(o.endTime) <= toMins(o.startTime)) { setLearningError(`${label}End time must be after start time.`); return }
    }
    if (filledLearningBlocks.length === 0 && others.length === 0) {
      setLearningError("Add at least one learning block or other activity."); return
    }
    startTransition(async () => {
      const res = await submitDailyUpdate({
        active_tab: "learning", date: selectedDate, links: [],
        shoot_count: 0, editing_count: 0,
        shoot_time_hours: 0, editing_time_hours: 0,
        learning_hours: 0,
        participant_ids: [...new Set([...learningParticipantIds, ...others.flatMap(o => o.participantIds)])],
        work_entries: [
          ...filledLearningBlocks.map(b => ({
            id: b.id,
            client_id: null,
            client_name: b.client,
            client_names: [],
            is_multi_client: false,
            task_type: "learning" as const,
            title: `[${b.client}] ${b.topic.trim()}`,
            start_time: b.from || "",
            end_time:   b.to   || "",
            duration_hours: calcLearningHours(b.from, b.to),
            notes: b.notes || "",
            editing_videos: [],
          })),
          ...others.map(o => ({
            id: o.id,
            client_id: projects.find(p => p.business_name === o.clientName)?.id ?? null,
            client_name: o.clientName || "Internal",
            client_names: [] as string[],
            is_multi_client: false,
            task_type: "other_activity" as const,
            title: o.title || o.otherType, start_time: o.startTime, end_time: o.endTime,
            duration_hours: calcDuration(o.startTime, o.endTime) || o.timeTaken,
            notes: o.notes || undefined,
            _other_type: o.otherType,
            _client_type: o.clientName, _custom_client: o.customClient,
            participant_ids: o.participantIds,
            editing_videos: [],
          })),
        ],
      })
      if (!res.success) setLearningError(res.error ?? "Submission failed.")
      else { setSuccessPopup("learning"); setLearningDone(true); setEditMode(false); router.refresh() }
    })
  }

  function handleBreakSubmit() {
    setError(null)
    const breaks = isMediaTeam ? mediaBreaks : nonMediaBreaks
    if (breaks.length === 0) { setError("Add at least one break."); return }
    for (let i = 0; i < breaks.length; i++) {
      const b = breaks[i]
      const label = breaks.length > 1 ? `Break ${i + 1}: ` : ""
      if (!b.startTime || !b.endTime) { setError(`${label}Set start and end time.`); return }
      if (b.durationHours <= 0) { setError(`${label}End time must be after start time.`); return }
    }
    const breakEntries = breaks.map(b => ({
      id: b.id, client_id: null, client_name: "Break", client_names: [], is_multi_client: false,
      task_type: "break" as const,
      title: b.label === "__other__" ? (b.customLabel || "Break") : (b.label || "Break"), start_time: b.startTime, end_time: b.endTime,
      duration_hours: b.durationHours, notes: undefined,
      video_uploaded: null, screenshot_url: "", video_link: "", editing_videos: [],
    }))

    // For non-media team: also include filled working entries so they're not lost
    // when the user submits from the Break tab without having submitted Working first
    const workingEntries = !isMediaTeam
      ? filledBlocks.map(t => {
          const effClient = t.projectName === "Promotion" ? (t.brand || "Our Brand")
            : (t.projectName || "Internal")
          return {
            id: t.id,
            client_id: projects.find(p => p.business_name === (t.clientNames[0] || effClient))?.id ?? null,
            client_name: t.clientNames.length > 0 ? t.clientNames[0] : effClient,
            client_names: t.clientNames.length > 0 ? t.clientNames : (effClient !== "Internal" ? [effClient] : []),
            is_multi_client: t.clientNames.length > 1,
            task_type: "other" as const,
            title: t.description, start_time: t.startTime, end_time: t.endTime,
            duration_hours: t.durationHours, notes: `[${t.status}]`,
            participant_ids: t.participantIds ?? [],
            video_uploaded: null, screenshot_url: "", video_link: "", editing_videos: [],
          }
        })
      : []
    const allParticipantIds = !isMediaTeam ? [...new Set(filledBlocks.flatMap(b => b.participantIds))] : []
    const work_entries = [...workingEntries, ...breakEntries]

    // Overlap check: break + working entries vs saved + each other + leave windows
    {
      const existingEntries = activeUpdate ? (activeUpdate.work_entries as Record<string,unknown>[] | null) ?? [] : []
      const newEntries: OverlapEntry[] = [
        ...breakEntries
          .filter(b => b.start_time && b.end_time)
          .map(b => ({ id: b.id, start: b.start_time as string, end: b.end_time as string, title: b.title as string || 'Break' })),
        ...(!isMediaTeam
          ? workingEntries
              .filter(w => w.start_time && w.end_time)
              .map(w => ({ id: w.id, start: w.start_time as string, end: w.end_time as string, title: w.title as string || 'Work' }))
          : []),
      ]
      const overlapErr = findOverlapError(newEntries, existingEntries, activeLeavesList, selectedDate, collabWindows)
      if (overlapErr) { setError(overlapErr); return }
    }

    setBreakSubmitting(true)
    ;(async () => {
      try {
        const res = await submitDailyUpdate({
          active_tab: "break", date: selectedDate, work_entries, links: [],
          shoot_count: 0, editing_count: 0,
          shoot_time_hours: 0, editing_time_hours: 0, learning_hours: 0,
          participant_ids: allParticipantIds,
        })
        if (!res.success) setError(res.error ?? "Submission failed.")
        else { setSuccessPopup("break"); if (isMediaTeam) { setBreaksDone(true); setEditMode(false) } else setWorkingDone(true); router.refresh() }
      } finally {
        setBreakSubmitting(false)
      }
    })()
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
  // Media team: all three tabs (media + learning + break) must be submitted.
  // Non-media: working is enough; learning is optional.
  // Past dates always show the form (never the "done" screen) — user adds new entries, History handles editing
  const allDone = !isPastDate && (isMediaTeam ? (mediaDone && learningDone && (isFreelancerLayout ? true : breaksDone)) : workingDone)

  // Past 14 days with no submission and no approved leave — shown in the submitted screen
  const unsubmittedDates = useMemo(() => {
    const done = new Set([...pastUpdates.map(u => u.date), ...approvedLeaveDates, todayStr])
    const dates: string[] = []
    for (let i = 1; i <= 14; i++) {
      const d = new Date()
      d.setDate(d.getDate() - i)
      const ds = d.toISOString().split("T")[0]
      if (!done.has(ds)) dates.push(ds)
    }
    return dates
  }, [pastUpdates, approvedLeaveDates, todayStr]) // eslint-disable-line react-hooks/exhaustive-deps
  if (allDone && !editMode) {
    const submittedEntries = Array.isArray((activeUpdate ?? existingUpdateRef.current ?? {})?.work_entries)
      ? ((activeUpdate ?? existingUpdateRef.current ?? {})?.work_entries as Record<string,unknown>[])
      : []
    const subActUpd0  = (activeUpdate ?? existingUpdateRef.current) as Record<string,unknown> | null
    const rawSubmittedH = submittedEntries.length > 0
      ? submittedEntries.filter(e => e.task_type !== "break").reduce((s, e) => s + (Number(e.duration_hours) || 0), 0)
      : 0
    // Always prefer server-computed working_hours (interval-merge, overlap-safe) over simple sum
    const totalSubmittedH = Number(subActUpd0?.working_hours) || rawSubmittedH || 0

    // Media team stats from work_entries — fall back to summary columns when work_entries is empty
    const subShoots   = submittedEntries.filter(e => e.task_type === "shoot")
    const subEdits    = submittedEntries.filter(e => e.task_type === "edit")
    const subActUpd   = subActUpd0
    const subShootLen = subShoots.length || Number(subActUpd?.shoot_count) || 0
    const subEditLen  = subEdits.length  || Number(subActUpd?.editing_count) || 0
    const subShootH   = subShoots.length > 0
      ? subShoots.reduce((s, e) => s + (Number(e.duration_hours) || 0), 0)
      : (Number(subActUpd?.shoot_time_hours) || 0)
    const subEditH    = subEdits.length > 0
      ? subEdits.reduce((s, e) => s + (Number(e.duration_hours) || 0), 0)
      : (Number(subActUpd?.editing_time_hours) || 0)
    const subTravelH  = subShoots.reduce((s, e) => s + (Number((e as Record<string,unknown>)._travel_hours) || 0), 0)

    return (
      <div style={{ background:"#F5F6FA", minHeight:"100vh", padding:"24px 16px" }}>
        {successPopup && (
          <div onClick={() => setSuccessPopup(null)} style={{ position:"fixed", inset:0, zIndex:9999, display:"flex", alignItems:"center", justifyContent:"center", background:"rgba(0,0,0,0.45)", backdropFilter:"blur(6px)", WebkitBackdropFilter:"blur(6px)" }}>
            <div onClick={e => e.stopPropagation()} style={{ background:"#fff", borderRadius:24, padding:"36px 40px", textAlign:"center", boxShadow:"0 24px 80px rgba(0,0,0,0.2)", maxWidth:320, width:"calc(100% - 48px)", animation:"gf-pop 0.3s cubic-bezier(0.34,1.56,0.64,1)" }}>
              <style>{`@keyframes gf-pop{from{opacity:0;transform:scale(0.7)}to{opacity:1;transform:scale(1)}}`}</style>
              <div style={{ width:72, height:72, borderRadius:"50%", background:"linear-gradient(135deg,#22C55E,#16A34A)", display:"flex", alignItems:"center", justifyContent:"center", margin:"0 auto 18px", boxShadow:"0 8px 24px rgba(34,197,94,0.4)" }}>
                <CheckCircle2 size={36} color="#fff" strokeWidth={2.5} />
              </div>
              <p style={{ fontSize:20, fontWeight:900, color:"#111827", margin:"0 0 6px", fontFamily:"var(--font-jakarta)" }}>Successfully Submitted!</p>
              <p style={{ fontSize:13, color:"#6B7280", margin:"0 0 22px", lineHeight:1.5 }}>
                {successPopup === "working" ? "Work log saved ✓" : successPopup === "media" ? "Shoots & edits saved ✓" : successPopup === "learning" ? "Learning block saved ✓" : "Break saved ✓"}
              </p>
              <button onClick={() => setSuccessPopup(null)} style={{ background:"linear-gradient(135deg,#22C55E,#16A34A)", color:"#fff", border:"none", borderRadius:12, padding:"10px 28px", fontSize:13, fontWeight:700, cursor:"pointer", boxShadow:"0 4px 14px rgba(34,197,94,0.35)" }}>Done</button>
            </div>
          </div>
        )}
        {/* Date selector strip */}
        <div style={{ background:"#FFFFFF", borderRadius:14, border: isPastDate ? "1.5px solid #F59E0B" : "1px solid #EBEDF2", padding:"10px 16px", display:"flex", alignItems:"center", gap:12, marginBottom:16, flexWrap:"wrap" }}>
          <div style={{ display:"flex", alignItems:"center", gap:8, flex:1, minWidth:200 }}>
            <Calendar size={15} style={{ color: isPastDate ? "#D97706" : "#DE1A1A" }} />
            <p style={{ fontSize:13, fontWeight:800, color: isPastDate ? "#D97706" : "#111827", margin:0 }}>{dateLabel}</p>
          </div>
          <div style={{ display:"flex", alignItems:"center", gap:8 }}>
            {isPastDate && <button onClick={() => handleDateChange(todayStr)} style={{ fontSize:11, fontWeight:700, padding:"5px 12px", borderRadius:8, border:"1.5px solid #DE1A1A", background:"rgba(222,26,26,0.06)", color:"#DE1A1A", cursor:"pointer" }}>Back to Today</button>}
            <label style={{ fontSize:11, fontWeight:700, color:"#6B7280", display:"flex", alignItems:"center", gap:6, cursor:"pointer" }}>
              <span style={{ whiteSpace:"nowrap" }}>{isPastDate ? "Change date" : "Pick past date"}</span>
              <input type="date" value={selectedDate} max={todayStr} min={(() => { const d = new Date(); d.setDate(d.getDate() - 30); return d.toISOString().split("T")[0] })()} onChange={e => e.target.value && handleDateChange(e.target.value)} style={{ fontSize:12, fontWeight:600, color:"#374151", background:"#F9FAFB", border:"1.5px solid #EBEDF2", borderRadius:8, padding:"5px 8px", cursor:"pointer", outline:"none" }} />
            </label>
          </div>
        </div>

        <div style={{ maxWidth:600, margin:"0 auto" }}>
          {/* Header */}
          <div style={{ textAlign:"center", marginBottom:20 }}>
            <CheckCircle2 size={44} style={{ color:"#22C55E", marginBottom:10 }} />
            <p style={{ fontSize:18, fontWeight:900, color:"#111111", margin:"0 0 4px", fontFamily:"var(--font-jakarta)" }}>
              {isToday ? "Today's Update Submitted!" : `${dateLabel.split(",")[0]}'s Update`}
            </p>
            <p style={{ fontSize:12, color:"#6B7280", margin:0 }}>
              {totalSubmittedH > 0
                ? submittedEntries.length > 0
                  ? `${totalSubmittedH.toFixed(1)}h logged · ${submittedEntries.filter(e => e.task_type !== "break").length} entries`
                  : `${totalSubmittedH.toFixed(1)}h logged`
                : "No entries logged"}
            </p>
          </div>

          {/* Media team stats tiles */}
          {isMediaTeam && (subShootLen > 0 || subEditLen > 0) && (
            <div style={{ display:"grid", gridTemplateColumns:"repeat(4,1fr)", gap:8, marginBottom:14 }}>
              {[
                { label:"SHOOTS",       value:`${subShootLen}`,              icon:"📸", color:"#DE1A1A", bg:"rgba(222,26,26,0.07)" },
                { label:"HRS SHOOTING", value:`${subShootH}h`,               icon:"🎥", color:"#EF4444", bg:"rgba(239,68,68,0.07)" },
                { label:"TRAVEL HRS",   value:`${subTravelH > 0 ? subTravelH.toFixed(1) : "0"}`, icon:"🚗", color:"#F59E0B", bg:"rgba(245,158,11,0.07)" },
                { label:"EDITED",       value:`${subEditLen}`,               icon:"🎬", color:"#6366F1", bg:"rgba(99,102,241,0.07)" },
              ].map(s => (
                <div key={s.label} style={{ background:"#FFFFFF", borderRadius:12, padding:"10px 10px 8px", border:"1px solid #EBEDF2", textAlign:"center" }}>
                  <span style={{ fontSize:18 }}>{s.icon}</span>
                  <p style={{ fontSize:16, fontWeight:900, color:s.color, margin:"4px 0 2px" }}>{s.value}</p>
                  <p style={{ fontSize:9, fontWeight:700, color:"#9CA3AF", margin:0, letterSpacing:"0.06em" }}>{s.label}</p>
                </div>
              ))}
            </div>
          )}
          {isMediaTeam && subEditLen > 0 && (
            <div style={{ background:"#FFFFFF", borderRadius:12, border:"1px solid #EBEDF2", padding:"10px 14px", marginBottom:14, display:"flex", alignItems:"center", justifyContent:"space-between" }}>
              <span style={{ fontSize:11, color:"#6B7280", fontWeight:700 }}>Edit Hours</span>
              <span style={{ fontSize:13, fontWeight:900, color:"#6366F1" }}>{subEditH.toFixed(1)}h</span>
              <span style={{ fontSize:11, color:"#6B7280", fontWeight:700 }}>Total Hours</span>
              <span style={{ fontSize:13, fontWeight:900, color: totalSubmittedH >= 8 ? "#22C55E" : "#111111" }}>{totalSubmittedH.toFixed(1)}h</span>
            </div>
          )}

          {/* Entries list */}
          {submittedEntries.length > 0 && (
            <div style={{ background:"#FFFFFF", borderRadius:16, border:"1px solid #EBEDF2", overflow:"hidden", marginBottom:14, boxShadow:"0 2px 10px rgba(0,0,0,0.05)" }}>
              <div style={{ padding:"12px 16px", borderBottom:"1px solid #F0F1F5", display:"flex", alignItems:"center", gap:7 }}>
                <BarChart2 size={13} style={{ color:"#DE1A1A" }} />
                <span style={{ fontSize:12, fontWeight:800, color:"#111111" }}>Entries for {dateLabel}</span>
              </div>
              {submittedEntries.map((e, i) => {
                const type = e.task_type as string
                const typeColor = type === "shoot" ? "#EF4444" : type === "edit" ? "#6366F1" : type === "voiceover" ? "#8B5CF6" : type === "poster" ? "#EC4899" : type === "break" ? "#78716C" : type === "learning" ? "#10B981" : "#6366F1"
                const typeIcon = type === "shoot" ? "📷" : type === "edit" ? "✂️" : type === "voiceover" ? "🎙️" : type === "poster" ? "🖼️" : type === "break" ? "☕" : type === "learning" ? "📚" : "⏰"
                const hrs = Number(e.duration_hours) || 0
                return (
                  <div key={i} style={{ display:"flex", alignItems:"center", gap:12, padding:"10px 16px", borderBottom: i < submittedEntries.length - 1 ? "1px solid #F5F6FA" : "none" }}>
                    <span style={{ fontSize:16 }}>{typeIcon}</span>
                    <div style={{ flex:1, minWidth:0 }}>
                      <p style={{ fontSize:12, fontWeight:700, color:"#111827", margin:0, overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap" }}>{String(e.title || "Entry")}</p>
                      <p style={{ fontSize:10, color:"#9CA3AF", margin:0 }}>{String(e.client_name || "")}</p>
                    </div>
                    <span style={{ fontSize:10, fontWeight:700, padding:"2px 8px", borderRadius:99, background:`${typeColor}18`, color:typeColor, flexShrink:0 }}>{type}</span>
                    <span style={{ fontSize:11, fontWeight:800, color:"#374151", flexShrink:0 }}>{hrs > 0 ? `${hrs}h` : "—"}</span>
                  </div>
                )
              })}
            </div>
          )}

          {/* Missed dates — only show dates with no submission at all */}
          {unsubmittedDates.length > 0 && (
            <div style={{ background:"#FFF7ED", borderRadius:14, border:"1.5px solid #FED7AA", padding:"14px 16px", marginBottom:14 }}>
              <p style={{ fontSize:11, fontWeight:800, color:"#D97706", margin:"0 0 10px", textTransform:"uppercase", letterSpacing:"0.06em" }}>
                ⚠️ Missed Updates
              </p>
              <div style={{ display:"flex", flexDirection:"column", gap:6 }}>
                {unsubmittedDates.slice(0, 5).map(date => {
                  const lbl = new Date(date + "T12:00:00").toLocaleDateString("en-US", { weekday:"short", day:"numeric", month:"short" })
                  return (
                    <button key={date} onClick={() => handleDateChange(date)}
                      style={{ display:"flex", alignItems:"center", justifyContent:"space-between", padding:"9px 12px", borderRadius:10, border:"1px solid #FED7AA", background:"#FFFFFF", cursor:"pointer" }}>
                      <span style={{ fontSize:12, fontWeight:700, color:"#374151" }}>{lbl}</span>
                      <span style={{ fontSize:11, fontWeight:700, color:"#D97706" }}>Submit →</span>
                    </button>
                  )
                })}
              </div>
            </div>
          )}

          {/* Action buttons */}
          <div style={{ display:"flex", flexDirection:"column", gap:10 }}>
            <button onClick={() => {
              const cur = activeUpdate ?? existingUpdateRef.current ?? {}
              setTimeBlocks(parseExistingBlocks(cur))
              setShoots(parseExistingShoots(cur))
              setEdits(parseExistingEdits(cur))
              setMediaBreaks(parseExistingMediaBreaks(cur))
              setEditMode(true)
              setSubmitted(false)
              if (!isMediaTeam) { setWorkingDone(false); setLearningDone(false) }
              else { setMediaDone(false) }
            }}
              style={{ display:"flex", alignItems:"center", justifyContent:"center", gap:8, padding:"11px 24px", borderRadius:12, border:"1.5px solid #DE1A1A", background:"#FFFFFF", color:"#DE1A1A", fontSize:13, fontWeight:700, cursor:"pointer" }}>
              Edit {isToday ? "Today's" : dateLabel.split(",")[0] + "'s"} Update
            </button>

            {/* Non-media: Add Learning as optional step from submitted screen */}
            {!isMediaTeam && !learningDone && (
              <button onClick={() => { setTab("learning"); setEditMode(true) }}
                style={{ display:"flex", alignItems:"center", justifyContent:"center", gap:8, padding:"11px 24px", borderRadius:12, border:"1.5px solid #10B981", background:"rgba(16,185,129,0.06)", color:"#059669", fontSize:13, fontWeight:700, cursor:"pointer" }}>
                📚 Also Submit Learning
              </button>
            )}
            {!isMediaTeam && learningDone && (
              <div style={{ display:"flex", alignItems:"center", justifyContent:"center", gap:6, padding:"11px 24px", borderRadius:12, border:"1px solid rgba(34,197,94,0.3)", background:"rgba(34,197,94,0.05)", color:"#16A34A", fontSize:13, fontWeight:700 }}>
                <CheckCircle2 size={14} /> Learning Submitted ✓
              </div>
            )}

            <button onClick={() => {
              setTimeBlocks([])
              setShoots([])
              setEdits([])
              setMediaBreaks([])
              setVoiceovers([])
              setPosters([])
              setEditMode(true)
              setSubmitted(false)
              if (!isMediaTeam) { setWorkingDone(false); setLearningDone(false) }
              else { setMediaDone(false) }
            }}
              style={{ display:"flex", alignItems:"center", justifyContent:"center", gap:8, padding:"11px 24px", borderRadius:12, border:"1.5px solid #E5E7EB", background:"#F9FAFB", color:"#374151", fontSize:13, fontWeight:700, cursor:"pointer" }}>
              ➕ Add Another Update
            </button>
          </div>
        </div>
      </div>
    )
  }

  // day progress ring
  const workStart = 9, workEnd = 17.5, totalWorkHours = 8.5
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
    ? isFreelancerLayout
      ? ALL_TABS.filter(t => t.id === "media" || t.id === "learning")
      : ALL_TABS.filter(t => t.id === "media" || t.id === "learning" || t.id === "break")
    : ALL_TABS.filter(t => t.id === "working" || t.id === "learning" || t.id === "break")

  return (
    <div className="p-4 md:p-6" style={{ background:"#F5F6FA", minHeight:"100vh" }}>
      {toastEl}

      {/* ── HEADER ────────────────────────────────────────────────────────── */}
      <div className="flex flex-wrap items-center justify-between" style={{ background:"linear-gradient(135deg, #DE1A1A 0%, #8B1212 55%, #1A0808 100%)", borderRadius:20, padding:"16px 18px", gap:14, boxShadow:"0 8px 32px rgba(180,0,0,0.35)", position:"relative", overflow:"hidden", marginBottom:20 }}>
        <div style={{ position:"absolute", top:-50, right:-30, width:200, height:200, borderRadius:"50%", background:"rgba(255,255,255,0.05)", pointerEvents:"none" }} />
        <div style={{ position:"absolute", bottom:-40, left:60, width:150, height:150, borderRadius:"50%", background:"rgba(255,255,255,0.04)", pointerEvents:"none" }} />

        {/* Mobile: two explicit full-width rows (title+ring, then greeting+calendar) so items can't get pulled into the wrong row.
            md:contents dissolves these wrapper divs so children become direct flex items again, restoring the original single-row desktop layout. */}
        <div className="flex items-start justify-between w-full md:contents">
          <div style={{ flexShrink:0, position:"relative", zIndex:1 }}>
            <span style={{ display:"inline-flex", alignItems:"center", gap:6, fontSize:11, fontWeight:700, padding:"4px 12px", borderRadius:99, background:"rgba(255,255,255,0.15)", color:"#fff", marginBottom:10, border:"1px solid rgba(255,255,255,0.2)", letterSpacing:"0.04em" }}>
              ⭐ Daily Update
            </span>
            <h1 style={{ fontSize:26, fontWeight:900, color:"#fff", fontFamily:"var(--font-jakarta)", margin:"0 0 3px" }}>Daily Update</h1>
            <p style={{ fontSize:11, color:"rgba(255,255,255,0.65)", margin:0 }}>{dateLabel}</p>
          </div>

          <div className="md:order-4" style={{ display:"flex", flexDirection:"column", alignItems:"center", gap:6, flexShrink:0, position:"relative", zIndex:1 }}>
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

        <div className="flex items-center justify-between w-full gap-3 mt-3 md:mt-0 md:contents">
          <div className="flex min-w-0 md:order-2" style={{ alignItems:"center", borderRadius:16, overflow:"hidden", background:"rgba(255,255,255,0.12)", border:"1px solid rgba(255,255,255,0.2)", flex:1, maxWidth:340, position:"relative", zIndex:1 }}>
            <div style={{ position:"relative", width:70, height:80, flexShrink:0 }}>
              <Image src="/brand/assistant-girl.jpg" alt="" fill style={{ objectFit:"cover", objectPosition:"top center" }} />
            </div>
            <div style={{ padding:"10px 16px", minWidth:0 }}>
              <p style={{ fontSize:13, fontWeight:800, color:"#fff", margin:"0 0 3px", fontFamily:"var(--font-jakarta)" }}>{greeting}, {firstName}! 👋</p>
              <p style={{ fontSize:11, color:"rgba(255,255,255,0.7)", margin:0 }}>What did you work on today?</p>
            </div>
          </div>

          <div className="md:order-3" style={{ background:"rgba(255,255,255,0.12)", border:"1px solid rgba(255,255,255,0.2)", borderRadius:16, padding:"12px 18px", textAlign:"center", flexShrink:0, position:"relative", zIndex:1 }}>
            <p style={{ fontSize:10, color:"rgba(255,255,255,0.6)", margin:"0 0 4px", fontWeight:600, textTransform:"uppercase", letterSpacing:"0.08em" }}>{calMonth}</p>
            <p style={{ fontSize:32, fontWeight:900, color:"#fff", margin:"0 0 2px", lineHeight:1, fontFamily:"var(--font-jakarta)" }}>{calDay}</p>
            <p style={{ fontSize:10, color:"rgba(255,255,255,0.7)", margin:0, fontWeight:600 }}>{calWeekday}</p>
          </div>
        </div>
      </div>


      {/* ── 4A: Clock-in required block ── */}
      {requiresClockIn && !todayClockedIn && (
        <div style={{ background:"rgba(239,68,68,0.06)", border:"1.5px solid rgba(239,68,68,0.25)", borderRadius:14, padding:"16px 18px", marginBottom:16, display:"flex", alignItems:"flex-start", gap:12 }}>
          <div style={{ width:36, height:36, borderRadius:10, background:"rgba(239,68,68,0.12)", display:"flex", alignItems:"center", justifyContent:"center", flexShrink:0, marginTop:2 }}>
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#DC2626" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>
          </div>
          <div>
            <p style={{ fontSize:14, fontWeight:800, color:"#DC2626", margin:"0 0 4px", fontFamily:"var(--font-jakarta)" }}>Clock In Required</p>
            <p style={{ fontSize:12, color:"#6B7280", margin:"0 0 10px" }}>
              You must clock in on the Attendance page before submitting today&apos;s work log.
            </p>
            <a href="/member/attendance" style={{ fontSize:12, fontWeight:700, color:"#DC2626", textDecoration:"underline", textUnderlineOffset:2 }}>
              Go to Attendance →
            </a>
          </div>
        </div>
      )}

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

      {/* ── SUCCESS POPUP (all dates, all tabs) ─────────────────────────── */}
      {successPopup && (
        <div onClick={() => setSuccessPopup(null)} style={{ position:"fixed", inset:0, zIndex:9999, display:"flex", alignItems:"center", justifyContent:"center", background:"rgba(0,0,0,0.45)", backdropFilter:"blur(6px)", WebkitBackdropFilter:"blur(6px)" }}>
          <div onClick={e => e.stopPropagation()} style={{ background:"#fff", borderRadius:24, padding:"36px 40px", textAlign:"center", boxShadow:"0 24px 80px rgba(0,0,0,0.2)", maxWidth:320, width:"calc(100% - 48px)", animation:"gf-pop 0.3s cubic-bezier(0.34,1.56,0.64,1)" }}>
            <style>{`@keyframes gf-pop{from{opacity:0;transform:scale(0.7)}to{opacity:1;transform:scale(1)}}`}</style>
            <div style={{ width:72, height:72, borderRadius:"50%", background:"linear-gradient(135deg,#22C55E,#16A34A)", display:"flex", alignItems:"center", justifyContent:"center", margin:"0 auto 18px", boxShadow:"0 8px 24px rgba(34,197,94,0.4)" }}>
              <CheckCircle2 size={36} color="#fff" strokeWidth={2.5} />
            </div>
            <p style={{ fontSize:20, fontWeight:900, color:"#111827", margin:"0 0 6px", fontFamily:"var(--font-jakarta)" }}>Successfully Submitted!</p>
            <p style={{ fontSize:13, color:"#6B7280", margin:"0 0 22px", lineHeight:1.5 }}>
              {successPopup === "working" ? "Work log saved ✓" : successPopup === "media" ? "Shoots & edits saved ✓" : successPopup === "learning" ? "Learning block saved ✓" : "Break saved ✓"}
            </p>
            <button onClick={() => setSuccessPopup(null)} style={{ background:"linear-gradient(135deg,#22C55E,#16A34A)", color:"#fff", border:"none", borderRadius:12, padding:"10px 28px", fontSize:13, fontWeight:700, cursor:"pointer", boxShadow:"0 4px 14px rgba(34,197,94,0.35)" }}>Done</button>
          </div>
        </div>
      )}

      {/* ── PAST DATE SUCCESS BANNER ─────────────────────────────────────── */}
      {isPastDate && submitted && (
        <div style={{ background:"#F0FDF4", border:"1.5px solid #22C55E", borderRadius:12, padding:"12px 16px", display:"flex", alignItems:"center", justifyContent:"space-between", gap:12, marginBottom:16 }}>
          <div style={{ display:"flex", alignItems:"center", gap:8 }}>
            <CheckCircle2 size={18} style={{ color:"#22C55E", flexShrink:0 }} />
            <p style={{ fontSize:13, fontWeight:700, color:"#15803D", margin:0 }}>Entry added to {dateLabel}! Add another entry below or go to History to edit.</p>
          </div>
          <button onClick={() => setSubmitted(false)} style={{ fontSize:18, lineHeight:1, color:"#15803D", background:"none", border:"none", cursor:"pointer", padding:"0 4px" }}>×</button>
        </div>
      )}

      {/* ── TABS (all teams) ─────────────────────────────────────────────── */}
      <div className="flex md:grid" style={{ gridTemplateColumns:`repeat(${TABS.length},1fr)`, gap:8, marginBottom:20, overflowX:"auto", WebkitOverflowScrolling:"touch" as const, paddingBottom:2 }}>
        {TABS.map(t => {
          const isDone = t.id === "working" ? workingDone : t.id === "learning" ? learningDone : t.id === "media" ? mediaDone : t.id === "break" ? breaksDone : false
          return (
            <button key={t.id} onClick={() => { setTab(t.id); setError(null) }}
              style={{ display:"flex", flexDirection:"column", alignItems:"flex-start", padding:"12px 20px", borderRadius:14, cursor:"pointer", transition:"all 0.18s", flexShrink:0, whiteSpace:"nowrap",
                background: tab === t.id ? "#DE1A1A" : isDone ? "rgba(34,197,94,0.07)" : "#FFFFFF",
                color:      tab === t.id ? "#fff"    : isDone ? "#16A34A" : "#6B7280",
                boxShadow:  tab === t.id ? "0 4px 18px rgba(222,26,26,0.4)" : "0 1px 4px rgba(0,0,0,0.06)",
                border:     tab === t.id ? "none" : isDone ? "1px solid rgba(34,197,94,0.25)" : "1px solid #EBEDF2",
              }}>
              <span style={{ fontSize:14, fontWeight:800 }}>{t.label}{isDone && tab !== t.id ? " ✓" : ""}</span>
              <span style={{ fontSize:10, opacity:0.7, marginTop:2 }}>{isDone && tab !== t.id ? "Submitted" : t.desc}</span>
            </button>
          )
        })}
      </div>

      {/* ── MAIN GRID ─────────────────────────────────────────────────────── */}
      <div className="grid grid-cols-1 lg:grid-cols-[1fr_280px] gap-[18px] items-start">

        {/* ── LEFT ─────────────────────────────────────────────────────────── */}
        <div style={{ display:"flex", flexDirection:"column", gap:16 }}>

          {/* ══ WORKING: Time Blocks ══════════════════════════════════════════ */}
          {tab === "working" && (
            <div style={{ background:"#FFFFFF", borderRadius:20, border:"1px solid #EBEDF2", padding:"20px 22px", boxShadow:"0 2px 10px rgba(0,0,0,0.05)" }}>
              {blockEnabled('other') && (<>
              <div style={{ display:"flex", alignItems:"center", justifyContent:"space-between", marginBottom:20 }}>
                <div style={{ display:"flex", alignItems:"center", gap:10 }}>
                  <div style={{ width:34, height:34, borderRadius:10, background:"rgba(222,26,26,0.1)", display:"flex", alignItems:"center", justifyContent:"center" }}>
                    <Clock size={16} style={{ color:"#DE1A1A" }} />
                  </div>
                  <div>
                    <p style={{ fontSize:14, fontWeight:800, color:"#111111", margin:0 }}>Technical</p>
                    <p style={{ fontSize:10, color:"#9CA3AF", margin:0 }}>{filledBlocks.length} {filledBlocks.length === 1 ? "block" : "blocks"} · {totalLoggedHours.toFixed(1)}h logged{nonMediaBreaks.length > 0 ? ` · ${nonMediaBreaks.length} break${nonMediaBreaks.length > 1 ? "s" : ""}` : ""}</p>
                  </div>
                </div>
              </div>

              {timeBlocks.filter(b => !b.isBreak).length === 0 ? (
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
                  {timeBlocks.filter(b => !b.isBreak).map(block => {
                    const usedByOthers = new Set(
                      timeBlocks.filter(b => !b.isBreak)
                        .filter(b => b.id !== block.id)
                        .flatMap(b => [b.startTime, b.endTime])
                    )
                    return (
                      <Fragment key={block.id}>
                      <div style={{ background:"#F9FAFB", borderRadius:14, border:"1px solid #EBEDF2", padding:"12px 14px", display:"flex", flexDirection:"column", gap:10 }}>

                        {/* ── Block header: delete ── */}
                        <div style={{ display:"flex", alignItems:"center" }}>
                          <button onClick={() => removeBlock(block.id)} style={{ marginLeft:"auto", background:"none", border:"none", cursor:"pointer", padding:4, borderRadius:8, display:"flex", flexShrink:0 }}>
                            <Trash2 size={13} style={{ color:"#EF4444" }} />
                          </button>
                        </div>

                        {/* ── CLIENT NAME | TITLE (50/50 desktop, stacked mobile) ── */}
                        <div className="grid md:grid-cols-2" style={{ gap:8 }}>
                            <div>
                              <p style={{ fontSize:10, fontWeight:700, color:"#9CA3AF", textTransform:"uppercase", letterSpacing:"0.1em", marginBottom:5, margin:"0 0 5px" }}>Client Name</p>
                              <ClientSelector
                                label=""
                                value=""
                                clientOptions={activeClientOptions}
                                pastClientOptions={pastClientOptions}
                                excludeOptions={block.clientNames}
                                placeholder="Add client / project…"
                                onValueChange={v => { if (!v) return; patchBlock(block.id, { clientNames: [...block.clientNames, v], isMultiClient: block.clientNames.length >= 1, projectName: "" }) }}
                              />
                            </div>
                            <div>
                              <p style={{ fontSize:10, fontWeight:700, color:"#9CA3AF", textTransform:"uppercase", letterSpacing:"0.1em", marginBottom:5, margin:"0 0 5px" }}>Title</p>
                              <input value={block.description} onChange={e => patchBlock(block.id, { description: e.target.value })}
                                placeholder="What did you work on?"
                                style={{ width:"100%", background:"#FFFFFF", border:"1.5px solid #EBEDF2", borderRadius:8, padding:"8px 10px", fontSize:12, color:"#111827", outline:"none", boxSizing:"border-box" as const }} />
                            </div>
                          </div>
                          {block.clientNames.length > 0 && (
                            <div style={{ display:"flex", flexWrap:"wrap", gap:4, marginTop:4 }}>
                              {block.clientNames.map(name => (
                                <button key={name} type="button"
                                  onClick={() => patchBlock(block.id, { clientNames: block.clientNames.filter(n => n !== name), isMultiClient: block.clientNames.length > 2 })}
                                  style={{ display:"flex", alignItems:"center", gap:4, padding:"3px 8px", borderRadius:99, background:"rgba(222,26,26,0.08)", border:"1.5px solid rgba(222,26,26,0.25)", cursor:"pointer" }}>
                                  <span style={{ fontSize:10, fontWeight:700, color:"#de1a1a" }}>{name}</span>
                                  <span style={{ fontSize:8, color:"#de1a1a" }}>✕</span>
                                </button>
                              ))}
                            </div>
                          )}

                          {/* ── WORKING TIME ── */}
                          <div>
                            <p style={{ fontSize:10, fontWeight:700, color:"#9CA3AF", textTransform:"uppercase", letterSpacing:"0.1em", margin:"0 0 5px" }}>⏱ Working Time</p>
                            <div style={{ display:"flex", alignItems:"center", gap:8, flexWrap:"wrap" }}>
                              <TimePicker value={block.startTime} onChange={v => patchBlock(block.id, { startTime: v })} />
                              <span style={{ fontSize:11, color:"#9CA3AF", flexShrink:0 }}>to</span>
                              <TimePicker value={block.endTime} onChange={v => patchBlock(block.id, { endTime: v })} />
                              {block.durationHours > 0 && (
                                <div style={{ display:"inline-flex", alignItems:"center", gap:6, padding:"6px 10px", borderRadius:8, background:"rgba(99,102,241,0.08)", border:"1.5px solid rgba(99,102,241,0.2)" }}>
                                  <span style={{ fontSize:12, fontWeight:700, color:"#6366F1" }}>{fmtTravel(block.durationHours)}</span>
                                  <span style={{ fontSize:10, color:"#9CA3AF", fontWeight:500 }}>auto</span>
                                </div>
                              )}
                            </div>
                          </div>

                          {/* ── WORKED WITH (50% desktop) ── */}
                          {teamMembers.length > 0 && (
                            <div className="w-full md:w-1/2">
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
                      </Fragment>
                    )
                  })}
                </div>
              )}

              {timeBlocks.filter(b => !b.isBreak).length > 0 && (
                <div style={{ display:"flex", justifyContent:"center", marginTop:12 }}>
                  <button type="button" onClick={addTimeBlock}
                    style={{ display:"flex", alignItems:"center", gap:6, padding:"8px 20px", borderRadius:10, border:"none", background:"#DE1A1A", color:"#FFFFFF", fontSize:12, fontWeight:700, cursor:"pointer" }}>
                    <Plus size={13} /> Add block
                  </button>
                </div>
              )}
              </>)}

              {/* ── Voiceover Today section ─────────────────────────────── */}
              {!isMediaTeam && blockEnabled('voiceover') && <div style={{ background:"#FFFFFF", borderRadius:20, border:"1px solid #EBEDF2", padding:"20px 22px", boxShadow:"0 2px 10px rgba(0,0,0,0.05)" }}>
                <SectionHead icon={<span style={{ fontSize:16 }}>🎙️</span>} label="Voiceover" count={voiceovers.length} color="#8B5CF6" />
                {voiceovers.length === 0 ? (
                  <div onClick={addVoiceover} style={{ display:"flex", flexDirection:"column", alignItems:"center", justifyContent:"center", gap:14, padding:"32px 0", borderRadius:16, border:"2px dashed #DDD6FE", background:"rgba(139,92,246,0.02)", cursor:"pointer" }}>
                    <div style={{ position:"relative", width:180, height:140 }}>
                      <Image src="/brand/voiceover-girl.png" alt="Voiceover" fill style={{ objectFit:"contain" }} />
                    </div>
                    <p style={{ fontSize:13, fontWeight:600, color:"#9CA3AF", margin:0 }}>No voiceovers logged yet</p>
                    <span style={{ fontSize:12, color:"#FFFFFF", fontWeight:700, background:"#8B5CF6", padding:"9px 22px", borderRadius:10, boxShadow:"0 4px 14px rgba(139,92,246,0.35)" }}>+ Add Voiceover</span>
                  </div>
                ) : (
                  <div style={{ display:"flex", flexDirection:"column", gap:12 }}>
                {voiceovers.map((e, vi) => {
                  const F: React.CSSProperties = { width:"100%", boxSizing:"border-box" as const, fontSize:12, padding:"8px 10px", borderRadius:8, border:"1.5px solid #EBEDF2", background:"#F9FAFB", color:"#111827", outline:"none" }
                  const L: React.CSSProperties = { display:"block", fontSize:10, fontWeight:700, color:"#374151", textTransform:"uppercase" as const, letterSpacing:"0.1em", marginBottom:5 }
                  const dur = calcDuration(e.startTime, e.endTime)
                  return (
                    <div key={e.id} style={{ background:"#FAFBFC", borderRadius:14, border: e.isRework ? "1.5px solid rgba(245,158,11,0.4)" : "1px solid #F0F1F5", padding:"14px 16px" }}>
                      <div style={{ display:"flex", alignItems:"center", justifyContent:"space-between", marginBottom:10 }}>
                        <span style={{ fontSize:11, fontWeight:800, color:"#8B5CF6", textTransform:"uppercase", letterSpacing:"0.1em" }}>Voiceover #{vi+1}</span>
                        <button onClick={() => removeVoiceover(e.id)} style={{ width:26, height:26, borderRadius:8, background:"rgba(139,92,246,0.08)", border:"none", cursor:"pointer", display:"flex", alignItems:"center", justifyContent:"center" }}>
                          <Trash2 size={12} style={{ color:"#8B5CF6" }} />
                        </button>
                      </div>
                      {/* Revision toggle */}
                      <div style={{ display:"flex", alignItems:"center", gap:8, marginBottom:10, padding:"7px 12px", borderRadius:10, background: e.isRework ? "rgba(245,158,11,0.08)" : "rgba(139,92,246,0.04)", border: e.isRework ? "1px solid rgba(245,158,11,0.3)" : "1px solid rgba(139,92,246,0.1)" }}>
                        <button onClick={() => patchVoiceover(e.id, { isRework: !e.isRework, linkedToTitle:"", linkedToClient:"", linkedToDate:"" })}
                          style={{ display:"flex", alignItems:"center", gap:6, padding:"4px 10px", borderRadius:8, border:"none", cursor:"pointer", fontSize:11, fontWeight:700, background: e.isRework ? "rgba(245,158,11,0.2)" : "rgba(139,92,246,0.12)", color: e.isRework ? "#92400E" : "#7C3AED", whiteSpace:"nowrap", flexShrink:0 }}>
                          {e.isRework ? "✓ Revision" : "Revision of existing?"}
                        </button>
                        {e.isRework && (
                          past15Options.voiceovers.length > 0 ? (
                            <select value={e.linkedToDate ? `${e.linkedToDate}||${e.linkedToClient}||${e.linkedToTitle}` : ""}
                              onChange={ev => {
                                const opt = past15Options.voiceovers.find(o => o.key === ev.target.value)
                                if (opt) patchVoiceover(e.id, { linkedToTitle: opt.title, linkedToClient: opt.client, linkedToDate: opt.date })
                              }}
                              style={{ flex:1, fontSize:11, padding:"4px 8px", borderRadius:8, border:"1px solid rgba(245,158,11,0.4)", background:"#fff", color:"#374151", outline:"none" }}>
                              <option value="">Select original voiceover (last 50 entries)…</option>
                              {past15Options.voiceovers.map(o => <option key={o.key} value={o.key}>{o.label}</option>)}
                            </select>
                          ) : <span style={{ fontSize:11, color:"#9CA3AF" }}>No voiceovers found</span>
                        )}
                        {e.isRework && e.linkedToTitle && <span style={{ fontSize:10, fontWeight:700, color:"#B45309", whiteSpace:"nowrap" }}>→ {e.linkedToTitle}</span>}
                      </div>
                      <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:8, marginBottom:8 }}>
                        <div>
                          <label style={L}>Client Name</label>
                          <ClientSelector
                            label=""
                            value={e.clientName}
                            clientOptions={activeClientOptions}
                            pastClientOptions={pastClientOptions}
                            placeholder="Select client…"
                            onValueChange={v => patchVoiceover(e.id, { clientName: v })}
                          />
                        </div>
                        <div>
                          <label style={L}>Script Name</label>
                          <input value={e.title} onChange={ev => patchVoiceover(e.id, { title: ev.target.value })} placeholder="Script or project name" style={F} />
                        </div>
                      </div>
                      <div style={{ marginBottom:8 }}>
                        <label style={L}>🎙 Voiceover Time</label>
                        <div style={{ display:"flex", alignItems:"center", gap:8, flexWrap:"wrap" }}>
                          <TimePicker value={e.startTime} onChange={v => patchVoiceover(e.id, { startTime: v })} />
                          <span style={{ fontSize:11, color:"#9CA3AF", flexShrink:0 }}>to</span>
                          <TimePicker value={e.endTime} onChange={v => patchVoiceover(e.id, { endTime: v })} />
                          {dur > 0 && <span style={{ fontSize:10, fontWeight:700, padding:"3px 8px", borderRadius:99, background:"rgba(139,92,246,0.1)", color:"#8B5CF6" }}>{fmtTravel(dur)}</span>}
                        </div>
                      </div>
                      <div style={{ marginBottom:8 }}>
                        <label style={L}>Drive / Audio Link</label>
                        <input value={e.videoLink} onChange={ev => patchVoiceover(e.id, { videoLink: ev.target.value })} placeholder="https://drive.google.com/…" style={F} />
                      </div>
                      <div>
                        <label style={L}>Notes</label>
                        <input value={e.notes} onChange={ev => patchVoiceover(e.id, { notes: ev.target.value })} placeholder="Script details, revisions…" style={F} />
                      </div>
                    </div>
                  )
                })}
                  </div>
                )}
                {voiceovers.length > 0 && (
                  <button onClick={addVoiceover} style={{ marginTop:12, display:"flex", alignItems:"center", gap:6, padding:"9px 18px", borderRadius:10, border:"1.5px dashed rgba(139,92,246,0.4)", background:"rgba(139,92,246,0.04)", color:"#8B5CF6", fontSize:12, fontWeight:700, cursor:"pointer", width:"100%" }}>
                    <Plus size={13} /> Add Another Voiceover
                  </button>
                )}
              </div>}

              {/* ── Poster Today section ────────────────────────────────── */}
              {!isMediaTeam && blockEnabled('poster') && <div style={{ background:"#FFFFFF", borderRadius:20, border:"1px solid #EBEDF2", padding:"20px 22px", boxShadow:"0 2px 10px rgba(0,0,0,0.05)" }}>
                <SectionHead icon={<span style={{ fontSize:16 }}>🖼️</span>} label="Poster" count={posters.length} color="#EC4899" />
                {posters.length === 0 ? (
                  <div onClick={addPoster} style={{ display:"flex", flexDirection:"column", alignItems:"center", justifyContent:"center", gap:14, padding:"32px 0", borderRadius:16, border:"2px dashed #FBCFE8", background:"rgba(236,72,153,0.02)", cursor:"pointer" }}>
                    <div style={{ position:"relative", width:180, height:140 }}>
                      <Image src="/brand/poster-girl.png" alt="Poster" fill style={{ objectFit:"contain" }} />
                    </div>
                    <p style={{ fontSize:13, fontWeight:600, color:"#9CA3AF", margin:0 }}>No posters logged yet</p>
                    <span style={{ fontSize:12, color:"#FFFFFF", fontWeight:700, background:"#EC4899", padding:"9px 22px", borderRadius:10, boxShadow:"0 4px 14px rgba(236,72,153,0.35)" }}>+ Add Poster</span>
                  </div>
                ) : (
                  <div style={{ display:"flex", flexDirection:"column", gap:12 }}>
                {posters.map((e, pi) => {
                  const F: React.CSSProperties = { width:"100%", boxSizing:"border-box" as const, fontSize:12, padding:"8px 10px", borderRadius:8, border:"1.5px solid #EBEDF2", background:"#F9FAFB", color:"#111827", outline:"none" }
                  const L: React.CSSProperties = { display:"block", fontSize:10, fontWeight:700, color:"#374151", textTransform:"uppercase" as const, letterSpacing:"0.1em", marginBottom:5 }
                  const dur = calcDuration(e.startTime, e.endTime)
                  return (
                    <div key={e.id} style={{ background:"#FAFBFC", borderRadius:14, border:"1px solid #F0F1F5", padding:"14px 16px" }}>
                      <div style={{ display:"flex", alignItems:"center", justifyContent:"space-between", marginBottom:12 }}>
                        <span style={{ fontSize:11, fontWeight:800, color:"#EC4899", textTransform:"uppercase", letterSpacing:"0.1em" }}>Poster #{pi+1}</span>
                        <button onClick={() => removePoster(e.id)} style={{ width:26, height:26, borderRadius:8, border:"none", background:"rgba(236,72,153,0.08)", cursor:"pointer", display:"flex", alignItems:"center", justifyContent:"center" }}>
                          <Trash2 size={12} style={{ color:"#EC4899" }} />
                        </button>
                      </div>
                      {/* Revision toggle */}
                      <div style={{ display:"flex", alignItems:"center", gap:8, marginBottom:10, padding:"7px 12px", borderRadius:10, background: e.isRework ? "rgba(245,158,11,0.08)" : "rgba(236,72,153,0.04)", border: e.isRework ? "1px solid rgba(245,158,11,0.3)" : "1px solid rgba(236,72,153,0.1)" }}>
                        <button onClick={() => patchPoster(e.id, { isRework: !e.isRework, linkedToTitle:"", linkedToClient:"", linkedToDate:"" })}
                          style={{ display:"flex", alignItems:"center", gap:6, padding:"4px 10px", borderRadius:8, border:"none", cursor:"pointer", fontSize:11, fontWeight:700, background: e.isRework ? "rgba(245,158,11,0.2)" : "rgba(236,72,153,0.12)", color: e.isRework ? "#92400E" : "#BE185D", whiteSpace:"nowrap", flexShrink:0 }}>
                          {e.isRework ? "✓ Revision" : "Revision of existing?"}
                        </button>
                        {e.isRework && (
                          past15Options.posters.length > 0 ? (
                            <select value={e.linkedToDate ? `${e.linkedToDate}||${e.linkedToClient}||${e.linkedToTitle}` : ""}
                              onChange={ev => {
                                const opt = past15Options.posters.find(o => o.key === ev.target.value)
                                if (opt) patchPoster(e.id, { linkedToTitle: opt.title, linkedToClient: opt.client, linkedToDate: opt.date })
                              }}
                              style={{ flex:1, fontSize:11, padding:"4px 8px", borderRadius:8, border:"1px solid rgba(245,158,11,0.4)", background:"#fff", color:"#374151", outline:"none" }}>
                              <option value="">Select original poster (last 50 entries)…</option>
                              {past15Options.posters.map(o => <option key={o.key} value={o.key}>{o.label}</option>)}
                            </select>
                          ) : <span style={{ fontSize:11, color:"#9CA3AF" }}>No posters found</span>
                        )}
                        {e.isRework && e.linkedToTitle && <span style={{ fontSize:10, fontWeight:700, color:"#B45309", whiteSpace:"nowrap" }}>→ {e.linkedToTitle}</span>}
                      </div>
                      <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:8, marginBottom:8 }}>
                        <div>
                          <label style={L}>Client Name</label>
                          <ClientSelector
                            label=""
                            value={e.clientName}
                            clientOptions={activeClientOptions}
                            pastClientOptions={pastClientOptions}
                            placeholder="Select client…"
                            onValueChange={v => patchPoster(e.id, { clientName: v })}
                          />
                        </div>
                        <div>
                          <label style={L}>Poster Name</label>
                          <input value={e.title} onChange={ev => patchPoster(e.id, { title: ev.target.value })} placeholder="Poster or design name" style={F} />
                        </div>
                      </div>
                      <div style={{ marginBottom:8 }}>
                        <label style={L}>🎨 Designing Time</label>
                        <div style={{ display:"flex", alignItems:"center", gap:8, flexWrap:"wrap" }}>
                          <TimePicker value={e.startTime} onChange={v => patchPoster(e.id, { startTime: v })} />
                          <span style={{ fontSize:11, color:"#9CA3AF", flexShrink:0 }}>to</span>
                          <TimePicker value={e.endTime} onChange={v => patchPoster(e.id, { endTime: v })} />
                          {dur > 0 && <span style={{ fontSize:10, fontWeight:700, padding:"3px 8px", borderRadius:99, background:"rgba(236,72,153,0.1)", color:"#EC4899" }}>{fmtTravel(dur)}</span>}
                        </div>
                      </div>
                      <div style={{ marginBottom: teamMembers.length > 0 ? 8 : 0 }}>
                        <label style={L}>Notes</label>
                        <input value={e.notes} onChange={ev => patchPoster(e.id, { notes: ev.target.value })} placeholder="Design details, revisions…" style={F} />
                      </div>
                      {teamMembers.length > 0 && (
                        <div style={{ paddingTop:8, borderTop:"1px dashed #EBEDF2" }}>
                          <p style={{ fontSize:10, fontWeight:700, color:"#9CA3AF", textTransform:"uppercase", letterSpacing:"0.07em", margin:"0 0 7px" }}>👥 Worked With</p>
                          <div style={{ position:"relative" }}>
                            <select value="" onChange={ev => { const id = ev.target.value; if (id && !e.participantIds.includes(id)) patchPoster(e.id, { participantIds: [...e.participantIds, id] }) }}
                              style={{ width:"100%", fontSize:12, fontWeight:600, color:"#374151", background:"#fff", border:"1.5px solid #EBEDF2", borderRadius:10, padding:"8px 28px 8px 10px", cursor:"pointer", outline:"none", appearance:"none" }}>
                              <option value="">Add teammate…</option>
                              {teamMembers.filter(m => !e.participantIds.includes(m.id)).map(m => (
                                <option key={m.id} value={m.id}>{m.name}</option>
                              ))}
                            </select>
                            <ChevronDown size={11} style={{ position:"absolute", right:10, top:"50%", transform:"translateY(-50%)", color:"#9CA3AF", pointerEvents:"none" }} />
                          </div>
                          {e.participantIds.length > 0 && (
                            <div style={{ display:"flex", flexWrap:"wrap", gap:4, marginTop:6 }}>
                              {e.participantIds.map(pid => {
                                const m = teamMembers.find(t => t.id === pid)
                                if (!m) return null
                                const initials = m.name.split(" ").map((n:string) => n[0]).join("").slice(0,2).toUpperCase()
                                return (
                                  <button key={pid} type="button"
                                    onClick={() => patchPoster(e.id, { participantIds: e.participantIds.filter(p => p !== pid) })}
                                    style={{ display:"flex", alignItems:"center", gap:4, padding:"3px 8px 3px 5px", borderRadius:99, background:"rgba(236,72,153,0.1)", border:"1.5px solid rgba(236,72,153,0.3)", cursor:"pointer" }}>
                                    <div style={{ width:16, height:16, borderRadius:"50%", background:"#EC4899", display:"flex", alignItems:"center", justifyContent:"center", fontSize:7, fontWeight:900, color:"#fff" }}>{initials}</div>
                                    <span style={{ fontSize:10, fontWeight:700, color:"#BE185D" }}>{m.name.split(" ")[0]}</span>
                                    <span style={{ fontSize:8, color:"#F472B6" }}>✕</span>
                                  </button>
                                )
                              })}
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  )
                })}
                  </div>
                )}
                {posters.length > 0 && (
                  <button onClick={addPoster} style={{ marginTop:12, display:"flex", alignItems:"center", gap:6, padding:"9px 18px", borderRadius:10, border:"1.5px dashed rgba(236,72,153,0.4)", background:"rgba(236,72,153,0.04)", color:"#EC4899", fontSize:12, fontWeight:700, cursor:"pointer", width:"100%" }}>
                    <Plus size={13} /> Add Another Poster
                  </button>
                )}
              </div>}

              {/* ── Scripting Today section (non-media only) ────────────── */}
              {!isMediaTeam && blockEnabled('scripting') && <div style={{ background:"#FFFFFF", borderRadius:20, border:"1px solid #EBEDF2", padding:"20px 22px", boxShadow:"0 2px 10px rgba(0,0,0,0.05)" }}>
                <SectionHead icon={<span style={{ fontSize:16 }}>📝</span>} label="Scripting" count={scriptings.length} color="#EAB308" />
                {scriptings.length === 0 ? (
                  <div onClick={addScripting} style={{ display:"flex", flexDirection:"column", alignItems:"center", justifyContent:"center", gap:14, padding:"32px 0", borderRadius:16, border:"2px dashed rgba(234,179,8,0.35)", background:"rgba(234,179,8,0.03)", cursor:"pointer" }}>
                    <span style={{ fontSize:36 }}>📝</span>
                    <p style={{ fontSize:13, fontWeight:600, color:"#9CA3AF", margin:0 }}>No scripts logged yet</p>
                    <span style={{ fontSize:12, color:"#FFFFFF", fontWeight:700, background:"#EAB308", padding:"9px 22px", borderRadius:10, boxShadow:"0 4px 14px rgba(234,179,8,0.35)" }}>+ Add Scripting</span>
                  </div>
                ) : (
                  <div style={{ display:"flex", flexDirection:"column", gap:12 }}>
                {scriptings.map((e, si) => {
                  const F: React.CSSProperties = { width:"100%", boxSizing:"border-box" as const, fontSize:12, padding:"8px 10px", borderRadius:8, border:"1.5px solid #EBEDF2", background:"#F9FAFB", color:"#111827", outline:"none" }
                  const L: React.CSSProperties = { display:"block", fontSize:10, fontWeight:700, color:"#374151", textTransform:"uppercase" as const, letterSpacing:"0.1em", marginBottom:5 }
                  const dur = calcDuration(e.startTime, e.endTime)
                  return (
                    <div key={e.id} style={{ background:"#FAFBFC", borderRadius:14, border:"1px solid #F0F1F5", padding:"14px 16px" }}>
                      <div style={{ display:"flex", alignItems:"center", justifyContent:"space-between", marginBottom:12 }}>
                        <span style={{ fontSize:11, fontWeight:800, color:"#EAB308", textTransform:"uppercase", letterSpacing:"0.1em" }}>Scripting #{si+1}</span>
                        <button onClick={() => removeScripting(e.id)} style={{ width:26, height:26, borderRadius:8, border:"none", background:"rgba(234,179,8,0.1)", cursor:"pointer", display:"flex", alignItems:"center", justifyContent:"center" }}>
                          <Trash2 size={12} style={{ color:"#92620B" }} />
                        </button>
                      </div>
                      {/* Revision toggle */}
                      <div style={{ display:"flex", alignItems:"center", gap:8, marginBottom:10, padding:"7px 12px", borderRadius:10, background: e.isRework ? "rgba(245,158,11,0.08)" : "rgba(234,179,8,0.05)", border: e.isRework ? "1px solid rgba(245,158,11,0.3)" : "1px solid rgba(234,179,8,0.15)" }}>
                        <button onClick={() => patchScripting(e.id, { isRework: !e.isRework, linkedToTitle:"", linkedToClient:"", linkedToDate:"" })}
                          style={{ display:"flex", alignItems:"center", gap:6, padding:"4px 10px", borderRadius:8, border:"none", cursor:"pointer", fontSize:11, fontWeight:700, background: e.isRework ? "rgba(245,158,11,0.2)" : "rgba(234,179,8,0.15)", color: e.isRework ? "#92400E" : "#92620B", whiteSpace:"nowrap", flexShrink:0 }}>
                          {e.isRework ? "✓ Revision" : "Revision of existing?"}
                        </button>
                        {e.isRework && (
                          past15Options.scriptings.length > 0 ? (
                            <select value={e.linkedToDate ? `${e.linkedToDate}||${e.linkedToClient}||${e.linkedToTitle}` : ""}
                              onChange={ev => {
                                const opt = past15Options.scriptings.find(o => o.key === ev.target.value)
                                if (opt) patchScripting(e.id, { linkedToTitle: opt.title, linkedToClient: opt.client, linkedToDate: opt.date })
                              }}
                              style={{ flex:1, fontSize:11, padding:"4px 8px", borderRadius:8, border:"1px solid rgba(245,158,11,0.4)", background:"#fff", color:"#374151", outline:"none" }}>
                              <option value="">Select original script (last 50 entries)…</option>
                              {past15Options.scriptings.map(o => <option key={o.key} value={o.key}>{o.label}</option>)}
                            </select>
                          ) : <span style={{ fontSize:11, color:"#9CA3AF" }}>No scripts found</span>
                        )}
                        {e.isRework && e.linkedToTitle && <span style={{ fontSize:10, fontWeight:700, color:"#B45309", whiteSpace:"nowrap" }}>→ {e.linkedToTitle}</span>}
                      </div>
                      <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:8, marginBottom:8 }}>
                        <div>
                          <label style={L}>Client Name</label>
                          <ClientSelector
                            label=""
                            value={e.clientName}
                            clientOptions={activeClientOptions}
                            pastClientOptions={pastClientOptions}
                            placeholder="Select client…"
                            onValueChange={v => patchScripting(e.id, { clientName: v })}
                          />
                        </div>
                        <div>
                          <label style={L}>Script Title</label>
                          <input value={e.title} onChange={ev => patchScripting(e.id, { title: ev.target.value })} placeholder="e.g. Independence Day Reel Script" style={F} />
                        </div>
                      </div>
                      <div style={{ marginBottom:8 }}>
                        <label style={L}>📝 Scripting Time</label>
                        <div style={{ display:"flex", alignItems:"center", gap:8, flexWrap:"wrap" }}>
                          <TimePicker value={e.startTime} onChange={v => patchScripting(e.id, { startTime: v })} />
                          <span style={{ fontSize:11, color:"#9CA3AF", flexShrink:0 }}>to</span>
                          <TimePicker value={e.endTime} onChange={v => patchScripting(e.id, { endTime: v })} />
                          {dur > 0 && <span style={{ fontSize:10, fontWeight:700, padding:"3px 8px", borderRadius:99, background:"rgba(234,179,8,0.12)", color:"#92620B" }}>{fmtTravel(dur)}</span>}
                        </div>
                      </div>
                      <div style={{ marginBottom: teamMembers.length > 0 ? 8 : 0 }}>
                        <label style={L}>Notes</label>
                        <input value={e.notes} onChange={ev => patchScripting(e.id, { notes: ev.target.value })} placeholder="Script details, revisions…" style={F} />
                      </div>
                      {teamMembers.length > 0 && (
                        <div style={{ paddingTop:8, borderTop:"1px dashed #EBEDF2" }}>
                          <p style={{ fontSize:10, fontWeight:700, color:"#9CA3AF", textTransform:"uppercase", letterSpacing:"0.07em", margin:"0 0 7px" }}>👥 Worked With</p>
                          <div style={{ position:"relative" }}>
                            <select value="" onChange={ev => { const id = ev.target.value; if (id && !e.participantIds.includes(id)) patchScripting(e.id, { participantIds: [...e.participantIds, id] }) }}
                              style={{ width:"100%", fontSize:12, fontWeight:600, color:"#374151", background:"#fff", border:"1.5px solid #EBEDF2", borderRadius:10, padding:"8px 28px 8px 10px", cursor:"pointer", outline:"none", appearance:"none" }}>
                              <option value="">Add teammate…</option>
                              {teamMembers.filter(m => !e.participantIds.includes(m.id)).map(m => (
                                <option key={m.id} value={m.id}>{m.name}</option>
                              ))}
                            </select>
                            <ChevronDown size={11} style={{ position:"absolute", right:10, top:"50%", transform:"translateY(-50%)", color:"#9CA3AF", pointerEvents:"none" }} />
                          </div>
                          {e.participantIds.length > 0 && (
                            <div style={{ display:"flex", flexWrap:"wrap", gap:4, marginTop:6 }}>
                              {e.participantIds.map(pid => {
                                const m = teamMembers.find(t => t.id === pid)
                                if (!m) return null
                                const initials = m.name.split(" ").map((n:string) => n[0]).join("").slice(0,2).toUpperCase()
                                return (
                                  <button key={pid} type="button"
                                    onClick={() => patchScripting(e.id, { participantIds: e.participantIds.filter(p => p !== pid) })}
                                    style={{ display:"flex", alignItems:"center", gap:4, padding:"3px 8px 3px 5px", borderRadius:99, background:"rgba(234,179,8,0.12)", border:"1.5px solid rgba(234,179,8,0.3)", cursor:"pointer" }}>
                                    <div style={{ width:16, height:16, borderRadius:"50%", background:"#EAB308", display:"flex", alignItems:"center", justifyContent:"center", fontSize:7, fontWeight:900, color:"#fff" }}>{initials}</div>
                                    <span style={{ fontSize:10, fontWeight:700, color:"#92620B" }}>{m.name.split(" ")[0]}</span>
                                    <span style={{ fontSize:8, color:"#B45309" }}>✕</span>
                                  </button>
                                )
                              })}
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  )
                })}
                  </div>
                )}
                {scriptings.length > 0 && (
                  <button onClick={addScripting} style={{ marginTop:12, display:"flex", alignItems:"center", gap:6, padding:"9px 18px", borderRadius:10, border:"1.5px dashed rgba(234,179,8,0.4)", background:"rgba(234,179,8,0.04)", color:"#92620B", fontSize:12, fontWeight:700, cursor:"pointer", width:"100%" }}>
                    <Plus size={13} /> Add Another Scripting
                  </button>
                )}
              </div>}

              {/* ── Development Today section (non-media only) ──────────── */}
              {!isMediaTeam && blockEnabled('development') && <div style={{ background:"#FFFFFF", borderRadius:20, border:"1px solid #EBEDF2", padding:"20px 22px", boxShadow:"0 2px 10px rgba(0,0,0,0.05)" }}>
                <SectionHead icon={<span style={{ fontSize:16 }}>💻</span>} label="Development" count={developments.length} color="#6366F1" />
                {developments.length === 0 ? (
                  <div onClick={addDevelopment} style={{ display:"flex", flexDirection:"column", alignItems:"center", justifyContent:"center", gap:14, padding:"32px 0", borderRadius:16, border:"2px dashed rgba(99,102,241,0.35)", background:"rgba(99,102,241,0.03)", cursor:"pointer" }}>
                    <span style={{ fontSize:36 }}>💻</span>
                    <p style={{ fontSize:13, fontWeight:600, color:"#9CA3AF", margin:0 }}>No development logged yet</p>
                    <span style={{ fontSize:12, color:"#FFFFFF", fontWeight:700, background:"#6366F1", padding:"9px 22px", borderRadius:10, boxShadow:"0 4px 14px rgba(99,102,241,0.35)" }}>+ Add Development</span>
                  </div>
                ) : (
                  <div style={{ display:"flex", flexDirection:"column", gap:12 }}>
                {developments.map((e, di) => {
                  const F: React.CSSProperties = { width:"100%", boxSizing:"border-box" as const, fontSize:12, padding:"8px 10px", borderRadius:8, border:"1.5px solid #EBEDF2", background:"#F9FAFB", color:"#111827", outline:"none" }
                  const L: React.CSSProperties = { display:"block", fontSize:10, fontWeight:700, color:"#374151", textTransform:"uppercase" as const, letterSpacing:"0.1em", marginBottom:5 }
                  const dur = calcDuration(e.startTime, e.endTime)
                  return (
                    <div key={e.id} style={{ background:"#FAFBFC", borderRadius:14, border:"1px solid #F0F1F5", padding:"14px 16px" }}>
                      <div style={{ display:"flex", alignItems:"center", justifyContent:"space-between", marginBottom:12 }}>
                        <span style={{ fontSize:11, fontWeight:800, color:"#6366F1", textTransform:"uppercase", letterSpacing:"0.1em" }}>Development #{di+1}</span>
                        <button onClick={() => removeDevelopment(e.id)} style={{ width:26, height:26, borderRadius:8, border:"none", background:"rgba(99,102,241,0.08)", cursor:"pointer", display:"flex", alignItems:"center", justifyContent:"center" }}>
                          <Trash2 size={12} style={{ color:"#6366F1" }} />
                        </button>
                      </div>
                      <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:8, marginBottom:8 }}>
                        <div>
                          <label style={L}>Project</label>
                          {e.isCreatingNew ? (
                            <div style={{ display:"flex", gap:6 }}>
                              <input autoFocus value={e.project} onChange={ev => patchDevelopment(e.id, { project: ev.target.value })} placeholder="Type new project name, e.g. TEAM APP" style={F} />
                              <button type="button" onClick={() => patchDevelopment(e.id, { isCreatingNew: false, project: "" })}
                                style={{ flexShrink:0, fontSize:11, fontWeight:700, color:"#6B7280", background:"#F3F4F6", border:"1.5px solid #EBEDF2", borderRadius:8, padding:"0 10px", cursor:"pointer" }}>
                                Cancel
                              </button>
                            </div>
                          ) : (
                            <div style={{ position:"relative" }}>
                              <select value={e.project} onChange={ev => {
                                  if (ev.target.value === "__new__") patchDevelopment(e.id, { isCreatingNew: true, project: "" })
                                  else patchDevelopment(e.id, { project: ev.target.value, isCreatingNew: false })
                                }}
                                style={{ ...F, paddingRight:28, appearance:"none" }}>
                                <option value="">Select project…</option>
                                <option value="__new__">+ Create New Project</option>
                                {pastProjectNames.map(p => <option key={p} value={p}>{p}</option>)}
                              </select>
                              <ChevronDown size={11} style={{ position:"absolute", right:10, top:"50%", transform:"translateY(-50%)", color:"#9CA3AF", pointerEvents:"none" }} />
                            </div>
                          )}
                        </div>
                        <div>
                          <label style={L}>Client Name</label>
                          <ClientSelector
                            label=""
                            value={e.clientName}
                            clientOptions={activeClientOptions}
                            pastClientOptions={pastClientOptions}
                            placeholder="Select client…"
                            onValueChange={v => patchDevelopment(e.id, { clientName: v })}
                          />
                        </div>
                      </div>
                      <div style={{ marginBottom:8 }}>
                        <label style={L}>Sub-title — what did you work on today?</label>
                        <input value={e.subtitle} onChange={ev => patchDevelopment(e.id, { subtitle: ev.target.value })} placeholder="e.g. Fixed dashboard filter bug" style={F} />
                      </div>
                      <div style={{ marginBottom: teamMembers.length > 0 ? 8 : 0 }}>
                        <label style={L}>💻 Dev Time</label>
                        <div style={{ display:"flex", alignItems:"center", gap:8, flexWrap:"wrap" }}>
                          <TimePicker value={e.startTime} onChange={v => patchDevelopment(e.id, { startTime: v })} />
                          <span style={{ fontSize:11, color:"#9CA3AF", flexShrink:0 }}>to</span>
                          <TimePicker value={e.endTime} onChange={v => patchDevelopment(e.id, { endTime: v })} />
                          {dur > 0 && <span style={{ fontSize:10, fontWeight:700, padding:"3px 8px", borderRadius:99, background:"rgba(99,102,241,0.1)", color:"#6366F1" }}>{fmtTravel(dur)}</span>}
                        </div>
                      </div>
                      {teamMembers.length > 0 && (
                        <div style={{ paddingTop:8, borderTop:"1px dashed #EBEDF2" }}>
                          <p style={{ fontSize:10, fontWeight:700, color:"#9CA3AF", textTransform:"uppercase", letterSpacing:"0.07em", margin:"0 0 7px" }}>👥 Worked With</p>
                          <div style={{ position:"relative" }}>
                            <select value="" onChange={ev => { const id = ev.target.value; if (id && !e.participantIds.includes(id)) patchDevelopment(e.id, { participantIds: [...e.participantIds, id] }) }}
                              style={{ width:"100%", fontSize:12, fontWeight:600, color:"#374151", background:"#fff", border:"1.5px solid #EBEDF2", borderRadius:10, padding:"8px 28px 8px 10px", cursor:"pointer", outline:"none", appearance:"none" }}>
                              <option value="">Add teammate…</option>
                              {teamMembers.filter(m => !e.participantIds.includes(m.id)).map(m => (
                                <option key={m.id} value={m.id}>{m.name}</option>
                              ))}
                            </select>
                            <ChevronDown size={11} style={{ position:"absolute", right:10, top:"50%", transform:"translateY(-50%)", color:"#9CA3AF", pointerEvents:"none" }} />
                          </div>
                          {e.participantIds.length > 0 && (
                            <div style={{ display:"flex", flexWrap:"wrap", gap:4, marginTop:6 }}>
                              {e.participantIds.map(pid => {
                                const m = teamMembers.find(t => t.id === pid)
                                if (!m) return null
                                const initials = m.name.split(" ").map((n:string) => n[0]).join("").slice(0,2).toUpperCase()
                                return (
                                  <button key={pid} type="button"
                                    onClick={() => patchDevelopment(e.id, { participantIds: e.participantIds.filter(p => p !== pid) })}
                                    style={{ display:"flex", alignItems:"center", gap:4, padding:"3px 8px 3px 5px", borderRadius:99, background:"rgba(99,102,241,0.1)", border:"1.5px solid rgba(99,102,241,0.3)", cursor:"pointer" }}>
                                    <div style={{ width:16, height:16, borderRadius:"50%", background:"#6366F1", display:"flex", alignItems:"center", justifyContent:"center", fontSize:7, fontWeight:900, color:"#fff" }}>{initials}</div>
                                    <span style={{ fontSize:10, fontWeight:700, color:"#3730A3" }}>{m.name.split(" ")[0]}</span>
                                    <span style={{ fontSize:8, color:"#6366F1" }}>✕</span>
                                  </button>
                                )
                              })}
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  )
                })}
                  </div>
                )}
                {developments.length > 0 && (
                  <button onClick={addDevelopment} style={{ marginTop:12, display:"flex", alignItems:"center", gap:6, padding:"9px 18px", borderRadius:10, border:"1.5px dashed rgba(99,102,241,0.4)", background:"rgba(99,102,241,0.04)", color:"#6366F1", fontSize:12, fontWeight:700, cursor:"pointer", width:"100%" }}>
                    <Plus size={13} /> Add Another Development
                  </button>
                )}
              </div>}

              {/* ── Editing Today section (non-media only) ──────────────── */}
              {!isMediaTeam && blockEnabled('edit') && <div style={{ background:"#FFFFFF", borderRadius:20, border:"1px solid #EBEDF2", padding:"20px 22px", boxShadow:"0 2px 10px rgba(0,0,0,0.05)" }}>
                <SectionHead icon={<span style={{ fontSize:16 }}>🎬</span>} label="Editing" count={nmEdits.length} color="#0D9488" />
                {nmEdits.length === 0 ? (
                  <div onClick={addNmEdit} style={{ display:"flex", flexDirection:"column", alignItems:"center", justifyContent:"center", gap:14, padding:"32px 0", borderRadius:16, border:"2px dashed rgba(13,148,136,0.35)", background:"rgba(13,148,136,0.02)", cursor:"pointer" }}>
                    <div style={{ position:"relative", width:180, height:140 }}>
                      <Image src="/brand/video-editor-boy.png" alt="Editing" fill style={{ objectFit:"contain" }} />
                    </div>
                    <p style={{ fontSize:13, fontWeight:600, color:"#9CA3AF", margin:0 }}>No editing logged yet</p>
                    <span style={{ fontSize:12, color:"#FFFFFF", fontWeight:700, background:"#0D9488", padding:"9px 22px", borderRadius:10, boxShadow:"0 4px 14px rgba(13,148,136,0.35)" }}>+ Add Editing</span>
                  </div>
                ) : (
                  <div style={{ display:"flex", flexDirection:"column", gap:12 }}>
                {nmEdits.map((e, ni) => {
                  const F: React.CSSProperties = { width:"100%", boxSizing:"border-box" as const, fontSize:12, padding:"8px 10px", borderRadius:8, border:"1.5px solid #EBEDF2", background:"#F9FAFB", color:"#111827", outline:"none" }
                  const L: React.CSSProperties = { display:"block", fontSize:10, fontWeight:700, color:"#374151", textTransform:"uppercase" as const, letterSpacing:"0.1em", marginBottom:5 }
                  const dur = calcDuration(e.startTime, e.endTime)
                  return (
                    <div key={e.id} style={{ background:"#FAFBFC", borderRadius:14, border: e.isRework ? "1.5px solid rgba(245,158,11,0.4)" : "1px solid #F0F1F5", padding:"14px 16px" }}>
                      <div style={{ display:"flex", alignItems:"center", justifyContent:"space-between", marginBottom:10 }}>
                        <span style={{ fontSize:11, fontWeight:800, color:"#0D9488", textTransform:"uppercase", letterSpacing:"0.1em" }}>Edit #{ni+1}</span>
                        <button onClick={() => removeNmEdit(e.id)} style={{ width:26, height:26, borderRadius:8, background:"rgba(13,148,136,0.08)", border:"none", cursor:"pointer", display:"flex", alignItems:"center", justifyContent:"center" }}>
                          <Trash2 size={12} style={{ color:"#0D9488" }} />
                        </button>
                      </div>
                      {/* Revision toggle */}
                      <div style={{ display:"flex", alignItems:"center", gap:8, marginBottom:10, padding:"7px 12px", borderRadius:10, background: e.isRework ? "rgba(245,158,11,0.08)" : "rgba(13,148,136,0.04)", border: e.isRework ? "1px solid rgba(245,158,11,0.3)" : "1px solid rgba(13,148,136,0.1)" }}>
                        <button onClick={() => patchNmEdit(e.id, { isRework: !e.isRework, linkedToTitle:"", linkedToClient:"", linkedToDate:"" })}
                          style={{ display:"flex", alignItems:"center", gap:6, padding:"4px 10px", borderRadius:8, border:"none", cursor:"pointer", fontSize:11, fontWeight:700, background: e.isRework ? "rgba(245,158,11,0.2)" : "rgba(13,148,136,0.12)", color: e.isRework ? "#92400E" : "#0D9488", whiteSpace:"nowrap", flexShrink:0 }}>
                          {e.isRework ? "✓ Revision" : "Revision of existing?"}
                        </button>
                        {e.isRework && (
                          past15Options.edits.length > 0 ? (
                            <select value={e.linkedToDate ? `${e.linkedToDate}||${e.linkedToClient}||${e.linkedToTitle}` : ""}
                              onChange={ev => {
                                const opt = past15Options.edits.find(o => o.key === ev.target.value)
                                if (opt) patchNmEdit(e.id, { linkedToTitle: opt.title, linkedToClient: opt.client, linkedToDate: opt.date })
                              }}
                              style={{ flex:1, fontSize:11, padding:"4px 8px", borderRadius:8, border:"1px solid rgba(245,158,11,0.4)", background:"#fff", color:"#374151", outline:"none" }}>
                              <option value="">Select original edit (last 50 entries)…</option>
                              {past15Options.edits.map(o => <option key={o.key} value={o.key}>{o.label}</option>)}
                            </select>
                          ) : <span style={{ fontSize:11, color:"#9CA3AF" }}>No edit entries found</span>
                        )}
                        {e.isRework && e.linkedToTitle && <span style={{ fontSize:10, fontWeight:700, color:"#B45309", whiteSpace:"nowrap" }}>→ {e.linkedToTitle}</span>}
                      </div>
                      <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:8, marginBottom:8 }}>
                        <div>
                          <label style={L}>Client Name</label>
                          <ClientSelector
                            label=""
                            value={e.clientName}
                            clientOptions={activeClientOptions}
                            pastClientOptions={pastClientOptions}
                            placeholder="Select client…"
                            onValueChange={v => patchNmEdit(e.id, { clientName: v })}
                          />
                        </div>
                        <div>
                          <label style={L}>Video Type</label>
                          <div style={{ position:"relative" }}>
                            <select value={e.videoType} onChange={ev => patchNmEdit(e.id, { videoType: ev.target.value })} style={{ ...F, paddingRight:28, appearance:"none" }}>
                              <option value="">Select type…</option>
                              <option value="AI GENERATED">AI Generated</option>
                              <option value="SIMPLE EDIT">Simple Edit</option>
                              <option value="EDIT + AI">Edit + AI</option>
                            </select>
                            <ChevronDown size={11} style={{ position:"absolute", right:10, top:"50%", transform:"translateY(-50%)", color:"#9CA3AF", pointerEvents:"none" }} />
                          </div>
                        </div>
                      </div>
                      <div style={{ marginBottom:8 }}>
                        <label style={L}>Video Name</label>
                        <input value={e.title} onChange={ev => patchNmEdit(e.id, { title: ev.target.value })} placeholder="Video or project name" style={F} />
                      </div>
                      <div style={{ marginBottom:8 }}>
                        <label style={L}>⏱ Editing Time</label>
                        <div style={{ display:"flex", alignItems:"center", gap:8, flexWrap:"wrap" }}>
                          <TimePicker value={e.startTime} onChange={v => patchNmEdit(e.id, { startTime: v })} />
                          <span style={{ fontSize:11, color:"#9CA3AF", flexShrink:0 }}>to</span>
                          <TimePicker value={e.endTime} onChange={v => patchNmEdit(e.id, { endTime: v })} />
                          {dur > 0 && <span style={{ fontSize:10, fontWeight:700, padding:"3px 8px", borderRadius:99, background:"rgba(13,148,136,0.1)", color:"#0D9488" }}>{fmtTravel(dur)}</span>}
                        </div>
                      </div>
                      <div style={{ marginBottom:8 }}>
                        <label style={L}>Notes</label>
                        <input value={e.notes} onChange={ev => patchNmEdit(e.id, { notes: ev.target.value })} placeholder="Edit details…" style={F} />
                      </div>
                      {teamMembers.length > 0 && (
                        <div style={{ paddingTop:8, borderTop:"1px dashed #EBEDF2" }}>
                          <p style={{ fontSize:10, fontWeight:700, color:"#9CA3AF", textTransform:"uppercase", letterSpacing:"0.07em", margin:"0 0 7px" }}>👥 Edited With</p>
                          <div style={{ position:"relative" }}>
                            <select value="" onChange={ev => { const id = ev.target.value; if (id && !e.participantIds.includes(id)) patchNmEdit(e.id, { participantIds: [...e.participantIds, id] }) }}
                              style={{ width:"100%", fontSize:12, fontWeight:600, color:"#374151", background:"#fff", border:"1.5px solid #EBEDF2", borderRadius:10, padding:"8px 28px 8px 10px", cursor:"pointer", outline:"none", appearance:"none" }}>
                              <option value="">Add teammate…</option>
                              {teamMembers.filter(m => !e.participantIds.includes(m.id)).map(m => (
                                <option key={m.id} value={m.id}>{m.name}</option>
                              ))}
                            </select>
                            <ChevronDown size={11} style={{ position:"absolute", right:10, top:"50%", transform:"translateY(-50%)", color:"#9CA3AF", pointerEvents:"none" }} />
                          </div>
                          {e.participantIds.length > 0 && (
                            <div style={{ display:"flex", flexWrap:"wrap", gap:4, marginTop:6 }}>
                              {e.participantIds.map(pid => {
                                const m = teamMembers.find(t => t.id === pid)
                                if (!m) return null
                                const initials = m.name.split(" ").map((n:string) => n[0]).join("").slice(0,2).toUpperCase()
                                return (
                                  <button key={pid} type="button"
                                    onClick={() => patchNmEdit(e.id, { participantIds: e.participantIds.filter(p => p !== pid) })}
                                    style={{ display:"flex", alignItems:"center", gap:4, padding:"3px 8px 3px 5px", borderRadius:99, background:"rgba(13,148,136,0.1)", border:"1.5px solid rgba(13,148,136,0.3)", cursor:"pointer" }}>
                                    <div style={{ width:16, height:16, borderRadius:"50%", background:"#0D9488", display:"flex", alignItems:"center", justifyContent:"center", fontSize:7, fontWeight:900, color:"#fff" }}>{initials}</div>
                                    <span style={{ fontSize:10, fontWeight:700, color:"#0F766E" }}>{m.name.split(" ")[0]}</span>
                                    <span style={{ fontSize:8, color:"#5EEAD4" }}>✕</span>
                                  </button>
                                )
                              })}
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  )
                })}
                  </div>
                )}
                {nmEdits.length > 0 && (
                  <button onClick={addNmEdit} style={{ marginTop:12, display:"flex", alignItems:"center", gap:6, padding:"9px 18px", borderRadius:10, border:"1.5px dashed rgba(13,148,136,0.4)", background:"rgba(13,148,136,0.04)", color:"#0D9488", fontSize:12, fontWeight:700, cursor:"pointer", width:"100%" }}>
                    <Plus size={13} /> Add Another Editing
                  </button>
                )}
              </div>}

              {/* Submit button for non-media team */}
              {!isMediaTeam && (
                <div style={{ marginTop:16, paddingTop:14, borderTop:"1px solid #EBEDF2", display:"flex", alignItems:"center", justifyContent:"space-between", gap:12, flexWrap:"wrap" }}>
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
                <p style={{ fontSize:11, marginTop:16, color:"#9CA3AF", textAlign:"center" }}>
                  Saved entries appear in your{" "}
                  <a href="/member/history" style={{ color:"#6366F1", fontWeight:600 }}>History tab ↗</a>
                </p>
              )}
            </div>
          )}

          {/* ══ MEDIA TAB: Shoots + Edits ═════════════════════════════════════ */}
          {tab === "media" && (<>

            {/* ── Media Stats Row ─────────────────────────────────────────── */}
            {(() => {
              // When past date selected, prefer activeUpdate.work_entries over live state
              const actUpd = activeUpdate as Record<string,unknown> | null
              const srEntries = Array.isArray(actUpd?.work_entries)
                ? actUpd!.work_entries as Array<Record<string,unknown>>
                : null
              const srShoots     = srEntries ? srEntries.filter(e => e.task_type === "shoot") : null
              const srEdits      = srEntries ? srEntries.filter(e => e.task_type === "edit")  : null
              // Fallback chain: work_entries → summary columns → live state
              const srShootCount = srShoots && srShoots.length > 0
                ? srShoots.length
                : (Number(actUpd?.shoot_count) || shoots.length)
              const srEditCount  = srEdits && srEdits.length > 0
                ? srEdits.length
                : (Number(actUpd?.editing_count) || edits.length)
              const srShootH = srShoots && srShoots.length > 0
                ? srShoots.reduce((s,e) => s + (Number(e.duration_hours)||0), 0)
                : (Number(actUpd?.shoot_time_hours) || totalShootHours)
              const srTravelH = srShoots && srShoots.length > 0
                ? srShoots.reduce((s,e) => s + (Number((e as Record<string,unknown>)._travel_hours)||0), 0)
                : totalTravelHours
              return (
                <div style={{ display:"grid", gridTemplateColumns:"repeat(4, 1fr)", gap:10 }}>
                  {[
                    { label:"SHOOTS",       value:`${srShootCount}`,              color:"#DE1A1A", bg:"rgba(222,26,26,0.07)",   icon:"📸" },
                    { label:"HRS SHOOTING", value:`${srShootH}h`,                 color:"#EF4444", bg:"rgba(239,68,68,0.07)",   icon:"🎥" },
                    { label:"TRAVEL HRS",   value: fmtTravel(srTravelH) ?? "0",  color:"#F59E0B", bg:"rgba(245,158,11,0.07)",  icon:"🚗" },
                    { label:"EDITED COUNT", value:`${srEditCount}`,               color:"#6366F1", bg:"rgba(99,102,241,0.07)",  icon:"🎬" },
                  ].map(s => (
                    <div key={s.label} style={{ background:"#FFFFFF", borderRadius:16, border:`1.5px solid ${s.color}22`, padding:"14px 12px", textAlign:"center", boxShadow:"0 2px 8px rgba(0,0,0,0.04)" }}>
                      <div style={{ fontSize:20, marginBottom:4 }}>{s.icon}</div>
                      <p style={{ fontSize:20, fontWeight:900, color:s.color, margin:"0 0 3px", fontFamily:"var(--font-jakarta)", lineHeight:1 }}>{s.value}</p>
                      <p style={{ fontSize:9, fontWeight:800, color:"#9CA3AF", margin:0, textTransform:"uppercase", letterSpacing:"0.08em" }}>{s.label}</p>
                    </div>
                  ))}
                </div>
              )
            })()}

            {/* Shoots */}
            <div style={{ background:"#FFFFFF", borderRadius:20, border:"1px solid #EBEDF2", padding:"20px 22px", boxShadow:"0 2px 10px rgba(0,0,0,0.05)" }}>
              <SectionHead icon={<Camera size={16} style={{ color:"#EF4444" }} />} label="Shooting" count={shoots.length} color="#EF4444" />
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
                          <label style={{ display:"block", fontSize:10, fontWeight:700, color:"#374151", textTransform:"uppercase", letterSpacing:"0.1em", marginBottom:5 }}>Client Name *</label>
                          <ClientSelector
                            label=""
                            value={s.clientName}
                            clientOptions={activeClientOptions}
                            pastClientOptions={pastClientOptions}
                            placeholder="Select client…"
                            onValueChange={v => patchShoot(s.id, { clientName: v, brand:"", shopName:"" })}
                          />
                        </div>
                        <div>
                          <label style={{ display:"block", fontSize:10, fontWeight:700, color:"#374151", textTransform:"uppercase", letterSpacing:"0.1em", marginBottom:5 }}>Shoot Name *</label>
                          <input value={s.title} onChange={e => patchShoot(s.id, { title: e.target.value })} placeholder="e.g. Basketball Tournament Shoot" style={F} />
                        </div>
                      </div>



                      <div style={{ marginBottom:10 }}>
                        <label style={{ display:"block", fontSize:10, fontWeight:700, color:"#374151", textTransform:"uppercase", letterSpacing:"0.1em", marginBottom:5 }}>Shooting Time</label>
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
                            <div style={{ display:"inline-flex", alignItems:"center", gap:6, padding:"8px 14px", borderRadius:8, background:"rgba(99,102,241,0.06)", border:"1.5px solid rgba(99,102,241,0.2)" }}>
                              <span style={{ fontSize:13, fontWeight:700, color:"#4338CA" }}>
                                {fmtTravel(Math.max(0, s.durationHours - s.droneHours))}
                              </span>
                              <span style={{ fontSize:10, color:"#9CA3AF", fontWeight:500 }}>auto (total − drone)</span>
                            </div>
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
                          <label style={{ display:"block", fontSize:10, fontWeight:700, color:"#374151", textTransform:"uppercase", letterSpacing:"0.1em", marginBottom:5 }}>🚗 Travel Time *</label>
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
                      {/* Partner picker per shoot — all active MEMBER role users */}
                      {teamMembers.length > 0 && (
                        <div style={{ marginTop:10, paddingTop:10, borderTop:"1px dashed #F0F1F5" }}>
                          <p style={{ fontSize:10, fontWeight:700, color:"#9CA3AF", textTransform:"uppercase", letterSpacing:"0.07em", margin:"0 0 7px" }}>👥 Shot With</p>
                          <div style={{ position:"relative" }}>
                            <select value="" onChange={ev => {
                              const id = ev.target.value
                              if (id && !s.participantIds.includes(id))
                                patchShoot(s.id, { participantIds: [...s.participantIds, id] })
                            }} style={{ width:"100%", fontSize:12, fontWeight:600, color:"#374151", background:"#fff", border:"1.5px solid #EBEDF2", borderRadius:10, padding:"8px 28px 8px 10px", cursor:"pointer", outline:"none", appearance:"none" }}>
                              <option value="">Add teammate…</option>
                              {teamMembers.filter(m => !s.participantIds.includes(m.id)).map(m => (
                                <option key={m.id} value={m.id}>{m.name}</option>
                              ))}
                            </select>
                            <ChevronDown size={11} style={{ position:"absolute", right:10, top:"50%", transform:"translateY(-50%)", color:"#9CA3AF", pointerEvents:"none" }} />
                          </div>
                          {s.participantIds.length > 0 && (
                            <div style={{ display:"flex", flexWrap:"wrap", gap:4, marginTop:6 }}>
                              {s.participantIds.map(pid => {
                                const m = teamMembers.find(t => t.id === pid)
                                if (!m) return null
                                const initials = m.name.split(" ").map((n:string) => n[0]).join("").slice(0,2).toUpperCase()
                                return (
                                  <button key={pid} type="button" onClick={() => patchShoot(s.id, { participantIds: s.participantIds.filter(p => p !== pid) })}
                                    style={{ display:"flex", alignItems:"center", gap:4, padding:"3px 8px 3px 5px", borderRadius:99, background:"rgba(239,68,68,0.1)", border:"1.5px solid rgba(239,68,68,0.3)", cursor:"pointer" }}>
                                    <div style={{ width:16, height:16, borderRadius:"50%", background:"#EF4444", display:"flex", alignItems:"center", justifyContent:"center", fontSize:7, fontWeight:900, color:"#fff" }}>{initials}</div>
                                    <span style={{ fontSize:10, fontWeight:700, color:"#B91C1C" }}>{m.name.split(" ")[0]}</span>
                                    <span style={{ fontSize:8, color:"#EF4444" }}>✕</span>
                                  </button>
                                )
                              })}
                            </div>
                          )}
                        </div>
                      )}
                      {entryErrors[s.id] && (
                        <div style={{ margin:"8px 0 0", padding:"8px 12px", borderRadius:8, background:"rgba(239,68,68,0.08)", border:"1px solid rgba(239,68,68,0.25)", fontSize:11, fontWeight:600, color:"#DC2626" }}>
                          ⚠ {entryErrors[s.id]}
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
              <SectionHead icon={<Film size={16} style={{ color:"#6366F1" }} />} label="Editing" count={edits.length} color="#6366F1" />
              {edits.length === 0 ? (
                <div onClick={addEdit} style={{ display:"flex", flexDirection:"column", alignItems:"center", justifyContent:"center", gap:14, padding:"32px 0", borderRadius:16, border:"2px dashed #C7D2FE", background:"rgba(99,102,241,0.02)", cursor:"pointer" }}>
                  <div style={{ position:"relative", width:180, height:140 }}>
                    <Image src="/brand/video-editor-boy.png" alt="Editing" fill style={{ objectFit:"contain" }} />
                  </div>
                  <p style={{ fontSize:13, fontWeight:600, color:"#9CA3AF", margin:0 }}>No editing logged yet</p>
                  <span style={{ fontSize:12, color:"#FFFFFF", fontWeight:700, background:"#6366F1", padding:"9px 22px", borderRadius:10, boxShadow:"0 4px 14px rgba(99,102,241,0.35)" }}>+ Add edit</span>
                </div>
              ) : (
                <div style={{ display:"flex", flexDirection:"column", gap:12 }}>
                  {edits.map((e, i) => (
                    <div key={e.id} style={{ background:"#FAFBFC", borderRadius:14, border: e.isRework ? "1.5px solid rgba(245,158,11,0.4)" : "1px solid #F0F1F5", padding:"14px 16px" }}>
                      <div style={{ display:"flex", alignItems:"center", justifyContent:"space-between", marginBottom:10 }}>
                        <span style={{ fontSize:11, fontWeight:800, color:"#6366F1", textTransform:"uppercase", letterSpacing:"0.1em" }}>Edit #{i + 1}</span>
                        <button onClick={() => removeEdit(e.id)} style={{ width:26, height:26, borderRadius:8, background:"rgba(99,102,241,0.08)", border:"none", cursor:"pointer", display:"flex", alignItems:"center", justifyContent:"center" }}>
                          <Trash2 size={12} style={{ color:"#6366F1" }} />
                        </button>
                      </div>
                      {/* Revision toggle */}
                      <div style={{ display:"flex", alignItems:"center", gap:8, marginBottom:12, padding:"8px 12px", borderRadius:10, background: e.isRework ? "rgba(245,158,11,0.08)" : "rgba(99,102,241,0.04)", border: e.isRework ? "1px solid rgba(245,158,11,0.3)" : "1px solid rgba(99,102,241,0.1)" }}>
                        <button onClick={() => patchEdit(e.id, { isRework: !e.isRework, linkedToTitle:"", linkedToClient:"", linkedToDate:"" })}
                          style={{ display:"flex", alignItems:"center", gap:6, padding:"5px 12px", borderRadius:8, border:"none", cursor:"pointer", fontSize:11, fontWeight:700, background: e.isRework ? "rgba(245,158,11,0.2)" : "rgba(99,102,241,0.12)", color: e.isRework ? "#92400E" : "#4F46E5", whiteSpace:"nowrap", flexShrink:0 }}>
                          {e.isRework ? "✓ Revision" : "Revision of existing?"}
                        </button>
                        {e.isRework && (
                          past15Options.edits.length > 0 ? (
                            <select value={e.linkedToDate ? `${e.linkedToDate}||${e.linkedToClient}||${e.linkedToTitle}` : ""}
                              onChange={ev => {
                                const opt = past15Options.edits.find(o => o.key === ev.target.value)
                                if (opt) patchEdit(e.id, { linkedToTitle: opt.title, linkedToClient: opt.client, linkedToDate: opt.date })
                              }}
                              style={{ flex:1, fontSize:11, padding:"5px 8px", borderRadius:8, border:"1px solid rgba(245,158,11,0.4)", background:"#fff", color:"#374151", outline:"none" }}>
                              <option value="">Select original video (last 50 entries)…</option>
                              {past15Options.edits.map(o => <option key={o.key} value={o.key}>{o.label}</option>)}
                            </select>
                          ) : (
                            <span style={{ fontSize:11, color:"#9CA3AF" }}>No edit entries found</span>
                          )
                        )}
                        {e.isRework && e.linkedToTitle && (
                          <span style={{ fontSize:10, fontWeight:700, color:"#B45309", whiteSpace:"nowrap" }}>→ {e.linkedToTitle}</span>
                        )}
                      </div>
                      <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:10, marginBottom:10 }}>
                        <div>
                          <label style={{ display:"block", fontSize:10, fontWeight:700, color:"#374151", textTransform:"uppercase", letterSpacing:"0.1em", marginBottom:5 }}>Date Given</label>
                          <input type="date" max="2099-12-31" value={e.dateGiven} onChange={ev => patchEdit(e.id, { dateGiven: clampDate(ev.target.value) })} style={{ ...F, colorScheme:"light" }} />
                        </div>
                        <div>
                          <label style={{ display:"block", fontSize:10, fontWeight:700, color:"#374151", textTransform:"uppercase", letterSpacing:"0.1em", marginBottom:5 }}>Date Finished</label>
                          <input type="date" max="2099-12-31" value={e.dateFinished} onChange={ev => patchEdit(e.id, { dateFinished: clampDate(ev.target.value) })} style={{ ...F, colorScheme:"light" }} />
                        </div>
                      </div>
                      <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:10, marginBottom:10 }}>
                        <div>
                          <label style={{ display:"block", fontSize:10, fontWeight:700, color:"#374151", textTransform:"uppercase", letterSpacing:"0.1em", marginBottom:5 }}>Client Name *</label>
                          <ClientSelector
                            label=""
                            value={e.clientName}
                            clientOptions={activeClientOptions}
                            pastClientOptions={pastClientOptions}
                            placeholder="Select client…"
                            onValueChange={v => patchEdit(e.id, { clientName: v, brand:"" })}
                          />
                        </div>
                        <div>
                          <label style={{ display:"block", fontSize:10, fontWeight:700, color:"#374151", textTransform:"uppercase", letterSpacing:"0.1em", marginBottom:5 }}>Video Type</label>
                          <div style={{ position:"relative" }}>
                            <select value={e.videoType} onChange={ev => patchEdit(e.id, { videoType: ev.target.value })} style={{ ...F, paddingRight:28, appearance:"none" }}>
                              <option value="">Select type…</option>
                              {["ADVERTISEMENT","ADVERTISEMENT WITH HOOKS","LONG FORMAT VIDEO","CINEMATIC","PROMOTION VIDEOS","INSTAGRAM REELS","YOUTUBE SHORTS","GREEN SCREEN EDITING","PERSONAL BRANDING"].map(t => <option key={t} value={t}>{t}</option>)}
                              <option value="__other__">✏️ Other (type…)</option>
                            </select>
                            <ChevronDown size={11} style={{ position:"absolute", right:10, top:"50%", transform:"translateY(-50%)", color:"#9CA3AF", pointerEvents:"none" }} />
                          </div>
                          {e.videoType === "__other__" && (
                            <input value={e.customVideoType} onChange={ev => patchEdit(e.id, { customVideoType: ev.target.value })} placeholder="Type video type…" style={{ ...F, marginTop:6, background:"rgba(99,102,241,0.05)", borderColor:"rgba(99,102,241,0.25)" }} />
                          )}
                        </div>
                      </div>
                      {/* Video Name — full width */}
                      <div style={{ marginBottom:10 }}>
                        <label style={{ display:"block", fontSize:10, fontWeight:700, color:"#374151", textTransform:"uppercase", letterSpacing:"0.1em", marginBottom:5 }}>Video Name *</label>
                        <input value={e.title} onChange={ev => patchEdit(e.id, { title: ev.target.value })} placeholder="e.g. Evan Styles Makeover Reel" style={F} />
                      </div>
                      {/* Video Length left, Revisions+Hooks centered in remaining space; mobile: Video Length full-width own line */}
                      <div style={{ display:"flex", flexWrap:"wrap", alignItems:"flex-start", marginBottom:10, gap:8 }}>
                        <div className="w-full md:w-auto">
                          <label style={{ display:"block", fontSize:10, fontWeight:700, color:"#374151", textTransform:"uppercase", letterSpacing:"0.1em", marginBottom:5 }}>Video Length</label>
                          <VideoDurationPicker value={e.videoDuration} onChange={v => patchEdit(e.id, { videoDuration: v })} />
                        </div>
                        <div className="flex justify-start md:justify-center" style={{ flex:1, gap:8, alignItems:"flex-start" }}>
                          <div style={{ width:80, flexShrink:0 }}>
                            <label style={{ display:"block", fontSize:10, fontWeight:700, color:"#374151", textTransform:"uppercase", letterSpacing:"0.1em", marginBottom:5 }}>Revisions</label>
                            <input type="number" min="0" max="99" value={e.revisions} onChange={ev => patchEdit(e.id, { revisions: parseInt(ev.target.value) || 0 })} placeholder="0" style={F} />
                          </div>
                          <div style={{ width:80, flexShrink:0 }}>
                            <label style={{ display:"block", fontSize:10, fontWeight:700, color:"#374151", textTransform:"uppercase", letterSpacing:"0.1em", marginBottom:5 }}>🪝 Hooks</label>
                            <input type="number" min="0" max="99" step="1" value={e.hooksCompleted} onChange={ev => patchEdit(e.id, { hooksCompleted: Math.max(0, Math.floor(parseInt(ev.target.value) || 0)) })} placeholder="0" style={F} />
                          </div>
                        </div>
                      </div>
                      {/* ── Editing time window (for shoot overlap detection) ── */}
                      <div style={{ marginBottom:8 }}>
                        <label style={{ display:"block", fontSize:10, fontWeight:700, color:"#374151", textTransform:"uppercase", letterSpacing:"0.1em", marginBottom:5 }}>✏️ Editing Time</label>
                        <div style={{ display:"flex", alignItems:"center", gap:8, flexWrap:"wrap" }}>
                          <TimePicker value={e.startTime} onChange={v => patchEdit(e.id, { startTime: v })} />
                          <span style={{ fontSize:11, color:"#9CA3AF", flexShrink:0 }}>to</span>
                          <TimePicker value={e.endTime} onChange={v => patchEdit(e.id, { endTime: v })} />
                          <div style={{ display:"inline-flex", alignItems:"center", gap:6, padding:"6px 10px", borderRadius:8, background:calcDuration(e.startTime, e.endTime)>0?"rgba(222,26,26,0.06)":"#F9FAFB", border:calcDuration(e.startTime, e.endTime)>0?"1.5px solid rgba(222,26,26,0.2)":"1.5px solid #EBEDF2" }}>
                            <span style={{ fontSize:12, fontWeight:700, color:calcDuration(e.startTime, e.endTime)>0?"#DE1A1A":"#9CA3AF" }}>{calcDuration(e.startTime, e.endTime)>0?fmtTravel(calcDuration(e.startTime, e.endTime)):"—"}</span>
                            <span style={{ fontSize:10, color:"#9CA3AF", fontWeight:500 }}>auto</span>
                          </div>
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
                      <div style={{ marginBottom:10 }}>
                        <label style={{ display:"block", fontSize:10, fontWeight:700, color:"#374151", textTransform:"uppercase", letterSpacing:"0.1em", marginBottom:5 }}>Notes</label>
                        <input value={e.notes} onChange={ev => patchEdit(e.id, { notes: ev.target.value })} placeholder="Software used, challenges…" style={F} />
                      </div>
                      <div style={{ marginBottom:10 }}>
                        <label style={{ display:"block", fontSize:10, fontWeight:700, color:"#374151", textTransform:"uppercase", letterSpacing:"0.1em", marginBottom:5 }}>
                          <Link2 size={9} style={{ display:"inline", marginRight:4 }} />Drive / Video Link *
                        </label>
                        <input value={e.videoLink} onChange={ev => patchEdit(e.id, { videoLink: ev.target.value })} placeholder="https://drive.google.com/…" style={F} />
                      </div>
                      <div>
                        <button onClick={() => patchEdit(e.id, { driveUpdated: !e.driveUpdated })}
                          style={{ display:"flex", alignItems:"center", gap:6, padding:"9px 14px", borderRadius:10, border:"1.5px solid", cursor:"pointer", fontSize:11, fontWeight:700, whiteSpace:"nowrap", background: e.driveUpdated ? "rgba(34,197,94,0.1)" : "#F9FAFB", borderColor: e.driveUpdated ? "rgba(34,197,94,0.4)" : "#EBEDF2", color: e.driveUpdated ? "#16A34A" : "#9CA3AF" }}>
                          <Upload size={12} /> {e.driveUpdated ? "Drive Updated ✓" : "Drive Updated?"}
                        </button>
                      </div>
                      {entryErrors[e.id] && (
                        <div style={{ margin:"8px 0 0", padding:"8px 12px", borderRadius:8, background:"rgba(239,68,68,0.08)", border:"1px solid rgba(239,68,68,0.25)", fontSize:11, fontWeight:600, color:"#DC2626" }}>
                          ⚠ {entryErrors[e.id]}
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
                        : `${nonMediaBreaks.length} break${nonMediaBreaks.length !== 1 ? "s" : ""} · ${nonMediaBreaks.reduce((s,b) => s + b.durationHours, 0).toFixed(1)}h total`
                      } · {isPastDate ? "synced to past attendance" : "synced to attendance"}
                    </p>
                  </div>
                </div>
                {(isMediaTeam ? mediaBreaks.length : nonMediaBreaks.length) > 0 && (
                  <button onClick={isMediaTeam ? addMediaBreak : addNonMediaBreak}
                    style={{ display:"flex", alignItems:"center", gap:6, padding:"8px 14px", borderRadius:10, border:"1.5px solid rgba(245,158,11,0.4)", background:"#FEF3C7", color:"#D97706", fontSize:12, fontWeight:700, cursor:"pointer" }}>
                    <Plus size={13} /> Add Break
                  </button>
                )}
              </div>

              {/* Media breaks */}
              {isMediaTeam && (mediaBreaks.length === 0 ? (
                <div style={{ display:"flex", flexDirection:"column", alignItems:"center", justifyContent:"center", padding:"48px 24px", border:"2px dashed rgba(245,158,11,0.3)", borderRadius:16, background:"#FFFBEB" }}>
                  <span style={{ fontSize:36, marginBottom:12 }}>☕</span>
                  <p style={{ fontSize:13, fontWeight:700, color:"#374151", margin:"0 0 4px" }}>No breaks logged yet</p>
                  <p style={{ fontSize:12, color:"#9CA3AF", margin:"0 0 16px", textAlign:"center" }}>Click &quot;Add First Break&quot; to log a break.</p>
                  <button onClick={addMediaBreak}
                    style={{ display:"flex", alignItems:"center", gap:6, padding:"10px 22px", borderRadius:12, border:"none", background:"#D97706", color:"#FFFFFF", fontSize:12, fontWeight:700, cursor:"pointer" }}>
                    <Plus size={13} /> Add First Break
                  </button>
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
                      <select value={b.label} onChange={e => patchMediaBreak(b.id, { label: e.target.value, customLabel: "" })}
                        style={{ fontSize:11, fontWeight:700, color:"#D97706", background:"#FEF3C7", border:"1.5px solid rgba(245,158,11,0.35)", borderRadius:8, padding:"4px 10px", cursor:"pointer", outline:"none" }}>
                        <option value="Tea">☕ Tea</option>
                        <option value="Lunch Break">🍱 Lunch Break</option>
                        <option value="Personal">🏠 Personal</option>
                        <option value="Short Break">🚶 Short Break</option>
                        <option value="Early Logoff">🌙 Early Logoff</option>
                        <option value="Late Login">⏰ Late Login</option>
                      </select>
                      <button onClick={() => removeMediaBreak(b.id)} style={{ marginLeft:"auto", background:"none", border:"none", cursor:"pointer", padding:4, borderRadius:8, display:"flex", flexShrink:0 }}>
                        <Trash2 size={13} style={{ color:"#EF4444" }} />
                      </button>
                    </div>
                  ))}
                </div>
              ))}

              {/* Non-media breaks — own state, same pattern as media breaks */}
              {!isMediaTeam && (nonMediaBreaks.length === 0 ? (
                <div style={{ display:"flex", flexDirection:"column", alignItems:"center", justifyContent:"center", padding:"48px 24px", border:"2px dashed rgba(245,158,11,0.3)", borderRadius:16, background:"#FFFBEB" }}>
                  <span style={{ fontSize:36, marginBottom:12 }}>☕</span>
                  <p style={{ fontSize:13, fontWeight:700, color:"#374151", margin:"0 0 4px" }}>No breaks logged yet</p>
                  <p style={{ fontSize:12, color:"#9CA3AF", margin:"0 0 16px", textAlign:"center" }}>Click &quot;Add First Break&quot; to log a break.</p>
                  <button onClick={addNonMediaBreak}
                    style={{ display:"flex", alignItems:"center", gap:6, padding:"10px 22px", borderRadius:12, border:"none", background:"#D97706", color:"#FFFFFF", fontSize:12, fontWeight:700, cursor:"pointer" }}>
                    <Plus size={13} /> Add First Break
                  </button>
                </div>
              ) : (
                <div style={{ display:"flex", flexDirection:"column", gap:8 }}>
                  {nonMediaBreaks.map((b, i) => (
                    <div key={b.id} style={{ background:"#FFFBEB", borderRadius:12, border:"1.5px solid rgba(245,158,11,0.3)", padding:"10px 14px", display:"flex", alignItems:"center", gap:10, flexWrap:"wrap" }}>
                      <span style={{ fontSize:11, fontWeight:800, color:"#D97706", flexShrink:0 }}>☕ #{i+1}</span>
                      <TimePicker value={b.startTime} onChange={v => patchNonMediaBreak(b.id, { startTime: v })} />
                      <span style={{ fontSize:11, color:"#9CA3AF", flexShrink:0 }}>to</span>
                      <TimePicker value={b.endTime} onChange={v => patchNonMediaBreak(b.id, { endTime: v })} />
                      {b.durationHours > 0 && (
                        <span style={{ fontSize:10, fontWeight:700, padding:"3px 8px", borderRadius:99, background:"rgba(245,158,11,0.12)", color:"#D97706" }}>{fmtTravel(b.durationHours)}</span>
                      )}
                      <select value={b.label} onChange={e => patchNonMediaBreak(b.id, { label: e.target.value, customLabel: "" })}
                        style={{ fontSize:11, fontWeight:700, color:"#D97706", background:"#FEF3C7", border:"1.5px solid rgba(245,158,11,0.35)", borderRadius:8, padding:"4px 10px", cursor:"pointer", outline:"none" }}>
                        <option value="Tea">☕ Tea</option>
                        <option value="Lunch Break">🍱 Lunch Break</option>
                        <option value="Personal">🏠 Personal</option>
                        <option value="Short Break">🚶 Short Break</option>
                        <option value="Early Logoff">🌙 Early Logoff</option>
                        <option value="Late Login">⏰ Late Login</option>
                      </select>
                      <button onClick={() => removeNonMediaBreak(b.id)} style={{ marginLeft:"auto", background:"none", border:"none", cursor:"pointer", padding:4, borderRadius:8, display:"flex", flexShrink:0 }}>
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
              <div style={{ display:"flex", alignItems:"center", justifyContent:"space-between", marginBottom:20 }}>
                <div style={{ display:"flex", alignItems:"center", gap:10 }}>
                  <div style={{ width:34, height:34, borderRadius:10, background:"rgba(16,185,129,0.1)", display:"flex", alignItems:"center", justifyContent:"center" }}>
                    <BookOpen size={16} style={{ color:"#10B981" }} />
                  </div>
                  <div>
                    <p style={{ fontSize:14, fontWeight:800, color:"#111111", margin:0 }}>Learning Today</p>
                    <p style={{ fontSize:10, color:"#9CA3AF", margin:0 }}>{learningDone ? `${learningHours}h logged` : "Skills & growth"}</p>
                  </div>
                </div>
              </div>
              {!learningStarted && !learningDone ? (
                <div style={{ display:"flex", flexDirection:"column", alignItems:"center", justifyContent:"center", padding:"48px 24px", border:"2px dashed #D1FAE5", borderRadius:16, background:"#F0FDF4" }}>
                  <span style={{ fontSize:36, marginBottom:12 }}>📚</span>
                  <p style={{ fontSize:13, fontWeight:700, color:"#374151", margin:"0 0 4px" }}>No learning logged yet</p>
                  <p style={{ fontSize:12, color:"#9CA3AF", margin:"0 0 16px", textAlign:"center" }}>Click &quot;Add Learning&quot; to log what you learned today.</p>
                  <button onClick={() => setLearningStarted(true)}
                    style={{ display:"flex", alignItems:"center", gap:6, padding:"10px 22px", borderRadius:12, border:"none", background:"#10B981", color:"#FFFFFF", fontSize:12, fontWeight:700, cursor:"pointer" }}>
                    <Plus size={13} /> Add Learning
                  </button>
                </div>
              ) : (
              <div style={{ display:"flex", flexDirection:"column", gap:14 }}>
                {learningBlocks.map((blk, idx) => (
                  <div key={blk.id} style={{ border:"1.5px solid #EBEDF2", borderRadius:14, padding:"14px 16px", background:"#FCFEFD", display:"flex", flexDirection:"column", gap:12 }}>
                    <div style={{ display:"flex", alignItems:"center", justifyContent:"space-between" }}>
                      <span style={{ fontSize:11, fontWeight:800, color:"#10B981", textTransform:"uppercase", letterSpacing:"0.08em" }}>📘 Learning #{idx + 1}</span>
                      <button type="button" onClick={() => removeLearningBlock(blk.id)} title="Remove this learning"
                        style={{ width:26, height:26, borderRadius:8, border:"1.5px solid #FECACA", background:"#FEF2F2", display:"flex", alignItems:"center", justifyContent:"center", cursor:"pointer" }}>
                        <Trash2 size={13} style={{ color:"#EF4444" }} />
                      </button>
                    </div>
                    {/* For Client (dropdown) + Topic on same row */}
                    <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:10 }}>
                      <div>
                        <label style={{ display:"block", fontSize:10, fontWeight:700, color:"#374151", textTransform:"uppercase", letterSpacing:"0.1em", marginBottom:5 }}>For Client *</label>
                        <div style={{ position:"relative" }}>
                          <select value={blk.client} onChange={e => patchLearningBlock(blk.id, { client: e.target.value })}
                            style={{ ...F, paddingRight:28, appearance:"none" }}>
                            <option value="">Select client…</option>
                            <option value="GROFAST DIGITAL">GROFAST DIGITAL</option>
                            <option value="GROFAST AI">GROFAST AI</option>
                            <option value="KARTHICK BRANDS">KARTHICK BRANDS</option>
                          </select>
                          <ChevronDown size={11} style={{ position:"absolute", right:10, top:"50%", transform:"translateY(-50%)", color:"#9CA3AF", pointerEvents:"none" }} />
                        </div>
                      </div>
                      <div>
                        <label style={{ display:"block", fontSize:10, fontWeight:700, color:"#374151", textTransform:"uppercase", letterSpacing:"0.1em", marginBottom:5 }}>Topic / Course *</label>
                        <input value={blk.topic} onChange={e => patchLearningBlock(blk.id, { topic: e.target.value })} placeholder="e.g. DaVinci Resolve…" style={F} />
                      </div>
                    </div>
                    {/* Learning Time — matches Editing Time style */}
                    <div>
                      <label style={{ display:"block", fontSize:10, fontWeight:700, color:"#374151", textTransform:"uppercase", letterSpacing:"0.1em", marginBottom:5 }}>📘 Learning Time</label>
                      <div style={{ display:"flex", alignItems:"center", gap:8, flexWrap:"wrap" }}>
                        <TimePicker value={blk.from} onChange={v => patchLearningBlock(blk.id, { from: v })} />
                        <span style={{ fontSize:11, color:"#9CA3AF", flexShrink:0 }}>to</span>
                        <TimePicker value={blk.to} onChange={v => patchLearningBlock(blk.id, { to: v })} />
                        <div style={{ display:"inline-flex", alignItems:"center", gap:6, padding:"6px 10px", borderRadius:8, background:calcLearningHours(blk.from, blk.to)>0?"rgba(16,185,129,0.08)":"#F9FAFB", border:calcLearningHours(blk.from, blk.to)>0?"1.5px solid rgba(16,185,129,0.25)":"1.5px solid #EBEDF2" }}>
                          <span style={{ fontSize:12, fontWeight:700, color:calcLearningHours(blk.from, blk.to)>0?"#059669":"#9CA3AF" }}>{calcLearningHours(blk.from, blk.to)>0?fmtTravel(calcLearningHours(blk.from, blk.to)):"—"}</span>
                          <span style={{ fontSize:10, color:"#9CA3AF", fontWeight:500 }}>auto</span>
                        </div>
                      </div>
                    </div>
                    {/* Notes + Learned With — 70/30 on desktop, stacked on mobile */}
                    <div className={`grid ${teamMembers.length > 0 ? "md:grid-cols-[7fr_3fr]" : ""}`} style={{ gap:12, alignItems:"start" }}>
                      <div>
                        <label style={{ display:"block", fontSize:10, fontWeight:700, color:"#374151", textTransform:"uppercase", letterSpacing:"0.1em", marginBottom:5 }}>Notes</label>
                        <input value={blk.notes} onChange={e => patchLearningBlock(blk.id, { notes: e.target.value })} placeholder="Key takeaways, resources used…" style={F} />
                      </div>
                      {teamMembers.length > 0 && (
                        <div>
                          <p style={{ fontSize:10, fontWeight:700, color:"#9CA3AF", textTransform:"uppercase", letterSpacing:"0.07em", margin:"0 0 5px" }}>👥 Learned With</p>
                          <div style={{ position:"relative" }}>
                            <select value="" onChange={e => { const id = e.target.value; if (id && !learningParticipantIds.includes(id)) setLearningParticipantIds(prev => [...prev, id]) }}
                              style={{ width:"100%", fontSize:12, fontWeight:600, color:"#374151", background:"#fff", border:"1.5px solid #EBEDF2", borderRadius:10, padding:"8px 24px 8px 10px", cursor:"pointer", outline:"none", appearance:"none" }}>
                              <option value="">Add teammate…</option>
                              {teamMembers.filter(m => !learningParticipantIds.includes(m.id)).map(m => (
                                <option key={m.id} value={m.id}>{m.name}</option>
                              ))}
                            </select>
                            <ChevronDown size={11} style={{ position:"absolute", right:8, top:"50%", transform:"translateY(-50%)", color:"#9CA3AF", pointerEvents:"none" }} />
                          </div>
                          {learningParticipantIds.length > 0 && (
                            <div style={{ display:"flex", flexWrap:"wrap", gap:4, marginTop:6 }}>
                              {learningParticipantIds.map(pid => {
                                const m = teamMembers.find(t => t.id === pid)
                                if (!m) return null
                                const initials = m.name.split(" ").map((n: string) => n[0]).join("").slice(0, 2).toUpperCase()
                                return (
                                  <button key={pid} type="button" onClick={() => setLearningParticipantIds(prev => prev.filter(p => p !== pid))}
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
                  </div>
                ))}
                <button type="button" onClick={addLearningBlock}
                  style={{ display:"flex", alignItems:"center", justifyContent:"center", gap:6, padding:"11px", borderRadius:12, border:"1.5px dashed #10B981", background:"rgba(16,185,129,0.06)", color:"#059669", fontSize:12, fontWeight:700, cursor:"pointer" }}>
                  <Plus size={14} /> Add Another Learning
                </button>
              </div>
              )}
            </div>
          )}

          {/* ── Other Today section (Meeting/Teaching/Misc — both Media & Non-Media) ── */}
          {tab === "learning" && (
            <div style={{ background:"#FFFFFF", borderRadius:20, border:"1px solid #EBEDF2", padding:"20px 22px", boxShadow:"0 2px 10px rgba(0,0,0,0.05)" }}>
              <SectionHead icon={<span style={{ fontSize:16 }}>🗓️</span>} label="Other" count={others.length} color="#6B7280" />
              {others.length === 0 ? (
                <div onClick={addOther} style={{ display:"flex", flexDirection:"column", alignItems:"center", justifyContent:"center", gap:14, padding:"32px 0", borderRadius:16, border:"2px dashed rgba(107,114,128,0.3)", background:"rgba(107,114,128,0.03)", cursor:"pointer" }}>
                  <span style={{ fontSize:36 }}>🗓️</span>
                  <p style={{ fontSize:13, fontWeight:600, color:"#9CA3AF", margin:0 }}>No other activity logged yet</p>
                  <span style={{ fontSize:12, color:"#FFFFFF", fontWeight:700, background:"#6B7280", padding:"9px 22px", borderRadius:10, boxShadow:"0 4px 14px rgba(107,114,128,0.3)" }}>+ Add Other</span>
                </div>
              ) : (
                <div style={{ display:"flex", flexDirection:"column", gap:12 }}>
              {others.map((e, oi) => {
                const F: React.CSSProperties = { width:"100%", boxSizing:"border-box" as const, fontSize:12, padding:"8px 10px", borderRadius:8, border:"1.5px solid #EBEDF2", background:"#F9FAFB", color:"#111827", outline:"none" }
                const L: React.CSSProperties = { display:"block", fontSize:10, fontWeight:700, color:"#374151", textTransform:"uppercase" as const, letterSpacing:"0.1em", marginBottom:5 }
                const dur = calcDuration(e.startTime, e.endTime)
                return (
                  <div key={e.id} style={{ background:"#FAFBFC", borderRadius:14, border:"1px solid #F0F1F5", padding:"14px 16px" }}>
                    <div style={{ display:"flex", alignItems:"center", justifyContent:"space-between", marginBottom:12 }}>
                      <span style={{ fontSize:11, fontWeight:800, color:"#6B7280", textTransform:"uppercase", letterSpacing:"0.1em" }}>Other #{oi+1}</span>
                      <button onClick={() => removeOther(e.id)} style={{ width:26, height:26, borderRadius:8, border:"none", background:"rgba(107,114,128,0.1)", cursor:"pointer", display:"flex", alignItems:"center", justifyContent:"center" }}>
                        <Trash2 size={12} style={{ color:"#374151" }} />
                      </button>
                    </div>
                    <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:8, marginBottom:8 }}>
                      <div>
                        <label style={L}>Type</label>
                        <div style={{ position:"relative" }}>
                          <select value={e.otherType} onChange={ev => patchOther(e.id, { otherType: ev.target.value })}
                            style={{ ...F, paddingRight:28, appearance:"none" }}>
                            <option value="Meeting">Meeting</option>
                            <option value="Teaching">Teaching</option>
                            <option value="Other">Other</option>
                          </select>
                          <ChevronDown size={11} style={{ position:"absolute", right:10, top:"50%", transform:"translateY(-50%)", color:"#9CA3AF", pointerEvents:"none" }} />
                        </div>
                      </div>
                      <div>
                        <label style={L}>Title / What was it?</label>
                        <input value={e.title} onChange={ev => patchOther(e.id, { title: ev.target.value })} placeholder="e.g. Weekly Sync with Marketing Team" style={F} />
                      </div>
                    </div>
                    <div style={{ marginBottom:8 }}>
                      <label style={L}>Client Name</label>
                      <ClientSelector
                        label=""
                        value={e.clientName}
                        clientOptions={activeClientOptions}
                        pastClientOptions={pastClientOptions}
                        placeholder="Select client…"
                        onValueChange={v => patchOther(e.id, { clientName: v })}
                      />
                    </div>
                    <div style={{ marginBottom:8 }}>
                      <label style={L}>🗓️ Time</label>
                      <div style={{ display:"flex", alignItems:"center", gap:8, flexWrap:"wrap" }}>
                        <TimePicker value={e.startTime} onChange={v => patchOther(e.id, { startTime: v })} />
                        <span style={{ fontSize:11, color:"#9CA3AF", flexShrink:0 }}>to</span>
                        <TimePicker value={e.endTime} onChange={v => patchOther(e.id, { endTime: v })} />
                        {dur > 0 && <span style={{ fontSize:10, fontWeight:700, padding:"3px 8px", borderRadius:99, background:"rgba(107,114,128,0.12)", color:"#374151" }}>{fmtTravel(dur)}</span>}
                      </div>
                    </div>
                    <div style={{ marginBottom: teamMembers.length > 0 ? 8 : 0 }}>
                      <label style={L}>Notes</label>
                      <input value={e.notes} onChange={ev => patchOther(e.id, { notes: ev.target.value })} placeholder="What was discussed / covered…" style={F} />
                    </div>
                    {teamMembers.length > 0 && (
                      <div style={{ paddingTop:8, borderTop:"1px dashed #EBEDF2" }}>
                        <p style={{ fontSize:10, fontWeight:700, color:"#9CA3AF", textTransform:"uppercase", letterSpacing:"0.07em", margin:"0 0 7px" }}>👥 Worked With</p>
                        <div style={{ position:"relative" }}>
                          <select value="" onChange={ev => { const id = ev.target.value; if (id && !e.participantIds.includes(id)) patchOther(e.id, { participantIds: [...e.participantIds, id] }) }}
                            style={{ width:"100%", fontSize:12, fontWeight:600, color:"#374151", background:"#fff", border:"1.5px solid #EBEDF2", borderRadius:10, padding:"8px 28px 8px 10px", cursor:"pointer", outline:"none", appearance:"none" }}>
                            <option value="">Add teammate…</option>
                            {teamMembers.filter(m => !e.participantIds.includes(m.id)).map(m => (
                              <option key={m.id} value={m.id}>{m.name}</option>
                            ))}
                          </select>
                          <ChevronDown size={11} style={{ position:"absolute", right:10, top:"50%", transform:"translateY(-50%)", color:"#9CA3AF", pointerEvents:"none" }} />
                        </div>
                        {e.participantIds.length > 0 && (
                          <div style={{ display:"flex", flexWrap:"wrap", gap:4, marginTop:6 }}>
                            {e.participantIds.map(pid => {
                              const m = teamMembers.find(t => t.id === pid)
                              if (!m) return null
                              const initials = m.name.split(" ").map((n:string) => n[0]).join("").slice(0,2).toUpperCase()
                              return (
                                <button key={pid} type="button"
                                  onClick={() => patchOther(e.id, { participantIds: e.participantIds.filter(p => p !== pid) })}
                                  style={{ display:"flex", alignItems:"center", gap:4, padding:"3px 8px 3px 5px", borderRadius:99, background:"rgba(107,114,128,0.12)", border:"1.5px solid rgba(107,114,128,0.3)", cursor:"pointer" }}>
                                  <div style={{ width:16, height:16, borderRadius:"50%", background:"#6B7280", display:"flex", alignItems:"center", justifyContent:"center", fontSize:7, fontWeight:900, color:"#fff" }}>{initials}</div>
                                  <span style={{ fontSize:10, fontWeight:700, color:"#374151" }}>{m.name.split(" ")[0]}</span>
                                  <span style={{ fontSize:8, color:"#6B7280" }}>✕</span>
                                </button>
                              )
                            })}
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                )
              })}
                </div>
              )}
              {others.length > 0 && (
                <button onClick={addOther} style={{ marginTop:12, display:"flex", alignItems:"center", gap:6, padding:"9px 18px", borderRadius:10, border:"1.5px dashed rgba(107,114,128,0.4)", background:"rgba(107,114,128,0.04)", color:"#374151", fontSize:12, fontWeight:700, cursor:"pointer", width:"100%" }}>
                  <Plus size={13} /> Add Another
                </button>
              )}
            </div>
          )}

          {/* Submit button for non-media team — placed after Learning + Other so it's
              always the last thing on the page, not sandwiched between the two sections */}
          {!isMediaTeam && tab === "learning" && (learningStarted || learningDone || others.length > 0) && (
            <div style={{ background:"#FFFFFF", borderRadius:16, border:"1px solid #EBEDF2", padding:"14px 18px", display:"flex", alignItems:"center", justifyContent:"space-between", gap:12, boxShadow:"0 2px 10px rgba(0,0,0,0.05)", flexWrap:"wrap" }}>
              <div>
                {learningError && <p style={{ fontSize:12, fontWeight:600, color:"#DE1A1A", margin:0 }}>{learningError}</p>}
                {!learningError && <p style={{ fontSize:12, color:"#9CA3AF", margin:0 }}>Learning: {learningSummaryTopic || "not set"}{filledLearningBlocks.length > 1 ? ` +${filledLearningBlocks.length - 1} more` : ""} · {learningHours}h{others.length > 0 ? ` · ${others.length} other` : ""}</p>}
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
          {!isMediaTeam && tab === "learning" && (learningStarted || learningDone || others.length > 0) && (
            <p style={{ fontSize:11, color:"#9CA3AF", textAlign:"center" }}>
              Saved entries appear in your{" "}
              <a href="/member/history" style={{ color:"#6366F1", fontWeight:600 }}>History tab ↗</a>
            </p>
          )}

          {/* ── Submit bar ─────────────────────────────────────────────────── */}
          {(isMediaTeam || tab === "break") && (
            <div style={{ background:"#FFFFFF", borderRadius:16, border:"1px solid #EBEDF2", padding:"14px 18px", display:"flex", alignItems:"center", justifyContent:"space-between", gap:12, boxShadow:"0 2px 10px rgba(0,0,0,0.05)", flexWrap:"wrap" }}>
              <div>
                {tab === "media"   && <p style={{ fontSize:12, color:"#9CA3AF", margin:0 }}>{shoots.length} shoot{shoots.length !== 1 ? "s" : ""} · {edits.length} edit{edits.length !== 1 ? "s" : ""} · {totalMediaHours}h total</p>}
                {tab === "learning"&& <p style={{ fontSize:12, color:"#9CA3AF", margin:0 }}>Learning: {learningSummaryTopic || "not set"}{filledLearningBlocks.length > 1 ? ` +${filledLearningBlocks.length - 1} more` : ""} · {learningHours}h</p>}
                {tab === "break"   && <p style={{ fontSize:12, color:"#9CA3AF", margin:0 }}>
                  {isMediaTeam ? `${mediaBreaks.length} break${mediaBreaks.length !== 1 ? "s" : ""} · ${mediaBreaks.reduce((s,b) => s+b.durationHours,0).toFixed(1)}h` : `${nonMediaBreaks.length} break${nonMediaBreaks.length !== 1 ? "s" : ""} · ${nonMediaBreaks.reduce((s,b) => s+b.durationHours,0).toFixed(1)}h`}
                </p>}
                {/* handleSubmit routes the Learning tab to handleLearningSubmit, which sets
                    learningError (not error) on failure — show it here too, otherwise media
                    team members submitting from this shared bar see no error at all. */}
                {(tab === "learning" ? learningError : error) && (
                  <p style={{ fontSize:12, fontWeight:700, color:"#DE1A1A", margin:"4px 0 0" }}>⚠ {tab === "learning" ? learningError : error}</p>
                )}
              </div>
              <button onClick={handleSubmit} disabled={isPending || submitted || breakSubmitting}
                style={{ display:"flex", alignItems:"center", gap:8, padding:"11px 24px", borderRadius:14, fontSize:13, fontWeight:700, border:"none", cursor: isPending || submitted || breakSubmitting ? "not-allowed" : "pointer", transition:"all 0.2s", opacity: isPending || breakSubmitting ? 0.7 : 1,
                  background: submitted ? "#22C55E" : "#DE1A1A",
                  color:"#fff", boxShadow: submitted ? "0 4px 14px rgba(34,197,94,0.4)" : "0 4px 14px rgba(222,26,26,0.4)" }}>
                {isPending || breakSubmitting ? <Loader2 size={14} className="animate-spin" /> : submitted ? <CheckCircle2 size={14} /> : <SendHorizonal size={14} />}
                {isPending || breakSubmitting ? "Submitting…" : submitted ? "Submitted! ✓" : "Submit Daily Update"}
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
              {!isMediaTeam && tab === "working" && (() => {
                // Past date selected → show that date's data; else show today's submitted or live
                const sourceUpdate = activeUpdate ?? existingUpdate ?? null
                const srcEntries = Array.isArray((sourceUpdate as Record<string,unknown> | null)?.work_entries)
                  ? (sourceUpdate as Record<string,unknown>).work_entries as Array<Record<string,unknown>>
                  : null
                if (srcEntries) {
                  const workH  = srcEntries.filter(e => e.task_type === "other").reduce((s, e) => s + (Number(e.duration_hours) || 0), 0)
                  const breakH = srcEntries.filter(e => e.task_type === "break").reduce((s, e) => s + (Number(e.duration_hours) || 0), 0)
                  const voiceH = srcEntries.filter(e => e.task_type === "voiceover").reduce((s, e) => s + (Number(e.duration_hours) || 0), 0)
                  const postH  = srcEntries.filter(e => e.task_type === "poster").reduce((s, e) => s + (Number(e.duration_hours) || 0), 0)
                  const rows = [
                    { label:"Working",    value:`${workH.toFixed(1)}h`,  color: workH >= 8 ? "#22C55E" : workH > 0 ? "#111111" : "#9CA3AF" },
                    { label:"Break",      value:`${breakH.toFixed(1)}h`, color: breakH > 0 ? "#F59E0B" : "#9CA3AF" },
                    ...(voiceH > 0 ? [{ label:"Voiceover", value:`${voiceH.toFixed(1)}h`, color:"#8B5CF6" }] : []),
                    ...(postH  > 0 ? [{ label:"Poster",    value:`${postH.toFixed(1)}h`,  color:"#EC4899" }] : []),
                  ] as Array<{label:string;value:string;color:string}>
                  return (
                    <div style={{ display:"flex", flexDirection:"column", gap:9 }}>
                      <p style={{ fontSize:10, fontWeight:700, color:"#DE1A1A", textTransform:"uppercase", letterSpacing:"0.08em", margin:"0 0 2px" }}>
                        ⏰ Work Log {activeUpdate ? `· ${selectedDate}` : "✓"}
                      </p>
                      {rows.map((r,i) => (
                        <div key={i} style={{ display:"flex", alignItems:"center", justifyContent:"space-between" }}>
                          <span style={{ fontSize:11, color:"#9CA3AF" }}>{r.label}</span>
                          <span style={{ fontSize:11, fontWeight:700, color:r.color }}>{r.value}</span>
                        </div>
                      ))}
                    </div>
                  )
                }
                // Old format — working_hours stored directly on record
                if (sourceUpdate) {
                  const workH  = Number((sourceUpdate as Record<string,unknown>).working_hours) || 0
                  const learnH = Number((sourceUpdate as Record<string,unknown>).learning_hours) || 0
                  const rows = [
                    { label:"Working Hours", value:`${workH.toFixed(1)}h`,  color: workH >= 8 ? "#22C55E" : workH > 0 ? "#111111" : "#9CA3AF" },
                    { label:"Break Hours",   value:"—",                      color:"#9CA3AF" },
                    { label:"Learning",      value: learnH > 0 ? `${learnH.toFixed(1)}h` : "—", color:"#10B981" },
                  ] as Array<{label:string;value:string;color:string}>
                  return (
                    <div style={{ display:"flex", flexDirection:"column", gap:9 }}>
                      <p style={{ fontSize:10, fontWeight:700, color:"#DE1A1A", textTransform:"uppercase", letterSpacing:"0.08em", margin:"0 0 2px" }}>
                        ⏰ Work Log {activeUpdate ? `· ${selectedDate}` : "✓"}
                      </p>
                      {rows.map((r,i) => (
                        <div key={i} style={{ display:"flex", alignItems:"center", justifyContent:"space-between" }}>
                          <span style={{ fontSize:11, color:"#9CA3AF" }}>{r.label}</span>
                          <span style={{ fontSize:11, fontWeight:700, color:r.color }}>{r.value}</span>
                        </div>
                      ))}
                    </div>
                  )
                }
                // No submitted data — show live form stats
                return (
                  <div style={{ display:"flex", flexDirection:"column", gap:9 }}>
                    <p style={{ fontSize:10, fontWeight:700, color:"#DE1A1A", textTransform:"uppercase", letterSpacing:"0.08em", margin:"0 0 2px" }}>⏰ Work Log</p>
                    {((() => {
                      const workH  = timeBlocks.filter(b => !b.isBreak).reduce((s, b) => s + b.durationHours, 0)
                      const breakH = breakBlocks.reduce((s, b) => s + b.durationHours, 0)
                      return [
                        { label:"Working Hours", value:`${workH.toFixed(1)}h`,  color: workH >= 8 ? "#22C55E" : "#111111" },
                        { label:"Break Hours",   value:`${breakH.toFixed(1)}h`, color:"#F59E0B" },
                        { label:"Learning",      value: learningHours > 0 ? `${(learningHours as number).toFixed(1)}h` : "—", color:"#10B981" },
                      ]
                    })() as Array<{label:string;value:string;color:string}>).map((r,i) => (
                      <div key={i} style={{ display:"flex", alignItems:"center", justifyContent:"space-between" }}>
                        <span style={{ fontSize:11, color:"#9CA3AF" }}>{r.label}</span>
                        <span style={{ fontSize:11, fontWeight:700, color:r.color }}>{r.value}</span>
                      </div>
                    ))}
                  </div>
                )
              })()}
              {!isMediaTeam && tab === "learning" && (() => {
                const src = activeUpdate ?? (learningDone ? existingUpdate : null)
                const srcTopic = (src as Record<string,unknown> | null)?.learning_topic as string | null
                const srcHours = (src as Record<string,unknown> | null)?.learning_hours as number | null
                return (
                  <div style={{ display:"flex", flexDirection:"column", gap:9 }}>
                    <p style={{ fontSize:10, fontWeight:700, color:"#10B981", textTransform:"uppercase", letterSpacing:"0.08em", margin:"0 0 2px" }}>
                      📚 Learning{src ? " ✓" : ""}
                    </p>
                    {([
                      { label:"Topic", value: srcTopic || learningSummaryTopic || "Not set", color:"#10B981" },
                      { label:"Hours", value:`${srcHours ?? learningHours}h`,          color:"#6366F1" },
                    ] as Array<{label:string;value:string;color:string}>).map((r,i) => (
                      <div key={i} style={{ display:"flex", alignItems:"center", justifyContent:"space-between", marginBottom:4 }}>
                        <span style={{ fontSize:11, color:"#9CA3AF" }}>{r.label}</span>
                        <span style={{ fontSize:11, fontWeight:700, color:r.color, maxWidth:130, textOverflow:"ellipsis", overflow:"hidden", whiteSpace:"nowrap" }}>{r.value}</span>
                      </div>
                    ))}
                  </div>
                )
              })()}

              {(isMediaTeam && tab === "media") && (() => {
                // Read from activeUpdate.work_entries when a past date is selected (incl. edit mode)
                const ovUpd = activeUpdate as Record<string,unknown> | null
                const ovSrc = Array.isArray(ovUpd?.work_entries)
                  ? ovUpd!.work_entries as Array<Record<string,unknown>>
                  : null
                const ovShoots    = ovSrc ? ovSrc.filter(e => e.task_type === "shoot") : null
                const ovEdits     = ovSrc ? ovSrc.filter(e => e.task_type === "edit")  : null
                // Fallback chain: work_entries → summary columns → live state
                const ovShootLen  = ovShoots && ovShoots.length > 0
                  ? ovShoots.length
                  : (Number(ovUpd?.shoot_count) || shoots.length)
                const ovEditLen   = ovEdits && ovEdits.length > 0
                  ? ovEdits.length
                  : (Number(ovUpd?.editing_count) || edits.length)
                const ovShootH    = ovShoots && ovShoots.length > 0
                  ? ovShoots.reduce((s,e) => s + (Number(e.duration_hours)||0), 0)
                  : (Number(ovUpd?.shoot_time_hours) || totalShootHours)
                const ovEditH     = ovEdits && ovEdits.length > 0
                  ? ovEdits.reduce((s,e) => s + (Number(e.duration_hours)||0), 0)
                  : (Number(ovUpd?.editing_time_hours) || totalEditHours)
                const ovTotalH    = ovSrc && ovSrc.length > 0
                  ? ovSrc.filter(e => e.task_type !== "break").reduce((s,e) => s + (Number(e.duration_hours)||0), 0)
                  : ((Number(ovUpd?.shoot_time_hours) || totalShootHours) + (Number(ovUpd?.editing_time_hours) || totalEditHours))
                return (
                  <div style={{ display:"flex", flexDirection:"column", gap:9 }}>
                    {([
                      { label:"Shoots",      value:`${ovShootLen}`,    color: ovShootLen > 0 ? "#EF4444" : "#9CA3AF" },
                      { label:"Edits",       value:`${ovEditLen}`,     color: ovEditLen > 0  ? "#6366F1" : "#9CA3AF" },
                      { label:"Shoot Hours", value:`${ovShootH}h`,     color:"#EF4444" },
                      { label:"Edit Hours",  value:`${ovEditH}h`,      color:"#6366F1" },
                      { label:"Total Hours", value:`${ovTotalH}h`,     color: ovTotalH >= 8 ? "#22C55E" : "#111111" },
                    ] as Array<{label:string;value:string;color:string}>).map((r,i) => (
                      <div key={i} style={{ display:"flex", alignItems:"center", justifyContent:"space-between" }}>
                        <span style={{ fontSize:11, color:"#9CA3AF" }}>{r.label}</span>
                        <span style={{ fontSize:11, fontWeight:700, color:r.color }}>{r.value}</span>
                      </div>
                    ))}
                  </div>
                )
              })()}

              {(isMediaTeam && tab === "learning") && (
                <div style={{ display:"flex", flexDirection:"column", gap:9 }}>
                  {([
                    { label:"Topic",       value: learningSummaryTopic || "Not set", color:"#10B981" },
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

          {/* Past Updates removed */}
          {false && pastUpdates.length > 0 && (
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
                            if (!(await confirm("Delete this day's update? This cannot be undone."))) return
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

          {/* Worked With section removed — collaboration tracked per-entry */}

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

      {/* ── Unsaved changes navigation warning ── */}
      {pendingNav && (
        <div style={{
          position: "fixed", inset: 0, zIndex: 9998,
          background: "rgba(0,0,0,0.7)", backdropFilter: "blur(4px)",
          display: "flex", alignItems: "center", justifyContent: "center", padding: 24,
        }}>
          <div style={{
            background: "#fff", borderRadius: 20, padding: "28px 24px", maxWidth: 380, width: "100%",
            boxShadow: "0 24px 60px rgba(0,0,0,0.35)",
          }}>
            <div style={{ fontSize: 32, textAlign: "center", marginBottom: 12 }}>✋</div>
            <h3 style={{ fontSize: 17, fontWeight: 900, color: "#111", textAlign: "center", margin: "0 0 8px" }}>
              Unsaved Changes
            </h3>
            <p style={{ fontSize: 13, color: "#6B7280", textAlign: "center", margin: "0 0 24px", lineHeight: 1.6 }}>
              You have filled in details that haven&apos;t been submitted yet. Do you want to leave without saving?
            </p>
            <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
              <button
                onClick={() => setPendingNav(null)}
                style={{
                  padding: "12px 0", borderRadius: 12, border: "none",
                  background: "#DE1A1A", color: "#fff", fontSize: 14, fontWeight: 700,
                  cursor: "pointer",
                }}
              >
                Keep Editing
              </button>
              <button
                onClick={() => { setPendingNav(null); router.push(pendingNav) }}
                style={{
                  padding: "12px 0", borderRadius: 12,
                  border: "1.5px solid #E5E7EB", background: "transparent",
                  color: "#6B7280", fontSize: 13, fontWeight: 600, cursor: "pointer",
                }}
              >
                Leave Without Saving
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
