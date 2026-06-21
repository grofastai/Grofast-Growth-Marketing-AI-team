'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import {
  Clock, TrendingUp, Film, ImageIcon, Share2, DollarSign,
  Users, BarChart3, ChevronDown, X, Search, Trophy, Zap,
  Building2, Star, Target,
} from 'lucide-react'

// ── helpers ───────────────────────────────────────────────────────────────────
function fmtRupee(n: number) { return `₹${Math.round(n).toLocaleString('en-IN')}` }
function fmtH(h: number)     { return `${h.toFixed(1)}h` }
function ini(n: string)      { return n.split(' ').map(w => w[0] ?? '').join('').slice(0, 2).toUpperCase() }

const AVATAR_GRADIENTS = [
  ['#FF6B6B','#EE2222'],
  ['#6366F1','#818CF8'],
  ['#10B981','#34D399'],
  ['#F59E0B','#FBBF24'],
  ['#8B5CF6','#A78BFA'],
  ['#06B6D4','#22D3EE'],
  ['#F97316','#FB923C'],
  ['#EC4899','#F472B6'],
]
function avatarGrad(name: string) {
  let h = 0; for (const c of name) h = (h * 31 + c.charCodeAt(0)) % AVATAR_GRADIENTS.length
  return AVATAR_GRADIENTS[h]
}
function avatarColor(name: string) { return avatarGrad(name)[0] }

// ── Score ring with gradient stroke ──────────────────────────────────────────
function ScoreRing({ score, size = 44 }: { score: number; size?: number }) {
  const r       = size * 0.38, cx = size / 2, cy = size / 2
  const circ    = 2 * Math.PI * r
  const filled  = (Math.min(score, 100) / 100) * circ
  const [c1,c2] = score >= 70 ? ['#10B981','#34D399'] : score >= 40 ? ['#F59E0B','#FCD34D'] : ['#EF4444','#F87171']
  const gid     = `sg${score}`
  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
      <defs>
        <linearGradient id={gid} x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stopColor={c1} />
          <stop offset="100%" stopColor={c2} />
        </linearGradient>
      </defs>
      <circle cx={cx} cy={cy} r={r} fill="none" stroke="#F0F0F0" strokeWidth={size * 0.11} />
      <circle cx={cx} cy={cy} r={r} fill="none" stroke={`url(#${gid})`} strokeWidth={size * 0.11}
        strokeDasharray={`${filled} ${circ - filled}`} strokeLinecap="round"
        transform={`rotate(-90 ${cx} ${cy})`} />
      <text x={cx} y={cy + 1} textAnchor="middle" dominantBaseline="middle"
        fontSize={size * 0.22} fontWeight="900" fill="#111">{score}</text>
    </svg>
  )
}

// ── Gradient mini bar ─────────────────────────────────────────────────────────
function MiniBar({ pct, g1, g2 }: { pct: number; g1: string; g2: string }) {
  return (
    <div style={{ width: 60, height: 5, background: '#EBEBF0', borderRadius: 3, overflow: 'hidden' }}>
      <div style={{ width: `${Math.max(4, pct)}%`, height: '100%', background: `linear-gradient(90deg,${g1},${g2})`, borderRadius: 3 }} />
    </div>
  )
}

// ── Avatar with gradient background ──────────────────────────────────────────
function Avatar({ name, size = 36, radius = 11 }: { name: string; size?: number; radius?: number }) {
  const [g1, g2] = avatarGrad(name)
  const gid = `av${name.replace(/\s/g,'')}`
  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} style={{ flexShrink: 0 }}>
      <defs>
        <linearGradient id={gid} x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stopColor={g1} stopOpacity={0.18} />
          <stop offset="100%" stopColor={g2} stopOpacity={0.28} />
        </linearGradient>
      </defs>
      <rect width={size} height={size} rx={radius} fill={`url(#${gid})`} />
      <rect width={size} height={size} rx={radius} fill="none" stroke={g1} strokeWidth={1.5} strokeOpacity={0.35} />
      <text x={size/2} y={size/2+1} textAnchor="middle" dominantBaseline="middle"
        fontSize={size * 0.3} fontWeight="900" fill={g1}>{ini(name)}</text>
    </svg>
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

const TEAM_CFG: Record<string, { label: string; g1: string; g2: string }> = {
  MEDIA:    { label: 'Media & Video',    g1: '#E53935', g2: '#FF6B6B' },
  META:     { label: 'Meta & Marketing', g1: '#F59E0B', g2: '#FCD34D' },
  CREATIVE: { label: 'Creative Design',  g1: '#8B5CF6', g2: '#C4B5FD' },
  AI:       { label: 'AI & Tech',        g1: '#10B981', g2: '#6EE7B7' },
  OPS:      { label: 'Operations',       g1: '#3B82F6', g2: '#93C5FD' },
}
const TEAM_ORDER = ['MEDIA', 'META', 'CREATIVE', 'AI', 'OPS']

// ── Card ──────────────────────────────────────────────────────────────────────
const CARD: React.CSSProperties = {
  background: 'linear-gradient(160deg,#FFFFFF 0%,#FAFBFF 100%)',
  borderRadius: 20,
  border: '1px solid #E8EAF2',
  overflow: 'hidden',
  boxShadow: '0 4px 20px rgba(99,102,241,0.07)',
}

