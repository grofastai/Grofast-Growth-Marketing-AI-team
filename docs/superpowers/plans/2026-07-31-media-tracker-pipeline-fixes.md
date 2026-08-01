# Media Tracker — Pipeline & Shoot Tab Fixes Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship the 11 approved fixes to the Media Tracker's Shoot Tab, Ready to Edit/Editing stages, New Content Item, and Poster editing, per `docs/superpowers/specs/2026-07-31-media-tracker-pipeline-fixes-design.md`.

**Architecture:** Two schema changes (a new `tags` column on `shoots`, and `content_items.shot_by` widened from a single uuid to a uuid array) ripple through the data layer, two server-action files, and the shared Kanban component (`components/media-tracker/media-tracker-client.tsx`). One new pure-logic module (`lib/shoots/shot-by.ts`) resolves the Shot By default from a shoot's crew — the only genuinely new business logic in this batch, and the only piece with a real unit test; everything else is schema/wiring/UI changes verified via typecheck, build, and manual browser testing (this codebase has no component or server-action tests).

**Tech Stack:** Next.js 15 App Router, Supabase Postgres, TypeScript, Vitest (pure-function unit tests only — matches existing project convention, see `lib/shoots/status-transitions.test.ts`).

## Global Constraints

- Every place that inserts/updates `content_items.shot_by` must write an **array** (`uuid[]`), never a bare string — Task 2 changes the column type; Tasks 4-5 update every write site.
- `shootingMembers` (role=MEMBER + `'shooting'` tag, from `lib/data/media-tracker.ts`) is the roster for both the shoot crew picker and the Shot By picker — do not widen it to all members.
- The `"branding" | "advertisement" | "promotion"` tag union is intentionally duplicated across the DB CHECK constraint, the client's local `ShootTag` type, and `lib/actions/shoots.ts`'s inline param types — this matches how `Platform`/`ShootType` already duplicate across layers in this codebase (no shared import between `lib/validations/*` and the "use client" component). Do not "fix" this by cross-importing.
- Run `pnpm typecheck` after every task that touches `.ts`/`.tsx` files, before committing. Every task in this plan is sized so `pnpm typecheck` is clean (zero errors) at the end of that task's commit — if it isn't, a step was missed.
- No CLI migration runner is wired into `package.json` — apply migration SQL directly against the Supabase project (SQL editor), same as every prior migration in `supabase/migrations/`.
- `lib/actions/shoots.ts` and `lib/actions/media-tracker.ts` are `'use server'` files — every export must be an async function. The new `resolveShotBy` pure helper must live in its own plain module, not in either action file.

---

### Task 1: `resolveShotBy` — pure helper + unit test

**Files:**
- Create: `lib/shoots/shot-by.ts`
- Create: `lib/shoots/shot-by.test.ts`

**Interfaces:**
- Produces: `resolveShotBy(goingBy: string[] | null | undefined, fallbackUserId: string): string[]` — Task 4 imports this into `lib/actions/shoots.ts`.

- [ ] **Step 1: Write the failing test**

```ts
// lib/shoots/shot-by.test.ts
import { describe, it, expect } from 'vitest'
import { resolveShotBy } from './shot-by'

describe('resolveShotBy', () => {
  it('returns the full crew when the shoot has one', () => {
    expect(resolveShotBy(['user-a', 'user-b', 'user-c'], 'admin-id')).toEqual(['user-a', 'user-b', 'user-c'])
  })
  it('returns a single crew member unchanged', () => {
    expect(resolveShotBy(['user-a'], 'admin-id')).toEqual(['user-a'])
  })
  it('falls back to the completer when no crew was recorded', () => {
    expect(resolveShotBy([], 'admin-id')).toEqual(['admin-id'])
    expect(resolveShotBy(undefined, 'admin-id')).toEqual(['admin-id'])
    expect(resolveShotBy(null, 'admin-id')).toEqual(['admin-id'])
  })
})
```

- [ ] **Step 2: Run it to verify it fails**

Run: `pnpm test lib/shoots/shot-by.test.ts`
Expected: FAIL — `lib/shoots/shot-by.ts` doesn't exist yet.

- [ ] **Step 3: Implement the minimal function**

```ts
// lib/shoots/shot-by.ts
// The single person credited with a video's footage used to be whoever completed the
// shoot — often an admin managing the board, not someone who was actually there. This
// resolves the video's Shot By crew from the shoot's own "who went" list instead, so it
// credits everyone who actually shot it. Falls back to the completer only when no crew
// was recorded at all (an older shoot, or one nobody bothered to tag).
export function resolveShotBy(goingBy: string[] | null | undefined, fallbackUserId: string): string[] {
  if (goingBy && goingBy.length > 0) return goingBy
  return [fallbackUserId]
}
```

- [ ] **Step 4: Run it to verify it passes**

Run: `pnpm test lib/shoots/shot-by.test.ts`
Expected: PASS, all 3 tests green.

- [ ] **Step 5: Commit**

```bash
git add lib/shoots/shot-by.ts lib/shoots/shot-by.test.ts
git commit -m "feat(media-tracker): add resolveShotBy helper for crew-based Shot By defaulting"
```

---

### Task 2: Database migrations

**Files:**
- Create: `supabase/migrations/119_shoots_tags.sql`
- Create: `supabase/migrations/120_content_items_shot_by_array.sql`

**Interfaces:**
- Produces: `shoots.tags text[]` (default `'{}'`, CHECK-constrained to `branding`/`advertisement`/`promotion`). `content_items.shot_by` changes type from `uuid` to `uuid[]` (default `'{}'`), with existing single values preserved as one-element arrays.

- [ ] **Step 1: Write the tags migration**

```sql
-- supabase/migrations/119_shoots_tags.sql
-- Multi-select tags on a shoot (branding / advertisement / promotion) — a shoot can be
-- more than one of these at once, unlike the older single-value shoot_type column, which
-- stays untouched and unexposed in the UI.
alter table shoots add column tags text[] not null default '{}';
alter table shoots add constraint shoots_tags_check
  check (tags <@ array['branding','advertisement','promotion']::text[]);
```

- [ ] **Step 2: Write the shot_by array migration**

```sql
-- supabase/migrations/120_content_items_shot_by_array.sql
-- Shot By becomes multi-person — a shoot's crew is already multiple people (going_by on
-- shoots), but only one of them ever got credited on the resulting video. Converts the
-- existing single value into a one-element array so no data is lost; new rows can now
-- hold the shoot's full crew instead of just whoever completed it.
alter table content_items
  alter column shot_by type uuid[]
  using case when shot_by is null then '{}'::uuid[] else array[shot_by] end;
alter table content_items alter column shot_by set default '{}';
```

- [ ] **Step 3: Apply both migrations**

Apply the SQL directly against the Supabase project (SQL editor), in order (119 then 120). Confirm no errors — the `USING` clause on the `shot_by` column must run cleanly against however much existing data is in `content_items`.

- [ ] **Step 4: Commit**

```bash
git add supabase/migrations/119_shoots_tags.sql supabase/migrations/120_content_items_shot_by_array.sql
git commit -m "feat(media-tracker): add shoots.tags and widen content_items.shot_by to an array"
```

---

### Task 3: Validation schema updates

**Files:**
- Modify: `lib/validations/media-tracker.ts`

**Interfaces:**
- Consumes: nothing new.
- Produces: `updateContentItemSchema`'s `shot_by` now accepts `string[]`. `createContentItemSchema` gains optional `posted_by`. Tasks 5 and 11 depend on both.

- [ ] **Step 1: Update `updateContentItemSchema`'s `shot_by` field**

In `lib/validations/media-tracker.ts`, replace:

```ts
  // Who shot/designed it — editable after the fact (wrong person tagged at creation).
  shot_by:      z.string().uuid().optional(),
```

with:

```ts
  // Who shot it — editable after the fact, and now multi-person (a shoot's crew is
  // rarely just one person). Empty array clears it; undefined means "not sent this time".
  shot_by:      z.array(z.string().uuid()).optional(),
```

- [ ] **Step 2: Add `posted_by` to `createContentItemSchema`**

In `lib/validations/media-tracker.ts`, replace:

```ts
  // Who edited/designed it — asked at backfill time same as the normal Edited -> On
  // Review move, instead of silently defaulting to whoever's filling out the form.
  edited_by:            z.string().uuid().optional(),
  // Only meaningful when posted_platforms includes 'other'.
  other_platform_label: z.string().optional(),
})
export type CreateContentItemInput = z.infer<typeof createContentItemSchema>
```

with:

```ts
  // Who edited/designed it — asked at backfill time same as the normal Edited -> On
  // Review move, instead of silently defaulting to whoever's filling out the form.
  edited_by:            z.string().uuid().optional(),
  // Who actually posted it — same reasoning as edited_by, asked instead of silently
  // crediting whoever's filling out the backfill form.
  posted_by:            z.string().uuid().optional(),
  // Only meaningful when posted_platforms includes 'other'.
  other_platform_label: z.string().optional(),
})
export type CreateContentItemInput = z.infer<typeof createContentItemSchema>
```

