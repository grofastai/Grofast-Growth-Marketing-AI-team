import type { ClientDeliveryRow, DeliveryStatus } from "@/lib/media-tracker/delivery-status"

const STATUS_LABEL: Record<DeliveryStatus, { label: string; color: string; bg: string }> = {
  on_track: { label: "On Track", color: "#16A34A", bg: "rgba(22,163,74,0.09)" },
  behind: { label: "Behind", color: "#D97706", bg: "rgba(217,119,6,0.09)" },
  completed: { label: "Completed", color: "#2563EB", bg: "rgba(37,99,235,0.09)" },
}

export function DeliveryStatusTable({ rows }: { rows: ClientDeliveryRow[] }) {
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
        <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
          <thead>
            <tr>
              {["Client", "Target", "Published", "Editing", "Ready to Publish", "Remaining", "Completion", "Status"].map(h => (
                <th key={h} style={{
                  textAlign: h === "Client" ? "left" : "center", padding: "11px 18px", fontSize: 10.5, fontWeight: 800,
                  textTransform: "uppercase", letterSpacing: "0.06em", color: "#8A94A3", background: "#F4F5F7", whiteSpace: "nowrap",
                }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map(row => {
              const s = STATUS_LABEL[row.status]
              return (
                <tr key={row.client}>
                  <td style={{ padding: "12px 18px", borderTop: "1px solid #EBEEF2", fontFamily: "var(--font-jakarta)", fontWeight: 800, color: "#111827", whiteSpace: "nowrap" }}>{row.client}</td>
                  <td style={{ padding: "12px 18px", borderTop: "1px solid #EBEEF2", textAlign: "center", fontVariantNumeric: "tabular-nums", fontWeight: 650 }}>{row.target}</td>
                  <td style={{ padding: "12px 18px", borderTop: "1px solid #EBEEF2", textAlign: "center", fontVariantNumeric: "tabular-nums", fontWeight: 650 }}>{row.published}</td>
                  <td style={{ padding: "12px 18px", borderTop: "1px solid #EBEEF2", textAlign: "center", fontVariantNumeric: "tabular-nums", fontWeight: 650 }}>{row.editing}</td>
                  <td style={{ padding: "12px 18px", borderTop: "1px solid #EBEEF2", textAlign: "center", fontVariantNumeric: "tabular-nums", fontWeight: 650 }}>{row.readyToPublish}</td>
                  <td style={{ padding: "12px 18px", borderTop: "1px solid #EBEEF2", textAlign: "center", fontVariantNumeric: "tabular-nums", fontWeight: 650 }}>{row.remaining}</td>
                  <td style={{ padding: "12px 18px", borderTop: "1px solid #EBEEF2", textAlign: "center" }}>
                    <span style={{ display: "inline-flex", alignItems: "center", gap: 8 }}>
                      <span style={{ width: 88, height: 7, borderRadius: 999, background: "#EBEEF2", display: "inline-block", overflow: "hidden" }}>
                        <span style={{ display: "block", height: "100%", borderRadius: 999, width: `${Math.min(100, row.completionPct)}%`, background: s.color }} />
                      </span>
                      <span style={{ fontWeight: 800 }}>{Math.round(row.completionPct)}%</span>
                    </span>
                  </td>
                  <td style={{ padding: "12px 18px", borderTop: "1px solid #EBEEF2", textAlign: "center" }}>
                    <span style={{ display: "inline-flex", alignItems: "center", gap: 6, fontSize: 11, fontWeight: 800, padding: "5px 12px", borderRadius: 999, background: s.bg, color: s.color }}>
                      {s.label}
                    </span>
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
      <div style={{ padding: "10px 18px", fontSize: 11, color: "#8A94A3", fontWeight: 600, borderTop: "1px solid #EBEEF2" }}>
        Status is pace-based: On Track keeps up with the % of the month elapsed; Behind trails it; Completed once Published ≥ Target.
      </div>
    </div>
  )
}
