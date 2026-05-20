# Member App — Bug Fixes & Feature Bundle
**Date:** 2026-05-20  
**Approach:** Single comprehensive PR (Approach B)

---

## Scope

Fixes 30+ bugs and adds 3 new features across 9 member-facing tabs:
Attendance, Daily Updates, My Tasks, Leave, History, Announcements, Profile/KYC, Notifications.

---

## 1. Attendance Tab

### 1.1 Multi-break support
**Bug:** Break can only be taken once per day.  
**Root cause:** `breakIn` action guard `if (log.break_in)` — after `breakOut` resets `break_in: null` this should already allow re-entry. Likely a stale router cache issue.  
**Fix:**
- Audit `breakIn` / `breakOut` server actions to confirm guard works correctly after reset.
- Add `revalidatePath('/member/attendance')` to both actions (already present — verify it fires).
- Client derives `isOnBreak` from prop, not state — no client change needed.

### 1.2 Break timeline (new DB column)
**Feature:** Show history of each individual break session.  
**DB migration:** Add `break_sessions jsonb DEFAULT '[]'` to `attendance_logs`.  
Schema per entry: `{ in: string (ISO), out: string (ISO) | null, mins: number | null }`

**Server action changes:**
- `breakIn`: append `{ in: new Date().toISOString() }` to `break_sessions` array.
- `breakOut`: update last entry in `break_sessions` with `{ out, mins }` + increment `break_total_mins`. Reset `break_in: null`.

**UI:** Below the break buttons in the "CLOCKED IN" state, show a compact timeline:
```
Break 1 · 11:00 AM – 11:15 AM · 15 min
Break 2 · 2:30 PM – 2:45 PM · 15 min   (in-progress: shown as "ongoing")
```

**Type change:** `AttLog` type gains `break_sessions: BreakSession[] | null`.  
`AttendanceClient` prop type updated accordingly.  
`getAttendanceByDate` return type updated to include `break_sessions`.

### 1.3 Post-clock-out overtime
**Bug:** After clocking out, user cannot continue logging attendance for overtime work.  
**Fix:** In the `isDone` state, add a "Continue Working (Overtime)" button.  
Clicking it calls a new server action `resumeAttendance(date)` that sets `clock_out: null` on the record for that date, allowing the live timer to resume.  
The `clockOut` flow remains unchanged — user clicks Log Out again when truly done.

---

## 2. Daily Updates Tab

### 2.1 Submit button clarity
**Bug:** Working and Learning submit buttons look identical; unclear both need separate submission.  
**Fix:** Add a two-step progress indicator in the form header:
```
[ ✓ Work Log submitted ]  [ ○ Learning — submit below ]
```
Uses `workingDone` / `learningDone` state already in component.

### 2.2 Entries lost on reload / editing
**Bug:** `useState(() => existingUpdate ? [] : loadDraft())` — when today's record exists, `timeBlocks` initialises empty.  
**Fix:**
- Write a `parseExistingBlocks(existingUpdate)` helper that maps `work_entries` (type `other`) back to `TimeBlock[]`.
- Change initialiser: `useState(() => existingUpdate ? parseExistingBlocks(existingUpdate) : loadDraft())`
- "Edit Today's Update" button: call `setTimeBlocks(parseExistingBlocks(existingUpdate))` before setting `editMode(true)` — no longer resets to empty.
- `learningTopic` / `learningHours` / `learningNotes` are pre-populated from `existingUpdate.learning_topic` etc. on init.

### 2.3 Where are updates saved?
**Fix:** Add info line below each submit button:  
*"Saved entries appear in your History tab ↗"* — link to `/member/history`.

---

## 3. My Tasks Tab

### 3.1 Tab label confusion
**Bug:** Tabs named "By Other / To Others / For Me" are confusing.  
**Fix — rename tabs:**
| Old | New |
|-----|-----|
| All | All Tasks |
| By Other | Assigned to Me |
| To Others | I Assigned |
| For Me | Self-Assigned |

