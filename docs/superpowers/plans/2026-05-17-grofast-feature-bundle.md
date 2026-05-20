# GroFast Feature Bundle Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship 8 independent improvements: fix location check-in, add break in/out, auto-delete old completed tasks, update media editing form (video types, duration, mandatory drive link), add travel time to shoots, let members assign tasks, and add per-client employee cost breakdown in expenses.

**Architecture:** DB migrations first (3 files), then server-side actions, then UI. All changes are isolated — no shared state between features. Expenses calculation derives `per_hour = monthly_salary / 25 / 9` from the existing `monthly_salary` column on `users`.

**Tech Stack:** Next.js 15 App Router, Supabase PostgreSQL (service-role client for mutations), TypeScript, Tailwind CSS, Vercel Cron

---

## File Map

| File | Change |
|------|--------|
| `supabase/migrations/029_attendance_breaks.sql` | CREATE — break_in/break_out columns on attendance_logs |
| `supabase/migrations/030_task_completed_at.sql` | CREATE — completed_at column on tasks |
| `supabase/migrations/031_shoot_travel_time.sql` | CREATE — travel_time_hours column on shoots |
| `lib/actions/attendance.ts` | MODIFY — add breakIn(), breakOut() exports |
| `app/member/attendance/attendance-client.tsx` | MODIFY — fix geolocation errors, add break UI |
| `app/member/update/daily-update-form.tsx` | MODIFY — video types, duration dropdown, drive link mandatory, multi-client time blocks |
| `lib/actions/shoots.ts` | MODIFY — add travel_time_hours to ShootInput + insert |
| `app/member/shoots/shoots-client.tsx` | MODIFY — travel_time_hours field in form |
| `lib/actions/tasks.ts` | MODIFY — set completed_at on status change, add createMemberTask |
| `app/api/cron/cleanup-tasks/route.ts` | CREATE — delete tasks where completed_at < 7 days ago |
| `vercel.json` | MODIFY — add cleanup-tasks cron |
| `app/member/tasks/page.tsx` | MODIFY — fetch active team members |
| `app/member/tasks/tasks-client.tsx` | MODIFY — "Assign Task" modal |
| `app/admin/expenses/page.tsx` | MODIFY — fetch monthly_salary for users |
| `app/admin/expenses/expenses-client.tsx` | MODIFY — add "Per Client" cost tab using salary formula |

---

## Task 1: DB Migrations

**Files:**
- Create: `supabase/migrations/029_attendance_breaks.sql`
- Create: `supabase/migrations/030_task_completed_at.sql`
- Create: `supabase/migrations/031_shoot_travel_time.sql`

- [ ] **Step 1: Create 029_attendance_breaks.sql**

```sql
-- Add break tracking to attendance_logs
ALTER TABLE attendance_logs
  ADD COLUMN IF NOT EXISTS break_in  timestamptz,
  ADD COLUMN IF NOT EXISTS break_out timestamptz;
```

- [ ] **Step 2: Create 030_task_completed_at.sql**

```sql
-- Track when a task was marked completed (for 7-day auto-delete)
ALTER TABLE tasks
  ADD COLUMN IF NOT EXISTS completed_at timestamptz;

-- Backfill existing completed tasks with created_at as approximate date
UPDATE tasks SET completed_at = created_at WHERE status = 'completed' AND completed_at IS NULL;
```

- [ ] **Step 3: Create 031_shoot_travel_time.sql**

```sql
-- Travel time for shoots (internal only, not billed to clients)
ALTER TABLE shoots
  ADD COLUMN IF NOT EXISTS travel_time_hours numeric(4,2) NOT NULL DEFAULT 0;
```

- [ ] **Step 4: Run all three migrations in Supabase SQL editor (or via CLI)**

```bash
# In Supabase dashboard → SQL Editor, run each file in order: 029, 030, 031
```

- [ ] **Step 5: Commit**

```bash
git add supabase/migrations/029_attendance_breaks.sql supabase/migrations/030_task_completed_at.sql supabase/migrations/031_shoot_travel_time.sql
git commit -m "db: add break columns, task completed_at, shoot travel_time_hours"
```

---

## Task 2: Fix Attendance Location Geolocation

**Files:**
- Modify: `app/member/attendance/attendance-client.tsx:86-110`

The current error callback only says "Location access denied" regardless of what actually failed (timeout, hardware unavailable, denied). Fix error messages + increase timeout + try low-accuracy fallback on timeout.

- [ ] **Step 1: Replace handleLogIn in attendance-client.tsx**

Find this block (lines 86–110):
```typescript
const handleLogIn = useCallback(() => {
  setError(null)
  if (selectedMode === "office" && OFFICE_CHECK_ENABLED) {
    if (!navigator.geolocation) { setError("Browser does not support location."); return }
    setGeoLoading(true)
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setGeoLoading(false)
        if (pos.coords.accuracy > OFFICE_RADIUS) {
          startTransition(async () => { const res = await clockIn(selectedMode); if (!res.success) setError(res.error ?? "Error"); else router.refresh() })
          return
        }
        const dist = haversineMeters(pos.coords.latitude, pos.coords.longitude, OFFICE_LAT, OFFICE_LNG)
        if (dist > OFFICE_RADIUS) { setError(`You are ${Math.round(dist)}m from the office (allowed: ${OFFICE_RADIUS}m).`); return }
        startTransition(async () => { const res = await clockIn(selectedMode); if (!res.success) setError(res.error ?? "Error"); else router.refresh() })
      },
      () => { setGeoLoading(false); setError("Location access denied.") },
      { timeout: 15000, maximumAge: 0, enableHighAccuracy: true }
    )
  } else {
    startTransition(async () => { const res = await clockIn(selectedMode); if (!res.success) setError(res.error ?? "Error"); else router.refresh() })
  }
}, [selectedMode, router, startTransition])
```

