# Media Tracker — Reintroduce "Edited" Stage — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Insert a real `edited` pipeline stage between production (Ready to Edit / Design) and the review gate for both video and poster content, rename the review-gate stage's display label from "On Review" to "Completed Edit", and fix the poster date field's label ("Shot Date" → "Created Date").

**Architecture:** `edited` becomes a 10th value in the existing single-status-column state machine (`content_items.status`), matching a status this table used to have before it was consolidated away (migration 105). It sits between the existing `ready_to_edit`/`design` stages and `on_review` in the transition graph, the two Kanban column-order arrays, and the "next status" advance map. No new tables, no new form/modal — the existing "Mark Edited" form (editor/date/drive-link) still fires at the same code condition (`next === 'on_review'`), just one stage later in the flow.

**Tech Stack:** Next.js 15 App Router, Supabase Postgres (CHECK constraint enum), TypeScript, Vitest (pure-function unit tests only — this codebase has no component-level tests for `media-tracker-client.tsx`, so UI changes are verified via `pnpm typecheck` + `pnpm build`, matching existing project convention).

## Global Constraints

- Every status-graph change must be reflected in ALL THREE of: the DB check constraint, `lib/media-tracker/pipeline-transitions.ts`, and `lib/media-tracker/overview.ts` — missing one causes either a DB rejection, a client/server validation mismatch, or a silently-wrong report number.
- `on_review` stays the literal DB value and internal identifier for the renamed "Completed Edit" stage. Do not rename the enum value, column checks, or any `status === 'on_review'` comparison — only the `STATUS_CFG` display label string changes.
- No backfill migration needed for the new `edited` value — existing rows are untouched; only future forward moves pass through it.
- Run `pnpm typecheck` after every task that touches `.ts`/`.tsx` files, before committing.

---

### Task 1: Database migration — add `edited` to the status enum

**Files:**
- Create: `supabase/migrations/113_content_item_edited_status.sql`

**Interfaces:**
- Produces: a 10th valid value, `'edited'`, in the `content_items.status` CHECK constraint — every later task assumes the DB will accept this value.

- [ ] **Step 1: Write the migration**

```sql
-- Reintroduces a distinct "Edited" stage between production (Ready to Edit / Design)
-- and the review gate — previously merged into on_review by migration 105. The editor
-- hand-off and the admin's review/approval are now two separate, visible moments again.
-- No backfill: existing rows keep their current status; only new forward moves pass
-- through 'edited'. on_review itself is unchanged (display-renamed to "Completed Edit"
-- in the client only, not here).

alter table content_items drop constraint if exists content_items_status_check;
alter table content_items add constraint content_items_status_check
  check (status in ('scripting','voiceover','design','ready_to_edit','edited','on_review','branding_ready','ads_ready','posted','cancelled'));
```

- [ ] **Step 2: Verify the constraint syntax matches the established pattern**

Compare against `supabase/migrations/105_media_tracker_pipeline_v2.sql:21-23` — same `drop constraint if exists` + `add constraint` shape, only the value list differs (adds `'edited'` between `'ready_to_edit'` and `'on_review'`).

- [ ] **Step 3: Apply the migration**

This repo has no CLI migration runner wired into `package.json` — apply this SQL directly against the Supabase project (SQL editor or however prior migrations in this repo were applied), same as migrations 105/110/111/112 were.

- [ ] **Step 4: Commit**

```bash
git add supabase/migrations/113_content_item_edited_status.sql
git commit -m "feat(media-tracker): add edited status to content_items enum"
```

---

### Task 2: Pipeline transition graph

**Files:**
- Modify: `lib/media-tracker/pipeline-transitions.ts`
- Modify: `lib/media-tracker/pipeline-transitions.test.ts`
- Modify: `lib/actions/media-tracker.ts:254-256` (stale comment only, no logic change)

**Interfaces:**
- Consumes: nothing new (pure functions, no external deps).
- Produces: `ContentPipelineStatus` now includes `'edited'`; `isValidPipelineTransition('ready_to_edit', 'edited')`, `isValidPipelineTransition('design', 'edited')`, `isValidPipelineTransition('edited', 'on_review')`, and `isValidPipelineTransition('edited', 'cancelled')` all return `true`. `isValidPipelineTransition('ready_to_edit', 'on_review')` now returns `false` (this is a **behavior change** to an existing test, not just an addition).

