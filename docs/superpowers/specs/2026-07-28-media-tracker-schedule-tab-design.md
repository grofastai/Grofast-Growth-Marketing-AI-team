# Media Tracker — Schedule Tab — Design

**Date:** 2026-07-28
**Status:** Approved
**Area:** Media Tracker

---

## Summary

Today, "what's scheduled to happen" is scattered: a shoot's date lives on its card in the
Shoots kanban (organized by status, not date), and a content item's `scheduled_post_date`/
`scheduled_post_time` (captured when it's moved to Ready to Post) only shows up on that
item's card inside the Branding/Advertisement tabs. There's no single place to see "what
needs to go out today" across shoots, videos, posters, and ads.

## Goal

Add a new **Schedule** tab to the Media Tracker nav (after Overview / Video / Poster),
giving a date-first view of everything that's been scheduled but hasn't happened yet —
with the ability to act on it directly (mark posted, mark a shoot done, reschedule),
not just look at it.

## Non-Goals

- No new database tables or columns. This reuses `shoots` (existing `start_time`/status)
  and `content_items` (existing `scheduled_post_date`/`scheduled_post_time`) exactly as
  they're captured today.
- No change to how scheduling happens today — a post's date/time is still set at the
  Ready to Post step (`EditContentModal`'s existing schedule fields), a shoot's date is
  still set at shoot creation. This tab is a second, date-oriented **entry point** into
  those same records and the same existing actions, not a new way to create them.
- No change to the existing Shoots kanban tab (Video mode → Shoots) or the
  Branding/Advertisement log tabs — they keep working exactly as they do today.
- History is out of scope — once something is posted (or a shoot is marked Done), it
  drops off this view. Historical record stays in the Branding/Advertisement tabs and the
  Shoots kanban's Completed column, unchanged.

## Shape of it

```
Overview | Video | Poster | Schedule
                              ├─ Shoot   (List | Calendar)
                              ├─ Video   (List | Calendar)
                              ├─ Poster  (List | Calendar)
                              └─ Ads     (List | Calendar)
```

`Schedule` is a new sibling `TrackerMode` (alongside `overview`/`video`/`poster`/`ads`),
self-contained — its four sub-tabs are the content-type axis, replacing the need for the
outer Video/Poster mode switch while inside Schedule. Its nav pill count (matching the
badge every other mode already shows) is `shoots.filter(status === 'scheduled').length +`
the count of distinct content items with a pending `scheduled_post_date` — counted once
per item even though an ads-bound item also appears under the Ads sub-tab.

## What counts as "scheduled" per sub-tab

| Sub-tab | Source | Filter | Sort key |
|---|---|---|---|
| Shoot  | `shoots` | `status = 'scheduled'` | `start_time` |
| Video  | `content_items` | `content_type='video'`, `status in ('branding_ready','ads_ready')`, `scheduled_post_date` set | `scheduled_post_date`+`scheduled_post_time` |
| Poster | `content_items` | `content_type='poster'`, `status in ('branding_ready','ads_ready')`, `scheduled_post_date` set | same |
| Ads    | `content_items` | `status='ads_ready'`, `scheduled_post_date` set (either content type) | same |

**Accepted overlap:** an ads-bound video shows under both **Video** (it's a video) and
**Ads** (it's headed to ads) — Video/Poster group by content type, Ads groups by
destination. This is intentional, confirmed with the user, same spirit as Overview
already counting things along more than one axis.

Completed/Cancelled shoots and Posted content items never appear here — this is a
forward-looking "still pending" view, not a log.

## Views

**List** — agenda-style: grouped by date heading (`Today`, `Tomorrow`, then explicit
dates), soonest first within each group. Anything whose scheduled date/time has already
passed and still isn't posted/done is pulled out into an `Overdue` group pinned above
`Today`, regardless of how old it is.

**Calendar** — month grid. Each day cell shows a count and up to 3 item chips (client +
time); overflow shows "+N more". Clicking a day expands/shows that day's full agenda
below the grid, reusing the same row renderer as List. Prev/Next month arrows and a
"Today" button; no separate month-select filter (the grid itself is the month browser).

Both views read from the same filtered/sorted data — the toggle only changes
presentation, and both share the row renderer to prevent list/calendar drift.

**Filters:** a single client-filter dropdown per sub-tab (matching the client filter
pattern already used on Pipeline/Log/Shoots tabs), applying to both List and Calendar.
No day/month filter beyond the calendar's own navigation — List is unbounded (it only
ever holds pending items, which stays small since posted/done items drop off).

## Actions

No new write logic — every action here calls into a handler that already exists in
`MediaTrackerClient`, so there is exactly one implementation per action regardless of
which tab triggered it.

- **Shoot:** `Mark Done` / `Cancel` → `handleShootStatus(shootId, status)` (Mark Done
  opens the existing `CompleteShootModal` unchanged; there is no separate "Going" status
  in the actual shoot model — only `scheduled`/`completed`/`cancelled` — "who's going" is
  a crew list on the shoot, not a pipeline stage).
- **Video / Poster / Ads:** `Mark Posted` → opens the existing platform-posting modal
  (`setPlatformModalItem`/`setPlatformModalKind`, the same one used from a card's "+"
  action in Branding/Advertisement today). `Reschedule` → opens the existing
  `EditContentModal` (its `scheduled_post_date`/`scheduled_post_time` fields already
  exist; nothing new needed there).

## Component structure

`components/media-tracker/media-tracker-client.tsx` is already large (5000+ lines); this
feature is isolated into its own folder rather than growing that file further:

- `components/media-tracker/schedule/schedule-tab.tsx` — top-level: sub-tab switcher
  (Shoot/Video/Poster/Ads), List/Calendar toggle, client filter, and per-sub-tab
  filtering/sorting into a generic shape. Receives `items`, `shoots`, members, and the
  action handlers listed above as props from `MediaTrackerClient` — no data fetching of
  its own.
- `components/media-tracker/schedule/schedule-list.tsx` — generic agenda list. Takes
  `ScheduleEntry[]` + a row-actions renderer; has no knowledge of shoots vs. content
  items.
- `components/media-tracker/schedule/schedule-calendar.tsx` — generic month grid. Same
  `ScheduleEntry[]` input, delegates day-expansion rows to the same renderer
  `schedule-list.tsx` uses (passed down or factored into a shared `ScheduleRow`
  component) so list and calendar never visually diverge.

```ts
type ScheduleEntry = {
  id: string
  date: string        // YYYY-MM-DD
  time: string | null  // HH:mm, null = no time set
  title: string
  client: string
  accent: string        // reuses STATUS_CFG/SHOOT_STATUS_CFG accent for the item's status
  overdue: boolean
  actions: { label: string; onClick: () => void; danger?: boolean }[]
}
```

`schedule-tab.tsx` is responsible for mapping `shoots`/`content_items` into
`ScheduleEntry[]` per sub-tab — `schedule-list.tsx`/`schedule-calendar.tsx` stay
domain-agnostic and reusable.

## Edge cases

- Scheduled item with no `scheduled_post_time` → shown as an untimed entry, sorted
  before timed entries on the same date.
- Nothing scheduled for a sub-tab/view → empty state, "Nothing scheduled".
- Mobile (360px): List is the practical default; the Calendar grid still works but rows
  become single-column, no side-by-side day cells narrower than content — verified per
  the project's mobile-first rule.

## Testing / Verification

- `pnpm typecheck` and `pnpm lint` clean.
- Manual:
  - Schedule a video's post for today via the existing Ready to Post flow; confirm it
    appears in Schedule → Video (List and Calendar), with today's date/time.
  - Mark it Posted from the Schedule tab; confirm it disappears from Schedule → Video
    and shows up in the Branding (or Advertisement) log tab, same as marking posted from
    there directly would.
  - Schedule a shoot; confirm it appears in Schedule → Shoot; Mark Done from the Schedule
    tab; confirm the existing Shoots kanban reflects the same status change and the item
    drops off Schedule → Shoot.
  - Schedule a video for an ads platform; confirm it appears under both Schedule → Video
    and Schedule → Ads.
  - Reschedule an item's date from the Schedule tab; confirm the change is reflected on
    its card in Pipeline/Branding/Advertisement too (same underlying record).
  - Mobile check at 360px on both List and Calendar.

## Risks / Trade-offs

- **Intentional overlap** between Video/Poster and Ads sub-tabs (see above) — flagged
  explicitly so it isn't mistaken for a bug later.
- **Two entry points to the same actions** (Schedule tab and the original
  card/kanban location) — accepted since both call the same handlers; no duplicated
  business logic, only duplicated UI trigger points.
- This is scoped as a view + existing-action layer only. Any future "10-minutes-before
  WhatsApp reminder" work (mentioned in the earlier shoot-scheduling roadmap as Phase 4)
  is out of scope here and would be its own spec.
