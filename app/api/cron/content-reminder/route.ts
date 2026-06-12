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

// Runs daily at 8:00 AM IST (2:30 AM UTC). Finds all content posts scheduled
// for today that have not yet been reminded, and sends a WhatsApp morning
// reminder to each assigned employee.
export async function GET(req: NextRequest) {
  if (!isAuthorized(req)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const admin = adminSupabase()

  // Today's date in IST
  const now = new Date()
  const istNow = new Date(now.toLocaleString('en-US', { timeZone: 'Asia/Kolkata' }))
  const today = `${istNow.getFullYear()}-${String(istNow.getMonth() + 1).padStart(2, '0')}-${String(istNow.getDate()).padStart(2, '0')}`

  // All pending/in_progress/ready posts for today that haven't been reminded
  const { data: posts, error } = await admin
    .from('content_posts')
    .select('id, title, client_name, scheduled_time, assigned_to')
    .eq('scheduled_date', today)
    .eq('reminder_sent', false)
    .in('status', ['pending', 'in_progress', 'ready'])
    .not('assigned_to', 'is', null)

  if (error) {
    console.error('[content-reminder] query error:', error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  if (!posts?.length) {
    return NextResponse.json({ reminded: 0, message: 'No posts scheduled today' })
  }

  let reminded = 0

  await Promise.all(posts.map(async (post) => {
    const { data: assignee } = await admin
      .from('users')
      .select('name, phone')
      .eq('id', post.assigned_to)
      .single()

    if (!assignee?.phone) return

    // Format scheduled time if set, e.g. "5:00 PM", otherwise "Today"
    let timeLabel = 'Today'
    if (post.scheduled_time) {
      const [h, m] = (post.scheduled_time as string).split(':').map(Number)
      const ampm = h >= 12 ? 'PM' : 'AM'
      const hour12 = h % 12 || 12
      timeLabel = `${hour12}:${String(m).padStart(2, '0')} ${ampm}`
    }

    const ok = await sendWhatsAppTemplate(
      formatPhone(assignee.phone),
      'grofast_content_reminder',
      [assignee.name, post.title, post.client_name, timeLabel]
    ).catch(() => false)

    if (ok) {
      reminded++
      await admin
        .from('content_posts')
        .update({ reminder_sent: true })
        .eq('id', post.id)
    }
  }))

  return NextResponse.json({ date: today, reminded })
}
