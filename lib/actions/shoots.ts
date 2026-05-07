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

type ShootInput = {
  title: string
  client: string
  location: string
  start_time: string
  end_time: string
  team_assigned: string
  equipment_used: string
  travel_expense: number
}

async function getCompanyId(userId: string) {
  const admin = adminSupabase()
  const { data } = await admin.from('users').select('company_id').eq('id', userId).single()
  return data?.company_id as string | undefined
}

export async function createShoot(
  input: ShootInput
): Promise<{ success: boolean; error?: string }> {
  const supabase = await createServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { success: false, error: 'Not authenticated' }

  if (!input.title.trim())    return { success: false, error: 'Shoot title is required' }
  if (!input.client.trim())   return { success: false, error: 'Client is required' }
  if (!input.location.trim()) return { success: false, error: 'Location is required' }
  if (!input.start_time)      return { success: false, error: 'Start time is required' }
  if (!input.end_time)        return { success: false, error: 'End time is required' }
  if (input.start_time >= input.end_time) return { success: false, error: 'End time must be after start time' }

  const company_id = await getCompanyId(user.id)
  if (!company_id) return { success: false, error: 'Profile not found' }

  const admin = adminSupabase()
  const { error } = await admin.from('shoots').insert({
    company_id,
    title:          input.title.trim(),
    client:         input.client.trim(),
    location:       input.location.trim(),
    start_time:     input.start_time,
    end_time:       input.end_time,
    team_assigned:  input.team_assigned.trim() || null,
    equipment_used: input.equipment_used.trim() || null,
    travel_expense: input.travel_expense || 0,
    created_by:     user.id,
    status:         'scheduled',
  })

  if (error) return { success: false, error: error.message }

  revalidatePath('/admin/shoots')
  revalidatePath('/member/shoots')
  return { success: true }
}

export async function updateShootStatus(
  id: string,
  status: 'scheduled' | 'completed' | 'cancelled'
): Promise<{ success: boolean; error?: string }> {
  const supabase = await createServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { success: false, error: 'Not authenticated' }

  const admin = adminSupabase()
  const { error } = await admin.from('shoots').update({ status }).eq('id', id)
  if (error) return { success: false, error: error.message }

  revalidatePath('/admin/shoots')
  revalidatePath('/member/shoots')
  return { success: true }
}

export async function deleteShoot(id: string): Promise<{ success: boolean; error?: string }> {
  const supabase = await createServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { success: false, error: 'Not authenticated' }

  const admin = adminSupabase()
  const { error } = await admin.from('shoots').delete().eq('id', id)
  if (error) return { success: false, error: error.message }

  revalidatePath('/admin/shoots')
  revalidatePath('/member/shoots')
  return { success: true }
}
