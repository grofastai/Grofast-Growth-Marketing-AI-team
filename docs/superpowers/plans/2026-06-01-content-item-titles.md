# Content Item Titles Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Capture the title of each individual video/poster/post so admins can see exactly what was produced each day, not just how many.

**Architecture:** Two new DB columns (`work_logs.item_titles text[]`, `content_posts.title text`). The member form replaces the plain count input with a dynamic titled-item list for count-type activities, and gains a title field per post row. The admin Insights Activity Breakdown card shows collected titles inline.

**Tech Stack:** Next.js 15 App Router, Supabase (Postgres), TypeScript strict, inline styles (no Tailwind in JSX), Server Actions, pnpm.

---

## File Map

| File | Action |
|---|---|
| `supabase/migrations/052_content_item_titles.sql` | **Create** — DB migration |
| `lib/actions/work-logs.ts` | **Modify** — add `item_titles` / `title` to types + inserts + `getWorkLogsForDate` return |
| `app/member/update/activity-update-form.tsx` | **Modify** — replace count input with titled-item list; add title field to posts |
| `app/admin/insights/page.tsx` | **Modify** — select `item_titles` from work_logs; aggregate titles per activity; pass to client |
| `app/admin/insights/insights-client.tsx` | **Modify** — show titles in Activity Breakdown card |

---

## Task 1: DB Migration

**Files:**
- Create: `supabase/migrations/052_content_item_titles.sql`

- [ ] **Step 1: Create the migration file**

Create `supabase/migrations/052_content_item_titles.sql` with this exact content:

```sql
-- Item titles for count-based work log entries.
-- Each element is the title of one produced item (video, poster, reel, etc.).
-- Empty array = legacy row, no titles recorded.
ALTER TABLE work_logs
  ADD COLUMN IF NOT EXISTS item_titles text[] NOT NULL DEFAULT '{}';

-- Optional title for each published post.
ALTER TABLE content_posts
  ADD COLUMN IF NOT EXISTS title text;
```

- [ ] **Step 2: Run in Supabase SQL Editor**

Open Supabase → SQL Editor → paste and run the file content.
Expected: no errors. `work_logs` now has `item_titles`, `content_posts` has `title`.

- [ ] **Step 3: Commit**

```bash
cd "s:/VS CODE USING CODEX/GROFAST GROWTH MARKETING AND AI SOLUTIOn" && git add supabase/migrations/052_content_item_titles.sql && git commit -m "feat: add item_titles to work_logs and title to content_posts"
```

---

## Task 2: Server Actions — types + insert + fetch

**Files:**
- Modify: `lib/actions/work-logs.ts`

- [ ] **Step 1: Update `WorkLogInput` to include `item_titles`**

Find:
```typescript
export type WorkLogInput = {
  activity_id: string
  client_name: string
  hours: number
  unit_count: number
  notes: string
}
```

Replace with:
```typescript
export type WorkLogInput = {
  activity_id: string
  client_name: string
  hours: number
  unit_count: number
  item_titles: string[]
  notes: string
}
```

- [ ] **Step 2: Update `ContentPostInput` to include `title`**

Find:
```typescript
export type ContentPostInput = {
  client_name: string
  platform: string
  post_type: string
  post_link: string
  notes: string
}
```

Replace with:
```typescript
export type ContentPostInput = {
  title: string
  client_name: string
  platform: string
  post_type: string
  post_link: string
  notes: string
}
```

- [ ] **Step 3: Include `item_titles` in the work_logs insert**

Find the `.map(l => ({` block inside `submitWorkLogs`:
```typescript
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
```

Replace with:
```typescript
      .map(l => ({
        company_id:  cid,
        user_id:     user.id,
        date,
        activity_id: l.activity_id,
        client_name: l.client_name || null,
        hours:       l.hours,
        unit_count:  l.unit_count,
        item_titles: l.item_titles.filter(t => t.trim() !== ''),
        notes:       l.notes || null,
        cost:        Math.round(hourlyRate * l.hours * 100) / 100,
      }))
```

- [ ] **Step 4: Include `title` in the content_posts insert**

Find the posts `.map(p => ({` block:
```typescript
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
```

