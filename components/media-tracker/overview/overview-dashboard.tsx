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
import { MonthSelect } from "../month-select"
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
  overview, items, shoots, ads, clientTargets, clients, today,
  onAttentionClick, onSetTarget,
}: {
  overview: Overview
  items: ContentItem[]
  shoots: Shoot[]
  ads: Ad[]
  clientTargets: ClientTarget[]
  clients: { id: string; name: string }[]
  today: string
  onAttentionClick: (target: AttentionItem["target"]) => void
  onSetTarget: (clientName: string, kind: "branding" | "ads", contentType: "video" | "poster", month: string, newTarget: number) => Promise<void>
}) {
  const [contentTypeFilter, setContentTypeFilter] = useState<ContentTypeFilter>("video")
  // Delivery tables + Monthly Progress ring are scoped to one month at a time. Defaults to
  // the current month; picking another re-reads targets and published counts for it (and
  // makes the inline Target edit write to that month's target row).
  const [selectedMonth, setSelectedMonth] = useState<string>(() => today.slice(0, 7))

  const todayAndAllTime = useMemo(() => computeTodayAndAllTime({ items, shoots, ads, today }), [items, shoots, ads, today])
  const contentPipeline = useMemo(() => computeContentPipeline({ items, shoots }), [items, shoots])
  const upcomingSchedule = useMemo(() => computeUpcomingSchedule(items, today, 5), [items, today])
  // Every month worth looking at: anything published, anything with a target set, plus the
  // current month so the default selection always has a matching option.
  const monthOptions = useMemo(() => {
    const months = new Set<string>([today.slice(0, 7)])
    for (const i of items) for (const p of i.posts) months.add(p.posted_date.slice(0, 7))
    for (const t of clientTargets) months.add(t.month)
    return Array.from(months).sort().reverse()
  }, [items, clientTargets, today])
  const effectiveMonth = selectedMonth
  const monthlyRollup = useMemo(
    () => computeMonthlyRollup(items, clientTargets, effectiveMonth, "branding", contentTypeFilter),
    [items, clientTargets, effectiveMonth, contentTypeFilter]
  )
  // computeClientDeliveryStatus derives its client list from content_items/content_client_targets
  // client_name text, with no idea which clients are marked Past — so a Past client with any
  // leftover item/target still surfaces here unless filtered back down to the active roster.
  const activeClientNames = useMemo(() => new Set(clients.map(c => c.name)), [clients])
  const brandingRows = useMemo(
    () => computeClientDeliveryStatus(items, clientTargets, effectiveMonth, today, "branding", contentTypeFilter)
      .filter(row => activeClientNames.has(row.client)),
    [items, clientTargets, effectiveMonth, today, contentTypeFilter, activeClientNames]
  )
  const adsRows = useMemo(
    () => computeClientDeliveryStatus(items, clientTargets, effectiveMonth, today, "ads", contentTypeFilter)
      .filter(row => activeClientNames.has(row.client)),
    [items, clientTargets, effectiveMonth, today, contentTypeFilter, activeClientNames]
  )
  // How Work Moves reads the stage counts already split by content type on `overview`
  // (overview.videos / overview.posters) — each already combines that content type's
  // Branding and Advertisement activity, so switching the toggle shows both together.
  const flowStages = contentTypeFilter === "video" ? overview.videos : overview.posters

  const makeEditTarget = (kind: DeliveryKind) => (client: string, newTarget: number) =>
    onSetTarget(client, kind, contentTypeFilter, effectiveMonth, newTarget)

  return (
    <div className="flex flex-col gap-[22px]">
      <div className="grid gap-6 grid-cols-1 md:grid-cols-[296px_1fr] items-stretch">
        <div className="flex flex-col" style={{ gap: 24 }}>
          <OverviewRail
            attention={overview.attention}
            today={todayAndAllTime}
            monthlyRollup={monthlyRollup}
            onAttentionClick={onAttentionClick}
            monthLabel={fmtMonth(effectiveMonth)}
          />

          <section className="flex flex-col" style={{ flex: 1 }}>
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
        </div>

        <main className="flex flex-col gap-[32px] min-w-0">
          <section>
            <div className="flex items-center justify-end flex-wrap gap-3" style={{ margin: "0 0 16px" }}>
              <MonthSelect value={selectedMonth} onChange={setSelectedMonth} options={monthOptions}
                allowAllTime={false} ariaLabel="Filter delivery status by month" />
              <ContentTypeToggle value={contentTypeFilter} onChange={setContentTypeFilter} />
            </div>

            <div className="flex flex-col" style={{ gap: 24 }}>
              <div>
                <h3 style={{ fontFamily: "var(--font-jakarta)", fontWeight: 800, fontSize: 14, margin: "0 0 10px" }}>
                  <span style={{ color: "#7C3AED" }}>Branding</span>
                  <span style={{ color: "#8A94A3" }}> · {contentTypeFilter === "video" ? "Video" : "Poster"}</span>
                </h3>
                <DeliveryStatusTable rows={brandingRows} onEditTarget={makeEditTarget("branding")} />
              </div>
              <div>
                <h3 style={{ fontFamily: "var(--font-jakarta)", fontWeight: 800, fontSize: 14, margin: "0 0 10px" }}>
                  <span style={{ color: "#2563EB" }}>Advertisement</span>
                  <span style={{ color: "#8A94A3" }}> · {contentTypeFilter === "video" ? "Video" : "Poster"}</span>
                </h3>
                <DeliveryStatusTable rows={adsRows} onEditTarget={makeEditTarget("ads")} />
              </div>
            </div>
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
