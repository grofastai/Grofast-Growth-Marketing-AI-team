# Activity-Based Work Tracking — Phase 1 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the current tab-based daily update form with an activity-based system where members pick what they did, fill details per activity, and log posts — producing clean structured data for agency analytics.

**Architecture:** Three new DB tables (`activities`, `work_logs`, `content_posts`) alongside the existing `daily_updates` table (kept for backward compatibility). New member form writes to the new tables. New admin insights page at `/admin/insights` reads from the new tables. Old reports continue to work unchanged.

**Tech Stack:** Next.js 15 App Router, Supabase PostgreSQL + RLS, TypeScript strict, Tailwind/inline styles (existing pattern), React Server Components + Server Actions.

---

## File Map

| File | Action |
|---|---|
| `supabase/migrations/049_activity_work_logs.sql` | **Create** — activities, work_logs, content_posts tables + RLS |
| `supabase/migrations/050_seed_default_activities.sql` | **Create** — seed 20 default activities for all existing companies |
| `lib/actions/work-logs.ts` | **Create** — submitWorkLogs + getWorkLogsForDate server actions |
| `app/member/update/page.tsx` | **Rewrite** — fetch activities + existing logs, pass to new form |
| `app/member/update/activity-update-form.tsx` | **Create** — new activity-based form client component |
| `app/admin/insights/page.tsx` | **Create** — admin insights server page |
| `app/admin/insights/insights-client.tsx` | **Create** — admin insights client component |
| `components/admin/sidebar.tsx` | **Modify** — add Insights nav link |

---

## Task 1: Database Schema

**Files:**
- Create: `supabase/migrations/049_activity_work_logs.sql`

- [ ] **Step 1: Create the migration file**

Create `supabase/migrations/049_activity_work_logs.sql`:

```sql
-- ── Activities master ──────────────────────────────────────────────────────────
-- One row per activity type per company (e.g. "Video Edit", "Meta Ads").
-- unit_type controls what the member fills in: hours only, count only, or both.

CREATE TABLE IF NOT EXISTS activities (
  id            uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id    uuid        NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  name          text        NOT NULL,
  team_category text        NOT NULL CHECK (team_category IN ('MEDIA','META','CREATIVE','AI','OPS')),
  unit_type     text        NOT NULL CHECK (unit_type IN ('hours','count','both')),
  emoji         text        NOT NULL DEFAULT '💼',
  sort_order    int         NOT NULL DEFAULT 0,
  is_active     boolean     NOT NULL DEFAULT true,
  created_at    timestamptz NOT NULL DEFAULT now(),
  UNIQUE(company_id, name)
);

ALTER TABLE activities ENABLE ROW LEVEL SECURITY;

CREATE POLICY "tenant_isolation" ON activities
  FOR ALL USING (company_id = (auth.jwt() ->> 'company_id')::uuid);

CREATE POLICY "admin_write" ON activities
  FOR INSERT WITH CHECK ((auth.jwt() ->> 'role') = 'ADMIN');

CREATE POLICY "admin_update" ON activities
  FOR UPDATE USING ((auth.jwt() ->> 'role') = 'ADMIN');

CREATE POLICY "admin_delete" ON activities
  FOR DELETE USING ((auth.jwt() ->> 'role') = 'ADMIN');

-- ── Work logs ─────────────────────────────────────────────────────────────────
-- One row per activity per member per day.
-- Replaces the unstructured work_entries JSONB in daily_updates.

CREATE TABLE IF NOT EXISTS work_logs (
  id            uuid         PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id    uuid         NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  user_id       uuid         NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  date          date         NOT NULL,
  activity_id   uuid         NOT NULL REFERENCES activities(id),
  client_name   text,
  hours         numeric(5,2) NOT NULL DEFAULT 0,
  unit_count    int          NOT NULL DEFAULT 0,
  notes         text,
  cost          numeric(10,2) NOT NULL DEFAULT 0,
  created_at    timestamptz  NOT NULL DEFAULT now()
);

ALTER TABLE work_logs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "tenant_isolation" ON work_logs
  FOR ALL USING (company_id = (auth.jwt() ->> 'company_id')::uuid);

CREATE POLICY "member_insert" ON work_logs
  FOR INSERT WITH CHECK (user_id = auth.uid());

CREATE POLICY "member_update" ON work_logs
  FOR UPDATE USING (user_id = auth.uid());

CREATE POLICY "admin_all" ON work_logs
  FOR ALL USING ((auth.jwt() ->> 'role') = 'ADMIN');

CREATE INDEX IF NOT EXISTS work_logs_company_date_idx  ON work_logs(company_id, date);
CREATE INDEX IF NOT EXISTS work_logs_company_user_idx  ON work_logs(company_id, user_id);
CREATE INDEX IF NOT EXISTS work_logs_activity_idx      ON work_logs(activity_id);

-- ── Content posts ─────────────────────────────────────────────────────────────
-- One row per post published (Reel, Poster, Story, etc.)
-- Tracks WHO posted, WHAT, WHERE, for WHICH client, on WHICH day.

CREATE TABLE IF NOT EXISTS content_posts (
  id            uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id    uuid        NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  user_id       uuid        NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  date          date        NOT NULL,
  client_name   text,
  platform      text        NOT NULL CHECK (platform IN ('Instagram','YouTube','Facebook','LinkedIn','Twitter','Other')),
  post_type     text        NOT NULL CHECK (post_type IN ('Reel','Poster','Story','Video','Carousel','Thread','Short','Other')),
  post_link     text,
  notes         text,
  created_at    timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE content_posts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "tenant_isolation" ON content_posts
  FOR ALL USING (company_id = (auth.jwt() ->> 'company_id')::uuid);

CREATE POLICY "member_insert" ON content_posts
  FOR INSERT WITH CHECK (user_id = auth.uid());

CREATE POLICY "member_update" ON content_posts
  FOR UPDATE USING (user_id = auth.uid());

CREATE POLICY "admin_all" ON content_posts
  FOR ALL USING ((auth.jwt() ->> 'role') = 'ADMIN');

CREATE INDEX IF NOT EXISTS content_posts_company_date_idx ON content_posts(company_id, date);
CREATE INDEX IF NOT EXISTS content_posts_user_date_idx    ON content_posts(user_id, date);
```

- [ ] **Step 2: Apply the migration in Supabase dashboard**

Open Supabase → SQL Editor → paste and run the file content.

Expected: Tables `activities`, `work_logs`, `content_posts` appear in Table Editor.

- [ ] **Step 3: Commit the migration file**

```bash
cd "s:/VS CODE USING CODEX/GROFAST GROWTH MARKETING AND AI SOLUTIOn" && git add supabase/migrations/049_activity_work_logs.sql && git commit -m "feat: activities, work_logs, content_posts schema"
```

---

## Task 2: Seed Default Activities

**Files:**
- Create: `supabase/migrations/050_seed_default_activities.sql`

- [ ] **Step 1: Create the seed migration**

Create `supabase/migrations/050_seed_default_activities.sql`:

```sql
-- Seed 20 default activities for every existing company.
-- Uses ON CONFLICT DO NOTHING so it's safe to re-run.

INSERT INTO activities (company_id, name, team_category, unit_type, emoji, sort_order)
SELECT
  c.id,
  a.name,
  a.team_category,
  a.unit_type,
  a.emoji,
  a.sort_order
FROM companies c
CROSS JOIN (VALUES
  ('Video Edit',        'MEDIA',    'both',  '🎬', 1),
  ('Video Shoot',       'MEDIA',    'hours', '📸', 2),
  ('Script Writing',    'MEDIA',    'hours', '✍️',  3),
  ('Poster Design',     'CREATIVE', 'both',  '🖼️', 4),
  ('Graphic Design',    'CREATIVE', 'both',  '🎨', 5),
  ('Thumbnail Design',  'CREATIVE', 'count', '🖼️', 6),
  ('Motion Graphics',   'CREATIVE', 'hours', '🎭', 7),
  ('Meta Ads',          'META',     'hours', '📊', 8),
  ('Google Ads',        'META',     'hours', '📢', 9),
  ('Reporting',         'META',     'hours', '📋', 10),
  ('Lead Follow-up',    'META',     'hours', '🎯', 11),
  ('AI Automation',     'AI',       'hours', '🤖', 12),
  ('Website Dev',       'AI',       'hours', '💻', 13),
  ('Chatbot Setup',     'AI',       'hours', '🔧', 14),
  ('Reel Posting',      'OPS',      'count', '📱', 15),
  ('Story Posting',     'OPS',      'count', '📖', 16),
  ('YouTube Upload',    'OPS',      'count', '▶️', 17),
  ('Client Call',       'OPS',      'hours', '📞', 18),
  ('Strategy Meeting',  'OPS',      'hours', '🗓️', 19),
  ('Content Planning',  'OPS',      'hours', '📝', 20)
) AS a(name, team_category, unit_type, emoji, sort_order)
ON CONFLICT (company_id, name) DO NOTHING;
```

- [ ] **Step 2: Apply in Supabase SQL Editor**

Paste and run the file. Expected: activities table now has 20 rows per company.

- [ ] **Step 3: Commit**

```bash
cd "s:/VS CODE USING CODEX/GROFAST GROWTH MARKETING AND AI SOLUTIOn" && git add supabase/migrations/050_seed_default_activities.sql && git commit -m "feat: seed 20 default activities per company"
```

---

## Task 3: Server Actions

**Files:**
- Create: `lib/actions/work-logs.ts`

- [ ] **Step 1: Create the server actions file**

Create `lib/actions/work-logs.ts`:

```typescript
'use server'

import { createClient } from '@supabase/supabase-js'
import { createServerClient } from '@/lib/supabase/server'
import { revalidatePath } from 'next/cache'

function adminSupabase() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  )
}

export type WorkLogInput = {
  activity_id: string
  client_name: string
  hours: number
  unit_count: number
  notes: string
}

export type ContentPostInput = {
  client_name: string
  platform: string
  post_type: string
  post_link: string
  notes: string
}

export type Activity = {
  id: string
  name: string
  team_category: 'MEDIA' | 'META' | 'CREATIVE' | 'AI' | 'OPS'
  unit_type: 'hours' | 'count' | 'both'
  emoji: string
  sort_order: number
}

export async function submitWorkLogs(
  date: string,
  logs: WorkLogInput[],
  posts: ContentPostInput[],
): Promise<{ success: boolean; error?: string }> {
  const supabase = await createServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { success: false, error: 'Not authenticated' }

  const admin = adminSupabase()
  const { data: profile } = await admin
    .from('users')
    .select('company_id, monthly_salary, hourly_rate')
    .eq('id', user.id)
    .single()
  if (!profile?.company_id) return { success: false, error: 'Profile not found' }

  const cid = profile.company_id
  const hourlyRate = profile.monthly_salary && profile.monthly_salary > 0
    ? profile.monthly_salary / 25 / 9
    : (profile.hourly_rate ?? 0)

  // Replace strategy: delete today's logs then re-insert
  await Promise.all([
    admin.from('work_logs').delete().eq('user_id', user.id).eq('date', date).eq('company_id', cid),
    admin.from('content_posts').delete().eq('user_id', user.id).eq('date', date).eq('company_id', cid),
  ])

  if (logs.length > 0) {
    const rows = logs
      .filter(l => l.hours > 0 || l.unit_count > 0)
      .map(l => ({
        company_id:  cid,
        user_id:     user.id,
        date,
        activity_id: l.activity_id,
        client_name: l.client_name || null,
        hours:       l.hours,
        unit_count:  l.unit_count,
        notes:       l.notes || null,
        cost:        Math.round(hourlyRate * l.hours * 100) / 100,
      }))
    if (rows.length > 0) {
      const { error } = await admin.from('work_logs').insert(rows)
      if (error) return { success: false, error: error.message }
    }
  }

  if (posts.length > 0) {
    const rows = posts
      .filter(p => p.platform && p.post_type)
      .map(p => ({
        company_id:  cid,
        user_id:     user.id,
        date,
        client_name: p.client_name || null,
        platform:    p.platform,
        post_type:   p.post_type,
        post_link:   p.post_link || null,
        notes:       p.notes || null,
      }))
    if (rows.length > 0) {
      const { error } = await admin.from('content_posts').insert(rows)
      if (error) return { success: false, error: error.message }
    }
  }

  revalidatePath('/member/update')
  revalidatePath('/admin/insights')
  return { success: true }
}

export async function getWorkLogsForDate(date: string): Promise<{
  logs: Array<{ activity_id: string; client_name: string | null; hours: number; unit_count: number; notes: string | null }>
  posts: Array<{ client_name: string | null; platform: string; post_type: string; post_link: string | null; notes: string | null }>
}> {
  const supabase = await createServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { logs: [], posts: [] }

  const admin = adminSupabase()
  const { data: profile } = await admin.from('users').select('company_id').eq('id', user.id).single()
  if (!profile) return { logs: [], posts: [] }

  const [{ data: logs }, { data: posts }] = await Promise.all([
    admin.from('work_logs')
      .select('activity_id, client_name, hours, unit_count, notes')
      .eq('user_id', user.id).eq('date', date).eq('company_id', profile.company_id),
    admin.from('content_posts')
      .select('client_name, platform, post_type, post_link, notes')
      .eq('user_id', user.id).eq('date', date).eq('company_id', profile.company_id),
  ])

  return { logs: (logs ?? []) as any, posts: (posts ?? []) as any }
}
```

- [ ] **Step 2: TypeScript check**

```bash
cd "s:/VS CODE USING CODEX/GROFAST GROWTH MARKETING AND AI SOLUTIOn" && pnpm typecheck 2>&1 | grep "error TS" | head -10
```

Expected: no output.

- [ ] **Step 3: Commit**

```bash
cd "s:/VS CODE USING CODEX/GROFAST GROWTH MARKETING AND AI SOLUTIOn" && git add lib/actions/work-logs.ts && git commit -m "feat: submitWorkLogs and getWorkLogsForDate server actions"
```

---

## Task 4: Member Update Page (Server Component)

**Files:**
- Modify: `app/member/update/page.tsx` (full rewrite)

- [ ] **Step 1: Rewrite the page**

Replace the entire content of `app/member/update/page.tsx` with:

```typescript
export const revalidate = 0

import { createServerClient } from '@/lib/supabase/server'
import { createClient } from '@supabase/supabase-js'
import { redirect } from 'next/navigation'
import { Suspense } from 'react'
import { Loader2 } from 'lucide-react'
import ActivityUpdateForm from './activity-update-form'
import { getWorkLogsForDate, type Activity } from '@/lib/actions/work-logs'

function adminSupabase() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  )
}

export default async function UpdatePage() {
  const supabase = await createServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const admin = adminSupabase()
  const today = new Date().toISOString().split('T')[0]

  const { data: profile } = await admin
    .from('users')
    .select('company_id, name, monthly_salary, hourly_rate')
    .eq('id', user.id)
    .single()

  if (!profile) redirect('/login')
  const cid = profile.company_id

  const [
    { data: activitiesRaw },
    { data: clientsRaw },
    todayData,
  ] = await Promise.all([
    admin
      .from('activities')
      .select('id, name, team_category, unit_type, emoji, sort_order')
      .eq('company_id', cid)
      .eq('is_active', true)
      .order('sort_order'),
    admin
      .from('clients')
      .select('name')
      .eq('company_id', cid)
      .eq('status', 'active')
      .order('name'),
    getWorkLogsForDate(today),
  ])

  const activities = (activitiesRaw ?? []) as Activity[]
  const clientNames = (clientsRaw ?? []).map((c: { name: string }) => c.name)

  const hourlyRate = profile.monthly_salary && profile.monthly_salary > 0
    ? Math.round(profile.monthly_salary / 25 / 9)
    : (profile.hourly_rate ?? 0)

  return (
    <Suspense fallback={
      <div className="flex items-center justify-center py-16">
        <Loader2 size={20} className="animate-spin" style={{ color: '#de1a1a' }} />
      </div>
    }>
      <ActivityUpdateForm
        activities={activities}
        clientNames={clientNames}
        today={today}
        userName={profile.name ?? 'Member'}
        hourlyRate={hourlyRate}
        existingLogs={todayData.logs}
        existingPosts={todayData.posts}
      />
    </Suspense>
  )
}
```

- [ ] **Step 2: TypeScript check (expects error for missing activity-update-form)**

```bash
cd "s:/VS CODE USING CODEX/GROFAST GROWTH MARKETING AND AI SOLUTIOn" && pnpm typecheck 2>&1 | grep "error TS" | head -5
```

Expected: one error about missing `./activity-update-form` module — that's the next task.

- [ ] **Step 3: Commit**

```bash
cd "s:/VS CODE USING CODEX/GROFAST GROWTH MARKETING AND AI SOLUTIOn" && git add app/member/update/page.tsx && git commit -m "feat: update page server component — fetches activities and existing logs"
```

---

## Task 5: Activity Update Form (Client Component)

**Files:**
- Create: `app/member/update/activity-update-form.tsx`

- [ ] **Step 1: Create the form component**

Create `app/member/update/activity-update-form.tsx`:

```typescript
'use client'

import { useState, useTransition, useMemo } from 'react'
import { useRouter } from 'next/navigation'
import { CheckCircle2, Loader2, Plus, Trash2, Clock, Hash } from 'lucide-react'
import { submitWorkLogs, type Activity, type WorkLogInput, type ContentPostInput } from '@/lib/actions/work-logs'

const TEAM_LABELS: Record<string, { label: string; color: string; bg: string }> = {
  MEDIA:    { label: 'Media & Video',     color: '#E53935', bg: 'rgba(229,57,53,0.07)'   },
  META:     { label: 'Meta & Marketing',  color: '#F59E0B', bg: 'rgba(245,158,11,0.07)'  },
  CREATIVE: { label: 'Creative Design',   color: '#8B5CF6', bg: 'rgba(139,92,246,0.07)'  },
  AI:       { label: 'AI & Tech',         color: '#10B981', bg: 'rgba(16,185,129,0.07)'  },
  OPS:      { label: 'Operations',        color: '#3B82F6', bg: 'rgba(59,130,246,0.07)'  },
}

const TEAM_ORDER = ['MEDIA', 'META', 'CREATIVE', 'AI', 'OPS']

const PLATFORMS = ['Instagram', 'YouTube', 'Facebook', 'LinkedIn', 'Twitter', 'Other']
const POST_TYPES = ['Reel', 'Poster', 'Story', 'Video', 'Carousel', 'Thread', 'Short', 'Other']

const INP: React.CSSProperties = {
  width: '100%', boxSizing: 'border-box' as const,
  padding: '8px 11px', borderRadius: 9,
  border: '1.5px solid #E5E7EB', fontSize: 13,
  color: '#111827', background: '#F9FAFB', outline: 'none',
}

const SEL: React.CSSProperties = { ...INP, cursor: 'pointer', appearance: 'none' as const }

type LogState = {
  activity_id: string
  client_name: string
  hours: string
  unit_count: string
  notes: string
}

type PostState = {
  id: string
  client_name: string
  platform: string
  post_type: string
  post_link: string
  notes: string
}

function emptyPost(): PostState {
  return { id: crypto.randomUUID(), client_name: '', platform: 'Instagram', post_type: 'Reel', post_link: '', notes: '' }
}

export default function ActivityUpdateForm({
  activities, clientNames, today, userName, hourlyRate,
  existingLogs, existingPosts,
}: {
  activities: Activity[]
  clientNames: string[]
  today: string
  userName: string
  hourlyRate: number
  existingLogs: Array<{ activity_id: string; client_name: string | null; hours: number; unit_count: number; notes: string | null }>
  existingPosts: Array<{ client_name: string | null; platform: string; post_type: string; post_link: string | null; notes: string | null }>
}) {
  const router = useRouter()
  const [isPending, start] = useTransition()
  const [submitted, setSubmitted] = useState(existingLogs.length > 0 || existingPosts.length > 0)
  const [error, setError] = useState<string | null>(null)

  // Which activities are checked
  const [selected, setSelected] = useState<Set<string>>(() => {
    const s = new Set<string>()
    for (const l of existingLogs) s.add(l.activity_id)
    return s
  })

  // Log state — one entry per activity
  const [logs, setLogs] = useState<Record<string, LogState>>(() => {
    const m: Record<string, LogState> = {}
    for (const l of existingLogs) {
      m[l.activity_id] = {
        activity_id: l.activity_id,
        client_name: l.client_name ?? '',
        hours: l.hours > 0 ? String(l.hours) : '',
        unit_count: l.unit_count > 0 ? String(l.unit_count) : '',
        notes: l.notes ?? '',
      }
    }
    return m
  })

  // Posts
  const [posts, setPosts] = useState<PostState[]>(() =>
    existingPosts.length > 0
      ? existingPosts.map(p => ({ id: crypto.randomUUID(), client_name: p.client_name ?? '', platform: p.platform, post_type: p.post_type, post_link: p.post_link ?? '', notes: p.notes ?? '' }))
      : []
  )

  function toggleActivity(id: string) {
    setSelected(prev => {
      const next = new Set(prev)
      if (next.has(id)) {
        next.delete(id)
        setLogs(l => { const n = { ...l }; delete n[id]; return n })
      } else {
        next.add(id)
        setLogs(l => ({ ...l, [id]: { activity_id: id, client_name: '', hours: '', unit_count: '', notes: '' } }))
      }
      return next
    })
  }

  function patchLog(id: string, patch: Partial<LogState>) {
    setLogs(prev => ({ ...prev, [id]: { ...prev[id], ...patch } }))
  }

  function patchPost(pid: string, patch: Partial<PostState>) {
    setPosts(prev => prev.map(p => p.id === pid ? { ...p, ...patch } : p))
  }

  function removePost(pid: string) {
    setPosts(prev => prev.filter(p => p.id !== pid))
  }

  // Estimated cost preview
  const totalHours = useMemo(() =>
    Object.values(logs).reduce((s, l) => s + (parseFloat(l.hours) || 0), 0)
  , [logs])

  const grouped = useMemo(() => {
    const m: Record<string, Activity[]> = {}
    for (const a of activities) {
      if (!m[a.team_category]) m[a.team_category] = []
      m[a.team_category].push(a)
    }
    return m
  }, [activities])

  function handleSubmit() {
    setError(null)
    if (selected.size === 0 && posts.length === 0) {
      setError('Select at least one activity or log a post.')
      return
    }
    const logInputs: WorkLogInput[] = Object.values(logs)
      .filter(l => selected.has(l.activity_id))
      .map(l => ({
        activity_id: l.activity_id,
        client_name: l.client_name,
        hours: parseFloat(l.hours) || 0,
        unit_count: parseInt(l.unit_count) || 0,
        notes: l.notes,
      }))
    const postInputs: ContentPostInput[] = posts
      .filter(p => p.platform && p.post_type)
      .map(p => ({ client_name: p.client_name, platform: p.platform, post_type: p.post_type, post_link: p.post_link, notes: p.notes }))

    start(async () => {
      const res = await submitWorkLogs(today, logInputs, postInputs)
      if (!res.success) { setError(res.error ?? 'Submission failed.'); return }
      setSubmitted(true)
      router.refresh()
    })
  }

  const dateLabel = new Date(today + 'T12:00:00').toLocaleDateString('en-IN', { weekday: 'long', day: 'numeric', month: 'long' })

  if (submitted && !isPending) {
    return (
      <div style={{ maxWidth: 600, margin: '0 auto', padding: '32px 20px' }}>
        <div style={{ background: '#FFFFFF', borderRadius: 20, padding: '32px', textAlign: 'center', border: '1px solid #E5E7EB', boxShadow: '0 4px 24px rgba(0,0,0,0.06)' }}>
          <CheckCircle2 size={48} style={{ color: '#16A34A', margin: '0 auto 16px' }} />
          <h2 style={{ fontSize: 20, fontWeight: 900, color: '#111827', margin: '0 0 8px', fontFamily: 'var(--font-jakarta)' }}>
            Update Submitted!
          </h2>
          <p style={{ fontSize: 13, color: '#6B7280', margin: '0 0 24px' }}>
            {dateLabel} · {Object.values(logs).filter(l => selected.has(l.activity_id)).length} activities · {posts.length} posts
          </p>
          <button
            onClick={() => setSubmitted(false)}
            style={{ padding: '10px 28px', borderRadius: 12, background: '#DE1A1A', color: '#FFF', fontSize: 13, fontWeight: 700, border: 'none', cursor: 'pointer' }}>
            Edit Update
          </button>
        </div>
      </div>
    )
  }

  return (
    <div style={{ maxWidth: 680, margin: '0 auto', padding: '24px 16px 64px' }}>

      {/* Header */}
      <div style={{ marginBottom: 24 }}>
        <h1 style={{ fontSize: 24, fontWeight: 900, color: '#111827', margin: '0 0 4px', fontFamily: 'var(--font-jakarta)' }}>
          Daily Update
        </h1>
        <p style={{ fontSize: 13, color: '#6B7280', margin: 0 }}>
          {userName} · {dateLabel}
          {hourlyRate > 0 && (
            <span style={{ marginLeft: 12, fontSize: 11, fontWeight: 600, color: '#16A34A', background: 'rgba(22,163,74,0.08)', padding: '2px 8px', borderRadius: 6 }}>
              ₹{hourlyRate}/hr · Est. cost: ₹{Math.round(totalHours * hourlyRate)}
            </span>
          )}
        </p>
      </div>

      {/* ── STEP 1: Activity Picker ───────────────────────────────────────── */}
      <div style={{ background: '#FFFFFF', borderRadius: 16, border: '1px solid #EBEDF2', marginBottom: 20, overflow: 'hidden', boxShadow: '0 2px 8px rgba(0,0,0,0.04)' }}>
        <div style={{ padding: '14px 18px', borderBottom: '1px solid #F3F4F6' }}>
          <p style={{ fontSize: 14, fontWeight: 800, color: '#111827', margin: 0, fontFamily: 'var(--font-jakarta)' }}>
            Step 1 — What did you do today?
          </p>
          <p style={{ fontSize: 11, color: '#9CA3AF', margin: '2px 0 0' }}>Select all that apply</p>
        </div>
        <div style={{ padding: '16px 18px', display: 'flex', flexDirection: 'column', gap: 16 }}>
          {TEAM_ORDER.filter(tc => grouped[tc]?.length).map(tc => {
            const cfg = TEAM_LABELS[tc]
            return (
              <div key={tc}>
                <p style={{ fontSize: 10, fontWeight: 800, color: cfg.color, textTransform: 'uppercase', letterSpacing: '0.1em', margin: '0 0 8px' }}>
                  {cfg.label}
                </p>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                  {grouped[tc].map(a => {
                    const isSelected = selected.has(a.id)
                    return (
                      <button
                        key={a.id}
                        onClick={() => toggleActivity(a.id)}
                        style={{
                          display: 'flex', alignItems: 'center', gap: 6,
                          padding: '7px 14px', borderRadius: 10, fontSize: 13, fontWeight: 600,
                          border: `1.5px solid ${isSelected ? cfg.color : '#E5E7EB'}`,
                          background: isSelected ? cfg.bg : '#F9FAFB',
                          color: isSelected ? cfg.color : '#6B7280',
                          cursor: 'pointer', transition: 'all 0.15s',
                        }}>
                        <span style={{ fontSize: 15 }}>{a.emoji}</span>
                        {a.name}
                        {isSelected && <CheckCircle2 size={13} />}
                      </button>
                    )
                  })}
                </div>
              </div>
            )
          })}
        </div>
      </div>

      {/* ── STEP 2: Detail Cards ─────────────────────────────────────────── */}
      {selected.size > 0 && (
        <div style={{ marginBottom: 20 }}>
          <p style={{ fontSize: 14, fontWeight: 800, color: '#111827', margin: '0 0 12px', fontFamily: 'var(--font-jakarta)' }}>
            Step 2 — Fill in details
          </p>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            {Array.from(selected).map(actId => {
              const act = activities.find(a => a.id === actId)
              if (!act) return null
              const log = logs[actId] ?? { activity_id: actId, client_name: '', hours: '', unit_count: '', notes: '' }
              const cfg = TEAM_LABELS[act.team_category]
              return (
                <div key={actId} style={{ background: '#FFFFFF', borderRadius: 14, border: `1.5px solid ${cfg.color}30`, overflow: 'hidden', boxShadow: '0 2px 8px rgba(0,0,0,0.04)' }}>
                  {/* Card header */}
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '12px 16px', background: cfg.bg, borderBottom: `1px solid ${cfg.color}20` }}>
                    <span style={{ fontSize: 18 }}>{act.emoji}</span>
                    <span style={{ fontSize: 14, fontWeight: 800, color: cfg.color, flex: 1, fontFamily: 'var(--font-jakarta)' }}>{act.name}</span>
                    <button onClick={() => toggleActivity(actId)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#9CA3AF', padding: 2 }}>
                      <Trash2 size={13} />
                    </button>
                  </div>
                  {/* Card body */}
                  <div style={{ padding: '14px 16px', display: 'flex', flexDirection: 'column', gap: 10 }}>
                    {/* Client */}
                    <div>
                      <label style={{ fontSize: 10, fontWeight: 700, color: '#6B7280', textTransform: 'uppercase', letterSpacing: '0.07em', display: 'block', marginBottom: 4 }}>
                        Client
                      </label>
                      <select
                        value={log.client_name}
                        onChange={e => patchLog(actId, { client_name: e.target.value })}
                        style={SEL}>
                        <option value="">— Select client —</option>
                        {clientNames.map(n => <option key={n} value={n}>{n}</option>)}
                        <option value="Internal">Internal / Our Brand</option>
                      </select>
                    </div>
                    {/* Hours */}
                    {(act.unit_type === 'hours' || act.unit_type === 'both') && (
                      <div>
                        <label style={{ fontSize: 10, fontWeight: 700, color: '#6B7280', textTransform: 'uppercase', letterSpacing: '0.07em', display: 'block', marginBottom: 4 }}>
                          <Clock size={10} style={{ display: 'inline', marginRight: 4 }} />Hours Spent
                        </label>
                        <input
                          type="number" min="0" max="24" step="0.5"
                          placeholder="e.g. 2.5"
                          value={log.hours}
                          onChange={e => patchLog(actId, { hours: e.target.value })}
                          style={{ ...INP, width: 120 }}
                        />
                      </div>
                    )}
                    {/* Count */}
                    {(act.unit_type === 'count' || act.unit_type === 'both') && (
                      <div>
                        <label style={{ fontSize: 10, fontWeight: 700, color: '#6B7280', textTransform: 'uppercase', letterSpacing: '0.07em', display: 'block', marginBottom: 4 }}>
                          <Hash size={10} style={{ display: 'inline', marginRight: 4 }} />
                          {act.name.includes('Video') ? 'Videos Count' : act.name.includes('Poster') || act.name.includes('Design') || act.name.includes('Thumbnail') ? 'Designs Count' : act.name.includes('Post') || act.name.includes('Upload') ? 'Posts Count' : 'Count'}
                        </label>
                        <input
                          type="number" min="0" step="1"
                          placeholder="e.g. 3"
                          value={log.unit_count}
                          onChange={e => patchLog(actId, { unit_count: e.target.value })}
                          style={{ ...INP, width: 120 }}
                        />
                      </div>
                    )}
                    {/* Notes */}
                    <div>
                      <label style={{ fontSize: 10, fontWeight: 700, color: '#6B7280', textTransform: 'uppercase', letterSpacing: '0.07em', display: 'block', marginBottom: 4 }}>
                        Notes (optional)
                      </label>
                      <input
                        type="text"
                        placeholder="Any details…"
                        value={log.notes}
                        onChange={e => patchLog(actId, { notes: e.target.value })}
                        style={INP}
                      />
                    </div>
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      )}

      {/* ── STEP 3: Posts Logger ─────────────────────────────────────────── */}
      <div style={{ background: '#FFFFFF', borderRadius: 16, border: '1px solid #EBEDF2', marginBottom: 24, overflow: 'hidden', boxShadow: '0 2px 8px rgba(0,0,0,0.04)' }}>
        <div style={{ padding: '14px 18px', borderBottom: '1px solid #F3F4F6', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div>
            <p style={{ fontSize: 14, fontWeight: 800, color: '#111827', margin: 0, fontFamily: 'var(--font-jakarta)' }}>
              📱 Posts Published Today
            </p>
            <p style={{ fontSize: 11, color: '#9CA3AF', margin: '2px 0 0' }}>Log every post you published</p>
          </div>
          <button
            onClick={() => setPosts(p => [...p, emptyPost()])}
            style={{ display: 'flex', alignItems: 'center', gap: 5, padding: '6px 14px', borderRadius: 9, border: '1.5px solid #3B82F6', background: 'rgba(59,130,246,0.06)', color: '#3B82F6', fontSize: 12, fontWeight: 700, cursor: 'pointer' }}>
            <Plus size={12} /> Add Post
          </button>
        </div>
        {posts.length === 0 ? (
          <p style={{ fontSize: 12, color: '#9CA3AF', textAlign: 'center', padding: '20px 0' }}>No posts logged — tap Add Post</p>
        ) : (
          <div style={{ padding: '12px 16px', display: 'flex', flexDirection: 'column', gap: 10 }}>
            {posts.map(post => (
              <div key={post.id} style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr 1fr auto', gap: 8, alignItems: 'flex-end' }}>
                <div>
                  <label style={{ fontSize: 9, fontWeight: 700, color: '#9CA3AF', textTransform: 'uppercase', letterSpacing: '0.07em', display: 'block', marginBottom: 3 }}>Client</label>
                  <select value={post.client_name} onChange={e => patchPost(post.id, { client_name: e.target.value })} style={{ ...SEL, fontSize: 12 }}>
                    <option value="">— Client —</option>
                    {clientNames.map(n => <option key={n} value={n}>{n}</option>)}
                  </select>
                </div>
                <div>
                  <label style={{ fontSize: 9, fontWeight: 700, color: '#9CA3AF', textTransform: 'uppercase', letterSpacing: '0.07em', display: 'block', marginBottom: 3 }}>Platform</label>
                  <select value={post.platform} onChange={e => patchPost(post.id, { platform: e.target.value })} style={{ ...SEL, fontSize: 12 }}>
                    {PLATFORMS.map(p => <option key={p}>{p}</option>)}
                  </select>
                </div>
                <div>
                  <label style={{ fontSize: 9, fontWeight: 700, color: '#9CA3AF', textTransform: 'uppercase', letterSpacing: '0.07em', display: 'block', marginBottom: 3 }}>Type</label>
                  <select value={post.post_type} onChange={e => patchPost(post.id, { post_type: e.target.value })} style={{ ...SEL, fontSize: 12 }}>
                    {POST_TYPES.map(t => <option key={t}>{t}</option>)}
                  </select>
                </div>
                <div>
                  <label style={{ fontSize: 9, fontWeight: 700, color: '#9CA3AF', textTransform: 'uppercase', letterSpacing: '0.07em', display: 'block', marginBottom: 3 }}>Post Link</label>
                  <input type="url" placeholder="https://…" value={post.post_link} onChange={e => patchPost(post.id, { post_link: e.target.value })} style={{ ...INP, fontSize: 12 }} />
                </div>
                <button onClick={() => removePost(post.id)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#9CA3AF', padding: '0 4px', marginBottom: 2 }}>
                  <Trash2 size={14} />
                </button>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Error */}
      {error && (
        <div style={{ background: 'rgba(239,68,68,0.06)', border: '1px solid rgba(239,68,68,0.2)', borderRadius: 10, padding: '10px 14px', marginBottom: 16 }}>
          <p style={{ fontSize: 12, color: '#EF4444', margin: 0, fontWeight: 600 }}>{error}</p>
        </div>
      )}

      {/* Submit */}
      <button
        onClick={handleSubmit}
        disabled={isPending}
        style={{
          width: '100%', padding: '14px 0', borderRadius: 14, border: 'none',
          background: isPending ? '#9CA3AF' : '#DE1A1A', color: '#FFF',
          fontSize: 15, fontWeight: 800, cursor: isPending ? 'not-allowed' : 'pointer',
          display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
          fontFamily: 'var(--font-jakarta)', boxShadow: isPending ? 'none' : '0 4px 16px rgba(222,26,26,0.35)',
        }}>
        {isPending ? <><Loader2 size={16} className="animate-spin" /> Submitting…</> : 'Submit Update'}
      </button>

    </div>
  )
}
```

