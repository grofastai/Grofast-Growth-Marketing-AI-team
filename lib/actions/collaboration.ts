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

export async function confirmCollaboration(
  id: string
): Promise<{ success: boolean; error?: string }> {
  const supabase = await createServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { success: false, error: 'Not authenticated' }

  const admin = adminSupabase()

  const { data: conf } = await admin
    .from('collaboration_confirmations')
    .select('original_start_time, original_end_time, original_duration_hours')
    .eq('id', id)
    .eq('collaborator_id', user.id)
    .single()

  if (!conf) return { success: false, error: 'Not found' }

  const { error } = await admin
    .from('collaboration_confirmations')
    .update({
      status: 'confirmed',
      confirmed_start_time: conf.original_start_time,
      confirmed_end_time: conf.original_end_time,
      confirmed_hours: conf.original_duration_hours,
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

  const admin = adminSupabase()
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
