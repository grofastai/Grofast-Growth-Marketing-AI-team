"use client"

import { useState, useMemo, useTransition, useEffect, useRef } from "react"
import { useRouter } from "next/navigation"
import Link from "next/link"
import {
  Plus, X, Star, Mic, Scissors, Camera, UserCog, Phone, Calendar,
  Clock, DollarSign, CheckCircle, Trash2, CreditCard, ChevronDown,
  ChevronUp, Edit2, Search, IndianRupee, HardDrive, RotateCcw,
  Check, AlertCircle, ExternalLink, Users2,
} from "lucide-react"
import {
  createFreelancer, updateFreelancer, deleteFreelancer,
  createWorkEntry, updateWorkEntry, markWorkEntryPaid, deleteWorkEntry,
  updateWorkEntryStatus,
} from "@/lib/actions/freelancers"
import type { Freelancer, WorkEntry, FreelancerStats, FreelancerType } from "./types"

type TeamMemberOption = { id: string; name: string; employee_id: string }

// ── Constants ────────────────────────────────────────────────────────────────

const TYPE_CFG: Record<FreelancerType, { label: string; color: string; bg: string; border: string; Icon: React.FC<{ size?: number; strokeWidth?: number }> }> = {
  voice_over:    { label: "Voice Over",    color: "#8b5cf6", bg: "rgba(139,92,246,0.08)",  border: "rgba(139,92,246,0.25)",  Icon: (p) => <Mic {...p} /> },
  video_editor:  { label: "Video Editor",  color: "#0ea5e9", bg: "rgba(14,165,233,0.08)",  border: "rgba(14,165,233,0.25)",  Icon: (p) => <Scissors {...p} /> },
  video_shooter: { label: "Video Shooter", color: "#10b981", bg: "rgba(16,185,129,0.08)",  border: "rgba(16,185,129,0.25)",  Icon: (p) => <Camera {...p} /> },
  other:         { label: "Other",         color: "#6b7280", bg: "rgba(107,114,128,0.08)", border: "rgba(107,114,128,0.25)", Icon: (p) => <UserCog {...p} /> },
}

const SOFTWARE_OPTS = ["Adobe Premiere Pro", "Final Cut Pro", "DaVinci Resolve", "After Effects", "Adobe Rush", "CapCut", "Vegas Pro"]
const VIDEO_TYPES   = ["Reels", "YouTube", "Corporate", "Wedding", "Product", "Documentary", "Social Media", "Ad Film", "Testimonial"]
const VOICE_TYPES   = ["Commercial Tone", "Emotional Tone", "High Pitch", "Base Voice", "Warm & Friendly", "Deep & Authoritative", "Neutral", "Energetic", "Soft & Calm"]
const WK_STATUSES   = ["pending", "in_progress", "completed", "cancelled"]

function fmt(n: number | null) {
  if (!n) return "—"
  return `₹${n.toLocaleString("en-IN", { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`
}

// ── Star Rating ───────────────────────────────────────────────────────────────

function StarRating({ value, onChange }: { value: number; onChange: (v: number) => void }) {
  return (
    <div className="flex items-center gap-1">
      {[1, 2, 3, 4, 5].map(n => (
        <button key={n} type="button" onClick={() => onChange(n === value ? 0 : n)}
          className="transition-transform hover:scale-110 active:scale-90 focus-visible:outline-none">
          <Star size={22} fill={n <= value ? "#f59e0b" : "none"} strokeWidth={1.5}
            style={{ color: n <= value ? "#f59e0b" : "#d1d5db" }} />
        </button>
      ))}
      <span className="text-[12px] text-gray-400 ml-1">{value ? `${value}/5` : "No rating"}</span>
    </div>
  )
}

function StarDisplay({ rating, size = 12 }: { rating: number; size?: number }) {
  return (
    <div className="flex items-center gap-0.5">
      {[1, 2, 3, 4, 5].map(n => (
        <Star key={n} size={size} fill={n <= rating ? "#f59e0b" : "none"} strokeWidth={1.5}
          style={{ color: n <= rating ? "#f59e0b" : "#d1d5db" }} />
      ))}
    </div>
  )
}

// ── Chip multi-select ─────────────────────────────────────────────────────────

function ChipSelect({ options, selected, onChange, label }: {
  options: string[]; selected: string[]; onChange: (v: string[]) => void; label: string
}) {
  return (
    <div>
      <label className="block text-[11px] font-semibold uppercase tracking-wider text-gray-500 mb-2">{label}</label>
      <div className="flex flex-wrap gap-1.5">
        {options.map(opt => {
          const on = selected.includes(opt)
          return (
            <button key={opt} type="button"
              onClick={() => onChange(on ? selected.filter(s => s !== opt) : [...selected, opt])}
              className="px-2.5 py-1 rounded-lg text-[11px] font-semibold transition-all"
              style={on
                ? { background: "#DE1A1A", color: "#fff", border: "1.5px solid #DE1A1A" }
                : { background: "#f9fafb", color: "#6b7280", border: "1.5px solid #e5e7eb" }
              }>
              {opt}
            </button>
          )
        })}
      </div>
    </div>
  )
}

// ── Shared form input ─────────────────────────────────────────────────────────

function Field({ label, children, hint }: { label: string; children: React.ReactNode; hint?: string }) {
  return (
    <div>
      <label className="block text-[11px] font-semibold uppercase tracking-wider text-gray-500 mb-1.5">{label}</label>
      {children}
      {hint && <p className="text-[11px] text-gray-400 mt-1">{hint}</p>}
    </div>
  )
}

const inputCls = "w-full rounded-xl border border-gray-200 px-3 py-2.5 text-[13px] text-gray-800 placeholder-gray-400 focus:outline-none focus:border-[#DE1A1A] focus:ring-1 focus:ring-[#DE1A1A] transition-all bg-white"
const selectCls = inputCls + " appearance-none cursor-pointer"

// ── Freelancer Sheet ──────────────────────────────────────────────────────────

type FState = {
  name: string; type: FreelancerType | ""; phone: string; upi_id: string; gender: string; title: string
  availability_notes: string; rating: number; status: "active" | "inactive"
  assignedMemberIds: string[]
  language: string; voice_type: string; cost_per_minute: string
  editing_software: string[]; video_types_offered: string[]; cost_per_video: string
  availability_schedule: string; cost_per_hour: string
}

const BLANK_F: FState = {
  name: "", type: "", phone: "", upi_id: "", gender: "", title: "", availability_notes: "", rating: 0, status: "active",
  assignedMemberIds: [],
  language: "", voice_type: "", cost_per_minute: "",
  editing_software: [], video_types_offered: [], cost_per_video: "",
  availability_schedule: "", cost_per_hour: "",
}

function freelancerToState(f: Freelancer, assignedIds: string[] = []): FState {
  return {
    name: f.name, type: f.type, phone: f.phone ?? "", upi_id: f.upi_id ?? "", gender: f.gender ?? "", title: f.title ?? "",
    availability_notes: f.availability_notes ?? "",
    rating: f.rating, status: f.status,
    assignedMemberIds: assignedIds,
    language: f.language ?? "", voice_type: f.voice_type ?? "",
    cost_per_minute: f.cost_per_minute?.toString() ?? "",
    editing_software: f.editing_software ?? [], video_types_offered: f.video_types_offered ?? [],
    cost_per_video: f.cost_per_video?.toString() ?? "",
    availability_schedule: f.availability_schedule ?? "",
    cost_per_hour: f.cost_per_hour?.toString() ?? "",
  }
}

