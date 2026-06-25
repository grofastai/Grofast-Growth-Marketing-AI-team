'use client'

import { useState, useRef, useMemo, useEffect, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { createBrowserClient } from '@/lib/supabase/client'
import { createTicket, addResponse, closeTicket } from '@/lib/actions/support'
import {
  Plus, Search, Send, Loader2, X, Paperclip, ChevronLeft,
  LifeBuoy, CheckCircle2, XCircle, AlertCircle,
} from 'lucide-react'
import {
  statusOf, categoryOf, CATEGORIES,
  PRIORITY_OPTIONS, priorityOf, HERO_GRADIENT, timeAgo,
} from '@/lib/support-tokens'
import { Bubble, StatusRibbon, bodyParts, SUPPORT_ANIM_CSS } from '@/components/support/thread-ui'

type Response = { id: string; responder_id?: string; responder_name: string; message: string; created_at: string }
type Ticket = {
  id: string
  user_id?: string
  title: string
  category: string
  description: string
  status: string
  priority: string
  created_at: string
  updated_at?: string
  support_responses: Response[]
}

export default function MemberSupportChat({ tickets, currentUserId = '' }: { tickets: Ticket[]; currentUserId?: string }) {
  const router = useRouter()
  const supabase = useMemo(() => createBrowserClient(), [])

  const sorted = useMemo(
    () => [...tickets].sort((a, b) => new Date(b.updated_at ?? b.created_at).getTime() - new Date(a.updated_at ?? a.created_at).getTime()),
    [tickets]
  )

  const [search, setSearch]         = useState('')
  const [selectedId, setSelectedId] = useState<string | null>(sorted[0]?.id ?? null)
  const [showThreadMobile, setShowThreadMobile] = useState(false)
  const [showCompose, setShowCompose] = useState(false)
  const [closeConfirm, setCloseConfirm] = useState<string | null>(null)

  const [reply, setReply]           = useState('')
  const [uploading, setUploading]   = useState(false)
  const [pending, startTransition]  = useTransition()
  const replyFileRef = useRef<HTMLInputElement>(null)
  const threadEndRef = useRef<HTMLDivElement>(null)

  // live responses for the open ticket
  const [live, setLive] = useState<Record<string, Response[]>>({})

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase()
    if (!q) return sorted
    return sorted.filter(t => t.title.toLowerCase().includes(q) || t.category.toLowerCase().includes(q))
  }, [sorted, search])

  const active = useMemo(
    () => sorted.find(t => t.id === selectedId) ?? null,
    [sorted, selectedId]
  )

  const messages = useMemo(() => {
    if (!active) return [] as Response[]
    const merged = [...(active.support_responses ?? []), ...(live[active.id] ?? [])]
    return merged.filter((r, i, arr) => arr.findIndex(x => x.id === r.id) === i)
      .sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime())
  }, [active, live])

  // realtime subscription for the selected ticket
  useEffect(() => {
    if (!active) return
    const id = active.id
    const channel = supabase
      .channel(`member-support-${id}`)
      .on('postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'support_responses', filter: `ticket_id=eq.${id}` },
        payload => setLive(p => ({ ...p, [id]: [...(p[id] ?? []), payload.new as Response] })))
      .subscribe()
    return () => { supabase.removeChannel(channel) }
  }, [active?.id, supabase])

  useEffect(() => {
    threadEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages.length, active?.id])

  function openTicket(id: string) {
    setSelectedId(id)
    setShowThreadMobile(true)
    setLive(p => ({ ...p, [id]: [] }))
  }

  function sendReply() {
    const msg = reply.trim()
    if (!msg || !active) return
    setReply('')
    startTransition(async () => {
      await addResponse({ ticket_id: active.id, message: msg })
      router.refresh()
    })
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

  function handleClose(id: string) {
    startTransition(async () => {
      await closeTicket(id)
      setCloseConfirm(null)
      router.refresh()
    })
  }

  const stOpen = sorted.filter(t => t.status === 'open' || t.status === 'in_progress').length

  return (
    <div style={{ background: '#EDEEF2', minHeight: '100vh' }}>
      <style>{SUPPORT_ANIM_CSS}</style>

      {/* ── Page wrap: hero card + two-pane shell ─────────────────── */}
      <div style={{ maxWidth: 1180, margin: '0 auto', padding: '16px' }}>

        {/* Hero — rounded card matching the Profile banner */}
        <div style={{ background: HERO_GRADIENT, borderRadius: 20, position: 'relative', overflow: 'hidden', padding: '22px 24px', boxShadow: '0 8px 32px rgba(180,0,0,0.4)', marginBottom: 16 }}>
          <div style={{ position: 'absolute', top: -40, right: -40, width: 220, height: 220, borderRadius: '50%', background: 'rgba(255,255,255,0.05)', pointerEvents: 'none' }} />
          <div style={{ position: 'absolute', bottom: -30, left: 60, width: 150, height: 150, borderRadius: '50%', background: 'rgba(255,255,255,0.04)', pointerEvents: 'none' }} />
          <div style={{ position: 'relative', zIndex: 1, display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 12 }}>
            <div>
              <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 11, fontWeight: 700, padding: '4px 12px', borderRadius: 99, background: 'rgba(255,255,255,0.15)', color: '#fff', marginBottom: 10, border: '1px solid rgba(255,255,255,0.2)', letterSpacing: '0.04em' }}>
                💬 Support
              </span>
              <h1 style={{ fontSize: 26, fontWeight: 900, margin: '0 0 4px', fontFamily: 'var(--font-jakarta)', color: '#fff' }}>How can we help?</h1>
              <p style={{ fontSize: 13, color: 'rgba(255,255,255,0.7)', margin: 0 }}>
                {sorted.length === 0 ? 'Raise a request and the team will reply right here.' : `${stOpen} active · ${sorted.length} total request${sorted.length === 1 ? '' : 's'}`}
              </p>
            </div>
            <button onClick={() => setShowCompose(true)}
              style={{ display: 'inline-flex', alignItems: 'center', gap: 7, padding: '11px 18px', borderRadius: 13, fontSize: 13.5, fontWeight: 800, color: '#B91212', background: '#FFFFFF', border: 'none', cursor: 'pointer', boxShadow: '0 6px 18px rgba(0,0,0,0.22)', whiteSpace: 'nowrap', flexShrink: 0 }}>
              <Plus size={16} /> New request
            </button>
          </div>
        </div>

        {sorted.length === 0 ? (
          <EmptyState onStart={() => setShowCompose(true)} />
        ) : (
          <div style={{ display: 'flex', gap: 16, alignItems: 'stretch', height: 'calc(100vh - 210px)', minHeight: 460 }}>

            {/* LEFT: request list */}
            <aside
              className={showThreadMobile ? 'hidden lg:flex' : 'flex'}
              style={{ width: '100%', maxWidth: 340, flexDirection: 'column', background: '#FFFFFF', borderRadius: 20, border: '1px solid rgba(10,16,13,0.06)', boxShadow: '0 2px 14px rgba(0,0,0,0.05)', overflow: 'hidden' }}>
              <div style={{ padding: 14, borderBottom: '1px solid #F1F2F5' }}>
                <div style={{ position: 'relative' }}>
                  <Search size={14} style={{ position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)', color: '#A6AAB3' }} />
                  <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search your requests…"
                    style={{ width: '100%', padding: '10px 12px 10px 34px', borderRadius: 11, fontSize: 13, background: '#F6F7F9', border: '1px solid #EDEFF3', color: '#1F2430', outline: 'none', boxSizing: 'border-box' }} />
                </div>
              </div>
              <div style={{ flex: 1, overflowY: 'auto', padding: 8 }}>
                {filtered.map((t, i) => {
                  const tok = statusOf(t.status)
                  const cat = categoryOf(t.category)
                  const isActive = t.id === selectedId
                  const last = (t.support_responses ?? [])[t.support_responses.length - 1]
                  const preview = last ? bodyParts(last.message).text || '📎 Attachment' : bodyParts(t.description).text
                  return (
                    <button key={t.id} onClick={() => openTicket(t.id)}
                      className="sd-row"
                      style={{ animationDelay: `${Math.min(i * 30, 240)}ms`, width: '100%', textAlign: 'left', display: 'flex', gap: 11, padding: '11px 11px', borderRadius: 13, border: 'none', cursor: 'pointer', marginBottom: 2,
                        background: isActive ? 'rgba(222,26,26,0.06)' : 'transparent',
                        boxShadow: isActive ? 'inset 0 0 0 1.5px rgba(222,26,26,0.28)' : 'none' }}>
                      <div style={{ width: 38, height: 38, borderRadius: 11, flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 18, background: '#F4F5F8', position: 'relative' }}>
                        {cat.emoji}
                        <span style={{ position: 'absolute', bottom: -1, right: -1, width: 11, height: 11, borderRadius: '50%', background: tok.ring, border: '2px solid #fff' }} />
                      </div>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                          <span style={{ fontSize: 13, fontWeight: 700, color: '#1F2430', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', flex: 1 }}>{t.title}</span>
                          <span style={{ fontSize: 10, color: '#B6BAC2', flexShrink: 0 }}>{timeAgo(t.updated_at ?? t.created_at)}</span>
                        </div>
                        <p style={{ margin: '2px 0 0', fontSize: 11.5, color: '#8A8F99', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{preview}</p>
                        <span style={{ display: 'inline-block', marginTop: 5, fontSize: 9.5, fontWeight: 700, padding: '2px 7px', borderRadius: 99, background: tok.bg, color: tok.color }}>{tok.label}</span>
                      </div>
                    </button>
                  )
                })}
                {filtered.length === 0 && (
                  <p style={{ textAlign: 'center', fontSize: 12.5, color: '#A6AAB3', padding: '28px 0' }}>No requests match “{search}”.</p>
                )}
              </div>
            </aside>

            {/* RIGHT: conversation thread */}
            <section
              className={showThreadMobile ? 'flex' : 'hidden lg:flex'}
              style={{ flex: 1, minWidth: 0, flexDirection: 'column', background: '#FFFFFF', borderRadius: 20, border: '1px solid rgba(10,16,13,0.06)', boxShadow: '0 2px 14px rgba(0,0,0,0.05)', overflow: 'hidden' }}>
              {active ? (
                <>
                  {/* thread header */}
                  <div style={{ padding: '14px 18px', borderBottom: '1px solid #F1F2F5' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                      <button onClick={() => setShowThreadMobile(false)}
                        className="lg:hidden"
                        style={{ width: 32, height: 32, borderRadius: 9, border: '1px solid #EDEFF3', background: '#F6F7F9', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', flexShrink: 0 }}>
                        <ChevronLeft size={16} color="#6B7280" />
                      </button>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                          <span style={{ fontSize: 15, fontWeight: 800, color: '#1F2430', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{active.title}</span>
                        </div>
                        <span style={{ fontSize: 11.5, color: '#9CA3AF' }}>{categoryOf(active.category).emoji} {categoryOf(active.category).label} · opened {timeAgo(active.created_at)}</span>
                      </div>
                      {active.status !== 'closed' && active.status !== 'resolved' && (
                        <button onClick={() => setCloseConfirm(active.id)}
                          style={{ fontSize: 11.5, fontWeight: 700, color: '#9CA3AF', background: 'none', border: 'none', cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: 4, flexShrink: 0 }}>
                          <XCircle size={13} /> Close
                        </button>
                      )}
                    </div>
                    <div style={{ marginTop: 14 }}>
                      <StatusRibbon status={active.status} />
                    </div>
                  </div>

                  {/* messages */}
                  <div key={active.id} className="sd-thread" style={{ flex: 1, overflowY: 'auto', padding: '18px', display: 'flex', flexDirection: 'column', gap: 13, background: 'linear-gradient(180deg,#FAFBFC,#F4F5F8)' }}>
                    <Bubble side="right" body={active.description} who="You"
                      time={new Date(active.created_at).toLocaleString('en-IN', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })} />
                    {messages.map(r => {
                      const mine = r.responder_id ? r.responder_id === (active.user_id ?? currentUserId) : false
                      return (
                        <Bubble key={r.id} side={mine ? 'right' : 'left'} body={r.message}
                          who={mine ? 'You' : `${r.responder_name} · Support`}
                          time={new Date(r.created_at).toLocaleString('en-IN', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })} />
                      )
                    })}
                    {(active.status === 'resolved' || active.status === 'closed') && (
                      <div style={{ display: 'flex', justifyContent: 'center', padding: '6px 0' }}>
                        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 11.5, fontWeight: 700, padding: '7px 16px', borderRadius: 99, background: statusOf(active.status).bg, color: statusOf(active.status).color }}>
                          {active.status === 'resolved' ? <CheckCircle2 size={13} /> : <XCircle size={13} />}
                          {active.status === 'resolved' ? 'Marked resolved' : 'This request is closed'}
                        </span>
                      </div>
                    )}
                    <div ref={threadEndRef} />
                  </div>

                  {/* composer */}
                  {active.status !== 'closed' && active.status !== 'resolved' ? (
                    <div style={{ padding: '12px 14px', borderTop: '1px solid #F1F2F5', display: 'flex', alignItems: 'flex-end', gap: 8 }}>
                      <input ref={replyFileRef} type="file" accept="image/*" style={{ display: 'none' }} onChange={uploadReplyImage} />
                      <button onClick={() => replyFileRef.current?.click()} disabled={uploading || pending}
                        title="Attach image"
                        style={{ width: 40, height: 40, borderRadius: 11, border: '1px solid #EDEFF3', background: '#F6F7F9', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', flexShrink: 0 }}>
                        {uploading ? <Loader2 size={15} className="animate-spin" color="#9CA3AF" /> : <Paperclip size={15} color="#9CA3AF" />}
                      </button>
                      <textarea value={reply} onChange={e => setReply(e.target.value)} rows={1} placeholder="Write a reply…"
                        onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendReply() } }}
                        style={{ flex: 1, resize: 'none', maxHeight: 120, padding: '11px 14px', borderRadius: 13, fontSize: 13.5, background: '#F6F7F9', border: '1px solid #EDEFF3', color: '#1F2430', outline: 'none', fontFamily: 'inherit', lineHeight: 1.4 }} />
                      <button onClick={sendReply} disabled={pending || uploading || !reply.trim()}
                        style={{ height: 40, padding: '0 16px', borderRadius: 13, background: 'linear-gradient(135deg,#DE1A1A,#9B0F0F)', color: '#fff', border: 'none', cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 13.5, fontWeight: 700, flexShrink: 0, opacity: (!reply.trim() || pending || uploading) ? 0.5 : 1, boxShadow: '0 4px 12px rgba(222,26,26,0.28)' }}>
                        {pending ? <Loader2 size={14} className="animate-spin" /> : <Send size={14} />}
                        <span className="hidden sm:inline">Send</span>
                      </button>
                    </div>
                  ) : (
                    <div style={{ padding: '14px', borderTop: '1px solid #F1F2F5', textAlign: 'center', fontSize: 12.5, color: '#9CA3AF' }}>
                      {active.status === 'resolved' ? 'This request was resolved. Start a new one if you still need help.' : 'This request is closed.'}
                    </div>
                  )}
                </>
              ) : (
                <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#A6AAB3', fontSize: 13 }}>
                  Select a request to view the conversation.
                </div>
              )}
            </section>
          </div>
        )}
      </div>

      {showCompose && (
        <ComposeSheet
          onClose={() => setShowCompose(false)}
          onCreated={id => { setShowCompose(false); setSelectedId(id); setShowThreadMobile(true); router.refresh() }}
          supabase={supabase}
        />
      )}

      {closeConfirm && (
        <ConfirmClose
          pending={pending}
          onCancel={() => setCloseConfirm(null)}
          onConfirm={() => handleClose(closeConfirm)}
        />
      )}
    </div>
  )
}

// ── Empty state ───────────────────────────────────────────────────────────────
function EmptyState({ onStart }: { onStart: () => void }) {
  return (
    <div style={{ background: '#FFFFFF', borderRadius: 20, border: '1px solid rgba(10,16,13,0.06)', boxShadow: '0 2px 14px rgba(0,0,0,0.05)', padding: '56px 24px', textAlign: 'center' }}>
      <div style={{ width: 72, height: 72, borderRadius: 20, margin: '0 auto 16px', display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'rgba(222,26,26,0.07)' }}>
        <LifeBuoy size={34} color="#DE1A1A" />
      </div>
      <h2 style={{ fontSize: 18, fontWeight: 800, color: '#1F2430', margin: 0 }}>No requests yet</h2>
      <p style={{ fontSize: 13, color: '#8A8F99', margin: '6px auto 20px', maxWidth: 360, lineHeight: 1.5 }}>
        Stuck on something — attendance, payroll, a task, anything? Raise a request and the team will reply right here.
      </p>
      <button onClick={onStart}
        style={{ display: 'inline-flex', alignItems: 'center', gap: 7, padding: '12px 22px', borderRadius: 13, fontSize: 14, fontWeight: 800, color: '#fff', background: 'linear-gradient(135deg,#DE1A1A,#9B0F0F)', border: 'none', cursor: 'pointer', boxShadow: '0 8px 20px rgba(222,26,26,0.3)' }}>
        <Plus size={16} /> Start a request
      </button>
    </div>
  )
}

// ── Compose sheet ─────────────────────────────────────────────────────────────
function ComposeSheet({ onClose, onCreated, supabase }: {
  onClose: () => void
  onCreated: (id: string) => void
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabase: any
}) {
  const [category, setCategory]     = useState('')
  const [priority, setPriority]     = useState('medium')
  const [description, setDescription] = useState('')
  const [file, setFile]             = useState<File | null>(null)
  const [preview, setPreview]       = useState<string | null>(null)
  const [error, setError]           = useState('')
  const [pending, start]            = useTransition()
  const fileRef = useRef<HTMLInputElement>(null)

  function pickFile(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0]
    if (!f) return
    if (f.size > 5 * 1024 * 1024) { setError('Max image size is 5 MB'); return }
    setError(''); setFile(f); setPreview(URL.createObjectURL(f))
  }

  function submit() {
    if (!category) { setError('Pick what this is about'); return }
    if (!description.trim()) { setError('Tell us what you need'); return }
    setError('')
    start(async () => {
      let imgUrl: string | undefined
      if (file) {
        const ext = file.name.split('.').pop() ?? 'jpg'
        const path = `compose/${Date.now()}.${ext}`
        const { data } = await supabase.storage.from('support-attachments').upload(path, file)
        if (data) imgUrl = supabase.storage.from('support-attachments').getPublicUrl(data.path).data.publicUrl
      }
      const label = categoryOf(category).label
      const res = await createTicket({
        title: `${label}: ${description.trim().slice(0, 56)}`,
        category,
        description: imgUrl ? `${description.trim()}\n[img]${imgUrl}` : description.trim(),
        priority,
      })
      if (res.success && res.ticketId) onCreated(res.ticketId)
      else setError(res.error ?? 'Could not submit. Try again.')
    })
  }

  return (
    <>
      <div onClick={onClose} style={{ position: 'fixed', inset: 0, zIndex: 60, background: 'rgba(13,8,8,0.5)', backdropFilter: 'blur(3px)' }} />
      <div role="dialog" aria-modal style={{ position: 'fixed', zIndex: 70, inset: 0, display: 'flex', alignItems: 'flex-end', justifyContent: 'center' }}
        className="sm:!items-center">
        <div style={{ width: '100%', maxWidth: 460, maxHeight: '92vh', overflowY: 'auto', background: '#FFFFFF', borderRadius: '22px 22px 0 0', boxShadow: '0 -8px 40px rgba(0,0,0,0.25)' }}
          className="sm:!rounded-[22px]">
          {/* header */}
          <div style={{ padding: '18px 20px 14px', borderBottom: '1px solid #F1F2F5', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <div>
              <h2 style={{ fontSize: 17, fontWeight: 800, color: '#1F2430', margin: 0 }}>New request</h2>
              <p style={{ fontSize: 12, color: '#9CA3AF', margin: '2px 0 0' }}>We&apos;ll reply in the conversation thread.</p>
            </div>
            <button onClick={onClose} style={{ width: 32, height: 32, borderRadius: '50%', border: '1px solid #EDEFF3', background: '#F6F7F9', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer' }}>
              <X size={15} color="#6B7280" />
            </button>
          </div>

          <div style={{ padding: 20, display: 'flex', flexDirection: 'column', gap: 18 }}>
            {/* category chips */}
            <div>
              <p style={{ fontSize: 10.5, fontWeight: 800, letterSpacing: '0.08em', color: '#9CA3AF', textTransform: 'uppercase', margin: '0 0 9px' }}>What&apos;s it about?</p>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 7 }}>
                {CATEGORIES.map(c => {
                  const on = category === c.key
                  return (
                    <button key={c.key} onClick={() => setCategory(c.key)}
                      style={{ display: 'inline-flex', alignItems: 'center', gap: 5, padding: '7px 12px', borderRadius: 99, fontSize: 12, fontWeight: 600, cursor: 'pointer',
                        border: on ? '1.5px solid #DE1A1A' : '1.5px solid #EDEFF3',
                        background: on ? 'rgba(222,26,26,0.06)' : '#FFFFFF',
                        color: on ? '#DE1A1A' : '#6B7280' }}>
                      <span style={{ fontSize: 14 }}>{c.emoji}</span> {c.label}
                    </button>
                  )
                })}
              </div>
            </div>

            {/* priority */}
            <div>
              <p style={{ fontSize: 10.5, fontWeight: 800, letterSpacing: '0.08em', color: '#9CA3AF', textTransform: 'uppercase', margin: '0 0 9px' }}>Priority</p>
              <div style={{ display: 'flex', gap: 7 }}>
                {PRIORITY_OPTIONS.map(p => {
                  const on = priority === p
                  const tok = priorityOf(p)
                  return (
                    <button key={p} onClick={() => setPriority(p)}
                      style={{ flex: 1, padding: '8px 0', borderRadius: 11, fontSize: 12, fontWeight: 700, textTransform: 'capitalize', cursor: 'pointer',
                        border: on ? `1.5px solid ${tok.color}` : '1.5px solid #EDEFF3',
                        background: on ? tok.bg : '#FFFFFF',
                        color: on ? tok.color : '#9CA3AF' }}>
                      {p}
                    </button>
                  )
                })}
              </div>
            </div>

            {/* description */}
            <div>
              <p style={{ fontSize: 10.5, fontWeight: 800, letterSpacing: '0.08em', color: '#9CA3AF', textTransform: 'uppercase', margin: '0 0 9px' }}>Describe it</p>
              <textarea rows={4} value={description} onChange={e => setDescription(e.target.value)}
                placeholder="What's happening, and what do you need?"
                style={{ width: '100%', resize: 'none', padding: '12px 14px', borderRadius: 13, fontSize: 13.5, background: '#F6F7F9', border: '1px solid #EDEFF3', color: '#1F2430', outline: 'none', fontFamily: 'inherit', lineHeight: 1.5, boxSizing: 'border-box' }} />
            </div>

            {/* attachment */}
            <input ref={fileRef} type="file" accept="image/*" style={{ display: 'none' }} onChange={pickFile} />
            {preview ? (
              <div style={{ position: 'relative', display: 'inline-block' }}>
                <img src={preview} alt="preview" style={{ maxHeight: 120, maxWidth: '100%', borderRadius: 13 }} />
                <button onClick={() => { setFile(null); setPreview(null) }}
                  style={{ position: 'absolute', top: 6, right: 6, width: 22, height: 22, borderRadius: '50%', background: 'rgba(0,0,0,0.55)', border: 'none', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer' }}>
                  <X size={12} color="#fff" />
                </button>
              </div>
            ) : (
              <button onClick={() => fileRef.current?.click()}
                style={{ alignSelf: 'flex-start', display: 'inline-flex', alignItems: 'center', gap: 6, padding: '8px 13px', borderRadius: 11, fontSize: 12.5, fontWeight: 600, color: '#6B7280', background: '#F6F7F9', border: '1px solid #EDEFF3', cursor: 'pointer' }}>
                <Paperclip size={14} /> Attach a screenshot
              </button>
            )}

            {error && (
              <div style={{ display: 'flex', alignItems: 'center', gap: 7, fontSize: 12.5, color: '#DE1A1A', background: 'rgba(222,26,26,0.06)', border: '1px solid rgba(222,26,26,0.14)', borderRadius: 11, padding: '9px 12px' }}>
                <AlertCircle size={14} /> {error}
              </div>
            )}
          </div>

          <div style={{ padding: '0 20px 22px', display: 'flex', gap: 10 }}>
            <button onClick={onClose} style={{ flex: 1, padding: '12px', borderRadius: 13, fontSize: 13.5, fontWeight: 700, color: '#6B7280', background: '#F6F7F9', border: '1px solid #EDEFF3', cursor: 'pointer' }}>Cancel</button>
            <button onClick={submit} disabled={pending}
              style={{ flex: 1.4, padding: '12px', borderRadius: 13, fontSize: 13.5, fontWeight: 800, color: '#fff', background: 'linear-gradient(135deg,#DE1A1A,#9B0F0F)', border: 'none', cursor: 'pointer', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 7, opacity: pending ? 0.7 : 1, boxShadow: '0 6px 16px rgba(222,26,26,0.3)' }}>
              {pending ? <Loader2 size={15} className="animate-spin" /> : <Send size={15} />} Submit request
            </button>
          </div>
        </div>
      </div>
    </>
  )
}

// ── Close confirm ─────────────────────────────────────────────────────────────
function ConfirmClose({ pending, onCancel, onConfirm }: { pending: boolean; onCancel: () => void; onConfirm: () => void }) {
  return (
    <>
      <div onClick={onCancel} style={{ position: 'fixed', inset: 0, zIndex: 60, background: 'rgba(13,8,8,0.5)' }} />
      <div style={{ position: 'fixed', zIndex: 70, inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}>
        <div style={{ width: '100%', maxWidth: 360, background: '#fff', borderRadius: 20, padding: 22, boxShadow: '0 12px 40px rgba(0,0,0,0.28)' }}>
          <div style={{ width: 46, height: 46, borderRadius: 13, background: 'rgba(222,26,26,0.08)', display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: 14 }}>
            <XCircle size={22} color="#DE1A1A" />
          </div>
          <h3 style={{ fontSize: 16.5, fontWeight: 800, color: '#1F2430', margin: '0 0 6px' }}>Close this request?</h3>
          <p style={{ fontSize: 13, color: '#6B7280', margin: '0 0 18px', lineHeight: 1.5 }}>You won&apos;t be able to send more messages on it. You can always start a new request.</p>
          <div style={{ display: 'flex', gap: 10 }}>
            <button onClick={onCancel} style={{ flex: 1, padding: '11px', borderRadius: 12, fontSize: 13.5, fontWeight: 700, color: '#6B7280', background: '#F6F7F9', border: '1px solid #EDEFF3', cursor: 'pointer' }}>Keep open</button>
            <button onClick={onConfirm} disabled={pending}
              style={{ flex: 1, padding: '11px', borderRadius: 12, fontSize: 13.5, fontWeight: 800, color: '#fff', background: '#DE1A1A', border: 'none', cursor: 'pointer', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 6, opacity: pending ? 0.7 : 1 }}>
              {pending && <Loader2 size={14} className="animate-spin" />} Close
            </button>
          </div>
        </div>
      </div>
    </>
  )
}
