'use client'

import { useState, useTransition, useMemo } from 'react'
import { useRouter } from 'next/navigation'
import {
  Pin, PinOff, Trash2, Plus, X, Bell,
  Archive, ArchiveRestore, CheckSquare, AlignLeft,
  Search, Tag, ClipboardList, Check,
} from 'lucide-react'
import {
  createNote, updateNote, deleteNote, togglePin, archiveNote, convertNoteToTask,
  type NoteRow, type NoteInput, type ChecklistItem,
} from '@/lib/actions/notes'

// ── Helpers ───────────────────────────────────────────────────────────────────

function newItem(text = ''): ChecklistItem {
  return { id: Math.random().toString(36).slice(2), text, checked: false }
}

function buildContent(
  noteType: 'text' | 'checklist',
  textContent: string,
  items: ChecklistItem[]
): string {
  if (noteType === 'checklist') return items.map(i => i.text).filter(Boolean).join(', ')
  return textContent
}

const NOTE_COLORS = [
  { label: 'White',  value: '#FFFFFF' },
  { label: 'Yellow', value: '#FFF9C4' },
  { label: 'Green',  value: '#CCFF90' },
  { label: 'Blue',   value: '#BBDEFB' },
  { label: 'Pink',   value: '#F8BBD0' },
  { label: 'Purple', value: '#E1BEE7' },
  { label: 'Coral',  value: '#FFCCBC' },
  { label: 'Gray',   value: '#F5F5F5' },
]

function formatReminder(iso: string): string {
  return new Date(iso).toLocaleString('en-IN', {
    day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit',
    hour12: true, timeZone: 'Asia/Kolkata',
  })
}

const EMPTY_DRAFT: NoteInput = {
  title: '', content: '', color: '#FFFFFF',
  pinned: false, reminder_at: null,
  note_type: 'text', items: [], labels: [],
}

// ── Convert-to-task popup ─────────────────────────────────────────────────────

function ConvertPopup({ note, onClose }: { note: NoteRow; onClose: () => void }) {
  const [taskTitle, setTaskTitle] = useState(note.title || note.content.slice(0, 60))
  const [dueDate, setDueDate]     = useState('')
  const [isPending, start]        = useTransition()
  const [done, setDone]           = useState(false)

  function confirm() {
    if (!taskTitle.trim()) return
    start(async () => {
      await convertNoteToTask(note.id, taskTitle, dueDate || undefined)
      setDone(true)
      setTimeout(onClose, 900)
    })
  }

  if (done) return (
    <div style={{ padding: '14px 16px', background: 'rgba(16,185,129,0.1)', borderRadius: 12, display: 'flex', alignItems: 'center', gap: 8 }}>
      <Check size={14} color="#10B981" />
      <span style={{ fontSize: 12, fontWeight: 700, color: '#10B981' }}>Task created!</span>
    </div>
  )

  return (
    <div style={{ padding: '14px 16px', background: '#FFFFFF', borderRadius: 12, boxShadow: '0 4px 20px rgba(0,0,0,0.15)', border: '1px solid #E5E7EB', minWidth: 260 }}>
      <p style={{ fontSize: 12, fontWeight: 800, color: '#111', margin: '0 0 10px' }}>Convert to Task</p>
      <input value={taskTitle} onChange={e => setTaskTitle(e.target.value)}
        style={{ width: '100%', padding: '7px 10px', borderRadius: 8, border: '1.5px solid #E2E8F0', fontSize: 12, outline: 'none', boxSizing: 'border-box', marginBottom: 8 }} />
      <input type="date" value={dueDate} onChange={e => setDueDate(e.target.value)}
        style={{ width: '100%', padding: '7px 10px', borderRadius: 8, border: '1.5px solid #E2E8F0', fontSize: 12, outline: 'none', boxSizing: 'border-box', marginBottom: 10 }} />
      <div style={{ display: 'flex', gap: 8 }}>
        <button onClick={onClose} style={{ flex: 1, padding: '7px', borderRadius: 8, border: '1px solid #E5E7EB', background: '#F9FAFB', fontSize: 12, fontWeight: 600, cursor: 'pointer', color: '#6B7280' }}>Cancel</button>
        <button onClick={confirm} disabled={isPending || !taskTitle.trim()}
          style={{ flex: 2, padding: '7px', borderRadius: 8, border: 'none', background: isPending ? '#9CA3AF' : '#DE1A1A', color: '#fff', fontSize: 12, fontWeight: 700, cursor: 'pointer' }}>
          {isPending ? 'Creating…' : 'Create Task'}
        </button>
      </div>
    </div>
  )
}