function FreelancerSheet({
  open, onClose, editing, teamMembers, initialAssignments,
  onCreated, onUpdated,
}: {
  open: boolean; onClose: () => void; editing: Freelancer | null
  teamMembers: TeamMemberOption[]; initialAssignments: string[]
  onCreated: (f: Freelancer) => void; onUpdated: (f: Freelancer, assignedIds: string[]) => void
}) {
  const [step, setStep] = useState<"type" | "details">(editing ? "details" : "type")
  const [form, setForm] = useState<FState>(editing ? freelancerToState(editing, initialAssignments) : BLANK_F)
  const [saving, setSaving] = useState(false)
  const [err, setErr] = useState("")

  // Reset form/step only when the sheet transitions from closed → open
  const wasOpen = useRef(false)
  useEffect(() => {
    const justOpened = open && !wasOpen.current
    wasOpen.current = open
    if (justOpened) {
      setStep(editing ? "details" : "type")
      setForm(editing ? freelancerToState(editing, initialAssignments) : BLANK_F)
      setErr("")
    }
  }, [open, editing, initialAssignments])

  function reset() {
    setStep(editing ? "details" : "type")
    setForm(editing ? freelancerToState(editing) : BLANK_F)
    setSaving(false); setErr("")
  }

  function close() { reset(); onClose() }

  function set(k: keyof FState, v: FState[keyof FState]) {
    setForm(prev => ({ ...prev, [k]: v }))
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!form.name.trim()) { setErr("Name is required"); return }
    if (!form.type) { setErr("Type is required"); return }
    setSaving(true); setErr("")
    const payload = {
      name: form.name.trim(), type: form.type as FreelancerType,
      phone: form.phone || undefined, upi_id: form.upi_id || undefined,
      gender: form.gender || undefined, title: form.title || undefined,
      availability_notes: form.availability_notes || undefined,
      rating: form.rating, status: form.status,
      assignedMemberIds: form.assignedMemberIds,
      language: form.language || undefined, voice_type: form.voice_type || undefined,
      cost_per_minute: form.cost_per_minute ? parseFloat(form.cost_per_minute) : null,
      editing_software: form.editing_software, video_types_offered: form.video_types_offered,
      cost_per_video: form.cost_per_video ? parseFloat(form.cost_per_video) : null,
      availability_schedule: form.availability_schedule || undefined,
      cost_per_hour: form.cost_per_hour ? parseFloat(form.cost_per_hour) : null,
    }
    if (editing) {
      const res = await updateFreelancer(editing.id, payload)
      if (!res.success) { setErr(res.error ?? "Failed"); setSaving(false); return }
      onUpdated({
        ...editing,
        name: payload.name, type: payload.type,
        phone: payload.phone ?? null, upi_id: payload.upi_id ?? null,
        gender: payload.gender ?? null, title: payload.title ?? null,
        availability_notes: payload.availability_notes ?? null,
        rating: payload.rating ?? 0, status: payload.status ?? "active",
        language: payload.language ?? null, voice_type: payload.voice_type ?? null,
        cost_per_minute: payload.cost_per_minute ?? null,
        editing_software: payload.editing_software ?? [],
        video_types_offered: payload.video_types_offered ?? [],
        cost_per_video: payload.cost_per_video ?? null,
        availability_schedule: payload.availability_schedule ?? null,
        cost_per_hour: payload.cost_per_hour ?? null,
      }, payload.assignedMemberIds ?? [])
    } else {
      const res = await createFreelancer(payload)
      if (!res.success) { setErr(res.error ?? "Failed"); setSaving(false); return }
      const fake: Freelancer = {
        id: res.id ?? `new-${Date.now()}`, company_id: "",
        name: payload.name, type: payload.type,
        phone: payload.phone ?? null, upi_id: payload.upi_id ?? null,
        gender: payload.gender ?? null, title: payload.title ?? null,
        availability_notes: payload.availability_notes ?? null,
        rating: payload.rating ?? 0, status: "active",
        language: payload.language ?? null, voice_type: payload.voice_type ?? null,
        cost_per_minute: payload.cost_per_minute ?? null,
        editing_software: payload.editing_software ?? [],
        video_types_offered: payload.video_types_offered ?? [],
        cost_per_video: payload.cost_per_video ?? null,
        availability_schedule: payload.availability_schedule ?? null,
        cost_per_hour: payload.cost_per_hour ?? null,
        created_at: new Date().toISOString(),
      }
      onCreated(fake)
    }
    close()
  }

  if (!open) return null
  const cfg = form.type ? TYPE_CFG[form.type as FreelancerType] : null

  return (
    <div className="fixed inset-0 z-50 flex">
      <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={close} />
      <div className="relative ml-auto h-full w-full max-w-[480px] bg-white shadow-2xl flex flex-col overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
          <div>
            <h2 className="text-[16px] font-bold text-gray-900">{editing ? "Edit Freelancer" : "Add Freelancer"}</h2>
            {step === "details" && cfg && (
              <div className="flex items-center gap-1.5 mt-0.5">
                <span className="text-[11px] font-semibold px-2 py-0.5 rounded-full" style={{ background: cfg.bg, color: cfg.color }}>{cfg.label}</span>
              </div>
            )}
          </div>
          <button onClick={close} className="w-8 h-8 rounded-full flex items-center justify-center text-gray-400 hover:text-gray-600 hover:bg-gray-100 transition-all">
            <X size={16} />
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto">
          {step === "type" && !editing ? (
            <div className="p-6">
              <p className="text-[13px] text-gray-500 mb-5">Select the freelancer type to continue</p>
              <div className="grid grid-cols-2 gap-3">
                {(Object.entries(TYPE_CFG) as [FreelancerType, typeof TYPE_CFG[FreelancerType]][]).map(([type, cfg]) => (
                  <button key={type} type="button"
                    onClick={() => { set("type", type); setStep("details") }}
                    className="flex flex-col items-center gap-3 p-5 rounded-2xl text-left transition-all hover:scale-[1.02] active:scale-[0.98] border-2"
                    style={{ border: `2px solid ${cfg.border}`, background: cfg.bg }}>
                    <div className="w-12 h-12 rounded-xl flex items-center justify-center" style={{ background: cfg.color }}>
                      <cfg.Icon size={22} strokeWidth={2} />
                    </div>
                    <span className="text-[13px] font-bold text-gray-800 text-center leading-tight">{cfg.label}</span>
                  </button>
                ))}
              </div>
            </div>
          ) : (
            <form id="freelancer-form" onSubmit={handleSubmit} className="p-6 flex flex-col gap-5">
              {!editing && (
                <button type="button" onClick={() => setStep("type")}
                  className="flex items-center gap-1.5 text-[12px] font-semibold text-gray-400 hover:text-gray-600 transition-colors -mt-1">
                  ← Change type
                </button>
              )}

              {/* ── Common fields for all types ── */}
              {form.type && (
                <Field label="Full Name *">
                  <input className={inputCls}
                    placeholder={form.type === "other" ? "e.g. Graphic Designer, Copywriter" : form.type === "voice_over" ? "e.g. Ravi Kumar" : form.type === "video_editor" ? "e.g. Priya S" : "e.g. Arjun M"}
                    value={form.name} onChange={e => set("name", e.target.value)} />
                </Field>
              )}
              {form.type && (
                <Field label="Title">
                  <input className={inputCls} placeholder="e.g. Voice Artist, Video Editor, Narrator" value={form.title} onChange={e => set("title", e.target.value)} />
                </Field>
              )}
              {form.type && (
                <div>
                  <label className="block text-[11px] font-semibold uppercase tracking-wider text-gray-500 mb-2">Gender</label>
                  <div className="flex gap-2">
                    {(["male", "female"] as const).map(g => (
                      <button key={g} type="button"
                        onClick={() => set("gender", form.gender === g ? "" : g)}
                        className="flex-1 py-2.5 rounded-xl text-[13px] font-bold capitalize transition-all"
                        style={form.gender === g
                          ? { background: "#DE1A1A", color: "#fff", border: "2px solid #DE1A1A" }
                          : { background: "#F9FAFB", color: "#6B7280", border: "2px solid #E5E7EB" }}>
                        {g === "male" ? "Male" : "Female"}
                      </button>
                    ))}
                  </div>
                </div>
              )}
              {form.type === "voice_over" && (
                <Field label="Voice Tone">
                  <select className={selectCls} value={form.voice_type} onChange={e => set("voice_type", e.target.value)}>
                    <option value="">Select voice tone</option>
                    {VOICE_TYPES.map(v => <option key={v} value={v}>{v}</option>)}
                  </select>
                </Field>
              )}
              {form.type && (
                <div className="grid grid-cols-2 gap-3">
                  <Field label="Phone">
                    <input className={inputCls} inputMode="numeric" placeholder="9876543210" value={form.phone}
                      onChange={e => set("phone", e.target.value.replace(/\D/g, "").slice(0, 15))} />
                  </Field>
                  <Field label="UPI ID">
                    <input className={inputCls} placeholder="name@upi" value={form.upi_id} onChange={e => set("upi_id", e.target.value)} />
                  </Field>
                </div>
              )}

              {/* ── Type-specific price ── */}
              {form.type === "voice_over" && (
                <Field label="Base Price / Min (₹)" hint="Used for auto-calculation">
                  <input className={inputCls} type="number" min="0" step="0.5" placeholder="e.g. 150" value={form.cost_per_minute} onChange={e => set("cost_per_minute", e.target.value)} />
                </Field>
              )}
              {form.type === "video_editor" && (
                <Field label="Base Pay / Video (₹)" hint="Flat rate per video">
                  <input className={inputCls} type="number" min="0" step="50" placeholder="e.g. 2000" value={form.cost_per_video} onChange={e => set("cost_per_video", e.target.value)} />
                </Field>
              )}
              {form.type === "video_shooter" && (
                <Field label="Base Pay / Hour (₹)" hint="Used for auto-calculation">
                  <input className={inputCls} type="number" min="0" step="50" placeholder="e.g. 800" value={form.cost_per_hour} onChange={e => set("cost_per_hour", e.target.value)} />
                </Field>
              )}
              {form.type === "other" && (
                <Field label="Base Pay (₹)">
                  <input className={inputCls} type="number" min="0" step="50" placeholder="e.g. 5000" value={form.cost_per_video} onChange={e => set("cost_per_video", e.target.value)} />
                </Field>
              )}
              {form.type && (
                <Field label="Free Time / Availability">
                  <input className={inputCls} placeholder="e.g. Weekdays 10am–6pm" value={form.availability_notes} onChange={e => set("availability_notes", e.target.value)} />
                </Field>
              )}
              {form.type && (
                <Field label="Rating">
                  <StarRating value={form.rating} onChange={v => set("rating", v)} />
                </Field>
              )}
              {/* Status — editing only */}
              {editing && (
                <Field label="Status">
                  <select className={selectCls} value={form.status} onChange={e => set("status", e.target.value as "active" | "inactive")}>
                    <option value="active">Active</option>
                    <option value="inactive">Inactive</option>
                  </select>
                </Field>
              )}

              {/* Assign to members */}
              {teamMembers.length > 0 && (
                <div>
                  <label className="block text-[11px] font-semibold uppercase tracking-wider text-gray-500 mb-2">
                    Assign to Team Members
                  </label>
                  <div className="flex flex-wrap gap-1.5">
                    {teamMembers.map(m => {
                      const selected = form.assignedMemberIds.includes(m.id)
                      return (
                        <button key={m.id} type="button"
                          onClick={() => set("assignedMemberIds", selected
                            ? form.assignedMemberIds.filter(id => id !== m.id)
                            : [...form.assignedMemberIds, m.id]
                          )}
                          className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-[11px] font-semibold transition-all"
                          style={selected
                            ? { background: "#DE1A1A", color: "#FFF", border: "1.5px solid #DE1A1A" }
                            : { background: "#F9FAFB", color: "#6B7280", border: "1.5px solid #E5E7EB" }
                          }>
                          <div className="w-4 h-4 rounded-full flex items-center justify-center text-[8px] font-black flex-shrink-0"
                            style={{ background: selected ? "rgba(255,255,255,0.3)" : "#E5E7EB", color: selected ? "#FFF" : "#374151" }}>
                            {m.name.split(" ").map(n => n[0]).join("").slice(0, 2).toUpperCase()}
                          </div>
                          {m.name.split(" ")[0]}
                        </button>
                      )
                    })}
                  </div>
                  {form.assignedMemberIds.length > 0 && (
                    <p className="text-[11px] text-gray-400 mt-1.5">
                      {form.assignedMemberIds.length} member{form.assignedMemberIds.length !== 1 ? "s" : ""} selected · they can see this freelancer
                    </p>
                  )}
                </div>
              )}

              {err && (
                <div className="flex items-center gap-2 p-3 rounded-xl bg-red-50 border border-red-100">
                  <AlertCircle size={14} className="text-red-500 flex-shrink-0" />
                  <p className="text-[12px] text-red-600">{err}</p>
                </div>
              )}
            </form>
          )}
        </div>

        {/* Footer */}
        {step === "details" && (
          <div className="px-6 py-4 border-t border-gray-100 flex gap-3">
            <button type="button" onClick={close} className="flex-1 py-2.5 rounded-xl text-[13px] font-semibold text-gray-600 border border-gray-200 hover:bg-gray-50 transition-all">
              Cancel
            </button>
            <button type="submit" form="freelancer-form" disabled={saving}
              className="flex-1 py-2.5 rounded-xl text-[13px] font-bold text-white transition-all flex items-center justify-center gap-2"
              style={{ background: saving ? "#f87171" : "#DE1A1A" }}>
              {saving ? "Saving…" : editing ? "Save Changes" : "Add Freelancer"}
            </button>
          </div>
        )}
      </div>
    </div>
  )
}