Replace with:

```typescript
const handleLogIn = useCallback(() => {
  setError(null)
  if (selectedMode === "office" && OFFICE_CHECK_ENABLED) {
    if (!navigator.geolocation) { setError("Location not supported by this browser."); return }
    setGeoLoading(true)

    const doClockIn = () =>
      startTransition(async () => { const res = await clockIn(selectedMode); if (!res.success) setError(res.error ?? "Error"); else router.refresh() })

    const checkPosition = (pos: GeolocationPosition) => {
      setGeoLoading(false)
      if (pos.coords.accuracy > OFFICE_RADIUS) { doClockIn(); return }
      const dist = haversineMeters(pos.coords.latitude, pos.coords.longitude, OFFICE_LAT, OFFICE_LNG)
      if (dist > OFFICE_RADIUS) { setError(`You are ${Math.round(dist)}m from the office (max ${OFFICE_RADIUS}m).`); return }
      doClockIn()
    }

    // Try high-accuracy first; if it times out, fall back to network-based location
    navigator.geolocation.getCurrentPosition(
      checkPosition,
      (err) => {
        if (err.code === err.TIMEOUT) {
          // Retry with low accuracy (uses WiFi/cell — faster but less precise)
          navigator.geolocation.getCurrentPosition(
            checkPosition,
            (err2) => {
              setGeoLoading(false)
              if (err2.code === err2.PERMISSION_DENIED) {
                setError("Location permission denied. Enable it in your browser settings.")
              } else {
                setError("Could not get your location. Try again or switch to WFH mode.")
              }
            },
            { timeout: 10000, maximumAge: 60000, enableHighAccuracy: false }
          )
        } else if (err.code === err.PERMISSION_DENIED) {
          setGeoLoading(false)
          setError("Location permission denied. Enable it in your browser settings.")
        } else {
          setGeoLoading(false)
          setError("Location unavailable. Check your device GPS and try again.")
        }
      },
      { timeout: 12000, maximumAge: 30000, enableHighAccuracy: true }
    )
  } else {
    startTransition(async () => { const res = await clockIn(selectedMode); if (!res.success) setError(res.error ?? "Error"); else router.refresh() })
  }
}, [selectedMode, router, startTransition])
```

- [ ] **Step 2: Commit**

```bash
git add app/member/attendance/attendance-client.tsx
git commit -m "fix: attendance location — better errors + low-accuracy fallback on timeout"
```

---

## Task 3: Break In/Out — Server Actions

**Files:**
- Modify: `lib/actions/attendance.ts`

- [ ] **Step 1: Add breakIn and breakOut to attendance.ts**

Add after the `clockOut` export (after line 164):

```typescript
export async function breakIn(): Promise<{ success: boolean; error?: string }> {
  const ctxResult = await getUserContext()
  if ('error' in ctxResult) return { success: false, error: ctxResult.error }
  const ctx = ctxResult

  const today = new Date().toISOString().split('T')[0]
  const admin = adminSupabase()

  const { data: log } = await admin
    .from('attendance_logs')
    .select('id, clock_in, break_in')
    .eq('company_id', ctx.companyId)
    .eq('user_id', ctx.userId)
    .eq('date', today)
    .maybeSingle()

  if (!log?.clock_in) return { success: false, error: 'Clock in first before starting a break.' }
  if (log.break_in)   return { success: false, error: 'Break already started today.' }

  const { error } = await admin
    .from('attendance_logs')
    .update({ break_in: new Date().toISOString() })
    .eq('id', log.id)

  if (error) return { success: false, error: error.message }
  revalidatePath('/member/attendance')
  return { success: true }
}

export async function breakOut(): Promise<{ success: boolean; error?: string }> {
  const ctxResult = await getUserContext()
  if ('error' in ctxResult) return { success: false, error: ctxResult.error }
  const ctx = ctxResult

  const today = new Date().toISOString().split('T')[0]
  const admin = adminSupabase()

  const { data: log } = await admin
    .from('attendance_logs')
    .select('id, break_in, break_out')
    .eq('company_id', ctx.companyId)
    .eq('user_id', ctx.userId)
    .eq('date', today)
    .maybeSingle()

  if (!log?.break_in)   return { success: false, error: 'No break started yet.' }
  if (log.break_out)    return { success: false, error: 'Break already ended today.' }

  const { error } = await admin
    .from('attendance_logs')
    .update({ break_out: new Date().toISOString() })
    .eq('id', log.id)

  if (error) return { success: false, error: error.message }
  revalidatePath('/member/attendance')
  return { success: true }
}
```

- [ ] **Step 2: Commit**

```bash
git add lib/actions/attendance.ts
git commit -m "feat: add breakIn / breakOut server actions"
```

---

## Task 4: Break In/Out — UI

**Files:**
- Modify: `app/member/attendance/attendance-client.tsx`

The `AttLog` type, Props, and the render area after the clock-out button need updating.

- [ ] **Step 1: Update AttLog type (line 23)**

Change:
```typescript
type AttLog = { id: string; date: string; clock_in: string | null; clock_out: string | null; work_type: string | null; status: string }
```
To:
```typescript
type AttLog = { id: string; date: string; clock_in: string | null; clock_out: string | null; break_in: string | null; break_out: string | null; work_type: string | null; status: string }
```

- [ ] **Step 2: Add breakIn/breakOut to imports (line 6)**

Change:
```typescript
import { clockIn, clockOut, markAbsent, getAttendanceByDate } from "@/lib/actions/attendance"
```
To:
```typescript
import { clockIn, clockOut, markAbsent, breakIn, breakOut, getAttendanceByDate } from "@/lib/actions/attendance"
```

