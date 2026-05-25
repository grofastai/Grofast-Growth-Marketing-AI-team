'use server'

import { createServerClient } from '@/lib/supabase/server'
import { createClient } from '@supabase/supabase-js'
import { revalidatePath } from 'next/cache'
import { insertNotification } from '@/lib/actions/notifications'
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
  const supabase = await createServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return null
  const admin = adminSupabase()
  const { data } = await admin.from('users').select('id, company_id, name, role, employee_id').eq('id', user.id).single()
  return data
}

function isSupportHandler(profile: { role: string; employee_id: string } | null) {
  if (!profile) return false
  return profile.role === 'ADMIN' || profile.employee_id?.toUpperCase() === 'GF003'
}

export async function createTicket(input: {
  title: string
  category: string
  description: string
  priority: string
}): Promise<{ success: boolean; error?: string }> {
  const profile = await getProfile()
  if (!profile) return { success: false, error: 'Not authenticated' }

  if (ticketLimiter) {
    const { success } = await ticketLimiter.limit(profile.id)
    if (!success) return { success: false, error: 'Too many tickets created recently. Try again in a few minutes.' }
  }

  const admin = adminSupabase()
  const { error } = await admin.from('support_tickets').insert({
    company_id:  profile.company_id,
    user_id:     profile.id,
    title:       input.title.trim(),
    category:    input.category,
    description: input.description.trim(),
    priority:    input.priority,
  })

  if (error) return { success: false, error: error.message }

  await cacheDel(`tickets:ADMIN:${profile.company_id}`, `tickets:MEMBER:${profile.id}`)

  // Notify Sajetah SK (gf003) — designated support handler
  const { data: handler } = await admin.from('users').select('id').eq('company_id', profile.company_id).eq('employee_id', 'GF003').single()
  if (handler) {
    await insertNotification({
      companyId: profile.company_id,
      userId:    handler.id,
      type:      'support_ticket',
      title:     `New support ticket from ${profile.name}`,
      body:      input.title,
      link:      '/admin/support',
    })
  }

  revalidatePath('/member/support')
  revalidatePath('/admin/support')
  return { success: true }
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
      // Member replied → notify GF003 (designated support handler)
      const { data: handler } = await admin.from('users').select('id').eq('company_id', ticket.company_id).eq('employee_id', 'GF003').single()
      if (handler) {
        await insertNotification({
          companyId: ticket.company_id,
          userId:    handler.id,
          type:      'support_reply',
          title:     `${profile.name} replied on their support ticket`,
          body:      ticket.title,
          link:      '/member/support',
        })
      }
    }
  }

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
      id, title, category, description, status, priority, created_at, updated_at,
      user_id,
      support_responses ( id, responder_id, responder_name, message, created_at )
    `)
    .eq('company_id', profile.company_id)
    .order('updated_at', { ascending: false })

  if (role === 'MEMBER') {
    query = query.eq('user_id', profile.id)
  }

  const { data } = await query
  await cacheSet(cacheKey, data ?? [], 30)
  return data ?? []
}

export async function getMemberName(user_id: string): Promise<string> {
  const admin = adminSupabase()
  const { data } = await admin.from('users').select('name').eq('id', user_id).single()
  return data?.name ?? 'Unknown'
}

export async function getCurrentUser() {
  return getProfile()
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
