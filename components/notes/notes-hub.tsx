'use client'
import { useState, useMemo, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { Plus, Search, CalendarDays, BookOpen, FolderOpen } from 'lucide-react'
import { FolderSidebar } from './folder-sidebar'
import { NotesList } from './notes-list'
import { NoteEditor } from './note-editor'
import { SharePopup } from './share-popup'
import { CalendarView } from './calendar-view'
import { filterNotes, type HubView, type FilterNote } from '@/lib/notes/filter'
import { canEditNote } from '@/lib/notes/access'
import { createNote, updateNote, createFolder, deleteNote, deleteFolder } from '@/lib/actions/notes'
import { useToast } from '@/components/ui/useToast'
import { PageHero } from '@/components/admin/PageHero'
import type { HubNote, Folder, TeamMember, NoteScope } from './types'

export default function NotesHub({ initialNotes, folders, teamMembers, viewer }: {
  initialNotes: HubNote[]; folders: Folder[]; teamMembers: TeamMember[]
  viewer: { id: string; role: 'ADMIN' | 'MEMBER' }
}) {
  const router = useRouter()
  const { toastEl, showToast } = useToast()
  const isAdmin = viewer.role === 'ADMIN'
  const [sharing, setSharing] = useState<string | null>(null)
  const [view, setView] = useState<HubView>('all')
  const [folderId, setFolderId] = useState<string | null>(null)
  const [q, setQ] = useState('')
  const [sort, setSort] = useState<'newest' | 'oldest' | 'edited'>('newest')
  const [activeId, setActiveId] = useState<string | null>(null)
  const [creating, setCreating] = useState(false)
  const [newNoteDate, setNewNoteDate] = useState<string | null>(null)
  const [calendar, setCalendar] = useState(false)
  const [saving, setSaving] = useState(false)
  // Mobile navigation: 'folders' | 'notes' | 'editor'
  const [mobileStep, setMobileStep] = useState<'folders' | 'notes' | 'editor'>('folders')

  const visible = useMemo(() => {
    const fn = (id: string | null) => folders.find(f => f.id === id)?.name ?? ''
    const result = filterNotes(initialNotes as unknown as FilterNote[],
      { view, viewerId: viewer.id, folderId, q, folderName: fn })
    return result as unknown as HubNote[]
  }, [initialNotes, view, folderId, q, folders, viewer.id])

  const active = creating ? null : (initialNotes.find(n => n.id === activeId) ?? null)
  const editorNote = creating ? { ...EMPTY_NOTE, reminder_at: newNoteDate ? `${newNoteDate}T09:00:00` : null } : active
  const canEdit = active
    ? canEditNote({ user_id: active.user_id, scope: active.scope }, viewer)
    : true

  const handleSave = useCallback(async (p: { title: string; body: unknown; scope: NoteScope; folder_id: string | null; reminder_at: string | null }) => {
    setSaving(true)
    try {
      const input = {
        title: p.title, content: '', body: p.body, scope: p.scope, folder_id: p.folder_id,
        reminder_at: p.reminder_at,
        note_type: 'text' as const, items: [], labels: [],
      }
      if (active) {
        const r = await updateNote(active.id, input)
        if (!r.success) { showToast(r.error ?? 'Save failed'); return }
      } else {
        const r = await createNote(input)
        if (r.success && r.id) {
          setActiveId(r.id)
          setCreating(false)
        } else {
          showToast(r.error ?? 'Could not create note')
          return
        }
      }
      router.refresh()
    } finally {
      setSaving(false)
    }
  }, [active, router])

  const handleNew = () => { setCreating(true); setActiveId(null); setNewNoteDate(null); setMobileStep('editor') }
  const handleNewAtDate = (dateKey: string) => {
    setCreating(true); setActiveId(null); setNewNoteDate(dateKey); setCalendar(false); setMobileStep('editor')
  }
  const handleSelect = (id: string) => { setCreating(false); setActiveId(id); setMobileStep('editor') }

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
      {toastEl}
      {/* ── HERO HEADER ─────────────────────────────────────────────────── */}
      <div style={{ flexShrink: 0, margin: '16px 16px 0' }}>
        <PageHero
          title="Notes"
          subtitle="Create, organize and collaborate on company knowledge"
          maxContentWidth={400}
          chips={[
            { icon: <BookOpen size={11} />, label: `${initialNotes.length} Notes` },
            { icon: <FolderOpen size={11} />, label: `${folders.length} Folders` },
          ]}
          illustration={
            <div style={{
              position: 'absolute', right: 'clamp(8px,4vw,40px)', top: '50%', transform: 'translateY(-50%)',
              width: 'clamp(70px,20vw,150px)', height: '120%', pointerEvents: 'none', zIndex: 1,
            }}>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src="/brand/notes-hero.png" alt=""
                style={{ width: '100%', height: '100%', objectFit: 'contain', objectPosition: 'center', filter: 'drop-shadow(0 6px 24px rgba(0,0,0,0.25))' }} />
            </div>
          }
        />
      </div>
      {/* Search + action bar */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center gap-3" style={{ padding: '12px 20px', borderBottom: '1px solid #F1F1F4', background: '#fff', flexShrink: 0 }}>
        <div style={{ flex: 1, minWidth: 0 }} />
        <div className="flex items-center gap-2 flex-wrap w-full sm:w-auto">
        <div style={{ position: 'relative', flex: 1, minWidth: 200 }}>
          <Search size={14} style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', color: '#9CA3AF' }} />
          <input value={q} onChange={e => setQ(e.target.value)} placeholder="Search notes..."
            style={{ padding: '8px 12px 8px 30px', borderRadius: 10, border: '1px solid #E5E7EB', fontSize: 13, width: '100%', minWidth: 150 }} />
        </div>
        <button onClick={() => setCalendar(c => !c)} title="Calendar"
          style={{ background: calendar ? '#DE1A1A' : '#F3F4F6', color: calendar ? '#fff' : '#374151', border: 'none', borderRadius: 10, padding: '9px 12px', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 6, fontWeight: 600 }}>
          <CalendarDays size={15}/> Calendar
        </button>
        <button onClick={handleNew}
          style={{ background: '#DE1A1A', color: '#fff', border: 'none', borderRadius: 10, padding: '9px 16px', fontWeight: 700, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 6, flexShrink: 0 }}>
          <Plus size={15}/> New Note
        </button>
        </div>
      </div>
      <div style={{ flex: 1, display: 'flex', minHeight: 0 }}>
        {/* Folder sidebar — full width on mobile step 1, fixed width on desktop. Always hidden on mobile in calendar mode so the calendar isn't squeezed into a sliver. */}
        <div className={(calendar || mobileStep !== 'folders') ? 'hidden md:flex md:flex-col' : 'flex flex-col w-full md:w-auto'}>
          <FolderSidebar folders={folders} view={view} activeFolderId={folderId}
            onView={v => { setView(v); setFolderId(null); setMobileStep('notes') }}
            onFolder={id => { setFolderId(id); setView('all'); setMobileStep('notes') }}
            onNewFolder={handleNewFolder} onDeleteFolder={handleDeleteFolder} isAdmin={isAdmin} />
        </div>
        {calendar ? (
          <CalendarView notes={visible} onSelect={id => { setCalendar(false); handleSelect(id) }} onNewAtDate={handleNewAtDate} />
        ) : (
          <>
            {/* Notes list — full width on mobile step 2, fixed width on desktop */}
            <div className={mobileStep === 'editor' ? 'hidden md:flex md:flex-col' : mobileStep === 'notes' ? 'flex flex-col w-full md:w-auto' : 'hidden md:flex md:flex-col'}>
              {mobileStep === 'notes' && (
                <button className="md:hidden flex items-center gap-2 px-4 py-3 text-[13px] font-bold text-gray-600 border-b border-gray-100 bg-white flex-shrink-0"
                  onClick={() => setMobileStep('folders')}>← Folders</button>
              )}
              <NotesList notes={visible} folders={folders} activeId={creating ? null : activeId} sort={sort} onSort={setSort}
                onSelect={id => { handleSelect(id); setMobileStep('editor') }}
                onDelete={handleDeleteNote} />
            </div>
            {/* Note editor — full width on mobile step 3, flex-1 on desktop */}
            <div className={mobileStep !== 'editor' ? 'hidden md:flex md:flex-col md:flex-1' : 'flex flex-col w-full'}>
              {mobileStep === 'editor' && (
                <button className="md:hidden flex items-center gap-2 px-4 py-3 text-[13px] font-bold text-gray-600 border-b border-gray-100 bg-white flex-shrink-0"
                  onClick={() => setMobileStep('notes')}>← Notes</button>
              )}
              <NoteEditor key={active?.id ?? (creating ? `new-${newNoteDate ?? ''}` : 'none')}
                note={editorNote} folders={folders} canEdit={canEdit} isAdmin={isAdmin}
                teamMembers={teamMembers} onSave={handleSave} onShare={() => active && setSharing(active.id)} saving={saving} />
            </div>
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
