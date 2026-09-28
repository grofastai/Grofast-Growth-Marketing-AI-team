"use client"

import { useState } from "react"
import { useRouter, usePathname } from "next/navigation"
import { Clock, ChevronDown, ChevronUp, Sparkles, AlertTriangle, CheckCircle2 } from "lucide-react"
import { formatDuration } from "@/lib/utils/punctuality"

export type DayRow = {
  date: string
  clockIn: string | null
  clockOut: string | null
  lateRanges: string[]
  earlyRanges: string[]
}

export type MemberPunctuality = {
  id: string
  name: string
  employeeId: string
  daysWithData: number
  lateDays: number
  lateMinutes: number
  earlyDays: number
  earlyMinutes: number
  days: DayRow[]
}

function fmtTime(iso: string | null) {
  if (!iso) return "—"
  return new Date(iso).toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit", hour12: true, timeZone: "Asia/Kolkata" })
}

function fmtDate(d: string) {
  return new Date(d + "T12:00:00").toLocaleDateString("en-IN", { day: "numeric", month: "short" })
}

export default function PunctualityClient({
  from, to, members,
}: {
  from: string
  to: string
  members: MemberPunctuality[]
}) {
  const router = useRouter()
  const pathname = usePathname()
  const [expanded, setExpanded] = useState<string | null>(null)
  const [showCustom, setShowCustom] = useState(false)
  const [customFrom, setCustomFrom] = useState(from)
  const [customTo, setCustomTo] = useState(to)
  // See activities-client.tsx for why this is needed: date-range presets can
  // collide (e.g. "This Week" == "Today" on a Monday), so the active pill is
  // tracked from the click itself rather than re-derived purely from the dates.
  const [manualPreset, setManualPreset] = useState<string | null>(null)

  const todayDate = new Date()
  const todayStr = todayDate.toISOString().split("T")[0]
  const yesterdayStr = new Date(todayDate.getTime() - 86400000).toISOString().split("T")[0]
  const weekStart = new Date(todayDate); weekStart.setDate(todayDate.getDate() - (todayDate.getDay() || 7) + 1)
  const weekStartStr = weekStart.toISOString().split("T")[0]
  const monthStartStr = `${todayDate.getFullYear()}-${String(todayDate.getMonth() + 1).padStart(2, "0")}-01`
  const prevMonthStart = new Date(todayDate.getFullYear(), todayDate.getMonth() - 1, 1)
  const prevMonthStartStr = prevMonthStart.toISOString().split("T")[0]
  const prevMonthEndStr = new Date(todayDate.getFullYear(), todayDate.getMonth(), 0).toISOString().split("T")[0]

  const DATE_PRESETS = [
    { label: "Today", from: todayStr, to: todayStr },
    { label: "Yesterday", from: yesterdayStr, to: yesterdayStr },
    { label: "This Week", from: weekStartStr, to: todayStr },
    { label: "This Month", from: monthStartStr, to: todayStr },
    { label: "Last Month", from: prevMonthStartStr, to: prevMonthEndStr },
  ]

  function activePreset() {
    if (manualPreset === "Custom") return "Custom"
    if (manualPreset) {
      const preset = DATE_PRESETS.find(p => p.label === manualPreset)
      if (preset && preset.from === from && preset.to === to) return manualPreset
    }
    return DATE_PRESETS.find(p => p.from === from && p.to === to)?.label ?? "Custom"
  }
  const curPreset = activePreset()

  function navigate(f: string, t: string) {
    const p = new URLSearchParams()
    if (f === t) p.set("date", f)
    else { p.set("from", f); p.set("to", t) }
    router.push(`${pathname}?${p.toString()}`)
  }

  const ranked = [...members].sort((a, b) => (b.lateMinutes + b.earlyMinutes) - (a.lateMinutes + a.earlyMinutes))
  const totalLateMin = members.reduce((s, m) => s + m.lateMinutes, 0)
  const totalEarlyMin = members.reduce((s, m) => s + m.earlyMinutes, 0)
  const clean = members.filter(m => m.daysWithData > 0 && m.lateDays === 0 && m.earlyDays === 0).length

  const displayFrom = new Date(from + "T12:00:00").toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" })
  const displayTo = new Date(to + "T12:00:00").toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" })

  return (
    <div style={{ background: "linear-gradient(160deg,#F8F9FF 0%,#F5F6FA 100%)", minHeight: "100vh" }} className="px-4 py-6 md:px-7 pb-14">

      {/* ── HERO HEADER ── */}
      <div style={{
        borderRadius: 24, marginBottom: 22, padding: "22px 24px",
        background: "linear-gradient(135deg, #de1a1a 0%, #991B1B 50%, #7F1D1D 100%)",
        boxShadow: "0 8px 32px rgba(222,26,26,0.35)",
      }}>
        <div className="flex items-center gap-2 mb-2">
          <div style={{ background: "rgba(255,255,255,0.2)", borderRadius: 10, padding: "6px 8px", display: "flex", alignItems: "center" }}>
            <Sparkles size={16} style={{ color: "#FFD700" }} />
          </div>
          <span style={{ fontSize: 11, fontWeight: 700, color: "rgba(255,255,255,0.7)", textTransform: "uppercase", letterSpacing: "0.15em" }}>Admin</span>
        </div>
        <h1 style={{ fontSize: 30, fontWeight: 900, color: "#FFFFFF", margin: "0 0 4px", fontFamily: "var(--font-jakarta)" }}>Punctuality</h1>
        <p style={{ fontSize: 13, color: "rgba(255,255,255,0.7)", margin: 0 }}>
          {from === to ? displayFrom : `${displayFrom} – ${displayTo}`} · Late-login / early-log-off vs 9:30 AM–7:00 PM, approved permission &amp; half-day leave excluded
        </p>
      </div>

      {/* ── DATE FILTER ROW ── */}
      <div style={{ display: "flex", gap: 8, marginBottom: 20, overflowX: "auto", flexWrap: "nowrap", alignItems: "center", paddingBottom: 4 }}>
        {DATE_PRESETS.map(p => (
          <button
            key={p.label}
            onClick={() => { setShowCustom(false); setManualPreset(p.label); navigate(p.from, p.to) }}
            style={{
              padding: "8px 18px", borderRadius: 10, fontSize: 13, fontWeight: 600, cursor: "pointer", border: "none",
              background: curPreset === p.label ? "#E31E24" : "#F3F4F6",
              color: curPreset === p.label ? "#fff" : "#1E3A5F",
              flexShrink: 0, whiteSpace: "nowrap",
            }}
          >
            {p.label}
          </button>
        ))}
        <button
          onClick={() => setShowCustom(v => !v)}
          style={{
            padding: "8px 18px", borderRadius: 10, fontSize: 13, fontWeight: 600, cursor: "pointer", border: "none",
            background: curPreset === "Custom" ? "#E31E24" : "#F3F4F6",
            color: curPreset === "Custom" ? "#fff" : "#1E3A5F",
            flexShrink: 0, whiteSpace: "nowrap",
          }}
        >
          Custom
        </button>
        {showCustom && (
          <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
            <input type="date" value={customFrom} onChange={e => setCustomFrom(e.target.value)}
              style={{ padding: "6px 10px", borderRadius: 8, border: "1px solid #E5E7EB", fontSize: 12, color: "#1E3A5F" }} />
            <span style={{ fontSize: 12, color: "#1E3A5F" }}>to</span>
            <input type="date" value={customTo} onChange={e => setCustomTo(e.target.value)}
              style={{ padding: "6px 10px", borderRadius: 8, border: "1px solid #E5E7EB", fontSize: 12, color: "#1E3A5F" }} />
            <button onClick={() => { navigate(customFrom, customTo); setShowCustom(false); setManualPreset("Custom") }}
              style={{ padding: "6px 14px", borderRadius: 8, background: "#E31E24", color: "#fff", border: "none", cursor: "pointer", fontSize: 12, fontWeight: 600 }}>
              Apply
            </button>
          </div>
        )}
      </div>

      {/* ── SUMMARY CARDS ── */}
      <div className="grid grid-cols-2 sm:grid-cols-3" style={{ gap: 14, marginBottom: 20 }}>
        {[
          { label: "Total Late Time", value: formatDuration(totalLateMin), gradient: "linear-gradient(135deg, #F59E0B, #B45309)", icon: <Clock size={18} color="#fff" /> },
          { label: "Total Early-Out Time", value: formatDuration(totalEarlyMin), gradient: "linear-gradient(135deg, #6366F1, #3730A3)", icon: <Clock size={18} color="#fff" /> },
          { label: "Perfect Punctuality", value: `${clean}/${members.filter(m => m.daysWithData > 0).length}`, gradient: "linear-gradient(135deg, #22C55E, #15803D)", icon: <CheckCircle2 size={18} color="#fff" /> },
        ].map(card => (
          <div key={card.label} style={{
            background: card.gradient, borderRadius: 16, padding: "18px 20px",
            display: "flex", alignItems: "center", justifyContent: "space-between",
            boxShadow: "0 4px 20px rgba(0,0,0,0.12)",
          }}>
            <div>
              <div style={{ fontSize: 11, color: "rgba(255,255,255,0.8)", fontWeight: 600, marginBottom: 4 }}>{card.label}</div>
              <div style={{ fontSize: 22, fontWeight: 800, color: "#fff" }}>{card.value}</div>
            </div>
            <div style={{ width: 40, height: 40, borderRadius: 12, background: "rgba(255,255,255,0.18)", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
              {card.icon}
            </div>
          </div>
        ))}
      </div>

      {/* ── RANKING TABLE ── */}
      <div style={{ background: "#FFFFFF", borderRadius: 22, border: "1px solid #EBEDF2", boxShadow: "0 4px 20px rgba(0,0,0,0.06)", overflow: "hidden" }}>
        <div style={{ height: 4, background: "linear-gradient(90deg, #de1a1a, #991B1B)" }} />
        <div style={{ padding: "18px 22px 14px", borderBottom: "1px solid #F3F4F6" }}>
          <h2 style={{ fontSize: 15, fontWeight: 900, color: "#111827", margin: 0, fontFamily: "var(--font-jakarta)" }}>Team Ranking</h2>
          <p style={{ fontSize: 11, color: "#0F4C4C", margin: "3px 0 0", fontWeight: 600 }}>Sorted by combined late + early-out time</p>
        </div>

        {ranked.length === 0 ? (
          <div style={{ padding: "40px 22px", textAlign: "center", color: "#0F4C4C", fontSize: 13 }}>No active members found.</div>
        ) : (
          <div>
            {ranked.map((m, i) => {
              const isOpen = expanded === m.id
              const combined = m.lateMinutes + m.earlyMinutes
              const noData = m.daysWithData === 0
              return (
                <div key={m.id} style={{ borderBottom: "1px solid #F9FAFB" }}>
                  <button
                    onClick={() => setExpanded(isOpen ? null : m.id)}
                    disabled={m.days.length === 0}
                    style={{
                      width: "100%", display: "grid",
                      gridTemplateColumns: "28px 1fr 100px 140px 140px 24px",
                      alignItems: "center", gap: 12, padding: "13px 22px",
                      background: i % 2 === 0 ? "#FFFFFF" : "#FDFCFC",
                      border: "none", cursor: m.days.length > 0 ? "pointer" : "default", textAlign: "left",
                    }}
                  >
                    <span style={{ fontSize: 12, fontWeight: 800, color: "#9CA3AF" }}>{i + 1}</span>
                    <div>
                      <p style={{ fontSize: 13, fontWeight: 700, color: "#111827", margin: 0 }}>{m.name}</p>
                      <p style={{ fontSize: 10, color: "#C4C4C4", margin: 0, fontWeight: 600 }}>#{m.employeeId} · {m.daysWithData} days with clock data</p>
                    </div>
                    <span style={{ fontSize: 12, fontWeight: 700, color: "#0F4C4C" }}>{noData ? "—" : `${m.daysWithData}d`}</span>
                    <span style={{ fontSize: 12, fontWeight: 700, color: m.lateDays > 0 ? "#D97706" : "#9CA3AF" }}>
                      {m.lateDays > 0 ? `${m.lateDays}d late · ${formatDuration(m.lateMinutes)}` : "No late logins"}
                    </span>
                    <span style={{ fontSize: 12, fontWeight: 700, color: m.earlyDays > 0 ? "#6366F1" : "#9CA3AF" }}>
                      {m.earlyDays > 0 ? `${m.earlyDays}d early · ${formatDuration(m.earlyMinutes)}` : "No early log-offs"}
                    </span>
                    {m.days.length > 0 ? (
                      isOpen ? <ChevronUp size={16} color="#9CA3AF" /> : <ChevronDown size={16} color="#9CA3AF" />
                    ) : combined === 0 && !noData ? <CheckCircle2 size={16} color="#22C55E" /> : <span />}
                  </button>

                  {isOpen && m.days.length > 0 && (
                    <div style={{ padding: "4px 22px 16px 62px", background: "#FAFAFA" }}>
                      {m.days.map(d => (
                        <div key={d.date} style={{
                          display: "flex", flexWrap: "wrap", alignItems: "center", gap: 10,
                          padding: "8px 12px", marginTop: 6, borderRadius: 10, background: "#FFFFFF", border: "1px solid #F0F0F0",
                        }}>
                          <span style={{ fontSize: 11, fontWeight: 800, color: "#111827", minWidth: 52 }}>{fmtDate(d.date)}</span>
                          <span style={{ fontSize: 10, color: "#9CA3AF", fontWeight: 600 }}>{fmtTime(d.clockIn)} – {fmtTime(d.clockOut)}</span>
                          {d.lateRanges.map((r, idx) => (
                            <span key={`l-${idx}`} style={{ fontSize: 10, fontWeight: 700, padding: "3px 9px", borderRadius: 8, background: "rgba(245,158,11,0.12)", color: "#D97706" }}>
                              Late {r}
                            </span>
                          ))}
                          {d.earlyRanges.map((r, idx) => (
                            <span key={`e-${idx}`} style={{ fontSize: 10, fontWeight: 700, padding: "3px 9px", borderRadius: 8, background: "rgba(99,102,241,0.12)", color: "#6366F1" }}>
                              Early {r}
                            </span>
                          ))}
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        )}
      </div>

      {members.every(m => m.daysWithData === 0) && (
        <div style={{ marginTop: 16, display: "flex", alignItems: "center", gap: 10, padding: "14px 18px", borderRadius: 14, background: "rgba(245,158,11,0.08)", border: "1px solid rgba(245,158,11,0.2)" }}>
          <AlertTriangle size={16} color="#D97706" />
          <span style={{ fontSize: 12, color: "#92400E", fontWeight: 600 }}>No clock-in data for anyone in this range yet.</span>
        </div>
      )}
    </div>
  )
}
