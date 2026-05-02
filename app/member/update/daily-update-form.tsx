"use client"

import { useState, useTransition } from "react"
import { useRouter, useSearchParams } from "next/navigation"
import {
  Plus, Trash2, Loader2, Clock, BookOpen, Briefcase,
  Camera, Film, Upload, Layers, Link2, ChevronDown,
} from "lucide-react"
import { submitDailyUpdate } from "@/lib/actions/daily-updates"
import type { WorkEntryInput } from "@/lib/validations/daily-update"

interface Project { id: string; business_name: string }

const TASK_TYPES = [
  { value: "shoot",  label: "Shoot",  icon: Camera },
  { value: "edit",   label: "Edit",   icon: Film   },
  { value: "upload", label: "Upload", icon: Upload  },
  { value: "other",  label: "Other",  icon: Layers  },
] as const

type TaskType = (typeof TASK_TYPES)[number]["value"]

// HH:MM string → fractional hours
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
    task_type:      "other",
    title:          "",
    start_time:     "",
    end_time:       "",
    duration_hours: 0,
    notes:          "",
  }
}

const IS: React.CSSProperties = {
  background: "#F8F9FA",
  border: "1px solid #2E2E2E",
  color: "#111111",
  borderRadius: "10px",
  padding: "10px 14px",
  fontSize: "13px",
  outline: "none",
  width: "100%",
  colorScheme: "dark",
}

const LABEL: React.CSSProperties = {
  display: "block",
  fontSize: "10px",
  fontWeight: 700,
  textTransform: "uppercase",
  letterSpacing: "0.16em",
  marginBottom: "6px",
  color: "#9CA3AF",
}

