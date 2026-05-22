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

export interface NoteRow {
  id: string
  title: string | null
  content: string
  color: string
  pinned: boolean
  reminder_at: string | null
  reminded: boolean
  created_at: string
  updated_at: string
}

export interface NoteInput {
  title?: string
  content: string
  color?: string
  pinned?: boolean
  reminder_at?: string | null
}

export async function getNotes(): Promise<NoteRow[]> {
  const supabase = await createServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return []

  const { data } = await supabase
    .from('notes')
    .select('id, title, content, color, pinned, reminder_at, reminded, created_at, updated_at')
    .eq('user_id', user.id)
    .order('pinned', { ascending: false })
    .order('created_at', { ascending: false })

  return (data ?? []) as NoteRow[]
}

export async function createNote(
  input: NoteInput
): Promise<{ success: boolean; id?: string; error?: string }> {
  if (!input.content?.trim()) return { success: false, error: 'Note content is required' }

  const supabase = await createServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { success: false, error: 'Not authenticated' }

  const admin = adminSupabase()
  const { data: profile } = await admin
    .from('users')
    .select('company_id')
    .eq('id', user.id)
    .single()
  if (!profile?.company_id) return { success: false, error: 'Profile not found' }

  const { data, error } = await admin.from('notes').insert({
    company_id:  profile.company_id,
    user_id:     user.id,
    title:       input.title?.trim() || null,
    content:     input.content.trim(),
    color:       input.color ?? '#FFFFFF',
    pinned:      input.pinned ?? false,
    reminder_at: input.reminder_at ?? null,
  }).select('id').single()

  if (error) return { success: false, error: error.message }

  revalidatePath('/member/notes')
  return { success: true, id: data.id }
}

export async function updateNote(
  id: string,
  input: NoteInput
): Promise<{ success: boolean; error?: string }> {
  if (!input.content?.trim()) return { success: false, error: 'Note content is required' }

  const supabase = await createServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { success: false, error: 'Not authenticated' }

  const admin = adminSupabase()
  const { error } = await admin.from('notes').update({
    title:       input.title?.trim() || null,
    content:     input.content.trim(),
    color:       input.color ?? '#FFFFFF',
    pinned:      input.pinned ?? false,
    reminder_at: input.reminder_at ?? null,
    reminded:    input.reminder_at ? false : false,
    updated_at:  new Date().toISOString(),
  }).eq('id', id).eq('user_id', user.id)

  if (error) return { success: false, error: error.message }

  revalidatePath('/member/notes')
  return { success: true }
}

export async function deleteNote(id: string): Promise<{ success: boolean; error?: string }> {
  const supabase = await createServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { success: false, error: 'Not authenticated' }

  const admin = adminSupabase()
  const { error } = await admin.from('notes').delete().eq('id', id).eq('user_id', user.id)

  if (error) return { success: false, error: error.message }

  revalidatePath('/member/notes')
  return { success: true }
}

export async function togglePin(
  id: string,
  pinned: boolean
): Promise<{ success: boolean; error?: string }> {
  const supabase = await createServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { success: false, error: 'Not authenticated' }

  const admin = adminSupabase()
  const { error } = await admin.from('notes').update({ pinned, updated_at: new Date().toISOString() })
    .eq('id', id).eq('user_id', user.id)

  if (error) return { success: false, error: error.message }

  revalidatePath('/member/notes')
  return { success: true }
}
