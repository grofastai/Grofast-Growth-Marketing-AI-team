# Payslip Redesign Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the current decorative per-employee payslip (`app/api/payslip/route.ts`) with a clean, minimal, Infosys-style document — Earnings | Deductions table with both Current Period and Year-to-Date columns — without duplicating the payroll formula a third time.

**Architecture:** Extract the per-employee, per-month payroll calculation (currently duplicated between `app/admin/payroll/page.tsx` and `app/api/payslip/route.ts`) into one pure function, `computeEmployeeMonth`, in a new `lib/payroll/compute-month.ts`. The Payroll list page reshapes its existing bulk-fetched data per member and calls this pure function (no new queries — same efficient bulk-query pattern as today). The payslip route gets a new per-employee fetch helper, `fetchEmployeeMonthData`, which it calls once for the target month (Current Period) and once per historical month in the financial year (Year to Date), summing the results.

**Tech Stack:** Next.js 15 App Router (Server Component + Route Handler), Supabase (service-role client), TypeScript, Vitest for the one pure function that's actually unit-testable.

## Global Constraints

- Design source of truth: `docs/superpowers/specs/2026-07-30-payslip-redesign-design.md` — every field, layout section, and edge case below traces back to it.
- Only `app/api/payslip/route.ts`'s output changes visually. `app/admin/payroll/payroll-client.tsx` (the list UI) and the "Reports" quick action's output are unchanged — Task 3 only touches `page.tsx`'s internals, never `payroll-client.tsx`.
- Financial year for Year to Date: **April 1 – March 31**, independent of the calendar-year convention used elsewhere in the app for leave balances.
- No behavior change to the numbers the Payroll admin list already shows — `computeEmployeeMonth` must reproduce `page.tsx`'s existing day-classification and pay formulas exactly (this is what Task 3's manual verification checks).
- `pnpm typecheck` must pass after every task.

---

### Task 1: Shared `computeEmployeeMonth` pure function + tests

**Files:**
- Create: `lib/payroll/compute-month.ts`
- Test: `lib/payroll/compute-month.test.ts`

**Interfaces:**
- Produces: `computeEmployeeMonth(data: EmployeeMonthData, settings: PayrollSettings): EmployeeMonthBreakdown` — pure, no I/O. Both later tasks call this with data they've already fetched (bulk in Task 3, per-employee in Task 5).
- Produces types: `EmployeeMonthMember`, `EmployeeMonthUpdate`, `EmployeeMonthLog`, `EmployeeMonthLeave`, `EmployeeMonthData`, `EmployeeMonthBreakdown` (all exported from `lib/payroll/compute-month.ts`).

- [ ] **Step 1: Write `lib/payroll/compute-month.ts`**

