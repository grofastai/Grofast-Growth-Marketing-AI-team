'use server'

import { createServerClient } from '@/lib/supabase/server'
import { createClient } from '@supabase/supabase-js'
import { cookies } from 'next/headers'
import { revalidatePath } from 'next/cache'
import { dailyUpdateSchema, type DailyUpdateInput } from '@/lib/validations/daily-update'
import { sendNotification } from '@/lib/notifications/send'
import { insertManyNotifications } from './notifications'
import { calcNetWorkHours } from '@/lib/utils/work-hours'

function adminSupabase() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  )
}

async function getUserContext(): Promise<{ userId: string; companyId: string } | { error: string }> {
  const supabase = await createServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'Not authenticated' }

  const admin = adminSupabase()
  const { data } = await admin.from('users').select('role, company_id').eq('id', user.id).single()
  if (!data?.company_id) return { error: 'Profile not found — re-login required' }

  if (data.role === 'ADMIN') {
    const impersonateId = (await cookies()).get('gf_impersonate')?.value
    if (impersonateId && impersonateId !== user.id) {
      const { data: target } = await admin.from('users').select('company_id').eq('id', impersonateId).single()
      if (target?.company_id && target.company_id === data.company_id) {
        return { userId: impersonateId, companyId: target.company_id as string }
      }
    }
  }

  return { userId: user.id, companyId: data.company_id as string }
}

// Always recompute duration_hours from start_time→end_time so manual edits never drift
function fixEntryDurations<T extends Record<string, unknown>>(entries: T[]): T[] {
  return entries.map(e => {
    const start = e.start_time as string | null | undefined
    const end   = e.end_time   as string | null | undefined
    if (!start || !end) return e
    const [sh, sm] = start.split(':').map(Number)
    const [eh, em] = end.split(':').map(Number)
    if ([sh, sm, eh, em].some(isNaN)) return e
    const expectedH = (eh * 60 + em - (sh * 60 + sm)) / 60
    if (expectedH <= 0 || expectedH > 15) return e
    return { ...e, duration_hours: Math.round(expectedH * 100) / 100 }
  })
}

async function syncCollaborationConfirmations(
  admin: ReturnType<typeof adminSupabase>,
  recordId: string,
  submitterId: string,
  companyId: string,
  date: string,
  entries: Record<string, unknown>[]
) {
  try {
    const tagged = entries.filter(e => {
      const pids = e.participant_ids as string[] | undefined
      return Array.isArray(pids) && pids.some(pid => pid !== submitterId)
    })
    const newlyTagged: { collaboratorId: string; title: unknown }[] = []
    for (const e of tagged) {
      const entryId = (e.id as string) || ''
      if (!entryId) continue
      const collaborators = ((e.participant_ids as string[]) || []).filter(pid => pid !== submitterId)
      for (const collaboratorId of collaborators) {
        // ignoreDuplicates + select('id') means an empty return = this pairing already
        // existed (preserve its confirmed/rejected status) rather than a fresh tag —
        // only genuinely new taggings should notify the collaborator.
        const { data: upserted } = await admin.from('collaboration_confirmations').upsert({
          company_id:               companyId,
          daily_update_id:          recordId,
          entry_id:                 entryId,
          submitter_id:             submitterId,
          collaborator_id:          collaboratorId,
          date,
          status:                   'pending',
          original_start_time:      (e.start_time as string) || null,
          original_end_time:        (e.end_time as string) || null,
          original_duration_hours:  (e.duration_hours as number) || null,
          entry_snapshot:           {
            title:       e.title,
            task_type:   e.task_type,
            client_name: e.client_name,
          },
        }, {
          onConflict:       'daily_update_id,entry_id,collaborator_id',
          ignoreDuplicates: true, // preserve existing confirmed/rejected status
        }).select('id')
        if (upserted?.length) newlyTagged.push({ collaboratorId, title: e.title })
      }
    }
    if (newlyTagged.length) {
      const { data: submitter } = await admin.from('users').select('name').eq('id', submitterId).single()
      await insertManyNotifications(newlyTagged.map(t => ({
        companyId,
        userId: t.collaboratorId,
        type: 'collab_tagged',
        title: `${submitter?.name ?? 'A teammate'} tagged you as a collaborator`,
        body: `${date}${t.title ? ` — "${t.title}"` : ''}. Confirm or reject on your History page.`,
        link: '/member/history',
      })))
    }

    // Untag cleanup: a collaborator removed from an entry during an edit (not a full
    // entry delete, which deleteCollaborationsByEntry already handles) must have their
    // confirmation row deleted here too — otherwise it's left behind with a stale
    // pending/confirmed/rejected status nobody asked for. If they'd already confirmed,
    // tell them — their credited hours for that task just disappeared.
    const currentPairs = new Set(tagged.flatMap(e => {
      const entryId = (e.id as string) || ''
      if (!entryId) return []
      return ((e.participant_ids as string[]) || [])
        .filter(pid => pid !== submitterId)
        .map(pid => `${entryId}:${pid}`)
    }))
    const { data: existingConfirms } = await admin
      .from('collaboration_confirmations')
      .select('id, entry_id, collaborator_id, status, entry_snapshot')
      .eq('daily_update_id', recordId)
    const toRemove = (existingConfirms ?? []).filter(
      c => !currentPairs.has(`${c.entry_id}:${c.collaborator_id}`)
    )
    if (toRemove.length) {
      await admin.from('collaboration_confirmations').delete().in('id', toRemove.map(c => c.id))
      const wasConfirmed = toRemove.filter(c => c.status === 'confirmed' || c.status === 'edited_confirmed')
      if (wasConfirmed.length) {
        const { data: submitter } = await admin.from('users').select('name').eq('id', submitterId).single()
        await insertManyNotifications(wasConfirmed.map(c => {
          const snap = c.entry_snapshot as { title?: string } | null
          return {
            companyId,
            userId: c.collaborator_id,
            type: 'collab_removed',
            title: `${submitter?.name ?? 'A teammate'} removed you from a confirmed collaboration`,
            body: `${date}${snap?.title ? ` — "${snap.title}"` : ''}. Those hours no longer count toward your total.`,
            link: '/member/history',
          }
        }))
      }
    }
  } catch { /* non-blocking */ }
}

