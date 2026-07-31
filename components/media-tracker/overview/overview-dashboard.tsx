"use client"

import { useMemo, useState } from "react"
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

type ContentTypeFilter = "video" | "poster"

export function OverviewDashboard({
  overview, items, shoots, ads, clientTargets, today,
  onAttentionClick, onSetTarget,
}: {
  overview: Overview
  items: ContentItem[]
  shoots: Shoot[]
  ads: Ad[]
  clientTargets: ClientTarget[]
  today: string
  onAttentionClick: (target: AttentionItem["target"]) => void
  onSetTarget: (clientName: string, kind: "branding" | "ads", contentType: "video" | "poster", month: string, newTarget: number) => Promise<void>
}) {
  const [contentTypeFilter, setContentTypeFilter] = useState<ContentTypeFilter>("video")

  const todayAndAllTime = useMemo(() => computeTodayAndAllTime({ items, shoots, ads, today }), [items, shoots, ads, today])
  const contentPipeline = useMemo(() => computeContentPipeline({ items, shoots }), [items, shoots])
  const effectiveMonth = today.slice(0, 7)
  const monthlyRollup = useMemo(
    () => computeMonthlyBrandingRollup(items, clientTargets, effectiveMonth, contentTypeFilter),
    [items, clientTargets, effectiveMonth, contentTypeFilter]
  )
  const deliveryRows = useMemo(
    () => computeClientDeliveryStatus(items, clientTargets, effectiveMonth, today, contentTypeFilter),
    [items, clientTargets, effectiveMonth, today, contentTypeFilter]
  )
  // How Work Moves reads the stage counts already split by content type on `overview`
  // (overview.videos / overview.posters) — each already combines that content type's
  // Branding and Advertisement activity, so switching the toggle shows both together.
  const flowStages = contentTypeFilter === "video" ? overview.videos : overview.posters

  const onEditTarget = (client: string, newTarget: number) =>
    onSetTarget(client, "branding", contentTypeFilter, effectiveMonth, newTarget)

  return (
    <div className="flex flex-col gap-[22px]">
      <div style={{ display: "inline-flex", background: "#F3F4F6", borderRadius: 10, padding: 3, alignSelf: "flex-start" }}>
        {(["video", "poster"] as const).map(ct => (
          <button key={ct} onClick={() => setContentTypeFilter(ct)}
            style={{
              padding: "8px 20px", borderRadius: 8, border: "none", cursor: "pointer",
              fontFamily: "var(--font-jakarta)", fontSize: 13, fontWeight: 800, textTransform: "capitalize",
              background: contentTypeFilter === ct ? "#fff" : "transparent",
              color: contentTypeFilter === ct ? "#111827" : "#8A94A3",
              boxShadow: contentTypeFilter === ct ? "0 1px 3px rgba(16,24,40,0.12)" : "none",
              transition: "all 0.15s",
            }}>
            {ct}
          </button>
        ))}
      </div>

      <div className="grid gap-6 items-start grid-cols-1 md:grid-cols-[296px_1fr]">
        <OverviewRail
          attention={overview.attention}
          today={todayAndAllTime}
          monthlyRollup={monthlyRollup}
          onAttentionClick={onAttentionClick}
          monthLabel={fmtMonth(effectiveMonth)}
        />

        <main className="flex flex-col gap-[32px] min-w-0">
          <section>
            <p style={{ fontFamily: "var(--font-jakarta)", fontSize: 11, fontWeight: 700, color: "#8A94A3", textTransform: "uppercase", letterSpacing: "0.08em", margin: "0 0 6px" }}>Where each account stands</p>
            <h2 style={{ fontFamily: "var(--font-jakarta)", fontWeight: 800, fontSize: 19, color: "#111827", margin: "0 0 16px" }}>
              Client Delivery: Branding · {contentTypeFilter === "video" ? "Video" : "Poster"}
            </h2>
            <DeliveryStatusTable rows={deliveryRows} onEditTarget={onEditTarget} />
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
        </main>
      </div>

      {/* Full width below the rail+main row, instead of confined to the narrower main
          column — the rail is much shorter than the main column, so a third section
          nested inside main would leave dead space beside it rather than using the page. */}
      <section>
        <p style={{ fontFamily: "var(--font-jakarta)", fontSize: 11, fontWeight: 700, color: "#8A94A3", textTransform: "uppercase", letterSpacing: "0.08em", margin: "0 0 6px" }}>Everything still in motion</p>
        <h2 style={{ fontFamily: "var(--font-jakarta)", fontWeight: 800, fontSize: 19, color: "#111827", margin: "0 0 16px" }}>Content pipeline</h2>
        <ContentPipelineSection pipeline={contentPipeline} onNavigate={onAttentionClick} />
      </section>
    </div>
  )
}
