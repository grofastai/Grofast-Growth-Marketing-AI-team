"use client"

import { useState, useMemo, useTransition } from "react"
import { IndianRupee, Loader2, CheckCircle2, ChevronLeft, ChevronRight } from "lucide-react"
import { updateWorkEntryPrice } from "@/lib/actions/daily-updates"

export type FlMediaMember = {
  id: string
  name: string
  employee_id: string
}

export type FlMediaEntry = {
  daily_update_id: string
  entry_id: string
  user_id: string
  user_name: string
  date: string
  task_type: "edit" | "shoot"
  client_name: string
  title: string
  video_type?: string
  video_duration?: string
  duration_hours?: number
  hooks_completed?: number
  start_time?: string
  end_time?: string
  price?: number | null
}

function fmt(n: number) {
  return `₹${n.toLocaleString("en-IN", { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`
}

function fmtH(h: number) {
  const hrs = Math.floor(h)
  const mins = Math.round((h - hrs) * 60)
  if (hrs === 0 && mins === 0) return "—"
  if (hrs === 0) return `${mins}m`
  if (mins === 0) return `${hrs}h`
  return `${hrs}h ${mins}m`
}

function monthLabel(ym: string) {
  const [y, m] = ym.split("-").map(Number)
  return new Date(y, m - 1, 1).toLocaleDateString("en-IN", { month: "long", year: "numeric" })
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
function currentYM() {
  return new Date(Date.now() + 5.5 * 3600000).toISOString().slice(0, 7)
}
function getInitials(name: string) {
  return name.split(" ").map(n => n[0]).join("").slice(0, 2).toUpperCase()
}

// ── Main component ─────────────────────────────────────────────────────────────

export default function FlMediaClient({
  members,
  entries,
}: {
  members: FlMediaMember[]
  entries: FlMediaEntry[]
}) {
  const [selectedMemberId, setSelectedMemberId] = useState<string | null>(
    members.length === 1 ? members[0].id : null
  )
  const [selectedMonth, setSelectedMonth] = useState(currentYM())
  const [prices, setPrices] = useState<Record<string, string>>({})
  const [saved, setSaved] = useState<Set<string>>(new Set())
  const [isPending, startTransition] = useTransition()
  const [saving, setSaving] = useState<Set<string>>(new Set())

  const filteredEntries = useMemo(() => {
    return entries.filter(e => {
      const matchMember = !selectedMemberId || e.user_id === selectedMemberId
      const matchMonth = e.date.startsWith(selectedMonth)
      return matchMember && matchMonth
    })
  }, [entries, selectedMemberId, selectedMonth])

  // Totals per member for left panel
  const memberTotals = useMemo(() => {
    const map: Record<string, number> = {}
    for (const e of entries) {
      if (e.price != null) map[e.user_id] = (map[e.user_id] ?? 0) + e.price
    }
    return map
  }, [entries])

  const monthTotal = useMemo(() =>
    filteredEntries.reduce((s, e) => {
      const p = prices[e.entry_id] !== undefined ? Number(prices[e.entry_id]) : (e.price ?? 0)
      return s + (isNaN(p) ? 0 : p)
    }, 0),
    [filteredEntries, prices]
  )

  function entryKey(e: FlMediaEntry) { return e.entry_id }

  async function handleSavePrice(entry: FlMediaEntry) {
    const raw = prices[entry.entry_id]
    if (raw === undefined) return
    const val = raw.trim() === "" ? null : Number(raw)
    if (val !== null && isNaN(val)) return

    const key = entry.entry_id
    setSaving(p => new Set(p).add(key))
    startTransition(async () => {
      const res = await updateWorkEntryPrice(entry.daily_update_id, entry.entry_id, val)
      setSaving(p => { const n = new Set(p); n.delete(key); return n })
      if (res.success) {
        setSaved(p => new Set(p).add(key))
        setTimeout(() => setSaved(p => { const n = new Set(p); n.delete(key); return n }), 2000)
      }
    })
  }

  const allMonths = useMemo(() => {
    const seen = new Set<string>()
    for (const e of entries) seen.add(e.date.slice(0, 7))
    return Array.from(seen).sort().reverse()
  }, [entries])

  return (
    <div style={{ display: "flex", gap: 0, height: "100%", minHeight: "calc(100vh - 80px)" }}>
      {/* ── Left panel ──────────────────────────────────────────────────────── */}
      <div style={{ width: 220, flexShrink: 0, borderRight: "1px solid #F0F1F5", background: "#FAFAFA", padding: "16px 0", overflowY: "auto" }}>
        <p style={{ fontSize: 10, fontWeight: 700, color: "#9CA3AF", textTransform: "uppercase", letterSpacing: "0.08em", padding: "0 16px 8px" }}>Members</p>
        {members.map(m => {
          const active = selectedMemberId === m.id
          const total = memberTotals[m.id] ?? 0
          return (
            <button
              key={m.id}
              onClick={() => setSelectedMemberId(active ? null : m.id)}
              style={{ width: "100%", display: "flex", alignItems: "center", gap: 10, padding: "10px 16px", background: active ? "rgba(220,40,40,0.07)" : "transparent", border: "none", borderLeft: `3px solid ${active ? "#DE1A1A" : "transparent"}`, cursor: "pointer", textAlign: "left" }}
            >
              <div style={{ width: 34, height: 34, borderRadius: "50%", background: active ? "#DE1A1A" : "#6366F1", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 11, fontWeight: 900, color: "#fff", flexShrink: 0 }}>{getInitials(m.name)}</div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <p style={{ fontSize: 12, fontWeight: 700, color: "#111", margin: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{m.name}</p>
                {total > 0 && <p style={{ fontSize: 10, color: "#22C55E", fontWeight: 700, margin: 0 }}>{fmt(total)}</p>}
              </div>
            </button>
          )
        })}
        {members.length === 0 && (
          <p style={{ fontSize: 12, color: "#9CA3AF", padding: "0 16px" }}>No members yet</p>
        )}
      </div>

      {/* ── Right panel ─────────────────────────────────────────────────────── */}
      <div style={{ flex: 1, overflow: "hidden", display: "flex", flexDirection: "column" }}>
        {/* Header */}
        <div style={{ padding: "16px 20px 12px", borderBottom: "1px solid #F0F1F5", display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: 10 }}>
          <div>
            <p style={{ fontSize: 14, fontWeight: 800, color: "#111", margin: 0 }}>
              {selectedMemberId ? members.find(m => m.id === selectedMemberId)?.name : "All Members"}
            </p>
            <p style={{ fontSize: 11, color: "#6B7280", margin: 0 }}>
              {filteredEntries.length} entries · Total: <strong style={{ color: "#22C55E" }}>{fmt(monthTotal)}</strong>
            </p>
          </div>
          {/* Month nav */}
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <button onClick={() => setSelectedMonth(prevMonth(selectedMonth))} disabled={!allMonths.includes(prevMonth(selectedMonth))} style={{ padding: "5px 8px", borderRadius: 6, border: "1px solid #E5E7EB", background: "#fff", cursor: "pointer", opacity: allMonths.includes(prevMonth(selectedMonth)) ? 1 : 0.3 }}><ChevronLeft size={13} /></button>
            <span style={{ fontSize: 12, fontWeight: 700, color: "#374151", minWidth: 100, textAlign: "center" }}>{monthLabel(selectedMonth)}</span>
            <button onClick={() => setSelectedMonth(nextMonth(selectedMonth))} disabled={!allMonths.includes(nextMonth(selectedMonth))} style={{ padding: "5px 8px", borderRadius: 6, border: "1px solid #E5E7EB", background: "#fff", cursor: "pointer", opacity: allMonths.includes(nextMonth(selectedMonth)) ? 1 : 0.3 }}><ChevronRight size={13} /></button>
          </div>
        </div>

        {/* Table */}
        <div style={{ flex: 1, overflowY: "auto" }}>
          {filteredEntries.length === 0 ? (
            <div style={{ padding: 40, textAlign: "center", color: "#9CA3AF", fontSize: 13 }}>No entries for this period</div>
          ) : (
            <table style={{ width: "100%", borderCollapse: "collapse" }}>
              <thead>
                <tr style={{ background: "#F9FAFB", borderBottom: "1px solid #F0F1F5" }}>
                  {!selectedMemberId && <th style={TH}>Member</th>}
                  <th style={TH}>Date</th>
                  <th style={TH}>Client</th>
                  <th style={TH}>Video Name</th>
                  <th style={TH}>Type</th>
                  <th style={TH}>Duration</th>
                  <th style={TH}>Hours</th>
                  <th style={TH}>Hooks</th>
                  <th style={{ ...TH, color: "#22C55E" }}>Price ₹</th>
                  <th style={TH}></th>
                </tr>
              </thead>
              <tbody>
                {filteredEntries.map(e => {
                  const key = entryKey(e)
                  const isSaving = saving.has(key)
                  const isSaved = saved.has(key)
                  const priceVal = prices[key] !== undefined ? prices[key] : (e.price != null ? String(e.price) : "")
                  return (
                    <tr key={key} style={{ borderBottom: "1px solid #F9FAFB" }}>
                      {!selectedMemberId && (
                        <td style={TD}>
                          <span style={{ fontSize: 11, fontWeight: 700, color: "#374151" }}>{e.user_name.split(" ")[0]}</span>
                        </td>
                      )}
                      <td style={TD}>
                        <span style={{ fontSize: 11, color: "#6B7280" }}>{new Date(e.date + "T12:00:00").toLocaleDateString("en-IN", { day: "numeric", month: "short" })}</span>
                        <div style={{ fontSize: 9, color: "#9CA3AF", textTransform: "uppercase", marginTop: 1 }}>{e.task_type}</div>
                      </td>
                      <td style={TD}><span style={{ fontSize: 11, color: "#374151" }}>{e.client_name || "—"}</span></td>
                      <td style={{ ...TD, maxWidth: 150 }}><span style={{ fontSize: 11, color: "#111", fontWeight: 600, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", display: "block" }}>{e.title || "—"}</span></td>
                      <td style={TD}><span style={{ fontSize: 10, color: "#6366F1", background: "rgba(99,102,241,0.08)", padding: "2px 6px", borderRadius: 4, fontWeight: 600 }}>{e.video_type || "—"}</span></td>
                      <td style={TD}><span style={{ fontSize: 11, color: "#6B7280" }}>{e.video_duration || "—"}</span></td>
                      <td style={TD}><span style={{ fontSize: 11, color: "#374151", fontWeight: 600 }}>{e.duration_hours ? fmtH(e.duration_hours) : "—"}</span></td>
                      <td style={TD}><span style={{ fontSize: 11, color: "#374151" }}>{e.hooks_completed ?? "—"}</span></td>
                      <td style={TD}>
                        <input
                          type="number"
                          min="0"
                          placeholder="0"
                          value={priceVal}
                          onChange={ev => setPrices(p => ({ ...p, [key]: ev.target.value }))}
                          onKeyDown={ev => ev.key === "Enter" && handleSavePrice(e)}
                          style={{ width: 80, padding: "4px 8px", borderRadius: 6, border: "1.5px solid #D1FAE5", fontSize: 12, fontWeight: 700, color: "#065F46", background: "#F0FDF4", outline: "none" }}
                        />
                      </td>
                      <td style={TD}>
                        {isSaved ? (
                          <CheckCircle2 size={14} style={{ color: "#22C55E" }} />
                        ) : (
                          <button
                            onClick={() => handleSavePrice(e)}
                            disabled={isSaving || prices[key] === undefined}
                            style={{ padding: "4px 10px", borderRadius: 6, border: "none", background: prices[key] !== undefined ? "#22C55E" : "#E5E7EB", color: prices[key] !== undefined ? "#fff" : "#9CA3AF", fontSize: 10, fontWeight: 700, cursor: prices[key] !== undefined ? "pointer" : "default" }}
                          >
                            {isSaving ? <Loader2 size={10} className="animate-spin" /> : "Save"}
                          </button>
                        )}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          )}
        </div>
      </div>
    </div>
  )
}

const TH: React.CSSProperties = {
  padding: "8px 12px",
  fontSize: 10,
  fontWeight: 700,
  color: "#6B7280",
  textAlign: "left",
  textTransform: "uppercase",
  letterSpacing: "0.07em",
  whiteSpace: "nowrap",
}
const TD: React.CSSProperties = {
  padding: "10px 12px",
  verticalAlign: "middle",
}
