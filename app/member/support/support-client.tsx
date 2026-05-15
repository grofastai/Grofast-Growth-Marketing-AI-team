'use client'

import { useState, useTransition } from 'react'
import { createTicket } from '@/lib/actions/support'

type Response = { id: string; responder_name: string; message: string; created_at: string }
type Ticket = {
  id: string
  title: string
  category: string
  description: string
  status: string
  priority: string
  created_at: string
  support_responses: Response[]
}

const STATUS_BG: Record<string, string> = {
  open:        'rgba(245,158,11,0.1)',
  in_progress: 'rgba(59,130,246,0.1)',
  resolved:    'rgba(34,197,94,0.1)',
  closed:      'rgba(107,114,128,0.1)',
}
const STATUS_COLOR: Record<string, string> = {
  open:        '#D97706',
  in_progress: '#2563EB',
  resolved:    '#16A34A',
  closed:      '#6B7280',
}
const STATUS_LABEL: Record<string, string> = {
  open:        'Open',
  in_progress: 'In Progress',
  resolved:    'Resolved',
  closed:      'Closed',
}

export default function MemberSupportClient({ tickets }: { tickets: Ticket[] }) {
  const [title, setTitle]           = useState('')
  const [category, setCategory]     = useState('')
  const [description, setDescription] = useState('')
  const [error, setError]           = useState('')
  const [isPending, startTransition] = useTransition()

  function handleSubmit() {
    if (!title.trim())       { setError('Subject is required'); return }
    if (!description.trim()) { setError('Message is required'); return }
    setError('')
    startTransition(async () => {
      const result = await createTicket({
        title,
        category: category || 'General',
        description,
        priority: 'normal',
      })
      if (result.success) {
        setTitle('')
        setCategory('')
        setDescription('')
      } else {
        setError(result.error ?? 'Failed to submit request')
      }
    })
  }

  return (
    <div style={{ background: '#F8F9FC', minHeight: '100vh' }}>

      {/* ── TOPBAR ── */}
      <div style={{ background: '#fff', borderBottom: '1px solid #EBEDF2', padding: '16px 28px' }}>
        <h1 style={{ fontSize: 26, fontWeight: 900, color: '#111111', margin: 0 }}>Support</h1>
        <p style={{ fontSize: 12, color: '#9CA3AF', margin: '3px 0 0' }}>Raise a ticket and we&apos;ll get back to you</p>
      </div>

      <div style={{ padding: '20px 28px 40px' }}>

        {/* ── NEW SUPPORT REQUEST FORM ── */}
        <div style={{ background: '#FFFFFF', borderRadius: 20, border: '1px solid #EBEDF2', padding: '20px 22px', boxShadow: '0 2px 10px rgba(0,0,0,0.05)', marginBottom: 20 }}>
          <h2 style={{ fontSize: 16, fontWeight: 800, color: '#111111', margin: '0 0 16px' }}>New Support Request</h2>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            <input
              value={title}
              onChange={e => setTitle(e.target.value)}
              placeholder="Subject…"
              style={{ background: '#F9FAFB', border: '1.5px solid #EBEDF2', borderRadius: 10, padding: '10px 14px', fontSize: 13, color: '#111827', outline: 'none' }}
            />
            <select
              value={category}
              onChange={e => setCategory(e.target.value)}
              style={{ background: '#F9FAFB', border: '1.5px solid #EBEDF2', borderRadius: 10, padding: '10px 14px', fontSize: 13, color: category ? '#111827' : '#9CA3AF', outline: 'none' }}
            >
              <option value="">Category…</option>
              <option value="Technical">Technical</option>
              <option value="HR">HR</option>
              <option value="General">General</option>
            </select>
            <textarea
              value={description}
              onChange={e => setDescription(e.target.value)}
              placeholder="Describe your issue…"
              rows={4}
              style={{ background: '#F9FAFB', border: '1.5px solid #EBEDF2', borderRadius: 10, padding: '10px 14px', fontSize: 13, color: '#111827', outline: 'none', resize: 'vertical' }}
            />
            {error && (
              <p style={{ fontSize: 12, color: '#DE1A1A', fontWeight: 600, margin: 0 }}>{error}</p>
            )}
            <button
              onClick={handleSubmit}
              disabled={isPending || !title.trim() || !description.trim()}
              style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, padding: '12px 24px', borderRadius: 14, background: '#DE1A1A', color: '#FFFFFF', border: 'none', cursor: isPending ? 'not-allowed' : 'pointer', fontSize: 13, fontWeight: 700, opacity: isPending ? 0.7 : 1 }}
            >
              {isPending ? 'Submitting…' : 'Submit Request'}
            </button>
          </div>
        </div>

        {/* ── YOUR TICKETS ── */}
        <div>
          <h2 style={{ fontSize: 15, fontWeight: 800, color: '#111111', margin: '0 0 12px' }}>Your Tickets</h2>

          {tickets.length === 0 ? (
            <div style={{ background: '#FFFFFF', borderRadius: 16, border: '1px solid #EBEDF2', padding: '40px 24px', textAlign: 'center' }}>
              <p style={{ fontSize: 14, color: '#6B7280', margin: 0 }}>No tickets yet. Submit a request above.</p>
            </div>
          ) : (
            tickets.map(ticket => {
              const latestReply = ticket.support_responses?.[0]
              return (
                <div key={ticket.id} style={{ background: '#FFFFFF', borderRadius: 16, border: '1px solid #EBEDF2', padding: '16px 20px', marginBottom: 10 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12 }}>
                    <div style={{ minWidth: 0 }}>
                      <p style={{ fontSize: 14, fontWeight: 700, color: '#111111', margin: '0 0 4px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {ticket.title}
                      </p>
                      <p style={{ fontSize: 11, color: '#9CA3AF', margin: 0 }}>
                        {ticket.category} · {new Date(ticket.created_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                      </p>
                    </div>
                    <span style={{
                      display: 'inline-flex', alignItems: 'center', padding: '4px 10px', borderRadius: 99, fontSize: 11, fontWeight: 700, flexShrink: 0,
                      background: STATUS_BG[ticket.status] ?? 'rgba(107,114,128,0.1)',
                      color: STATUS_COLOR[ticket.status] ?? '#6B7280',
                    }}>
                      {STATUS_LABEL[ticket.status] ?? ticket.status}
                    </span>
                  </div>
                  {latestReply && (
                    <div style={{ marginTop: 10, paddingTop: 10, borderTop: '1px solid #F3F4F6' }}>
                      <p style={{ fontSize: 12, color: '#6B7280', margin: 0 }}>
                        <span style={{ fontWeight: 700, color: '#374151' }}>Reply: </span>{latestReply.message}
                      </p>
                    </div>
                  )}
                </div>
              )
            })
          )}
        </div>
      </div>
    </div>
  )
}
