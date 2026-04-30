export const dynamic = 'force-dynamic'
export const revalidate = 0

import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

// n8n calls this on Monday 9 AM via cron.
// Required: x-webhook-secret header + ?company_id=UUID query param.

function adminSupabase() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  )
}

function resolveUser(u: unknown): { name: string; employee_id: string } | null {
  if (!u) return null
  return Array.isArray(u) ? (u[0] ?? null) : (u as { name: string; employee_id: string })
}

export async function GET(request: NextRequest) {
  const secret = request.headers.get('x-webhook-secret')
  if (!secret || secret !== process.env.INTERNAL_WEBHOOK_SECRET) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const companyId = request.nextUrl.searchParams.get('company_id')
  if (!companyId || !UUID_RE.test(companyId)) {
    return NextResponse.json({ error: 'Valid company_id UUID is required' }, { status: 400 })
  }

  const admin = adminSupabase()
  const today = new Date().toISOString().split('T')[0]
  const weekAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString().split('T')[0]

  const [
    { data: updatesRaw },
    { data: overdueTasks },
    { data: overdueProjects },
    { data: membersRaw },
  ] = await Promise.all([
    admin
      .from('daily_updates')
      .select('user_id, working_hours, shoot_count, date, attendance_status, users(name, employee_id)')
      .eq('company_id', companyId)
      .gte('date', weekAgo)
      .lte('date', today),
    admin
      .from('tasks')
      .select('id')
      .eq('company_id', companyId)
      .neq('status', 'completed')
      .not('due_date', 'is', null)
      .lt('due_date', today),
    admin
      .from('projects')
      .select('id')
      .eq('company_id', companyId)
      .eq('status', 'active')
      .not('deadline', 'is', null)
      .lt('deadline', today),
    admin
      .from('users')
      .select('id')
      .eq('company_id', companyId)
      .eq('role', 'MEMBER')
      .eq('status', 'active'),
  ])

  const updates = (updatesRaw ?? []) as any[]
  const memberCount = (membersRaw ?? []).length

  // Aggregate hours and shoots per user over the week
  const byUser = new Map<string, { name: string; hours: number; shoots: number }>()
  for (const u of updates) {
    if (u.attendance_status !== 'present') continue
    const usr = resolveUser(u.users)
    const name = usr?.name ?? 'Unknown'
    const prev = byUser.get(u.user_id) ?? { name, hours: 0, shoots: 0 }
    byUser.set(u.user_id, {
      name,
      hours: prev.hours + (u.working_hours ?? 0),
      shoots: prev.shoots + (u.shoot_count ?? 0),
    })
  }

  const performers = [...byUser.values()].sort((a, b) => b.hours - a.hours)
  const totalHours = performers.reduce((s, p) => s + p.hours, 0)
  const totalShoots = performers.reduce((s, p) => s + p.shoots, 0)
  const topPerformer = performers[0] ?? null

  // Count days where any member didn't submit (rough measure of missed updates)
  const submittedByDate = new Map<string, Set<string>>()
  for (const u of updates) {
    if (!submittedByDate.has(u.date)) submittedByDate.set(u.date, new Set())
    submittedByDate.get(u.date)!.add(u.user_id)
  }
  let missedUpdateDays = 0
  for (const [, submitted] of submittedByDate) {
    if (submitted.size < memberCount) missedUpdateDays++
  }

  const appUrl = process.env.APP_BASE_URL?.replace(/\/$/, '') ?? ''

  function fmtDate(d: string) {
    return new Date(d).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })
  }

  return NextResponse.json({
    period: { from: weekAgo, to: today },
    periodLabel: `${fmtDate(weekAgo)} – ${fmtDate(today)}`,
    totalHours: Math.round(totalHours * 10) / 10,
    totalShoots,
    topPerformer: topPerformer
      ? { name: topPerformer.name, hours: Math.round(topPerformer.hours * 10) / 10, shoots: topPerformer.shoots }
      : null,
    overdueTaskCount: (overdueTasks ?? []).length,
    overdueProjectCount: (overdueProjects ?? []).length,
    missedUpdateDays,
    dashboardUrl: `${appUrl}/admin/dashboard`,
  })
}
