# Clients & Deliverables Unified Page — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace `/admin/clients` and client-analytics portions of `/admin/expenses` with a single unified page: left panel = client list, right panel = package info + deliverables breakdown (videos, posters, shoots, voice overs, costs) filterable by month or day.

**Architecture:** URL-param driven server rendering (`?client=X&mode=month&period=2026-05`). Server component fetches and computes the full breakdown; client component handles navigation only. No client-side data fetching after initial load.

**Tech Stack:** Next.js 15 App Router, Supabase service-role client, TypeScript strict, Tailwind CSS v4, inline styles (existing pattern).

---

## File Map

| File | Action |
|---|---|
| `lib/clients-deliverables.ts` | **Create** — shared types + `computeDeliverables()` pure function |
| `app/admin/clients/page.tsx` | **Rewrite** — server component reads searchParams, fetches data, calls computeDeliverables |
| `app/admin/clients/clients-unified-client.tsx` | **Create** — left panel + right panel client component |
| `app/admin/clients/clients-sheet-view.tsx` | **Delete** |
| `app/admin/clients/[id]/page.tsx` | **Delete** |
| `app/admin/clients/[id]/project-detail-client.tsx` | **Delete** |
| `app/admin/expenses/expenses-client.tsx` | **Modify** — remove tabs: analytics, profit, per_client |

---

## Task 1: Create shared types + cost utility

**Files:**
- Create: `lib/clients-deliverables.ts`

- [ ] **Step 1: Create the file with all shared types and the computeDeliverables function**

Create `lib/clients-deliverables.ts` with this exact content:

```typescript
// Shared types and computation logic for the unified clients+deliverables page.

export type PricingRate = { video_type: string; rate_per_video: number }
export type MemberUser  = { id: string; name: string; employee_id: string; hourly_rate: number | null; monthly_salary: number | null }

export type EditingVideo = {
  id?: string
  video_name?: string
  video_type?: string
  time_taken?: number
  revisions?: number
  date_given?: string
  date_finished?: string
}

export type WorkEntry = {
  client_name?: string
  task_type?: 'shoot' | 'edit' | 'upload' | 'other'
  title?: string
  start_time?: string
  end_time?: string
  duration_hours?: number
  editing_videos?: EditingVideo[]
}

export type UpdateRow = {
  id: string
  user_id: string
  date: string
  work_entries: WorkEntry[] | null
}

// ── Output types ─────────────────────────────────────────────────────────────

export type ShootEntry = {
  date: string
  memberName: string
  title: string
  hours: number
  cost: number
}

export type VideoEntry = {
  date: string
  memberName: string
  videoName: string
  videoType: string
  timeTaken: number
  revisions: number
  cost: number
}

export type VideoTypeGroup = {
  videoType: string
  count: number
  totalTimeTaken: number
  totalCost: number
  videos: VideoEntry[]
}

export type OtherWorkEntry = {
  date: string
  memberName: string
  title: string
  hours: number
  cost: number
}

export type TeamContribution = {
  userId: string
  name: string
  employeeId: string
  videoCount: number
  shootHours: number
  otherHours: number
  totalHours: number
  cost: number
}

export type DayLogEntry = {
  date: string
  memberName: string
  taskType: string
  itemCount: number
  hours: number
  cost: number
  label: string
}

export type DeliverableResult = {
  shoots: ShootEntry[]
  videoTypeGroups: VideoTypeGroup[]
  otherWork: OtherWorkEntry[]
  teamContributions: TeamContribution[]
  dayLog: DayLogEntry[]
  totalVideos: number
  totalPosters: number
  totalShootSessions: number
  totalShootHours: number
  totalCost: number
}

// ── Helpers ───────────────────────────────────────────────────────────────────

export function derivePerHour(u: MemberUser): number {
  if (u.monthly_salary && u.monthly_salary > 0) return u.monthly_salary / 25 / 9
  return u.hourly_rate ?? 0
}

export function fmtRupee(n: number) {
  return `₹${Math.round(n).toLocaleString('en-IN')}`
}

export function fmtDate(s: string) {
  return new Date(s + 'T12:00:00').toLocaleDateString('en-IN', {
    day: 'numeric', month: 'short', year: 'numeric',
  })
}

function calcVideoCost(
  video: EditingVideo,
  hourlyRate: number,
  rateMap: Record<string, number>,
): number {
  const typeRate  = rateMap[(video.video_type ?? '').toLowerCase()] ?? 0
  const laborCost = hourlyRate * (video.time_taken ?? 0)
  return typeRate + laborCost
}

// ── Main computation (pure — no side effects, no DB calls) ────────────────────

export function computeDeliverables(
  updates: UpdateRow[],
  users: MemberUser[],
  pricingRates: PricingRate[],
  clientName: string,    // exact match (case-insensitive)
  dateFrom: string,      // YYYY-MM-DD
  dateTo: string,        // YYYY-MM-DD
): DeliverableResult {
  const userMap  = new Map(users.map(u => [u.id, u]))
  const rateMap: Record<string, number> = {}
  for (const r of pricingRates) rateMap[r.video_type.toLowerCase()] = r.rate_per_video

  const shoots:    ShootEntry[]                           = []
  const videoMap:  Record<string, VideoTypeGroup>         = {}
  const otherWork: OtherWorkEntry[]                       = []
  const teamMap:   Record<string, TeamContribution>       = {}
  const dayMap:    Record<string, DayLogEntry[]>          = {}

  const nameLower = clientName.toLowerCase()

  for (const row of updates) {
    if (row.date < dateFrom || row.date > dateTo) continue
    const user = userMap.get(row.user_id)
    if (!user) continue
    const hourly = derivePerHour(user)

    for (const entry of row.work_entries ?? []) {
      if ((entry.client_name ?? '').trim().toLowerCase() !== nameLower) continue

      const hrs  = entry.duration_hours ?? 0
      const tt   = entry.task_type ?? 'other'

      // ── team accumulator ──────────────────────────────────────────────────
      if (!teamMap[user.id]) {
        teamMap[user.id] = {
          userId: user.id, name: user.name, employeeId: user.employee_id,
          videoCount: 0, shootHours: 0, otherHours: 0, totalHours: 0, cost: 0,
        }
      }
      const tm = teamMap[user.id]
      tm.totalHours += hrs

      // ── day log accumulator ───────────────────────────────────────────────
      if (!dayMap[row.date]) dayMap[row.date] = []

      if (tt === 'shoot') {
        const cost = hourly * hrs
        shoots.push({ date: row.date, memberName: user.name, title: entry.title ?? 'Shoot', hours: hrs, cost })
        tm.shootHours += hrs
        tm.cost       += cost
        dayMap[row.date].push({ date: row.date, memberName: user.name, taskType: 'shoot', itemCount: 1, hours: hrs, cost, label: entry.title ?? 'Shoot' })

      } else if (tt === 'edit') {
        let editCost = 0
        for (const v of entry.editing_videos ?? []) {
          const vType = (v.video_type ?? 'Unknown').trim()
          const vCost = calcVideoCost(v, hourly, rateMap)
          editCost += vCost
          tm.videoCount++

          if (!videoMap[vType]) videoMap[vType] = { videoType: vType, count: 0, totalTimeTaken: 0, totalCost: 0, videos: [] }
          videoMap[vType].count++
          videoMap[vType].totalTimeTaken += v.time_taken ?? 0
          videoMap[vType].totalCost      += vCost
          videoMap[vType].videos.push({
            date: row.date, memberName: user.name,
            videoName: v.video_name ?? '—', videoType: vType,
            timeTaken: v.time_taken ?? 0, revisions: v.revisions ?? 0, cost: vCost,
          })
        }
        tm.cost += editCost
        dayMap[row.date].push({ date: row.date, memberName: user.name, taskType: 'edit', itemCount: (entry.editing_videos ?? []).length, hours: hrs, cost: editCost, label: 'Editing' })

      } else {
        const cost = hourly * hrs
        otherWork.push({ date: row.date, memberName: user.name, title: entry.title ?? 'Work', hours: hrs, cost })
        tm.otherHours += hrs
        tm.cost       += cost
        dayMap[row.date].push({ date: row.date, memberName: user.name, taskType: tt, itemCount: 0, hours: hrs, cost, label: entry.title ?? 'Work' })
      }
    }
  }

  // flatten day log newest first
  const dayLog: DayLogEntry[] = Object.keys(dayMap)
    .sort((a, b) => b.localeCompare(a))
    .flatMap(d => dayMap[d])

  const videoTypeGroups = Object.values(videoMap).sort((a, b) => b.count - a.count)
  const teamContributions = Object.values(teamMap).sort((a, b) => b.totalHours - a.totalHours)

  const totalVideos       = videoTypeGroups.reduce((s, g) => s + g.count, 0)
  const posterGroup       = videoMap['poster'] ?? videoMap['Poster'] ?? null
  const totalPosters      = posterGroup?.count ?? 0
  const totalShootSessions = shoots.length
  const totalShootHours   = shoots.reduce((s, e) => s + e.hours, 0)

  const videoTotalCost    = videoTypeGroups.reduce((s, g) => s + g.totalCost, 0)
  const shootTotalCost    = shoots.reduce((s, e) => s + e.cost, 0)
  const otherTotalCost    = otherWork.reduce((s, e) => s + e.cost, 0)
  const totalCost         = videoTotalCost + shootTotalCost + otherTotalCost

  return {
    shoots: shoots.sort((a, b) => b.date.localeCompare(a.date)),
    videoTypeGroups,
    otherWork: otherWork.sort((a, b) => b.date.localeCompare(a.date)),
    teamContributions,
    dayLog,
    totalVideos,
    totalPosters,
    totalShootSessions,
    totalShootHours,
    totalCost,
  }
}
```

