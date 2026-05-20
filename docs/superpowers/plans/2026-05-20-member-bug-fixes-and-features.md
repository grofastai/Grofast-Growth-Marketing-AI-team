# Member App — Bug Fixes & Feature Bundle Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fix 30+ bugs and add 3 new features across 9 member-facing tabs in one bundled PR.

**Architecture:** Direct edits to existing files — no new components directory structure needed. DB migrations run in Supabase SQL editor. All server actions use the existing `adminSupabase()` service-role pattern. New files: `lib/actions/notifications.ts` and `app/member/notifications/page.tsx`.

**Tech Stack:** Next.js 15 App Router, Supabase (PostgreSQL + RLS), Tailwind CSS v4, TypeScript strict, pnpm

---

## File Map

| File | What changes |
|------|-------------|
| Supabase migrations | `break_sessions` column, `announcements.category` column, `notifications` table |
| `lib/actions/attendance.ts` | `breakIn`, `breakOut` updated for `break_sessions`; new `resumeAttendance` |
| `app/member/attendance/page.tsx` | Add `break_sessions` to SELECT + local `AttLog` type |
| `app/member/attendance/attendance-client.tsx` | `AttLog` type, break timeline UI, overtime button |
| `app/member/update/daily-update-form.tsx` | `parseExistingBlocks` helper, fix `timeBlocks` init, pre-populate learning, progress indicator, history link |
| `app/member/tasks/tasks-client.tsx` | Rename filter tabs, hide empty columns when filtered |
| `lib/actions/leaves.ts` | Remove pending-only guard from delete; add duplicate date check in submit |
| `app/member/leaves/leaves-client.tsx` | Sync leaves state, inline date error, expired delete, timeline line |
| `app/member/history/history-client.tsx` | Explanatory banner |
| `app/member/announcements/announcements-client.tsx` | Apply category filter |
| `lib/actions/announcements.ts` | Persist `category` on create |
| `app/admin/announcements/announcements-client.tsx` | Add category select to create form |
| `app/member/profile/profile-client.tsx` | Rename Ration Card labels; KYC View/Replace/Delete buttons |
| `lib/actions/profile.ts` | New `deleteKYCDocument` action |
| `lib/actions/notifications.ts` | New file: `insertNotification`, `markAllRead`, `getUnreadNotifications` |
| `app/member/layout.tsx` | Query unread notification count instead of pendingLeaves count |
| `components/member/sidebar.tsx` | Bell panel reads from notifications |
| `app/member/notifications/page.tsx` | New full notifications page |
| Admin actions (`leaves`, `announcements`) | Insert notification rows on approve/reject and create |

---

### Task 1: DB Migrations

**Files:**
- Run in Supabase SQL editor (no local file needed)

- [ ] **Step 1: Run migration — break_sessions column**

In Supabase SQL editor, run:

```sql
-- Migration: add break_sessions to attendance_logs
ALTER TABLE attendance_logs
  ADD COLUMN IF NOT EXISTS break_sessions jsonb NOT NULL DEFAULT '[]'::jsonb;
```

- [ ] **Step 2: Run migration — announcements.category column**

```sql
-- Migration: add category to announcements
ALTER TABLE announcements
  ADD COLUMN IF NOT EXISTS category text NOT NULL DEFAULT 'General';
```

- [ ] **Step 3: Run migration — notifications table**

```sql
-- Migration: create notifications table
CREATE TABLE IF NOT EXISTS notifications (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id  uuid NOT NULL REFERENCES companies(id),
  user_id     uuid NOT NULL REFERENCES users(id),
  type        text NOT NULL,
  title       text NOT NULL,
  body        text,
  read        boolean NOT NULL DEFAULT false,
  link        text,
  created_at  timestamptz NOT NULL DEFAULT now()
);

-- RLS: user can only read/update their own notifications
ALTER TABLE notifications ENABLE ROW LEVEL SECURITY;

CREATE POLICY "notifications_own" ON notifications
  FOR ALL USING (user_id = auth.uid());
```

- [ ] **Step 4: Commit**

```bash
git add -A
git commit -m "chore: add break_sessions, announcements.category, notifications table migrations"
```

---

### Task 2: Attendance Server Actions — break_sessions + resumeAttendance

**Files:**
- Modify: `lib/actions/attendance.ts`

- [ ] **Step 1: Update `breakIn` to append to break_sessions**

In `lib/actions/attendance.ts`, find the `breakIn` function. It currently:
1. Fetches `'id, clock_in, break_in'`
2. Guards `if (log.break_in) return error`
3. Updates `{ break_in: new Date().toISOString() }`

Replace the entire `breakIn` function with:

```typescript
export async function breakIn(): Promise<{ success: boolean; error?: string }> {
  const ctxResult = await getUserContext()
  if ('error' in ctxResult) return { success: false, error: ctxResult.error }
  const ctx = ctxResult

  const today = new Date().toISOString().split('T')[0]
  const admin = adminSupabase()

  const { data: log } = await admin
    .from('attendance_logs')
    .select('id, clock_in, break_in, break_sessions')
    .eq('company_id', ctx.companyId)
    .eq('user_id', ctx.userId)
    .eq('date', today)
    .maybeSingle()

  if (!log?.clock_in) return { success: false, error: 'Clock in first before starting a break.' }
  if (log.break_in)   return { success: false, error: 'Break already in progress.' }

  const breakInTime = new Date().toISOString()
  const sessions = Array.isArray(log.break_sessions) ? log.break_sessions : []

  const { error } = await admin
    .from('attendance_logs')
    .update({
      break_in: breakInTime,
      break_sessions: [...sessions, { in: breakInTime, out: null, mins: null }],
    })
    .eq('id', log.id)

  if (error) return { success: false, error: error.message }
  revalidatePath('/member/attendance')
  return { success: true }
}
```

- [ ] **Step 2: Update `breakOut` to update last session entry**

Replace the entire `breakOut` function with:

```typescript
export async function breakOut(): Promise<{ success: boolean; error?: string }> {
  const ctxResult = await getUserContext()
  if ('error' in ctxResult) return { success: false, error: ctxResult.error }
  const ctx = ctxResult

  const today = new Date().toISOString().split('T')[0]
  const admin = adminSupabase()

  const { data: log } = await admin
    .from('attendance_logs')
    .select('id, break_in, break_out, break_total_mins, break_sessions')
    .eq('company_id', ctx.companyId)
    .eq('user_id', ctx.userId)
    .eq('date', today)
    .maybeSingle()

  if (!log?.break_in) return { success: false, error: 'No break started yet.' }
  if (log.break_out)  return { success: false, error: 'Break already ended.' }

  const breakOutTime = new Date().toISOString()
  const breakMins    = Math.max(Math.round((Date.now() - new Date(log.break_in).getTime()) / 60000), 1)
  const newTotal     = (log.break_total_mins ?? 0) + breakMins

  const sessions = Array.isArray(log.break_sessions) ? [...log.break_sessions] : []
  if (sessions.length > 0) {
    sessions[sessions.length - 1] = { ...sessions[sessions.length - 1], out: breakOutTime, mins: breakMins }
  }

  const { error } = await admin
    .from('attendance_logs')
    .update({ break_in: null, break_out: null, break_total_mins: newTotal, break_sessions: sessions })
    .eq('id', log.id)

  if (error) return { success: false, error: error.message }
  revalidatePath('/member/attendance')
  return { success: true }
}
```

