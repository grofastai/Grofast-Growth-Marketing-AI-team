'use server'

import { createServerClient } from '@/lib/supabase/server'
import { createClient } from '@supabase/supabase-js'
import { cookies } from 'next/headers'
import { revalidatePath } from 'next/cache'
import { sendNotification } from '@/lib/notifications/send'
import { insertNotification, insertManyNotifications } from './notifications'
import { z } from 'zod'

function createAdminClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  )
}

const leaveSchema = z.object({
  leave_type:          z.enum(['full_day', 'half_day', 'permission', 'wfh', 'shoot_day']).default('full_day'),
  from_date:           z.string().min(1, 'Date required'),
  to_date:             z.string().min(1, 'End date required'),
  half_day_period:     z.enum(['morning', 'afternoon']).optional(),
  half_day_from_time:  z.string().optional(),
  half_day_to_time:    z.string().optional(),
  permission_hours:    z.coerce.number().min(0.1).max(12).optional(),
  permission_time:     z.string().optional(),
  permission_end_time: z.string().optional(),
  reason:              z.string().min(3, 'Please provide a reason'),
}).superRefine((data, ctx) => {
  if (data.leave_type === 'half_day') {
    if (!data.half_day_from_time) ctx.addIssue({ code: 'custom', path: ['half_day_from_time'], message: 'From time is required for half day leave' })
    if (!data.half_day_to_time)   ctx.addIssue({ code: 'custom', path: ['half_day_to_time'],   message: 'To time is required for half day leave' })
  }
  if (data.leave_type === 'permission') {
    if (!data.permission_time)     ctx.addIssue({ code: 'custom', path: ['permission_time'],     message: 'Leave From time is required for permission' })
    if (!data.permission_end_time) ctx.addIssue({ code: 'custom', path: ['permission_end_time'], message: 'Return By time is required for permission' })
  }
})

function parseCompanyId(accessToken: string): string | null {
  try {
    const payload = accessToken.split('.')[1]
    const claims = JSON.parse(atob(payload))
    return claims.company_id ?? null
  } catch {
    return null
  }
}

