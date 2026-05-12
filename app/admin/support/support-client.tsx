'use client'

import { useState, useTransition, useMemo } from 'react'
import Image from 'next/image'
import {
  Plus, Send, Loader2, X, Search, AlertCircle, Clock,
  CheckCircle2, XCircle, MoreVertical, ChevronDown,
  SlidersHorizontal, MessageSquare, ChevronLeft, ChevronRight,
} from 'lucide-react'
import { addResponse, updateTicketStatus, createTicket } from '@/lib/actions/support'

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

const STATUS_CONFIG = {
  open:        { bg: '#FEE2E2', color: '#DE1A1A', dot: '#DE1A1A', label: 'Open' },
  in_progress: { bg: '#FEF3C7', color: '#D97706', dot: '#F59E0B', label: 'In Progress' },
  resolved:    { bg: '#DCFCE7', color: '#15803D', dot: '#22C55E', label: 'Resolved' },
  closed:      { bg: '#F3F4F6', color: '#6B7280', dot: '#9CA3AF', label: 'Closed' },
} as const

const PRIORITY_CONFIG = {
  low:    { bg: '#F3F4F6', color: '#6B7280' },
  normal: { bg: '#EFF6FF', color: '#2563EB' },
  high:   { bg: '#FEF3C7', color: '#D97706' },
  urgent: { bg: '#FEE2E2', color: '#DE1A1A' },
} as const

const CATEGORIES = ['general', 'technical', 'hr', 'payroll', 'leave', 'other']
const PRIORITIES  = ['low', 'normal', 'high', 'urgent']
const PER_PAGE    = 10

function Sparkline({ count, color }: { count: number; color: string }) {
  const path = count > 0
    ? 'M0,35 C15,33 30,28 45,22 C60,16 75,12 90,8 C105,4 115,3 120,2'
    : 'M0,35 C30,35 60,34 90,35 C100,35 110,35 120,35'
  return (
    <svg width="100%" height="44" viewBox="0 0 120 44" preserveAspectRatio="none">
      <path d={path} fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" />
    </svg>
  )
}

function ticketNum(index: number) {
  return `#TKT-${String(1000 + index + 1).padStart(4, '0')}`
}

function formatDateTime(s: string) {
  const d = new Date(s)
  return {
    date: d.toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' }),
    time: d.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', hour12: true }).toUpperCase(),
  }
}