- [ ] **Step 3: Add break derived values inside AttendanceClient component**

After line 80 (where `geoLoading` state is defined), add:

```typescript
const isOnBreak  = !!todayLog?.break_in && !todayLog?.break_out
const breakDone  = !!todayLog?.break_in && !!todayLog?.break_out
const breakMins  = (todayLog?.break_in && todayLog?.break_out)
  ? Math.round((new Date(todayLog.break_out).getTime() - new Date(todayLog.break_in).getTime()) / 60000)
  : 0
```

- [ ] **Step 4: Add break buttons after the clock-out button in the render**

Find the section that renders the clock-out button (search for `clockOut` in JSX). Right after the clock-out button block, add:

```tsx
{/* Break buttons — only when clocked in and not yet clocked out */}
{todayLog?.clock_in && !todayLog?.clock_out && (
  <div style={{ display:"flex", gap:8, marginTop:8 }}>
    {!isOnBreak && !breakDone && (
      <button
        onClick={() => handle(breakIn)}
        disabled={isPending}
        style={{ flex:1, padding:"10px 0", borderRadius:12, border:"1.5px solid #F59E0B",
          background:"rgba(245,158,11,0.08)", color:"#D97706", fontSize:12, fontWeight:700, cursor:"pointer" }}>
        ☕ Break In
      </button>
    )}
    {isOnBreak && (
      <button
        onClick={() => handle(breakOut)}
        disabled={isPending}
        style={{ flex:1, padding:"10px 0", borderRadius:12, border:"1.5px solid #22C55E",
          background:"rgba(34,197,94,0.08)", color:"#16A34A", fontSize:12, fontWeight:700, cursor:"pointer" }}>
        ▶ Break Out
      </button>
    )}
    {breakDone && (
      <div style={{ flex:1, padding:"10px 0", borderRadius:12, border:"1.5px solid #E5E7EB",
        background:"#F9FAFB", color:"#6B7280", fontSize:12, fontWeight:600, textAlign:"center" }}>
        Break: {breakMins}m taken
      </div>
    )}
  </div>
)}
```

- [ ] **Step 5: Update the page.tsx server query to include break_in/break_out**

In `app/member/attendance/page.tsx`, find the attendance_logs select query and add `break_in, break_out` to the selected columns. Look for:
```typescript
.select("id, date, clock_in, clock_out, work_type, status")
```
Change to:
```typescript
.select("id, date, clock_in, clock_out, break_in, break_out, work_type, status")
```

- [ ] **Step 6: Commit**

```bash
git add app/member/attendance/attendance-client.tsx app/member/attendance/page.tsx
git commit -m "feat: break in/out UI with amber/green buttons and break duration display"
```

---

## Task 5: Edit Form — Video Types, Duration Dropdown, Drive Link Mandatory

**Files:**
- Modify: `app/member/update/daily-update-form.tsx`

Three changes in one file.

- [ ] **Step 1: Update DurationPicker steps (line 102)**

Find:
```typescript
const steps = [0.5,1,1.5,2,2.5,3,3.5,4,4.5,5,5.5,6,6.5,7,7.5,8,9,10,11,12]
```
Replace with:
```typescript
const steps = [1,1.5,2,2.5,3,3.5,4,4.5,5,6,7,8]
```

- [ ] **Step 2: Update video type options (line 876)**

Find:
```typescript
{["Reel","Short Film","Long Form / YouTube","Teaser","Promotional","Interview","Tutorial","Documentary","Social Media","Other"].map(t => (
  <option key={t} value={t}>{t}</option>
))}
```
Replace with:
```typescript
{["Instagram Reels","Personal Branding","Ads and Hooks","Long Videos","Cinematic","YouTube Shorts"].map(t => (
  <option key={t} value={t}>{t}</option>
))}
```

- [ ] **Step 3: Change videoDuration from text input to select dropdown (lines 884–886)**

Find:
```typescript
<div>
  <label style={{ display:"block", fontSize:10, fontWeight:700, color:"#374151", textTransform:"uppercase", letterSpacing:"0.1em", marginBottom:5 }}>Duration</label>
  <input value={e.videoDuration} onChange={ev => patchEdit(e.id, { videoDuration: ev.target.value })} placeholder="e.g. 30 sec, 2:30 min" style={F} />
</div>
```
Replace with:
```typescript
<div>
  <label style={{ display:"block", fontSize:10, fontWeight:700, color:"#374151", textTransform:"uppercase", letterSpacing:"0.1em", marginBottom:5 }}>Duration (mins)</label>
  <div style={{ position:"relative" }}>
    <select value={e.videoDuration} onChange={ev => patchEdit(e.id, { videoDuration: ev.target.value })} style={{ ...F, paddingRight:28, appearance:"none" }}>
      <option value="">Select…</option>
      {[1,1.5,2,2.5,3,3.5,4,4.5,5,6,7,8].map(m => (
        <option key={m} value={`${m} min`}>{m} min</option>
      ))}
    </select>
    <ChevronDown size={11} style={{ position:"absolute", right:10, top:"50%", transform:"translateY(-50%)", color:"#9CA3AF", pointerEvents:"none" }} />
  </div>
</div>
```

- [ ] **Step 4: Make Drive Link label show "required" and block save if empty**

Find the Drive / Video Link label (line ~921):
```typescript
<label style={{ display:"block", fontSize:10, fontWeight:700, color:"#374151", textTransform:"uppercase", letterSpacing:"0.1em", marginBottom:5 }}>
  <Link2 size={9} style={{ display:"inline", marginRight:4 }} />Drive / Video Link
</label>
```
Replace with:
```typescript
<label style={{ display:"block", fontSize:10, fontWeight:700, color:"#374151", textTransform:"uppercase", letterSpacing:"0.1em", marginBottom:5 }}>
  <Link2 size={9} style={{ display:"inline", marginRight:4 }} />Drive / Video Link <span style={{ color:"#de1a1a" }}>*</span>
</label>
```

