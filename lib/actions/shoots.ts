'use server'

import { createServerClient } from '@/lib/supabase/server'
import { createClient } from '@supabase/supabase-js'
import { revalidatePath } from 'next/cache'
import { isValidShootTransition, type ShootStatus } from '@/lib/shoots/status-transitions'
import { moveScriptToShootSchema, type MoveScriptToShootInput } from '@/lib/validations/media-tracker'
import { isValidDriveLink } from '@/lib/utils/drive-link'

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
  content_type: 'video'; status: 'ready_to_edit'; shot_date: string | null; notes: string | null
}

export async function updateShootStatus(
  id: string,
  status: ShootStatus
): Promise<{ success: boolean; error?: string; createdItems?: CreatedShootItem[] }> {
  const supabase = await createServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { success: false, error: 'Not authenticated' }

  const admin = adminSupabase()
  const { data: shoot } = await admin
    .from('shoots')
    .select('id, status, client, start_time, notes, company_id, source_content_item_id')
    .eq('id', id)
    .single()
  if (!shoot) return { success: false, error: 'Shoot not found' }

  if (!isValidShootTransition(shoot.status as ShootStatus, status)) {
    return { success: false, error: `Cannot move from ${shoot.status} to ${status}` }
  }

  const { error } = await admin.from('shoots').update({ status }).eq('id', id)
  if (error) return { success: false, error: error.message }

  let createdItems: CreatedShootItem[] | undefined

  // A shoot spun off an Ads Video script via "Move to Shoot" has no shoot_titles of its
  // own — completing it just advances the linked content_item straight to Ready to Edit
  // instead of minting a new one.
  if (status === 'completed' && shoot.source_content_item_id) {
    const shotDate = shoot.start_time.split('T')[0]
    await admin.from('content_items').update({
      status: 'ready_to_edit', shot_by: user.id, shot_date: shotDate, updated_at: new Date().toISOString(),
    }).eq('id', shoot.source_content_item_id)

    revalidatePath('/admin/shoots')
    revalidatePath('/member/shoots')
    revalidatePath('/admin/media-tracker')
    revalidatePath('/member/media-tracker')
    return { success: true, createdItems: [] }
  }

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
        source: 'shoot',
        status: 'ready_to_edit',
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
            status: 'ready_to_edit',
            shot_date: shotDate,
            notes: shoot.notes,
          })
        }
      }
    }
  }

  revalidatePath('/admin/shoots')
  revalidatePath('/member/shoots')
  revalidatePath('/admin/media-tracker')
  revalidatePath('/member/media-tracker')
  return { success: true, createdItems }
}

type CreateTrackerShootInput = {
  client: string
  title: string
  shot_date: string
  shot_time_from: string
  shot_time_to: string
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
  if (!input.shot_time_from) return { success: false, error: 'From time is required' }
  if (!input.shot_time_to) return { success: false, error: 'To time is required' }

  const company_id = await getCompanyId(user.id)
  if (!company_id) return { success: false, error: 'Profile not found' }

  const admin = adminSupabase()
  const start_time = `${input.shot_date}T${input.shot_time_from}:00+05:30`
  const end_time = `${input.shot_date}T${input.shot_time_to}:00+05:30`
  if (start_time >= end_time) return { success: false, error: 'To time must be after From time' }

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
  revalidatePath('/admin/media-tracker')
  revalidatePath('/member/media-tracker')
  return { success: true, id: shoot.id }
}

