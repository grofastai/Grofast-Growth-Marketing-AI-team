'use client'

import { useState } from 'react'
import { XCircle, Pencil, Trash2, Check, X as XIcon } from 'lucide-react'
import { STATUS, STATUS_FLOW, type StatusKey } from '@/lib/support-tokens'

// Split a message body into text + inline image parts. Attachments are stored
// as a line beginning with [img]<url>.
export function bodyParts(msg: string): { text: string; images: string[] } {
  const images: string[] = []
  const text = (msg ?? '')
    .split('\n')
    .filter(line => {
      if (line.startsWith('[img]')) { images.push(line.slice(5)); return false }
      return true
    })
    .join('\n')
    .trim()
  return { text, images }
}

// A chat bubble. `side` is relative to the current viewer:
// 'right' = the viewer's own message (brand red), 'left' = the other party (white).
//
// `mine` is deliberately separate from `side`: on the admin Support Inbox
// every handler's reply renders on the "right" side as one unified voice,
// but only the specific admin who actually wrote a given reply may edit or
// delete it — `mine` carries that per-message ownership check.
export function Bubble({ id, side, body, who, time, mine, editedAt, onEdit, onDelete, busy }: {
  id?: string
  side: 'right' | 'left'
  body: string
  who: string
  time: string
  mine?: boolean
  editedAt?: string | null
  onEdit?: (id: string, message: string) => void
  onDelete?: (id: string) => void
  busy?: boolean
}) {
  const { text, images } = bodyParts(body)
  const right = side === 'right'
  const canManage = !!(mine && id && (onEdit || onDelete))

  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState(text)
  const [confirmDelete, setConfirmDelete] = useState(false)

  function startEdit() {
    setDraft(text)
    setConfirmDelete(false)
    setEditing(true)
  }

  function saveEdit() {
    if (!id || !onEdit) return
    const next = draft.trim()
    if (!next && !images.length) return
    const rebuilt = images.length ? [next, ...images.map(u => `[img]${u}`)].filter(Boolean).join('\n') : next
    onEdit(id, rebuilt)
    setEditing(false)
  }

  return (
    <div className="sd-msg" style={{ display: 'flex', flexDirection: 'column', alignItems: right ? 'flex-end' : 'flex-start' }}>
      <span style={{ fontSize: 10.5, color: '#9CA3AF', margin: right ? '0 6px 4px 0' : '0 0 4px 8px', fontWeight: 600 }}>{who}</span>

      <div style={{ display: 'flex', alignItems: 'flex-start', gap: 4, flexDirection: right ? 'row-reverse' : 'row' }}>
        {canManage && !editing && (
          <div style={{ display: 'flex', gap: 2, marginTop: 2, flexShrink: 0 }}>
            {onEdit && (
              <button onClick={startEdit} disabled={busy} title="Edit message"
                style={{ width: 22, height: 22, borderRadius: 7, border: '1px solid rgba(10,16,13,0.08)', background: '#FFFFFF', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: busy ? 'default' : 'pointer', color: '#8A8F99', opacity: busy ? 0.5 : 1 }}>
                <Pencil size={11} />
              </button>
            )}
            {onDelete && (confirmDelete ? (
              <>
                <button onClick={() => { setConfirmDelete(false); onDelete(id!) }} disabled={busy} title="Confirm delete"
                  style={{ width: 22, height: 22, borderRadius: 7, border: '1px solid rgba(222,26,26,0.3)', background: 'rgba(222,26,26,0.08)', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: busy ? 'default' : 'pointer', color: '#DE1A1A' }}>
                  <Check size={11} />
                </button>
                <button onClick={() => setConfirmDelete(false)} title="Cancel"
                  style={{ width: 22, height: 22, borderRadius: 7, border: '1px solid rgba(10,16,13,0.08)', background: '#FFFFFF', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', color: '#8A8F99' }}>
                  <XIcon size={11} />
                </button>
              </>
            ) : (
              <button onClick={() => setConfirmDelete(true)} disabled={busy} title="Delete message"
                style={{ width: 22, height: 22, borderRadius: 7, border: '1px solid rgba(10,16,13,0.08)', background: '#FFFFFF', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: busy ? 'default' : 'pointer', color: '#8A8F99', opacity: busy ? 0.5 : 1 }}>
                <Trash2 size={11} />
              </button>
            ))}
          </div>
        )}

        <div style={{
          maxWidth: 'min(78%, 380px)',
          padding: images.length && !text && !editing ? 5 : '10px 13px',
          borderRadius: right ? '16px 5px 16px 16px' : '5px 16px 16px 16px',
          background: right ? 'linear-gradient(135deg,#DE1A1A,#9B0F0F)' : '#FFFFFF',
          color: right ? '#FFFFFF' : '#1F2430',
          border: right ? 'none' : '1px solid rgba(10,16,13,0.07)',
          boxShadow: right ? '0 4px 14px rgba(222,26,26,0.22)' : '0 1px 5px rgba(0,0,0,0.05)',
          fontSize: 13.5, lineHeight: 1.5, wordBreak: 'break-word',
        }}>
          {editing ? (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6, minWidth: 180 }}>
              <textarea autoFocus value={draft} onChange={e => setDraft(e.target.value)} rows={2}
                onKeyDown={e => {
                  if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); saveEdit() }
                  if (e.key === 'Escape') setEditing(false)
                }}
                style={{
                  resize: 'none', border: 'none', outline: 'none', fontFamily: 'inherit', fontSize: 13.5, lineHeight: 1.5,
                  background: right ? 'rgba(255,255,255,0.16)' : '#F6F7F9', color: right ? '#fff' : '#1F2430', borderRadius: 8, padding: '7px 9px',
                }} />
              <div style={{ display: 'flex', gap: 6, justifyContent: 'flex-end' }}>
                <button onClick={() => setEditing(false)}
                  style={{ fontSize: 11, fontWeight: 700, padding: '4px 10px', borderRadius: 8, border: 'none', cursor: 'pointer', background: right ? 'rgba(255,255,255,0.18)' : '#EDEFF3', color: right ? '#fff' : '#6B7280' }}>
                  Cancel
                </button>
                <button onClick={saveEdit}
                  style={{ fontSize: 11, fontWeight: 700, padding: '4px 10px', borderRadius: 8, border: 'none', cursor: 'pointer', background: right ? '#fff' : '#DE1A1A', color: right ? '#DE1A1A' : '#fff' }}>
                  Save
                </button>
              </div>
            </div>
          ) : (
            <>
              {text && <p style={{ margin: 0, whiteSpace: 'pre-wrap' }}>{text}</p>}
              {images.map((src, i) => (
                <img key={i} src={src} alt="attachment" onClick={() => window.open(src, '_blank')}
                  style={{
                    display: 'block', maxWidth: 240, maxHeight: 260, width: '100%', height: 'auto',
                    objectFit: 'contain', background: right ? 'rgba(255,255,255,0.1)' : '#F3F4F6',
                    borderRadius: 11, marginTop: text ? 8 : 0, cursor: 'zoom-in',
                  }} />
              ))}
            </>
          )}
        </div>
      </div>

      <span style={{ fontSize: 10, color: '#B6BAC2', margin: right ? '3px 8px 0 0' : '3px 0 0 8px' }}>
        {time}{editedAt ? ' · edited' : ''}
      </span>
    </div>
  )
}

