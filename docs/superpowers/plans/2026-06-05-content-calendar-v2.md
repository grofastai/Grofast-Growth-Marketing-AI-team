# Content Calendar V2 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add scheduled_time to content posts, WhatsApp reminders 30 min before post time, auto-mark missed posts nightly + alert admin, and per-client content counts in Admin Expenses.

**Architecture:** A DB migration adds `scheduled_time` and relaxes the status CHECK constraint. Two new Vercel cron routes handle reminders and missed detection. The Admin Expenses page gains a new content-count section fetched server-side and aggregated client-side.

**Tech Stack:** Next.js 15 App Router, Supabase (PostgreSQL + service role), Vercel Cron, WhatsApp via Meta Graph API (`sendWhatsAppTemplate`), TypeScript strict mode.

---

## File Map

| File | Action | Purpose |
|------|--------|---------|
| `supabase/migrations/058_content_scheduled_time.sql` | Create | Add `scheduled_time` column; drop + recreate status CHECK to include `missed` |
| `lib/actions/content-calendar.ts` | Modify | Add `scheduled_time` to `ContentPostInput` and insert payload |
| `app/admin/content-calendar/content-calendar-client.tsx` | Modify | Add time picker to form; add `missed` to `STATUS_CFG` |
| `app/api/cron/content-reminder/route.ts` | Create | 30-min cron — WhatsApp reminder to assigned employee |
| `app/api/cron/content-missed/route.ts` | Create | Nightly cron — auto-mark missed + WhatsApp to admin |
| `vercel.json` | Modify | Add two new cron schedules |
| `app/admin/expenses/page.tsx` | Modify | Fetch posted content_posts for current year; pass to client |
| `app/admin/expenses/expenses-client.tsx` | Modify | Add `ContentPostRow` type, `contentPosts` prop, content count section with month filter |

---

## Task 1: DB Migration — scheduled_time + missed status

**Files:**
- Create: `supabase/migrations/058_content_scheduled_time.sql`

- [ ] **Step 1: Create the migration file**

```sql
-- 058_content_scheduled_time.sql

-- Add optional posting time to content_posts
ALTER TABLE content_posts
  ADD COLUMN IF NOT EXISTS scheduled_time time NULL;

-- Drop the existing status CHECK constraint and recreate with 'missed' included
ALTER TABLE content_posts
  DROP CONSTRAINT IF EXISTS content_posts_status_check;

ALTER TABLE content_posts
  ADD CONSTRAINT content_posts_status_check
  CHECK (status IN ('pending', 'in_progress', 'ready', 'posted', 'cancelled', 'missed'));
```

- [ ] **Step 2: Apply the migration in Supabase dashboard**

Go to Supabase → SQL Editor → paste the migration → Run.
Verify with:
```sql
SELECT column_name, data_type FROM information_schema.columns
WHERE table_name = 'content_posts' AND column_name = 'scheduled_time';
```
Expected: one row, `data_type = time without time zone`.

- [ ] **Step 3: Commit**

```bash
git add supabase/migrations/058_content_scheduled_time.sql
git commit -m "feat: add scheduled_time to content_posts and expand status to include missed"
```

---

## Task 2: Server Action — pass scheduled_time through

**Files:**
- Modify: `lib/actions/content-calendar.ts`

- [ ] **Step 1: Add `scheduled_time` to `ContentPostInput`**

In `lib/actions/content-calendar.ts`, update the interface:

```typescript
export interface ContentPostInput {
  title: string
  platform: string
  content_type: string
  client_id?: string | null
  client_name: string
  scheduled_date: string
  scheduled_time?: string | null   // ← add this line
  assigned_to?: string | null
  drive_link?: string
  caption?: string
  notes?: string
}
```

- [ ] **Step 2: Pass `scheduled_time` into the insert payload**

In `createContentPost`, inside the `.insert({...})` call, add:

```typescript
scheduled_time: input.scheduled_time || null,
```

The full insert block becomes:

