export const dynamic = 'force-dynamic'

import { createServerClient } from '@/lib/supabase/server'
import { createClient } from '@supabase/supabase-js'
import { redirect } from 'next/navigation'
import InsightsClient, { type AllMember } from './insights-client'
import { calcNetWorkHours } from '@/lib/utils/work-hours'
import { hourlyRateOnDate, type SalaryHistoryRow } from '@/lib/salary'

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
  efficiency: number          // (tracked / 212.5) × 100
  overworked: boolean         // efficiency > 105
  clients: string[]
  workBreakdown: {
    shoot: number
    edit: number
    technical: number
    voiceover: number
    poster: number
    learning: number
  }
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
export type DailyTrend    = { date: string; hours: number; cost: number }

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
  totalCost: number
  totalWastedCost: number
  activeMemberCount: number
  clientsServedCount: number
  avgEfficiency: number
  shootHours: number
  editHours: number
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
      .order('name'),
    admin.from('attendance_logs')
      .select('user_id, clock_in, clock_out, break_total_mins')
      .eq('company_id', cid)
      .gte('date', dateFrom)
      .lte('date', dateTo)
      .not('clock_in', 'is', null),
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
  type AttAcc = { days: number; loginHrs: number; loginDays: number; breakMins: number }
  const attAccMap: Record<string, AttAcc> = {}
  for (const a of (attRaw ?? []) as { user_id: string; clock_in: string | null; clock_out: string | null; break_total_mins: number | null }[]) {
    if (!a.clock_in) continue
    if (!attAccMap[a.user_id]) attAccMap[a.user_id] = { days: 0, loginHrs: 0, loginDays: 0, breakMins: 0 }
    const acc = attAccMap[a.user_id]
    acc.days += 1
    acc.breakMins += a.break_total_mins ?? 0
    if (a.clock_out) {
      // Same formula as member dashboard: raw clock_in -> clock_out span, no break deduction
      const span = (new Date(a.clock_out).getTime() - new Date(a.clock_in).getTime()) / 3600000
      if (span > 0) { acc.loginHrs += span; acc.loginDays += 1 }
    }
  }
  const workingDaysMap: Record<string, number> = {}
  for (const [uid, a] of Object.entries(attAccMap)) workingDaysMap[uid] = a.days

  // ── Per-member accumulator ────────────────────────────────────────────────
  type Acc = {
    trackedHours: number; learningHours: number; totalCost: number
    shoot: number; edit: number; technical: number; voiceover: number; poster: number
    clients: Set<string>
    workHoursExclLearning: number
  }
  const accMap: Record<string, Acc> = {}
  const dailyMap: Record<string, { hours: number; cost: number }> = {}

  for (const du of updates) {
    const member = memberMap.get(du.user_id)
    if (!member) continue
    const hourly  = hourlyForMember(du.user_id, du.date)
    const isMedia = member.work_layout === 'media' || member.work_layout === 'freelance_media'

    if (!accMap[du.user_id]) {
      accMap[du.user_id] = {
        trackedHours: 0, learningHours: 0, totalCost: 0,
        shoot: 0, edit: 0, technical: 0, voiceover: 0, poster: 0,
        clients: new Set(), workHoursExclLearning: 0,
      }
    }
    const acc = accMap[du.user_id]

    // Per-type breakdown for display columns only (NOT used for total)
    for (const e of du.work_entries ?? []) {
      const hrs = e.duration_hours ?? 0
      if (hrs <= 0) continue
      const tt = (e.task_type ?? 'other').toLowerCase()
      if (tt === 'break' || tt === 'learning') continue

      if (e.client_name) acc.clients.add(e.client_name)

      if      (tt === 'shoot')     acc.shoot     += hrs
      else if (tt === 'edit')      acc.edit      += hrs
      else if (tt === 'voiceover') acc.voiceover += hrs
      else if (tt === 'poster')    acc.poster    += hrs
      else                         acc.technical += hrs
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

    if (!dailyMap[du.date]) dailyMap[du.date] = { hours: 0, cost: 0 }
    dailyMap[du.date].hours += workH
    dailyMap[du.date].cost  += workH * hourly
  }

  // Add confirmed collab hours to each member's trackedHours + totalCost
  for (const c of (collabRaw ?? []) as { collaborator_id: string; confirmed_hours: number | null; date: string }[]) {
    const ch = c.confirmed_hours ?? 0
    if (ch <= 0) continue
    const hourly = hourlyForMember(c.collaborator_id, c.date)
    if (!accMap[c.collaborator_id]) {
      accMap[c.collaborator_id] = { trackedHours: 0, learningHours: 0, totalCost: 0, shoot: 0, edit: 0, technical: 0, voiceover: 0, poster: 0, clients: new Set(), workHoursExclLearning: 0 }
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
        wastedCost, efficiency, overworked: efficiency > 105,
        clients: Array.from(acc?.clients ?? []),
        workBreakdown: {
          shoot: acc?.shoot ?? 0, edit: acc?.edit ?? 0,
          technical: acc?.technical ?? 0, voiceover: acc?.voiceover ?? 0,
          poster: acc?.poster ?? 0, learning: learningHours,
        },
        totalCost: acc?.totalCost ?? 0,
        loginHours, avgLoginHours,
        workingHoursExclLearning, avgWorkingHoursExclLearning,
        breakHours, avgBreakHours,
      }
    })
    .filter(m => m.workingDays > 0)
    .sort((a, b) => b.trackedHours - a.trackedHours)

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

  // ── Daily trend ───────────────────────────────────────────────────────────
  const dailyTrend: DailyTrend[] = Object.entries(dailyMap)
    .map(([date, v]) => ({ date, ...v }))
    .sort((a, b) => a.date.localeCompare(b.date))

  // ── KPIs ──────────────────────────────────────────────────────────────────
  const totalTrackedHours  = memberUtilization.reduce((s, m) => s + m.trackedHours, 0)
  const totalLearningHours = memberUtilization.reduce((s, m) => s + m.learningHours, 0)
  const totalCost          = memberUtilization.reduce((s, m) => s + m.totalCost, 0)
  const totalWastedCost    = memberUtilization.reduce((s, m) => s + m.wastedCost, 0)
  const activeMemberCount  = memberUtilization.length
  const clientsServedCount = Object.keys(clientMap).length
  const avgEfficiency      = activeMemberCount > 0
    ? Math.round(memberUtilization.reduce((s, m) => s + m.efficiency, 0) / activeMemberCount)
    : 0
  const shootHours = memberUtilization.reduce((s, m) => s + m.workBreakdown.shoot, 0)
  const editHours  = memberUtilization.reduce((s, m) => s + m.workBreakdown.edit, 0)

  const kpis: InsightsKPIs = {
    totalTrackedHours, totalLearningHours, totalCost, totalWastedCost,
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
      clientHours={clientHours}
      dailyTrend={dailyTrend}
      spendByCategory={spendByCategory}
      allMembers={allMembers}
    />
  )
}
