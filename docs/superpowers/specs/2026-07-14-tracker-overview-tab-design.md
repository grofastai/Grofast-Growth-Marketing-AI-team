# Content & Ads Tracker — Overview Tab — Design Spec

**Date:** 2026-07-14
**Status:** Approved for planning
**Author:** Sajee + Claude

## Summary

Add an **Overview** tab to the Content & Ads Tracker: a single read-only summary screen
showing where everything stands, so you don't have to click through Shoots → Pipeline →
Posting Log to find out. Every number is computed from data already in the app — no new
fields, no new typing, no schema change.

## Scope

This is the surviving half of what was originally "Phase 5". The other half — restructuring
the Ads side into Campaign / Ad Set / Creative records (objective, budget, audience,
placements, CTA, landing page) — is **owned by Sanjay** and is explicitly out of scope
here. The Overview's Ads block is therefore deliberately shallow (status counts only), so
this work doesn't collide with his.

## Non-Goals

- No Campaign/Ad Set/Creative restructure (Sanjay's).
- No ROAS, revenue, or CPL-based "Top Campaign" — ROAS needs revenue per ad, which the
  user chose not to track. Leaving the whole ads-metrics question to Sanjay.
- No new DB columns or tables. Everything is derived from existing data.
- No WhatsApp reminders (still blocked by Vercel Hobby's ±59min cron drift).

## Tab layout

The mode switcher gains Overview as the first tab, and it becomes the default landing tab:

```
[ Overview ] [ Video ] [ Poster ] [ Ads ]
```

Video keeps its existing sub-tabs (`Shoots → Pipeline → Posting Log`). Poster keeps its
own (`Pipeline → Posting Log` — posters aren't shot, so no Shoots sub-tab). Ads has no
sub-tabs. Overview has no sub-tabs.

## What the Overview shows

All counts respect the company's existing data; none of them require new input.

| Block | Content | Derived from |
|---|---|---|
| **Videos** | Count per stage: Shot · Editing · Edited · Ready to Post · Posted | `content_items` where `content_type = 'video'` |
| **Posters** | Same five stages | `content_items` where `content_type = 'poster'` |
| **Shoots** | Scheduled · Going · Completed | `shoots.status` |
| **Posting** | Due Today · Due This Week · **Overdue** | `content_items` where `status = 'ready'`, keyed on `scheduled_post_date` |
| **Ads** | Active · Testing · Paused · Stopped | `ads_tracker.status` (counts only — deliberately shallow) |
| **Needs Attention** | Actionable list (see below) | derived |

### Definitions (to avoid ambiguity)

- **Due Today** — `status = 'ready'` AND `scheduled_post_date` = today.
- **Due This Week** — `status = 'ready'` AND `scheduled_post_date` falls between today and
  today + 6 days inclusive. (Today's items are counted in *both* Due Today and This Week —
  This Week is a superset, not a remainder.)
- **Overdue** — `status = 'ready'` AND `scheduled_post_date` < today. The scheduled slot
  passed and it still hasn't been marked Posted. This is the single most actionable number
  on the screen.

### Needs Attention

A list of specific, actionable problems rather than a wall of numbers. Each entry links
through to the relevant board. Entries only appear when their count is non-zero:

- **N posts overdue** — as defined above.
- **N items stuck in Editing 7+ days** — `status = 'editing'` and the item has been in that
  state for 7+ days. **The "since" date is the latest of `shot_date` and the most recent
  `content_corrections.correction_date`** — because an item that was just bounced back for
  a correction has an old `shot_date` but has only *just* re-entered Editing. Using
  `shot_date` alone would wrongly flag it as stalled the moment it's returned.
- **N shoots scheduled today** — `shoots.status IN ('scheduled','going')` with today's date.
- **N items bounced back 2+ times** — items with 2 or more rows in `content_corrections`.
  Surfaces repeatedly-rejected content that's burning time.

If every count is zero, the block shows a single "All clear" line rather than an empty box.

## Interaction

**Numbers are clickable, not decorative.** Clicking a figure switches to the board it came
from with the relevant filter applied — e.g. clicking **Overdue: 2** jumps to Video →
Posting Log; clicking **Editing: 18** jumps to Video → Pipeline. Without this it's just a
wall of numbers you can't act on.

Clicking a poster figure switches to Poster mode; clicking a video figure switches to
Video mode. Shoots figures go to Video → Shoots. Ads figures go to Ads.

## Architecture

No new data layer. The Overview is a pure derivation over the `items`, `shoots` and `ads`
arrays the client component already holds:

- **New:** `lib/content-tracker/overview.ts` — a pure module computing the whole summary
  from `(items, shoots, ads, today)`. Unit-tested with Vitest, mirroring the existing
  `lib/ads-tracker/performance-metrics.ts` and `lib/shoots/status-transitions.ts` pattern.
  Keeping the date arithmetic (overdue / this week / 7-days-stuck) in a pure, tested module
  matters — off-by-one date bugs are exactly the kind of thing that silently misreports.
- **Modified:** `components/content-tracker/content-tracker-client.tsx` — adds the
  `overview` mode, the tab entry, and the render. The counts come from the pure module, so
  the component stays presentational.

`getContentTrackerData` is unchanged — it already returns everything needed.

## Testing / Verification

- `pnpm typecheck` and `pnpm lint` clean.
- Vitest unit tests on `lib/content-tracker/overview.ts` covering:
  - stage counts split correctly by video vs poster
  - Due Today / This Week / Overdue boundaries (including the today-is-in-both-buckets rule
    and the day-before/day-after edges)
  - "stuck in Editing" at exactly 6, 7 and 8 days (boundary correctness)
  - "stuck in Editing" uses the *later* of shot_date and the latest correction date — an
    item with an old shot_date but a correction returned today is NOT stalled
  - "bounced 2+ times" at exactly 1 and 2 corrections
  - empty input produces all-zero counts and an "All clear" attention state
- Manual: open the Tracker, confirm Overview is the landing tab, confirm each number
  matches what the corresponding board actually shows, and confirm clicking a number
  navigates to that board.
- Mobile: blocks stack without overlap at 360px.

## Risks / Trade-offs

- **Counts are point-in-time**, computed on render from the loaded data. If someone else
  changes something, the Overview won't update until the page reloads. Acceptable — the
  whole page already works this way.
- **The Ads block is intentionally thin.** It'll look sparse next to the Videos block. That's
  deliberate: Sanjay owns the ads restructure, and a richer ads summary would need the
  campaign/budget data he's adding. Revisit once his work lands.
