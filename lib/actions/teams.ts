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

export type TeamScope = 'full_time' | 'freelance_login' | 'freelance_no_login'

export type TeamRow = {
  id: string
  name: string
  scope: TeamScope
  template_key: string
  color: string | null
  emoji: string | null
  is_active: boolean
  is_locked: boolean
}

export async function listTeams(scope?: TeamScope): Promise<TeamRow[]> {
  const companyId = await getCompanyId()
  if (!companyId) return []
  const admin = adminSupabase()
  let query = admin
    .from('teams')
    .select('id, name, scope, template_key, color, emoji, is_active, is_locked')
    .eq('company_id', companyId)
    .order('sort_order')
    .order('name')
  if (scope) query = query.eq('scope', scope)
  const { data } = await query
  return (data ?? []) as TeamRow[]
}

// Counts, keyed by team_id, so the Manage Teams screen can show "X members"
// and deleteTeam can tell a genuinely-empty team apart from one in use.
export async function getTeamMemberCounts(): Promise<Record<string, number>> {
  const companyId = await getCompanyId()
  if (!companyId) return {}
  const admin = adminSupabase()
  const [{ data: userRows }, { data: flRows }] = await Promise.all([
    admin.from('users').select('team_id').eq('company_id', companyId).not('team_id', 'is', null),
    admin.from('freelancers').select('team_id').eq('company_id', companyId).not('team_id', 'is', null),
  ])
  const counts: Record<string, number> = {}
  for (const row of [...(userRows ?? []), ...(flRows ?? [])] as { team_id: string }[]) {
    counts[row.team_id] = (counts[row.team_id] ?? 0) + 1
  }
  return counts
}

export async function addTeam(input: {
  name: string
  scope: TeamScope
  color?: string | null
  emoji?: string | null
  template_key?: string
}): Promise<{ success: boolean; error?: string; team?: TeamRow }> {
  const companyId = await getCompanyId()
  if (!companyId) return { success: false, error: 'Not authenticated' }

  const name = input.name.trim()
  if (!name) return { success: false, error: 'Team name is required' }

  const admin = adminSupabase()
  const { data: maxRow } = await admin
    .from('teams').select('sort_order').eq('company_id', companyId).order('sort_order', { ascending: false }).limit(1).maybeSingle()
  const nextSort = ((maxRow as { sort_order?: number } | null)?.sort_order ?? 0) + 1

  const { data, error } = await admin.from('teams').insert({
    company_id: companyId,
    name,
    scope: input.scope,
    template_key: input.template_key || 'generic',
    color: input.color || null,
    emoji: input.emoji || null,
    sort_order: nextSort,
  }).select('id, name, scope, template_key, color, emoji, is_active').single()

  if (error) {
    if (error.code === '23505') return { success: false, error: 'A team with this name already exists' }
    return { success: false, error: error.message }
  }

  revalidatePath('/admin/team')
  return { success: true, team: data as TeamRow }
}

export async function updateTeam(
  id: string,
  fields: { name?: string; color?: string | null; emoji?: string | null; template_key?: string }
): Promise<{ success: boolean; error?: string }> {
  const companyId = await getCompanyId()
  if (!companyId) return { success: false, error: 'Not authenticated' }
  if (fields.name != null && !fields.name.trim()) return { success: false, error: 'Team name is required' }

  const admin = adminSupabase()

  let oldName: string | null = null
  if (fields.name != null) {
    const { data: current } = await admin.from('teams').select('name, is_locked').eq('id', id).eq('company_id', companyId).single()
    const row = current as { name?: string; is_locked?: boolean } | null
    if (row?.is_locked && fields.name.trim() !== row.name) {
      return { success: false, error: 'This team\'s name is locked — other parts of the app still depend on it exactly as-is. Ask your developer before renaming it.' }
    }
    oldName = row?.name ?? null
  }

  const { error } = await admin
    .from('teams')
    .update({
      ...(fields.name != null ? { name: fields.name.trim() } : {}),
      ...(fields.color !== undefined ? { color: fields.color } : {}),
      ...(fields.emoji !== undefined ? { emoji: fields.emoji } : {}),
      ...(fields.template_key !== undefined ? { template_key: fields.template_key } : {}),
      updated_at: new Date().toISOString(),
    })
    .eq('id', id)
    .eq('company_id', companyId)

  if (error) {
    if (error.code === '23505') return { success: false, error: 'A team with this name already exists' }
    return { success: false, error: error.message }
  }

  // Keep the legacy text `team` columns on users/freelancers (still read by most
  // of the app — see 104_teams_positions_tables.sql) in sync with the rename.
  if (oldName && fields.name && oldName !== fields.name.trim()) {
    const newName = fields.name.trim()
    await admin.from('users').update({ team: newName }).eq('company_id', companyId).eq('team_id', id)
    await admin.from('freelancers').update({ team: newName }).eq('company_id', companyId).eq('team_id', id)
  }

  revalidatePath('/admin/team')
  return { success: true }
}

export async function toggleTeamActive(id: string, isActive: boolean): Promise<{ success: boolean; error?: string }> {
  const companyId = await getCompanyId()
  if (!companyId) return { success: false, error: 'Not authenticated' }

  const admin = adminSupabase()
  const { error } = await admin
    .from('teams')
    .update({ is_active: isActive, updated_at: new Date().toISOString() })
    .eq('id', id)
    .eq('company_id', companyId)

  if (error) return { success: false, error: error.message }
  revalidatePath('/admin/team')
  return { success: true }
}

export async function deleteTeam(id: string): Promise<{ success: boolean; error?: string }> {
  const companyId = await getCompanyId()
  if (!companyId) return { success: false, error: 'Not authenticated' }

  const admin = adminSupabase()

  const { data: current } = await admin.from('teams').select('is_locked').eq('id', id).eq('company_id', companyId).single()
  if ((current as { is_locked?: boolean } | null)?.is_locked) {
    return { success: false, error: 'This team is locked and can\'t be deleted — other parts of the app still depend on it existing.' }
  }

  const [{ count: userCount }, { count: flCount }] = await Promise.all([
    admin.from('users').select('id', { count: 'exact', head: true }).eq('company_id', companyId).eq('team_id', id),
    admin.from('freelancers').select('id', { count: 'exact', head: true }).eq('company_id', companyId).eq('team_id', id),
  ])
  if ((userCount ?? 0) > 0 || (flCount ?? 0) > 0) {
    return { success: false, error: 'This team has members on it — deactivate it instead, or move its members to another team first.' }
  }

  const { error } = await admin.from('teams').delete().eq('id', id).eq('company_id', companyId)
  if (error) return { success: false, error: error.message }

  revalidatePath('/admin/team')
  return { success: true }
}
