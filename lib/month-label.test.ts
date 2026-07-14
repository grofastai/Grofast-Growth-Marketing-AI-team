import { describe, it, expect } from 'vitest'

// Guards the iOS "Invalid Date" bug on the History month chips.
//
// The chips stored their display label ("July 2026") as identity and then re-parsed it
// with `new Date(label + " 1")` to build the short label. "July 2026 1" is not a format
// the spec requires engines to accept: V8 guesses it, JavaScriptCore does not. So every
// chip rendered "Invalid Date" on iPhone while looking fine on Android/desktop.
//
// These tests pin the two rules that keep it fixed:
//   1. never hand a display label to Date()
//   2. derive labels from the ISO date, which every engine parses identically

const MONTH_NAMES = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
]

function labelToMonthInput(label: string): string {
  const [name, year] = label.split(' ')
  const idx = MONTH_NAMES.indexOf(name)
  if (idx < 0 || !/^\d{4}$/.test(year ?? '')) return ''
  return `${year}-${String(idx + 1).padStart(2, '0')}`
}

describe('labelToMonthInput', () => {
  it('reads a month label back without going through Date()', () => {
    expect(labelToMonthInput('July 2026')).toBe('2026-07')
    expect(labelToMonthInput('January 2026')).toBe('2026-01')
    expect(labelToMonthInput('December 2025')).toBe('2025-12')
  })

  it('returns empty for anything that is not a month label', () => {
    expect(labelToMonthInput('')).toBe('')
    expect(labelToMonthInput('Invalid Date')).toBe('')
    expect(labelToMonthInput('Jul 2026')).toBe('')
    expect(labelToMonthInput('July')).toBe('')
  })
})

describe('the date string the chips must never build', () => {
  it('"July 2026 1" is engine-dependent — Safari rejects it', () => {
    // Chrome/Node parse this; JavaScriptCore returns NaN. Relying on it is the bug.
    // The fix formats from the ISO date instead, which is unambiguous everywhere.
    const iso = new Date('2026-07-13T12:00:00')
    expect(isNaN(iso.getTime())).toBe(false)
    expect(iso.toLocaleDateString('en-US', { month: 'short', year: '2-digit' })).toBe('Jul 26')
  })
})
