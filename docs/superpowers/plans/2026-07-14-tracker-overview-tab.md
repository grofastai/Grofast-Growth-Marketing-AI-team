# Content & Ads Tracker Overview Tab Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add an "Overview" tab to the Content & Ads Tracker — a read-only summary screen showing where everything stands, with clickable numbers that jump to the board they came from.

**Architecture:** All summary maths lives in a new pure module `lib/content-tracker/overview.ts`, unit-tested with Vitest (mirroring the existing `lib/ads-tracker/performance-metrics.ts` and `lib/shoots/status-transitions.ts` pattern). Date arithmetic — overdue, this-week, 7-days-stuck — is exactly where off-by-one bugs silently misreport, so it is isolated and tested rather than inlined in JSX. The client component adds an `overview` mode and renders the numbers; it stays presentational. No DB change, no data-loader change — `getContentTrackerData` already returns everything needed.

**Tech Stack:** Next.js 15 App Router, TypeScript strict, Vitest, React (client component).

## Global Constraints

- **No DB migration, no new columns, no new tables.** Everything is derived from data already loaded.
- **No changes to `lib/data/content-tracker.ts`** — it already returns `items`, `shoots`, `ads`, `members`.
- **The Ads block is status-counts-only, deliberately.** Sanjay owns the Campaign/Ad-Set/Creative restructure; do not add budget, spend, ROAS, CPL, or "top campaign" here.
- **No ROAS / revenue anywhere.** Revenue is not tracked.
- Tab order is exactly: `Overview | Video | Poster | Ads`. Overview is the default landing mode.
- `Video` keeps its existing sub-tabs (`Shoots → Pipeline → Posting Log`); `Poster` keeps `Pipeline → Posting Log`; `Ads` and `Overview` have no sub-tabs.
- Numbers must be clickable and navigate to the originating board — a non-clickable wall of numbers is a plan failure.
- Follow the file's existing patterns: `useMemo` for derived values, inline styles with the existing tokens, no new component libraries.

---

### Task 1: Pure overview module (TDD)

**Files:**
- Create: `lib/content-tracker/overview.ts`
- Create: `lib/content-tracker/overview.test.ts`

**Interfaces:**
- Consumes: nothing. The module defines its own minimal structural input types so it stays decoupled from the client component's types (the component's `ContentItem` is a superset and is assignable to `OverviewItem`).
- Produces: `computeOverview(input: OverviewInput): Overview` plus the types `OverviewItem`, `OverviewShoot`, `OverviewAd`, `OverviewInput`, `StageCounts`, `PostingCounts`, `ShootCounts`, `AdCounts`, `AttentionItem`, `Overview` — all consumed by Task 2.

- [ ] **Step 1: Write the failing tests**

Create `lib/content-tracker/overview.test.ts`:

```typescript
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
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `pnpm test lib/content-tracker/overview.test.ts`
Expected: FAIL — `Cannot find module './overview'`.

- [ ] **Step 3: Write the implementation**

Create `lib/content-tracker/overview.ts`:

```typescript
// Pure summary maths for the Tracker's Overview tab. Kept out of the component and
// unit-tested because the date arithmetic (overdue / this week / days-stuck) is exactly
// where off-by-one bugs silently misreport the state of the board.

export type OverviewStatus = 'shot' | 'editing' | 'edited' | 'ready' | 'posted'
export type OverviewShootStatus = 'scheduled' | 'going' | 'completed' | 'cancelled'
export type OverviewAdStatus = 'active' | 'testing' | 'paused' | 'stopped'

// Structural, minimal input types — the client component's richer ContentItem / Shoot / Ad
// are supersets and assign to these without conversion.
export type OverviewItem = {
  id: string
  content_type: 'video' | 'poster'
  status: OverviewStatus
  shot_date: string | null
  scheduled_post_date: string | null
  corrections: { correction_date: string }[]
}
export type OverviewShoot = { id: string; status: OverviewShootStatus; start_time: string }
export type OverviewAd = { id: string; status: OverviewAdStatus }

export type OverviewInput = {
  items: OverviewItem[]
  shoots: OverviewShoot[]
  ads: OverviewAd[]
  today: string // YYYY-MM-DD
}

