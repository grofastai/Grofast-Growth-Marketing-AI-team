'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Inter } from 'next/font/google'
import { Users, TrendingUp, BarChart3, AlertTriangle } from 'lucide-react'
import { PieChart, Pie, Cell, Tooltip, ResponsiveContainer, BarChart, Bar, XAxis, YAxis, CartesianGrid, ReferenceLine } from 'recharts'
import type { MemberUtilization, ClientHour, InsightsKPIs, SpendCategory, LeaveBreakdownRow } from './page'

// Mirrors the same constant in page.tsx (checkMonthlyLeaveLimit, lib/actions/leaves.ts) —
// duplicated rather than imported so this client component never pulls in page.tsx's
// server-only imports (next/headers via lib/supabase/server.ts) into the browser bundle.
const MONTHLY_LEAVE_CAP = 5

// ── design tokens — matches the shared admin design system (red-gradient hero
// banner, white cards, Jakarta/Bebas type) used by Leaves/Attendance/Goals/Team,
// instead of a one-off theme unique to this page. ─────────────────────────────

const PAGE_BG   = 'linear-gradient(160deg,#F8F9FF 0%,#F5F6FA 100%)'
const HERO_GRAD = 'linear-gradient(135deg, #de1a1a 0%, #991B1B 50%, #7F1D1D 100%)'
// Same red→black gradient as the Leave Requests hero banner (app/member/leaves/leaves-client.tsx) — reused here for table headers instead of inventing a new one.
const TABLE_HEAD_GRAD = 'linear-gradient(135deg, #DE1A1A 0%, #8B1212 55%, #1A0808 100%)'
const CARD      = '#FFFFFF'
const BORDER    = '#E5E7EB'
const INK       = '#111827'
const MUTED     = '#6B7280'
const DIM       = '#9CA3AF'
const RULE      = '#F3F4F6'
const HEAD_BG   = '#F9FAFB'
const RED       = '#de1a1a'

const JAKARTA = 'var(--font-jakarta)'

// Inter for the data tables specifically — the rest of the page keeps the shared
// Jakarta brand type (hero banner, headings), but Inter's tighter, more neutral
// numerals read better in dense rows of figures than Jakarta's rounder letterforms.
const inter = Inter({ subsets: ['latin'], weight: ['400', '500', '600', '700'] })
const TABLE_FONT = inter.style.fontFamily

// Shared cell styles for the grouped-header data tables (Attendance, Team Utilization,
// Employee Per-Hour Rate) — monochrome ink + muted avg, no per-column rainbow hues.
const groupThStyle: React.CSSProperties = {
  color: '#FFFFFF', fontSize: 10, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em',
  textAlign: 'center', whiteSpace: 'nowrap', padding: '9px 13px', borderRight: '1px solid rgba(255,255,255,0.12)',
}
const primaryTdStyle: React.CSSProperties = {
  padding: '11px 16px', fontSize: 13, fontWeight: 600, color: INK, textAlign: 'right', fontVariantNumeric: 'tabular-nums',
}
const avgTdStyle: React.CSSProperties = {
  padding: '11px 16px', fontSize: 12, fontWeight: 500, color: MUTED, textAlign: 'right', fontVariantNumeric: 'tabular-nums',
}
const footTdStyle: React.CSSProperties = {
  padding: '10px 16px', textAlign: 'right', fontSize: 13, fontWeight: 700, color: INK, fontVariantNumeric: 'tabular-nums',
}

// ── helpers ───────────────────────────────────────────────────────────────────

function fmtRupee(n: number) { return `₹${Math.round(n).toLocaleString('en-IN')}` }
function fmtH(h: number)     { return `${h.toFixed(1)} Hr` }
function ini(n: string)      { return n.split(' ').map(w => w[0] ?? '').join('').slice(0, 2).toUpperCase() }

const MONTH_NAMES = ['January','February','March','April','May','June','July','August','September','October','November','December']
function monthLabel(m: string) {
  const [y, mo] = m.split('-').map(Number)
  return `${MONTH_NAMES[mo - 1]} ${y}`
}

// Semantic colors reused from the shared .badge-* classes in globals.css
const SEMANTIC = { success: '#16A34A', warning: '#D97706', danger: '#de1a1a', info: '#2563EB' }

// One accent per Attendance metric — distinct from the semantic set above and
// from TYPE_CFG's work-type colors, so Login/Working/Break read as their own thing.
const ATT_COLORS = { login: '#2563EB', working: '#16A34A', break: '#F97316' }

function effColor(eff: number, overworked: boolean) {
  if (overworked)  return SEMANTIC.info
  if (eff >= 90)   return SEMANTIC.success
  if (eff >= 70)   return SEMANTIC.warning
  return SEMANTIC.danger
}
function effLabel(eff: number, overworked: boolean) {
  if (overworked)  return 'Overworked'
  if (eff >= 90)   return 'Great'
  if (eff >= 70)   return 'Moderate'
  return 'Low'
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
  // Not a work_entries task_type — sourced from the leaves table (approved Permission
  // hours, team-wide) and injected into workTotals below as its own row, kept separate
  // from Break (feedback 2026-07-30: Break should stay pure break time).
  permission: { label: 'Permission', emoji: '⏰', color: '#0D9488' },
  break:     { label: 'Break',     emoji: '☕', color: '#F97316' },
}
const TYPE_ORDER = ['shoot', 'edit', 'other', 'voiceover', 'poster', 'scripting', 'development', 'learning', 'other_activity', 'permission', 'break']
function typeCfg(key: string) {
  return TYPE_CFG[key] ?? { label: key.charAt(0).toUpperCase() + key.slice(1), emoji: '🔹', color: '#9CA3AF' }
}
function orderedTypeKeys(keys: string[]) {
  return [...TYPE_ORDER.filter(k => keys.includes(k)), ...keys.filter(k => !TYPE_ORDER.includes(k)).sort()]
}

// Only the creative/production types carry an entry count in the Work Type
// tables — deliverable counts (shots, edits, voiceovers, posters, scripts)
// are meaningful there; hours alone is what matters for Tech/Development/
// Learning/Other/Break, so those columns skip the count.
const COUNT_TYPE_COLS = new Set(['shoot', 'edit', 'voiceover', 'poster', 'scripting'])

// ── Sub-components ────────────────────────────────────────────────────────────

// KPI stat card — the whole tile is a gradient fill, one distinct gradient
// per metric, with white text on top (matches the hero banner's red-gradient
// treatment). Keyed to the exact accent hex values the callers pass in.
const ROSE = '#E11D48'
const TEAL = '#0D9488'
const STAT_GRADIENTS: Record<string, string> = {
  [SEMANTIC.info]:    'linear-gradient(135deg, #3B82F6, #1D4ED8)', // Tracked Hours — blue
  [RED]:               'linear-gradient(135deg, #EF4444, #B91C1C)', // Salary Spent — red
  [SEMANTIC.warning]: 'linear-gradient(135deg, #F59E0B, #B45309)', // Productivity Gap — amber
  [SEMANTIC.success]: 'linear-gradient(135deg, #22C55E, #15803D)', // Avg Efficiency (good) — green
  [ROSE]:              'linear-gradient(135deg, #F43F5E, #9F1239)', // Avg Efficiency (low) — rose, not amber, so it never matches Productivity Gap
  '#7C3AED':           'linear-gradient(135deg, #8B5CF6, #6D28D9)', // Clients Served — purple
  [TEAL]:              'linear-gradient(135deg, #14B8A6, #0F766E)', // Gap Hours — teal, not orange, so it never matches Productivity Gap either
}
function statGradient(accent: string) {
  return STAT_GRADIENTS[accent] ?? `linear-gradient(135deg, ${accent}, ${accent})`
}

