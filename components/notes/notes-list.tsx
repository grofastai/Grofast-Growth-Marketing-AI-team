'use client'
import { useState } from 'react'
import { Pin, Bell, Lock, Globe, BookOpen, Trash2 } from 'lucide-react'
import type { HubNote, Folder } from './types'

const scopeBadge = (s: string) =>
  s === 'team' ? { icon: <Globe size={11}/>, label: 'Team', c: '#2563EB' }
  : s === 'sop' ? { icon: <BookOpen size={11}/>, label: 'SOP', c: '#7C3AED' }
  : { icon: <Lock size={11}/>, label: 'Private', c: '#6B7280' }

export function NotesList({ notes, folders, activeId, sort, onSort, onSelect, onDelete }: {
  notes: HubNote[]; folders: Folder[]; activeId: string | null
  sort: 'newest' | 'oldest' | 'edited'; onSort: (s: 'newest' | 'oldest' | 'edited') => void
  onSelect: (id: string) => void
  onDelete: (id: string) => void
}) {
  const [hoverId, setHoverId] = useState<string | null>(null)
  const fname = (id: string | null) => folders.find(f => f.id === id)?.name ?? ''
  const sorted = [...notes].sort((a, b) =>
    sort === 'oldest' ? +new Date(a.created_at) - +new Date(b.created_at)
    : sort === 'edited' ? +new Date(b.updated_at) - +new Date(a.updated_at)
    : +new Date(b.created_at) - +new Date(a.created_at))
  return (
    <div style={{ width: 320, flexShrink: 0, borderRight: '1px solid #F1F1F4', display: 'flex', flexDirection: 'column', background: '#FAFAFB' }}>
      <div style={{ padding: 12 }}>
        <select value={sort} onChange={e => onSort(e.target.value as 'newest' | 'oldest' | 'edited')}
          style={{ fontSize: 12, padding: '4px 8px', borderRadius: 8, border: '1px solid #E5E7EB' }}>
          <option value="newest">Newest</option><option value="oldest">Oldest</option><option value="edited">Recently Edited</option>
        </select>
      </div>
      <div style={{ flex: 1, overflowY: 'auto', padding: '0 12px 12px', display: 'flex', flexDirection: 'column', gap: 8 }}>
        {sorted.map(n => {
          const b = scopeBadge(n.scope)
          return (
            <div key={n.id}
              onClick={() => onSelect(n.id)}
              onMouseEnter={() => setHoverId(n.id)}
              onMouseLeave={() => setHoverId(null)}
              style={{ position: 'relative', background: activeId === n.id ? 'rgba(222,26,26,0.06)' : '#fff', borderRadius: 14,
                border: activeId === n.id ? '1px solid rgba(222,26,26,0.3)' : '1px solid #F1F1F4',
                padding: 12, cursor: 'pointer', boxShadow: '0 1px 4px rgba(0,0,0,0.04)' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 8 }}>
                <span style={{ fontWeight: 700, fontSize: 14, color: '#111' }}>{n.title || 'Untitled'}</span>
                <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                  {n.pinned && <Pin size={13} color="#DE1A1A" />}
                  {hoverId === n.id && (
                    <button
                      onClick={e => { e.stopPropagation(); if (confirm(`Delete "${n.title || 'Untitled'}"? This cannot be undone.`)) onDelete(n.id) }}
                      title="Delete note"
                      style={{ background: 'transparent', border: 'none', cursor: 'pointer', color: '#EF4444', padding: 2, display: 'flex', alignItems: 'center' }}>
                      <Trash2 size={13} />
                    </button>
                  )}
                </div>
              </div>
              <div style={{ fontSize: 12, color: '#9CA3AF', margin: '4px 0', overflow: 'hidden', display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical' }}>{n.content}</div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 11, color: '#9CA3AF' }}>
                <span style={{ display: 'inline-flex', alignItems: 'center', gap: 3, color: b.c }}>{b.icon}{b.label}</span>
                {fname(n.folder_id) && <span>· {fname(n.folder_id)}</span>}
                {n.reminder_at && !n.reminded && <Bell size={11} color="#F59E0B" />}
              </div>
            </div>
          )
        })}
        {sorted.length === 0 && <div style={{ textAlign: 'center', color: '#9CA3AF', fontSize: 13, padding: 20 }}>No notes here yet.</div>}
      </div>
    </div>
  )
}
