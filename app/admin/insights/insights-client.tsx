'use client'

import { useRouter } from 'next/navigation'

const TEAM_CFG: Record<string, { label: string; color: string; emoji: string }> = {
  MEDIA:    { label: 'Media & Video',    color: '#E53935', emoji: '🎬' },
  META:     { label: 'Meta & Marketing', color: '#F59E0B', emoji: '📊' },
  CREATIVE: { label: 'Creative Design',  color: '#8B5CF6', emoji: '🎨' },
  AI:       { label: 'AI & Tech',        color: '#10B981', emoji: '🤖' },
  OPS:      { label: 'Operations',       color: '#3B82F6', emoji: '📱' },
}
const TEAM_ORDER = ['MEDIA', 'META', 'CREATIVE', 'AI', 'OPS']

function fmtRupee(n: number) { return `₹${Math.round(n).toLocaleString('en-IN')}` }
function fmtH(h: number)     { return `${h.toFixed(1)}h` }
function ini(n: string)      { return n.split(' ').map(w => w[0] ?? '').join('').slice(0, 2).toUpperCase() }

const CARD: React.CSSProperties = {
  background: '#FFFFFF', borderRadius: 14, border: '1px solid #EBEDF2',
  overflow: 'hidden', boxShadow: '0 2px 8px rgba(0,0,0,0.04)',
}

function SectionHeader({ title }: { title: string }) {
  return (
    <p style={{ fontSize: 14, fontWeight: 800, color: '#111827', margin: 0, padding: '16px 18px 12px', fontFamily: 'var(--font-jakarta)', borderBottom: '1px solid #F3F4F6' }}>
      {title}
    </p>
  )
}

function EmptyState({ msg }: { msg: string }) {
  return <p style={{ fontSize: 12, color: '#9CA3AF', textAlign: 'center', padding: '28px 0', margin: 0 }}>{msg}</p>
}