```ts
import { calcNetWorkHours } from '@/lib/utils/work-hours'
import { classifyAttendanceDay } from '@/lib/utils/attendance-stats'
import { todayIST } from '@/lib/utils/ist-date'
import type { PayrollSettings } from '@/lib/payroll-settings-defaults'

export type EmployeeMonthMember = {
  employment_type: string | null
  monthly_salary: number | null
  hourly_rate: number | null
}

export type EmployeeMonthUpdate = {
  date: string
  working_hours: number | null
  learning_hours: number | null
  work_entries: { task_type?: string; duration_hours?: number | null; start_time?: string | null; end_time?: string | null }[] | null
}

export type EmployeeMonthLog = {
  date: string
  clock_in: string | null
  status: string | null
}

export type EmployeeMonthLeave = {
  from_date: string
  to_date: string
  leave_type: string
  permission_hours?: number | string | null
  half_day_from_time?: string | null
  half_day_to_time?: string | null
}

// Everything computeEmployeeMonth needs for one employee, one month — callers
// fetch this however suits them (bulk for the whole company, or per-employee).
export type EmployeeMonthData = {
  month: string // "YYYY-MM"
  member: EmployeeMonthMember
  updates: EmployeeMonthUpdate[]
  logs: EmployeeMonthLog[]
  approvedLeaves: EmployeeMonthLeave[] // this employee's approved leaves overlapping the month
  holidayDates: Set<string>
  collabHours: number // this employee's confirmed collaboration hours this month, pre-summed
  snapshotSalary: number | null // monthly_salary_records amount for this month, or null
  run: { bonus: number; advance: number; incentive: number } | null // payroll_runs row for this month
}

export type EmployeeMonthBreakdown = {
  employment_type: string
  presentDays: number; halfDays: number; absentDays: number; leaveDays: number
  missingUpdates: number; missingUpdateDates: string[]
  deductibleDays: number
  totalHours: number; otHours: number; collabHours: number
  effectiveWorkDays: number
  basic: number; hra: number; travelAllowance: number; medicalAllowance: number; otherAllowance: number
  basePay: number
  deduction: number; otPay: number
  bonus: number; advance: number; incentive: number
  netPay: number
  finalNetPay: number
  hoursPreview: {
    targetHours: number; permissionHours: number; halfDayHours: number; leaveHours: number
    requiredHours: number; actualHours: number; shortfallHours: number
    deduction: number; netPay: number | null
  }
}

// Ported from app/admin/payroll/page.tsx's per-member loop, unified with
// app/api/payslip/route.ts's Basic/HRA/Travel/Medical breakdown. Two
// deliberate corrections made during unification (see the design spec):
//  1. Collaboration hours are added to the MONTHLY TOTAL once, after day
//     classification — never used to influence which days count as
//     full/half/absent (page.tsx's existing behavior; the old payslip route
//     added collab hours per-day, which could silently reclassify a day).
//  2. Basic/HRA/Travel/Medical/Other and the daily rate now always use the
//     month's `monthly_salary_records` snapshot when one exists (the old
//     payslip route used the employee's *current* salary regardless of which
//     month was being viewed, which could disagree with a past month's actual
//     paid amount after a raise).
export function computeEmployeeMonth(data: EmployeeMonthData, settings: PayrollSettings): EmployeeMonthBreakdown {
  const { month, member, updates, logs, approvedLeaves, holidayDates, collabHours, snapshotSalary, run } = data
  const [year, mon] = month.split('-').map(Number)
  const monthStart = `${month}-01`
  const monthEnd   = `${month}-${new Date(year, mon, 0).getDate()}`
  const today = todayIST()

  const updateByDate: Record<string, number> = {}
  for (const u of updates) {
    const entries = Array.isArray(u.work_entries) ? u.work_entries : []
    updateByDate[u.date] = entries.length > 0
      ? calcNetWorkHours(entries as Parameters<typeof calcNetWorkHours>[0])
      : (u.working_hours ?? 0) + (u.learning_hours ?? 0)
  }
  const clockedInDates = new Set(logs.filter(l => l.clock_in !== null || l.status === 'present').map(l => l.date))

  const leaveDatesForMember = new Map<string, 'full' | 'half'>()
  for (const l of approvedLeaves) {
    if (l.leave_type === 'permission' || l.leave_type === 'wfh' || l.leave_type === 'shoot_day') continue
    const weight = l.leave_type === 'half_day' ? 'half' : 'full'
    const cur = new Date(l.from_date + 'T12:00:00')
    const end = new Date(l.to_date   + 'T12:00:00')
    while (cur <= end) {
      const d = cur.toISOString().split('T')[0]
      if (d >= monthStart && d <= monthEnd) leaveDatesForMember.set(d, weight)
      cur.setDate(cur.getDate() + 1)
    }
  }

  const allMonthDays: string[] = []
  const daysInMonth = new Date(year, mon, 0).getDate()
  for (let d = 1; d <= daysInMonth; d++) allMonthDays.push(`${month}-${String(d).padStart(2, '0')}`)

  let presentDays = 0, halfDays = 0, absentDays = 0, leaveDays = 0, missingUpdates = 0
  let totalHours = 0
  const missingUpdateDates: string[] = []

  for (const date of allMonthDays) {
    const isHoliday  = holidayDates.has(date)
    const hasClockIn = clockedInDates.has(date)
    const workH      = updateByDate[date] ?? 0

    if (isHoliday) continue

    const leaveType = leaveDatesForMember.get(date)
    const dayClass  = classifyAttendanceDay({ hasClockIn, workHours: workH, leaveType }, settings.half_day_threshold_hrs)

    if (dayClass === 'leave' || dayClass === 'half_leave') {
      leaveDays += dayClass === 'half_leave' ? 0.5 : 1
      if (dayClass === 'half_leave') presentDays += 0.5
      totalHours += workH
      continue
    }

    totalHours += workH

    if (hasClockIn && workH === 0 && date !== today) { missingUpdates++; missingUpdateDates.push(date) }

    if (dayClass === 'full') presentDays++
    else if (dayClass === 'half') halfDays++
    else if (dayClass === 'absent') absentDays++
  }

  const deductibleDays = absentDays + halfDays * 0.5

  const HOURS_TARGET = 25 * 8.5
  let permissionHoursB = 0, halfDayHoursB = 0
  for (const l of approvedLeaves) {
    const start = l.from_date > monthStart ? l.from_date : monthStart
    const end   = l.to_date   < monthEnd   ? l.to_date   : monthEnd
    if (start > end) continue
    if (l.leave_type === 'permission') {
      permissionHoursB += Number(l.permission_hours) || 0
    } else if (l.leave_type === 'half_day' && l.half_day_from_time && l.half_day_to_time) {
      const [fh, fm] = l.half_day_from_time.split(':').map(Number)
      const [th, tm] = l.half_day_to_time.split(':').map(Number)
      const mins = (th * 60 + tm) - (fh * 60 + fm)
      if (mins > 0) halfDayHoursB += mins / 60
    }
  }
  const leaveHoursB    = leaveDays * 8.5
  const requiredHoursB = Math.max(0, HOURS_TARGET - permissionHoursB - halfDayHoursB - leaveHoursB)
  const actualHoursB   = totalHours

  const combinedTotalHours = Math.round((totalHours + collabHours) * 10) / 10
  const shortfallHoursB = Math.max(0, requiredHoursB - actualHoursB)
  const otHours = Math.round(Math.max(0, combinedTotalHours - HOURS_TARGET) * 10) / 10

  const effectiveSalary = snapshotSalary ?? member.monthly_salary
  const employmentType = member.employment_type ?? 'regular'

  let basic = 0, hra = 0, travelAllowance = 0, medicalAllowance = 0, otherAllowance = 0
  let deduction = 0, otPay = 0, basePay = 0, netPay = 0

  if (employmentType === 'regular' && effectiveSalary) {
    const dailyRate = effectiveSalary / settings.salary_basis_days
    basic            = Math.round(effectiveSalary * (settings.basic_pct / 100))
    hra              = Math.round(basic * (settings.hra_pct / 100))
    travelAllowance  = Math.round(effectiveSalary * (settings.travel_pct / 100))
    medicalAllowance = Math.round(effectiveSalary * (settings.medical_pct / 100))
    otherAllowance   = Math.max(0, effectiveSalary - basic - hra - travelAllowance - medicalAllowance)
    basePay   = basic + hra + travelAllowance + medicalAllowance + otherAllowance
    deduction = Math.round(deductibleDays * dailyRate * 100) / 100
    otPay     = Math.round(otHours * (dailyRate / settings.ot_threshold_hrs) * 100) / 100
    netPay    = Math.round((basePay - deduction + otPay) * 100) / 100
  } else if (member.hourly_rate) {
    basePay = Math.round(combinedTotalHours * member.hourly_rate * 100) / 100
    netPay  = basePay
  }

  const bonus     = run?.bonus     ?? 0
  const advance   = run?.advance   ?? 0
  const incentive = run?.incentive ?? 0
  const finalNetPay = Math.round((netPay + bonus + incentive - advance) * 100) / 100

  const hourlyRateB = effectiveSalary ? effectiveSalary / HOURS_TARGET : 0
  const deductionB  = Math.round(shortfallHoursB * hourlyRateB * 100) / 100
  const netPayB     = employmentType === 'regular' && effectiveSalary
    ? Math.round((effectiveSalary - deductionB) * 100) / 100
    : null

  const effectiveWorkDays = allMonthDays.filter(d => !holidayDates.has(d)).length

  return {
    employment_type: employmentType,
    presentDays, halfDays, absentDays, leaveDays, missingUpdates, missingUpdateDates,
    deductibleDays,
    totalHours: combinedTotalHours, otHours, collabHours,
    effectiveWorkDays,
    basic, hra, travelAllowance, medicalAllowance, otherAllowance,
    basePay, deduction, otPay,
    bonus, advance, incentive,
    netPay, finalNetPay,
    hoursPreview: {
      targetHours: HOURS_TARGET, permissionHours: Math.round(permissionHoursB * 10) / 10,
      halfDayHours: Math.round(halfDayHoursB * 10) / 10, leaveHours: Math.round(leaveHoursB * 10) / 10,
      requiredHours: Math.round(requiredHoursB * 10) / 10, actualHours: Math.round(actualHoursB * 10) / 10,
      shortfallHours: Math.round(shortfallHoursB * 10) / 10, deduction: deductionB, netPay: netPayB,
    },
  }
}
```

