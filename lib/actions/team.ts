'use server'

import { createServerClient } from '@/lib/supabase/server'
import { createClient } from '@supabase/supabase-js'
import { revalidatePath } from 'next/cache'
import { getOrCreateMemberFolder } from '@/lib/google/drive'
import { normalizePhone } from '@/lib/utils/phone'

function adminSupabase() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  )
}

async function notifyWhatsApp(
  payload: { name: string; email: string; employee_id: string; phone: string; loginLink: string; password: string; team: string },
  meta: { companyId: string; userId: string }
): Promise<{ sent: boolean; errorDetail?: string }> {
  const metaToken   = process.env.META_WHATSAPP_TOKEN
  const metaPhoneId = process.env.META_PHONE_NUMBER_ID
  if (!metaToken || !metaPhoneId) {
    return { sent: false, errorDetail: 'META_WHATSAPP_TOKEN or META_PHONE_NUMBER_ID not set in environment variables' }
  }

  const admin = adminSupabase()
  let status: 'sent' | 'failed' = 'sent'
  let providerRef: string | null = null
  let errorDetail: string | undefined

  const templateName = process.env.WHATSAPP_ONBOARDING_TEMPLATE ?? 'grofast_member_welcome'

  try {
    const res = await fetch(
      `https://graph.facebook.com/v19.0/${metaPhoneId}/messages`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${metaToken}`,
        },
        body: JSON.stringify({
          messaging_product: 'whatsapp',
          to: payload.phone,
          type: 'template',
          template: {
            name: templateName,
            language: { code: 'en' },
            components: [
              {
                type: 'body',
                parameters: [
                  { type: 'text', text: payload.name },
                  { type: 'text', text: payload.employee_id },
                  { type: 'text', text: payload.email },
                  { type: 'text', text: payload.password },
                  { type: 'text', text: payload.team || 'Team' },
                  { type: 'text', text: payload.loginLink },
                ],
              },
            ],
          },
        }),
      }
    )
    const json = await res.json().catch(() => ({}))
    if (!res.ok) {
      status = 'failed'
      const metaMsg = json?.error?.message ?? json?.error?.error_data?.details ?? JSON.stringify(json)
      errorDetail = `Meta API error (${res.status}): ${metaMsg}`
      console.error('[notifyWhatsApp] Meta API error:', json)
    } else {
      providerRef = json?.messages?.[0]?.id ?? null
    }
  } catch (err) {
    status = 'failed'
    errorDetail = `Network error: ${err instanceof Error ? err.message : String(err)}`
    console.error('[notifyWhatsApp] fetch failed:', err)
  }

  await Promise.all([
    admin.from('notifications').insert({
      company_id: meta.companyId,
      user_id: meta.userId,
      type: 'whatsapp_onboarding',
      status,
      phone: payload.phone,
      provider_ref: providerRef,
    }),
    admin.from('users')
      .update({ last_onboarding_notified_at: new Date().toISOString() })
      .eq('id', meta.userId),
  ])
  return { sent: status === 'sent', errorDetail }
}

export async function createMember(input: {
  name: string
  employee_id: string
  email: string
  phone: string
  role: 'ADMIN' | 'MEMBER' | 'FREELANCER_MGR' | 'FOUNDER' | 'CEO'
  team: string
  position?: string | null
  password: string
  employment_type?: 'regular' | 'part_time' | 'freelancer'
  monthly_salary?: number | null
  hourly_rate?: number | null
  paid_leave_days?: number
  date_of_birth?: string | null
  joined_at?: string | null
  gender?: 'male' | 'female'
  work_layout?: 'media' | 'non_media' | 'freelance_media'
  is_management?: boolean
  enabled_blocks?: string[] | null
}): Promise<{ success: boolean; error?: string; whatsappSent?: boolean; whatsappSkipped?: boolean; whatsappError?: string }> {
  // Admin-level roles use real email login (not employee_id-based internal email)
  const isAdmin = input.role === 'ADMIN' || input.role === 'FOUNDER' || input.role === 'CEO'
  if (!input.name || (!isAdmin && !input.employee_id) || !input.email || !input.password) {
    return { success: false, error: isAdmin ? 'Name, Gmail and Password are required' : 'Name, Employee ID, Email and Password are required' }
  }
  if (input.password.length < 6) {
    return { success: false, error: 'Password must be at least 6 characters' }
  }

  const supabase = await createServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { success: false, error: 'Not authenticated' }

  const admin = adminSupabase()

  const { data: adminProfile } = await admin
    .from('users')
    .select('company_id')
    .eq('id', user.id)
    .single()
  if (!adminProfile?.company_id) return { success: false, error: 'Admin profile not found — contact support' }
  const company_id = adminProfile.company_id

  // Block duplicate phone numbers within the company
  const phoneTarget = normalizePhone(input.phone)
  if (phoneTarget.length >= 10) {
    const { data: phoneRows } = await admin
      .from('users').select('id, name, phone')
      .eq('company_id', company_id).not('phone', 'is', null)
    const dup = (phoneRows ?? []).find((u: { phone: string | null }) => normalizePhone(u.phone) === phoneTarget)
    if (dup) return { success: false, error: `This phone number is already used by "${dup.name}".` }
  }

  // Auto-generate employee ID for admin-level accounts
  let finalEmployeeId = input.employee_id
  if (!finalEmployeeId && isAdmin) {
    const prefix = input.role === 'FOUNDER' ? 'FND' : input.role === 'CEO' ? 'CEO' : 'ADM'
    const { data: existingAdmins } = await admin
      .from('users')
      .select('employee_id')
      .eq('company_id', company_id)
      .in('role', ['ADMIN', 'FOUNDER', 'CEO'])
    const pattern = new RegExp(`^${prefix}(\\d+)$`, 'i')
    const nums = (existingAdmins ?? [])
      .map((a: { employee_id: string }) => { const m = a.employee_id.match(pattern); return m ? parseInt(m[1]) : 0 })
      .filter((n: number) => n > 0)
    const maxN = nums.length > 0 ? Math.max(...nums) : 0
    finalEmployeeId = `${prefix}${String(maxN + 1).padStart(3, '0')}`
  }

  const { data: authData, error: authError } = await admin.auth.admin.createUser({
    email: input.email,
    password: input.password,
    email_confirm: true,
    user_metadata: { name: input.name },
  })

  let authUserId: string

  if (authError) {
    // Supabase may return different messages across versions — catch all duplicate-email variants
    const msg = authError.message?.toLowerCase() ?? ''
    const isDuplicateEmail =
      msg.includes('already registered') ||
      msg.includes('already been registered') ||
      msg.includes('email already') ||
      msg.includes('user already') ||
      msg.includes('already exists') ||
      authError.status === 422

    if (!isDuplicateEmail) {
      return { success: false, error: authError.message }
    }

    // Check if an active profile already exists for this company
    const { data: existingProfile } = await admin
      .from('users').select('id').eq('email', input.email).maybeSingle()

    if (existingProfile) {
      return { success: false, error: 'This email is already in use by a team member.' }
    }

    // Profile is missing but Auth record exists (e.g. partially deleted account).
    // Find it and reuse/repair rather than failing.
    const { data: { users: existingAuthUsers } } = await admin.auth.admin.listUsers({ perPage: 1000 })
    const existingAuthUser = existingAuthUsers.find(u => u.email === input.email)

    if (!existingAuthUser) {
      // Auth says email is taken but we can't find the user — likely a soft-delete delay.
      // Wait briefly and retry once.
      await new Promise(r => setTimeout(r, 1500))
      const { data: authData2, error: authError2 } = await admin.auth.admin.createUser({
        email: input.email, password: input.password, email_confirm: true,
        user_metadata: { name: input.name },
      })
      if (authError2) return { success: false, error: 'This email address is unavailable. Try a different one.' }
      authUserId = authData2.user.id
    } else {
      // Repair: reuse existing auth user, reset password
      await admin.auth.admin.updateUserById(existingAuthUser.id, { password: input.password })
      authUserId = existingAuthUser.id
    }
  } else {
    authUserId = authData.user.id
  }

  const { error: insertError } = await admin.from('users').insert({
    id: authUserId,
    company_id,
    employee_id: finalEmployeeId,
    role: input.role,
    name: input.name,
    phone: input.phone || null,
    email: input.email,
    team: input.team || null,
    position: input.position ?? null,
    status: 'active',
    must_change_password: isAdmin ? false : true,
    employment_type: input.employment_type ?? 'regular',
    monthly_salary: input.monthly_salary ?? null,
    hourly_rate: input.hourly_rate ?? null,
    paid_leave_days: input.paid_leave_days ?? 5,
    date_of_birth: input.date_of_birth ?? null,
    joined_at: input.joined_at ?? null,
    gender: input.gender ?? 'male',
    work_layout: input.work_layout ?? 'non_media',
    is_management: input.is_management ?? false,
    enabled_blocks: input.enabled_blocks ?? null,
  })

  if (insertError) {
    if (!authError) await admin.auth.admin.deleteUser(authUserId)
    return { success: false, error: insertError.message }
  }

  // Per-type cooldown: skip if an onboarding notification was sent in the last 60 seconds
  const { data: existingUser } = await admin
    .from('users')
    .select('last_onboarding_notified_at')
    .eq('id', authUserId)
    .single()

  const lastNotified = existingUser?.last_onboarding_notified_at
    ? new Date(existingUser.last_onboarding_notified_at).getTime()
    : 0
  const recentlySent = Date.now() - lastNotified < 60_000

  // Admins, part-time and freelancer members don't get onboarding WhatsApp notifications
  const skipNotification = isAdmin || input.employment_type === 'part_time' || input.employment_type === 'freelancer'

  let whatsappSent = false
  let whatsappError: string | undefined
  if (input.phone && !recentlySent && !skipNotification) {
    const loginLink = 'https://grofastteam.vercel.app/'

    let cleanPhone = input.phone.replace(/\D/g, '')
    // Auto-add India country code for 10-digit numbers
    if (cleanPhone.length === 10) cleanPhone = '91' + cleanPhone
    else if (cleanPhone.startsWith('0') && cleanPhone.length === 11) cleanPhone = '91' + cleanPhone.slice(1)
    const notifyResult = await notifyWhatsApp(
      {
        name: input.name,
        email: input.email,
        employee_id: input.employee_id,
        phone: cleanPhone,
        loginLink,
        password: input.password,
        team: input.team || '',
      },
      { companyId: company_id, userId: authUserId }
    ).catch((err) => ({ sent: false, errorDetail: String(err) }))
    whatsappSent = notifyResult.sent
    whatsappError = notifyResult.errorDetail
  }

  // Create Drive folder for this member (non-blocking — don't fail if Drive is down)
  getOrCreateMemberFolder(input.name).then(folderId => {
    admin.from('users').update({ drive_folder_id: folderId }).eq('id', authUserId).then(() => {})
  }).catch(() => {})

  revalidatePath('/admin/team')
  return { success: true, whatsappSent, whatsappSkipped: skipNotification, whatsappError }
}

export async function resendOnboardingWhatsApp(userId: string): Promise<{ success: boolean; error?: string }> {
  const supabase = await createServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { success: false, error: 'Not authenticated' }

  const admin = adminSupabase()
  const { data: member } = await admin
    .from('users')
    .select('id, name, email, employee_id, phone, team, company_id')
    .eq('id', userId)
    .single()

  if (!member) return { success: false, error: 'Member not found' }
  if (!member.phone) return { success: false, error: 'Member has no phone number on file' }

  let cleanPhone = member.phone.replace(/\D/g, '')
  if (cleanPhone.length === 10) cleanPhone = '91' + cleanPhone
  else if (cleanPhone.startsWith('0') && cleanPhone.length === 11) cleanPhone = '91' + cleanPhone.slice(1)

  const result = await notifyWhatsApp(
    {
      name: member.name,
      email: member.email ?? '',
      employee_id: member.employee_id ?? '',
      phone: cleanPhone,
      loginLink: 'https://grofastteam.vercel.app/',
      password: '(use your password)',
      team: member.team || 'Team',
    },
    { companyId: member.company_id, userId: member.id }
  ).catch((err) => ({ sent: false, errorDetail: String(err) }))

  if (!result.sent) return { success: false, error: result.errorDetail ?? 'Failed to send WhatsApp' }
  return { success: true }
}

export async function updateMember(input: {
  id: string
  name: string
  email: string
  phone: string
  role: 'ADMIN' | 'MEMBER' | 'FREELANCER_MGR' | 'FOUNDER' | 'CEO'
  team: string
  position?: string | null
  employment_type?: 'regular' | 'part_time' | 'freelancer'
  monthly_salary?: number | null
  hourly_rate?: number | null
  paid_leave_days?: number
  date_of_birth?: string | null
  joined_at?: string | null
  gender?: 'male' | 'female'
  work_layout?: 'media' | 'non_media' | 'freelance_media'
  is_management?: boolean
  salaryEffectiveFrom?: string
  enabled_blocks?: string[] | null
}): Promise<{ success: boolean; error?: string }> {
  const supabase = await createServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { success: false, error: 'Not authenticated' }

  const admin = adminSupabase()

  // Block duplicate phone numbers within the company (excluding this member)
  const { data: editorProfile } = await admin.from('users').select('company_id').eq('id', user.id).single()
  const phoneTarget = normalizePhone(input.phone)
  if (editorProfile?.company_id && phoneTarget.length >= 10) {
    const { data: phoneRows } = await admin
      .from('users').select('id, name, phone')
      .eq('company_id', editorProfile.company_id).not('phone', 'is', null)
    const dup = (phoneRows ?? []).find((u: { id: string; phone: string | null }) => u.id !== input.id && normalizePhone(u.phone) === phoneTarget)
    if (dup) return { success: false, error: `This phone number is already used by "${dup.name}".` }
  }

  // If salary is changing, log to salary_history before updating
  if (input.monthly_salary != null && editorProfile?.company_id) {
    const { data: currentUser } = await admin
      .from('users').select('monthly_salary').eq('id', input.id).single()
    const oldSalary = (currentUser as { monthly_salary?: number | null } | null)?.monthly_salary
    if (oldSalary != null && oldSalary !== input.monthly_salary) {
      const effectiveFrom = input.salaryEffectiveFrom ?? new Date().toISOString().split('T')[0]
      // If a history row already exists for this same effective date, update it
      // instead of inserting a duplicate (e.g. admin edits salary twice in one month).
      const { data: existing } = await admin
        .from('salary_history')
        .select('id')
        .eq('user_id', input.id)
        .eq('effective_from', effectiveFrom)
        .maybeSingle()
      if (existing) {
        await admin.from('salary_history').update({ monthly_salary: input.monthly_salary }).eq('id', (existing as { id: string }).id)
      } else {
        await admin.from('salary_history').insert({
          company_id:     editorProfile.company_id,
          user_id:        input.id,
          monthly_salary: input.monthly_salary,
          effective_from: effectiveFrom,
        })
      }
    }
  }

  const { error } = await admin
    .from('users')
    .update({
      name: input.name,
      email: input.email || null,
      phone: input.phone || null,
      role: input.role,
      team: input.team || null,
      position: input.position ?? null,
      employment_type: input.employment_type ?? 'regular',
      monthly_salary: input.monthly_salary ?? null,
      hourly_rate: input.hourly_rate ?? null,
      paid_leave_days: input.paid_leave_days ?? 5,
      date_of_birth: input.date_of_birth ?? null,
      joined_at: input.joined_at ?? null,
      gender: input.gender ?? 'male',
      ...(input.work_layout ? { work_layout: input.work_layout } : {}),
      is_management: input.is_management ?? false,
      ...(input.work_layout === 'non_media' ? { enabled_blocks: input.enabled_blocks ?? null } : {}),
    })
    .eq('id', input.id)

  if (error) return { success: false, error: error.message }

  revalidatePath('/admin/team')
  revalidatePath('/admin/expenses')
  revalidatePath('/admin/payroll')
  revalidatePath('/admin/insights')
  return { success: true }
}

export async function uploadPassportPhoto(
  userId: string,
  formData: FormData,
): Promise<{ success: boolean; url?: string; error?: string }> {
  const supabase = await createServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { success: false, error: 'Not authenticated' }

  const admin = adminSupabase()
  const { data: requester } = await admin
    .from('users').select('company_id, role').eq('id', user.id).single()
  if (!requester || !['ADMIN','FOUNDER','CEO'].includes(requester.role)) return { success: false, error: 'Forbidden' }

  const file = formData.get('file') as File | null
  if (!file) return { success: false, error: 'No file provided' }
  if (file.size > 2 * 1024 * 1024) return { success: false, error: 'File too large (max 2MB)' }

  const ext  = file.name.split('.').pop()?.toLowerCase() ?? 'jpg'
  const path = `${requester.company_id}/${userId}.${ext}`
  const buf  = Buffer.from(await file.arrayBuffer())

  const { error: uploadError } = await admin.storage
    .from('passport-photos')
    .upload(path, buf, { contentType: file.type, upsert: true })

  if (uploadError) return { success: false, error: uploadError.message }

  const { data: { publicUrl } } = admin.storage
    .from('passport-photos')
    .getPublicUrl(path)

  await admin.from('users')
    .update({ passport_photo_url: publicUrl })
    .eq('id', userId)

  revalidatePath('/admin/team')
  return { success: true, url: publicUrl }
}

export async function assignTask(input: {
  member_id: string
  member_name: string
  member_phone: string | null
  title: string
  description: string
  due_date: string | null
}): Promise<{ success: boolean; error?: string; whatsappSent?: boolean }> {
  const supabase = await createServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { success: false, error: 'Not authenticated' }

  const admin = adminSupabase()
  const { data: adminProfile } = await admin
    .from('users')
    .select('name, company_id')
    .eq('id', user.id)
    .single()
  if (!adminProfile) return { success: false, error: 'Admin profile not found' }

  const { error: taskError } = await admin.from('tasks').insert({
    company_id: adminProfile.company_id,
    project_id: null,
    assigned_to: input.member_id,
    title: input.title,
    status: 'todo',
    priority: 'medium',
    due_date: input.due_date || null,
  })
  if (taskError) return { success: false, error: taskError.message }

  let whatsappSent = false
  const metaToken   = process.env.META_WHATSAPP_TOKEN
  const metaPhoneId = process.env.META_PHONE_NUMBER_ID
  const template    = process.env.WHATSAPP_TASK_TEMPLATE ?? 'grofast_task_assigned'

  if (input.member_phone && metaToken && metaPhoneId) {
    let cleanPhone = input.member_phone.replace(/\D/g, '')
    if (cleanPhone.length === 10) cleanPhone = '91' + cleanPhone
    else if (cleanPhone.startsWith('0') && cleanPhone.length === 11) cleanPhone = '91' + cleanPhone.slice(1)

    const dueLine = input.due_date
      ? `Due: ${new Date(input.due_date).toLocaleDateString('en-IN', { day: 'numeric', month: 'long', year: 'numeric' })}`
      : 'No deadline'
    const detailLine = input.description ? `${input.description} | ${dueLine}` : dueLine

    try {
      const res = await fetch(
        `https://graph.facebook.com/v19.0/${metaPhoneId}/messages`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${metaToken}` },
          body: JSON.stringify({
            messaging_product: 'whatsapp',
            to: cleanPhone,
            type: 'template',
            template: {
              name: template,
              language: { code: 'en' },
              components: [{
                type: 'body',
                parameters: [
                  { type: 'text', text: input.member_name },
                  { type: 'text', text: adminProfile.name },
                  { type: 'text', text: input.title },
                  { type: 'text', text: detailLine },
                ],
              }],
            },
          }),
        }
      )
      if (res.ok) whatsappSent = true
    } catch {
      // silent — task was still created
    }
  }

  revalidatePath('/admin/team')
  revalidatePath('/member/tasks')
  return { success: true, whatsappSent }
}

