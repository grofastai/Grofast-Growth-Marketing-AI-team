'use server'

import { createServerClient } from '@/lib/supabase/server'
import { revalidatePath } from 'next/cache'
import { sendNotification } from '@/lib/notifications/send'
import { z } from 'zod'

const leaveSchema = z.object({
  leave_type:       z.enum(['full_day', 'half_day', 'permission']).default('full_day'),
  from_date:        z.string().min(1, 'Date required'),
  to_date:          z.string().min(1, 'End date required'),
  half_day_period:  z.enum(['morning', 'afternoon']).optional(),
  permission_hours: z.coerce.number().min(0.5).max(8).optional(),
  reason:           z.string().min(3, 'Please provide a reason'),
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
    leave_type:       leaveType,
    from_date:        formData.get('from_date') as string,
    to_date:          leaveType === 'full_day' ? (formData.get('to_date') as string) : (formData.get('from_date') as string),
    half_day_period:  formData.get('half_day_period') || undefined,
    permission_hours: formData.get('permission_hours') ? Number(formData.get('permission_hours')) : undefined,
    reason:           formData.get('reason') as string,
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

  const { data: inserted, error: insertError } = await supabase.from('leaves').insert({
    company_id,
    user_id:          session.user.id,
    from_date:        parsed.data.from_date,
    to_date:          parsed.data.to_date,
    reason:           parsed.data.reason,
    leave_type:       parsed.data.leave_type,
    permission_hours: parsed.data.permission_hours ?? null,
    half_day_period:  (parsed.data.half_day_period ?? null) as 'morning' | 'afternoon' | null,
  }).select('id').single()

  if (insertError) return { error: insertError.message }

  if (profile && inserted?.id) {
    const { data: adminPhone } = await supabase
      .from('users')
      .select('phone')
      .eq('company_id', company_id)
      .eq('role', 'ADMIN')
      .limit(1)
      .single()

    if (adminPhone?.phone) {
      sendNotification({
        event:         'leave.submitted',
        leave_id:      inserted.id,
        employee_name: profile.name,
        employee_id:   profile.employee_id,
        from_date:     parsed.data.from_date,
        to_date:       parsed.data.to_date,
        reason:        parsed.data.reason,
        admin_phone:   adminPhone.phone,
      }).catch(console.error)
    }
  }

  revalidatePath('/member/leaves')
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
  if (leave.status !== 'pending') return { success: false, error: 'Can only delete pending requests' }

  const { error } = await supabase
    .from('leaves')
    .delete()
    .eq('id', leaveId)

  if (error) return { success: false, error: error.message }

  revalidatePath('/member/leaves')
  revalidatePath('/admin/leaves')
  return { success: true }
}

export async function updateLeaveStatus(
  leaveId: string,
  status: 'approved' | 'rejected'
): Promise<{ success: boolean; error?: string }> {
  const supabase = await createServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { success: false, error: 'Not authenticated' }

  const { data: { session } } = await supabase.auth.getSession()
  const claims = session?.access_token
    ? (() => { try { return JSON.parse(atob(session.access_token.split('.')[1])) } catch { return null } })()
    : null
  if (claims?.role !== 'ADMIN') return { success: false, error: 'Admin only' }

  type LeaveWithUser = {
    from_date: string
    to_date: string
    users: { name: string; phone: string | null } | null
  }

  const { data: leaveRaw } = await supabase
    .from('leaves')
    .select('from_date, to_date, users(name, phone)')
    .eq('id', leaveId)
    .single()

  const leave = leaveRaw as LeaveWithUser | null

  const { error } = await supabase
    .from('leaves')
    .update({ status })
    .eq('id', leaveId)

  if (error) return { success: false, error: error.message }

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

  revalidatePath('/admin/leaves')
  revalidatePath('/member/leaves')
  return { success: true }
}
