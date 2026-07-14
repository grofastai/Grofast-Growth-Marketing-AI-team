'use server'

import { createServerClient } from '@/lib/supabase/server'
import { createClient } from '@supabase/supabase-js'
import { revalidatePath } from 'next/cache'
import { isValidShootTransition, type ShootStatus } from '@/lib/shoots/status-transitions'

function adminSupabase() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  )
}

type ShootInput = {
  title: string
  client: string
  location: string
  start_time: string
  end_time: string
  team_assigned: string
  equipment_used: string
  travel_expense: number
  travel_time_hours?: number
}

async function getCompanyId(userId: string) {
  const admin = adminSupabase()
  const { data } = await admin.from('users').select('company_id').eq('id', userId).single()
  return data?.company_id as string | undefined
}

export async function createShoot(
  input: ShootInput
): Promise<{ success: boolean; error?: string }> {
  const supabase = await createServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { success: false, error: 'Not authenticated' }

  if (!input.title.trim())    return { success: false, error: 'Shoot title is required' }
  if (!input.client.trim())   return { success: false, error: 'Client is required' }
  if (!input.location.trim()) return { success: false, error: 'Location is required' }
  if (!input.start_time)      return { success: false, error: 'Start time is required' }
  if (!input.end_time)        return { success: false, error: 'End time is required' }
  if (input.start_time >= input.end_time) return { success: false, error: 'End time must be after start time' }

  const company_id = await getCompanyId(user.id)
  if (!company_id) return { success: false, error: 'Profile not found' }

  const admin = adminSupabase()
  const { error } = await admin.from('shoots').insert({
    company_id,
    title:          input.title.trim(),
    client:         input.client.trim(),
    location:       input.location.trim(),
    start_time:     input.start_time,
    end_time:       input.end_time,
    team_assigned:  input.team_assigned.trim() || null,
    equipment_used: input.equipment_used.trim() || null,
    travel_expense:     input.travel_expense || 0,
    travel_time_hours:  input.travel_time_hours || 0,
    created_by:         user.id,
    status:         'scheduled',
  })

  if (error) return { success: false, error: error.message }

  revalidatePath('/admin/shoots')
  revalidatePath('/member/shoots')
  return { success: true }
}

export type CreatedShootItem = {
  id: string; shoot_title_id: string; client_name: string; title: string
  content_type: 'video'; status: 'shot'; shot_date: string | null; notes: string | null
}

export async function updateShootStatus(
  id: string,
  status: ShootStatus,
  goingBy?: string[]
): Promise<{ success: boolean; error?: string; createdItems?: CreatedShootItem[] }> {
  const supabase = await createServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { success: false, error: 'Not authenticated' }

  const admin = adminSupabase()
  const { data: shoot } = await admin
    .from('shoots')
    .select('id, status, client, start_time, notes, company_id')
    .eq('id', id)
    .single()
  if (!shoot) return { success: false, error: 'Shoot not found' }

  if (!isValidShootTransition(shoot.status as ShootStatus, status)) {
    return { success: false, error: `Cannot move from ${shoot.status} to ${status}` }
  }

  // Marking Going records WHO is covering the shoot, so the rest of the team can see it.
  const updates: Record<string, unknown> = { status }
  if (status === 'going' && goingBy && goingBy.length > 0) updates.going_by = goingBy

  const { error } = await admin.from('shoots').update(updates).eq('id', id)
  if (error) return { success: false, error: error.message }

  let createdItems: CreatedShootItem[] | undefined

  if (status === 'completed') {
    const { data: titles } = await admin
      .from('shoot_titles')
      .select('id, title')
      .eq('shoot_id', id)
      .is('content_item_id', null)

    if (titles && titles.length > 0) {
      const shotDate = shoot.start_time.split('T')[0]
      const rows = titles.map(t => ({
        company_id: shoot.company_id,
        client_name: shoot.client,
        title: t.title,
        content_type: 'video',
        status: 'shot',
        shot_by: user.id,
        shot_date: shotDate,
        notes: shoot.notes,
        created_by: user.id,
      }))
      const { data: inserted, error: insertError } = await admin
        .from('content_items')
        .insert(rows)
        .select('id')

      if (!insertError && inserted) {
        createdItems = []
        for (let i = 0; i < titles.length; i++) {
          const t = titles[i]
          const item = inserted[i]
          await admin.from('shoot_titles').update({ content_item_id: item.id }).eq('id', t.id)
          createdItems.push({
            id: item.id,
            shoot_title_id: t.id,
            client_name: shoot.client,
            title: t.title,
            content_type: 'video',
            status: 'shot',
            shot_date: shotDate,
            notes: shoot.notes,
          })
        }
      }
    }
  }

  revalidatePath('/admin/shoots')
  revalidatePath('/member/shoots')
  revalidatePath('/admin/content-tracker')
  revalidatePath('/member/content-tracker')
  return { success: true, createdItems }
}

