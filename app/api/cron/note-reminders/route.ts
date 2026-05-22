export const dynamic = 'force-dynamic'
export const revalidate = 0

import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { insertNotification } from '@/lib/actions/notifications'
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

// Vercel Cron calls this daily at 6 AM UTC (11:30 AM IST) (0 6 * * * UTC).
// Finds notes with due reminders and notifies the owner via in-app bell + WhatsApp.
export async function GET(request: NextRequest) {
  if (!isAuthorized(request)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const admin = adminSupabase()
  const now = new Date().toISOString()

  const { data: dueNotes, error } = await admin
    .from('notes')
    .select('id, user_id, company_id, title, content, reminder_at')
    .lte('reminder_at', now)
    .eq('reminded', false)
    .not('reminder_at', 'is', null)

  if (error) {
    console.error('[note-reminders] query failed:', error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  if (!dueNotes?.length) {
    return NextResponse.json({ checked: 0, triggered: 0, checkedAt: now })
  }

  // Fetch owner phones for WhatsApp
  const userIds = [...new Set(dueNotes.map((n: any) => n.user_id))]
  const { data: users } = await admin
    .from('users')
    .select('id, phone')
    .in('id', userIds)

  const phoneByUser = new Map((users ?? []).map((u: any) => [u.id, u.phone as string | null]))

  let triggered = 0
  await Promise.all(
    dueNotes.map(async (note: any) => {
      const snippet = note.title || note.content.slice(0, 60)
      const reminderLabel = new Date(note.reminder_at).toLocaleString('en-IN', {
        day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit', hour12: true,
        timeZone: 'Asia/Kolkata',
      })

      await insertNotification({
        companyId: note.company_id,
        userId: note.user_id,
        type: 'note_reminder',
        title: '⏰ Note reminder',
        body: snippet,
        link: '/member/notes',
      })

      const phone = phoneByUser.get(note.user_id)
      if (phone) {
        await sendWhatsAppTemplate(formatPhone(phone), 'grofast_note_reminder', [snippet, reminderLabel])
          .catch(console.error)
      }

      triggered++
    })
  )

  // Mark all triggered notes as reminded
  const ids = dueNotes.map((n: any) => n.id)
  await admin.from('notes').update({ reminded: true }).in('id', ids)

  return NextResponse.json({ checked: dueNotes.length, triggered, checkedAt: now })
}