- [ ] **Step 2: TypeScript check — expect clean**

```bash
cd "s:/VS CODE USING CODEX/GROFAST GROWTH MARKETING AND AI SOLUTIOn" && pnpm typecheck 2>&1 | grep "error TS" | head -10
```

Expected: no output.

- [ ] **Step 3: Commit**

```bash
cd "s:/VS CODE USING CODEX/GROFAST GROWTH MARKETING AND AI SOLUTIOn" && git add app/member/update/activity-update-form.tsx && git commit -m "feat: activity-based daily update form for members"
```

---

## Task 6: Admin Insights Page

**Files:**
- Create: `app/admin/insights/page.tsx`
- Create: `app/admin/insights/insights-client.tsx`
- Modify: `components/admin/sidebar.tsx`

- [ ] **Step 1: Create the server page**

Create `app/admin/insights/page.tsx`:

```typescript
export const dynamic = 'force-dynamic'

import { createServerClient } from '@/lib/supabase/server'
import { createClient } from '@supabase/supabase-js'
import { redirect } from 'next/navigation'
import InsightsClient from './insights-client'

function adminClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  )
}

export default async function InsightsPage({
  searchParams,
}: {
  searchParams: Promise<{ month?: string }>
}) {
  const { month: rawMonth } = await searchParams
  const today = new Date()
  const month = rawMonth ?? `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}`
  const [year, mon] = month.split('-').map(Number)
  const dateFrom = `${month}-01`
  const dateTo   = new Date(year, mon, 0).toISOString().split('T')[0]

  const supabase = await createServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const admin = adminClient()
  const { data: profile } = await admin.from('users').select('company_id, role').eq('id', user.id).single()
  if (!profile) redirect('/login')
  if (profile.role !== 'ADMIN') redirect('/member/dashboard')
  const cid = profile.company_id

  const [
    { data: workLogsRaw },
    { data: postsRaw },
    { data: activitiesRaw },
    { data: usersRaw },
  ] = await Promise.all([
    admin.from('work_logs')
      .select('user_id, activity_id, client_name, hours, unit_count, cost, date')
      .eq('company_id', cid).gte('date', dateFrom).lte('date', dateTo),
    admin.from('content_posts')
      .select('user_id, client_name, platform, post_type, date')
      .eq('company_id', cid).gte('date', dateFrom).lte('date', dateTo),
    admin.from('activities')
      .select('id, name, team_category, unit_type, emoji')
      .eq('company_id', cid).eq('is_active', true).order('sort_order'),
    admin.from('users')
      .select('id, name, employee_id, team, monthly_salary, hourly_rate')
      .eq('company_id', cid).eq('role', 'MEMBER').eq('status', 'active').order('name'),
  ])

  const logs      = (workLogsRaw    ?? []) as any[]
  const posts     = (postsRaw       ?? []) as any[]
  const activities= (activitiesRaw  ?? []) as any[]
  const members   = (usersRaw       ?? []) as any[]

  const actMap: Record<string, { name: string; team_category: string; unit_type: string; emoji: string }> = {}
  for (const a of activities) actMap[a.id] = a

  const userMap: Record<string, { name: string; employee_id: string }> = {}
  for (const u of members) userMap[u.id] = u

  // ── Team hours breakdown ──────────────────────────────────────────────────
  const teamHours: Record<string, number> = { MEDIA: 0, META: 0, CREATIVE: 0, AI: 0, OPS: 0 }
  for (const l of logs) {
    const cat = actMap[l.activity_id]?.team_category
    if (cat && teamHours[cat] != null) teamHours[cat] += l.hours
  }

  // ── Activity breakdown ────────────────────────────────────────────────────
  const activityStats: Record<string, { name: string; emoji: string; team: string; hours: number; count: number; cost: number }> = {}
  for (const l of logs) {
    const act = actMap[l.activity_id]
    if (!act) continue
    if (!activityStats[l.activity_id]) activityStats[l.activity_id] = { name: act.name, emoji: act.emoji, team: act.team_category, hours: 0, count: 0, cost: 0 }
    activityStats[l.activity_id].hours += l.hours
    activityStats[l.activity_id].count += l.unit_count
    activityStats[l.activity_id].cost  += l.cost
  }

  // ── Member performance ────────────────────────────────────────────────────
  const memberStats: Record<string, { name: string; employee_id: string; hours: number; cost: number; activities: number }> = {}
  for (const l of logs) {
    const u = userMap[l.user_id]
    if (!u) continue
    if (!memberStats[l.user_id]) memberStats[l.user_id] = { name: u.name, employee_id: u.employee_id, hours: 0, cost: 0, activities: 0 }
    memberStats[l.user_id].hours      += l.hours
    memberStats[l.user_id].cost       += l.cost
    memberStats[l.user_id].activities += 1
  }

  // ── Client hours ─────────────────────────────────────────────────────────
  const clientStats: Record<string, { name: string; hours: number; cost: number }> = {}
  for (const l of logs) {
    const cn = l.client_name ?? 'Unassigned'
    if (!clientStats[cn]) clientStats[cn] = { name: cn, hours: 0, cost: 0 }
    clientStats[cn].hours += l.hours
    clientStats[cn].cost  += l.cost
  }

  // ── Post summary ──────────────────────────────────────────────────────────
  const postsByType: Record<string, number> = {}
  const postsByPlatform: Record<string, number> = {}
  for (const p of posts) {
    postsByType[p.post_type]         = (postsByType[p.post_type] ?? 0) + 1
    postsByPlatform[p.platform]      = (postsByPlatform[p.platform] ?? 0) + 1
  }

  // ── KPIs ─────────────────────────────────────────────────────────────────
  const totalHours = logs.reduce((s: number, l: any) => s + l.hours, 0)
  const totalCost  = logs.reduce((s: number, l: any) => s + l.cost, 0)
  const totalVideos   = logs.filter((l: any) => actMap[l.activity_id]?.name === 'Video Edit').reduce((s: number, l: any) => s + l.unit_count, 0)
  const totalPosters  = logs.filter((l: any) => actMap[l.activity_id]?.name === 'Poster Design').reduce((s: number, l: any) => s + l.unit_count, 0)
  const totalPosts    = posts.length

  return (
    <InsightsClient
      month={month}
      today={today.toISOString().split('T')[0]}
      teamHours={teamHours}
      activityStats={Object.values(activityStats).sort((a, b) => b.hours - a.hours)}
      memberStats={Object.values(memberStats).sort((a, b) => b.hours - a.hours)}
      clientStats={Object.values(clientStats).sort((a, b) => b.hours - a.hours)}
      postsByType={postsByType}
      postsByPlatform={postsByPlatform}
      recentPosts={posts.slice(0, 20).map((p: any) => ({ ...p, memberName: userMap[p.user_id]?.name ?? 'Unknown' }))}
      kpis={{ totalHours, totalCost, totalVideos, totalPosters, totalPosts }}
    />
  )
}
```

