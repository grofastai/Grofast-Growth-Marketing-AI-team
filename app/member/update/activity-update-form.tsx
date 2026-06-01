'use client'

import { useState, useTransition, useMemo } from 'react'
import { useRouter } from 'next/navigation'
import { CheckCircle2, Loader2, Plus, Trash2, Clock, Hash } from 'lucide-react'
import { submitWorkLogs, type Activity, type WorkLogInput, type ContentPostInput } from '@/lib/actions/work-logs'

const TEAM_LABELS: Record<string, { label: string; color: string; bg: string }> = {
  MEDIA:    { label: 'Media & Video',    color: '#E53935', bg: 'rgba(229,57,53,0.07)'   },
  META:     { label: 'Meta & Marketing', color: '#F59E0B', bg: 'rgba(245,158,11,0.07)'  },
  CREATIVE: { label: 'Creative Design',  color: '#8B5CF6', bg: 'rgba(139,92,246,0.07)'  },
  AI:       { label: 'AI & Tech',        color: '#10B981', bg: 'rgba(16,185,129,0.07)'  },
  OPS:      { label: 'Operations',       color: '#3B82F6', bg: 'rgba(59,130,246,0.07)'  },
}
const TEAM_ORDER = ['MEDIA', 'META', 'CREATIVE', 'AI', 'OPS']

const PLATFORMS  = ['Instagram', 'YouTube', 'Facebook', 'LinkedIn', 'Twitter', 'Other']
const POST_TYPES = ['Reel', 'Poster', 'Story', 'Video', 'Carousel', 'Thread', 'Short', 'Other']

const INP: React.CSSProperties = {
  width: '100%', boxSizing: 'border-box' as const,
  padding: '8px 11px', borderRadius: 9,
  border: '1.5px solid #E5E7EB', fontSize: 13,
  color: '#111827', background: '#F9FAFB', outline: 'none',
}
const SEL: React.CSSProperties = {
  ...INP, cursor: 'pointer',
  // can't use appearance:'none' via spread so inline below
}

type LogState = {
  activity_id: string
  client_name: string
  hours: string
  item_titles: string[]   // one entry per produced item; length = unit_count
  notes: string
}

type PostState = {
  id: string
  title: string
  client_name: string
  platform: string
  post_type: string
  post_link: string
  notes: string
}

function emptyPost(): PostState {
  return {
    id: crypto.randomUUID(),
    title: '', client_name: '', platform: 'Instagram', post_type: 'Reel',
    post_link: '', notes: '',
  }
}

function unitLabel(activity: Activity): string {
  const n = activity.name.toLowerCase()
  if (n.includes('video') || n.includes('edit'))   return 'Videos Count'
  if (n.includes('poster') || n.includes('design') || n.includes('thumbnail')) return 'Designs Count'
  if (n.includes('post') || n.includes('upload') || n.includes('story')) return 'Posts Count'
  return 'Count'
}


