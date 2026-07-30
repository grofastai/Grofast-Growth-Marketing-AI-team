'use client'

import { useState, useMemo, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import {
  Search, X, Sparkles, Building2, Users, TrendingUp, Plus, Pencil, Trash2, Check,
  MapPin, Phone, Mail, CalendarRange, Layers, Tag, User,
} from 'lucide-react'
import type { ClientRow, ServiceOption } from './page'
import type { DeliverableResult } from '@/lib/clients-deliverables'
import { fmtRupee, fmtDate } from '@/lib/clients-deliverables'
import { todayIST } from '@/lib/utils/ist-date'
import {
  addClient, updateClientDetails, updateClientStatus, deleteClient,
  addServiceOption, renameServiceOption, deleteServiceOption, setClientServices,
} from '@/lib/actions/clients'

const PACKAGE_OPTIONS = [
  'YEARLY', 'HALF YEARLY', 'QUARTERLY', 'MONTHLY',
  '15 DAYS', '10 DAYS', '7 DAYS', 'FREE TRIAL',
  '4 MONTHS', '5 MONTHS', '7 MONTHS', '8 MONTHS', '9 MONTHS', '10 MONTHS', '11 MONTHS',
]

const MONTH_ABBR = ['JAN', 'FEB', 'MAR', 'APR', 'MAY', 'JUN', 'JUL', 'AUG', 'SEP', 'OCT', 'NOV', 'DEC']

function monthStrToInput(s: string): string {
  const m = s.trim().toUpperCase().match(/^([A-Z]{3})[A-Z]*\s+(\d{4})$/)
  if (!m) return ''
  const idx = MONTH_ABBR.indexOf(m[1])
  return idx === -1 ? '' : `${m[2]}-${String(idx + 1).padStart(2, '0')}`
}
function inputToMonthStr(v: string): string {
  if (!v) return ''
  const [y, m] = v.split('-')
  const idx = parseInt(m, 10) - 1
  return (idx < 0 || idx > 11) ? '' : `${MONTH_ABBR[idx]} ${y}`
}
function parsePeriod(period: string): { from: string; to: string; recurring: boolean } {
  const p = period.trim()
  if (!p) return { from: '', to: '', recurring: false }
  if (/^(MONTHLY|RECURRING)$/i.test(p)) return { from: '', to: '', recurring: true }
  const parts = p.split(/\s*-\s*/)
  if (parts.length === 2) return { from: monthStrToInput(parts[0]), to: monthStrToInput(parts[1]), recurring: false }
  return { from: monthStrToInput(parts[0]), to: '', recurring: false }
}
function buildPeriodString(from: string, to: string, recurring: boolean): string {
  if (recurring) return 'MONTHLY'
  const f = inputToMonthStr(from)
  const t = inputToMonthStr(to)
  if (f && t && f !== t) return `${f} - ${t}`
  return f
}

// ── Work type display config ──────────────────────────────────────────────────

const INTERNAL_BRAND_ORDER = ['GROFAST DIGITAL', 'KARTHICK BRANDS', 'GROFAST AI']

function sortInternalBrands(list: ClientRow[]) {
  return [...list].sort((a, b) => {
    const ai = INTERNAL_BRAND_ORDER.indexOf(a.name.toUpperCase())
    const bi = INTERNAL_BRAND_ORDER.indexOf(b.name.toUpperCase())
    return (ai === -1 ? 999 : ai) - (bi === -1 ? 999 : bi)
  })
}

const WORK_TYPE_CFG: Record<string, { emoji: string; color: string; bg: string }> = {
  reel:         { emoji: '🎬', color: '#E53935', bg: 'rgba(229,57,53,0.08)'   },
  short:        { emoji: '📱', color: '#F97316', bg: 'rgba(249,115,22,0.08)'  },
  'long form':  { emoji: '🎞️', color: '#3B82F6', bg: 'rgba(59,130,246,0.08)'  },
  story:        { emoji: '📖', color: '#A855F7', bg: 'rgba(168,85,247,0.08)'  },
  ad:           { emoji: '📊', color: '#F59E0B', bg: 'rgba(245,158,11,0.08)'  },
  poster:       { emoji: '🖼️', color: '#10B981', bg: 'rgba(16,185,129,0.08)'  },
  'voice over': { emoji: '🎙️', color: '#8B5CF6', bg: 'rgba(139,92,246,0.08)'  },
  design:       { emoji: '🎨', color: '#EC4899', bg: 'rgba(236,72,153,0.08)'  },
  video:        { emoji: '🎥', color: '#16A34A', bg: 'rgba(22,163,74,0.08)'   },
}

function getTypeCfg(t: string) {
  return WORK_TYPE_CFG[t.toLowerCase()] ?? { emoji: '💼', color: '#6B7280', bg: 'rgba(107,114,128,0.08)' }
}

function ini(name: string) {
  return name.split(' ').map(n => n[0] ?? '').join('').slice(0, 2).toUpperCase() || '??'
}

// ── Left panel — client card ──────────────────────────────────────────────────

function ClientCard({ c, isSelected, onClick }: { c: ClientRow; isSelected: boolean; onClick: () => void }) {
  return (
    <button onClick={onClick} style={{
      display: 'block', width: '100%', textAlign: 'left', cursor: 'pointer',
      background: isSelected ? 'rgba(222,26,26,0.03)' : '#FFFFFF',
      border: '1px solid', borderColor: isSelected ? 'rgba(222,26,26,0.2)' : '#F0F1F5',
      borderLeft: isSelected ? '3px solid #DE1A1A' : '3px solid transparent',
      borderRadius: 12, padding: '12px 14px', transition: 'all 0.15s',
      boxShadow: isSelected ? '0 2px 12px rgba(222,26,26,0.07)' : '0 1px 3px rgba(0,0,0,0.04)',
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
        <div style={{
          width: 38, height: 38, borderRadius: 11, flexShrink: 0,
          background: isSelected ? '#DE1A1A' : 'rgba(222,26,26,0.08)',
          color: isSelected ? '#FFF' : '#DE1A1A',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          fontSize: 12, fontWeight: 900, fontFamily: 'var(--font-jakarta)',
        }}>
          {ini(c.name)}
        </div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <p style={{
            fontSize: 13, fontWeight: 800, color: isSelected ? '#DE1A1A' : '#111827',
            margin: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
            fontFamily: 'var(--font-jakarta)',
          }}>
            {c.name}
          </p>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 2, flexWrap: 'wrap' }}>
            {c.industry && <span style={{ fontSize: 10, color: "#37474F" }}>{c.industry}</span>}
            {c.package_name && (
              <span style={{
                fontSize: 9, fontWeight: 700, padding: '1px 6px', borderRadius: 4,
                background: 'rgba(99,102,241,0.08)', color: '#6366F1',
              }}>{c.package_name}</span>
            )}
          </div>
        </div>
        <div title={c.status === 'active' ? 'Active' : 'Past'} style={{
          width: 9, height: 9, borderRadius: '50%', flexShrink: 0,
          background: c.status === 'active' ? '#0F9D64' : '#7F1D2B',
          boxShadow: `0 0 0 2px ${c.status === 'active' ? 'rgba(15,157,100,0.15)' : 'rgba(127,29,43,0.15)'}`,
        }} />
      </div>
    </button>
  )
}

// ── Stat chip ─────────────────────────────────────────────────────────────────

function StatChip({ label, emoji, hours, count, color, isCost }: {
  label: string; emoji: string; hours: string; count?: number | string; color: string; isCost?: boolean
}) {
  const hasHours = hours && hours !== '0.0h' && hours !== '₹0'
  return (
    <div style={{
      background: '#fff', borderRadius: 16,
      border: `1.5px solid ${color}22`,
      borderTop: `3px solid ${color}`,
      padding: '14px 16px 16px', flex: 1, minWidth: 120,
      boxShadow: `0 4px 16px ${color}12, 0 1px 4px rgba(0,0,0,0.05)`,
      display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8,
      textAlign: 'center',
    }}>
      {/* Line 1 — emoji + colored label */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
        <span style={{ fontSize: 15, lineHeight: 1 }}>{emoji}</span>
        <span style={{
          fontSize: 10, fontWeight: 800, color,
          textTransform: 'uppercase', letterSpacing: '0.08em',
        }}>{label}</span>
      </div>

      {/* Line 2 — value + 3D count badge */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8 }}>
        <p style={{
          fontSize: 22, fontWeight: 900, margin: 0, lineHeight: 1,
          fontFamily: 'var(--font-jakarta)',
          color: isCost ? color : '#111827',
        }}>
          {hasHours ? hours : (count != null ? String(count) : hours)}
        </p>
        {/* 3D badge — only when we have both a real value and a count */}
        {count != null && hasHours && (
          <div style={{
            width: 26, height: 26, borderRadius: '50%', flexShrink: 0,
            background: `linear-gradient(145deg, ${color}EE 0%, ${color} 100%)`,
            boxShadow: `0 4px 10px ${color}55, 0 1px 3px rgba(0,0,0,0.18), inset 0 1px 0 rgba(255,255,255,0.3)`,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontSize: 10, fontWeight: 900, color: '#fff',
          }}>
            {count}
          </div>
        )}
      </div>
    </div>
  )
}

// ── Section wrapper ────────────────────────────────────────────────────────────

function Section({ title, emoji, count, totalCost, children }: {
  title: string; emoji: string; count?: number; totalCost?: number; children: React.ReactNode
}) {
  return (
    <div style={{
      background: '#FFFFFF', borderRadius: 16, border: '1px solid #EBEDF2',
      overflow: 'hidden', boxShadow: '0 2px 8px rgba(0,0,0,0.04)',
    }}>
      <div style={{
        display: 'flex', alignItems: 'center', gap: 10,
        padding: '14px 18px', borderBottom: '1px solid #F3F4F6',
      }}>
        <span style={{ fontSize: 16 }}>{emoji}</span>
        <span style={{ fontSize: 14, fontWeight: 800, color: '#111827', flex: 1, fontFamily: 'var(--font-jakarta)' }}>
          {title}
        </span>
        {count != null && (
          <span style={{ fontSize: 11, fontWeight: 700, padding: '2px 8px', borderRadius: 99, background: '#F3F4F6', color: "#37474F" }}>
            {count}
          </span>
        )}
        {totalCost != null && totalCost > 0 && (
          <span style={{ fontSize: 14, fontWeight: 900, color: '#DE1A1A', fontFamily: 'var(--font-jakarta)' }}>
            {fmtRupee(totalCost)}
          </span>
        )}
      </div>
      {children}
    </div>
  )
}

// ── TH helper ─────────────────────────────────────────────────────────────────

function TH({ children }: { children: string }) {
  return (
    <th style={{ padding: '8px 14px', fontSize: 10, fontWeight: 700, color: "#37474F", textAlign: 'left', borderBottom: '1px solid #F3F4F6', textTransform: 'uppercase', letterSpacing: '0.06em' }}>
      {children}
    </th>
  )
}

// Shared colgroup — 5 cols normally, 6 cols when showClient=true (aggregate view)
function TableCols({ showClient }: { showClient?: boolean }) {
  // Date / Client (aggregate only) / Member / Title / Hours / Cost
  return (
    <colgroup>
      <col style={{ width: '12%' }} />
      {showClient && <col style={{ width: '14%' }} />}
      <col style={{ width: showClient ? '12%' : '14%' }} />
      <col />
      <col style={{ width: '8%' }} />
      <col style={{ width: '10%' }} />
    </colgroup>
  )
}

// ── Main component ─────────────────────────────────────────────────────────────

export default function ClientsUnifiedClient({
  activeClients, pastClients, serviceOptions,
  selectedClientName, selectedClientRow,
  deliverables,
  initialSearch = '',
  mode, period, today,
  dateFrom, dateTo,
}: {
  activeClients: ClientRow[]
  pastClients:   ClientRow[]
  serviceOptions: ServiceOption[]
  selectedClientName: string | null
  selectedClientRow: ClientRow | null
  deliverables: DeliverableResult | null
  initialSearch?: string
  mode: 'month' | 'all' | 'custom'
  period: string
  today: string
  dateFrom: string
  dateTo: string
}) {
  const router = useRouter()
  const [search, setSearch] = useState(initialSearch)
  const [clientModal, setClientModal] = useState<'add' | 'edit' | null>(null)
  const [isSaving, startSaving] = useTransition()

  const internalClients = useMemo(() => sortInternalBrands(activeClients.filter(c => c.is_internal)), [activeClients])
  const regularActive   = useMemo(() => activeClients.filter(c => !c.is_internal), [activeClients])

  function filterList(list: ClientRow[]) {
    const q = search.toLowerCase()
    if (!q) return list
    return list.filter(c =>
      c.name.toLowerCase().includes(q) ||
      (c.industry ?? '').toLowerCase().includes(q) ||
      (c.location ?? '').toLowerCase().includes(q)
    )
  }

  const filteredInternal = useMemo(() => filterList(internalClients), [internalClients, search]) // eslint-disable-line react-hooks/exhaustive-deps
  const filteredActive   = useMemo(() => filterList(regularActive),   [regularActive,   search]) // eslint-disable-line react-hooks/exhaustive-deps
  const filteredPast     = useMemo(() => filterList(pastClients),     [pastClients,     search]) // eslint-disable-line react-hooks/exhaustive-deps

  function thisMonthStr() { return todayIST().slice(0, 7) }
  function prevMonthStr() {
    const [y, m] = todayIST().split('-').map(Number)
    const py = m === 1 ? y - 1 : y
    const pm = m === 1 ? 12 : m - 1
    return `${py}-${String(pm).padStart(2, '0')}`
  }

  function selectClient(name: string) {
    router.push(`/admin/clients?client=${encodeURIComponent(name)}&mode=month&period=${thisMonthStr()}`)
  }

  function setPeriod(newPeriod: string) {
    if (!selectedClientName) return
    router.push(`/admin/clients?client=${encodeURIComponent(selectedClientName)}&mode=month&period=${newPeriod}`)
  }

  function setQuick(q: 'this' | 'last' | 'all' | 'custom') {
    if (!selectedClientName) return
    if (q === 'all')    router.push(`/admin/clients?client=${encodeURIComponent(selectedClientName)}&mode=all`)
    if (q === 'this')   router.push(`/admin/clients?client=${encodeURIComponent(selectedClientName)}&mode=month&period=${thisMonthStr()}`)
    if (q === 'last')   router.push(`/admin/clients?client=${encodeURIComponent(selectedClientName)}&mode=month&period=${prevMonthStr()}`)
    if (q === 'custom') router.push(`/admin/clients?client=${encodeURIComponent(selectedClientName)}&mode=custom&from=${dateFrom}&to=${dateTo}`)
  }

  function setCustomRange(newFrom: string, newTo: string) {
    if (!selectedClientName) return
    router.push(`/admin/clients?client=${encodeURIComponent(selectedClientName)}&mode=custom&from=${newFrom}&to=${newTo}`)
  }

  const activeQuick: 'this' | 'last' | 'all' | 'custom' | null =
    mode === 'all' ? 'all'
    : mode === 'custom' ? 'custom'
    : period === thisMonthStr() ? 'this'
    : period === prevMonthStr() ? 'last'
    : null

  const hasData = !!deliverables && (
    deliverables.totalVideos > 0 ||
    deliverables.totalShootSessions > 0 ||
    deliverables.otherWork.length > 0
  )

  // Show a Client column in all tables when viewing an aggregate virtual client
  const showClient = selectedClientRow?.industry?.startsWith('__virtual') ?? false

  return (
    <div className="md:h-screen md:overflow-hidden" style={{ display: 'flex', flexDirection: 'column', background: '#F8F9FB' }}>
      {/* ── HERO HEADER ─────────────────────────────────────────────────── */}
      <div style={{ flexShrink: 0, margin: '16px 16px 0', borderRadius: 20, overflow: 'hidden', background: 'linear-gradient(135deg, #de1a1a 0%, #991B1B 50%, #7F1D1D 100%)', boxShadow: '0 8px 32px rgba(222,26,26,0.35)', position: 'relative' }}>
        {/* Decorative circles */}
        <div style={{ position: 'absolute', top: -40, right: -40, width: 180, height: 180, borderRadius: '50%', background: 'rgba(255,255,255,0.06)', pointerEvents: 'none' }} />
        <div style={{ position: 'absolute', bottom: -20, right: 180, width: 100, height: 100, borderRadius: '50%', background: 'rgba(255,255,255,0.04)', pointerEvents: 'none' }} />
        {/* Pixar-style client illustration — box matches the file's true aspect ratio (1774x887) and is
            vertically centered. The ratio and object-fit:contain must stay in sync with the file: any
            mismatch makes the image scale past the box and lose an edge (a 1774/1024 box cropped the
            right-hand chart card clean off). */}
        <div style={{ position: 'absolute', right: 20, top: '50%', transform: 'translateY(-50%)', width: 'clamp(140px,36vw,360px)', aspectRatio: '1774 / 887', pointerEvents: 'none', zIndex: 0, borderRadius: 14, overflow: 'hidden' }}>
          <div style={{ position: 'absolute', left: 0, top: 0, bottom: 0, width: '30%', background: 'linear-gradient(to right, #8B1A1A 0%, transparent 100%)', zIndex: 2 }} />
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/brand/client-hero.png" alt="" style={{ width: '100%', height: '100%', objectFit: 'contain', objectPosition: 'center', display: 'block', opacity: 0.92 }} />
        </div>
        <div style={{ padding: 'clamp(24px,6vw,40px) clamp(18px,5vw,32px)', display: 'flex', alignItems: 'center', gap: 16, position: 'relative', zIndex: 1 }}>
          {/* Capped to 60% so it can never run under the illustration, which occupies the right 50% of the hero */}
          <div style={{ maxWidth: '60%', minWidth: 0 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 10 }}>
              <div style={{ background: 'rgba(255,255,255,0.2)', borderRadius: 10, padding: '5px 7px', display: 'flex', alignItems: 'center' }}>
                <Sparkles size={15} style={{ color: '#FFD700' }} />
              </div>
              <span style={{ fontSize: 11, fontWeight: 700, color: 'rgba(255,255,255,0.7)', textTransform: 'uppercase', letterSpacing: '0.15em' }}>Admin Dashboard</span>
            </div>
            <h1 style={{ fontSize: 'clamp(24px,7vw,38px)', fontWeight: 900, color: '#FFFFFF', margin: '0 0 8px', fontFamily: 'var(--font-jakarta)', lineHeight: 1 }}>Clients</h1>
            <p style={{ fontSize: 'clamp(12px,3vw,14px)', color: 'rgba(255,255,255,0.65)', margin: 0 }}>Manage active clients, deliverables and financials</p>
            <div style={{ display: 'flex', gap: 10, marginTop: 20, flexWrap: 'wrap' }}>
              {[
                { icon: <Building2 size={11} />, label: `${regularActive.length} Active` },
                { icon: <TrendingUp size={11} />, label: `${pastClients.length} Past Clients` },
                { icon: <Users size={11} />, label: `${activeClients.length + pastClients.length} Total` },
              ].map(s => (
                <div key={s.label} style={{ display: 'flex', alignItems: 'center', gap: 5, background: 'rgba(255,255,255,0.15)', borderRadius: 20, padding: '3px 10px' }}>
                  <span style={{ color: 'rgba(255,255,255,0.8)' }}>{s.icon}</span>
                  <span style={{ fontSize: 10, fontWeight: 700, color: '#FFFFFF' }}>{s.label}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
      {/* ── SPLIT PANEL ───────────────────────────────────────────────────── */}
      <div className="flex flex-col md:flex-row md:overflow-hidden" style={{ flex: 1 }}>

      {/* ── LEFT PANEL ──────────────────────────────────────────────────── */}
      <div className={selectedClientName ? "hidden md:flex flex-col flex-1 md:flex-none w-full md:w-[300px] md:overflow-hidden" : "flex flex-col flex-1 md:flex-none w-full md:w-[300px] md:overflow-hidden"} style={{
        flexShrink: 0, borderRight: '1px solid #EBEDF2',
        background: '#FFFFFF', minHeight: 0,
      }}>
        {/* Header */}
        <div style={{ padding: '18px 16px 12px', borderBottom: '1px solid #F0F1F5' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12 }}>
            <h1 style={{ fontSize: 18, fontWeight: 900, color: '#111827', margin: 0, fontFamily: 'var(--font-jakarta)' }}>
              Clients
            </h1>
            <span style={{
              fontSize: 10, fontWeight: 700, padding: '2px 8px', borderRadius: 6,
              background: 'rgba(222,26,26,0.08)', color: '#DE1A1A', border: '1px solid rgba(222,26,26,0.15)',
            }}>
              {activeClients.length + pastClients.length}
            </span>
            <button onClick={() => setClientModal('add')} style={{
              marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 4,
              fontSize: 11, fontWeight: 800, color: '#fff', background: '#DE1A1A',
              border: 'none', borderRadius: 8, padding: '6px 10px', cursor: 'pointer',
            }}>
              <Plus size={12} /> Add Client
            </button>
          </div>

          {/* Search */}
          <div style={{ position: 'relative' }}>
            <Search size={12} style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', color: "#37474F" }} />
            <input
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="Search clients…"
              style={{
                width: '100%', boxSizing: 'border-box', paddingLeft: 30, paddingRight: search ? 28 : 10,
                paddingTop: 8, paddingBottom: 8, borderRadius: 10,
                border: '1.5px solid #E5E7EB', fontSize: 12, color: '#111827',
                background: '#F9FAFB', outline: 'none',
              }}
            />
            {search && (
              <button onClick={() => setSearch('')} style={{ position: 'absolute', right: 6, top: '50%', transform: 'translateY(-50%)', background: 'none', border: 'none', cursor: 'pointer', padding: 2 }}>
                <X size={11} style={{ color: "#37474F" }} />
              </button>
            )}
          </div>
        </div>

        {/* Client list — virtual summary + 3 real sections */}
        <div className="md:overflow-y-auto" style={{ flex: 1, padding: '10px 12px', display: 'flex', flexDirection: 'column', gap: 2 }}>
          {filteredInternal.length === 0 && filteredActive.length === 0 && filteredPast.length === 0 && (
            <p style={{ fontSize: 12, color: "#37474F", textAlign: 'center', padding: '24px 0' }}>No clients found</p>
          )}

          {/* Summary aggregates */}
          {!search && (
            <>
              <p style={{ fontSize: 9, fontWeight: 800, color: '#6366F1', textTransform: 'uppercase', letterSpacing: '0.1em', margin: '6px 4px 4px' }}>
                Summary
              </p>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 4, marginBottom: 8 }}>
                {[
                  { id: '__all_active__', label: 'All Active Clients',  sub: `${regularActive.length} clients`,  emoji: '📊', color: '#22C55E' },
                  { id: '__all_past__',   label: 'All Past Clients',    sub: `${filteredPast.length} clients`,   emoji: '📁', color: '#9CA3AF' },
                  { id: '__internal__',   label: 'All Internal Brands', sub: `${internalClients.length} brands`, emoji: '🏢', color: '#6366F1' },
                ].map(vc => {
                  const isSel = selectedClientName === vc.id
                  return (
                    <button key={vc.id} onClick={() => selectClient(vc.id)} style={{
                      display: 'block', width: '100%', textAlign: 'left', cursor: 'pointer',
                      background: isSel ? `${vc.color}08` : '#FAFAFA',
                      border: '1px solid', borderColor: isSel ? `${vc.color}30` : '#F0F1F5',
                      borderLeft: isSel ? `3px solid ${vc.color}` : '3px solid transparent',
                      borderRadius: 12, padding: '10px 14px', transition: 'all 0.15s',
                    }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                        <span style={{ fontSize: 18 }}>{vc.emoji}</span>
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <p style={{ fontSize: 12, fontWeight: 800, color: isSel ? vc.color : "#37474F", margin: 0, fontFamily: 'var(--font-jakarta)' }}>
                            {vc.label}
                          </p>
                          <p style={{ fontSize: 10, color: "#37474F", margin: '1px 0 0' }}>{vc.sub}</p>
                        </div>
                      </div>
                    </button>
                  )
                })}
              </div>
            </>
          )}

          {/* Internal */}
          {filteredInternal.length > 0 && (
            <>
              <p style={{ fontSize: 9, fontWeight: 800, color: "#37474F", textTransform: 'uppercase', letterSpacing: '0.1em', margin: '6px 4px 4px' }}>
                Internal · {filteredInternal.length}
              </p>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 4, marginBottom: 8 }}>
                {filteredInternal.map(c => (
                  <ClientCard key={c.name} c={c} isSelected={selectedClientName?.toLowerCase() === c.name.toLowerCase()} onClick={() => selectClient(c.name)} />
                ))}
              </div>
            </>
          )}

          {/* Active */}
          {filteredActive.length > 0 && (
            <>
              <p style={{ fontSize: 9, fontWeight: 800, color: '#22C55E', textTransform: 'uppercase', letterSpacing: '0.1em', margin: '6px 4px 4px' }}>
                Active · {filteredActive.length}
              </p>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 4, marginBottom: 8 }}>
                {filteredActive.map(c => (
                  <ClientCard key={c.name} c={c} isSelected={selectedClientName?.toLowerCase() === c.name.toLowerCase()} onClick={() => selectClient(c.name)} />
                ))}
              </div>
            </>
          )}

          {/* Past */}
          {filteredPast.length > 0 && (
            <>
              <p style={{ fontSize: 9, fontWeight: 800, color: "#37474F", textTransform: 'uppercase', letterSpacing: '0.1em', margin: '6px 4px 4px' }}>
                Past · {filteredPast.length}
              </p>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                {filteredPast.map(c => (
                  <ClientCard key={c.name} c={c} isSelected={selectedClientName?.toLowerCase() === c.name.toLowerCase()} onClick={() => selectClient(c.name)} />
                ))}
              </div>
            </>
          )}
        </div>
      </div>

      {/* ── RIGHT PANEL ─────────────────────────────────────────────────── */}
      <div className={!selectedClientName ? "hidden md:flex flex-col md:overflow-y-auto" : "flex flex-col md:overflow-y-auto"} style={{ flex: 1 }}>

        {/* No client selected */}
        {!selectedClientName && (
          <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', flexDirection: 'column', gap: 12, minHeight: '60vh' }}>
            <div style={{ fontSize: 48 }}>👈</div>
            <p style={{ fontSize: 15, fontWeight: 700, color: "#37474F", margin: 0 }}>Select a client</p>
            <p style={{ fontSize: 13, color: "#37474F", margin: 0 }}>Pick a client from the left to see their deliverables and costs</p>
          </div>
        )}

        {/* Client selected */}
        {selectedClientName && selectedClientRow && (
          <div className="px-4 md:px-7" style={{ paddingTop: 24, paddingBottom: 48, display: 'flex', flexDirection: 'column', gap: 20 }}>

            <button className="md:hidden mb-3 flex items-center gap-2 text-sm font-bold text-gray-600" onClick={() => router.push('/admin/clients')}>
              ← Back to Clients
            </button>

            {/* ── Client header ────────────────────────────────────────── */}
            <div style={{
              background: 'linear-gradient(135deg, #DE1A1A 0%, #7F1D1D 100%)',
              borderRadius: 20, padding: '20px 24px',
              display: 'flex', alignItems: 'center', gap: 16, flexWrap: 'wrap',
              boxShadow: '0 6px 24px rgba(222,26,26,0.25)',
              position: 'relative', overflow: 'hidden',
            }}>
              <div style={{ position: 'absolute', top: -20, right: 60, width: 120, height: 120, borderRadius: '50%', background: 'rgba(255,255,255,0.07)', pointerEvents: 'none' }} />
              <div style={{
                width: 56, height: 56, borderRadius: 16, background: 'rgba(255,255,255,0.2)',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                fontSize: 20, fontWeight: 900, color: '#FFF', fontFamily: 'var(--font-jakarta)',
                border: '2px solid rgba(255,255,255,0.3)', flexShrink: 0,
              }}>
                {ini(selectedClientRow.name)}
              </div>
              <div style={{ flex: 1, minWidth: 140, position: 'relative' }}>
                <h2 style={{ fontSize: 22, fontWeight: 900, color: '#FFF', margin: '0 0 6px', fontFamily: 'var(--font-jakarta)' }}>
                  {selectedClientRow.name}
                </h2>
                <div style={{ display: 'flex', gap: 14, flexWrap: 'wrap' }}>
                  {selectedClientRow.industry?.startsWith('__virtual') ? (
                    // Virtual aggregate client — show count subtitle
                    <span style={{ fontSize: 13, color: 'rgba(255,255,255,0.85)', fontWeight: 500 }}>
                      {selectedClientRow.location}
                    </span>
                  ) : (
                    [selectedClientRow.location ? `📍 ${selectedClientRow.location}` : null]
                    .filter(Boolean).map((item, i) => (
                      <span key={i} style={{ fontSize: 13, color: 'rgba(255,255,255,0.85)', fontWeight: 500 }}>{item}</span>
                    ))
                  )}
                </div>
              </div>
              {!selectedClientRow.industry?.startsWith('__virtual') && (
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0 }}>
                  {/* Internal Brands are always active by definition — they don't have a Past
                      state, so no toggle is shown for them (only real clients switch). */}
                  {!selectedClientRow.is_internal && (
                    <button
                      onClick={() => {
                        const next = selectedClientRow.status === 'active' ? 'past' : 'active'
                        startSaving(async () => { await updateClientStatus(selectedClientRow.id, next); router.refresh() })
                      }}
                      disabled={isSaving}
                      style={{
                        fontSize: 10, fontWeight: 900, padding: '5px 14px', borderRadius: 20, cursor: isSaving ? 'not-allowed' : 'pointer',
                        textTransform: 'uppercase', letterSpacing: '0.04em',
                        background: selectedClientRow.status === 'active' ? '#0F9D64' : '#7F1D2B',
                        color: '#FFF', border: '2px solid #fff', boxShadow: '0 2px 8px rgba(0,0,0,0.25)',
                      }}
                      title="Click to switch Active ⇄ Past"
                    >
                      {selectedClientRow.status === 'active' ? '● Active' : '● Past'}
                    </button>
                  )}
                  <button onClick={() => setClientModal('edit')}
                    style={{ width: 30, height: 30, borderRadius: 10, background: 'rgba(255,255,255,0.15)', border: '1px solid rgba(255,255,255,0.3)', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer' }}
                    title="Edit client details">
                    <Pencil size={13} style={{ color: '#fff' }} />
                  </button>
                  <button
                    onClick={() => {
                      if (!confirm(`Delete "${selectedClientRow.name}"? This only works if they have no real logged work or expenses on file — this cannot be undone.`)) return
                      startSaving(async () => {
                        const result = await deleteClient(selectedClientRow.id)
                        if (result.success) router.push('/admin/clients')
                        else alert(result.error ?? 'Failed to delete')
                      })
                    }}
                    disabled={isSaving}
                    style={{ width: 30, height: 30, borderRadius: 10, background: 'rgba(255,255,255,0.15)', border: '1px solid rgba(255,255,255,0.3)', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: isSaving ? 'not-allowed' : 'pointer' }}
                    title="Delete client">
                    <Trash2 size={13} style={{ color: '#fff' }} />
                  </button>
                </div>
              )}
            </div>

            {/* ── Date filter ──────────────────────────────────────────── */}
            <div style={{
              background: '#FFFFFF', borderRadius: 14, padding: '14px 18px',
              border: '1px solid #EBEDF2', display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap',
            }}>
              {/* Quick buttons — All Time first, then Month, then Custom */}
              {([
                { key: 'all',    label: 'All Time' },
                { key: 'this',   label: 'Month'    },
                { key: 'custom', label: 'Custom'   },
              ] as const).map(({ key, label }) => (
                <button key={key} onClick={() => setQuick(key)} style={{
                  padding: '7px 16px', borderRadius: 9, fontSize: 12, fontWeight: 700,
                  border: activeQuick === key ? '1.5px solid #DE1A1A' : '1.5px solid #E5E7EB',
                  cursor: 'pointer', transition: 'all 0.15s',
                  background: activeQuick === key ? 'rgba(222,26,26,0.06)' : '#F9FAFB',
                  color: activeQuick === key ? '#DE1A1A' : '#37474F',
                }}>
                  {label}
                </button>
              ))}

              {mode === 'custom' ? (
                /* Custom from/to date range */
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                  <input
                    type="date"
                    value={dateFrom}
                    min="2025-01-01"
                    max={dateTo}
                    onChange={e => setCustomRange(e.target.value, dateTo)}
                    style={{
                      padding: '7px 12px', borderRadius: 10, border: '1.5px solid #DE1A1A',
                      fontSize: 13, fontWeight: 600, color: '#111827', background: '#F9FAFB',
                      outline: 'none', cursor: 'pointer',
                    }}
                  />
                  <span style={{ fontSize: 12, fontWeight: 700, color: "#37474F" }}>to</span>
                  <input
                    type="date"
                    value={dateTo}
                    min={dateFrom}
                    max={today}
                    onChange={e => setCustomRange(dateFrom, e.target.value)}
                    style={{
                      padding: '7px 12px', borderRadius: 10, border: '1.5px solid #DE1A1A',
                      fontSize: 13, fontWeight: 600, color: '#111827', background: '#F9FAFB',
                      outline: 'none', cursor: 'pointer',
                    }}
                  />
                </div>
              ) : (
                /* Month picker */
                <input
                  type="month"
                  value={mode === 'all' ? today.slice(0, 7) : period.slice(0, 7)}
                  min="2025-01"
                  max={today.slice(0, 7)}
                  onChange={e => setPeriod(e.target.value)}
                  style={{
                    padding: '7px 12px', borderRadius: 10,
                    border: activeQuick === null && mode !== 'all' ? '1.5px solid #DE1A1A' : '1.5px solid #E5E7EB',
                    fontSize: 13, fontWeight: 600, color: '#111827', background: '#F9FAFB',
                    outline: 'none', cursor: 'pointer',
                  }}
                />
              )}
            </div>

            {/* ── Stat chips ───────────────────────────────────────────── */}
            {deliverables && (() => {
              const isInternal = selectedClientRow?.industry === 'Internal Brand' || selectedClientRow?.industry === '__virtual_internal__'
              const d = deliverables
              if (isInternal) {
                return (
                  <div className="grid grid-cols-2 md:grid-cols-5" style={{ gap: 10 }}>
                    <StatChip label="Shooting"    emoji="📸" hours={`${d.mediaShootHours.toFixed(1)}h`}   count={d.mediaShootCount}  color="#F97316" />
                    <StatChip label="Editing"     emoji="🎬" hours={`${d.mediaEditHours.toFixed(1)}h`}    count={d.mediaEditCount}   color="#E53935" />
                    <StatChip label="Working"     emoji="💼" hours={`${d.nonMediaWorkHours.toFixed(1)}h`}                            color="#6366F1" />
                    <StatChip label="Voiceover"   emoji="🎙️" hours={`${d.voiceoverHours.toFixed(1)}h`}    count={d.voiceoverCount}   color="#8B5CF6" />
                    <StatChip label="Posters"     emoji="🖼️" hours={`${d.posterHours.toFixed(1)}h`}       count={d.totalPosters}     color="#10B981" />
                    <StatChip label="Learning"    emoji="📚" hours={`${d.totalLearningHours.toFixed(1)}h`}                           color="#0EA5E9" />
                    <StatChip label="Other"       emoji="🗓️" hours={`${d.otherActivityHours.toFixed(1)}h`}                          color="#6B7280" />
                    <StatChip label="Scripting"   emoji="📝" hours={`${d.scriptingHours.toFixed(1)}h`}    count={d.scriptingCount}   color="#EAB308" />
                    <StatChip label="Development" emoji="💻" hours={`${d.developmentHours.toFixed(1)}h`}                            color="#4338CA" />
                    <StatChip label="Total"       emoji="💰" hours={fmtRupee(d.totalCost)}                                           color="#DE1A1A" isCost />
                  </div>
                )
              }
              return (
                <div className="grid grid-cols-2 md:grid-cols-4" style={{ gap: 10 }}>
                  <StatChip label="Shooting"    emoji="📸" hours={`${d.mediaShootHours.toFixed(1)}h`}   count={d.mediaShootCount}  color="#F97316" />
                  <StatChip label="Editing"     emoji="🎬" hours={`${d.mediaEditHours.toFixed(1)}h`}    count={d.mediaEditCount}   color="#E53935" />
                  <StatChip label="Working"     emoji="💼" hours={`${d.nonMediaWorkHours.toFixed(1)}h`}                            color="#6366F1" />
                  <StatChip label="Voiceover"   emoji="🎙️" hours={`${d.voiceoverHours.toFixed(1)}h`}    count={d.voiceoverCount}   color="#8B5CF6" />
                  <StatChip label="Posters"     emoji="🖼️" hours={`${d.posterHours.toFixed(1)}h`}       count={d.totalPosters}     color="#10B981" />
                  <StatChip label="Scripting"   emoji="📝" hours={`${d.scriptingHours.toFixed(1)}h`}    count={d.scriptingCount}   color="#EAB308" />
                  <StatChip label="Development" emoji="💻" hours={`${d.developmentHours.toFixed(1)}h`}                            color="#4338CA" />
                  <StatChip label="Total"       emoji="💰" hours={fmtRupee(d.totalCost)}                                           color="#DE1A1A" isCost />
                </div>
              )
            })()}

            {/* ── No data ──────────────────────────────────────────────── */}
            {deliverables && !hasData && (
              <div style={{
                background: '#FFFFFF', borderRadius: 16, padding: '40px 28px',
                border: '1px dashed #E5E7EB', textAlign: 'center',
              }}>
                <div style={{ fontSize: 36, marginBottom: 12 }}>📭</div>
                <p style={{ fontSize: 14, fontWeight: 700, color: "#37474F", margin: '0 0 6px' }}>
                  No work logged for this period
                </p>
                <p style={{ fontSize: 12, color: "#37474F", margin: '0 0 16px' }}>
                  Searched {fmtDate(dateFrom)}{dateFrom !== dateTo ? ` – ${fmtDate(dateTo)}` : ''} for client name &ldquo;{selectedClientRow.name}&rdquo;
                </p>
                <div style={{ display: 'inline-flex', gap: 8, flexWrap: 'wrap', justifyContent: 'center' }}>
                  <p style={{ fontSize: 11, color: "#37474F", margin: 0, background: '#F9FAFB', padding: '6px 14px', borderRadius: 8, border: '1px solid #E5E7EB' }}>
                    Try a different month or &ldquo;All Time&rdquo; above
                  </p>
                  <p style={{ fontSize: 11, color: "#37474F", margin: 0, background: '#F9FAFB', padding: '6px 14px', borderRadius: 8, border: '1px solid #E5E7EB' }}>
                    Members must select &ldquo;{selectedClientRow.name}&rdquo; exactly in their daily update
                  </p>
                </div>
              </div>
            )}

            {/* ── Shoots ───────────────────────────────────────────────── */}
            {deliverables && deliverables.shoots.length > 0 && (
              <Section title="Shooting" emoji="📸" count={deliverables.shoots.length} totalCost={deliverables.shoots.reduce((s, e) => s + e.cost, 0)}>
                <div style={{ overflowX: 'auto' }}><table style={{ width: '100%', minWidth: 400, borderCollapse: 'collapse' }}>
                  <TableCols showClient={showClient} />
                  <thead><tr style={{ background: '#F9FAFB' }}>
                    {['Date', ...(showClient ? ['Client'] : []), 'Member', 'Title', 'Hours', 'Cost'].map(h => <TH key={h}>{h}</TH>)}
                  </tr></thead>
                  <tbody>
                    {deliverables.shoots.map((s, i) => (
                      <tr key={i} style={{ borderBottom: '1px solid #F9FAFB' }}>
                        <td style={{ padding: '10px 14px', fontSize: 12, color: "#37474F" }}>{fmtDate(s.date)}</td>
                        {showClient && <td style={{ padding: '10px 14px', fontSize: 11, fontWeight: 700, color: '#6366F1' }}>{s.clientName}</td>}
                        <td style={{ padding: '10px 14px', fontSize: 12, fontWeight: 600, color: "#37474F" }}>{s.memberName}</td>
                        <td style={{ padding: '10px 14px', fontSize: 12, color: "#37474F" }}>{s.title}</td>
                        <td style={{ padding: '10px 14px', fontSize: 12, fontWeight: 600, color: '#3B82F6' }}>{s.hours.toFixed(1)}h</td>
                        <td style={{ padding: '10px 14px', fontSize: 12, fontWeight: 700, color: '#111827' }}>{fmtRupee(s.cost)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table></div>
              </Section>
            )}

            {/* ── Editing (flat table) ─────────────────────────────────── */}
            {deliverables && deliverables.videoTypeGroups.length > 0 && (() => {
              const allVideos = deliverables.videoTypeGroups.flatMap(g => g.videos)
                .sort((a, b) => b.date.localeCompare(a.date))
              const totalEditCost = deliverables.videoTypeGroups.reduce((s, g) => s + g.totalCost, 0)
              return (
                <Section title="Editing" emoji="🎬" count={deliverables.totalVideos} totalCost={totalEditCost}>
                  <div style={{ overflowX: 'auto' }}><table style={{ width: '100%', minWidth: 400, borderCollapse: 'collapse' }}>
                    <TableCols showClient={showClient} />
                    <thead><tr style={{ background: '#F9FAFB' }}>
                      {['Date', ...(showClient ? ['Client'] : []), 'Member', 'Title', 'Hours', 'Cost'].map(h => <TH key={h}>{h}</TH>)}
                    </tr></thead>
                    <tbody>
                      {allVideos.map((v, i) => (
                        <tr key={i} style={{ borderBottom: '1px solid #F9FAFB', background: v.isRework ? 'rgba(245,158,11,0.04)' : undefined }}>
                          <td style={{ padding: '10px 14px', fontSize: 12, color: "#37474F" }}>{fmtDate(v.date)}</td>
                          {showClient && <td style={{ padding: '10px 14px', fontSize: 11, fontWeight: 700, color: '#6366F1' }}>{v.clientName}</td>}
                          <td style={{ padding: '10px 14px', fontSize: 12, fontWeight: 600, color: "#37474F" }}>{v.memberName}</td>
                          <td style={{ padding: '10px 14px', fontSize: 12, color: "#37474F" }}>
                            {v.isRework && <span style={{ fontSize: 10, fontWeight: 700, color: '#B45309', background: 'rgba(245,158,11,0.12)', border: '1px solid rgba(245,158,11,0.3)', borderRadius: 6, padding: '1px 6px', marginRight: 6 }}>↩ Revision</span>}
                            {v.videoName}
                          </td>
                          <td style={{ padding: '10px 14px', fontSize: 12, fontWeight: 600, color: '#3B82F6' }}>{v.timeTaken > 0 ? `${v.timeTaken}h` : '—'}</td>
                          <td style={{ padding: '10px 14px', fontSize: 12, fontWeight: 700, color: '#111827' }}>{fmtRupee(v.cost)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table></div>
                </Section>
              )
            })()}

            {/* ── Shared row table helper ───────────────────────────────── */}
            {deliverables && (() => {
              type FlatEntry = { date: string; clientName: string; memberName: string; title: string; hours: number; cost: number; isRework?: boolean }
              function EntryTable({ entries }: { entries: FlatEntry[] }) {
                return (
                  <div style={{ overflowX: 'auto' }}><table style={{ width: '100%', minWidth: 400, borderCollapse: 'collapse' }}>
                    <TableCols showClient={showClient} />
                    <thead><tr style={{ background: '#F9FAFB' }}>
                      {['Date', ...(showClient ? ['Client'] : []), 'Member', 'Title', 'Hours', 'Cost'].map(h => <TH key={h}>{h}</TH>)}
                    </tr></thead>
                    <tbody>
                      {entries.map((o, i) => (
                        <tr key={i} style={{ borderBottom: '1px solid #F9FAFB', background: o.isRework ? 'rgba(245,158,11,0.04)' : undefined }}>
                          <td style={{ padding: '10px 14px', fontSize: 12, color: "#37474F" }}>{fmtDate(o.date)}</td>
                          {showClient && <td style={{ padding: '10px 14px', fontSize: 11, fontWeight: 700, color: '#6366F1' }}>{o.clientName}</td>}
                          <td style={{ padding: '10px 14px', fontSize: 12, fontWeight: 600, color: "#37474F" }}>{o.memberName}</td>
                          <td style={{ padding: '10px 14px', fontSize: 12, color: "#37474F" }}>
                            {o.isRework && <span style={{ fontSize: 10, fontWeight: 700, color: '#B45309', background: 'rgba(245,158,11,0.12)', border: '1px solid rgba(245,158,11,0.3)', borderRadius: 6, padding: '1px 6px', marginRight: 6 }}>↩ Revision</span>}
                            {o.title}
                          </td>
                          <td style={{ padding: '10px 14px', fontSize: 12, fontWeight: 600, color: '#3B82F6' }}>{o.hours.toFixed(1)}h</td>
                          <td style={{ padding: '10px 14px', fontSize: 12, fontWeight: 700, color: '#111827' }}>{fmtRupee(o.cost)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table></div>
                )
              }
              const d = deliverables
              return (
                <>
                  {d.technicalWork.length > 0 && (
                    <Section title="Technical Work" emoji="💼" count={d.technicalWork.length} totalCost={d.technicalWork.reduce((s, e) => s + e.cost, 0)}>
                      <EntryTable entries={d.technicalWork} />
                    </Section>
                  )}
                  {d.posterWork.length > 0 && (
                    <Section title="Posters" emoji="🖼️" count={d.posterWork.length} totalCost={d.posterWork.reduce((s, e) => s + e.cost, 0)}>
                      <EntryTable entries={d.posterWork} />
                    </Section>
                  )}
                  {d.voiceoverWork.length > 0 && (
                    <Section title="Voiceover" emoji="🎙️" count={d.voiceoverWork.length} totalCost={d.voiceoverWork.reduce((s, e) => s + e.cost, 0)}>
                      <EntryTable entries={d.voiceoverWork} />
                    </Section>
                  )}
                  {d.scriptingWork.length > 0 && (
                    <Section title="Scripting" emoji="📝" count={d.scriptingWork.length} totalCost={d.scriptingWork.reduce((s, e) => s + e.cost, 0)}>
                      <EntryTable entries={d.scriptingWork} />
                    </Section>
                  )}
                  {d.developmentWork.length > 0 && (
                    <Section title="Development" emoji="💻" count={d.developmentWork.length} totalCost={d.developmentWork.reduce((s, e) => s + e.cost, 0)}>
                      <EntryTable entries={d.developmentWork} />
                    </Section>
                  )}
                  {d.otherActivityWork.length > 0 && (
                    <Section title="Other" emoji="🗓️" count={d.otherActivityWork.length} totalCost={d.otherActivityWork.reduce((s, e) => s + e.cost, 0)}>
                      <EntryTable entries={d.otherActivityWork} />
                    </Section>
                  )}
                </>
              )
            })()}


          </div>
        )}
      </div>
      </div>

      {clientModal && (
        <ClientFormModal
          mode={clientModal}
          client={clientModal === 'edit' ? selectedClientRow : null}
          serviceOptions={serviceOptions}
          isSaving={isSaving}
          onClose={() => setClientModal(null)}
          onSave={(fields) => {
            startSaving(async () => {
              if (clientModal === 'add') {
                const fd = new FormData()
                Object.entries(fields).forEach(([k, v]) => {
                  if (k === 'is_internal' || k === 'serviceIds' || v == null) return
                  fd.set(k, v as string)
                })
                fd.set('is_internal', fields.is_internal ? 'true' : 'false')
                const result = await addClient(fd)
                if (result.success && result.id) {
                  await setClientServices(result.id, fields.serviceIds)
                  setClientModal(null)
                  router.refresh()
                } else if (result.success) {
                  setClientModal(null); router.refresh()
                } else alert(result.error ?? 'Failed to add client')
              } else if (selectedClientRow) {
                const result = await updateClientDetails(selectedClientRow.id, {
                  name: fields.name, contact_name: fields.contact_name || null,
                  industry: fields.industry || null, location: fields.location || null,
                  package_name: fields.package_name || null,
                  period: fields.period || null, phone: fields.phone || null, email: fields.email || null,
                  is_internal: fields.is_internal,
                })
                if (result.success) {
                  await setClientServices(selectedClientRow.id, fields.serviceIds)
                  setClientModal(null)
                  if (fields.name !== selectedClientRow.name) router.push(`/admin/clients?client=${encodeURIComponent(fields.name)}`)
                  else router.refresh()
                } else alert(result.error ?? 'Failed to save')
              }
            })
          }}
        />
      )}
    </div>
  )
}

// ── Add / Edit client modal ─────────────────────────────────────────────────

type ClientFormFields = {
  name: string; contact_name: string; industry: string; location: string
  serviceIds: string[]; package_name: string; period: string; phone: string; email: string
  is_internal: boolean
}

function ClientFormModal({
  mode, client, serviceOptions, isSaving, onClose, onSave,
}: {
  mode: 'add' | 'edit'
  client: ClientRow | null
  serviceOptions: ServiceOption[]
  isSaving: boolean
  onClose: () => void
  onSave: (fields: ClientFormFields) => void
}) {
  const [fields, setFields] = useState<ClientFormFields>({
    name:         client?.name ?? '',
    contact_name: client?.contact_name ?? '',
    industry:     client?.industry ?? '',
    location:     client?.location ?? '',
    serviceIds:   client?.serviceIds ?? [],
    package_name: client?.package_name ?? '',
    period:       client?.period ?? '',
    phone:        client?.phone ?? '',
    email:        client?.email ?? '',
    is_internal:  client?.is_internal ?? false,
  })
  const initialPeriod = parsePeriod(client?.period ?? '')
  const [periodFrom, setPeriodFrom] = useState(initialPeriod.from)
  const [periodTo, setPeriodTo] = useState(initialPeriod.to)
  const [periodRecurring, setPeriodRecurring] = useState(initialPeriod.recurring)

  const [options, setOptions] = useState<ServiceOption[]>(serviceOptions)
  const [newServiceName, setNewServiceName] = useState('')
  const [editingServices, setEditingServices] = useState(false)
  const [renamingId, setRenamingId] = useState<string | null>(null)
  const [renameText, setRenameText] = useState('')
  const [busy, startBusy] = useTransition()

  function toggleService(id: string) {
    setFields(f => ({
      ...f,
      serviceIds: f.serviceIds.includes(id) ? f.serviceIds.filter(x => x !== id) : [...f.serviceIds, id],
    }))
  }

  function handleAddService() {
    const name = newServiceName.trim()
    if (!name) return
    startBusy(async () => {
      const result = await addServiceOption(name)
      if (result.success && result.option) {
        const opt = result.option
        setOptions(prev => [...prev, opt].sort((a, b) => a.name.localeCompare(b.name)))
        setFields(f => ({ ...f, serviceIds: [...f.serviceIds, opt.id] }))
        setNewServiceName('')
      } else if (result.error) {
        alert(result.error)
      }
    })
  }

  function commitRename() {
    const id = renamingId
    const name = renameText.trim()
    setRenamingId(null)
    if (!id || !name) return
    startBusy(async () => {
      const result = await renameServiceOption(id, name)
      if (result.success) {
        setOptions(prev => prev.map(o => o.id === id ? { ...o, name: name.toUpperCase() } : o).sort((a, b) => a.name.localeCompare(b.name)))
      } else if (result.error) alert(result.error)
    })
  }

  function handleDeleteService(o: ServiceOption) {
    if (!confirm(`Delete "${o.name}"? This removes it from every client that has it selected.`)) return
    startBusy(async () => {
      const result = await deleteServiceOption(o.id)
      if (result.success) {
        setOptions(prev => prev.filter(x => x.id !== o.id))
        setFields(f => ({ ...f, serviceIds: f.serviceIds.filter(id => id !== o.id) }))
      } else if (result.error) alert(result.error)
    })
  }

  function set(key: keyof Omit<ClientFormFields, 'is_internal' | 'serviceIds' | 'period'>) {
    return (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => setFields(f => ({ ...f, [key]: e.target.value }))
  }

  const FIELD: React.CSSProperties = {
    width: '100%', boxSizing: 'border-box', padding: '10px 12px', borderRadius: 10,
    border: '1.5px solid #E9EAEE', fontSize: 13, color: '#111827', outline: 'none',
    background: '#fff', transition: 'border-color 0.15s',
  }
  const LABEL: React.CSSProperties = {
    fontSize: 10, fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.06em',
    color: '#8B8FA3', display: 'flex', alignItems: 'center', gap: 5, marginBottom: 6,
  }
  const CARD: React.CSSProperties = {
    background: '#FAFAFB', border: '1px solid #F0F1F4', borderRadius: 16, padding: 16,
    display: 'flex', flexDirection: 'column', gap: 12,
  }
  const SECTION_TITLE: React.CSSProperties = {
    fontSize: 10.5, fontWeight: 900, textTransform: 'uppercase', letterSpacing: '0.07em',
    color: '#DE1A1A', display: 'flex', alignItems: 'center', gap: 6, marginBottom: 2,
  }

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(17,17,17,0.55)', backdropFilter: 'blur(2px)', zIndex: 100, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}
      onClick={onClose}>
      <div style={{ background: '#fff', borderRadius: 22, width: '100%', maxWidth: 500, maxHeight: '90vh', overflow: 'hidden', boxShadow: '0 24px 64px rgba(0,0,0,0.28)', display: 'flex', flexDirection: 'column' }}
        onClick={e => e.stopPropagation()}>

        {/* Header strip */}
        <div style={{
          background: 'linear-gradient(135deg, #DE1A1A 0%, #7F1D1D 100%)', padding: '18px 22px',
          display: 'flex', alignItems: 'center', gap: 12, flexShrink: 0, position: 'relative', overflow: 'hidden',
        }}>
          <div style={{ position: 'absolute', top: -30, right: -10, width: 100, height: 100, borderRadius: '50%', background: 'rgba(255,255,255,0.07)', pointerEvents: 'none' }} />
          <div style={{
            width: 38, height: 38, borderRadius: 12, background: 'rgba(255,255,255,0.18)',
            border: '1.5px solid rgba(255,255,255,0.3)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
          }}>
            <Building2 size={17} style={{ color: '#fff' }} />
          </div>
          <h3 style={{ fontSize: 16, fontWeight: 900, color: '#fff', margin: 0, fontFamily: 'var(--font-jakarta)', flex: 1 }}>
            {mode === 'add' ? 'Add Client' : 'Edit Client'}
          </h3>
          <button onClick={onClose} style={{ width: 28, height: 28, borderRadius: 9, background: 'rgba(255,255,255,0.15)', border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <X size={14} style={{ color: '#fff' }} />
          </button>
        </div>

        <div style={{ padding: 20, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 14 }}>

          {/* Basics */}
          <div style={CARD}>
            <div>
              <label style={LABEL}><Tag size={11} /> Client / Company Name *</label>
              <input style={FIELD} value={fields.name} onChange={set('name')} placeholder="e.g. Evan Styles Makeover" />
            </div>
            <button type="button"
              onClick={() => setFields(f => ({ ...f, is_internal: !f.is_internal }))}
              className="transition-all duration-100 active:translate-y-[2px]"
              style={{
                display: 'flex', alignItems: 'center', gap: 9, width: '100%', textAlign: 'left',
                padding: '10px 14px', borderRadius: 12, cursor: 'pointer', border: 'none',
                background: fields.is_internal
                  ? 'linear-gradient(180deg, #EF4444 0%, #DE1A1A 100%)'
                  : 'linear-gradient(180deg, #FFFFFF 0%, #F3F4F6 100%)',
                boxShadow: fields.is_internal ? '0 3px 0 #9F1616' : '0 3px 0 #D8DADF',
              }}>
              <div style={{
                width: 18, height: 18, borderRadius: 6, flexShrink: 0,
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                background: fields.is_internal ? 'rgba(255,255,255,0.25)' : '#fff',
                border: fields.is_internal ? 'none' : '1.5px solid #D1D5DB',
              }}>
                {fields.is_internal && <Check size={12} strokeWidth={3.5} style={{ color: '#fff' }} />}
              </div>
              <span style={{ fontSize: 12.5, fontWeight: 800, color: fields.is_internal ? '#fff' : '#374151' }}>
                Internal Brand
              </span>
            </button>
          </div>

          {/* Contact */}
          <div style={CARD}>
            <span style={SECTION_TITLE}><User size={12} /> Contact</span>
            <div>
              <label style={LABEL}>Client Name</label>
              <input style={FIELD} value={fields.contact_name} onChange={set('contact_name')} />
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
              <div>
                <label style={LABEL}><Phone size={10} /> Phone</label>
                <input style={FIELD} value={fields.phone} onChange={set('phone')} />
              </div>
              <div>
                <label style={LABEL}><Mail size={10} /> Email</label>
                <input style={FIELD} value={fields.email} onChange={set('email')} />
              </div>
            </div>
          </div>

          {/* Business */}
          <div style={CARD}>
            <span style={SECTION_TITLE}><Building2 size={12} /> Business</span>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
              <div>
                <label style={LABEL}>Industry</label>
                <input style={FIELD} value={fields.industry} onChange={set('industry')} />
              </div>
              <div>
                <label style={LABEL}><MapPin size={10} /> Location</label>
                <input style={FIELD} value={fields.location} onChange={set('location')} />
              </div>
            </div>
          </div>

          {/* Engagement */}
          <div style={CARD}>
            <span style={SECTION_TITLE}><Layers size={12} /> Engagement</span>

            <div>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 }}>
                <label style={{ ...LABEL, marginBottom: 0 }}>Services</label>
                <button type="button" onClick={() => { setEditingServices(e => !e); setRenamingId(null) }}
                  style={{ fontSize: 10, fontWeight: 800, color: '#DE1A1A', background: 'none', border: 'none', cursor: 'pointer', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                  {editingServices ? 'Done' : 'Edit list'}
                </button>
              </div>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                {options.map(o => {
                  const active = fields.serviceIds.includes(o.id)
                  if (editingServices) {
                    if (renamingId === o.id) {
                      return (
                        <input key={o.id} autoFocus value={renameText}
                          onChange={e => setRenameText(e.target.value)}
                          onBlur={commitRename}
                          onKeyDown={e => { if (e.key === 'Enter') commitRename(); if (e.key === 'Escape') setRenamingId(null) }}
                          style={{ ...FIELD, width: 150, padding: '5px 10px', fontSize: 11.5 }} />
                      )
                    }
                    return (
                      <div key={o.id} style={{ display: 'flex', alignItems: 'center', gap: 5, padding: '4px 4px 4px 12px', borderRadius: 999, border: '1.5px solid #E5E7EB', background: '#fff' }}>
                        <button type="button" onClick={() => { setRenamingId(o.id); setRenameText(o.name) }}
                          style={{ background: 'none', border: 'none', fontSize: 11.5, fontWeight: 700, color: '#374151', cursor: 'pointer', padding: 0 }}>
                          {o.name}
                        </button>
                        <button type="button" onClick={() => handleDeleteService(o)}
                          style={{ width: 18, height: 18, borderRadius: '50%', border: 'none', background: '#FEE2E2', color: '#DC2626', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', flexShrink: 0 }}>
                          <X size={10} strokeWidth={3} />
                        </button>
                      </div>
                    )
                  }
                  return (
                    <button key={o.id} type="button" onClick={() => toggleService(o.id)}
                      style={{
                        padding: '6px 12px', borderRadius: 999, fontSize: 11.5, fontWeight: 700, cursor: 'pointer',
                        border: `1.5px solid ${active ? '#DE1A1A' : '#E5E7EB'}`,
                        background: active ? 'rgba(222,26,26,0.08)' : '#fff',
                        color: active ? '#DE1A1A' : '#6B7280',
                      }}>
                      {o.name}
                    </button>
                  )
                })}
              </div>
              <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
                <input
                  value={newServiceName}
                  onChange={e => setNewServiceName(e.target.value)}
                  onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); handleAddService() } }}
                  placeholder="+ Add new service"
                  style={{ ...FIELD, flex: 1, fontSize: 12 }}
                />
                <button type="button" onClick={handleAddService} disabled={!newServiceName.trim() || busy}
                  style={{
                    padding: '0 14px', borderRadius: 10, border: 'none', fontSize: 12, fontWeight: 700,
                    background: '#F3F4F6', color: '#374151',
                    cursor: (!newServiceName.trim() || busy) ? 'not-allowed' : 'pointer',
                    opacity: (!newServiceName.trim() || busy) ? 0.6 : 1,
                  }}>
                  Add
                </button>
              </div>
            </div>

            <div>
              <label style={LABEL}>Package</label>
              <select style={FIELD} value={fields.package_name} onChange={set('package_name')}>
                <option value="">Select package</option>
                {PACKAGE_OPTIONS.map(p => <option key={p} value={p}>{p}</option>)}
              </select>
            </div>

            <div>
              <label style={LABEL}><CalendarRange size={10} /> Period</label>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, alignItems: 'center' }}>
                <input type="month" style={{ ...FIELD, flex: '1 1 120px' }} value={periodFrom}
                  disabled={periodRecurring}
                  onChange={e => setPeriodFrom(e.target.value)} />
                <span style={{ fontSize: 12, color: '#9CA3AF', fontWeight: 700 }}>to</span>
                <input type="month" style={{ ...FIELD, flex: '1 1 120px' }} value={periodTo}
                  disabled={periodRecurring}
                  onChange={e => setPeriodTo(e.target.value)} />
              </div>
              <button type="button" onClick={() => setPeriodRecurring(r => !r)}
                style={{
                  display: 'flex', alignItems: 'center', gap: 6, marginTop: 8, padding: '5px 11px', borderRadius: 999,
                  border: `1.5px solid ${periodRecurring ? '#DE1A1A' : '#E5E7EB'}`,
                  background: periodRecurring ? 'rgba(222,26,26,0.08)' : '#fff',
                  color: periodRecurring ? '#DE1A1A' : '#6B7280',
                  fontSize: 11, fontWeight: 700, cursor: 'pointer',
                }}>
                <div style={{
                  width: 13, height: 13, borderRadius: 4, display: 'flex', alignItems: 'center', justifyContent: 'center',
                  border: `1.5px solid ${periodRecurring ? '#DE1A1A' : '#D1D5DB'}`, background: periodRecurring ? '#DE1A1A' : '#fff',
                }}>
                  {periodRecurring && <Check size={9} strokeWidth={4} style={{ color: '#fff' }} />}
                </div>
                No fixed end — billed monthly
              </button>
            </div>
          </div>
        </div>

        <div style={{ display: 'flex', gap: 10, padding: '16px 20px', borderTop: '1px solid #F0F1F4', flexShrink: 0 }}>
          <button onClick={onClose} style={{ flex: 1, padding: '11px', borderRadius: 12, background: '#F3F4F6', color: '#374151', fontSize: 13, fontWeight: 700, border: 'none', cursor: 'pointer' }}>
            Cancel
          </button>
          <button
            onClick={() => {
              if (!fields.name.trim()) return
              onSave({ ...fields, period: buildPeriodString(periodFrom, periodTo, periodRecurring) })
            }}
            disabled={isSaving || !fields.name.trim() || busy}
            style={{
              flex: 1.4, padding: '11px', borderRadius: 12, border: 'none', fontSize: 13, fontWeight: 800,
              background: 'linear-gradient(180deg, #EF4444 0%, #DE1A1A 100%)', color: '#fff',
              boxShadow: isSaving ? 'none' : '0 3px 0 #9F1616',
              cursor: isSaving ? 'not-allowed' : 'pointer', opacity: isSaving ? 0.7 : 1,
            }}>
            {isSaving ? 'Saving…' : mode === 'add' ? 'Add Client' : 'Save Changes'}
          </button>
        </div>
      </div>
    </div>
  )
}