export type StageCounts = Record<OverviewStatus, number>
export type PostingCounts = { dueToday: number; dueThisWeek: number; overdue: number }
export type ShootCounts = Record<OverviewShootStatus, number>
export type AdCounts = Record<OverviewAdStatus, number>

export type AttentionKind = 'overdue' | 'stuck-editing' | 'shoots-today' | 'repeat-corrections'
export type AttentionTarget = { mode: 'video' | 'poster' | 'ads'; tab: 'shoots' | 'pipeline' | 'log' | null }
export type AttentionItem = {
  kind: AttentionKind
  count: number
  label: string
  target: AttentionTarget
}

export type Overview = {
  videos: StageCounts
  posters: StageCounts
  shoots: ShootCounts
  ads: AdCounts
  posting: PostingCounts
  attention: AttentionItem[]
}

export const STUCK_EDITING_DAYS = 7
export const REPEAT_CORRECTION_THRESHOLD = 2

// All dates are YYYY-MM-DD strings, so plain string compare is a correct date compare and
// avoids timezone drift entirely. Only day-offset maths needs a Date.
function addDays(date: string, days: number): string {
  const d = new Date(date + 'T00:00:00Z')
  d.setUTCDate(d.getUTCDate() + days)
  return d.toISOString().split('T')[0]
}

function daysBetween(from: string, to: string): number {
  const a = new Date(from + 'T00:00:00Z').getTime()
  const b = new Date(to + 'T00:00:00Z').getTime()
  return Math.round((b - a) / 86400000)
}

function emptyStages(): StageCounts {
  return { shot: 0, editing: 0, edited: 0, ready: 0, posted: 0 }
}

function countStages(items: OverviewItem[], type: 'video' | 'poster'): StageCounts {
  const counts = emptyStages()
  for (const i of items) {
    if (i.content_type === type) counts[i.status]++
  }
  return counts
}

// When did this item most recently ENTER its current editing state? An item bounced back
// for a correction has an old shot_date but has only just re-entered Editing — using
// shot_date alone would wrongly flag it as stalled the moment someone returns it.
function editingSince(item: OverviewItem): string | null {
  const dates = [item.shot_date, ...item.corrections.map(c => c.correction_date)]
    .filter((d): d is string => !!d)
  if (dates.length === 0) return null
  return dates.sort()[dates.length - 1]
}

