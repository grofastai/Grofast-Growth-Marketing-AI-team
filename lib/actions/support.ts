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

async function getProfile() {
  const supabase = await createServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return null
  const admin = adminSupabase()
  const { data } = await admin.from('users').select('id, company_id, name, role').eq('id', user.id).single()
  return data
}

export async function createTicket(input: {
  title: string
  category: string
  description: string
  priority: string
}): Promise<{ success: boolean; error?: string }> {
  const profile = await getProfile()
  if (!profile) return { success: false, error: 'Not authenticated' }

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

  const admin = adminSupabase()
  const { error } = await admin.from('support_responses').insert({
    ticket_id:      input.ticket_id,
    responder_id:   profile.id,
    responder_name: profile.name,
    message:        input.message.trim(),
  })

  if (error) return { success: false, error: error.message }

  await admin
    .from('support_tickets')
    .update({ updated_at: new Date().toISOString() })
    .eq('id', input.ticket_id)

  revalidatePath('/member/support')
  revalidatePath('/admin/support')
  return { success: true }
}

export async function updateTicketStatus(
  ticket_id: string,
  status: string
): Promise<{ success: boolean; error?: string }> {
  const profile = await getProfile()
  if (!profile || profile.role !== 'ADMIN') return { success: false, error: 'Unauthorized' }

  const admin = adminSupabase()
  const { error } = await admin
    .from('support_tickets')
    .update({ status, updated_at: new Date().toISOString() })
    .eq('id', ticket_id)
    .eq('company_id', profile.company_id)

  if (error) return { success: false, error: error.message }
  revalidatePath('/admin/support')
  revalidatePath('/member/support')
  return { success: true }
}

export async function getTickets(role: 'ADMIN' | 'MEMBER') {
  const profile = await getProfile()
  if (!profile) return []

  const admin = adminSupabase()
  let query = admin
    .from('support_tickets')
    .select(`
      id, title, category, description, status, priority, created_at, updated_at,
      user_id,
      support_responses ( id, responder_name, message, created_at )
    `)
    .eq('company_id', profile.company_id)
    .order('updated_at', { ascending: false })

  if (role === 'MEMBER') {
    query = query.eq('user_id', profile.id)
  }

  const { data } = await query
  return data ?? []
}

export async function getMemberName(user_id: string): Promise<string> {
  const admin = adminSupabase()
  const { data } = await admin.from('users').select('name').eq('id', user_id).single()
  return data?.name ?? 'Unknown'
}
