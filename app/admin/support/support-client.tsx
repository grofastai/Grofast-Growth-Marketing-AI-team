'use client'

import { useState, useTransition } from 'react'
import { addResponse, updateTicketStatus } from '@/lib/actions/support'
import { MessageSquare, ChevronDown, ChevronUp, Clock, CheckCircle2, XCircle, AlertCircle, Send, Loader2 } from 'lucide-react'

type Response = { id: string; responder_name: string; message: string; created_at: string }
type Ticket = {
  id: string
  user_id: string
  title: string
  category: string
  description: string
  status: string
  priority: string
  created_at: string
  updated_at: string
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
  open:        <AlertCircle size={13} />,
  in_progress: <Clock size={13} />,
  resolved:    <CheckCircle2 size={13} />,
  closed:      <XCircle size={13} />,
}
const PRIORITY_COLOR: Record<string, string> = {
  low:    '#6B7280',
  normal: '#2563eb',
  high:   '#d97706',
  urgent: '#de1a1a',
}

export default function AdminSupportClient({ tickets }: { tickets: Ticket[] }) {
  const [filter, setFilter]   = useState('all')
  const [expanded, setExpanded] = useState<string | null>(null)
  const [replyText, setReplyText] = useState<Record<string, string>>({})
  const [pending, startTransition] = useTransition()
  const [actionId, setActionId] = useState<string | null>(null)

  const filtered = filter === 'all' ? tickets : tickets.filter(t => t.status === filter)

  function handleReply(ticketId: string) {
    const msg = (replyText[ticketId] ?? '').trim()
    if (!msg) return
    setActionId(ticketId + '_reply')
    startTransition(async () => {
      await addResponse({ ticket_id: ticketId, message: msg })
      setReplyText(p => ({ ...p, [ticketId]: '' }))
      setActionId(null)
    })
  }

  function handleStatus(ticketId: string, status: string) {
    setActionId(ticketId + '_status')
    startTransition(async () => {
      await updateTicketStatus(ticketId, status)
      setActionId(null)
    })
  }

  return (
    <div className="p-4 md:p-6 xl:p-8 max-w-[1400px]">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-black" style={{ color: '#0a100d' }}>Support Tickets</h1>
        <p className="text-sm mt-1" style={{ color: '#6B7280' }}>Manage team support requests</p>
      </div>

      {/* Filter tabs */}
      <div className="flex gap-2 flex-wrap">
        {['all', 'open', 'in_progress', 'resolved', 'closed'].map(s => (
          <button key={s}
            onClick={() => setFilter(s)}
            className="px-4 py-1.5 rounded-full text-[12px] font-semibold transition-all capitalize"
            style={{
              background: filter === s ? '#de1a1a' : 'rgba(10,16,13,0.06)',
              color:      filter === s ? '#fff' : '#6B7280',
            }}>
            {s.replace('_', ' ')}
          </button>
        ))}
      </div>

      {/* Stats row */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {[
          { label: 'Open',        count: tickets.filter(t => t.status === 'open').length,        color: '#de1a1a' },
          { label: 'In Progress', count: tickets.filter(t => t.status === 'in_progress').length,  color: '#d97706' },
          { label: 'Resolved',    count: tickets.filter(t => t.status === 'resolved').length,     color: '#15803d' },
          { label: 'Closed',      count: tickets.filter(t => t.status === 'closed').length,       color: '#6B7280' },
        ].map(stat => (
          <div key={stat.label} className="rounded-2xl p-4 text-center"
            style={{ background: '#fff', border: '1px solid rgba(10,16,13,0.08)' }}>
            <div className="text-2xl font-black" style={{ color: stat.color }}>{stat.count}</div>
            <div className="text-[11px] font-medium mt-0.5" style={{ color: '#6B7280' }}>{stat.label}</div>
          </div>
        ))}
      </div>

      {/* Ticket list */}
      {filtered.length === 0 ? (
        <div className="text-center py-16" style={{ color: '#6B7280' }}>
          <MessageSquare size={40} className="mx-auto mb-3 opacity-30" />
          <p className="font-medium">No tickets found</p>
        </div>
      ) : (
        <div className="space-y-3">
          {filtered.map(ticket => {
            const isExpanded = expanded === ticket.id
            const responses = ticket.support_responses ?? []
            return (
              <div key={ticket.id} className="rounded-2xl overflow-hidden transition-all"
                style={{ background: '#fff', border: '1px solid rgba(10,16,13,0.08)' }}>
                {/* Ticket header */}
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
                      <span className="px-2 py-0.5 rounded-full text-[11px] font-semibold"
                        style={{ background: 'rgba(10,16,13,0.06)', color: PRIORITY_COLOR[ticket.priority] ?? '#0a100d' }}>
                        {ticket.priority}
                      </span>
                    </div>
                    <div className="flex items-center gap-3 mt-1 text-[12px]" style={{ color: '#6B7280' }}>
                      <span className="capitalize">{ticket.category}</span>
                      <span>·</span>
                      <span>{new Date(ticket.created_at).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })}</span>
                      <span>·</span>
                      <span>{responses.length} {responses.length === 1 ? 'reply' : 'replies'}</span>
                    </div>
                  </div>
                  {isExpanded ? <ChevronUp size={16} style={{ color: '#6B7280' }} /> : <ChevronDown size={16} style={{ color: '#6B7280' }} />}
                </button>

                {/* Expanded content */}
                {isExpanded && (
                  <div className="px-5 pb-5 space-y-4 border-t" style={{ borderColor: 'rgba(10,16,13,0.06)' }}>
                    {/* Description */}
                    <div className="pt-4">
                      <p className="text-[13px] leading-relaxed" style={{ color: '#0a100d' }}>{ticket.description}</p>
                    </div>

                    {/* Responses */}
                    {responses.length > 0 && (
                      <div className="space-y-3">
                        {responses.map(r => (
                          <div key={r.id} className="rounded-xl px-4 py-3"
                            style={{ background: 'rgba(10,16,13,0.04)' }}>
                            <div className="flex items-center gap-2 mb-1">
                              <span className="text-[12px] font-bold" style={{ color: '#0a100d' }}>{r.responder_name}</span>
                              <span className="text-[11px]" style={{ color: '#6B7280' }}>
                                {new Date(r.created_at).toLocaleString('en-IN', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}
                              </span>
                            </div>
                            <p className="text-[13px]" style={{ color: '#0a100d' }}>{r.message}</p>
                          </div>
                        ))}
                      </div>
                    )}

                    {/* Reply box */}
                    <div className="flex gap-2">
                      <textarea
                        rows={2}
                        placeholder="Type a reply…"
                        value={replyText[ticket.id] ?? ''}
                        onChange={e => setReplyText(p => ({ ...p, [ticket.id]: e.target.value }))}
                        className="flex-1 rounded-xl px-3 py-2 text-[13px] resize-none outline-none"
                        style={{ background: 'rgba(10,16,13,0.04)', border: '1px solid rgba(10,16,13,0.12)', color: '#0a100d' }}
                      />
                      <button onClick={() => handleReply(ticket.id)}
                        disabled={pending && actionId === ticket.id + '_reply'}
                        className="px-4 rounded-xl flex items-center gap-1.5 text-[13px] font-semibold transition-all"
                        style={{ background: '#de1a1a', color: '#fff' }}>
                        {pending && actionId === ticket.id + '_reply'
                          ? <Loader2 size={14} className="animate-spin" />
                          : <Send size={14} />}
                        Send
                      </button>
                    </div>

                    {/* Status actions */}
                    <div className="flex items-center gap-2 flex-wrap pt-1">
                      <span className="text-[12px] font-medium" style={{ color: '#6B7280' }}>Change status:</span>
                      {['open', 'in_progress', 'resolved', 'closed'].filter(s => s !== ticket.status).map(s => (
                        <button key={s}
                          onClick={() => handleStatus(ticket.id, s)}
                          disabled={pending && actionId === ticket.id + '_status'}
                          className="px-3 py-1 rounded-full text-[11px] font-semibold capitalize transition-all"
                          style={{ background: STATUS_COLORS[s] ?? 'rgba(130,133,140,0.1)', color: STATUS_TEXT[s] ?? '#6B7280' }}>
                          {s.replace('_', ' ')}
                        </button>
                      ))}
                    </div>
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