export async function submitDailyUpdate(
  input: DailyUpdateInput
): Promise<{ success: boolean; error?: string }> {
  const parsed = dailyUpdateSchema.safeParse(input)
  if (!parsed.success) {
    return { success: false, error: parsed.error.issues[0].message }
  }

  const ctx = await getUserContext()
  if ('error' in ctx) return { success: false, error: ctx.error }
  const { userId } = ctx

  const admin = adminSupabase()
  const { data: profile } = await admin
    .from('users')
    .select('company_id, name, employee_id, phone, work_layout, is_management, role')
    .eq('id', userId)
    .single()

  if (!profile?.company_id) return { success: false, error: 'Profile not found — re-login required' }

  const todayStr = new Date().toLocaleString('en-CA', { timeZone: 'Asia/Kolkata' }).split(',')[0]
  const d = parsed.data
  const today = d.date ?? todayStr
  const isPastDate = today !== todayStr

  const isManagement     = (profile as { is_management?: boolean | null }).is_management === true
  const isFreelancerMedia = profile.work_layout === 'freelance_media'
  const isAdmin           = (profile as { role?: string | null }).role === 'ADMIN'

  // Fix 1: Block work entries that overlap with approved half-day leave time window
  {
    const { data: halfDayLeave } = await admin
      .from('leaves')
      .select('half_day_from_time, half_day_to_time')
      .eq('user_id', userId)
      .eq('status', 'approved')
      .eq('leave_type', 'half_day')
      .lte('from_date', today)
      .gte('to_date', today)
      .maybeSingle()
    if (halfDayLeave?.half_day_from_time && halfDayLeave?.half_day_to_time) {
      const leaveFrom = halfDayLeave.half_day_from_time
      const leaveTo   = halfDayLeave.half_day_to_time
      for (const entry of d.work_entries) {
        if (!entry.start_time || !entry.end_time || entry.task_type === 'break') continue
        if (entry.start_time < leaveTo && entry.end_time > leaveFrom) {
          return {
            success: false,
            error: `"${(entry as { title?: string }).title || 'Work entry'}" (${entry.start_time}–${entry.end_time}) overlaps with your approved half day leave (${leaveFrom}–${leaveTo}). Please adjust the entry times.`,
          }
        }
      }
    }
  }

  // Fix 1b: Block work entries that overlap with an approved permission-leave time window
  {
    const { data: permissionLeave } = await admin
      .from('leaves')
      .select('permission_time, permission_end_time, permission_hours')
      .eq('user_id', userId)
      .eq('status', 'approved')
      .eq('leave_type', 'permission')
      .lte('from_date', today)
      .gte('to_date', today)
      .maybeSingle()
    const leaveFrom = permissionLeave?.permission_time || null
    let leaveTo = permissionLeave?.permission_end_time || null
    if (!leaveTo && leaveFrom && permissionLeave?.permission_hours) {
      const [fh, fm] = leaveFrom.split(':').map(Number)
      const totalMins = fh * 60 + fm + Math.round(permissionLeave.permission_hours * 60)
      leaveTo = `${String(Math.floor(totalMins / 60)).padStart(2, '0')}:${String(totalMins % 60).padStart(2, '0')}`
    }
    if (leaveFrom && leaveTo) {
      for (const entry of d.work_entries) {
        if (!entry.start_time || !entry.end_time || entry.task_type === 'break') continue
        if (entry.start_time < leaveTo && entry.end_time > leaveFrom) {
          return {
            success: false,
            error: `"${(entry as { title?: string }).title || 'Work entry'}" (${entry.start_time}–${entry.end_time}) overlaps with your approved permission leave (${leaveFrom}–${leaveTo}). Please adjust the entry times.`,
          }
        }
      }
    }
  }

  // Fix 2: Block past-date submission if no clock-in record exists for that date
  if (isPastDate && !isManagement && !isFreelancerMedia && !isAdmin) {
    const { data: pastAttLog } = await admin
      .from('attendance_logs')
      .select('clock_in')
      .eq('user_id', userId)
      .eq('date', today)
      .maybeSingle()
    if (!pastAttLog?.clock_in) {
      return {
        success: false,
        error: `No clock-in found for ${today}. Ask admin to add your attendance before submitting work entries for this date.`,
      }
    }
  }

  // Block submission if the target date (today OR a past date) has an approved
  // full-day leave — a leave day should never end up with real work entries logged.
  {
    const { data: leaveBlock } = await admin
      .from('leaves')
      .select('id')
      .eq('company_id', profile.company_id)
      .eq('user_id', userId)
      .eq('status', 'approved')
      .eq('leave_type', 'full_day')
      .lte('from_date', today)
      .gte('to_date', today)
      .maybeSingle()
    if (leaveBlock) {
      return {
        success: false,
        error: isPastDate
          ? `You were on approved leave on ${today}. Daily update submission is not allowed for that date.`
          : 'You are on approved leave today. Daily update submission is not allowed.',
      }
    }
  }

  const workLayout = (profile?.work_layout ?? undefined) as 'media' | 'non_media' | 'freelance_media' | undefined
  const roundedHours = calcNetWorkHours(d.work_entries, workLayout)
  // Learning hours from entries (new approach — stored in work_entries)
  const newLearnHours = d.work_entries
    .filter(e => e.task_type === 'learning')
    .reduce((sum, e) => sum + e.duration_hours, 0)

  // Check if a record already exists for today (allow appending more work)
  const [{ data: existingRecord }, { data: attLog }] = await Promise.all([
    admin
      .from('daily_updates')
      .select('id, work_entries, working_hours, shoot_count, editing_count, learning_hours')
      .eq('user_id', userId)
      .eq('date', today)
      .maybeSingle(),
    admin
      .from('attendance_logs')
      .select('work_type')
      .eq('user_id', userId)
      .eq('date', today)
      .maybeSingle(),
  ])

  const workType = (attLog as { work_type?: string | null } | null)?.work_type ?? null

  let isFirstSubmission = false

  if (existingRecord) {
    const prevEntries = Array.isArray(existingRecord.work_entries) ? existingRecord.work_entries as Array<Record<string, unknown>> : []

    // Merge/append: dedup by ID so new entries replace same-ID ones without losing unrelated
    // entries. Applies to past dates too — a resubmit (e.g. after "Edit Date's Update" following
    // a slow/failed request) must replace, never duplicate, entries that share an ID.
    const newIds = new Set(d.work_entries.map(e => e.id).filter(Boolean))
    const filteredPrev = prevEntries.filter(e => !newIds.has(e.id as string))
    let combinedEntries: Array<Record<string, unknown>> = [...filteredPrev, ...d.work_entries]

    // Always sync duration_hours to time span before saving
    combinedEntries = fixEntryDurations(combinedEntries)
    // Recalculate all aggregates from combined entries — never use incremental addition
    const calcWorkHours  = calcNetWorkHours(combinedEntries as Parameters<typeof calcNetWorkHours>[0], workLayout)
    const calcShootCount = combinedEntries.filter(e => e.task_type === 'shoot').length
    // UNIQUE COUNT RULE: edit/voiceover/poster with is_rework=true are revisions — never count as new unique deliverables
    const calcEditCount  = combinedEntries.filter(e => e.task_type === 'edit' && !(e as Record<string,unknown>).is_rework).length
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

    // Sync collaboration confirmations for updated record
    await syncCollaborationConfirmations(admin, existingRecord.id, userId, profile.company_id, today, d.work_entries as Record<string, unknown>[])
  } else {
    isFirstSubmission = true
    const fixedNewEntries = fixEntryDurations(d.work_entries as Record<string, unknown>[])
    const { data: inserted, error: insertError } = await admin
      .from('daily_updates')
      .insert({
        company_id:          profile.company_id,
        user_id:             userId,
        date:                today,
        attendance_status:   'present',
        work_type:           workType,
        working_hours:       d.active_tab !== 'learning' ? calcNetWorkHours(fixedNewEntries as Parameters<typeof calcNetWorkHours>[0], workLayout) : null,
        learning_hours:      newLearnHours > 0 ? newLearnHours : d.learning_hours,
        shoot_count:         d.shoot_count,
        notes:               null,
        work_entries:        fixedNewEntries,
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
      .select('id')
      .single()

    if (insertError) return { success: false, error: insertError.message }

    // Sync collaboration confirmations for newly inserted record
    if (inserted?.id) {
      await syncCollaborationConfirmations(admin, inserted.id, userId, profile.company_id, today, d.work_entries as Record<string, unknown>[])
    }
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
      .eq('user_id', userId)
      .eq('date', today)
      .eq('company_id', profile.company_id)
  }

  // WhatsApp notification to admin — only on first submission of today's update
  try {
    if (!isFirstSubmission || isPastDate) {
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
  return { success: true }
}

export async function deleteDailyUpdate(id: string): Promise<{ success: boolean; error?: string }> {
  const ctx = await getUserContext()
  if ('error' in ctx) return { success: false, error: ctx.error }
  const { userId } = ctx

  const admin = adminSupabase()
  const { data: record } = await admin
    .from('daily_updates')
    .select('date, company_id')
    .eq('id', id)
    .eq('user_id', userId)
    .single()

  const { error } = await admin
    .from('daily_updates')
    .delete()
    .eq('id', id)
    .eq('user_id', userId)

  if (error) return { success: false, error: error.message }

  // Clear break from attendance when entire day's update is deleted
  if (record?.date) {
    await admin
      .from('attendance_logs')
      .update({ break_total_mins: 0, break_sessions: [] })
      .eq('user_id', userId)
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
  const ctx = await getUserContext()
  if ('error' in ctx) return { success: false, error: ctx.error }
  const { userId } = ctx

  const admin = adminSupabase()
  const [{ data: record }, { data: uProfile }] = await Promise.all([
    admin.from('daily_updates').select('date, company_id, work_entries, participant_ids').eq('id', id).eq('user_id', userId).single(),
    admin.from('users').select('work_layout').eq('id', userId).single(),
  ])
  const updateLayout = (uProfile?.work_layout ?? undefined) as 'media' | 'non_media' | 'freelance_media' | undefined

  // Always preserve auto-inserted leave entries (_is_leave: true) — member cannot delete them
  const existingLeaveEntries = (Array.isArray(record?.work_entries) ? record.work_entries as Record<string, unknown>[] : [])
    .filter(e => e._is_leave === true)
  const entriesWithoutLeave = entries.filter(e => !e._is_leave)
  const finalEntries = fixEntryDurations([...entriesWithoutLeave, ...existingLeaveEntries])

  const finalLearnHours = Math.round(
    finalEntries.filter(e => e.task_type === 'learning').reduce((s, e) => s + (Number(e.duration_hours) || 0), 0) * 10
  ) / 10

  // Keep the record-level participant_ids in sync with whatever entries carry a tag —
  // the History page's "who's tagged in me" query filters on this top-level column,
  // so if it drifts out of sync the collaborator's copy silently disappears. Merge with
  // (never drop) the existing column value since it may also hold learning-tab tags.
  const existingParticipants = (record as Record<string, unknown> | null)?.participant_ids as string[] ?? []
  const entryParticipants = finalEntries.flatMap(e => (e as Record<string, unknown>).participant_ids as string[] ?? []).filter(Boolean)
  const mergedParticipants = Array.from(new Set([...existingParticipants, ...entryParticipants]))

  const { error } = await admin
    .from('daily_updates')
    .update({
      work_entries:   finalEntries,
      working_hours:  calcNetWorkHours(finalEntries as Parameters<typeof calcNetWorkHours>[0], updateLayout) || null,
      shoot_count:    finalEntries.filter(e => e.task_type === 'shoot').length,
      // UNIQUE COUNT RULE: skip is_rework=true — revisions are not new unique deliverables
      editing_count:  finalEntries.filter(e => e.task_type === 'edit' && !(e as Record<string,unknown>).is_rework).length,
      learning_hours: finalLearnHours,
      participant_ids: mergedParticipants,
    })
    .eq('id', id)
    .eq('user_id', userId)

  if (error) return { success: false, error: error.message }

  if (record?.company_id && record?.date) {
    await syncCollaborationConfirmations(admin, id, userId, record.company_id, record.date, finalEntries)
  }

  // Sync break total to attendance_logs based on remaining entries
  if (record?.date) {
    const breakEntries = finalEntries.filter(e => e.task_type === 'break' && (e.duration_hours as number) > 0)
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
      .eq('user_id', userId)
      .eq('date', record.date)
      .eq('company_id', record.company_id)
  }

  revalidatePath('/member/update')
  revalidatePath('/member/history')
  revalidatePath('/member/dashboard')
  revalidatePath('/admin/activities')
  revalidatePath('/admin/dashboard')
  return { success: true }
}

export async function updateDailyUpdateLearning(
  id: string,
  data: { learning_hours: number | null; learning_topic: string | null; learning_notes: string | null; learning_start_time?: string | null; learning_end_time?: string | null; participant_ids?: string[] | null }
): Promise<{ success: boolean; error?: string }> {
  const ctx = await getUserContext()
  if ('error' in ctx) return { success: false, error: ctx.error }
  const { userId } = ctx

  const admin = adminSupabase()
  const updatePayload: Record<string, unknown> = {
    learning_hours:      data.learning_hours,
    learning_topic:      data.learning_topic || null,
    learning_notes:      data.learning_notes || null,
    learning_start_time: data.learning_start_time ?? null,
    learning_end_time:   data.learning_end_time   ?? null,
  }
  if (data.participant_ids !== undefined) {
    // Merge with (never overwrite/drop) whatever's already tagged on this record's
    // work entries — this form only edits the learning tag, so blindly writing
    // data.participant_ids here would wipe out unrelated work-entry collaborator tags
    // (including null when no learning participant is selected).
    const { data: existingRecord } = await admin
      .from('daily_updates')
      .select('participant_ids, work_entries')
      .eq('id', id)
      .eq('user_id', userId)
      .single()
    const existingParticipants = (existingRecord as Record<string, unknown> | null)?.participant_ids as string[] ?? []
    const entryParticipants = (Array.isArray(existingRecord?.work_entries) ? existingRecord.work_entries as Record<string, unknown>[] : [])
      .flatMap(e => e.participant_ids as string[] ?? [])
      .filter(Boolean)
    updatePayload.participant_ids = Array.from(new Set([
      ...existingParticipants,
      ...entryParticipants,
      ...(data.participant_ids ?? []),
    ]))
  }
  const { error } = await admin
    .from('daily_updates')
    .update(updatePayload)
    .eq('id', id)
    .eq('user_id', userId)

  if (error) return { success: false, error: error.message }

  revalidatePath('/member/history')
  revalidatePath('/admin/activities')
  return { success: true }
}

export async function addEntryToDate(
  newDate: string,
  entry: Record<string, unknown>
): Promise<{ success: boolean; error?: string }> {
  const ctx = await getUserContext()
  if ('error' in ctx) return { success: false, error: ctx.error }
  const { userId } = ctx

  const admin = adminSupabase()
  const { data: profile } = await admin
    .from('users')
    .select('company_id, work_layout')
    .eq('id', userId)
    .single()
  if (!profile) return { success: false, error: 'Profile not found' }
  const addLayout = (profile.work_layout ?? undefined) as 'media' | 'non_media' | 'freelance_media' | undefined

  const { data: existing } = await admin
    .from('daily_updates')
    .select('id, work_entries, participant_ids')
    .eq('user_id', userId)
    .eq('date', newDate)
    .eq('company_id', profile.company_id)
    .maybeSingle()

  // Merge new entry with any existing entries on the target date
  const allEntries: Record<string, unknown>[] = [
    ...(existing && Array.isArray(existing.work_entries) ? existing.work_entries : []),
    entry,
  ]

  // Merge with (never drop) the existing column value — see updatePastDailyUpdate above.
  const existingParticipants = (existing as Record<string, unknown> | null)?.participant_ids as string[] ?? []
  const entryParticipants = allEntries.flatMap(e => (e as Record<string, unknown>).participant_ids as string[] ?? []).filter(Boolean)
  const mergedParticipants = Array.from(new Set([...existingParticipants, ...entryParticipants]))

  const aggregates = {
    work_entries: allEntries,
    working_hours: calcNetWorkHours(allEntries as Parameters<typeof calcNetWorkHours>[0], addLayout) || null,
    shoot_count: allEntries.filter(e => e.task_type === 'shoot').length,
    // UNIQUE COUNT RULE: skip is_rework=true — revisions are not new unique deliverables
    editing_count: allEntries.filter(e => e.task_type === 'edit' && !(e as Record<string,unknown>).is_rework).length,
    participant_ids: mergedParticipants,
  }

  let recordId = existing?.id as string | undefined

  if (existing) {
    const { error } = await admin
      .from('daily_updates')
      .update(aggregates)
      .eq('id', existing.id)
    if (error) return { success: false, error: error.message }
  } else {
    const { data: inserted, error } = await admin
      .from('daily_updates')
      .insert({
        user_id: userId,
        company_id: profile.company_id,
        date: newDate,
        attendance_status: 'present',
        ...aggregates,
      })
      .select('id')
      .single()
    if (error) return { success: false, error: error.message }
    recordId = inserted?.id
  }

  if (recordId) {
    await syncCollaborationConfirmations(admin, recordId, userId, profile.company_id, newDate, allEntries)
  }

  // Sync break totals to attendance_logs for the new date
  const breakEntries = allEntries.filter(e => e.task_type === 'break' && Number(e.duration_hours) > 0)
  const breakSessions = breakEntries
    .filter(e => e.start_time && e.end_time)
    .map(e => ({
      start: e.start_time,
      end: e.end_time,
      duration_mins: Math.round(Number(e.duration_hours) * 60),
      label: (e.title as string) || 'Break',
    }))
  const totalBreakMins = breakEntries.reduce((s, e) => s + Math.round(Number(e.duration_hours) * 60), 0)
  await admin
    .from('attendance_logs')
    .update({ break_sessions: breakSessions, break_total_mins: totalBreakMins })
    .eq('user_id', userId)
    .eq('date', newDate)
    .eq('company_id', profile.company_id)

  revalidatePath('/member/update')
  revalidatePath('/member/history')
  revalidatePath('/member/dashboard')
  revalidatePath('/admin/activities')
  revalidatePath('/admin/dashboard')
  return { success: true }
}

export async function updateWorkEntryPrice(
  dailyUpdateId: string,
  entryId: string,
  price: number | null
): Promise<{ success: boolean; error?: string }> {
  const supabase = await createServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { success: false, error: 'Not authenticated' }

  const admin = adminSupabase()
  // Media/login-team work pricing is Admin-only — unlike no-login freelancer
  // entries, assigned managers don't get access to this data at all.
  const { data: profile } = await admin.from('users').select('role').eq('id', user.id).single()
  if (!profile || !['ADMIN', 'FOUNDER', 'CEO'].includes(profile.role)) {
    return { success: false, error: 'Not authorized to price work entries' }
  }

  const { data: record } = await admin
    .from('daily_updates')
    .select('work_entries')
    .eq('id', dailyUpdateId)
    .single()

  if (!record) return { success: false, error: 'Record not found' }

  const entries = (Array.isArray(record.work_entries) ? record.work_entries : []) as Record<string, unknown>[]
  const updated = entries.map(e => e.id === entryId ? { ...e, price } : e)

  const { error } = await admin
    .from('daily_updates')
    .update({ work_entries: updated })
    .eq('id', dailyUpdateId)

  if (error) return { success: false, error: error.message }
  revalidatePath('/admin/freelancers')
  return { success: true }
}

export async function getTodayUpdate() {
  const ctx = await getUserContext()
  if ('error' in ctx) return null
  const { userId } = ctx

  const admin = adminSupabase()
  const today = new Date().toISOString().split('T')[0]
  const { data } = await admin
    .from('daily_updates')
    .select('*')
    .eq('user_id', userId)
    .eq('date', today)
    .single()

  return data
}
