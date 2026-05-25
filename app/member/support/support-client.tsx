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
  created_at: string
  updated_at: string
  support_responses: Response[]
}

const CATEGORIES = [
  { key: 'technical', label: 'Technical Issues',       emoji: '⚙️',  color: '#8B5CF6' },
  { key: 'payroll',   label: 'Payroll Requests',       emoji: '💰', color: '#F59E0B' },
  { key: 'leave',     label: 'Attendance Corrections', emoji: '📅', color: '#10B981' },
  { key: 'general',   label: 'Client Support',         emoji: '🤝', color: '#3B82F6' },
  { key: 'hr',        label: 'HR Helpdesk',            emoji: '👥', color: '#EC4899' },
  { key: 'other',     label: 'Escalated Issues',       emoji: '🚨', color: '#EF4444' },
]

const PROBLEM_MAP: Record<string, string[]> = {
  technical: ['App not loading', 'Login issues', 'Feature not working', 'Slow performance', 'Other'],
  payroll:   ['Salary not received', 'Wrong amount calculated', 'Deduction issue', 'Payslip missing', 'Other'],
  leave:     ['Attendance marked wrong', 'Leave not reflected', 'Overtime not counted', 'Other'],
  general:   ['Client complaint', 'Project update needed', 'Delivery issue', 'Other'],
  hr:        ['Leave not approved', 'Policy question', 'Onboarding issue', 'Other'],
  other:     ['Urgent unresolved issue', 'Manager escalation', 'Other'],
}

const STATUS_CONFIG: Record<string, { bg: string; color: string; dot: string; label: string }> = {
  open:        { bg: '#FEE2E2', color: '#DE1A1A', dot: '#DE1A1A', label: 'Open' },
  in_progress: { bg: '#FEF3C7', color: '#D97706', dot: '#F59E0B', label: 'In Progress' },
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

function CloseDialog({
  onConfirm,
  onCancel,
  isPending,
}: {
  onConfirm: () => void
  onCancel: () => void
  isPending: boolean
}) {
  return (
    <>
      <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.45)', backdropFilter: 'blur(4px)', zIndex: 40 }} onClick={onCancel} />
      <div style={{ position: 'fixed', bottom: 0, left: 0, right: 0, zIndex: 50, background: '#fff', borderRadius: '24px 24px 0 0', padding: '24px 20px 36px' }}>
        <div style={{ width: 40, height: 4, borderRadius: 99, background: '#E5E7EB', margin: '0 auto 20px' }} />
        <h3 style={{ fontSize: 17, fontWeight: 800, color: '#111111', margin: '0 0 8px' }}>Close Ticket?</h3>
        <p style={{ fontSize: 13, color: '#6B7280', margin: '0 0 20px', lineHeight: 1.5 }}>
          Are you sure you want to close this ticket? You won&apos;t be able to send further messages.
        </p>
        <div style={{ display: 'flex', gap: 10 }}>
          <button onClick={onCancel} style={{ flex: 1, padding: '12px', borderRadius: 14, border: '1px solid #E5E7EB', background: '#F9FAFB', fontSize: 14, fontWeight: 600, color: '#6B7280', cursor: 'pointer' }}>
            Cancel
          </button>
          <button onClick={onConfirm} disabled={isPending} style={{ flex: 1, padding: '12px', borderRadius: 14, border: 'none', background: '#DE1A1A', fontSize: 14, fontWeight: 700, color: '#fff', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6, opacity: isPending ? 0.7 : 1 }}>
            {isPending && <Loader2 size={14} className="animate-spin" />}
            Close Ticket
          </button>
        </div>
      </div>
    </>
  )
}

