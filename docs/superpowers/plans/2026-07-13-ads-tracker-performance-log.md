# Ads Tracker Performance Metrics Log (Phase 1) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add manual performance-metrics logging (Spend/Impressions/Reach/Clicks/CTR/Results) to each ad in the Content & Ads Tracker's Ads Tracker tab, with derived metrics, an auto "Underperforming" flag, and a search box + status filter chips.

**Architecture:** New append-only `ad_performance_entries` table (mirrors the existing `ad_revisions` history-log pattern) behind a new `addAdPerformanceEntry` server action. A new pure module `lib/ads-tracker/performance-metrics.ts` holds all derived-metric math and the underperforming check, unit-tested with Vitest, and imported by both the data loader and the client component. UI additions live inside the existing `components/content-tracker/content-tracker-client.tsx` (shared by both admin and member pages), following the file's established patterns: one modal function per action, `useState` + `useMemo` filters, inline styles via the shared `FIELD`/`LABEL` tokens.

**Tech Stack:** Next.js 15 App Router, Supabase (Postgres + RLS), TypeScript strict, Zod validation, Vitest.

## Global Constraints

- Multi-tenant: every new table has `company_id` and RLS (`tenant_all` scoped to `(auth.jwt() ->> 'company_id')::uuid`, plus `service_all`), matching every existing table in this schema.
- Server Actions only for mutations — no new API routes.
- No live Meta Ads API call anywhere in this plan — the connector is disconnected; this is 100% manual entry (per spec Non-Goals).
- Underperforming threshold is a fixed constant (`CTR < 1.0`), not a settings field (per spec).
- All 6 numeric fields (Spend, Impressions, Reach, Clicks, CTR%, Results) are required on every entry — no partial entries.
- Follow the existing file's patterns exactly: `Modal`/`PrimaryButton`/`ClientSelector`/`FIELD`/`LABEL` shared components, `AD_STATUS_CFG`-style config objects, `startTransition` for mutations, optimistic local `setAds` updates before the server action resolves.

---

### Task 1: Database migration

**Files:**
- Create: `supabase/migrations/091_ad_performance_entries.sql`

**Interfaces:**
- Produces: table `ad_performance_entries` with columns `id, ad_id, company_id, entry_date, spend, impressions, reach, clicks, ctr, results, note, created_by, created_at` — consumed by Task 3's server action and Task 5's data loader.

- [ ] **Step 1: Write the migration file**

```sql
-- Ads Tracker performance log (Phase 1 of the ads-tracker-performance-log spec) --
-- manual entry of Meta/Google Ads metrics per ad, since the live Ads API connector
-- isn't available. Append-only history (like ad_revisions) so trends and "week 1
-- vs week 3" comparisons are possible later, rather than a single overwritten row.
create table if not exists ad_performance_entries (
  id uuid primary key default gen_random_uuid(),
  ad_id uuid not null references ads_tracker(id) on delete cascade,
  company_id uuid not null,
  entry_date date not null default current_date,
  spend numeric not null,
  impressions integer not null,
  reach integer not null,
  clicks integer not null,
  ctr numeric not null,       -- percentage, e.g. 1.20
  results integer not null,   -- generic: leads/messages/purchases, matches the ad's objective
  note text,
  created_by uuid references users(id) on delete set null,
  created_at timestamptz not null default now()
);

create index if not exists ad_performance_entries_ad_idx on ad_performance_entries(ad_id);
create index if not exists ad_performance_entries_company_idx on ad_performance_entries(company_id);

alter table ad_performance_entries enable row level security;

create policy "tenant_all" on ad_performance_entries
  for all using (company_id = (auth.jwt() ->> 'company_id')::uuid)
  with check (company_id = (auth.jwt() ->> 'company_id')::uuid);

create policy "service_all" on ad_performance_entries for all using (true) with check (true);
```

- [ ] **Step 2: Apply the migration**

Use the Supabase MCP `apply_migration` tool (name: `ad_performance_entries`, pasting the SQL above), or if working with a locally-linked Supabase CLI, run:

```bash
supabase db push
```

- [ ] **Step 3: Verify the table exists**

Use the Supabase MCP `list_tables` tool (or `execute_sql` with `select * from ad_performance_entries limit 1;`) and confirm `ad_performance_entries` appears with RLS enabled.

- [ ] **Step 4: Commit**

```bash
git add supabase/migrations/091_ad_performance_entries.sql
git commit -m "feat(db): add ad_performance_entries table for Ads Tracker performance log"
```

---

### Task 2: Validation schema

**Files:**
- Modify: `lib/validations/content-tracker.ts`

**Interfaces:**
- Consumes: nothing new.
- Produces: `addAdPerformanceEntrySchema` (Zod schema) and `AddAdPerformanceEntryInput` (inferred type) — consumed by Task 3's server action and Task 7's modal.

- [ ] **Step 1: Add the schema**

Append to the end of `lib/validations/content-tracker.ts` (after the existing `addAdRevisionSchema` block):

```typescript
export const addAdPerformanceEntrySchema = z.object({
  ad_id:       z.string().uuid(),
  entry_date:  z.string().min(1, 'Date is required'),
  spend:       z.number().min(0),
  impressions: z.number().int().min(0),
  reach:       z.number().int().min(0),
  clicks:      z.number().int().min(0),
  ctr:         z.number().min(0),
  results:     z.number().int().min(0),
  note:        z.string().optional(),
})
export type AddAdPerformanceEntryInput = z.infer<typeof addAdPerformanceEntrySchema>
```

- [ ] **Step 2: Typecheck**

Run: `pnpm typecheck`
Expected: no errors (this file has no other consumers yet, so this is purely additive).

- [ ] **Step 3: Commit**

```bash
git add lib/validations/content-tracker.ts
git commit -m "feat(content-tracker): add validation schema for ad performance entries"
```

---

### Task 3: Server action

**Files:**
- Modify: `lib/actions/content-tracker.ts`

**Interfaces:**
- Consumes: `addAdPerformanceEntrySchema`, `AddAdPerformanceEntryInput` from `@/lib/validations/content-tracker` (Task 2); `currentUser()` and `revalidateTracker()` already defined in this file.
- Produces: `addAdPerformanceEntry(input: AddAdPerformanceEntryInput): Promise<{ success: boolean; error?: string; id?: string }>` — consumed by Task 7's modal.

- [ ] **Step 1: Update the import block**

In `lib/actions/content-tracker.ts`, replace the top import block:

```typescript
import {
  createContentItemSchema, updateContentItemSchema, addContentPostSchema, createAdSchema, addAdRevisionSchema,
  type CreateContentItemInput, type UpdateContentItemInput, type AddContentPostInput, type CreateAdInput, type AddAdRevisionInput,
} from '@/lib/validations/content-tracker'
```

with:

