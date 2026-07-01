'use client'

import { useState, useTransition } from 'react'
import { CheckCircle2, Loader2, Plus, Trash2, AlertTriangle } from 'lucide-react'
import { submitSimpleUpdate, type SimpleEntryInput } from '@/lib/actions/simple-update'

const PROGRESS_PRESETS = [25, 50, 75, 100]

const INP: React.CSSProperties = {
  width: '100%', boxSizing: 'border-box' as const,
  padding: '10px 13px', borderRadius: 10,
  border: '1.5px solid #E5E7EB', fontSize: 14,
  color: '#111827', background: '#FFFFFF', outline: 'none',
  fontWeight: 600,
}

type SimpleEntry = {
  id: string
  title: string
  clients: string[]
  progress: number
  notes: string
}

type TeamMember = { id: string; name: string; employee_id: string }

function emptyEntry(): SimpleEntry {
  return { id: crypto.randomUUID(), title: '', clients: [], progress: 0, notes: '' }
}

function ProgressBar({ value }: { value: number }) {
  const color = value === 100 ? '#16A34A' : value >= 75 ? '#DE1A1A' : value >= 50 ? '#F59E0B' : '#9CA3AF'
  return (
    <div style={{ height: 5, borderRadius: 3, background: '#F3F4F6', overflow: 'hidden', marginTop: 8 }}>
      <div style={{ width: `${value}%`, height: '100%', background: color, borderRadius: 3, transition: 'width 0.2s, background 0.2s' }} />
    </div>
  )
}

