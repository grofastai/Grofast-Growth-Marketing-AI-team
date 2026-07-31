import { calcNetWorkHours } from '@/lib/utils/work-hours'
import { classifyAttendanceDay } from '@/lib/utils/attendance-stats'
import { todayIST } from '@/lib/utils/ist-date'
import type { PayrollSettings } from '@/lib/payroll-settings-defaults'
import type { SupabaseClient } from '@supabase/supabase-js'

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

// Per-employee, per-month fetch — only for the payslip route, which handles
// one employee across several months for Year to Date. The Payroll list page
// fetches in bulk for the whole company and reshapes its own data into
// EmployeeMonthData instead of calling this, to avoid N+1 queries.
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