- [ ] **Step 1: Update the existing test that will now be wrong**

In `lib/media-tracker/pipeline-transitions.test.ts`, replace:

```ts
  it('allows ready_to_edit -> on_review directly (no separate Edited stage)', () => {
    expect(isValidPipelineTransition('ready_to_edit', 'on_review')).toBe(true)
  })
```

with:

```ts
  it('rejects ready_to_edit -> on_review directly (must pass through Edited)', () => {
    expect(isValidPipelineTransition('ready_to_edit', 'on_review')).toBe(false)
  })
```

- [ ] **Step 2: Add new test cases for the Edited stage**

Add this new `describe` block to the end of `lib/media-tracker/pipeline-transitions.test.ts`, right after the existing `describe('entryStatusForSource', ...)` block:

```ts
describe('the Edited stage', () => {
  it('both Ready to Edit and Design move into Edited, not straight to On Review', () => {
    expect(isValidPipelineTransition('ready_to_edit', 'edited')).toBe(true)
    expect(isValidPipelineTransition('design', 'edited')).toBe(true)
  })
  it('Edited moves on to On Review', () => {
    expect(isValidPipelineTransition('edited', 'on_review')).toBe(true)
  })
  it('allows cancelling from Edited, same as Ready to Edit/Design', () => {
    expect(isValidPipelineTransition('edited', 'cancelled')).toBe(true)
  })
  it('rejects Edited skipping straight to a ready lane or posted', () => {
    expect(isValidPipelineTransition('edited', 'branding_ready')).toBe(false)
    expect(isValidPipelineTransition('edited', 'ads_ready')).toBe(false)
    expect(isValidPipelineTransition('edited', 'posted')).toBe(false)
  })
})
```

- [ ] **Step 3: Run the tests to verify they fail**

Run: `pnpm test lib/media-tracker/pipeline-transitions.test.ts`
Expected: FAIL — `'edited'` isn't a valid `ContentPipelineStatus` yet (TypeScript compile error in the test file) and the updated `ready_to_edit -> on_review` assertion doesn't match current behavior.

- [ ] **Step 4: Update the transition graph**

In `lib/media-tracker/pipeline-transitions.ts`, replace the full file contents with:

```ts
// Single source of truth for the Tracker's status graph — mirrors the shape of
// lib/shoots/status-transitions.ts. Both the client (drag/drop) and the server action
// (updateContentItemStatus) call into this so a bad drag and a bad direct API call are
// rejected identically.
export type ContentPipelineStatus =
  | 'scripting' | 'voiceover' | 'design' | 'ready_to_edit' | 'edited'
  | 'on_review' | 'branding_ready' | 'ads_ready' | 'posted' | 'cancelled'

export type ContentSource = 'shoot' | 'ads_video' | 'poster'

const TRANSITIONS: Record<ContentPipelineStatus, ContentPipelineStatus[]> = {
  // A script (or its voice-over) can turn out unusable — client pulls the ask, wrong
  // direction — before it ever reaches a shoot or edit, same as footage/a design can.
  scripting: ['voiceover', 'cancelled'],
  voiceover: ['ready_to_edit', 'cancelled'],
  // Both production paths hand off to an editor's own "Edited" checkpoint before
  // reaching admin review — Cancelled stays reachable from here too, same as it was
  // from Ready to Edit/Design, since nothing has been approved out of review yet.
  design: ['edited', 'cancelled'],
  ready_to_edit: ['edited', 'cancelled'],
  edited: ['on_review', 'cancelled'],
  // The review gate branches three ways: approved for organic posting, approved for
  // ads, or rejected outright (with who rejected it recorded separately).
  on_review: ['branding_ready', 'ads_ready', 'cancelled'],
  branding_ready: ['posted'],
  ads_ready: ['posted'],
  posted: [],
  cancelled: [],
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

- [ ] **Step 5: Run the tests to verify they pass**

Run: `pnpm test lib/media-tracker/pipeline-transitions.test.ts`
Expected: PASS, all tests green.

- [ ] **Step 6: Fix the stale comment in the server action**

In `lib/actions/media-tracker.ts:254-256`, replace:

```ts
    // Reaching On Review is where the editor is recorded — that's the accountability
    // moment ("who edited this?"), asked right at this move since there's no separate
    // Edited stage to stop at first.
