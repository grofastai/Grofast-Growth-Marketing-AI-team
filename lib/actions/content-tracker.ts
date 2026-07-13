'use server'

import { createServerClient } from '@/lib/supabase/server'
import { createClient } from '@supabase/supabase-js'
import { revalidatePath } from 'next/cache'
import {
  createContentItemSchema, updateContentItemSchema, addContentPostSchema, createAdSchema, addAdRevisionSchema, addAdPerformanceEntrySchema,
  type CreateContentItemInput, type UpdateContentItemInput, type AddContentPostInput, type CreateAdInput, type AddAdRevisionInput, type AddAdPerformanceEntryInput,
} from '@/lib/validations/content-tracker'

function adminSupabase() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  )
}

function revalidateTracker() {
  revalidatePath('/admin/content-tracker')
  revalidatePath('/member/content-tracker')
}

async function currentUser() {
  const supabase = await createServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return null
  const admin = adminSupabase()
  const { data: profile } = await admin.from('users').select('company_id, role').eq('id', user.id).single()
  if (!profile?.company_id) return null
  return { id: user.id, companyId: profile.company_id as string, role: profile.role as string, admin }
}

// ── Content Items (Shot -> Editing -> Edited -> Posted) ─────────────────────

export async function createContentItem(input: CreateContentItemInput): Promise<{ success: boolean; error?: string; id?: string }> {
  const parsed = createContentItemSchema.safeParse(input)
  if (!parsed.success) return { success: false, error: parsed.error.issues[0].message }

  const ctx = await currentUser()
  if (!ctx) return { success: false, error: 'Not authenticated' }

  const isBackfillPosted = !!(parsed.data.posted_platforms && parsed.data.posted_platforms.length > 0)
  const today = new Date().toISOString().split('T')[0]
  const shotDate = parsed.data.shot_date || today

  const { data, error } = await ctx.admin.from('content_items').insert({
    company_id:   ctx.companyId,
    client_name:  parsed.data.client_name,
    title:        parsed.data.title,
    content_type: parsed.data.content_type,
    status:       isBackfillPosted ? 'posted' : 'shot',
    shot_by:      ctx.id,
    shot_date:    shotDate,
    edited_by:    isBackfillPosted ? ctx.id : null,
    edited_date:  isBackfillPosted ? (parsed.data.posted_date || today) : null,
    notes:        parsed.data.notes || null,
    created_by:   ctx.id,
  }).select('id').single()
  if (error) return { success: false, error: error.message }

  if (isBackfillPosted) {
    const postedDate = parsed.data.posted_date || today
    const rows = parsed.data.posted_platforms!.map(platform => ({
      content_item_id: data.id, company_id: ctx.companyId, platform, posted_date: postedDate, posted_by: ctx.id,
    }))
    const { error: postsError } = await ctx.admin.from('content_item_posts').insert(rows)
    if (postsError) return { success: false, error: postsError.message }
  }

  revalidateTracker()
  return { success: true, id: data.id }
}

export async function updateContentItem(id: string, input: UpdateContentItemInput): Promise<{ success: boolean; error?: string }> {
  const parsed = updateContentItemSchema.safeParse(input)
  if (!parsed.success) return { success: false, error: parsed.error.issues[0].message }

  const ctx = await currentUser()
  if (!ctx) return { success: false, error: 'Not authenticated' }

  const { error } = await ctx.admin.from('content_items').update({
    client_name:  parsed.data.client_name,
    title:        parsed.data.title,
    content_type: parsed.data.content_type,
    shot_date:    parsed.data.shot_date || null,
    notes:        parsed.data.notes || null,
    updated_at:   new Date().toISOString(),
  }).eq('id', id).eq('company_id', ctx.companyId)
  if (error) return { success: false, error: error.message }

  revalidateTracker()
  return { success: true }
}

