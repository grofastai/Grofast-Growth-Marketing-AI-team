'use server'

import { createServerClient } from '@/lib/supabase/server'
import { createClient } from '@supabase/supabase-js'
import { revalidatePath } from 'next/cache'
import { insertNotification } from './notifications'

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
  endTime: string,
  excludeCollabId?: string
): Promise<string | null> {
  if (!startTime || !endTime) return null

  const [updResult, otherCollabsResult, leavesResult] = await Promise.all([
    // Own work entries (all types — breaks, learning, work all count)
    admin.from('daily_updates').select('work_entries').eq('user_id', userId).eq('date', date).maybeSingle(),
    // Other confirmed collab windows for same date
    admin.from('collaboration_confirmations')
      .select('id, confirmed_start_time, confirmed_end_time')
      .eq('collaborator_id', userId).eq('date', date)
      .in('status', ['confirmed', 'edited_confirmed']),
    // Full-day + permission + half-day leave windows
    admin.from('leaves')
      .select('leave_type, half_day_from_time, half_day_to_time, permission_time, permission_hours')
      .eq('user_id', userId)
      .in('status', ['approved', 'pending'])
      .in('leave_type', ['full_day', 'half_day', 'permission'])
      .lte('from_date', date).gte('to_date', date),
  ])

  // Check own work entries (ALL types including breaks and learning)
  const entries = Array.isArray((updResult.data as { work_entries?: unknown } | null)?.work_entries)
    ? (updResult.data as { work_entries: Record<string, unknown>[] }).work_entries
    : []
  for (const e of entries) {
    if (!e.start_time || !e.end_time) continue
    if (timesOverlapCollab(startTime, endTime, e.start_time as string, e.end_time as string)) {
      const type = e.task_type === 'break' ? 'break' : e.task_type === 'learning' ? 'learning entry' : 'work entry'
      return `Collab time ${startTime}–${endTime} overlaps with your own ${type} "${e.title}" (${e.start_time}–${e.end_time}). Use Edit to pick a non-overlapping window, or Reject if you already logged this time yourself.`
    }
  }

  // Check other confirmed collabs on same date
  const otherCollabs = (otherCollabsResult.data ?? []) as { id: string; confirmed_start_time: string | null; confirmed_end_time: string | null }[]
  for (const c of otherCollabs) {
    if (excludeCollabId && c.id === excludeCollabId) continue
    if (!c.confirmed_start_time || !c.confirmed_end_time) continue
    if (timesOverlapCollab(startTime, endTime, c.confirmed_start_time, c.confirmed_end_time)) {
      return `Collab time ${startTime}–${endTime} overlaps with another confirmed collaboration (${c.confirmed_start_time}–${c.confirmed_end_time}). You cannot be in two collaborations at the same time.`
    }
  }

  // Check leave windows (full-day + permission + half-day)
  const leaves = (leavesResult.data ?? []) as { leave_type: string; half_day_from_time?: string | null; half_day_to_time?: string | null; permission_time?: string | null; permission_hours?: number | null }[]
  for (const l of leaves) {
    if (l.leave_type === 'full_day') {
      return `You are on approved Full Day Leave on ${date}. No collaboration allowed on a leave day — reject this tag instead.`
    } else if (l.leave_type === 'half_day' && l.half_day_from_time && l.half_day_to_time) {
      if (timesOverlapCollab(startTime, endTime, l.half_day_from_time, l.half_day_to_time))
        return `Collab time ${startTime}–${endTime} falls within your Half Day Leave (${l.half_day_from_time}–${l.half_day_to_time}). No collaboration allowed during leave time.`
    } else if (l.leave_type === 'permission' && l.permission_time && l.permission_hours) {
      const [h, m] = l.permission_time.split(':').map(Number)
      const total = h * 60 + m + Math.round(l.permission_hours * 60)
      const endH = String(Math.floor(total / 60)).padStart(2, '0')
      const endM = String(total % 60).padStart(2, '0')
      const leaveEnd = `${endH}:${endM}`
      if (timesOverlapCollab(startTime, endTime, l.permission_time, leaveEnd))
        return `Collab time ${startTime}–${endTime} falls within your Permission Leave (${l.permission_time}–${leaveEnd}). No collaboration allowed during leave time.`
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
    startTime, endTime,
    id  // exclude this collab from the "other collabs" check (editing in place)
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

  const { data: conf } = await admin
    .from('collaboration_confirmations')
    .select('daily_update_id, entry_id, submitter_id, company_id, date, entry_snapshot')
    .eq('id', id)
    .eq('collaborator_id', user.id)
    .single()

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

  if (conf) {
    const c = conf as {
      daily_update_id: string; entry_id: string; submitter_id: string
      company_id: string; date: string; entry_snapshot: { title?: string } | null
    }
    const { daily_update_id: dailyUpdateId, entry_id: entryId } = c

    // Tell the submitter their tag was rejected and why — otherwise a rejection
    // (even one that lands days later) silently vanishes into the DB and the
    // submitter never learns their entry needs fixing.
    const { data: rejecter } = await admin.from('users').select('name').eq('id', user.id).single()
    await insertNotification({
      companyId: c.company_id,
      userId: c.submitter_id,
      type: 'collab_rejected',
      title: `${rejecter?.name ?? 'A teammate'} rejected your collaboration tag`,
      body: `On ${c.date}${c.entry_snapshot?.title ? ` — "${c.entry_snapshot.title}"` : ''}: ${reason || 'Not involved'}`,
      link: '/member/history',
    })

    // A rejected tag must stop showing up as "Collaborated" in the rejecter's
    // History — strip them out of the entry-level and record-level participant_ids
    // on the submitter's daily_update. Without this the History page (which reads
    // participant_ids directly, not confirmation status) keeps showing the tag
    // forever, and a collab day wrongly takes priority over a real leave day.
    const { data: record } = await admin
      .from('daily_updates')
      .select('participant_ids, work_entries')
      .eq('id', dailyUpdateId)
      .single()
    if (record) {
      const workEntries = (Array.isArray((record as { work_entries?: unknown }).work_entries)
        ? (record as { work_entries: Record<string, unknown>[] }).work_entries
        : []) as Record<string, unknown>[]
      const updatedEntries = workEntries.map(e =>
        e.id === entryId
          ? { ...e, participant_ids: ((e.participant_ids as string[]) || []).filter(pid => pid !== user.id) }
          : e
      )
      const stillTagged = updatedEntries.some(e =>
        Array.isArray(e.participant_ids) && (e.participant_ids as string[]).includes(user.id)
      )
      const existingParticipants = ((record as { participant_ids?: string[] }).participant_ids || [])
      const updatedParticipants = stillTagged
        ? existingParticipants
        : existingParticipants.filter(pid => pid !== user.id)
      await admin
        .from('daily_updates')
        .update({ work_entries: updatedEntries, participant_ids: updatedParticipants })
        .eq('id', dailyUpdateId)
    }
  }

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