export default function InsightsClient({
  month, today,
  teamHours, activityStats, memberStats, clientStats,
  postsByType, postsByPlatform, recentPosts, kpis,
}: {
  month: string
  today: string
  teamHours: Record<string, number>
  activityStats: Array<{ name: string; emoji: string; team: string; hours: number; count: number; cost: number }>
  memberStats: Array<{ name: string; employee_id: string; hours: number; cost: number; entries: number }>
  clientStats: Array<{ name: string; hours: number; cost: number }>
  postsByType: Record<string, number>
  postsByPlatform: Record<string, number>
  recentPosts: Array<{ memberName: string; client_name: string | null; platform: string; post_type: string; date: string }>
  kpis: { totalHours: number; totalCost: number; totalVideos: number; totalPosters: number; totalPosts: number }
}) {
  const router = useRouter()
  const maxTeamHours = Math.max(...Object.values(teamHours), 1)
  const hasData = kpis.totalHours > 0 || kpis.totalPosts > 0

  return (
    <div style={{ padding: '20px 16px 60px', background: '#F8F9FB', minHeight: '100vh' }} className="sm:px-7">

      {/* ── Header ─────────────────────────────────────────────────────────── */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20, flexWrap: 'wrap', gap: 12 }}>
        <div>
          <h1 style={{ fontSize: 26, fontWeight: 900, color: '#111827', margin: 0, fontFamily: 'var(--font-jakarta)' }}>
            Work Insights
          </h1>
          <p style={{ fontSize: 12, color: '#9CA3AF', margin: '2px 0 0' }}>
            Activity-based breakdown · {new Date(month + '-01').toLocaleDateString('en-IN', { month: 'long', year: 'numeric' })}
          </p>
        </div>
        <input
          type="month"
          value={month}
          max={today.slice(0, 7)}
          onChange={e => router.push(`/admin/insights?month=${e.target.value}`)}
          style={{
            padding: '8px 14px', borderRadius: 10, border: '1.5px solid #E5E7EB',
            fontSize: 13, fontWeight: 600, color: '#111827',
            background: '#FFFFFF', outline: 'none', cursor: 'pointer',
          }}
        />
      </div>

      {/* ── No data state ──────────────────────────────────────────────────── */}
      {!hasData && (
        <div style={{ ...CARD, padding: '60px 24px', textAlign: 'center', marginBottom: 20 }}>
          <div style={{ fontSize: 44, marginBottom: 16 }}>📊</div>
          <p style={{ fontSize: 15, fontWeight: 700, color: '#374151', margin: '0 0 8px' }}>No data for this month yet</p>
          <p style={{ fontSize: 13, color: '#9CA3AF', margin: 0 }}>
            Team members need to submit their daily updates using the new activity form.
          </p>
        </div>
      )}

      {/* ── KPI row ────────────────────────────────────────────────────────── */}
      <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', marginBottom: 18 }}>
        {[
          { label: 'Total Hours',     value: fmtH(kpis.totalHours),      emoji: '⏱️', color: '#3B82F6', bg: 'rgba(59,130,246,0.06)' },
          { label: 'Videos Edited',   value: String(kpis.totalVideos),    emoji: '🎬', color: '#E53935', bg: 'rgba(229,57,53,0.06)'  },
          { label: 'Posters Made',    value: String(kpis.totalPosters),   emoji: '🖼️', color: '#8B5CF6', bg: 'rgba(139,92,246,0.06)' },
          { label: 'Posts Published', value: String(kpis.totalPosts),     emoji: '📱', color: '#10B981', bg: 'rgba(16,185,129,0.06)' },
          { label: 'Team Cost',       value: fmtRupee(kpis.totalCost),    emoji: '💰', color: '#F59E0B', bg: 'rgba(245,158,11,0.06)' },
        ].map(k => (
          <div key={k.label} style={{ background: k.bg, borderRadius: 14, border: `1px solid ${k.color}22`, padding: '14px 16px', flex: 1, minWidth: 110 }}>
            <div style={{ fontSize: 20, marginBottom: 6 }}>{k.emoji}</div>
            <p style={{ fontSize: 24, fontWeight: 900, color: k.color, margin: '0 0 2px', fontFamily: 'var(--font-jakarta)', lineHeight: 1 }}>{k.value}</p>
            <p style={{ fontSize: 10, color: '#6B7280', margin: 0, fontWeight: 500 }}>{k.label}</p>
          </div>
        ))}
      </div>

      {/* ── 2-col grid ─────────────────────────────────────────────────────── */}
      <div className="grid grid-cols-1 lg:grid-cols-2" style={{ gap: 16, marginBottom: 16 }}>

        {/* Team Hours Breakdown */}
        <div style={CARD}>
          <SectionHeader title="Team Hours This Month" />
          <div style={{ padding: '16px 18px', display: 'flex', flexDirection: 'column', gap: 14 }}>
            {TEAM_ORDER.map(tc => {
              const cfg = TEAM_CFG[tc]
              const hrs = teamHours[tc] ?? 0
              const pct = Math.max(4, Math.round((hrs / maxTeamHours) * 100))
              return (
                <div key={tc}>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 5 }}>
                    <span style={{ fontSize: 13, fontWeight: 600, color: '#374151' }}>{cfg.emoji} {cfg.label}</span>
                    <span style={{ fontSize: 14, fontWeight: 900, color: cfg.color, fontFamily: 'var(--font-jakarta)' }}>{fmtH(hrs)}</span>
                  </div>
                  <div style={{ height: 8, background: '#F3F4F6', borderRadius: 4, overflow: 'hidden' }}>
                    <div style={{ width: `${pct}%`, height: '100%', background: cfg.color, borderRadius: 4 }} />
                  </div>
                </div>
              )
            })}
          </div>
        </div>

        {/* Activity Breakdown */}
        <div style={CARD}>
          <SectionHeader title="Activity Breakdown" />
          {activityStats.length === 0
            ? <EmptyState msg="No activities logged yet" />
            : (
              <div style={{ maxHeight: 320, overflowY: 'auto' }}>
                {activityStats.map((a, i) => {
                  const cfg = TEAM_CFG[a.team]
                  return (
                    <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 18px', borderBottom: '1px solid #F9FAFB' }}>
                      <span style={{ fontSize: 17, flexShrink: 0 }}>{a.emoji}</span>
                      <span style={{ fontSize: 13, fontWeight: 600, color: '#374151', flex: 1 }}>{a.name}</span>
                      {a.count > 0 && (
                        <span style={{ fontSize: 10, fontWeight: 700, padding: '2px 8px', borderRadius: 5, background: `${cfg.color}12`, color: cfg.color, flexShrink: 0 }}>
                          {a.count} units
                        </span>
                      )}
                      <span style={{ fontSize: 12, color: '#6B7280', minWidth: 38, textAlign: 'right', flexShrink: 0 }}>{fmtH(a.hours)}</span>
                      <span style={{ fontSize: 12, fontWeight: 800, color: '#111827', minWidth: 58, textAlign: 'right', fontFamily: 'var(--font-jakarta)', flexShrink: 0 }}>{fmtRupee(a.cost)}</span>
                    </div>
                  )
                })}
              </div>
            )}
        </div>

        {/* Member Performance */}
        <div style={CARD}>
          <SectionHeader title="Member Performance" />
          {memberStats.length === 0
            ? <EmptyState msg="No member data yet" />
            : memberStats.map((m, i) => (
              <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '11px 18px', borderBottom: '1px solid #F9FAFB' }}>
                <div style={{ width: 34, height: 34, borderRadius: '50%', background: 'rgba(222,26,26,0.08)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                  <span style={{ fontSize: 11, fontWeight: 800, color: '#DE1A1A' }}>{ini(m.name)}</span>
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <p style={{ fontSize: 13, fontWeight: 700, color: '#111827', margin: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{m.name}</p>
                  <p style={{ fontSize: 10, color: '#9CA3AF', margin: 0 }}>#{m.employee_id} · {m.entries} log entries</p>
                </div>
                <div style={{ textAlign: 'right', flexShrink: 0 }}>
                  <p style={{ fontSize: 14, fontWeight: 900, color: '#3B82F6', margin: 0, fontFamily: 'var(--font-jakarta)' }}>{fmtH(m.hours)}</p>
                  <p style={{ fontSize: 11, fontWeight: 700, color: '#DE1A1A', margin: 0 }}>{fmtRupee(m.cost)}</p>
                </div>
              </div>
            ))}
        </div>

        {/* Client Hours */}
        <div style={CARD}>
          <SectionHeader title="Client Hours & Cost" />
          {clientStats.length === 0
            ? <EmptyState msg="No client data yet — make sure members select a client" />
            : clientStats.slice(0, 10).map((c, i) => (
              <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '11px 18px', borderBottom: '1px solid #F9FAFB' }}>
                <div style={{ width: 34, height: 34, borderRadius: 10, background: 'rgba(99,102,241,0.08)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                  <span style={{ fontSize: 10, fontWeight: 800, color: '#6366F1' }}>{ini(c.name)}</span>
                </div>
                <p style={{ fontSize: 13, fontWeight: 600, color: '#374151', flex: 1, margin: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{c.name}</p>
                <p style={{ fontSize: 12, color: '#6B7280', margin: 0, flexShrink: 0 }}>{fmtH(c.hours)}</p>
                <p style={{ fontSize: 14, fontWeight: 900, color: '#111827', margin: 0, fontFamily: 'var(--font-jakarta)', flexShrink: 0, minWidth: 70, textAlign: 'right' }}>{fmtRupee(c.cost)}</p>
              </div>
            ))}
        </div>

      </div>

      {/* ── Posts Section ──────────────────────────────────────────────────── */}
      {(Object.keys(postsByType).length > 0 || recentPosts.length > 0) && (
        <div style={CARD}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '16px 18px 12px', borderBottom: '1px solid #F3F4F6' }}>
            <p style={{ fontSize: 14, fontWeight: 800, color: '#111827', margin: 0, fontFamily: 'var(--font-jakarta)' }}>
              📱 Posts Published This Month
            </p>
            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
              {Object.entries(postsByType).sort((a, b) => b[1] - a[1]).map(([type, count]) => (
                <span key={type} style={{ fontSize: 11, fontWeight: 700, padding: '3px 10px', borderRadius: 8, background: 'rgba(16,185,129,0.08)', color: '#10B981' }}>
                  {type}: {count}
                </span>
              ))}
              {Object.entries(postsByPlatform).sort((a, b) => b[1] - a[1]).map(([plat, count]) => (
                <span key={plat} style={{ fontSize: 11, fontWeight: 700, padding: '3px 10px', borderRadius: 8, background: 'rgba(59,130,246,0.08)', color: '#3B82F6' }}>
                  {plat}: {count}
                </span>
              ))}
            </div>
          </div>
          <div style={{ maxHeight: 320, overflowY: 'auto' }}>
            {recentPosts.map((p, i) => (
              <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '9px 18px', borderBottom: '1px solid #F9FAFB' }}>
                <span style={{ fontSize: 11, color: '#9CA3AF', minWidth: 72, flexShrink: 0 }}>
                  {new Date(p.date + 'T12:00:00').toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })}
                </span>
                <span style={{ fontSize: 12, fontWeight: 600, color: '#374151', flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{p.memberName}</span>
                {p.client_name && <span style={{ fontSize: 11, color: '#6B7280', flexShrink: 0, maxWidth: 100, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{p.client_name}</span>}
                <span style={{ fontSize: 10, fontWeight: 700, padding: '2px 8px', borderRadius: 5, background: 'rgba(59,130,246,0.08)', color: '#3B82F6', flexShrink: 0 }}>{p.platform}</span>
                <span style={{ fontSize: 10, fontWeight: 700, padding: '2px 8px', borderRadius: 5, background: 'rgba(16,185,129,0.08)', color: '#10B981', flexShrink: 0 }}>{p.post_type}</span>
              </div>
            ))}
          </div>
        </div>
      )}

    </div>
  )
}
