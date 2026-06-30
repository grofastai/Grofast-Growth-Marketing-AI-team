'use client'
import { useEffect, useState, useTransition } from 'react'
import { X } from 'lucide-react'
import { shareNote, unshareNote, getNoteShares } from '@/lib/actions/notes'
import type { TeamMember } from './types'

export function SharePopup({ noteId, teamMembers, onClose }: {
  noteId: string; teamMembers: TeamMember[]; onClose: () => void
}) {
  const [shares, setShares] = useState<{ shared_with: string; permission: 'view' | 'edit' }[]>([])
  const [picked, setPicked] = useState<Record<string, boolean>>({})
  const [perm, setPerm] = useState<'view' | 'edit'>('view')
  const [busy, start] = useTransition()
  const nameOf = (id: string) => teamMembers.find(m => m.id === id)?.name ?? id

  useEffect(() => { getNoteShares(noteId).then(setShares) }, [noteId])

  const doShare = () => start(async () => {
    const ids = Object.keys(picked).filter(k => picked[k])
    if (ids.length) await shareNote(noteId, ids, perm)
    setPicked({}); setShares(await getNoteShares(noteId))
  })
  const remove = (uid: string) => start(async () => { await unshareNote(noteId, uid); setShares(await getNoteShares(noteId)) })

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.4)', zIndex: 50, display: 'grid', placeItems: 'center' }} onClick={onClose}>
      <div onClick={e => e.stopPropagation()} style={{ width: 380, background: '#fff', borderRadius: 16, padding: 18 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
          <strong style={{ fontSize: 15 }}>Share note</strong>
          <button onClick={onClose} style={{ border: 'none', background: 'transparent', cursor: 'pointer' }}><X size={16} /></button>
        </div>
        <div style={{ display: 'flex', gap: 6, marginBottom: 10 }}>
          {(['view', 'edit'] as const).map(p => (
            <button key={p} onClick={() => setPerm(p)}
              style={{ fontSize: 12, padding: '4px 12px', borderRadius: 99, border: 'none', cursor: 'pointer',
                background: perm === p ? '#DE1A1A' : '#F3F4F6', color: perm === p ? '#fff' : '#6B7280' }}>
              {p === 'view' ? 'Can view' : 'Can edit'}
            </button>
          ))}
        </div>
        <div style={{ maxHeight: 180, overflowY: 'auto', border: '1px solid #F1F1F4', borderRadius: 10, padding: 6, marginBottom: 10 }}>
          {teamMembers.map(m => (
            <label key={m.id} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '5px 6px', fontSize: 13, cursor: 'pointer' }}>
              <input type="checkbox" checked={!!picked[m.id]} onChange={e => setPicked(p => ({ ...p, [m.id]: e.target.checked }))} />
              {m.name}
            </label>
          ))}
        </div>
        <button onClick={doShare} disabled={busy}
          style={{ width: '100%', background: '#DE1A1A', color: '#fff', border: 'none', borderRadius: 10, padding: '9px', fontWeight: 700, cursor: 'pointer', opacity: busy ? 0.6 : 1 }}>
          Share Note
        </button>
        {shares.length > 0 && (
          <div style={{ marginTop: 12 }}>
            <div style={{ fontSize: 11, color: '#9CA3AF', marginBottom: 4 }}>SHARED WITH</div>
            {shares.map(s => (
              <div key={s.shared_with} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: 13, padding: '3px 0' }}>
                <span>{nameOf(s.shared_with)} <span style={{ color: '#9CA3AF', fontSize: 11 }}>· {s.permission}</span></span>
                <button onClick={() => remove(s.shared_with)} style={{ border: 'none', background: 'transparent', color: '#DE1A1A', cursor: 'pointer', fontSize: 12 }}>Remove</button>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
