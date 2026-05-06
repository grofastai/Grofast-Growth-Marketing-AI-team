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
  employment_type?: 'regular' | 'irregular'
  monthly_salary?: number | null
  hourly_rate?: number | null
  paid_leave_days?: number
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
    if (!authError.message.includes('already registered')) {
      return { success: false, error: authError.message }
    }

    // Auth user exists — check if public.users record is missing (broken account)
    // Query public.users by email first (faster than paginating auth users)
    const { data: existingProfileByEmail } = await admin
      .from('users').select('id').eq('email', input.email).maybeSingle()

    if (existingProfileByEmail) {
      return { success: false, error: 'This email is already registered' }
    }

    // Profile is missing — find the auth user ID by paginating with high perPage
    const { data: { users: existingAuthUsers } } = await admin.auth.admin.listUsers({ perPage: 1000 })
    const existingAuthUser = existingAuthUsers.find(u => u.email === input.email)
    if (!existingAuthUser) return { success: false, error: 'This email is already registered' }

    // Repair: reset their password and create the missing profile
    await admin.auth.admin.updateUserById(existingAuthUser.id, { password: input.password })
    authUserId = existingAuthUser.id
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

  if (input.phone && !recentlySent) {
    const appUrl = process.env.APP_BASE_URL?.replace(/\/$/, '') ?? ''
    let loginLink = `${appUrl}/login`

    try {
      const { data: linkData } = await admin.auth.admin.generateLink({
        type: 'magiclink',
        email: input.email,
      })
      if (linkData?.properties?.action_link) {
        loginLink = linkData.properties.action_link
      }
    } catch {
      // non-fatal: falls back to plain login URL
    }

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
  employment_type?: 'regular' | 'irregular'
  monthly_salary?: number | null
  hourly_rate?: number | null
  paid_leave_days?: number
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

  // Delete from Supabase Auth first — this cascades to public.users if ON DELETE CASCADE is set.
  // Doing auth first also prevents the member from logging in immediately.
  const { error: authError } = await admin.auth.admin.deleteUser(id)
  if (authError) return { success: false, error: authError.message }

  // Also explicitly delete the public.users row in case cascade is not configured.
  // Ignore "no rows affected" — it may have already been removed by the cascade.
  await admin.from('users').delete().eq('id', id)

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

  const { error } = await supabase
    .from('users')
    .update({ status })
    .eq('id', id)

  if (error) return { success: false, error: error.message }

  revalidatePath('/admin/team')
  return { success: true }
}
