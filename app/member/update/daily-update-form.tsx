"use client"

import { useState, useTransition, useRef } from "react"
import { useRouter, useSearchParams } from "next/navigation"
import {
  Plus, Trash2, Loader2, Clock, BookOpen, Briefcase,
  Camera, Film, Upload, Layers, Link2, ChevronDown,
  CheckCircle2, XCircle, ImageIcon, Video, AlertCircle,
  FolderOpen, ExternalLink,
} from "lucide-react"
import { submitDailyUpdate } from "@/lib/actions/daily-updates"
import type { WorkEntryInput } from "@/lib/validations/daily-update"

interface Project { id: string; business_name: string }

const TASK_TYPES = [
  { value: "shoot",  label: "Shoot",   icon: Camera },
  { value: "edit",   label: "Editing", icon: Film   },
  { value: "upload", label: "Upload",  icon: Upload  },
  { value: "other",  label: "Other",   icon: Layers  },
] as const
type TaskType = (typeof TASK_TYPES)[number]["value"]

function calcDuration(start: string, end: string): number {
  if (!start || !end) return 0
  const [sh, sm] = start.split(":").map(Number)
  const [eh, em] = end.split(":").map(Number)
  const mins = eh * 60 + em - (sh * 60 + sm)
  return mins <= 0 ? 0 : Math.round((mins / 60) * 10) / 10
}

function newEntry(): WorkEntryInput {
  return {
    id:             crypto.randomUUID(),
    client_id:      null,
    client_name:    "",
    task_type:      "shoot",
    title:          "Shoot Session",
    start_time:     "",
    end_time:       "",
    duration_hours: 0,
    notes:          "",
    video_uploaded: null,
    screenshot_url: "",
    video_link:     "",
  }
}

const FIELD: React.CSSProperties = {
  background: "#F8F9FA",
  border: "1px solid #E5E7EB",
  color: "#111111",
  borderRadius: "10px",
  padding: "10px 14px",
  fontSize: "13px",
  outline: "none",
  width: "100%",
}

const LABEL: React.CSSProperties = {
  display: "block",
  fontSize: "10px",
  fontWeight: 700,
  textTransform: "uppercase",
  letterSpacing: "0.16em",
  marginBottom: "6px",
  color: "#6B7280",
}

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
        Client {required && <span style={{ color: "#DC2626" }}>*</span>}
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
            style={{ color: "#9CA3AF" }} />
        </div>
      ) : (
        <input style={FIELD} placeholder="Client name" className="du"
          value={value}
          onChange={(e) => onChange("", e.target.value)} />
      )}
    </div>
  )
}

