import { Video, Megaphone, Camera, Pencil } from "lucide-react"
import type { AttentionItem, TodayAndAllTime } from "@/lib/media-tracker/overview"
import type { MonthlyRollup } from "@/lib/media-tracker/delivery-status"

// Matches components/admin/PageHero.tsx's own gradient exactly, so the rail reads as
// part of the same brand surface as the hero above it rather than a different palette.
const RAIL_BG = "linear-gradient(135deg, #DE1A1A 0%, #8B1212 55%, #1A0808 100%)"

function RingProgress({ pct }: { pct: number }) {
  const r = 52
  const circumference = 2 * Math.PI * r
  const clamped = Math.max(0, Math.min(100, pct))
  const offset = circumference * (1 - clamped / 100)
  return (
    <div style={{ position: "relative", width: 132, height: 132, margin: "2px auto 8px" }}>
      <svg width="132" height="132" viewBox="0 0 120 120">
        <circle cx="60" cy="60" r={r} fill="none" stroke="rgba(255,255,255,0.16)" strokeWidth="10" />
        <circle cx="60" cy="60" r={r} fill="none" stroke="#fff" strokeWidth="10" strokeLinecap="round"
          strokeDasharray={circumference} strokeDashoffset={offset} transform="rotate(-90 60 60)" />
      </svg>
      <div style={{ position: "absolute", inset: 0, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center" }}>
        <span style={{ fontFamily: "var(--font-jakarta)", fontWeight: 800, fontSize: 24, color: "#fff" }}>{Math.round(clamped)}%</span>
        <span style={{ fontSize: 9, color: "rgba(255,255,255,0.6)", textTransform: "uppercase", letterSpacing: "0.06em", marginTop: 2 }}>of target</span>
      </div>
    </div>
  )
}

export function OverviewRail({
  attention, today, monthlyRollup, onAttentionClick, monthLabel,
}: {
  attention: AttentionItem[]
  today: TodayAndAllTime
  monthlyRollup: MonthlyRollup
  onAttentionClick: (target: AttentionItem["target"]) => void
  monthLabel: string
}) {
  return (
    <aside style={{
      position: "relative", overflow: "hidden", background: RAIL_BG, borderRadius: 20,
      padding: "26px 22px 26px 34px", color: "#fff", display: "flex", flexDirection: "column", gap: 24,
      boxShadow: "0 14px 30px rgba(139,18,18,0.35)",
    }}>
      <div style={{
        position: "absolute", left: 0, top: 0, bottom: 0, width: 14,
        backgroundImage: "radial-gradient(circle at 7px 11px, rgba(255,255,255,0.22) 3px, transparent 3.6px)",
        backgroundSize: "14px 24px", backgroundRepeat: "repeat-y",
      }} />

      <div>
        <p style={{ fontFamily: "var(--font-jakarta)", fontSize: 11, fontWeight: 700, color: "rgba(255,255,255,0.6)", textTransform: "uppercase", letterSpacing: "0.1em", margin: "0 0 6px" }}>Live status</p>
        <h3 style={{ fontFamily: "var(--font-jakarta)", fontWeight: 800, fontSize: 18, color: "#fff", margin: "0 0 12px" }}>Needs attention</h3>
        {attention.length === 0 ? (
          <p style={{ fontSize: 12, fontWeight: 600, color: "#6EE7A5", margin: 0 }}>All clear — nothing overdue or stalled.</p>
        ) : (
          attention.map((a, i) => (
            <button key={a.kind} onClick={() => onAttentionClick(a.target)}
              className="flex items-center justify-between text-left"
              style={{
                width: "100%", gap: 8, padding: "8px 0", border: "none", background: "transparent", cursor: "pointer",
                borderTop: i === 0 ? "none" : "1px solid rgba(255,255,255,0.14)",
              }}>
              <span style={{ fontSize: 12, fontWeight: 650, color: "rgba(255,255,255,0.9)" }}>{a.label}</span>
              <span style={{ fontSize: 10.5, fontWeight: 800, padding: "2px 8px", borderRadius: 999, background: "rgba(255,255,255,0.18)", color: "#fff", flexShrink: 0 }}>{a.count}</span>
            </button>
          ))
        )}
      </div>

      <div style={{ height: 1, background: "rgba(255,255,255,0.18)" }} />

      <div>
        <p style={{ fontFamily: "var(--font-jakarta)", fontSize: 11, fontWeight: 700, color: "rgba(255,255,255,0.6)", textTransform: "uppercase", letterSpacing: "0.1em", margin: "0 0 6px" }}>Today</p>
        <h3 style={{ fontFamily: "var(--font-jakarta)", fontWeight: 800, fontSize: 18, color: "#fff", margin: "0 0 12px" }}>At a glance</h3>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "16px 14px" }}>
          {([
            { key: "branding", icon: Video, label: "Branding Posts", value: today.brandingPostsToday },
            { key: "ads", icon: Megaphone, label: "Advertisements", value: today.adsToday },
            { key: "shoots", icon: Camera, label: "Shoots", value: today.shootsToday },
            { key: "editing", icon: Pencil, label: "Editing Reviews", value: today.editingReviewsToday },
          ] as const).map(({ key, label, value }) => (
            <div key={key}>
              <div style={{ fontFamily: "var(--font-jakarta)", fontWeight: 800, fontSize: 25, color: "#fff" }}>{value}</div>
              <div style={{ fontSize: 10, fontWeight: 650, color: "rgba(255,255,255,0.6)", textTransform: "uppercase", letterSpacing: "0.05em", marginTop: 3 }}>{label}</div>
            </div>
          ))}
        </div>
      </div>

      <div style={{ height: 1, background: "rgba(255,255,255,0.18)" }} />

      <div>
        <p style={{ fontFamily: "var(--font-jakarta)", fontSize: 11, fontWeight: 700, color: "rgba(255,255,255,0.6)", textTransform: "uppercase", letterSpacing: "0.1em", margin: "0 0 6px" }}>{monthLabel}</p>
        <h3 style={{ fontFamily: "var(--font-jakarta)", fontWeight: 800, fontSize: 18, color: "#fff", margin: "0 0 12px" }}>Branding progress</h3>
        <RingProgress pct={monthlyRollup.completionPct} />
        <div style={{ display: "flex", flexDirection: "column", gap: 9 }}>
          {([
            { key: "target", label: "Target", value: monthlyRollup.target },
            { key: "completed", label: "Completed", value: monthlyRollup.completed },
            { key: "remaining", label: "Remaining", value: monthlyRollup.remaining },
          ] as const).map(row => (
            <div key={row.key} style={{ display: "flex", justifyContent: "space-between", fontSize: 12 }}>
              <span style={{ color: "rgba(255,255,255,0.65)", fontWeight: 600 }}>{row.label}</span>
              <span style={{ fontWeight: 800, color: "#fff", fontVariantNumeric: "tabular-nums" }}>{row.value}</span>
            </div>
          ))}
        </div>
      </div>
    </aside>
  )
}
