'use server'

import { createClient } from '@supabase/supabase-js'
import { revalidatePath } from 'next/cache'
import { insertNotification } from '@/lib/actions/notifications'
import { getEffectiveUserId } from '@/lib/actions/impersonate'
import { ticketLimiter, replyLimiter } from '@/lib/ratelimit'
import { cacheGet, cacheSet, cacheDel } from '@/lib/cache'

function adminSupabase() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  )
}

async function getProfile() {
  const uid = await getEffectiveUserId()
  if (!uid) return null
  const admin = adminSupabase()
  const { data } = await admin.from('users').select('id, company_id, name, role, employee_id, is_support_handler').eq('id', uid).single()
  return data
}

function isSupportHandler(profile: { role: string; is_support_handler?: boolean } | null) {
  if (!profile) return false
  return profile.role === 'ADMIN' || profile.is_support_handler === true
}

// All users who should receive support notifications for a company:
// admins plus anyone toggled on as a support handler.
async function getHandlerIds(companyId: string): Promise<string[]> {
  const admin = adminSupabase()
  const { data } = await admin
    .from('users')
    .select('id')
    .eq('company_id', companyId)
    .or('role.eq.ADMIN,is_support_handler.eq.true')
  return (data ?? []).map(u => u.id)
}

export async function createTicket(input: {
  title: string
  category: string
  description: string
  priority: string
  assigned_to?: string
}): Promise<{ success: boolean; error?: string; ticketId?: string }> {
  const profile = await getProfile()
  if (!profile) return { success: false, error: 'Not authenticated' }

  if (ticketLimiter) {
    const { success } = await ticketLimiter.limit(profile.id)
    if (!success) return { success: false, error: 'Too many tickets created recently. Try again in a few minutes.' }
  }

  const admin = adminSupabase()
  const { data: ticket, error } = await admin.from('support_tickets').insert({
    company_id:  profile.company_id,
    user_id:     profile.id,
    title:       input.title.trim(),
    category:    input.category,
    description: input.description.trim(),
    priority:    input.priority,
    ...(input.assigned_to ? { assigned_to: input.assigned_to } : {}),
  }).select('id').single()

  if (error) return { success: false, error: error.message }

  await cacheDel(`tickets:ADMIN:${profile.company_id}`, `tickets:MEMBER:${profile.id}`)

  // Notify every assigned support handler (admins + toggled handlers)
  const handlerIds = await getHandlerIds(profile.company_id)
  await Promise.all(handlerIds
    .filter(id => id !== profile.id)
    .map(id => insertNotification({
      companyId: profile.company_id,
      userId:    id,
      type:      'support_ticket',
      title:     `New support ticket from ${profile.name}`,
      body:      input.title,
      link:      '/member/support',
    })))

  revalidatePath('/member/support')
  revalidatePath('/admin/support')
  return { success: true, ticketId: ticket?.id }
}

export async function addResponse(input: {
  ticket_id: string
  message: string
}): Promise<{ success: boolean; error?: string }> {
  const profile = await getProfile()
  if (!profile) return { success: false, error: 'Not authenticated' }

  if (replyLimiter) {
    const { success } = await replyLimiter.limit(profile.id)
    if (!success) return { success: false, error: 'Too many messages sent. Slow down a bit.' }
  }

  const admin = adminSupabase()
  const { error } = await admin.from('support_responses').insert({
    ticket_id:      input.ticket_id,
    responder_id:   profile.id,
    responder_name: profile.name,
    message:        input.message.trim(),
  })

  if (error) return { success: false, error: error.message }

  // Fetch ticket owner + company to send notification
  const { data: ticket } = await admin
    .from('support_tickets')
    .select('user_id, company_id, title')
    .eq('id', input.ticket_id)
    .single()

  await admin
    .from('support_tickets')
    .update({ updated_at: new Date().toISOString() })
    .eq('id', input.ticket_id)

  if (ticket) await cacheDel(`tickets:ADMIN:${ticket.company_id}`, `tickets:MEMBER:${ticket.user_id}`)

  if (ticket) {
    if (isSupportHandler(profile)) {
      // Support handler (admin or GF003) replied → notify the ticket owner
      await insertNotification({
        companyId: ticket.company_id,
        userId:    ticket.user_id,
        type:      'support_reply',
        title:     `${profile.name} replied on your support ticket`,
        body:      ticket.title,
        link:      '/member/support',
      })
    } else {
      // Member replied → notify every assigned support handler
      const handlerIds = await getHandlerIds(ticket.company_id)
      await Promise.all(handlerIds
        .filter(id => id !== profile.id)
        .map(id => insertNotification({
          companyId: ticket.company_id,
          userId:    id,
          type:      'support_reply',
          title:     `${profile.name} replied on their support ticket`,
          body:      ticket.title,
          link:      '/member/support',
        })))
    }
  }

  revalidatePath('/member/support')
  revalidatePath('/admin/support')
  return { success: true }
}

