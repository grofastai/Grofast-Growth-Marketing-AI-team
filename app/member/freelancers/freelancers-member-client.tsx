"use client"

import { useState, useMemo, useTransition } from "react"
import { X, Plus, ChevronDown, ChevronLeft, ChevronRight, Loader2, Star, Link2, FileText, IndianRupee, Users, Pencil, CheckCircle2, Trash2 } from "lucide-react"
import { saveFreelancerWorkEntry, toggleFreelancerPaymentStatus, updateFreelancerWorkEntry, deleteFreelancerWorkEntry } from "@/lib/actions/freelancer-work"
import { buildClientOptions } from "@/lib/utils/client-options"

// ── Types ─────────────────────────────────────────────────────────────────────

export type FreelancerTeam =
  | "Freelance RJ Voiceover"
  | "Freelance Graphics Designer"
  | "Freelance Content Writer"
  | "Freelance Development & Automation"
  | "Freelance Marketing & Operations"
  | "Freelance IT Technology & Media"

export type Freelancer = {
  id: string
  name: string
  team: FreelancerTeam
  phone: string | null
  rating: number
  status: "active" | "inactive"
  created_at: string
}

export type WorkEntry = {
  id: string
  freelancer_id: string
  date_finished: string
  date_given: string | null
  client_name: string
  title: string
  amount: number | null
  drive_link: string | null
  notes: string | null
  language: string | null
  duration_mins: number | null
  task_description: string | null
  team: FreelancerTeam
  payment_status: "unpaid" | "paid"
  created_at: string
}

// ── Team config ───────────────────────────────────────────────────────────────

const TEAM_CFG: Record<FreelancerTeam, {
  color: string; bg: string; border: string
  shortLabel: string; entryLabel: string; emoji: string; costLabel: string
}> = {
  "Freelance RJ Voiceover":            { color: "#A855F7", bg: "rgba(168,85,247,0.07)", border: "rgba(168,85,247,0.2)", shortLabel: "RJ Voiceover",  entryLabel: "Voiceover", emoji: "🎙️", costLabel: "Prize (INR)" },
  "Freelance Graphics Designer":        { color: "#F97316", bg: "rgba(249,115,22,0.07)",  border: "rgba(249,115,22,0.2)",  shortLabel: "Graphics",      entryLabel: "Design",    emoji: "🎨", costLabel: "Prize (INR)" },
  "Freelance Content Writer":           { color: "#14B8A6", bg: "rgba(20,184,166,0.07)",  border: "rgba(20,184,166,0.2)",  shortLabel: "Content",       entryLabel: "Content",   emoji: "✍️", costLabel: "Prize (INR)" },
  "Freelance Development & Automation": { color: "#6366F1", bg: "rgba(99,102,241,0.07)",  border: "rgba(99,102,241,0.2)",  shortLabel: "Dev & Auto",    entryLabel: "Task",      emoji: "💻", costLabel: "Project Price (INR)" },
  "Freelance Marketing & Operations":   { color: "#10B981", bg: "rgba(16,185,129,0.07)",  border: "rgba(16,185,129,0.2)",  shortLabel: "Marketing",     entryLabel: "Task",      emoji: "📊", costLabel: "Project Price (INR)" },
  "Freelance IT Technology & Media":    { color: "#8B5CF6", bg: "rgba(139,92,246,0.07)",  border: "rgba(139,92,246,0.2)",  shortLabel: "IT & Media",    entryLabel: "Task",      emoji: "🖥️", costLabel: "Project Price (INR)" },
}

const NO_LOGIN_TEAMS = Object.keys(TEAM_CFG) as FreelancerTeam[]

// ── Helpers ───────────────────────────────────────────────────────────────────

function getInitials(name: string) {
  return name.split(" ").map(n => n[0]).join("").slice(0, 2).toUpperCase()
}
function fmt(n: number) {
  return `₹${n.toLocaleString("en-IN", { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`
}
function monthLabel(ym: string) {
  const [y, m] = ym.split("-").map(Number)
  return new Date(y, m - 1, 1).toLocaleDateString("en-IN", { month: "long", year: "numeric" })
}
function todayIST() {
  return new Date(Date.now() + 5.5 * 60 * 60 * 1000).toISOString().split("T")[0]
}
function currentYM() {
  return todayIST().slice(0, 7)
}
function prevMonth(ym: string) {
  const [y, m] = ym.split("-").map(Number)
  const d = new Date(y, m - 2, 1)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`
}
function nextMonth(ym: string) {
  const [y, m] = ym.split("-").map(Number)
  const d = new Date(y, m, 1)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`
}

// ── Entry item type ───────────────────────────────────────────────────────────

type EntryItem = {
  date_given: string
  client_name: string
  title: string
  amount: string
  drive_link: string
  notes: string
  duration_mins: string   // RJ Voiceover
  language: string        // RJ Voiceover
  task_description: string // Dev / Marketing / IT
  payment_status: "unpaid" | "paid"
}

function blankEntry(today: string): EntryItem {
  return { date_given: today, client_name: "", title: "", amount: "", drive_link: "", notes: "", duration_mins: "", language: "", task_description: "", payment_status: "unpaid" }
}

// ── Shared field styles ───────────────────────────────────────────────────────

const FIELD: React.CSSProperties = {
  width: "100%", padding: "10px 14px", borderRadius: 10, fontSize: 13,
  border: "1.5px solid #E5E7EB", background: "#FAFAFA", color: "#111",
  outline: "none", fontFamily: "inherit", boxSizing: "border-box",
}
const LABEL: React.CSSProperties = {
  display: "block", fontSize: 10, fontWeight: 700, color: "#6B7280",
  textTransform: "uppercase", letterSpacing: "0.12em", marginBottom: 5,
}

// ── Single entry card inside work sheet ──────────────────────────────────────

