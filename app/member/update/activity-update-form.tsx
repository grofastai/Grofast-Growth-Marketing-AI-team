'use client'

import { useState, useTransition, useMemo } from 'react'
import { useRouter } from 'next/navigation'
import { CheckCircle2, Loader2, Plus, Trash2, Clock, Hash } from 'lucide-react'
import { submitWorkLogs, type Activity, type WorkLogInput, type ContentPostInput } from '@/lib/actions/work-logs'

const TEAM_LABELS: Record<string, { label: string; color: string; bg: string; border: string }> = {
  MEDIA:    { label: 'Media & Video',    color: '#E53935', bg: 'rgba(229,57,53,0.06)',   border: 'rgba(229,57,53,0.18)'   },
  META:     { label: 'Meta & Marketing', color: '#D97706', bg: 'rgba(217,119,6,0.06)',   border: 'rgba(217,119,6,0.18)'   },
  CREATIVE: { label: 'Creative Design',  color: '#7C3AED', bg: 'rgba(124,58,237,0.06)',  border: 'rgba(124,58,237,0.18)'  },
  AI:       { label: 'AI & Tech',        color: '#059669', bg: 'rgba(5,150,105,0.06)',   border: 'rgba(5,150,105,0.18)'   },
  OPS:      { label: 'Operations',       color: '#2563EB', bg: 'rgba(37,99,235,0.06)',   border: 'rgba(37,99,235,0.18)'   },
}
const TEAM_ORDER = ['MEDIA', 'META', 'CREATIVE', 'AI', 'OPS']

const PLATFORMS  = ['Instagram', 'YouTube', 'Facebook', 'LinkedIn', 'Twitter', 'Other']
const POST_TYPES = ['Reel', 'Poster', 'Story', 'Video', 'Carousel', 'Thread', 'Short', 'Other']

const INP: React.CSSProperties = {
  width: '100%', boxSizing: 'border-box' as const,
  padding: '9px 12px', borderRadius: 10,
  border: '1.5px solid #E5E7EB', fontSize: 13,
  color: '#111827', background: '#FFFFFF', outline: 'none',
}
const SEL: React.CSSProperties = { ...INP, cursor: 'pointer' }

// LogState keyed by a local UUID so multiple entries are uniquely identifiable
type LogBlock = {
  id: string          // local key only — not sent to server
  activity_id: string
  client_name: string
  hours: string
  item_titles: string[]
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
  return { id: crypto.randomUUID(), title: '', client_name: '', platform: 'Instagram', post_type: 'Reel', post_link: '', notes: '' }
}

function emptyBlock(activityId: string): LogBlock {
  return { id: crypto.randomUUID(), activity_id: activityId, client_name: '', hours: '', item_titles: [''], notes: '' }
}