function StatCard({ label, value, accent }: { label: string; value: string; accent: string }) {
  return (
    <div style={{
      background: statGradient(accent), borderRadius: 18,
      boxShadow: `0 6px 20px ${accent}40`, padding: '16px 18px', position: 'relative', overflow: 'hidden',
    }}>
      <div style={{ position: 'absolute', top: -16, right: -16, width: 64, height: 64, borderRadius: '50%', background: 'rgba(255,255,255,0.15)', pointerEvents: 'none' }} />
      <p style={{
        fontFamily: JAKARTA, fontSize: 'clamp(22px,2.6vw,28px)', fontWeight: 900, margin: 0,
        color: '#FFFFFF', lineHeight: 1, letterSpacing: '0.01em', position: 'relative',
      }}>
        {value}
      </p>
      <p style={{ fontSize: 11, fontWeight: 700, color: 'rgba(255,255,255,0.85)', textTransform: 'uppercase', letterSpacing: '0.06em', margin: '6px 0 0', position: 'relative' }}>
        {label}
      </p>
    </div>
  )
}

// Standard pill badge — tinted background + solid text, matches the shared .badge class
function Badge({ children, color, bg }: { children: React.ReactNode; color: string; bg?: string }) {
  return (
    <span style={{
      display: 'inline-flex', alignItems: 'center', gap: 4,
      fontSize: 11, fontWeight: 700, padding: '3px 9px', borderRadius: 99,
      background: bg ?? `${color}1A`, color, whiteSpace: 'nowrap',
    }}>
      {children}
    </span>
  )
}

// White card with a section title + small red accent underline — matches
// .section-title / .section-accent from globals.css, used across the app.
function Card({ title, meta, action, children }: {
  title: string; meta?: string; action?: React.ReactNode; children: React.ReactNode
}) {
  return (
    <div style={{ background: CARD, borderRadius: 16, border: `1px solid ${BORDER}`, boxShadow: '0 1px 3px rgba(0,0,0,0.05), 0 4px 12px rgba(0,0,0,0.04)', padding: '20px 22px 22px' }}>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 12, paddingBottom: 14, marginBottom: 16, borderBottom: `1px solid ${RULE}`, flexWrap: 'wrap' }}>
        <span style={{ position: 'relative', display: 'inline-block', fontSize: 13, fontWeight: 700, color: '#374151', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
          {title}
          <span style={{ position: 'absolute', bottom: -6, left: 0, width: 24, height: 2, borderRadius: 2, background: `linear-gradient(90deg, ${RED}, transparent)` }} />
        </span>
        {meta && <span style={{ fontSize: 11, color: DIM, fontWeight: 500 }}>{meta}</span>}
        <div style={{ flex: 1 }} />
        {action}
      </div>
      {children}
    </div>
  )
}

function Avatar({ name }: { name: string }) {
  return (
    <div style={{
      width: 32, height: 32, borderRadius: '50%', flexShrink: 0,
      background: 'linear-gradient(135deg, rgba(222,26,26,0.15) 0%, rgba(127,29,29,0.15) 100%)',
      border: '1.5px solid rgba(222,26,26,0.2)',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      fontSize: 11, fontWeight: 700, color: RED,
    }}>{ini(name)}</div>
  )
}

// Shared 3D pill badge — colored fill, white bold text, glossy inset
// highlight — the one badge language used for every count/avg badge on this
// page (Work Type count, Attendance avg).
function Badge3D({ text, color }: { text: string; color: string }) {
  return (
    <span style={{
      fontSize: 11, fontWeight: 800, color: '#FFFFFF', background: color,
      borderRadius: 999, padding: '2.5px 8px', textAlign: 'center', lineHeight: 1.4, whiteSpace: 'nowrap',
      boxShadow: `0 1px 3px ${color}66, inset 0 1px 0 rgba(255,255,255,0.35)`,
    }}>{text}</span>
  )
}

// Work-type table cell — hours (colored, bold, all-caps unit) + a 3D count
// badge beside it, e.g. "62.4H" + a pill reading "18".
function StatCell({ hrs, count, color }: { hrs: number; count: number; color: string }) {
  if (!count || hrs <= 0) return <span style={{ fontSize: 14, color: DIM, fontWeight: 600 }}>—</span>
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 7, justifyContent: 'center' }}>
      <span style={{ fontSize: 15, fontWeight: 800, color, fontVariantNumeric: 'tabular-nums', letterSpacing: '-0.01em' }}>{hrs.toFixed(1)}H</span>
      <Badge3D text={String(count)} color={color} />
    </span>
  )
}

// Hours-only cell, no badge — same size/weight as StatCell so a row reads
// consistently whether or not a given work type carries a count.
function HoursOnlyCell({ hrs, color }: { hrs: number; color: string }) {
  if (hrs <= 0) return <span style={{ fontSize: 14, color: DIM, fontWeight: 600 }}>—</span>
  return (
    <span style={{ fontSize: 15, fontWeight: 800, color, fontVariantNumeric: 'tabular-nums', letterSpacing: '-0.01em', whiteSpace: 'nowrap' }}>
      {hrs.toFixed(1)}H
    </span>
  )
}

