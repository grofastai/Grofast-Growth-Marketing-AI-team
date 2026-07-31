import type { ContentPipeline } from "@/lib/media-tracker/overview"

function StatRow({ stats }: { stats: { label: string; value: number; color?: string }[] }) {
  return (
    <div style={{ display: "flex" }}>
      {stats.map((s, i) => (
        <div key={s.label} style={{ flex: 1, padding: i === 0 ? "0 14px 0 0" : "0 14px", borderLeft: i === 0 ? "none" : "1px solid #DDE1E7" }}>
          <div style={{ fontFamily: "var(--font-jakarta)", fontWeight: 800, fontSize: 22, color: s.color ?? "#111827", fontVariantNumeric: "tabular-nums" }}>{s.value}</div>
          <div style={{ fontSize: 10.5, fontWeight: 700, color: "#8A94A3", marginTop: 3 }}>{s.label}</div>
        </div>
      ))}
    </div>
  )
}

// Mirrors the Video/Poster tabs' own nav-section badges (Shoots / Ads Video / Ready to
// Edit / Branding / Advertisement) exactly, via computeContentPipeline — so these numbers
// always agree with what those tabs show instead of a different, simplified total.
export function ContentPipelineSection({ pipeline }: { pipeline: ContentPipeline }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 18 }}>
      <div>
        <div style={{ fontSize: 10.5, fontWeight: 800, color: "#DE1A1A", textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 10 }}>Video</div>
        <StatRow stats={[
          { label: "Shoots", value: pipeline.video.shoots },
          { label: "Ads Video", value: pipeline.video.adsVideo },
          { label: "Ready to Edit", value: pipeline.video.wip, color: "#0D9488" },
          { label: "Branding", value: pipeline.video.brandingAllTime, color: "#7C3AED" },
          { label: "Advertisement", value: pipeline.video.adsAllTime, color: "#2563EB" },
        ]} />
      </div>
      <div>
        <div style={{ fontSize: 10.5, fontWeight: 800, color: "#7C3AED", textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 10 }}>Poster</div>
        <StatRow stats={[
          { label: "Ready to Edit", value: pipeline.poster.wip, color: "#0D9488" },
          { label: "Branding", value: pipeline.poster.brandingAllTime, color: "#7C3AED" },
          { label: "Advertisement", value: pipeline.poster.adsAllTime, color: "#2563EB" },
        ]} />
      </div>
      <p style={{ fontSize: 11, color: "#8A94A3", fontWeight: 600, margin: 0 }}>
        Ready to Edit = everything still live in the pipeline. Branding/Advertisement = all-time posted count, not scoped to a month.
      </p>
    </div>
  )
}