- [ ] **Step 5: Block save in handleSaveEntry if drive link is empty**

Find the `handleSaveEntry` function. It will be somewhere in the component. Look for the per-edit save handler. Add validation before the save call:

```typescript
// Inside handleSaveEntry(editId: string) — add before the submitDailyUpdate call:
const entry = edits.find(e => e.id === editId)
if (entry && !entry.videoLink.trim()) {
  setError("Drive link is required — paste the Google Drive link for this video.")
  return
}
```

If `handleSaveEntry` doesn't exist as a named function, find where the "Save Edit" button calls the save logic, and add the same guard there.

- [ ] **Step 6: Commit**

```bash
git add app/member/update/daily-update-form.tsx
git commit -m "feat: edit form — new video types, duration dropdown, drive link mandatory"
```

---

## Task 6: Shoot Form — Travel Time Field

**Files:**
- Modify: `lib/actions/shoots.ts`
- Modify: `app/member/shoots/shoots-client.tsx`

- [ ] **Step 1: Add travel_time_hours to ShootInput in shoots.ts**

Find:
```typescript
type ShootInput = {
  title: string
  client: string
  location: string
  start_time: string
  end_time: string
  team_assigned: string
  equipment_used: string
  travel_expense: number
}
```
Replace with:
```typescript
type ShootInput = {
  title: string
  client: string
  location: string
  start_time: string
  end_time: string
  team_assigned: string
  equipment_used: string
  travel_expense: number
  travel_time_hours: number
}
```

- [ ] **Step 2: Add travel_time_hours to insert in createShoot**

Find in the insert call:
```typescript
travel_expense: input.travel_expense || 0,
```
Replace with:
```typescript
travel_expense:     input.travel_expense || 0,
travel_time_hours:  input.travel_time_hours || 0,
```

- [ ] **Step 3: Add travel_time_hours to form state in shoots-client.tsx**

Find the form state initialization. Search for where `travel_expense` is initialized (likely in a `useState` for the form). The form state object should look like:
```typescript
const [form, setForm] = useState({
  title: "", client: "", location: "", start_time: "", end_time: "",
  team_assigned: "", equipment_used: "", travel_expense: 0,
})
```
Add `travel_time_hours: 0` to the initial state object.

- [ ] **Step 4: Add travel time input field in the shoot modal (after travel expense, around line 239)**

After the travel expense `<div>` block, add:
```tsx
<div>
  <label className="block text-[10px] font-bold uppercase tracking-[0.15em] mb-1.5" style={{ color: '#6B7280' }}>Travel Time (hours)</label>
  <select
    style={FIELD}
    value={form.travel_time_hours}
    onChange={e => setForm(f => ({ ...f, travel_time_hours: parseFloat(e.target.value) || 0 }))}
  >
    <option value={0}>None</option>
    {[0.5,1,1.5,2,2.5,3,4].map(h => (
      <option key={h} value={h}>{h}h</option>
    ))}
  </select>
  <p className="text-[10px] mt-1" style={{ color: '#9CA3AF' }}>Internal only — not billed to client</p>
</div>
```

- [ ] **Step 5: Pass travel_time_hours in handleSubmit**

Find `handleSubmit` in shoots-client.tsx. The `createShoot(form)` call passes the entire form. Since you added `travel_time_hours` to the form state and to `ShootInput`, this should automatically flow through.

Verify the call looks like: `await createShoot(form)` and not a destructured subset. If it's destructured, add `travel_time_hours: form.travel_time_hours`.

- [ ] **Step 6: Commit**

```bash
git add lib/actions/shoots.ts app/member/shoots/shoots-client.tsx
git commit -m "feat: shoot form — travel time hours field (internal, not billed)"
```

---

## Task 7: Task Auto-Delete (Completed Tasks Older Than 7 Days)

**Files:**
- Modify: `lib/actions/tasks.ts`
- Create: `app/api/cron/cleanup-tasks/route.ts`
- Modify: `vercel.json`

- [ ] **Step 1: Set completed_at when status changes to 'completed' in updateTaskStatus**

In `lib/actions/tasks.ts`, find `updateTaskStatus`:

```typescript
export async function updateTaskStatus(
  taskId: string,
  status: 'todo' | 'in_progress' | 'completed'
```

Change the update call from:
```typescript
const { error } = await admin.from('tasks').update({ status }).eq('id', taskId)
```
To:
```typescript
const updates: Record<string, unknown> = { status }
if (status === 'completed') updates.completed_at = new Date().toISOString()
if (status !== 'completed') updates.completed_at = null
const { error } = await admin.from('tasks').update(updates).eq('id', taskId)
```

- [ ] **Step 2: Create the cron route handler**

Create `app/api/cron/cleanup-tasks/route.ts`:

```typescript
import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

export const runtime = 'nodejs'

function adminSupabase() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  )
}

export async function GET(req: Request) {
  const authHeader = req.headers.get('authorization')
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const cutoff = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString()

  const admin = adminSupabase()
  const { error, count } = await admin
    .from('tasks')
    .delete({ count: 'exact' })
    .eq('status', 'completed')
    .lt('completed_at', cutoff)

  if (error) {
    console.error('[cleanup-tasks] delete failed:', error.message)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  console.log(`[cleanup-tasks] deleted ${count} tasks completed before ${cutoff}`)
  return NextResponse.json({ deleted: count, cutoff })
}
```

- [ ] **Step 3: Add CRON_SECRET to .env.local**