export default function ActivityUpdateForm({
  clientNames,
  today,
  userName,
  existingEntries = [],
  teamMembers = [],
}: {
  clientNames: string[]
  today: string
  userName: string
  existingEntries?: Array<{ title?: string; clients?: string[]; client?: string; progress?: number; notes?: string }>
  teamMembers?: TeamMember[]
}) {
  const [isPending, start] = useTransition()
  const [submitted, setSubmitted] = useState(existingEntries.length > 0)
  const [error, setError] = useState<string | null>(null)
  const [participantIds, setParticipantIds] = useState<string[]>([])
  const [participantSearch, setParticipantSearch] = useState('')
  const [openClientFor, setOpenClientFor] = useState<string | null>(null)
  const [clientSearch, setClientSearch] = useState('')

  const [entries, setEntries] = useState<SimpleEntry[]>(() => {
    if (existingEntries.length > 0) {
      return existingEntries.map(e => ({
        id: crypto.randomUUID(),
        title: e.title ?? '',
        clients: e.clients ?? (e.client ? [e.client] : []),
        progress: e.progress ?? 0,
        notes: e.notes ?? '',
      }))
    }
    return [emptyEntry()]
  })

  function patchEntry(id: string, patch: Partial<SimpleEntry>) {
    setEntries(prev => prev.map(e => e.id === id ? { ...e, ...patch } : e))
  }

  function removeEntry(id: string) {
    setEntries(prev => prev.filter(e => e.id !== id))
  }

  function toggleClient(entryId: string, client: string) {
    setEntries(prev => prev.map(e => {
      if (e.id !== entryId) return e
      const has = e.clients.includes(client)
      return { ...e, clients: has ? e.clients.filter(c => c !== client) : [...e.clients, client] }
    }))
  }

  function toggleParticipant(id: string) {
    setParticipantIds(prev => prev.includes(id) ? prev.filter(p => p !== id) : [...prev, id])
  }

  const filteredMembers = participantSearch.trim()
    ? teamMembers.filter(m => m.name.toLowerCase().includes(participantSearch.toLowerCase()) || m.employee_id.toLowerCase().includes(participantSearch.toLowerCase()))
    : teamMembers

  const filteredClients = clientSearch.trim()
    ? clientNames.filter(c => c.toLowerCase().includes(clientSearch.toLowerCase()))
    : clientNames

  function handleSubmit() {
    setError(null)
    const valid = entries.filter(e => e.title.trim())
    if (valid.length === 0) { setError('Add at least one task with a title.'); return }
    const inputs: SimpleEntryInput[] = valid.map(e => ({
      title: e.title.trim(),
      clients: e.clients,
      progress: e.progress,
      notes: e.notes,
    }))
    start(async () => {
      const res = await submitSimpleUpdate(today, inputs, participantIds)
      if (!res.success) { setError(res.error ?? 'Submission failed.'); return }
      setSubmitted(true)
    })
  }

  const dateLabel = new Date(today + 'T12:00:00').toLocaleDateString('en-IN', { weekday: 'long', day: 'numeric', month: 'long' })

  // ── Submitted ──────────────────────────────────────────────────────────────
  if (submitted && !isPending) {
    const done = entries.filter(e => e.progress === 100).length
    return (
      <div style={{ maxWidth: 560, margin: '0 auto', padding: '32px 20px' }}>
        <div style={{ background: '#FFFFFF', borderRadius: 20, padding: '40px 32px', textAlign: 'center', border: '1px solid #E5E7EB', boxShadow: '0 4px 24px rgba(0,0,0,0.06)' }}>
          <CheckCircle2 size={52} style={{ color: '#16A34A', margin: '0 auto 16px' }} />
          <h2 style={{ fontSize: 22, fontWeight: 900, color: '#111827', margin: '0 0 8px', fontFamily: 'var(--font-jakarta)' }}>Update Submitted!</h2>
          <p style={{ fontSize: 13, color: '#6B7280', margin: '0 0 4px' }}>{dateLabel}</p>
          <p style={{ fontSize: 13, color: '#9CA3AF', margin: '0 0 28px' }}>
            {entries.filter(e => e.title.trim()).length} tasks · {done} completed
          </p>
          <button onClick={() => setSubmitted(false)} style={{ padding: '11px 32px', borderRadius: 12, background: '#DE1A1A', color: '#FFF', fontSize: 14, fontWeight: 700, border: 'none', cursor: 'pointer', boxShadow: '0 4px 14px rgba(222,26,26,0.3)' }}>
            Edit Update
          </button>
        </div>
      </div>
    )
  }

  // ── Main form ──────────────────────────────────────────────────────────────
  return (
    <div style={{ maxWidth: 600, margin: '0 auto', padding: '24px 16px 80px' }}>

      {/* Header */}
      <div style={{ marginBottom: 24 }}>
        <h1 style={{ fontSize: 22, fontWeight: 900, color: '#111827', margin: '0 0 3px', fontFamily: 'var(--font-jakarta)' }}>Daily Update</h1>
        <p style={{ fontSize: 13, color: '#6B7280', margin: 0 }}>{userName} · {dateLabel}</p>
      </div>

      {/* Task entries */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 12, marginBottom: 12 }}>
        {entries.map((entry, idx) => (
          <div key={entry.id} style={{ background: '#FFFFFF', borderRadius: 16, border: '1.5px solid #E5E7EB', padding: '16px', boxShadow: '0 1px 6px rgba(0,0,0,0.04)', position: 'relative' }}>

            {/* Entry number + delete */}
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
              <span style={{ fontSize: 10, fontWeight: 800, color: '#9CA3AF', textTransform: 'uppercase', letterSpacing: '0.08em' }}>Task {idx + 1}</span>
              {entries.length > 1 && (
                <button onClick={() => removeEntry(entry.id)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#D1D5DB', padding: 4, display: 'flex', alignItems: 'center' }}>
                  <Trash2 size={13} />
                </button>
              )}
            </div>

            {/* Title */}
            <input
              type="text"
              placeholder="What did you work on?"
              value={entry.title}
              onChange={e => patchEntry(entry.id, { title: e.target.value })}
              style={{ ...INP, marginBottom: 14 }}
              autoFocus={idx === entries.length - 1 && idx > 0}
            />

            {/* Client multi-select */}
            <div style={{ marginBottom: 14 }}>
              <label style={{ fontSize: 10, fontWeight: 700, color: '#6B7280', textTransform: 'uppercase', letterSpacing: '0.07em', display: 'block', marginBottom: 8 }}>Client</label>

              {/* Selected clients as chips */}
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: entry.clients.length > 0 ? 8 : 0 }}>
                {entry.clients.map(c => (
                  <button key={c} onClick={() => toggleClient(entry.id, c)}
                    style={{ display: 'flex', alignItems: 'center', gap: 4, padding: '4px 10px', borderRadius: 99, background: 'rgba(222,26,26,0.1)', border: '1.5px solid rgba(222,26,26,0.25)', cursor: 'pointer' }}>
                    <span style={{ fontSize: 11, fontWeight: 700, color: '#DE1A1A' }}>{c}</span>
                    <span style={{ fontSize: 10, color: '#DE1A1A', lineHeight: 1 }}>×</span>
                  </button>
                ))}
              </div>

              {/* Toggle client picker */}
              <button
                onClick={() => {
                  setOpenClientFor(openClientFor === entry.id ? null : entry.id)
                  setClientSearch('')
                }}
                style={{ display: 'flex', alignItems: 'center', gap: 5, padding: '5px 11px', borderRadius: 8, border: '1.5px dashed #D1D5DB', background: '#F9FAFB', color: '#6B7280', fontSize: 11, fontWeight: 600, cursor: 'pointer' }}>
                <Plus size={10} /> {entry.clients.length > 0 ? 'Add More' : 'Select Client'}
              </button>

              {/* Client picker panel */}
              {openClientFor === entry.id && (
                <div style={{ marginTop: 8, border: '1.5px solid #E5E7EB', borderRadius: 12, overflow: 'hidden', background: '#FFFFFF', boxShadow: '0 4px 16px rgba(0,0,0,0.08)' }}>
                  <div style={{ padding: '10px 12px', borderBottom: '1px solid #F3F4F6' }}>
                    <input
                      type="text"
                      placeholder="Search clients…"
                      value={clientSearch}
                      onChange={e => setClientSearch(e.target.value)}
                      style={{ width: '100%', boxSizing: 'border-box', fontSize: 12, padding: '6px 10px', borderRadius: 8, border: '1.5px solid #E5E7EB', outline: 'none', color: '#111827' }}
                      autoFocus
                    />
                  </div>
                  <div style={{ maxHeight: 220, overflowY: 'auto', padding: '8px 10px', display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                    {filteredClients.slice(0, 50).map(c => {
                      const sel = entry.clients.includes(c)
                      return (
                        <button key={c} onClick={() => toggleClient(entry.id, c)}
                          style={{ padding: '5px 11px', borderRadius: 99, fontSize: 11, fontWeight: 600, cursor: 'pointer',
                            border: `1.5px solid ${sel ? '#DE1A1A' : '#E5E7EB'}`,
                            background: sel ? 'rgba(222,26,26,0.08)' : '#F9FAFB',
                            color: sel ? '#DE1A1A' : '#374151',
                          }}>
                          {sel ? '✓ ' : ''}{c}
                        </button>
                      )
                    })}
                    {filteredClients.length === 0 && (
                      <p style={{ fontSize: 12, color: '#9CA3AF', margin: 0, padding: '4px 2px' }}>No clients found</p>
                    )}
                  </div>
                  <div style={{ padding: '8px 12px', borderTop: '1px solid #F3F4F6', display: 'flex', justifyContent: 'flex-end' }}>
                    <button onClick={() => setOpenClientFor(null)} style={{ fontSize: 12, fontWeight: 700, color: '#DE1A1A', background: 'none', border: 'none', cursor: 'pointer' }}>Done</button>
                  </div>
                </div>
              )}
            </div>

            {/* Progress */}
            <div>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
                <label style={{ fontSize: 10, fontWeight: 700, color: '#6B7280', textTransform: 'uppercase', letterSpacing: '0.07em' }}>Progress</label>
                <span style={{ fontSize: 11, fontWeight: 800, color: entry.progress === 100 ? '#16A34A' : '#374151' }}>
                  {entry.progress}%
                </span>
              </div>
              <div style={{ display: 'flex', gap: 6 }}>
                {PROGRESS_PRESETS.map(p => (
                  <button key={p} onClick={() => patchEntry(entry.id, { progress: p })}
                    style={{
                      flex: 1, padding: '7px 0', borderRadius: 9, fontSize: 12, fontWeight: 700, cursor: 'pointer',
                      border: `1.5px solid ${entry.progress === p ? (p === 100 ? '#16A34A' : '#DE1A1A') : '#E5E7EB'}`,
                      background: entry.progress === p ? (p === 100 ? 'rgba(22,163,74,0.1)' : 'rgba(222,26,26,0.08)') : '#F9FAFB',
                      color: entry.progress === p ? (p === 100 ? '#16A34A' : '#DE1A1A') : '#9CA3AF',
                      transition: 'all 0.1s',
                    }}>
                    {p === 100 ? '✓ Done' : `${p}%`}
                  </button>
                ))}
              </div>
              <ProgressBar value={entry.progress} />
            </div>

          </div>
        ))}
      </div>

      {/* Add Task */}
      <button
        onClick={() => setEntries(prev => [...prev, emptyEntry()])}
        style={{ width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, padding: '12px 0', borderRadius: 12, marginBottom: 20, border: '1.5px dashed #DE1A1A', background: 'rgba(222,26,26,0.03)', color: '#DE1A1A', fontSize: 13, fontWeight: 700, cursor: 'pointer' }}>
        <Plus size={14} /> Add Task
      </button>

      {/* Worked With */}
      {teamMembers.length > 0 && (
        <div style={{ background: '#FFFFFF', borderRadius: 14, border: '1.5px solid rgba(99,102,241,0.2)', padding: '16px', marginBottom: 20 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 12 }}>
            <span style={{ fontSize: 18 }}>👥</span>
            <div style={{ flex: 1 }}>
              <p style={{ fontSize: 13, fontWeight: 800, color: '#111827', margin: 0 }}>Worked With</p>
              <p style={{ fontSize: 10, color: '#9CA3AF', margin: 0 }}>Tag teammates you collaborated with</p>
            </div>
            {participantIds.length > 0 && (
              <span style={{ fontSize: 11, fontWeight: 700, padding: '2px 8px', borderRadius: 99, background: 'rgba(99,102,241,0.1)', color: '#6366F1' }}>
                {participantIds.length}
              </span>
            )}
          </div>

          {participantIds.length > 0 && (
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 5, marginBottom: 10 }}>
              {participantIds.map(pid => {
                const m = teamMembers.find(t => t.id === pid)
                if (!m) return null
                return (
                  <button key={pid} onClick={() => toggleParticipant(pid)}
                    style={{ display: 'flex', alignItems: 'center', gap: 5, padding: '4px 10px 4px 6px', borderRadius: 99, background: 'rgba(99,102,241,0.1)', border: '1.5px solid rgba(99,102,241,0.3)', cursor: 'pointer' }}>
                    <span style={{ fontSize: 9, fontWeight: 900, color: '#fff', background: '#6366F1', borderRadius: '50%', width: 18, height: 18, display: 'inline-flex', alignItems: 'center', justifyContent: 'center' }}>
                      {m.name.split(' ').map((n: string) => n[0]).join('').slice(0, 2)}
                    </span>
                    <span style={{ fontSize: 11, fontWeight: 700, color: '#4338CA' }}>{m.name.split(' ')[0]}</span>
                    <span style={{ fontSize: 9, color: '#818CF8' }}>✕</span>
                  </button>
                )
              })}
            </div>
          )}

          <input
            value={participantSearch}
            onChange={e => setParticipantSearch(e.target.value)}
            placeholder="Search teammates…"
            style={{ width: '100%', boxSizing: 'border-box', fontSize: 12, padding: '7px 11px', borderRadius: 9, border: '1.5px solid #E5E7EB', background: '#F9FAFB', color: '#111827', outline: 'none', marginBottom: 8 }}
          />
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 5 }}>
            {filteredMembers.slice(0, 20).map(m => {
              const selected = participantIds.includes(m.id)
              return (
                <button key={m.id} onClick={() => toggleParticipant(m.id)}
                  style={{ display: 'flex', alignItems: 'center', gap: 5, padding: '4px 10px 4px 6px', borderRadius: 99, cursor: 'pointer',
                    background: selected ? 'rgba(99,102,241,0.1)' : '#F9FAFB',
                    border: `1.5px solid ${selected ? 'rgba(99,102,241,0.4)' : '#E5E7EB'}`,
                  }}>
                  <span style={{ fontSize: 9, fontWeight: 900, color: selected ? '#fff' : '#9CA3AF', background: selected ? '#6366F1' : '#E5E7EB', borderRadius: '50%', width: 18, height: 18, display: 'inline-flex', alignItems: 'center', justifyContent: 'center' }}>
                    {m.name.split(' ').map((n: string) => n[0]).join('').slice(0, 2)}
                  </span>
                  <span style={{ fontSize: 11, fontWeight: 700, color: selected ? '#4338CA' : '#374151' }}>{m.name.split(' ')[0]}</span>
                  {selected && <span style={{ fontSize: 9, color: '#6366F1' }}>✓</span>}
                </button>
              )
            })}
          </div>
        </div>
      )}

      {/* Error */}
      {error && (
        <div style={{ display: 'flex', alignItems: 'flex-start', gap: 8, background: '#FEF2F2', border: '1px solid #FECACA', borderRadius: 10, padding: '10px 14px', marginBottom: 16 }}>
          <AlertTriangle size={13} color="#EF4444" style={{ flexShrink: 0, marginTop: 1 }} />
          <span style={{ fontSize: 12, fontWeight: 600, color: '#DC2626', lineHeight: 1.4 }}>{error}</span>
        </div>
      )}

      {/* Submit */}
      <button
        onClick={handleSubmit}
        disabled={isPending}
        style={{
          width: '100%', padding: '14px 0', borderRadius: 14, border: 'none',
          background: isPending ? '#9CA3AF' : '#DE1A1A', color: '#FFF',
          fontSize: 15, fontWeight: 800, cursor: isPending ? 'not-allowed' : 'pointer',
          display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
          fontFamily: 'var(--font-jakarta)',
          boxShadow: isPending ? 'none' : '0 4px 18px rgba(222,26,26,0.35)',
        }}>
        {isPending ? <><Loader2 size={16} className="animate-spin" /> Submitting…</> : 'Submit Update'}
      </button>

    </div>
  )
}
