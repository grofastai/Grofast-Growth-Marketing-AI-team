import { describe, it, expect } from 'vitest'
import { monthMatrix, bucketByDay } from './calendar'

describe('monthMatrix', () => {
  it('June 2026 starts on Monday and has the 1st in row 0 col 1', () => {
    const m = monthMatrix(2026, 5) // month is 0-based: 5 = June
    expect(m[0][0]).toBeNull()                 // Sunday before the 1st
    expect(m[0][1]?.getDate()).toBe(1)         // Mon Jun 1
    expect(m.every(w => w.length === 7)).toBe(true)
  })
})

describe('bucketByDay', () => {
  it('groups note ids by their reminder local date and skips null', () => {
    const out = bucketByDay([
      { id: 'a', reminder_at: '2026-06-10T09:00:00.000Z' },
      { id: 'b', reminder_at: '2026-06-10T15:00:00.000Z' },
      { id: 'c', reminder_at: null },
    ])
    expect(out['2026-06-10']?.sort()).toEqual(['a', 'b'])
    expect(Object.values(out).flat()).not.toContain('c')
  })
})