```typescript
const { data: post, error } = await admin.from('content_posts').insert({
  company_id:     profile.company_id,
  user_id:        user.id,
  created_by:     user.id,
  title:          input.title,
  platform:       input.platform,
  content_type:   input.content_type,
  client_id:      input.client_id || null,
  client_name:    input.client_name,
  date:           input.scheduled_date,
  scheduled_date: input.scheduled_date,
  post_type:      input.content_type,
  assigned_to:    input.assigned_to || null,
  drive_link:     input.drive_link || null,
  caption:        input.caption || null,
  notes:          input.notes || null,
  scheduled_time: input.scheduled_time || null,
}).select('id').single()
```

- [ ] **Step 3: Commit**

```bash
git add lib/actions/content-calendar.ts
git commit -m "feat: pass scheduled_time through createContentPost action"
```

---

## Task 3: Content Calendar UI — time picker + missed status

**Files:**
- Modify: `app/admin/content-calendar/content-calendar-client.tsx`

- [ ] **Step 1: Add `missed` to `STATUS_CFG`**

Find the `STATUS_CFG` constant and add the missing entry:

```typescript
const STATUS_CFG: Record<string, { label: string; color: string; bg: string }> = {
  pending:     { label: "Pending",     color: "#F59E0B", bg: "rgba(245,158,11,0.1)"  },
  in_progress: { label: "In Progress", color: "#3B82F6", bg: "rgba(59,130,246,0.1)"  },
  ready:       { label: "Ready",       color: "#8B5CF6", bg: "rgba(139,92,246,0.1)"  },
  posted:      { label: "Posted ✓",    color: "#10B981", bg: "rgba(16,185,129,0.1)"  },
  cancelled:   { label: "Cancelled",   color: "#EF4444", bg: "rgba(239,68,68,0.1)"   },
  missed:      { label: "Missed",      color: "#EF4444", bg: "rgba(239,68,68,0.08)"  },
}
```

- [ ] **Step 2: Add `schedTime` state for the form**

Inside the component, alongside the other form `useState` declarations, add:

```typescript
const [schedTime, setSchedTime] = useState("")
```

- [ ] **Step 3: Add the time picker input in the form**

Find the `scheduled_date` input field in the "Add Post" modal. Directly below it, add:

```tsx
<div>
  <label style={LABEL}>Post Time <span style={{ fontWeight: 400, color: "#9CA3AF" }}>(optional)</span></label>
  <input
    type="time"
    value={schedTime}
    onChange={e => setSchedTime(e.target.value)}
    style={FIELD}
  />
</div>
```

- [ ] **Step 4: Include `scheduled_time` in the form submit call**

Find the `createContentPost({...})` call inside the form submit handler. Add `scheduled_time`:

```typescript
const res = await createContentPost({
  title,
  platform,
  content_type:   contentType,
  client_id:      clientId || null,
  client_name:    clientName,
  scheduled_date: schedDate,
  scheduled_time: schedTime || null,   // ← add this
  assigned_to:    assignedTo || null,
  drive_link:     driveLink,
  caption,
  notes: "",
})
```

- [ ] **Step 5: Reset `schedTime` when the form is reset**

Find wherever other form fields are reset (after successful submit or on close). Add:

```typescript
setSchedTime("")
```

- [ ] **Step 6: Verify build passes**

```bash
pnpm build
```

Expected: no TypeScript errors, `✓ Compiled successfully`.

- [ ] **Step 7: Commit**

```bash
git add app/admin/content-calendar/content-calendar-client.tsx
git commit -m "feat: add time picker to content calendar form and missed status display"
```

---

## Task 4: Cron — Content Reminder (30 min before)

**Files:**
- Create: `app/api/cron/content-reminder/route.ts`

- [ ] **Step 1: Create the route file**