// ── Note Card ─────────────────────────────────────────────────────────────────

function NoteCard({
  note, onEdit, onPin, onArchive, onDelete, showArchived,
}: {
  note: NoteRow
  onEdit: (n: NoteRow) => void
  onPin: (id: string, pinned: boolean) => void
  onArchive: (id: string, archived: boolean) => void
  onDelete: (id: string) => void
  showArchived: boolean
}) {
  const [hovered, setHovered]     = useState(false)
  const [showConvert, setConvert] = useState(false)

  const visibleItems = note.items.slice(0, 5)
  const extraCount   = note.items.length - 5

  return (
    <div
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => { setHovered(false); setConvert(false) }}
      style={{
        background: note.color, borderRadius: 12, border: '1px solid rgba(0,0,0,0.12)',
        padding: '14px 14px 10px', marginBottom: 12, breakInside: 'avoid',
        position: 'relative', cursor: 'pointer', transition: 'box-shadow 0.15s',
        boxShadow: hovered ? '0 4px 16px rgba(0,0,0,0.12)' : '0 1px 4px rgba(0,0,0,0.06)',
      }}
      onClick={() => onEdit(note)}
    >
      {/* Pin button */}
      <button
        onClick={e => { e.stopPropagation(); onPin(note.id, !note.pinned) }}
        style={{ position: 'absolute', top: 8, right: 8, background: 'none', border: 'none', cursor: 'pointer', opacity: hovered || note.pinned ? 1 : 0, transition: 'opacity 0.15s', padding: 4, borderRadius: 6 }}
        title={note.pinned ? 'Unpin' : 'Pin'}
      >
        {note.pinned ? <Pin size={14} color="#DE1A1A" /> : <PinOff size={14} color="#6B7280" />}
      </button>

      {/* Title */}
      {note.title && (
        <p style={{ fontSize: 14, fontWeight: 800, color: '#111', margin: '0 24px 6px 0', lineHeight: 1.3 }}>{note.title}</p>
      )}

      {/* Content or checklist preview */}
      {note.note_type === 'checklist' ? (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
          {visibleItems.map(item => (
            <div key={item.id} style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
              <div style={{ width: 13, height: 13, borderRadius: 3, border: `1.5px solid ${item.checked ? '#10B981' : '#9CA3AF'}`, background: item.checked ? '#10B981' : 'transparent', flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                {item.checked && <Check size={8} color="#fff" />}
              </div>
              <span style={{ fontSize: 12, color: item.checked ? '#9CA3AF' : '#374151', textDecoration: item.checked ? 'line-through' : 'none' }}>{item.text}</span>
            </div>
          ))}
          {extraCount > 0 && <p style={{ fontSize: 11, color: '#9CA3AF', margin: '2px 0 0' }}>+{extraCount} more item{extraCount !== 1 ? 's' : ''}</p>}
        </div>
      ) : (
        <p style={{ fontSize: 13, color: '#374151', margin: 0, lineHeight: 1.5, display: '-webkit-box', WebkitLineClamp: 6, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>
          {note.content}
        </p>
      )}

      {/* Reminder badge */}
      {note.reminder_at && !note.reminded && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 5, marginTop: 8, padding: '3px 8px', background: 'rgba(245,158,11,0.12)', borderRadius: 20, width: 'fit-content' }}>
          <Bell size={10} color="#F59E0B" />
          <span style={{ fontSize: 10, fontWeight: 600, color: '#D97706' }}>{formatReminder(note.reminder_at)}</span>
        </div>
      )}

      {/* Label chips */}
      {note.labels.length > 0 && (
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4, marginTop: 8 }}>
          {note.labels.map(label => (
            <span key={label} style={{ fontSize: 10, fontWeight: 700, padding: '2px 8px', borderRadius: 20, background: 'rgba(0,0,0,0.07)', color: '#374151' }}>{label}</span>
          ))}
        </div>
      )}

      {/* Hover actions */}
      {hovered && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 4, marginTop: 10, paddingTop: 8, borderTop: '1px solid rgba(0,0,0,0.08)' }}>
          {showArchived ? (
            <button onClick={e => { e.stopPropagation(); onArchive(note.id, false) }}
              style={{ display: 'flex', alignItems: 'center', gap: 4, padding: '4px 8px', borderRadius: 6, border: 'none', background: 'rgba(99,102,241,0.1)', cursor: 'pointer', fontSize: 11, fontWeight: 700, color: '#6366F1' }}>
              <ArchiveRestore size={12} /> Restore
            </button>
          ) : (
            <button onClick={e => { e.stopPropagation(); onArchive(note.id, true) }}
              style={{ display: 'flex', alignItems: 'center', gap: 4, padding: '4px 8px', borderRadius: 6, border: 'none', background: 'rgba(107,114,128,0.1)', cursor: 'pointer', fontSize: 11, fontWeight: 700, color: '#6B7280' }}>
              <Archive size={12} /> Archive
            </button>
          )}
          <div style={{ position: 'relative' }}>
            <button onClick={e => { e.stopPropagation(); setConvert(p => !p) }}
              style={{ display: 'flex', alignItems: 'center', gap: 4, padding: '4px 8px', borderRadius: 6, border: 'none', background: 'rgba(222,26,26,0.08)', cursor: 'pointer', fontSize: 11, fontWeight: 700, color: '#DE1A1A' }}>
              <ClipboardList size={12} /> Task
            </button>
            {showConvert && (
              <div style={{ position: 'absolute', bottom: '100%', left: 0, zIndex: 50, marginBottom: 6 }} onClick={e => e.stopPropagation()}>
                <ConvertPopup note={note} onClose={() => setConvert(false)} />
              </div>
            )}
          </div>
          <button onClick={e => { e.stopPropagation(); onDelete(note.id) }}
            style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', padding: '4px 8px', borderRadius: 6, border: 'none', background: 'rgba(239,68,68,0.08)', cursor: 'pointer' }}>
            <Trash2 size={12} color="#EF4444" />
          </button>
        </div>
      )}
    </div>
  )
}

