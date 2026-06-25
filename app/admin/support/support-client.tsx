'use client'

import { useState, useRef, useMemo, useEffect, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { createBrowserClient } from '@/lib/supabase/client'
import { addResponse, updateTicketStatus, createTicket, closeTicket } from '@/lib/actions/support'
import {
  Plus, Search, Send, Loader2, X, Paperclip, ChevronLeft,
  Inbox, CheckCircle2, XCircle, AlertCircle, Clock,
} from 'lucide-react'
import {
  statusOf, categoryOf, CATEGORIES, priorityOf, PRIORITY_OPTIONS,
  HERO_GRADIENT, timeAgo, ticketNum,
} from '@/lib/support-tokens'
import { Bubble, StatusRibbon, bodyParts, SUPPORT_ANIM_CSS } from '@/components/support/thread-ui'

type Response = { id: string; responder_id: string; responder_name: string; message: string; created_at: string }
type Ticket = {
  id: string; user_id: string; title: string; category: string
  description: string; status: string; priority: string; assigned_to?: string
  created_at: string; updated_at: string; support_responses: Response[]
}

const FILTERS: { key: string; label: string }[] = [
  { key: 'all',         label: 'All' },
  { key: 'open',        label: 'Open' },
  { key: 'in_progress', label: 'In Progress' },
  { key: 'resolved',    label: 'Resolved' },
  { key: 'closed',      label: 'Closed' },
]

function requesterName(t: Ticket): string {
  const own = (t.support_responses ?? []).find(r => r.responder_id === t.user_id)
  return own?.responder_name ?? 'Member'
}

export default function AdminSupportClient({ tickets, currentUserId }: { tickets: Ticket[]; currentUserId: string }) {
  void currentUserId
  const router = useRouter()
  const supabase = useMemo(() => createBrowserClient(), [])

  const [filter, setFilter]         = useState('all')
  const [search, setSearch]         = useState('')
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [showThreadMobile, setShowThreadMobile] = useState(false)
  const [showNew, setShowNew]       = useState(false)
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
      .filter(t => (filter === 'all' || t.status === filter)
        && (!q || t.title.toLowerCase().includes(q) || t.category.includes(q) || requesterName(t).toLowerCase().includes(q)))
      .sort((a, b) => new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime())
  }, [tickets, filter, search])

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
    if (file.size > 5 * 1024 * 1024) { alert('Max image size is 5 MB'); return }
    setUploading(true)
    try {
      const ext = file.name.split('.').pop() ?? 'jpg'
      const path = `${active.id}/${Date.now()}.${ext}`
      const { data, error } = await supabase.storage.from('support-attachments').upload(path, file)
      if (error || !data) { alert('Upload failed'); return }
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
      <style>{SUPPORT_ANIM_CSS}</style>

      {/* ── Hero ─────────────────────────────────────────────────── */}
      <div style={{ background: HERO_GRADIENT, padding: '22px 20px 18px', position: 'relative', overflow: 'hidden' }}>
        <div style={{ position: 'absolute', top: '50%', right: -30, transform: 'translateY(-50%)', width: 240, height: 240, borderRadius: '50%', background: 'radial-gradient(circle, rgba(255,90,90,0.22) 0%, transparent 68%)', pointerEvents: 'none' }} />
        <div style={{ maxWidth: 1240, margin: '0 auto', position: 'relative' }}>
          <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 16 }}>
            <div>
              <h1 style={{ fontSize: 26, fontWeight: 900, color: '#FFFFFF', margin: 0, letterSpacing: '-0.01em', fontFamily: 'var(--font-jakarta)' }}>Support Inbox</h1>
              <p style={{ fontSize: 12.5, color: 'rgba(255,255,255,0.74)', margin: '4px 0 0' }}>
                {stats.open + stats.in_progress} need attention · {tickets.length} total
              </p>
            </div>
            <button onClick={() => setShowNew(true)}
              style={{ display: 'inline-flex', alignItems: 'center', gap: 7, padding: '11px 18px', borderRadius: 13, fontSize: 13.5, fontWeight: 800, color: '#B91212', background: '#FFFFFF', border: 'none', cursor: 'pointer', boxShadow: '0 6px 18px rgba(0,0,0,0.22)', whiteSpace: 'nowrap', flexShrink: 0 }}>
              <Plus size={16} /> New ticket
            </button>
          </div>
          {/* status filter pills with real counts */}
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 16 }}>
            {FILTERS.map(f => {
              const on = filter === f.key
              const count = f.key === 'all' ? tickets.length : (stats as Record<string, number>)[f.key] ?? 0
              return (
                <button key={f.key} onClick={() => { setFilter(f.key); setSelectedId(null) }}
                  style={{ display: 'inline-flex', alignItems: 'center', gap: 7, padding: '7px 14px', borderRadius: 99, fontSize: 12.5, fontWeight: 700, border: 'none', cursor: 'pointer',
                    background: on ? '#FFFFFF' : 'rgba(255,255,255,0.14)',
                    color: on ? '#B91212' : 'rgba(255,255,255,0.9)' }}>
                  {f.label}
                  <span style={{ fontSize: 11, fontWeight: 800, padding: '1px 7px', borderRadius: 99, background: on ? 'rgba(222,26,26,0.1)' : 'rgba(255,255,255,0.18)', color: on ? '#B91212' : '#fff' }}>{count}</span>
                </button>
              )
            })}
          </div>
        </div>
      </div>

      {/* ── Two-pane shell ───────────────────────────────────────── */}
      <div style={{ maxWidth: 1240, margin: '0 auto', padding: '18px 16px 28px' }}>
        {tickets.length === 0 ? (
          <div style={{ background: '#FFFFFF', borderRadius: 20, border: '1px solid rgba(10,16,13,0.06)', boxShadow: '0 2px 14px rgba(0,0,0,0.05)', padding: '60px 24px', textAlign: 'center' }}>
            <div style={{ width: 72, height: 72, borderRadius: 20, margin: '0 auto 14px', display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'rgba(222,26,26,0.07)' }}>
              <Inbox size={34} color="#DE1A1A" />
            </div>
            <h2 style={{ fontSize: 18, fontWeight: 800, color: '#1F2430', margin: 0 }}>Inbox zero</h2>
            <p style={{ fontSize: 13, color: '#8A8F99', margin: '6px 0 0' }}>No support requests yet. New ones land here.</p>
          </div>
        ) : (
          <div style={{ display: 'flex', gap: 16, alignItems: 'stretch', height: 'calc(100vh - 196px)', minHeight: 480 }}>

            {/* LEFT: queue */}
            <aside className={showThreadMobile ? 'hidden lg:flex' : 'flex'}
              style={{ width: '100%', maxWidth: 360, flexDirection: 'column', background: '#FFFFFF', borderRadius: 20, border: '1px solid rgba(10,16,13,0.06)', boxShadow: '0 2px 14px rgba(0,0,0,0.05)', overflow: 'hidden' }}>
              <div style={{ padding: 14, borderBottom: '1px solid #F1F2F5' }}>
                <div style={{ position: 'relative' }}>
                  <Search size={14} style={{ position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)', color: '#A6AAB3' }} />
                  <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search tickets or people…"
                    style={{ width: '100%', padding: '10px 12px 10px 34px', borderRadius: 11, fontSize: 13, background: '#F6F7F9', border: '1px solid #EDEFF3', color: '#1F2430', outline: 'none', boxSizing: 'border-box' }} />
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
                      style={{ animationDelay: `${Math.min(i * 26, 220)}ms`, width: '100%', textAlign: 'left', display: 'flex', gap: 11, padding: 11, borderRadius: 13, border: 'none', cursor: 'pointer', marginBottom: 2,
                        background: isActive ? 'rgba(222,26,26,0.06)' : 'transparent',
                        boxShadow: isActive ? 'inset 0 0 0 1.5px rgba(222,26,26,0.28)' : 'none' }}>
                      <div style={{ width: 38, height: 38, borderRadius: 11, flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 18, background: '#F4F5F8', position: 'relative' }}>
                        {cat.emoji}
                        <span style={{ position: 'absolute', bottom: -1, right: -1, width: 11, height: 11, borderRadius: '50%', background: tok.ring, border: '2px solid #fff' }} />
                      </div>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                          <span style={{ fontSize: 13, fontWeight: 700, color: '#1F2430', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', flex: 1 }}>{t.title}</span>
                          <span style={{ fontSize: 10, color: '#B6BAC2', flexShrink: 0 }}>{timeAgo(t.updated_at)}</span>
                        </div>
                        <p style={{ margin: '2px 0 0', fontSize: 11.5, color: '#8A8F99', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
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
                <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#A6AAB3', fontSize: 13 }}>
                  Select a ticket to open the conversation.
                </div>
              )}
            </section>
          </div>
        )}
      </div>

      {showNew && <NewTicketModal onClose={() => setShowNew(false)} onCreated={id => { setShowNew(false); setSelectedId(id); setShowThreadMobile(true); router.refresh() }} />}

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
