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
    <div style={{
      background: "#fff", border: "1px solid #DDE1E7", borderRadius: 20, padding: "26px 22px",
      boxShadow: "0 1px 2px rgba(16,24,40,0.05)",
    }}>
      <div style={{ display: "flex", flexDirection: "column" }}>
        {nodes.map((n, i) => (
          <div key={n.key} style={{ display: "flex", alignItems: "stretch", gap: 16 }}>
            <div style={{ display: "flex", flexDirection: "column", alignItems: "center", width: 14, flexShrink: 0 }}>
              <span style={{ width: 14, height: 14, borderRadius: 999, background: n.color, flexShrink: 0, marginTop: 6, boxShadow: `0 0 0 4px ${n.color}33` }} />
              {i < nodes.length - 1 && <span style={{ flex: 1, width: 2, background: "#DDE1E7", marginTop: 4 }} />}
            </div>
            <div style={{ display: "flex", alignItems: "baseline", gap: 14, paddingBottom: i < nodes.length - 1 ? 22 : 0 }}>
              <span style={{ fontFamily: "var(--font-jakarta)", fontSize: 26, fontWeight: 800, color: n.color, fontVariantNumeric: "tabular-nums", minWidth: 52 }}>{n.value}</span>
              <span style={{ fontSize: 13, fontWeight: 700, color: "#5B6472" }}>{n.label}</span>
            </div>
          </div>
        ))}
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