export async function submitLeaveRequest(
  _prev: { error: string } | { success: true } | null,
  formData: FormData
): Promise<{ error: string } | { success: true }> {
  const leaveType = (formData.get('leave_type') as string) || 'full_day'

  const raw = {
    leave_type:          leaveType,
    from_date:           formData.get('from_date') as string,
    to_date:             (leaveType === 'full_day' || leaveType === 'wfh') ? (formData.get('to_date') as string) : (formData.get('from_date') as string),
    half_day_period:     formData.get('half_day_period') || undefined,
    half_day_from_time:  (formData.get('half_day_from_time') as string) || undefined,
    half_day_to_time:    (formData.get('half_day_to_time') as string) || undefined,
    permission_hours:    formData.get('permission_hours') ? Number(formData.get('permission_hours')) : undefined,
    permission_time:     (formData.get('permission_time') as string) || undefined,
    permission_end_time: (formData.get('permission_end_time') as string) || undefined,
    reason:              formData.get('reason') as string,
  }

  const parsed = leaveSchema.safeParse(raw)
  if (!parsed.success) {
    return { error: parsed.error.issues[0].message }
  }

  const todayIST = new Date().toLocaleString('en-CA', { timeZone: 'Asia/Kolkata' }).split(',')[0]
  if (parsed.data.from_date < todayIST) {
    return { error: 'Cannot apply leave for past dates. You can apply for today or future dates only.' }
  }

  const supabase = await createServerClient()
  const { data: { session } } = await supabase.auth.getSession()
  if (!session) return { error: 'Not authenticated' }

  const adminCl = createAdminClient()

  // Resolve effective user — admin impersonation support
  let effectiveUserId = session.user.id
  const { data: selfProfile } = await adminCl.from('users').select('role, company_id').eq('id', session.user.id).single()
  if (selfProfile?.role === 'ADMIN') {
    const impersonateId = (await cookies()).get('gf_impersonate')?.value
    if (impersonateId && impersonateId !== session.user.id) {
      const { data: target } = await adminCl.from('users').select('company_id').eq('id', impersonateId).single()
      if (target?.company_id && target.company_id === selfProfile.company_id) {
        effectiveUserId = impersonateId
      }
    }
  }

  let company_id = selfProfile?.role === 'ADMIN' && effectiveUserId !== session.user.id
    ? (await adminCl.from('users').select('company_id').eq('id', effectiveUserId).single()).data?.company_id ?? null
    : parseCompanyId(session.access_token)
  if (!company_id) {
    const { data: u } = await adminCl.from('users').select('company_id').eq('id', effectiveUserId).single()
    company_id = u?.company_id ?? null
  }
  if (!company_id) return { error: 'Could not resolve company. Please sign out and sign in again.' }

  const { data: profile } = await adminCl
    .from('users')
    .select('name, employee_id')
    .eq('id', effectiveUserId)
    .single()

  // Monthly limit check (full_day + half_day only; permission/wfh/shoot_day excluded)
  const isExceptional = formData.get('is_exceptional') === 'true'
  if (!isExceptional && (parsed.data.leave_type === 'full_day' || parsed.data.leave_type === 'half_day')) {
    const currentMonth = parsed.data.from_date.slice(0, 7)
    const { data: monthLeaves } = await adminCl
      .from('leaves')
      .select('from_date, to_date, leave_type')
      .eq('user_id', effectiveUserId)
      .gte('from_date', `${currentMonth}-01`)
      .lte('from_date', `${currentMonth}-31`)
      .in('status', ['approved', 'pending'])
    const used = (monthLeaves ?? []).reduce((s, l) => {
      const t = l.leave_type ?? 'full_day'
      if (t === 'full_day') return s + (Math.ceil((new Date(l.to_date).getTime() - new Date(l.from_date).getTime()) / 86400000) + 1)
      if (t === 'half_day') return s + 0.5
      return s
    }, 0)
    if (used >= 5) return { error: 'Monthly leave limit reached (5/5). Apply as Exceptional Leave if urgent.' }
  }

  const { data: overlapping } = await adminCl
    .from('leaves')
    .select('id, leave_type')
    .eq('user_id', effectiveUserId)
    .lte('from_date', parsed.data.to_date)
    .gte('to_date', parsed.data.from_date)
    .not('status', 'eq', 'rejected')

  if (overlapping && overlapping.length > 0) {
    // Multiple permissions on the same day are allowed (e.g. morning + evening)
    // Only block if there is a full_day or half_day leave already on that date
    const blocking = parsed.data.leave_type === 'permission'
      ? overlapping.filter(l => l.leave_type !== 'permission')
      : overlapping
    if (blocking.length > 0) {
      return { error: parsed.data.leave_type === 'permission'
        ? 'You already have a full-day or half-day leave on that date.'
        : 'You already have a leave request for those dates.' }
    }
  }

  const { data: inserted, error: insertError } = await (adminCl.from('leaves') as any).insert({
    company_id,
    user_id:             effectiveUserId,
    from_date:           parsed.data.from_date,
    to_date:             parsed.data.to_date,
    reason:              isExceptional ? `[EXCEPTIONAL] ${parsed.data.reason}` : parsed.data.reason,
    leave_type:          parsed.data.leave_type,
    permission_hours:    parsed.data.permission_hours ?? null,
    permission_time:     parsed.data.permission_time ?? null,
    permission_end_time: parsed.data.permission_end_time ?? null,
    half_day_period:     (parsed.data.half_day_period ?? null),
    half_day_from_time:  parsed.data.half_day_from_time ?? null,
    half_day_to_time:    parsed.data.half_day_to_time ?? null,
  }).select('id').single()

  if (insertError) return { error: insertError.message }

  // Route to the matching WhatsApp template per request type
  const submitEvent = parsed.data.leave_type === 'wfh'
    ? 'wfh.submitted' as const
    : parsed.data.leave_type === 'shoot_day'
    ? 'shoot.submitted' as const
    : 'leave.submitted' as const

  if (profile && inserted?.id) {
    const adminClient = createAdminClient()
    const { data: adminUsers } = await adminClient
      .from('users')
      .select('id, phone')
      .eq('company_id', company_id)
      .eq('role', 'ADMIN')

    // SMS to first admin
    const adminWithPhone = adminUsers?.find(a => a.phone)
    if (adminWithPhone?.phone) {
      sendNotification({
        event:         submitEvent,
        leave_id:      inserted.id,
        employee_name: profile.name,
        employee_id:   profile.employee_id,
        from_date:     parsed.data.from_date,
        to_date:       parsed.data.to_date,
        reason:        parsed.data.reason,
        admin_phone:   adminWithPhone.phone,
      }).catch(console.error)
    }

    // Bell notification to all admins
    if (adminUsers?.length) {
      const leaveLabel = parsed.data.leave_type === 'full_day'
        ? `${parsed.data.from_date} → ${parsed.data.to_date}`
        : parsed.data.leave_type === 'half_day' ? `Half-day on ${parsed.data.from_date}`
        : parsed.data.leave_type === 'wfh' ? `WFH on ${parsed.data.from_date}`
        : parsed.data.leave_type === 'shoot_day' ? `Shoot Day on ${parsed.data.from_date}`
        : `Permission on ${parsed.data.from_date}`
      const requestNoun = parsed.data.leave_type === 'wfh' ? 'requested Work From Home'
        : parsed.data.leave_type === 'shoot_day' ? 'requested a Shoot Day'
        : 'applied for leave'
      await insertManyNotifications(adminUsers.map(a => ({
        companyId: company_id,
        userId: a.id,
        type: 'leave_submitted',
        title: `${profile.name} ${requestNoun}`,
        body: leaveLabel,
        link: '/admin/leaves',
      })))
    }
  }

  revalidatePath('/member/leaves')
  revalidatePath('/member/dashboard')
  revalidatePath('/admin/leaves')
  return { success: true }
}

