# Monthly Attendance Score — Design Spec
**Date:** 2026-05-30  
**Status:** Approved

## Context

The admin attendance page shows only today's data. Monthly attendance % is calculated inside the payroll page but buried in expanded cards. Admins have no quick way to see who's consistently absent across the month. This adds a "Monthly Attendance" card to the right sidebar of `/admin/attendance` showing every employee ranked by their attendance % for the current month.

---

## What Changes

**File:** `app/admin/attendance/page.tsx` only — fully server-rendered, no client component needed.

Two additions:
1. **New parallel query** for monthly attendance logs
2. **New sidebar card** rendered after the "Quick Actions" card (after line 426)

---

## Data Query

Fetch all `attendance_logs` for the current month (1st → today), for the company:

```typescript
const monthStart = `${today.slice(0, 7)}-01`  // "YYYY-MM-01"

const { data: monthlyLogs } = await supabase
  .from('attendance_logs')
  .select('user_id, clock_in, status')
  .gte('date', monthStart)
  .lte('date', today)
```

**Days elapsed this month** = `parseInt(today.slice(8, 10))` (day-of-month number, e.g. 25)

**Per-employee score:**
```typescript
const presentByUser = new Map<string, number>()
for (const log of (monthlyLogs ?? []) as { user_id: string; clock_in: string | null; status: string }[]) {
  if (log.clock_in !== null || log.status === 'present') {
    presentByUser.set(log.user_id, (presentByUser.get(log.user_id) ?? 0) + 1)
  }
}

const daysElapsed = parseInt(today.slice(8, 10))

const monthlyScores = members
  .map(m => ({
    name: m.name,
    present: presentByUser.get(m.id) ?? 0,
    total: daysElapsed,
    pct: daysElapsed > 0 ? Math.round(((presentByUser.get(m.id) ?? 0) / daysElapsed) * 100) : 0,
  }))
  .sort((a, b) => b.pct - a.pct)
```

This is added to the existing `Promise.all` block to keep all queries parallel.

---

## UI — Monthly Attendance Card

Added after the "Quick Actions" card in the right sidebar, following the existing card pattern:

```
┌─────────────────────────────┐
│▓▓▓▓▓▓▓▓▓▓▓▓▓ (red gradient) │
│  Monthly Attendance          │
│  May 2026                    │
│                              │
│  Rahul Singh    22/25  88%  │
│  ████████░░               ✅ │
│                              │
│  Priya Sharma   20/25  80%  │
│  ████████░░               ✅ │
│                              │
│  Amit Kumar     18/25  72%  │
│  ███████░░░               🟡 │
│                              │
│  Neha Patel     15/25  60%  │
│  ██████░░░░               🔴 │
└─────────────────────────────┘
```

**Color thresholds** (same as payroll page):
- ≥ 80% → `#16A34A` (green)
- ≥ 60% → `#D97706` (amber)
- < 60% → `#DC2626` (red)

**Progress bar:** inline `div` with `width: ${pct}%`, color matching threshold, on a `#F3F4F6` background track.

**Empty state:** if `daysElapsed === 0` or no members, show "No data yet for this month."

---

## Files to Modify

| File | Change |
|---|---|
| `app/admin/attendance/page.tsx` | Add monthly query + render score card in right sidebar |

No new files, no DB migrations, no client components.

---

## Verification

1. Open `/admin/attendance` as admin → "Monthly Attendance" card appears in right sidebar below Quick Actions
2. Card shows all active employees ranked by % descending
3. Colors match: ≥80% green, ≥60% amber, <60% red
4. Present days and total days are correct for the current month
5. On the 1st of the month, `daysElapsed = 1` and scores reflect only today's data
6. Employee with no logs shows `0/N  0%` in red
