'use server'

import { createServerClient } from '@/lib/supabase/server'
import { createClient } from '@supabase/supabase-js'
import { redirect } from 'next/navigation'
import { loginSchema } from '@/lib/validations/auth'

function adminSupabase() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  )
}

export async function loginAction(
  _prev: { error: string } | null,
  formData: FormData
): Promise<{ error: string } | null> {
  const raw = {
    employee_id: formData.get('employee_id') as string,
    password: formData.get('password') as string,
  }

  const parsed = loginSchema.safeParse(raw)
  if (!parsed.success) {
    return { error: parsed.error.issues[0].message }
  }

  // Look up the member's email by employee_id (service role bypasses RLS for login)
  const admin = adminSupabase()
  const { data: userRecord } = await admin
    .from('users')
    .select('email')
    .eq('employee_id', parsed.data.employee_id)
    .single()

  if (!userRecord?.email) {
    return { error: `Employee ID "${parsed.data.employee_id}" not found or has no email. Contact your admin.` }
  }

  const supabase = await createServerClient()
  const { data, error } = await supabase.auth.signInWithPassword({
    email: userRecord.email,
    password: parsed.data.password,
  })

  if (error) {
    return { error: `Login failed: ${error.message}` }
  }

  // Read role from JWT claims injected by the custom_access_token_hook
  const jwt = data.session?.access_token
  let role = 'ADMIN'
  if (jwt) {
    try {
      const payload = JSON.parse(atob(jwt.split('.')[1]))
      role = payload.role ?? 'ADMIN'
    } catch {}
  }

  redirect(role === 'MEMBER' ? '/member/dashboard' : '/admin/dashboard')
}

export async function logoutAction(): Promise<void> {
  const supabase = await createServerClient()
  await supabase.auth.signOut()
  redirect('/login')
}
