export const dynamic = 'force-dynamic'
export const revalidate = 0

import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { sendWhatsAppTemplate, formatPhone } from '@/lib/whatsapp'
import { todayIST } from '@/lib/utils/ist-date'
import { filterAlreadyNotifiedToday, markNotifiedToday } from '@/lib/cron/dedup'

const NOTIF_TYPE = 'whatsapp_holiday_reminder_sent'

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

function tomorrowIST(): string {
  const [y, m, d] = todayIST().split('-').map(Number)
  const dt = new Date(Date.UTC(y, m - 1, d + 1))
  return dt.toISOString().split('T')[0]
}

// Fires across a short window around 9:30 PM IST the night before (see vercel.json
// — same Hobby cron imprecision reasoning as attendance-nudge/logout-nudge). Notifies
// every active member (any role) of a company_leaves holiday landing tomorrow.
export async function GET(request: NextRequest) {
  if (!isAuthorized(request)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const admin = adminSupabase()
  const tomorrow = tomorrowIST()

  const { data: holidays, error } = await admin
    .from('company_leaves')
    .select('company_id, date, name')
    .eq('date', tomorrow)

  if (error) {
    console.error('[holiday-reminder] failed to fetch holidays:', error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  if (!holidays?.length) {
    return NextResponse.json({ holidays: 0, sent: 0, date: tomorrow })
  }

  const dateLabel = new Date(tomorrow + 'T12:00:00').toLocaleDateString('en-IN', {
    weekday: 'long', day: 'numeric', month: 'long', timeZone: 'Asia/Kolkata',
  })

  let sent = 0
  let checked = 0

  for (const holiday of holidays) {
    const { data: members } = await admin
      .from('users')
      .select('id, name, phone')
      .eq('company_id', holiday.company_id)
      .eq('status', 'active')
      .not('phone', 'is', null)

    const candidates = (members ?? []).filter((m: any) => m.phone)
    checked += candidates.length

    const alreadyNotified = await filterAlreadyNotifiedToday(admin, NOTIF_TYPE, candidates.map((m: any) => m.id))
    const toNotify = candidates.filter((m: any) => !alreadyNotified.has(m.id))

    const notifiedRows: Array<{ userId: string; companyId: string }> = []
    await Promise.all(
      toNotify.map(async (m: any) => {
        const ok = await sendWhatsAppTemplate(
          formatPhone(m.phone), 'grofast_holiday_reminder', [m.name, holiday.name, dateLabel]
        ).catch((err) => {
          console.error(`[holiday-reminder] failed to send to ${m.name}:`, err)
          return false
        })
        if (ok) { sent++; notifiedRows.push({ userId: m.id, companyId: holiday.company_id }) }
      })
    )
    await markNotifiedToday(admin, NOTIF_TYPE, notifiedRows)
  }

  console.log(`[holiday-reminder] date=${tomorrow} checked=${checked} sent=${sent}`)
  return NextResponse.json({ holidays: holidays.length, checked, sent, date: tomorrow })
}
