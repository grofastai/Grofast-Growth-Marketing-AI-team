import { Camera, Pencil, CheckCircle2, CalendarClock, Send, Megaphone } from "lucide-react"

type Node = { key: string; label: string; value: number; color: string; icon: typeof Camera }

export function WorkFlow({
  shoots, editing, readyToPublish, scheduled, postedAllTime, usedInAdsAllTime,
  adsInTestingCount, overdueBrandingCount,
}: {
  shoots: number
  editing: number
  readyToPublish: number
  scheduled: number
  postedAllTime: number
  usedInAdsAllTime: number
  adsInTestingCount: number
  overdueBrandingCount: number
}) {
  const nodes: Node[] = [
    { key: "shoots", label: "Shoots", value: shoots, color: "#D97706", icon: Camera },
    { key: "editing", label: "Editing", value: editing, color: "#0D9488", icon: Pencil },
    { key: "readyToPublish", label: "Ready to Publish", value: readyToPublish, color: "#7C3AED", icon: CheckCircle2 },
    { key: "scheduled", label: "Scheduled", value: scheduled, color: "#2563EB", icon: CalendarClock },
    { key: "posted", label: "Posted", value: postedAllTime, color: "#16A34A", icon: Send },
    { key: "usedInAds", label: "Used in Ads", value: usedInAdsAllTime, color: "#DE1A1A", icon: Megaphone },
  ]
  return (
    <div style={{
      background: "#fff", border: "1px solid #DDE1E7", borderRadius: 20, padding: "26px 16px",
      boxShadow: "0 1px 2px rgba(16,24,40,0.05)", flex: 1, display: "flex", flexDirection: "column",
    }}>
      <div style={{ position: "relative" }}>
        <div style={{ position: "absolute", top: 14, bottom: 14, left: "50%", width: 2, background: "#DDE1E7", transform: "translateX(-50%)" }} />
        <div style={{ display: "flex", flexDirection: "column" }}>
          {nodes.map((n, i) => {
            const onRight = i % 2 === 0
            const Icon = n.icon
            const content = (
              <div style={{ display: "flex", flexDirection: "column", alignItems: onRight ? "flex-start" : "flex-end", gap: 3 }}>
                <Icon size={15} color={n.color} strokeWidth={2.25} />
                <span style={{ fontFamily: "var(--font-jakarta)", fontSize: 21, fontWeight: 800, color: n.color, fontVariantNumeric: "tabular-nums", lineHeight: 1 }}>{n.value}</span>
                <span style={{ fontSize: 10.5, fontWeight: 700, color: "#5B6472", textAlign: onRight ? "left" : "right" }}>{n.label}</span>
              </div>
            )
            return (
              <div key={n.key} style={{ display: "grid", gridTemplateColumns: "1fr 22px 1fr", alignItems: "center", minHeight: 74 }}>
                <div style={{ display: "flex", justifyContent: "flex-end", paddingRight: 12 }}>{!onRight && content}</div>
                <div style={{ display: "flex", justifyContent: "center" }}>
                  <span style={{ width: 11, height: 11, borderRadius: 999, background: n.color, boxShadow: `0 0 0 4px ${n.color}33`, position: "relative", zIndex: 1 }} />
                </div>
                <div style={{ display: "flex", justifyContent: "flex-start", paddingLeft: 12 }}>{onRight && content}</div>
              </div>
            )
          })}
        </div>
      </div>
      {(adsInTestingCount > 0 || overdueBrandingCount > 0) && (
        <div style={{ display: "flex", gap: 10, flexWrap: "wrap", marginTop: 20, paddingTop: 16, borderTop: "1px dashed #DDE1E7" }}>
          {adsInTestingCount > 0 && (
            <span style={{ display: "inline-flex", alignItems: "center", gap: 7, fontSize: 12, fontWeight: 700, padding: "6px 13px", borderRadius: 9, background: "rgba(217,119,6,0.09)", color: "#D97706" }}>
              {adsInTestingCount} ad{adsInTestingCount === 1 ? "" : "s"} in testing
            </span>
          )}
          {overdueBrandingCount > 0 && (
            <span style={{ display: "inline-flex", alignItems: "center", gap: 7, fontSize: 12, fontWeight: 700, padding: "6px 13px", borderRadius: 9, background: "rgba(222,26,26,0.09)", color: "#DE1A1A" }}>
              {overdueBrandingCount} branding post{overdueBrandingCount === 1 ? "" : "s"} overdue
            </span>
          )}
        </div>
      )}
    </div>
  )
}
