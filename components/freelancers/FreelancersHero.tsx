"use client"

import Image from "next/image"

export type FreelancersHeroMetric = { label: string; value: string; color: string }

// Shared hero banner for the Freelancers page — badge, title, subtitle,
// illustration, and a row of metric pills. Used identically by both the
// Member and Admin Freelancers pages so they can't visually drift apart;
// each caller only supplies its own stats.
export function FreelancersHero({
  badgeLabel,
  title,
  subtitle,
  metrics,
}: {
  badgeLabel: string
  title: string
  subtitle: string
  metrics: FreelancersHeroMetric[]
}) {
  const heroPill = (m: FreelancersHeroMetric) => (
    <div key={m.label} style={{
      padding: "8px 16px", borderRadius: 12,
      background: "rgba(255,255,255,0.1)",
      border: "1px solid rgba(255,255,255,0.25)",
    }}>
      <p style={{ fontSize: 17, fontWeight: 900, color: m.color, margin: 0, fontFamily: "var(--font-jakarta)", lineHeight: 1.2, fontVariantNumeric: "tabular-nums" }}>{m.value}</p>
      <p style={{ fontSize: 10, color: "rgba(255,255,255,0.65)", fontWeight: 700, margin: 0, textTransform: "uppercase", letterSpacing: "0.06em", whiteSpace: "nowrap" }}>{m.label}</p>
    </div>
  )

  return (
    <div style={{ background: "linear-gradient(135deg, #DE1A1A 0%, #8B1212 55%, #1A0808 100%)", borderRadius: 20, padding: "16px 18px", boxShadow: "0 8px 32px rgba(180,0,0,0.35)", position: "relative", overflow: "hidden", minHeight: 150 }}>
      <div style={{ position: "absolute", top: -50, right: -30, width: 200, height: 200, borderRadius: "50%", background: "rgba(255,255,255,0.05)", pointerEvents: "none" }} />
      <div style={{ position: "absolute", bottom: -40, left: 60, width: 150, height: 150, borderRadius: "50%", background: "rgba(255,255,255,0.04)", pointerEvents: "none" }} />

      <div className="flex flex-col gap-3" style={{ position: "relative", zIndex: 2 }}>
        <div className="flex items-start lg:items-center justify-between gap-4">
          <div className="max-w-[58%] lg:max-w-[34%]" style={{ flexShrink: 0 }}>
            <span style={{ display: "inline-flex", alignItems: "center", gap: 6, fontSize: 11, fontWeight: 700, padding: "4px 12px", borderRadius: 99, background: "rgba(255,255,255,0.15)", color: "#fff", marginBottom: 10, border: "1px solid rgba(255,255,255,0.2)", letterSpacing: "0.04em" }}>
              👥 {badgeLabel}
            </span>
            <h1 style={{ fontSize: 26, fontWeight: 900, color: "#fff", fontFamily: "var(--font-jakarta)", margin: "0 0 4px" }}>{title}</h1>
            <p style={{ fontSize: 12, color: "rgba(255,255,255,0.7)", margin: 0 }}>{subtitle}</p>
          </div>

          <div className="lg:hidden w-[92px] shrink-0" style={{ pointerEvents: "none" }}>
            <Image src="/brand/freelancers-hero.png" alt="" width={380} height={253}
              style={{ objectFit: "contain", objectPosition: "center", display: "block", width: "100%", height: "auto" }} priority />
          </div>
          <div className="hidden lg:block lg:w-[380px] shrink-0" style={{ pointerEvents: "none" }}>
            <Image src="/brand/freelancers-hero.png" alt="" width={380} height={253}
              style={{ objectFit: "contain", objectPosition: "center", display: "block", width: "100%", height: "auto", maxHeight: 150 }} priority />
          </div>

          <div className="hidden lg:flex flex-wrap justify-end gap-2.5" style={{ flexShrink: 0 }}>
            {metrics.map(heroPill)}
          </div>
        </div>

        <div className="flex lg:hidden flex-wrap gap-2.5">
          {metrics.map(heroPill)}
        </div>
      </div>
    </div>
  )
}
