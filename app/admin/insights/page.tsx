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

// ── Types ─────────────────────────────────────────────────────────────────────

type MemberRow = {
  id: string
  name: string
  employee_id: string
  monthly_salary: number | null
  hourly_rate: number | null
  team: string | null
}

type UpdateRow = {
  user_id: string
  date: string
  work_entries: {
    client_name?: string
    task_type?: string
    duration_hours?: number
  }[] | null
  learning_hours: number | null
}

export type MemberUtilization = {
  id: string
  name: string
  employeeId: string
  team: string | null
  monthlySalary: number
  workingDays: number
  expectedHours: number       // workingDays × 8.5
  trackedHours: number        // work_entries sum + learning_hours
  learningHours: number
  untrackedHours: number      // max(0, expected - tracked)
  wastedCost: number          // untracked × hourly_rate
  efficiency: number          // (tracked / expected) × 100
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
  ] = await Promise.all([
    admin.from('daily_updates')
      .select('user_id, date, work_entries, learning_hours')
      .eq('company_id', cid)
      .gte('date', dateFrom)
      .lte('date', dateTo),
    admin.from('users')
      .select('id, name, employee_id, monthly_salary, hourly_rate, team')
      .eq('company_id', cid)
      .eq('role', 'MEMBER')
      .eq('status', 'active')
      .order('name'),
    admin.from('attendance_logs')
      .select('user_id, clock_in')
      .eq('company_id', cid)
      .gte('date', dateFrom)
      .lte('date', dateTo)
      .not('clock_in', 'is', null),
    admin.from('clients')
      .select('name, industry, status')
      .eq('company_id', cid),
  ])

  const updates = (updatesRaw ?? []) as UpdateRow[]
  const members = (membersRaw ?? []) as MemberRow[]
  const memberMap = new Map(members.map(m => [m.id, m]))

  // ── Working days from attendance ──────────────────────────────────────────
  const workingDaysMap: Record<string, number> = {}
  for (const a of (attRaw ?? []) as { user_id: string; clock_in: string | null }[]) {
    if (a.clock_in) workingDaysMap[a.user_id] = (workingDaysMap[a.user_id] ?? 0) + 1
  }

  // ── Per-member accumulator ────────────────────────────────────────────────
  type Acc = {
    trackedHours: number; learningHours: number; totalCost: number
    shoot: number; edit: number; technical: number; voiceover: number; poster: number
    clients: Set<string>
  }
  const accMap: Record<string, Acc> = {}
  const dailyMap: Record<string, { hours: number; cost: number }> = {}

  for (const du of updates) {
    const member = memberMap.get(du.user_id)
    if (!member) continue
    const hourly = deriveHourly(member)

    if (!accMap[du.user_id]) {
      accMap[du.user_id] = {
        trackedHours: 0, learningHours: 0, totalCost: 0,
        shoot: 0, edit: 0, technical: 0, voiceover: 0, poster: 0,
        clients: new Set(),
      }
    }
    const acc = accMap[du.user_id]

    const learnH = du.learning_hours ?? 0
    acc.learningHours += learnH
    acc.trackedHours  += learnH
    acc.totalCost     += learnH * hourly

    let dayHrs = learnH
    for (const e of du.work_entries ?? []) {
      const hrs = e.duration_hours ?? 0
      if (hrs <= 0) continue
      const cost = hrs * hourly
      const tt   = (e.task_type ?? 'other').toLowerCase()

      acc.trackedHours += hrs
      acc.totalCost    += cost
      dayHrs           += hrs

      if (e.client_name) acc.clients.add(e.client_name)

      if      (tt === 'shoot')               acc.shoot     += hrs
      else if (tt === 'edit')                acc.edit      += hrs
      else if (tt === 'voiceover')           acc.voiceover += hrs
      else if (tt === 'poster')              acc.poster    += hrs
      else                                   acc.technical += hrs
    }

    if (!dailyMap[du.date]) dailyMap[du.date] = { hours: 0, cost: 0 }
    dailyMap[du.date].hours += dayHrs
    dailyMap[du.date].cost  += dayHrs * hourly
  }

  // ── Member utilization ────────────────────────────────────────────────────
  const memberUtilization: MemberUtilization[] = members
    .map(m => {
      const acc          = accMap[m.id]
      const hourly       = deriveHourly(m)
      const workingDays  = workingDaysMap[m.id] ?? 0
      const expectedHours = workingDays * 8.5
      const trackedHours  = acc?.trackedHours ?? 0
      const learningHours = acc?.learningHours ?? 0
      const untrackedHours = Math.max(0, expectedHours - trackedHours)
      const wastedCost    = untrackedHours * hourly
      const efficiency    = expectedHours > 0
        ? Math.round((trackedHours / expectedHours) * 100)
        : trackedHours > 0 ? 100 : 0

      return {
        id: m.id, name: m.name, employeeId: m.employee_id,
        team: m.team, monthlySalary: m.monthly_salary ?? 0,
        workingDays, expectedHours,
        trackedHours, learningHours, untrackedHours,
        wastedCost, efficiency, overworked: efficiency > 105,
        clients: Array.from(acc?.clients ?? []),
        workBreakdown: {
          shoot: acc?.shoot ?? 0, edit: acc?.edit ?? 0,
          technical: acc?.technical ?? 0, voiceover: acc?.voiceover ?? 0,
          poster: acc?.poster ?? 0, learning: learningHours,
        },
        totalCost: acc?.totalCost ?? 0,
      }
    })
    .filter(m => m.workingDays > 0 || m.trackedHours > 0)
    .sort((a, b) => b.trackedHours - a.trackedHours)

  // ── Client hours ──────────────────────────────────────────────────────────
  const clientMap: Record<string, { hours: number; cost: number }> = {}
  for (const du of updates) {
    const hourly = deriveHourly(memberMap.get(du.user_id) ?? { id: '', name: '', employee_id: '', monthly_salary: null, hourly_rate: null, team: null })
    for (const e of du.work_entries ?? []) {
      const hrs = e.duration_hours ?? 0
      if (hrs <= 0 || !e.client_name) continue
      if (!clientMap[e.client_name]) clientMap[e.client_name] = { hours: 0, cost: 0 }
      clientMap[e.client_name].hours += hrs
      clientMap[e.client_name].cost  += hrs * hourly
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
  const INTERNAL_NAMES = new Set(['GROFAST DIGITAL', 'GROFAST AI', 'KARTHICK BRANDS'])
  type ClientMeta = { name: string; industry: string | null; status: string }
  const clientMetaMap: Record<string, ClientMeta> = {}
  for (const c of (clientsRaw ?? []) as ClientMeta[]) {
    clientMetaMap[c.name.toUpperCase()] = c
  }

  const spendCats = { internal: { hours: 0, cost: 0 }, active: { hours: 0, cost: 0 }, past: { hours: 0, cost: 0 }, unassigned: { hours: 0, cost: 0 } }

  for (const du of updates) {
    const hourly = deriveHourly(memberMap.get(du.user_id) ?? { id: '', name: '', employee_id: '', monthly_salary: null, hourly_rate: null, team: null })
    for (const e of du.work_entries ?? []) {
      const hrs = e.duration_hours ?? 0
      if (hrs <= 0) continue
      const cost = hrs * hourly
      if (!e.client_name) { spendCats.unassigned.hours += hrs; spendCats.unassigned.cost += cost; continue }
      const key = e.client_name.toUpperCase()
      if (INTERNAL_NAMES.has(key) || clientMetaMap[key]?.industry === 'Internal Brand') {
        spendCats.internal.hours += hrs; spendCats.internal.cost += cost
      } else if (clientMetaMap[key]?.status === 'past') {
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

  return (
    <InsightsClient
      month={month}
      today={todayStr}
      kpis={kpis}
      memberUtilization={memberUtilization}
      clientHours={clientHours}
      dailyTrend={dailyTrend}
      spendByCategory={spendByCategory}
    />
  )
}