// ── Work Entry Sheet ──────────────────────────────────────────────────────────

type EState = {
  client_name: string; title: string; date: string; status: string; payment_status: string; notes: string
  manual_amount: string
  // VO
  audio_duration_minutes: string
  // Edit
  date_given: string; date_finished: string; video_type: string; video_duration: string
  time_taken_hours: string; drive_updated: boolean; revision_count: string
  // Shoot
  start_time: string; end_time: string; break_minutes: string; travel_hours: string
}

const BLANK_E: EState = {
  client_name: "", title: "", date: new Date().toISOString().split("T")[0], status: "pending", payment_status: "unpaid", notes: "",
  manual_amount: "",
  audio_duration_minutes: "",
  date_given: "", date_finished: "", video_type: "", video_duration: "",
  time_taken_hours: "", drive_updated: false, revision_count: "0",
  start_time: "", end_time: "", break_minutes: "0", travel_hours: "0",
}

const INTERNAL_BRANDS = ["GROFAST DIGITAL", "KARTHICK BRANDS", "GROFAST AI"]

function ClientSelect({ value, onChange, activeClientNames, pastClientNames }: {
  value: string; onChange: (v: string) => void
  activeClientNames: string[]; pastClientNames: string[]
}) {
  const [open, setOpen] = useState(false)
  const [view, setView] = useState<"main" | "past" | "manual">("main")
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false); setView("main")
      }
    }
    document.addEventListener("mousedown", handleClick)
    return () => document.removeEventListener("mousedown", handleClick)
  }, [])

  function pick(v: string) { onChange(v); setOpen(false); setView("main") }

  const isManual = view === "manual"
  const displayValue = isManual ? value : (value || "")
  const placeholder = !value && !isManual ? "Select client…" : ""

  const rowCls = "w-full text-left px-3 py-2 text-[13px] transition-colors cursor-pointer"

  return (
    <div ref={ref} className="relative">
      {/* Trigger button */}
      {!isManual && (
        <button type="button" onClick={() => setOpen(o => !o)}
          className={inputCls + " flex items-center justify-between text-left"}
          style={{ color: value ? "#111827" : "#9CA3AF" }}>
          <span>{value || "Select client…"}</span>
          <ChevronDown size={13} className="flex-shrink-0 text-gray-400" />
        </button>
      )}

      {/* Manual text input */}
      {isManual && (
        <div className="flex gap-1.5">
          <input className={inputCls} placeholder="Type client name…" value={value}
            onChange={e => onChange(e.target.value)} autoFocus style={{ flex: 1 }} />
          <button type="button" onClick={() => { onChange(""); setView("main"); setOpen(true) }}
            className="px-2 rounded-xl border border-gray-200 text-gray-400 hover:text-gray-600 text-[11px]">✕</button>
        </div>
      )}

      {/* Dropdown panel */}
      {open && !isManual && (
        <div className="absolute top-full left-0 right-0 mt-1 bg-white border border-gray-200 rounded-xl shadow-xl z-[999] overflow-hidden"
          style={{ maxHeight: 240, overflowY: "auto" }}>

          {view === "main" && <>
            {/* Internal brands */}
            {INTERNAL_BRANDS.map(b => (
              <button key={b} type="button" onClick={() => pick(b)}
                className={rowCls + " font-bold text-gray-800 hover:bg-red-50 hover:text-[#DE1A1A]"}>
                {b}
              </button>
            ))}
            {/* Divider if active clients exist */}
            {activeClientNames.length > 0 && <div style={{ height: 1, background: "#F3F4F6", margin: "2px 0" }} />}
            {/* Active clients */}
            {activeClientNames.map(n => (
              <button key={n} type="button" onClick={() => pick(n)}
                className={rowCls + " text-gray-700 hover:bg-gray-50"}>
                {n}
              </button>
            ))}
            {/* Past clients drill-down */}
            {pastClientNames.length > 0 && (
              <button type="button" onClick={() => setView("past")}
                className={rowCls + " font-semibold hover:bg-amber-50"}
                style={{ color: "#B45309", borderTop: "1px solid #FEF3C7", marginTop: 2 }}>
                📁 Past Clients →
              </button>
            )}
            {/* Type manually */}
            <button type="button" onClick={() => { setOpen(false); setView("manual"); onChange("") }}
              className={rowCls + " hover:bg-blue-50"}
              style={{ color: "#2563EB", borderTop: "1px solid #EFF6FF", marginTop: 2 }}>
              ✏️ Other (type manually)
            </button>
          </>}

          {view === "past" && <>
            <button type="button" onClick={() => setView("main")}
              className={rowCls + " text-gray-400 hover:bg-gray-50 text-[12px]"}
              style={{ borderBottom: "1px solid #F3F4F6" }}>
              ← Back
            </button>
            {pastClientNames.map(n => (
              <button key={n} type="button" onClick={() => pick(n)}
                className={rowCls + " text-gray-700 hover:bg-amber-50"}>
                {n}
              </button>
            ))}
          </>}
        </div>
      )}
    </div>
  )
}

