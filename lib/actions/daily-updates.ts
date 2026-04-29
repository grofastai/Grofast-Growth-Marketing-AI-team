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
  const company_id = profile.company_id

  const { data: update, error: updateError } = await admin
    .from('daily_updates')
    .insert({
      company_id,
      user_id: user.id,
      date: today,
      attendance_status: parsed.data.attendance_status,
      work_type: parsed.data.work_type ?? null,
      working_hours: parsed.data.working_hours ?? null,
      learning_hours: parsed.data.learning_hours,
      shoot_count: parsed.data.shoot_count,
      notes: parsed.data.notes ?? null,
      task_id: parsed.data.task_id ?? null,
    })
    .select('id')
    .single()

  if (updateError) {
    if (updateError.code === '23505') {
      return { success: false, error: 'Already submitted today' }
    }
    return { success: false, error: updateError.message }
  }

  if (parsed.data.shoot_entries.length > 0) {
    const { error: shootError } = await admin.from('shoot_entries').insert(
      parsed.data.shoot_entries.map((entry) => ({
        company_id,
        user_id: user.id,
        daily_update_id: update.id,
        client_name: entry.client_name,
        shoot_type: entry.shoot_type,
        video_count: entry.video_count,
        notes: entry.notes ?? null,
      }))
    )
    if (shootError) return { success: false, error: shootError.message }
  }

  if (parsed.data.editing_entries.length > 0) {
    const { error: editError } = await admin.from('editing_entries').insert(
      parsed.data.editing_entries.map((entry) => ({
        company_id,
        user_id: user.id,
        daily_update_id: update.id,
        client_name: entry.client_name,
        editing_hours: entry.editing_hours,
        folder_link: entry.folder_link || null,
      }))
    )
    if (editError) return { success: false, error: editError.message }
  }

  // Fire WhatsApp notification to admin (non-blocking)
  if (parsed.data.working_hours != null) {
    const { data: adminPhone } = await admin
      .from('users')
      .select('phone')
      .eq('company_id', company_id)
      .eq('role', 'ADMIN')
      .limit(1)
      .single()

    if (adminPhone?.phone) {
      const isLowHours = parsed.data.working_hours < 6 && parsed.data.attendance_status === 'present'
      sendNotification(isLowHours
        ? {
            event: 'hours.underperformance',
            employee_name: profile.name,
            employee_id: profile.employee_id,
            date: today,
            working_hours: parsed.data.working_hours,
            expected_hours: 6,
            admin_phone: adminPhone.phone,
          }
        : {
            event: 'daily_update.submitted',
            employee_name: profile.name,
            employee_id: profile.employee_id,
            date: today,
            attendance_status: parsed.data.attendance_status,
            working_hours: parsed.data.working_hours,
            shoot_count: parsed.data.shoot_count,
            admin_phone: adminPhone.phone,
          }
      ).catch(console.error)
    }
  }

  revalidatePath('/member/update')
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
    .select('*, shoot_entries(*), editing_entries(*)')
    .eq('user_id', user.id)
    .eq('date', today)
    .single()

  return data
}
