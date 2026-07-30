import { describe, it, expect } from 'vitest'
import { computeOverview, computeTodayAndAllTime, type OverviewItem, type OverviewShoot, type OverviewAd } from './overview'

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
    corrections: [],
    posts: [],
    posted_ads: false,
    scheduled_post_date: null,
    ...overrides,
  }
}
function shoot(overrides: Partial<OverviewShoot> = {}): OverviewShoot {
  return { id: 's1', status: 'scheduled', start_time: `${TODAY}T09:00:00`, created_at: `${TODAY}T09:00:00Z`, ...overrides }
}
function ad(overrides: Partial<OverviewAd> = {}): OverviewAd {
  return { id: 'a1', status: 'active', created_at: `${TODAY}T09:00:00Z`, launch_date: null, ...overrides }
}
const EMPTY_STAGES = { scripting: 0, voiceover: 0, design: 0, ready_to_edit: 0, edited: 0, on_review: 0, branding_ready: 0, ads_ready: 0, posted: 0, cancelled: 0 }

describe('stage counts', () => {
  it('splits video and poster counts by content_type', () => {
    const o = computeOverview({
      items: [
        item({ id: '1', content_type: 'video', status: 'ready_to_edit' }),
        item({ id: '2', content_type: 'video', status: 'on_review' }),
        item({ id: '3', content_type: 'poster', status: 'branding_ready' }),
        item({ id: '4', content_type: 'poster', status: 'posted' }),
      ],
      shoots: [], ads: [], today: TODAY,
    })
    expect(o.videos).toEqual({ ...EMPTY_STAGES, ready_to_edit: 1, on_review: 1 })
    expect(o.posters).toEqual({ ...EMPTY_STAGES, branding_ready: 1, posted: 1 })
  })

  it('returns all-zero counts for empty input', () => {
    const o = computeOverview({ items: [], shoots: [], ads: [], today: TODAY })
    expect(o.videos).toEqual(EMPTY_STAGES)
    expect(o.posters).toEqual(EMPTY_STAGES)
    expect(o.attention).toEqual([])
  })
})

