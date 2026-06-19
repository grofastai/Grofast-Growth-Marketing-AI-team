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

export interface ChecklistItem {
  id:      string
  text:    string
  checked: boolean
}

export interface NoteRow {
  id:                   string
  title:                string | null
  content:              string
  color:                string
  pinned:               boolean
  reminder_at:          string | null
  reminded:             boolean
  reminder_recipients:  string[]
  reminder_message:     string | null
  note_type:            'text' | 'checklist'
  items:                ChecklistItem[]
  labels:               string[]
  archived:             boolean
  created_at:           string
  updated_at:           string
}

export interface NoteInput {
  title?:                string
  content:               string
  color?:                string
  pinned?:               boolean
  reminder_at?:          string | null
  reminder_recipients?:  string[]
  reminder_message?:     string | null
  note_type:             'text' | 'checklist'
  items:                 ChecklistItem[]
  labels:                string[]
}

export async function getNotes(archived = false): Promise<NoteRow[]> {
  const supabase = await createServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return []

  const { data } = await supabase
    .from('notes')
    .select('id, title, content, color, pinned, reminder_at, reminded, reminder_recipients, reminder_message, note_type, items, labels, archived, created_at, updated_at')
    .eq('user_id', user.id)
    .eq('archived', archived)
    .order('pinned', { ascending: false })
    .order('created_at', { ascending: false })

  return (data ?? []) as NoteRow[]
}

export async function createNote(
  input: NoteInput
): Promise<{ success: boolean; id?: string; error?: string }> {
  if (!input.content?.trim() && input.note_type === 'text') return { success: false, error: 'Note content is required' }

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
    company_id:           profile.company_id,
    user_id:              user.id,
    title:                input.title?.trim() || null,
    content:              input.content.trim(),
    color:                input.color ?? '#FFFFFF',
    pinned:               input.pinned ?? false,
    reminder_at:          input.reminder_at ?? null,
    reminder_recipients:  input.reminder_recipients ?? [],
    reminder_message:     input.reminder_message ?? null,
    note_type:            input.note_type ?? 'text',
    items:                input.items ?? [],
    labels:               input.labels ?? [],
    archived:             false,
  }).select('id').single()

  if (error) return { success: false, error: error.message }

  revalidatePath('/member/notes')
  return { success: true, id: data.id }
}

export async function updateNote(
  id: string,
  input: NoteInput
): Promise<{ success: boolean; error?: string }> {
  const supabase = await createServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { success: false, error: 'Not authenticated' }

  const admin = adminSupabase()
  const { error } = await admin.from('notes').update({
    title:               input.title?.trim() || null,
    content:             input.content.trim(),
    color:               input.color ?? '#FFFFFF',
    pinned:              input.pinned ?? false,
    reminder_at:         input.reminder_at ?? null,
    reminded:            false,
    reminder_recipients: input.reminder_recipients ?? [],
    reminder_message:    input.reminder_message ?? null,
    note_type:           input.note_type ?? 'text',
    items:               input.items ?? [],
    labels:              input.labels ?? [],
    updated_at:          new Date().toISOString(),
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
  const { error } = await admin.from('notes')
    .update({ pinned, updated_at: new Date().toISOString() })
    .eq('id', id).eq('user_id', user.id)

  if (error) return { success: false, error: error.message }

  revalidatePath('/member/notes')
  return { success: true }
}

export async function archiveNote(
  id: string,
  archived: boolean
): Promise<{ success: boolean; error?: string }> {
  const supabase = await createServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { success: false, error: 'Not authenticated' }

  const admin = adminSupabase()
  const { error } = await admin.from('notes')
    .update({ archived, updated_at: new Date().toISOString() })
    .eq('id', id)
    .eq('user_id', user.id)

  if (error) return { success: false, error: error.message }
  revalidatePath('/member/notes')
  return { success: true }
}

export async function convertNoteToTask(
  noteId: string,
  taskTitle: string,
  dueDate?: string
): Promise<{ success: boolean; error?: string }> {
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

  const { data: note } = await admin
    .from('notes')
    .select('content')
    .eq('id', noteId)
    .eq('user_id', user.id)
    .single()

  const { error } = await admin.from('tasks').insert({
    company_id:  profile.company_id,
    assigned_to: user.id,
    created_by:  user.id,
    title:       taskTitle.trim(),
    description: note?.content ?? '',
    status:      'todo',
    priority:    'medium',
    due_date:    dueDate || null,
  })

  if (error) return { success: false, error: error.message }
  revalidatePath('/member/tasks')
  return { success: true }
}
