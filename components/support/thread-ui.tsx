'use client'

import { XCircle } from 'lucide-react'
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
export function Bubble({ side, body, who, time }: {
  side: 'right' | 'left'
  body: string
  who: string
  time: string
}) {
  const { text, images } = bodyParts(body)
  const right = side === 'right'
  return (
    <div className="sd-msg" style={{ display: 'flex', flexDirection: 'column', alignItems: right ? 'flex-end' : 'flex-start' }}>
      <span style={{ fontSize: 10.5, color: '#9CA3AF', margin: right ? '0 6px 4px 0' : '0 0 4px 8px', fontWeight: 600 }}>{who}</span>
      <div style={{
        maxWidth: 'min(78%, 440px)',
        padding: images.length && !text ? 5 : '10px 13px',
        borderRadius: right ? '16px 5px 16px 16px' : '5px 16px 16px 16px',
        background: right ? 'linear-gradient(135deg,#DE1A1A,#9B0F0F)' : '#FFFFFF',
        color: right ? '#FFFFFF' : '#1F2430',
        border: right ? 'none' : '1px solid rgba(10,16,13,0.07)',
        boxShadow: right ? '0 4px 14px rgba(222,26,26,0.22)' : '0 1px 5px rgba(0,0,0,0.05)',
        fontSize: 13.5, lineHeight: 1.5, wordBreak: 'break-word',
      }}>
        {text && <p style={{ margin: 0, whiteSpace: 'pre-wrap' }}>{text}</p>}
        {images.map((src, i) => (
          <img key={i} src={src} alt="attachment" onClick={() => window.open(src, '_blank')}
            style={{ display: 'block', maxWidth: '100%', borderRadius: 11, marginTop: text ? 8 : 0, cursor: 'pointer' }} />
        ))}
      </div>
      <span style={{ fontSize: 10, color: '#B6BAC2', margin: right ? '3px 8px 0 0' : '3px 0 0 8px' }}>{time}</span>
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
