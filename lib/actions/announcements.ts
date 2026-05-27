'use server'

import { createServerClient } from '@/lib/supabase/server'
import { createClient } from '@supabase/supabase-js'
import { revalidatePath } from 'next/cache'
import { z } from 'zod'
import { insertManyNotifications } from './notifications'
import { sendWhatsAppTemplate, formatPhone } from '@/lib/whatsapp'

const schema = z.object({
  title: z.string().min(1, 'Title required').max(120),
  message: z.string().min(1, 'Message required'),
  pinned: z.boolean().default(false),
  category: z.enum(['General', 'Policy', 'Events', 'Urgent']).default('General'),
})

function adminSupabase() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  )
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
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'Not authenticated' }

  const admin = adminSupabase()
  const { data: profile } = await admin.from('users').select('company_id').eq('id', user.id).single()
  if (!profile?.company_id) return { error: 'Company not found' }

  const companyId = profile.company_id as string
  const row = { company_id: companyId, title: parsed.data.title, message: parsed.data.message, pinned: parsed.data.pinned, category: parsed.data.category, created_by: user.id }
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { error } = await admin.from('announcements').insert(row as any)

  if (error) return { error: error.message }

  const { data: companyUsers } = await admin.from('users').select('id, phone, role').eq('company_id', companyId)
  if (companyUsers) {
    await insertManyNotifications(companyUsers.map(u => ({
      companyId: companyId,
      userId: u.id,
      type: 'announcement',
      title: parsed.data.title,
      body: parsed.data.message.slice(0, 120),
      link: '/member/announcements',
    })))

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
  const admin = adminSupabase()
  const { error } = await admin.from('announcements').delete().eq('id', id)
  if (error) return { success: false, error: error.message }
  revalidatePath('/admin/announcements')
  revalidatePath('/member/announcements')
  return { success: true }
}

export async function togglePin(id: string, pinned: boolean): Promise<{ success: boolean; error?: string }> {
  const supabase = await createServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { success: false, error: 'Not authenticated' }
  const admin = adminSupabase()
  const { error } = await admin.from('announcements').update({ pinned }).eq('id', id)
  if (error) return { success: false, error: error.message }
  revalidatePath('/admin/announcements')
  revalidatePath('/member/announcements')
  return { success: true }
}
