'use client'
import { useState, useTransition, useMemo } from 'react'
import { useRouter } from 'next/navigation'
import { Plus, Search } from 'lucide-react'
import { FolderSidebar } from './folder-sidebar'
import { NotesList } from './notes-list'
import { NoteEditor } from './note-editor'
import { SharePopup } from './share-popup'
import { filterNotes, type HubView, type FilterNote } from '@/lib/notes/filter'
import { canEditNote } from '@/lib/notes/access'
import { createNote, updateNote, createFolder } from '@/lib/actions/notes'
import type { HubNote, Folder, TeamMember, NoteScope } from './types'

export default function NotesHub({ initialNotes, folders, teamMembers, viewer }: {
  initialNotes: HubNote[]; folders: Folder[]; teamMembers: TeamMember[]
  viewer: { id: string; role: 'ADMIN' | 'MEMBER' }
}) {
  const router = useRouter()
  const isAdmin = viewer.role === 'ADMIN'
  const [sharing, setSharing] = useState<string | null>(null)
  const [view, setView] = useState<HubView>('all')
  const [folderId, setFolderId] = useState<string | null>(null)
  const [q, setQ] = useState('')
  const [sort, setSort] = useState<'newest' | 'oldest' | 'edited'>('newest')
  const [activeId, setActiveId] = useState<string | null>(null)
  const [creating, setCreating] = useState(false)
  const [saving, startSave] = useTransition()

  const visible = useMemo(() => {
    const fn = (id: string | null) => folders.find(f => f.id === id)?.name ?? ''
    const result = filterNotes(initialNotes as unknown as FilterNote[],
      { view, viewerId: viewer.id, folderId, q, folderName: fn })
    return result as unknown as HubNote[]
  }, [initialNotes, view, folderId, q, folders, viewer.id])

  const active = creating ? null : (initialNotes.find(n => n.id === activeId) ?? null)
  const canEdit = active
    ? canEditNote({ user_id: active.user_id, scope: active.scope }, viewer)
    : true

  const handleSave = (p: { title: string; body: unknown; scope: NoteScope; folder_id: string | null }) => {
    startSave(async () => {
      const input = {
        title: p.title, content: '', body: p.body, scope: p.scope, folder_id: p.folder_id,
        note_type: 'text' as const, items: [], labels: [],
      }
      if (active) {
        await updateNote(active.id, input)
      } else {
        const r = await createNote(input)
        if (r.success && r.id) { setActiveId(r.id); setCreating(false) }
      }
      router.refresh()
    })
  }
  const handleNew = () => { setCreating(true); setActiveId(null) }
  const handleSelect = (id: string) => { setCreating(false); setActiveId(id) }
  const handleNewFolder = (name: string, scope: NoteScope) =>
    startSave(async () => { await createFolder({ name, scope }); router.refresh() })

  return (
    <div style={{ height: '100vh', display: 'flex', flexDirection: 'column', background: '#F8F9FC' }}>
      <div style={{ padding: '16px 20px', borderBottom: '1px solid #F1F1F4', display: 'flex', alignItems: 'center', gap: 16, background: '#fff' }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          <h1 style={{ fontSize: 22, fontWeight: 900, margin: 0, fontFamily: 'var(--font-jakarta)' }}>📒 Notes</h1>
          <p style={{ fontSize: 12, color: '#9CA3AF', margin: '2px 0 0' }}>Create, organize and collaborate on company knowledge.</p>
        </div>
        <div style={{ position: 'relative' }}>
          <Search size={14} style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', color: '#9CA3AF' }} />
          <input value={q} onChange={e => setQ(e.target.value)} placeholder="Search notes..."
            style={{ padding: '8px 12px 8px 30px', borderRadius: 10, border: '1px solid #E5E7EB', fontSize: 13, width: 240 }} />
        </div>
        <button onClick={handleNew}
          style={{ background: '#DE1A1A', color: '#fff', border: 'none', borderRadius: 10, padding: '9px 16px', fontWeight: 700, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 6 }}>
          <Plus size={15}/> New Note
        </button>
      </div>
      <div style={{ flex: 1, display: 'flex', minHeight: 0 }}>
        <FolderSidebar folders={folders} view={view} activeFolderId={folderId}
          onView={v => { setView(v); setFolderId(null) }} onFolder={id => { setFolderId(id); setView('all') }}
          onNewFolder={handleNewFolder} isAdmin={isAdmin} />
        <NotesList notes={visible} folders={folders} activeId={creating ? null : activeId} sort={sort} onSort={setSort} onSelect={handleSelect} />
        <NoteEditor key={active?.id ?? (creating ? 'new' : 'none')}
          note={active ?? (creating ? EMPTY_NOTE : null)} folders={folders} canEdit={canEdit} isAdmin={isAdmin}
          teamMembers={teamMembers} onSave={handleSave} onShare={() => active && setSharing(active.id)} saving={saving} />
      </div>
      {sharing && <SharePopup noteId={sharing} teamMembers={teamMembers} onClose={() => setSharing(null)} />}
    </div>
  )
}

const EMPTY_NOTE = {
  id: '', title: '', content: '', color: '#FFFFFF', pinned: false,
  reminder_at: null, reminded: false, reminder_recipients: [], reminder_message: null,
  note_type: 'text', items: [], labels: [], archived: false,
  scope: 'private', folder_id: null, body: { type: 'doc', content: [] }, created_by: null,
  user_id: '', created_at: '', updated_at: '', shared: false, can_edit: true,
} as unknown as HubNote
