"use client"

import { useState, useTransition, useRef } from "react"
import { useRouter } from "next/navigation"
import {
  Plus, Trash2, Loader2, BookOpen,
  Camera, Film, Upload, Link2, ChevronDown,
  CheckCircle2, XCircle, AlertCircle,
  FolderOpen, ExternalLink, ArrowLeft, Scissors,
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
  background: "#F8F9FA", border: "1px solid #E5E7EB",
  color: "#111111", borderRadius: "10px",
  padding: "10px 14px", fontSize: "13px",
  outline: "none", width: "100%",
}
const LABEL: React.CSSProperties = {
  display: "block", fontSize: "10px", fontWeight: 700,
  textTransform: "uppercase", letterSpacing: "0.16em",
  marginBottom: "6px", color: "#6B7280",
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

// ── Drive uploader ─────────────────────────────────────────────
type UploadState = "idle" | "preparing" | "uploading" | "done" | "error"

function DriveUploader({ clientName, onLink, label = "Upload to Drive" }: {
  clientName: string
  onLink: (link: string) => void
  label?: string
}) {
  const fileRef = useRef<HTMLInputElement>(null)
  const [state, setState] = useState<UploadState>("idle")
  const [progress, setProgress] = useState(0)
  const [fileName, setFileName] = useState("")
  const [link, setLink] = useState("")
  const [errMsg, setErrMsg] = useState("")

  async function handleFile(file: File) {
    if (!file) return
    setFileName(file.name)
    setState("preparing")
    setErrMsg("")

    try {
      const prepRes = await fetch("/api/drive/prepare", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          clientName: clientName || "Uncategorized",
          fileName: file.name,
          mimeType: file.type || "video/mp4",
          fileSize: file.size,
        }),
      })
      const prepData = await prepRes.json()
      if (!prepRes.ok) throw new Error(prepData.error ?? "Failed to prepare upload")

      setState("uploading")
      const fileId = await new Promise<string>((resolve, reject) => {
        const xhr = new XMLHttpRequest()
        xhr.open("PUT", prepData.uploadUrl)
        xhr.setRequestHeader("Content-Type", file.type || "video/mp4")
        xhr.upload.onprogress = (e) => {
          if (e.lengthComputable) setProgress(Math.round((e.loaded / e.total) * 100))
        }
        xhr.onload = () => {
          if (xhr.status === 200 || xhr.status === 201) {
            resolve(JSON.parse(xhr.responseText).id)
          } else {
            reject(new Error(`Upload failed (${xhr.status})`))
          }
        }
        xhr.onerror = () => reject(new Error("Network error during upload"))
        xhr.send(file)
      })

      const completeRes = await fetch("/api/drive/complete", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ fileId }),
      })
      const completeData = await completeRes.json()
      if (!completeRes.ok) throw new Error(completeData.error ?? "Failed to finalise upload")

      setLink(completeData.driveLink)
      onLink(completeData.driveLink)
      setState("done")
    } catch (err: unknown) {
      setErrMsg(err instanceof Error ? err.message : "Upload failed")
      setState("error")
    }
  }

  if (state === "done") {
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
        <button type="button" onClick={() => { setState("idle"); setLink(""); setFileName(""); setProgress(0) }}
          className="text-[11px] px-2 py-1.5 rounded-lg"
          style={{ color: "#9CA3AF", border: "1px solid #E5E7EB" }}>
          Replace
        </button>
      </div>
    )
  }

  if (state === "uploading") {
    return (
      <div className="rounded-xl p-3 space-y-2"
        style={{ background: "rgba(99,102,241,0.04)", border: "1px solid rgba(99,102,241,0.15)" }}>
        <div className="flex items-center gap-2">
          <Loader2 size={14} className="animate-spin" style={{ color: "#6366F1" }} />
          <span className="text-[12px] font-semibold" style={{ color: "#6366F1" }}>
            Uploading… {progress}%
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

  if (state === "preparing") {
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
      <input ref={fileRef} type="file" accept="video/*,image/*" className="hidden"
        onChange={(e) => { const f = e.target.files?.[0]; if (f) handleFile(f) }} />
      {state === "error" && (
        <div className="flex items-center gap-2 px-3 py-2 rounded-lg mb-2"
          style={{ background: "rgba(220,38,38,0.06)", border: "1px solid rgba(220,38,38,0.2)" }}>
          <AlertCircle size={13} style={{ color: "#DC2626" }} />
          <span className="text-[12px]" style={{ color: "#DC2626" }}>{errMsg}</span>
        </div>
      )}
      <button type="button" onClick={() => fileRef.current?.click()}
        className="w-full flex flex-col items-center justify-center gap-2 py-5 rounded-xl transition-all"
        style={{ border: "2px dashed rgba(220,38,38,0.25)", background: "rgba(220,38,38,0.02)" }}
        onMouseEnter={e => (e.currentTarget as HTMLElement).style.background = "rgba(220,38,38,0.06)"}
        onMouseLeave={e => (e.currentTarget as HTMLElement).style.background = "rgba(220,38,38,0.02)"}>
        <div className="w-9 h-9 rounded-xl flex items-center justify-center"
          style={{ background: "rgba(220,38,38,0.1)" }}>
          <Upload size={16} style={{ color: "#DC2626" }} />
        </div>
        <div className="text-center">
          <p className="text-[12px] font-bold" style={{ color: "#DC2626" }}>
            {label}
          </p>
          <p className="text-[11px] mt-0.5" style={{ color: "#9CA3AF" }}>
            → Drive: {new Date().getFullYear()} / {new Date().toLocaleString("en-US", { month: "long" })} / {clientName || "Client"}
          </p>
        </div>
      </button>
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
      style={{ border: "1px solid rgba(220,38,38,0.2)", boxShadow: "0 2px 8px rgba(220,38,38,0.06)" }}>

      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3"
        style={{ background: "rgba(220,38,38,0.06)", borderBottom: "1px solid rgba(220,38,38,0.12)" }}>
        <div className="flex items-center gap-2">
          <div className="w-7 h-7 rounded-lg flex items-center justify-center"
            style={{ background: "rgba(220,38,38,0.15)" }}>
            <Camera size={14} style={{ color: "#DC2626" }} />
          </div>
          <span className="text-[13px] font-black" style={{ fontFamily: "var(--font-jakarta)", color: "#DC2626" }}>
            SHOOT {i + 1}
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

        {/* Timing row */}
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
              style={{ color: "#9CA3AF" }} />
          </div>
        </div>

        {/* Expenses row */}
        <div className="grid grid-cols-2 gap-3">
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

        {/* Clip upload */}
        <div>
          <label style={{ ...LABEL, marginBottom: "10px" }}>
            Upload Clips <span style={{ color: "#9CA3AF", fontWeight: 400, textTransform: "none", fontSize: "11px" }}>(optional)</span>
          </label>
          {entry.screenshot_url ? (
            <div className="rounded-xl p-3 flex items-center gap-3"
              style={{ background: "rgba(34,197,94,0.06)", border: "1px solid rgba(34,197,94,0.25)" }}>
              <CheckCircle2 size={18} style={{ color: "#16A34A", flexShrink: 0 }} />
              <div className="flex-1 min-w-0">
                <p className="text-[12px] font-bold" style={{ color: "#16A34A" }}>Clips uploaded to Drive</p>
                <p className="text-[11px] truncate" style={{ color: "#6B7280" }}>{entry.screenshot_url}</p>
              </div>
              <a href={entry.screenshot_url} target="_blank" rel="noreferrer"
                className="flex items-center gap-1 text-[11px] font-semibold px-2.5 py-1.5 rounded-lg"
                style={{ background: "rgba(34,197,94,0.12)", color: "#16A34A", border: "1px solid rgba(34,197,94,0.2)" }}>
                <ExternalLink size={11} /> View
              </a>
              <button type="button"
                onClick={() => onChange({ screenshot_url: "", video_uploaded: false })}
                className="text-[11px] px-2 py-1.5 rounded-lg"
                style={{ color: "#9CA3AF", border: "1px solid #E5E7EB" }}>
                Replace
              </button>
            </div>
          ) : (
            <DriveUploader
              clientName={entry.client_name}
              label="Upload Shoot Clips"
              onLink={(link) => onChange({ screenshot_url: link, video_uploaded: true })}
            />
          )}
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
      style={{ background: "#F8F9FA", border: "1px solid #E5E7EB" }}>

      <div className="flex items-center justify-between">
        <span className="text-[11px] font-black uppercase tracking-[0.15em]"
          style={{ color: "#6366F1" }}>Video {index + 1}</span>
        <button type="button" onClick={onRemove}
          className="w-6 h-6 rounded-lg flex items-center justify-center"
          style={{ background: "rgba(220,38,38,0.08)", border: "1px solid rgba(220,38,38,0.15)" }}>
          <Trash2 size={10} style={{ color: "#DC2626" }} />
        </button>
      </div>

      {/* Video Name | Client | Video Type */}
      <div className="grid grid-cols-3 gap-2">
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
                style={{ color: "#9CA3AF" }} />
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
              style={{ color: "#9CA3AF" }} />
          </div>
        </div>
      </div>

      {/* Date Given | Date Finished | Duration */}
      <div className="grid grid-cols-3 gap-2">
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
      <div className="grid grid-cols-3 gap-2">
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
                : { background: "#FFFFFF", color: "#9CA3AF", border: "1px solid #E5E7EB" }}>
              <CheckCircle2 size={11} /> Yes
            </button>
            <button type="button"
              onClick={() => onChange({ drive_updated: false, drive_link: "" })}
              className="flex-1 flex items-center justify-center gap-1 py-2 rounded-lg text-[11px] font-bold transition-all"
              style={!video.drive_updated
                ? { background: "rgba(239,68,68,0.08)", color: "#DC2626", border: "1.5px solid rgba(220,38,38,0.25)" }
                : { background: "#FFFFFF", color: "#9CA3AF", border: "1px solid #E5E7EB" }}>
              <XCircle size={11} /> No
            </button>
          </div>
        </div>
      </div>

      {video.drive_updated && (
        <div className="space-y-1.5">
          <label style={{ ...LABEL, color: "#16A34A", marginBottom: 2 }}>
            <FolderOpen size={10} style={{ display: "inline", marginRight: 4 }} />
            Upload Final Video <span style={{ color: "#DC2626" }}>*</span>
          </label>
          {video.drive_link ? (
            <div className="flex items-center gap-2 px-3 py-2.5 rounded-xl"
              style={{ background: "rgba(34,197,94,0.06)", border: "1px solid rgba(34,197,94,0.2)" }}>
              <CheckCircle2 size={14} style={{ color: "#16A34A" }} />
              <span className="flex-1 text-[11px] truncate" style={{ color: "#374151" }}>{video.drive_link}</span>
              <a href={video.drive_link} target="_blank" rel="noreferrer"
                className="text-[11px] font-semibold px-2 py-1 rounded-lg"
                style={{ color: "#16A34A", border: "1px solid rgba(34,197,94,0.3)" }}>
                <ExternalLink size={11} />
              </a>
              <button type="button" onClick={() => onChange({ drive_link: "" })}
                className="text-[11px] px-2 py-1 rounded-lg"
                style={{ color: "#9CA3AF", border: "1px solid #E5E7EB" }}>Replace</button>
            </div>
          ) : (
            <DriveUploader
              clientName={video.client_name}
              label="Upload Final Video"
              onLink={(link) => onChange({ drive_link: link })}
            />
          )}
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
        {videos.length === 0 && (
          <div className="text-center py-6 rounded-xl"
            style={{ border: "2px dashed rgba(99,102,241,0.2)", background: "rgba(99,102,241,0.02)" }}>
            <Film size={22} className="mx-auto mb-2" style={{ color: "rgba(99,102,241,0.3)" }} />
            <p className="text-[12px]" style={{ color: "#9CA3AF" }}>No videos logged yet</p>
          </div>
        )}

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

        <button type="button" onClick={() => onChange({ editing_videos: [...videos, newEditingVideo()] })}
          className="w-full flex items-center justify-center gap-2 py-2.5 rounded-xl text-[12px] font-bold transition-all"
          style={{ background: "rgba(99,102,241,0.06)", color: "#6366F1", border: "1.5px dashed rgba(99,102,241,0.3)" }}
          onMouseEnter={e => (e.currentTarget as HTMLElement).style.background = "rgba(99,102,241,0.1)"}
          onMouseLeave={e => (e.currentTarget as HTMLElement).style.background = "rgba(99,102,241,0.06)"}>
          <Plus size={13} /> Add Video
        </button>

        <div>
          <label style={LABEL}>Session Notes</label>
          <textarea rows={2} className="du resize-none" style={FIELD}
            placeholder="Software used, feedback, blockers…"
            value={entry.notes ?? ""}
            onChange={(e) => onChange({ notes: e.target.value })} />
        </div>
      </div>
    </div>
  )
}

// ── Main form ──────────────────────────────────────────────────
export default function DailyUpdateForm({ projects }: { projects: Project[] }) {
  const router = useRouter()
  const [pending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)

  // Step flow
  const [step, setStep] = useState<FlowStep>("type-select")
  const [mode, setMode] = useState<FlowMode | null>(null)

  // Form data
  const [entries, setEntries] = useState<WorkEntryInput[]>([])
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

  function selectType(m: FlowMode) {
    setMode(m)
    setError(null)
    if (m === "learning") {
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

  function addLink() {
    const v = newLink.trim()
    if (v) { setLinks((prev) => [...prev, v]); setNewLink("") }
  }

  function validate(): string | null {
    for (let i = 0; i < entries.length; i++) {
      const e = entries[i]
      const n = i + 1
      if (e.task_type === "shoot") {
        if (!e.client_id && !e.client_name) return `Shoot ${n}: Client is required`
        if (!e.start_time || !e.end_time) return `Shoot ${n}: Start and end time are required`
        if (e.duration_hours <= 0) return `Shoot ${n}: End time must be after start time`
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
        links,
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
        .du::placeholder { color: #9CA3AF; }
        .du:focus { border-color: rgba(220,38,38,0.4) !important; box-shadow: 0 0 0 2px rgba(220,38,38,0.06); }
        .du-sel { appearance: none; }
      `}</style>

      {/* ── STEP 1: Type Select ─────────────────────────────── */}
      {step === "type-select" && (
        <div className="space-y-3">
          <p className="text-[11px] font-bold uppercase tracking-[0.16em] mb-5"
            style={{ color: "#9CA3AF" }}>What did you work on today?</p>

          {/* Shooting card */}
          <button type="button" onClick={() => selectType("shoot")}
            className="w-full flex items-center gap-4 p-5 rounded-2xl text-left transition-all group"
            style={{ background: "rgba(220,38,38,0.04)", border: "2px solid rgba(220,38,38,0.18)" }}
            onMouseEnter={e => {
              (e.currentTarget as HTMLElement).style.background = "rgba(220,38,38,0.09)"
              ;(e.currentTarget as HTMLElement).style.borderColor = "rgba(220,38,38,0.35)"
            }}
            onMouseLeave={e => {
              (e.currentTarget as HTMLElement).style.background = "rgba(220,38,38,0.04)"
              ;(e.currentTarget as HTMLElement).style.borderColor = "rgba(220,38,38,0.18)"
            }}>
            <div className="w-14 h-14 rounded-2xl flex items-center justify-center flex-shrink-0"
              style={{ background: "rgba(220,38,38,0.12)" }}>
              <Camera size={26} style={{ color: "#DC2626" }} />
            </div>
            <div className="flex-1">
              <p className="text-[18px] font-black" style={{ color: "#DC2626" }}>Shooting</p>
              <p className="text-[12px] mt-0.5" style={{ color: "#9CA3AF" }}>Log shoot sessions, timing, travel & expenses</p>
            </div>
            <div className="w-8 h-8 rounded-full flex items-center justify-center"
              style={{ background: "rgba(220,38,38,0.1)", color: "#DC2626", fontSize: 18 }}>→</div>
          </button>

          {/* Editing card */}
          <button type="button" onClick={() => selectType("edit")}
            className="w-full flex items-center gap-4 p-5 rounded-2xl text-left transition-all"
            style={{ background: "rgba(99,102,241,0.04)", border: "2px solid rgba(99,102,241,0.18)" }}
            onMouseEnter={e => {
              (e.currentTarget as HTMLElement).style.background = "rgba(99,102,241,0.09)"
              ;(e.currentTarget as HTMLElement).style.borderColor = "rgba(99,102,241,0.35)"
            }}
            onMouseLeave={e => {
              (e.currentTarget as HTMLElement).style.background = "rgba(99,102,241,0.04)"
              ;(e.currentTarget as HTMLElement).style.borderColor = "rgba(99,102,241,0.18)"
            }}>
            <div className="w-14 h-14 rounded-2xl flex items-center justify-center flex-shrink-0"
              style={{ background: "rgba(99,102,241,0.12)" }}>
              <Scissors size={26} style={{ color: "#6366F1" }} />
            </div>
            <div className="flex-1">
              <p className="text-[18px] font-black" style={{ color: "#6366F1" }}>Editing</p>
              <p className="text-[12px] mt-0.5" style={{ color: "#9CA3AF" }}>Log videos edited, timelines & Drive uploads</p>
            </div>
            <div className="w-8 h-8 rounded-full flex items-center justify-center"
              style={{ background: "rgba(99,102,241,0.1)", color: "#6366F1", fontSize: 18 }}>→</div>
          </button>

          {/* Divider */}
          <div className="flex items-center gap-3 py-2">
            <div className="flex-1 h-px" style={{ background: "#E5E7EB" }} />
            <span className="text-[11px]" style={{ color: "#9CA3AF" }}>or</span>
            <div className="flex-1 h-px" style={{ background: "#E5E7EB" }} />
          </div>

          {/* Learning */}
          <button type="button" onClick={() => selectType("learning")}
            className="w-full flex items-center gap-3 px-4 py-3 rounded-xl transition-all"
            style={{ background: "#F8F9FA", border: "1px solid #E5E7EB" }}
            onMouseEnter={e => (e.currentTarget as HTMLElement).style.background = "#F1F5F9"}
            onMouseLeave={e => (e.currentTarget as HTMLElement).style.background = "#F8F9FA"}>
            <BookOpen size={16} style={{ color: "#9CA3AF" }} />
            <span className="text-[13px] font-semibold" style={{ color: "#6B7280" }}>Learning Day</span>
            <span className="ml-auto text-[11px]" style={{ color: "#D1D5DB" }}>→</span>
          </button>
        </div>
      )}

      {/* ── STEP 2: Count Select ────────────────────────────── */}
      {step === "count-select" && (
        <div className="space-y-6">
          <button type="button" onClick={goBack}
            className="flex items-center gap-1.5 text-[12px] font-semibold"
            style={{ color: "#9CA3AF" }}>
            <ArrowLeft size={14} /> Back
          </button>

          <div>
            <p className="text-[22px] font-black mb-1" style={{ color: "#111111" }}>
              {mode === "shoot" ? "How many shoots today?" : "How many videos edited?"}
            </p>
            <p className="text-[13px]" style={{ color: "#9CA3AF" }}>
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
                  background: mode === "shoot" ? "rgba(220,38,38,0.06)" : "rgba(99,102,241,0.06)",
                  border: mode === "shoot" ? "2px solid rgba(220,38,38,0.18)" : "2px solid rgba(99,102,241,0.18)",
                  color: mode === "shoot" ? "#DC2626" : "#6366F1",
                }}
                onMouseEnter={e => {
                  (e.currentTarget as HTMLElement).style.background = mode === "shoot"
                    ? "rgba(220,38,38,0.14)" : "rgba(99,102,241,0.14)"
                  ;(e.currentTarget as HTMLElement).style.transform = "scale(1.04)"
                }}
                onMouseLeave={e => {
                  (e.currentTarget as HTMLElement).style.background = mode === "shoot"
                    ? "rgba(220,38,38,0.06)" : "rgba(99,102,241,0.06)"
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
              style={{ color: "#9CA3AF" }}>
              <ArrowLeft size={14} /> Back
            </button>
            {mode !== "learning" && (
              <div className="flex items-center gap-2">
                {shootCount > 0 && (
                  <span className="text-[11px] font-bold px-2.5 py-1 rounded-full"
                    style={{ background: "rgba(220,38,38,0.1)", color: "#DC2626" }}>
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
                    style={{ background: "rgba(220,38,38,0.08)", color: "#DC2626" }}>
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
                style={{ background: "rgba(220,38,38,0.06)", border: "1px solid rgba(220,38,38,0.15)" }}>
                <BookOpen size={13} style={{ color: "#DC2626" }} />
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

              {/* Add another button */}
              <button
                type="button"
                onClick={() => setEntries((prev) => [...prev, newEntry(mode === "shoot" ? "shoot" : "edit")])}
                className="w-full flex items-center justify-center gap-2 py-3 rounded-2xl text-[13px] font-bold transition-all"
                style={mode === "shoot"
                  ? { background: "rgba(220,38,38,0.05)", color: "#DC2626", border: "2px dashed rgba(220,38,38,0.22)" }
                  : { background: "rgba(99,102,241,0.05)", color: "#6366F1", border: "2px dashed rgba(99,102,241,0.22)" }}
                onMouseEnter={e => (e.currentTarget as HTMLElement).style.background =
                  mode === "shoot" ? "rgba(220,38,38,0.1)" : "rgba(99,102,241,0.1)"}
                onMouseLeave={e => (e.currentTarget as HTMLElement).style.background =
                  mode === "shoot" ? "rgba(220,38,38,0.05)" : "rgba(99,102,241,0.05)"}>
                <Plus size={15} />
                {mode === "shoot" ? "Add Another Shoot" : "Add Another Editing Session"}
              </button>

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
      )}
    </>
  )
}