export default function DailyUpdateForm({ projects }: { projects: Project[] }) {
  const router = useRouter()
  const params = useSearchParams()
  const [pending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)

  // Tab
  const [tab, setTab] = useState<"working" | "learning">("working")

  // Pre-fill from "Log Work" navigation (client_id, client_name, task_title)
  const prefillEntry: WorkEntryInput = {
    ...newEntry(),
    client_id:   params.get("client_id") ?? null,
    client_name: params.get("client_name") ?? "",
    title:       params.get("task_title") ?? "",
  }

  // Working tab state
  const [entries, setEntries] = useState<WorkEntryInput[]>([prefillEntry])
  const [links, setLinks] = useState<string[]>([])
  const [newLink, setNewLink] = useState("")
  // Media stats
  const [showMedia, setShowMedia] = useState(false)
  const [shootCount, setShootCount] = useState(0)
  const [editingCount, setEditingCount] = useState(0)
  const [shootTimeH, setShootTimeH] = useState("")
  const [editingTimeH, setEditingTimeH] = useState("")

  // Learning tab state
  const [learningTopic, setLearningTopic] = useState("")
  const [learningHours, setLearningHours] = useState("")
  const [learningNotes, setLearningNotes] = useState("")

  // ── entry helpers ──────────────────────────────────────────
  function updateEntry(i: number, patch: Partial<WorkEntryInput>) {
    setEntries((prev) => {
      const next = [...prev]
      const updated = { ...next[i], ...patch }
      // auto-calc duration whenever start/end changes
      if ("start_time" in patch || "end_time" in patch) {
        updated.duration_hours = calcDuration(updated.start_time, updated.end_time)
      }
      next[i] = updated
      return next
    })
  }

  function removeEntry(i: number) {
    setEntries((prev) => prev.filter((_, idx) => idx !== i))
  }

  function addEntry() {
    setEntries((prev) => [...prev, newEntry()])
  }

  function selectClient(i: number, projectId: string) {
    const proj = projects.find((p) => p.id === projectId)
    updateEntry(i, { client_id: projectId || null, client_name: proj?.business_name ?? "" })
  }

  function addLink() {
    const v = newLink.trim()
    if (v) { setLinks((prev) => [...prev, v]); setNewLink("") }
  }

  // ── submit ─────────────────────────────────────────────────
  function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)

    startTransition(async () => {
      const result = await submitDailyUpdate({
        active_tab:          tab,
        work_entries:        tab === "working" ? entries : [],
        links,
        shoot_count:         shootCount,
        editing_count:       editingCount,
        shoot_time_hours:    shootTimeH ? parseFloat(shootTimeH) : undefined,
        editing_time_hours:  editingTimeH ? parseFloat(editingTimeH) : undefined,
        learning_topic:      learningTopic || undefined,
        learning_hours:      parseFloat(learningHours) || 0,
        learning_notes:      learningNotes || undefined,
      })

      if (result.success) {
        router.push("/member/dashboard")
        router.refresh()
      } else {
        setError(result.error ?? "Something went wrong")
      }
    })
  }

  const totalHours = entries.reduce((s, e) => s + e.duration_hours, 0)
  const roundedTotal = Math.round(totalHours * 10) / 10

  return (
    <>
      <style>{`
        .du::placeholder { color: rgba(255,255,255,0.18); }
        .du:focus { border-color: rgba(220,38,38,0.4) !important; box-shadow: 0 0 0 2px rgba(220,38,38,0.06); }
        .du-sel { appearance: none; }
      `}</style>

      {/* ── Tab switcher ────────────────────────────────────── */}
      <div className="flex gap-2 mb-6 p-1 rounded-xl" style={{ background: "#F8F9FA", border: "1px solid #2A2A2A" }}>
        {(["working", "learning"] as const).map((t) => {
          const Icon = t === "working" ? Briefcase : BookOpen
          const active = tab === t
          return (
            <button key={t} type="button" onClick={() => setTab(t)}
              className="flex-1 flex items-center justify-center gap-2 py-2.5 rounded-lg text-[13px] font-bold capitalize transition-all"
              style={active
                ? { background: "#FFFFFF", color: "#111111", border: "1px solid #333" }
                : { background: "transparent", color: "#9CA3AF", border: "1px solid transparent" }
              }>
              <Icon size={14} style={{ color: active ? "#DC2626" : "#9CA3AF" }} />
              {t === "working" ? "Working" : "Learning"}
            </button>
          )
        })}
      </div>

      <form onSubmit={handleSubmit} className="space-y-5">

        {/* ════════════════════════════════════════════════════
            WORKING TAB
        ════════════════════════════════════════════════════ */}
        {tab === "working" && (
          <>
            {/* Work entries */}
            <div>
              <div className="flex items-center justify-between mb-3">
                <div>
                  <p style={{ ...LABEL, marginBottom: 2 }}>Work Entries</p>
                  {roundedTotal > 0 && (
                    <p className="text-[11px]" style={{ color: "#DC2626" }}>
                      Total: {roundedTotal}h
                    </p>
                  )}
                </div>
                <button type="button" onClick={addEntry}
                  className="flex items-center gap-1.5 text-[12px] font-bold px-3 py-1.5 rounded-lg"
                  style={{ background: "rgba(220,38,38,0.08)", color: "#DC2626", border: "1px solid rgba(220,38,38,0.15)" }}>
                  <Plus size={12} /> Add Entry
                </button>
              </div>

              <div className="space-y-3">
                {entries.map((entry, i) => (
                  <div key={entry.id} className="rounded-xl p-4 space-y-3"
                    style={{ background: "#FFFFFF", border: "1px solid #2A2A2A" }}>

                    {/* Row 1: task type chips */}
                    <div className="flex items-center gap-2 flex-wrap">
                      {TASK_TYPES.map(({ value, label, icon: Icon }) => (
                        <button key={value} type="button"
                          onClick={() => updateEntry(i, { task_type: value as TaskType })}
                          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[12px] font-bold transition-all"
                          style={entry.task_type === value
                            ? { background: "rgba(220,38,38,0.1)", color: "#DC2626", border: "1px solid rgba(220,38,38,0.25)" }
                            : { background: "#FFFFFF", color: "#9CA3AF", border: "1px solid #333" }
                          }>
                          <Icon size={11} /> {label}
                        </button>
                      ))}
                      <button type="button" onClick={() => removeEntry(i)}
                        className="ml-auto p-1.5 rounded-lg"
                        style={{ background: "rgba(255,107,87,0.08)", border: "1px solid rgba(255,107,87,0.15)" }}>
                        <Trash2 size={13} style={{ color: "#DC2626" }} />
                      </button>
                    </div>

                    {/* Row 2: client + title */}
                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <label style={LABEL}>Client</label>
                        {projects.length > 0 ? (
                          <div className="relative">
                            <select
                              value={entry.client_id ?? ""}
                              onChange={(e) => selectClient(i, e.target.value)}
                              className="du du-sel" style={IS}>
                              <option value="">Select client…</option>
                              {projects.map((p) => (
                                <option key={p.id} value={p.id}>{p.business_name}</option>
                              ))}
                            </select>
                            <ChevronDown size={13} className="absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none"
                              style={{ color: "#9CA3AF" }} />
                          </div>
                        ) : (
                          <input
                            className="du" style={IS}
                            placeholder="Client name"
                            value={entry.client_name}
                            onChange={(e) => updateEntry(i, { client_name: e.target.value })} />
                        )}
                      </div>
                      <div>
                        <label style={LABEL}>Title *</label>
                        <input className="du" style={IS}
                          placeholder={`e.g. ${entry.task_type === "shoot" ? "Product photoshoot" : entry.task_type === "edit" ? "Reel edit" : "Work title"}`}
                          value={entry.title}
                          onChange={(e) => updateEntry(i, { title: e.target.value })} />
                      </div>
                    </div>

                    {/* Row 3: start / end / auto duration */}
                    <div className="grid grid-cols-3 gap-3">
                      <div>
                        <label style={LABEL}>Start Time *</label>
                        <input type="time" className="du" style={IS}
                          value={entry.start_time}
                          onChange={(e) => updateEntry(i, { start_time: e.target.value })} />
                      </div>
                      <div>
                        <label style={LABEL}>End Time *</label>
                        <input type="time" className="du" style={IS}
                          value={entry.end_time}
                          onChange={(e) => updateEntry(i, { end_time: e.target.value })} />
                      </div>
                      <div>
                        <label style={LABEL}>Duration</label>
                        <div className="flex items-center justify-center h-[42px] rounded-[10px] text-[14px] font-black"
                          style={{ background: "#FFFFFF", border: "1px solid #333",
                            color: entry.duration_hours > 0 ? "#DC2626" : "rgba(0,0,0,0.1)" }}>
                          {entry.duration_hours > 0 ? `${entry.duration_hours}h` : "—"}
                        </div>
                      </div>
                    </div>

                    {/* Row 4: notes */}
                    <div>
                      <label style={LABEL}>Notes</label>
                      <textarea rows={2} className="du resize-none" style={IS}
                        placeholder="What was done? Any output or blockers…"
                        value={entry.notes ?? ""}
                        onChange={(e) => updateEntry(i, { notes: e.target.value })} />
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* ── Media Stats (optional) ───────────────────── */}
            <div className="rounded-xl overflow-hidden" style={{ border: "1px solid #2A2A2A" }}>
              <button type="button"
                onClick={() => setShowMedia((v) => !v)}
                className="w-full flex items-center justify-between px-4 py-3"
                style={{ background: "#FFFFFF" }}>
                <div className="flex items-center gap-2">
                  <Camera size={13} style={{ color: "#DC2626" }} />
                  <span className="text-[12px] font-bold uppercase tracking-wider"
                    style={{ color: "#6B7280" }}>Media Stats</span>
                  <span className="text-[10px] px-1.5 py-0.5 rounded"
                    style={{ background: "rgba(0,0,0,0.05)", color: "#9CA3AF" }}>optional</span>
                </div>
                <ChevronDown size={14} className={`transition-transform ${showMedia ? "rotate-180" : ""}`}
                  style={{ color: "#9CA3AF" }} />
              </button>

              {showMedia && (
                <div className="px-4 pb-4 pt-3 grid grid-cols-2 gap-3"
                  style={{ background: "#F8F9FA", borderTop: "1px solid #2A2A2A" }}>
                  <div>
                    <label style={LABEL}>Shoot Count</label>
                    <input type="number" min="0" className="du" style={IS}
                      value={shootCount || ""}
                      onChange={(e) => setShootCount(parseInt(e.target.value) || 0)}
                      placeholder="0" />
                  </div>
                  <div>
                    <label style={LABEL}>Editing Count</label>
                    <input type="number" min="0" className="du" style={IS}
                      value={editingCount || ""}
                      onChange={(e) => setEditingCount(parseInt(e.target.value) || 0)}
                      placeholder="0" />
                  </div>
                  <div>
                    <label style={LABEL}>Shoot Hours</label>
                    <input type="number" min="0" step="0.5" className="du" style={IS}
                      value={shootTimeH}
                      onChange={(e) => setShootTimeH(e.target.value)}
                      placeholder="0" />
                  </div>
                  <div>
                    <label style={LABEL}>Editing Hours</label>
                    <input type="number" min="0" step="0.5" className="du" style={IS}
                      value={editingTimeH}
                      onChange={(e) => setEditingTimeH(e.target.value)}
                      placeholder="0" />
                  </div>
                </div>
              )}
            </div>

            {/* ── Attachment Links ─────────────────────────── */}
            <div>
              <label style={LABEL}>Attachment Links</label>
              <div className="flex gap-2 mb-2">
                <input className="du flex-1" style={IS}
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
                      style={{ background: "#FFFFFF", border: "1px solid #2A2A2A" }}>
                      <Link2 size={12} style={{ color: "#9CA3AF" }} />
                      <span className="flex-1 text-[12px] truncate" style={{ color: "#4B5563" }}>{lnk}</span>
                      <button type="button" onClick={() => setLinks((prev) => prev.filter((_, idx) => idx !== i))}>
                        <Trash2 size={11} style={{ color: "rgba(255,107,87,0.6)" }} />
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </>
        )}

        {/* ════════════════════════════════════════════════════
            LEARNING TAB
        ════════════════════════════════════════════════════ */}
        {tab === "learning" && (
          <div className="space-y-4">
            <div className="rounded-xl p-5 space-y-4"
              style={{ background: "#FFFFFF", border: "1px solid #2A2A2A" }}>
              <div>
                <label style={LABEL}>Topic *</label>
                <input className="du" style={IS}
                  placeholder="e.g. Meta Ads strategy, Color grading, React hooks…"
                  value={learningTopic}
                  onChange={(e) => setLearningTopic(e.target.value)} />
              </div>
              <div>
                <label style={LABEL}>Time Spent (hours) *</label>
                <input type="number" min="0.5" max="24" step="0.5" className="du" style={{ ...IS, maxWidth: 160 }}
                  placeholder="e.g. 1.5"
                  value={learningHours}
                  onChange={(e) => setLearningHours(e.target.value)} />
              </div>
              <div>
                <label style={LABEL}>Notes</label>
                <textarea rows={4} className="du resize-none" style={IS}
                  placeholder="What did you learn? Key takeaways, resources used…"
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

        {/* ── Total hours summary bar ──────────────────────── */}
        {tab === "working" && roundedTotal > 0 && (
          <div className="flex items-center gap-3 px-4 py-3 rounded-xl"
            style={{ background: "rgba(220,38,38,0.05)", border: "1px solid rgba(220,38,38,0.15)" }}>
            <Clock size={14} style={{ color: "#DC2626" }} />
            <p className="text-[13px] font-semibold" style={{ color: "#DC2626" }}>
              {roundedTotal}h total across {entries.length} entr{entries.length === 1 ? "y" : "ies"}
            </p>
          </div>
        )}

        {/* ── Error ────────────────────────────────────────── */}
        {error && (
          <div className="flex items-center gap-2.5 px-4 py-3 rounded-lg"
            style={{ background: "rgba(255,107,87,0.07)", border: "1px solid rgba(255,107,87,0.18)", color: "#DC2626" }}>
            <span className="text-[13px]">{error}</span>
          </div>
        )}

        {/* ── Submit ───────────────────────────────────────── */}
        <button type="submit" disabled={pending}
          className="w-full py-3.5 rounded-xl text-[14px] font-black flex items-center justify-center gap-2 transition-all"
          style={{
            background: pending ? "rgba(220,38,38,0.5)" : "#DC2626",
            color: "#0D0D0D",
            cursor: pending ? "not-allowed" : "pointer",
          }}>
          {pending && <Loader2 size={16} className="animate-spin" />}
          {pending ? "Submitting…" : "Submit Daily Update →"}
        </button>
      </form>
    </>
  )
}
