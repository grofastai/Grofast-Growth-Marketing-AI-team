# Content & Ads Tracker Shoot Scheduling (Phase 1) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a "Shoots" tab to the Content & Ads Tracker where a shoot can be scheduled with multiple video titles, marked Going on the day, marked Done (auto-creating one content item per title in the existing Pipeline at "Shot" status), or Cancelled at any point before completion.

**Architecture:** Extends the existing `shoots` table and `lib/actions/shoots.ts` (not a parallel implementation) with a new child table `shoot_titles` and a widened status enum. A pure `lib/shoots/status-transitions.ts` module validates the state machine, unit-tested with Vitest. UI lives entirely inside `components/content-tracker/content-tracker-client.tsx` as a 4th tab, following that file's established patterns exactly (`Modal`/`PrimaryButton`/`ClientSelector`/`FIELD`/`LABEL`, `useState` + `useMemo` filters, optimistic local state updates before the server action resolves).

**Tech Stack:** Next.js 15 App Router, Supabase (Postgres + RLS), TypeScript strict, Vitest.

## Global Constraints

- Multi-tenant: the new table has `company_id` and RLS (`tenant_all` + `service_all`), matching every existing table in this schema.
- Server Actions only for mutations — no new API routes.
- The existing `/admin/shoots` / `/member/shoots` page and its full logistics form are **not modified** — they keep working via the same, now-extended, `updateShootStatus` action.
- Shoots only ever produce **video** content items — no poster support in this flow (posters are created directly via the existing "New Content Item" modal, unchanged).
- No "who is going" prompt, no correction loop, no Ready-to-Post scheduling, no WhatsApp reminder — those are Phases 2-5, explicitly out of scope here.
- Valid shoot status transitions: `scheduled → going`, `scheduled → cancelled`, `going → completed`, `going → cancelled`. Any other transition is rejected server-side.
- Match `lib/actions/shoots.ts`'s existing convention: inline manual validation (not Zod), matching `createShoot`'s existing style in that file.

---

### Task 1: Database migration

**Files:**
- Create: `supabase/migrations/092_shoot_titles.sql`

**Interfaces:**
- Produces: `shoots.notes` (nullable text), `shoots.status` check widened to include `'going'`, and table `shoot_titles` with columns `id, shoot_id, company_id, title, content_item_id, created_by, created_at` — consumed by Task 3 (server actions) and Task 4 (data loader).

- [ ] **Step 1: Write the migration file**

```sql
-- Shoot scheduling (Phase 1): lets a shoot record multiple video titles, and adds a
-- "going" status between scheduled and completed/cancelled — crew mark themselves as
-- going on the day, and can still cancel after reaching the location.
alter table shoots add column if not exists notes text;

alter table shoots drop constraint if exists shoots_status_check;
alter table shoots add constraint shoots_status_check
  check (status in ('scheduled', 'going', 'completed', 'cancelled'));

-- One shoot can produce multiple video titles (one session -> several separate videos).
-- Each title becomes its own content_items row once the shoot is marked Done.
-- content_item_id starts null and is set on completion -- this both traces "which shoot
-- did this video come from" and prevents double-creation if Done fires more than once.
create table if not exists shoot_titles (
  id uuid primary key default gen_random_uuid(),
  shoot_id uuid not null references shoots(id) on delete cascade,
  company_id uuid not null,
  title text not null,
  content_item_id uuid references content_items(id) on delete set null,
  created_by uuid references users(id) on delete set null,
  created_at timestamptz not null default now()
);

create index if not exists shoot_titles_shoot_idx on shoot_titles(shoot_id);
create index if not exists shoot_titles_company_idx on shoot_titles(company_id);

alter table shoot_titles enable row level security;

create policy "tenant_all" on shoot_titles
  for all using (company_id = (auth.jwt() ->> 'company_id')::uuid)
  with check (company_id = (auth.jwt() ->> 'company_id')::uuid);

create policy "service_all" on shoot_titles for all using (true) with check (true);
```

- [ ] **Step 2: Apply the migration**

Use the Supabase MCP `apply_migration` tool (name: `shoot_titles`, pasting the SQL above), project_id `bxyozelldqerlvtjwsai`.

- [ ] **Step 3: Verify**

Run via the Supabase MCP `execute_sql` tool:
```sql
select column_name from information_schema.columns where table_name = 'shoot_titles' order by ordinal_position;
select conname from pg_constraint where conrelid = 'shoots'::regclass and contype = 'c';
```
Expected: `shoot_titles` has all 7 columns; the `shoots` check constraint's definition includes `'going'` (confirm via `pg_get_constraintdef` if the name alone isn't enough evidence).

- [ ] **Step 4: Commit**

```bash
git add supabase/migrations/092_shoot_titles.sql
git commit -m "feat(db): add shoot_titles table and 'going' status for shoot scheduling"
```

---

### Task 2: Pure status-transition module (TDD)

**Files:**
- Create: `lib/shoots/status-transitions.ts`
- Create: `lib/shoots/status-transitions.test.ts`

**Interfaces:**
- Produces: `ShootStatus` type, `isValidShootTransition(from: ShootStatus, to: ShootStatus): boolean` — consumed by Task 3's `updateShootStatus`.

- [ ] **Step 1: Write the failing tests**

Create `lib/shoots/status-transitions.test.ts`:

```typescript
import { describe, it, expect } from 'vitest'
import { isValidShootTransition } from './status-transitions'

describe('isValidShootTransition', () => {
  it('allows scheduled -> going', () => {
    expect(isValidShootTransition('scheduled', 'going')).toBe(true)
  })
  it('allows scheduled -> cancelled', () => {
    expect(isValidShootTransition('scheduled', 'cancelled')).toBe(true)
  })
  it('allows going -> completed', () => {
    expect(isValidShootTransition('going', 'completed')).toBe(true)
  })
  it('allows going -> cancelled (cancelled after reaching the location)', () => {
    expect(isValidShootTransition('going', 'cancelled')).toBe(true)
  })
  it('rejects scheduled -> completed (must go through going first)', () => {
    expect(isValidShootTransition('scheduled', 'completed')).toBe(false)
  })
  it('rejects completed -> anything (terminal state)', () => {
    expect(isValidShootTransition('completed', 'going')).toBe(false)
    expect(isValidShootTransition('completed', 'cancelled')).toBe(false)
    expect(isValidShootTransition('completed', 'scheduled')).toBe(false)
  })
  it('rejects cancelled -> anything (terminal state)', () => {
    expect(isValidShootTransition('cancelled', 'going')).toBe(false)
    expect(isValidShootTransition('cancelled', 'completed')).toBe(false)
    expect(isValidShootTransition('cancelled', 'scheduled')).toBe(false)
  })
  it('rejects a status transitioning to itself', () => {
    expect(isValidShootTransition('scheduled', 'scheduled')).toBe(false)
    expect(isValidShootTransition('going', 'going')).toBe(false)
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `pnpm test lib/shoots/status-transitions.test.ts`
Expected: FAIL — `Cannot find module './status-transitions'`.

- [ ] **Step 3: Write the implementation**

Create `lib/shoots/status-transitions.ts`:

```typescript
export type ShootStatus = 'scheduled' | 'going' | 'completed' | 'cancelled'

