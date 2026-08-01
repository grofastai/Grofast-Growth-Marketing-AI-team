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
  it('charges no deduction for a month with only full working days, and never auto-adds OT', () => {
    // Filling every calendar day (including what would normally be rest days, per
    // this company's "weekends are working days" policy) legitimately produces
    // overtime *hours* under the fixed 25-day x 8.5h monthly target — but OT *pay*
    // is admin-entered only (payroll_runs.ot_amount), never derived from hours,
    // so otPay must stay 0 here even though otHours is well above zero.
    const updates = []
    for (let d = 1; d <= 31; d++) updates.push(fullDayUpdate(`2026-07-${String(d).padStart(2, '0')}`))
    const logs = updates.map(u => ({ date: u.date, clock_in: '09:30', status: 'present' }))
    const result = computeEmployeeMonth(baseData({ updates, logs }), PAYROLL_SETTINGS_DEFAULTS)
    expect(result.deduction).toBe(0)
    expect(result.basePay).toBe(30000)
    expect(result.otHours).toBeGreaterThan(0)
    expect(result.otPay).toBe(0)
    expect(result.netPay).toBe(result.basePay)
    expect(result.finalNetPay).toBe(result.netPay)
  })

  it('uses payroll_runs.ot_amount as OT pay, exactly as admin-entered', () => {
    const result = computeEmployeeMonth(baseData({
      run: { bonus: 0, advance: 0, incentive: 0, ot_amount: 750 },
    }), PAYROLL_SETTINGS_DEFAULTS)
    expect(result.otPay).toBe(750)
    expect(result.finalNetPay).toBe(Math.round((result.netPay + 750) * 100) / 100)
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
      run: { bonus: 1000, advance: 500, incentive: 200, ot_amount: 0 },
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