```typescript
import {
  createContentItemSchema, updateContentItemSchema, addContentPostSchema, createAdSchema, addAdRevisionSchema, addAdPerformanceEntrySchema,
  type CreateContentItemInput, type UpdateContentItemInput, type AddContentPostInput, type CreateAdInput, type AddAdRevisionInput, type AddAdPerformanceEntryInput,
} from '@/lib/validations/content-tracker'
```

- [ ] **Step 2: Add the action**

Append to the end of `lib/actions/content-tracker.ts` (after the existing `addAdRevision` function):

```typescript
export async function addAdPerformanceEntry(input: AddAdPerformanceEntryInput): Promise<{ success: boolean; error?: string; id?: string }> {
  const parsed = addAdPerformanceEntrySchema.safeParse(input)
  if (!parsed.success) return { success: false, error: parsed.error.issues[0].message }

  const ctx = await currentUser()
  if (!ctx) return { success: false, error: 'Not authenticated' }

  const { data, error } = await ctx.admin.from('ad_performance_entries').insert({
    ad_id:       parsed.data.ad_id,
    company_id:  ctx.companyId,
    entry_date:  parsed.data.entry_date,
    spend:       parsed.data.spend,
    impressions: parsed.data.impressions,
    reach:       parsed.data.reach,
    clicks:      parsed.data.clicks,
    ctr:         parsed.data.ctr,
    results:     parsed.data.results,
    note:        parsed.data.note || null,
    created_by:  ctx.id,
  }).select('id').single()
  if (error) return { success: false, error: error.message }

  revalidateTracker()
  return { success: true, id: data.id }
}
```

- [ ] **Step 3: Typecheck**

Run: `pnpm typecheck`
Expected: no errors.

- [ ] **Step 4: Commit**

```bash
git add lib/actions/content-tracker.ts
git commit -m "feat(content-tracker): add addAdPerformanceEntry server action"
```

---

### Task 4: Pure derived-metrics module (TDD)

**Files:**
- Create: `lib/ads-tracker/performance-metrics.ts`
- Create: `lib/ads-tracker/performance-metrics.test.ts`

**Interfaces:**
- Consumes: nothing.
- Produces: `AdPerformanceEntry` type, `cpc()`, `cpm()`, `frequency()`, `costPerResult()`, `latestEntry()`, `isUnderperforming()`, `UNDERPERFORMING_CTR_THRESHOLD` — consumed by Task 5 (data loader type reuse) and Task 6/9 (client component UI).

- [ ] **Step 1: Write the failing tests**

Create `lib/ads-tracker/performance-metrics.test.ts`:

```typescript
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
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `pnpm test lib/ads-tracker/performance-metrics.test.ts`
Expected: FAIL — `Cannot find module './performance-metrics'` (the module doesn't exist yet).

- [ ] **Step 3: Write the implementation**

Create `lib/ads-tracker/performance-metrics.ts`:

```typescript
export type AdPerformanceEntry = {
  id: string
  ad_id: string
  entry_date: string
  spend: number
  impressions: number
  reach: number
  clicks: number
  ctr: number
  results: number
  note: string | null
}

export function cpc(entry: Pick<AdPerformanceEntry, 'spend' | 'clicks'>): number | null {
  return entry.clicks > 0 ? entry.spend / entry.clicks : null
}

export function cpm(entry: Pick<AdPerformanceEntry, 'spend' | 'impressions'>): number | null {
  return entry.impressions > 0 ? (entry.spend / entry.impressions) * 1000 : null
}

export function frequency(entry: Pick<AdPerformanceEntry, 'impressions' | 'reach'>): number | null {
  return entry.reach > 0 ? entry.impressions / entry.reach : null
}

export function costPerResult(entry: Pick<AdPerformanceEntry, 'spend' | 'results'>): number | null {
  return entry.results > 0 ? entry.spend / entry.results : null
}

// Most recent by entry_date. Ties keep whichever came first in the input array
// (Array.prototype.sort is stable), which matches entries already being fetched
// ordered by entry_date descending from the database.
export function latestEntry(entries: AdPerformanceEntry[]): AdPerformanceEntry | null {
  if (entries.length === 0) return null
  return [...entries].sort((a, b) => b.entry_date.localeCompare(a.entry_date))[0]
}

export const UNDERPERFORMING_CTR_THRESHOLD = 1.0