```typescript
// app/api/cron/content-reminder/route.ts
import { createClient } from '@supabase/supabase-js'
import { NextRequest, NextResponse } from 'next/server'
import { sendWhatsAppTemplate, formatPhone } from '@/lib/whatsapp'

function adminSupabase() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  )
}

function isAuthorized(req: NextRequest): boolean {
  const secret = process.env.CRON_SECRET
  return !!secret && req.headers.get('authorization') === `Bearer ${secret}`
}

// Runs every 30 minutes. Finds content posts whose scheduled_time falls in the
// next 30 minutes and sends a WhatsApp reminder to the assigned employee.
export async function GET(req: NextRequest) {
  if (!isAuthorized(req)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const admin = adminSupabase()

  // Current time in IST
  const now = new Date()
  const istNow = new Date(now.toLocaleString('en-US', { timeZone: 'Asia/Kolkata' }))

  // Today's date string in IST
  const today = `${istNow.getFullYear()}-${String(istNow.getMonth() + 1).padStart(2, '0')}-${String(istNow.getDate()).padStart(2, '0')}`

  // Window: now → now+30min (exclusive upper bound to avoid double-send)
  const windowStart = `${String(istNow.getHours()).padStart(2, '0')}:${String(istNow.getMinutes()).padStart(2, '0')}:00`
  const plus30 = new Date(istNow.getTime() + 30 * 60 * 1000)
  const windowEnd = `${String(plus30.getHours()).padStart(2, '0')}:${String(plus30.getMinutes()).padStart(2, '0')}:00`

  const { data: posts, error } = await admin
    .from('content_posts')
    .select('id, title, client_name, scheduled_time, assigned_to')
    .eq('scheduled_date', today)
    .gte('scheduled_time', windowStart)
    .lt('scheduled_time', windowEnd)
    .in('status', ['pending', 'in_progress', 'ready'])
    .not('assigned_to', 'is', null)
    .not('scheduled_time', 'is', null)

  if (error) {
    console.error('[content-reminder] query error:', error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  if (!posts?.length) {
    return NextResponse.json({ reminded: 0, message: 'No posts in window' })
  }

  let reminded = 0

  await Promise.all(posts.map(async (post) => {
    const { data: assignee } = await admin
      .from('users')
      .select('name, phone')
      .eq('id', post.assigned_to)
      .single()

    if (!assignee?.phone) return

    // Format time as "5:00 PM"
    const [h, m] = (post.scheduled_time as string).split(':').map(Number)
    const ampm = h >= 12 ? 'PM' : 'AM'
    const hour12 = h % 12 || 12
    const timeLabel = `${hour12}:${String(m).padStart(2, '0')} ${ampm}`

    const ok = await sendWhatsAppTemplate(
      formatPhone(assignee.phone),
      'grofast_content_reminder',
      [assignee.name, post.title, post.client_name, timeLabel]
    ).catch(() => false)

    if (ok) reminded++
  }))

  return NextResponse.json({ date: today, window: `${windowStart}–${windowEnd}`, reminded })
}
```

- [ ] **Step 2: Add cron schedule to `vercel.json`**

Open `vercel.json` and add inside the `"crons"` array:

```json
{
  "path": "/api/cron/content-reminder",
  "schedule": "*/30 * * * *"
}
```

- [ ] **Step 3: Verify build passes**

```bash
pnpm build
```

Expected: `✓ Compiled successfully`, new route `/api/cron/content-reminder` listed.

- [ ] **Step 4: Commit**

```bash
git add app/api/cron/content-reminder/route.ts vercel.json
git commit -m "feat: add content-reminder cron — WhatsApp 30min before scheduled post"
```

---

## Task 5: Cron — Missed Post Detection (nightly)

**Files:**
- Create: `app/api/cron/content-missed/route.ts`

- [ ] **Step 1: Create the route file**

