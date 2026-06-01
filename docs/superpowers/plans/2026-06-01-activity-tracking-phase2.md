# Activity Tracking Phase 2 — Profitability + Live Timer

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add client profitability tracking (monthly fee → profit/loss) to the admin Insights page, and add a live task timer to the member update page so members can time-track without manually entering hours.

**Architecture:** Two independent features. Profitability: one new DB column (`clients.monthly_fee`), one new server action, one new table section in `insights-client.tsx`. Timer: pure client-side using `localStorage` + `useEffect` interval — no DB changes needed; when stopped it pre-fills the hours field in the existing activity form.

**Tech Stack:** Next.js 15 App Router, Supabase service-role client, TypeScript strict, inline styles (existing pattern).

---

## File Map

| File | Action |
|---|---|
| `supabase/migrations/051_client_monthly_fee.sql` | **Create** — add `monthly_fee` column to clients |
| `lib/actions/clients.ts` | **Modify** — add `updateClientMonthlyFee` server action |
| `app/admin/insights/page.tsx` | **Modify** — fetch clients with monthly_fee, compute profitability |
| `app/admin/insights/insights-client.tsx` | **Modify** — add Profitability table + inline fee editor |
| `app/member/update/activity-update-form.tsx` | **Modify** — add LiveTimer component + wire stop → pre-fill hours |

---

## Task 1: DB Migration — monthly_fee on clients

**Files:**
- Create: `supabase/migrations/051_client_monthly_fee.sql`

- [ ] **Step 1: Create the migration file**

Create `supabase/migrations/051_client_monthly_fee.sql`:

```sql
-- Add optional monthly fee to clients so admin can track profitability.
-- NULL means no fee configured for that client yet.

ALTER TABLE clients
  ADD COLUMN IF NOT EXISTS monthly_fee numeric(10,2);
```

- [ ] **Step 2: Run in Supabase SQL Editor**

Open Supabase → SQL Editor → paste and run the file content.
Expected: no errors. `clients` table now has a `monthly_fee` column.

- [ ] **Step 3: Commit**

```bash
cd "s:/VS CODE USING CODEX/GROFAST GROWTH MARKETING AND AI SOLUTIOn" && git add supabase/migrations/051_client_monthly_fee.sql && git commit -m "feat: add monthly_fee column to clients table"
```

---

## Task 2: Server Action — updateClientMonthlyFee

**Files:**
- Modify: `lib/actions/clients.ts`

- [ ] **Step 1: Add the action at the end of lib/actions/clients.ts**

Open `lib/actions/clients.ts` and append this function at the bottom of the file (after the last export):

```typescript
export async function updateClientMonthlyFee(
  name: string,
  fee: number | null,
): Promise<{ success: boolean; error?: string }> {
  const companyId = await getCompanyId()
  if (!companyId) return { success: false, error: 'Not authenticated' }

  const admin = adminSupabase()
  const { error } = await admin
    .from('clients')
    .update({ monthly_fee: fee, updated_at: new Date().toISOString() })
    .eq('company_id', companyId)
    .eq('name', name)

  if (error) return { success: false, error: error.message }

  revalidatePath('/admin/insights')
  return { success: true }
}
```

- [ ] **Step 2: TypeScript check**

```bash
cd "s:/VS CODE USING CODEX/GROFAST GROWTH MARKETING AND AI SOLUTIOn" && pnpm typecheck 2>&1 | grep "error TS" | head -5
```

Expected: no output.

- [ ] **Step 3: Commit**

```bash
cd "s:/VS CODE USING CODEX/GROFAST GROWTH MARKETING AND AI SOLUTIOn" && git add lib/actions/clients.ts && git commit -m "feat: updateClientMonthlyFee server action"
```

---

## Task 3: Insights Page — fetch profitability data

**Files:**
- Modify: `app/admin/insights/page.tsx`

- [ ] **Step 1: Add clients fetch to the parallel Promise.all**

In `app/admin/insights/page.tsx`, find the `Promise.all([` block and add a fifth query to fetch clients with their monthly fees:

Find:
```typescript
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
      .select('id, name, employee_id, monthly_salary, hourly_rate')
      .eq('company_id', cid).eq('role', 'MEMBER').eq('status', 'active').order('name'),
  ])
```

