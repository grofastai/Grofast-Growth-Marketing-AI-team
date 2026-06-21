'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import {
  Clock, TrendingUp, Film, ImageIcon, Share2, DollarSign,
  Users, BarChart3, ChevronDown, X, Search, Trophy, Zap,
  Building2, Star, Target,
} from 'lucide-react'

// ── helpers ──────────────────────────────────────────────────────────────────
function fmtRupee(n: number) { return `₹${Math.round(n).toLocaleString('en-IN')}` }
function fmtH(h: number)     { return `${h.toFixed(1)}h` }
function ini(n: string)      { return n.split(' ').map(w => w[0] ?? '').join('').slice(0, 2).toUpperCase() }
function avatarColor(name: string) {
  const colors = ['#DE1A1A','#6366F1','#10B981','#F59E0B','#8B5CF6','#06B6D4','#F97316','#EC4899']
  let h = 0; for (const c of name) h = (h * 31 + c.charCodeAt(0)) % colors.length
  return colors[h]
}

// ── SVG ring for productivity score ──────────────────────────────────────────
function ScoreRing({ score, size = 44 }: { score: number; size?: number }) {
  const r = size * 0.38, cx = size / 2, cy = size / 2
  const circ = 2 * Math.PI * r
  const filled = (Math.min(score, 100) / 100) * circ
  const color = score >= 70 ? '#10B981' : score >= 40 ? '#F59E0B' : '#EF4444'
  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
      <circle cx={cx} cy={cy} r={r} fill="none" stroke="#F0F0F0" strokeWidth={size * 0.11} />
      <circle cx={cx} cy={cy} r={r} fill="none" stroke={color} strokeWidth={size * 0.11}
        strokeDasharray={`${filled} ${circ - filled}`} strokeLinecap="round"
        transform={`rotate(-90 ${cx} ${cy})`} />
      <text x={cx} y={cy + 1} textAnchor="middle" dominantBaseline="middle"
        fontSize={size * 0.24} fontWeight="900" fill="#111">{score}</text>
    </svg>
  )
}

// ── mini bar ─────────────────────────────────────────────────────────────────
function MiniBar({ pct, color }: { pct: number; color: string }) {
  return (
    <div style={{ width: 60, height: 5, background: '#F3F4F6', borderRadius: 3, overflow: 'hidden' }}>
      <div style={{ width: `${Math.max(4, pct)}%`, height: '100%', background: color, borderRadius: 3 }} />
    </div>
  )
}

// ── types ─────────────────────────────────────────────────────────────────────
type LogEntry = {
  memberId: string; memberName: string; clientName: string
  activityName: string; activityEmoji: string
  hours: number; cost: number; titles: string[]
}
type EmpPerf = {
  id: string; name: string; employee_id: string
  clients: string[]; tasksCompleted: number
  hours: number; workValue: number; salary: number; hourlyRate: number
  hoursPerClient: { name: string; hours: number }[]
  productivityScore: number
}

const TEAM_CFG: Record<string, { label: string; color: string }> = {
  MEDIA:    { label: 'Media & Video',    color: '#E53935' },
  META:     { label: 'Meta & Marketing', color: '#F59E0B' },
  CREATIVE: { label: 'Creative Design',  color: '#8B5CF6' },
  AI:       { label: 'AI & Tech',        color: '#10B981' },
  OPS:      { label: 'Operations',       color: '#3B82F6' },
}
const TEAM_ORDER = ['MEDIA', 'META', 'CREATIVE', 'AI', 'OPS']

// ── shared card style ─────────────────────────────────────────────────────────
const CARD: React.CSSProperties = {
  background: '#FFFFFF',
  borderRadius: 20,
  border: '1px solid #EBEDF2',
  overflow: 'hidden',
  boxShadow: '0 2px 12px rgba(0,0,0,0.05)',
}

