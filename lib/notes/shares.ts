import { canEditNote } from './access'

export function indexShares(rows: { note_id: string; permission: 'view' | 'edit' }[]): Map<string, 'view' | 'edit'> {
  const m = new Map<string, 'view' | 'edit'>()
  for (const r of rows) m.set(r.note_id, r.permission)
  return m
}

export function noteShareState(
  note: { id: string; user_id: string; scope: 'private' | 'team' | 'sop' },
  shareMap: Map<string, 'view' | 'edit'>,
  viewer: { id: string; role: 'ADMIN' | 'MEMBER' },
): { shared: boolean; can_edit: boolean } {
  const perm = shareMap.get(note.id)
  const shared = perm !== undefined && note.user_id !== viewer.id
  const can_edit = canEditNote({ user_id: note.user_id, scope: note.scope, shareEdit: perm === 'edit' }, viewer)
  return { shared, can_edit }
}
