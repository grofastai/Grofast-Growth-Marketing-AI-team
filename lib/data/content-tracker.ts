import { createClient } from '@supabase/supabase-js'
import type { ContentItem, Ad, Shoot } from '@/components/content-tracker/content-tracker-client'

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
export async function getContentTrackerData(companyId: string): Promise<{
  items: ContentItem[]; ads: Ad[]; shoots: Shoot[]; members: { id: string; name: string }[]
  voiceoverFreelancers: { id: string; name: string }[]
}> {
  const admin = adminSupabase()

  const [itemsRes, postsRes, usersRes, adsRes, revisionsRes, performanceRes, shootsRes, shootTitlesRes, correctionsRes, freelancersRes] = await Promise.all([
    admin.from('content_items').select('*').eq('company_id', companyId).order('created_at', { ascending: false }),
    admin.from('content_item_posts').select('*').eq('company_id', companyId).order('posted_date', { ascending: false }),
    // Freelancers have their own separate work-logging flow (app/admin/freelancers) — they
    // shouldn't show up as a pickable "who shot/edited/posted this" crew member here.
    admin.from('users').select('id, name').eq('company_id', companyId).in('role', ['ADMIN', 'MEMBER']),
    admin.from('ads_tracker').select('*').eq('company_id', companyId).order('created_at', { ascending: false }),
    admin.from('ad_revisions').select('*').eq('company_id', companyId).order('revision_date', { ascending: false }),
    admin.from('ad_performance_entries').select('*').eq('company_id', companyId).order('entry_date', { ascending: false }),
    admin.from('shoots').select('id, title, client, start_time, notes, status, going_by, created_at').eq('company_id', companyId).order('start_time', { ascending: false }),
    admin.from('shoot_titles').select('id, shoot_id, title, content_item_id').eq('company_id', companyId),
    admin.from('content_corrections').select('*').eq('company_id', companyId).order('correction_date', { ascending: false }),
    admin.from('freelancers').select('id, name, team, status').eq('company_id', companyId),
  ])

  type ItemRow = {
    id: string; client_name: string; title: string; content_type: 'video' | 'poster'
    status: 'scripting' | 'voiceover' | 'design' | 'ready_to_edit' | 'edited' | 'on_review' | 'ready_to_post' | 'posted' | 'cancelled'
    source: 'shoot' | 'ads_video' | 'poster'
    shot_by: string | null; shot_date: string | null; edited_by: string | null; edited_date: string | null
    notes: string | null; created_at: string
    ready_platforms: string[] | null; scheduled_post_date: string | null; scheduled_post_time: string | null
    hook_count: number | null; use_for: string[] | null; priority: string | null
    scripted_by: string | null; voiceover_by: string | null; voiceover_date: string | null
    reviewed_by: string | null; reviewed_at: string | null
  }
  type PostRow = { id: string; content_item_id: string; platform: 'instagram' | 'youtube' | 'facebook' | 'linkedin' | 'gmb' | 'ads'; posted_date: string; posted_by: string | null; post_link: string | null }
  type UserRow = { id: string; name: string }
  type AdRow = { id: string; client_name: string; ad_name: string; platform: string; launch_date: string | null; hook_count: number; targeting_type: 'broad' | 'interest' | 'lookalike' | 'retargeting' | null; targeting_notes: string | null; status: 'active' | 'paused' | 'testing' | 'stopped'; created_at: string }
  type RevisionRow = { id: string; ad_id: string; revision_date: string; notes: string; hook_count_after: number | null; targeting_type_after: 'broad' | 'interest' | 'lookalike' | 'retargeting' | null }
  type PerformanceRow = { id: string; ad_id: string; entry_date: string; spend: number; impressions: number; reach: number; clicks: number; ctr: number; results: number; note: string | null }
  type ShootRow = { id: string; title: string; client: string; start_time: string; notes: string | null; status: 'scheduled' | 'completed' | 'cancelled'; going_by: string[] | null; created_at: string }
  type ShootTitleRow = { id: string; shoot_id: string; title: string; content_item_id: string | null }
  type CorrectionRow = { id: string; content_item_id: string; correction_date: string; notes: string; requested_by: string | null; assigned_to: string | null }
  type FreelancerRow = { id: string; name: string; team: string | null; status: string }

  const itemRows = (itemsRes.data ?? []) as ItemRow[]
  const postRows = (postsRes.data ?? []) as PostRow[]
  const userRows = (usersRes.data ?? []) as UserRow[]
  const adRows = (adsRes.data ?? []) as AdRow[]
  const revisionRows = (revisionsRes.data ?? []) as RevisionRow[]
  const performanceRows = (performanceRes.data ?? []) as PerformanceRow[]
  const shootRows = (shootsRes.data ?? []) as ShootRow[]
  const shootTitleRows = (shootTitlesRes.data ?? []) as ShootTitleRow[]
  const correctionRows = (correctionsRes.data ?? []) as CorrectionRow[]
  const freelancerRows = (freelancersRes.data ?? []) as FreelancerRow[]

  const userMap = new Map(userRows.map(u => [u.id, u]))
  const freelancerMap = new Map(freelancerRows.map(f => [f.id, f]))
  // The live voice-over roster for the picker — active RJ Voiceover freelancers only.
  const voiceoverFreelancers = freelancerRows
    .filter(f => f.team === 'Freelance RJ Voiceover' && f.status === 'active')
    .map(f => ({ id: f.id, name: f.name }))
    .sort((a, b) => a.name.localeCompare(b.name))
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
  const performanceByAd = new Map<string, PerformanceRow[]>()
  for (const p of performanceRows) {
    if (!performanceByAd.has(p.ad_id)) performanceByAd.set(p.ad_id, [])
    performanceByAd.get(p.ad_id)!.push(p)
  }
  const correctionsByItem = new Map<string, CorrectionRow[]>()
  for (const c of correctionRows) {
    if (!correctionsByItem.has(c.content_item_id)) correctionsByItem.set(c.content_item_id, [])
    correctionsByItem.get(c.content_item_id)!.push(c)
  }
  const titlesByShoot = new Map<string, ShootTitleRow[]>()
  for (const t of shootTitleRows) {
    if (!titlesByShoot.has(t.shoot_id)) titlesByShoot.set(t.shoot_id, [])
    titlesByShoot.get(t.shoot_id)!.push(t)
  }

  const items: ContentItem[] = itemRows.map(row => ({
    id: row.id,
    client_name: row.client_name,
    title: row.title,
    content_type: row.content_type,
    status: row.status,
    source: row.source,
    shot_date: row.shot_date,
    edited_date: row.edited_date,
    notes: row.notes,
    created_at: row.created_at,
    ready_platforms: (row.ready_platforms ?? []) as ContentItem['ready_platforms'],
    scheduled_post_date: row.scheduled_post_date,
    scheduled_post_time: row.scheduled_post_time,
    hook_count: row.hook_count,
    use_for: (row.use_for ?? []) as ContentItem['use_for'],
    priority: row.priority as ContentItem['priority'],
    voiceover_date: row.voiceover_date,
    reviewed_at: row.reviewed_at,
    shotByUser: row.shot_by ? (userMap.get(row.shot_by) ?? null) : null,
    editedByUser: row.edited_by ? (userMap.get(row.edited_by) ?? null) : null,
    scriptedByUser: row.scripted_by ? (userMap.get(row.scripted_by) ?? null) : null,
    reviewedByUser: row.reviewed_by ? (userMap.get(row.reviewed_by) ?? null) : null,
    voiceoverBy: row.voiceover_by ? (freelancerMap.get(row.voiceover_by) ? { id: row.voiceover_by, name: freelancerMap.get(row.voiceover_by)!.name } : null) : null,
    corrections: (correctionsByItem.get(row.id) ?? []).map(c => ({
      id: c.id,
      content_item_id: c.content_item_id,
      correction_date: c.correction_date,
      notes: c.notes,
      requestedByUser: c.requested_by ? (userMap.get(c.requested_by) ?? null) : null,
      assignedToUser: c.assigned_to ? (userMap.get(c.assigned_to) ?? null) : null,
    })),
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
    performanceEntries: performanceByAd.get(row.id) ?? [],
  }))

  const shoots: Shoot[] = shootRows.map(row => ({
    id: row.id,
    client: row.client,
    legacyTitle: row.title,
    start_time: row.start_time,
    created_at: row.created_at,
    notes: row.notes,
    status: row.status,
    goingByUsers: (row.going_by ?? [])
      .map(uid => userMap.get(uid))
      .filter((u): u is UserRow => !!u),
    titles: (titlesByShoot.get(row.id) ?? []).map(t => ({
      id: t.id, title: t.title, content_item_id: t.content_item_id,
    })),
  }))

  const members = userRows.map(u => ({ id: u.id, name: u.name })).sort((a, b) => a.name.localeCompare(b.name))

  return { items, ads, shoots, members, voiceoverFreelancers }
}
