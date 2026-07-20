'use server'

import { createClient } from '@supabase/supabase-js'
import { revalidatePath } from 'next/cache'
import { getEffectiveUserId } from './impersonate'

function adminSupabase() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  )
}

// The `notifications` table is shared with a legacy WhatsApp send-log (007/008).
// Those rows have no title/body and must never appear in the in-app bell list.
// The whatsapp_*_sent types are dedupe markers for wide-window crons (see
// lib/cron/dedup.ts) — same reasoning, no title/body, must stay out of the bell.
const LOG_ONLY_TYPES = [
  'whatsapp_onboarding', 'whatsapp_daily_alert', 'whatsapp_blast',
  'whatsapp_attendance_nudge_sent', 'whatsapp_logout_nudge_sent', 'whatsapp_holiday_reminder_sent',
]

export interface NotificationRow {
  id: string
  type: string
  title: string
  body: string | null
  read: boolean
  link: string | null
  created_at: string
}

export async function getUnreadNotifications(): Promise<NotificationRow[]> {
  const uid = await getEffectiveUserId()
  if (!uid) return []

  const admin = adminSupabase()
  const { data } = await admin
    .from('notifications')
    .select('id, type, title, body, read, link, created_at')
    .eq('user_id', uid)
    .eq('read', false)
    .not('type', 'in', `(${LOG_ONLY_TYPES.join(',')})`)
    .order('created_at', { ascending: false })
    .limit(5)

  return (data ?? []) as NotificationRow[]
}

export async function getNotificationCount(): Promise<number> {
  const uid = await getEffectiveUserId()
  if (!uid) return 0

  const admin = adminSupabase()
  const { count } = await admin
    .from('notifications')
    .select('*', { count: 'exact', head: true })
    .eq('user_id', uid)
    .eq('read', false)
    .not('type', 'in', `(${LOG_ONLY_TYPES.join(',')})`)

  return count ?? 0
}

export async function markAllRead(): Promise<{ success: boolean }> {
  const uid = await getEffectiveUserId()
  if (!uid) return { success: false }

  const admin = adminSupabase()
  await admin.from('notifications').update({ read: true })
    .eq('user_id', uid).eq('read', false)
    .not('type', 'in', `(${LOG_ONLY_TYPES.join(',')})`)
  revalidatePath('/member', 'layout')
  return { success: true }
}

export async function getAllNotifications(): Promise<NotificationRow[]> {
  const uid = await getEffectiveUserId()
  if (!uid) return []

  const admin = adminSupabase()
  const { data } = await admin
    .from('notifications')
    .select('id, type, title, body, read, link, created_at')
    .eq('user_id', uid)
    .not('type', 'in', `(${LOG_ONLY_TYPES.join(',')})`)
    .order('created_at', { ascending: false })

  return (data ?? []) as NotificationRow[]
}

export async function insertNotification({
  companyId, userId, type, title, body, link,
}: {
  companyId: string; userId: string; type: string
  title: string; body?: string; link?: string
}): Promise<void> {
  const admin = adminSupabase()
  await admin.from('notifications').insert({
    company_id: companyId,
    user_id: userId,
    type,
    title,
    body: body ?? null,
    link: link ?? null,
  })
}

export async function insertManyNotifications(items: {
  companyId: string; userId: string; type: string; title: string; body?: string; link?: string
}[]): Promise<void> {
  if (!items.length) return
  const admin = adminSupabase()
  await admin.from('notifications').insert(
    items.map(i => ({
      company_id: i.companyId,
      user_id: i.userId,
      type: i.type,
      title: i.title,
      body: i.body ?? null,
      link: i.link ?? null,
    }))
  )
}