// ── Section title ─────────────────────────────────────────────────────────────
function SectionTitle({ icon, title, sub, g1, g2 }: {
  icon: React.ReactNode; title: string; sub?: string; g1: string; g2: string
}) {
  return (
    <div style={{ padding: '18px 20px 14px', borderBottom: '1px solid #F0F1F8', display: 'flex', alignItems: 'center', gap: 12 }}>
      <div style={{ width: 36, height: 36, borderRadius: 11, background: `linear-gradient(135deg,${g1}22,${g2}33)`, border: `1.5px solid ${g1}30`, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
        {icon}
      </div>
      <div>
        <p style={{ fontSize: 14, fontWeight: 800, color: '#111827', margin: 0, fontFamily: 'var(--font-jakarta)' }}>{title}</p>
        {sub && <p style={{ fontSize: 11, color: '#9CA3AF', margin: '2px 0 0' }}>{sub}</p>}
      </div>
    </div>
  )
}

function EmptyRow({ msg }: { msg: string }) {
  return <p style={{ fontSize: 12, color: '#9CA3AF', textAlign: 'center', padding: '36px 0', margin: 0 }}>{msg}</p>
}

const TH: React.CSSProperties = {
  padding: '10px 16px', fontSize: 10, fontWeight: 800, color: '#8B93A7',
  textAlign: 'left', borderBottom: '1px solid #F0F1F8',
  textTransform: 'uppercase', letterSpacing: '0.07em', whiteSpace: 'nowrap',
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

  const memberOptions = [...employeePerformance]
    .sort((a, b) => a.name.localeCompare(b.name))
    .map(e => [e.id, e.name] as [string, string])
  const clientOptions = clientStats
    .map(c => c.name)
    .filter(n => n !== 'Unassigned')
    .sort((a, b) => a.localeCompare(b))

  const filteredLogs    = logEntries.filter(e =>
    (!filterMember || e.memberId === filterMember) &&
    (!filterClient || e.clientName === filterClient)
  )
  const drillTotalHours = filteredLogs.reduce((s, e) => s + e.hours, 0)
  const drillTotalCost  = filteredLogs.reduce((s, e) => s + e.cost,  0)
  const hasFilter       = !!(filterMember || filterClient)
  const monthLabel      = new Date(month + '-01').toLocaleDateString('en-IN', { month: 'long', year: 'numeric' })

  return (
    <div style={{ padding: '20px 16px 60px', background: 'linear-gradient(160deg,#EEF2FF 0%,#F0F4FF 50%,#F5F0FF 100%)', minHeight: '100vh' }} className="sm:px-7">

      {/* ── Hero ─────────────────────────────────────────────────────────────── */}
      <div style={{
        background: 'linear-gradient(135deg,#1E3A8A 0%,#2563EB 40%,#7C3AED 100%)',
        borderRadius: 24, marginBottom: 22, position: 'relative', overflow: 'hidden',
        padding: '30px 28px 28px 32px',
        boxShadow: '0 20px 60px rgba(37,99,235,0.35), 0 4px 16px rgba(124,58,237,0.2)',
      }}>
        {/* mesh orbs */}
        <div style={{ position: 'absolute', top: -70, right: 160, width: 280, height: 280, borderRadius: '50%', background: 'radial-gradient(circle,rgba(129,140,248,0.25),transparent 70%)', pointerEvents: 'none' }} />
        <div style={{ position: 'absolute', bottom: -90, right: 20, width: 320, height: 320, borderRadius: '50%', background: 'radial-gradient(circle,rgba(167,139,250,0.18),transparent 70%)', pointerEvents: 'none' }} />
        <div style={{ position: 'absolute', top: -30, left: -30, width: 180, height: 180, borderRadius: '50%', background: 'radial-gradient(circle,rgba(96,165,250,0.2),transparent 70%)', pointerEvents: 'none' }} />

        <div style={{ position: 'relative', zIndex: 1 }}>
          <div style={{ display: 'inline-flex', alignItems: 'center', gap: 6, background: 'rgba(255,255,255,0.14)', borderRadius: 20, padding: '4px 14px', marginBottom: 16, border: '1px solid rgba(255,255,255,0.22)', backdropFilter: 'blur(8px)' }}>
            <BarChart3 size={12} style={{ color: '#BAC8FF' }} />
            <span style={{ fontSize: 11, fontWeight: 700, color: '#BAC8FF', letterSpacing: '0.06em' }}>TEAM ANALYTICS</span>
          </div>

          <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 16, flexWrap: 'wrap' }}>
            <div>
              <h1 style={{ fontSize: 30, fontWeight: 900, color: '#FFF', margin: '0 0 4px', fontFamily: 'var(--font-jakarta)', lineHeight: 1.15 }}>
                Team Insights
              </h1>
              <p style={{ fontSize: 13, color: 'rgba(255,255,255,0.55)', margin: '0 0 22px' }}>{monthLabel}</p>

              <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
                {[
                  { icon: <Clock size={13} />,     label: `${kpis.totalHours.toFixed(1)}h logged` },
                  { icon: <Users size={13} />,     label: `${employeePerformance.length} members` },
                  { icon: <Building2 size={13} />, label: `${clientStats.length} clients` },
                  { icon: <DollarSign size={13} />,label: fmtRupee(kpis.totalCost) },
                ].map(chip => (
                  <div key={chip.label} style={{ display: 'flex', alignItems: 'center', gap: 6, background: 'rgba(255,255,255,0.11)', border: '1px solid rgba(255,255,255,0.2)', borderRadius: 10, padding: '6px 13px', backdropFilter: 'blur(8px)' }}>
                    <span style={{ color: 'rgba(255,255,255,0.7)', display: 'flex' }}>{chip.icon}</span>
                    <span style={{ fontSize: 12, fontWeight: 700, color: '#FFF' }}>{chip.label}</span>
                  </div>
                ))}
              </div>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: 5, alignSelf: 'center' }}>
              <label style={{ fontSize: 10, fontWeight: 700, color: 'rgba(255,255,255,0.45)', letterSpacing: '0.06em', textTransform: 'uppercase' }}>Month</label>
              <input
                type="month" value={month} max={today.slice(0, 7)}
                onChange={e => router.push(`/admin/insights?month=${e.target.value}`)}
                style={{ padding: '9px 14px', borderRadius: 12, border: '1.5px solid rgba(255,255,255,0.25)', fontSize: 13, fontWeight: 700, color: '#FFF', background: 'rgba(255,255,255,0.12)', outline: 'none', cursor: 'pointer', colorScheme: 'dark' }}
              />
            </div>
          </div>
        </div>
      </div>

      {/* ── No data ──────────────────────────────────────────────────────────── */}
      {!hasData && (
        <div style={{ ...CARD, padding: '64px 24px', textAlign: 'center', marginBottom: 20 }}>
          <div style={{ width: 68, height: 68, borderRadius: 20, background: 'linear-gradient(135deg,#EEF2FF,#E0E7FF)', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 18px' }}>
            <BarChart3 size={28} style={{ color: '#6366F1' }} />
          </div>
          <p style={{ fontSize: 15, fontWeight: 800, color: '#374151', margin: '0 0 6px', fontFamily: 'var(--font-jakarta)' }}>No data for {monthLabel}</p>
          <p style={{ fontSize: 13, color: '#9CA3AF', margin: 0 }}>Team members need to submit daily updates with the activity form.</p>
        </div>
      )}

      {/* ── KPI Cards ────────────────────────────────────────────────────────── */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5" style={{ gap: 12, marginBottom: 20 }}>
        {[
          { label: 'Total Hours',   value: fmtH(kpis.totalHours),    icon: <Clock size={17} />,      g1: '#2563EB', g2: '#60A5FA', bg: 'linear-gradient(135deg,#EFF6FF 0%,#DBEAFE 100%)', border: '#BFDBFE' },
          { label: 'Videos Edited', value: String(kpis.totalVideos),  icon: <Film size={17} />,       g1: '#E53935', g2: '#FCA5A5', bg: 'linear-gradient(135deg,#FFF5F5 0%,#FEE2E2 100%)', border: '#FECACA' },
          { label: 'Posters Made',  value: String(kpis.totalPosters), icon: <ImageIcon size={17} />,  g1: '#8B5CF6', g2: '#C4B5FD', bg: 'linear-gradient(135deg,#F5F3FF 0%,#EDE9FE 100%)', border: '#DDD6FE' },
          { label: 'Posts',         value: String(kpis.totalPosts),   icon: <Share2 size={17} />,     g1: '#10B981', g2: '#6EE7B7', bg: 'linear-gradient(135deg,#F0FDF4 0%,#DCFCE7 100%)', border: '#A7F3D0' },
          { label: 'Team Value',    value: fmtRupee(kpis.totalCost),  icon: <TrendingUp size={17} />, g1: '#F59E0B', g2: '#FCD34D', bg: 'linear-gradient(135deg,#FFFBEB 0%,#FEF3C7 100%)', border: '#FDE68A' },
        ].map(k => (
          <div key={k.label} style={{ background: k.bg, borderRadius: 18, border: `1.5px solid ${k.border}`, padding: '18px 18px 16px', boxShadow: '0 2px 12px rgba(0,0,0,0.04)' }}>
            <div style={{ width: 38, height: 38, borderRadius: 12, background: `linear-gradient(135deg,${k.g1}18,${k.g2}28)`, border: `1.5px solid ${k.g1}25`, display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: 12 }}>
              <span style={{ color: k.g1, display: 'flex' }}>{k.icon}</span>
            </div>
            <p style={{ fontSize: 22, fontWeight: 900, background: `linear-gradient(135deg,${k.g1},${k.g2})`, WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent', margin: '0 0 3px', fontFamily: 'var(--font-jakarta)', lineHeight: 1 }}>{k.value}</p>
            <p style={{ fontSize: 11, color: '#6B7280', margin: 0, fontWeight: 600 }}>{k.label}</p>
          </div>
        ))}
      </div>

      {/* ── Work Drill-Down ──────────────────────────────────────────────────── */}
      <div style={{ ...CARD, marginBottom: 20 }}>
        <div
          style={{ padding: '16px 20px', display: 'flex', alignItems: 'center', gap: 12, cursor: 'pointer', userSelect: 'none' }}
          onClick={() => setDrillOpen(o => !o)}
        >
          <div style={{ width: 38, height: 38, borderRadius: 12, background: hasFilter ? 'linear-gradient(135deg,#2563EB22,#6366F133)' : 'linear-gradient(135deg,#F3F4F6,#E9EBF0)', border: `1.5px solid ${hasFilter ? '#6366F140' : '#E5E7EB'}`, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
            <Search size={16} style={{ color: hasFilter ? '#2563EB' : '#9CA3AF' }} />
          </div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <p style={{ fontSize: 14, fontWeight: 800, color: '#111827', margin: 0, fontFamily: 'var(--font-jakarta)' }}>Work Drill-Down</p>
            {hasFilter
              ? <p style={{ fontSize: 11, margin: '1px 0 0', fontWeight: 700, background: 'linear-gradient(90deg,#2563EB,#7C3AED)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent' }}>
                  {filterMember ? employeePerformance.find(e => e.id === filterMember)?.name : 'All Members'}
                  {' · '}{filterClient || 'All Clients'}
                  {' · '}{filteredLogs.length} entries
                </p>
              : <p style={{ fontSize: 11, color: '#9CA3AF', margin: '2px 0 0' }}>Filter by member, client, or both</p>
            }
          </div>
          {hasFilter && (
            <button onClick={e => { e.stopPropagation(); setFilterMember(''); setFilterClient('') }}
              style={{ width: 28, height: 28, borderRadius: 8, border: '1px solid #E5E7EB', background: '#F9FAFB', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', flexShrink: 0 }}>
              <X size={13} style={{ color: '#6B7280' }} />
            </button>
          )}
          <ChevronDown size={16} style={{ color: '#9CA3AF', flexShrink: 0, transform: drillOpen ? 'rotate(180deg)' : 'none', transition: 'transform 0.2s' }} />
        </div>

        {drillOpen && (
          <div style={{ borderTop: '1px solid #F0F1F8' }}>
            {/* selectors */}
            <div style={{ padding: '16px 20px', display: 'flex', gap: 14, flexWrap: 'wrap', background: 'linear-gradient(135deg,#F8FAFF,#F5F3FF)' }}>
              {[
                { label: 'Team Member', val: filterMember, set: setFilterMember, opts: memberOptions.map(([id,n]) => ({ v: id, l: n })), g1: '#2563EB', g2: '#6366F1' },
                { label: 'Client',      val: filterClient, set: setFilterClient, opts: clientOptions.map(c => ({ v: c, l: c })),          g1: '#7C3AED', g2: '#8B5CF6' },
              ].map(f => (
                <div key={f.label} style={{ flex: 1, minWidth: 180 }}>
                  <label style={{ display: 'block', fontSize: 10, fontWeight: 800, color: '#6B7280', letterSpacing: '0.06em', textTransform: 'uppercase', marginBottom: 7 }}>{f.label}</label>
                  <div style={{ position: 'relative' }}>
                    <select value={f.val} onChange={e => f.set(e.target.value)}
                      style={{ width: '100%', appearance: 'none', padding: '10px 36px 10px 14px', borderRadius: 12, border: `1.5px solid ${f.val ? f.g1 : '#E5E7EB'}`, fontSize: 13, fontWeight: 600, color: f.val ? f.g1 : '#374151', background: f.val ? `linear-gradient(135deg,${f.g1}0A,${f.g2}14)` : '#FFF', outline: 'none', cursor: 'pointer' }}>
                      <option value="">{f.label === 'Team Member' ? 'All Members' : 'All Clients'}</option>
                      {f.opts.map(o => <option key={o.v} value={o.v}>{o.l}</option>)}
                    </select>
                    <ChevronDown size={14} style={{ position: 'absolute', right: 12, top: '50%', transform: 'translateY(-50%)', color: '#9CA3AF', pointerEvents: 'none' }} />
                  </div>
                </div>
              ))}
            </div>

            {/* results */}
            {hasFilter && (
              <div style={{ borderTop: '1px solid #F0F1F8' }}>
                <div style={{ padding: '10px 20px', background: 'linear-gradient(90deg,#EFF6FF,#EEF2FF)', display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
                  {filterMember && (
                    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5, fontSize: 11, fontWeight: 700, padding: '3px 11px', borderRadius: 20, background: 'linear-gradient(90deg,#EFF6FF,#DBEAFE)', color: '#2563EB', border: '1px solid #BFDBFE' }}>
                      <Users size={10} /> {employeePerformance.find(e => e.id === filterMember)?.name}
                    </span>
                  )}
                  {filterClient && (
                    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5, fontSize: 11, fontWeight: 700, padding: '3px 11px', borderRadius: 20, background: 'linear-gradient(90deg,#EEF2FF,#E0E7FF)', color: '#6366F1', border: '1px solid #C7D2FE' }}>
                      <Building2 size={10} /> {filterClient}
                    </span>
                  )}
                  <div style={{ marginLeft: 'auto', display: 'flex', gap: 14, alignItems: 'center' }}>
                    <span style={{ fontSize: 13, fontWeight: 900, background: 'linear-gradient(90deg,#2563EB,#7C3AED)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent' }}>{fmtH(drillTotalHours)}</span>
                    <span style={{ fontSize: 13, fontWeight: 900, background: 'linear-gradient(90deg,#10B981,#34D399)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent' }}>{fmtRupee(drillTotalCost)}</span>
                    <span style={{ fontSize: 11, color: '#9CA3AF' }}>{filteredLogs.length} entries</span>
                  </div>
                </div>

                {filteredLogs.length === 0
                  ? <EmptyRow msg="No work logged for this combination" />
                  : (
                    <div style={{ overflowX: 'auto' }}>
                      <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 520 }}>
                        <thead>
                          <tr style={{ background: 'linear-gradient(90deg,#F8FAFF,#F5F3FF)' }}>
                            {!filterMember && <th style={TH}>Member</th>}
                            {!filterClient  && <th style={TH}>Client</th>}
                            <th style={TH}>Activity</th>
                            <th style={TH}>Work Done</th>
                            <th style={{ ...TH, textAlign: 'right' }}>Hours</th>
                            <th style={{ ...TH, textAlign: 'right' }}>Value</th>
                          </tr>
                        </thead>
                        <tbody>
                          {filteredLogs.map((e, i) => (
                            <tr key={i} style={{ borderBottom: '1px solid #F0F1F8', background: i % 2 === 0 ? '#FFF' : '#FAFBFF' }}>
                              {!filterMember && (
                                <td style={{ padding: '11px 16px' }}>
                                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                                    <Avatar name={e.memberName} size={28} radius={8} />
                                    <span style={{ fontSize: 12, fontWeight: 700, color: '#374151', whiteSpace: 'nowrap' }}>{e.memberName}</span>
                                  </div>
                                </td>
                              )}
                              {!filterClient && (
                                <td style={{ padding: '11px 16px', fontSize: 11, fontWeight: 700, color: '#6366F1', whiteSpace: 'nowrap', maxWidth: 140, overflow: 'hidden', textOverflow: 'ellipsis' }}>{e.clientName}</td>
                              )}
                              <td style={{ padding: '11px 16px', fontSize: 12, color: '#374151', whiteSpace: 'nowrap' }}>
                                <span style={{ marginRight: 5 }}>{e.activityEmoji}</span>{e.activityName}
                              </td>
                              <td style={{ padding: '11px 16px', maxWidth: 240 }}>
                                {e.titles.length > 0
                                  ? <span style={{ fontSize: 11, color: '#6B7280', lineHeight: 1.5 }}>{e.titles.join(', ')}</span>
                                  : <span style={{ fontSize: 11, color: '#D1D5DB', fontStyle: 'italic' }}>—</span>}
                              </td>
                              <td style={{ padding: '11px 16px', textAlign: 'right', whiteSpace: 'nowrap' }}>
                                <span style={{ fontSize: 13, fontWeight: 900, background: 'linear-gradient(135deg,#2563EB,#6366F1)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent', fontFamily: 'var(--font-jakarta)' }}>{fmtH(e.hours)}</span>
                              </td>
                              <td style={{ padding: '11px 16px', textAlign: 'right', whiteSpace: 'nowrap' }}>
                                <span style={{ fontSize: 13, fontWeight: 900, background: 'linear-gradient(135deg,#10B981,#34D399)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent', fontFamily: 'var(--font-jakarta)' }}>{fmtRupee(e.cost)}</span>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                        <tfoot>
                          <tr style={{ background: 'linear-gradient(90deg,#EFF6FF,#EEF2FF)', borderTop: '2px solid #C7D2FE' }}>
                            <td colSpan={(!filterMember ? 1 : 0) + (!filterClient ? 1 : 0) + 2}
                              style={{ padding: '12px 16px', fontSize: 12, fontWeight: 800, color: '#1E3A8A' }}>Monthly Total</td>
                            <td style={{ padding: '12px 16px', textAlign: 'right' }}>
                              <span style={{ fontSize: 15, fontWeight: 900, background: 'linear-gradient(135deg,#2563EB,#7C3AED)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent', fontFamily: 'var(--font-jakarta)' }}>{fmtH(drillTotalHours)}</span>
                            </td>
                            <td style={{ padding: '12px 16px', textAlign: 'right' }}>
                              <span style={{ fontSize: 15, fontWeight: 900, background: 'linear-gradient(135deg,#10B981,#34D399)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent', fontFamily: 'var(--font-jakarta)' }}>{fmtRupee(drillTotalCost)}</span>
                            </td>
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

      {/* ── Employee Performance ─────────────────────────────────────────────── */}
      {employeePerformance.length > 0 && (
        <div style={{ ...CARD, marginBottom: 20 }}>
          <SectionTitle icon={<Users size={17} style={{ color: '#2563EB' }} />} title="Employee Performance"
            sub={`${monthLabel} · Score = Value/Salary + Tasks + Hours`} g1="#2563EB" g2="#6366F1" />
          <div className="overflow-x-auto">
            <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 780 }}>
              <thead>
                <tr style={{ background: 'linear-gradient(90deg,#F8FAFF,#F5F3FF)' }}>
                  {['Employee','Clients','Tasks','Hours','Work Value','Salary','Value vs Pay','Score'].map(h => (
                    <th key={h} style={TH}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {employeePerformance.map((emp, i) => {
                  const ratio = emp.salary > 0 ? Math.round((emp.workValue / emp.salary) * 100) : null
                  const [rg1,rg2] = ratio == null ? ['#9CA3AF','#9CA3AF'] : ratio >= 100 ? ['#10B981','#34D399'] : ratio >= 60 ? ['#F59E0B','#FCD34D'] : ['#EF4444','#F87171']
                  const [ag1,ag2] = avatarGrad(emp.name)
                  const hPct      = Math.round((emp.hours / maxEmpHours) * 100)
                  return (
                    <tr key={emp.id} style={{ borderBottom: '1px solid #F0F1F8', background: i % 2 === 0 ? '#FFF' : '#FAFBFF' }}>
                      <td style={{ padding: '13px 16px' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                          <Avatar name={emp.name} size={38} radius={12} />
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
                                <span key={c} style={{ fontSize: 10, fontWeight: 700, padding: '2px 8px', borderRadius: 6, background: 'linear-gradient(90deg,#EEF2FF,#E0E7FF)', color: '#6366F1', whiteSpace: 'nowrap' }}>{c}</span>
                              ))}
                              {emp.clients.length > 2 && <span style={{ fontSize: 10, fontWeight: 700, padding: '2px 8px', borderRadius: 6, background: '#F3F4F6', color: '#6B7280' }}>+{emp.clients.length - 2}</span>}
                            </div>}
                      </td>
                      <td style={{ padding: '13px 16px' }}>
                        <span style={{ fontSize: 13, fontWeight: 800, color: emp.tasksCompleted > 0 ? '#111827' : '#D1D5DB' }}>{emp.tasksCompleted || '—'}</span>
                      </td>
                      <td style={{ padding: '13px 16px' }}>
                        <span style={{ fontSize: 13, fontWeight: 900, background: `linear-gradient(135deg,${ag1},${ag2})`, WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent' }}>
                          {emp.hours > 0 ? fmtH(emp.hours) : '—'}
                        </span>
                        <MiniBar pct={hPct} g1={ag1} g2={ag2} />
                      </td>
                      <td style={{ padding: '13px 16px' }}>
                        <span style={{ fontSize: 13, fontWeight: 900, background: 'linear-gradient(135deg,#10B981,#34D399)', WebkitBackgroundClip: 'text', WebkitTextFillColor: emp.workValue > 0 ? 'transparent' : undefined, color: emp.workValue > 0 ? undefined : '#D1D5DB' }}>
                          {emp.workValue > 0 ? fmtRupee(emp.workValue) : '—'}
                        </span>
                      </td>
                      <td style={{ padding: '13px 16px', fontSize: 13, fontWeight: 700, color: emp.salary > 0 ? '#374151' : '#D1D5DB' }}>
                        {emp.salary > 0 ? fmtRupee(emp.salary) : 'Not set'}
                      </td>
                      <td style={{ padding: '13px 16px' }}>
                        {ratio != null
                          ? <span style={{ fontSize: 12, fontWeight: 800, padding: '4px 12px', borderRadius: 8, background: `linear-gradient(135deg,${rg1}18,${rg2}28)`, border: `1px solid ${rg1}30`, color: rg1, whiteSpace: 'nowrap' }}>{ratio}%</span>
                          : <span style={{ fontSize: 11, color: '#D1D5DB' }}>—</span>}
                      </td>
                      <td style={{ padding: '13px 16px' }}>
                        <ScoreRing score={emp.productivityScore} size={42} />
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
          <div style={{ padding: '10px 20px', background: 'linear-gradient(90deg,#F8FAFF,#F5F3FF)', borderTop: '1px solid #F0F1F8', display: 'flex', gap: 20, flexWrap: 'wrap' }}>
            {[['#10B981','#34D399','≥ 100% · generating more value than salary'],['#F59E0B','#FCD34D','60–99% · moderate value output'],['#EF4444','#F87171','< 60% · below expected value']].map(([c1,c2,l]) => (
              <div key={l} style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                <div style={{ width: 8, height: 8, borderRadius: '50%', background: `linear-gradient(135deg,${c1},${c2})` }} />
                <span style={{ fontSize: 10, color: '#6B7280', fontWeight: 500 }}>{l}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ── Rankings + Hours per Client ──────────────────────────────────────── */}
      {employeePerformance.length > 0 && (
        <div className="grid grid-cols-1 lg:grid-cols-2" style={{ gap: 16, marginBottom: 20 }}>

          <div style={CARD}>
            <SectionTitle icon={<Trophy size={17} style={{ color: '#F59E0B' }} />} title="Monthly Rankings" sub="Ranked by productivity score" g1="#F59E0B" g2="#FCD34D" />
            <div style={{ padding: '12px 16px', display: 'flex', flexDirection: 'column', gap: 8 }}>
              {[...employeePerformance].sort((a, b) => b.productivityScore - a.productivityScore).map((emp, i) => {
                const s = emp.productivityScore
                const [sg1,sg2] = s >= 70 ? ['#10B981','#34D399'] : s >= 40 ? ['#F59E0B','#FCD34D'] : ['#EF4444','#F87171']
                const [ag1,ag2] = avatarGrad(emp.name)
                const podiumBg = i === 0 ? 'linear-gradient(135deg,#FFFDE7,#FFF8C4)'
                               : i === 1 ? 'linear-gradient(135deg,#F8FAFF,#EEF2FF)'
                               : i === 2 ? 'linear-gradient(135deg,#FFF8F0,#FDEBD8)'
                               : '#FAFAFA'
                const podiumBorder = i === 0 ? '#FDE68A' : i === 1 ? '#C7D2FE' : i === 2 ? '#FED7AA' : 'transparent'
                const medal = i === 0 ? '🥇' : i === 1 ? '🥈' : i === 2 ? '🥉' : `${i+1}`
                return (
                  <div key={emp.id} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 12px', borderRadius: 14, background: podiumBg, border: `1px solid ${podiumBorder}` }}>
                    <span style={{ fontSize: i < 3 ? 18 : 11, fontWeight: 700, color: '#9CA3AF', width: 26, textAlign: 'center', flexShrink: 0 }}>{medal}</span>
                    <Avatar name={emp.name} size={34} radius={10} />
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <p style={{ fontSize: 13, fontWeight: 800, color: '#111827', margin: 0, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{emp.name}</p>
                      <p style={{ fontSize: 10, color: '#9CA3AF', margin: '1px 0 0' }}>{emp.clients.length} clients · {emp.tasksCompleted} tasks · {fmtH(emp.hours)}</p>
                    </div>
                    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 5, flexShrink: 0 }}>
                      <span style={{ fontSize: 16, fontWeight: 900, background: `linear-gradient(135deg,${sg1},${sg2})`, WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent', fontFamily: 'var(--font-jakarta)' }}>{s}</span>
                      <MiniBar pct={s} g1={sg1} g2={sg2} />
                    </div>
                  </div>
                )
              })}
            </div>
          </div>

          <div style={CARD}>
            <SectionTitle icon={<Clock size={17} style={{ color: '#6366F1' }} />} title="Hours per Client" sub="Top 3 clients per team member" g1="#6366F1" g2="#818CF8" />
            <div style={{ padding: '14px 18px', display: 'flex', flexDirection: 'column', gap: 18 }}>
              {employeePerformance.filter(e => e.hoursPerClient.length > 0).map((emp) => {
                const [ag1,ag2] = avatarGrad(emp.name)
                const top = emp.hoursPerClient.slice(0, 3)
                const maxH = top[0]?.hours ?? 1
                return (
                  <div key={emp.id}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
                      <Avatar name={emp.name} size={26} radius={8} />
                      <span style={{ fontSize: 12, fontWeight: 800, color: '#374151' }}>{emp.name}</span>
                      <span style={{ fontSize: 10, color: '#9CA3AF', marginLeft: 'auto' }}>{fmtH(emp.hours)} total</span>
                    </div>
                    <div style={{ paddingLeft: 34, display: 'flex', flexDirection: 'column', gap: 8 }}>
                      {top.map(c => (
                        <div key={c.name}>
                          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
                            <span style={{ fontSize: 11, color: '#6B7280', fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: 155 }}>{c.name}</span>
                            <span style={{ fontSize: 11, fontWeight: 900, background: `linear-gradient(90deg,${ag1},${ag2})`, WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent', flexShrink: 0 }}>{fmtH(c.hours)}</span>
                          </div>
                          <div style={{ height: 6, background: '#F0F1F8', borderRadius: 3, overflow: 'hidden' }}>
                            <div style={{ width: `${Math.round((c.hours / maxH) * 100)}%`, height: '100%', background: `linear-gradient(90deg,${ag1},${ag2})`, borderRadius: 3 }} />
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

        <div style={CARD}>
          <SectionTitle icon={<Zap size={17} style={{ color: '#F59E0B' }} />} title="Team Hours by Category" g1="#F59E0B" g2="#FCD34D" />
          <div style={{ padding: '18px 20px', display: 'flex', flexDirection: 'column', gap: 18 }}>
            {TEAM_ORDER.map(tc => {
              const cfg = TEAM_CFG[tc]
              const hrs = teamHours[tc] ?? 0
              const pct = Math.max(4, Math.round((hrs / maxTeamHours) * 100))
              return (
                <div key={tc}>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      <div style={{ width: 10, height: 10, borderRadius: 3, background: `linear-gradient(135deg,${cfg.g1},${cfg.g2})`, flexShrink: 0 }} />
                      <span style={{ fontSize: 13, fontWeight: 600, color: '#374151' }}>{cfg.label}</span>
                    </div>
                    <span style={{ fontSize: 15, fontWeight: 900, background: `linear-gradient(135deg,${cfg.g1},${cfg.g2})`, WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent', fontFamily: 'var(--font-jakarta)' }}>{fmtH(hrs)}</span>
                  </div>
                  <div style={{ height: 9, background: '#F0F1F8', borderRadius: 5, overflow: 'hidden' }}>
                    <div style={{ width: `${pct}%`, height: '100%', background: `linear-gradient(90deg,${cfg.g1},${cfg.g2})`, borderRadius: 5 }} />
                  </div>
                </div>
              )
            })}
          </div>
        </div>

        <div style={CARD}>
          <SectionTitle icon={<Target size={17} style={{ color: '#8B5CF6' }} />} title="Activity Breakdown" g1="#8B5CF6" g2="#C4B5FD" />
          {activityStats.length === 0
            ? <EmptyRow msg="No activities logged" />
            : (
              <div style={{ maxHeight: 360, overflowY: 'auto' }}>
                {activityStats.map((a, i) => {
                  const cfg = TEAM_CFG[a.team]
                  return (
                    <div key={i} style={{ borderBottom: '1px solid #F0F1F8' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '11px 20px' }}>
                        <span style={{ fontSize: 18, flexShrink: 0 }}>{a.emoji}</span>
                        <span style={{ fontSize: 13, fontWeight: 700, color: '#374151', flex: 1 }}>{a.name}</span>
                        {a.count > 0 && (
                          <span style={{ fontSize: 10, fontWeight: 800, padding: '2px 9px', borderRadius: 6, background: `linear-gradient(90deg,${cfg.g1}14,${cfg.g2}22)`, color: cfg.g1, flexShrink: 0 }}>{a.count} units</span>
                        )}
                        <span style={{ fontSize: 12, color: '#6B7280', minWidth: 38, textAlign: 'right', flexShrink: 0 }}>{fmtH(a.hours)}</span>
                        <span style={{ fontSize: 13, fontWeight: 900, minWidth: 68, textAlign: 'right', fontFamily: 'var(--font-jakarta)', flexShrink: 0, background: `linear-gradient(90deg,${cfg.g1},${cfg.g2})`, WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent' }}>{fmtRupee(a.cost)}</span>
                      </div>
                      {a.titles.length > 0 && (
                        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4, padding: '0 20px 10px 48px' }}>
                          {a.titles.slice(0, 5).map((t, ti) => (
                            <span key={ti} style={{ fontSize: 10, fontWeight: 600, color: '#6B7280', background: '#F3F4F6', borderRadius: 6, padding: '2px 8px', maxWidth: 160, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{t}</span>
                          ))}
                          {a.titles.length > 5 && <span style={{ fontSize: 10, fontWeight: 600, color: '#9CA3AF', background: '#F3F4F6', borderRadius: 6, padding: '2px 8px' }}>+{a.titles.length - 5} more</span>}
                        </div>
                      )}
                    </div>
                  )
                })}
              </div>
            )}
        </div>
      </div>

      {/* ── Member Hours + Client Hours ───────────────────────────────────────── */}
      <div className="grid grid-cols-1 lg:grid-cols-2" style={{ gap: 16, marginBottom: 20 }}>

        <div style={CARD}>
          <SectionTitle icon={<Clock size={17} style={{ color: '#10B981' }} />} title="Member Working Hours" sub="Hours × Hourly Rate = Total Value" g1="#10B981" g2="#34D399" />
          {employeePerformance.length === 0
            ? <EmptyRow msg="No member data yet" />
            : [...employeePerformance].sort((a, b) => b.hours - a.hours).map((emp, i) => {
                const [ag1,ag2] = avatarGrad(emp.name)
                const noRate    = emp.hourlyRate === 0
                const ms        = memberStats.find(m => m.employee_id === emp.employee_id)
                return (
                  <div key={emp.id} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '12px 20px', borderBottom: '1px solid #F0F1F8', background: i % 2 === 0 ? 'transparent' : 'linear-gradient(90deg,#FAFBFF,#F8FAFF)' }}>
                    <Avatar name={emp.name} size={38} radius={12} />
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <p style={{ fontSize: 13, fontWeight: 800, color: '#111827', margin: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{emp.name}</p>
                      <p style={{ fontSize: 10, color: '#9CA3AF', margin: '1px 0 0' }}>
                        {noRate ? 'Rate not set' : `${fmtRupee(emp.hourlyRate)}/hr`}
                        {ms ? ` · ${ms.entries} logs` : ''}
                      </p>
                    </div>
                    <div style={{ textAlign: 'right', flexShrink: 0 }}>
                      <p style={{ fontSize: 16, fontWeight: 900, margin: '0 0 2px', background: `linear-gradient(135deg,${ag1},${ag2})`, WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent', fontFamily: 'var(--font-jakarta)' }}>{fmtH(emp.hours)}</p>
                      <p style={{ fontSize: 11, fontWeight: 700, margin: 0, background: noRate ? undefined : 'linear-gradient(135deg,#10B981,#34D399)', WebkitBackgroundClip: noRate ? undefined : 'text', WebkitTextFillColor: noRate ? undefined : 'transparent', color: noRate ? '#9CA3AF' : undefined }}>
                        {noRate ? '—' : fmtRupee(emp.workValue)}
                      </p>
                    </div>
                  </div>
                )
              })
          }
        </div>

        <div style={CARD}>
          <SectionTitle icon={<Building2 size={17} style={{ color: '#6366F1' }} />} title="Client Hours & Cost" g1="#6366F1" g2="#818CF8" />
          {clientStats.length === 0
            ? <EmptyRow msg="No client data yet" />
            : clientStats.slice(0, 10).map((c, i) => {
                const pct   = Math.round((c.hours / (clientStats[0]?.hours ?? 1)) * 100)
                const cidxG = [['#6366F1','#818CF8'],['#E53935','#FF6B6B'],['#10B981','#34D399'],['#F59E0B','#FCD34D'],['#8B5CF6','#C4B5FD'],['#06B6D4','#22D3EE']]
                const [cg1,cg2] = cidxG[i % cidxG.length]
                return (
                  <div key={i} style={{ padding: '12px 20px', borderBottom: '1px solid #F0F1F8', background: i % 2 === 0 ? 'transparent' : 'linear-gradient(90deg,#FAFBFF,#F8FAFF)' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 6 }}>
                      <div style={{ width: 32, height: 32, borderRadius: 10, background: `linear-gradient(135deg,${cg1}18,${cg2}28)`, border: `1.5px solid ${cg1}28`, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                        <span style={{ fontSize: 9, fontWeight: 900, background: `linear-gradient(135deg,${cg1},${cg2})`, WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent' }}>{ini(c.name)}</span>
                      </div>
                      <span style={{ fontSize: 13, fontWeight: 700, color: '#374151', flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{c.name}</span>
                      <span style={{ fontSize: 12, fontWeight: 700, color: '#6B7280', flexShrink: 0 }}>{fmtH(c.hours)}</span>
                      <span style={{ fontSize: 13, fontWeight: 900, fontFamily: 'var(--font-jakarta)', flexShrink: 0, minWidth: 68, textAlign: 'right', background: `linear-gradient(90deg,${cg1},${cg2})`, WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent' }}>{fmtRupee(c.cost)}</span>
                    </div>
                    <div style={{ marginLeft: 42, height: 5, background: '#F0F1F8', borderRadius: 3, overflow: 'hidden' }}>
                      <div style={{ width: `${pct}%`, height: '100%', background: `linear-gradient(90deg,${cg1},${cg2})`, borderRadius: 3 }} />
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
          <div style={{ padding: '18px 20px 14px', borderBottom: '1px solid #F0F1F8', display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 10 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
              <div style={{ width: 36, height: 36, borderRadius: 11, background: 'linear-gradient(135deg,#10B98118,#34D39928)', border: '1.5px solid #10B98130', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <Share2 size={16} style={{ color: '#10B981' }} />
              </div>
              <div>
                <p style={{ fontSize: 14, fontWeight: 800, color: '#111827', margin: 0, fontFamily: 'var(--font-jakarta)' }}>Posts Published</p>
                <p style={{ fontSize: 11, color: '#9CA3AF', margin: '2px 0 0' }}>{monthLabel}</p>
              </div>
            </div>
            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
              {Object.entries(postsByType).sort((a, b) => b[1] - a[1]).map(([type, count]) => (
                <span key={type} style={{ fontSize: 11, fontWeight: 700, padding: '3px 11px', borderRadius: 8, background: 'linear-gradient(90deg,rgba(16,185,129,0.1),rgba(52,211,153,0.15))', color: '#10B981', border: '1px solid rgba(16,185,129,0.2)' }}>{type}: {count}</span>
              ))}
              {Object.entries(postsByPlatform).sort((a, b) => b[1] - a[1]).map(([plat, count]) => (
                <span key={plat} style={{ fontSize: 11, fontWeight: 700, padding: '3px 11px', borderRadius: 8, background: 'linear-gradient(90deg,rgba(59,130,246,0.1),rgba(96,165,250,0.15))', color: '#3B82F6', border: '1px solid rgba(59,130,246,0.2)' }}>{plat}: {count}</span>
              ))}
            </div>
          </div>
          <div style={{ maxHeight: 300, overflowY: 'auto' }}>
            {recentPosts.map((p, i) => (
              <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 20px', borderBottom: '1px solid #F0F1F8', background: i % 2 === 0 ? '#FFF' : 'linear-gradient(90deg,#FAFBFF,#F8FAFF)' }}>
                <span style={{ fontSize: 11, color: '#9CA3AF', minWidth: 58, flexShrink: 0 }}>
                  {new Date(p.date + 'T12:00:00').toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })}
                </span>
                <Avatar name={p.memberName} size={26} radius={8} />
                <span style={{ fontSize: 12, fontWeight: 700, color: '#374151', flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{p.memberName}</span>
                {p.client_name && <span style={{ fontSize: 11, color: '#6B7280', flexShrink: 0, maxWidth: 100, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{p.client_name}</span>}
                <span style={{ fontSize: 10, fontWeight: 700, padding: '2px 8px', borderRadius: 6, background: 'linear-gradient(90deg,rgba(59,130,246,0.1),rgba(96,165,250,0.15))', color: '#3B82F6', flexShrink: 0 }}>{p.platform}</span>
                <span style={{ fontSize: 10, fontWeight: 700, padding: '2px 8px', borderRadius: 6, background: 'linear-gradient(90deg,rgba(16,185,129,0.1),rgba(52,211,153,0.15))', color: '#10B981', flexShrink: 0 }}>{p.post_type}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ── Footer ───────────────────────────────────────────────────────────── */}
      <div style={{ textAlign: 'center', marginTop: 36 }}>
        <div style={{ display: 'inline-flex', alignItems: 'center', gap: 6, background: 'linear-gradient(135deg,#FFFFFF,#F5F3FF)', border: '1.5px solid #E0E7FF', borderRadius: 20, padding: '6px 18px', boxShadow: '0 2px 8px rgba(99,102,241,0.08)' }}>
          <Star size={11} style={{ color: '#F59E0B' }} />
          <span style={{ fontSize: 11, fontWeight: 600, background: 'linear-gradient(90deg,#2563EB,#7C3AED)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent' }}>
            GroFast Team Insights · {monthLabel}
          </span>
        </div>
      </div>

    </div>
  )
}