export async function deleteMember(id: string): Promise<{ success: boolean; error?: string }> {
  const supabase = await createServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { success: false, error: 'Not authenticated' }

  const admin = adminSupabase()

  // Hard delete from Supabase Auth first (prevents login immediately)
  await admin.auth.admin.deleteUser(id)

  // Then hard delete the public.users record — removes all traces
  const { error: dbError } = await admin.from('users').delete().eq('id', id)
  if (dbError) return { success: false, error: dbError.message }

  revalidatePath('/admin/team')
  return { success: true }
}

export async function updateOwnProfile(input: {
  name: string
  phone: string
}): Promise<{ success: boolean; error?: string }> {
  if (!input.name.trim()) return { success: false, error: 'Name is required' }

  const supabase = await createServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { success: false, error: 'Not authenticated' }

  const admin = adminSupabase()

  // Block duplicate phone numbers within the company (excluding self)
  const phoneTarget = normalizePhone(input.phone)
  if (phoneTarget.length >= 10) {
    const { data: me } = await admin.from('users').select('company_id').eq('id', user.id).single()
    if (me?.company_id) {
      const { data: phoneRows } = await admin
        .from('users').select('id, name, phone')
        .eq('company_id', me.company_id).not('phone', 'is', null)
      const dup = (phoneRows ?? []).find((u: { id: string; phone: string | null }) => u.id !== user.id && normalizePhone(u.phone) === phoneTarget)
      if (dup) return { success: false, error: `This phone number is already used by "${dup.name}".` }
    }
  }

  const { error } = await admin
    .from('users')
    .update({ name: input.name.trim(), phone: input.phone.trim() || null })
    .eq('id', user.id)

  if (error) return { success: false, error: error.message }

  revalidatePath('/member/profile')
  return { success: true }
}

