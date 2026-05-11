'use client'

import { useState, useTransition } from 'react'
import { createTicket, addResponse } from '@/lib/actions/support'
import {
  Plus, Send, Loader2, X, CheckCircle2, AlertCircle, Clock, XCircle,
  Wrench, ShieldCheck, Headphones, Tag, ChevronRight, ChevronDown, ChevronUp,
  MessageCircle, Calendar
} from 'lucide-react'

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
  open:        'rgba(222,26,26,0.10)',
  in_progress: 'rgba(245,158,11,0.12)',
  resolved:    'rgba(34,197,94,0.10)',
  closed:      'rgba(107,114,128,0.10)',
}
const STATUS_COLOR: Record<string, string> = {
  open:        '#DE1A1A',
  in_progress: '#B45309',
  resolved:    '#15803D',
  closed:      '#6B7280',
}
const STATUS_DOT: Record<string, string> = {
  open:        '#DE1A1A',
  in_progress: '#F59E0B',
  resolved:    '#22C55E',
  closed:      '#9CA3AF',
}
const STATUS_LABEL: Record<string, string> = {
  open:        'Open',
  in_progress: 'In Progress',
  resolved:    'Resolved',
  closed:      'Closed',
}

const CATEGORIES = ['general', 'technical', 'hr', 'payroll', 'leave', 'other']
const PRIORITIES  = ['low', 'normal', 'high', 'urgent']
const EMPTY_FORM  = { title: '', category: 'general', description: '', priority: 'normal' }

const FEATURES = [
  { icon: <Wrench size={22} color="#DE1A1A" />,      title: 'Quick Support',    desc: 'Create a ticket and our team will get back to you.' },
  { icon: <Clock size={22} color="#DE1A1A" />,        title: 'Fast Response',    desc: 'Average response time under 24 hours.' },
  { icon: <ShieldCheck size={22} color="#DE1A1A" />,  title: 'Secure & Private', desc: 'Your data and conversations are 100% secure.' },
  { icon: <Headphones size={22} color="#DE1A1A" />,   title: 'Need Help?',       desc: 'Check our FAQ or contact support anytime.' },
]

function formatDate(dateStr: string) {
  return new Date(dateStr).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })
}

