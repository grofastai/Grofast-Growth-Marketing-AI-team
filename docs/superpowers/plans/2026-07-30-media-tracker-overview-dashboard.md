# Media Tracker Overview Dashboard Redesign (Phase 1) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the Media Tracker's current Overview tab render with a two-tone
"status rail + main column" layout (per the approved Artifact mockup, v6), backed by two
new pure calculation modules, without touching `PageHero`, `TrackerNav`, or any other tab.

**Architecture:** Two new pure/testable modules (`lib/media-tracker/overview.ts` extended,
`lib/media-tracker/delivery-status.ts` new) compute everything the dashboard needs from
data the component already holds. Four new presentational components live in
`components/media-tracker/overview/` and are composed by `overview-dashboard.tsx`, which
`media-tracker-client.tsx` renders in place of its current inline `mode === "overview"`
JSX block. No new Server Actions, no schema changes.

**Tech Stack:** Next.js 15 App Router, React 19 client component, TypeScript strict,
Vitest, inline `style={{}}` objects (matching this file's existing convention — no
Tailwind component classes beyond flex/grid layout utility classes, `lucide-react` icons).

## Global Constraints

- No schema/migration changes. Every new number is derived from `content_items`,
  `ads_tracker`, `shoots`, and `content_client_targets` data already loaded.
- `PageHero`, `TrackerNav`, and every other tab (Video/Poster/Ads/Schedule) are untouched.
- Fonts: headings/big numbers/client names use `var(--font-fraunces)` (already declared in
  `app/layout.tsx`, unused elsewhere); body/data text relies on the existing global
  `var(--font-jakarta)` — do not import or reference any other font family.
- Filter bar ships with only 2 working controls (content type + month/range); Search, Team
  Member, Platform, and Status render but are visually inert in this phase (per the
  approved spec).
- "N ad campaigns pending approval" flow-flag is relabeled to count `status === 'testing'`
  ads — no new ad-approval concept.
- Target editing (`EditableTargetCell` / `handleSetOverviewTarget`) is **not** carried into
  the new Client Delivery Status table — Target is read-only there in Phase 1. Both stay
  defined but temporarily uncalled in `media-tracker-client.tsx`, to be reconnected by
  Phase 3's per-client Branding dashboard (single client + single content type is the
  right context for inline editing, not a combined multi-client/multi-content-type table).
- Reference design doc: `docs/superpowers/specs/2026-07-30-media-tracker-overview-dashboard-design.md`.
- Reference visual source of truth: the approved Artifact mockup (v6) — exact spacing,
  gradients, and shadows should match it; this plan specifies structure, data, and
  representative styling, not a pixel-for-pixel CSS transcript.

---

### Task 1: Extend `lib/media-tracker/overview.ts` with today/all-time counts

**Files:**
- Modify: `lib/media-tracker/overview.ts`
- Test: `lib/media-tracker/overview.test.ts`

**Interfaces:**
- Consumes: nothing new — extends the existing `OverviewInput`/`OverviewItem`/`OverviewAd`
  types already exported from this file.
- Produces: `computeTodayAndAllTime(input: OverviewInput): TodayAndAllTime`, and the
  widened `OverviewItem`/`OverviewAd` types (adds `posts`, `posted_ads`,
  `scheduled_post_date` to `OverviewItem`; adds `launch_date` to `OverviewAd`) — Task 3
  and Task 6 consume this function and these types.

- [ ] **Step 1: Write the failing tests**

Add to the bottom of `lib/media-tracker/overview.test.ts` (the file already imports
`describe, it, expect` from `vitest` and has `item()`/`shoot()`/`ad()` factories at the
top — extend those factories in place rather than duplicating them):

```ts
// Update the existing item() factory (near the top of the file) to include the new
// fields, defaulted so every existing call site keeps working unchanged:
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
// Update the existing ad() factory the same way:
function ad(overrides: Partial<OverviewAd> = {}): OverviewAd {
  return { id: 'a1', status: 'active', created_at: `${TODAY}T09:00:00Z`, launch_date: null, ...overrides }
}

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
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `pnpm test lib/media-tracker/overview.test.ts`
Expected: FAIL — `computeTodayAndAllTime is not a function` (and type errors on the
widened `posts`/`posted_ads`/`scheduled_post_date`/`launch_date` fields not existing yet).

- [ ] **Step 3: Widen the types and implement `computeTodayAndAllTime`**

In `lib/media-tracker/overview.ts`, widen `OverviewItem` and `OverviewAd` (the real
`ContentItem`/`Ad` types in `media-tracker-client.tsx` are already supersets, so passing
them in still works with no conversion):

```ts
export type OverviewItem = {
  id: string
  content_type: 'video' | 'poster'
  status: OverviewStatus
  source: 'shoot' | 'ads_video' | 'poster'
  shot_date: string | null
  voiceover_date: string | null
  created_at: string
  corrections: { correction_date: string }[]
  // Added for computeTodayAndAllTime (Overview Dashboard redesign, Phase 1).
  posts: { posted_date: string; platform: string }[]
  posted_ads: boolean
  scheduled_post_date: string | null
}
```

```ts
export type OverviewAd = {
  id: string
  status: OverviewAdStatus
  created_at: string
  // Added for computeTodayAndAllTime (Overview Dashboard redesign, Phase 1).
  launch_date: string | null
}
```

Add near the bottom of the file, after `computeOverview`:

```ts
// Mirrors ADS_PLATFORM_SET in media-tracker-client.tsx — kept as a small local copy
// rather than importing from the client component, matching the precedent already set
// by that constant's own comment ("Mirrors ADS_PLATFORMS in lib/actions/media-tracker.ts").
const ADS_PLATFORMS = new Set(['ads', 'meta_ads', 'google_ads'])

