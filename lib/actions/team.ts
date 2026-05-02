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
  const url = process.env.N8N_WEBHOOK_URL
  if (!url) return

  const admin = adminSupabase()
  let status: 'sent' | 'failed' = 'sent'
  let providerRef: string | null = null

  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(process.env.N8N_WEBHOOK_SECRET
          ? { 'x-webhook-secret': process.env.N8N_WEBHOOK_SECRET }
          : {}),
      },
      body: JSON.stringify(payload),
    })
    if (!res.ok) {
      status = 'failed'
    } else {
      try {
        const json = await res.json()
        providerRef = json?.executionId ?? json?.id ?? null
      } catch { /* response body not required */ }
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

  if (authError) {
    if (authError.message.includes('already registered')) {
      return { success: false, error: 'This email is already registered' }
    }
    return { success: false, error: authError.message }
  }

  const { error: insertError } = await admin.from('users').insert({
    id: authData.user.id,
    company_id,
    employee_id: input.employee_id,
    role: input.role,
    name: input.name,
    phone: input.phone || null,
    email: input.email,
    team: input.team || null,
    status: 'active',
    must_change_password: true,
  })

  if (insertError) {
    await admin.auth.admin.deleteUser(authData.user.id)
    return { success: false, error: insertError.message }
  }

  // Per-type cooldown: skip if an onboarding notification was sent in the last 60 seconds
  const { data: existingUser } = await admin
    .from('users')
    .select('last_onboarding_notified_at')
    .eq('id', authData.user.id)
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

    const cleanPhone = input.phone.replace(/\D/g, '')
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
      { companyId: company_id, userId: authData.user.id }
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
}): Promise<{ success: boolean; error?: string }> {
  const supabase = await createServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { success: false, error: 'Not authenticated' }

  const admin = adminSupabase()
  const { error } = await admin
    .from('users')
    .update({ name: input.name, email: input.email || null, phone: input.phone || null, role: input.role, team: input.team || null })
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

  const { error: dbError } = await admin.from('users').delete().eq('id', id)
  if (dbError) return { success: false, error: dbError.message }

  const { error: authError } = await admin.auth.admin.deleteUser(id)
  if (authError) return { success: false, error: authError.message }

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
