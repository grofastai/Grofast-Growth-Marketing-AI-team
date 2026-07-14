import { describe, it, expect } from 'vitest'
import { computeOverview, type OverviewItem, type OverviewShoot, type OverviewAd } from './overview'

const TODAY = '2026-07-14'

function item(overrides: Partial<OverviewItem> = {}): OverviewItem {
  return {
    id: 'i1',
    content_type: 'video',
    status: 'shot',
    shot_date: '2026-07-01',
    scheduled_post_date: null,
    corrections: [],
    ...overrides,
  }
}
function shoot(overrides: Partial<OverviewShoot> = {}): OverviewShoot {
  return { id: 's1', status: 'scheduled', start_time: `${TODAY}T09:00:00`, ...overrides }
}
function ad(overrides: Partial<OverviewAd> = {}): OverviewAd {
  return { id: 'a1', status: 'active', ...overrides }
}

describe('stage counts', () => {
  it('splits video and poster counts by content_type', () => {
    const o = computeOverview({
      items: [
        item({ id: '1', content_type: 'video', status: 'shot' }),
        item({ id: '2', content_type: 'video', status: 'editing' }),
        item({ id: '3', content_type: 'poster', status: 'editing' }),
        item({ id: '4', content_type: 'poster', status: 'posted' }),
      ],
      shoots: [], ads: [], today: TODAY,
    })
    expect(o.videos).toEqual({ shot: 1, editing: 1, edited: 0, ready: 0, posted: 0 })
    expect(o.posters).toEqual({ shot: 0, editing: 1, edited: 0, ready: 0, posted: 1 })
  })

  it('returns all-zero counts for empty input', () => {
    const o = computeOverview({ items: [], shoots: [], ads: [], today: TODAY })
    expect(o.videos).toEqual({ shot: 0, editing: 0, edited: 0, ready: 0, posted: 0 })
    expect(o.posters).toEqual({ shot: 0, editing: 0, edited: 0, ready: 0, posted: 0 })
    expect(o.attention).toEqual([])
  })
})

describe('posting counts', () => {
  it('counts due today, this week, and overdue by scheduled_post_date', () => {
    const o = computeOverview({
      items: [
        item({ id: '1', status: 'ready', scheduled_post_date: '2026-07-13' }), // yesterday -> overdue
        item({ id: '2', status: 'ready', scheduled_post_date: TODAY }),        // today
        item({ id: '3', status: 'ready', scheduled_post_date: '2026-07-20' }), // today+6 -> in week
        item({ id: '4', status: 'ready', scheduled_post_date: '2026-07-21' }), // today+7 -> outside week
      ],
      shoots: [], ads: [], today: TODAY,
    })
    expect(o.posting.overdue).toBe(1)
    expect(o.posting.dueToday).toBe(1)
    // This week is a SUPERSET that includes today, not a remainder.
    expect(o.posting.dueThisWeek).toBe(2)
  })

  it('ignores items that are not ready, and ready items with no date', () => {
    const o = computeOverview({
      items: [
        item({ id: '1', status: 'posted', scheduled_post_date: '2026-07-13' }),
        item({ id: '2', status: 'ready', scheduled_post_date: null }),
      ],
      shoots: [], ads: [], today: TODAY,
    })
    expect(o.posting).toEqual({ dueToday: 0, dueThisWeek: 0, overdue: 0 })
  })
})

describe('shoot counts', () => {
  it('counts shoots by status', () => {
    const o = computeOverview({
      items: [],
      shoots: [
        shoot({ id: '1', status: 'scheduled' }),
        shoot({ id: '2', status: 'going' }),
        shoot({ id: '3', status: 'completed' }),
        shoot({ id: '4', status: 'cancelled' }),
      ],
      ads: [], today: TODAY,
    })
    expect(o.shoots).toEqual({ scheduled: 1, going: 1, completed: 1, cancelled: 1 })
  })
})

