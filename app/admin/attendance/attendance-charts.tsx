"use client"

import dynamic from "next/dynamic"

// recharts is only needed for the two marks themselves, so it is code-split away here.
// Everything else on this page — the donut's centre total and the legend's counts and
// percentages — is plain HTML and renders immediately, which matters because those
// numbers ARE the content; blanking them behind a chart library would be a regression.
// Each placeholder reserves the exact box its mark occupies, so nothing shifts on load.
const DonutPie = dynamic(() => import("./attendance-chart-marks").then(m => m.DonutPie), {
  ssr: false,
  loading: () => (
    <div style={{ position: "absolute", inset: 0, borderRadius: "50%", border: "16px solid #F3F4F6" }} />
  ),
})

const TrendArea = dynamic(() => import("./attendance-chart-marks").then(m => m.TrendArea), {
  ssr: false,
  loading: () => <div style={{ width: "100%", height: "100%" }} />,
})

// ── Attendance Overview Donut ─────────────────────────────────────────────────
type DonutProps = { present: number; notLogged: number; absent: number; total: number }

export function AttendanceDonut({ present, notLogged, absent, total }: DonutProps) {
  const slices = [
    { name: "Present",      value: present,   color: "#DE1A1A" },
    { name: "Not Logged In",value: notLogged,  color: "#F59E0B" },
    { name: "On Leave",     value: absent,     color: "#0F4C4C" },
  ]
  const data = slices.filter(s => s.value > 0)
  const display = data.length === 0 ? [{ name: "No Data", value: 1, color: "#E5E7EB" }] : data

  return (
    <div className="flex flex-wrap items-center gap-4">
      <div style={{ position: "relative", width: 96, height: 96, flexShrink: 0 }}>
        <DonutPie display={display} showTooltip={data.length > 0} />
        <div style={{ position: "absolute", inset: 0, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", pointerEvents: "none" }}>
          <span style={{ fontSize: 18, fontWeight: 900, color: "#111827", lineHeight: 1 }}>{total}</span>
          <span style={{ fontSize: 8, color: "#0F4C4C", fontWeight: 700, marginTop: 1 }}>Total</span>
        </div>
      </div>

      <div className="flex-1 min-w-0" style={{ display: "flex", flexDirection: "column", gap: 10 }}>
        {slices.map(s => (
          <div key={s.name} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 7, minWidth: 0 }}>
              <div style={{ width: 9, height: 9, borderRadius: "50%", background: s.color, flexShrink: 0 }} />
              <span style={{ fontSize: 12, color: "#0F4C4C", fontWeight: 600, whiteSpace: "nowrap" }}>{s.name}</span>
            </div>
            <span style={{ fontSize: 12, fontWeight: 700, color: "#111827", whiteSpace: "nowrap", flexShrink: 0 }}>
              {s.value} ({total > 0 ? Math.round((s.value / total) * 100) : 0}%)
            </span>
          </div>
        ))}
      </div>
    </div>
  )
}

// ── Weekly Trend AreaChart ────────────────────────────────────────────────────
type TrendPoint = { day: string; count: number }

export function WeeklyTrendChart({ data }: { data: TrendPoint[] }) {
  return (
    <div className="w-full" style={{ height: 130 }}>
      <TrendArea data={data} />
    </div>
  )
}
