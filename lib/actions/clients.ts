'use server'

import { createClient } from '@supabase/supabase-js'
import { revalidatePath } from 'next/cache'
import { createServerClient } from '@/lib/supabase/server'
import { todayIST } from '@/lib/utils/ist-date'

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

export async function addClient(formData: FormData): Promise<{ success: boolean; error?: string; id?: string }> {
  const companyId = await getCompanyId()
  if (!companyId) return { success: false, error: 'Not authenticated' }

  const name = (formData.get('name') as string)?.trim()
  if (!name) return { success: false, error: 'Client name is required' }

  const admin = adminSupabase()
  const status = (formData.get('status') as string) || 'active'
  const isInternal = formData.get('is_internal') === 'true'
  const { data: inserted, error } = await admin.from('clients').insert({
    company_id:   companyId,
    name,
    contact_name: (formData.get('contact_name') as string)?.trim() || null,
    industry:     (formData.get('industry') as string)?.trim()      || null,
    location:     (formData.get('location') as string)?.trim()       || null,
    package_name: (formData.get('package_name') as string)?.trim()   || null,
    period:       (formData.get('period') as string)?.trim()         || null,
    phone:        (formData.get('phone') as string)?.trim()          || null,
    email:        (formData.get('email') as string)?.trim()          || null,
    is_internal:  isInternal,
    status,
  }).select('id').single()

  if (error) {
    if (error.code === '23505') return { success: false, error: 'A client with this name already exists' }
    return { success: false, error: error.message }
  }

  // A brand-new client's status has never had a prior value to compare against, so
  // updateClientStatus's "only log if changing" guard would never fire for it — record
  // its starting status directly, so month-based history is complete from day one.
  if (inserted?.id) {
    await admin.from('client_status_history').insert({
      company_id: companyId, client_id: inserted.id, status, effective_from: todayIST(),
    })
  }

  revalidatePath('/admin/clients')
  revalidatePath('/admin/expenses')
  revalidatePath('/admin/update')
  revalidatePath('/member/update')
  revalidatePath('/member/clients')
  return { success: true, id: inserted?.id }
}

// Admin-managed list of service offerings (Meta Ads, Video Editing, etc.) — kept in
// the DB, not hardcoded, so admins can add new ones directly from the client form.
export async function listServiceOptions(): Promise<{ id: string; name: string }[]> {
  const companyId = await getCompanyId()
  if (!companyId) return []
  const admin = adminSupabase()
  const { data } = await admin.from('service_options').select('id, name').eq('company_id', companyId).order('name')
  return data ?? []
}

export async function addServiceOption(name: string): Promise<{ success: boolean; error?: string; option?: { id: string; name: string } }> {
  const companyId = await getCompanyId()
  if (!companyId) return { success: false, error: 'Not authenticated' }
  const trimmed = name.trim().toUpperCase()
  if (!trimmed) return { success: false, error: 'Service name is required' }

  const admin = adminSupabase()
  const { data, error } = await admin.from('service_options')
    .insert({ company_id: companyId, name: trimmed })
    .select('id, name')
    .single()

  if (error) {
    if (error.code === '23505') return { success: false, error: 'This service already exists' }
    return { success: false, error: error.message }
  }

  revalidatePath('/admin/clients')
  return { success: true, option: data }
}

export async function renameServiceOption(id: string, name: string): Promise<{ success: boolean; error?: string }> {
  const companyId = await getCompanyId()
  if (!companyId) return { success: false, error: 'Not authenticated' }
  const trimmed = name.trim().toUpperCase()
  if (!trimmed) return { success: false, error: 'Service name is required' }

  const admin = adminSupabase()
  const { error } = await admin.from('service_options')
    .update({ name: trimmed })
    .eq('id', id)
    .eq('company_id', companyId)

  if (error) {
    if (error.code === '23505') return { success: false, error: 'This service already exists' }
    return { success: false, error: error.message }
  }

  revalidatePath('/admin/clients')
  return { success: true }
}