// An ad with zero entries is never flagged — being new isn't the same as lagging.
export function isUnderperforming(entries: AdPerformanceEntry[]): boolean {
  const latest = latestEntry(entries)
  return latest !== null && latest.ctr < UNDERPERFORMING_CTR_THRESHOLD
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `pnpm test lib/ads-tracker/performance-metrics.test.ts`
Expected: PASS — all 13 tests green.

- [ ] **Step 5: Commit**

```bash
git add lib/ads-tracker/performance-metrics.ts lib/ads-tracker/performance-metrics.test.ts
git commit -m "feat(ads-tracker): add pure performance-metrics module with tests"
```

---

### Task 5: Data loader extension

**Files:**
- Modify: `lib/data/content-tracker.ts`

**Interfaces:**
- Consumes: `AdPerformanceEntry` type from `@/lib/ads-tracker/performance-metrics` (Task 4).
- Produces: `Ad.performanceEntries: AdPerformanceEntry[]` populated on every ad returned by `getContentTrackerData()` — consumed by Task 6 (client `Ad` type) and Task 9 (card UI).

- [ ] **Step 1: Add the import**

In `lib/data/content-tracker.ts`, update the top import:

```typescript
import { createClient } from '@supabase/supabase-js'
import type { ContentItem, Ad } from '@/components/content-tracker/content-tracker-client'
import type { AdPerformanceEntry } from '@/lib/ads-tracker/performance-metrics'
```

- [ ] **Step 2: Fetch the new table**

In `getContentTrackerData`, replace:

```typescript
  const [itemsRes, postsRes, usersRes, adsRes, revisionsRes] = await Promise.all([
    admin.from('content_items').select('*').eq('company_id', companyId).order('created_at', { ascending: false }),
    admin.from('content_item_posts').select('*').eq('company_id', companyId).order('posted_date', { ascending: false }),
    admin.from('users').select('id, name').eq('company_id', companyId),
    admin.from('ads_tracker').select('*').eq('company_id', companyId).order('created_at', { ascending: false }),
    admin.from('ad_revisions').select('*').eq('company_id', companyId).order('revision_date', { ascending: false }),
  ])
```

with:

```typescript
  const [itemsRes, postsRes, usersRes, adsRes, revisionsRes, performanceRes] = await Promise.all([
    admin.from('content_items').select('*').eq('company_id', companyId).order('created_at', { ascending: false }),
    admin.from('content_item_posts').select('*').eq('company_id', companyId).order('posted_date', { ascending: false }),
    admin.from('users').select('id, name').eq('company_id', companyId),
    admin.from('ads_tracker').select('*').eq('company_id', companyId).order('created_at', { ascending: false }),
    admin.from('ad_revisions').select('*').eq('company_id', companyId).order('revision_date', { ascending: false }),
    admin.from('ad_performance_entries').select('*').eq('company_id', companyId).order('entry_date', { ascending: false }),
  ])
```

- [ ] **Step 3: Add the row type and grouping map**

Replace:

```typescript
  type RevisionRow = { id: string; ad_id: string; revision_date: string; notes: string; hook_count_after: number | null; targeting_type_after: 'broad' | 'interest' | 'lookalike' | 'retargeting' | null }

  const itemRows = (itemsRes.data ?? []) as ItemRow[]
  const postRows = (postsRes.data ?? []) as PostRow[]
  const userRows = (usersRes.data ?? []) as UserRow[]
  const adRows = (adsRes.data ?? []) as AdRow[]
  const revisionRows = (revisionsRes.data ?? []) as RevisionRow[]
```

with:

```typescript
  type RevisionRow = { id: string; ad_id: string; revision_date: string; notes: string; hook_count_after: number | null; targeting_type_after: 'broad' | 'interest' | 'lookalike' | 'retargeting' | null }
  type PerformanceRow = { id: string; ad_id: string; entry_date: string; spend: number; impressions: number; reach: number; clicks: number; ctr: number; results: number; note: string | null }

  const itemRows = (itemsRes.data ?? []) as ItemRow[]
  const postRows = (postsRes.data ?? []) as PostRow[]
  const userRows = (usersRes.data ?? []) as UserRow[]
  const adRows = (adsRes.data ?? []) as AdRow[]
  const revisionRows = (revisionsRes.data ?? []) as RevisionRow[]
  const performanceRows = (performanceRes.data ?? []) as PerformanceRow[]
```

- [ ] **Step 4: Group performance rows by ad**

Replace:

```typescript
  const revisionsByAd = new Map<string, RevisionRow[]>()
  for (const r of revisionRows) {
    if (!revisionsByAd.has(r.ad_id)) revisionsByAd.set(r.ad_id, [])
    revisionsByAd.get(r.ad_id)!.push(r)
  }
```

with:

```typescript
  const revisionsByAd = new Map<string, RevisionRow[]>()
  for (const r of revisionRows) {
    if (!revisionsByAd.has(r.ad_id)) revisionsByAd.set(r.ad_id, [])
    revisionsByAd.get(r.ad_id)!.push(r)
  }
  const performanceByAd = new Map<string, PerformanceRow[]>()
  for (const p of performanceRows) {
    if (!performanceByAd.has(p.ad_id)) performanceByAd.set(p.ad_id, [])
    performanceByAd.get(p.ad_id)!.push(p)
  }
```

(`performanceByAd` is typed with the local `PerformanceRow[]` — matching how `revisionsByAd` above it is typed `RevisionRow[]`, not the exported `AdRevision[]` type. `PerformanceRow` and `AdPerformanceEntry` are structurally identical, so `performanceByAd.get(row.id) ?? []` in Step 5 below is still assignable directly to `Ad.performanceEntries: AdPerformanceEntry[]` with no cast needed — same as the existing `revisions` field already does.)

- [ ] **Step 5: Attach performanceEntries to each ad**

Replace:

```typescript
  const ads: Ad[] = adRows.map(row => ({
    id: row.id,
    client_name: row.client_name,
    ad_name: row.ad_name,
    platform: row.platform,
    launch_date: row.launch_date,
    hook_count: row.hook_count,
    targeting_type: row.targeting_type,
    targeting_notes: row.targeting_notes,
    status: row.status,
    created_at: row.created_at,
    revisions: revisionsByAd.get(row.id) ?? [],
  }))
```

with:

```typescript
  const ads: Ad[] = adRows.map(row => ({
    id: row.id,
    client_name: row.client_name,
    ad_name: row.ad_name,
    platform: row.platform,
    launch_date: row.launch_date,
    hook_count: row.hook_count,
    targeting_type: row.targeting_type,
    targeting_notes: row.targeting_notes,
    status: row.status,
    created_at: row.created_at,
    revisions: revisionsByAd.get(row.id) ?? [],
    performanceEntries: performanceByAd.get(row.id) ?? [],
  }))
```

- [ ] **Step 6: Typecheck**

Run: `pnpm typecheck`
Expected: one error — `Property 'performanceEntries' is missing in type` on the `Ad` type in `content-tracker-client.tsx`. This is expected; Task 6 fixes it. Confirm the error is exactly that (not something else) before moving on.

- [ ] **Step 7: Commit**

```bash
git add lib/data/content-tracker.ts
git commit -m "feat(content-tracker): fetch and attach ad performance entries in data loader"
```

---

### Task 6: Client type extensions

**Files:**
- Modify: `components/content-tracker/content-tracker-client.tsx`

**Interfaces:**
- Consumes: `AdPerformanceEntry`, `latestEntry`, `isUnderperforming` from `@/lib/ads-tracker/performance-metrics` (Task 4).
- Produces: `Ad.performanceEntries: AdPerformanceEntry[]` on the client-side `Ad` type — consumed by Task 7 (modal) and Task 9 (card UI). Re-exports nothing new (types stay local to this file, matching how `AdRevision` is handled).

- [ ] **Step 1: Add the import**

In `components/content-tracker/content-tracker-client.tsx`, update the top import block from:

```typescript
import { PageHero } from "@/components/admin/PageHero"
import ClientSelector from "@/components/ui/ClientSelector"
import { buildClientOptions } from "@/lib/utils/client-options"
```

to:

```typescript
import { PageHero } from "@/components/admin/PageHero"
import ClientSelector from "@/components/ui/ClientSelector"
import { buildClientOptions } from "@/lib/utils/client-options"
import { latestEntry, isUnderperforming, type AdPerformanceEntry } from "@/lib/ads-tracker/performance-metrics"
```

- [ ] **Step 2: Add `AlertTriangle` icon to the lucide-react import**

Replace:

```typescript
import {
  Plus, X, GripVertical, Video, Image as ImageIcon, Camera, PlaySquare, ThumbsUp,
  Building2, Store, Search, Trash2, Sparkles, Pencil,
  Layers, History, ArrowRight, Check, ChevronDown, Megaphone, Target,
} from "lucide-react"
```

with:

```typescript
import {
  Plus, X, GripVertical, Video, Image as ImageIcon, Camera, PlaySquare, ThumbsUp,
  Building2, Store, Search, Trash2, Sparkles, Pencil,
  Layers, History, ArrowRight, Check, ChevronDown, Megaphone, Target, AlertTriangle,
} from "lucide-react"
```

- [ ] **Step 3: Extend the `Ad` type**

Find (near the top of the file, right after `AdRevision`):

```typescript
export type Ad = {
  id: string
  client_name: string
  ad_name: string
  platform: string
  launch_date: string | null
  hook_count: number
  targeting_type: TargetingType | null
  targeting_notes: string | null
  status: AdStatus
  created_at: string
  revisions: AdRevision[]
}
```

Replace with:

```typescript
export type Ad = {
  id: string
  client_name: string
  ad_name: string
  platform: string
  launch_date: string | null
  hook_count: number
  targeting_type: TargetingType | null
  targeting_notes: string | null
  status: AdStatus
  created_at: string
  revisions: AdRevision[]
  performanceEntries: AdPerformanceEntry[]
}
```

- [ ] **Step 4: Add `addAdPerformanceEntry` to the actions import**

Replace:

```typescript
import {
  createContentItem, updateContentItem, updateContentItemStatus, deleteContentItem,
  addContentPost, deleteContentPost,
  createAd, updateAdStatus, deleteAd, addAdRevision,
} from "@/lib/actions/content-tracker"
```

with:

```typescript
import {
  createContentItem, updateContentItem, updateContentItemStatus, deleteContentItem,
  addContentPost, deleteContentPost,
  createAd, updateAdStatus, deleteAd, addAdRevision, addAdPerformanceEntry,
} from "@/lib/actions/content-tracker"
```

- [ ] **Step 5: Fix the two call sites that construct an `Ad` without `performanceEntries`**

There are two places in this file that build a new `Ad` object by hand (in `NewAdModal`'s `onCreated` call and nowhere else — `EditContentModal` and `NewContentModal` build `ContentItem`, not `Ad`, so they're unaffected). Find, inside `NewAdModal`'s `submit()` function:

```typescript
    onCreated({
      id: res.id, client_name: client, ad_name: adName.trim(), platform, launch_date: launchDate, hook_count: hookCount,
      targeting_type: targeting || null, targeting_notes: notes.trim() || null, status: "active", created_at: new Date().toISOString(), revisions: [],
    })
```

Replace with:

```typescript
    onCreated({
      id: res.id, client_name: client, ad_name: adName.trim(), platform, launch_date: launchDate, hook_count: hookCount,
      targeting_type: targeting || null, targeting_notes: notes.trim() || null, status: "active", created_at: new Date().toISOString(), revisions: [],
      performanceEntries: [],
    })
```

- [ ] **Step 6: Typecheck**

Run: `pnpm typecheck`
Expected: no errors — the missing-property error from Task 5 is now resolved.

- [ ] **Step 7: Commit**

```bash
git add components/content-tracker/content-tracker-client.tsx
git commit -m "feat(content-tracker): extend Ad type with performanceEntries"
```

---

### Task 7: AdPerformanceModal component

**Files:**
- Modify: `components/content-tracker/content-tracker-client.tsx`

**Interfaces:**
- Consumes: `Ad`, `AdPerformanceEntry` types (Task 6); `addAdPerformanceEntry` server action (Task 3); `Modal`, `PrimaryButton`, `LABEL`, `FIELD` shared components already in this file.
- Produces: `AdPerformanceModal` component with props `{ ad: Ad; onClose: () => void; onAdded: (entry: AdPerformanceEntry) => void }` — consumed by Task 9's wiring.

- [ ] **Step 1: Add the modal component**

In `components/content-tracker/content-tracker-client.tsx`, find the end of `AdRevisionModal` (it ends with `}` right before the `// ── Main component ─────...` comment):

```typescript
  return (
    <Modal title={`Log Correction — ${ad.ad_name}`} onClose={onClose}>
      <div className="flex flex-col gap-3">
        <div>
          <label style={LABEL}>What changed? *</label>
          <textarea style={{ ...FIELD, minHeight: 70, resize: "vertical" }} value={notes} onChange={e => setNotes(e.target.value)} placeholder="e.g. Switched broad to interest-based after week 1, added 2 new hooks" />
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
          <div>
            <label style={LABEL}>New Hook Count</label>
            <input type="number" min={0} style={FIELD} value={hookCount} onChange={e => setHookCount(e.target.value === "" ? "" : Number(e.target.value))} placeholder={String(ad.hook_count)} />
          </div>
          <div>
            <label style={LABEL}>New Targeting</label>
            <select style={{ ...FIELD, cursor: "pointer" }} value={targeting} onChange={e => setTargeting(e.target.value as TargetingType | "")}>
              <option value="">No change</option>
              {(Object.keys(TARGETING_CFG) as TargetingType[]).map(t => <option key={t} value={t}>{TARGETING_CFG[t].label}</option>)}
            </select>
          </div>
        </div>
        {error && <p style={{ fontSize: 11, color: "#DE1A1A", margin: 0 }}>{error}</p>}
        <PrimaryButton onClick={submit} disabled={saving}>{saving ? "Saving…" : "Log Correction"}</PrimaryButton>
      </div>
    </Modal>
  )
}

// ── Main component ───────────────────────────────────────────────────────────
```

Insert the new modal between the closing `}` of `AdRevisionModal` and the `// ── Main component ──` comment:

```typescript
  return (
    <Modal title={`Log Correction — ${ad.ad_name}`} onClose={onClose}>
      <div className="flex flex-col gap-3">
        <div>
          <label style={LABEL}>What changed? *</label>
          <textarea style={{ ...FIELD, minHeight: 70, resize: "vertical" }} value={notes} onChange={e => setNotes(e.target.value)} placeholder="e.g. Switched broad to interest-based after week 1, added 2 new hooks" />
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
          <div>
            <label style={LABEL}>New Hook Count</label>
            <input type="number" min={0} style={FIELD} value={hookCount} onChange={e => setHookCount(e.target.value === "" ? "" : Number(e.target.value))} placeholder={String(ad.hook_count)} />
          </div>
          <div>
            <label style={LABEL}>New Targeting</label>
            <select style={{ ...FIELD, cursor: "pointer" }} value={targeting} onChange={e => setTargeting(e.target.value as TargetingType | "")}>
              <option value="">No change</option>
              {(Object.keys(TARGETING_CFG) as TargetingType[]).map(t => <option key={t} value={t}>{TARGETING_CFG[t].label}</option>)}
            </select>
          </div>
        </div>
        {error && <p style={{ fontSize: 11, color: "#DE1A1A", margin: 0 }}>{error}</p>}
        <PrimaryButton onClick={submit} disabled={saving}>{saving ? "Saving…" : "Log Correction"}</PrimaryButton>
      </div>
    </Modal>
  )
}

// ── Log Performance modal ────────────────────────────────────────────────────
function AdPerformanceModal({ ad, onClose, onAdded }: { ad: Ad; onClose: () => void; onAdded: (entry: AdPerformanceEntry) => void }) {
  const [entryDate, setEntryDate] = useState(new Date().toISOString().split("T")[0])
  const [spend, setSpend] = useState<number | "">("")
  const [impressions, setImpressions] = useState<number | "">("")
  const [reach, setReach] = useState<number | "">("")
  const [clicks, setClicks] = useState<number | "">("")
  const [ctr, setCtr] = useState<number | "">("")
  const [results, setResults] = useState<number | "">("")
  const [note, setNote] = useState("")
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function submit() {
    if (spend === "" || impressions === "" || reach === "" || clicks === "" || ctr === "" || results === "") {
      setError("All 6 metrics are required")
      return
    }
    setSaving(true); setError(null)
    const res = await addAdPerformanceEntry({
      ad_id: ad.id, entry_date: entryDate,
      spend, impressions, reach, clicks, ctr, results,
      note: note.trim() || undefined,
    })
    setSaving(false)
    if (!res.success || !res.id) { setError(res.error ?? "Failed to save"); return }
    onAdded({
      id: res.id, ad_id: ad.id, entry_date: entryDate,
      spend, impressions, reach, clicks, ctr, results,
      note: note.trim() || null,
    })
  }

  return (
    <Modal title={`Log Performance — ${ad.ad_name}`} onClose={onClose}>
      <div className="flex flex-col gap-3">
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
          <div>
            <label style={LABEL}>Spend (₹) *</label>
            <input type="number" min={0} step="0.01" style={FIELD} value={spend} onChange={e => setSpend(e.target.value === "" ? "" : Number(e.target.value))} />
          </div>
          <div>
            <label style={LABEL}>Results *</label>
            <input type="number" min={0} style={FIELD} value={results} onChange={e => setResults(e.target.value === "" ? "" : Number(e.target.value))} placeholder="Leads / messages / purchases" />
          </div>
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
          <div>
            <label style={LABEL}>Impressions *</label>
            <input type="number" min={0} style={FIELD} value={impressions} onChange={e => setImpressions(e.target.value === "" ? "" : Number(e.target.value))} />
          </div>
          <div>
            <label style={LABEL}>Reach *</label>
            <input type="number" min={0} style={FIELD} value={reach} onChange={e => setReach(e.target.value === "" ? "" : Number(e.target.value))} />
          </div>
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
          <div>
            <label style={LABEL}>Clicks *</label>
            <input type="number" min={0} style={FIELD} value={clicks} onChange={e => setClicks(e.target.value === "" ? "" : Number(e.target.value))} />
          </div>
          <div>
            <label style={LABEL}>CTR % *</label>
            <input type="number" min={0} step="0.01" style={FIELD} value={ctr} onChange={e => setCtr(e.target.value === "" ? "" : Number(e.target.value))} />
          </div>
        </div>
        <div>
          <label style={LABEL}>Date</label>
          <input type="date" style={FIELD} value={entryDate} onChange={e => setEntryDate(e.target.value)} />
        </div>
        <div>
          <label style={LABEL}>Note</label>
          <textarea style={{ ...FIELD, minHeight: 50, resize: "vertical" }} value={note} onChange={e => setNote(e.target.value)} placeholder="Optional — e.g. why it's lagging, what changed" />
        </div>
        {error && <p style={{ fontSize: 11, color: "#DE1A1A", margin: 0 }}>{error}</p>}
        <PrimaryButton onClick={submit} disabled={saving}>{saving ? "Saving…" : "Log Performance"}</PrimaryButton>
      </div>
    </Modal>
  )
}

// ── Main component ───────────────────────────────────────────────────────────
```

- [ ] **Step 2: Typecheck**

Run: `pnpm typecheck`
Expected: no errors.

- [ ] **Step 3: Lint**

Run: `npx eslint components/content-tracker/content-tracker-client.tsx`
Expected: no new errors (pre-existing warnings in this file, if any, are unrelated and unchanged).

- [ ] **Step 4: Commit**

```bash
git add components/content-tracker/content-tracker-client.tsx
git commit -m "feat(content-tracker): add AdPerformanceModal component"
```

---

### Task 8: Toolbar — search box + status filter chips

**Files:**
- Modify: `components/content-tracker/content-tracker-client.tsx`

**Interfaces:**
- Consumes: `AdStatus` type, `AD_STATUS_CFG` config object, `ads` state, `adsClientFilter` state — all already in this file.
- Produces: `adsSearch`, `adsStatusFilter` state; `filteredAds` extended to filter by both — consumed by Task 9's card list render.

- [ ] **Step 1: Add the new filter state**

Find:

```typescript
  const [showNewAd, setShowNewAd] = useState(false)
  const [revisionModalAd, setRevisionModalAd] = useState<Ad | null>(null)
  const [adsClientFilter, setAdsClientFilter] = useState<string>("all")
```

Replace with:

```typescript
  const [showNewAd, setShowNewAd] = useState(false)
  const [revisionModalAd, setRevisionModalAd] = useState<Ad | null>(null)
  const [performanceModalAd, setPerformanceModalAd] = useState<Ad | null>(null)
  const [adsClientFilter, setAdsClientFilter] = useState<string>("all")
  const [adsSearch, setAdsSearch] = useState("")
  const [adsStatusFilter, setAdsStatusFilter] = useState<AdStatus | "all">("all")
```

- [ ] **Step 2: Extend `filteredAds` to include search and status**

Find:

```typescript
  const filteredAds = useMemo(
    () => adsClientFilter === "all" ? ads : ads.filter(a => a.client_name === adsClientFilter),
    [ads, adsClientFilter]
  )
```

Replace with:

```typescript
  const filteredAds = useMemo(() => {
    let rows = ads
    if (adsClientFilter !== "all") rows = rows.filter(a => a.client_name === adsClientFilter)
    if (adsStatusFilter !== "all") rows = rows.filter(a => a.status === adsStatusFilter)
    if (adsSearch) rows = rows.filter(a => `${a.ad_name} ${a.client_name}`.toLowerCase().includes(adsSearch.toLowerCase()))
    return rows
  }, [ads, adsClientFilter, adsStatusFilter, adsSearch])
```

- [ ] **Step 3: Add the search box and status chips to the toolbar**

Find the Ads tab's toolbar row:

```typescript
      {tab === "ads" && (
        <div className="flex flex-col gap-4">
          <div className="flex items-center justify-between flex-wrap gap-2">
            <select value={adsClientFilter} onChange={e => setAdsClientFilter(e.target.value)}
              style={{ ...FIELD, width: "auto", cursor: "pointer" }}>
              <option value="all">All Clients</option>
              {activeClientOptions.map(c => <option key={c} value={c}>{c}</option>)}
              {pastClientOptions.length > 0 && (
                <optgroup label="📁 Past Clients">
                  {pastClientOptions.map(c => <option key={c} value={c}>{c}</option>)}
                </optgroup>
              )}
            </select>
            <button onClick={() => setShowNewAd(true)}
              style={{ display: "flex", alignItems: "center", gap: 6, padding: "10px 16px", borderRadius: 12, border: "none", background: "linear-gradient(135deg,#FF4D4D,#DE1A1A)", color: "#fff", fontSize: 12, fontWeight: 800, cursor: "pointer" }}>
              <Plus size={14} /> New Ad
            </button>
          </div>

          {ads.length === 0 ? (
```

Replace with:

```typescript
      {tab === "ads" && (
        <div className="flex flex-col gap-4">
          <div className="flex items-center justify-between flex-wrap gap-2">
            <div className="flex items-center gap-2 flex-wrap" style={{ flex: "1 1 auto" }}>
              <div style={{ position: "relative", flex: "1 1 200px" }}>
                <Search size={13} style={{ position: "absolute", left: 10, top: "50%", transform: "translateY(-50%)", color: "#9CA3AF" }} />
                <input value={adsSearch} onChange={e => setAdsSearch(e.target.value)} placeholder="Search ad or client…"
                  style={{ ...FIELD, paddingLeft: 30 }} />
              </div>
              <select value={adsClientFilter} onChange={e => setAdsClientFilter(e.target.value)}
                style={{ ...FIELD, width: "auto", cursor: "pointer" }}>
                <option value="all">All Clients</option>
                {activeClientOptions.map(c => <option key={c} value={c}>{c}</option>)}
                {pastClientOptions.length > 0 && (
                  <optgroup label="📁 Past Clients">
                    {pastClientOptions.map(c => <option key={c} value={c}>{c}</option>)}
                  </optgroup>
                )}
              </select>
            </div>
            <button onClick={() => setShowNewAd(true)}
              style={{ display: "flex", alignItems: "center", gap: 6, padding: "10px 16px", borderRadius: 12, border: "none", background: "linear-gradient(135deg,#FF4D4D,#DE1A1A)", color: "#fff", fontSize: 12, fontWeight: 800, cursor: "pointer" }}>
              <Plus size={14} /> New Ad
            </button>
          </div>

          <div className="flex items-center gap-2 flex-wrap">
            <button onClick={() => setAdsStatusFilter("all")}
              style={{ padding: "8px 12px", borderRadius: 10, border: `1.5px solid ${adsStatusFilter === "all" ? "#DE1A1A" : "#E5E7EB"}`, background: adsStatusFilter === "all" ? "rgba(222,26,26,0.08)" : "#fff", color: adsStatusFilter === "all" ? "#DE1A1A" : "#6B7280", fontSize: 11, fontWeight: 700, cursor: "pointer" }}>
              All Statuses
            </button>
            {(Object.keys(AD_STATUS_CFG) as AdStatus[]).map(s => {
              const cfg = AD_STATUS_CFG[s]
              return (
                <button key={s} onClick={() => setAdsStatusFilter(s)}
                  style={{ padding: "8px 12px", borderRadius: 10, border: `1.5px solid ${adsStatusFilter === s ? cfg.color : "#E5E7EB"}`, background: adsStatusFilter === s ? `${cfg.color}14` : "#fff", color: adsStatusFilter === s ? cfg.color : "#6B7280", fontSize: 11, fontWeight: 700, cursor: "pointer" }}>
                  {cfg.label}
                </button>
              )
            })}
          </div>

          {ads.length === 0 ? (
```

- [ ] **Step 4: Update the "no ads for this filter" empty state to clear all three filters**

Find:

```typescript
          ) : filteredAds.length === 0 ? (
            <div style={{ background: "#fff", border: "1px dashed #E5E7EB", borderRadius: 18, padding: "40px 20px", textAlign: "center" }}>
              <Megaphone size={24} style={{ color: "#D1D5DB", margin: "0 auto 8px" }} />
              <p style={{ fontSize: 12, color: "#9CA3AF", margin: 0 }}>No ads for {adsClientFilter}</p>
              <button onClick={() => setAdsClientFilter("all")}
                style={{ marginTop: 8, fontSize: 11, fontWeight: 700, color: "#DE1A1A", background: "none", border: "none", cursor: "pointer" }}>
                Clear filter
              </button>
            </div>
          ) : (
```

Replace with:

```typescript
          ) : filteredAds.length === 0 ? (
            <div style={{ background: "#fff", border: "1px dashed #E5E7EB", borderRadius: 18, padding: "40px 20px", textAlign: "center" }}>
              <Megaphone size={24} style={{ color: "#D1D5DB", margin: "0 auto 8px" }} />
              <p style={{ fontSize: 12, color: "#9CA3AF", margin: 0 }}>No ads match your filters</p>
              <button onClick={() => { setAdsClientFilter("all"); setAdsStatusFilter("all"); setAdsSearch("") }}
                style={{ marginTop: 8, fontSize: 11, fontWeight: 700, color: "#DE1A1A", background: "none", border: "none", cursor: "pointer" }}>
                Clear filters
              </button>
            </div>
          ) : (
```

- [ ] **Step 5: Typecheck**

Run: `pnpm typecheck`
Expected: no errors.

- [ ] **Step 6: Commit**

```bash
git add components/content-tracker/content-tracker-client.tsx
git commit -m "feat(content-tracker): add search box and status filter chips to Ads Tracker tab"
```

---

### Task 9: Card UI — metrics row, Underperforming badge, Performance section

**Files:**
- Modify: `components/content-tracker/content-tracker-client.tsx`

**Interfaces:**
- Consumes: `latestEntry`, `isUnderperforming`, `cpc`, `cpm`, `frequency`, `costPerResult` from `@/lib/ads-tracker/performance-metrics` (this task adds these 4 to the import from Task 6, which only imported `latestEntry`/`isUnderperforming`); `AdPerformanceModal` (Task 7); `performanceModalAd` state (Task 8).
- Produces: fully wired Performance section — no further consumers, this is the final UI task.

- [ ] **Step 1: Complete the performance-metrics import**

Find (from Task 6, Step 1):

```typescript
import { latestEntry, isUnderperforming, type AdPerformanceEntry } from "@/lib/ads-tracker/performance-metrics"
```

Replace with:

```typescript
import { latestEntry, isUnderperforming, cpc, cpm, frequency, costPerResult, type AdPerformanceEntry } from "@/lib/ads-tracker/performance-metrics"
```

- [ ] **Step 2: Add a currency/number formatter helper**

Find the `fmtDateRange` helper function (near the other `fmt*` helpers):

```typescript
function fmtDateRange(dates: string[]) {
  const sorted = Array.from(new Set(dates)).sort()
  if (sorted.length === 1) return fmtDate(sorted[0])
  return `${fmtDate(sorted[0])} – ${fmtDate(sorted[sorted.length - 1])}`
}
```

Add immediately after it:

```typescript
function fmtCompactNumber(n: number): string {
  if (n >= 1000) return `${(n / 1000).toFixed(1).replace(/\.0$/, "")}K`
  return String(Math.round(n))
}
function fmtCurrency(n: number): string {
  return `₹${n.toLocaleString("en-IN", { maximumFractionDigits: 0 })}`
}
function fmtMetric(n: number | null, formatter: (n: number) => string = String): string {
  return n === null ? "—" : formatter(n)
}
```

- [ ] **Step 3: Add the compact metrics row and Underperforming badge to the collapsed card**

Find the collapsed card header:

```typescript
                return (
                  <div key={ad.id} style={{ background: "#fff", border: "1px solid #E5E7EB", borderRadius: 18, overflow: "hidden" }}>
                    <div style={{ padding: "14px 18px", display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: 10, cursor: "pointer" }}
                      onClick={() => setExpandedAd(expanded ? null : ad.id)}>
                      <div style={{ minWidth: 0 }}>
                        <p style={{ fontSize: 13, fontWeight: 800, color: "#111827", margin: 0 }}>{ad.ad_name}</p>
                        <p style={{ fontSize: 11, color: "#9CA3AF", margin: "2px 0 0" }}>{ad.client_name} · {ad.platform} · Launched {fmtDate(ad.launch_date)}</p>
                      </div>
                      <div className="flex items-center gap-2 flex-wrap">
                        <span style={{ fontSize: 10, fontWeight: 700, padding: "3px 10px", borderRadius: 99, background: "rgba(99,102,241,0.1)", color: "#6366F1" }}>
                          <Target size={10} className="inline mr-1" />{ad.hook_count} hooks
                        </span>
```

Replace with:

```typescript
                const latest = latestEntry(ad.performanceEntries)
                const underperforming = isUnderperforming(ad.performanceEntries)
                return (
                  <div key={ad.id} style={{ background: "#fff", border: `1px solid ${underperforming ? "#FCA5A5" : "#E5E7EB"}`, borderRadius: 18, overflow: "hidden" }}>
                    <div style={{ padding: "14px 18px", display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: 10, cursor: "pointer" }}
                      onClick={() => setExpandedAd(expanded ? null : ad.id)}>
                      <div style={{ minWidth: 0 }}>
                        <p style={{ fontSize: 13, fontWeight: 800, color: "#111827", margin: 0 }}>{ad.ad_name}</p>
                        <p style={{ fontSize: 11, color: "#9CA3AF", margin: "2px 0 0" }}>{ad.client_name} · {ad.platform} · Launched {fmtDate(ad.launch_date)}</p>
                        <p style={{ fontSize: 11, color: "#6B7280", margin: "4px 0 0" }}>
                          {latest
                            ? `${fmtCurrency(latest.spend)} spent · ${fmtCompactNumber(latest.reach)} reach · ${latest.ctr}% CTR · ${latest.results} results`
                            : "No performance logged"}
                        </p>
                      </div>
                      <div className="flex items-center gap-2 flex-wrap">
                        {underperforming && (
                          <span style={{ display: "flex", alignItems: "center", gap: 4, fontSize: 10, fontWeight: 700, padding: "3px 10px", borderRadius: 99, background: "rgba(239,68,68,0.1)", color: "#EF4444" }}>
                            <AlertTriangle size={10} /> Underperforming
                          </span>
                        )}
                        <span style={{ fontSize: 10, fontWeight: 700, padding: "3px 10px", borderRadius: 99, background: "rgba(99,102,241,0.1)", color: "#6366F1" }}>
                          <Target size={10} className="inline mr-1" />{ad.hook_count} hooks
                        </span>
```

- [ ] **Step 4: Add the Performance section to the expanded card, before Correction History**

Find the start of the expanded section:

```typescript
                    {expanded && (
                      <div style={{ padding: "0 18px 18px", borderTop: "1px solid #F3F4F6" }}>
                        {ad.targeting_notes && (
                          <p style={{ fontSize: 11, color: "#6B7280", margin: "12px 0" }}>{ad.targeting_notes}</p>
                        )}
                        <div className="flex items-center justify-between" style={{ marginTop: 12, marginBottom: 8 }}>
                          <span style={{ fontSize: 10, fontWeight: 700, color: "#9CA3AF", textTransform: "uppercase", letterSpacing: "0.06em" }}>Correction History</span>
```

Replace with:

```typescript
                    {expanded && (
                      <div style={{ padding: "0 18px 18px", borderTop: "1px solid #F3F4F6" }}>
                        {ad.targeting_notes && (
                          <p style={{ fontSize: 11, color: "#6B7280", margin: "12px 0" }}>{ad.targeting_notes}</p>
                        )}

                        <div className="flex items-center justify-between" style={{ marginTop: 12, marginBottom: 8 }}>
                          <span style={{ fontSize: 10, fontWeight: 700, color: "#9CA3AF", textTransform: "uppercase", letterSpacing: "0.06em" }}>Performance</span>
                          <button onClick={() => setPerformanceModalAd(ad)}
                            style={{ display: "flex", alignItems: "center", gap: 4, padding: "5px 10px", borderRadius: 8, border: "none", background: "rgba(34,197,94,0.08)", color: "#16A34A", fontSize: 10, fontWeight: 700, cursor: "pointer" }}>
                            <Plus size={11} /> Log Performance
                          </button>
                        </div>
                        {ad.performanceEntries.length === 0 ? (
                          <p style={{ fontSize: 11, color: "#D1D5DB" }}>No performance logged yet</p>
                        ) : (
                          <div className="flex flex-col gap-2" style={{ marginBottom: 12 }}>
                            {[...ad.performanceEntries].sort((a, b) => b.entry_date.localeCompare(a.entry_date)).map(entry => (
                              <div key={entry.id} style={{ padding: "8px 12px", borderRadius: 10, background: "#F9FAFB", border: "1px solid #F3F4F6" }}>
                                <div className="flex items-center justify-between">
                                  <span style={{ fontSize: 10, fontWeight: 700, color: "#374151" }}>{fmtDate(entry.entry_date)}</span>
                                  <span style={{ fontSize: 9, fontWeight: 700, color: entry.ctr < 1 ? "#EF4444" : "#16A34A" }}>{entry.ctr}% CTR</span>
                                </div>
                                <div className="flex flex-wrap gap-x-3 gap-y-1" style={{ marginTop: 4 }}>
                                  <span style={{ fontSize: 10, color: "#6B7280" }}>{fmtCurrency(entry.spend)} spend</span>
                                  <span style={{ fontSize: 10, color: "#6B7280" }}>{fmtCompactNumber(entry.impressions)} impr</span>
                                  <span style={{ fontSize: 10, color: "#6B7280" }}>{fmtCompactNumber(entry.reach)} reach</span>
                                  <span style={{ fontSize: 10, color: "#6B7280" }}>{entry.clicks} clicks</span>
                                  <span style={{ fontSize: 10, color: "#6B7280" }}>{entry.results} results</span>
                                  <span style={{ fontSize: 10, color: "#6B7280" }}>CPC {fmtMetric(cpc(entry), fmtCurrency)}</span>
                                  <span style={{ fontSize: 10, color: "#6B7280" }}>CPM {fmtMetric(cpm(entry), fmtCurrency)}</span>
                                  <span style={{ fontSize: 10, color: "#6B7280" }}>Freq {fmtMetric(frequency(entry), n => n.toFixed(2))}</span>
                                  <span style={{ fontSize: 10, color: "#6B7280" }}>Cost/Result {fmtMetric(costPerResult(entry), fmtCurrency)}</span>
                                </div>
                                {entry.note && <p style={{ fontSize: 11, color: "#6B7280", margin: "4px 0 0" }}>{entry.note}</p>}
                              </div>
                            ))}
                          </div>
                        )}

                        <div className="flex items-center justify-between" style={{ marginTop: 12, marginBottom: 8 }}>
                          <span style={{ fontSize: 10, fontWeight: 700, color: "#9CA3AF", textTransform: "uppercase", letterSpacing: "0.06em" }}>Correction History</span>
```

- [ ] **Step 5: Wire the modal at the bottom of the component**

Find:

```typescript
      {revisionModalAd && (
        <AdRevisionModal ad={revisionModalAd} onClose={() => setRevisionModalAd(null)}
          onAdded={rev => {
            setAds(prev => prev.map(a => a.id === rev.ad_id ? {
              ...a, revisions: [rev, ...a.revisions],
              hook_count: rev.hook_count_after ?? a.hook_count,
              targeting_type: rev.targeting_type_after ?? a.targeting_type,
            } : a))
            setRevisionModalAd(null)
          }} />
      )}
    </div>
  )
}
```

Replace with:

```typescript
      {revisionModalAd && (
        <AdRevisionModal ad={revisionModalAd} onClose={() => setRevisionModalAd(null)}
          onAdded={rev => {
            setAds(prev => prev.map(a => a.id === rev.ad_id ? {
              ...a, revisions: [rev, ...a.revisions],
              hook_count: rev.hook_count_after ?? a.hook_count,
              targeting_type: rev.targeting_type_after ?? a.targeting_type,
            } : a))
            setRevisionModalAd(null)
          }} />
      )}
      {performanceModalAd && (
        <AdPerformanceModal ad={performanceModalAd} onClose={() => setPerformanceModalAd(null)}
          onAdded={entry => {
            setAds(prev => prev.map(a => a.id === entry.ad_id ? { ...a, performanceEntries: [entry, ...a.performanceEntries] } : a))
            setPerformanceModalAd(null)
          }} />
      )}
    </div>
  )
}
```

- [ ] **Step 6: Typecheck**

Run: `pnpm typecheck`
Expected: no errors.

- [ ] **Step 7: Lint**

Run: `npx eslint components/content-tracker/content-tracker-client.tsx`
Expected: no new errors.

- [ ] **Step 8: Commit**

```bash
git add components/content-tracker/content-tracker-client.tsx
git commit -m "feat(content-tracker): wire Performance section, metrics row, and Underperforming badge into Ads Tracker cards"
```

---

### Task 10: Full verification pass

**Files:** none (verification only)

**Interfaces:** none.

- [ ] **Step 1: Run the full test suite**

Run: `pnpm test`
Expected: all tests pass, including the 13 new tests from Task 4.

- [ ] **Step 2: Run typecheck**

Run: `pnpm typecheck`
Expected: no errors.

- [ ] **Step 3: Run lint on the full project**

Run: `pnpm lint`
Expected: no new errors introduced by this feature (pre-existing warnings elsewhere in the codebase are out of scope).

- [ ] **Step 4: Run a production build**

Run: `pnpm build`
Expected: build succeeds, `/admin/content-tracker` and `/member/content-tracker` compile without error.

- [ ] **Step 5: Manual click-through checklist**

Start the dev server (`pnpm dev`) and log in. On both `/admin/content-tracker` and `/member/content-tracker`, open the Ads Tracker tab and confirm:

- [ ] Search box filters the ad list by ad name or client name.
- [ ] Status chips (Active/Testing/Paused/Stopped/All) filter correctly and combine with the client dropdown and search box.
- [ ] Clicking "Log Performance" on an ad opens the modal; submitting with a field empty shows "All 6 metrics are required" and does not save.
- [ ] Submitting a valid entry with CTR ≥ 1% closes the modal, adds the entry to the history list (newest first), and shows no Underperforming badge.
- [ ] Submitting a valid entry with CTR < 1% shows the red "⚠ Underperforming" badge on the collapsed card and a red card border.
- [ ] An ad with zero entries shows "No performance logged" on the collapsed card and is never flagged Underperforming.
- [ ] In the expanded card's Performance history list, CPC/CPM/Frequency/Cost-per-Result display correctly, and show "—" for an entry where the relevant denominator (clicks/impressions/reach/results) is 0.
- [ ] Reloading the page persists all logged entries (confirms the server action + data loader round-trip).
- [ ] At 360px viewport width, the compact metrics row and Underperforming badge do not overlap or get cut off by other card text.

- [ ] **Step 6: Report results**

If all checks pass, the feature is complete. If any check fails, fix the specific issue, re-run the relevant verification step (not the whole checklist), and note what was fixed before considering the task done.

## Self-Review

**Spec coverage:** Data model (Task 1, 4, 5, 6) ✓. Required 6-field entry (Task 2, 7) ✓. Derived metrics never stored (Task 4) ✓. Underperforming flag on latest entry only, fixed 1% threshold, "no entries ≠ flagged" (Task 4, 9) ✓. Toolbar search + status chips (Task 8) ✓. Collapsed card metrics row + badge (Task 9) ✓. Expanded card Performance section with Log Performance button + history (Task 9) ✓. New/Edit Ad modals unchanged (no task touches them) ✓. Testing/Verification section from the spec (Task 10) ✓.

**Placeholder scan:** No TBD/TODO markers; every step has complete, runnable code.

**Type consistency:** `AdPerformanceEntry` defined once in Task 4, imported (not redefined) everywhere else. `Ad.performanceEntries: AdPerformanceEntry[]` consistent across Task 5 (loader), Task 6 (type), Task 7 (modal props), Task 9 (render). `addAdPerformanceEntry` signature consistent between Task 3 (definition) and Task 7 (call site). `AdStatus` reused from its existing definition, not redeclared.
