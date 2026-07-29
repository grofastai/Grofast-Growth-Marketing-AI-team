export const dynamic = 'force-dynamic'

import { createServerClient } from '@/lib/supabase/server'
import { createClient } from '@supabase/supabase-js'
import { redirect } from 'next/navigation'
import InsightsClient, { type AllMember } from './insights-client'
import { calcNetWorkHours } from '@/lib/utils/work-hours'
import { hourlyRateOnDate, type SalaryHistoryRow } from '@/lib/salary'
import { sumLeaveDays, type LeaveForBalance } from '@/lib/utils/leave-balance'
import { dailyWorkHours, summarizeAttendanceDays } from '@/lib/utils/attendance-stats'

function adminClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  )
}

// ── Types ─────────────────────────────────────────────────────────────────────

type MemberRow = {
  id: string
  name: string
  employee_id: string
  monthly_salary: number | null
  hourly_rate: number | null
  team: string | null
  work_layout?: string | null
}

type UpdateRow = {
  user_id: string
  date: string
  work_entries: {
    client_name?: string
    task_type?: string
    start_time?: string | null
    end_time?: string | null
    duration_hours?: number
  }[] | null
  working_hours: number | null
  learning_hours: number | null
}

export type MemberUtilization = {
  id: string
  name: string
  employeeId: string
  team: string | null
  isMedia: boolean
  monthlySalary: number
  workingDays: number
  expectedHours: number       // fixed 212.5h (25 × 8.5) — same target for everyone, every month
  trackedHours: number        // work_entries sum + learning_hours (original library formula, unchanged)
  learningHours: number
  untrackedHours: number      // Gap Hrs = max(0, 212.5 - tracked)
  overtimeHours: number       // max(0, tracked - 212.5)
  wastedCost: number          // untracked × hourly_rate
  overtimeValue: number       // overtime × hourly_rate — the mirror of wastedCost for hours worked over target
  efficiency: number          // (tracked / 212.5) × 100
  overworked: boolean         // efficiency > 105
  clients: string[]
  workBreakdown: Record<string, number> // key = task_type (shoot/edit/voiceover/poster/other/break/...) — open-ended so new types need no page change
  totalCost: number
  // ── Attendance table fields ──────────────────────────────────────────────
  loginHours: number              // sum(clock_out - clock_in), raw span, no break deducted
  avgLoginHours: number           // loginHours / days with both clock_in & clock_out
  workingHoursExclLearning: number // calcNetWorkHours with 'learning' entries stripped out first
  avgWorkingHoursExclLearning: number
  breakHours: number              // sum(attendance_logs.break_total_mins) / 60
  avgBreakHours: number
}

export type ClientHour    = { name: string; hours: number; cost: number }

export type SpendCategory = {
  label: string
  emoji: string
  hours: number
  cost: number
  color: string
}

export type InsightsKPIs  = {
  totalTrackedHours: number
  totalLearningHours: number
  totalUntrackedHours: number
  totalCost: number
  totalWastedCost: number
  activeMemberCount: number
  clientsServedCount: number
  avgEfficiency: number
  shootHours: number
  editHours: number
}

// The 5-day-per-month cap enforced server-side in checkMonthlyLeaveLimit (lib/actions/leaves.ts).
const MONTHLY_LEAVE_CAP = 5