// Completing a shoot is where the video titles are captured — one shoot_titles row and
// one content_items row (status: shot) per video that actually came out of the shoot.
// The actual from/to time is re-entered here too, since a shoot can run longer than
// scheduled — it overwrites the shoot's start/end time as the authoritative final time.
export async function completeShootWithTitles(
  shootId: string,
  titles: string[],
  goingBy: string[] | undefined,
  actualTime: { from: string; to: string },
  driveLink: string
): Promise<{ success: boolean; error?: string; createdItems?: CreatedShootItem[] }> {
  const supabase = await createServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { success: false, error: 'Not authenticated' }

  if (!actualTime?.from) return { success: false, error: 'Start time is required' }
  if (!actualTime?.to) return { success: false, error: 'End time is required' }
  // Enforced server-side too — the client can't be trusted to be the only gate on a
  // pipeline transition that's supposed to always leave a real Drive link behind.
  if (!isValidDriveLink(driveLink)) return { success: false, error: 'A valid Google Drive link is required' }

  const admin = adminSupabase()
  const { data: shoot } = await admin
    .from('shoots')
    .select('id, status, client, start_time, notes, company_id, source_content_item_id')
    .eq('id', shootId)
    .single()
  if (!shoot) return { success: false, error: 'Shoot not found' }

  if (!isValidShootTransition(shoot.status as ShootStatus, 'completed')) {
    return { success: false, error: `Cannot move from ${shoot.status} to completed` }
  }

  const shotDate = shoot.start_time.split('T')[0]
  const finalStart = `${shotDate}T${actualTime.from}:00+05:30`
  const finalEnd = `${shotDate}T${actualTime.to}:00+05:30`
  if (finalStart >= finalEnd) return { success: false, error: 'End time must be after start time' }

  // A shoot spun off an Ads Video script via "Move to Shoot" already has one guaranteed
  // video (the script itself, advanced below) — the title list here is optional EXTRA
  // footage from the same session (e.g. behind-the-scenes, alternate takes), not a
  // replacement. A regular shoot has no video otherwise, so the list is required for it.
  const isLinked = !!shoot.source_content_item_id
  const cleanTitles = titles.map(t => t.trim()).filter(Boolean)
  if (!isLinked && cleanTitles.length === 0) return { success: false, error: 'Add at least one video title' }

  const createdItems: CreatedShootItem[] = []
  if (cleanTitles.length > 0) {
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
        source: 'shoot',
        status: 'ready_to_edit',
        shot_by: user.id,
        shot_date: shotDate,
        notes: shoot.notes,
        created_by: user.id,
      }))
    ).select('id')
    if (itemsError || !insertedItems) return { success: false, error: itemsError?.message ?? 'Failed to create content items' }

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
        status: 'ready_to_edit',
        shot_date: shotDate,
        notes: shoot.notes,
      })
    }
  }

  if (isLinked) {
    const { error: itemError } = await admin.from('content_items').update({
      status: 'ready_to_edit', shot_by: user.id, shot_date: shotDate, updated_at: new Date().toISOString(),
    }).eq('id', shoot.source_content_item_id as string)
    if (itemError) return { success: false, error: itemError.message }
  }

  // Crew is captured here, at completion — the only point in the shoot's lifecycle
  // where "who went" is known.
  const completeUpdates: Record<string, unknown> = { status: 'completed', start_time: finalStart, end_time: finalEnd, drive_link: driveLink.trim() }
  if (goingBy && goingBy.length > 0) completeUpdates.going_by = goingBy

  const { error: statusError } = await admin.from('shoots').update(completeUpdates).eq('id', shootId)
  if (statusError) return { success: false, error: statusError.message }

  revalidatePath('/admin/shoots')
  revalidatePath('/member/shoots')
  revalidatePath('/admin/media-tracker')
  revalidatePath('/member/media-tracker')
  return { success: true, createdItems }
}

// Fixing a typo, or renaming a video after the fact — keeps the shoot_titles row and its
// linked content_items row (if the linked item still exists) in sync.
export async function renameShootTitle(
  shootTitleId: string,
  newTitle: string
): Promise<{ success: boolean; error?: string }> {
  const supabase = await createServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { success: false, error: 'Not authenticated' }

  const title = newTitle.trim()
  if (!title) return { success: false, error: 'Title is required' }

  const admin = adminSupabase()
  const { data: st } = await admin.from('shoot_titles').select('id, content_item_id').eq('id', shootTitleId).single()
  if (!st) return { success: false, error: 'Video title not found' }

  const { error } = await admin.from('shoot_titles').update({ title }).eq('id', shootTitleId)
  if (error) return { success: false, error: error.message }

  if (st.content_item_id) {
    await admin.from('content_items').update({ title, updated_at: new Date().toISOString() }).eq('id', st.content_item_id)
  }

  revalidatePath('/admin/shoots')
  revalidatePath('/member/shoots')
  revalidatePath('/admin/media-tracker')
  revalidatePath('/member/media-tracker')
  return { success: true }
}