```

with:

```ts
    // Reaching On Review (Completed Edit) is where the editor is recorded — the
    // accountability moment ("who edited this?"), asked at the Edited -> On Review move.
```

- [ ] **Step 7: Typecheck**

Run: `pnpm typecheck`
Expected: no errors.

- [ ] **Step 8: Commit**

```bash
git add lib/media-tracker/pipeline-transitions.ts lib/media-tracker/pipeline-transitions.test.ts lib/actions/media-tracker.ts
git commit -m "feat(media-tracker): add Edited stage to the pipeline transition graph"
```

---

### Task 3: Overview reporting

**Files:**
- Modify: `lib/media-tracker/overview.ts:5-7,73-78`
- Modify: `lib/media-tracker/overview.test.ts:25`

**Interfaces:**
- Consumes: `ContentPipelineStatus`-shaped status strings (structurally, `OverviewStatus` is kept as its own independent union per the file's existing header comment — not imported from `pipeline-transitions.ts`).
- Produces: `StageCounts` (a `Record<OverviewStatus, number>`) now has an `edited` key, defaulting to `0` via `emptyStages()`.

- [ ] **Step 1: Update the test fixture (will fail to compile until Step 3)**

In `lib/media-tracker/overview.test.ts:25`, replace:

```ts
const EMPTY_STAGES = { scripting: 0, voiceover: 0, design: 0, ready_to_edit: 0, on_review: 0, branding_ready: 0, ads_ready: 0, posted: 0, cancelled: 0 }
```

with:

```ts
const EMPTY_STAGES = { scripting: 0, voiceover: 0, design: 0, ready_to_edit: 0, edited: 0, on_review: 0, branding_ready: 0, ads_ready: 0, posted: 0, cancelled: 0 }
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `pnpm test lib/media-tracker/overview.test.ts`
Expected: FAIL — TypeScript compile error, `edited` isn't a key of `OverviewStatus`/`StageCounts` yet.

- [ ] **Step 3: Update the type and the zero-state**

In `lib/media-tracker/overview.ts:5-7`, replace:

```ts
export type OverviewStatus =
  | 'scripting' | 'voiceover' | 'design' | 'ready_to_edit'
  | 'on_review' | 'branding_ready' | 'ads_ready' | 'posted' | 'cancelled'
```

with:

```ts
export type OverviewStatus =
  | 'scripting' | 'voiceover' | 'design' | 'ready_to_edit' | 'edited'
  | 'on_review' | 'branding_ready' | 'ads_ready' | 'posted' | 'cancelled'
```

In `lib/media-tracker/overview.ts` (the `emptyStages` function, originally at lines 73-78), replace:

```ts
function emptyStages(): StageCounts {
  return {
    scripting: 0, voiceover: 0, design: 0, ready_to_edit: 0,
    on_review: 0, branding_ready: 0, ads_ready: 0, posted: 0, cancelled: 0,
  }
}
```

with:

```ts
function emptyStages(): StageCounts {
  return {
    scripting: 0, voiceover: 0, design: 0, ready_to_edit: 0, edited: 0,
    on_review: 0, branding_ready: 0, ads_ready: 0, posted: 0, cancelled: 0,
  }
}
```