function NewTicketModal({ onClose }: { onClose: () => void }) {
  const [form, setForm] = useState({ title: '', category: 'general', description: '', priority: 'normal' })
  const [error, setError] = useState('')
  const [pending, startTransition] = useTransition()

  function handleSubmit() {
    if (!form.title.trim())       { setError('Title is required'); return }
    if (!form.description.trim()) { setError('Description is required'); return }
    setError('')
    startTransition(async () => {
      const result = await createTicket(form)
      if (result.success) onClose()
      else setError(result.error ?? 'Failed to create ticket')
    })
  }

  return (
    <>
      <div className="fixed inset-0 z-40" style={{ background: 'rgba(0,0,0,0.5)', backdropFilter: 'blur(4px)' }} onClick={onClose} />
      <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
        <div className="w-full max-w-[480px] rounded-2xl shadow-2xl" style={{ background: '#FFFFFF' }}>
          <div className="flex items-center justify-between px-6 py-5" style={{ borderBottom: '1px solid #F3F4F6' }}>
            <div>
              <h2 className="text-[16px] font-bold" style={{ color: '#111111', fontFamily: 'var(--font-jakarta)' }}>New Support Ticket</h2>
              <p className="text-[12px] mt-0.5" style={{ color: '#9CA3AF' }}>Create a new support request</p>
            </div>
            <button onClick={onClose} aria-label="Close" className="w-8 h-8 rounded-full flex items-center justify-center" style={{ border: '1px solid #E5E7EB' }}>
              <X size={14} style={{ color: '#6B7280' }} />
            </button>
          </div>
          <div className="px-6 py-5 space-y-4">
            <div>
              <label className="block text-[10px] font-bold uppercase tracking-[0.15em] mb-1.5" style={{ color: '#6B7280' }}>Title *</label>
              <input value={form.title} onChange={e => setForm(p => ({ ...p, title: e.target.value }))}
                placeholder="e.g. App is not working"
                className="w-full rounded-xl px-4 py-2.5 text-[13px] outline-none"
                style={{ background: '#F9FAFB', border: '1px solid #E5E7EB', color: '#111111', fontFamily: 'inherit' }} />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-[10px] font-bold uppercase tracking-[0.15em] mb-1.5" style={{ color: '#6B7280' }}>Category</label>
                <select value={form.category} onChange={e => setForm(p => ({ ...p, category: e.target.value }))}
                  className="w-full rounded-xl px-4 py-2.5 text-[13px] outline-none"
                  style={{ background: '#F9FAFB', border: '1px solid #E5E7EB', color: '#111111', fontFamily: 'inherit' }}>
                  {CATEGORIES.map(c => <option key={c} value={c}>{c.charAt(0).toUpperCase() + c.slice(1)}</option>)}
                </select>
              </div>
              <div>
                <label className="block text-[10px] font-bold uppercase tracking-[0.15em] mb-1.5" style={{ color: '#6B7280' }}>Priority</label>
                <select value={form.priority} onChange={e => setForm(p => ({ ...p, priority: e.target.value }))}
                  className="w-full rounded-xl px-4 py-2.5 text-[13px] outline-none"
                  style={{ background: '#F9FAFB', border: '1px solid #E5E7EB', color: '#111111', fontFamily: 'inherit' }}>
                  {PRIORITIES.map(p => <option key={p} value={p}>{p.charAt(0).toUpperCase() + p.slice(1)}</option>)}
                </select>
              </div>
            </div>
            <div>
              <label className="block text-[10px] font-bold uppercase tracking-[0.15em] mb-1.5" style={{ color: '#6B7280' }}>Description *</label>
              <textarea rows={4} value={form.description}
                onChange={e => setForm(p => ({ ...p, description: e.target.value }))}
                placeholder="Describe the issue in detail…"
                className="w-full rounded-xl px-4 py-2.5 text-[13px] outline-none resize-none"
                style={{ background: '#F9FAFB', border: '1px solid #E5E7EB', color: '#111111', fontFamily: 'inherit' }} />
            </div>
            {error && (
              <p className="text-[12px] rounded-xl px-4 py-2.5 flex items-center gap-2"
                style={{ background: 'rgba(222,26,26,0.06)', color: '#DE1A1A', border: '1px solid rgba(222,26,26,0.15)' }}>
                <AlertCircle size={12} /> {error}
              </p>
            )}
          </div>
          <div className="px-6 pb-5 flex gap-3">
            <button onClick={onClose} className="flex-1 py-2.5 rounded-xl text-[13px] font-semibold"
              style={{ background: '#F9FAFB', color: '#6B7280', border: '1px solid #E5E7EB' }}>Cancel</button>
            <button onClick={handleSubmit} disabled={pending}
              className="flex-1 py-2.5 rounded-xl text-[13px] font-semibold flex items-center justify-center gap-2 disabled:opacity-60"
              style={{ background: 'linear-gradient(135deg, #DE1A1A, #7F1D1D)', color: '#FFFFFF' }}>
              {pending ? <Loader2 size={13} className="animate-spin" /> : <Send size={13} />}
              Submit Ticket
            </button>
          </div>
        </div>
      </div>
    </>
  )
}

