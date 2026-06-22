'use server'

import { createServerClient } from '@/lib/supabase/server'
import { createClient } from '@supabase/supabase-js'
import { revalidatePath } from 'next/cache'
import { sendWhatsAppTemplate, formatPhone } from '@/lib/whatsapp'

function adminSupabase() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  )
}

export interface ContentPostInput {
  title: string
  platform: string
  content_type: string
  client_id?: string | null
  client_name: string
  scheduled_date: string
  scheduled_time?: string | null
  assigned_to?: string | null
  shoot_team?: string[]
  drive_link?: string
  caption?: string
  notes?: string
  content_pillar?: string | null
  priority?: string | null
}

export async function createContentPost(input: ContentPostInput) {
  const supabase = await createServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { success: false, error: 'Not authenticated' }

  const admin = adminSupabase()
  const { data: profile } = await admin
    .from('users').select('company_id, role, name').eq('id', user.id).single()
  if (!profile) return { success: false, error: 'Profile not found' }

  const { data: post, error } = await admin.from('content_posts').insert({
    company_id:     profile.company_id,
    user_id:        user.id,
    created_by:     user.id,
    title:          input.title,
    platform:       input.platform,
    content_type:   input.content_type,
    client_id:      input.client_id || null,
    client_name:    input.client_name,
    date:           input.scheduled_date,
    scheduled_date: input.scheduled_date,
    post_type:      input.content_type,
    assigned_to:    input.assigned_to || null,
    shoot_team:     input.shoot_team ?? [],
    drive_link:     input.drive_link || null,
    caption:        input.caption || null,
    notes:          input.notes || null,
    scheduled_time:  input.scheduled_time || null,
    content_pillar:  input.content_pillar || null,
    priority:        input.priority || 'medium',
  }).select('id').single()

  if (error) return { success: false, error: error.message }

  // WhatsApp notification — shoot_team members or single assignee
  const notifyIds = (input.shoot_team && input.shoot_team.length > 0)
    ? input.shoot_team
    : input.assigned_to ? [input.assigned_to] : []
  if (notifyIds.length > 0) {
    const { data: assignees } = await admin
      .from('users').select('name, phone').in('id', notifyIds)
    const dateLabel = new Date(input.scheduled_date).toLocaleDateString('en-IN', { day: 'numeric', month: 'long', year: 'numeric' })
    let timeLabel = ''
    if (input.scheduled_time) {
      const [h, m] = (input.scheduled_time as string).split(':').map(Number)
      const ampm = h >= 12 ? 'PM' : 'AM'
      const hour12 = h % 12 || 12
      timeLabel = ` at ${hour12}:${String(m).padStart(2, '0')} ${ampm}`
    }
    const dateTimeLabel = dateLabel + timeLabel
    for (const assignee of (assignees ?? [])) {
      if (assignee?.phone) {
        sendWhatsAppTemplate(
          formatPhone(assignee.phone),
          'grofast_content_assigned',
          [assignee.name, input.title, input.platform, dateTimeLabel]
        ).catch(console.error)
      }
    }
  }

  revalidatePath('/admin/content-calendar')
  revalidatePath('/member/content-calendar')
  return { success: true, id: post?.id }
}

export async function updateContentPostStatus(
  postId: string,
  status: 'pending' | 'in_progress' | 'ready' | 'posted' | 'cancelled',
  postedDate?: string
) {
  const supabase = await createServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { success: false, error: 'Not authenticated' }

  const admin = adminSupabase()
  const { data: profile } = await admin
    .from('users').select('company_id, role').eq('id', user.id).single()
  if (!profile) return { success: false, error: 'Profile not found' }

  // Admins can update any post; members can only update posts assigned to them
  let query = admin.from('content_posts')
    .update({ status, posted_date: status === 'posted' ? (postedDate || new Date().toISOString().split('T')[0]) : null })
    .eq('id', postId)
    .eq('company_id', profile.company_id)

  if (profile.role !== 'ADMIN') {
    query = query.eq('assigned_to', user.id)
  }

  const { error } = await query

  if (error) return { success: false, error: error.message }
  revalidatePath('/admin/content-calendar')
  revalidatePath('/member/content-calendar')
  return { success: true }
}

export async function updatePostLink(postId: string, link: string) {
  const supabase = await createServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { success: false, error: 'Not authenticated' }

  const admin = adminSupabase()
  const { error } = await admin.from('content_posts')
    .update({ drive_link: link, post_link: link })
    .eq('id', postId)

  if (error) return { success: false, error: error.message }
  revalidatePath('/admin/content-calendar')
  revalidatePath('/member/content-calendar')
  return { success: true }
}

export async function updateContentPost(
  postId: string,
  input: Partial<ContentPostInput>
): Promise<{ success: boolean; error?: string }> {
  const supabase = await createServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { success: false, error: 'Not authenticated' }

  const admin = adminSupabase()
  const { data: profile } = await admin
    .from('users').select('company_id, role').eq('id', user.id).single()
  if (!profile || profile.role !== 'ADMIN') return { success: false, error: 'Admin only' }

  const { error } = await admin.from('content_posts').update({
    ...(input.title          !== undefined && { title: input.title }),
    ...(input.platform       !== undefined && { platform: input.platform }),
    ...(input.content_type   !== undefined && { content_type: input.content_type, post_type: input.content_type }),
    ...(input.client_id      !== undefined && { client_id: input.client_id }),
    ...(input.client_name    !== undefined && { client_name: input.client_name }),
    ...(input.scheduled_date !== undefined && { scheduled_date: input.scheduled_date, date: input.scheduled_date }),
    ...(input.scheduled_time !== undefined && { scheduled_time: input.scheduled_time || null, reminder_sent: false }),
    ...(input.assigned_to    !== undefined && { assigned_to: input.assigned_to || null }),
    ...(input.shoot_team     !== undefined && { shoot_team: input.shoot_team }),
    ...(input.notes          !== undefined && { notes: input.notes || null }),
    ...(input.content_pillar !== undefined && { content_pillar: input.content_pillar || null }),
    ...(input.priority       !== undefined && { priority: input.priority || 'medium' }),
  }).eq('id', postId).eq('company_id', profile.company_id)

  if (error) return { success: false, error: error.message }
  revalidatePath('/admin/content-calendar')
  revalidatePath('/member/content-calendar')
  return { success: true }
}

export async function deleteContentPost(postId: string) {
  const supabase = await createServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { success: false, error: 'Not authenticated' }

  const admin = adminSupabase()
  const { data: profile } = await admin
    .from('users').select('company_id, role').eq('id', user.id).single()
  if (!profile || profile.role !== 'ADMIN') return { success: false, error: 'Admin only' }

  const { error } = await admin.from('content_posts')
    .delete().eq('id', postId).eq('company_id', profile.company_id)

  if (error) return { success: false, error: error.message }
  revalidatePath('/admin/content-calendar')
  return { success: true }
}