Replace with:
```typescript
  const [
    { data: workLogsRaw },
    { data: postsRaw },
    { data: activitiesRaw },
    { data: usersRaw },
    { data: clientsRaw },
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
      .select('id, name, employee_id, monthly_salary, hourly_rate')
      .eq('company_id', cid).eq('role', 'MEMBER').eq('status', 'active').order('name'),
    admin.from('clients')
      .select('name, monthly_fee')
      .eq('company_id', cid)
      .order('name'),
  ])
```

- [ ] **Step 2: Add the clientFeeMap computation and pass to InsightsClient**

In the same file, find the section that builds `clientStats` and add after it:

Find:
```typescript
  const clientStats: Record<string, { name: string; hours: number; cost: number }> = {}
  for (const l of logs) {
    const cn = l.client_name ?? 'Unassigned'
    if (!clientStats[cn]) clientStats[cn] = { name: cn, hours: 0, cost: 0 }
    clientStats[cn].hours += l.hours
    clientStats[cn].cost  += l.cost
  }
```

Replace with:
```typescript
  const clientStats: Record<string, { name: string; hours: number; cost: number }> = {}
  for (const l of logs) {
    const cn = l.client_name ?? 'Unassigned'
    if (!clientStats[cn]) clientStats[cn] = { name: cn, hours: 0, cost: 0 }
    clientStats[cn].hours += l.hours
    clientStats[cn].cost  += l.cost
  }

  // Build fee map: client name → monthly_fee (null if not set)
  type ClientFeeRow = { name: string; monthly_fee: number | null }
  const clientFeeMap: Record<string, number | null> = {}
  for (const c of ((clientsRaw ?? []) as ClientFeeRow[])) {
    clientFeeMap[c.name] = c.monthly_fee
  }

  // Profitability: merge cost from work_logs with fee from clients table
  const profitability = Object.values(clientStats)
    .filter(c => c.name !== 'Unassigned')
    .map(c => ({
      name:    c.name,
      hours:   c.hours,
      cost:    c.cost,
      fee:     clientFeeMap[c.name] ?? null,
      profit:  clientFeeMap[c.name] != null ? clientFeeMap[c.name]! - c.cost : null,
      margin:  clientFeeMap[c.name] != null && clientFeeMap[c.name]! > 0
        ? Math.round(((clientFeeMap[c.name]! - c.cost) / clientFeeMap[c.name]!) * 100)
        : null,
    }))
    .sort((a, b) => (b.fee ?? 0) - (a.fee ?? 0))
```

- [ ] **Step 3: Pass profitability to InsightsClient**

Find the `return (` statement and the `<InsightsClient` block. Add `profitability` prop:

Find:
```typescript
    <InsightsClient
      month={month}
      today={now.toISOString().split('T')[0]}
      teamHours={teamHours}
      activityStats={Object.values(activityStats).sort((a, b) => b.hours - a.hours)}
      memberStats={Object.values(memberStats).sort((a, b) => b.hours - a.hours)}
      clientStats={Object.values(clientStats).filter(c => c.name !== 'Unassigned').sort((a, b) => b.hours - a.hours)}
      postsByType={postsByType}
      postsByPlatform={postsByPlatform}
      recentPosts={recentPosts}
      kpis={{ totalHours, totalCost, totalVideos, totalPosters, totalPosts }}
    />
```

Replace with:
```typescript
    <InsightsClient
      month={month}
      today={now.toISOString().split('T')[0]}
      teamHours={teamHours}
      activityStats={Object.values(activityStats).sort((a, b) => b.hours - a.hours)}
      memberStats={Object.values(memberStats).sort((a, b) => b.hours - a.hours)}
      clientStats={Object.values(clientStats).filter(c => c.name !== 'Unassigned').sort((a, b) => b.hours - a.hours)}
      profitability={profitability}
      postsByType={postsByType}
      postsByPlatform={postsByPlatform}
      recentPosts={recentPosts}
      kpis={{ totalHours, totalCost, totalVideos, totalPosters, totalPosts }}
    />
```

- [ ] **Step 4: TypeScript check**

```bash
cd "s:/VS CODE USING CODEX/GROFAST GROWTH MARKETING AND AI SOLUTIOn" && pnpm typecheck 2>&1 | grep "error TS" | head -5
```

Expected: error about `profitability` prop not existing on `InsightsClient` — that's fixed in the next task.

