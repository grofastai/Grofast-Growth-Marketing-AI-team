import type { ClientDeliveryRow, DeliveryStatus } from "@/lib/media-tracker/delivery-status"
import { EditableTargetCell } from "./editable-target-cell"

const STATUS_LABEL: Record<DeliveryStatus, { label: string; color: string; bg: string }> = {
  on_track: { label: "On Track", color: "#16A34A", bg: "rgba(22,163,74,0.09)" },
  behind: { label: "Behind", color: "#D97706", bg: "rgba(217,119,6,0.09)" },
  completed: { label: "Completed", color: "#2563EB", bg: "rgba(37,99,235,0.09)" },
}

export function DeliveryStatusTable({ rows, onEditTarget }: {
  rows: ClientDeliveryRow[]
  // Target is only editable when the dashboard is scoped to a single content type
  // (video or poster) — a combined "All Content Types" sum can't be written back to
  // one target row. Omit this prop (or leave it undefined) to keep Target read-only.
  onEditTarget?: (client: string, newTarget: number) => Promise<void>
}) {
  if (rows.length === 0) {
    return (
      <div style={{ background: "#fff", border: "1px solid #DDE1E7", borderRadius: 14, padding: "24px 18px", textAlign: "center", fontSize: 12.5, fontWeight: 600, color: "#5B6472" }}>
        No branding activity or targets set for this month yet.
      </div>
    )
  }
  return (
    <div style={{ background: "#fff", border: "1px solid #DDE1E7", borderTop: "3px solid #2563EB", borderRadius: 14, overflow: "hidden", boxShadow: "0 1px 2px rgba(16,24,40,0.05)" }}>
      <div style={{ overflowX: "auto" }}>
        <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 11.5, tableLayout: "fixed" }}>
          <colgroup>
            <col style={{ width: "18%" }} />
            <col style={{ width: "9%" }} />
            <col style={{ width: "10%" }} />
            <col style={{ width: "9%" }} />
            <col style={{ width: "13%" }} />
            <col style={{ width: "10%" }} />
            <col style={{ width: "17%" }} />
            <col style={{ width: "14%" }} />
          </colgroup>
          <thead>
            <tr>
              {["Client", "Target", "Published", "Editing", "Ready to Publish", "Remaining", "Completion", "Status"].map(h => (
                <th key={h} style={{
                  textAlign: h === "Client" ? "left" : "center", padding: "8px 6px", fontSize: 8.5, fontWeight: 800,
                  textTransform: "uppercase", letterSpacing: "0.04em", color: "#8A94A3", background: "#F4F5F7", lineHeight: 1.25,
                }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map(row => {
              const s = STATUS_LABEL[row.status]
              return (
                <tr key={row.client}>
                  <td style={{ padding: "7px 6px", borderTop: "1px solid #EBEEF2", fontFamily: "var(--font-jakarta)", fontWeight: 800, color: "#111827", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{row.client}</td>
                  <td style={{ padding: "7px 6px", borderTop: "1px solid #EBEEF2", textAlign: "center", fontVariantNumeric: "tabular-nums", fontWeight: 650 }}>
                    {onEditTarget
                      ? <EditableTargetCell value={row.target} onSave={n => onEditTarget(row.client, n)} />
                      : row.target}
                  </td>
                  <td style={{ padding: "7px 6px", borderTop: "1px solid #EBEEF2", textAlign: "center", fontVariantNumeric: "tabular-nums", fontWeight: 650 }}>{row.published}</td>
                  <td style={{ padding: "7px 6px", borderTop: "1px solid #EBEEF2", textAlign: "center", fontVariantNumeric: "tabular-nums", fontWeight: 650 }}>{row.editing}</td>
                  <td style={{ padding: "7px 6px", borderTop: "1px solid #EBEEF2", textAlign: "center", fontVariantNumeric: "tabular-nums", fontWeight: 650 }}>{row.readyToPublish}</td>
                  <td style={{ padding: "7px 6px", borderTop: "1px solid #EBEEF2", textAlign: "center", fontVariantNumeric: "tabular-nums", fontWeight: 650 }}>{row.remaining}</td>
                  <td style={{ padding: "7px 6px", borderTop: "1px solid #EBEEF2", textAlign: "center" }}>
                    <span style={{ display: "inline-flex", alignItems: "center", gap: 4 }}>
                      <span style={{ width: 36, height: 5, borderRadius: 999, background: "#EBEEF2", display: "inline-block", overflow: "hidden", flexShrink: 0 }}>
                        <span style={{ display: "block", height: "100%", borderRadius: 999, width: `${Math.min(100, row.completionPct)}%`, background: s.color }} />
                      </span>
                      <span style={{ fontWeight: 800, fontSize: 10.5 }}>{Math.round(row.completionPct)}%</span>
                    </span>
                  </td>
                  <td style={{ padding: "7px 6px", borderTop: "1px solid #EBEEF2", textAlign: "center" }}>
                    <span style={{ display: "inline-flex", alignItems: "center", gap: 4, fontSize: 9.5, fontWeight: 800, padding: "3px 7px", borderRadius: 999, background: s.bg, color: s.color, whiteSpace: "nowrap" }}>
                      {s.label}
                    </span>
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
    </div>
  )
}