- [ ] **Step 3: Add `resumeAttendance` action**

Append to the end of `lib/actions/attendance.ts`:

```typescript
export async function resumeAttendance(date: string): Promise<{ success: boolean; error?: string }> {
  const ctxResult = await getUserContext()
  if ('error' in ctxResult) return { success: false, error: ctxResult.error }
  const ctx = ctxResult

  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return { success: false, error: 'Invalid date.' }

  const admin = adminSupabase()
  const { error } = await admin
    .from('attendance_logs')
    .update({ clock_out: null })
    .eq('company_id', ctx.companyId)
    .eq('user_id', ctx.userId)
    .eq('date', date)

  if (error) return { success: false, error: error.message }
  revalidatePath('/member/attendance')
  return { success: true }
}
```

- [ ] **Step 4: Commit**

```bash
git add lib/actions/attendance.ts
git commit -m "feat: break_sessions tracking and resumeAttendance action"
```

---

### Task 3: Attendance UI — page.tsx + client break timeline + overtime button

**Files:**
- Modify: `app/member/attendance/page.tsx`
- Modify: `app/member/attendance/attendance-client.tsx`

- [ ] **Step 1: Update page.tsx — add break_sessions to SELECT and AttLog type**

In `app/member/attendance/page.tsx`, find:

```typescript
  type AttLog = {
    id: string; date: string
    clock_in: string | null; clock_out: string | null
    break_in: string | null; break_out: string | null
    break_total_mins: number
    work_type: string | null; status: string
  }
```

Replace with:

```typescript
  type BreakSession = { in: string; out: string | null; mins: number | null }
  type AttLog = {
    id: string; date: string
    clock_in: string | null; clock_out: string | null
    break_in: string | null; break_out: string | null
    break_total_mins: number
    break_sessions: BreakSession[] | null
    work_type: string | null; status: string
  }
```

Then find both SELECT strings:
```typescript
      .select("id, date, clock_in, clock_out, break_in, break_out, break_total_mins, work_type, status")
```

Replace **both** occurrences with:
```typescript
      .select("id, date, clock_in, clock_out, break_in, break_out, break_total_mins, break_sessions, work_type, status")
```

- [ ] **Step 2: Update attendance-client.tsx — AttLog type and Props**

In `app/member/attendance/attendance-client.tsx` (line 23), find:

```typescript
type AttLog = { id: string; date: string; clock_in: string | null; clock_out: string | null; break_in: string | null; break_out: string | null; break_total_mins: number; work_type: string | null; status: string }
```

Replace with:

```typescript
type BreakSession = { in: string; out: string | null; mins: number | null }
type AttLog = { id: string; date: string; clock_in: string | null; clock_out: string | null; break_in: string | null; break_out: string | null; break_total_mins: number; break_sessions: BreakSession[] | null; work_type: string | null; status: string }
```

- [ ] **Step 3: Update imports in attendance-client.tsx**

Find:
```typescript
import { clockIn, clockOut, markAbsent, breakIn, breakOut, getAttendanceByDate, manualClockOut } from "@/lib/actions/attendance"
```

Replace with:
```typescript
import { clockIn, clockOut, markAbsent, breakIn, breakOut, resumeAttendance, getAttendanceByDate, manualClockOut } from "@/lib/actions/attendance"
```

- [ ] **Step 4: Add break timeline helper function**

After the `fmtHoursShort` function in `attendance-client.tsx`, add:

```typescript
function fmtTimeFromIso(iso: string | null) {
  if (!iso) return "—"
  return new Date(iso).toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit", hour12: true })
}
```

- [ ] **Step 5: Find break buttons section and add break timeline UI**

In `attendance-client.tsx`, find the section that renders the break total minutes display when clocked in. It looks like:

```typescript
{/* Total break time */}
```

Search for the code that shows `breakTotalMins` in the CLOCKED IN state. After the break buttons row (Break In / Break Out buttons), add the break timeline. 

Find the render area in the `isIn` block. Look for the `isOnBreak` conditional rendering area. After the break controls div (that shows Break In/Break Out buttons and total), add:

```tsx
{/* Break timeline */}
{(todayLog?.break_sessions?.length ?? 0) > 0 && (
  <div className="mt-3 space-y-1.5">
    <p className="text-[10px] font-bold uppercase tracking-wider" style={{ color: "#9CA3AF" }}>Break History</p>
    {(todayLog?.break_sessions ?? []).map((s, i) => (
      <div key={i} className="flex items-center gap-2 text-[11px]" style={{ color: "#6B7280" }}>
        <span className="font-semibold" style={{ color: "#374151" }}>Break {i + 1}</span>
        <span>·</span>
        <span>{fmtTimeFromIso(s.in)}</span>
        <span>–</span>
        <span>{s.out ? fmtTimeFromIso(s.out) : <span style={{ color: "#F59E0B" }}>ongoing</span>}</span>
        {s.mins != null && <><span>·</span><span style={{ color: "#16A34A" }}>{s.mins} min</span></>}
      </div>
    ))}
  </div>
)}
```

- [ ] **Step 6: Add "Continue Working (Overtime)" button in isDone state**

In `attendance-client.tsx`, find the `isDone` section. It ends with a completion summary. Find where the clocked-out summary is displayed and append after the summary content (but inside the isDone block):

```tsx
{/* Overtime resume */}
<button
  onClick={() => handle(() => resumeAttendance(today))}
  disabled={isPending}
  className="mt-4 flex items-center justify-center gap-2 w-full py-3 rounded-2xl text-[13px] font-bold transition-all"
  style={{ background: "rgba(222,26,26,0.08)", border: "1.5px dashed rgba(222,26,26,0.3)", color: "#de1a1a", cursor: "pointer" }}>
  {isPending ? <Loader2 size={14} style={{ animation: "spin 1s linear infinite" }} /> : <TrendingUp size={14} />}
  Continue Working (Overtime)
</button>
```

Make sure `TrendingUp` is imported from lucide-react. It's already in the import list at line 5.

- [ ] **Step 7: Commit**