// ── Shoot entry card ───────────────────────────────────────────
function ShootCard({ entry, i, projects, onChange, onRemove }: {
  entry: WorkEntryInput
  i: number
  projects: Project[]
  onChange: (patch: Partial<WorkEntryInput>) => void
  onRemove: () => void
}) {
  return (
    <div className="rounded-2xl overflow-hidden"
      style={{ border: "1px solid rgba(220,38,38,0.2)", boxShadow: "0 2px 8px rgba(220,38,38,0.06)" }}>

      {/* Card header */}
      <div className="flex items-center justify-between px-4 py-3"
        style={{ background: "rgba(220,38,38,0.06)", borderBottom: "1px solid rgba(220,38,38,0.12)" }}>
        <div className="flex items-center gap-2">
          <div className="w-7 h-7 rounded-lg flex items-center justify-center"
            style={{ background: "rgba(220,38,38,0.15)" }}>
            <Camera size={14} style={{ color: "#DC2626" }} />
          </div>
          <span className="text-[13px] font-black" style={{ fontFamily: "var(--font-jakarta)", color: "#DC2626" }}>
            SHOOT SESSION
          </span>
        </div>
        <button type="button" onClick={onRemove}
          className="w-7 h-7 rounded-lg flex items-center justify-center transition-all"
          style={{ background: "rgba(220,38,38,0.08)", border: "1px solid rgba(220,38,38,0.15)" }}>
          <Trash2 size={12} style={{ color: "#DC2626" }} />
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

        {/* Timing */}
        <div className="grid grid-cols-3 gap-3">
          <div>
            <label style={LABEL}>Start Time <span style={{ color: "#DC2626" }}>*</span></label>
            <input type="time" className="du" style={FIELD}
              value={entry.start_time}
              onChange={(e) => {
                const dur = calcDuration(e.target.value, entry.end_time)
                onChange({ start_time: e.target.value, duration_hours: dur })
              }} />
          </div>
          <div>
            <label style={LABEL}>End Time <span style={{ color: "#DC2626" }}>*</span></label>
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
                height: "42px", background: "#F8F9FA", border: "1px solid #E5E7EB",
                color: entry.duration_hours > 0 ? "#DC2626" : "#D1D5DB",
              }}>
              {entry.duration_hours > 0 ? `${entry.duration_hours}h` : "—"}
            </div>
          </div>
        </div>

        {/* Video uploaded? */}
        <div>
          <label style={LABEL}>
            Shoot clips uploaded? <span style={{ color: "#DC2626" }}>*</span>
          </label>
          <div className="flex gap-2">
            <button type="button"
              onClick={() => onChange({ video_uploaded: true })}
              className="flex-1 flex items-center justify-center gap-2 py-2.5 rounded-xl text-[13px] font-bold transition-all"
              style={entry.video_uploaded === true
                ? { background: "rgba(34,197,94,0.12)", color: "#16A34A", border: "2px solid rgba(34,197,94,0.4)" }
                : { background: "#F8F9FA", color: "#9CA3AF", border: "1px solid #E5E7EB" }
              }>
              <CheckCircle2 size={14} /> Yes, Uploaded
            </button>
            <button type="button"
              onClick={() => onChange({ video_uploaded: false, screenshot_url: "" })}
              className="flex-1 flex items-center justify-center gap-2 py-2.5 rounded-xl text-[13px] font-bold transition-all"
              style={entry.video_uploaded === false
                ? { background: "rgba(239,68,68,0.1)", color: "#DC2626", border: "2px solid rgba(220,38,38,0.3)" }
                : { background: "#F8F9FA", color: "#9CA3AF", border: "1px solid #E5E7EB" }
              }>
              <XCircle size={14} /> Not Yet
            </button>
          </div>
          {entry.video_uploaded === null && (
            <p className="text-[11px] mt-1.5 flex items-center gap-1" style={{ color: "#F59E0B" }}>
              <AlertCircle size={11} /> Please select one — required before submitting
            </p>
          )}
        </div>

        {/* Screenshot URL — shown only when uploaded = true */}
        {entry.video_uploaded === true && (
          <div className="rounded-xl p-3 space-y-2"
            style={{ background: "rgba(34,197,94,0.05)", border: "1px solid rgba(34,197,94,0.2)" }}>
            <label style={{ ...LABEL, color: "#16A34A", marginBottom: 4 }}>
              <ImageIcon size={10} style={{ display: "inline", marginRight: 4 }} />
              Screenshot of uploaded clips <span style={{ color: "#DC2626" }}>*</span>
            </label>
            <input className="du" style={{ ...FIELD, borderColor: "rgba(34,197,94,0.3)" }}
              placeholder="Paste screenshot URL (Google Drive, Imgur, etc.)"
              value={entry.screenshot_url ?? ""}
              onChange={(e) => onChange({ screenshot_url: e.target.value })} />
            <p className="text-[11px]" style={{ color: "#6B7280" }}>
              Upload the screenshot to Google Drive / any cloud, then paste the link here.
            </p>
          </div>
        )}

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

// ── Video uploader (used inside EditCard) ─────────────────────
type UploadState = 'idle' | 'preparing' | 'uploading' | 'done' | 'error'

