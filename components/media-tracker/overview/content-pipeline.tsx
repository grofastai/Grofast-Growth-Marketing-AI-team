import type { ContentPipeline, AttentionTarget } from "@/lib/media-tracker/overview"

type Row = { label: string; value: number; color?: string; target: AttentionTarget }

function PipelineCard({ title, accent, rows, onNavigate }: {
  title: string
  accent: string
  rows: Row[]
  onNavigate: (target: AttentionTarget) => void
}) {
  return (
    <div style={{ background: "#fff", border: "1px solid #DDE1E7", borderTop: `3px solid ${accent}`, borderRadius: 14, overflow: "hidden", boxShadow: "0 1px 2px rgba(16,24,40,0.05)" }}>
      <div style={{ padding: "12px 16px", borderBottom: "1px solid #EBEEF2" }}>
        <span style={{ fontFamily: "var(--font-jakarta)", fontSize: 10.5, fontWeight: 800, color: accent, textTransform: "uppercase", letterSpacing: "0.06em" }}>{title}</span>
      </div>
      <div style={{ display: "flex", flexDirection: "column" }}>
        {rows.map((r, i) => (
          <button key={r.label} onClick={() => onNavigate(r.target)}
            className="flex items-center justify-between text-left"
            style={{ width: "100%", padding: "10px 16px", border: "none", background: "transparent", cursor: "pointer", borderTop: i === 0 ? "none" : "1px solid #EBEEF2" }}>
            <span style={{ fontSize: 12.5, fontWeight: 700, color: "#5B6472" }}>{r.label}</span>
            <span style={{ fontFamily: "var(--font-jakarta)", fontSize: 15, fontWeight: 800, color: r.color ?? "#111827", fontVariantNumeric: "tabular-nums" }}>{r.value}</span>
          </button>
        ))}
      </div>
    </div>
  )
}

// Mirrors the Video/Poster tabs' own nav-section badges (Shoots / Ads Video / Ready to
// Edit / Branding / Advertisement) exactly, via computeContentPipeline — so these numbers
// always agree with what those tabs show instead of a different, simplified total. Every
// row navigates to the tab it's counting, same as Needs Attention, instead of being a
// dead-end number with no way to see the underlying list.
export function ContentPipelineSection({ pipeline, onNavigate }: {
  pipeline: ContentPipeline
  onNavigate: (target: AttentionTarget) => void
}) {
  return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
      <PipelineCard title="Video" accent="#DE1A1A" onNavigate={onNavigate} rows={[
        { label: "Shoots", value: pipeline.video.shoots, target: { mode: "video", tab: "shoots" } },
        { label: "Ads Video", value: pipeline.video.adsVideo, target: { mode: "video", tab: "adsvideo" } },
        { label: "Ready to Edit", value: pipeline.video.wip, color: "#0D9488", target: { mode: "video", tab: "pipeline" } },
        { label: "Branding", value: pipeline.video.brandingAllTime, color: "#7C3AED", target: { mode: "video", tab: "log" } },
        { label: "Advertisement", value: pipeline.video.adsAllTime, color: "#2563EB", target: { mode: "video", tab: "adlog" } },
      ]} />
      <PipelineCard title="Poster" accent="#7C3AED" onNavigate={onNavigate} rows={[
        { label: "Ready to Edit", value: pipeline.poster.wip, color: "#0D9488", target: { mode: "poster", tab: "pipeline" } },
        { label: "Branding", value: pipeline.poster.brandingAllTime, color: "#7C3AED", target: { mode: "poster", tab: "log" } },
        { label: "Advertisement", value: pipeline.poster.adsAllTime, color: "#2563EB", target: { mode: "poster", tab: "adlog" } },
      ]} />
    </div>
  )
}