- [ ] **Step 2: Verify TypeScript compiles**

```bash
cd "s:/VS CODE USING CODEX/GROFAST GROWTH MARKETING AND AI SOLUTIOn" && pnpm typecheck 2>&1 | grep "error TS" | head -10
```
Expected: no output (no errors).

- [ ] **Step 3: Commit**

```bash
cd "s:/VS CODE USING CODEX/GROFAST GROWTH MARKETING AND AI SOLUTIOn" && git add lib/clients-deliverables.ts && git commit -m "feat: clients-deliverables shared types and computation utility"
```

---

## Task 2: Rewrite the server page

**Files:**
- Modify: `app/admin/clients/page.tsx` (full rewrite)

- [ ] **Step 1: Replace the entire file**

Overwrite `app/admin/clients/page.tsx` with:

```typescript
export const dynamic = 'force-dynamic'

import { createServerClient } from '@/lib/supabase/server'
import { createClient } from '@supabase/supabase-js'
import { redirect } from 'next/navigation'
import { fetchSheetClients, stripFinancialFields } from '@/lib/google/sheets'
import { syncSheetClientsToSupabase } from '@/lib/actions/clients'
import {
  computeDeliverables,
  type MemberUser,
  type PricingRate,
  type UpdateRow,
  type DeliverableResult,
} from '@/lib/clients-deliverables'
import ClientsUnifiedClient from './clients-unified-client'

function adminClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  )
}

export type ClientRow = {
  id: string
  name: string
  industry: string | null
  location: string | null
  service: string | null
  package_name: string | null
  status: string
  contact_name: string | null
}

function lastDayOfMonth(year: number, month: number): string {
  return new Date(year, month, 0).toISOString().split('T')[0]
}

export default async function ClientsUnifiedPage({
  searchParams,
}: {
  searchParams: Promise<{ client?: string; mode?: string; period?: string }>
}) {
  const { client: selectedClient, mode: rawMode, period: rawPeriod } = await searchParams

  const todayStr = new Date().toISOString().split('T')[0]
  const mode = rawMode === 'day' ? 'day' : 'month'

  // Default period
  let period = rawPeriod ?? todayStr.slice(0, 7)
  if (mode === 'month' && period.length > 7) period = period.slice(0, 7)
  if (mode === 'day'   && period.length < 10) period = todayStr

  // Date range
  let dateFrom: string
  let dateTo: string
  if (mode === 'month') {
    const [y, m] = period.split('-').map(Number)
    dateFrom = `${period}-01`
    dateTo   = lastDayOfMonth(y, m)
  } else {
    dateFrom = period
    dateTo   = period
  }

  const supabase = await createServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const admin = adminClient()
  const { data: profile } = await admin
    .from('users')
    .select('company_id, role')
    .eq('id', user.id)
    .single()
  if (!profile) redirect('/login')
  if (profile.role !== 'ADMIN') redirect('/member/dashboard')

  const cid = profile.company_id

  // ── Always: fetch client list ──────────────────────────────────────────────
  const sheetId  = process.env.GOOGLE_CLIENTS_SHEET_ID
  const sheetGid = process.env.GOOGLE_CLIENTS_SHEET_GID
  const pastGid  = process.env.GOOGLE_PAST_CLIENTS_SHEET_GID

  let activeClients: ClientRow[] = []
  let pastClients:   ClientRow[] = []

  if (sheetId) {
    const [rawActive, rawPast] = await Promise.all([
      fetchSheetClients(sheetId, sheetGid).catch(() => []),
      pastGid ? fetchSheetClients(sheetId, pastGid).catch(() => []) : Promise.resolve([]),
    ])
    const stripped       = stripFinancialFields(rawActive)
    const strippedPast   = stripFinancialFields(rawPast)

    const toRow = (c: (typeof stripped)[0], status: string): ClientRow => ({
      id:           (c.company_name || c.customer_name).toLowerCase().replace(/\s+/g, '-'),
      name:         (c.company_name || c.customer_name).trim(),
      industry:     c.industry     || null,
      location:     c.place        || null,
      service:      c.service      || null,
      package_name: c.package_name || null,
      status,
      contact_name: c.customer_name || null,
    })

    activeClients = stripped.filter(c => c.company_name || c.customer_name).map(c => toRow(c, 'active'))
    pastClients   = strippedPast.filter(c => c.company_name || c.customer_name).map(c => toRow(c, 'past'))

    // Sync to Supabase for member panel
    syncSheetClientsToSupabase(
      cid,
      activeClients.map(c => ({ name: c.name, industry: c.industry ?? undefined, location: c.location ?? undefined, service: c.service ?? undefined, package_name: c.package_name ?? undefined })),
      pastClients.map(c => ({ name: c.name, industry: c.industry ?? undefined, location: c.location ?? undefined, service: c.service ?? undefined, package_name: c.package_name ?? undefined })),
    ).catch(() => {})
  } else {
    // Supabase fallback
    const { data: dbRows } = await admin
      .from('clients')
      .select('id, name, industry, location, service, package_name, status, contact_name')
      .eq('company_id', cid)
      .order('name')
    activeClients = (dbRows ?? []).filter((c: ClientRow) => c.status === 'active')
    pastClients   = (dbRows ?? []).filter((c: ClientRow) => c.status !== 'active')
  }

  // ── Conditionally: compute deliverables for selected client ───────────────
  let deliverables: DeliverableResult | null = null
  let selectedClientRow: ClientRow | null = null

  if (selectedClient) {
    const nameLower = selectedClient.toLowerCase()
    selectedClientRow =
      [...activeClients, ...pastClients].find(c => c.name.toLowerCase() === nameLower) ?? null

    const [
      { data: updatesRaw },
      { data: usersRaw },
      { data: pricingRaw },
    ] = await Promise.all([
      admin
        .from('daily_updates')
        .select('id, user_id, date, work_entries')
        .eq('company_id', cid)
        .gte('date', dateFrom)
        .lte('date', dateTo)
        .order('date', { ascending: false }),
      admin
        .from('users')
        .select('id, name, employee_id, hourly_rate, monthly_salary')
        .eq('company_id', cid),
      admin
        .from('pricing_rates')
        .select('video_type, rate_per_video')
        .eq('company_id', cid),
    ])

    deliverables = computeDeliverables(
      (updatesRaw ?? []) as UpdateRow[],
      (usersRaw  ?? []) as MemberUser[],
      (pricingRaw ?? []) as PricingRate[],
      selectedClient,
      dateFrom,
      dateTo,
    )
  }

  return (
    <ClientsUnifiedClient
      activeClients={activeClients}
      pastClients={pastClients}
      selectedClientName={selectedClient ?? null}
      selectedClientRow={selectedClientRow}
      deliverables={deliverables}
      mode={mode}
      period={period}
      today={todayStr}
    />
  )
}
```

