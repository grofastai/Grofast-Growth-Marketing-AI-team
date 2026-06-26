'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import type { MemberUtilization, ClientHour, InsightsKPIs, DailyTrend, SpendCategory } from './page'

// ── Formatters ────────────────────────────────────────────────────────────────

function fmtRupee(n: number) { return `₹${Math.round(n).toLocaleString('en-IN')}` }
function fmtH(h: number)     { return `${h.toFixed(1)}h` }
function ini(n: string)      { return n.split(' ').map(w => w[0] ?? '').join('').slice(0, 2).toUpperCase() }

function effColor(eff: number, overworked: boolean) {
  if (overworked) return '#7C3AED'
  if (eff >= 90)  return '#16A34A'
  if (eff >= 70)  return '#D97706'
  return '#DC2626'
}
function effLabel(eff: number, overworked: boolean) {
  if (overworked) return 'Overworked'
  if (eff >= 90)  return 'Excellent'
  if (eff >= 70)  return 'Moderate'
  return 'Low'
}
function effBg(eff: number, overworked: boolean) {
  if (overworked) return '#F5F3FF'
  if (eff >= 90)  return '#F0FDF4'
  if (eff >= 70)  return '#FFFBEB'
  return '#FEF2F2'
}

const WORK_CFG = [
  { key: 'shoot',     label: 'Shooting',   color: '#F97316' },
  { key: 'edit',      label: 'Editing',    color: '#DC2626' },
  { key: 'technical', label: 'Technical',  color: '#6366F1' },
  { key: 'voiceover', label: 'Voiceover',  color: '#8B5CF6' },
  { key: 'poster',    label: 'Posters',    color: '#10B981' },
  { key: 'learning',  label: 'Learning',   color: '#0EA5E9' },
] as const

// ── Design tokens ─────────────────────────────────────────────────────────────

const T = {
  bg:       '#F6F7F9',
  card:     '#FFFFFF',
  border:   '#E4E7EC',
  text:     '#0F172A',
  sub:      '#64748B',
  muted:    '#94A3B8',
  brand:    '#DC2626',
  success:  '#16A34A',
  warn:     '#D97706',
  info:     '#2563EB',
  purple:   '#7C3AED',
}

// ── KPI Card ──────────────────────────────────────────────────────────────────

function KpiCard({ label, value, sub, accent, large }: {
  label: string; value: string; sub?: string; accent: string; large?: boolean
}) {
  return (
    <div style={{
      background: T.card,
      borderRadius: 14,
      padding: '20px 22px',
      border: `1px solid ${T.border}`,
      boxShadow: '0 1px 4px rgba(15,23,42,0.05)',
      flex: 1,
      minWidth: 140,
      position: 'relative',
      overflow: 'hidden',
    }}>
      <div style={{
        position: 'absolute', top: 0, left: 0, right: 0, height: 3,
        background: accent,
        borderRadius: '14px 14px 0 0',
      }} />
      <p style={{ fontSize: 10, fontWeight: 700, color: T.muted, margin: '0 0 10px', textTransform: 'uppercase', letterSpacing: '0.08em' }}>
        {label}
      </p>
      <p style={{ fontSize: large ? 28 : 24, fontWeight: 800, color: T.text, margin: 0, lineHeight: 1, fontFamily: 'var(--font-jakarta)' }}>
        {value}
      </p>
      {sub && (
        <p style={{ fontSize: 11, color: T.sub, margin: '6px 0 0', fontWeight: 500 }}>{sub}</p>
      )}
    </div>
  )
}

// ── Section Header ────────────────────────────────────────────────────────────

function Section({ title, sub, children, action }: {
  title: string; sub?: string; children: React.ReactNode; action?: React.ReactNode
}) {
  return (
    <div style={{
      background: T.card,
      borderRadius: 14,
      border: `1px solid ${T.border}`,
      boxShadow: '0 1px 4px rgba(15,23,42,0.05)',
      overflow: 'hidden',
    }}>
      <div style={{
        display: 'flex', alignItems: 'center', gap: 10,
        padding: '16px 22px', borderBottom: `1px solid ${T.border}`,
      }}>
        <div style={{ flex: 1 }}>
          <p style={{ fontSize: 13, fontWeight: 700, color: T.text, margin: 0, fontFamily: 'var(--font-jakarta)' }}>{title}</p>
          {sub && <p style={{ fontSize: 11, color: T.muted, margin: '2px 0 0' }}>{sub}</p>}
        </div>
        {action}
      </div>
      {children}
    </div>
  )
}

