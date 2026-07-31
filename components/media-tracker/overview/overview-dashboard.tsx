"use client"

import { useMemo, useState } from "react"
import { ChevronDown, Search as SearchIcon, Filter as FilterIcon } from "lucide-react"
import { computeTodayAndAllTime, computeContentPipeline, type AttentionItem, type Overview } from "@/lib/media-tracker/overview"
import { computeMonthlyBrandingRollup, computeClientDeliveryStatus } from "@/lib/media-tracker/delivery-status"
import { OverviewRail } from "./overview-rail"
import { DeliveryStatusTable } from "./delivery-status-table"
import { WorkFlow } from "./work-flow"
import { ContentPipelineSection } from "./content-pipeline"
import type { ContentItem, Shoot, Ad, ClientTarget } from "@/components/media-tracker/media-tracker-client"

function fmtMonth(ym: string): string {
  const [y, m] = ym.split("-").map(Number)
  return new Date(y, m - 1, 1).toLocaleDateString("en-US", { month: "long", year: "numeric" })
}

type ContentTypeFilter = "all" | "video" | "poster"

export function OverviewDashboard({
  overview, items, shoots, ads, clientTargets, today,
  monthFilter, onMonthFilterChange, monthOptions,
  onAttentionClick, onSetTarget,
}: {
  overview: Overview
  items: ContentItem[]
  shoots: Shoot[]
  ads: Ad[]
  clientTargets: ClientTarget[]
  today: string
  monthFilter: string // 'all' or 'YYYY-MM'
  onMonthFilterChange: (month: string) => void
  monthOptions: string[]
  onAttentionClick: (target: AttentionItem["target"]) => void
  onSetTarget: (clientName: string, kind: "branding" | "ads", contentType: "video" | "poster", month: string, newTarget: number) => Promise<void>
}) {
  const [contentTypeFilter, setContentTypeFilter] = useState<ContentTypeFilter>("all")
  const contentType = contentTypeFilter === "all" ? undefined : contentTypeFilter

  const todayAndAllTime = useMemo(() => computeTodayAndAllTime({ items, shoots, ads, today }), [items, shoots, ads, today])
  const contentPipeline = useMemo(() => computeContentPipeline({ items, shoots }), [items, shoots])
  const effectiveMonth = monthFilter === "all" ? today.slice(0, 7) : monthFilter
  const monthlyRollup = useMemo(
    () => computeMonthlyBrandingRollup(items, clientTargets, effectiveMonth, contentType),
    [items, clientTargets, effectiveMonth, contentType]
  )
  const deliveryRows = useMemo(
    () => computeClientDeliveryStatus(items, clientTargets, effectiveMonth, today, contentType),
    [items, clientTargets, effectiveMonth, today, contentType]
  )
  // How Work Moves reads the stage counts already split by content type on `overview`
  // (overview.videos / overview.posters) — pick a side, or sum both for "all", so this
  // stays consistent with the same content-type filter as the table and progress ring.
  const flowStages = contentTypeFilter === "video" ? overview.videos
    : contentTypeFilter === "poster" ? overview.posters
    : {
        ready_to_edit: overview.videos.ready_to_edit + overview.posters.ready_to_edit,
        edited: overview.videos.edited + overview.posters.edited,
        branding_ready: overview.videos.branding_ready + overview.posters.branding_ready,
      }

  // Target is only well-defined to edit when scoped to one content type — a combined
  // "All Content Types" sum has no single target row to write back to.
  const onEditTarget = contentType
    ? (client: string, newTarget: number) => onSetTarget(client, "branding", contentType, effectiveMonth, newTarget)
    : undefined

  return (
    <div className="flex flex-col gap-[22px]">
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center", background: "#fff", border: "1px solid #DDE1E7", borderRadius: 12, padding: 10 }}>
        <div style={{ flex: "1 1 200px", display: "flex", alignItems: "center", gap: 8, background: "#F4F5F7", border: "1px solid #DDE1E7", borderRadius: 8, padding: "9px 12px", color: "#8A94A3", fontSize: 12.5, fontWeight: 600 }}>
          <SearchIcon size={14} />
          Search clients, content, platform… (coming soon)
        </div>
        <select value={monthFilter} onChange={e => onMonthFilterChange(e.target.value)}
          style={{ display: "flex", alignItems: "center", gap: 6, background: "#F4F5F7", border: "1px solid #DDE1E7", borderRadius: 8, padding: "9px 12px", fontSize: 12.5, fontWeight: 700, color: "#111827", cursor: "pointer" }}>
          <option value="all">All Time</option>
          {monthOptions.map(m => <option key={m} value={m}>{fmtMonth(m)}</option>)}
        </select>
        <select value={contentTypeFilter} onChange={e => setContentTypeFilter(e.target.value as ContentTypeFilter)}
          style={{ display: "flex", alignItems: "center", gap: 6, background: "#F4F5F7", border: "1px solid #DDE1E7", borderRadius: 8, padding: "9px 12px", fontSize: 12.5, fontWeight: 700, color: "#111827", cursor: "pointer" }}>
          <option value="all">All Content Types</option>
          <option value="video">Video</option>
          <option value="poster">Poster</option>
        </select>
        {["All Team Members", "All Platforms", "All Status"].map(label => (
          <div key={label} style={{ display: "flex", alignItems: "center", gap: 6, background: "#F4F5F7", border: "1px solid #DDE1E7", borderRadius: 8, padding: "9px 12px", fontSize: 12.5, fontWeight: 700, color: "#8A94A3", cursor: "not-allowed" }}>
            {label} <ChevronDown size={12} />
          </div>
        ))}
        <div style={{ marginLeft: "auto", display: "grid", placeItems: "center", width: 36, height: 36, borderRadius: 8, background: "#F4F5F7", border: "1px solid #DDE1E7", color: "#5B6472" }}>
          <FilterIcon size={15} />
        </div>
      </div>

      <div className="grid gap-6 items-start grid-cols-1 md:grid-cols-[296px_1fr]">
        <OverviewRail
          attention={overview.attention}
          today={todayAndAllTime}
          monthlyRollup={monthlyRollup}
          onAttentionClick={onAttentionClick}
          monthLabel={monthFilter === "all" ? "This month" : fmtMonth(effectiveMonth)}
        />

        <main className="flex flex-col gap-[32px] min-w-0">
          <section>
            <p style={{ fontFamily: "var(--font-jakarta)", fontSize: 11, fontWeight: 700, color: "#8A94A3", textTransform: "uppercase", letterSpacing: "0.08em", margin: "0 0 6px" }}>Where each account stands</p>
            <h2 style={{ fontFamily: "var(--font-jakarta)", fontWeight: 800, fontSize: 19, color: "#111827", margin: "0 0 16px" }}>
              Client delivery — Branding{contentTypeFilter !== "all" ? ` · ${contentTypeFilter === "video" ? "Video" : "Poster"}` : ""}
            </h2>
            <DeliveryStatusTable rows={deliveryRows} onEditTarget={onEditTarget} />
            {!onEditTarget && (
              <p style={{ fontSize: 11, color: "#8A94A3", fontWeight: 600, margin: "8px 2px 0" }}>
                Pick Video or Poster above to edit a client's target.
              </p>
            )}
          </section>

          <section>
            <p style={{ fontFamily: "var(--font-jakarta)", fontSize: 11, fontWeight: 700, color: "#8A94A3", textTransform: "uppercase", letterSpacing: "0.08em", margin: "0 0 6px" }}>From shoot to published</p>
            <h2 style={{ fontFamily: "var(--font-jakarta)", fontWeight: 800, fontSize: 19, color: "#111827", margin: "0 0 16px" }}>How work moves</h2>
            <WorkFlow
              shoots={overview.shoots.scheduled}
              editing={flowStages.ready_to_edit + flowStages.edited}
              readyToPublish={flowStages.branding_ready}
              scheduled={overview.posting.brandingWaiting + overview.posting.adsWaiting}
              postedAllTime={todayAndAllTime.postedAllTime}
              usedInAdsAllTime={todayAndAllTime.usedInAdsAllTime}
              adsInTestingCount={todayAndAllTime.adsInTestingCount}
              overdueBrandingCount={todayAndAllTime.overdueBrandingCount}
            />
          </section>

          <section>
            <p style={{ fontFamily: "var(--font-jakarta)", fontSize: 11, fontWeight: 700, color: "#8A94A3", textTransform: "uppercase", letterSpacing: "0.08em", margin: "0 0 6px" }}>Everything still in motion</p>
            <h2 style={{ fontFamily: "var(--font-jakarta)", fontWeight: 800, fontSize: 19, color: "#111827", margin: "0 0 16px" }}>Content pipeline</h2>
            <div style={{ background: "#fff", border: "1px solid #DDE1E7", borderRadius: 14, padding: "18px 20px", boxShadow: "0 1px 2px rgba(16,24,40,0.05)" }}>
              <ContentPipelineSection pipeline={contentPipeline} />
            </div>
          </section>
        </main>
      </div>
    </div>
  )
}