type CreateTrackerShootInput = {
  client: string
  title: string
  shot_date: string
  shot_time?: string
  notes?: string
}

// Scheduling only records the SHOOT (e.g. "SKB Silks Diwali Shoot"). The individual
// video titles aren't known until the shoot actually happens — they're captured on
// completion via completeShootWithTitles.
export async function createTrackerShoot(
  input: CreateTrackerShootInput
): Promise<{ success: boolean; error?: string; id?: string }> {
  const supabase = await createServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { success: false, error: 'Not authenticated' }

  if (!input.client.trim()) return { success: false, error: 'Client is required' }
  if (!input.title.trim()) return { success: false, error: 'Shoot title is required' }
  if (!input.shot_date) return { success: false, error: 'Shot date is required' }

  const company_id = await getCompanyId(user.id)
  if (!company_id) return { success: false, error: 'Profile not found' }

  const admin = adminSupabase()
  const time = input.shot_time || '09:00'
  const start_time = `${input.shot_date}T${time}:00+05:30`
  const end_time = new Date(new Date(start_time).getTime() + 2 * 60 * 60 * 1000).toISOString()

  const { data: shoot, error } = await admin.from('shoots').insert({
    company_id,
    title: input.title.trim(),
    client: input.client.trim(),
    location: '',
    start_time,
    end_time,
    notes: input.notes?.trim() || null,
    created_by: user.id,
    status: 'scheduled',
  }).select('id').single()
  if (error) return { success: false, error: error.message }

  revalidatePath('/admin/shoots')
  revalidatePath('/member/shoots')
  revalidatePath('/admin/content-tracker')
  revalidatePath('/member/content-tracker')
  return { success: true, id: shoot.id }
}