```typescript
// app/api/cron/content-missed/route.ts
import { createClient } from '@supabase/supabase-js'
import { NextRequest, NextResponse } from 'next/server'
import { sendWhatsAppTemplate, formatPhone } from '@/lib/whatsapp'

function adminSupabase() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  )
}

function isAuthorized(req: NextRequest): boolean {
  const secret = process.env.CRON_SECRET
  return !!secret && req.headers.get('authorization') === `Bearer ${secret}`
}

// Runs at 11 PM IST (17:30 UTC) daily.
// Finds posts whose scheduled_date is before today and status is not posted/cancelled/missed.
// Marks them missed and sends one WhatsApp alert to each company's admin.
export async function GET(req: NextRequest) {
  if (!isAuthorized(req)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const admin = adminSupabase()

  // Today's date in IST
  const now = new Date()
  const istNow = new Date(now.toLocaleString('en-US', { timeZone: 'Asia/Kolkata' }))
  const today = `${istNow.getFullYear()}-${String(istNow.getMonth() + 1).padStart(2, '0')}-${String(istNow.getDate()).padStart(2, '0')}`

  // Find all overdue unposted posts
  const { data: overdue, error } = await admin
    .from('content_posts')
    .select('id, company_id, title, client_name')
    .lt('scheduled_date', today)
    .not('status', 'in', '("posted","cancelled","missed")')

  if (error) {
    console.error('[content-missed] query error:', error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  if (!overdue?.length) {
    return NextResponse.json({ marked: 0, message: 'No missed posts found' })
  }

  // Bulk-mark all as missed
  const ids = overdue.map(p => p.id)
  const { error: updateError } = await admin
    .from('content_posts')
    .update({ status: 'missed' })
    .in('id', ids)

  if (updateError) {
    console.error('[content-missed] update error:', updateError)
    return NextResponse.json({ error: updateError.message }, { status: 500 })
  }

  // Group by company_id to send one alert per company
  const byCompany: Record<string, number> = {}
  for (const p of overdue) {
    byCompany[p.company_id] = (byCompany[p.company_id] ?? 0) + 1
  }

  const todayLabel = istNow.toLocaleDateString('en-IN', { day: 'numeric', month: 'long', year: 'numeric' })

  await Promise.all(Object.entries(byCompany).map(async ([companyId, count]) => {
    const { data: adminUser } = await admin
      .from('users')
      .select('phone')
      .eq('company_id', companyId)
      .eq('role', 'ADMIN')
      .limit(1)
      .single()

    if (!adminUser?.phone) return

    await sendWhatsAppTemplate(
      formatPhone(adminUser.phone),
      'grofast_content_missed',
      [String(count), todayLabel]
    ).catch(() => {/* non-fatal */})
  }))

  return NextResponse.json({ date: today, marked: overdue.length, companies: Object.keys(byCompany).length })
}
```

- [ ] **Step 2: Add cron schedule to `vercel.json`**

Open `vercel.json` and add inside the `"crons"` array:

```json
{
  "path": "/api/cron/content-missed",
  "schedule": "30 17 * * *"
}
```

- [ ] **Step 3: Verify build passes**

```bash
pnpm build
```

Expected: `✓ Compiled successfully`, new route `/api/cron/content-missed` listed.

- [ ] **Step 4: Commit**

```bash
git add app/api/cron/content-missed/route.ts vercel.json
git commit -m "feat: add content-missed cron — nightly auto-mark and admin WhatsApp alert"
```

---

## Task 6: Admin Expenses — Content Count Section

**Files:**
- Modify: `app/admin/expenses/page.tsx`
- Modify: `app/admin/expenses/expenses-client.tsx`

- [ ] **Step 1: Add content posts fetch in `page.tsx`**

In `app/admin/expenses/page.tsx`, add the year range for the fetch. Find where `monthStart`/`monthEnd` or similar date vars are defined (or add at the top of the function after `cid` is set):

```typescript
const now = new Date()
const yearStart = `${now.getFullYear()}-01-01`
const yearEnd   = `${now.getFullYear()}-12-31`
```

Add a new entry to the existing `Promise.all` array:

```typescript
admin
  .from('content_posts')
  .select('client_name, content_type, scheduled_date')
  .eq('company_id', cid)
  .eq('status', 'posted')
  .gte('scheduled_date', yearStart)
  .lte('scheduled_date', yearEnd),
```

Destructure the result:

