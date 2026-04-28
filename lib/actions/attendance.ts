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

async function getUserContext() {
  const supabase = await createServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return null
  const admin = adminSupabase()
  const { data } = await admin.from('users').select('company_id').eq('id', user.id).single()
  if (!data) return null
  return { userId: user.id, companyId: data.company_id as string }
}

export async function clockIn(): Promise<{ success: boolean; error?: string }> {
  const ctx = await getUserContext()
  if (!ctx) return { success: false, error: 'Not authenticated' }

  const today = new Date().toISOString().split('T')[0]
  const admin = adminSupabase()

  // Prevent double clock-in
  const { data: existing } = await admin
    .from('attendance_logs')
    .select('id')
    .eq('company_id', ctx.companyId)
    .eq('user_id', ctx.userId)
    .eq('date', today)
    .single()

  if (existing) return { success: false, error: 'Already clocked in today' }

  const { error } = await admin.from('attendance_logs').insert({
    company_id: ctx.companyId,
    user_id: ctx.userId,
    date: today,
    clock_in: new Date().toISOString(),
  })

  if (error) return { success: false, error: error.message }
  revalidatePath('/member/dashboard')
  revalidatePath('/admin/attendance')
  return { success: true }
}

export async function clockOut(): Promise<{ success: boolean; error?: string }> {
  const ctx = await getUserContext()
  if (!ctx) return { success: false, error: 'Not authenticated' }

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