// Cascades to client_services (FK on delete cascade) — removing a service option
// automatically un-selects it from every client that had it.
export async function deleteServiceOption(id: string): Promise<{ success: boolean; error?: string }> {
  const companyId = await getCompanyId()
  if (!companyId) return { success: false, error: 'Not authenticated' }

  const admin = adminSupabase()
  const { error } = await admin.from('service_options').delete().eq('id', id).eq('company_id', companyId)
  if (error) return { success: false, error: error.message }

  revalidatePath('/admin/clients')
  return { success: true }
}

// Replaces a client's full set of selected services with the given list.
export async function setClientServices(clientId: string, serviceOptionIds: string[]): Promise<{ success: boolean; error?: string }> {
  const companyId = await getCompanyId()
  if (!companyId) return { success: false, error: 'Not authenticated' }

  const admin = adminSupabase()
  const { error: delError } = await admin.from('client_services').delete().eq('client_id', clientId).eq('company_id', companyId)
  if (delError) return { success: false, error: delError.message }

  if (serviceOptionIds.length > 0) {
    const { error: insError } = await admin.from('client_services').insert(
      serviceOptionIds.map(id => ({ company_id: companyId, client_id: clientId, service_option_id: id }))
    )
    if (insError) return { success: false, error: insError.message }
  }

  revalidatePath('/admin/clients')
  return { success: true }
}

// A client's name is copied as plain text into every historical record that ever
// referenced it (daily_updates.work_entries, client_expenses, freelancer work,
// projects/tasks, collaboration snapshots, content tracker, shoots) — none of those
// are linked by client_id, they're just strings written down at submission time.
// Renaming a client without rewriting all of those would silently orphan every past
// entry: cost/hours calculations match by exact (case-insensitive) name, so the old
// name's history would stop counting toward the renamed client, and a member typing
// today would only ever see the new name in their picker with no way to find the old
// one. This walks every known table and relabels old name -> new name in place.
async function cascadeClientRename(
  admin: ReturnType<typeof adminSupabase>,
  companyId: string,
  oldName: string,
  newName: string
): Promise<void> {
  const oldTrim = oldName.trim()
  if (!oldTrim || oldTrim.toLowerCase() === newName.trim().toLowerCase()) return

  // Plain text columns — case-insensitive exact match, straightforward rename.
  const plainTextTargets: [string, string][] = [
    ['client_expenses', 'client_name'],
    ['freelancer_work_entries_v2', 'client_name'],
    ['projects', 'client_name'],
    ['projects', 'business_name'],
    ['content_items', 'client_name'],
    ['ads_tracker', 'client_name'],
    ['shoots', 'client'],
    ['work_logs', 'client_name'],
    ['content_posts', 'client_name'],
  ]
  for (const [table, column] of plainTextTargets) {
    await admin.from(table).update({ [column]: newName }).eq('company_id', companyId).ilike(column, oldTrim)
  }

  // tasks.description — a task created directly against a client (not via a
  // project) gets "Client: <name>" prefixed onto its description as plain text.
  // Only the prefix is rewritten; the rest of the description is left untouched.
  const clientPrefix = `Client: ${oldTrim}`
  const { data: taskRows } = await admin
    .from('tasks')
    .select('id, description')
    .eq('company_id', companyId)
    .ilike('description', `${clientPrefix}%`)
  for (const row of (taskRows ?? []) as { id: string; description: string | null }[]) {
    if (!row.description || !row.description.toLowerCase().startsWith(clientPrefix.toLowerCase())) continue
    const rest = row.description.slice(clientPrefix.length)
    await admin.from('tasks').update({ description: `Client: ${newName}${rest}` }).eq('id', row.id)
  }

  // daily_updates.work_entries — JSONB array, each entry may hold a single
  // client_name or (for collaboration entries) a client_names array.
  // No DB-side text pre-filter here: PostgREST can't ilike a jsonb column even with
  // a `column::text` cast in the filter name (errors "operator does not exist: jsonb
  // ~~* unknown" and silently returns no rows) — fetch every row for the company and
  // filter in JS instead, or renamed clients quietly lose all their Daily Update history.
  const { data: duRows } = await admin
    .from('daily_updates')
    .select('id, work_entries')
    .eq('company_id', companyId)

  for (const row of (duRows ?? []) as { id: string; work_entries: Record<string, unknown>[] | null }[]) {
    if (!Array.isArray(row.work_entries)) continue
    let changed = false
    const updated = row.work_entries.map(e => {
      const next = { ...e }
      if (typeof next.client_name === 'string' && next.client_name.trim().toLowerCase() === oldTrim.toLowerCase()) {
        next.client_name = newName
        changed = true
      }
      if (Array.isArray(next.client_names)) {
        const names = next.client_names as string[]
        if (names.some(n => n.trim().toLowerCase() === oldTrim.toLowerCase())) {
          next.client_names = names.map(n => n.trim().toLowerCase() === oldTrim.toLowerCase() ? newName : n)
          changed = true
        }
      }
      return next
    })
    if (changed) await admin.from('daily_updates').update({ work_entries: updated }).eq('id', row.id)
  }

  // collaboration_confirmations.entry_snapshot — JSONB object, one client_name each.
  // Same PostgREST jsonb-cast limitation as above — fetch and filter in JS.
  const { data: collabRows } = await admin
    .from('collaboration_confirmations')
    .select('id, entry_snapshot')
    .eq('company_id', companyId)

  for (const row of (collabRows ?? []) as { id: string; entry_snapshot: Record<string, unknown> | null }[]) {
    const snap = row.entry_snapshot
    if (!snap || typeof snap.client_name !== 'string') continue
    if (snap.client_name.trim().toLowerCase() !== oldTrim.toLowerCase()) continue
    await admin.from('collaboration_confirmations')
      .update({ entry_snapshot: { ...snap, client_name: newName } })
      .eq('id', row.id)
  }
}

