# Mobile View Fixes — Design

Source: client PDF "App mobile view bug" — a page-by-page walkthrough of the admin
mobile experience across Dashboard, Team, Leave Requests, Attendance, Activities,
and Freelancers. Confirmed with the client via Q&A before writing this spec.

## Scope

This batch mixes three kinds of work:

1. **Straightforward removals/fixes** — no design decisions needed, listed as a
   punch list below.
2. **One real data bug** — present-count mismatch across three pages, root cause
   found during investigation.
3. **Three small features** that needed design decisions — covered in detail below.

## Part 1 — Punch list (straightforward, no new design)

| Page | Change |
|---|---|
| Admin Dashboard | Remove bell + "G" header icons if they have no working handler (verify first — keep if functional) |
| Admin Dashboard | "View Reports" button → point at `/admin/activities` instead of `/admin/reports` |
| Admin Dashboard → mini-calendar | (superseded by Part 2a below) |
| Team | Keep "All/Active/Inactive" tab as-is — confirmed it reflects employment status (`users.status`), not app-activity. No code change; this was a client misunderstanding. |
| Team → Task Board (mobile) | Remove "9 Members" stat; fix mobile overflow/alignment of the hero stat row; remove "Sync Clients" button entirely (client doesn't want it) |
| Team → Task Board | Reconcile mobile vs desktop empty-state illustration so both show the same artwork |
| Leave Requests | Fix mobile misalignment of the 6-KPI stat row (labels left, values centered — make both consistent, centered to match desktop) |
| Leave Requests | Empty state ("No pending leave requests"): replace red/black gradient background with white, enlarge illustration |
| Attendance | Remove hero section (just shows a lone avatar icon, no content) |
| Attendance | Remove "Quick Actions" block (Attendance Report / Manage Leaves / Team Overview / Daily Updates — redundant with nav) |
| Attendance | "Full Report" button → point at `/admin/activities` instead of `/admin/reports` |
| Admin Dashboard / Attendance / Reports | Remove/hide the "Daily Intelligence" page (`/admin/reports`) — client wants Activities to be the report surface instead |
| Activities | Fix present-count bug — see Part 2d |

## Part 2 — Designed features

### 2a. Leave calendar — avatar popover on tap

**File:** `app/admin/dashboard/mini-calendar.tsx`

Currently a date with someone on leave shows one fixed 4×4px dot
(`app/admin/dashboard/mini-calendar.tsx:74-76`), with no interaction — tapping does
nothing, and the dot count never reflects how many people are on leave.

**Design:**
- Render up to 3 dots per date (one per person on leave that day). If more than 3,
  show 3 dots + a small "+N" badge instead of endless dots.
- Tapping a date with leave opens a **small popover anchored near the date** (not a
  full bottom sheet) listing each person on leave that day as avatar (initials
  circle, consistent with the initials-avatar style used elsewhere in the app) +
  name.
- Tapping the same date again, or tapping outside, closes the popover.
- Needs the leave data already loaded for the visible month (`leaveMap`) to include
  the member's id/name/initials per date, not just a count — check what
  `leaveMap` currently carries and extend if it's just a count today.

### 2b. Leave Requests — leave-type filter row

**File:** `app/admin/leaves/leaves-client.tsx`

Currently there's one row of status tabs (`STATUS_TABS`: Pending / Approved /
Rejected / All / Holidays, `leaves-client.tsx:47-53, 413-428`) driven by a `status`
URL param. The 6 KPI boxes in the header (Full Day/WFH/Shoot/Half Day/Approved/
Rejected, `leaves-client.tsx:391-404`) are currently just static counts, not
clickable filters.

**Confirmed grouping** (client flip-flopped between two orderings during Q&A —
final answer confirmed the original PDF note is correct):
- **Permission** tab → `leave_type` in (`wfh`, `shoot_day`)
- **Leave** tab → `leave_type` in (`full_day`, `half_day`, `permission`)
  - Note: the DB's `leave_type = "permission"` value is what the client calls
    "hour permission" (has a `permission_hours` field). This is a separate concept
    from the new UI category also named "Permission" above — the UI label
    "Permission" (WFH+Shoot) and the DB value `"permission"` (hour permission,
    grouped into "Leave") are unrelated and must not be conflated in the filter
    logic.