- [ ] **Step 3: Typecheck**

Run: `pnpm typecheck`
Expected: errors in `lib/actions/media-tracker.ts` and `components/media-tracker/media-tracker-client.tsx` (both still use the old shapes) — that's expected, fixed in Tasks 5-11. No errors should originate from this file itself.

- [ ] **Step 4: Commit**

```bash
git add lib/validations/media-tracker.ts
git commit -m "feat(media-tracker): shot_by becomes multi-select, add posted_by to backfill schema"
```

---

### Task 4: Server actions — `lib/actions/shoots.ts`

**Files:**
- Modify: `lib/actions/shoots.ts`

**Interfaces:**
- Consumes: `resolveShotBy` from `lib/shoots/shot-by.ts` (Task 1).
- Produces: `createTrackerShoot` accepts optional `going_by`/`tags`. `updateTrackerShoot` accepts optional `tags`. Every content-item-creating path (`completeShootWithTitles`, `addShootTitle`, `updateShootStatus`) now writes `shot_by` as an array resolved from the shoot's crew, not `[user.id]` unconditionally.

- [ ] **Step 1: Import the new helper**

In `lib/actions/shoots.ts`, replace:

```ts
import { isValidShootTransition, type ShootStatus } from '@/lib/shoots/status-transitions'
import { moveScriptToShootSchema, type MoveScriptToShootInput } from '@/lib/validations/media-tracker'
import { isValidDriveLink } from '@/lib/utils/drive-link'
```

with:

```ts
import { isValidShootTransition, type ShootStatus } from '@/lib/shoots/status-transitions'
import { moveScriptToShootSchema, type MoveScriptToShootInput } from '@/lib/validations/media-tracker'
import { isValidDriveLink } from '@/lib/utils/drive-link'
import { resolveShotBy } from '@/lib/shoots/shot-by'
```

- [ ] **Step 2: `updateShootStatus` — fetch crew, use it for shot_by**

Replace:

```ts
  const admin = adminSupabase()
  const { data: shoot } = await admin
    .from('shoots')
    .select('id, status, client, start_time, notes, company_id, source_content_item_id')
    .eq('id', id)
    .single()
  if (!shoot) return { success: false, error: 'Shoot not found' }
```

with:

```ts
  const admin = adminSupabase()
  const { data: shoot } = await admin
    .from('shoots')
    .select('id, status, client, start_time, notes, company_id, source_content_item_id, going_by')
    .eq('id', id)
    .single()
  if (!shoot) return { success: false, error: 'Shoot not found' }
```

Then, in the same function, replace:

```ts
  if (status === 'completed' && shoot.source_content_item_id) {
    const shotDate = shoot.start_time.split('T')[0]
    await admin.from('content_items').update({
      status: 'ready_to_edit', shot_by: user.id, shot_date: shotDate, updated_at: new Date().toISOString(),
    }).eq('id', shoot.source_content_item_id)
```

with:

```ts
  if (status === 'completed' && shoot.source_content_item_id) {
    const shotDate = shoot.start_time.split('T')[0]
    await admin.from('content_items').update({
      status: 'ready_to_edit', shot_by: resolveShotBy(shoot.going_by, user.id), shot_date: shotDate, updated_at: new Date().toISOString(),
    }).eq('id', shoot.source_content_item_id)
```

And replace:

```ts
      const rows = titles.map(t => ({
        company_id: shoot.company_id,
        client_name: shoot.client,
        title: t.title,
        content_type: 'video',
        source: 'shoot',
        status: 'ready_to_edit',
        shot_by: user.id,
        shot_date: shotDate,
        notes: shoot.notes,
        created_by: user.id,
      }))
```

with:

```ts
      const rows = titles.map(t => ({
        company_id: shoot.company_id,
        client_name: shoot.client,
        title: t.title,
        content_type: 'video',
        source: 'shoot',
        status: 'ready_to_edit',
        shot_by: resolveShotBy(shoot.going_by, user.id),
        shot_date: shotDate,
        notes: shoot.notes,
        created_by: user.id,
      }))
```

- [ ] **Step 3: `createTrackerShoot` — accept optional crew and tags**

Replace:

```ts
type CreateTrackerShootInput = {
  client: string
  title: string
  shot_date: string
  shot_time_from: string
  shot_time_to: string
  notes?: string
}
```

with:

```ts
type CreateTrackerShootInput = {
  client: string
  title: string
  shot_date: string
  shot_time_from: string
  shot_time_to: string
  notes?: string
  going_by?: string[]
  tags?: ('branding' | 'advertisement' | 'promotion')[]
}
```

Then replace:

```ts
  const { data: shoot, error } = await admin.from('shoots').insert({
    company_id,
    title: input.title.trim(),
    client: input.client.trim(),
    location: '',
    start_time,
    end_time,
    notes: input.notes?.trim() || null,
    created_by: user.id,
    status: 'scheduled',
  }).select('id').single()
```

with:

```ts
  const { data: shoot, error } = await admin.from('shoots').insert({
    company_id,
    title: input.title.trim(),
    client: input.client.trim(),
    location: '',
    start_time,
    end_time,
    notes: input.notes?.trim() || null,
    created_by: user.id,
    status: 'scheduled',
    going_by: input.going_by ?? [],
    tags: input.tags ?? [],
  }).select('id').single()
```

- [ ] **Step 4: `completeShootWithTitles` — use the crew for shot_by**

Replace (the titles-insert branch):

```ts
    const { data: insertedItems, error: itemsError } = await admin.from('content_items').insert(
      insertedTitles.map(t => ({
        company_id: shoot.company_id,
        client_name: shoot.client,
        title: t.title,
        content_type: 'video',
        source: 'shoot',
        status: 'ready_to_edit',
        shot_by: user.id,
        shot_date: shotDate,
        notes: shoot.notes,
        created_by: user.id,
      }))
    ).select('id')
```

with:

```ts
    const { data: insertedItems, error: itemsError } = await admin.from('content_items').insert(
      insertedTitles.map(t => ({
        company_id: shoot.company_id,
        client_name: shoot.client,
        title: t.title,
        content_type: 'video',
        source: 'shoot',
        status: 'ready_to_edit',
        shot_by: resolveShotBy(goingBy, user.id),
        shot_date: shotDate,
        notes: shoot.notes,
        created_by: user.id,
      }))
    ).select('id')
```

Then replace (the linked-item branch):

```ts
  if (isLinked) {
    const { error: itemError } = await admin.from('content_items').update({
      status: 'ready_to_edit', shot_by: user.id, shot_date: shotDate, updated_at: new Date().toISOString(),
    }).eq('id', shoot.source_content_item_id as string)
    if (itemError) return { success: false, error: itemError.message }
  }
```

with:

```ts
  if (isLinked) {
    const { error: itemError } = await admin.from('content_items').update({
      status: 'ready_to_edit', shot_by: resolveShotBy(goingBy, user.id), shot_date: shotDate, updated_at: new Date().toISOString(),
    }).eq('id', shoot.source_content_item_id as string)
    if (itemError) return { success: false, error: itemError.message }
  }
```

- [ ] **Step 5: `addShootTitle` — fetch crew, use it for shot_by**

Replace:

```ts
  const admin = adminSupabase()
  const { data: shoot } = await admin.from('shoots')
    .select('id, status, client, start_time, notes, company_id').eq('id', shootId).single()
  if (!shoot) return { success: false, error: 'Shoot not found' }
  if (shoot.status !== 'completed') return { success: false, error: 'Only a Completed shoot can have videos added here' }

  const shotDate = shoot.start_time.split('T')[0]
  const { data: item, error: itemError } = await admin.from('content_items').insert({
    company_id: shoot.company_id, client_name: shoot.client, title: cleanTitle, content_type: 'video',
    source: 'shoot', status: 'ready_to_edit', shot_by: user.id, shot_date: shotDate, notes: shoot.notes, created_by: user.id,
  }).select('id').single()
```

with:

```ts
  const admin = adminSupabase()
  const { data: shoot } = await admin.from('shoots')
    .select('id, status, client, start_time, notes, company_id, going_by').eq('id', shootId).single()
  if (!shoot) return { success: false, error: 'Shoot not found' }
  if (shoot.status !== 'completed') return { success: false, error: 'Only a Completed shoot can have videos added here' }

  const shotDate = shoot.start_time.split('T')[0]
  const { data: item, error: itemError } = await admin.from('content_items').insert({
    company_id: shoot.company_id, client_name: shoot.client, title: cleanTitle, content_type: 'video',
    source: 'shoot', status: 'ready_to_edit', shot_by: resolveShotBy(shoot.going_by, user.id), shot_date: shotDate, notes: shoot.notes, created_by: user.id,
  }).select('id').single()
```

- [ ] **Step 6: `updateTrackerShoot` — accept optional tags**

Replace:

```ts
export async function updateTrackerShoot(
  shootId: string,
  input: { client: string; title: string; shoot_type?: 'ads_shoot' | 'branding_shoot'; shot_date: string; shot_time_from: string; shot_time_to: string; notes?: string }
): Promise<{ success: boolean; error?: string }> {
```

