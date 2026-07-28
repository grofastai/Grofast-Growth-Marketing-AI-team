"use client"

import { todayIST } from "@/lib/utils/ist-date"
import { groupSchedule, type ScheduleEntry } from "@/lib/media-tracker/schedule"

// One row, reused by both ScheduleList and ScheduleCalendar's day-expansion panel —
// so the two views never visually diverge on what a scheduled entry looks like.
export function ScheduleRow({ entry }: { entry: ScheduleEntry }) {
  return (
    <div className="flex items-center justify-between gap-3 rounded-xl p-3 mb-2"
      style={{ background: "#fff", border: "1px solid #E5E7EB", borderLeft: `4px solid ${entry.accent}` }}>
      <div style={{ minWidth: 0 }}>
        <p className="text-[13px] font-bold truncate" style={{ color: "#111827", margin: 0 }}>{entry.title}</p>
        <p className="text-[11px]" style={{ color: "#6B7280", margin: "2px 0 0" }}>
          {entry.client}{entry.time ? ` · ${entry.time}` : ""}
        </p>
      </div>
      <div className="flex gap-1.5 flex-shrink-0">
        {entry.actions.map(a => (
          <button key={a.label} onClick={a.onClick}
            className="text-[11px] font-bold px-2.5 py-1 rounded-lg hover:opacity-90"
            style={{ border: "none", cursor: "pointer", background: a.danger ? "#B91C1C" : "#15803D", color: "#fff" }}>
            {a.label}
          </button>
        ))}
      </div>
    </div>
  )
}

export function ScheduleList({ entries }: { entries: ScheduleEntry[] }) {
  const groups = groupSchedule(entries, todayIST())

  if (groups.length === 0) {
    return (
      <p className="text-[13px]" style={{ color: "#9CA3AF", padding: "24px 0", textAlign: "center" }}>
        Nothing scheduled.
      </p>
    )
  }

  return (
    <div className="flex flex-col gap-4">
      {groups.map(g => (
        <div key={g.heading}>
          <p className="text-[11px] font-bold uppercase tracking-[0.06em]"
            style={{ color: g.heading === "Overdue" ? "#DC2626" : "#9CA3AF", margin: "0 0 6px" }}>
            {g.heading}
          </p>
          {g.entries.map(e => <ScheduleRow key={e.id} entry={e} />)}
        </div>
      ))}
    </div>
  )
}
