export const dynamic = 'force-dynamic'
export const revalidate = 0

import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { sendWhatsAppTemplate, formatPhone } from '@/lib/whatsapp'

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

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

// Vercel Cron calls this at 10:00 AM IST (30 4 * * * UTC).
// Sends grofast_admin_morning_report to admin with a count of who has/hasn't submitted today.
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
  const dateLabel = new Date().toLocaleDateString('en-IN', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  })

  const [{ data: members }, { data: todayUpdates }, { data: adminUser }] = await Promise.all([
    admin
      .from('users')
      .select('id, name, phone')
      .eq('company_id', companyId)
      .eq('role', 'MEMBER')
      .eq('status', 'active'),
    admin
      .from('daily_updates')
      .select('user_id')
      .eq('company_id', companyId)
      .eq('date', today),
    admin
      .from('users')
      .select('phone')
      .eq('company_id', companyId)
      .eq('role', 'ADMIN')
      .limit(1)
      .single(),
  ])

  const submittedIds = new Set((todayUpdates ?? []).map((u: any) => u.user_id))
  const allMembers = members ?? []
  const pending = allMembers.filter((m: any) => !submittedIds.has(m.id))
  const submittedCount = allMembers.length - pending.length
  const pendingNames = pending.map((m: any) => m.name).slice(0, 10).join(', ')
  const pendingDisplay = pending.length > 10
    ? `${pendingNames} and ${pending.length - 10} more`
    : pendingNames || 'None'

  let whatsappSent = false
  if (adminUser?.phone) {
    whatsappSent = await sendWhatsAppTemplate(
      formatPhone(adminUser.phone),
      'grofast_admin_morning_report',
      [dateLabel, String(submittedCount), String(allMembers.length), pendingDisplay]
    )
  }

  return NextResponse.json({
    date: today,
    totalMembers: allMembers.length,
    submittedCount,
    pendingCount: pending.length,
    pendingNames: pending.map((m: any) => m.name),
    whatsappSent,
    checkedAt: new Date().toISOString(),
  })
}
