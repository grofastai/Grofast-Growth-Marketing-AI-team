export const dynamic = 'force-dynamic'
export const revalidate = 0

import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { sendWhatsAppTemplateDetailed, formatPhone } from '@/lib/whatsapp'
import { createWhatsAppRun } from '@/lib/cron-whatsapp'
import { todayIST } from '@/lib/utils/ist-date'
import { filterAlreadyNotifiedToday, markNotifiedToday, type NotifiedRow } from '@/lib/cron/dedup'

// Send-log marker for the WhatsApp channel (no title/body — hidden from the bell).
const NOTIF_TYPE = 'whatsapp_holiday_reminder_sent'
// The in-app bell notification itself. Deliberately a separate type on its own dedupe
// track: WhatsApp can silently fail at Meta's end, so the bell is the channel that is
// actually guaranteed to reach the employee.
const IN_APP_TYPE = 'holiday_reminder'

interface Member {
  id: string
  name: string
  phone: string | null
}

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
  const run = createWhatsAppRun()
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
  let inApp = 0

  for (const holiday of holidays) {
    // No phone filter here — the in-app notification must reach everyone, including
    // members with no phone number on file (they got nothing at all before).
    const { data: membersRaw } = await admin
      .from('users')
      .select('id, name, phone')
      .eq('company_id', holiday.company_id)
      .eq('status', 'active')

    const members = (membersRaw ?? []) as Member[]

    // --- Channel 1: in-app bell (guaranteed — no external dependency) ---------
    const alreadyInApp = await filterAlreadyNotifiedToday(admin, IN_APP_TYPE, members.map(m => m.id))
    const inAppRows = members
      .filter(m => !alreadyInApp.has(m.id))
      .map(m => ({
        company_id: holiday.company_id,
        user_id: m.id,
        type: IN_APP_TYPE,
        title: `Holiday tomorrow — ${holiday.name}`,
        body: `${dateLabel} is a company holiday. Enjoy your day off!`,
        link: '/member/leaves',
      }))

    if (inAppRows.length) {
      const { error: inAppErr } = await admin.from('notifications').insert(inAppRows)
      if (inAppErr) console.error('[holiday-reminder] in-app insert failed:', inAppErr.message)
      else inApp += inAppRows.length
    }

    // --- Channel 2: WhatsApp (best-effort — Meta can still drop it) -----------
    const candidates = members.filter(m => m.phone)
    checked += candidates.length

    const alreadyNotified = await filterAlreadyNotifiedToday(admin, NOTIF_TYPE, candidates.map(m => m.id))
    const toNotify = candidates.filter(m => !alreadyNotified.has(m.id))

    const notifiedRows: NotifiedRow[] = []
    await Promise.all(
      toNotify.map(async (m) => {
        const phone = formatPhone(m.phone!)
        const res = await sendWhatsAppTemplateDetailed(
          phone, 'grofast_holiday_reminder', [m.name, holiday.name, dateLabel]
        ).catch((err) => {
          console.error(`[holiday-reminder] failed to send to ${m.name}:`, err)
          return { ok: false, messageId: null, error: String(err) }
        })
        run.record('grofast_holiday_reminder', res)
        if (res.ok) {
          sent++
          // provider_ref is what makes a later silent drop traceable back to this person.
          notifiedRows.push({ userId: m.id, companyId: holiday.company_id, providerRef: res.messageId, phone })
        }
      })
    )
    await markNotifiedToday(admin, NOTIF_TYPE, notifiedRows)
  }

  console.log(`[holiday-reminder] date=${tomorrow} checked=${checked} whatsapp=${sent} in_app=${inApp}`)
  return run.respond({ holidays: holidays.length, checked, sent, inApp, date: tomorrow })
}