// Pull `[img]<url>` attachment lines back out of a stored message body —
// mirrors components/support/thread-ui.tsx's bodyParts() but kept local
// since that file is a 'use client' component and shouldn't be imported here.
function imageUrlsIn(message: string): string[] {
  return message.split('\n').filter(l => l.startsWith('[img]')).map(l => l.slice(5))
}

function storagePathFromUrl(url: string): string | null {
  const marker = '/support-attachments/'
  const idx = url.indexOf(marker)
  return idx === -1 ? null : decodeURIComponent(url.slice(idx + marker.length))
}

// When a message/description is edited (e.g. the "×" on a photo removed it),
// any image URL that no longer appears in the new body is now orphaned in
// storage — clean those up rather than leaking them.
async function removeDroppedImages(admin: ReturnType<typeof adminSupabase>, oldMessage: string, newMessage: string) {
  const before = new Set(imageUrlsIn(oldMessage))
  const after = new Set(imageUrlsIn(newMessage))
  const dropped = [...before].filter(u => !after.has(u))
  const paths = dropped.map(storagePathFromUrl).filter((p): p is string => !!p)
  if (paths.length) await admin.storage.from('support-attachments').remove(paths)
}

export async function editResponse(input: {
  response_id: string
  message: string
}): Promise<{ success: boolean; error?: string }> {
  const profile = await getProfile()
  if (!profile) return { success: false, error: 'Not authenticated' }

  const admin = adminSupabase()
  const { data: existing } = await admin
    .from('support_responses')
    .select('id, responder_id, ticket_id, message')
    .eq('id', input.response_id)
    .single()
  if (!existing) return { success: false, error: 'Message not found' }
  if (existing.responder_id !== profile.id) return { success: false, error: 'You can only edit your own messages' }

  const message = input.message.trim()
  if (!message) return { success: false, error: 'Message cannot be empty' }

  await removeDroppedImages(admin, existing.message, message)

  const { error } = await admin
    .from('support_responses')
    .update({ message, edited_at: new Date().toISOString() })
    .eq('id', input.response_id)
  if (error) return { success: false, error: error.message }

  const { data: ticket } = await admin
    .from('support_tickets')
    .select('user_id, company_id')
    .eq('id', existing.ticket_id)
    .single()
  if (ticket) await cacheDel(`tickets:ADMIN:${ticket.company_id}`, `tickets:MEMBER:${ticket.user_id}`)

  revalidatePath('/member/support')
  revalidatePath('/admin/support')
  return { success: true }
}

export async function deleteResponse(response_id: string): Promise<{ success: boolean; error?: string }> {
  const profile = await getProfile()
  if (!profile) return { success: false, error: 'Not authenticated' }

  const admin = adminSupabase()
  const { data: existing } = await admin
    .from('support_responses')
    .select('id, responder_id, message, ticket_id')
    .eq('id', response_id)
    .single()
  if (!existing) return { success: false, error: 'Message not found' }
  if (existing.responder_id !== profile.id) return { success: false, error: 'You can only delete your own messages' }

  // Clean up any attached image in storage so deleting a message doesn't
  // leave an orphaned file behind.
  const paths = imageUrlsIn(existing.message).map(storagePathFromUrl).filter((p): p is string => !!p)
  if (paths.length) await admin.storage.from('support-attachments').remove(paths)

  const { error } = await admin.from('support_responses').delete().eq('id', response_id)
  if (error) return { success: false, error: error.message }

  const { data: ticket } = await admin
    .from('support_tickets')
    .select('user_id, company_id')
    .eq('id', existing.ticket_id)
    .single()
  if (ticket) await cacheDel(`tickets:ADMIN:${ticket.company_id}`, `tickets:MEMBER:${ticket.user_id}`)

  revalidatePath('/member/support')
  revalidatePath('/admin/support')
  return { success: true }
}

// Edits the ticket's own opening message (title/first bubble in the thread).
// This is a separate record from support_responses, so accidentally-attached
// photos or typos in the very first message need their own edit path — only
// the ticket's owner may touch it.
export async function editTicketDescription(input: {
  ticket_id: string
  message: string
}): Promise<{ success: boolean; error?: string }> {
  const profile = await getProfile()
  if (!profile) return { success: false, error: 'Not authenticated' }

  const admin = adminSupabase()
  const { data: ticket } = await admin
    .from('support_tickets')
    .select('id, user_id, company_id, description')
    .eq('id', input.ticket_id)
    .single()
  if (!ticket) return { success: false, error: 'Request not found' }
  if (ticket.user_id !== profile.id) return { success: false, error: 'You can only edit your own request' }

  const message = input.message.trim()
  if (!message) return { success: false, error: 'Description cannot be empty' }

  await removeDroppedImages(admin, ticket.description, message)

  const { error } = await admin
    .from('support_tickets')
    .update({ description: message })
    .eq('id', input.ticket_id)
  if (error) return { success: false, error: error.message }

  await cacheDel(`tickets:ADMIN:${ticket.company_id}`, `tickets:MEMBER:${ticket.user_id}`)
  revalidatePath('/member/support')
  revalidatePath('/admin/support')
  return { success: true }
}

