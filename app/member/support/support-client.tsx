'use client'

import { useState, useEffect, useRef, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { createBrowserClient } from '@/lib/supabase/client'
import { createTicket, addResponse, closeTicket } from '@/lib/actions/support'
import { Send, Loader2, Plus, MessageCircle, XCircle, Paperclip, CheckCircle, X, ArrowLeft } from 'lucide-react'

type Response = {
  id: string
  responder_id: string
  responder_name: string
  message: string
  created_at: string
}
type Ticket = {
  id: string
  title: string
  category: string
  description: string
  status: string
  assigned_to?: string
  created_at: string
  updated_at: string
  support_responses: Response[]
}

const REQUEST_TYPES = [
  { key: 'attendance',  label: 'Attendance',    emoji: '📅', color: '#10B981' },
  { key: 'leave',       label: 'Leave',          emoji: '🌴', color: '#22C55E' },
  { key: 'task',        label: 'Task',           emoji: '✅', color: '#6366F1' },
  { key: 'client',      label: 'Client',         emoji: '🤝', color: '#3B82F6' },
  { key: 'payment',     label: 'Payment',        emoji: '💰', color: '#F59E0B' },
  { key: 'freelancer',  label: 'Freelancer',     emoji: '👷', color: '#EC4899' },
  { key: 'design',      label: 'Design',         emoji: '🎨', color: '#8B5CF6' },
  { key: 'video',       label: 'Video Editing',  emoji: '🎬', color: '#EF4444' },
  { key: 'marketing',   label: 'Marketing',      emoji: '📢', color: '#F97316' },
  { key: 'automation',  label: 'Automation',     emoji: '🤖', color: '#06B6D4' },
  { key: 'other',       label: 'Other',          emoji: '📋', color: '#9CA3AF' },
]

const PRIORITY_OPTIONS = [
  { key: 'low',    label: 'Low',    color: '#6B7280', bg: '#F3F4F6' },
  { key: 'medium', label: 'Medium', color: '#2563EB', bg: '#EFF6FF' },
  { key: 'high',   label: 'High',   color: '#D97706', bg: '#FEF3C7' },
  { key: 'urgent', label: 'Urgent', color: '#DE1A1A', bg: '#FEE2E2' },
]

const ASSIGN_TO_OPTIONS = [
  'Team Lead', 'HR', 'Operations', 'Accounts', 'Founder',
]

const STATUS_CONFIG: Record<string, { bg: string; color: string; dot: string; label: string }> = {
  open:        { bg: '#FEE2E2', color: '#DE1A1A', dot: '#DE1A1A', label: 'Pending' },
  in_progress: { bg: '#FEF3C7', color: '#D97706', dot: '#F59E0B', label: 'In Review' },
  resolved:    { bg: '#DCFCE7', color: '#15803D', dot: '#22C55E', label: 'Resolved' },
  closed:      { bg: '#F3F4F6', color: '#6B7280', dot: '#9CA3AF', label: 'Closed' },
}

function formatTime(s: string) {
  return new Date(s).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' })
}

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

function CloseDialog({ onConfirm, onCancel, isPending }: { onConfirm: () => void; onCancel: () => void; isPending: boolean }) {
  return (
    <>
      <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.45)', backdropFilter: 'blur(4px)', zIndex: 40 }} onClick={onCancel} />
      <div style={{ position: 'fixed', bottom: 0, left: 0, right: 0, zIndex: 50, background: '#fff', borderRadius: '24px 24px 0 0', padding: '24px 20px 36px' }}>
        <div style={{ width: 40, height: 4, borderRadius: 99, background: '#E5E7EB', margin: '0 auto 20px' }} />
        <h3 style={{ fontSize: 17, fontWeight: 800, color: '#111111', margin: '0 0 8px' }}>Close Request?</h3>
        <p style={{ fontSize: 13, color: '#6B7280', margin: '0 0 20px', lineHeight: 1.5 }}>
          Are you sure you want to close this request? You won&apos;t be able to send further messages.
        </p>
        <div style={{ display: 'flex', gap: 10 }}>
          <button onClick={onCancel} style={{ flex: 1, padding: '12px', borderRadius: 14, border: '1px solid #E5E7EB', background: '#F9FAFB', fontSize: 14, fontWeight: 600, color: '#6B7280', cursor: 'pointer' }}>Cancel</button>
          <button onClick={onConfirm} disabled={isPending} style={{ flex: 1, padding: '12px', borderRadius: 14, border: 'none', background: '#DE1A1A', fontSize: 14, fontWeight: 700, color: '#fff', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6, opacity: isPending ? 0.7 : 1 }}>
            {isPending && <Loader2 size={14} className="animate-spin" />} Close Request
          </button>
        </div>
      </div>
    </>
  )
}