// ── Inline Editor ─────────────────────────────────────────────────────────────

function InlineEditor({
  draft, setDraft, allLabels, onSave, onCancel, isPending, error,
}: {
  draft: NoteInput
  setDraft: React.Dispatch<React.SetStateAction<NoteInput>>
  allLabels: string[]
  onSave: () => void
  onCancel: () => void
  isPending: boolean
  error: string | null
}) {
  const [labelInput, setLabelInput] = useState('')
  const [showLabelSug, setLabelSug] = useState(false)

  const suggestions = allLabels.filter(
    l => l.toLowerCase().includes(labelInput.toLowerCase()) && !draft.labels.includes(l)
  )

  function addLabel(label: string) {
    const trimmed = label.trim()
    if (trimmed && !draft.labels.includes(trimmed)) {
      setDraft(d => ({ ...d, labels: [...d.labels, trimmed] }))
    }
    setLabelInput('')
    setLabelSug(false)
  }

  function removeLabel(label: string) {
    setDraft(d => ({ ...d, labels: d.labels.filter(l => l !== label) }))
  }

  function patchItem(id: string, patch: Partial<ChecklistItem>) {
    setDraft(d => ({ ...d, items: d.items.map(i => i.id === id ? { ...i, ...patch } : i) }))
  }

  function addItem() {
    setDraft(d => ({ ...d, items: [...d.items, newItem()] }))
  }

  function removeItem(id: string) {
    setDraft(d => ({ ...d, items: d.items.filter(i => i.id !== id) }))
  }

  function switchMode(mode: 'text' | 'checklist') {
    setDraft(d => ({
      ...d,
      note_type: mode,
      items: mode === 'checklist' && d.items.length === 0 ? [newItem()] : d.items,
    }))
  }

  const sortedItems = [...draft.items].sort((a, b) => Number(a.checked) - Number(b.checked))

  return (
    <div style={{ background: draft.color, borderRadius: 14, border: '1.5px solid rgba(0,0,0,0.15)', padding: '14px 16px', boxShadow: '0 4px 20px rgba(0,0,0,0.12)', marginBottom: 20 }}>
      {/* Title */}
      <input
        value={draft.title ?? ''}
        onChange={e => setDraft(d => ({ ...d, title: e.target.value }))}
        placeholder="Title"
        style={{ width: '100%', background: 'transparent', border: 'none', outline: 'none', fontSize: 15, fontWeight: 800, color: '#111', marginBottom: 10, fontFamily: 'inherit', boxSizing: 'border-box' }}
      />

      {/* Body */}
      {draft.note_type === 'text' ? (
        <textarea
          value={draft.content}
          onChange={e => setDraft(d => ({ ...d, content: e.target.value }))}
          placeholder="Take a note…"
          rows={4}
          style={{ width: '100%', background: 'transparent', border: 'none', outline: 'none', fontSize: 13, color: '#374151', resize: 'none', lineHeight: 1.6, fontFamily: 'inherit', boxSizing: 'border-box' }}
        />
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginBottom: 8 }}>
          {sortedItems.map((item, idx) => (
            <div key={item.id} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <button type="button" onClick={() => patchItem(item.id, { checked: !item.checked })}
                style={{ width: 16, height: 16, borderRadius: 4, border: `2px solid ${item.checked ? '#10B981' : '#9CA3AF'}`, background: item.checked ? '#10B981' : 'transparent', flexShrink: 0, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                {item.checked && <Check size={9} color="#fff" />}
              </button>
              <input
                value={item.text}
                onChange={e => patchItem(item.id, { text: e.target.value })}
                onKeyDown={e => {
                  if (e.key === 'Enter') { e.preventDefault(); if (idx === sortedItems.length - 1) addItem() }
                }}
                placeholder="List item"
                style={{ flex: 1, background: 'transparent', border: 'none', borderBottom: '1px solid rgba(0,0,0,0.1)', outline: 'none', fontSize: 13, color: item.checked ? '#9CA3AF' : '#374151', textDecoration: item.checked ? 'line-through' : 'none', fontFamily: 'inherit', padding: '2px 0' }}
              />
              <button type="button" onClick={() => removeItem(item.id)} style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 2, opacity: 0.5 }}>
                <X size={12} color="#6B7280" />
              </button>
            </div>
          ))}
          <button type="button" onClick={addItem}
            style={{ display: 'flex', alignItems: 'center', gap: 6, background: 'none', border: 'none', cursor: 'pointer', fontSize: 12, color: '#9CA3AF', padding: '4px 0', fontWeight: 600 }}>
            <Plus size={12} /> Add item
          </button>
        </div>
      )}

      {/* Label chips */}
      {draft.labels.length > 0 && (
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4, marginBottom: 8 }}>
          {draft.labels.map(label => (
            <span key={label} style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 11, fontWeight: 700, padding: '2px 8px', borderRadius: 20, background: 'rgba(0,0,0,0.08)', color: '#374151' }}>
              {label}
              <button type="button" onClick={() => removeLabel(label)} style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 0, lineHeight: 1 }}>
                <X size={10} color="#6B7280" />
              </button>
            </span>
          ))}
        </div>
      )}

      {error && <p style={{ fontSize: 12, color: '#EF4444', marginBottom: 8 }}>{error}</p>}

      {/* Toolbar */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
        {/* Mode toggle */}
        <button type="button" onClick={() => switchMode('text')} title="Text note"
          style={{ padding: '5px 8px', borderRadius: 7, border: `1.5px solid ${draft.note_type === 'text' ? '#DE1A1A' : '#E2E8F0'}`, background: draft.note_type === 'text' ? 'rgba(222,26,26,0.08)' : 'transparent', cursor: 'pointer', display: 'flex', alignItems: 'center' }}>
          <AlignLeft size={13} color={draft.note_type === 'text' ? '#DE1A1A' : '#6B7280'} />
        </button>
        <button type="button" onClick={() => switchMode('checklist')} title="Checklist"
          style={{ padding: '5px 8px', borderRadius: 7, border: `1.5px solid ${draft.note_type === 'checklist' ? '#DE1A1A' : '#E2E8F0'}`, background: draft.note_type === 'checklist' ? 'rgba(222,26,26,0.08)' : 'transparent', cursor: 'pointer', display: 'flex', alignItems: 'center' }}>
          <CheckSquare size={13} color={draft.note_type === 'checklist' ? '#DE1A1A' : '#6B7280'} />
        </button>

        {/* Color picker */}
        <div style={{ display: 'flex', gap: 4 }}>
          {NOTE_COLORS.map(c => (
            <button key={c.value} type="button" onClick={() => setDraft(d => ({ ...d, color: c.value }))}
              title={c.label}
              style={{ width: 18, height: 18, borderRadius: '50%', background: c.value, border: draft.color === c.value ? '2.5px solid #DE1A1A' : '1.5px solid rgba(0,0,0,0.15)', cursor: 'pointer', flexShrink: 0 }} />
          ))}
        </div>

        {/* Label input */}
        <div style={{ position: 'relative', flex: 1, minWidth: 100 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 4, padding: '5px 8px', borderRadius: 7, border: '1.5px solid #E2E8F0', background: 'transparent' }}>
            <Tag size={11} color="#9CA3AF" />
            <input
              value={labelInput}
              onChange={e => { setLabelInput(e.target.value); setLabelSug(true) }}
              onKeyDown={e => { if (e.key === 'Enter' && labelInput.trim()) { e.preventDefault(); addLabel(labelInput) } }}
              placeholder="Add label…"
              style={{ background: 'transparent', border: 'none', outline: 'none', fontSize: 11, color: '#374151', width: '100%', fontFamily: 'inherit' }}
            />
          </div>
          {showLabelSug && suggestions.length > 0 && (
            <div style={{ position: 'absolute', top: '100%', left: 0, right: 0, background: '#fff', borderRadius: 8, boxShadow: '0 4px 16px rgba(0,0,0,0.1)', zIndex: 20, marginTop: 4, border: '1px solid #E5E7EB', overflow: 'hidden' }}>
              {suggestions.slice(0, 5).map(s => (
                <button key={s} type="button" onClick={() => addLabel(s)}
                  style={{ width: '100%', textAlign: 'left', padding: '8px 12px', background: 'none', border: 'none', cursor: 'pointer', fontSize: 12, color: '#374151' }}
                  onMouseDown={e => e.preventDefault()}>
                  {s}
                </button>
              ))}
            </div>
          )}
        </div>

        <div style={{ marginLeft: 'auto', display: 'flex', gap: 8 }}>
          <button type="button" onClick={onCancel}
            style={{ padding: '7px 14px', borderRadius: 8, border: '1px solid #E2E8F0', background: 'transparent', fontSize: 12, fontWeight: 700, cursor: 'pointer', color: '#6B7280' }}>
            Cancel
          </button>
          <button type="button" onClick={onSave} disabled={isPending}
            style={{ padding: '7px 16px', borderRadius: 8, border: 'none', background: isPending ? '#9CA3AF' : '#DE1A1A', color: '#fff', fontSize: 12, fontWeight: 700, cursor: isPending ? 'not-allowed' : 'pointer' }}>
            {isPending ? 'Saving…' : 'Save'}
          </button>
        </div>
      </div>
    </div>
  )
}