function EntryCard({ team, entry, idx, activeClients, pastClients, onChange, onRemove, canRemove }: {
  team: FreelancerTeam
  entry: EntryItem
  idx: number
  activeClients: string[]
  pastClients: string[]
  onChange: (field: keyof EntryItem, val: string) => void
  onRemove: () => void
  canRemove: boolean
}) {
  const [showPast, setShowPast] = useState(pastClients.includes(entry.client_name))
  const [customMode, setCustomMode] = useState(
    !!entry.client_name && !activeClients.includes(entry.client_name) && !pastClients.includes(entry.client_name)
  )
  const cfg = TEAM_CFG[team]
  const isDevType = team === "Freelance Development & Automation" || team === "Freelance Marketing & Operations" || team === "Freelance IT Technology & Media"
  const isVoiceover = team === "Freelance RJ Voiceover"

  const titlePlaceholder =
    isVoiceover ? "e.g. Brand Intro Script — SKB Silks"
    : isDevType ? "e.g. Website Landing Page Build"
    : team === "Freelance Graphics Designer" ? "e.g. Summer Sale Banner — SKB Silks"
    : "e.g. Product Description — SKB Silks"

  return (
    <div style={{ border: `1.5px solid ${cfg.border}`, borderRadius: 14, padding: "16px 16px 14px", background: cfg.bg }}>
      {/* Card header */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 14 }}>
        <span style={{ fontSize: 13, fontWeight: 800, color: cfg.color }}>
          {cfg.emoji} {cfg.entryLabel} #{idx + 1}
        </span>
        {canRemove && (
          <button type="button" onClick={onRemove}
            style={{ width: 26, height: 26, borderRadius: "50%", border: "1px solid #FCA5A5", background: "#FEF2F2", display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer" }}>
            <X size={12} color="#EF4444" />
          </button>
        )}
      </div>

      <div style={{ display: "flex", flexDirection: "column", gap: 11 }}>

        {/* Date Given */}
        <div>
          <label style={LABEL}>Date Given *</label>
          <input type="date" value={entry.date_given} onChange={e => onChange("date_given", e.target.value)} style={{ ...FIELD, colorScheme: "light" }} />
        </div>

        {/* Client Name — exact same structure as daily update work log */}
        <div>
          <label style={LABEL}>Client Name *</label>
          {customMode ? (
            <div style={{ display: "flex", gap: 8 }}>
              <input
                type="text"
                autoFocus
                placeholder="Type client name…"
                value={entry.client_name}
                style={{ ...FIELD, flex: 1 }}
                onChange={e => onChange("client_name", e.target.value)}
              />
              <button type="button"
                onClick={() => { setCustomMode(false); setShowPast(false); onChange("client_name", "") }}
                style={{ padding: "0 12px", borderRadius: 10, border: "1.5px solid #E5E7EB", background: "#F9FAFB", fontSize: 12, color: "#6B7280", cursor: "pointer", whiteSpace: "nowrap" }}>
                ← Back
              </button>
            </div>
          ) : showPast ? (
            <div style={{ position: "relative" }}>
              <select
                autoFocus
                value=""
                onChange={e => {
                  const v = e.target.value
                  if (!v) return
                  if (v === "__back__") { setShowPast(false); onChange("client_name", "") }
                  else { onChange("client_name", v); setShowPast(false) }
                }}
                style={{ ...FIELD, appearance: "none", paddingRight: 34 }}>
                <option value="">📁 Past Clients — select one…</option>
                {pastClients.map(c => <option key={c} value={c}>{c}</option>)}
                <option value="__back__">← Back to active clients</option>
              </select>
              <ChevronDown size={13} style={{ position: "absolute", right: 11, top: "50%", transform: "translateY(-50%)", color: "#9CA3AF", pointerEvents: "none" }} />
            </div>
          ) : (
            <div style={{ position: "relative" }}>
              <select
                value={entry.client_name}
                onChange={e => {
                  const v = e.target.value
                  if (v === "__past_clients__") { setShowPast(true) }
                  else if (v === "__custom__") { setCustomMode(true); onChange("client_name", "") }
                  else onChange("client_name", v)
                }}
                style={{ ...FIELD, appearance: "none", paddingRight: 34 }}>
                <option value="">Select client…</option>
                {activeClients.map(c => <option key={c} value={c}>{c}</option>)}
                {pastClients.length > 0 && <option value="__past_clients__">📁 Past Clients →</option>}
                <option value="__custom__">✏️ Other (type manually)</option>
              </select>
              <ChevronDown size={13} style={{ position: "absolute", right: 11, top: "50%", transform: "translateY(-50%)", color: "#9CA3AF", pointerEvents: "none" }} />
            </div>
          )}
        </div>

        {/* Title */}
        <div>
          <label style={LABEL}>
            {isVoiceover ? "Script / Content Name *"
              : isDevType ? "Task Title *"
              : team === "Freelance Graphics Designer" ? "Design Title *"
              : "Content Title *"}
          </label>
          <input type="text" value={entry.title} onChange={e => onChange("title", e.target.value)} placeholder={titlePlaceholder} style={FIELD} />
        </div>

        {/* RJ Voiceover extras */}
        {isVoiceover && (
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
            <div>
              <label style={LABEL}>Duration</label>
              <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
                <div style={{ position: "relative", flex: 1 }}>
                  <input
                    type="number" min="0" max="99" step="1"
                    placeholder="0"
                    value={Math.floor(parseFloat(entry.duration_mins || "0")) || ""}
                    onChange={e => {
                      const m = parseInt(e.target.value) || 0
                      const s = Math.round(((parseFloat(entry.duration_mins || "0")) % 1) * 60)
                      onChange("duration_mins", String(m + s / 60))
                    }}
                    style={{ ...FIELD, paddingRight: 36, textAlign: "center" }}
                  />
                  <span style={{ position: "absolute", right: 10, top: "50%", transform: "translateY(-50%)", fontSize: 11, color: "#9CA3AF", pointerEvents: "none" }}>min</span>
                </div>
                <span style={{ fontSize: 16, color: "#D1D5DB", flexShrink: 0 }}>:</span>
                <div style={{ position: "relative", flex: 1 }}>
                  <input
                    type="number" min="0" max="59" step="1"
                    placeholder="00"
                    value={Math.round(((parseFloat(entry.duration_mins || "0")) % 1) * 60) || ""}
                    onChange={e => {
                      const m = Math.floor(parseFloat(entry.duration_mins || "0"))
                      const s = Math.min(59, parseInt(e.target.value) || 0)
                      onChange("duration_mins", String(m + s / 60))
                    }}
                    style={{ ...FIELD, paddingRight: 32, textAlign: "center" }}
                  />
                  <span style={{ position: "absolute", right: 10, top: "50%", transform: "translateY(-50%)", fontSize: 11, color: "#9CA3AF", pointerEvents: "none" }}>sec</span>
                </div>
              </div>
            </div>
            <div>
              <label style={LABEL}>Language</label>
              <div style={{ position: "relative" }}>
                <select value={entry.language} onChange={e => onChange("language", e.target.value)} style={{ ...FIELD, appearance: "none", paddingRight: 34 }}>
                  <option value="">Select…</option>
                  {["Tamil","English","Hindi","Kannada","Telugu","Malayalam"].map(l => <option key={l} value={l}>{l}</option>)}
                </select>
                <ChevronDown size={13} style={{ position: "absolute", right: 11, top: "50%", transform: "translateY(-50%)", color: "#9CA3AF", pointerEvents: "none" }} />
              </div>
            </div>
          </div>
        )}

        {/* Dev / Marketing / IT — Task Description */}
        {isDevType && (
          <div>
            <label style={LABEL}>Task Description</label>
            <textarea rows={2} value={entry.task_description} onChange={e => onChange("task_description", e.target.value)}
              placeholder="Brief details about the task..."
              style={{ ...FIELD, resize: "none" }} />
          </div>
        )}

        {/* Cost / Prize / Project Price */}
        <div>
          <label style={LABEL}>{cfg.costLabel} *</label>
          <div style={{ position: "relative" }}>
            <span style={{ position: "absolute", left: 13, top: "50%", transform: "translateY(-50%)", fontSize: 13, color: "#6B7280", fontWeight: 700 }}>₹</span>
            <input type="number" min="0" step="1" value={entry.amount} onChange={e => onChange("amount", e.target.value)}
              placeholder="e.g. 500"
              style={{ ...FIELD, paddingLeft: 28 }} />
          </div>
        </div>

        {/* Drive Link */}
        <div>
          <label style={LABEL}>🔗 {isDevType ? "Drive / Repo Link" : "Drive Link"}</label>
          <input type="text" value={entry.drive_link} onChange={e => onChange("drive_link", e.target.value)} placeholder="Paste Google Drive link..." style={FIELD} />
        </div>

        {/* Payment Status */}
        <div>
          <label style={LABEL}>Payment Status</label>
          <div style={{ display: "flex", gap: 8 }}>
            {(["unpaid", "paid"] as const).map(s => (
              <button key={s} type="button"
                onClick={() => onChange("payment_status", s)}
                style={{
                  flex: 1, padding: "9px 0", borderRadius: 10, fontSize: 13, fontWeight: 700, cursor: "pointer", border: "1.5px solid", transition: "all 0.15s",
                  background: entry.payment_status === s ? (s === "paid" ? "rgba(16,185,129,0.1)" : "rgba(245,158,11,0.1)") : "#F9FAFB",
                  borderColor: entry.payment_status === s ? (s === "paid" ? "#10B981" : "#F59E0B") : "#E5E7EB",
                  color: entry.payment_status === s ? (s === "paid" ? "#059669" : "#D97706") : "#9CA3AF",
                }}>
                {s === "paid" ? "✓ Paid" : "⏳ Not Paid"}
              </button>
            ))}
          </div>
        </div>

        {/* Notes */}
        <div>
          <label style={LABEL}>Notes</label>
          <textarea rows={2} value={entry.notes} onChange={e => onChange("notes", e.target.value)} placeholder="Additional notes..." style={{ ...FIELD, resize: "none" }} />
        </div>
      </div>
    </div>
  )
}

// ── Work Entry Sheet ──────────────────────────────────────────────────────────

function WorkEntrySheet({ freelancer, activeClients, pastClients, onClose, onSaved }: {
  freelancer: Freelancer
  activeClients: string[]
  pastClients: string[]
  onClose: () => void
  onSaved: (entries: WorkEntry[]) => void
}) {
  const cfg = TEAM_CFG[freelancer.team]
  const today = todayIST()
  const [dateFinished, setDateFinished] = useState(today)
  const [entries, setEntries] = useState<EntryItem[]>([blankEntry(today)])
  const [error, setError] = useState("")
  const [isPending, startTransition] = useTransition()

  function updateEntry(idx: number, field: keyof EntryItem, val: string) {
    setEntries(prev => prev.map((e, i) => i === idx ? { ...e, [field]: val } : e))
  }
  function addEntry() {
    setEntries(prev => [...prev, blankEntry(today)])
  }
  function removeEntry(idx: number) {
    setEntries(prev => prev.filter((_, i) => i !== idx))
  }

  function handleSave() {
    setError("")
    for (const [i, e] of entries.entries()) {
      if (!e.client_name) { setError(`Entry #${i + 1}: Client name is required`); return }
      if (!e.title.trim()) { setError(`Entry #${i + 1}: Title is required`); return }
      if (!e.amount || isNaN(parseFloat(e.amount))) { setError(`Entry #${i + 1}: ${cfg.costLabel} is required`); return }
    }

    startTransition(async () => {
      const result = await saveFreelancerWorkEntry({
        freelancer_id: freelancer.id,
        team: freelancer.team,
        date_finished: dateFinished,
        entries: entries.map(e => ({
          date_given: e.date_given || null,
          client_name: e.client_name,
          title: e.title.trim(),
          amount: parseFloat(e.amount),
          drive_link: e.drive_link || null,
          notes: e.notes || null,
          duration_mins: e.duration_mins ? parseFloat(e.duration_mins) : null,
          language: e.language || null,
          task_description: e.task_description || null,
          payment_status: e.payment_status,
        })),
      })
      if (!result.success) {
        setError(result.error ?? "Failed to save. Try again.")
        return
      }
      onSaved(result.entries ?? [])
      onClose()
    })
  }

  return (
    <>
      <div className="fixed inset-0 z-40" style={{ background: "rgba(0,0,0,0.55)", backdropFilter: "blur(3px)" }} onClick={onClose} />
      <div className="fixed right-0 top-0 h-full w-full sm:w-[460px] z-50 flex flex-col shadow-2xl" style={{ background: "#FFFFFF" }}>

        {/* Header */}
        <div style={{ padding: "18px 22px", borderBottom: "1px solid #F3F4F6", flexShrink: 0 }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
            <div>
              <h2 style={{ fontSize: 16, fontWeight: 800, color: "#111", margin: 0 }}>Add Work Entry</h2>
              <div style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 4 }}>
                <span style={{ fontSize: 12, fontWeight: 700, color: "#111" }}>{freelancer.name}</span>
                <span style={{ fontSize: 11, fontWeight: 600, padding: "2px 8px", borderRadius: 20, background: cfg.bg, color: cfg.color, border: `1px solid ${cfg.border}` }}>
                  {cfg.emoji} {cfg.shortLabel}
                </span>
              </div>
            </div>
            <button onClick={onClose} style={{ width: 32, height: 32, borderRadius: "50%", border: "1px solid #E5E7EB", background: "#F9FAFB", display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer" }}>
              <X size={14} color="#6B7280" />
            </button>
          </div>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto" style={{ padding: "20px 22px", display: "flex", flexDirection: "column", gap: 16 }}>

          {/* Date Finished — master date */}
          <div style={{ background: "#F8F9FF", border: "1.5px solid #E0E7FF", borderRadius: 12, padding: "14px 16px" }}>
            <label style={{ ...LABEL, color: "#4F46E5", marginBottom: 8 }}>📅 Date Finished * <span style={{ fontSize: 9, fontWeight: 500, color: "#9CA3AF", textTransform: "none", letterSpacing: 0 }}>(applies to all entries below)</span></label>
            <input type="date" value={dateFinished} onChange={e => setDateFinished(e.target.value)}
              style={{ ...FIELD, colorScheme: "light", border: "1.5px solid #C7D2FE", background: "#FFFFFF" }} />
          </div>

          {/* Entry cards */}
          {entries.map((entry, idx) => (
            <EntryCard
              key={idx}
              team={freelancer.team}
              entry={entry}
              idx={idx}
              activeClients={activeClients}
              pastClients={pastClients}
              onChange={(field, val) => updateEntry(idx, field, val)}
              onRemove={() => removeEntry(idx)}
              canRemove={entries.length > 1}
            />
          ))}

          {/* Add another */}
          <button type="button" onClick={addEntry}
            style={{ width: "100%", padding: "11px", borderRadius: 12, border: `1.5px dashed ${cfg.color}55`, background: cfg.bg, color: cfg.color, fontSize: 13, fontWeight: 700, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", gap: 6 }}>
            <Plus size={15} />
            Add Another {cfg.entryLabel}
          </button>

          {/* Error */}
          {error && (
            <div style={{ padding: "10px 14px", borderRadius: 10, background: "rgba(239,68,68,0.07)", border: "1px solid rgba(239,68,68,0.2)", fontSize: 12, color: "#DC2626", fontWeight: 600 }}>
              {error}
            </div>
          )}
        </div>

        {/* Footer */}
        <div style={{ padding: "14px 22px", borderTop: "1px solid #F3F4F6", display: "flex", gap: 10, flexShrink: 0 }}>
          <button onClick={onClose} style={{ flex: 1, padding: "11px", borderRadius: 12, border: "1.5px solid #E5E7EB", background: "#F9FAFB", color: "#6B7280", fontSize: 13, fontWeight: 700, cursor: "pointer" }}>
            Cancel
          </button>
          <button onClick={handleSave} disabled={isPending}
            style={{ flex: 2, padding: "11px", borderRadius: 12, border: "none", background: isPending ? "#9CA3AF" : `linear-gradient(135deg, ${cfg.color}, ${cfg.color}CC)`, color: "#FFFFFF", fontSize: 13, fontWeight: 700, cursor: isPending ? "not-allowed" : "pointer", display: "flex", alignItems: "center", justifyContent: "center", gap: 6, boxShadow: `0 4px 14px ${cfg.color}33` }}>
            {isPending && <Loader2 size={14} className="animate-spin" />}
            {isPending ? "Saving..." : `Save ${entries.length > 1 ? `${entries.length} Entries` : "Entry"}`}
          </button>
        </div>
      </div>
    </>
  )
}


// ── Sparkline ─────────────────────────────────────────────────────────────────

function Sparkline({ data, color }: { data: number[]; color: string }) {
  const pts = data.length > 1 ? data : [1, 2, 1, 3, 2, 4, 3, 5]
  const max = Math.max(...pts, 1), min = Math.min(...pts)
  const W = 80, H = 28
  const coords = pts.map((v, i) => {
    const x = (i / (pts.length - 1)) * W
    const y = H - 4 - ((v - min) / (max - min || 1)) * (H - 8)
    return `${x},${y}`
  })
  const d = `M${coords.join(" L")}`
  const id = `sg${color.replace("#", "")}`
  return (
    <svg viewBox={`0 0 ${W} ${H}`} style={{ width: "100%", height: 28 }} preserveAspectRatio="none">
      <defs>
        <linearGradient id={id} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={color} stopOpacity="0.3" />
          <stop offset="100%" stopColor={color} stopOpacity="0" />
        </linearGradient>
      </defs>
      <path d={`${d} L${W},${H} L0,${H} Z`} fill={`url(#${id})`} />
      <path d={d} stroke={color} strokeWidth="1.5" fill="none" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}

// ── Freelancer list item ──────────────────────────────────────────────────────

function FreelancerListItem({ freelancer, works, total, unpaid, isSelected, onClick }: {
  freelancer: Freelancer; works: number; total: number; unpaid: number
  isSelected: boolean; onClick: () => void
}) {
  const cfg = TEAM_CFG[freelancer.team]
  return (
    <button onClick={onClick} style={{ width: "100%", textAlign: "left", padding: "10px 14px", background: "transparent", border: "none", borderBottom: "1px solid #F5F5F7", cursor: "pointer", transition: "all 0.15s", borderLeft: `3px solid ${isSelected ? cfg.color : "transparent"}`, backgroundColor: isSelected ? `${cfg.color}0D` : "transparent" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 11 }}>
        <div style={{ width: 40, height: 40, borderRadius: 13, flexShrink: 0, background: isSelected ? `linear-gradient(135deg, ${cfg.color}, ${cfg.color}CC)` : cfg.bg, border: `1.5px solid ${isSelected ? "transparent" : cfg.border}`, display: "flex", alignItems: "center", justifyContent: "center", boxShadow: isSelected ? `0 4px 12px ${cfg.color}40` : "none" }}>
          <span style={{ fontSize: 13, fontWeight: 900, color: isSelected ? "#fff" : cfg.color }}>{getInitials(freelancer.name)}</span>
        </div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <p style={{ fontSize: 13, fontWeight: 800, color: isSelected ? "#111" : "#374151", margin: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{freelancer.name}</p>
          <p style={{ fontSize: 10, color: cfg.color, margin: "2px 0 0", fontWeight: 700 }}>{cfg.emoji} {cfg.shortLabel}</p>
        </div>
        <div style={{ textAlign: "right", flexShrink: 0 }}>
          <p style={{ fontSize: 12, fontWeight: 900, color: "#111", margin: 0 }}>{total > 0 ? fmt(total) : "—"}</p>
          <p style={{ fontSize: 9, margin: "2px 0 0", fontWeight: 700, color: unpaid > 0 ? "#EF4444" : "#10B981", textTransform: "uppercase", letterSpacing: "0.05em" }}>{works > 0 ? `${works}w` : "no work"}</p>
        </div>
      </div>
    </button>
  )
}

// ── Premium work history card ─────────────────────────────────────────────────

function DetailHistoryRow({ entry, onEdit, onDelete, onTogglePaid }: {
  entry: WorkEntry; onEdit: () => void; onDelete: () => void; onTogglePaid: () => void
}) {
  const cfg = TEAM_CFG[entry.team]
  const date = new Date(entry.date_finished + "T00:00:00").toLocaleDateString("en-IN", { day: "numeric", month: "short" })
  const isPaid = entry.payment_status === "paid"
  const durMins = entry.duration_mins ?? 0
  const durDisplay = durMins > 0 ? `${Math.floor(durMins)}m ${Math.round((durMins % 1) * 60)}s` : null

  return (
    <div style={{ background: "#FFFFFF", borderRadius: 18, border: "1px solid #F0F0F5", padding: "16px 18px", boxShadow: "0 2px 12px rgba(0,0,0,0.04)", display: "flex", alignItems: "flex-start", gap: 14, transition: "box-shadow 0.15s" }}
      onMouseEnter={e => (e.currentTarget as HTMLElement).style.boxShadow = "0 6px 24px rgba(0,0,0,0.09)"}
      onMouseLeave={e => (e.currentTarget as HTMLElement).style.boxShadow = "0 2px 12px rgba(0,0,0,0.04)"}>
      <div style={{ width: 46, height: 46, borderRadius: 14, flexShrink: 0, background: `linear-gradient(135deg, ${cfg.color}18 0%, ${cfg.color}08 100%)`, border: `1.5px solid ${cfg.color}25`, display: "flex", alignItems: "center", justifyContent: "center", marginTop: 1 }}>
        <span style={{ fontSize: 22 }}>{cfg.emoji}</span>
      </div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <p style={{ fontSize: 14, fontWeight: 800, color: "#111827", margin: 0, lineHeight: 1.3 }}>{entry.title}</p>
        <div style={{ display: "flex", flexWrap: "wrap", gap: "3px 10px", marginTop: 5 }}>
          <span style={{ fontSize: 11, fontWeight: 700, color: cfg.color, background: `${cfg.color}12`, padding: "1px 8px", borderRadius: 6 }}>{entry.client_name}</span>
          <span style={{ fontSize: 11, color: "#9CA3AF", fontWeight: 500 }}>{date}</span>
          {entry.language && <span style={{ fontSize: 11, color: "#6B7280" }}>· {entry.language}</span>}
          {durDisplay && <span style={{ fontSize: 11, color: "#6B7280" }}>· {durDisplay}</span>}
        </div>
        {entry.notes && <p style={{ fontSize: 11, color: "#9CA3AF", margin: "6px 0 0", fontStyle: "italic", lineHeight: 1.5 }}>{entry.notes}</p>}
      </div>
      <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", gap: 7, flexShrink: 0 }}>
        <p style={{ fontSize: 18, fontWeight: 900, color: "#111827", margin: 0, fontFamily: "var(--font-jakarta)", letterSpacing: "-0.02em" }}>{entry.amount ? fmt(entry.amount) : "—"}</p>
        <button onClick={onTogglePaid} style={{ padding: "4px 12px", borderRadius: 99, fontSize: 10, fontWeight: 800, cursor: "pointer", border: "none", background: isPaid ? "rgba(16,185,129,0.1)" : "rgba(245,158,11,0.1)", color: isPaid ? "#059669" : "#D97706", letterSpacing: "0.04em" }}>
          {isPaid ? "✓ PAID" : "⏳ UNPAID"}
        </button>
        <div style={{ display: "flex", gap: 5 }}>
          <button onClick={onEdit} title="Edit" style={{ width: 30, height: 30, borderRadius: 9, border: "1.5px solid #EEF0FF", background: "#F8F9FF", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", transition: "all 0.15s" }}
            onMouseEnter={e => { (e.currentTarget as HTMLElement).style.background = "#EEF0FF"; (e.currentTarget as HTMLElement).style.borderColor = "#6366F1" }}
            onMouseLeave={e => { (e.currentTarget as HTMLElement).style.background = "#F8F9FF"; (e.currentTarget as HTMLElement).style.borderColor = "#EEF0FF" }}>
            <Pencil size={12} color="#6366F1" />
          </button>
          <button onClick={onDelete} title="Delete" style={{ width: 30, height: 30, borderRadius: 9, border: "1.5px solid #FEE2E2", background: "#FFF8F8", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", transition: "all 0.15s" }}
            onMouseEnter={e => { (e.currentTarget as HTMLElement).style.background = "#FEE2E2"; (e.currentTarget as HTMLElement).style.borderColor = "#EF4444" }}
            onMouseLeave={e => { (e.currentTarget as HTMLElement).style.background = "#FFF8F8"; (e.currentTarget as HTMLElement).style.borderColor = "#FEE2E2" }}>
            <Trash2 size={12} color="#EF4444" />
          </button>
        </div>
      </div>
    </div>
  )
}

// ── Edit Entry Sheet ──────────────────────────────────────────────────────────

function EditEntrySheet({ entry, activeClients, pastClients, onClose, onSaved }: {
  entry: WorkEntry; activeClients: string[]; pastClients: string[]
  onClose: () => void; onSaved: (updated: WorkEntry) => void
}) {
  const cfg = TEAM_CFG[entry.team]
  const [dateFinished, setDateFinished] = useState(entry.date_finished)
  const [formEntry, setFormEntry] = useState<EntryItem>({
    date_given: entry.date_given ?? entry.date_finished,
    client_name: entry.client_name, title: entry.title,
    amount: entry.amount?.toString() ?? "", drive_link: entry.drive_link ?? "",
    notes: entry.notes ?? "", duration_mins: entry.duration_mins?.toString() ?? "",
    language: entry.language ?? "", task_description: entry.task_description ?? "",
    payment_status: entry.payment_status,
  })
  const [error, setError] = useState("")
  const [isPending, startTransition] = useTransition()

  function handleSave() {
    setError("")
    if (!formEntry.client_name || formEntry.client_name === "__past_mode__") { setError("Client is required"); return }
    if (!formEntry.title.trim()) { setError("Title is required"); return }
    if (!formEntry.amount) { setError("Amount is required"); return }
    startTransition(async () => {
      const result = await updateFreelancerWorkEntry(entry.id, {
        date_finished: dateFinished, date_given: formEntry.date_given || null,
        client_name: formEntry.client_name, title: formEntry.title.trim(),
        amount: parseFloat(formEntry.amount), drive_link: formEntry.drive_link || null,
        notes: formEntry.notes || null,
        duration_mins: formEntry.duration_mins ? parseFloat(formEntry.duration_mins) : null,
        language: formEntry.language || null, task_description: formEntry.task_description || null,
        payment_status: formEntry.payment_status,
      })
      if (!result.success) { setError(result.error ?? "Failed to save"); return }
      onSaved({ ...entry, date_finished: dateFinished, date_given: formEntry.date_given || null, client_name: formEntry.client_name, title: formEntry.title.trim(), amount: parseFloat(formEntry.amount), drive_link: formEntry.drive_link || null, notes: formEntry.notes || null, duration_mins: formEntry.duration_mins ? parseFloat(formEntry.duration_mins) : null, language: formEntry.language || null, task_description: formEntry.task_description || null, payment_status: formEntry.payment_status })
      onClose()
    })
  }

  return (
    <>
      <div className="fixed inset-0 z-40" style={{ background: "rgba(0,0,0,0.5)", backdropFilter: "blur(4px)" }} onClick={onClose} />
      <div className="fixed right-0 top-0 h-full w-full sm:w-[460px] z-50 flex flex-col" style={{ background: "#FFFFFF", borderLeft: "1px solid #E5E7EB", boxShadow: "-8px 0 48px rgba(0,0,0,0.12)" }}>
        <div style={{ background: `linear-gradient(135deg, ${cfg.color}, ${cfg.color}BB)`, padding: "18px 22px", display: "flex", alignItems: "center", justifyContent: "space-between", flexShrink: 0 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <div style={{ width: 38, height: 38, borderRadius: 11, background: "rgba(255,255,255,0.2)", display: "flex", alignItems: "center", justifyContent: "center" }}>
              <span style={{ fontSize: 18 }}>{cfg.emoji}</span>
            </div>
            <div>
              <p style={{ fontSize: 15, fontWeight: 900, color: "#fff", margin: 0 }}>Edit Entry</p>
              <p style={{ fontSize: 11, color: "rgba(255,255,255,0.75)", margin: 0, fontWeight: 600 }}>{cfg.shortLabel}</p>
            </div>
          </div>
          <button onClick={onClose} style={{ width: 32, height: 32, borderRadius: 8, border: "1.5px solid rgba(255,255,255,0.3)", background: "rgba(255,255,255,0.15)", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center" }}>
            <X size={14} color="#fff" />
          </button>
        </div>
        <div className="flex-1 overflow-y-auto" style={{ padding: "20px 22px", display: "flex", flexDirection: "column", gap: 16 }}>
          <div style={{ background: "#F8F9FF", border: "1.5px solid #E0E7FF", borderRadius: 12, padding: "14px 16px" }}>
            <label style={{ ...LABEL, color: "#4F46E5", marginBottom: 8 }}>📅 Date Finished *</label>
            <input type="date" value={dateFinished} onChange={e => setDateFinished(e.target.value)} style={{ ...FIELD, colorScheme: "light", border: "1.5px solid #C7D2FE", background: "#FFFFFF" }} />
          </div>
          <EntryCard team={entry.team} entry={formEntry} idx={0} activeClients={activeClients} pastClients={pastClients}
            onChange={(field, val) => setFormEntry(prev => ({ ...prev, [field]: val }))}
            onRemove={() => {}} canRemove={false} />
          {error && <div style={{ padding: "10px 14px", borderRadius: 10, background: "rgba(239,68,68,0.07)", border: "1px solid rgba(239,68,68,0.2)", fontSize: 12, color: "#DC2626", fontWeight: 600 }}>{error}</div>}
        </div>
        <div style={{ padding: "14px 22px", borderTop: "1px solid #F3F4F6", display: "flex", gap: 10, flexShrink: 0 }}>
          <button onClick={onClose} style={{ flex: 1, padding: "11px", borderRadius: 12, border: "1.5px solid #E5E7EB", background: "#F9FAFB", color: "#6B7280", fontSize: 13, fontWeight: 700, cursor: "pointer" }}>Cancel</button>
          <button onClick={handleSave} disabled={isPending} style={{ flex: 2, padding: "11px", borderRadius: 12, border: "none", background: isPending ? "#9CA3AF" : `linear-gradient(135deg, ${cfg.color}, ${cfg.color}CC)`, color: "#FFFFFF", fontSize: 13, fontWeight: 700, cursor: isPending ? "not-allowed" : "pointer", display: "flex", alignItems: "center", justifyContent: "center", gap: 6, boxShadow: `0 4px 14px ${cfg.color}33` }}>
            {isPending && <Loader2 size={14} className="animate-spin" />}
            {isPending ? "Saving..." : "Save Changes"}
          </button>
        </div>
      </div>
    </>
  )
}

// ── Main Page Client ──────────────────────────────────────────────────────────

export default function FreelancersMemberClient({
  freelancers, workEntries: initialEntries, clientNames, pastClientNames = [],
}: {
  freelancers: Freelancer[]; workEntries: WorkEntry[]; clientNames: string[]; pastClientNames?: string[]
}) {
  const { activeOptions: activeClients, pastOptions: pastClients } = useMemo(
    () => buildClientOptions(clientNames, pastClientNames), [clientNames, pastClientNames]
  )
  const [workEntries, setWorkEntries] = useState(initialEntries)
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [globalMonth, setGlobalMonth] = useState(currentYM())
  const [globalAllTime, setGlobalAllTime] = useState(false)
  const [detailMonth, setDetailMonth] = useState(currentYM())
  const [detailAllTime, setDetailAllTime] = useState(false)
  const [teamFilter, setTeamFilter] = useState<"all" | FreelancerTeam>("all")
  const [addWorkFor, setAddWorkFor] = useState<Freelancer | null>(null)
  const [editEntry, setEditEntry] = useState<WorkEntry | null>(null)
  const [, startTransition] = useTransition()

  const activeFreelancers = useMemo(() => freelancers.filter(f => f.status === "active"), [freelancers])
  const effectiveSelectedId = selectedId ?? activeFreelancers[0]?.id ?? null
  const selectedFreelancer = activeFreelancers.find(f => f.id === effectiveSelectedId) ?? null

  const filteredFreelancers = useMemo(() =>
    teamFilter === "all" ? activeFreelancers : activeFreelancers.filter(f => f.team === teamFilter),
    [activeFreelancers, teamFilter]
  )

  const globalMonthEntries = useMemo(() => globalAllTime ? workEntries : workEntries.filter(e => e.date_finished.startsWith(globalMonth)), [workEntries, globalMonth, globalAllTime])
  const detailEntries = useMemo(() => {
    const base = workEntries.filter(e => e.freelancer_id === effectiveSelectedId)
    return detailAllTime ? base : base.filter(e => e.date_finished.startsWith(detailMonth))
  }, [workEntries, effectiveSelectedId, detailMonth, detailAllTime])

  const entriesByFreelancer = useMemo(() => {
    const map: Record<string, WorkEntry[]> = {}
    for (const e of globalMonthEntries) { if (!map[e.freelancer_id]) map[e.freelancer_id] = []; map[e.freelancer_id].push(e) }
    return map
  }, [globalMonthEntries])

  const globalStats = useMemo(() => ({
    total: activeFreelancers.length,
    totalWorks: globalMonthEntries.length,
    totalCost: globalMonthEntries.reduce((s, e) => s + (e.amount ?? 0), 0),
    paidCost: globalMonthEntries.filter(e => e.payment_status === "paid").reduce((s, e) => s + (e.amount ?? 0), 0),
    unpaidCost: globalMonthEntries.filter(e => e.payment_status === "unpaid").reduce((s, e) => s + (e.amount ?? 0), 0),
  }), [activeFreelancers, globalMonthEntries])

  const detailStats = useMemo(() => {
    const total = detailEntries.reduce((s, e) => s + (e.amount ?? 0), 0)
    const paid = detailEntries.filter(e => e.payment_status === "paid").reduce((s, e) => s + (e.amount ?? 0), 0)
    return { works: detailEntries.length, total, paid, unpaid: total - paid, avg: detailEntries.length > 0 ? Math.round(total / detailEntries.length) : 0 }
  }, [detailEntries])

  const teamCounts = useMemo(() => {
    const c: Partial<Record<FreelancerTeam, number>> = {}
    for (const f of activeFreelancers) c[f.team] = (c[f.team] ?? 0) + 1
    return c
  }, [activeFreelancers])

  const sparkData = useMemo(() => {
    const result: Record<string, number[]> = {}
    for (const f of activeFreelancers) {
      const months: number[] = []
      for (let i = 5; i >= 0; i--) {
        const d = new Date(); d.setMonth(d.getMonth() - i)
        const ym = d.toISOString().slice(0, 7)
        const total = workEntries.filter(e => e.freelancer_id === f.id && e.date_finished.startsWith(ym)).reduce((s, e) => s + (e.amount ?? 0), 0)
        months.push(total)
      }
      result[f.id] = months
    }
    return result
  }, [activeFreelancers, workEntries])

  function handleSaved(newEntries: WorkEntry[]) { setWorkEntries(prev => [...newEntries, ...prev]) }
  function handleEntryUpdated(updated: WorkEntry) { setWorkEntries(prev => prev.map(e => e.id === updated.id ? updated : e)) }

  async function handleTogglePaid(entry: WorkEntry) {
    const newStatus = entry.payment_status === "paid" ? "unpaid" : "paid"
    setWorkEntries(prev => prev.map(e => e.id === entry.id ? { ...e, payment_status: newStatus } : e))
    await toggleFreelancerPaymentStatus(entry.id, newStatus)
  }

  async function handleDelete(entryId: string) {
    if (!confirm("Delete this work entry? This cannot be undone.")) return
    setWorkEntries(prev => prev.filter(e => e.id !== entryId))
    startTransition(async () => { await deleteFreelancerWorkEntry(entryId) })
  }

  if (activeFreelancers.length === 0) {
    return (
      <div style={{ minHeight: "100vh", background: "#F5F6FA", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 16, padding: 32 }}>
        <div style={{ width: 64, height: 64, borderRadius: 20, background: "rgba(222,26,26,0.07)", display: "flex", alignItems: "center", justifyContent: "center" }}><Users size={28} color="#DE1A1A" /></div>
        <p style={{ fontSize: 18, fontWeight: 800, color: "#111827", margin: 0 }}>No freelancers assigned</p>
        <p style={{ fontSize: 13, color: "#6B7280", marginTop: 4 }}>Ask your admin to add freelancers under the no-login teams.</p>
      </div>
    )
  }

  return (
    <div style={{ height: "100vh", display: "flex", flexDirection: "column", background: "#F5F6FA", overflow: "hidden" }}>

      {/* Top header */}
      <div style={{ background: "#FFFFFF", borderBottom: "1px solid #EBEBEB", padding: "12px 20px", flexShrink: 0 }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 16, flexWrap: "wrap" }}>
          <div>
            <h1 style={{ fontSize: 20, fontWeight: 900, color: "#111", margin: 0, fontFamily: "var(--font-jakarta)" }}>Freelancers</h1>
            <p style={{ fontSize: 11, color: "#9CA3AF", margin: "2px 0 0" }}>{activeFreelancers.length} active · {new Date(globalMonth + "-01").toLocaleDateString("en-IN", { month: "long", year: "numeric" })}</p>
          </div>
          <div style={{ display: "flex", background: "#F9FAFB", borderRadius: 14, border: "1px solid #EBEBEB", overflow: "hidden" }}>
            {([
              { label: "Freelancers", value: String(globalStats.total), color: "#6366F1" },
              { label: "Works", value: String(globalStats.totalWorks), color: "#0EA5E9" },
              { label: "Total", value: fmt(globalStats.totalCost), color: "#111" },
              { label: "Paid", value: fmt(globalStats.paidCost), color: "#10B981" },
              { label: "Unpaid", value: fmt(globalStats.unpaidCost), color: "#EF4444" },
            ] as const).map((s, i) => (
              <div key={s.label} style={{ padding: "8px 14px", borderRight: i < 4 ? "1px solid #EBEBEB" : "none", textAlign: "center" }}>
                <p style={{ fontSize: 14, fontWeight: 900, color: s.color, margin: 0, fontFamily: "var(--font-jakarta)" }}>{s.value}</p>
                <p style={{ fontSize: 9, color: "#9CA3AF", fontWeight: 700, margin: "1px 0 0", textTransform: "uppercase", letterSpacing: "0.07em", whiteSpace: "nowrap" }}>{s.label}</p>
              </div>
            ))}
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
            <button onClick={() => setGlobalAllTime(v => !v)} style={{ padding: "4px 12px", borderRadius: 99, fontSize: 11, fontWeight: 700, border: "1px solid #EBEBEB", cursor: "pointer", background: globalAllTime ? "#111" : "#F9FAFB", color: globalAllTime ? "#fff" : "#6B7280", transition: "all 0.15s" }}>All Time</button>
            <div style={{ display: "flex", alignItems: "center", gap: 4, background: "#F9FAFB", border: "1px solid #EBEBEB", borderRadius: 10, padding: "4px 7px", opacity: globalAllTime ? 0.4 : 1, pointerEvents: globalAllTime ? "none" : "auto" }}>
              <button onClick={() => setGlobalMonth(prevMonth(globalMonth))} style={{ width: 26, height: 26, borderRadius: 7, border: "none", background: "transparent", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center" }}><ChevronLeft size={13} color="#6B7280" /></button>
              <span style={{ fontSize: 12, fontWeight: 700, color: "#374151", minWidth: 85, textAlign: "center" }}>{new Date(globalMonth + "-01").toLocaleDateString("en-IN", { month: "short", year: "numeric" })}</span>
              <button onClick={() => setGlobalMonth(nextMonth(globalMonth))} disabled={globalMonth >= currentYM()} style={{ width: 26, height: 26, borderRadius: 7, border: "none", background: "transparent", cursor: globalMonth >= currentYM() ? "not-allowed" : "pointer", display: "flex", alignItems: "center", justifyContent: "center", opacity: globalMonth >= currentYM() ? 0.3 : 1 }}><ChevronRight size={13} color="#6B7280" /></button>
            </div>
          </div>
        </div>
      </div>

      {/* Two-panel body */}
      <div style={{ flex: 1, display: "flex", overflow: "hidden" }}>

        {/* LEFT panel */}
        <div style={{ width: 260, flexShrink: 0, background: "#FFFFFF", borderRight: "1px solid #EBEBEB", display: "flex", flexDirection: "column", overflow: "hidden" }}>
          <div style={{ borderBottom: "1px solid #F5F5F7", padding: "8px 12px", display: "flex", gap: 4, flexWrap: "wrap", flexShrink: 0 }}>
            <button onClick={() => setTeamFilter("all")} style={{ padding: "5px 10px", borderRadius: 99, fontSize: 11, fontWeight: 700, border: "none", cursor: "pointer", background: teamFilter === "all" ? "#111" : "#F5F5F7", color: teamFilter === "all" ? "#fff" : "#6B7280", transition: "all 0.15s" }}>
              All {activeFreelancers.length}
            </button>
            {NO_LOGIN_TEAMS.filter(t => (teamCounts[t] ?? 0) > 0).map(t => {
              const c = TEAM_CFG[t]; const active = teamFilter === t
              return (
                <button key={t} onClick={() => setTeamFilter(t)} title={c.shortLabel} style={{ width: 30, height: 30, borderRadius: 10, border: "none", cursor: "pointer", background: active ? c.color : "#F5F5F7", display: "flex", alignItems: "center", justifyContent: "center", transition: "all 0.15s", boxShadow: active ? `0 3px 10px ${c.color}50` : "none" }}>
                  <span style={{ fontSize: 14 }}>{c.emoji}</span>
                </button>
              )
            })}
          </div>
          <div style={{ flex: 1, overflowY: "auto" }}>
            {filteredFreelancers.map(f => {
              const fEntries = entriesByFreelancer[f.id] ?? []
              const fTotal = fEntries.reduce((s, e) => s + (e.amount ?? 0), 0)
              const fUnpaid = fEntries.filter(e => e.payment_status === "unpaid").reduce((s, e) => s + (e.amount ?? 0), 0)
              return (
                <div key={f.id}>
                  <FreelancerListItem freelancer={f} works={fEntries.length} total={fTotal} unpaid={fUnpaid}
                    isSelected={f.id === effectiveSelectedId} onClick={() => setSelectedId(f.id)} />
                  <div style={{ padding: "0 14px 6px", opacity: 0.45 }}>
                    <Sparkline data={sparkData[f.id] ?? []} color={TEAM_CFG[f.team].color} />
                  </div>
                </div>
              )
            })}
          </div>
        </div>

        {/* RIGHT panel */}
        <div style={{ flex: 1, overflowY: "auto" }}>
          {!selectedFreelancer ? (
            <div style={{ height: "100%", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 12, color: "#9CA3AF" }}>
              <Users size={40} />
              <p style={{ fontSize: 15, fontWeight: 700, margin: 0 }}>Select a freelancer</p>
            </div>
          ) : (() => {
            const cfg = TEAM_CFG[selectedFreelancer.team]
            const joinedDate = selectedFreelancer.created_at
              ? new Date(selectedFreelancer.created_at).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" })
              : null
            return (
              <div>
                {/* HERO BANNER */}
                <div style={{ margin: "16px 16px 0", borderRadius: 24, overflow: "hidden", background: `linear-gradient(135deg, ${cfg.color} 0%, ${cfg.color}CC 55%, ${cfg.color}66 100%)`, boxShadow: `0 8px 32px ${cfg.color}45`, position: "relative", minHeight: 210 }}>
                  <div style={{ position: "absolute", top: -50, right: -50, width: 220, height: 220, borderRadius: "50%", background: "rgba(255,255,255,0.07)", pointerEvents: "none" }} />
                  <div style={{ position: "absolute", bottom: -30, left: 140, width: 150, height: 150, borderRadius: "50%", background: "rgba(255,255,255,0.05)", pointerEvents: "none" }} />
                  <div style={{ position: "absolute", top: 20, left: 220, width: 80, height: 80, borderRadius: "50%", background: "rgba(255,255,255,0.06)", pointerEvents: "none" }} />
                  <div style={{ position: "relative", zIndex: 2, padding: "24px 24px 0" }}>
                    <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 16 }}>
                      <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
                        <div style={{ width: 64, height: 64, borderRadius: 20, background: "rgba(255,255,255,0.25)", border: "2.5px solid rgba(255,255,255,0.4)", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0, boxShadow: "0 4px 20px rgba(0,0,0,0.15)" }}>
                          <span style={{ fontSize: 24, fontWeight: 900, color: "#fff", fontFamily: "var(--font-jakarta)" }}>{getInitials(selectedFreelancer.name)}</span>
                        </div>
                        <div>
                          <span style={{ display: "inline-flex", alignItems: "center", gap: 5, fontSize: 11, fontWeight: 700, padding: "3px 10px", borderRadius: 99, background: "rgba(255,255,255,0.2)", color: "#fff", border: "1px solid rgba(255,255,255,0.3)", marginBottom: 6 }}>
                            {cfg.emoji} {cfg.shortLabel}
                          </span>
                          <h2 style={{ fontSize: 24, fontWeight: 900, color: "#fff", margin: 0, fontFamily: "var(--font-jakarta)", lineHeight: 1.2 }}>{selectedFreelancer.name}</h2>
                          <div style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 4 }}>
                            <div style={{ display: "flex", alignItems: "center", gap: 3 }}>
                              <Star size={12} fill="#FACC15" color="#FACC15" />
                              <span style={{ fontSize: 12, fontWeight: 700, color: "rgba(255,255,255,0.9)" }}>{selectedFreelancer.rating.toFixed(1)}</span>
                            </div>
                            {joinedDate && <span style={{ fontSize: 11, color: "rgba(255,255,255,0.65)" }}>Since {joinedDate}</span>}
                          </div>
                        </div>
                      </div>
                      <button onClick={() => setAddWorkFor(selectedFreelancer)} style={{ padding: "10px 20px", borderRadius: 12, border: "2px solid rgba(255,255,255,0.4)", background: "rgba(255,255,255,0.2)", color: "#fff", fontSize: 13, fontWeight: 800, cursor: "pointer", display: "flex", alignItems: "center", gap: 7, backdropFilter: "blur(10px)", flexShrink: 0, transition: "all 0.15s" }}
                        onMouseEnter={e => (e.currentTarget as HTMLElement).style.background = "rgba(255,255,255,0.3)"}
                        onMouseLeave={e => (e.currentTarget as HTMLElement).style.background = "rgba(255,255,255,0.2)"}>
                        <Plus size={15} /> Add Work Entry
                      </button>
                    </div>
                    {/* KPI glass strip */}
                    <div style={{ display: "flex", gap: 10, marginTop: 22, paddingBottom: 24, flexWrap: "wrap" }}>
                      {[
                        { label: "Works", value: String(detailStats.works) },
                        { label: "Total Cost", value: detailStats.total > 0 ? fmt(detailStats.total) : "—" },
                        { label: "Paid", value: detailStats.paid > 0 ? fmt(detailStats.paid) : "—" },
                        { label: "Unpaid", value: detailStats.unpaid > 0 ? fmt(detailStats.unpaid) : "—" },
                        { label: "Avg / Work", value: detailStats.avg > 0 ? fmt(detailStats.avg) : "—" },
                      ].map(k => (
                        <div key={k.label} style={{ background: "rgba(255,255,255,0.92)", borderRadius: 14, border: "1px solid rgba(255,255,255,0.6)", padding: "10px 16px", minWidth: 90 }}>
                          <p style={{ fontSize: 16, fontWeight: 900, color: cfg.color, margin: 0, fontFamily: "var(--font-jakarta)" }}>{k.value}</p>
                          <p style={{ fontSize: 9, color: "#6B7280", margin: "3px 0 0", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.07em" }}>{k.label}</p>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>

                {/* WORK HISTORY */}
                <div style={{ margin: "14px 16px 0", background: "#FFFFFF", borderRadius: 20, border: "1px solid #F0F0F5", overflow: "hidden", boxShadow: "0 2px 12px rgba(0,0,0,0.04)" }}>
                  <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "16px 20px", borderBottom: "1px solid #F5F5F7" }}>
                    <div>
                      <p style={{ fontSize: 14, fontWeight: 900, color: "#111", margin: 0, fontFamily: "var(--font-jakarta)" }}>Work History</p>
                      <p style={{ fontSize: 11, color: "#9CA3AF", margin: "2px 0 0" }}>{new Date(detailMonth + "-01").toLocaleDateString("en-IN", { month: "long", year: "numeric" })} · {detailEntries.length} {detailEntries.length === 1 ? "entry" : "entries"}</p>
                    </div>
                    <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                      <button onClick={() => setDetailAllTime(v => !v)} style={{ padding: "3px 10px", borderRadius: 99, fontSize: 10, fontWeight: 700, border: "1px solid #EBEBEB", cursor: "pointer", background: detailAllTime ? "#111" : "#F9FAFB", color: detailAllTime ? "#fff" : "#6B7280", transition: "all 0.15s" }}>All Time</button>
                      <div style={{ display: "flex", alignItems: "center", gap: 4, background: "#F9FAFB", border: "1px solid #EBEBEB", borderRadius: 10, padding: "4px 7px", opacity: detailAllTime ? 0.4 : 1, pointerEvents: detailAllTime ? "none" : "auto" }}>
                        <button onClick={() => setDetailMonth(prevMonth(detailMonth))} style={{ width: 24, height: 24, borderRadius: 6, border: "none", background: "transparent", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center" }}><ChevronLeft size={12} color="#6B7280" /></button>
                        <span style={{ fontSize: 11, fontWeight: 700, color: "#374151", minWidth: 80, textAlign: "center" }}>{new Date(detailMonth + "-01").toLocaleDateString("en-IN", { month: "short", year: "numeric" })}</span>
                        <button onClick={() => setDetailMonth(nextMonth(detailMonth))} disabled={detailMonth >= currentYM()} style={{ width: 24, height: 24, borderRadius: 6, border: "none", background: "transparent", cursor: detailMonth >= currentYM() ? "not-allowed" : "pointer", display: "flex", alignItems: "center", justifyContent: "center", opacity: detailMonth >= currentYM() ? 0.3 : 1 }}><ChevronRight size={12} color="#6B7280" /></button>
                      </div>
                    </div>
                  </div>
                  {detailEntries.length === 0 ? (
                    <div style={{ padding: "48px 20px", textAlign: "center" }}>
                      <p style={{ fontSize: 36, margin: "0 0 12px" }}>📋</p>
                      <p style={{ fontSize: 14, fontWeight: 800, color: "#374151", margin: 0 }}>No entries for {new Date(detailMonth + "-01").toLocaleDateString("en-IN", { month: "long" })}</p>
                      <p style={{ fontSize: 12, color: "#9CA3AF", marginTop: 6 }}>Click &quot;Add Work Entry&quot; to log work for {selectedFreelancer.name}.</p>
                    </div>
                  ) : (
                    <div style={{ display: "flex", flexDirection: "column", gap: 10, padding: "14px" }}>
                      {detailEntries.map(e => (
                        <DetailHistoryRow key={e.id} entry={e}
                          onEdit={() => setEditEntry(e)}
                          onDelete={() => handleDelete(e.id)}
                          onTogglePaid={() => handleTogglePaid(e)}
                        />
                      ))}
                    </div>
                  )}
                </div>
                <div style={{ height: 24 }} />
              </div>
            )
          })()}
        </div>
      </div>

      {addWorkFor && (
        <WorkEntrySheet freelancer={addWorkFor} activeClients={activeClients} pastClients={pastClients}
          onClose={() => setAddWorkFor(null)} onSaved={handleSaved} />
      )}
      {editEntry && (
        <EditEntrySheet entry={editEntry} activeClients={activeClients} pastClients={pastClients}
          onClose={() => setEditEntry(null)} onSaved={handleEntryUpdated} />
      )}
    </div>
  )
}
