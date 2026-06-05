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

// Runs at 11 PM IST (17:30 UTC) daily.
// Finds posts whose scheduled_date is before today and status is not posted/cancelled/missed.
// Marks them missed and sends one WhatsApp alert to each company's admin.
export async function GET(req: NextRequest) {
  if (!isAuthorized(req)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const admin = adminSupabase()

  // Today's date in IST
  const now = new Date()
  const istNow = new Date(now.toLocaleString('en-US', { timeZone: 'Asia/Kolkata' }))
  const today = `${istNow.getFullYear()}-${String(istNow.getMonth() + 1).padStart(2, '0')}-${String(istNow.getDate()).padStart(2, '0')}`

  // Find all overdue unposted posts
  const { data: overdue, error } = await admin
    .from('content_posts')
    .select('id, company_id, title, client_name')
    .lt('scheduled_date', today)
    .not('status', 'in', '("posted","cancelled","missed")')

  if (error) {
    console.error('[content-missed] query error:', error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  if (!overdue?.length) {
    return NextResponse.json({ marked: 0, message: 'No missed posts found' })
  }

  // Bulk-mark all as missed
  const ids = overdue.map(p => p.id)
  const { error: updateError } = await admin
    .from('content_posts')
    .update({ status: 'missed' })
    .in('id', ids)

  if (updateError) {
    console.error('[content-missed] update error:', updateError)
    return NextResponse.json({ error: updateError.message }, { status: 500 })
  }

  // Group by company_id to send one alert per company
  const byCompany: Record<string, number> = {}
  for (const p of overdue) {
    byCompany[p.company_id] = (byCompany[p.company_id] ?? 0) + 1
  }

  const todayLabel = istNow.toLocaleDateString('en-IN', { day: 'numeric', month: 'long', year: 'numeric' })

  await Promise.all(Object.entries(byCompany).map(async ([companyId, count]) => {
    const { data: adminUser } = await admin
      .from('users')
      .select('phone')
      .eq('company_id', companyId)
      .eq('role', 'ADMIN')
      .limit(1)
      .single()

    if (!adminUser?.phone) return

    await sendWhatsAppTemplate(
      formatPhone(adminUser.phone),
      'grofast_content_missed',
      [String(count), todayLabel]
    ).catch(() => {/* non-fatal */})
  }))

  return NextResponse.json({ date: today, marked: overdue.length, companies: Object.keys(byCompany).length })
}