```bash
# Add to .env.local:
CRON_SECRET=your-random-secret-here
```

Generate a secret: `node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"`

Also add `CRON_SECRET` to Vercel environment variables (Settings → Environment Variables).

- [ ] **Step 4: Add cron job to vercel.json**

Find vercel.json (currently has 4 cron entries). Add a 5th:

```json
{
  "crons": [
    { "path": "/api/send-daily-reminder", "schedule": "0 4 * * *" },
    { "path": "/api/send-missed-alert",   "schedule": "30 15 * * *" },
    { "path": "/api/cron/birthdays",      "schedule": "30 3 * * *" },
    { "path": "/api/cron/auto-logout",    "schedule": "30 16 * * *" },
    { "path": "/api/cron/cleanup-tasks",  "schedule": "0 2 * * *" }
  ]
}
```

- [ ] **Step 5: Commit**

```bash
git add lib/actions/tasks.ts app/api/cron/cleanup-tasks/route.ts vercel.json
git commit -m "feat: auto-delete completed tasks after 7 days via Vercel cron"
```

---

## Task 8: Member Task Assignment — Server Action

**Files:**
- Modify: `lib/actions/tasks.ts`

Members need to create tasks and assign them to other members. The existing `createTask` is admin-only (called from admin pages). Add a separate `createMemberTask` that any authenticated member can call.

- [ ] **Step 1: Add createMemberTask export to tasks.ts**

Add after the existing `createTask` function:

```typescript
export async function createMemberTask(
  _prev: { error: string } | { success: true } | null,
  formData: FormData
): Promise<{ error: string } | { success: true }> {
  const raw = {
    title:       formData.get('title') as string,
    description: (formData.get('description') as string) || undefined,
    priority:    (formData.get('priority') as string) || 'medium',
    due_date:    (formData.get('due_date') as string) || null,
    assigned_to: (formData.get('assigned_to') as string) || null,
  }

  const parsed = z.object({
    title:       z.string().min(1, 'Title required'),
    description: z.string().optional(),
    priority:    z.enum(['low','medium','high']).default('medium'),
    due_date:    z.string().optional().nullable(),
    assigned_to: z.string().uuid().optional().nullable(),
  }).safeParse(raw)

  if (!parsed.success) return { error: parsed.error.issues[0].message }

  const supabase = await createServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'Not authenticated' }

  const admin = adminSupabase()
  const { data: profile } = await admin.from('users').select('company_id').eq('id', user.id).single()
  if (!profile?.company_id) return { error: 'Profile not found' }

  const { error } = await admin.from('tasks').insert({
    company_id:  profile.company_id,
    title:       parsed.data.title,
    description: parsed.data.description || null,
    priority:    parsed.data.priority,
    due_date:    parsed.data.due_date || null,
    status:      'todo',
    created_by:  user.id,
    assigned_to: parsed.data.assigned_to || user.id,
  })

  if (error) return { error: error.message }

  revalidatePath('/member/tasks')
  return { success: true }
}
```

- [ ] **Step 2: Commit**

```bash
git add lib/actions/tasks.ts
git commit -m "feat: createMemberTask server action — members can assign tasks"
```

---

## Task 9: Member Task Assignment — UI

**Files:**
- Modify: `app/member/tasks/page.tsx`
- Modify: `app/member/tasks/tasks-client.tsx`

- [ ] **Step 1: Fetch team members in page.tsx**

In `app/member/tasks/page.tsx`, inside `MemberTasksPage`, add a team members query to the existing `Promise.all`. First get the current user's `company_id`:

```typescript
// Add after the existing const admin = adminSupabase()
const { data: currentUserProfile } = await admin
  .from('users')
  .select('company_id')
  .eq('id', user.id)
  .single()

const companyId = currentUserProfile?.company_id
```

Then add to the Promise.all array:
```typescript
// 4th item in Promise.all:
companyId
  ? admin
      .from('users')
      .select('id, name, employee_id')
      .eq('company_id', companyId)
      .eq('status', 'active')
      .order('name')
  : Promise.resolve({ data: [] }),
```

Destructure as `teamMembersResult` and pass to client:
```typescript
const [tasksResult, clockResult, updateResult, teamMembersResult] = await Promise.all([...])
const teamMembers = (teamMembersResult.data ?? []) as { id: string; name: string; employee_id: string }[]

return (
  <MemberTasksClient
    tasks={tasks}
    todayHours={todayHours}
    teamMembers={teamMembers}
    currentUserId={user.id}
  />
)
```

- [ ] **Step 2: Add AssignTaskModal and props to tasks-client.tsx**

At the top of `app/member/tasks/tasks-client.tsx`, add these imports:
```typescript
import { useActionState } from "react"
import { Plus, X, User } from "lucide-react"
import { createMemberTask } from "@/lib/actions/tasks"
```

Update the component Props interface (find the existing one and add):
```typescript
interface Props {
  tasks: Task[]
  todayHours: number
  teamMembers: { id: string; name: string; employee_id: string }[]
  currentUserId: string
}
```

Update the function signature:
```typescript
export default function MemberTasksClient({ tasks, todayHours, teamMembers, currentUserId }: Props) {
```

- [ ] **Step 3: Add modal state and form inside MemberTasksClient**

After the existing `useState` calls, add:
```typescript
const [showAssign, setShowAssign] = useState(false)
const [assignState, assignAction] = useActionState(createMemberTask, null)
```

Add an effect to close modal on success:
```typescript
useEffect(() => {
  if (assignState && 'success' in assignState) {
    setShowAssign(false)
  }
}, [assignState])
```

- [ ] **Step 4: Add the "Assign Task" button in the header**