export async function updateTicketStatus(
  ticket_id: string,
  status: string
): Promise<{ success: boolean; error?: string }> {
  const profile = await getProfile()
  if (!isSupportHandler(profile)) return { success: false, error: 'Unauthorized' }

  const admin = adminSupabase()
  const { error } = await admin
    .from('support_tickets')
    .update({ status, updated_at: new Date().toISOString() })
    .eq('id', ticket_id)
    .eq('company_id', profile!.company_id)

  if (error) return { success: false, error: error.message }
  await cacheDel(`tickets:ADMIN:${profile!.company_id}`)
  revalidatePath('/admin/support')
  revalidatePath('/member/support')
  return { success: true }
}

export async function getTickets(role: 'ADMIN' | 'MEMBER') {
  const profile = await getProfile()
  if (!profile) return []

  const cacheKey = role === 'ADMIN'
    ? `tickets:ADMIN:${profile.company_id}`
    : `tickets:MEMBER:${profile.id}`

  const cached = await cacheGet<unknown[]>(cacheKey)
  if (cached) return cached

  const admin = adminSupabase()
  let query = admin
    .from('support_tickets')
    .select(`
      id, title, category, description, status, priority, assigned_to, created_at, updated_at,
      user_id,
      support_responses ( id, responder_id, responder_name, message, created_at, edited_at )
    `)
    .eq('company_id', profile.company_id)
    .order('updated_at', { ascending: false })

  if (role === 'MEMBER') {
    query = query.eq('user_id', profile.id)
  }

  const { data } = await query
  const rows = data ?? []

  // Attach requester/assignee display info directly — the thread used to fall back to
  // "Member" whenever the requester hadn't posted a reply yet (name was only ever derived
  // from their own support_responses row, which doesn't exist until they reply).
  const userIds = new Set<string>()
  for (const t of rows) {
    userIds.add(t.user_id as string)
    if (t.assigned_to) userIds.add(t.assigned_to as string)
  }
  const { data: userRows } = userIds.size > 0
    ? await admin.from('users').select('id, name, photo_url, employee_id').in('id', Array.from(userIds))
    : { data: [] }
  const userMap = new Map((userRows ?? []).map(u => [u.id, u]))

  const enriched = rows.map(t => ({
    ...t,
    requester: userMap.get(t.user_id as string) ?? null,
    assignee: t.assigned_to ? (userMap.get(t.assigned_to as string) ?? null) : null,
  }))

  await cacheSet(cacheKey, enriched, 30)
  return enriched
}

export async function getMemberName(user_id: string): Promise<string> {
  const admin = adminSupabase()
  const { data } = await admin.from('users').select('name').eq('id', user_id).single()
  return data?.name ?? 'Unknown'
}

export async function getCurrentUser() {
  return getProfile()
}

// Admin-only: members who can be made support handlers, with their current flag.
export async function getSupportHandlerCandidates(): Promise<
  { id: string; name: string; employee_id: string | null; is_support_handler: boolean }[]
> {
  const profile = await getProfile()
  if (!profile || profile.role !== 'ADMIN') return []
  const admin = adminSupabase()
  const { data } = await admin
    .from('users')
    .select('id, name, employee_id, is_support_handler')
    .eq('company_id', profile.company_id)
    .neq('role', 'ADMIN')
    .neq('role', 'FREELANCER')
    .eq('status', 'active')
    .is('deleted_at', null)
    .order('name')
  return (data ?? []).map(u => ({ ...u, is_support_handler: !!u.is_support_handler }))
}

// Admin-only: toggle whether a member is a support handler. A handler sees the
// Support Inbox workspace; everyone else sees the member Support chat.
export async function setSupportHandler(
  user_id: string,
  enabled: boolean
): Promise<{ success: boolean; error?: string }> {
  const profile = await getProfile()
  if (!profile || profile.role !== 'ADMIN') return { success: false, error: 'Unauthorized' }

  const admin = adminSupabase()
  const { error } = await admin
    .from('users')
    .update({ is_support_handler: enabled })
    .eq('id', user_id)
    .eq('company_id', profile.company_id)

  if (error) return { success: false, error: error.message }
  revalidatePath('/admin/team')
  revalidatePath('/member/support')
  return { success: true }
}

export async function closeTicket(ticket_id: string): Promise<{ success: boolean; error?: string }> {
  const profile = await getProfile()
  if (!profile) return { success: false, error: 'Not authenticated' }

  const admin = adminSupabase()
  let query = admin
    .from('support_tickets')
    .update({ status: 'closed', updated_at: new Date().toISOString() })
    .eq('id', ticket_id)
    .eq('company_id', profile.company_id)

  if (!isSupportHandler(profile)) {
    query = query.eq('user_id', profile.id)
  }

  const { error } = await query
  if (error) return { success: false, error: error.message }

  await cacheDel(`tickets:ADMIN:${profile.company_id}`, `tickets:MEMBER:${profile.id}`)
  revalidatePath('/member/support')
  revalidatePath('/admin/support')
  return { success: true }
}
