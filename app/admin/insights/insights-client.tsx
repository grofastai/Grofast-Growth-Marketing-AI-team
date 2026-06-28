'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import type { MemberUtilization, ClientHour, InsightsKPIs, DailyTrend, SpendCategory } from './page'

// ── helpers ───────────────────────────────────────────────────────────────────

function fmtRupee(n: number) { return `₹${Math.round(n).toLocaleString('en-IN')}` }
function fmtH(h: number)     { return `${h.toFixed(1)}h` }
function ini(n: string)      { return n.split(' ').map(w => w[0] ?? '').join('').slice(0, 2).toUpperCase() }

function effColor(eff: number, overworked: boolean) {
  if (overworked)  return '#6366F1'
  if (eff >= 90)   return '#22C55E'
  if (eff >= 70)   return '#F59E0B'
  return '#EF4444'
}
function effLabel(eff: number, overworked: boolean) {
  if (overworked)  return 'Overworked'
  if (eff >= 90)   return 'Great'
  if (eff >= 70)   return 'Moderate'
  return 'Low'
}
function effBg(eff: number, overworked: boolean) {
  if (overworked)  return 'rgba(99,102,241,0.08)'
  if (eff >= 90)   return 'rgba(34,197,94,0.08)'
  if (eff >= 70)   return 'rgba(245,158,11,0.08)'
  return 'rgba(239,68,68,0.08)'
}

const WORK_CFG = [
  { key: 'shoot',     label: 'Shooting',   emoji: '📸', color: '#F97316' },
  { key: 'edit',      label: 'Editing',    emoji: '🎬', color: '#E53935' },
  { key: 'technical', label: 'Tech Work',  emoji: '💼', color: '#6366F1' },
  { key: 'voiceover', label: 'Voiceover',  emoji: '🎙️', color: '#8B5CF6' },
  { key: 'poster',    label: 'Posters',    emoji: '🖼️', color: '#10B981' },
  { key: 'learning',  label: 'Learning',   emoji: '📚', color: '#0EA5E9' },
] as const

// ── Sub-components ────────────────────────────────────────────────────────────

function KpiTile({ label, value, sub, emoji, color, isCost }: {
  label: string; value: string; sub?: string; emoji: string; color: string; isCost?: boolean
}) {
  return (
    <div style={{
      background: '#fff', borderRadius: 16, padding: '16px 18px',
      border: `1.5px solid ${color}22`, borderTop: `3px solid ${color}`,
      boxShadow: `0 4px 16px ${color}10, 0 1px 4px rgba(0,0,0,0.04)`,
      flex: 1, minWidth: 140,
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 10 }}>
        <span style={{ fontSize: 15 }}>{emoji}</span>
        <span style={{ fontSize: 10, fontWeight: 800, color, textTransform: 'uppercase', letterSpacing: '0.07em' }}>{label}</span>
      </div>
      <p style={{ fontSize: 22, fontWeight: 900, margin: 0, color: isCost ? color : '#111827', fontFamily: 'var(--font-jakarta)', lineHeight: 1 }}>
        {value}
      </p>
      {sub && <p style={{ fontSize: 11, color: '#9CA3AF', margin: '4px 0 0', fontWeight: 500 }}>{sub}</p>}
    </div>
  )
}

function SectionCard({ title, emoji, children, action }: {
  title: string; emoji: string; children: React.ReactNode; action?: React.ReactNode
}) {
  return (
    <div style={{
      background: '#fff', borderRadius: 16, border: '1px solid #EBEDF2',
      overflow: 'hidden', boxShadow: '0 2px 8px rgba(0,0,0,0.04)',
    }}>
      <div style={{
        display: 'flex', alignItems: 'center', gap: 10, padding: '14px 20px',
        borderBottom: '1px solid #F3F4F6',
      }}>
        <span style={{ fontSize: 16 }}>{emoji}</span>
        <span style={{ fontSize: 14, fontWeight: 800, color: '#111827', flex: 1, fontFamily: 'var(--font-jakarta)' }}>
          {title}
        </span>
        {action}
      </div>
      {children}
    </div>
  )
}