- [ ] **Step 2: Write `lib/payroll/compute-month.test.ts`**

```ts
import { describe, it, expect } from 'vitest'
import { computeEmployeeMonth, type EmployeeMonthData } from './compute-month'
import { PAYROLL_SETTINGS_DEFAULTS } from '@/lib/payroll-settings-defaults'

function baseData(overrides: Partial<EmployeeMonthData> = {}): EmployeeMonthData {
  return {
    month: '2026-07',
    member: { employment_type: 'regular', monthly_salary: 30000, hourly_rate: null },
    updates: [],
    logs: [],
    approvedLeaves: [],
    holidayDates: new Set(),
    collabHours: 0,
    snapshotSalary: 30000,
    run: null,
    ...overrides,
  }
}

function fullDayUpdate(date: string) {
  return { date, working_hours: null, learning_hours: null, work_entries: [
    { task_type: 'edit', duration_hours: 9.5, start_time: '09:30', end_time: '19:00' },
  ] }
}

describe('computeEmployeeMonth', () => {
  it('charges no deduction and full base pay for a month with only full working days', () => {
    const updates = []
    for (let d = 1; d <= 31; d++) updates.push(fullDayUpdate(`2026-07-${String(d).padStart(2, '0')}`))
    const logs = updates.map(u => ({ date: u.date, clock_in: '09:30', status: 'present' }))
    const result = computeEmployeeMonth(baseData({ updates, logs }), PAYROLL_SETTINGS_DEFAULTS)
    expect(result.deduction).toBe(0)
    expect(result.basePay).toBe(30000)
    expect(result.finalNetPay).toBe(30000)
  })

  it('deducts one day of pay for an absent day (no clock-in, no update)', () => {
    const result = computeEmployeeMonth(baseData({
      updates: [fullDayUpdate('2026-07-01')],
      logs: [{ date: '2026-07-01', clock_in: '09:30', status: 'present' }],
    }), PAYROLL_SETTINGS_DEFAULTS)
    // 2026-07-02 has neither a clock-in nor an update -> absent -> deductibleDays >= 1
    expect(result.absentDays).toBeGreaterThan(0)
    expect(result.deduction).toBeGreaterThan(0)
  })

  it('does not deduct for an approved full-day leave', () => {
    const result = computeEmployeeMonth(baseData({
      approvedLeaves: [{ from_date: '2026-07-02', to_date: '2026-07-02', leave_type: 'full_day' }],
    }), PAYROLL_SETTINGS_DEFAULTS)
    expect(result.leaveDays).toBeGreaterThanOrEqual(1)
    // A leave day never contributes to deductibleDays regardless of other absences that month
    expect(result.deductibleDays).toBe(result.absentDays + result.halfDays * 0.5)
  })

  it('adds bonus and incentive, subtracts advance, in finalNetPay', () => {
    const result = computeEmployeeMonth(baseData({
      run: { bonus: 1000, advance: 500, incentive: 200 },
    }), PAYROLL_SETTINGS_DEFAULTS)
    expect(result.finalNetPay).toBe(Math.round((result.netPay + 1000 + 200 - 500) * 100) / 100)
  })

  it('computes hourly employees from total hours x rate, ignoring salary fields', () => {
    const result = computeEmployeeMonth(baseData({
      member: { employment_type: 'hourly', monthly_salary: null, hourly_rate: 200 },
      updates: [fullDayUpdate('2026-07-01')],
      snapshotSalary: null,
    }), PAYROLL_SETTINGS_DEFAULTS)
    expect(result.basePay).toBe(Math.round(result.totalHours * 200 * 100) / 100)
    expect(result.netPay).toBe(result.basePay)
  })

  it('splits basic/hra/travel/medical/other so they sum back to the salary exactly', () => {
    const result = computeEmployeeMonth(baseData(), PAYROLL_SETTINGS_DEFAULTS)
    const sum = result.basic + result.hra + result.travelAllowance + result.medicalAllowance + result.otherAllowance
    expect(sum).toBe(30000)
    expect(result.basePay).toBe(sum)
  })
})
```

- [ ] **Step 3: Run the tests**

Run: `pnpm test lib/payroll/compute-month.test.ts`
Expected: all 6 tests PASS.

- [ ] **Step 4: Typecheck**

Run: `pnpm typecheck`
Expected: no errors.

- [ ] **Step 5: Commit**

```bash
git add lib/payroll/compute-month.ts lib/payroll/compute-month.test.ts
git commit -m "feat(payroll): extract shared computeEmployeeMonth calculation

Pure function ported from app/admin/payroll/page.tsx and
app/api/payslip/route.ts's duplicated per-employee, per-month payroll
math. Not yet wired into either caller — that's the next two tasks."
```

---

### Task 2: Per-employee month data fetcher

**Files:**
- Modify: `lib/payroll/compute-month.ts` (add `fetchEmployeeMonthData`)

**Interfaces:**
- Consumes: `EmployeeMonthData`, `EmployeeMonthUpdate`, `EmployeeMonthLog`, `EmployeeMonthLeave` (from Task 1, same file).
- Produces: `fetchEmployeeMonthData(admin: SupabaseClient, params: { userId: string; companyId: string; month: string }): Promise<Omit<EmployeeMonthData, 'member'>>` — used only by the payslip route (Task 5), one employee at a time. The Payroll list page (Task 3) does **not** use this — it reshapes data it already bulk-fetched, to avoid turning one bulk query into N per-employee queries.

- [ ] **Step 1: Add the fetcher to `lib/payroll/compute-month.ts`**

Add this import at the top of the file:

```ts
import type { SupabaseClient } from '@supabase/supabase-js'
```

