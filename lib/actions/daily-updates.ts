'use server'

import { createServerClient } from '@/lib/supabase/server'
import { createClient } from '@supabase/supabase-js'
import { revalidatePath } from 'next/cache'
import { dailyUpdateSchema, type DailyUpdateInput } from '@/lib/validations/daily-update'
import { sendNotification } from '@/lib/notifications/send'

function adminSupabase() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  )
}

export async function submitDailyUpdate(
  input: DailyUpdateInput
): Promise<{ success: boolean; error?: string }> {
  const parsed = dailyUpdateSchema.safeParse(input)
  if (!parsed.success) {
    return { success: false, error: parsed.error.issues[0].message }
  }

  const supabase = await createServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { success: false, error: 'Not authenticated' }

  const admin = adminSupabase()
  const { data: profile } = await admin
    .from('users')
    .select('company_id, name, employee_id, phone')
    .eq('id', user.id)
    .single()

  if (!profile?.company_id) return { success: false, error: 'Profile not found — re-login required' }

  const todayStr = new Date().toISOString().split('T')[0]
  const d = parsed.data
  const today = d.date ?? todayStr
  const isPastDate = today !== todayStr

  // Total working hours = sum of all entry durations
  const totalWorkHours = d.work_entries.reduce((sum, e) => sum + e.duration_hours, 0)
  const roundedHours = Math.round(totalWorkHours * 10) / 10

  // Check if a record already exists for today (allow appending more work)
  const [{ data: existingRecord }, { data: attLog }] = await Promise.all([
    admin
      .from('daily_updates')
      .select('id, work_entries, working_hours, shoot_count, editing_count, learning_hours')
      .eq('user_id', user.id)
      .eq('date', today)
      .maybeSingle(),
    admin
      .from('attendance_logs')
      .select('work_type')
      .eq('user_id', user.id)
      .eq('date', today)
      .maybeSingle(),
  ])

  const workType = (attLog as { work_type?: string | null } | null)?.work_type ?? null

  let isFirstSubmission = false

  if (existingRecord) {
    // Append new entries to existing record
    const combinedEntries = [
      ...(Array.isArray(existingRecord.work_entries) ? existingRecord.work_entries : []),
      ...d.work_entries,
    ]
    const newWorkHours = Math.round(((existingRecord.working_hours || 0) + (d.active_tab !== 'learning' ? roundedHours : 0)) * 10) / 10

    const existingParticipants = (existingRecord as Record<string, unknown>).participant_ids as string[] ?? []
    const mergedParticipants = Array.from(new Set([...existingParticipants, ...(d.participant_ids ?? [])]))
    const updatePayload: Record<string, unknown> = {
      work_entries:    combinedEntries,
      working_hours:   newWorkHours || null,
      shoot_count:     (existingRecord.shoot_count   || 0) + d.shoot_count,
      editing_count:   (existingRecord.editing_count || 0) + d.editing_count,
      participant_ids: mergedParticipants,
      ...(workType ? { work_type: workType } : {}),
    }
    if (d.learning_topic) {
      updatePayload.learning_topic = d.learning_topic
      updatePayload.learning_notes = d.learning_notes ?? null
      updatePayload.learning_hours = Math.round(((existingRecord.learning_hours || 0) + d.learning_hours) * 10) / 10
    }

    const { error: updateError } = await admin
      .from('daily_updates')
      .update(updatePayload)
      .eq('id', existingRecord.id)

    if (updateError) return { success: false, error: updateError.message }
  } else {
    isFirstSubmission = true
    const { error: insertError } = await admin
      .from('daily_updates')
      .insert({
        company_id:          profile.company_id,
        user_id:             user.id,
        date:                today,
        attendance_status:   'present',
        work_type:           workType,
        working_hours:       d.active_tab !== 'learning' ? roundedHours : null,
        learning_hours:      d.learning_hours,
        shoot_count:         d.shoot_count,
        notes:               null,
        work_entries:        d.work_entries,
        learning_topic:      d.learning_topic ?? null,
        learning_notes:      d.learning_notes ?? null,
        links:               d.links,
        editing_count:       d.editing_count,
        shoot_time_hours:    d.shoot_time_hours ?? null,
        editing_time_hours:  d.editing_time_hours ?? null,
        participant_ids:     d.participant_ids ?? [],
      })

    if (insertError) return { success: false, error: insertError.message }
  }

  // WhatsApp notification to admin — only on first submission of today's update
  try {
    if (!isFirstSubmission || isPastDate) {
      revalidatePath('/member/update')
      revalidatePath('/member/dashboard')
      revalidatePath('/admin/activities')
      revalidatePath('/admin/reports')
      return { success: true }
    }
    const { data: adminPhone } = await admin
      .from('users')
      .select('phone')
      .eq('company_id', profile.company_id)
      .eq('role', 'ADMIN')
      .limit(1)
      .single()

    if (adminPhone?.phone && d.active_tab !== 'learning') {
      const isLowHours = roundedHours < 9
      sendNotification(isLowHours
        ? {
            event: 'hours.underperformance',
            employee_name:  profile.name,
            employee_id:    profile.employee_id,
            date:           today,
            working_hours:  roundedHours,
            expected_hours: 9,
            admin_phone:    adminPhone.phone,
          }
        : {
            event:             'daily_update.submitted',
            employee_name:     profile.name,
            employee_id:       profile.employee_id,
            date:              today,
            attendance_status: 'present',
            working_hours:     roundedHours,
            shoot_count:       d.shoot_count,
            admin_phone:       adminPhone.phone,
          }
      ).catch(console.error)
    }
  } catch { /* notifications are non-blocking */ }

  revalidatePath('/member/update')
  revalidatePath('/member/dashboard')
  revalidatePath('/admin/activities')
  revalidatePath('/admin/reports')
  return { success: true }
}

