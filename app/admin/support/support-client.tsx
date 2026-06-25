'use client'

import { useState, useTransition, useMemo, useEffect, useRef } from 'react'
import {
  Plus, Send, Loader2, X, Search, AlertCircle,
  CheckCircle2, XCircle, MessageSquare, ChevronDown,
  ArrowRight, LayoutGrid, List as ListIcon,
  Paperclip,
} from 'lucide-react'
import { addResponse, updateTicketStatus, createTicket, closeTicket } from '@/lib/actions/support'
import { createBrowserClient } from '@/lib/supabase/client'

type Response = { id: string; responder_id: string; responder_name: string; message: string; created_at: string }
type Ticket = {
  id: string; user_id: string; title: string; category: string
  description: string; status: string; priority: string; assigned_to?: string
  created_at: string; updated_at: string; support_responses: Response[]
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

const CATEGORIES_DEF = [
  { key: 'attendance',  label: 'Attendance',    emoji: '📅', color: '#10B981' },
  { key: 'leave',       label: 'Leave',         emoji: '🌴', color: '#22C55E' },
  { key: 'task',        label: 'Task',          emoji: '✅', color: '#6366F1' },
  { key: 'client',      label: 'Client',        emoji: '🤝', color: '#3B82F6' },
  { key: 'payment',     label: 'Payment',       emoji: '💰', color: '#F59E0B' },
  { key: 'freelancer',  label: 'Freelancer',    emoji: '👷', color: '#EC4899' },
  { key: 'design',      label: 'Design',        emoji: '🎨', color: '#8B5CF6' },
  { key: 'video',       label: 'Video Editing', emoji: '🎬', color: '#EF4444' },
  { key: 'marketing',   label: 'Marketing',     emoji: '📢', color: '#F97316' },
  { key: 'automation',  label: 'Automation',    emoji: '🤖', color: '#06B6D4' },
  { key: 'other',       label: 'Other',         emoji: '📋', color: '#9CA3AF' },
]

const KNOWLEDGE_BASE = [
  { label: 'Attendance Guides',  count: 16, img: '/support/scene-attendance.png',   bg: '#FFF8EE' },
  { label: 'Leave Policies',     count: 12, img: '/support/scene-common-fixes.png', bg: '#F0FDF4' },
  { label: 'Payroll & Salary',   count: 18, img: '/support/scene-payroll.png',      bg: '#FFF8F8' },
  { label: 'Payroll Help',       count: 22, img: '/support/scene-payroll-help.png', bg: '#F0F4FF' },
  { label: 'Getting Started',    count: 10, img: '/support/cat-support.png',        bg: '#FEF2F2' },
]

const CAT_IMAGES: Record<string, string> = {
  attendance: '/support/cat-attendance.png',
  payment:    '/support/cat-payment.png',
  other:      '/support/cat-technical.png',
  leave:      '/support/cat-general.png',
  client:     '/support/cat-support.png',
  freelancer: '/support/cat-support.png',
}


const CATEGORIES_FORM = ['attendance', 'leave', 'task', 'client', 'payment', 'freelancer', 'design', 'video', 'marketing', 'automation', 'other']
const PRIORITIES_FORM  = ['low', 'medium', 'high', 'urgent']

function ticketNum(i: number) { return `#TKT-${String(1001 + i).padStart(5, '0')}` }

function timeAgo(s: string) {
  const m = Math.floor((Date.now() - new Date(s).getTime()) / 60000)
  if (m < 60) return `${m}m ago`
  const h = Math.floor(m / 60)
  if (h < 24) return `${h}h ago`
  return `${Math.floor(h / 24)}d ago`
}


function renderMessage(msg: string) {
  if (msg.startsWith('[img]')) {
    return (
      <img
        src={msg.slice(5)}
        alt="attachment"
        style={{ maxWidth: '100%', borderRadius: 10, display: 'block', cursor: 'pointer' }}
        onClick={() => window.open(msg.slice(5), '_blank')}
      />
    )
  }
  return <>{msg}</>
}

function NewTicketModal({ onClose }: { onClose: () => void }) {
  const [form, setForm] = useState({ title: '', category: 'general', description: '', priority: 'normal' })
  const [error, setError] = useState('')
  const [pending, start] = useTransition()

  function submit() {
    if (!form.title.trim())       { setError('Title is required'); return }
    if (!form.description.trim()) { setError('Description is required'); return }
    setError('')
    start(async () => {
      const r = await createTicket(form)
      if (r.success) onClose()
      else setError(r.error ?? 'Failed')
    })
  }

  return (
    <>
      <div className="fixed inset-0 z-40" style={{ background: 'rgba(0,0,0,0.45)', backdropFilter: 'blur(4px)' }} onClick={onClose} />
      <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
        <div className="w-full max-w-[480px] rounded-2xl shadow-2xl" style={{ background: '#FFFFFF' }}>
          <div className="flex items-center justify-between px-6 py-5" style={{ borderBottom: '1px solid #F3F4F6' }}>
            <div>
              <h2 className="text-[16px] font-bold" style={{ color: '#111111' }}>New Support Ticket</h2>
              <p className="text-[12px] mt-0.5" style={{ color: '#9CA3AF' }}>Create a new support request</p>
            </div>
            <button onClick={onClose} className="w-8 h-8 rounded-full flex items-center justify-center" style={{ border: '1px solid #E5E7EB' }}>
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
                  {CATEGORIES_FORM.map(c => <option key={c} value={c}>{c.charAt(0).toUpperCase() + c.slice(1)}</option>)}
                </select>
              </div>
              <div>
                <label className="block text-[10px] font-bold uppercase tracking-[0.15em] mb-1.5" style={{ color: '#6B7280' }}>Priority</label>
                <select value={form.priority} onChange={e => setForm(p => ({ ...p, priority: e.target.value }))}
                  className="w-full rounded-xl px-4 py-2.5 text-[13px] outline-none"
                  style={{ background: '#F9FAFB', border: '1px solid #E5E7EB', color: '#111111', fontFamily: 'inherit' }}>
                  {PRIORITIES_FORM.map(p => <option key={p} value={p}>{p.charAt(0).toUpperCase() + p.slice(1)}</option>)}
                </select>
              </div>
            </div>
            <div>
              <label className="block text-[10px] font-bold uppercase tracking-[0.15em] mb-1.5" style={{ color: '#6B7280' }}>Description *</label>
              <textarea rows={4} value={form.description} onChange={e => setForm(p => ({ ...p, description: e.target.value }))}
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
            <button onClick={submit} disabled={pending}
              className="flex-1 py-2.5 rounded-xl text-[13px] font-semibold flex items-center justify-center gap-2 disabled:opacity-60"
              style={{ background: 'linear-gradient(135deg,#DE1A1A,#7F1D1D)', color: '#FFFFFF' }}>
              {pending ? <Loader2 size={13} className="animate-spin" /> : <Send size={13} />} Submit Ticket
            </button>
          </div>
        </div>
      </div>
    </>
  )
}

export default function AdminSupportClient({ tickets, currentUserId }: { tickets: Ticket[]; currentUserId: string }) {
  const [filter, setFilter]             = useState('all')
  const [search, setSearch]             = useState('')
  const [activeTab, setActiveTab]       = useState('Conversation')
  const [selectedId, setSelectedId]     = useState<string | null>(null)
  const [showNewTicket, setShowNew]     = useState(false)
  const [reply, setReply]               = useState('')
  const [replyPending, startReply]      = useTransition()
  const [statusPending, startStatus]    = useTransition()
  const [isClosePending, startClose]    = useTransition()
  const [closeConfirm, setCloseConfirm] = useState<string | null>(null)

  const supabase = createBrowserClient()
  const [realtimeMsgs, setRealtimeMsgs] = useState<Record<string, { id: string; responder_id: string; responder_name: string; message: string; created_at: string }[]>>({})
  const [isUploading, setIsUploading] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)

  const stats = useMemo(() => ({
    open:        tickets.filter(t => t.status === 'open').length,
    in_progress: tickets.filter(t => t.status === 'in_progress').length,
    resolved:    tickets.filter(t => t.status === 'resolved').length,
    closed:      tickets.filter(t => t.status === 'closed').length,
  }), [tickets])

  const catCounts = useMemo(() => {
    const m: Record<string, number> = {}
    tickets.forEach(t => { m[t.category] = (m[t.category] ?? 0) + 1 })
    return m
  }, [tickets])

  const indexMap = useMemo(() => {
    const m: Record<string, number> = {}
    ;[...tickets].sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime())
      .forEach((t, i) => { m[t.id] = i })
    return m
  }, [tickets])

  const filtered = useMemo(() => {
    const q = search.toLowerCase()
    return [...tickets]
      .filter(t => {
        const ok = filter === 'all' || t.status === filter
        const sq = !q || t.title.toLowerCase().includes(q) || t.category.includes(q)
        return ok && sq
      })
      .sort((a, b) => new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime())
  }, [tickets, filter, search])

  const featured = useMemo(
    () => (selectedId ? tickets.find(t => t.id === selectedId) : null) ?? filtered[0] ?? null,
    [selectedId, tickets, filtered]
  )
  const listTickets = useMemo(
    () => filtered.filter(t => t.id !== featured?.id),
    [filtered, featured]
  )

  useEffect(() => {
    if (!featured) return
    const ticketId = featured.id
    const channel = supabase
      .channel(`admin-support-${ticketId}`)
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'support_responses',
          filter: `ticket_id=eq.${ticketId}`,
        },
        (payload) => {
          setRealtimeMsgs(prev => ({
            ...prev,
            [ticketId]: [
              ...(prev[ticketId] ?? []),
              payload.new as { id: string; responder_id: string; responder_name: string; message: string; created_at: string },
            ],
          }))
        }
      )
      .subscribe()
    return () => { supabase.removeChannel(channel) }
  }, [featured?.id])

  function handleReply() {
    if (!reply.trim() || !featured) return
    startReply(async () => { await addResponse({ ticket_id: featured.id, message: reply.trim() }); setReply('') })
  }

  async function handleFileUpload() {
    if (!featured) return
    fileInputRef.current?.click()
  }

  async function handleFileSelect(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file || !featured) return
    if (file.size > 5 * 1024 * 1024) { alert('Max file size is 5 MB'); return }
    setIsUploading(true)
    try {
      const ext = file.name.split('.').pop() ?? 'jpg'
      const path = `${featured.id}/${Date.now()}.${ext}`
      const { data, error } = await supabase.storage.from('support-attachments').upload(path, file)
      if (error || !data) { console.error(error); return }
      const { data: { publicUrl } } = supabase.storage.from('support-attachments').getPublicUrl(data.path)
      await addResponse({ ticket_id: featured.id, message: `[img]${publicUrl}` })
    } finally {
      setIsUploading(false)
      if (fileInputRef.current) fileInputRef.current.value = ''
    }
  }

  function handleStatus(tid: string, s: string) {
    startStatus(async () => { await updateTicketStatus(tid, s) })
  }

  function handleCloseAdmin(tid: string) {
    startClose(async () => { await closeTicket(tid); setCloseConfirm(null) })
  }

  const maxCat = Math.max(...CATEGORIES_DEF.map(c => catCounts[c.key] ?? 0), 1)

  return (
    <div style={{ background: '#F4F5F7', minHeight: '100vh' }}>

      {/* ── HERO BANNER ──────────────────────────────────────────── */}
      <div style={{
        background: 'linear-gradient(135deg, #DE1A1A 0%, #8B1212 55%, #1A0808 100%)',
        borderBottom: '1px solid rgba(0,0,0,0.06)',
        position: 'relative', overflow: 'hidden', minHeight: 240,
      }}>
        {/* Hero character — right background */}
        <img src="/support/hero-agent.png" alt="" aria-hidden style={{ position: 'absolute', right: 280, bottom: 0, height: 230, objectFit: 'contain', zIndex: 1, pointerEvents: 'none', opacity: 0.95 }} className="hidden xl:block" />

        <div style={{ display: 'flex', gap: 20, padding: '28px 28px 0', position: 'relative', zIndex: 2 }}>

          {/* Left: heading + pills */}
          <div style={{ flex: 1 }}>
            <h1 style={{ fontSize: 34, fontWeight: 900, color: '#FFFFFF', fontFamily: 'var(--font-jakarta)', margin: 0, lineHeight: 1.15 }}>
              Support Workspace
            </h1>
            <p style={{ fontSize: 13, color: 'rgba(255,255,255,0.72)', margin: '6px 0 22px' }}>
              Manage, resolve, and track team support operations intelligently.
            </p>
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', paddingBottom: 28 }}>
              {[
                { key: 'all', label: 'All' },
                { key: 'open', label: 'Open' },
                { key: 'in_progress', label: 'In Progress' },
                { key: 'resolved', label: 'Resolved' },
                { key: 'closed', label: 'Closed' },
              ].map(tab => (
                <button key={tab.key} onClick={() => { setFilter(tab.key); setSelectedId(null) }}
                  style={{
                    padding: '7px 18px', borderRadius: 99, fontSize: 13, fontWeight: 600,
                    border: 'none', cursor: 'pointer', transition: 'all 0.15s',
                    background: filter === tab.key ? '#DE1A1A' : 'rgba(255,255,255,0.8)',
                    color: filter === tab.key ? '#fff' : '#6B7280',
                    boxShadow: filter === tab.key ? '0 4px 12px rgba(222,26,26,0.28)' : '0 1px 4px rgba(0,0,0,0.08)',
                  }}>
                  {tab.label}
                </button>
              ))}
            </div>
          </div>

          {/* Right: 4 stat cards 2×2 */}
          <div className="hidden lg:grid" style={{ gridTemplateColumns: '1fr 1fr', gap: 12, alignContent: 'start', paddingBottom: 28 }}>
            {[
              { label: 'Pending',      value: stats.open,        img: '/support/icon-pending.png',  color: '#EF4444', bg: '#FEE2E2' },
              { label: 'Avg Response', value: '2h',              img: '/support/icon-clock.png',    color: '#8B5CF6', bg: '#F5F3FF' },
              { label: 'Resolved',     value: stats.resolved,    img: '/support/icon-resolved.png', color: '#10B981', bg: '#F0FDF4' },
              { label: 'In Review',    value: stats.in_progress, img: '/support/icon-star.png',     color: '#F59E0B', bg: '#FFFBEB' },
            ].map((c, i) => (
              <div key={i} style={{
                background: '#FFFFFF', borderRadius: 20, padding: '14px 16px',
                boxShadow: '0 4px 20px rgba(0,0,0,0.09)', border: '1px solid rgba(0,0,0,0.05)', minWidth: 148,
              }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                  <div style={{ width: 44, height: 44, borderRadius: 12, background: c.bg, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, overflow: 'hidden' }}>
                    <img src={c.img} alt={c.label} style={{ width: 36, height: 36, objectFit: 'contain' }} />
                  </div>
                  <div style={{ textAlign: 'right' }}>
                    <div style={{ fontSize: 28, fontWeight: 900, color: '#111111', lineHeight: 1 }}>{c.value}</div>
                    <div style={{ fontSize: 11, color: '#9CA3AF', marginTop: 2 }}>{c.label}</div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* ── MAIN 3-COLUMN ────────────────────────────────────────── */}
      <div style={{ display: 'flex', gap: 18, padding: '22px 16px', alignItems: 'flex-start' }} className="md:!px-7">

        {/* LEFT: Categories */}
        <div className="hidden xl:block" style={{ width: 268, flexShrink: 0 }}>
          <div style={{
            background: '#FFFFFF', borderRadius: 24,
            boxShadow: '0 2px 16px rgba(0,0,0,0.06)', border: '1px solid rgba(0,0,0,0.05)', padding: 18,
          }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
              <span style={{ fontSize: 15, fontWeight: 700, color: '#111111' }}>Ticket Categories</span>
              <button onClick={() => setShowNew(true)}
                style={{ width: 28, height: 28, borderRadius: '50%', background: '#DE1A1A', border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', boxShadow: '0 2px 8px rgba(222,26,26,0.3)' }}>
                <Plus size={13} color="white" />
              </button>
            </div>
            <div style={{ position: 'relative', marginBottom: 12 }}>
              <Search size={12} style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', color: '#9CA3AF' }} />
              <input placeholder="Search categories…"
                style={{ width: '100%', paddingLeft: 28, paddingRight: 10, paddingTop: 8, paddingBottom: 8, borderRadius: 10, fontSize: 12, background: '#F9FAFB', border: '1px solid #F3F4F6', color: '#374151', outline: 'none', boxSizing: 'border-box' }} />
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
              {CATEGORIES_DEF.map(cat => {
                const count = catCounts[cat.key] ?? 0
                const pct   = (count / maxCat) * 100
                return (
                  <div key={cat.key}
                    style={{ padding: '9px 8px', borderRadius: 12, cursor: 'pointer', transition: 'background 0.12s' }}
                    onMouseEnter={e => (e.currentTarget as HTMLElement).style.background = '#F9FAFB'}
                    onMouseLeave={e => (e.currentTarget as HTMLElement).style.background = 'transparent'}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                      <div style={{ width: 36, height: 36, borderRadius: 10, background: `${cat.color}15`, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, overflow: 'hidden' }}>
                        {CAT_IMAGES[cat.key]
                          ? <img src={CAT_IMAGES[cat.key]} alt={cat.label} style={{ width: 28, height: 28, objectFit: 'contain' }} />
                          : <span style={{ fontSize: 18 }}>{cat.emoji}</span>}
                      </div>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                          <span style={{ fontSize: 12, fontWeight: 600, color: '#111111' }}>{cat.label}</span>
                          <span style={{ fontSize: 13, fontWeight: 700, color: '#111111' }}>{count}</span>
                        </div>
                        <div style={{ marginTop: 5, height: 3, borderRadius: 99, background: '#F3F4F6' }}>
                          <div style={{ height: '100%', width: `${pct}%`, background: cat.color, borderRadius: 99 }} />
                        </div>
                      </div>
                    </div>
                  </div>
                )
              })}
            </div>
            <button style={{ width: '100%', marginTop: 12, padding: '10px', borderRadius: 12, fontSize: 12, fontWeight: 600, color: '#6B7280', background: '#F9FAFB', border: '1px solid #F3F4F6', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 5 }}>
              View All Categories <ArrowRight size={12} />
            </button>
          </div>
        </div>

        {/* CENTER: Ticket Workspace */}
        <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', gap: 14 }}>

          {/* Controls */}
          <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
            <div style={{ position: 'relative', flex: 1, minWidth: 160 }}>
              <Search size={13} style={{ position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)', color: '#9CA3AF' }} />
              <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search tickets…"
                style={{ width: '100%', paddingLeft: 34, paddingRight: 12, paddingTop: 10, paddingBottom: 10, borderRadius: 12, fontSize: 13, background: '#FFFFFF', border: '1px solid #E5E7EB', color: '#111111', outline: 'none', boxShadow: '0 1px 4px rgba(0,0,0,0.06)', boxSizing: 'border-box' }} />
            </div>
            <button style={{ display: 'flex', alignItems: 'center', gap: 5, padding: '10px 14px', borderRadius: 12, fontSize: 13, fontWeight: 600, color: '#374151', background: '#FFFFFF', border: '1px solid #E5E7EB', cursor: 'pointer', whiteSpace: 'nowrap', boxShadow: '0 1px 4px rgba(0,0,0,0.06)' }}>
              Sort: Newest <ChevronDown size={12} />
            </button>
            <div style={{ display: 'flex', gap: 3, background: '#FFFFFF', borderRadius: 12, padding: 4, border: '1px solid #E5E7EB' }}>
              <button style={{ width: 32, height: 32, borderRadius: 8, display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#FEE2E2', border: 'none', cursor: 'pointer' }}>
                <LayoutGrid size={14} color="#DE1A1A" />
              </button>
              <button style={{ width: 32, height: 32, borderRadius: 8, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'transparent', border: 'none', cursor: 'pointer' }}>
                <ListIcon size={14} color="#9CA3AF" />
              </button>
            </div>
          </div>

          {/* Featured Ticket */}
          {featured && (() => {
            const sc = STATUS_CONFIG[featured.status as keyof typeof STATUS_CONFIG] ?? STATUS_CONFIG.closed
            const pc = PRIORITY_CONFIG[featured.priority as keyof typeof PRIORITY_CONFIG] ?? PRIORITY_CONFIG.normal
            const responses = featured.support_responses ?? []
            return (
              <div style={{ background: '#FFFFFF', borderRadius: 22, boxShadow: '0 4px 24px rgba(0,0,0,0.08)', border: '1px solid rgba(0,0,0,0.05)', overflow: 'hidden' }}>

                {/* Header */}
                <div style={{ padding: '16px 20px', borderBottom: '1px solid #F3F4F6', display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12 }}>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                      <span style={{ width: 8, height: 8, borderRadius: '50%', background: sc.dot, display: 'inline-block', flexShrink: 0 }} />
                      <span style={{ fontSize: 15, fontWeight: 700, color: '#111111' }}>{featured.title}</span>
                      <span style={{ padding: '3px 10px', borderRadius: 99, fontSize: 11, fontWeight: 700, background: pc.bg, color: pc.color }}>
                        {featured.priority.charAt(0).toUpperCase() + featured.priority.slice(1)}
                      </span>
                      <span style={{ padding: '3px 10px', borderRadius: 99, fontSize: 11, fontWeight: 700, background: sc.bg, color: sc.color }}>
                        {sc.label}
                      </span>
                    </div>
                    <div style={{ display: 'flex', gap: 14, marginTop: 5, flexWrap: 'wrap' }}>
                      <span style={{ fontSize: 11, color: '#9CA3AF', fontFamily: 'monospace' }}>{ticketNum(indexMap[featured.id] ?? 0)}</span>
                      <span style={{ fontSize: 11, color: '#9CA3AF' }}>{CATEGORIES_DEF.find(c => c.key === featured.category)?.emoji ?? ''} {CATEGORIES_DEF.find(c => c.key === featured.category)?.label ?? featured.category}</span>
                      <span style={{ fontSize: 11, color: '#9CA3AF' }}>Updated {timeAgo(featured.updated_at)}</span>
                    </div>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0 }}>
                    <div style={{ textAlign: 'right' }}>
                      <div style={{ fontSize: 12, fontWeight: 700, color: '#111111' }}>Support Agent</div>
                      <div style={{ fontSize: 10, color: '#9CA3AF' }}>Updated {timeAgo(featured.updated_at)}</div>
                    </div>
                    <div style={{ width: 36, height: 36, borderRadius: '50%', background: 'linear-gradient(135deg,#DE1A1A,#7F1D1D)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 12, fontWeight: 700, color: '#fff' }}>
                      SA
                    </div>
                  </div>
                </div>

                {/* Tabs */}
                <div style={{ display: 'flex', padding: '0 20px', borderBottom: '1px solid #F3F4F6', overflowX: 'auto' }}>
                  {['Conversation', 'Details', 'Attachments (2)', 'Activity', 'Notes'].map(tab => (
                    <button key={tab} onClick={() => setActiveTab(tab)}
                      style={{
                        padding: '11px 14px', fontSize: 13, fontWeight: activeTab === tab ? 700 : 500,
                        color: activeTab === tab ? '#DE1A1A' : '#6B7280',
                        background: 'transparent', border: 'none', cursor: 'pointer', whiteSpace: 'nowrap',
                        borderBottom: `2px solid ${activeTab === tab ? '#DE1A1A' : 'transparent'}`,
                        marginBottom: -1,
                      }}>
                      {tab}
                    </button>
                  ))}
                </div>

                {/* Body: Conversation + Info panel */}
                <div style={{ display: 'flex' }}>
                  {/* Conversation */}
                  <div style={{ flex: 1, padding: '16px 20px', minWidth: 0 }}>
                    {activeTab === 'Conversation' ? (
                      <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                        {/* Original description */}
                        <div style={{ display: 'flex', gap: 10, alignItems: 'flex-start' }}>
                          <div style={{ width: 32, height: 32, borderRadius: '50%', background: '#F3F4F6', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 11, fontWeight: 700, color: '#6B7280', flexShrink: 0 }}>U</div>
                          <div>
                            <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 4 }}>
                              <span style={{ fontSize: 12, fontWeight: 700, color: '#111111' }}>User</span>
                              <span style={{ fontSize: 11, color: '#9CA3AF' }}>
                                {new Date(featured.created_at).toLocaleString('en-IN', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}
                              </span>
                            </div>
                            <div style={{ background: '#F9FAFB', borderRadius: '4px 14px 14px 14px', padding: '10px 14px', fontSize: 13, color: '#374151', lineHeight: 1.55, border: '1px solid #F3F4F6' }}>
                              {featured.description}
                            </div>
                          </div>
                        </div>
                        {[
                          ...responses,
                          ...(realtimeMsgs[featured.id] ?? []),
                        ]
                          .filter((r, i, arr) => arr.findIndex(x => x.id === r.id) === i)
                          .map(r => {
                            const isAdmin = r.responder_id !== featured.user_id
                            return (
                              <div key={r.id} style={{ display: 'flex', flexDirection: 'column', alignItems: isAdmin ? 'flex-end' : 'flex-start', marginBottom: 4 }}>
                                <p style={{ fontSize: 11, color: '#9CA3AF', margin: '0 0 4px', paddingLeft: isAdmin ? 0 : 12, paddingRight: isAdmin ? 12 : 0 }}>
                                  {isAdmin ? `${r.responder_name} (Support)` : 'Member'}
                                </p>
                                <div style={{
                                  maxWidth: 380,
                                  padding: '10px 14px',
                                  borderRadius: isAdmin ? '14px 4px 14px 14px' : '4px 14px 14px 14px',
                                  background: isAdmin ? 'rgba(222,26,26,0.06)' : '#F3F4F6',
                                  border: isAdmin ? '1px solid rgba(222,26,26,0.09)' : '1px solid #E5E7EB',
                                  fontSize: 13, color: '#374151', lineHeight: 1.55,
                                }}>
                                  {renderMessage(r.message)}
                                </div>
                                <p style={{ fontSize: 10, color: '#9CA3AF', margin: '3px 4px 0', textAlign: isAdmin ? 'right' : 'left' }}>
                                  {new Date(r.created_at).toLocaleString('en-IN', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}
                                </p>
                              </div>
                            )
                          })}
                        {featured.status === 'closed' && (
                          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6, padding: '20px 0 12px' }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '8px 18px', borderRadius: 99, background: '#F3F4F6', border: '1px solid #E5E7EB' }}>
                              <XCircle size={13} color="#6B7280" />
                              <span style={{ fontSize: 12, fontWeight: 700, color: '#6B7280' }}>Ticket Closed</span>
                            </div>
                            <p style={{ fontSize: 11, color: '#9CA3AF', margin: 0 }}>This ticket has been closed.</p>
                          </div>
                        )}
                        {/* Reply input */}
                        {featured.status !== 'closed' && <div style={{ display: 'flex', gap: 8, marginTop: 4, alignItems: 'center' }}>
                          <input
                            ref={fileInputRef}
                            type="file"
                            accept="image/*"
                            style={{ display: 'none' }}
                            onChange={handleFileSelect}
                          />
                          <button
                            onClick={handleFileUpload}
                            disabled={isUploading || replyPending}
                            style={{ width: 38, height: 38, borderRadius: 10, border: '1px solid #E5E7EB', background: '#F9FAFB', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', flexShrink: 0 }}
                          >
                            {isUploading
                              ? <Loader2 size={14} color="#9CA3AF" className="animate-spin" />
                              : <Paperclip size={14} color="#9CA3AF" />
                            }
                          </button>
                          <input value={reply} onChange={e => setReply(e.target.value)} placeholder="Type a reply…"
                            onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleReply() } }}
                            disabled={isUploading}
                            style={{ flex: 1, padding: '10px 14px', borderRadius: 12, fontSize: 13, background: '#F9FAFB', border: '1px solid #E5E7EB', color: '#111111', outline: 'none', fontFamily: 'inherit' }} />
                          <button onClick={handleReply} disabled={replyPending || isUploading || !reply.trim()}
                            style={{ padding: '10px 16px', borderRadius: 12, background: 'linear-gradient(135deg,#DE1A1A,#7F1D1D)', color: '#fff', border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 5, fontSize: 13, fontWeight: 600, opacity: (!reply.trim() || replyPending || isUploading) ? 0.5 : 1, boxShadow: '0 4px 12px rgba(222,26,26,0.3)' }}>
                            {replyPending ? <Loader2 size={13} className="animate-spin" /> : <Send size={13} />} Send
                          </button>
                        </div>}
                      </div>
                    ) : (
                      <div style={{ padding: '32px 0', textAlign: 'center', color: '#9CA3AF', fontSize: 13 }}>
                        {activeTab} — coming soon
                      </div>
                    )}
                  </div>

                  {/* Ticket Info + Quick Actions (right of featured) */}
                  <div className="hidden lg:flex" style={{ width: 196, flexShrink: 0, borderLeft: '1px solid #F3F4F6', padding: 16, flexDirection: 'column', gap: 18 }}>
                    <div>
                      <p style={{ fontSize: 10, fontWeight: 700, color: '#9CA3AF', textTransform: 'uppercase', letterSpacing: '0.12em', margin: '0 0 10px' }}>Ticket Info</p>
                      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                        {[
                          { label: 'Priority',    val: featured.priority.charAt(0).toUpperCase() + featured.priority.slice(1), dot: pc.color },
                          { label: 'Status',      val: sc.label, dot: sc.dot },
                          { label: 'Type',        val: (CATEGORIES_DEF.find(c => c.key === featured.category)?.label ?? featured.category), dot: CATEGORIES_DEF.find(c => c.key === featured.category)?.color ?? '#6B7280' },
                          ...(featured.assigned_to ? [{ label: 'Assigned To', val: featured.assigned_to, dot: '#6366F1' }] : []),
                        ].map(row => (
                          <div key={row.label} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                            <span style={{ fontSize: 11, color: '#9CA3AF' }}>{row.label}</span>
                            <span style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 12, fontWeight: 600, color: '#111111' }}>
                              <span style={{ width: 6, height: 6, borderRadius: '50%', background: row.dot, display: 'inline-block' }} /> {row.val}
                            </span>
                          </div>
                        ))}
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                          <span style={{ fontSize: 11, color: '#9CA3AF' }}>Created</span>
                          <span style={{ fontSize: 12, fontWeight: 600, color: '#111111' }}>
                            {new Date(featured.created_at).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: '2-digit' })}
                          </span>
                        </div>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                          <span style={{ fontSize: 11, color: '#9CA3AF' }}>Last Updated</span>
                          <span style={{ fontSize: 12, fontWeight: 600, color: '#111111' }}>
                            {new Date(featured.updated_at).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: '2-digit' })}
                          </span>
                        </div>
                      </div>
                    </div>
                    <div>
                      <p style={{ fontSize: 10, fontWeight: 700, color: '#9CA3AF', textTransform: 'uppercase', letterSpacing: '0.12em', margin: '0 0 8px' }}>Quick Actions</p>
                      <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                        <button onClick={() => handleStatus(featured.id, 'in_progress')}
                          disabled={statusPending || featured.status === 'in_progress'}
                          style={{ padding: '9px 10px', borderRadius: 10, fontSize: 12, fontWeight: 600, color: '#D97706', background: '#FEF3C7', border: '1px solid rgba(217,119,6,0.18)', cursor: 'pointer', textAlign: 'left', opacity: featured.status === 'in_progress' ? 0.5 : 1 }}>
                          Mark In Progress
                        </button>
                        <button onClick={() => handleStatus(featured.id, 'resolved')}
                          disabled={statusPending || featured.status === 'resolved'}
                          style={{ padding: '9px 10px', borderRadius: 10, fontSize: 12, fontWeight: 600, color: '#15803D', background: '#DCFCE7', border: '1px solid rgba(21,128,61,0.18)', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 5, opacity: featured.status === 'resolved' ? 0.5 : 1 }}>
                          <CheckCircle2 size={12} /> Resolve Ticket
                        </button>
                        <button onClick={() => setCloseConfirm(featured.id)}
                          disabled={featured.status === 'closed'}
                          style={{ padding: '9px 10px', borderRadius: 10, fontSize: 12, fontWeight: 600, color: '#6B7280', background: '#F3F4F6', border: '1px solid #E5E7EB', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 5, opacity: featured.status === 'closed' ? 0.5 : 1 }}>
                          <XCircle size={12} /> Close Ticket
                        </button>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            )
          })()}

          {/* Empty state */}
          {filtered.length === 0 && (
            <div style={{ background: '#FFFFFF', borderRadius: 22, padding: '40px 20px', textAlign: 'center', boxShadow: '0 2px 8px rgba(0,0,0,0.04)', border: '1px solid #E5E7EB' }}>
              <img src="/support/hero-agent-2.png" alt="" style={{ width: 140, height: 140, objectFit: 'contain', margin: '0 auto 12px' }} />
              <p style={{ fontSize: 14, fontWeight: 600, color: '#9CA3AF', margin: '0 0 4px' }}>No tickets found</p>
              <p style={{ fontSize: 12, color: '#D1D5DB', margin: 0 }}>Try adjusting your search or filter</p>
            </div>
          )}

          {/* Ticket list */}
          {listTickets.length > 0 && (
            <div style={{ background: '#FFFFFF', borderRadius: 22, boxShadow: '0 2px 12px rgba(0,0,0,0.06)', border: '1px solid rgba(0,0,0,0.05)', overflow: 'hidden' }}>
              {listTickets.slice(0, 6).map((t, i, arr) => {
                const sc = STATUS_CONFIG[t.status as keyof typeof STATUS_CONFIG] ?? STATUS_CONFIG.closed
                const pc = PRIORITY_CONFIG[t.priority as keyof typeof PRIORITY_CONFIG] ?? PRIORITY_CONFIG.normal
                return (
                  <div key={t.id}
                    onClick={() => { setSelectedId(t.id); setActiveTab('Conversation') }}
                    style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '13px 20px', borderBottom: i < arr.length - 1 ? '1px solid #F9FAFB' : 'none', cursor: 'pointer', transition: 'background 0.12s' }}
                    onMouseEnter={e => (e.currentTarget as HTMLElement).style.background = '#FAFAFA'}
                    onMouseLeave={e => (e.currentTarget as HTMLElement).style.background = 'transparent'}>
                    <div style={{ width: 38, height: 38, borderRadius: 11, background: '#F9FAFB', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, position: 'relative' }}>
                      <MessageSquare size={17} color="#9CA3AF" />
                      <span style={{ position: 'absolute', bottom: 2, right: 2, width: 8, height: 8, borderRadius: '50%', background: sc.dot, border: '1.5px solid white' }} />
                    </div>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <p style={{ fontSize: 13, fontWeight: 700, color: '#111111', margin: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{t.title}</p>
                      <p style={{ fontSize: 11, color: '#9CA3AF', margin: '2px 0 0', fontFamily: 'monospace' }}>{ticketNum(indexMap[t.id] ?? i)} · {CATEGORIES_DEF.find(c => c.key === t.category)?.label ?? t.category}</p>
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexShrink: 0 }}>
                      <span style={{ padding: '3px 8px', borderRadius: 99, fontSize: 10, fontWeight: 700, background: pc.bg, color: pc.color }}>
                        {t.priority.charAt(0).toUpperCase() + t.priority.slice(1)}
                      </span>
                      <span style={{ padding: '3px 8px', borderRadius: 99, fontSize: 10, fontWeight: 700, background: sc.bg, color: sc.color }}>
                        {sc.label}
                      </span>
                    </div>
                    <div className="hidden md:flex" style={{ alignItems: 'center', gap: 8, flexShrink: 0 }}>
                      <span style={{ fontSize: 11, color: '#9CA3AF' }}>{timeAgo(t.updated_at)}</span>
                      <div style={{ width: 28, height: 28, borderRadius: '50%', background: 'linear-gradient(135deg,#DE1A1A,#7F1D1D)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 10, fontWeight: 700, color: '#fff' }}>A</div>
                    </div>
                    <div style={{ display: 'flex', gap: 6, flexShrink: 0 }} onClick={e => e.stopPropagation()}>
                      <button
                        onClick={() => { setSelectedId(t.id); setActiveTab('Conversation') }}
                        style={{ padding: '6px 10px', borderRadius: 8, border: '1px solid #E5E7EB', background: '#F9FAFB', fontSize: 11, fontWeight: 600, color: '#374151', cursor: 'pointer', whiteSpace: 'nowrap' }}
                      >
                        {t.support_responses.length > 0 ? 'Continue Chat' : 'Start Chat'}
                      </button>
                      <button
                        onClick={() => setCloseConfirm(t.id)}
                        disabled={t.status === 'closed'}
                        style={{ padding: '6px 10px', borderRadius: 8, border: '1px solid #E5E7EB', background: '#F9FAFB', fontSize: 11, fontWeight: 600, color: '#6B7280', cursor: 'pointer', opacity: t.status === 'closed' ? 0.5 : 1 }}
                      >
                        Close
                      </button>
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </div>

        {/* RIGHT: Widgets */}
        <div className="hidden xl:flex" style={{ width: 284, flexShrink: 0, flexDirection: 'column', gap: 16 }}>

          {/* Request Overview */}
          <div style={{ background: '#FFFFFF', borderRadius: 22, padding: 18, boxShadow: '0 2px 16px rgba(0,0,0,0.06)', border: '1px solid rgba(0,0,0,0.05)' }}>
            <span style={{ fontSize: 14, fontWeight: 700, color: '#111111', display: 'block', marginBottom: 14 }}>Request Overview</span>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              {[
                { label: 'Pending',    value: stats.open,        color: '#DE1A1A', bg: '#FEE2E2' },
                { label: 'In Review',  value: stats.in_progress, color: '#D97706', bg: '#FEF3C7' },
                { label: 'Resolved',   value: stats.resolved,    color: '#15803D', bg: '#DCFCE7' },
                { label: 'Closed',     value: stats.closed,      color: '#6B7280', bg: '#F3F4F6' },
              ].map(row => (
                <div key={row.label} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <span style={{ width: 8, height: 8, borderRadius: '50%', background: row.color, display: 'inline-block' }} />
                    <span style={{ fontSize: 12, color: '#6B7280' }}>{row.label}</span>
                  </div>
                  <span style={{ padding: '3px 10px', borderRadius: 99, fontSize: 12, fontWeight: 700, background: row.bg, color: row.color }}>{row.value}</span>
                </div>
              ))}
            </div>
            <div style={{ marginTop: 14, paddingTop: 14, borderTop: '1px solid #F3F4F6' }}>
              <p style={{ fontSize: 11, fontWeight: 700, color: '#9CA3AF', textTransform: 'uppercase', letterSpacing: '0.1em', margin: '0 0 10px' }}>By Type</p>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                {CATEGORIES_DEF.filter(c => (catCounts[c.key] ?? 0) > 0).slice(0, 5).map(cat => (
                  <div key={cat.key} style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
                    <span style={{ fontSize: 13 }}>{cat.emoji}</span>
                    <span style={{ fontSize: 11, color: '#374151', flex: 1 }}>{cat.label}</span>
                    <span style={{ fontSize: 11, fontWeight: 700, color: cat.color }}>{catCounts[cat.key] ?? 0}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* Recent Requests */}
          <div style={{ background: '#FFFFFF', borderRadius: 22, padding: 18, boxShadow: '0 2px 16px rgba(0,0,0,0.06)', border: '1px solid rgba(0,0,0,0.05)' }}>
            <span style={{ fontSize: 14, fontWeight: 700, color: '#111111', display: 'block', marginBottom: 14 }}>Recent Requests</span>
            {tickets.length === 0 ? (
              <p style={{ fontSize: 12, color: '#9CA3AF', textAlign: 'center', padding: '16px 0' }}>No requests yet</p>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 0 }}>
                {tickets.slice(0, 5).map((t, i) => {
                  const cat = CATEGORIES_DEF.find(c => c.key === t.category)
                  const sc  = STATUS_CONFIG[t.status as keyof typeof STATUS_CONFIG] ?? STATUS_CONFIG.closed
                  return (
                    <div key={t.id}
                      onClick={() => { setSelectedId(t.id); setActiveTab('Conversation') }}
                      style={{ display: 'flex', alignItems: 'flex-start', gap: 9, padding: '9px 0', borderBottom: i < Math.min(tickets.length, 5) - 1 ? '1px solid #F9FAFB' : 'none', cursor: 'pointer' }}>
                      <span style={{ fontSize: 16, flexShrink: 0, marginTop: 1 }}>{cat?.emoji ?? '📋'}</span>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <p style={{ fontSize: 11, fontWeight: 600, color: '#111111', margin: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{t.title}</p>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 5, marginTop: 3 }}>
                          <span style={{ padding: '1px 6px', borderRadius: 99, fontSize: 9, fontWeight: 700, background: sc.bg, color: sc.color }}>{sc.label}</span>
                          {t.assigned_to && <span style={{ fontSize: 9, color: '#9CA3AF' }}>→ {t.assigned_to}</span>}
                        </div>
                      </div>
                      <span style={{ fontSize: 10, color: '#9CA3AF', flexShrink: 0 }}>{timeAgo(t.updated_at)}</span>
                    </div>
                  )
                })}
              </div>
            )}
          </div>

          {/* Response SLA */}
          <div style={{ background: 'linear-gradient(145deg,#F0FDF4 0%,#DCFCE7 100%)', borderRadius: 22, padding: 18, boxShadow: '0 2px 16px rgba(34,197,94,0.10)', border: '1px solid rgba(34,197,94,0.2)' }}>
            <span style={{ fontSize: 14, fontWeight: 700, color: '#111111', display: 'block', marginBottom: 12 }}>Response SLA</span>
            {[
              { label: 'Avg First Response', value: '2h',   color: '#15803D' },
              { label: 'Avg Resolution',     value: '8h',   color: '#15803D' },
              { label: 'Open Rate',          value: `${stats.open > 0 ? Math.round((stats.open / (tickets.length || 1)) * 100) : 0}%`, color: '#D97706' },
            ].map(s => (
              <div key={s.label} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                <span style={{ fontSize: 11, color: '#6B7280' }}>{s.label}</span>
                <span style={{ fontSize: 13, fontWeight: 800, color: s.color }}>{s.value}</span>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* ── KNOWLEDGE BASE ───────────────────────────────────────── */}
      <div style={{ padding: '0 28px 22px' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
          <h3 style={{ fontSize: 16, fontWeight: 700, color: '#111111', margin: 0 }}>Knowledge Base</h3>
          <button style={{ fontSize: 12, fontWeight: 600, color: '#DE1A1A', background: 'none', border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 4 }}>
            View All Articles <ArrowRight size={12} />
          </button>
        </div>
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-3">
          {KNOWLEDGE_BASE.map((card, i) => (
            <div key={i}
              style={{ background: '#FFFFFF', borderRadius: 20, padding: 16, boxShadow: '0 2px 12px rgba(0,0,0,0.06)', border: '1px solid rgba(0,0,0,0.05)', cursor: 'pointer', transition: 'all 0.15s' }}
              onMouseEnter={e => { const el = e.currentTarget as HTMLElement; el.style.transform = 'translateY(-3px)'; el.style.boxShadow = '0 10px 28px rgba(0,0,0,0.1)' }}
              onMouseLeave={e => { const el = e.currentTarget as HTMLElement; el.style.transform = 'translateY(0)'; el.style.boxShadow = '0 2px 12px rgba(0,0,0,0.06)' }}>
              <div style={{ width: '100%', height: 90, borderRadius: 14, background: card.bg, marginBottom: 12, display: 'flex', alignItems: 'center', justifyContent: 'center', overflow: 'hidden' }}>
                <img src={card.img} alt={card.label} style={{ width: '100%', height: '100%', objectFit: 'cover', borderRadius: 14 }} />
              </div>
              <p style={{ fontSize: 13, fontWeight: 700, color: '#111111', margin: '0 0 3px', lineHeight: 1.3 }}>{card.label}</p>
              <p style={{ fontSize: 11, color: '#9CA3AF', margin: '0 0 10px' }}>{card.count} Articles</p>
              <ArrowRight size={14} color="#9CA3AF" />
            </div>
          ))}
        </div>
      </div>

      {/* ── RECENT TICKET ACTIVITY ───────────────────────────────── */}
      {tickets.length > 0 && (
        <div style={{ padding: '0 28px 40px' }}>
          <h3 style={{ fontSize: 16, fontWeight: 700, color: '#111111', margin: '0 0 14px' }}>Recent Ticket Activity</h3>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
            {tickets.slice(0, 4).map((t, i) => {
              const sc = STATUS_CONFIG[t.status as keyof typeof STATUS_CONFIG] ?? STATUS_CONFIG.closed
              return (
                <div key={t.id} onClick={() => { setSelectedId(t.id); window.scrollTo({ top: 0, behavior: 'smooth' }) }}
                  style={{ background: '#FFFFFF', borderRadius: 18, padding: 14, boxShadow: '0 2px 12px rgba(0,0,0,0.06)', border: '1px solid rgba(0,0,0,0.05)', cursor: 'pointer', transition: 'all 0.15s' }}
                  onMouseEnter={e => (e.currentTarget as HTMLElement).style.boxShadow = '0 6px 20px rgba(0,0,0,0.1)'}
                  onMouseLeave={e => (e.currentTarget as HTMLElement).style.boxShadow = '0 2px 12px rgba(0,0,0,0.06)'}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
                    <div style={{ width: 36, height: 36, borderRadius: 10, background: 'rgba(222,26,26,0.08)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 14, fontWeight: 800, color: '#DE1A1A' }}>
                      {t.title.charAt(0).toUpperCase()}
                    </div>
                    <div style={{ minWidth: 0 }}>
                      <p style={{ fontSize: 12, fontWeight: 700, color: '#111111', margin: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{t.title.slice(0, 22)}{t.title.length > 22 ? '…' : ''}</p>
                      <p style={{ fontSize: 10, color: '#9CA3AF', margin: '1px 0 0', fontFamily: 'monospace' }}>{ticketNum(indexMap[t.id] ?? i)}</p>
                    </div>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <span style={{ padding: '3px 8px', borderRadius: 99, fontSize: 10, fontWeight: 700, background: sc.bg, color: sc.color }}>{sc.label}</span>
                    <span style={{ fontSize: 10, color: '#9CA3AF' }}>{timeAgo(t.updated_at)}</span>
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      )}

      {showNewTicket && <NewTicketModal onClose={() => setShowNew(false)} />}

      {closeConfirm && (
        <>
          <div
            style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.4)', zIndex: 40 }}
            onClick={() => setCloseConfirm(null)}
          />
          <div style={{
            position: 'fixed', bottom: 0, left: 0, right: 0, zIndex: 50,
            background: '#fff', borderRadius: '24px 24px 0 0', padding: '24px 20px 36px',
          }}>
            <div style={{ width: 40, height: 4, borderRadius: 99, background: '#E5E7EB', margin: '0 auto 20px' }} />
            <h3 style={{ fontSize: 17, fontWeight: 800, color: '#111111', margin: '0 0 8px' }}>Close Ticket?</h3>
            <p style={{ fontSize: 13, color: '#6B7280', margin: '0 0 20px', lineHeight: 1.5 }}>
              This will mark the ticket as closed. The member will no longer be able to send messages.
            </p>
            <div style={{ display: 'flex', gap: 10 }}>
              <button
                onClick={() => setCloseConfirm(null)}
                style={{ flex: 1, padding: '12px', borderRadius: 14, border: '1px solid #E5E7EB', background: '#F9FAFB', fontSize: 14, fontWeight: 600, color: '#6B7280', cursor: 'pointer' }}
              >
                Cancel
              </button>
              <button
                onClick={() => handleCloseAdmin(closeConfirm!)}
                disabled={isClosePending}
                style={{ flex: 1, padding: '12px', borderRadius: 14, border: 'none', background: '#DE1A1A', fontSize: 14, fontWeight: 700, color: '#fff', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6, opacity: isClosePending ? 0.7 : 1 }}
              >
                {isClosePending && <Loader2 size={14} className="animate-spin" />}
                Close Ticket
              </button>
            </div>
          </div>
        </>
      )}
    </div>
  )
}