Add this function after `computeEmployeeMonth`:

```ts
// Per-employee, per-month fetch — only for the payslip route (Task 5), which
// handles one employee across several months for Year to Date. The Payroll
// list page fetches in bulk for the whole company and reshapes its own data
// into EmployeeMonthData instead of calling this, to avoid N+1 queries.
export async function fetchEmployeeMonthData(
  admin: SupabaseClient,
  params: { userId: string; companyId: string; month: string }
): Promise<Omit<EmployeeMonthData, 'member'>> {
  const { userId, companyId, month } = params
  const [year, mon] = month.split('-').map(Number)
  const monthStart = `${month}-01`
  const monthEnd   = `${month}-${new Date(year, mon, 0).getDate()}`

  const [
    { data: updatesRaw }, { data: logsRaw }, { data: leavesRaw },
    { data: holidaysRaw }, { data: collabRaw }, { data: snapshotRaw }, { data: runRaw },
  ] = await Promise.all([
    admin.from('daily_updates').select('date, working_hours, learning_hours, work_entries')
      .eq('user_id', userId).gte('date', monthStart).lte('date', monthEnd),
    admin.from('attendance_logs').select('date, clock_in, status')
      .eq('user_id', userId).gte('date', monthStart).lte('date', monthEnd),
    admin.from('leaves').select('from_date, to_date, leave_type, permission_hours, half_day_from_time, half_day_to_time')
      .eq('user_id', userId).eq('status', 'approved')
      .lte('from_date', monthEnd).gte('to_date', monthStart),
    admin.from('company_leaves').select('date')
      .eq('company_id', companyId).gte('date', monthStart).lte('date', monthEnd),
    admin.from('collaboration_confirmations').select('confirmed_hours')
      .eq('collaborator_id', userId).in('status', ['confirmed', 'edited_confirmed'])
      .gte('date', monthStart).lte('date', monthEnd),
    admin.from('monthly_salary_records').select('amount')
      .eq('user_id', userId).eq('month', month).maybeSingle(),
    admin.from('payroll_runs').select('bonus, advance, incentive')
      .eq('user_id', userId).eq('month', month).maybeSingle(),
  ])

  return {
    month,
    updates: (updatesRaw ?? []) as EmployeeMonthUpdate[],
    logs: (logsRaw ?? []) as EmployeeMonthLog[],
    approvedLeaves: (leavesRaw ?? []) as EmployeeMonthLeave[],
    holidayDates: new Set(((holidaysRaw ?? []) as { date: string }[]).map(h => h.date)),
    collabHours: ((collabRaw ?? []) as { confirmed_hours: number | null }[]).reduce((s, c) => s + (c.confirmed_hours ?? 0), 0),
    snapshotSalary: (snapshotRaw as { amount: number } | null)?.amount ?? null,
    run: (runRaw ?? null) as { bonus: number; advance: number; incentive: number } | null,
  }
}
```

- [ ] **Step 2: Typecheck**

Run: `pnpm typecheck`
Expected: no errors. (No test for this step — it's a thin Supabase query wrapper with no branching logic; it gets exercised for real in Task 6's manual verification.)

- [ ] **Step 3: Commit**

```bash
git add lib/payroll/compute-month.ts
git commit -m "feat(payroll): add fetchEmployeeMonthData for per-employee lookups"
```

---

### Task 3: Wire the Payroll list page to `computeEmployeeMonth`

**Files:**
- Modify: `app/admin/payroll/page.tsx:203-349` (the `rows = members.map(...)` block)

**Interfaces:**
- Consumes: `computeEmployeeMonth`, `EmployeeMonthData` from `lib/payroll/compute-month.ts` (Task 1).
- Produces: the returned `rows` array keeps the **exact same shape** `payroll-client.tsx`'s `PayrollRow` type expects today — this task changes `page.tsx`'s internals only, `payroll-client.tsx` is not touched.

- [ ] **Step 1: Replace the per-member calculation block**

In `app/admin/payroll/page.tsx`, replace the whole block from `const rows = members.map(m => {` (line 203) through its closing `})` (line 349) with:

```ts
import { computeEmployeeMonth, type EmployeeMonthData } from "@/lib/payroll/compute-month"

// ... (keep everything above unchanged: OT_THRESHOLD/HALF_DAY_THRESHOLD/SALARY_BASIS,
// allMonthDays, snapshotMap, missingSnapshots, runsMap, collabHoursByMember are all
// still needed as inputs below)

const rows = members.map(m => {
  const myLogs    = logs.filter(l => l.user_id === m.id)
  const myUpdates = updates.filter(u => u.user_id === m.id)
  const myLeaves  = approvedLeaves.filter(l => l.user_id === m.id)

  const data: EmployeeMonthData = {
    month,
    member: {
      employment_type: m.employment_type,
      monthly_salary: m.monthly_salary,
      hourly_rate: m.hourly_rate,
    },
    updates: myUpdates.map(u => ({
      date: u.date, working_hours: u.working_hours, learning_hours: u.learning_hours,
      work_entries: u.work_entries,
    })),
    logs: myLogs.map(l => ({ date: l.date, clock_in: l.clock_in, status: l.status })),
    approvedLeaves: myLeaves,
    holidayDates,
    collabHours: collabHoursByMember[m.id] ?? 0,
    snapshotSalary: snapshotMap.get(m.id) ?? null,
    run: runsMap.get(m.id) ?? null,
  }

  const breakdown = computeEmployeeMonth(data, payrollSettings)

  return {
    id: m.id, name: m.name, employee_id: m.employee_id, team: m.team,
    ...breakdown,
    isPaid: runsMap.get(m.id)?.is_paid ?? false,
    paidAt: runsMap.get(m.id)?.paid_at ?? null,
    monthly_salary: snapshotMap.get(m.id) ?? m.monthly_salary, hourly_rate: m.hourly_rate,
  }
})
```

- [ ] **Step 2: Remove the now-unused `getMemberLeaveDates` helper**

Delete the `getMemberLeaveDates` function (originally around line 173-188) — its date-map building is now done inside `computeEmployeeMonth`, fed by the plain `approvedLeaves` array per member instead.

- [ ] **Step 3: Typecheck**