export async function updateClientDetails(
  id: string,
  fields: {
    name?: string; contact_name?: string | null; industry?: string | null; location?: string | null
    package_name?: string | null; period?: string | null
    phone?: string | null; email?: string | null; is_internal?: boolean
  }
): Promise<{ success: boolean; error?: string }> {
  const companyId = await getCompanyId()
  if (!companyId) return { success: false, error: 'Not authenticated' }
  if (fields.name != null && !fields.name.trim()) return { success: false, error: 'Client name is required' }

  const admin = adminSupabase()

  let oldName: string | null = null
  if (fields.name != null) {
    const { data: current } = await admin.from('clients').select('name').eq('id', id).eq('company_id', companyId).single()
    oldName = (current as { name?: string } | null)?.name ?? null
  }

  const { error } = await admin
    .from('clients')
    .update({ ...fields, updated_at: new Date().toISOString() })
    .eq('id', id)
    .eq('company_id', companyId)

  if (error) {
    if (error.code === '23505') return { success: false, error: 'A client with this name already exists' }
    return { success: false, error: error.message }
  }

  if (oldName && fields.name && oldName.trim().toLowerCase() !== fields.name.trim().toLowerCase()) {
    await cascadeClientRename(admin, companyId, oldName, fields.name.trim())
  }

  revalidatePath('/admin/clients')
  revalidatePath('/admin/expenses')
  revalidatePath('/admin/activities')
  revalidatePath('/admin/goals')
  revalidatePath('/admin/projects')
  revalidatePath('/admin/insights')
  revalidatePath('/admin/freelancers')
  revalidatePath('/admin/shoots')
  revalidatePath('/admin/media-tracker')
  revalidatePath('/member/update')
  revalidatePath('/member/clients')
  revalidatePath('/member/history')
  revalidatePath('/member/tasks')
  revalidatePath('/member/shoots')
  revalidatePath('/freelancer/update')
  revalidatePath('/freelancer/activities')
  return { success: true }
}