const VALID_TRANSITIONS: Record<ShootStatus, ShootStatus[]> = {
  scheduled: ['going', 'cancelled'],
  going: ['completed', 'cancelled'],
  completed: [],
  cancelled: [],
}

export function isValidShootTransition(from: ShootStatus, to: ShootStatus): boolean {
  return VALID_TRANSITIONS[from].includes(to)
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `pnpm test lib/shoots/status-transitions.test.ts`
Expected: PASS — all 9 tests green.

- [ ] **Step 5: Commit**

```bash
git add lib/shoots/status-transitions.ts lib/shoots/status-transitions.test.ts
git commit -m "feat(shoots): add pure shoot status-transition validator with tests"
```

---

### Task 3: Extend `lib/actions/shoots.ts`

**Files:**
- Modify: `lib/actions/shoots.ts`

**Interfaces:**
- Consumes: `isValidShootTransition`, `type ShootStatus` from `@/lib/shoots/status-transitions` (Task 2).
- Produces: `createShootWithTitles(input): Promise<{ success: boolean; error?: string; id?: string }>` and an extended `updateShootStatus(id, status): Promise<{ success: boolean; error?: string; createdItems?: CreatedItem[] }>` where `CreatedItem = { id: string; shoot_title_id: string; client_name: string; title: string; content_type: 'video'; status: 'shot'; shot_date: string | null; notes: string | null }` — both consumed by Task 7 (client wiring).

- [ ] **Step 1: Add the import**

At the top of `lib/actions/shoots.ts`, after the existing imports:

```typescript
import { isValidShootTransition, type ShootStatus } from '@/lib/shoots/status-transitions'
```

- [ ] **Step 2: Replace `updateShootStatus`**

Find:

```typescript
export async function updateShootStatus(
  id: string,
  status: 'scheduled' | 'completed' | 'cancelled'
): Promise<{ success: boolean; error?: string }> {
  const supabase = await createServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { success: false, error: 'Not authenticated' }

  const admin = adminSupabase()
  const { error } = await admin.from('shoots').update({ status }).eq('id', id)
  if (error) return { success: false, error: error.message }

  revalidatePath('/admin/shoots')
  revalidatePath('/member/shoots')
  return { success: true }
}
```

Replace with:

```typescript
export type CreatedShootItem = {
  id: string; shoot_title_id: string; client_name: string; title: string
  content_type: 'video'; status: 'shot'; shot_date: string | null; notes: string | null
}

export async function updateShootStatus(
  id: string,
  status: ShootStatus
): Promise<{ success: boolean; error?: string; createdItems?: CreatedShootItem[] }> {
  const supabase = await createServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { success: false, error: 'Not authenticated' }

  const admin = adminSupabase()
  const { data: shoot } = await admin
    .from('shoots')
    .select('id, status, client, start_time, notes, company_id')
    .eq('id', id)
    .single()
  if (!shoot) return { success: false, error: 'Shoot not found' }

  if (!isValidShootTransition(shoot.status as ShootStatus, status)) {
    return { success: false, error: `Cannot move from ${shoot.status} to ${status}` }
  }

  const { error } = await admin.from('shoots').update({ status }).eq('id', id)
  if (error) return { success: false, error: error.message }

  let createdItems: CreatedShootItem[] | undefined

  if (status === 'completed') {
    const { data: titles } = await admin
      .from('shoot_titles')
      .select('id, title')
      .eq('shoot_id', id)
      .is('content_item_id', null)

    if (titles && titles.length > 0) {
      const shotDate = shoot.start_time.split('T')[0]
      const rows = titles.map(t => ({
        company_id: shoot.company_id,
        client_name: shoot.client,
        title: t.title,
        content_type: 'video',
        status: 'shot',
        shot_by: user.id,
        shot_date: shotDate,
        notes: shoot.notes,
        created_by: user.id,
      }))
      const { data: inserted, error: insertError } = await admin
        .from('content_items')
        .insert(rows)
        .select('id')

      if (!insertError && inserted) {
        createdItems = []
        for (let i = 0; i < titles.length; i++) {
          const t = titles[i]
          const item = inserted[i]
          await admin.from('shoot_titles').update({ content_item_id: item.id }).eq('id', t.id)
          createdItems.push({
            id: item.id,
            shoot_title_id: t.id,
            client_name: shoot.client,
            title: t.title,
            content_type: 'video',
            status: 'shot',
            shot_date: shotDate,
            notes: shoot.notes,
          })
        }
      }
    }
  }

  revalidatePath('/admin/shoots')
  revalidatePath('/member/shoots')
  revalidatePath('/admin/content-tracker')
  revalidatePath('/member/content-tracker')
  return { success: true, createdItems }
}
```

- [ ] **Step 3: Add `createShootWithTitles`**

Append to the end of `lib/actions/shoots.ts`:

```typescript
type CreateShootWithTitlesInput = {
  client: string
  titles: string[]
  shot_date: string
  shot_time?: string
  notes?: string
}

export async function createShootWithTitles(
  input: CreateShootWithTitlesInput
): Promise<{ success: boolean; error?: string; id?: string }> {
  const supabase = await createServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { success: false, error: 'Not authenticated' }

  const cleanTitles = input.titles.map(t => t.trim()).filter(Boolean)
  if (!input.client.trim()) return { success: false, error: 'Client is required' }
  if (cleanTitles.length === 0) return { success: false, error: 'Add at least one title' }
  if (!input.shot_date) return { success: false, error: 'Shot date is required' }

  const company_id = await getCompanyId(user.id)
  if (!company_id) return { success: false, error: 'Profile not found' }

  const admin = adminSupabase()
  const time = input.shot_time || '09:00'
  const start_time = `${input.shot_date}T${time}:00+05:30`
  const end_time = new Date(new Date(start_time).getTime() + 2 * 60 * 60 * 1000).toISOString()

  const { data: shoot, error } = await admin.from('shoots').insert({
    company_id,
    title: cleanTitles.length === 1 ? cleanTitles[0] : `${cleanTitles.length} videos`,
    client: input.client.trim(),
    location: '',
    start_time,
    end_time,
    notes: input.notes?.trim() || null,
    created_by: user.id,
    status: 'scheduled',
  }).select('id').single()
  if (error) return { success: false, error: error.message }

  const titleRows = cleanTitles.map(title => ({
    shoot_id: shoot.id, company_id, title, created_by: user.id,
  }))
  const { error: titlesError } = await admin.from('shoot_titles').insert(titleRows)
  if (titlesError) return { success: false, error: titlesError.message }

  revalidatePath('/admin/shoots')
  revalidatePath('/member/shoots')
  revalidatePath('/admin/content-tracker')
  revalidatePath('/member/content-tracker')
  return { success: true, id: shoot.id }
}
```

- [ ] **Step 4: Typecheck**

Run: `pnpm typecheck`
Expected: no errors. (The existing `/admin/shoots` caller — `app/admin/shoots/shoots-client.tsx` — calls `updateShootStatus(id, status)` with `status` typed as `'scheduled' | 'completed' | 'cancelled'` from its own local `Shoot` type; this remains a valid subset of the widened `ShootStatus` parameter type, so no caller-side changes are needed there.)

- [ ] **Step 5: Commit**

```bash
git add lib/actions/shoots.ts
git commit -m "feat(shoots): add createShootWithTitles and going status to updateShootStatus"
```

---

### Task 4: Extend the data loader

**Files:**
- Modify: `lib/data/content-tracker.ts`

**Interfaces:**
- Consumes: nothing new (types stay local to `content-tracker-client.tsx`, matching how `Ad`/`ContentItem` are already handled).
- Produces: `getContentTrackerData()` now returns `{ items, ads, shoots }` where `shoots: Shoot[]` — consumed by Task 5 (both page.tsx files) and, transitively, Task 6 (client `Shoot` type).

- [ ] **Step 1: Update the import**

Replace:

```typescript
import type { ContentItem, Ad } from '@/components/content-tracker/content-tracker-client'
```

with:

```typescript
import type { ContentItem, Ad, Shoot } from '@/components/content-tracker/content-tracker-client'
```

- [ ] **Step 2: Update the return type and add the new queries**

Replace:

```typescript
export async function getContentTrackerData(companyId: string): Promise<{ items: ContentItem[]; ads: Ad[] }> {
  const admin = adminSupabase()

  const [itemsRes, postsRes, usersRes, adsRes, revisionsRes, performanceRes] = await Promise.all([
    admin.from('content_items').select('*').eq('company_id', companyId).order('created_at', { ascending: false }),
    admin.from('content_item_posts').select('*').eq('company_id', companyId).order('posted_date', { ascending: false }),
    admin.from('users').select('id, name').eq('company_id', companyId),
    admin.from('ads_tracker').select('*').eq('company_id', companyId).order('created_at', { ascending: false }),
    admin.from('ad_revisions').select('*').eq('company_id', companyId).order('revision_date', { ascending: false }),
    admin.from('ad_performance_entries').select('*').eq('company_id', companyId).order('entry_date', { ascending: false }),
  ])
```

with:

```typescript
export async function getContentTrackerData(companyId: string): Promise<{ items: ContentItem[]; ads: Ad[]; shoots: Shoot[] }> {
  const admin = adminSupabase()

  const [itemsRes, postsRes, usersRes, adsRes, revisionsRes, performanceRes, shootsRes, shootTitlesRes] = await Promise.all([
    admin.from('content_items').select('*').eq('company_id', companyId).order('created_at', { ascending: false }),
    admin.from('content_item_posts').select('*').eq('company_id', companyId).order('posted_date', { ascending: false }),
    admin.from('users').select('id, name').eq('company_id', companyId),
    admin.from('ads_tracker').select('*').eq('company_id', companyId).order('created_at', { ascending: false }),
    admin.from('ad_revisions').select('*').eq('company_id', companyId).order('revision_date', { ascending: false }),
    admin.from('ad_performance_entries').select('*').eq('company_id', companyId).order('entry_date', { ascending: false }),
    admin.from('shoots').select('id, title, client, start_time, notes, status').eq('company_id', companyId).order('start_time', { ascending: false }),
    admin.from('shoot_titles').select('id, shoot_id, title, content_item_id').eq('company_id', companyId),
  ])
```

- [ ] **Step 3: Add row types**

Find:

```typescript
  type PerformanceRow = { id: string; ad_id: string; entry_date: string; spend: number; impressions: number; reach: number; clicks: number; ctr: number; results: number; note: string | null }

  const itemRows = (itemsRes.data ?? []) as ItemRow[]
```

Replace with:

```typescript
  type PerformanceRow = { id: string; ad_id: string; entry_date: string; spend: number; impressions: number; reach: number; clicks: number; ctr: number; results: number; note: string | null }
  type ShootRow = { id: string; title: string; client: string; start_time: string; notes: string | null; status: 'scheduled' | 'going' | 'completed' | 'cancelled' }
  type ShootTitleRow = { id: string; shoot_id: string; title: string; content_item_id: string | null }

  const itemRows = (itemsRes.data ?? []) as ItemRow[]
```

- [ ] **Step 4: Load the new rows and group titles by shoot**

Find:

```typescript
  const revisionRows = (revisionsRes.data ?? []) as RevisionRow[]
  const performanceRows = (performanceRes.data ?? []) as PerformanceRow[]
```

Replace with:

```typescript
  const revisionRows = (revisionsRes.data ?? []) as RevisionRow[]
  const performanceRows = (performanceRes.data ?? []) as PerformanceRow[]
  const shootRows = (shootsRes.data ?? []) as ShootRow[]
  const shootTitleRows = (shootTitlesRes.data ?? []) as ShootTitleRow[]
```

- [ ] **Step 5: Group shoot titles by shoot**

Find:

```typescript
  const performanceByAd = new Map<string, PerformanceRow[]>()
  for (const p of performanceRows) {
    if (!performanceByAd.has(p.ad_id)) performanceByAd.set(p.ad_id, [])
    performanceByAd.get(p.ad_id)!.push(p)
  }
```

Replace with:

```typescript
  const performanceByAd = new Map<string, PerformanceRow[]>()
  for (const p of performanceRows) {
    if (!performanceByAd.has(p.ad_id)) performanceByAd.set(p.ad_id, [])
    performanceByAd.get(p.ad_id)!.push(p)
  }
  const titlesByShoot = new Map<string, ShootTitleRow[]>()
  for (const t of shootTitleRows) {
    if (!titlesByShoot.has(t.shoot_id)) titlesByShoot.set(t.shoot_id, [])
    titlesByShoot.get(t.shoot_id)!.push(t)
  }
```

- [ ] **Step 6: Build the `shoots` array and return it**

Find:

```typescript
  return { items, ads }
}
```

Replace with:

```typescript
  const shoots: Shoot[] = shootRows.map(row => ({
    id: row.id,
    client: row.client,
    legacyTitle: row.title,
    start_time: row.start_time,
    notes: row.notes,
    status: row.status,
    titles: (titlesByShoot.get(row.id) ?? []).map(t => ({
      id: t.id, title: t.title, content_item_id: t.content_item_id,
    })),
  }))

  return { items, ads, shoots }
}
```

- [ ] **Step 7: Typecheck**

Run: `pnpm typecheck`
Expected: one error — `Shoot` is not yet exported from `content-tracker-client.tsx`. This is expected; Task 6 fixes it.

- [ ] **Step 8: Commit**

```bash
git add lib/data/content-tracker.ts
git commit -m "feat(content-tracker): fetch shoots and shoot titles in data loader"
```

---

### Task 5: Wire `initialShoots` into both pages

**Files:**
- Modify: `app/admin/content-tracker/page.tsx`
- Modify: `app/member/content-tracker/page.tsx`

**Interfaces:**
- Consumes: `getContentTrackerData()`'s extended return shape (Task 4).
- Produces: `initialShoots` prop passed to `ContentTrackerClient` — consumed by Task 6 (`Props` type).

- [ ] **Step 1: Update the admin page**

In `app/admin/content-tracker/page.tsx`, find:

```typescript
  const [{ items, ads }, clientsResult, pastClientsResult] = await Promise.all([
    getContentTrackerData(companyId),
    admin.from("clients").select("id, name").eq("company_id", companyId).eq("status", "active").order("name"),
    admin.from("clients").select("id, name").eq("company_id", companyId).eq("status", "past").order("name"),
  ])

  return (
    <ContentTrackerClient
      initialItems={items}
      initialAds={ads}
      currentUserId={user.id}
      clients={(clientsResult.data ?? []) as { id: string; name: string }[]}
      pastClients={(pastClientsResult.data ?? []) as { id: string; name: string }[]}
    />
  )
```

Replace with:

```typescript
  const [{ items, ads, shoots }, clientsResult, pastClientsResult] = await Promise.all([
    getContentTrackerData(companyId),
    admin.from("clients").select("id, name").eq("company_id", companyId).eq("status", "active").order("name"),
    admin.from("clients").select("id, name").eq("company_id", companyId).eq("status", "past").order("name"),
  ])

  return (
    <ContentTrackerClient
      initialItems={items}
      initialAds={ads}
      initialShoots={shoots}
      currentUserId={user.id}
      clients={(clientsResult.data ?? []) as { id: string; name: string }[]}
      pastClients={(pastClientsResult.data ?? []) as { id: string; name: string }[]}
    />
  )
```

- [ ] **Step 2: Update the member page**

In `app/member/content-tracker/page.tsx`, find:

```typescript
  const [{ items, ads }, clientsResult, pastClientsResult] = await Promise.all([
    getContentTrackerData(companyId),
    admin.from("clients").select("id, name").eq("company_id", companyId).eq("status", "active").order("name"),
    admin.from("clients").select("id, name").eq("company_id", companyId).eq("status", "past").order("name"),
  ])

  return (
    <ContentTrackerClient
      initialItems={items}
      initialAds={ads}
      currentUserId={effectiveUserId}
      clients={(clientsResult.data ?? []) as { id: string; name: string }[]}
      pastClients={(pastClientsResult.data ?? []) as { id: string; name: string }[]}
    />
  )
```

Replace with:

```typescript
  const [{ items, ads, shoots }, clientsResult, pastClientsResult] = await Promise.all([
    getContentTrackerData(companyId),
    admin.from("clients").select("id, name").eq("company_id", companyId).eq("status", "active").order("name"),
    admin.from("clients").select("id, name").eq("company_id", companyId).eq("status", "past").order("name"),
  ])

  return (
    <ContentTrackerClient
      initialItems={items}
      initialAds={ads}
      initialShoots={shoots}
      currentUserId={effectiveUserId}
      clients={(clientsResult.data ?? []) as { id: string; name: string }[]}
      pastClients={(pastClientsResult.data ?? []) as { id: string; name: string }[]}
    />
  )
```

- [ ] **Step 3: Typecheck**

Run: `pnpm typecheck`
Expected: same single error as Task 4 (Shoot not exported yet) plus a new one — `initialShoots` doesn't exist on `Props`. Both expected; Task 6 fixes them.

- [ ] **Step 4: Commit**

```bash
git add app/admin/content-tracker/page.tsx app/member/content-tracker/page.tsx
git commit -m "feat(content-tracker): pass initialShoots to ContentTrackerClient from both pages"
```

---

### Task 6: Client types and tab wiring

**Files:**
- Modify: `components/content-tracker/content-tracker-client.tsx`

**Interfaces:**
- Consumes: `createShootWithTitles`, `updateShootStatus`, `type CreatedShootItem` from `@/lib/actions/shoots` (Task 3).
- Produces: exported `Shoot`, `ShootTitleRef`, `ShootStatus` types; `Props.initialShoots: Shoot[]`; `shoots` state; `tab` type widened to include `"shoots"`; filter state — consumed by Task 7 (modal) and Task 8 (tab render).

- [ ] **Step 1: Add the shoots-action import**

Find:

```typescript
import {
  createContentItem, updateContentItem, updateContentItemStatus, deleteContentItem,
  addContentPost, deleteContentPost,
  createAd, updateAdStatus, deleteAd, addAdRevision, addAdPerformanceEntry,
} from "@/lib/actions/content-tracker"
```

Replace with:

```typescript
import {
  createContentItem, updateContentItem, updateContentItemStatus, deleteContentItem,
  addContentPost, deleteContentPost,
  createAd, updateAdStatus, deleteAd, addAdRevision, addAdPerformanceEntry,
} from "@/lib/actions/content-tracker"
import { createShootWithTitles, updateShootStatus, type CreatedShootItem } from "@/lib/actions/shoots"
```

- [ ] **Step 2: Add `Camera` to the lucide-react import**

`Camera` is already imported (used in `PLATFORM_CFG.instagram`), so no icon import change is needed here — confirmed by checking the existing import block, which already includes `Camera`.

- [ ] **Step 3: Add the `Shoot` types**

Find the end of the `Ad` type definition:

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

Add immediately after it:

```typescript
export type ShootStatus = "scheduled" | "going" | "completed" | "cancelled"
export type ShootTitleRef = { id: string; title: string; content_item_id: string | null }
export type Shoot = {
  id: string
  client: string
  legacyTitle: string
  start_time: string
  notes: string | null
  status: ShootStatus
  titles: ShootTitleRef[]
}
```

- [ ] **Step 4: Extend `Props`**

Find:

```typescript
type Props = {
  initialItems: ContentItem[]
  initialAds: Ad[]
  currentUserId: string
  clients: { id: string; name: string }[]
  pastClients: { id: string; name: string }[]
}
```

Replace with:

```typescript
type Props = {
  initialItems: ContentItem[]
  initialAds: Ad[]
  initialShoots: Shoot[]
  currentUserId: string
  clients: { id: string; name: string }[]
  pastClients: { id: string; name: string }[]
}
```

- [ ] **Step 5: Add the `SHOOT_STATUS_CFG` design token**

Find:

```typescript
const AD_STATUS_CFG: Record<AdStatus, { label: string; color: string }> = {
  active:  { label: "Active",  color: "#22C55E" },
  testing: { label: "Testing", color: "#6366F1" },
  paused:  { label: "Paused",  color: "#F59E0B" },
  stopped: { label: "Stopped", color: "#EF4444" },
}
```

Add immediately after it:

```typescript
const SHOOT_STATUS_CFG: Record<ShootStatus, { label: string; color: string }> = {
  scheduled: { label: "Scheduled", color: "#F59E0B" },
  going:     { label: "Going",     color: "#3B82F6" },
  completed: { label: "Completed", color: "#22C55E" },
  cancelled: { label: "Cancelled", color: "#EF4444" },
}
```

- [ ] **Step 6: Update the component signature and add state**

Find:

```typescript
export default function ContentTrackerClient({ initialItems, initialAds, clients, pastClients }: Props) {
  const [items, setItems] = useState(initialItems)
  const [ads, setAds] = useState(initialAds)
  const [tab, setTab] = useState<"pipeline" | "log" | "ads">("pipeline")
```

Replace with:

```typescript
export default function ContentTrackerClient({ initialItems, initialAds, initialShoots, clients, pastClients }: Props) {
  const [items, setItems] = useState(initialItems)
  const [ads, setAds] = useState(initialAds)
  const [shoots, setShoots] = useState(initialShoots)
  const [tab, setTab] = useState<"pipeline" | "log" | "ads" | "shoots">("pipeline")
```

(`currentUserId` was destructured in the original signature but unused by the component body — leave it out exactly as it already was; do not reintroduce it.)

- [ ] **Step 7: Add filter and modal state**

Find:

```typescript
  const [showNewAd, setShowNewAd] = useState(false)
  const [revisionModalAd, setRevisionModalAd] = useState<Ad | null>(null)
  const [performanceModalAd, setPerformanceModalAd] = useState<Ad | null>(null)
  const [adsClientFilter, setAdsClientFilter] = useState<string>("all")
  const [adsSearch, setAdsSearch] = useState("")
  const [adsStatusFilter, setAdsStatusFilter] = useState<AdStatus | "all">("all")
```

Replace with:

```typescript
  const [showNewAd, setShowNewAd] = useState(false)
  const [revisionModalAd, setRevisionModalAd] = useState<Ad | null>(null)
  const [performanceModalAd, setPerformanceModalAd] = useState<Ad | null>(null)
  const [adsClientFilter, setAdsClientFilter] = useState<string>("all")
  const [adsSearch, setAdsSearch] = useState("")
  const [adsStatusFilter, setAdsStatusFilter] = useState<AdStatus | "all">("all")
  const [showNewShoot, setShowNewShoot] = useState(false)
  const [shootsClientFilter, setShootsClientFilter] = useState<string>("all")
  const [shootsStatusFilter, setShootsStatusFilter] = useState<ShootStatus | "all">("all")
```

- [ ] **Step 8: Add the `filteredShoots` derived list**

Find:

```typescript
  const filteredAds = useMemo(() => {
    let rows = ads
    if (adsClientFilter !== "all") rows = rows.filter(a => a.client_name === adsClientFilter)
    if (adsStatusFilter !== "all") rows = rows.filter(a => a.status === adsStatusFilter)
    if (adsSearch) rows = rows.filter(a => `${a.ad_name} ${a.client_name}`.toLowerCase().includes(adsSearch.toLowerCase()))
    return rows
  }, [ads, adsClientFilter, adsStatusFilter, adsSearch])
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

  const filteredShoots = useMemo(() => {
    let rows = shoots
    if (shootsClientFilter !== "all") rows = rows.filter(s => s.client === shootsClientFilter)
    if (shootsStatusFilter !== "all") rows = rows.filter(s => s.status === shootsStatusFilter)
    return rows
  }, [shoots, shootsClientFilter, shootsStatusFilter])
```

- [ ] **Step 9: Add the `handleShootStatus` handler**

Find:

```typescript
  function handlePostAdded(post: ContentPost) {
```

Insert immediately before it:

```typescript
  function handleShootStatus(shootId: string, status: ShootStatus) {
    setShoots(prev => prev.map(s => s.id === shootId ? { ...s, status } : s))
    startTransition(async () => {
      const res = await updateShootStatus(shootId, status)
      if (!res.success) {
        setShoots(prev => prev.map(s => s.id === shootId ? { ...s, status: initialShoots.find(is => is.id === shootId)?.status ?? s.status } : s))
        return
      }
      const created: CreatedShootItem[] = res.createdItems ?? []
      if (created.length > 0) {
        const newItems: ContentItem[] = created.map(ci => ({
          id: ci.id, client_name: ci.client_name, title: ci.title, content_type: "video",
          status: "shot", shot_date: ci.shot_date, edited_date: null, notes: ci.notes,
          created_at: new Date().toISOString(), posts: [],
        }))
        setItems(prev => [...newItems, ...prev])
        setShoots(prev => prev.map(s => s.id === shootId ? {
          ...s,
          titles: s.titles.map(t => {
            const match = created.find(ci => ci.shoot_title_id === t.id)
            return match ? { ...t, content_item_id: match.id } : t
          }),
        } : s))
      }
    })
  }

  function handlePostAdded(post: ContentPost) {
```

- [ ] **Step 10: Add the tab entry**

Find:

```typescript
      <TabToggle active={tab} onChange={k => setTab(k as typeof tab)} tabs={[
        { key: "pipeline", label: "Pipeline", icon: Layers },
        { key: "log", label: "Posting Log", icon: History },
        { key: "ads", label: "Ads Tracker", icon: Megaphone },
      ]} />
```

Replace with:

```typescript
      <TabToggle active={tab} onChange={k => setTab(k as typeof tab)} tabs={[
        { key: "pipeline", label: "Pipeline", icon: Layers },
        { key: "log", label: "Posting Log", icon: History },
        { key: "ads", label: "Ads Tracker", icon: Megaphone },
        { key: "shoots", label: "Shoots", icon: Camera },
      ]} />
```

- [ ] **Step 11: Typecheck**

Run: `pnpm typecheck`
Expected: no errors (Task 4 and Task 5's placeholder errors are now resolved).

- [ ] **Step 12: Commit**

```bash
git add components/content-tracker/content-tracker-client.tsx
git commit -m "feat(content-tracker): add Shoot types, state, and Shoots tab entry"
```

---

### Task 7: New Shoot modal

**Files:**
- Modify: `components/content-tracker/content-tracker-client.tsx`

**Interfaces:**
- Consumes: `createShootWithTitles` (Task 3), `Shoot`/`ShootStatus` types (Task 6), `Modal`/`PrimaryButton`/`ClientSelector`/`FIELD`/`LABEL`/`buildClientOptions` already in this file.
- Produces: `NewShootModal` component with props `{ clients, pastClients, onClose, onCreated }` — consumed by Task 8's wiring.

- [ ] **Step 1: Add the modal component**

Find the end of `AdPerformanceModal` (it ends right before the `// ── Main component ──` comment):

```typescript
        {error && <p style={{ fontSize: 11, color: "#DE1A1A", margin: 0 }}>{error}</p>}
        <PrimaryButton onClick={submit} disabled={saving}>{saving ? "Saving…" : "Log Performance"}</PrimaryButton>
      </div>
    </Modal>
  )
}

// ── Main component ───────────────────────────────────────────────────────────
```

Insert the new modal between the closing `}` of `AdPerformanceModal` and the `// ── Main component ──` comment:

```typescript
        {error && <p style={{ fontSize: 11, color: "#DE1A1A", margin: 0 }}>{error}</p>}
        <PrimaryButton onClick={submit} disabled={saving}>{saving ? "Saving…" : "Log Performance"}</PrimaryButton>
      </div>
    </Modal>
  )
}

// ── New Shoot modal ──────────────────────────────────────────────────────────
function NewShootModal({ clients, pastClients, onClose, onCreated }: {
  clients: { id: string; name: string }[]; pastClients: { id: string; name: string }[]
  onClose: () => void; onCreated: (shoot: Shoot) => void
}) {
  const { activeOptions: activeClientOptions, pastOptions: pastClientOptions } = useMemo(
    () => buildClientOptions(clients.map(c => c.name), pastClients.map(c => c.name)),
    [clients, pastClients]
  )
  const [client, setClient] = useState("")
  const [titleInput, setTitleInput] = useState("")
  const [titles, setTitles] = useState<string[]>([])
  const [shotDate, setShotDate] = useState(new Date().toISOString().split("T")[0])
  const [shotTime, setShotTime] = useState("")
  const [notes, setNotes] = useState("")
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  function addTitle() {
    const t = titleInput.trim()
    if (t && !titles.includes(t)) setTitles(prev => [...prev, t])
    setTitleInput("")
  }

  async function submit() {
    if (!client) { setError("Client is required"); return }
    if (titles.length === 0) { setError("Add at least one title"); return }
    setSaving(true); setError(null)
    const res = await createShootWithTitles({
      client, titles, shot_date: shotDate, shot_time: shotTime || undefined, notes: notes.trim() || undefined,
    })
    setSaving(false)
    if (!res.success || !res.id) { setError(res.error ?? "Failed to save"); return }
    onCreated({
      id: res.id,
      client,
      legacyTitle: titles.length === 1 ? titles[0] : `${titles.length} videos`,
      start_time: `${shotDate}T${shotTime || "09:00"}:00`,
      notes: notes.trim() || null,
      status: "scheduled",
      titles: titles.map((title, i) => ({ id: `local-${i}`, title, content_item_id: null })),
    })
  }

  return (
    <Modal title="New Shoot" onClose={onClose}>
      <div className="flex flex-col gap-3">
        <ClientSelector clientOptions={activeClientOptions} pastClientOptions={pastClientOptions} value={client} onValueChange={setClient} required />
        <div>
          <label style={LABEL}>Titles *</label>
          <div style={{ display: "flex", gap: 8 }}>
            <input style={FIELD} value={titleInput} onChange={e => setTitleInput(e.target.value)}
              onKeyDown={e => { if (e.key === "Enter") { e.preventDefault(); addTitle() } }}
              placeholder="e.g. Sports Day Highlights" />
            <button type="button" onClick={addTitle}
              style={{ padding: "8px 14px", borderRadius: 10, border: "none", background: "#DE1A1A", color: "#fff", fontSize: 12, fontWeight: 700, cursor: "pointer", flexShrink: 0 }}>
              Add
            </button>
          </div>
          {titles.length > 0 && (
            <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginTop: 8 }}>
              {titles.map(t => (
                <span key={t} style={{ display: "inline-flex", alignItems: "center", gap: 5, padding: "5px 10px", borderRadius: 20, background: "rgba(222,26,26,0.08)", border: "1.5px solid rgba(222,26,26,0.25)", fontSize: 12, fontWeight: 600, color: "#de1a1a" }}>
                  {t}
                  <button type="button" onClick={() => setTitles(prev => prev.filter(x => x !== t))}
                    style={{ background: "none", border: "none", cursor: "pointer", padding: 0, lineHeight: 1, color: "#de1a1a", fontSize: 14, fontWeight: 700 }}>×</button>
                </span>
              ))}
            </div>
          )}
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
          <div>
            <label style={LABEL}>Shot Date *</label>
            <input type="date" style={FIELD} value={shotDate} onChange={e => setShotDate(e.target.value)} />
          </div>
          <div>
            <label style={LABEL}>Time <span style={{ fontWeight: 600, textTransform: "none" }}>(optional)</span></label>
            <input type="time" style={FIELD} value={shotTime} onChange={e => setShotTime(e.target.value)} />
          </div>
        </div>
        <div>
          <label style={LABEL}>Notes</label>
          <textarea style={{ ...FIELD, minHeight: 50, resize: "vertical" }} value={notes} onChange={e => setNotes(e.target.value)} placeholder="Optional" />
        </div>
        {error && <p style={{ fontSize: 11, color: "#DE1A1A", margin: 0 }}>{error}</p>}
        <PrimaryButton onClick={submit} disabled={saving}>{saving ? "Saving…" : "Schedule Shoot"}</PrimaryButton>
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
Expected: warnings only for `NewShootModal` being unused (resolved in Task 8), no errors.

- [ ] **Step 4: Commit**

```bash
git add components/content-tracker/content-tracker-client.tsx
git commit -m "feat(content-tracker): add NewShootModal component"
```

---

### Task 8: Shoots tab render

**Files:**
- Modify: `components/content-tracker/content-tracker-client.tsx`

**Interfaces:**
- Consumes: `filteredShoots`, `handleShootStatus`, `showNewShoot`/`setShowNewShoot`, `shootsClientFilter`/`shootsStatusFilter`, `SHOOT_STATUS_CFG`, `NewShootModal` (Tasks 6-7), `fmtDate` (already in this file).
- Produces: fully wired Shoots tab — no further consumers, this is the final feature task.

- [ ] **Step 1: Add the tab render block**

Find the end of the Ads tab's closing and the start of the modal-render section:

```typescript
          )}
        </div>
      )}

      {showNewContent && (
```

Replace with:

```typescript
          )}
        </div>
      )}

      {tab === "shoots" && (
        <div className="flex flex-col gap-4">
          <div className="flex items-center justify-between flex-wrap gap-2">
            <div className="flex items-center gap-2 flex-wrap">
              <select value={shootsClientFilter} onChange={e => setShootsClientFilter(e.target.value)}
                style={{ ...FIELD, width: "auto", cursor: "pointer" }}>
                <option value="all">All Clients</option>
                {activeClientOptions.map(c => <option key={c} value={c}>{c}</option>)}
                {pastClientOptions.length > 0 && (
                  <optgroup label="📁 Past Clients">
                    {pastClientOptions.map(c => <option key={c} value={c}>{c}</option>)}
                  </optgroup>
                )}
              </select>
              <button onClick={() => setShootsStatusFilter("all")}
                style={{ padding: "8px 12px", borderRadius: 10, border: `1.5px solid ${shootsStatusFilter === "all" ? "#DE1A1A" : "#E5E7EB"}`, background: shootsStatusFilter === "all" ? "rgba(222,26,26,0.08)" : "#fff", color: shootsStatusFilter === "all" ? "#DE1A1A" : "#6B7280", fontSize: 11, fontWeight: 700, cursor: "pointer" }}>
                All Statuses
              </button>
              {(Object.keys(SHOOT_STATUS_CFG) as ShootStatus[]).map(s => {
                const cfg = SHOOT_STATUS_CFG[s]
                return (
                  <button key={s} onClick={() => setShootsStatusFilter(s)}
                    style={{ padding: "8px 12px", borderRadius: 10, border: `1.5px solid ${shootsStatusFilter === s ? cfg.color : "#E5E7EB"}`, background: shootsStatusFilter === s ? `${cfg.color}14` : "#fff", color: shootsStatusFilter === s ? cfg.color : "#6B7280", fontSize: 11, fontWeight: 700, cursor: "pointer" }}>
                    {cfg.label}
                  </button>
                )
              })}
            </div>
            <button onClick={() => setShowNewShoot(true)}
              style={{ display: "flex", alignItems: "center", gap: 6, padding: "10px 16px", borderRadius: 12, border: "none", background: "linear-gradient(135deg,#FF4D4D,#DE1A1A)", color: "#fff", fontSize: 12, fontWeight: 800, cursor: "pointer" }}>
              <Plus size={14} /> New Shoot
            </button>
          </div>

          {shoots.length === 0 ? (
            <div style={{ background: "#fff", border: "1px dashed #E5E7EB", borderRadius: 18, padding: "40px 20px", textAlign: "center" }}>
              <Camera size={24} style={{ color: "#D1D5DB", margin: "0 auto 8px" }} />
              <p style={{ fontSize: 12, color: "#374151", fontWeight: 600, margin: 0 }}>No shoots scheduled yet</p>
            </div>
          ) : filteredShoots.length === 0 ? (
            <div style={{ background: "#fff", border: "1px dashed #E5E7EB", borderRadius: 18, padding: "40px 20px", textAlign: "center" }}>
              <Camera size={24} style={{ color: "#D1D5DB", margin: "0 auto 8px" }} />
              <p style={{ fontSize: 12, color: "#374151", fontWeight: 600, margin: 0 }}>No shoots match your filters</p>
              <button onClick={() => { setShootsClientFilter("all"); setShootsStatusFilter("all") }}
                style={{ marginTop: 8, fontSize: 11, fontWeight: 700, color: "#DE1A1A", background: "none", border: "none", cursor: "pointer" }}>
                Clear filters
              </button>
            </div>
          ) : (
            <div className="flex flex-col gap-3">
              {filteredShoots.map(shoot => {
                const cfg = SHOOT_STATUS_CFG[shoot.status]
                const titleChips = shoot.titles.length > 0 ? shoot.titles : [{ id: "legacy", title: shoot.legacyTitle, content_item_id: null }]
                return (
                  <div key={shoot.id} style={{ background: "#fff", border: "1px solid #E5E7EB", borderRadius: 18, padding: "14px 18px" }}>
                    <div className="flex items-center justify-between flex-wrap gap-2">
                      <div style={{ minWidth: 0 }}>
                        <p style={{ fontSize: 13, fontWeight: 800, color: "#111827", margin: 0 }}>{shoot.client}</p>
                        <p style={{ fontSize: 11, color: "#6B7280", margin: "2px 0 0" }}>{fmtDate(shoot.start_time.split("T")[0])}</p>
                      </div>
                      <span style={{ fontSize: 10, fontWeight: 700, padding: "3px 10px", borderRadius: 99, background: `${cfg.color}14`, color: cfg.color }}>
                        {cfg.label}
                      </span>
                    </div>
                    <div className="flex flex-wrap gap-1" style={{ marginTop: 10 }}>
                      {titleChips.map(t => (
                        <span key={t.id} style={{ fontSize: 10, fontWeight: 600, padding: "3px 10px", borderRadius: 99, background: "rgba(99,102,241,0.08)", color: "#6366F1" }}>
                          {t.title}
                        </span>
                      ))}
                    </div>
                    {shoot.notes && <p style={{ fontSize: 11, color: "#6B7280", margin: "8px 0 0" }}>{shoot.notes}</p>}
                    {(shoot.status === "scheduled" || shoot.status === "going") && (
                      <div className="flex gap-2" style={{ marginTop: 12 }}>
                        {shoot.status === "scheduled" && (
                          <button onClick={() => handleShootStatus(shoot.id, "going")}
                            style={{ padding: "6px 14px", borderRadius: 10, border: "none", background: "rgba(59,130,246,0.1)", color: "#3B82F6", fontSize: 11, fontWeight: 700, cursor: "pointer" }}>
                            Mark Going
                          </button>
                        )}
                        {shoot.status === "going" && (
                          <button onClick={() => handleShootStatus(shoot.id, "completed")}
                            style={{ padding: "6px 14px", borderRadius: 10, border: "none", background: "rgba(34,197,94,0.1)", color: "#16A34A", fontSize: 11, fontWeight: 700, cursor: "pointer" }}>
                            Mark Done
                          </button>
                        )}
                        <button onClick={() => handleShootStatus(shoot.id, "cancelled")}
                          style={{ padding: "6px 14px", borderRadius: 10, border: "none", background: "rgba(239,68,68,0.08)", color: "#EF4444", fontSize: 11, fontWeight: 700, cursor: "pointer" }}>
                          Cancel
                        </button>
                      </div>
                    )}
                  </div>
                )
              })}
            </div>
          )}
        </div>
      )}

      {showNewContent && (
```

- [ ] **Step 2: Wire the `NewShootModal` at the bottom of the component**

Find:

```typescript
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

Replace with:

```typescript
      {performanceModalAd && (
        <AdPerformanceModal ad={performanceModalAd} onClose={() => setPerformanceModalAd(null)}
          onAdded={entry => {
            setAds(prev => prev.map(a => a.id === entry.ad_id ? { ...a, performanceEntries: [entry, ...a.performanceEntries] } : a))
            setPerformanceModalAd(null)
          }} />
      )}
      {showNewShoot && (
        <NewShootModal clients={clients} pastClients={pastClients} onClose={() => setShowNewShoot(false)}
          onCreated={shoot => { setShoots(prev => [shoot, ...prev]); setShowNewShoot(false) }} />
      )}
    </div>
  )
}
```

- [ ] **Step 3: Typecheck**

Run: `pnpm typecheck`
Expected: no errors.

- [ ] **Step 4: Lint**

Run: `npx eslint components/content-tracker/content-tracker-client.tsx`
Expected: no errors, no warnings (the `NewShootModal`-unused warning from Task 7 is now resolved).

- [ ] **Step 5: Commit**

```bash
git add components/content-tracker/content-tracker-client.tsx
git commit -m "feat(content-tracker): wire Shoots tab render and NewShootModal"
```

---

### Task 9: Full verification pass

**Files:** none (verification only)

**Interfaces:** none.

- [ ] **Step 1: Run the full test suite**

Run: `pnpm test`
Expected: all tests pass, including the 9 new tests from Task 2. (If the two pre-existing unrelated `@/lib/whatsapp` test-file load failures from earlier in this project's history are still present, confirm they are unchanged and unrelated to any file touched in this plan before proceeding — do not attempt to fix them as part of this plan.)

- [ ] **Step 2: Run typecheck**

Run: `pnpm typecheck`
Expected: no errors.

- [ ] **Step 3: Run lint on the full project**

Run: `pnpm lint`
Expected: no new errors introduced by this feature. Confirm by searching the output for any of the files touched in this plan (`shoots`, `content-tracker`) — any hits must be pre-existing, not new.

- [ ] **Step 4: Run a production build**

Run: `pnpm build`
Expected: build succeeds, `/admin/content-tracker`, `/member/content-tracker`, `/admin/shoots`, and `/member/shoots` all compile without error.

- [ ] **Step 5: Manual click-through checklist**

Start the dev server (`pnpm dev`) and log in. On `/admin/content-tracker`, open the new **Shoots** tab and confirm:

- [ ] "New Shoot" opens a modal; adding 2 titles shows both as removable chips; submitting with zero titles blocks with "Add at least one title."
- [ ] The created shoot appears as a card with both title chips, status "Scheduled."
- [ ] "Mark Going" changes the card to status "Going" and the button row changes to "Mark Done" / "Cancel."
- [ ] "Cancel" from Going moves the shoot to a terminal "Cancelled" state with no action buttons, and no content item is created.
- [ ] Create a second shoot, mark it Going, then "Mark Done" — confirm it reaches "Completed" with no action buttons, and each of its titles now shows a content item in the **Pipeline** tab's "Shot" column with the correct client, date, and notes.
- [ ] Client and status filters narrow the shoot list correctly and combine with each other.
- [ ] Reload the page — all shoots, their titles, and the auto-created content items persist.
- [ ] On the older `/admin/shoots` page, confirm creating a shoot and marking it Completed/Cancelled via its existing buttons still works exactly as before (regression check).
- [ ] Mobile at 360px: shoot cards, title chips, and status badges don't overlap.

- [ ] **Step 6: Report results**

If all checks pass, the feature is complete. If any check fails, fix the specific issue, re-run the relevant verification step, and note what was fixed before considering the task done.

## Self-Review

**Spec coverage:** Extend existing `shoots` table + `shoots.ts`, not a parallel implementation (Task 1, 3) ✓. `shoot_titles` multi-title child table (Task 1) ✓. Status flow Scheduled→Going→Done/Cancelled, cancellable from either state (Task 2, 3) ✓. Done auto-creates one content item per title, landing at "Shot" in the existing Pipeline (Task 3, 6 `handleShootStatus`) ✓. New simplified "Shoots" tab, `/admin/shoots` left untouched (Task 6, 7, 8) ✓. Client/status filters (Task 6, 8) ✓. Testing/Verification section from the spec (Task 9) ✓.

**Placeholder scan:** No TBD/TODO markers; every step has complete, runnable code.

**Type consistency:** `ShootStatus` defined once in Task 2 (`lib/shoots/status-transitions.ts`), re-exported as the same name from `content-tracker-client.tsx` in Task 6 as a local type (not re-imported — matches how the rest of this file defines its own local status types like `AdStatus` rather than importing them from action files). `Shoot`/`ShootTitleRef` defined once in Task 6, imported by Task 4's data loader via `import type { ..., Shoot } from '@/components/content-tracker/content-tracker-client'`, matching the existing `ContentItem`/`Ad` import pattern in that file exactly. `CreatedShootItem` defined once in Task 3, imported by Task 6. `createShootWithTitles`/`updateShootStatus` signatures consistent between Task 3 (definition) and Tasks 6-7 (call sites).