with:

```ts
export async function updateTrackerShoot(
  shootId: string,
  input: { client: string; title: string; shoot_type?: 'ads_shoot' | 'branding_shoot'; shot_date: string; shot_time_from: string; shot_time_to: string; notes?: string; tags?: ('branding' | 'advertisement' | 'promotion')[] }
): Promise<{ success: boolean; error?: string }> {
```

Then replace:

```ts
  const { error } = await admin.from('shoots').update({
    client: input.client.trim(),
    title: input.title.trim(),
    start_time,
    end_time,
    ...(input.shoot_type ? { shoot_type: input.shoot_type } : {}),
    notes: input.notes?.trim() || null,
  }).eq('id', shootId)
```

with:

```ts
  const { error } = await admin.from('shoots').update({
    client: input.client.trim(),
    title: input.title.trim(),
    start_time,
    end_time,
    ...(input.shoot_type ? { shoot_type: input.shoot_type } : {}),
    ...(input.tags ? { tags: input.tags } : {}),
    notes: input.notes?.trim() || null,
  }).eq('id', shootId)
```

- [ ] **Step 7: Typecheck**

Run: `pnpm typecheck`
Expected: no errors from this file (downstream callers in `media-tracker-client.tsx` are fixed in Tasks 7-8 and will still show errors until then).

- [ ] **Step 8: Commit**

```bash
git add lib/actions/shoots.ts
git commit -m "feat(media-tracker): resolve Shot By from shoot crew, add crew/tags to shoot creation and editing"
```

---

### Task 5: Server actions — `lib/actions/media-tracker.ts`

**Files:**
- Modify: `lib/actions/media-tracker.ts`

**Interfaces:**
- Consumes: `updateContentItemSchema`/`createContentItemSchema` from Task 3.
- Produces: `updateContentItem` correctly applies (and can clear) a multi-person `shot_by`. `createContentItem`'s backfill path honors an explicit `posted_by` instead of hardcoding the current user.

- [ ] **Step 1: Fix the `shot_by` truthiness bug in `updateContentItem`**

Replace:

```ts
  if (parsed.data.shot_by) updates.shot_by = parsed.data.shot_by
```

with:

```ts
  // !== undefined, not truthy — an empty array (clearing Shot By) is truthy in JS and
  // would otherwise be silently dropped.
  if (parsed.data.shot_by !== undefined) updates.shot_by = parsed.data.shot_by
```

- [ ] **Step 2: `createContentItem` — honor an explicit `posted_by`**

Replace:

```ts
  if (isBackfillPosted) {
    const postedDate = parsed.data.posted_date || today
    const rows = parsed.data.posted_platforms!.map(platform => ({
      content_item_id: data.id, company_id: ctx.companyId, platform, posted_date: postedDate, posted_by: ctx.id,
      other_platform_label: platform === 'other' ? (parsed.data.other_platform_label || null) : null,
    }))
```

with:

```ts
  if (isBackfillPosted) {
    const postedDate = parsed.data.posted_date || today
    const rows = parsed.data.posted_platforms!.map(platform => ({
      content_item_id: data.id, company_id: ctx.companyId, platform, posted_date: postedDate, posted_by: parsed.data.posted_by || ctx.id,
      other_platform_label: platform === 'other' ? (parsed.data.other_platform_label || null) : null,
    }))
```

- [ ] **Step 3: Typecheck**

Run: `pnpm typecheck`
Expected: no errors from this file.

- [ ] **Step 4: Commit**

```bash
git add lib/actions/media-tracker.ts
git commit -m "fix(media-tracker): correct shot_by clearing bug, honor explicit posted_by on backfill"
```

---

### Task 6: Data layer and client types — `shotByUsers` and `Shoot.tags`

**Files:**
- Modify: `lib/data/media-tracker.ts`
- Modify: `components/media-tracker/media-tracker-client.tsx` (type definitions and config only — no component logic yet)

**Interfaces:**
- Produces: `ShootTag` type, `Shoot.tags`, `ContentItem.shotByUsers` (replacing `shotByUser`), `SHOOT_TAG_CFG`, and `getMediaTrackerData()` returning both. Every remaining task in this file depends on these. This task's own components (`NewShootModal`, `EditShootModal`, `ShootCardInner`, `EditContentModal`, `NewContentModal`) are fixed in Tasks 7-11 — `pnpm typecheck` at the end of *this* task will still show errors in those, which is expected and resolved by the end of Task 10 (the last construction-site fix); Task 11 is unrelated additive work.

- [ ] **Step 1: Add the `ShootTag` type to the client component**

In `components/media-tracker/media-tracker-client.tsx`, replace:

```ts
type ShootType = "ads_shoot" | "branding_shoot"
type CancelledBy = "client" | "us"
```

with:

```ts
type ShootType = "ads_shoot" | "branding_shoot"
type ShootTag = "branding" | "advertisement" | "promotion"
type CancelledBy = "client" | "us"
```

- [ ] **Step 2: `ContentItem.shotByUser` → `shotByUsers`**

Replace:

```ts
  shotByUser?: Person
  editedByUser?: Person
```

with:

```ts
  shotByUsers?: Person[]
  editedByUser?: Person
```

- [ ] **Step 3: Add `tags` to the `Shoot` type**

Replace:

```ts
  status: ShootStatus
  shoot_type: ShootType | null
  // Set when this shoot was spun off an Ads Video item via "Move to Shoot" — completing
  // it advances that linked item straight to Ready to Edit instead of creating new titles.
  source_content_item_id: string | null
```

with:

```ts
  status: ShootStatus
  shoot_type: ShootType | null
  tags: ShootTag[]
  // Set when this shoot was spun off an Ads Video item via "Move to Shoot" — completing
  // it advances that linked item straight to Ready to Edit instead of creating new titles.
  source_content_item_id: string | null
```

- [ ] **Step 4: Add `SHOOT_TAG_CFG`**

Replace:

```ts
const SHOOT_TYPE_CFG: Record<ShootType, { label: string; color: string }> = {
  ads_shoot:      { label: "Ads Shoot",      color: "#D97706" },
  branding_shoot: { label: "Branding Shoot", color: "#0D9488" },
}
```

with:

```ts
const SHOOT_TYPE_CFG: Record<ShootType, { label: string; color: string }> = {
  ads_shoot:      { label: "Ads Shoot",      color: "#D97706" },
  branding_shoot: { label: "Branding Shoot", color: "#0D9488" },
}

const SHOOT_TAG_CFG: Record<ShootTag, { label: string; color: string }> = {
  branding:      { label: "Branding",      color: "#3B82F6" },
  advertisement: { label: "Advertisement", color: "#D97706" },
  promotion:     { label: "Promotion",     color: "#8B5CF6" },
}
```

- [ ] **Step 5: Select `tags` on the shoots query**

In `lib/data/media-tracker.ts`, replace:

```ts
    admin.from('shoots').select('id, title, client, start_time, end_time, notes, status, shoot_type, source_content_item_id, going_by, drive_link, created_at').eq('company_id', companyId).order('start_time', { ascending: false }),
```

with:

```ts
    admin.from('shoots').select('id, title, client, start_time, end_time, notes, status, shoot_type, source_content_item_id, going_by, tags, drive_link, created_at').eq('company_id', companyId).order('start_time', { ascending: false }),
```

- [ ] **Step 6: Update the row types**

Replace:

```ts
    shot_by: string | null; shot_date: string | null; edited_by: string | null; edited_date: string | null
```

with:

```ts
    shot_by: string[] | null; shot_date: string | null; edited_by: string | null; edited_date: string | null
```

Replace:

```ts
  type ShootRow = {
    id: string; title: string; client: string; start_time: string; end_time: string | null
    notes: string | null; status: 'scheduled' | 'completed' | 'cancelled'
    shoot_type: 'ads_shoot' | 'branding_shoot' | null; source_content_item_id: string | null
    going_by: string[] | null; drive_link: string | null; created_at: string
  }
```

with:

```ts
  type ShootRow = {
    id: string; title: string; client: string; start_time: string; end_time: string | null
    notes: string | null; status: 'scheduled' | 'completed' | 'cancelled'
    shoot_type: 'ads_shoot' | 'branding_shoot' | null; source_content_item_id: string | null
    going_by: string[] | null; tags: string[] | null; drive_link: string | null; created_at: string
  }
```

- [ ] **Step 7: Map `shotByUsers` instead of `shotByUser`**

Replace:

```ts
    shotByUser: row.shot_by ? (userMap.get(row.shot_by) ?? null) : null,
```

with:

```ts
    shotByUsers: (row.shot_by ?? []).map(uid => userMap.get(uid)).filter((u): u is UserRow => !!u),
```

- [ ] **Step 8: Map `tags` on the shoots array**

Replace:

```ts
  const shoots: Shoot[] = shootRows.map(row => ({
    id: row.id,
    client: row.client,
    legacyTitle: row.title,
    start_time: row.start_time,
    end_time: row.end_time,
    created_at: row.created_at,
    notes: row.notes,
    status: row.status,
    shoot_type: row.shoot_type,
    source_content_item_id: row.source_content_item_id,
    drive_link: row.drive_link,
```

