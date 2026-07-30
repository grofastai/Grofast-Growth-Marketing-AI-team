import { describe, it, expect } from 'vitest'
import {
  monthElapsedPct, paceStatus, computeMonthlyBrandingRollup, computeClientDeliveryStatus,
  type DeliveryItem, type DeliveryClientTarget,
} from './delivery-status'

function item(overrides: Partial<DeliveryItem> = {}): DeliveryItem {
  return {
    id: 'i1', client_name: 'Acme', content_type: 'video', status: 'ready_to_edit',
    posted_branding: false, posts: [],
    ...overrides,
  }
}
function target(overrides: Partial<DeliveryClientTarget> = {}): DeliveryClientTarget {
  return { client_name: 'Acme', kind: 'branding', content_type: 'video', month: '2026-07', target: 0, ...overrides }
}

describe('monthElapsedPct', () => {
  it('computes day-of-month / days-in-month for the current viewing month', () => {
    // July 2026 has 31 days; the 16th is 16/31 elapsed.
    expect(monthElapsedPct('2026-07-16', '2026-07')).toBeCloseTo((16 / 31) * 100, 5)
  })
  it('returns 100 for a month entirely before today', () => {
    expect(monthElapsedPct('2026-08-01', '2026-07')).toBe(100)
  })
  it('returns 0 for a month entirely after today', () => {
    expect(monthElapsedPct('2026-06-01', '2026-07')).toBe(0)
  })
})

describe('paceStatus', () => {
  it('is completed once published meets or exceeds a nonzero target', () => {
    expect(paceStatus(100, 50, 20, 20)).toBe('completed')
    expect(paceStatus(150, 50, 20, 30)).toBe('completed')
  })
  it('is on_track when completion% is at or above the month-elapsed%', () => {
    expect(paceStatus(50, 48, 20, 10)).toBe('on_track')
    expect(paceStatus(48, 48, 20, 10)).toBe('on_track')
  })
  it('is behind when completion% trails the month-elapsed%', () => {
    expect(paceStatus(40, 48, 20, 8)).toBe('behind')
  })
  it('treats a zero target as on_track when nothing is published, completed otherwise', () => {
    expect(paceStatus(0, 48, 0, 0)).toBe('on_track')
    expect(paceStatus(100, 48, 0, 3)).toBe('completed')
  })
})

describe('computeMonthlyBrandingRollup', () => {
  it('sums target and published across all clients and both content types', () => {
    const r = computeMonthlyBrandingRollup(
      [
        item({ id: '1', client_name: 'Acme', content_type: 'video', posted_branding: true, posts: [{ posted_date: '2026-07-10', platform: 'instagram' }] }),
        item({ id: '2', client_name: 'Beta', content_type: 'poster', posted_branding: true, posts: [{ posted_date: '2026-07-11', platform: 'facebook' }] }),
        item({ id: '3', client_name: 'Acme', content_type: 'video', status: 'ready_to_edit' }),
      ],
      [
        target({ client_name: 'Acme', content_type: 'video', target: 10 }),
        target({ client_name: 'Acme', content_type: 'poster', target: 5 }),
        target({ client_name: 'Beta', content_type: 'poster', target: 8 }),
      ],
      '2026-07',
    )
    expect(r.target).toBe(23)
    expect(r.completed).toBe(2)
    expect(r.remaining).toBe(21)
    expect(r.completionPct).toBeCloseTo((2 / 23) * 100, 5)
  })

  it('ignores ads-kind and other-month targets', () => {
    const r = computeMonthlyBrandingRollup(
      [],
      [
        target({ kind: 'ads', target: 50 }),
        target({ month: '2026-06', target: 50 }),
        target({ target: 10 }),
      ],
      '2026-07',
    )
    expect(r.target).toBe(10)
  })

  it('returns all zeros for empty input', () => {
    expect(computeMonthlyBrandingRollup([], [], '2026-07')).toEqual({ target: 0, completed: 0, remaining: 0, completionPct: 0 })
  })
})

describe('computeClientDeliveryStatus', () => {
  it('builds one row per client with target/published/editing/readyToPublish/remaining/status', () => {
    const rows = computeClientDeliveryStatus(
      [
        item({ id: '1', client_name: 'Acme', content_type: 'video', status: 'posted', posted_branding: true, posts: [{ posted_date: '2026-07-05', platform: 'instagram' }] }),
        item({ id: '2', client_name: 'Acme', content_type: 'poster', status: 'edited' }),
        item({ id: '3', client_name: 'Acme', content_type: 'video', status: 'branding_ready' }),
        item({ id: '4', client_name: 'Acme', content_type: 'video', status: 'cancelled' }),
      ],
      [
        target({ client_name: 'Acme', content_type: 'video', target: 4 }),
        target({ client_name: 'Acme', content_type: 'poster', target: 2 }),
      ],
      '2026-07', '2026-07-16',
    )
    expect(rows).toHaveLength(1)
    expect(rows[0].client).toBe('Acme')
    expect(rows[0].target).toBe(6)
    expect(rows[0].published).toBe(1)
    expect(rows[0].editing).toBe(1)
    expect(rows[0].readyToPublish).toBe(1)
    expect(rows[0].remaining).toBe(5)
    expect(rows[0].completionPct).toBeCloseTo((1 / 6) * 100, 5)
    expect(rows[0].status).toBe('behind')
  })

  it('excludes cancelled items from every bucket', () => {
    const rows = computeClientDeliveryStatus(
      [item({ id: '1', client_name: 'Acme', status: 'cancelled' })],
      [target({ client_name: 'Acme', target: 5 })],
      '2026-07', '2026-07-16',
    )
    expect(rows[0]).toMatchObject({ published: 0, editing: 0, readyToPublish: 0 })
  })

  it('omits clients with neither a target nor any items', () => {
    const rows = computeClientDeliveryStatus([], [], '2026-07', '2026-07-16')
    expect(rows).toEqual([])
  })
})
