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

  type LogRow  = { user_id: string; activity_id: string; client_name: string | null; hours: number; unit_count: number; cost: number; date: string }
  type PostRow = { user_id: string; client_name: string | null; platform: string; post_type: string; date: string }
  type ActRow  = { id: string; name: string; team_category: string; unit_type: string; emoji: string }
  type UserRow = { id: string; name: string; employee_id: string; monthly_salary: number | null; hourly_rate: number | null }

  const logs       = (workLogsRaw   ?? []) as LogRow[]
  const posts      = (postsRaw      ?? []) as PostRow[]
  const activities = (activitiesRaw ?? []) as ActRow[]
  const members    = (usersRaw      ?? []) as UserRow[]

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
  const activityStats: Record<string, { name: string; emoji: string; team: string; hours: number; count: number; cost: number }> = {}
  for (const l of logs) {
    const act = actMap[l.activity_id]
    if (!act) continue
    if (!activityStats[l.activity_id]) {
      activityStats[l.activity_id] = { name: act.name, emoji: act.emoji, team: act.team_category, hours: 0, count: 0, cost: 0 }
    }
    activityStats[l.activity_id].hours += l.hours
    activityStats[l.activity_id].count += l.unit_count
    activityStats[l.activity_id].cost  += l.cost
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

  return (
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
  )
}
