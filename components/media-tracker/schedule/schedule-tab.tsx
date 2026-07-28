"use client"

import { useState } from "react"
import { List, CalendarDays } from "lucide-react"
import type { ScheduleEntry } from "@/lib/media-tracker/schedule"
import { ScheduleList } from "./schedule-list"
import { ScheduleCalendar } from "./schedule-calendar"

// Duplicated from media-tracker-client.tsx's FILTER_FIELD rather than imported — this
// file's parent (media-tracker-client.tsx) imports ScheduleTab, so importing back from
// it here would create a circular import. It's five lines of style tokens, not logic.
const FILTER_FIELD: React.CSSProperties = {
  width: "auto", fontSize: 12, fontWeight: 700, color: "#374151",
  background: "#fff",
  border: "1.5px solid #E5E7EB", borderRadius: 10,
  padding: "8px 10px", outline: "none", cursor: "pointer",
}

const ACCENT = "#0D9488"

export function ScheduleTab({ entries, activeClientOptions, pastClientOptions }: {
  entries: ScheduleEntry[]
  activeClientOptions: string[]
  pastClientOptions: string[]
}) {
  const [view, setView] = useState<"list" | "calendar">("list")
  const [clientFilter, setClientFilter] = useState("all")

  const filtered = clientFilter === "all" ? entries : entries.filter(e => e.client === clientFilter)

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <select value={clientFilter} onChange={e => setClientFilter(e.target.value)} style={FILTER_FIELD}>
          <option value="all">All Clients</option>
          {activeClientOptions.map(c => <option key={c} value={c}>{c}</option>)}
          {pastClientOptions.length > 0 && (
            <optgroup label="📁 Past Clients">
              {pastClientOptions.map(c => <option key={c} value={c}>{c}</option>)}
            </optgroup>
          )}
        </select>

        <div className="flex gap-1 rounded-xl p-1" style={{ background: "#F1F5F9" }}>
          <button onClick={() => setView("list")}
            className="flex items-center gap-1.5 text-[11px] font-bold px-3 py-1.5 rounded-lg"
            style={{ border: "none", cursor: "pointer", background: view === "list" ? "#fff" : "transparent", color: view === "list" ? ACCENT : "#64748B" }}>
            <List size={13} /> List
          </button>
          <button onClick={() => setView("calendar")}
            className="flex items-center gap-1.5 text-[11px] font-bold px-3 py-1.5 rounded-lg"
            style={{ border: "none", cursor: "pointer", background: view === "calendar" ? "#fff" : "transparent", color: view === "calendar" ? ACCENT : "#64748B" }}>
            <CalendarDays size={13} /> Calendar
          </button>
        </div>
      </div>

      {view === "list" ? <ScheduleList entries={filtered} /> : <ScheduleCalendar entries={filtered} />}
    </div>
  )
}