Replace with:
```typescript
      .map(p => ({
        company_id:  cid,
        user_id:     user.id,
        date,
        title:       p.title || null,
        client_name: p.client_name || null,
        platform:    p.platform,
        post_type:   p.post_type,
        post_link:   p.post_link || null,
        notes:       p.notes || null,
      }))
```

- [ ] **Step 5: Update `getWorkLogsForDate` to return `item_titles` and `title`**

Find the select call for work_logs:
```typescript
    admin.from('work_logs')
      .select('activity_id, client_name, hours, unit_count, notes')
      .eq('user_id', user.id).eq('date', date).eq('company_id', profile.company_id),
```

Replace with:
```typescript
    admin.from('work_logs')
      .select('activity_id, client_name, hours, unit_count, item_titles, notes')
      .eq('user_id', user.id).eq('date', date).eq('company_id', profile.company_id),
```

Find the select call for content_posts:
```typescript
    admin.from('content_posts')
      .select('client_name, platform, post_type, post_link, notes')
      .eq('user_id', user.id).eq('date', date).eq('company_id', profile.company_id),
```

Replace with:
```typescript
    admin.from('content_posts')
      .select('title, client_name, platform, post_type, post_link, notes')
      .eq('user_id', user.id).eq('date', date).eq('company_id', profile.company_id),
```

Find the return type annotation:
```typescript
export async function getWorkLogsForDate(date: string): Promise<{
  logs: Array<{ activity_id: string; client_name: string | null; hours: number; unit_count: number; notes: string | null }>
  posts: Array<{ client_name: string | null; platform: string; post_type: string; post_link: string | null; notes: string | null }>
}>
```

Replace with:
```typescript
export async function getWorkLogsForDate(date: string): Promise<{
  logs: Array<{ activity_id: string; client_name: string | null; hours: number; unit_count: number; item_titles: string[]; notes: string | null }>
  posts: Array<{ title: string | null; client_name: string | null; platform: string; post_type: string; post_link: string | null; notes: string | null }>
}>
```

Find the return statement's type cast for logs:
```typescript
    logs:  (logs  ?? []) as Array<{ activity_id: string; client_name: string | null; hours: number; unit_count: number; notes: string | null }>,
    posts: (posts ?? []) as Array<{ client_name: string | null; platform: string; post_type: string; post_link: string | null; notes: string | null }>,
```

Replace with:
```typescript
    logs:  (logs  ?? []) as Array<{ activity_id: string; client_name: string | null; hours: number; unit_count: number; item_titles: string[]; notes: string | null }>,
    posts: (posts ?? []) as Array<{ title: string | null; client_name: string | null; platform: string; post_type: string; post_link: string | null; notes: string | null }>,
```

- [ ] **Step 6: TypeScript check**

```bash
cd "s:/VS CODE USING CODEX/GROFAST GROWTH MARKETING AND AI SOLUTIOn" && pnpm typecheck 2>&1 | grep "error TS" | head -10
```

Expected: errors about `item_titles` / `title` missing in callers — fixed in Task 3. If you see other unexpected errors, fix them before continuing.

- [ ] **Step 7: Commit**

```bash
cd "s:/VS CODE USING CODEX/GROFAST GROWTH MARKETING AND AI SOLUTIOn" && git add lib/actions/work-logs.ts && git commit -m "feat: add item_titles and title to work-logs server action types"
```

---

## Task 3: Member Form — state types + logic

**Files:**
- Modify: `app/member/update/activity-update-form.tsx`

This task updates the data model inside the form. No JSX changes yet (those are Task 4).

- [ ] **Step 1: Update `LogState` type — replace `unit_count` with `item_titles`**

Find:
```typescript
type LogState = {
  activity_id: string
  client_name: string
  hours: string
  unit_count: string
  notes: string
}
```

Replace with:
```typescript
type LogState = {
  activity_id: string
  client_name: string
  hours: string
  item_titles: string[]   // one entry per produced item; length = unit_count
  notes: string
}
```

- [ ] **Step 2: Update `PostState` type — add `title`**

Find:
```typescript
type PostState = {
  id: string
  client_name: string
  platform: string
  post_type: string
  post_link: string
  notes: string
}
```

Replace with:
```typescript
type PostState = {
  id: string
  title: string
  client_name: string
  platform: string
  post_type: string
  post_link: string
  notes: string
}
```

