# Content & Ads Tracker — Shoot Scheduling (Phase 1) — Design Spec

**Date:** 2026-07-13
**Status:** Approved for planning
**Author:** Sajee + Claude

## Summary

Add a shoot-scheduling entry point to the Content & Ads Tracker, so a shoot can be
scheduled, marked "Going" on the day, marked "Done" (which auto-creates the resulting
video content items in the existing Pipeline), or "Cancelled" at any point before
completion — including after the crew has already left, per the stated real-world case
of a shoot falling through after reaching the location.

This is **Phase 1** of a larger roadmap (see below) — it ends once a shoot produces
content items at "Shot" status in the existing Pipeline tab. It does not touch
Editing/Edited/Ready-to-Post — those are separate phases.

## Roadmap (context — not this spec)

| Phase | What | Depends on |
|---|---|---|
| **1 (this spec)** | Shoot scheduling: Scheduled → Going → Done/Cancelled, auto-creates content items | — |
| 2 | "Who's starting?" accountability prompts (Editing, and Going) | Phase 1 |
| 3 | Correction loop for content items (parallel to the existing ad correction history, but for videos/posters) | — |
| 4 | "Ready to Post" scheduled status + WhatsApp 10-minutes-before reminder | Phase 3 |
| 5 | Posting Log shows upcoming scheduled posts, not just history | Phase 4 |

Posters are not part of this roadmap's shoot flow — per the user's explicit
clarification, shoots only ever produce video content; posters are created directly via
the existing "New Content Item" modal, unchanged.

## Discovery that shaped this design

There are **three existing places** that touch the `shoots` table:
1. Content Calendar's "Shoot Schedule" mode (calendar display of shoot events)
2. A standalone `/admin/shoots` + `/member/shoots` page with its own full logistics form
   (title, client, location, start/end time, team, equipment, travel expense/time) and
   `lib/actions/shoots.ts` (`createShoot`, `updateShootStatus`, `deleteShoot`)
3. This new spec — a **simplified** shoot-scheduling entry point inside the Content &
   Ads Tracker

To avoid duplicate/diverging logic, Phase 1 **extends** `lib/actions/shoots.ts` and the
`shoots` table rather than creating a parallel implementation. The existing
`/admin/shoots` / `/member/shoots` page and its heavier form are **left untouched** —
they keep working exactly as they do today (their Complete/Cancel buttons still call the
same, now-extended, `updateShootStatus`). Only the new Tracker tab gets the new
simplified UI and the new "Going" transition.

## Non-Goals

- No changes to Content Calendar's Shoot Schedule mode.
- No changes to the existing `/admin/shoots` / `/member/shoots` page's UI (form fields,
  buttons) — it continues to work via the extended shared actions, but isn't redesigned.
- No poster support in the shoot flow (posters are created directly, unchanged).
- No Editing/Edited/Ready-to-Post/WhatsApp-reminder changes — Phases 2-5.
- No "who is going" accountability prompt on the Going transition — that's Phase 2's
  "who's starting" concept, applied consistently to both Going and Editing together.

## Data model

### Migration: extend `shoots`

```sql
alter table shoots add column if not exists notes text;

alter table shoots drop constraint if exists shoots_status_check;
alter table shoots add constraint shoots_status_check
  check (status in ('scheduled', 'going', 'completed', 'cancelled'));
```

`title`, `location`, `start_time`, `end_time` remain `NOT NULL` — unchanged, so the
existing `/admin/shoots` page and Content Calendar's queries are unaffected. The new
simplified Tracker form supplies defaults for these under the hood (see Server Actions).

### New table `shoot_titles`

One shoot can produce multiple video titles (e.g. one shoot session → 3 separate
videos). Each title becomes its own `content_items` row once the shoot is marked Done.

