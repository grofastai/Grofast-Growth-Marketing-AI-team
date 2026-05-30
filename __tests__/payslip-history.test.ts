// __tests__/payslip-history.test.ts
import { describe, it, expect } from 'vitest'

// Helpers that will be used inline in profile-client.tsx — tested here in isolation

function formatPayslipMonth(month: string): string {
  // month is "YYYY-MM", e.g. "2026-05" → "May 2026"
  return new Date(month + '-01').toLocaleDateString('en-IN', {
    month: 'long', year: 'numeric',
  })
}

function formatPaidDate(paidAt: string): string {
  // paidAt is ISO date string → "28 May"
  return new Date(paidAt).toLocaleDateString('en-IN', {
    day: 'numeric', month: 'short',
  })
}

describe('formatPayslipMonth', () => {
  it('formats YYYY-MM to Month Year', () => {
    expect(formatPayslipMonth('2026-05')).toBe('May 2026')
  })

  it('formats January correctly', () => {
    expect(formatPayslipMonth('2026-01')).toBe('January 2026')
  })

  it('formats December correctly', () => {
    expect(formatPayslipMonth('2025-12')).toBe('December 2025')
  })
})

describe('formatPaidDate', () => {
  it('formats ISO date to day + short month', () => {
    const result = formatPaidDate('2026-05-28T00:00:00.000Z')
    // Result is locale-dependent — just check it contains "28" and "May"
    expect(result).toContain('28')
    expect(result.toLowerCase()).toContain('may')
  })
})