export default function ActivityUpdateForm({
  activities, clientNames, today, userName, hourlyRate,
  existingLogs, existingPosts,
}: {
  activities: Activity[]
  clientNames: string[]
  today: string
  userName: string
  hourlyRate: number
  existingLogs: Array<{ activity_id: string; client_name: string | null; hours: number; unit_count: number; item_titles: string[]; notes: string | null }>
  existingPosts: Array<{ title: string | null; client_name: string | null; platform: string; post_type: string; post_link: string | null; notes: string | null }>
}) {
  const router = useRouter()
  const [isPending, start] = useTransition()
  const [submitted, setSubmitted] = useState(existingLogs.length > 0 || existingPosts.length > 0)
  const [error, setError] = useState<string | null>(null)

  const [selected, setSelected] = useState<Set<string>>(() => {
    const s = new Set<string>()
    for (const l of existingLogs) s.add(l.activity_id)
    return s
  })

  const [logs, setLogs] = useState<Record<string, LogState>>(() => {
    const m: Record<string, LogState> = {}
    for (const l of existingLogs) {
      const titles = l.item_titles?.length > 0
        ? l.item_titles
        : l.unit_count > 0 ? Array(l.unit_count).fill('') : ['']
      m[l.activity_id] = {
        activity_id: l.activity_id,
        client_name: l.client_name ?? '',
        hours:       l.hours > 0 ? String(l.hours) : '',
        item_titles: titles,
        notes:       l.notes ?? '',
      }
    }
    return m
  })

  const [posts, setPosts] = useState<PostState[]>(() =>
    existingPosts.length > 0
      ? existingPosts.map(p => ({
          id: crypto.randomUUID(),
          title: p.title ?? '',
          client_name: p.client_name ?? '',
          platform: p.platform, post_type: p.post_type,
          post_link: p.post_link ?? '', notes: p.notes ?? '',
        }))
      : []
  )

  function toggleActivity(id: string) {
    setSelected(prev => {
      const next = new Set(prev)
      if (next.has(id)) {
        next.delete(id)
        setLogs(l => { const n = { ...l }; delete n[id]; return n })
      } else {
        next.add(id)
        setLogs(l => ({ ...l, [id]: { activity_id: id, client_name: '', hours: '', item_titles: [''], notes: '' } }))
      }
      return next
    })
  }

  function patchLog(id: string, patch: Partial<LogState>) {
    setLogs(prev => ({ ...prev, [id]: { ...prev[id], ...patch } }))
  }

  function patchPost(pid: string, patch: Partial<PostState>) {
    setPosts(prev => prev.map(p => p.id === pid ? { ...p, ...patch } : p))
  }

  const totalHours = useMemo(() =>
    Object.values(logs).reduce((s, l) => s + (parseFloat(l.hours) || 0), 0)
  , [logs])

  const grouped = useMemo(() => {
    const m: Record<string, Activity[]> = {}
    for (const a of activities) {
      if (!m[a.team_category]) m[a.team_category] = []
      m[a.team_category].push(a)
    }
    return m
  }, [activities])

  function handleSubmit() {
    setError(null)
    if (selected.size === 0 && posts.length === 0) {
      setError('Select at least one activity or log a post.')
      return
    }
    const logInputs: WorkLogInput[] = Object.values(logs)
      .filter(l => selected.has(l.activity_id))
      .map(l => {
        const filledTitles = l.item_titles.filter(t => t.trim() !== '')
        return {
          activity_id: l.activity_id,
          client_name: l.client_name,
          hours:       parseFloat(l.hours) || 0,
          unit_count:  filledTitles.length || 0,
          item_titles: filledTitles,
          notes:       l.notes,
        }
      })
    const postInputs: ContentPostInput[] = posts
      .filter(p => p.platform && p.post_type)
      .map(p => ({
        title: p.title, client_name: p.client_name, platform: p.platform,
        post_type: p.post_type, post_link: p.post_link, notes: p.notes,
      }))

    start(async () => {
      const res = await submitWorkLogs(today, logInputs, postInputs)
      if (!res.success) { setError(res.error ?? 'Submission failed.'); return }
      setSubmitted(true)
      router.refresh()
    })
  }

  const dateLabel = new Date(today + 'T12:00:00').toLocaleDateString('en-IN', {
    weekday: 'long', day: 'numeric', month: 'long',
  })

  // ── Submitted screen ───────────────────────────────────────────────────────
  if (submitted && !isPending) {
    return (
      <div style={{ maxWidth: 600, margin: '0 auto', padding: '32px 20px' }}>
        <div style={{
          background: '#FFFFFF', borderRadius: 20, padding: '40px 32px',
          textAlign: 'center', border: '1px solid #E5E7EB',
          boxShadow: '0 4px 24px rgba(0,0,0,0.06)',
        }}>
          <CheckCircle2 size={52} style={{ color: '#16A34A', margin: '0 auto 16px' }} />
          <h2 style={{ fontSize: 22, fontWeight: 900, color: '#111827', margin: '0 0 8px', fontFamily: 'var(--font-jakarta)' }}>
            Update Submitted!
          </h2>
          <p style={{ fontSize: 13, color: '#6B7280', margin: '0 0 6px' }}>{dateLabel}</p>
          <p style={{ fontSize: 13, color: '#9CA3AF', margin: '0 0 28px' }}>
            {selected.size} {selected.size === 1 ? 'activity' : 'activities'} · {posts.length} {posts.length === 1 ? 'post' : 'posts'}
            {totalHours > 0 && ` · ${totalHours.toFixed(1)}h logged`}
            {hourlyRate > 0 && totalHours > 0 && ` · ₹${Math.round(totalHours * hourlyRate)} cost`}
          </p>
          <button
            onClick={() => setSubmitted(false)}
            style={{
              padding: '11px 32px', borderRadius: 12, background: '#DE1A1A',
              color: '#FFF', fontSize: 14, fontWeight: 700, border: 'none', cursor: 'pointer',
              boxShadow: '0 4px 14px rgba(222,26,26,0.3)',
            }}>
            Edit Update
          </button>
        </div>
      </div>
    )
  }

  // ── No activities configured ───────────────────────────────────────────────
  if (activities.length === 0) {
    return (
      <div style={{ maxWidth: 600, margin: '0 auto', padding: '60px 20px', textAlign: 'center' }}>
        <div style={{ fontSize: 40, marginBottom: 16 }}>⚙️</div>
        <p style={{ fontSize: 15, fontWeight: 700, color: '#374151', margin: '0 0 8px' }}>No activities set up yet</p>
        <p style={{ fontSize: 13, color: '#9CA3AF', margin: 0 }}>Ask your admin to run the activities migration in Supabase.</p>
      </div>
    )
  }

  // ── Main form ──────────────────────────────────────────────────────────────
  return (
    <div style={{ maxWidth: 680, margin: '0 auto', padding: '24px 16px 80px' }}>

      {/* Header */}
      <div style={{ marginBottom: 22 }}>
        <h1 style={{ fontSize: 24, fontWeight: 900, color: '#111827', margin: '0 0 4px', fontFamily: 'var(--font-jakarta)' }}>
          Daily Update
        </h1>
        <p style={{ fontSize: 13, color: '#6B7280', margin: 0 }}>
          {userName} · {dateLabel}
          {hourlyRate > 0 && totalHours > 0 && (
            <span style={{
              marginLeft: 12, fontSize: 11, fontWeight: 700, color: '#16A34A',
              background: 'rgba(22,163,74,0.08)', padding: '2px 10px', borderRadius: 6,
            }}>
              {totalHours.toFixed(1)}h · Est. ₹{Math.round(totalHours * hourlyRate)}
            </span>
          )}
        </p>
      </div>

      {/* ── STEP 1: Activity Picker ─────────────────────────────────────────── */}
      <div style={{
        background: '#FFFFFF', borderRadius: 16, border: '1px solid #EBEDF2',
        marginBottom: 20, overflow: 'hidden', boxShadow: '0 2px 8px rgba(0,0,0,0.04)',
      }}>
        <div style={{ padding: '14px 18px', borderBottom: '1px solid #F3F4F6' }}>
          <p style={{ fontSize: 14, fontWeight: 800, color: '#111827', margin: 0, fontFamily: 'var(--font-jakarta)' }}>
            Step 1 — What did you do today?
          </p>
          <p style={{ fontSize: 11, color: '#9CA3AF', margin: '2px 0 0' }}>Select everything you worked on</p>
        </div>
        <div style={{ padding: '16px 18px', display: 'flex', flexDirection: 'column', gap: 18 }}>
          {TEAM_ORDER.filter(tc => grouped[tc]?.length).map(tc => {
            const cfg = TEAM_LABELS[tc]
            return (
              <div key={tc}>
                <p style={{ fontSize: 10, fontWeight: 800, color: cfg.color, textTransform: 'uppercase', letterSpacing: '0.12em', margin: '0 0 10px' }}>
                  {cfg.label}
                </p>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                  {grouped[tc].map(a => {
                    const isSel = selected.has(a.id)
                    return (
                      <button
                        key={a.id}
                        onClick={() => toggleActivity(a.id)}
                        style={{
                          display: 'flex', alignItems: 'center', gap: 6,
                          padding: '7px 14px', borderRadius: 10, fontSize: 13, fontWeight: 600,
                          border: `1.5px solid ${isSel ? cfg.color : '#E5E7EB'}`,
                          background: isSel ? cfg.bg : '#F9FAFB',
                          color: isSel ? cfg.color : '#6B7280',
                          cursor: 'pointer', transition: 'all 0.15s',
                        }}>
                        <span style={{ fontSize: 16 }}>{a.emoji}</span>
                        {a.name}
                        {isSel && <CheckCircle2 size={13} />}
                      </button>
                    )
                  })}
                </div>
              </div>
            )
          })}
        </div>
      </div>

      {/* ── STEP 2: Detail Cards ─────────────────────────────────────────────── */}
      {selected.size > 0 && (
        <div style={{ marginBottom: 20 }}>
          <p style={{ fontSize: 14, fontWeight: 800, color: '#111827', margin: '0 0 12px', fontFamily: 'var(--font-jakarta)' }}>
            Step 2 — Fill in the details
          </p>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            {Array.from(selected).map(actId => {
              const act = activities.find(a => a.id === actId)
              if (!act) return null
              const log = logs[actId] ?? { activity_id: actId, client_name: '', hours: '', item_titles: [''], notes: '' }
              const cfg = TEAM_LABELS[act.team_category]
              return (
                <div key={actId} style={{
                  background: '#FFFFFF', borderRadius: 14,
                  border: `1.5px solid ${cfg.color}35`,
                  overflow: 'hidden', boxShadow: '0 2px 8px rgba(0,0,0,0.04)',
                }}>
                  {/* Card header */}
                  <div style={{
                    display: 'flex', alignItems: 'center', gap: 10,
                    padding: '12px 16px', background: cfg.bg,
                    borderBottom: `1px solid ${cfg.color}20`,
                  }}>
                    <span style={{ fontSize: 18 }}>{act.emoji}</span>
                    <span style={{ fontSize: 14, fontWeight: 800, color: cfg.color, flex: 1, fontFamily: 'var(--font-jakarta)' }}>
                      {act.name}
                    </span>
                    <button onClick={() => toggleActivity(actId)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#9CA3AF', padding: 4 }}>
                      <Trash2 size={13} />
                    </button>
                  </div>
                  {/* Card body */}
                  <div style={{ padding: '14px 16px', display: 'flex', flexDirection: 'column', gap: 12 }}>
                    {/* Client */}
                    <div>
                      <label style={{ fontSize: 10, fontWeight: 700, color: '#6B7280', textTransform: 'uppercase', letterSpacing: '0.07em', display: 'block', marginBottom: 5 }}>
                        Client
                      </label>
                      <select
                        value={log.client_name}
                        onChange={e => patchLog(actId, { client_name: e.target.value })}
                        style={{ ...SEL, appearance: 'auto' }}>
                        <option value="">— Select client —</option>
                        {clientNames.map(n => <option key={n} value={n}>{n}</option>)}
                        <option value="Internal">Internal / Our Brand</option>
                      </select>
                    </div>
                    {/* Hours + Count row */}
                    <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
                      {(act.unit_type === 'hours' || act.unit_type === 'both') && (
                        <div style={{ flex: 1, minWidth: 120 }}>
                          <label style={{ fontSize: 10, fontWeight: 700, color: '#6B7280', textTransform: 'uppercase', letterSpacing: '0.07em', display: 'block', marginBottom: 5 }}>
                            <Clock size={10} style={{ display: 'inline', marginRight: 3 }} />Hours Spent
                          </label>
                          <input
                            type="number" min="0" max="24" step="0.5"
                            placeholder="e.g. 2.5"
                            value={log.hours}
                            onChange={e => patchLog(actId, { hours: e.target.value })}
                            style={{ ...INP, width: '100%' }}
                          />
                        </div>
                      )}
                      {(act.unit_type === 'count' || act.unit_type === 'both') && (
                        <div style={{ width: '100%' }}>
                          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 }}>
                            <label style={{ fontSize: 10, fontWeight: 700, color: '#6B7280', textTransform: 'uppercase', letterSpacing: '0.07em' }}>
                              <Hash size={10} style={{ display: 'inline', marginRight: 3 }} />{unitLabel(act)}
                            </label>
                            <span style={{ fontSize: 10, color: '#9CA3AF' }}>{log.item_titles.length} item{log.item_titles.length !== 1 ? 's' : ''}</span>
                          </div>
                          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                            {log.item_titles.map((title, idx) => (
                              <div key={idx} style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                                <input
                                  type="text"
                                  placeholder={`Title ${idx + 1} (e.g. Summer Sale Reel)`}
                                  value={title}
                                  onChange={e => {
                                    const next = [...log.item_titles]
                                    next[idx] = e.target.value
                                    patchLog(actId, { item_titles: next })
                                  }}
                                  style={{ ...INP, flex: 1 }}
                                />
                                {log.item_titles.length > 1 && (
                                  <button
                                    onClick={() => patchLog(actId, { item_titles: log.item_titles.filter((_, i) => i !== idx) })}
                                    style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#9CA3AF', padding: 4, flexShrink: 0 }}>
                                    <Trash2 size={13} />
                                  </button>
                                )}
                              </div>
                            ))}
                          </div>
                          <button
                            onClick={() => patchLog(actId, { item_titles: [...log.item_titles, ''] })}
                            style={{
                              marginTop: 8, display: 'flex', alignItems: 'center', gap: 5,
                              padding: '6px 12px', borderRadius: 8,
                              border: `1px dashed ${cfg.color}`, background: cfg.bg,
                              color: cfg.color, fontSize: 11, fontWeight: 700, cursor: 'pointer',
                            }}>
                            <Plus size={11} /> Add Item
                          </button>
                        </div>
                      )}
                    </div>
                    {/* Notes */}
                    <div>
                      <label style={{ fontSize: 10, fontWeight: 700, color: '#6B7280', textTransform: 'uppercase', letterSpacing: '0.07em', display: 'block', marginBottom: 5 }}>
                        Notes (optional)
                      </label>
                      <input
                        type="text"
                        placeholder="Campaign name, client notes, details…"
                        value={log.notes}
                        onChange={e => patchLog(actId, { notes: e.target.value })}
                        style={INP}
                      />
                    </div>
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      )}

      {/* ── STEP 3: Posts Logger ─────────────────────────────────────────────── */}
      <div style={{
        background: '#FFFFFF', borderRadius: 16, border: '1px solid #EBEDF2',
        marginBottom: 24, overflow: 'hidden', boxShadow: '0 2px 8px rgba(0,0,0,0.04)',
      }}>
        <div style={{
          padding: '14px 18px', borderBottom: '1px solid #F3F4F6',
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        }}>
          <div>
            <p style={{ fontSize: 14, fontWeight: 800, color: '#111827', margin: 0, fontFamily: 'var(--font-jakarta)' }}>
              📱 Posts Published Today
            </p>
            <p style={{ fontSize: 11, color: '#9CA3AF', margin: '2px 0 0' }}>Log every post you published today</p>
          </div>
          <button
            onClick={() => setPosts(p => [...p, emptyPost()])}
            style={{
              display: 'flex', alignItems: 'center', gap: 5,
              padding: '7px 14px', borderRadius: 9,
              border: '1.5px solid #3B82F6', background: 'rgba(59,130,246,0.06)',
              color: '#3B82F6', fontSize: 12, fontWeight: 700, cursor: 'pointer',
            }}>
            <Plus size={12} /> Add Post
          </button>
        </div>

        {posts.length === 0 ? (
          <p style={{ fontSize: 12, color: '#9CA3AF', textAlign: 'center', padding: '20px 0' }}>
            No posts logged yet — tap Add Post to record what you published
          </p>
        ) : (
          <div style={{ padding: '12px 16px', display: 'flex', flexDirection: 'column', gap: 10 }}>
            {posts.map(post => (
              <div key={post.id} style={{ display: 'grid', gridTemplateColumns: '1.5fr 1fr 1fr 1fr 1fr auto', gap: 8, alignItems: 'end' }}>
                <div>
                  <label style={{ fontSize: 9, fontWeight: 700, color: '#9CA3AF', textTransform: 'uppercase', letterSpacing: '0.07em', display: 'block', marginBottom: 3 }}>Title</label>
                  <input
                    type="text"
                    placeholder="e.g. Summer Sale Reel"
                    value={post.title}
                    onChange={e => patchPost(post.id, { title: e.target.value })}
                    style={{ ...INP, fontSize: 12 }}
                  />
                </div>
                <div>
                  <label style={{ fontSize: 9, fontWeight: 700, color: '#9CA3AF', textTransform: 'uppercase', letterSpacing: '0.07em', display: 'block', marginBottom: 3 }}>Client</label>
                  <select value={post.client_name} onChange={e => patchPost(post.id, { client_name: e.target.value })} style={{ ...SEL, fontSize: 12, appearance: 'auto' }}>
                    <option value="">— Client —</option>
                    {clientNames.map(n => <option key={n} value={n}>{n}</option>)}
                  </select>
                </div>
                <div>
                  <label style={{ fontSize: 9, fontWeight: 700, color: '#9CA3AF', textTransform: 'uppercase', letterSpacing: '0.07em', display: 'block', marginBottom: 3 }}>Platform</label>
                  <select value={post.platform} onChange={e => patchPost(post.id, { platform: e.target.value })} style={{ ...SEL, fontSize: 12, appearance: 'auto' }}>
                    {PLATFORMS.map(p => <option key={p}>{p}</option>)}
                  </select>
                </div>
                <div>
                  <label style={{ fontSize: 9, fontWeight: 700, color: '#9CA3AF', textTransform: 'uppercase', letterSpacing: '0.07em', display: 'block', marginBottom: 3 }}>Type</label>
                  <select value={post.post_type} onChange={e => patchPost(post.id, { post_type: e.target.value })} style={{ ...SEL, fontSize: 12, appearance: 'auto' }}>
                    {POST_TYPES.map(t => <option key={t}>{t}</option>)}
                  </select>
                </div>
                <div>
                  <label style={{ fontSize: 9, fontWeight: 700, color: '#9CA3AF', textTransform: 'uppercase', letterSpacing: '0.07em', display: 'block', marginBottom: 3 }}>Post Link</label>
                  <input type="url" placeholder="https://…" value={post.post_link} onChange={e => patchPost(post.id, { post_link: e.target.value })} style={{ ...INP, fontSize: 12 }} />
                </div>
                <button onClick={() => setPosts(prev => prev.filter(p => p.id !== post.id))} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#9CA3AF', padding: '0 4px', paddingBottom: 6 }}>
                  <Trash2 size={14} />
                </button>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Error */}
      {error && (
        <div style={{ background: 'rgba(239,68,68,0.06)', border: '1px solid rgba(239,68,68,0.2)', borderRadius: 10, padding: '10px 14px', marginBottom: 16 }}>
          <p style={{ fontSize: 12, color: '#EF4444', margin: 0, fontWeight: 600 }}>{error}</p>
        </div>
      )}

      {/* Submit button */}
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
          transition: 'all 0.15s',
        }}>
        {isPending
          ? <><Loader2 size={16} className="animate-spin" /> Submitting…</>
          : 'Submit Update'}
      </button>

    </div>
  )
}