```sql
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

`content_item_id` starts `null` and is set when Done auto-creates the content item —
this both provides traceability ("this video came from that shoot") and prevents
double-creation if Done is ever triggered more than once for the same shoot.

## Server actions (extend `lib/actions/shoots.ts`)

### `createShootWithTitles` (new)

Simplified creation path used only by the new Tracker tab:

```
input: { client: string; titles: string[]; shot_date: string; shot_time?: string; notes?: string }
```

- Inserts one `shoots` row: `title` = a computed summary (e.g. `"${titles.length} video(s)"`
  or the first title if only one), `client`, `location = ''`, `start_time` = `shot_date`
  + (`shot_time` or a default `09:00`), `end_time` = `start_time` + 2 hours (placeholder),
  `status = 'scheduled'`, `notes`.
- Inserts one `shoot_titles` row per title.
- At least one title is required; title text cannot be blank.

The existing `createShoot` (full logistics form, used by `/admin/shoots`) is untouched.

### `updateShootStatus` (extended)

Signature changes from `'scheduled' | 'completed' | 'cancelled'` to
`'scheduled' | 'going' | 'completed' | 'cancelled'`.

Valid transitions enforced server-side:
- `scheduled → going`
- `scheduled → cancelled`
- `going → cancelled` (covers "cancelled after reaching the location")
- `going → completed`

Any other transition returns an error rather than silently applying.

**On transition to `completed`:** for every `shoot_titles` row under this shoot where
`content_item_id is null`, insert a `content_items` row:
```
status: 'shot', content_type: 'video',
client_name: shoot.client, shot_date: date part of shoot.start_time,
shot_by: current user, notes: shoot.notes, created_by: current user
```
then update that `shoot_titles` row's `content_item_id` to the new row's id.

The existing `/admin/shoots` page's Complete/Cancel buttons call this same action — a
shoot completed from that page also auto-creates content items for any titles under it
(most shoots from that page will have zero `shoot_titles` rows since they predate this
feature, in which case nothing is created — no behavior change for them).

## UI — new "Shoots" tab

Fourth tab in the Content & Ads Tracker, alongside Pipeline / Posting Log / Ads Tracker.

**Shoot card:** client name, shoot date, status badge (Scheduled/Going/Completed/
Cancelled, color-coded), title chips (one per `shoot_titles` row), and stage-appropriate
action buttons:
- **Scheduled:** "Mark Going" · "Cancel"
- **Going:** "Mark Done" · "Cancel"
- **Completed / Cancelled:** read-only, no actions

**"New Shoot" modal:** Client (`ClientSelector`, universal list), repeatable Title field
(type a title, press Add, appears as a removable chip — at least one required), Shot
Date, optional Time, Notes. Matches the user's example form, extended for multiple
titles.

**Filters:** client and status, consistent with the other three tabs.

## Testing / Verification

- `pnpm typecheck` and `pnpm lint` clean.
- Manual verification:
  - Create a shoot with 2 titles; confirm both appear as chips on the card.
  - Mark Going; confirm button changes to Mark Done / Cancel.
  - Mark Cancelled from Going; confirm it lands in a terminal Cancelled state with no
    content items created.
  - Mark Done on a different shoot; confirm one `content_items` row per title appears in
    the Pipeline tab's "Shot" column, with correct client/date/notes.
  - Confirm the existing `/admin/shoots` page still creates/completes/cancels shoots
    normally (regression check on the shared action).
  - Mobile: shoot cards and title chips don't overlap at 360px.

## Risks / Trade-offs

- **Two different "New Shoot" forms now exist** (the full logistics form on
  `/admin/shoots`, and this simplified one in the Tracker) — intentional per the user's
  "keep it simple" decision, but worth being aware this is asymmetric, not a redesign of
  the older page.
- **`shoots.title` becomes a computed placeholder** for Tracker-created shoots rather
  than a meaningful title — acceptable since the real titles live in `shoot_titles`, and
  the old page's title field remains meaningful for shoots created there.
- **This is Phase 1 of 5.** Editing accountability, correction loop, and Ready-to-Post
  scheduling are explicitly out of scope here — resist folding them in opportunistically.
