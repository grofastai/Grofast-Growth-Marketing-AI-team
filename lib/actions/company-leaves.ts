'use server'

import { createClient } from '@supabase/supabase-js'
import { createServerClient } from '@/lib/supabase/server'
import { revalidatePath } from 'next/cache'

function adminSupabase() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  )
}

export async function addCompanyLeave(date: string, name: string): Promise<{ success: boolean; error?: string }> {
  const supabase = await createServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { success: false, error: 'Not authenticated' }

  const admin = adminSupabase()
  const { data: profile } = await admin.from('users').select('company_id, role').eq('id', user.id).single()
  if (!profile) return { success: false, error: 'Profile not found' }
  if (profile.role !== 'ADMIN') return { success: false, error: 'Not authorized' }

  const { error } = await admin.from('company_leaves').insert({
    company_id: profile.company_id,
    date,
    name: name.trim(),
    created_by: user.id,
  })
  if (error) return { success: false, error: error.message }

  revalidatePath('/admin/leaves')
  revalidatePath('/member/leaves')
  revalidatePath('/member/history')
  return { success: true }
}

export async function updateCompanyLeave(id: string, date: string, name: string): Promise<{ success: boolean; error?: string }> {
  const supabase = await createServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { success: false, error: 'Not authenticated' }

  const admin = adminSupabase()
  const { data: profile } = await admin.from('users').select('company_id, role').eq('id', user.id).single()
  if (!profile) return { success: false, error: 'Profile not found' }
  if (profile.role !== 'ADMIN') return { success: false, error: 'Not authorized' }

  const { error } = await admin.from('company_leaves').update({ date, name: name.trim() }).eq('id', id).eq('company_id', profile.company_id)
  if (error) return { success: false, error: error.message }

  revalidatePath('/admin/leaves')
  revalidatePath('/member/leaves')
  revalidatePath('/member/history')
  return { success: true }
}

export async function deleteCompanyLeave(id: string): Promise<{ success: boolean; error?: string }> {
  const supabase = await createServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { success: false, error: 'Not authenticated' }

  const admin = adminSupabase()
  const { data: profile } = await admin.from('users').select('company_id, role').eq('id', user.id).single()
  if (!profile) return { success: false, error: 'Profile not found' }
  if (profile.role !== 'ADMIN') return { success: false, error: 'Not authorized' }

  const { error } = await admin.from('company_leaves').delete().eq('id', id).eq('company_id', profile.company_id)
  if (error) return { success: false, error: error.message }

  revalidatePath('/admin/leaves')
  revalidatePath('/member/leaves')
  revalidatePath('/member/history')
  return { success: true }
}
