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
  if (!input.name || !input.employee_id || !input.password) {
    return { success: false, error: 'Name, Employee ID and Password are required' }
  }

  const supabase = await createServerClient()
  const { data: { session } } = await supabase.auth.getSession()
  if (!session) return { success: false, error: 'Not authenticated' }

  const admin = adminSupabase()

  // Try JWT claim first; fall back to looking up by slug directly
  let company_id = parseCompanyId(session.access_token)
  let companySlug = 'grofast'

  if (company_id) {
    const { data: c } = await admin.from('companies').select('slug').eq('id', company_id).single()
    if (c) companySlug = c.slug
  } else {
    // JWT hook not set up yet — look up by hardcoded slug
    const { data: c } = await admin.from('companies').select('id, slug').eq('slug', 'grofast').single()
    if (!c) return { success: false, error: 'Company not found. Run the seed SQL to create the grofast company.' }
    company_id = c.id
    companySlug = c.slug
  }

  const email = `${input.employee_id.toLowerCase()}@${companySlug}.internal`

  const { data: authData, error: authError } = await admin.auth.admin.createUser({
    email,
    password: input.password,
    email_confirm: true,
  })

  if (authError) return { success: false, error: authError.message }

  const { error: insertError } = await admin.from('users').insert({
    id: authData.user.id,
    company_id,
    employee_id: input.employee_id,
    role: input.role,
    name: input.name,
    phone: input.phone || null,
    email: input.email || null,
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
  const { data: { session } } = await supabase.auth.getSession()
  if (!session) return { success: false, error: 'Not authenticated' }

  const { error } = await supabase
    .from('users')
    .update({ name: input.name, email: input.email || null, phone: input.phone || null, role: input.role })
    .eq('id', input.id)

  if (error) return { success: false, error: error.message }

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
