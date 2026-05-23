'use client'

import { useState, useEffect, useRef, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { createBrowserClient } from '@/lib/supabase/client'
import { createTicket, addResponse, closeTicket } from '@/lib/actions/support'
import { ArrowLeft, Send, Loader2, Plus, MessageCircle, XCircle, Paperclip, CheckCircle } from 'lucide-react'

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

const STATUS_CONFIG: Record<string, { bg: string; color: string; label: string }> = {
  open:        { bg: '#FEE2E2', color: '#DE1A1A', label: 'Open' },
  in_progress: { bg: '#FEF3C7', color: '#D97706', label: 'In Progress' },
  resolved:    { bg: '#DCFCE7', color: '#15803D', label: 'Resolved' },
  closed:      { bg: '#F3F4F6', color: '#6B7280', label: 'Closed' },
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
      <div
        style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.4)', zIndex: 40 }}
        onClick={onCancel}
      />
      <div style={{
        position: 'fixed', bottom: 0, left: 0, right: 0, zIndex: 50,
        background: '#fff', borderRadius: '24px 24px 0 0', padding: '24px 20px 36px',
      }}>
        <div style={{ width: 40, height: 4, borderRadius: 99, background: '#E5E7EB', margin: '0 auto 20px' }} />
        <h3 style={{ fontSize: 17, fontWeight: 800, color: '#111111', margin: '0 0 8px' }}>Close Ticket?</h3>
        <p style={{ fontSize: 13, color: '#6B7280', margin: '0 0 20px', lineHeight: 1.5 }}>
          Are you sure you want to close this ticket? You won&apos;t be able to send further messages.
        </p>
        <div style={{ display: 'flex', gap: 10 }}>
          <button
            onClick={onCancel}
            style={{ flex: 1, padding: '12px', borderRadius: 14, border: '1px solid #E5E7EB', background: '#F9FAFB', fontSize: 14, fontWeight: 600, color: '#6B7280', cursor: 'pointer' }}
          >
            Cancel
          </button>
          <button
            onClick={onConfirm}
            disabled={isPending}
            style={{ flex: 1, padding: '12px', borderRadius: 14, border: 'none', background: '#DE1A1A', fontSize: 14, fontWeight: 700, color: '#fff', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6, opacity: isPending ? 0.7 : 1 }}
          >
            {isPending && <Loader2 size={14} className="animate-spin" />}
            Close Ticket
          </button>
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

  const [view, setView] = useState<'home' | 'raise' | 'chat'>('home')
  const [raiseStep, setRaiseStep] = useState<'category' | 'problem'>('category')
  const [raiseCategory, setRaiseCategory] = useState<string | null>(null)
  const [raiseProblem, setRaiseProblem] = useState<string | null>(null)
  const [raiseCustomText, setRaiseCustomText] = useState('')
  const [chatTicket, setChatTicket] = useState<Ticket | null>(null)
  const [closeConfirm, setCloseConfirm] = useState<string | null>(null)
  const [message, setMessage] = useState('')
  const [isPending, startTransition] = useTransition()
  const [isClosePending, startCloseTransition] = useTransition()
  const [realtimeMsgs, setRealtimeMsgs] = useState<Record<string, Response[]>>({})
  const [isUploading, setIsUploading] = useState(false)
  const bottomRef = useRef<HTMLDivElement>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)

  const allMessages: Response[] = chatTicket
    ? [
        { id: 'initial', responder_id: currentUserId, responder_name: 'You', message: chatTicket.description, created_at: chatTicket.created_at },
        ...[...chatTicket.support_responses, ...(realtimeMsgs[chatTicket.id] ?? [])]
          .filter((r, i, arr) => arr.findIndex(x => x.id === r.id) === i),
      ]
    : []

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [allMessages.length])

  useEffect(() => {
    if (view !== 'chat' || !chatTicket) return
    const ticketId = chatTicket.id
    const channel = supabase
      .channel(`member-support-v2-${ticketId}`)
      .on('postgres_changes', {
        event: 'INSERT',
        schema: 'public',
        table: 'support_responses',
        filter: `ticket_id=eq.${ticketId}`,
      }, (payload) => {
        setRealtimeMsgs(prev => ({
          ...prev,
          [ticketId]: [...(prev[ticketId] ?? []), payload.new as Response],
        }))
      })
      .subscribe()
    return () => { supabase.removeChannel(channel) }
  }, [chatTicket?.id, view])

  function handleSend() {
    const msg = message.trim()
    if (!msg || isPending || !chatTicket) return
    setMessage('')
    startTransition(async () => {
      await addResponse({ ticket_id: chatTicket.id, message: msg })
    })
  }

  function handleRaiseTicket() {
    if (!raiseCategory || !raiseProblem) return
    if (raiseProblem === 'Other' && !raiseCustomText.trim()) return
    const title = raiseProblem === 'Other' ? raiseCustomText.trim() : raiseProblem
    startTransition(async () => {
      await createTicket({ title, category: raiseCategory, description: title, priority: 'normal' })
      router.refresh()
      setView('home')
      setRaiseStep('category')
      setRaiseCategory(null)
      setRaiseProblem(null)
      setRaiseCustomText('')
    })
  }

  function handleCloseTicket(ticketId: string) {
    startCloseTransition(async () => {
      await closeTicket(ticketId)
      setCloseConfirm(null)
      if (view === 'chat') setView('home')
      router.refresh()
    })
  }

  async function handleFileSelect(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file || !chatTicket) return
    if (file.size > 5 * 1024 * 1024) { alert('Max file size is 5 MB'); return }
    setIsUploading(true)
    try {
      const ext = file.name.split('.').pop() ?? 'jpg'
      const path = `${chatTicket.id}/${Date.now()}.${ext}`
      const { data, error } = await supabase.storage.from('support-attachments').upload(path, file)
      if (error || !data) { console.error(error); return }
      const { data: { publicUrl } } = supabase.storage.from('support-attachments').getPublicUrl(data.path)
      await addResponse({ ticket_id: chatTicket.id, message: `[img]${publicUrl}` })
    } finally {
      setIsUploading(false)
      if (fileInputRef.current) fileInputRef.current.value = ''
    }
  }

  // ── CHAT VIEW ────────────────────────────────────────────────────────
  if (view === 'chat' && chatTicket) {
    const sc = STATUS_CONFIG[chatTicket.status] ?? STATUS_CONFIG.open
    const canClose = ['open', 'in_progress'].includes(chatTicket.status)

    return (
      <div style={{ display: 'flex', flexDirection: 'column', height: '100dvh', background: '#F8F9FC' }}>

        {/* Header */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '14px 16px', background: '#fff', borderBottom: '1px solid #EBEDF2', flexShrink: 0 }}>
          <button
            onClick={() => { setView('home'); setChatTicket(null) }}
            style={{ width: 34, height: 34, borderRadius: '50%', border: '1px solid #E5E7EB', background: '#F9FAFB', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer' }}
          >
            <ArrowLeft size={16} color="#374151" />
          </button>
          <div style={{ flex: 1, minWidth: 0 }}>
            <p style={{ fontSize: 15, fontWeight: 800, color: '#111111', margin: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {chatTicket.title}
            </p>
            <p style={{ fontSize: 11, color: '#9CA3AF', margin: 0 }}>Media &amp; Tech Team</p>
          </div>
          <span style={{ padding: '4px 10px', borderRadius: 99, fontSize: 11, fontWeight: 700, background: sc.bg, color: sc.color, flexShrink: 0 }}>
            {sc.label}
          </span>
          {canClose && (
            <button
              onClick={() => setCloseConfirm(chatTicket.id)}
              style={{ padding: '6px 12px', borderRadius: 8, border: '1px solid #E5E7EB', background: '#F9FAFB', fontSize: 11, fontWeight: 600, color: '#6B7280', cursor: 'pointer', flexShrink: 0 }}
            >
              Close
            </button>
          )}
        </div>

        {/* Messages */}
        <div style={{ flex: 1, overflowY: 'auto', padding: '16px 16px 8px' }}>
          {allMessages.map((msg) => {
            const isMine = msg.responder_id === currentUserId
            return (
              <div key={msg.id} style={{ display: 'flex', flexDirection: 'column', alignItems: isMine ? 'flex-end' : 'flex-start', marginBottom: 12 }}>
                {!isMine && (
                  <p style={{ fontSize: 11, color: '#9CA3AF', margin: '0 0 4px 12px', fontWeight: 600 }}>
                    {msg.responder_name}
                  </p>
                )}
                <div style={{
                  maxWidth: '75%', padding: '10px 14px',
                  borderRadius: isMine ? '18px 18px 4px 18px' : '18px 18px 18px 4px',
                  background: isMine ? '#DE1A1A' : '#F3F4F6',
                  color: isMine ? '#FFFFFF' : '#111111',
                  fontSize: 14, lineHeight: 1.45, wordBreak: 'break-word',
                }}>
                  {renderMessage(msg.message)}
                </div>
                <p style={{ fontSize: 10, color: '#9CA3AF', margin: '4px 4px 0', textAlign: isMine ? 'right' : 'left' }}>
                  {formatTime(msg.created_at)}
                </p>
              </div>
            )
          })}
          {chatTicket.status === 'resolved' && (
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 10, padding: '20px 0 8px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '10px 20px', borderRadius: 99, background: '#DCFCE7', border: '1px solid rgba(21,128,61,0.2)' }}>
                <CheckCircle size={14} color="#15803D" />
                <span style={{ fontSize: 13, fontWeight: 700, color: '#15803D' }}>Ticket Resolved</span>
              </div>
              <p style={{ fontSize: 12, color: '#9CA3AF', margin: 0, textAlign: 'center' }}>
                The support team has resolved your ticket.
              </p>
              <button
                onClick={() => setCloseConfirm(chatTicket.id)}
                style={{ padding: '8px 20px', borderRadius: 10, border: '1.5px solid #E5E7EB', background: 'transparent', color: '#6B7280', fontSize: 13, fontWeight: 600, cursor: 'pointer' }}
              >
                Close Ticket
              </button>
            </div>
          )}
          <div ref={bottomRef} />
        </div>

        {/* Input bar — only shown when ticket is open/in_progress */}
        {canClose && (
          <div style={{ padding: '10px 16px 20px', background: '#fff', borderTop: '1px solid #EBEDF2', flexShrink: 0 }}>
            <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
              <input
                ref={fileInputRef}
                type="file"
                accept="image/*"
                style={{ display: 'none' }}
                onChange={handleFileSelect}
              />
              <button
                onClick={() => fileInputRef.current?.click()}
                disabled={isUploading || isPending}
                style={{ width: 38, height: 38, borderRadius: '50%', border: '1px solid #E5E7EB', background: '#F9FAFB', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', flexShrink: 0 }}
              >
                {isUploading
                  ? <Loader2 size={16} color="#9CA3AF" className="animate-spin" />
                  : <Paperclip size={16} color="#9CA3AF" />
                }
              </button>
              <input
                value={message}
                onChange={e => setMessage(e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSend() } }}
                placeholder="Type a message…"
                disabled={isPending || isUploading}
                style={{ flex: 1, padding: '12px 16px', borderRadius: 24, background: '#F3F4F6', border: 'none', fontSize: 14, color: '#111111', outline: 'none', fontFamily: 'inherit' }}
              />
              <button
                onClick={handleSend}
                disabled={isPending || isUploading || !message.trim()}
                style={{ width: 44, height: 44, borderRadius: '50%', border: 'none', background: message.trim() && !isPending && !isUploading ? '#DE1A1A' : '#F3F4F6', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: message.trim() && !isPending && !isUploading ? 'pointer' : 'not-allowed', flexShrink: 0 }}
              >
                {isPending
                  ? <Loader2 size={18} color="#9CA3AF" className="animate-spin" />
                  : <Send size={18} color={message.trim() && !isUploading ? '#FFFFFF' : '#9CA3AF'} />
                }
              </button>
            </div>
          </div>
        )}

        {closeConfirm && (
          <CloseDialog
            onConfirm={() => handleCloseTicket(closeConfirm)}
            onCancel={() => setCloseConfirm(null)}
            isPending={isClosePending}
          />
        )}
      </div>
    )
  }

  // ── RAISE TICKET VIEW ────────────────────────────────────────────────
  if (view === 'raise') {
    const catDef = CATEGORIES.find(c => c.key === raiseCategory)
    const problems = raiseCategory ? PROBLEM_MAP[raiseCategory] ?? [] : []
    const submitDisabled = isPending || !raiseProblem || (raiseProblem === 'Other' && !raiseCustomText.trim())

    return (
      <div style={{ background: '#F8F9FC', minHeight: '100vh' }}>

        {/* Header */}
        <div style={{ background: '#fff', borderBottom: '1px solid #EBEDF2', padding: '14px 16px', display: 'flex', alignItems: 'center', gap: 12 }}>
          <button
            onClick={() => {
              if (raiseStep === 'problem') { setRaiseStep('category'); setRaiseCategory(null); setRaiseProblem(null); setRaiseCustomText('') }
              else { setView('home') }
            }}
            style={{ width: 34, height: 34, borderRadius: '50%', border: '1px solid #E5E7EB', background: '#F9FAFB', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer' }}
          >
            <ArrowLeft size={16} color="#374151" />
          </button>
          <div>
            <p style={{ fontSize: 16, fontWeight: 800, color: '#111111', margin: 0 }}>Raise a Ticket</p>
            <p style={{ fontSize: 11, color: '#9CA3AF', margin: 0 }}>
              {raiseStep === 'category' ? 'Select a category' : `${catDef?.emoji ?? ''} ${catDef?.label ?? ''}`}
            </p>
          </div>
        </div>

        <div style={{ padding: '20px 16px 40px' }}>
          {raiseStep === 'category' ? (
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
              {CATEGORIES.map(cat => (
                <button
                  key={cat.key}
                  onClick={() => { setRaiseCategory(cat.key); setRaiseStep('problem') }}
                  style={{ background: '#fff', borderRadius: 20, border: '1.5px solid #EBEDF2', padding: '18px 16px', textAlign: 'left', cursor: 'pointer', boxShadow: '0 2px 10px rgba(0,0,0,0.05)', transition: 'border-color 0.15s' }}
                >
                  <div style={{ fontSize: 28, marginBottom: 10 }}>{cat.emoji}</div>
                  <p style={{ fontSize: 13, fontWeight: 800, color: '#111111', margin: 0 }}>{cat.label}</p>
                </button>
              ))}
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              {problems.map(problem => (
                <button
                  key={problem}
                  onClick={() => { setRaiseProblem(problem); if (problem !== 'Other') setRaiseCustomText('') }}
                  style={{ background: '#fff', borderRadius: 16, border: `2px solid ${raiseProblem === problem ? '#DE1A1A' : '#EBEDF2'}`, padding: '14px 16px', textAlign: 'left', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 12 }}
                >
                  <div style={{ width: 20, height: 20, borderRadius: '50%', border: `2px solid ${raiseProblem === problem ? '#DE1A1A' : '#D1D5DB'}`, background: raiseProblem === problem ? '#DE1A1A' : 'transparent', flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                    {raiseProblem === problem && <div style={{ width: 8, height: 8, borderRadius: '50%', background: '#fff' }} />}
                  </div>
                  <span style={{ fontSize: 14, fontWeight: 600, color: '#111111' }}>{problem}</span>
                </button>
              ))}

              {raiseProblem === 'Other' && (
                <div style={{ marginTop: 4 }}>
                  <textarea
                    value={raiseCustomText}
                    onChange={e => setRaiseCustomText(e.target.value.slice(0, 300))}
                    placeholder="Describe your problem…"
                    rows={4}
                    style={{ width: '100%', padding: '12px 16px', borderRadius: 16, border: '1.5px solid #EBEDF2', background: '#fff', fontSize: 14, color: '#111111', resize: 'none', outline: 'none', fontFamily: 'inherit', boxSizing: 'border-box' }}
                  />
                  <p style={{ fontSize: 11, color: '#9CA3AF', margin: '4px 0 0', textAlign: 'right' }}>{raiseCustomText.length}/300</p>
                </div>
              )}

              <button
                onClick={handleRaiseTicket}
                disabled={submitDisabled}
                style={{ marginTop: 8, width: '100%', padding: '14px', borderRadius: 16, border: 'none', background: submitDisabled ? '#F3F4F6' : '#DE1A1A', color: submitDisabled ? '#9CA3AF' : '#fff', fontSize: 15, fontWeight: 700, cursor: submitDisabled ? 'not-allowed' : 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8 }}
              >
                {isPending && <Loader2 size={16} className="animate-spin" />}
                Raise Ticket
              </button>
            </div>
          )}
        </div>
      </div>
    )
  }

  // ── HOME VIEW ────────────────────────────────────────────────────────
  const sorted = [...initialTickets].sort((a, b) => new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime())

  return (
    <div style={{ background: '#F8F9FC', minHeight: '100vh' }}>

      {/* Header */}
      <div style={{ background: '#fff', borderBottom: '1px solid #EBEDF2', padding: '16px 20px' }}>
        <h1 style={{ fontSize: 24, fontWeight: 900, color: '#111111', margin: 0 }}>Support</h1>
        <p style={{ fontSize: 12, color: '#9CA3AF', margin: '3px 0 0' }}>Get help from the Media &amp; Tech team</p>
      </div>

      <div style={{ padding: '16px 16px 40px' }}>

        {/* Raise a Ticket CTA */}
        <button
          onClick={() => setView('raise')}
          style={{ width: '100%', padding: '14px', borderRadius: 16, border: 'none', background: '#DE1A1A', color: '#fff', fontSize: 15, fontWeight: 700, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, marginBottom: 20, boxShadow: '0 4px 16px rgba(222,26,26,0.3)' }}
        >
          <Plus size={18} /> Raise a Ticket
        </button>

        {/* Ticket list */}
        {sorted.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '60px 20px' }}>
            <div style={{ fontSize: 48, marginBottom: 12 }}>🎉</div>
            <p style={{ fontSize: 15, fontWeight: 700, color: '#111111', margin: '0 0 6px' }}>No tickets yet</p>
            <p style={{ fontSize: 13, color: '#9CA3AF', margin: 0 }}>Raise your first ticket when you need help.</p>
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {sorted.map(ticket => {
              const cat = CATEGORIES.find(c => c.key === ticket.category)
              const sc = STATUS_CONFIG[ticket.status] ?? STATUS_CONFIG.closed
              const isActive = ['open', 'in_progress'].includes(ticket.status)
              return (
                <div key={ticket.id} style={{ background: '#fff', borderRadius: 18, border: '1px solid #EBEDF2', padding: '14px 16px', boxShadow: '0 2px 8px rgba(0,0,0,0.04)' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 6 }}>
                    <span style={{ fontSize: 22 }}>{cat?.emoji ?? '📋'}</span>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <p style={{ fontSize: 13, fontWeight: 700, color: '#111111', margin: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{ticket.title}</p>
                      <p style={{ fontSize: 11, color: '#9CA3AF', margin: '2px 0 0' }}>{cat?.label ?? ticket.category}</p>
                    </div>
                    <span style={{ padding: '4px 10px', borderRadius: 99, fontSize: 11, fontWeight: 700, background: sc.bg, color: sc.color, flexShrink: 0 }}>{sc.label}</span>
                  </div>
                  <p style={{ fontSize: 11, color: '#9CA3AF', margin: '0 0 10px' }}>Updated {timeAgo(ticket.updated_at)}</p>
                  {isActive && (
                    <div style={{ display: 'flex', gap: 8 }}>
                      <button
                        onClick={() => { setChatTicket(ticket); setView('chat') }}
                        style={{ flex: 1, padding: '9px', borderRadius: 10, border: '1.5px solid #DE1A1A', background: 'transparent', color: '#DE1A1A', fontSize: 13, fontWeight: 700, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 5 }}
                      >
                        <MessageCircle size={14} /> Open Chat
                      </button>
                      <button
                        onClick={() => setCloseConfirm(ticket.id)}
                        style={{ flex: 1, padding: '9px', borderRadius: 10, border: '1.5px solid #E5E7EB', background: 'transparent', color: '#6B7280', fontSize: 13, fontWeight: 600, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 5 }}
                      >
                        <XCircle size={14} /> Close Ticket
                      </button>
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        )}
      </div>

      {closeConfirm && (
        <CloseDialog
          onConfirm={() => handleCloseTicket(closeConfirm)}
          onCancel={() => setCloseConfirm(null)}
          isPending={isClosePending}
        />
      )}
    </div>
  )
}