function itemNoun(activity: Activity): string {
  const n = activity.name.toLowerCase()
  if (n.includes('reel'))                                        return 'Reel'
  if (n.includes('story'))                                       return 'Story'
  if (n.includes('video') || n.includes('edit'))                 return 'Video'
  if (n.includes('poster'))                                      return 'Poster'
  if (n.includes('thumbnail'))                                   return 'Thumbnail'
  if (n.includes('design') || n.includes('graphic'))             return 'Design'
  if (n.includes('upload') || n.includes('youtube'))             return 'Upload'
  if (n.includes('post'))                                        return 'Post'
  return 'Item'
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
  const [showPicker, setShowPicker] = useState(false)

  const [blocks, setBlocks] = useState<LogBlock[]>(() =>
    existingLogs.map(l => ({
      id: crypto.randomUUID(),
      activity_id: l.activity_id,
      client_name: l.client_name ?? '',
      hours: l.hours > 0 ? String(l.hours) : '',
      item_titles: l.item_titles?.length > 0 ? l.item_titles : l.unit_count > 0 ? Array(l.unit_count).fill('') : [''],
      notes: l.notes ?? '',
    }))
  )

  const [posts, setPosts] = useState<PostState[]>(() =>
    existingPosts.map(p => ({
      id: crypto.randomUUID(),
      title: p.title ?? '',
      client_name: p.client_name ?? '',
      platform: p.platform, post_type: p.post_type,
      post_link: p.post_link ?? '', notes: p.notes ?? '',
    }))
  )

  const addedActivityIds = useMemo(() => new Set(blocks.map(b => b.activity_id)), [blocks])

  const grouped = useMemo(() => {
    const m: Record<string, Activity[]> = {}
    for (const a of activities) {
      if (!m[a.team_category]) m[a.team_category] = []
      m[a.team_category].push(a)
    }
    return m
  }, [activities])

  function addBlock(activityId: string) {
    setBlocks(prev => [...prev, emptyBlock(activityId)])
    setShowPicker(false)
  }

  function removeBlock(id: string) {
    setBlocks(prev => prev.filter(b => b.id !== id))
  }

  function patchBlock(id: string, patch: Partial<LogBlock>) {
    setBlocks(prev => prev.map(b => b.id === id ? { ...b, ...patch } : b))
  }

  function patchPost(pid: string, patch: Partial<PostState>) {
    setPosts(prev => prev.map(p => p.id === pid ? { ...p, ...patch } : p))
  }

  const totalHours = useMemo(() =>
    blocks.reduce((s, b) => s + (parseFloat(b.hours) || 0), 0)
  , [blocks])

  function handleSubmit() {
    setError(null)
    if (blocks.length === 0 && posts.length === 0) {
      setError('Add at least one work block or post.')
      return
    }
    const logInputs: WorkLogInput[] = blocks.map(b => {
      const filledTitles = b.item_titles.filter(t => t.trim() !== '')
      return {
        activity_id: b.activity_id,
        client_name: b.client_name,
        hours: parseFloat(b.hours) || 0,
        unit_count: filledTitles.length || 0,
        item_titles: filledTitles,
        notes: b.notes,
      }
    })
    const postInputs: ContentPostInput[] = posts
      .filter(p => p.platform && p.post_type)
      .map(p => ({ title: p.title, client_name: p.client_name, platform: p.platform, post_type: p.post_type, post_link: p.post_link, notes: p.notes }))

    start(async () => {
      const res = await submitWorkLogs(today, logInputs, postInputs)
      if (!res.success) { setError(res.error ?? 'Submission failed.'); return }
      setSubmitted(true)
      router.refresh()
    })
  }

  const dateLabel = new Date(today + 'T12:00:00').toLocaleDateString('en-IN', { weekday: 'long', day: 'numeric', month: 'long' })

  // ── Submitted ──────────────────────────────────────────────────────────────
  if (submitted && !isPending) {
    return (
      <div style={{ maxWidth: 580, margin: '0 auto', padding: '32px 20px' }}>
        <div style={{ background: '#FFFFFF', borderRadius: 20, padding: '40px 32px', textAlign: 'center', border: '1px solid #E5E7EB', boxShadow: '0 4px 24px rgba(0,0,0,0.06)' }}>
          <CheckCircle2 size={52} style={{ color: '#16A34A', margin: '0 auto 16px' }} />
          <h2 style={{ fontSize: 22, fontWeight: 900, color: '#111827', margin: '0 0 8px', fontFamily: 'var(--font-jakarta)' }}>Update Submitted!</h2>
          <p style={{ fontSize: 13, color: '#6B7280', margin: '0 0 6px' }}>{dateLabel}</p>
          <p style={{ fontSize: 13, color: '#9CA3AF', margin: '0 0 28px' }}>
            {blocks.length} {blocks.length === 1 ? 'block' : 'blocks'} · {posts.length} {posts.length === 1 ? 'post' : 'posts'}
            {totalHours > 0 && ` · ${totalHours.toFixed(1)}h logged`}
            {hourlyRate > 0 && totalHours > 0 && ` · ₹${Math.round(totalHours * hourlyRate)} cost`}
          </p>
          <button onClick={() => setSubmitted(false)} style={{ padding: '11px 32px', borderRadius: 12, background: '#DE1A1A', color: '#FFF', fontSize: 14, fontWeight: 700, border: 'none', cursor: 'pointer', boxShadow: '0 4px 14px rgba(222,26,26,0.3)' }}>
            Edit Update
          </button>
        </div>
      </div>
    )
  }

  if (activities.length === 0) {
    return (
      <div style={{ maxWidth: 580, margin: '0 auto', padding: '60px 20px', textAlign: 'center' }}>
        <div style={{ fontSize: 40, marginBottom: 16 }}>⚙️</div>
        <p style={{ fontSize: 15, fontWeight: 700, color: '#374151', margin: '0 0 8px' }}>No activities set up yet</p>
        <p style={{ fontSize: 13, color: '#9CA3AF', margin: 0 }}>Ask your admin to configure activities first.</p>
      </div>
    )
  }

  // ── Main form ──────────────────────────────────────────────────────────────
  return (
    <div style={{ maxWidth: 640, margin: '0 auto', padding: '24px 16px 80px' }}>

      {/* Header */}
      <div style={{ marginBottom: 24 }}>
        <h1 style={{ fontSize: 22, fontWeight: 900, color: '#111827', margin: '0 0 3px', fontFamily: 'var(--font-jakarta)' }}>Daily Update</h1>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
          <p style={{ fontSize: 13, color: '#6B7280', margin: 0 }}>{userName} · {dateLabel}</p>
          {totalHours > 0 && (
            <span style={{ fontSize: 11, fontWeight: 700, color: '#16A34A', background: 'rgba(22,163,74,0.08)', padding: '2px 10px', borderRadius: 6 }}>
              {totalHours.toFixed(1)}h{hourlyRate > 0 ? ` · ₹${Math.round(totalHours * hourlyRate)}` : ''}
            </span>
          )}
        </div>
      </div>

      {/* ── Work blocks ───────────────────────────────────────────────────────── */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginBottom: 10 }}>

        {/* Empty state */}
        {blocks.length === 0 && !showPicker && (
          <div style={{ borderRadius: 14, border: '1.5px dashed #E5E7EB', padding: '36px 24px', textAlign: 'center', background: '#FAFAFA' }}>
            <p style={{ fontSize: 28, margin: '0 0 10px' }}>📋</p>
            <p style={{ fontSize: 14, fontWeight: 700, color: '#374151', margin: '0 0 4px' }}>Nothing logged yet</p>
            <p style={{ fontSize: 12, color: '#9CA3AF', margin: 0 }}>Tap "Add Work Block" below to start</p>
          </div>
        )}

        {/* Blocks */}
        {blocks.map(block => {
          const act = activities.find(a => a.id === block.activity_id)
          if (!act) return null
          const cfg = TEAM_LABELS[act.team_category]
          const isHours = act.unit_type === 'hours' || act.unit_type === 'both'
          const isCount = act.unit_type === 'count' || act.unit_type === 'both'
          const noun    = itemNoun(act)

          return (
            <div key={block.id} style={{ background: '#FFFFFF', borderRadius: 14, border: `1.5px solid ${cfg.border}`, overflow: 'hidden', boxShadow: '0 1px 6px rgba(0,0,0,0.05)' }}>

              {/* Block header */}
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '11px 14px', background: cfg.bg, borderBottom: `1px solid ${cfg.border}` }}>
                <span style={{ fontSize: 20, flexShrink: 0 }}>{act.emoji}</span>
                <span style={{ fontSize: 14, fontWeight: 800, color: cfg.color, flex: 1, fontFamily: 'var(--font-jakarta)' }}>{act.name}</span>
                <span style={{ fontSize: 9, fontWeight: 800, color: cfg.color, background: `${cfg.color}18`, padding: '2px 7px', borderRadius: 4, textTransform: 'uppercase', letterSpacing: '0.07em', flexShrink: 0 }}>
                  {TEAM_LABELS[act.team_category].label.split(' ')[0]}
                </span>
                <button onClick={() => removeBlock(block.id)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#9CA3AF', padding: 4, flexShrink: 0, display: 'flex', alignItems: 'center' }}>
                  <Trash2 size={14} />
                </button>
              </div>

              {/* Block body */}
              <div style={{ padding: '14px', display: 'flex', flexDirection: 'column', gap: 12 }}>

                {/* Client */}
                <div>
                  <label style={{ fontSize: 10, fontWeight: 700, color: '#6B7280', textTransform: 'uppercase', letterSpacing: '0.07em', display: 'block', marginBottom: 5 }}>Client</label>
                  <select value={block.client_name} onChange={e => patchBlock(block.id, { client_name: e.target.value })} style={{ ...SEL, appearance: 'auto' }}>
                    <option value="">— Select client —</option>
                    {clientNames.map(n => <option key={n} value={n}>{n}</option>)}
                    <option value="Internal">Internal / Our Brand</option>
                  </select>
                </div>

                {/* Hours */}
                {isHours && (
                  <div>
                    <label style={{ fontSize: 10, fontWeight: 700, color: '#6B7280', textTransform: 'uppercase', letterSpacing: '0.07em', display: 'block', marginBottom: 5 }}>
                      <Clock size={10} style={{ display: 'inline', marginRight: 3 }} />Hours Spent
                    </label>
                    <input type="number" min="0" max="24" step="0.5" placeholder="e.g. 2.5" value={block.hours} onChange={e => patchBlock(block.id, { hours: e.target.value })} style={{ ...INP, maxWidth: 130 }} />
                  </div>
                )}

                {/* Item titles */}
                {isCount && (
                  <div>
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 7 }}>
                      <label style={{ fontSize: 10, fontWeight: 700, color: '#6B7280', textTransform: 'uppercase', letterSpacing: '0.07em' }}>
                        <Hash size={10} style={{ display: 'inline', marginRight: 3 }} />{noun}s
                      </label>
                      <span style={{ fontSize: 10, color: '#9CA3AF' }}>{block.item_titles.length} {block.item_titles.length === 1 ? noun.toLowerCase() : noun.toLowerCase() + 's'}</span>
                    </div>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                      {block.item_titles.map((title, idx) => (
                        <div key={idx} style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                          <input
                            type="text"
                            placeholder={`${noun} ${idx + 1} name (e.g. Summer Sale)`}
                            value={title}
                            onChange={e => {
                              const next = [...block.item_titles]
                              next[idx] = e.target.value
                              patchBlock(block.id, { item_titles: next })
                            }}
                            style={{ ...INP, flex: 1 }}
                          />
                          {block.item_titles.length > 1 && (
                            <button onClick={() => patchBlock(block.id, { item_titles: block.item_titles.filter((_, i) => i !== idx) })} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#9CA3AF', padding: 4, flexShrink: 0 }}>
                              <Trash2 size={12} />
                            </button>
                          )}
                        </div>
                      ))}
                    </div>
                    <button
                      onClick={() => patchBlock(block.id, { item_titles: [...block.item_titles, ''] })}
                      style={{ marginTop: 8, display: 'flex', alignItems: 'center', gap: 5, padding: '5px 11px', borderRadius: 8, border: `1px dashed ${cfg.color}`, background: cfg.bg, color: cfg.color, fontSize: 11, fontWeight: 700, cursor: 'pointer' }}>
                      <Plus size={11} /> Add {noun}
                    </button>
                  </div>
                )}

                {/* Notes */}
                <div>
                  <label style={{ fontSize: 10, fontWeight: 700, color: '#6B7280', textTransform: 'uppercase', letterSpacing: '0.07em', display: 'block', marginBottom: 5 }}>Notes (optional)</label>
                  <input type="text" placeholder="Campaign name, details…" value={block.notes} onChange={e => patchBlock(block.id, { notes: e.target.value })} style={INP} />
                </div>

              </div>
            </div>
          )
        })}

        {/* Activity picker panel */}
        {showPicker && (
          <div style={{ background: '#FFFFFF', borderRadius: 14, border: '1.5px solid #E5E7EB', padding: '14px 16px', boxShadow: '0 4px 16px rgba(0,0,0,0.07)' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 }}>
              <p style={{ fontSize: 13, fontWeight: 800, color: '#111827', margin: 0, fontFamily: 'var(--font-jakarta)' }}>What did you work on?</p>
              <button onClick={() => setShowPicker(false)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#9CA3AF', padding: 4, fontSize: 16, lineHeight: 1 }}>✕</button>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
              {TEAM_ORDER.filter(tc => grouped[tc]?.length).map(tc => {
                const cfg = TEAM_LABELS[tc]
                return (
                  <div key={tc}>
                    <p style={{ fontSize: 9, fontWeight: 800, color: cfg.color, textTransform: 'uppercase', letterSpacing: '0.12em', margin: '0 0 8px' }}>{cfg.label}</p>
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 7 }}>
                      {grouped[tc].map(a => {
                        const done = addedActivityIds.has(a.id)
                        return (
                          <button
                            key={a.id}
                            onClick={() => !done && addBlock(a.id)}
                            disabled={done}
                            style={{
                              display: 'flex', alignItems: 'center', gap: 5,
                              padding: '6px 12px', borderRadius: 9, fontSize: 12, fontWeight: 600,
                              border: `1.5px solid ${done ? '#E5E7EB' : cfg.color}`,
                              background: done ? '#F9FAFB' : cfg.bg,
                              color: done ? '#C4C9D4' : cfg.color,
                              cursor: done ? 'default' : 'pointer',
                              transition: 'opacity 0.1s',
                            }}>
                            {a.emoji} {a.name}
                            {done && <span style={{ fontSize: 10 }}>✓</span>}
                          </button>
                        )
                      })}
                    </div>
                  </div>
                )
              })}
            </div>
          </div>
        )}
      </div>

      {/* Add Work Block button */}
      {!showPicker && (
        <button
          onClick={() => setShowPicker(true)}
          style={{
            width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
            padding: '12px 0', borderRadius: 12, marginBottom: 20,
            border: '1.5px dashed #DE1A1A', background: 'rgba(222,26,26,0.03)',
            color: '#DE1A1A', fontSize: 13, fontWeight: 700, cursor: 'pointer',
          }}>
          <Plus size={14} /> Add Work Block
        </button>
      )}

      {/* ── Posts Published Today ──────────────────────────────────────────────── */}
      <div style={{ background: '#FFFFFF', borderRadius: 14, border: '1px solid #EBEDF2', marginBottom: 20, overflow: 'hidden', boxShadow: '0 1px 6px rgba(0,0,0,0.04)' }}>
        <div style={{ padding: '12px 16px', borderBottom: '1px solid #F3F4F6', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div>
            <p style={{ fontSize: 13, fontWeight: 800, color: '#111827', margin: 0, fontFamily: 'var(--font-jakarta)' }}>📱 Posts Published Today</p>
            <p style={{ fontSize: 11, color: '#9CA3AF', margin: '2px 0 0' }}>Log every post you published</p>
          </div>
          <button onClick={() => setPosts(p => [...p, emptyPost()])} style={{ display: 'flex', alignItems: 'center', gap: 5, padding: '6px 12px', borderRadius: 8, border: '1.5px solid #2563EB', background: 'rgba(37,99,235,0.06)', color: '#2563EB', fontSize: 12, fontWeight: 700, cursor: 'pointer' }}>
            <Plus size={12} /> Add Post
          </button>
        </div>

        {posts.length === 0 ? (
          <p style={{ fontSize: 12, color: '#9CA3AF', textAlign: 'center', padding: '18px 0', margin: 0 }}>No posts logged — tap Add Post</p>
        ) : (
          <div style={{ padding: '10px 14px', display: 'flex', flexDirection: 'column', gap: 10 }}>
            {posts.map(post => (
              <div key={post.id} style={{ display: 'grid', gridTemplateColumns: '1.5fr 1fr 1fr 1fr 1fr auto', gap: 7, alignItems: 'end' }}>
                <div>
                  <label style={{ fontSize: 9, fontWeight: 700, color: '#9CA3AF', textTransform: 'uppercase', letterSpacing: '0.07em', display: 'block', marginBottom: 3 }}>Title</label>
                  <input type="text" placeholder="e.g. Summer Sale Reel" value={post.title} onChange={e => patchPost(post.id, { title: e.target.value })} style={{ ...INP, fontSize: 12 }} />
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
                  <label style={{ fontSize: 9, fontWeight: 700, color: '#9CA3AF', textTransform: 'uppercase', letterSpacing: '0.07em', display: 'block', marginBottom: 3 }}>Link</label>
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