// ── section title row ──────────────────────────────────────────────────────────
function SectionTitle({ icon, title, sub }: { icon: React.ReactNode; title: string; sub?: string }) {
  return (
    <div style={{ padding: '18px 20px 14px', borderBottom: '1px solid #F3F4F6', display: 'flex', alignItems: 'center', gap: 10 }}>
      <div style={{ width: 34, height: 34, borderRadius: 10, background: '#F3F4F6', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
        {icon}
      </div>
      <div>
        <p style={{ fontSize: 14, fontWeight: 800, color: '#111827', margin: 0, fontFamily: 'var(--font-jakarta)' }}>{title}</p>
        {sub && <p style={{ fontSize: 11, color: '#9CA3AF', margin: '1px 0 0' }}>{sub}</p>}
      </div>
    </div>
  )
}

function EmptyRow({ msg }: { msg: string }) {
  return <p style={{ fontSize: 12, color: '#9CA3AF', textAlign: 'center', padding: '32px 0', margin: 0 }}>{msg}</p>
}

// ─────────────────────────────────────────────────────────────────────────────

export default function InsightsClient({
  month, today,
  teamHours, activityStats, memberStats, clientStats,
  postsByType, postsByPlatform, recentPosts, kpis,
  employeePerformance, logEntries,
}: {
  month: string
  today: string
  teamHours: Record<string, number>
  activityStats: Array<{ name: string; emoji: string; team: string; hours: number; count: number; cost: number; titles: string[] }>
  memberStats: Array<{ name: string; employee_id: string; hours: number; cost: number; entries: number }>
  clientStats: Array<{ name: string; hours: number; cost: number }>
  postsByType: Record<string, number>
  postsByPlatform: Record<string, number>
  recentPosts: Array<{ memberName: string; client_name: string | null; platform: string; post_type: string; date: string }>
  kpis: { totalHours: number; totalCost: number; totalVideos: number; totalPosters: number; totalPosts: number }
  employeePerformance: EmpPerf[]
  logEntries: LogEntry[]
}) {
  const router = useRouter()

  const [filterMember, setFilterMember] = useState('')
  const [filterClient, setFilterClient] = useState('')
  const [drillOpen, setDrillOpen]       = useState(false)

  const maxTeamHours = Math.max(...Object.values(teamHours), 1)
  const maxEmpHours  = Math.max(...employeePerformance.map(e => e.hours), 1)
  const hasData      = kpis.totalHours > 0 || kpis.totalPosts > 0

  const memberOptions = Array.from(new Map(logEntries.map(e => [e.memberId, e.memberName])).entries())
    .sort((a, b) => a[1].localeCompare(b[1]))
  const clientOptions = Array.from(new Set(logEntries.map(e => e.clientName).filter(c => c !== 'Unassigned')))
    .sort((a, b) => a.localeCompare(b))

  const filteredLogs    = logEntries.filter(e =>
    (!filterMember || e.memberId === filterMember) &&
    (!filterClient || e.clientName === filterClient)
  )
  const drillTotalHours = filteredLogs.reduce((s, e) => s + e.hours, 0)
  const drillTotalCost  = filteredLogs.reduce((s, e) => s + e.cost,  0)
  const hasFilter       = !!(filterMember || filterClient)

  const monthLabel = new Date(month + '-01').toLocaleDateString('en-IN', { month: 'long', year: 'numeric' })

  return (
    <div style={{ padding: '20px 16px 60px', background: '#F0F2F8', minHeight: '100vh' }} className="sm:px-7">

      {/* ── Hero Banner ──────────────────────────────────────────────────────── */}
      <div style={{
        background: 'linear-gradient(135deg, #1E3A8A 0%, #1D4ED8 45%, #2563EB 100%)',
        borderRadius: 24, marginBottom: 22,
        position: 'relative', overflow: 'hidden',
        padding: '28px 28px 26px 32px',
        boxShadow: '0 16px 48px rgba(29,78,216,0.38)',
      }}>
        {/* decorative orbs */}
        <div style={{ position: 'absolute', top: -60, right: 180, width: 260, height: 260, borderRadius: '50%', background: 'rgba(255,255,255,0.06)', pointerEvents: 'none' }} />
        <div style={{ position: 'absolute', bottom: -80, right: 40, width: 300, height: 300, borderRadius: '50%', background: 'rgba(255,255,255,0.04)', pointerEvents: 'none' }} />
        <div style={{ position: 'absolute', top: -20, left: -20, width: 140, height: 140, borderRadius: '50%', background: 'rgba(255,255,255,0.04)', pointerEvents: 'none' }} />

        <div style={{ position: 'relative', zIndex: 1 }}>
          {/* badge */}
          <div style={{ display: 'inline-flex', alignItems: 'center', gap: 6, background: 'rgba(255,255,255,0.15)', borderRadius: 20, padding: '4px 14px', marginBottom: 14, border: '1px solid rgba(255,255,255,0.2)' }}>
            <BarChart3 size={12} style={{ color: '#93C5FD' }} />
            <span style={{ fontSize: 11, fontWeight: 700, color: '#DBEAFE', letterSpacing: '0.04em' }}>TEAM ANALYTICS</span>
          </div>

          <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 16, flexWrap: 'wrap' }}>
            <div>
              <h1 style={{ fontSize: 28, fontWeight: 900, color: '#FFF', margin: '0 0 4px', fontFamily: 'var(--font-jakarta)', lineHeight: 1.2 }}>
                Team Insights
              </h1>
              <p style={{ fontSize: 13, color: 'rgba(255,255,255,0.6)', margin: '0 0 20px' }}>{monthLabel}</p>

              {/* hero quick stats */}
              <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
                {[
                  { icon: <Clock size={13} />, label: `${kpis.totalHours.toFixed(1)}h logged` },
                  { icon: <Users size={13} />, label: `${employeePerformance.length} members` },
                  { icon: <Building2 size={13} />, label: `${clientStats.length} clients` },
                  { icon: <DollarSign size={13} />, label: `${fmtRupee(kpis.totalCost)} value` },
                ].map(chip => (
                  <div key={chip.label} style={{ display: 'flex', alignItems: 'center', gap: 5, background: 'rgba(255,255,255,0.12)', border: '1px solid rgba(255,255,255,0.18)', borderRadius: 10, padding: '5px 12px' }}>
                    <span style={{ color: 'rgba(255,255,255,0.75)', display: 'flex' }}>{chip.icon}</span>
                    <span style={{ fontSize: 12, fontWeight: 600, color: '#FFF' }}>{chip.label}</span>
                  </div>
                ))}
              </div>
            </div>

            {/* month picker */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: 4, alignSelf: 'center' }}>
              <label style={{ fontSize: 10, fontWeight: 700, color: 'rgba(255,255,255,0.5)', letterSpacing: '0.06em', textTransform: 'uppercase' }}>Month</label>
              <input
                type="month"
                value={month}
                max={today.slice(0, 7)}
                onChange={e => router.push(`/admin/insights?month=${e.target.value}`)}
                style={{
                  padding: '9px 14px', borderRadius: 12, border: '1.5px solid rgba(255,255,255,0.25)',
                  fontSize: 13, fontWeight: 700, color: '#FFF',
                  background: 'rgba(255,255,255,0.12)', outline: 'none', cursor: 'pointer',
                  colorScheme: 'dark',
                }}
              />
            </div>
          </div>
        </div>
      </div>

      {/* ── No data ──────────────────────────────────────────────────────────── */}
      {!hasData && (
        <div style={{ ...CARD, padding: '60px 24px', textAlign: 'center', marginBottom: 20 }}>
          <div style={{ width: 64, height: 64, borderRadius: 20, background: 'rgba(29,78,216,0.08)', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 16px' }}>
            <BarChart3 size={28} style={{ color: '#1D4ED8' }} />
          </div>
          <p style={{ fontSize: 15, fontWeight: 800, color: '#374151', margin: '0 0 6px', fontFamily: 'var(--font-jakarta)' }}>No data for {monthLabel}</p>
          <p style={{ fontSize: 13, color: '#9CA3AF', margin: 0 }}>Team members need to submit daily updates with the activity form.</p>
        </div>
      )}

      {/* ── KPI Cards ────────────────────────────────────────────────────────── */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5" style={{ gap: 12, marginBottom: 20 }}>
        {[
          { label: 'Total Hours',     value: fmtH(kpis.totalHours),    icon: <Clock size={18} />,    color: '#1D4ED8', bg: '#EFF6FF', border: '#BFDBFE' },
          { label: 'Videos Edited',   value: String(kpis.totalVideos),  icon: <Film size={18} />,     color: '#E53935', bg: '#FFF5F5', border: '#FECACA' },
          { label: 'Posters Made',    value: String(kpis.totalPosters), icon: <ImageIcon size={18} />,color: '#8B5CF6', bg: '#F5F3FF', border: '#DDD6FE' },
          { label: 'Posts Published', value: String(kpis.totalPosts),   icon: <Share2 size={18} />,   color: '#10B981', bg: '#F0FDF4', border: '#A7F3D0' },
          { label: 'Team Value',      value: fmtRupee(kpis.totalCost),  icon: <TrendingUp size={18} />, color: '#F59E0B', bg: '#FFFBEB', border: '#FDE68A' },
        ].map(k => (
          <div key={k.label} style={{ background: k.bg, borderRadius: 16, border: `1.5px solid ${k.border}`, padding: '16px 18px' }}>
            <div style={{ width: 36, height: 36, borderRadius: 10, background: '#FFF', display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: 10, boxShadow: '0 1px 4px rgba(0,0,0,0.07)' }}>
              <span style={{ color: k.color, display: 'flex' }}>{k.icon}</span>
            </div>
            <p style={{ fontSize: 22, fontWeight: 900, color: k.color, margin: '0 0 2px', fontFamily: 'var(--font-jakarta)', lineHeight: 1 }}>{k.value}</p>
            <p style={{ fontSize: 11, color: '#6B7280', margin: 0, fontWeight: 600 }}>{k.label}</p>
          </div>
        ))}
      </div>

      {/* ── Work Drill-Down Filter ───────────────────────────────────────────── */}
      <div style={{ ...CARD, marginBottom: 20 }}>
        {/* header row — always visible */}
        <div
          style={{ padding: '16px 20px', display: 'flex', alignItems: 'center', gap: 12, cursor: 'pointer', userSelect: 'none' }}
          onClick={() => setDrillOpen(o => !o)}
        >
          <div style={{ width: 36, height: 36, borderRadius: 10, background: hasFilter ? 'rgba(29,78,216,0.1)' : '#F3F4F6', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
            <Search size={16} style={{ color: hasFilter ? '#1D4ED8' : '#6B7280' }} />
          </div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <p style={{ fontSize: 14, fontWeight: 800, color: '#111827', margin: 0, fontFamily: 'var(--font-jakarta)' }}>Work Drill-Down</p>
            {hasFilter
              ? <p style={{ fontSize: 11, color: '#1D4ED8', margin: '1px 0 0', fontWeight: 600 }}>
                  {filterMember ? memberOptions.find(([id]) => id === filterMember)?.[1] : 'All Members'}
                  {' · '}
                  {filterClient || 'All Clients'}
                  {' · '}{filteredLogs.length} entries
                </p>
              : <p style={{ fontSize: 11, color: '#9CA3AF', margin: '1px 0 0' }}>Filter by member, client, or both</p>
            }
          </div>
          {hasFilter && (
            <button
              onClick={e => { e.stopPropagation(); setFilterMember(''); setFilterClient('') }}
              style={{ width: 28, height: 28, borderRadius: 8, border: '1px solid #E5E7EB', background: '#F9FAFB', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', flexShrink: 0 }}
            >
              <X size={13} style={{ color: '#6B7280' }} />
            </button>
          )}
          <ChevronDown size={16} style={{ color: '#9CA3AF', flexShrink: 0, transform: drillOpen ? 'rotate(180deg)' : 'none', transition: 'transform 0.2s' }} />
        </div>

        {/* filter selectors */}
        {drillOpen && (
          <div style={{ borderTop: '1px solid #F3F4F6' }}>
            <div style={{ padding: '16px 20px', display: 'flex', gap: 12, flexWrap: 'wrap' }}>
              {/* member select */}
              <div style={{ flex: 1, minWidth: 180 }}>
                <label style={{ display: 'block', fontSize: 10, fontWeight: 800, color: '#6B7280', letterSpacing: '0.06em', textTransform: 'uppercase', marginBottom: 6 }}>Team Member</label>
                <div style={{ position: 'relative' }}>
                  <select
                    value={filterMember}
                    onChange={e => setFilterMember(e.target.value)}
                    style={{ width: '100%', appearance: 'none', padding: '10px 36px 10px 14px', borderRadius: 12, border: `1.5px solid ${filterMember ? '#1D4ED8' : '#E5E7EB'}`, fontSize: 13, fontWeight: 600, color: filterMember ? '#1D4ED8' : '#374151', background: filterMember ? '#EFF6FF' : '#FFF', outline: 'none', cursor: 'pointer' }}
                  >
                    <option value="">All Members</option>
                    {memberOptions.map(([id, name]) => (
                      <option key={id} value={id}>{name}</option>
                    ))}
                  </select>
                  <ChevronDown size={14} style={{ position: 'absolute', right: 12, top: '50%', transform: 'translateY(-50%)', color: '#9CA3AF', pointerEvents: 'none' }} />
                </div>
              </div>

              {/* client select */}
              <div style={{ flex: 1, minWidth: 180 }}>
                <label style={{ display: 'block', fontSize: 10, fontWeight: 800, color: '#6B7280', letterSpacing: '0.06em', textTransform: 'uppercase', marginBottom: 6 }}>Client</label>
                <div style={{ position: 'relative' }}>
                  <select
                    value={filterClient}
                    onChange={e => setFilterClient(e.target.value)}
                    style={{ width: '100%', appearance: 'none', padding: '10px 36px 10px 14px', borderRadius: 12, border: `1.5px solid ${filterClient ? '#6366F1' : '#E5E7EB'}`, fontSize: 13, fontWeight: 600, color: filterClient ? '#6366F1' : '#374151', background: filterClient ? '#EEF2FF' : '#FFF', outline: 'none', cursor: 'pointer' }}
                  >
                    <option value="">All Clients</option>
                    {clientOptions.map(c => (
                      <option key={c} value={c}>{c}</option>
                    ))}
                  </select>
                  <ChevronDown size={14} style={{ position: 'absolute', right: 12, top: '50%', transform: 'translateY(-50%)', color: '#9CA3AF', pointerEvents: 'none' }} />
                </div>
              </div>
            </div>

            {/* results */}
            {hasFilter && (
              <div style={{ borderTop: '1px solid #F3F4F6' }}>
                {/* summary strip */}
                <div style={{ padding: '10px 20px', background: '#F9FAFB', display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                  {filterMember && (
                    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5, fontSize: 11, fontWeight: 700, padding: '3px 10px', borderRadius: 20, background: '#EFF6FF', color: '#1D4ED8', border: '1px solid #BFDBFE' }}>
                      <Users size={10} /> {memberOptions.find(([id]) => id === filterMember)?.[1]}
                    </span>
                  )}
                  {filterClient && (
                    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5, fontSize: 11, fontWeight: 700, padding: '3px 10px', borderRadius: 20, background: '#EEF2FF', color: '#6366F1', border: '1px solid #C7D2FE' }}>
                      <Building2 size={10} /> {filterClient}
                    </span>
                  )}
                  <div style={{ marginLeft: 'auto', display: 'flex', gap: 14 }}>
                    <span style={{ fontSize: 12, fontWeight: 800, color: '#1D4ED8' }}>{fmtH(drillTotalHours)}</span>
                    <span style={{ fontSize: 12, fontWeight: 800, color: '#16A34A' }}>{fmtRupee(drillTotalCost)}</span>
                    <span style={{ fontSize: 11, color: '#9CA3AF' }}>{filteredLogs.length} entries</span>
                  </div>
                </div>

                {filteredLogs.length === 0
                  ? <EmptyRow msg="No work logged for this combination" />
                  : (
                    <div style={{ overflowX: 'auto' }}>
                      <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 520 }}>
                        <thead>
                          <tr style={{ background: '#F9FAFB' }}>
                            {!filterMember && <th style={TH_STYLE}>Member</th>}
                            {!filterClient  && <th style={TH_STYLE}>Client</th>}
                            <th style={TH_STYLE}>Activity</th>
                            <th style={TH_STYLE}>Work Done</th>
                            <th style={{ ...TH_STYLE, textAlign: 'right' }}>Hours</th>
                            <th style={{ ...TH_STYLE, textAlign: 'right' }}>Value</th>
                          </tr>
                        </thead>
                        <tbody>
                          {filteredLogs.map((e, i) => (
                            <tr key={i} style={{ borderBottom: '1px solid #F9FAFB', background: i % 2 === 0 ? '#FFF' : '#FAFBFF' }}>
                              {!filterMember && (
                                <td style={{ padding: '10px 16px' }}>
                                  <div style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
                                    <div style={{ width: 26, height: 26, borderRadius: 8, background: `${avatarColor(e.memberName)}18`, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                                      <span style={{ fontSize: 9, fontWeight: 900, color: avatarColor(e.memberName) }}>{ini(e.memberName)}</span>
                                    </div>
                                    <span style={{ fontSize: 12, fontWeight: 700, color: '#374151', whiteSpace: 'nowrap' }}>{e.memberName}</span>
                                  </div>
                                </td>
                              )}
                              {!filterClient && (
                                <td style={{ padding: '10px 16px', fontSize: 11, fontWeight: 700, color: '#6366F1', whiteSpace: 'nowrap', maxWidth: 140, overflow: 'hidden', textOverflow: 'ellipsis' }}>{e.clientName}</td>
                              )}
                              <td style={{ padding: '10px 16px', fontSize: 12, color: '#374151', whiteSpace: 'nowrap' }}>
                                <span style={{ marginRight: 5 }}>{e.activityEmoji}</span>{e.activityName}
                              </td>
                              <td style={{ padding: '10px 16px', maxWidth: 240 }}>
                                {e.titles.length > 0
                                  ? <span style={{ fontSize: 11, color: '#6B7280', lineHeight: 1.5 }}>{e.titles.join(', ')}</span>
                                  : <span style={{ fontSize: 11, color: '#D1D5DB', fontStyle: 'italic' }}>—</span>}
                              </td>
                              <td style={{ padding: '10px 16px', fontSize: 13, fontWeight: 800, color: '#1D4ED8', textAlign: 'right', whiteSpace: 'nowrap', fontFamily: 'var(--font-jakarta)' }}>{fmtH(e.hours)}</td>
                              <td style={{ padding: '10px 16px', fontSize: 13, fontWeight: 800, color: '#16A34A', textAlign: 'right', whiteSpace: 'nowrap', fontFamily: 'var(--font-jakarta)' }}>{fmtRupee(e.cost)}</td>
                            </tr>
                          ))}
                        </tbody>
                        <tfoot>
                          <tr style={{ background: '#F0F4FF', borderTop: '2px solid #C7D2FE' }}>
                            <td colSpan={(!filterMember ? 1 : 0) + (!filterClient ? 1 : 0) + 2}
                              style={{ padding: '11px 16px', fontSize: 12, fontWeight: 800, color: '#1E3A8A' }}>
                              Monthly Total
                            </td>
                            <td style={{ padding: '11px 16px', fontSize: 15, fontWeight: 900, color: '#1D4ED8', textAlign: 'right', fontFamily: 'var(--font-jakarta)' }}>{fmtH(drillTotalHours)}</td>
                            <td style={{ padding: '11px 16px', fontSize: 15, fontWeight: 900, color: '#16A34A', textAlign: 'right', fontFamily: 'var(--font-jakarta)' }}>{fmtRupee(drillTotalCost)}</td>
                          </tr>
                        </tfoot>
                      </table>
                    </div>
                  )
                }
              </div>
            )}
          </div>
        )}
      </div>

      {/* ── Employee Performance Table ───────────────────────────────────────── */}
      {employeePerformance.length > 0 && (
        <div style={{ ...CARD, marginBottom: 20 }}>
          <SectionTitle
            icon={<Users size={17} style={{ color: '#1D4ED8' }} />}
            title="Employee Performance"
            sub={`${monthLabel} · Score = Value/Salary + Tasks + Hours`}
          />
          <div className="overflow-x-auto">
            <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 760 }}>
              <thead>
                <tr style={{ background: '#F8FAFF' }}>
                  {['Employee', 'Clients', 'Tasks', 'Hours', 'Work Value', 'Salary', 'Value vs Pay', 'Score'].map(h => (
                    <th key={h} style={TH_STYLE}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {employeePerformance.map((emp, i) => {
                  const ratio      = emp.salary > 0 ? Math.round((emp.workValue / emp.salary) * 100) : null
                  const ratioColor = ratio == null ? '#9CA3AF' : ratio >= 100 ? '#10B981' : ratio >= 60 ? '#F59E0B' : '#EF4444'
                  const ratioBg    = ratio == null ? '#F3F4F6' : ratio >= 100 ? 'rgba(16,185,129,0.1)' : ratio >= 60 ? 'rgba(245,158,11,0.1)' : 'rgba(239,68,68,0.1)'
                  const clr        = avatarColor(emp.name)
                  return (
                    <tr key={emp.id} style={{ borderBottom: '1px solid #F3F4F6', background: i % 2 === 0 ? '#FFF' : '#FAFBFF' }}>
                      <td style={{ padding: '13px 16px' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                          <div style={{ width: 36, height: 36, borderRadius: 11, background: `${clr}18`, border: `1.5px solid ${clr}28`, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                            <span style={{ fontSize: 12, fontWeight: 900, color: clr }}>{ini(emp.name)}</span>
                          </div>
                          <div>
                            <p style={{ fontSize: 13, fontWeight: 800, color: '#111827', margin: 0 }}>{emp.name}</p>
                            <p style={{ fontSize: 10, color: '#B0B8C4', margin: 0 }}>#{emp.employee_id}</p>
                          </div>
                        </div>
                      </td>
                      <td style={{ padding: '13px 16px', maxWidth: 180 }}>
                        {emp.clients.length === 0
                          ? <span style={{ fontSize: 11, color: '#D1D5DB' }}>—</span>
                          : <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
                              {emp.clients.slice(0, 2).map(c => (
                                <span key={c} style={{ fontSize: 10, fontWeight: 700, padding: '2px 8px', borderRadius: 6, background: '#EEF2FF', color: '#6366F1', whiteSpace: 'nowrap' }}>{c}</span>
                              ))}
                              {emp.clients.length > 2 && <span style={{ fontSize: 10, fontWeight: 700, padding: '2px 8px', borderRadius: 6, background: '#F3F4F6', color: '#6B7280' }}>+{emp.clients.length - 2}</span>}
                            </div>
                        }
                      </td>
                      <td style={{ padding: '13px 16px' }}>
                        <span style={{ fontSize: 13, fontWeight: 800, color: emp.tasksCompleted > 0 ? '#111827' : '#D1D5DB' }}>{emp.tasksCompleted || '—'}</span>
                      </td>
                      <td style={{ padding: '13px 16px' }}>
                        <div>
                          <span style={{ fontSize: 13, fontWeight: 800, color: '#1D4ED8' }}>{emp.hours > 0 ? fmtH(emp.hours) : '—'}</span>
                          <MiniBar pct={Math.round((emp.hours / maxEmpHours) * 100)} color="#1D4ED8" />
                        </div>
                      </td>
                      <td style={{ padding: '13px 16px' }}>
                        <span style={{ fontSize: 13, fontWeight: 800, color: emp.workValue > 0 ? '#10B981' : '#D1D5DB' }}>{emp.workValue > 0 ? fmtRupee(emp.workValue) : '—'}</span>
                      </td>
                      <td style={{ padding: '13px 16px' }}>
                        <span style={{ fontSize: 13, fontWeight: 700, color: emp.salary > 0 ? '#374151' : '#D1D5DB' }}>{emp.salary > 0 ? fmtRupee(emp.salary) : 'Not set'}</span>
                      </td>
                      <td style={{ padding: '13px 16px' }}>
                        <span style={{ fontSize: 12, fontWeight: 800, padding: '4px 12px', borderRadius: 8, background: ratioBg, color: ratioColor, whiteSpace: 'nowrap' }}>
                          {ratio != null ? `${ratio}%` : '—'}
                        </span>
                      </td>
                      <td style={{ padding: '13px 16px' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                          <ScoreRing score={emp.productivityScore} size={40} />
                        </div>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
          <div style={{ padding: '10px 20px', background: '#F8FAFF', borderTop: '1px solid #F3F4F6', display: 'flex', gap: 20, flexWrap: 'wrap' }}>
            {[
              { color: '#10B981', label: '≥ 100% · generating more value than salary' },
              { color: '#F59E0B', label: '60–99% · moderate value output' },
              { color: '#EF4444', label: '< 60% · below expected value' },
            ].map(l => (
              <div key={l.label} style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                <div style={{ width: 8, height: 8, borderRadius: '50%', background: l.color }} />
                <span style={{ fontSize: 10, color: '#6B7280', fontWeight: 500 }}>{l.label}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ── Ranking + Hours per Client ────────────────────────────────────────── */}
      {employeePerformance.length > 0 && (
        <div className="grid grid-cols-1 lg:grid-cols-2" style={{ gap: 16, marginBottom: 20 }}>

          {/* Leaderboard */}
          <div style={CARD}>
            <SectionTitle icon={<Trophy size={17} style={{ color: '#F59E0B' }} />} title="Monthly Rankings" sub="Ranked by productivity score" />
            <div style={{ padding: '12px 16px', display: 'flex', flexDirection: 'column', gap: 8 }}>
              {[...employeePerformance].sort((a, b) => b.productivityScore - a.productivityScore).map((emp, i) => {
                const s   = emp.productivityScore
                const sc  = s >= 70 ? '#10B981' : s >= 40 ? '#F59E0B' : '#EF4444'
                const clr = avatarColor(emp.name)
                const podium = i === 0 ? { bg: '#FFFBEB', border: '#FDE68A', badge: '🥇' }
                             : i === 1 ? { bg: '#F8FAFF', border: '#E0E7FF', badge: '🥈' }
                             : i === 2 ? { bg: '#FFF8F0', border: '#FED7AA', badge: '🥉' }
                             : { bg: '#FAFAFA', border: 'transparent', badge: `${i + 1}` }
                return (
                  <div key={emp.id} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 12px', borderRadius: 14, background: podium.bg, border: `1px solid ${podium.border}` }}>
                    <span style={{ fontSize: i < 3 ? 18 : 11, fontWeight: 700, color: '#9CA3AF', width: 26, textAlign: 'center', flexShrink: 0 }}>{podium.badge}</span>
                    <div style={{ width: 34, height: 34, borderRadius: 11, background: `${clr}18`, border: `1.5px solid ${clr}28`, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                      <span style={{ fontSize: 11, fontWeight: 900, color: clr }}>{ini(emp.name)}</span>
                    </div>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <p style={{ fontSize: 13, fontWeight: 800, color: '#111827', margin: 0, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{emp.name}</p>
                      <p style={{ fontSize: 10, color: '#9CA3AF', margin: '1px 0 0' }}>{emp.clients.length} clients · {emp.tasksCompleted} tasks · {fmtH(emp.hours)}</p>
                    </div>
                    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 4, flexShrink: 0 }}>
                      <span style={{ fontSize: 15, fontWeight: 900, color: sc, fontFamily: 'var(--font-jakarta)' }}>{s}</span>
                      <MiniBar pct={s} color={sc} />
                    </div>
                  </div>
                )
              })}
            </div>
          </div>

          {/* Hours per Client */}
          <div style={CARD}>
            <SectionTitle icon={<Clock size={17} style={{ color: '#6366F1' }} />} title="Hours per Client" sub="Top 3 clients per team member" />
            <div style={{ padding: '14px 18px', display: 'flex', flexDirection: 'column', gap: 16 }}>
              {employeePerformance.filter(e => e.hoursPerClient.length > 0).map((emp, i) => {
                const clr = avatarColor(emp.name)
                const top = emp.hoursPerClient.slice(0, 3)
                const maxH = top[0]?.hours ?? 1
                return (
                  <div key={emp.id}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
                      <div style={{ width: 26, height: 26, borderRadius: 8, background: `${clr}18`, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                        <span style={{ fontSize: 9, fontWeight: 900, color: clr }}>{ini(emp.name)}</span>
                      </div>
                      <span style={{ fontSize: 12, fontWeight: 800, color: '#374151' }}>{emp.name}</span>
                      <span style={{ fontSize: 10, color: '#9CA3AF', marginLeft: 'auto' }}>{fmtH(emp.hours)} total</span>
                    </div>
                    <div style={{ paddingLeft: 34, display: 'flex', flexDirection: 'column', gap: 6 }}>
                      {top.map(c => (
                        <div key={c.name}>
                          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
                            <span style={{ fontSize: 11, color: '#6B7280', fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: 160 }}>{c.name}</span>
                            <span style={{ fontSize: 11, fontWeight: 800, color: clr, flexShrink: 0 }}>{fmtH(c.hours)}</span>
                          </div>
                          <div style={{ height: 6, background: '#F3F4F6', borderRadius: 3, overflow: 'hidden' }}>
                            <div style={{ width: `${Math.round((c.hours / maxH) * 100)}%`, height: '100%', background: clr, borderRadius: 3 }} />
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )
              })}
              {employeePerformance.every(e => e.hoursPerClient.length === 0) && <EmptyRow msg="No client hours logged yet" />}
            </div>
          </div>
        </div>
      )}

      {/* ── Team Hours + Activity Breakdown ──────────────────────────────────── */}
      <div className="grid grid-cols-1 lg:grid-cols-2" style={{ gap: 16, marginBottom: 20 }}>

        {/* Team Category Hours */}
        <div style={CARD}>
          <SectionTitle icon={<Zap size={17} style={{ color: '#F59E0B' }} />} title="Team Hours by Category" />
          <div style={{ padding: '16px 20px', display: 'flex', flexDirection: 'column', gap: 16 }}>
            {TEAM_ORDER.map(tc => {
              const cfg = TEAM_CFG[tc]
              const hrs = teamHours[tc] ?? 0
              const pct = Math.max(4, Math.round((hrs / maxTeamHours) * 100))
              return (
                <div key={tc}>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 7 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      <div style={{ width: 10, height: 10, borderRadius: 3, background: cfg.color, flexShrink: 0 }} />
                      <span style={{ fontSize: 13, fontWeight: 600, color: '#374151' }}>{cfg.label}</span>
                    </div>
                    <span style={{ fontSize: 15, fontWeight: 900, color: cfg.color, fontFamily: 'var(--font-jakarta)' }}>{fmtH(hrs)}</span>
                  </div>
                  <div style={{ height: 8, background: '#F3F4F6', borderRadius: 4, overflow: 'hidden' }}>
                    <div style={{ width: `${pct}%`, height: '100%', background: `linear-gradient(90deg, ${cfg.color}CC, ${cfg.color})`, borderRadius: 4, transition: 'width 0.4s ease' }} />
                  </div>
                </div>
              )
            })}
          </div>
        </div>

        {/* Activity Breakdown */}
        <div style={CARD}>
          <SectionTitle icon={<Target size={17} style={{ color: '#8B5CF6' }} />} title="Activity Breakdown" />
          {activityStats.length === 0
            ? <EmptyRow msg="No activities logged" />
            : (
              <div style={{ maxHeight: 340, overflowY: 'auto' }}>
                {activityStats.map((a, i) => {
                  const cfg = TEAM_CFG[a.team]
                  return (
                    <div key={i} style={{ borderBottom: '1px solid #F9FAFB' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '11px 20px' }}>
                        <span style={{ fontSize: 18, flexShrink: 0 }}>{a.emoji}</span>
                        <span style={{ fontSize: 13, fontWeight: 700, color: '#374151', flex: 1 }}>{a.name}</span>
                        {a.count > 0 && (
                          <span style={{ fontSize: 10, fontWeight: 800, padding: '2px 8px', borderRadius: 6, background: `${cfg.color}12`, color: cfg.color, flexShrink: 0 }}>{a.count} units</span>
                        )}
                        <span style={{ fontSize: 12, color: '#6B7280', minWidth: 38, textAlign: 'right', flexShrink: 0 }}>{fmtH(a.hours)}</span>
                        <span style={{ fontSize: 13, fontWeight: 900, color: '#111827', minWidth: 68, textAlign: 'right', fontFamily: 'var(--font-jakarta)', flexShrink: 0 }}>{fmtRupee(a.cost)}</span>
                      </div>
                      {a.titles.length > 0 && (
                        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4, padding: '0 20px 10px 48px' }}>
                          {a.titles.slice(0, 5).map((t, ti) => (
                            <span key={ti} style={{ fontSize: 10, fontWeight: 600, color: '#6B7280', background: '#F3F4F6', borderRadius: 6, padding: '2px 8px', maxWidth: 160, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{t}</span>
                          ))}
                          {a.titles.length > 5 && (
                            <span style={{ fontSize: 10, fontWeight: 600, color: '#9CA3AF', background: '#F3F4F6', borderRadius: 6, padding: '2px 8px' }}>+{a.titles.length - 5} more</span>
                          )}
                        </div>
                      )}
                    </div>
                  )
                })}
              </div>
            )}
        </div>
      </div>

      {/* ── Member Summary + Client Hours ─────────────────────────────────────── */}
      <div className="grid grid-cols-1 lg:grid-cols-2" style={{ gap: 16, marginBottom: 20 }}>

        {/* Member Working Hours */}
        <div style={CARD}>
          <SectionTitle icon={<Clock size={17} style={{ color: '#10B981' }} />} title="Member Working Hours" sub="Hours × Hourly Rate = Total Value" />
          {memberStats.length === 0
            ? <EmptyRow msg="No member data yet" />
            : employeePerformance.sort((a, b) => b.hours - a.hours).map((emp, i) => {
                const clr    = avatarColor(emp.name)
                const noRate = emp.hourlyRate === 0
                const ms     = memberStats.find(m => m.employee_id === emp.employee_id)
                return (
                  <div key={emp.id} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '12px 20px', borderBottom: '1px solid #F9FAFB' }}>
                    <div style={{ width: 36, height: 36, borderRadius: 11, background: `${clr}15`, border: `1.5px solid ${clr}25`, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                      <span style={{ fontSize: 11, fontWeight: 900, color: clr }}>{ini(emp.name)}</span>
                    </div>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <p style={{ fontSize: 13, fontWeight: 800, color: '#111827', margin: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{emp.name}</p>
                      <p style={{ fontSize: 10, color: '#9CA3AF', margin: '1px 0 0' }}>
                        {noRate ? 'Rate not set' : `${fmtRupee(emp.hourlyRate)}/hr`}
                        {ms && ` · ${ms.entries} logs`}
                      </p>
                    </div>
                    <div style={{ textAlign: 'right', flexShrink: 0 }}>
                      <p style={{ fontSize: 15, fontWeight: 900, color: '#1D4ED8', margin: 0, fontFamily: 'var(--font-jakarta)' }}>{fmtH(emp.hours)}</p>
                      <p style={{ fontSize: 11, fontWeight: 700, color: noRate ? '#9CA3AF' : '#10B981', margin: '1px 0 0' }}>{noRate ? '—' : fmtRupee(emp.workValue)}</p>
                    </div>
                  </div>
                )
              })
          }
        </div>

        {/* Client Hours */}
        <div style={CARD}>
          <SectionTitle icon={<Building2 size={17} style={{ color: '#6366F1' }} />} title="Client Hours & Cost" />
          {clientStats.length === 0
            ? <EmptyRow msg="No client data yet — members must select a client" />
            : clientStats.slice(0, 10).map((c, i) => {
                const pct = Math.round((c.hours / (clientStats[0]?.hours ?? 1)) * 100)
                return (
                  <div key={i} style={{ padding: '11px 20px', borderBottom: '1px solid #F9FAFB' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 5 }}>
                      <div style={{ width: 32, height: 32, borderRadius: 10, background: 'rgba(99,102,241,0.1)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                        <span style={{ fontSize: 9, fontWeight: 900, color: '#6366F1' }}>{ini(c.name)}</span>
                      </div>
                      <span style={{ fontSize: 13, fontWeight: 700, color: '#374151', flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{c.name}</span>
                      <span style={{ fontSize: 12, fontWeight: 700, color: '#6B7280', flexShrink: 0 }}>{fmtH(c.hours)}</span>
                      <span style={{ fontSize: 13, fontWeight: 900, color: '#111827', fontFamily: 'var(--font-jakarta)', flexShrink: 0, minWidth: 68, textAlign: 'right' }}>{fmtRupee(c.cost)}</span>
                    </div>
                    <div style={{ marginLeft: 42, height: 4, background: '#F3F4F6', borderRadius: 2, overflow: 'hidden' }}>
                      <div style={{ width: `${pct}%`, height: '100%', background: 'linear-gradient(90deg, #6366F1CC, #6366F1)', borderRadius: 2 }} />
                    </div>
                  </div>
                )
              })
          }
        </div>
      </div>

      {/* ── Posts ────────────────────────────────────────────────────────────── */}
      {(Object.keys(postsByType).length > 0 || recentPosts.length > 0) && (
        <div style={CARD}>
          <div style={{ padding: '18px 20px 14px', borderBottom: '1px solid #F3F4F6', display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 10 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <div style={{ width: 34, height: 34, borderRadius: 10, background: 'rgba(16,185,129,0.1)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <Share2 size={16} style={{ color: '#10B981' }} />
              </div>
              <div>
                <p style={{ fontSize: 14, fontWeight: 800, color: '#111827', margin: 0, fontFamily: 'var(--font-jakarta)' }}>Posts Published</p>
                <p style={{ fontSize: 11, color: '#9CA3AF', margin: '1px 0 0' }}>{monthLabel}</p>
              </div>
            </div>
            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
              {Object.entries(postsByType).sort((a, b) => b[1] - a[1]).map(([type, count]) => (
                <span key={type} style={{ fontSize: 11, fontWeight: 700, padding: '3px 10px', borderRadius: 8, background: 'rgba(16,185,129,0.08)', color: '#10B981', border: '1px solid rgba(16,185,129,0.15)' }}>{type}: {count}</span>
              ))}
              {Object.entries(postsByPlatform).sort((a, b) => b[1] - a[1]).map(([plat, count]) => (
                <span key={plat} style={{ fontSize: 11, fontWeight: 700, padding: '3px 10px', borderRadius: 8, background: 'rgba(59,130,246,0.08)', color: '#3B82F6', border: '1px solid rgba(59,130,246,0.15)' }}>{plat}: {count}</span>
              ))}
            </div>
          </div>
          <div style={{ maxHeight: 300, overflowY: 'auto' }}>
            {recentPosts.map((p, i) => (
              <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '9px 20px', borderBottom: '1px solid #F9FAFB', background: i % 2 === 0 ? '#FFF' : '#FAFBFF' }}>
                <span style={{ fontSize: 11, color: '#9CA3AF', minWidth: 60, flexShrink: 0 }}>
                  {new Date(p.date + 'T12:00:00').toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })}
                </span>
                <div style={{ width: 26, height: 26, borderRadius: 8, background: `${avatarColor(p.memberName)}15`, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                  <span style={{ fontSize: 9, fontWeight: 900, color: avatarColor(p.memberName) }}>{ini(p.memberName)}</span>
                </div>
                <span style={{ fontSize: 12, fontWeight: 700, color: '#374151', flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{p.memberName}</span>
                {p.client_name && <span style={{ fontSize: 11, color: '#6B7280', flexShrink: 0, maxWidth: 100, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{p.client_name}</span>}
                <span style={{ fontSize: 10, fontWeight: 700, padding: '2px 8px', borderRadius: 6, background: 'rgba(59,130,246,0.08)', color: '#3B82F6', flexShrink: 0 }}>{p.platform}</span>
                <span style={{ fontSize: 10, fontWeight: 700, padding: '2px 8px', borderRadius: 6, background: 'rgba(16,185,129,0.08)', color: '#10B981', flexShrink: 0 }}>{p.post_type}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ── Star label ───────────────────────────────────────────────────────── */}
      <div style={{ textAlign: 'center', marginTop: 32 }}>
        <div style={{ display: 'inline-flex', alignItems: 'center', gap: 6, background: '#FFF', border: '1px solid #E5E7EB', borderRadius: 20, padding: '6px 16px' }}>
          <Star size={11} style={{ color: '#F59E0B' }} />
          <span style={{ fontSize: 11, color: '#9CA3AF', fontWeight: 500 }}>GroFast Team Insights · {monthLabel}</span>
        </div>
      </div>

    </div>
  )
}

const TH_STYLE: React.CSSProperties = {
  padding: '10px 16px', fontSize: 10, fontWeight: 800, color: '#9CA3AF',
  textAlign: 'left', borderBottom: '1px solid #F3F4F6',
  textTransform: 'uppercase', letterSpacing: '0.07em', whiteSpace: 'nowrap',
}
