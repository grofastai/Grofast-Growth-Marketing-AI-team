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

// Runs on the 4th of every month at 4:30 UTC (10:00 AM IST).
// Sends a salary reminder to the admin: tomorrow is salary day, process payroll.
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
  const now = new Date()

  // Payroll month = current month (salaries for this month paid on 5th)
  const monthLabel = now.toLocaleString('en-IN', { month: 'long', year: 'numeric' })
  const salaryDate = new Date(now.getFullYear(), now.getMonth(), 5)
    .toLocaleDateString('en-IN', { day: 'numeric', month: 'long', year: 'numeric' })

  const [{ data: members }, { data: adminUser }] = await Promise.all([
    admin
      .from('users')
      .select('id')
      .eq('company_id', companyId)
      .eq('role', 'MEMBER')
      .eq('status', 'active')
      .is('deleted_at', null),
    admin
      .from('users')
      .select('phone')
      .eq('company_id', companyId)
      .eq('role', 'ADMIN')
      .limit(1)
      .single(),
  ])

  const memberCount = String((members ?? []).length)

  let whatsappSent = false
  if (adminUser?.phone) {
    whatsappSent = await sendWhatsAppTemplate(
      formatPhone(adminUser.phone),
      'grofast_salary_reminder',
      [monthLabel, salaryDate, memberCount]
    )
  }

  return NextResponse.json({
    month: monthLabel,
    salaryDate,
    memberCount,
    whatsappSent,
    sentAt: now.toISOString(),
  })
}
