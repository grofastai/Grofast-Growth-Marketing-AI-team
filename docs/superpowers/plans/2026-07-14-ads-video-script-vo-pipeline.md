# Ads Video (Script → Voice Over → Edit) Pipeline Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give non-shoot video its own front half of the pipeline (Scripting → Voice Over), converge it with shoot video into one shared production board (Ready to Edit → Editing → Edited → On Review → Ready to Post → Posted), and give posters their own simpler flow (Design → Editing → Edited → On Review → Ready to Post → Posted).

**Architecture:** One `content_items.status` enum grows from 5 values to 9. A new pure module (`lib/content-tracker/pipeline-transitions.ts`, mirroring the existing `lib/shoots/status-transitions.ts` pattern) is the single source of truth for which transitions are legal and which stages are origin-gated; both the client's drag/drop and the server action call into it. Everything else — the Kanban primitives, modal patterns, `CardMenu`, `ClientSelector` — is reused verbatim from the existing Tracker.

**Tech Stack:** Next.js 15 Server Actions, Supabase (Postgres + RLS), Zod, `@dnd-kit/core`, Vitest.

## Global Constraints

- Spec: `docs/superpowers/specs/2026-07-14-ads-video-script-vo-pipeline-design.md` — every requirement in it must map to a task below.
- Never push to `master`. The final task pushes to `sajee` only, and only after asking "sajee or master?" per standing workflow — do not push without that confirmation.
- Do not touch anything under `mode === "ads"` (the Campaign/budget restructure is separate, owned work).
- Every UI change must keep desktop and mobile in sync (the existing mobile column-switcher + desktop kanban split).
- Internal brands (GROFAST DIGITAL, KARTHICK BRANDS, GROFAST AI) stay pinned first in every client dropdown — this falls out for free from reusing `ClientSelector`/`buildClientOptions`, don't hand-rolled a new picker.
- The voice-over freelancer list is always sourced live from `freelancers WHERE team = 'Freelance RJ Voiceover' AND status = 'active'` — never hardcoded.
- Follow TDD for both pure modules (Task 1, Task 7): write the failing test, run it, implement, run again.

---

### Task 1: Pipeline transitions — pure module

**Files:**
- Create: `lib/content-tracker/pipeline-transitions.ts`
- Test: `lib/content-tracker/pipeline-transitions.test.ts`

**Interfaces:**
- Produces: `ContentPipelineStatus` (9-value union), `ContentSource` (`'shoot'|'ads_video'|'poster'`), `isValidPipelineTransition(from, to): boolean`, `isStatusAllowedForSource(status, source): boolean`, `entryStatusForSource(source): ContentPipelineStatus`. Every later task that touches status transitions (Task 4, Task 9, Task 11) imports from this module.

- [ ] **Step 1: Write the failing test**

```typescript
// lib/content-tracker/pipeline-transitions.test.ts
import { describe, it, expect } from 'vitest'
import { isValidPipelineTransition, isStatusAllowedForSource, entryStatusForSource } from './pipeline-transitions'

describe('isValidPipelineTransition', () => {
  it('allows the ads-video front half: scripting -> voiceover -> ready_to_edit', () => {
    expect(isValidPipelineTransition('scripting', 'voiceover')).toBe(true)
    expect(isValidPipelineTransition('voiceover', 'ready_to_edit')).toBe(true)
  })
  it('allows the poster front half: design -> editing', () => {
    expect(isValidPipelineTransition('design', 'editing')).toBe(true)
  })
  it('allows the shared production chain', () => {
    expect(isValidPipelineTransition('ready_to_edit', 'editing')).toBe(true)
    expect(isValidPipelineTransition('editing', 'edited')).toBe(true)
    expect(isValidPipelineTransition('edited', 'on_review')).toBe(true)
    expect(isValidPipelineTransition('ready_to_post', 'posted')).toBe(true)
  })
  it('on_review branches two ways: approve to ready_to_post, or bounce back to editing', () => {
    expect(isValidPipelineTransition('on_review', 'ready_to_post')).toBe(true)
    expect(isValidPipelineTransition('on_review', 'editing')).toBe(true)
  })
  it('rejects skipping a stage', () => {
    expect(isValidPipelineTransition('ready_to_edit', 'edited')).toBe(false)
    expect(isValidPipelineTransition('scripting', 'ready_to_edit')).toBe(false)
    expect(isValidPipelineTransition('edited', 'ready_to_post')).toBe(false)
  })
  it('rejects posted -> anything (terminal state)', () => {
    expect(isValidPipelineTransition('posted', 'editing')).toBe(false)
    expect(isValidPipelineTransition('posted', 'ready_to_post')).toBe(false)
  })
  it('rejects a status transitioning to itself', () => {
    expect(isValidPipelineTransition('editing', 'editing')).toBe(false)
  })
})

describe('isStatusAllowedForSource', () => {
  it('scripting and voiceover are only reachable by ads_video items', () => {
    expect(isStatusAllowedForSource('scripting', 'ads_video')).toBe(true)
    expect(isStatusAllowedForSource('scripting', 'shoot')).toBe(false)
    expect(isStatusAllowedForSource('voiceover', 'poster')).toBe(false)
  })
  it('design is only reachable by poster items', () => {
    expect(isStatusAllowedForSource('design', 'poster')).toBe(true)
    expect(isStatusAllowedForSource('design', 'shoot')).toBe(false)
    expect(isStatusAllowedForSource('design', 'ads_video')).toBe(false)
  })
  it('shared stages are reachable by every source', () => {
    for (const source of ['shoot', 'ads_video', 'poster'] as const) {
      expect(isStatusAllowedForSource('editing', source)).toBe(true)
      expect(isStatusAllowedForSource('on_review', source)).toBe(true)
      expect(isStatusAllowedForSource('posted', source)).toBe(true)
    }
  })
})

describe('entryStatusForSource', () => {
  it('a shoot enters at ready_to_edit', () => {
    expect(entryStatusForSource('shoot')).toBe('ready_to_edit')
  })
  it('an ads video enters at scripting', () => {
    expect(entryStatusForSource('ads_video')).toBe('scripting')
  })
  it('a poster enters at design', () => {
    expect(entryStatusForSource('poster')).toBe('design')
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm test lib/content-tracker/pipeline-transitions.test.ts`
Expected: FAIL — `Cannot find module './pipeline-transitions'`

- [ ] **Step 3: Write the implementation**

```typescript
// lib/content-tracker/pipeline-transitions.ts
// Single source of truth for the Tracker's status graph — mirrors the shape of
// lib/shoots/status-transitions.ts. Both the client (drag/drop) and the server action
// (updateContentItemStatus) call into this so a bad drag and a bad direct API call are
// rejected identically.
export type ContentPipelineStatus =
  | 'scripting' | 'voiceover' | 'design' | 'ready_to_edit'
  | 'editing' | 'edited' | 'on_review' | 'ready_to_post' | 'posted'

export type ContentSource = 'shoot' | 'ads_video' | 'poster'

const TRANSITIONS: Record<ContentPipelineStatus, ContentPipelineStatus[]> = {
  scripting: ['voiceover'],
  voiceover: ['ready_to_edit'],
  design: ['editing'],
  ready_to_edit: ['editing'],
  editing: ['edited'],
  edited: ['on_review'],
  // The review gate: approve moves it on, a correction sends it back to the editor.
  on_review: ['ready_to_post', 'editing'],
  ready_to_post: ['posted'],
  posted: [],
}

export function isValidPipelineTransition(from: ContentPipelineStatus, to: ContentPipelineStatus): boolean {
  return TRANSITIONS[from].includes(to)
}

const ENTRY_STATUS: Record<ContentSource, ContentPipelineStatus> = {
  shoot: 'ready_to_edit',
  ads_video: 'scripting',
  poster: 'design',
}

export function entryStatusForSource(source: ContentSource): ContentPipelineStatus {
  return ENTRY_STATUS[source]
}

// scripting/voiceover exist only for the ads-video front half; design only for posters.
// Every other stage is shared and reachable regardless of where the item came from.
const SOURCE_ONLY_STATUS: Partial<Record<ContentPipelineStatus, ContentSource>> = {
  scripting: 'ads_video',
  voiceover: 'ads_video',
  design: 'poster',
}

export function isStatusAllowedForSource(status: ContentPipelineStatus, source: ContentSource): boolean {
  const restriction = SOURCE_ONLY_STATUS[status]
  return restriction === undefined || restriction === source
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm test lib/content-tracker/pipeline-transitions.test.ts`
Expected: PASS (16 tests)

- [ ] **Step 5: Commit**

```bash
git add lib/content-tracker/pipeline-transitions.ts lib/content-tracker/pipeline-transitions.test.ts
git commit -m "feat(content-tracker): pipeline status-transition module for Ads Video"
```

---

### Task 2: Database migration — status rename + new columns

**Files:**
- Create: `supabase/migrations/096_ads_video_pipeline.sql`

**Interfaces:**
- Produces: the 9-value `content_items_status_check` constraint, and columns `source`, `hook_count`, `use_for`, `priority`, `scripted_by`, `voiceover_by`, `voiceover_date`, `reviewed_by`, `reviewed_at` on `content_items`. Task 6 (data layer) selects these; Task 4 (actions) writes them.

- [ ] **Step 1: Write the migration**

```sql
-- supabase/migrations/096_ads_video_pipeline.sql
--
-- Ads Video pipeline: non-shoot video gets a front half (Scripting -> Voice Over) that
-- converges with shoot video at Ready to Edit, plus a new On Review gate before Ready to
-- Post. Two existing statuses are renamed (not just relabelled — the check constraint
-- enumerates them, so old rows must be remapped before the new constraint can land).
--
-- Ordering matters: drop the old constraint, remap rows, THEN add the new constraint —
-- doing it the other way rejects the UPDATE against the old constraint.
alter table content_items drop constraint if exists content_items_status_check;

update content_items set status = 'ready_to_edit' where status = 'shot';
update content_items set status = 'ready_to_post' where status = 'ready';

alter table content_items add constraint content_items_status_check
  check (status in (
    'scripting', 'voiceover', 'design', 'ready_to_edit',
    'editing', 'edited', 'on_review', 'ready_to_post', 'posted'
  ));

alter table content_items alter column status set default 'ready_to_edit';

-- Origin: which of the three entry paths produced this item. Distinct from content_type
-- (video/poster) because video can come from either a shoot or an ads-video script.
alter table content_items add column if not exists source text not null default 'shoot'
  check (source in ('shoot', 'ads_video', 'poster'));
update content_items set source = 'poster' where content_type = 'poster';

-- Ads-video scripting fields.
alter table content_items add column if not exists hook_count integer;
alter table content_items add column if not exists use_for text[];
alter table content_items add column if not exists priority text
  check (priority in ('low', 'medium', 'high', 'urgent'));
alter table content_items add column if not exists scripted_by uuid references users(id) on delete set null;

-- Voice-over assignment. References freelancers, not users — the RJ Voiceover roster
-- lives in the freelancers table, not the team's own user accounts.
alter table content_items add column if not exists voiceover_by uuid references freelancers(id) on delete set null;
alter table content_items add column if not exists voiceover_date date;

-- The On Review approval — who signed off and when, distinct from edited_by/edited_date
-- (the editor) and from shot_by (the shoot crew).
alter table content_items add column if not exists reviewed_by uuid references users(id) on delete set null;
alter table content_items add column if not exists reviewed_at timestamptz;
```

- [ ] **Step 2: Apply the migration**

Use the Supabase MCP `apply_migration` tool against project `bxyozelldqerlvtjwsai`, name `096_ads_video_pipeline`, with the SQL above.

- [ ] **Step 3: Verify the remap**

Run via the Supabase MCP `execute_sql` tool:

```sql
select status, source, count(*) from content_items group by status, source order by status;
```

Expected: no rows with `status` in (`shot`, `ready`) — those values no longer exist. The 22 previously-`shot` video rows now show `status = 'ready_to_edit', source = 'shoot'`. The 1 poster row shows `source = 'poster'`.

- [ ] **Step 4: Commit**

```bash
git add supabase/migrations/096_ads_video_pipeline.sql
git commit -m "feat(content-tracker): migrate content_items to the 9-stage pipeline"
```

---

### Task 3: Validation schemas

**Files:**
- Modify: `lib/validations/content-tracker.ts`

**Interfaces:**
- Consumes: nothing new.
- Produces: `CONTENT_STATUSES` (9 values), `USE_FOR_OPTIONS`, `PRIORITY_LEVELS`, `createAdsVideoScriptSchema`/`CreateAdsVideoScriptInput`, `recordVoiceOverSchema`/`RecordVoiceOverInput`. Task 4 imports all of these.

- [ ] **Step 1: Replace the status/platform constant block**

In `lib/validations/content-tracker.ts:3-7`, replace:

```typescript
export const CONTENT_STATUSES = ['shot', 'editing', 'edited', 'ready', 'posted'] as const
export const CONTENT_TYPES    = ['video', 'poster'] as const
export const PLATFORMS        = ['instagram', 'youtube', 'facebook', 'linkedin', 'gmb'] as const
export const TARGETING_TYPES  = ['broad', 'interest', 'lookalike', 'retargeting'] as const
export const AD_STATUSES      = ['active', 'paused', 'testing', 'stopped'] as const
```

