"use client"

import { useState } from "react"
import { ChevronLeft, ChevronRight } from "lucide-react"
import { todayIST } from "@/lib/utils/ist-date"
import { buildMonthGrid, type ScheduleEntry } from "@/lib/media-tracker/schedule"
import { ScheduleRow } from "./schedule-list"

const WEEKDAY_LABELS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"]
const ACCENT = "#0D9488"

export function ScheduleCalendar({ entries }: { entries: ScheduleEntry[] }) {
  const today = todayIST()
  const [year, setYear] = useState(() => Number(today.slice(0, 4)))
  const [month, setMonth] = useState(() => Number(today.slice(5, 7))) // 1-12
  const [selectedDate, setSelectedDate] = useState<string | null>(null)

  const grid = buildMonthGrid(year, month, entries, today)
  const monthLabel = new Date(year, month - 1, 1).toLocaleDateString("en-US", { month: "long", year: "numeric" })
  const selectedDay = grid.find(d => d.date === selectedDate)

  function goPrevMonth() {
    if (month === 1) { setYear(y => y - 1); setMonth(12) } else { setMonth(m => m - 1) }
    setSelectedDate(null)
  }
  function goNextMonth() {
    if (month === 12) { setYear(y => y + 1); setMonth(1) } else { setMonth(m => m + 1) }
    setSelectedDate(null)
  }
  function goToday() {
    setYear(Number(today.slice(0, 4)))
    setMonth(Number(today.slice(5, 7)))
    setSelectedDate(today)
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center justify-between">
        <button onClick={goPrevMonth} aria-label="Previous month"
          style={{ border: "none", background: "none", cursor: "pointer", padding: 6 }}>
          <ChevronLeft size={16} />
        </button>
        <div className="flex items-center gap-2">
          <p className="text-[13px] font-bold" style={{ color: "#111827", margin: 0 }}>{monthLabel}</p>
          <button onClick={goToday}
            className="text-[11px] font-bold px-2 py-1 rounded-lg"
            style={{ border: "1px solid #E5E7EB", background: "#fff", cursor: "pointer", color: "#374151" }}>
            Today
          </button>
        </div>
        <button onClick={goNextMonth} aria-label="Next month"
          style={{ border: "none", background: "none", cursor: "pointer", padding: 6 }}>
          <ChevronRight size={16} />
        </button>
      </div>

      <div className="grid grid-cols-7 gap-1">
        {WEEKDAY_LABELS.map(w => (
          <p key={w} className="text-[10px] font-bold uppercase text-center" style={{ color: "#9CA3AF", margin: 0 }}>{w}</p>
        ))}
        {grid.map(day => (
          <div key={day.date} className="relative group">
            <button onClick={() => setSelectedDate(day.date === selectedDate ? null : day.date)}
              className="w-full flex flex-col items-center rounded-lg p-1.5"
              style={{
                border: day.isToday ? `1.5px solid ${ACCENT}` : "1px solid #F3F4F6",
                background: day.date === selectedDate ? `${ACCENT}14` : "#fff",
                opacity: day.inCurrentMonth ? 1 : 0.35,
                cursor: "pointer", minHeight: 52,
              }}>
              <span className="text-[11px] font-bold" style={{ color: "#374151" }}>{Number(day.date.slice(8, 10))}</span>
              {day.entries.length > 0 && (
                <span className="text-[9px] font-black rounded-full px-1.5"
                  style={{ background: `${ACCENT}20`, color: ACCENT, marginTop: 2 }}>
                  {day.entries.length}
                </span>
              )}
            </button>
            {/* Hover preview — a quick look at what's due that day without clicking in.
                Click still opens the full agenda below, with its actions (Mark Posted etc.);
                this is read-only, just the client/time/title. */}
            {day.entries.length > 0 && (
              <div className="hidden group-hover:flex flex-col gap-1 absolute left-1/2 -translate-x-1/2 top-full mt-1 rounded-xl p-2"
                style={{ background: "#111827", width: 200, zIndex: 20, boxShadow: "0 8px 20px rgba(0,0,0,0.25)" }}>
                {day.entries.map(e => (
                  <div key={e.id} className="flex items-start gap-1.5">
                    <span className="rounded-full flex-shrink-0" style={{ width: 6, height: 6, marginTop: 4, background: e.accent }} />
                    <div style={{ minWidth: 0 }}>
                      <p className="text-[11px] font-bold truncate" style={{ color: "#fff", margin: 0 }}>{e.title}</p>
                      <p className="text-[10px]" style={{ color: "#9CA3AF", margin: 0 }}>
                        {e.client}{e.time ? ` · ${e.time}` : ""}
                      </p>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        ))}
      </div>

      {selectedDay && (
        <div className="flex flex-col gap-2">
          <p className="text-[11px] font-bold uppercase tracking-[0.06em]" style={{ color: "#9CA3AF", margin: 0 }}>
            {new Date(selectedDay.date + "T00:00:00").toLocaleDateString("en-US", { weekday: "long", month: "short", day: "numeric" })}
          </p>
          {selectedDay.entries.length === 0 ? (
            <p className="text-[12px]" style={{ color: "#9CA3AF" }}>Nothing scheduled.</p>
          ) : selectedDay.entries.map(e => <ScheduleRow key={e.id} entry={e} />)}
        </div>
      )}
    </div>
  )
}
