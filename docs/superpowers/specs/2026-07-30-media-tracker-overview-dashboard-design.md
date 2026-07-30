# Media Tracker — Overview Dashboard Redesign (Phase 1 of 4) — Design

**Date:** 2026-07-30
**Status:** Approved for planning
**Area:** Media Tracker

## Summary

Redesign the Media Tracker's **Overview** tab to match a reference "media operations
dashboard" style the user supplied (KPI-forward, pipeline-breakdown, client-delivery-status
layout), using the app's own brand and typefaces rather than the reference's own colors.
Confirmed over several rounds of an HTML mockup published as an Artifact (final: v6) —
this spec documents what that mockup actually shows and how it maps onto real data.

This is **Phase 1 of 4** in the wider Media Tracker redesign the user asked for. Phases 2–4
(Video/Poster kanban tracker restyle, per-client Branding dashboard, final consistency
pass) are separate, later specs — not covered here.

## Background

The Overview tab already exists (see `2026-07-14-tracker-overview-tab-design.md`): Needs
Attention list, Branding/Ads "waiting to post" tiles, a per-client KPI table
(`buildClientKPIs` → `overviewBrandingKPIs`/`overviewAdsKPIs`), and Videos/Posters/Shoots
stage-count blocks (`OverviewBlock`). This redesign restyles and reorganizes that same
underlying information — plus a handful of new aggregate rollups — into a different visual
composition. It is **not** a rewrite of the Overview's data model from scratch.

## Scope (Phase 1 only)

- Only the Overview tab's render (`mode === "overview"` block in
  `components/media-tracker/media-tracker-client.tsx`, currently ~lines 4669–4866).
- `PageHero` and `TrackerNav` are **unchanged** — reused exactly as they render today.
- Video / Poster / Ads / Schedule tabs are unchanged — each already has its own spec and
  is untouched by this one.

## Non-Goals

- No schema or migration changes. Every number is derived from data already captured
  (`content_items`, `content_posts`, `shoots`, `ads_tracker`, `clientTargets`) — same
  constraint the original Overview spec set for itself.
- No "Projects" concept — Media Tracker has clients, not a separate projects table; the
  reference screenshot's "Active Projects" KPI doesn't map to anything real (see below).
- No change to how a client's monthly target is *set* — still the existing
  `EditableTargetCell` / `handleSetOverviewTarget` flow, just relocated into the new
  Client Delivery Status table instead of the old KPI table.

## Visual design (confirmed via mockup)

- **Hero: completely unchanged.** Reuses `components/admin/PageHero.tsx` verbatim —
  same gradient, decorative circles, "Media Operations" eyebrow, "Media Tracker" title,
  the 4 chips, and the real illustration (`/brand/content-cal-hero-girl.png`) + glass-stat
  trio. The filter bar sits directly below the hero (both above the two-column layout).
- **Layout:** a two-column, two-tone composition instead of a stack of identical white
  cards:
  - **Left rail** (dark ink `#0B0F1A → #1B2233` gradient, ~296px on desktop): Needs
    Attention, Today's Operations (2×2 stat grid), and Monthly Progress — shown as a
    circular "aperture ring" (on-brand for a media-production tool) instead of a flat bar.
  - **Main column**: Client Delivery Status (the one real bordered/tabular card), How Work
    Moves (a single connected flow line — replacing the reference's 3 separate pipeline
    cards + a separate funnel, which duplicated the same data in two shapes), Upcoming
    Schedule (a plain ruled list), Content in Flight (Videos/Posters/Shoots stat-strip).
  - Below 900px, the rail stacks **above** the main column, same content order as desktop
    (mobile-first rule — no reordering between breakpoints).
- **Typography:** headings, big numbers, and client names use `var(--font-fraunces)` —
  already declared in `app/layout.tsx` but not used anywhere else in the app today,
  finally given a job. Body/data text stays on the existing global
  `var(--font-jakarta)` (Plus Jakarta Sans) — no new font dependency; both are already
  loaded via `next/font/google` in `app/layout.tsx`.
- **Color:** existing brand/status tokens throughout, plus one new accent — a warm gold
  (`#C9A15A`) used *only* on the dark rail (progress-ring arc, section dividers, a
  sprocket-hole texture strip along its left edge, a nod to film-strip perforations). Not
  introduced anywhere else in the design system.
- **Client Delivery Status "On Track / Behind / Completed":** pace-based — On Track when
  completion% ≥ the % of the month elapsed so far; Behind when it trails that; Completed
  once Published ≥ Target. (Confirmed choice over a flat threshold.)
