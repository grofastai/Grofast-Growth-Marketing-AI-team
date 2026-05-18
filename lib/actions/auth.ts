'use server'

import { createServerClient } from '@/lib/supabase/server'
import { createClient } from '@supabase/supabase-js'
import { redirect } from 'next/navigation'
import { loginSchema, changePasswordSchema } from '@/lib/validations/auth'

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
    email: (formData.get('email') as string)?.trim(),
    password: formData.get('password') as string,
  }

  const parsed = loginSchema.safeParse(raw)
  if (!parsed.success) {
    return { error: parsed.error.issues[0].message }
  }

  const supabase = await createServerClient()

  const { error } = await supabase.auth.signInWithPassword({
    email: parsed.data.email,
    password: parsed.data.password,
  })

  if (error) {
    return { error: 'Invalid email or password. Please try again.' }
  }

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'Session error. Please try again.' }

  const admin = adminSupabase()
  const { data: profile } = await admin
    .from('users')
    .select('role, must_change_password')
    .eq('id', user.id)
    .maybeSingle()

  if (profile?.must_change_password) {
    redirect('/change-password')
  }

  redirect(
    profile?.role === 'ADMIN'          ? '/admin/dashboard' :
    profile?.role === 'FREELANCER_MGR' ? '/freelancer/dashboard' :
    '/member/dashboard'
  )
}

export async function changePasswordAction(
  _prev: { error: string } | null,
  formData: FormData
): Promise<{ error: string } | null> {
  const raw = {
    password: formData.get('password') as string,
    confirm: formData.get('confirm') as string,
  }

  const parsed = changePasswordSchema.safeParse(raw)
  if (!parsed.success) {
    return { error: parsed.error.issues[0].message }
  }

  const supabase = await createServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'Not authenticated' }

  const { error: pwError } = await supabase.auth.updateUser({
    password: parsed.data.password,
  })
  if (pwError) return { error: pwError.message }

  const admin = adminSupabase()
  await admin.from('users').update({ must_change_password: false }).eq('id', user.id)

  // Sign out so the next login starts a clean session with the new password
  await supabase.auth.signOut()
  redirect('/login')
}

export async function logoutAction(): Promise<void> {
  const supabase = await createServerClient()
  await supabase.auth.signOut()
  redirect('/login')
}
