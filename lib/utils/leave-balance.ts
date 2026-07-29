// Single source of truth for "how many leave days has this person used" —
// called by the Leaves page (monthly + annual), Dashboard, Attendance,
// History, and the server-side monthly-limit check in lib/actions/leaves.ts.
// Previously each of those 6 places had its own near-identical loop; that's
// exactly the kind of drift risk flagged in this project's own notes (one fix
// updating the "one spot asked about" but not its duplicates). One formula,
// one function, called everywhere.

// Shared with lib/utils/attendance-stats.ts, which uses the same 9.5h/4.75h
// rule to classify present/half/absent days — one constant, not two.
import { FULL_DAY_HOURS as WORKDAY_HOURS, HALF_DAY_THRESHOLD_HOURS } from './attendance-stats'

// Converts a cumulative Permission-hours total into day-equivalents:
// full days = floor(hours / 9.5), plus one more half-day if what's left over
// is >= 4.75h. E.g. 4.75h -> 0.5, 9.5h -> 1.0, 13h -> 1.0, 15.25h -> 1.5, 19h -> 2.0.
export function permissionHoursToDays(hours: number): number {
  if (!hours || hours <= 0) return 0
  const fullDays = Math.floor(hours / WORKDAY_HOURS)
  const remainder = hours - fullDays * WORKDAY_HOURS
  return fullDays + (remainder >= HALF_DAY_THRESHOLD_HOURS ? 0.5 : 0)
}

export type LeaveForBalance = {
  leave_type?: string | null
  from_date: string
  to_date: string
  permission_hours?: number | string | null
}

// Sums day-equivalents for a list of leave rows, clipped to the inclusive
// [rangeStart, rangeEnd] window ('YYYY-MM-DD' strings) — pass a full calendar
// month, a full year, "month start to today", or any custom range; the
// clipping behavior is identical everywhere this is called from.
//  - Full Day: every calendar day of overlap with the range.
//  - Half Day: 0.5 (always a single-day record).
//  - Permission: NOT clipped for partial-day precision — if its date falls in
//    range, its hours count in full toward the cumulative total, which then
//    converts to day-equivalents via permissionHoursToDays() once at the end
//    (converting per-row would double-round and drift from the real total).
//  - WFH / Shoot Day: 0 — a work arrangement, not an absence.
export function sumLeaveDays(leaves: LeaveForBalance[], rangeStart: string, rangeEnd: string): number {
  let permissionHours = 0
  let days = 0
  for (const l of leaves) {
    const type = l.leave_type ?? 'full_day'
    if (type === 'wfh' || type === 'shoot_day') continue

    const start = l.from_date > rangeStart ? l.from_date : rangeStart
    const end   = l.to_date   < rangeEnd   ? l.to_date   : rangeEnd
    if (start > end) continue

    if (type === 'permission') {
      permissionHours += Number(l.permission_hours) || 0
      continue
    }
    const span = Math.ceil((new Date(end + 'T12:00:00').getTime() - new Date(start + 'T12:00:00').getTime()) / 86400000) + 1
    days += type === 'half_day' ? span * 0.5 : span
  }
  return days + permissionHoursToDays(permissionHours)
}

// Strips the internal "[BACKFILL] " audit tag from a leave's reason before it's shown to
// the employee — the tag stays in the DB (useful for us to tell a live submission apart
// from a 2026-07-29 history correction) but "[BACKFILL]" itself means nothing to them.
// Callers render the AutoBadge chip (components/ui/AutoBadge.tsx) when isAuto is true.
export function parseLeaveReason(reason: string | null | undefined): { text: string; isAuto: boolean } {
  if (!reason) return { text: '', isAuto: false }
  const match = reason.match(/^\[BACKFILL\]\s*(.*)$/)
  return match ? { text: match[1], isAuto: true } : { text: reason, isAuto: false }
}