describe('ad counts', () => {
  it('counts ads by status', () => {
    const o = computeOverview({
      items: [], shoots: [],
      ads: [ad({ id: '1', status: 'active' }), ad({ id: '2', status: 'active' }), ad({ id: '3', status: 'paused' })],
      today: TODAY,
    })
    expect(o.ads).toEqual({ active: 2, testing: 0, paused: 1, stopped: 0 })
  })
})

describe('needs attention — overdue', () => {
  it('reports overdue posts', () => {
    const o = computeOverview({
      items: [item({ status: 'ready', scheduled_post_date: '2026-07-10' })],
      shoots: [], ads: [], today: TODAY,
    })
    const entry = o.attention.find(a => a.kind === 'overdue')
    expect(entry?.count).toBe(1)
    expect(entry?.target).toEqual({ mode: 'video', tab: 'log' })
  })
})

describe('needs attention — stuck in editing', () => {
  it('flags an item editing for 7+ days, but not 6', () => {
    const o = computeOverview({
      items: [
        item({ id: 'six', status: 'editing', shot_date: '2026-07-08' }),   // 6 days -> not stuck
        item({ id: 'seven', status: 'editing', shot_date: '2026-07-07' }), // 7 days -> stuck
        item({ id: 'eight', status: 'editing', shot_date: '2026-07-06' }), // 8 days -> stuck
      ],
      shoots: [], ads: [], today: TODAY,
    })
    expect(o.attention.find(a => a.kind === 'stuck-editing')?.count).toBe(2)
  })

  it('uses the LATEST of shot_date and the last correction — a just-bounced item is not stuck', () => {
    const o = computeOverview({
      items: [
        // Old shot_date, but it was bounced back TODAY. It has only just re-entered
        // Editing, so it must NOT be reported as stalled.
        item({
          id: 'bounced',
          status: 'editing',
          shot_date: '2026-06-01',
          corrections: [{ correction_date: TODAY }],
        }),
      ],
      shoots: [], ads: [], today: TODAY,
    })
    expect(o.attention.find(a => a.kind === 'stuck-editing')).toBeUndefined()
  })

  it('still flags an item whose last correction was itself 7+ days ago', () => {
    const o = computeOverview({
      items: [
        item({
          id: 'stale-correction',
          status: 'editing',
          shot_date: '2026-06-01',
          corrections: [{ correction_date: '2026-07-07' }],
        }),
      ],
      shoots: [], ads: [], today: TODAY,
    })
    expect(o.attention.find(a => a.kind === 'stuck-editing')?.count).toBe(1)
  })
})

describe('needs attention — shoots today and repeat bounces', () => {
  it('counts shoots scheduled or going today', () => {
    const o = computeOverview({
      items: [],
      shoots: [
        shoot({ id: '1', status: 'scheduled', start_time: `${TODAY}T09:00:00` }),
        shoot({ id: '2', status: 'going', start_time: `${TODAY}T14:00:00` }),
        shoot({ id: '3', status: 'completed', start_time: `${TODAY}T08:00:00` }), // done -> not attention
        shoot({ id: '4', status: 'scheduled', start_time: '2026-07-20T09:00:00' }), // not today
      ],
      ads: [], today: TODAY,
    })
    expect(o.attention.find(a => a.kind === 'shoots-today')?.count).toBe(2)
  })

  it('flags items bounced back 2+ times, but not 1', () => {
    const o = computeOverview({
      items: [
        item({ id: 'once', corrections: [{ correction_date: '2026-07-01' }] }),
        item({ id: 'twice', corrections: [{ correction_date: '2026-07-01' }, { correction_date: '2026-07-05' }] }),
      ],
      shoots: [], ads: [], today: TODAY,
    })
    expect(o.attention.find(a => a.kind === 'repeat-corrections')?.count).toBe(1)
  })
})

describe('needs attention — ordering and empty state', () => {
  it('omits zero-count entries entirely', () => {
    const o = computeOverview({
      items: [item({ status: 'shot' })],
      shoots: [], ads: [], today: TODAY,
    })
    expect(o.attention).toEqual([])
  })
})