// ── Main Component ────────────────────────────────────────────────────────────

export default function NotesClient({
  initialNotes,
  showArchived = false,
}: {
  initialNotes: NoteRow[]
  showArchived?: boolean
}) {
  const [notes, setNotes]             = useState<NoteRow[]>(initialNotes)
  const [isPending, start]            = useTransition()
  const [searchQuery, setSearchQuery] = useState('')
  const [labelFilter, setLabelFilter] = useState('')
  const [error, setError]             = useState<string | null>(null)

  const [editorOpen, setEditorOpen]   = useState(false)
  const [editingNote, setEditingNote] = useState<NoteRow | null>(null)
  const [draft, setDraft]             = useState<NoteInput>(EMPTY_DRAFT)

  const allLabels = useMemo(
    () => [...new Set(notes.flatMap(n => n.labels))].sort(),
    [notes]
  )

  const filtered = useMemo(() => {
    let n = notes
    if (searchQuery) {
      const q = searchQuery.toLowerCase()
      n = n.filter(note =>
        note.title?.toLowerCase().includes(q) ||
        note.content.toLowerCase().includes(q) ||
        note.labels.some(l => l.toLowerCase().includes(q))
      )
    }
    if (labelFilter) n = n.filter(note => note.labels.includes(labelFilter))
    return n
  }, [notes, searchQuery, labelFilter])

  const pinned = filtered.filter(n => n.pinned)
  const others = filtered.filter(n => !n.pinned)

  function openCreate(mode: 'text' | 'checklist' = 'text') {
    setEditingNote(null)
    setDraft({ ...EMPTY_DRAFT, note_type: mode, items: mode === 'checklist' ? [newItem()] : [] })
    setError(null)
    setEditorOpen(true)
  }

  function openEdit(note: NoteRow) {
    setEditingNote(note)
    setDraft({
      title:       note.title ?? '',
      content:     note.content,
      color:       note.color,
      pinned:      note.pinned,
      reminder_at: note.reminder_at,
      note_type:   note.note_type,
      items:       note.items,
      labels:      note.labels,
    })
    setError(null)
    setEditorOpen(true)
  }

  function closeEditor() {
    setEditorOpen(false)
    setEditingNote(null)
    setError(null)
  }

  function handleSave() {
    const content = buildContent(draft.note_type, draft.content, draft.items)
    if (draft.note_type === 'text' && !content.trim()) { setError('Note cannot be empty'); return }
    if (draft.note_type === 'checklist' && draft.items.every(i => !i.text.trim())) { setError('Add at least one checklist item'); return }
    setError(null)

    start(async () => {
      const input: NoteInput = { ...draft, content }
      if (editingNote) {
        const res = await updateNote(editingNote.id, input)
        if (!res.success) { setError(res.error ?? 'Failed to save'); return }
        setNotes(prev => prev.map(n =>
          n.id === editingNote.id
            ? { ...n, ...input, title: input.title || null, updated_at: new Date().toISOString() }
            : n
        ))
      } else {
        const res = await createNote(input)
        if (!res.success) { setError(res.error ?? 'Failed to save'); return }
        const newNote: NoteRow = {
          id: res.id!, ...input,
          title:       input.title || null,
          color:       input.color ?? '#FFFFFF',
          pinned:      input.pinned ?? false,
          reminder_at: input.reminder_at ?? null,
          reminded:    false,
          archived:    false,
          created_at:  new Date().toISOString(),
          updated_at:  new Date().toISOString(),
        }
        setNotes(prev => [newNote, ...prev])
      }
      closeEditor()
    })
  }

  function handlePin(id: string, pinned: boolean) {
    start(async () => {
      await togglePin(id, pinned)
      setNotes(prev => prev.map(n => n.id === id ? { ...n, pinned } : n))
    })
  }

  function handleArchive(id: string, archived: boolean) {
    start(async () => {
      await archiveNote(id, archived)
      setNotes(prev => prev.filter(n => n.id !== id))
    })
  }

  function handleDelete(id: string) {
    start(async () => {
      await deleteNote(id)
      setNotes(prev => prev.filter(n => n.id !== id))
    })
  }

  return (
    <div className="p-4 md:p-6 xl:p-8" style={{ background: '#F5F6FA', minHeight: '100vh' }}>

      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 20, flexWrap: 'wrap' }}>
        <h1 style={{ fontSize: 22, fontWeight: 900, color: '#111', margin: 0 }}>
          {showArchived ? '📦 Archived Notes' : '📝 Notes'}
        </h1>
        <a href={showArchived ? '/member/notes' : '/member/notes?archived=1'}
          style={{ fontSize: 12, fontWeight: 700, color: showArchived ? '#DE1A1A' : '#6B7280', textDecoration: 'none', padding: '5px 12px', borderRadius: 20, border: '1.5px solid currentColor', marginLeft: 'auto' }}>
          {showArchived ? '← Back to Notes' : '📦 Archived'}
        </a>
      </div>

      {/* Search */}
      <div style={{ position: 'relative', marginBottom: 16 }}>
        <Search size={14} style={{ position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)', color: '#9CA3AF' }} />
        <input
          value={searchQuery}
          onChange={e => setSearchQuery(e.target.value)}
          placeholder="Search notes…"
          style={{ width: '100%', padding: '10px 14px 10px 36px', borderRadius: 12, border: '1.5px solid #E2E8F0', fontSize: 13, background: '#FFFFFF', outline: 'none', boxSizing: 'border-box' }}
        />
        {searchQuery && (
          <button onClick={() => setSearchQuery('')} style={{ position: 'absolute', right: 10, top: '50%', transform: 'translateY(-50%)', background: 'none', border: 'none', cursor: 'pointer', padding: 2 }}>
            <X size={14} color="#9CA3AF" />
          </button>
        )}
      </div>

      {/* Label filter */}
      {allLabels.length > 0 && (
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 16 }}>
          <button onClick={() => setLabelFilter('')}
            style={{ padding: '4px 12px', borderRadius: 20, fontSize: 11, fontWeight: 700, cursor: 'pointer', border: `1.5px solid ${labelFilter === '' ? '#DE1A1A' : '#E5E7EB'}`, background: labelFilter === '' ? 'rgba(222,26,26,0.08)' : '#FFFFFF', color: labelFilter === '' ? '#DE1A1A' : '#6B7280' }}>
            All
          </button>
          {allLabels.map(l => (
            <button key={l} onClick={() => setLabelFilter(labelFilter === l ? '' : l)}
              style={{ display: 'flex', alignItems: 'center', gap: 4, padding: '4px 12px', borderRadius: 20, fontSize: 11, fontWeight: 700, cursor: 'pointer', border: `1.5px solid ${labelFilter === l ? '#DE1A1A' : '#E5E7EB'}`, background: labelFilter === l ? 'rgba(222,26,26,0.08)' : '#FFFFFF', color: labelFilter === l ? '#DE1A1A' : '#6B7280' }}>
              <Tag size={10} />{l}
            </button>
          ))}
        </div>
      )}

      {/* Quick-create bar (only in normal view) */}
      {!showArchived && (
        editorOpen && !editingNote ? (
          <InlineEditor
            draft={draft} setDraft={setDraft}
            allLabels={allLabels}
            onSave={handleSave} onCancel={closeEditor}
            isPending={isPending} error={error}
          />
        ) : (
          <div style={{ background: '#FFFFFF', borderRadius: 12, border: '1.5px solid #E2E8F0', padding: '12px 16px', marginBottom: 20, display: 'flex', alignItems: 'center', gap: 10, boxShadow: '0 1px 6px rgba(0,0,0,0.06)' }}>
            <input
              readOnly
              onClick={() => openCreate('text')}
              placeholder="Take a note…"
              style={{ flex: 1, background: 'transparent', border: 'none', outline: 'none', fontSize: 14, color: '#9CA3AF', cursor: 'pointer', fontFamily: 'inherit' }}
            />
            <button onClick={() => openCreate('checklist')} title="New checklist"
              style={{ padding: '6px', borderRadius: 8, border: '1.5px solid #E2E8F0', background: '#FAFAFA', cursor: 'pointer', display: 'flex', alignItems: 'center' }}>
              <CheckSquare size={15} color="#6B7280" />
            </button>
            <button onClick={() => openCreate('text')}
              style={{ padding: '6px 12px', borderRadius: 8, border: 'none', background: '#DE1A1A', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 5 }}>
              <Plus size={13} color="#fff" />
              <span style={{ fontSize: 12, fontWeight: 700, color: '#fff' }}>Note</span>
            </button>
          </div>
        )
      )}

      {/* Edit modal overlay */}
      {editorOpen && editingNote && (
        <div style={{ position: 'fixed', inset: 0, zIndex: 100, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}>
          <div style={{ position: 'absolute', inset: 0, background: 'rgba(0,0,0,0.5)', backdropFilter: 'blur(4px)' }} onClick={closeEditor} />
          <div style={{ position: 'relative', width: '100%', maxWidth: 520 }}>
            <InlineEditor
              draft={draft} setDraft={setDraft}
              allLabels={allLabels}
              onSave={handleSave} onCancel={closeEditor}
              isPending={isPending} error={error}
            />
          </div>
        </div>
      )}

      {/* Empty state */}
      {filtered.length === 0 ? (
        <div style={{ textAlign: 'center', paddingTop: 60 }}>
          <p style={{ fontSize: 32, marginBottom: 12 }}>{showArchived ? '📭' : '📝'}</p>
          <p style={{ fontSize: 15, fontWeight: 700, color: '#374151', marginBottom: 6 }}>
            {showArchived ? 'No archived notes' : searchQuery || labelFilter ? 'No matching notes' : 'No notes yet'}
          </p>
          <p style={{ fontSize: 13, color: '#9CA3AF' }}>
            {showArchived ? 'Notes you archive will appear here.' : 'Click "Take a note…" above to get started.'}
          </p>
        </div>
      ) : (
        <>
          {/* Pinned section */}
          {pinned.length > 0 && (
            <div style={{ marginBottom: 8 }}>
              <p style={{ fontSize: 10, fontWeight: 700, color: '#9CA3AF', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 8 }}>📌 Pinned</p>
              <div style={{ columnCount: 3, columnGap: 12 }} className="notes-grid">
                {pinned.map(note => (
                  <NoteCard key={note.id} note={note} onEdit={openEdit} onPin={handlePin} onArchive={handleArchive} onDelete={handleDelete} showArchived={showArchived} />
                ))}
              </div>
            </div>
          )}

          {/* Other notes */}
          {others.length > 0 && (
            <div>
              {pinned.length > 0 && (
                <p style={{ fontSize: 10, fontWeight: 700, color: '#9CA3AF', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 8 }}>Other Notes</p>
              )}
              <div style={{ columnCount: 3, columnGap: 12 }} className="notes-grid">
                {others.map(note => (
                  <NoteCard key={note.id} note={note} onEdit={openEdit} onPin={handlePin} onArchive={handleArchive} onDelete={handleDelete} showArchived={showArchived} />
                ))}
              </div>
            </div>
          )}
        </>
      )}

      {/* Responsive masonry */}
      <style>{`
        @media (max-width: 767px)  { .notes-grid { column-count: 1 !important; } }
        @media (min-width: 768px) and (max-width: 1023px) { .notes-grid { column-count: 2 !important; } }
      `}</style>
    </div>
  )
}