// ── Stat pill ─────────────────────────────────────────────────────────────────

function Pill({ value, color, bg }: { value: string; color: string; bg: string }) {
  return (
    <span style={{
      display: 'inline-block', fontSize: 11, fontWeight: 700, padding: '3px 10px',
      borderRadius: 99, background: bg, color, whiteSpace: 'nowrap',
    }}>
      {value}
    </span>
  )
}

// ── Types ─────────────────────────────────────────────────────────────────────

export type AllMember = {
  name: string
  employeeId: string
  team: string | null
  monthlySalary: number
  hourlyRate: number
}

// ── Main ──────────────────────────────────────────────────────────────────────

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
  const router = useRouter()
  const [expandedMember, setExpandedMember] = useState<string | null>(null)

  function setMonth(m: string) { router.push(`/admin/insights?month=${m}`) }
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

  const monthLabel    = new Date(month + '-15').toLocaleDateString('en-IN', { month: 'long', year: 'numeric' })
  const isCurrentMonth = month === today.slice(0, 7)

  const workTotals = WORK_CFG.map(cfg => ({
    ...cfg,
    hours: memberUtilization.reduce((s, m) => s + m.workBreakdown[cfg.key], 0),
  }))
  const maxWorkHours = Math.max(...workTotals.map(w => w.hours), 1)

  const totalCostAll = spendByCategory.reduce((s, c) => s + c.cost, 0)

  const navBtn: React.CSSProperties = {
    width: 32, height: 32, borderRadius: 8, border: `1px solid ${T.border}`,
    background: T.card, cursor: 'pointer', fontSize: 16,
    display: 'flex', alignItems: 'center', justifyContent: 'center',
    color: T.sub, fontWeight: 600,
  }

  return (
    <div style={{ padding: '28px 32px 72px', display: 'flex', flexDirection: 'column', gap: 20, background: T.bg, minHeight: '100vh' }}>

      {/* ── Header ──────────────────────────────────────────────────────── */}
      <div style={{ display: 'flex', alignItems: 'flex-start', gap: 16, flexWrap: 'wrap' }}>
        <div style={{ flex: 1 }}>
          <h1 style={{ fontSize: 20, fontWeight: 800, color: T.text, margin: 0, fontFamily: 'var(--font-jakarta)' }}>
            Team Insights
          </h1>
          <p style={{ fontSize: 12, color: T.muted, margin: '3px 0 0' }}>
            {monthLabel} · Salary utilization, tracked hours &amp; productivity analysis
          </p>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <button onClick={prevMonth} style={navBtn}>‹</button>
          <div style={{
            padding: '7px 16px', borderRadius: 9, background: T.card,
            border: `1px solid ${T.border}`, fontSize: 13, fontWeight: 700, color: T.text,
            minWidth: 130, textAlign: 'center',
          }}>
            {monthLabel}
          </div>
          <button onClick={nextMonth} disabled={isCurrentMonth} style={{ ...navBtn, opacity: isCurrentMonth ? 0.3 : 1, cursor: isCurrentMonth ? 'not-allowed' : 'pointer' }}>›</button>
          <input type="month" value={month} max={today.slice(0, 7)} onChange={e => setMonth(e.target.value)}
            style={{ padding: '7px 10px', borderRadius: 9, border: `1px solid ${T.border}`, fontSize: 12, color: T.sub, background: T.card, outline: 'none' }}
          />
        </div>
      </div>

      {/* ── KPI Row ─────────────────────────────────────────────────────── */}
      <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
        <KpiCard label="Tracked Hours"     value={fmtH(kpis.totalTrackedHours)}    sub={`${kpis.activeMemberCount} active members`}                        accent={T.info} />
        <KpiCard label="Salary Spent"      value={fmtRupee(kpis.totalCost)}         sub="on logged work"                                                    accent={T.brand} />
        <KpiCard label="Productivity Gap"  value={fmtRupee(kpis.totalWastedCost)}  sub="below-target hours × rate"                                          accent="#F59E0B" />
        <KpiCard label="Avg Efficiency"    value={`${kpis.avgEfficiency}%`}          sub={kpis.avgEfficiency >= 80 ? 'On track' : 'Needs attention'}         accent={kpis.avgEfficiency >= 80 ? T.success : '#F59E0B'} />
        <KpiCard label="Clients Served"    value={String(kpis.clientsServedCount)}  sub="this month"                                                         accent={T.purple} />
        <KpiCard label="Learning Hours"    value={fmtH(kpis.totalLearningHours)}   sub="team total"                                                          accent="#0EA5E9" />
      </div>

      {/* ── Spend by Category ───────────────────────────────────────────── */}
      {spendByCategory.length > 0 && (
        <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
          {spendByCategory.map(cat => {
            const pct = totalCostAll > 0 ? Math.round((cat.cost / totalCostAll) * 100) : 0
            return (
              <div key={cat.label} style={{
                flex: 1, minWidth: 160, background: T.card, borderRadius: 14, padding: '18px 20px',
                border: `1px solid ${T.border}`,
                borderBottom: `3px solid ${cat.color}`,
                boxShadow: '0 1px 4px rgba(15,23,42,0.05)',
              }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
                  <span style={{ fontSize: 10, fontWeight: 700, color: T.muted, textTransform: 'uppercase', letterSpacing: '0.08em' }}>
                    {cat.label}
                  </span>
                  <span style={{ fontSize: 11, fontWeight: 800, color: cat.color, background: `${cat.color}12`, padding: '2px 8px', borderRadius: 6 }}>
                    {pct}%
                  </span>
                </div>
                <p style={{ fontSize: 20, fontWeight: 800, margin: '0 0 4px', color: T.text, fontFamily: 'var(--font-jakarta)' }}>
                  {fmtRupee(cat.cost)}
                </p>
                <p style={{ fontSize: 11, color: T.muted, margin: '0 0 10px', fontWeight: 500 }}>
                  {fmtH(cat.hours)} tracked
                </p>
                <div style={{ height: 3, background: `${cat.color}20`, borderRadius: 99 }}>
                  <div style={{ height: '100%', width: `${pct}%`, background: cat.color, borderRadius: 99, transition: 'width 0.5s' }} />
                </div>
              </div>
            )
          })}
        </div>
      )}

      {/* ── Team Utilization Table ───────────────────────────────────────── */}
      <Section title="Team Utilization" sub="Attendance, tracked hours and productivity gap per member">
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 750 }}>
            <thead>
              <tr style={{ background: '#FAFBFC' }}>
                {['Member', 'Team', 'Days In', 'Expected', 'Tracked', 'Avg / Day', 'Learning', 'Gap Hrs', 'Gap Cost', 'Efficiency'].map(h => (
                  <th key={h} style={{
                    padding: '11px 16px', fontSize: 10, fontWeight: 700, color: T.muted,
                    textAlign: h === 'Member' || h === 'Team' ? 'left' : 'right',
                    borderBottom: `1px solid ${T.border}`,
                    textTransform: 'uppercase', letterSpacing: '0.07em', whiteSpace: 'nowrap',
                  }}>
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {memberUtilization.length === 0 ? (
                <tr><td colSpan={10} style={{ textAlign: 'center', padding: '48px 0', color: T.muted, fontSize: 13 }}>No attendance data for this month</td></tr>
              ) : memberUtilization.map((m) => {
                const eColor = effColor(m.efficiency, m.overworked)
                const eBg    = effBg(m.efficiency, m.overworked)
                const avg    = m.workingDays > 0 ? m.trackedHours / m.workingDays : 0
                const avgColor = avg >= 8 ? T.success : avg >= 6 ? T.warn : T.brand
                return (
                  <tr key={m.id} style={{ borderBottom: `1px solid ${T.border}`, transition: 'background 0.15s' }}
                    onMouseEnter={e => (e.currentTarget.style.background = '#F8FAFC')}
                    onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
                  >
                    <td style={{ padding: '13px 16px' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                        <div style={{
                          width: 34, height: 34, borderRadius: 10, flexShrink: 0,
                          background: 'linear-gradient(135deg, #FEE2E2, #FECACA)',
                          display: 'flex', alignItems: 'center', justifyContent: 'center',
                          fontSize: 11, fontWeight: 800, color: T.brand,
                        }}>{ini(m.name)}</div>
                        <div>
                          <p style={{ fontSize: 13, fontWeight: 700, color: T.text, margin: 0 }}>{m.name}</p>
                          <p style={{ fontSize: 10, color: T.muted, margin: 0 }}>{m.employeeId}</p>
                        </div>
                      </div>
                    </td>
                    <td style={{ padding: '13px 16px' }}>
                      <span style={{ fontSize: 11, fontWeight: 600, padding: '3px 9px', borderRadius: 6, background: '#F1F5F9', color: T.sub }}>
                        {m.team ?? '—'}
                      </span>
                    </td>
                    <td style={{ padding: '13px 16px', fontSize: 13, fontWeight: 700, color: T.text, textAlign: 'right' }}>{m.workingDays}</td>
                    <td style={{ padding: '13px 16px', fontSize: 12, color: T.sub, textAlign: 'right' }}>{fmtH(m.expectedHours)}</td>
                    <td style={{ padding: '13px 16px', fontSize: 13, fontWeight: 700, color: T.text, textAlign: 'right' }}>{fmtH(m.trackedHours)}</td>
                    <td style={{ padding: '13px 16px', textAlign: 'right' }}>
                      <span style={{ fontSize: 12, fontWeight: 700, color: avgColor }}>{avg > 0 ? `${avg.toFixed(1)}h` : '—'}</span>
                    </td>
                    <td style={{ padding: '13px 16px', fontSize: 12, fontWeight: 600, color: '#0EA5E9', textAlign: 'right' }}>
                      {m.learningHours > 0 ? fmtH(m.learningHours) : '—'}
                    </td>
                    <td style={{ padding: '13px 16px', textAlign: 'right' }}>
                      {m.untrackedHours > 0
                        ? <span style={{ fontSize: 12, fontWeight: 700, color: '#F59E0B' }}>{fmtH(m.untrackedHours)}</span>
                        : <span style={{ fontSize: 12, fontWeight: 700, color: T.success }}>—</span>}
                    </td>
                    <td style={{ padding: '13px 16px', textAlign: 'right' }}>
                      {m.wastedCost > 0
                        ? <span style={{ fontSize: 12, fontWeight: 800, color: T.brand }}>{fmtRupee(m.wastedCost)}</span>
                        : <span style={{ fontSize: 12, fontWeight: 700, color: T.success }}>₹0</span>}
                    </td>
                    <td style={{ padding: '13px 16px', textAlign: 'right' }}>
                      <span style={{
                        display: 'inline-flex', alignItems: 'center', gap: 4,
                        fontSize: 11, fontWeight: 700, padding: '4px 10px', borderRadius: 99,
                        background: eBg, color: eColor,
                      }}>
                        {m.efficiency}% · {effLabel(m.efficiency, m.overworked)}
                      </span>
                    </td>
                  </tr>
                )
              })}
            </tbody>
            {memberUtilization.length > 0 && (
              <tfoot>
                <tr style={{ background: '#FAFBFC', borderTop: `2px solid ${T.border}` }}>
                  <td colSpan={2} style={{ padding: '12px 16px', fontSize: 11, fontWeight: 800, color: T.sub, textTransform: 'uppercase', letterSpacing: '0.06em' }}>Total / Avg</td>
                  <td style={{ padding: '12px 16px', textAlign: 'right', fontSize: 12, color: T.sub }}>—</td>
                  <td style={{ padding: '12px 16px', textAlign: 'right', fontSize: 12, fontWeight: 700, color: T.sub }}>
                    {fmtH(memberUtilization.reduce((s, m) => s + m.expectedHours, 0))}
                  </td>
                  <td style={{ padding: '12px 16px', textAlign: 'right', fontSize: 13, fontWeight: 800, color: T.text }}>
                    {fmtH(kpis.totalTrackedHours)}
                  </td>
                  <td style={{ padding: '12px 16px', textAlign: 'right' }}>
                    {(() => {
                      const totalDays = memberUtilization.reduce((s, m) => s + m.workingDays, 0)
                      const avg = totalDays > 0 ? kpis.totalTrackedHours / totalDays : 0
                      return <span style={{ fontSize: 12, fontWeight: 700, color: avg >= 8 ? T.success : T.warn }}>{avg > 0 ? `${avg.toFixed(1)}h` : '—'}</span>
                    })()}
                  </td>
                  <td style={{ padding: '12px 16px', textAlign: 'right', fontSize: 12, fontWeight: 700, color: '#0EA5E9' }}>
                    {fmtH(kpis.totalLearningHours)}
                  </td>
                  <td style={{ padding: '12px 16px', textAlign: 'right', fontSize: 12, fontWeight: 800, color: '#F59E0B' }}>
                    {fmtH(memberUtilization.reduce((s, m) => s + m.untrackedHours, 0))}
                  </td>
                  <td style={{ padding: '12px 16px', textAlign: 'right', fontSize: 13, fontWeight: 900, color: T.brand }}>
                    {fmtRupee(kpis.totalWastedCost)}
                  </td>
                  <td style={{ padding: '12px 16px', textAlign: 'right' }}>
                    <Pill value={`${kpis.avgEfficiency}% avg`} color={effColor(kpis.avgEfficiency, false)} bg={effBg(kpis.avgEfficiency, false)} />
                  </td>
                </tr>
              </tfoot>
            )}
          </table>
        </div>
      </Section>

      {/* ── Work Breakdown + Daily Trend (2-col) ─────────────────────────── */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1.6fr', gap: 16 }}>

        {/* Work type breakdown */}
        <Section title="Work Type Breakdown" sub="Team-wide hours by activity">
          <div style={{ padding: '18px 22px', display: 'flex', flexDirection: 'column', gap: 14 }}>
            {workTotals.filter(w => w.hours > 0).map(w => {
              const pct = Math.max(2, (w.hours / maxWorkHours) * 100)
              return (
                <div key={w.key}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 5 }}>
                    <span style={{ fontSize: 12, fontWeight: 600, color: T.sub }}>{w.label}</span>
                    <span style={{ fontSize: 12, fontWeight: 700, color: w.color }}>{fmtH(w.hours)}</span>
                  </div>
                  <div style={{ height: 6, background: '#F1F5F9', borderRadius: 99, overflow: 'hidden' }}>
                    <div style={{
                      height: '100%', width: `${pct}%`, borderRadius: 99,
                      background: `linear-gradient(90deg, ${w.color}99, ${w.color})`,
                      transition: 'width 0.5s ease',
                    }} />
                  </div>
                </div>
              )
            })}
          </div>
        </Section>

        {/* Daily trend */}
        {dailyTrend.length > 0 && (
          <Section title="Daily Tracked Hours" sub={`${dailyTrend.length} working days this month`}>
            <div style={{ padding: '18px 22px 14px' }}>
              {(() => {
                const maxH = Math.max(...dailyTrend.map(d => d.hours), 1)
                return (
                  <div style={{ display: 'flex', alignItems: 'flex-end', gap: 3, height: 90, overflowX: 'auto' }}>
                    {dailyTrend.map(d => {
                      const pct  = (d.hours / maxH) * 100
                      const day  = new Date(d.date + 'T12:00:00').getDate()
                      const barColor = pct > 70 ? T.success : pct > 40 ? T.warn : '#CBD5E1'
                      return (
                        <div key={d.date} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4, flex: 1, minWidth: 16 }}>
                          <div
                            title={`${d.date}: ${fmtH(d.hours)}`}
                            style={{
                              width: '100%', borderRadius: '4px 4px 0 0',
                              height: `${Math.max(6, pct)}%`,
                              background: barColor,
                              transition: 'height 0.4s',
                              cursor: 'default',
                            }}
                          />
                          <span style={{ fontSize: 9, color: T.muted, fontWeight: 600 }}>{day}</span>
                        </div>
                      )
                    })}
                  </div>
                )
              })()}
            </div>
          </Section>
        )}
      </div>

      {/* ── Client Hours + Member Breakdown (2-col) ──────────────────────── */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>

        {/* Client Hours */}
        <Section title="Client Hours" sub="Hours and cost by client this month">
          <div style={{ maxHeight: 380, overflowY: 'auto' }}>
            {clientHours.length === 0
              ? <p style={{ textAlign: 'center', color: T.muted, fontSize: 12, padding: '40px 0' }}>No client data</p>
              : clientHours.map((c, i) => {
                const pct = (c.hours / (clientHours[0]?.hours ?? 1)) * 100
                const isInternal = ['GROFAST DIGITAL', 'GROFAST AI', 'KARTHICK BRANDS'].includes(c.name.toUpperCase())
                const accent = isInternal ? T.brand : T.info
                return (
                  <div key={c.name} style={{
                    display: 'flex', alignItems: 'center', gap: 12, padding: '11px 22px',
                    borderBottom: `1px solid ${T.border}`,
                  }}>
                    <span style={{ fontSize: 11, fontWeight: 700, color: T.muted, width: 16, flexShrink: 0, textAlign: 'right' }}>{i + 1}</span>
                    <div style={{
                      width: 30, height: 30, borderRadius: 8, flexShrink: 0,
                      background: `${accent}12`,
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                      fontSize: 10, fontWeight: 800, color: accent,
                    }}>{ini(c.name)}</div>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <p style={{ fontSize: 12, fontWeight: 600, color: T.text, margin: '0 0 5px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {c.name}
                      </p>
                      <div style={{ height: 3, background: '#F1F5F9', borderRadius: 99 }}>
                        <div style={{ height: '100%', width: `${pct}%`, background: accent, borderRadius: 99 }} />
                      </div>
                    </div>
                    <div style={{ textAlign: 'right', flexShrink: 0, minWidth: 60 }}>
                      <p style={{ fontSize: 12, fontWeight: 700, color: T.text, margin: 0 }}>{fmtH(c.hours)}</p>
                      <p style={{ fontSize: 10, color: T.muted, margin: 0 }}>{fmtRupee(c.cost)}</p>
                    </div>
                  </div>
                )
              })}
          </div>
        </Section>

        {/* Member Breakdown */}
        <Section title="Member Breakdown" sub="Click a member to see work detail">
          <div style={{ maxHeight: 380, overflowY: 'auto' }}>
            {memberUtilization.length === 0
              ? <p style={{ textAlign: 'center', color: T.muted, fontSize: 12, padding: '40px 0' }}>No data</p>
              : memberUtilization.map(m => {
                const isExpanded = expandedMember === m.id
                const eColor = effColor(m.efficiency, m.overworked)
                return (
                  <div key={m.id} style={{ borderBottom: `1px solid ${T.border}` }}>
                    <button
                      onClick={() => setExpandedMember(isExpanded ? null : m.id)}
                      style={{
                        width: '100%', textAlign: 'left', display: 'flex', alignItems: 'center', gap: 10,
                        padding: '11px 22px', background: 'none', border: 'none', cursor: 'pointer',
                        transition: 'background 0.15s',
                      }}
                      onMouseEnter={e => (e.currentTarget.style.background = '#F8FAFC')}
                      onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
                    >
                      <div style={{
                        width: 34, height: 34, borderRadius: 10, flexShrink: 0,
                        background: 'linear-gradient(135deg, #FEE2E2, #FECACA)',
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                        fontSize: 11, fontWeight: 800, color: T.brand,
                      }}>{ini(m.name)}</div>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <p style={{ fontSize: 13, fontWeight: 700, color: T.text, margin: 0 }}>{m.name}</p>
                        <p style={{ fontSize: 10, color: T.muted, margin: 0 }}>{m.team ?? ''}</p>
                      </div>
                      <div style={{ textAlign: 'right', flexShrink: 0, marginRight: 6 }}>
                        <p style={{ fontSize: 13, fontWeight: 700, color: T.text, margin: 0 }}>{fmtH(m.trackedHours)}</p>
                        <p style={{ fontSize: 10, fontWeight: 700, color: eColor, margin: 0 }}>{m.efficiency}%</p>
                      </div>
                      <span style={{ fontSize: 10, color: T.muted }}>{isExpanded ? '▲' : '▼'}</span>
                    </button>

                    {isExpanded && (
                      <div style={{ padding: '4px 22px 16px', background: '#FAFBFC' }}>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginBottom: 10 }}>
                          {WORK_CFG.filter(w => m.workBreakdown[w.key] > 0).map(w => {
                            const pct = Math.max(2, (m.workBreakdown[w.key] / m.trackedHours) * 100)
                            return (
                              <div key={w.key} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                                <span style={{ fontSize: 11, color: T.sub, width: 72, flexShrink: 0 }}>{w.label}</span>
                                <div style={{ flex: 1, height: 5, background: '#E2E8F0', borderRadius: 99 }}>
                                  <div style={{ height: '100%', width: `${pct}%`, background: w.color, borderRadius: 99 }} />
                                </div>
                                <span style={{ fontSize: 11, fontWeight: 700, color: w.color, width: 36, textAlign: 'right' }}>
                                  {fmtH(m.workBreakdown[w.key])}
                                </span>
                              </div>
                            )
                          })}
                        </div>
                        <div style={{ display: 'flex', gap: 16 }}>
                          <div>
                            <p style={{ fontSize: 9, color: T.muted, margin: '0 0 2px', textTransform: 'uppercase', fontWeight: 700, letterSpacing: '0.06em' }}>Cost</p>
                            <p style={{ fontSize: 14, fontWeight: 800, color: T.brand, margin: 0 }}>{fmtRupee(m.totalCost)}</p>
                          </div>
                          {m.wastedCost > 0 && (
                            <div>
                              <p style={{ fontSize: 9, color: T.muted, margin: '0 0 2px', textTransform: 'uppercase', fontWeight: 700, letterSpacing: '0.06em' }}>Gap</p>
                              <p style={{ fontSize: 14, fontWeight: 800, color: '#F59E0B', margin: 0 }}>{fmtRupee(m.wastedCost)}</p>
                            </div>
                          )}
                          <div>
                            <p style={{ fontSize: 9, color: T.muted, margin: '0 0 2px', textTransform: 'uppercase', fontWeight: 700, letterSpacing: '0.06em' }}>Salary</p>
                            <p style={{ fontSize: 14, fontWeight: 800, color: T.sub, margin: 0 }}>{fmtRupee(m.monthlySalary)}</p>
                          </div>
                        </div>
                        {m.clients.length > 0 && (
                          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4, marginTop: 10 }}>
                            {m.clients.map(c => (
                              <span key={c} style={{ fontSize: 10, padding: '2px 8px', borderRadius: 5, background: '#E2E8F0', color: T.sub, fontWeight: 600 }}>
                                {c}
                              </span>
                            ))}
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                )
              })}
          </div>
        </Section>
      </div>

      {/* ── Per-Hour Rate Reference ──────────────────────────────────────── */}
      <Section title="Per-Hour Rate Reference" sub="Monthly Salary ÷ 212.5 hrs (25 days × 8.5 hrs)">
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr style={{ background: '#FAFBFC' }}>
                {['Employee', 'ID', 'Team', 'Monthly Salary', 'Per Hour Rate'].map(h => (
                  <th key={h} style={{
                    padding: '11px 18px', textAlign: 'left', fontSize: 10,
                    fontWeight: 700, color: T.muted, textTransform: 'uppercase',
                    letterSpacing: '0.07em', borderBottom: `1px solid ${T.border}`, whiteSpace: 'nowrap',
                  }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {allMembers.map((m) => (
                <tr key={m.employeeId}
                  style={{ borderBottom: `1px solid ${T.border}`, transition: 'background 0.15s' }}
                  onMouseEnter={e => (e.currentTarget.style.background = '#F8FAFC')}
                  onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
                >
                  <td style={{ padding: '12px 18px', fontWeight: 700, color: T.text, fontSize: 13 }}>{m.name.trim()}</td>
                  <td style={{ padding: '12px 18px', color: T.muted, fontWeight: 600, fontSize: 12, fontFamily: 'monospace' }}>{m.employeeId}</td>
                  <td style={{ padding: '12px 18px' }}>
                    <span style={{ fontSize: 11, fontWeight: 600, padding: '3px 9px', borderRadius: 6, background: '#F1F5F9', color: T.sub }}>
                      {m.team ?? '—'}
                    </span>
                  </td>
                  <td style={{ padding: '12px 18px', fontWeight: 700, color: T.text, fontSize: 13 }}>
                    {m.monthlySalary > 0 ? `₹${m.monthlySalary.toLocaleString('en-IN')}` : '—'}
                  </td>
                  <td style={{ padding: '12px 18px' }}>
                    {m.hourlyRate > 0 ? (
                      <span style={{
                        display: 'inline-block',
                        background: '#FEF2F2', color: T.brand,
                        fontWeight: 800, fontSize: 12, padding: '4px 12px',
                        borderRadius: 8,
                      }}>
                        ₹{m.hourlyRate.toFixed(2)}/hr
                      </span>
                    ) : <span style={{ color: T.muted }}>—</span>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Section>

    </div>
  )
}
