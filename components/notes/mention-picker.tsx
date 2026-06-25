'use client'
import { useState } from 'react'
import type { TeamMember } from './types'

export function MentionPicker({ teamMembers, onPick, onClose }: {
  teamMembers: TeamMember[]; onPick: (m: TeamMember) => void; onClose: () => void
}) {
  const [q, setQ] = useState('')
  const list = teamMembers.filter(m => m.name.toLowerCase().includes(q.toLowerCase()))
  return (
    <div style={{ position: 'absolute', bottom: 52, left: 16, width: 240, background: '#fff', borderRadius: 12,
      boxShadow: '0 8px 28px rgba(0,0,0,0.18)', border: '1px solid #F1F1F4', zIndex: 20, padding: 8 }}>
      <input autoFocus value={q} onChange={e => setQ(e.target.value)} placeholder="Mention teammate…"
        onKeyDown={e => { if (e.key === 'Escape') onClose() }}
        style={{ width: '100%', padding: '6px 8px', borderRadius: 8, border: '1px solid #E5E7EB', fontSize: 13, marginBottom: 6, boxSizing: 'border-box' }} />
      <div style={{ maxHeight: 180, overflowY: 'auto' }}>
        {list.map(m => (
          <div key={m.id} onClick={() => onPick(m)}
            style={{ padding: '7px 8px', borderRadius: 8, cursor: 'pointer', fontSize: 13 }}
            onMouseEnter={e => (e.currentTarget as HTMLElement).style.background = '#F9FAFB'}
            onMouseLeave={e => (e.currentTarget as HTMLElement).style.background = 'transparent'}>
            {m.name} <span style={{ color: '#9CA3AF', fontSize: 11 }}>#{m.employee_id}</span>
          </div>
        ))}
        {list.length === 0 && <div style={{ padding: 8, color: '#9CA3AF', fontSize: 12 }}>No matches</div>}
      </div>
    </div>
  )
}
