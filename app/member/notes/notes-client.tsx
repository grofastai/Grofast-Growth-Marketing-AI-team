'use client'

import { useState, useTransition } from 'react'
import { Pin, PinOff, Trash2, Plus, X, Bell, BellOff, StickyNote } from 'lucide-react'
import { createNote, updateNote, deleteNote, togglePin, type NoteRow, type NoteInput } from '@/lib/actions/notes'

const NOTE_COLORS = [
  { label: 'White',  value: '#FFFFFF' },
  { label: 'Yellow', value: '#FFF9C4' },
  { label: 'Green',  value: '#CCFF90' },
  { label: 'Blue',   value: '#BBDEFB' },
  { label: 'Pink',   value: '#F8BBD0' },
  { label: 'Purple', value: '#E1BEE7' },
  { label: 'Gray',   value: '#F5F5F5' },
]

function formatReminder(iso: string): string {
  return new Date(iso).toLocaleString('en-IN', {
    day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit', hour12: true,
    timeZone: 'Asia/Kolkata',
  })
}

function toLocalDateTimeInput(iso: string | null | undefined): string {
  if (!iso) return ''
  const d = new Date(iso)
  const pad = (n: number) => String(n).padStart(2, '0')
  const local = new Date(d.getTime() - d.getTimezoneOffset() * 60000)
  return `${local.getUTCFullYear()}-${pad(local.getUTCMonth() + 1)}-${pad(local.getUTCDate())}T${pad(local.getUTCHours())}:${pad(local.getUTCMinutes())}`
}

interface ModalState {
  open: boolean
  editing: NoteRow | null
}

const EMPTY_DRAFT: NoteInput = { title: '', content: '', color: '#FFFFFF', pinned: false, reminder_at: null }