### 3.2 Server action audit
**Bug:** Task assigned to Person B may still appear incorrectly.  
**Fix:** Audit `createMemberTask` action — verify `assigned_to` is read from `formData.get('assigned_to')` not defaulted to `currentUserId`. Confirm tasks assigned to others appear in their "Assigned to Me" filter.

### 3.3 Filter — hide empty columns
**Bug:** When a filter is active, empty Kanban columns show at 35% opacity rather than being hidden.  
**Fix:** When `filter !== "all"`, hide columns where `colTasks(col.key).length === 0` entirely on desktop (remove the `opacity` dim approach).

### 3.4 Group by Project
**Feature:** Add a "Group by Project" toggle next to Sort.  
When active:
- Replaces the flat Kanban with vertical project sections.
- Each section header shows project name + task count.
- Tasks without a project grouped under "Internal / No Project".
- Status within each project shown as small colour-coded badges.

---

## 4. Leave Tab

### 4.1 Past date validation message
**Behaviour kept:** `min={today}` restriction stays.  
**Fix:** Replace browser's native HTML5 validation popup with a styled inline error message: *"Leave requests must be for a future date."*  
Achieved by adding `onInvalid` handler on the date inputs that calls `e.preventDefault()` and sets a local error state.

### 4.2 Duplicate leave requests
**Bug:** Can submit multiple requests for the same date after initial submission.  
**Root cause:** `leaves` state doesn't re-sync after `router.refresh()`.  
**Fixes:**
- Add `useEffect(() => setLeaves(initialLeaves), [initialLeaves])` to sync on prop change.
- Add server-side duplicate check in `submitLeaveRequest` action: query for any existing leave where date ranges overlap, return error if found.

### 4.3 Delete expired pending leaves
**Bug:** Expired pending leaves (past `to_date`) have no delete option.  
**Fix:** Remove `!isExpired(leave)` guard from the three-dot menu condition. All pending leaves get the edit + delete menu regardless of expiry.

### 4.4 Delete rejected leaves
**Bug:** Delete button visible but non-functional for rejected leaves.  
**Fix:** Audit `deleteLeaveRequest` server action — remove any `status = 'pending'` filter in the DELETE query. Allow deletion of any leave owned by the user regardless of status.

### 4.5 Timeline line alignment
**Bug:** Vertical timeline line at `left: 55` is misaligned with dots.  
**Fix:** Change `left: 55` → `left: 9` (centre of the 20px dot column).

---

## 5. History Tab

### 5.1 Explanatory banner
**Feature:** Add a brief info banner below the page title:  
*"Your personal work diary. Every daily update you submit appears here — filter by month, pick a date, or search by task or client."*  
Light grey background, dismissible.

---

## 6. Announcements Tab

### 6.1 Category filter
**Bug:** Category dropdown is rendered but never applied in the filter logic.  
**Fix (requires migration):**
- Add `category text NOT NULL DEFAULT 'General'` column to `announcements` table.
- Admin announcements form: add category select (`General | Policy | Events | Urgent`).
- Member filter memo: add `&& (category === "All Categories" || a.category === category)` condition.

---

## 7. Profile / KYC Tab

### 7.1 Ration Card label rename
**Fix:** In `profile-client.tsx`, rename:
- `"Ration Card Img 1"` → `"Ration Card – Front Side"`
- `"Ration Card Img 2"` → `"Ration Card – Back Side"`

### 7.2 KYC document view / replace / delete
**Feature:** For each uploaded document field (`govt_id_url`, `aadhaar_back_url`, `pan_front_url`, `pan_back_url`, `ration_card_url`, `ration_card_url2`):

**When a URL exists — show three action buttons:**
- **View** — opens `supabaseUrl` in a new tab.
- **Replace** — triggers a hidden `<input type="file">`, uploads new file, updates URL in DB via `updateKYC` action.
- **Delete** — confirms then calls `deleteKYCDocument(field)` action that removes the file from Supabase Storage and clears the DB field.

