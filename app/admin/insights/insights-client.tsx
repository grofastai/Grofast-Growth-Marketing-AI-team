'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { updateClientMonthlyFee } from '@/lib/actions/clients'

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

type ProfitRow = {
  name: string; hours: number; cost: number
  fee: number | null; profit: number | null; margin: number | null
}

type EmpPerf = {
  id: string; name: string; employee_id: string
  clients: string[]; tasksCompleted: number
  hours: number; workValue: number; salary: number
}

export default function InsightsClient({
  month, today,
  teamHours, activityStats, memberStats, clientStats,
  profitability,
  postsByType, postsByPlatform, recentPosts, kpis,
  employeePerformance,
}: {
  month: string
  today: string
  teamHours: Record<string, number>
  activityStats: Array<{ name: string; emoji: string; team: string; hours: number; count: number; cost: number; titles: string[] }>
  memberStats: Array<{ name: string; employee_id: string; hours: number; cost: number; entries: number }>
  clientStats: Array<{ name: string; hours: number; cost: number }>
  profitability: ProfitRow[]
  postsByType: Record<string, number>
  postsByPlatform: Record<string, number>
  recentPosts: Array<{ memberName: string; client_name: string | null; platform: string; post_type: string; date: string }>
  kpis: { totalHours: number; totalCost: number; totalVideos: number; totalPosters: number; totalPosts: number }
  employeePerformance: EmpPerf[]
}) {
  const router = useRouter()
  const [, startTransition] = useTransition()
  const [editingFee, setEditingFee] = useState<string | null>(null)
  const [feeInput, setFeeInput]     = useState('')
  const [savingFee, setSavingFee]   = useState<string | null>(null)
  const maxTeamHours = Math.max(...Object.values(teamHours), 1)

  function saveFee(clientName: string) {
    const fee = parseFloat(feeInput.replace(/[^\d.]/g, ''))
    setSavingFee(clientName)
    startTransition(async () => {
      const res = await updateClientMonthlyFee(clientName, isNaN(fee) ? null : fee)
      setSavingFee(null)
      if (!res.success) {
        alert(res.error ?? 'Failed to save fee')
        return
      }
      setEditingFee(null)
      router.refresh()
    })
  }
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
                  {['Employee', 'Clients Worked', 'Tasks Done', 'Hours', 'Work Value', 'Salary', 'Value vs Pay'].map(h => (
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

      {/* ── Client Profitability ───────────────────────────────────────────── */}
      <div style={{ ...CARD, marginTop: 16 }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '16px 18px 12px', borderBottom: '1px solid #F3F4F6' }}>
          <p style={{ fontSize: 14, fontWeight: 800, color: '#111827', margin: 0, fontFamily: 'var(--font-jakarta)' }}>
            💰 Client Profitability
          </p>
          <p style={{ fontSize: 11, color: '#9CA3AF', margin: 0 }}>Click fee to edit · Cost = team hours × salary rate</p>
        </div>
        {profitability.length === 0 ? (
          <p style={{ fontSize: 12, color: '#9CA3AF', textAlign: 'center', padding: '28px 0', margin: 0 }}>
            No client work logged this month
          </p>
        ) : (
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 560 }}>
              <thead>
                <tr style={{ background: '#F9FAFB' }}>
                  {['Client', 'Hours', 'Team Cost', 'Monthly Fee', 'Profit', 'Margin'].map(h => (
                    <th key={h} style={{ padding: '9px 16px', fontSize: 10, fontWeight: 700, color: '#9CA3AF', textAlign: 'left', borderBottom: '1px solid #F3F4F6', textTransform: 'uppercase', letterSpacing: '0.06em', whiteSpace: 'nowrap' }}>
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {profitability.map((c, i) => {
                  const isProfit  = c.profit != null && c.profit >= 0
                  const noFee     = c.fee == null
                  const isEditing = editingFee === c.name
                  return (
                    <tr key={c.name} style={{ borderBottom: '1px solid #F9FAFB' }}>
                      {/* Client */}
                      <td style={{ padding: '12px 16px' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                          <div style={{ width: 30, height: 30, borderRadius: 8, background: 'rgba(99,102,241,0.08)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                            <span style={{ fontSize: 9, fontWeight: 800, color: '#6366F1' }}>{ini(c.name)}</span>
                          </div>
                          <span style={{ fontSize: 13, fontWeight: 600, color: '#111827' }}>{c.name}</span>
                        </div>
                      </td>
                      {/* Hours */}
                      <td style={{ padding: '12px 16px', fontSize: 12, color: '#6B7280' }}>{fmtH(c.hours)}</td>
                      {/* Cost */}
                      <td style={{ padding: '12px 16px', fontSize: 13, fontWeight: 700, color: '#374151', fontFamily: 'var(--font-jakarta)' }}>{fmtRupee(c.cost)}</td>
                      {/* Monthly Fee — click to edit */}
                      <td style={{ padding: '12px 16px' }}>
                        {isEditing ? (
                          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                            <input
                              autoFocus
                              type="number"
                              value={feeInput}
                              onChange={e => setFeeInput(e.target.value)}
                              onKeyDown={e => { if (e.key === 'Enter') saveFee(c.name); if (e.key === 'Escape') setEditingFee(null) }}
                              placeholder="₹ monthly fee"
                              style={{ width: 110, padding: '5px 8px', borderRadius: 7, border: '1.5px solid #DE1A1A', fontSize: 12, color: '#111827', background: '#FFF', outline: 'none' }}
                            />
                            <button onClick={() => saveFee(c.name)} disabled={savingFee === c.name}
                              style={{ padding: '5px 10px', borderRadius: 7, background: '#DE1A1A', color: '#FFF', fontSize: 11, fontWeight: 700, border: 'none', cursor: 'pointer' }}>
                              {savingFee === c.name ? '…' : 'Save'}
                            </button>
                            <button onClick={() => setEditingFee(null)}
                              style={{ padding: '5px 8px', borderRadius: 7, background: '#F3F4F6', color: '#6B7280', fontSize: 11, fontWeight: 700, border: 'none', cursor: 'pointer' }}>
                              ✕
                            </button>
                          </div>
                        ) : (
                          <button
                            onClick={() => { setEditingFee(c.name); setFeeInput(c.fee != null ? String(c.fee) : '') }}
                            style={{ fontSize: 13, fontWeight: 700, color: noFee ? '#D1D5DB' : '#111827', background: 'none', border: noFee ? '1px dashed #E5E7EB' : 'none', borderRadius: 6, padding: noFee ? '3px 8px' : 0, cursor: 'pointer', fontFamily: 'var(--font-jakarta)' }}
                            title="Click to set monthly fee">
                            {noFee ? '+ Set fee' : fmtRupee(c.fee!)}
                          </button>
                        )}
                      </td>
                      {/* Profit */}
                      <td style={{ padding: '12px 16px' }}>
                        {noFee ? (
                          <span style={{ fontSize: 11, color: '#D1D5DB' }}>—</span>
                        ) : (
                          <span style={{ fontSize: 13, fontWeight: 800, color: isProfit ? '#16A34A' : '#DC2626', fontFamily: 'var(--font-jakarta)' }}>
                            {isProfit ? '+' : ''}{fmtRupee(c.profit!)}
                          </span>
                        )}
                      </td>
                      {/* Margin */}
                      <td style={{ padding: '12px 16px' }}>
                        {noFee ? (
                          <span style={{ fontSize: 11, color: '#D1D5DB' }}>—</span>
                        ) : (
                          <span style={{
                            fontSize: 11, fontWeight: 800, padding: '3px 10px', borderRadius: 20,
                            background: isProfit ? 'rgba(22,163,74,0.1)' : 'rgba(220,38,38,0.1)',
                            color: isProfit ? '#16A34A' : '#DC2626',
                          }}>
                            {c.margin != null ? `${c.margin}%` : '—'}
                          </span>
                        )}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
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