function TicketDetailModal({ ticket, onClose }: { ticket: Ticket; onClose: () => void }) {
  const [reply, setReply] = useState('')
  const [replyPending, startReplyTransition] = useTransition()
  const [statusPending, startStatusTransition] = useTransition()
  const cfg = STATUS_CONFIG[ticket.status as keyof typeof STATUS_CONFIG] ?? STATUS_CONFIG.closed
  const responses = ticket.support_responses ?? []

  function handleReply() {
    if (!reply.trim()) return
    startReplyTransition(async () => {
      await addResponse({ ticket_id: ticket.id, message: reply.trim() })
      setReply('')
    })
  }

  function handleStatus(status: string) {
    startStatusTransition(async () => {
      await updateTicketStatus(ticket.id, status)
    })
  }

  return (
    <>
      <div className="fixed inset-0 z-40" style={{ background: 'rgba(0,0,0,0.5)', backdropFilter: 'blur(4px)' }} onClick={onClose} />
      <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
        <div className="w-full max-w-[560px] rounded-2xl shadow-2xl flex flex-col max-h-[90vh]" style={{ background: '#FFFFFF' }}>
          <div className="px-6 py-5 flex-shrink-0" style={{ borderBottom: '1px solid #F3F4F6' }}>
            <div className="flex items-start justify-between gap-3">
              <div>
                <h2 className="text-[15px] font-bold" style={{ color: '#111111', fontFamily: 'var(--font-jakarta)' }}>{ticket.title}</h2>
                <div className="flex items-center gap-2 mt-2 flex-wrap">
                  <span className="px-2.5 py-0.5 rounded-full text-[11px] font-semibold"
                    style={{ background: cfg.bg, color: cfg.color }}>{cfg.label}</span>
                  <span className="text-[11px]" style={{ color: '#9CA3AF' }}>
                    {ticket.category.charAt(0).toUpperCase() + ticket.category.slice(1)}
                  </span>
                  <span style={{ color: '#D1D5DB' }}>·</span>
                  <span className="text-[11px]" style={{ color: '#9CA3AF' }}>
                    {new Date(ticket.created_at).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })}
                  </span>
                </div>
              </div>
              <button onClick={onClose} aria-label="Close" className="w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0"
                style={{ border: '1px solid #E5E7EB' }}>
                <X size={14} style={{ color: '#6B7280' }} />
              </button>
            </div>
          </div>
          <div className="flex-1 overflow-y-auto px-6 py-4 space-y-4">
            <p className="text-[13px] leading-relaxed" style={{ color: '#374151' }}>{ticket.description}</p>
            {responses.length > 0 && (
              <div className="space-y-3">
                <p className="text-[11px] font-bold uppercase tracking-[0.12em]" style={{ color: '#9CA3AF' }}>
                  Responses ({responses.length})
                </p>
                {responses.map(r => (
                  <div key={r.id} className="rounded-xl px-4 py-3"
                    style={{ background: 'rgba(222,26,26,0.04)', border: '1px solid rgba(222,26,26,0.10)' }}>
                    <div className="flex items-center gap-2 mb-1">
                      <span className="text-[12px] font-bold" style={{ color: '#DE1A1A' }}>{r.responder_name}</span>
                      <span className="text-[11px]" style={{ color: '#9CA3AF' }}>
                        {new Date(r.created_at).toLocaleString('en-IN', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}
                      </span>
                    </div>
                    <p className="text-[13px]" style={{ color: '#374151' }}>{r.message}</p>
                  </div>
                ))}
              </div>
            )}
          </div>
          <div className="px-6 py-4 flex-shrink-0 space-y-3" style={{ borderTop: '1px solid #F3F4F6' }}>
            <div className="flex gap-2">
              <textarea rows={2} placeholder="Type a reply…" value={reply}
                onChange={e => setReply(e.target.value)}
                className="flex-1 rounded-xl px-3 py-2 text-[13px] resize-none outline-none"
                style={{ background: '#F9FAFB', border: '1px solid #E5E7EB', color: '#111111', fontFamily: 'inherit' }} />
              <button onClick={handleReply}
                disabled={replyPending || !reply.trim()}
                className="px-4 rounded-xl flex items-center gap-1.5 text-[13px] font-semibold disabled:opacity-50"
                style={{ background: '#DE1A1A', color: '#FFFFFF' }}>
                {replyPending ? <Loader2 size={13} className="animate-spin" /> : <Send size={13} />}
                Send
              </button>
            </div>
            <div className="flex items-center gap-2 flex-wrap">
              <span className="text-[11px] font-medium" style={{ color: '#6B7280' }}>Move to:</span>
              {(['open', 'in_progress', 'resolved', 'closed'] as const)
                .filter(s => s !== ticket.status)
                .map(s => {
                  const c = STATUS_CONFIG[s]
                  return (
                    <button key={s} onClick={() => handleStatus(s)}
                      disabled={statusPending}
                      className="px-3 py-1 rounded-full text-[11px] font-semibold capitalize transition-all disabled:opacity-50"
                      style={{ background: c.bg, color: c.color }}>
                      {c.label}
                    </button>
                  )
                })}
            </div>
          </div>
        </div>
      </div>
    </>
  )
}