function NewRequestModal({ onClose, onSuccess }: { onClose: () => void; onSuccess: () => void }) {
  const [requestType, setRequestType] = useState<string>('')
  const [priority,    setPriority]    = useState('medium')
  const [assignTo,    setAssignTo]    = useState('')
  const [description, setDescription] = useState('')
  const [isPending, startTransition]  = useTransition()
  const [pendingFile, setPendingFile] = useState<File | null>(null)
  const [previewUrl,  setPreviewUrl]  = useState<string | null>(null)
  const [error, setError]             = useState('')
  const fileRef = useRef<HTMLInputElement>(null)
  const supabase = createBrowserClient()

  const selectedType = REQUEST_TYPES.find(r => r.key === requestType)
  const selectedPriority = PRIORITY_OPTIONS.find(p => p.key === priority)
  const submitDisabled = isPending || !requestType || !description.trim()

  function handleFileSelect(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    if (file.size > 5 * 1024 * 1024) { setError('Max file size is 5 MB'); return }
    const allowed = ['image/jpeg', 'image/jpg', 'image/png', 'image/webp']
    if (!allowed.includes(file.type)) { setError('Only JPG, PNG, and WEBP images are supported'); return }
    setError('')
    setPendingFile(file)
    setPreviewUrl(URL.createObjectURL(file))
  }

  function submit() {
    if (!requestType || !description.trim()) return
    const title = `${selectedType?.label ?? requestType}: ${description.trim().slice(0, 60)}`
    startTransition(async () => {
      const res = await createTicket({
        title,
        category:    requestType,
        description: description.trim(),
        priority,
        assigned_to: assignTo || undefined,
      })
      if (!res.success || !res.ticketId) { setError(res.error ?? 'Failed to create request'); return }
      if (pendingFile && res.ticketId) {
        const ext  = pendingFile.name.split('.').pop() ?? 'jpg'
        const path = `${res.ticketId}/${Date.now()}.${ext}`
        const { data, error: upErr } = await supabase.storage.from('support-attachments').upload(path, pendingFile)
        if (!upErr && data) {
          const { data: { publicUrl } } = supabase.storage.from('support-attachments').getPublicUrl(data.path)
          await addResponse({ ticket_id: res.ticketId, message: `[img]${publicUrl}` })
        }
      }
      onSuccess()
    })
  }

  return (
    <>
      <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.45)', backdropFilter: 'blur(4px)', zIndex: 40 }} onClick={onClose} />
      <div style={{ position: 'fixed', inset: 0, zIndex: 50, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}>
        <div style={{ width: '100%', maxWidth: 520, background: '#fff', borderRadius: 24, boxShadow: '0 20px 60px rgba(0,0,0,0.2)', maxHeight: '90vh', display: 'flex', flexDirection: 'column' }}>

          {/* Header */}
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '18px 20px', borderBottom: '1px solid #F3F4F6' }}>
            <div>
              <h2 style={{ fontSize: 15, fontWeight: 800, color: '#111111', margin: 0 }}>New Request</h2>
              <p style={{ fontSize: 11, color: '#9CA3AF', margin: 0 }}>Submit a request to the team</p>
            </div>
            <button onClick={onClose} style={{ width: 30, height: 30, borderRadius: '50%', border: '1px solid #E5E7EB', background: '#F9FAFB', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer' }}>
              <X size={13} color="#6B7280" />
            </button>
          </div>

          <div style={{ flex: 1, overflowY: 'auto', padding: '16px 20px 20px', display: 'flex', flexDirection: 'column', gap: 14 }}>

            {/* Request Type */}
            <div>
              <label style={{ display: 'block', fontSize: 10, fontWeight: 700, color: '#374151', textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: 8 }}>
                Request Type <span style={{ color: '#DE1A1A' }}>*</span>
              </label>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 7 }}>
                {REQUEST_TYPES.map(rt => (
                  <button key={rt.key} type="button" onClick={() => setRequestType(rt.key)}
                    style={{
                      padding: '10px 6px', borderRadius: 12, border: `2px solid ${requestType === rt.key ? rt.color : '#EBEDF2'}`,
                      background: requestType === rt.key ? `${rt.color}15` : '#F9FAFB',
                      cursor: 'pointer', textAlign: 'center', transition: 'all 0.12s',
                    }}>
                    <div style={{ fontSize: 18, marginBottom: 3 }}>{rt.emoji}</div>
                    <p style={{ fontSize: 9, fontWeight: 700, color: requestType === rt.key ? rt.color : '#374151', margin: 0, lineHeight: 1.2 }}>{rt.label}</p>
                  </button>
                ))}
              </div>
            </div>

            {/* Priority + Assign To row */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
              <div>
                <label style={{ display: 'block', fontSize: 10, fontWeight: 700, color: '#374151', textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: 6 }}>Priority</label>
                <div style={{ display: 'flex', gap: 5, flexWrap: 'wrap' }}>
                  {PRIORITY_OPTIONS.map(p => (
                    <button key={p.key} type="button" onClick={() => setPriority(p.key)}
                      style={{
                        padding: '5px 10px', borderRadius: 8, border: `1.5px solid ${priority === p.key ? p.color : '#E5E7EB'}`,
                        background: priority === p.key ? p.bg : '#F9FAFB',
                        fontSize: 11, fontWeight: 700, color: priority === p.key ? p.color : '#9CA3AF',
                        cursor: 'pointer', transition: 'all 0.1s',
                      }}>
                      {p.label}
                    </button>
                  ))}
                </div>
              </div>
              <div>
                <label style={{ display: 'block', fontSize: 10, fontWeight: 700, color: '#374151', textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: 6 }}>Assign To</label>
                <select value={assignTo} onChange={e => setAssignTo(e.target.value)}
                  style={{ width: '100%', padding: '9px 12px', borderRadius: 10, border: '1px solid #E5E7EB', background: '#F9FAFB', fontSize: 12, color: assignTo ? '#111111' : '#9CA3AF', outline: 'none', fontFamily: 'inherit' }}>
                  <option value="">Select...</option>
                  {ASSIGN_TO_OPTIONS.map(a => <option key={a} value={a}>{a}</option>)}
                </select>
              </div>
            </div>

            {/* Description */}
            <div>
              <label style={{ display: 'block', fontSize: 10, fontWeight: 700, color: '#374151', textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: 6 }}>
                Description <span style={{ color: '#DE1A1A' }}>*</span>
              </label>
              <textarea
                value={description}
                onChange={e => setDescription(e.target.value.slice(0, 500))}
                placeholder="Describe your request in detail…"
                rows={4}
                style={{ width: '100%', padding: '10px 14px', borderRadius: 12, border: '1.5px solid #EBEDF2', background: '#F9FAFB', fontSize: 13, color: '#111111', resize: 'none', outline: 'none', fontFamily: 'inherit', boxSizing: 'border-box' }}
              />
              <p style={{ fontSize: 11, color: '#9CA3AF', margin: '3px 0 0', textAlign: 'right' }}>{description.length}/500</p>
            </div>

            {/* Attachment */}
            <div>
              <label style={{ display: 'block', fontSize: 10, fontWeight: 700, color: '#374151', textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: 6 }}>Attachment</label>
              <input ref={fileRef} type="file" accept="image/jpeg,image/jpg,image/png,image/webp" style={{ display: 'none' }} onChange={handleFileSelect} />
              {previewUrl ? (
                <div style={{ position: 'relative', display: 'inline-block' }}>
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={previewUrl} alt="preview" style={{ maxHeight: 100, maxWidth: '100%', borderRadius: 10, border: '1px solid #E5E7EB', objectFit: 'cover' }} />
                  <button type="button" onClick={() => { setPendingFile(null); setPreviewUrl(null); if (fileRef.current) fileRef.current.value = '' }}
                    style={{ position: 'absolute', top: 4, right: 4, width: 20, height: 20, borderRadius: '50%', background: 'rgba(0,0,0,0.55)', border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                    <X size={11} color="#fff" />
                  </button>
                </div>
              ) : (
                <button type="button" onClick={() => fileRef.current?.click()}
                  style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '8px 14px', borderRadius: 10, border: '1.5px dashed #E5E7EB', background: '#F9FAFB', cursor: 'pointer', fontSize: 12, fontWeight: 600, color: '#6B7280' }}>
                  <Paperclip size={13} /> Upload file (optional)
                </button>
              )}
              {error && <p style={{ fontSize: 11, color: '#EF4444', margin: '4px 0 0' }}>{error}</p>}
            </div>

          </div>

          {/* Submit */}
          <div style={{ padding: '12px 20px 20px', borderTop: '1px solid #F3F4F6' }}>
            {selectedType && (
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10, padding: '8px 12px', borderRadius: 10, background: `${selectedType.color}10`, border: `1px solid ${selectedType.color}30` }}>
                <span style={{ fontSize: 16 }}>{selectedType.emoji}</span>
                <span style={{ fontSize: 12, fontWeight: 600, color: selectedType.color }}>{selectedType.label}</span>
                <span style={{ fontSize: 11, color: '#9CA3AF', marginLeft: 'auto' }}>
                  {selectedPriority?.label} priority{assignTo ? ` · ${assignTo}` : ''}
                </span>
              </div>
            )}
            <button onClick={submit} disabled={submitDisabled}
              style={{ width: '100%', padding: '13px', borderRadius: 14, border: 'none', background: submitDisabled ? '#F3F4F6' : '#DE1A1A', color: submitDisabled ? '#9CA3AF' : '#fff', fontSize: 14, fontWeight: 700, cursor: submitDisabled ? 'not-allowed' : 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8 }}>
              {isPending ? <><Loader2 size={15} className="animate-spin" /> Submitting…</> : 'Submit Request'}
            </button>
          </div>

        </div>
      </div>
    </>
  )
}