// Adding a video that was missed at completion time — a Completed shoot only, since a
// Scheduled one has no session to attribute the video to yet.
export async function addShootTitle(
  shootId: string,
  title: string
): Promise<{ success: boolean; error?: string; item?: CreatedShootItem }> {
  const supabase = await createServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { success: false, error: 'Not authenticated' }

  const cleanTitle = title.trim()
  if (!cleanTitle) return { success: false, error: 'Title is required' }

  const admin = adminSupabase()
  const { data: shoot } = await admin.from('shoots')
    .select('id, status, client, start_time, notes, company_id').eq('id', shootId).single()
  if (!shoot) return { success: false, error: 'Shoot not found' }
  if (shoot.status !== 'completed') return { success: false, error: 'Only a Completed shoot can have videos added here' }

  const shotDate = shoot.start_time.split('T')[0]
  const { data: item, error: itemError } = await admin.from('content_items').insert({
    company_id: shoot.company_id, client_name: shoot.client, title: cleanTitle, content_type: 'video',
    source: 'shoot', status: 'ready_to_edit', shot_by: user.id, shot_date: shotDate, notes: shoot.notes, created_by: user.id,
  }).select('id').single()
  if (itemError || !item) return { success: false, error: itemError?.message ?? 'Failed to create video' }

  const { data: st, error: stError } = await admin.from('shoot_titles').insert({
    shoot_id: shootId, company_id: shoot.company_id, title: cleanTitle, created_by: user.id, content_item_id: item.id,
  }).select('id, title').single()
  if (stError || !st) return { success: false, error: stError?.message ?? 'Failed to save title' }

  revalidatePath('/admin/shoots')
  revalidatePath('/member/shoots')
  revalidatePath('/admin/media-tracker')
  revalidatePath('/member/media-tracker')
  return {
    success: true,
    item: {
      id: item.id, shoot_title_id: st.id, client_name: shoot.client, title: cleanTitle,
      content_type: 'video', status: 'ready_to_edit', shot_date: shotDate, notes: shoot.notes,
    },
  }
}

// Removing a video that was listed by mistake — deletes both the shoot_titles row and its
// linked content_item, so it disappears from Ready to Edit too, not just from this list.
export async function deleteShootTitle(
  shootTitleId: string
): Promise<{ success: boolean; error?: string }> {
  const supabase = await createServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { success: false, error: 'Not authenticated' }

  const admin = adminSupabase()
  const { data: st } = await admin.from('shoot_titles').select('id, content_item_id').eq('id', shootTitleId).single()
  if (!st) return { success: false, error: 'Video title not found' }

  if (st.content_item_id) {
    await admin.from('content_items').delete().eq('id', st.content_item_id)
  }
  const { error } = await admin.from('shoot_titles').delete().eq('id', shootTitleId)
  if (error) return { success: false, error: error.message }

  revalidatePath('/admin/shoots')
  revalidatePath('/member/shoots')
  revalidatePath('/admin/media-tracker')
  revalidatePath('/member/media-tracker')
  return { success: true }
}

// Correcting the actual shoot time after completion (re-entered once already at Mark Done,
// but it can still be wrong or need a later adjustment).
export async function updateShootActualTime(
  shootId: string,
  fromTime: string,
  toTime: string
): Promise<{ success: boolean; error?: string }> {
  const supabase = await createServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { success: false, error: 'Not authenticated' }
  if (!fromTime) return { success: false, error: 'Start time is required' }
  if (!toTime) return { success: false, error: 'End time is required' }

  const admin = adminSupabase()
  const { data: shoot } = await admin.from('shoots').select('id, start_time').eq('id', shootId).single()
  if (!shoot) return { success: false, error: 'Shoot not found' }

  const shotDate = shoot.start_time.split('T')[0]
  const start_time = `${shotDate}T${fromTime}:00+05:30`
  const end_time = `${shotDate}T${toTime}:00+05:30`
  if (start_time >= end_time) return { success: false, error: 'End time must be after start time' }

  const { error } = await admin.from('shoots').update({ start_time, end_time }).eq('id', shootId)
  if (error) return { success: false, error: error.message }

  revalidatePath('/admin/shoots')
  revalidatePath('/member/shoots')
  revalidatePath('/admin/media-tracker')
  revalidatePath('/member/media-tracker')
  return { success: true }
}

