"use client"

import { useMemo, useState } from "react"
import { computeTodayAndAllTime, computeContentPipeline, type AttentionItem, type Overview } from "@/lib/media-tracker/overview"
import { computeMonthlyRollup, computeClientDeliveryStatus, type DeliveryKind } from "@/lib/media-tracker/delivery-status"
import { computeUpcomingSchedule } from "@/lib/media-tracker/schedule"
import { OverviewRail } from "./overview-rail"
import { DeliveryStatusTable } from "./delivery-status-table"
import { WorkFlow } from "./work-flow"
import { ContentPipelineSection } from "./content-pipeline"
import { UpcomingSchedule } from "./upcoming-schedule"
import type { ContentItem, Shoot, Ad, ClientTarget } from "@/components/media-tracker/media-tracker-client"

function fmtMonth(ym: string): string {
  const [y, m] = ym.split("-").map(Number)
  return new Date(y, m - 1, 1).toLocaleDateString("en-US", { month: "long", year: "numeric" })
}

type ContentTypeFilter = "video" | "poster"

function ContentTypeToggle({ value, onChange }: { value: ContentTypeFilter; onChange: (ct: ContentTypeFilter) => void }) {
  return (
    <div style={{ display: "inline-flex", background: "#F3F4F6", borderRadius: 10, padding: 3, flexShrink: 0 }}>
      {(["video", "poster"] as const).map(ct => (
        <button key={ct} onClick={() => onChange(ct)}
          style={{
            padding: "7px 18px", borderRadius: 8, border: "none", cursor: "pointer",
            fontFamily: "var(--font-jakarta)", fontSize: 12.5, fontWeight: 800, textTransform: "capitalize",
            background: value === ct ? "#fff" : "transparent",
            color: value === ct ? "#111827" : "#8A94A3",
            boxShadow: value === ct ? "0 1px 3px rgba(16,24,40,0.12)" : "none",
            transition: "all 0.15s",
          }}>
          {ct}
        </button>
      ))}
    </div>
  )
}

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
  const upcomingSchedule = useMemo(() => computeUpcomingSchedule(items, today, 5), [items, today])
  const effectiveMonth = today.slice(0, 7)
  const monthlyRollup = useMemo(
    () => computeMonthlyRollup(items, clientTargets, effectiveMonth, "branding", contentTypeFilter),
    [items, clientTargets, effectiveMonth, contentTypeFilter]
  )
  const brandingRows = useMemo(
    () => computeClientDeliveryStatus(items, clientTargets, effectiveMonth, today, "branding", contentTypeFilter),
    [items, clientTargets, effectiveMonth, today, contentTypeFilter]
  )
  const adsRows = useMemo(
    () => computeClientDeliveryStatus(items, clientTargets, effectiveMonth, today, "ads", contentTypeFilter),
    [items, clientTargets, effectiveMonth, today, contentTypeFilter]
  )
  // How Work Moves reads the stage counts already split by content type on `overview`
  // (overview.videos / overview.posters) — each already combines that content type's
  // Branding and Advertisement activity, so switching the toggle shows both together.
  const flowStages = contentTypeFilter === "video" ? overview.videos : overview.posters

  const makeEditTarget = (kind: DeliveryKind) => (client: string, newTarget: number) =>
    onSetTarget(client, kind, contentTypeFilter, effectiveMonth, newTarget)

  return (
    <div className="flex flex-col gap-[22px]">
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
            <div className="flex items-baseline justify-between flex-wrap gap-3" style={{ margin: "0 0 16px" }}>
              <div>
                <p style={{ fontFamily: "var(--font-jakarta)", fontSize: 11, fontWeight: 700, color: "#8A94A3", textTransform: "uppercase", letterSpacing: "0.08em", margin: "0 0 6px" }}>Where each account stands</p>
                <h2 style={{ fontFamily: "var(--font-jakarta)", fontWeight: 800, fontSize: 19, color: "#111827", margin: 0 }}>Client delivery</h2>
              </div>
              <ContentTypeToggle value={contentTypeFilter} onChange={setContentTypeFilter} />
            </div>

            <div className="flex flex-col" style={{ gap: 24 }}>
              <div>
                <h3 style={{ fontFamily: "var(--font-jakarta)", fontWeight: 800, fontSize: 14, color: "#111827", margin: "0 0 10px" }}>
                  Branding · {contentTypeFilter === "video" ? "Video" : "Poster"}
                </h3>
                <DeliveryStatusTable rows={brandingRows} onEditTarget={makeEditTarget("branding")} />
              </div>
              <div>
                <h3 style={{ fontFamily: "var(--font-jakarta)", fontWeight: 800, fontSize: 14, color: "#111827", margin: "0 0 10px" }}>
                  Advertisement · {contentTypeFilter === "video" ? "Video" : "Poster"}
                </h3>
                <DeliveryStatusTable rows={adsRows} onEditTarget={makeEditTarget("ads")} />
              </div>
            </div>
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
            <p style={{ fontFamily: "var(--font-jakarta)", fontSize: 11, fontWeight: 700, color: "#8A94A3", textTransform: "uppercase", letterSpacing: "0.08em", margin: "0 0 6px" }}>What&apos;s queued next</p>
            <h2 style={{ fontFamily: "var(--font-jakarta)", fontWeight: 800, fontSize: 19, color: "#111827", margin: "0 0 16px" }}>Upcoming schedule</h2>
            <UpcomingSchedule items={upcomingSchedule} onNavigate={onAttentionClick} />
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
