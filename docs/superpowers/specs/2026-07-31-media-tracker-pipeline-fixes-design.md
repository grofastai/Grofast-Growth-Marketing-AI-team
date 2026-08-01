# Media Tracker — Pipeline & Shoot Tab Fixes (Sub-project A)

## Background

Source: `MEDIA TRACKER CHECK (JUL 30).pdf`, a 12-point change request against the Media Tracker feature. The request was split into two sub-projects during brainstorming:

- **Sub-project A (this doc)** — items 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 12. Well-scoped fixes to the Shoot Tab, the Ready to Edit/Editing stages, New Content Item, and Poster editing.
- **Sub-project B (separate, later)** — item 11 (don't require a posting date when moving to Branding/Ads Ready) + the two page-5 reference mockups ("Schedule Content" / "Schedule Advertisement"). User confirmed this should be built as a full feature, not deferred — it needs its own schema (assigned publisher, caption/hashtag checklist, reminders, campaign budget/objective, landing destination, media buyer) and its own design pass. Out of scope here.

Design approved visually via the brainstorming visual companion (mockups reviewed by the user); one scope change made during review (see "Shot By becomes multi-select" below).

## Shoot Tab

**Schedule Date rename.** Every "Shot Date" label in shoot-specific UI (`NewShootModal`, the new merged edit modal) becomes "Schedule Date". Label-only change — the underlying `start_time`/`shot_date` field and its semantics are unchanged. Content-item-side "Shot Date" labels (New Content Item, Edit Content) are untouched — different field, different meaning, not part of this request.

**Optional crew at shoot creation.** `NewShootModal` gains an optional multi-select "Crew" picker (same `shootingMembers` roster used at completion). `createTrackerShoot` gets a new optional `going_by?: string[]` param, written straight to `shoots.going_by` at insert. No behavior change downstream — `CompleteShootModal` already prefers `shoot.goingByUsers` over a fresh empty state when pre-filling its own crew step (`media-tracker-client.tsx:3120-3123`), so this becomes a "confirm what I already picked" step instead of "pick from scratch," free of charge.

**Tags.** New multi-select tag field on shoots: `branding` / `advertisement` / `promotion`. This is a **new column**, not a reuse of the existing dormant `shoot_type` enum (`ads_shoot`/`branding_shoot`) — that column stays untouched and unexposed, since the user chose true multi-tag over single-select. Shown as toggle-button pills (same visual pattern as the platform pickers elsewhere) in New Shoot and the merged Edit Details modal; rendered as small colored pills on the shoot card next to the client/date line.

- New migration: `shoots.tags text[] NOT NULL DEFAULT '{}'`, with a CHECK constraint restricting elements to `('branding','advertisement','promotion')`.
- `updateTrackerShoot`'s input type gains an optional `tags?: string[]`.

**Merge "Edit shoot" + "Who went" → "Edit Details" (Scheduled shoots only).** One modal combining: client, shoot title, schedule date, from/to time, notes, tags, and crew. One Save button calls `updateTrackerShoot` + `updateShootCrew` together (`Promise.all`, same pattern `EditCompletedShootModal.handleUpdateAll()` already uses). The card's 3-dot menu drops the separate "Who went" entry — "Edit Details" is the only entry point for a Scheduled shoot's own menu. The standalone `EditCrewModal` component is deleted (no longer referenced by any path). The card's inline "+ Add crew" shortcut (shown when crew is empty) now routes through the same status-aware `onEdit`/`handleEditShoot` dispatcher instead of a separate `onEditCrew` callback — so it opens the right modal (Edit Details for Scheduled, Edit Completed Shoot for Completed) instead of a crew-only modal that's going away.

**Completed shoots — no new modal.** `EditCompletedShootModal` already has its own "Who Went" picker built in (`media-tracker-client.tsx:3519-3531`) alongside video titles, actual time, and drive link. Only change: the redundant standalone "Who went" menu entry disappears (a side effect of removing the shared `onEditCrew` prop from `ShootCardInner` entirely — see above).

**"Mark Done" → "Shoot Done".** Three button-label-only spots: the Scheduled kanban card button (`media-tracker-client.tsx:1468`), the `CompleteShootModal` submit button (`media-tracker-client.tsx:3216` — the modal's *title* already says "Shoot Done"), and the Schedule tab's list-view action (`media-tracker-client.tsx:4130`). No behavior change.

## Shot By — root cause fix, and multi-select

**Root cause.** `shot_by` on a video's `content_items` row is currently hardcoded to whoever clicked "Mark Done" (`completeShootWithTitles`, `shoots.ts:292` and `:319`) — frequently an admin managing the board, not the person who actually shot the footage. Since the Shot By dropdown only lists people tagged `'shooting'` (`shootingMembers`), the wrong auto-assigned person often doesn't even appear as a matching option, so the field looks blank/broken even when a value is technically saved.

**Decision made during visual review: multi-select, not single.** A shoot's crew (`going_by`) is already multiple people, but the original fix (defaulting `shot_by` to `going_by[0]`) would still only ever credit one person per video even when 2-3 people went. The user flagged this — "Shot By" becomes a multi-select field, matching "Who went," crediting everyone who was there. Still editable per video afterward (e.g. if a specific video was actually only shot by one of the crew).

**Schema change:** `content_items.shot_by` changes from `uuid` to `uuid[]`.
```sql
ALTER TABLE content_items
  ALTER COLUMN shot_by TYPE uuid[]
  USING CASE WHEN shot_by IS NULL THEN '{}'::uuid[] ELSE ARRAY[shot_by] END;
ALTER TABLE content_items ALTER COLUMN shot_by SET DEFAULT '{}';
```
This preserves existing single-value data as one-element arrays — no data loss, no backfill script needed beyond the type conversion itself.

**Ripple:**
- `lib/validations/media-tracker.ts`: `shot_by: z.string().uuid().optional()` → `z.array(z.string().uuid()).optional()` (in `updateContentItemSchema`).
- `lib/actions/media-tracker.ts` (`updateContentItem`): `if (parsed.data.shot_by) updates.shot_by = ...` → guard on `!== undefined` instead of truthiness (an empty array is truthy in JS — the current pattern would silently never allow clearing, and worse, would need to distinguish "not sent" from "cleared to none").
- `lib/actions/shoots.ts`: every place that inserts/updates `content_items.shot_by` on shoot completion (`completeShootWithTitles` — both the regular-titles branch and the linked-item branch, `addShootTitle`, and the legacy `updateShootStatus` completed-branch) changes from `shot_by: user.id` to `shot_by: goingBy && goingBy.length > 0 ? goingBy : [user.id]` (full crew, falling back to a one-element array of the completer if no crew was recorded). `updateShootStatus`'s select needs `going_by` added to its column list to support this.
- `lib/data/media-tracker.ts`: `shotByUser: row.shot_by ? userMap.get(row.shot_by) : null` → `shotByUsers: (row.shot_by ?? []).map(id => userMap.get(id)).filter(Boolean)`.
- `ContentItem` type (`media-tracker-client.tsx`): `shotByUser?: Person` → `shotByUsers?: Person[]`.
- `EditContentModal`: `shotBy` state changes from a single string to a `string[]`, rendered as multi-select toggle pills (same pattern as the existing `toggleCrew`/`togglePlatform` helpers elsewhere in the file) instead of a `<select>`.

No other place in the codebase reads `shot_by`/`shotByUser` today (confirmed via search) — the ripple is fully contained to the files listed above.

## Ready to Edit / Editing — Edit Content modal

Two symptoms, one root cause: the Shot By field is unconditionally shown at every stage from Ready to Edit onward, while the Editor field only appears from Completed Edit (`on_review`) onward — so Shot By lingers uselessly once editing has started, and there's no way to reassign the editor while the item is still mid-edit.

- Restrict the Shot By field block to `item.status === 'ready_to_edit'` only. Since Poster items never pass through `ready_to_edit` (they enter at `design` and their type-restriction rules keep them there — `lib/media-tracker/pipeline-transitions.ts`), this single condition change also removes the field from the Poster's early edit modal, satisfying item #12 with no separate content-type check needed.
- Extend the Editor/Designer field block's visibility (`showEditor`) to include `item.status === 'edited'`, not just `on_review`/`branding_ready`/`ads_ready`/`posted`. This lets you reassign the editor while work is still in progress in the Editing column, not only at hand-off into Completed Edit. `updateContentItem` already applies whatever editor/date/drive-link fields are passed regardless of current stage — no server-side change needed here, this is a client-side visibility fix only.

## New Content Item — Posted By

`content_item_posts.posted_by` already exists and is already user-correctable elsewhere (the per-post edit row in `EditContentModal`). The "Already posted" backfill section in `NewContentModal` never asks for it — `createContentItem` currently hardcodes `posted_by: ctx.id` on every inserted post row (`lib/actions/media-tracker.ts`, backfill path), silently crediting whoever is filling out the form.

Add a "Posted By" dropdown next to "Posted Date" in the Already-Posted section (same options/pattern as the existing "Edited By" dropdown, one value applied to all platforms in that submission — matching how Edited By already works there).

- `createContentItemSchema` gains an optional `posted_by: z.string().uuid().optional()`.
- `createContentItem` uses `parsed.data.posted_by || ctx.id` instead of the hardcoded `ctx.id` when building the backfilled post rows.

## Poster — Designed By

Fully covered by the Ready to Edit/Editing fix above: restricting the Shot By/Designed By field block to `status === 'ready_to_edit'` naturally excludes Poster items (which are never in that status), removing "Designed By" from the early Design-stage Edit Content modal with no additional code.

## Explicitly out of scope (this doc)

- Item #11 and the page-5 "Schedule Content"/"Schedule Advertisement" reference mockups — Sub-project B, separate design.
- Any change to `shoots.shoot_type` (stays dormant/unused, untouched).
- Any change to the legacy `/admin/shoots` and `/member/shoots` standalone pages — confirmed separate from the Media Tracker's own Shoots tab during investigation, not mentioned in the source PDF.
