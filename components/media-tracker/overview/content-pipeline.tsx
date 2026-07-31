import type { ContentPipeline } from "@/lib/media-tracker/overview"

function PipelineCard({ title, accent, rows }: {
  title: string
  accent: string
  rows: { label: string; value: number; color?: string }[]
}) {
  return (
    <div style={{ background: "#fff", border: "1px solid #DDE1E7", borderTop: `3px solid ${accent}`, borderRadius: 14, overflow: "hidden", boxShadow: "0 1px 2px rgba(16,24,40,0.05)" }}>
      <div style={{ padding: "12px 16px", borderBottom: "1px solid #EBEEF2" }}>
        <span style={{ fontFamily: "var(--font-jakarta)", fontSize: 10.5, fontWeight: 800, color: accent, textTransform: "uppercase", letterSpacing: "0.06em" }}>{title}</span>
      </div>
      <div style={{ display: "flex", flexDirection: "column" }}>
        {rows.map((r, i) => (
          <div key={r.label} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "10px 16px", borderTop: i === 0 ? "none" : "1px solid #EBEEF2" }}>
            <span style={{ fontSize: 12.5, fontWeight: 700, color: "#5B6472" }}>{r.label}</span>
            <span style={{ fontFamily: "var(--font-jakarta)", fontSize: 15, fontWeight: 800, color: r.color ?? "#111827", fontVariantNumeric: "tabular-nums" }}>{r.value}</span>
          </div>
        ))}
      </div>
    </div>
  )
}

// Mirrors the Video/Poster tabs' own nav-section badges (Shoots / Ads Video / Ready to
// Edit / Branding / Advertisement) exactly, via computeContentPipeline — so these numbers
// always agree with what those tabs show instead of a different, simplified total.
export function ContentPipelineSection({ pipeline }: { pipeline: ContentPipeline }) {
  return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
      <PipelineCard title="Video" accent="#DE1A1A" rows={[
        { label: "Shoots", value: pipeline.video.shoots },
        { label: "Ads Video", value: pipeline.video.adsVideo },
        { label: "Ready to Edit", value: pipeline.video.wip, color: "#0D9488" },
        { label: "Branding", value: pipeline.video.brandingAllTime, color: "#7C3AED" },
        { label: "Advertisement", value: pipeline.video.adsAllTime, color: "#2563EB" },
      ]} />
      <PipelineCard title="Poster" accent="#7C3AED" rows={[
        { label: "Ready to Edit", value: pipeline.poster.wip, color: "#0D9488" },
        { label: "Branding", value: pipeline.poster.brandingAllTime, color: "#7C3AED" },
        { label: "Advertisement", value: pipeline.poster.adsAllTime, color: "#2563EB" },
      ]} />
    </div>
  )
}