- [ ] **Step 3: Update `emptyPost()` to include `title`**

Find:
```typescript
function emptyPost(): PostState {
  return {
    id: crypto.randomUUID(),
    client_name: '', platform: 'Instagram', post_type: 'Reel',
    post_link: '', notes: '',
  }
}
```

Replace with:
```typescript
function emptyPost(): PostState {
  return {
    id: crypto.randomUUID(),
    title: '', client_name: '', platform: 'Instagram', post_type: 'Reel',
    post_link: '', notes: '',
  }
}
```

- [ ] **Step 4: Update the component prop types — `existingLogs` and `existingPosts`**

Find:
```typescript
  existingLogs: Array<{ activity_id: string; client_name: string | null; hours: number; unit_count: number; notes: string | null }>
  existingPosts: Array<{ client_name: string | null; platform: string; post_type: string; post_link: string | null; notes: string | null }>
```

Replace with:
```typescript
  existingLogs: Array<{ activity_id: string; client_name: string | null; hours: number; unit_count: number; item_titles: string[]; notes: string | null }>
  existingPosts: Array<{ title: string | null; client_name: string | null; platform: string; post_type: string; post_link: string | null; notes: string | null }>
```

- [ ] **Step 5: Update `logs` state initializer to use `item_titles`**

Find the `logs` useState initializer:
```typescript
  const [logs, setLogs] = useState<Record<string, LogState>>(() => {
    const m: Record<string, LogState> = {}
    for (const l of existingLogs) {
      m[l.activity_id] = {
        activity_id: l.activity_id,
        client_name: l.client_name ?? '',
        hours:       l.hours > 0      ? String(l.hours)      : '',
        unit_count:  l.unit_count > 0 ? String(l.unit_count) : '',
        notes:       l.notes ?? '',
      }
    }
    return m
  })
```

Replace with:
```typescript
  const [logs, setLogs] = useState<Record<string, LogState>>(() => {
    const m: Record<string, LogState> = {}
    for (const l of existingLogs) {
      // Restore item_titles if present; otherwise synthesise N blank titles from unit_count
      const titles = l.item_titles?.length > 0
        ? l.item_titles
        : l.unit_count > 0 ? Array(l.unit_count).fill('') : ['']
      m[l.activity_id] = {
        activity_id: l.activity_id,
        client_name: l.client_name ?? '',
        hours:       l.hours > 0 ? String(l.hours) : '',
        item_titles: titles,
        notes:       l.notes ?? '',
      }
    }
    return m
  })
```

- [ ] **Step 6: Update `posts` state initializer to include `title`**

Find:
```typescript
  const [posts, setPosts] = useState<PostState[]>(() =>
    existingPosts.length > 0
      ? existingPosts.map(p => ({
          id: crypto.randomUUID(),
          client_name: p.client_name ?? '',
          platform: p.platform, post_type: p.post_type,
          post_link: p.post_link ?? '', notes: p.notes ?? '',
        }))
      : []
  )
```

Replace with:
```typescript
  const [posts, setPosts] = useState<PostState[]>(() =>
    existingPosts.length > 0
      ? existingPosts.map(p => ({
          id: crypto.randomUUID(),
          title: p.title ?? '',
          client_name: p.client_name ?? '',
          platform: p.platform, post_type: p.post_type,
          post_link: p.post_link ?? '', notes: p.notes ?? '',
        }))
      : []
  )
```

- [ ] **Step 7: Update `toggleActivity` to initialise `item_titles`**

Find inside `toggleActivity`:
```typescript
        setLogs(l => ({ ...l, [id]: { activity_id: id, client_name: '', hours: '', unit_count: '', notes: '' } }))
```

Replace with:
```typescript
        setLogs(l => ({ ...l, [id]: { activity_id: id, client_name: '', hours: '', item_titles: [''], notes: '' } }))
```

- [ ] **Step 8: Update `handleSubmit` to map `item_titles` → `WorkLogInput`**