function VideoUploader({ clientName, onLink }: { clientName: string; onLink: (link: string) => void }) {
  const fileRef = useRef<HTMLInputElement>(null)
  const [state, setState] = useState<UploadState>('idle')
  const [progress, setProgress] = useState(0)
  const [fileName, setFileName] = useState('')
  const [link, setLink] = useState('')
  const [errMsg, setErrMsg] = useState('')

  async function handleFile(file: File) {
    if (!file) return
    setFileName(file.name)
    setState('preparing')
    setErrMsg('')

    try {
      // Step 1 — get resumable upload URL from our server
      const prepRes = await fetch('/api/drive/prepare', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          clientName: clientName || 'Uncategorized',
          fileName: file.name,
          mimeType: file.type || 'video/mp4',
          fileSize: file.size,
        }),
      })
      const prepData = await prepRes.json()
      if (!prepRes.ok) throw new Error(prepData.error ?? 'Failed to prepare upload')

      // Step 2 — upload directly from browser to Google Drive (bypass Vercel size limit)
      setState('uploading')
      const fileId = await new Promise<string>((resolve, reject) => {
        const xhr = new XMLHttpRequest()
        xhr.open('PUT', prepData.uploadUrl)
        xhr.setRequestHeader('Content-Type', file.type || 'video/mp4')

        xhr.upload.onprogress = (e) => {
          if (e.lengthComputable) setProgress(Math.round((e.loaded / e.total) * 100))
        }

        xhr.onload = () => {
          if (xhr.status === 200 || xhr.status === 201) {
            const data = JSON.parse(xhr.responseText)
            resolve(data.id)
          } else {
            reject(new Error(`Upload failed (${xhr.status})`))
          }
        }
        xhr.onerror = () => reject(new Error('Network error during upload'))
        xhr.send(file)
      })

      // Step 3 — make public, get shareable link
      const completeRes = await fetch('/api/drive/complete', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ fileId }),
      })
      const completeData = await completeRes.json()
      if (!completeRes.ok) throw new Error(completeData.error ?? 'Failed to finalise upload')

      setLink(completeData.driveLink)
      onLink(completeData.driveLink)
      setState('done')
    } catch (err: unknown) {
      setErrMsg(err instanceof Error ? err.message : 'Upload failed')
      setState('error')
    }
  }

  if (state === 'done') {
    return (
      <div className="rounded-xl p-3 flex items-center gap-3"
        style={{ background: "rgba(34,197,94,0.06)", border: "1px solid rgba(34,197,94,0.25)" }}>
        <CheckCircle2 size={18} style={{ color: "#16A34A", flexShrink: 0 }} />
        <div className="flex-1 min-w-0">
          <p className="text-[12px] font-bold" style={{ color: "#16A34A" }}>Uploaded to Drive</p>
          <p className="text-[11px] truncate" style={{ color: "#6B7280" }}>{fileName}</p>
        </div>
        <a href={link} target="_blank" rel="noreferrer"
          className="flex items-center gap-1 text-[11px] font-semibold px-2.5 py-1.5 rounded-lg"
          style={{ background: "rgba(34,197,94,0.12)", color: "#16A34A", border: "1px solid rgba(34,197,94,0.2)" }}>
          <ExternalLink size={11} /> View
        </a>
        <button type="button" onClick={() => { setState('idle'); setLink(''); setFileName(''); setProgress(0) }}
          className="text-[11px] px-2 py-1.5 rounded-lg"
          style={{ color: "#9CA3AF", border: "1px solid #E5E7EB" }}>
          Replace
        </button>
      </div>
    )
  }

  if (state === 'uploading') {
    return (
      <div className="rounded-xl p-3 space-y-2"
        style={{ background: "rgba(99,102,241,0.04)", border: "1px solid rgba(99,102,241,0.15)" }}>
        <div className="flex items-center gap-2">
          <Loader2 size={14} className="animate-spin" style={{ color: "#6366F1" }} />
          <span className="text-[12px] font-semibold" style={{ color: "#6366F1" }}>
            Uploading to Google Drive… {progress}%
          </span>
        </div>
        <div className="rounded-full overflow-hidden" style={{ background: "#E5E7EB", height: 6 }}>
          <div className="h-full rounded-full transition-all"
            style={{ width: `${progress}%`, background: "linear-gradient(90deg, #6366F1, #8B5CF6)" }} />
        </div>
        <p className="text-[11px]" style={{ color: "#9CA3AF" }}>{fileName}</p>
      </div>
    )
  }

  if (state === 'preparing') {
    return (
      <div className="rounded-xl p-3 flex items-center gap-2"
        style={{ background: "rgba(99,102,241,0.04)", border: "1px solid rgba(99,102,241,0.15)" }}>
        <Loader2 size={14} className="animate-spin" style={{ color: "#6366F1" }} />
        <span className="text-[12px]" style={{ color: "#6366F1" }}>Setting up Drive folder…</span>
      </div>
    )
  }

  return (
    <div>
      <input ref={fileRef} type="file" accept="video/*" className="hidden"
        onChange={(e) => { const f = e.target.files?.[0]; if (f) handleFile(f) }} />

      {state === 'error' && (
        <div className="flex items-center gap-2 px-3 py-2 rounded-lg mb-2"
          style={{ background: "rgba(220,38,38,0.06)", border: "1px solid rgba(220,38,38,0.2)" }}>
          <AlertCircle size={13} style={{ color: "#DC2626" }} />
          <span className="text-[12px]" style={{ color: "#DC2626" }}>{errMsg}</span>
        </div>
      )}

      <button type="button" onClick={() => fileRef.current?.click()}
        className="w-full flex flex-col items-center justify-center gap-2 py-6 rounded-xl transition-all"
        style={{ border: "2px dashed rgba(99,102,241,0.3)", background: "rgba(99,102,241,0.03)" }}
        onMouseEnter={e => (e.currentTarget as HTMLElement).style.background = "rgba(99,102,241,0.07)"}
        onMouseLeave={e => (e.currentTarget as HTMLElement).style.background = "rgba(99,102,241,0.03)"}>
        <div className="w-10 h-10 rounded-xl flex items-center justify-center"
          style={{ background: "rgba(99,102,241,0.12)" }}>
          <Upload size={18} style={{ color: "#6366F1" }} />
        </div>
        <div className="text-center">
          <p className="text-[13px] font-bold" style={{ color: "#6366F1" }}>Click to upload video</p>
          <p className="text-[11px] mt-0.5" style={{ color: "#9CA3AF" }}>
            Saves to Drive: MediaUploads / {new Date().getFullYear()} / {new Date().toLocaleString('en-US', { month: 'long' })} / {clientName || "Client"}
          </p>
        </div>
      </button>
    </div>
  )
}

