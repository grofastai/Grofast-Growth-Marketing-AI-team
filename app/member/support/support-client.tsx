'use client'

import { useState, useRef, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { createBrowserClient } from '@/lib/supabase/client'
import { createTicket, addResponse, closeTicket } from '@/lib/actions/support'
import { LifeBuoy, Plus, ChevronDown, ChevronUp, Send, Loader2, X, CheckCircle2, AlertCircle, Clock, XCircle, Paperclip } from 'lucide-react'

type Response = { id: string; responder_name: string; message: string; created_at: string }
type Ticket = {
  id: string
  title: string
  category: string
  description: string
  status: string
  priority: string
  created_at: string
  support_responses: Response[]
}

const REQUEST_TYPES = [
  { key: 'attendance',  label: 'Attendance',   emoji: '📅' },
  { key: 'leave',       label: 'Leave',         emoji: '🌴' },
  { key: 'task',        label: 'Task',          emoji: '✅' },
  { key: 'client',      label: 'Client',        emoji: '🤝' },
  { key: 'payment',     label: 'Payment',       emoji: '💰' },
  { key: 'freelancer',  label: 'Freelancer',    emoji: '👷' },
  { key: 'design',      label: 'Design',        emoji: '🎨' },
  { key: 'video',       label: 'Video Editing', emoji: '🎬' },
  { key: 'marketing',   label: 'Marketing',     emoji: '📢' },
  { key: 'automation',  label: 'Automation',    emoji: '🤖' },
  { key: 'other',       label: 'Other',         emoji: '📋' },
]

const PRIORITY_OPTIONS = ['low', 'medium', 'high', 'urgent']

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
  closed:      '#83858c',
}
const STATUS_ICON: Record<string, React.ReactNode> = {
  open:        <AlertCircle size={12} />,
  in_progress: <Clock size={12} />,
  resolved:    <CheckCircle2 size={12} />,
  closed:      <XCircle size={12} />,
}

function renderMessage(msg: string) {
  if (msg.startsWith('[img]')) {
    return (
      <img src={msg.slice(5)} alt="attachment"
        style={{ maxWidth: '100%', borderRadius: 10, display: 'block', cursor: 'pointer' }}
        onClick={() => window.open(msg.slice(5), '_blank')} />
    )
  }
  return <>{msg}</>
}