function RaiseTicketModal({ onClose, onSuccess }: { onClose: () => void; onSuccess: () => void }) {
  const [step, setStep] = useState<'category' | 'problem'>('category')
  const [category, setCategory] = useState<string | null>(null)
  const [problem, setProblem] = useState<string | null>(null)
  const [customText, setCustomText] = useState('')
  const [isPending, startTransition] = useTransition()

  const catDef = CATEGORIES.find(c => c.key === category)
  const problems = category ? PROBLEM_MAP[category] ?? [] : []
  const submitDisabled = isPending || !problem || (problem === 'Other' && !customText.trim())

  function submit() {
    if (!category || !problem) return
    if (problem === 'Other' && !customText.trim()) return
    const title = problem === 'Other' ? customText.trim() : problem
    startTransition(async () => {
      await createTicket({ title, category, description: title, priority: 'normal' })
      onSuccess()
    })
  }

  return (
    <>
      <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.45)', backdropFilter: 'blur(4px)', zIndex: 40 }} onClick={onClose} />
      <div style={{ position: 'fixed', inset: 0, zIndex: 50, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}>
        <div style={{ width: '100%', maxWidth: 480, background: '#fff', borderRadius: 24, boxShadow: '0 20px 60px rgba(0,0,0,0.2)', maxHeight: '85vh', display: 'flex', flexDirection: 'column' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '18px 20px', borderBottom: '1px solid #F3F4F6' }}>
            {step === 'problem' && (
              <button onClick={() => { setStep('category'); setCategory(null); setProblem(null); setCustomText('') }}
                style={{ width: 30, height: 30, borderRadius: '50%', border: '1px solid #E5E7EB', background: '#F9FAFB', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', flexShrink: 0 }}>
                <ArrowLeft size={13} color="#374151" />
              </button>
            )}
            <div style={{ flex: 1 }}>
              <h2 style={{ fontSize: 15, fontWeight: 800, color: '#111111', margin: 0 }}>Raise a Ticket</h2>
              <p style={{ fontSize: 11, color: '#9CA3AF', margin: 0 }}>
                {step === 'category' ? 'Select a category' : `${catDef?.emoji ?? ''} ${catDef?.label ?? ''}`}
              </p>
            </div>
            <button onClick={onClose} style={{ width: 30, height: 30, borderRadius: '50%', border: '1px solid #E5E7EB', background: '#F9FAFB', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', flexShrink: 0 }}>
              <X size={13} color="#6B7280" />
            </button>
          </div>
          <div style={{ flex: 1, overflowY: 'auto', padding: '16px 20px 20px' }}>
            {step === 'category' ? (
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                {CATEGORIES.map(cat => (
                  <button key={cat.key} onClick={() => { setCategory(cat.key); setStep('problem') }}
                    style={{ background: '#F9FAFB', borderRadius: 16, border: '1.5px solid #EBEDF2', padding: '16px 14px', textAlign: 'left', cursor: 'pointer', transition: 'border-color 0.15s' }}>
                    <div style={{ fontSize: 26, marginBottom: 8 }}>{cat.emoji}</div>
                    <p style={{ fontSize: 12, fontWeight: 700, color: '#111111', margin: 0 }}>{cat.label}</p>
                  </button>
                ))}
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {problems.map(p => (
                  <button key={p} onClick={() => { setProblem(p); if (p !== 'Other') setCustomText('') }}
                    style={{ background: '#fff', borderRadius: 12, border: `2px solid ${problem === p ? '#DE1A1A' : '#EBEDF2'}`, padding: '12px 14px', textAlign: 'left', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 10 }}>
                    <div style={{ width: 18, height: 18, borderRadius: '50%', border: `2px solid ${problem === p ? '#DE1A1A' : '#D1D5DB'}`, background: problem === p ? '#DE1A1A' : 'transparent', flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                      {problem === p && <div style={{ width: 6, height: 6, borderRadius: '50%', background: '#fff' }} />}
                    </div>
                    <span style={{ fontSize: 13, fontWeight: 600, color: '#111111' }}>{p}</span>
                  </button>
                ))}
                {problem === 'Other' && (
                  <div style={{ marginTop: 4 }}>
                    <textarea value={customText} onChange={e => setCustomText(e.target.value.slice(0, 300))} placeholder="Describe your problem…" rows={3}
                      style={{ width: '100%', padding: '10px 14px', borderRadius: 12, border: '1.5px solid #EBEDF2', background: '#F9FAFB', fontSize: 13, color: '#111111', resize: 'none', outline: 'none', fontFamily: 'inherit', boxSizing: 'border-box' }} />
                    <p style={{ fontSize: 11, color: '#9CA3AF', margin: '3px 0 0', textAlign: 'right' }}>{customText.length}/300</p>
                  </div>
                )}
                <button onClick={submit} disabled={submitDisabled}
                  style={{ marginTop: 8, width: '100%', padding: '13px', borderRadius: 14, border: 'none', background: submitDisabled ? '#F3F4F6' : '#DE1A1A', color: submitDisabled ? '#9CA3AF' : '#fff', fontSize: 14, fontWeight: 700, cursor: submitDisabled ? 'not-allowed' : 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8 }}>
                  {isPending && <Loader2 size={15} className="animate-spin" />}
                  Raise Ticket
                </button>
              </div>
            )}
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
  const router = useRouter()
  const supabase = createBrowserClient()

  const sorted = [...initialTickets].sort((a, b) => new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime())

  const [selectedTicket, setSelectedTicket] = useState<Ticket | null>(sorted[0] ?? null)
  const [showRaise, setShowRaise] = useState(false)
  const [closeConfirm, setCloseConfirm] = useState<string | null>(null)
  const [message, setMessage] = useState('')
  const [isPending, startTransition] = useTransition()
  const [isClosePending, startCloseTransition] = useTransition()
  const [isUploading, setIsUploading] = useState(false)
  const [realtimeMsgs, setRealtimeMsgs] = useState<Record<string, Response[]>>({})
  const bottomRef = useRef<HTMLDivElement>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)

  const stats = {
    open:        initialTickets.filter(t => t.status === 'open').length,
    inProgress:  initialTickets.filter(t => t.status === 'in_progress').length,
    resolved:    initialTickets.filter(t => t.status === 'resolved').length,
    closed:      initialTickets.filter(t => t.status === 'closed').length,
  }

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
      .channel(`member-support-v3-${ticketId}`)
      .on('postgres_changes', {
        event: 'INSERT',
        schema: 'public',
        table: 'support_responses',
        filter: `ticket_id=eq.${ticketId}`,
      }, (payload) => {
        setRealtimeMsgs(prev => ({ ...prev, [ticketId]: [...(prev[ticketId] ?? []), payload.new as Response] }))
      })
      .subscribe()
    return () => { supabase.removeChannel(channel) }
  }, [selectedTicket?.id])

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
      const ext = file.name.split('.').pop() ?? 'jpg'
      const path = `${selectedTicket.id}/${Date.now()}.${ext}`
      const { data, error } = await supabase.storage.from('support-attachments').upload(path, file)
      if (error || !data) { console.error(error); return }
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
  const cat = selectedTicket ? CATEGORIES.find(c => c.key === selectedTicket.category) : null

  return (
    <div style={{ background: '#F4F5F7', minHeight: '100vh' }}>

      {/* ── HERO ── */}
      <div style={{
        background: 'linear-gradient(135deg,#FDF8F5 0%,#FAF0E8 50%,#F5EBE0 100%)',
        borderBottom: '1px solid rgba(0,0,0,0.06)',
        padding: '28px 28px 24px',
        position: 'relative', overflow: 'hidden',
      }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: 16, marginBottom: 20 }}>
          <div>
            <h1 style={{ fontSize: 30, fontWeight: 900, color: '#111111', margin: 0, lineHeight: 1.15 }}>My Support</h1>
            <p style={{ fontSize: 13, color: '#9CA3AF', margin: '6px 0 0' }}>Get help from the Media &amp; Tech team</p>
          </div>
          <button
            onClick={() => setShowRaise(true)}
            style={{ padding: '11px 22px', borderRadius: 14, border: 'none', background: '#DE1A1A', color: '#fff', fontSize: 14, fontWeight: 700, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 8, boxShadow: '0 4px 14px rgba(222,26,26,0.35)', flexShrink: 0 }}
          >
            <Plus size={16} /> Raise a Ticket
          </button>
        </div>

        <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
          {[
            { label: 'Open',        value: stats.open,        bg: '#FEE2E2', color: '#DE1A1A' },
            { label: 'In Progress', value: stats.inProgress,  bg: '#FEF3C7', color: '#D97706' },
            { label: 'Resolved',    value: stats.resolved,    bg: '#DCFCE7', color: '#15803D' },
            { label: 'Closed',      value: stats.closed,      bg: '#F3F4F6', color: '#6B7280' },
          ].map(s => (
            <div key={s.label} style={{ background: '#fff', borderRadius: 14, padding: '12px 20px', boxShadow: '0 2px 10px rgba(0,0,0,0.06)', border: '1px solid rgba(0,0,0,0.05)' }}>
              <p style={{ fontSize: 24, fontWeight: 900, color: '#111111', margin: 0, lineHeight: 1 }}>{s.value}</p>
              <span style={{ display: 'inline-block', marginTop: 5, padding: '2px 8px', borderRadius: 99, fontSize: 10, fontWeight: 700, background: s.bg, color: s.color }}>{s.label}</span>
            </div>
          ))}
        </div>
      </div>

      {/* ── MAIN 2-COL ── */}
      <div style={{ display: 'flex', gap: 18, padding: '20px 20px', alignItems: 'flex-start' }}>

        {/* LEFT: ticket list */}
        <div style={{ width: 290, flexShrink: 0 }}>
          <div style={{ background: '#fff', borderRadius: 22, boxShadow: '0 2px 16px rgba(0,0,0,0.06)', border: '1px solid rgba(0,0,0,0.05)', overflow: 'hidden' }}>
            <div style={{ padding: '14px 16px', borderBottom: '1px solid #F3F4F6' }}>
              <span style={{ fontSize: 14, fontWeight: 700, color: '#111111' }}>My Tickets</span>
            </div>
            {sorted.length === 0 ? (
              <div style={{ padding: '48px 20px', textAlign: 'center' }}>
                <div style={{ fontSize: 36, marginBottom: 10 }}>🎉</div>
                <p style={{ fontSize: 13, fontWeight: 600, color: '#9CA3AF', margin: '0 0 4px' }}>No tickets yet</p>
                <p style={{ fontSize: 11, color: '#D1D5DB', margin: 0 }}>Raise your first ticket above</p>
              </div>
            ) : (
              sorted.map((t, i) => {
                const tCat = CATEGORIES.find(c => c.key === t.category)
                const tSc = STATUS_CONFIG[t.status] ?? STATUS_CONFIG.closed
                const isSelected = selectedTicket?.id === t.id
                return (
                  <div
                    key={t.id}
                    onClick={() => setSelectedTicket(t)}
                    style={{
                      padding: '12px 16px',
                      borderBottom: i < sorted.length - 1 ? '1px solid #F9FAFB' : 'none',
                      cursor: 'pointer',
                      background: isSelected ? '#FEF2F2' : 'transparent',
                      borderLeft: `3px solid ${isSelected ? '#DE1A1A' : 'transparent'}`,
                      transition: 'all 0.12s',
                    }}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      <span style={{ fontSize: 18, flexShrink: 0 }}>{tCat?.emoji ?? '📋'}</span>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <p style={{ fontSize: 12, fontWeight: 700, color: '#111111', margin: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{t.title}</p>
                        <p style={{ fontSize: 10, color: '#9CA3AF', margin: '2px 0 0' }}>{timeAgo(t.updated_at)}</p>
                      </div>
                      <span style={{ padding: '2px 7px', borderRadius: 99, fontSize: 9, fontWeight: 700, background: tSc.bg, color: tSc.color, flexShrink: 0 }}>{tSc.label}</span>
                    </div>
                  </div>
                )
              })
            )}
          </div>
        </div>

        {/* RIGHT: conversation */}
        <div style={{ flex: 1, minWidth: 0 }}>
          {!selectedTicket ? (
            <div style={{ background: '#fff', borderRadius: 22, padding: '80px 20px', textAlign: 'center', boxShadow: '0 2px 12px rgba(0,0,0,0.06)', border: '1px solid rgba(0,0,0,0.05)' }}>
              <MessageCircle size={48} color="#E5E7EB" />
              <p style={{ fontSize: 15, fontWeight: 600, color: '#9CA3AF', margin: '14px 0 4px' }}>No ticket selected</p>
              <p style={{ fontSize: 12, color: '#D1D5DB', margin: 0 }}>Select a ticket or raise a new one</p>
            </div>
          ) : (
            <div style={{ background: '#fff', borderRadius: 22, boxShadow: '0 4px 24px rgba(0,0,0,0.08)', border: '1px solid rgba(0,0,0,0.05)', overflow: 'hidden' }}>

              {/* Ticket header */}
              <div style={{ padding: '14px 18px', borderBottom: '1px solid #F3F4F6', display: 'flex', alignItems: 'center', gap: 10 }}>
                <span style={{ fontSize: 22, flexShrink: 0 }}>{cat?.emoji ?? '📋'}</span>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <p style={{ fontSize: 14, fontWeight: 700, color: '#111111', margin: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{selectedTicket.title}</p>
                  <p style={{ fontSize: 11, color: '#9CA3AF', margin: 0 }}>{cat?.label} · Updated {timeAgo(selectedTicket.updated_at)}</p>
                </div>
                {sc && (
                  <span style={{ padding: '4px 10px', borderRadius: 99, fontSize: 11, fontWeight: 700, background: sc.bg, color: sc.color, flexShrink: 0 }}>
                    {sc.label}
                  </span>
                )}
                {isActive && (
                  <button
                    onClick={() => setCloseConfirm(selectedTicket.id)}
                    style={{ padding: '6px 12px', borderRadius: 8, border: '1px solid #E5E7EB', background: '#F9FAFB', fontSize: 11, fontWeight: 600, color: '#6B7280', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 4, flexShrink: 0 }}
                  >
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
                      {!isMine && (
                        <p style={{ fontSize: 10, color: '#9CA3AF', margin: '0 0 3px 10px', fontWeight: 600 }}>
                          {msg.responder_name}
                        </p>
                      )}
                      <div style={{
                        maxWidth: '72%', padding: '9px 13px',
                        borderRadius: isMine ? '16px 16px 4px 16px' : '4px 16px 16px 16px',
                        background: isMine ? '#DE1A1A' : '#F3F4F6',
                        color: isMine ? '#fff' : '#111111',
                        fontSize: 13, lineHeight: 1.45, wordBreak: 'break-word',
                      }}>
                        {renderMessage(msg.message)}
                      </div>
                      <p style={{ fontSize: 9, color: '#9CA3AF', margin: '3px 3px 0', textAlign: isMine ? 'right' : 'left' }}>
                        {formatTime(msg.created_at)}
                      </p>
                    </div>
                  )
                })}

                {selectedTicket.status === 'resolved' && (
                  <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8, padding: '16px 0 8px' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '8px 18px', borderRadius: 99, background: '#DCFCE7', border: '1px solid rgba(21,128,61,0.2)' }}>
                      <CheckCircle size={13} color="#15803D" />
                      <span style={{ fontSize: 12, fontWeight: 700, color: '#15803D' }}>Ticket Resolved</span>
                    </div>
                    <p style={{ fontSize: 11, color: '#9CA3AF', margin: 0 }}>The support team has resolved your ticket.</p>
                    <button
                      onClick={() => setCloseConfirm(selectedTicket.id)}
                      style={{ padding: '7px 18px', borderRadius: 10, border: '1.5px solid #E5E7EB', background: 'transparent', color: '#6B7280', fontSize: 12, fontWeight: 600, cursor: 'pointer' }}
                    >
                      Close Ticket
                    </button>
                  </div>
                )}

                {selectedTicket.status === 'closed' && (
                  <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6, padding: '20px 0 12px' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '8px 18px', borderRadius: 99, background: '#F3F4F6', border: '1px solid #E5E7EB' }}>
                      <XCircle size={13} color="#6B7280" />
                      <span style={{ fontSize: 12, fontWeight: 700, color: '#6B7280' }}>Ticket Closed</span>
                    </div>
                    <p style={{ fontSize: 11, color: '#9CA3AF', margin: 0 }}>This ticket has been closed. Raise a new ticket if you need further help.</p>
                  </div>
                )}

                <div ref={bottomRef} />
              </div>

              {/* Input */}
              {isActive && (
                <div style={{ padding: '10px 18px 16px', borderTop: '1px solid #F3F4F6' }}>
                  <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                    <input ref={fileInputRef} type="file" accept="image/*" style={{ display: 'none' }} onChange={handleFileSelect} />
                    <button
                      onClick={() => fileInputRef.current?.click()}
                      disabled={isUploading || isPending}
                      style={{ width: 36, height: 36, borderRadius: 10, border: '1px solid #E5E7EB', background: '#F9FAFB', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', flexShrink: 0 }}
                    >
                      {isUploading ? <Loader2 size={14} color="#9CA3AF" className="animate-spin" /> : <Paperclip size={14} color="#9CA3AF" />}
                    </button>
                    <input
                      value={message}
                      onChange={e => setMessage(e.target.value)}
                      onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSend() } }}
                      placeholder="Type a message…"
                      disabled={isPending || isUploading}
                      style={{ flex: 1, padding: '10px 14px', borderRadius: 12, background: '#F9FAFB', border: '1px solid #E5E7EB', fontSize: 13, color: '#111111', outline: 'none', fontFamily: 'inherit' }}
                    />
                    <button
                      onClick={handleSend}
                      disabled={isPending || isUploading || !message.trim()}
                      style={{ padding: '10px 16px', borderRadius: 12, background: message.trim() && !isPending && !isUploading ? 'linear-gradient(135deg,#DE1A1A,#7F1D1D)' : '#F3F4F6', color: message.trim() && !isPending && !isUploading ? '#fff' : '#9CA3AF', border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 5, fontSize: 13, fontWeight: 600, flexShrink: 0, boxShadow: message.trim() && !isPending && !isUploading ? '0 4px 12px rgba(222,26,26,0.3)' : 'none' }}
                    >
                      {isPending ? <Loader2 size={13} className="animate-spin" /> : <Send size={13} />} Send
                    </button>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      {showRaise && (
        <RaiseTicketModal
          onClose={() => setShowRaise(false)}
          onSuccess={() => { setShowRaise(false); router.refresh() }}
        />
      )}

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
