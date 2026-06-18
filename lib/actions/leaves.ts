'use server'

import { createServerClient } from '@/lib/supabase/server'
import { createClient } from '@supabase/supabase-js'
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
  leave_type:          z.enum(['full_day', 'half_day', 'permission']).default('full_day'),
  from_date:           z.string().min(1, 'Date required'),
  to_date:             z.string().min(1, 'End date required'),
  half_day_period:     z.enum(['morning', 'afternoon']).optional(),
  half_day_from_time:  z.string().optional(),
  half_day_to_time:    z.string().optional(),
  permission_hours:    z.coerce.number().min(0.1).max(12).optional(),
  permission_time:     z.string().optional(),
  permission_end_time: z.string().optional(),
  reason:              z.string().min(3, 'Please provide a reason'),
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
    to_date:             leaveType === 'full_day' ? (formData.get('to_date') as string) : (formData.get('from_date') as string),
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

  const supabase = await createServerClient()
  const { data: { session } } = await supabase.auth.getSession()
  if (!session) return { error: 'Not authenticated' }

  let company_id = parseCompanyId(session.access_token)
  if (!company_id) {
    const { data: u } = await supabase.from('users').select('company_id').eq('id', session.user.id).single()
    company_id = u?.company_id ?? null
  }
  if (!company_id) return { error: 'Could not resolve company. Please sign out and sign in again.' }

  const { data: profile } = await supabase
    .from('users')
    .select('name, employee_id')
    .eq('id', session.user.id)
    .single()

  const { data: overlapping } = await supabase
    .from('leaves')
    .select('id')
    .eq('user_id', session.user.id)
    .lte('from_date', parsed.data.to_date)
    .gte('to_date', parsed.data.from_date)
    .not('status', 'eq', 'rejected')
    .limit(1)

  if (overlapping && overlapping.length > 0) {
    return { error: 'You already have a leave request for those dates.' }
  }

  const { data: inserted, error: insertError } = await (supabase.from('leaves') as any).insert({
    company_id,
    user_id:             session.user.id,
    from_date:           parsed.data.from_date,
    to_date:             parsed.data.to_date,
    reason:              parsed.data.reason,
    leave_type:          parsed.data.leave_type,
    permission_hours:    parsed.data.permission_hours ?? null,
    permission_time:     parsed.data.permission_time ?? null,
    permission_end_time: parsed.data.permission_end_time ?? null,
    half_day_period:     (parsed.data.half_day_period ?? null),
    half_day_from_time:  parsed.data.half_day_from_time ?? null,
    half_day_to_time:    parsed.data.half_day_to_time ?? null,
  }).select('id').single()

  if (insertError) return { error: insertError.message }

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
        event:         'leave.submitted',
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
        : parsed.data.leave_type === 'half_day' ? `Half-day on ${parsed.data.from_date}` : `Permission on ${parsed.data.from_date}`
      await insertManyNotifications(adminUsers.map(a => ({
        companyId: company_id,
        userId: a.id,
        type: 'leave_submitted',
        title: `${profile.name} applied for leave`,
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

  // Only allow deleting own pending leaves
  const { data: leave } = await supabase
    .from('leaves')
    .select('user_id, status')
    .eq('id', leaveId)
    .single()

  if (!leave) return { success: false, error: 'Leave not found' }
  if (leave.user_id !== user.id) return { success: false, error: 'Not authorized' }
  const { error } = await supabase
    .from('leaves')
    .delete()
    .eq('id', leaveId)

  if (error) return { success: false, error: error.message }

  revalidatePath('/member/leaves')
  revalidatePath('/member/dashboard')
  revalidatePath('/admin/leaves')
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
    to_date:             leaveType === 'full_day' ? (formData.get('to_date') as string) : (formData.get('from_date') as string),
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
    half_day_from_time: string | null
    half_day_to_time: string | null
    half_day_period: string | null
  }
) {
  const type = leave.leave_type ?? 'full_day'

  if (type === 'permission') {
    // Insert break entry with exact times on the leave date
    const startTime = leave.permission_time ?? null
    const endTime   = leave.permission_end_time ?? null
    if (!startTime || !endTime) return

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
      await upsertWorkEntry(admin, leave.company_id, leave.user_id, date, entry, 'on_leave')
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
    permission_time: string | null
    permission_end_time: string | null
    half_day_from_time: string | null
    half_day_to_time: string | null
    half_day_period: string | null
    users: { name: string; phone: string | null } | null
  }

  const { data: leaveRaw } = await admin
    .from('leaves')
    .select('company_id, user_id, from_date, to_date, leave_type, reason, permission_time, permission_end_time, half_day_from_time, half_day_to_time, half_day_period, users(name, phone)')
    .eq('id', leaveId)
    .single()

  const leave = leaveRaw as LeaveWithUser | null

  const { error } = await admin
    .from('leaves')
    .update({ status })
    .eq('id', leaveId)

  if (error) return { success: false, error: error.message }

  // Auto-insert history entry when leave is approved
  if (status === 'approved' && leave) {
    try {
      await autoInsertLeaveHistory(admin, leave)
    } catch (e) {
      console.error('Failed to auto-insert leave history:', e)
    }
  }

  if (leave && leave.users?.phone) {
    sendNotification({
      event:          status === 'approved' ? 'leave.approved' : 'leave.rejected',
      employee_name:  leave.users.name,
      employee_phone: leave.users.phone,
      from_date:      leave.from_date,
      to_date:        leave.to_date,
      status,
    }).catch(console.error)
  }

  if (leave) {
    insertNotification({
      companyId: leave.company_id,
      userId: leave.user_id,
      type: 'leave_status',
      title: status === 'approved' ? 'Leave Approved' : 'Leave Rejected',
      body: `Your leave request has been ${status}.`,
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
