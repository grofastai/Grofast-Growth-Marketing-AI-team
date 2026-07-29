import { describe, it, expect } from 'vitest'
import { classifyAttendanceDay, summarizeAttendanceDays } from './attendance-stats'

describe('classifyAttendanceDay', () => {
  it('classifies a normal full day', () => {
    expect(classifyAttendanceDay({ hasClockIn: true, workHours: 9 })).toBe('full')
  })

  it('classifies a normal half day (low hours)', () => {
    expect(classifyAttendanceDay({ hasClockIn: true, workHours: 3 })).toBe('half')
  })

  it('classifies clocked-in-but-nothing-logged as half day', () => {
    expect(classifyAttendanceDay({ hasClockIn: true, workHours: 0 })).toBe('half')
  })

  it('classifies no clock-in and no hours as absent', () => {
    expect(classifyAttendanceDay({ hasClockIn: false, workHours: 0 })).toBe('absent')
  })

  it('holiday takes priority over everything else', () => {
    expect(classifyAttendanceDay({ hasClockIn: false, workHours: 0, isHoliday: true, leaveType: 'full' })).toBe('holiday')
  })

  it('full_day leave is always "leave", regardless of hours worked', () => {
    expect(classifyAttendanceDay({ hasClockIn: true, workHours: 8, leaveType: 'full' })).toBe('leave')
  })

  // Half-day leave: only half the date is leave, so the other half is still
  // eligible for present credit if she showed up for it (confirmed 2026-07-28).
  it('half_day leave with hours worked on the other half -> half_leave (0.5 leave + 0.5 present)', () => {
    expect(classifyAttendanceDay({ hasClockIn: true, workHours: 3.5, leaveType: 'half' })).toBe('half_leave')
  })

  it('half_day leave with a clock-in but zero hours logged -> half_leave (benefit of the doubt)', () => {
    expect(classifyAttendanceDay({ hasClockIn: true, workHours: 0, leaveType: 'half' })).toBe('half_leave')
  })

  it('half_day leave with no clock-in and zero hours -> collapses to full leave', () => {
    expect(classifyAttendanceDay({ hasClockIn: false, workHours: 0, leaveType: 'half' })).toBe('leave')
  })

  // HALF_DAY_THRESHOLD_HOURS corrected 2026-07-28: 4.5h was never actually half of the
  // 9.5h workday (half of 9.5 is 4.75h = 4h45m). 4.6h used to cross the old 4.5h
  // threshold into 'full'; it must now stay 'half' under the corrected 4.75h line.
  it('4.6h stays half day under the corrected 4.75h threshold (would have been full under the old 4.5h)', () => {
    expect(classifyAttendanceDay({ hasClockIn: true, workHours: 4.6 })).toBe('half')
  })

  it('4.75h exactly is still half day (boundary is inclusive)', () => {
    expect(classifyAttendanceDay({ hasClockIn: true, workHours: 4.75 })).toBe('half')
  })

  it('4.76h crosses into full day', () => {
    expect(classifyAttendanceDay({ hasClockIn: true, workHours: 4.76 })).toBe('full')
  })
})

describe('summarizeAttendanceDays', () => {
  it('gives a half_leave day 0.5 credit toward presentDays and 0.5 toward leaveDays', () => {
    const summary = summarizeAttendanceDays([
      { hasClockIn: true, workHours: 9, leaveType: undefined },       // full: +1 present
      { hasClockIn: true, workHours: 3.5, leaveType: 'half' },        // half_leave: +0.5 present, +0.5 leave
      { hasClockIn: false, workHours: 0, leaveType: 'half' },         // no-show half-day leave -> full leave
      { hasClockIn: false, workHours: 0, leaveType: 'full' },         // full leave
    ])
    expect(summary.presentDays).toBe(1.5)
    expect(summary.fullDays).toBe(1)
    expect(summary.halfLeaveDays).toBe(1)
    expect(summary.leaveDays).toBe(2.5) // 1 (no-show half) + 1 (full) + 0.5 (worked half) = 2.5
  })

  // Regression check against Sajetha SK (GF003), July 2026: 3 half_day leaves
  // (07-04, 07-25, 07-26) all worked partial hours, 1 full_day leave (07-16)
  // with nothing logged. Before this fix, presentDays came out to 23.5 (23 full
  // + 0.5 for the in-progress "today"); with the half-day-leave fix applied to
  // just the 27 completed days, full days stay 23 but the 3 worked half-day
  // leaves now also contribute 0.5 present credit each -> 23 + 1.5 = 24.5.
  it('matches the expected reconciliation for a real half-day-leave-heavy month', () => {
    const completedDays = [
      { date: '07-04', hasClockIn: true, workHours: 3.5, leaveType: 'half' as const },
      { date: '07-16', hasClockIn: false, workHours: 0, leaveType: 'full' as const },
      { date: '07-25', hasClockIn: true, workHours: 3.5, leaveType: 'half' as const },
      { date: '07-26', hasClockIn: true, workHours: 4.5, leaveType: 'half' as const },
    ]
    const otherFullDays = Array.from({ length: 23 }, () => ({ hasClockIn: true, workHours: 8 }))
    const summary = summarizeAttendanceDays([...completedDays, ...otherFullDays])
    expect(summary.presentDays).toBe(24.5)
    expect(summary.leaveDays).toBe(2.5)
  })
})