// ── Edit entry card ────────────────────────────────────────────
function EditCard({ entry, i, projects, onChange, onRemove }: {
  entry: WorkEntryInput
  i: number
  projects: Project[]
  onChange: (patch: Partial<WorkEntryInput>) => void
  onRemove: () => void
}) {
  const [useTimeRange, setUseTimeRange] = useState(true)

  return (
    <div className="rounded-2xl overflow-hidden"
      style={{ border: "1px solid rgba(99,102,241,0.2)", boxShadow: "0 2px 8px rgba(99,102,241,0.06)" }}>

      {/* Card header */}
      <div className="flex items-center justify-between px-4 py-3"
        style={{ background: "rgba(99,102,241,0.06)", borderBottom: "1px solid rgba(99,102,241,0.12)" }}>
        <div className="flex items-center gap-2">
          <div className="w-7 h-7 rounded-lg flex items-center justify-center"
            style={{ background: "rgba(99,102,241,0.15)" }}>
            <Film size={14} style={{ color: "#6366F1" }} />
          </div>
          <span className="text-[13px] font-black" style={{ fontFamily: "var(--font-jakarta)", color: "#6366F1" }}>
            EDITING SESSION
          </span>
        </div>
        <button type="button" onClick={onRemove}
          className="w-7 h-7 rounded-lg flex items-center justify-center"
          style={{ background: "rgba(99,102,241,0.08)", border: "1px solid rgba(99,102,241,0.2)" }}>
          <Trash2 size={12} style={{ color: "#6366F1" }} />
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

        {/* Video title */}
        <div>
          <label style={LABEL}>Video Title <span style={{ color: "#DC2626" }}>*</span></label>
          <input className="du" style={FIELD}
            placeholder="e.g. Promo Reel, BTS Cut, Product Ad…"
            value={entry.title}
            onChange={(e) => onChange({ title: e.target.value })} />
        </div>

        {/* Hours worked */}
        <div>
          <div className="flex items-center justify-between mb-2">
            <label style={{ ...LABEL, marginBottom: 0 }}>
              Hours Worked <span style={{ color: "#DC2626" }}>*</span>
            </label>
            <button type="button"
              onClick={() => { setUseTimeRange((v) => !v); onChange({ start_time: "", end_time: "" }) }}
              className="text-[11px] font-semibold px-2.5 py-1 rounded-lg"
              style={{ background: "rgba(99,102,241,0.08)", color: "#6366F1", border: "1px solid rgba(99,102,241,0.2)" }}>
              {useTimeRange ? "Enter hours directly" : "Use time range"}
            </button>
          </div>

          {useTimeRange ? (
            <div className="grid grid-cols-3 gap-3">
              <div>
                <label style={LABEL}>Start</label>
                <input type="time" className="du" style={FIELD}
                  value={entry.start_time}
                  onChange={(e) => {
                    const dur = calcDuration(e.target.value, entry.end_time)
                    onChange({ start_time: e.target.value, duration_hours: dur })
                  }} />
              </div>
              <div>
                <label style={LABEL}>End</label>
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
                  style={{ height: "42px", background: "#F8F9FA", border: "1px solid #E5E7EB",
                    color: entry.duration_hours > 0 ? "#6366F1" : "#D1D5DB" }}>
                  {entry.duration_hours > 0 ? `${entry.duration_hours}h` : "—"}
                </div>
              </div>
            </div>
          ) : (
            <div className="flex items-center gap-3">
              <input type="number" min="0.5" max="24" step="0.5" className="du" style={{ ...FIELD, maxWidth: 140 }}
                placeholder="e.g. 2.5"
                value={entry.duration_hours || ""}
                onChange={(e) => onChange({ duration_hours: parseFloat(e.target.value) || 0 })} />
              <span className="text-[13px]" style={{ color: "#6B7280" }}>hours</span>
            </div>
          )}
        </div>

        {/* Video upload — goes straight to Drive */}
        <div className="space-y-2">
          <label style={LABEL}>
            <FolderOpen size={10} style={{ display: "inline", marginRight: 4 }} />
            Upload Edited Video <span style={{ color: "#DC2626" }}>*</span>
          </label>
          <VideoUploader
            clientName={entry.client_name}
            onLink={(link) => onChange({ video_link: link })}
          />
          {entry.video_link && (
            <input type="hidden" value={entry.video_link} readOnly />
          )}
        </div>

        {/* Notes */}
        <div>
          <label style={LABEL}>Notes</label>
          <textarea rows={2} className="du resize-none" style={FIELD}
            placeholder="Software used, effects, client feedback…"
            value={entry.notes ?? ""}
            onChange={(e) => onChange({ notes: e.target.value })} />
        </div>
      </div>
    </div>
  )
}