export async function deleteLeaveRequest(
  leaveId: string
): Promise<{ success: boolean; error?: string }> {
  const supabase = await createServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { success: false, error: 'Not authenticated' }

  const { data: leave } = await supabase
    .from('leaves')
    .select('user_id, status, leave_type, from_date, to_date, company_id')
    .eq('id', leaveId)
    .single()

  if (!leave) return { success: false, error: 'Leave not found' }
  if (leave.user_id !== user.id) return { success: false, error: 'Not authorized' }

  // Delete the leave record
  const { error } = await supabase.from('leaves').delete().eq('id', leaveId)
  if (error) return { success: false, error: error.message }

  // If it was approved, also clean up attendance_logs and daily_updates
  if (leave.status === 'approved') {
    const admin = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!,
      { auth: { autoRefreshToken: false, persistSession: false } }
    )
    // Build all dates in the leave range
    const dates: string[] = []
    const cur = new Date(leave.from_date + 'T12:00:00')
    const end = new Date(leave.to_date   + 'T12:00:00')
    while (cur <= end) { dates.push(cur.toISOString().split('T')[0]); cur.setDate(cur.getDate() + 1) }

    for (const date of dates) {
      // Remove absent attendance_log (no clock_in) inserted when leave was approved
      await admin.from('attendance_logs')
        .delete()
        .eq('user_id', leave.user_id)
        .eq('company_id', leave.company_id)
        .eq('date', date)
        .is('clock_in', null)

      // Remove daily_updates row if it was the auto-inserted leave entry (attendance_status = absent)
      const { data: du } = await admin.from('daily_updates')
        .select('id, work_entries')
        .eq('user_id', leave.user_id)
        .eq('company_id', leave.company_id)
        .eq('date', date)
        .single()

      if (du) {
        const entries: { title?: string }[] = Array.isArray(du.work_entries) ? du.work_entries : []
        const leaveEntryIdx = entries.findIndex(e =>
          e.title?.includes('Full Day Leave') ||
          e.title?.includes('Permission') ||
          e.title?.includes('Half Day Leave')
        )
        if (leaveEntryIdx !== -1) {
          const remaining = entries.filter((_, i) => i !== leaveEntryIdx)
          if (remaining.length === 0) {
            await admin.from('daily_updates').delete().eq('id', du.id)
          } else {
            await admin.from('daily_updates').update({ work_entries: remaining }).eq('id', du.id)
          }
        }
      }
    }
  }

  revalidatePath('/member/leaves')
  revalidatePath('/member/dashboard')
  revalidatePath('/admin/leaves')
  revalidatePath('/member/history')
  return { success: true }
}

