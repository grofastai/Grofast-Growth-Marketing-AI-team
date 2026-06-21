'use client'

import { useState } from 'react'
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

const TH: React.CSSProperties = {
  padding: '9px 16px', fontSize: 10, fontWeight: 700, color: '#9CA3AF',
  textAlign: 'left', borderBottom: '1px solid #F3F4F6',
  textTransform: 'uppercase', letterSpacing: '0.06em', whiteSpace: 'nowrap',
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
  const maxTeamHours = Math.max(...Object.values(teamHours), 1)

  const [filterMember, setFilterMember] = useState('')
  const [filterClient, setFilterClient] = useState('')

  const memberOptions = Array.from(new Map(logEntries.map(e => [e.memberId, e.memberName])).entries())
    .sort((a, b) => a[1].localeCompare(b[1]))
  const clientOptions = Array.from(new Set(logEntries.map(e => e.clientName).filter(c => c !== 'Unassigned')))
    .sort((a, b) => a.localeCompare(b))

  const filteredLogs = logEntries.filter(e =>
    (!filterMember || e.memberId === filterMember) &&
    (!filterClient || e.clientName === filterClient)
  )

  const drillTotalHours = filteredLogs.reduce((s, e) => s + e.hours, 0)
  const drillTotalCost  = filteredLogs.reduce((s, e) => s + e.cost,  0)
  const hasData = kpis.totalHours > 0 || kpis.totalPosts > 0

  return (
    <div style={{ padding: '20px 16px 60px', background: '#F8F9FB', minHeight: '100vh' }} className="sm:px-7">

      {/* ── Header ─────────────────────────────────────────────────────────── */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20, flexWrap: 'wrap', gap: 12 }}>
        <div>
          <h1 style={{ fontSize: 26, fontWeight: 900, color: '#111827', margin: 0, fontFamily: 'var(--font-jakarta)' }}>
            Team Insights
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

      {/* ── Filter & Drill-down ────────────────────────────────────────────── */}
      <div style={{ ...CARD, marginBottom: 18 }}>
        <div style={{ padding: '16px 18px 14px', borderBottom: '1px solid #F3F4F6' }}>
          <p style={{ fontSize: 14, fontWeight: 800, color: '#111827', margin: '0 0 2px', fontFamily: 'var(--font-jakarta)' }}>
            🔍 Work Drill-Down
          </p>
          <p style={{ fontSize: 11, color: '#9CA3AF', margin: 0 }}>Filter by member, client, or both to see detailed work breakdown</p>
        </div>
        <div style={{ padding: '14px 18px', display: 'flex', gap: 12, flexWrap: 'wrap', alignItems: 'center' }}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 4, minWidth: 200, flex: 1 }}>
            <label style={{ fontSize: 10, fontWeight: 700, color: '#6B7280', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Team Member</label>
            <select
              value={filterMember}
              onChange={e => setFilterMember(e.target.value)}
              style={{ padding: '8px 12px', borderRadius: 8, border: '1.5px solid #E5E7EB', fontSize: 13, color: '#111827', background: '#FFF', outline: 'none', cursor: 'pointer' }}
            >
              <option value="">All Members</option>
              {memberOptions.map(([id, name]) => (
                <option key={id} value={id}>{name}</option>
              ))}
            </select>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 4, minWidth: 200, flex: 1 }}>
            <label style={{ fontSize: 10, fontWeight: 700, color: '#6B7280', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Client</label>
            <select
              value={filterClient}
              onChange={e => setFilterClient(e.target.value)}
              style={{ padding: '8px 12px', borderRadius: 8, border: '1.5px solid #E5E7EB', fontSize: 13, color: '#111827', background: '#FFF', outline: 'none', cursor: 'pointer' }}
            >
              <option value="">All Clients</option>
              {clientOptions.map(c => (
                <option key={c} value={c}>{c}</option>
              ))}
            </select>
          </div>
          {(filterMember || filterClient) && (
            <button
              onClick={() => { setFilterMember(''); setFilterClient('') }}
              style={{ marginTop: 20, padding: '8px 14px', borderRadius: 8, border: '1px solid #E5E7EB', background: '#F9FAFB', fontSize: 12, fontWeight: 700, color: '#6B7280', cursor: 'pointer' }}
            >
              Clear
            </button>
          )}
        </div>

        {(filterMember || filterClient) && (
          <div style={{ borderTop: '1px solid #F3F4F6' }}>
            {/* context line */}
            <div style={{ padding: '10px 18px', background: '#F9FAFB', display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
              {filterMember && (
                <span style={{ fontSize: 12, fontWeight: 700, padding: '3px 10px', borderRadius: 20, background: 'rgba(229,57,53,0.08)', color: '#E53935' }}>
                  👤 {memberOptions.find(([id]) => id === filterMember)?.[1]}
                </span>
              )}
              {filterClient && (
                <span style={{ fontSize: 12, fontWeight: 700, padding: '3px 10px', borderRadius: 20, background: 'rgba(99,102,241,0.08)', color: '#6366F1' }}>
                  🏢 {filterClient}
                </span>
              )}
              <span style={{ fontSize: 11, color: '#9CA3AF', marginLeft: 'auto' }}>
                {filteredLogs.length} entries · {fmtH(drillTotalHours)} · {fmtRupee(drillTotalCost)}
              </span>
            </div>

            {filteredLogs.length === 0 ? (
              <p style={{ fontSize: 12, color: '#9CA3AF', textAlign: 'center', padding: '28px 0', margin: 0 }}>No work logged for this combination</p>
            ) : (
              <div style={{ overflowX: 'auto' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 520 }}>
                  <thead>
                    <tr style={{ background: '#F9FAFB' }}>
                      {(!filterMember) && <th style={TH}>Member</th>}
                      {(!filterClient) && <th style={TH}>Client</th>}
                      <th style={TH}>Activity</th>
                      <th style={TH}>Work Done</th>
                      <th style={{ ...TH, textAlign: 'right' }}>Hours</th>
                      <th style={{ ...TH, textAlign: 'right' }}>Value</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredLogs.map((e, i) => (
                      <tr key={i} style={{ borderBottom: '1px solid #F9FAFB' }}>
                        {(!filterMember) && (
                          <td style={{ padding: '10px 16px', fontSize: 12, fontWeight: 600, color: '#374151', whiteSpace: 'nowrap' }}>{e.memberName}</td>
                        )}
                        {(!filterClient) && (
                          <td style={{ padding: '10px 16px', fontSize: 12, color: '#6366F1', fontWeight: 600, whiteSpace: 'nowrap', maxWidth: 160, overflow: 'hidden', textOverflow: 'ellipsis' }}>{e.clientName}</td>
                        )}
                        <td style={{ padding: '10px 16px', fontSize: 12, color: '#374151', whiteSpace: 'nowrap' }}>
                          {e.activityEmoji} {e.activityName}
                        </td>
                        <td style={{ padding: '10px 16px', fontSize: 11, color: '#6B7280', maxWidth: 260 }}>
                          {e.titles.length > 0
                            ? e.titles.join(', ')
                            : <span style={{ color: '#D1D5DB', fontStyle: 'italic' }}>—</span>}
                        </td>
                        <td style={{ padding: '10px 16px', fontSize: 13, fontWeight: 800, color: '#3B82F6', textAlign: 'right', whiteSpace: 'nowrap', fontFamily: 'var(--font-jakarta)' }}>{fmtH(e.hours)}</td>
                        <td style={{ padding: '10px 16px', fontSize: 13, fontWeight: 800, color: '#16A34A', textAlign: 'right', whiteSpace: 'nowrap', fontFamily: 'var(--font-jakarta)' }}>{fmtRupee(e.cost)}</td>
                      </tr>
                    ))}
                  </tbody>
                  <tfoot>
                    <tr style={{ background: '#F9FAFB', borderTop: '2px solid #E5E7EB' }}>
                      <td colSpan={(!filterMember ? 1 : 0) + (!filterClient ? 1 : 0) + 2}
                        style={{ padding: '10px 16px', fontSize: 12, fontWeight: 800, color: '#111827' }}>
                        Total
                      </td>
                      <td style={{ padding: '10px 16px', fontSize: 14, fontWeight: 900, color: '#3B82F6', textAlign: 'right', fontFamily: 'var(--font-jakarta)' }}>{fmtH(drillTotalHours)}</td>
                      <td style={{ padding: '10px 16px', fontSize: 14, fontWeight: 900, color: '#16A34A', textAlign: 'right', fontFamily: 'var(--font-jakarta)' }}>{fmtRupee(drillTotalCost)}</td>
                    </tr>
                  </tfoot>
                </table>
              </div>
            )}
          </div>
        )}
      </div>

      {/* ── Employee Performance Tracking ──────────────────────────────────── */}
      {employeePerformance.length > 0 && (
        <div style={{ ...CARD, marginBottom: 18 }}>
          <div style={{ padding: '16px 18px 12px', borderBottom: '1px solid #F3F4F6' }}>
            <p style={{ fontSize: 14, fontWeight: 800, color: '#111827', margin: 0, fontFamily: 'var(--font-jakarta)' }}>
              👥 Employee Performance Tracking
            </p>
            <p style={{ fontSize: 11, color: '#9CA3AF', margin: '3px 0 0' }}>
              {new Date(month + '-01').toLocaleDateString('en-IN', { month: 'long', year: 'numeric' })} · Work value vs salary comparison
            </p>
          </div>
          <div className="overflow-x-auto">
            <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 720 }}>
              <thead>
                <tr style={{ background: '#FAFAFA' }}>
                  {['Employee', 'Clients', 'Tasks Done', 'Hours', 'Work Value', 'Salary', 'Value vs Pay', 'Score'].map(h => (
                    <th key={h} style={{ fontSize: 10, fontWeight: 800, color: '#9CA3AF', letterSpacing: '0.08em', textAlign: 'left', padding: '10px 14px', borderBottom: '1px solid #F3F4F6', whiteSpace: 'nowrap' }}>{h.toUpperCase()}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {employeePerformance.map((emp, i) => {
                  const ratio = emp.salary > 0 ? Math.round((emp.workValue / emp.salary) * 100) : null
                  const ratioColor = ratio == null ? '#9CA3AF' : ratio >= 100 ? '#10B981' : ratio >= 60 ? '#F59E0B' : '#EF4444'
                  const ratioBg   = ratio == null ? '#F3F4F6' : ratio >= 100 ? 'rgba(16,185,129,0.08)' : ratio >= 60 ? 'rgba(245,158,11,0.08)' : 'rgba(239,68,68,0.08)'
                  const initials  = ini(emp.name)
                  const colors    = ['#de1a1a','#6366F1','#10B981','#F59E0B','#8B5CF6','#06B6D4']
                  const clr       = colors[i % colors.length]
                  return (
                    <tr key={emp.id} style={{ borderBottom: '1px solid #F9FAFB', background: i % 2 === 0 ? '#FFF' : '#FDFCFC' }}>
                      {/* Employee */}
                      <td style={{ padding: '12px 14px' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                          <div style={{ width: 34, height: 34, borderRadius: 10, background: `${clr}18`, border: `1.5px solid ${clr}30`, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                            <span style={{ fontSize: 12, fontWeight: 900, color: clr }}>{initials}</span>
                          </div>
                          <div>
                            <p style={{ fontSize: 13, fontWeight: 700, color: '#111827', margin: 0 }}>{emp.name}</p>
                            <p style={{ fontSize: 10, color: '#C4C4C4', margin: 0 }}>#{emp.employee_id}</p>
                          </div>
                        </div>
                      </td>
                      {/* Clients */}
                      <td style={{ padding: '12px 14px', maxWidth: 200 }}>
                        {emp.clients.length === 0
                          ? <span style={{ fontSize: 11, color: '#D1D5DB' }}>—</span>
                          : <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
                              {emp.clients.slice(0, 3).map(c => (
                                <span key={c} style={{ fontSize: 10, fontWeight: 700, padding: '2px 8px', borderRadius: 6, background: 'rgba(99,102,241,0.08)', color: '#6366F1', whiteSpace: 'nowrap' }}>{c}</span>
                              ))}
                              {emp.clients.length > 3 && <span style={{ fontSize: 10, fontWeight: 700, padding: '2px 8px', borderRadius: 6, background: '#F3F4F6', color: '#6B7280' }}>+{emp.clients.length - 3}</span>}
                            </div>
                        }
                      </td>
                      {/* Tasks */}
                      <td style={{ padding: '12px 14px' }}>
                        <span style={{ fontSize: 13, fontWeight: 700, color: emp.tasksCompleted > 0 ? '#111827' : '#D1D5DB' }}>{emp.tasksCompleted}</span>
                      </td>
                      {/* Hours */}
                      <td style={{ padding: '12px 14px' }}>
                        <span style={{ fontSize: 13, fontWeight: 700, color: emp.hours > 0 ? '#3B82F6' : '#D1D5DB' }}>{emp.hours > 0 ? fmtH(emp.hours) : '—'}</span>
                      </td>
                      {/* Work Value */}
                      <td style={{ padding: '12px 14px' }}>
                        <span style={{ fontSize: 13, fontWeight: 700, color: emp.workValue > 0 ? '#10B981' : '#D1D5DB' }}>{emp.workValue > 0 ? fmtRupee(emp.workValue) : '—'}</span>
                      </td>
                      {/* Salary */}
                      <td style={{ padding: '12px 14px' }}>
                        <span style={{ fontSize: 13, fontWeight: 700, color: emp.salary > 0 ? '#111827' : '#D1D5DB' }}>{emp.salary > 0 ? fmtRupee(emp.salary) : 'Not set'}</span>
                      </td>
                      {/* Value vs Pay */}
                      <td style={{ padding: '12px 14px' }}>
                        <span style={{ fontSize: 12, fontWeight: 800, padding: '4px 10px', borderRadius: 8, background: ratioBg, color: ratioColor, whiteSpace: 'nowrap' }}>
                          {ratio != null ? `${ratio}%` : '—'}
                        </span>
                      </td>
                      {/* Productivity Score */}
                      <td style={{ padding: '12px 14px' }}>
                        {(() => {
                          const s = emp.productivityScore
                          const sc = s >= 70 ? '#10B981' : s >= 40 ? '#F59E0B' : '#EF4444'
                          const sb = s >= 70 ? 'rgba(16,185,129,0.08)' : s >= 40 ? 'rgba(245,158,11,0.08)' : 'rgba(239,68,68,0.08)'
                          return (
                            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                              <div style={{ width: 36, height: 36, borderRadius: 10, background: sb, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                                <span style={{ fontSize: 13, fontWeight: 900, color: sc }}>{s}</span>
                              </div>
                              <div style={{ width: 50, height: 6, background: '#F3F4F6', borderRadius: 3, overflow: 'hidden' }}>
                                <div style={{ width: `${s}%`, height: '100%', background: sc, borderRadius: 3 }} />
                              </div>
                            </div>
                          )
                        })()}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
          <div style={{ padding: '10px 18px', background: '#FAFAFA', borderTop: '1px solid #F3F4F6', display: 'flex', gap: 16 }}>
            {[
              { dot: '#10B981', label: '≥ 100%  Generating more value than salary' },
              { dot: '#F59E0B', label: '60–99%  Moderate value' },
              { dot: '#EF4444', label: '< 60%  Below expected value' },
            ].map(l => (
              <div key={l.label} style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                <div style={{ width: 8, height: 8, borderRadius: '50%', background: l.dot, flexShrink: 0 }} />
                <span style={{ fontSize: 10, color: '#6B7280', fontWeight: 500 }}>{l.label}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ── Leaderboard + Hours per Client ─────────────────────────────────── */}
      {employeePerformance.length > 0 && (
        <div className="grid grid-cols-1 lg:grid-cols-2" style={{ gap: 16, marginBottom: 18 }}>

          {/* Leaderboard */}
          <div style={CARD}>
            <div style={{ padding: '16px 18px 12px', borderBottom: '1px solid #F3F4F6' }}>
              <p style={{ fontSize: 14, fontWeight: 800, color: '#111827', margin: 0, fontFamily: 'var(--font-jakarta)' }}>🏆 Monthly Performance Ranking</p>
              <p style={{ fontSize: 11, color: '#9CA3AF', margin: '3px 0 0' }}>Ranked by productivity score</p>
            </div>
            <div style={{ padding: '12px 18px', display: 'flex', flexDirection: 'column', gap: 8 }}>
              {[...employeePerformance].sort((a, b) => b.productivityScore - a.productivityScore).map((emp, i) => {
                const medal   = i === 0 ? '🥇' : i === 1 ? '🥈' : i === 2 ? '🥉' : `${i + 1}.`
                const s       = emp.productivityScore
                const sc      = s >= 70 ? '#10B981' : s >= 40 ? '#F59E0B' : '#EF4444'
                const clrList = ['#de1a1a','#6366F1','#10B981','#F59E0B','#8B5CF6','#06B6D4']
                const clr     = clrList[i % clrList.length]
                return (
                  <div key={emp.id} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '10px 12px', borderRadius: 12, background: i === 0 ? 'rgba(245,158,11,0.06)' : '#FAFAFA', border: i === 0 ? '1px solid rgba(245,158,11,0.2)' : '1px solid transparent' }}>
                    <span style={{ fontSize: i < 3 ? 20 : 12, fontWeight: 700, color: '#6B7280', minWidth: 28, textAlign: 'center' }}>{medal}</span>
                    <div style={{ width: 32, height: 32, borderRadius: 10, background: `${clr}18`, border: `1.5px solid ${clr}30`, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                      <span style={{ fontSize: 11, fontWeight: 900, color: clr }}>{ini(emp.name)}</span>
                    </div>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <p style={{ fontSize: 13, fontWeight: 700, color: '#111827', margin: 0, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{emp.name}</p>
                      <p style={{ fontSize: 10, color: '#9CA3AF', margin: 0 }}>{emp.clients.length} clients · {emp.tasksCompleted} tasks · {fmtH(emp.hours)}</p>
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexShrink: 0 }}>
                      <div style={{ width: 48, height: 5, background: '#F3F4F6', borderRadius: 3, overflow: 'hidden' }}>
                        <div style={{ width: `${s}%`, height: '100%', background: sc, borderRadius: 3 }} />
                      </div>
                      <span style={{ fontSize: 13, fontWeight: 900, color: sc, minWidth: 28, textAlign: 'right' }}>{s}</span>
                    </div>
                  </div>
                )
              })}
            </div>
          </div>

          {/* Hours per Client */}
          <div style={CARD}>
            <div style={{ padding: '16px 18px 12px', borderBottom: '1px solid #F3F4F6' }}>
              <p style={{ fontSize: 14, fontWeight: 800, color: '#111827', margin: 0, fontFamily: 'var(--font-jakarta)' }}>⏱️ Hours per Client (by Employee)</p>
              <p style={{ fontSize: 11, color: '#9CA3AF', margin: '3px 0 0' }}>Top 3 clients per team member</p>
            </div>
            <div style={{ padding: '12px 18px', display: 'flex', flexDirection: 'column', gap: 14 }}>
              {employeePerformance.filter(e => e.hoursPerClient.length > 0).map((emp, i) => {
                const clrList = ['#de1a1a','#6366F1','#10B981','#F59E0B','#8B5CF6','#06B6D4']
                const clr = clrList[i % clrList.length]
                const topClients = emp.hoursPerClient.slice(0, 3)
                const maxH = topClients[0]?.hours ?? 1
                return (
                  <div key={emp.id}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
                      <div style={{ width: 24, height: 24, borderRadius: 7, background: `${clr}18`, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                        <span style={{ fontSize: 9, fontWeight: 900, color: clr }}>{ini(emp.name)}</span>
                      </div>
                      <span style={{ fontSize: 12, fontWeight: 700, color: '#374151' }}>{emp.name}</span>
                      <span style={{ fontSize: 10, color: '#9CA3AF', marginLeft: 'auto' }}>{fmtH(emp.hours)} total</span>
                    </div>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 5, paddingLeft: 32 }}>
                      {topClients.map(c => (
                        <div key={c.name}>
                          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 3 }}>
                            <span style={{ fontSize: 11, color: '#6B7280', fontWeight: 500, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', maxWidth: 160 }}>{c.name}</span>
                            <span style={{ fontSize: 11, fontWeight: 700, color: clr }}>{fmtH(c.hours)}</span>
                          </div>
                          <div style={{ height: 5, background: '#F3F4F6', borderRadius: 3, overflow: 'hidden' }}>
                            <div style={{ width: `${Math.round((c.hours / maxH) * 100)}%`, height: '100%', background: clr, borderRadius: 3 }} />
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )
              })}
              {employeePerformance.every(e => e.hoursPerClient.length === 0) && (
                <EmptyState msg="No client hours logged yet" />
              )}
            </div>
          </div>
        </div>
      )}

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
                    <div key={i} style={{ borderBottom: '1px solid #F9FAFB' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 18px' }}>
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
                      {a.titles.length > 0 && (
                        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4, padding: '0 18px 10px 44px' }}>
                          {a.titles.slice(0, 5).map((t, ti) => (
                            <span key={ti} style={{ fontSize: 10, fontWeight: 600, color: '#6B7280', background: '#F3F4F6', borderRadius: 5, padding: '2px 7px', maxWidth: 160, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                              {t}
                            </span>
                          ))}
                          {a.titles.length > 5 && (
                            <span style={{ fontSize: 10, fontWeight: 600, color: '#9CA3AF', background: '#F3F4F6', borderRadius: 5, padding: '2px 7px' }}>
                              +{a.titles.length - 5} more
                            </span>
                          )}
                        </div>
                      )}
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

      {/* ── Member Working Hours ──────────────────────────────────────────── */}
      {employeePerformance.length > 0 && (
        <div style={{ ...CARD, marginTop: 16 }}>
          <div style={{ padding: '16px 18px 12px', borderBottom: '1px solid #F3F4F6' }}>
            <p style={{ fontSize: 14, fontWeight: 800, color: '#111827', margin: 0, fontFamily: 'var(--font-jakarta)' }}>
              ⏱️ Member Working Hours
            </p>
            <p style={{ fontSize: 11, color: '#9CA3AF', margin: '3px 0 0' }}>
              Hours logged this month · Total Value = Hours × Hourly Rate
            </p>
          </div>
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 500 }}>
              <thead>
                <tr style={{ background: '#F9FAFB' }}>
                  {['Member', 'Hourly Rate', 'Hours Logged', 'Total Value', 'Entries'].map(h => (
                    <th key={h} style={{ padding: '9px 16px', fontSize: 10, fontWeight: 700, color: '#9CA3AF', textAlign: 'left', borderBottom: '1px solid #F3F4F6', textTransform: 'uppercase', letterSpacing: '0.06em', whiteSpace: 'nowrap' }}>
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {[...employeePerformance].sort((a, b) => b.hours - a.hours).map((emp, i) => {
                  const clr = ['#E53935','#F59E0B','#8B5CF6','#10B981','#3B82F6'][i % 5]
                  const noRate = emp.hourlyRate === 0
                  return (
                    <tr key={emp.id} style={{ borderBottom: '1px solid #F9FAFB' }}>
                      {/* Member */}
                      <td style={{ padding: '12px 16px' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                          <div style={{ width: 32, height: 32, borderRadius: 9, background: `${clr}18`, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                            <span style={{ fontSize: 10, fontWeight: 900, color: clr }}>{ini(emp.name)}</span>
                          </div>
                          <div>
                            <p style={{ fontSize: 13, fontWeight: 700, color: '#111827', margin: 0 }}>{emp.name}</p>
                            <p style={{ fontSize: 10, color: '#9CA3AF', margin: 0 }}>#{emp.employee_id}</p>
                          </div>
                        </div>
                      </td>
                      {/* Hourly Rate */}
                      <td style={{ padding: '12px 16px' }}>
                        <span style={{ fontSize: 13, fontWeight: 700, color: noRate ? '#D1D5DB' : '#6366F1', fontFamily: 'var(--font-jakarta)' }}>
                          {noRate ? '—' : `${fmtRupee(emp.hourlyRate)}/hr`}
                        </span>
                      </td>
                      {/* Hours Logged */}
                      <td style={{ padding: '12px 16px' }}>
                        <div>
                          <span style={{ fontSize: 14, fontWeight: 900, color: '#3B82F6', fontFamily: 'var(--font-jakarta)' }}>{fmtH(emp.hours)}</span>
                          <div style={{ marginTop: 4, width: 80, height: 4, background: '#F3F4F6', borderRadius: 2, overflow: 'hidden' }}>
                            <div style={{ height: '100%', width: `${Math.round((emp.hours / Math.max(...employeePerformance.map(e => e.hours), 1)) * 100)}%`, background: '#3B82F6', borderRadius: 2 }} />
                          </div>
                        </div>
                      </td>
                      {/* Total Value */}
                      <td style={{ padding: '12px 16px' }}>
                        <span style={{ fontSize: 14, fontWeight: 900, color: noRate ? '#9CA3AF' : '#16A34A', fontFamily: 'var(--font-jakarta)' }}>
                          {noRate ? fmtH(emp.hours) : fmtRupee(emp.workValue)}
                        </span>
                        {!noRate && (
                          <p style={{ fontSize: 10, color: '#9CA3AF', margin: '2px 0 0' }}>
                            {fmtH(emp.hours)} × {fmtRupee(emp.hourlyRate)}/hr
                          </p>
                        )}
                      </td>
                      {/* Entries */}
                      <td style={{ padding: '12px 16px', fontSize: 12, color: '#6B7280' }}>
                        {(memberStats.find(m => m.employee_id === emp.employee_id)?.entries ?? 0)} logs
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

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