- [ ] **Step 5: Commit**

```bash
cd "s:/VS CODE USING CODEX/GROFAST GROWTH MARKETING AND AI SOLUTIOn" && git add app/admin/insights/page.tsx && git commit -m "feat: fetch client fees and compute profitability in insights page"
```

---

## Task 4: Insights Client — Profitability Table

**Files:**
- Modify: `app/admin/insights/insights-client.tsx`

- [ ] **Step 1: Add profitability prop to the component signature**

In `app/admin/insights/insights-client.tsx`, find the props destructuring and type:

Find:
```typescript
export default function InsightsClient({
  month, today,
  teamHours, activityStats, memberStats, clientStats,
  postsByType, postsByPlatform, recentPosts, kpis,
}: {
  month: string
  today: string
  teamHours: Record<string, number>
  activityStats: Array<{ name: string; emoji: string; team: string; hours: number; count: number; cost: number }>
  memberStats: Array<{ name: string; employee_id: string; hours: number; cost: number; entries: number }>
  clientStats: Array<{ name: string; hours: number; cost: number }>
  postsByType: Record<string, number>
  postsByPlatform: Record<string, number>
  recentPosts: Array<{ memberName: string; client_name: string | null; platform: string; post_type: string; date: string }>
  kpis: { totalHours: number; totalCost: number; totalVideos: number; totalPosters: number; totalPosts: number }
})
```

Replace with:
```typescript
type ProfitRow = {
  name: string; hours: number; cost: number
  fee: number | null; profit: number | null; margin: number | null
}

export default function InsightsClient({
  month, today,
  teamHours, activityStats, memberStats, clientStats,
  profitability,
  postsByType, postsByPlatform, recentPosts, kpis,
}: {
  month: string
  today: string
  teamHours: Record<string, number>
  activityStats: Array<{ name: string; emoji: string; team: string; hours: number; count: number; cost: number }>
  memberStats: Array<{ name: string; employee_id: string; hours: number; cost: number; entries: number }>
  clientStats: Array<{ name: string; hours: number; cost: number }>
  profitability: ProfitRow[]
  postsByType: Record<string, number>
  postsByPlatform: Record<string, number>
  recentPosts: Array<{ memberName: string; client_name: string | null; platform: string; post_type: string; date: string }>
  kpis: { totalHours: number; totalCost: number; totalVideos: number; totalPosters: number; totalPosts: number }
})
```

- [ ] **Step 2: Add state + imports for profitability inline editing**

Find the existing import line:
```typescript
import { useRouter } from 'next/navigation'
```

Replace with:
```typescript
import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { updateClientMonthlyFee } from '@/lib/actions/clients'
```

- [ ] **Step 3: Add profitability state inside the component**

Find inside the component body, after `const router = useRouter()`:
```typescript
  const router = useRouter()
  const maxTeamHours = Math.max(...Object.values(teamHours), 1)
```

Replace with:
```typescript
  const router = useRouter()
  const [isPending, startTransition] = useTransition()
  const [editingFee, setEditingFee] = useState<string | null>(null)
  const [feeInput, setFeeInput]     = useState('')
  const maxTeamHours = Math.max(...Object.values(teamHours), 1)

  function saveFee(clientName: string) {
    const fee = parseFloat(feeInput.replace(/[^\d.]/g, ''))
    startTransition(async () => {
      await updateClientMonthlyFee(clientName, isNaN(fee) ? null : fee)
      setEditingFee(null)
      router.refresh()
    })
  }
```

- [ ] **Step 4: Add the Profitability section to the JSX**

In the JSX, find the closing tag of the 2-col grid (`</div>`) that closes after the "Client Hours" card, and insert the Profitability table after it (before the Posts section).

Find this closing tag sequence (the end of the 2-col grid):
```typescript
      </div>

      {/* ── Posts Section ──────────────────────────────────────────────────── */}
```