export async function updateLeaveRequest(
  leaveId: string,
  formData: FormData
): Promise<{ error: string } | { success: true }> {
  const leaveType = (formData.get('leave_type') as string) || 'full_day'

  const raw = {
    leave_type:          leaveType,
    from_date:           formData.get('from_date') as string,
    to_date:             (leaveType === 'full_day' || leaveType === 'wfh') ? (formData.get('to_date') as string) : (formData.get('from_date') as string),
    half_day_period:     formData.get('half_day_period') || undefined,
    half_day_from_time:  (formData.get('half_day_from_time') as string) || undefined,
    half_day_to_time:    (formData.get('half_day_to_time') as string) || undefined,
    permission_hours:    formData.get('permission_hours') ? Number(formData.get('permission_hours')) : undefined,
    permission_time:     (formData.get('permission_time') as string) || undefined,
    permission_end_time: (formData.get('permission_end_time') as string) || undefined,
    reason:              formData.get('reason') as string,
  }

  const parsed = leaveSchema.safeParse(raw)
  if (!parsed.success) return { error: parsed.error.issues[0].message }

  const todayIST = new Date().toLocaleString('en-CA', { timeZone: 'Asia/Kolkata' }).split(',')[0]
  if (parsed.data.from_date < todayIST) {
    return { error: 'Cannot apply leave for past dates. You can apply for today or future dates only.' }
  }

  const supabase = await createServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'Not authenticated' }

  // Verify ownership and pending status
  const { data: existing } = await supabase
    .from('leaves')
    .select('user_id, status')
    .eq('id', leaveId)
    .single()

  if (!existing) return { error: 'Leave request not found' }
  if (existing.user_id !== user.id) return { error: 'Not authorized' }
  if (existing.status !== 'pending') return { error: 'Can only edit pending requests' }

  const { error } = await (supabase.from('leaves') as any)
    .update({
      from_date:           parsed.data.from_date,
      to_date:             parsed.data.to_date,
      reason:              parsed.data.reason,
      leave_type:          parsed.data.leave_type,
      permission_hours:    parsed.data.permission_hours ?? null,
      permission_time:     parsed.data.permission_time ?? null,
      permission_end_time: parsed.data.permission_end_time ?? null,
      half_day_period:     parsed.data.half_day_period ?? null,
      half_day_from_time:  parsed.data.half_day_from_time ?? null,
      half_day_to_time:    parsed.data.half_day_to_time ?? null,
    })
    .eq('id', leaveId)

  if (error) return { error: error.message }

  revalidatePath('/member/leaves')
  revalidatePath('/admin/leaves')
  return { success: true }
}

async function autoInsertLeaveHistory(
  admin: ReturnType<typeof createAdminClient>,
  leave: {
    company_id: string
    user_id: string
    from_date: string
    to_date: string
    leave_type: string | null
    reason: string | null
    permission_time: string | null
    permission_end_time: string | null
    permission_hours: number | null
    half_day_from_time: string | null
    half_day_to_time: string | null
    half_day_period: string | null
  }
) {
  const type = leave.leave_type ?? 'full_day'

  if (type === 'permission') {
    // Insert break entry with exact times on the leave date
    const startTime = leave.permission_time ?? null
    if (!startTime) return

    // Use explicit end time if stored, otherwise fall back to start + hours
    let endTime = leave.permission_end_time ?? null
    if (!endTime && leave.permission_hours) {
      const [fh, fm] = startTime.split(':').map(Number)
      const totalMins = fh * 60 + fm + Math.round((leave.permission_hours) * 60)
      endTime = `${String(Math.floor(totalMins / 60)).padStart(2, '0')}:${String(totalMins % 60).padStart(2, '0')}`
    }
    if (!endTime) return

    const [fh, fm] = startTime.split(':').map(Number)
    const [th, tm] = endTime.split(':').map(Number)
    const diffMins = (th * 60 + tm) - (fh * 60 + fm)
    if (diffMins <= 0) return

    const entry = {
      task_type: 'break',
      title: 'Permission Leave',
      client_name: leave.reason ?? 'Permission',
      duration_hours: Math.round((diffMins / 60) * 10) / 10,
      notes: leave.reason ?? '',
      start_time: startTime,
      end_time: endTime,
      _is_leave: true,
    }
    await upsertWorkEntry(admin, leave.company_id, leave.user_id, leave.from_date, entry)

  } else if (type === 'half_day') {
    const startTime = leave.half_day_from_time ?? null
    const endTime   = leave.half_day_to_time ?? null
    if (!startTime || !endTime) return

    const [fh, fm] = startTime.split(':').map(Number)
    const [th, tm] = endTime.split(':').map(Number)
    const diffMins = (th * 60 + tm) - (fh * 60 + fm)
    if (diffMins <= 0) return

    const entry = {
      task_type: 'break',
      title: `Half Day Leave (${leave.half_day_period ?? 'morning'})`,
      client_name: leave.reason ?? 'Half Day',
      duration_hours: Math.round((diffMins / 60) * 10) / 10,
      notes: leave.reason ?? '',
      start_time: startTime,
      end_time: endTime,
      _is_leave: true,
    }
    await upsertWorkEntry(admin, leave.company_id, leave.user_id, leave.from_date, entry)

  } else if (type === 'full_day') {
    // Insert one on_leave record per day in the range
    const start = new Date(leave.from_date)
    const end   = new Date(leave.to_date)
    const dates: string[] = []
    for (const d = new Date(start); d <= end; d.setDate(d.getDate() + 1)) {
      dates.push(d.toISOString().split('T')[0])
    }
    for (const date of dates) {
      const entry = {
        task_type: 'break',
        title: '🌴 Full Day Leave',
        client_name: leave.reason ?? 'Approved Leave',
        duration_hours: 0,
        notes: leave.reason ?? '',
        start_time: null,
        end_time: null,
      }
      await upsertWorkEntry(admin, leave.company_id, leave.user_id, date, entry, 'absent')
    }
  }
}

