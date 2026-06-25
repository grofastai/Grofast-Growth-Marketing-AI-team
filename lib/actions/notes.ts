'use server'

import { createServerClient } from '@/lib/supabase/server'
import { createClient } from '@supabase/supabase-js'
import { revalidatePath } from 'next/cache'
import { getEffectiveUserId } from './impersonate'
import { extractPlainText } from '@/lib/notes/tiptap-text'
import { canEditNote } from '@/lib/notes/access'
import { extractMentionIds } from '@/lib/notes/mentions'
import { indexShares, noteShareState } from '@/lib/notes/shares'
import { insertManyNotifications } from '@/lib/actions/notifications'

export type NoteScope = 'private' | 'team' | 'sop'

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
  scope:                NoteScope
  folder_id:            string | null
  body:                 unknown
  created_by:           string | null
  user_id:              string
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
  scope?:                NoteScope
  folder_id?:            string | null
  body?:                 unknown
}

export interface FolderRow {
  id:         string
  company_id: string
  name:       string
  icon:       string | null
  parent_id:  string | null
  scope:      NoteScope
  owner_id:   string | null
  position:   number
  count:      number
}

export interface HubNoteRow extends NoteRow {
  shared:   boolean
  can_edit: boolean
}

async function getViewer() {
  const supabase = await createServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return null
  const admin = adminSupabase()
  const { data: profile } = await admin.from('users').select('company_id, role').eq('id', user.id).single()
  if (!profile?.company_id) return null
  return { id: user.id, companyId: profile.company_id as string, role: profile.role as 'ADMIN' | 'MEMBER' }
}

export async function getNotes(archived = false): Promise<NoteRow[]> {
  const uid = await getEffectiveUserId()
  if (!uid) return []

  const admin = adminSupabase()
  const { data } = await admin
    .from('notes')
    .select('id, title, content, color, pinned, reminder_at, reminded, reminder_recipients, reminder_message, note_type, items, labels, archived, scope, folder_id, body, created_by, user_id, created_at, updated_at')
    .eq('user_id', uid)
    .eq('archived', archived)
    .order('pinned', { ascending: false })
    .order('created_at', { ascending: false })

  return (data ?? []) as NoteRow[]
}

export async function getFolders(): Promise<FolderRow[]> {
  const v = await getViewer()
  if (!v) return []
  const admin = adminSupabase()
  const { data: folders } = await admin
    .from('note_folders')
    .select('id, company_id, name, icon, parent_id, scope, owner_id, position')
    .eq('company_id', v.companyId)
    .or(`owner_id.is.null,owner_id.eq.${v.id}`)
    .order('position')
  const { data: notes } = await admin
    .from('notes').select('folder_id').eq('company_id', v.companyId).eq('archived', false)
  const counts = new Map<string, number>()
  for (const n of notes ?? []) if (n.folder_id) counts.set(n.folder_id, (counts.get(n.folder_id) ?? 0) + 1)
  return (folders ?? []).map(f => ({ ...f, count: counts.get(f.id) ?? 0 })) as FolderRow[]
}

export async function createFolder(
  input: { name: string; icon?: string; parentId?: string | null; scope: NoteScope },
): Promise<{ success: boolean; id?: string; error?: string }> {
  const v = await getViewer()
  if (!v) return { success: false, error: 'Not authenticated' }
  if (input.scope === 'sop' && v.role !== 'ADMIN') return { success: false, error: 'Only admins can create SOP folders' }
  if (!input.name.trim()) return { success: false, error: 'Folder name required' }
  const admin = adminSupabase()
  const { data, error } = await admin.from('note_folders').insert({
    company_id: v.companyId, name: input.name.trim(), icon: input.icon ?? '📁',
    parent_id: input.parentId ?? null, scope: input.scope,
    owner_id: input.scope === 'private' ? v.id : null,
  }).select('id').single()
  if (error) return { success: false, error: error.message }
  revalidatePath('/member/notes'); revalidatePath('/admin/notes')
  return { success: true, id: data.id }
}

