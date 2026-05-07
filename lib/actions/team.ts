'use server'

import { createServerClient } from '@/lib/supabase/server'
import { createClient } from '@supabase/supabase-js'
import { revalidatePath } from 'next/cache'

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
) {
  const metaToken   = process.env.META_WHATSAPP_TOKEN
  const metaPhoneId = process.env.META_PHONE_NUMBER_ID
  if (!metaToken || !metaPhoneId) {
    console.warn('[notifyWhatsApp] META credentials not set — skipping onboarding WhatsApp')
    return
  }

  const admin = adminSupabase()
  let status: 'sent' | 'failed' = 'sent'
  let providerRef: string | null = null

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
      console.error('[notifyWhatsApp] Meta API error:', json)
    } else {
      providerRef = json?.messages?.[0]?.id ?? null
    }
  } catch (err) {
    status = 'failed'
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
}

export async function createMember(input: {
  name: string
  employee_id: string
  email: string
  phone: string
  role: 'ADMIN' | 'MEMBER'
  team: string
  password: string
  employment_type?: 'regular' | 'part_time' | 'freelancer'
  monthly_salary?: number | null
  hourly_rate?: number | null
  paid_leave_days?: number
  date_of_birth?: string | null
  joined_at?: string | null
}): Promise<{ success: boolean; error?: string }> {
  if (!input.name || !input.employee_id || !input.email || !input.password) {
    return { success: false, error: 'Name, Employee ID, Email and Password are required' }
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
    employee_id: input.employee_id,
    role: input.role,
    name: input.name,
    phone: input.phone || null,
    email: input.email,
    team: input.team || null,
    status: 'active',
    must_change_password: true,
    employment_type: input.employment_type ?? 'regular',
    monthly_salary: input.monthly_salary ?? null,
    hourly_rate: input.hourly_rate ?? null,
    paid_leave_days: input.paid_leave_days ?? 5,
    date_of_birth: input.date_of_birth ?? null,
    joined_at: input.joined_at ?? null,
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

  // Part-time and freelancer members don't get onboarding WhatsApp notifications
  const skipNotification = input.employment_type === 'part_time' || input.employment_type === 'freelancer'

  if (input.phone && !recentlySent && !skipNotification) {
    const loginLink = 'https://grofastteam.vercel.app/'

    let cleanPhone = input.phone.replace(/\D/g, '')
    // Auto-add India country code for 10-digit numbers
    if (cleanPhone.length === 10) cleanPhone = '91' + cleanPhone
    else if (cleanPhone.startsWith('0') && cleanPhone.length === 11) cleanPhone = '91' + cleanPhone.slice(1)
    notifyWhatsApp(
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
    ).catch(() => {})
  }

  revalidatePath('/admin/team')
  return { success: true }
}

export async function updateMember(input: {
  id: string
  name: string
  email: string
  phone: string
  role: 'ADMIN' | 'MEMBER'
  team: string
  employment_type?: 'regular' | 'part_time' | 'freelancer'
  monthly_salary?: number | null
  hourly_rate?: number | null
  paid_leave_days?: number
  date_of_birth?: string | null
  joined_at?: string | null
}): Promise<{ success: boolean; error?: string }> {
  const supabase = await createServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { success: false, error: 'Not authenticated' }

  const admin = adminSupabase()
  const { error } = await admin
    .from('users')
    .update({
      name: input.name,
      email: input.email || null,
      phone: input.phone || null,
      role: input.role,
      team: input.team || null,
      employment_type: input.employment_type ?? 'regular',
      monthly_salary: input.monthly_salary ?? null,
      hourly_rate: input.hourly_rate ?? null,
      paid_leave_days: input.paid_leave_days ?? 5,
      date_of_birth: input.date_of_birth ?? null,
      joined_at: input.joined_at ?? null,
    })
    .eq('id', input.id)

  if (error) return { success: false, error: error.message }

  revalidatePath('/admin/team')
  return { success: true }
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
  const { error } = await admin
    .from('users')
    .update({ name: input.name.trim(), phone: input.phone.trim() || null })
    .eq('id', user.id)

  if (error) return { success: false, error: error.message }

  revalidatePath('/member/profile')
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
    // Deactivating = move to Past Members (soft-delete) + revoke login
    const { error } = await admin
      .from('users')
      .update({ status: 'inactive', deleted_at: new Date().toISOString() })
      .eq('id', id)
    if (error) return { success: false, error: error.message }
    // Revoke login access
    await admin.auth.admin.deleteUser(id)
  } else {
    // Reactivating — clear deleted_at so they appear in active list again
    const { error } = await admin
      .from('users')
      .update({ status: 'active', deleted_at: null })
      .eq('id', id)
    if (error) return { success: false, error: error.message }
  }

  revalidatePath('/admin/team')
  return { success: true }
}