export function computeOverview({ items, shoots, ads, today }: OverviewInput): Overview {
  const weekEnd = addDays(today, 6)

  const readyWithDate = items.filter(
    (i): i is OverviewItem & { scheduled_post_date: string } =>
      i.status === 'ready' && !!i.scheduled_post_date
  )

  const posting: PostingCounts = {
    overdue: readyWithDate.filter(i => i.scheduled_post_date < today).length,
    dueToday: readyWithDate.filter(i => i.scheduled_post_date === today).length,
    // Superset that INCLUDES today, not a remainder — "this week" reads naturally as
    // "everything coming up", so today's items belong in both buckets.
    dueThisWeek: readyWithDate.filter(
      i => i.scheduled_post_date >= today && i.scheduled_post_date <= weekEnd
    ).length,
  }

  const shootCounts: ShootCounts = { scheduled: 0, going: 0, completed: 0, cancelled: 0 }
  for (const s of shoots) shootCounts[s.status]++

  const adCounts: AdCounts = { active: 0, testing: 0, paused: 0, stopped: 0 }
  for (const a of ads) adCounts[a.status]++

  const stuckEditing = items.filter(i => {
    if (i.status !== 'editing') return false
    const since = editingSince(i)
    return since !== null && daysBetween(since, today) >= STUCK_EDITING_DAYS
  }).length

  const shootsToday = shoots.filter(
    s => (s.status === 'scheduled' || s.status === 'going') && s.start_time.split('T')[0] === today
  ).length

  const repeatCorrections = items.filter(
    i => i.corrections.length >= REPEAT_CORRECTION_THRESHOLD
  ).length

  // Most actionable first. Zero-count entries are omitted entirely rather than shown as
  // "0 overdue" — a clean board should look clean.
  const candidates: AttentionItem[] = [
    {
      kind: 'overdue',
      count: posting.overdue,
      label: `${posting.overdue} post${posting.overdue === 1 ? '' : 's'} overdue`,
      target: { mode: 'video', tab: 'log' },
    },
    {
      kind: 'stuck-editing',
      count: stuckEditing,
      label: `${stuckEditing} item${stuckEditing === 1 ? '' : 's'} stuck in Editing ${STUCK_EDITING_DAYS}+ days`,
      target: { mode: 'video', tab: 'pipeline' },
    },
    {
      kind: 'repeat-corrections',
      count: repeatCorrections,
      label: `${repeatCorrections} item${repeatCorrections === 1 ? '' : 's'} bounced back ${REPEAT_CORRECTION_THRESHOLD}+ times`,
      target: { mode: 'video', tab: 'pipeline' },
    },
    {
      kind: 'shoots-today',
      count: shootsToday,
      label: `${shootsToday} shoot${shootsToday === 1 ? '' : 's'} scheduled today`,
      target: { mode: 'video', tab: 'shoots' },
    },
  ]

  return {
    videos: countStages(items, 'video'),
    posters: countStages(items, 'poster'),
    shoots: shootCounts,
    ads: adCounts,
    posting,
    attention: candidates.filter(c => c.count > 0),
  }
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `pnpm test lib/content-tracker/overview.test.ts`
Expected: PASS — all tests green.

- [ ] **Step 5: Typecheck**

Run: `pnpm typecheck`
Expected: no errors.

- [ ] **Step 6: Commit**

```bash
git add lib/content-tracker/overview.ts lib/content-tracker/overview.test.ts
git commit -m "feat(content-tracker): add pure overview summary module with tests"
```

---

### Task 2: Overview mode, nav entry, and render

**Files:**
- Modify: `components/content-tracker/content-tracker-client.tsx`

**Interfaces:**
- Consumes: `computeOverview`, and the types `Overview`, `AttentionItem` from `@/lib/content-tracker/overview` (Task 1). The component's existing `ContentItem`, `Shoot` and `Ad` types are structural supersets of `OverviewItem`/`OverviewShoot`/`OverviewAd` and assign directly — no mapping needed.
- Produces: the finished Overview tab. No further consumers.

- [ ] **Step 1: Add the import**

In `components/content-tracker/content-tracker-client.tsx`, find:

```typescript
import { isValidShootTransition } from "@/lib/shoots/status-transitions"
```

Replace with:

```typescript
import { isValidShootTransition } from "@/lib/shoots/status-transitions"
import { computeOverview, type AttentionItem } from "@/lib/content-tracker/overview"
```

- [ ] **Step 2: Add `LayoutDashboard` to the lucide-react import**

Find:

```typescript
  Layers, History, ArrowRight, Check, ChevronDown, Megaphone, Target, AlertTriangle, CalendarDays, RotateCcw,
} from "lucide-react"
```

Replace with:

```typescript
  Layers, History, ArrowRight, Check, ChevronDown, Megaphone, Target, AlertTriangle, CalendarDays, RotateCcw, LayoutDashboard,
} from "lucide-react"
```

- [ ] **Step 3: Widen `TrackerMode` and add the Overview accent + nav entry**

Find:

```typescript
type TrackerMode = "video" | "poster" | "ads"
const MODE_ACCENT: Record<TrackerMode, { solid: string; grad: string; glow: string; soft: string }> = {
  video: { solid: "#DE1A1A", grad: "linear-gradient(135deg,#FF4D4D,#DE1A1A)", glow: "rgba(222,26,26,0.45)", soft: "rgba(222,26,26,0.10)" },
  poster: { solid: "#7C3AED", grad: "linear-gradient(135deg,#A78BFA,#7C3AED)", glow: "rgba(124,58,237,0.45)", soft: "rgba(124,58,237,0.10)" },
  ads: { solid: "#D97706", grad: "linear-gradient(135deg,#FBBF24,#D97706)", glow: "rgba(217,119,6,0.45)", soft: "rgba(217,119,6,0.10)" },
}

const NAV_MODES: { key: TrackerMode; label: string; icon: typeof Layers }[] = [
  { key: "video", label: "Video", icon: Video },
  { key: "poster", label: "Poster", icon: ImageIcon },
  { key: "ads", label: "Ads", icon: Megaphone },
]
```

Replace with:

```typescript
type TrackerMode = "overview" | "video" | "poster" | "ads"
const MODE_ACCENT: Record<TrackerMode, { solid: string; grad: string; glow: string; soft: string }> = {
  overview: { solid: "#0EA5E9", grad: "linear-gradient(135deg,#38BDF8,#0EA5E9)", glow: "rgba(14,165,233,0.45)", soft: "rgba(14,165,233,0.10)" },
  video: { solid: "#DE1A1A", grad: "linear-gradient(135deg,#FF4D4D,#DE1A1A)", glow: "rgba(222,26,26,0.45)", soft: "rgba(222,26,26,0.10)" },
  poster: { solid: "#7C3AED", grad: "linear-gradient(135deg,#A78BFA,#7C3AED)", glow: "rgba(124,58,237,0.45)", soft: "rgba(124,58,237,0.10)" },
  ads: { solid: "#D97706", grad: "linear-gradient(135deg,#FBBF24,#D97706)", glow: "rgba(217,119,6,0.45)", soft: "rgba(217,119,6,0.10)" },
}

const NAV_MODES: { key: TrackerMode; label: string; icon: typeof Layers }[] = [
  { key: "overview", label: "Overview", icon: LayoutDashboard },
  { key: "video", label: "Video", icon: Video },
  { key: "poster", label: "Poster", icon: ImageIcon },
  { key: "ads", label: "Ads", icon: Megaphone },
]
```

- [ ] **Step 4: Default the mode to Overview and keep `contentTypeForMode` sane**

Find:

```typescript
  const [mode, setMode] = useState<"video" | "poster" | "ads">("video")
  const [subTab, setSubTab] = useState<"shoots" | "pipeline" | "log">("shoots")
  // Derived rather than reset via an effect — avoids a cascading-render setState-in-effect.
  const tab = mode === "poster" && subTab === "shoots" ? "pipeline" : subTab
  const contentTypeForMode: "video" | "poster" = mode === "poster" ? "poster" : "video"
```

Replace with:

```typescript
  const [mode, setMode] = useState<TrackerMode>("overview")
  const [subTab, setSubTab] = useState<"shoots" | "pipeline" | "log">("shoots")
  // Derived rather than reset via an effect — avoids a cascading-render setState-in-effect.
  const tab = mode === "poster" && subTab === "shoots" ? "pipeline" : subTab
  // Overview and Ads have no content type of their own; falling back to "video" keeps the
  // Pipeline/Log memos below well-defined even while those boards aren't rendered.
  const contentTypeForMode: "video" | "poster" = mode === "poster" ? "poster" : "video"
```

- [ ] **Step 5: Give the new mode a nav count and no sub-tabs**

Find:

```typescript
  const navCounts = useMemo(() => ({
    video: items.filter(i => i.content_type === "video" && i.status !== "posted").length,
    poster: items.filter(i => i.content_type === "poster" && i.status !== "posted").length,
    ads: ads.filter(a => a.status === "active").length,
  }), [items, ads])

  const navSections = useMemo(() => {
    if (mode === "ads") return []
```

Replace with:

```typescript
  // Overview's badge is the count of things actually needing action — it's the number you'd
  // want to see without opening the tab.
  const overview = useMemo(
    () => computeOverview({
      items, shoots, ads,
      today: new Date().toISOString().split("T")[0],
    }),
    [items, shoots, ads]
  )

  const navCounts = useMemo(() => ({
    overview: overview.attention.reduce((sum, a) => sum + a.count, 0),
    video: items.filter(i => i.content_type === "video" && i.status !== "posted").length,
    poster: items.filter(i => i.content_type === "poster" && i.status !== "posted").length,
    ads: ads.filter(a => a.status === "active").length,
  }), [items, ads, overview])

  const navSections = useMemo(() => {
    if (mode === "ads" || mode === "overview") return []
```

- [ ] **Step 6: Add the navigation handler**

Find:

```typescript
  const draggedItem = items.find(i => i.id === dragId)
```

Insert immediately BEFORE it:

```typescript
  // Overview numbers are navigation, not decoration — clicking one lands you on the board
  // it came from, so you can act on it.
  function goTo(target: AttentionItem["target"]) {
    setMode(target.mode)
    if (target.tab) setSubTab(target.tab)
  }

```

- [ ] **Step 7: Add the render block**

Find:

```typescript
      {mode !== "ads" && tab === "pipeline" && (
```

Insert immediately BEFORE it:

```typescript
      {mode === "overview" && (
        <div className="flex flex-col gap-4">
          {/* Needs attention — actionable problems first, or an all-clear. */}
          <div style={{ background: "#fff", border: "1px solid #E5E7EB", borderRadius: 18, overflow: "hidden" }}>
            <div style={{ display: "flex", alignItems: "center", gap: 6, padding: "12px 16px", borderBottom: "1px solid #F3F4F6" }}>
              <AlertTriangle size={13} style={{ color: overview.attention.length > 0 ? "#D97706" : "#16A34A" }} />
              <span style={{ fontSize: 10, fontWeight: 700, color: "#374151", textTransform: "uppercase", letterSpacing: "0.06em" }}>
                Needs Attention
              </span>
            </div>
            {overview.attention.length === 0 ? (
              <p style={{ fontSize: 12, fontWeight: 600, color: "#16A34A", padding: "16px", margin: 0 }}>
                All clear — nothing overdue or stalled.
              </p>
            ) : (
              <div className="flex flex-col">
                {overview.attention.map(a => (
                  <button key={a.kind} onClick={() => goTo(a.target)}
                    className="flex items-center justify-between text-left hover:bg-slate-50"
                    style={{ padding: "10px 16px", borderBottom: "1px solid #F9FAFB", border: "none", background: "transparent", cursor: "pointer" }}>
                    <span style={{ fontSize: 12, fontWeight: 600, color: "#374151" }}>{a.label}</span>
                    <ArrowRight size={13} style={{ color: "#9CA3AF" }} />
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* Posting — the time-sensitive block. */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            <OverviewStat label="Due Today" value={overview.posting.dueToday} accent="#0EA5E9"
              onClick={() => goTo({ mode: "video", tab: "log" })} />
            <OverviewStat label="Due This Week" value={overview.posting.dueThisWeek} accent="#6366F1"
              onClick={() => goTo({ mode: "video", tab: "log" })} />
            <OverviewStat label="Overdue" value={overview.posting.overdue} accent="#EF4444"
              onClick={() => goTo({ mode: "video", tab: "log" })} />
          </div>

          {/* Videos and Posters — stage counts. */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <OverviewBlock title="Videos" accent={MODE_ACCENT.video.solid} icon={Video}
              rows={STATUS_ORDER.map(s => ({
                key: s,
                label: STATUS_CFG[s].label,
                value: overview.videos[s],
                onClick: () => goTo({ mode: "video", tab: s === "posted" ? "log" : "pipeline" }),
              }))} />
            <OverviewBlock title="Posters" accent={MODE_ACCENT.poster.solid} icon={ImageIcon}
              rows={STATUS_ORDER.map(s => ({
                key: s,
                label: STATUS_CFG[s].label,
                value: overview.posters[s],
                onClick: () => goTo({ mode: "poster", tab: s === "posted" ? "log" : "pipeline" }),
              }))} />
          </div>

          {/* Shoots and Ads. Ads is status-counts-only on purpose — the campaign/budget
              restructure is owned separately, so this stays deliberately shallow. */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <OverviewBlock title="Shoots" accent="#3B82F6" icon={Camera}
              rows={SHOOT_STATUS_ORDER.map(s => ({
                key: s,
                label: SHOOT_STATUS_CFG[s].label,
                value: overview.shoots[s],
                onClick: () => goTo({ mode: "video", tab: "shoots" }),
              }))} />
            <OverviewBlock title="Ads" accent={MODE_ACCENT.ads.solid} icon={Megaphone}
              rows={AD_STATUS_ORDER.map(s => ({
                key: s,
                label: AD_STATUS_CFG[s].label,
                value: overview.ads[s],
                onClick: () => goTo({ mode: "ads", tab: null }),
              }))} />
          </div>
        </div>
      )}

```

- [ ] **Step 8: Add the two presentational sub-components**

Find (the generic kanban primitives section):

```typescript
function KanbanEmptyCell({ isOver, accent }: { isOver: boolean; accent: string }) {
```

Insert immediately BEFORE it:

```typescript
// ── Overview building blocks ─────────────────────────────────────────────────
function OverviewStat({ label, value, accent, onClick }: {
  label: string; value: number; accent: string; onClick: () => void
}) {
  return (
    <button onClick={onClick}
      className="text-left hover:opacity-90 transition-opacity"
      style={{ background: "#fff", border: "1px solid #E5E7EB", borderRadius: 16, padding: "14px 16px", cursor: "pointer" }}>
      <p style={{ fontSize: 26, fontWeight: 900, color: accent, margin: 0, letterSpacing: "-0.02em" }}>{value}</p>
      <p style={{ fontSize: 10, fontWeight: 700, color: "#374151", textTransform: "uppercase", letterSpacing: "0.06em", margin: "2px 0 0" }}>{label}</p>
    </button>
  )
}

function OverviewBlock({ title, accent, icon: Icon, rows }: {
  title: string
  accent: string
  icon: typeof Layers
  rows: { key: string; label: string; value: number; onClick: () => void }[]
}) {
  return (
    <div style={{ background: "#fff", border: "1px solid #E5E7EB", borderRadius: 18, overflow: "hidden" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 6, padding: "12px 16px", borderBottom: "1px solid #F3F4F6" }}>
        <Icon size={13} style={{ color: accent }} />
        <span style={{ fontSize: 10, fontWeight: 700, color: "#374151", textTransform: "uppercase", letterSpacing: "0.06em" }}>{title}</span>
      </div>
      <div className="flex flex-col">
        {rows.map(r => (
          <button key={r.key} onClick={r.onClick}
            className="flex items-center justify-between hover:bg-slate-50"
            style={{ padding: "9px 16px", borderBottom: "1px solid #F9FAFB", border: "none", background: "transparent", cursor: "pointer" }}>
            <span style={{ fontSize: 12, fontWeight: 600, color: "#374151" }}>{r.label}</span>
            <span style={{ fontSize: 13, fontWeight: 800, color: r.value > 0 ? accent : "#9CA3AF", fontVariantNumeric: "tabular-nums" }}>
              {r.value}
            </span>
          </button>
        ))}
      </div>
    </div>
  )
}

function KanbanEmptyCell({ isOver, accent }: { isOver: boolean; accent: string }) {
```

- [ ] **Step 9: Typecheck**

Run: `pnpm typecheck`
Expected: no errors.

If an error appears saying `mode` is not assignable — check that Step 4 changed the `useState` to `useState<TrackerMode>("overview")`, and that Step 3 widened `TrackerMode`. The `mode !== "ads"` guards on the Pipeline/Log blocks remain correct as-is, because Overview renders in its own block and the other guards only ever run when `mode` is `video` or `poster`.

- [ ] **Step 10: Lint**

Run: `npx eslint components/content-tracker/content-tracker-client.tsx`
Expected: no errors, no warnings.

- [ ] **Step 11: Commit**

```bash
git add components/content-tracker/content-tracker-client.tsx
git commit -m "feat(content-tracker): add Overview tab with clickable summary counts"
```

---

### Task 3: Full verification pass

**Files:** none (verification only)

**Interfaces:** none.

- [ ] **Step 1: Run the full test suite**

Run: `pnpm test`
Expected: all tests pass, including the new `lib/content-tracker/overview.test.ts` cases.

Note: two test FILES (`app/api/send-daily-reminder/route.test.ts` and `app/api/send-missed-alert/route.test.ts`) fail to load with `Cannot find package '@/lib/whatsapp'`. This is a pre-existing, unrelated module-resolution issue — it touches none of the files in this plan. Confirm the failure list is exactly those two and no others, then proceed. Do not attempt to fix them here.

- [ ] **Step 2: Typecheck**

Run: `pnpm typecheck`
Expected: no errors.

- [ ] **Step 3: Lint**

Run: `pnpm lint`
Expected: no NEW errors. The repo has substantial pre-existing lint debt in unrelated files. Verify by running:

```bash
pnpm lint 2>&1 | grep -iE "content-tracker/overview|content-tracker-client"
```
Expected: no output (none of this plan's files appear).

- [ ] **Step 4: Production build**

Run: `pnpm build`
Expected: `✓ Compiled successfully`, with `/admin/content-tracker` and `/member/content-tracker` both listed.

- [ ] **Step 5: Manual click-through**

Start the dev server (`pnpm dev`) and log in. On `/admin/content-tracker`, confirm:

- [ ] **Overview is the tab you land on**, and the nav shows `Overview | Video | Poster | Ads` in that order.
- [ ] The Overview badge in the nav equals the total of the Needs Attention counts.
- [ ] Every stage count matches what the corresponding board actually shows (e.g. Videos → Editing count equals the number of cards in the Video Pipeline's Editing column).
- [ ] Clicking **Videos → Editing** switches to Video mode, Pipeline tab.
- [ ] Clicking **Posters → Posted** switches to Poster mode, Posting Log tab.
- [ ] Clicking **Shoots → Scheduled** switches to Video mode, Shoots tab.
- [ ] Clicking any **Ads** row switches to Ads mode.
- [ ] Clicking a **Needs Attention** row navigates to its target board.
- [ ] With nothing overdue or stalled, Needs Attention shows the green "All clear" line rather than an empty box.
- [ ] At 360px width, the blocks stack in one column with no overlap or horizontal scroll.

- [ ] **Step 6: Report**

If all checks pass, the feature is complete. If any check fails, fix the specific issue, re-run the affected verification step only, and state what was fixed.

## Self-Review

**Spec coverage:** Tab layout `Overview | Video | Poster | Ads` with Overview as landing tab (Task 2, Steps 3-4) ✓. Videos/Posters stage counts (Task 1 `countStages`, Task 2 Step 7) ✓. Shoots counts (Task 1, Task 2) ✓. Posting Due Today / This Week / Overdue with the today-in-both-buckets rule (Task 1 `posting`, tested) ✓. Ads status-counts-only, deliberately shallow (Task 1 `adCounts`, Task 2 render comment) ✓. Needs Attention with all four entry types, zero-count omission, and All-clear empty state (Task 1 `candidates`, Task 2 Step 7) ✓. The "stuck in Editing uses the LATER of shot_date and last correction" rule (Task 1 `editingSince`, with a dedicated test) ✓. Clickable numbers navigating to the originating board (Task 2 `goTo`, Steps 6-8) ✓. No DB/data-loader change (no task touches them) ✓. Testing/verification (Task 3) ✓.

**Placeholder scan:** No TBD/TODO. Every step contains complete, runnable code or an exact command with expected output.

**Type consistency:** `TrackerMode` is widened once in Task 2 Step 3 and used consistently in Steps 4-5 (`useState<TrackerMode>`, `navCounts` keyed by it). `AttentionItem["target"]` is the single source for the `goTo` signature — defined in Task 1, consumed in Task 2 Step 6, and the literal targets passed in Step 7 (`{ mode, tab }`) match its shape exactly, including `tab: null` for the Ads block. `computeOverview` returns `Overview`, whose field names (`videos`, `posters`, `shoots`, `ads`, `posting`, `attention`) are exactly what the Task 2 render reads. `STATUS_ORDER`, `STATUS_CFG`, `SHOOT_STATUS_ORDER`, `SHOOT_STATUS_CFG`, `AD_STATUS_ORDER`, `AD_STATUS_CFG` all already exist in the component and are keyed identically to the `StageCounts`/`ShootCounts`/`AdCounts` records, so indexing them is type-safe.