export async function deleteDailyUpdate(id: string): Promise<{ success: boolean; error?: string }> {
  const supabase = await createServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { success: false, error: 'Not authenticated' }

  const admin = adminSupabase()
  // Only allow deleting own records
  const { error } = await admin
    .from('daily_updates')
    .delete()
    .eq('id', id)
    .eq('user_id', user.id)

  if (error) return { success: false, error: error.message }

  revalidatePath('/member/history')
  revalidatePath('/member/dashboard')
  revalidatePath('/admin/activities')
  return { success: true }
}

export async function updatePastDailyUpdate(
  id: string,
  entries: Record<string, unknown>[]
): Promise<{ success: boolean; error?: string }> {
  const supabase = await createServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { success: false, error: 'Not authenticated' }

  const admin = adminSupabase()
  const totalHours = entries.reduce((s, e) => s + ((e.duration_hours as number) ?? 0), 0)

  const { error } = await admin
    .from('daily_updates')
    .update({
      work_entries: entries,
      working_hours: Math.round(totalHours * 10) / 10 || null,
      shoot_count: entries.filter(e => e.task_type === 'shoot').length,
      editing_count: entries.filter(e => e.task_type === 'edit').length,
    })
    .eq('id', id)
    .eq('user_id', user.id)

  if (error) return { success: false, error: error.message }

  revalidatePath('/member/update')
  revalidatePath('/member/history')
  revalidatePath('/admin/activities')
  return { success: true }
}

export async function updateDailyUpdateLearning(
  id: string,
  data: { learning_hours: number | null; learning_topic: string | null; learning_notes: string | null }
): Promise<{ success: boolean; error?: string }> {
  const supabase = await createServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { success: false, error: 'Not authenticated' }

  const admin = adminSupabase()
  const { error } = await admin
    .from('daily_updates')
    .update({
      learning_hours: data.learning_hours,
      learning_topic: data.learning_topic || null,
      learning_notes: data.learning_notes || null,
    })
    .eq('id', id)
    .eq('user_id', user.id)

  if (error) return { success: false, error: error.message }

  revalidatePath('/member/history')
  revalidatePath('/admin/activities')
  return { success: true }
}

export async function getTodayUpdate() {
  const supabase = await createServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return null

  const today = new Date().toISOString().split('T')[0]
  const { data } = await supabase
    .from('daily_updates')
    .select('*')
    .eq('user_id', user.id)
    .eq('date', today)
    .single()

  return data
}