// ── Generic (upload / other) entry card ───────────────────────
function GenericCard({ entry, i, projects, onChange, onRemove }: {
  entry: WorkEntryInput
  i: number
  projects: Project[]
  onChange: (patch: Partial<WorkEntryInput>) => void
  onRemove: () => void
}) {
  return (
    <div className="rounded-2xl p-4 space-y-3"
      style={{ background: "#FFFFFF", border: "1px solid #E5E7EB" }}>
      <div className="flex items-center gap-2 flex-wrap">
        {TASK_TYPES.map(({ value, label, icon: Icon }) => (
          <button key={value} type="button"
            onClick={() => onChange({ task_type: value as TaskType, title: value === "shoot" ? "Shoot Session" : value === "edit" ? "Editing Session" : "" })}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[12px] font-bold transition-all"
            style={entry.task_type === value
              ? { background: "rgba(220,38,38,0.1)", color: "#DC2626", border: "1px solid rgba(220,38,38,0.25)" }
              : { background: "#F8F9FA", color: "#9CA3AF", border: "1px solid #E5E7EB" }
            }>
            <Icon size={11} /> {label}
          </button>
        ))}
        <button type="button" onClick={onRemove} className="ml-auto p-1.5 rounded-lg"
          style={{ background: "rgba(220,38,38,0.06)", border: "1px solid rgba(220,38,38,0.12)" }}>
          <Trash2 size={13} style={{ color: "#DC2626" }} />
        </button>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <ClientSelect
          projects={projects}
          value={entry.client_id ?? ""}
          onChange={(id, name) => onChange({ client_id: id || null, client_name: name })}
        />
        <div>
          <label style={LABEL}>Title *</label>
          <input className="du" style={FIELD}
            placeholder="Work title"
            value={entry.title}
            onChange={(e) => onChange({ title: e.target.value })} />
        </div>
      </div>

      <div className="grid grid-cols-3 gap-3">
        <div>
          <label style={LABEL}>Start Time</label>
          <input type="time" className="du" style={FIELD}
            value={entry.start_time}
            onChange={(e) => {
              const dur = calcDuration(e.target.value, entry.end_time)
              onChange({ start_time: e.target.value, duration_hours: dur })
            }} />
        </div>
        <div>
          <label style={LABEL}>End Time</label>
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
              height: "42px", background: "#F8F9FA", border: "1px solid #E5E7EB",
              color: entry.duration_hours > 0 ? "#DC2626" : "#D1D5DB",
            }}>
            {entry.duration_hours > 0 ? `${entry.duration_hours}h` : "—"}
          </div>
        </div>
      </div>

      <div>
        <label style={LABEL}>Notes</label>
        <textarea rows={2} className="du resize-none" style={FIELD}
          placeholder="What was done?"
          value={entry.notes ?? ""}
          onChange={(e) => onChange({ notes: e.target.value })} />
      </div>
    </div>
  )
}

