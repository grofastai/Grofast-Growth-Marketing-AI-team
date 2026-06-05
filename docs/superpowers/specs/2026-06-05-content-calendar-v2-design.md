# Content Calendar V2 — Design Spec

**Date:** 2026-06-05
**Scope:** WhatsApp reminders for scheduled posts, auto-missed detection, content count tracking in Admin Expenses

---

## Problem

1. Team members forget to post scheduled content — no reminders exist at post time.
2. Missed posts are not tracked — admin has no visibility on what was skipped and who was responsible.
3. Admin cannot see how many videos, reels, and posters were posted per client in a given month.

---

## Out of Scope (This Build)

- Expense / profit tracking per client
- Recurring content scheduling
- PDF / Excel report export
- Employee accountability reports

---

## 1. Database Changes

### 1a. Add `scheduled_time` to `content_posts`

```sql
ALTER TABLE content_posts ADD COLUMN IF NOT EXISTS scheduled_time time NULL;
```

- `NULL` means date-only post — no 30-minute reminder is sent, employee receives only the day-of assignment notification (already exists via `grofast_content_assigned`).
- Non-null means a specific posting time is set — 30-minute reminder cron fires.

### 1b. `missed` status

`content_posts.status` is already a plain `text` column. No migration needed. The cron and UI will use `missed` as a new valid value alongside the existing: `pending`, `in_progress`, `ready`, `posted`, `cancelled`.

Update `STATUS_CFG` in `content-calendar-client.tsx` to include:
```ts
missed: { label: "Missed", color: "#EF4444", bg: "rgba(239,68,68,0.1)" }
```

---

## 2. Content Calendar Form — Time Picker

**File:** `app/admin/content-calendar/content-calendar-client.tsx`

Add an optional `scheduled_time` field (HTML `<input type="time">`) below the existing `scheduled_date` field in the "Add Post" modal.

- Label: "Post Time (optional)"
- If left blank: saved as `null`.
- If filled: saved as `HH:MM:SS` in the `scheduled_time` column.

**Server Action change** (`lib/actions/content-calendar.ts`):
- Add `scheduled_time?: string | null` to `ContentPostInput`.
- Pass it through to the `insert` call.

---

## 3. Cron Job — Content Reminder

**Route:** `app/api/cron/content-reminder/route.ts`

**Schedule:** `*/30 * * * *` (every 30 minutes) — added to `vercel.json`.

**Logic:**
1. Get current time in IST (UTC+5:30).
2. Compute window: `now` to `now + 30 minutes`.
3. Query `content_posts` where:
   - `scheduled_date = today (IST)`
   - `scheduled_time >= now AND scheduled_time < now+30min` (exclusive upper bound — prevents double-send if post time falls exactly on a cron tick)
   - `status IN ('pending', 'in_progress', 'ready')`
   - `assigned_to IS NOT NULL`
4. For each matching post, fetch assignee phone from `users`.
5. Send WhatsApp via `sendWhatsAppTemplate` using template `grofast_content_reminder`.
   - Params: `[assignee_name, post_title, client_name, formatted_time]`
6. Skip posts where assignee has no phone.

**WhatsApp Template:** `grofast_content_reminder`
- Body: *"Hi {{1}}, reminder: "{{2}}" for {{3}} is scheduled in 30 minutes ({{4}}). Please post and mark it as posted."*

**Deduplication:** No separate tracking needed — the 30-minute window means each post matches the cron at most once (cron fires every 30 min, window is 30 min).

---

## 4. Cron Job — Missed Post Detection

**Route:** `app/api/cron/content-missed/route.ts`

**Schedule:** `30 17 * * *` (11pm IST = 17:30 UTC exactly) — added to `vercel.json`.

**Logic:**
1. Get today's date in IST.
2. Query `content_posts` where:
   - `scheduled_date < today (IST)`
   - `status NOT IN ('posted', 'cancelled', 'missed')`
   - Group by `company_id`
3. Bulk-update matching posts: `status = 'missed'`.
4. For each company that had missed posts:
   - Fetch admin phone from `users` where `role = 'ADMIN'`.
   - Send WhatsApp via `grofast_content_missed` template.
   - Params: `[missed_count, today_label]`

**WhatsApp Template:** `grofast_content_missed`
- Body: *"Alert: {{1}} content post(s) scheduled for {{2}} were not marked as posted and have been flagged as missed. Please review the content calendar."*

---

## 5. Admin Expenses — Content Count Section

**File:** `app/admin/expenses/page.tsx` + `expenses-client.tsx`

### Server (page.tsx)

Add a new parallel fetch:

```ts
admin
  .from('content_posts')
  .select('client_name, content_type, scheduled_date')
  .eq('company_id', cid)
  .eq('status', 'posted')
  .gte('scheduled_date', monthStart)
  .lte('scheduled_date', monthEnd)
```

Pass result as `contentPosts` prop to `ExpensesClient`.

### Client (expenses-client.tsx)

Add a **"Content Posted"** section at the top of the page (above existing expense data).

**UI:**
- Month filter pill row (Jan–Dec of current year, current month selected by default).
- Table with columns: **Client | Videos | Reels | Posters | Stories | Other | Total**
- Rows: one per unique `client_name` with posted count per `content_type`.
- Empty state: "No posts marked as posted for this month."

**Aggregation:** Done client-side from the `contentPosts` prop — filter by selected month, group by `client_name` and `content_type`, count rows.

Content types mapped:
- `video` → Videos
- `reel` → Reels
- `post` → Posters
- `story` → Stories
- everything else → Other

---

## 6. Files Changed

| File | Change |
|------|--------|
| `supabase/migrations/020_content_scheduled_time.sql` | Add `scheduled_time` column |
| `app/admin/content-calendar/content-calendar-client.tsx` | Add time picker, add `missed` to STATUS_CFG |
| `lib/actions/content-calendar.ts` | Pass `scheduled_time` through create/update |
| `app/api/cron/content-reminder/route.ts` | New file |
| `app/api/cron/content-missed/route.ts` | New file |
| `vercel.json` | Add two new cron schedules |
| `app/admin/expenses/page.tsx` | Add `contentPosts` fetch |
| `app/admin/expenses/expenses-client.tsx` | Add content count section + month filter |

---

## 7. WhatsApp Templates to Register

Both templates must be created and approved in Meta Business Manager before deployment:

| Template Name | Recipient | Params |
|---|---|---|
| `grofast_content_reminder` | Assigned employee | `[name, post_title, client_name, time]` |
| `grofast_content_missed` | Admin | `[missed_count, date]` |

---

## Success Criteria

- Assigned employee receives WhatsApp 30 minutes before a post with a set time.
- Posts not marked as posted by 11pm IST are automatically set to `missed`.
- Admin receives WhatsApp when posts are auto-marked missed.
- Admin Expenses page shows per-client content counts filterable by month.
