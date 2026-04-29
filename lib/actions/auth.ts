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
    employee_id: (formData.get('employee_id') as string)?.trim(),
    password: formData.get('password') as string,
  }

  const parsed = loginSchema.safeParse(raw)
  if (!parsed.success) {
    return { error: parsed.error.issues[0].message }
  }

  // Look up email + role by employee_id — service role bypasses RLS entirely
  const admin = adminSupabase()
  const { data: userRecord, error: lookupError } = await admin
    .from('users')
    .select('email, role')
    .eq('employee_id', parsed.data.employee_id)
    .maybeSingle()

  if (lookupError || !userRecord) {
    return { error: 'Employee ID not found. Check with your admin.' }
  }
  if (!userRecord.email) {
    return { error: 'Account not fully set up. Contact your admin.' }
  }

  // Sign in with Supabase Auth
  const supabase = await createServerClient()
  const { error: authError } = await supabase.auth.signInWithPassword({
    email: userRecord.email,
    password: parsed.data.password,
  })

  if (authError) {
    return { error: 'Incorrect password. Please try again.' }
  }

  // Use role from DB — reliable even without the JWT custom hook
  redirect(userRecord.role === 'MEMBER' ? '/member/dashboard' : '/admin/dashboard')
}

export async function logoutAction(): Promise<void> {
  const supabase = await createServerClient()
  await supabase.auth.signOut()
  redirect('/login')
}
