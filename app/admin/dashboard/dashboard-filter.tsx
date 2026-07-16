"use client"

import { useRouter, usePathname } from "next/navigation"
import { useState } from "react"
import { Calendar } from "lucide-react"
import { todayIST } from "@/lib/utils/ist-date"

type FilterType = "today" | "yesterday" | "custom"

export default function DashboardFilterBar({
  currentFilter,
  from,
  to,
}: {
  currentFilter: FilterType
  from?: string
  to?: string
}) {
  const router   = useRouter()
  const pathname = usePathname()
  const [showCustom, setShowCustom] = useState(currentFilter === "custom")
  const [customFrom, setCustomFrom] = useState(from ?? "")
  const [customTo, setCustomTo]     = useState(to ?? "")

  function apply(filter: FilterType, f?: string, t?: string) {
    const p = new URLSearchParams()
    p.set("filter", filter)
    if (filter === "custom" && f && t) { p.set("from", f); p.set("to", t) }
    router.replace(`${pathname}?${p.toString()}`)
  }

  return (
    <div className="flex items-center gap-2 flex-wrap">
      {(["yesterday", "today"] as FilterType[]).map((f) => (
        <button key={f} type="button"
          onClick={() => { setShowCustom(false); apply(f) }}
          className="px-4 py-2 rounded-lg text-[12px] font-bold capitalize transition-all"
          style={currentFilter === f && !showCustom
            ? { background: "#de1a1a", color: "#FFFFFF" }
            : { background: "rgba(255,255,255,0.12)", color: "rgba(255,255,255,0.7)", border: "1px solid rgba(255,255,255,0.15)" }
          }>
          {f.charAt(0).toUpperCase() + f.slice(1)}
        </button>
      ))}

      <button type="button"
        onClick={() => setShowCustom((v) => !v)}
        className="flex items-center gap-1.5 px-4 py-2 rounded-lg text-[12px] font-bold transition-all"
        style={currentFilter === "custom"
          ? { background: "#de1a1a", color: "#FFFFFF" }
          : { background: "rgba(255,255,255,0.12)", color: "rgba(255,255,255,0.7)", border: "1px solid rgba(255,255,255,0.15)" }
        }>
        <Calendar size={12} /> Custom Range
      </button>

      {showCustom && (
        <div className="flex items-center gap-2 w-full mt-2">
          <input type="date" min="2025-01-01" max={todayIST()} value={customFrom} onChange={(e) => setCustomFrom(e.target.value)}
            className="px-3 py-2 rounded-lg text-[12px]"
            style={{ background: "rgba(255,255,255,0.12)", border: "1px solid rgba(255,255,255,0.2)", color: "#FFFFFF", colorScheme: "dark" }} />
          <span className="text-[12px]" style={{ color: "rgba(255,255,255,0.5)" }}>to</span>
          <input type="date" min={customFrom || "2025-01-01"} max={todayIST()} value={customTo} onChange={(e) => setCustomTo(e.target.value)}
            className="px-3 py-2 rounded-lg text-[12px]"
            style={{ background: "rgba(255,255,255,0.12)", border: "1px solid rgba(255,255,255,0.2)", color: "#FFFFFF", colorScheme: "dark" }} />
          <button type="button"
            onClick={() => customFrom && customTo && apply("custom", customFrom, customTo)}
            className="px-4 py-2 rounded-lg text-[12px] font-bold"
            style={{ background: "#FFFFFF", color: "#B91C1C" }}>
            Apply
          </button>
        </div>
      )}
    </div>
  )
}