Replace with:
```typescript
      </div>

      {/* ── Client Profitability ───────────────────────────────────────────── */}
      <div style={{ ...CARD, marginTop: 16 }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '16px 18px 12px', borderBottom: '1px solid #F3F4F6' }}>
          <p style={{ fontSize: 14, fontWeight: 800, color: '#111827', margin: 0, fontFamily: 'var(--font-jakarta)' }}>
            💰 Client Profitability
          </p>
          <p style={{ fontSize: 11, color: '#9CA3AF', margin: 0 }}>Click fee to edit · Cost = team hours × salary rate</p>
        </div>
        {profitability.length === 0 ? (
          <p style={{ fontSize: 12, color: '#9CA3AF', textAlign: 'center', padding: '28px 0', margin: 0 }}>
            No client work logged this month
          </p>
        ) : (
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 560 }}>
              <thead>
                <tr style={{ background: '#F9FAFB' }}>
                  {['Client', 'Hours', 'Team Cost', 'Monthly Fee', 'Profit', 'Margin'].map(h => (
                    <th key={h} style={{ padding: '9px 16px', fontSize: 10, fontWeight: 700, color: '#9CA3AF', textAlign: 'left', borderBottom: '1px solid #F3F4F6', textTransform: 'uppercase', letterSpacing: '0.06em', whiteSpace: 'nowrap' }}>
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {profitability.map((c, i) => {
                  const isProfit  = c.profit != null && c.profit >= 0
                  const isLoss    = c.profit != null && c.profit < 0
                  const noFee     = c.fee == null
                  const isEditing = editingFee === c.name
                  return (
                    <tr key={i} style={{ borderBottom: '1px solid #F9FAFB' }}>
                      {/* Client */}
                      <td style={{ padding: '12px 16px' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                          <div style={{ width: 30, height: 30, borderRadius: 8, background: 'rgba(99,102,241,0.08)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                            <span style={{ fontSize: 9, fontWeight: 800, color: '#6366F1' }}>{ini(c.name)}</span>
                          </div>
                          <span style={{ fontSize: 13, fontWeight: 600, color: '#111827' }}>{c.name}</span>
                        </div>
                      </td>
                      {/* Hours */}
                      <td style={{ padding: '12px 16px', fontSize: 12, color: '#6B7280' }}>{fmtH(c.hours)}</td>
                      {/* Cost */}
                      <td style={{ padding: '12px 16px', fontSize: 13, fontWeight: 700, color: '#374151', fontFamily: 'var(--font-jakarta)' }}>{fmtRupee(c.cost)}</td>
                      {/* Monthly Fee — click to edit */}
                      <td style={{ padding: '12px 16px' }}>
                        {isEditing ? (
                          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                            <input
                              autoFocus
                              type="number"
                              value={feeInput}
                              onChange={e => setFeeInput(e.target.value)}
                              onKeyDown={e => { if (e.key === 'Enter') saveFee(c.name); if (e.key === 'Escape') setEditingFee(null) }}
                              placeholder="₹ monthly fee"
                              style={{ width: 110, padding: '5px 8px', borderRadius: 7, border: '1.5px solid #DE1A1A', fontSize: 12, color: '#111827', background: '#FFF', outline: 'none' }}
                            />
                            <button onClick={() => saveFee(c.name)} disabled={isPending}
                              style={{ padding: '5px 10px', borderRadius: 7, background: '#DE1A1A', color: '#FFF', fontSize: 11, fontWeight: 700, border: 'none', cursor: 'pointer' }}>
                              {isPending ? '…' : 'Save'}
                            </button>
                            <button onClick={() => setEditingFee(null)}
                              style={{ padding: '5px 8px', borderRadius: 7, background: '#F3F4F6', color: '#6B7280', fontSize: 11, fontWeight: 700, border: 'none', cursor: 'pointer' }}>
                              ✕
                            </button>
                          </div>
                        ) : (
                          <button
                            onClick={() => { setEditingFee(c.name); setFeeInput(c.fee != null ? String(c.fee) : '') }}
                            style={{ fontSize: 13, fontWeight: 700, color: noFee ? '#D1D5DB' : '#111827', background: 'none', border: noFee ? '1px dashed #E5E7EB' : 'none', borderRadius: 6, padding: noFee ? '3px 8px' : 0, cursor: 'pointer', fontFamily: 'var(--font-jakarta)' }}
                            title="Click to set monthly fee">
                            {noFee ? '+ Set fee' : fmtRupee(c.fee!)}
                          </button>
                        )}
                      </td>
                      {/* Profit */}
                      <td style={{ padding: '12px 16px' }}>
                        {noFee ? (
                          <span style={{ fontSize: 11, color: '#D1D5DB' }}>—</span>
                        ) : (
                          <span style={{ fontSize: 13, fontWeight: 800, color: isProfit ? '#16A34A' : '#DC2626', fontFamily: 'var(--font-jakarta)' }}>
                            {isProfit ? '+' : ''}{fmtRupee(c.profit!)}
                          </span>
                        )}
                      </td>
                      {/* Margin */}
                      <td style={{ padding: '12px 16px' }}>
                        {noFee ? (
                          <span style={{ fontSize: 11, color: '#D1D5DB' }}>—</span>
                        ) : (
                          <span style={{
                            fontSize: 11, fontWeight: 800, padding: '3px 10px', borderRadius: 20,
                            background: isProfit ? 'rgba(22,163,74,0.1)' : 'rgba(220,38,38,0.1)',
                            color: isProfit ? '#16A34A' : '#DC2626',
                          }}>
                            {c.margin}%
                          </span>
                        )}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* ── Posts Section ──────────────────────────────────────────────────── */}
```