```typescript
const [
  { data: updatesRaw },
  { data: usersRaw },
  { data: expensesRaw },
  { data: pricingRaw },
  { data: overridesRaw },
  { data: contentPostsRaw },   // ← add this
] = await Promise.all([...])
```

Pass to `ExpensesClient`:

```tsx
return (
  <ExpensesClient
    updates={updatesRaw ?? []}
    users={usersRaw ?? []}
    expenses={expensesRaw ?? []}
    pricingRates={pricingRaw ?? []}
    costOverrides={overridesRaw ?? []}
    contentPosts={contentPostsRaw ?? []}   // ← add this
  />
)
```

- [ ] **Step 2: Add `ContentPostRow` type and prop to `expenses-client.tsx`**

At the top of `app/admin/expenses/expenses-client.tsx`, add the type after the existing types:

```typescript
type ContentPostRow = {
  client_name: string
  content_type: string
  scheduled_date: string
}
```

Update the component signature to accept the new prop:

```typescript
export default function ExpensesClient({
  updates, users, expenses, pricingRates, costOverrides, contentPosts,
}: {
  updates: UpdateRow[]
  users: MemberUser[]
  expenses: Expense[]
  pricingRates: PricingRate[]
  costOverrides: CostOverride[]
  contentPosts: ContentPostRow[]   // ← add this
}) {
```

- [ ] **Step 3: Add month filter state and aggregation logic**

Inside the component body (after existing state declarations), add:

```typescript
const MONTHS_SHORT = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec']
const [contentMonth, setContentMonth] = useState(new Date().getMonth()) // 0-indexed

const contentCounts = useMemo(() => {
  const TYPE_MAP: Record<string, string> = {
    video: 'Videos', reel: 'Reels', post: 'Posters', story: 'Stories',
  }
  const filtered = contentPosts.filter(p => {
    const m = new Date(p.scheduled_date + 'T12:00:00').getMonth()
    return m === contentMonth
  })
  const map: Record<string, Record<string, number>> = {}
  for (const p of filtered) {
    const client = p.client_name || 'Unknown'
    const type   = TYPE_MAP[p.content_type] ?? 'Other'
    if (!map[client]) map[client] = {}
    map[client][type] = (map[client][type] ?? 0) + 1
  }
  return Object.entries(map)
    .map(([client, counts]) => ({
      client,
      videos:  counts['Videos']  ?? 0,
      reels:   counts['Reels']   ?? 0,
      posters: counts['Posters'] ?? 0,
      stories: counts['Stories'] ?? 0,
      other:   counts['Other']   ?? 0,
      total:   Object.values(counts).reduce((a, b) => a + b, 0),
    }))
    .sort((a, b) => b.total - a.total)
}, [contentPosts, contentMonth])
```

- [ ] **Step 4: Render the content count section**

At the very top of the component's JSX return (before any existing tabs/sections), add:

```tsx
{/* ── Content Posted This Month ──────────────────────────────── */}
<div style={{ marginBottom: 28 }}>
  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 10, marginBottom: 14 }}>
    <h2 style={{ fontSize: 16, fontWeight: 800, color: '#111111', margin: 0 }}>Content Posted</h2>
    {/* Month filter pills */}
    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 5 }}>
      {MONTHS_SHORT.map((m, i) => (
        <button key={m} onClick={() => setContentMonth(i)}
          style={{ padding: '4px 12px', borderRadius: 20, fontSize: 11, fontWeight: 700, cursor: 'pointer', border: `1.5px solid ${contentMonth === i ? '#de1a1a' : '#E5E7EB'}`, background: contentMonth === i ? 'rgba(222,26,26,0.08)' : '#F9FAFB', color: contentMonth === i ? '#de1a1a' : '#6B7280' }}>
          {m}
        </button>
      ))}
    </div>
  </div>

  {contentCounts.length === 0 ? (
    <p style={{ fontSize: 13, color: '#9CA3AF', textAlign: 'center', padding: '24px 0' }}>
      No posts marked as posted for {MONTHS_SHORT[contentMonth]}.
    </p>
  ) : (
    <div style={{ overflowX: 'auto' }}>
      <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
        <thead>
          <tr style={{ background: '#F9FAFB' }}>
            {['Client', 'Videos', 'Reels', 'Posters', 'Stories', 'Other', 'Total'].map(h => (
              <th key={h} style={{ padding: '8px 12px', textAlign: h === 'Client' ? 'left' : 'center', fontSize: 11, fontWeight: 700, color: '#6B7280', textTransform: 'uppercase', letterSpacing: '0.06em', borderBottom: '1px solid #E5E7EB' }}>{h}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {contentCounts.map((row, i) => (
            <tr key={row.client} style={{ background: i % 2 === 0 ? '#FFFFFF' : '#FAFAFA' }}>
              <td style={{ padding: '10px 12px', fontWeight: 600, color: '#111111', borderBottom: '1px solid #F3F4F6' }}>{row.client}</td>
              {[row.videos, row.reels, row.posters, row.stories, row.other].map((v, j) => (
                <td key={j} style={{ padding: '10px 12px', textAlign: 'center', color: v > 0 ? '#111111' : '#D1D5DB', fontWeight: v > 0 ? 700 : 400, borderBottom: '1px solid #F3F4F6' }}>{v > 0 ? v : '—'}</td>
              ))}
              <td style={{ padding: '10px 12px', textAlign: 'center', fontWeight: 800, color: '#de1a1a', borderBottom: '1px solid #F3F4F6' }}>{row.total}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )}
</div>
```

- [ ] **Step 5: Verify build passes**

```bash
pnpm build
```

Expected: `✓ Compiled successfully`, no TypeScript errors.

- [ ] **Step 6: Commit**

```bash
git add app/admin/expenses/page.tsx app/admin/expenses/expenses-client.tsx
git commit -m "feat: add per-client content count section to admin expenses page"
```

---

## Task 7: Register WhatsApp Templates + Final Push

- [ ] **Step 1: Register `grofast_content_reminder` in Meta Business Manager**

Go to Meta Business Manager → WhatsApp → Message Templates → Create Template.

- **Name:** `grofast_content_reminder`
- **Category:** Utility
- **Language:** English
- **Body:**
  > Hi {{1}}, reminder: "{{2}}" for {{3}} is scheduled in 30 minutes ({{4}}). Please post and mark it as posted.
- **Variables:** `{{1}}` = employee name, `{{2}}` = post title, `{{3}}` = client name, `{{4}}` = time (e.g. "5:00 PM")

Wait for approval (usually minutes for Utility templates).

- [ ] **Step 2: Register `grofast_content_missed` in Meta Business Manager**

- **Name:** `grofast_content_missed`
- **Category:** Utility
- **Language:** English
- **Body:**
  > Alert: {{1}} content post(s) scheduled for {{2}} were not marked as posted and have been flagged as missed. Please review the content calendar.
- **Variables:** `{{1}}` = count, `{{2}}` = date label (e.g. "5 June 2026")

- [ ] **Step 3: Final push to GitHub**

```bash
git push origin master
```

Expected: Vercel auto-deploys. Check `https://grofastteam.vercel.app` after ~60 seconds.

---

## Self-Review Checklist

- [x] **Spec coverage:** Migration (Task 1) ✓ · Action update (Task 2) ✓ · Time picker + missed status (Task 3) ✓ · Reminder cron (Task 4) ✓ · Missed cron (Task 5) ✓ · Expenses counts (Task 6) ✓ · Templates (Task 7) ✓
- [x] **No placeholders:** All steps have complete code
- [x] **Type consistency:** `ContentPostRow` defined in Task 6 Step 2 before use in Steps 3–4 · `ContentPostInput.scheduled_time` defined in Task 2 Step 1 before passed in Task 3 Step 4
- [x] **Cron auth pattern:** All cron routes use identical `isAuthorized` pattern from existing routes
- [x] **Double-send prevention:** Reminder uses `gte`/`lt` (exclusive upper bound) so a post at exactly :30 only matches the :30 window, not the :00 window
