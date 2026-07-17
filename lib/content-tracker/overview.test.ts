import { describe, it, expect } from 'vitest'
import { computeOverview, type OverviewItem, type OverviewShoot, type OverviewAd } from './overview'

const TODAY = '2026-07-14'

function item(overrides: Partial<OverviewItem> = {}): OverviewItem {
  return {
    id: 'i1',
    content_type: 'video',
    status: 'ready_to_edit',
    source: 'shoot',
    shot_date: '2026-07-01',
    voiceover_date: null,
    created_at: '2026-07-01T09:00:00Z',
    scheduled_post_date: null,
    corrections: [],
    ...overrides,
  }
}
function shoot(overrides: Partial<OverviewShoot> = {}): OverviewShoot {
  return { id: 's1', status: 'scheduled', start_time: `${TODAY}T09:00:00`, created_at: `${TODAY}T09:00:00Z`, ...overrides }
}
function ad(overrides: Partial<OverviewAd> = {}): OverviewAd {
  return { id: 'a1', status: 'active', created_at: `${TODAY}T09:00:00Z`, ...overrides }
}
const EMPTY_STAGES = { scripting: 0, voiceover: 0, design: 0, ready_to_edit: 0, editing: 0, edited: 0, on_review: 0, ready_to_post: 0, posted: 0 }

describe('stage counts', () => {
  it('splits video and poster counts by content_type', () => {
    const o = computeOverview({
      items: [
        item({ id: '1', content_type: 'video', status: 'ready_to_edit' }),
        item({ id: '2', content_type: 'video', status: 'editing' }),
        item({ id: '3', content_type: 'poster', status: 'editing' }),
        item({ id: '4', content_type: 'poster', status: 'posted' }),
      ],
      shoots: [], ads: [], today: TODAY,
    })
    expect(o.videos).toEqual({ ...EMPTY_STAGES, ready_to_edit: 1, editing: 1 })
    expect(o.posters).toEqual({ ...EMPTY_STAGES, editing: 1, posted: 1 })
  })

  it('returns all-zero counts for empty input', () => {
    const o = computeOverview({ items: [], shoots: [], ads: [], today: TODAY })
    expect(o.videos).toEqual(EMPTY_STAGES)
    expect(o.posters).toEqual(EMPTY_STAGES)
    expect(o.attention).toEqual([])
  })
})

describe('posting counts', () => {
  it('counts due today, this week, and overdue by scheduled_post_date', () => {
    const o = computeOverview({
      items: [
        item({ id: '1', status: 'ready_to_post', scheduled_post_date: '2026-07-13' }), // yesterday -> overdue
        item({ id: '2', status: 'ready_to_post', scheduled_post_date: TODAY }),        // today
        item({ id: '3', status: 'ready_to_post', scheduled_post_date: '2026-07-20' }), // today+6 -> in week
        item({ id: '4', status: 'ready_to_post', scheduled_post_date: '2026-07-21' }), // today+7 -> outside week
      ],
      shoots: [], ads: [], today: TODAY,
    })
    expect(o.posting.overdue).toBe(1)
    expect(o.posting.dueToday).toBe(1)
    expect(o.posting.dueThisWeek).toBe(2)
  })

  it('ignores items that are not ready_to_post, and ready_to_post items with no date', () => {
    const o = computeOverview({
      items: [
        item({ id: '1', status: 'posted', scheduled_post_date: '2026-07-13' }),
        item({ id: '2', status: 'ready_to_post', scheduled_post_date: null }),
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
        shoot({ id: '2', status: 'completed' }),
        shoot({ id: '3', status: 'cancelled' }),
      ],
      ads: [], today: TODAY,
    })
    expect(o.shoots).toEqual({ scheduled: 1, completed: 1, cancelled: 1 })
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
      items: [item({ status: 'ready_to_post', scheduled_post_date: '2026-07-10' })],
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
        item({ id: 'six', status: 'editing', shot_date: '2026-07-08' }),
        item({ id: 'seven', status: 'editing', shot_date: '2026-07-07' }),
        item({ id: 'eight', status: 'editing', shot_date: '2026-07-06' }),
      ],
      shoots: [], ads: [], today: TODAY,
    })
    expect(o.attention.find(a => a.kind === 'stuck-editing')?.count).toBe(2)
  })

  it('uses the LATEST of shot_date and the last correction — a just-bounced item is not stuck', () => {
    const o = computeOverview({
      items: [
        item({ id: 'bounced', status: 'editing', shot_date: '2026-06-01', corrections: [{ correction_date: TODAY }] }),
      ],
      shoots: [], ads: [], today: TODAY,
    })
    expect(o.attention.find(a => a.kind === 'stuck-editing')).toBeUndefined()
  })

  it('still flags an item whose last correction was itself 7+ days ago', () => {
    const o = computeOverview({
      items: [
        item({ id: 'stale-correction', status: 'editing', shot_date: '2026-06-01', corrections: [{ correction_date: '2026-07-07' }] }),
      ],
      shoots: [], ads: [], today: TODAY,
    })
    expect(o.attention.find(a => a.kind === 'stuck-editing')?.count).toBe(1)
  })

  it('an ads-video item with no shot_date falls back to voiceover_date', () => {
    const o = computeOverview({
      items: [
        item({ id: 'av', status: 'editing', source: 'ads_video', shot_date: null, voiceover_date: '2026-07-07', created_at: '2026-07-01T09:00:00Z' }),
      ],
      shoots: [], ads: [], today: TODAY,
    })
    // 7 days since voiceover_date -> stuck
    expect(o.attention.find(a => a.kind === 'stuck-editing')?.count).toBe(1)
  })
})

