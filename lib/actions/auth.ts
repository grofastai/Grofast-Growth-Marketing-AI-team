'use server'

import { createServerClient } from '@/lib/supabase/server'
import { createClient } from '@supabase/supabase-js'
import { redirect } from 'next/navigation'
import { headers, cookies } from 'next/headers'
import { loginSchema, changePasswordSchema } from '@/lib/validations/auth'
import { loginLimiter } from '@/lib/ratelimit'
import { findUnresolvedLogoutDate } from '@/lib/attendance-gate'

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
  if (loginLimiter) {
    const h = await headers()
    const ip = h.get('x-forwarded-for')?.split(',')[0]?.trim() ?? 'anonymous'
    const { success } = await loginLimiter.limit(ip)
    if (!success) return { error: 'Too many login attempts. Please wait a minute and try again.' }
  }

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
    .select('role, must_change_password, company_id, is_management')
    .eq('id', user.id)
    .maybeSingle()

  // Resume timer: accumulate offline seconds into paused_seconds
  const today = new Date().toISOString().split('T')[0]
  const { data: pausedLog } = await admin
    .from('attendance_logs')
    .select('id, paused_seconds, session_paused_at')
    .eq('user_id', user.id)
    .eq('date', today)
    .eq('status', 'present')
    .is('clock_out', null)
    .not('session_paused_at', 'is', null)
    .maybeSingle()

  if (pausedLog?.session_paused_at) {
    const offlineSecs = Math.floor(
      (Date.now() - new Date(pausedLog.session_paused_at).getTime()) / 1000
    )
    await admin
      .from('attendance_logs')
      .update({
        paused_seconds: (pausedLog.paused_seconds ?? 0) + offlineSecs,
        session_paused_at: null,
      })
      .eq('id', pausedLog.id)
  }

  if (profile?.must_change_password) {
    redirect('/change-password')
  }

  // Logout is mandatory: send members straight to the Attendance page to fix a
  // stale open session instead of the dashboard — don't let login itself in
  // past this until yesterday's (or any earlier day's) clock-out is resolved.
  // Management is exempt — same as the MemberGate exemption in app/member/layout.tsx —
  // otherwise they'd get redirected away from the dashboard with no explanation, since
  // the gate UI that would normally justify it is hidden for them.
  if (profile?.role === 'MEMBER' && profile.company_id && profile.is_management !== true) {
    const unresolvedDate = await findUnresolvedLogoutDate(admin, profile.company_id, user.id, today)
    if (unresolvedDate) redirect('/member/attendance')
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
  // If an admin is impersonating a member, "Sign Out" exits impersonation and
  // returns to the admin panel — it does NOT end the admin's real session and
  // does NOT touch the member's attendance timer.
  const cookieStore = await cookies()
  if (cookieStore.get('gf_impersonate')?.value) {
    cookieStore.delete('gf_impersonate')
    redirect('/admin/team')
  }

  const supabase = await createServerClient()

  // Pause the live timer for any active clock-in before signing out
  const { data: { user } } = await supabase.auth.getUser()
  if (user) {
    const admin = adminSupabase()
    const today = new Date().toISOString().split('T')[0]
    await admin
      .from('attendance_logs')
      .update({ session_paused_at: new Date().toISOString() })
      .eq('user_id', user.id)
      .eq('date', today)
      .eq('status', 'present')
      .is('clock_out', null)
      .is('session_paused_at', null)
  }

  await supabase.auth.signOut()
  redirect('/login')
}
