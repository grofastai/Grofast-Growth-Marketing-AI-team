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

// Runs every 30 minutes. Finds content posts whose scheduled_time falls in the
// next 30 minutes and sends a WhatsApp reminder to the assigned employee.
export async function GET(req: NextRequest) {
  if (!isAuthorized(req)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const admin = adminSupabase()

  // Current time in IST
  const now = new Date()
  const istNow = new Date(now.toLocaleString('en-US', { timeZone: 'Asia/Kolkata' }))

  // Today's date string in IST
  const today = `${istNow.getFullYear()}-${String(istNow.getMonth() + 1).padStart(2, '0')}-${String(istNow.getDate()).padStart(2, '0')}`

  // Window: now → now+30min (exclusive upper bound to avoid double-send)
  const windowStart = `${String(istNow.getHours()).padStart(2, '0')}:${String(istNow.getMinutes()).padStart(2, '0')}:00`
  const plus30 = new Date(istNow.getTime() + 30 * 60 * 1000)
  const windowEnd = `${String(plus30.getHours()).padStart(2, '0')}:${String(plus30.getMinutes()).padStart(2, '0')}:00`

  const { data: posts, error } = await admin
    .from('content_posts')
    .select('id, title, client_name, scheduled_time, assigned_to')
    .eq('scheduled_date', today)
    .gte('scheduled_time', windowStart)
    .lt('scheduled_time', windowEnd)
    .in('status', ['pending', 'in_progress', 'ready'])
    .not('assigned_to', 'is', null)
    .not('scheduled_time', 'is', null)

  if (error) {
    console.error('[content-reminder] query error:', error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  if (!posts?.length) {
    return NextResponse.json({ reminded: 0, message: 'No posts in window' })
  }

  let reminded = 0

  await Promise.all(posts.map(async (post) => {
    const { data: assignee } = await admin
      .from('users')
      .select('name, phone')
      .eq('id', post.assigned_to)
      .single()

    if (!assignee?.phone) return

    // Format time as "5:00 PM"
    const [h, m] = (post.scheduled_time as string).split(':').map(Number)
    const ampm = h >= 12 ? 'PM' : 'AM'
    const hour12 = h % 12 || 12
    const timeLabel = `${hour12}:${String(m).padStart(2, '0')} ${ampm}`

    const ok = await sendWhatsAppTemplate(
      formatPhone(assignee.phone),
      'grofast_content_reminder',
      [assignee.name, post.title, post.client_name, timeLabel]
    ).catch(() => false)

    if (ok) reminded++
  }))

  return NextResponse.json({ date: today, window: `${windowStart}–${windowEnd}`, reminded })
}