export default function MemberSupportClient({ tickets }: { tickets: Ticket[] }) {
  const [showForm, setShowForm]     = useState(false)
  const [form, setForm]             = useState(EMPTY_FORM)
  const [formError, setFormError]   = useState('')
  const [expanded, setExpanded]     = useState<string | null>(null)
  const [replyText, setReplyText]   = useState<Record<string, string>>({})
  const [filterStatus, setFilter]   = useState('all')
  const [filterOpen, setFilterOpen] = useState(false)
  const [pending, startTransition]  = useTransition()
  const [actionId, setActionId]     = useState<string | null>(null)

  function handleCreate() {
    if (!form.title.trim())       { setFormError('Title is required'); return }
    if (!form.description.trim()) { setFormError('Description is required'); return }
    setFormError('')
    setActionId('create')
    startTransition(async () => {
      const result = await createTicket(form)
      if (result.success) { setForm(EMPTY_FORM); setShowForm(false) }
      else { setFormError(result.error ?? 'Failed to create ticket') }
      setActionId(null)
    })
  }

  function handleReply(ticketId: string) {
    const msg = (replyText[ticketId] ?? '').trim()
    if (!msg) return
    setActionId(ticketId)
    startTransition(async () => {
      await addResponse({ ticket_id: ticketId, message: msg })
      setReplyText(p => ({ ...p, [ticketId]: '' }))
      setActionId(null)
    })
  }

  const filtered = filterStatus === 'all' ? tickets : tickets.filter(t => t.status === filterStatus)

  return (
    <div style={{ background: '#F8F9FC', minHeight: '100vh' }}>

      {/* ── TOPBAR ───────────────────────────────────────────────────── */}
      <div style={{ background: '#fff', borderBottom: '1px solid #EBEDF2', padding: '16px 28px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
        <div>
          <h1 style={{ fontSize: 28, fontWeight: 900, color: '#111111', fontFamily: 'var(--font-jakarta)', margin: 0 }}>
            Support
          </h1>
          <p style={{ fontSize: 12, color: '#9CA3AF', margin: '3px 0 0' }}>Raise a ticket, we&apos;ll get back to you</p>
        </div>
        <button
          onClick={() => setShowForm(v => !v)}
          style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '10px 20px', borderRadius: 12, background: '#DE1A1A', border: 'none', fontSize: 13, fontWeight: 700, color: '#fff', cursor: 'pointer', whiteSpace: 'nowrap' }}>
          {showForm ? <X size={14} /> : <Plus size={14} />}
          {showForm ? 'Cancel' : 'New Ticket'}
        </button>
      </div>

      <div style={{ padding: '20px 28px 40px' }}>

        {/* ── NEW TICKET FORM ──────────────────────────────────────────── */}
        {showForm && (
          <div style={{ background: '#fff', borderRadius: 20, border: '1px solid #EBEDF2', boxShadow: '0 4px 20px rgba(0,0,0,0.06)', padding: '24px 28px', marginBottom: 20 }}>
            <h2 style={{ fontSize: 16, fontWeight: 800, color: '#111111', margin: '0 0 18px', fontFamily: 'var(--font-jakarta)' }}>Create Support Ticket</h2>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              <input
                placeholder="Ticket title *"
                value={form.title}
                onChange={e => setForm(p => ({ ...p, title: e.target.value }))}
                style={{ width: '100%', borderRadius: 12, padding: '11px 16px', fontSize: 13, color: '#111111', background: '#F5F6FA', border: '1px solid #EBEDF2', outline: 'none', boxSizing: 'border-box' }}
              />
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                <select value={form.category} onChange={e => setForm(p => ({ ...p, category: e.target.value }))}
                  style={{ borderRadius: 12, padding: '11px 16px', fontSize: 13, color: '#111111', background: '#F5F6FA', border: '1px solid #EBEDF2', outline: 'none', textTransform: 'capitalize' }}>
                  {CATEGORIES.map(c => <option key={c} value={c}>{c.charAt(0).toUpperCase() + c.slice(1)}</option>)}
                </select>
                <select value={form.priority} onChange={e => setForm(p => ({ ...p, priority: e.target.value }))}
                  style={{ borderRadius: 12, padding: '11px 16px', fontSize: 13, color: '#111111', background: '#F5F6FA', border: '1px solid #EBEDF2', outline: 'none', textTransform: 'capitalize' }}>
                  {PRIORITIES.map(p => <option key={p} value={p}>{p.charAt(0).toUpperCase() + p.slice(1)}</option>)}
                </select>
              </div>
              <textarea
                rows={4}
                placeholder="Describe your issue in detail *"
                value={form.description}
                onChange={e => setForm(p => ({ ...p, description: e.target.value }))}
                style={{ width: '100%', borderRadius: 12, padding: '11px 16px', fontSize: 13, color: '#111111', background: '#F5F6FA', border: '1px solid #EBEDF2', outline: 'none', resize: 'none', boxSizing: 'border-box' }}
              />
            </div>
            {formError && (
              <div style={{ display: 'flex', alignItems: 'center', gap: 6, color: '#DE1A1A', fontSize: 12, marginTop: 10 }}>
                <AlertCircle size={13} /> {formError}
              </div>
            )}
            <button
              onClick={handleCreate}
              disabled={pending && actionId === 'create'}
              style={{ marginTop: 16, width: '100%', padding: '12px', borderRadius: 12, background: '#DE1A1A', border: 'none', fontSize: 13, fontWeight: 700, color: '#fff', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8 }}>
              {pending && actionId === 'create' ? <Loader2 size={14} style={{ animation: 'spin 1s linear infinite' }} /> : <Send size={14} />}
              Submit Ticket
            </button>
          </div>
        )}

        {/* ── FEATURES STRIP ───────────────────────────────────────────── */}
        <div style={{ background: '#fff', borderRadius: 20, border: '1px solid #EBEDF2', padding: '20px 28px', marginBottom: 20, display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: 0, boxShadow: '0 2px 8px rgba(0,0,0,0.04)' }}>
          {FEATURES.map((f, i) => (
            <div key={i} style={{ display: 'flex', alignItems: 'flex-start', gap: 14, paddingRight: i < 3 ? 24 : 0, borderRight: i < 3 ? '1px solid #EBEDF2' : 'none', paddingLeft: i > 0 ? 24 : 0 }}>
              <div style={{ width: 50, height: 50, borderRadius: 14, background: 'rgba(222,26,26,0.08)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                {f.icon}
              </div>
              <div>
                <p style={{ fontSize: 13, fontWeight: 800, color: '#111111', margin: '0 0 4px' }}>{f.title}</p>
                <p style={{ fontSize: 12, color: '#6B7280', margin: 0, lineHeight: 1.5 }}>{f.desc}</p>
              </div>
            </div>
          ))}
        </div>

        {/* ── YOUR TICKETS ─────────────────────────────────────────────── */}
        <div style={{ background: '#fff', borderRadius: 20, border: '1px solid #EBEDF2', boxShadow: '0 2px 8px rgba(0,0,0,0.04)', overflow: 'hidden' }}>

          {/* Section header */}
          <div style={{ padding: '20px 24px 18px', borderBottom: '1px solid #EBEDF2', display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12 }}>
            <div>
              <h2 style={{ fontSize: 16, fontWeight: 800, color: '#111111', margin: '0 0 3px', fontFamily: 'var(--font-jakarta)' }}>Your Tickets</h2>
              <p style={{ fontSize: 12, color: '#9CA3AF', margin: 0 }}>Track all your support requests in one place.</p>
            </div>
            {/* Filter dropdown */}
            <div style={{ position: 'relative' }}>
              <button onClick={() => setFilterOpen(o => !o)}
                style={{ display: 'flex', alignItems: 'center', gap: 7, padding: '8px 14px', borderRadius: 10, background: '#F5F6FA', border: '1px solid #EBEDF2', fontSize: 12, fontWeight: 600, color: '#374151', cursor: 'pointer', whiteSpace: 'nowrap' }}>
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><polygon points="22 3 2 3 10 12.46 10 19 14 21 14 12.46 22 3"/></svg>
                {filterStatus === 'all' ? 'All Tickets' : STATUS_LABEL[filterStatus] ?? filterStatus}
                <ChevronDown size={11} style={{ transform: filterOpen ? 'rotate(180deg)' : 'none', transition: '0.2s' }} />
              </button>
              {filterOpen && (
                <div style={{ position: 'absolute', top: 'calc(100% + 6px)', right: 0, background: '#fff', border: '1px solid #E5E7EB', borderRadius: 12, boxShadow: '0 8px 24px rgba(0,0,0,0.10)', zIndex: 50, minWidth: 160, overflow: 'hidden' }}>
                  {['all', 'open', 'in_progress', 'resolved', 'closed'].map(s => (
                    <button key={s} onClick={() => { setFilter(s); setFilterOpen(false) }}
                      style={{ display: 'block', width: '100%', textAlign: 'left', padding: '10px 16px', fontSize: 12, fontWeight: s === filterStatus ? 700 : 500, color: s === filterStatus ? '#DE1A1A' : '#374151', background: s === filterStatus ? 'rgba(222,26,26,0.05)' : 'transparent', border: 'none', cursor: 'pointer' }}>
                      {s === 'all' ? 'All Tickets' : STATUS_LABEL[s]}
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>

          {/* Ticket list */}
          {filtered.length === 0 ? (
            <div style={{ padding: '60px 24px 40px', display: 'flex', flexDirection: 'column', alignItems: 'center', textAlign: 'center' }}>
              {/* Headset illustration */}
              <div style={{ position: 'relative', marginBottom: 20 }}>
                <div style={{ width: 110, height: 110, borderRadius: '50%', background: 'rgba(222,26,26,0.07)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  <div style={{ width: 80, height: 80, borderRadius: '50%', background: 'rgba(222,26,26,0.10)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 38 }}>
                    🎧
                  </div>
                </div>
                {/* Chat bubble decoration */}
                <div style={{ position: 'absolute', top: 2, right: -8, width: 34, height: 28, borderRadius: 10, background: '#DE1A1A', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 3 }}>
                  <span style={{ width: 5, height: 5, borderRadius: '50%', background: '#fff' }}/>
                  <span style={{ width: 5, height: 5, borderRadius: '50%', background: '#fff' }}/>
                  <span style={{ width: 5, height: 5, borderRadius: '50%', background: '#fff' }}/>
                </div>
              </div>
              <h3 style={{ fontSize: 17, fontWeight: 800, color: '#111111', margin: '0 0 8px', fontFamily: 'var(--font-jakarta)' }}>Need help?</h3>
              <p style={{ fontSize: 13, color: '#6B7280', margin: '0 0 24px', lineHeight: 1.6, maxWidth: 320 }}>
                If you can&apos;t find what you need, feel free to create a new ticket.
              </p>
              <button onClick={() => setShowForm(true)}
                style={{ display: 'inline-flex', alignItems: 'center', gap: 8, padding: '12px 28px', borderRadius: 12, background: '#DE1A1A', border: 'none', fontSize: 13, fontWeight: 700, color: '#fff', cursor: 'pointer' }}>
                <Plus size={14} /> Create New Ticket
              </button>
            </div>
          ) : (
            <div>
              {filtered.map((ticket, idx) => {
                const isExpanded = expanded === ticket.id
                const responses  = ticket.support_responses ?? []
                return (
                  <div key={ticket.id} style={{ borderBottom: idx < filtered.length - 1 ? '1px solid #EBEDF2' : 'none' }}>
                    {/* Ticket row */}
                    <button
                      onClick={() => setExpanded(isExpanded ? null : ticket.id)}
                      style={{ width: '100%', textAlign: 'left', padding: '16px 24px', background: 'transparent', border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 14 }}>
                      {/* Icon */}
                      <div style={{ width: 44, height: 44, borderRadius: 12, background: 'rgba(222,26,26,0.08)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                        <Wrench size={19} color="#DE1A1A" />
                      </div>
                      {/* Info */}
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 5, flexWrap: 'wrap' }}>
                          <span style={{ fontSize: 14, fontWeight: 800, color: '#111111' }}>{ticket.title}</span>
                          {/* Status badge */}
                          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5, padding: '3px 10px', borderRadius: 99, background: STATUS_BG[ticket.status] ?? 'rgba(107,114,128,0.1)', fontSize: 11, fontWeight: 700, color: STATUS_COLOR[ticket.status] ?? '#6B7280' }}>
                            <span style={{ width: 6, height: 6, borderRadius: '50%', background: STATUS_DOT[ticket.status] ?? '#9CA3AF', display: 'inline-block' }} />
                            {STATUS_LABEL[ticket.status] ?? ticket.status}
                          </span>
                        </div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 14, flexWrap: 'wrap' }}>
                          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, fontSize: 11, color: '#6B7280' }}>
                            <Tag size={10} /> {ticket.category.charAt(0).toUpperCase() + ticket.category.slice(1)}
                          </span>
                          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, fontSize: 11, color: '#6B7280' }}>
                            <Calendar size={10} /> {formatDate(ticket.created_at)}
                          </span>
                          {responses.length > 0 && (
                            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, fontSize: 11, color: '#6B7280' }}>
                              <MessageCircle size={10} /> {responses.length} {responses.length === 1 ? 'reply' : 'replies'}
                            </span>
                          )}
                        </div>
                      </div>
                      {/* Chevron */}
                      <div style={{ flexShrink: 0, color: '#9CA3AF' }}>
                        {isExpanded ? <ChevronUp size={16} /> : <ChevronRight size={16} />}
                      </div>
                    </button>

                    {/* Expanded detail */}
                    {isExpanded && (
                      <div style={{ padding: '0 24px 20px 82px', borderTop: '1px solid #EBEDF2' }}>
                        <p style={{ fontSize: 13, color: '#374151', lineHeight: 1.7, margin: '16px 0 12px' }}>{ticket.description}</p>

                        {/* Responses */}
                        {responses.length > 0 && (
                          <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginBottom: 14 }}>
                            {responses.map(r => (
                              <div key={r.id} style={{ borderRadius: 12, padding: '12px 16px', background: 'rgba(222,26,26,0.04)', border: '1px solid rgba(222,26,26,0.10)' }}>
                                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 5 }}>
                                  <span style={{ fontSize: 12, fontWeight: 700, color: '#DE1A1A' }}>{r.responder_name}</span>
                                  <span style={{ fontSize: 11, color: '#9CA3AF' }}>
                                    {new Date(r.created_at).toLocaleString('en-IN', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}
                                  </span>
                                </div>
                                <p style={{ fontSize: 13, color: '#374151', margin: 0, lineHeight: 1.6 }}>{r.message}</p>
                              </div>
                            ))}
                          </div>
                        )}

                        {/* Reply input */}
                        {ticket.status !== 'closed' && ticket.status !== 'resolved' && (
                          <div style={{ display: 'flex', gap: 10 }}>
                            <textarea
                              rows={2}
                              placeholder="Add a comment…"
                              value={replyText[ticket.id] ?? ''}
                              onChange={e => setReplyText(p => ({ ...p, [ticket.id]: e.target.value }))}
                              style={{ flex: 1, borderRadius: 12, padding: '10px 14px', fontSize: 13, color: '#111111', background: '#F5F6FA', border: '1px solid #EBEDF2', outline: 'none', resize: 'none' }}
                            />
                            <button onClick={() => handleReply(ticket.id)}
                              disabled={pending && actionId === ticket.id}
                              style={{ padding: '0 18px', borderRadius: 12, background: '#DE1A1A', border: 'none', fontSize: 13, fontWeight: 700, color: '#fff', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 6 }}>
                              {pending && actionId === ticket.id ? <Loader2 size={14} style={{ animation: 'spin 1s linear infinite' }} /> : <Send size={14} />}
                              Send
                            </button>
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                )
              })}

              {/* Bottom CTA */}
              <div style={{ padding: '28px 24px', borderTop: '1px solid #EBEDF2', display: 'flex', flexDirection: 'column', alignItems: 'center', textAlign: 'center' }}>
                <div style={{ position: 'relative', marginBottom: 16 }}>
                  <div style={{ width: 90, height: 90, borderRadius: '50%', background: 'rgba(222,26,26,0.07)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                    <div style={{ width: 66, height: 66, borderRadius: '50%', background: 'rgba(222,26,26,0.10)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 30 }}>
                      🎧
                    </div>
                  </div>
                  <div style={{ position: 'absolute', top: 2, right: -6, width: 30, height: 24, borderRadius: 8, background: '#DE1A1A', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 3 }}>
                    <span style={{ width: 4, height: 4, borderRadius: '50%', background: '#fff' }}/>
                    <span style={{ width: 4, height: 4, borderRadius: '50%', background: '#fff' }}/>
                    <span style={{ width: 4, height: 4, borderRadius: '50%', background: '#fff' }}/>
                  </div>
                </div>
                <h3 style={{ fontSize: 16, fontWeight: 800, color: '#111111', margin: '0 0 6px', fontFamily: 'var(--font-jakarta)' }}>Need help?</h3>
                <p style={{ fontSize: 13, color: '#6B7280', margin: '0 0 20px', lineHeight: 1.6 }}>
                  If you can&apos;t find what you need, feel free to create a new ticket.
                </p>
                <button onClick={() => setShowForm(true)}
                  style={{ display: 'inline-flex', alignItems: 'center', gap: 8, padding: '12px 28px', borderRadius: 12, background: '#DE1A1A', border: 'none', fontSize: 13, fontWeight: 700, color: '#fff', cursor: 'pointer' }}>
                  <Plus size={14} /> Create New Ticket
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