// Completing a shoot is where the video titles are captured — one shoot_titles row and
// one content_items row (status: shot) per video that actually came out of the shoot.
export async function completeShootWithTitles(
  shootId: string,
  titles: string[],
  goingBy?: string[]
): Promise<{ success: boolean; error?: string; createdItems?: CreatedShootItem[] }> {
  const supabase = await createServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { success: false, error: 'Not authenticated' }

  const cleanTitles = titles.map(t => t.trim()).filter(Boolean)
  if (cleanTitles.length === 0) return { success: false, error: 'Add at least one video title' }

  const admin = adminSupabase()
  const { data: shoot } = await admin
    .from('shoots')
    .select('id, status, client, start_time, notes, company_id')
    .eq('id', shootId)
    .single()
  if (!shoot) return { success: false, error: 'Shoot not found' }

  if (!isValidShootTransition(shoot.status as ShootStatus, 'completed')) {
    return { success: false, error: `Cannot move from ${shoot.status} to completed` }
  }

  const shotDate = shoot.start_time.split('T')[0]

  const { data: insertedTitles, error: titlesError } = await admin.from('shoot_titles').insert(
    cleanTitles.map(title => ({
      shoot_id: shootId, company_id: shoot.company_id, title, created_by: user.id,
    }))
  ).select('id, title')
  if (titlesError || !insertedTitles) return { success: false, error: titlesError?.message ?? 'Failed to save titles' }

  const { data: insertedItems, error: itemsError } = await admin.from('content_items').insert(
    insertedTitles.map(t => ({
      company_id: shoot.company_id,
      client_name: shoot.client,
      title: t.title,
      content_type: 'video',
      status: 'shot',
      shot_by: user.id,
      shot_date: shotDate,
      notes: shoot.notes,
      created_by: user.id,
    }))
  ).select('id')
  if (itemsError || !insertedItems) return { success: false, error: itemsError?.message ?? 'Failed to create content items' }

  const createdItems: CreatedShootItem[] = []
  for (let i = 0; i < insertedTitles.length; i++) {
    const t = insertedTitles[i]
    const item = insertedItems[i]
    await admin.from('shoot_titles').update({ content_item_id: item.id }).eq('id', t.id)
    createdItems.push({
      id: item.id,
      shoot_title_id: t.id,
      client_name: shoot.client,
      title: t.title,
      content_type: 'video',
      status: 'shot',
      shot_date: shotDate,
      notes: shoot.notes,
    })
  }

  // Crew is captured here too, not just at Going — a shoot dragged straight to Completed
  // would otherwise end up Done with no record of who actually went.
  const completeUpdates: Record<string, unknown> = { status: 'completed' }
  if (goingBy && goingBy.length > 0) completeUpdates.going_by = goingBy

  const { error: statusError } = await admin.from('shoots').update(completeUpdates).eq('id', shootId)
  if (statusError) return { success: false, error: statusError.message }

  revalidatePath('/admin/shoots')
  revalidatePath('/member/shoots')
  revalidatePath('/admin/content-tracker')
  revalidatePath('/member/content-tracker')
  return { success: true, createdItems }
}

// Edit a Tracker-created shoot's details. Deliberately does NOT touch status, crew, or the
// video titles — those each have their own flow, and folding them in here would let an
// "edit details" action silently undo a completion.
export async function updateTrackerShoot(
  shootId: string,
  input: { client: string; title: string; shot_date: string; shot_time?: string; notes?: string }
): Promise<{ success: boolean; error?: string }> {
  const supabase = await createServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { success: false, error: 'Not authenticated' }

  if (!input.client.trim()) return { success: false, error: 'Client is required' }
  if (!input.title.trim()) return { success: false, error: 'Shoot title is required' }
  if (!input.shot_date) return { success: false, error: 'Shot date is required' }

  const admin = adminSupabase()
  const time = input.shot_time || '09:00'
  const start_time = `${input.shot_date}T${time}:00+05:30`
  const end_time = new Date(new Date(start_time).getTime() + 2 * 60 * 60 * 1000).toISOString()

  const { error } = await admin.from('shoots').update({
    client: input.client.trim(),
    title: input.title.trim(),
    start_time,
    end_time,
    notes: input.notes?.trim() || null,
  }).eq('id', shootId)
  if (error) return { success: false, error: error.message }

  revalidatePath('/admin/shoots')
  revalidatePath('/member/shoots')
  revalidatePath('/admin/content-tracker')
  revalidatePath('/member/content-tracker')
  return { success: true }
}

// Set or correct who went on a shoot at any point — including after it's Completed, so an
// older shoot with no crew recorded can be backfilled.
export async function updateShootCrew(
  shootId: string,
  crew: string[]
): Promise<{ success: boolean; error?: string }> {
  const supabase = await createServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { success: false, error: 'Not authenticated' }

  const admin = adminSupabase()
  const { error } = await admin.from('shoots').update({ going_by: crew }).eq('id', shootId)
  if (error) return { success: false, error: error.message }

  revalidatePath('/admin/shoots')
  revalidatePath('/member/shoots')
  revalidatePath('/admin/content-tracker')
  revalidatePath('/member/content-tracker')
  return { success: true }
}

export async function deleteShoot(id: string): Promise<{ success: boolean; error?: string }> {
  const supabase = await createServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { success: false, error: 'Not authenticated' }

  const admin = adminSupabase()
  const { error } = await admin.from('shoots').delete().eq('id', id)
  if (error) return { success: false, error: error.message }

  revalidatePath('/admin/shoots')
  revalidatePath('/member/shoots')
  return { success: true }
}