function WorkSheet({
  open, onClose, freelancer, entries, activeClientNames, pastClientNames,
  onEntryAdded, onEntryUpdated, onEntryDeleted,
}: {
  open: boolean; onClose: () => void; freelancer: Freelancer | null
  entries: WorkEntry[]; activeClientNames: string[]; pastClientNames: string[]
  onEntryAdded: (e: WorkEntry) => void
  onEntryUpdated: (id: string, patch: Partial<WorkEntry>) => void
  onEntryDeleted: (id: string) => void
}) {
  const [showAdd, setShowAdd] = useState(false)
  const [form, setForm] = useState<EState>(BLANK_E)
  const [saving, setSaving] = useState(false)
  const [err, setErr] = useState("")

  function setF(k: keyof EState, v: EState[keyof EState]) { setForm(p => ({ ...p, [k]: v })) }

  // auto-calc
  const calcAmount = useMemo(() => {
    if (!freelancer) return null
    if (freelancer.type === "voice_over" && form.audio_duration_minutes && freelancer.cost_per_minute) {
      return parseFloat(form.audio_duration_minutes) * freelancer.cost_per_minute
    }
    if (freelancer.type === "video_editor" && freelancer.cost_per_video) {
      return freelancer.cost_per_video
    }
    if (freelancer.type === "video_shooter" && form.start_time && form.end_time && freelancer.cost_per_hour) {
      const [sh, sm] = form.start_time.split(":").map(Number)
      const [eh, em] = form.end_time.split(":").map(Number)
      const breakMins = parseInt(form.break_minutes) || 0
      const hrs = ((eh * 60 + em) - (sh * 60 + sm) - breakMins) / 60
      if (hrs > 0) return hrs * freelancer.cost_per_hour
    }
    return null
  }, [freelancer, form])

  const calcHours = useMemo(() => {
    if (!freelancer || freelancer.type !== "video_shooter" || !form.start_time || !form.end_time) return null
    const [sh, sm] = form.start_time.split(":").map(Number)
    const [eh, em] = form.end_time.split(":").map(Number)
    const breakMins = parseInt(form.break_minutes) || 0
    const hrs = ((eh * 60 + em) - (sh * 60 + sm) - breakMins) / 60
    return hrs > 0 ? hrs : null
  }, [freelancer, form.start_time, form.end_time, form.break_minutes])

  async function handleAdd(e: React.FormEvent) {
    e.preventDefault()
    if (!freelancer) return
    setSaving(true); setErr("")
    const entryType = freelancer.type === "video_shooter" ? "video_shoot"
      : freelancer.type === "video_editor" ? "video_edit" : "voice_over"
    const finalAmount = form.manual_amount ? parseFloat(form.manual_amount) : (calcAmount ?? undefined)
    const res = await createWorkEntry({
      freelancer_id: freelancer.id,
      entry_type: entryType as "voice_over" | "video_edit" | "video_shoot",
      client_name: form.client_name || undefined, title: form.title || undefined,
      date: form.date, status: form.status, payment_status: form.payment_status, notes: form.notes || undefined,
      amount: finalAmount,
      audio_duration_minutes: form.audio_duration_minutes ? parseFloat(form.audio_duration_minutes) : null,
      date_given: form.date_given || undefined, date_finished: form.date_finished || undefined,
      video_type: form.video_type || undefined, video_duration: form.video_duration || undefined,
      time_taken_hours: form.time_taken_hours ? parseFloat(form.time_taken_hours) : null,
      drive_updated: form.drive_updated, revision_count: parseInt(form.revision_count) || 0,
      start_time: form.start_time || undefined, end_time: form.end_time || undefined,
      break_minutes: parseInt(form.break_minutes) || 0,
      travel_hours: form.travel_hours ? parseFloat(form.travel_hours) : null,
    })
    if (!res.success) { setErr(res.error ?? "Failed to add entry"); setSaving(false); return }
    const fake: WorkEntry = {
      id: `new-${Date.now()}`, company_id: "", freelancer_id: freelancer.id,
      entry_type: entryType as "voice_over" | "video_edit" | "video_shoot",
      client_name: form.client_name || null, title: form.title || null,
      date: form.date, status: form.status, payment_status: form.payment_status, paid_at: form.payment_status === "paid" ? new Date().toISOString() : null,
      amount: finalAmount ?? null, notes: form.notes || null,
      audio_duration_minutes: form.audio_duration_minutes ? parseFloat(form.audio_duration_minutes) : null,
      cost_per_minute_snapshot: freelancer.cost_per_minute,
      date_given: form.date_given || null, date_finished: form.date_finished || null,
      video_type: form.video_type || null, video_duration: form.video_duration || null,
      time_taken_hours: form.time_taken_hours ? parseFloat(form.time_taken_hours) : null,
      drive_updated: form.drive_updated, revision_count: parseInt(form.revision_count) || 0,
      cost_per_video_snapshot: freelancer.cost_per_video,
      start_time: form.start_time || null, end_time: form.end_time || null,
      break_minutes: parseInt(form.break_minutes) || 0,
      travel_hours: form.travel_hours ? parseFloat(form.travel_hours) : null,
      working_hours: calcHours, cost_per_hour_snapshot: freelancer.cost_per_hour,
      created_at: new Date().toISOString(),
    }
    onEntryAdded(fake)
    setForm(BLANK_E); setShowAdd(false); setSaving(false)
  }

  if (!open || !freelancer) return null
  const cfg = TYPE_CFG[freelancer.type]
  const myEntries = entries.filter(e => e.freelancer_id === freelancer.id)
  const totalEarned = myEntries.reduce((s, e) => s + (e.amount ?? 0), 0)
  const pendingPay = myEntries.filter(e => e.payment_status === "unpaid" && e.status === "completed").reduce((s, e) => s + (e.amount ?? 0), 0)

  return (
    <div className="fixed inset-0 z-50 flex">
      <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={onClose} />
      <div className="relative ml-auto h-full w-full max-w-[700px] bg-white shadow-2xl flex flex-col overflow-hidden">
        {/* Header */}
        <div className="px-6 py-4 border-b border-gray-100 flex-shrink-0">
          <div className="flex items-start justify-between gap-4">
            <div>
              <div className="flex items-center gap-2 mb-1">
                <span className="text-[11px] font-bold px-2.5 py-0.5 rounded-full" style={{ background: cfg.bg, color: cfg.color, border: `1px solid ${cfg.border}` }}>{cfg.label}</span>
                <StarDisplay rating={freelancer.rating} />
              </div>
              <h2 className="text-[18px] font-bold text-gray-900">{freelancer.name}</h2>
              <div className="flex items-center gap-4 mt-1 text-[12px] text-gray-500">
                <span>{myEntries.length} work{myEntries.length !== 1 ? "s" : ""}</span>
                <span>Earned: <strong className="text-gray-800">{fmt(totalEarned)}</strong></span>
                {pendingPay > 0 && <span className="text-amber-600">Pending: <strong>{fmt(pendingPay)}</strong></span>}
              </div>
            </div>
            <div className="flex items-center gap-2">
              <button onClick={() => { setShowAdd(s => !s); setErr("") }}
                className="flex items-center gap-1.5 px-3 py-2 rounded-xl text-[12px] font-bold text-white transition-all hover:opacity-90"
                style={{ background: "#DE1A1A" }}>
                <Plus size={14} />{showAdd ? "Cancel" : "Add Entry"}
              </button>
              <button onClick={onClose} className="w-8 h-8 rounded-full flex items-center justify-center text-gray-400 hover:text-gray-600 hover:bg-gray-100 transition-all">
                <X size={16} />
              </button>
            </div>
          </div>
        </div>

        {/* Add form */}
        {showAdd && (
          <div className="border-b border-gray-100 flex-shrink-0 bg-gray-50">
            <form onSubmit={handleAdd} className="p-5 flex flex-col gap-4">
              <p className="text-[11px] font-bold uppercase tracking-widest text-gray-400">New Work Entry</p>

              <div className="grid grid-cols-2 gap-3">
                <Field label="Client Name">
                  <ClientSelect value={form.client_name} onChange={v => setF("client_name", v)}
                    activeClientNames={activeClientNames} pastClientNames={pastClientNames} />
                </Field>
                <Field label="Date">
                  <input type="date" className={inputCls} value={form.date} onChange={e => setF("date", e.target.value)} />
                </Field>
              </div>

              <Field label={freelancer.type === "video_editor" ? "Video Name" : "Title"}>
                <input className={inputCls} placeholder="Project or content title" value={form.title} onChange={e => setF("title", e.target.value)} />
              </Field>

              {/* VO specific */}
              {freelancer.type === "voice_over" && (
                <div className="grid grid-cols-2 gap-3">
                  <Field label="Audio Duration (min)" hint={calcAmount ? `Amount: ${fmt(calcAmount)}` : ""}>
                    <input type="number" min="0" step="0.5" className={inputCls} placeholder="e.g. 3.5" value={form.audio_duration_minutes} onChange={e => setF("audio_duration_minutes", e.target.value)} />
                  </Field>
                  <Field label="Status">
                    <select className={selectCls} value={form.status} onChange={e => setF("status", e.target.value)}>
                      {WK_STATUSES.map(s => <option key={s} value={s}>{s.replace("_", " ")}</option>)}
                    </select>
                  </Field>
                </div>
              )}

              {/* Video Editor specific */}
              {freelancer.type === "video_editor" && (
                <>
                  <div className="grid grid-cols-3 gap-3">
                    <Field label="Date Given">
                      <input type="date" className={inputCls} value={form.date_given} onChange={e => setF("date_given", e.target.value)} />
                    </Field>
                    <Field label="Date Finished">
                      <input type="date" className={inputCls} value={form.date_finished} onChange={e => setF("date_finished", e.target.value)} />
                    </Field>
                    <Field label="Video Type">
                      <select className={selectCls} value={form.video_type} onChange={e => setF("video_type", e.target.value)}>
                        <option value="">Select</option>
                        {VIDEO_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
                      </select>
                    </Field>
                  </div>
                  <div className="grid grid-cols-3 gap-3">
                    <Field label="Video Duration">
                      <input className={inputCls} placeholder="e.g. 5 min" value={form.video_duration} onChange={e => setF("video_duration", e.target.value)} />
                    </Field>
                    <Field label="Time Taken (hrs)">
                      <input type="number" min="0" step="0.5" className={inputCls} placeholder="e.g. 4" value={form.time_taken_hours} onChange={e => setF("time_taken_hours", e.target.value)} />
                    </Field>
                    <Field label="Revisions">
                      <input type="number" min="0" className={inputCls} value={form.revision_count} onChange={e => setF("revision_count", e.target.value)} />
                    </Field>
                  </div>
                  <div className="flex items-center gap-6">
                    <label className="flex items-center gap-2 cursor-pointer">
                      <input type="checkbox" checked={form.drive_updated} onChange={e => setF("drive_updated", e.target.checked)}
                        className="w-4 h-4 rounded accent-[#DE1A1A]" />
                      <span className="text-[12px] font-semibold text-gray-700">Drive Updated</span>
                    </label>
                    <Field label="Status">
                      <select className={selectCls} value={form.status} onChange={e => setF("status", e.target.value)}>
                        {WK_STATUSES.map(s => <option key={s} value={s}>{s.replace("_", " ")}</option>)}
                      </select>
                    </Field>
                    {freelancer.cost_per_video && (
                      <div className="text-[12px]">
                        <span className="text-gray-500">Amount: </span>
                        <strong className="text-gray-800">{fmt(freelancer.cost_per_video)}</strong>
                      </div>
                    )}
                  </div>
                </>
              )}

              {/* Video Shooter specific */}
              {freelancer.type === "video_shooter" && (
                <>
                  <div className="grid grid-cols-3 gap-3">
                    <Field label="Start Time">
                      <input type="time" className={inputCls} value={form.start_time} onChange={e => setF("start_time", e.target.value)} />
                    </Field>
                    <Field label="End Time">
                      <input type="time" className={inputCls} value={form.end_time} onChange={e => setF("end_time", e.target.value)} />
                    </Field>
                    <Field label="Break (min)">
                      <input type="number" min="0" step="5" className={inputCls} placeholder="0" value={form.break_minutes} onChange={e => setF("break_minutes", e.target.value)} />
                    </Field>
                  </div>
                  {calcHours !== null && (
                    <div className="flex items-center gap-4 text-[12px] px-3 py-2 rounded-xl bg-emerald-50 border border-emerald-100">
                      <span className="text-emerald-700">Working Hours: <strong>{calcHours.toFixed(1)}</strong></span>
                      {parseInt(form.break_minutes) > 0 && <span className="text-orange-600">Break: <strong>{form.break_minutes} min</strong></span>}
                      {calcAmount && <span className="text-emerald-700">Amount: <strong>{fmt(calcAmount)}</strong></span>}
                    </div>
                  )}
                  <div className="grid grid-cols-3 gap-3">
                    <Field label="Travel Hours">
                      <input type="number" min="0" step="0.5" className={inputCls} value={form.travel_hours} onChange={e => setF("travel_hours", e.target.value)} />
                    </Field>
                    <Field label="Status">
                      <select className={selectCls} value={form.status} onChange={e => setF("status", e.target.value)}>
                        {WK_STATUSES.map(s => <option key={s} value={s}>{s.replace("_", " ")}</option>)}
                      </select>
                    </Field>
                    <label className="flex items-center gap-2 cursor-pointer pt-6">
                      <input type="checkbox" checked={form.drive_updated} onChange={e => setF("drive_updated", e.target.checked)}
                        className="w-4 h-4 rounded accent-[#DE1A1A]" />
                      <span className="text-[12px] font-semibold text-gray-700">Drive Updated</span>
                    </label>
                  </div>
                </>
              )}

              {/* Other type */}
              {freelancer.type === "other" && (
                <Field label="Status">
                  <select className={selectCls} value={form.status} onChange={e => setF("status", e.target.value)}>
                    {WK_STATUSES.map(s => <option key={s} value={s}>{s.replace("_", " ")}</option>)}
                  </select>
                </Field>
              )}

              {/* Manual Amount */}
              <Field label="Amount (₹)" hint={calcAmount ? `Auto: ${fmt(calcAmount)}` : "Enter manually"}>
                <input type="number" min="0" step="0.01" className={inputCls}
                  placeholder={calcAmount ? String(calcAmount) : "e.g. 500"}
                  value={form.manual_amount} onChange={e => setF("manual_amount", e.target.value)} />
              </Field>

              {/* Payment status */}
              <div className="flex items-center gap-3">
                <span className="text-[11px] font-bold text-gray-500 uppercase tracking-wide">Payment</span>
                <div className="flex items-center gap-2">
                  <button type="button" onClick={() => setF("payment_status", "unpaid")}
                    className="px-3 py-1.5 rounded-xl text-[12px] font-bold transition-all"
                    style={form.payment_status === "unpaid" ? { background: "#fee2e2", color: "#991b1b" } : { background: "#f3f4f6", color: "#6b7280" }}>
                    Unpaid
                  </button>
                  <button type="button" onClick={() => setF("payment_status", "paid")}
                    className="px-3 py-1.5 rounded-xl text-[12px] font-bold transition-all"
                    style={form.payment_status === "paid" ? { background: "#d1fae5", color: "#065f46" } : { background: "#f3f4f6", color: "#6b7280" }}>
                    Paid
                  </button>
                </div>
              </div>

              <Field label="Notes">
                <input className={inputCls} placeholder="Optional notes…" value={form.notes} onChange={e => setF("notes", e.target.value)} />
              </Field>

              {err && <p className="text-[12px] text-red-600 bg-red-50 px-3 py-2 rounded-xl">{err}</p>}

              <button type="submit" disabled={saving}
                className="self-end px-5 py-2.5 rounded-xl text-[13px] font-bold text-white transition-all flex items-center gap-2"
                style={{ background: saving ? "#f87171" : "#DE1A1A" }}>
                {saving ? "Saving…" : <><Check size={14} />Save Entry</>}
              </button>
            </form>
          </div>
        )}

        {/* Entries list */}
        <div className="flex-1 overflow-y-auto p-5">
          {myEntries.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-40 text-gray-400">
              <Calendar size={32} strokeWidth={1.5} className="mb-2" />
              <p className="text-[13px]">No work entries yet</p>
            </div>
          ) : (
            <div className="flex flex-col gap-2">
              {myEntries.map((entry, idx) => (
                <EntryRow key={entry.id} entry={entry} idx={idx}
                  freelancerType={freelancer.type}
                  freelancer={freelancer}
                  activeClientNames={activeClientNames}
                  pastClientNames={pastClientNames}
                  onPaidToggle={async (paid) => {
                    const res = await markWorkEntryPaid(entry.id, paid)
                    if (res.success) onEntryUpdated(entry.id, { payment_status: paid ? "paid" : "unpaid", paid_at: paid ? new Date().toISOString() : null })
                  }}
                  onStatusChange={async (status) => {
                    const res = await updateWorkEntryStatus(entry.id, status)
                    if (res.success) onEntryUpdated(entry.id, { status })
                  }}
                  onDelete={async () => {
                    const res = await deleteWorkEntry(entry.id)
                    if (res.success) onEntryDeleted(entry.id)
                  }}
                  onUpdated={patch => onEntryUpdated(entry.id, patch)}
                />
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

// ── Entry Row ─────────────────────────────────────────────────────────────────

function entryToEState(e: WorkEntry): EState {
  return {
    client_name: e.client_name ?? "", title: e.title ?? "",
    date: e.date, status: e.status, payment_status: e.payment_status ?? "unpaid", notes: e.notes ?? "",
    audio_duration_minutes: e.audio_duration_minutes?.toString() ?? "",
    date_given: e.date_given ?? "", date_finished: e.date_finished ?? "",
    video_type: e.video_type ?? "", video_duration: e.video_duration ?? "",
    time_taken_hours: e.time_taken_hours?.toString() ?? "",
    drive_updated: e.drive_updated ?? false, revision_count: e.revision_count?.toString() ?? "0",
    start_time: e.start_time?.slice(0,5) ?? "", end_time: e.end_time?.slice(0,5) ?? "",
    break_minutes: e.break_minutes?.toString() ?? "0",
    travel_hours: e.travel_hours?.toString() ?? "0",
    manual_amount: "",
  }
}

function EntryRow({ entry, idx, freelancerType, freelancer, activeClientNames, pastClientNames, onPaidToggle, onStatusChange, onDelete, onUpdated }: {
  entry: WorkEntry; idx: number; freelancerType: FreelancerType; freelancer: Freelancer; activeClientNames: string[]; pastClientNames: string[]
  onPaidToggle: (paid: boolean) => Promise<void>
  onStatusChange: (status: string) => Promise<void>
  onDelete: () => Promise<void>
  onUpdated: (patch: Partial<WorkEntry>) => void
}) {
  const [loading, setLoading] = useState(false)
  const [editing, setEditing] = useState(false)
  const [form, setForm] = useState<EState>(entryToEState(entry))
  const [saving, setSaving] = useState(false)
  const [err, setErr] = useState("")

  function setF(k: keyof EState, v: EState[keyof EState]) { setForm(p => ({ ...p, [k]: v })) }

  function openEdit() { setForm(entryToEState(entry)); setErr(""); setEditing(true) }

  async function handleSave(e: React.FormEvent) {
    e.preventDefault()
    setSaving(true); setErr("")
    const audioDur = form.audio_duration_minutes ? parseFloat(form.audio_duration_minutes) : null
    const startT   = form.start_time || null
    const endT     = form.end_time   || null

    // Compute optimistic amount from current freelancer rate
    let optimisticAmount: number | null = null
    if (entry.entry_type === "voice_over" && audioDur && freelancer.cost_per_minute) {
      optimisticAmount = Math.round(audioDur * (freelancer.cost_per_minute as number) * 100) / 100
    } else if (entry.entry_type === "video_edit" && freelancer.cost_per_video) {
      optimisticAmount = freelancer.cost_per_video as number
    } else if (entry.entry_type === "video_shoot" && startT && endT && freelancer.cost_per_hour) {
      const [sh, sm] = startT.split(":").map(Number)
      const [eh, em] = endT.split(":").map(Number)
      const hrs = Math.round(((eh * 60 + em) - (sh * 60 + sm)) / 60 * 100) / 100
      optimisticAmount = Math.round(hrs * (freelancer.cost_per_hour as number) * 100) / 100
    }

    const patch: Partial<WorkEntry> & { amount?: number | null } = {
      client_name: form.client_name || null,
      title: form.title || null,
      date: form.date,
      status: form.status,
      payment_status: form.payment_status,
      paid_at: form.payment_status === "paid" ? (entry.paid_at ?? new Date().toISOString()) : null,
      notes: form.notes || null,
      audio_duration_minutes: audioDur,
      date_given: form.date_given || null,
      date_finished: form.date_finished || null,
      video_type: form.video_type || null,
      video_duration: form.video_duration || null,
      time_taken_hours: form.time_taken_hours ? parseFloat(form.time_taken_hours) : null,
      drive_updated: form.drive_updated,
      revision_count: parseInt(form.revision_count) || 0,
      start_time: startT,
      end_time: endT,
      break_minutes: parseInt(form.break_minutes) || 0,
      travel_hours: form.travel_hours ? parseFloat(form.travel_hours) : null,
      amount: optimisticAmount,
    }
    const res = await updateWorkEntry(entry.id, patch as Parameters<typeof updateWorkEntry>[1])
    if (!res.success) { setErr(res.error ?? "Failed to save"); setSaving(false); return }
    onUpdated(patch)
    setEditing(false); setSaving(false)
  }

  const statusColors: Record<string, { bg: string; color: string }> = {
    pending:     { bg: "#fef3c7", color: "#d97706" },
    in_progress: { bg: "#dbeafe", color: "#2563eb" },
    completed:   { bg: "#d1fae5", color: "#065f46" },
    cancelled:   { bg: "#fee2e2", color: "#991b1b" },
  }
  const sc = statusColors[entry.status] ?? statusColors.pending

  return (
    <div className="bg-white border border-gray-100 rounded-2xl overflow-hidden hover:border-gray-200 transition-all">
      {/* View row */}
      <div className="p-4">
        <div className="flex items-start gap-3">
          <div className="w-8 h-8 rounded-xl flex items-center justify-center flex-shrink-0 text-[12px] font-bold text-gray-500 bg-gray-100">
            {idx + 1}
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-start justify-between gap-2 flex-wrap">
              <div>
                <div className="flex items-center gap-2 flex-wrap">
                  {entry.title && <p className="text-[13px] font-bold text-gray-900">{entry.title}</p>}
                  {entry.client_name && <span className="text-[11px] text-gray-500">· {entry.client_name}</span>}
                </div>
                <p className="text-[11px] text-gray-400 mt-0.5">{new Date(entry.date).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" })}</p>
              </div>
              <div className="flex items-center gap-2 flex-shrink-0">
                {entry.amount != null && (
                  <span className="text-[13px] font-bold text-gray-800">{fmt(entry.amount)}</span>
                )}
                <span className="text-[10px] font-bold px-2 py-0.5 rounded-full" style={sc}>{entry.status.replace("_", " ")}</span>
              </div>
            </div>

            <div className="flex items-center gap-4 mt-2 text-[11px] text-gray-500 flex-wrap">
              {freelancerType === "voice_over" && entry.audio_duration_minutes && (
                <span className="flex items-center gap-1"><Mic size={10} />{entry.audio_duration_minutes} min</span>
              )}
              {freelancerType === "video_editor" && (<>
                {entry.video_type && <span>{entry.video_type}</span>}
                {entry.video_duration && <span>{entry.video_duration}</span>}
                {entry.revision_count > 0 && <span className="flex items-center gap-1"><RotateCcw size={10} />{entry.revision_count} rev.</span>}
                {entry.drive_updated && <span className="flex items-center gap-1 text-emerald-600"><HardDrive size={10} />Drive</span>}
              </>)}
              {freelancerType === "video_shooter" && (<>
                {entry.working_hours && <span className="flex items-center gap-1"><Clock size={10} />{entry.working_hours.toFixed(1)} hrs</span>}
                {entry.start_time && entry.end_time && <span>{entry.start_time.slice(0, 5)} – {entry.end_time.slice(0, 5)}</span>}
                {entry.travel_hours && entry.travel_hours > 0 && <span>+ {entry.travel_hours}h travel</span>}
                {entry.drive_updated && <span className="flex items-center gap-1 text-emerald-600"><HardDrive size={10} />Drive</span>}
              </>)}
            </div>

            <div className="flex items-center gap-2 mt-3 flex-wrap">
              <select value={entry.status} className="text-[11px] border border-gray-200 rounded-lg px-2 py-1 text-gray-600 bg-white focus:outline-none cursor-pointer"
                onChange={async e => { setLoading(true); await onStatusChange(e.target.value); setLoading(false) }}>
                {WK_STATUSES.map(s => <option key={s} value={s}>{s.replace("_", " ")}</option>)}
              </select>

              {entry.payment_status === "unpaid" ? (
                <button disabled={loading} onClick={async () => { setLoading(true); await onPaidToggle(true); setLoading(false) }}
                  className="flex items-center gap-1 text-[11px] font-bold px-2.5 py-1 rounded-lg transition-all border"
                  style={{ background: "#f0fdf4", color: "#16a34a", borderColor: "#bbf7d0" }}>
                  <CreditCard size={11} />{loading ? "…" : "Mark Paid"}
                </button>
              ) : (
                <span className="flex items-center gap-1 text-[11px] font-bold px-2.5 py-1 rounded-lg" style={{ background: "#f0fdf4", color: "#16a34a" }}>
                  <Check size={11} />Paid
                </span>
              )}

              <button onClick={openEdit}
                className="flex items-center gap-1 text-[11px] font-medium px-2 py-1 rounded-lg text-indigo-500 hover:bg-indigo-50 transition-all">
                <Edit2 size={11} />Edit
              </button>

              <button disabled={loading} onClick={async () => { if (confirm("Delete this entry?")) { setLoading(true); await onDelete(); setLoading(false) } }}
                className="flex items-center gap-1 text-[11px] font-medium px-2 py-1 rounded-lg text-gray-400 hover:text-red-500 hover:bg-red-50 transition-all">
                <Trash2 size={11} />Delete
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Inline edit form */}
      {editing && (
        <form onSubmit={handleSave} className="border-t border-indigo-100 bg-indigo-50/40 p-4 flex flex-col gap-3">
          <p className="text-[10px] font-bold uppercase tracking-widest text-indigo-400">Edit Entry</p>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Client Name">
              <ClientSelect value={form.client_name} onChange={v => setF("client_name", v)}
                activeClientNames={activeClientNames} pastClientNames={pastClientNames} />
            </Field>
            <Field label="Date">
              <input type="date" className={inputCls} value={form.date} onChange={e => setF("date", e.target.value)} />
            </Field>
          </div>
          <Field label="Title">
            <input className={inputCls} value={form.title} onChange={e => setF("title", e.target.value)} />
          </Field>

          {freelancerType === "voice_over" && (
            <Field label="Audio Duration (min)">
              <input type="number" min="0" step="0.5" className={inputCls} value={form.audio_duration_minutes} onChange={e => setF("audio_duration_minutes", e.target.value)} />
            </Field>
          )}
          {freelancerType === "video_editor" && (
            <div className="grid grid-cols-3 gap-3">
              <Field label="Video Type">
                <select className={selectCls} value={form.video_type} onChange={e => setF("video_type", e.target.value)}>
                  <option value="">Select</option>
                  {VIDEO_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
                </select>
              </Field>
              <Field label="Duration">
                <input className={inputCls} value={form.video_duration} onChange={e => setF("video_duration", e.target.value)} />
              </Field>
              <Field label="Revisions">
                <input type="number" min="0" className={inputCls} value={form.revision_count} onChange={e => setF("revision_count", e.target.value)} />
              </Field>
            </div>
          )}
          {freelancerType === "video_shooter" && (
            <div className="grid grid-cols-2 gap-3">
              <Field label="Start Time">
                <input type="time" className={inputCls} value={form.start_time} onChange={e => setF("start_time", e.target.value)} />
              </Field>
              <Field label="End Time">
                <input type="time" className={inputCls} value={form.end_time} onChange={e => setF("end_time", e.target.value)} />
              </Field>
              <Field label="Break (min)">
                <input type="number" min="0" step="5" className={inputCls} placeholder="0" value={form.break_minutes} onChange={e => setF("break_minutes", e.target.value)} />
              </Field>
              <Field label="Travel Hours">
                <input type="number" min="0" step="0.5" className={inputCls} value={form.travel_hours} onChange={e => setF("travel_hours", e.target.value)} />
              </Field>
            </div>
          )}

          <div className="grid grid-cols-2 gap-3">
            <Field label="Status">
              <select className={selectCls} value={form.status} onChange={e => setF("status", e.target.value)}>
                {WK_STATUSES.map(s => <option key={s} value={s}>{s.replace("_", " ")}</option>)}
              </select>
            </Field>
            <Field label="Payment">
              <div className="flex gap-2 mt-1">
                <button type="button" onClick={() => setF("payment_status", "unpaid")}
                  className="flex-1 py-1.5 rounded-lg text-[12px] font-bold transition-all"
                  style={form.payment_status === "unpaid" ? { background: "#fee2e2", color: "#991b1b" } : { background: "#f3f4f6", color: "#6b7280" }}>
                  Unpaid
                </button>
                <button type="button" onClick={() => setF("payment_status", "paid")}
                  className="flex-1 py-1.5 rounded-lg text-[12px] font-bold transition-all"
                  style={form.payment_status === "paid" ? { background: "#d1fae5", color: "#065f46" } : { background: "#f3f4f6", color: "#6b7280" }}>
                  Paid
                </button>
              </div>
            </Field>
          </div>

          <Field label="Notes">
            <input className={inputCls} placeholder="Optional notes…" value={form.notes} onChange={e => setF("notes", e.target.value)} />
          </Field>

          {err && <p className="text-[11px] text-red-600">{err}</p>}

          <div className="flex gap-2 justify-end">
            <button type="button" onClick={() => setEditing(false)}
              className="px-4 py-2 rounded-xl text-[12px] font-semibold text-gray-600 border border-gray-200 hover:bg-gray-50 transition-all">
              Cancel
            </button>
            <button type="submit" disabled={saving}
              className="flex items-center gap-1.5 px-4 py-2 rounded-xl text-[12px] font-bold text-white transition-all"
              style={{ background: saving ? "#f87171" : "#6366F1" }}>
              <Check size={12} />{saving ? "Saving…" : "Save Changes"}
            </button>
          </div>
        </form>
      )}
    </div>
  )
}

// ── Freelancer Card ───────────────────────────────────────────────────────────

function FreelancerCard({ f, entries, assignedMembers, onEdit, onViewWork, onDelete }: {
  f: Freelancer; entries: WorkEntry[]
  assignedMembers: TeamMemberOption[]
  onEdit: () => void; onViewWork: () => void; onDelete: () => void
}) {
  const cfg = TYPE_CFG[f.type]
  const myEntries = entries.filter(e => e.freelancer_id === f.id)
  const completed = myEntries.filter(e => e.status === "completed").length
  const totalEarned = myEntries.reduce((s, e) => s + (e.amount ?? 0), 0)
  const pending = myEntries.filter(e => e.payment_status === "unpaid" && e.status === "completed").reduce((s, e) => s + (e.amount ?? 0), 0)
  const initials = f.name.split(" ").map(n => n[0]).join("").slice(0, 2).toUpperCase()

  const rateInfo = f.type === "voice_over" && f.cost_per_minute
    ? `₹${f.cost_per_minute}/min`
    : f.type === "video_editor" && f.cost_per_video
    ? `₹${f.cost_per_video}/video`
    : f.type === "video_shooter" && f.cost_per_hour
    ? `₹${f.cost_per_hour}/hr`
    : null

  return (
    <div className="bg-white border border-gray-100 rounded-2xl p-5 hover:border-gray-200 hover:shadow-md transition-all flex flex-col gap-4">
      {/* Header */}
      <div className="flex items-start gap-3">
        <div className="w-12 h-12 rounded-xl flex items-center justify-center flex-shrink-0 text-[15px] font-black text-white"
          style={{ background: cfg.color }}>
          {initials}
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-start justify-between gap-2">
            <div>
              <p className="text-[15px] font-bold text-gray-900 leading-tight">{f.name}</p>
              <span className="inline-block text-[10px] font-bold px-2 py-0.5 rounded-full mt-1"
                style={{ background: cfg.bg, color: cfg.color, border: `1px solid ${cfg.border}` }}>
                {cfg.label}
              </span>
            </div>
            <div className="flex items-center gap-1">
              {f.status === "inactive" && (
                <span className="text-[9px] font-bold px-1.5 py-0.5 rounded-full bg-gray-100 text-gray-400">Inactive</span>
              )}
              <button onClick={onEdit} className="w-7 h-7 rounded-lg flex items-center justify-center text-gray-400 hover:text-gray-700 hover:bg-gray-100 transition-all">
                <Edit2 size={12} />
              </button>
              <button onClick={() => { if (confirm(`Delete ${f.name}?`)) onDelete() }}
                className="w-7 h-7 rounded-lg flex items-center justify-center text-gray-400 hover:text-red-500 hover:bg-red-50 transition-all">
                <Trash2 size={12} />
              </button>
            </div>
          </div>
          {f.rating > 0 && <StarDisplay rating={f.rating} />}
        </div>
      </div>

      {/* Info chips */}
      <div className="flex flex-wrap gap-2 text-[11px]">
        {f.phone && (
          <span className="flex items-center gap-1 px-2.5 py-1 rounded-lg bg-gray-50 text-gray-600 border border-gray-100">
            <Phone size={10} />{f.phone}
          </span>
        )}
        {rateInfo && (
          <span className="flex items-center gap-1 px-2.5 py-1 rounded-lg text-white font-semibold" style={{ background: cfg.color }}>
            <IndianRupee size={10} />{rateInfo}
          </span>
        )}
        {f.type === "voice_over" && f.language && (
          <span className="px-2.5 py-1 rounded-lg bg-purple-50 text-purple-600 border border-purple-100">{f.language}</span>
        )}
        {f.type === "voice_over" && f.voice_type && (
          <span className="px-2.5 py-1 rounded-lg bg-purple-50 text-purple-600 border border-purple-100">{f.voice_type}</span>
        )}
        {f.type === "video_editor" && f.editing_software?.slice(0, 2).map(s => (
          <span key={s} className="px-2.5 py-1 rounded-lg bg-blue-50 text-blue-600 border border-blue-100">{s}</span>
        ))}
        {f.type === "video_editor" && f.editing_software?.length > 2 && (
          <span className="px-2.5 py-1 rounded-lg bg-blue-50 text-blue-500">+{f.editing_software.length - 2}</span>
        )}
        {f.type === "video_shooter" && f.availability_schedule && (
          <span className="px-2.5 py-1 rounded-lg bg-emerald-50 text-emerald-600 border border-emerald-100">{f.availability_schedule}</span>
        )}
      </div>

      {/* Assigned members */}
      {assignedMembers.length > 0 && (
        <div className="flex flex-wrap items-center gap-1.5 pt-2 border-t border-gray-50">
          <Users2 size={11} style={{ color: "#9CA3AF" }} />
          {assignedMembers.map(m => (
            <span key={m.id} className="flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold"
              style={{ background: "rgba(222,26,26,0.07)", color: "#DE1A1A" }}>
              {m.name.split(" ")[0]}
            </span>
          ))}
        </div>
      )}

      {/* Stats row */}
      <div className="grid grid-cols-3 gap-2 pt-3 border-t border-gray-50">
        <div className="text-center">
          <p className="text-[18px] font-black text-gray-800">{myEntries.length}</p>
          <p className="text-[9px] font-semibold text-gray-400 uppercase tracking-wide">Total Works</p>
        </div>
        <div className="text-center">
          <p className="text-[13px] font-bold text-gray-700">{totalEarned ? fmt(totalEarned) : "—"}</p>
          <p className="text-[9px] font-semibold text-gray-400 uppercase tracking-wide">Earned</p>
        </div>
        <div className="text-center">
          {pending > 0
            ? <p className="text-[13px] font-bold text-amber-600">{fmt(pending)}</p>
            : <p className="text-[13px] font-bold text-emerald-600">{completed > 0 ? "Paid ✓" : "—"}</p>
          }
          <p className="text-[9px] font-semibold text-gray-400 uppercase tracking-wide">Pending Pay</p>
        </div>
      </div>

      {/* Actions */}
      <div className="flex gap-2">
        <button onClick={onViewWork}
          className="flex-1 py-2.5 rounded-xl text-[12px] font-bold transition-all border flex items-center justify-center gap-2"
          style={{ border: `1.5px solid ${cfg.border}`, color: cfg.color, background: cfg.bg }}>
          <Calendar size={13} />Work ({myEntries.length})
        </button>
        <Link href={`/admin/freelancers/${f.id}`}
          className="flex-1 py-2.5 rounded-xl text-[12px] font-bold transition-all border flex items-center justify-center gap-2"
          style={{ border: "1.5px solid #E5E7EB", color: "#374151", background: "#F9FAFB" }}>
          <ExternalLink size={13} />Profile
        </Link>
      </div>
    </div>
  )
}

// ── Main Component ────────────────────────────────────────────────────────────

export default function FreelancersClient({
  freelancers: initFreelancers,
  workEntries: initEntries,
  activeClientNames,
  pastClientNames,
  stats: initStats,
  teamMembers = [],
  assignments: initAssignments = {},
}: {
  freelancers: Freelancer[]
  workEntries: WorkEntry[]
  activeClientNames: string[]
  pastClientNames: string[]
  stats: FreelancerStats
  teamMembers?: TeamMemberOption[]
  assignments?: Record<string, string[]>
}) {
  const router = useRouter()
  const [, startTransition] = useTransition()

  const [freelancers, setFreelancers] = useState(initFreelancers)
  const [entries, setEntries] = useState(initEntries)
  const [assignments, setAssignments] = useState(initAssignments)

  // Sync state when server refreshes (router.refresh() sends updated props)
  useEffect(() => { setFreelancers(initFreelancers) }, [initFreelancers])
  useEffect(() => { setEntries(initEntries) }, [initEntries])
  useEffect(() => { setAssignments(initAssignments) }, [initAssignments])

  // Sheet states
  const [sheetOpen, setSheetOpen] = useState(false)
  const [editingFreelancer, setEditingFreelancer] = useState<Freelancer | null>(null)
  const [workSheetOpen, setWorkSheetOpen] = useState(false)
  const [selectedFreelancer, setSelectedFreelancer] = useState<Freelancer | null>(null)

  // Filters
  const [filter, setFilter] = useState<FreelancerType | "all">("all")
  const [search, setSearch] = useState("")

  // Computed stats
  const stats = useMemo<FreelancerStats>(() => ({
    total: freelancers.length,
    voiceOver: freelancers.filter(f => f.type === "voice_over").length,
    videoEditor: freelancers.filter(f => f.type === "video_editor").length,
    videoShooter: freelancers.filter(f => f.type === "video_shooter").length,
    other: freelancers.filter(f => f.type === "other").length,
    totalWorks: entries.length,
    completedWorks: entries.filter(e => e.status === "completed").length,
    totalCost: entries.reduce((s, e) => s + (e.amount ?? 0), 0),
    paidAmount: entries.filter(e => e.payment_status === "paid").reduce((s, e) => s + (e.amount ?? 0), 0),
    pendingAmount: entries.filter(e => e.payment_status === "unpaid" && e.status === "completed").reduce((s, e) => s + (e.amount ?? 0), 0),
  }), [freelancers, entries])

  const filtered = useMemo(() =>
    freelancers.filter(f =>
      (filter === "all" || f.type === filter) &&
      f.name.toLowerCase().includes(search.toLowerCase())
    ), [freelancers, filter, search])

  // Stable reference so FreelancerSheet's useEffect doesn't re-fire on every render
  const sheetInitAssignments = useMemo(
    () => editingFreelancer ? (assignments[editingFreelancer.id] ?? []) : [],
    [editingFreelancer, assignments]
  )

  function openAdd() { setEditingFreelancer(null); setSheetOpen(true) }
  function openEdit(f: Freelancer) { setEditingFreelancer(f); setSheetOpen(true) }
  function openWork(f: Freelancer) { setSelectedFreelancer(f); setWorkSheetOpen(true) }

  async function handleDelete(id: string) {
    const res = await deleteFreelancer(id)
    if (res.success) {
      setFreelancers(prev => prev.filter(f => f.id !== id))
      startTransition(() => router.refresh())
    }
  }

  const FILTER_TABS: { key: FreelancerType | "all"; label: string }[] = [
    { key: "all",          label: `All (${stats.total})` },
    { key: "voice_over",   label: `Voice Over (${stats.voiceOver})` },
    { key: "video_editor", label: `Video Editor (${stats.videoEditor})` },
    { key: "video_shooter",label: `Video Shooter (${stats.videoShooter})` },
    { key: "other",        label: `Other (${stats.other})` },
  ]

  const STAT_CARDS = [
    { label: "Total Freelancers", value: stats.total, color: "#DE1A1A", bg: "rgba(222,26,26,0.06)" },
    { label: "Total Works",       value: stats.totalWorks, color: "#0ea5e9", bg: "rgba(14,165,233,0.06)" },
    { label: "Completed",         value: stats.completedWorks, color: "#10b981", bg: "rgba(16,185,129,0.06)" },
    { label: "Total Cost",        value: fmt(stats.totalCost), color: "#8b5cf6", bg: "rgba(139,92,246,0.06)" },
    { label: "Paid",              value: fmt(stats.paidAmount), color: "#10b981", bg: "rgba(16,185,129,0.06)" },
    { label: "Pending (Unpaid)",  value: fmt(stats.pendingAmount), color: "#f59e0b", bg: "rgba(245,158,11,0.06)" },
    { label: "Voice Over",        value: stats.voiceOver, color: "#8b5cf6", bg: "rgba(139,92,246,0.06)" },
    { label: "Editors / Shooters",value: stats.videoEditor + stats.videoShooter, color: "#0ea5e9", bg: "rgba(14,165,233,0.06)" },
  ]

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Page header */}
      <div className="bg-white border-b border-gray-100 px-6 py-5">
        <div className="max-w-7xl mx-auto flex items-center justify-between gap-4">
          <div>
            <h1 className="text-[22px] font-black text-gray-900">Freelancers</h1>
            <p className="text-[13px] text-gray-400 mt-0.5">{stats.total} freelancer{stats.total !== 1 ? "s" : ""} · {stats.totalWorks} work entries</p>
          </div>
          <button onClick={openAdd}
            className="flex items-center gap-2 px-4 py-2.5 rounded-xl text-[13px] font-bold text-white transition-all hover:opacity-90 shadow-sm"
            style={{ background: "#DE1A1A" }}>
            <Plus size={15} />Add Freelancer
          </button>
        </div>
      </div>

      <div className="max-w-7xl mx-auto px-4 sm:px-6 py-6 flex flex-col gap-6">
        {/* Stats grid */}
        <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-8 gap-3">
          {STAT_CARDS.map(({ label, value, color, bg }) => (
            <div key={label} className="bg-white rounded-2xl p-4 border border-gray-100 flex flex-col gap-1">
              <p className="text-[18px] font-black" style={{ color }}>{value}</p>
              <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-wide leading-tight">{label}</p>
            </div>
          ))}
        </div>

        {/* Filter + Search */}
        <div className="flex flex-col sm:flex-row items-start sm:items-center gap-3">
          <div className="flex items-center gap-1 overflow-x-auto pb-1 flex-shrink-0">
            {FILTER_TABS.map(tab => (
              <button key={tab.key} onClick={() => setFilter(tab.key)}
                className="whitespace-nowrap px-3 py-2 rounded-xl text-[12px] font-bold transition-all flex-shrink-0"
                style={filter === tab.key
                  ? { background: "#DE1A1A", color: "#fff" }
                  : { background: "#f3f4f6", color: "#6b7280" }
                }>
                {tab.label}
              </button>
            ))}
          </div>
          <div className="relative flex-1 w-full sm:max-w-[260px]">
            <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
            <input
              value={search} onChange={e => setSearch(e.target.value)}
              placeholder="Search freelancers…"
              className="w-full pl-9 pr-4 py-2.5 rounded-xl border border-gray-200 text-[13px] placeholder-gray-400 bg-white focus:outline-none focus:border-[#DE1A1A] transition-all" />
          </div>
        </div>

        {/* Grid */}
        {filtered.length === 0 ? (
          <div className="flex flex-col items-center justify-center bg-white rounded-2xl border border-gray-100 py-20">
            <UserCog size={40} strokeWidth={1.5} className="text-gray-300 mb-3" />
            <p className="text-[15px] font-semibold text-gray-400">
              {search ? `No freelancers match "${search}"` : "No freelancers yet"}
            </p>
            <p className="text-[13px] text-gray-300 mt-1">Click "Add Freelancer" to get started</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {filtered.map(f => (
              <FreelancerCard
                key={f.id} f={f} entries={entries}
                assignedMembers={teamMembers.filter(m => (assignments[f.id] ?? []).includes(m.id))}
                onEdit={() => openEdit(f)}
                onViewWork={() => openWork(f)}
                onDelete={() => handleDelete(f.id)}
              />
            ))}
          </div>
        )}
      </div>

      {/* Sheets */}
      <FreelancerSheet
        open={sheetOpen}
        onClose={() => { setSheetOpen(false); setEditingFreelancer(null) }}
        editing={editingFreelancer}
        teamMembers={teamMembers}
        initialAssignments={sheetInitAssignments}
        onCreated={f => {
          setFreelancers(prev => [f, ...prev])
          startTransition(() => router.refresh())
        }}
        onUpdated={(f, newAssignedIds) => {
          setFreelancers(prev => prev.map(x => x.id === f.id ? { ...x, ...f } : x))
          if (newAssignedIds !== undefined) {
            setAssignments(prev => ({ ...prev, [f.id]: newAssignedIds }))
          }
          startTransition(() => router.refresh())
        }}
      />

      <WorkSheet
        open={workSheetOpen}
        onClose={() => { setWorkSheetOpen(false); setSelectedFreelancer(null) }}
        freelancer={selectedFreelancer}
        entries={entries}
        activeClientNames={activeClientNames}
        pastClientNames={pastClientNames}
        onEntryAdded={e => { setEntries(prev => [e, ...prev]); startTransition(() => router.refresh()) }}
        onEntryUpdated={(id, patch) => setEntries(prev => prev.map(e => e.id === id ? { ...e, ...patch } : e))}
        onEntryDeleted={id => setEntries(prev => prev.filter(e => e.id !== id))}
      />
    </div>
  )
}