Find:
```typescript
    const logInputs: WorkLogInput[] = Object.values(logs)
      .filter(l => selected.has(l.activity_id))
      .map(l => ({
        activity_id: l.activity_id,
        client_name: l.client_name,
        hours:       parseFloat(l.hours)    || 0,
        unit_count:  parseInt(l.unit_count) || 0,
        notes:       l.notes,
      }))
    const postInputs: ContentPostInput[] = posts
      .filter(p => p.platform && p.post_type)
      .map(p => ({
        client_name: p.client_name, platform: p.platform,
        post_type: p.post_type, post_link: p.post_link, notes: p.notes,
      }))
```

Replace with:
```typescript
    const logInputs: WorkLogInput[] = Object.values(logs)
      .filter(l => selected.has(l.activity_id))
      .map(l => {
        const filledTitles = l.item_titles.filter(t => t.trim() !== '')
        return {
          activity_id: l.activity_id,
          client_name: l.client_name,
          hours:       parseFloat(l.hours) || 0,
          unit_count:  filledTitles.length || 0,
          item_titles: filledTitles,
          notes:       l.notes,
        }
      })
    const postInputs: ContentPostInput[] = posts
      .filter(p => p.platform && p.post_type)
      .map(p => ({
        title: p.title, client_name: p.client_name, platform: p.platform,
        post_type: p.post_type, post_link: p.post_link, notes: p.notes,
      }))
```

- [ ] **Step 9: TypeScript check**

```bash
cd "s:/VS CODE USING CODEX/GROFAST GROWTH MARKETING AND AI SOLUTIOn" && pnpm typecheck 2>&1 | grep "error TS" | head -10
```

Expected: errors about JSX still referencing `unit_count` — those are in Task 4. If you see errors beyond JSX, fix them now.

- [ ] **Step 10: Commit**

```bash
cd "s:/VS CODE USING CODEX/GROFAST GROWTH MARKETING AND AI SOLUTIOn" && git add app/member/update/activity-update-form.tsx && git commit -m "feat: update LogState/PostState types and handleSubmit for item titles"
```

---

## Task 4: Member Form — JSX

**Files:**
- Modify: `app/member/update/activity-update-form.tsx`

Replace the count input UI with a dynamic titled-item list, and add a title field to each post row.

- [ ] **Step 1: Replace count input with titled-item list in the activity detail card**

In the Step 2 detail cards section, find the count input block:

```typescript
                    {(act.unit_type === 'count' || act.unit_type === 'both') && (
                        <div style={{ flex: 1, minWidth: 120 }}>
                          <label style={{ fontSize: 10, fontWeight: 700, color: '#6B7280', textTransform: 'uppercase', letterSpacing: '0.07em', display: 'block', marginBottom: 5 }}>
                            <Hash size={10} style={{ display: 'inline', marginRight: 3 }} />{unitLabel(act)}
                          </label>
                          <input
                            type="number" min="0" step="1"
                            placeholder="e.g. 3"
                            value={log.unit_count}
                            onChange={e => patchLog(actId, { unit_count: e.target.value })}
                            style={{ ...INP, width: '100%' }}
                          />
                        </div>
                      )}
```

Replace with:

```typescript
                    {(act.unit_type === 'count' || act.unit_type === 'both') && (
                        <div style={{ width: '100%' }}>
                          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 }}>
                            <label style={{ fontSize: 10, fontWeight: 700, color: '#6B7280', textTransform: 'uppercase', letterSpacing: '0.07em' }}>
                              <Hash size={10} style={{ display: 'inline', marginRight: 3 }} />{unitLabel(act)}
                            </label>
                            <span style={{ fontSize: 10, color: '#9CA3AF' }}>{log.item_titles.length} item{log.item_titles.length !== 1 ? 's' : ''}</span>
                          </div>
                          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                            {log.item_titles.map((title, idx) => (
                              <div key={idx} style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                                <input
                                  type="text"
                                  placeholder={`Title ${idx + 1} (e.g. Summer Sale Reel)`}
                                  value={title}
                                  onChange={e => {
                                    const next = [...log.item_titles]
                                    next[idx] = e.target.value
                                    patchLog(actId, { item_titles: next })
                                  }}
                                  style={{ ...INP, flex: 1 }}
                                />
                                {log.item_titles.length > 1 && (
                                  <button
                                    onClick={() => patchLog(actId, { item_titles: log.item_titles.filter((_, i) => i !== idx) })}
                                    style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#9CA3AF', padding: 4, flexShrink: 0 }}>
                                    <Trash2 size={13} />
                                  </button>
                                )}
                              </div>
                            ))}
                          </div>
                          <button
                            onClick={() => patchLog(actId, { item_titles: [...log.item_titles, ''] })}
                            style={{
                              marginTop: 8, display: 'flex', alignItems: 'center', gap: 5,
                              padding: '6px 12px', borderRadius: 8,
                              border: `1px dashed ${cfg.color}`, background: cfg.bg,
                              color: cfg.color, fontSize: 11, fontWeight: 700, cursor: 'pointer',
                            }}>
                            <Plus size={11} /> Add Item
                          </button>
                        </div>
                      )}
```

