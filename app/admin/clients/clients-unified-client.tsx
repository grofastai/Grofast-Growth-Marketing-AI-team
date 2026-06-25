'use client'

import { useState, useMemo } from 'react'
import { useRouter } from 'next/navigation'
import { Search, X } from 'lucide-react'
import type { ClientRow } from './page'
import type { DeliverableResult } from '@/lib/clients-deliverables'
import { fmtRupee, fmtDate } from '@/lib/clients-deliverables'

// ── Work type display config ──────────────────────────────────────────────────

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
            {c.industry && <span style={{ fontSize: 10, color: '#9CA3AF' }}>{c.industry}</span>}
            {c.package_name && (
              <span style={{
                fontSize: 9, fontWeight: 700, padding: '1px 6px', borderRadius: 4,
                background: 'rgba(99,102,241,0.08)', color: '#6366F1',
              }}>{c.package_name}</span>
            )}
          </div>
        </div>
        <div style={{
          width: 7, height: 7, borderRadius: '50%', flexShrink: 0,
          background: c.status === 'active' ? '#22C55E' : '#9CA3AF',
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
          <span style={{ fontSize: 11, fontWeight: 700, padding: '2px 8px', borderRadius: 99, background: '#F3F4F6', color: '#6B7280' }}>
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
    <th style={{ padding: '8px 14px', fontSize: 10, fontWeight: 700, color: '#9CA3AF', textAlign: 'left', borderBottom: '1px solid #F3F4F6', textTransform: 'uppercase', letterSpacing: '0.06em' }}>
      {children}
    </th>
  )
}

// Shared colgroup — 5 cols normally, 6 cols when showClient=true (aggregate view)
function TableCols({ showClient }: { showClient?: boolean }) {
  return (
    <colgroup>
      <col style={{ width: '12%' }} />                          {/* Date */}
      {showClient && <col style={{ width: '14%' }} />}          {/* Client (aggregate only) */}
      <col style={{ width: showClient ? '12%' : '14%' }} />     {/* Member */}
      <col />                                                   {/* Title */}
      <col style={{ width: '8%' }} />                           {/* Hours */}
      <col style={{ width: '10%' }} />                          {/* Cost */}
    </colgroup>
  )
}

// ── Main component ─────────────────────────────────────────────────────────────

