import type { UpcomingScheduleItem } from "@/lib/media-tracker/schedule"
import type { AttentionTarget } from "@/lib/media-tracker/overview"

const PRIORITY_CFG: Record<NonNullable<UpcomingScheduleItem["priority"]>, { label: string; color: string; bg: string }> = {
  low: { label: "Low", color: "#5B6472", bg: "#F4F5F7" },
  medium: { label: "Medium", color: "#D97706", bg: "rgba(217,119,6,0.09)" },
  high: { label: "High", color: "#DE1A1A", bg: "rgba(222,26,26,0.09)" },
  urgent: { label: "Urgent", color: "#DE1A1A", bg: "rgba(222,26,26,0.09)" },
}

function fmtDate(date: string, time: string | null): string {
  const d = new Date(`${date}T${time ?? "00:00"}:00`)
  const dateLabel = d.toLocaleDateString("en-US", { month: "short", day: "numeric" })
  if (!time) return dateLabel
  const timeLabel = d.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" })
  return `${dateLabel} · ${timeLabel}`
}

export function UpcomingSchedule({ items, onNavigate }: {
  items: UpcomingScheduleItem[]
  onNavigate: (target: AttentionTarget) => void
}) {
  if (items.length === 0) {
    return (
      <div style={{ background: "#fff", border: "1px solid #DDE1E7", borderRadius: 14, padding: "24px 18px", textAlign: "center", fontSize: 12.5, fontWeight: 600, color: "#5B6472" }}>
        Nothing scheduled to post right now.
      </div>
    )
  }
  return (
    <div style={{ background: "#fff", border: "1px solid #DDE1E7", borderTop: "3px solid #0D9488", borderRadius: 14, overflow: "hidden", boxShadow: "0 1px 2px rgba(16,24,40,0.05)" }}>
      {items.map((item, i) => {
        const p = item.priority ? PRIORITY_CFG[item.priority] : null
        return (
          <button key={item.id}
            onClick={() => onNavigate({ mode: "video", tab: item.destination === "ads" ? "adlog" : "log" })}
            className="flex items-center justify-between text-left"
            style={{ width: "100%", gap: 12, padding: "12px 16px", border: "none", background: "transparent", cursor: "pointer", borderTop: i === 0 ? "none" : "1px solid #EBEEF2" }}>
            <span style={{ fontSize: 11.5, fontWeight: 800, color: item.overdue ? "#DE1A1A" : "#8A94A3", width: 92, flexShrink: 0, fontVariantNumeric: "tabular-nums" }}>
              {item.overdue ? "Overdue" : fmtDate(item.date, item.time)}
            </span>
            <span style={{ flex: 1, minWidth: 0 }}>
              <span style={{ display: "block", fontSize: 9.5, fontWeight: 800, textTransform: "uppercase", letterSpacing: "0.05em", color: "#8A94A3" }}>{item.client}</span>
              <span style={{ display: "block", fontSize: 13, fontWeight: 700, color: "#111827", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{item.title}</span>
            </span>
            <span style={{ display: "flex", gap: 6, flexShrink: 0 }}>
              {p && (
                <span style={{ fontSize: 10, fontWeight: 800, padding: "3px 8px", borderRadius: 7, background: p.bg, color: p.color, whiteSpace: "nowrap" }}>{p.label}</span>
              )}
              <span style={{ fontSize: 10, fontWeight: 800, padding: "3px 8px", borderRadius: 7, background: item.destination === "ads" ? "#F4F5F7" : "rgba(37,99,235,0.09)", color: item.destination === "ads" ? "#5B6472" : "#2563EB", whiteSpace: "nowrap" }}>
                {item.destination === "ads" ? "Ads" : "Branding"}
              </span>
            </span>
          </button>
        )
      })}
    </div>
  )
}