- [ ] **Step 2: Add title field to each post row in the Posts Logger**

In the posts grid, find the first column (Client):

```typescript
                <div>
                  <label style={{ fontSize: 9, fontWeight: 700, color: '#9CA3AF', textTransform: 'uppercase', letterSpacing: '0.07em', display: 'block', marginBottom: 3 }}>Client</label>
                  <select value={post.client_name} onChange={e => patchPost(post.id, { client_name: e.target.value })} style={{ ...SEL, fontSize: 12, appearance: 'auto' }}>
                    <option value="">— Client —</option>
                    {clientNames.map(n => <option key={n} value={n}>{n}</option>)}
                  </select>
                </div>
```

Insert a Title column BEFORE it:

```typescript
                <div>
                  <label style={{ fontSize: 9, fontWeight: 700, color: '#9CA3AF', textTransform: 'uppercase', letterSpacing: '0.07em', display: 'block', marginBottom: 3 }}>Title</label>
                  <input
                    type="text"
                    placeholder="e.g. Summer Sale Reel"
                    value={post.title}
                    onChange={e => patchPost(post.id, { title: e.target.value })}
                    style={{ ...INP, fontSize: 12 }}
                  />
                </div>
                <div>
                  <label style={{ fontSize: 9, fontWeight: 700, color: '#9CA3AF', textTransform: 'uppercase', letterSpacing: '0.07em', display: 'block', marginBottom: 3 }}>Client</label>
                  <select value={post.client_name} onChange={e => patchPost(post.id, { client_name: e.target.value })} style={{ ...SEL, fontSize: 12, appearance: 'auto' }}>
                    <option value="">— Client —</option>
                    {clientNames.map(n => <option key={n} value={n}>{n}</option>)}
                  </select>
                </div>
```

Also update the grid template to add a column for title — find:

```typescript
              <div key={post.id} style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr 1fr auto', gap: 8, alignItems: 'end' }}>
```

Replace with:

```typescript
              <div key={post.id} style={{ display: 'grid', gridTemplateColumns: '1.5fr 1fr 1fr 1fr 1fr auto', gap: 8, alignItems: 'end' }}>
```

- [ ] **Step 3: TypeScript check — must be clean**

```bash
cd "s:/VS CODE USING CODEX/GROFAST GROWTH MARKETING AND AI SOLUTIOn" && pnpm typecheck 2>&1 | grep "error TS" | head -10
```

Expected: no output.

- [ ] **Step 4: Commit**

```bash
cd "s:/VS CODE USING CODEX/GROFAST GROWTH MARKETING AND AI SOLUTIOn" && git add app/member/update/activity-update-form.tsx && git commit -m "feat: dynamic titled-item list and post title field in member update form"
```

---

## Task 5: Admin Insights Page — fetch and aggregate item titles

**Files:**
- Modify: `app/admin/insights/page.tsx`

- [ ] **Step 1: Add `item_titles` to the work_logs select**

Find:
```typescript
    admin.from('work_logs')
      .select('user_id, activity_id, client_name, hours, unit_count, cost, date')
      .eq('company_id', cid).gte('date', dateFrom).lte('date', dateTo),
```

Replace with:
```typescript
    admin.from('work_logs')
      .select('user_id, activity_id, client_name, hours, unit_count, item_titles, cost, date')
      .eq('company_id', cid).gte('date', dateFrom).lte('date', dateTo),
```

- [ ] **Step 2: Update `LogRow` type to include `item_titles`**