export default function ClientsUnifiedClient({
  activeClients, pastClients,
  selectedClientName, selectedClientRow,
  deliverables,
  mode, period, today,
  dateFrom, dateTo,
}: {
  activeClients: ClientRow[]
  pastClients:   ClientRow[]
  selectedClientName: string | null
  selectedClientRow: ClientRow | null
  deliverables: DeliverableResult | null
  mode: 'month' | 'all'
  period: string
  today: string
  dateFrom: string
  dateTo: string
}) {
  const router = useRouter()
  const [search, setSearch] = useState('')

  const internalClients = useMemo(() => activeClients.filter(c => c.industry === 'Internal Brand'), [activeClients])
  const regularActive   = useMemo(() => activeClients.filter(c => c.industry !== 'Internal Brand'), [activeClients])

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

  function thisMonthStr() { return new Date().toISOString().slice(0, 7) }
  function prevMonthStr() {
    const d = new Date(); d.setDate(1); d.setMonth(d.getMonth() - 1)
    return d.toISOString().slice(0, 7)
  }

  function selectClient(name: string) {
    router.push(`/admin/clients?client=${encodeURIComponent(name)}&mode=month&period=${thisMonthStr()}`)
  }

  function setPeriod(newPeriod: string) {
    if (!selectedClientName) return
    router.push(`/admin/clients?client=${encodeURIComponent(selectedClientName)}&mode=month&period=${newPeriod}`)
  }

  function setQuick(q: 'this' | 'last' | 'all') {
    if (!selectedClientName) return
    if (q === 'all')  router.push(`/admin/clients?client=${encodeURIComponent(selectedClientName)}&mode=all`)
    if (q === 'this') router.push(`/admin/clients?client=${encodeURIComponent(selectedClientName)}&mode=month&period=${thisMonthStr()}`)
    if (q === 'last') router.push(`/admin/clients?client=${encodeURIComponent(selectedClientName)}&mode=month&period=${prevMonthStr()}`)
  }

  const activeQuick: 'this' | 'last' | 'all' | null =
    mode === 'all' ? 'all'
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
    <div style={{ display: 'flex', height: '100vh', overflow: 'hidden', background: '#F8F9FB' }}>

      {/* ── LEFT PANEL ──────────────────────────────────────────────────── */}
      <div style={{
        width: 300, flexShrink: 0, borderRight: '1px solid #EBEDF2',
        background: '#FFFFFF', display: 'flex', flexDirection: 'column', overflow: 'hidden',
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
          </div>

          {/* Search */}
          <div style={{ position: 'relative' }}>
            <Search size={12} style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', color: '#9CA3AF' }} />
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
                <X size={11} style={{ color: '#9CA3AF' }} />
              </button>
            )}
          </div>
        </div>

        {/* Client list — virtual summary + 3 real sections */}
        <div style={{ flex: 1, overflowY: 'auto', padding: '10px 12px', display: 'flex', flexDirection: 'column', gap: 2 }}>
          {filteredInternal.length === 0 && filteredActive.length === 0 && filteredPast.length === 0 && (
            <p style={{ fontSize: 12, color: '#9CA3AF', textAlign: 'center', padding: '24px 0' }}>No clients found</p>
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
                          <p style={{ fontSize: 12, fontWeight: 800, color: isSel ? vc.color : '#374151', margin: 0, fontFamily: 'var(--font-jakarta)' }}>
                            {vc.label}
                          </p>
                          <p style={{ fontSize: 10, color: '#9CA3AF', margin: '1px 0 0' }}>{vc.sub}</p>
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
              <p style={{ fontSize: 9, fontWeight: 800, color: '#9CA3AF', textTransform: 'uppercase', letterSpacing: '0.1em', margin: '6px 4px 4px' }}>
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
              <p style={{ fontSize: 9, fontWeight: 800, color: '#9CA3AF', textTransform: 'uppercase', letterSpacing: '0.1em', margin: '6px 4px 4px' }}>
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
      <div style={{ flex: 1, overflowY: 'auto', display: 'flex', flexDirection: 'column' }}>

        {/* No client selected */}
        {!selectedClientName && (
          <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', flexDirection: 'column', gap: 12, minHeight: '60vh' }}>
            <div style={{ fontSize: 48 }}>👈</div>
            <p style={{ fontSize: 15, fontWeight: 700, color: '#374151', margin: 0 }}>Select a client</p>
            <p style={{ fontSize: 13, color: '#9CA3AF', margin: 0 }}>Pick a client from the left to see their deliverables and costs</p>
          </div>
        )}

        {/* Client selected */}
        {selectedClientName && selectedClientRow && (
          <div style={{ padding: '24px 28px 48px', display: 'flex', flexDirection: 'column', gap: 20 }}>

            {/* ── Client header ────────────────────────────────────────── */}
            <div style={{
              background: 'linear-gradient(135deg, #DE1A1A 0%, #7F1D1D 100%)',
              borderRadius: 20, padding: '20px 24px',
              display: 'flex', alignItems: 'center', gap: 16,
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
              <div style={{ flex: 1, minWidth: 0, position: 'relative' }}>
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
                    [
                      selectedClientRow.industry,
                      selectedClientRow.location ? `📍 ${selectedClientRow.location}` : null,
                      selectedClientRow.package_name ? `📦 ${selectedClientRow.package_name}` : null,
                      selectedClientRow.service,
                    ].filter(Boolean).map((item, i) => (
                      <span key={i} style={{ fontSize: 12, color: 'rgba(255,255,255,0.85)', fontWeight: 500 }}>{item}</span>
                    ))
                  )}
                </div>
              </div>
              <span style={{
                fontSize: 10, fontWeight: 700, padding: '4px 12px', borderRadius: 20, flexShrink: 0,
                background: selectedClientRow.status === 'active' ? 'rgba(34,197,94,0.3)' : 'rgba(255,255,255,0.15)',
                color: '#FFF', border: '1px solid rgba(255,255,255,0.3)',
              }}>
                {selectedClientRow.status === 'active' ? 'Active' : 'Past'}
              </span>
            </div>

            {/* ── Date filter ──────────────────────────────────────────── */}
            <div style={{
              background: '#FFFFFF', borderRadius: 14, padding: '14px 18px',
              border: '1px solid #EBEDF2', display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap',
            }}>
              {/* Quick buttons */}
              {([
                { key: 'this', label: 'This Month' },
                { key: 'last', label: 'Last Month' },
                { key: 'all',  label: 'All Time'   },
              ] as const).map(({ key, label }) => (
                <button key={key} onClick={() => setQuick(key)} style={{
                  padding: '7px 16px', borderRadius: 9, fontSize: 12, fontWeight: 700,
                  border: activeQuick === key ? '1.5px solid #DE1A1A' : '1.5px solid #E5E7EB',
                  cursor: 'pointer', transition: 'all 0.15s',
                  background: activeQuick === key ? 'rgba(222,26,26,0.06)' : '#F9FAFB',
                  color: activeQuick === key ? '#DE1A1A' : '#6B7280',
                }}>
                  {label}
                </button>
              ))}

              <div style={{ width: 1, height: 24, background: '#E5E7EB', margin: '0 4px' }} />

              {/* Month picker */}
              <input
                type="month"
                value={mode === 'all' ? today.slice(0, 7) : period.slice(0, 7)}
                max={today.slice(0, 7)}
                onChange={e => setPeriod(e.target.value)}
                style={{
                  padding: '7px 12px', borderRadius: 10,
                  border: activeQuick === null && mode !== 'all' ? '1.5px solid #DE1A1A' : '1.5px solid #E5E7EB',
                  fontSize: 13, fontWeight: 600, color: '#111827', background: '#F9FAFB',
                  outline: 'none', cursor: 'pointer',
                }}
              />
            </div>

            {/* ── Stat chips ───────────────────────────────────────────── */}
            {deliverables && (() => {
              const isInternal = selectedClientRow?.industry === 'Internal Brand' || selectedClientRow?.industry === '__virtual_internal__'
              const d = deliverables
              if (isInternal) {
                return (
                  <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
                    <StatChip label="Shooting" emoji="📸" hours={`${d.mediaShootHours.toFixed(1)}h`}   count={d.mediaShootCount}  color="#F97316" />
                    <StatChip label="Editing"  emoji="🎬" hours={`${d.mediaEditHours.toFixed(1)}h`}    count={d.mediaEditCount}   color="#E53935" />
                    <StatChip label="Working"  emoji="💼" hours={`${d.nonMediaWorkHours.toFixed(1)}h`}                            color="#6366F1" />
                    <StatChip label="Learning" emoji="📚" hours={`${d.totalLearningHours.toFixed(1)}h`}                           color="#0EA5E9" />
                    <StatChip label="Total"    emoji="💰" hours={fmtRupee(d.totalCost)}                                           color="#DE1A1A" isCost />
                  </div>
                )
              }
              return (
                <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
                  <StatChip label="Shooting"  emoji="📸" hours={`${d.mediaShootHours.toFixed(1)}h`}   count={d.mediaShootCount}  color="#F97316" />
                  <StatChip label="Editing"   emoji="🎬" hours={`${d.mediaEditHours.toFixed(1)}h`}    count={d.mediaEditCount}   color="#E53935" />
                  <StatChip label="Working"   emoji="💼" hours={`${d.nonMediaWorkHours.toFixed(1)}h`}                            color="#6366F1" />
                  <StatChip label="Voiceover" emoji="🎙️" hours={`${d.voiceoverHours.toFixed(1)}h`}    count={d.voiceoverCount}   color="#8B5CF6" />
                  <StatChip label="Posters"   emoji="🖼️" hours={`${d.posterHours.toFixed(1)}h`}       count={d.totalPosters}     color="#10B981" />
                  <StatChip label="Total"     emoji="💰" hours={fmtRupee(d.totalCost)}                                           color="#DE1A1A" isCost />
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
                <p style={{ fontSize: 14, fontWeight: 700, color: '#374151', margin: '0 0 6px' }}>
                  No work logged for this period
                </p>
                <p style={{ fontSize: 12, color: '#9CA3AF', margin: '0 0 16px' }}>
                  Searched {fmtDate(dateFrom)}{dateFrom !== dateTo ? ` – ${fmtDate(dateTo)}` : ''} for client name &ldquo;{selectedClientRow.name}&rdquo;
                </p>
                <div style={{ display: 'inline-flex', gap: 8, flexWrap: 'wrap', justifyContent: 'center' }}>
                  <p style={{ fontSize: 11, color: '#6B7280', margin: 0, background: '#F9FAFB', padding: '6px 14px', borderRadius: 8, border: '1px solid #E5E7EB' }}>
                    Try a different month or &ldquo;All Time&rdquo; above
                  </p>
                  <p style={{ fontSize: 11, color: '#6B7280', margin: 0, background: '#F9FAFB', padding: '6px 14px', borderRadius: 8, border: '1px solid #E5E7EB' }}>
                    Members must select &ldquo;{selectedClientRow.name}&rdquo; exactly in their daily update
                  </p>
                </div>
              </div>
            )}

            {/* ── Shoots ───────────────────────────────────────────────── */}
            {deliverables && deliverables.shoots.length > 0 && (
              <Section title="Shooting" emoji="📸" count={deliverables.shoots.length} totalCost={deliverables.shoots.reduce((s, e) => s + e.cost, 0)}>
                <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                  <TableCols showClient={showClient} />
                  <thead><tr style={{ background: '#F9FAFB' }}>
                    {['Date', ...(showClient ? ['Client'] : []), 'Member', 'Title', 'Hours', 'Cost'].map(h => <TH key={h}>{h}</TH>)}
                  </tr></thead>
                  <tbody>
                    {deliverables.shoots.map((s, i) => (
                      <tr key={i} style={{ borderBottom: '1px solid #F9FAFB' }}>
                        <td style={{ padding: '10px 14px', fontSize: 12, color: '#6B7280' }}>{fmtDate(s.date)}</td>
                        {showClient && <td style={{ padding: '10px 14px', fontSize: 11, fontWeight: 700, color: '#6366F1' }}>{s.clientName}</td>}
                        <td style={{ padding: '10px 14px', fontSize: 12, fontWeight: 600, color: '#374151' }}>{s.memberName}</td>
                        <td style={{ padding: '10px 14px', fontSize: 12, color: '#374151' }}>{s.title}</td>
                        <td style={{ padding: '10px 14px', fontSize: 12, fontWeight: 600, color: '#3B82F6' }}>{s.hours.toFixed(1)}h</td>
                        <td style={{ padding: '10px 14px', fontSize: 12, fontWeight: 700, color: '#111827' }}>{fmtRupee(s.cost)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </Section>
            )}

            {/* ── Editing (flat table) ─────────────────────────────────── */}
            {deliverables && deliverables.videoTypeGroups.length > 0 && (() => {
              const allVideos = deliverables.videoTypeGroups.flatMap(g => g.videos)
                .sort((a, b) => b.date.localeCompare(a.date))
              const totalEditCost = deliverables.videoTypeGroups.reduce((s, g) => s + g.totalCost, 0)
              return (
                <Section title="Editing" emoji="🎬" count={deliverables.totalVideos} totalCost={totalEditCost}>
                  <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                    <TableCols showClient={showClient} />
                    <thead><tr style={{ background: '#F9FAFB' }}>
                      {['Date', ...(showClient ? ['Client'] : []), 'Member', 'Title', 'Hours', 'Cost'].map(h => <TH key={h}>{h}</TH>)}
                    </tr></thead>
                    <tbody>
                      {allVideos.map((v, i) => (
                        <tr key={i} style={{ borderBottom: '1px solid #F9FAFB' }}>
                          <td style={{ padding: '10px 14px', fontSize: 12, color: '#6B7280' }}>{fmtDate(v.date)}</td>
                          {showClient && <td style={{ padding: '10px 14px', fontSize: 11, fontWeight: 700, color: '#6366F1' }}>{v.clientName}</td>}
                          <td style={{ padding: '10px 14px', fontSize: 12, fontWeight: 600, color: '#374151' }}>{v.memberName}</td>
                          <td style={{ padding: '10px 14px', fontSize: 12, color: '#374151' }}>{v.videoName}</td>
                          <td style={{ padding: '10px 14px', fontSize: 12, fontWeight: 600, color: '#3B82F6' }}>{v.timeTaken > 0 ? `${v.timeTaken}h` : '—'}</td>
                          <td style={{ padding: '10px 14px', fontSize: 12, fontWeight: 700, color: '#111827' }}>{fmtRupee(v.cost)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </Section>
              )
            })()}

            {/* ── Shared row table helper ───────────────────────────────── */}
            {deliverables && (() => {
              type FlatEntry = { date: string; clientName: string; memberName: string; title: string; hours: number; cost: number }
              function EntryTable({ entries }: { entries: FlatEntry[] }) {
                return (
                  <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                    <TableCols showClient={showClient} />
                    <thead><tr style={{ background: '#F9FAFB' }}>
                      {['Date', ...(showClient ? ['Client'] : []), 'Member', 'Title', 'Hours', 'Cost'].map(h => <TH key={h}>{h}</TH>)}
                    </tr></thead>
                    <tbody>
                      {entries.map((o, i) => (
                        <tr key={i} style={{ borderBottom: '1px solid #F9FAFB' }}>
                          <td style={{ padding: '10px 14px', fontSize: 12, color: '#6B7280' }}>{fmtDate(o.date)}</td>
                          {showClient && <td style={{ padding: '10px 14px', fontSize: 11, fontWeight: 700, color: '#6366F1' }}>{o.clientName}</td>}
                          <td style={{ padding: '10px 14px', fontSize: 12, fontWeight: 600, color: '#374151' }}>{o.memberName}</td>
                          <td style={{ padding: '10px 14px', fontSize: 12, color: '#374151' }}>{o.title}</td>
                          <td style={{ padding: '10px 14px', fontSize: 12, fontWeight: 600, color: '#3B82F6' }}>{o.hours.toFixed(1)}h</td>
                          <td style={{ padding: '10px 14px', fontSize: 12, fontWeight: 700, color: '#111827' }}>{fmtRupee(o.cost)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
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
                </>
              )
            })()}


          </div>
        )}
      </div>
    </div>
  )
}