- [ ] **Step 5: TypeScript check — all clean**

```bash
cd "s:/VS CODE USING CODEX/GROFAST GROWTH MARKETING AND AI SOLUTIOn" && pnpm typecheck 2>&1 | grep "error TS" | head -10
```

Expected: no output.

- [ ] **Step 6: Commit**

```bash
cd "s:/VS CODE USING CODEX/GROFAST GROWTH MARKETING AND AI SOLUTIOn" && git add app/admin/insights/insights-client.tsx && git commit -m "feat: client profitability table with inline fee editing"
```

---

## Task 5: Live Timer — Member Update Form

**Files:**
- Modify: `app/member/update/activity-update-form.tsx`

The timer is fully client-side using `localStorage`. No DB change needed.

**How it works:**
1. A "Start Timer" floating button appears at the top of the form
2. Member picks activity + client from a small modal, taps Start
3. Timer runs — persists in localStorage (survives page refresh)
4. Tap Stop → elapsed hours are added to the activity's hours field in the form + that activity is auto-selected

- [ ] **Step 1: Add timer state and helpers at the top of the component**

In `app/member/update/activity-update-form.tsx`, find:
```typescript
import { useState, useTransition, useMemo } from 'react'
import { useRouter } from 'next/navigation'
import { CheckCircle2, Loader2, Plus, Trash2, Clock, Hash } from 'lucide-react'
```

Replace with:
```typescript
import { useState, useTransition, useMemo, useEffect, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { CheckCircle2, Loader2, Plus, Trash2, Clock, Hash, Play, Square, Timer } from 'lucide-react'
```

- [ ] **Step 2: Add the LiveTimer sub-component before the main export**

After the `function unitLabel` function and before `export default function ActivityUpdateForm`, insert:

```typescript
const TIMER_KEY = 'grofast_active_timer'

type TimerState = {
  activityId: string
  activityName: string
  clientName: string
  startEpoch: number
}

function fmtElapsed(ms: number): string {
  const totalSecs = Math.floor(ms / 1000)
  const h = Math.floor(totalSecs / 3600)
  const m = Math.floor((totalSecs % 3600) / 60)
  const s = totalSecs % 60
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`
}

function elapsedHours(startEpoch: number): number {
  return Math.round(((Date.now() - startEpoch) / 3600000) * 10) / 10
}
```

- [ ] **Step 3: Add timer state inside the ActivityUpdateForm component**

Find inside `ActivityUpdateForm`, after:
```typescript
  const [error, setError] = useState<string | null>(null)