with:

```typescript
export const CONTENT_STATUSES = [
  'scripting', 'voiceover', 'design', 'ready_to_edit',
  'editing', 'edited', 'on_review', 'ready_to_post', 'posted',
] as const
export const CONTENT_TYPES    = ['video', 'poster'] as const
export const CONTENT_SOURCES  = ['shoot', 'ads_video', 'poster'] as const
export const PLATFORMS        = ['instagram', 'youtube', 'facebook', 'linkedin', 'gmb'] as const
// What an Ads Video script is intended for — the same platform set plus "ads" itself,
// since a script can be written purely for a paid ad with no organic platform attached.
export const USE_FOR_OPTIONS  = ['ads', 'instagram', 'youtube', 'facebook', 'linkedin', 'gmb'] as const
export const PRIORITY_LEVELS  = ['low', 'medium', 'high', 'urgent'] as const
export const TARGETING_TYPES  = ['broad', 'interest', 'lookalike', 'retargeting'] as const
export const AD_STATUSES      = ['active', 'paused', 'testing', 'stopped'] as const
```

- [ ] **Step 2: Add the two new schemas**

Append to `lib/validations/content-tracker.ts`, after `requestCorrectionSchema` (currently ending at line 77):

```typescript
// Scripting is where an Ads Video starts — no shoot, no shot_date.
export const createAdsVideoScriptSchema = z.object({
  client_name: z.string().min(1, 'Client is required'),
  title:       z.string().min(1, 'Title is required'),
  hook_count:  z.number().int().min(0).default(0),
  use_for:     z.array(z.enum(USE_FOR_OPTIONS)).min(1, 'Pick at least one'),
  priority:    z.enum(PRIORITY_LEVELS).default('medium'),
  notes:       z.string().optional(),
})
export type CreateAdsVideoScriptInput = z.infer<typeof createAdsVideoScriptSchema>

// Assigning the recorded voice-over — who, and when. Moves the item to "voiceover".
export const recordVoiceOverSchema = z.object({
  content_item_id: z.string().uuid(),
  voiceover_by:    z.string().uuid(),
  voiceover_date:  z.string().min(1, 'Date is required'),
})
export type RecordVoiceOverInput = z.infer<typeof recordVoiceOverSchema>

// Editing an Ads Video's scripting details — same field set as creation, minus status.
// Deliberately separate from updateContentItemSchema (which has shot_date, meaningless
// for an ads-video item) rather than bolting these fields on there.
export const updateAdsVideoScriptSchema = z.object({
  content_item_id: z.string().uuid(),
  client_name:     z.string().min(1, 'Client is required'),
  title:           z.string().min(1, 'Title is required'),
  hook_count:      z.number().int().min(0).default(0),
  use_for:         z.array(z.enum(USE_FOR_OPTIONS)).min(1, 'Pick at least one'),
  priority:        z.enum(PRIORITY_LEVELS).default('medium'),
  notes:           z.string().optional(),
})
export type UpdateAdsVideoScriptInput = z.infer<typeof updateAdsVideoScriptSchema>
```

- [ ] **Step 3: Typecheck**

Run: `pnpm typecheck`
Expected: new errors in `lib/actions/content-tracker.ts` and `components/content-tracker/content-tracker-client.tsx` (they still reference the old 5-value status union) — that's expected, fixed in Tasks 4 and 8-11. No errors should appear anywhere else yet.

- [ ] **Step 4: Commit**

```bash
git add lib/validations/content-tracker.ts
git commit -m "feat(content-tracker): validation schemas for the 9-stage pipeline"
```

---

### Task 4: Server actions — `lib/actions/content-tracker.ts`

**Files:**
- Modify: `lib/actions/content-tracker.ts`

**Interfaces:**
- Consumes: `isValidPipelineTransition`, `type ContentPipelineStatus` from `@/lib/content-tracker/pipeline-transitions` (Task 1); `createAdsVideoScriptSchema`, `recordVoiceOverSchema`, `updateAdsVideoScriptSchema`, and their input types (Task 3).
- Produces: `updateContentItemStatus` now validates transitions and accepts the 9-value union; `markReadyToPost` stamps `reviewed_by`/`reviewed_at`; new `createAdsVideoScript`, `recordVoiceOver`, and `updateAdsVideoScript` actions. Task 9/11 (client) call all of these.

- [ ] **Step 1: Update imports**

In `lib/actions/content-tracker.ts:6-9`, replace:

```typescript
import {
  createContentItemSchema, updateContentItemSchema, addContentPostSchema, createAdSchema, addAdRevisionSchema, addAdPerformanceEntrySchema, markReadyToPostSchema, requestCorrectionSchema, updateAdSchema,
  type CreateContentItemInput, type UpdateContentItemInput, type AddContentPostInput, type CreateAdInput, type AddAdRevisionInput, type AddAdPerformanceEntryInput, type MarkReadyToPostInput, type RequestCorrectionInput, type UpdateAdInput,
} from '@/lib/validations/content-tracker'
```

with:

```typescript
import {
  createContentItemSchema, updateContentItemSchema, addContentPostSchema, createAdSchema, addAdRevisionSchema, addAdPerformanceEntrySchema, markReadyToPostSchema, requestCorrectionSchema, updateAdSchema, createAdsVideoScriptSchema, recordVoiceOverSchema, updateAdsVideoScriptSchema,
  type CreateContentItemInput, type UpdateContentItemInput, type AddContentPostInput, type CreateAdInput, type AddAdRevisionInput, type AddAdPerformanceEntryInput, type MarkReadyToPostInput, type RequestCorrectionInput, type UpdateAdInput, type CreateAdsVideoScriptInput, type RecordVoiceOverInput, type UpdateAdsVideoScriptInput,
} from '@/lib/validations/content-tracker'
import { isValidPipelineTransition, type ContentPipelineStatus } from '@/lib/content-tracker/pipeline-transitions'
```

- [ ] **Step 2: Route `createContentItem`'s entry stage by content type**

In `lib/actions/content-tracker.ts:43-73`, replace the body of `createContentItem` from `const isBackfillPosted` through the closing of the function:

```typescript
  const isBackfillPosted = !!(parsed.data.posted_platforms && parsed.data.posted_platforms.length > 0)
  const today = new Date().toISOString().split('T')[0]
  const shotDate = parsed.data.shot_date || today

  // Manual entry has no shoot/script behind it — video defaults to the shoot origin
  // (this modal is the backfill path for "we shot this off-book"), poster to its own.
  const source = parsed.data.content_type === 'poster' ? 'poster' : 'shoot'
  const entryStatus = parsed.data.content_type === 'poster' ? 'design' : 'ready_to_edit'

  const { data, error } = await ctx.admin.from('content_items').insert({
    company_id:   ctx.companyId,
    client_name:  parsed.data.client_name,
    title:        parsed.data.title,
    content_type: parsed.data.content_type,
    source,
    status:       isBackfillPosted ? 'posted' : entryStatus,
    shot_by:      ctx.id,
    shot_date:    shotDate,
    edited_by:    isBackfillPosted ? ctx.id : null,
    edited_date:  isBackfillPosted ? (parsed.data.posted_date || today) : null,
    notes:        parsed.data.notes || null,
    created_by:   ctx.id,
  }).select('id').single()
  if (error) return { success: false, error: error.message }

  if (isBackfillPosted) {
    const postedDate = parsed.data.posted_date || today
    const rows = parsed.data.posted_platforms!.map(platform => ({
      content_item_id: data.id, company_id: ctx.companyId, platform, posted_date: postedDate, posted_by: ctx.id,
    }))
    const { error: postsError } = await ctx.admin.from('content_item_posts').insert(rows)
    if (postsError) return { success: false, error: postsError.message }
  }

  revalidateTracker()
  return { success: true, id: data.id }
}
```

- [ ] **Step 3: Add transition validation and a fuller status union to `updateContentItemStatus`**

In `lib/actions/content-tracker.ts:175-205`, replace the whole function:

```typescript
export async function updateContentItemStatus(
  id: string,
  status: ContentPipelineStatus,
  editorId?: string
): Promise<{ success: boolean; error?: string }> {
  const ctx = await currentUser()
  if (!ctx) return { success: false, error: 'Not authenticated' }

  const { data: current } = await ctx.admin
    .from('content_items').select('status, edited_by').eq('id', id).eq('company_id', ctx.companyId).single()
  if (!current) return { success: false, error: 'Content item not found' }

  if (!isValidPipelineTransition(current.status as ContentPipelineStatus, status)) {
    return { success: false, error: `Cannot move from ${current.status} to ${status}` }
  }

  const updates: Record<string, unknown> = { status, updated_at: new Date().toISOString() }

  // Moving to Editing is where the editor is recorded — that's the accountability
  // moment ("who is starting this?"), so edited_by is set here, not on completion.
  if (status === 'editing' && editorId) {
    updates.edited_by = editorId
  }

  if (status === 'edited') {
    updates.edited_date = new Date().toISOString().split('T')[0]
    // Don't clobber the editor picked when it entered Editing. Only fall back to the
    // current user if it somehow skipped that step and has no editor recorded.
    if (!current.edited_by) updates.edited_by = ctx.id
  }

  const { error } = await ctx.admin.from('content_items').update(updates).eq('id', id).eq('company_id', ctx.companyId)
  if (error) return { success: false, error: error.message }

  revalidateTracker()
  return { success: true }
}
```

- [ ] **Step 4: Stamp the reviewer in `markReadyToPost`, rename the target status**

In `lib/actions/content-tracker.ts:162-168`, replace the update call inside `markReadyToPost`:

```typescript
  const { error } = await ctx.admin.from('content_items').update({
    status:              'ready_to_post',
    ready_platforms:     parsed.data.ready_platforms,
    scheduled_post_date: parsed.data.scheduled_post_date,
    scheduled_post_time: parsed.data.scheduled_post_time || null,
    // Reaching Ready to Post always means it was approved out of On Review — record who.
    reviewed_by:         ctx.id,
    reviewed_at:         new Date().toISOString(),
    updated_at:          new Date().toISOString(),
  }).eq('id', parsed.data.content_item_id).eq('company_id', ctx.companyId)
```

- [ ] **Step 5: Guard `requestCorrection` to only fire from On Review**

In `lib/actions/content-tracker.ts:105-150`, right after the `ctx` check (after line 112), insert:

```typescript
  const { data: current } = await ctx.admin
    .from('content_items').select('status').eq('id', parsed.data.content_item_id).eq('company_id', ctx.companyId).single()
  if (!current) return { success: false, error: 'Content item not found' }
  if (current.status !== 'on_review') {
    return { success: false, error: 'Corrections can only be requested from On Review' }
  }
```

(This runs before the `content_corrections` insert already in that function — no other lines in `requestCorrection` change.)

- [ ] **Step 6: Update the posting-log fallback status in `deleteContentPost`**

In `lib/actions/content-tracker.ts:260-266`, change the fallback status string:

```typescript
    await ctx.admin.from('content_items')
      .update({ status: item?.scheduled_post_date ? 'ready_to_post' : 'edited', updated_at: new Date().toISOString() })
      .eq('id', contentItemId)
      .eq('company_id', ctx.companyId)
```

- [ ] **Step 7: Add `createAdsVideoScript` and `recordVoiceOver`**

Append to `lib/actions/content-tracker.ts`, after `updateContentItemStatus` (after the function from Step 3):

