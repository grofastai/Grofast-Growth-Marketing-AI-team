import { describe, it, expect } from 'vitest'
import { permissionHoursToDays, sumLeaveDays } from './leave-balance'

describe('permissionHoursToDays', () => {
  it('returns 0 below the 4.75h threshold', () => {
    expect(permissionHoursToDays(4.6)).toBe(0)
  })

  // Corrected 2026-07-28: 4.5h was never actually half of the 9.5h workday
  // (half of 9.5 is 4.75h = 4h45m). 4.6h used to cross the old 4.5h threshold
  // into 0.5; it must now stay at 0 under the corrected 4.75h line.
  it('crosses to 0.5 at 4.75h exactly', () => {
    expect(permissionHoursToDays(4.75)).toBe(0.5)
  })

  it('stays at 0.5 up to just under 9.5h', () => {
    expect(permissionHoursToDays(9.4)).toBe(0.5)
  })

  it('crosses to 1.0 at 9.5h exactly (a clean replace, not additive with the 0.5)', () => {
    expect(permissionHoursToDays(9.5)).toBe(1)
  })

  it('crosses to 1.5 at 14.25h (9.5 + 4.75)', () => {
    expect(permissionHoursToDays(14.25)).toBe(1.5)
  })

  it('returns 0 for zero or negative hours', () => {
    expect(permissionHoursToDays(0)).toBe(0)
    expect(permissionHoursToDays(-2)).toBe(0)
  })
})

describe('sumLeaveDays', () => {
  it('full_day = 1 per day, half_day = 0.5 per day, wfh/shoot_day = 0', () => {
    const leaves = [
      { leave_type: 'full_day', from_date: '2026-07-16', to_date: '2026-07-16' },
      { leave_type: 'half_day', from_date: '2026-07-04', to_date: '2026-07-04' },
      { leave_type: 'wfh',      from_date: '2026-07-05', to_date: '2026-07-05' },
      { leave_type: 'shoot_day', from_date: '2026-07-06', to_date: '2026-07-06' },
    ]
    expect(sumLeaveDays(leaves, '2026-07-01', '2026-07-31')).toBe(1.5)
  })

  it('permission hours accumulate across records before converting once', () => {
    const leaves = [
      { leave_type: 'permission', from_date: '2026-07-10', to_date: '2026-07-10', permission_hours: 2.5 },
      { leave_type: 'permission', from_date: '2026-07-20', to_date: '2026-07-20', permission_hours: 2.5 },
    ]
    // 2.5 + 2.5 = 5h combined, crosses the 4.75h threshold -> 0.5, even though
    // neither 2.5h alone would.
    expect(sumLeaveDays(leaves, '2026-07-01', '2026-07-31')).toBe(0.5)
  })
})
