'use server'

import { createClient } from '@supabase/supabase-js'
import { createServerClient } from '@/lib/supabase/server'
import { revalidatePath } from 'next/cache'

function adminSupabase() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  )
}

export type WorkLogInput = {
  activity_id: string
  client_name: string
  hours: number
  unit_count: number
  item_titles: string[]
  notes: string
}

export type ContentPostInput = {
  title: string
  client_name: string
  platform: string
  post_type: string
  post_link: string
  notes: string
}

export type Activity = {
  id: string
  name: string
  team_category: 'MEDIA' | 'META' | 'CREATIVE' | 'AI' | 'OPS'
  unit_type: 'hours' | 'count' | 'both'
  emoji: string
  sort_order: number
}

export async function submitWorkLogs(
  date: string,
  logs: WorkLogInput[],
  posts: ContentPostInput[],
): Promise<{ success: boolean; error?: string }> {
  const supabase = await createServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { success: false, error: 'Not authenticated' }

  const admin = adminSupabase()
  const { data: profile } = await admin
    .from('users')
    .select('company_id, monthly_salary, hourly_rate')
    .eq('id', user.id)
    .single()
  if (!profile?.company_id) return { success: false, error: 'Profile not found' }

  const cid = profile.company_id
  const hourlyRate = profile.monthly_salary && profile.monthly_salary > 0
    ? profile.monthly_salary / 25 / 9
    : (profile.hourly_rate ?? 0)

  // Replace strategy: delete today's entries then re-insert
  await Promise.all([
    admin.from('work_logs').delete().eq('user_id', user.id).eq('date', date).eq('company_id', cid),
    admin.from('content_posts').delete().eq('user_id', user.id).eq('date', date).eq('company_id', cid),
  ])

  if (logs.length > 0) {
    const rows = logs
      .filter(l => l.hours > 0 || l.unit_count > 0)
      .map(l => ({
        company_id:  cid,
        user_id:     user.id,
        date,
        activity_id: l.activity_id,
        client_name: l.client_name || null,
        hours:       l.hours,
        unit_count:  l.unit_count,
        item_titles: l.item_titles.filter(t => t.trim() !== ''),
        notes:       l.notes || null,
        cost:        Math.round(hourlyRate * l.hours * 100) / 100,
      }))
    if (rows.length > 0) {
      const { error } = await admin.from('work_logs').insert(rows)
      if (error) return { success: false, error: error.message }
    }
  }

  if (posts.length > 0) {
    const rows = posts
      .filter(p => p.platform && p.post_type)
      .map(p => ({
        company_id:  cid,
        user_id:     user.id,
        date,
        title:       p.title || null,
        client_name: p.client_name || null,
        platform:    p.platform,
        post_type:   p.post_type,
        post_link:   p.post_link || null,
        notes:       p.notes || null,
      }))
    if (rows.length > 0) {
      const { error } = await admin.from('content_posts').insert(rows)
      if (error) return { success: false, error: error.message }
    }
  }

  revalidatePath('/member/update')
  revalidatePath('/admin/insights')
  return { success: true }
}

export async function getWorkLogsForDate(date: string): Promise<{
  logs: Array<{ activity_id: string; client_name: string | null; hours: number; unit_count: number; item_titles: string[]; notes: string | null }>
  posts: Array<{ title: string | null; client_name: string | null; platform: string; post_type: string; post_link: string | null; notes: string | null }>
}> {
  const supabase = await createServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { logs: [], posts: [] }

  const admin = adminSupabase()
  const { data: profile } = await admin.from('users').select('company_id').eq('id', user.id).single()
  if (!profile) return { logs: [], posts: [] }

  const [{ data: logs }, { data: posts }] = await Promise.all([
    admin.from('work_logs')
      .select('activity_id, client_name, hours, unit_count, item_titles, notes')
      .eq('user_id', user.id).eq('date', date).eq('company_id', profile.company_id),
    admin.from('content_posts')
      .select('title, client_name, platform, post_type, post_link, notes')
      .eq('user_id', user.id).eq('date', date).eq('company_id', profile.company_id),
  ])

  return {
    logs:  (logs  ?? []) as Array<{ activity_id: string; client_name: string | null; hours: number; unit_count: number; item_titles: string[]; notes: string | null }>,
    posts: (posts ?? []) as Array<{ title: string | null; client_name: string | null; platform: string; post_type: string; post_link: string | null; notes: string | null }>,
  }
}