Run: `pnpm typecheck`
Expected: no errors. If `payroll-client.tsx`'s `PayrollRow` type complains about a missing or extra field, compare it against `EmployeeMonthBreakdown` in `lib/payroll/compute-month.ts` — every field `PayrollRow` expects (`presentDays`, `halfDays`, `absentDays`, `leaveDays`, `missingUpdates`, `missingUpdateDates`, `deductibleDays`, `totalHours`, `otHours`, `collabHours`, `basePay`, `deduction`, `otPay`, `netPay`, `bonus`, `advance`, `incentive`, `finalNetPay`, `hoursPreview`, `effectiveWorkDays`) is produced by `computeEmployeeMonth` already — do not add new fields to `payroll-client.tsx` to fix a mismatch; fix the spread in Task 3 Step 1 instead.

- [ ] **Step 4: Manual verification**

Run: `pnpm dev`, open `/admin/payroll`, and for one employee you recognize, compare their Base Salary / Deductions / OT Pay / Net Pay chips against what you'd expect from before this change (same formula, just relocated — numbers must be identical to before this task). Expand their row and confirm the "Hours-Based Formula — Preview" panel still shows sensible numbers.

- [ ] **Step 5: Commit**

```bash
git add app/admin/payroll/page.tsx
git commit -m "refactor(payroll): use shared computeEmployeeMonth in the Payroll list

Same bulk-fetch pattern as before (no new queries) — just reshapes the
already-fetched data per member and calls the extracted pure function
instead of computing inline. Numbers are unchanged."
```

---

### Task 4: Add Designation (position) and drop unused fields to the payslip data fetch

**Files:**
- Modify: `app/api/payslip/route.ts`

**Interfaces:**
- Consumes: `computeEmployeeMonth`, `fetchEmployeeMonthData`, `EmployeeMonthData`, `EmployeeMonthBreakdown` from `lib/payroll/compute-month.ts` (Tasks 1-2).

- [ ] **Step 1: Add `position` to the member select and Current Period computation**

In `app/api/payslip/route.ts`, change the `users` select (around line 70) from:

```ts
admin.from('users')
  .select('id, name, employee_id, team, employment_type, monthly_salary, hourly_rate, created_at, phone, passport_photo_url')
  .eq('id', userId).eq('company_id', requester.company_id).single(),
```

to:

```ts
admin.from('users')
  .select('id, name, employee_id, team, employment_type, monthly_salary, hourly_rate, created_at, phone, passport_photo_url, position')
  .eq('id', userId).eq('company_id', requester.company_id).single(),
```

Update the `MemberRow` type (around line 169) to add `position: string | null`.

- [ ] **Step 2: Replace the inline calculation with the shared function**

Remove the entire block from `const collabByDate: Record<string, number> = {}` (around line 106) through `const netPayB = ...` (around line 325) — everything that duplicates `computeEmployeeMonth`'s logic — and replace it with:

```ts
import { computeEmployeeMonth, fetchEmployeeMonthData, type EmployeeMonthMember } from '@/lib/payroll/compute-month'

// ... after member/company/kyc are fetched:

const memberForCalc: EmployeeMonthMember = {
  employment_type: member.employment_type,
  monthly_salary: member.monthly_salary,
  hourly_rate: member.hourly_rate,
}

const currentMonthRaw = await fetchEmployeeMonthData(admin, { userId, companyId: requester.company_id, month })
const current = computeEmployeeMonth({ ...currentMonthRaw, member: memberForCalc }, settings)
```