**Design:** Add a second row of pill/tab buttons directly below the existing
status tabs, same visual style (`leaves-client.tsx:417-425` button styling reused).
Options: **All Types | Permission | Leave**. This is a second, independent filter
dimension — combines with the existing status filter (both go into the URL query,
e.g. `?status=pending&type=permission`), server-side query in
`app/admin/leaves/page.tsx` gets an additional `.in("leave_type", [...])` clause
when `type` is present.

### 2c. Freelancer hero card — fix illustration overflow

**File:** `app/member/freelancers/freelancers-member-client.tsx:1244-1312`
(shared by both the member Freelancers page and the embedded admin Freelancers tab
via `admin-freelancers-tabs.tsx`)

Bug: `voiceover-rj-character.png` is absolutely positioned `bottom: -50px` with a
fixed `height: 270px` (line 1260-1262), hanging below the card regardless of
viewport. On mobile this overlaps/crowds the KPI strip and the Work History card
below it; on desktop the fixed height doesn't scale with the wider/shorter card
either, producing awkward whitespace or overlap.

**Design:** Keep the character illustration (client wants it resized, not
removed), but make its size and position responsive to the card:
- Cap the image height as a percentage of the hero banner's own height (e.g. via a
  container with `overflow: hidden` sized to the banner, or clamp the height with
  `clamp()`/viewport-relative units) instead of a fixed 270px.
- Ensure it never extends past the bottom of the KPI glass-strip row — i.e. the
  hero banner container should size to fit its content including the character
  image, not have the image float outside the container's bounds.
- Test at common breakpoints (360px mobile, 768px tablet, 1280px+ desktop) since
  the client explicitly said it looks bad on both ends today.

### 2d. Present-count data bug — root cause + fix

Client reported inconsistent "present" numbers between pages on the same day
(Dashboard widget, Attendance page, Activities page all disagreed — e.g. 4 vs 5
vs claimed actual 6).

**Root cause found:** there are two unrelated data sources for "who's present
today," and different pages read from different ones:
- `app/admin/dashboard/page.tsx:80-81` and `app/admin/attendance/page.tsx` both
  count from the **`attendance_logs`** table (`status = 'present'`), with the
  dashboard value additionally **cached for 60s** per company/day
  (`app/admin/dashboard/page.tsx:75-109`).
- `app/admin/activities/activities-client.tsx:343-344` instead reads a
  **`users.attendance_status`** column, which gets set to `'present'` inside the
  daily-update submission Server Actions (`lib/actions/daily-updates.ts`,
  `lib/actions/simple-update.ts`) — a completely separate write path from
  whatever populates `attendance_logs`.

These two sources can and do drift apart, which is exactly the discrepancy
reported. The Activities page's role filter (`role !== "ADMIN"`) is already
correct — that part is not the bug.

**Design:** Standardize all three "present today" displays (Dashboard widget,
Attendance page, Activities page) on **one** source of truth. Recommendation:
use `attendance_logs` everywhere (it's already the source for 2 of 3 pages, and is
a proper append-only log rather than a single mutable column that can go stale).
Update `activities-client.tsx`'s present calculation to query/receive
`attendance_logs`-derived data instead of `users.attendance_status`, and drop the
60s dashboard cache if it risks showing stale counts right after a status change
(or reduce TTL). Exact query wiring to be finalized during implementation — this
needs a careful read of everywhere `attendance_logs` rows get written to confirm
it's populated reliably for every present member before switching Activities over.

## Testing

Since every change here is mobile-view-driven, verify each touched page at a
mobile viewport (≈375px) and desktop (≥1280px) in the browser before considering
any item done — this was explicitly the client's original complaint category.
