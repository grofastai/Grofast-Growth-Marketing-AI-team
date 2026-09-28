// Late-login / early-logoff calculation against the standard 09:30-19:00 IST
// working window, with approved permission/half-day leave subtracted out (that
// time is pre-approved, not a violation). Shared by the admin Punctuality report.
import { toISTTimeString } from '@/lib/utils/ist-date'

export const WORK_START_MIN = 9 * 60 + 30 // 09:30
export const WORK_END_MIN = 19 * 60       // 19:00

export function timeStrToMinutes(hhmm: string | null | undefined): number | null {
  if (!hhmm) return null
  const m = hhmm.match(/^(\d{1,2}):(\d{2})/)
  if (!m) return null
  return parseInt(m[1], 10) * 60 + parseInt(m[2], 10)
}

export function minutesToTimeLabel(min: number): string {
  const h = Math.floor(min / 60)
  const m = ((min % 60) + 60) % 60
  const period = h >= 12 ? 'PM' : 'AM'
  const h12 = h % 12 === 0 ? 12 : h % 12
  return `${h12}:${String(m).padStart(2, '0')} ${period}`
}

function subtractCovered(start: number, end: number, covered: [number, number][]): [number, number][] {
  let ranges: [number, number][] = [[start, end]]
  for (const [cs, ce] of covered) {
    const next: [number, number][] = []
    for (const [rs, re] of ranges) {
      const os = Math.max(rs, cs), oe = Math.min(re, ce)
      if (os >= oe) { next.push([rs, re]); continue }
      if (rs < os) next.push([rs, os])
      if (oe < re) next.push([oe, re])
    }
    ranges = next
  }
  // Drop sub-5-minute slivers — clock-skew noise, not a real gap.
  return ranges.filter(([rs, re]) => re - rs >= 5)
}

export type LeaveForPunctuality = {
  leave_type: string | null
  half_day_from_time?: string | null
  half_day_to_time?: string | null
  half_day_period?: string | null
  permission_time?: string | null
  permission_end_time?: string | null
  permission_hours?: number | string | null
}

// Approved permission/half-day windows for one day, as covered (excused) intervals.
// A permission row whose stored end time is inconsistent with its start time (e.g. an
// end time that predates the start) falls back to start + permission_hours instead of
// being silently dropped — a data-entry mistake in the leave record shouldn't manufacture
// a fake violation here.
export function coveredIntervalsFromLeaves(leaves: LeaveForPunctuality[]): [number, number][] {
  const covered: [number, number][] = []
  for (const l of leaves) {
    if (l.leave_type === 'half_day') {
      const f = timeStrToMinutes(l.half_day_from_time)
      const t = timeStrToMinutes(l.half_day_to_time)
      if (f != null && t != null && t > f) covered.push([f, t])
      else if (l.half_day_period === 'morning') covered.push([WORK_START_MIN, 13 * 60 + 30])
      else if (l.half_day_period === 'afternoon') covered.push([13 * 60 + 30, WORK_END_MIN])
    } else if (l.leave_type === 'permission') {
      const f = timeStrToMinutes(l.permission_time)
      let t = timeStrToMinutes(l.permission_end_time)
      const hours = l.permission_hours != null ? parseFloat(String(l.permission_hours)) : null
      if (f != null && (t == null || t <= f) && hours != null && hours > 0) t = f + Math.round(hours * 60)
      if (f != null && t != null && t > f) covered.push([f, t])
    }
  }
  return covered
}

export type TimeRange = { startMin: number; endMin: number; label: string }
export type DayPunctuality = {
  lateRanges: TimeRange[]
  earlyRanges: TimeRange[]
  lateMinutes: number
  earlyMinutes: number
}

// clockIn/clockOut are timestamptz values (any ISO/Postgres string Date can parse).
export function computeDayPunctuality(
  clockIn: string | null,
  clockOut: string | null,
  covered: [number, number][]
): DayPunctuality {
  const result: DayPunctuality = { lateRanges: [], earlyRanges: [], lateMinutes: 0, earlyMinutes: 0 }

  if (clockIn) {
    const inMin = timeStrToMinutes(toISTTimeString(clockIn))
    if (inMin != null && inMin > WORK_START_MIN) {
      for (const [s, e] of subtractCovered(WORK_START_MIN, inMin, covered)) {
        result.lateRanges.push({ startMin: s, endMin: e, label: `${minutesToTimeLabel(s)} - ${minutesToTimeLabel(e)}` })
        result.lateMinutes += e - s
      }
    }
  }
  if (clockOut) {
    const outMin = timeStrToMinutes(toISTTimeString(clockOut))
    if (outMin != null && outMin < WORK_END_MIN) {
      for (const [s, e] of subtractCovered(outMin, WORK_END_MIN, covered)) {
        result.earlyRanges.push({ startMin: s, endMin: e, label: `${minutesToTimeLabel(s)} - ${minutesToTimeLabel(e)}` })
        result.earlyMinutes += e - s
      }
    }
  }
  return result
}

export function formatDuration(totalMinutes: number): string {
  if (totalMinutes <= 0) return '0m'
  const h = Math.floor(totalMinutes / 60)
  const m = totalMinutes % 60
  return h > 0 ? `${h}h ${m}m` : `${m}m`
}
