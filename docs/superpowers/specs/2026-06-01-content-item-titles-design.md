# Content Item Titles — Design Spec

**Date:** 2026-06-01
**Status:** Approved

## Problem

Members log count-based work (e.g. "Video Edit: 3", "Reel Posting: 2") but there is no way to record *what* was edited or posted. The admin can see totals but not the actual titles of videos, posters, or reels produced. Similarly, the "Posts Published Today" section has no title field, so a post entry of "Reel · Instagram" carries no identifying information.

## Goal

Capture the title of each individual item produced or posted so the admin can see exactly what was worked on each day, not just how many.

---

## Scope

**In scope:**
- `work_logs`: store an array of item titles for count-based activities
- `content_posts`: store an optional title per post
- Member form: dynamic titled-item list for count activities, title field for posts
- Admin views: show titles in insights activity table and daily updates feed

**Out of scope:**
- Search or filter by title
- Linking work_log items to content_post items (same video edited and then posted)
- Making titles required
- Normalising items into their own table (deferred — use array for now)

---

## Data Model

### Migration: `052_content_item_titles.sql`

```sql
-- Item titles for count-based work log entries (one string per item produced/posted)
ALTER TABLE work_logs
  ADD COLUMN IF NOT EXISTS item_titles text[] NOT NULL DEFAULT '{}';

-- Optional title for each published post
ALTER TABLE content_posts
  ADD COLUMN IF NOT EXISTS title text;
```

**`work_logs.item_titles`** — `text[]`, default `{}`. Each element is the title of one produced item. `unit_count` is always equal to `array_length(item_titles, 1)` when titles are present; for legacy rows it remains the plain integer entered previously.

**`content_posts.title`** — `text`, nullable. The title of the published post (e.g. "Summer Sale Reel"). Optional — existing rows have `null` and display fine.

---

## Member Form

### Count-activity cards (`unit_type = 'count'` or `unit_type = 'both'`)

Replace the plain count number input with a dynamic titled-item list.

**State change in `LogState`:**
```typescript
type LogState = {
  activity_id: string
  client_name: string
  hours: string
  item_titles: string[]   // replaces plain unit_count string
  notes: string
}
```

`unit_count` sent to the server = `item_titles.length`. The count is never entered manually.

**UI behaviour:**
- Each title = one text input row with a `×` remove button
- `[+ Add Item]` button appends a blank string to `item_titles`
- A small label below the list shows "N items" (auto-count)
- Hours input still renders separately when `unit_type = 'both'`
- Activities with `unit_type = 'hours'` are unchanged — no item list

**Empty state:** if `item_titles` is empty, the list shows a single blank input pre-added so the member isn't staring at nothing.

### Posts Published Today

Add `title` as the first input in each post row.

```
Title         | Client    | Platform  | Type  | Post Link   | [×]
[           ]   [        ]  [        ]  [    ]  [           ]
```

- Title is optional — member can leave it blank
- Renders as a standard text input matching existing `INP` style

---

## Server Actions (`lib/actions/work-logs.ts`)

### Updated types

```typescript
export type WorkLogInput = {
  activity_id: string
  client_name: string
  hours: number
  unit_count: number      // = item_titles.length (or 0 for hours-only)
  item_titles: string[]   // ← new
  notes: string
}

export type ContentPostInput = {
  title: string           // ← new (empty string if not entered)
  client_name: string
  platform: string
  post_type: string
  post_link: string
  notes: string
}
```

### `submitWorkLogs` changes

- Accept `item_titles` in each `WorkLogInput`, insert into `work_logs.item_titles`
- Accept `title` in each `ContentPostInput`, insert into `content_posts.title`
- No other logic changes — pass-through to Supabase

### Existing data compatibility

Legacy `work_logs` rows have `item_titles = '{}'`. The admin view treats an empty array as "no titles recorded" and shows only the count, same as today.

---

## Admin Views

### Insights page — activity stats table

Add a **Titles** column after the Count column. Renders as an inline pill list:

- Up to 3 titles shown directly: `Summer Sale · Product Demo · Tutorial`
- If more than 3: `Summer Sale · Product Demo +4 more` — clicking expands inline
- If no titles (legacy row or hours-only activity): column is blank
- Titles are aggregated across all members for the selected month — shown as a flat comma-separated list per activity row

### Activities feed (`app/admin/activities` or equivalent daily updates view)

Each member's daily entry gains a title tag list below the activity line:

```
📱 Reel Posting  ·  3 items  ·  Acme Corp
   [Summer Sale Reel]  [Product Launch]  [Tutorial Reel]
```

Tags are small grey pills. No interaction required.

For `content_posts` rows, the title renders as the primary text, with platform/type as secondary:

```
"Summer Sale Reel"  ·  Reel · Instagram  ·  [link]
```

If title is null, falls back to current display: `Reel · Instagram`.

---

## File Map

| File | Action |
|---|---|
| `supabase/migrations/052_content_item_titles.sql` | Create — DB migration |
| `lib/actions/work-logs.ts` | Modify — updated types + insert item_titles/title |
| `app/member/update/activity-update-form.tsx` | Modify — dynamic item list for count activities + title field on posts |
| `app/admin/insights/insights-client.tsx` | Modify — Titles column in activity stats table |
| `app/admin/activities/activities-client.tsx` | Modify — title tags on member entries |

---

## Decisions

| Decision | Choice | Reason |
|---|---|---|
| Storage format | `text[]` array on `work_logs` | Simpler than a new table; sufficient for display |
| Titles required? | No — optional | Avoid blocking existing members; adopt gradually |
| Overlap between Reel Posting activity and Posts section | Keep both, no merge | User confirmed C — both sections coexist |
| Count input removed? | Yes — replaced by item list for count activities | Count = `item_titles.length`; manual entry removed |
| Hours-only activities | Unchanged | No count, no item list needed |
