"use client"

import { useMemo } from "react"
import { ChevronDown, Search as SearchIcon, Filter as FilterIcon } from "lucide-react"
import { computeTodayAndAllTime, type AttentionItem, type Overview } from "@/lib/media-tracker/overview"
import { computeMonthlyBrandingRollup, computeClientDeliveryStatus } from "@/lib/media-tracker/delivery-status"
import { OverviewRail } from "./overview-rail"
import { DeliveryStatusTable } from "./delivery-status-table"
import { WorkFlow } from "./work-flow"
import type { ContentItem, Shoot, Ad, ClientTarget } from "@/components/media-tracker/media-tracker-client"

function fmtMonth(ym: string): string {
  const [y, m] = ym.split("-").map(Number)
  return new Date(y, m - 1, 1).toLocaleDateString("en-US", { month: "long", year: "numeric" })
}

export function OverviewDashboard({
  overview, items, shoots, ads, clientTargets, today,
  monthFilter, onMonthFilterChange, monthOptions,
  onAttentionClick,
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
}) {
  const todayAndAllTime = useMemo(() => computeTodayAndAllTime({ items, shoots, ads, today }), [items, shoots, ads, today])
  const effectiveMonth = monthFilter === "all" ? today.slice(0, 7) : monthFilter
  const monthlyRollup = useMemo(
    () => computeMonthlyBrandingRollup(items, clientTargets, effectiveMonth),
    [items, clientTargets, effectiveMonth]
  )
  const deliveryRows = useMemo(
    () => computeClientDeliveryStatus(items, clientTargets, effectiveMonth, today),
    [items, clientTargets, effectiveMonth, today]
  )

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
            <h2 style={{ fontFamily: "var(--font-jakarta)", fontWeight: 800, fontSize: 19, color: "#111827", margin: "0 0 16px" }}>Client delivery — Branding</h2>
            <DeliveryStatusTable rows={deliveryRows} />
          </section>

          <section>
            <p style={{ fontFamily: "var(--font-jakarta)", fontSize: 11, fontWeight: 700, color: "#8A94A3", textTransform: "uppercase", letterSpacing: "0.08em", margin: "0 0 6px" }}>From shoot to published</p>
            <h2 style={{ fontFamily: "var(--font-jakarta)", fontWeight: 800, fontSize: 19, color: "#111827", margin: "0 0 16px" }}>How work moves</h2>
            <WorkFlow
              shoots={overview.shoots.scheduled}
              editing={overview.videos.ready_to_edit + overview.videos.edited + overview.posters.ready_to_edit + overview.posters.edited}
              readyToPublish={overview.videos.branding_ready + overview.posters.branding_ready}
              scheduled={overview.posting.brandingWaiting + overview.posting.adsWaiting}
              postedAllTime={todayAndAllTime.postedAllTime}
              usedInAdsAllTime={todayAndAllTime.usedInAdsAllTime}
              adsInTestingCount={todayAndAllTime.adsInTestingCount}
              overdueBrandingCount={todayAndAllTime.overdueBrandingCount}
            />
          </section>
        </main>
      </div>
    </div>
  )
}
