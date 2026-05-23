'use client'

import { useState, useEffect, useRef, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { createBrowserClient } from '@/lib/supabase/client'
import { createTicket, addResponse } from '@/lib/actions/support'
import { ArrowLeft, Send, Loader2 } from 'lucide-react'

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
  support_responses: Response[]
}

const CATEGORIES = [
  { key: 'technical', label: 'Technical Issues',       color: '#8B5CF6', emoji: '⚙️' },
  { key: 'payroll',   label: 'Payroll Requests',       color: '#F59E0B', emoji: '💰' },
  { key: 'leave',     label: 'Attendance Corrections', color: '#10B981', emoji: '📅' },
  { key: 'general',   label: 'Client Support',         color: '#3B82F6', emoji: '🤝' },
  { key: 'hr',        label: 'HR Helpdesk',            color: '#EC4899', emoji: '👥' },
  { key: 'other',     label: 'Escalated Issues',       color: '#EF4444', emoji: '🚨' },
]

const STATUS_CONFIG: Record<string, { bg: string; color: string; label: string }> = {
  open:        { bg: '#FEE2E2', color: '#DE1A1A', label: 'Open' },
  in_progress: { bg: '#FEF3C7', color: '#D97706', label: 'In Progress' },
  resolved:    { bg: '#DCFCE7', color: '#15803D', label: 'Resolved' },
  closed:      { bg: '#F3F4F6', color: '#6B7280', label: 'Closed' },
}

