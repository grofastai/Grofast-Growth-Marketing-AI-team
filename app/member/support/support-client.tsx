'use client'

import { useState, useTransition } from 'react'
import { createTicket, addResponse } from '@/lib/actions/support'
import { LifeBuoy, Plus, ChevronDown, ChevronUp, Send, Loader2, X, CheckCircle2, AlertCircle, Clock, XCircle } from 'lucide-react'

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

const STATUS_COLORS: Record<string, string> = {
  open:        'rgba(222,26,26,0.12)',
  in_progress: 'rgba(251,191,36,0.15)',
  resolved:    'rgba(34,197,94,0.12)',
  closed:      'rgba(130,133,140,0.15)',
}
const STATUS_TEXT: Record<string, string> = {
  open:        '#de1a1a',
  in_progress: '#b45309',
  resolved:    '#15803d',
  closed:      '#6B7280',
}
const STATUS_ICON: Record<string, React.ReactNode> = {
  open:        <AlertCircle size={12} />,
  in_progress: <Clock size={12} />,
  resolved:    <CheckCircle2 size={12} />,
  closed:      <XCircle size={12} />,
}

const CATEGORIES = ['general', 'technical', 'hr', 'payroll', 'leave', 'other']
const PRIORITIES  = ['low', 'normal', 'high', 'urgent']

const EMPTY_FORM = { title: '', category: 'general', description: '', priority: 'normal' }