```bash
git add app/member/attendance/page.tsx app/member/attendance/attendance-client.tsx
git commit -m "feat: break timeline UI and continue working overtime button"
```

---

### Task 4: Daily Update Form — Pre-populate + Progress Indicator + History Link

**Files:**
- Modify: `app/member/update/daily-update-form.tsx`

- [ ] **Step 1: Add `parseExistingBlocks` helper**

In `daily-update-form.tsx`, after the `loadDraft` function (after line 88), add:

```typescript
type SavedEntry = {
  id?: string; task_type: string; title: string
  client_name?: string; is_multi_client?: boolean; client_names?: string[]
  start_time?: string | null; end_time?: string | null
  duration_hours?: number; notes?: string | null
}

function parseExistingBlocks(existingUpdate: Record<string, unknown>): TimeBlock[] {
  const entries = existingUpdate?.work_entries as SavedEntry[] | null
  if (!Array.isArray(entries)) return []
  return entries
    .filter(e => e.task_type === 'other')
    .map(e => ({
      id: e.id ?? crypto.randomUUID(),
      startTime: e.start_time ?? '09:00',
      endTime: e.end_time ?? '10:00',
      durationHours: e.duration_hours ?? 1,
      description: e.title ?? '',
      projectName: e.is_multi_client ? '' : (e.client_name === 'Internal' ? '' : (e.client_name ?? '')),
      status: ((e.notes?.replace(/^\[/, '').replace(/\]$/, '') ?? 'not_started') as TimeBlock['status']),
      isMultiClient: e.is_multi_client ?? false,
      clientNames: e.client_names ?? [],
    }))
}
```

- [ ] **Step 2: Fix timeBlocks initializer**

Find (line 129):
```typescript
  const [timeBlocks, setTimeBlocks] = useState<TimeBlock[]>(() => existingUpdate ? [] : loadDraft())
```

Replace with:
```typescript
  const [timeBlocks, setTimeBlocks] = useState<TimeBlock[]>(() =>
    existingUpdate ? parseExistingBlocks(existingUpdate) : loadDraft()
  )
```

- [ ] **Step 3: Pre-populate learning fields**

Find:
```typescript
  const [learningTopic, setLearningTopic] = useState("")
  const [learningHours, setLearningHours] = useState(1)
  const [learningNotes, setLearningNotes] = useState("")
```

Replace with:
```typescript
  const [learningTopic, setLearningTopic] = useState(
    (existingUpdate?.learning_topic as string) ?? ""
  )
  const [learningHours, setLearningHours] = useState(
    (existingUpdate?.learning_hours as number) ?? 1
  )
  const [learningNotes, setLearningNotes] = useState(
    (existingUpdate?.learning_notes as string) ?? ""
  )
```

- [ ] **Step 4: Fix "Edit Today's Update" button to pre-populate time blocks**

Search for where `editMode` is set to `true`. It will look something like:

```typescript
setEditMode(true)
```

or:

```typescript
onClick={() => setEditMode(true)}
```

There may be a button labeled "Edit Today's Update". Find it and change it to also call `setTimeBlocks`:

```typescript
onClick={() => {
  setTimeBlocks(parseExistingBlocks(existingUpdate ?? {}))
  setEditMode(true)
}}
```

- [ ] **Step 5: Add two-step progress indicator**

Find the form header area — look for where `workingDone` and `learningDone` state is used to show progress. 

In the component, find the submit area for the "working" tab (the section containing `handleWorkingSubmit`). Above or near the submit button, the spec calls for a progress indicator. Find the section showing the working tab submit area and add:

```tsx
{/* Two-step progress indicator */}
<div className="flex items-center gap-3 mb-4 p-3 rounded-xl" style={{ background: "#F8F9FC", border: "1px solid #EBEDF2" }}>
  <div className="flex items-center gap-1.5">
    <div className="w-4 h-4 rounded-full flex items-center justify-center" style={{ background: workingDone ? "#22C55E" : "#E5E7EB" }}>
      {workingDone && <span style={{ fontSize: 9, color: "#fff", fontWeight: 900 }}>✓</span>}
    </div>
    <span className="text-[11px] font-semibold" style={{ color: workingDone ? "#16A34A" : "#9CA3AF" }}>
      {workingDone ? "Work Log submitted" : "Work Log — submit below"}
    </span>
  </div>
  <span style={{ color: "#D1D5DB" }}>·</span>
  <div className="flex items-center gap-1.5">
    <div className="w-4 h-4 rounded-full flex items-center justify-center" style={{ background: learningDone ? "#22C55E" : "#E5E7EB" }}>
      {learningDone && <span style={{ fontSize: 9, color: "#fff", fontWeight: 900 }}>✓</span>}
    </div>
    <span className="text-[11px] font-semibold" style={{ color: learningDone ? "#16A34A" : "#9CA3AF" }}>
      {learningDone ? "Learning submitted" : "Learning — submit below"}
    </span>
  </div>
</div>
```

Place this just inside the main form content area (visible regardless of which tab is active).

- [ ] **Step 6: Add history link below working submit button**

Find the working submit button (the one that calls `handleWorkingSubmit`). After it, add:

```tsx
<p className="text-[11px] mt-2" style={{ color: "#9CA3AF" }}>
  Saved entries appear in your{" "}
  <a href="/member/history" style={{ color: "#6366F1", fontWeight: 600 }}>History tab ↗</a>
</p>
```

Do the same after the learning submit button.

- [ ] **Step 7: Commit**

```bash
git add app/member/update/daily-update-form.tsx
git commit -m "fix: pre-populate daily update form from existing record, progress indicator, history link"
```

---

### Task 5: My Tasks — Rename Tabs + Hide Empty Columns

**Files:**
- Modify: `app/member/tasks/tasks-client.tsx`

- [ ] **Step 1: Rename FILTER_TABS labels**

Find (line 558–566):
```typescript
  const FILTER_TABS = [
    { key: "all",        label: "All",       count: total },
    { key: "by_other",   label: "By Other",  count: byOtherCount },
    { key: "to_others",  label: "To Others", count: toOthersCount },
    { key: "for_me",     label: "For Me",    count: forMeCount },
    { key: "todo",        label: "To Do",       count: todos.length },
    { key: "in_progress", label: "In Progress", count: wip.length },
    { key: "completed",   label: "Completed",   count: doneTasks.length },
  ]
```

Replace with:
```typescript
  const FILTER_TABS = [
    { key: "all",        label: "All Tasks",       count: total },
    { key: "by_other",   label: "Assigned to Me",  count: byOtherCount },
    { key: "to_others",  label: "I Assigned",      count: toOthersCount },
    { key: "for_me",     label: "Self-Assigned",   count: forMeCount },
    { key: "todo",        label: "To Do",       count: todos.length },
    { key: "in_progress", label: "In Progress", count: wip.length },
    { key: "completed",   label: "Completed",   count: doneTasks.length },
  ]
```