Find the existing header/controls area (near the search input). Add a button:
```tsx
<button
  onClick={() => setShowAssign(true)}
  className="flex items-center gap-2 px-4 py-2 rounded-xl text-[13px] font-bold text-white"
  style={{ background: 'linear-gradient(135deg, #de1a1a, #7F1D1D)' }}>
  <Plus size={14} /> Assign Task
</button>
```

- [ ] **Step 5: Add the modal JSX at bottom of return**

Before the closing `</div>` of the main return, add:
```tsx
{showAssign && (
  <>
    <div className="fixed inset-0 z-40" style={{ background: 'rgba(0,0,0,0.6)', backdropFilter: 'blur(4px)' }}
      onClick={() => setShowAssign(false)} />
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="w-full max-w-[420px] rounded-2xl shadow-2xl overflow-hidden"
        style={{ background: '#FFFFFF', border: '1px solid rgba(222,26,26,0.15)' }}>
        <div className="px-6 py-4 flex items-center justify-between"
          style={{ borderBottom: '1px solid #E5E7EB' }}>
          <h2 className="text-[16px] font-bold" style={{ color: '#111111' }}>Assign a Task</h2>
          <button onClick={() => setShowAssign(false)} className="w-8 h-8 rounded-full flex items-center justify-center"
            style={{ border: '1px solid #E5E7EB' }}>
            <X size={14} />
          </button>
        </div>
        <form action={assignAction} className="px-6 py-5 space-y-4">
          <div>
            <label className="block text-[10px] font-bold uppercase tracking-wider mb-1.5" style={{ color: '#6B7280' }}>Title *</label>
            <input name="title" required placeholder="What needs to be done?" className="w-full px-3 py-2 rounded-xl text-[13px]"
              style={{ border: '1.5px solid #EBEDF2', outline: 'none' }} />
          </div>
          <div>
            <label className="block text-[10px] font-bold uppercase tracking-wider mb-1.5" style={{ color: '#6B7280' }}>Description</label>
            <textarea name="description" rows={2} placeholder="Details…" className="w-full px-3 py-2 rounded-xl text-[13px] resize-none"
              style={{ border: '1.5px solid #EBEDF2', outline: 'none' }} />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-[10px] font-bold uppercase tracking-wider mb-1.5" style={{ color: '#6B7280' }}>Priority</label>
              <select name="priority" className="w-full px-3 py-2 rounded-xl text-[13px]"
                style={{ border: '1.5px solid #EBEDF2', outline: 'none' }}>
                <option value="medium">Medium</option>
                <option value="high">High</option>
                <option value="low">Low</option>
              </select>
            </div>
            <div>
              <label className="block text-[10px] font-bold uppercase tracking-wider mb-1.5" style={{ color: '#6B7280' }}>Due Date</label>
              <input type="date" name="due_date" className="w-full px-3 py-2 rounded-xl text-[13px]"
                style={{ border: '1.5px solid #EBEDF2', outline: 'none', colorScheme: 'light' }} />
            </div>
          </div>
          <div>
            <label className="block text-[10px] font-bold uppercase tracking-wider mb-1.5" style={{ color: '#6B7280' }}>
              <User size={9} className="inline mr-1" />Assign To
            </label>
            <select name="assigned_to" className="w-full px-3 py-2 rounded-xl text-[13px]"
              style={{ border: '1.5px solid #EBEDF2', outline: 'none' }}>
              <option value={currentUserId}>Myself</option>
              {teamMembers.filter(m => m.id !== currentUserId).map(m => (
                <option key={m.id} value={m.id}>{m.name} ({m.employee_id})</option>
              ))}
            </select>
          </div>
          {assignState && 'error' in assignState && (
            <p className="text-[12px] px-3 py-2 rounded-lg" style={{ background: 'rgba(222,26,26,0.06)', color: '#de1a1a' }}>
              {assignState.error}
            </p>
          )}
          <div className="flex gap-3 pt-2">
            <button type="button" onClick={() => setShowAssign(false)}
              className="flex-1 py-2.5 rounded-xl text-[13px] font-semibold"
              style={{ background: '#F9FAFB', border: '1px solid #E5E7EB', color: '#6B7280' }}>
              Cancel
            </button>
            <button type="submit"
              className="flex-1 py-2.5 rounded-xl text-[13px] font-bold text-white"
              style={{ background: 'linear-gradient(135deg, #de1a1a, #7F1D1D)' }}>
              Assign
            </button>
          </div>
        </form>
      </div>
    </div>
  </>
)}
```

- [ ] **Step 6: Commit**

```bash
git add app/member/tasks/page.tsx app/member/tasks/tasks-client.tsx
git commit -m "feat: members can assign tasks to teammates via modal"
```

---

## Task 10: Expenses — Multi-Client Time Blocks for Tech & Ops

**Files:**
- Modify: `app/member/update/daily-update-form.tsx`

Non-media members (tech & ops) log time blocks. Add a "Multiple Clients" option so they can split cost equally.

- [ ] **Step 1: Update TimeBlock interface (around line 45)**

Find:
```typescript
interface TimeBlock {
  id: string
  startTime: string
  endTime: string
  durationHours: number
  description: string
  projectName: string
  status: "completed" | "in_progress" | "not_started"
}
```
Replace with:
```typescript
interface TimeBlock {
  id: string
  startTime: string
  endTime: string
  durationHours: number
  description: string
  projectName: string
  status: "completed" | "in_progress" | "not_started"
  isMultiClient: boolean
  clientNames: string[]
}
```

- [ ] **Step 2: Update addTimeBlock default to include new fields (around line 181)**