describe('needs attention — shoots today and repeat bounces', () => {
  it('counts shoots scheduled today', () => {
    const o = computeOverview({
      items: [],
      shoots: [
        shoot({ id: '1', status: 'scheduled', start_time: `${TODAY}T09:00:00` }),
        shoot({ id: '2', status: 'scheduled', start_time: `${TODAY}T14:00:00` }),
        shoot({ id: '3', status: 'completed', start_time: `${TODAY}T08:00:00` }),
        shoot({ id: '4', status: 'scheduled', start_time: '2026-07-20T09:00:00' }),
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

describe('needs attention — awaiting review and in scripting', () => {
  it('counts items sitting in on_review', () => {
    const o = computeOverview({
      items: [item({ id: '1', status: 'on_review' }), item({ id: '2', status: 'on_review' }), item({ id: '3', status: 'editing' })],
      shoots: [], ads: [], today: TODAY,
    })
    const entry = o.attention.find(a => a.kind === 'awaiting-review')
    expect(entry?.count).toBe(2)
    expect(entry?.target).toEqual({ mode: 'video', tab: 'pipeline' })
  })

  it('counts ads-video items in scripting or voiceover', () => {
    const o = computeOverview({
      items: [
        item({ id: '1', status: 'scripting', source: 'ads_video' }),
        item({ id: '2', status: 'voiceover', source: 'ads_video' }),
        item({ id: '3', status: 'ready_to_edit', source: 'shoot' }),
      ],
      shoots: [], ads: [], today: TODAY,
    })
    const entry = o.attention.find(a => a.kind === 'in-scripting')
    expect(entry?.count).toBe(2)
    expect(entry?.target).toEqual({ mode: 'video', tab: 'adsvideo' })
  })
})

describe('needs attention — ordering and empty state', () => {
  it('omits zero-count entries entirely', () => {
    const o = computeOverview({
      items: [item({ status: 'ready_to_edit' })],
      shoots: [], ads: [], today: TODAY,
    })
    expect(o.attention).toEqual([])
  })
})

describe('range filter — scopes stage counts, not posting/attention', () => {
  it('excludes items created outside the range from stage counts', () => {
    const o = computeOverview({
      items: [
        item({ id: '1', status: 'ready_to_edit', created_at: '2026-06-15T00:00:00Z' }),
        item({ id: '2', status: 'ready_to_edit', created_at: '2026-07-10T00:00:00Z' }),
      ],
      shoots: [], ads: [], today: TODAY,
      range: { from: '2026-07-01', to: '2026-07-31' },
    })
    expect(o.videos.ready_to_edit).toBe(1)
  })

  it('excludes shoots and ads created outside the range', () => {
    const o = computeOverview({
      items: [],
      shoots: [
        shoot({ id: 's1', status: 'completed', created_at: '2026-06-01T00:00:00Z' }),
        shoot({ id: 's2', status: 'completed', created_at: '2026-07-10T00:00:00Z' }),
      ],
      ads: [
        ad({ id: 'a1', status: 'active', created_at: '2026-06-01T00:00:00Z' }),
        ad({ id: 'a2', status: 'active', created_at: '2026-07-10T00:00:00Z' }),
      ],
      today: TODAY,
      range: { from: '2026-07-01', to: '2026-07-31' },
    })
    expect(o.shoots.completed).toBe(1)
    expect(o.ads.active).toBe(1)
  })

  it('does not affect posting or attention counts, even outside the range', () => {
    const o = computeOverview({
      items: [
        item({
          id: '1', status: 'ready_to_post', created_at: '2026-01-01T00:00:00Z',
          scheduled_post_date: '2026-07-01',
        }),
      ],
      shoots: [], ads: [], today: TODAY,
      range: { from: '2026-07-10', to: '2026-07-14' },
    })
    expect(o.posting.overdue).toBe(1)
    expect(o.attention.find(a => a.kind === 'overdue')?.count).toBe(1)
  })

  it('with no range, behaves exactly as before (everything counted)', () => {
    const o = computeOverview({
      items: [item({ id: '1', status: 'ready_to_edit', created_at: '2020-01-01T00:00:00Z' })],
      shoots: [shoot({ created_at: '2020-01-01T00:00:00Z' })],
      ads: [ad({ created_at: '2020-01-01T00:00:00Z' })],
      today: TODAY,
    })
    expect(o.videos.ready_to_edit).toBe(1)
    expect(o.shoots.scheduled).toBe(1)
    expect(o.ads.active).toBe(1)
  })
})