```

Add:
```typescript
  // ── Live Timer ──────────────────────────────────────────────────────────────
  const [timerState, setTimerState] = useState<TimerState | null>(() => {
    if (typeof window === 'undefined') return null
    try { return JSON.parse(localStorage.getItem(TIMER_KEY) ?? 'null') } catch { return null }
  })
  const [elapsed, setElapsed]       = useState(0)
  const [showTimerPicker, setShowTimerPicker] = useState(false)
  const [timerActivity, setTimerActivity]     = useState('')
  const [timerClient, setTimerClient]         = useState('')

  // Tick every second while timer is running
  useEffect(() => {
    if (!timerState) { setElapsed(0); return }
    setElapsed(Date.now() - timerState.startEpoch)
    const id = setInterval(() => setElapsed(Date.now() - timerState.startEpoch), 1000)
    return () => clearInterval(id)
  }, [timerState])

  const startTimer = useCallback(() => {
    if (!timerActivity) return
    const act = activities.find(a => a.id === timerActivity)
    if (!act) return
    const ts: TimerState = {
      activityId:   act.id,
      activityName: act.name,
      clientName:   timerClient,
      startEpoch:   Date.now(),
    }
    localStorage.setItem(TIMER_KEY, JSON.stringify(ts))
    setTimerState(ts)
    setShowTimerPicker(false)
  }, [timerActivity, timerClient, activities])

  const stopTimer = useCallback(() => {
    if (!timerState) return
    const hrs = elapsedHours(timerState.startEpoch)
    // Auto-select the activity and pre-fill hours
    setSelected(prev => {
      const next = new Set(prev)
      next.add(timerState.activityId)
      return next
    })
    setLogs(prev => ({
      ...prev,
      [timerState.activityId]: {
        activity_id: timerState.activityId,
        client_name: timerState.clientName,
        hours:       String(hrs),
        unit_count:  prev[timerState.activityId]?.unit_count ?? '',
        notes:       prev[timerState.activityId]?.notes ?? '',
      },
    }))
    localStorage.removeItem(TIMER_KEY)
    setTimerState(null)
    setElapsed(0)
  }, [timerState])
```

- [ ] **Step 4: Add the timer UI to the JSX — banner + picker modal**

In the JSX, find the opening of the form (just after the header div):
```typescript
      {/* ── STEP 1: Activity Picker ─────────────────────────────────────────── */}