- [ ] **Step 2: Hide empty columns instead of dimming**

Find the desktop Kanban grid loop (around line 758–762):
```typescript
          {KANBAN_COLS.map(col => {
              const list   = colTasks(col.key)
              const dimmed = filter !== "all" && filter !== col.key
              return (
                <div key={col.key} className="transition-all" style={{ opacity: dimmed ? 0.35 : 1 }}>
```

Replace with:
```typescript
          {KANBAN_COLS.map(col => {
              const list   = colTasks(col.key)
              const hidden = filter !== "all" && filter !== "todo" && filter !== "in_progress" && filter !== "completed" && list.length === 0
              if (hidden) return null
              return (
                <div key={col.key} className="transition-all">
```

- [ ] **Step 3: Commit**

```bash
git add app/member/tasks/tasks-client.tsx
git commit -m "fix: rename task filter tabs and hide empty columns when filtered"
```

---

### Task 6: Leave Server Actions — Delete Fix + Duplicate Check

**Files:**
- Modify: `lib/actions/leaves.ts`

- [ ] **Step 1: Remove pending-only guard from deleteLeaveRequest**

In `lib/actions/leaves.ts`, find (line 130):
```typescript
  if (leave.status !== 'pending') return { success: false, error: 'Can only delete pending requests' }
```

Delete that line entirely.

- [ ] **Step 2: Add server-side duplicate date check in submitLeaveRequest**

In `submitLeaveRequest`, after the company_id is resolved (after line ~65), and before the `supabase.from('leaves').insert(...)` call, add:

```typescript
  // Server-side duplicate check: reject if any leave overlaps the requested date range
  const { data: overlapping } = await supabase
    .from('leaves')
    .select('id')
    .eq('user_id', session.user.id)
    .lte('from_date', parsed.data.to_date)
    .gte('to_date', parsed.data.from_date)
    .not('status', 'eq', 'rejected')
    .limit(1)

  if (overlapping && overlapping.length > 0) {
    return { error: 'You already have a leave request for those dates.' }
  }
```

This must be placed just before the `.insert(...)` call.

- [ ] **Step 3: Commit**

```bash
git add lib/actions/leaves.ts
git commit -m "fix: allow deleting rejected leaves; prevent duplicate leave requests"
```

---

### Task 7: Leave Client — Sync State + Inline Date Error + Expired Delete + Timeline Line

**Files:**
- Modify: `app/member/leaves/leaves-client.tsx`

- [ ] **Step 1: Fix timeline line alignment**

In `leaves-client.tsx`, find (around line 393):
```typescript
                <div style={{ position: "absolute", left: 55, top: 16, bottom: 16, width: 2, background: "linear-gradient(to bottom, #DE1A1A30, #10B98130, #EF444430)", borderRadius: 99, zIndex: 0 }} />
```

Replace `left: 55` with `left: 9`:
```typescript
                <div style={{ position: "absolute", left: 9, top: 16, bottom: 16, width: 2, background: "linear-gradient(to bottom, #DE1A1A30, #10B98130, #EF444430)", borderRadius: 99, zIndex: 0 }} />
```

- [ ] **Step 2: Fix expired pending leaves — show three-dot menu for all pending**

Find the menu condition (around line 480):
```typescript
                            {leave.status === "pending" && !isExpired(leave) ? (
```

Replace with:
```typescript
                            {leave.status === "pending" ? (
```

- [ ] **Step 3: Add useEffect to sync leaves state with initialLeaves prop**

Find where the `leaves` state is defined. It will look like:
```typescript
  const [leaves, setLeaves] = useState(initialLeaves)
```

After that line, add:
```typescript
  useEffect(() => { setLeaves(initialLeaves) }, [initialLeaves])
```

Make sure `useEffect` is imported from React (it likely already is).

- [ ] **Step 4: Add inline date validation error state**

Find where the date inputs are defined in the leave form. Look for `<input type="date"` with `min={today}`. 

Add an error state near the other form states:
```typescript
  const [dateError, setDateError] = useState<string | null>(null)
```

Find the date `<input>` elements and add `onInvalid` handlers:
```tsx
onInvalid={e => { e.preventDefault(); setDateError("Leave requests must be for a future date.") }}
onChange={e => { setDateError(null); /* existing onChange */ }}
```

Below the date input, show the error:
```tsx
{dateError && (
  <p style={{ fontSize: 11, color: "#DE1A1A", margin: "4px 0 0" }}>{dateError}</p>
)}
```

- [ ] **Step 5: Commit**

```bash
git add app/member/leaves/leaves-client.tsx
git commit -m "fix: leave timeline alignment, expired pending delete, sync state, inline date error"
```

---

### Task 8: History Tab — Explanatory Banner

**Files:**
- Modify: `app/member/history/history-client.tsx`

- [ ] **Step 1: Add dismissible info banner**

In `history-client.tsx`, add a `useState` for dismissed state near other state declarations:
```typescript
  const [infoDismissed, setInfoDismissed] = useState(false)
```

Find the page title / header section of the component. After the hero banner div, add:

```tsx
{/* Explanatory banner */}
{!infoDismissed && (
  <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, margin: "0 0 16px", padding: "12px 16px", borderRadius: 14, background: "#F0F4FF", border: "1px solid #DBEAFE" }}>
    <p style={{ fontSize: 12, color: "#374151", margin: 0 }}>
      <span style={{ fontWeight: 700 }}>Your personal work diary.</span>{" "}
      Every daily update you submit appears here — filter by month, pick a date, or search by task or client.
    </p>
    <button onClick={() => setInfoDismissed(true)} style={{ flexShrink: 0, background: "none", border: "none", cursor: "pointer", color: "#6B7280", padding: 4 }}>
      <X size={14} />
    </button>
  </div>
)}
```

`X` is already imported in this file.

- [ ] **Step 2: Commit**

```bash
git add app/member/history/history-client.tsx
git commit -m "feat: add explanatory banner to history tab"
```

---

### Task 9: Announcements — Category Filter Fix + Admin Form + Action

**Files:**
- Modify: `app/member/announcements/announcements-client.tsx`
- Modify: `lib/actions/announcements.ts`
- Modify: `app/admin/announcements/announcements-client.tsx`

- [ ] **Step 1: Update AnnouncementRow type in member announcements-client.tsx**

In `app/member/announcements/announcements-client.tsx`, find:
```typescript
type AnnouncementRow = {
  id: string
  title: string
  message: string
  pinned: boolean
  created_at: string
  users: { name: string } | null
}
```

