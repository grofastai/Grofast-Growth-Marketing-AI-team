"use client"

import { useState, useMemo, useTransition } from "react"
import { X, Plus, ChevronDown, ChevronLeft, ChevronRight, Loader2, Star, Link2, FileText, IndianRupee, Users } from "lucide-react"
import { saveFreelancerWorkEntry } from "@/lib/actions/freelancer-work"
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
}

function blankEntry(today: string): EntryItem {
  return { date_given: today, client_name: "", title: "", amount: "", drive_link: "", notes: "", duration_mins: "", language: "", task_description: "" }
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
              <input type="text" value={entry.language} onChange={e => onChange("language", e.target.value)} placeholder="e.g. Tamil" style={FIELD} />
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

// ── Freelancer Card ───────────────────────────────────────────────────────────

function FreelancerCard({ freelancer, monthEntries, onAddWork }: {
  freelancer: Freelancer
  monthEntries: WorkEntry[]
  onAddWork: () => void
}) {
  const cfg = TEAM_CFG[freelancer.team]
  const totalAmount = monthEntries.reduce((s, e) => s + (e.amount ?? 0), 0)
  const paidAmount = monthEntries.filter(e => e.payment_status === "paid").reduce((s, e) => s + (e.amount ?? 0), 0)
  const unpaidAmount = totalAmount - paidAmount

  return (
    <div style={{ background: "#FFFFFF", borderRadius: 18, border: "1.5px solid #F0F0F0", boxShadow: "0 2px 12px rgba(0,0,0,0.04)", overflow: "hidden" }}>
      {/* Top strip */}
      <div style={{ height: 4, background: cfg.color }} />

      <div style={{ padding: "16px 18px" }}>
        {/* Header row */}
        <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 14 }}>
          <div style={{ width: 42, height: 42, borderRadius: 12, background: cfg.bg, border: `1.5px solid ${cfg.border}`, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
            <span style={{ fontSize: 14, fontWeight: 800, color: cfg.color }}>{getInitials(freelancer.name)}</span>
          </div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <p style={{ fontSize: 14, fontWeight: 800, color: "#111", margin: 0, lineHeight: 1.2 }}>{freelancer.name}</p>
            <span style={{ fontSize: 11, color: cfg.color, fontWeight: 600 }}>{cfg.emoji} {cfg.shortLabel}</span>
          </div>
          {/* Rating */}
          <div style={{ display: "flex", alignItems: "center", gap: 3 }}>
            <Star size={12} fill="#F59E0B" color="#F59E0B" />
            <span style={{ fontSize: 12, fontWeight: 700, color: "#111" }}>{freelancer.rating.toFixed(1)}</span>
          </div>
        </div>

        {/* Stats row */}
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 8, marginBottom: 14 }}>
          {[
            { label: "Works", value: monthEntries.length },
            { label: "Total", value: totalAmount > 0 ? fmt(totalAmount) : "—" },
            { label: "Unpaid", value: unpaidAmount > 0 ? fmt(unpaidAmount) : "—", warn: unpaidAmount > 0 },
          ].map(s => (
            <div key={s.label} style={{ background: "#F9FAFB", borderRadius: 10, padding: "8px 10px", textAlign: "center" }}>
              <p style={{ fontSize: 13, fontWeight: 800, color: s.warn ? "#EF4444" : "#111", margin: 0 }}>{s.value}</p>
              <p style={{ fontSize: 9, color: "#9CA3AF", fontWeight: 600, margin: "2px 0 0", textTransform: "uppercase", letterSpacing: "0.08em" }}>{s.label}</p>
            </div>
          ))}
        </div>

        {/* Add Work button */}
        <button onClick={onAddWork}
          style={{ width: "100%", padding: "10px", borderRadius: 11, border: `1.5px solid ${cfg.border}`, background: cfg.bg, color: cfg.color, fontSize: 13, fontWeight: 700, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", gap: 6 }}>
          <Plus size={14} />
          Add Work Entry
        </button>
      </div>
    </div>
  )
}

// ── Work History Row ──────────────────────────────────────────────────────────

function WorkHistoryRow({ entry, freelancerName }: { entry: WorkEntry; freelancerName: string }) {
  const cfg = TEAM_CFG[entry.team]
  const date = new Date(entry.date_finished).toLocaleDateString("en-IN", { day: "numeric", month: "short" })

  return (
    <div style={{ display: "flex", alignItems: "center", gap: 12, padding: "12px 16px", borderBottom: "1px solid #F9FAFB" }}>
      <div style={{ width: 36, height: 36, borderRadius: 10, background: cfg.bg, border: `1px solid ${cfg.border}`, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
        <span style={{ fontSize: 16 }}>{cfg.emoji}</span>
      </div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <p style={{ fontSize: 13, fontWeight: 700, color: "#111", margin: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{entry.title}</p>
        <p style={{ fontSize: 11, color: "#9CA3AF", margin: "2px 0 0" }}>{freelancerName} · {entry.client_name} · {date}</p>
      </div>
      <div style={{ textAlign: "right", flexShrink: 0 }}>
        <p style={{ fontSize: 13, fontWeight: 800, color: "#111", margin: 0 }}>{entry.amount ? fmt(entry.amount) : "—"}</p>
        <span style={{ fontSize: 10, fontWeight: 600, padding: "2px 6px", borderRadius: 6, background: entry.payment_status === "paid" ? "rgba(16,185,129,0.1)" : "rgba(245,158,11,0.1)", color: entry.payment_status === "paid" ? "#10B981" : "#F59E0B" }}>
          {entry.payment_status === "paid" ? "Paid" : "Unpaid"}
        </span>
      </div>
    </div>
  )
}

// ── Main Page Client ──────────────────────────────────────────────────────────

export default function FreelancersMemberClient({
  freelancers,
  workEntries: initialEntries,
  clientNames,
  pastClientNames = [],
}: {
  freelancers: Freelancer[]
  workEntries: WorkEntry[]
  clientNames: string[]
  pastClientNames?: string[]
}) {
  const { activeOptions: activeClients, pastOptions: pastClients } = useMemo(
    () => buildClientOptions(clientNames, pastClientNames),
    [clientNames, pastClientNames]
  )
  const [workEntries, setWorkEntries] = useState(initialEntries)
  const [teamFilter, setTeamFilter] = useState<"all" | FreelancerTeam>("all")
  const [selectedMonth, setSelectedMonth] = useState(currentYM())
  const [addWorkFor, setAddWorkFor] = useState<Freelancer | null>(null)

  const activeFreelancers = useMemo(() =>
    freelancers.filter(f => f.status === "active"),
    [freelancers]
  )

  const filteredFreelancers = useMemo(() =>
    teamFilter === "all" ? activeFreelancers : activeFreelancers.filter(f => f.team === teamFilter),
    [activeFreelancers, teamFilter]
  )

  const monthEntries = useMemo(() =>
    workEntries.filter(e => e.date_finished.startsWith(selectedMonth)),
    [workEntries, selectedMonth]
  )

  const entriesByFreelancer = useMemo(() => {
    const map: Record<string, WorkEntry[]> = {}
    for (const e of monthEntries) {
      if (!map[e.freelancer_id]) map[e.freelancer_id] = []
      map[e.freelancer_id].push(e)
    }
    return map
  }, [monthEntries])

  const stats = useMemo(() => ({
    total: activeFreelancers.length,
    totalWorks: monthEntries.length,
    totalCost: monthEntries.reduce((s, e) => s + (e.amount ?? 0), 0),
    paidCost: monthEntries.filter(e => e.payment_status === "paid").reduce((s, e) => s + (e.amount ?? 0), 0),
    unpaidCost: monthEntries.filter(e => e.payment_status === "unpaid").reduce((s, e) => s + (e.amount ?? 0), 0),
  }), [activeFreelancers, monthEntries])

  const teamCounts = useMemo(() => {
    const counts: Partial<Record<FreelancerTeam, number>> = {}
    for (const f of activeFreelancers) counts[f.team] = (counts[f.team] ?? 0) + 1
    return counts
  }, [activeFreelancers])

  function handleSaved(newEntries: WorkEntry[]) {
    setWorkEntries(prev => [...newEntries, ...prev])
  }

  if (activeFreelancers.length === 0) {
    return (
      <div style={{ minHeight: "100vh", background: "#F5F6FA", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 16, padding: 32 }}>
        <div style={{ width: 64, height: 64, borderRadius: 20, background: "rgba(222,26,26,0.07)", display: "flex", alignItems: "center", justifyContent: "center" }}>
          <Users size={28} color="#DE1A1A" />
        </div>
        <div style={{ textAlign: "center" }}>
          <p style={{ fontSize: 18, fontWeight: 800, color: "#111827", margin: 0 }}>No freelancers assigned</p>
          <p style={{ fontSize: 13, color: "#6B7280", marginTop: 6 }}>Ask your admin to assign freelancers to you.</p>
        </div>
      </div>
    )
  }

  return (
    <div style={{ minHeight: "100vh", background: "#F5F6FA" }}>

      {/* Header */}
      <div style={{ background: "#FFFFFF", borderBottom: "1px solid #F0F0F0", padding: "18px 20px 0" }}>
        <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", marginBottom: 16 }}>
          <div>
            <h1 style={{ fontSize: 22, fontWeight: 900, color: "#111", margin: 0, fontFamily: "var(--font-jakarta)" }}>Freelancers</h1>
            <p style={{ fontSize: 12, color: "#9CA3AF", margin: "3px 0 0" }}>{activeFreelancers.length} assigned · {monthLabel(selectedMonth)}</p>
          </div>
          {/* Month nav */}
          <div style={{ display: "flex", alignItems: "center", gap: 6, background: "#F9FAFB", border: "1px solid #E5E7EB", borderRadius: 10, padding: "6px 8px" }}>
            <button onClick={() => setSelectedMonth(prevMonth(selectedMonth))} style={{ width: 26, height: 26, borderRadius: 7, border: "none", background: "transparent", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center" }}>
              <ChevronLeft size={14} color="#6B7280" />
            </button>
            <span style={{ fontSize: 12, fontWeight: 700, color: "#374151", minWidth: 90, textAlign: "center" }}>
              {new Date(selectedMonth + "-01").toLocaleDateString("en-IN", { month: "short", year: "numeric" })}
            </span>
            <button onClick={() => setSelectedMonth(nextMonth(selectedMonth))} disabled={selectedMonth >= currentYM()}
              style={{ width: 26, height: 26, borderRadius: 7, border: "none", background: "transparent", cursor: selectedMonth >= currentYM() ? "not-allowed" : "pointer", display: "flex", alignItems: "center", justifyContent: "center", opacity: selectedMonth >= currentYM() ? 0.3 : 1 }}>
              <ChevronRight size={14} color="#6B7280" />
            </button>
          </div>
        </div>

        {/* Stats bar */}
        <div style={{ display: "flex", gap: 0, overflowX: "auto", paddingBottom: 0 }}>
          {[
            { label: "Freelancers", value: stats.total, color: "#6366F1" },
            { label: "Works This Month", value: stats.totalWorks, color: "#0EA5E9" },
            { label: "Total Cost", value: fmt(stats.totalCost), color: "#111" },
            { label: "Paid", value: fmt(stats.paidCost), color: "#10B981" },
            { label: "Unpaid", value: fmt(stats.unpaidCost), color: "#EF4444" },
          ].map((s, i) => (
            <div key={s.label} style={{ flex: "0 0 auto", padding: "12px 16px", borderRight: i < 4 ? "1px solid #F3F4F6" : "none" }}>
              <p style={{ fontSize: 16, fontWeight: 900, color: s.color, margin: 0 }}>{s.value}</p>
              <p style={{ fontSize: 9, color: "#9CA3AF", fontWeight: 600, margin: "2px 0 0", textTransform: "uppercase", letterSpacing: "0.08em", whiteSpace: "nowrap" }}>{s.label}</p>
            </div>
          ))}
        </div>

        {/* Team filter tabs */}
        <div style={{ display: "flex", gap: 0, overflowX: "auto", marginTop: 2 }}>
          <button onClick={() => setTeamFilter("all")}
            style={{ flexShrink: 0, padding: "10px 14px", fontSize: 12, fontWeight: 700, border: "none", background: "transparent", borderBottom: teamFilter === "all" ? "2.5px solid #DE1A1A" : "2.5px solid transparent", color: teamFilter === "all" ? "#DE1A1A" : "#6B7280", cursor: "pointer" }}>
            All ({activeFreelancers.length})
          </button>
          {NO_LOGIN_TEAMS.filter(t => (teamCounts[t] ?? 0) > 0).map(t => {
            const cfg = TEAM_CFG[t]
            const isActive = teamFilter === t
            return (
              <button key={t} onClick={() => setTeamFilter(t)}
                style={{ flexShrink: 0, padding: "10px 14px", fontSize: 12, fontWeight: 700, border: "none", background: "transparent", borderBottom: isActive ? `2.5px solid ${cfg.color}` : "2.5px solid transparent", color: isActive ? cfg.color : "#6B7280", cursor: "pointer", whiteSpace: "nowrap" }}>
                {cfg.emoji} {cfg.shortLabel} ({teamCounts[t] ?? 0})
              </button>
            )
          })}
        </div>
      </div>

      {/* Content */}
      <div style={{ padding: "20px 16px" }}>

        {/* Freelancer cards grid */}
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(280px, 1fr))", gap: 14, marginBottom: 24 }}>
          {filteredFreelancers.map(f => (
            <FreelancerCard
              key={f.id}
              freelancer={f}
              monthEntries={entriesByFreelancer[f.id] ?? []}
              onAddWork={() => setAddWorkFor(f)}
            />
          ))}
        </div>

        {/* Monthly Work History */}
        {monthEntries.length > 0 && (
          <div style={{ background: "#FFFFFF", borderRadius: 18, border: "1.5px solid #F0F0F0", overflow: "hidden" }}>
            <div style={{ padding: "14px 18px", borderBottom: "1px solid #F3F4F6", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
              <div>
                <p style={{ fontSize: 14, fontWeight: 800, color: "#111", margin: 0 }}>Work History</p>
                <p style={{ fontSize: 11, color: "#9CA3AF", margin: "2px 0 0" }}>{monthLabel(selectedMonth)} · {monthEntries.length} entries</p>
              </div>
              <span style={{ fontSize: 14, fontWeight: 800, color: "#111" }}>{fmt(stats.totalCost)}</span>
            </div>
            {monthEntries.map(e => {
              const fl = freelancers.find(f => f.id === e.freelancer_id)
              return (
                <WorkHistoryRow key={e.id} entry={e} freelancerName={fl?.name ?? "—"} />
              )
            })}
          </div>
        )}

        {/* Empty state for month */}
        {monthEntries.length === 0 && (
          <div style={{ background: "#FFFFFF", borderRadius: 18, border: "1.5px solid #F0F0F0", padding: "40px 24px", textAlign: "center" }}>
            <div style={{ fontSize: 36, marginBottom: 12 }}>📋</div>
            <p style={{ fontSize: 15, fontWeight: 700, color: "#374151", margin: 0 }}>No work entries for {monthLabel(selectedMonth)}</p>
            <p style={{ fontSize: 12, color: "#9CA3AF", marginTop: 6 }}>Click "Add Work Entry" on any freelancer card to add their work.</p>
          </div>
        )}
      </div>

      {/* Work Entry Sheet */}
      {addWorkFor && (
        <WorkEntrySheet
          freelancer={addWorkFor}
          activeClients={activeClients}
          pastClients={pastClients}
          onClose={() => setAddWorkFor(null)}
          onSaved={handleSaved}
        />
      )}
    </div>
  )
}