Leave `stuckEditing` (`status === 'ready_to_edit' || status === 'design'`) and `awaitingReview` (`status === 'on_review'`) exactly as they are — an `edited` item has already finished production (not "stuck editing") but hasn't reached the review gate yet (not "awaiting review" either). It's counted in the per-content-type stage totals only, same as every other stage, with no dedicated named metric — this is intentional (see design spec's "Out of scope").

- [ ] **Step 4: Run the tests to verify they pass**

Run: `pnpm test lib/media-tracker/overview.test.ts`
Expected: PASS, all tests green.

- [ ] **Step 5: Typecheck**

Run: `pnpm typecheck`
Expected: no errors.

- [ ] **Step 6: Commit**

```bash
git add lib/media-tracker/overview.ts lib/media-tracker/overview.test.ts
git commit -m "feat(media-tracker): count the Edited stage in Overview stage totals"
```

---

### Task 4: Kanban board — status config, columns, and card display

**Files:**
- Modify: `components/media-tracker/media-tracker-client.tsx` (multiple locations, listed per step)

**Interfaces:**
- Consumes: `ContentPipelineStatus` semantics from Task 2 (this task's local `ContentStatus` type is a structurally-independent duplicate, same pattern as `OverviewStatus` — update it in parallel).
- Produces: Kanban columns `["ready_to_edit", "edited", "on_review", "branding_ready", "ads_ready", "cancelled"]` (video) and `["design", "edited", "on_review", "branding_ready", "ads_ready", "cancelled"]` (poster); a card in `edited` status can be cancelled from its kebab menu and shows its age/voice-over badges same as `ready_to_edit`/`design` cards do.

There is no component test harness for this file (confirmed: no `*.test.*` file under `components/media-tracker/`, and `vitest.config.ts` has no component-testing setup) — verification for this task is `pnpm typecheck` + `pnpm build`, matching how every other UI change in this codebase's history has been verified.

- [ ] **Step 1: Add `edited` to the local `ContentStatus` type**

At `components/media-tracker/media-tracker-client.tsx:40-42`, replace:

```ts
type ContentStatus =
  | "scripting" | "voiceover" | "design" | "ready_to_edit"
  | "on_review" | "branding_ready" | "ads_ready" | "posted" | "cancelled"
```

with:

```ts
type ContentStatus =
  | "scripting" | "voiceover" | "design" | "ready_to_edit" | "edited"
  | "on_review" | "branding_ready" | "ads_ready" | "posted" | "cancelled"
```

- [ ] **Step 2: Add the `edited` config entry and rename `on_review`'s label**

At `media-tracker-client.tsx:187-199`, replace:

```ts
const STATUS_CFG: Record<ContentStatus, { label: string; accent: string }> = {
  scripting:       { label: "Scripting",       accent: "#F97316" },
  voiceover:       { label: "Voice Over",      accent: "#1E3A8A" },
  design:          { label: "Design",          accent: "#F59E0B" },
  ready_to_edit:   { label: "Ready to Edit",   accent: "#0D9488" },
  // Was #EC4899 (pink) — too close to neighboring stages once darkened for the badge fill.
  // Rose reads as its own distinct hue in the lineup.
  on_review:       { label: "On Review",       accent: "#F43F5E" },
  branding_ready:  { label: "Branding Ready",  accent: "#0EA5E9" },
  ads_ready:       { label: "Ads Ready",       accent: "#D97706" },
  posted:          { label: "Posted",          accent: "#22C55E" },
  cancelled:       { label: "Cancelled",       accent: "#EF4444" },
}
```

with:

```ts
const STATUS_CFG: Record<ContentStatus, { label: string; accent: string }> = {
  scripting:       { label: "Scripting",       accent: "#F97316" },
  voiceover:       { label: "Voice Over",      accent: "#1E3A8A" },
  design:          { label: "Design",          accent: "#F59E0B" },
  ready_to_edit:   { label: "Ready to Edit",   accent: "#0D9488" },
  edited:          { label: "Edited",          accent: "#8B5CF6" },
  // Renamed from "On Review" — this is the admin sign-off gate now that editor hand-off
  // has its own Edited stage before it; the DB value stays on_review, display-only rename.
  // Was #EC4899 (pink) — too close to neighboring stages once darkened for the badge fill.
  // Rose reads as its own distinct hue in the lineup.
  on_review:       { label: "Completed Edit",  accent: "#F43F5E" },
  branding_ready:  { label: "Branding Ready",  accent: "#0EA5E9" },
  ads_ready:       { label: "Ads Ready",       accent: "#D97706" },
  posted:          { label: "Posted",          accent: "#22C55E" },
  cancelled:       { label: "Cancelled",       accent: "#EF4444" },
}
```

- [ ] **Step 3: Insert `edited` into both pipeline column orders and the advance map**

At `media-tracker-client.tsx:217-235`, replace:

```ts
// The production board's column order — differs by content type only in its first column
// (shoot/ads-video video enters at Ready to Edit; posters enter at Design).
const VIDEO_PIPELINE_ORDER: ContentStatus[] = ["ready_to_edit", "on_review", "branding_ready", "ads_ready", "cancelled"]
const POSTER_PIPELINE_ORDER: ContentStatus[] = ["design", "on_review", "branding_ready", "ads_ready", "cancelled"]
// The Ads Video sub-tab's own draggable columns — feeds INTO Ready to Edit, doesn't include it.
// A 3rd, non-draggable "Completed" column (not a real ContentStatus) sits alongside these —
// see adsVideoCompletedItems.
const ADS_VIDEO_ORDER: ContentStatus[] = ["scripting", "voiceover"]
const ADS_VIDEO_COMPLETED_CFG = { label: "Completed", accent: "#22C55E" }
// The default "move forward" target for the generic advance button. on_review is
// deliberately absent — it branches three ways (Branding/Ads/Cancelled) via its own Move
// dialog. branding_ready/ads_ready are also absent — each gets its own dedicated
// "Mark as Posted"/"Ads Completed" button instead of the generic advance.
const NEXT_STATUS: Partial<Record<ContentStatus, ContentStatus>> = {
  scripting: "voiceover",
  voiceover: "ready_to_edit",
  design: "on_review",
  ready_to_edit: "on_review",
}
```

with:

```ts
// The production board's column order — differs by content type only in its first column
// (shoot/ads-video video enters at Ready to Edit; posters enter at Design). Both then pass
// through the shared Edited checkpoint before the Completed Edit review gate.
const VIDEO_PIPELINE_ORDER: ContentStatus[] = ["ready_to_edit", "edited", "on_review", "branding_ready", "ads_ready", "cancelled"]
const POSTER_PIPELINE_ORDER: ContentStatus[] = ["design", "edited", "on_review", "branding_ready", "ads_ready", "cancelled"]
// The Ads Video sub-tab's own draggable columns — feeds INTO Ready to Edit, doesn't include it.
// A 3rd, non-draggable "Completed" column (not a real ContentStatus) sits alongside these —
// see adsVideoCompletedItems.
const ADS_VIDEO_ORDER: ContentStatus[] = ["scripting", "voiceover"]
const ADS_VIDEO_COMPLETED_CFG = { label: "Completed", accent: "#22C55E" }
// The default "move forward" target for the generic advance button. on_review is
// deliberately absent — it branches three ways (Branding/Ads/Cancelled) via its own Move
// dialog. branding_ready/ads_ready are also absent — each gets its own dedicated
// "Mark as Posted"/"Ads Completed" button instead of the generic advance.
const NEXT_STATUS: Partial<Record<ContentStatus, ContentStatus>> = {
  scripting: "voiceover",
  voiceover: "ready_to_edit",
  design: "edited",
  ready_to_edit: "edited",
  edited: "on_review",
}
```

- [ ] **Step 4: Extend the age badge and cancel-menu conditions to include `edited` cards**

At `media-tracker-client.tsx:620`, replace:

```ts
  const age = (item.status === "ready_to_edit" || item.status === "design") ? daysAgo(originDate(item)) : null
```

with:

```ts
  const age = (item.status === "ready_to_edit" || item.status === "design" || item.status === "edited") ? daysAgo(originDate(item)) : null
```

At `media-tracker-client.tsx:627-630`, replace:

```ts
  // Footage or a design that came out unusable — kept as a record instead of deleted outright.
  if (item.status === "ready_to_edit" || item.status === "design") {
    cardMenu.push({ label: "Cancel", icon: XCircle, onClick: () => onAdvance(item, "cancelled"), danger: true })
  }
```

with:

```ts
  // Footage or a design that came out unusable — kept as a record instead of deleted outright.
  // Edited cards can still be cancelled too — nothing has been approved out of review yet.
  if (item.status === "ready_to_edit" || item.status === "design" || item.status === "edited") {
    cardMenu.push({ label: "Cancel", icon: XCircle, onClick: () => onAdvance(item, "cancelled"), danger: true })
  }
```

- [ ] **Step 5: Extend the voice-over badge condition to include `edited` cards**

At `media-tracker-client.tsx:723`, replace:

```tsx
        {item.voiceoverBy && (item.status === "voiceover" || item.status === "ready_to_edit") && (
```

with:

```tsx
        {item.voiceoverBy && (item.status === "voiceover" || item.status === "ready_to_edit" || item.status === "edited") && (
```

- [ ] **Step 6: Fix the `edited_drive_link` field comment**

At `media-tracker-client.tsx:96`, replace:

```ts
  // Required at the Ready to Edit -> On Review move — where the edit actually lives.
```

with:

```ts
  // Required at the Edited -> Completed Edit (on_review) move — where the edit actually lives.
```

- [ ] **Step 7: Fix the stale comment in `advance()`**

At `media-tracker-client.tsx:3564-3567`, replace:

```ts
  function advance(item: ContentItem, next: ContentStatus) {
    // Reaching On Review asks who edited it — that's the accountability moment, asked
    // right at this move since there's no separate Edited stage to stop at first.
    if (next === "on_review" && members.length > 0) { setMarkEditedItem(item); return }
```

with:

```ts
  function advance(item: ContentItem, next: ContentStatus) {
    // Reaching On Review (Completed Edit) asks who edited it — the accountability moment,
    // asked at the Edited -> Completed Edit move.
    if (next === "on_review" && members.length > 0) { setMarkEditedItem(item); return }
```

- [ ] **Step 8: Typecheck**

Run: `pnpm typecheck`
Expected: no errors.

- [ ] **Step 9: Commit**

```bash
git add components/media-tracker/media-tracker-client.tsx
git commit -m "feat(media-tracker): add Edited column to the Kanban board"
```

---

### Task 5: "In pipeline" stat — include the new Edited stage

**Files:**
- Modify: `components/media-tracker/media-tracker-client.tsx:3745-3752,4145`

**Interfaces:**
- Consumes: `ContentItem.status` (from Task 4).
- Produces: `stats.edited` now means "items actually in the Edited stage" (previously it meant "items in on_review" — this is a **rename**, not additive, so anything reading the old meaning must be checked). Adds `stats.completedEdit` (the old meaning, renamed). `grep -n "stats\.edited\|stats\.completedEdit" components/media-tracker/media-tracker-client.tsx` confirms the only two read sites are the ones this task updates (line 1134's `StatRow` and line 4145's hero chip).

- [ ] **Step 1: Confirm there are no other call sites before renaming**

Run: `grep -n "stats\.edited" "components/media-tracker/media-tracker-client.tsx"`
Expected output: two lines — `1134:      <StatRow label="Edited" value={stats.edited} color="#0EA5E9" />` and `4145:          { icon: <Video size={11} />, label: \`${stats.readyToEdit + stats.edited} in pipeline\` },`. If more lines appear, read each one before proceeding — this step's edits assume exactly these two.

- [ ] **Step 2: Rename the old field and add the new one**

At `media-tracker-client.tsx:3745-3752`, replace:

```ts
  const stats = useMemo(() => {
    const readyToEdit = items.filter(i => i.status === "ready_to_edit").length
    const edited = items.filter(i => i.status === "on_review").length
    const readyToPost = items.filter(i => i.status === "branding_ready" || i.status === "ads_ready").length
    const posted = items.filter(i => i.status === "posted").length
    const totalPosts = items.reduce((s, i) => s + i.posts.length, 0)
    return { readyToEdit, edited, readyToPost, posted, totalPosts }
  }, [items])
```

with:

```ts
  const stats = useMemo(() => {
    const readyToEdit = items.filter(i => i.status === "ready_to_edit").length
    const edited = items.filter(i => i.status === "edited").length
    // Renamed from the old "edited" meaning (this table used to treat on_review as the
    // edited/reviewed checkpoint, before Edited became its own real stage).
    const completedEdit = items.filter(i => i.status === "on_review").length
    const readyToPost = items.filter(i => i.status === "branding_ready" || i.status === "ads_ready").length
    const posted = items.filter(i => i.status === "posted").length
    const totalPosts = items.reduce((s, i) => s + i.posts.length, 0)
    return { readyToEdit, edited, completedEdit, readyToPost, posted, totalPosts }
  }, [items])
```

- [ ] **Step 3: Update the two read sites**

At `media-tracker-client.tsx:1134`, replace:

```tsx
      <StatRow label="Edited" value={stats.edited} color="#0EA5E9" />
```

with:

```tsx
      <StatRow label="Completed Edit" value={stats.completedEdit} color="#0EA5E9" />
```

At `media-tracker-client.tsx:4145`, replace:

```tsx
          { icon: <Video size={11} />, label: `${stats.readyToEdit + stats.edited} in pipeline` },
```

with:

```tsx
          { icon: <Video size={11} />, label: `${stats.readyToEdit + stats.edited + stats.completedEdit} in pipeline` },
```

- [ ] **Step 4: Typecheck**

Run: `pnpm typecheck`
Expected: no errors — if `stats.edited` or `stats.completedEdit` is referenced anywhere Step 1's grep missed, this will surface it as a type error (both fields now exist, so a mismatch would show up as an unrelated symbol, not a missing one — re-grep if anything looks off).

- [ ] **Step 5: Commit**

```bash
git add components/media-tracker/media-tracker-client.tsx
git commit -m "fix(media-tracker): stats.edited now counts the actual Edited stage"
```

---

### Task 6: Poster date label — "Shot Date" → "Created Date"

**Files:**
- Modify: `components/media-tracker/media-tracker-client.tsx:1647` (`NewContentModal`)
- Modify: `components/media-tracker/media-tracker-client.tsx:1943` (`EditContentModal`)

**Interfaces:**
- Consumes: `contentType` (already in scope in both modals — `NewContentModal`'s is fixed to `defaultContentType` at line 1598, `EditContentModal`'s is fixed to `item.content_type` at line 1895).
- Produces: no data/type change — label text only. The underlying `shot_date` field, column, and all date arithmetic reading it are untouched.

- [ ] **Step 1: Update `NewContentModal`'s label**

At `media-tracker-client.tsx:1647`, replace:

```tsx
          <label style={LABEL}>Shot Date</label>
```

(the one inside `NewContentModal`, immediately preceded by `<input type="date" ... value={shotDate}` a few lines below it — confirm via the surrounding `const contentType = defaultContentType` at line 1598 in the same function) with:

```tsx
          <label style={LABEL}>{contentType === "poster" ? "Created Date" : "Shot Date"}</label>
```

- [ ] **Step 2: Update `EditContentModal`'s label**

At `media-tracker-client.tsx:1943`, replace:

```tsx
          <label style={LABEL}>Shot Date</label>
```

(the one inside `EditContentModal`, confirm via `const contentType = item.content_type` at line 1895 in the same function) with:

```tsx
          <label style={LABEL}>{contentType === "poster" ? "Created Date" : "Shot Date"}</label>
```

- [ ] **Step 3: Confirm no other "Shot Date" label needs the same treatment**

Run: `grep -n "Shot Date" "components/media-tracker/media-tracker-client.tsx"`
Expected: the two lines just changed, plus three more (originally ~2474, ~2794, ~3046) inside shoot-completion-specific forms (`source: 'shoot'` video only, never posters) — leave those three untouched. If any of those three turns out to also render for posters, stop and re-check before editing further.

- [ ] **Step 4: Typecheck**

Run: `pnpm typecheck`
Expected: no errors.

- [ ] **Step 5: Commit**

```bash
git add components/media-tracker/media-tracker-client.tsx
git commit -m "fix(media-tracker): poster date field reads Created Date, not Shot Date"
```

---

### Task 7: Full verification

**Files:** none (verification only)

- [ ] **Step 1: Run the full test suite**

Run: `pnpm test`
Expected: all tests pass, including the updated `pipeline-transitions.test.ts` and `overview.test.ts`.

- [ ] **Step 2: Full typecheck**

Run: `pnpm typecheck`
Expected: no errors.

- [ ] **Step 3: Production build**

Run: `pnpm build`
Expected: exit code 0, all routes compile.

- [ ] **Step 4: Manual smoke test**

Start the dev server (`pnpm dev`), open the Media Tracker's Pipeline tab for both a video item in Ready to Edit and a poster item in Design, and confirm:
- Both boards now show an "Edited" column between production and "Completed Edit".
- Moving a card into Edited is a plain one-click move (no form).
- Moving a card from Edited into Completed Edit opens the existing editor/date/drive-link form.
- A card sitting in Edited can still be cancelled from its kebab menu.
- Creating or editing a poster shows "Created Date" as the date field label; a video still shows "Shot Date".
