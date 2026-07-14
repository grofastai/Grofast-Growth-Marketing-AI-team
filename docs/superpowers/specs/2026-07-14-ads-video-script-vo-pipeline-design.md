# Ads Video (Script → Voice Over → Edit) Pipeline — Design

**Date:** 2026-07-14
**Status:** Approved
**Area:** Content & Ads Tracker → Video mode

---

## Problem

Today every video in the Tracker must originate from a **shoot**. The board's first
column is literally "Shot", and the only way an item is created is by completing a
shoot and listing its topics.

But a large share of the agency's video output never involves a camera. A script is
written, a freelance RJ records a voice-over, an editor cuts it, and the result is used
as an ad or a social post. That work is currently invisible to the Tracker — there is
nowhere to put it, so nobody can see who is scripting, who is recording, or what is
waiting on an editor.

There is also no explicit **review** step anywhere. An editor marks something "Edited"
and it goes straight to Ready to Post. Nobody signs off.

## Goal

Give non-shoot video its own front half of the pipeline (Scripting → Voice Over), have
it converge with shoot video into one shared production board, and add a real review
gate before anything is scheduled for posting.

---

## The shape of it

Both origins feed one production pipeline:

```
  Shoot ──── done, topics listed ─────────────┐
                                              ↓
  Scripting ──→ Voice Over ────────→  Ready to Edit → Editing → Edited → On Review → Ready to Post → Posted
  └──────── Ads Video ─────────┘      └────────────── shared production board ──────────────┘
```

A video therefore has an **origin**: it either came from a shoot, or it was an ads
video (script + VO). Once it reaches Ready to Edit, the two are treated identically —
same columns, same editor assignment, same review, same posting flow. The origin is
still shown on the card, because "who do I chase if the raw file is missing" depends on
it.

---

## Video mode: four sub-tabs

Video mode currently has *Shoots* / *Pipeline* / *Posting Log*. It becomes:

### 1. Shoot Schedule — *unchanged, one remap*

The existing shoots kanban. `Scheduled → Going → Done / Cancelled`.

Completing a shoot still asks for the topic list and the crew. The only change: the
videos it creates now land in **Ready to Edit** instead of **Shot** (which is the same
column, renamed — see Data below).

### 2. Ads Video — *new*

A two-column kanban for the script/VO half of the pipeline.

**Columns:** `Scripting → Voice Over`

**Creating a card** (`+ New Ads Video`) puts it in Scripting and captures:

| Field | Type | Notes |
|---|---|---|
| Client | select | Universal client dropdown (internal brands pinned first) |
| Title | text | required |
| Hooks | number | how many hook variants the script contains |
| Use for | multi-select | `Ads`, `Instagram`, `Facebook`, `YouTube`, `LinkedIn`, `GMB` |
| Priority | select | `Low` / `Medium` / `High` / `Urgent` |
| Script by | select (team member) | defaults to the current user |
| Notes | textarea | optional — the script brief |

**Scripting → Voice Over** opens a modal asking **who recorded it**. The list is the
active freelance voice-over artists: `freelancers WHERE team = 'Freelance RJ Voiceover'
AND status = 'active'` — today that's AJITHA, RATHNA, RESHMA, SANDHIYA, SASI REKHA,
VIDHYA. Sourcing it from the table (not a hardcoded list) means adding or deactivating
a freelancer is reflected here automatically. The modal also captures the VO date
(defaults to today).

**Voice Over → done** drops the card into **Ready to Edit** on the next board. It is no
longer shown on the Ads Video board.

### 3. Ready to Edit — *the shared production board*

This replaces today's *Pipeline* tab. It is where both shoot videos and ads videos live.

**Columns:** `Ready to Edit → Editing → Edited → On Review → Ready to Post`

- **Ready to Edit** — waiting for an editor. Nobody has claimed it.
- **Editing** — moving a card here asks *"who's editing?"* (the existing accountability
  prompt). This is where `edited_by` is stamped, not on completion.
- **Edited** — the editor is done. This now means only that.
- **On Review** — **new.** Somebody checks the cut. From here it goes one of two ways:
  - **Approve** → Ready to Post. Records who approved it and when.
  - **Needs Correction** → back to **Editing**, with notes and an assignee. *This is the
    existing correction loop, moved here from Edited* — a review stage is exactly where
    a bounce-back belongs, and it keeps Edited meaning "the editor finished".
- **Ready to Post** — approved, scheduled. Also the first column of the next tab.

Cards show origin (🎥 Shoot / 🎙️ Ads Video), client, title, and for ads videos the
priority chip, hook count and "use for" platforms.

### 4. Posted — *renamed from Posting Log, now a board + the log*

**Columns:** `Ready to Post → Posted`

**Ready to Post** is deliberately the *same* column that ends the previous board — it is
the handoff. Moving a card into it (from either board) opens the existing scheduling
modal: which platforms, which date, what time.

Moving it to **Posted** opens the existing posting modal: platforms actually posted to,
the link, and **who posted it**.

The **Posting Log** table stays exactly as it is, below the board.

---

## Poster mode

Posters aren't shot and have no voice-over, so they keep their own simpler flow. Same
board, fewer columns:

```
Design → Editing → Edited → On Review → Ready to Post → Posted
```

