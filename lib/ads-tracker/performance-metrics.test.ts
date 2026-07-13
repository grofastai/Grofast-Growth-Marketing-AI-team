import { describe, it, expect } from 'vitest'
import { cpc, cpm, frequency, costPerResult, latestEntry, isUnderperforming, type AdPerformanceEntry } from './performance-metrics'

function entry(overrides: Partial<AdPerformanceEntry> = {}): AdPerformanceEntry {
  return {
    id: '1', ad_id: 'ad1', entry_date: '2026-07-01',
    spend: 1000, impressions: 10000, reach: 5000, clicks: 100, ctr: 1.0, results: 10,
    note: null,
    ...overrides,
  }
}

describe('derived metrics', () => {
  it('cpc divides spend by clicks', () => {
    expect(cpc(entry({ spend: 1000, clicks: 100 }))).toBe(10)
  })
  it('cpc is null when clicks is 0', () => {
    expect(cpc(entry({ clicks: 0 }))).toBeNull()
  })
  it('cpm computes cost per 1000 impressions', () => {
    expect(cpm(entry({ spend: 500, impressions: 10000 }))).toBe(50)
  })
  it('cpm is null when impressions is 0', () => {
    expect(cpm(entry({ impressions: 0 }))).toBeNull()
  })
  it('frequency divides impressions by reach', () => {
    expect(frequency(entry({ impressions: 10000, reach: 5000 }))).toBe(2)
  })
  it('frequency is null when reach is 0', () => {
    expect(frequency(entry({ reach: 0 }))).toBeNull()
  })
  it('costPerResult divides spend by results', () => {
    expect(costPerResult(entry({ spend: 1000, results: 10 }))).toBe(100)
  })
  it('costPerResult is null when results is 0', () => {
    expect(costPerResult(entry({ results: 0 }))).toBeNull()
  })
})

describe('latestEntry', () => {
  it('returns null for an empty list', () => {
    expect(latestEntry([])).toBeNull()
  })
  it('returns the entry with the most recent entry_date', () => {
    const entries = [
      entry({ id: '1', entry_date: '2026-07-01' }),
      entry({ id: '2', entry_date: '2026-07-10' }),
      entry({ id: '3', entry_date: '2026-07-05' }),
    ]
    expect(latestEntry(entries)?.id).toBe('2')
  })
})

describe('isUnderperforming', () => {
  it('is false with no entries logged', () => {
    expect(isUnderperforming([])).toBe(false)
  })
  it('is true when the latest entry CTR is below 1%', () => {
    expect(isUnderperforming([entry({ entry_date: '2026-07-01', ctr: 0.5 })])).toBe(true)
  })
  it('is false when the latest entry CTR is at or above 1%', () => {
    expect(isUnderperforming([entry({ entry_date: '2026-07-01', ctr: 1.0 })])).toBe(false)
    expect(isUnderperforming([entry({ entry_date: '2026-07-01', ctr: 2.5 })])).toBe(false)
  })
  it('uses only the latest entry, ignoring older low-CTR entries', () => {
    const entries = [
      entry({ id: '1', entry_date: '2026-07-01', ctr: 0.2 }), // old, low CTR
      entry({ id: '2', entry_date: '2026-07-10', ctr: 3.0 }), // latest, healthy CTR
    ]
    expect(isUnderperforming(entries)).toBe(false)
  })
})
