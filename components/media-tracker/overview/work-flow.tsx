type Node = { key: string; label: string; value: number; color: string }

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
    { key: "shoots", label: "Shoots", value: shoots, color: "#D97706" },
    { key: "editing", label: "Editing", value: editing, color: "#0D9488" },
    { key: "readyToPublish", label: "Ready to Publish", value: readyToPublish, color: "#7C3AED" },
    { key: "scheduled", label: "Scheduled", value: scheduled, color: "#2563EB" },
    { key: "posted", label: "Posted", value: postedAllTime, color: "#16A34A" },
    { key: "usedInAds", label: "Used in Ads", value: usedInAdsAllTime, color: "#DE1A1A" },
  ]
  return (
    <div>
      <div style={{ display: "flex", alignItems: "flex-start", overflowX: "auto", paddingBottom: 4, minWidth: 680 }}>
        {nodes.map((n, i) => (
          <div key={n.key} style={{
            flex: "1 1 0", minWidth: 84, display: "flex", flexDirection: "column", alignItems: "center", gap: 9,
            position: "relative", paddingTop: 2,
          }}>
            {i < nodes.length - 1 && (
              <div style={{ position: "absolute", top: 50, left: "50%", width: "100%", height: 2, background: "#DDE1E7", zIndex: 0 }} />
            )}
            <div style={{ height: 36, display: "flex", alignItems: "flex-end", justifyContent: "center" }}>
              <span style={{ fontFamily: "var(--font-jakarta)", fontSize: 26, fontWeight: 800, color: n.color, fontVariantNumeric: "tabular-nums" }}>{n.value}</span>
            </div>
            <span style={{ width: 14, height: 14, borderRadius: 999, background: n.color, border: "3px solid #F4F5F7", boxShadow: "0 0 0 1px #DDE1E7", position: "relative", zIndex: 1 }} />
            <span style={{ fontSize: 11, fontWeight: 700, color: "#5B6472", textAlign: "center" }}>{n.label}</span>
          </div>
        ))}
      </div>
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
    </div>
  )
}
