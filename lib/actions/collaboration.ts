'use server'

import { createServerClient } from '@/lib/supabase/server'
import { createClient } from '@supabase/supabase-js'
import { revalidatePath } from 'next/cache'

function adminSupabase() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  )
}

function parseTime(t: string): number {
  const [h, m] = t.split(':').map(Number)
  return h * 60 + m
}

function calcHours(start: string, end: string): number {
  return Math.max(0, (parseTime(end) - parseTime(start)) / 60)
}

function timesOverlapCollab(s1: string, e1: string, s2: string, e2: string): boolean {
  if (!s1 || !e1 || !s2 || !e2) return false
  const a = parseTime(s1), b = parseTime(e1), c = parseTime(s2), d = parseTime(e2)
  if (b <= a || d <= c) return false
  return Math.min(b, d) - Math.max(a, c) > 0
}

async function checkCollabOverlapsWork(
  admin: ReturnType<typeof adminSupabase>,
  userId: string,
  date: string,
  startTime: string,
  endTime: string
): Promise<string | null> {
  if (!startTime || !endTime) return null
  const { data: upd } = await admin
    .from('daily_updates')
    .select('work_entries')
    .eq('user_id', userId)
    .eq('date', date)
    .maybeSingle()
  const entries = Array.isArray((upd as { work_entries?: unknown } | null)?.work_entries)
    ? (upd as { work_entries: Record<string, unknown>[] }).work_entries
    : []
  for (const e of entries) {
    if (e.task_type === 'break' || e.task_type === 'learning') continue
    if (!e.start_time || !e.end_time) continue
    if (timesOverlapCollab(startTime, endTime, e.start_time as string, e.end_time as string)) {
      return `Collab time ${startTime}–${endTime} overlaps with your own entry "${e.title}" (${e.start_time}–${e.end_time}). Use Edit to pick a non-overlapping window, or Reject if you already logged this work yourself.`
    }
  }
  return null
}

export async function confirmCollaboration(
  id: string
): Promise<{ success: boolean; error?: string }> {
  const supabase = await createServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { success: false, error: 'Not authenticated' }

  const admin = adminSupabase()

  const { data: conf } = await admin
    .from('collaboration_confirmations')
    .select('date, original_start_time, original_end_time, original_duration_hours')
    .eq('id', id)
    .eq('collaborator_id', user.id)
    .single()

  if (!conf) return { success: false, error: 'Not found' }

  const overlapErr = await checkCollabOverlapsWork(
    admin, user.id,
    (conf as { date: string }).date,
    (conf as { original_start_time: string }).original_start_time,
    (conf as { original_end_time: string }).original_end_time
  )
  if (overlapErr) return { success: false, error: overlapErr }

  const { error } = await admin
    .from('collaboration_confirmations')
    .update({
      status: 'confirmed',
      confirmed_start_time: (conf as { original_start_time: string }).original_start_time,
      confirmed_end_time: (conf as { original_end_time: string }).original_end_time,
      confirmed_hours: (conf as { original_duration_hours: number }).original_duration_hours,
      updated_at: new Date().toISOString(),
    })
    .eq('id', id)
    .eq('collaborator_id', user.id)

  if (error) return { success: false, error: error.message }

  revalidatePath('/member/history')
  revalidatePath('/member/dashboard')
  return { success: true }
}

export async function editCollaborationTime(
  id: string,
  startTime: string,
  endTime: string
): Promise<{ success: boolean; error?: string }> {
  const supabase = await createServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { success: false, error: 'Not authenticated' }

  const hours = calcHours(startTime, endTime)
  if (hours <= 0) return { success: false, error: 'End time must be after start time.' }

  const admin = adminSupabase()

  const { data: conf } = await admin
    .from('collaboration_confirmations')
    .select('date')
    .eq('id', id)
    .eq('collaborator_id', user.id)
    .single()

  if (!conf) return { success: false, error: 'Not found' }

  const overlapErr = await checkCollabOverlapsWork(
    admin, user.id,
    (conf as { date: string }).date,
    startTime, endTime
  )
  if (overlapErr) return { success: false, error: overlapErr }

  const { error } = await admin
    .from('collaboration_confirmations')
    .update({
      status: 'edited_confirmed',
      confirmed_start_time: startTime,
      confirmed_end_time: endTime,
      confirmed_hours: hours,
      updated_at: new Date().toISOString(),
    })
    .eq('id', id)
    .eq('collaborator_id', user.id)

  if (error) return { success: false, error: error.message }

  revalidatePath('/member/history')
  revalidatePath('/member/dashboard')
  return { success: true }
}

export async function rejectCollaboration(
  id: string,
  reason: string
): Promise<{ success: boolean; error?: string }> {
  const supabase = await createServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { success: false, error: 'Not authenticated' }

  const admin = adminSupabase()
  const { error } = await admin
    .from('collaboration_confirmations')
    .update({
      status: 'rejected',
      rejection_reason: reason || 'Not involved',
      updated_at: new Date().toISOString(),
    })
    .eq('id', id)
    .eq('collaborator_id', user.id)

  if (error) return { success: false, error: error.message }

  revalidatePath('/member/history')
  revalidatePath('/member/dashboard')
  return { success: true }
}

export async function deleteCollaborationsByEntry(updateId: string, entryId?: string) {
  const supabase = await createServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { success: false }

  const admin = adminSupabase()
  let q = admin.from('collaboration_confirmations').delete().eq('daily_update_id', updateId)
  if (entryId) q = q.eq('entry_id', entryId)
  await q
  return { success: true }
}

export async function getPendingCollaborationCount(): Promise<number> {
  const supabase = await createServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return 0

  const { count } = await supabase
    .from('collaboration_confirmations')
    .select('id', { count: 'exact', head: true })
    .eq('collaborator_id', user.id)
    .eq('status', 'pending')

  return count ?? 0
}
