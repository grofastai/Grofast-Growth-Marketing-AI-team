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

async function getUserContext(): Promise<{ userId: string; companyId: string } | { error: string }> {
  const supabase = await createServerClient()
  const { data: { user }, error: authError } = await supabase.auth.getUser()
  if (!user) return { error: authError ? `Auth error: ${authError.message}` : 'No session — please log in again' }

  // Try users table first (service-role query)
  const admin = adminSupabase()
  const { data, error: dbError } = await admin.from('users').select('company_id').eq('id', user.id).single()
  if (data?.company_id) return { userId: user.id, companyId: data.company_id as string }

  if (dbError && dbError.code !== 'PGRST116') {
    // PGRST116 = row not found; any other error means DB/key issue
    return { error: `Database error: ${dbError.message}` }
  }

  // Fallback: decode company_id from JWT claims (set by Supabase Edge Function hook)
  try {
    const { data: { session } } = await supabase.auth.getSession()
    if (session?.access_token) {
      const payload = JSON.parse(atob(session.access_token.split('.')[1]))
      if (payload?.company_id) return { userId: user.id, companyId: payload.company_id as string }
    }
  } catch {}

  return { error: 'Account not linked to a company — contact your admin to re-create your account' }
}

export async function clockIn(workType: 'wfh' | 'office'): Promise<{ success: boolean; error?: string }> {
  const ctxResult = await getUserContext()
  if ('error' in ctxResult) return { success: false, error: ctxResult.error }
  const ctx = ctxResult

  const today = new Date().toISOString().split('T')[0]
  const admin = adminSupabase()

  const { data: existing } = await admin
    .from('attendance_logs')
    .select('id')
    .eq('company_id', ctx.companyId)
    .eq('user_id', ctx.userId)
    .eq('date', today)
    .single()

  if (existing) return { success: false, error: 'Already logged attendance today' }

  const { error } = await admin.from('attendance_logs').insert({
    company_id: ctx.companyId,
    user_id: ctx.userId,
    date: today,
    clock_in: new Date().toISOString(),
    work_type: workType,
    status: 'present',
  })

  if (error) return { success: false, error: error.message }
  revalidatePath('/member/dashboard')
  revalidatePath('/admin/attendance')
  return { success: true }
}

export async function markAbsent(): Promise<{ success: boolean; error?: string }> {
  const ctxResult = await getUserContext()
  if ('error' in ctxResult) return { success: false, error: ctxResult.error }
  const ctx = ctxResult

  const today = new Date().toISOString().split('T')[0]
  const admin = adminSupabase()

  const { data: existing } = await admin
    .from('attendance_logs')
    .select('id')
    .eq('company_id', ctx.companyId)
    .eq('user_id', ctx.userId)
    .eq('date', today)
    .single()

  if (existing) return { success: false, error: 'Already logged attendance today' }

  const { error } = await admin.from('attendance_logs').insert({
    company_id: ctx.companyId,
    user_id: ctx.userId,
    date: today,
    status: 'absent',
  })

  if (error) return { success: false, error: error.message }
  revalidatePath('/member/dashboard')
  revalidatePath('/admin/attendance')
  return { success: true }
}

export async function clockOut(): Promise<{ success: boolean; error?: string }> {
  const ctxResult = await getUserContext()
  if ('error' in ctxResult) return { success: false, error: ctxResult.error }
  const ctx = ctxResult

  const today = new Date().toISOString().split('T')[0]
  const admin = adminSupabase()

  const { error } = await admin
    .from('attendance_logs')
    .update({ clock_out: new Date().toISOString() })
    .eq('company_id', ctx.companyId)
    .eq('user_id', ctx.userId)
    .eq('date', today)
    .is('clock_out', null)

  if (error) return { success: false, error: error.message }
  revalidatePath('/member/dashboard')
  revalidatePath('/admin/attendance')
  return { success: true }
}
