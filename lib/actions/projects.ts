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

async function getCompanyId(): Promise<string | null> {
  const supabase = await createServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return null
  const admin = adminSupabase()
  const { data } = await admin.from('users').select('company_id').eq('id', user.id).single()
  return data?.company_id ?? null
}

export async function createProject(input: {
  business_name: string
  client_name: string
  location: string
  service_types: string[]
  status: 'active' | 'completed' | 'on_hold'
  deadline: string | null
  progress_pct: number
}): Promise<{ success: boolean; error?: string }> {
  const company_id = await getCompanyId()
  if (!company_id) return { success: false, error: 'Not authenticated' }

  const admin = adminSupabase()
  const { error } = await admin.from('projects').insert({
    company_id,
    business_name: input.business_name,
    client_name: input.client_name,
    location: input.location || null,
    service_types: input.service_types,
    status: input.status,
    deadline: input.deadline || null,
    progress_pct: input.progress_pct,
  })

  if (error) return { success: false, error: error.message }
  revalidatePath('/admin/projects')
  revalidatePath('/admin/clients')
  return { success: true }
}

export async function updateProject(input: {
  id: string
  business_name: string
  client_name: string
  location: string
  service_types: string[]
  status: 'active' | 'completed' | 'on_hold'
  deadline: string | null
  progress_pct: number
}): Promise<{ success: boolean; error?: string }> {
  const company_id = await getCompanyId()
  if (!company_id) return { success: false, error: 'Not authenticated' }

  const admin = adminSupabase()
  const { error } = await admin.from('projects')
    .update({
      business_name: input.business_name,
      client_name: input.client_name,
      location: input.location || null,
      service_types: input.service_types,
      status: input.status,
      deadline: input.deadline || null,
      progress_pct: input.progress_pct,
    })
    .eq('id', input.id)
    .eq('company_id', company_id)

  if (error) return { success: false, error: error.message }
  revalidatePath('/admin/projects')
  revalidatePath('/admin/clients')
  return { success: true }
}

export async function deleteProject(id: string): Promise<{ success: boolean; error?: string }> {
  const company_id = await getCompanyId()
  if (!company_id) return { success: false, error: 'Not authenticated' }

  const admin = adminSupabase()
  const { error } = await admin.from('projects')
    .delete()
    .eq('id', id)
    .eq('company_id', company_id)

  if (error) return { success: false, error: error.message }
  revalidatePath('/admin/projects')
  return { success: true }
}
