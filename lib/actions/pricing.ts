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

async function getAdminCompanyId() {
  const admin = adminSupabase()
  const supabase = await createServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return null
  const { data } = await admin
    .from('users')
    .select('company_id, role')
    .eq('id', user.id)
    .single()
  if (!data || data.role !== 'ADMIN') return null
  return { admin, companyId: data.company_id as string }
}

// ── Rate card ─────────────────────────────────────────────────────────────────

export async function upsertPricingRate(
  videoType: string,
  rate: number
): Promise<{ success: boolean; error?: string }> {
  const ctx = await getAdminCompanyId()
  if (!ctx) return { success: false, error: 'Unauthorized' }

  const { error } = await ctx.admin
    .from('pricing_rates')
    .upsert(
      { company_id: ctx.companyId, video_type: videoType.trim(), rate_per_video: rate },
      { onConflict: 'company_id,video_type' }
    )

  if (error) return { success: false, error: error.message }
  revalidatePath('/admin/expenses')
  return { success: true }
}

export async function deletePricingRate(
  videoType: string
): Promise<{ success: boolean; error?: string }> {
  const ctx = await getAdminCompanyId()
  if (!ctx) return { success: false, error: 'Unauthorized' }

  const { error } = await ctx.admin
    .from('pricing_rates')
    .delete()
    .eq('company_id', ctx.companyId)
    .eq('video_type', videoType)

  if (error) return { success: false, error: error.message }
  revalidatePath('/admin/expenses')
  return { success: true }
}

// ── Employee hourly rate ──────────────────────────────────────────────────────

export async function updateEmployeeRate(
  userId: string,
  hourlyRate: number | null
): Promise<{ success: boolean; error?: string }> {
  const ctx = await getAdminCompanyId()
  if (!ctx) return { success: false, error: 'Unauthorized' }

  const { error } = await ctx.admin
    .from('users')
    .update({ hourly_rate: hourlyRate })
    .eq('id', userId)
    .eq('company_id', ctx.companyId)

  if (error) return { success: false, error: error.message }
  revalidatePath('/admin/expenses')
  return { success: true }
}

// ── Per-video cost override ───────────────────────────────────────────────────

export async function upsertVideoCostOverride(
  videoUid: string,
  manualCost: number
): Promise<{ success: boolean; error?: string }> {
  const ctx = await getAdminCompanyId()
  if (!ctx) return { success: false, error: 'Unauthorized' }

  const { error } = await ctx.admin
    .from('video_cost_overrides')
    .upsert(
      { company_id: ctx.companyId, video_uid: videoUid, manual_cost: manualCost },
      { onConflict: 'company_id,video_uid' }
    )

  if (error) return { success: false, error: error.message }
  return { success: true }
}

export async function clearVideoCostOverride(
  videoUid: string
): Promise<{ success: boolean; error?: string }> {
  const ctx = await getAdminCompanyId()
  if (!ctx) return { success: false, error: 'Unauthorized' }

  const { error } = await ctx.admin
    .from('video_cost_overrides')
    .delete()
    .eq('company_id', ctx.companyId)
    .eq('video_uid', videoUid)

  if (error) return { success: false, error: error.message }
  return { success: true }
}