async function upsertWorkEntry(
  admin: ReturnType<typeof createAdminClient>,
  companyId: string,
  userId: string,
  date: string,
  entry: Record<string, unknown>,
  attendanceStatus = 'present'
) {
  const { data: existing } = await admin
    .from('daily_updates')
    .select('id, work_entries')
    .eq('company_id', companyId)
    .eq('user_id', userId)
    .eq('date', date)
    .maybeSingle()

  if (existing) {
    const currentEntries = Array.isArray(existing.work_entries) ? existing.work_entries : []
    await admin
      .from('daily_updates')
      .update({ work_entries: [...currentEntries, entry] })
      .eq('id', existing.id)
  } else {
    await admin.from('daily_updates').insert({
      company_id: companyId,
      user_id: userId,
      date,
      attendance_status: attendanceStatus,
      work_type: 'office',
      work_entries: [entry],
    })
  }
}

export async function updateLeaveStatus(
  leaveId: string,
  status: 'approved' | 'rejected'
): Promise<{ success: boolean; error?: string }> {
  // Verify caller is authenticated + is ADMIN
  const supabase = await createServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { success: false, error: 'Not authenticated' }

  const { data: adminUser } = await supabase
    .from('users')
    .select('role')
    .eq('id', user.id)
    .single()
  if (adminUser?.role !== 'ADMIN') return { success: false, error: 'Admin only' }

  // Use service-role client so RLS doesn't block the update
  const admin = createAdminClient()

  type LeaveWithUser = {
    company_id: string
    user_id: string
    from_date: string
    to_date: string
    leave_type: string | null
    reason: string | null
    created_at: string
    permission_time: string | null
    permission_end_time: string | null
    permission_hours: number | null
    half_day_from_time: string | null
    half_day_to_time: string | null
    half_day_period: string | null
    users: { name: string; phone: string | null } | null
  }

  const { data: leaveRaw } = await admin
    .from('leaves')
    .select('company_id, user_id, from_date, to_date, leave_type, reason, created_at, permission_time, permission_end_time, permission_hours, half_day_from_time, half_day_to_time, half_day_period, users(name, phone)')
    .eq('id', leaveId)
    .single()

  const leave = leaveRaw as LeaveWithUser | null

  const { error } = await admin
    .from('leaves')
    .update({ status })
    .eq('id', leaveId)

  if (error) return { success: false, error: error.message }

  // Auto-update attendance when approved
  // Skip permission (still present), wfh and shoot_day (handled separately below)
  if (status === 'approved' && leave && leave.leave_type !== 'permission' && leave.leave_type !== 'wfh' && leave.leave_type !== 'shoot_day') {
    const curr = new Date(leave.from_date + 'T12:00:00')
    const end  = new Date(leave.to_date   + 'T12:00:00')
    while (curr <= end) {
      const dateStr = curr.toISOString().split('T')[0]
      const { data: existing } = await admin
        .from('attendance_logs')
        .select('id, clock_in')
        .eq('company_id', leave.company_id)
        .eq('user_id', leave.user_id)
        .eq('date', dateStr)
        .maybeSingle()
      if (!existing) {
        const attStatus = leave.leave_type === 'half_day' ? 'half_day' : 'leave'
        admin.from('attendance_logs').insert({
          company_id: leave.company_id,
          user_id:    leave.user_id,
          date:       dateStr,
          status:     attStatus,
        }).then(({ error: e }) => { if (e) console.error('[leave approval] attendance insert:', e.message) })
      }
      // For full_day leave: delete any empty daily_update row so the 🌴 leave card shows in history
      if (leave.leave_type === 'full_day') {
        const { data: du } = await admin
          .from('daily_updates')
          .select('id, work_entries')
          .eq('company_id', leave.company_id)
          .eq('user_id', leave.user_id)
          .eq('date', dateStr)
          .maybeSingle()
        if (du) {
          const entries = Array.isArray(du.work_entries) ? (du.work_entries as { task_type?: string }[]).filter(e => e.task_type !== 'break') : []
          if (entries.length === 0) {
            admin.from('daily_updates').delete().eq('id', du.id)
              .then(({ error: e }) => { if (e) console.error('[leave approval] daily_update cleanup:', e.message) })
          }
        }
      }
      curr.setDate(curr.getDate() + 1)
    }

  // For same-day WFH/Shoot Day: auto clock-in using the time employee applied (leave.created_at)
  // Rule: if applied before 9 AM → use 9:30 AM (shift start) as clock-in; after 9 AM → use actual apply time
  } else if (status === 'approved' && leave && (leave.leave_type === 'wfh' || leave.leave_type === 'shoot_day')) {
    const todayIst = new Date().toLocaleString('en-CA', { timeZone: 'Asia/Kolkata' }).split(',')[0]
    // Only auto-clock-in when the leave was SUBMITTED on the same day (attendance-page button flow).
    // Pre-planned leaves applied in advance have created_at from a different date — skip auto clock-in
    // so the employee can manually clock in at the actual start time.
    const createdIst = new Date(leave.created_at).toLocaleString('en-CA', { timeZone: 'Asia/Kolkata' }).split(',')[0]
    if (leave.from_date === todayIst && leave.to_date === todayIst && createdIst === leave.from_date) {
      const { data: existing } = await admin
        .from('attendance_logs')
        .select('id, clock_in')
        .eq('company_id', leave.company_id)
        .eq('user_id', leave.user_id)
        .eq('date', todayIst)
        .maybeSingle()
      // Always use actual apply time — shoots and WFH can legitimately start at 6 AM, 7 AM, etc.
      const clockInTime = leave.created_at
      const workType = leave.leave_type === 'shoot_day' ? 'shoot' : 'wfh'
      if (!existing) {
        // No record yet — plain insert (avoids onConflict key mismatch issues)
        await admin.from('attendance_logs').insert({
          company_id: leave.company_id,
          user_id:    leave.user_id,
          date:       todayIst,
          clock_in:   clockInTime,
          work_type:  workType,
          status:     'present',
        })
      } else if (!existing.clock_in) {
        // Record exists but no clock_in yet — update it
        await admin.from('attendance_logs').update({
          clock_in:  clockInTime,
          work_type: workType,
          status:    'present',
        }).eq('id', existing.id)
      }
    }
    // Auto-insert history entry
    try {
      await autoInsertLeaveHistory(admin, leave)
    } catch (e) {
      console.error('Failed to auto-insert leave history:', e)
    }
  }

  if (leave && leave.users?.phone) {
    const leaveType = leave.leave_type ?? 'full_day'
    const approvedEvent = leaveType === 'wfh' ? 'wfh.approved' : leaveType === 'shoot_day' ? 'shoot.approved' : 'leave.approved'
    const rejectedEvent = leaveType === 'wfh' ? 'wfh.rejected' : leaveType === 'shoot_day' ? 'shoot.rejected' : 'leave.rejected'
    sendNotification({
      event:          status === 'approved' ? approvedEvent : rejectedEvent,
      employee_name:  leave.users.name,
      employee_phone: leave.users.phone,
      from_date:      leave.from_date,
      to_date:        leave.to_date,
      status,
    }).catch(console.error)
  }

  if (leave) {
    const leaveLabel = leave.leave_type === 'permission' ? 'Permission' : leave.leave_type === 'half_day' ? 'Half Day Leave' : leave.leave_type === 'wfh' ? 'Work From Home' : leave.leave_type === 'shoot_day' ? 'Shoot Day' : 'Full Day Leave'
    insertNotification({
      companyId: leave.company_id,
      userId: leave.user_id,
      type: 'leave_status',
      title: status === 'approved' ? `${leaveLabel} Approved` : `${leaveLabel} Rejected`,
      body: `Your ${leaveLabel.toLowerCase()} request has been ${status}.`,
      link: '/member/leaves',
    }).catch(console.error)
  }

  revalidatePath('/admin/leaves')
  revalidatePath('/member/leaves')
  revalidatePath('/member/dashboard')
  revalidatePath('/member/history')
  revalidatePath('/admin/activities')
  return { success: true }
}

