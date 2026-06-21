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

export default async function InsightsPage({
  searchParams,
}: {
  searchParams: Promise<{ month?: string }>
}) {
  const { month: rawMonth } = await searchParams
  const now = new Date()
  const month = rawMonth ?? `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`
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
    { data: workLogsRaw },
    { data: postsRaw },
    { data: activitiesRaw },
    { data: usersRaw },
    { data: tasksRaw },
    { data: allClientsRaw },
    { data: dailyUpdatesRaw },
  ] = await Promise.all([
    admin.from('work_logs')
      .select('user_id, activity_id, client_name, hours, unit_count, item_titles, cost, date')
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
    admin.from('tasks')
      .select('assigned_to, status')
      .eq('company_id', cid)
      .eq('status', 'completed'),
    admin.from('clients')
      .select('name')
      .eq('company_id', cid)
      .eq('status', 'active')
      .order('name'),
    admin.from('daily_updates')
      .select('user_id, working_hours, work_entries')
      .eq('company_id', cid).gte('date', dateFrom).lte('date', dateTo),
  ])

  type LogRow    = { user_id: string; activity_id: string; client_name: string | null; hours: number; unit_count: number; item_titles: string[]; cost: number; date: string }
  type PostRow   = { user_id: string; client_name: string | null; platform: string; post_type: string; date: string }
  type ActRow    = { id: string; name: string; team_category: string; unit_type: string; emoji: string }
  type UserRow   = { id: string; name: string; employee_id: string; monthly_salary: number | null; hourly_rate: number | null }
  type TaskRow   = { assigned_to: string; status: string }
  type DURow     = { user_id: string; working_hours: number | null; work_entries: { client_name?: string | null; client_names?: string[] | null; is_multi_client?: boolean; duration_hours?: number | null; task_type?: string }[] | null }

  const logs       = (workLogsRaw      ?? []) as LogRow[]
  const posts      = (postsRaw         ?? []) as PostRow[]
  const activities = (activitiesRaw    ?? []) as ActRow[]
  const members    = (usersRaw         ?? []) as UserRow[]
  const tasks      = (tasksRaw         ?? []) as TaskRow[]
  const dailyUpdates = (dailyUpdatesRaw ?? []) as DURow[]

  // Build per-member hours and clients from daily_updates (source of truth for non-media members)
  const duHoursMap: Record<string, number>   = {}
  const duClientsMap: Record<string, Set<string>> = {}
  for (const du of dailyUpdates) {
    const uid = du.user_id
    const entries = Array.isArray(du.work_entries) ? du.work_entries : []
    // Sum entry durations, fall back to working_hours field
    const entryH = entries.reduce((s, e) => s + (e.duration_hours ?? 0), 0)
    duHoursMap[uid] = (duHoursMap[uid] ?? 0) + (entryH > 0 ? entryH : (du.working_hours ?? 0))
    // Collect clients
    if (!duClientsMap[uid]) duClientsMap[uid] = new Set()
    for (const e of entries) {
      if (e.is_multi_client && Array.isArray(e.client_names)) {
        e.client_names.forEach(cn => { if (cn) duClientsMap[uid].add(cn) })
      } else if (e.client_name) {
        duClientsMap[uid].add(e.client_name)
      }
    }
  }

  const actMap: Record<string, ActRow>  = {}
  for (const a of activities) actMap[a.id] = a

  const userMap: Record<string, UserRow> = {}
  for (const u of members) userMap[u.id] = u

  // ── Team hours breakdown ──────────────────────────────────────────────────
  const teamHours: Record<string, number> = { MEDIA: 0, META: 0, CREATIVE: 0, AI: 0, OPS: 0 }
  for (const l of logs) {
    const cat = actMap[l.activity_id]?.team_category
    if (cat && teamHours[cat] != null) teamHours[cat] += l.hours
  }

  // ── Activity stats ────────────────────────────────────────────────────────
  const activityStats: Record<string, { name: string; emoji: string; team: string; hours: number; count: number; cost: number; titles: string[] }> = {}
  for (const l of logs) {
    const act = actMap[l.activity_id]
    if (!act) continue
    if (!activityStats[l.activity_id]) {
      activityStats[l.activity_id] = { name: act.name, emoji: act.emoji, team: act.team_category, hours: 0, count: 0, cost: 0, titles: [] }
    }
    activityStats[l.activity_id].hours  += l.hours
    activityStats[l.activity_id].count  += l.unit_count
    activityStats[l.activity_id].cost   += l.cost
    activityStats[l.activity_id].titles.push(...(l.item_titles ?? []).filter(t => t.trim() !== ''))
  }

  // ── Member performance ────────────────────────────────────────────────────
  const memberStats: Record<string, { name: string; employee_id: string; hours: number; cost: number; entries: number }> = {}
  for (const l of logs) {
    const u = userMap[l.user_id]
    if (!u) continue
    if (!memberStats[l.user_id]) {
      memberStats[l.user_id] = { name: u.name, employee_id: u.employee_id, hours: 0, cost: 0, entries: 0 }
    }
    memberStats[l.user_id].hours   += l.hours
    memberStats[l.user_id].cost    += l.cost
    memberStats[l.user_id].entries += 1
  }

  // ── Client hours ─────────────────────────────────────────────────────────
  const clientStats: Record<string, { name: string; hours: number; cost: number }> = {}
  for (const l of logs) {
    const cn = l.client_name ?? 'Unassigned'
    if (!clientStats[cn]) clientStats[cn] = { name: cn, hours: 0, cost: 0 }
    clientStats[cn].hours += l.hours
    clientStats[cn].cost  += l.cost
  }

  // ── Employee performance ─────────────────────────────────────────────────
  const tasksCompletedMap: Record<string, number> = {}
  for (const t of tasks) {
    tasksCompletedMap[t.assigned_to] = (tasksCompletedMap[t.assigned_to] ?? 0) + 1
  }

  const memberClientsMap: Record<string, Set<string>> = {}
  const memberClientHoursMap: Record<string, Record<string, number>> = {}
  for (const l of logs) {
    const cn = l.client_name ?? 'Unassigned'
    if (l.client_name) {
      if (!memberClientsMap[l.user_id]) memberClientsMap[l.user_id] = new Set()
      memberClientsMap[l.user_id].add(l.client_name)
    }
    if (!memberClientHoursMap[l.user_id]) memberClientHoursMap[l.user_id] = {}
    memberClientHoursMap[l.user_id][cn] = (memberClientHoursMap[l.user_id][cn] ?? 0) + l.hours
  }

  const maxTeamHours = Math.max(...members.map(u => (memberStats[u.id]?.hours ?? 0) + (duHoursMap[u.id] ?? 0)), 1)

  const employeePerformance = members.map(u => {
    // Combine work_logs hours + daily_updates hours (work_logs for media team, daily_updates for everyone)
    const wlHours        = memberStats[u.id]?.hours ?? 0
    const duHours        = duHoursMap[u.id] ?? 0
    const hours          = wlHours + duHours
    // Work value: cost from work_logs + hourly_rate × daily_update hours
    const wlCost         = memberStats[u.id]?.cost ?? 0
    const duCost         = duHours * (u.hourly_rate ?? 0)
    const workValue      = wlCost + duCost
    const salary         = u.monthly_salary ?? 0
    const tasksCompleted = tasksCompletedMap[u.id] ?? 0
    // Clients: union of work_logs clients and daily_updates clients
    const wlClients      = memberClientsMap[u.id] ?? new Set<string>()
    const duClients      = duClientsMap[u.id] ?? new Set<string>()
    const allClientSet   = new Set([...wlClients, ...duClients])
    const clients        = Array.from(allClientSet)
    // Hours per client: work_logs breakdown + daily_updates breakdown merged
    const combinedClientHours: Record<string, number> = { ...(memberClientHoursMap[u.id] ?? {}) }
    for (const du of dailyUpdates.filter(d => d.user_id === u.id)) {
      for (const e of (Array.isArray(du.work_entries) ? du.work_entries : [])) {
        const cns = e.is_multi_client && Array.isArray(e.client_names) ? e.client_names : (e.client_name ? [e.client_name] : ['Unassigned'])
        cns.forEach(cn => { if (cn) combinedClientHours[cn] = (combinedClientHours[cn] ?? 0) + (e.duration_hours ?? 0) })
      }
    }
    const hoursPerClient = Object.entries(combinedClientHours)
      .sort(([, a], [, b]) => b - a)
      .map(([name, h]) => ({ name, hours: h }))

    // Productivity score: 50pts from value/salary, 30pts from tasks (max 10), 20pts from hours (vs team max)
    const valuePts = salary > 0 ? Math.min(50, (workValue / salary) * 50) : 0
    const taskPts  = Math.min(30, tasksCompleted * 3)
    const hoursPts = Math.min(20, (hours / maxTeamHours) * 20)
    const productivityScore = Math.round(valuePts + taskPts + hoursPts)

    const hourlyRate = u.hourly_rate ?? 0
    return { id: u.id, name: u.name, employee_id: u.employee_id, clients, tasksCompleted, hours, workValue, salary, hourlyRate, hoursPerClient, productivityScore }
  }).sort((a, b) => b.productivityScore - a.productivityScore)

  // ── Drill-down log entries ───────────────────────────────────────────────
  const logEntries = logs.map(l => ({
    memberId:      l.user_id,
    memberName:    userMap[l.user_id]?.name ?? 'Unknown',
    clientName:    l.client_name ?? 'Unassigned',
    activityName:  actMap[l.activity_id]?.name ?? 'Unknown',
    activityEmoji: actMap[l.activity_id]?.emoji ?? '📝',
    hours:         l.hours,
    cost:          l.cost,
    titles:        (l.item_titles ?? []).filter((t: string) => t.trim() !== ''),
  }))

  // ── Post summary ─────────────────────────────────────────────────────────
  const postsByType: Record<string, number>     = {}
  const postsByPlatform: Record<string, number> = {}
  for (const p of posts) {
    postsByType[p.post_type]    = (postsByType[p.post_type]    ?? 0) + 1
    postsByPlatform[p.platform] = (postsByPlatform[p.platform] ?? 0) + 1
  }

  // ── KPIs ─────────────────────────────────────────────────────────────────
  const totalHours   = logs.reduce((s, l) => s + l.hours, 0)
  const totalCost    = logs.reduce((s, l) => s + l.cost,  0)
  const totalVideos  = logs.filter(l => actMap[l.activity_id]?.name === 'Video Edit').reduce((s, l) => s + l.unit_count, 0)
  const totalPosters = logs.filter(l => actMap[l.activity_id]?.name === 'Poster Design').reduce((s, l) => s + l.unit_count, 0)
  const totalPosts   = posts.length

  const recentPosts = posts.slice(0, 20).map(p => ({
    ...p,
    memberName: userMap[p.user_id]?.name ?? 'Unknown',
  }))

  const PINNED = ['GROFAST DIGITAL', 'KARTHICK BRANDS', 'GROFAST AI']
  const allClientNames = [
    ...PINNED,
    ...((allClientsRaw ?? []) as { name: string }[])
      .map(c => c.name)
      .filter(n => !PINNED.includes(n))
      .sort((a, b) => a.localeCompare(b)),
  ]

  return (
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
      employeePerformance={employeePerformance}
      logEntries={logEntries}
      allClientNames={allClientNames}
    />
  )
}