function formatTime(s: string) {
  return new Date(s).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' })
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
  const [activeCategory, setActiveCategory] = useState<string | null>(null)
  const [realtimeMsgs, setRealtimeMsgs] = useState<Record<string, Response[]>>({})
  const [message, setMessage] = useState('')
  const [isPending, startTransition] = useTransition()
  const bottomRef = useRef<HTMLDivElement>(null)

  const catDef = CATEGORIES.find(c => c.key === activeCategory)
  const activeTicket = activeCategory
    ? initialTickets.find(
        t => t.category === activeCategory && ['open', 'in_progress'].includes(t.status)
      ) ?? null
    : null

  // Combine server-fetched responses with real-time appended ones, deduplicated
  const allResponses: Response[] = activeTicket
    ? [
        ...activeTicket.support_responses,
        ...(realtimeMsgs[activeTicket.id] ?? []),
      ].filter((r, i, arr) => arr.findIndex(x => x.id === r.id) === i)
    : []

  // Build full message list: initial description bubble + all responses
  const messages = activeTicket
    ? [
        {
          id: 'initial',
          responder_id: currentUserId,
          responder_name: 'You',
          message: activeTicket.description,
          created_at: activeTicket.created_at,
        } as Response,
        ...allResponses,
      ]
    : []

  // Scroll to bottom whenever message count changes
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages.length])

  // Real-time subscription — resets when active ticket changes
  useEffect(() => {
    if (!activeTicket) return
    const ticketId = activeTicket.id
    const channel = supabase
      .channel(`member-support-${ticketId}`)
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
            [ticketId]: [...(prev[ticketId] ?? []), payload.new as Response],
          }))
        }
      )
      .subscribe()
    return () => { supabase.removeChannel(channel) }
  }, [activeTicket?.id])

  function hasUnread(catKey: string) {
    const t = initialTickets.find(
      t => t.category === catKey && ['open', 'in_progress'].includes(t.status)
    )
    if (!t) return false
    const responses = [
      ...t.support_responses,
      ...(realtimeMsgs[t.id] ?? []),
    ]
    if (responses.length === 0) return false
    return responses[responses.length - 1].responder_id !== currentUserId
  }

  function handleSend() {
    const msg = message.trim()
    if (!msg || isPending) return
    setMessage('')
    startTransition(async () => {
      if (!activeTicket) {
        // First message — create the ticket. Description IS the first bubble.
        await createTicket({
          title: catDef?.label ?? activeCategory!,
          category: activeCategory!,
          description: msg,
          priority: 'normal',
        })
        router.refresh()
      } else {
        await addResponse({ ticket_id: activeTicket.id, message: msg })
      }
    })
  }

  // ── CHAT VIEW ────────────────────────────────────────────────────────────────
  if (activeCategory) {
    const status = activeTicket?.status ?? 'open'
    const sc = STATUS_CONFIG[status] ?? STATUS_CONFIG.open

    return (
      <div style={{ display: 'flex', flexDirection: 'column', height: '100dvh', background: '#F8F9FC' }}>

        {/* Header */}
        <div style={{
          display: 'flex', alignItems: 'center', gap: 12,
          padding: '14px 16px', background: '#fff',
          borderBottom: '1px solid #EBEDF2', flexShrink: 0,
        }}>
          <button
            onClick={() => setActiveCategory(null)}
            style={{
              width: 34, height: 34, borderRadius: '50%',
              border: '1px solid #E5E7EB', background: '#F9FAFB',
              display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer',
            }}
          >
            <ArrowLeft size={16} color="#374151" />
          </button>
          <div style={{ flex: 1, minWidth: 0 }}>
            <p style={{ fontSize: 15, fontWeight: 800, color: '#111111', margin: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {catDef?.label}
            </p>
            <p style={{ fontSize: 11, color: '#9CA3AF', margin: 0 }}>Media &amp; Tech Team</p>
          </div>
          {activeTicket && (
            <span style={{
              padding: '4px 10px', borderRadius: 99,
              fontSize: 11, fontWeight: 700,
              background: sc.bg, color: sc.color, flexShrink: 0,
            }}>
              {sc.label}
            </span>
          )}
        </div>

        {/* Message list */}
        <div style={{ flex: 1, overflowY: 'auto', padding: '16px 16px 8px' }}>
          {messages.length === 0 ? (
            <div style={{
              display: 'flex', flexDirection: 'column',
              alignItems: 'center', justifyContent: 'center',
              height: '100%', gap: 8,
            }}>
              <div style={{ fontSize: 40 }}>{catDef?.emoji}</div>
              <p style={{ fontSize: 15, fontWeight: 700, color: '#111111', margin: 0 }}>No conversation yet</p>
              <p style={{ fontSize: 13, color: '#9CA3AF', margin: 0, textAlign: 'center' }}>
                Send your first message to start
              </p>
            </div>
          ) : (
            messages.map((msg) => {
              const isMine = msg.responder_id === currentUserId
              return (
                <div key={msg.id} style={{
                  display: 'flex', flexDirection: 'column',
                  alignItems: isMine ? 'flex-end' : 'flex-start',
                  marginBottom: 12,
                }}>
                  {!isMine && (
                    <p style={{ fontSize: 11, color: '#9CA3AF', margin: '0 0 4px 12px', fontWeight: 600 }}>
                      {msg.responder_name}
                    </p>
                  )}
                  <div style={{
                    maxWidth: '75%',
                    padding: '10px 14px',
                    borderRadius: isMine ? '18px 18px 4px 18px' : '18px 18px 18px 4px',
                    background: isMine ? '#DE1A1A' : '#F3F4F6',
                    color: isMine ? '#FFFFFF' : '#111111',
                    fontSize: 14,
                    lineHeight: 1.45,
                    wordBreak: 'break-word',
                  }}>
                    {msg.message}
                  </div>
                  <p style={{
                    fontSize: 10, color: '#9CA3AF',
                    margin: '4px 4px 0',
                    textAlign: isMine ? 'right' : 'left',
                  }}>
                    {formatTime(msg.created_at)}
                  </p>
                </div>
              )
            })
          )}
          <div ref={bottomRef} />
        </div>

        {/* Input bar */}
        <div style={{
          padding: '10px 16px 20px', background: '#fff',
          borderTop: '1px solid #EBEDF2', flexShrink: 0,
        }}>
          <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
            <input
              value={message}
              onChange={e => setMessage(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSend() } }}
              placeholder="Type a message…"
              disabled={isPending}
              style={{
                flex: 1, padding: '12px 16px', borderRadius: 24,
                background: '#F3F4F6', border: 'none',
                fontSize: 14, color: '#111111', outline: 'none', fontFamily: 'inherit',
              }}
            />
            <button
              onClick={handleSend}
              disabled={isPending || !message.trim()}
              style={{
                width: 44, height: 44, borderRadius: '50%', border: 'none',
                background: message.trim() && !isPending ? '#DE1A1A' : '#F3F4F6',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                cursor: message.trim() && !isPending ? 'pointer' : 'not-allowed',
                flexShrink: 0, transition: 'background 0.15s',
              }}
            >
              {isPending
                ? <Loader2 size={18} color="#9CA3AF" className="animate-spin" />
                : <Send size={18} color={message.trim() ? '#FFFFFF' : '#9CA3AF'} />
              }
            </button>
          </div>
        </div>
      </div>
    )
  }

  // ── CATEGORY GRID ────────────────────────────────────────────────────────────
  return (
    <div style={{ background: '#F8F9FC', minHeight: '100vh' }}>

      {/* Topbar */}
      <div style={{ background: '#fff', borderBottom: '1px solid #EBEDF2', padding: '16px 20px' }}>
        <h1 style={{ fontSize: 24, fontWeight: 900, color: '#111111', margin: 0 }}>Support</h1>
        <p style={{ fontSize: 12, color: '#9CA3AF', margin: '3px 0 0' }}>
          Tap a topic to chat with the Media &amp; Tech team
        </p>
      </div>

      {/* Category cards */}
      <div style={{
        padding: '20px 16px 40px',
        display: 'grid',
        gridTemplateColumns: '1fr 1fr',
        gap: 12,
      }}>
        {CATEGORIES.map(cat => {
          const ticket = initialTickets.find(
            t => t.category === cat.key && ['open', 'in_progress'].includes(t.status)
          )
          const unread = hasUnread(cat.key)
          const sc = ticket ? STATUS_CONFIG[ticket.status] : null

          return (
            <button
              key={cat.key}
              onClick={() => setActiveCategory(cat.key)}
              style={{
                background: '#FFFFFF',
                borderRadius: 20,
                border: `1.5px solid ${unread ? cat.color : '#EBEDF2'}`,
                padding: '18px 16px',
                textAlign: 'left',
                cursor: 'pointer',
                position: 'relative',
                boxShadow: '0 2px 10px rgba(0,0,0,0.05)',
                transition: 'all 0.15s',
              }}
            >
              {unread && (
                <div style={{
                  position: 'absolute', top: 12, right: 12,
                  width: 10, height: 10, borderRadius: '50%',
                  background: '#DE1A1A', border: '2px solid #fff',
                }} />
              )}
              <div style={{ fontSize: 28, marginBottom: 10 }}>{cat.emoji}</div>
              <p style={{ fontSize: 13, fontWeight: 800, color: '#111111', margin: '0 0 6px' }}>
                {cat.label}
              </p>
              {sc ? (
                <span style={{
                  display: 'inline-block', padding: '2px 8px',
                  borderRadius: 99, fontSize: 10, fontWeight: 700,
                  background: sc.bg, color: sc.color,
                }}>
                  {sc.label}
                </span>
              ) : (
                <p style={{ fontSize: 11, color: '#9CA3AF', margin: 0 }}>No active thread</p>
              )}
            </button>
          )
        })}
      </div>
    </div>
  )
}