export default function NotesClient({ initialNotes }: { initialNotes: NoteRow[] }) {
  const [notes, setNotes] = useState<NoteRow[]>(initialNotes)
  const [modal, setModal] = useState<ModalState>({ open: false, editing: null })
  const [draft, setDraft] = useState<NoteInput>(EMPTY_DRAFT)
  const [deleteId, setDeleteId] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [isPending, startTransition] = useTransition()

  function openCreate() {
    setDraft(EMPTY_DRAFT)
    setError(null)
    setModal({ open: true, editing: null })
  }

  function openEdit(note: NoteRow) {
    setDraft({
      title: note.title ?? '',
      content: note.content,
      color: note.color,
      pinned: note.pinned,
      reminder_at: note.reminder_at,
    })
    setError(null)
    setModal({ open: true, editing: note })
  }

  function closeModal() {
    setModal({ open: false, editing: null })
    setError(null)
  }

  function handleSave() {
    if (!draft.content.trim()) { setError('Note content is required'); return }
    setError(null)
    startTransition(async () => {
      if (modal.editing) {
        const res = await updateNote(modal.editing.id, draft)
        if (!res.success) { setError(res.error ?? 'Failed to save'); return }
        setNotes(prev => prev.map(n => n.id === modal.editing!.id
          ? { ...n, ...draft, title: draft.title || null, updated_at: new Date().toISOString() }
          : n
        ))
      } else {
        const res = await createNote(draft)
        if (!res.success) { setError(res.error ?? 'Failed to save'); return }
        const newNote: NoteRow = {
          id: res.id!,
          title: draft.title || null,
          content: draft.content,
          color: draft.color ?? '#FFFFFF',
          pinned: draft.pinned ?? false,
          reminder_at: draft.reminder_at ?? null,
          reminded: false,
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        }
        setNotes(prev => [newNote, ...prev])
      }
      closeModal()
    })
  }

  function handleDelete(id: string) {
    startTransition(async () => {
      await deleteNote(id)
      setNotes(prev => prev.filter(n => n.id !== id))
      setDeleteId(null)
    })
  }

  function handleTogglePin(note: NoteRow) {
    const newPinned = !note.pinned
    setNotes(prev => prev.map(n => n.id === note.id ? { ...n, pinned: newPinned } : n))
    startTransition(async () => { await togglePin(note.id, newPinned) })
  }

  const pinned = notes.filter(n => n.pinned)
  const unpinned = notes.filter(n => !n.pinned)

  return (
    <div style={{ padding: '24px 20px', maxWidth: 900, margin: '0 auto' }}>

      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 28 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <StickyNote size={22} color="#DE1A1A" />
          <h1 style={{ fontSize: 22, fontWeight: 800, color: '#111', margin: 0 }}>My Notes</h1>
        </div>
        <button
          onClick={openCreate}
          style={{
            display: 'flex', alignItems: 'center', gap: 6,
            background: '#DE1A1A', color: '#fff', border: 'none',
            borderRadius: 10, padding: '9px 18px', fontWeight: 700,
            fontSize: 14, cursor: 'pointer',
          }}
        >
          <Plus size={16} /> New Note
        </button>
      </div>

      {notes.length === 0 && (
        <div style={{ textAlign: 'center', padding: '60px 0', color: '#aaa' }}>
          <StickyNote size={48} color="#ddd" style={{ marginBottom: 12 }} />
          <p style={{ fontSize: 15, margin: 0 }}>No notes yet. Tap &ldquo;New Note&rdquo; to get started.</p>
        </div>
      )}

      {/* Pinned Section */}
      {pinned.length > 0 && (
        <section style={{ marginBottom: 28 }}>
          <p style={{ fontSize: 11, fontWeight: 700, letterSpacing: '0.08em', color: '#999', textTransform: 'uppercase', marginBottom: 12 }}>
            Pinned
          </p>
          <NoteGrid notes={pinned} onEdit={openEdit} onDelete={id => setDeleteId(id)} onTogglePin={handleTogglePin} />
        </section>
      )}

      {/* All Notes Section */}
      {unpinned.length > 0 && (
        <section>
          {pinned.length > 0 && (
            <p style={{ fontSize: 11, fontWeight: 700, letterSpacing: '0.08em', color: '#999', textTransform: 'uppercase', marginBottom: 12 }}>
              Notes
            </p>
          )}
          <NoteGrid notes={unpinned} onEdit={openEdit} onDelete={id => setDeleteId(id)} onTogglePin={handleTogglePin} />
        </section>
      )}

      {/* Create/Edit Modal */}
      {modal.open && (
        <>
          <div
            style={{ position: 'fixed', inset: 0, zIndex: 40, background: 'rgba(0,0,0,0.5)', backdropFilter: 'blur(4px)' }}
            onClick={closeModal}
          />
          <div style={{ position: 'fixed', inset: 0, zIndex: 50, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}>
            <div style={{
              width: '100%', maxWidth: 480, background: draft.color ?? '#fff',
              borderRadius: 20, boxShadow: '0 24px 64px rgba(0,0,0,0.22)',
              border: '1px solid rgba(0,0,0,0.08)', overflow: 'hidden',
              display: 'flex', flexDirection: 'column',
            }}>
              {/* Modal Header */}
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '16px 20px 0' }}>
                <span style={{ fontWeight: 700, fontSize: 15, color: '#111' }}>
                  {modal.editing ? 'Edit Note' : 'New Note'}
                </span>
                <button onClick={closeModal} style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 4 }}>
                  <X size={18} color="#555" />
                </button>
              </div>

              {/* Form */}
              <div style={{ padding: '16px 20px', display: 'flex', flexDirection: 'column', gap: 12 }}>
                <input
                  placeholder="Title (optional)"
                  value={draft.title ?? ''}
                  onChange={e => setDraft(d => ({ ...d, title: e.target.value }))}
                  maxLength={120}
                  style={{
                    border: 'none', background: 'transparent', outline: 'none',
                    fontSize: 16, fontWeight: 700, color: '#111',
                    width: '100%',
                  }}
                />
                <textarea
                  placeholder="Write your note..."
                  value={draft.content}
                  onChange={e => setDraft(d => ({ ...d, content: e.target.value }))}
                  rows={5}
                  style={{
                    border: 'none', background: 'transparent', outline: 'none',
                    fontSize: 14, color: '#333', resize: 'vertical',
                    width: '100%', fontFamily: 'inherit', lineHeight: 1.6,
                  }}
                />

                {/* Color Picker */}
                <div>
                  <p style={{ fontSize: 11, fontWeight: 600, color: '#888', marginBottom: 8, textTransform: 'uppercase', letterSpacing: '0.06em' }}>Color</p>
                  <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                    {NOTE_COLORS.map(c => (
                      <button
                        key={c.value}
                        title={c.label}
                        onClick={() => setDraft(d => ({ ...d, color: c.value }))}
                        style={{
                          width: 28, height: 28, borderRadius: '50%',
                          background: c.value,
                          border: draft.color === c.value ? '3px solid #DE1A1A' : '2px solid #ddd',
                          cursor: 'pointer',
                        }}
                      />
                    ))}
                  </div>
                </div>

                {/* Reminder */}
                <div>
                  <p style={{ fontSize: 11, fontWeight: 600, color: '#888', marginBottom: 8, textTransform: 'uppercase', letterSpacing: '0.06em' }}>
                    Reminder
                  </p>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <input
                      type="datetime-local"
                      value={toLocalDateTimeInput(draft.reminder_at)}
                      onChange={e => setDraft(d => ({ ...d, reminder_at: e.target.value ? new Date(e.target.value).toISOString() : null }))}
                      style={{
                        flex: 1, padding: '7px 10px', borderRadius: 8,
                        border: '1px solid #ddd', fontSize: 13,
                        background: 'rgba(255,255,255,0.6)',
                      }}
                    />
                    {draft.reminder_at && (
                      <button
                        onClick={() => setDraft(d => ({ ...d, reminder_at: null }))}
                        style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 4 }}
                        title="Clear reminder"
                      >
                        <BellOff size={16} color="#999" />
                      </button>
                    )}
                  </div>
                </div>

                {/* Pin toggle */}
                <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer', fontSize: 13, color: '#555' }}>
                  <input
                    type="checkbox"
                    checked={draft.pinned ?? false}
                    onChange={e => setDraft(d => ({ ...d, pinned: e.target.checked }))}
                    style={{ accentColor: '#DE1A1A', width: 16, height: 16 }}
                  />
                  Pin this note
                </label>

                {error && <p style={{ color: '#DE1A1A', fontSize: 13, margin: 0 }}>{error}</p>}
              </div>

              {/* Footer */}
              <div style={{ padding: '0 20px 20px', display: 'flex', gap: 10 }}>
                <button
                  onClick={handleSave}
                  disabled={isPending}
                  style={{
                    flex: 1, background: '#DE1A1A', color: '#fff', border: 'none',
                    borderRadius: 10, padding: '10px 0', fontWeight: 700, fontSize: 14,
                    cursor: isPending ? 'not-allowed' : 'pointer', opacity: isPending ? 0.7 : 1,
                  }}
                >
                  {isPending ? 'Saving…' : modal.editing ? 'Save Changes' : 'Add Note'}
                </button>
                <button
                  onClick={closeModal}
                  style={{
                    background: 'transparent', color: '#555', border: '1px solid #ddd',
                    borderRadius: 10, padding: '10px 20px', fontWeight: 600, fontSize: 14,
                    cursor: 'pointer',
                  }}
                >
                  Cancel
                </button>
              </div>
            </div>
          </div>
        </>
      )}

      {/* Delete Confirm Modal */}
      {deleteId && (
        <>
          <div style={{ position: 'fixed', inset: 0, zIndex: 40, background: 'rgba(0,0,0,0.5)', backdropFilter: 'blur(4px)' }} onClick={() => setDeleteId(null)} />
          <div style={{ position: 'fixed', inset: 0, zIndex: 50, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}>
            <div style={{ background: '#fff', borderRadius: 16, padding: 28, maxWidth: 340, width: '100%', boxShadow: '0 16px 48px rgba(0,0,0,0.18)', textAlign: 'center' }}>
              <Trash2 size={32} color="#DE1A1A" style={{ marginBottom: 12 }} />
              <p style={{ fontWeight: 700, fontSize: 16, marginBottom: 8 }}>Delete note?</p>
              <p style={{ color: '#666', fontSize: 14, marginBottom: 24 }}>This cannot be undone.</p>
              <div style={{ display: 'flex', gap: 10 }}>
                <button
                  onClick={() => handleDelete(deleteId)}
                  disabled={isPending}
                  style={{ flex: 1, background: '#DE1A1A', color: '#fff', border: 'none', borderRadius: 10, padding: '10px 0', fontWeight: 700, fontSize: 14, cursor: 'pointer' }}
                >
                  Delete
                </button>
                <button
                  onClick={() => setDeleteId(null)}
                  style={{ flex: 1, background: '#f5f5f5', color: '#333', border: 'none', borderRadius: 10, padding: '10px 0', fontWeight: 600, fontSize: 14, cursor: 'pointer' }}
                >
                  Cancel
                </button>
              </div>
            </div>
          </div>
        </>
      )}
    </div>
  )
}