export async function updateContentItemStatus(
  id: string,
  status: 'shot' | 'editing' | 'edited' | 'posted',
  editorId?: string
): Promise<{ success: boolean; error?: string }> {
  const ctx = await currentUser()
  if (!ctx) return { success: false, error: 'Not authenticated' }

  const updates: Record<string, unknown> = { status, updated_at: new Date().toISOString() }

  // Moving to Editing is where the editor is recorded — that's the accountability
  // moment ("who is starting this?"), so edited_by is set here, not on completion.
  if (status === 'editing' && editorId) {
    updates.edited_by = editorId
  }

  if (status === 'edited') {
    updates.edited_date = new Date().toISOString().split('T')[0]
    // Don't clobber the editor picked when it entered Editing. Only fall back to the
    // current user if it somehow skipped that step and has no editor recorded.
    const { data: existing } = await ctx.admin
      .from('content_items').select('edited_by').eq('id', id).eq('company_id', ctx.companyId).single()
    if (!existing?.edited_by) updates.edited_by = ctx.id
  }

  const { error } = await ctx.admin.from('content_items').update(updates).eq('id', id).eq('company_id', ctx.companyId)
  if (error) return { success: false, error: error.message }

  revalidateTracker()
  return { success: true }
}

export async function deleteContentItem(id: string): Promise<{ success: boolean; error?: string }> {
  const ctx = await currentUser()
  if (!ctx) return { success: false, error: 'Not authenticated' }

  const { error } = await ctx.admin.from('content_items').delete().eq('id', id).eq('company_id', ctx.companyId)
  if (error) return { success: false, error: error.message }

  revalidateTracker()
  return { success: true }
}

// ── Content Posts (per-platform publishing log) ─────────────────────────────

export async function addContentPost(input: AddContentPostInput): Promise<{ success: boolean; error?: string; id?: string }> {
  const parsed = addContentPostSchema.safeParse(input)
  if (!parsed.success) return { success: false, error: parsed.error.issues[0].message }

  const ctx = await currentUser()
  if (!ctx) return { success: false, error: 'Not authenticated' }

  const { data, error } = await ctx.admin.from('content_item_posts').insert({
    content_item_id: parsed.data.content_item_id,
    company_id:      ctx.companyId,
    platform:        parsed.data.platform,
    posted_date:     parsed.data.posted_date,
    post_link:       parsed.data.post_link || null,
    posted_by:       ctx.id,
  }).select('id').single()
  if (error) return { success: false, error: error.message }

  // Posting to any platform marks the content item as posted.
  await ctx.admin.from('content_items')
    .update({ status: 'posted', updated_at: new Date().toISOString() })
    .eq('id', parsed.data.content_item_id)
    .eq('company_id', ctx.companyId)

  revalidateTracker()
  return { success: true, id: data.id }
}

export async function deleteContentPost(id: string, contentItemId: string): Promise<{ success: boolean; error?: string }> {
  const ctx = await currentUser()
  if (!ctx) return { success: false, error: 'Not authenticated' }

  const { error } = await ctx.admin.from('content_item_posts').delete().eq('id', id).eq('company_id', ctx.companyId)
  if (error) return { success: false, error: error.message }

  // If that was the last platform post for this item, drop it back to "edited"
  // rather than leaving it marked posted with nothing to show for it.
  const { count } = await ctx.admin.from('content_item_posts')
    .select('id', { count: 'exact', head: true })
    .eq('content_item_id', contentItemId)
  if (!count) {
    await ctx.admin.from('content_items')
      .update({ status: 'edited', updated_at: new Date().toISOString() })
      .eq('id', contentItemId)
      .eq('company_id', ctx.companyId)
  }

  revalidateTracker()
  return { success: true }
}

// ── Ads Tracker ──────────────────────────────────────────────────────────────

