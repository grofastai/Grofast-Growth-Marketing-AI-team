'use server'

import { createServerClient } from '@/lib/supabase/server'
import { revalidatePath } from 'next/cache'
import { dailyUpdateSchema, type DailyUpdateInput } from '@/lib/validations/daily-update'
import { sendNotification } from '@/lib/notifications/send'

function parseCompanyId(accessToken: string): string | null {
  try {
    const payload = accessToken.split('.')[1]
    const claims = JSON.parse(atob(payload))
    return claims.company_id ?? null
  } catch {
    return null
  }
}

export async function submitDailyUpdate(
  input: DailyUpdateInput
): Promise<{ success: boolean; error?: string }> {
  const parsed = dailyUpdateSchema.safeParse(input)
  if (!parsed.success) {
    return { success: false, error: parsed.error.issues[0].message }
  }

  const supabase = await createServerClient()
  const {
    data: { session },
  } = await supabase.auth.getSession()

  if (!session) return { success: false, error: 'Not authenticated' }

  const company_id = parseCompanyId(session.access_token)
  if (!company_id) return { success: false, error: 'Missing company claim — re-login required' }

  const today = new Date().toISOString().split('T')[0]

  // Fetch the user's profile for notification data
  const { data: profile } = await supabase
    .from('users')
    .select('name, employee_id, phone')
    .eq('id', session.user.id)
    .single()

  const { data: update, error: updateError } = await supabase
    .from('daily_updates')
    .insert({
      company_id,
      user_id: session.user.id,
      date: today,
      attendance_status: parsed.data.attendance_status,
      work_type: parsed.data.work_type ?? null,
      working_hours: parsed.data.working_hours ?? null,
      learning_hours: parsed.data.learning_hours,
      shoot_count: parsed.data.shoot_count,
      notes: parsed.data.notes ?? null,
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
    const { error: shootError } = await supabase.from('shoot_entries').insert(
      parsed.data.shoot_entries.map((entry) => ({
        company_id,
        user_id: session.user.id,
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
    const { error: editError } = await supabase.from('editing_entries').insert(
      parsed.data.editing_entries.map((entry) => ({
        company_id,
        user_id: session.user.id,
        daily_update_id: update.id,
        client_name: entry.client_name,
        editing_hours: entry.editing_hours,
        folder_link: entry.folder_link || null,
      }))
    )
    if (editError) return { success: false, error: editError.message }
  }

  // Fire WhatsApp notification to admin (non-blocking)
  if (profile && parsed.data.working_hours != null) {
    const { data: adminPhone } = await supabase
      .from('users')
      .select('phone')
      .eq('company_id', company_id)
      .eq('role', 'ADMIN')
      .limit(1)
      .single()

    if (adminPhone?.phone) {
      // Alert if underperformance
      if (parsed.data.working_hours < 9 && parsed.data.attendance_status === 'present') {
        sendNotification({
          event: 'hours.underperformance',
          employee_name: profile.name,
          employee_id: profile.employee_id,
          date: today,
          working_hours: parsed.data.working_hours,
          expected_hours: 9,
          admin_phone: adminPhone.phone,
        }).catch(console.error)
      } else {
        sendNotification({
          event: 'daily_update.submitted',
          employee_name: profile.name,
          employee_id: profile.employee_id,
          date: today,
          attendance_status: parsed.data.attendance_status,
          working_hours: parsed.data.working_hours,
          shoot_count: parsed.data.shoot_count,
          admin_phone: adminPhone.phone,
        }).catch(console.error)
      }
    }
  }

  revalidatePath('/member/update')
  revalidatePath('/admin/activities')
  return { success: true }
}

export async function getTodayUpdate() {
  const supabase = await createServerClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
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