export default function MemberSupportClient({
  tickets: initialTickets,
  currentUserId,
}: {
  tickets: Ticket[]
  currentUserId: string
}) {
  const router   = useRouter()
  const supabase = createBrowserClient()

  const sorted = [...initialTickets].sort((a, b) => new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime())

  const [selectedTicket,  setSelectedTicket]  = useState<Ticket | null>(sorted[0] ?? null)
  const [showNew,         setShowNew]         = useState(false)
  const [closeConfirm,    setCloseConfirm]    = useState<string | null>(null)
  const [message,         setMessage]         = useState('')
  const [isPending,       startTransition]    = useTransition()
  const [isClosePending,  startCloseTransition] = useTransition()
  const [isUploading,     setIsUploading]     = useState(false)
  const [realtimeMsgs,    setRealtimeMsgs]    = useState<Record<string, Response[]>>({})
  const [mobileView,      setMobileView]      = useState<'list' | 'chat'>('list')
  const [windowWidth,     setWindowWidth]     = useState(0)
  const bottomRef  = useRef<HTMLDivElement>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)

  const stats = {
    pending:    initialTickets.filter(t => t.status === 'open').length,
    inReview:   initialTickets.filter(t => t.status === 'in_progress').length,
    resolved:   initialTickets.filter(t => ['resolved', 'closed'].includes(t.status)).length,
  }

  const recentUpdates = sorted.slice(0, 3)

  const allMessages: Response[] = selectedTicket
    ? [
        { id: 'initial', responder_id: currentUserId, responder_name: 'You', message: selectedTicket.description, created_at: selectedTicket.created_at },
        ...[...selectedTicket.support_responses, ...(realtimeMsgs[selectedTicket.id] ?? [])]
          .filter((r, i, arr) => arr.findIndex(x => x.id === r.id) === i),
      ]
    : []

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [allMessages.length])

  useEffect(() => {
    if (!selectedTicket) return
    const ticketId = selectedTicket.id
    const channel = supabase
      .channel(`member-support-v4-${ticketId}`)
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'support_responses', filter: `ticket_id=eq.${ticketId}` },
        (payload) => { setRealtimeMsgs(prev => ({ ...prev, [ticketId]: [...(prev[ticketId] ?? []), payload.new as Response] })) })
      .subscribe()
    return () => { supabase.removeChannel(channel) }
  }, [selectedTicket?.id])

  useEffect(() => {
    setWindowWidth(window.innerWidth)
    const handler = () => setWindowWidth(window.innerWidth)
    window.addEventListener('resize', handler)
    return () => window.removeEventListener('resize', handler)
  }, [])

  const isMobile = windowWidth > 0 && windowWidth < 768

  function handleTicketSelect(t: Ticket) {
    setSelectedTicket(t)
    if (isMobile) setMobileView('chat')
  }

  function handleSend() {
    const msg = message.trim()
    if (!msg || isPending || !selectedTicket) return
    setMessage('')
    startTransition(async () => { await addResponse({ ticket_id: selectedTicket.id, message: msg }) })
  }

  async function handleFileSelect(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file || !selectedTicket) return
    if (file.size > 5 * 1024 * 1024) { alert('Max file size is 5 MB'); return }
    setIsUploading(true)
    try {
      const ext  = file.name.split('.').pop() ?? 'jpg'
      const path = `${selectedTicket.id}/${Date.now()}.${ext}`
      const { data, error } = await supabase.storage.from('support-attachments').upload(path, file)
      if (error || !data) { alert('Upload failed'); return }
      const { data: { publicUrl } } = supabase.storage.from('support-attachments').getPublicUrl(data.path)
      await addResponse({ ticket_id: selectedTicket.id, message: `[img]${publicUrl}` })
    } finally {
      setIsUploading(false)
      if (fileInputRef.current) fileInputRef.current.value = ''
    }
  }

  function handleClose(ticketId: string) {
    startCloseTransition(async () => {
      await closeTicket(ticketId)
      setCloseConfirm(null)
      router.refresh()
    })
  }

  const sc = selectedTicket ? (STATUS_CONFIG[selectedTicket.status] ?? STATUS_CONFIG.closed) : null
  const isActive = selectedTicket ? ['open', 'in_progress'].includes(selectedTicket.status) : false
  const reqType  = selectedTicket ? REQUEST_TYPES.find(r => r.key === selectedTicket.category) : null

  return (
    <div style={{ background: '#F4F5F7', minHeight: '100vh', overflow: 'hidden' }}>

      {/* ── HERO ── */}
      <div style={{
        background: 'linear-gradient(135deg,#FDF8F5 0%,#FAF0E8 50%,#F5EBE0 100%)',
        borderBottom: '1px solid rgba(0,0,0,0.06)',
        padding: '28px 28px 24px',
      }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: 16, marginBottom: 20 }}>
          <div>
            <h1 style={{ fontSize: 28, fontWeight: 900, color: '#111111', margin: 0, lineHeight: 1.15 }}>Request Center</h1>
            <p style={{ fontSize: 13, color: '#9CA3AF', margin: '5px 0 0' }}>Submit and track your operational requests</p>
          </div>
          <button onClick={() => setShowNew(true)}
            style={{ padding: '11px 22px', borderRadius: 14, border: 'none', background: '#DE1A1A', color: '#fff', fontSize: 14, fontWeight: 700, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 8, boxShadow: '0 4px 14px rgba(222,26,26,0.35)', flexShrink: 0 }}>
            <Plus size={16} /> New Request
          </button>
        </div>

        {/* Stats */}
        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
          {[
            { label: 'Pending',   value: stats.pending,  bg: '#FEE2E2', color: '#DE1A1A' },
            { label: 'In Review', value: stats.inReview, bg: '#FEF3C7', color: '#D97706' },
            { label: 'Resolved',  value: stats.resolved, bg: '#DCFCE7', color: '#15803D' },
          ].map(s => (
            <div key={s.label} style={{ background: '#fff', borderRadius: 14, padding: '12px 20px', boxShadow: '0 2px 10px rgba(0,0,0,0.06)', border: '1px solid rgba(0,0,0,0.05)' }}>
              <p style={{ fontSize: 22, fontWeight: 900, color: '#111111', margin: 0, lineHeight: 1 }}>{s.value}</p>
              <span style={{ display: 'inline-block', marginTop: 5, padding: '2px 8px', borderRadius: 99, fontSize: 10, fontWeight: 700, background: s.bg, color: s.color }}>{s.label}</span>
            </div>
          ))}
        </div>
      </div>

      {/* ── MAIN ── */}
      <div style={{ display: 'flex', gap: 16, padding: '18px 18px', alignItems: 'flex-start' }}>

        {/* LEFT: request list */}
        <div style={{ width: isMobile ? '100%' : 280, flexShrink: 0, display: isMobile && mobileView === 'chat' ? 'none' : 'flex', flexDirection: 'column', gap: 12 }}>

          {/* Request list */}
          <div style={{ background: '#fff', borderRadius: 20, boxShadow: '0 2px 14px rgba(0,0,0,0.06)', border: '1px solid rgba(0,0,0,0.05)', overflow: 'hidden' }}>
            <div style={{ padding: '13px 16px', borderBottom: '1px solid #F3F4F6' }}>
              <span style={{ fontSize: 13, fontWeight: 700, color: '#111111' }}>My Requests</span>
            </div>
            {sorted.length === 0 ? (
              <div style={{ padding: '48px 20px', textAlign: 'center' }}>
                <div style={{ fontSize: 36, marginBottom: 10 }}>📋</div>
                <p style={{ fontSize: 13, fontWeight: 600, color: '#9CA3AF', margin: '0 0 4px' }}>No requests yet</p>
                <p style={{ fontSize: 11, color: '#D1D5DB', margin: 0 }}>Submit your first request above</p>
              </div>
            ) : (
              sorted.map((t, i) => {
                const rt   = REQUEST_TYPES.find(r => r.key === t.category)
                const tSc  = STATUS_CONFIG[t.status] ?? STATUS_CONFIG.closed
                const isSelected = selectedTicket?.id === t.id
                return (
                  <div key={t.id} onClick={() => handleTicketSelect(t)}
                    style={{ padding: '11px 16px', borderBottom: i < sorted.length - 1 ? '1px solid #F9FAFB' : 'none', cursor: 'pointer', background: isSelected ? '#FEF2F2' : 'transparent', borderLeft: `3px solid ${isSelected ? '#DE1A1A' : 'transparent'}`, transition: 'all 0.12s' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      <span style={{ fontSize: 16, flexShrink: 0 }}>{rt?.emoji ?? '📋'}</span>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <p style={{ fontSize: 11, fontWeight: 700, color: rt?.color ?? '#374151', margin: 0 }}>{rt?.label ?? t.category}</p>
                        <p style={{ fontSize: 11, color: '#374151', margin: '1px 0 0', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{t.description.slice(0, 40)}{t.description.length > 40 ? '…' : ''}</p>
                        <p style={{ fontSize: 10, color: '#9CA3AF', margin: '2px 0 0' }}>{timeAgo(t.updated_at)}</p>
                      </div>
                      <span style={{ padding: '2px 7px', borderRadius: 99, fontSize: 9, fontWeight: 700, background: tSc.bg, color: tSc.color, flexShrink: 0 }}>{tSc.label}</span>
                    </div>
                  </div>
                )
              })
            )}
          </div>

          {/* Right-side widgets — shown below list on mobile, inline on desktop */}
          {!isMobile && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>

              {/* My Open Requests summary */}
              <div style={{ background: '#fff', borderRadius: 20, padding: 16, boxShadow: '0 2px 14px rgba(0,0,0,0.06)', border: '1px solid rgba(0,0,0,0.05)' }}>
                <p style={{ fontSize: 13, fontWeight: 700, color: '#111111', margin: '0 0 12px' }}>My Open Requests</p>
                {[
                  { label: 'Pending',   value: stats.pending,  color: '#DE1A1A', bg: '#FEE2E2' },
                  { label: 'In Review', value: stats.inReview, color: '#D97706', bg: '#FEF3C7' },
                  { label: 'Resolved',  value: stats.resolved, color: '#15803D', bg: '#DCFCE7' },
                ].map(s => (
                  <div key={s.label} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
                      <span style={{ width: 7, height: 7, borderRadius: '50%', background: s.color, display: 'inline-block' }} />
                      <span style={{ fontSize: 12, color: '#6B7280' }}>{s.label}</span>
                    </div>
                    <span style={{ padding: '2px 9px', borderRadius: 99, fontSize: 11, fontWeight: 700, background: s.bg, color: s.color }}>{s.value}</span>
                  </div>
                ))}
              </div>

              {/* Response SLA */}
              <div style={{ background: '#fff', borderRadius: 20, padding: 16, boxShadow: '0 2px 14px rgba(0,0,0,0.06)', border: '1px solid rgba(0,0,0,0.05)' }}>
                <p style={{ fontSize: 13, fontWeight: 700, color: '#111111', margin: '0 0 12px' }}>Response SLA</p>
                {[
                  { label: 'Avg Response',   value: '2 Hours' },
                  { label: 'Avg Resolution', value: '8 Hours' },
                ].map(s => (
                  <div key={s.label} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                    <span style={{ fontSize: 11, color: '#9CA3AF' }}>{s.label}</span>
                    <span style={{ fontSize: 12, fontWeight: 700, color: '#111111' }}>{s.value}</span>
                  </div>
                ))}
              </div>

              {/* Recent Updates */}
              {recentUpdates.length > 0 && (
                <div style={{ background: '#fff', borderRadius: 20, padding: 16, boxShadow: '0 2px 14px rgba(0,0,0,0.06)', border: '1px solid rgba(0,0,0,0.05)' }}>
                  <p style={{ fontSize: 13, fontWeight: 700, color: '#111111', margin: '0 0 12px' }}>Recent Updates</p>
                  {recentUpdates.map(t => {
                    const rt = REQUEST_TYPES.find(r => r.key === t.category)
                    const tSc = STATUS_CONFIG[t.status] ?? STATUS_CONFIG.closed
                    return (
                      <div key={t.id} style={{ display: 'flex', alignItems: 'flex-start', gap: 8, marginBottom: 10 }} onClick={() => handleTicketSelect(t)}>
                        <span style={{ fontSize: 14, flexShrink: 0 }}>{rt?.emoji ?? '📋'}</span>
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <p style={{ fontSize: 11, fontWeight: 600, color: '#111111', margin: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                            {rt?.label} Request
                          </p>
                          <span style={{ padding: '1px 6px', borderRadius: 99, fontSize: 9, fontWeight: 700, background: tSc.bg, color: tSc.color }}>{tSc.label}</span>
                        </div>
                        <span style={{ fontSize: 10, color: '#9CA3AF', flexShrink: 0 }}>{timeAgo(t.updated_at)}</span>
                      </div>
                    )
                  })}
                </div>
              )}

            </div>
          )}
        </div>

        {/* RIGHT: conversation */}
        <div style={{ flex: 1, minWidth: 0, display: isMobile && mobileView === 'list' ? 'none' : 'block', width: isMobile ? '100%' : undefined }}>
          {!selectedTicket ? (
            <div style={{ background: '#fff', borderRadius: 22, padding: '80px 20px', textAlign: 'center', boxShadow: '0 2px 12px rgba(0,0,0,0.06)', border: '1px solid rgba(0,0,0,0.05)' }}>
              <MessageCircle size={48} color="#E5E7EB" />
              <p style={{ fontSize: 15, fontWeight: 600, color: '#9CA3AF', margin: '14px 0 4px' }}>No request selected</p>
              <p style={{ fontSize: 12, color: '#D1D5DB', margin: 0 }}>Select a request or submit a new one</p>
            </div>
          ) : (
            <div style={{ background: '#fff', borderRadius: 22, boxShadow: '0 4px 24px rgba(0,0,0,0.08)', border: '1px solid rgba(0,0,0,0.05)', overflow: 'hidden' }}>

              {/* Header */}
              <div style={{ padding: '14px 18px', borderBottom: '1px solid #F3F4F6', display: 'flex', alignItems: 'center', gap: 10 }}>
                {isMobile && (
                  <button onClick={() => setMobileView('list')}
                    style={{ width: 30, height: 30, borderRadius: '50%', border: '1px solid #E5E7EB', background: '#F9FAFB', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', flexShrink: 0 }}>
                    <ArrowLeft size={13} color="#374151" />
                  </button>
                )}
                <span style={{ fontSize: 20, flexShrink: 0 }}>{reqType?.emoji ?? '📋'}</span>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <p style={{ fontSize: 13, fontWeight: 700, color: reqType?.color ?? '#111111', margin: 0 }}>{reqType?.label ?? selectedTicket.category} Request</p>
                  <p style={{ fontSize: 11, color: '#9CA3AF', margin: 0 }}>
                    {selectedTicket.assigned_to ? `Assigned to ${selectedTicket.assigned_to} · ` : ''}Updated {timeAgo(selectedTicket.updated_at)}
                  </p>
                </div>
                {sc && <span style={{ padding: '4px 10px', borderRadius: 99, fontSize: 11, fontWeight: 700, background: sc.bg, color: sc.color, flexShrink: 0 }}>{sc.label}</span>}
                {isActive && (
                  <button onClick={() => setCloseConfirm(selectedTicket.id)}
                    style={{ padding: '6px 12px', borderRadius: 8, border: '1px solid #E5E7EB', background: '#F9FAFB', fontSize: 11, fontWeight: 600, color: '#6B7280', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 4, flexShrink: 0 }}>
                    <XCircle size={12} /> Close
                  </button>
                )}
              </div>

              {/* Messages */}
              <div style={{ minHeight: 280, maxHeight: 440, overflowY: 'auto', padding: '16px 18px 8px' }}>
                {allMessages.map(msg => {
                  const isMine = msg.responder_id === currentUserId
                  return (
                    <div key={msg.id} style={{ display: 'flex', flexDirection: 'column', alignItems: isMine ? 'flex-end' : 'flex-start', marginBottom: 10 }}>
                      {!isMine && <p style={{ fontSize: 10, color: '#9CA3AF', margin: '0 0 3px 10px', fontWeight: 600 }}>{msg.responder_name}</p>}
                      <div style={{ maxWidth: '72%', padding: '9px 13px', borderRadius: isMine ? '16px 16px 4px 16px' : '4px 16px 16px 16px', background: isMine ? '#DE1A1A' : '#F3F4F6', color: isMine ? '#fff' : '#111111', fontSize: 13, lineHeight: 1.45, wordBreak: 'break-word' }}>
                        {renderMessage(msg.message)}
                      </div>
                      <p style={{ fontSize: 9, color: '#9CA3AF', margin: '3px 3px 0', textAlign: isMine ? 'right' : 'left' }}>{formatTime(msg.created_at)}</p>
                    </div>
                  )
                })}

                {selectedTicket.status === 'resolved' && (
                  <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8, padding: '16px 0 8px' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '8px 18px', borderRadius: 99, background: '#DCFCE7', border: '1px solid rgba(21,128,61,0.2)' }}>
                      <CheckCircle size={13} color="#15803D" />
                      <span style={{ fontSize: 12, fontWeight: 700, color: '#15803D' }}>Request Resolved</span>
                    </div>
                    <p style={{ fontSize: 11, color: '#9CA3AF', margin: 0 }}>The team has resolved your request.</p>
                    <button onClick={() => setCloseConfirm(selectedTicket.id)}
                      style={{ padding: '7px 18px', borderRadius: 10, border: '1.5px solid #E5E7EB', background: 'transparent', color: '#6B7280', fontSize: 12, fontWeight: 600, cursor: 'pointer' }}>
                      Close Request
                    </button>
                  </div>
                )}

                {selectedTicket.status === 'closed' && (
                  <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6, padding: '20px 0 12px' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '8px 18px', borderRadius: 99, background: '#F3F4F6', border: '1px solid #E5E7EB' }}>
                      <XCircle size={13} color="#6B7280" />
                      <span style={{ fontSize: 12, fontWeight: 700, color: '#6B7280' }}>Request Closed</span>
                    </div>
                    <p style={{ fontSize: 11, color: '#9CA3AF', margin: 0 }}>Raise a new request if you need further help.</p>
                  </div>
                )}
                <div ref={bottomRef} />
              </div>

              {/* Input */}
              {isActive && (
                <div style={{ padding: '10px 18px 16px', borderTop: '1px solid #F3F4F6' }}>
                  <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                    <input ref={fileInputRef} type="file" accept="image/*" style={{ display: 'none' }} onChange={handleFileSelect} />
                    <button onClick={() => fileInputRef.current?.click()} disabled={isUploading || isPending}
                      style={{ width: 36, height: 36, borderRadius: 10, border: '1px solid #E5E7EB', background: '#F9FAFB', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', flexShrink: 0 }}>
                      {isUploading ? <Loader2 size={14} color="#9CA3AF" className="animate-spin" /> : <Paperclip size={14} color="#9CA3AF" />}
                    </button>
                    <input value={message} onChange={e => setMessage(e.target.value)} onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSend() } }}
                      placeholder="Type a message…" disabled={isPending || isUploading}
                      style={{ flex: 1, padding: '10px 14px', borderRadius: 12, background: '#F9FAFB', border: '1px solid #E5E7EB', fontSize: 13, color: '#111111', outline: 'none', fontFamily: 'inherit' }} />
                    <button onClick={handleSend} disabled={isPending || isUploading || !message.trim()}
                      style={{ padding: '10px 16px', borderRadius: 12, background: message.trim() && !isPending && !isUploading ? 'linear-gradient(135deg,#DE1A1A,#7F1D1D)' : '#F3F4F6', color: message.trim() && !isPending && !isUploading ? '#fff' : '#9CA3AF', border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 5, fontSize: 13, fontWeight: 600, flexShrink: 0 }}>
                      {isPending ? <Loader2 size={13} className="animate-spin" /> : <Send size={13} />} Send
                    </button>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      {showNew && <NewRequestModal onClose={() => setShowNew(false)} onSuccess={() => { setShowNew(false); router.refresh() }} />}

      {closeConfirm && (
        <CloseDialog
          onConfirm={() => handleClose(closeConfirm)}
          onCancel={() => setCloseConfirm(null)}
          isPending={isClosePending}
        />
      )}
    </div>
  )
}