export default function AdminSupportClient({ tickets }: { tickets: Ticket[] }) {
  const [filter, setFilter]               = useState('all')
  const [search, setSearch]               = useState('')
  const [sort, setSort]                   = useState<'newest' | 'oldest'>('newest')
  const [page, setPage]                   = useState(1)
  const [showNewTicket, setShowNewTicket] = useState(false)
  const [activeTicket, setActiveTicket]   = useState<string | null>(null)
  const [openDropdown, setOpenDropdown]   = useState<string | null>(null)
  const [showSortMenu, setShowSortMenu]   = useState(false)
  const [, startRowStatusTransition]      = useTransition()

  const stats = useMemo(() => ({
    open:        tickets.filter(t => t.status === 'open').length,
    in_progress: tickets.filter(t => t.status === 'in_progress').length,
    resolved:    tickets.filter(t => t.status === 'resolved').length,
    closed:      tickets.filter(t => t.status === 'closed').length,
  }), [tickets])

  const sorted = useMemo(() =>
    [...tickets].sort((a, b) => {
      const ta = new Date(a.updated_at).getTime()
      const tb = new Date(b.updated_at).getTime()
      return sort === 'newest' ? tb - ta : ta - tb
    }),
    [tickets, sort]
  )

  const filtered = useMemo(() => {
    const q = search.toLowerCase()
    return sorted.filter(t => {
      const matchFilter = filter === 'all' || t.status === filter
      const matchSearch = !q || t.title.toLowerCase().includes(q) || t.category.toLowerCase().includes(q)
      return matchFilter && matchSearch
    })
  }, [sorted, filter, search])

  const totalPages = Math.max(1, Math.ceil(filtered.length / PER_PAGE))
  const paginated  = filtered.slice((page - 1) * PER_PAGE, page * PER_PAGE)

  function handleFilter(f: string) { setFilter(f); setPage(1) }
  function handleSearch(q: string) { setSearch(q); setPage(1) }

  const ticketIndexMap = useMemo(() => {
    const m: Record<string, number> = {}
    const byCreation = [...tickets].sort(
      (a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime()
    )
    byCreation.forEach((t, i) => { m[t.id] = i })
    return m
  }, [tickets])

  const STAT_CARDS = useMemo(() => [
    { key: 'open',        label: 'Open',        count: stats.open,        color: '#DE1A1A', iconBg: '#FEE2E2', Icon: AlertCircle  },
    { key: 'in_progress', label: 'In Progress',  count: stats.in_progress, color: '#D97706', iconBg: '#FEF3C7', Icon: Clock        },
    { key: 'resolved',    label: 'Resolved',     count: stats.resolved,    color: '#15803D', iconBg: '#DCFCE7', Icon: CheckCircle2 },
    { key: 'closed',      label: 'Closed',       count: stats.closed,      color: '#6B7280', iconBg: '#F3F4F6', Icon: XCircle      },
  ], [stats])

  return (
    <div style={{ background: '#F4F5F7', minHeight: '100vh' }}>

      {/* Hero Banner */}
      <div style={{
        background: 'linear-gradient(135deg, #FDF6F0 0%, #FAF0E8 40%, #F5EBE0 100%)',
        position: 'relative', overflow: 'hidden', minHeight: 200,
        borderBottom: '1px solid rgba(0,0,0,0.06)',
      }}>
        <div className="absolute pointer-events-none hidden sm:block"
          style={{ right: '16%', bottom: 0, width: 260, height: 210 }}>
          <Image src="/brand/support-hero.png" alt="Support hero"
            fill style={{ objectFit: 'contain', objectPosition: 'bottom' }} />
        </div>
        <div className="absolute pointer-events-none hidden lg:block"
          style={{ right: '3%', top: '42%', transform: 'translateY(-50%)' }}>
          <p style={{
            fontFamily: 'Georgia, serif', fontSize: 17, fontStyle: 'italic',
            fontWeight: 600, color: '#3D2B1F', lineHeight: 1.5, textAlign: 'right',
          }}>
            Let&apos;s solve<br />it together <span style={{ color: '#DE1A1A' }}>❤</span>
          </p>
        </div>
        <div style={{ position: 'relative', zIndex: 1, padding: '24px 28px 0' }}>
          <div className="flex items-start justify-between flex-wrap gap-3 mb-5">
            <div>
              <h1 style={{ fontSize: 28, fontWeight: 900, color: '#111111', fontFamily: 'var(--font-jakarta)', margin: 0, lineHeight: 1.2 }}>
                Support Tickets
              </h1>
              <p style={{ fontSize: 13, color: '#9CA3AF', margin: '4px 0 0' }}>Manage team support requests</p>
            </div>
            <button onClick={() => setShowNewTicket(true)}
              style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '10px 20px', borderRadius: 12, background: '#DE1A1A', border: 'none', fontSize: 13, fontWeight: 700, color: '#fff', cursor: 'pointer', boxShadow: '0 4px 16px rgba(222,26,26,0.3)', whiteSpace: 'nowrap' }}>
              <Plus size={14} /> New Ticket
            </button>
          </div>
          <div className="flex items-center gap-2 flex-wrap pb-6">
            {[
              { key: 'all',         label: 'All' },
              { key: 'open',        label: 'Open' },
              { key: 'in_progress', label: 'In Progress' },
              { key: 'resolved',    label: 'Resolved' },
              { key: 'closed',      label: 'Closed' },
            ].map(tab => (
              <button key={tab.key} onClick={() => handleFilter(tab.key)}
                style={{
                  padding: '7px 18px', borderRadius: 99, fontSize: 13, fontWeight: 600,
                  border: 'none', cursor: 'pointer', transition: 'all 0.15s',
                  background: filter === tab.key ? '#DE1A1A' : 'rgba(255,255,255,0.75)',
                  color:      filter === tab.key ? '#FFFFFF' : '#6B7280',
                  boxShadow:  filter === tab.key ? '0 4px 12px rgba(222,26,26,0.25)' : '0 1px 4px rgba(0,0,0,0.08)',
                }}>
                {tab.label}
              </button>
            ))}
          </div>
        </div>
      </div>

      <div style={{ padding: '24px 28px 40px' }}>

        {/* Stat Cards */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-5">
          {STAT_CARDS.map(({ key, label, count, color, iconBg, Icon }) => (
            <div key={key} className="rounded-2xl overflow-hidden"
              style={{ background: '#FFFFFF', border: '1px solid rgba(0,0,0,0.06)', boxShadow: '0 2px 8px rgba(0,0,0,0.04)' }}>
              <div style={{ padding: '18px 20px 0' }}>
                <div className="flex items-start justify-between mb-1">
                  <div style={{ width: 46, height: 46, borderRadius: 12, background: iconBg, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                    <Icon size={22} color={color} />
                  </div>
                  <div style={{ textAlign: 'right' }}>
                    <div style={{ fontSize: 32, fontWeight: 900, color: '#111111', fontFamily: 'var(--font-jakarta)', lineHeight: 1 }}>{count}</div>
                    <div style={{ fontSize: 12, color: '#6B7280', fontWeight: 500, marginTop: 2 }}>{label}</div>
                  </div>
                </div>
                <div className="flex items-center gap-1.5 mt-2" style={{ fontSize: 12 }}>
                  {count > 0
                    ? <span style={{ color, fontWeight: 700 }}>↑ 100%</span>
                    : <span style={{ color: '#9CA3AF', fontWeight: 700 }}>— 0%</span>
                  }
                  <span style={{ color: '#9CA3AF' }}>vs last 7 days</span>
                </div>
              </div>
              <div style={{ marginTop: 4 }}>
                <Sparkline count={count} color={color} />
              </div>
            </div>
          ))}
        </div>

        {/* Search + Controls */}
        <div className="flex items-center gap-3 flex-wrap mb-4">
          <div className="flex-1 min-w-[220px] relative">
            <Search size={14} className="absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none" style={{ color: '#9CA3AF' }} />
            <input
              value={search} onChange={e => handleSearch(e.target.value)}
              placeholder="Search tickets..."
              className="w-full rounded-xl pl-10 pr-4 py-2.5 text-[13px] outline-none"
              style={{ background: '#FFFFFF', border: '1px solid #E5E7EB', color: '#111111', boxShadow: '0 1px 4px rgba(0,0,0,0.06)', fontFamily: 'inherit' }}
            />
          </div>
          <div className="relative">
            <button onClick={() => setShowSortMenu(v => !v)}
              className="flex items-center gap-2 rounded-xl px-4 py-2.5 text-[13px] font-semibold"
              style={{ background: '#FFFFFF', border: '1px solid #E5E7EB', color: '#374151', boxShadow: '0 1px 4px rgba(0,0,0,0.06)', whiteSpace: 'nowrap', cursor: 'pointer' }}>
              Sort: {sort === 'newest' ? 'Newest' : 'Oldest'} <ChevronDown size={13} />
            </button>
            {showSortMenu && (
              <div className="absolute top-full mt-1.5 right-0 rounded-xl shadow-xl overflow-hidden z-50"
                style={{ background: '#FFFFFF', border: '1px solid #E5E7EB', minWidth: 140 }}>
                {(['newest', 'oldest'] as const).map(s => (
                  <button key={s} onClick={() => { setSort(s); setShowSortMenu(false) }}
                    className="w-full text-left px-4 py-2.5 text-[13px] capitalize transition-all"
                    style={{ color: sort === s ? '#DE1A1A' : '#374151', fontWeight: sort === s ? 700 : 500, background: sort === s ? 'rgba(222,26,26,0.05)' : 'transparent', border: 'none', cursor: 'pointer', fontFamily: 'inherit' }}>
                    {s.charAt(0).toUpperCase() + s.slice(1)}
                  </button>
                ))}
              </div>
            )}
          </div>
          <button disabled className="flex items-center gap-2 rounded-xl px-4 py-2.5 text-[13px] font-semibold opacity-50"
            style={{ background: '#FFFFFF', border: '1px solid #E5E7EB', color: '#374151', boxShadow: '0 1px 4px rgba(0,0,0,0.06)', cursor: 'not-allowed' }}>
            <SlidersHorizontal size={14} /> Filter
          </button>
        </div>

        {/* Ticket Table */}
        <div style={{ background: '#FFFFFF', borderRadius: 16, border: '1px solid #E5E7EB', boxShadow: '0 2px 8px rgba(0,0,0,0.04)', overflow: 'hidden' }}>
          <div style={{ overflowX: 'auto' }}>
            <table className="w-full" style={{ minWidth: 760 }}>
              <thead>
                <tr style={{ background: '#F9FAFB', borderBottom: '1px solid #F3F4F6' }}>
                  {['Ticket', 'Category', 'Status', 'Priority', 'Created', 'Updated', 'Actions'].map(h => (
                    <th key={h} className="text-left px-5 py-3.5 text-[11px] font-bold uppercase tracking-[0.14em]"
                      style={{ color: '#9CA3AF' }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {paginated.length === 0 ? (
                  <tr>
                    <td colSpan={7} style={{ padding: '60px 0', textAlign: 'center' }}>
                      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8 }}>
                        <MessageSquare size={36} style={{ color: '#E5E7EB' }} />
                        <p style={{ fontSize: 14, fontWeight: 600, color: '#9CA3AF', margin: 0 }}>No tickets found</p>
                        <p style={{ fontSize: 12, color: '#D1D5DB', margin: 0 }}>Try adjusting your search or filter</p>
                      </div>
                    </td>
                  </tr>
                ) : (
                  paginated.map((ticket, i) => {
                    const sCfg = STATUS_CONFIG[ticket.status as keyof typeof STATUS_CONFIG] ?? STATUS_CONFIG.closed
                    const pCfg = PRIORITY_CONFIG[ticket.priority as keyof typeof PRIORITY_CONFIG] ?? PRIORITY_CONFIG.normal
                    const created = formatDateTime(ticket.created_at)
                    const updated = formatDateTime(ticket.updated_at)
                    const tNum   = ticketNum(ticketIndexMap[ticket.id] ?? i)
                    return (
                      <tr key={ticket.id}
                        style={{ borderBottom: '1px solid #F9FAFB' }}
                        onMouseEnter={e => (e.currentTarget as HTMLElement).style.background = '#FAFAFA'}
                        onMouseLeave={e => (e.currentTarget as HTMLElement).style.background = 'transparent'}>
                        <td className="px-5 py-4">
                          <div className="flex items-center gap-3">
                            <div style={{ position: 'relative', flexShrink: 0 }}>
                              <div style={{ width: 38, height: 38, borderRadius: 10, background: '#FEE2E2', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                                <span style={{ fontSize: 16, fontWeight: 900, color: '#DE1A1A' }}>?</span>
                              </div>
                              <span style={{ position: 'absolute', bottom: 0, right: 0, width: 9, height: 9, borderRadius: '50%', background: sCfg.dot, border: '1.5px solid #FFFFFF' }} />
                            </div>
                            <div>
                              <p style={{ fontSize: 13, fontWeight: 700, color: '#111111', margin: 0 }}>{ticket.title}</p>
                              <p style={{ fontSize: 11, color: '#9CA3AF', margin: '2px 0 0', fontFamily: 'monospace' }}>{tNum}</p>
                            </div>
                          </div>
                        </td>
                        <td className="px-5 py-4">
                          <span style={{ fontSize: 13, color: '#374151' }}>
                            {ticket.category.charAt(0).toUpperCase() + ticket.category.slice(1)}
                          </span>
                        </td>
                        <td className="px-5 py-4">
                          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5, padding: '4px 10px', borderRadius: 99, fontSize: 11, fontWeight: 700, background: sCfg.bg, color: sCfg.color }}>
                            <span style={{ width: 6, height: 6, borderRadius: '50%', background: sCfg.dot }} />
                            {sCfg.label}
                          </span>
                        </td>
                        <td className="px-5 py-4">
                          <span style={{ display: 'inline-block', padding: '4px 12px', borderRadius: 99, fontSize: 11, fontWeight: 700, background: pCfg.bg, color: pCfg.color }}>
                            {ticket.priority.charAt(0).toUpperCase() + ticket.priority.slice(1)}
                          </span>
                        </td>
                        <td className="px-5 py-4">
                          <p style={{ fontSize: 13, color: '#374151', margin: 0 }}>{created.date}</p>
                          <p style={{ fontSize: 11, color: '#9CA3AF', margin: '2px 0 0' }}>{created.time}</p>
                        </td>
                        <td className="px-5 py-4">
                          <p style={{ fontSize: 13, color: '#374151', margin: 0 }}>{updated.date}</p>
                          <p style={{ fontSize: 11, color: '#9CA3AF', margin: '2px 0 0' }}>{updated.time}</p>
                        </td>
                        <td className="px-5 py-4">
                          <div style={{ position: 'relative' }}>
                            <button
                              onClick={() => setOpenDropdown(openDropdown === ticket.id ? null : ticket.id)}
                              className="w-8 h-8 rounded-lg flex items-center justify-center transition-all"
                              style={{ color: '#9CA3AF', background: 'transparent', border: 'none', cursor: 'pointer' }}
                              onMouseEnter={e => (e.currentTarget as HTMLElement).style.background = '#F3F4F6'}
                              onMouseLeave={e => (e.currentTarget as HTMLElement).style.background = 'transparent'}>
                              <MoreVertical size={16} />
                            </button>
                            {openDropdown === ticket.id && (
                              <div className="absolute right-0 top-9 w-44 rounded-xl shadow-xl overflow-hidden z-50 py-1"
                                style={{ background: '#FFFFFF', border: '1px solid #E5E7EB' }}>
                                <button
                                  onClick={() => { setActiveTicket(ticket.id); setOpenDropdown(null) }}
                                  className="w-full flex items-center gap-2.5 px-3.5 py-2.5 text-[12px] transition-all"
                                  style={{ color: '#374151', background: 'transparent', border: 'none', cursor: 'pointer', fontFamily: 'inherit' }}
                                  onMouseEnter={e => (e.currentTarget as HTMLElement).style.background = '#F9FAFB'}
                                  onMouseLeave={e => (e.currentTarget as HTMLElement).style.background = 'transparent'}>
                                  <MessageSquare size={12} /> View &amp; Reply
                                </button>
                                {(['in_progress', 'resolved', 'closed'] as const)
                                  .filter(s => s !== ticket.status)
                                  .map(s => {
                                    const c = STATUS_CONFIG[s]
                                    return (
                                      <button key={s}
                                        onClick={() => {
                                          setOpenDropdown(null)
                                          startRowStatusTransition(async () => {
                                            await updateTicketStatus(ticket.id, s)
                                          })
                                        }}
                                        className="w-full flex items-center gap-2.5 px-3.5 py-2.5 text-[12px] transition-all capitalize"
                                        style={{ color: c.color, background: 'transparent', border: 'none', cursor: 'pointer', fontFamily: 'inherit' }}
                                        onMouseEnter={e => (e.currentTarget as HTMLElement).style.background = '#F9FAFB'}
                                        onMouseLeave={e => (e.currentTarget as HTMLElement).style.background = 'transparent'}>
                                        Mark {c.label}
                                      </button>
                                    )
                                  })}
                              </div>
                            )}
                          </div>
                        </td>
                      </tr>
                    )
                  })
                )}
              </tbody>
            </table>
          </div>

          {/* Pagination */}
          {filtered.length > 0 && (
            <div className="flex items-center justify-between px-5 py-4" style={{ borderTop: '1px solid #F3F4F6' }}>
              <p style={{ fontSize: 13, color: '#6B7280', margin: 0 }}>
                Showing {Math.min((page - 1) * PER_PAGE + 1, filtered.length)} to {Math.min(page * PER_PAGE, filtered.length)} of {filtered.length} tickets
              </p>
              <div className="flex items-center gap-1.5">
                <button onClick={() => setPage(p => Math.max(1, p - 1))} disabled={page === 1}
                  className="w-8 h-8 rounded-lg flex items-center justify-center disabled:opacity-40 transition-all"
                  style={{ border: '1px solid #E5E7EB', color: '#6B7280', background: 'transparent', cursor: 'pointer' }}
                  onMouseEnter={e => { if (page > 1) (e.currentTarget as HTMLElement).style.background = '#F9FAFB' }}
                  onMouseLeave={e => (e.currentTarget as HTMLElement).style.background = 'transparent'}>
                  <ChevronLeft size={14} />
                </button>
                {Array.from({ length: totalPages }, (_, i) => i + 1).map(p => (
                  <button key={p} onClick={() => setPage(p)}
                    className="w-8 h-8 rounded-lg text-[13px] font-semibold flex items-center justify-center transition-all"
                    style={{
                      background: page === p ? '#DE1A1A' : 'transparent',
                      color:      page === p ? '#FFFFFF' : '#374151',
                      border:     page === p ? 'none' : '1px solid #E5E7EB',
                      cursor: 'pointer',
                    }}>
                    {p}
                  </button>
                ))}
                <button onClick={() => setPage(p => Math.min(totalPages, p + 1))} disabled={page === totalPages}
                  className="w-8 h-8 rounded-lg flex items-center justify-center disabled:opacity-40 transition-all"
                  style={{ border: '1px solid #E5E7EB', color: '#6B7280', background: 'transparent', cursor: 'pointer' }}
                  onMouseEnter={e => { if (page < totalPages) (e.currentTarget as HTMLElement).style.background = '#F9FAFB' }}
                  onMouseLeave={e => (e.currentTarget as HTMLElement).style.background = 'transparent'}>
                  <ChevronRight size={14} />
                </button>
              </div>
            </div>
          )}
        </div>
      </div>

      {(openDropdown || showSortMenu) && (
        <div className="fixed inset-0 z-10" onClick={() => { setOpenDropdown(null); setShowSortMenu(false) }} />
      )}

      {showNewTicket && <NewTicketModal onClose={() => setShowNewTicket(false)} />}
      {(() => {
        const liveTicket = activeTicket ? tickets.find(t => t.id === activeTicket) ?? null : null
        return liveTicket ? <TicketDetailModal ticket={liveTicket} onClose={() => setActiveTicket(null)} /> : null
      })()}
    </div>
  )
}
