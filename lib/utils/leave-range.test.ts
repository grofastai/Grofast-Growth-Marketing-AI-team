import { describe, it, expect } from 'vitest'
import { leaveRangeDays, leaveRangeError, MAX_LEAVE_RANGE_DAYS } from './leave-range'

describe('leaveRangeDays', () => {
  it('counts inclusively', () => {
    expect(leaveRangeDays('2026-10-25', '2026-10-25')).toBe(1)
    expect(leaveRangeDays('2026-10-25', '2026-10-27')).toBe(3)
    expect(leaveRangeDays('2026-02-27', '2026-03-02')).toBe(4)
  })
})

describe('leaveRangeError', () => {
  it('accepts a single day and a full month', () => {
    expect(leaveRangeError('2026-10-25', '2026-10-25')).toBeNull()
    expect(leaveRangeError('2026-10-01', '2026-10-31')).toBeNull()
  })

  it('rejects the wrong-year typo that wiped a year of attendance', () => {
    expect(leaveRangeError('2025-10-25', '2026-10-25')).toMatch(/366 days/)
  })

  it(`rejects anything over ${MAX_LEAVE_RANGE_DAYS} days`, () => {
    expect(leaveRangeError('2026-10-01', '2026-11-01')).toMatch(/32 days/)
  })

  it('rejects a reversed range', () => {
    expect(leaveRangeError('2026-10-26', '2026-10-25')).toMatch(/on or before/)
  })

  it('rejects malformed dates', () => {
    expect(leaveRangeError('', '2026-10-25')).toBe('Invalid date')
    expect(leaveRangeError('2026-13-45', '2026-10-25')).toBe('Invalid date')
  })
})
