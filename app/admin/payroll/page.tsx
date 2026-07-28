export const revalidate = 0

import { createServerClient } from "@/lib/supabase/server"
import { createClient } from "@supabase/supabase-js"
import { redirect } from "next/navigation"
import PayrollClient from "./payroll-client"
import { calcNetWorkHours } from "@/lib/utils/work-hours"
import { getPayrollSettings } from "@/lib/actions/payroll-settings"
import { classifyAttendanceDay } from "@/lib/utils/attendance-stats"
import { listTeams } from "@/lib/actions/teams"

export default async function PayrollPage({
  searchParams,
}: {
  searchParams: Promise<{ month?: string }>
}) {
  const params  = await searchParams
  const supabase = await createServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect("/login")

  const now     = new Date()
  const month   = params.month ?? `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`
  const [year, mon] = month.split("-").map(Number)
  const monthStart  = `${month}-01`
  const monthEnd    = `${month}-${new Date(year, mon, 0).getDate()}`

  const admin = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  )

  const { data: profile } = await admin.from("users").select("company_id").eq("id", user.id).single()
  if (!profile) redirect("/login")
  const cid = profile.company_id
  const payrollSettings = await getPayrollSettings(cid)
  const teams = await listTeams()

  const [
    { data: membersRaw },
    { data: updatesRaw },
    { data: logsRaw },
    { data: runsRaw },
    { data: approvedLeavesRaw },
    { data: holidaysRaw },
    { data: collabConfirmsRaw },
    { count: pendingCollabCount },
    { count: pendingLeaveCount },
    { data: salaryRecordsRaw },
  ] = await Promise.all([
    admin
      .from("users")
      .select("id, name, employee_id, team, employment_type, monthly_salary, hourly_rate, paid_leave_days")
      .eq("company_id", cid)
      .eq("role", "MEMBER")
      .eq("status", "active")
      .eq("is_freelancer_login", false)
      .is("deleted_at", null)
      .order("name"),
    admin
      .from("daily_updates")
      .select("user_id, date, working_hours, learning_hours, work_entries")
      .eq("company_id", cid)
      .gte("date", monthStart)
      .lte("date", monthEnd),
    admin
      .from("attendance_logs")
      .select("user_id, date, clock_in, clock_out, status")
      .eq("company_id", cid)
      .gte("date", monthStart)
      .lte("date", monthEnd),
    admin
      .from("payroll_runs")
      .select("user_id, bonus, advance, incentive, is_paid, paid_at")
      .eq("company_id", cid)
      .eq("month", month),
    // Approved leaves — may span month boundary
    admin
      .from("leaves")
      .select("user_id, from_date, to_date, leave_type")
      .eq("company_id", cid)
      .eq("status", "approved")
      .lte("from_date", monthEnd)
      .gte("to_date", monthStart),
    // Company holidays for this month
    admin
      .from("company_leaves")
      .select("date")
      .eq("company_id", cid)
      .gte("date", monthStart)
      .lte("date", monthEnd),
    // Confirmed collaboration hours for this month
    admin
      .from("collaboration_confirmations")
      .select("collaborator_id, date, confirmed_hours")
      .eq("company_id", cid)
      .in("status", ["confirmed", "edited_confirmed"])
      .gte("date", monthStart)
      .lte("date", monthEnd),
    // Pre-payroll checklist: pending collab confirmations
    admin
      .from("collaboration_confirmations")
      .select("id", { count: "exact", head: true })
      .eq("company_id", cid)
      .eq("status", "pending")
      .gte("date", monthStart)
      .lte("date", monthEnd),
    // Pre-payroll checklist: pending leave requests
    admin
      .from("leaves")
      .select("id", { count: "exact", head: true })
      .eq("company_id", cid)
      .eq("status", "pending"),
    // Salary snapshots for this month
    admin
      .from("monthly_salary_records")
      .select("user_id, amount")
      .eq("company_id", cid)
      .eq("month", month),
  ])

  type UpdateRow = { user_id: string; date: string; working_hours: number | null; learning_hours: number | null; work_entries: { task_type?: string; duration_hours?: number | null; start_time?: string | null; end_time?: string | null }[] | null }
  type LogRow    = { user_id: string; date: string; clock_in: string | null; clock_out: string | null; status: string | null }
  type RunRow    = { user_id: string; bonus: number; advance: number; incentive: number; is_paid: boolean; paid_at: string | null }
  type LeaveRow  = { user_id: string; from_date: string; to_date: string; leave_type: string }
  type MemberRow = {
    id: string; name: string; employee_id: string; team: string | null
    employment_type: string | null; monthly_salary: number | null; hourly_rate: number | null
    paid_leave_days: number | null
  }

  const members       = (membersRaw          ?? []) as MemberRow[]
  const updates       = (updatesRaw           ?? []) as UpdateRow[]
  const logs          = (logsRaw              ?? []) as LogRow[]
  const runs          = (runsRaw              ?? []) as RunRow[]
  const approvedLeaves = (approvedLeavesRaw   ?? []) as LeaveRow[]
  const holidayDates  = new Set(((holidaysRaw ?? []) as { date: string }[]).map(h => h.date))
  const collabConfirms = (collabConfirmsRaw   ?? []) as { collaborator_id: string; date: string; confirmed_hours: number | null }[]
  const salaryRecords = (salaryRecordsRaw     ?? []) as { user_id: string; amount: number }[]

  // Build salary snapshot map for this month
  const snapshotMap = new Map(salaryRecords.map(r => [r.user_id, r.amount]))

  // Auto-snapshot: insert salary record for any member not yet snapshotted this month
  // ON CONFLICT DO NOTHING — existing records are NEVER overwritten
  const missingSnapshots = members
    .filter(m => m.employment_type === "regular" && m.monthly_salary && m.monthly_salary > 0 && !snapshotMap.has(m.id))
    .map(m => ({ company_id: cid, user_id: m.id, month, amount: m.monthly_salary as number }))
  if (missingSnapshots.length > 0) {
    await admin.from("monthly_salary_records").upsert(missingSnapshots, { onConflict: "user_id,month", ignoreDuplicates: true })
    // Add to map so calculations below use the fresh snapshot
    for (const s of missingSnapshots) snapshotMap.set(s.user_id, s.amount)
  }

  const runsMap = new Map(runs.map(r => [r.user_id, r]))

  // Build collab hours per member for the month
  const collabHoursByMember: Record<string, number> = {}
  for (const c of collabConfirms) {
    collabHoursByMember[c.collaborator_id] = (collabHoursByMember[c.collaborator_id] ?? 0) + (c.confirmed_hours ?? 0)
  }

  // Build approved leave date-sets per member
  function getMemberLeaveDates(userId: string): Set<string> {
    const s = new Set<string>()
    for (const l of approvedLeaves) {
      if (l.user_id !== userId) continue
      if (l.leave_type === "permission" || l.leave_type === "wfh" || l.leave_type === "shoot_day") continue
      const cur = new Date(l.from_date + "T12:00:00")
      const end = new Date(l.to_date   + "T12:00:00")
      while (cur <= end) {
        const d = cur.toISOString().split("T")[0]
        if (d >= monthStart && d <= monthEnd) s.add(d)
        cur.setDate(cur.getDate() + 1)
      }
    }
    return s
  }

  // All calendar days in this month
  const allMonthDays: string[] = []
  const daysInMonth = new Date(year, mon, 0).getDate()
  for (let d = 1; d <= daysInMonth; d++) {
    allMonthDays.push(`${month}-${String(d).padStart(2, "0")}`)
  }

  // Configurable via Payroll Settings — falls back to the same defaults this
  // page always used if a company has no settings row yet.
  const OT_THRESHOLD = payrollSettings.ot_threshold_hrs
  const HALF_DAY_THRESHOLD = payrollSettings.half_day_threshold_hrs  // hours below this = half day
  const SALARY_BASIS = payrollSettings.salary_basis_days

  const rows = members.map(m => {
    const myLogs    = logs.filter(l => l.user_id === m.id)
    const myUpdates = updates.filter(u => u.user_id === m.id)

    // Date-keyed lookups — use work_entries when available (stored working_hours may be stale)
    const updateByDate: Record<string, number> = {}
    for (const u of myUpdates) {
      const entries = Array.isArray(u.work_entries) ? u.work_entries : []
      updateByDate[u.date] = entries.length > 0
        ? calcNetWorkHours(entries as Parameters<typeof calcNetWorkHours>[0])
        : (u.working_hours ?? 0) + (u.learning_hours ?? 0)
    }
    const clockedInDates = new Set(myLogs.filter(l => l.clock_in !== null || l.status === "present").map(l => l.date))
    const leaveDatesForMember = getMemberLeaveDates(m.id)

    // Classify each day
    let presentDays = 0, halfDays = 0, absentDays = 0, leaveDays = 0, missingUpdates = 0
    let totalHours = 0, otHours = 0

    for (const date of allMonthDays) {
      const isHoliday  = holidayDates.has(date)
      const isLeave    = leaveDatesForMember.has(date)
      const hasClockIn = clockedInDates.has(date)
      const workH      = updateByDate[date] ?? 0

      if (isHoliday) continue  // holiday: not counted in working days
      if (isLeave)   { leaveDays++; totalHours += workH; continue }  // approved leave: no deduction

      totalHours += workH

      if (workH > OT_THRESHOLD) otHours += Math.round((workH - OT_THRESHOLD) * 10) / 10

      // Clocked in but no work hours = missing update (still counted as a half day below)
      if (hasClockIn && workH === 0) missingUpdates++

      // Shared with Dashboard/Attendance/History/Payslip (lib/utils/attendance-stats.ts)
      // so this company's Payroll threshold setting is the one source of truth for
      // every half-day/full-day/absent classification, everywhere it's shown.
      const dayClass = classifyAttendanceDay({ hasClockIn, workHours: workH }, HALF_DAY_THRESHOLD)
      if (dayClass === "full") presentDays++
      else if (dayClass === "half") halfDays++
      else if (dayClass === "absent") absentDays++
    }

    // Deductible: absent=1.0, half_day=0.5
    const deductibleDays = absentDays + (halfDays * 0.5)

    // Add confirmed collab hours (count toward total, not OT separately)
    const collabH = collabHoursByMember[m.id] ?? 0
    totalHours = Math.round((totalHours + collabH) * 10) / 10

    let basePay = 0, deduction = 0, otPay = 0, netPay = 0

    // Use snapshotted salary for this month — falls back to current if no snapshot (shouldn't happen after above)
    const effectiveSalary = snapshotMap.get(m.id) ?? m.monthly_salary
    if ((m.employment_type ?? "regular") === "regular" && effectiveSalary) {
      const dailyRate = effectiveSalary / SALARY_BASIS
      basePay   = effectiveSalary
      deduction = Math.round(deductibleDays * dailyRate * 100) / 100
      otPay     = Math.round(otHours * (dailyRate / OT_THRESHOLD) * 100) / 100
      netPay    = Math.round((basePay - deduction + otPay) * 100) / 100
    } else if (m.hourly_rate) {
      basePay = Math.round(totalHours * m.hourly_rate * 100) / 100
      netPay  = basePay
    }

    const run = runsMap.get(m.id)
    const bonus     = run?.bonus     ?? 0
    const advance   = run?.advance   ?? 0
    const incentive = run?.incentive ?? 0
    const finalNetPay = Math.round((netPay + bonus + incentive - advance) * 100) / 100

    // Working days for this month (excluding holidays)
    const effectiveWorkDays = allMonthDays.filter(d => !holidayDates.has(d)).length

    return {
      id: m.id, name: m.name, employee_id: m.employee_id, team: m.team,
      employment_type: m.employment_type ?? "regular",
      presentDays, halfDays, absentDays, leaveDays, missingUpdates,
      deductibleDays,
      totalHours, otHours, collabHours: collabH,
      basePay, deduction, otPay, netPay,
      bonus, advance, incentive, finalNetPay,
      isPaid: run?.is_paid ?? false,
      paidAt: run?.paid_at ?? null,
      monthly_salary: snapshotMap.get(m.id) ?? m.monthly_salary, hourly_rate: m.hourly_rate,
      effectiveWorkDays,
    }
  })

  // Working days (excluding company holidays) — used as reference for attendance %
  const workDays = allMonthDays.filter(d => !holidayDates.has(d)).length

  // Pre-payroll checklist: members with missing updates this month
  const pendingUpdateCount = rows.filter(r => r.missingUpdates > 0).length

  return (
    <PayrollClient
      rows={rows}
      month={month}
      workDays={workDays}
      pendingCollabCount={pendingCollabCount ?? 0}
      pendingLeaveCount={pendingLeaveCount ?? 0}
      pendingUpdateCount={pendingUpdateCount}
      payrollSettings={payrollSettings}
      teams={teams}
    />
  )
}