- **Dropped from the original brief:** a "Total Clients" / "Active Projects" KPI pairing
  was discussed early on (Active Projects → "clients with a branding/ads target set this
  month"). Once the hero was locked as unchanged, there was no remaining slot for these in
  the mockup. Not part of this build — could be added to the rail later if still wanted.

## Data mapping — reused as-is (no new logic)

| Element | Source |
|---|---|
| Needs Attention | `computeOverview().attention` (`lib/media-tracker/overview.ts`) — same 7 candidate rows, unchanged |
| "Editing Reviews" rail stat | same `on_review` status count `computeOverview()` already produces (`awaitingReview`) |
| "Shoots" rail stat (today) | same `shootsToday` already computed inline in the client component |
| Content in Flight stat-strip (Videos/Posters/Shoots) | `overview.videos` / `overview.posters` / `overview.shoots` — the exact data `OverviewBlock` renders today, just restyled |
| Upcoming Schedule | existing Schedule tab data layer (`lib/media-tracker/schedule.ts`, `ScheduleEntry[]`) — read-only reuse, not modified |
| Client Delivery Status: published/unposted/unedited base figures | existing `buildClientKPIs` output (today's `overviewBrandingKPIs`) |
| Target (editable) | existing `clientTargets` table + `EditableTargetCell` + `handleSetOverviewTarget` — relocated, not reimplemented |

## Data mapping — new logic needed

1. **Today's Operations → "Branding Posts" / "Advertisements" counts.** No existing
   aggregate for "posts actioned today" by destination. New: count of posts
   scheduled/posted today, split Branding vs. Ads. Exact definition (scheduled-for-today
   vs. posted-today) to be nailed down in the implementation plan.
2. **Monthly Progress ring (rail).** Today's per-client KPI table is scoped to *one*
   content type at a time via a toggle. New: a company-wide roll-up summing Target and
   Published across **all active clients** and **both content types** for the selected
   month. New pure function alongside `computeOverview`, e.g.
   `computeMonthlyBrandingRollup()` in `lib/media-tracker/overview.ts`.
3. **Client Delivery Status table.** Extends the existing per-client KPI shape
   (`client, posted, unposted, unedited`) with: `target` (summed across content types,
   not toggle-scoped), `editing`/`readyToPublish` stage breakdowns, `remaining`
   (target − published), `completion%`, and the pace-based `status`. New function
   combining the existing per-client-per-content-type data.
4. **How Work Moves flow.** Deliberately mixes a **live snapshot** (Shoots, Editing,
   Ready to Publish, Scheduled — "right now") with **all-time cumulative** totals
   (Posted, Used in Ads — "ever"). `computeOverview()` only exposes live/range-scoped
   counts today, not unconditional all-time totals. New: two extra all-time aggregates.
5. **Flow flag — "N ad campaigns pending approval": no current status maps to this.**
   `AdStatus` today is `active | testing | paused | stopped` — there is no approval
   workflow. **Open question for planning** (not guessed at here): relabel to an existing
   status (e.g. "testing"), drop the flag entirely, or add a real approval concept.
6. **Flow flag — "N branding post overdue": has a precedent.** The original 2026-07-14
   Overview spec already defines "Overdue" for posting-log items past their
   `scheduled_post_date`. Reuse that exact definition, scoped to Branding-destined items.

## Filter bar — scope is an open question

The mockup shows a full bar: Search, Client, Team Member, Month, Date range, Content
Type, Platform, Status. Today's real Overview only has a content-type toggle plus a
month/week/custom range selector on the KPI table. Wiring all eight controls to actually
filter every section at once (Needs Attention, Delivery table, Flow, Schedule, Content in
Flight) is a meaningfully bigger feature than the rest of this redesign.

**Recommendation for the implementation plan:** ship Phase 1 with the filter bar rendered
in its new visual style but only the two controls that already function today wired up
(content type + month/range); treat full-text Search, Team Member, Platform, and Status
filtering as a fast-follow, rather than silently over- or under-building this now.

## Component architecture

`components/media-tracker/media-tracker-client.tsx` is already 5,586 lines. Following the
precedent already set by the Schedule tab (`components/media-tracker/schedule/`), this
redesign gets its own folder instead of growing the monolith further:

- `components/media-tracker/overview/overview-dashboard.tsx` — top-level layout (rail +
  main column); receives pre-computed data as props, no fetching of its own.
- `components/media-tracker/overview/overview-rail.tsx` — Needs Attention, Today's
  Operations, Monthly Progress ring.
- `components/media-tracker/overview/delivery-status-table.tsx` — the Client Delivery
  Status table.
- `components/media-tracker/overview/work-flow.tsx` — the "How Work Moves" flow line +
  flags.
- `lib/media-tracker/overview.ts` — extended with the new pure functions listed above
  (items 1–4), unit-tested with Vitest matching the existing `overview.test.ts` pattern.

`MediaTrackerClient` passes the same `items`/`shoots`/`ads`/`clientTargets`/`members` it
already loads into `OverviewDashboard` — no new Server Actions or data-fetching changes.

## Responsive / mobile

Rail stacks above the main column below 900px, same content order as desktop (no
reordering between breakpoints, per the project's mobile-first rule). Filter bar wraps to
multiple rows. The flow line and stat-strips scroll horizontally on narrow screens rather
than compressing unreadably — already proven in the mockup down to 360px.

## Testing / Verification

- `pnpm typecheck` and `pnpm lint` clean.
- Vitest unit tests for the new `lib/media-tracker/overview.ts` functions: rollup math,
  pace-based status boundary exactly at the elapsed-% threshold, all-time totals.
- Manual regression: numbers in the new Client Delivery Status table match what the old
  per-client KPI table showed for the same client/month, before this change replaces it.
- Manual: clicking a Needs Attention row / flow flag still navigates to the right tab
  (same `goTo()` behavior as today).
- Mobile check at 360px: rail-then-main stacking with no overlap; flow line and
  stat-strips scroll horizontally without breaking layout.

## Risks / Trade-offs

- Two open questions (filter bar scope, the ads "pending approval" concept) are called
  out above rather than guessed at — resolving them should be the first step of the
  implementation plan.
- The new company-wide rollups (Monthly Progress ring, Delivery Status target/remaining)
  recompute on every render, same as the rest of the Overview tab today — same
  "point-in-time" trade-off already accepted in the original Overview spec.
- Splitting into a new `overview/` folder touches only the current `mode === "overview"`
  render — the rest of the 5,586-line file is untouched by this phase.