export async function renameFolder(id: string, name: string): Promise<{ success: boolean; error?: string }> {
  const v = await getViewer()
  if (!v) return { success: false, error: 'Not authenticated' }
  if (!name.trim()) return { success: false, error: 'Name required' }
  const admin = adminSupabase()
  const { error } = await admin.from('note_folders').update({ name: name.trim() })
    .eq('id', id).eq('company_id', v.companyId)
  if (error) return { success: false, error: error.message }
  revalidatePath('/member/notes'); revalidatePath('/admin/notes')
  return { success: true }
}

export async function deleteFolder(id: string): Promise<{ success: boolean; error?: string }> {
  const v = await getViewer()
  if (!v) return { success: false, error: 'Not authenticated' }
  const admin = adminSupabase()
  // notes.folder_id ON DELETE SET NULL handles detachment
  const { error } = await admin.from('note_folders').delete().eq('id', id).eq('company_id', v.companyId)
  if (error) return { success: false, error: error.message }
  revalidatePath('/member/notes'); revalidatePath('/admin/notes')
  return { success: true }
}

export async function getHubNotes(): Promise<HubNoteRow[]> {
  const v = await getViewer()
  if (!v) return []
  const admin = adminSupabase()

  const { data: shareRows } = await admin
    .from('note_shares').select('note_id, permission').eq('shared_with', v.id)
  const shareMap = indexShares((shareRows ?? []) as { note_id: string; permission: 'view' | 'edit' }[])
  const sharedIds = [...shareMap.keys()]

  const cols = 'id, title, content, color, pinned, reminder_at, reminded, reminder_recipients, reminder_message, note_type, items, labels, archived, scope, folder_id, body, created_by, user_id, created_at, updated_at'
  // Visible: team/sop in my company, my own private notes, or notes shared with me.
  const visibleFilter = `scope.in.(team,sop),and(scope.eq.private,user_id.eq.${v.id})`
    + (sharedIds.length ? `,id.in.(${sharedIds.join(',')})` : '')

  const { data: rows } = await admin
    .from('notes').select(cols)
    .eq('company_id', v.companyId)
    .eq('archived', false)
    .or(visibleFilter)
    .order('pinned', { ascending: false })
    .order('updated_at', { ascending: false })

  return (rows ?? []).map(r => {
    const state = noteShareState({ id: r.id, user_id: r.user_id, scope: r.scope }, shareMap, { id: v.id, role: v.role })
    return { ...r, ...state }
  }) as HubNoteRow[]
}

export async function getNoteShares(noteId: string): Promise<{ shared_with: string; permission: 'view' | 'edit' }[]> {
  const v = await getViewer()
  if (!v) return []
  const admin = adminSupabase()
  const { data } = await admin.from('note_shares')
    .select('shared_with, permission').eq('note_id', noteId).eq('company_id', v.companyId)
  return (data ?? []) as { shared_with: string; permission: 'view' | 'edit' }[]
}

export async function shareNote(
  noteId: string, userIds: string[], permission: 'view' | 'edit',
): Promise<{ success: boolean; error?: string }> {
  const v = await getViewer()
  if (!v) return { success: false, error: 'Not authenticated' }
  if (!userIds.length) return { success: true }
  const admin = adminSupabase()

  const { data: note } = await admin.from('notes')
    .select('user_id, scope, company_id, title').eq('id', noteId).single()
  if (!note || note.company_id !== v.companyId) return { success: false, error: 'Note not found' }
  if (!canEditNote({ user_id: note.user_id, scope: note.scope as NoteScope }, { id: v.id, role: v.role })) {
    return { success: false, error: 'Only the owner can share this note' }
  }

  const { error } = await admin.from('note_shares').upsert(
    userIds.map(uid => ({ company_id: v.companyId, note_id: noteId, shared_with: uid, permission, shared_by: v.id })),
    { onConflict: 'note_id,shared_with' },
  )
  if (error) return { success: false, error: error.message }

  await insertManyNotifications(userIds.filter(uid => uid !== v.id).map(uid => ({
    companyId: v.companyId, userId: uid, type: 'note_share',
    title: 'A note was shared with you', body: note.title ?? 'Untitled note',
    link: '/member/notes',
  })))
  revalidatePath('/member/notes'); revalidatePath('/admin/notes')
  return { success: true }
}

