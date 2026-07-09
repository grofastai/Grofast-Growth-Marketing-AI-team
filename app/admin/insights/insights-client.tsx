'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Users, TrendingUp } from 'lucide-react'
import type { MemberUtilization, ClientHour, InsightsKPIs, SpendCategory } from './page'

// ── design tokens — editorial report ────────────────────────────────────────────

const INK    = '#1C1917'
const MUTED  = '#8A8378'
const CREAM  = '#FAF6EE'
const PANEL  = '#F3EDE0'
const RULE   = '#E5DFD3'
const RED    = '#DE1A1A'
const SERIF  = 'var(--font-fraunces)'

// ── helpers ───────────────────────────────────────────────────────────────────

function fmtRupee(n: number) { return `₹${Math.round(n).toLocaleString('en-IN')}` }
function fmtH(h: number)     { return `${h.toFixed(1)} Hr` }
function ini(n: string)      { return n.split(' ').map(w => w[0] ?? '').join('').slice(0, 2).toUpperCase() }

const MONTH_NAMES = ['January','February','March','April','May','June','July','August','September','October','November','December']
function monthLabel(m: string) {
  const [y, mo] = m.split('-').map(Number)
  return `${MONTH_NAMES[mo - 1]} ${y}`
}

// ── Team badge colors (mirrors app/admin/team/team-client.tsx palette) ────────
const TEAM_BADGE: Record<string, { bg: string; color: string }> = {
  'media production team':                  { bg: 'rgba(236,72,153,0.12)', color: '#EC4899' },
  'media team':                              { bg: 'rgba(236,72,153,0.12)', color: '#EC4899' },
  'creative studio':                         { bg: 'rgba(245,158,11,0.12)', color: '#F59E0B' },
  'software development & automation':       { bg: 'rgba(99,102,241,0.12)', color: '#6366F1' },
  'ai development & automation':             { bg: 'rgba(99,102,241,0.12)', color: '#6366F1' },
  'performance marketing & operations':      { bg: 'rgba(16,185,129,0.12)', color: '#10B981' },
  'ai development & creative production':    { bg: 'rgba(139,92,246,0.12)', color: '#8B5CF6' },
  'ai development & media':                  { bg: 'rgba(139,92,246,0.12)', color: '#8B5CF6' },
}
function teamBadge(team: string | null) {
  if (!team) return { bg: PANEL, color: MUTED }
  return TEAM_BADGE[team.toLowerCase().trim()] ?? { bg: PANEL, color: '#6B7280' }
}

// ── Column color pairs (Attendance table: metric + its avg share one color) ───
const COL = { login: '#3B82F6', working: '#10B981', learning: '#8B5CF6', brk: '#F97316' }

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

// Known task_type → display config. Anything not listed here (a brand-new
// type like 'scripting') still renders — see typeCfg() fallback below — so
// the Work Type Breakdown never silently swallows a new type into another bucket.
const TYPE_CFG: Record<string, { label: string; emoji: string; color: string }> = {
  shoot:     { label: 'Shooting',  emoji: '📸', color: '#F97316' },
  edit:      { label: 'Editing',   emoji: '🎬', color: '#E53935' },
  other:     { label: 'Tech Work', emoji: '💼', color: '#6366F1' },
  voiceover: { label: 'Voiceover', emoji: '🎙️', color: '#8B5CF6' },
  poster:    { label: 'Posters',   emoji: '🖼️', color: '#10B981' },
  scripting: { label: 'Scripting', emoji: '📝', color: '#EAB308' },
  development: { label: 'Development', emoji: '💻', color: '#4338CA' },
  other_activity: { label: 'Other', emoji: '🗓️', color: '#6B7280' },
  learning:  { label: 'Learning',  emoji: '📚', color: '#0EA5E9' },
  break:     { label: 'Break',     emoji: '☕', color: '#F97316' },
}
const TYPE_ORDER = ['shoot', 'edit', 'other', 'voiceover', 'poster', 'scripting', 'development', 'learning', 'other_activity', 'break']
function typeCfg(key: string) {
  return TYPE_CFG[key] ?? { label: key.charAt(0).toUpperCase() + key.slice(1), emoji: '🔹', color: '#9CA3AF' }
}
function orderedTypeKeys(keys: string[]) {
  return [...TYPE_ORDER.filter(k => keys.includes(k)), ...keys.filter(k => !TYPE_ORDER.includes(k)).sort()]
}

// ── Sub-components ────────────────────────────────────────────────────────────