**New server action:** `deleteKYCDocument(field: KYCDocField)` in `lib/actions/profile.ts`.  
Uses service role to delete from `documents` storage bucket + update `kyc_data` record.

---

## 8. Notifications Tab

### 8.1 DB schema
New table `notifications`:
```sql
create table notifications (
  id          uuid primary key default gen_random_uuid(),
  company_id  uuid not null references companies(id),
  user_id     uuid not null references users(id),
  type        text not null, -- 'leave_status' | 'task_assigned' | 'announcement'
  title       text not null,
  body        text,
  read        boolean not null default false,
  link        text,           -- e.g. '/member/leaves', '/member/tasks'
  created_at  timestamptz not null default now()
);
-- RLS: user can only read/update their own notifications
```

### 8.2 Notification triggers (server actions)
Insert a notification row when:
- **Leave approved/rejected** — in admin `updateLeaveStatus` action, insert for `user_id = leave.user_id`.
- **Task assigned** — in `createMemberTask` / `createTask` actions, insert for `user_id = assigned_to` (if different from creator).
- **Announcement created** — in admin `createAnnouncement` action, insert for all `users` in the company.

### 8.3 Bell panel (existing sidebar)
- Query `notifications` where `user_id = me AND read = false`, count → red dot.
- Panel shows last 5 unread notifications with type icon, title, time-ago, and link.
- Opening the panel calls `markAllRead()` server action (sets `read = true` for all unread) → dot clears.
- "All Notifications →" link at bottom of panel routes to `/member/notifications`.

### 8.4 Full notifications page `/member/notifications`
- Server component: fetch all notifications for current user, ordered by `created_at DESC`.
- Grouped: **Today** / **This Week** / **Earlier**.
- Each row: type icon + title + body + time-ago + "Go to →" link.
- "Mark all as read" button at top right.
- Empty state illustration when no notifications.

---

## Files Changed (summary)

| File | Change |
|------|--------|
| `lib/actions/attendance.ts` | `breakIn`, `breakOut` updated for `break_sessions`; new `resumeAttendance` action |
| `app/member/attendance/attendance-client.tsx` | Break timeline UI, overtime resume button |
| `lib/actions/daily-updates.ts` | No change needed |
| `app/member/update/daily-update-form.tsx` | Pre-populate blocks from existing, progress indicator, history link |
| `app/member/tasks/tasks-client.tsx` | Rename tabs, hide empty cols, group-by-project toggle |
| `lib/actions/tasks.ts` | Audit `createMemberTask` assigned_to |
| `lib/actions/leaves.ts` | Remove pending-only guard from delete; server-side duplicate check |
| `app/member/leaves/leaves-client.tsx` | Sync leaves state, inline date error, expired delete, timeline line fix |
| `app/member/history/history-client.tsx` | Explanatory banner |
| `app/member/announcements/announcements-client.tsx` | Apply category filter |
| `app/member/profile/profile-client.tsx` | Rename ration card labels; KYC view/replace/delete buttons |
| `lib/actions/profile.ts` | New `deleteKYCDocument` action |
| `app/member/notifications/page.tsx` | New notifications page |
| `components/member/sidebar.tsx` | Bell panel reads from `notifications` table |
| `lib/actions/notifications.ts` | New file: `markAllRead`, `getNotifications` |
| `app/admin/announcements/announcements-client.tsx` | Add category select to create form |
| `lib/actions/announcements.ts` | Persist `category` field on create |
| Admin actions (`leaves`, `announcements`, `tasks`) | Insert notification rows |
| Supabase migrations | `break_sessions` column, `announcements.category` column, `notifications` table |

---

## Out of Scope

- Push / SMS notifications (separate system)
- Admin notification management UI
- Notification preferences / mute settings
