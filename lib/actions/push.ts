'use server'

import { createServerClient } from '@/lib/supabase/server'
import { createClient } from '@supabase/supabase-js'
import webpush from 'web-push'

function adminSupabase() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  )
}

function setupWebPush() {
  webpush.setVapidDetails(
    `mailto:${process.env.VAPID_EMAIL ?? 'admin@grofast.in'}`,
    process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY!,
    process.env.VAPID_PRIVATE_KEY!
  )
}

export async function sendPushNotification(title: string, body: string, url = '/member/dashboard') {
  const supabase = await createServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'Unauthorized' }

  const admin = adminSupabase()
  const { data: requester } = await admin.from('users').select('company_id, role').eq('id', user.id).single()
  if (!requester || requester.role !== 'ADMIN') return { error: 'Forbidden' }

  setupWebPush()

  const { data: subs } = await admin
    .from('push_subscriptions')
    .select('endpoint, p256dh, auth')
    .eq('company_id', requester.company_id)

  if (!subs?.length) return { success: true, sent: 0 }

  const payload = JSON.stringify({ title, body, url })
  let sent = 0
  const stale: string[] = []

  await Promise.allSettled(
    subs.map(async s => {
      try {
        await webpush.sendNotification(
          { endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } },
          payload
        )
        sent++
      } catch (err: unknown) {
        const status = (err as { statusCode?: number }).statusCode
        if (status === 404 || status === 410) stale.push(s.endpoint)
      }
    })
  )

  if (stale.length) {
    await Promise.all(stale.map(ep =>
      admin.from('push_subscriptions').delete().eq('endpoint', ep)
    ))
  }

  return { success: true, sent }
}