// Work-type table — shared by the Media / Non-Media cards below. `cols` picks
// which task_type keys this team actually logs (see MEDIA_TYPE_COLS /
// NON_MEDIA_TYPE_COLS), so each table only shows columns relevant to that team.
function WorkTypeTable({ members, cols }: { members: MemberUtilization[]; cols: string[] }) {
  const totals = cols.map(key => members.reduce((s, m) => s + (m.workBreakdown[key] ?? 0), 0))
  return (
    <div style={{ overflowX: 'auto', margin: '0 -22px', padding: '0 22px' }}>
      <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 160 + cols.length * 130, fontFamily: TABLE_FONT }}>
        <thead style={{ background: TABLE_HEAD_GRAD }}>
          <tr>
            <th style={{ ...groupThStyle, textAlign: 'left' }}>Member</th>
            {cols.map(key => {
              const cfg = typeCfg(key)
              return (
                <th key={key} style={groupThStyle}>
                  <span style={{ marginRight: 5 }}>{cfg.emoji}</span>{cfg.label}
                </th>
              )
            })}
          </tr>
        </thead>
        <tbody>
          {members.length === 0 ? (
            <tr><td colSpan={cols.length + 1} style={{ textAlign: 'center', padding: '40px 0', color: MUTED, fontSize: 13 }}>No members on this team logged work this month</td></tr>
          ) : members.map((m, i) => (
            <tr key={m.id} style={{ background: i % 2 === 0 ? CARD : HEAD_BG }}>
              <td style={{ padding: '11px 16px' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <Avatar name={m.name} />
                  <div>
                    <p style={{ fontSize: 13, fontWeight: 600, color: INK, margin: 0 }}>{m.name}</p>
                    <p style={{ fontSize: 10, color: DIM, margin: 0 }}>{m.employeeId}</p>
                  </div>
                </div>
              </td>
              {cols.map(key => (
                <td key={key} style={{ padding: '11px 14px', textAlign: 'center' }}>
                  {COUNT_TYPE_COLS.has(key)
                    ? <StatCell hrs={m.workBreakdown[key] ?? 0} count={m.workBreakdownCount[key] ?? 0} color={typeCfg(key).color} />
                    : <HoursOnlyCell hrs={m.workBreakdown[key] ?? 0} color={typeCfg(key).color} />}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
        {members.length > 0 && (
          <tfoot>
            <tr style={{ borderTop: `2px solid ${RED}` }}>
              <td style={{ padding: '10px 16px', fontSize: 11, fontWeight: 700, color: INK }}>Team Total</td>
              {cols.map((key, idx) => (
                <td key={key} style={{ ...footTdStyle, textAlign: 'center', color: totals[idx] > 0 ? typeCfg(key).color : MUTED }}>
                  {totals[idx] > 0 ? fmtH(totals[idx]) : '—'}
                </td>
              ))}
            </tr>
          </tfoot>
        )}
      </table>
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
  month, today, kpis, memberUtilization, leaveBreakdown, clientHours, prevMonthClientHours, spendByCategory, allMembers,
}: {
  month: string
  today: string
  kpis: InsightsKPIs
  memberUtilization: MemberUtilization[]
  leaveBreakdown: LeaveBreakdownRow[]
  clientHours: ClientHour[]
  prevMonthClientHours: number
  spendByCategory: SpendCategory[]
  allMembers: AllMember[]
}) {
  const router  = useRouter()
  const [expandedMember, setExpandedMember] = useState<string | null>(null)
  const [clientSort, setClientSort] = useState<'hours' | 'cost'>('hours')

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
  // Team-wide approved Permission hours this month, from the leaves table (not
  // work_entries) — added as its own row (via 'permission' key below) so it never
  // gets folded into Break.
  const totalPermissionHours = leaveBreakdown.reduce((s, r) => s + r.permissionHours, 0)
  const workTotals = orderedTypeKeys([...allTypeKeys, 'permission'])
    .map(key => ({
      key, ...typeCfg(key),
      hours: key === 'permission' ? totalPermissionHours : memberUtilization.reduce((s, m) => s + (m.workBreakdown[key] ?? 0), 0),
    }))
    .filter(w => w.hours > 0)
  const maxWorkHours = Math.max(...workTotals.map(w => w.hours), 1)

  // Per-member work-type tables, split by team — each team only sees the task
  // types it actually logs (gated the same way daily-update-form.tsx gates
  // which tabs a member can submit against), plus Learning/Other/Break for everyone.
  const mediaMembers    = memberUtilization.filter(m => m.isMedia)
  const nonMediaMembers = memberUtilization.filter(m => !m.isMedia)
  const MEDIA_TYPE_COLS    = ['shoot', 'edit', 'learning', 'other_activity', 'break']
  const NON_MEDIA_TYPE_COLS = ['other', 'edit', 'voiceover', 'poster', 'scripting', 'development', 'learning', 'other_activity', 'break']

  // Attendance table footer aggregates — averages, not raw sums, for anything per-person
  const totalPresentDays   = memberUtilization.reduce((s, m) => s + m.workingDays, 0)
  const totalLoginHours    = memberUtilization.reduce((s, m) => s + m.loginHours, 0)
  // Attendance's "Working Hrs" now matches Team Utilization's "Worked" exactly —
  // trackedHours (work_entries incl. Learning, plus confirmed collab hours) —
  // instead of workingHoursExclLearning, so the two tables never disagree again.
  const totalWorkingHoursX = memberUtilization.reduce((s, m) => s + m.trackedHours, 0)
  const totalBreakHours    = memberUtilization.reduce((s, m) => s + m.breakHours, 0)
  const avgLoginFooter     = totalPresentDays > 0 ? totalLoginHours / totalPresentDays : 0
  const avgWorkingFooter   = totalPresentDays > 0 ? totalWorkingHoursX / totalPresentDays : 0
  const avgBreakFooter     = totalPresentDays > 0 ? totalBreakHours / totalPresentDays : 0

  return (
    <div style={{ background: PAGE_BG, minHeight: '100vh', padding: 'clamp(16px,4vw,24px) clamp(16px,4vw,28px) 60px', display: 'flex', flexDirection: 'column', gap: 20 }}>

      {/* ── HERO — same red-gradient banner used by Leaves/Attendance/Goals ─ */}
      <div style={{
        borderRadius: 24, background: HERO_GRAD, boxShadow: '0 8px 32px rgba(222,26,26,0.35)',
        position: 'relative', overflow: 'hidden',
      }}>
        <div style={{ position: 'absolute', top: -40, right: -40, width: 200, height: 200, borderRadius: '50%', background: 'rgba(255,255,255,0.06)' }} />
        <div style={{ position: 'absolute', bottom: -30, right: 200, width: 120, height: 120, borderRadius: '50%', background: 'rgba(255,255,255,0.04)' }} />

        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between" style={{ padding: '20px 20px 22px', gap: 16, position: 'relative', zIndex: 1 }}>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 8 }}>
              <div style={{ background: 'rgba(255,255,255,0.2)', borderRadius: 10, padding: '6px 8px', display: 'flex', alignItems: 'center' }}>
                <BarChart3 size={16} style={{ color: '#FFD700' }} />
              </div>
              <span style={{ fontSize: 11, fontWeight: 700, color: 'rgba(255,255,255,0.7)', textTransform: 'uppercase', letterSpacing: '0.15em' }}>Admin Report</span>
            </div>
            <h1 style={{ fontSize: 'clamp(22px,5.5vw,32px)', fontWeight: 900, color: '#FFFFFF', margin: '0 0 4px', fontFamily: JAKARTA, lineHeight: 1.15 }}>
              Team Insights
            </h1>
            <p style={{ fontSize: 13, color: 'rgba(255,255,255,0.65)', margin: 0 }}>{monthLabel(month)}</p>

            <div style={{ display: 'flex', gap: 8, marginTop: 14, flexWrap: 'wrap' }}>
              {[
                { icon: <Users size={12} />, label: `${memberUtilization.length} Members` },
                { icon: <TrendingUp size={12} />, label: `${kpis.avgEfficiency}% Efficiency` },
              ].map(s => (
                <div key={s.label} style={{ display: 'flex', alignItems: 'center', gap: 5, background: 'rgba(255,255,255,0.15)', borderRadius: 20, padding: '4px 10px', flexShrink: 0 }}>
                  <span style={{ color: 'rgba(255,255,255,0.8)' }}>{s.icon}</span>
                  <span style={{ fontSize: 11, fontWeight: 700, color: '#FFFFFF', whiteSpace: 'nowrap' }}>{s.label}</span>
                </div>
              ))}
            </div>
          </div>

          {/* Month nav */}
          <div className="flex items-center gap-2 mt-3 sm:mt-0" style={{ flexShrink: 0, background: 'rgba(255,255,255,0.12)', border: '1px solid rgba(255,255,255,0.2)', borderRadius: 14, padding: '6px 8px' }}>
            <button onClick={prevMonth} aria-label="Previous month" style={{
              width: 28, height: 28, borderRadius: 8, border: 'none', background: 'rgba(255,255,255,0.15)',
              cursor: 'pointer', fontSize: 15, color: '#FFFFFF', display: 'flex', alignItems: 'center', justifyContent: 'center',
            }}>‹</button>
            <button onClick={nextMonth} disabled={isCurrentMonth} aria-label="Next month" style={{
              width: 28, height: 28, borderRadius: 8, border: 'none', background: 'rgba(255,255,255,0.15)',
              cursor: isCurrentMonth ? 'not-allowed' : 'pointer', fontSize: 15, color: '#FFFFFF',
              display: 'flex', alignItems: 'center', justifyContent: 'center', opacity: isCurrentMonth ? 0.4 : 1,
            }}>›</button>
            <input type="month" value={month} max={today.slice(0, 7)} onChange={e => setMonth(e.target.value)}
              style={{ padding: '6px 10px', borderRadius: 8, border: '1px solid rgba(255,255,255,0.25)', fontSize: 12, fontWeight: 600, color: '#FFFFFF', background: 'rgba(255,255,255,0.1)', colorScheme: 'dark' }}
            />
          </div>
        </div>
      </div>

      {/* ── Stat cards ────────────────────────────────────────────────────── */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6" style={{ gap: 12 }}>
        <StatCard label="Tracked Hours"     value={fmtH(kpis.totalTrackedHours)}   accent={SEMANTIC.info} />
        <StatCard label="Salary Spent"       value={fmtRupee(kpis.totalCost)}       accent={RED} />
        <StatCard label="Productivity Gap"   value={fmtRupee(kpis.totalWastedCost)} accent={SEMANTIC.warning} />
        <StatCard label="Avg Efficiency"     value={`${kpis.avgEfficiency}%`}       accent={kpis.avgEfficiency >= 80 ? SEMANTIC.success : ROSE} />
        <StatCard label="Clients Served"     value={String(kpis.clientsServedCount)} accent="#7C3AED" />
        <StatCard label="Gap Hours"          value={fmtH(kpis.totalUntrackedHours)} accent={TEAL} />
      </div>

      {/* ── Charts row: Spend donut + Efficiency ranking ─────────────────── */}
      <div className="grid grid-cols-1 md:grid-cols-2" style={{ gap: 20 }}>

        {/* Spend by Client Category — donut chart */}
        {spendByCategory.length > 0 && (() => {
          const totalCostAll = spendByCategory.reduce((s, c) => s + c.cost, 0)
          return (
            <Card title="Spend by Client Category">
              <div className="flex flex-col sm:flex-row" style={{ gap: 20, alignItems: 'center' }}>
                <div style={{ position: 'relative', width: 168, height: 168, flexShrink: 0 }}>
                  <ResponsiveContainer width="100%" height="100%">
                    <PieChart>
                      <Pie data={spendByCategory} dataKey="cost" nameKey="label" cx="50%" cy="50%" innerRadius={52} outerRadius={80} strokeWidth={2} stroke={CARD}>
                        {spendByCategory.map((c, i) => <Cell key={i} fill={c.color} />)}
                      </Pie>
                      <Tooltip formatter={(v) => fmtRupee(Number(v))} />
                    </PieChart>
                  </ResponsiveContainer>
                  <div style={{ position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', pointerEvents: 'none' }}>
                    <span style={{ fontFamily: JAKARTA, fontSize: 22, fontWeight: 900, color: INK, lineHeight: 1 }}>{fmtRupee(totalCostAll)}</span>
                    <span style={{ fontSize: 10, color: MUTED, fontWeight: 600, marginTop: 3 }}>Total Spend</span>
                  </div>
                </div>
                <div style={{ flex: 1, minWidth: 0, width: '100%', display: 'flex', flexDirection: 'column', gap: 10 }}>
                  {spendByCategory.map(cat => {
                    const pct = totalCostAll > 0 ? Math.round((cat.cost / totalCostAll) * 100) : 0
                    return (
                      <div key={cat.label} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                        <span style={{ width: 9, height: 9, borderRadius: '50%', background: cat.color, flexShrink: 0 }} />
                        <span style={{ fontSize: 12, fontWeight: 700, color: INK, flex: 1 }}>{cat.emoji} {cat.label}</span>
                        <span style={{ fontSize: 12, fontWeight: 800, color: cat.color }}>{fmtRupee(cat.cost)}</span>
                        <span style={{ fontSize: 11, fontWeight: 600, color: DIM, width: 32, textAlign: 'right' }}>{pct}%</span>
                      </div>
                    )
                  })}
                </div>
              </div>
            </Card>
          )
        })()}

        {/* Efficiency ranking — horizontal bar chart, replaces a dense table */}
        <Card title="Efficiency Ranking">
          {memberUtilization.length === 0 ? (
            <p style={{ textAlign: 'center', color: MUTED, fontSize: 12, padding: '32px 0' }}>No data</p>
          ) : (() => {
            const chartData = [...memberUtilization]
              .sort((a, b) => b.efficiency - a.efficiency)
              .map(m => ({ name: m.name.split(' ')[0], efficiency: m.efficiency, color: effColor(m.efficiency, m.overworked), full: m.name }))
            const maxEff = Math.max(100, ...chartData.map(d => d.efficiency)) + 10
            return (
              <div style={{ width: '100%', height: Math.max(200, chartData.length * 38) }}>
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={chartData} layout="vertical" margin={{ top: 0, right: 20, left: 0, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" horizontal={false} stroke={RULE} />
                    <XAxis type="number" domain={[0, maxEff]} tickFormatter={(v) => `${v}%`} tick={{ fontSize: 10, fill: DIM }} axisLine={false} tickLine={false} />
                    <YAxis type="category" dataKey="name" width={72} tick={{ fontSize: 12, fill: INK, fontWeight: 600 }} axisLine={false} tickLine={false} />
                    <ReferenceLine x={100} stroke={DIM} strokeDasharray="3 3" />
                    <Tooltip formatter={(v) => `${v}%`} labelFormatter={(_l, p) => p?.[0]?.payload?.full ?? ''} />
                    <Bar dataKey="efficiency" radius={[0, 6, 6, 0]} barSize={14}>
                      {chartData.map((d, i) => <Cell key={i} fill={d.color} />)}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </div>
            )
          })()}
        </Card>
      </div>

      {/* ── Attendance — Member / Present / Login Hrs+Avg / Working Hrs+Avg /
          Break Hrs+Avg as flat separate columns (no merged pill cells).
          Learning lives in the Work Type tables below, so it's dropped here
          to avoid showing it twice. ── */}
      <Card title="Attendance">
        <div style={{ overflowX: 'auto', margin: '0 -22px', padding: '0 22px' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 780, fontFamily: TABLE_FONT }}>
            <thead style={{ background: TABLE_HEAD_GRAD }}>
              <tr>
                <th style={{ ...groupThStyle, textAlign: 'left' }}>Member</th>
                <th style={groupThStyle}>Present</th>
                <th style={groupThStyle}>Login Hrs</th>
                <th style={groupThStyle}>Login Avg</th>
                <th style={groupThStyle}>Working Hrs</th>
                <th style={groupThStyle}>Working Avg</th>
                <th style={groupThStyle}>Break Hrs</th>
                <th style={{ ...groupThStyle, borderRight: 'none' }}>Break Avg</th>
              </tr>
            </thead>
            <tbody>
              {memberUtilization.length === 0 ? (
                <tr><td colSpan={8} style={{ textAlign: 'center', padding: '40px 0', color: MUTED, fontSize: 13 }}>No attendance data for this month</td></tr>
              ) : memberUtilization.map((m, i) => (
                <tr key={m.id} style={{ background: i % 2 === 0 ? CARD : HEAD_BG }}>
                  <td style={{ padding: '11px 16px' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      <Avatar name={m.name} />
                      <div>
                        <p style={{ fontSize: 13, fontWeight: 600, color: INK, margin: 0 }}>{m.name}</p>
                        <p style={{ fontSize: 10, color: DIM, margin: 0 }}>{m.employeeId}</p>
                      </div>
                    </div>
                  </td>
                  <td style={primaryTdStyle}>{m.workingDays}</td>
                  <td style={{ ...primaryTdStyle, color: ATT_COLORS.login }}>{fmtH(m.loginHours)}</td>
                  <td style={avgTdStyle}>{m.avgLoginHours > 0 ? fmtH(m.avgLoginHours) : '—'}</td>
                  <td style={{ ...primaryTdStyle, color: ATT_COLORS.working }}>{fmtH(m.trackedHours)}</td>
                  <td style={avgTdStyle}>{m.workingDays > 0 ? fmtH(m.trackedHours / m.workingDays) : '—'}</td>
                  <td style={{ ...primaryTdStyle, color: ATT_COLORS.break }}>{fmtH(m.breakHours)}</td>
                  <td style={avgTdStyle}>{m.avgBreakHours > 0 ? fmtH(m.avgBreakHours) : '—'}</td>
                </tr>
              ))}
            </tbody>
            {memberUtilization.length > 0 && (
              <tfoot>
                <tr style={{ borderTop: `2px solid ${RED}` }}>
                  <td style={{ padding: '10px 16px', fontSize: 11, fontWeight: 700, color: INK }}>Total / Avg</td>
                  <td style={footTdStyle}>{memberUtilization.reduce((s, m) => s + m.workingDays, 0)}</td>
                  <td style={{ ...footTdStyle, color: ATT_COLORS.login }}>{fmtH(totalLoginHours)}</td>
                  <td style={{ ...footTdStyle, color: MUTED }}>{fmtH(avgLoginFooter)}</td>
                  <td style={{ ...footTdStyle, color: ATT_COLORS.working }}>{fmtH(totalWorkingHoursX)}</td>
                  <td style={{ ...footTdStyle, color: MUTED }}>{fmtH(avgWorkingFooter)}</td>
                  <td style={{ ...footTdStyle, color: ATT_COLORS.break }}>{fmtH(totalBreakHours)}</td>
                  <td style={{ ...footTdStyle, color: MUTED }}>{fmtH(avgBreakFooter)}</td>
                </tr>
              </tfoot>
            )}
          </table>
        </div>
      </Card>

      {/* ── Team Utilization — Days In / Expected / Overtime / Gap / Prod. Gap / Efficiency
          Same red→black gradient header + semi-bold as Attendance; red/green here stay
          because they're genuine status signals (overworked, gap, efficiency), not decoration. ── */}
      <Card title="Team Utilization">
        <div style={{ overflowX: 'auto', margin: '0 -22px', padding: '0 22px' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 780, fontFamily: TABLE_FONT }}>
            <thead style={{ background: TABLE_HEAD_GRAD }}>
              <tr>
                {['Member', 'Days In', 'Expected', 'Worked', 'Avg/Day', 'Overtime', 'Gap Hrs', 'Prod. Gap', 'Efficiency'].map(h => (
                  <th key={h} style={h === 'Member' ? { ...groupThStyle, textAlign: 'left', borderRight: 'none' } : { ...groupThStyle, borderRight: h === 'Efficiency' ? 'none' : groupThStyle.borderRight }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {memberUtilization.length === 0 ? (
                <tr><td colSpan={9} style={{ textAlign: 'center', padding: '40px 0', color: MUTED, fontSize: 13 }}>No attendance data for this month</td></tr>
              ) : memberUtilization.map((m, i) => {
                const eColor = effColor(m.efficiency, m.overworked)
                return (
                  <tr key={m.id} style={{ background: i % 2 === 0 ? CARD : HEAD_BG }}>
                    <td style={{ padding: '11px 16px' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                        <Avatar name={m.name} />
                        <div>
                          <p style={{ fontSize: 12, fontWeight: 600, color: INK, margin: 0 }}>{m.name}</p>
                          <p style={{ fontSize: 10, color: DIM, margin: 0 }}>{m.employeeId}</p>
                        </div>
                      </div>
                    </td>
                    <td style={primaryTdStyle}>{m.workingDays}</td>
                    <td style={avgTdStyle}>{fmtH(m.expectedHours)}</td>
                    <td style={primaryTdStyle}>{fmtH(m.trackedHours)}</td>
                    {(() => {
                      const avg = m.workingDays > 0 ? m.trackedHours / m.workingDays : 0
                      const avgColor = avg >= 8 ? SEMANTIC.success : avg >= 6 ? SEMANTIC.warning : SEMANTIC.danger
                      return (
                        <td style={{ padding: '11px 16px', textAlign: 'right' }}>
                          <span style={{ fontSize: 12, fontWeight: 600, color: avgColor, fontVariantNumeric: 'tabular-nums' }}>
                            {avg > 0 ? fmtH(avg) : '—'}
                          </span>
                        </td>
                      )
                    })()}
                    <td style={{ padding: '11px 16px', textAlign: 'right' }}>
                      {m.overtimeHours > 0 ? (
                        <span style={{ fontSize: 12, fontWeight: 600, color: SEMANTIC.info, fontVariantNumeric: 'tabular-nums' }}>+{fmtH(m.overtimeHours)}</span>
                      ) : (
                        <span style={{ fontSize: 12, color: '#D1D5DB', fontWeight: 500 }}>—</span>
                      )}
                    </td>
                    <td style={{ padding: '11px 16px', textAlign: 'right' }}>
                      {m.untrackedHours > 0 ? (
                        <span style={{ fontSize: 12, fontWeight: 600, color: SEMANTIC.danger, fontVariantNumeric: 'tabular-nums' }}>{fmtH(m.untrackedHours)}</span>
                      ) : (
                        <span style={{ fontSize: 12, color: SEMANTIC.success, fontWeight: 600 }}>—</span>
                      )}
                    </td>
                    <td style={{ padding: '11px 16px', textAlign: 'right' }}>
                      {m.wastedCost > 0 ? (
                        <span style={{ fontSize: 12, fontWeight: 700, color: SEMANTIC.danger, fontVariantNumeric: 'tabular-nums' }}>{fmtRupee(m.wastedCost)}</span>
                      ) : m.overtimeValue > 0 ? (
                        <span style={{ fontSize: 12, fontWeight: 700, color: SEMANTIC.success, fontVariantNumeric: 'tabular-nums' }}>+{fmtRupee(m.overtimeValue)}</span>
                      ) : (
                        <span style={{ fontSize: 12, color: SEMANTIC.success, fontWeight: 600 }}>₹0</span>
                      )}
                    </td>
                    <td style={{ padding: '11px 16px', textAlign: 'right' }}>
                      <Badge color={eColor}>{m.efficiency}% · {effLabel(m.efficiency, m.overworked)}</Badge>
                    </td>
                  </tr>
                )
              })}
            </tbody>
            {memberUtilization.length > 0 && (() => {
              const totalDaysIn = memberUtilization.reduce((s, m) => s + m.workingDays, 0)
              const avgDaysIn   = memberUtilization.length > 0 ? Math.round(totalDaysIn / memberUtilization.length) : 0
              const avgPerDay   = totalDaysIn > 0 ? kpis.totalTrackedHours / totalDaysIn : 0
              const avgPerDayColor = avgPerDay >= 8 ? SEMANTIC.success : avgPerDay >= 6 ? SEMANTIC.warning : SEMANTIC.danger
              return (
                <tfoot>
                  <tr style={{ borderTop: `2px solid ${RED}` }}>
                    <td style={{ padding: '10px 16px', fontSize: 11, fontWeight: 700, color: INK }}>Total / Avg</td>
                    <td style={footTdStyle}>{avgDaysIn}</td>
                    <td style={{ ...footTdStyle, color: MUTED }}>{fmtH(memberUtilization.reduce((s, m) => s + m.expectedHours, 0))}</td>
                    <td style={footTdStyle}>{fmtH(kpis.totalTrackedHours)}</td>
                    <td style={{ padding: '10px 16px', textAlign: 'right' }}>
                      <span style={{ fontSize: 12, fontWeight: 700, color: avgPerDayColor, fontVariantNumeric: 'tabular-nums' }}>{avgPerDay > 0 ? fmtH(avgPerDay) : '—'}</span>
                    </td>
                    <td style={{ padding: '10px 16px', textAlign: 'right', fontSize: 12, fontWeight: 600, color: SEMANTIC.info, fontVariantNumeric: 'tabular-nums' }}>
                      {fmtH(memberUtilization.reduce((s, m) => s + m.overtimeHours, 0))}
                    </td>
                    <td style={{ padding: '10px 16px', textAlign: 'right', fontSize: 12, fontWeight: 700, color: SEMANTIC.danger, fontVariantNumeric: 'tabular-nums' }}>
                      {fmtH(memberUtilization.reduce((s, m) => s + m.untrackedHours, 0))}
                    </td>
                    <td style={{ padding: '10px 16px', textAlign: 'right', fontSize: 13, fontWeight: 700, color: SEMANTIC.danger, fontVariantNumeric: 'tabular-nums' }}>
                      {fmtRupee(kpis.totalWastedCost)}
                    </td>
                    <td style={{ padding: '10px 16px', textAlign: 'right' }}>
                      <Badge color={effColor(kpis.avgEfficiency, false)}>{kpis.avgEfficiency}% avg</Badge>
                    </td>
                  </tr>
                </tfoot>
              )
            })()}
          </table>
        </div>
      </Card>

      {/* ── Work Type Breakdown ──────────────────────────────────────────── */}
      <Card title="Work Type Breakdown">
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          {workTotals.map(w => (
            <div key={w.key} style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
              <span style={{ fontSize: 16, width: 22, flexShrink: 0 }}>{w.emoji}</span>
              <span style={{ fontSize: 12, fontWeight: 700, color: INK, width: 90, flexShrink: 0 }}>{w.label}</span>
              <div style={{ flex: 1, height: 6, background: '#F3F4F6', overflow: 'hidden', borderRadius: 3 }}>
                <div style={{
                  height: '100%',
                  width: `${Math.max(1, (w.hours / maxWorkHours) * 100)}%`,
                  background: w.color,
                  transition: 'width 0.4s',
                  borderRadius: 3,
                }} />
              </div>
              <span style={{ fontSize: 13, fontWeight: 700, color: w.color, width: 60, textAlign: 'right', flexShrink: 0 }}>
                {fmtH(w.hours)}
              </span>
            </div>
          ))}
        </div>
      </Card>

      {/* ── Work Type Breakdown, per member, split by team — each team only
          shows the task types it actually logs (gated same as daily-update-form). ── */}
      <Card title="Media Team Works">
        <WorkTypeTable members={mediaMembers} cols={MEDIA_TYPE_COLS} />
      </Card>

      <Card title="Non Media Works">
        <WorkTypeTable members={nonMediaMembers} cols={NON_MEDIA_TYPE_COLS} />
      </Card>

      {/* ── Client Hours, then Member Breakdown stacked below it ──────────── */}
      <div className="grid grid-cols-1" style={{ gap: 20 }}>

        {/* Client Hours — bespoke premium card: 25/75 donut + ranked list */}
        <div style={{ background: CARD, borderRadius: 18, padding: 24, boxShadow: '0 1px 3px rgba(0,0,0,0.05), 0 4px 12px rgba(0,0,0,0.04)', border: `1px solid ${BORDER}` }}>
          <style>{`.cw-scroll::-webkit-scrollbar{width:4px}.cw-scroll::-webkit-scrollbar-thumb{background:#E2E8F0;border-radius:999px}.cw-row{transition:background 0.2s,transform 0.2s}.cw-row:hover{background:#F8FAFC;transform:scale(1.01)}.cw-bar-fill{animation:cwGrow 0.7s ease forwards}@keyframes cwGrow{from{width:0}to{width:var(--w)}}`}</style>

          <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between" style={{ gap: 8, paddingBottom: 16, marginBottom: 20, borderBottom: '1px solid #F1F5F9' }}>
            <div>
              <h3 style={{ fontSize: 'clamp(20px,4.5vw,26px)', fontWeight: 700, color: '#0F172A', margin: 0, letterSpacing: '-0.01em' }}>Clients Worked</h3>
              <p style={{ fontSize: 'clamp(13px,2.8vw,15px)', fontWeight: 500, color: '#64748B', margin: '4px 0 0' }}>Hours logged this month</p>
            </div>
            <span style={{ fontSize: 13, fontWeight: 600, color: '#64748B', flexShrink: 0 }}>{monthLabel(month)}</span>
          </div>

          {clientHours.length === 0 ? (
            <p style={{ textAlign: 'center', color: MUTED, fontSize: 12, padding: '32px 0' }}>No client data</p>
          ) : (() => {
            const sorted = [...clientHours].sort((a, b) => {
              if (clientSort === 'cost') return b.cost - a.cost
              return b.hours - a.hours
            })
            const chartData = sorted.map((c, i) => ({ name: c.name, hours: c.hours, cost: c.cost, color: i < 3 ? '#EF4444' : '#4F46E5' }))
            const totalHours = chartData.reduce((s, c) => s + c.hours, 0)
            const totalCost  = chartData.reduce((s, c) => s + c.cost, 0)
            const deltaPct = prevMonthClientHours > 0 ? ((totalHours - prevMonthClientHours) / prevMonthClientHours) * 100 : null
            const avgHours = chartData.length > 0 ? totalHours / chartData.length : 0
            const topByHours = clientHours[0]?.name ?? '—'
            // The metric shown per row (value, %, bar length, donut sizing) follows
            // the active sort — Cost sort shows cost data, not hours re-labeled.
            const isCostSort = clientSort === 'cost'
            const metricKey  = isCostSort ? 'cost' : 'hours'
            const metricTotal = isCostSort ? totalCost : totalHours
            return (
              <>
                {/* Sort control */}
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: 6, marginBottom: 16 }}>
                  <span style={{ fontSize: 12, fontWeight: 600, color: '#94A3B8', marginRight: 2 }}>Sort by</span>
                  {(['hours', 'cost'] as const).map(key => (
                    <button
                      key={key}
                      onClick={() => setClientSort(key)}
                      style={{
                        fontSize: 12, fontWeight: 700, padding: '5px 12px', borderRadius: 999,
                        border: `1px solid ${clientSort === key ? '#4F46E5' : '#E2E8F0'}`,
                        background: clientSort === key ? 'rgba(79,70,229,0.08)' : 'transparent',
                        color: clientSort === key ? '#4F46E5' : '#64748B',
                        cursor: 'pointer',
                      }}
                    >
                      {key === 'hours' ? 'Hours' : 'Cost'}
                    </button>
                  ))}
                </div>

                <div className="flex flex-col lg:flex-row" style={{ gap: 28 }}>
                  {/* Donut — 25% */}
                  <div style={{ flex: '0 0 auto', display: 'flex', flexDirection: 'column', alignItems: 'center', width: 'clamp(180px,55vw,220px)' }}>
                    <div style={{ position: 'relative', width: 'clamp(180px,55vw,220px)', height: 'clamp(180px,55vw,220px)' }}>
                      <ResponsiveContainer width="100%" height="100%">
                        <PieChart>
                          <Pie data={chartData} dataKey={metricKey} nameKey="name" cx="50%" cy="50%" innerRadius={70} outerRadius={106} strokeWidth={2} stroke={CARD}>
                            {chartData.map((d, i) => <Cell key={i} fill={d.color} />)}
                          </Pie>
                          <Tooltip formatter={(v) => isCostSort ? fmtRupee(Number(v)) : fmtH(Number(v))} labelFormatter={(_l, p) => p?.[0]?.payload?.name ?? ''} />
                        </PieChart>
                      </ResponsiveContainer>
                      {/* Same 2-line layout for both modes (big number + one sub-label) — the
                          Hours variant previously ran a bigger font plus an extra "Hours" line,
                          which overflowed the donut's center circle (feedback 2026-07-30). */}
                      <div style={{ position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', pointerEvents: 'none', padding: '0 12px', textAlign: 'center' }}>
                        <span style={{ fontFamily: JAKARTA, fontSize: 32, fontWeight: 800, color: '#0F172A', lineHeight: 1 }}>
                          {isCostSort ? fmtRupee(totalCost) : `${totalHours.toFixed(1)}h`}
                        </span>
                        <span style={{ fontSize: 14, color: '#94A3B8', marginTop: 6 }}>{isCostSort ? 'Total Spend' : 'Total Logged'}</span>
                      </div>
                    </div>
                    {deltaPct !== null && (
                      <div style={{ textAlign: 'center', marginTop: 14 }}>
                        <span style={{ fontSize: 15, fontWeight: 700, color: deltaPct >= 0 ? '#16A34A' : '#DC2626' }}>
                          {deltaPct >= 0 ? '+' : ''}{deltaPct.toFixed(0)}%
                        </span>
                        <p style={{ fontSize: 12, color: '#94A3B8', margin: '2px 0 0' }}>Compared to last month</p>
                      </div>
                    )}
                  </div>

                  {/* Ranked list — 75% */}
                  <div className="cw-scroll" style={{ flex: 1, minWidth: 0, maxHeight: 340, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 12 }}>
                    {chartData.map((c, i) => {
                      const metricValue = isCostSort ? c.cost : c.hours
                      const pct = metricTotal > 0 ? Math.round((metricValue / metricTotal) * 100) : 0
                      return (
                        <div key={c.name} className="cw-row" style={{ borderRadius: 10, padding: '8px 10px' }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                            <div style={{
                              width: 32, height: 32, borderRadius: '50%', flexShrink: 0,
                              background: `${c.color}1A`, border: `1.5px solid ${c.color}40`,
                              display: 'flex', alignItems: 'center', justifyContent: 'center',
                              fontSize: 11, fontWeight: 800, color: c.color,
                            }}>{ini(c.name)}</div>
                            <span style={{ fontSize: 18, fontWeight: 700, color: '#0F172A', flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                              {c.name}
                            </span>
                            <span style={{ fontSize: 16, fontWeight: 700, color: '#0F172A', flexShrink: 0 }}>{isCostSort ? fmtRupee(c.cost) : fmtH(c.hours)}</span>
                            <span style={{ fontSize: 14, fontWeight: 600, color: '#94A3B8', width: 34, textAlign: 'right', flexShrink: 0 }}>{pct}%</span>
                          </div>
                          <div style={{ height: 6, borderRadius: 999, background: '#EEF2F7', marginTop: 8, marginLeft: 42 }}>
                            <div className="cw-bar-fill" style={{ height: '100%', borderRadius: 999, background: c.color, width: `${pct}%`, ['--w' as string]: `${pct}%` } as React.CSSProperties} />
                          </div>
                        </div>
                      )
                    })}
                  </div>
                </div>

                {/* Bottom summary */}
                <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap', marginTop: 20, paddingTop: 16, borderTop: '1px solid #F1F5F9' }}>
                  <span style={{ fontSize: 13, color: '#64748B' }}>Total Clients <strong style={{ color: '#0F172A', fontWeight: 700 }}>{chartData.length}</strong></span>
                  <span style={{ color: '#CBD5E1' }}>•</span>
                  <span style={{ fontSize: 13, color: '#64748B' }}>Average Hours <strong style={{ color: '#0F172A', fontWeight: 700 }}>{fmtH(avgHours)}</strong></span>
                  <span style={{ color: '#CBD5E1' }}>•</span>
                  <span style={{ fontSize: 13, color: '#64748B' }}>Top Client <strong style={{ color: '#0F172A', fontWeight: 700 }}>{topByHours}</strong></span>
                </div>
              </>
            )
          })()}
        </div>

        {/* Member Performance Cards */}
        <Card title="Member Breakdown">
          {/* No internal scroll — only one member expands at a time (expandedMember
              is a single id, not a set), so the list never grows tall enough to need
              its own scrollbar, and a nested scrollbar was overlapping the right-aligned
              hour values in the expanded Work Type breakdown anyway. */}
          <div>
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
                    <Avatar name={m.name} />
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <p style={{ fontSize: 12, fontWeight: 700, color: INK, margin: 0 }}>{m.name}</p>
                      <p style={{ fontSize: 10, color: DIM, margin: 0 }}>{m.employeeId}</p>
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
                    <div style={{ padding: '0 0 14px', display: 'flex', flexDirection: 'column', gap: 10 }}>
                      {/* Days / expected / overtime / gap — the numbers that used to live in a separate table */}
                      <div className="grid grid-cols-2 sm:grid-cols-4" style={{ gap: 8, padding: '10px 12px', background: '#F9FAFB', borderRadius: 10 }}>
                        <div>
                          <p style={{ fontSize: 9, color: DIM, margin: 0, textTransform: 'uppercase', fontWeight: 700 }}>Days In</p>
                          <p style={{ fontSize: 13, fontWeight: 800, color: INK, margin: '2px 0 0' }}>{m.workingDays}</p>
                        </div>
                        <div>
                          <p style={{ fontSize: 9, color: DIM, margin: 0, textTransform: 'uppercase', fontWeight: 700 }}>Expected</p>
                          <p style={{ fontSize: 13, fontWeight: 800, color: MUTED, margin: '2px 0 0' }}>{fmtH(m.expectedHours)}</p>
                        </div>
                        <div>
                          <p style={{ fontSize: 9, color: DIM, margin: 0, textTransform: 'uppercase', fontWeight: 700 }}>Overtime</p>
                          <p style={{ fontSize: 13, fontWeight: 800, color: m.overtimeHours > 0 ? SEMANTIC.info : DIM, margin: '2px 0 0' }}>{m.overtimeHours > 0 ? `+${fmtH(m.overtimeHours)}` : '—'}</p>
                        </div>
                        <div>
                          <p style={{ fontSize: 9, color: DIM, margin: 0, textTransform: 'uppercase', fontWeight: 700 }}>Gap Hrs</p>
                          <p style={{ fontSize: 13, fontWeight: 800, color: m.untrackedHours > 0 ? SEMANTIC.danger : SEMANTIC.success, margin: '2px 0 0' }}>{m.untrackedHours > 0 ? fmtH(m.untrackedHours) : '—'}</p>
                        </div>
                      </div>
                      {/* Work bars */}
                      <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                        {orderedTypeKeys(Object.keys(m.workBreakdown)).filter(k => (m.workBreakdown[k] ?? 0) > 0).map(k => {
                          const w = { key: k, ...typeCfg(k) }
                          return (
                          <div key={w.key} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                            <span style={{ fontSize: 12, width: 18 }}>{w.emoji}</span>
                            <span style={{ fontSize: 10, color: MUTED, width: 72 }}>{w.label}</span>
                            <div style={{ flex: 1, height: 5, background: '#F3F4F6', borderRadius: 2 }}>
                              <div style={{
                                height: '100%',
                                width: `${Math.max(2, (m.workBreakdown[w.key] / m.trackedHours) * 100)}%`,
                                background: w.color, borderRadius: 2,
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
                            <span key={c} style={{ fontSize: 9, padding: '2px 7px', borderRadius: 5, background: '#F3F4F6', color: INK, fontWeight: 600 }}>
                              {c}
                            </span>
                          ))}
                        </div>
                      )}
                      {/* Cost summary */}
                      <div style={{ display: 'flex', gap: 16, marginTop: 4 }}>
                        <div>
                          <p style={{ fontSize: 9, color: DIM, margin: 0, textTransform: 'uppercase', fontWeight: 700 }}>Cost</p>
                          <p style={{ fontFamily: JAKARTA, fontSize: 15, fontWeight: 900, color: RED, margin: 0 }}>{fmtRupee(m.totalCost)}</p>
                        </div>
                        {m.wastedCost > 0 && (
                          <div>
                            <p style={{ fontSize: 9, color: DIM, margin: 0, textTransform: 'uppercase', fontWeight: 700 }}>Gap</p>
                            <p style={{ fontFamily: JAKARTA, fontSize: 15, fontWeight: 900, color: SEMANTIC.danger, margin: 0 }}>{fmtRupee(m.wastedCost)}</p>
                          </div>
                        )}
                        {m.overtimeValue > 0 && (
                          <div>
                            <p style={{ fontSize: 9, color: DIM, margin: 0, textTransform: 'uppercase', fontWeight: 700 }}>Overtime Value</p>
                            <p style={{ fontFamily: JAKARTA, fontSize: 15, fontWeight: 900, color: SEMANTIC.success, margin: 0 }}>+{fmtRupee(m.overtimeValue)}</p>
                          </div>
                        )}
                        <div>
                          <p style={{ fontSize: 9, color: DIM, margin: 0, textTransform: 'uppercase', fontWeight: 700 }}>Salary</p>
                          <p style={{ fontFamily: JAKARTA, fontSize: 15, fontWeight: 900, color: INK, margin: 0 }}>{fmtRupee(m.monthlySalary)}</p>
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        </Card>
      </div>

      {/* ── Leave Summary — bold header table, riskiest balance first ──
          Header uses the shared brand gradient (matches the hero banner);
          each row keeps an avatar + a mini usage bar under Days Used so the
          cap is still readable at a glance without leaving the table shape. ── */}
      {leaveBreakdown.length > 0 && (() => {
        const cap = MONTHLY_LEAVE_CAP
        const overCapCount = leaveBreakdown.filter(r => r.balance < 0).length
        // Riskiest (most over cap) first.
        const sorted = [...leaveBreakdown].sort((a, b) => a.balance - b.balance)

        return (
        <Card
          title="Leave Summary"
          meta={`Monthly cap: ${cap} days`}
          action={overCapCount > 0 ? (
            <Badge color={RED} bg="rgba(222,26,26,0.1)">
              <AlertTriangle size={11} /> {overCapCount} over cap
            </Badge>
          ) : undefined}
        >
          <div style={{ overflowX: 'auto', borderRadius: 12, border: `1px solid ${BORDER}` }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13.5, fontFamily: TABLE_FONT }}>
              <thead>
                <tr style={{ background: HERO_GRAD }}>
                  {['Member', 'Full Day', 'Half Day', 'Permission', 'Days Used', 'Balance'].map(h => (
                    <th key={h} style={{
                      textAlign: h === 'Member' ? 'left' : 'center', padding: '12px 14px', fontSize: 10, fontWeight: 800, color: '#FFFFFF',
                      textTransform: 'uppercase', letterSpacing: '0.06em', whiteSpace: 'nowrap',
                    }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {sorted.map((r, i) => {
                  const overCap = r.balance < 0
                  const usedPct = Math.min((r.daysUsed / cap) * 100, 100)
                  const barColor = overCap ? RED : usedPct >= 80 ? SEMANTIC.warning : SEMANTIC.success
                  const isLast = i === sorted.length - 1
                  return (
                    <tr key={r.id} style={{ background: i % 2 === 0 ? CARD : HEAD_BG }}>
                      <td style={{ padding: '11px 14px', borderBottom: isLast ? 'none' : `1px solid ${RULE}` }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 9 }}>
                          <Avatar name={r.name} />
                          <span style={{ fontWeight: 800, color: INK, whiteSpace: 'nowrap' }}>{r.name}</span>
                        </div>
                      </td>
                      <td style={{ padding: '11px 14px', textAlign: 'center', fontWeight: 700, color: r.fullDays > 0 ? INK : DIM, borderBottom: isLast ? 'none' : `1px solid ${RULE}`, fontVariantNumeric: 'tabular-nums' }}>
                        {r.fullDays > 0 ? r.fullDays : '—'}
                      </td>
                      <td style={{ padding: '11px 14px', textAlign: 'center', fontWeight: 700, color: r.halfDays > 0 ? INK : DIM, borderBottom: isLast ? 'none' : `1px solid ${RULE}`, fontVariantNumeric: 'tabular-nums' }}>
                        {r.halfDays > 0 ? r.halfDays : '—'}
                      </td>
                      <td style={{ padding: '11px 14px', textAlign: 'center', fontWeight: 700, color: r.permissionHours > 0 ? INK : DIM, borderBottom: isLast ? 'none' : `1px solid ${RULE}`, fontVariantNumeric: 'tabular-nums' }}>
                        {r.permissionHours > 0 ? `${r.permissionHours}h` : '—'}
                      </td>
                      <td style={{ padding: '11px 14px', borderBottom: isLast ? 'none' : `1px solid ${RULE}` }}>
                        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 5 }}>
                          <span style={{ fontWeight: 800, color: INK, fontVariantNumeric: 'tabular-nums' }}>{r.daysUsed}<span style={{ color: DIM, fontWeight: 600 }}>/{cap}</span></span>
                          <span style={{ width: 48, height: 5, borderRadius: 999, background: RULE, overflow: 'hidden', display: 'block' }}>
                            <span style={{ width: `${usedPct}%`, height: '100%', borderRadius: 999, background: barColor, display: 'block' }} />
                          </span>
                        </div>
                      </td>
                      <td style={{ padding: '11px 14px', textAlign: 'center', borderBottom: isLast ? 'none' : `1px solid ${RULE}` }}>
                        <span style={{ display: 'inline-block', padding: '2px 10px', borderRadius: 999, fontWeight: 800, fontVariantNumeric: 'tabular-nums', background: overCap ? 'rgba(222,26,26,0.12)' : 'rgba(22,163,74,0.1)', color: overCap ? RED : '#16A34A' }}>
                          {overCap ? r.balance : `+${r.balance}`}
                        </span>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </Card>
        )
      })()}

      {/* ── Per-Hour Rate Reference Table ───────────────────────────────── */}
      <Card title="Employee Per-Hour Rate Reference">
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13, fontFamily: TABLE_FONT }}>
            <thead style={{ background: TABLE_HEAD_GRAD }}>
              <tr>
                {['Employee', 'ID', 'Monthly Salary', 'Per Hour Rate'].map(h => (
                  <th key={h} style={h === 'Employee' || h === 'ID' ? { ...groupThStyle, textAlign: 'left', borderRight: h === 'ID' ? groupThStyle.borderRight : 'none' } : { ...groupThStyle, borderRight: h === 'Per Hour Rate' ? 'none' : groupThStyle.borderRight }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {allMembers.map((m, i) => (
                <tr key={m.employeeId} style={{ background: i % 2 === 0 ? CARD : HEAD_BG }}>
                  <td style={{ padding: '12px 16px', fontWeight: 600, color: INK }}>{m.name.trim()}</td>
                  <td style={{ padding: '12px 16px', color: MUTED, fontWeight: 600, fontFamily: 'monospace' }}>{m.employeeId}</td>
                  <td style={{ padding: '12px 16px', fontWeight: 600, color: INK }}>
                    {m.monthlySalary > 0 ? `₹${m.monthlySalary.toLocaleString('en-IN')}` : '—'}
                  </td>
                  <td style={{ padding: '12px 16px' }}>
                    {m.hourlyRate > 0 ? (
                      <span style={{
                        color: RED, fontWeight: 700, fontSize: 13, fontFamily: 'monospace',
                      }}>
                        ₹{m.hourlyRate.toFixed(2)}/hr
                      </span>
                    ) : <span style={{ color: MUTED }}>—</span>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>

    </div>
  )
}
