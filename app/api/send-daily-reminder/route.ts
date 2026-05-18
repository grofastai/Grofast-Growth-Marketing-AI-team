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

// Vercel Cron calls this at 9:30 AM IST (0 4 * * * UTC).
// Also callable manually with x-webhook-secret + ?company_id=UUID.
// Sends grofast_daily_reminder to active members who haven't submitted today.
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

  const [{ data: members }, { data: todayUpdates }] = await Promise.all([
    admin
      .from('users')
      .select('id, name, phone')
      .eq('company_id', companyId)
      .eq('status', 'active'),
    admin
      .from('daily_updates')
      .select('user_id')
      .eq('company_id', companyId)
      .eq('date', today),
  ])

  const submittedIds = new Set((todayUpdates ?? []).map((u: any) => u.user_id))
  const pending = (members ?? []).filter((m: any) => !submittedIds.has(m.id) && m.phone)

  let sent = 0
  let failed = 0
  const failedNames: string[] = []

  await Promise.all(
    pending.map(async (m: any) => {
      const ok = await sendWhatsAppTemplate(formatPhone(m.phone), 'grofast_daily_reminder', [m.name, dateLabel])
      if (ok) sent++
      else { failed++; failedNames.push(m.name) }
    })
  )

  return NextResponse.json({
    date: today,
    pendingCount: pending.length,
    sent,
    failed,
    failedNames,
    sentAt: new Date().toISOString(),
  })
}