Replace with:
```typescript
type AnnouncementRow = {
  id: string
  title: string
  message: string
  pinned: boolean
  category: string
  created_at: string
  users: { name: string } | null
}
```

- [ ] **Step 2: Fix the filtered memo to apply category**

Find:
```typescript
  const filtered = useMemo(() =>
    announcements.filter(a =>
      a.title.toLowerCase().includes(search.toLowerCase()) ||
      a.message.toLowerCase().includes(search.toLowerCase())
    ), [announcements, search])
```

Replace with:
```typescript
  const filtered = useMemo(() =>
    announcements.filter(a =>
      (category === "All Categories" || a.category === category) &&
      (a.title.toLowerCase().includes(search.toLowerCase()) ||
       a.message.toLowerCase().includes(search.toLowerCase()))
    ), [announcements, search, category])
```

- [ ] **Step 3: Update the announcements page.tsx SELECT to include category**

In `app/member/announcements/page.tsx`, find the Supabase SELECT for announcements. Add `category` to the select string. It currently selects fields like `id, title, message, pinned, created_at`. Change to also include `category`.

- [ ] **Step 4: Update createAnnouncement action to persist category**

In `lib/actions/announcements.ts`, find the schema:
```typescript
const schema = z.object({
  title: z.string().min(1, 'Title required').max(120),
  message: z.string().min(1, 'Message required'),
  pinned: z.boolean().default(false),
})
```

Replace with:
```typescript
const schema = z.object({
  title: z.string().min(1, 'Title required').max(120),
  message: z.string().min(1, 'Message required'),
  pinned: z.boolean().default(false),
  category: z.enum(['General', 'Policy', 'Events', 'Urgent']).default('General'),
})
```

Find the raw object building:
```typescript
  const raw = {
    title: formData.get('title') as string,
    message: formData.get('message') as string,
    pinned: formData.get('pinned') === 'true',
  }
```

Replace with:
```typescript
  const raw = {
    title: formData.get('title') as string,
    message: formData.get('message') as string,
    pinned: formData.get('pinned') === 'true',
    category: (formData.get('category') as string) || 'General',
  }
```

Find the insert:
```typescript
  const { error } = await supabase.from('announcements').insert({
    company_id: claims.company_id,
    title: parsed.data.title,
    message: parsed.data.message,
    pinned: parsed.data.pinned,
    created_by: session.user.id,
  })
```

Replace with:
```typescript
  const { error } = await supabase.from('announcements').insert({
    company_id: claims.company_id,
    title: parsed.data.title,
    message: parsed.data.message,
    pinned: parsed.data.pinned,
    category: parsed.data.category,
    created_by: session.user.id,
  })
```

- [ ] **Step 5: Add category select to admin create form**

In `app/admin/announcements/announcements-client.tsx`, find the create announcement form. It uses `useActionState(createAnnouncement, null)`. Find the form fields area (title input, message textarea). After the message textarea and before the pinned checkbox/submit, add:

```tsx
<div>
  <label style={{ fontSize: 11, fontWeight: 700, color: "#374151", display: "block", marginBottom: 6 }}>Category</label>
  <select name="category" defaultValue="General"
    style={{ width: "100%", padding: "10px 12px", borderRadius: 10, border: "1.5px solid #EBEDF2", fontSize: 13, color: "#111827", background: "#F9FAFB", outline: "none" }}>
    <option value="General">General</option>
    <option value="Policy">Policy</option>
    <option value="Events">Events</option>
    <option value="Urgent">Urgent</option>
  </select>
</div>
```

- [ ] **Step 6: Commit**

```bash
git add app/member/announcements/announcements-client.tsx lib/actions/announcements.ts app/admin/announcements/announcements-client.tsx
git commit -m "fix: apply category filter in announcements; add category field to admin form and action"
```

Also check and update `app/member/announcements/page.tsx` if needed to include `category` in the SELECT.

---

### Task 10: Profile/KYC — Label Rename + View/Replace/Delete

**Files:**
- Modify: `app/member/profile/profile-client.tsx`
- Modify: `lib/actions/profile.ts`

- [ ] **Step 1: Rename Ration Card labels**

In `app/member/profile/profile-client.tsx`, find (around line 578):
```typescript
                    { title: "Ration Card",  fields: [{ f: "ration_card_url" as const, l: "Img 1" }, { f: "ration_card_url2" as const, l: "Img 2" }] },
```

Replace with:
```typescript
                    { title: "Ration Card",  fields: [{ f: "ration_card_url" as const, l: "Front Side" }, { f: "ration_card_url2" as const, l: "Back Side" }] },
```

- [ ] **Step 2: Add `deleteKYCDocument` server action**

In `lib/actions/profile.ts`, append at the end:

```typescript
export type KYCDocField = 'govt_id_url' | 'aadhaar_back_url' | 'pan_front_url' | 'pan_back_url' | 'ration_card_url' | 'ration_card_url2'

export async function deleteKYCDocument(
  field: KYCDocField
): Promise<{ success: boolean; error?: string }> {
  const supabase = await createServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { success: false, error: 'Unauthorized' }

  const admin = adminSupabase()

  // Get current URL so we can remove from storage
  const { data: kyc } = await admin
    .from('member_kyc')
    .select(field)
    .eq('user_id', user.id)
    .maybeSingle()

  const url = kyc?.[field] as string | null
  if (url) {
    // Extract storage path from URL
    // Supabase URLs end with /storage/v1/object/public/documents/<path>
    const marker = '/documents/'
    const idx = url.indexOf(marker)
    if (idx !== -1) {
      const storagePath = url.slice(idx + marker.length)
      await admin.storage.from('documents').remove([storagePath])
    }
  }

  const { error } = await admin
    .from('member_kyc')
    .update({ [field]: null })
    .eq('user_id', user.id)

  if (error) return { success: false, error: error.message }
  revalidatePath('/member/profile')
  return { success: true }
}
```

- [ ] **Step 3: Import deleteKYCDocument in profile-client.tsx**

In `profile-client.tsx`, find the imports from `@/lib/actions/profile`. Add `deleteKYCDocument` to the import:

```typescript
import { updateOwnProfile, updatePersonalDetails, updateKYC, deleteKYCDocument, type KYCDocField } from "@/lib/actions/profile"
```