export async function unshareNote(noteId: string, userId: string): Promise<{ success: boolean; error?: string }> {
  const v = await getViewer()
  if (!v) return { success: false, error: 'Not authenticated' }
  const admin = adminSupabase()
  const { error } = await admin.from('note_shares')
    .delete().eq('note_id', noteId).eq('shared_with', userId).eq('company_id', v.companyId)
  if (error) return { success: false, error: error.message }
  revalidatePath('/member/notes'); revalidatePath('/admin/notes')
  return { success: true }
}

export async function createNote(
  input: NoteInput
): Promise<{ success: boolean; id?: string; error?: string }> {
  const supabase = await createServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { success: false, error: 'Not authenticated' }

  const admin = adminSupabase()
  const { data: profile } = await admin
    .from('users')
    .select('company_id, role')
    .eq('id', user.id)
    .single()
  if (!profile?.company_id) return { success: false, error: 'Profile not found' }

  const scope = input.scope ?? 'private'
  if (scope === 'sop' && profile.role !== 'ADMIN') return { success: false, error: 'Only admins can create SOP notes' }

  const bodyJson = input.body ?? { type: 'doc', content: [] }
  const derivedContent = input.content?.trim() || extractPlainText(bodyJson as never)
  if (!derivedContent && !input.title?.trim() && input.note_type === 'text') {
    return { success: false, error: 'Note content is required' }
  }

  const { data, error } = await admin.from('notes').insert({
    company_id:           profile.company_id,
    user_id:              user.id,
    created_by:           user.id,
    title:                input.title?.trim() || null,
    content:              derivedContent,
    body:                 bodyJson,
    scope,
    folder_id:            input.folder_id ?? null,
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
  const v = await getViewer()
  if (!v) return { success: false, error: 'Not authenticated' }

  const admin = adminSupabase()
  const { data: existing } = await admin.from('notes')
    .select('user_id, scope, company_id, body').eq('id', id).single()
  if (!existing || existing.company_id !== v.companyId) return { success: false, error: 'Note not found' }

  // A note shared with this viewer at 'edit' grants edit rights.
  const { data: myShare } = await admin.from('note_shares')
    .select('permission').eq('note_id', id).eq('shared_with', v.id).maybeSingle()
  const shareEdit = myShare?.permission === 'edit'

  const targetScope = input.scope ?? (existing.scope as NoteScope)
  if (!canEditNote({ user_id: existing.user_id, scope: existing.scope as NoteScope, shareEdit }, { id: v.id, role: v.role })) {
    return { success: false, error: 'You do not have permission to edit this note' }
  }
  if (targetScope === 'sop' && v.role !== 'ADMIN') return { success: false, error: 'Only admins can edit SOP notes' }

  const bodyJson = input.body ?? existing.body ?? { type: 'doc', content: [] }
  const derivedContent = input.content?.trim() || extractPlainText(bodyJson as never)

  const { error } = await admin.from('notes').update({
    title:               input.title?.trim() || null,
    content:             derivedContent,
    body:                bodyJson,
    scope:               targetScope,
    folder_id:           input.folder_id ?? null,
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
  }).eq('id', id)

  if (error) return { success: false, error: error.message }

  // Notify newly-added mentions (diff against the previous body)
  const prevIds = extractMentionIds(existing.body)
  const newIds = extractMentionIds(bodyJson).filter(mid => !prevIds.includes(mid) && mid !== v.id)
  if (newIds.length) {
    await insertManyNotifications(newIds.map(uid => ({
      companyId: v.companyId, userId: uid, type: 'note_mention',
      title: 'You were mentioned in a note', body: input.title?.trim() || 'Untitled note',
      link: '/member/notes',
    })))
  }

  revalidatePath('/member/notes'); revalidatePath('/admin/notes')
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
