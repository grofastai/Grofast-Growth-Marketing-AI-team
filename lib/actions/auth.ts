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

  const empId = parsed.data.employee_id.toLowerCase()
  const email = `${empId}@grofast.local`

  const supabase = await createServerClient()

  // Try @grofast.local first (new pattern)
  let authError: unknown = null
  let signedIn = false

  const { error: err1 } = await supabase.auth.signInWithPassword({
    email,
    password: parsed.data.password,
  })

  if (!err1) {
    signedIn = true
  } else {
    // Backwards compat: fall back to real email stored in users table
    const admin = adminSupabase()
    const { data: userRecord } = await admin
      .from('users')
      .select('email')
      .eq('employee_id', parsed.data.employee_id)
      .maybeSingle()

    if (userRecord?.email && userRecord.email !== email) {
      const { error: err2 } = await supabase.auth.signInWithPassword({
        email: userRecord.email,
        password: parsed.data.password,
      })
      if (!err2) {
        signedIn = true
      } else {
        authError = err2
      }
    } else {
      authError = err1
    }
  }

  if (!signedIn) {
    return { error: 'Incorrect Employee ID or password. Please try again.' }
  }

  // Read role from DB — reliable without JWT custom hook
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'Session error. Please try again.' }

  const admin = adminSupabase()
  const { data: profile } = await admin
    .from('users')
    .select('role')
    .eq('id', user.id)
    .maybeSingle()

  redirect(profile?.role === 'MEMBER' ? '/member/dashboard' : '/admin/dashboard')
}

export async function logoutAction(): Promise<void> {
  const supabase = await createServerClient()
  await supabase.auth.signOut()
  redirect('/login')
}
