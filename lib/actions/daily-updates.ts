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

  const today = new Date().toISOString().split('T')[0]
  const d = parsed.data

  // Total working hours = sum of all entry durations
  const totalWorkHours = d.work_entries.reduce((sum, e) => sum + e.duration_hours, 0)
  const roundedHours = Math.round(totalWorkHours * 10) / 10

  // Check if a record already exists for today (allow appending more work)
  const { data: existingRecord } = await admin
    .from('daily_updates')
    .select('id, work_entries, working_hours, shoot_count, editing_count, learning_hours')
    .eq('user_id', user.id)
    .eq('date', today)
    .maybeSingle()

  let isFirstSubmission = false

  if (existingRecord) {
    // Append new entries to existing record
    const combinedEntries = [
      ...(Array.isArray(existingRecord.work_entries) ? existingRecord.work_entries : []),
      ...d.work_entries,
    ]
    const newWorkHours = Math.round(((existingRecord.working_hours || 0) + (d.active_tab === 'working' ? roundedHours : 0)) * 10) / 10

    const existingProofs = Array.isArray((existingRecord as any).work_proof_urls)
      ? (existingRecord as any).work_proof_urls : []
    const updatePayload: Record<string, unknown> = {
      work_entries:    combinedEntries,
      working_hours:   newWorkHours || null,
      shoot_count:     (existingRecord.shoot_count   || 0) + d.shoot_count,
      editing_count:   (existingRecord.editing_count || 0) + d.editing_count,
      work_proof_urls: [...existingProofs, ...(d.work_proof_urls ?? [])],
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
        working_hours:       d.active_tab === 'working' ? roundedHours : null,
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
        work_proof_urls:     d.work_proof_urls ?? [],
      })

    if (insertError) return { success: false, error: insertError.message }
  }

  // WhatsApp notification to admin — only on first submission
  try {
    if (!isFirstSubmission) {
      revalidatePath('/member/update')
      revalidatePath('/member/dashboard')
      revalidatePath('/admin/activities')
      return { success: true }
    }
    const { data: adminPhone } = await admin
      .from('users')
      .select('phone')
      .eq('company_id', profile.company_id)
      .eq('role', 'ADMIN')
      .limit(1)
      .single()

    if (adminPhone?.phone && d.active_tab === 'working') {
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