Find:
```typescript
  type LogRow  = { user_id: string; activity_id: string; client_name: string | null; hours: number; unit_count: number; cost: number; date: string }
```

Replace with:
```typescript
  type LogRow  = { user_id: string; activity_id: string; client_name: string | null; hours: number; unit_count: number; item_titles: string[]; cost: number; date: string }
```

- [ ] **Step 3: Aggregate `titles` into `activityStats`**

Find the block that builds `activityStats`:
```typescript
  const activityStats: Record<string, { name: string; emoji: string; team: string; hours: number; count: number; cost: number }> = {}
  for (const l of logs) {
    const act = actMap[l.activity_id]
    if (!act) continue
    if (!activityStats[l.activity_id]) activityStats[l.activity_id] = { name: act.name, emoji: act.emoji, team: act.team_category, hours: 0, count: 0, cost: 0 }
    activityStats[l.activity_id].hours += l.hours
    activityStats[l.activity_id].count += l.unit_count
    activityStats[l.activity_id].cost  += l.cost
  }
```

Replace with:
```typescript
  const activityStats: Record<string, { name: string; emoji: string; team: string; hours: number; count: number; cost: number; titles: string[] }> = {}
  for (const l of logs) {
    const act = actMap[l.activity_id]
    if (!act) continue
    if (!activityStats[l.activity_id]) activityStats[l.activity_id] = { name: act.name, emoji: act.emoji, team: act.team_category, hours: 0, count: 0, cost: 0, titles: [] }
    activityStats[l.activity_id].hours  += l.hours
    activityStats[l.activity_id].count  += l.unit_count
    activityStats[l.activity_id].cost   += l.cost
    activityStats[l.activity_id].titles.push(...(l.item_titles ?? []).filter(t => t.trim() !== ''))
  }
```

- [ ] **Step 4: Update the `activityStats` prop passed to `InsightsClient`**

The `activityStats` is already passed via `Object.values(activityStats).sort(...)`. The new `titles` field will flow through automatically — no change needed here.

- [ ] **Step 5: TypeScript check**

```bash
cd "s:/VS CODE USING CODEX/GROFAST GROWTH MARKETING AND AI SOLUTIOn" && pnpm typecheck 2>&1 | grep "error TS" | head -10
```

Expected: one error — `InsightsClient` prop type doesn't include `titles` yet. That's fixed in Task 6.

- [ ] **Step 6: Commit**

```bash
cd "s:/VS CODE USING CODEX/GROFAST GROWTH MARKETING AND AI SOLUTIOn" && git add app/admin/insights/page.tsx && git commit -m "feat: aggregate item_titles per activity in insights page"
```

---

## Task 6: Admin Insights Client — show titles in Activity Breakdown

**Files:**
- Modify: `app/admin/insights/insights-client.tsx`

- [ ] **Step 1: Add `titles` to the `activityStats` prop type**

Find:
```typescript
  activityStats: Array<{ name: string; emoji: string; team: string; hours: number; count: number; cost: number }>
```

Replace with:
```typescript
  activityStats: Array<{ name: string; emoji: string; team: string; hours: number; count: number; cost: number; titles: string[] }>
```

- [ ] **Step 2: Render titles in the Activity Breakdown card**

Find the activity row inside the Activity Breakdown card:

```typescript
                    <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 18px', borderBottom: '1px solid #F9FAFB' }}>
                      <span style={{ fontSize: 17, flexShrink: 0 }}>{a.emoji}</span>
                      <span style={{ fontSize: 13, fontWeight: 600, color: '#374151', flex: 1 }}>{a.name}</span>
                      {a.count > 0 && (
                        <span style={{ fontSize: 10, fontWeight: 700, padding: '2px 8px', borderRadius: 5, background: `${cfg.color}12`, color: cfg.color, flexShrink: 0 }}>
                          {a.count} units
                        </span>
                      )}
                      <span style={{ fontSize: 12, color: '#6B7280', minWidth: 38, textAlign: 'right', flexShrink: 0 }}>{fmtH(a.hours)}</span>
                      <span style={{ fontSize: 12, fontWeight: 800, color: '#111827', minWidth: 58, textAlign: 'right', fontFamily: 'var(--font-jakarta)', flexShrink: 0 }}>{fmtRupee(a.cost)}</span>
                    </div>
```