export default function MemberSupportClient({ tickets }: { tickets: Ticket[] }) {
  const [showForm, setShowForm]   = useState(false)
  const [form, setForm]           = useState(EMPTY_FORM)
  const [formError, setFormError] = useState('')
  const [expanded, setExpanded]   = useState<string | null>(null)
  const [replyText, setReplyText] = useState<Record<string, string>>({})
  const [pending, startTransition] = useTransition()
  const [actionId, setActionId]   = useState<string | null>(null)

  function handleCreate() {
    if (!form.title.trim())       { setFormError('Title is required'); return }
    if (!form.description.trim()) { setFormError('Description is required'); return }
    setFormError('')
    setActionId('create')
    startTransition(async () => {
      const result = await createTicket(form)
      if (result.success) {
        setForm(EMPTY_FORM)
        setShowForm(false)
      } else {
        setFormError(result.error ?? 'Failed to create ticket')
      }
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

  return (
    <div className="p-4 md:p-6 xl:p-8 max-w-[1400px]">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-black" style={{ color: '#0a100d' }}>Support</h1>
          <p className="text-sm mt-1" style={{ color: '#6B7280' }}>Raise a ticket, we'll get back to you</p>
        </div>
        <button onClick={() => setShowForm(v => !v)}
          className="flex items-center gap-2 px-4 py-2 rounded-xl text-[13px] font-bold transition-all"
          style={{ background: '#de1a1a', color: '#fff' }}>
          {showForm ? <X size={15} /> : <Plus size={15} />}
          {showForm ? 'Cancel' : 'New Ticket'}
        </button>
      </div>

      {/* New ticket form */}
      {showForm && (
        <div className="rounded-2xl p-5 space-y-4"
          style={{ background: '#fff', border: '1px solid rgba(10,16,13,0.08)' }}>
          <h2 className="text-[14px] font-bold" style={{ color: '#0a100d' }}>Create Support Ticket</h2>

          <div className="space-y-3">
            <input
              placeholder="Title *"
              value={form.title}
              onChange={e => setForm(p => ({ ...p, title: e.target.value }))}
              className="w-full rounded-xl px-4 py-2.5 text-[13px] outline-none"
              style={{ background: 'rgba(10,16,13,0.04)', border: '1px solid rgba(10,16,13,0.12)', color: '#0a100d' }}
            />

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <select value={form.category} onChange={e => setForm(p => ({ ...p, category: e.target.value }))}
                className="rounded-xl px-4 py-2.5 text-[13px] outline-none capitalize"
                style={{ background: 'rgba(10,16,13,0.04)', border: '1px solid rgba(10,16,13,0.12)', color: '#0a100d' }}>
                {CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}
              </select>
              <select value={form.priority} onChange={e => setForm(p => ({ ...p, priority: e.target.value }))}
                className="rounded-xl px-4 py-2.5 text-[13px] outline-none capitalize"
                style={{ background: 'rgba(10,16,13,0.04)', border: '1px solid rgba(10,16,13,0.12)', color: '#0a100d' }}>
                {PRIORITIES.map(p => <option key={p} value={p}>{p}</option>)}
              </select>
            </div>

            <textarea
              rows={4}
              placeholder="Describe your issue in detail *"
              value={form.description}
              onChange={e => setForm(p => ({ ...p, description: e.target.value }))}
              className="w-full rounded-xl px-4 py-2.5 text-[13px] outline-none resize-none"
              style={{ background: 'rgba(10,16,13,0.04)', border: '1px solid rgba(10,16,13,0.12)', color: '#0a100d' }}
            />
          </div>

          {formError && (
            <div className="flex items-center gap-2 text-[12px]" style={{ color: '#de1a1a' }}>
              <AlertCircle size={13} /> {formError}
            </div>
          )}

          <button onClick={handleCreate}
            disabled={pending && actionId === 'create'}
            className="w-full py-2.5 rounded-xl text-[13px] font-bold flex items-center justify-center gap-2 transition-all"
            style={{ background: '#de1a1a', color: '#fff' }}>
            {pending && actionId === 'create' ? <Loader2 size={14} className="animate-spin" /> : <Send size={14} />}
            Submit Ticket
          </button>
        </div>
      )}

      {/* Ticket list */}
      {tickets.length === 0 ? (
        <div className="text-center py-16" style={{ color: '#6B7280' }}>
          <LifeBuoy size={40} className="mx-auto mb-3 opacity-30" />
          <p className="font-medium">No tickets yet</p>
          <p className="text-[13px] mt-1">Click "New Ticket" to raise a support request</p>
        </div>
      ) : (
        <div className="space-y-3">
          {tickets.map(ticket => {
            const isExpanded = expanded === ticket.id
            const responses  = ticket.support_responses ?? []
            return (
              <div key={ticket.id} className="rounded-2xl overflow-hidden"
                style={{ background: '#fff', border: '1px solid rgba(10,16,13,0.08)' }}>
                <button className="w-full text-left px-5 py-4 flex items-start gap-3"
                  onClick={() => setExpanded(isExpanded ? null : ticket.id)}>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-bold text-[14px]" style={{ color: '#0a100d' }}>{ticket.title}</span>
                      <span className="px-2 py-0.5 rounded-full text-[11px] font-semibold flex items-center gap-1"
                        style={{ background: STATUS_COLORS[ticket.status] ?? 'rgba(130,133,140,0.1)', color: STATUS_TEXT[ticket.status] ?? '#6B7280' }}>
                        {STATUS_ICON[ticket.status]}
                        {ticket.status.replace('_', ' ')}
                      </span>
                    </div>
                    <div className="flex items-center gap-3 mt-1 text-[12px]" style={{ color: '#6B7280' }}>
                      <span className="capitalize">{ticket.category}</span>
                      <span>·</span>
                      <span>{new Date(ticket.created_at).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })}</span>
                      {responses.length > 0 && <><span>·</span><span>{responses.length} {responses.length === 1 ? 'reply' : 'replies'}</span></>}
                    </div>
                  </div>
                  {isExpanded ? <ChevronUp size={16} style={{ color: '#6B7280' }} /> : <ChevronDown size={16} style={{ color: '#6B7280' }} />}
                </button>

                {isExpanded && (
                  <div className="px-5 pb-5 space-y-4 border-t" style={{ borderColor: 'rgba(10,16,13,0.06)' }}>
                    <p className="pt-4 text-[13px] leading-relaxed" style={{ color: '#0a100d' }}>{ticket.description}</p>

                    {responses.length > 0 && (
                      <div className="space-y-3">
                        {responses.map(r => (
                          <div key={r.id} className="rounded-xl px-4 py-3"
                            style={{ background: 'rgba(222,26,26,0.04)', border: '1px solid rgba(222,26,26,0.1)' }}>
                            <div className="flex items-center gap-2 mb-1">
                              <span className="text-[12px] font-bold" style={{ color: '#de1a1a' }}>{r.responder_name}</span>
                              <span className="text-[11px]" style={{ color: '#6B7280' }}>
                                {new Date(r.created_at).toLocaleString('en-IN', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}
                              </span>
                            </div>
                            <p className="text-[13px]" style={{ color: '#0a100d' }}>{r.message}</p>
                          </div>
                        ))}
                      </div>
                    )}

                    {ticket.status !== 'closed' && ticket.status !== 'resolved' && (
                      <div className="flex gap-2">
                        <textarea
                          rows={2}
                          placeholder="Add a comment…"
                          value={replyText[ticket.id] ?? ''}
                          onChange={e => setReplyText(p => ({ ...p, [ticket.id]: e.target.value }))}
                          className="flex-1 rounded-xl px-3 py-2 text-[13px] resize-none outline-none"
                          style={{ background: 'rgba(10,16,13,0.04)', border: '1px solid rgba(10,16,13,0.12)', color: '#0a100d' }}
                        />
                        <button onClick={() => handleReply(ticket.id)}
                          disabled={pending && actionId === ticket.id}
                          className="px-4 rounded-xl flex items-center gap-1.5 text-[13px] font-semibold"
                          style={{ background: '#de1a1a', color: '#fff' }}>
                          {pending && actionId === ticket.id ? <Loader2 size={14} className="animate-spin" /> : <Send size={14} />}
                          Send
                        </button>
                      </div>
                    )}
                  </div>
                )}
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