```

Insert before it:
```typescript
      {/* ── Live Timer Banner ───────────────────────────────────────────────── */}
      {timerState ? (
        <div style={{
          background: 'linear-gradient(135deg, #1A1A2E 0%, #16213E 100%)',
          borderRadius: 16, padding: '16px 20px', marginBottom: 20,
          display: 'flex', alignItems: 'center', gap: 14, flexWrap: 'wrap',
          boxShadow: '0 4px 20px rgba(0,0,0,0.25)',
        }}>
          <div style={{ width: 10, height: 10, borderRadius: '50%', background: '#22C55E', flexShrink: 0, boxShadow: '0 0 8px #22C55E' }} />
          <div style={{ flex: 1, minWidth: 0 }}>
            <p style={{ fontSize: 11, color: 'rgba(255,255,255,0.5)', margin: '0 0 2px', textTransform: 'uppercase', letterSpacing: '0.08em', fontWeight: 700 }}>
              Timer Running
            </p>
            <p style={{ fontSize: 13, fontWeight: 700, color: '#FFFFFF', margin: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {timerState.activityName}{timerState.clientName ? ` · ${timerState.clientName}` : ''}
            </p>
          </div>
          <span style={{ fontSize: 28, fontWeight: 900, color: '#22C55E', fontFamily: 'var(--font-jakarta)', letterSpacing: '-0.02em', flexShrink: 0 }}>
            {fmtElapsed(elapsed)}
          </span>
          <button onClick={stopTimer} style={{
            display: 'flex', alignItems: 'center', gap: 6,
            padding: '10px 18px', borderRadius: 10, border: 'none',
            background: '#DE1A1A', color: '#FFF', fontSize: 13, fontWeight: 800,
            cursor: 'pointer', flexShrink: 0,
            boxShadow: '0 3px 10px rgba(222,26,26,0.5)',
          }}>
            <Square size={13} fill="currentColor" /> Stop & Log
          </button>
        </div>
      ) : (
        <div style={{ marginBottom: 20 }}>
          {showTimerPicker ? (
            <div style={{
              background: '#FFFFFF', borderRadius: 16, border: '1.5px solid #E5E7EB',
              padding: '16px 18px', boxShadow: '0 4px 20px rgba(0,0,0,0.08)',
            }}>
              <p style={{ fontSize: 14, fontWeight: 800, color: '#111827', margin: '0 0 14px', fontFamily: 'var(--font-jakarta)' }}>
                <Timer size={16} style={{ display: 'inline', marginRight: 6, verticalAlign: 'middle' }} />
                Start Timer
              </p>
              <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', marginBottom: 12 }}>
                <div style={{ flex: 1, minWidth: 160 }}>
                  <label style={{ fontSize: 10, fontWeight: 700, color: '#6B7280', textTransform: 'uppercase', letterSpacing: '0.07em', display: 'block', marginBottom: 4 }}>Activity</label>
                  <select value={timerActivity} onChange={e => setTimerActivity(e.target.value)}
                    style={{ ...SEL, appearance: 'auto', fontSize: 13 }}>
                    <option value="">— Select activity —</option>
                    {activities.map(a => <option key={a.id} value={a.id}>{a.emoji} {a.name}</option>)}
                  </select>
                </div>
                <div style={{ flex: 1, minWidth: 160 }}>
                  <label style={{ fontSize: 10, fontWeight: 700, color: '#6B7280', textTransform: 'uppercase', letterSpacing: '0.07em', display: 'block', marginBottom: 4 }}>Client</label>
                  <select value={timerClient} onChange={e => setTimerClient(e.target.value)}
                    style={{ ...SEL, appearance: 'auto', fontSize: 13 }}>
                    <option value="">— Select client —</option>
                    {clientNames.map(n => <option key={n} value={n}>{n}</option>)}
                    <option value="Internal">Internal / Our Brand</option>
                  </select>
                </div>
              </div>
              <div style={{ display: 'flex', gap: 8 }}>
                <button onClick={startTimer} disabled={!timerActivity} style={{
                  display: 'flex', alignItems: 'center', gap: 6,
                  padding: '9px 20px', borderRadius: 10, border: 'none',
                  background: timerActivity ? '#16A34A' : '#D1D5DB',
                  color: '#FFF', fontSize: 13, fontWeight: 700,
                  cursor: timerActivity ? 'pointer' : 'not-allowed',
                }}>
                  <Play size={13} fill="currentColor" /> Start
                </button>
                <button onClick={() => setShowTimerPicker(false)} style={{ padding: '9px 16px', borderRadius: 10, border: '1px solid #E5E7EB', background: '#F9FAFB', color: '#6B7280', fontSize: 13, fontWeight: 600, cursor: 'pointer' }}>
                  Cancel
                </button>
              </div>
            </div>
          ) : (
            <button onClick={() => setShowTimerPicker(true)} style={{
              width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
              padding: '11px 0', borderRadius: 12,
              border: '1.5px dashed #16A34A', background: 'rgba(22,163,74,0.04)',
              color: '#16A34A', fontSize: 13, fontWeight: 700, cursor: 'pointer',
            }}>
              <Timer size={15} /> Start Task Timer
            </button>
          )}
        </div>
      )}

      {/* ── STEP 1: Activity Picker ─────────────────────────────────────────── */}
```

- [ ] **Step 5: TypeScript check**

```bash
cd "s:/VS CODE USING CODEX/GROFAST GROWTH MARKETING AND AI SOLUTIOn" && pnpm typecheck 2>&1 | grep "error TS" | head -10
```

Expected: no output.

- [ ] **Step 6: Commit**

```bash
cd "s:/VS CODE USING CODEX/GROFAST GROWTH MARKETING AND AI SOLUTIOn" && git add app/member/update/activity-update-form.tsx && git commit -m "feat: live task timer with auto-fill for member daily update"
```

---

## Task 6: Build Check + Push

- [ ] **Step 1: Full build**

```bash
cd "s:/VS CODE USING CODEX/GROFAST GROWTH MARKETING AND AI SOLUTIOn" && pnpm build 2>&1 | grep -E "✓ Compiled|Error|error " | head -5
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
| Monthly fee per client | Task 1 (DB column) + Task 2 (server action) |
| Fee vs cost comparison | Task 3 (server compute profitability array) |
| Profit + margin per client | Task 4 (profitability table in InsightsClient) |
| Inline fee editing in UI | Task 4 (click fee → input → save → refresh) |
| Auto timer — start | Task 5 (Start Timer button + picker modal) |
| Auto timer — localStorage persistence | Task 5 (localStorage read/write in useEffect) |
| Auto timer — stop → fill hours | Task 5 (stopTimer sets selected + patchLog with elapsed hours) |
| Timer survives page refresh | Task 5 (useState init reads localStorage) |

No TBDs. Type names are consistent: `ProfitRow`, `TimerState`, `fmtElapsed`, `elapsedHours` are defined before use.