Remove the now-unused `calendarWorkDays`, `collabRaw`/`approvedLeavesRaw`/`holidaysRaw`/`logsRaw`/`updatesRaw` destructured fetches and their related `Promise.all` entries (this data now comes from `fetchEmployeeMonthData` instead) — keep only `memberRaw`, `companyRaw`, `runRaw` (still needed for header/bank info — wait, `runRaw`'s bonus/advance/incentive now come from `current.bonus`/`current.advance`/`current.incentive`, so `runRaw` can be dropped too), and `kycRaw`.

The `Promise.all` at the top of the route becomes:

```ts
const [{ data: memberRaw }, { data: companyRaw }, { data: kycRaw }] = await Promise.all([
  admin.from('users')
    .select('id, name, employee_id, team, employment_type, monthly_salary, hourly_rate, created_at, phone, passport_photo_url, position')
    .eq('id', userId).eq('company_id', requester.company_id).single(),
  admin.from('companies').select('name, slug').eq('id', requester.company_id).single(),
  admin.from('member_kyc').select('bank_account, bank_name, bank_ifsc')
    .eq('user_id', userId).maybeSingle(),
])
```

- [ ] **Step 3: Stub out the old HTML template so the file typechecks**

The old `html = \`...\`` template literal (the entire donut-chart/KPI-card/QR-code
design) references variables this task just deleted (`presentDaysShow`, `basic`, `hra`,
`totalEarnings`, etc.) — it gets fully replaced in Task 6, so don't try to patch it now.
Delete everything from `const html = \`<!DOCTYPE html>` through the closing
`` </html>` `` (the entire template literal), and replace it with a temporary stub:

```ts
const html = `<!DOCTYPE html>
<html lang="en">
<head><meta charset="UTF-8"/><title>${payslipId} — ${member.name} — ${monthName}</title></head>
<body>
<p>Payslip for ${member.name}, ${monthName}. Net Pay: ${fmt(current.finalNetPay)} (Current Period), ${fmt(ytd.finalNetPay)} (Year to Date).</p>
</body>
</html>`
```

This is intentionally minimal — it exists only so the route returns valid HTML and the
file typechecks cleanly with no dangling references to deleted variables. Task 6 deletes
this stub and replaces it with the real design.

- [ ] **Step 4: Typecheck**

Run: `pnpm typecheck`
Expected: no errors once every old inline variable reference is replaced with the equivalent `current.*` field.

- [ ] **Step 5: Commit**

```bash
git add app/api/payslip/route.ts
git commit -m "refactor(payslip): use shared computeEmployeeMonth for Current Period

Route now fetches per-employee data via fetchEmployeeMonthData and
computes the month's breakdown via the same shared function as the
Payroll list, instead of its own duplicated calculation. HTML layout
is unchanged in this commit — that's Task 6."
```

---

### Task 5: Year-to-Date accumulation

**Files:**
- Modify: `app/api/payslip/route.ts`

**Interfaces:**
- Consumes: `EmployeeMonthBreakdown`, `computeEmployeeMonth`, `fetchEmployeeMonthData` (Tasks 1-2), `current` (Task 4's Current Period result).
- Produces: a `ytd` object with the same numeric fields as `EmployeeMonthBreakdown` (summed across months) — used by Task 6's HTML template.

- [ ] **Step 1: Add the financial-year month list helper**

Add this function to `app/api/payslip/route.ts` (near the top, alongside `calendarWorkDays`/`inWords` — note `calendarWorkDays` was removed in Task 4, this is a new, different helper):

```ts
// Every "YYYY-MM" from the financial year's start (April) through targetMonth
// inclusive — clamped to the employee's joining month if they joined after
// the financial year started, so Year to Date never counts months before
// they were employed.
function fyMonthsUpTo(targetMonth: string, joinedAt: string | null): string[] {
  const [ty, tm] = targetMonth.split('-').map(Number)
  const fyStartYear = tm >= 4 ? ty : ty - 1
  let startYear = fyStartYear, startMon = 4
  if (joinedAt) {
    const joinMonth = joinedAt.slice(0, 7)
    const fyStartStr = `${fyStartYear}-04`
    if (joinMonth > fyStartStr) {
      const [jy, jm] = joinMonth.split('-').map(Number)
      startYear = jy; startMon = jm
    }
  }
  const months: string[] = []
  let y = startYear, m = startMon
  while (y < ty || (y === ty && m <= tm)) {
    months.push(`${y}-${String(m).padStart(2, '0')}`)
    m++
    if (m > 12) { m = 1; y++ }
  }
  return months
}
```

- [ ] **Step 2: Compute Year to Date after `current` is computed**

Add this right after the `current = computeEmployeeMonth(...)` line from Task 4:

```ts
const ytdMonths = fyMonthsUpTo(month, member.created_at)
const monthBreakdowns = await Promise.all(
  ytdMonths.map(async m => {
    if (m === month) return current
    const raw = await fetchEmployeeMonthData(admin, { userId, companyId: requester.company_id, month: m })
    return computeEmployeeMonth({ ...raw, member: memberForCalc }, settings)
  })
)

function sumYtd(field: 'basic' | 'hra' | 'travelAllowance' | 'medicalAllowance' | 'otherAllowance' | 'otPay' | 'bonus' | 'incentive' | 'deduction' | 'advance' | 'basePay' | 'finalNetPay'): number {
  return Math.round(monthBreakdowns.reduce((s, b) => s + b[field], 0) * 100) / 100
}
const ytd = {
  basic: sumYtd('basic'), hra: sumYtd('hra'), travelAllowance: sumYtd('travelAllowance'),
  medicalAllowance: sumYtd('medicalAllowance'), otherAllowance: sumYtd('otherAllowance'),
  otPay: sumYtd('otPay'), bonus: sumYtd('bonus'), incentive: sumYtd('incentive'),
  deduction: sumYtd('deduction'), advance: sumYtd('advance'),
  basePay: sumYtd('basePay'), finalNetPay: sumYtd('finalNetPay'),
}
```

- [ ] **Step 3: Typecheck**

Run: `pnpm typecheck`
Expected: no errors.

- [ ] **Step 4: Commit**

```bash
git add app/api/payslip/route.ts
git commit -m "feat(payslip): compute Year to Date totals across the financial year

Loops fetchEmployeeMonthData + computeEmployeeMonth over every month from
April (or the employee's joining month, if later) through the target
month, summing each Earnings/Deductions line item. Not yet rendered —
that's the next task."
```

---

### Task 6: Replace the payslip HTML/CSS with the minimal Infosys-style layout

**Files:**
- Modify: `app/api/payslip/route.ts` (the `html = \`...\`` template literal and its `<style>` block)

**Interfaces:**
- Consumes: `current` (Current Period breakdown, Task 4), `ytd` (Year to Date totals, Task 5), `member` (incl. `position`, Task 4), `company`, `kyc`, `payDateStr`, `monthName`, `generatedTs`, `inWords`, `fmt` (all already defined earlier in the route).

- [ ] **Step 1: Remove the old decorative sections**

Delete: the donut chart SVG building code (`grossBase`, `pieColors`, `pieItems`, `donutSegs`, `donutSvg`), the `qrUrl` line, the sparkline path constants (`spGreen`/`spRed`/`spBlue`/`spDotRed`/`spDotGreen`/`spDotOrange`), and every CSS class only used by the KPI cards / breakdown donut / bottom 3-column grid / secure-card / signature footer (`.kpi-*`, `.tri-grid`, `.breakdown-*`, `.pie-*`, `.bot-*`, `.secure-*`, `.sig*`, `.emp-watermark`, `.net-cal-icon`, `.net-method`). Keep the `ic()` icon helper and `R`/`G`/`B` color variants — some icons are reused in the new layout.

- [ ] **Step 2: Replace the CSS block**

Replace the entire `<style>...</style>` block with:

```html
<style>
*{margin:0;padding:0;box-sizing:border-box}
body{font-family:'Inter',system-ui,sans-serif;background:#F3F4F6;color:#111827;-webkit-print-color-adjust:exact;print-color-adjust:exact;font-size:12.5px}
.topbar{background:#111;padding:10px 24px;display:flex;align-items:center;gap:12px;position:sticky;top:0;z-index:100}
.topbar-dot{width:7px;height:7px;border-radius:50%;background:#DC2626;flex-shrink:0}
.topbar-text{font-size:12px;color:#9CA3AF;font-weight:500;flex:1}
.topbar-id{font-size:11px;color:#6B7280;background:#1F2937;padding:3px 10px;border-radius:6px;font-weight:600}
.dl-btn{background:#DC2626;color:#fff;border:none;padding:7px 18px;border-radius:8px;font-size:12px;font-weight:700;cursor:pointer;display:flex;align-items:center;gap:6px}
.page{max-width:800px;margin:20px auto 40px;background:#fff;border:1px solid #D1D5DB}
.hdr{display:flex;justify-content:space-between;align-items:flex-start;padding:20px 24px;border-bottom:2px solid #111}
.co-name{font-size:19px;font-weight:800;color:#111;letter-spacing:0.01em}
.co-sub{font-size:10px;font-weight:700;color:#DC2626;text-transform:uppercase;letter-spacing:0.06em;margin-top:2px}
.co-addr{font-size:10.5px;color:#6B7280;margin-top:6px;line-height:1.6}
.slip-title{font-size:15px;font-weight:800;color:#111;text-align:right}
.slip-sub{font-size:10.5px;color:#6B7280;text-align:right;margin-top:2px}
.info-grid{display:grid;grid-template-columns:1fr 1fr;border-bottom:1px solid #D1D5DB}
.info-box{padding:14px 24px}
.info-box+.info-box{border-left:1px solid #D1D5DB}
.info-row{display:flex;justify-content:space-between;font-size:12px;padding:3px 0}
.info-lbl{color:#6B7280}
.info-val{font-weight:700;color:#111}
.wd-row{display:flex;border-bottom:1px solid #D1D5DB;background:#F9FAFB}
.wd-cell{flex:1;padding:10px 24px;text-align:center;border-left:1px solid #D1D5DB}
.wd-cell:first-child{border-left:none;text-align:left}
.wd-lbl{font-size:9.5px;color:#6B7280;text-transform:uppercase;letter-spacing:0.04em}
.wd-val{font-size:15px;font-weight:800;color:#111;margin-top:2px}
.amt-note{padding:8px 24px;font-size:10.5px;color:#6B7280;font-style:italic;border-bottom:1px solid #D1D5DB}
.ed-grid{display:grid;grid-template-columns:1fr 1fr}
.ed-col+.ed-col{border-left:1px solid #D1D5DB}
table.ed-table{width:100%;border-collapse:collapse}
.ed-table th{font-size:9.5px;text-transform:uppercase;letter-spacing:0.03em;color:#374151;background:#F3F4F6;padding:6px 10px;text-align:left;border-bottom:1px solid #D1D5DB}
.ed-table th:not(:first-child){text-align:right}
.ed-table td{font-size:12px;padding:6px 10px;border-bottom:1px solid #F3F4F6}
.ed-table td:not(:first-child){text-align:right;font-variant-numeric:tabular-nums}
.ed-table tr.total td{font-weight:800;border-top:2px solid #111;border-bottom:none;background:#F9FAFB}
.net-bar{display:flex;justify-content:space-between;align-items:center;padding:14px 24px;border-top:2px solid #111;background:#FEF2F2}
.net-lbl{font-size:11px;font-weight:800;color:#111;text-transform:uppercase;letter-spacing:0.06em}
.net-words{font-size:10.5px;color:#6B7280;margin-top:2px}
.net-amounts{display:flex;gap:24px;text-align:right}
.net-amt-col .net-amt-lbl{font-size:9.5px;color:#6B7280;text-transform:uppercase}
.net-amt-col .net-amt-val{font-size:17px;font-weight:900;color:#111}
.footer{padding:12px 24px;font-size:10px;color:#9CA3AF;text-align:center;border-top:1px solid #D1D5DB}
@media print{body{background:#fff}.topbar{display:none}.page{margin:0;max-width:100%;border:none}}
</style>
```

- [ ] **Step 3: Replace the `<body>` content**

Replace everything inside `<body>...</body>` with:

```html
<div class="topbar">
  <div class="topbar-dot"></div>
  <span class="topbar-text">${member.name} &nbsp;·&nbsp; ${monthName} &nbsp;·&nbsp; Salary Slip</span>
  <span class="topbar-id">${payslipId}</span>
  <button class="dl-btn" id="dl-btn" onclick="downloadPDF()">
    <svg id="dl-icon" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>
    <span id="dl-label">Download / Print</span>
  </button>
</div>
<div class="page">

  <div class="hdr">
    <div>
      <div class="co-name">${companyName}</div>
      <div class="co-sub">Group Of Companies</div>
      <div class="co-addr">4-188D, Poomalai Nagar, Kaveripattinam,<br/>Chowttahalli, Tamil Nadu 635112</div>
    </div>
    <div>
      <div class="slip-title">Salary Slip for the month of ${monthName}</div>
      <div class="slip-sub">Payslip ID: ${payslipId}</div>
    </div>
  </div>

  <div class="info-grid">
    <div class="info-box">
      <div class="info-row"><span class="info-lbl">Name</span><span class="info-val">${member.name}</span></div>
      <div class="info-row"><span class="info-lbl">Designation</span><span class="info-val">${member.position || member.team || 'Team Member'}</span></div>
      <div class="info-row"><span class="info-lbl">Employee No</span><span class="info-val">${member.employee_id}</span></div>
      <div class="info-row"><span class="info-lbl">Team</span><span class="info-val">${member.team ?? '—'}</span></div>
    </div>
    <div class="info-box">
      <div class="info-row"><span class="info-lbl">Joining Date</span><span class="info-val">${joiningDateFmt}</span></div>
      <div class="info-row"><span class="info-lbl">Bank Name</span><span class="info-val">${kyc?.bank_name ?? '—'}</span></div>
      <div class="info-row"><span class="info-lbl">Bank A/C No</span><span class="info-val">${kyc?.bank_account ? `XXXX XXXX ${kyc.bank_account.slice(-4)}` : '—'}</span></div>
      <div class="info-row"><span class="info-lbl">IFSC</span><span class="info-val">${kyc?.bank_ifsc ?? '—'}</span></div>
    </div>
  </div>

  <div class="wd-row">
    <div class="wd-cell"><div class="wd-lbl">Total Working Days</div><div class="wd-val">${current.effectiveWorkDays}</div></div>
    <div class="wd-cell"><div class="wd-lbl">LOP Days</div><div class="wd-val">${current.deductibleDays}</div></div>
  </div>

  <div class="amt-note">(Amount in ₹)</div>

  <div class="ed-grid">
    <div class="ed-col">
      <table class="ed-table">
        <thead><tr><th>Earnings</th><th>Current Period</th><th>Year to Date</th></tr></thead>
        <tbody>
          ${current.employment_type === 'regular' && member.monthly_salary ? `
          <tr><td>Basic Salary</td><td>${Math.round(current.basic).toLocaleString('en-IN')}</td><td>${Math.round(ytd.basic).toLocaleString('en-IN')}</td></tr>
          <tr><td>HRA</td><td>${Math.round(current.hra).toLocaleString('en-IN')}</td><td>${Math.round(ytd.hra).toLocaleString('en-IN')}</td></tr>
          <tr><td>Travel Allowance</td><td>${Math.round(current.travelAllowance).toLocaleString('en-IN')}</td><td>${Math.round(ytd.travelAllowance).toLocaleString('en-IN')}</td></tr>
          <tr><td>Medical Allowance</td><td>${Math.round(current.medicalAllowance).toLocaleString('en-IN')}</td><td>${Math.round(ytd.medicalAllowance).toLocaleString('en-IN')}</td></tr>
          ${current.otherAllowance > 0 ? `<tr><td>Other Allowance</td><td>${Math.round(current.otherAllowance).toLocaleString('en-IN')}</td><td>${Math.round(ytd.otherAllowance).toLocaleString('en-IN')}</td></tr>` : ''}
          ${current.otPay > 0 ? `<tr><td>Overtime Pay</td><td>${Math.round(current.otPay).toLocaleString('en-IN')}</td><td>${Math.round(ytd.otPay).toLocaleString('en-IN')}</td></tr>` : ''}
          ${current.bonus > 0 ? `<tr><td>Bonus</td><td>${Math.round(current.bonus).toLocaleString('en-IN')}</td><td>${Math.round(ytd.bonus).toLocaleString('en-IN')}</td></tr>` : ''}
          ${current.incentive > 0 ? `<tr><td>Incentive</td><td>${Math.round(current.incentive).toLocaleString('en-IN')}</td><td>${Math.round(ytd.incentive).toLocaleString('en-IN')}</td></tr>` : ''}
          ` : `<tr><td>Hours Worked (${current.totalHours}h)</td><td>${Math.round(current.basePay).toLocaleString('en-IN')}</td><td>${Math.round(ytd.basePay).toLocaleString('en-IN')}</td></tr>`}
          <tr class="total"><td>Total Earnings</td><td>${Math.round(current.basePay + current.otPay + current.bonus + current.incentive).toLocaleString('en-IN')}</td><td>${Math.round(ytd.basePay + ytd.otPay + ytd.bonus + ytd.incentive).toLocaleString('en-IN')}</td></tr>
        </tbody>
      </table>
    </div>
    <div class="ed-col">
      <table class="ed-table">
        <thead><tr><th>Deductions</th><th>Current Period</th><th>Year to Date</th></tr></thead>
        <tbody>
          ${current.deduction > 0
            ? `<tr><td>Attendance Deduction (${current.deductibleDays} day${current.deductibleDays !== 1 ? 's' : ''})</td><td>${Math.round(current.deduction).toLocaleString('en-IN')}</td><td>${Math.round(ytd.deduction).toLocaleString('en-IN')}</td></tr>`
            : `<tr><td style="color:#9CA3AF">No deductions this month</td><td style="color:#9CA3AF">—</td><td>${Math.round(ytd.deduction).toLocaleString('en-IN')}</td></tr>`}
          ${current.advance > 0 ? `<tr><td>Advance Recovery</td><td>${Math.round(current.advance).toLocaleString('en-IN')}</td><td>${Math.round(ytd.advance).toLocaleString('en-IN')}</td></tr>` : ''}
          <tr class="total"><td>Total Deductions</td><td>${Math.round(current.deduction + current.advance).toLocaleString('en-IN')}</td><td>${Math.round(ytd.deduction + ytd.advance).toLocaleString('en-IN')}</td></tr>
        </tbody>
      </table>
    </div>
  </div>

  <div class="net-bar">
    <div>
      <div class="net-lbl">Net Pay for the month</div>
      <div class="net-words">Rupees ${inWords(Math.round(current.finalNetPay))} Only</div>
    </div>
    <div class="net-amounts">
      <div class="net-amt-col"><div class="net-amt-lbl">Current Period</div><div class="net-amt-val">${fmt(current.finalNetPay)}</div></div>
      <div class="net-amt-col"><div class="net-amt-lbl">Year to Date</div><div class="net-amt-val">${fmt(ytd.finalNetPay)}</div></div>
    </div>
  </div>

  <div class="footer">This is a computer-generated payslip. No signature is required. &nbsp;·&nbsp; Generated on ${generatedTs}</div>

</div>
<script>
function downloadPDF(){
  window.print();
}
</script>
```

- [ ] **Step 4: Typecheck**

Run: `pnpm typecheck`
Expected: no errors.

- [ ] **Step 5: Commit**

```bash
git add app/api/payslip/route.ts
git commit -m "feat(payslip): minimal Infosys-style layout, Current Period + YTD

Replaces the donut-chart/KPI-card/QR-code/signature-block design with a
clean bordered document: company header, employee info block (incl.
Designation from the Positions system), a Total Working Days/LOP row,
an Earnings|Deductions table with Current Period and Year to Date
columns, and a Net Pay footer."
```

---

### Task 7: Manual verification

**Files:** none (verification only — no commit unless a bug surfaces, in which case fix it and commit separately with its own message describing the fix).

- [ ] **Step 1: Start the dev server**

Run: `pnpm dev`

- [ ] **Step 2: Cross-check Current Period against the Payroll list**

Open `/admin/payroll`, pick a regular-salary employee with at least one deduction or OT this month, note their Base Salary/Deductions/OT Pay/Net Pay chips. Open their payslip (📄 icon) and confirm the Current Period column's Total Earnings/Total Deductions/Net Pay match.

- [ ] **Step 3: Sanity-check Year to Date**

For that same employee, if it's currently April of the financial year, confirm Year to Date equals Current Period exactly for every line (nothing to accumulate yet). If it's a later month, confirm Year to Date ≥ Current Period for every non-negative line item, and that it doesn't include months before the employee's joining date (check an employee who joined mid-year, if one exists).

- [ ] **Step 4: Check an hourly/freelance employee, if one exists**

Open their payslip — confirm it shows the single "Hours Worked" line (not the Basic/HRA/Travel/Medical breakdown) and that Total Earnings/Net Pay are correct.

- [ ] **Step 5: Check the Bonus/Incentive/Advance quick actions still work end-to-end**

On the Payroll list, expand an employee, set a Bonus and an Incentive, save, then open their payslip again — confirm the new amounts show up in the Earnings table's Current Period column.

- [ ] **Step 6: Print preview**

Click "Download / Print" on the payslip — confirm the topbar disappears in the print preview and the document fits on one page without the old decorative elements leaving blank gaps.