- [ ] **Step 2: Create the insights client component**

Create `app/admin/insights/insights-client.tsx`:

```typescript
'use client'

import { useRouter } from 'next/navigation'

const TEAM_CFG: Record<string, { label: string; color: string; emoji: string }> = {
  MEDIA:    { label: 'Media & Video',    color: '#E53935', emoji: '🎬' },
  META:     { label: 'Meta & Marketing', color: '#F59E0B', emoji: '📊' },
  CREATIVE: { label: 'Creative Design',  color: '#8B5CF6', emoji: '🎨' },
  AI:       { label: 'AI & Tech',        color: '#10B981', emoji: '🤖' },
  OPS:      { label: 'Operations',       color: '#3B82F6', emoji: '📱' },
}
const TEAM_ORDER = ['MEDIA', 'META', 'CREATIVE', 'AI', 'OPS']

function fmtRupee(n: number) { return `₹${Math.round(n).toLocaleString('en-IN')}` }
function fmtH(h: number) { return `${h.toFixed(1)}h` }
function ini(n: string) { return n.split(' ').map(w => w[0] ?? '').join('').slice(0, 2).toUpperCase() }

function KPICard({ label, value, sub, emoji, color }: { label: string; value: string; sub?: string; emoji: string; color: string }) {
  return (
    <div style={{ background: '#FFFFFF', borderRadius: 14, border: `1px solid ${color}22`, padding: '16px 18px', flex: 1, minWidth: 130 }}>
      <div style={{ fontSize: 22, marginBottom: 6 }}>{emoji}</div>
      <p style={{ fontSize: 26, fontWeight: 900, color, margin: '0 0 2px', fontFamily: 'var(--font-jakarta)', lineHeight: 1 }}>{value}</p>
      <p style={{ fontSize: 11, color: '#6B7280', margin: 0, fontWeight: 500 }}>{label}</p>
      {sub && <p style={{ fontSize: 10, color: '#9CA3AF', margin: '2px 0 0' }}>{sub}</p>}
    </div>
  )
}

export default function InsightsClient({
  month, today,
  teamHours, activityStats, memberStats, clientStats,
  postsByType, postsByPlatform, recentPosts, kpis,
}: {
  month: string
  today: string
  teamHours: Record<string, number>
  activityStats: Array<{ name: string; emoji: string; team: string; hours: number; count: number; cost: number }>
  memberStats: Array<{ name: string; employee_id: string; hours: number; cost: number; activities: number }>
  clientStats: Array<{ name: string; hours: number; cost: number }>
  postsByType: Record<string, number>
  postsByPlatform: Record<string, number>
  recentPosts: Array<{ memberName: string; client_name: string; platform: string; post_type: string; date: string }>
  kpis: { totalHours: number; totalCost: number; totalVideos: number; totalPosters: number; totalPosts: number }
}) {
  const router = useRouter()
  const maxTeamHours = Math.max(...Object.values(teamHours), 1)

  return (
    <div style={{ padding: '20px 16px 48px', background: '#F8F9FB', minHeight: '100vh' }} className="sm:px-7">

      {/* ── Header ───────────────────────────────────────────────────────── */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20, flexWrap: 'wrap', gap: 12 }}>
        <div>
          <h1 style={{ fontSize: 24, fontWeight: 900, color: '#111827', margin: 0, fontFamily: 'var(--font-jakarta)' }}>
            Work Insights
          </h1>
          <p style={{ fontSize: 12, color: '#9CA3AF', margin: '2px 0 0' }}>Activity-based breakdown for your team</p>
        </div>
        <input
          type="month"
          value={month}
          max={today.slice(0, 7)}
          onChange={e => router.push(`/admin/insights?month=${e.target.value}`)}
          style={{ padding: '8px 12px', borderRadius: 10, border: '1.5px solid #E5E7EB', fontSize: 13, fontWeight: 600, color: '#111827', background: '#FFFFFF', outline: 'none', cursor: 'pointer' }}
        />
      </div>

      {/* ── KPI row ──────────────────────────────────────────────────────── */}
      <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', marginBottom: 20 }}>
        <KPICard label="Total Hours"    value={fmtH(kpis.totalHours)}   emoji="⏱️" color="#3B82F6" />
        <KPICard label="Videos Edited"  value={String(kpis.totalVideos)} emoji="🎬" color="#E53935" />
        <KPICard label="Posters Made"   value={String(kpis.totalPosters)}emoji="🖼️" color="#8B5CF6" />
        <KPICard label="Posts Published"value={String(kpis.totalPosts)}  emoji="📱" color="#10B981" />
        <KPICard label="Team Cost"      value={fmtRupee(kpis.totalCost)} emoji="💰" color="#F59E0B" sub="based on salaries" />
      </div>

      {/* ── Two column layout ─────────────────────────────────────────────── */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }} className="grid-cols-1 lg:grid-cols-2">

        {/* Team Hours Breakdown */}
        <div style={{ background: '#FFFFFF', borderRadius: 16, border: '1px solid #EBEDF2', padding: '18px 20px', boxShadow: '0 2px 8px rgba(0,0,0,0.04)' }}>
          <p style={{ fontSize: 14, fontWeight: 800, color: '#111827', margin: '0 0 16px', fontFamily: 'var(--font-jakarta)' }}>Team Hours This Month</p>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            {TEAM_ORDER.map(tc => {
              const cfg = TEAM_CFG[tc]
              const hrs = teamHours[tc] ?? 0
              const pct = Math.max(4, Math.round((hrs / maxTeamHours) * 100))
              return (
                <div key={tc}>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 4 }}>
                    <span style={{ fontSize: 12, fontWeight: 600, color: '#374151' }}>{cfg.emoji} {cfg.label}</span>
                    <span style={{ fontSize: 13, fontWeight: 800, color: cfg.color, fontFamily: 'var(--font-jakarta)' }}>{fmtH(hrs)}</span>
                  </div>
                  <div style={{ height: 8, background: '#F3F4F6', borderRadius: 4, overflow: 'hidden' }}>
                    <div style={{ width: `${pct}%`, height: '100%', background: cfg.color, borderRadius: 4, transition: 'width 0.5s' }} />
                  </div>
                </div>
              )
            })}
          </div>
        </div>

        {/* Activity Breakdown */}
        <div style={{ background: '#FFFFFF', borderRadius: 16, border: '1px solid #EBEDF2', overflow: 'hidden', boxShadow: '0 2px 8px rgba(0,0,0,0.04)' }}>
          <p style={{ fontSize: 14, fontWeight: 800, color: '#111827', margin: 0, padding: '18px 20px 12px', fontFamily: 'var(--font-jakarta)' }}>Activity Breakdown</p>
          <div style={{ overflowY: 'auto', maxHeight: 280 }}>
            {activityStats.length === 0 ? (
              <p style={{ fontSize: 12, color: '#9CA3AF', textAlign: 'center', padding: '24px 0' }}>No activity data yet</p>
            ) : activityStats.map((a, i) => {
              const cfg = TEAM_CFG[a.team]
              return (
                <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 20px', borderBottom: '1px solid #F9FAFB' }}>
                  <span style={{ fontSize: 16, flexShrink: 0 }}>{a.emoji}</span>
                  <span style={{ fontSize: 13, fontWeight: 600, color: '#374151', flex: 1 }}>{a.name}</span>
                  {a.count > 0 && <span style={{ fontSize: 11, fontWeight: 700, color: cfg.color, background: `${cfg.color}10`, padding: '2px 8px', borderRadius: 5 }}>{a.count} units</span>}
                  <span style={{ fontSize: 12, color: '#6B7280', minWidth: 40, textAlign: 'right' }}>{fmtH(a.hours)}</span>
                  <span style={{ fontSize: 12, fontWeight: 700, color: '#111827', minWidth: 60, textAlign: 'right', fontFamily: 'var(--font-jakarta)' }}>{fmtRupee(a.cost)}</span>
                </div>
              )
            })}
          </div>
        </div>

        {/* Member Performance */}
        <div style={{ background: '#FFFFFF', borderRadius: 16, border: '1px solid #EBEDF2', overflow: 'hidden', boxShadow: '0 2px 8px rgba(0,0,0,0.04)' }}>
          <p style={{ fontSize: 14, fontWeight: 800, color: '#111827', margin: 0, padding: '18px 20px 12px', fontFamily: 'var(--font-jakarta)' }}>Member Performance</p>
          {memberStats.length === 0 ? (
            <p style={{ fontSize: 12, color: '#9CA3AF', textAlign: 'center', padding: '24px 0' }}>No member data yet</p>
          ) : memberStats.map((m, i) => (
            <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '10px 20px', borderBottom: '1px solid #F9FAFB' }}>
              <div style={{ width: 32, height: 32, borderRadius: '50%', background: 'rgba(222,26,26,0.08)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                <span style={{ fontSize: 10, fontWeight: 800, color: '#DE1A1A' }}>{ini(m.name)}</span>
              </div>
              <div style={{ flex: 1 }}>
                <p style={{ fontSize: 13, fontWeight: 600, color: '#111827', margin: 0 }}>{m.name}</p>
                <p style={{ fontSize: 10, color: '#9CA3AF', margin: 0 }}>#{m.employee_id} · {m.activities} activities</p>
              </div>
              <div style={{ textAlign: 'right' }}>
                <p style={{ fontSize: 13, fontWeight: 800, color: '#3B82F6', margin: 0, fontFamily: 'var(--font-jakarta)' }}>{fmtH(m.hours)}</p>
                <p style={{ fontSize: 11, color: '#DE1A1A', margin: 0, fontWeight: 600 }}>{fmtRupee(m.cost)}</p>
              </div>
            </div>
          ))}
        </div>

        {/* Client Hours */}
        <div style={{ background: '#FFFFFF', borderRadius: 16, border: '1px solid #EBEDF2', overflow: 'hidden', boxShadow: '0 2px 8px rgba(0,0,0,0.04)' }}>
          <p style={{ fontSize: 14, fontWeight: 800, color: '#111827', margin: 0, padding: '18px 20px 12px', fontFamily: 'var(--font-jakarta)' }}>Client Hours & Cost</p>
          {clientStats.length === 0 ? (
            <p style={{ fontSize: 12, color: '#9CA3AF', textAlign: 'center', padding: '24px 0' }}>No client data yet</p>
          ) : clientStats.map((c, i) => (
            <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '10px 20px', borderBottom: '1px solid #F9FAFB' }}>
              <div style={{ width: 32, height: 32, borderRadius: 10, background: 'rgba(99,102,241,0.08)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                <span style={{ fontSize: 10, fontWeight: 800, color: '#6366F1' }}>{ini(c.name)}</span>
              </div>
              <p style={{ fontSize: 13, fontWeight: 600, color: '#374151', flex: 1, margin: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{c.name}</p>
              <p style={{ fontSize: 12, color: '#6B7280', margin: 0, flexShrink: 0 }}>{fmtH(c.hours)}</p>
              <p style={{ fontSize: 13, fontWeight: 800, color: '#111827', margin: 0, flexShrink: 0, fontFamily: 'var(--font-jakarta)' }}>{fmtRupee(c.cost)}</p>
            </div>
          ))}
        </div>

      </div>

      {/* ── Posts Section ─────────────────────────────────────────────────── */}
      {(Object.keys(postsByType).length > 0 || recentPosts.length > 0) && (
        <div style={{ marginTop: 16, background: '#FFFFFF', borderRadius: 16, border: '1px solid #EBEDF2', overflow: 'hidden', boxShadow: '0 2px 8px rgba(0,0,0,0.04)' }}>
          <div style={{ padding: '18px 20px 12px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', borderBottom: '1px solid #F3F4F6' }}>
            <p style={{ fontSize: 14, fontWeight: 800, color: '#111827', margin: 0, fontFamily: 'var(--font-jakarta)' }}>📱 Posts Published</p>
            <div style={{ display: 'flex', gap: 8 }}>
              {Object.entries(postsByType).map(([type, count]) => (
                <span key={type} style={{ fontSize: 11, fontWeight: 700, padding: '3px 10px', borderRadius: 8, background: 'rgba(16,185,129,0.08)', color: '#10B981' }}>
                  {type}: {count}
                </span>
              ))}
            </div>
          </div>
          <div style={{ maxHeight: 300, overflowY: 'auto' }}>
            {recentPosts.map((p, i) => (
              <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '9px 20px', borderBottom: '1px solid #F9FAFB' }}>
                <span style={{ fontSize: 11, color: '#9CA3AF', minWidth: 80, flexShrink: 0 }}>
                  {new Date(p.date + 'T12:00:00').toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })}
                </span>
                <span style={{ fontSize: 12, fontWeight: 600, color: '#374151', flex: 1 }}>{p.memberName}</span>
                {p.client_name && <span style={{ fontSize: 11, color: '#6B7280' }}>{p.client_name}</span>}
                <span style={{ fontSize: 10, fontWeight: 700, padding: '2px 7px', borderRadius: 5, background: 'rgba(59,130,246,0.08)', color: '#3B82F6' }}>{p.platform}</span>
                <span style={{ fontSize: 10, fontWeight: 700, padding: '2px 7px', borderRadius: 5, background: 'rgba(16,185,129,0.08)', color: '#10B981' }}>{p.post_type}</span>
              </div>
            ))}
          </div>
        </div>
      )}

    </div>
  )
}
```