- [ ] **Step 2: Verify TypeScript compiles**

```bash
cd "s:/VS CODE USING CODEX/GROFAST GROWTH MARKETING AND AI SOLUTIOn" && pnpm typecheck 2>&1 | grep "error TS" | head -10
```

Expected: errors about missing `./clients-unified-client` module only (that's the next task).

- [ ] **Step 3: Commit**

```bash
cd "s:/VS CODE USING CODEX/GROFAST GROWTH MARKETING AND AI SOLUTIOn" && git add app/admin/clients/page.tsx && git commit -m "feat: clients page server component — reads searchParams, fetches + computes deliverables"
```

---

## Task 3: Create the client component

**Files:**
- Create: `app/admin/clients/clients-unified-client.tsx`

- [ ] **Step 1: Create the file**

Create `app/admin/clients/clients-unified-client.tsx` with this exact content:

```typescript
'use client'

import { useState, useMemo } from 'react'
import { useRouter } from 'next/navigation'
import { Search, ChevronDown, X } from 'lucide-react'
import type { ClientRow } from './page'
import type { DeliverableResult } from '@/lib/clients-deliverables'
import { fmtRupee, fmtDate } from '@/lib/clients-deliverables'

// ── Work type display config ──────────────────────────────────────────────────

const WORK_TYPE_CFG: Record<string, { emoji: string; color: string; bg: string }> = {
  reel:        { emoji: '🎬', color: '#E53935', bg: 'rgba(229,57,53,0.08)'   },
  short:       { emoji: '📱', color: '#F97316', bg: 'rgba(249,115,22,0.08)'  },
  'long form': { emoji: '🎞️', color: '#3B82F6', bg: 'rgba(59,130,246,0.08)'  },
  story:       { emoji: '📖', color: '#A855F7', bg: 'rgba(168,85,247,0.08)'  },
  ad:          { emoji: '📊', color: '#F59E0B', bg: 'rgba(245,158,11,0.08)'  },
  poster:      { emoji: '🖼️', color: '#10B981', bg: 'rgba(16,185,129,0.08)'  },
  'voice over':{ emoji: '🎙️', color: '#8B5CF6', bg: 'rgba(139,92,246,0.08)'  },
  design:      { emoji: '🎨', color: '#EC4899', bg: 'rgba(236,72,153,0.08)'  },
  video:       { emoji: '🎥', color: '#16A34A', bg: 'rgba(22,163,74,0.08)'   },
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
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 2 }}>
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

function StatChip({ label, value, color, bg, emoji }: {
  label: string; value: string | number; color: string; bg: string; emoji: string
}) {
  return (
    <div style={{
      background: bg, borderRadius: 14, padding: '14px 16px', border: `1px solid ${color}22`,
      display: 'flex', flexDirection: 'column', gap: 4, flex: 1, minWidth: 120,
    }}>
      <div style={{ fontSize: 20 }}>{emoji}</div>
      <p style={{ fontSize: 24, fontWeight: 900, color, margin: 0, fontFamily: 'var(--font-jakarta)', lineHeight: 1 }}>
        {value}
      </p>
      <p style={{ fontSize: 10, color: '#6B7280', margin: 0, fontWeight: 500 }}>{label}</p>
    </div>
  )
}

// ── Main component ─────────────────────────────────────────────────────────────

export default function ClientsUnifiedClient({
  activeClients, pastClients,
  selectedClientName, selectedClientRow,
  deliverables,
  mode, period, today,
}: {
  activeClients: ClientRow[]
  pastClients:   ClientRow[]
  selectedClientName: string | null
  selectedClientRow: ClientRow | null
  deliverables: DeliverableResult | null
  mode: 'month' | 'day'
  period: string
  today: string
}) {
  const router = useRouter()
  const [listTab, setListTab] = useState<'active' | 'past'>('active')
  const [search, setSearch]   = useState('')

  const allClients = listTab === 'active' ? activeClients : pastClients

  const filtered = useMemo(() => {
    const q = search.toLowerCase()
    if (!q) return allClients
    return allClients.filter(c =>
      c.name.toLowerCase().includes(q) ||
      (c.industry ?? '').toLowerCase().includes(q) ||
      (c.location ?? '').toLowerCase().includes(q)
    )
  }, [allClients, search])

  function selectClient(name: string) {
    const currentMonth = today.slice(0, 7)
    router.push(`/admin/clients?client=${encodeURIComponent(name)}&mode=month&period=${currentMonth}`)
  }

  function setMode(newMode: 'month' | 'day') {
    if (!selectedClientName) return
    const newPeriod = newMode === 'month' ? period.slice(0, 7) : today
    router.push(`/admin/clients?client=${encodeURIComponent(selectedClientName)}&mode=${newMode}&period=${newPeriod}`)
  }

  function setPeriod(newPeriod: string) {
    if (!selectedClientName) return
    router.push(`/admin/clients?client=${encodeURIComponent(selectedClientName)}&mode=${mode}&period=${newPeriod}`)
  }

  const hasData = !!deliverables && (
    deliverables.totalVideos > 0 ||
    deliverables.totalShootSessions > 0 ||
    deliverables.otherWork.length > 0
  )

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

          {/* Active / Past toggle */}
          <div style={{ display: 'flex', gap: 4, marginBottom: 10 }}>
            {(['active', 'past'] as const).map(t => (
              <button key={t} onClick={() => { setListTab(t); setSearch('') }}
                style={{
                  flex: 1, padding: '6px 0', borderRadius: 8, fontSize: 11, fontWeight: 700,
                  border: 'none', cursor: 'pointer', transition: 'all 0.15s',
                  background: listTab === t ? '#DE1A1A' : '#F3F4F6',
                  color: listTab === t ? '#FFFFFF' : '#6B7280',
                }}>
                {t === 'active' ? `Active · ${activeClients.length}` : `Past · ${pastClients.length}`}
              </button>
            ))}
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

        {/* Client list */}
        <div style={{ flex: 1, overflowY: 'auto', padding: '10px 12px', display: 'flex', flexDirection: 'column', gap: 6 }}>
          {filtered.length === 0 ? (
            <p style={{ fontSize: 12, color: '#9CA3AF', textAlign: 'center', padding: '24px 0' }}>No clients found</p>
          ) : filtered.map(c => (
            <ClientCard
              key={c.name}
              c={c}
              isSelected={selectedClientName?.toLowerCase() === c.name.toLowerCase()}
              onClick={() => selectClient(c.name)}
            />
          ))}
        </div>
      </div>

      {/* ── RIGHT PANEL ─────────────────────────────────────────────────── */}
      <div style={{ flex: 1, overflowY: 'auto', display: 'flex', flexDirection: 'column' }}>

        {/* No client selected */}
        {!selectedClientName && (
          <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', flexDirection: 'column', gap: 12 }}>
            <div style={{ fontSize: 48 }}>👈</div>
            <p style={{ fontSize: 15, fontWeight: 700, color: '#374151', margin: 0 }}>Select a client</p>
            <p style={{ fontSize: 13, color: '#9CA3AF', margin: 0 }}>Pick a client from the left to see their deliverables</p>
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
                <h2 style={{ fontSize: 22, fontWeight: 900, color: '#FFF', margin: '0 0 4px', fontFamily: 'var(--font-jakarta)' }}>
                  {selectedClientRow.name}
                </h2>
                <div style={{ display: 'flex', gap: 14, flexWrap: 'wrap' }}>
                  {[
                    selectedClientRow.industry,
                    selectedClientRow.location ? `📍 ${selectedClientRow.location}` : null,
                    selectedClientRow.package_name ? `📦 ${selectedClientRow.package_name}` : null,
                    selectedClientRow.service,
                  ].filter(Boolean).map((item, i) => (
                    <span key={i} style={{ fontSize: 12, color: 'rgba(255,255,255,0.8)', fontWeight: 500 }}>{item}</span>
                  ))}
                </div>
              </div>
              <span style={{
                fontSize: 10, fontWeight: 700, padding: '4px 12px', borderRadius: 20, flexShrink: 0,
                background: selectedClientRow.status === 'active' ? 'rgba(34,197,94,0.25)' : 'rgba(255,255,255,0.15)',
                color: '#FFF', border: '1px solid rgba(255,255,255,0.3)',
              }}>
                {selectedClientRow.status === 'active' ? 'Active' : 'Past'}
              </span>
            </div>

            {/* ── Date filter ──────────────────────────────────────────── */}
            <div style={{
              background: '#FFFFFF', borderRadius: 14, padding: '14px 18px',
              border: '1px solid #EBEDF2', display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap',
            }}>
              {/* Mode toggle */}
              <div style={{ display: 'flex', gap: 4, background: '#F3F4F6', borderRadius: 10, padding: 3 }}>
                {(['month', 'day'] as const).map(m => (
                  <button key={m} onClick={() => setMode(m)}
                    style={{
                      padding: '6px 16px', borderRadius: 8, fontSize: 12, fontWeight: 700,
                      border: 'none', cursor: 'pointer', transition: 'all 0.15s',
                      background: mode === m ? '#FFFFFF' : 'transparent',
                      color: mode === m ? '#111827' : '#6B7280',
                      boxShadow: mode === m ? '0 1px 4px rgba(0,0,0,0.1)' : 'none',
                    }}>
                    {m === 'month' ? 'Month' : 'Day'}
                  </button>
                ))}
              </div>

              {/* Date picker */}
              {mode === 'month' ? (
                <input
                  type="month"
                  value={period.slice(0, 7)}
                  max={today.slice(0, 7)}
                  onChange={e => setPeriod(e.target.value)}
                  style={{
                    padding: '7px 12px', borderRadius: 10, border: '1.5px solid #E5E7EB',
                    fontSize: 13, fontWeight: 600, color: '#111827', background: '#F9FAFB',
                    outline: 'none', cursor: 'pointer',
                  }}
                />
              ) : (
                <input
                  type="date"
                  value={period}
                  max={today}
                  onChange={e => setPeriod(e.target.value)}
                  style={{
                    padding: '7px 12px', borderRadius: 10, border: '1.5px solid #E5E7EB',
                    fontSize: 13, fontWeight: 600, color: '#111827', background: '#F9FAFB',
                    outline: 'none', cursor: 'pointer',
                  }}
                />
              )}

              <span style={{ fontSize: 12, color: '#9CA3AF', marginLeft: 'auto' }}>
                {mode === 'month' ? 'Showing full month' : 'Showing single day'}
              </span>
            </div>

            {/* ── Stat chips ───────────────────────────────────────────── */}
            {deliverables && (
              <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
                <StatChip label="Videos Edited"    value={deliverables.totalVideos}                       emoji="🎬" color="#E53935" bg="rgba(229,57,53,0.06)" />
                <StatChip label="Shoot Sessions"   value={deliverables.totalShootSessions}                emoji="📸" color="#F97316" bg="rgba(249,115,22,0.06)" />
                <StatChip label="Shoot Hours"      value={`${deliverables.totalShootHours.toFixed(1)}h`}  emoji="⏱️" color="#3B82F6" bg="rgba(59,130,246,0.06)" />
                <StatChip label="Posters"          value={deliverables.totalPosters}                      emoji="🖼️" color="#10B981" bg="rgba(16,185,129,0.06)" />
                <StatChip label="Total Cost"       value={fmtRupee(deliverables.totalCost)}               emoji="💰" color="#DE1A1A" bg="rgba(222,26,26,0.06)" />
              </div>
            )}

            {/* ── No data message ──────────────────────────────────────── */}
            {deliverables && !hasData && (
              <div style={{
                background: '#FFFFFF', borderRadius: 16, padding: '48px 24px',
                border: '1px dashed #E5E7EB', textAlign: 'center',
              }}>
                <div style={{ fontSize: 36, marginBottom: 12 }}>📭</div>
                <p style={{ fontSize: 14, fontWeight: 700, color: '#374151', margin: '0 0 4px' }}>No work logged for this period</p>
                <p style={{ fontSize: 12, color: '#9CA3AF', margin: 0 }}>
                  Make sure team members select &ldquo;{selectedClientRow.name}&rdquo; as the client in their daily updates.
                </p>
              </div>
            )}

            {/* ── Shoots section ───────────────────────────────────────── */}
            {deliverables && deliverables.shoots.length > 0 && (
              <Section title="Shoot Sessions" emoji="📸" count={deliverables.shoots.length} totalCost={deliverables.shoots.reduce((s, e) => s + e.cost, 0)}>
                <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                  <thead>
                    <tr style={{ background: '#F9FAFB' }}>
                      {['Date', 'Member', 'Title', 'Hours', 'Cost'].map(h => (
                        <th key={h} style={{ padding: '8px 14px', fontSize: 10, fontWeight: 700, color: '#9CA3AF', textAlign: 'left', borderBottom: '1px solid #F3F4F6', textTransform: 'uppercase', letterSpacing: '0.06em' }}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {deliverables.shoots.map((s, i) => (
                      <tr key={i} style={{ borderBottom: '1px solid #F9FAFB' }}>
                        <td style={{ padding: '10px 14px', fontSize: 12, color: '#6B7280' }}>{fmtDate(s.date)}</td>
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

            {/* ── Edited videos by type ────────────────────────────────── */}
            {deliverables && deliverables.videoTypeGroups.length > 0 && (
              <Section title="Edited Deliverables" emoji="🎬" count={deliverables.totalVideos} totalCost={deliverables.videoTypeGroups.reduce((s, g) => s + g.totalCost, 0)}>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 0 }}>
                  {deliverables.videoTypeGroups.map((group, gi) => {
                    const cfg = getTypeCfg(group.videoType)
                    return (
                      <div key={group.videoType}>
                        {/* Group header */}
                        <div style={{
                          display: 'flex', alignItems: 'center', gap: 10,
                          padding: '12px 14px', background: cfg.bg,
                          borderBottom: '1px solid rgba(0,0,0,0.04)',
                        }}>
                          <span style={{ fontSize: 16 }}>{cfg.emoji}</span>
                          <span style={{ fontSize: 13, fontWeight: 800, color: cfg.color, flex: 1, fontFamily: 'var(--font-jakarta)' }}>
                            {group.videoType}
                          </span>
                          <span style={{ fontSize: 11, fontWeight: 700, color: cfg.color }}>{group.count} videos</span>
                          <span style={{ fontSize: 13, fontWeight: 900, color: '#111827', minWidth: 80, textAlign: 'right', fontFamily: 'var(--font-jakarta)' }}>
                            {fmtRupee(group.totalCost)}
                          </span>
                        </div>
                        {/* Video rows */}
                        {group.videos.map((v, vi) => (
                          <div key={vi} style={{
                            display: 'grid', gridTemplateColumns: '1fr 100px 60px 60px 80px',
                            padding: '8px 14px 8px 40px', borderBottom: '1px solid #F9FAFB',
                            alignItems: 'center', gap: 8,
                          }}>
                            <span style={{ fontSize: 12, color: '#374151', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{v.videoName}</span>
                            <span style={{ fontSize: 11, color: '#9CA3AF' }}>{v.memberName.split(' ')[0]}</span>
                            <span style={{ fontSize: 11, color: '#6B7280' }}>{v.timeTaken > 0 ? `${v.timeTaken}h` : '—'}</span>
                            <span style={{ fontSize: 11, color: '#9CA3AF' }}>{v.revisions > 0 ? `${v.revisions}r` : '—'}</span>
                            <span style={{ fontSize: 11, fontWeight: 600, color: '#374151', textAlign: 'right' }}>{fmtRupee(v.cost)}</span>
                          </div>
                        ))}
                        {gi < deliverables.videoTypeGroups.length - 1 && (
                          <div style={{ height: 1, background: '#F0F1F5' }} />
                        )}
                      </div>
                    )
                  })}
                </div>
              </Section>
            )}

            {/* ── Other work ───────────────────────────────────────────── */}
            {deliverables && deliverables.otherWork.length > 0 && (
              <Section title="Other Work" emoji="💼" count={deliverables.otherWork.length} totalCost={deliverables.otherWork.reduce((s, e) => s + e.cost, 0)}>
                <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                  <thead>
                    <tr style={{ background: '#F9FAFB' }}>
                      {['Date', 'Member', 'Task', 'Hours', 'Cost'].map(h => (
                        <th key={h} style={{ padding: '8px 14px', fontSize: 10, fontWeight: 700, color: '#9CA3AF', textAlign: 'left', borderBottom: '1px solid #F3F4F6', textTransform: 'uppercase', letterSpacing: '0.06em' }}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {deliverables.otherWork.map((o, i) => (
                      <tr key={i} style={{ borderBottom: '1px solid #F9FAFB' }}>
                        <td style={{ padding: '10px 14px', fontSize: 12, color: '#6B7280' }}>{fmtDate(o.date)}</td>
                        <td style={{ padding: '10px 14px', fontSize: 12, fontWeight: 600, color: '#374151' }}>{o.memberName}</td>
                        <td style={{ padding: '10px 14px', fontSize: 12, color: '#374151' }}>{o.title}</td>
                        <td style={{ padding: '10px 14px', fontSize: 12, fontWeight: 600, color: '#3B82F6' }}>{o.hours.toFixed(1)}h</td>
                        <td style={{ padding: '10px 14px', fontSize: 12, fontWeight: 700, color: '#111827' }}>{fmtRupee(o.cost)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </Section>
            )}

            {/* ── Team contributions ───────────────────────────────────── */}
            {deliverables && deliverables.teamContributions.length > 0 && (
              <Section title="Team Contribution" emoji="👥" count={deliverables.teamContributions.length} totalCost={deliverables.totalCost}>
                <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                  <thead>
                    <tr style={{ background: '#F9FAFB' }}>
                      {['Member', 'Videos', 'Shoot Hrs', 'Total Hrs', 'Cost'].map(h => (
                        <th key={h} style={{ padding: '8px 14px', fontSize: 10, fontWeight: 700, color: '#9CA3AF', textAlign: 'left', borderBottom: '1px solid #F3F4F6', textTransform: 'uppercase', letterSpacing: '0.06em' }}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {deliverables.teamContributions.map((m, i) => (
                      <tr key={m.userId} style={{ borderBottom: '1px solid #F9FAFB' }}>
                        <td style={{ padding: '10px 14px' }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                            <div style={{ width: 28, height: 28, borderRadius: '50%', background: 'rgba(222,26,26,0.08)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                              <span style={{ fontSize: 9, fontWeight: 800, color: '#DE1A1A' }}>{ini(m.name)}</span>
                            </div>
                            <div>
                              <p style={{ fontSize: 12, fontWeight: 600, color: '#111827', margin: 0 }}>{m.name}</p>
                              <p style={{ fontSize: 10, color: '#9CA3AF', margin: 0 }}>#{m.employeeId}</p>
                            </div>
                          </div>
                        </td>
                        <td style={{ padding: '10px 14px', fontSize: 13, fontWeight: 700, color: '#E53935' }}>{m.videoCount}</td>
                        <td style={{ padding: '10px 14px', fontSize: 12, color: '#6B7280' }}>{m.shootHours.toFixed(1)}h</td>
                        <td style={{ padding: '10px 14px', fontSize: 12, fontWeight: 600, color: '#374151' }}>{m.totalHours.toFixed(1)}h</td>
                        <td style={{ padding: '10px 14px', fontSize: 13, fontWeight: 800, color: '#111827', fontFamily: 'var(--font-jakarta)' }}>{fmtRupee(m.cost)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </Section>
            )}

            {/* ── Day log ─────────────────────────────────────────────── */}
            {deliverables && deliverables.dayLog.length > 0 && (
              <Section title="Day-by-Day Log" emoji="📅" count={deliverables.dayLog.length}>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 0 }}>
                  {deliverables.dayLog.map((entry, i) => {
                    const taskColor = entry.taskType === 'shoot' ? '#F97316' : entry.taskType === 'edit' ? '#E53935' : '#6B7280'
                    const taskBg    = entry.taskType === 'shoot' ? 'rgba(249,115,22,0.08)' : entry.taskType === 'edit' ? 'rgba(229,57,53,0.08)' : 'rgba(107,114,128,0.08)'
                    return (
                      <div key={i} style={{
                        display: 'flex', alignItems: 'center', gap: 12,
                        padding: '10px 14px', borderBottom: '1px solid #F9FAFB',
                      }}>
                        <span style={{ fontSize: 11, color: '#9CA3AF', minWidth: 80, flexShrink: 0 }}>{fmtDate(entry.date)}</span>
                        <span style={{ fontSize: 11, fontWeight: 600, color: '#374151', flex: 1 }}>{entry.memberName}</span>
                        <span style={{
                          fontSize: 10, fontWeight: 700, padding: '2px 8px', borderRadius: 5,
                          background: taskBg, color: taskColor, flexShrink: 0,
                        }}>
                          {entry.taskType.toUpperCase()}
                        </span>
                        {entry.itemCount > 0 && (
                          <span style={{ fontSize: 11, color: '#6B7280', flexShrink: 0 }}>{entry.itemCount} items</span>
                        )}
                        {entry.hours > 0 && (
                          <span style={{ fontSize: 11, color: '#3B82F6', flexShrink: 0 }}>{entry.hours.toFixed(1)}h</span>
                        )}
                        <span style={{ fontSize: 12, fontWeight: 700, color: '#111827', minWidth: 60, textAlign: 'right', flexShrink: 0 }}>
                          {fmtRupee(entry.cost)}
                        </span>
                      </div>
                    )
                  })}
                </div>
              </Section>
            )}

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
```

- [ ] **Step 2: Verify TypeScript compiles cleanly**

```bash
cd "s:/VS CODE USING CODEX/GROFAST GROWTH MARKETING AND AI SOLUTIOn" && pnpm typecheck 2>&1 | grep "error TS" | head -20
```

Expected: no errors.

- [ ] **Step 3: Commit**

```bash
cd "s:/VS CODE USING CODEX/GROFAST GROWTH MARKETING AND AI SOLUTIOn" && git add app/admin/clients/clients-unified-client.tsx && git commit -m "feat: clients unified client component — left panel + deliverables right panel"
```

---

## Task 4: Delete old client files

**Files:**
- Delete: `app/admin/clients/clients-sheet-view.tsx`
- Delete: `app/admin/clients/[id]/page.tsx`
- Delete: `app/admin/clients/[id]/project-detail-client.tsx`

- [ ] **Step 1: Delete the files**

Run in PowerShell:
```powershell
Remove-Item "s:\VS CODE USING CODEX\GROFAST GROWTH MARKETING AND AI SOLUTIOn\app\admin\clients\clients-sheet-view.tsx"
Remove-Item "s:\VS CODE USING CODEX\GROFAST GROWTH MARKETING AND AI SOLUTIOn\app\admin\clients\[id]\page.tsx"
Remove-Item "s:\VS CODE USING CODEX\GROFAST GROWTH MARKETING AND AI SOLUTIOn\app\admin\clients\[id]\project-detail-client.tsx"
Remove-Item "s:\VS CODE USING CODEX\GROFAST GROWTH MARKETING AND AI SOLUTIOn\app\admin\clients\[id]\loading.tsx" -ErrorAction SilentlyContinue
```

- [ ] **Step 2: Try to remove the now-empty [id] directory**

```powershell
Remove-Item "s:\VS CODE USING CODEX\GROFAST GROWTH MARKETING AND AI SOLUTIOn\app\admin\clients\[id]" -ErrorAction SilentlyContinue
```

- [ ] **Step 3: Verify TypeScript still compiles**

```bash
cd "s:/VS CODE USING CODEX/GROFAST GROWTH MARKETING AND AI SOLUTIOn" && pnpm typecheck 2>&1 | grep "error TS" | head -10
```

Expected: no errors.

- [ ] **Step 4: Commit**

```bash
cd "s:/VS CODE USING CODEX/GROFAST GROWTH MARKETING AND AI SOLUTIOn" && git add -A && git commit -m "chore: remove old clients-sheet-view and [id] detail pages"
```

---

## Task 5: Trim expenses page — remove client analytics tabs

**Files:**
- Modify: `app/admin/expenses/expenses-client.tsx`

The goal is to remove the three tabs that are now handled by the clients page:
- `analytics` tab ("Client Analytics")
- `profit` tab ("Profitability")
- `per_client` tab ("Per Client Cost")

Keep: `claims` tab ("Expense Claims") and `team` tab ("Team Costing").

- [ ] **Step 1: Update the tab list constant**

In `app/admin/expenses/expenses-client.tsx`, find and replace the `TABS` array:

Old:
```typescript
  const TABS = [
    { id: "analytics"  as const, label: "Client Analytics" },
    { id: "claims"     as const, label: `Expense Claims${pendingClaims.length > 0 ? ` (${pendingClaims.length})` : ""}` },
    { id: "profit"     as const, label: "Profitability" },
    { id: "team"       as const, label: "Team Costing" },
    { id: "per_client" as const, label: "Per Client Cost" },
  ]
```

New:
```typescript
  const TABS = [
    { id: "claims" as const, label: `Expense Claims${pendingClaims.length > 0 ? ` (${pendingClaims.length})` : ""}` },
    { id: "team"   as const, label: "Team Costing" },
  ]
```

- [ ] **Step 2: Update the tab state type**

Find:
```typescript
  const [tab, setTab]           = useState<"analytics" | "claims" | "profit" | "team" | "per_client">("analytics")
```

Replace with:
```typescript
  const [tab, setTab] = useState<"claims" | "team">("claims")
```

- [ ] **Step 3: Remove the per-client and analytics state variables that are no longer needed**

Find and remove these lines (they're only used by the removed tabs):
```typescript
  const [clientName, setClient] = useState("")
  const [dateFrom, setFrom]     = useState("")
  const [dateTo, setTo]         = useState("")
  const [chargedAmt, setCharged]= useState("")
```

- [ ] **Step 4: Remove useMemo blocks that depended on the removed state**

Find and remove the following `useMemo` blocks (they reference `clientName`, `matchedEntries`, etc.):
- `allClients` useMemo
- `perClientCosts` useMemo
- `perClientData` useMemo
- `matchedEntries` useMemo
- `analytics` useMemo
- `totalWorkCost` useMemo
- `profitAnalysis` useMemo

Keep: `userMap`, `rateMap`, `hourlyMap`, `globalWorkCost`, `globalHours`, `totalExpenseClaims`, `approvedExpenses`, `expensesByCategory`.

- [ ] **Step 5: Remove the tab render blocks**

Find and remove all JSX blocks starting with:
- `{tab === "analytics" && (`
- `{tab === "profit" && (`
- `{tab === "per_client" && (`

Keep:
- `{tab === "claims" && (`
- `{tab === "team" && (`

- [ ] **Step 6: Update KPI cards**

Find the `kpis` array and remove the "Active Clients" KPI since that's now in the clients page. The two remaining KPIs are "Total Work Cost" and "Expense Claims". Replace:

```typescript
  const kpis = [
    { label: "Expense Claims",  value: fmtRupee(totalExpenseClaims), sub: `${pendingClaims.length} pending`, color: "#F59E0B", bg: "rgba(245,158,11,0.06)", icon: <Receipt size={16} style={{ color: "#F59E0B" }} /> },
    { label: "Approved",        value: fmtRupee(approvedExpenses),   sub: "approved claims",                 color: "#16A34A", bg: "rgba(22,163,74,0.06)",   icon: <CheckCircle2 size={16} style={{ color: "#16A34A" }} /> },
  ]
```

- [ ] **Step 7: Update the header description**

Find:
```typescript
            Per-client cost breakdown, profitability, and expense claim review
```

Replace with:
```typescript
            Expense claims review and team costing
```

- [ ] **Step 8: Verify TypeScript compiles**

```bash
cd "s:/VS CODE USING CODEX/GROFAST GROWTH MARKETING AND AI SOLUTIOn" && pnpm typecheck 2>&1 | grep "error TS" | head -20
```

Fix any remaining errors (likely unused imports — remove them from the top of expenses-client.tsx).

- [ ] **Step 9: Commit**

```bash
cd "s:/VS CODE USING CODEX/GROFAST GROWTH MARKETING AND AI SOLUTIOn" && git add app/admin/expenses/expenses-client.tsx && git commit -m "feat: trim expenses page — remove client analytics tabs, keep claims + team costing"
```

---

## Task 6: Final verification + push

- [ ] **Step 1: Full typecheck**

```bash
cd "s:/VS CODE USING CODEX/GROFAST GROWTH MARKETING AND AI SOLUTIOn" && pnpm typecheck 2>&1 | grep "error TS" | head -20
```

Expected: no output.

- [ ] **Step 2: Build check**

```bash
cd "s:/VS CODE USING CODEX/GROFAST GROWTH MARKETING AND AI SOLUTIOn" && pnpm build 2>&1 | tail -20
```

Expected: `✓ Compiled successfully` with no errors.

- [ ] **Step 3: Verify the page navigates correctly in dev**

```bash
cd "s:/VS CODE USING CODEX/GROFAST GROWTH MARKETING AND AI SOLUTIOn" && pnpm dev
```

Manual checks:
1. Navigate to `/admin/clients` — left panel shows client list
2. Click any client — URL updates to `?client=...&mode=month&period=YYYY-MM`
3. Right panel shows client header, date filter, stat chips
4. Switch Month ↔ Day toggle — URL and picker update
5. Change date — page re-fetches and re-renders
6. Navigate to `/admin/expenses` — shows only Claims + Team Costing tabs

- [ ] **Step 4: Push**

```bash
cd "s:/VS CODE USING CODEX/GROFAST GROWTH MARKETING AND AI SOLUTIOn" && git push
```

---

## Self-Review

**Spec coverage check:**

| Spec requirement | Task |
|---|---|
| Left panel: client list with search | Task 3 — `ClientCard`, search filter useMemo |
| Active / Past toggle | Task 3 — `listTab` state |
| Right panel: client header strip | Task 3 — client header section |
| Month/Day toggle + date picker | Task 3 — date filter bar |
| 5 stat chips | Task 3 — `StatChip` components |
| Shoots breakdown | Task 3 — shoots section + Task 1 — `computeDeliverables` |
| Videos by type breakdown | Task 3 — videoTypeGroups section |
| Posters counted separately | Task 1 — `totalPosters` from videoMap |
| Voice overs (shown in edited videos by type) | Task 1 — appears as a `VideoTypeGroup` if logged |
| Other work section | Task 3 — other work section |
| Team contribution table | Task 3 — team contributions section |
| Day-by-day log | Task 3 — day log section |
| Cost calculation (hours × rate) | Task 1 — `calcVideoCost` + `derivePerHour` |
| URL-param driven server rendering | Task 2 — searchParams in page.tsx |
| Delete old client files | Task 4 |
| Trim expenses page | Task 5 |
| No data state | Task 3 — `hasData` check + empty state UI |

All requirements covered. No TBDs. No placeholder steps.
