'use server'

import { createServerClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import { loginSchema } from '@/lib/validations/auth'

export async function loginAction(
  _prev: { error: string } | null,
  formData: FormData
): Promise<{ error: string } | null> {
  const raw = {
    employee_id: formData.get('employee_id') as string,
    email: formData.get('email') as string,
    password: formData.get('password') as string,
  }

  const parsed = loginSchema.safeParse(raw)
  if (!parsed.success) {
    return { error: parsed.error.issues[0].message }
  }

  const supabase = await createServerClient()
  const { data, error } = await supabase.auth.signInWithPassword({
    email: parsed.data.email,
    password: parsed.data.password,
  })

  if (error) {
    return { error: 'Invalid credentials. Check your Employee ID, email and password.' }
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