Find:
```typescript
const addTimeBlock = () => setTimeBlocks(p => [...p, {
  id: crypto.randomUUID(), startTime: "09:00", endTime: "10:00",
  durationHours: 1, description: "", projectName: "", status: "not_started" as const,
}])
```
Replace with:
```typescript
const addTimeBlock = () => setTimeBlocks(p => [...p, {
  id: crypto.randomUUID(), startTime: "09:00", endTime: "10:00",
  durationHours: 1, description: "", projectName: "", status: "not_started" as const,
  isMultiClient: false, clientNames: [],
}])
```

- [ ] **Step 3: Add multi-client UI inside each time block render**

In the time block render section (search for `projectName` in the non-media JSX), after the existing "Project" input field, add:

```tsx
{/* Multi-client toggle */}
<div>
  <label className="flex items-center gap-2 cursor-pointer">
    <input
      type="checkbox"
      checked={block.isMultiClient}
      onChange={e => patchBlock(block.id, {
        isMultiClient: e.target.checked,
        clientNames: e.target.checked ? block.clientNames : [],
      })}
      style={{ accentColor: '#de1a1a' }}
    />
    <span style={{ fontSize:11, fontWeight:600, color:'#374151' }}>Split cost across multiple clients</span>
  </label>
  {block.isMultiClient && (
    <div style={{ marginTop:8 }}>
      <label style={{ display:'block', fontSize:10, fontWeight:700, color:'#9CA3AF', textTransform:'uppercase', letterSpacing:'0.1em', marginBottom:5 }}>
        Select Clients (cost split equally)
      </label>
      <div style={{ display:'flex', flexWrap:'wrap', gap:6 }}>
        {projects.map(p => {
          const selected = block.clientNames.includes(p.business_name)
          return (
            <button
              key={p.id}
              type="button"
              onClick={() => {
                const next = selected
                  ? block.clientNames.filter(n => n !== p.business_name)
                  : [...block.clientNames, p.business_name]
                patchBlock(block.id, { clientNames: next })
              }}
              style={{
                padding:'4px 10px', borderRadius:20, fontSize:11, fontWeight:600, cursor:'pointer',
                border: `1.5px solid ${selected ? '#de1a1a' : '#EBEDF2'}`,
                background: selected ? 'rgba(222,26,26,0.08)' : '#F9FAFB',
                color: selected ? '#de1a1a' : '#6B7280',
              }}>
              {p.business_name}
            </button>
          )
        })}
      </div>
      {block.clientNames.length > 1 && (
        <p style={{ fontSize:10, color:'#9CA3AF', marginTop:5 }}>
          {block.durationHours}h ÷ {block.clientNames.length} clients = {(block.durationHours / block.clientNames.length).toFixed(2)}h each
        </p>
      )}
    </div>
  )}
</div>
```

- [ ] **Step 4: Serialize multi-client data in handleSubmit**

In the `handleSubmit` function, find where `timeBlocks` are mapped to `work_entries`. The entry for each block should include the new fields:

```typescript
// In the timeBlocks.map(...) section of handleSubmit:
{
  ...existingFields,
  client_names: block.isMultiClient ? block.clientNames : (block.projectName ? [block.projectName] : []),
  is_multi_client: block.isMultiClient,
}
```

- [ ] **Step 5: Commit**

```bash
git add app/member/update/daily-update-form.tsx
git commit -m "feat: tech & ops can log multi-client tasks with equal cost split"
```

---

## Task 11: Expenses — Per-Client Cost Breakdown (Admin)

**Files:**
- Modify: `app/admin/expenses/page.tsx`
- Modify: `app/admin/expenses/expenses-client.tsx`

The formula: `per_hour = monthly_salary / 25 / 9`

- [ ] **Step 1: Add monthly_salary to user select in expenses/page.tsx**

Find:
```typescript
admin
  .from("users")
  .select("id, name, employee_id, hourly_rate")
  .eq("company_id", cid),
```
Replace with:
```typescript
admin
  .from("users")
  .select("id, name, employee_id, hourly_rate, monthly_salary")
  .eq("company_id", cid),
```

Also add `monthly_salary` to the `ExpensesClient` props call.

- [ ] **Step 2: Update MemberUser type in expenses-client.tsx**

Find:
```typescript
type MemberUser = {
  id: string
  name: string
  employee_id: string
  hourly_rate: number | null
}
```
Replace with:
```typescript
type MemberUser = {
  id: string
  name: string
  employee_id: string
  hourly_rate: number | null
  monthly_salary: number | null
}
```

- [ ] **Step 3: Add perHour helper function**

Near the top of expenses-client.tsx (after the types), add:

```typescript
function derivePerHour(u: MemberUser): number {
  if (u.monthly_salary && u.monthly_salary > 0) {
    return u.monthly_salary / 25 / 9
  }
  return u.hourly_rate ?? 0
}
```

- [ ] **Step 4: Add "Per Client" tab to the existing tabs**

Find where the existing expense tabs are rendered (look for `useState` with tab names). Add `"per_client"` as a tab option. The tab button:

```tsx
<button
  onClick={() => setActiveTab("per_client")}
  className={`px-4 py-2 rounded-xl text-[13px] font-bold transition-all ${activeTab === "per_client" ? "text-white" : ""}`}
  style={{ background: activeTab === "per_client" ? "linear-gradient(135deg,#de1a1a,#7F1D1D)" : "transparent", color: activeTab === "per_client" ? "#fff" : "#6B7280" }}>
  Per Client
</button>
```

- [ ] **Step 5: Add per-client cost calculation and render**

Before the return statement, add this computation:

```typescript
const perClientCosts = useMemo(() => {
  const userMap = new Map(users.map(u => [u.id, u]))
  // client → employee_id → { name, hours, cost }
  const map: Record<string, Record<string, { name: string; hours: number; cost: number }>> = {}

  for (const row of updates) {
    const user = userMap.get(row.user_id)
    if (!user) continue
    const perHour = derivePerHour(user)

    for (const entry of (row.work_entries ?? [])) {
      // Edit entries
      if (entry.task_type === "edit") {
        const hours = (entry.duration_hours ?? 0)
        const client = entry.client_name || "Unknown"
        if (!map[client]) map[client] = {}
        if (!map[client][user.id]) map[client][user.id] = { name: user.name, hours: 0, cost: 0 }
        map[client][user.id].hours += hours
        map[client][user.id].cost  += hours * perHour
      }
      // Shoot entries
      if (entry.task_type === "shoot") {
        const hours = (entry.duration_hours ?? 0)
        const client = entry.client_name || "Unknown"
        if (!map[client]) map[client] = {}
        if (!map[client][user.id]) map[client][user.id] = { name: user.name, hours: 0, cost: 0 }
        map[client][user.id].hours += hours
        map[client][user.id].cost  += hours * perHour
      }
      // Multi-client "other" entries
      if (entry.task_type === "other" && entry.client_names && entry.client_names.length > 0) {
        const splitHours = (entry.duration_hours ?? 0) / entry.client_names.length
        for (const client of entry.client_names) {
          if (!map[client]) map[client] = {}
          if (!map[client][user.id]) map[client][user.id] = { name: user.name, hours: 0, cost: 0 }
          map[client][user.id].hours += splitHours
          map[client][user.id].cost  += splitHours * perHour
        }
      }
    }
  }
  return map
}, [updates, users])
```

- [ ] **Step 6: Render the Per Client tab**

In the tab content area, add the `per_client` case:

```tsx
{activeTab === "per_client" && (
  <div className="space-y-4">
    {Object.entries(perClientCosts)
      .sort((a, b) => {
        const totalA = Object.values(a[1]).reduce((s, v) => s + v.cost, 0)
        const totalB = Object.values(b[1]).reduce((s, v) => s + v.cost, 0)
        return totalB - totalA
      })
      .map(([client, employees]) => {
        const total = Object.values(employees).reduce((s, v) => s + v.cost, 0)
        return (
          <div key={client} className="rounded-2xl p-5"
            style={{ background: '#FFFFFF', border: '1px solid #EBEDF2', boxShadow: '0 2px 8px rgba(0,0,0,0.04)' }}>
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-[15px] font-bold" style={{ color: '#111111' }}>{client}</h3>
              <span className="text-[15px] font-black" style={{ color: '#de1a1a' }}>
                ₹{total.toLocaleString('en-IN', { maximumFractionDigits: 0 })}
              </span>
            </div>
            <div className="space-y-2">
              {Object.values(employees).map(emp => (
                <div key={emp.name} className="flex items-center justify-between text-[13px]">
                  <span style={{ color: '#374151' }}>{emp.name}</span>
                  <span style={{ color: '#6B7280' }}>
                    {emp.hours.toFixed(1)}h × ₹{(emp.cost / emp.hours).toFixed(0)}/h = ₹{emp.cost.toLocaleString('en-IN', { maximumFractionDigits: 0 })}
                  </span>
                </div>
              ))}
            </div>
          </div>
        )
      })
    }
    {Object.keys(perClientCosts).length === 0 && (
      <p className="text-center py-8 text-[13px]" style={{ color: '#9CA3AF' }}>No client work data for the selected period</p>
    )}
  </div>
)}
```

- [ ] **Step 7: Update ExpensesClient component signature to accept monthly_salary**

Find the `ExpensesClient` props destructuring and add `monthly_salary` handling. If `ExpensesClient` receives `users` as a prop, make sure the type matches the updated `MemberUser` (with `monthly_salary`).

In `expenses/page.tsx`, pass `users={usersRaw ?? []}` — this already works since we updated the select to include `monthly_salary`.

- [ ] **Step 8: Commit**

```bash
git add app/admin/expenses/page.tsx app/admin/expenses/expenses-client.tsx
git commit -m "feat: per-client cost tab in expenses — deriving hourly rate from monthly salary"
```

---

## Self-Review Checklist

**Spec coverage:**
- [x] Location fix — Task 2 (better geolocation error messages + fallback)
- [x] Break in/out with auto-deduct — Tasks 3 & 4 (break_in/break_out columns, UI buttons; break deducted from hours via column diff in payroll calculation)
- [x] Auto-delete completed tasks after 7 days — Task 7 (completed_at + Vercel cron)
- [x] Video type options updated — Task 5 Step 2
- [x] Duration dropdown (30-min intervals 1–8h) — Task 5 Steps 1 & 3
- [x] Drive link mandatory — Task 5 Steps 4 & 5
- [x] Shoot travel time — Task 6
- [x] Member task assignment — Tasks 8 & 9
- [x] Expenses per-client calculation (salary/25/9) — Tasks 10 & 11
- [x] Tech & ops multi-client equal split — Tasks 10 & 11
- [x] Grofast Digital as client — Note: add it as a project row in Supabase manually OR via a seed migration. The expenses code handles it automatically once it exists in the projects table.

**Note on break auto-deduction:** The `breakMins` computed in the UI shows the break duration. For it to be deducted from total working hours shown in attendance, update the `calcHours` helper:

```typescript
function calcHoursNet(inIso: string, outIso: string | null, breakIn: string | null, breakOut: string | null): number {
  const raw = ((outIso ? new Date(outIso).getTime() : Date.now()) - new Date(inIso).getTime()) / 3600000
  const breakMins = (breakIn && breakOut)
    ? (new Date(breakOut).getTime() - new Date(breakIn).getTime()) / 3600000
    : 0
  return Math.max(0, raw - breakMins)
}
```

Use `calcHoursNet` instead of `calcHours` wherever today's worked hours are derived in attendance-client.tsx.
