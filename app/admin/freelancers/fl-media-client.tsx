"use client"

import { useState, useMemo, useTransition } from "react"
import { Loader2, CheckCircle2, ChevronLeft, ChevronRight } from "lucide-react"
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
  if (hrs === 0 && mins === 0) return ""
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

// Same shoot/edit colors used in Admin > Activities, so the two views read consistently
const TASK_TYPE_CFG: Record<string, { label: string; color: string; bg: string; emoji: string }> = {
  shoot: { label: "Shoot", color: "#0EA5E9", bg: "rgba(14,165,233,0.1)", emoji: "📹" },
  edit:  { label: "Edit",  color: "#6366F1", bg: "rgba(99,102,241,0.1)", emoji: "🎬" },
}

// ── Main component ─────────────────────────────────────────────────────────────

export default function FlMediaClient({
  members,
  entries,
  hideLeftPanel = false,
  forceMemberId,
}: {
  members: FlMediaMember[]
  entries: FlMediaEntry[]
  hideLeftPanel?: boolean
  forceMemberId?: string
}) {
  const [selectedMemberId, setSelectedMemberId] = useState<string | null>(
    forceMemberId ?? (members.length === 1 ? members[0].id : null)
  )
  const [selectedMonth, setSelectedMonth] = useState(currentYM())
  const [prices, setPrices] = useState<Record<string, string>>({})
  const [saved, setSaved] = useState<Set<string>>(new Set())
  const [, startTransition] = useTransition()
  const [saving, setSaving] = useState<Set<string>>(new Set())

  const filteredEntries = useMemo(() => {
    return entries.filter(e => {
      const matchMember = !selectedMemberId || e.user_id === selectedMemberId
      const matchMonth = e.date.startsWith(selectedMonth)
      return matchMember && matchMonth
    })
  }, [entries, selectedMemberId, selectedMonth])

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

  const allMonths = useMemo(() => {
    const seen = new Set<string>()
    for (const e of entries) seen.add(e.date.slice(0, 7))
    return Array.from(seen).sort().reverse()
  }, [entries])

  // Nav range spans every month from the earliest entry to today, not just months
  // that happen to have data — otherwise one empty gap month (e.g. no one logged
  // anything in June) permanently blocks stepping back to real data in May.
  const monthNavRange = useMemo(() => {
    const today = currentYM()
    if (allMonths.length === 0) return { min: today, max: today }
    const sorted = [...allMonths].sort()
    return { min: sorted[0], max: sorted[sorted.length - 1] > today ? sorted[sorted.length - 1] : today }
  }, [allMonths])
  const canGoPrev = selectedMonth > monthNavRange.min
  const canGoNext = selectedMonth < monthNavRange.max

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

  const selectedMember = members.find(m => m.id === selectedMemberId)

  return (
    <div style={{ display: "flex", gap: 0, flex: 1, minHeight: 0 }}>

      {/* ── Left panel ──────────────────────────────────────────────────────── */}
      {!hideLeftPanel && (
        <div style={{ width: 220, flexShrink: 0, borderRight: "1px solid #F0F1F5", background: "#FAFAFA", padding: "16px 0", overflowY: "auto" }}>
          <p style={{ fontSize: 10, fontWeight: 700, color: "#0F4C4C", textTransform: "uppercase", letterSpacing: "0.08em", padding: "0 16px 8px" }}>Members</p>
          {members.map(m => {
            const active = selectedMemberId === m.id
            const total = memberTotals[m.id] ?? 0
            return (
              <button key={m.id} onClick={() => setSelectedMemberId(active ? null : m.id)}
                style={{ width: "100%", display: "flex", alignItems: "center", gap: 10, padding: "10px 16px", background: active ? "rgba(220,20,60,0.07)" : "transparent", border: "none", borderLeft: `3px solid ${active ? "#DC143C" : "transparent"}`, cursor: "pointer", textAlign: "left" }}>
                <div style={{ width: 34, height: 34, borderRadius: "50%", background: active ? "#DC143C" : "#6366F1", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 11, fontWeight: 900, color: "#fff", flexShrink: 0 }}>{getInitials(m.name)}</div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <p style={{ fontSize: 12, fontWeight: 700, color: "#111", margin: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{m.name}</p>
                  {total > 0 && <p style={{ fontSize: 10, color: "#22C55E", fontWeight: 700, margin: 0 }}>{fmt(total)}</p>}
                </div>
              </button>
            )
          })}
          {members.length === 0 && <p style={{ fontSize: 12, color: "#0F4C4C", padding: "0 16px" }}>No members yet</p>}
        </div>
      )}

      {/* ── Right panel ─────────────────────────────────────────────────────── */}
      <div style={{ flex: 1, minHeight: 0, overflow: "hidden", display: "flex", flexDirection: "column" }}>

        {/* Hero banner — matches the member-facing freelancer team banners' layout
            (avatar badge, name, tagline, glass KPI strip, big right-anchored character).
            Background + character live in their own inset/overflow:hidden layer, separate
            from the text/month-nav layer below. The character is sized by width (not
            height:100%) because this source image is landscape (1536x1024, 1.5:1) — at any
            height tall enough to look prominent it becomes very wide. The month-nav pill on
            desktop is pinned to the true top-right corner (absolute, not part of the text
            row's flow), and the character's max height is kept short enough to stay clear of
            that corner vertically — that guarantees no collision regardless of how wide the
            landscape character gets, instead of trying to out-guess its horizontal footprint. */}
        <div className="sm:min-h-[210px] sm:max-h-[320px]" style={{ position: "relative", overflow: "visible", flexShrink: 0, borderRadius: 0, boxShadow: "0 4px 24px rgba(176,18,48,0.3)" }}>
          <div style={{ position: "absolute", inset: 0, overflow: "hidden", background: "linear-gradient(135deg, #7F0000 0%, #B01230 50%, #DC143C 100%)", zIndex: 0 }}>
            {/* Decorative circles */}
            <div style={{ position: "absolute", top: -40, right: -40, width: 160, height: 160, borderRadius: "50%", background: "rgba(255,255,255,0.06)" }} />
            <div style={{ position: "absolute", bottom: -30, left: 120, width: 100, height: 100, borderRadius: "50%", background: "rgba(255,255,255,0.04)" }} />
            {/* Character (desktop) — centered horizontally in the banner; still capped short enough vertically that it stays clear of the top-right month-nav pill regardless of its centered position */}
            <img src="/brand/freelancer-media-production-character.png" alt="" aria-hidden="true"
              className="hidden sm:block"
              style={{ position: "absolute", bottom: 0, left: "50%", transform: "translateX(-50%)", width: "clamp(110px,18vw,180px)", height: "auto", objectFit: "contain", pointerEvents: "none", filter: "drop-shadow(0 8px 32px rgba(220,20,60,0.5))" }} />
            {/* Character (mobile) — grounded, shifted right for breathing room from the text */}
            <img src="/brand/freelancer-media-production-character.png" alt="" aria-hidden="true"
              className="block sm:hidden"
              style={{ position: "absolute", bottom: 50, right: 10, width: "clamp(140px,34vw,220px)", height: "auto", objectFit: "contain", pointerEvents: "none", filter: "drop-shadow(0 8px 24px rgba(220,20,60,0.5))" }} />
          </div>
          {/* Month nav — desktop: pinned to the true top-right corner, above the character (which stays vertically clear of this corner by design) */}
          <div className="hidden sm:flex" style={{ position: "absolute", top: 20, right: 20, zIndex: 3, alignItems: "center", gap: 6, background: "rgba(255,255,255,0.2)", borderRadius: 12, padding: "7px 10px", border: "2px solid rgba(255,255,255,0.4)", backdropFilter: "blur(10px)" }}>
            <button onClick={() => setSelectedMonth(prevMonth(selectedMonth))} disabled={!canGoPrev}
              style={{ width: 26, height: 26, borderRadius: 7, border: "none", background: "transparent", cursor: canGoPrev ? "pointer" : "default", display: "flex", alignItems: "center", justifyContent: "center", opacity: canGoPrev ? 1 : 0.3 }}>
              <ChevronLeft size={13} color="#fff" />
            </button>
            <span style={{ fontSize: 12, fontWeight: 800, color: "#fff", minWidth: 96, textAlign: "center", letterSpacing: "0.01em" }}>{monthLabel(selectedMonth)}</span>
            <button onClick={() => setSelectedMonth(nextMonth(selectedMonth))} disabled={!canGoNext}
              style={{ width: 26, height: 26, borderRadius: 7, border: "none", background: "transparent", cursor: canGoNext ? "pointer" : "default", display: "flex", alignItems: "center", justifyContent: "center", opacity: canGoNext ? 1 : 0.3 }}>
              <ChevronRight size={13} color="#fff" />
            </button>
          </div>
          <div style={{ position: "relative", zIndex: 2, padding: "20px 20px 0" }}>
            {/* Desktop layout — capped to the left ~40% so a long member name can't stretch into the now-centered character's space */}
            <div className="hidden sm:flex sm:items-center sm:gap-3 sm:max-w-[40%]">
                <div style={{ width: 52, height: 52, borderRadius: 16, background: "rgba(255,255,255,0.2)", border: "2px solid rgba(255,255,255,0.4)", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0, boxShadow: "0 4px 20px rgba(0,0,0,0.15)" }}>
                  <span style={{ fontSize: 18, fontWeight: 900, color: "#fff", fontFamily: "var(--font-jakarta)" }}>{selectedMember ? getInitials(selectedMember.name) : "👥"}</span>
                </div>
                <div>
                  <span style={{ display: "inline-flex", alignItems: "center", gap: 5, fontSize: 11, fontWeight: 700, padding: "3px 10px", borderRadius: 99, background: "rgba(255,255,255,0.2)", color: "#fff", border: "1px solid rgba(255,255,255,0.3)", marginBottom: 6 }}>
                    🎬 {selectedMember ? "Media Production · Login" : "Media Production"}
                  </span>
                  <h2 style={{ fontSize: "clamp(18px,3vw,22px)", fontWeight: 900, color: "#fff", margin: 0, fontFamily: "var(--font-jakarta)", lineHeight: 1.2 }}>{selectedMember?.name ?? "All Members"}</h2>
                  <p style={{ fontSize: 13, fontWeight: 800, color: "#fff", margin: "8px 0 0", letterSpacing: "-0.01em" }}>🎥 Bringing Every Shoot to Life</p>
                </div>
            </div>
            {/* Mobile layout — no avatar (the character carries identity); month nav flows under the heading instead of sitting top-right */}
            <div className="flex sm:hidden flex-col" style={{ maxWidth: "55%" }}>
              <span style={{ display: "inline-flex", alignItems: "center", gap: 5, fontSize: 11, fontWeight: 700, padding: "3px 10px", borderRadius: 99, background: "rgba(255,255,255,0.2)", color: "#fff", border: "1px solid rgba(255,255,255,0.3)", alignSelf: "flex-start" }}>
                🎬 {selectedMember ? "Media Production · Login" : "Media Production"}
              </span>
              <h2 style={{ fontSize: "clamp(18px,4vw,22px)", fontWeight: 900, color: "#fff", margin: "10px 0 0", fontFamily: "var(--font-jakarta)", lineHeight: 1.2 }}>{selectedMember?.name ?? "All Members"}</h2>
              <p style={{ fontSize: 12, fontWeight: 800, color: "#fff", margin: "10px 0 0", letterSpacing: "-0.01em" }}>🎥 Bringing Every Shoot to Life</p>
              <div style={{ display: "flex", alignItems: "center", gap: 6, background: "rgba(255,255,255,0.2)", borderRadius: 12, padding: "6px 8px", border: "2px solid rgba(255,255,255,0.4)", backdropFilter: "blur(10px)", marginTop: 14, alignSelf: "flex-start" }}>
                <button onClick={() => setSelectedMonth(prevMonth(selectedMonth))} disabled={!canGoPrev}
                  style={{ width: 22, height: 22, borderRadius: 6, border: "none", background: "transparent", cursor: canGoPrev ? "pointer" : "default", display: "flex", alignItems: "center", justifyContent: "center", opacity: canGoPrev ? 1 : 0.3 }}>
                  <ChevronLeft size={12} color="#fff" />
                </button>
                <span style={{ fontSize: 11, fontWeight: 800, color: "#fff", minWidth: 80, textAlign: "center", letterSpacing: "0.01em" }}>{monthLabel(selectedMonth)}</span>
                <button onClick={() => setSelectedMonth(nextMonth(selectedMonth))} disabled={!canGoNext}
                  style={{ width: 22, height: 22, borderRadius: 6, border: "none", background: "transparent", cursor: canGoNext ? "pointer" : "default", display: "flex", alignItems: "center", justifyContent: "center", opacity: canGoNext ? 1 : 0.3 }}>
                  <ChevronRight size={12} color="#fff" />
                </button>
              </div>
            </div>
            {/* KPI glass strip */}
            <div style={{ display: "flex", gap: 10, marginTop: 18, paddingBottom: 18, overflowX: "auto" }}>
              {[
                { label: "Entries", value: String(filteredEntries.length) },
                { label: "Total", value: monthTotal > 0 ? fmt(monthTotal) : "—" },
              ].map(k => (
                <div key={k.label} style={{ background: "rgba(255,255,255,0.92)", borderRadius: 14, border: "1px solid rgba(255,255,255,0.6)", padding: "10px 16px", minWidth: 90, flexShrink: 0 }}>
                  <p style={{ fontSize: 16, fontWeight: 900, color: "#DC143C", margin: 0, fontFamily: "var(--font-jakarta)" }}>{k.value}</p>
                  <p style={{ fontSize: 9, color: "#6B7280", margin: "3px 0 0", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.07em" }}>{k.label}</p>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Entry cards */}
        <div style={{ flex: 1, minHeight: 0, overflowY: "auto", padding: "14px 16px", display: "flex", flexDirection: "column", gap: 8 }}>
          {filteredEntries.length === 0 ? (
            <div style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", height: "100%", color: "#0F4C4C", gap: 8 }}>
              <span style={{ fontSize: 32, opacity: 0.3 }}>📋</span>
              <p style={{ fontSize: 13, fontWeight: 600, margin: 0 }}>No entries for {monthLabel(selectedMonth)}</p>
            </div>
          ) : (
            filteredEntries.map(e => {
              const key = e.entry_id
              const isSaving = saving.has(key)
              const isSaved = saved.has(key)
              const priceVal = prices[key] !== undefined ? prices[key] : (e.price != null ? String(e.price) : "")
              const hasPendingChange = prices[key] !== undefined
              const hasPrice = e.price != null && e.price > 0

              const dateObj = new Date(e.date + "T12:00:00")
              const day = dateObj.getDate()
              const mon = dateObj.toLocaleDateString("en-IN", { month: "short" })

              const typeCfg = TASK_TYPE_CFG[e.task_type]

              return (
                <div key={key}
                  style={{ background: "#fff", borderRadius: 16, border: "1px solid #F5E6E8", borderLeft: `4px solid ${typeCfg?.color ?? "#DC143C"}`, boxShadow: "0 2px 16px rgba(220,20,60,0.06), 0 1px 4px rgba(0,0,0,0.04)", padding: "14px 18px", display: "flex", alignItems: "center", gap: 14, transition: "box-shadow 0.15s" }}
                  onMouseEnter={ev => (ev.currentTarget as HTMLElement).style.boxShadow = "0 6px 28px rgba(220,20,60,0.12), 0 2px 8px rgba(0,0,0,0.06)"}
                  onMouseLeave={ev => (ev.currentTarget as HTMLElement).style.boxShadow = "0 2px 16px rgba(220,20,60,0.06), 0 1px 4px rgba(0,0,0,0.04)"}>

                  {/* Date badge */}
                  <div style={{ textAlign: "center", minWidth: 40, flexShrink: 0 }}>
                    <div style={{ fontSize: 22, fontWeight: 900, color: "#DC143C", lineHeight: 1 }}>{day}</div>
                    <div style={{ fontSize: 9, fontWeight: 800, color: "#DC143C", textTransform: "uppercase", letterSpacing: "0.08em", opacity: 0.75, marginTop: 1 }}>{mon}</div>
                  </div>

                  <div style={{ width: 1, height: 44, background: "#FCE8EC", flexShrink: 0 }} />

                  {/* Content — all on one line */}
                  <div style={{ flex: 1, minWidth: 0, display: "flex", alignItems: "center", gap: 10, overflow: "hidden" }}>
                    {typeCfg && (
                      <span style={{ display: "flex", alignItems: "center", gap: 4, padding: "3px 9px", borderRadius: 20, background: typeCfg.bg, color: typeCfg.color, fontSize: 10, fontWeight: 800, whiteSpace: "nowrap", flexShrink: 0 }}>
                        {typeCfg.emoji} {typeCfg.label}
                      </span>
                    )}
                    <p style={{ fontSize: 13, fontWeight: 800, color: "#111", margin: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", flex: "1 1 0", minWidth: 0 }}>{e.title || "—"}</p>
                    {e.client_name && <span style={{ fontSize: 11, color: "#DC143C", fontWeight: 700, whiteSpace: "nowrap", flexShrink: 0 }}>{e.client_name}</span>}
                    {e.video_duration && <span style={{ fontSize: 11, color: "#0F4C4C", whiteSpace: "nowrap", flexShrink: 0 }}>· {e.video_duration}</span>}
                    {e.duration_hours ? <span style={{ fontSize: 11, color: "#0F4C4C", whiteSpace: "nowrap", flexShrink: 0 }}>· {fmtH(e.duration_hours)}</span> : null}
                  </div>

                  {/* Price input + save */}
                  <div style={{ display: "flex", alignItems: "center", gap: 8, flexShrink: 0 }}>
                    <div style={{ position: "relative" }}>
                      <span style={{ position: "absolute", left: 9, top: "50%", transform: "translateY(-50%)", fontSize: 12, fontWeight: 800, color: hasPendingChange ? "#DC143C" : "#0F4C4C", pointerEvents: "none" }}>₹</span>
                      <input
                        type="number"
                        min="0"
                        placeholder="0"
                        value={priceVal}
                        onChange={ev => setPrices(p => ({ ...p, [key]: ev.target.value }))}
                        onKeyDown={ev => ev.key === "Enter" && handleSavePrice(e)}
                        style={{ width: 90, padding: "8px 10px 8px 22px", borderRadius: 10, border: `1.5px solid ${hasPendingChange ? "#DC143C" : (hasPrice ? "#FECACA" : "#E5E7EB")}`, fontSize: 13, fontWeight: 800, color: "#111", background: hasPendingChange ? "#FFF5F5" : "#FAFAFA", outline: "none", transition: "all 0.15s" }}
                      />
                    </div>
                    {isSaved ? (
                      <div style={{ width: 36, height: 36, borderRadius: 10, background: "rgba(34,197,94,0.1)", border: "1.5px solid rgba(34,197,94,0.25)", display: "flex", alignItems: "center", justifyContent: "center" }}>
                        <CheckCircle2 size={17} style={{ color: "#22C55E" }} />
                      </div>
                    ) : (
                      <button
                        onClick={() => handleSavePrice(e)}
                        disabled={isSaving || !hasPendingChange}
                        style={{ width: 36, height: 36, borderRadius: 10, border: "none", background: hasPendingChange ? "linear-gradient(135deg, #C41230, #DC143C)" : "#F3F4F6", color: hasPendingChange ? "#fff" : "#0F4C4C", fontSize: 14, fontWeight: 800, cursor: hasPendingChange ? "pointer" : "default", display: "flex", alignItems: "center", justifyContent: "center", boxShadow: hasPendingChange ? "0 4px 14px rgba(220,20,60,0.4)" : "none", transition: "all 0.15s" }}>
                        {isSaving ? <Loader2 size={13} className="animate-spin" /> : "✓"}
                      </button>
                    )}
                  </div>
                </div>
              )
            })
          )}
        </div>
      </div>
    </div>
  )
}
