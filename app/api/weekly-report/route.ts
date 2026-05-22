export const dynamic = 'force-dynamic'
export const revalidate = 0

import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { sendWhatsAppTemplate, formatPhone } from '@/lib/whatsapp'

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

// Vercel Cron calls this every Monday 9:30 AM IST (0 4 * * 1 UTC).
// Also callable manually via x-webhook-secret + ?company_id=UUID.
// Sends grofast_weekly_report to admin with the past 7-day performance summary.

function adminSupabase() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  )
}

function isAuthorized(request: NextRequest): boolean {
  const cronSecret = process.env.CRON_SECRET
  const webhookSecret = process.env.INTERNAL_WEBHOOK_SECRET
  const authHeader = request.headers.get('authorization')
  if (cronSecret && authHeader === `Bearer ${cronSecret}`) return true
  const webhookHeader = request.headers.get('x-webhook-secret')
  if (webhookSecret && webhookHeader === webhookSecret) return true
  return false
}

function getCompanyId(request: NextRequest): string | null {
  const fromParam = request.nextUrl.searchParams.get('company_id')
  if (fromParam && UUID_RE.test(fromParam)) return fromParam
  const fromEnv = process.env.CRON_COMPANY_ID
  if (fromEnv && UUID_RE.test(fromEnv)) return fromEnv
  return null
}

function resolveUser(u: unknown): { name: string; employee_id: string } | null {
  if (!u) return null
  return Array.isArray(u) ? (u[0] ?? null) : (u as { name: string; employee_id: string })
}

export async function GET(request: NextRequest) {
  if (!isAuthorized(request)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const companyId = getCompanyId(request)
  if (!companyId) {
    return NextResponse.json(
      { error: 'company_id required — provide ?company_id=UUID or set CRON_COMPANY_ID env var' },
      { status: 400 }
    )
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

  const periodLabel = `${fmtDate(weekAgo)} – ${fmtDate(today)}`
  const roundedHours = Math.round(totalHours * 10) / 10
  const overdueTaskCount = (overdueTasks ?? []).length
  const overdueProjectCount = (overdueProjects ?? []).length

  // Send weekly summary to admin via WhatsApp
  let whatsappSent = false
  const { data: adminUser } = await admin
    .from('users')
    .select('phone')
    .eq('company_id', companyId)
    .eq('role', 'ADMIN')
    .limit(1)
    .single()

  if (adminUser?.phone) {
    whatsappSent = await sendWhatsAppTemplate(
      formatPhone(adminUser.phone),
      'grofast_weekly_report',
      [
        periodLabel,
        String(roundedHours),
        topPerformer?.name ?? 'N/A',
        String(overdueTaskCount + overdueProjectCount),
      ]
    )
  }

  return NextResponse.json({
    period: { from: weekAgo, to: today },
    periodLabel,
    totalHours: roundedHours,
    totalShoots,
    topPerformer: topPerformer
      ? { name: topPerformer.name, hours: Math.round(topPerformer.hours * 10) / 10, shoots: topPerformer.shoots }
      : null,
    overdueTaskCount,
    overdueProjectCount,
    missedUpdateDays,
    whatsappSent,
    dashboardUrl: `${appUrl}/admin/dashboard`,
  })
}
