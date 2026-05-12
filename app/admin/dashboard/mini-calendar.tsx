"use client"

import { useState } from "react"
import { ChevronLeft, ChevronRight } from "lucide-react"

type Props = {
  leaveMap: Record<string, string[]>
  today: string
  initYear: number
  initMonth: number
}

export default function MiniCalendar({ leaveMap, today, initYear, initMonth }: Props) {
  const [year, setYear]   = useState(initYear)
  const [month, setMonth] = useState(initMonth)

  const daysInMonth = new Date(year, month + 1, 0).getDate()
  const firstDay    = new Date(year, month, 1).getDay()
  const monthLabel  = new Date(year, month, 1).toLocaleString("en-US", { month: "long", year: "numeric" })

  function prev() {
    if (month === 0) { setYear(y => y - 1); setMonth(11) }
    else setMonth(m => m - 1)
  }
  function next() {
    if (month === 11) { setYear(y => y + 1); setMonth(0) }
    else setMonth(m => m + 1)
  }

  const btnStyle: React.CSSProperties = {
    width: 26, height: 26, borderRadius: 7, border: "1px solid #E5E7EB",
    background: "#F9FAFB", display: "flex", alignItems: "center", justifyContent: "center",
    cursor: "pointer",
  }

  return (
    <div>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 12 }}>
        <button onClick={prev} style={btnStyle}>
          <ChevronLeft size={13} style={{ color: "#6B7280" }} />
        </button>
        <span style={{ fontSize: 12, fontWeight: 700, color: "#111827" }}>{monthLabel}</span>
        <button onClick={next} style={btnStyle}>
          <ChevronRight size={13} style={{ color: "#6B7280" }} />
        </button>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(7, 1fr)", gap: 2, marginBottom: 4 }}>
        {["S","M","T","W","T","F","S"].map((d, i) => (
          <div key={i} style={{ textAlign: "center", fontSize: 9, fontWeight: 700, color: "#9CA3AF", paddingBottom: 3 }}>{d}</div>
        ))}
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(7, 1fr)", gap: 2 }}>
        {Array.from({ length: firstDay }, (_, i) => <div key={`e${i}`} />)}
        {Array.from({ length: daysInMonth }, (_, i) => {
          const day    = i + 1
          const dayStr = `${year}-${String(month + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`
          const isToday   = dayStr === today
          const hasLeave  = (leaveMap[dayStr]?.length ?? 0) > 0
          const dow       = new Date(dayStr + "T12:00:00").getDay()
          const isWeekend = dow === 0 || dow === 6

          return (
            <div key={day} style={{
              height: 30, borderRadius: 6, display: "flex", flexDirection: "column",
              alignItems: "center", justifyContent: "center", position: "relative",
              background: isToday ? "#DE1A1A" : hasLeave ? "rgba(217,119,6,0.08)" : "transparent",
            }}>
              <span style={{
                fontSize: 10, fontWeight: isToday ? 800 : 500,
                color: isToday ? "#FFFFFF" : isWeekend ? "#D1D5DB" : "#374151",
              }}>{day}</span>
              {hasLeave && !isToday && (
                <div style={{ width: 4, height: 4, borderRadius: "50%", background: "#D97706", position: "absolute", bottom: 2 }} />
              )}
            </div>
          )
        })}
      </div>

      <div style={{ display: "flex", alignItems: "center", gap: 10, marginTop: 10 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
          <div style={{ width: 10, height: 10, borderRadius: 3, background: "#DE1A1A" }} />
          <span style={{ fontSize: 10, color: "#6B7280" }}>Today</span>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
          <div style={{ width: 5, height: 5, borderRadius: "50%", background: "#D97706" }} />
          <span style={{ fontSize: 10, color: "#6B7280" }}>On Leave</span>
        </div>
      </div>
    </div>
  )
}