// Edit a Tracker-created shoot's details. Deliberately does NOT touch status, crew, or the
// video titles — those each have their own flow, and folding them in here would let an
// "edit details" action silently undo a completion.
export async function updateTrackerShoot(
  shootId: string,
  input: { client: string; title: string; shoot_type?: 'ads_shoot' | 'branding_shoot'; shot_date: string; shot_time_from: string; shot_time_to: string; notes?: string }
): Promise<{ success: boolean; error?: string }> {
  const supabase = await createServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { success: false, error: 'Not authenticated' }

  if (!input.client.trim()) return { success: false, error: 'Client is required' }
  if (!input.title.trim()) return { success: false, error: 'Shoot title is required' }
  if (!input.shot_date) return { success: false, error: 'Shot date is required' }
  if (!input.shot_time_from) return { success: false, error: 'From time is required' }
  if (!input.shot_time_to) return { success: false, error: 'To time is required' }

  const admin = adminSupabase()
  const start_time = `${input.shot_date}T${input.shot_time_from}:00+05:30`
  const end_time = `${input.shot_date}T${input.shot_time_to}:00+05:30`
  if (start_time >= end_time) return { success: false, error: 'To time must be after From time' }

  // A shoot spun off an Ads Video item shares its client with that item — if the shoot's
  // client is corrected here, the linked item's card has to follow, or it's stuck showing
  // the stale client forever (nothing else ever re-syncs it).
  const { data: shoot } = await admin.from('shoots').select('source_content_item_id').eq('id', shootId).single()

  const { error } = await admin.from('shoots').update({
    client: input.client.trim(),
    title: input.title.trim(),
    start_time,
    end_time,
    ...(input.shoot_type ? { shoot_type: input.shoot_type } : {}),
    notes: input.notes?.trim() || null,
  }).eq('id', shootId)
  if (error) return { success: false, error: error.message }

  if (shoot?.source_content_item_id) {
    await admin.from('content_items')
      .update({ client_name: input.client.trim(), updated_at: new Date().toISOString() })
      .eq('id', shoot.source_content_item_id)
  }

  revalidatePath('/admin/shoots')
  revalidatePath('/member/shoots')
  revalidatePath('/admin/media-tracker')
  revalidatePath('/member/media-tracker')
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
  revalidatePath('/admin/media-tracker')
  revalidatePath('/member/media-tracker')
  return { success: true }
}

// Spins a real shoot off an Ads Video item that's still in Scripting — e.g. the client
// wants to speak the script on camera instead of using a recorded voice-over, so there's
// no need to record one at all. The linked content_item stays at "scripting" until this
// shoot is actually completed (see completeShootWithTitles/updateShootStatus), so nothing
// lands in Ready to Edit with no footage yet.
export async function moveScriptToShoot(
  input: MoveScriptToShootInput
): Promise<{ success: boolean; error?: string; shootId?: string }> {
  const parsed = moveScriptToShootSchema.safeParse(input)
  if (!parsed.success) return { success: false, error: parsed.error.issues[0].message }

  const supabase = await createServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { success: false, error: 'Not authenticated' }

  const admin = adminSupabase()
  const { data: item } = await admin.from('content_items')
    .select('id, company_id, client_name, title, status')
    .eq('id', parsed.data.content_item_id)
    .single()
  if (!item) return { success: false, error: 'Content item not found' }
  if (item.status !== 'scripting') return { success: false, error: 'Only items in Scripting can be moved to a shoot' }

  const start_time = `${parsed.data.shot_date}T${parsed.data.shot_time_from}:00+05:30`
  const end_time = `${parsed.data.shot_date}T${parsed.data.shot_time_to}:00+05:30`
  if (start_time >= end_time) return { success: false, error: 'To time must be after From time' }

  const { data: shoot, error } = await admin.from('shoots').insert({
    company_id: item.company_id,
    title: item.title,
    client: item.client_name,
    location: '',
    start_time,
    end_time,
    source_content_item_id: item.id,
    notes: parsed.data.notes?.trim() || null,
    created_by: user.id,
    status: 'scheduled',
  }).select('id').single()
  if (error) return { success: false, error: error.message }

  revalidatePath('/admin/shoots')
  revalidatePath('/member/shoots')
  revalidatePath('/admin/media-tracker')
  revalidatePath('/member/media-tracker')
  return { success: true, shootId: shoot.id }
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
