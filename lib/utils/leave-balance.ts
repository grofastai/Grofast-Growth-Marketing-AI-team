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

// Regular work hours are 09:30–19:00. Anything logged starting before 09:30
// or at/after 19:00 counts as overtime for the same-month Permission-netting
// rule below (confirmed 2026-07-30: if someone worked genuine overtime the
// same calendar month they used Permission, that overtime should offset the
// Permission hours before they convert into a leave-day deduction — someone
// who made up the time shouldn't be penalized the same as someone who didn't).
const WORK_DAY_START = '09:30'
const WORK_DAY_END   = '19:00'

export type WorkEntryForOvertime = {
  task_type?: string | null
  start_time?: string | null
  duration_hours?: number | string | null
}
export type DailyUpdateForOvertime = {
  date: string
  work_entries: WorkEntryForOvertime[] | null
}

// Overtime hours (outside 09:30–19:00), summed per calendar month ('YYYY-MM'
// keys) — feeds sumLeaveDays' Permission-netting below. Break entries don't
// count as overtime even if logged outside work hours.
export function overtimeHoursByMonth(updates: DailyUpdateForOvertime[]): Record<string, number> {
  const byMonth: Record<string, number> = {}
  for (const u of updates) {
    const month = u.date.slice(0, 7)
    for (const e of u.work_entries ?? []) {
      if ((e.task_type ?? '') === 'break') continue
      const start = e.start_time ?? ''
      if (!start || (start >= WORK_DAY_START && start < WORK_DAY_END)) continue
      byMonth[month] = (byMonth[month] ?? 0) + (Number(e.duration_hours) || 0)
    }
  }
  return byMonth
}

// Sums day-equivalents for a list of leave rows, clipped to the inclusive
// [rangeStart, rangeEnd] window ('YYYY-MM-DD' strings) — pass a full calendar
// month, a full year, "month start to today", or any custom range; the
// clipping behavior is identical everywhere this is called from.
//  - Full Day: every calendar day of overlap with the range.
//  - Half Day: 0.5 (always a single-day record).
//  - Permission: NOT clipped for partial-day precision — if its date falls in
//    range, its hours count in full toward that calendar month's total, net
//    of that same month's overtime hours (see overtimeHoursByMonth), floored
//    at 0, which then converts to day-equivalents via permissionHoursToDays()
//    once per month (converting per-row would double-round and drift from the
//    real total). Pass overtimeByMonth={} (the default) to net nothing —
//    i.e. the original behavior, for callers that don't have overtime data.
//  - WFH / Shoot Day: 0 — a work arrangement, not an absence.
export function sumLeaveDays(
  leaves: LeaveForBalance[],
  rangeStart: string,
  rangeEnd: string,
  overtimeByMonth: Record<string, number> = {},
): number {
  const permissionHoursByMonth: Record<string, number> = {}
  let days = 0
  for (const l of leaves) {
    const type = l.leave_type ?? 'full_day'
    if (type === 'wfh' || type === 'shoot_day') continue

    const start = l.from_date > rangeStart ? l.from_date : rangeStart
    const end   = l.to_date   < rangeEnd   ? l.to_date   : rangeEnd
    if (start > end) continue

    if (type === 'permission') {
      const month = l.from_date.slice(0, 7)
      permissionHoursByMonth[month] = (permissionHoursByMonth[month] ?? 0) + (Number(l.permission_hours) || 0)
      continue
    }
    const span = Math.ceil((new Date(end + 'T12:00:00').getTime() - new Date(start + 'T12:00:00').getTime()) / 86400000) + 1
    days += type === 'half_day' ? span * 0.5 : span
  }
  let permissionDays = 0
  for (const [month, hours] of Object.entries(permissionHoursByMonth)) {
    const netHours = Math.max(0, hours - (overtimeByMonth[month] ?? 0))
    permissionDays += permissionHoursToDays(netHours)
  }
  return days + permissionDays
}

// Strips internal bracket tags ("[BACKFILL] ", "[EXCEPTIONAL] ") from a leave's reason
// before it's shown to the employee — both stay in the DB (BACKFILL marks a 2026-07-29
// history correction, EXCEPTIONAL marks a request that bypassed the monthly cap or a
// date collision and needed admin approval) but neither reads as English to them.
// Callers render AutoBadge / ExceptionalBadge (components/ui/) when the flag is true.
export function parseLeaveReason(reason: string | null | undefined): { text: string; isAuto: boolean; isExceptional: boolean } {
  if (!reason) return { text: '', isAuto: false, isExceptional: false }
  const backfill = reason.match(/^\[BACKFILL\]\s*(.*)$/)
  if (backfill) return { text: backfill[1], isAuto: true, isExceptional: false }
  const exceptional = reason.match(/^\[EXCEPTIONAL\]\s*(.*)$/)
  if (exceptional) return { text: exceptional[1], isAuto: false, isExceptional: true }
  return { text: reason, isAuto: false, isExceptional: false }
}
