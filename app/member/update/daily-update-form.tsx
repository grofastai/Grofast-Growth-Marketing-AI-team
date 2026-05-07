"use client"

import { useState, useTransition } from "react"
import { useRouter } from "next/navigation"
import {
  Plus, Trash2, Loader2, BookOpen, Briefcase,
  Camera, ChevronDown,
  CheckCircle2, XCircle, AlertCircle,
  FolderOpen, ArrowLeft, Scissors,
} from "lucide-react"
import { submitDailyUpdate } from "@/lib/actions/daily-updates"
import type { WorkEntryInput, EditingVideo } from "@/lib/validations/daily-update"

interface Project { id: string; business_name: string }

type FlowStep = "type-select" | "count-select" | "form"
type FlowMode = "shoot" | "edit" | "learning"

// ── Helpers ────────────────────────────────────────────────────
function calcDuration(start: string, end: string): number {
  if (!start || !end) return 0
  const [sh, sm] = start.split(":").map(Number)
  const [eh, em] = end.split(":").map(Number)
  const mins = eh * 60 + em - (sh * 60 + sm)
  return mins <= 0 ? 0 : Math.round((mins / 60) * 10) / 10
}

const VIDEO_TYPES = [
  "Reel", "YouTube Video", "TikTok", "Ad / Commercial",
  "Short Film", "Documentary", "Story", "Other",
] as const

function newEditingVideo(): EditingVideo {
  return {
    id: crypto.randomUUID(),
    date_given: "", date_finished: "",
    video_name: "", client_id: null, client_name: "",
    duration: "", video_type: "",
    time_taken: 0, drive_updated: false, drive_link: "", revisions: 0,
  }
}

function newEntry(type: "shoot" | "edit" = "shoot"): WorkEntryInput {
  return {
    id: crypto.randomUUID(),
    client_id: null, client_name: "",
    task_type: type,
    title: type === "shoot" ? "Shoot Session" : "Editing Session",
    start_time: "", end_time: "", duration_hours: 0,
    notes: "",
    video_uploaded: false, screenshot_url: "",
    petrol_expense: undefined,
    other_expense: undefined,
    travel_time: "",
    video_link: "", editing_videos: [],
  }
}

// ── Style constants ────────────────────────────────────────────
const FIELD: React.CSSProperties = {
  background: "#F4F5F7", border: "1px solid #E5E7EB",
  color: "#111111", borderRadius: "10px",
  padding: "10px 14px", fontSize: "13px",
  outline: "none", width: "100%",
}
const LABEL: React.CSSProperties = {
  display: "block", fontSize: "10px", fontWeight: 700,
  textTransform: "uppercase", letterSpacing: "0.16em",
  marginBottom: "6px", color: "#6B7280",
}

// ── Proof Upload ───────────────────────────────────────────────
// ── Client select ──────────────────────────────────────────────
function ClientSelect({ projects, value, onChange, required }: {
  projects: Project[]
  value: string
  onChange: (id: string, name: string) => void
  required?: boolean
}) {
  return (
    <div>
      <label style={LABEL}>
        Client {required && <span style={{ color: "#de1a1a" }}>*</span>}
      </label>
      {projects.length > 0 ? (
        <div className="relative">
          <select
            value={value}
            onChange={(e) => {
              const proj = projects.find((p) => p.id === e.target.value)
              onChange(e.target.value, proj?.business_name ?? "")
            }}
            style={{ ...FIELD, appearance: "none", paddingRight: "36px" }}
            className="du-sel">
            <option value="">Select client…</option>
            {projects.map((p) => (
              <option key={p.id} value={p.id}>{p.business_name}</option>
            ))}
          </select>
          <ChevronDown size={13} className="absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none"
            style={{ color: "#6B7280" }} />
        </div>
      ) : (
        <input style={FIELD} placeholder="Client name" className="du"
          value={value}
          onChange={(e) => onChange("", e.target.value)} />
      )}
    </div>
  )
}


