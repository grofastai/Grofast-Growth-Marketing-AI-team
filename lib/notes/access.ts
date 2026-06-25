export type Viewer = { id: string; role: 'ADMIN' | 'MEMBER' }
export type NoteAccess = { user_id: string; scope: 'private' | 'team' | 'sop'; shareEdit?: boolean }

export function canEditNote(note: NoteAccess, v: Viewer): boolean {
  if (note.scope === 'sop') return v.role === 'ADMIN'
  if (note.scope === 'team') return note.user_id === v.id || !!note.shareEdit
  return note.user_id === v.id // private
}

export function canReadNote(note: NoteAccess & { shared?: boolean }, v: Viewer): boolean {
  if (note.scope === 'team' || note.scope === 'sop') return true
  return note.user_id === v.id || !!note.shared // private
}