Replace with:

```typescript
                    <div key={i} style={{ borderBottom: '1px solid #F9FAFB' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 18px' }}>
                        <span style={{ fontSize: 17, flexShrink: 0 }}>{a.emoji}</span>
                        <span style={{ fontSize: 13, fontWeight: 600, color: '#374151', flex: 1 }}>{a.name}</span>
                        {a.count > 0 && (
                          <span style={{ fontSize: 10, fontWeight: 700, padding: '2px 8px', borderRadius: 5, background: `${cfg.color}12`, color: cfg.color, flexShrink: 0 }}>
                            {a.count} units
                          </span>
                        )}
                        <span style={{ fontSize: 12, color: '#6B7280', minWidth: 38, textAlign: 'right', flexShrink: 0 }}>{fmtH(a.hours)}</span>
                        <span style={{ fontSize: 12, fontWeight: 800, color: '#111827', minWidth: 58, textAlign: 'right', fontFamily: 'var(--font-jakarta)', flexShrink: 0 }}>{fmtRupee(a.cost)}</span>
                      </div>
                      {a.titles.length > 0 && (
                        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4, padding: '0 18px 10px 44px' }}>
                          {a.titles.slice(0, 5).map((t, ti) => (
                            <span key={ti} style={{ fontSize: 10, fontWeight: 600, color: '#6B7280', background: '#F3F4F6', borderRadius: 5, padding: '2px 7px', maxWidth: 160, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                              {t}
                            </span>
                          ))}
                          {a.titles.length > 5 && (
                            <span style={{ fontSize: 10, fontWeight: 600, color: '#9CA3AF', background: '#F3F4F6', borderRadius: 5, padding: '2px 7px' }}>
                              +{a.titles.length - 5} more
                            </span>
                          )}
                        </div>
                      )}
                    </div>
```

- [ ] **Step 3: TypeScript check — must be clean**

```bash
cd "s:/VS CODE USING CODEX/GROFAST GROWTH MARKETING AND AI SOLUTIOn" && pnpm typecheck 2>&1 | grep "error TS" | head -10
```

Expected: no output.

- [ ] **Step 4: Commit**

```bash
cd "s:/VS CODE USING CODEX/GROFAST GROWTH MARKETING AND AI SOLUTIOn" && git add app/admin/insights/insights-client.tsx && git commit -m "feat: show item titles in Activity Breakdown in Insights"
```

---

## Task 7: Build Check + Push

- [ ] **Step 1: Full build**

```bash
cd "s:/VS CODE USING CODEX/GROFAST GROWTH MARKETING AND AI SOLUTIOn" && pnpm build 2>&1 | grep -E "Compiled|error|Error" | head -10
```

Expected: `✓ Compiled successfully`

- [ ] **Step 2: Push**

```bash
cd "s:/VS CODE USING CODEX/GROFAST GROWTH MARKETING AND AI SOLUTIOn" && git push
```

---

## Self-Review

**Spec coverage:**

| Requirement | Task |
|---|---|
| `work_logs.item_titles text[]` column | Task 1 |
| `content_posts.title text` column | Task 1 |
| `WorkLogInput.item_titles`, `ContentPostInput.title` | Task 2 |
| `submitWorkLogs` inserts `item_titles` + `title` | Task 2 |
| `getWorkLogsForDate` returns `item_titles` + `title` | Task 2 |
| Dynamic titled-item list replaces count input | Task 4 |
| `unit_count` = `item_titles.length` auto-calculated | Task 3 Step 8 |
| Blank item pre-added when activity selected | Task 3 Step 7 |
| Title field added to posts section | Task 4 Step 2 |
| Existing logs loaded with their titles | Task 3 Step 5 |
| Admin insights fetches `item_titles` | Task 5 |
| Admin insights aggregates titles per activity | Task 5 Step 3 |
| Admin Activity Breakdown shows title pills | Task 6 |
| Hours-only activities unchanged | Task 4 Step 1 (condition checks `unit_type`) |

**Type consistency:** `item_titles: string[]` used consistently across all files. `title: string` used consistently. `LogState.unit_count` removed everywhere; `item_titles` replaces it. `filledTitles.length` is the submitted `unit_count`.

**No placeholders:** All steps have complete code.