- [ ] **Step 3: Add Insights to the admin sidebar**

In `components/admin/sidebar.tsx`, find the `NAV_ITEMS` array and add the Insights link after the Reports link:

Find:
```typescript
  { label: "Reports",       href: "/admin/reports",       icon: BarChart2 },
```

Add after it:
```typescript
  { label: "Insights",      href: "/admin/insights",      icon: TrendingUp },
```

Also add `TrendingUp` to the lucide-react import at the top of the file.

- [ ] **Step 4: TypeScript check — all clean**

```bash
cd "s:/VS CODE USING CODEX/GROFAST GROWTH MARKETING AND AI SOLUTIOn" && pnpm typecheck 2>&1 | grep "error TS" | head -10
```

Expected: no output.

- [ ] **Step 5: Commit**

```bash
cd "s:/VS CODE USING CODEX/GROFAST GROWTH MARKETING AND AI SOLUTIOn" && git add app/admin/insights/ components/admin/sidebar.tsx && git commit -m "feat: admin insights page — team hours, activities, members, clients, posts"
```

---

## Task 7: Final Build Check + Push

- [ ] **Step 1: Full build**

```bash
cd "s:/VS CODE USING CODEX/GROFAST GROWTH MARKETING AND AI SOLUTIOn" && pnpm build 2>&1 | grep -E "Error|error" | grep -v node_modules | head -10
```

Expected: no errors.

- [ ] **Step 2: Push**

```bash
cd "s:/VS CODE USING CODEX/GROFAST GROWTH MARKETING AND AI SOLUTIOn" && git push
```

---

## Self-Review

**Spec coverage:**

| Requirement | Task |
|---|---|
| Videos edited per month | Task 6 — KPI chip + activity breakdown (Video Edit, unit_count) |
| Hours of shooting | Task 6 — activity breakdown (Video Shoot, hours) |
| Meta team hours | Task 6 — team hours breakdown (META) |
| AI team hours | Task 6 — team hours breakdown (AI) |
| Creative team hours | Task 6 — team hours breakdown (CREATIVE) |
| Posters made | Task 6 — KPI chip + activity breakdown (Poster Design) |
| Posts published | Task 6 — posts section with platform/type breakdown |
| Who posted on which day | Task 6 — recentPosts table |
| Per-member cost (salary-based) | Task 3 — cost = hours × (salary÷25÷9) saved in work_logs.cost |
| Activity-based form (Step 1 + Step 2) | Task 5 — activity picker + detail cards |
| Activity Master (20 default activities) | Task 2 — seed migration |
| DB schema | Task 1 — activities + work_logs + content_posts |

All requirements covered. No TBDs.