with:

```ts
  const shoots: Shoot[] = shootRows.map(row => ({
    id: row.id,
    client: row.client,
    legacyTitle: row.title,
    start_time: row.start_time,
    end_time: row.end_time,
    created_at: row.created_at,
    notes: row.notes,
    status: row.status,
    shoot_type: row.shoot_type,
    tags: (row.tags ?? []) as Shoot['tags'],
    source_content_item_id: row.source_content_item_id,
    drive_link: row.drive_link,
```

- [ ] **Step 9: Typecheck**

Run: `pnpm typecheck`
Expected: errors only inside `components/media-tracker/media-tracker-client.tsx`, at every construction site of a `Shoot` object (missing `tags`) and every reference to `.shotByUser`. List them — Tasks 7-10 fix each one in turn.

- [ ] **Step 10: Commit**

```bash
git add lib/data/media-tracker.ts components/media-tracker/media-tracker-client.tsx
git commit -m "feat(media-tracker): add ShootTag type and shotByUsers to the shared data model"
```

---

### Task 7: New Shoot modal — Schedule Date rename, optional crew and tags

**Files:**
- Modify: `components/media-tracker/media-tracker-client.tsx` (the `NewShootModal` function, its mount site, and `MoveToShootModal`'s `Shoot` construction)

**Interfaces:**
- Consumes: `SHOOT_TAG_CFG`, `ShootTag` (Task 6), `createTrackerShoot`'s new `going_by`/`tags` params (Task 4).
- Produces: `NewShootModal` now takes `shootingMembers`/`currentUserId` props.

- [ ] **Step 1: Replace the whole `NewShootModal` function**

Replace the entire existing function (from `function NewShootModal({ clients, pastClients, onClose, onCreated }: {` through its closing `}`) with:

```tsx
// ── New Shoot modal ──────────────────────────────────────────────────────────
function NewShootModal({ clients, pastClients, shootingMembers, currentUserId, onClose, onCreated }: {
  clients: { id: string; name: string }[]; pastClients: { id: string; name: string }[]
  shootingMembers: Member[]; currentUserId: string
  onClose: () => void; onCreated: (shoot: Shoot) => void
}) {
  const { activeOptions: activeClientOptions, pastOptions: pastClientOptions } = useMemo(
    () => buildClientOptions(clients.map(c => c.name), pastClients.map(c => c.name)),
    [clients, pastClients]
  )
  const [client, setClient] = useState("")
  const [title, setTitle] = useState("")
  const [shotDate, setShotDate] = useState(todayIST())
  const [fromTime, setFromTime] = useState("")
  const [toTime, setToTime] = useState("")
  const [notes, setNotes] = useState("")
  const [tags, setTags] = useState<ShootTag[]>([])
  const [crew, setCrew] = useState<string[]>([])
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  function toggleTag(tag: ShootTag) {
    setTags(prev => prev.includes(tag) ? prev.filter(t => t !== tag) : [...prev, tag])
  }
  function toggleCrew(id: string) {
    setCrew(prev => prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id])
  }

  async function submit() {
    if (!client) { setError("Client is required"); return }
    if (!title.trim()) { setError("Shoot title is required"); return }
    if (!fromTime) { setError("From time is required"); return }
    if (!toTime) { setError("To time is required"); return }
    setSaving(true); setError(null)
    const res = await createTrackerShoot({
      client, title: title.trim(), shot_date: shotDate,
      shot_time_from: fromTime, shot_time_to: toTime, notes: notes.trim() || undefined,
      going_by: crew.length > 0 ? crew : undefined, tags: tags.length > 0 ? tags : undefined,
    })
    setSaving(false)
    if (!res.success || !res.id) { setError(res.error ?? "Failed to save"); return }
    onCreated({
      id: res.id,
      client,
      legacyTitle: title.trim(),
      start_time: `${shotDate}T${fromTime}:00`,
      end_time: `${shotDate}T${toTime}:00`,
      created_at: new Date().toISOString(),
      notes: notes.trim() || null,
      status: "scheduled",
      shoot_type: null,
      tags,
      source_content_item_id: null,
      drive_link: null,
      goingByUsers: shootingMembers.filter(m => crew.includes(m.id)),
      titles: [],
    })
  }

  return (
    <Modal title="New Shoot" onClose={onClose}>
      <div className="flex flex-col gap-3">
        <ClientSelector clientOptions={activeClientOptions} pastClientOptions={pastClientOptions} value={client} onValueChange={setClient} required />
        <div>
          <label style={LABEL}>Shoot Title *</label>
          <input style={FIELD} value={title} onChange={e => setTitle(e.target.value)}
            placeholder="e.g. SKB Silks Diwali Shoot" />
        </div>
        <div>
          <label style={LABEL}>Schedule Date *</label>
          <input type="date" style={FIELD} value={shotDate} onChange={e => setShotDate(e.target.value)} />
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
          <div>
            <label style={LABEL}>From Time *</label>
            <input type="time" style={FIELD} value={fromTime} onChange={e => setFromTime(e.target.value)} />
          </div>
          <div>
            <label style={LABEL}>To Time *</label>
            <input type="time" style={FIELD} value={toTime} onChange={e => setToTime(e.target.value)} />
          </div>
        </div>
        <div>
          <label style={LABEL}>Notes</label>
          <textarea style={{ ...FIELD, minHeight: 50, resize: "vertical" }} value={notes} onChange={e => setNotes(e.target.value)} placeholder="Optional" />
        </div>
        <div>
          <label style={LABEL}>Tags <span style={{ fontWeight: 600, textTransform: "none" }}>(optional)</span></label>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
            {(Object.keys(SHOOT_TAG_CFG) as ShootTag[]).map(tag => {
              const cfg = SHOOT_TAG_CFG[tag]
              const on = tags.includes(tag)
              return (
                <button key={tag} type="button" onClick={() => toggleTag(tag)}
                  style={{ display: "flex", alignItems: "center", gap: 5, padding: "6px 12px", borderRadius: 10, border: `1.5px solid ${on ? cfg.color : "#E5E7EB"}`, background: on ? `${cfg.color}14` : "#fff", color: on ? cfg.color : "#6B7280", fontSize: 11, fontWeight: 700, cursor: "pointer" }}>
                  {on && <Check size={11} />} {cfg.label}
                </button>
              )
            })}
          </div>
        </div>
        {shootingMembers.length > 0 && (
          <div>
            <label style={LABEL}>Crew <span style={{ fontWeight: 600, textTransform: "none" }}>(optional — pick one or more)</span></label>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
              {shootingMembers.map(m => {
                const on = crew.includes(m.id)
                return (
                  <button key={m.id} type="button" onClick={() => toggleCrew(m.id)}
                    style={{ display: "flex", alignItems: "center", gap: 5, padding: "6px 12px", borderRadius: 10, border: `1.5px solid ${on ? "#3B82F6" : "#E5E7EB"}`, background: on ? "rgba(59,130,246,0.08)" : "#fff", color: on ? "#3B82F6" : "#6B7280", fontSize: 11, fontWeight: 700, cursor: "pointer" }}>
                    {on && <Check size={11} />} {upper(m.name)}{m.id === currentUserId ? " (me)" : ""}
                  </button>
                )
              })}
            </div>
          </div>
        )}
        {error && <p style={{ fontSize: 11, color: "#DE1A1A", margin: 0 }}>{error}</p>}
        <PrimaryButton onClick={submit} disabled={saving}>{saving ? "Saving…" : "Schedule Shoot"}</PrimaryButton>
      </div>
    </Modal>
  )
}
```

- [ ] **Step 2: Update the mount site**

Replace:

```tsx
      {showNewShoot && (
        <NewShootModal clients={clients} pastClients={pastClients} onClose={() => setShowNewShoot(false)}
          onCreated={shoot => { setShoots(prev => [shoot, ...prev]); setShowNewShoot(false) }} />
      )}
```

with:

```tsx
      {showNewShoot && (
        <NewShootModal clients={clients} pastClients={pastClients} shootingMembers={shootingMembers} currentUserId={currentUserId} onClose={() => setShowNewShoot(false)}
          onCreated={shoot => { setShoots(prev => [shoot, ...prev]); setShowNewShoot(false) }} />
      )}
```

- [ ] **Step 3: Fix `MoveToShootModal`'s now-incomplete `Shoot` construction**

This is a different modal (Ads Video → Shoot), not part of this feature, but it constructs a `Shoot` object missing the now-required `tags` field. Replace:

```tsx
    onMoved({
      id: res.shootId,
      client: item.client_name,
      legacyTitle: item.title,
      start_time: `${shotDate}T${fromTime}:00`,
      end_time: `${shotDate}T${toTime}:00`,
      created_at: new Date().toISOString(),
      notes: notes.trim() || null,
      status: "scheduled",
      shoot_type: null,
      source_content_item_id: item.id,
      drive_link: null,
      goingByUsers: [],
      titles: [],
    })
```

with:

```tsx
    onMoved({
      id: res.shootId,
      client: item.client_name,
      legacyTitle: item.title,
      start_time: `${shotDate}T${fromTime}:00`,
      end_time: `${shotDate}T${toTime}:00`,
      created_at: new Date().toISOString(),
      notes: notes.trim() || null,
      status: "scheduled",
      shoot_type: null,
      tags: [],
      source_content_item_id: item.id,
      drive_link: null,
      goingByUsers: [],
      titles: [],
    })
```

- [ ] **Step 4: Typecheck**

Run: `pnpm typecheck`
Expected: fewer errors than after Task 6 — the `NewShootModal`/`MoveToShootModal` construction-site errors are gone. Remaining errors are in `ShootCardInner`, `EditShootModal`, `EditCrewModal`, and `EditContentModal` — fixed in Tasks 8-10.

- [ ] **Step 5: Commit**

```bash
git add components/media-tracker/media-tracker-client.tsx
git commit -m "feat(media-tracker): rename Shot Date to Schedule Date, add optional crew and tags to New Shoot"
```

---

### Task 8: Merge "Edit shoot" + "Who went" into "Edit Details"

**Files:**
- Modify: `components/media-tracker/media-tracker-client.tsx` (the `EditShootModal` function, deletion of `EditCrewModal`, `handleShootSaved`/`handleCrewSaved`, mount sites)

**Interfaces:**
- Consumes: `SHOOT_TAG_CFG`, `ShootTag` (Task 6), `updateTrackerShoot`'s `tags` param and `updateShootCrew` (Task 4, unchanged signature).
- Produces: `EditShootModal`'s `onSaved` now delivers `{ client, legacyTitle, start_time, notes, tags, crew }` in one call. `EditCrewModal` and its state (`editCrewFor`) are removed entirely.

- [ ] **Step 1: Replace the whole `EditShootModal` function**

Replace the entire existing function (from `function EditShootModal({ shoot, clients, pastClients, onClose, onSaved }: {` through its closing `}`) with:

```tsx
// ── Edit shoot details — client/title/date/time/notes/tags/crew, all in one save.
// Replaces the old separate "Edit shoot" + "Who went" modals for Scheduled shoots. ────────
function EditShootModal({ shoot, members, currentUserId, clients, pastClients, onClose, onSaved }: {
  shoot: Shoot
  members: Member[]
  currentUserId: string
  clients: { id: string; name: string }[]; pastClients: { id: string; name: string }[]
  onClose: () => void
  onSaved: (patch: { client: string; legacyTitle: string; start_time: string; notes: string | null; tags: ShootTag[]; crew: Member[] }) => void
}) {
  const { activeOptions: activeClientOptions, pastOptions: pastClientOptions } = useMemo(
    () => buildClientOptions(clients.map(c => c.name), pastClients.map(c => c.name)),
    [clients, pastClients]
  )
  const [client, setClient] = useState(shoot.client)
  const [title, setTitle] = useState(shoot.legacyTitle)
  const [shotDate, setShotDate] = useState(shoot.start_time.split("T")[0])
  const [fromTime, setFromTime] = useState(() => {
    const t = shoot.start_time.split("T")[1]
    return t ? t.slice(0, 5) : ""
  })
  const [toTime, setToTime] = useState(() => {
    const t = shoot.end_time?.split("T")[1]
    return t ? t.slice(0, 5) : ""
  })
  const [notes, setNotes] = useState(shoot.notes ?? "")
  const [tags, setTags] = useState<ShootTag[]>(shoot.tags)
  const [crew, setCrew] = useState<string[]>(shoot.goingByUsers.map(u => u.id))
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  function toggleTag(tag: ShootTag) {
    setTags(prev => prev.includes(tag) ? prev.filter(t => t !== tag) : [...prev, tag])
  }
  function toggleCrew(id: string) {
    setCrew(prev => prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id])
  }

  async function submit() {
    if (!client) { setError("Client is required"); return }
    if (!title.trim()) { setError("Shoot title is required"); return }
    if (!fromTime) { setError("From time is required"); return }
    if (!toTime) { setError("To time is required"); return }
    setSaving(true); setError(null)
    const [shootRes, crewRes] = await Promise.all([
      updateTrackerShoot(shoot.id, {
        client, title: title.trim(), shot_date: shotDate,
        shot_time_from: fromTime, shot_time_to: toTime, notes: notes.trim() || undefined, tags,
      }),
      updateShootCrew(shoot.id, crew),
    ])
    setSaving(false)
    if (!shootRes.success) { setError(shootRes.error ?? "Failed to save"); return }
    if (!crewRes.success) { setError(crewRes.error ?? "Failed to save crew"); return }
    onSaved({
      client,
      legacyTitle: title.trim(),
      start_time: `${shotDate}T${fromTime}:00`,
      notes: notes.trim() || null,
      tags,
      crew: members.filter(m => crew.includes(m.id)),
    })
  }

  return (
    <Modal title="Edit Details" onClose={onClose}>
      <div className="flex flex-col gap-3">
        <ClientSelector clientOptions={activeClientOptions} pastClientOptions={pastClientOptions} value={client} onValueChange={setClient} required />
        <div>
          <label style={LABEL}>Shoot Title *</label>
          <input style={FIELD} value={title} onChange={e => setTitle(e.target.value)} />
        </div>
        <div>
          <label style={LABEL}>Schedule Date *</label>
          <input type="date" style={FIELD} value={shotDate} onChange={e => setShotDate(e.target.value)} />
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
          <div>
            <label style={LABEL}>From Time *</label>
            <input type="time" style={FIELD} value={fromTime} onChange={e => setFromTime(e.target.value)} />
          </div>
          <div>
            <label style={LABEL}>To Time *</label>
            <input type="time" style={FIELD} value={toTime} onChange={e => setToTime(e.target.value)} />
          </div>
        </div>
        <div>
          <label style={LABEL}>Notes</label>
          <textarea style={{ ...FIELD, minHeight: 50, resize: "vertical" }} value={notes} onChange={e => setNotes(e.target.value)} />
        </div>
        <div>
          <label style={LABEL}>Tags</label>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
            {(Object.keys(SHOOT_TAG_CFG) as ShootTag[]).map(tag => {
              const cfg = SHOOT_TAG_CFG[tag]
              const on = tags.includes(tag)
              return (
                <button key={tag} type="button" onClick={() => toggleTag(tag)}
                  style={{ display: "flex", alignItems: "center", gap: 5, padding: "6px 12px", borderRadius: 10, border: `1.5px solid ${on ? cfg.color : "#E5E7EB"}`, background: on ? `${cfg.color}14` : "#fff", color: on ? cfg.color : "#6B7280", fontSize: 11, fontWeight: 700, cursor: "pointer" }}>
                  {on && <Check size={11} />} {cfg.label}
                </button>
              )
            })}
          </div>
        </div>
        {members.length > 0 && (
          <div>
            <label style={LABEL}>Crew <span style={{ fontWeight: 600, textTransform: "none" }}>(pick one or more)</span></label>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
              {members.map(m => {
                const on = crew.includes(m.id)
                return (
                  <button key={m.id} type="button" onClick={() => toggleCrew(m.id)}
                    style={{ display: "flex", alignItems: "center", gap: 5, padding: "6px 12px", borderRadius: 10, border: `1.5px solid ${on ? "#3B82F6" : "#E5E7EB"}`, background: on ? "rgba(59,130,246,0.08)" : "#fff", color: on ? "#3B82F6" : "#6B7280", fontSize: 11, fontWeight: 700, cursor: "pointer" }}>
                    {on && <Check size={11} />} {upper(m.name)}{m.id === currentUserId ? " (me)" : ""}
                  </button>
                )
              })}
            </div>
          </div>
        )}
        {error && <p style={{ fontSize: 11, color: "#DE1A1A", margin: 0 }}>{error}</p>}
        <PrimaryButton onClick={submit} disabled={saving}>{saving ? "Saving…" : "Save Changes"}</PrimaryButton>
      </div>
    </Modal>
  )
}
```

- [ ] **Step 2: Delete `EditCrewModal` entirely**

Find and delete the whole function (from its leading comment `// ── Set / correct who went ...` through its closing `}`, immediately before the `// ── Edit shoot details ...` comment you just replaced in Step 1).

- [ ] **Step 3: Remove `editCrewFor` state and merge its handler into `handleShootSaved`**

Replace:

```ts
  const [editCrewFor, setEditCrewFor] = useState<Shoot | null>(null)
  const [editShootFor, setEditShootFor] = useState<Shoot | null>(null)
```

with:

```ts
  const [editShootFor, setEditShootFor] = useState<Shoot | null>(null)
```

Replace:

```ts
  function handleCrewSaved(shootId: string, crew: Member[]) {
    setShoots(prev => prev.map(s => s.id === shootId ? { ...s, goingByUsers: crew } : s))
    setEditCrewFor(null)
  }

  // Same as handleCrewSaved, but from Edit Completed Shoot — that modal stays open (its
```

with:

```ts
  // Same as handleShootSaved's crew update, but from Edit Completed Shoot — that modal stays open (its
```

Replace:

```ts
  function handleShootSaved(shootId: string, patch: { client: string; legacyTitle: string; start_time: string; notes: string | null }) {
    setShoots(prev => prev.map(s => s.id === shootId ? { ...s, ...patch } : s))
    // A shoot spun off an Ads Video item shares its client — keep the linked item's card
    // in sync instead of leaving it stuck on the shoot's old client.
    const shoot = shoots.find(s => s.id === shootId)
    if (shoot?.source_content_item_id) {
      setItems(prev => prev.map(i => i.id === shoot.source_content_item_id ? { ...i, client_name: patch.client } : i))
    }
    setEditShootFor(null)
  }
```

with:

```ts
  function handleShootSaved(shootId: string, patch: { client: string; legacyTitle: string; start_time: string; notes: string | null; tags: ShootTag[]; crew: Member[] }) {
    setShoots(prev => prev.map(s => s.id === shootId ? {
      ...s,
      client: patch.client, legacyTitle: patch.legacyTitle, start_time: patch.start_time,
      notes: patch.notes, tags: patch.tags, goingByUsers: patch.crew,
    } : s))
    // A shoot spun off an Ads Video item shares its client — keep the linked item's card
    // in sync instead of leaving it stuck on the shoot's old client.
    const shoot = shoots.find(s => s.id === shootId)
    if (shoot?.source_content_item_id) {
      setItems(prev => prev.map(i => i.id === shoot.source_content_item_id ? { ...i, client_name: patch.client } : i))
    }
    setEditShootFor(null)
  }
```

- [ ] **Step 4: Update the mount sites**

Replace:

```tsx
      {editCrewFor && (
        <EditCrewModal shoot={editCrewFor} members={shootingMembers} currentUserId={currentUserId}
          onClose={() => setEditCrewFor(null)}
          onSaved={crew => handleCrewSaved(editCrewFor.id, crew)} />
      )}
      {editShootFor && (
        <EditShootModal shoot={editShootFor} clients={clients} pastClients={pastClients}
          onClose={() => setEditShootFor(null)}
          onSaved={patch => handleShootSaved(editShootFor.id, patch)} />
      )}
```

with:

```tsx
      {editShootFor && (
        <EditShootModal shoot={editShootFor} members={shootingMembers} currentUserId={currentUserId} clients={clients} pastClients={pastClients}
          onClose={() => setEditShootFor(null)}
          onSaved={patch => handleShootSaved(editShootFor.id, patch)} />
      )}
```

- [ ] **Step 5: Typecheck**

Run: `pnpm typecheck`
Expected: `EditCrewModal`/`editCrewFor` errors are gone. Remaining errors are in `ShootCardInner` and `EditContentModal` — fixed in Tasks 9-10.

- [ ] **Step 6: Commit**

```bash
git add components/media-tracker/media-tracker-client.tsx
git commit -m "feat(media-tracker): merge Edit Shoot and Who Went into a single Edit Details modal"
```

---

### Task 9: Shoot card — remove standalone crew editing, add tag pills, rename "Mark Done"

**Files:**
- Modify: `components/media-tracker/media-tracker-client.tsx` (`ShootCardInner`, its 2 kanban call sites, `CompleteShootModal`'s submit button, the Schedule tab's shoot action list)

**Interfaces:**
- Consumes: `SHOOT_TAG_CFG` (Task 6).
- Produces: `ShootCardInner` no longer takes an `onEditCrew` prop — its inline "+ Add crew" shortcut and its menu both route through `onEdit` (status-aware: Scheduled → Edit Details, Completed → Edit Completed Shoot, both already handled by the existing `handleEditShoot`).

- [ ] **Step 1: Replace `ShootCardInner`'s signature and menu construction**

Replace:

```tsx
function ShootCardInner({ shoot, isDragging, onStatus, onEditCrew, onEdit, onDelete }: {
  shoot: Shoot; isDragging?: boolean
  onStatus: (id: string, status: ShootStatus) => void
  onEditCrew?: (shoot: Shoot) => void
  onEdit?: (shoot: Shoot) => void
  onDelete?: (shoot: Shoot) => void
}) {
  const menu: CardMenuItem[] = []
  if (onEdit) menu.push({ label: "Edit shoot", icon: Pencil, onClick: () => onEdit(shoot) })
  if (onEditCrew) menu.push({ label: "Who went", icon: Users, onClick: () => onEditCrew(shoot) })
  if (onDelete) menu.push({ label: "Delete", icon: Trash2, onClick: () => onDelete(shoot), danger: true })
```

with:

```tsx
function ShootCardInner({ shoot, isDragging, onStatus, onEdit, onDelete }: {
  shoot: Shoot; isDragging?: boolean
  onStatus: (id: string, status: ShootStatus) => void
  onEdit?: (shoot: Shoot) => void
  onDelete?: (shoot: Shoot) => void
}) {
  const menu: CardMenuItem[] = []
  if (onEdit) menu.push({ label: shoot.status === "completed" ? "Edit shoot" : "Edit Details", icon: Pencil, onClick: () => onEdit(shoot) })
  if (onDelete) menu.push({ label: "Delete", icon: Trash2, onClick: () => onDelete(shoot), danger: true })
```

- [ ] **Step 2: Add the tags pill row next to the title**

Replace:

```tsx
        <div style={{ minWidth: 0 }}>
          <p className="text-[14px] font-bold leading-snug" style={{ color: "#111827", margin: 0 }}>{shoot.legacyTitle}</p>
          <p className="text-[12px]" style={{ color: "#6B7280", margin: "2px 0 0" }}>
            {shoot.client} · {fmtDate(shoot.start_time.split("T")[0])}
          </p>
        </div>
```

with:

```tsx
        <div style={{ minWidth: 0 }}>
          <p className="text-[14px] font-bold leading-snug" style={{ color: "#111827", margin: 0 }}>{shoot.legacyTitle}</p>
          <p className="text-[12px]" style={{ color: "#6B7280", margin: "2px 0 0" }}>
            {shoot.client} · {fmtDate(shoot.start_time.split("T")[0])}
          </p>
          {shoot.tags.length > 0 && (
            <div className="flex flex-wrap gap-1" style={{ marginTop: 4 }}>
              {shoot.tags.map(tag => (
                <span key={tag} className="text-[10px] font-black px-2 py-0.5 rounded-full uppercase"
                  style={{ background: `${SHOOT_TAG_CFG[tag].color}18`, color: SHOOT_TAG_CFG[tag].color }}>
                  {SHOOT_TAG_CFG[tag].label}
                </span>
              ))}
            </div>
          )}
        </div>
```

- [ ] **Step 3: Route the inline crew section through `onEdit`**

Replace:

```tsx
      {onEditCrew && (
        <div style={{ marginTop: 8 }}>
          <span className="text-[11px] font-bold uppercase tracking-[0.06em]" style={{ color: "#9CA3AF" }}>Who went</span>
          {shoot.goingByUsers.length === 0 ? (
            <button onPointerDown={e => e.stopPropagation()} onClick={() => onEditCrew(shoot)}
              className="block text-[12px] font-bold"
              style={{ marginTop: 3, background: "none", border: "none", padding: 0, cursor: "pointer", color: accentDark }}>
              + Add crew
            </button>
```

with:

```tsx
      {onEdit && (
        <div style={{ marginTop: 8 }}>
          <span className="text-[11px] font-bold uppercase tracking-[0.06em]" style={{ color: "#9CA3AF" }}>Who went</span>
          {shoot.goingByUsers.length === 0 ? (
            <button onPointerDown={e => e.stopPropagation()} onClick={() => onEdit(shoot)}
              className="block text-[12px] font-bold"
              style={{ marginTop: 3, background: "none", border: "none", padding: 0, cursor: "pointer", color: accentDark }}>
              + Add crew
            </button>
```

- [ ] **Step 4: Rename "Mark Done" to "Shoot Done" on the card button**

Replace:

```tsx
          <button onPointerDown={e => e.stopPropagation()} onClick={() => onStatus(shoot.id, "completed")}
            className="text-[11px] font-bold px-2.5 py-1 rounded-lg hover:opacity-90"
            style={{ border: "none", background: "#15803D", color: "#fff", cursor: "pointer" }}>
            Mark Done
          </button>
```

with:

```tsx
          <button onPointerDown={e => e.stopPropagation()} onClick={() => onStatus(shoot.id, "completed")}
            className="text-[11px] font-bold px-2.5 py-1 rounded-lg hover:opacity-90"
            style={{ border: "none", background: "#15803D", color: "#fff", cursor: "pointer" }}>
            Shoot Done
          </button>
```

- [ ] **Step 5: Remove `onEditCrew` from the two real kanban call sites**

Replace (mobile column):

```tsx
              <ShootCardInner key={shoot.id} shoot={shoot} onStatus={handleShootStatus} onEditCrew={setEditCrewFor} onEdit={handleEditShoot} onDelete={handleDeleteShoot} />
```

with:

```tsx
              <ShootCardInner key={shoot.id} shoot={shoot} onStatus={handleShootStatus} onEdit={handleEditShoot} onDelete={handleDeleteShoot} />
```

Replace (desktop kanban):

```tsx
                            <ShootCardInner shoot={shoot} isDragging={shootDragId === shoot.id} onStatus={handleShootStatus} onEditCrew={setEditCrewFor} onEdit={handleEditShoot} onDelete={handleDeleteShoot} />
```

with:

```tsx
                            <ShootCardInner shoot={shoot} isDragging={shootDragId === shoot.id} onStatus={handleShootStatus} onEdit={handleEditShoot} onDelete={handleDeleteShoot} />
```

- [ ] **Step 6: Rename the `CompleteShootModal` submit button**

Replace:

```tsx
        <PrimaryButton onClick={submit} disabled={saving}>
          {saving ? "Saving…" : `Mark Done${titles.length > 0 ? ` (${titles.length} video${titles.length > 1 ? "s" : ""})` : ""}`}
        </PrimaryButton>
```

with:

```tsx
        <PrimaryButton onClick={submit} disabled={saving}>
          {saving ? "Saving…" : `Shoot Done${titles.length > 0 ? ` (${titles.length} video${titles.length > 1 ? "s" : ""})` : ""}`}
        </PrimaryButton>
```

- [ ] **Step 7: Rename the Schedule tab's "Mark Done" action**

Replace:

```tsx
          { label: "Mark Done", onClick: () => handleShootStatus(s.id, "completed") },
```

with:

```tsx
          { label: "Shoot Done", onClick: () => handleShootStatus(s.id, "completed") },
```

- [ ] **Step 8: Typecheck**

Run: `pnpm typecheck`
Expected: `ShootCardInner`/`onEditCrew` errors are gone. Remaining errors are in `EditContentModal` and `NewContentModal` — fixed in Tasks 10-11. If `Users` (the icon import) shows as unused, leave it — it is very likely still used elsewhere in this large file; confirm with a search before removing any import, do not remove it speculatively.

- [ ] **Step 9: Commit**

```bash
git add components/media-tracker/media-tracker-client.tsx
git commit -m "feat(media-tracker): show shoot tags on the card, rename Mark Done to Shoot Done"
```

---

### Task 10: Ready to Edit / Editing — Shot By multi-select, Editor available earlier

**Files:**
- Modify: `components/media-tracker/media-tracker-client.tsx` (`EditContentModal`, its mount site's `onSaved`, the content-item card's Shot By avatar display, `handleShootCompleted`)

**Interfaces:**
- Consumes: `ContentItem.shotByUsers` (Task 6), `updateContentItem`'s array-typed `shot_by` (Task 3/5).
- Produces: `EditContentModal`'s `onSaved` callback shape gains `shotByUsers?: Person[]` (replacing `shotByUser?: Person`). The Shot By field is now multi-select and only shown at `ready_to_edit`; the Editor/Designer field is now also shown at `edited`.

- [ ] **Step 1: Extend `showEditor`, add `showShotBy`**

Replace:

```tsx
  const showEditor = item.status === "on_review" || item.status === "branding_ready" || item.status === "ads_ready" || item.status === "posted"
```

with:

```tsx
  const showEditor = item.status === "edited" || item.status === "on_review" || item.status === "branding_ready" || item.status === "ads_ready" || item.status === "posted"
  // Shot By only makes sense before editing starts — once the item is Editing or later,
  // Editor is the field that matters (see showEditor above).
  const showShotBy = item.status === "ready_to_edit"
```

- [ ] **Step 2: Change the `onSaved` prop type**

Replace:

```tsx
  onSaved: (updates: {
    client_name: string; title: string; content_type: "video" | "poster"; shot_date: string; notes: string
    ready_platforms: Platform[]; scheduled_post_date: string; scheduled_post_time: string
    editedByUser?: Person; edited_date?: string; edited_drive_link?: string; shotByUser?: Person; cancelled_by?: CancelledBy
  }) => void
```

with:

```tsx
  onSaved: (updates: {
    client_name: string; title: string; content_type: "video" | "poster"; shot_date: string; notes: string
    ready_platforms: Platform[]; scheduled_post_date: string; scheduled_post_time: string
    editedByUser?: Person; edited_date?: string; edited_drive_link?: string; shotByUsers?: Person[]; cancelled_by?: CancelledBy
  }) => void
```

- [ ] **Step 3: Change the `shotBy` state to an array, add a toggle function**

Replace:

```tsx
  const [shotBy, setShotBy] = useState(item.shotByUser?.id ?? "")
```

with:

```tsx
  const [shotBy, setShotBy] = useState<string[]>(item.shotByUsers?.map(u => u.id) ?? [])
```

Replace:

```tsx
  function togglePlatform(p: Platform) {
    setPlatforms(prev => prev.includes(p) ? prev.filter(x => x !== p) : [...prev, p])
  }
```

with:

```tsx
  function togglePlatform(p: Platform) {
    setPlatforms(prev => prev.includes(p) ? prev.filter(x => x !== p) : [...prev, p])
  }
  function toggleShotBy(id: string) {
    setShotBy(prev => prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id])
  }
```

- [ ] **Step 4: Update `submit()`'s payload and `onSaved()` call**

Replace:

```tsx
    const res = await updateContentItem(item.id, {
      client_name: client, title: title.trim(), content_type: contentType, shot_date: shotDate, notes: notes.trim() || undefined,
      shot_by: shotBy || undefined,
      edited_by: showEditor ? (editedBy || undefined) : undefined,
```

with:

```tsx
    const res = await updateContentItem(item.id, {
      client_name: client, title: title.trim(), content_type: contentType, shot_date: shotDate, notes: notes.trim() || undefined,
      shot_by: showShotBy ? shotBy : undefined,
      edited_by: showEditor ? (editedBy || undefined) : undefined,
```

Replace:

```tsx
      shotByUser: shootingMembers.find(m => m.id === shotBy) ?? null,
```

with:

```tsx
      shotByUsers: showShotBy ? shootingMembers.filter(m => shotBy.includes(m.id)) : undefined,
```

- [ ] **Step 5: Replace the Shot Date + Shot By render block**

Replace:

```tsx
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
          <div>
            <label style={LABEL}>{contentType === "poster" ? "Created Date" : "Shot Date"}</label>
            <input type="date" style={FIELD} value={shotDate} onChange={e => setShotDate(e.target.value)} />
          </div>
          <div>
            <label style={LABEL}>{contentType === "poster" ? "Designed By" : "Shot By"}</label>
            <select style={{ ...FIELD, cursor: "pointer" }} value={shotBy} onChange={e => setShotBy(e.target.value)}>
              <option value="">— Not set —</option>
              {shootingMembers.map(m => <option key={m.id} value={m.id}>{upper(m.name)}</option>)}
            </select>
          </div>
        </div>
```

with:

```tsx
        <div>
          <label style={LABEL}>{contentType === "poster" ? "Created Date" : "Shot Date"}</label>
          <input type="date" style={FIELD} value={shotDate} onChange={e => setShotDate(e.target.value)} />
        </div>
        {showShotBy && (
          <div>
            <label style={LABEL}>Shot By <span style={{ fontWeight: 600, textTransform: "none" }}>(pick one or more)</span></label>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
              {shootingMembers.map(m => {
                const on = shotBy.includes(m.id)
                return (
                  <button key={m.id} type="button" onClick={() => toggleShotBy(m.id)}
                    style={{ display: "flex", alignItems: "center", gap: 5, padding: "6px 12px", borderRadius: 10, border: `1.5px solid ${on ? "#3B82F6" : "#E5E7EB"}`, background: on ? "rgba(59,130,246,0.08)" : "#fff", color: on ? "#3B82F6" : "#6B7280", fontSize: 11, fontWeight: 700, cursor: "pointer" }}>
                    {on && <Check size={11} />} {upper(m.name)}
                  </button>
                )
              })}
            </div>
          </div>
        )}
```

- [ ] **Step 6: Update the caller's `onSaved` handler**

Replace:

```tsx
              shotByUser: updates.shotByUser !== undefined ? updates.shotByUser : i.shotByUser,
```

with:

```tsx
              shotByUsers: updates.shotByUsers !== undefined ? updates.shotByUsers : i.shotByUsers,
```

- [ ] **Step 7: Update the content-item kanban card's Shot By avatar display**

Replace:

```tsx
        {item.shotByUser && (
          <div className="flex items-center gap-1" title={`Shot by ${item.shotByUser.name}`}>
            <div className="w-5 h-5 rounded-full flex items-center justify-center text-[9px] font-black flex-shrink-0" style={{ background: typeAccentDark, color: "#fff" }}>
              {initials(item.shotByUser.name)}
            </div>
          </div>
        )}
```

with:

```tsx
        {item.shotByUsers && item.shotByUsers.length > 0 && (
          <div className="flex items-center -space-x-1.5">
            {item.shotByUsers.map(u => (
              <div key={u.id} className="w-5 h-5 rounded-full flex items-center justify-center text-[9px] font-black flex-shrink-0" title={`Shot by ${u.name}`}
                style={{ background: typeAccentDark, color: "#fff", border: "1.5px solid #fff" }}>
                {initials(u.name)}
              </div>
            ))}
          </div>
        )}
```

- [ ] **Step 8: Populate `shotByUsers` optimistically when a shoot completes**

Replace:

```ts
    const newItems: ContentItem[] = created.map(ci => ({
      id: ci.id, client_name: ci.client_name, title: ci.title, content_type: "video", source: "shoot",
      status: "ready_to_edit", shot_date: ci.shot_date, edited_date: null, notes: ci.notes,
      ready_platforms: [], scheduled_post_date: null, scheduled_post_time: null, corrections: [],
      hook_count: null, use_for: [], priority: null, shoot_type: null, voiceover_date: null, reviewed_at: null,
      posted_branding: false, posted_ads: false, cancelled_by: null, edited_drive_link: null, is_promotion: false,
      created_at: new Date().toISOString(), posts: [],
    }))
```

with:

```ts
    const newItems: ContentItem[] = created.map(ci => ({
      id: ci.id, client_name: ci.client_name, title: ci.title, content_type: "video", source: "shoot",
      status: "ready_to_edit", shot_date: ci.shot_date, edited_date: null, notes: ci.notes,
      ready_platforms: [], scheduled_post_date: null, scheduled_post_time: null, corrections: [],
      hook_count: null, use_for: [], priority: null, shoot_type: null, voiceover_date: null, reviewed_at: null,
      posted_branding: false, posted_ads: false, cancelled_by: null, edited_drive_link: null, is_promotion: false,
      shotByUsers: crew.length > 0 ? crew : undefined,
      created_at: new Date().toISOString(), posts: [],
    }))
```

- [ ] **Step 9: Typecheck**

Run: `pnpm typecheck`
Expected: `EditContentModal`/`shotByUser` errors are gone. Remaining errors are in `NewContentModal` — fixed in Task 11.

- [ ] **Step 10: Commit**

```bash
git add components/media-tracker/media-tracker-client.tsx
git commit -m "feat(media-tracker): Shot By becomes multi-select and Ready-to-Edit-only, Editor available from Editing stage"
```

---

### Task 11: New Content Item — Posted By field

**Files:**
- Modify: `components/media-tracker/media-tracker-client.tsx` (`NewContentModal`)

**Interfaces:**
- Consumes: `createContentItemSchema`'s `posted_by` field (Task 3), `createContentItem`'s use of it (Task 5).
- Produces: none consumed elsewhere — this is the last construction site.

- [ ] **Step 1: Add `postedBy` state**

Replace:

```tsx
  const [editedBy, setEditedBy] = useState("")
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  function togglePlatform(p: Platform) {
```

with:

```tsx
  const [editedBy, setEditedBy] = useState("")
  const [postedBy, setPostedBy] = useState("")
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  function togglePlatform(p: Platform) {
```

- [ ] **Step 2: Pass `posted_by` to `createContentItem`, and set `postedByUser` on the optimistic posts**

Replace:

```tsx
    const res = await createContentItem({
      client_name: client, title: title.trim(), content_type: contentType, shot_date: shotDate, notes: notes.trim() || undefined,
      posted_platforms: alreadyPosted ? postedPlatforms : undefined,
      posted_date: alreadyPosted ? postedDate : undefined,
      edited_by: alreadyPosted ? (editedBy || undefined) : undefined,
      other_platform_label: alreadyPosted && postedPlatforms.includes("other") ? (otherPlatformLabel.trim() || undefined) : undefined,
    })
```

with:

```tsx
    const res = await createContentItem({
      client_name: client, title: title.trim(), content_type: contentType, shot_date: shotDate, notes: notes.trim() || undefined,
      posted_platforms: alreadyPosted ? postedPlatforms : undefined,
      posted_date: alreadyPosted ? postedDate : undefined,
      edited_by: alreadyPosted ? (editedBy || undefined) : undefined,
      posted_by: alreadyPosted ? (postedBy || undefined) : undefined,
      other_platform_label: alreadyPosted && postedPlatforms.includes("other") ? (otherPlatformLabel.trim() || undefined) : undefined,
    })
```

Replace:

```tsx
      posts: alreadyPosted ? postedPlatforms.map((platform, i) => ({
        id: `${res.id}-${i}`, content_item_id: res.id!, platform, posted_date: postedDate, post_link: null, ad_run_date: null,
        other_platform_label: platform === "other" ? (otherPlatformLabel.trim() || null) : null,
      })) : [],
```

with:

```tsx
      posts: alreadyPosted ? postedPlatforms.map((platform, i) => ({
        id: `${res.id}-${i}`, content_item_id: res.id!, platform, posted_date: postedDate, post_link: null, ad_run_date: null,
        other_platform_label: platform === "other" ? (otherPlatformLabel.trim() || null) : null,
        postedByUser: postedBy ? (members.find(m => m.id === postedBy) ?? null) : null,
      })) : [],
```

- [ ] **Step 3: Add the "Posted By" field to the form**

Replace:

```tsx
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
              <div>
                <label style={LABEL}>Posted Date *</label>
                <input type="date" style={FIELD} value={postedDate} onChange={e => setPostedDate(e.target.value)} />
              </div>
              <div>
                <label style={LABEL}>{contentType === "poster" ? "Designed By" : "Edited By"}</label>
                <select style={{ ...FIELD, cursor: "pointer" }} value={editedBy} onChange={e => setEditedBy(e.target.value)}>
                  <option value="">— Not set —</option>
                  {members.map(m => <option key={m.id} value={m.id}>{upper(m.name)}</option>)}
                </select>
              </div>
            </div>
          </div>
        )}
```

with:

```tsx
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
              <div>
                <label style={LABEL}>Posted Date *</label>
                <input type="date" style={FIELD} value={postedDate} onChange={e => setPostedDate(e.target.value)} />
              </div>
              <div>
                <label style={LABEL}>{contentType === "poster" ? "Designed By" : "Edited By"}</label>
                <select style={{ ...FIELD, cursor: "pointer" }} value={editedBy} onChange={e => setEditedBy(e.target.value)}>
                  <option value="">— Not set —</option>
                  {members.map(m => <option key={m.id} value={m.id}>{upper(m.name)}</option>)}
                </select>
              </div>
            </div>
            <div>
              <label style={LABEL}>Posted By</label>
              <select style={{ ...FIELD, cursor: "pointer" }} value={postedBy} onChange={e => setPostedBy(e.target.value)}>
                <option value="">— Not set —</option>
                {members.map(m => <option key={m.id} value={m.id}>{upper(m.name)}</option>)}
              </select>
            </div>
          </div>
        )}
```

- [ ] **Step 4: Typecheck**

Run: `pnpm typecheck`
Expected: no errors anywhere in the project. This is the last construction site — if any error remains, it means a step above was skipped.

- [ ] **Step 5: Commit**

```bash
git add components/media-tracker/media-tracker-client.tsx
git commit -m "feat(media-tracker): add Posted By to the New Content Item backfill form"
```

---

### Task 12: Full verification

**Files:** none (verification only)

**Interfaces:** none

- [ ] **Step 1: Typecheck and build**

Run: `pnpm typecheck && pnpm build`
Expected: both succeed with no errors.

- [ ] **Step 2: Run the full test suite**

Run: `pnpm test`
Expected: all tests pass, including the new `lib/shoots/shot-by.test.ts`.

- [ ] **Step 3: Manual browser verification — Shoot Tab**

Start the dev server (`pnpm dev`), open the Media Tracker's Shoots tab, and check:
- "New Shoot" shows "Schedule Date" (not "Shot Date"), and optional Tags/Crew pickers that don't block submission when left empty.
- A newly created shoot with tags selected shows the tag pills on its card.
- A Scheduled shoot's 3-dot menu shows only "Edit Details" and "Delete" (no separate "Who went"). Opening "Edit Details" shows all fields (client/title/date/time/notes/tags/crew) and saves them together.
- A Completed shoot's 3-dot menu shows only "Edit shoot" and "Delete". "Edit shoot" still opens "Edit Completed Shoot" with its own crew picker intact.
- The card button reads "Shoot Done", not "Mark Done" — on both the Scheduled column and the Schedule tab's shoot list.
- Complete a shoot with 2+ crew members selected, then open the resulting video in Ready to Edit — confirm "Shot By" shows all of them, not just one.

- [ ] **Step 4: Manual browser verification — Ready to Edit / Editing / Poster**

- On a Ready to Edit video, open "Edit details" — confirm "Shot By" is a multi-select pill picker (not a dropdown) and correctly shows the pre-filled crew.
- Move the item to Editing, open "Edit details" again — confirm "Shot By" is gone and "Editor" is now present and editable.
- On a Poster item still in the Design stage, open "Edit details" — confirm there's no "Designed By" field at all.

- [ ] **Step 5: Manual browser verification — New Content Item**

Open "New Content Item", check "Already posted", and confirm a "Posted By" dropdown appears alongside "Posted Date" and "Edited By"/"Designed By", and that the created item's post reflects the selected person.

- [ ] **Step 6: Report completion**

If every check above passes, the implementation is complete — do not commit anything further beyond what each task already committed.