export type TodayAndAllTime = {
  shootsToday: number
  editingReviewsToday: number
  brandingPostsToday: number
  adsToday: number
  postedAllTime: number
  usedInAdsAllTime: number
  overdueBrandingCount: number
  adsInTestingCount: number
}

// Powers the Overview Dashboard's rail ("Today's Operations") and main-column flow line
// ("How Work Moves"). Kept separate from computeOverview() (rather than folded into its
// return type) so that function's existing return shape and tests stay untouched.
export function computeTodayAndAllTime({ items, shoots, ads, today }: OverviewInput): TodayAndAllTime {
  const shootsToday = shoots.filter(
    s => s.status === 'scheduled' && s.start_time.slice(0, 10) === today
  ).length

  const editingReviewsToday = items.filter(i => i.status === 'on_review').length

  const brandingPostsToday = items.filter(i =>
    i.posts.some(p => p.posted_date === today && !ADS_PLATFORMS.has(p.platform))
  ).length

  const adsToday = ads.filter(a => a.launch_date === today).length

  const postedAllTime = items.filter(i => i.status === 'posted').length

  const usedInAdsAllTime = items.filter(i => i.posted_ads).length

  const overdueBrandingCount = items.filter(
    i => i.status === 'branding_ready' && !!i.scheduled_post_date && i.scheduled_post_date < today
  ).length

  const adsInTestingCount = ads.filter(a => a.status === 'testing').length

  return {
    shootsToday, editingReviewsToday, brandingPostsToday, adsToday,
    postedAllTime, usedInAdsAllTime, overdueBrandingCount, adsInTestingCount,
  }
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `pnpm test lib/media-tracker/overview.test.ts`
Expected: PASS — all existing tests in this file still pass (the widened types only add
optional-in-practice fields via the factory defaults) plus all new `computeTodayAndAllTime`
tests pass.

- [ ] **Step 5: Typecheck**

Run: `pnpm typecheck`
Expected: no new errors. (`media-tracker-client.tsx` isn't touched yet, so its existing
calls into `computeOverview` are unaffected by the widened types.)

- [ ] **Step 6: Commit**

```bash
git add lib/media-tracker/overview.ts lib/media-tracker/overview.test.ts
git commit -m "feat(media-tracker): add computeTodayAndAllTime for the Overview Dashboard redesign"
```

---

### Task 2: Create `lib/media-tracker/delivery-status.ts`

**Files:**
- Create: `lib/media-tracker/delivery-status.ts`
- Create: `lib/media-tracker/delivery-status.test.ts`

**Interfaces:**
- Consumes: `ContentItem`, `ClientTarget` types (imported type-only from
  `@/components/media-tracker/media-tracker-client`, the same pattern
  `lib/data/media-tracker.ts` already uses).
- Produces: `monthElapsedPct(today: string, month: string): number`,
  `paceStatus(completionPct: number, monthElapsedPct: number, target: number, published: number): DeliveryStatus`,
  `computeMonthlyBrandingRollup(items, clientTargets, month): MonthlyRollup`,
  `computeClientDeliveryStatus(items, clientTargets, month, today): ClientDeliveryRow[]`
  — Task 3 and Task 4 consume these.

- [ ] **Step 1: Write the failing tests**

Create `lib/media-tracker/delivery-status.test.ts`:

```ts
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
    expect(r).toEqual({ target: 23, completed: 2, remaining: 21, completionPct: expect.closeTo(2 / 23 * 100, 5) })
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
    expect(rows).toEqual([
      {
        client: 'Acme', target: 6, published: 1, editing: 1, readyToPublish: 1,
        remaining: 5, completionPct: expect.closeTo(1 / 6 * 100, 5), status: 'behind',
      },
    ])
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
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `pnpm test lib/media-tracker/delivery-status.test.ts`
Expected: FAIL — module `./delivery-status` does not exist.

- [ ] **Step 3: Implement `lib/media-tracker/delivery-status.ts`**

```ts
// Company-wide and per-client Branding roll-ups for the Overview Dashboard's Monthly
// Progress ring and Client Delivery Status table. Kept out of lib/media-tracker/overview.ts
// because these operate on the full ContentItem/ClientTarget shape (client_name, posts,
// posted_branding) rather than that module's narrower, content-agnostic OverviewItem —
// same reasoning that keeps pipeline-transitions.ts and schedule.ts as separate modules.

// Structural, minimal input types — the real ContentItem/ClientTarget (in
// media-tracker-client.tsx) are supersets and assign to these without conversion,
// mirroring the pattern used by lib/media-tracker/overview.ts's OverviewItem.
export type DeliveryItem = {
  id: string
  client_name: string
  content_type: 'video' | 'poster'
  status: 'scripting' | 'voiceover' | 'design' | 'ready_to_edit' | 'edited'
    | 'on_review' | 'branding_ready' | 'ads_ready' | 'posted' | 'cancelled'
  posted_branding: boolean
  posts: { posted_date: string; platform: string }[]
}
export type DeliveryClientTarget = {
  client_name: string
  kind: 'branding' | 'ads'
  content_type: 'video' | 'poster'
  month: string // 'YYYY-MM'
  target: number
}

export type DeliveryStatus = 'on_track' | 'behind' | 'completed'

export type MonthlyRollup = { target: number; completed: number; remaining: number; completionPct: number }
export type ClientDeliveryRow = {
  client: string
  target: number
  published: number
  editing: number
  readyToPublish: number
  remaining: number
  completionPct: number
  status: DeliveryStatus
}

function daysInMonth(month: string): number {
  const [y, m] = month.split('-').map(Number)
  return new Date(y, m, 0).getDate()
}

// How far into `month` `today` is, as a 0-100 percentage. A month entirely before today's
// month is fully elapsed (100); a month entirely after is not yet started (0) — so viewing
// a past or future month never produces a nonsensical "behind" reading.
export function monthElapsedPct(today: string, month: string): number {
  const todayMonth = today.slice(0, 7)
  if (todayMonth > month) return 100
  if (todayMonth < month) return 0
  const dayOfMonth = Number(today.slice(8, 10))
  return (dayOfMonth / daysInMonth(month)) * 100
}

// Completed once Published >= Target (and Target > 0). Otherwise On Track when completion%
// keeps pace with the % of the month elapsed so far; Behind when it trails. A zero target
// reads as On Track with nothing published (nothing owed yet) or Completed once anything
// has been published against it (there was nothing to fall behind on).
export function paceStatus(completionPct: number, elapsedPct: number, target: number, published: number): DeliveryStatus {
  if (target === 0) return published > 0 ? 'completed' : 'on_track'
  if (published >= target) return 'completed'
  return completionPct >= elapsedPct ? 'on_track' : 'behind'
}

function completionPctOf(published: number, target: number): number {
  if (target === 0) return published > 0 ? 100 : 0
  return (published / target) * 100
}

// Was this branding item published (to any organic platform) within `month`?
function publishedInMonth(item: DeliveryItem, month: string): boolean {
  if (!item.posted_branding) return false
  return item.posts.some(p => p.posted_date.slice(0, 7) === month)
}

export function computeMonthlyBrandingRollup(
  items: DeliveryItem[], clientTargets: DeliveryClientTarget[], month: string,
): MonthlyRollup {
  const target = clientTargets
    .filter(t => t.kind === 'branding' && t.month === month)
    .reduce((sum, t) => sum + t.target, 0)
  const completed = items.filter(i => i.status !== 'cancelled' && publishedInMonth(i, month)).length
  const remaining = Math.max(target - completed, 0)
  return { target, completed, remaining, completionPct: completionPctOf(completed, target) }
}

export function computeClientDeliveryStatus(
  items: DeliveryItem[], clientTargets: DeliveryClientTarget[], month: string, today: string,
): ClientDeliveryRow[] {
  const clients = new Set<string>()
  for (const i of items) if (i.status !== 'cancelled') clients.add(i.client_name)
  for (const t of clientTargets) if (t.kind === 'branding' && t.month === month) clients.add(t.client_name)

  const elapsedPct = monthElapsedPct(today, month)

  return Array.from(clients).map(client => {
    const clientItems = items.filter(i => i.client_name === client && i.status !== 'cancelled')
    const target = clientTargets
      .filter(t => t.client_name === client && t.kind === 'branding' && t.month === month)
      .reduce((sum, t) => sum + t.target, 0)
    const published = clientItems.filter(i => publishedInMonth(i, month)).length
    const editing = clientItems.filter(i => i.status === 'ready_to_edit' || i.status === 'edited').length
    const readyToPublish = clientItems.filter(i => i.status === 'branding_ready').length
    const remaining = Math.max(target - published, 0)
    const completionPct = completionPctOf(published, target)
    return {
      client, target, published, editing, readyToPublish, remaining, completionPct,
      status: paceStatus(completionPct, elapsedPct, target, published),
    }
  }).sort((a, b) => a.client.localeCompare(b.client))
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `pnpm test lib/media-tracker/delivery-status.test.ts`
Expected: PASS on all cases.

- [ ] **Step 5: Typecheck and lint**

Run: `pnpm typecheck && pnpm lint`
Expected: clean.

- [ ] **Step 6: Commit**

```bash
git add lib/media-tracker/delivery-status.ts lib/media-tracker/delivery-status.test.ts
git commit -m "feat(media-tracker): add delivery-status module for the Overview Dashboard redesign"
```

---

### Task 3: Build `overview-rail.tsx` (Needs Attention, Today's Operations, Monthly Progress ring)

**Files:**
- Create: `components/media-tracker/overview/overview-rail.tsx`

**Interfaces:**
- Consumes: `AttentionItem` type from `@/lib/media-tracker/overview`, `TodayAndAllTime`
  type and shape from Task 1, `MonthlyRollup` shape from Task 2.
- Produces: `<OverviewRail attention={...} today={...} monthlyRollup={...} onAttentionClick={...} monthLabel={...} />`
  — Task 6 consumes this component.

- [ ] **Step 1: Write the component**

```tsx
// components/media-tracker/overview/overview-rail.tsx
import { AlertTriangle, Video, Megaphone, Camera, Pencil } from "lucide-react"
import type { AttentionItem } from "@/lib/media-tracker/overview"
import type { TodayAndAllTime } from "@/lib/media-tracker/overview"
import type { MonthlyRollup } from "@/lib/media-tracker/delivery-status"

const RAIL_BG = "linear-gradient(165deg,#0B0F1A,#1B2233)"
const GOLD = "#C9A15A"

function RingProgress({ pct }: { pct: number }) {
  const r = 52
  const circumference = 2 * Math.PI * r
  const clamped = Math.max(0, Math.min(100, pct))
  const offset = circumference * (1 - clamped / 100)
  return (
    <div style={{ position: "relative", width: 132, height: 132, margin: "2px auto 8px" }}>
      <svg width="132" height="132" viewBox="0 0 120 120">
        <circle cx="60" cy="60" r={r} fill="none" stroke="rgba(255,255,255,0.14)" strokeWidth="10" />
        <circle cx="60" cy="60" r={r} fill="none" stroke={GOLD} strokeWidth="10" strokeLinecap="round"
          strokeDasharray={circumference} strokeDashoffset={offset} transform="rotate(-90 60 60)" />
      </svg>
      <div style={{ position: "absolute", inset: 0, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center" }}>
        <span style={{ fontFamily: "var(--font-fraunces)", fontWeight: 700, fontSize: 24, color: "#fff" }}>{Math.round(clamped)}%</span>
        <span style={{ fontSize: 9, color: "rgba(255,255,255,0.5)", textTransform: "uppercase", letterSpacing: "0.06em", marginTop: 2 }}>of target</span>
      </div>
    </div>
  )
}

export function OverviewRail({
  attention, today, monthlyRollup, onAttentionClick, monthLabel,
}: {
  attention: AttentionItem[]
  today: TodayAndAllTime
  monthlyRollup: MonthlyRollup
  onAttentionClick: (target: AttentionItem["target"]) => void
  monthLabel: string
}) {
  return (
    <aside style={{
      position: "relative", overflow: "hidden", background: RAIL_BG, borderRadius: 20,
      padding: "26px 22px 26px 34px", color: "#fff", display: "flex", flexDirection: "column", gap: 24,
      boxShadow: "0 14px 30px rgba(11,15,26,0.28)",
    }}>
      <div style={{
        position: "absolute", left: 0, top: 0, bottom: 0, width: 14,
        backgroundImage: "radial-gradient(circle at 7px 11px, rgba(201,161,90,0.35) 3px, transparent 3.6px)",
        backgroundSize: "14px 24px", backgroundRepeat: "repeat-y",
      }} />

      <div>
        <p style={{ fontFamily: "var(--font-fraunces)", fontStyle: "italic", fontSize: 12.5, color: "rgba(255,255,255,0.5)", margin: "0 0 2px" }}>Live status</p>
        <h3 style={{ fontFamily: "var(--font-fraunces)", fontWeight: 700, fontSize: 18, color: "#fff", margin: "0 0 12px" }}>Needs attention</h3>
        {attention.length === 0 ? (
          <p style={{ fontSize: 12, fontWeight: 600, color: "#6EE7A5", margin: 0 }}>All clear — nothing overdue or stalled.</p>
        ) : (
          attention.map((a, i) => (
            <button key={a.kind} onClick={() => onAttentionClick(a.target)}
              className="flex items-center justify-between text-left"
              style={{
                width: "100%", gap: 8, padding: "8px 0", border: "none", background: "transparent", cursor: "pointer",
                borderTop: i === 0 ? "none" : "1px solid rgba(255,255,255,0.08)",
              }}>
              <span style={{ fontSize: 12, fontWeight: 650, color: "rgba(255,255,255,0.86)" }}>{a.label}</span>
              <span style={{ fontSize: 10.5, fontWeight: 800, padding: "2px 8px", borderRadius: 999, background: "rgba(248,113,113,0.18)", color: "#FCA5A5", flexShrink: 0 }}>{a.count}</span>
            </button>
          ))
        )}
      </div>

      <div style={{ height: 1, background: "linear-gradient(90deg, rgba(201,161,90,0.55), rgba(201,161,90,0))" }} />

      <div>
        <p style={{ fontFamily: "var(--font-fraunces)", fontStyle: "italic", fontSize: 12.5, color: "rgba(255,255,255,0.5)", margin: "0 0 2px" }}>Today</p>
        <h3 style={{ fontFamily: "var(--font-fraunces)", fontWeight: 700, fontSize: 18, color: "#fff", margin: "0 0 12px" }}>At a glance</h3>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "16px 14px" }}>
          {[
            { icon: Video, label: "Branding Posts", value: today.brandingPostsToday },
            { icon: Megaphone, label: "Advertisements", value: today.adsToday },
            { icon: Camera, label: "Shoots", value: today.shootsToday },
            { icon: Pencil, label: "Editing Reviews", value: today.editingReviewsToday },
          ].map(({ label, value }) => (
            <div key={label}>
              <div style={{ fontFamily: "var(--font-fraunces)", fontWeight: 700, fontSize: 25, color: "#fff" }}>{value}</div>
              <div style={{ fontSize: 10, fontWeight: 650, color: "rgba(255,255,255,0.5)", textTransform: "uppercase", letterSpacing: "0.05em", marginTop: 3 }}>{label}</div>
            </div>
          ))}
        </div>
      </div>

      <div style={{ height: 1, background: "linear-gradient(90deg, rgba(201,161,90,0.55), rgba(201,161,90,0))" }} />

      <div>
        <p style={{ fontFamily: "var(--font-fraunces)", fontStyle: "italic", fontSize: 12.5, color: "rgba(255,255,255,0.5)", margin: "0 0 2px" }}>{monthLabel}</p>
        <h3 style={{ fontFamily: "var(--font-fraunces)", fontWeight: 700, fontSize: 18, color: "#fff", margin: "0 0 12px" }}>Branding progress</h3>
        <RingProgress pct={monthlyRollup.completionPct} />
        <div style={{ display: "flex", flexDirection: "column", gap: 9 }}>
          {[
            { label: "Target", value: monthlyRollup.target },
            { label: "Completed", value: monthlyRollup.completed },
            { label: "Remaining", value: monthlyRollup.remaining },
          ].map(row => (
            <div key={row.label} style={{ display: "flex", justifyContent: "space-between", fontSize: 12 }}>
              <span style={{ color: "rgba(255,255,255,0.55)", fontWeight: 600 }}>{row.label}</span>
              <span style={{ fontWeight: 800, color: "#fff", fontVariantNumeric: "tabular-nums" }}>{row.value}</span>
            </div>
          ))}
        </div>
      </div>
    </aside>
  )
}
```

- [ ] **Step 2: Typecheck**

Run: `pnpm typecheck`
Expected: clean — this file isn't imported anywhere yet, but should still typecheck
standalone (no unresolved imports; `AttentionItem`/`TodayAndAllTime`/`MonthlyRollup` are
all exported from Task 1/Task 2's modules).

- [ ] **Step 3: Commit**

```bash
git add components/media-tracker/overview/overview-rail.tsx
git commit -m "feat(media-tracker): add OverviewRail component for the Overview Dashboard redesign"
```

---

### Task 4: Build `delivery-status-table.tsx`

**Files:**
- Create: `components/media-tracker/overview/delivery-status-table.tsx`

**Interfaces:**
- Consumes: `ClientDeliveryRow` type from Task 2.
- Produces: `<DeliveryStatusTable rows={...} />` — Task 6 consumes this component.

- [ ] **Step 1: Write the component**

```tsx
// components/media-tracker/overview/delivery-status-table.tsx
import type { ClientDeliveryRow, DeliveryStatus } from "@/lib/media-tracker/delivery-status"

const STATUS_LABEL: Record<DeliveryStatus, { label: string; color: string; bg: string }> = {
  on_track: { label: "On Track", color: "#16A34A", bg: "rgba(22,163,74,0.09)" },
  behind: { label: "Behind", color: "#D97706", bg: "rgba(217,119,6,0.09)" },
  completed: { label: "Completed", color: "#2563EB", bg: "rgba(37,99,235,0.09)" },
}

export function DeliveryStatusTable({ rows }: { rows: ClientDeliveryRow[] }) {
  if (rows.length === 0) {
    return (
      <div style={{ background: "#fff", border: "1px solid #DDE1E7", borderRadius: 14, padding: "24px 18px", textAlign: "center", fontSize: 12.5, fontWeight: 600, color: "#5B6472" }}>
        No branding activity or targets set for this month yet.
      </div>
    )
  }
  return (
    <div style={{ background: "#fff", border: "1px solid #DDE1E7", borderTop: "3px solid #2563EB", borderRadius: 14, overflow: "hidden", boxShadow: "0 1px 2px rgba(16,24,40,0.05)" }}>
      <div style={{ overflowX: "auto" }}>
        <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
          <thead>
            <tr>
              {["Client", "Target", "Published", "Editing", "Ready to Publish", "Remaining", "Completion", "Status"].map(h => (
                <th key={h} style={{
                  textAlign: h === "Client" ? "left" : "center", padding: "11px 18px", fontSize: 10.5, fontWeight: 800,
                  textTransform: "uppercase", letterSpacing: "0.06em", color: "#8A94A3", background: "#F4F5F7", whiteSpace: "nowrap",
                }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map(row => {
              const s = STATUS_LABEL[row.status]
              return (
                <tr key={row.client}>
                  <td style={{ padding: "12px 18px", borderTop: "1px solid #EBEEF2", fontFamily: "var(--font-fraunces)", fontStyle: "italic", fontWeight: 700, color: "#111827", whiteSpace: "nowrap" }}>{row.client}</td>
                  <td style={{ padding: "12px 18px", borderTop: "1px solid #EBEEF2", textAlign: "center", fontVariantNumeric: "tabular-nums", fontWeight: 650 }}>{row.target}</td>
                  <td style={{ padding: "12px 18px", borderTop: "1px solid #EBEEF2", textAlign: "center", fontVariantNumeric: "tabular-nums", fontWeight: 650 }}>{row.published}</td>
                  <td style={{ padding: "12px 18px", borderTop: "1px solid #EBEEF2", textAlign: "center", fontVariantNumeric: "tabular-nums", fontWeight: 650 }}>{row.editing}</td>
                  <td style={{ padding: "12px 18px", borderTop: "1px solid #EBEEF2", textAlign: "center", fontVariantNumeric: "tabular-nums", fontWeight: 650 }}>{row.readyToPublish}</td>
                  <td style={{ padding: "12px 18px", borderTop: "1px solid #EBEEF2", textAlign: "center", fontVariantNumeric: "tabular-nums", fontWeight: 650 }}>{row.remaining}</td>
                  <td style={{ padding: "12px 18px", borderTop: "1px solid #EBEEF2", textAlign: "center" }}>
                    <span style={{ display: "inline-flex", alignItems: "center", gap: 8 }}>
                      <span style={{ width: 88, height: 7, borderRadius: 999, background: "#EBEEF2", display: "inline-block", overflow: "hidden" }}>
                        <span style={{ display: "block", height: "100%", borderRadius: 999, width: `${Math.min(100, row.completionPct)}%`, background: s.color }} />
                      </span>
                      <span style={{ fontWeight: 800 }}>{Math.round(row.completionPct)}%</span>
                    </span>
                  </td>
                  <td style={{ padding: "12px 18px", borderTop: "1px solid #EBEEF2", textAlign: "center" }}>
                    <span style={{ display: "inline-flex", alignItems: "center", gap: 6, fontSize: 11, fontWeight: 800, padding: "5px 12px", borderRadius: 999, background: s.bg, color: s.color }}>
                      {s.label}
                    </span>
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
      <div style={{ padding: "10px 18px", fontSize: 11, color: "#8A94A3", fontWeight: 600, borderTop: "1px solid #EBEEF2" }}>
        Status is pace-based: On Track keeps up with the % of the month elapsed; Behind trails it; Completed once Published ≥ Target.
      </div>
    </div>
  )
}
```

- [ ] **Step 2: Typecheck**

Run: `pnpm typecheck`
Expected: clean.

- [ ] **Step 3: Commit**

```bash
git add components/media-tracker/overview/delivery-status-table.tsx
git commit -m "feat(media-tracker): add DeliveryStatusTable component for the Overview Dashboard redesign"
```

---

### Task 5: Build `work-flow.tsx`

**Files:**
- Create: `components/media-tracker/overview/work-flow.tsx`

**Interfaces:**
- Consumes: plain number props (no new types) — the caller (Task 6) assembles these from
  `Overview` (existing `computeOverview` output) and `TodayAndAllTime` (Task 1).
- Produces: `<WorkFlow shoots={} editing={} readyToPublish={} scheduled={} postedAllTime={} usedInAdsAllTime={} adsInTestingCount={} overdueBrandingCount={} />`
  — Task 6 consumes this component.

- [ ] **Step 1: Write the component**

```tsx
// components/media-tracker/overview/work-flow.tsx
import { Camera, Pencil, FileCheck2, CalendarDays, Send, Megaphone } from "lucide-react"

type Node = { label: string; value: number; color: string; icon: typeof Camera }

export function WorkFlow({
  shoots, editing, readyToPublish, scheduled, postedAllTime, usedInAdsAllTime,
  adsInTestingCount, overdueBrandingCount,
}: {
  shoots: number
  editing: number
  readyToPublish: number
  scheduled: number
  postedAllTime: number
  usedInAdsAllTime: number
  adsInTestingCount: number
  overdueBrandingCount: number
}) {
  const nodes: Node[] = [
    { label: "Shoots", value: shoots, color: "#D97706", icon: Camera },
    { label: "Editing", value: editing, color: "#0D9488", icon: Pencil },
    { label: "Ready to Publish", value: readyToPublish, color: "#7C3AED", icon: FileCheck2 },
    { label: "Scheduled", value: scheduled, color: "#2563EB", icon: CalendarDays },
    { label: "Posted", value: postedAllTime, color: "#16A34A", icon: Send },
    { label: "Used in Ads", value: usedInAdsAllTime, color: "#DE1A1A", icon: Megaphone },
  ]
  return (
    <div>
      <div style={{ display: "flex", alignItems: "flex-start", overflowX: "auto", paddingBottom: 4, minWidth: 680 }}>
        {nodes.map((n, i) => (
          <div key={n.label} style={{
            flex: "1 1 0", minWidth: 84, display: "flex", flexDirection: "column", alignItems: "center", gap: 9,
            position: "relative", paddingTop: 2,
            borderRight: i < nodes.length - 1 ? undefined : undefined,
          }}>
            {i < nodes.length - 1 && (
              <div style={{ position: "absolute", top: 50, left: "50%", width: "100%", height: 2, background: "#DDE1E7", zIndex: 0 }} />
            )}
            <div style={{ height: 36, display: "flex", alignItems: "flex-end", justifyContent: "center" }}>
              <span style={{ fontFamily: "var(--font-fraunces)", fontSize: 26, fontWeight: 700, color: n.color, fontVariantNumeric: "tabular-nums" }}>{n.value}</span>
            </div>
            <span style={{ width: 14, height: 14, borderRadius: 999, background: n.color, border: "3px solid #F4F5F7", boxShadow: "0 0 0 1px #DDE1E7", position: "relative", zIndex: 1 }} />
            <span style={{ fontSize: 11, fontWeight: 700, color: "#5B6472", textAlign: "center" }}>{n.label}</span>
          </div>
        ))}
      </div>
      <div style={{ display: "flex", gap: 10, flexWrap: "wrap", marginTop: 20, paddingTop: 16, borderTop: "1px dashed #DDE1E7" }}>
        {adsInTestingCount > 0 && (
          <span style={{ display: "inline-flex", alignItems: "center", gap: 7, fontSize: 12, fontWeight: 700, padding: "6px 13px", borderRadius: 9, background: "rgba(217,119,6,0.09)", color: "#D97706" }}>
            {adsInTestingCount} ad{adsInTestingCount === 1 ? "" : "s"} in testing
          </span>
        )}
        {overdueBrandingCount > 0 && (
          <span style={{ display: "inline-flex", alignItems: "center", gap: 7, fontSize: 12, fontWeight: 700, padding: "6px 13px", borderRadius: 9, background: "rgba(222,26,26,0.09)", color: "#DE1A1A" }}>
            {overdueBrandingCount} branding post{overdueBrandingCount === 1 ? "" : "s"} overdue
          </span>
        )}
      </div>
    </div>
  )
}
```

- [ ] **Step 2: Typecheck**

Run: `pnpm typecheck`
Expected: clean.

- [ ] **Step 3: Commit**

```bash
git add components/media-tracker/overview/work-flow.tsx
git commit -m "feat(media-tracker): add WorkFlow component for the Overview Dashboard redesign"
```

---

### Task 6: Build `overview-dashboard.tsx` and wire it into `media-tracker-client.tsx`

**Files:**
- Create: `components/media-tracker/overview/overview-dashboard.tsx`
- Modify: `components/media-tracker/media-tracker-client.tsx:4669-4866` (replace the entire
  `{mode === "overview" && ( ... )}` block with a single `<OverviewDashboard />` render)

**Interfaces:**
- Consumes: `OverviewRail` (Task 3), `DeliveryStatusTable` (Task 4), `WorkFlow` (Task 5),
  `computeOverview`/`computeTodayAndAllTime`/`AttentionItem` (Task 1),
  `computeMonthlyBrandingRollup`/`computeClientDeliveryStatus` (Task 2), the existing
  `ContentItem`/`Shoot`/`Ad`/`ClientTarget` types, and existing local variables in
  `MediaTrackerClient` (`items`, `shoots`, `ads`, `clientTargets`, `today`, `goTo`,
  `overviewMonth`, `overviewRangeMode`, `overviewCustomFrom`, `overviewCustomTo`,
  `overviewMonthOptions`, `MonthSelect` — all already defined in the file, unchanged).
- Produces: nothing consumed further — this is the top-level composition for Phase 1.

- [ ] **Step 1: Write `overview-dashboard.tsx`**

This component takes the same raw data the client component already loads and does its
own memoized derivation — it does not require new props beyond what's already available,
keeping `MediaTrackerClient` itself nearly unchanged at the call site.

```tsx
// components/media-tracker/overview/overview-dashboard.tsx
"use client"

import { useMemo } from "react"
import { ChevronDown, Search as SearchIcon, Filter as FilterIcon } from "lucide-react"
import { computeOverview, computeTodayAndAllTime, type AttentionItem } from "@/lib/media-tracker/overview"
import { computeMonthlyBrandingRollup, computeClientDeliveryStatus } from "@/lib/media-tracker/delivery-status"
import { OverviewRail } from "./overview-rail"
import { DeliveryStatusTable } from "./delivery-status-table"
import { WorkFlow } from "./work-flow"
import type { ContentItem, Shoot, Ad, ClientTarget } from "@/components/media-tracker/media-tracker-client"

function fmtMonth(ym: string): string {
  const [y, m] = ym.split("-").map(Number)
  return new Date(y, m - 1, 1).toLocaleDateString("en-US", { month: "long", year: "numeric" })
}

export function OverviewDashboard({
  items, shoots, ads, clientTargets, today,
  monthFilter, onMonthFilterChange, monthOptions,
  onAttentionClick,
}: {
  items: ContentItem[]
  shoots: Shoot[]
  ads: Ad[]
  clientTargets: ClientTarget[]
  today: string
  monthFilter: string // 'YYYY-MM', defaults to the current month if not "all"-able here
  onMonthFilterChange: (month: string) => void
  monthOptions: string[]
  onAttentionClick: (target: AttentionItem["target"]) => void
}) {
  const overview = useMemo(() => computeOverview({ items, shoots, ads, today }), [items, shoots, ads, today])
  const todayAndAllTime = useMemo(() => computeTodayAndAllTime({ items, shoots, ads, today }), [items, shoots, ads, today])
  const effectiveMonth = monthFilter === "all" ? today.slice(0, 7) : monthFilter
  const monthlyRollup = useMemo(
    () => computeMonthlyBrandingRollup(items, clientTargets, effectiveMonth),
    [items, clientTargets, effectiveMonth]
  )
  const deliveryRows = useMemo(
    () => computeClientDeliveryStatus(items, clientTargets, effectiveMonth, today),
    [items, clientTargets, effectiveMonth, today]
  )

  return (
    <div className="flex flex-col gap-[22px]">
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center", background: "#fff", border: "1px solid #DDE1E7", borderRadius: 12, padding: 10 }}>
        <div style={{ flex: "1 1 200px", display: "flex", alignItems: "center", gap: 8, background: "#F4F5F7", border: "1px solid #DDE1E7", borderRadius: 8, padding: "9px 12px", color: "#8A94A3", fontSize: 12.5, fontWeight: 600 }}>
          <SearchIcon size={14} />
          Search clients, content, platform… (coming soon)
        </div>
        <select value={monthFilter} onChange={e => onMonthFilterChange(e.target.value)}
          style={{ display: "flex", alignItems: "center", gap: 6, background: "#F4F5F7", border: "1px solid #DDE1E7", borderRadius: 8, padding: "9px 12px", fontSize: 12.5, fontWeight: 700, color: "#111827", cursor: "pointer" }}>
          <option value="all">All Time</option>
          {monthOptions.map(m => <option key={m} value={m}>{fmtMonth(m)}</option>)}
        </select>
        {["All Team Members", "All Platforms", "All Status"].map(label => (
          <div key={label} style={{ display: "flex", alignItems: "center", gap: 6, background: "#F4F5F7", border: "1px solid #DDE1E7", borderRadius: 8, padding: "9px 12px", fontSize: 12.5, fontWeight: 700, color: "#8A94A3", cursor: "not-allowed" }}>
            {label} <ChevronDown size={12} />
          </div>
        ))}
        <div style={{ marginLeft: "auto", display: "grid", placeItems: "center", width: 36, height: 36, borderRadius: 8, background: "#F4F5F7", border: "1px solid #DDE1E7", color: "#5B6472" }}>
          <FilterIcon size={15} />
        </div>
      </div>

      <div className="grid gap-[24px]" style={{ gridTemplateColumns: "296px 1fr" }}>
        <style>{`@media (max-width: 900px) { .overview-grid { grid-template-columns: 1fr !important; } }`}</style>
        <div className="overview-grid" style={{ display: "contents" }} />
        <OverviewRail
          attention={overview.attention}
          today={todayAndAllTime}
          monthlyRollup={monthlyRollup}
          onAttentionClick={onAttentionClick}
          monthLabel={monthFilter === "all" ? "This month" : fmtMonth(effectiveMonth)}
        />

        <main className="flex flex-col gap-[32px]">
          <section>
            <p style={{ fontFamily: "var(--font-fraunces)", fontStyle: "italic", fontSize: 13, color: "#8A94A3", margin: "0 0 4px" }}>Where each account stands</p>
            <h2 style={{ fontFamily: "var(--font-fraunces)", fontWeight: 700, fontSize: 19, color: "#111827", margin: "0 0 16px" }}>Client delivery — Branding</h2>
            <DeliveryStatusTable rows={deliveryRows} />
          </section>

          <section>
            <p style={{ fontFamily: "var(--font-fraunces)", fontStyle: "italic", fontSize: 13, color: "#8A94A3", margin: "0 0 4px" }}>From shoot to published</p>
            <h2 style={{ fontFamily: "var(--font-fraunces)", fontWeight: 700, fontSize: 19, color: "#111827", margin: "0 0 16px" }}>How work moves</h2>
            <WorkFlow
              shoots={overview.shoots.scheduled}
              editing={overview.videos.ready_to_edit + overview.videos.edited + overview.posters.ready_to_edit + overview.posters.edited}
              readyToPublish={overview.videos.branding_ready + overview.posters.branding_ready}
              scheduled={overview.posting.brandingWaiting + overview.posting.adsWaiting}
              postedAllTime={todayAndAllTime.postedAllTime}
              usedInAdsAllTime={todayAndAllTime.usedInAdsAllTime}
              adsInTestingCount={todayAndAllTime.adsInTestingCount}
              overdueBrandingCount={todayAndAllTime.overdueBrandingCount}
            />
          </section>
        </main>
      </div>
    </div>
  )
}
```

- [ ] **Step 2: Replace the inline overview block in `media-tracker-client.tsx`**

Add the import near the top of `components/media-tracker/media-tracker-client.tsx`,
alongside the existing `computeOverview` import (line 30):

```ts
import { OverviewDashboard } from "./overview/overview-dashboard"
```

Replace the entire `{mode === "overview" && ( ... )}` block (currently lines 4669–4866,
starting right after the `<TrackerNav ... />` render and ending right before
`{(mode === "video" || mode === "poster") && tab === "pipeline" && (`) with:

```tsx
      {mode === "overview" && (
        <OverviewDashboard
          items={items}
          shoots={shoots}
          ads={ads}
          clientTargets={clientTargets}
          today={today}
          monthFilter={overviewMonth}
          onMonthFilterChange={setOverviewMonth}
          monthOptions={overviewMonthOptions}
          onAttentionClick={goTo}
        />
      )}
```

`items`, `shoots`, `ads`, `clientTargets`, `today`, `overviewMonth`, `setOverviewMonth`,
`overviewMonthOptions`, and `goTo` all already exist as local state/derived values in
`MediaTrackerClient` — no new state is introduced. The following state and helpers become
unused as a direct result of this replacement and can be left in place for now (they will
be reconnected by Phase 3's per-client Branding dashboard, per the Global Constraints
above): `overviewKpiMonth`, `overviewKpiContentType`, `overviewRangeMode`,
`overviewCustomFrom`, `overviewCustomTo`, `overviewBrandingKPIs`, `overviewAdsKPIs`,
`overviewUniquePosted`, `handleSetOverviewTarget`, `EditableTargetCell`,
`OVERVIEW_TILE_GRADIENTS`, `OverviewStat`, `OverviewBlock`, `HeroGlassStat` (if not used
elsewhere — check each with a repo-wide grep before removing anything; this task only
replaces the render block, it does not delete any of these).

- [ ] **Step 3: Typecheck**

Run: `pnpm typecheck`
Expected: clean. If any of the now-possibly-unused local consts/functions trigger a
"declared but never used" TypeScript error (`noUnusedLocals`), prefix them with `_` is
**not** the fix — instead confirm via `pnpm lint` whether the project's ESLint config
actually flags unused top-level function declarations (most Next.js configs only flag
unused imports/locals within a scope, not sibling function declarations) before deciding
whether any suppression is genuinely needed.

- [ ] **Step 4: Run the full test suite**

Run: `pnpm test`
Expected: PASS — no existing test in the repo exercises the removed JSX directly (the
existing Overview-related tests are all against `lib/media-tracker/overview.ts`'s pure
functions, untouched here).

- [ ] **Step 5: Manual verification**

Run: `pnpm dev`, open `/admin/media-tracker`, confirm:
- Overview tab (default landing tab) now renders the new two-tone rail + main layout.
- Needs Attention rows still navigate to the correct tab on click (same `goTo` behavior).
- Monthly Progress ring and Client Delivery Status table show plausible numbers for real
  data (spot-check one client's Target/Published against what the old KPI table showed
  for the same client/month, before this change, via `git stash`/`git show` if needed).
- Filter bar's month dropdown actually changes the ring and table's numbers; the other
  three controls are visibly present but inert (as scoped).
- At 360px width (browser dev tools), the rail stacks above the main column with no
  overlap, and the flow line + table scroll horizontally rather than breaking layout.
- `PageHero` above the layout is pixel-identical to how it renders on every other tab
  (Video/Poster/Ads/Schedule) — confirming it was genuinely untouched.

- [ ] **Step 6: Commit**

```bash
git add components/media-tracker/overview/overview-dashboard.tsx components/media-tracker/media-tracker-client.tsx
git commit -m "feat(media-tracker): wire OverviewDashboard into the Overview tab"
```

---

## Self-Review Notes

- **Spec coverage:** hero unchanged (Task 6 leaves `PageHero`/`TrackerNav` untouched) ✓;
  rail with Needs Attention/Today's Operations/Monthly Progress ring (Task 3) ✓; Client
  Delivery Status table with pace-based status (Task 2 + Task 4) ✓; How Work Moves flow +
  flags, including the resolved "testing" relabel and the reused overdue definition
  (Task 1 + Task 5) ✓; Fraunces/Plus Jakarta Sans typography (used directly via
  `var(--font-fraunces)` throughout Tasks 3–6, Plus Jakarta Sans needs no code change since
  it's already the global body font) ✓; filter bar scope resolution — only month wired,
  rest visibly inert (Task 6) ✓; new `overview/` component folder instead of growing the
  monolith (Tasks 3–6) ✓; mobile stacking order preserved (Task 6, `.overview-grid` media
  query) ✓.
- **Type consistency:** `AttentionItem["target"]` threaded unchanged from
  `lib/media-tracker/overview.ts` through `OverviewDashboard` to `OverviewRail` to the
  existing `goTo()` — same shape at every hop. `ClientDeliveryRow`/`DeliveryStatus` defined
  once in Task 2, consumed as-is by Task 4 and Task 6 with no renaming.
- **No placeholders:** every step above has complete, real code — no "TBD"/"add validation
  here" left in any task.
