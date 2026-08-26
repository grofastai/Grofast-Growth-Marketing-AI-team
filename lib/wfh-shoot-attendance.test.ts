import { describe, it, expect } from 'vitest'
import { planWorkDayAttendance } from './wfh-shoot-attendance'

describe('planWorkDayAttendance', () => {
  it('auto clocks in a same-day request approved the same day', () => {
    // The original attendance-page flow: member taps "Shoot Day" at 10am, admin
    // approves at 10:05 — clock in from the apply time.
    expect(planWorkDayAttendance('2026-08-25', '2026-08-25', '2026-08-25', '2026-08-25'))
      .toEqual([{ date: '2026-08-25', mode: 'apply_time' }])
  })

  it('leaves a same-day request approved the NEXT day with a real placeholder (GF010, 2026-08-25)', () => {
    // Punithrajan submitted a shoot day at 6pm on Aug 25; the admin approved it on
    // Aug 26. The old approval-day check silently wrote no attendance row at all, so
    // the next morning the gate read Aug 25 as "no login and no leave" and locked him
    // out behind "Contact Admin" even though he had filed a full day of work entries.
    expect(planWorkDayAttendance('2026-08-25', '2026-08-25', '2026-08-25', '2026-08-26'))
      .toEqual([{ date: '2026-08-25', mode: 'placeholder' }])
  })

  it('backfills every past day of a late-approved multi-day request', () => {
    expect(planWorkDayAttendance('2026-08-24', '2026-08-26', '2026-08-24', '2026-08-27'))
      .toEqual([
        { date: '2026-08-24', mode: 'placeholder' },
        { date: '2026-08-25', mode: 'placeholder' },
        { date: '2026-08-26', mode: 'placeholder' },
      ])
  })

  it('never touches a future day — the member still clocks in themselves', () => {
    expect(planWorkDayAttendance('2026-08-27', '2026-08-29', '2026-08-25', '2026-08-26'))
      .toEqual([])
  })

  it('does not auto clock in a pre-planned request on its start date', () => {
    // Applied in advance, so there is no meaningful "apply time" to clock in from —
    // unchanged behaviour: the member clocks in at their real start time.
    expect(planWorkDayAttendance('2026-08-26', '2026-08-26', '2026-08-20', '2026-08-26'))
      .toEqual([])
  })

  it('backfills the past leg of a pre-planned range but leaves today alone', () => {
    expect(planWorkDayAttendance('2026-08-24', '2026-08-26', '2026-08-20', '2026-08-26'))
      .toEqual([
        { date: '2026-08-24', mode: 'placeholder' },
        { date: '2026-08-25', mode: 'placeholder' },
      ])
  })
})
