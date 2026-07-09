import { createClient } from '@supabase/supabase-js'
import type { ContentItem, Ad } from '@/components/content-tracker/content-tracker-client'

function adminSupabase() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  )
}

// Shared by both /admin/content-tracker and /member/content-tracker — the data
// is company-wide (everyone sees what everyone else logged), so there is no
// role-specific filtering to do here.
export async function getContentTrackerData(companyId: string): Promise<{ items: ContentItem[]; ads: Ad[] }> {
  const admin = adminSupabase()

  const [itemsRes, postsRes, usersRes, adsRes, revisionsRes] = await Promise.all([
    admin.from('content_items').select('*').eq('company_id', companyId).order('created_at', { ascending: false }),
    admin.from('content_item_posts').select('*').eq('company_id', companyId).order('posted_date', { ascending: false }),
    admin.from('users').select('id, name').eq('company_id', companyId),
    admin.from('ads_tracker').select('*').eq('company_id', companyId).order('created_at', { ascending: false }),
    admin.from('ad_revisions').select('*').eq('company_id', companyId).order('revision_date', { ascending: false }),
  ])

  type ItemRow = { id: string; client_name: string; title: string; content_type: 'video' | 'poster'; status: 'shot' | 'editing' | 'edited' | 'posted'; shot_by: string | null; shot_date: string | null; edited_by: string | null; edited_date: string | null; notes: string | null; created_at: string }
  type PostRow = { id: string; content_item_id: string; platform: 'instagram' | 'youtube' | 'facebook' | 'linkedin' | 'gmb'; posted_date: string; posted_by: string | null; post_link: string | null }
  type UserRow = { id: string; name: string }
  type AdRow = { id: string; client_name: string; ad_name: string; platform: string; launch_date: string | null; hook_count: number; targeting_type: 'broad' | 'interest' | 'lookalike' | 'retargeting' | null; targeting_notes: string | null; status: 'active' | 'paused' | 'testing' | 'stopped'; created_at: string }
  type RevisionRow = { id: string; ad_id: string; revision_date: string; notes: string; hook_count_after: number | null; targeting_type_after: 'broad' | 'interest' | 'lookalike' | 'retargeting' | null }

  const itemRows = (itemsRes.data ?? []) as ItemRow[]
  const postRows = (postsRes.data ?? []) as PostRow[]
  const userRows = (usersRes.data ?? []) as UserRow[]
  const adRows = (adsRes.data ?? []) as AdRow[]
  const revisionRows = (revisionsRes.data ?? []) as RevisionRow[]

  const userMap = new Map(userRows.map(u => [u.id, u]))
  const postsByItem = new Map<string, PostRow[]>()
  for (const p of postRows) {
    if (!postsByItem.has(p.content_item_id)) postsByItem.set(p.content_item_id, [])
    postsByItem.get(p.content_item_id)!.push(p)
  }
  const revisionsByAd = new Map<string, RevisionRow[]>()
  for (const r of revisionRows) {
    if (!revisionsByAd.has(r.ad_id)) revisionsByAd.set(r.ad_id, [])
    revisionsByAd.get(r.ad_id)!.push(r)
  }

  const items: ContentItem[] = itemRows.map(row => ({
    id: row.id,
    client_name: row.client_name,
    title: row.title,
    content_type: row.content_type,
    status: row.status,
    shot_date: row.shot_date,
    edited_date: row.edited_date,
    notes: row.notes,
    created_at: row.created_at,
    shotByUser: row.shot_by ? (userMap.get(row.shot_by) ?? null) : null,
    editedByUser: row.edited_by ? (userMap.get(row.edited_by) ?? null) : null,
    posts: (postsByItem.get(row.id) ?? []).map(p => ({
      id: p.id, content_item_id: p.content_item_id, platform: p.platform, posted_date: p.posted_date, post_link: p.post_link,
      postedByUser: p.posted_by ? (userMap.get(p.posted_by) ?? null) : null,
    })),
  }))

  const ads: Ad[] = adRows.map(row => ({
    id: row.id,
    client_name: row.client_name,
    ad_name: row.ad_name,
    platform: row.platform,
    launch_date: row.launch_date,
    hook_count: row.hook_count,
    targeting_type: row.targeting_type,
    targeting_notes: row.targeting_notes,
    status: row.status,
    created_at: row.created_at,
    revisions: revisionsByAd.get(row.id) ?? [],
  }))

  return { items, ads }
}