// ── Main component ─────────────────────────────────────────────────────────────

export type AllMember = {
  name: string
  employeeId: string
  team: string | null
  monthlySalary: number
  hourlyRate: number
}

export default function InsightsClient({
  month, today, kpis, memberUtilization, clientHours, dailyTrend, spendByCategory, allMembers,
}: {
  month: string
  today: string
  kpis: InsightsKPIs
  memberUtilization: MemberUtilization[]
  clientHours: ClientHour[]
  dailyTrend: DailyTrend[]
  spendByCategory: SpendCategory[]
  allMembers: AllMember[]
}) {
  const router  = useRouter()
  const [expandedMember, setExpandedMember] = useState<string | null>(null)

  function setMonth(m: string) {
    router.push(`/admin/insights?month=${m}`)
  }
  function prevMonth() {
    const [y, m] = month.split('-').map(Number)
    const d = new Date(y, m - 1, 1); d.setMonth(d.getMonth() - 1)
    setMonth(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`)
  }
  function nextMonth() {
    const [y, m] = month.split('-').map(Number)
    const d = new Date(y, m - 1, 1); d.setMonth(d.getMonth() + 1)
    const next = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
    if (next <= today.slice(0, 7)) setMonth(next)
  }

  const monthLabel = new Date(month + '-15').toLocaleDateString('en-IN', { month: 'long', year: 'numeric' })
  const isCurrentMonth = month === today.slice(0, 7)

  // Work breakdown totals from member data
  const workTotals = WORK_CFG.map(cfg => ({
    ...cfg,
    hours: memberUtilization.reduce((s, m) => s + m.workBreakdown[cfg.key], 0),
  }))
  const maxWorkHours = Math.max(...workTotals.map(w => w.hours), 1)

  return (
    <div style={{ padding: '24px 28px 60px', display: 'flex', flexDirection: 'column', gap: 24, background: '#F8F9FB', minHeight: '100vh' }}>

      {/* ── Page header ─────────────────────────────────────────────────── */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 16, flexWrap: 'wrap' }}>
        <div style={{ flex: 1 }}>
          <h1 style={{ fontSize: 22, fontWeight: 900, color: '#111827', margin: 0, fontFamily: 'var(--font-jakarta)' }}>
            Team Insights
          </h1>
          <p style={{ fontSize: 12, color: '#9CA3AF', margin: '3px 0 0' }}>
            Salary utilization, tracked hours, productivity gap — {monthLabel}
          </p>
        </div>
        {/* Month nav */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <button onClick={prevMonth} style={{
            width: 32, height: 32, borderRadius: 9, border: '1.5px solid #E5E7EB',
            background: '#fff', cursor: 'pointer', fontSize: 16, display: 'flex', alignItems: 'center', justifyContent: 'center',
          }}>‹</button>
          <div style={{
            padding: '7px 16px', borderRadius: 10, background: '#fff',
            border: '1.5px solid #E5E7EB', fontSize: 13, fontWeight: 700, color: '#111827',
          }}>
            {monthLabel}
          </div>
          <button onClick={nextMonth} disabled={isCurrentMonth} style={{
            width: 32, height: 32, borderRadius: 9, border: '1.5px solid #E5E7EB',
            background: '#fff', cursor: isCurrentMonth ? 'not-allowed' : 'pointer',
            fontSize: 16, display: 'flex', alignItems: 'center', justifyContent: 'center',
            opacity: isCurrentMonth ? 0.35 : 1,
          }}>›</button>
          <input type="month" value={month} max={today.slice(0, 7)} onChange={e => setMonth(e.target.value)}
            style={{ padding: '7px 12px', borderRadius: 10, border: '1.5px solid #E5E7EB', fontSize: 12, color: '#374151', background: '#F9FAFB', outline: 'none' }}
          />
        </div>
      </div>

      {/* ── KPI Row ──────────────────────────────────────────────────────── */}
      <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
        <KpiTile label="Tracked Hours"     emoji="⏱️"  value={fmtH(kpis.totalTrackedHours)}  sub={`${kpis.activeMemberCount} members`}       color="#3B82F6" />
        <KpiTile label="Salary Spent"      emoji="💰"  value={fmtRupee(kpis.totalCost)}       sub="on logged work"                            color="#DE1A1A" isCost />
        <KpiTile label="Productivity Gap"  emoji="⚠️"  value={fmtRupee(kpis.totalWastedCost)} sub="below-target hours × rate"                 color="#EF4444" isCost />
        <KpiTile label="Avg Efficiency"    emoji="📊"  value={`${kpis.avgEfficiency}%`}        sub={kpis.avgEfficiency >= 80 ? 'On track' : 'Needs attention'} color={kpis.avgEfficiency >= 80 ? '#22C55E' : '#F59E0B'} />
        <KpiTile label="Clients Served"    emoji="🏢"  value={String(kpis.clientsServedCount)} sub="unique names in work logs"                color="#8B5CF6" />
        <KpiTile label="Learning"          emoji="📚"  value={fmtH(kpis.totalLearningHours)}  sub="team total"                               color="#0EA5E9" />
      </div>

      {/* ── Spend by Client Category ─────────────────────────────────────── */}
      {spendByCategory.length > 0 && (
        <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
          {spendByCategory.map(cat => {
            const totalCostAll = spendByCategory.reduce((s, c) => s + c.cost, 0)
            const pct = totalCostAll > 0 ? Math.round((cat.cost / totalCostAll) * 100) : 0
            return (
              <div key={cat.label} style={{
                flex: 1, minWidth: 160,
                background: '#fff', borderRadius: 16, padding: '16px 18px',
                border: `1.5px solid ${cat.color}22`, borderLeft: `4px solid ${cat.color}`,
                boxShadow: `0 4px 16px ${cat.color}10`,
              }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 10 }}>
                  <span style={{ fontSize: 16 }}>{cat.emoji}</span>
                  <span style={{ fontSize: 11, fontWeight: 800, color: cat.color, textTransform: 'uppercase', letterSpacing: '0.06em' }}>
                    {cat.label}
                  </span>
                  <span style={{ marginLeft: 'auto', fontSize: 10, fontWeight: 700, padding: '1px 7px', borderRadius: 99, background: `${cat.color}15`, color: cat.color }}>
                    {pct}%
                  </span>
                </div>
                <p style={{ fontSize: 20, fontWeight: 900, margin: '0 0 2px', color: '#111827', fontFamily: 'var(--font-jakarta)' }}>
                  {fmtRupee(cat.cost)}
                </p>
                <p style={{ fontSize: 11, color: '#9CA3AF', margin: 0, fontWeight: 600 }}>
                  {fmtH(cat.hours)} tracked
                </p>
              </div>
            )
          })}
        </div>
      )}

      {/* ── Team Utilization Table ───────────────────────────────────────── */}
      <SectionCard title="Team Utilization — Productivity Gap Tracker" emoji="📋">
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 700 }}>
            <thead>
              <tr style={{ background: '#F9FAFB' }}>
                {['Member', 'Team', 'Days In', 'Expected', 'Tracked', 'Avg/Day', 'Learning', 'Gap Hrs', 'Prod. Gap', 'Efficiency'].map(h => (
                  <th key={h} style={{ padding: '10px 14px', fontSize: 10, fontWeight: 700, color: '#9CA3AF', textAlign: h === 'Member' || h === 'Team' ? 'left' : 'right', borderBottom: '1px solid #F3F4F6', textTransform: 'uppercase', letterSpacing: '0.06em', whiteSpace: 'nowrap' }}>
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {memberUtilization.length === 0 ? (
                <tr><td colSpan={9} style={{ textAlign: 'center', padding: '40px 0', color: '#9CA3AF', fontSize: 13 }}>No attendance data for this month</td></tr>
              ) : memberUtilization.map((m, i) => {
                const eColor = effColor(m.efficiency, m.overworked)
                const eBg    = effBg(m.efficiency, m.overworked)
                return (
                  <tr key={m.id} style={{ borderBottom: '1px solid #F9FAFB', background: i % 2 === 0 ? '#fff' : '#FAFBFF' }}>
                    {/* Member */}
                    <td style={{ padding: '12px 14px' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                        <div style={{
                          width: 32, height: 32, borderRadius: 10, flexShrink: 0,
                          background: `linear-gradient(135deg, #DE1A1A22, #DE1A1A33)`,
                          border: '1.5px solid #DE1A1A30',
                          display: 'flex', alignItems: 'center', justifyContent: 'center',
                          fontSize: 11, fontWeight: 900, color: '#DE1A1A',
                        }}>{ini(m.name)}</div>
                        <div>
                          <p style={{ fontSize: 12, fontWeight: 700, color: '#111827', margin: 0 }}>{m.name}</p>
                          <p style={{ fontSize: 10, color: '#9CA3AF', margin: 0 }}>{m.employeeId}</p>
                        </div>
                      </div>
                    </td>
                    {/* Team */}
                    <td style={{ padding: '12px 14px' }}>
                      <span style={{ fontSize: 10, fontWeight: 700, padding: '2px 8px', borderRadius: 6, background: '#F3F4F6', color: '#6B7280' }}>
                        {m.team ?? '—'}
                      </span>
                    </td>
                    {/* Days In */}
                    <td style={{ padding: '12px 14px', fontSize: 13, fontWeight: 700, color: '#374151', textAlign: 'right' }}>
                      {m.workingDays}
                    </td>
                    {/* Expected */}
                    <td style={{ padding: '12px 14px', fontSize: 12, color: '#6B7280', textAlign: 'right' }}>
                      {fmtH(m.expectedHours)}
                    </td>
                    {/* Tracked */}
                    <td style={{ padding: '12px 14px', fontSize: 13, fontWeight: 700, color: '#111827', textAlign: 'right' }}>
                      {fmtH(m.trackedHours)}
                    </td>
                    {/* Avg/Day */}
                    {(() => {
                      const avg = m.workingDays > 0 ? m.trackedHours / m.workingDays : 0
                      const avgColor = avg >= 8 ? '#22C55E' : avg >= 6 ? '#F59E0B' : '#EF4444'
                      return (
                        <td style={{ padding: '12px 14px', textAlign: 'right' }}>
                          <span style={{ fontSize: 12, fontWeight: 800, color: avgColor }}>
                            {avg > 0 ? `${avg.toFixed(1)}h` : '—'}
                          </span>
                        </td>
                      )
                    })()}
                    {/* Learning */}
                    <td style={{ padding: '12px 14px', fontSize: 12, fontWeight: 600, color: '#0EA5E9', textAlign: 'right' }}>
                      {m.learningHours > 0 ? fmtH(m.learningHours) : '—'}
                    </td>
                    {/* Untracked */}
                    <td style={{ padding: '12px 14px', textAlign: 'right' }}>
                      {m.untrackedHours > 0 ? (
                        <span style={{ fontSize: 12, fontWeight: 700, color: '#EF4444' }}>{fmtH(m.untrackedHours)}</span>
                      ) : (
                        <span style={{ fontSize: 12, color: '#22C55E', fontWeight: 700 }}>—</span>
                      )}
                    </td>
                    {/* Gap ₹ */}
                    <td style={{ padding: '12px 14px', textAlign: 'right' }}>
                      {m.wastedCost > 0 ? (
                        <span style={{ fontSize: 12, fontWeight: 800, color: '#EF4444' }}>{fmtRupee(m.wastedCost)}</span>
                      ) : (
                        <span style={{ fontSize: 12, color: '#22C55E', fontWeight: 700 }}>₹0</span>
                      )}
                    </td>
                    {/* Efficiency badge */}
                    <td style={{ padding: '12px 14px', textAlign: 'right' }}>
                      <span style={{
                        display: 'inline-flex', alignItems: 'center', gap: 4,
                        fontSize: 11, fontWeight: 800, padding: '3px 10px', borderRadius: 99,
                        background: eBg, color: eColor,
                        border: `1px solid ${eColor}30`,
                      }}>
                        {m.efficiency}% · {effLabel(m.efficiency, m.overworked)}
                      </span>
                    </td>
                  </tr>
                )
              })}
            </tbody>
            {/* Summary row */}
            {memberUtilization.length > 0 && (
              <tfoot>
                <tr style={{ borderTop: '2px solid #EBEDF2', background: '#F9FAFB' }}>
                  <td colSpan={2} style={{ padding: '10px 14px', fontSize: 11, fontWeight: 800, color: '#374151' }}>TOTAL / AVG</td>
                  <td style={{ padding: '10px 14px', textAlign: 'right', fontSize: 12, fontWeight: 700, color: '#374151' }}>
                    —
                  </td>
                  <td style={{ padding: '10px 14px', textAlign: 'right', fontSize: 12, fontWeight: 700, color: '#6B7280' }}>
                    {fmtH(memberUtilization.reduce((s, m) => s + m.expectedHours, 0))}
                  </td>
                  <td style={{ padding: '10px 14px', textAlign: 'right', fontSize: 12, fontWeight: 800, color: '#111827' }}>
                    {fmtH(kpis.totalTrackedHours)}
                  </td>
                  {/* Avg/Day total */}
                  <td style={{ padding: '10px 14px', textAlign: 'right' }}>
                    {(() => {
                      const totalDays = memberUtilization.reduce((s, m) => s + m.workingDays, 0)
                      const avg = totalDays > 0 ? kpis.totalTrackedHours / totalDays : 0
                      const avgColor = avg >= 8 ? '#22C55E' : avg >= 6 ? '#F59E0B' : '#EF4444'
                      return <span style={{ fontSize: 12, fontWeight: 800, color: avgColor }}>{avg > 0 ? `${avg.toFixed(1)}h` : '—'}</span>
                    })()}
                  </td>
                  <td style={{ padding: '10px 14px', textAlign: 'right', fontSize: 12, fontWeight: 700, color: '#0EA5E9' }}>
                    {fmtH(kpis.totalLearningHours)}
                  </td>
                  <td style={{ padding: '10px 14px', textAlign: 'right', fontSize: 12, fontWeight: 800, color: '#EF4444' }}>
                    {fmtH(memberUtilization.reduce((s, m) => s + m.untrackedHours, 0))}
                  </td>
                  <td style={{ padding: '10px 14px', textAlign: 'right', fontSize: 13, fontWeight: 900, color: '#EF4444' }}>
                    {fmtRupee(kpis.totalWastedCost)}
                  </td>
                  <td style={{ padding: '10px 14px', textAlign: 'right' }}>
                    <span style={{
                      display: 'inline-flex', fontSize: 11, fontWeight: 800, padding: '3px 10px', borderRadius: 99,
                      background: effBg(kpis.avgEfficiency, false), color: effColor(kpis.avgEfficiency, false),
                      border: `1px solid ${effColor(kpis.avgEfficiency, false)}30`,
                    }}>
                      {kpis.avgEfficiency}% avg
                    </span>
                  </td>
                </tr>
              </tfoot>
            )}
          </table>
        </div>
      </SectionCard>

      {/* ── Work Type Breakdown ──────────────────────────────────────────── */}
      <SectionCard title="Work Type Breakdown" emoji="📊">
        <div style={{ padding: '16px 20px', display: 'flex', flexDirection: 'column', gap: 10 }}>
          {workTotals.map(w => (
            <div key={w.key} style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
              <span style={{ fontSize: 16, width: 22, flexShrink: 0 }}>{w.emoji}</span>
              <span style={{ fontSize: 12, fontWeight: 700, color: '#374151', width: 90, flexShrink: 0 }}>{w.label}</span>
              <div style={{ flex: 1, height: 10, background: '#F3F4F6', borderRadius: 99, overflow: 'hidden' }}>
                <div style={{
                  height: '100%', borderRadius: 99,
                  width: `${Math.max(1, (w.hours / maxWorkHours) * 100)}%`,
                  background: `linear-gradient(90deg, ${w.color}CC, ${w.color})`,
                  transition: 'width 0.4s',
                }} />
              </div>
              <span style={{ fontSize: 12, fontWeight: 700, color: w.color, width: 52, textAlign: 'right', flexShrink: 0 }}>
                {fmtH(w.hours)}
              </span>
            </div>
          ))}
        </div>
      </SectionCard>

      {/* ── 2-col row: Client Hours + Member Cards ───────────────────────── */}
      <div className="grid grid-cols-1 md:grid-cols-2" style={{ gap: 20 }}>

        {/* Client Hours */}
        <SectionCard title="Client Hours This Month" emoji="🏢">
          <div style={{ padding: '8px 0', maxHeight: 400, overflowY: 'auto' }}>
            {clientHours.length === 0 ? (
              <p style={{ textAlign: 'center', color: '#9CA3AF', fontSize: 12, padding: '32px 0' }}>No client data</p>
            ) : clientHours.map((c, i) => {
              const pct = (c.hours / (clientHours[0]?.hours ?? 1)) * 100
              const isInternal = ['GROFAST DIGITAL', 'GROFAST AI', 'KARTHICK BRANDS'].includes(c.name.toUpperCase())
              return (
                <div key={c.name} style={{
                  display: 'flex', alignItems: 'center', gap: 12, padding: '10px 18px',
                  borderBottom: '1px solid #F9FAFB',
                }}>
                  <span style={{ fontSize: 11, fontWeight: 900, color: '#D1D5DB', width: 18, flexShrink: 0 }}>{i + 1}</span>
                  <div style={{
                    width: 28, height: 28, borderRadius: 8, flexShrink: 0,
                    background: isInternal ? 'rgba(222,26,26,0.1)' : 'rgba(99,102,241,0.1)',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    fontSize: 10, fontWeight: 900, color: isInternal ? '#DE1A1A' : '#6366F1',
                  }}>{ini(c.name)}</div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <p style={{ fontSize: 11, fontWeight: 700, color: '#374151', margin: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {c.name}
                    </p>
                    <div style={{ height: 4, background: '#F3F4F6', borderRadius: 99, marginTop: 4 }}>
                      <div style={{ height: '100%', borderRadius: 99, width: `${pct}%`, background: isInternal ? '#DE1A1A' : '#6366F1' }} />
                    </div>
                  </div>
                  <div style={{ textAlign: 'right', flexShrink: 0 }}>
                    <p style={{ fontSize: 12, fontWeight: 700, color: '#111827', margin: 0 }}>{fmtH(c.hours)}</p>
                    <p style={{ fontSize: 10, color: '#9CA3AF', margin: 0 }}>{fmtRupee(c.cost)}</p>
                  </div>
                </div>
              )
            })}
          </div>
        </SectionCard>

        {/* Member Performance Cards */}
        <SectionCard title="Member Work Breakdown" emoji="👥">
          <div style={{ padding: '8px 0', maxHeight: 400, overflowY: 'auto' }}>
            {memberUtilization.length === 0 ? (
              <p style={{ textAlign: 'center', color: '#9CA3AF', fontSize: 12, padding: '32px 0' }}>No data</p>
            ) : memberUtilization.map(m => {
              const isExpanded = expandedMember === m.id
              const eColor = effColor(m.efficiency, m.overworked)
              return (
                <div key={m.id} style={{ borderBottom: '1px solid #F9FAFB' }}>
                  {/* Row */}
                  <button
                    onClick={() => setExpandedMember(isExpanded ? null : m.id)}
                    style={{
                      width: '100%', textAlign: 'left', display: 'flex', alignItems: 'center', gap: 10,
                      padding: '10px 18px', background: 'none', border: 'none', cursor: 'pointer',
                    }}
                  >
                    <div style={{
                      width: 32, height: 32, borderRadius: 10, flexShrink: 0,
                      background: 'rgba(222,26,26,0.08)', border: '1.5px solid rgba(222,26,26,0.2)',
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                      fontSize: 11, fontWeight: 900, color: '#DE1A1A',
                    }}>{ini(m.name)}</div>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <p style={{ fontSize: 12, fontWeight: 700, color: '#111827', margin: 0 }}>{m.name}</p>
                      <p style={{ fontSize: 10, color: '#9CA3AF', margin: 0 }}>{m.team ?? ''}</p>
                    </div>
                    <div style={{ textAlign: 'right', flexShrink: 0 }}>
                      <p style={{ fontSize: 12, fontWeight: 800, color: '#111827', margin: 0 }}>{fmtH(m.trackedHours)}</p>
                      <span style={{ fontSize: 9, fontWeight: 800, color: eColor }}>
                        {m.efficiency}%
                      </span>
                    </div>
                    <span style={{ fontSize: 12, color: '#D1D5DB', marginLeft: 4 }}>{isExpanded ? '▲' : '▼'}</span>
                  </button>

                  {/* Expanded detail */}
                  {isExpanded && (
                    <div style={{ padding: '0 18px 14px 18px', display: 'flex', flexDirection: 'column', gap: 8 }}>
                      {/* Work bars */}
                      <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                        {WORK_CFG.filter(w => m.workBreakdown[w.key] > 0).map(w => (
                          <div key={w.key} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                            <span style={{ fontSize: 12, width: 18 }}>{w.emoji}</span>
                            <span style={{ fontSize: 10, color: '#6B7280', width: 72 }}>{w.label}</span>
                            <div style={{ flex: 1, height: 6, background: '#F3F4F6', borderRadius: 3 }}>
                              <div style={{
                                height: '100%', borderRadius: 3,
                                width: `${Math.max(2, (m.workBreakdown[w.key] / m.trackedHours) * 100)}%`,
                                background: w.color,
                              }} />
                            </div>
                            <span style={{ fontSize: 10, fontWeight: 700, color: w.color, width: 36, textAlign: 'right' }}>
                              {fmtH(m.workBreakdown[w.key])}
                            </span>
                          </div>
                        ))}
                      </div>
                      {/* Clients */}
                      {m.clients.length > 0 && (
                        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
                          {m.clients.map(c => (
                            <span key={c} style={{ fontSize: 9, padding: '2px 7px', borderRadius: 5, background: '#F3F4F6', color: '#374151', fontWeight: 600 }}>
                              {c}
                            </span>
                          ))}
                        </div>
                      )}
                      {/* Cost summary */}
                      <div style={{ display: 'flex', gap: 12, marginTop: 4 }}>
                        <div>
                          <p style={{ fontSize: 9, color: '#9CA3AF', margin: 0, textTransform: 'uppercase', fontWeight: 700 }}>Cost</p>
                          <p style={{ fontSize: 13, fontWeight: 900, color: '#DE1A1A', margin: 0 }}>{fmtRupee(m.totalCost)}</p>
                        </div>
                        {m.wastedCost > 0 && (
                          <div>
                            <p style={{ fontSize: 9, color: '#9CA3AF', margin: 0, textTransform: 'uppercase', fontWeight: 700 }}>Gap</p>
                            <p style={{ fontSize: 13, fontWeight: 900, color: '#EF4444', margin: 0 }}>{fmtRupee(m.wastedCost)}</p>
                          </div>
                        )}
                        <div>
                          <p style={{ fontSize: 9, color: '#9CA3AF', margin: 0, textTransform: 'uppercase', fontWeight: 700 }}>Salary</p>
                          <p style={{ fontSize: 13, fontWeight: 900, color: '#374151', margin: 0 }}>{fmtRupee(m.monthlySalary)}</p>
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        </SectionCard>
      </div>

      {/* ── Daily Trend Bars ─────────────────────────────────────────────── */}
      {dailyTrend.length > 0 && (
        <SectionCard title="Daily Tracked Hours" emoji="📅">
          <div style={{ padding: '16px 20px', overflowX: 'auto' }}>
            <div style={{ display: 'flex', alignItems: 'flex-end', gap: 4, height: 80, minWidth: dailyTrend.length * 24 }}>
              {(() => {
                const maxH = Math.max(...dailyTrend.map(d => d.hours), 1)
                return dailyTrend.map(d => {
                  const pct = (d.hours / maxH) * 100
                  const day = new Date(d.date + 'T12:00:00').getDate()
                  return (
                    <div key={d.date} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 3, flex: 1, minWidth: 18 }}>
                      <div
                        title={`${d.date}: ${fmtH(d.hours)}`}
                        style={{
                          width: '100%', borderRadius: '3px 3px 0 0',
                          height: `${Math.max(4, pct)}%`,
                          background: pct > 70 ? 'linear-gradient(180deg,#22C55E,#16A34A)' : pct > 40 ? 'linear-gradient(180deg,#F59E0B,#D97706)' : 'linear-gradient(180deg,#E5E7EB,#D1D5DB)',
                        }}
                      />
                      <span style={{ fontSize: 8, color: '#9CA3AF', fontWeight: 600 }}>{day}</span>
                    </div>
                  )
                })
              })()}
            </div>
          </div>
        </SectionCard>
      )}

      {/* ── Per-Hour Rate Reference Table ───────────────────────────────── */}
      <SectionCard title="Employee Per-Hour Rate Reference" emoji="💰">
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
            <thead>
              <tr style={{ background: '#F9FAFB' }}>
                {['Employee', 'ID', 'Team', 'Monthly Salary', 'Per Hour Rate'].map(h => (
                  <th key={h} style={{
                    padding: '10px 16px', textAlign: 'left', fontSize: 10,
                    fontWeight: 800, color: '#6B7280', textTransform: 'uppercase',
                    letterSpacing: '0.06em', borderBottom: '1px solid #F3F4F6',
                    whiteSpace: 'nowrap',
                  }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {allMembers.map((m, i) => (
                <tr key={m.employeeId} style={{ background: i % 2 === 0 ? '#fff' : '#FAFAFA' }}>
                  <td style={{ padding: '10px 16px', fontWeight: 700, color: '#111827' }}>{m.name.trim()}</td>
                  <td style={{ padding: '10px 16px', color: '#6B7280', fontWeight: 600, fontFamily: 'monospace' }}>{m.employeeId}</td>
                  <td style={{ padding: '10px 16px', color: '#6B7280', fontSize: 12 }}>{m.team ?? '—'}</td>
                  <td style={{ padding: '10px 16px', fontWeight: 700, color: '#374151' }}>
                    {m.monthlySalary > 0 ? `₹${m.monthlySalary.toLocaleString('en-IN')}` : '—'}
                  </td>
                  <td style={{ padding: '10px 16px' }}>
                    {m.hourlyRate > 0 ? (
                      <span style={{
                        background: 'rgba(222,26,26,0.08)', color: '#DE1A1A',
                        fontWeight: 800, fontSize: 13, padding: '3px 10px',
                        borderRadius: 8, whiteSpace: 'nowrap',
                      }}>
                        ₹{m.hourlyRate.toFixed(2)}/hr
                      </span>
                    ) : <span style={{ color: '#9CA3AF' }}>—</span>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p style={{ fontSize: 10, color: '#9CA3AF', padding: '10px 16px', margin: 0 }}>
          Formula: Monthly Salary ÷ 212.5 hrs (25 days × 8.5 hrs)
        </p>
      </SectionCard>

    </div>
  )
}
