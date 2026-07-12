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

// One cron entry per hour, 8:30 AM–9:15 PM IST (Vercel Hobby only allows
// once-per-day-per-entry crons with ±59 min timing precision — see
// https://vercel.com/docs/cron-jobs/usage-and-pricing — so an entry
// scheduled "0 8 * * *" may actually fire anywhere between 8:00–8:59 UTC,
// and the gap between two consecutive hourly entries firing can be as
// wide as ~119 minutes in the worst case).
// Because we can't rely on firing at a precise offset before a post's
// scheduled_time, the match window below is wide (now → now+130min) so
// that whichever run happens to land first still catches the post before
// it's due. reminder_sent prevents a duplicate send on the next run that
// also sees it in its (overlapping) window. This trades exact "X minutes
// before" timing for a guarantee that the reminder always goes out.
export async function GET(req: NextRequest) {
  if (!isAuthorized(req)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const admin = adminSupabase()

  // Current time in IST
  const now = new Date()
  const istNow = new Date(now.toLocaleString('en-US', { timeZone: 'Asia/Kolkata' }))

  const today = `${istNow.getFullYear()}-${String(istNow.getMonth() + 1).padStart(2, '0')}-${String(istNow.getDate()).padStart(2, '0')}`

  // Window: now → now+130min (covers the worst-case ~119min gap between
  // consecutive hourly Hobby cron firings, plus safety margin)
  const plus130 = new Date(istNow.getTime() + 130 * 60 * 1000)
  const windowStart = `${String(istNow.getHours()).padStart(2, '0')}:${String(istNow.getMinutes()).padStart(2, '0')}:00`
  const windowEnd   = `${String(plus130.getHours()).padStart(2, '0')}:${String(plus130.getMinutes()).padStart(2, '0')}:00`

  const { data: posts, error } = await admin
    .from('content_posts')
    .select('id, title, client_name, scheduled_time, assigned_to')
    .eq('scheduled_date', today)
    .gte('scheduled_time', windowStart)
    .lt('scheduled_time', windowEnd)
    .eq('reminder_sent', false)
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

    const [h, m] = (post.scheduled_time as string).split(':').map(Number)
    const ampm = h >= 12 ? 'PM' : 'AM'
    const hour12 = h % 12 || 12
    const timeLabel = `${hour12}:${String(m).padStart(2, '0')} ${ampm}`

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

  return NextResponse.json({ date: today, window: `${windowStart}–${windowEnd}`, reminded })
}
