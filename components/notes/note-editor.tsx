'use client'
import { useEditor, EditorContent } from '@tiptap/react'
import StarterKit from '@tiptap/starter-kit'
import TaskList from '@tiptap/extension-task-list'
import TaskItem from '@tiptap/extension-task-item'
import { Table } from '@tiptap/extension-table'
import TableRow from '@tiptap/extension-table-row'
import TableCell from '@tiptap/extension-table-cell'
import TableHeader from '@tiptap/extension-table-header'
import Mention from '@tiptap/extension-mention'
import { useEffect, useState } from 'react'
import { AtSign, Share2 } from 'lucide-react'
import { TiptapToolbar } from './tiptap-toolbar'
import { MentionPicker } from './mention-picker'
import { VoiceRecorder } from './voice-recorder'
import { ExportMenu } from './export-menu'
import type { HubNote, Folder, NoteScope, TeamMember } from './types'

// StarterKit v3 already bundles Underline + Link; configure (don't re-register) them.
const EXT = [
  StarterKit.configure({ link: { openOnClick: false } }),
  TaskList,
  TaskItem.configure({ nested: true }),
  Table.configure({ resizable: false }),
  TableRow,
  TableCell,
  TableHeader,
  Mention.configure({
    HTMLAttributes: { class: 'note-mention' },
    renderText: ({ node }) => `@${node.attrs.label ?? node.attrs.id}`,
  }),
]

export function NoteEditor({ note, folders, canEdit, isAdmin, teamMembers, onSave, onShare, saving }: {
  note: HubNote | null; folders: Folder[]; canEdit: boolean; isAdmin: boolean
  teamMembers: TeamMember[]
  onSave: (p: { title: string; body: unknown; scope: NoteScope; folder_id: string | null }) => void | Promise<void>
  onShare: () => void
  saving: boolean
}) {
  const [title, setTitle] = useState(note?.title ?? '')
  const [scope, setScope] = useState<NoteScope>(note?.scope ?? 'private')
  const [folderId, setFolderId] = useState<string | null>(note?.folder_id ?? null)
  const [showMention, setShowMention] = useState(false)
  const [saved, setSaved] = useState(false)
  const editor = useEditor({
    extensions: EXT, editable: canEdit, immediatelyRender: false,
    content: (note?.body && typeof note.body === 'object' && Object.keys(note.body as object).length
      ? (note.body as object)
      : { type: 'doc', content: [] }),
  }, [note?.id])

  // Note: the parent remounts this component via a `key` on note id, so local
  // useState initializes fresh per note — no syncing effect needed here.
  useEffect(() => { editor?.setEditable(canEdit) }, [editor, canEdit])

  if (!note) return (
    <div style={{ flex: 1, display: 'grid', placeItems: 'center', color: '#9CA3AF', fontSize: 14 }}>
      Select a note, or click <strong style={{ margin: '0 4px' }}>+ New Note</strong> to start.
    </div>
  )

  const save = async () => {
    await onSave({ title, body: editor?.getJSON() ?? { type: 'doc', content: [] }, scope, folder_id: folderId })
    setSaved(true)
    setTimeout(() => setSaved(false), 2000)
  }
  const insertMention = (m: TeamMember) => {
    editor?.chain().focus().insertContent({ type: 'mention', attrs: { id: m.id, label: m.name } }).insertContent(' ').run()
    setShowMention(false)
  }

  return (
    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', minWidth: 0, background: '#fff' }}>
      <input value={title} onChange={e => setTitle(e.target.value)} disabled={!canEdit}
        placeholder="Untitled Note"
        style={{ fontSize: 22, fontWeight: 800, border: 'none', outline: 'none', padding: '16px 20px 8px', fontFamily: 'var(--font-jakarta)', background: 'transparent' }} />
      <div style={{ display: 'flex', gap: 10, padding: '0 20px 10px', alignItems: 'center', flexWrap: 'wrap' }}>
        <select value={folderId ?? ''} onChange={e => setFolderId(e.target.value || null)} disabled={!canEdit}
          style={{ fontSize: 12, padding: '4px 8px', borderRadius: 8, border: '1px solid #E5E7EB' }}>
          <option value="">No folder</option>
          {folders.map(f => <option key={f.id} value={f.id}>{f.icon} {f.name}</option>)}
        </select>
        {(['private', 'team', 'sop'] as NoteScope[]).map(s => {
          const locked = s === 'sop' && !isAdmin
          return (
            <button key={s} type="button" disabled={!canEdit || locked} onClick={() => setScope(s)}
              title={locked ? 'Only admins can use SOP scope' : undefined}
              style={{ fontSize: 12, padding: '4px 12px', borderRadius: 99, border: 'none',
                cursor: (!canEdit || locked) ? 'not-allowed' : 'pointer', opacity: locked ? 0.45 : 1,
                background: scope === s ? '#DE1A1A' : '#F3F4F6', color: scope === s ? '#fff' : '#6B7280' }}>
              {s === 'private' ? 'Private' : s === 'team' ? 'Team' : 'SOP'}
            </button>
          )
        })}
      </div>
      <div style={{ border: '1px solid #F1F1F4', borderRadius: 14, margin: '0 16px 16px', display: 'flex', flexDirection: 'column', flex: 1, overflow: 'hidden' }}>
        {canEdit && <TiptapToolbar editor={editor} />}
        <div style={{ flex: 1, overflowY: 'auto', padding: '12px 16px' }}>
          <EditorContent editor={editor} />
        </div>
      </div>
      {canEdit && note.id && <div style={{ padding: '0 16px 12px' }}><VoiceRecorder noteId={note.id} /></div>}
      {canEdit && (
        <div style={{ position: 'relative', padding: '10px 16px', borderTop: '1px solid #F1F1F4', display: 'flex', alignItems: 'center', gap: 8 }}>
          <button type="button" onClick={() => setShowMention(s => !s)} title="Mention"
            style={{ display: 'flex', alignItems: 'center', gap: 5, background: '#F3F4F6', border: 'none', borderRadius: 8, padding: '7px 12px', fontSize: 12, fontWeight: 600, cursor: 'pointer', color: '#374151' }}>
            <AtSign size={14} /> Mention
          </button>
          {note.id && (
            <button type="button" onClick={onShare} title="Share"
              style={{ display: 'flex', alignItems: 'center', gap: 5, background: '#F3F4F6', border: 'none', borderRadius: 8, padding: '7px 12px', fontSize: 12, fontWeight: 600, cursor: 'pointer', color: '#374151' }}>
              <Share2 size={14} /> Share
            </button>
          )}
          {note.id && <ExportMenu title={title} getHtml={() => editor?.getHTML() ?? ''} />}
          <div style={{ flex: 1 }} />
          <button onClick={save} disabled={saving}
            style={{ background: saved ? '#16A34A' : '#DE1A1A', color: '#fff', border: 'none', borderRadius: 10, padding: '8px 20px', fontWeight: 700, cursor: 'pointer', opacity: saving ? 0.6 : 1, transition: 'background 0.2s' }}>
            {saving ? 'Saving…' : saved ? '✓ Saved' : 'Save'}
          </button>
          {showMention && <MentionPicker teamMembers={teamMembers} onPick={insertMention} onClose={() => setShowMention(false)} />}
        </div>
      )}
    </div>
  )
}
