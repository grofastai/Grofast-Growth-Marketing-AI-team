'use server'

import { createServerClient } from '@/lib/supabase/server'
import { createClient } from '@supabase/supabase-js'
import { revalidatePath } from 'next/cache'

function parseCompanyId(accessToken: string): string | null {
  try {
    const payload = accessToken.split('.')[1]
    const claims = JSON.parse(atob(payload))
    return claims.company_id ?? null
  } catch {
    return null
  }
}

function adminSupabase() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  )
}

export async function createMember(input: {
  name: string
  employee_id: string
  email: string
  phone: string
  role: 'ADMIN' | 'MEMBER'
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

  // Look up company_id from users table — reliable regardless of JWT hook setup
  const { data: adminProfile } = await admin
    .from('users')
    .select('company_id')
    .eq('id', user.id)
    .single()
  if (!adminProfile?.company_id) return { success: false, error: 'Admin profile not found — contact support' }
  const company_id = adminProfile.company_id

  // Use the real email for Supabase Auth — this is what the member logs in with
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
    status: 'active',
  })

  if (insertError) {
    await admin.auth.admin.deleteUser(authData.user.id)
    return { success: false, error: insertError.message }
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
}): Promise<{ success: boolean; error?: string }> {
  const supabase = await createServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { success: false, error: 'Not authenticated' }

  const admin = adminSupabase()
  const { error } = await admin
    .from('users')
    .update({ name: input.name, email: input.email || null, phone: input.phone || null, role: input.role })
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
