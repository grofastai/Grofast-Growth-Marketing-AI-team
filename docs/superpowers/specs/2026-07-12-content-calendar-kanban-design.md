# Content Calendar → Kanban Board — Design Spec

**Date:** 2026-07-12
**Status:** Approved for planning
**Author:** Sajee + Claude

## Summary

Replace the Content Calendar's month-grid **Calendar** view and **List** view with a
drag-and-drop **Kanban board**, styled and behaved like the existing **Content & Ads
Tracker** board. No database migration — the board maps directly onto the existing
`content_posts.status` lifecycle and reuses the existing Server Actions.

## Motivation

The Content Calendar and Content & Ads Tracker are visually inconsistent: the Tracker is a
modern drag-and-drop pipeline, the Calendar is a month grid + dropdown status changes. The
user wants the Calendar to adopt the Tracker's Kanban UX for a consistent, faster workflow
(drag to change status instead of opening a dropdown).

## Non-Goals

- No merge of the two features into one. They remain separate pages/tables.
- No schema change to `content_posts` or any other table.
- No changes to the WhatsApp assignment/reminder flow or the `content-reminder` /
  `content-missed` cron jobs — they continue to key off `content_posts.status` and
  `scheduled_date`, which are unchanged.

## Columns

The board has **4 columns**, mapped 1:1 to existing `content_posts.status` values:

| Column label   | `status` value | Accent (from existing STATUS_CFG) |
|----------------|----------------|-----------------------------------|
| Scheduled      | `pending`      | `#FFA53A`                         |
| In Progress    | `in_progress`  | `#4D8CFF`                         |
| Ready          | `ready`        | `#9B6BFF`                         |
| Uploaded ✓     | `posted`       | `#32D27A`                         |

Dragging a card into a column calls the existing `updateContentPostStatus(id, status)`
action. Each column header shows a live count chip (like the Tracker).

### Exception states (`cancelled`, `missed`)

`cancelled` and `missed` are **not** columns. They are:
- Rendered as a colored **badge** on the card (red, using existing STATUS_CFG colors).
- Controlled by a **filter chip** ("Show cancelled/missed") that is **off by default**, so
  the board is clean unless the user opts in.
- Because `missed` (and `cancelled`) overwrite `status`, such a card no longer maps to
  `pending`/`in_progress`/etc. **Resolution:** when the "Show cancelled/missed" filter is
  on, cancelled and missed cards render in the **Scheduled** column (they were scheduled but
  never got Uploaded), each with its red Missed/Cancelled badge. When the filter is off they
  are hidden entirely. This keeps a single, predictable place for them without a dedicated
  column.

## Shoots on the board

Content posts that have a non-empty `shoot_team` (detected by the existing `isShootPost()`
helper) remain on the board, visually tagged as a **Shoot** (camera icon + accent), the way
the calendar currently distinguishes them. The **standalone `shoots` and `tasks` tables are
dropped** from this view — they have their own pages and were only calendar-grid overlays.

## Filters (top bar — mirrors Tracker)

- **Month picker** — scopes the board to that month's `scheduled_date`. Replaces the
  calendar's month-by-month navigation. Drives the server query's `monthStart`/`monthEnd`
  (already computed in the page loader).
- **Client filter** — internal brands (`GROFAST DIGITAL`, `KARTHICK BRANDS`, `GROFAST AI`)
  pinned first, then active clients, then `📁 Past Clients` — per the universal client
  dropdown rule. No manual typing.
- **Type / mode chips** — Post vs Shoot toggle; optional content-type filter.
- **Exception chip** — "Show cancelled/missed" (off by default).

## Card contents

Each card shows (reusing existing data on the `Post` type):
- Title
- Platform emoji + color bar (existing `PLATFORMS`)
- Content-type icon (existing `CONTENT_TYPES`)
- **Scheduled date + time** (existing `formatTime()`)
- Client name
- Priority badge (existing `PRIORITY_CFG`)
- Content pillar chip
- Assignee / shoot-team avatars
- Drive link (if present)
- Quick **edit** and **delete** actions
- Missed/Cancelled badge when applicable

The **create/edit modal is unchanged** — all existing fields (title, platform, content type,
client, scheduled date + time, assignee, shoot team, drive link, caption, notes, content
pillar, priority) are preserved.

## Architecture

### Components

- **New:** `components/content-calendar/content-calendar-board.tsx` — a shared client
  component (`"use client"`) containing the Kanban board, filters, cards, and the
  create/edit modal. Modeled on `components/content-tracker/content-tracker-client.tsx`
  (DndContext, PointerSensor, `useDraggable`/`useDroppable`, `DragOverlay`,
  `STATUS_ORDER`, per-column count chips, drag-end → status action).
- **Removed/replaced:** the calendar-grid and list rendering in
  `app/admin/content-calendar/content-calendar-client.tsx` and the member equivalent. The
  existing per-role client files are replaced by (or reduced to thin wrappers around) the
  new shared board, matching how the Tracker shares one client between admin and member.

### Pages

- `app/admin/content-calendar/page.tsx` and `app/member/content-calendar/page.tsx`:
  - Keep fetching `content_posts` (with `assignee`), `members`, `clients`, `pastClients`.
  - **Stop fetching** `shoots` and `tasks` (no longer overlaid).
  - Keep month scoping via `searchParams` / `monthStart` / `monthEnd`.
  - Render `<ContentCalendarBoard … />`.
- Member page keeps its **freelancer-media block** (`blockFreelancerMedia()` /
  `FL_MEDIA_HIDDEN`) — freelancer-media members stay hidden from Content Calendar.

### Server Actions (unchanged)

Reuse `lib/actions/content-calendar.ts`:
- `createContentPost`, `updateContentPost`, `updateContentPostStatus`, `deleteContentPost`.
- Drag-end calls `updateContentPostStatus`.

### Permissions

- Admin: full edit on any post.
- Member: edit/delete/status only on posts assigned to them or created by them (unchanged
  from current calendar behavior).

## Responsive / Mobile

- Board scrolls **horizontally** on small screens with the same 4-column layout, matching
  the Tracker board's mobile behavior.
- Desktop and mobile stay in sync (same columns, same order, mobile-first).
- Card text must not overlap icons/avatars; verify at 360px width (no-text-overlap rule).

## Testing / Verification

- `pnpm typecheck` and `pnpm lint` clean.
- Manual verification (per /verify): load `/admin/content-calendar` and
  `/member/content-calendar`, confirm:
  - 4 columns render with correct counts.
  - Drag a card between columns updates status (persists on reload).
  - Month/client/type filters scope correctly.
  - Cancelled/missed hidden by default, shown with badge when filter on.
  - Shoot posts tagged; standalone shoots/tasks no longer shown.
  - Create/edit modal saves all fields.
  - Member sees only own/assigned edit rights; freelancer-media still blocked.
  - Renders correctly at 360px (mobile) and desktop.

## Risks / Trade-offs

- **Loss of month-grid date visualization.** Users who relied on seeing posts laid out by
  calendar day lose that. Mitigated by month filter + scheduled date/time on each card.
  Accepted by user.
- **`missed` status has no natural column** (see Open Decision). Resolve in plan.
- Large rewrite of a ~1100-line client component — do it as a new file, delete old view
  code, keep the modal logic.
