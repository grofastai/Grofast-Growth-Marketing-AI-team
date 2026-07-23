export const dynamic = 'force-dynamic'
export const revalidate = 0

import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { sendWhatsAppTemplate, formatPhone } from '@/lib/whatsapp'
import { todayIST } from '@/lib/utils/ist-date'
import { filterAlreadyNotifiedToday, markNotifiedToday } from '@/lib/cron/dedup'

const NOTIF_TYPE = 'whatsapp_logout_nudge_sent'

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

// Fires across a short window from 7:10 PM IST (see vercel.json — same Hobby
// cron imprecision reasoning as attendance-nudge). Finds anyone clocked in today
// with no clock_out yet and sends a reminder to clock out. Full-day leave never
// has a clock_in, so it's excluded automatically — no separate leave check needed.
export async function GET(request: NextRequest) {
  if (!isAuthorized(request)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const admin = adminSupabase()
  const today = todayIST()

  const { data: open, error } = await admin
    .from('attendance_logs')
    .select('user_id, company_id')
    .eq('date', today)
    .not('clock_in', 'is', null)
    .is('clock_out', null)

  if (error) {
    console.error('[logout-nudge] failed to fetch open sessions:', error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  if (!open?.length) {
    return NextResponse.json({ checked: 0, sent: 0, date: today })
  }

  const { data: users } = await admin
    .from('users')
    .select('id, name, phone')
    .in('id', open.map((r: any) => r.user_id))
    .not('phone', 'is', null)

  const companyByUser = new Map(open.map((r: any) => [r.user_id, r.company_id]))
  const candidates = (users ?? []).filter((u: any) => u.phone)

  const alreadyNotified = await filterAlreadyNotifiedToday(admin, NOTIF_TYPE, candidates.map((u: any) => u.id))
  const toNudge = candidates.filter((u: any) => !alreadyNotified.has(u.id))

  let sent = 0
  const notifiedRows: Array<{ userId: string; companyId: string }> = []
  await Promise.all(
    toNudge.map(async (u: any) => {
      const ok = await sendWhatsAppTemplate(formatPhone(u.phone), 'grofast_logout_nudge', [u.name])
        .catch((err) => {
          console.error(`[logout-nudge] failed to send to ${u.name}:`, err)
          return false
        })
      if (ok) { sent++; notifiedRows.push({ userId: u.id, companyId: companyByUser.get(u.id) }) }
    })
  )
  await markNotifiedToday(admin, NOTIF_TYPE, notifiedRows)

  console.log(`[logout-nudge] date=${today} checked=${toNudge.length} sent=${sent}`)
  return NextResponse.json({ checked: toNudge.length, sent, date: today })
}