export default function MemberSupportClient({ tickets }: { tickets: Ticket[]; currentUserId?: string }) {
  const router = useRouter()
  const supabase = createBrowserClient()
  const fileRef = useRef<HTMLInputElement>(null)

  const [showForm,    setShowForm]    = useState(false)
  const [category,   setCategory]    = useState('')
  const [priority,   setPriority]    = useState('medium')
  const [description,setDescription] = useState('')
  const [formError,  setFormError]   = useState('')
  const [pendingFile,setPendingFile] = useState<File | null>(null)
  const [previewUrl, setPreviewUrl]  = useState<string | null>(null)

  const [expanded,   setExpanded]    = useState<string | null>(null)
  const [replyText,  setReplyText]   = useState<Record<string, string>>({})
  const [closingId,  setClosingId]   = useState<string | null>(null)

  const [pending, startTransition] = useTransition()
  const [actionId, setActionId]    = useState<string | null>(null)

  function handleFileSelect(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    if (file.size > 5 * 1024 * 1024) { setFormError('Max file size is 5 MB'); return }
    const allowed = ['image/jpeg', 'image/jpg', 'image/png', 'image/webp']
    if (!allowed.includes(file.type)) { setFormError('Only JPG, PNG, WEBP images are supported'); return }
    setFormError('')
    setPendingFile(file)
    setPreviewUrl(URL.createObjectURL(file))
  }

  function handleCreate() {
    if (!category)           { setFormError('Please select a request type'); return }
    if (!description.trim()) { setFormError('Description is required'); return }
    setFormError('')
    const selectedType = REQUEST_TYPES.find(r => r.key === category)
    const title = `${selectedType?.label ?? category}: ${description.trim().slice(0, 60)}`
    setActionId('create')
    startTransition(async () => {
      let imageUrl: string | undefined
      if (pendingFile) {
        const ext  = pendingFile.name.split('.').pop()
        const path = `support/${Date.now()}.${ext}`
        const { data: up } = await supabase.storage.from('documents').upload(path, pendingFile, { upsert: true })
        if (up) {
          const { data: pub } = supabase.storage.from('documents').getPublicUrl(up.path)
          imageUrl = pub.publicUrl
        }
      }
      const result = await createTicket({
        title,
        category,
        description: imageUrl ? `${description.trim()}\n[img]${imageUrl}` : description.trim(),
        priority,
      })
      if (result.success) {
        setCategory(''); setPriority('medium'); setDescription('')
        setPendingFile(null); setPreviewUrl(null)
        setShowForm(false)
        router.refresh()
      } else {
        setFormError('Failed to submit request')
      }
      setActionId(null)
    })
  }

  function handleReply(ticketId: string) {
    const msg = (replyText[ticketId] ?? '').trim()
    if (!msg) return
    setActionId(ticketId)
    startTransition(async () => {
      await addResponse({ ticket_id: ticketId, message: msg })
      setReplyText(p => ({ ...p, [ticketId]: '' }))
      setActionId(null)
      router.refresh()
    })
  }

  function handleClose(ticketId: string) {
    setActionId(ticketId + '_close')
    startTransition(async () => {
      await closeTicket(ticketId)
      setClosingId(null)
      setActionId(null)
      router.refresh()
    })
  }

  return (
    <div className="p-6 max-w-2xl mx-auto space-y-6">

      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-black" style={{ color: '#0a100d' }}>Support</h1>
          <p className="text-sm mt-1" style={{ color: '#83858c' }}>Raise a request, we&apos;ll get back to you</p>
        </div>
        <button onClick={() => { setShowForm(v => !v); setFormError('') }}
          className="flex items-center gap-2 px-4 py-2 rounded-xl text-[13px] font-bold"
          style={{ background: '#de1a1a', color: '#fff' }}>
          {showForm ? <X size={15} /> : <Plus size={15} />}
          {showForm ? 'Cancel' : 'New Request'}
        </button>
      </div>

      {/* New request form */}
      {showForm && (
        <div className="rounded-2xl p-5 space-y-4"
          style={{ background: '#fff', border: '1px solid rgba(10,16,13,0.08)' }}>
          <h2 className="text-[14px] font-bold" style={{ color: '#0a100d' }}>New Support Request</h2>

          {/* Type grid */}
          <div>
            <p className="text-[11px] font-bold mb-2" style={{ color: '#83858c', textTransform: 'uppercase', letterSpacing: '0.06em' }}>Request Type</p>
            <div className="grid grid-cols-4 gap-2">
              {REQUEST_TYPES.map(r => (
                <button key={r.key} onClick={() => setCategory(r.key)}
                  className="flex flex-col items-center gap-1 py-2 px-1 rounded-xl text-center transition-all"
                  style={{
                    border: category === r.key ? '2px solid #de1a1a' : '1.5px solid rgba(10,16,13,0.1)',
                    background: category === r.key ? 'rgba(222,26,26,0.06)' : 'rgba(10,16,13,0.02)',
                  }}>
                  <span style={{ fontSize: 18 }}>{r.emoji}</span>
                  <span className="text-[10px] font-semibold leading-tight" style={{ color: category === r.key ? '#de1a1a' : '#6B7280' }}>{r.label}</span>
                </button>
              ))}
            </div>
          </div>

          {/* Priority */}
          <div>
            <p className="text-[11px] font-bold mb-2" style={{ color: '#83858c', textTransform: 'uppercase', letterSpacing: '0.06em' }}>Priority</p>
            <div className="flex gap-2">
              {PRIORITY_OPTIONS.map(p => (
                <button key={p} onClick={() => setPriority(p)}
                  className="flex-1 py-1.5 rounded-xl text-[12px] font-semibold capitalize transition-all"
                  style={{
                    border: priority === p ? '2px solid #de1a1a' : '1.5px solid rgba(10,16,13,0.1)',
                    background: priority === p ? 'rgba(222,26,26,0.06)' : 'rgba(10,16,13,0.02)',
                    color: priority === p ? '#de1a1a' : '#6B7280',
                  }}>
                  {p}
                </button>
              ))}
            </div>
          </div>

          {/* Description */}
          <textarea rows={4} placeholder="Describe your request in detail *"
            value={description} onChange={e => setDescription(e.target.value)}
            className="w-full rounded-xl px-4 py-2.5 text-[13px] outline-none resize-none"
            style={{ background: 'rgba(10,16,13,0.04)', border: '1px solid rgba(10,16,13,0.12)', color: '#0a100d' }}
          />

          {/* Attachment */}
          <div>
            <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={handleFileSelect} />
            {previewUrl
              ? (
                <div className="relative inline-block">
                  <img src={previewUrl} alt="preview" className="rounded-xl" style={{ maxHeight: 100, maxWidth: '100%' }} />
                  <button onClick={() => { setPendingFile(null); setPreviewUrl(null) }}
                    className="absolute top-1 right-1 rounded-full flex items-center justify-center"
                    style={{ background: 'rgba(0,0,0,0.5)', width: 20, height: 20 }}>
                    <X size={11} style={{ color: '#fff' }} />
                  </button>
                </div>
              ) : (
                <button onClick={() => fileRef.current?.click()}
                  className="flex items-center gap-2 text-[12px] font-semibold px-3 py-1.5 rounded-lg"
                  style={{ background: 'rgba(10,16,13,0.04)', border: '1px solid rgba(10,16,13,0.1)', color: '#6B7280' }}>
                  <Paperclip size={13} /> Attach Image
                </button>
              )
            }
          </div>

          {formError && (
            <div className="flex items-center gap-2 text-[12px]" style={{ color: '#de1a1a' }}>
              <AlertCircle size={13} /> {formError}
            </div>
          )}

          <button onClick={handleCreate} disabled={pending && actionId === 'create'}
            className="w-full py-2.5 rounded-xl text-[13px] font-bold flex items-center justify-center gap-2"
            style={{ background: '#de1a1a', color: '#fff', opacity: pending && actionId === 'create' ? 0.7 : 1 }}>
            {pending && actionId === 'create' ? <Loader2 size={14} className="animate-spin" /> : <Send size={14} />}
            Submit Request
          </button>
        </div>
      )}

      {/* Ticket list */}
      {tickets.length === 0 ? (
        <div className="text-center py-16" style={{ color: '#83858c' }}>
          <LifeBuoy size={40} className="mx-auto mb-3 opacity-30" />
          <p className="font-medium">No requests yet</p>
          <p className="text-[13px] mt-1">Click &quot;New Request&quot; to raise a support request</p>
        </div>
      ) : (
        <div className="space-y-3">
          {tickets.map(ticket => {
            const isExpanded = expanded === ticket.id
            const responses  = ticket.support_responses ?? []
            return (
              <div key={ticket.id} className="rounded-2xl overflow-hidden"
                style={{ background: '#fff', border: '1px solid rgba(10,16,13,0.08)' }}>

                <button className="w-full text-left px-5 py-4 flex items-start gap-3"
                  onClick={() => setExpanded(isExpanded ? null : ticket.id)}>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-bold text-[14px]" style={{ color: '#0a100d' }}>{ticket.title}</span>
                      <span className="px-2 py-0.5 rounded-full text-[11px] font-semibold flex items-center gap-1"
                        style={{ background: STATUS_COLORS[ticket.status] ?? 'rgba(130,133,140,0.1)', color: STATUS_TEXT[ticket.status] ?? '#83858c' }}>
                        {STATUS_ICON[ticket.status]}
                        {ticket.status.replace('_', ' ')}
                      </span>
                    </div>
                    <div className="flex items-center gap-3 mt-1 text-[12px]" style={{ color: '#83858c' }}>
                      <span className="capitalize">{ticket.category}</span>
                      <span>·</span>
                      <span>{new Date(ticket.created_at).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })}</span>
                      {responses.length > 0 && <><span>·</span><span>{responses.length} {responses.length === 1 ? 'reply' : 'replies'}</span></>}
                    </div>
                  </div>
                  {isExpanded ? <ChevronUp size={16} style={{ color: '#83858c' }} /> : <ChevronDown size={16} style={{ color: '#83858c' }} />}
                </button>

                {isExpanded && (
                  <div className="px-5 pb-5 space-y-4 border-t" style={{ borderColor: 'rgba(10,16,13,0.06)' }}>
                    <p className="pt-4 text-[13px] leading-relaxed" style={{ color: '#0a100d' }}>{ticket.description}</p>

                    {responses.length > 0 && (
                      <div className="space-y-3">
                        {responses.map(r => (
                          <div key={r.id} className="rounded-xl px-4 py-3"
                            style={{ background: 'rgba(222,26,26,0.04)', border: '1px solid rgba(222,26,26,0.1)' }}>
                            <div className="flex items-center gap-2 mb-1">
                              <span className="text-[12px] font-bold" style={{ color: '#de1a1a' }}>{r.responder_name}</span>
                              <span className="text-[11px]" style={{ color: '#83858c' }}>
                                {new Date(r.created_at).toLocaleString('en-IN', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}
                              </span>
                            </div>
                            <p className="text-[13px]" style={{ color: '#0a100d' }}>{renderMessage(r.message)}</p>
                          </div>
                        ))}
                      </div>
                    )}

                    {ticket.status !== 'closed' && ticket.status !== 'resolved' && (
                      <>
                        <div className="flex gap-2">
                          <textarea rows={2} placeholder="Add a comment…"
                            value={replyText[ticket.id] ?? ''}
                            onChange={e => setReplyText(p => ({ ...p, [ticket.id]: e.target.value }))}
                            className="flex-1 rounded-xl px-3 py-2 text-[13px] resize-none outline-none"
                            style={{ background: 'rgba(10,16,13,0.04)', border: '1px solid rgba(10,16,13,0.12)', color: '#0a100d' }}
                          />
                          <button onClick={() => handleReply(ticket.id)}
                            disabled={pending && actionId === ticket.id}
                            className="px-4 rounded-xl flex items-center gap-1.5 text-[13px] font-semibold"
                            style={{ background: '#de1a1a', color: '#fff' }}>
                            {pending && actionId === ticket.id ? <Loader2 size={14} className="animate-spin" /> : <Send size={14} />}
                            Send
                          </button>
                        </div>

                        {closingId === ticket.id ? (
                          <div className="flex gap-2">
                            <button onClick={() => setClosingId(null)}
                              className="flex-1 py-2 rounded-xl text-[12px] font-semibold"
                              style={{ border: '1px solid #E5E7EB', background: '#F9FAFB', color: '#6B7280' }}>
                              Cancel
                            </button>
                            <button onClick={() => handleClose(ticket.id)}
                              disabled={pending && actionId === ticket.id + '_close'}
                              className="flex-1 py-2 rounded-xl text-[12px] font-semibold flex items-center justify-center gap-1.5"
                              style={{ background: '#DE1A1A', color: '#fff', opacity: pending && actionId === ticket.id + '_close' ? 0.7 : 1 }}>
                              {pending && actionId === ticket.id + '_close' ? <Loader2 size={12} className="animate-spin" /> : <XCircle size={12} />}
                              Close Request
                            </button>
                          </div>
                        ) : (
                          <button onClick={() => setClosingId(ticket.id)}
                            className="text-[12px] font-semibold flex items-center gap-1.5"
                            style={{ color: '#9CA3AF', background: 'none', border: 'none', cursor: 'pointer', padding: 0 }}>
                            <XCircle size={13} /> Close this request
                          </button>
                        )}
                      </>
                    )}
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