export type LeaveBreakdownRow = {
  id: string; name: string
  fullDays: number
  halfDays: number; halfDayHours: number
  permissionHours: number
  daysUsed: number       // sumLeaveDays() total — what the 5-day cap is actually checked against
  balance: number         // MONTHLY_LEAVE_CAP - daysUsed, negative once they've gone over (e.g. Exceptional Leave)
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function isMediaTeam(team: string | null): boolean {
  const t = (team ?? '').toLowerCase().trim()
  // Only exact media production teams — "AI Development & Creative Production" is NOT media
  return t === 'media production team' || t === 'media team'
}

function deriveHourly(m: MemberRow): number {
  if (m.hourly_rate && m.hourly_rate > 0) return m.hourly_rate
  if (m.monthly_salary && m.monthly_salary > 0) return m.monthly_salary / 25 / 8.5
  return 0
}

// ── Page ──────────────────────────────────────────────────────────────────────

export default async function InsightsPage({
  searchParams,
}: {
  searchParams: Promise<{ month?: string }>
}) {
  const { month: rawMonth } = await searchParams
  const now      = new Date()
  const todayStr = now.toISOString().split('T')[0]
  const month    = rawMonth ?? todayStr.slice(0, 7)
  const [year, mon] = month.split('-').map(Number)
  const dateFrom = `${month}-01`
  const dateTo   = new Date(year, mon, 0).toISOString().split('T')[0]

  // Previous month's range — only used to compute the "vs last month" delta
  // on the Clients Worked donut, so it's a separate lightweight query below.
  const prevMonthDate = new Date(year, mon - 2, 1)
  const prevDateFrom = `${prevMonthDate.getFullYear()}-${String(prevMonthDate.getMonth() + 1).padStart(2, '0')}-01`
  const prevDateTo   = new Date(prevMonthDate.getFullYear(), prevMonthDate.getMonth() + 1, 0).toISOString().split('T')[0]

  const supabase = await createServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const admin = adminClient()
  const { data: profile } = await admin
    .from('users').select('company_id, role').eq('id', user.id).single()
  if (!profile) redirect('/login')
  if (profile.role !== 'ADMIN') redirect('/member/dashboard')
  const cid = profile.company_id

  const [
    { data: updatesRaw },
    { data: membersRaw },
    { data: attRaw },
    { data: clientsRaw },
    { data: salaryHistoryRaw },
    { data: clientStatusHistoryRaw },
    { data: collabRaw },
    { data: prevUpdatesRaw },
    { data: leavesRaw },
  ] = await Promise.all([
    admin.from('daily_updates')
      .select('user_id, date, work_entries, working_hours, learning_hours')
      .eq('company_id', cid)
      .gte('date', dateFrom)
      .lte('date', dateTo),
    admin.from('users')
      .select('id, name, employee_id, monthly_salary, hourly_rate, team, work_layout')
      .eq('company_id', cid)
      .eq('role', 'MEMBER')
      .eq('status', 'active')
      .eq('is_management', false)
      .eq('employment_type', 'regular') // full-time only — excludes login freelancers (e.g. Freelance Media Production)
      .order('name'),
    admin.from('attendance_logs')
      .select('user_id, date, clock_in, clock_out, status, break_total_mins')
      .eq('company_id', cid)
      .gte('date', dateFrom)
      .lte('date', dateTo),
    admin.from('clients')
      .select('id, name, industry, status')
      .eq('company_id', cid),
    admin.from('salary_history')
      .select('user_id, monthly_salary, effective_from')
      .eq('company_id', cid),
    admin.from('client_status_history')
      .select('client_id, status, effective_from')
      .eq('company_id', cid),
    // Confirmed collab hours per member for this period
    admin.from('collaboration_confirmations')
      .select('collaborator_id, confirmed_hours, date')
      .eq('company_id', cid)
      .in('status', ['confirmed', 'edited_confirmed'])
      .gte('date', dateFrom)
      .lte('date', dateTo),
    // Previous month's work entries — only client hours are summed from this, for the "vs last month" delta
    admin.from('daily_updates')
      .select('work_entries')
      .eq('company_id', cid)
      .gte('date', prevDateFrom)
      .lte('date', prevDateTo),
    // Approved leaves overlapping this month — pending/rejected don't count as taken.
    admin.from('leaves')
      .select('user_id, leave_type, from_date, to_date, permission_hours, half_day_from_time, half_day_to_time')
      .eq('company_id', cid)
      .eq('status', 'approved')
      .lte('from_date', dateTo)
      .gte('to_date', dateFrom),
  ])

  const updates = (updatesRaw ?? []) as UpdateRow[]
  const members = (membersRaw ?? []) as MemberRow[]

  const salaryHistory = (salaryHistoryRaw ?? []) as SalaryHistoryRow[]
  const memberMap = new Map(members.map(m => [m.id, m]))

  // Shared with Expenses/Clients (lib/salary.ts) so all 3 pages can never
  // quietly disagree on what someone's hourly rate was for a given date.
  function hourlyForMember(userId: string, date: string = dateFrom): number {
    const m = memberMap.get(userId)
    if (!m) return 0
    return hourlyRateOnDate(m, date, salaryHistory)
  }

  // ── Attendance: days present, login-hour span, break minutes ──────────────
  type AttLogRow = { user_id: string; date: string; clock_in: string | null; clock_out: string | null; status: string | null; break_total_mins: number | null }
  const attLogs = (attRaw ?? []) as AttLogRow[]
  type AttAcc = { loginHrs: number; loginDays: number; breakMins: number }
  const attAccMap: Record<string, AttAcc> = {}
  for (const a of attLogs) {
    if (!a.clock_in) continue
    if (!attAccMap[a.user_id]) attAccMap[a.user_id] = { loginHrs: 0, loginDays: 0, breakMins: 0 }
    const acc = attAccMap[a.user_id]
    acc.breakMins += a.break_total_mins ?? 0
    if (a.clock_out) {
      // Same formula as member dashboard: raw clock_in -> clock_out span, no break deduction
      const span = (new Date(a.clock_out).getTime() - new Date(a.clock_in).getTime()) / 3600000
      if (span > 0) { acc.loginHrs += span; acc.loginDays += 1 }
    }
  }

  // Present Days — shared with Dashboard/Attendance/History/Admin Payroll/Payslip
  // (lib/utils/attendance-stats.ts) so this table can never show a different
  // Present count than what the member sees themselves, or what Payroll actually
  // pays for. Capped at today (not the full calendar month) so a month still in
  // progress doesn't count its not-yet-happened remaining days as absent.
  const workingDaysMap: Record<string, number> = {}
  {
    const rangeEnd = dateTo < todayStr ? dateTo : todayStr
    const clockInDatesByUser: Record<string, Set<string>> = {}
    for (const a of attLogs) {
      if (a.clock_in === null && a.status !== 'present') continue
      if (!clockInDatesByUser[a.user_id]) clockInDatesByUser[a.user_id] = new Set()
      clockInDatesByUser[a.user_id].add(a.date)
    }
    const workHoursByUserDate: Record<string, Record<string, number>> = {}
    for (const u of updates) {
      if (!workHoursByUserDate[u.user_id]) workHoursByUserDate[u.user_id] = {}
      workHoursByUserDate[u.user_id][u.date] = dailyWorkHours(u as unknown as Parameters<typeof dailyWorkHours>[0])
    }
    const leaveDatesByUser: Record<string, Map<string, "full" | "half">> = {}
    for (const l of (leavesRaw ?? []) as { user_id: string; leave_type: string; from_date: string; to_date: string }[]) {
      if (l.leave_type === 'permission' || l.leave_type === 'wfh' || l.leave_type === 'shoot_day') continue
      if (!leaveDatesByUser[l.user_id]) leaveDatesByUser[l.user_id] = new Map()
      const weight = l.leave_type === 'half_day' ? 'half' : 'full'
      const cur = new Date(l.from_date + 'T12:00:00')
      const end = new Date(l.to_date + 'T12:00:00')
      while (cur <= end) {
        const d = cur.toISOString().split('T')[0]
        if (d >= dateFrom && d <= rangeEnd) leaveDatesByUser[l.user_id].set(d, weight)
        cur.setDate(cur.getDate() + 1)
      }
    }
    const rangeDates: string[] = []
    for (let d = new Date(dateFrom + 'T12:00:00'); d.toISOString().split('T')[0] <= rangeEnd; d.setDate(d.getDate() + 1)) {
      rangeDates.push(d.toISOString().split('T')[0])
    }
    for (const m of members) {
      const clockIn = clockInDatesByUser[m.id] ?? new Set<string>()
      const hours = workHoursByUserDate[m.id] ?? {}
      const leaveDates = leaveDatesByUser[m.id] ?? new Map<string, "full" | "half">()
      const summary = summarizeAttendanceDays(rangeDates.map(date => ({
        hasClockIn: clockIn.has(date),
        workHours: hours[date] ?? 0,
        leaveType: leaveDates.get(date),
      })))
      workingDaysMap[m.id] = summary.presentDays
    }
  }

  // ── Per-member accumulator ────────────────────────────────────────────────
  type Acc = {
    trackedHours: number; learningHours: number; totalCost: number
    byType: Record<string, number> // every task_type found, incl. break/learning — future-proof for new types (e.g. scripting)
    clients: Set<string>
    workHoursExclLearning: number
  }
  const accMap: Record<string, Acc> = {}

  for (const du of updates) {
    const member = memberMap.get(du.user_id)
    if (!member) continue
    const hourly  = hourlyForMember(du.user_id, du.date)

    if (!accMap[du.user_id]) {
      accMap[du.user_id] = {
        trackedHours: 0, learningHours: 0, totalCost: 0,
        byType: {}, clients: new Set(), workHoursExclLearning: 0,
      }
    }
    const acc = accMap[du.user_id]

    // Per-type breakdown for display columns only (NOT used for total) —
    // driven entirely by whatever task_type strings actually appear, so a
    // brand-new type (e.g. 'scripting') shows up automatically with no code change.
    for (const e of du.work_entries ?? []) {
      const hrs = e.duration_hours ?? 0
      if (hrs <= 0) continue
      const tt = (e.task_type ?? 'other').toLowerCase()
      if (tt !== 'break' && tt !== 'learning' && e.client_name) acc.clients.add(e.client_name)
      acc.byType[tt] = (acc.byType[tt] ?? 0) + hrs
    }

    const workEntries = Array.isArray(du.work_entries) ? du.work_entries : []

    // Learning hours for badge display
    const learnFromEntries = workEntries
      .filter(e => (e.task_type ?? '').toLowerCase() === 'learning')
      .reduce((s, e) => s + (e.duration_hours ?? 0), 0)
    const learnH = workEntries.length > 0 ? learnFromEntries : (du.learning_hours ?? 0)
    acc.learningHours += learnH

    // Same formula as member dashboard: calcNetWorkHours (interval merge, includes learning).
    // Fallback to stored fields for old records without work_entries.
    const workH = workEntries.length > 0
      ? calcNetWorkHours(workEntries as Parameters<typeof calcNetWorkHours>[0])
      : (du.working_hours ?? 0) + (du.learning_hours ?? 0)

    acc.trackedHours += workH
    acc.totalCost    += workH * hourly

    // Attendance table's "Working Hrs" — same interval-merge logic, but with
    // learning entries stripped out first, so it's a separate number from
    // trackedHours above (which intentionally still includes learning).
    const workHNoLearning = workEntries.length > 0
      ? calcNetWorkHours(workEntries.filter(e => (e.task_type ?? '').toLowerCase() !== 'learning') as Parameters<typeof calcNetWorkHours>[0])
      : (du.working_hours ?? 0)
    acc.workHoursExclLearning += workHNoLearning
  }

  // Add confirmed collab hours to each member's trackedHours + totalCost
  for (const c of (collabRaw ?? []) as { collaborator_id: string; confirmed_hours: number | null; date: string }[]) {
    const ch = c.confirmed_hours ?? 0
    if (ch <= 0) continue
    const hourly = hourlyForMember(c.collaborator_id, c.date)
    if (!accMap[c.collaborator_id]) {
      accMap[c.collaborator_id] = { trackedHours: 0, learningHours: 0, totalCost: 0, byType: {}, clients: new Set(), workHoursExclLearning: 0 }
    }
    accMap[c.collaborator_id].trackedHours += ch
    accMap[c.collaborator_id].totalCost    += ch * hourly
  }

  // ── Member utilization ────────────────────────────────────────────────────
  const MONTHLY_TARGET_HRS = 25 * 8.5 // 212.5h — fixed for everyone, every month (same constant as member dashboard)
  const r1 = (n: number) => Math.round(n * 10) / 10

  const memberUtilization: MemberUtilization[] = members
    .map(m => {
      const acc          = accMap[m.id]
      const att          = attAccMap[m.id]
      const hourly       = hourlyForMember(m.id)
      const workingDays  = workingDaysMap[m.id] ?? 0
      const expectedHours = MONTHLY_TARGET_HRS
      const trackedHours  = acc?.trackedHours ?? 0
      const learningHours = acc?.learningHours ?? 0
      const untrackedHours = Math.max(0, expectedHours - trackedHours)
      const overtimeHours  = Math.max(0, trackedHours - expectedHours)
      const wastedCost    = untrackedHours * hourly
      const overtimeValue = overtimeHours * hourly
      const efficiency    = Math.round((trackedHours / expectedHours) * 100)

      const loginHours    = r1(att?.loginHrs ?? 0)
      const avgLoginHours = (att?.loginDays ?? 0) > 0 ? r1(loginHours / att!.loginDays) : 0
      const breakHours    = r1((att?.breakMins ?? 0) / 60)
      const avgBreakHours = workingDays > 0 ? r1(breakHours / workingDays) : 0
      const workingHoursExclLearning = r1(acc?.workHoursExclLearning ?? 0)
      const avgWorkingHoursExclLearning = workingDays > 0 ? r1(workingHoursExclLearning / workingDays) : 0

      return {
        id: m.id, name: m.name, employeeId: m.employee_id,
        team: m.team, isMedia: m.work_layout === 'media' || m.work_layout === 'freelance_media', monthlySalary: m.monthly_salary ?? 0,
        workingDays, expectedHours,
        trackedHours, learningHours, untrackedHours, overtimeHours,
        wastedCost, overtimeValue, efficiency, overworked: efficiency > 105,
        clients: Array.from(acc?.clients ?? []),
        // 'learning' always comes from learningHours (has its own fallback for old records without work_entries)
        workBreakdown: { ...(acc?.byType ?? {}), learning: learningHours },
        totalCost: acc?.totalCost ?? 0,
        loginHours, avgLoginHours,
        workingHoursExclLearning, avgWorkingHoursExclLearning,
        breakHours, avgBreakHours,
      }
    })
    .filter(m => m.workingDays > 0)
    .sort((a, b) => b.trackedHours - a.trackedHours)

  // ── Leave breakdown (Full Day / Half Day / Permission + balance against the
  // 5-day monthly cap) — clipped to this month the same way sumLeaveDays does
  // everywhere else in the app, so this can never disagree with what the Leaves
  // page or the apply-leave block itself is counting. ─────────────────────────
  type LeaveRow = {
    user_id: string; leave_type: string | null; from_date: string; to_date: string
    permission_hours: number | string | null
    half_day_from_time: string | null; half_day_to_time: string | null
  }
  const leaveRows = (leavesRaw ?? []) as LeaveRow[]
  const leavesByMember = new Map<string, LeaveRow[]>()
  for (const l of leaveRows) {
    if (!leavesByMember.has(l.user_id)) leavesByMember.set(l.user_id, [])
    leavesByMember.get(l.user_id)!.push(l)
  }
  const leaveBreakdown = members
    .map(m => {
      const rows = leavesByMember.get(m.id) ?? []
      let fullDays = 0, halfDays = 0, halfDayHours = 0, permissionHours = 0
      for (const l of rows) {
        const type = l.leave_type ?? 'full_day'
        const start = l.from_date > dateFrom ? l.from_date : dateFrom
        const end   = l.to_date   < dateTo   ? l.to_date   : dateTo
        if (start > end) continue
        if (type === 'full_day') {
          fullDays += Math.ceil((new Date(end + 'T12:00:00').getTime() - new Date(start + 'T12:00:00').getTime()) / 86400000) + 1
        } else if (type === 'half_day') {
          halfDays += 1
          if (l.half_day_from_time && l.half_day_to_time) {
            const [fh, fm] = l.half_day_from_time.split(':').map(Number)
            const [th, tm] = l.half_day_to_time.split(':').map(Number)
            const mins = (th * 60 + tm) - (fh * 60 + fm)
            if (mins > 0) halfDayHours += mins / 60
          }
        } else if (type === 'permission') {
          permissionHours += Number(l.permission_hours) || 0
        }
      }
      const daysUsed = sumLeaveDays(rows as LeaveForBalance[], dateFrom, dateTo)
      return {
        id: m.id, name: m.name,
        fullDays, halfDays, halfDayHours: Math.round(halfDayHours * 10) / 10,
        permissionHours: Math.round(permissionHours * 10) / 10,
        daysUsed: Math.round(daysUsed * 10) / 10,
        balance: Math.round((MONTHLY_LEAVE_CAP - daysUsed) * 10) / 10,
      }
    })
    .filter(r => r.fullDays > 0 || r.halfDays > 0 || r.permissionHours > 0)
    .sort((a, b) => a.balance - b.balance)

  // ── Real client lookup (used to keep break-time / typos / placeholder
  // strings like "Break", "Internal", "Our Brand" from being counted as if
  // they were real clients) ──────────────────────────────────────────────
  const normalizeKey = (s: string) => s.trim().replace(/\s+/g, ' ').toUpperCase()
  const INTERNAL_NAMES = new Set(['GROFAST DIGITAL', 'GROFAST AI', 'KARTHICK BRANDS'])
  type ClientMeta = { id: string; name: string; industry: string | null; status: string }
  const clientMetaMap: Record<string, ClientMeta> = {}
  for (const c of (clientsRaw ?? []) as ClientMeta[]) {
    clientMetaMap[normalizeKey(c.name)] = c
  }
  function isRealClient(name: string): boolean {
    const key = normalizeKey(name)
    return INTERNAL_NAMES.has(key) || key in clientMetaMap
  }

  // What was this client's status on a given date? Falls back to their
  // current status if there's no history entry before that date.
  type ClientStatusRow = { client_id: string; status: string; effective_from: string }
  const clientStatusHistory = (clientStatusHistoryRaw ?? []) as ClientStatusRow[]
  function statusOnDate(clientId: string | undefined, date: string, fallback: string): string {
    if (!clientId) return fallback
    let best: ClientStatusRow | null = null
    for (const h of clientStatusHistory) {
      if (h.client_id !== clientId || h.effective_from > date) continue
      if (!best || h.effective_from > best.effective_from) best = h
    }
    return best?.status ?? fallback
  }

  // ── Client hours ──────────────────────────────────────────────────────────
  const clientMap: Record<string, { hours: number; cost: number }> = {}
  for (const du of updates) {
    const hourly = hourlyForMember(du.user_id, du.date)
    for (const e of du.work_entries ?? []) {
      if ((e.task_type ?? '').toLowerCase() === 'break') continue
      const hrs = e.duration_hours ?? 0
      const clientName = e.client_name
      if (hrs <= 0 || !clientName || !isRealClient(clientName)) continue
      const key = clientMetaMap[normalizeKey(clientName)]?.name
        ?? [...INTERNAL_NAMES].find(n => n === normalizeKey(clientName))
        ?? clientName
      if (!clientMap[key]) clientMap[key] = { hours: 0, cost: 0 }
      clientMap[key].hours += hrs
      clientMap[key].cost  += hrs * hourly
    }
  }
  const clientHours: ClientHour[] = Object.entries(clientMap)
    .map(([name, v]) => ({ name, ...v }))
    .sort((a, b) => b.hours - a.hours)
    .slice(0, 20)

  // Previous month's total real-client hours — same filtering as clientMap above,
  // just summed rather than broken out per client, for the donut's "vs last month" delta.
  let prevMonthClientHours = 0
  for (const du of (prevUpdatesRaw ?? []) as { work_entries: UpdateRow['work_entries'] }[]) {
    for (const e of du.work_entries ?? []) {
      if ((e.task_type ?? '').toLowerCase() === 'break') continue
      const hrs = e.duration_hours ?? 0
      if (hrs <= 0 || !e.client_name || !isRealClient(e.client_name)) continue
      prevMonthClientHours += hrs
    }
  }

  // ── KPIs ──────────────────────────────────────────────────────────────────
  const totalTrackedHours   = memberUtilization.reduce((s, m) => s + m.trackedHours, 0)
  const totalLearningHours  = memberUtilization.reduce((s, m) => s + m.learningHours, 0)
  const totalUntrackedHours = memberUtilization.reduce((s, m) => s + m.untrackedHours, 0)
  const totalCost           = memberUtilization.reduce((s, m) => s + m.totalCost, 0)
  const totalWastedCost     = memberUtilization.reduce((s, m) => s + m.wastedCost, 0)
  const activeMemberCount  = memberUtilization.length
  const clientsServedCount = Object.keys(clientMap).length
  const avgEfficiency      = activeMemberCount > 0
    ? Math.round(memberUtilization.reduce((s, m) => s + m.efficiency, 0) / activeMemberCount)
    : 0
  const shootHours = memberUtilization.reduce((s, m) => s + (m.workBreakdown.shoot ?? 0), 0)
  const editHours  = memberUtilization.reduce((s, m) => s + (m.workBreakdown.edit ?? 0), 0)

  const kpis: InsightsKPIs = {
    totalTrackedHours, totalLearningHours, totalUntrackedHours, totalCost, totalWastedCost,
    activeMemberCount, clientsServedCount, avgEfficiency, shootHours, editHours,
  }

  // ── Spend by client category ──────────────────────────────────────────────
  const spendCats = { internal: { hours: 0, cost: 0 }, active: { hours: 0, cost: 0 }, past: { hours: 0, cost: 0 }, unassigned: { hours: 0, cost: 0 } }

  for (const du of updates) {
    const hourly = hourlyForMember(du.user_id, du.date)
    for (const e of du.work_entries ?? []) {
      if ((e.task_type ?? '').toLowerCase() === 'break') continue
      const hrs = e.duration_hours ?? 0
      if (hrs <= 0) continue
      const cost = hrs * hourly
      // No client name, or a placeholder/typo that doesn't match any real
      // client (e.g. "Internal", "Our Brand") — goes to Unassigned instead
      // of silently defaulting to Active.
      if (!e.client_name || !isRealClient(e.client_name)) {
        spendCats.unassigned.hours += hrs; spendCats.unassigned.cost += cost; continue
      }
      const key  = normalizeKey(e.client_name)
      const meta = clientMetaMap[key]
      if (INTERNAL_NAMES.has(key) || meta?.industry === 'Internal Brand') {
        spendCats.internal.hours += hrs; spendCats.internal.cost += cost
      } else if (statusOnDate(meta?.id, du.date, meta?.status ?? 'active') === 'past') {
        spendCats.past.hours += hrs; spendCats.past.cost += cost
      } else {
        spendCats.active.hours += hrs; spendCats.active.cost += cost
      }
    }
  }

  const spendByCategory: SpendCategory[] = [
    { label: 'Active Clients',   emoji: '🟢', ...spendCats.active,     color: '#22C55E' },
    { label: 'Internal Brands',  emoji: '🏢', ...spendCats.internal,   color: '#DE1A1A' },
    { label: 'Past Clients',     emoji: '📁', ...spendCats.past,       color: '#9CA3AF' },
    { label: 'Unassigned',       emoji: '❓', ...spendCats.unassigned, color: '#F59E0B' },
  ].filter(c => c.hours > 0)

  const allMembers: AllMember[] = [...members]
    .sort((a, b) => a.employee_id.localeCompare(b.employee_id))
    .map(m => ({
      name: m.name,
      employeeId: m.employee_id,
      team: m.team,
      monthlySalary: m.monthly_salary ?? 0,
      hourlyRate: deriveHourly(m),
    }))

  return (
    <InsightsClient
      month={month}
      today={todayStr}
      kpis={kpis}
      memberUtilization={memberUtilization}
      leaveBreakdown={leaveBreakdown}
      clientHours={clientHours}
      prevMonthClientHours={prevMonthClientHours}
      spendByCategory={spendByCategory}
      allMembers={allMembers}
    />
  )
}
