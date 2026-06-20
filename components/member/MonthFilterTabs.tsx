"use client"

import { useState, useRef, useEffect } from "react"
import { useRouter } from "next/navigation"
import Link from "next/link"
import { ChevronDown } from "lucide-react"

const MONTHS = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"]

export default function MonthFilterTabs({
  mode,
  customParam,
}: {
  mode: "this" | "last" | "all" | "custom"
  customParam?: string
}) {
  const router = useRouter()
  const [showPicker, setShowPicker] = useState(false)
  const pickerRef = useRef<HTMLDivElement>(null)

  const now = new Date()
  const [pickerYear, setPickerYear] = useState(() => {
    if (customParam && /^\d{4}-\d{2}$/.test(customParam)) return Number(customParam.split("-")[0])
    return now.getFullYear()
  })
  const [pickerMonth, setPickerMonth] = useState(() => {
    if (customParam && /^\d{4}-\d{2}$/.test(customParam)) return Number(customParam.split("-")[1])
    return now.getMonth() + 1
  })

  useEffect(() => {
    function handler(e: MouseEvent) {
      if (pickerRef.current && !pickerRef.current.contains(e.target as Node)) setShowPicker(false)
    }
    document.addEventListener("mousedown", handler)
    return () => document.removeEventListener("mousedown", handler)
  }, [])

  function applyCustom() {
    router.push(`/member/dashboard?month=${pickerYear}-${String(pickerMonth).padStart(2, "0")}`)
    setShowPicker(false)
  }

  const yearRange = Array.from({ length: 5 }, (_, i) => now.getFullYear() - i)

  const customLabel = mode === "custom" && customParam
    ? `${MONTHS[Number(customParam.split("-")[1]) - 1]} ${customParam.split("-")[0]}`
    : "Custom"

  return (
    <div className="relative" ref={pickerRef}>
      <div className="flex items-center gap-0 ml-2 rounded-xl overflow-hidden" style={{ border: "1px solid #E8E9EF" }}>
        {([
          { label: "All Time",   href: "/member/dashboard?month=all",  key: "all"  },
          { label: "This Month", href: "/member/dashboard",            key: "this" },
          { label: "Last Month", href: "/member/dashboard?month=last", key: "last" },
        ] as const).map(t => (
          <Link key={t.key} href={t.href}
            className="text-[10px] font-bold px-3 py-1.5 transition-colors"
            style={{ background: mode === t.key ? "#de1a1a" : "transparent", color: mode === t.key ? "#fff" : "#6B7280" }}>
            {t.label}
          </Link>
        ))}
        <button
          onClick={() => setShowPicker(v => !v)}
          className="flex items-center gap-1 text-[10px] font-bold px-3 py-1.5 transition-colors"
          style={{ background: mode === "custom" ? "#de1a1a" : "transparent", color: mode === "custom" ? "#fff" : "#6B7280" }}>
          {customLabel}
          <ChevronDown size={9} />
        </button>
      </div>

      {showPicker && (
        <div className="absolute top-full mt-1.5 left-2 z-50 rounded-xl p-3"
          style={{ background: "#FFFFFF", border: "1px solid #E8E9EF", boxShadow: "0 8px 24px rgba(0,0,0,0.12)", minWidth: 190 }}>
          <p className="text-[11px] font-bold mb-2.5" style={{ color: "#111" }}>Choose Month</p>
          <div className="flex gap-2 mb-3">
            <select value={pickerMonth} onChange={e => setPickerMonth(Number(e.target.value))}
              className="flex-1 text-[12px] px-2 py-1.5 rounded-lg outline-none bg-white"
              style={{ border: "1px solid #E8E9EF", color: "#111" }}>
              {MONTHS.map((m, i) => <option key={i} value={i + 1}>{m}</option>)}
            </select>
            <select value={pickerYear} onChange={e => setPickerYear(Number(e.target.value))}
              className="flex-1 text-[12px] px-2 py-1.5 rounded-lg outline-none bg-white"
              style={{ border: "1px solid #E8E9EF", color: "#111" }}>
              {yearRange.map(y => <option key={y} value={y}>{y}</option>)}
            </select>
          </div>
          <button onClick={applyCustom}
            className="w-full text-[11px] font-bold py-1.5 rounded-lg"
            style={{ background: "#de1a1a", color: "#FFFFFF" }}>
            Apply
          </button>
        </div>
      )}
    </div>
  )
}
