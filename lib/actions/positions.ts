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

export type PositionRow = { id: string; name: string; is_active: boolean }

// Matches Postgres INITCAP (used to normalize the existing catalog) — first
// letter of each word capitalized, rest lowercase — so typing "SOCIAL MEDIA
// MANAGER" or "social media manager" both land on "Social Media Manager".
function toTitleCase(s: string): string {
  return s.toLowerCase().replace(/(^|[^a-zA-Z0-9])([a-zA-Z])/g, (_, sep, ch) => sep + ch.toUpperCase())
}

export async function listPositions(): Promise<PositionRow[]> {
  const companyId = await getCompanyId()
  if (!companyId) return []
  const admin = adminSupabase()
  const { data } = await admin
    .from('positions')
    .select('id, name, is_active')
    .eq('company_id', companyId)
    .order('sort_order')
    .order('name')
  return (data ?? []) as PositionRow[]
}

// Counts, keyed by position_id, for the Manage Positions screen and delete guard.
export async function getPositionAssignmentCounts(): Promise<Record<string, number>> {
  const companyId = await getCompanyId()
  if (!companyId) return {}
  const admin = adminSupabase()
  const [{ data: userPos }, { data: flPos }] = await Promise.all([
    admin.from('user_positions').select('position_id').eq('company_id', companyId),
    admin.from('freelancer_positions').select('position_id').eq('company_id', companyId),
  ])
  const counts: Record<string, number> = {}
  for (const row of [...(userPos ?? []), ...(flPos ?? [])] as { position_id: string }[]) {
    counts[row.position_id] = (counts[row.position_id] ?? 0) + 1
  }
  return counts
}

export async function addPosition(name: string): Promise<{ success: boolean; error?: string; position?: PositionRow }> {
  const companyId = await getCompanyId()
  if (!companyId) return { success: false, error: 'Not authenticated' }
  const trimmed = toTitleCase(name.trim())
  if (!trimmed) return { success: false, error: 'Position name is required' }

  const admin = adminSupabase()
  const { data: maxRow } = await admin
    .from('positions').select('sort_order').eq('company_id', companyId).order('sort_order', { ascending: false }).limit(1).maybeSingle()
  const nextSort = ((maxRow as { sort_order?: number } | null)?.sort_order ?? 0) + 1

  const { data, error } = await admin.from('positions')
    .insert({ company_id: companyId, name: trimmed, sort_order: nextSort })
    .select('id, name, is_active')
    .single()

  if (error) {
    if (error.code === '23505') return { success: false, error: 'This position already exists' }
    return { success: false, error: error.message }
  }

  revalidatePath('/admin/team')
  return { success: true, position: data as PositionRow }
}

export async function renamePosition(id: string, name: string): Promise<{ success: boolean; error?: string }> {
  const companyId = await getCompanyId()
  if (!companyId) return { success: false, error: 'Not authenticated' }
  const trimmed = toTitleCase(name.trim())
  if (!trimmed) return { success: false, error: 'Position name is required' }

  const admin = adminSupabase()
  const { error } = await admin.from('positions')
    .update({ name: trimmed })
    .eq('id', id)
    .eq('company_id', companyId)

  if (error) {
    if (error.code === '23505') return { success: false, error: 'This position already exists' }
    return { success: false, error: error.message }
  }

  // Refresh the denormalized display text on anyone currently holding this
  // position, so renaming it doesn't leave the old name stuck on their profile.
  const [{ data: holders }, { data: flHolders }] = await Promise.all([
    admin.from('user_positions').select('user_id').eq('position_id', id),
    admin.from('freelancer_positions').select('freelancer_id').eq('position_id', id),
  ])
  for (const row of (holders ?? []) as { user_id: string }[]) await refreshUserPositionText(admin, row.user_id)
  for (const row of (flHolders ?? []) as { freelancer_id: string }[]) await refreshFreelancerPositionText(admin, row.freelancer_id)

  revalidatePath('/admin/team')
  revalidatePath('/admin/profile')
  revalidatePath('/member/profile')
  return { success: true }
}

export async function togglePositionActive(id: string, isActive: boolean): Promise<{ success: boolean; error?: string }> {
  const companyId = await getCompanyId()
  if (!companyId) return { success: false, error: 'Not authenticated' }

  const admin = adminSupabase()
  const { error } = await admin.from('positions').update({ is_active: isActive }).eq('id', id).eq('company_id', companyId)
  if (error) return { success: false, error: error.message }

  revalidatePath('/admin/team')
  return { success: true }
}