export async function createAd(input: CreateAdInput): Promise<{ success: boolean; error?: string; id?: string }> {
  const parsed = createAdSchema.safeParse(input)
  if (!parsed.success) return { success: false, error: parsed.error.issues[0].message }

  const ctx = await currentUser()
  if (!ctx) return { success: false, error: 'Not authenticated' }

  const { data, error } = await ctx.admin.from('ads_tracker').insert({
    company_id:      ctx.companyId,
    client_name:     parsed.data.client_name,
    ad_name:         parsed.data.ad_name,
    platform:        parsed.data.platform,
    launch_date:     parsed.data.launch_date || null,
    hook_count:      parsed.data.hook_count,
    targeting_type:  parsed.data.targeting_type || null,
    targeting_notes: parsed.data.targeting_notes || null,
    status:          'active',
    created_by:      ctx.id,
  }).select('id').single()
  if (error) return { success: false, error: error.message }

  revalidateTracker()
  return { success: true, id: data.id }
}

export async function updateAdStatus(
  id: string,
  status: 'active' | 'paused' | 'testing' | 'stopped'
): Promise<{ success: boolean; error?: string }> {
  const ctx = await currentUser()
  if (!ctx) return { success: false, error: 'Not authenticated' }

  const { error } = await ctx.admin.from('ads_tracker')
    .update({ status, updated_at: new Date().toISOString() })
    .eq('id', id).eq('company_id', ctx.companyId)
  if (error) return { success: false, error: error.message }

  revalidateTracker()
  return { success: true }
}

export async function deleteAd(id: string): Promise<{ success: boolean; error?: string }> {
  const ctx = await currentUser()
  if (!ctx) return { success: false, error: 'Not authenticated' }

  const { error } = await ctx.admin.from('ads_tracker').delete().eq('id', id).eq('company_id', ctx.companyId)
  if (error) return { success: false, error: error.message }

  revalidateTracker()
  return { success: true }
}

export async function addAdRevision(input: AddAdRevisionInput): Promise<{ success: boolean; error?: string; id?: string }> {
  const parsed = addAdRevisionSchema.safeParse(input)
  if (!parsed.success) return { success: false, error: parsed.error.issues[0].message }

  const ctx = await currentUser()
  if (!ctx) return { success: false, error: 'Not authenticated' }

  const { data, error } = await ctx.admin.from('ad_revisions').insert({
    ad_id:                parsed.data.ad_id,
    company_id:           ctx.companyId,
    notes:                parsed.data.notes,
    hook_count_after:     parsed.data.hook_count_after ?? null,
    targeting_type_after: parsed.data.targeting_type_after || null,
    created_by:           ctx.id,
  }).select('id').single()
  if (error) return { success: false, error: error.message }

  // Keep the ad's "current state" fields in sync with its latest revision.
  const adUpdates: Record<string, unknown> = { updated_at: new Date().toISOString() }
  if (parsed.data.hook_count_after !== undefined) adUpdates.hook_count = parsed.data.hook_count_after
  if (parsed.data.targeting_type_after) adUpdates.targeting_type = parsed.data.targeting_type_after
  await ctx.admin.from('ads_tracker').update(adUpdates).eq('id', parsed.data.ad_id).eq('company_id', ctx.companyId)

  revalidateTracker()
  return { success: true, id: data.id }
}

export async function addAdPerformanceEntry(input: AddAdPerformanceEntryInput): Promise<{ success: boolean; error?: string; id?: string }> {
  const parsed = addAdPerformanceEntrySchema.safeParse(input)
  if (!parsed.success) return { success: false, error: parsed.error.issues[0].message }

  const ctx = await currentUser()
  if (!ctx) return { success: false, error: 'Not authenticated' }

  const { data, error } = await ctx.admin.from('ad_performance_entries').insert({
    ad_id:       parsed.data.ad_id,
    company_id:  ctx.companyId,
    entry_date:  parsed.data.entry_date,
    spend:       parsed.data.spend,
    impressions: parsed.data.impressions,
    reach:       parsed.data.reach,
    clicks:      parsed.data.clicks,
    ctr:         parsed.data.ctr,
    results:     parsed.data.results,
    note:        parsed.data.note || null,
    created_by:  ctx.id,
  }).select('id').single()
  if (error) return { success: false, error: error.message }

  revalidateTracker()
  return { success: true, id: data.id }
}
