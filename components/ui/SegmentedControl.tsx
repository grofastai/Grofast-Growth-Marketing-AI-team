"use client"

import type { ReactNode } from "react"

// Pill-track segmented control with an animated sliding "thumb" behind the
// active option. Used by the Expenses add-drawer to switch between
// Travel / Client / Common without leaving the drawer.
export function SegmentedControl<T extends string>({
  options,
  value,
  onChange,
}: {
  options: { value: T; label: string; icon?: ReactNode }[]
  value: T
  onChange: (v: T) => void
}) {
  const activeIndex = Math.max(0, options.findIndex(o => o.value === value))

  return (
    <div style={{ position: "relative", display: "flex", background: "rgba(0,0,0,0.04)", borderRadius: 14, padding: 4 }}>
      <div style={{
        position: "absolute", top: 4, bottom: 4, left: 4,
        width: `calc(${100 / options.length}% - 4px)`,
        transform: `translateX(${activeIndex * 100}%)`,
        transition: "transform 0.2s ease",
        background: "rgba(255,255,255,0.85)",
        backdropFilter: "blur(8px)",
        borderRadius: 11,
        boxShadow: "0 2px 8px rgba(0,0,0,0.08)",
      }} />
      {options.map(o => (
        <button
          key={o.value}
          type="button"
          onClick={() => onChange(o.value)}
          style={{
            position: "relative", zIndex: 1, flex: 1,
            display: "flex", alignItems: "center", justifyContent: "center", gap: 6,
            padding: "7px 8px", border: "none", background: "transparent", cursor: "pointer",
            fontSize: 12, fontWeight: 800,
            color: o.value === value ? "#111111" : "#6B7280",
          }}
        >
          {o.icon}
          {o.label}
        </button>
      ))}
    </div>
  )
}
