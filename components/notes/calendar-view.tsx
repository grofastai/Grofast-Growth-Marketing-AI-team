'use client'
import { useState } from 'react'
import { ChevronLeft, ChevronRight } from 'lucide-react'
import { monthMatrix, bucketByDay } from '@/lib/notes/calendar'
import type { HubNote } from './types'

const MONTHS = ['January','February','March','April','May','June','July','August','September','October','November','December']
const DOW = ['Sun','Mon','Tue','Wed','Thu','Fri','Sat']

export function CalendarView({ notes, onSelect }: { notes: HubNote[]; onSelect: (id: string) => void }) {
  const today = new Date()
  const [y, setY] = useState(today.getFullYear())
  const [m, setM] = useState(today.getMonth())
  const weeks = monthMatrix(y, m)
  const buckets = bucketByDay(notes.map(n => ({ id: n.id, reminder_at: n.reminder_at })))
  const titleOf = (id: string) => notes.find(n => n.id === id)?.title || 'Untitled'
  const prev = () => { if (m === 0) { setM(11); setY(y - 1) } else setM(m - 1) }
  const next = () => { if (m === 11) { setM(0); setY(y + 1) } else setM(m + 1) }
  const key = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`

  return (
    <div style={{ flex: 1, padding: 20, overflowY: 'auto', background: '#fff' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 }}>
        <strong style={{ fontSize: 17 }}>{MONTHS[m]} {y}</strong>
        <div style={{ display: 'flex', gap: 6 }}>
          <button onClick={prev} style={{ border: '1px solid #E5E7EB', background: '#fff', borderRadius: 8, padding: 6, cursor: 'pointer' }}><ChevronLeft size={15} /></button>
          <button onClick={next} style={{ border: '1px solid #E5E7EB', background: '#fff', borderRadius: 8, padding: 6, cursor: 'pointer' }}><ChevronRight size={15} /></button>
        </div>
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7,1fr)', gap: 6 }}>
        {DOW.map(d => <div key={d} style={{ fontSize: 11, fontWeight: 700, color: '#9CA3AF', textAlign: 'center', padding: 4 }}>{d}</div>)}
        {weeks.flat().map((d, i) => (
          <div key={i} style={{ minHeight: 78, border: '1px solid #F1F1F4', borderRadius: 10, padding: 6, background: d ? '#fff' : '#FAFAFB' }}>
            {d && <>
              <div style={{ fontSize: 11, color: key(d) === key(today) ? '#DE1A1A' : '#6B7280', fontWeight: key(d) === key(today) ? 800 : 600 }}>{d.getDate()}</div>
              {(buckets[key(d)] ?? []).map(id => (
                <div key={id} onClick={() => onSelect(id)} title={titleOf(id)}
                  style={{ marginTop: 3, fontSize: 10, background: 'rgba(222,26,26,0.1)', color: '#DE1A1A', borderRadius: 5, padding: '2px 4px', cursor: 'pointer', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {titleOf(id)}
                </div>
              ))}
            </>}
          </div>
        ))}
      </div>
    </div>
  )
}
