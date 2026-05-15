import { createClient } from '@supabase/supabase-js'
import { NextRequest, NextResponse } from 'next/server'
import { sendWhatsAppTemplate, formatPhone } from '@/lib/whatsapp'

function adminSupabase() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  )
}

function isAuthorized(req: NextRequest): boolean {
  const secret = process.env.CRON_SECRET
  return !!secret && req.headers.get('authorization') === `Bearer ${secret}`
}

function getCompanyId(req: NextRequest): string | null {
  const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
  const p = req.nextUrl.searchParams.get('company_id')
  const e = process.env.CRON_COMPANY_ID
  if (p && UUID.test(p)) return p
  if (e && UUID.test(e)) return e
  return null
}

// Fires at 10 PM IST (16:30 UTC).
// Finds members who clocked in today but never clocked out.
// Sets clock_out = now, sends WhatsApp to member + admin summary.
export async function GET(req: NextRequest) {
  if (!isAuthorized(req)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const companyId = getCompanyId(req)
  if (!companyId) {
    return NextResponse.json({ error: 'company_id required — provide ?company_id=UUID or set CRON_COMPANY_ID env var' }, { status: 400 })
  }

  const admin = adminSupabase()
  const now = new Date()

  // Today's date in IST
  const istDate = new Date(now.toLocaleString('en-US', { timeZone: 'Asia/Kolkata' }))
  const today = `${istDate.getFullYear()}-${String(istDate.getMonth() + 1).padStart(2, '0')}-${String(istDate.getDate()).padStart(2, '0')}`

  // Find attendance records: clocked in today but no clock_out
  const { data: unclosed } = await admin
    .from('attendance')
    .select('id, user_id, clock_in, users(id, name, phone)')
    .eq('company_id', companyId)
    .eq('date', today)
    .not('clock_in', 'is', null)
    .is('clock_out', null)

  if (!unclosed?.length) {
    return NextResponse.json({ autoLoggedOut: 0, message: 'All members clocked out' })
  }

  const clockOutTime = now.toISOString()
  let autoLoggedOut = 0
  let notified = 0

  await Promise.all(
    unclosed.map(async (rec: any) => {
      const { error } = await admin
        .from('attendance')
        .update({ clock_out: clockOutTime })
        .eq('id', rec.id)

      if (!error) autoLoggedOut++

      const user = Array.isArray(rec.users) ? rec.users[0] : rec.users
      if (user?.phone) {
        const firstName = (user.name as string).split(' ')[0]
        const ok = await sendWhatsAppTemplate(
          formatPhone(user.phone),
          'grofast_auto_logout',
          [firstName, '10:00 PM']
        ).catch(() => false)
        if (ok) notified++
      }
    })
  )

  // Admin summary notification
  const { data: adminUser } = await admin
    .from('users')
    .select('phone')
    .eq('company_id', companyId)
    .eq('role', 'ADMIN')
    .limit(1)
    .single()

  if (adminUser?.phone && unclosed.length > 0) {
    const names = unclosed
      .map((r: any) => {
        const u = Array.isArray(r.users) ? r.users[0] : r.users
        return (u?.name as string) ?? 'Unknown'
      })
      .slice(0, 5)
      .join(', ')
    const display = unclosed.length > 5 ? `${names} and ${unclosed.length - 5} more` : names
    await sendWhatsAppTemplate(
      formatPhone(adminUser.phone),
      'grofast_admin_auto_logout_summary',
      [String(unclosed.length), display]
    ).catch(() => {/* non-fatal */})
  }

  return NextResponse.json({
    date: today,
    autoLoggedOut,
    notified,
    clockOutTime,
  })
}
