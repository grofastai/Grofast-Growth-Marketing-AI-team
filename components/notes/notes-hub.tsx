'use client'
import { useState, useMemo, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { Plus, Search, CalendarDays, Sparkles, BookOpen, FolderOpen } from 'lucide-react'
import { FolderSidebar } from './folder-sidebar'
import { NotesList } from './notes-list'
import { NoteEditor } from './note-editor'
import { SharePopup } from './share-popup'
import { CalendarView } from './calendar-view'
import { filterNotes, type HubView, type FilterNote } from '@/lib/notes/filter'
import { canEditNote } from '@/lib/notes/access'
import { createNote, updateNote, createFolder, deleteNote, deleteFolder } from '@/lib/actions/notes'
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
  const [calendar, setCalendar] = useState(false)
  const [saving, setSaving] = useState(false)

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

  const handleSave = useCallback(async (p: { title: string; body: unknown; scope: NoteScope; folder_id: string | null }) => {
    setSaving(true)
    try {
      const input = {
        title: p.title, content: '', body: p.body, scope: p.scope, folder_id: p.folder_id,
        note_type: 'text' as const, items: [], labels: [],
      }
      if (active) {
        const r = await updateNote(active.id, input)
        if (!r.success) { alert(r.error ?? 'Save failed'); return }
      } else {
        const r = await createNote(input)
        if (r.success && r.id) {
          setActiveId(r.id)
          setCreating(false)
        } else {
          alert(r.error ?? 'Could not create note')
          return
        }
      }
      router.refresh()
    } finally {
      setSaving(false)
    }
  }, [active, router])

  const handleNew = () => { setCreating(true); setActiveId(null) }
  const handleSelect = (id: string) => { setCreating(false); setActiveId(id) }

  const handleNewFolder = async (name: string, scope: NoteScope) => {
    await createFolder({ name, scope })
    router.refresh()
  }
  const handleDeleteNote = async (id: string) => {
    await deleteNote(id)
    if (activeId === id) { setActiveId(null); setCreating(false) }
    router.refresh()
  }
  const handleDeleteFolder = async (id: string) => {
    await deleteFolder(id)
    if (folderId === id) setFolderId(null)
    router.refresh()
  }

  return (
    <div style={{ height: '100vh', display: 'flex', flexDirection: 'column', background: '#F8F9FC' }}>
      {/* ── HERO HEADER ─────────────────────────────────────────────────── */}
      <div style={{ flexShrink: 0, margin: '16px 16px 0', borderRadius: 20, overflow: 'hidden', background: 'linear-gradient(135deg, #de1a1a 0%, #991B1B 50%, #7F1D1D 100%)', boxShadow: '0 8px 32px rgba(222,26,26,0.35)', position: 'relative' }}>
        <div style={{ position: 'absolute', top: -40, right: -40, width: 180, height: 180, borderRadius: '50%', background: 'rgba(255,255,255,0.06)' }} />
        <div style={{ position: 'absolute', bottom: -20, right: 160, width: 100, height: 100, borderRadius: '50%', background: 'rgba(255,255,255,0.04)' }} />
        <div style={{ padding: '20px 24px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 16, position: 'relative', zIndex: 1 }}>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 6 }}>
              <div style={{ background: 'rgba(255,255,255,0.2)', borderRadius: 10, padding: '5px 7px', display: 'flex', alignItems: 'center' }}>
                <Sparkles size={14} style={{ color: '#FFD700' }} />
              </div>
              <span style={{ fontSize: 10, fontWeight: 700, color: 'rgba(255,255,255,0.7)', textTransform: 'uppercase', letterSpacing: '0.15em' }}>Admin Dashboard</span>
            </div>
            <h1 style={{ fontSize: 28, fontWeight: 900, color: '#FFFFFF', margin: '0 0 4px', fontFamily: 'var(--font-jakarta)', lineHeight: 1 }}>Notes</h1>
            <p style={{ fontSize: 13, color: 'rgba(255,255,255,0.65)', margin: 0 }}>Create, organize and collaborate on company knowledge</p>
            <div style={{ display: 'flex', gap: 10, marginTop: 12, flexWrap: 'wrap' }}>
              {[
                { icon: <BookOpen size={11} />, label: `${initialNotes.length} Notes` },
                { icon: <FolderOpen size={11} />, label: `${folders.length} Folders` },
              ].map(s => (
                <div key={s.label} style={{ display: 'flex', alignItems: 'center', gap: 5, background: 'rgba(255,255,255,0.15)', borderRadius: 20, padding: '3px 10px' }}>
                  <span style={{ color: 'rgba(255,255,255,0.8)' }}>{s.icon}</span>
                  <span style={{ fontSize: 10, fontWeight: 700, color: '#FFFFFF' }}>{s.label}</span>
                </div>
              ))}
            </div>
          </div>
          <div style={{ width: 40, height: 40, borderRadius: 12, background: 'rgba(255,255,255,0.2)', border: '2px solid rgba(255,255,255,0.3)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
            <BookOpen size={18} style={{ color: '#FFFFFF' }} />
          </div>
        </div>
      </div>
      {/* Search + action bar */}
      <div style={{ padding: '12px 20px', borderBottom: '1px solid #F1F1F4', display: 'flex', alignItems: 'center', gap: 16, background: '#fff', flexShrink: 0 }}>
        <div style={{ flex: 1, minWidth: 0 }} />
        <div style={{ position: 'relative' }}>
          <Search size={14} style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', color: '#9CA3AF' }} />
          <input value={q} onChange={e => setQ(e.target.value)} placeholder="Search notes..."
            style={{ padding: '8px 12px 8px 30px', borderRadius: 10, border: '1px solid #E5E7EB', fontSize: 13, width: 240 }} />
        </div>
        <button onClick={() => setCalendar(c => !c)} title="Calendar"
          style={{ background: calendar ? '#DE1A1A' : '#F3F4F6', color: calendar ? '#fff' : '#374151', border: 'none', borderRadius: 10, padding: '9px 12px', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 6, fontWeight: 600 }}>
          <CalendarDays size={15}/> Calendar
        </button>
        <button onClick={handleNew}
          style={{ background: '#DE1A1A', color: '#fff', border: 'none', borderRadius: 10, padding: '9px 16px', fontWeight: 700, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 6 }}>
          <Plus size={15}/> New Note
        </button>
      </div>
      <div style={{ flex: 1, display: 'flex', minHeight: 0 }}>
        <FolderSidebar folders={folders} view={view} activeFolderId={folderId}
          onView={v => { setView(v); setFolderId(null) }} onFolder={id => { setFolderId(id); setView('all') }}
          onNewFolder={handleNewFolder} onDeleteFolder={handleDeleteFolder} isAdmin={isAdmin} />
        {calendar ? (
          <CalendarView notes={visible} onSelect={id => { setCalendar(false); handleSelect(id) }} />
        ) : (
          <>
            <NotesList notes={visible} folders={folders} activeId={creating ? null : activeId} sort={sort} onSort={setSort} onSelect={handleSelect} onDelete={handleDeleteNote} />
            <NoteEditor key={active?.id ?? (creating ? 'new' : 'none')}
              note={active ?? (creating ? EMPTY_NOTE : null)} folders={folders} canEdit={canEdit} isAdmin={isAdmin}
              teamMembers={teamMembers} onSave={handleSave} onShare={() => active && setSharing(active.id)} saving={saving} />
          </>
        )}
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
