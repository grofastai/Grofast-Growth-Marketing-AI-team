import { describe, it, expect } from 'vitest'
import { shootFormFields, shootInstant } from './shoot-time'

// shoots.start_time / end_time are timestamptz, so Postgres hands them back in UTC
// ("…+00:00"). The app is IST-only. These tests pin the contract that opening a shoot's
// edit form and saving it again — without touching anything — never moves the shoot.
describe('shootFormFields — what the edit form shows for a stored shoot', () => {
  it('shows IST date and times, not the UTC clock', () => {
    // 10:00–14:00 IST on Nov 20 is stored as 04:30–08:30 UTC.
    expect(shootFormFields('2026-11-20T04:30:00+00:00', '2026-11-20T08:30:00+00:00'))
      .toEqual({ date: '2026-11-20', from: '10:00', to: '14:00' })
  })

  it('uses the IST date when the UTC date is a day earlier (shoot before 05:30 IST)', () => {
    expect(shootFormFields('2026-09-29T22:00:00+00:00', '2026-09-30T02:00:00+00:00'))
      .toEqual({ date: '2026-09-30', from: '03:30', to: '07:30' })
  })

  it('shows 00:xx, not 24:xx, just after midnight IST', () => {
    expect(shootFormFields('2026-11-19T19:00:00+00:00', '2026-11-19T21:00:00+00:00'))
      .toEqual({ date: '2026-11-20', from: '00:30', to: '02:30' })
  })

  it('returns an empty To time when the shoot has no end', () => {
    expect(shootFormFields('2026-11-20T04:30:00+00:00', null).to).toBe('')
  })
})

describe('shootInstant', () => {
  it('builds an explicit-IST timestamp', () => {
    expect(shootInstant('2026-11-20', '10:00')).toBe('2026-11-20T10:00:00+05:30')
  })
})

describe('Edit → Save with nothing changed is a no-op', () => {
  const stored: Array<[string, string]> = [
    ['2026-11-20T04:30:00+00:00', '2026-11-20T08:30:00+00:00'], // 10:00–14:00 IST, morning (used to flip the date)
    ['2026-11-13T04:48:00+00:00', '2026-11-13T08:00:00+00:00'], // 10:18–13:30 IST
    ['2026-11-23T09:00:00+00:00', '2026-11-23T12:30:00+00:00'], // 14:30–18:00 IST, afternoon
    ['2026-09-29T22:00:00+00:00', '2026-09-30T02:00:00+00:00'], // 03:30 IST — UTC date is the day before
    ['2026-11-12T00:30:00+00:00', '2026-11-12T08:30:00+00:00'], // 06:00 IST
  ]

  it.each(stored)('keeps %s exactly', (start, end) => {
    const f = shootFormFields(start, end)
    expect(new Date(shootInstant(f.date, f.from)).toISOString()).toBe(new Date(start).toISOString())
    expect(new Date(shootInstant(f.date, f.to)).toISOString()).toBe(new Date(end).toISOString())
  })

  it('is stable across repeated open → save cycles', () => {
    let start = '2026-11-20T04:30:00+00:00'
    let end = '2026-11-20T08:30:00+00:00'
    for (let i = 0; i < 3; i++) {
      const f = shootFormFields(start, end)
      start = new Date(shootInstant(f.date, f.from)).toISOString()
      end = new Date(shootInstant(f.date, f.to)).toISOString()
    }
    expect(shootFormFields(start, end)).toEqual({ date: '2026-11-20', from: '10:00', to: '14:00' })
  })
})