// The signature element: a masthead stat strip, not a grid of shadow-cards.
// Big serif numerals with small-caps captions, separated by hairlines — reads
// like a printed report's front page, not a SaaS KPI row.
function StatStripItem({ label, value, color, isFirst }: {
  label: string; value: string; color: string; isFirst?: boolean
}) {
  return (
    <div style={{
      flex: '1 1 140px', minWidth: 130, padding: '4px 20px',
      borderLeft: isFirst ? 'none' : `1px solid ${RULE}`,
    }}>
      <p style={{
        fontFamily: SERIF, fontSize: 'clamp(24px, 3.4vw, 34px)', fontWeight: 700, margin: 0,
        color, lineHeight: 1, letterSpacing: '-0.01em',
      }}>
        {value}
      </p>
      <p style={{ fontSize: 10, fontWeight: 700, color: MUTED, textTransform: 'uppercase', letterSpacing: '0.1em', margin: '6px 0 0' }}>
        {label}
      </p>
    </div>
  )
}

function SectionCard({ title, meta, children, action }: {
  title: string; meta?: string; children: React.ReactNode; action?: React.ReactNode
}) {
  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 12, paddingBottom: 10, borderBottom: `2px solid ${RED}`, flexWrap: 'wrap' }}>
        <span style={{ fontFamily: SERIF, fontSize: 17, fontWeight: 600, fontStyle: 'italic', color: INK }}>
          {title}
        </span>
        {meta && <span style={{ fontSize: 11, color: MUTED, fontWeight: 500 }}>{meta}</span>}
        <div style={{ flex: 1 }} />
        {action}
      </div>
      <div style={{ paddingTop: 16 }}>{children}</div>
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
  month, today, kpis, memberUtilization, clientHours, spendByCategory, allMembers,
}: {
  month: string
  today: string
  kpis: InsightsKPIs
  memberUtilization: MemberUtilization[]
  clientHours: ClientHour[]
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

  const isCurrentMonth = month === today.slice(0, 7)

  // Work breakdown totals from member data — driven by whatever task_type
  // keys actually appear this month, so a new type (e.g. scripting) shows up
  // automatically with no code change here.
  const allTypeKeys = Array.from(new Set(memberUtilization.flatMap(m => Object.keys(m.workBreakdown))))
  const workTotals = orderedTypeKeys(allTypeKeys)
    .map(key => ({ key, ...typeCfg(key), hours: memberUtilization.reduce((s, m) => s + (m.workBreakdown[key] ?? 0), 0) }))
    .filter(w => w.hours > 0)
  const maxWorkHours = Math.max(...workTotals.map(w => w.hours), 1)

  // Attendance table footer aggregates — averages, not raw sums, for anything per-person
  const memberCount        = memberUtilization.length
  const totalPresentDays   = memberUtilization.reduce((s, m) => s + m.workingDays, 0)
  const totalLoginHours    = memberUtilization.reduce((s, m) => s + m.loginHours, 0)
  const totalWorkingHoursX = memberUtilization.reduce((s, m) => s + m.workingHoursExclLearning, 0)
  const totalBreakHours    = memberUtilization.reduce((s, m) => s + m.breakHours, 0)
  const avgLoginFooter     = totalPresentDays > 0 ? totalLoginHours / totalPresentDays : 0
  const avgWorkingFooter   = totalPresentDays > 0 ? totalWorkingHoursX / totalPresentDays : 0
  const avgBreakFooter     = totalPresentDays > 0 ? totalBreakHours / totalPresentDays : 0

  // Team Utilization table footer — same "Days In" average treatment
  const totalDaysIn  = memberUtilization.reduce((s, m) => s + m.workingDays, 0)
  const avgDaysIn    = memberCount > 0 ? Math.round(totalDaysIn / memberCount) : 0

  const tableHeadStyle = (h: string): React.CSSProperties => ({
    padding: '10px 14px', fontSize: 10, fontWeight: 800, color: INK,
    textAlign: h === 'Member' || h === 'Team' || h === 'Employee' || h === 'ID' ? 'left' : 'right',
    textTransform: 'uppercase', letterSpacing: '0.08em', whiteSpace: 'nowrap',
  })

  return (
    <div style={{ padding: '24px 28px 60px', display: 'flex', flexDirection: 'column', gap: 32, background: CREAM, minHeight: '100vh' }}>

      {/* ── MASTHEAD ─────────────────────────────────────────────────────── */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 16, flexWrap: 'wrap' }}>
          <div style={{ minWidth: 0 }}>
            <span style={{ fontSize: 10, fontWeight: 800, color: RED, textTransform: 'uppercase', letterSpacing: '0.2em' }}>
              GroFast Digital · Admin Report
            </span>
            <h1 style={{
              fontFamily: SERIF, fontSize: 'clamp(32px,6vw,52px)', fontWeight: 700, color: INK,
              margin: '4px 0 6px', lineHeight: 1,
            }}>
              Team Insights
            </h1>
            <p style={{ fontFamily: SERIF, fontStyle: 'italic', fontSize: 14, color: MUTED, margin: 0 }}>
              A monthly report on how the team spends its time — {monthLabel(month)}
            </p>
          </div>

          {/* Month nav */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexShrink: 0 }}>
            <button onClick={prevMonth} aria-label="Previous month" style={{
              width: 30, height: 30, borderRadius: 6, border: `1.5px solid ${INK}`, background: 'transparent',
              cursor: 'pointer', fontSize: 15, color: INK, display: 'flex', alignItems: 'center', justifyContent: 'center',
            }}>‹</button>
            <button onClick={nextMonth} disabled={isCurrentMonth} aria-label="Next month" style={{
              width: 30, height: 30, borderRadius: 6, border: `1.5px solid ${INK}`, background: 'transparent',
              cursor: isCurrentMonth ? 'not-allowed' : 'pointer', fontSize: 15, color: INK,
              display: 'flex', alignItems: 'center', justifyContent: 'center', opacity: isCurrentMonth ? 0.3 : 1,
            }}>›</button>
            <input type="month" value={month} max={today.slice(0, 7)} onChange={e => setMonth(e.target.value)}
              style={{ padding: '6px 10px', borderRadius: 6, border: `1.5px solid ${INK}`, fontSize: 12, fontWeight: 600, color: INK, background: 'transparent' }}
            />
          </div>
        </div>

        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          {[
            { icon: <Users size={11} />, label: `${memberUtilization.length} Members` },
            { icon: <TrendingUp size={11} />, label: `${kpis.avgEfficiency}% Efficiency` },
          ].map(s => (
            <div key={s.label} style={{ display: 'flex', alignItems: 'center', gap: 5, border: `1px solid ${RULE}`, borderRadius: 20, padding: '4px 10px' }}>
              <span style={{ color: MUTED }}>{s.icon}</span>
              <span style={{ fontSize: 11, fontWeight: 700, color: INK }}>{s.label}</span>
            </div>
          ))}
        </div>

        {/* ── Stat strip — the masthead numbers ─────────────────────────── */}
        <div style={{ display: 'flex', flexWrap: 'wrap', borderTop: `1px solid ${RULE}`, borderBottom: `1px solid ${RULE}`, padding: '16px 0' }}>
          <StatStripItem isFirst label="Tracked Hours"      value={fmtH(kpis.totalTrackedHours)}   color={INK} />
          <StatStripItem label="Salary Spent"                value={fmtRupee(kpis.totalCost)}       color={RED} />
          <StatStripItem label="Productivity Gap"            value={fmtRupee(kpis.totalWastedCost)} color="#EF4444" />
          <StatStripItem label="Avg Efficiency"               value={`${kpis.avgEfficiency}%`}       color={kpis.avgEfficiency >= 80 ? '#16A34A' : '#D97706'} />
          <StatStripItem label="Clients Served"               value={String(kpis.clientsServedCount)} color="#8B5CF6" />
          <StatStripItem label="Productivity Gap Hrs"         value={fmtH(kpis.totalUntrackedHours)} color="#D97706" />
        </div>
      </div>

      {/* ── Spend by Client Category ─────────────────────────────────────── */}
      {spendByCategory.length > 0 && (
        <div style={{ display: 'flex', gap: 24, flexWrap: 'wrap' }}>
          {spendByCategory.map(cat => {
            const totalCostAll = spendByCategory.reduce((s, c) => s + c.cost, 0)
            const pct = totalCostAll > 0 ? Math.round((cat.cost / totalCostAll) * 100) : 0
            return (
              <div key={cat.label} style={{ flex: 1, minWidth: 160, borderLeft: `3px solid ${cat.color}`, paddingLeft: 14 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 8 }}>
                  <span style={{ fontSize: 15 }}>{cat.emoji}</span>
                  <span style={{ fontSize: 10, fontWeight: 800, color: cat.color, textTransform: 'uppercase', letterSpacing: '0.08em' }}>
                    {cat.label}
                  </span>
                  <span style={{ marginLeft: 'auto', fontSize: 10, fontWeight: 700, color: MUTED }}>
                    {pct}%
                  </span>
                </div>
                <p style={{ fontFamily: SERIF, fontSize: 22, fontWeight: 700, margin: '0 0 4px', color: INK }}>
                  {fmtRupee(cat.cost)}
                </p>
                <p style={{ fontSize: 12, fontWeight: 600, color: MUTED, margin: 0 }}>
                  {cat.hours.toFixed(1)} hrs logged
                </p>
              </div>
            )
          })}
        </div>
      )}

      {/* ── Attendance Table ──────────────────────────────────────────────── */}
      <SectionCard title="Attendance" meta="Hover, login & break hours by member">
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 760 }}>
            <thead>
              <tr style={{ borderBottom: `2px solid ${RULE}` }}>
                {['Member', 'Team', 'Present', 'Login Hrs', 'Avg Login', 'Working Hrs', 'Avg Working', 'Learning Hrs', 'Break Hrs', 'Avg Break'].map(h => (
                  <th key={h} style={tableHeadStyle(h)}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {memberUtilization.length === 0 ? (
                <tr><td colSpan={10} style={{ textAlign: 'center', padding: '40px 0', color: MUTED, fontSize: 13 }}>No attendance data for this month</td></tr>
              ) : memberUtilization.map((m, i) => {
                const tb = teamBadge(m.team)
                return (
                <tr key={m.id} style={{ borderBottom: `1px solid ${RULE}`, background: i % 2 === 0 ? 'transparent' : PANEL }}>
                  {/* Member */}
                  <td style={{ padding: '12px 14px' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      <div style={{
                        width: 32, height: 32, borderRadius: 10, flexShrink: 0,
                        background: `linear-gradient(135deg, #DE1A1A22, #DE1A1A33)`,
                        border: '1.5px solid #DE1A1A30',
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                        fontSize: 11, fontWeight: 900, color: RED,
                      }}>{ini(m.name)}</div>
                      <div>
                        <p style={{ fontSize: 12, fontWeight: 700, color: INK, margin: 0 }}>{m.name}</p>
                        <p style={{ fontSize: 10, color: MUTED, margin: 0 }}>{m.employeeId}</p>
                      </div>
                    </div>
                  </td>
                  {/* Team */}
                  <td style={{ padding: '12px 14px' }}>
                    <span style={{ fontSize: 10, fontWeight: 800, padding: '3px 9px', borderRadius: 99, background: tb.bg, color: tb.color, textTransform: 'uppercase', letterSpacing: '0.03em', whiteSpace: 'nowrap' }}>
                      {m.team ?? '—'}
                    </span>
                  </td>
                  {/* Present */}
                  <td style={{ padding: '12px 14px', fontSize: 13, fontWeight: 700, color: INK, textAlign: 'right' }}>
                    {m.workingDays}
                  </td>
                  {/* Login Hrs */}
                  <td style={{ padding: '12px 14px', fontSize: 13, fontWeight: 800, color: COL.login, textAlign: 'right' }}>
                    {fmtH(m.loginHours)}
                  </td>
                  {/* Avg Login */}
                  <td style={{ padding: '12px 14px', fontSize: 12, fontWeight: 600, color: `${COL.login}99`, textAlign: 'right' }}>
                    {m.avgLoginHours > 0 ? fmtH(m.avgLoginHours) : '—'}
                  </td>
                  {/* Working Hrs (excl. learning) */}
                  <td style={{ padding: '12px 14px', fontSize: 13, fontWeight: 800, color: COL.working, textAlign: 'right' }}>
                    {fmtH(m.workingHoursExclLearning)}
                  </td>
                  {/* Avg Working */}
                  <td style={{ padding: '12px 14px', fontSize: 12, fontWeight: 600, color: `${COL.working}99`, textAlign: 'right' }}>
                    {m.avgWorkingHoursExclLearning > 0 ? fmtH(m.avgWorkingHoursExclLearning) : '—'}
                  </td>
                  {/* Learning Hrs */}
                  <td style={{ padding: '12px 14px', fontSize: 12, fontWeight: 700, color: COL.learning, textAlign: 'right' }}>
                    {m.learningHours > 0 ? fmtH(m.learningHours) : '—'}
                  </td>
                  {/* Break Hrs */}
                  <td style={{ padding: '12px 14px', fontSize: 12, fontWeight: 700, color: COL.brk, textAlign: 'right' }}>
                    {m.breakHours > 0 ? fmtH(m.breakHours) : '—'}
                  </td>
                  {/* Avg Break */}
                  <td style={{ padding: '12px 14px', fontSize: 12, fontWeight: 600, color: `${COL.brk}99`, textAlign: 'right' }}>
                    {m.avgBreakHours > 0 ? fmtH(m.avgBreakHours) : '—'}
                  </td>
                </tr>
              )})}
            </tbody>
            {memberUtilization.length > 0 && (
              <tfoot>
                <tr style={{ borderTop: `2px solid ${RED}` }}>
                  <td colSpan={2} style={{ padding: '10px 14px', fontSize: 11, fontWeight: 800, color: INK }}>TOTAL / AVG</td>
                  <td style={{ padding: '10px 14px', textAlign: 'right', fontSize: 12, fontWeight: 700, color: INK }}>
                    {memberUtilization.reduce((s, m) => s + m.workingDays, 0)}
                  </td>
                  <td style={{ padding: '12px 14px', textAlign: 'right', fontSize: 13, fontWeight: 900, color: COL.login }}>
                    {fmtH(totalLoginHours)}
                  </td>
                  <td style={{ padding: '12px 14px', textAlign: 'right', fontSize: 12, fontWeight: 800, color: `${COL.login}99` }}>
                    {fmtH(avgLoginFooter)}
                  </td>
                  <td style={{ padding: '12px 14px', textAlign: 'right', fontSize: 13, fontWeight: 900, color: COL.working }}>
                    {fmtH(totalWorkingHoursX)}
                  </td>
                  <td style={{ padding: '12px 14px', textAlign: 'right', fontSize: 12, fontWeight: 800, color: `${COL.working}99` }}>
                    {fmtH(avgWorkingFooter)}
                  </td>
                  <td style={{ padding: '12px 14px', textAlign: 'right', fontSize: 12, fontWeight: 800, color: COL.learning }}>
                    {fmtH(kpis.totalLearningHours)}
                  </td>
                  <td style={{ padding: '12px 14px', textAlign: 'right', fontSize: 12, fontWeight: 800, color: COL.brk }}>
                    {fmtH(totalBreakHours)}
                  </td>
                  <td style={{ padding: '12px 14px', textAlign: 'right', fontSize: 12, fontWeight: 800, color: `${COL.brk}99` }}>
                    {fmtH(avgBreakFooter)}
                  </td>
                </tr>
              </tfoot>
            )}
          </table>
        </div>
      </SectionCard>

      {/* ── Team Utilization Table ───────────────────────────────────────── */}
      <SectionCard title="Team Utilization" meta="Productivity gap tracker">
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 700 }}>
            <thead>
              <tr style={{ borderBottom: `2px solid ${RULE}` }}>
                {['Member', 'Team', 'Days In', 'Expected', 'Tracked', 'Avg/Day', 'Overtime', 'Gap Hrs', 'Prod. Gap', 'Efficiency'].map(h => (
                  <th key={h} style={tableHeadStyle(h)}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {memberUtilization.length === 0 ? (
                <tr><td colSpan={10} style={{ textAlign: 'center', padding: '40px 0', color: MUTED, fontSize: 13 }}>No attendance data for this month</td></tr>
              ) : memberUtilization.map((m, i) => {
                const eColor = effColor(m.efficiency, m.overworked)
                const eBg    = effBg(m.efficiency, m.overworked)
                const tb     = teamBadge(m.team)
                return (
                  <tr key={m.id} style={{ borderBottom: `1px solid ${RULE}`, background: i % 2 === 0 ? 'transparent' : PANEL }}>
                    {/* Member */}
                    <td style={{ padding: '12px 14px' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                        <div style={{
                          width: 32, height: 32, borderRadius: 10, flexShrink: 0,
                          background: `linear-gradient(135deg, #DE1A1A22, #DE1A1A33)`,
                          border: '1.5px solid #DE1A1A30',
                          display: 'flex', alignItems: 'center', justifyContent: 'center',
                          fontSize: 11, fontWeight: 900, color: RED,
                        }}>{ini(m.name)}</div>
                        <div>
                          <p style={{ fontSize: 12, fontWeight: 700, color: INK, margin: 0 }}>{m.name}</p>
                          <p style={{ fontSize: 10, color: MUTED, margin: 0 }}>{m.employeeId}</p>
                        </div>
                      </div>
                    </td>
                    {/* Team */}
                    <td style={{ padding: '12px 14px' }}>
                      <span style={{ fontSize: 10, fontWeight: 800, padding: '3px 9px', borderRadius: 99, background: tb.bg, color: tb.color, textTransform: 'uppercase', letterSpacing: '0.03em', whiteSpace: 'nowrap' }}>
                        {m.team ?? '—'}
                      </span>
                    </td>
                    {/* Days In */}
                    <td style={{ padding: '12px 14px', fontSize: 13, fontWeight: 700, color: INK, textAlign: 'right' }}>
                      {m.workingDays}
                    </td>
                    {/* Expected */}
                    <td style={{ padding: '12px 14px', fontSize: 12, color: MUTED, textAlign: 'right' }}>
                      {fmtH(m.expectedHours)}
                    </td>
                    {/* Tracked */}
                    <td style={{ padding: '12px 14px', fontSize: 13, fontWeight: 800, color: COL.working, textAlign: 'right' }}>
                      {fmtH(m.trackedHours)}
                    </td>
                    {/* Avg/Day */}
                    {(() => {
                      const avg = m.workingDays > 0 ? m.trackedHours / m.workingDays : 0
                      const avgColor = avg >= 8 ? '#16A34A' : avg >= 6 ? '#D97706' : '#EF4444'
                      return (
                        <td style={{ padding: '12px 14px', textAlign: 'right' }}>
                          <span style={{ fontSize: 12, fontWeight: 800, color: avgColor }}>
                            {avg > 0 ? fmtH(avg) : '—'}
                          </span>
                        </td>
                      )
                    })()}
                    {/* Overtime */}
                    <td style={{ padding: '12px 14px', textAlign: 'right' }}>
                      {m.overtimeHours > 0 ? (
                        <span style={{ fontSize: 12, fontWeight: 700, color: '#6366F1' }}>+{fmtH(m.overtimeHours)}</span>
                      ) : (
                        <span style={{ fontSize: 12, color: '#D1D5DB', fontWeight: 600 }}>—</span>
                      )}
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
                        border: `1px solid ${eColor}30`, textTransform: 'uppercase',
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
                <tr style={{ borderTop: `2px solid ${RED}` }}>
                  <td colSpan={2} style={{ padding: '10px 14px', fontSize: 11, fontWeight: 800, color: INK }}>TOTAL / AVG</td>
                  <td style={{ padding: '10px 14px', textAlign: 'right', fontSize: 12, fontWeight: 700, color: INK }}>
                    {avgDaysIn}
                  </td>
                  <td style={{ padding: '12px 14px', textAlign: 'right', fontSize: 12, fontWeight: 700, color: MUTED }}>
                    {fmtH(memberUtilization.reduce((s, m) => s + m.expectedHours, 0))}
                  </td>
                  <td style={{ padding: '12px 14px', textAlign: 'right', fontSize: 13, fontWeight: 900, color: COL.working }}>
                    {fmtH(kpis.totalTrackedHours)}
                  </td>
                  {/* Avg/Day total */}
                  <td style={{ padding: '12px 14px', textAlign: 'right' }}>
                    {(() => {
                      const avg = totalDaysIn > 0 ? kpis.totalTrackedHours / totalDaysIn : 0
                      const avgColor = avg >= 8 ? '#16A34A' : avg >= 6 ? '#D97706' : '#EF4444'
                      return <span style={{ fontSize: 12, fontWeight: 800, color: avgColor }}>{avg > 0 ? fmtH(avg) : '—'}</span>
                    })()}
                  </td>
                  <td style={{ padding: '12px 14px', textAlign: 'right', fontSize: 12, fontWeight: 700, color: '#6366F1' }}>
                    {fmtH(memberUtilization.reduce((s, m) => s + m.overtimeHours, 0))}
                  </td>
                  <td style={{ padding: '12px 14px', textAlign: 'right', fontSize: 12, fontWeight: 800, color: '#EF4444' }}>
                    {fmtH(memberUtilization.reduce((s, m) => s + m.untrackedHours, 0))}
                  </td>
                  <td style={{ padding: '12px 14px', textAlign: 'right', fontSize: 13, fontWeight: 900, color: '#EF4444' }}>
                    {fmtRupee(kpis.totalWastedCost)}
                  </td>
                  <td style={{ padding: '12px 14px', textAlign: 'right' }}>
                    <span style={{
                      display: 'inline-flex', fontSize: 11, fontWeight: 800, padding: '3px 10px', borderRadius: 99,
                      background: effBg(kpis.avgEfficiency, false), color: effColor(kpis.avgEfficiency, false),
                      border: `1px solid ${effColor(kpis.avgEfficiency, false)}30`, textTransform: 'uppercase',
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
      <SectionCard title="Work Type Breakdown" meta="Hours logged by task type, team-wide">
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          {workTotals.map(w => (
            <div key={w.key} style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
              <span style={{ fontSize: 16, width: 22, flexShrink: 0 }}>{w.emoji}</span>
              <span style={{ fontSize: 12, fontWeight: 700, color: INK, width: 90, flexShrink: 0 }}>{w.label}</span>
              <div style={{ flex: 1, height: 6, background: PANEL, overflow: 'hidden' }}>
                <div style={{
                  height: '100%',
                  width: `${Math.max(1, (w.hours / maxWorkHours) * 100)}%`,
                  background: w.color,
                  transition: 'width 0.4s',
                }} />
              </div>
              <span style={{ fontFamily: SERIF, fontSize: 13, fontWeight: 700, color: w.color, width: 60, textAlign: 'right', flexShrink: 0 }}>
                {fmtH(w.hours)}
              </span>
            </div>
          ))}
        </div>
      </SectionCard>

      {/* ── 2-col row: Client Hours + Member Cards ───────────────────────── */}
      <div className="grid grid-cols-1 md:grid-cols-2" style={{ gap: 32 }}>

        {/* Client Hours */}
        <SectionCard title="Clients Worked" meta="Hours logged, this month">
          <div style={{ maxHeight: 400, overflowY: 'auto' }}>
            {clientHours.length === 0 ? (
              <p style={{ textAlign: 'center', color: MUTED, fontSize: 12, padding: '32px 0' }}>No client data</p>
            ) : clientHours.map((c, i) => {
              const pct = (c.hours / (clientHours[0]?.hours ?? 1)) * 100
              const isInternal = ['GROFAST DIGITAL', 'GROFAST AI', 'KARTHICK BRANDS'].includes(c.name.toUpperCase())
              return (
                <div key={c.name} style={{
                  display: 'flex', alignItems: 'center', gap: 12, padding: '10px 0',
                  borderBottom: `1px solid ${RULE}`,
                }}>
                  <span style={{ fontFamily: SERIF, fontSize: 12, fontWeight: 700, color: MUTED, width: 18, flexShrink: 0 }}>{i + 1}</span>
                  <div style={{
                    width: 28, height: 28, borderRadius: 8, flexShrink: 0,
                    background: isInternal ? 'rgba(222,26,26,0.1)' : 'rgba(99,102,241,0.1)',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    fontSize: 10, fontWeight: 900, color: isInternal ? RED : '#6366F1',
                  }}>{ini(c.name)}</div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <p style={{ fontSize: 11, fontWeight: 700, color: INK, margin: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {c.name}
                    </p>
                    <div style={{ height: 3, background: PANEL, marginTop: 5 }}>
                      <div style={{ height: '100%', width: `${pct}%`, background: isInternal ? RED : '#6366F1' }} />
                    </div>
                  </div>
                  <div style={{ textAlign: 'right', flexShrink: 0 }}>
                    <p style={{ fontSize: 12, fontWeight: 700, color: INK, margin: 0 }}>{fmtH(c.hours)}</p>
                    <p style={{ fontSize: 10, color: MUTED, margin: 0 }}>{fmtRupee(c.cost)}</p>
                  </div>
                </div>
              )
            })}
          </div>
        </SectionCard>

        {/* Member Performance Cards */}
        <SectionCard title="Member Breakdown" meta="Tap to expand">
          <div style={{ maxHeight: 400, overflowY: 'auto' }}>
            {memberUtilization.length === 0 ? (
              <p style={{ textAlign: 'center', color: MUTED, fontSize: 12, padding: '32px 0' }}>No data</p>
            ) : memberUtilization.map(m => {
              const isExpanded = expandedMember === m.id
              const eColor = effColor(m.efficiency, m.overworked)
              return (
                <div key={m.id} style={{ borderBottom: `1px solid ${RULE}` }}>
                  {/* Row */}
                  <button
                    onClick={() => setExpandedMember(isExpanded ? null : m.id)}
                    style={{
                      width: '100%', textAlign: 'left', display: 'flex', alignItems: 'center', gap: 10,
                      padding: '10px 0', background: 'none', border: 'none', cursor: 'pointer',
                    }}
                  >
                    <div style={{
                      width: 32, height: 32, borderRadius: 10, flexShrink: 0,
                      background: 'rgba(222,26,26,0.08)', border: '1.5px solid rgba(222,26,26,0.2)',
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                      fontSize: 11, fontWeight: 900, color: RED,
                    }}>{ini(m.name)}</div>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <p style={{ fontSize: 12, fontWeight: 700, color: INK, margin: 0 }}>{m.name}</p>
                      <p style={{ fontSize: 10, color: MUTED, margin: 0 }}>{m.team ?? ''}</p>
                    </div>
                    <div style={{ textAlign: 'right', flexShrink: 0 }}>
                      <p style={{ fontSize: 12, fontWeight: 800, color: INK, margin: 0 }}>{fmtH(m.trackedHours)}</p>
                      <span style={{ fontSize: 9, fontWeight: 800, color: eColor }}>
                        {m.efficiency}%
                      </span>
                    </div>
                    <span style={{ fontSize: 12, color: '#D1D5DB', marginLeft: 4 }}>{isExpanded ? '▲' : '▼'}</span>
                  </button>

                  {/* Expanded detail */}
                  {isExpanded && (
                    <div style={{ padding: '0 0 14px', display: 'flex', flexDirection: 'column', gap: 8 }}>
                      {/* Work bars */}
                      <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                        {orderedTypeKeys(Object.keys(m.workBreakdown)).filter(k => (m.workBreakdown[k] ?? 0) > 0).map(k => {
                          const w = { key: k, ...typeCfg(k) }
                          return (
                          <div key={w.key} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                            <span style={{ fontSize: 12, width: 18 }}>{w.emoji}</span>
                            <span style={{ fontSize: 10, color: MUTED, width: 72 }}>{w.label}</span>
                            <div style={{ flex: 1, height: 5, background: PANEL }}>
                              <div style={{
                                height: '100%',
                                width: `${Math.max(2, (m.workBreakdown[w.key] / m.trackedHours) * 100)}%`,
                                background: w.color,
                              }} />
                            </div>
                            <span style={{ fontSize: 10, fontWeight: 700, color: w.color, width: 36, textAlign: 'right' }}>
                              {fmtH(m.workBreakdown[w.key])}
                            </span>
                          </div>
                          )
                        })}
                      </div>
                      {/* Clients */}
                      {m.clients.length > 0 && (
                        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
                          {m.clients.map(c => (
                            <span key={c} style={{ fontSize: 9, padding: '2px 7px', borderRadius: 5, background: PANEL, color: INK, fontWeight: 600 }}>
                              {c}
                            </span>
                          ))}
                        </div>
                      )}
                      {/* Cost summary */}
                      <div style={{ display: 'flex', gap: 16, marginTop: 4 }}>
                        <div>
                          <p style={{ fontSize: 9, color: MUTED, margin: 0, textTransform: 'uppercase', fontWeight: 700 }}>Cost</p>
                          <p style={{ fontFamily: SERIF, fontSize: 15, fontWeight: 700, color: RED, margin: 0 }}>{fmtRupee(m.totalCost)}</p>
                        </div>
                        {m.wastedCost > 0 && (
                          <div>
                            <p style={{ fontSize: 9, color: MUTED, margin: 0, textTransform: 'uppercase', fontWeight: 700 }}>Gap</p>
                            <p style={{ fontFamily: SERIF, fontSize: 15, fontWeight: 700, color: '#EF4444', margin: 0 }}>{fmtRupee(m.wastedCost)}</p>
                          </div>
                        )}
                        <div>
                          <p style={{ fontSize: 9, color: MUTED, margin: 0, textTransform: 'uppercase', fontWeight: 700 }}>Salary</p>
                          <p style={{ fontFamily: SERIF, fontSize: 15, fontWeight: 700, color: INK, margin: 0 }}>{fmtRupee(m.monthlySalary)}</p>
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

      {/* ── Per-Hour Rate Reference Table ───────────────────────────────── */}
      <SectionCard title="Employee Per-Hour Rate Reference" meta="Monthly salary ÷ 212.5 hrs (25 days × 8.5 hrs)">
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
            <thead>
              <tr style={{ borderBottom: `2px solid ${RULE}` }}>
                {['Employee', 'ID', 'Team', 'Monthly Salary', 'Per Hour Rate'].map(h => (
                  <th key={h} style={tableHeadStyle(h)}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {allMembers.map((m, i) => {
                const tb = teamBadge(m.team)
                return (
                <tr key={m.employeeId} style={{ background: i % 2 === 0 ? 'transparent' : PANEL, borderBottom: `1px solid ${RULE}` }}>
                  <td style={{ padding: '12px 16px', fontWeight: 700, color: INK }}>{m.name.trim()}</td>
                  <td style={{ padding: '12px 16px', color: MUTED, fontWeight: 700, fontFamily: 'monospace' }}>{m.employeeId}</td>
                  <td style={{ padding: '12px 16px' }}>
                    <span style={{ fontSize: 10, fontWeight: 800, padding: '3px 9px', borderRadius: 99, background: tb.bg, color: tb.color, textTransform: 'uppercase', letterSpacing: '0.03em', whiteSpace: 'nowrap' }}>
                      {m.team ?? '—'}
                    </span>
                  </td>
                  <td style={{ padding: '12px 16px', fontWeight: 700, color: INK }}>
                    {m.monthlySalary > 0 ? `₹${m.monthlySalary.toLocaleString('en-IN')}` : '—'}
                  </td>
                  <td style={{ padding: '12px 16px' }}>
                    {m.hourlyRate > 0 ? (
                      <span style={{
                        color: RED, fontWeight: 800, fontSize: 13, fontFamily: 'monospace',
                      }}>
                        ₹{m.hourlyRate.toFixed(2)}/hr
                      </span>
                    ) : <span style={{ color: MUTED }}>—</span>}
                  </td>
                </tr>
              )})}
            </tbody>
          </table>
        </div>
      </SectionCard>

    </div>
  )
}
