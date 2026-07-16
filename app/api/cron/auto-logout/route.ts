import { createClient } from '@supabase/supabase-js'
import { NextRequest, NextResponse } from 'next/server'

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
//
// This used to force clock_out = now on anyone still open, which quietly manufactured
// a fake logout time nobody confirmed. That made every forgotten logout look "properly
// closed" to the login gate (findUnresolvedLogoutDate / findLastWorkingDayIssues),
// so the "you forgot to clock out — fix it before logging in again" block
// (lib/actions/auth.ts loginAction, lib/actions/attendance.ts clockIn) never actually
// fired for anyone — the cron always beat them to it.
//
// Now it does nothing to the row. An open session stays open overnight; the member
// hits the real block the next time they try to log in and has to enter their actual
// logout time via "Fix My Time" before they can get back in. This just reports who's
// still open so it's visible without a DB query.
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
    .from('attendance_logs')
    .select('id, user_id, clock_in')
    .eq('company_id', companyId)
    .eq('date', today)
    .not('clock_in', 'is', null)
    .is('clock_out', null)

  if (!unclosed?.length) {
    return NextResponse.json({ stillOpen: 0, message: 'All members clocked out' })
  }

  // attendance_logs.user_id has no FK constraint to users.id in this schema, so an
  // embedded users(...) join can't be resolved — fetch users separately and merge.
  const { data: users } = await admin
    .from('users')
    .select('id, name')
    .in('id', unclosed.map(rec => rec.user_id))
  const userById = new Map((users ?? []).map(u => [u.id, u]))

  return NextResponse.json({
    date: today,
    stillOpen: unclosed.length,
    members: unclosed.map(rec => ({
      name: userById.get(rec.user_id)?.name ?? 'Unknown',
      clockIn: rec.clock_in,
    })),
  })
}
