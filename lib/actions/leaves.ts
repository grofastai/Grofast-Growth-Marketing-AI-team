'use server'

import { createServerClient } from '@/lib/supabase/server'
import { revalidatePath } from 'next/cache'
import { sendNotification } from '@/lib/notifications/send'
import { z } from 'zod'

const leaveSchema = z.object({
  from_date: z.string().min(1, 'Start date required'),
  to_date: z.string().min(1, 'End date required'),
  reason: z.string().min(5, 'Please provide a reason (min 5 characters)'),
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
  _prev: { error: string } | null,
  formData: FormData
): Promise<{ error: string } | { success: true }> {
  const raw = {
    from_date: formData.get('from_date') as string,
    to_date: formData.get('to_date') as string,
    reason: formData.get('reason') as string,
  }

  const parsed = leaveSchema.safeParse(raw)
  if (!parsed.success) {
    return { error: parsed.error.issues[0].message }
  }

  const supabase = await createServerClient()
  const { data: { session } } = await supabase.auth.getSession()
  if (!session) return { error: 'Not authenticated' }

  const company_id = parseCompanyId(session.access_token)
  if (!company_id) return { error: 'Missing company claim' }

  const { data: profile } = await supabase
    .from('users')
    .select('name, employee_id')
    .eq('id', session.user.id)
    .single()

  const { error: insertError } = await supabase.from('leaves').insert({
    company_id,
    user_id: session.user.id,
    from_date: parsed.data.from_date,
    to_date: parsed.data.to_date,
    reason: parsed.data.reason,
  })

  if (insertError) return { error: insertError.message }

  // Notify admin via WhatsApp
  if (profile) {
    const { data: adminPhone } = await supabase
      .from('users')
      .select('phone')
      .eq('company_id', company_id)
      .eq('role', 'ADMIN')
      .limit(1)
      .single()

    if (adminPhone?.phone) {
      sendNotification({
        event: 'leave.submitted',
        employee_name: profile.name,
        employee_id: profile.employee_id,
        from_date: parsed.data.from_date,
        to_date: parsed.data.to_date,
        reason: parsed.data.reason,
        admin_phone: adminPhone.phone,
      }).catch(console.error)
    }
  }

  revalidatePath('/member/leaves')
  revalidatePath('/admin/leaves')
  return { success: true }
}

export async function updateLeaveStatus(
  leaveId: string,
  status: 'approved' | 'rejected'
): Promise<{ success: boolean; error?: string }> {
  const supabase = await createServerClient()
  const { data: { session } } = await supabase.auth.getSession()
  if (!session) return { success: false, error: 'Not authenticated' }

  type LeaveWithUser = {
    from_date: string
    to_date: string
    users: { name: string; phone: string | null } | null
  }

  // Fetch leave + employee phone before updating
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

  // Notify employee via WhatsApp
  if (leave && leave.users?.phone) {
    sendNotification({
      event: status === 'approved' ? 'leave.approved' : 'leave.rejected',
      employee_name: leave.users.name,
      employee_phone: leave.users.phone,
      from_date: leave.from_date,
      to_date: leave.to_date,
      status,
    }).catch(console.error)
  }

  revalidatePath('/admin/leaves')
  revalidatePath('/member/leaves')
  return { success: true }
}