// Called directly from the attendance page when employee clicks WFH/Shoot button
export async function submitWfhAttendanceRequest(
  leaveType: 'wfh' | 'shoot_day',
  reason: string
): Promise<{ success: boolean; error?: string; created_at?: string }> {
  const supabase = await createServerClient()
  const { data: { session } } = await supabase.auth.getSession()
  if (!session) return { success: false, error: 'Not authenticated' }

  let company_id = parseCompanyId(session.access_token)
  if (!company_id) {
    const { data: u } = await supabase.from('users').select('company_id').eq('id', session.user.id).single()
    company_id = u?.company_id ?? null
  }
  if (!company_id) return { success: false, error: 'Could not resolve company' }

  const todayIst = new Date().toLocaleString('en-CA', { timeZone: 'Asia/Kolkata' }).split(',')[0]

  const { data: profile } = await supabase
    .from('users')
    .select('name, employee_id')
    .eq('id', session.user.id)
    .single()

  // Check for existing WFH/Shoot request today (not rejected)
  const { data: existing } = await (supabase.from('leaves') as any)
    .select('id')
    .eq('user_id', session.user.id)
    .eq('from_date', todayIst)
    .in('leave_type', ['wfh', 'shoot_day'])
    .not('status', 'eq', 'rejected')
    .maybeSingle()
  if (existing) return { success: false, error: 'You already have a WFH/Shoot request for today' }

  const { data: inserted, error: insertError } = await (supabase.from('leaves') as any).insert({
    company_id,
    user_id:    session.user.id,
    leave_type: leaveType,
    from_date:  todayIst,
    to_date:    todayIst,
    reason:     reason.trim() || (leaveType === 'shoot_day' ? 'Shoot day' : 'Work from home'),
    status:     'pending',
  }).select('created_at').single()

  if (insertError) return { success: false, error: insertError.message }

  // Notify admin
  const adminClient = createAdminClient()
  const { data: adminUsers } = await adminClient
    .from('users')
    .select('id, phone')
    .eq('company_id', company_id)
    .eq('role', 'ADMIN')

  const adminWithPhone = adminUsers?.find(a => a.phone)
  if (adminWithPhone?.phone) {
    sendNotification({
      event:         leaveType === 'shoot_day' ? 'shoot.submitted' : 'wfh.submitted',
      leave_id:      inserted?.id,
      employee_name: profile?.name ?? '',
      employee_id:   profile?.employee_id ?? '',
      from_date:     todayIst,
      to_date:       todayIst,
      reason:        reason.trim(),
      admin_phone:   adminWithPhone.phone,
    }).catch(console.error)
  }

  const leaveLabel = leaveType === 'shoot_day' ? 'Shoot Day' : 'WFH'
  if (adminUsers?.length) {
    insertManyNotifications(adminUsers.map(a => ({
      companyId: company_id!,
      userId:    a.id,
      type:      'leave_submitted',
      title:     `${profile?.name ?? 'Employee'} requested ${leaveLabel} today`,
      body:      reason.trim() || leaveLabel,
      link:      '/admin/leaves',
    }))).catch(console.error)
  }

  revalidatePath('/member/attendance')
  revalidatePath('/admin/leaves')
  return { success: true, created_at: inserted?.created_at }
}