// ── Main form ──────────────────────────────────────────────────
export default function DailyUpdateForm({ projects }: { projects: Project[] }) {
  const router = useRouter()
  const params = useSearchParams()
  const [pending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)
  const [tab, setTab] = useState<"working" | "learning">("working")

  const prefillEntry: WorkEntryInput = {
    ...newEntry(),
    client_id:   params.get("client_id") ?? null,
    client_name: params.get("client_name") ?? "",
    title:       params.get("task_title") ?? "Shoot Session",
  }

  const [entries, setEntries] = useState<WorkEntryInput[]>([prefillEntry])
  const [links, setLinks] = useState<string[]>([])
  const [newLink, setNewLink] = useState("")
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

  function addEntry() {
    setEntries((prev) => [...prev, newEntry()])
  }

  function addLink() {
    const v = newLink.trim()
    if (v) { setLinks((prev) => [...prev, v]); setNewLink("") }
  }

  // Client-side validation for media-specific required fields
  function validate(): string | null {
    for (let i = 0; i < entries.length; i++) {
      const e = entries[i]
      const n = i + 1
      if (e.task_type === "shoot") {
        if (!e.client_id && !e.client_name) return `Entry ${n}: Client is required for a shoot`
        if (!e.start_time || !e.end_time) return `Entry ${n}: Start and end time are required for a shoot`
        if (e.duration_hours <= 0) return `Entry ${n}: End time must be after start time`
        if (e.video_uploaded === null || e.video_uploaded === undefined) return `Entry ${n}: Please indicate if shoot clips were uploaded`
        if (e.video_uploaded === true && !e.screenshot_url?.trim()) return `Entry ${n}: Please paste the screenshot URL of uploaded clips`
      }
      if (e.task_type === "edit") {
        if (!e.client_id && !e.client_name) return `Entry ${n}: Client is required for editing`
        if (e.duration_hours <= 0) return `Entry ${n}: Hours worked is required for editing`
        if (!e.video_link?.trim()) return `Entry ${n}: Edited video link is required before submitting`
      }
    }
    return null
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)

    if (tab === "working") {
      const validationError = validate()
      if (validationError) { setError(validationError); return }
    }

    startTransition(async () => {
      const result = await submitDailyUpdate({
        active_tab:   tab,
        work_entries: tab === "working" ? entries : [],
        links,
        shoot_count:  entries.filter((e) => e.task_type === "shoot").length,
        editing_count: entries.filter((e) => e.task_type === "edit").length,
        learning_topic:  learningTopic || undefined,
        learning_hours:  parseFloat(learningHours) || 0,
        learning_notes:  learningNotes || undefined,
      })

      if (result.success) {
        router.push("/member/dashboard")
        router.refresh()
      } else {
        setError(result.error ?? "Something went wrong")
      }
    })
  }

  const totalHours = Math.round(entries.reduce((s, e) => s + e.duration_hours, 0) * 10) / 10

  return (
    <>
      <style>{`
        .du::placeholder { color: #9CA3AF; }
        .du:focus { border-color: rgba(220,38,38,0.4) !important; box-shadow: 0 0 0 2px rgba(220,38,38,0.06); }
        .du-sel { appearance: none; }
      `}</style>

      {/* Tab switcher */}
      <div className="flex gap-2 mb-6 p-1 rounded-xl" style={{ background: "#F8F9FA", border: "1px solid #E5E7EB" }}>
        {(["working", "learning"] as const).map((t) => {
          const Icon = t === "working" ? Briefcase : BookOpen
          const active = tab === t
          return (
            <button key={t} type="button" onClick={() => setTab(t)}
              className="flex-1 flex items-center justify-center gap-2 py-2.5 rounded-lg text-[13px] font-bold capitalize transition-all"
              style={active
                ? { background: "#FFFFFF", color: "#111111", border: "1px solid #E5E7EB", boxShadow: "0 1px 4px rgba(0,0,0,0.08)" }
                : { background: "transparent", color: "#9CA3AF", border: "1px solid transparent" }
              }>
              <Icon size={14} style={{ color: active ? "#DC2626" : "#9CA3AF" }} />
              {t === "working" ? "Working" : "Learning"}
            </button>
          )
        })}
      </div>

      <form onSubmit={handleSubmit} className="space-y-5">

        {/* ── Working tab ──────────────────────────────── */}
        {tab === "working" && (
          <>
            <div>
              <div className="flex items-center justify-between mb-3">
                <div>
                  <p style={{ ...LABEL, marginBottom: 2 }}>Work Entries</p>
                  {totalHours > 0 && (
                    <p className="text-[11px] font-semibold" style={{ color: "#DC2626" }}>
                      Total: {totalHours}h
                    </p>
                  )}
                </div>
                <button type="button" onClick={addEntry}
                  className="flex items-center gap-1.5 text-[12px] font-bold px-3 py-1.5 rounded-lg"
                  style={{ background: "rgba(220,38,38,0.08)", color: "#DC2626", border: "1px solid rgba(220,38,38,0.15)" }}>
                  <Plus size={12} /> Add Entry
                </button>
              </div>

              <div className="space-y-4">
                {entries.map((entry, i) => {
                  const props = { entry, i, projects, onChange: (p: Partial<WorkEntryInput>) => updateEntry(i, p), onRemove: () => removeEntry(i) }
                  if (entry.task_type === "shoot") return <ShootCard key={entry.id} {...props} />
                  if (entry.task_type === "edit")  return <EditCard  key={entry.id} {...props} />
                  return <GenericCard key={entry.id} {...props} />
                })}
              </div>
            </div>

            {/* Attachment links */}
            <div>
              <label style={LABEL}>Attachment Links</label>
              <div className="flex gap-2 mb-2">
                <input className="du flex-1" style={FIELD}
                  placeholder="Paste Drive / Figma / GitHub link…"
                  value={newLink}
                  onChange={(e) => setNewLink(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && (e.preventDefault(), addLink())} />
                <button type="button" onClick={addLink}
                  className="px-3 rounded-lg text-[12px] font-bold"
                  style={{ background: "rgba(220,38,38,0.08)", color: "#DC2626", border: "1px solid rgba(220,38,38,0.15)" }}>
                  <Plus size={14} />
                </button>
              </div>
              {links.length > 0 && (
                <div className="space-y-1.5">
                  {links.map((lnk, i) => (
                    <div key={i} className="flex items-center gap-2 px-3 py-2 rounded-lg"
                      style={{ background: "#F8F9FA", border: "1px solid #E5E7EB" }}>
                      <Link2 size={12} style={{ color: "#9CA3AF" }} />
                      <span className="flex-1 text-[12px] truncate" style={{ color: "#4B5563" }}>{lnk}</span>
                      <button type="button" onClick={() => setLinks((p) => p.filter((_, idx) => idx !== i))}>
                        <Trash2 size={11} style={{ color: "rgba(220,38,38,0.5)" }} />
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </>
        )}

        {/* ── Learning tab ─────────────────────────────── */}
        {tab === "learning" && (
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
                <input type="number" min="0.5" max="24" step="0.5" className="du" style={{ ...FIELD, maxWidth: 160 }}
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
              style={{ background: "rgba(220,38,38,0.06)", border: "1px solid rgba(220,38,38,0.15)" }}>
              <BookOpen size={13} style={{ color: "#DC2626" }} />
              <p className="text-[12px]" style={{ color: "#6B7280" }}>
                Learning hours count toward your daily productivity score.
              </p>
            </div>
          </div>
        )}

        {/* Total hours bar */}
        {tab === "working" && totalHours > 0 && (
          <div className="flex items-center gap-3 px-4 py-3 rounded-xl"
            style={{ background: "rgba(220,38,38,0.05)", border: "1px solid rgba(220,38,38,0.15)" }}>
            <Clock size={14} style={{ color: "#DC2626" }} />
            <p className="text-[13px] font-semibold" style={{ color: "#DC2626" }}>
              {totalHours}h total across {entries.length} entr{entries.length === 1 ? "y" : "ies"}
            </p>
          </div>
        )}

        {/* Error */}
        {error && (
          <div className="flex items-start gap-2.5 px-4 py-3 rounded-xl"
            style={{ background: "rgba(220,38,38,0.06)", border: "1px solid rgba(220,38,38,0.2)" }}>
            <AlertCircle size={15} className="flex-shrink-0 mt-0.5" style={{ color: "#DC2626" }} />
            <span className="text-[13px]" style={{ color: "#DC2626" }}>{error}</span>
          </div>
        )}

        {/* Submit */}
        <button type="submit" disabled={pending}
          className="w-full py-3.5 rounded-xl text-[14px] font-black flex items-center justify-center gap-2 transition-all"
          style={{
            background: pending ? "rgba(220,38,38,0.5)" : "linear-gradient(135deg, #DC2626, #7F1D1D)",
            color: "#FFFFFF",
            boxShadow: pending ? "none" : "0 4px 16px rgba(220,38,38,0.3)",
            cursor: pending ? "not-allowed" : "pointer",
          }}>
          {pending && <Loader2 size={16} className="animate-spin" />}
          {pending ? "Submitting…" : "Submit Daily Update →"}
        </button>
      </form>
    </>
  )
}