// ── Shoot card ─────────────────────────────────────────────────
function ShootCard({ entry, i, projects, onChange, onRemove }: {
  entry: WorkEntryInput
  i: number
  projects: Project[]
  onChange: (patch: Partial<WorkEntryInput>) => void
  onRemove: () => void
}) {
  return (
    <div className="rounded-2xl overflow-hidden"
      style={{ border: "1px solid rgba(222,26,26,0.2)", boxShadow: "0 2px 8px rgba(222,26,26,0.06)" }}>

      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3"
        style={{ background: "rgba(222,26,26,0.06)", borderBottom: "1px solid rgba(222,26,26,0.12)" }}>
        <div className="flex items-center gap-2">
          <div className="w-7 h-7 rounded-lg flex items-center justify-center"
            style={{ background: "rgba(222,26,26,0.15)" }}>
            <Camera size={14} style={{ color: "#de1a1a" }} />
          </div>
          <span className="text-[13px] font-black" style={{ fontFamily: "var(--font-jakarta)", color: "#de1a1a" }}>
            SHOOT {i + 1}
          </span>
        </div>
        <button type="button" onClick={onRemove}
          className="w-7 h-7 rounded-lg flex items-center justify-center transition-all"
          style={{ background: "rgba(222,26,26,0.08)", border: "1px solid rgba(222,26,26,0.15)" }}>
          <Trash2 size={12} style={{ color: "#de1a1a" }} />
        </button>
      </div>

      <div className="p-4 space-y-4" style={{ background: "#FFFFFF" }}>
        {/* Client */}
        <ClientSelect
          projects={projects}
          value={entry.client_id ?? ""}
          onChange={(id, name) => onChange({ client_id: id || null, client_name: name })}
          required
        />

        {/* Timing row */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
          <div>
            <label style={LABEL}>Start Time <span style={{ color: "#de1a1a" }}>*</span></label>
            <input type="time" className="du" style={FIELD}
              value={entry.start_time}
              onChange={(e) => {
                const dur = calcDuration(e.target.value, entry.end_time)
                onChange({ start_time: e.target.value, duration_hours: dur })
              }} />
          </div>
          <div>
            <label style={LABEL}>End Time <span style={{ color: "#de1a1a" }}>*</span></label>
            <input type="time" className="du" style={FIELD}
              value={entry.end_time}
              onChange={(e) => {
                const dur = calcDuration(entry.start_time, e.target.value)
                onChange({ end_time: e.target.value, duration_hours: dur })
              }} />
          </div>
          <div>
            <label style={LABEL}>Duration</label>
            <div className="flex items-center justify-center rounded-[10px] text-[15px] font-black"
              style={{
                height: "42px", background: "#F4F5F7", border: "1px solid #E5E7EB",
                color: entry.duration_hours > 0 ? "#de1a1a" : "#D1D5DB",
              }}>
              {entry.duration_hours > 0 ? `${entry.duration_hours}h` : "—"}
            </div>
          </div>
        </div>

        {/* Travel time */}
        <div>
          <label style={LABEL}>Travel Time</label>
          <div className="relative">
            <select
              className="du-sel"
              style={{ ...FIELD, appearance: "none", paddingRight: "36px" }}
              value={entry.travel_time ?? ""}
              onChange={(e) => onChange({ travel_time: e.target.value })}
            >
              <option value="">No travel</option>
              <option value="15 mins">15 mins</option>
              <option value="30 mins">30 mins</option>
              <option value="45 mins">45 mins</option>
              <option value="1 hour">1 hour</option>
              <option value="1.5 hours">1.5 hours</option>
              <option value="2 hours">2 hours</option>
              <option value="2.5 hours">2.5 hours</option>
              <option value="3 hours">3 hours</option>
              <option value="3+ hours">3+ hours</option>
            </select>
            <ChevronDown size={13} className="absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none"
              style={{ color: "#6B7280" }} />
          </div>
        </div>

        {/* Expenses row */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div>
            <label style={LABEL}>Petrol Expense (₹)</label>
            <input type="number" min="0" step="1" className="du" style={FIELD}
              placeholder="e.g. 250"
              value={entry.petrol_expense ?? ""}
              onChange={(e) => onChange({ petrol_expense: parseFloat(e.target.value) || undefined })} />
          </div>
          <div>
            <label style={LABEL}>Other Expense (₹)</label>
            <input type="number" min="0" step="1" className="du" style={FIELD}
              placeholder="e.g. 100"
              value={entry.other_expense ?? ""}
              onChange={(e) => onChange({ other_expense: parseFloat(e.target.value) || undefined })} />
          </div>
        </div>

        {/* Google Drive link — required */}
        <div>
          <label style={LABEL}>
            Google Drive Link <span style={{ color: "#de1a1a" }}>*</span>
          </label>
          <input
            className="du"
            style={FIELD}
            placeholder="Upload clips to Drive, then paste the link here…"
            value={entry.screenshot_url ?? ""}
            onChange={(e) => onChange({ screenshot_url: e.target.value, video_uploaded: !!e.target.value })}
          />
        </div>

        {/* Notes */}
        <div>
          <label style={LABEL}>Notes</label>
          <textarea rows={2} className="du resize-none" style={FIELD}
            placeholder="Location, content details, any blockers…"
            value={entry.notes ?? ""}
            onChange={(e) => onChange({ notes: e.target.value })} />
        </div>
      </div>
    </div>
  )
}

// ── Editing video row ──────────────────────────────────────────
function EditingVideoRow({ video, index, projects, onChange, onRemove }: {
  video: EditingVideo
  index: number
  projects: Project[]
  onChange: (patch: Partial<EditingVideo>) => void
  onRemove: () => void
}) {
  return (
    <div className="rounded-xl p-4 space-y-3"
      style={{ background: "#F4F5F7", border: "1px solid #E5E7EB" }}>

      <div className="flex items-center justify-between">
        <span className="text-[11px] font-black uppercase tracking-[0.15em]"
          style={{ color: "#6366F1" }}>Video {index + 1}</span>
        <button type="button" onClick={onRemove}
          className="w-6 h-6 rounded-lg flex items-center justify-center"
          style={{ background: "rgba(222,26,26,0.08)", border: "1px solid rgba(222,26,26,0.15)" }}>
          <Trash2 size={10} style={{ color: "#de1a1a" }} />
        </button>
      </div>

      {/* Video Name | Client | Video Type */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-2">
        <div>
          <label style={LABEL}>Video Name *</label>
          <input className="du" style={FIELD} placeholder="e.g. Promo Reel"
            value={video.video_name}
            onChange={(e) => onChange({ video_name: e.target.value })} />
        </div>
        <div>
          <label style={LABEL}>Client *</label>
          {projects.length > 0 ? (
            <div className="relative">
              <select value={video.client_id ?? ""}
                onChange={(e) => {
                  const proj = projects.find((p) => p.id === e.target.value)
                  onChange({ client_id: e.target.value || null, client_name: proj?.business_name ?? "" })
                }}
                style={{ ...FIELD, appearance: "none", paddingRight: "28px" }} className="du-sel">
                <option value="">Select…</option>
                {projects.map((p) => <option key={p.id} value={p.id}>{p.business_name}</option>)}
              </select>
              <ChevronDown size={11} className="absolute right-2.5 top-1/2 -translate-y-1/2 pointer-events-none"
                style={{ color: "#6B7280" }} />
            </div>
          ) : (
            <input className="du" style={FIELD} placeholder="Client name"
              value={video.client_name}
              onChange={(e) => onChange({ client_name: e.target.value })} />
          )}
        </div>
        <div>
          <label style={LABEL}>Video Type *</label>
          <div className="relative">
            <select value={video.video_type}
              onChange={(e) => onChange({ video_type: e.target.value })}
              style={{ ...FIELD, appearance: "none", paddingRight: "28px" }} className="du-sel">
              <option value="">Select…</option>
              {VIDEO_TYPES.map((t) => <option key={t} value={t}>{t}</option>)}
            </select>
            <ChevronDown size={11} className="absolute right-2.5 top-1/2 -translate-y-1/2 pointer-events-none"
              style={{ color: "#6B7280" }} />
          </div>
        </div>
      </div>

      {/* Date Given | Date Finished | Duration */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-2">
        <div>
          <label style={LABEL}>Date Given</label>
          <input type="date" className="du" style={FIELD}
            value={video.date_given}
            onChange={(e) => onChange({ date_given: e.target.value })} />
        </div>
        <div>
          <label style={LABEL}>Date Finished</label>
          <input type="date" className="du" style={FIELD}
            value={video.date_finished}
            onChange={(e) => onChange({ date_finished: e.target.value })} />
        </div>
        <div>
          <label style={LABEL}>Video Duration</label>
          <input className="du" style={FIELD} placeholder="e.g. 0:30"
            value={video.duration}
            onChange={(e) => onChange({ duration: e.target.value })} />
        </div>
      </div>

      {/* Time Taken | Revisions | Drive Updated */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-2">
        <div>
          <label style={LABEL}>Time Taken (hrs) *</label>
          <input type="number" min="0.5" step="0.5" className="du" style={FIELD}
            placeholder="e.g. 3"
            value={video.time_taken || ""}
            onChange={(e) => onChange({ time_taken: parseFloat(e.target.value) || 0 })} />
        </div>
        <div>
          <label style={LABEL}>Revisions</label>
          <input type="number" min="0" step="1" className="du" style={FIELD}
            placeholder="0"
            value={video.revisions || ""}
            onChange={(e) => onChange({ revisions: parseInt(e.target.value) || 0 })} />
        </div>
        <div>
          <label style={LABEL}>Drive Updated?</label>
          <div className="flex gap-1.5">
            <button type="button"
              onClick={() => onChange({ drive_updated: true })}
              className="flex-1 flex items-center justify-center gap-1 py-2 rounded-lg text-[11px] font-bold transition-all"
              style={video.drive_updated
                ? { background: "rgba(34,197,94,0.12)", color: "#16A34A", border: "1.5px solid rgba(34,197,94,0.4)" }
                : { background: "#FFFFFF", color: "#6B7280", border: "1px solid #E5E7EB" }}>
              <CheckCircle2 size={11} /> Yes
            </button>
            <button type="button"
              onClick={() => onChange({ drive_updated: false, drive_link: "" })}
              className="flex-1 flex items-center justify-center gap-1 py-2 rounded-lg text-[11px] font-bold transition-all"
              style={!video.drive_updated
                ? { background: "rgba(239,68,68,0.08)", color: "#de1a1a", border: "1.5px solid rgba(222,26,26,0.25)" }
                : { background: "#FFFFFF", color: "#6B7280", border: "1px solid #E5E7EB" }}>
              <XCircle size={11} /> No
            </button>
          </div>
        </div>
      </div>

      {video.drive_updated && (
        <div className="space-y-1.5">
          <label style={{ ...LABEL, color: "#16A34A", marginBottom: 2 }}>
            <FolderOpen size={10} style={{ display: "inline", marginRight: 4 }} />
            Google Drive Link <span style={{ color: "#de1a1a" }}>*</span>
          </label>
          <input
            className="du"
            style={FIELD}
            placeholder="Upload final video to Drive, then paste the link here…"
            value={video.drive_link ?? ""}
            onChange={(e) => onChange({ drive_link: e.target.value })}
          />
        </div>
      )}
    </div>
  )
}

// ── Edit session card ──────────────────────────────────────────
function EditCard({ entry, i, projects, onChange, onRemove }: {
  entry: WorkEntryInput
  i: number
  projects: Project[]
  onChange: (patch: Partial<WorkEntryInput>) => void
  onRemove: () => void
}) {
  const videos = entry.editing_videos ?? []
  const totalTime = Math.round(videos.reduce((s, v) => s + v.time_taken, 0) * 10) / 10

  function updateVideo(idx: number, patch: Partial<EditingVideo>) {
    const next = [...videos]
    next[idx] = { ...next[idx], ...patch }
    onChange({ editing_videos: next, duration_hours: Math.round(next.reduce((s, v) => s + v.time_taken, 0) * 10) / 10 })
  }

  function removeVideo(idx: number) {
    const next = videos.filter((_, j) => j !== idx)
    onChange({ editing_videos: next, duration_hours: Math.round(next.reduce((s, v) => s + v.time_taken, 0) * 10) / 10 })
  }

  return (
    <div className="rounded-2xl overflow-hidden"
      style={{ border: "1px solid rgba(99,102,241,0.2)", boxShadow: "0 2px 8px rgba(99,102,241,0.06)" }}>

      <div className="flex items-center justify-between px-4 py-3"
        style={{ background: "rgba(99,102,241,0.06)", borderBottom: "1px solid rgba(99,102,241,0.12)" }}>
        <div className="flex items-center gap-2">
          <div className="w-7 h-7 rounded-lg flex items-center justify-center"
            style={{ background: "rgba(99,102,241,0.15)" }}>
            <Scissors size={14} style={{ color: "#6366F1" }} />
          </div>
          <span className="text-[13px] font-black" style={{ fontFamily: "var(--font-jakarta)", color: "#6366F1" }}>
            EDITING SESSION {i + 1}
          </span>
          {videos.length > 0 && (
            <span className="text-[11px] font-semibold px-2 py-0.5 rounded-full"
              style={{ background: "rgba(99,102,241,0.15)", color: "#6366F1" }}>
              {videos.length} video{videos.length > 1 ? "s" : ""} · {totalTime}h
            </span>
          )}
        </div>
        <button type="button" onClick={onRemove}
          className="w-7 h-7 rounded-lg flex items-center justify-center"
          style={{ background: "rgba(99,102,241,0.08)", border: "1px solid rgba(99,102,241,0.2)" }}>
          <Trash2 size={12} style={{ color: "#6366F1" }} />
        </button>
      </div>

      <div className="p-4 space-y-3" style={{ background: "#FFFFFF" }}>
        {videos.map((video, idx) => (
          <EditingVideoRow
            key={video.id}
            video={video}
            index={idx}
            projects={projects}
            onChange={(patch) => updateVideo(idx, patch)}
            onRemove={() => removeVideo(idx)}
          />
        ))}

      </div>
    </div>
  )
}

// ═══════════════════════════════════════════════════════════════
// GENERAL TEAM FORM (all teams except Media Team)
// ═══════════════════════════════════════════════════════════════

type GenEntry = {
  id: string
  title: string
  client_id: string | null
  client_name: string
  start_time: string
  end_time: string
  duration_hours: number
  notes: string
}

type GenLearning = {
  title: string
  start_time: string
  end_time: string
  duration_hours: number
  notes: string
}

function newGenEntry(): GenEntry {
  return {
    id: crypto.randomUUID(),
    title: "", client_id: null, client_name: "",
    start_time: "", end_time: "", duration_hours: 0,
    notes: "",
  }
}

// ── General Work Entry card ────────────────────────────────────
function GenWorkCard({ entry, index, projects, onChange, onRemove, canRemove }: {
  entry: GenEntry
  index: number
  projects: Project[]
  onChange: (p: Partial<GenEntry>) => void
  onRemove: () => void
  canRemove: boolean
}) {
  return (
    <div className="rounded-2xl overflow-hidden"
      style={{ border: "1px solid rgba(222,26,26,0.2)", boxShadow: "0 2px 8px rgba(222,26,26,0.06)" }}>

      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3"
        style={{ background: "rgba(222,26,26,0.06)", borderBottom: "1px solid rgba(222,26,26,0.12)" }}>
        <div className="flex items-center gap-2">
          <div className="w-7 h-7 rounded-lg flex items-center justify-center"
            style={{ background: "rgba(222,26,26,0.15)" }}>
            <Briefcase size={14} style={{ color: "#de1a1a" }} />
          </div>
          <span className="text-[13px] font-black" style={{ fontFamily: "var(--font-jakarta)", color: "#de1a1a" }}>
            WORK ENTRY {index + 1}
          </span>
          {entry.duration_hours > 0 && (
            <span className="text-[11px] font-semibold px-2 py-0.5 rounded-full"
              style={{ background: "rgba(222,26,26,0.12)", color: "#de1a1a" }}>
              {entry.duration_hours}h
            </span>
          )}
        </div>
        {canRemove && (
          <button type="button" onClick={onRemove}
            className="w-7 h-7 rounded-lg flex items-center justify-center"
            style={{ background: "rgba(222,26,26,0.08)", border: "1px solid rgba(222,26,26,0.15)" }}>
            <Trash2 size={12} style={{ color: "#de1a1a" }} />
          </button>
        )}
      </div>

      <div className="p-4 space-y-4" style={{ background: "#FFFFFF" }}>
        {/* Title */}
        <div>
          <label style={LABEL}>Title <span style={{ color: "#de1a1a" }}>*</span></label>
          <input className="du" style={FIELD}
            placeholder="e.g. Client Strategy Meeting, Website Development, Campaign Setup…"
            value={entry.title}
            onChange={(e) => onChange({ title: e.target.value })} />
        </div>

        {/* Client */}
        <ClientSelect
          projects={projects}
          value={entry.client_id ?? ""}
          onChange={(id, name) => onChange({ client_id: id || null, client_name: name })}
          required
        />

        {/* From / To / Duration */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
          <div>
            <label style={LABEL}>From <span style={{ color: "#de1a1a" }}>*</span></label>
            <input type="time" className="du" style={FIELD}
              value={entry.start_time}
              onChange={(e) => {
                const dur = calcDuration(e.target.value, entry.end_time)
                onChange({ start_time: e.target.value, duration_hours: dur })
              }} />
          </div>
          <div>
            <label style={LABEL}>To <span style={{ color: "#de1a1a" }}>*</span></label>
            <input type="time" className="du" style={FIELD}
              value={entry.end_time}
              onChange={(e) => {
                const dur = calcDuration(entry.start_time, e.target.value)
                onChange({ end_time: e.target.value, duration_hours: dur })
              }} />
          </div>
          <div>
            <label style={LABEL}>Duration</label>
            <div className="flex items-center justify-center rounded-[10px] text-[15px] font-black"
              style={{
                height: "42px", background: "#F4F5F7", border: "1px solid #E5E7EB",
                color: entry.duration_hours > 0 ? "#de1a1a" : "#D1D5DB",
              }}>
              {entry.duration_hours > 0 ? `${entry.duration_hours}h` : "—"}
            </div>
          </div>
        </div>

        {/* Notes */}
        <div>
          <label style={LABEL}>
            Notes — What did you work on? <span style={{ color: "#de1a1a" }}>*</span>
          </label>
          <textarea rows={4} className="du resize-none" style={FIELD}
            placeholder="Describe clearly what you worked on, tasks completed, progress made, outcomes achieved, and any challenges faced…"
            value={entry.notes}
            onChange={(e) => onChange({ notes: e.target.value })} />
        </div>
      </div>
    </div>
  )
}

// ── General Team Form ──────────────────────────────────────────
function GeneralTeamForm({ projects }: { projects: Project[] }) {
  const router = useRouter()
  const [pending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)

  const [entries, setEntries] = useState<GenEntry[]>([newGenEntry()])
  const [hasLearning, setHasLearning] = useState(false)
  const [learning, setLearning] = useState<GenLearning>({
    title: "", start_time: "", end_time: "", duration_hours: 0, notes: "",
  })
  function updateEntry(i: number, p: Partial<GenEntry>) {
    setEntries(prev => { const next = [...prev]; next[i] = { ...next[i], ...p }; return next })
  }

  function removeEntry(i: number) {
    setEntries(prev => prev.filter((_, j) => j !== i))
  }

  function validate(): string | null {
    for (let i = 0; i < entries.length; i++) {
      const e = entries[i]; const n = i + 1
      if (!e.title.trim())                          return `Work Entry ${n}: Title is required`
      if (!e.client_id && !e.client_name.trim())    return `Work Entry ${n}: Client is required`
      if (!e.start_time || !e.end_time)             return `Work Entry ${n}: Start and end time are required`
      if (e.duration_hours <= 0)                    return `Work Entry ${n}: End time must be after start time`
      if (!e.notes.trim())                          return `Work Entry ${n}: Notes are required — explain what you worked on`
    }
    if (hasLearning) {
      if (!learning.title.trim())                     return "Learning: Title is required"
      if (!learning.start_time || !learning.end_time) return "Learning: Start and end time are required"
      if (learning.duration_hours <= 0)               return "Learning: End time must be after start time"
      if (!learning.notes.trim())                     return "Learning: Notes are required — explain what you learned"
    }
    return null
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    const err = validate()
    if (err) { setError(err); return }

    startTransition(async () => {
      const result = await submitDailyUpdate({
        active_tab: "working",
        work_entries: entries.map(e => ({
          id: e.id,
          client_id: e.client_id,
          client_name: e.client_name,
          task_type: "other" as const,
          title: e.title,
          start_time: e.start_time,
          end_time: e.end_time,
          duration_hours: e.duration_hours,
          notes: e.notes,
          editing_videos: [],
        })),
        links: [],
        shoot_count: 0,
        editing_count: 0,
        learning_topic: hasLearning ? learning.title : undefined,
        learning_hours: hasLearning ? learning.duration_hours : 0,
        learning_notes: hasLearning ? `[${learning.start_time}–${learning.end_time}] ${learning.notes}` : undefined,
      })

      if (result.success) {
        router.push("/member/dashboard")
        router.refresh()
      } else {
        setError(result.error ?? "Something went wrong")
      }
    })
  }

  const totalWorkHours = Math.round(entries.reduce((s, e) => s + e.duration_hours, 0) * 10) / 10

  return (
    <>
      <style>{`
        .du::placeholder { color: #6B7280; }
        .du:focus { border-color: rgba(222,26,26,0.4) !important; box-shadow: 0 0 0 2px rgba(222,26,26,0.06); }
        .du-sel { appearance: none; }
      `}</style>

      <form onSubmit={handleSubmit} className="space-y-8">

        {/* ── Work Update Section ─────────────────────────────── */}
        <div>
          <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
            <div className="flex items-center gap-3">
              <div className="w-9 h-9 rounded-xl flex items-center justify-center"
                style={{ background: "rgba(222,26,26,0.1)" }}>
                <Briefcase size={17} style={{ color: "#de1a1a" }} />
              </div>
              <div>
                <h2 className="text-[17px] font-black leading-none"
                  style={{ fontFamily: "var(--font-jakarta)", color: "#111827" }}>Work Update</h2>
                {totalWorkHours > 0 && (
                  <p className="text-[11px] font-semibold mt-0.5" style={{ color: "#de1a1a" }}>
                    {totalWorkHours}h total · {entries.length} entr{entries.length === 1 ? "y" : "ies"}
                  </p>
                )}
              </div>
            </div>
            <button
              type="button"
              onClick={() => setEntries(prev => [...prev, newGenEntry()])}
              className="flex items-center gap-1.5 text-[12px] font-bold px-3 py-1.5 rounded-lg transition-all"
              style={{ background: "rgba(222,26,26,0.07)", color: "#de1a1a", border: "1px solid rgba(222,26,26,0.2)" }}
              onMouseEnter={e => (e.currentTarget as HTMLElement).style.background = "rgba(222,26,26,0.13)"}
              onMouseLeave={e => (e.currentTarget as HTMLElement).style.background = "rgba(222,26,26,0.07)"}>
              <Plus size={13} /> Add Entry
            </button>
          </div>

          <div className="space-y-4">
            {entries.map((entry, i) => (
              <GenWorkCard
                key={entry.id}
                entry={entry}
                index={i}
                projects={projects}
                canRemove={entries.length > 1}
                onChange={(p) => updateEntry(i, p)}
                onRemove={() => removeEntry(i)}
              />
            ))}
          </div>
        </div>

        {/* Divider */}
        <div style={{ height: "1px", background: "linear-gradient(90deg, transparent, #E5E7EB 20%, #E5E7EB 80%, transparent)" }} />

        {/* ── Learning Section ────────────────────────────────── */}
        <div>
          <div className="flex items-center justify-between gap-3 mb-4">
            <div className="flex items-center gap-3">
              <div className="w-9 h-9 rounded-xl flex items-center justify-center"
                style={{ background: "rgba(99,102,241,0.1)" }}>
                <BookOpen size={17} style={{ color: "#6366F1" }} />
              </div>
              <div>
                <h2 className="text-[17px] font-black leading-none"
                  style={{ fontFamily: "var(--font-jakarta)", color: "#111827" }}>Learning</h2>
                {hasLearning && learning.duration_hours > 0 && (
                  <p className="text-[11px] font-semibold mt-0.5" style={{ color: "#6366F1" }}>
                    {learning.duration_hours}h
                  </p>
                )}
              </div>
            </div>
            <button
              type="button"
              onClick={() => setHasLearning(prev => !prev)}
              className="flex items-center gap-2 text-[12px] font-bold px-3 py-1.5 rounded-lg transition-all"
              style={hasLearning
                ? { background: "rgba(99,102,241,0.12)", color: "#6366F1", border: "1px solid rgba(99,102,241,0.3)" }
                : { background: "rgba(99,102,241,0.06)", color: "#6366F1", border: "1px solid rgba(99,102,241,0.15)" }
              }
              onMouseEnter={e => (e.currentTarget as HTMLElement).style.background = "rgba(99,102,241,0.15)"}
              onMouseLeave={e => (e.currentTarget as HTMLElement).style.background = hasLearning ? "rgba(99,102,241,0.12)" : "rgba(99,102,241,0.06)"}
            >
              {hasLearning ? "Remove Learning" : "+ Add Learning"}
            </button>
          </div>

          {!hasLearning && (
            <div className="flex items-center gap-3 px-4 py-3.5 rounded-2xl"
              style={{ background: "rgba(99,102,241,0.04)", border: "1px dashed rgba(99,102,241,0.2)" }}>
              <BookOpen size={15} style={{ color: "rgba(99,102,241,0.4)" }} />
              <span className="text-[13px]" style={{ color: "#9CA3AF" }}>
                Did you learn something today? Tap <strong style={{ color: "#6366F1" }}>+ Add Learning</strong> to log it — it's optional.
              </span>
            </div>
          )}

          {hasLearning && (
            <div className="rounded-2xl overflow-hidden"
              style={{ border: "1px solid rgba(99,102,241,0.2)", boxShadow: "0 2px 8px rgba(99,102,241,0.06)" }}>

              <div className="px-4 py-3"
                style={{ background: "rgba(99,102,241,0.06)", borderBottom: "1px solid rgba(99,102,241,0.12)" }}>
                <span className="text-[12px] font-bold uppercase tracking-[0.14em]" style={{ color: "#6366F1" }}>
                  What did you learn today?
                </span>
              </div>

              <div className="p-4 space-y-4" style={{ background: "#FFFFFF" }}>
                {/* Title */}
                <div>
                  <label style={LABEL}>Title <span style={{ color: "#de1a1a" }}>*</span></label>
                  <input className="du" style={FIELD}
                    placeholder="e.g. Meta Ads Strategy, SEO Techniques, Client Communication Skills…"
                    value={learning.title}
                    onChange={(e) => setLearning(prev => ({ ...prev, title: e.target.value }))} />
                </div>

                {/* From / To / Duration */}
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
                  <div>
                    <label style={LABEL}>From <span style={{ color: "#de1a1a" }}>*</span></label>
                    <input type="time" className="du" style={FIELD}
                      value={learning.start_time}
                      onChange={(e) => {
                        const dur = calcDuration(e.target.value, learning.end_time)
                        setLearning(prev => ({ ...prev, start_time: e.target.value, duration_hours: dur }))
                      }} />
                  </div>
                  <div>
                    <label style={LABEL}>To <span style={{ color: "#de1a1a" }}>*</span></label>
                    <input type="time" className="du" style={FIELD}
                      value={learning.end_time}
                      onChange={(e) => {
                        const dur = calcDuration(learning.start_time, e.target.value)
                        setLearning(prev => ({ ...prev, end_time: e.target.value, duration_hours: dur }))
                      }} />
                  </div>
                  <div>
                    <label style={LABEL}>Duration</label>
                    <div className="flex items-center justify-center rounded-[10px] text-[15px] font-black"
                      style={{
                        height: "42px", background: "#F4F5F7", border: "1px solid #E5E7EB",
                        color: learning.duration_hours > 0 ? "#6366F1" : "#D1D5DB",
                      }}>
                      {learning.duration_hours > 0 ? `${learning.duration_hours}h` : "—"}
                    </div>
                  </div>
                </div>

                {/* Notes */}
                <div>
                  <label style={LABEL}>
                    Notes — Key takeaways & insights <span style={{ color: "#de1a1a" }}>*</span>
                  </label>
                  <textarea rows={4} className="du resize-none" style={FIELD}
                    placeholder="Explain clearly what you learned, key insights gained, resources used, and how it applies to your work…"
                    value={learning.notes}
                    onChange={(e) => setLearning(prev => ({ ...prev, notes: e.target.value }))} />
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Error */}
        {error && (
          <div className="flex items-start gap-2.5 px-4 py-3 rounded-xl"
            style={{ background: "rgba(222,26,26,0.06)", border: "1px solid rgba(222,26,26,0.2)" }}>
            <AlertCircle size={15} className="flex-shrink-0 mt-0.5" style={{ color: "#de1a1a" }} />
            <span className="text-[13px]" style={{ color: "#de1a1a" }}>{error}</span>
          </div>
        )}

        {/* Submit */}
        <button type="submit" disabled={pending}
          className="w-full py-3.5 rounded-xl text-[14px] font-black flex items-center justify-center gap-2 transition-all"
          style={{
            background: pending ? "rgba(222,26,26,0.5)" : "linear-gradient(135deg, #de1a1a, #7F1D1D)",
            color: "#FFFFFF",
            boxShadow: pending ? "none" : "0 4px 16px rgba(222,26,26,0.3)",
            cursor: pending ? "not-allowed" : "pointer",
          }}>
          {pending && <Loader2 size={16} className="animate-spin" />}
          {pending ? "Submitting…" : "Submit Daily Update →"}
        </button>
      </form>
    </>
  )
}

// ═══════════════════════════════════════════════════════════════
// MEDIA TEAM FORM (shooting / editing / learning flow)
// ═══════════════════════════════════════════════════════════════
function MediaTeamForm({ projects }: { projects: Project[] }) {
  const router = useRouter()
  const [pending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)

  // Step flow
  const [step, setStep] = useState<FlowStep>("type-select")
  const [mode, setMode] = useState<FlowMode | null>(null)

  // Form data
  const [entries, setEntries] = useState<WorkEntryInput[]>([])
  const [learningTopic, setLearningTopic] = useState("")
  const [learningHours, setLearningHours] = useState("")
  const [learningNotes, setLearningNotes] = useState("")

  function updateEntry(i: number, patch: Partial<WorkEntryInput>) {
    setEntries((prev) => {
      const next = [...prev]
      next[i] = { ...next[i], ...patch }
      return next
    })
  }

  function removeEntry(i: number) {
    setEntries((prev) => prev.filter((_, idx) => idx !== i))
  }

  function selectType(m: FlowMode) {
    setMode(m)
    setError(null)
    if (m === "learning") {
      setStep("form")
    } else if (m === "edit") {
      const session = newEntry("edit")
      session.editing_videos = [newEditingVideo()]
      setEntries([session])
      setStep("form")
    } else {
      setStep("count-select")
    }
  }

  function selectCount(count: number) {
    const type = mode === "shoot" ? "shoot" : "edit"
    if (entries.length < count) {
      const extra = Array.from({ length: count - entries.length }, () => newEntry(type))
      setEntries((prev) => [...prev, ...extra])
    } else if (entries.length > count) {
      setEntries((prev) => prev.slice(0, count))
    }
    setStep("form")
  }

  function goBack() {
    setError(null)
    if (step === "form" && mode !== "learning") {
      setStep("count-select")
    } else {
      setStep("type-select")
      setMode(null)
      setEntries([])
    }
  }

  function validate(): string | null {
    for (let i = 0; i < entries.length; i++) {
      const e = entries[i]
      const n = i + 1
      if (e.task_type === "shoot") {
        if (!e.client_id && !e.client_name) return `Shoot ${n}: Client is required`
        if (!e.start_time || !e.end_time) return `Shoot ${n}: Start and end time are required`
        if (e.duration_hours <= 0) return `Shoot ${n}: End time must be after start time`
        if (!e.screenshot_url?.trim()) return `Shoot ${n}: Google Drive link is required`
      }
      if (e.task_type === "edit") {
        const vids = e.editing_videos ?? []
        if (vids.length === 0) return `Editing Session ${n}: Add at least one video`
        for (let v = 0; v < vids.length; v++) {
          const vid = vids[v]
          if (!vid.video_name.trim()) return `Session ${n} · Video ${v + 1}: Video name required`
          if (!vid.video_type) return `Session ${n} · Video ${v + 1}: Video type required`
          if (vid.time_taken <= 0) return `Session ${n} · Video ${v + 1}: Time taken required`
          if (vid.drive_updated && !vid.drive_link?.trim()) return `Session ${n} · Video ${v + 1}: Upload file or uncheck Drive Updated`
        }
      }
    }
    return null
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)

    if (mode !== "learning") {
      const err = validate()
      if (err) { setError(err); return }
    }

    const tab = mode === "learning" ? "learning" : "working"

    startTransition(async () => {
      const result = await submitDailyUpdate({
        active_tab: tab,
        work_entries: tab === "working" ? entries : [],
        links: [],
        shoot_count: entries.filter((e) => e.task_type === "shoot").length,
        editing_count: entries.filter((e) => e.task_type === "edit").length,
        learning_topic: learningTopic || undefined,
        learning_hours: parseFloat(learningHours) || 0,
        learning_notes: learningNotes || undefined,
      })

      if (result.success) {
        router.push("/member/dashboard")
        router.refresh()
      } else {
        setError(result.error ?? "Something went wrong")
      }
    })
  }

  const shootCount = entries.filter((e) => e.task_type === "shoot").length
  const editCount  = entries.filter((e) => e.task_type === "edit").length
  const totalHours = Math.round(entries.reduce((s, e) => s + e.duration_hours, 0) * 10) / 10

  return (
    <>
      <style>{`
        .du::placeholder { color: #6B7280; }
        .du:focus { border-color: rgba(222,26,26,0.4) !important; box-shadow: 0 0 0 2px rgba(222,26,26,0.06); }
        .du-sel { appearance: none; }
      `}</style>

      {/* ── STEP 1: Type Select ─────────────────────────────── */}
      {step === "type-select" && (
        <div>
          <p className="text-[11px] font-bold uppercase tracking-[0.16em] mb-5"
            style={{ color: "#6B7280" }}>What did you work on today?</p>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {/* Shooting */}
            <button type="button" onClick={() => selectType("shoot")}
              className="flex flex-col items-center justify-center gap-3 rounded-2xl transition-all"
              style={{ aspectRatio: "1", background: "rgba(222,26,26,0.04)", border: "2px solid rgba(222,26,26,0.18)" }}
              onMouseEnter={e => {
                (e.currentTarget as HTMLElement).style.background = "rgba(222,26,26,0.1)"
                ;(e.currentTarget as HTMLElement).style.borderColor = "rgba(222,26,26,0.4)"
              }}
              onMouseLeave={e => {
                (e.currentTarget as HTMLElement).style.background = "rgba(222,26,26,0.04)"
                ;(e.currentTarget as HTMLElement).style.borderColor = "rgba(222,26,26,0.18)"
              }}>
              <div className="w-14 h-14 rounded-2xl flex items-center justify-center"
                style={{ background: "rgba(222,26,26,0.12)" }}>
                <Camera size={28} style={{ color: "#de1a1a" }} />
              </div>
              <p className="text-[15px] font-black" style={{ color: "#de1a1a" }}>Shooting</p>
              <p className="text-[11px] text-center px-2 leading-snug" style={{ color: "#6B7280" }}>Sessions, travel & expenses</p>
            </button>

            {/* Editing */}
            <button type="button" onClick={() => selectType("edit")}
              className="flex flex-col items-center justify-center gap-3 rounded-2xl transition-all"
              style={{ aspectRatio: "1", background: "rgba(99,102,241,0.04)", border: "2px solid rgba(99,102,241,0.18)" }}
              onMouseEnter={e => {
                (e.currentTarget as HTMLElement).style.background = "rgba(99,102,241,0.1)"
                ;(e.currentTarget as HTMLElement).style.borderColor = "rgba(99,102,241,0.4)"
              }}
              onMouseLeave={e => {
                (e.currentTarget as HTMLElement).style.background = "rgba(99,102,241,0.04)"
                ;(e.currentTarget as HTMLElement).style.borderColor = "rgba(99,102,241,0.18)"
              }}>
              <div className="w-14 h-14 rounded-2xl flex items-center justify-center"
                style={{ background: "rgba(99,102,241,0.12)" }}>
                <Scissors size={28} style={{ color: "#6366F1" }} />
              </div>
              <p className="text-[15px] font-black" style={{ color: "#6366F1" }}>Editing</p>
              <p className="text-[11px] text-center px-2 leading-snug" style={{ color: "#6B7280" }}>Videos & Drive uploads</p>
            </button>

            {/* Learning */}
            <button type="button" onClick={() => selectType("learning")}
              className="flex flex-col items-center justify-center gap-3 rounded-2xl transition-all"
              style={{ aspectRatio: "1", background: "#F4F5F7", border: "2px solid #E5E7EB" }}
              onMouseEnter={e => {
                (e.currentTarget as HTMLElement).style.background = "#F1F5F9"
                ;(e.currentTarget as HTMLElement).style.borderColor = "#D1D5DB"
              }}
              onMouseLeave={e => {
                (e.currentTarget as HTMLElement).style.background = "#F4F5F7"
                ;(e.currentTarget as HTMLElement).style.borderColor = "#E5E7EB"
              }}>
              <div className="w-14 h-14 rounded-2xl flex items-center justify-center"
                style={{ background: "rgba(0,0,0,0.05)" }}>
                <BookOpen size={28} style={{ color: "#6B7280" }} />
              </div>
              <p className="text-[15px] font-black" style={{ color: "#6B7280" }}>Learning</p>
              <p className="text-[11px] text-center px-2 leading-snug" style={{ color: "#6B7280" }}>Study & skill building</p>
            </button>
          </div>
        </div>
      )}

      {/* ── STEP 2: Count Select ────────────────────────────── */}
      {step === "count-select" && (
        <div className="space-y-6">
          <button type="button" onClick={goBack}
            className="flex items-center gap-1.5 text-[12px] font-semibold"
            style={{ color: "#6B7280" }}>
            <ArrowLeft size={14} /> Back
          </button>

          <div>
            <p className="text-[22px] font-black mb-1" style={{ color: "#111111" }}>
              {mode === "shoot" ? "How many shoots today?" : "How many videos edited?"}
            </p>
            <p className="text-[13px]" style={{ color: "#6B7280" }}>
              {mode === "shoot"
                ? "Each shoot session gets its own card"
                : "Each editing session gets its own card"}
            </p>
          </div>

          <div className="grid grid-cols-5 gap-2">
            {[1, 2, 3, 4, 5].map((n) => (
              <button
                key={n}
                type="button"
                onClick={() => selectCount(n)}
                className="flex items-center justify-center rounded-2xl text-[24px] font-black transition-all"
                style={{
                  height: "72px",
                  background: mode === "shoot" ? "rgba(222,26,26,0.06)" : "rgba(99,102,241,0.06)",
                  border: mode === "shoot" ? "2px solid rgba(222,26,26,0.18)" : "2px solid rgba(99,102,241,0.18)",
                  color: mode === "shoot" ? "#de1a1a" : "#6366F1",
                }}
                onMouseEnter={e => {
                  (e.currentTarget as HTMLElement).style.background = mode === "shoot"
                    ? "rgba(222,26,26,0.14)" : "rgba(99,102,241,0.14)"
                  ;(e.currentTarget as HTMLElement).style.transform = "scale(1.04)"
                }}
                onMouseLeave={e => {
                  (e.currentTarget as HTMLElement).style.background = mode === "shoot"
                    ? "rgba(222,26,26,0.06)" : "rgba(99,102,241,0.06)"
                  ;(e.currentTarget as HTMLElement).style.transform = "scale(1)"
                }}>
                {n}
              </button>
            ))}
          </div>

          <p className="text-[11px] text-center" style={{ color: "#D1D5DB" }}>
            You can add more sessions after
          </p>
        </div>
      )}

      {/* ── STEP 3: Form ────────────────────────────────────── */}
      {step === "form" && (
        <form onSubmit={handleSubmit} className="space-y-5">

          {/* Back + summary header */}
          <div className="flex items-center justify-between">
            <button type="button" onClick={goBack}
              className="flex items-center gap-1.5 text-[12px] font-semibold"
              style={{ color: "#6B7280" }}>
              <ArrowLeft size={14} /> Back
            </button>
            {mode !== "learning" && (
              <div className="flex items-center gap-2">
                {shootCount > 0 && (
                  <span className="text-[11px] font-bold px-2.5 py-1 rounded-full"
                    style={{ background: "rgba(222,26,26,0.1)", color: "#de1a1a" }}>
                    {shootCount} Shoot{shootCount > 1 ? "s" : ""}
                  </span>
                )}
                {editCount > 0 && (
                  <span className="text-[11px] font-bold px-2.5 py-1 rounded-full"
                    style={{ background: "rgba(99,102,241,0.1)", color: "#6366F1" }}>
                    {editCount} Editing
                  </span>
                )}
                {totalHours > 0 && (
                  <span className="text-[11px] font-bold px-2.5 py-1 rounded-full"
                    style={{ background: "rgba(222,26,26,0.08)", color: "#de1a1a" }}>
                    {totalHours}h total
                  </span>
                )}
              </div>
            )}
          </div>

          {/* ── Learning form ── */}
          {mode === "learning" && (
            <div className="space-y-4">
              <div className="rounded-xl p-5 space-y-4"
                style={{ background: "#FFFFFF", border: "1px solid #E5E7EB" }}>
                <div>
                  <label style={LABEL}>Topic *</label>
                  <input className="du" style={FIELD}
                    placeholder="e.g. Color grading, Meta Ads, React hooks…"
                    value={learningTopic}
                    onChange={(e) => setLearningTopic(e.target.value)} />
                </div>
                <div>
                  <label style={LABEL}>Time Spent (hours) *</label>
                  <input type="number" min="0.5" max="24" step="0.5" className="du"
                    style={{ ...FIELD, maxWidth: 160 }}
                    placeholder="e.g. 1.5"
                    value={learningHours}
                    onChange={(e) => setLearningHours(e.target.value)} />
                </div>
                <div>
                  <label style={LABEL}>Notes</label>
                  <textarea rows={4} className="du resize-none" style={FIELD}
                    placeholder="Key takeaways, resources used…"
                    value={learningNotes}
                    onChange={(e) => setLearningNotes(e.target.value)} />
                </div>
              </div>
              <div className="flex items-center gap-2 px-3 py-2.5 rounded-lg"
                style={{ background: "rgba(222,26,26,0.06)", border: "1px solid rgba(222,26,26,0.15)" }}>
                <BookOpen size={13} style={{ color: "#de1a1a" }} />
                <p className="text-[12px]" style={{ color: "#6B7280" }}>
                  Learning hours count toward your daily productivity score.
                </p>
              </div>
            </div>
          )}

          {/* ── Shoot / Edit session cards ── */}
          {mode !== "learning" && (
            <>
              {entries.length === 0 && (
                <div className="text-center py-10 rounded-2xl"
                  style={{ border: "2px dashed #E5E7EB" }}>
                  <p className="text-[13px]" style={{ color: "#D1D5DB" }}>No sessions yet</p>
                </div>
              )}

              <div className="space-y-4">
                {entries.map((entry, i) => {
                  const commonProps = {
                    entry, i, projects,
                    onChange: (p: Partial<WorkEntryInput>) => updateEntry(i, p),
                    onRemove: () => removeEntry(i),
                  }
                  if (entry.task_type === "shoot") return <ShootCard key={entry.id} {...commonProps} />
                  return <EditCard key={entry.id} {...commonProps} />
                })}
              </div>

              {mode === "shoot" && (
                <button
                  type="button"
                  onClick={() => setEntries((prev) => [...prev, newEntry("shoot")])}
                  className="w-full flex items-center justify-center gap-2 py-3 rounded-2xl text-[13px] font-bold transition-all"
                  style={{ background: "rgba(222,26,26,0.05)", color: "#de1a1a", border: "2px dashed rgba(222,26,26,0.22)" }}
                  onMouseEnter={e => (e.currentTarget as HTMLElement).style.background = "rgba(222,26,26,0.1)"}
                  onMouseLeave={e => (e.currentTarget as HTMLElement).style.background = "rgba(222,26,26,0.05)"}>
                  <Plus size={15} /> Add Another Shoot
                </button>
              )}
            </>
          )}

          {/* Error */}
          {error && (
            <div className="flex items-start gap-2.5 px-4 py-3 rounded-xl"
              style={{ background: "rgba(222,26,26,0.06)", border: "1px solid rgba(222,26,26,0.2)" }}>
              <AlertCircle size={15} className="flex-shrink-0 mt-0.5" style={{ color: "#de1a1a" }} />
              <span className="text-[13px]" style={{ color: "#de1a1a" }}>{error}</span>
            </div>
          )}

          {/* Submit */}
          <button type="submit" disabled={pending}
            className="w-full py-3.5 rounded-xl text-[14px] font-black flex items-center justify-center gap-2 transition-all"
            style={{
              background: pending ? "rgba(222,26,26,0.5)" : "linear-gradient(135deg, #de1a1a, #7F1D1D)",
              color: "#FFFFFF",
              boxShadow: pending ? "none" : "0 4px 16px rgba(222,26,26,0.3)",
              cursor: pending ? "not-allowed" : "pointer",
            }}>
            {pending && <Loader2 size={16} className="animate-spin" />}
            {pending ? "Submitting…" : "Submit Daily Update →"}
          </button>
        </form>
      )}
    </>
  )
}

// ═══════════════════════════════════════════════════════════════
// EXPORTED ROUTER — picks form based on team
// ═══════════════════════════════════════════════════════════════
export default function DailyUpdateForm({
  projects,
  team,
}: {
  projects: Project[]
  team: string | null
}) {
  if (team === "Media Team") {
    return <MediaTeamForm projects={projects} />
  }
  return <GeneralTeamForm projects={projects} />
}
