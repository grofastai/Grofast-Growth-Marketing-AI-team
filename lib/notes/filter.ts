export type HubView = 'all' | 'mine' | 'team' | 'sop' | 'shared'
export type FilterNote = {
  id: string; user_id: string; scope: 'private' | 'team' | 'sop'; shared?: boolean
  folder_id: string | null; title: string | null; content: string; labels: string[]
}

export function filterNotes(
  notes: FilterNote[],
  opts: { view: HubView; viewerId: string; folderId?: string | null; q?: string; folderName?: (id: string | null) => string },
): FilterNote[] {
  const { view, viewerId, folderId, q, folderName } = opts
  let out = notes.filter(n => {
    switch (view) {
      case 'mine':   return n.user_id === viewerId && n.scope === 'private'
      case 'team':   return n.scope === 'team'
      case 'sop':    return n.scope === 'sop'
      case 'shared': return !!n.shared
      default:       return true // all
    }
  })
  if (folderId !== undefined && folderId !== null) out = out.filter(n => n.folder_id === folderId)
  if (q && q.trim()) {
    const needle = q.trim().toLowerCase()
    out = out.filter(n =>
      (n.title ?? '').toLowerCase().includes(needle) ||
      n.content.toLowerCase().includes(needle) ||
      n.labels.some(l => l.toLowerCase().includes(needle)) ||
      (folderName?.(n.folder_id) ?? '').toLowerCase().includes(needle))
  }
  return out
}