// Signature element: a slim ribbon that morphs as a request progresses
// Open → In Progress → Resolved, with a Closed terminal state.
export function StatusRibbon({ status }: { status: string }) {
  const isClosed = status === 'closed'
  const activeIdx = isClosed ? STATUS_FLOW.length : STATUS_FLOW.indexOf(status as StatusKey)
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 0, padding: '0 4px' }}>
      {STATUS_FLOW.map((s, i) => {
        const reached = i <= activeIdx
        const tok = STATUS[s]
        return (
          <div key={s} style={{ display: 'flex', alignItems: 'center', flex: i === STATUS_FLOW.length - 1 ? '0 0 auto' : 1 }}>
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4, flexShrink: 0 }}>
              <span className="sd-ribbon-dot" style={{
                width: i === activeIdx ? 11 : 9, height: i === activeIdx ? 11 : 9, borderRadius: '50%',
                background: reached ? tok.ring : '#E3E5EA',
                boxShadow: i === activeIdx ? `0 0 0 4px ${tok.bg}` : 'none',
                transition: 'all .4s ease',
              }} />
              <span style={{ fontSize: 9.5, fontWeight: 700, letterSpacing: '0.02em',
                color: reached ? tok.color : '#B6BAC2', transition: 'color .4s ease' }}>{tok.label}</span>
            </div>
            {i < STATUS_FLOW.length - 1 && (
              <div style={{ flex: 1, height: 3, margin: '0 8px', borderRadius: 99, background: '#EDEFF3', overflow: 'hidden', position: 'relative', top: -8 }}>
                <div style={{ height: '100%', borderRadius: 99,
                  width: i < activeIdx ? '100%' : '0%',
                  background: STATUS[STATUS_FLOW[i + 1]].ring, transition: 'width .5s ease' }} />
              </div>
            )}
          </div>
        )
      })}
      {isClosed && (
        <span style={{ marginLeft: 10, fontSize: 10, fontWeight: 700, color: '#6B7280', display: 'inline-flex', alignItems: 'center', gap: 4 }}>
          <XCircle size={12} /> Closed
        </span>
      )}
    </div>
  )
}

// Shared keyframes/animation styles for both support surfaces.
export const SUPPORT_ANIM_CSS = `
  @keyframes sdRise { from { opacity: 0; transform: translateY(8px); } to { opacity: 1; transform: none; } }
  @keyframes sdFade { from { opacity: 0; } to { opacity: 1; } }
  .sd-row { animation: sdRise .32s ease both; }
  .sd-msg { animation: sdRise .26s ease both; }
  .sd-thread { animation: sdFade .25s ease both; }
  .sd-row:hover { background: #F5F6F9 !important; }
  @media (prefers-reduced-motion: reduce) {
    .sd-row, .sd-msg, .sd-thread { animation: none !important; }
    .sd-ribbon-dot { transition: none !important; }
  }
`