export async function deletePosition(id: string): Promise<{ success: boolean; error?: string }> {
  const companyId = await getCompanyId()
  if (!companyId) return { success: false, error: 'Not authenticated' }

  const admin = adminSupabase()
  const [{ count: userCount }, { count: flCount }] = await Promise.all([
    admin.from('user_positions').select('id', { count: 'exact', head: true }).eq('company_id', companyId).eq('position_id', id),
    admin.from('freelancer_positions').select('id', { count: 'exact', head: true }).eq('company_id', companyId).eq('position_id', id),
  ])
  if ((userCount ?? 0) > 0 || (flCount ?? 0) > 0) {
    return { success: false, error: 'This position is assigned to people — remove it from them first, or deactivate it instead.' }
  }

  const { error } = await admin.from('positions').delete().eq('id', id).eq('company_id', companyId)
  if (error) return { success: false, error: error.message }

  revalidatePath('/admin/team')
  return { success: true }
}

async function positionNames(admin: ReturnType<typeof adminSupabase>, ids: string[]): Promise<string[]> {
  if (ids.length === 0) return []
  const { data } = await admin.from('positions').select('name').in('id', ids)
  return ((data ?? []) as { name: string }[]).map(r => r.name)
}

// Refreshes users.position — a denormalized display copy read by profile pages
// (admin/profile, member/profile) and the Team directory row — from whatever
// positions the join table says this person actually holds.
async function refreshUserPositionText(admin: ReturnType<typeof adminSupabase>, userId: string): Promise<void> {
  const { data } = await admin.from('user_positions').select('position_id').eq('user_id', userId)
  const names = await positionNames(admin, ((data ?? []) as { position_id: string }[]).map(r => r.position_id))
  await admin.from('users').update({ position: names.length ? names.join(', ') : null }).eq('id', userId)
}

async function refreshFreelancerPositionText(admin: ReturnType<typeof adminSupabase>, freelancerId: string): Promise<void> {
  const { data } = await admin.from('freelancer_positions').select('position_id').eq('freelancer_id', freelancerId)
  const names = await positionNames(admin, ((data ?? []) as { position_id: string }[]).map(r => r.position_id))
  await admin.from('freelancers').update({ position: names.length ? names.join(', ') : null }).eq('id', freelancerId)
}

// Replace-all: sets a user's full position list to exactly `positionIds`.
export async function setUserPositions(userId: string, positionIds: string[]): Promise<{ success: boolean; error?: string }> {
  const companyId = await getCompanyId()
  if (!companyId) return { success: false, error: 'Not authenticated' }

  const admin = adminSupabase()
  const { error: delError } = await admin.from('user_positions').delete().eq('user_id', userId)
  if (delError) return { success: false, error: delError.message }

  if (positionIds.length > 0) {
    const { error: insError } = await admin.from('user_positions').insert(
      positionIds.map(position_id => ({ company_id: companyId, user_id: userId, position_id }))
    )
    if (insError) return { success: false, error: insError.message }
  }

  const names = await positionNames(admin, positionIds)
  await admin.from('users').update({ position: names.length ? names.join(', ') : null }).eq('id', userId)

  revalidatePath('/admin/team')
  return { success: true }
}

export async function setFreelancerPositions(freelancerId: string, positionIds: string[]): Promise<{ success: boolean; error?: string }> {
  const companyId = await getCompanyId()
  if (!companyId) return { success: false, error: 'Not authenticated' }

  const admin = adminSupabase()
  const { error: delError } = await admin.from('freelancer_positions').delete().eq('freelancer_id', freelancerId)
  if (delError) return { success: false, error: delError.message }

  if (positionIds.length > 0) {
    const { error: insError } = await admin.from('freelancer_positions').insert(
      positionIds.map(position_id => ({ company_id: companyId, freelancer_id: freelancerId, position_id }))
    )
    if (insError) return { success: false, error: insError.message }
  }

  const names = await positionNames(admin, positionIds)
  await admin.from('freelancers').update({ position: names.length ? names.join(', ') : null }).eq('id', freelancerId)

  revalidatePath('/admin/team')
  return { success: true }
}

// Fetches the position IDs a user or freelancer currently holds, so the Edit
// Member sheet can pre-check the right boxes.
export async function getUserPositionIds(userId: string): Promise<string[]> {
  const admin = adminSupabase()
  const { data } = await admin.from('user_positions').select('position_id').eq('user_id', userId)
  return ((data ?? []) as { position_id: string }[]).map(r => r.position_id)
}

export async function getFreelancerPositionIds(freelancerId: string): Promise<string[]> {
  const admin = adminSupabase()
  const { data } = await admin.from('freelancer_positions').select('position_id').eq('freelancer_id', freelancerId)
  return ((data ?? []) as { position_id: string }[]).map(r => r.position_id)
}
