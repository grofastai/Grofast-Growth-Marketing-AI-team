'use server'

import { createClient } from '@supabase/supabase-js'
import { revalidatePath } from 'next/cache'
import { createServerClient } from '@/lib/supabase/server'

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

export async function addClient(formData: FormData): Promise<{ success: boolean; error?: string }> {
  const companyId = await getCompanyId()
  if (!companyId) return { success: false, error: 'Not authenticated' }

  const name = (formData.get('name') as string)?.trim()
  if (!name) return { success: false, error: 'Client name is required' }

  const admin = adminSupabase()
  const { error } = await admin.from('clients').insert({
    company_id:   companyId,
    name,
    contact_name: (formData.get('contact_name') as string)?.trim() || null,
    industry:     (formData.get('industry') as string)?.trim()      || null,
    location:     (formData.get('location') as string)?.trim()       || null,
    service:      (formData.get('service') as string)?.trim()        || null,
    package_name: (formData.get('package_name') as string)?.trim()   || null,
    status:       (formData.get('status') as string) || 'active',
  })

  if (error) {
    if (error.code === '23505') return { success: false, error: 'A client with this name already exists' }
    return { success: false, error: error.message }
  }

  revalidatePath('/admin/clients')
  revalidatePath('/admin/update')
  revalidatePath('/member/update')
  revalidatePath('/member/clients')
  return { success: true }
}

export async function updateClientStatus(id: string, status: 'active' | 'past'): Promise<{ success: boolean; error?: string }> {
  const companyId = await getCompanyId()
  if (!companyId) return { success: false, error: 'Not authenticated' }

  const admin = adminSupabase()
  const { error } = await admin
    .from('clients')
    .update({ status, updated_at: new Date().toISOString() })
    .eq('id', id)
    .eq('company_id', companyId)

  if (error) return { success: false, error: error.message }

  revalidatePath('/admin/clients')
  revalidatePath('/admin/update')
  revalidatePath('/member/update')
  revalidatePath('/member/clients')
  return { success: true }
}

export async function deleteClient(id: string): Promise<{ success: boolean; error?: string }> {
  const companyId = await getCompanyId()
  if (!companyId) return { success: false, error: 'Not authenticated' }

  const admin = adminSupabase()
  const { error } = await admin
    .from('clients')
    .delete()
    .eq('id', id)
    .eq('company_id', companyId)

  if (error) return { success: false, error: error.message }

  revalidatePath('/admin/clients')
  revalidatePath('/admin/update')
  revalidatePath('/member/update')
  revalidatePath('/member/clients')
  return { success: true }
}

export async function syncSheetClientsToSupabase(
  companyId: string,
  activeClients: Array<{ name: string; contact_name?: string; industry?: string; location?: string; service?: string; package_name?: string }>,
  pastClients:   Array<{ name: string; contact_name?: string; industry?: string; location?: string; service?: string; package_name?: string }>,
): Promise<void> {
  if (!activeClients.length && !pastClients.length) return
  const admin = adminSupabase()

  const toRow = (c: typeof activeClients[0], status: string) => ({
    company_id:   companyId,
    name:         c.name,
    contact_name: c.contact_name || null,
    industry:     c.industry     || null,
    location:     c.location     || null,
    service:      c.service      || null,
    package_name: c.package_name || null,
    status,
    updated_at:   new Date().toISOString(),
  })

  const rows = [
    ...activeClients.map(c => toRow(c, 'active')),
    ...pastClients.map(c => toRow(c, 'past')),
  ]

  if (rows.length > 0) {
    await admin.from('clients').upsert(rows, {
      onConflict: 'company_id,name',
      ignoreDuplicates: false,
    })

    // Deactivate any DB-active clients that are no longer in the active sheet
    const activeNameSet = new Set(activeClients.map(c => c.name))
    const { data: dbActive } = await admin
      .from('clients')
      .select('name')
      .eq('company_id', companyId)
      .eq('status', 'active')
    const toDeactivate = (dbActive ?? [])
      .map((r: { name: string }) => r.name)
      .filter(n => !activeNameSet.has(n))
    if (toDeactivate.length > 0) {
      await admin
        .from('clients')
        .update({ status: 'past', updated_at: new Date().toISOString() })
        .eq('company_id', companyId)
        .in('name', toDeactivate)
    }

    revalidatePath('/member/update')
    revalidatePath('/member/clients')
    revalidatePath('/admin/clients')
  }
}

export async function updateClientMonthlyFee(
  name: string,
  fee: number | null,
): Promise<{ success: boolean; error?: string }> {
  const companyId = await getCompanyId()
  if (!companyId) return { success: false, error: 'Not authenticated' }

  const admin = adminSupabase()
  const { error } = await admin
    .from('clients')
    .update({ monthly_fee: fee, updated_at: new Date().toISOString() })
    .eq('company_id', companyId)
    .eq('name', name)

  if (error) return { success: false, error: error.message }

  revalidatePath('/admin/insights')
  return { success: true }
}
