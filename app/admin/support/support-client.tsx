'use client'

import { useState, useRef, useMemo, useEffect, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { createBrowserClient } from '@/lib/supabase/client'
import { addResponse, updateTicketStatus, createTicket, closeTicket, getSupportHandlerCandidates, setSupportHandler } from '@/lib/actions/support'
import { useToast } from '@/components/ui/useToast'
import {
  Plus, Search, Send, Loader2, X, Paperclip, ChevronLeft,
  Inbox, CheckCircle2, XCircle, AlertCircle, Clock, UserPlus, LifeBuoy, Check, Headphones,
} from 'lucide-react'
import {
  statusOf, categoryOf, CATEGORIES, priorityOf, PRIORITY_OPTIONS,
  timeAgo, ticketNum,
} from '@/lib/support-tokens'
import { Bubble, StatusRibbon, bodyParts, SUPPORT_ANIM_CSS } from '@/components/support/thread-ui'
import { PageHero } from '@/components/admin/PageHero'

type Response = { id: string; responder_id: string; responder_name: string; message: string; created_at: string }
type Ticket = {
  id: string; user_id: string; title: string; category: string
  description: string; status: string; priority: string; assigned_to?: string
  created_at: string; updated_at: string; support_responses: Response[]
}

// Three list segments. "New" = anything still being worked (open + in progress).
const SEGMENTS: { key: string; label: string }[] = [
  { key: 'new',      label: 'New' },
  { key: 'resolved', label: 'Resolved' },
  { key: 'closed',   label: 'Closed' },
]

function inSegment(status: string, seg: string): boolean {
  if (seg === 'new') return status === 'open' || status === 'in_progress'
  return status === seg
}

function requesterName(t: Ticket): string {
  const own = (t.support_responses ?? []).find(r => r.responder_id === t.user_id)
  return own?.responder_name ?? 'Member'
}

export default function AdminSupportClient({ tickets, currentUserId, canAssign = false }: { tickets: Ticket[]; currentUserId: string; canAssign?: boolean }) {
  void currentUserId
  const router = useRouter()
  const { toastEl, showToast } = useToast()
  const supabase = useMemo(() => createBrowserClient(), [])

  const [filter, setFilter]         = useState('new')
  const [search, setSearch]         = useState('')
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [showThreadMobile, setShowThreadMobile] = useState(false)
  const [showNew, setShowNew]       = useState(false)
  const [showAssign, setShowAssign] = useState(false)
  const [closeConfirm, setCloseConfirm] = useState<string | null>(null)

  const [reply, setReply]           = useState('')
  const [uploading, setUploading]   = useState(false)
  const [pending, startTransition]  = useTransition()
  const replyFileRef = useRef<HTMLInputElement>(null)
  const threadEndRef = useRef<HTMLDivElement>(null)

  const [live, setLive] = useState<Record<string, Response[]>>({})

  const stats = useMemo(() => ({
    open:        tickets.filter(t => t.status === 'open').length,
    in_progress: tickets.filter(t => t.status === 'in_progress').length,
    resolved:    tickets.filter(t => t.status === 'resolved').length,
    closed:      tickets.filter(t => t.status === 'closed').length,
  }), [tickets])

  const indexMap = useMemo(() => {
    const m: Record<string, number> = {}
    ;[...tickets].sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime())
      .forEach((t, i) => { m[t.id] = i })
    return m
  }, [tickets])

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase()
    return [...tickets]
      .filter(t => inSegment(t.status, filter)
        && (!q || t.title.toLowerCase().includes(q) || t.category.includes(q) || requesterName(t).toLowerCase().includes(q)))
      .sort((a, b) => new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime())
  }, [tickets, filter, search])

  const segCounts: Record<string, number> = {
    new: stats.open + stats.in_progress, resolved: stats.resolved, closed: stats.closed,
  }

  const active = useMemo(
    () => (selectedId ? tickets.find(t => t.id === selectedId) : null) ?? filtered[0] ?? null,
    [selectedId, tickets, filtered]
  )

  const messages = useMemo(() => {
    if (!active) return [] as Response[]
    const merged = [...(active.support_responses ?? []), ...(live[active.id] ?? [])]
    return merged.filter((r, i, arr) => arr.findIndex(x => x.id === r.id) === i)
      .sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime())
  }, [active, live])

  useEffect(() => {
    if (!active) return
    const id = active.id
    const channel = supabase
      .channel(`handler-support-${id}`)
      .on('postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'support_responses', filter: `ticket_id=eq.${id}` },
        payload => setLive(p => ({ ...p, [id]: [...(p[id] ?? []), payload.new as Response] })))
      .subscribe()
    return () => { supabase.removeChannel(channel) }
  }, [active?.id, supabase])

  useEffect(() => { threadEndRef.current?.scrollIntoView({ behavior: 'smooth' }) }, [messages.length, active?.id])

  function openTicket(id: string) {
    setSelectedId(id); setShowThreadMobile(true); setLive(p => ({ ...p, [id]: [] }))
  }

  function sendReply() {
    const msg = reply.trim()
    if (!msg || !active) return
    setReply('')
    startTransition(async () => { await addResponse({ ticket_id: active.id, message: msg }); router.refresh() })
  }

  async function uploadReplyImage(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file || !active) return
    if (file.size > 5 * 1024 * 1024) { showToast('Max image size is 5 MB'); return }
    setUploading(true)
    try {
      const ext = file.name.split('.').pop() ?? 'jpg'
      const path = `${active.id}/${Date.now()}.${ext}`
      const { data, error } = await supabase.storage.from('support-attachments').upload(path, file)
      if (error || !data) { showToast('Upload failed'); return }
      const { data: { publicUrl } } = supabase.storage.from('support-attachments').getPublicUrl(data.path)
      await addResponse({ ticket_id: active.id, message: `[img]${publicUrl}` })
      router.refresh()
    } finally {
      setUploading(false)
      if (replyFileRef.current) replyFileRef.current.value = ''
    }
  }

  function setStatus(id: string, status: string) {
    startTransition(async () => { await updateTicketStatus(id, status); router.refresh() })
  }

  function handleClose(id: string) {
    startTransition(async () => { await closeTicket(id); setCloseConfirm(null); router.refresh() })
  }

  return (
    <div style={{ background: '#EDEEF2', minHeight: '100vh' }}>
      {toastEl}
      <style>{SUPPORT_ANIM_CSS}</style>

      {/* ── Page wrap: hero card + two-pane shell ─────────────────── */}
      <div style={{ maxWidth: 1240, margin: '0 auto', padding: '16px' }}>

        {/* ── HERO ────────────────────────────────────────────────────── */}
        <div style={{ marginBottom: 14 }}>
          <PageHero
            eyebrow="SUPPORT INBOX"
            eyebrowIcon={<Headphones size={14} style={{ color: '#FFD700' }} />}
            title="Help Your Team Faster"
            subtitle="Manage tickets, reply instantly, and keep every client happy."
            maxContentWidth={400}
            illustration={
              <div style={{
                position: 'absolute', left: '28%', top: '50%', transform: 'translateY(-50%)',
                width: 'clamp(150px,45vw,420px)', height: '135%', pointerEvents: 'none', zIndex: 1,
              }}>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src="/brand/support/hero-girl.png" alt=""
                  style={{ width: '100%', height: '100%', objectFit: 'contain', objectPosition: 'center bottom', filter: 'drop-shadow(0 6px 24px rgba(0,0,0,0.25))' }} />
              </div>
            }
            actions={
              <>
                {canAssign && (
                  <button onClick={() => setShowAssign(true)}
                    style={{ display: 'inline-flex', alignItems: 'center', gap: 6, padding: '9px 15px', borderRadius: 12, fontSize: 12.5, fontWeight: 700, color: '#fff', background: 'rgba(255,255,255,0.15)', border: '1px solid rgba(255,255,255,0.3)', cursor: 'pointer', whiteSpace: 'nowrap', backdropFilter: 'blur(8px)' }}>
                    <UserPlus size={14} /> Assign handler
                  </button>
                )}
                <button onClick={() => setShowNew(true)}
                  style={{ display: 'inline-flex', alignItems: 'center', gap: 6, padding: '9px 16px', borderRadius: 12, fontSize: 12.5, fontWeight: 800, color: '#C01010', background: '#FFFFFF', border: 'none', cursor: 'pointer', boxShadow: '0 4px 14px rgba(0,0,0,0.22)', whiteSpace: 'nowrap' }}>
                  <Plus size={14} /> New ticket
                </button>
              </>
            }
          />
        </div>

        {/* ── STAT CARDS ROW ──────────────────────────────────────────── */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(148px, 1fr))', gap: 10, marginBottom: 14 }}>
          {[
            { icon: '🎧', label: 'Open Tickets',   value: stats.open,        sub: 'Needs attention',  dot: '#EF4444', accent: 'rgba(239,68,68,0.08)' },
            { icon: '⏳', label: 'Waiting',         value: stats.in_progress, sub: 'Waiting for reply', dot: '#8B5CF6', accent: 'rgba(139,92,246,0.08)' },
            { icon: '✅', label: 'Resolved Today',  value: stats.resolved,    sub: 'Great progress!',  dot: '#10B981', accent: 'rgba(16,185,129,0.08)' },
            { icon: '🔒', label: 'Closed',           value: stats.closed,      sub: 'All wrapped up',  dot: '#9CA3AF', accent: 'rgba(156,163,175,0.08)' },
          ].map(card => (
            <div key={card.label} style={{ background: '#FFFFFF', borderRadius: 18, padding: '16px 16px 14px', border: '1px solid #EBEDF2', boxShadow: '0 2px 12px rgba(0,0,0,0.05)', display: 'flex', alignItems: 'center', gap: 13 }}>
              <div style={{ width: 46, height: 46, borderRadius: 14, flexShrink: 0, background: card.accent, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 22 }}>
                {card.icon}
              </div>
              <div style={{ minWidth: 0 }}>
                <p style={{ fontSize: 10, fontWeight: 700, color: '#6B7280', margin: '0 0 3px', textTransform: 'uppercase', letterSpacing: '0.08em' }}>{card.label}</p>
                <p style={{ fontSize: 24, fontWeight: 900, color: '#1F2430', margin: 0, lineHeight: 1, fontFamily: 'var(--font-jakarta)' }}>{card.value}</p>
                <p style={{ fontSize: 10.5, color: card.dot, margin: '4px 0 0', display: 'flex', alignItems: 'center', gap: 4, fontWeight: 700 }}>
                  <span style={{ width: 6, height: 6, borderRadius: '50%', background: card.dot, display: 'inline-block', flexShrink: 0 }} />
                  {card.sub}
                </p>
              </div>
            </div>
          ))}
        </div>

        {tickets.length === 0 ? (
          <div style={{ background: '#FFFFFF', borderRadius: 20, border: '1px solid rgba(10,16,13,0.06)', boxShadow: '0 2px 14px rgba(0,0,0,0.05)', padding: '60px 24px', textAlign: 'center' }}>
            <div style={{ width: 72, height: 72, borderRadius: 20, margin: '0 auto 14px', display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'rgba(222,26,26,0.07)' }}>
              <Inbox size={34} color="#DE1A1A" />
            </div>
            <h2 style={{ fontSize: 18, fontWeight: 800, color: '#1F2430', margin: 0 }}>Inbox zero</h2>
            <p style={{ fontSize: 13, color: '#8A8F99', margin: '6px 0 0' }}>No support requests yet. New ones land here.</p>
          </div>
        ) : (
          <div style={{ display: 'flex', gap: 16, alignItems: 'stretch', height: 'calc(100vh - 370px)', minHeight: 420 }}>

            {/* LEFT: queue */}
            <aside className={showThreadMobile ? 'hidden lg:flex' : 'flex'}
              style={{ width: '100%', maxWidth: 360, flexDirection: 'column', background: '#FFFFFF', borderRadius: 20, border: '1px solid rgba(10,16,13,0.06)', boxShadow: '0 2px 14px rgba(0,0,0,0.05)', overflow: 'hidden' }}>
              <div style={{ padding: 14, borderBottom: '1px solid #F1F2F5' }}>
                <div style={{ position: 'relative' }}>
                  <Search size={14} style={{ position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)', color: '#A6AAB3' }} />
                  <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search tickets or people…"
                    style={{ width: '100%', padding: '10px 12px 10px 34px', borderRadius: 11, fontSize: 13, background: '#F6F7F9', border: '1px solid #EDEFF3', color: '#1F2430', outline: 'none', boxSizing: 'border-box' }} />
                </div>
                {/* New / Resolved / Closed segmented filter */}
                <div style={{ display: 'flex', gap: 4, marginTop: 12, background: '#F1F2F5', borderRadius: 12, padding: 4 }}>
                  {SEGMENTS.map(s => {
                    const on = filter === s.key
                    return (
                      <button key={s.key} onClick={() => { setFilter(s.key); setSelectedId(null) }}
                        style={{ flex: 1, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 6, padding: '8px 4px', borderRadius: 9, fontSize: 12.5, fontWeight: 700, border: 'none', cursor: 'pointer',
                          background: on ? '#FFFFFF' : 'transparent',
                          color: on ? '#DE1A1A' : '#8A8F99',
                          boxShadow: on ? '0 1px 4px rgba(0,0,0,0.08)' : 'none', transition: 'all .15s' }}>
                        {s.label}
                        <span style={{ fontSize: 10.5, fontWeight: 800, minWidth: 17, padding: '1px 6px', borderRadius: 99, background: on ? 'rgba(222,26,26,0.1)' : 'rgba(130,133,140,0.16)', color: on ? '#DE1A1A' : '#8A8F99' }}>{segCounts[s.key]}</span>
                      </button>
                    )
                  })}
                </div>
              </div>
              <div style={{ flex: 1, overflowY: 'auto', padding: 8 }}>
                {filtered.map((t, i) => {
                  const tok = statusOf(t.status); const cat = categoryOf(t.category); const pr = priorityOf(t.priority)
                  const isActive = t.id === active?.id
                  const last = (t.support_responses ?? [])[t.support_responses.length - 1]
                  const preview = last ? bodyParts(last.message).text || '📎 Attachment' : bodyParts(t.description).text
                  return (
                    <button key={t.id} onClick={() => openTicket(t.id)} className="sd-row"
                      style={{ animationDelay: `${Math.min(i * 26, 220)}ms`, width: '100%', textAlign: 'left', display: 'flex', gap: 11, padding: 11, borderRadius: 13, cursor: 'pointer', marginBottom: 6,
                        background: isActive ? 'linear-gradient(135deg, #DE1A1A 0%, #8B1212 55%, #1A0808 100%)' : '#F9FAFB',
                        border: isActive ? 'none' : '1px solid #EDEEF1',
                        boxShadow: isActive ? '0 4px 16px rgba(139,18,18,0.35)' : '0 1px 3px rgba(0,0,0,0.03)' }}>
                      <div style={{ width: 38, height: 38, borderRadius: 11, flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 18, background: isActive ? 'rgba(255,255,255,0.15)' : '#FFFFFF', position: 'relative' }}>
                        {cat.emoji}
                        <span style={{ position: 'absolute', bottom: -1, right: -1, width: 11, height: 11, borderRadius: '50%', background: tok.ring, border: '2px solid #fff' }} />
                      </div>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                          <span style={{ fontSize: 13, fontWeight: 700, color: isActive ? '#FFFFFF' : '#111827', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', flex: 1 }}>{t.title}</span>
                          <span style={{ fontSize: 10, color: isActive ? 'rgba(255,255,255,0.6)' : '#6B7280', flexShrink: 0 }}>{timeAgo(t.updated_at)}</span>
                        </div>
                        <p style={{ margin: '2px 0 0', fontSize: 11.5, color: isActive ? 'rgba(255,255,255,0.75)' : '#4B5563', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                          {requesterName(t)} · {preview}
                        </p>
                        <div style={{ display: 'flex', gap: 5, marginTop: 5 }}>
                          <span style={{ fontSize: 9.5, fontWeight: 700, padding: '2px 7px', borderRadius: 99, background: tok.bg, color: tok.color }}>{tok.label}</span>
                          <span style={{ fontSize: 9.5, fontWeight: 700, padding: '2px 7px', borderRadius: 99, background: pr.bg, color: pr.color }}>{pr.label}</span>
                        </div>
                      </div>
                    </button>
                  )
                })}
                {filtered.length === 0 && (
                  <p style={{ textAlign: 'center', fontSize: 12.5, color: '#A6AAB3', padding: '28px 0' }}>No tickets in this view.</p>
                )}
              </div>
            </aside>

            {/* RIGHT: thread */}
            <section className={showThreadMobile ? 'flex' : 'hidden lg:flex'}
              style={{ flex: 1, minWidth: 0, flexDirection: 'column', background: '#FFFFFF', borderRadius: 20, border: '1px solid rgba(10,16,13,0.06)', boxShadow: '0 2px 14px rgba(0,0,0,0.05)', overflow: 'hidden' }}>
              {active ? (() => {
                const tok = statusOf(active.status)
                const pr = priorityOf(active.priority)
                const cat = categoryOf(active.category)
                const canAct = active.status !== 'closed'
                return (
                  <>
                    {/* header */}
                    <div style={{ padding: '14px 18px', borderBottom: '1px solid #F1F2F5' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                        <button onClick={() => setShowThreadMobile(false)} className="lg:hidden"
                          style={{ width: 32, height: 32, borderRadius: 9, border: '1px solid #EDEFF3', background: '#F6F7F9', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', flexShrink: 0 }}>
                          <ChevronLeft size={16} color="#6B7280" />
                        </button>
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                            <span style={{ fontSize: 15, fontWeight: 800, color: '#1F2430' }}>{active.title}</span>
                            <span style={{ fontSize: 9.5, fontWeight: 700, padding: '2px 8px', borderRadius: 99, background: pr.bg, color: pr.color }}>{pr.label}</span>
                          </div>
                          <span style={{ fontSize: 11.5, color: '#9CA3AF' }}>
                            {ticketNum(indexMap[active.id] ?? 0)} · {cat.emoji} {cat.label} · from {requesterName(active)}
                          </span>
                        </div>
                      </div>
                      <div style={{ marginTop: 14 }}><StatusRibbon status={active.status} /></div>
                      {/* actions */}
                      <div style={{ display: 'flex', gap: 7, marginTop: 14, flexWrap: 'wrap' }}>
                        <button onClick={() => setStatus(active.id, 'in_progress')} disabled={pending || !canAct || active.status === 'in_progress'}
                          style={actBtn('#D97706', 'rgba(245,158,11,0.12)', active.status === 'in_progress' || !canAct)}>
                          <Clock size={12} /> In progress
                        </button>
                        <button onClick={() => setStatus(active.id, 'resolved')} disabled={pending || !canAct || active.status === 'resolved'}
                          style={actBtn('#15803D', 'rgba(34,197,94,0.12)', active.status === 'resolved' || !canAct)}>
                          <CheckCircle2 size={12} /> Resolve
                        </button>
                        <button onClick={() => setCloseConfirm(active.id)} disabled={pending || active.status === 'closed'}
                          style={actBtn('#6B7280', 'rgba(130,133,140,0.12)', active.status === 'closed')}>
                          <XCircle size={12} /> Close
                        </button>
                      </div>
                    </div>

                    {/* messages */}
                    <div key={active.id} className="sd-thread" style={{ flex: 1, overflowY: 'auto', padding: 18, display: 'flex', flexDirection: 'column', gap: 13, background: 'linear-gradient(180deg,#FAFBFC,#F4F5F8)' }}>
                      <Bubble side="left" body={active.description} who={requesterName(active)}
                        time={new Date(active.created_at).toLocaleString('en-IN', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })} />
                      {messages.map(r => {
                        const fromMember = r.responder_id === active.user_id
                        return (
                          <Bubble key={r.id} side={fromMember ? 'left' : 'right'} body={r.message}
                            who={fromMember ? r.responder_name : `${r.responder_name} · Support`}
                            time={new Date(r.created_at).toLocaleString('en-IN', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })} />
                        )
                      })}
                      {(active.status === 'resolved' || active.status === 'closed') && (
                        <div style={{ display: 'flex', justifyContent: 'center', padding: '6px 0' }}>
                          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 11.5, fontWeight: 700, padding: '7px 16px', borderRadius: 99, background: tok.bg, color: tok.color }}>
                            {active.status === 'resolved' ? <CheckCircle2 size={13} /> : <XCircle size={13} />}
                            {active.status === 'resolved' ? 'Marked resolved' : 'Ticket closed'}
                          </span>
                        </div>
                      )}
                      <div ref={threadEndRef} />
                    </div>

                    {/* composer */}
                    {active.status !== 'closed' ? (
                      <div style={{ padding: '12px 14px', borderTop: '1px solid #F1F2F5', display: 'flex', alignItems: 'flex-end', gap: 8 }}>
                        <input ref={replyFileRef} type="file" accept="image/*" style={{ display: 'none' }} onChange={uploadReplyImage} />
                        <button onClick={() => replyFileRef.current?.click()} disabled={uploading || pending} title="Attach image"
                          style={{ width: 40, height: 40, borderRadius: 11, border: '1px solid #EDEFF3', background: '#F6F7F9', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', flexShrink: 0 }}>
                          {uploading ? <Loader2 size={15} className="animate-spin" color="#9CA3AF" /> : <Paperclip size={15} color="#9CA3AF" />}
                        </button>
                        <textarea value={reply} onChange={e => setReply(e.target.value)} rows={1} placeholder="Reply to the member…"
                          onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendReply() } }}
                          style={{ flex: 1, resize: 'none', maxHeight: 120, padding: '11px 14px', borderRadius: 13, fontSize: 13.5, background: '#F6F7F9', border: '1px solid #EDEFF3', color: '#1F2430', outline: 'none', fontFamily: 'inherit', lineHeight: 1.4 }} />
                        <button onClick={sendReply} disabled={pending || uploading || !reply.trim()}
                          style={{ height: 40, padding: '0 16px', borderRadius: 13, background: 'linear-gradient(135deg,#DE1A1A,#9B0F0F)', color: '#fff', border: 'none', cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 13.5, fontWeight: 700, flexShrink: 0, opacity: (!reply.trim() || pending || uploading) ? 0.5 : 1, boxShadow: '0 4px 12px rgba(222,26,26,0.28)' }}>
                          {pending ? <Loader2 size={14} className="animate-spin" /> : <Send size={14} />}
                          <span className="hidden sm:inline">Send</span>
                        </button>
                      </div>
                    ) : (
                      <div style={{ padding: 14, borderTop: '1px solid #F1F2F5', textAlign: 'center', fontSize: 12.5, color: '#9CA3AF' }}>
                        This ticket is closed.
                      </div>
                    )}
                  </>
                )
              })() : (
                /* ── Empty state — boy character ── */
                <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '28px 36px', textAlign: 'center', background: 'linear-gradient(180deg,#FAFBFC 0%,#F3F4F8 100%)' }}>
                  {/* Character with soft glow ring */}
                  <div style={{ position: 'relative', width: 220, height: 200, marginBottom: 20, flexShrink: 0 }}>
                    <div style={{ position: 'absolute', inset: 0, borderRadius: '50%', background: 'radial-gradient(circle, rgba(222,26,26,0.07) 0%, transparent 70%)', top: '20%' }} />
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src="/brand/support/hero-boy.png" alt=""
                      style={{ width: '100%', height: '100%', objectFit: 'contain', filter: 'drop-shadow(0 8px 20px rgba(0,0,0,0.12))' }} />
                  </div>

                  <h3 style={{ fontSize: 18, fontWeight: 900, color: '#1F2430', margin: '0 0 8px', fontFamily: 'var(--font-jakarta)', letterSpacing: '-0.01em' }}>Select a ticket</h3>
                  <p style={{ fontSize: 13, color: '#9CA3AF', margin: '0 0 24px', maxWidth: 220, lineHeight: 1.65 }}>
                    Choose a conversation from the left panel. Replies will appear here.
                  </p>

                  {/* Flow steps */}
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                    {([
                      { bg: '#FEF2F2', color: '#EF4444', emoji: '👤', label: 'Customer' },
                      { bg: '#F3E8FF', color: '#8B5CF6', emoji: '🎧', label: 'Agent' },
                      { bg: '#ECFDF5', color: '#10B981', emoji: '✅', label: 'Resolved' },
                    ] as const).map((step, i) => (
                      <div key={step.label} style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                        {i > 0 && (
                          <svg width="18" height="10" viewBox="0 0 18 10" fill="none">
                            <path d="M1 5h14M11 1l4 4-4 4" stroke="#D1D5DB" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
                          </svg>
                        )}
                        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6 }}>
                          <div style={{ width: 40, height: 40, borderRadius: 12, background: step.bg, border: `1.5px solid ${step.color}22`, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 18, boxShadow: `0 2px 8px ${step.color}18` }}>{step.emoji}</div>
                          <span style={{ fontSize: 9, color: '#6B7280', fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.08em' }}>{step.label}</span>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </section>
          </div>
        )}
      </div>

      {showNew && <NewTicketModal onClose={() => setShowNew(false)} onCreated={id => { setShowNew(false); setSelectedId(id); setShowThreadMobile(true); router.refresh() }} />}

      {showAssign && <AssignHandlerModal onClose={() => setShowAssign(false)} onChanged={() => router.refresh()} />}

      {closeConfirm && (
        <>
          <div onClick={() => setCloseConfirm(null)} style={{ position: 'fixed', inset: 0, zIndex: 60, background: 'rgba(13,8,8,0.5)' }} />
          <div style={{ position: 'fixed', zIndex: 70, inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}>
            <div style={{ width: '100%', maxWidth: 360, background: '#fff', borderRadius: 20, padding: 22, boxShadow: '0 12px 40px rgba(0,0,0,0.28)' }}>
              <div style={{ width: 46, height: 46, borderRadius: 13, background: 'rgba(222,26,26,0.08)', display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: 14 }}>
                <XCircle size={22} color="#DE1A1A" />
              </div>
              <h3 style={{ fontSize: 16.5, fontWeight: 800, color: '#1F2430', margin: '0 0 6px' }}>Close this ticket?</h3>
              <p style={{ fontSize: 13, color: '#6B7280', margin: '0 0 18px', lineHeight: 1.5 }}>The member won&apos;t be able to send more messages on it.</p>
              <div style={{ display: 'flex', gap: 10 }}>
                <button onClick={() => setCloseConfirm(null)} style={{ flex: 1, padding: 11, borderRadius: 12, fontSize: 13.5, fontWeight: 700, color: '#6B7280', background: '#F6F7F9', border: '1px solid #EDEFF3', cursor: 'pointer' }}>Cancel</button>
                <button onClick={() => handleClose(closeConfirm)} disabled={pending}
                  style={{ flex: 1, padding: 11, borderRadius: 12, fontSize: 13.5, fontWeight: 800, color: '#fff', background: '#DE1A1A', border: 'none', cursor: 'pointer', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 6, opacity: pending ? 0.7 : 1 }}>
                  {pending && <Loader2 size={14} className="animate-spin" />} Close
                </button>
              </div>
            </div>
          </div>
        </>
      )}
    </div>
  )
}

function actBtn(color: string, bg: string, disabled: boolean): React.CSSProperties {
  return {
    display: 'inline-flex', alignItems: 'center', gap: 5, padding: '7px 12px', borderRadius: 10,
    fontSize: 12, fontWeight: 700, color, background: bg, border: 'none',
    cursor: disabled ? 'default' : 'pointer', opacity: disabled ? 0.45 : 1,
  }
}

// ── New ticket modal (handler-created) ────────────────────────────────────────
function NewTicketModal({ onClose, onCreated }: { onClose: () => void; onCreated: (id: string) => void }) {
  const [category, setCategory]       = useState('')
  const [priority, setPriority]       = useState('medium')
  const [title, setTitle]             = useState('')
  const [description, setDescription] = useState('')
  const [error, setError]             = useState('')
  const [pending, start]              = useTransition()

  function submit() {
    if (!title.trim())       { setError('Title is required'); return }
    if (!category)           { setError('Pick a category'); return }
    if (!description.trim()) { setError('Description is required'); return }
    setError('')
    start(async () => {
      const res = await createTicket({ title: title.trim(), category, description: description.trim(), priority })
      if (res.success && res.ticketId) onCreated(res.ticketId)
      else setError(res.error ?? 'Failed to create ticket')
    })
  }

  return (
    <>
      <div onClick={onClose} style={{ position: 'fixed', inset: 0, zIndex: 60, background: 'rgba(13,8,8,0.5)', backdropFilter: 'blur(3px)' }} />
      <div style={{ position: 'fixed', zIndex: 70, inset: 0, display: 'flex', alignItems: 'flex-end', justifyContent: 'center' }} className="sm:!items-center">
        <div style={{ width: '100%', maxWidth: 460, maxHeight: '92vh', overflowY: 'auto', background: '#FFFFFF', borderRadius: '22px 22px 0 0', boxShadow: '0 -8px 40px rgba(0,0,0,0.25)' }} className="sm:!rounded-[22px]">
          <div style={{ padding: '18px 20px 14px', borderBottom: '1px solid #F1F2F5', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <h2 style={{ fontSize: 17, fontWeight: 800, color: '#1F2430', margin: 0 }}>New ticket</h2>
            <button onClick={onClose} style={{ width: 32, height: 32, borderRadius: '50%', border: '1px solid #EDEFF3', background: '#F6F7F9', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer' }}>
              <X size={15} color="#6B7280" />
            </button>
          </div>
          <div style={{ padding: 20, display: 'flex', flexDirection: 'column', gap: 16 }}>
            <input value={title} onChange={e => setTitle(e.target.value)} placeholder="Short title"
              style={{ width: '100%', padding: '11px 14px', borderRadius: 12, fontSize: 13.5, background: '#F6F7F9', border: '1px solid #EDEFF3', color: '#1F2430', outline: 'none', fontFamily: 'inherit', boxSizing: 'border-box' }} />
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 7 }}>
              {CATEGORIES.map(c => {
                const on = category === c.key
                return (
                  <button key={c.key} onClick={() => setCategory(c.key)}
                    style={{ display: 'inline-flex', alignItems: 'center', gap: 5, padding: '7px 12px', borderRadius: 99, fontSize: 12, fontWeight: 600, cursor: 'pointer',
                      border: on ? '1.5px solid #DE1A1A' : '1.5px solid #EDEFF3', background: on ? 'rgba(222,26,26,0.06)' : '#FFFFFF', color: on ? '#DE1A1A' : '#6B7280' }}>
                    <span style={{ fontSize: 14 }}>{c.emoji}</span> {c.label}
                  </button>
                )
              })}
            </div>
            <div style={{ display: 'flex', gap: 7 }}>
              {PRIORITY_OPTIONS.map(p => {
                const on = priority === p; const tok = priorityOf(p)
                return (
                  <button key={p} onClick={() => setPriority(p)}
                    style={{ flex: 1, padding: '8px 0', borderRadius: 11, fontSize: 12, fontWeight: 700, textTransform: 'capitalize', cursor: 'pointer',
                      border: on ? `1.5px solid ${tok.color}` : '1.5px solid #EDEFF3', background: on ? tok.bg : '#FFFFFF', color: on ? tok.color : '#9CA3AF' }}>
                    {p}
                  </button>
                )
              })}
            </div>
            <textarea rows={4} value={description} onChange={e => setDescription(e.target.value)} placeholder="Describe the issue…"
              style={{ width: '100%', resize: 'none', padding: '12px 14px', borderRadius: 13, fontSize: 13.5, background: '#F6F7F9', border: '1px solid #EDEFF3', color: '#1F2430', outline: 'none', fontFamily: 'inherit', lineHeight: 1.5, boxSizing: 'border-box' }} />
            {error && (
              <div style={{ display: 'flex', alignItems: 'center', gap: 7, fontSize: 12.5, color: '#DE1A1A', background: 'rgba(222,26,26,0.06)', border: '1px solid rgba(222,26,26,0.14)', borderRadius: 11, padding: '9px 12px' }}>
                <AlertCircle size={14} /> {error}
              </div>
            )}
          </div>
          <div style={{ padding: '0 20px 22px', display: 'flex', gap: 10 }}>
            <button onClick={onClose} style={{ flex: 1, padding: 12, borderRadius: 13, fontSize: 13.5, fontWeight: 700, color: '#6B7280', background: '#F6F7F9', border: '1px solid #EDEFF3', cursor: 'pointer' }}>Cancel</button>
            <button onClick={submit} disabled={pending}
              style={{ flex: 1.4, padding: 12, borderRadius: 13, fontSize: 13.5, fontWeight: 800, color: '#fff', background: 'linear-gradient(135deg,#DE1A1A,#9B0F0F)', border: 'none', cursor: 'pointer', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 7, opacity: pending ? 0.7 : 1 }}>
              {pending ? <Loader2 size={15} className="animate-spin" /> : <Send size={15} />} Create
            </button>
          </div>
        </div>
      </div>
    </>
  )
}

// ── Assign support handler modal ──────────────────────────────────────────────
function AssignHandlerModal({ onClose, onChanged }: { onClose: () => void; onChanged: () => void }) {
  const [people, setPeople] = useState<{ id: string; name: string; employee_id: string | null; is_support_handler: boolean }[]>([])
  const [loading, setLoading] = useState(true)
  const [savingId, setSavingId] = useState<string | null>(null)
  const [query, setQuery] = useState('')

  useEffect(() => {
    getSupportHandlerCandidates().then(rows => { setPeople(rows); setLoading(false) })
  }, [])

  async function toggle(id: string, next: boolean) {
    setSavingId(id)
    setPeople(prev => prev.map(p => p.id === id ? { ...p, is_support_handler: next } : p))
    const res = await setSupportHandler(id, next)
    if (!res.success) setPeople(prev => prev.map(p => p.id === id ? { ...p, is_support_handler: !next } : p))
    else onChanged()
    setSavingId(null)
  }

  const filtered = people.filter(p =>
    !query.trim() || p.name.toLowerCase().includes(query.toLowerCase()) || (p.employee_id ?? '').toLowerCase().includes(query.toLowerCase())
  )
  const activeCount = people.filter(p => p.is_support_handler).length

  return (
    <>
      <div onClick={onClose} style={{ position: 'fixed', inset: 0, zIndex: 60, background: 'rgba(13,8,8,0.5)', backdropFilter: 'blur(3px)' }} />
      <div style={{ position: 'fixed', zIndex: 70, inset: 0, display: 'flex', alignItems: 'flex-end', justifyContent: 'center' }} className="sm:!items-center">
        <div style={{ width: '100%', maxWidth: 460, maxHeight: '92vh', display: 'flex', flexDirection: 'column', background: '#FFFFFF', borderRadius: '22px 22px 0 0', boxShadow: '0 -8px 40px rgba(0,0,0,0.25)' }} className="sm:!rounded-[22px]">
          <div style={{ padding: '18px 20px 14px', borderBottom: '1px solid #F1F2F5', display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between' }}>
            <div>
              <h2 style={{ fontSize: 17, fontWeight: 800, color: '#1F2430', margin: 0, display: 'inline-flex', alignItems: 'center', gap: 7 }}>
                <LifeBuoy size={16} color="#DE1A1A" /> Support handlers
              </h2>
              <p style={{ fontSize: 12, color: '#9CA3AF', margin: '3px 0 0' }}>
                Anyone you turn on sees this Support Inbox and gets ticket alerts. {activeCount} active.
              </p>
            </div>
            <button onClick={onClose} style={{ width: 32, height: 32, borderRadius: '50%', border: '1px solid #EDEFF3', background: '#F6F7F9', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', flexShrink: 0 }}>
              <X size={15} color="#6B7280" />
            </button>
          </div>

          <div style={{ padding: '12px 16px 0' }}>
            <div style={{ position: 'relative' }}>
              <Search size={14} style={{ position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)', color: '#A6AAB3' }} />
              <input value={query} onChange={e => setQuery(e.target.value)} placeholder="Search members…"
                style={{ width: '100%', padding: '10px 12px 10px 34px', borderRadius: 11, fontSize: 13, background: '#F6F7F9', border: '1px solid #EDEFF3', color: '#1F2430', outline: 'none', boxSizing: 'border-box' }} />
            </div>
          </div>

          <div style={{ flex: 1, overflowY: 'auto', padding: '10px 12px 16px', minHeight: 120 }}>
            {loading ? (
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, padding: '32px 0', color: '#9CA3AF', fontSize: 13 }}>
                <Loader2 size={15} className="animate-spin" /> Loading members…
              </div>
            ) : filtered.length === 0 ? (
              <p style={{ textAlign: 'center', fontSize: 12.5, color: '#A6AAB3', padding: '28px 0' }}>No members found.</p>
            ) : filtered.map(p => {
              const initials = p.name.split(' ').map(s => s[0]).join('').slice(0, 2).toUpperCase()
              const on = p.is_support_handler
              return (
                <div key={p.id} style={{ display: 'flex', alignItems: 'center', gap: 11, padding: '9px 8px', borderRadius: 12 }}>
                  <div style={{ width: 36, height: 36, borderRadius: '50%', flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 12, fontWeight: 800, color: '#fff', background: on ? 'linear-gradient(135deg,#DE1A1A,#9B0F0F)' : '#C4C8D0' }}>
                    {initials}
                  </div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <p style={{ margin: 0, fontSize: 13, fontWeight: 700, color: '#1F2430', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{p.name}</p>
                    <p style={{ margin: '1px 0 0', fontSize: 11, color: '#9CA3AF' }}>{p.employee_id ?? '—'}{on ? ' · Support handler' : ''}</p>
                  </div>
                  <button onClick={() => toggle(p.id, !on)} disabled={savingId === p.id} aria-pressed={on}
                    style={{ width: 46, height: 26, borderRadius: 99, border: 'none', cursor: 'pointer', flexShrink: 0, position: 'relative', transition: 'background .15s',
                      background: on ? '#DE1A1A' : '#D7DAE0', opacity: savingId === p.id ? 0.6 : 1 }}>
                    <span style={{ position: 'absolute', top: 3, left: on ? 23 : 3, width: 20, height: 20, borderRadius: '50%', background: '#fff', transition: 'left .15s', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                      {savingId === p.id ? <Loader2 size={11} className="animate-spin" color="#9CA3AF" /> : on ? <Check size={12} color="#DE1A1A" /> : null}
                    </span>
                  </button>
                </div>
              )
            })}
          </div>

          <div style={{ padding: '12px 20px 20px', borderTop: '1px solid #F1F2F5' }}>
            <button onClick={onClose} style={{ width: '100%', padding: 12, borderRadius: 13, fontSize: 13.5, fontWeight: 800, color: '#fff', background: 'linear-gradient(135deg,#DE1A1A,#9B0F0F)', border: 'none', cursor: 'pointer' }}>Done</button>
          </div>
        </div>
      </div>
    </>
  )
}
