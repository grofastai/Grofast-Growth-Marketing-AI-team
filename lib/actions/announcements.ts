'use server'

import { createServerClient } from '@/lib/supabase/server'
import { revalidatePath } from 'next/cache'
import { z } from 'zod'
import { insertNotification } from './notifications'
import { sendWhatsAppTemplate, formatPhone } from '@/lib/whatsapp'

const schema = z.object({
  title: z.string().min(1, 'Title required').max(120),
  message: z.string().min(1, 'Message required'),
  pinned: z.boolean().default(false),
  category: z.enum(['General', 'Policy', 'Events', 'Urgent']).default('General'),
})

function parseJwt(token: string) {
  try { return JSON.parse(atob(token.split('.')[1])) } catch { return null }
}

export async function createAnnouncement(
  _prev: { error: string } | { success: true } | null,
  formData: FormData
): Promise<{ error: string } | { success: true }> {
  const raw = {
    title: formData.get('title') as string,
    message: formData.get('message') as string,
    pinned: formData.get('pinned') === 'true',
    category: (formData.get('category') as string) || 'General',
  }

  const parsed = schema.safeParse(raw)
  if (!parsed.success) return { error: parsed.error.issues[0].message }

  const supabase = await createServerClient()
  const { data: { session } } = await supabase.auth.getSession()
  if (!session) return { error: 'Not authenticated' }

  const claims = parseJwt(session.access_token)
  if (!claims?.company_id) return { error: 'Missing company claim — re-login' }

  const row = { company_id: claims.company_id, title: parsed.data.title, message: parsed.data.message, pinned: parsed.data.pinned, category: parsed.data.category, created_by: session.user.id }
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { error } = await supabase.from('announcements').insert(row as any)

  if (error) return { error: error.message }

  const { data: companyUsers } = await supabase.from('users').select('id, phone, role').eq('company_id', claims.company_id)
  if (companyUsers) {
    await Promise.all(companyUsers.map(u =>
      insertNotification({
        companyId: claims.company_id,
        userId: u.id,
        type: 'announcement',
        title: parsed.data.title,
        body: parsed.data.message.slice(0, 120),
        link: '/member/announcements',
      })
    ))

    // WhatsApp blast to all members with a phone number
    const messageSnippet = parsed.data.message.slice(0, 100)
    const membersWithPhone = companyUsers.filter((u: any) => u.role === 'MEMBER' && u.phone)
    if (membersWithPhone.length) {
      ;(async () => {
        await Promise.all(membersWithPhone.map((u: any) =>
          sendWhatsAppTemplate(formatPhone(u.phone), 'grofast_announcement', [parsed.data.title, messageSnippet])
        ))
      })().catch(console.error)
    }
  }

  revalidatePath('/admin/announcements')
  revalidatePath('/member/announcements')
  return { success: true }
}

export async function deleteAnnouncement(id: string): Promise<{ success: boolean; error?: string }> {
  const supabase = await createServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { success: false, error: 'Not authenticated' }
  const { error } = await supabase.from('announcements').delete().eq('id', id)
  if (error) return { success: false, error: error.message }
  revalidatePath('/admin/announcements')
  revalidatePath('/member/announcements')
  return { success: true }
}

export async function togglePin(id: string, pinned: boolean): Promise<{ success: boolean; error?: string }> {
  const supabase = await createServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { success: false, error: 'Not authenticated' }
  const { error } = await supabase.from('announcements').update({ pinned }).eq('id', id)
  if (error) return { success: false, error: error.message }
  revalidatePath('/admin/announcements')
  revalidatePath('/member/announcements')
  return { success: true }
}
