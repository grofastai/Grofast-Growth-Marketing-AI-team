'use server'

import { createClient } from '@supabase/supabase-js'
import { fetchSheetClients } from '@/lib/google/sheets'
import { revalidatePath } from 'next/cache'

function adminSupabase() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  )
}

export async function syncClientsNow(): Promise<{ success: boolean; active?: number; past?: number; error?: string }> {
  const sheetId  = process.env.GOOGLE_CLIENTS_SHEET_ID
  const activeGid = process.env.GOOGLE_CLIENTS_SHEET_GID
  const pastGid   = process.env.GOOGLE_PAST_CLIENTS_SHEET_GID

  if (!sheetId) return { success: false, error: 'Sheet not configured' }

  try {
    const admin = adminSupabase()

    const [rawActive, rawPast] = await Promise.all([
      fetchSheetClients(sheetId, activeGid).catch(() => []),
      pastGid ? fetchSheetClients(sheetId, pastGid).catch(() => []) : Promise.resolve([]),
    ])

    const toRow = (c: (typeof rawActive)[0], status: 'active' | 'past') => ({
      name:         (c.company_name || c.customer_name).trim(),
      contact_name: c.customer_name.trim() || null,
      industry:     c.industry     || null,
      location:     c.place        || null,
      service:      c.service      || null,
      package_name: c.package_name || null,
      status,
      updated_at:   new Date().toISOString(),
    })

    const activeRows = rawActive
      .filter(c => (c.company_name || c.customer_name).trim())
      .map(c => toRow(c, 'active'))

    const pastRows = rawPast
      .filter(c => (c.company_name || c.customer_name).trim())
      .map(c => toRow(c, 'past'))

    if (!activeRows.length && !pastRows.length) {
      return { success: false, error: 'No clients found in sheet' }
    }

    const { data: companies } = await admin.from('companies').select('id')
    if (!companies?.length) return { success: false, error: 'No companies found' }

    for (const company of companies) {
      const rows = [
        ...activeRows.map(r => ({ ...r, company_id: company.id })),
        ...pastRows.map(r => ({ ...r, company_id: company.id })),
      ]
      await admin.from('clients').upsert(rows, { onConflict: 'company_id,name', ignoreDuplicates: false })
    }

    revalidatePath('/admin/goals')
    revalidatePath('/admin/projects')
    revalidatePath('/member/update')

    return { success: true, active: activeRows.length, past: pastRows.length }
  } catch (e: unknown) {
    return { success: false, error: e instanceof Error ? e.message : 'Unknown error' }
  }
}