describe('posting counts', () => {
  it('counts items waiting in Branding Ready and Ads Ready separately', () => {
    const o = computeOverview({
      items: [
        item({ id: '1', status: 'branding_ready' }),
        item({ id: '2', status: 'branding_ready' }),
        item({ id: '3', status: 'ads_ready' }),
        item({ id: '4', status: 'posted' }),
        item({ id: '5', status: 'on_review' }),
      ],
      shoots: [], ads: [], today: TODAY,
    })
    expect(o.posting.brandingWaiting).toBe(2)
    expect(o.posting.adsWaiting).toBe(1)
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

describe('needs attention — branding/ads waiting', () => {
  it('reports items waiting to post as Branding, pointing at the Branding tab', () => {
    const o = computeOverview({
      items: [item({ status: 'branding_ready' })],
      shoots: [], ads: [], today: TODAY,
    })
    const entry = o.attention.find(a => a.kind === 'branding-waiting')
    expect(entry?.count).toBe(1)
    expect(entry?.target).toEqual({ mode: 'video', tab: 'log' })
  })

  it('reports items waiting to post as Ads, pointing at the Advertisement tab', () => {
    const o = computeOverview({
      items: [item({ status: 'ads_ready' })],
      shoots: [], ads: [], today: TODAY,
    })
    const entry = o.attention.find(a => a.kind === 'ads-waiting')
    expect(entry?.count).toBe(1)
    expect(entry?.target).toEqual({ mode: 'video', tab: 'adlog' })
  })
})

describe('needs attention — stuck before review', () => {
  it('flags an item sitting in Ready to Edit for 7+ days, but not 6', () => {
    const o = computeOverview({
      items: [
        item({ id: 'six', status: 'ready_to_edit', shot_date: '2026-07-08' }),
        item({ id: 'seven', status: 'ready_to_edit', shot_date: '2026-07-07' }),
        item({ id: 'eight', status: 'ready_to_edit', shot_date: '2026-07-06' }),
      ],
      shoots: [], ads: [], today: TODAY,
    })
    expect(o.attention.find(a => a.kind === 'stuck-editing')?.count).toBe(2)
  })

  it('also flags a poster sitting in Design for 7+ days', () => {
    const o = computeOverview({
      items: [
        item({ id: 'poster', content_type: 'poster', source: 'poster', status: 'design', shot_date: '2026-07-01' }),
      ],
      shoots: [], ads: [], today: TODAY,
    })
    expect(o.attention.find(a => a.kind === 'stuck-editing')?.count).toBe(1)
  })

  it('uses the LATEST of shot_date and the last correction — a just-bounced item is not stuck', () => {
    const o = computeOverview({
      items: [
        item({ id: 'bounced', status: 'ready_to_edit', shot_date: '2026-06-01', corrections: [{ correction_date: TODAY }] }),
      ],
      shoots: [], ads: [], today: TODAY,
    })
    expect(o.attention.find(a => a.kind === 'stuck-editing')).toBeUndefined()
  })

  it('still flags an item whose last correction was itself 7+ days ago', () => {
    const o = computeOverview({
      items: [
        item({ id: 'stale-correction', status: 'ready_to_edit', shot_date: '2026-06-01', corrections: [{ correction_date: '2026-07-07' }] }),
      ],
      shoots: [], ads: [], today: TODAY,
    })
    expect(o.attention.find(a => a.kind === 'stuck-editing')?.count).toBe(1)
  })

  it('an ads-video item with no shot_date falls back to voiceover_date', () => {
    const o = computeOverview({
      items: [
        item({ id: 'av', status: 'ready_to_edit', source: 'ads_video', shot_date: null, voiceover_date: '2026-07-07', created_at: '2026-07-01T09:00:00Z' }),
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
      items: [item({ id: '1', status: 'on_review' }), item({ id: '2', status: 'on_review' }), item({ id: '3', status: 'branding_ready' })],
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
      // Shot today, not 7+ days ago — otherwise this itself would trip stuck-editing.
      items: [item({ status: 'ready_to_edit', shot_date: TODAY, created_at: `${TODAY}T09:00:00Z` })],
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
        item({ id: '1', status: 'branding_ready', created_at: '2026-01-01T00:00:00Z' }),
      ],
      shoots: [], ads: [], today: TODAY,
      range: { from: '2026-07-10', to: '2026-07-14' },
    })
    expect(o.posting.brandingWaiting).toBe(1)
    expect(o.attention.find(a => a.kind === 'branding-waiting')?.count).toBe(1)
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

describe('computeTodayAndAllTime', () => {
  it('counts shoots scheduled today, ignoring completed/cancelled ones', () => {
    const r = computeTodayAndAllTime({
      items: [], ads: [],
      shoots: [
        shoot({ id: 's1', status: 'scheduled', start_time: `${TODAY}T09:00:00` }),
        shoot({ id: 's2', status: 'scheduled', start_time: '2026-07-13T09:00:00' }),
        shoot({ id: 's3', status: 'completed', start_time: `${TODAY}T09:00:00` }),
      ],
      today: TODAY,
    })
    expect(r.shootsToday).toBe(1)
  })

  it('counts items awaiting review as editingReviewsToday', () => {
    const r = computeTodayAndAllTime({
      items: [
        item({ id: '1', status: 'on_review' }),
        item({ id: '2', status: 'on_review' }),
        item({ id: '3', status: 'ready_to_edit' }),
      ],
      shoots: [], ads: [], today: TODAY,
    })
    expect(r.editingReviewsToday).toBe(2)
  })

  it('counts items with a branding (non-ads-platform) post dated today', () => {
    const r = computeTodayAndAllTime({
      items: [
        item({ id: '1', posts: [{ posted_date: TODAY, platform: 'instagram' }] }),
        item({ id: '2', posts: [{ posted_date: '2026-07-01', platform: 'instagram' }] }),
        item({ id: '3', posts: [{ posted_date: TODAY, platform: 'meta_ads' }] }),
      ],
      shoots: [], ads: [], today: TODAY,
    })
    expect(r.brandingPostsToday).toBe(1)
  })

  it('counts ads launching today', () => {
    const r = computeTodayAndAllTime({
      items: [], shoots: [],
      ads: [
        ad({ id: 'a1', launch_date: TODAY }),
        ad({ id: 'a2', launch_date: '2026-07-01' }),
      ],
      today: TODAY,
    })
    expect(r.adsToday).toBe(1)
  })

  it('counts all-time posted items regardless of month', () => {
    const r = computeTodayAndAllTime({
      items: [
        item({ id: '1', status: 'posted' }),
        item({ id: '2', status: 'posted' }),
        item({ id: '3', status: 'ready_to_edit' }),
      ],
      shoots: [], ads: [], today: TODAY,
    })
    expect(r.postedAllTime).toBe(2)
  })

  it('counts all-time items ever posted to an ads destination via posted_ads', () => {
    const r = computeTodayAndAllTime({
      items: [
        item({ id: '1', posted_ads: true }),
        item({ id: '2', posted_ads: false }),
      ],
      shoots: [], ads: [], today: TODAY,
    })
    expect(r.usedInAdsAllTime).toBe(1)
  })

  it('counts branding-ready items whose scheduled_post_date has passed as overdue', () => {
    const r = computeTodayAndAllTime({
      items: [
        item({ id: '1', status: 'branding_ready', scheduled_post_date: '2026-07-01' }),
        item({ id: '2', status: 'branding_ready', scheduled_post_date: TODAY }),
        item({ id: '3', status: 'branding_ready', scheduled_post_date: null }),
        item({ id: '4', status: 'ads_ready', scheduled_post_date: '2026-07-01' }),
      ],
      shoots: [], ads: [], today: TODAY,
    })
    expect(r.overdueBrandingCount).toBe(1)
  })

  it('counts ads currently in testing', () => {
    const r = computeTodayAndAllTime({
      items: [], shoots: [],
      ads: [ad({ id: 'a1', status: 'testing' }), ad({ id: 'a2', status: 'active' })],
      today: TODAY,
    })
    expect(r.adsInTestingCount).toBe(1)
  })

  it('returns all zeros for empty input', () => {
    const r = computeTodayAndAllTime({ items: [], shoots: [], ads: [], today: TODAY })
    expect(r).toEqual({
      shootsToday: 0, editingReviewsToday: 0, brandingPostsToday: 0, adsToday: 0,
      postedAllTime: 0, usedInAdsAllTime: 0, overdueBrandingCount: 0, adsInTestingCount: 0,
    })
  })
})
