"use client"

// Shared month filter + the neutral toolbar field style behind it. Lives here rather
// than inside media-tracker-client.tsx so the Overview dashboard can use the exact same
// control as the Video/Poster/Ads/Log boards without importing back into its own parent.

import type React from "react"

// Toolbar filters (client/time/day) — distinct from FIELD, which stays neutral for
// modal form inputs. These render above every board (Video/Poster/Ads/Overview), each
// with its own accent color, so a fixed red clashed on the non-video boards. Neutral
// reads correctly next to all of them.
export const FILTER_FIELD: React.CSSProperties = {
  width: "auto", fontSize: 12, fontWeight: 700, color: "#374151",
  background: "#fff",
  border: "1.5px solid #E5E7EB", borderRadius: 10,
  padding: "8px 10px", outline: "none", cursor: "pointer",
}

export function fmtMonthShort(ym: string) {
  const [y, m] = ym.split("-").map(Number)
  return new Date(y, m - 1, 1).toLocaleDateString("en-US", { month: "short", year: "2-digit" })
}

export function MonthSelect({ value, onChange, options, allowAllTime = true, ariaLabel = "Filter by month" }: {
  value: string
  onChange: (v: string) => void
  options: string[]
  // Overview's delivery tables compare against a per-month target, so "All Time" has no
  // meaning there — every other board keeps it.
  allowAllTime?: boolean
  ariaLabel?: string
}) {
  return (
    <select value={value} onChange={e => onChange(e.target.value)} aria-label={ariaLabel}
      style={FILTER_FIELD}>
      {allowAllTime && <option value="all">All Time</option>}
      {options.map(m => <option key={m} value={m}>{fmtMonthShort(m)}</option>)}
    </select>
  )
}
