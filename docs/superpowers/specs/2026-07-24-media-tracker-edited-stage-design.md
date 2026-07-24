# Media Tracker — Reintroduce "Edited" Stage — Design

**Date:** 2026-07-24
**Status:** Approved
**Area:** Content & Media Tracker → Video and Poster pipelines

---

## Problem

Today, moving a video out of **Ready to Edit** (or a poster out of **Design**) goes
straight to **On Review**, and that single move is also where the "who edited this,
when, and where's the drive link" form appears. There is no distinct point in the
board where "the editor has finished and handed it off" is visible on its own — it's
folded into the same click that also represents "sent for review."

This used to be modeled as a separate `edited` status (migrations 094/096), but it was
deliberately merged into `on_review` in migration 100/105 to simplify the graph. That
simplification is being reversed: the two moments — *editor hands off finished work*
and *admin reviews and approves it forward* — need to be visible as two separate
columns again.

Separately, "On Review" as a label is confusing once the admin's review action *is* the
edit form itself — it reads as "still under review" when really the sign-off already
happened at that click. It becomes **Completed Edit**.

And unrelated to the pipeline: posters reuse the video pipeline's "Shot Date" field and
label, but a poster isn't shot, it's designed — the label should say "Created Date" for
posters.

## Goal

Insert a real `edited` stage between the production stage (Ready to Edit / Design) and
the review gate, for **both** video and poster pipelines. Rename the review-gate stage's
display label to "Completed Edit". Fix the poster date label.

---

## The shape of it

```
Video:  Ready to Edit → Edited → Completed Edit ─┬─→ Branding Ready → Posted
                                                  ├─→ Ads Ready     → Posted
                                                  └─→ Cancelled

Poster: Design → Edited → Completed Edit ─┬─→ Branding Ready → Posted
                                          ├─→ Ads Ready     → Posted
                                          └─→ Cancelled
```

`Edited` is a shared stage — same column, same status value, regardless of whether the
item arrived from Ready to Edit or Design. Cancelling stays possible from `Edited`
(same as it's possible from Ready to Edit/Design today) — it's still pre-approval.

The move **into** `Edited` is a plain one-click move, no form (there's nothing to
capture yet — the editor is just handing it off). The move from `Edited` **into**
`Completed Edit` (renamed `on_review`) is where the existing "Mark Edited" form still
appears — who edited it, edited date, drive link — unchanged from today, just shifted
one step later in the flow.

---

## Data model

New migration `113_content_item_edited_status.sql`:

```sql
alter table content_items drop constraint content_items_status_check;
alter table content_items add constraint content_items_status_check
  check (status in (
    'scripting','voiceover','design','ready_to_edit','edited',
    'on_review','branding_ready','ads_ready','posted','cancelled'
  ));
```

No backfill. Existing rows keep whatever status they're already in; only new forward
moves pass through `edited`. `on_review` stays the DB value for the renamed
"Completed Edit" stage — this is a display-only rename, nothing reads or writes a
different column value.

## Pipeline transitions (`lib/media-tracker/pipeline-transitions.ts`)

```ts
export type ContentPipelineStatus =
  | 'scripting' | 'voiceover' | 'design' | 'ready_to_edit' | 'edited'
  | 'on_review' | 'branding_ready' | 'ads_ready' | 'posted' | 'cancelled'

const TRANSITIONS = {
  ...
  ready_to_edit: ['edited', 'cancelled'],   // was ['on_review', 'cancelled']
  design:        ['edited', 'cancelled'],   // was ['on_review', 'cancelled']
  edited:        ['on_review', 'cancelled'], // new
  on_review:     ['branding_ready', 'ads_ready', 'cancelled'], // unchanged
  ...
}
```

`ENTRY_STATUS` and `SOURCE_ONLY_STATUS` are unaffected — `edited` isn't source-restricted,
same as `on_review`/`branding_ready`/etc. already aren't.

`pipeline-transitions.test.ts` needs new cases: `ready_to_edit → edited` and
`design → edited` valid; `edited → on_review` valid; `edited → cancelled` valid;
`edited → branding_ready`/`ads_ready`/`posted` rejected (must go through `on_review`
first); `ready_to_edit → on_review` now rejected (must go through `edited` first,
this is a changed assertion, not just a new one).

## UI (`components/media-tracker/media-tracker-client.tsx`)

- `STATUS_CFG`: new entry `edited: { label: "Edited", accent: "#8B5CF6" }`.
  `on_review.label` changes from `"On Review"` to `"Completed Edit"` (accent unchanged).
- `VIDEO_PIPELINE_ORDER`: `["ready_to_edit", "edited", "on_review", "branding_ready", "ads_ready", "cancelled"]`
- `POSTER_PIPELINE_ORDER`: `["design", "edited", "on_review", "branding_ready", "ads_ready", "cancelled"]`
- `NEXT_STATUS`: `ready_to_edit: "edited"`, `design: "edited"`, `edited: "on_review"`.
- `advance()`'s special-case check (`next === 'on_review'` opens `MarkEditedModal`) is
  unchanged — it already fires correctly once `NEXT_STATUS.edited === 'on_review'`. No
  modal code changes needed.
- Card display nuances to carry through for the new `edited` stage (matching how
  `ready_to_edit`/`design` cards behave today, since an `edited` item still has no
  `edited_date`/`editedByUser` yet):
  - The origin-date badge (currently hidden once a card reaches `on_review` or later)
    stays visible for `edited` cards too.
  - The age-since-entering-stage badge (currently shown only for `ready_to_edit`/`design`)
    extends to `edited` cards as well.
  - The voice-over-by badge (currently shown for `voiceover`/`ready_to_edit` ads-video
    cards) extends to `edited` cards too, for the same reason — it's still relevant
    metadata until the card reaches `on_review`.

## Reporting (`lib/media-tracker/overview.ts`)

- `OverviewStatus` gains `'edited'`.
- `emptyStages()` gains `edited: 0`.
- `stuckEditing` stays scoped to `ready_to_edit`/`design` only (editing isn't "stuck" once
  it's already been handed off as Edited).
- `awaitingReview` stays scoped to `on_review` only (that's still specifically the
  Completed-Edit/branch-decision gate).
- `edited` items simply appear in the per-content-type stage counts, same as every other
  stage — no new named aggregate metric is added for it (YAGNI; can be added later if
  actually needed).
- `overview.test.ts` gets `edited` added to the zero-state and stage-count fixtures it
  already enumerates.

## Poster date label (independent of the above)

In `NewContentModal` and `EditContentModal`, the "Shot Date" label becomes:

```tsx
<label style={LABEL}>{contentType === "poster" ? "Created Date" : "Shot Date"}</label>
```

`contentType` is already in scope in both modals. The underlying `shot_date` field name,
column, and all date-arithmetic that reads it (`enteredStageSince`, etc.) are unchanged —
this is a label-only change scoped to these two modals. The shoot-completion-specific
forms (lines ~2474/2794/3046) are for `source: 'shoot'` video items only and are untouched.

---

## Out of scope

- No new named Overview metric for "awaiting hand-off" / time-in-Edited tracking.
- No change to `isStatusAllowedForSource` wiring (it's already unused/dead in both the
  client drag-and-drop and the server action today — this design doesn't touch that
  existing gap, just doesn't make it worse).
- No change to the Ads Video sub-board (`scripting`/`voiceover` columns) — this only
  touches the shared production board (Ready to Edit/Design onward).