function NoteGrid({
  notes, onEdit, onDelete, onTogglePin,
}: {
  notes: NoteRow[]
  onEdit: (n: NoteRow) => void
  onDelete: (id: string) => void
  onTogglePin: (n: NoteRow) => void
}) {
  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))', gap: 14 }}>
      {notes.map(note => (
        <NoteCard key={note.id} note={note} onEdit={onEdit} onDelete={onDelete} onTogglePin={onTogglePin} />
      ))}
    </div>
  )
}

function NoteCard({
  note, onEdit, onDelete, onTogglePin,
}: {
  note: NoteRow
  onEdit: (n: NoteRow) => void
  onDelete: (id: string) => void
  onTogglePin: (n: NoteRow) => void
}) {
  const isPast = note.reminder_at && !note.reminded && new Date(note.reminder_at) < new Date()

  return (
    <div
      onClick={() => onEdit(note)}
      style={{
        background: note.color,
        borderRadius: 14,
        border: '1px solid rgba(0,0,0,0.08)',
        padding: '14px 14px 10px',
        cursor: 'pointer',
        boxShadow: '0 2px 8px rgba(0,0,0,0.07)',
        display: 'flex',
        flexDirection: 'column',
        gap: 6,
        minHeight: 100,
        position: 'relative',
        transition: 'box-shadow 0.15s',
      }}
    >
      {note.title && (
        <p style={{ fontSize: 14, fontWeight: 700, color: '#111', margin: 0, lineHeight: 1.3 }}>
          {note.title}
        </p>
      )}
      <p style={{ fontSize: 13, color: '#444', margin: 0, lineHeight: 1.5, flex: 1,
        display: '-webkit-box', WebkitLineClamp: 6, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>
        {note.content}
      </p>

      {note.reminder_at && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 4, marginTop: 4 }}>
          <Bell size={11} color={isPast ? '#DE1A1A' : '#888'} />
          <span style={{ fontSize: 11, color: isPast ? '#DE1A1A' : '#888', fontWeight: isPast ? 700 : 400 }}>
            {formatReminder(note.reminder_at)}
          </span>
        </div>
      )}

      {/* Action row */}
      <div
        style={{ display: 'flex', justifyContent: 'flex-end', gap: 4, marginTop: 4 }}
        onClick={e => e.stopPropagation()}
      >
        <button
          onClick={() => onTogglePin(note)}
          title={note.pinned ? 'Unpin' : 'Pin'}
          style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 4, borderRadius: 6, color: '#888' }}
        >
          {note.pinned ? <PinOff size={14} /> : <Pin size={14} />}
        </button>
        <button
          onClick={() => onDelete(note.id)}
          title="Delete"
          style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 4, borderRadius: 6, color: '#888' }}
        >
          <Trash2 size={14} />
        </button>
      </div>
    </div>
  )
}
