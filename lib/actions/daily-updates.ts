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

  // Block submission if on approved full-day leave (today only)
  if (!isPastDate) {
    const { data: leaveBlock } = await admin
      .from('leaves')
      .select('id')
      .eq('company_id', profile.company_id)
      .eq('user_id', user.id)
      .eq('status', 'approved')
      .eq('leave_type', 'full_day')
      .lte('from_date', today)
      .gte('to_date', today)
      .maybeSingle()
    if (leaveBlock) {
      return { success: false, error: 'You are on approved leave today. Daily update submission is not allowed.' }
    }
  }

  // Working hours excludes break and learning entries; shoot entries add travel time on top of shoot duration
  const totalWorkHours = d.work_entries
    .filter(e => e.task_type !== 'break' && e.task_type !== 'learning')
    .reduce((sum, e) => {
      const travel = e.task_type === 'shoot' ? (Number((e as Record<string, unknown>)._travel_hours) || 0) : 0
      return sum + e.duration_hours + travel
    }, 0)
  const roundedHours = Math.round(totalWorkHours * 10) / 10
  // Learning hours from entries (new approach — stored in work_entries)
  const newLearnHours = d.work_entries
    .filter(e => e.task_type === 'learning')
    .reduce((sum, e) => sum + e.duration_hours, 0)

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
    // Dedup by ID: new entries replace existing ones with same ID (prevents duplicates on re-save/re-submit)
    const prevEntries = Array.isArray(existingRecord.work_entries) ? existingRecord.work_entries as Array<Record<string, unknown>> : []
    const newIds = new Set(d.work_entries.map(e => e.id).filter(Boolean))
    const filteredPrev = prevEntries.filter(e => !newIds.has(e.id as string))
    const combinedEntries = [...filteredPrev, ...d.work_entries]

    // Recalculate all aggregates from combined entries — never use incremental addition
    const calcWorkHours  = Math.round(combinedEntries.filter(e => e.task_type !== 'break' && e.task_type !== 'learning').reduce((s, e) => {
      const travel = e.task_type === 'shoot' ? (Number((e as Record<string, unknown>)._travel_hours) || 0) : 0
      return s + (Number(e.duration_hours) || 0) + travel
    }, 0) * 10) / 10
    const calcShootCount = combinedEntries.filter(e => e.task_type === 'shoot').length
    const calcEditCount  = combinedEntries.filter(e => e.task_type === 'edit').length
    const calcLearnHours = Math.round(combinedEntries.filter(e => e.task_type === 'learning').reduce((s, e) => s + (Number(e.duration_hours) || 0), 0) * 10) / 10

    const existingParticipants = (existingRecord as Record<string, unknown>).participant_ids as string[] ?? []
    const entryParticipants = d.work_entries.flatMap(e => (e as Record<string, unknown>).participant_ids as string[] ?? []).filter(Boolean)
    const mergedParticipants = Array.from(new Set([...existingParticipants, ...(d.participant_ids ?? []), ...entryParticipants]))
    const updatePayload: Record<string, unknown> = {
      work_entries:    combinedEntries,
      working_hours:   calcWorkHours || null,
      shoot_count:     calcShootCount,
      editing_count:   calcEditCount,
      participant_ids: mergedParticipants,
      ...(workType ? { work_type: workType } : {}),
    }
    if (d.learning_topic) {
      updatePayload.learning_topic      = d.learning_topic
      updatePayload.learning_notes      = d.learning_notes ?? null
      updatePayload.learning_hours      = calcLearnHours
      updatePayload.learning_start_time = d.learning_start_time ?? null
      updatePayload.learning_end_time   = d.learning_end_time   ?? null
    }
    if (calcLearnHours > 0) {
      updatePayload.learning_hours = calcLearnHours
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
        learning_hours:      newLearnHours > 0 ? newLearnHours : d.learning_hours,
        shoot_count:         d.shoot_count,
        notes:               null,
        work_entries:        d.work_entries,
        learning_topic:      d.learning_topic ?? null,
        learning_notes:      d.learning_notes ?? null,
        learning_start_time: d.learning_start_time ?? null,
        learning_end_time:   d.learning_end_time   ?? null,
        links:               d.links,
        editing_count:       d.editing_count,
        shoot_time_hours:    d.shoot_time_hours ?? null,
        editing_time_hours:  d.editing_time_hours ?? null,
        participant_ids:     [...new Set([...(d.participant_ids ?? []), ...d.work_entries.flatMap(e => (e as Record<string, unknown>).participant_ids as string[] ?? []).filter(Boolean)])],
      })

    if (insertError) return { success: false, error: insertError.message }
  }

  // Sync break entries to attendance_logs — dedup by ID same as main entries
  const prevForBreak = existingRecord && Array.isArray(existingRecord.work_entries)
    ? existingRecord.work_entries as { id?: string; task_type: string; start_time?: string | null; end_time?: string | null; duration_hours: number; title?: string }[]
    : []
  const newIdsForBreak = new Set(d.work_entries.map(e => e.id).filter(Boolean))
  const allWorkEntries = [...prevForBreak.filter(e => !newIdsForBreak.has(e.id ?? '')), ...d.work_entries]
  const allBreakEntries = allWorkEntries.filter(e => e.task_type === 'break' && e.duration_hours > 0)
  if (allBreakEntries.length > 0) {
    const breakSessions = allBreakEntries
      .filter(e => e.start_time && e.end_time)
      .map(e => ({
        start: e.start_time,
        end: e.end_time,
        duration_mins: Math.round(e.duration_hours * 60),
        label: e.title || 'Break',
      }))
    const totalBreakMins = allBreakEntries.reduce((s, e) => s + Math.round(e.duration_hours * 60), 0)
    await admin
      .from('attendance_logs')
      .update({ break_sessions: breakSessions, break_total_mins: totalBreakMins })
      .eq('user_id', user.id)
      .eq('date', today)
      .eq('company_id', profile.company_id)
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
      const isLowHours = roundedHours < 9.5
      sendNotification(isLowHours
        ? {
            event: 'hours.underperformance',
            employee_name:  profile.name,
            employee_id:    profile.employee_id,
            date:           today,
            working_hours:  roundedHours,
            expected_hours: 9.5,
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
  const { data: record } = await admin
    .from('daily_updates')
    .select('date, company_id')
    .eq('id', id)
    .eq('user_id', user.id)
    .single()

  const { error } = await admin
    .from('daily_updates')
    .delete()
    .eq('id', id)
    .eq('user_id', user.id)

  if (error) return { success: false, error: error.message }

  // Clear break from attendance when entire day's update is deleted
  if (record?.date) {
    await admin
      .from('attendance_logs')
      .update({ break_total_mins: 0, break_sessions: [] })
      .eq('user_id', user.id)
      .eq('date', record.date)
      .eq('company_id', record.company_id)
  }

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
  const { data: record } = await admin
    .from('daily_updates')
    .select('date, company_id')
    .eq('id', id)
    .eq('user_id', user.id)
    .single()

  const totalHours = entries.reduce((s, e) => {
    const travel = e.task_type === 'shoot' ? (Number((e as Record<string, unknown>)._travel_hours) || 0) : 0
    return s + ((e.duration_hours as number) ?? 0) + travel
  }, 0)

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

  // Sync break total to attendance_logs based on remaining entries
  if (record?.date) {
    const breakEntries = entries.filter(e => e.task_type === 'break' && (e.duration_hours as number) > 0)
    const breakSessions = breakEntries
      .filter(e => e.start_time && e.end_time)
      .map(e => ({
        start: e.start_time, end: e.end_time,
        duration_mins: Math.round((e.duration_hours as number) * 60),
        label: (e.title as string) || 'Break',
      }))
    const totalBreakMins = breakEntries.reduce((s, e) => s + Math.round((e.duration_hours as number) * 60), 0)
    await admin
      .from('attendance_logs')
      .update({ break_sessions: breakSessions, break_total_mins: totalBreakMins })
      .eq('user_id', user.id)
      .eq('date', record.date)
      .eq('company_id', record.company_id)
  }

  revalidatePath('/member/update')
  revalidatePath('/member/history')
  revalidatePath('/admin/activities')
  return { success: true }
}

export async function updateDailyUpdateLearning(
  id: string,
  data: { learning_hours: number | null; learning_topic: string | null; learning_notes: string | null; learning_start_time?: string | null; learning_end_time?: string | null }
): Promise<{ success: boolean; error?: string }> {
  const supabase = await createServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { success: false, error: 'Not authenticated' }

  const admin = adminSupabase()
  const { error } = await admin
    .from('daily_updates')
    .update({
      learning_hours:      data.learning_hours,
      learning_topic:      data.learning_topic || null,
      learning_notes:      data.learning_notes || null,
      learning_start_time: data.learning_start_time ?? null,
      learning_end_time:   data.learning_end_time   ?? null,
    })
    .eq('id', id)
    .eq('user_id', user.id)

  if (error) return { success: false, error: error.message }

  revalidatePath('/member/history')
  revalidatePath('/admin/activities')
  return { success: true }
}

export async function addEntryToDate(
  newDate: string,
  entry: Record<string, unknown>
): Promise<{ success: boolean; error?: string }> {
  const supabase = await createServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { success: false, error: 'Not authenticated' }

  const admin = adminSupabase()
  const { data: profile } = await admin
    .from('users')
    .select('company_id')
    .eq('id', user.id)
    .single()
  if (!profile) return { success: false, error: 'Profile not found' }

  const { data: existing } = await admin
    .from('daily_updates')
    .select('id, work_entries')
    .eq('user_id', user.id)
    .eq('date', newDate)
    .eq('company_id', profile.company_id)
    .maybeSingle()

  if (existing) {
    const currentEntries = Array.isArray(existing.work_entries) ? existing.work_entries : []
    const { error } = await admin
      .from('daily_updates')
      .update({ work_entries: [...currentEntries, entry] })
      .eq('id', existing.id)
    if (error) return { success: false, error: error.message }
  } else {
    const { error } = await admin
      .from('daily_updates')
      .insert({
        user_id: user.id,
        company_id: profile.company_id,
        date: newDate,
        attendance_status: 'present',
        work_type: 'media',
        work_entries: [entry],
      })
    if (error) return { success: false, error: error.message }
  }

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