(Check what's currently imported and add the new ones.)

- [ ] **Step 4: Add View/Replace/Delete buttons to the KYC view mode**

In `profile-client.tsx`, find the static view of KYC data (the non-edit mode). Currently it shows a "View All Documents" button. Replace that button with a per-document grid showing View/Replace/Delete.

Find the non-edit KYC section (the else branch of `editKYC`):

After the bank/aadhaar/PAN text fields display, replace the "View All Documents" button with:

```tsx
{/* KYC document actions */}
{([
  { f: "govt_id_url" as KYCDocField,      l: "Aadhaar Front" },
  { f: "aadhaar_back_url" as KYCDocField, l: "Aadhaar Back" },
  { f: "pan_front_url" as KYCDocField,    l: "PAN Front" },
  { f: "pan_back_url" as KYCDocField,     l: "PAN Back" },
  { f: "ration_card_url" as KYCDocField,  l: "Ration Card Front" },
  { f: "ration_card_url2" as KYCDocField, l: "Ration Card Back" },
] as { f: KYCDocField; l: string }[]).map(({ f, l }) => {
  const url = kyc?.[f] as string | null
  const fileRef = React.useRef<HTMLInputElement>(null)
  return (
    <div key={f} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "8px 0", borderBottom: "1px solid #F3F4F6" }}>
      <span style={{ fontSize: 12, color: "#374151", fontWeight: 600 }}>{l}</span>
      {url ? (
        <div style={{ display: "flex", gap: 6 }}>
          <a href={url} target="_blank" rel="noreferrer"
            style={{ fontSize: 11, fontWeight: 700, color: "#3B82F6", padding: "4px 10px", borderRadius: 8, background: "rgba(59,130,246,0.08)", border: "1px solid rgba(59,130,246,0.2)", textDecoration: "none" }}>
            View
          </a>
          <button onClick={() => fileRef.current?.click()}
            style={{ fontSize: 11, fontWeight: 700, color: "#F59E0B", padding: "4px 10px", borderRadius: 8, background: "rgba(245,158,11,0.08)", border: "1px solid rgba(245,158,11,0.2)", cursor: "pointer" }}>
            Replace
          </button>
          <button onClick={async () => {
            if (!confirm(`Delete ${l}?`)) return
            const res = await deleteKYCDocument(f)
            if (res.success) router.refresh()
          }}
            style={{ fontSize: 11, fontWeight: 700, color: "#EF4444", padding: "4px 10px", borderRadius: 8, background: "rgba(239,68,68,0.08)", border: "1px solid rgba(239,68,68,0.2)", cursor: "pointer" }}>
            Delete
          </button>
          <input ref={fileRef} type="file" accept="image/*,application/pdf" style={{ display: "none" }}
            onChange={async e => {
              const file = e.target.files?.[0]
              if (!file) return
              await handleDocUpload(f, file)
              await updateKYC({ [f]: kycForm[f] })
              router.refresh()
            }} />
        </div>
      ) : (
        <span style={{ fontSize: 11, color: "#D1D5DB" }}>Not uploaded</span>
      )}
    </div>
  )
})}
```

Note: `React.useRef` inside `.map()` will trigger a hooks violation. Instead, add the file input refs as a record at the top of the component. Add this near the other refs:

```typescript
  const docRefs = {
    govt_id_url:      useRef<HTMLInputElement>(null),
    aadhaar_back_url: useRef<HTMLInputElement>(null),
    pan_front_url:    useRef<HTMLInputElement>(null),
    pan_back_url:     useRef<HTMLInputElement>(null),
    ration_card_url:  useRef<HTMLInputElement>(null),
    ration_card_url2: useRef<HTMLInputElement>(null),
  } as Record<KYCDocField, React.RefObject<HTMLInputElement>>
```

Then use `docRefs[f]` instead of `fileRef` inside the map. This is valid since the refs object itself is created at the top level.

- [ ] **Step 5: Commit**

```bash
git add app/member/profile/profile-client.tsx lib/actions/profile.ts
git commit -m "feat: KYC view/replace/delete buttons; rename ration card labels"
```

---

### Task 11: Notifications — Infrastructure (Actions + Layout + Sidebar)

**Files:**
- Create: `lib/actions/notifications.ts`
- Modify: `app/member/layout.tsx`
- Modify: `components/member/sidebar.tsx`

- [ ] **Step 1: Create `lib/actions/notifications.ts`**

```typescript
'use server'

import { createServerClient } from '@/lib/supabase/server'
import { createClient } from '@supabase/supabase-js'
import { revalidatePath } from 'next/cache'

function adminSupabase() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  )
}

export interface NotificationRow {
  id: string
  type: string
  title: string
  body: string | null
  read: boolean
  link: string | null
  created_at: string
}

export async function getUnreadNotifications(): Promise<NotificationRow[]> {
  const supabase = await createServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return []

  const admin = adminSupabase()
  const { data } = await admin
    .from('notifications')
    .select('id, type, title, body, read, link, created_at')
    .eq('user_id', user.id)
    .eq('read', false)
    .order('created_at', { ascending: false })
    .limit(5)

  return (data ?? []) as NotificationRow[]
}

export async function getNotificationCount(): Promise<number> {
  const supabase = await createServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return 0

  const admin = adminSupabase()
  const { count } = await admin
    .from('notifications')
    .select('*', { count: 'exact', head: true })
    .eq('user_id', user.id)
    .eq('read', false)

  return count ?? 0
}

export async function markAllRead(): Promise<{ success: boolean }> {
  const supabase = await createServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { success: false }

  const admin = adminSupabase()
  await admin.from('notifications').update({ read: true }).eq('user_id', user.id).eq('read', false)
  revalidatePath('/member', 'layout')
  return { success: true }
}

export async function getAllNotifications(): Promise<NotificationRow[]> {
  const supabase = await createServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return []

  const admin = adminSupabase()
  const { data } = await admin
    .from('notifications')
    .select('id, type, title, body, read, link, created_at')
    .eq('user_id', user.id)
    .order('created_at', { ascending: false })

  return (data ?? []) as NotificationRow[]
}

export async function insertNotification({
  companyId, userId, type, title, body, link,
}: {
  companyId: string; userId: string; type: string
  title: string; body?: string; link?: string
}): Promise<void> {
  const admin = adminSupabase()
  await admin.from('notifications').insert({
    company_id: companyId,
    user_id: userId,
    type,
    title,
    body: body ?? null,
    link: link ?? null,
  })
}
```

- [ ] **Step 2: Update `app/member/layout.tsx` to query notification count**

In `app/member/layout.tsx`, add the import:

```typescript
import { getNotificationCount } from '@/lib/actions/notifications'
```

Find the Promise.all array:
```typescript
  const [{ data: profile }, { count: pendingLeaves }] = await Promise.all([
    admin.from("users").select("name, employee_id, role, must_change_password, photo_url").eq("id", user.id).single(),
    admin.from("leaves").select("*", { count: "exact", head: true }).eq("user_id", user.id).eq("status", "pending"),
  ])
```

Replace with:
```typescript
  const [{ data: profile }, unreadCount] = await Promise.all([
    admin.from("users").select("name, employee_id, role, must_change_password, photo_url").eq("id", user.id).single(),
    getNotificationCount(),
  ])
```

Then update the `MemberSidebar` call to pass `unreadCount`:
```tsx
      <MemberSidebar
        name={profile?.name ?? "Member"}
        employeeId={profile?.employee_id ?? ""}
        unreadCount={unreadCount}
        photoUrl={profile?.photo_url ?? null}
      />
```

- [ ] **Step 3: Update sidebar prop type and bell panel**

In `components/member/sidebar.tsx`, find the component signature:
```typescript
export default function MemberSidebar({ name, employeeId, pendingLeaves = 0, photoUrl = null }: { name: string; employeeId: string; pendingLeaves?: number; photoUrl?: string | null }) {
```

Replace with:
```typescript
export default function MemberSidebar({ name, employeeId, unreadCount = 0, photoUrl = null }: { name: string; employeeId: string; unreadCount?: number; photoUrl?: string | null }) {
```

Now replace all `pendingLeaves` references in sidebar.tsx with `unreadCount`.

Find every occurrence of `pendingLeaves > 0` and replace with `unreadCount > 0`.
Find every occurrence of `{pendingLeaves}` (the badge number) and replace with `{unreadCount}`.

Also update the bell panel content. Currently it shows a leaves-specific message. Replace the bell panel body (the `{pendingLeaves > 0 ? ... : ...}` conditional inside the desktop bell, tablet bell, and mobile bell) with:

```tsx
{unreadCount > 0 ? (
  <div className="px-4 py-3">
    <p className="text-[12px] font-bold mb-3" style={{ color: "#FFFFFF" }}>
      {unreadCount} unread notification{unreadCount !== 1 ? "s" : ""}
    </p>
    <Link href="/member/notifications" onClick={() => setBellOpen(false)}
      className="flex items-center justify-center gap-1 w-full py-2 rounded-xl text-[11px] font-bold"
      style={{ background: "rgba(222,26,26,0.15)", color: "#ff6b6b" }}>
      View All Notifications <ChevronRight size={11} />
    </Link>
  </div>
) : (
  <div className="px-4 py-4 text-center">
    <p className="text-[12px]" style={{ color: "rgba(255,255,255,0.35)" }}>No unread notifications</p>
  </div>
)}
```

Do this for all 3 bell panel instances (desktop, tablet, mobile).

- [ ] **Step 4: Commit**

```bash
git add lib/actions/notifications.ts app/member/layout.tsx components/member/sidebar.tsx
git commit -m "feat: notifications infrastructure — actions, layout count, sidebar bell panel"
```

---

### Task 12: Notifications — Full Page

**Files:**
- Create: `app/member/notifications/page.tsx`

- [ ] **Step 1: Create the notifications page**

Create `app/member/notifications/page.tsx`:

```typescript
import { createServerClient } from "@/lib/supabase/server"
import { redirect } from "next/navigation"
import { getAllNotifications, markAllRead, type NotificationRow } from "@/lib/actions/notifications"
import { Bell, CheckCircle2, Calendar, Target, Megaphone, ChevronRight } from "lucide-react"
import Link from "next/link"

function timeAgo(iso: string) {
  const diff = Date.now() - new Date(iso).getTime()
  const m = Math.floor(diff / 60000)
  if (m < 1) return "Just now"
  if (m < 60) return `${m}m ago`
  const h = Math.floor(m / 60)
  if (h < 24) return `${h}h ago`
  return `${Math.floor(h / 24)}d ago`
}

function typeIcon(type: string) {
  if (type === "leave_status") return <Calendar size={14} style={{ color: "#6366F1" }} />
  if (type === "task_assigned") return <Target size={14} style={{ color: "#22C55E" }} />
  if (type === "announcement") return <Megaphone size={14} style={{ color: "#F59E0B" }} />
  return <Bell size={14} style={{ color: "#9CA3AF" }} />
}

function groupByTime(notifications: NotificationRow[]) {
  const today = new Date().toISOString().split("T")[0]
  const weekAgo = new Date(Date.now() - 7 * 86400000).toISOString().split("T")[0]

  const groups: { label: string; items: NotificationRow[] }[] = [
    { label: "Today",     items: notifications.filter(n => n.created_at.startsWith(today)) },
    { label: "This Week", items: notifications.filter(n => n.created_at > weekAgo + "T" && !n.created_at.startsWith(today)) },
    { label: "Earlier",   items: notifications.filter(n => n.created_at <= weekAgo + "T") },
  ]
  return groups.filter(g => g.items.length > 0)
}

export default async function NotificationsPage() {
  const supabase = await createServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect("/login")

  const notifications = await getAllNotifications()
  const groups = groupByTime(notifications)

  return (
    <div style={{ background: "#F8F9FC", minHeight: "100vh", padding: "20px 16px 48px" }} className="md:!p-[24px_28px_48px]">

      {/* Header */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 24 }}>
        <div>
          <h1 style={{ fontSize: 28, fontWeight: 900, color: "#111111", margin: "0 0 4px", fontFamily: "var(--font-jakarta)" }}>Notifications</h1>
          <p style={{ fontSize: 13, color: "#9CA3AF", margin: 0 }}>
            {notifications.filter(n => !n.read).length} unread
          </p>
        </div>
        {notifications.some(n => !n.read) && (
          <form action={markAllRead}>
            <button type="submit"
              style={{ display: "flex", alignItems: "center", gap: 6, padding: "8px 16px", borderRadius: 10, background: "rgba(222,26,26,0.08)", border: "1px solid rgba(222,26,26,0.2)", fontSize: 12, fontWeight: 700, color: "#DE1A1A", cursor: "pointer" }}>
              <CheckCircle2 size={12} /> Mark all as read
            </button>
          </form>
        )}
      </div>

      {/* Notifications list */}
      {notifications.length === 0 ? (
        <div style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", padding: "80px 0" }}>
          <div style={{ width: 64, height: 64, borderRadius: 20, background: "#F3F4F6", display: "flex", alignItems: "center", justifyContent: "center", marginBottom: 16 }}>
            <Bell size={28} style={{ color: "#D1D5DB" }} />
          </div>
          <p style={{ fontSize: 16, fontWeight: 700, color: "#374151", margin: "0 0 6px" }}>All caught up!</p>
          <p style={{ fontSize: 13, color: "#9CA3AF", margin: 0 }}>No notifications yet.</p>
        </div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 24 }}>
          {groups.map(group => (
            <div key={group.label}>
              <p style={{ fontSize: 11, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.1em", color: "#9CA3AF", margin: "0 0 10px" }}>{group.label}</p>
              <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                {group.items.map(n => (
                  <div key={n.id} style={{ display: "flex", alignItems: "flex-start", gap: 14, padding: "14px 16px", borderRadius: 16, background: n.read ? "#FFFFFF" : "#FFF5F5", border: n.read ? "1px solid #EBEDF2" : "1px solid rgba(222,26,26,0.15)", boxShadow: "0 1px 4px rgba(0,0,0,0.04)" }}>
                    <div style={{ width: 36, height: 36, borderRadius: 12, background: "#F8F9FC", border: "1px solid #EBEDF2", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0, marginTop: 1 }}>
                      {typeIcon(n.type)}
                    </div>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <p style={{ fontSize: 14, fontWeight: n.read ? 600 : 800, color: "#111111", margin: "0 0 3px" }}>{n.title}</p>
                      {n.body && <p style={{ fontSize: 12, color: "#6B7280", margin: "0 0 5px" }}>{n.body}</p>}
                      <p style={{ fontSize: 11, color: "#9CA3AF", margin: 0 }}>{timeAgo(n.created_at)}</p>
                    </div>
                    {n.link && (
                      <Link href={n.link}
                        style={{ display: "flex", alignItems: "center", gap: 4, fontSize: 11, fontWeight: 700, color: "#DE1A1A", flexShrink: 0, textDecoration: "none", padding: "6px 10px", borderRadius: 8, background: "rgba(222,26,26,0.06)" }}>
                        Go to <ChevronRight size={11} />
                      </Link>
                    )}
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
```

- [ ] **Step 2: Add Notifications link to sidebar nav items**

In `components/member/sidebar.tsx`, find:
```typescript
const navItems = [
  { label: "Dashboard",     href: "/member/dashboard",     icon: LayoutDashboard },
  ...
```

Add a Notifications item. Import `Bell` from lucide-react (it's already imported). Add after Profile:
```typescript
  { label: "Notifications", href: "/member/notifications", icon: Bell },
```

Also add to `moreNavItems` if appropriate.

- [ ] **Step 3: Commit**

```bash
git add app/member/notifications/page.tsx components/member/sidebar.tsx
git commit -m "feat: full notifications page with grouping and mark-all-read"
```

---

### Task 13: Notification Triggers in Admin Actions

**Files:**
- Modify: `lib/actions/leaves.ts`
- Modify: `lib/actions/announcements.ts`

- [ ] **Step 1: Insert notification when leave is approved/rejected**

In `lib/actions/leaves.ts`, add import at the top:
```typescript
import { insertNotification } from '@/lib/notifications/notifications'
```

Wait — `insertNotification` is in `lib/actions/notifications.ts`. But server actions can import from other server action files. Add:
```typescript
import { insertNotification } from '@/lib/actions/notifications'
```

In `updateLeaveStatus`, after the successful update (after `if (error) return...`), add:

```typescript
  // Notify the member
  try {
    // Get user_id and company_id from the leave
    const { data: leaveData } = await admin
      .from('leaves')
      .select('user_id, company_id')
      .eq('id', leaveId)
      .single()

    if (leaveData) {
      await insertNotification({
        companyId: leaveData.company_id as string,
        userId: leaveData.user_id as string,
        type: 'leave_status',
        title: status === 'approved' ? 'Leave Request Approved' : 'Leave Request Rejected',
        body: `Your leave request has been ${status}.`,
        link: '/member/leaves',
      })
    }
  } catch { /* non-critical */ }
```

- [ ] **Step 2: Insert notification when announcement is created**

In `lib/actions/announcements.ts`, add import:
```typescript
import { insertNotification } from '@/lib/actions/notifications'
```

In `createAnnouncement`, after the successful insert, add:

```typescript
  // Notify all company members
  try {
    const admin = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!,
      { auth: { autoRefreshToken: false, persistSession: false } }
    )
    const { data: members } = await admin
      .from('users')
      .select('id')
      .eq('company_id', claims.company_id)
      .eq('role', 'MEMBER')

    if (members) {
      await Promise.all(
        members.map(m =>
          insertNotification({
            companyId: claims.company_id as string,
            userId: m.id as string,
            type: 'announcement',
            title: `New Announcement: ${parsed.data.title}`,
            body: parsed.data.message.slice(0, 100),
            link: '/member/announcements',
          })
        )
      )
    }
  } catch { /* non-critical */ }
```

Note: `createClient` is not currently imported in `announcements.ts`. Add the import:
```typescript
import { createClient } from '@supabase/supabase-js'
```

- [ ] **Step 3: Commit**

```bash
git add lib/actions/leaves.ts lib/actions/announcements.ts
git commit -m "feat: insert notifications on leave status change and new announcement"
```

---

### Task 14: Final Checks + Push

- [ ] **Step 1: Run TypeScript check**

```bash
pnpm typecheck
```

Fix any type errors. Common issues to watch for:
- `useRef` called inside `.map()` in profile-client.tsx (use the `docRefs` record approach from Task 10)
- `break_sessions` type mismatch between page.tsx and client.tsx — both should use `BreakSession[] | null`
- `unreadCount` prop name in sidebar vs layout mismatch

- [ ] **Step 2: Run lint**

```bash
pnpm lint
```

Fix any ESLint errors.

- [ ] **Step 3: Final commit and push**

```bash
git add -A
git commit -m "chore: fix any remaining type and lint errors after bundle"
git push origin master
```

---

## Spec Coverage Checklist

| # | Spec item | Task |
|---|-----------|------|
| 1.1 | Multi-break support | Task 2 |
| 1.2 | Break timeline | Tasks 2, 3 |
| 1.3 | Post-clock-out overtime button | Task 3 |
| 2.1 | Submit button clarity / progress indicator | Task 4 |
| 2.2 | Entries lost on reload | Task 4 |
| 2.3 | History link below submit | Task 4 |
| 3.1 | Tab label rename | Task 5 |
| 3.2 | Server action audit (assigned_to) | ✅ `createMemberTask` already reads `formData.get('assigned_to')` correctly |
| 3.3 | Hide empty columns | Task 5 |
| 3.4 | Group by Project | Out of scope (deferred) |
| 4.1 | Inline date validation error | Task 7 |
| 4.2 | Duplicate leave requests | Tasks 6, 7 |
| 4.3 | Delete expired pending leaves | Task 7 |
| 4.4 | Delete rejected leaves | Task 6 |
| 4.5 | Timeline line alignment | Task 7 |
| 5.1 | History banner | Task 8 |
| 6.1 | Announcement category filter | Task 9 |
| 7.1 | Ration Card label rename | Task 10 |
| 7.2 | KYC view/replace/delete | Task 10 |
| 8.1 | DB schema for notifications | Task 1 |
| 8.2 | Notification triggers | Task 13 |
| 8.3 | Bell panel | Task 11 |
| 8.4 | Full notifications page | Task 12 |
