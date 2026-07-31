import { RAIL_BG } from "./overview-rail"

type Node = { key: string; label: string; value: number; color: string }

// Lighter tints of each node's color, used for its label text so it stays
// legible against the dark rail-matching background (the base color is too
// saturated/dark for body text at this size).
const LABEL_TINT: Record<string, string> = {
  "#D97706": "#FBBF7A",
  "#0D9488": "#5EEAD4",
  "#7C3AED": "#C4B5FD",
  "#2563EB": "#93C5FD",
  "#16A34A": "#86EFAC",
  "#DE1A1A": "#FCA5A5",
}

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
      background: RAIL_BG, borderRadius: 20, padding: "26px 22px",
      boxShadow: "0 14px 30px rgba(3,105,161,0.35)",
    }}>
      <div style={{ display: "flex", flexDirection: "column" }}>
        {nodes.map((n, i) => (
          <div key={n.key} style={{ display: "flex", alignItems: "stretch", gap: 16 }}>
            <div style={{ display: "flex", flexDirection: "column", alignItems: "center", width: 14, flexShrink: 0 }}>
              <span style={{ width: 14, height: 14, borderRadius: 999, background: n.color, flexShrink: 0, marginTop: 6, boxShadow: `0 0 0 4px ${n.color}33` }} />
              {i < nodes.length - 1 && <span style={{ flex: 1, width: 2, background: "rgba(255,255,255,0.18)", marginTop: 4 }} />}
            </div>
            <div style={{ display: "flex", alignItems: "baseline", gap: 14, paddingBottom: i < nodes.length - 1 ? 22 : 0 }}>
              <span style={{ fontFamily: "var(--font-jakarta)", fontSize: 26, fontWeight: 800, color: n.color, fontVariantNumeric: "tabular-nums", minWidth: 52 }}>{n.value}</span>
              <span style={{ fontSize: 13, fontWeight: 700, color: LABEL_TINT[n.color] }}>{n.label}</span>
            </div>
          </div>
        ))}
      </div>
      {(adsInTestingCount > 0 || overdueBrandingCount > 0) && (
        <div style={{ display: "flex", gap: 10, flexWrap: "wrap", marginTop: 20, paddingTop: 16, borderTop: "1px dashed rgba(255,255,255,0.18)" }}>
          {adsInTestingCount > 0 && (
            <span style={{ display: "inline-flex", alignItems: "center", gap: 7, fontSize: 12, fontWeight: 700, padding: "6px 13px", borderRadius: 9, background: "rgba(217,119,6,0.25)", color: "#FBBF7A" }}>
              {adsInTestingCount} ad{adsInTestingCount === 1 ? "" : "s"} in testing
            </span>
          )}
          {overdueBrandingCount > 0 && (
            <span style={{ display: "inline-flex", alignItems: "center", gap: 7, fontSize: 12, fontWeight: 700, padding: "6px 13px", borderRadius: 9, background: "rgba(222,26,26,0.25)", color: "#FCA5A5" }}>
              {overdueBrandingCount} branding post{overdueBrandingCount === 1 ? "" : "s"} overdue
            </span>
          )}
        </div>
      )}
    </div>
  )
}