Posters gain the **On Review** gate (and inherit the correction loop moving to it), and
their first column is renamed from *Shot* to **Design**, which is what it actually is.
No Scripting, no Voice Over, no shoot.

## Ads mode

Untouched. The Campaign / Ad Set / Creative restructure is separate work.

---

## Data

### `content_items.status` — the full status set

One shared column, with per-mode column subsets. Values:

| Status | Used by | Board |
|---|---|---|
| `scripting` | ads video | Ads Video |
| `voiceover` | ads video | Ads Video |
| `design` | poster | Poster pipeline |
| `ready_to_edit` | video (both origins) | Ready to Edit |
| `editing` | all | Ready to Edit / Poster |
| `edited` | all | Ready to Edit / Poster |
| `on_review` | all | Ready to Edit / Poster |
| `ready_to_post` | all | Ready to Edit + Posted |
| `posted` | all | Posted |

### Renames of existing statuses

Two existing values are renamed. This is a data migration, not just a label change,
because the check constraint enumerates them.

| Old | New | Rows affected today |
|---|---|---|
| `shot` | `ready_to_edit` | 22 videos, 0 posters |
| `ready` | `ready_to_post` | 0 |

`editing` (1 row), `edited`, `posted` (10 rows) are unchanged. Because no poster is
currently in `shot`, the poster `design` column starts empty and no poster row needs
remapping.

### New columns on `content_items`

| Column | Type | Purpose |
|---|---|---|
| `source` | `text NOT NULL DEFAULT 'shoot'`, check in (`shoot`, `ads_video`, `poster`) | Origin. Backfilled: posters → `poster`, everything else → `shoot`. |
| `hook_count` | `int` | Ads video: how many hooks in the script. |
| `use_for` | `text[]` | Ads video: `ads`, `instagram`, `facebook`, `youtube`, `linkedin`, `gmb`. |
| `priority` | `text`, check in (`low`,`medium`,`high`,`urgent`) | Ads video. |
| `scripted_by` | `uuid → users(id)` | Who wrote the script. |
| `voiceover_by` | `uuid → freelancers(id)` | Which RJ recorded it. |
| `voiceover_date` | `date` | When. |
| `reviewed_by` | `uuid → users(id)` | Who approved it out of On Review. |
| `reviewed_at` | `timestamptz` | When. |

`use_for` carries the *intent* recorded at scripting time. It is distinct from
`ready_platforms` (what the card is actually scheduled to post to) and from
`content_item_posts` (where it actually went). Keeping the three separate is what lets
you later ask "we said this was for Instagram — where did it end up?"

Note `use_for` includes `ads`, which is not a `PLATFORMS` value. It gets its own enum
(`USE_FOR_OPTIONS`) rather than being forced into `PLATFORMS`.

### Migration ordering

The status remap and the check-constraint swap must happen in one migration, in this
order, or the update violates the old constraint:

1. Drop the existing status check constraint.
2. `UPDATE content_items SET status='ready_to_edit' WHERE status='shot'`
3. `UPDATE content_items SET status='ready_to_post' WHERE status='ready'`
4. Add the new check constraint with the full 9-value set.
5. Add the new columns; backfill `source`.

---

## State machine

Extracted as a pure, tested module (`lib/content-tracker/status-transitions.ts`),
matching the pattern already used for shoots.

**Ads video:** `scripting → voiceover → ready_to_edit`
**Poster:** `design → editing`
**Shared, from `ready_to_edit`:**
```
ready_to_edit → editing → edited → on_review ─┬─→ ready_to_post → posted
                  ↑                           │
                  └──── needs correction ─────┘
```

Rules the module enforces:
- `posted` is terminal.
- You cannot enter `editing` without an editor.
- You cannot leave `on_review` except by approving (→ `ready_to_post`) or requesting a
  correction (→ `editing`).
- `scripting` / `voiceover` are only reachable by items with `source='ads_video'`;
  `design` only by posters. A drag that would violate this is rejected.

---

## Overview tab

The Overview tab's counts need to know about the new stages. Its `computeOverview()`
already keys off status strings, so:

- "Waiting on an editor" = `ready_to_edit` (was `shot`).
- New card: **Awaiting review** = count in `on_review`, with the oldest age.
- New card: **In scripting / VO** = count in `scripting` + `voiceover`.
- `editingSince()` keeps its existing rule (later of shot date and last correction date)
  — an ads video has no shot date, so it falls back to the item's creation date.

---

## What this does not do

- No WhatsApp reminder when a VO is assigned. (Vercel Hobby crons drift ±59 min; a
  timely nudge isn't achievable and was already deferred.)
- No freelancer payment/cost tracking against a VO. `cost_per_minute` exists on
  `freelancers` but wiring it to billing is out of scope.
- No script *content* storage beyond the existing `notes` field. If scripts need
  versioning later, that's its own feature.
- No change to Ads mode.

---

## Testing

- `lib/content-tracker/status-transitions.test.ts` — the state machine: every legal
  transition, the origin guards, the `on_review` exits, terminality of `posted`, and the
  "no editor → cannot enter editing" rule.
- `lib/content-tracker/overview.test.ts` — extend for the two new cards and the
  `ready_to_edit` rename.
- Manual: complete a shoot and confirm its topics land in Ready to Edit; create an ads
  video, move it through VO into Ready to Edit, and confirm both origins sit on the same
  board and are visually distinguishable.