```typescript
// ── Ads Video (Scripting -> Voice Over) ──────────────────────────────────────

export async function createAdsVideoScript(input: CreateAdsVideoScriptInput): Promise<{ success: boolean; error?: string; id?: string }> {
  const parsed = createAdsVideoScriptSchema.safeParse(input)
  if (!parsed.success) return { success: false, error: parsed.error.issues[0].message }

  const ctx = await currentUser()
  if (!ctx) return { success: false, error: 'Not authenticated' }

  const { data, error } = await ctx.admin.from('content_items').insert({
    company_id:   ctx.companyId,
    client_name:  parsed.data.client_name,
    title:        parsed.data.title,
    content_type: 'video',
    source:       'ads_video',
    status:       'scripting',
    hook_count:   parsed.data.hook_count,
    use_for:      parsed.data.use_for,
    priority:     parsed.data.priority,
    scripted_by:  ctx.id,
    notes:        parsed.data.notes || null,
    created_by:   ctx.id,
  }).select('id').single()
  if (error) return { success: false, error: error.message }

  revalidateTracker()
  return { success: true, id: data.id }
}

export async function recordVoiceOver(input: RecordVoiceOverInput): Promise<{ success: boolean; error?: string }> {
  const parsed = recordVoiceOverSchema.safeParse(input)
  if (!parsed.success) return { success: false, error: parsed.error.issues[0].message }

  const ctx = await currentUser()
  if (!ctx) return { success: false, error: 'Not authenticated' }

  const { data: current } = await ctx.admin
    .from('content_items').select('status').eq('id', parsed.data.content_item_id).eq('company_id', ctx.companyId).single()
  if (!current) return { success: false, error: 'Content item not found' }
  if (!isValidPipelineTransition(current.status as ContentPipelineStatus, 'voiceover')) {
    return { success: false, error: `Cannot move from ${current.status} to voiceover` }
  }

  const { error } = await ctx.admin.from('content_items').update({
    status:         'voiceover',
    voiceover_by:   parsed.data.voiceover_by,
    voiceover_date: parsed.data.voiceover_date,
    updated_at:     new Date().toISOString(),
  }).eq('id', parsed.data.content_item_id).eq('company_id', ctx.companyId)
  if (error) return { success: false, error: error.message }

  revalidateTracker()
  return { success: true }
}

// Edit an Ads Video's scripting details. Deliberately does NOT touch status/voiceover —
// those have their own flow, same convention as updateAd not touching an ad's status.
export async function updateAdsVideoScript(input: UpdateAdsVideoScriptInput): Promise<{ success: boolean; error?: string }> {
  const parsed = updateAdsVideoScriptSchema.safeParse(input)
  if (!parsed.success) return { success: false, error: parsed.error.issues[0].message }

  const ctx = await currentUser()
  if (!ctx) return { success: false, error: 'Not authenticated' }

  const { error } = await ctx.admin.from('content_items').update({
    client_name: parsed.data.client_name,
    title:       parsed.data.title,
    hook_count:  parsed.data.hook_count,
    use_for:     parsed.data.use_for,
    priority:    parsed.data.priority,
    notes:       parsed.data.notes || null,
    updated_at:  new Date().toISOString(),
  }).eq('id', parsed.data.content_item_id).eq('company_id', ctx.companyId)
  if (error) return { success: false, error: error.message }

  revalidateTracker()
  return { success: true }
}
```

- [ ] **Step 8: Typecheck**

Run: `pnpm typecheck`
Expected: remaining errors only in `components/content-tracker/content-tracker-client.tsx` (fixed Tasks 8-11) and `lib/actions/shoots.ts` / `lib/data/content-tracker.ts` (fixed Tasks 5-6).

- [ ] **Step 9: Commit**

```bash
git add lib/actions/content-tracker.ts
git commit -m "feat(content-tracker): server actions for the 9-stage pipeline and Ads Video"
```

---

### Task 5: Server actions — `lib/actions/shoots.ts`

**Files:**
- Modify: `lib/actions/shoots.ts`

**Interfaces:**
- Produces: shoot completion now creates `content_items` at `status: 'ready_to_edit', source: 'shoot'` instead of `status: 'shot'`.

- [ ] **Step 1: Update `CreatedShootItem` and both insert sites**

In `lib/actions/shoots.ts:74-77`, change the type:

```typescript
export type CreatedShootItem = {
  id: string; shoot_title_id: string; client_name: string; title: string
  content_type: 'video'; status: 'ready_to_edit'; shot_date: string | null; notes: string | null
}
```

In `lib/actions/shoots.ts:116-128` (inside `updateShootStatus`), change the insert:

```typescript
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

and the `createdItems.push` a few lines below (line ~140-149) — change `status: 'shot'` to `status: 'ready_to_edit'`.

In `lib/actions/shoots.ts:247-258` (inside `completeShootWithTitles`), same two changes: add `source: 'shoot'` to the insert rows and change `status: 'shot'` to `status: 'ready_to_edit'`; and in the `createdItems.push` at line ~262-277, change `status: 'shot'` to `status: 'ready_to_edit'`.

- [ ] **Step 2: Typecheck**

Run: `pnpm typecheck`
Expected: no errors in this file.

- [ ] **Step 3: Commit**

```bash
git add lib/actions/shoots.ts
git commit -m "feat(content-tracker): shoot completion creates items at ready_to_edit"
```

---

### Task 6: Data layer — `lib/data/content-tracker.ts`

**Files:**
- Modify: `lib/data/content-tracker.ts`

**Interfaces:**
- Consumes: `ContentItem` type from `components/content-tracker/content-tracker-client.tsx` (Task 8 must land first, or this task's TS errors are expected until then — apply this task's code changes regardless, since the shape is being co-designed).
- Produces: `getContentTrackerData` return type grows a `voiceoverFreelancers: { id: string; name: string }[]` field; `ContentItem` mapping includes the 9 new fields. Task 12 (page wiring) consumes `voiceoverFreelancers`.

- [ ] **Step 1: Fetch freelancers alongside the existing queries**

In `lib/data/content-tracker.ts:15-28`, replace the function signature and the `Promise.all`:

```typescript
export async function getContentTrackerData(companyId: string): Promise<{
  items: ContentItem[]; ads: Ad[]; shoots: Shoot[]; members: { id: string; name: string }[]
  voiceoverFreelancers: { id: string; name: string }[]
}> {
  const admin = adminSupabase()

  const [itemsRes, postsRes, usersRes, adsRes, revisionsRes, performanceRes, shootsRes, shootTitlesRes, correctionsRes, freelancersRes] = await Promise.all([
    admin.from('content_items').select('*').eq('company_id', companyId).order('created_at', { ascending: false }),
    admin.from('content_item_posts').select('*').eq('company_id', companyId).order('posted_date', { ascending: false }),
    admin.from('users').select('id, name').eq('company_id', companyId),
    admin.from('ads_tracker').select('*').eq('company_id', companyId).order('created_at', { ascending: false }),
    admin.from('ad_revisions').select('*').eq('company_id', companyId).order('revision_date', { ascending: false }),
    admin.from('ad_performance_entries').select('*').eq('company_id', companyId).order('entry_date', { ascending: false }),
    admin.from('shoots').select('id, title, client, start_time, notes, status, going_by').eq('company_id', companyId).order('start_time', { ascending: false }),
    admin.from('shoot_titles').select('id, shoot_id, title, content_item_id').eq('company_id', companyId),
    admin.from('content_corrections').select('*').eq('company_id', companyId).order('correction_date', { ascending: false }),
    admin.from('freelancers').select('id, name, team, status').eq('company_id', companyId),
  ])
```

- [ ] **Step 2: Widen `ItemRow` and add a freelancer map**

In `lib/data/content-tracker.ts:30-38`, replace the `ItemRow` type and add a `FreelancerRow` type:

```typescript
  type ItemRow = {
    id: string; client_name: string; title: string; content_type: 'video' | 'poster'
    status: 'scripting' | 'voiceover' | 'design' | 'ready_to_edit' | 'editing' | 'edited' | 'on_review' | 'ready_to_post' | 'posted'
    source: 'shoot' | 'ads_video' | 'poster'
    shot_by: string | null; shot_date: string | null; edited_by: string | null; edited_date: string | null
    notes: string | null; created_at: string
    ready_platforms: string[] | null; scheduled_post_date: string | null; scheduled_post_time: string | null
    hook_count: number | null; use_for: string[] | null; priority: string | null
    scripted_by: string | null; voiceover_by: string | null; voiceover_date: string | null
    reviewed_by: string | null; reviewed_at: string | null
  }
  type FreelancerRow = { id: string; name: string; team: string | null; status: string }
```

Below the existing `type PostRow = ...` through `type CorrectionRow = ...` block (lines 31-38), leave those unchanged.

- [ ] **Step 3: Build the freelancer maps**

In `lib/data/content-tracker.ts:40-48`, add after the existing row destructuring:

```typescript
  const freelancerRows = (freelancersRes.data ?? []) as FreelancerRow[]
```

In `lib/data/content-tracker.ts:50` (right after `const userMap = ...`), add:

```typescript
  const freelancerMap = new Map(freelancerRows.map(f => [f.id, f]))
  // The live voice-over roster for the picker — active RJ Voiceover freelancers only.
  const voiceoverFreelancers = freelancerRows
    .filter(f => f.team === 'Freelance RJ Voiceover' && f.status === 'active')
    .map(f => ({ id: f.id, name: f.name }))
    .sort((a, b) => a.name.localeCompare(b.name))
```

- [ ] **Step 4: Map the new fields onto `ContentItem`**

In `lib/data/content-tracker.ts:77-104`, replace the `items` mapping:

```typescript
  const items: ContentItem[] = itemRows.map(row => ({
    id: row.id,
    client_name: row.client_name,
    title: row.title,
    content_type: row.content_type,
    status: row.status,
    source: row.source,
    shot_date: row.shot_date,
    edited_date: row.edited_date,
    notes: row.notes,
    created_at: row.created_at,
    ready_platforms: (row.ready_platforms ?? []) as ContentItem['ready_platforms'],
    scheduled_post_date: row.scheduled_post_date,
    scheduled_post_time: row.scheduled_post_time,
    hook_count: row.hook_count,
    use_for: (row.use_for ?? []) as ContentItem['use_for'],
    priority: row.priority as ContentItem['priority'],
    voiceover_date: row.voiceover_date,
    reviewed_at: row.reviewed_at,
    shotByUser: row.shot_by ? (userMap.get(row.shot_by) ?? null) : null,
    editedByUser: row.edited_by ? (userMap.get(row.edited_by) ?? null) : null,
    scriptedByUser: row.scripted_by ? (userMap.get(row.scripted_by) ?? null) : null,
    reviewedByUser: row.reviewed_by ? (userMap.get(row.reviewed_by) ?? null) : null,
    voiceoverBy: row.voiceover_by ? (freelancerMap.get(row.voiceover_by) ? { id: row.voiceover_by, name: freelancerMap.get(row.voiceover_by)!.name } : null) : null,
    corrections: (correctionsByItem.get(row.id) ?? []).map(c => ({
      id: c.id,
      content_item_id: c.content_item_id,
      correction_date: c.correction_date,
      notes: c.notes,
      requestedByUser: c.requested_by ? (userMap.get(c.requested_by) ?? null) : null,
      assignedToUser: c.assigned_to ? (userMap.get(c.assigned_to) ?? null) : null,
    })),
    posts: (postsByItem.get(row.id) ?? []).map(p => ({
      id: p.id, content_item_id: p.content_item_id, platform: p.platform, posted_date: p.posted_date, post_link: p.post_link,
      postedByUser: p.posted_by ? (userMap.get(p.posted_by) ?? null) : null,
    })),
  }))
```

- [ ] **Step 5: Return `voiceoverFreelancers`**

In `lib/data/content-tracker.ts:136-139`, replace the return statement:

```typescript
  const members = userRows.map(u => ({ id: u.id, name: u.name })).sort((a, b) => a.name.localeCompare(b.name))

  return { items, ads, shoots, members, voiceoverFreelancers }
}
```

- [ ] **Step 6: Commit**

```bash
git add lib/data/content-tracker.ts
git commit -m "feat(content-tracker): fetch and map the new pipeline fields + voiceover roster"
```

(Typecheck for this file will still show errors against `ContentItem` until Task 8 lands — that's expected; both tasks touch the same type and are being landed as a pair. Run `pnpm typecheck` again at the end of Task 8 to confirm both are clean together.)

---

### Task 7: Overview pure module — full rewrite

**Files:**
- Modify: `lib/content-tracker/overview.ts`
- Modify: `lib/content-tracker/overview.test.ts`

**Interfaces:**
- Produces: `OverviewStatus` (9 values), `OverviewItem` (adds `source`, `voiceover_date`, `created_at`), `StageCounts` (9 keys), two new `AttentionKind`s (`'awaiting-review'`, `'in-scripting'`). Task 13 (Overview tab UI) consumes `Overview`.

- [ ] **Step 1: Update the failing tests first**

Replace `lib/content-tracker/overview.test.ts` in full:

```typescript
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
  return { id: 's1', status: 'scheduled', start_time: `${TODAY}T09:00:00`, ...overrides }
}
function ad(overrides: Partial<OverviewAd> = {}): OverviewAd {
  return { id: 'a1', status: 'active', ...overrides }
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
  it('counts shoots scheduled or going today', () => {
    const o = computeOverview({
      items: [],
      shoots: [
        shoot({ id: '1', status: 'scheduled', start_time: `${TODAY}T09:00:00` }),
        shoot({ id: '2', status: 'going', start_time: `${TODAY}T14:00:00` }),
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
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `pnpm test lib/content-tracker/overview.test.ts`
Expected: FAIL — old `overview.ts` still uses the 5-value status shape.

- [ ] **Step 3: Rewrite `overview.ts`**

Replace `lib/content-tracker/overview.ts` in full:

```typescript
// Pure summary maths for the Tracker's Overview tab. Kept out of the component and
// unit-tested because the date arithmetic (overdue / this week / days-stuck) is exactly
// where off-by-one bugs silently misreport the state of the board.

export type OverviewStatus =
  | 'scripting' | 'voiceover' | 'design' | 'ready_to_edit'
  | 'editing' | 'edited' | 'on_review' | 'ready_to_post' | 'posted'
export type OverviewShootStatus = 'scheduled' | 'going' | 'completed' | 'cancelled'
export type OverviewAdStatus = 'active' | 'testing' | 'paused' | 'stopped'

// Structural, minimal input types — the client component's richer ContentItem / Shoot / Ad
// are supersets and assign to these without conversion.
export type OverviewItem = {
  id: string
  content_type: 'video' | 'poster'
  status: OverviewStatus
  source: 'shoot' | 'ads_video' | 'poster'
  shot_date: string | null
  voiceover_date: string | null
  created_at: string
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

export type AttentionKind = 'overdue' | 'stuck-editing' | 'shoots-today' | 'repeat-corrections' | 'awaiting-review' | 'in-scripting'
export type AttentionTarget = { mode: 'video' | 'poster' | 'ads'; tab: 'shoots' | 'adsvideo' | 'pipeline' | 'log' | null }
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
  return {
    scripting: 0, voiceover: 0, design: 0, ready_to_edit: 0,
    editing: 0, edited: 0, on_review: 0, ready_to_post: 0, posted: 0,
  }
}

function countStages(items: OverviewItem[], type: 'video' | 'poster'): StageCounts {
  const counts = emptyStages()
  for (const i of items) {
    if (i.content_type === type) counts[i.status]++
  }
  return counts
}

// When did this item most recently ENTER its current editing state? Takes the LATEST of
// every date that could mark that moment: shot_date (shoot origin), voiceover_date (ads-video
// origin), created_at (fallback for either), and any correction bounce. An item bounced back
// for a correction has an old shot_date but has only just re-entered Editing — using
// shot_date alone would wrongly flag it as stalled the moment someone returns it.
function editingSince(item: OverviewItem): string | null {
  const dates = [item.shot_date, item.voiceover_date, item.created_at.slice(0, 10), ...item.corrections.map(c => c.correction_date)]
    .filter((d): d is string => !!d)
  if (dates.length === 0) return null
  return dates.sort()[dates.length - 1]
}

export function computeOverview({ items, shoots, ads, today }: OverviewInput): Overview {
  const weekEnd = addDays(today, 6)

  const readyWithDate = items.filter(
    (i): i is OverviewItem & { scheduled_post_date: string } =>
      i.status === 'ready_to_post' && !!i.scheduled_post_date
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

  const awaitingReview = items.filter(i => i.status === 'on_review').length
  const inScripting = items.filter(i => i.status === 'scripting' || i.status === 'voiceover').length

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
      kind: 'awaiting-review',
      count: awaitingReview,
      label: `${awaitingReview} item${awaitingReview === 1 ? '' : 's'} awaiting review`,
      target: { mode: 'video', tab: 'pipeline' },
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
      kind: 'in-scripting',
      count: inScripting,
      label: `${inScripting} ads video${inScripting === 1 ? '' : 's'} in scripting/VO`,
      target: { mode: 'video', tab: 'adsvideo' },
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

- [ ] **Step 4: Run the tests to verify they pass**

Run: `pnpm test lib/content-tracker/overview.test.ts`
Expected: PASS (all tests)

- [ ] **Step 5: Commit**

```bash
git add lib/content-tracker/overview.ts lib/content-tracker/overview.test.ts
git commit -m "feat(content-tracker): extend Overview maths to the 9-stage pipeline"
```

---

### Task 8: Client — types and stage config

**Files:**
- Modify: `components/content-tracker/content-tracker-client.tsx`

**Interfaces:**
- Consumes: `Props` will gain `voiceoverFreelancers` (matches Task 6's data-layer return).
- Produces: `ContentStatus` (9 values), `ContentItem` (new fields), `VoiceFreelancer` type, `STATUS_CFG` (9 entries), `VIDEO_PIPELINE_ORDER`/`POSTER_PIPELINE_ORDER`/`ADS_VIDEO_ORDER`, `NEXT_STATUS`, `USE_FOR_CFG`, `PRIORITY_CFG`. Every remaining task (9-13) depends on these.

- [ ] **Step 1: Replace the status/type unions**

In `content-tracker-client.tsx:29-32`, replace:

```typescript
type Platform = "instagram" | "youtube" | "facebook" | "linkedin" | "gmb"
type ContentStatus = "shot" | "editing" | "edited" | "ready" | "posted"
type TargetingType = "broad" | "interest" | "lookalike" | "retargeting"
type AdStatus = "active" | "paused" | "testing" | "stopped"
```

with:

```typescript
type Platform = "instagram" | "youtube" | "facebook" | "linkedin" | "gmb"
type UseFor = Platform | "ads"
type Priority = "low" | "medium" | "high" | "urgent"
type ContentSource = "shoot" | "ads_video" | "poster"
type ContentStatus =
  | "scripting" | "voiceover" | "design" | "ready_to_edit"
  | "editing" | "edited" | "on_review" | "ready_to_post" | "posted"
type TargetingType = "broad" | "interest" | "lookalike" | "retargeting"
type AdStatus = "active" | "paused" | "testing" | "stopped"
```

- [ ] **Step 2: Extend `ContentItem` and add `VoiceFreelancer`**

In `content-tracker-client.tsx:54-72`, replace the `ContentItem` type:

```typescript
export type ContentItem = {
  id: string
  client_name: string
  title: string
  content_type: "video" | "poster"
  status: ContentStatus
  source: ContentSource
  shot_date: string | null
  edited_date: string | null
  notes: string | null
  created_at: string
  // Set when the item is scheduled into "Ready to Post" — the intent, not the record.
  ready_platforms: Platform[]
  scheduled_post_date: string | null
  scheduled_post_time: string | null
  // Ads Video (Scripting) fields — null/empty for shoot- and poster-sourced items.
  hook_count: number | null
  use_for: UseFor[]
  priority: Priority | null
  voiceover_date: string | null
  reviewed_at: string | null
  shotByUser?: Person
  editedByUser?: Person
  scriptedByUser?: Person
  reviewedByUser?: Person
  voiceoverBy?: { id: string; name: string } | null
  corrections: ContentCorrection[]
  posts: ContentPost[]
}

export type VoiceFreelancer = { id: string; name: string }
```

- [ ] **Step 3: Add `voiceoverFreelancers` to `Props`**

In `content-tracker-client.tsx:113-121`, replace:

```typescript
type Props = {
  initialItems: ContentItem[]
  initialAds: Ad[]
  initialShoots: Shoot[]
  members: Member[]
  currentUserId: string
  clients: { id: string; name: string }[]
  pastClients: { id: string; name: string }[]
  voiceoverFreelancers: VoiceFreelancer[]
}
```

- [ ] **Step 4: Rewrite `STATUS_CFG`/`STATUS_ORDER` into per-mode configs**

In `content-tracker-client.tsx:124-131`, replace:

```typescript
const STATUS_CFG: Record<ContentStatus, { label: string; accent: string }> = {
  scripting:     { label: "Scripting",     accent: "#F97316" },
  voiceover:     { label: "Voice Over",    accent: "#EAB308" },
  design:        { label: "Design",        accent: "#F59E0B" },
  ready_to_edit: { label: "Ready to Edit", accent: "#F59E0B" },
  editing:       { label: "Editing",       accent: "#6366F1" },
  edited:        { label: "Edited",        accent: "#9B6BFF" },
  on_review:     { label: "On Review",     accent: "#EC4899" },
  ready_to_post: { label: "Ready to Post", accent: "#0EA5E9" },
  posted:        { label: "Posted",        accent: "#22C55E" },
}
// The production board's column order — differs by content type only in its first column
// (shoot/ads-video video enters at Ready to Edit; posters enter at Design).
const VIDEO_PIPELINE_ORDER: ContentStatus[] = ["ready_to_edit", "editing", "edited", "on_review", "ready_to_post"]
const POSTER_PIPELINE_ORDER: ContentStatus[] = ["design", "editing", "edited", "on_review", "ready_to_post"]
// The Ads Video sub-tab's own two-column board — feeds INTO Ready to Edit, doesn't include it.
const ADS_VIDEO_ORDER: ContentStatus[] = ["scripting", "voiceover"]
// The default "move forward" target for the generic advance button. on_review is
// deliberately absent — it branches two ways (approve / correction) and gets its own
// two-button UI instead of a single generic button. posted is terminal.
const NEXT_STATUS: Partial<Record<ContentStatus, ContentStatus>> = {
  scripting: "voiceover",
  voiceover: "ready_to_edit",
  design: "editing",
  ready_to_edit: "editing",
  editing: "edited",
  edited: "on_review",
  ready_to_post: "posted",
}
```

- [ ] **Step 5: Add `USE_FOR_CFG` and `PRIORITY_CFG`**

In `content-tracker-client.tsx`, right after the existing `PLATFORM_CFG` block (currently lines 133-139), add:

```typescript
const USE_FOR_CFG: Record<UseFor, { label: string; color: string; icon: typeof Camera }> = {
  ...PLATFORM_CFG,
  ads: { label: "Ads", color: "#D97706", icon: Megaphone },
}

const PRIORITY_CFG: Record<Priority, { label: string; color: string }> = {
  low:    { label: "Low",    color: "#6B7280" },
  medium: { label: "Medium", color: "#3B82F6" },
  high:   { label: "High",   color: "#F59E0B" },
  urgent: { label: "Urgent", color: "#DE1A1A" },
}
```

- [ ] **Step 6: Add an origin-date helper**

Right after the existing `daysAgo` helper (currently `content-tracker-client.tsx:182-186`), add:

```typescript
// The date that anchors "how long has this been sitting here" — shot_date for shoot
// video, voiceover_date for ads video, falling back to created_at for either if neither
// is set yet (an ads-video item still in Scripting has no voiceover_date at all).
function originDate(item: ContentItem): string | null {
  return item.shot_date ?? item.voiceover_date ?? item.created_at?.slice(0, 10) ?? null
}
```

- [ ] **Step 7: Update the component's `Props` destructuring**

In `content-tracker-client.tsx:2052`, replace:

```typescript
export default function ContentTrackerClient({ initialItems, initialAds, initialShoots, members, currentUserId, clients, pastClients, voiceoverFreelancers }: Props) {
```

- [ ] **Step 8: Commit**

```bash
git add components/content-tracker/content-tracker-client.tsx
git commit -m "feat(content-tracker): client types and stage config for the 9-stage pipeline"
```

(Typecheck will still fail — the rest of the file references the old status literals and `STATUS_ORDER`, which no longer exists. That's fixed in Tasks 9-11, landed as one continuous edit to this file.)

---

### Task 9: Client — transition logic (`advance`, `handleDragEnd`, `ContentCardInner`)

**Files:**
- Modify: `components/content-tracker/content-tracker-client.tsx`

**Interfaces:**
- Consumes: `isValidPipelineTransition` from `@/lib/content-tracker/pipeline-transitions` (Task 1); `NEXT_STATUS`, `originDate`, `VIDEO_PIPELINE_ORDER`, `POSTER_PIPELINE_ORDER` (Task 8).
- Produces: `advance()` handles all 9 statuses; `on_review` gets a two-button UI; the correction button/menu-item moves from `edited` to `on_review`.

- [ ] **Step 1: Add the pipeline-transitions import**

In `content-tracker-client.tsx:25`, right after the existing `isValidShootTransition` import, add:

```typescript
import { isValidPipelineTransition } from "@/lib/content-tracker/pipeline-transitions"
```

- [ ] **Step 2: Rework `ContentCardInner`'s age calc, card menu, and action buttons**

In `content-tracker-client.tsx:352-522`, this is the full replacement for `ContentCardInner` (props signature unchanged):

```typescript
function ContentCardInner({
  item, isDraggable, isDragging, onAdvance, onDelete, onAddPlatform, onEdit, onRequestCorrection,
}: {
  item: ContentItem
  isDraggable?: boolean
  isDragging?: boolean
  onAdvance: (item: ContentItem, next: ContentStatus) => void
  onDelete: (id: string) => void
  onRequestCorrection?: (item: ContentItem) => void
  onAddPlatform: (item: ContentItem) => void
  onEdit?: (item: ContentItem) => void
}) {
  const TypeIcon = item.content_type === "video" ? Video : ImageIcon
  const age = (item.status === "ready_to_edit" || item.status === "design") ? daysAgo(originDate(item))
    : item.status === "edited" ? daysAgo(item.edited_date) : null
  const stale = age !== null && age >= 3

  // The drag overlay renders this card with no handlers, so an empty menu is expected there
  // and the kebab is simply omitted.
  const cardMenu: CardMenuItem[] = []
  if (onEdit) cardMenu.push({ label: "Edit details", icon: Pencil, onClick: () => onEdit(item) })
  if (onRequestCorrection && item.status === "on_review") {
    cardMenu.push({ label: "Needs correction", icon: RotateCcw, onClick: () => onRequestCorrection(item) })
  }
  if (onEdit) cardMenu.push({ label: "Delete", icon: Trash2, onClick: () => onDelete(item.id), danger: true })

  const next = NEXT_STATUS[item.status]

  return (
    <div className="rounded-2xl p-3.5 mb-2.5 group transition-all select-none"
      style={{
        background: isDragging ? "#F3F4F6" : "#FFFFFF",
        boxShadow: isDragging ? "0 8px 24px rgba(0,0,0,0.15)" : "0 2px 10px rgba(0,0,0,0.05)",
        border: stale ? "1px solid rgba(245,158,11,0.3)" : "1px solid transparent",
        opacity: isDragging ? 0.5 : 1,
      }}>
      <div className="flex items-start gap-2 mb-2">
        {isDraggable && (
          <span className="flex-shrink-0 mt-0.5 opacity-30 group-hover:opacity-70 transition-opacity" title="Drag anywhere on the card to move it">
            <GripVertical size={13} style={{ color: "#6B7280" }} />
          </span>
        )}
        <div style={{ width: 22, height: 22, borderRadius: 7, background: "rgba(99,102,241,0.1)", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
          <TypeIcon size={12} style={{ color: "#6366F1" }} />
        </div>
        <p className="text-[12px] font-semibold leading-snug line-clamp-2 flex-1" style={{ color: "#111111" }}>{item.title}</p>
        {cardMenu.length > 0 && <CardMenu items={cardMenu} />}
      </div>

      <div className="flex flex-wrap items-center gap-1 mb-2.5">
        <span className="text-[9px] font-medium px-1.5 py-0.5 rounded-full truncate max-w-[110px]"
          style={{ background: "rgba(99,102,241,0.08)", color: "#6366F1" }}>{item.client_name}</span>
        {item.source === "ads_video" && (
          <span className="text-[9px] font-bold px-1.5 py-0.5 rounded-full" style={{ background: "rgba(217,119,6,0.1)", color: "#D97706" }}>
            🎙️ Ads Video
          </span>
        )}
        {stale && (
          <span className="text-[9px] font-bold px-1.5 py-0.5 rounded-full ml-auto" style={{ background: "rgba(245,158,11,0.1)", color: "#D97706" }}>
            {age}d stuck
          </span>
        )}
      </div>

      {item.priority && (
        <div className="flex flex-wrap items-center gap-1 mb-2.5">
          <span className="text-[9px] font-bold px-1.5 py-0.5 rounded-full" style={{ background: `${PRIORITY_CFG[item.priority].color}18`, color: PRIORITY_CFG[item.priority].color }}>
            {PRIORITY_CFG[item.priority].label}
          </span>
          {item.hook_count !== null && (
            <span className="text-[9px] font-bold px-1.5 py-0.5 rounded-full" style={{ background: "#F3F4F6", color: "#374151" }}>
              {item.hook_count} hook{item.hook_count === 1 ? "" : "s"}
            </span>
          )}
        </div>
      )}

      {item.status === "posted" && item.posts.length > 0 && (
        <div className="flex flex-wrap items-center gap-1 mb-2.5">
          {item.posts.map(p => {
            const cfg = PLATFORM_CFG[p.platform]
            const Icon = cfg.icon
            return (
              <span key={p.id} className="flex items-center gap-1 text-[9px] font-bold px-1.5 py-0.5 rounded-full"
                style={{ background: `${cfg.color}18`, color: cfg.color }}>
                <Icon size={9} /> {cfg.label}
              </span>
            )
          })}
        </div>
      )}

      <div className="flex items-center gap-2 mb-2">
        {item.shotByUser && (
          <div className="flex items-center gap-1" title={`Shot by ${item.shotByUser.name}`}>
            <div className="w-4 h-4 rounded-full flex items-center justify-center text-[7px] font-black flex-shrink-0" style={{ background: "#F59E0B", color: "#fff" }}>
              {initials(item.shotByUser.name)}
            </div>
          </div>
        )}
        {item.voiceoverBy && (item.status === "voiceover" || item.status === "ready_to_edit") && (
          <div className="flex items-center gap-1" title={`Voiced by ${item.voiceoverBy.name}`}>
            <div className="w-4 h-4 rounded-full flex items-center justify-center text-[7px] font-black flex-shrink-0" style={{ background: "#EAB308", color: "#fff" }}>
              {initials(item.voiceoverBy.name)}
            </div>
          </div>
        )}
        {/* While it's in Editing, name the editor outright — the point of asking "who's
            starting this?" is that the rest of the team can see it without hovering. */}
        {item.editedByUser && item.status === "editing" ? (
          <span className="flex items-center gap-1 text-[9px] font-bold px-1.5 py-0.5 rounded-full"
            title={`${item.editedByUser.name} is editing this`}
            style={{ background: "rgba(155,107,255,0.12)", color: "#9B6BFF" }}>
            <span className="w-3.5 h-3.5 rounded-full flex items-center justify-center text-[7px] font-black"
              style={{ background: "#9B6BFF", color: "#fff" }}>
              {initials(item.editedByUser.name)}
            </span>
            {item.editedByUser.name}
          </span>
        ) : item.editedByUser ? (
          <div className="flex items-center gap-1" title={`Edited by ${item.editedByUser.name}`}>
            <div className="w-4 h-4 rounded-full flex items-center justify-center text-[7px] font-black flex-shrink-0" style={{ background: "#9B6BFF", color: "#fff" }}>
              {initials(item.editedByUser.name)}
            </div>
          </div>
        ) : null}
        <span className="text-[9px]" style={{ color: "#374151", fontWeight: 600 }}>{fmtDate(originDate(item))}</span>
      </div>

      {/* Scheduled slot — shown while it's queued in Ready to Post. */}
      {item.status === "ready_to_post" && item.scheduled_post_date && (
        <div className="mb-2 p-2 rounded-xl" style={{ background: "rgba(14,165,233,0.08)" }}>
          <div className="flex items-center gap-1 mb-1">
            <CalendarDays size={10} style={{ color: "#0EA5E9" }} />
            <span className="text-[9px] font-bold" style={{ color: "#0EA5E9" }}>
              {fmtDate(item.scheduled_post_date)}{item.scheduled_post_time ? ` · ${fmtTime(item.scheduled_post_time)}` : ""}
            </span>
          </div>
          <div className="flex flex-wrap gap-1">
            {item.ready_platforms.map(p => {
              const cfg = PLATFORM_CFG[p]
              const Icon = cfg.icon
              return (
                <span key={p} className="flex items-center gap-1 text-[9px] font-bold px-1.5 py-0.5 rounded-full"
                  style={{ background: `${cfg.color}18`, color: cfg.color }}>
                  <Icon size={9} /> {cfg.label}
                </span>
              )
            })}
          </div>
        </div>
      )}

      {/* Correction round-trips — shows this went back N times, and what for. */}
      {item.corrections.length > 0 && (
        <div className="mb-2">
          <span className="flex items-center gap-1 text-[9px] font-bold px-1.5 py-0.5 rounded-full w-fit"
            title={item.corrections.map(c => c.notes).join(" · ")}
            style={{ background: "rgba(245,158,11,0.12)", color: "#D97706" }}>
            <RotateCcw size={9} /> {item.corrections.length} correction{item.corrections.length > 1 ? "s" : ""}
          </span>
          <p className="text-[9px] mt-1 line-clamp-2" style={{ color: "#6B7280" }}>
            {item.corrections[0].notes}
          </p>
        </div>
      )}

      {/* The review gate: approve moves it on, a correction sends it back to Editing. */}
      {item.status === "on_review" ? (
        <div className="flex flex-col gap-1.5">
          <button
            onPointerDown={e => e.stopPropagation()}
            onClick={() => onAdvance(item, "ready_to_post")}
            className="w-full py-1.5 rounded-xl text-[9px] font-bold transition-all hover:opacity-80 flex items-center justify-center gap-1"
            style={{ background: `${STATUS_CFG.ready_to_post.accent}14`, color: STATUS_CFG.ready_to_post.accent }}>
            Approve <ArrowRight size={10} />
          </button>
          {onRequestCorrection && (
            <button
              onPointerDown={e => e.stopPropagation()}
              onClick={() => onRequestCorrection(item)}
              className="w-full py-1.5 rounded-xl text-[9px] font-bold transition-all hover:opacity-80 flex items-center justify-center gap-1"
              style={{ background: "rgba(245,158,11,0.1)", color: "#D97706" }}>
              <RotateCcw size={10} /> Needs Correction
            </button>
          )}
        </div>
      ) : next && (
        <button
          onPointerDown={e => e.stopPropagation()}
          onClick={() => onAdvance(item, next)}
          className="w-full py-1.5 rounded-xl text-[9px] font-bold transition-all hover:opacity-80 flex items-center justify-center gap-1"
          style={{ background: `${STATUS_CFG[next].accent}14`, color: STATUS_CFG[next].accent }}>
          {item.status === "ready_to_post" ? <>Mark Posted <ArrowRight size={10} /></> : <>Move to {STATUS_CFG[next].label} <ArrowRight size={10} /></>}
        </button>
      )}
      {item.status === "posted" && (
        <button onPointerDown={e => e.stopPropagation()} onClick={() => onAddPlatform(item)}
          className="w-full py-1.5 rounded-xl text-[9px] font-bold transition-all hover:opacity-80 flex items-center justify-center gap-1"
          style={{ background: "rgba(34,197,94,0.08)", color: "#16A34A" }}>
          <Plus size={10} /> Add Platform
        </button>
      )}

    </div>
  )
}
```

- [ ] **Step 3: Rework `advance()` and `handleDragEnd`**

In `content-tracker-client.tsx:2164-2172`, replace `advance`:

```typescript
  function advance(item: ContentItem, next: ContentStatus) {
    if (next === "posted") { setPlatformModalItem(item); return }
    // Ready to Post asks where and when it's going out — used both for the normal forward
    // path and for approving out of On Review.
    if (next === "ready_to_post") { setReadyToPostItem(item); return }
    // Entering Editing asks who's starting it — that's the accountability moment.
    if (next === "editing" && members.length > 0) { setStartEditingItem(item); return }
    // Entering Voice Over asks who recorded it.
    if (next === "voiceover") { setVoiceOverItem(item); return }
    setItems(prev => prev.map(i => i.id === item.id ? { ...i, status: next, ...(next === "edited" ? { edited_date: new Date().toISOString().split("T")[0] } : {}) } : i))
    startTransition(async () => { await updateContentItemStatus(item.id, next) })
  }
```

In `content-tracker-client.tsx:2210-2217`, replace `handleDragEnd` to validate the transition (matching how `handleShootDragEnd` already validates shoots):

```typescript
  function handleDragEnd(e: DragEndEvent) {
    const overId = e.over?.id as ContentStatus | undefined
    if (overId) {
      const item = items.find(i => i.id === e.active.id)
      if (item && item.status !== overId && isValidPipelineTransition(item.status, overId)) advance(item, overId)
    }
    setDragId(null); setOverCol(null)
  }
```

- [ ] **Step 4: Move the "Needs Correction" condition in `RequestCorrectionModal`'s caller**

In `content-tracker-client.tsx`, the Pipeline board's `DraggableCard`/mobile-list calls already pass `onRequestCorrection={setCorrectionItem}` unconditionally (the condition lives inside `ContentCardInner`, already updated in Step 2) — no change needed at the call sites.

- [ ] **Step 5: Add the `voiceOverItem` modal state**

In `content-tracker-client.tsx:2079-2081`, right after `const [startEditingItem, ...]`, add:

```typescript
  const [voiceOverItem, setVoiceOverItem] = useState<ContentItem | null>(null)
```

- [ ] **Step 6: Add the `handleVoiceOverRecorded` handler**

In `content-tracker-client.tsx`, right after `handleStartEditing` (currently lines 2195-2201), add:

```typescript
  function handleVoiceOverRecorded(item: ContentItem, voiceoverBy: VoiceFreelancer, date: string) {
    setItems(prev => prev.map(i => i.id === item.id
      ? { ...i, status: "voiceover", voiceoverBy, voiceover_date: date }
      : i))
    setVoiceOverItem(null)
  }
```

(This is wired to the new `VoiceOverModal`, built in Task 11.)

- [ ] **Step 7: Typecheck**

Run: `pnpm typecheck`
Expected: remaining errors only in the sections touched by Tasks 10-11 (`STATUS_ORDER` no longer exists, referenced at the Pipeline/Log board JSX, the Overview rows, the mobile switcher, and stats memo) — all fixed next.

- [ ] **Step 8: Commit**

```bash
git add components/content-tracker/content-tracker-client.tsx
git commit -m "feat(content-tracker): branching advance/handleDragEnd for the on_review gate"
```

---

### Task 10: Client — board rename and per-mode column wiring

**Files:**
- Modify: `components/content-tracker/content-tracker-client.tsx`

**Interfaces:**
- Consumes: `VIDEO_PIPELINE_ORDER`, `POSTER_PIPELINE_ORDER` (Task 8).
- Produces: the Pipeline board (now labelled "Ready to Edit") uses the right 5-column set per mode; every remaining `STATUS_ORDER` reference is replaced.

- [ ] **Step 1: Replace `activeMobileCol`'s initial value and the `stats`/`colItems` memos**

In `content-tracker-client.tsx:2108`, replace:

```typescript
  const [activeMobileCol, setActiveMobileCol] = useState<ContentStatus>("ready_to_edit")
```

In `content-tracker-client.tsx:2260-2268`, replace `stats`:

```typescript
  const stats = useMemo(() => {
    const readyToEdit = items.filter(i => i.status === "ready_to_edit").length
    const editing = items.filter(i => i.status === "editing").length
    const edited = items.filter(i => i.status === "edited").length
    const readyToPost = items.filter(i => i.status === "ready_to_post").length
    const posted = items.filter(i => i.status === "posted").length
    const totalPosts = items.reduce((s, i) => s + i.posts.length, 0)
    return { readyToEdit, editing, edited, readyToPost, posted, totalPosts }
  }, [items])
```

- [ ] **Step 1b: Fix the hero chips, which reference the old field names**

In `content-tracker-client.tsx:2500-2503`, replace:

```typescript
        chips={[
          { icon: <Video size={11} />, label: `${stats.readyToEdit + stats.editing + stats.edited} in pipeline` },
          { icon: <CalendarDays size={11} />, label: `${stats.readyToPost} ready to post` },
          { icon: <Check size={11} />, label: `${stats.posted} posted` },
          { icon: <Megaphone size={11} />, label: `${ads.filter(a => a.status === "active").length} active ads` },
        ]}
```

- [ ] **Step 2: Compute the active pipeline order once, near `colItems`**

In `content-tracker-client.tsx:2151-2162`, right after the `pipelineItems` memo and before `function colItems`, add:

```typescript
  const pipelineOrder = contentTypeForMode === "poster" ? POSTER_PIPELINE_ORDER : VIDEO_PIPELINE_ORDER
```

- [ ] **Step 3: Replace `STATUS_ORDER` with `pipelineOrder` in the Pipeline board JSX**

In `content-tracker-client.tsx:2619` (mobile column switcher), change `STATUS_ORDER.map` to `pipelineOrder.map`.

In `content-tracker-client.tsx:2637` (desktop kanban columns), change `STATUS_ORDER.map` to `pipelineOrder.map`.

The grid stays `grid-cols-5` (line 2636) — both `VIDEO_PIPELINE_ORDER` and `POSTER_PIPELINE_ORDER` have exactly 5 entries, so no layout change is needed.

- [ ] **Step 4: Update `deleteContentPost`'s client-side fallback**

In `content-tracker-client.tsx:2482-2491` (`handleDeletePost`), replace the fallback status:

```typescript
  function handleDeletePost(postId: string, contentItemId: string) {
    setItems(prev => prev.map(i => {
      if (i.id !== contentItemId) return i
      const posts = i.posts.filter(p => p.id !== postId)
      // Mirrors the server: back to the queue if it still has a slot, else to Edited.
      const fallback: ContentStatus = i.scheduled_post_date ? "ready_to_post" : "edited"
      return { ...i, posts, status: posts.length === 0 ? fallback : i.status }
    }))
    startTransition(async () => { await deleteContentPost(postId, contentItemId) })
  }
```

- [ ] **Step 5: Update `handleReadyToPost` and the `readyQueue`/`postedItems` memos**

In `content-tracker-client.tsx:2185-2193` (`handleReadyToPost`), change `status: "ready"` to `status: "ready_to_post"`.

In `content-tracker-client.tsx:2271-2273` (`readyQueue` memo), change `i.status === "ready"` to `i.status === "ready_to_post"`.

- [ ] **Step 6: Update `handlePostAdded` and `NewContentModal`'s optimistic item**

In `content-tracker-client.tsx:2475-2480` (`handlePostAdded`) — no status-literal change needed (it already sets `status: "posted"`).

In `content-tracker-client.tsx:1038-1044` (inside `NewContentModal`'s `submit()`), replace the `onCreated` call:

```typescript
    onCreated({
      id: res.id, client_name: client, title: title.trim(), content_type: contentType,
      status: alreadyPosted ? "posted" : (contentType === "poster" ? "design" : "ready_to_edit"),
      source: contentType === "poster" ? "poster" : "shoot",
      ready_platforms: [], scheduled_post_date: null, scheduled_post_time: null, corrections: [],
      hook_count: null, use_for: [], priority: null, voiceover_date: null, reviewed_at: null,
      shot_date: shotDate, edited_date: alreadyPosted ? postedDate : null, notes: notes.trim() || null, created_at: new Date().toISOString(),
      posts: alreadyPosted ? postedPlatforms.map((platform, i) => ({ id: `${res.id}-${i}`, content_item_id: res.id!, platform, posted_date: postedDate, post_link: null })) : [],
    })
```

- [ ] **Step 7: Update `handleShootCompleted`'s optimistic item**

In `content-tracker-client.tsx:2391-2397`, replace:

```typescript
  function handleShootCompleted(shootId: string, created: CreatedShootItem[], crew: Member[]) {
    const newItems: ContentItem[] = created.map(ci => ({
      id: ci.id, client_name: ci.client_name, title: ci.title, content_type: "video", source: "shoot",
      status: "ready_to_edit", shot_date: ci.shot_date, edited_date: null, notes: ci.notes,
      ready_platforms: [], scheduled_post_date: null, scheduled_post_time: null, corrections: [],
      hook_count: null, use_for: [], priority: null, voiceover_date: null, reviewed_at: null,
      created_at: new Date().toISOString(), posts: [],
    }))
```

- [ ] **Step 8: Rename the section-rail labels**

In `content-tracker-client.tsx:2248-2258` (`navSections`), replace:

```typescript
  const navSections = useMemo(() => {
    if (mode === "ads" || mode === "overview") return []
    const ofMode = items.filter(i => i.content_type === contentTypeForMode)
    const activeAdsVideo = items.filter(i => i.content_type === "video" && i.source === "ads_video" && (i.status === "scripting" || i.status === "voiceover"))
    return [
      ...(mode === "video"
        ? [{ key: "shoots", label: "Shoots", icon: Camera, count: shoots.filter(s => s.status === "scheduled" || s.status === "going").length }]
        : []),
      ...(mode === "video"
        ? [{ key: "adsvideo", label: "Ads Video", icon: Sparkles, count: activeAdsVideo.length }]
        : []),
      { key: "pipeline", label: "Ready to Edit", icon: Layers, count: ofMode.filter(i => pipelineOrder.includes(i.status)).length },
      { key: "log", label: "Posted", icon: History, count: ofMode.filter(i => i.status === "posted").length },
    ]
  }, [mode, items, shoots, contentTypeForMode, pipelineOrder])
```

- [ ] **Step 9: Widen `subTab`'s type and fix the poster fallback**

In `content-tracker-client.tsx:2059-2061`, replace:

```typescript
  const [subTab, setSubTab] = useState<"shoots" | "adsvideo" | "pipeline" | "log">("shoots")
  // Derived rather than reset via an effect — avoids a cascading-render setState-in-effect.
  // Posters have neither Shoots nor Ads Video, so both fall back to Pipeline.
  const tab = mode === "poster" && (subTab === "shoots" || subTab === "adsvideo") ? "pipeline" : subTab
```

- [ ] **Step 10: Rename the Overview tab's row labels source**

In `content-tracker-client.tsx:2558-2570` (the `OverviewBlock` rows for Videos/Posters), change `STATUS_ORDER.map` in both places to iterate the right per-type row list — this is completed in Task 13, which also handles the new attention-card wiring; leave as `STATUS_ORDER.map` for now and let Task 13 replace it (Task 13 depends on this task landing first only for `STATUS_CFG`, not for this specific line).

- [ ] **Step 11: Typecheck**

Run: `pnpm typecheck`
Expected: remaining errors confined to the Ads Video board (not yet built, Task 11) and the Overview tab's row lists (Task 13, per Step 10 above) and the Posting-Log tab's `"Posting Log — N queued"` label text (cosmetic, fix in Step 12 below).

- [ ] **Step 12: Update the "queued" label text**

In `content-tracker-client.tsx:2679-2683` (top of the Log/Posted tab), change the label text from `Ready to Post — {readyQueue.length} queued` — this text is already correct (says "Ready to Post", not "Posting Log"), no change needed. Verify it reads correctly; if the surrounding block still says "Posting Log" anywhere in a heading, change it to "Posted".

- [ ] **Step 13: Commit**

```bash
git add components/content-tracker/content-tracker-client.tsx
git commit -m "feat(content-tracker): rename Pipeline/Posting Log tabs, per-mode column order"
```

---

### Task 11: Client — the Ads Video sub-tab

**Files:**
- Modify: `components/content-tracker/content-tracker-client.tsx`

**Interfaces:**
- Consumes: `ADS_VIDEO_ORDER`, `USE_FOR_CFG`, `PRIORITY_CFG`, `VoiceFreelancer` (Task 8); `createAdsVideoScript`, `recordVoiceOver`, `updateAdsVideoScript` (Task 4); `handleVoiceOverRecorded`, `voiceOverItem` (Task 9).
- Produces: the "Ads Video" board (Scripting → Voice Over), `AdsVideoCardInner`, `NewAdsVideoModal`, `VoiceOverModal`, `EditAdsVideoModal`.

- [ ] **Step 1: Import the new server actions**

In `content-tracker-client.tsx:19-23`, add `createAdsVideoScript, recordVoiceOver, updateAdsVideoScript` to the existing import from `@/lib/actions/content-tracker`:

```typescript
import {
  createContentItem, updateContentItem, updateContentItemStatus, deleteContentItem,
  addContentPost, deleteContentPost,
  createAd, updateAd, updateAdStatus, deleteAd, addAdRevision, addAdPerformanceEntry, markReadyToPost, requestCorrection,
  createAdsVideoScript, recordVoiceOver, updateAdsVideoScript,
} from "@/lib/actions/content-tracker"
```

- [ ] **Step 2: Add `AdsVideoCardInner`**

Add this new component right after `ContentCardInner` (after the closing brace from Task 9 Step 2):

```typescript
// ── Ads Video card — the Scripting/Voice Over board's card, distinct from
// ContentCardInner because its fields (hooks, use-for, priority) don't apply once an
// item reaches the shared Ready to Edit board (which reuses ContentCardInner).
function AdsVideoCardInner({ item, isDragging, onAdvance, onEdit, onDelete }: {
  item: ContentItem
  isDragging?: boolean
  onAdvance: (item: ContentItem, next: ContentStatus) => void
  onEdit: (item: ContentItem) => void
  onDelete: (id: string) => void
}) {
  const cardMenu: CardMenuItem[] = [
    { label: "Edit details", icon: Pencil, onClick: () => onEdit(item) },
    { label: "Delete", icon: Trash2, onClick: () => onDelete(item.id), danger: true },
  ]
  const next = NEXT_STATUS[item.status]

  return (
    <div className="rounded-2xl p-3.5 mb-2.5 group transition-all select-none"
      style={{
        background: isDragging ? "#F3F4F6" : "#FFFFFF",
        boxShadow: isDragging ? "0 8px 24px rgba(0,0,0,0.15)" : "0 2px 10px rgba(0,0,0,0.05)",
        border: "1px solid transparent",
        opacity: isDragging ? 0.5 : 1,
      }}>
      <div className="flex items-start gap-2 mb-2">
        <span className="flex-shrink-0 mt-0.5 opacity-30 group-hover:opacity-70 transition-opacity" title="Drag anywhere on the card to move it">
          <GripVertical size={13} style={{ color: "#6B7280" }} />
        </span>
        <div style={{ width: 22, height: 22, borderRadius: 7, background: "rgba(217,119,6,0.1)", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
          <Video size={12} style={{ color: "#D97706" }} />
        </div>
        <p className="text-[12px] font-semibold leading-snug line-clamp-2 flex-1" style={{ color: "#111111" }}>{item.title}</p>
        <CardMenu items={cardMenu} />
      </div>

      <div className="flex flex-wrap items-center gap-1 mb-2.5">
        <span className="text-[9px] font-medium px-1.5 py-0.5 rounded-full truncate max-w-[110px]"
          style={{ background: "rgba(99,102,241,0.08)", color: "#6366F1" }}>{item.client_name}</span>
        {item.priority && (
          <span className="text-[9px] font-bold px-1.5 py-0.5 rounded-full" style={{ background: `${PRIORITY_CFG[item.priority].color}18`, color: PRIORITY_CFG[item.priority].color }}>
            {PRIORITY_CFG[item.priority].label}
          </span>
        )}
      </div>

      <div className="flex flex-wrap items-center gap-1 mb-2.5">
        {item.hook_count !== null && (
          <span className="text-[9px] font-bold px-1.5 py-0.5 rounded-full" style={{ background: "#F3F4F6", color: "#374151" }}>
            {item.hook_count} hook{item.hook_count === 1 ? "" : "s"}
          </span>
        )}
        {item.use_for.map(u => {
          const cfg = USE_FOR_CFG[u]
          const Icon = cfg.icon
          return (
            <span key={u} className="flex items-center gap-1 text-[9px] font-bold px-1.5 py-0.5 rounded-full"
              style={{ background: `${cfg.color}18`, color: cfg.color }}>
              <Icon size={9} /> {cfg.label}
            </span>
          )
        })}
      </div>

      {item.voiceoverBy && (
        <div className="flex items-center gap-1 mb-2" title={`Voiced by ${item.voiceoverBy.name}`}>
          <div className="w-4 h-4 rounded-full flex items-center justify-center text-[7px] font-black flex-shrink-0" style={{ background: "#EAB308", color: "#fff" }}>
            {initials(item.voiceoverBy.name)}
          </div>
          <span className="text-[9px]" style={{ color: "#374151", fontWeight: 600 }}>{item.voiceoverBy.name}</span>
        </div>
      )}

      {next && (
        <button
          onPointerDown={e => e.stopPropagation()}
          onClick={() => onAdvance(item, next)}
          className="w-full py-1.5 rounded-xl text-[9px] font-bold transition-all hover:opacity-80 flex items-center justify-center gap-1"
          style={{ background: `${STATUS_CFG[next].accent}14`, color: STATUS_CFG[next].accent }}>
          {item.status === "voiceover" ? <>Send to Ready to Edit <ArrowRight size={10} /></> : <>Move to {STATUS_CFG[next].label} <ArrowRight size={10} /></>}
        </button>
      )}
    </div>
  )
}
```

- [ ] **Step 3: Add `NewAdsVideoModal`**

Add right after `NewContentModal` (after its closing brace, currently ending line 1099):

```typescript
// ── New Ads Video modal — Scripting stage ────────────────────────────────────
function NewAdsVideoModal({ clients, pastClients, onClose, onCreated }: {
  clients: { id: string; name: string }[]; pastClients: { id: string; name: string }[]
  onClose: () => void; onCreated: (item: ContentItem) => void
}) {
  const { activeOptions: activeClientOptions, pastOptions: pastClientOptions } = useMemo(
    () => buildClientOptions(clients.map(c => c.name), pastClients.map(c => c.name)),
    [clients, pastClients]
  )
  const [client, setClient] = useState("")
  const [title, setTitle] = useState("")
  const [hookCount, setHookCount] = useState(1)
  const [useFor, setUseFor] = useState<UseFor[]>([])
  const [priority, setPriority] = useState<Priority>("medium")
  const [notes, setNotes] = useState("")
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  function toggleUseFor(u: UseFor) {
    setUseFor(prev => prev.includes(u) ? prev.filter(x => x !== u) : [...prev, u])
  }

  async function submit() {
    if (!client || !title.trim()) { setError("Client and title are required"); return }
    if (useFor.length === 0) { setError("Pick at least one \"use for\""); return }
    setSaving(true); setError(null)
    const res = await createAdsVideoScript({ client_name: client, title: title.trim(), hook_count: hookCount, use_for: useFor, priority, notes: notes.trim() || undefined })
    setSaving(false)
    if (!res.success || !res.id) { setError(res.error ?? "Failed to save"); return }
    onCreated({
      id: res.id, client_name: client, title: title.trim(), content_type: "video", source: "ads_video",
      status: "scripting", shot_date: null, edited_date: null, notes: notes.trim() || null, created_at: new Date().toISOString(),
      ready_platforms: [], scheduled_post_date: null, scheduled_post_time: null, corrections: [],
      hook_count: hookCount, use_for: useFor, priority, voiceover_date: null, reviewed_at: null, posts: [],
    })
  }

  return (
    <Modal title="New Ads Video" onClose={onClose}>
      <div className="flex flex-col gap-3">
        <ClientSelector clientOptions={activeClientOptions} pastClientOptions={pastClientOptions} value={client} onValueChange={setClient} required />
        <div>
          <label style={LABEL}>Title *</label>
          <input style={FIELD} value={title} onChange={e => setTitle(e.target.value)} placeholder="e.g. Diwali Offer Hook Set" />
        </div>
        <div>
          <label style={LABEL}>How many hooks?</label>
          <input type="number" min={0} style={FIELD} value={hookCount} onChange={e => setHookCount(Math.max(0, Number(e.target.value)))} />
        </div>
        <div>
          <label style={LABEL}>Use For * <span style={{ fontWeight: 600, textTransform: "none" }}>(pick one or more)</span></label>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
            {(Object.keys(USE_FOR_CFG) as UseFor[]).map(u => {
              const cfg = USE_FOR_CFG[u]
              const Icon = cfg.icon
              const on = useFor.includes(u)
              return (
                <button key={u} type="button" onClick={() => toggleUseFor(u)}
                  style={{ display: "flex", alignItems: "center", gap: 5, padding: "6px 12px", borderRadius: 10, border: `1.5px solid ${on ? cfg.color : "#E5E7EB"}`, background: on ? `${cfg.color}14` : "#fff", color: on ? cfg.color : "#6B7280", fontSize: 11, fontWeight: 700, cursor: "pointer" }}>
                  <Icon size={12} /> {cfg.label} {on && <Check size={10} />}
                </button>
              )
            })}
          </div>
        </div>
        <div>
          <label style={LABEL}>Priority</label>
          <select style={{ ...FIELD, cursor: "pointer" }} value={priority} onChange={e => setPriority(e.target.value as Priority)}>
            {(Object.keys(PRIORITY_CFG) as Priority[]).map(p => <option key={p} value={p}>{PRIORITY_CFG[p].label}</option>)}
          </select>
        </div>
        <div>
          <label style={LABEL}>Notes <span style={{ fontWeight: 600, textTransform: "none" }}>(the script brief)</span></label>
          <textarea style={{ ...FIELD, minHeight: 60, resize: "vertical" }} value={notes} onChange={e => setNotes(e.target.value)} placeholder="Optional" />
        </div>
        {error && <p style={{ fontSize: 11, color: "#DE1A1A", margin: 0 }}>{error}</p>}
        <PrimaryButton onClick={submit} disabled={saving}>{saving ? "Saving…" : "Add to Scripting"}</PrimaryButton>
      </div>
    </Modal>
  )
}
```

- [ ] **Step 3b: Add `EditAdsVideoModal`**

An ads-video item's editable fields (hooks, use-for, priority) don't exist on the generic `EditContentModal`, and that modal's "Shot Date" field is meaningless for a script — so this is its own small modal, not a reuse. Add right after `NewAdsVideoModal` (after its closing brace from Step 3):

```typescript
// ── Edit Ads Video modal — same field set as creation, pre-filled ───────────
function EditAdsVideoModal({ item, clients, pastClients, onClose, onSaved }: {
  item: ContentItem
  clients: { id: string; name: string }[]; pastClients: { id: string; name: string }[]
  onClose: () => void
  onSaved: (updates: { client_name: string; title: string; hook_count: number; use_for: UseFor[]; priority: Priority; notes: string }) => void
}) {
  const { activeOptions: activeClientOptions, pastOptions: pastClientOptions } = useMemo(
    () => buildClientOptions(clients.map(c => c.name), pastClients.map(c => c.name)),
    [clients, pastClients]
  )
  const [client, setClient] = useState(item.client_name)
  const [title, setTitle] = useState(item.title)
  const [hookCount, setHookCount] = useState(item.hook_count ?? 0)
  const [useFor, setUseFor] = useState<UseFor[]>(item.use_for)
  const [priority, setPriority] = useState<Priority>(item.priority ?? "medium")
  const [notes, setNotes] = useState(item.notes || "")
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  function toggleUseFor(u: UseFor) {
    setUseFor(prev => prev.includes(u) ? prev.filter(x => x !== u) : [...prev, u])
  }

  async function submit() {
    if (!client || !title.trim()) { setError("Client and title are required"); return }
    if (useFor.length === 0) { setError("Pick at least one \"use for\""); return }
    setSaving(true); setError(null)
    const res = await updateAdsVideoScript({ content_item_id: item.id, client_name: client, title: title.trim(), hook_count: hookCount, use_for: useFor, priority, notes: notes.trim() || undefined })
    setSaving(false)
    if (!res.success) { setError(res.error ?? "Failed to save"); return }
    onSaved({ client_name: client, title: title.trim(), hook_count: hookCount, use_for: useFor, priority, notes: notes.trim() })
  }

  return (
    <Modal title="Edit Ads Video" onClose={onClose}>
      <div className="flex flex-col gap-3">
        <ClientSelector clientOptions={activeClientOptions} pastClientOptions={pastClientOptions} value={client} onValueChange={setClient} required />
        <div>
          <label style={LABEL}>Title *</label>
          <input style={FIELD} value={title} onChange={e => setTitle(e.target.value)} />
        </div>
        <div>
          <label style={LABEL}>How many hooks?</label>
          <input type="number" min={0} style={FIELD} value={hookCount} onChange={e => setHookCount(Math.max(0, Number(e.target.value)))} />
        </div>
        <div>
          <label style={LABEL}>Use For * <span style={{ fontWeight: 600, textTransform: "none" }}>(pick one or more)</span></label>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
            {(Object.keys(USE_FOR_CFG) as UseFor[]).map(u => {
              const cfg = USE_FOR_CFG[u]
              const Icon = cfg.icon
              const on = useFor.includes(u)
              return (
                <button key={u} type="button" onClick={() => toggleUseFor(u)}
                  style={{ display: "flex", alignItems: "center", gap: 5, padding: "6px 12px", borderRadius: 10, border: `1.5px solid ${on ? cfg.color : "#E5E7EB"}`, background: on ? `${cfg.color}14` : "#fff", color: on ? cfg.color : "#6B7280", fontSize: 11, fontWeight: 700, cursor: "pointer" }}>
                  <Icon size={12} /> {cfg.label} {on && <Check size={10} />}
                </button>
              )
            })}
          </div>
        </div>
        <div>
          <label style={LABEL}>Priority</label>
          <select style={{ ...FIELD, cursor: "pointer" }} value={priority} onChange={e => setPriority(e.target.value as Priority)}>
            {(Object.keys(PRIORITY_CFG) as Priority[]).map(p => <option key={p} value={p}>{PRIORITY_CFG[p].label}</option>)}
          </select>
        </div>
        <div>
          <label style={LABEL}>Notes</label>
          <textarea style={{ ...FIELD, minHeight: 60, resize: "vertical" }} value={notes} onChange={e => setNotes(e.target.value)} placeholder="Optional" />
        </div>
        {error && <p style={{ fontSize: 11, color: "#DE1A1A", margin: 0 }}>{error}</p>}
        <PrimaryButton onClick={submit} disabled={saving}>{saving ? "Saving…" : "Save Changes"}</PrimaryButton>
      </div>
    </Modal>
  )
}
```

- [ ] **Step 4: Add `VoiceOverModal`**

Add right after `StartEditingModal` (after its closing brace, currently ending line 1694):

```typescript
// ── "Who recorded this?" — the accountability prompt when a script enters Voice Over ──
function VoiceOverModal({ item, freelancers, onClose, onConfirm }: {
  item: ContentItem
  freelancers: VoiceFreelancer[]
  onClose: () => void
  onConfirm: (voiceoverBy: VoiceFreelancer, date: string) => void
}) {
  const [voiceoverId, setVoiceoverId] = useState(freelancers[0]?.id ?? "")
  const [date, setDate] = useState(new Date().toISOString().split("T")[0])
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function submit() {
    const freelancer = freelancers.find(f => f.id === voiceoverId)
    if (!freelancer) { setError("Pick who recorded the voice-over"); return }
    setSaving(true); setError(null)
    const res = await recordVoiceOver({ content_item_id: item.id, voiceover_by: freelancer.id, voiceover_date: date })
    setSaving(false)
    if (!res.success) { setError(res.error ?? "Failed to save"); return }
    onConfirm(freelancer, date)
  }

  return (
    <Modal title="Who recorded the voice-over?" onClose={onClose}>
      <div className="flex flex-col gap-3">
        <p className="text-[11px]" style={{ color: "#6B7280", margin: 0 }}>
          <strong style={{ color: "#111827" }}>{item.title}</strong> is moving to Voice Over.
        </p>
        {freelancers.length === 0 ? (
          <p style={{ fontSize: 11, color: "#DE1A1A", margin: 0 }}>
            No active Freelance RJ Voiceover artists found — add one under Freelancers first.
          </p>
        ) : (
          <div>
            <label style={LABEL}>Voice Artist *</label>
            <select style={{ ...FIELD, cursor: "pointer" }} value={voiceoverId} onChange={e => setVoiceoverId(e.target.value)}>
              {freelancers.map(f => <option key={f.id} value={f.id}>{f.name}</option>)}
            </select>
          </div>
        )}
        <div>
          <label style={LABEL}>Date</label>
          <input type="date" style={FIELD} value={date} onChange={e => setDate(e.target.value)} />
        </div>
        {error && <p style={{ fontSize: 11, color: "#DE1A1A", margin: 0 }}>{error}</p>}
        <PrimaryButton onClick={submit} disabled={saving || freelancers.length === 0}>{saving ? "Saving…" : "Confirm Voice Over"}</PrimaryButton>
      </div>
    </Modal>
  )
}
```

- [ ] **Step 5: Add the Ads Video board's local state and memo**

In `content-tracker-client.tsx:2089-2094`, right after the existing `shootDragId`/`shootOverCol`/`activeShootCol` block, add:

```typescript
  const [adsVideoDragId, setAdsVideoDragId] = useState<string | null>(null)
  const [adsVideoOverCol, setAdsVideoOverCol] = useState<string | null>(null)
  const [showNewAdsVideo, setShowNewAdsVideo] = useState(false)
  const [editAdsVideoFor, setEditAdsVideoFor] = useState<ContentItem | null>(null)
```

Right after the `pipelineOrder` line added in Task 10 Step 2, add:

```typescript
  const adsVideoItems = useMemo(
    () => items.filter(i => i.content_type === "video" && i.source === "ads_video" && ADS_VIDEO_ORDER.includes(i.status)),
    [items]
  )
  function adsVideoColItems(status: ContentStatus) { return adsVideoItems.filter(i => i.status === status) }
```

- [ ] **Step 6: Add the drag handlers**

Right after `handleDragEnd` (from Task 9 Step 3), add:

```typescript
  function handleAdsVideoDragOver(e: { over: { id: string } | null }) { setAdsVideoOverCol(e.over?.id ?? null) }
  function handleAdsVideoDragEnd(e: DragEndEvent) {
    const overId = e.over?.id as ContentStatus | undefined
    if (overId) {
      const item = items.find(i => i.id === e.active.id)
      if (item && item.status !== overId && isValidPipelineTransition(item.status, overId)) advance(item, overId)
    }
    setAdsVideoDragId(null); setAdsVideoOverCol(null)
  }
  const draggedAdsVideo = items.find(i => i.id === adsVideoDragId)
```

- [ ] **Step 7: Render the Ads Video board**

Right after the Pipeline board's closing `)}` (Task 3/10's guard block, `content-tracker-client.tsx:2594-2671` region, ends at line 2671 before the Log tab guard at 2673), insert a new guard block:

```typescript
      {mode === "video" && tab === "adsvideo" && (
        <div className="flex flex-col gap-4">
          <div className="flex items-center justify-between flex-wrap gap-2">
            <p className="text-[11px]" style={{ color: "#6B7280", margin: 0 }}>
              Video that starts as a script, not a shoot — scripting and voice-over here, then it joins the shared production board at Ready to Edit.
            </p>
            <button onClick={() => setShowNewAdsVideo(true)}
              style={{ display: "flex", alignItems: "center", gap: 6, padding: "10px 16px", borderRadius: 12, border: "none", background: "linear-gradient(135deg,#FF4D4D,#DE1A1A)", color: "#fff", fontSize: 12, fontWeight: 800, cursor: "pointer" }}>
              <Plus size={14} /> New Ads Video
            </button>
          </div>

          <div className="md:hidden flex flex-col gap-3">
            {ADS_VIDEO_ORDER.map(status => (
              <div key={status}>
                <p className="text-[11px] font-black mb-2" style={{ color: "#111111" }}>{STATUS_CFG[status].label} ({adsVideoColItems(status).length})</p>
                {adsVideoColItems(status).length === 0 ? (
                  <p style={{ fontSize: 12, color: "#374151", fontWeight: 600, textAlign: "center", padding: "16px 0" }}>No items</p>
                ) : adsVideoColItems(status).map(item => (
                  <AdsVideoCardInner key={item.id} item={item} onAdvance={advance} onEdit={setEditAdsVideoFor} onDelete={handleDeleteItem} />
                ))}
              </div>
            ))}
          </div>

          <div className="hidden md:block">
            <DndContext sensors={sensors} onDragStart={e => setAdsVideoDragId(String(e.active.id))} onDragOver={handleAdsVideoDragOver as never} onDragEnd={handleAdsVideoDragEnd}>
              <div className="grid grid-cols-2 gap-3">
                {ADS_VIDEO_ORDER.map(status => {
                  const list = adsVideoColItems(status)
                  const cfg = STATUS_CFG[status]
                  return (
                    <KanbanColumn key={status} id={status} accent={cfg.accent} isOver={adsVideoOverCol === status}>
                      <KanbanColumnHeader label={cfg.label} count={list.length} accent={cfg.accent} />
                      <div className="p-3 flex-1">
                        {list.length === 0 ? (
                          <KanbanEmptyCell isOver={adsVideoOverCol === status} accent={cfg.accent} />
                        ) : list.map(item => (
                          <KanbanCard key={item.id} id={item.id}>
                            <AdsVideoCardInner item={item} isDragging={adsVideoDragId === item.id} onAdvance={advance} onEdit={setEditAdsVideoFor} onDelete={handleDeleteItem} />
                          </KanbanCard>
                        ))}
                      </div>
                    </KanbanColumn>
                  )
                })}
              </div>
              <DragOverlay>
                {draggedAdsVideo ? (
                  <div style={{ width: 260, opacity: 0.95, transform: "rotate(2deg)" }}>
                    <AdsVideoCardInner item={draggedAdsVideo} onAdvance={() => {}} onEdit={() => {}} onDelete={() => {}} />
                  </div>
                ) : null}
              </DragOverlay>
            </DndContext>
          </div>
        </div>
      )}
```

- [ ] **Step 8: Wire the new modals into the render tree**

Near the other modal render calls at the bottom of the component's JSX (alongside `StartEditingModal`/`ReadyToPostModal`), add:

```typescript
      {showNewAdsVideo && (
        <NewAdsVideoModal
          clients={clients} pastClients={pastClients}
          onClose={() => setShowNewAdsVideo(false)}
          onCreated={item => { setItems(prev => [item, ...prev]); setShowNewAdsVideo(false) }}
        />
      )}
      {voiceOverItem && (
        <VoiceOverModal
          item={voiceOverItem} freelancers={voiceoverFreelancers}
          onClose={() => setVoiceOverItem(null)}
          onConfirm={(freelancer, date) => handleVoiceOverRecorded(voiceOverItem, freelancer, date)}
        />
      )}
      {editAdsVideoFor && (
        <EditAdsVideoModal
          item={editAdsVideoFor} clients={clients} pastClients={pastClients}
          onClose={() => setEditAdsVideoFor(null)}
          onSaved={updates => {
            setItems(prev => prev.map(i => i.id === editAdsVideoFor.id ? { ...i, ...updates, notes: updates.notes || null } : i))
            setEditAdsVideoFor(null)
          }}
        />
      )}
```

- [ ] **Step 9: Typecheck, lint**

Run: `pnpm typecheck && pnpm lint`
Expected: PASS, no errors anywhere in the Tracker.

- [ ] **Step 10: Commit**

```bash
git add components/content-tracker/content-tracker-client.tsx
git commit -m "feat(content-tracker): Ads Video sub-tab — Scripting to Voice Over board"
```

---

### Task 12: Wire `voiceoverFreelancers` through both server pages

**Files:**
- Modify: `app/admin/content-tracker/page.tsx`
- Modify: `app/member/content-tracker/page.tsx`

**Interfaces:**
- Consumes: `getContentTrackerData`'s new `voiceoverFreelancers` field (Task 6).

- [ ] **Step 1: Update `app/admin/content-tracker/page.tsx`**

In `app/admin/content-tracker/page.tsx:27` and the JSX below (lines 27-43), replace:

```typescript
  const [{ items, ads, shoots, members, voiceoverFreelancers }, clientsResult, pastClientsResult] = await Promise.all([
    getContentTrackerData(companyId),
    admin.from("clients").select("id, name").eq("company_id", companyId).eq("status", "active").order("name"),
    admin.from("clients").select("id, name").eq("company_id", companyId).eq("status", "past").order("name"),
  ])

  return (
    <ContentTrackerClient
      initialItems={items}
      initialAds={ads}
      initialShoots={shoots}
      members={members}
      currentUserId={user.id}
      clients={(clientsResult.data ?? []) as { id: string; name: string }[]}
      pastClients={(pastClientsResult.data ?? []) as { id: string; name: string }[]}
      voiceoverFreelancers={voiceoverFreelancers}
    />
  )
}
```

- [ ] **Step 2: Read and apply the identical change to `app/member/content-tracker/page.tsx`**

Read the file first (it was not inspected during planning, but per the Explore agent's earlier finding it mirrors the admin page exactly, just gated by member auth instead of admin). Apply the same two edits: destructure `voiceoverFreelancers` from `getContentTrackerData`, and pass `voiceoverFreelancers={voiceoverFreelancers}` to `<ContentTrackerClient>`.

- [ ] **Step 3: Typecheck**

Run: `pnpm typecheck`
Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add app/admin/content-tracker/page.tsx app/member/content-tracker/page.tsx
git commit -m "feat(content-tracker): pass the voice-over freelancer roster to the client"
```

---

### Task 13: Overview tab — new stage rows and attention cards

**Files:**
- Modify: `components/content-tracker/content-tracker-client.tsx`

**Interfaces:**
- Consumes: `Overview.attention` now includes `'awaiting-review'` and `'in-scripting'` kinds (Task 7).

- [ ] **Step 1: Replace the Videos/Posters `OverviewBlock` row lists**

In `content-tracker-client.tsx:2558-2570`, replace:

```typescript
            <OverviewBlock title="Videos" accent={MODE_ACCENT.video.solid} icon={Video}
              rows={[...ADS_VIDEO_ORDER, ...VIDEO_PIPELINE_ORDER, "posted" as ContentStatus].map(s => ({
                key: s,
                label: STATUS_CFG[s].label,
                value: overview.videos[s],
                onClick: () => goTo({ mode: "video", tab: s === "posted" ? "log" : (s === "scripting" || s === "voiceover") ? "adsvideo" : "pipeline" }),
              }))} />
            <OverviewBlock title="Posters" accent={MODE_ACCENT.poster.solid} icon={ImageIcon}
              rows={[...POSTER_PIPELINE_ORDER, "posted" as ContentStatus].map(s => ({
                key: s,
                label: STATUS_CFG[s].label,
                value: overview.posters[s],
                onClick: () => goTo({ mode: "poster", tab: s === "posted" ? "log" : "pipeline" }),
              }))} />
```

(This lists `[scripting, voiceover, ready_to_edit, editing, edited, on_review, ready_to_post, posted]` for Videos — 8 rows — and `[design, editing, edited, on_review, ready_to_post, posted]` for Posters — 6 rows — matching the spec's per-mode stage set exactly.)

- [ ] **Step 2: Verify `AttentionItem` rendering needs no change**

The Overview tab's attention-list rendering (wherever it maps `overview.attention` to cards) already renders generically off `{kind, count, label, target}` — since Task 7 added `'awaiting-review'` and `'in-scripting'` as new `AttentionKind` values with full `label`/`target` already computed, no new UI branch is needed as long as that render loop doesn't switch on `kind` to pick an icon. Confirm this by reading the attention-rendering block before this task is marked done; if it does switch per-kind for an icon, add cases for the two new kinds using `AlertTriangle`/`Sparkles` respectively (both already imported at the top of the file).

- [ ] **Step 3: Typecheck, lint, build**

Run: `pnpm typecheck && pnpm lint && pnpm build`
Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add components/content-tracker/content-tracker-client.tsx
git commit -m "feat(content-tracker): Overview tab reflects the 9-stage pipeline"
```

---

### Task 14: Manual QA and push

**Files:** none (verification only).

- [ ] **Step 1: Run the full automated suite**

Run: `pnpm typecheck && pnpm lint && pnpm test && pnpm build`
Expected: all four pass clean.

- [ ] **Step 2: Start the dev server and manually walk every new path**

Run: `pnpm dev`, then in a browser:

1. **Shoot path unaffected:** Video → Shoot Schedule → complete a shoot with a topic → confirm the new item appears in Ready to Edit's first column, not lost.
2. **Ads Video path:** Video → Ads Video → New Ads Video → fill client/title/hooks/use-for/priority → confirm it lands in Scripting.
3. Drag (or button) it to Voice Over → confirm the modal lists the 6 active RJ Voiceover freelancers (AJITHA, RATHNA, RESHMA, SANDHIYA, SASI REKHA, VIDHYA) → confirm it disappears from the Ads Video board and appears in Ready to Edit's first column.
4. Move it through Editing (assign an editor) → Edited → On Review.
5. At On Review, confirm both "Approve" and "Needs Correction" buttons render, and the kebab menu's "Needs correction" only appears here (not on Edited).
6. Click "Needs Correction" → confirm it returns to Editing with the note recorded.
7. Re-reach On Review, click "Approve" → confirm the Ready to Post scheduling modal opens, and after saving the item shows in both the Ready to Edit board's last column and the Posted tab's queue.
8. Mark Posted → confirm it moves to the Posted tab's log table with the platform/link/poster recorded.
9. **Poster path:** Poster mode → confirm the first column reads "Design", and the board has no Scripting/Voice Over/Shoots tabs.
10. **Overview tab:** confirm the Videos block shows 8 rows (including Scripting/Voice Over) and Posters shows 6 (including Design, excluding Scripting/Voice Over), and that a scripting-stage item and an on_review-stage item each surface as an attention card.
11. **Mobile:** resize to ~375px width and repeat steps 2-8 using the mobile column switcher instead of drag-and-drop.

- [ ] **Step 3: Fix anything found, with its own small commit per fix**

- [ ] **Step 4: Push**

Ask the user "sajee or master?" before pushing — do not push without that confirmation, per standing workflow. Once confirmed:

```bash
git push origin sajee
```
