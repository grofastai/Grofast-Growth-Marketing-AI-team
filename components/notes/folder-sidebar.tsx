'use client'
import { useState } from 'react'
import { User, Globe, BookOpen, Star, Plus, Trash2 } from 'lucide-react'
import type { Folder, NoteScope } from './types'
import type { HubView } from '@/lib/notes/filter'
import { useConfirm } from '@/components/ui/ConfirmDialog'

const TABS: { key: HubView; label: string; icon: React.ReactNode }[] = [
  { key: 'mine',   label: 'My Notes',       icon: <User size={15}/> },
  { key: 'team',   label: 'Team Notes',     icon: <Globe size={15}/> },
  { key: 'sop',    label: 'SOP Library',    icon: <BookOpen size={15}/> },
  { key: 'shared', label: 'Shared With Me', icon: <Star size={15}/> },
]

export function FolderSidebar({ folders, view, activeFolderId, onView, onFolder, onNewFolder, onDeleteFolder, isAdmin }: {
  folders: Folder[]; view: HubView; activeFolderId: string | null
  onView: (v: HubView) => void; onFolder: (id: string | null) => void
  onNewFolder: (name: string, scope: NoteScope) => void
  onDeleteFolder: (id: string) => void
  isAdmin: boolean
}) {
  void isAdmin
  const confirm = useConfirm()
  const [adding, setAdding] = useState(false)
  const [name, setName] = useState('')
  const [hoverId, setHoverId] = useState<string | null>(null)
  const row = (active: boolean): React.CSSProperties => ({
    display: 'flex', alignItems: 'center', gap: 10, padding: '8px 10px', borderRadius: 10,
    cursor: 'pointer', fontSize: 13, fontWeight: 600,
    background: active ? 'rgba(222,26,26,0.08)' : 'transparent',
    color: active ? '#DE1A1A' : '#374151',
  })
  return (
    <div style={{ width: 240, flexShrink: 0, padding: 14, borderRight: '1px solid #F1F1F4', overflowY: 'auto', background: '#fff' }}>
      <div style={{ fontSize: 12, fontWeight: 800, color: '#9CA3AF', padding: '4px 10px' }}>📂 FOLDERS</div>
      {TABS.map(t => (
        <div key={t.key} style={row(view === t.key && !activeFolderId)} onClick={() => onView(t.key)}>
          {t.icon}<span>{t.label}</span>
        </div>
      ))}
      <div style={{ height: 1, background: '#F1F1F4', margin: '10px 4px' }} />
      {folders.map(f => (
        <div key={f.id} style={{ ...row(activeFolderId === f.id), position: 'relative' }}
          onClick={() => onFolder(f.id)}
          onMouseEnter={() => setHoverId(f.id)}
          onMouseLeave={() => setHoverId(null)}>
          <span>{f.icon ?? '📁'}</span>
          <span style={{ flex: 1 }}>{f.name}</span>
          <span style={{ fontSize: 11, color: '#9CA3AF' }}>{f.count}</span>
          {hoverId === f.id && (
            <button
              onClick={async e => { e.stopPropagation(); if (await confirm(`Delete folder "${f.name}"? Notes inside will not be deleted.`)) onDeleteFolder(f.id) }}
              title="Delete folder"
              style={{ marginLeft: 4, background: 'transparent', border: 'none', cursor: 'pointer', color: '#EF4444', padding: 2, display: 'flex', alignItems: 'center' }}>
              <Trash2 size={13} />
            </button>
          )}
        </div>
      ))}
      {adding ? (
        <div style={{ display: 'flex', gap: 4, padding: '6px 4px' }}>
          <input autoFocus value={name} onChange={e => setName(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter' && name.trim()) { onNewFolder(name.trim(), 'private'); setName(''); setAdding(false) }
              else if (e.key === 'Escape') { setName(''); setAdding(false) } }}
            onBlur={() => { setName(''); setAdding(false) }}
            placeholder="Folder name" style={{ flex: 1, fontSize: 12, padding: '4px 8px', borderRadius: 8, border: '1px solid #E5E7EB' }} />
        </div>
      ) : (
        <div style={{ ...row(false), color: '#6B7280' }} onClick={() => setAdding(true)}>
          <Plus size={15}/><span>New Folder</span>
        </div>
      )}
    </div>
  )
}