// Explicit per-client, per-month decision on whether a client shares that month's
// common/overhead cost — deliberately admin-controlled, never inferred from dates or
// status. See client_common_expense_participation migration for the full reasoning.
export async function setCommonExpenseParticipation(
  clientId: string,
  month: string,
  included: boolean
): Promise<{ success: boolean; error?: string }> {
  const companyId = await getCompanyId()
  if (!companyId) return { success: false, error: 'Not authenticated' }

  const admin = adminSupabase()
  const { error } = await admin
    .from('client_common_expense_participation')
    .upsert(
      { company_id: companyId, client_id: clientId, month, included, updated_at: new Date().toISOString() },
      { onConflict: 'client_id,month' }
    )

  if (error) return { success: false, error: error.message }

  revalidatePath('/admin/expenses')
  return { success: true }
}

export async function updateClientStatus(id: string, status: 'active' | 'past'): Promise<{ success: boolean; error?: string }> {
  const companyId = await getCompanyId()
  if (!companyId) return { success: false, error: 'Not authenticated' }

  const admin = adminSupabase()

  // If status is actually changing, log it to client_status_history before
  // updating — so reports for past months keep showing what the client's
  // status actually was back then, not today's status.
  const { data: currentClient } = await admin.from('clients').select('status').eq('id', id).single()
  const oldStatus = (currentClient as { status?: string } | null)?.status
  if (oldStatus != null && oldStatus !== status) {
    const effectiveFrom = todayIST()
    const { data: existing } = await admin
      .from('client_status_history')
      .select('id')
      .eq('client_id', id)
      .eq('effective_from', effectiveFrom)
      .maybeSingle()
    if (existing) {
      await admin.from('client_status_history').update({ status }).eq('id', (existing as { id: string }).id)
    } else {
      await admin.from('client_status_history').insert({
        company_id: companyId, client_id: id, status, effective_from: effectiveFrom,
      })
    }
  }

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

  const { data: clientRow } = await admin.from('clients').select('name').eq('id', id).eq('company_id', companyId).single()
  if (!clientRow) return { success: false, error: 'Client not found' }
  const clientName = (clientRow as { name: string }).name.toLowerCase().trim()

  // A client's logged work lives in daily_updates.work_entries as a plain text name,
  // not a link to this row — deleting the client row would never touch that history,
  // but it WOULD make it silently disappear from every cost report and the Clients
  // page (nothing loops over a client that no longer exists here). Real history must
  // never be deletable by accident — force "Past" status instead, which is reversible
  // and keeps everything visible. Only a genuinely unused client (typo, duplicate,
  // never had any real work logged) can actually be deleted.
  const [{ data: updatesRaw }, { data: directExpense }, { data: freelancerWork }] = await Promise.all([
    admin.from('daily_updates').select('work_entries').eq('company_id', companyId),
    admin.from('client_expenses').select('id').eq('company_id', companyId).ilike('client_name', clientName).limit(1),
    admin.from('freelancer_work_entries_v2').select('id').eq('company_id', companyId).ilike('client_name', clientName).limit(1),
  ])
  const hasLoggedWork = ((updatesRaw ?? []) as { work_entries: { client_name?: string }[] | null }[]).some(
    u => (u.work_entries ?? []).some(e => (e.client_name ?? '').toLowerCase().trim() === clientName)
  )
  if (hasLoggedWork || (directExpense?.length ?? 0) > 0 || (freelancerWork?.length ?? 0) > 0) {
    return {
      success: false,
      error: `"${(clientRow as { name: string }).name}" has real logged work or expenses on file — it can't be deleted. Switch them to "Past" instead, which keeps their history intact and reversible.`,
    }
  }

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