export async function resetMemberPassword(
  id: string,
  newPassword: string
): Promise<{ success: boolean; error?: string }> {
  if (!newPassword || newPassword.length < 6) return { success: false, error: 'Password must be at least 6 characters' }

  const supabase = await createServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { success: false, error: 'Not authenticated' }

  const admin = adminSupabase()
  const { error } = await admin.auth.admin.updateUserById(id, { password: newPassword })
  if (error) return { success: false, error: error.message }

  await admin.from('users').update({ must_change_password: true }).eq('id', id)

  revalidatePath('/admin/team')
  return { success: true }
}

export async function toggleMemberStatus(
  id: string,
  status: 'active' | 'inactive'
): Promise<{ success: boolean; error?: string }> {
  const supabase = await createServerClient()
  const { data: { session } } = await supabase.auth.getSession()
  if (!session) return { success: false, error: 'Not authenticated' }

  const admin = adminSupabase()

  if (status === 'inactive') {
    // Deactivating — soft-delete only, ban auth so they can't log in but account is preserved
    const { error } = await admin
      .from('users')
      .update({ status: 'inactive', deleted_at: new Date().toISOString() })
      .eq('id', id)
    if (error) return { success: false, error: error.message }
    // Ban instead of delete — keeps auth account so reactivation restores login immediately
    await admin.auth.admin.updateUserById(id, { ban_duration: '876600h' })
  } else {
    // Reactivating — restore to active + unban so they can log in again with same password
    const { error } = await admin
      .from('users')
      .update({ status: 'active', deleted_at: null })
      .eq('id', id)
    if (error) return { success: false, error: error.message }
    await admin.auth.admin.updateUserById(id, { ban_duration: 'none' })
  }

  revalidatePath('/admin/team')
  return { success: true }
}
