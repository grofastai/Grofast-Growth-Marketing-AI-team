// Single source of truth for "was this day a full/half/absent day" and for
// turning a list of days into Present/Half/Absent counts. Previously the
// Member Dashboard, Member Attendance page, History page, Admin Payroll page,
// and the Payslip PDF each classified days their own way (some purely by
// attendance_logs.status with no half-day concept at all, some by hours with
// a different threshold) — same person, same month, different numbers on
// different screens. One formula, one function, called everywhere.
//
// Standard workday: 9:30 AM – 7:00 PM = 9.5 hours (confirmed 2026-07-23).
// A day with hours worked > HALF_DAY_THRESHOLD_HOURS counts as a full day;
// any nonzero hours at or below that (including "clocked in but forgot to
// submit an update") counts as a half day; zero hours with no clock-in is
// absent. Approved leave / company holidays are excluded from present/absent
// entirely — they're accounted for separately (see lib/utils/leave-balance.ts).
// Confirmed 2026-07-28 to also govern Present Days counting, not just payroll.
//
// Half-day leave (confirmed 2026-07-28): a half_day leave only covers half the
// date, so it should only remove 0.5 from present-day accounting, not the
// whole day. If she showed up for the other half (clocked in or logged any
// hours), that half counts as present ('half_leave': 0.5 leave + 0.5 present —
// never deductible in payroll, same as a normal leave day). If she never
// showed up at all for the working half, there's nothing to distinguish it
// from a full-day leave, so it collapses to 'leave' (1.0 leave, 0 present).
//
// HALF_DAY_THRESHOLD_HOURS corrected 2026-07-28: 4.5h was never actually half
// of the 9.5h workday (half of 9.5 is 4.75h = 4h45m) — this threshold now
// matches FULL_DAY_HOURS / 2 exactly, for both Present Days classification
// and Permission-hours-to-days conversion (see permissionHoursToDays below).
import { calcNetWorkHours } from './work-hours'

export const FULL_DAY_HOURS = 9.5
export const HALF_DAY_THRESHOLD_HOURS = 4.75

export type AttendanceDayInput = {
  hasClockIn: boolean
  workHours: number
  /** 'full' = whole date is approved leave. 'half' = half-day leave — the
   *  other half is still eligible for present credit (see classifyAttendanceDay). */
  leaveType?: 'full' | 'half'
  isHoliday?: boolean
}

export type DayClass = 'full' | 'half' | 'absent' | 'leave' | 'half_leave' | 'holiday'

export function classifyAttendanceDay(day: AttendanceDayInput, halfDayThresholdHours = HALF_DAY_THRESHOLD_HOURS): DayClass {
  if (day.isHoliday) return 'holiday'
  if (day.leaveType === 'full') return 'leave'
  if (day.leaveType === 'half') return (day.hasClockIn || day.workHours > 0) ? 'half_leave' : 'leave'
  if (!day.hasClockIn && day.workHours <= 0) return 'absent'
  if (day.hasClockIn && day.workHours <= 0) return 'half' // clocked in, no work logged = missing update
  if (day.workHours > 0 && day.workHours <= halfDayThresholdHours) return 'half'
  return 'full'
}

export type AttendanceSummary = {
  presentDays: number // fullDays + halfDays * 0.5 + halfLeaveDays * 0.5
  fullDays: number
  halfDays: number
  absentDays: number
  leaveDays: number // fullLeaveDays + halfLeaveDays * 0.5
  halfLeaveDays: number
  holidayDays: number
}

export function summarizeAttendanceDays(days: AttendanceDayInput[], halfDayThresholdHours = HALF_DAY_THRESHOLD_HOURS): AttendanceSummary {
  let fullDays = 0, halfDays = 0, absentDays = 0, fullLeaveDays = 0, halfLeaveDays = 0, holidayDays = 0
  for (const day of days) {
    switch (classifyAttendanceDay(day, halfDayThresholdHours)) {
      case 'full':       fullDays++;      break
      case 'half':       halfDays++;      break
      case 'absent':     absentDays++;    break
      case 'leave':      fullLeaveDays++; break
      case 'half_leave': halfLeaveDays++; break
      case 'holiday':    holidayDays++;   break
    }
  }
  return {
    presentDays: fullDays + halfDays * 0.5 + halfLeaveDays * 0.5,
    fullDays, halfDays, absentDays,
    leaveDays: fullLeaveDays + halfLeaveDays * 0.5,
    halfLeaveDays,
    holidayDays,
  }
}

export type DailyUpdateForHours = {
  work_entries?: { task_type: string; start_time?: string | null; end_time?: string | null; duration_hours?: number | null; _travel_hours?: number | null }[] | null
  working_hours?: number | null
  learning_hours?: number | null
}

// Net hours worked for one daily_updates row — prefers the itemized
// work_entries (interval-merged, break-aware); falls back to the stored
// working_hours + learning_hours fields for legacy rows with no entries.
export function dailyWorkHours(u: DailyUpdateForHours): number {
  const entries = Array.isArray(u.work_entries) ? u.work_entries : []
  return entries.length > 0
    ? calcNetWorkHours(entries)
    : (u.working_hours ?? 0) + (u.learning_hours ?? 0)
}
