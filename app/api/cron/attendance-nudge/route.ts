// app/api/cron/attendance-nudge/route.ts
export const dynamic = 'force-dynamic'
export const revalidate = 0

import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { sendWhatsAppTemplate, formatPhone } from '@/lib/whatsapp'

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

// Runs at 04:30 UTC = 10:00 AM IST.
// Finds active employees with no attendance today and no approved leave, then sends WhatsApp nudge.
export async function GET(request: NextRequest) {
  if (!isAuthorized(request)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const admin = adminSupabase()
  const today = new Date().toISOString().split('T')[0]

  const { data: employees, error: empError } = await admin
    .from('users')
    .select('id, name, phone')
    .eq('role', 'MEMBER')
    .eq('status', 'active')
    .not('phone', 'is', null)

  if (empError) {
    console.error('[attendance-nudge] failed to fetch employees:', empError)
    return NextResponse.json({ error: empError.message }, { status: 500 })
  }

  if (!employees?.length) {
    return NextResponse.json({ checked: 0, sent: 0, date: today })
  }

  const employeeIds = employees.map((e: any) => e.id)

  const [{ data: existing }, { data: onLeave }] = await Promise.all([
    admin
      .from('attendance_logs')
      .select('user_id')
      .eq('date', today)
      .in('user_id', employeeIds),
    admin
      .from('leaves')
      .select('user_id')
      .lte('from_date', today)
      .gte('to_date', today)
      .eq('status', 'approved')
      .in('user_id', employeeIds),
  ])

  const alreadyMarked = new Set((existing ?? []).map((r: any) => r.user_id))
  const onLeaveSet = new Set((onLeave ?? []).map((r: any) => r.user_id))

  const toNudge = employees.filter(
    (e: any) => e.phone && !alreadyMarked.has(e.id) && !onLeaveSet.has(e.id)
  )

  const dateLabel = new Date().toLocaleDateString('en-IN', {
    day: 'numeric', month: 'long', timeZone: 'Asia/Kolkata',
  })

  let sent = 0
  await Promise.all(
    toNudge.map(async (emp: any) => {
      const ok = await sendWhatsAppTemplate(
        formatPhone(emp.phone),
        'grofast_attendance_nudge',
        [emp.name, dateLabel],
        [
          { index: 0, payload: 'attendance_office' },
          { index: 1, payload: 'attendance_wfh' },
          { index: 2, payload: 'attendance_leave' },
        ]
      ).catch((err) => {
        console.error(`[attendance-nudge] failed to send to ${emp.name} (${formatPhone(emp.phone)}):`, err)
        return false
      })
      if (ok) sent++
    })
  )

  console.log(`[attendance-nudge] date=${today} checked=${toNudge.length} sent=${sent}`)
  return NextResponse.json({ checked: toNudge.length, sent, date: today })
}
