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
  type FreelancerWorkEntry,
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
  searchParams: Promise<{ client?: string; mode?: string; period?: string; from?: string; to?: string }>
}) {
  const { client: selectedClient, mode: rawMode, period: rawPeriod, from: rawFrom, to: rawTo } = await searchParams

  const todayStr = new Date().toISOString().split('T')[0]
  const mode: 'month' | 'all' | 'custom' =
    rawMode === 'all' ? 'all' : rawMode === 'custom' ? 'custom' : 'month'

  function prevMonthStr(): string {
    const d = new Date()
    d.setDate(1)
    d.setMonth(d.getMonth() - 1)
    return d.toISOString().slice(0, 7)
  }

  let period = rawPeriod ?? todayStr.slice(0, 7)
  if (period.length > 7) period = period.slice(0, 7)

  let dateFrom: string
  let dateTo: string
  if (mode === 'all') {
    dateFrom = '2020-01-01'
    dateTo   = todayStr
  } else if (mode === 'custom') {
    dateFrom = rawFrom ?? todayStr
    dateTo   = rawTo ?? todayStr
    if (dateFrom > dateTo) [dateFrom, dateTo] = [dateTo, dateFrom]
  } else {
    const [y, m] = period.split('-').map(Number)
    dateFrom = `${period}-01`
    dateTo   = lastDayOfMonth(y, m)
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

  const INTERNAL_BRAND_ROWS: ClientRow[] = [
    { id: 'grofast-digital',  name: 'GROFAST DIGITAL',  industry: 'Internal Brand', location: null, service: null, package_name: null, status: 'active', contact_name: null },
    { id: 'grofast-ai',       name: 'GROFAST AI',        industry: 'Internal Brand', location: null, service: null, package_name: null, status: 'active', contact_name: null },
    { id: 'karthick-brands',  name: 'KARTHICK BRANDS',   industry: 'Internal Brand', location: null, service: null, package_name: null, status: 'active', contact_name: null },
  ]

  let activeClients: ClientRow[] = []
  let pastClients:   ClientRow[] = []

  if (sheetId) {
    const [rawActive, rawPast] = await Promise.all([
      fetchSheetClients(sheetId, sheetGid).catch(() => []),
      pastGid ? fetchSheetClients(sheetId, pastGid).catch(() => []) : Promise.resolve([]),
    ])
    const stripped     = stripFinancialFields(rawActive)
    const strippedPast = stripFinancialFields(rawPast)

    const toRow = (c: (typeof stripped)[0], status: string): ClientRow => ({
      id:           (c.company_name || c.customer_name).toLowerCase().replace(/\s+/g, '-'),
      name:         (c.company_name || c.customer_name).trim().replace(/\s+/g, ' '),
      industry:     c.industry     || null,
      location:     c.place        || null,
      service:      c.service      || null,
      package_name: c.package_name || null,
      status,
      contact_name: c.customer_name || null,
    })

    const sheetActive = stripped.filter(c => c.company_name || c.customer_name).map(c => toRow(c, 'active'))
    const sheetPast   = strippedPast.filter(c => c.company_name || c.customer_name).map(c => toRow(c, 'past'))

    const internalIds = new Set(INTERNAL_BRAND_ROWS.map(r => r.id))
    activeClients = [...INTERNAL_BRAND_ROWS, ...sheetActive.filter(c => !internalIds.has(c.id))]
    pastClients   = sheetPast

    syncSheetClientsToSupabase(
      cid,
      activeClients.map(c => ({ name: c.name, industry: c.industry ?? undefined, location: c.location ?? undefined, service: c.service ?? undefined, package_name: c.package_name ?? undefined })),
      pastClients.map(c => ({ name: c.name, industry: c.industry ?? undefined, location: c.location ?? undefined, service: c.service ?? undefined, package_name: c.package_name ?? undefined })),
    ).catch(() => {})
  } else {
    const { data: dbRows } = await admin
      .from('clients')
      .select('id, name, industry, location, service, package_name, status, contact_name')
      .eq('company_id', cid)
      .order('name')
    const dbActive = ((dbRows ?? []) as ClientRow[]).filter(c => c.status === 'active')
    const internalIds = new Set(INTERNAL_BRAND_ROWS.map(r => r.id))
    activeClients = [...INTERNAL_BRAND_ROWS, ...dbActive.filter(c => !internalIds.has(c.id))]
    pastClients   = ((dbRows ?? []) as ClientRow[]).filter(c => c.status !== 'active')
  }

  // ── Virtual aggregate clients ─────────────────────────────────────────────
  const regularActive = activeClients.filter(c => c.industry !== 'Internal Brand')
  const internalBrands = activeClients.filter(c => c.industry === 'Internal Brand')

  const VIRTUAL_CLIENTS: Record<string, { row: ClientRow; filter: string[] | null; isInternal: boolean }> = {
    '__all_active__': {
      row: { id: '__all_active__', name: 'All Active Clients', industry: '__virtual__', location: `${regularActive.length} clients`, service: null, package_name: null, status: 'active', contact_name: null },
      filter: regularActive.map(c => c.name),
      isInternal: false,
    },
    '__all_past__': {
      row: { id: '__all_past__', name: 'All Past Clients', industry: '__virtual__', location: `${pastClients.length} clients`, service: null, package_name: null, status: 'past', contact_name: null },
      filter: pastClients.map(c => c.name),
      isInternal: false,
    },
    '__internal__': {
      row: { id: '__internal__', name: 'All Internal Brands', industry: '__virtual_internal__', location: `${internalBrands.length} brands`, service: null, package_name: null, status: 'active', contact_name: null },
      filter: internalBrands.map(c => c.name),
      isInternal: true,
    },
  }

  // ── Conditionally: compute deliverables for selected client ───────────────
  let deliverables: DeliverableResult | null = null
  let selectedClientRow: ClientRow | null = null

  if (selectedClient) {
    const virtual = VIRTUAL_CLIENTS[selectedClient]
    if (virtual) {
      selectedClientRow = virtual.row
    } else {
      const nameLower = selectedClient.toLowerCase()
      selectedClientRow =
        [...activeClients, ...pastClients].find(c => c.name.toLowerCase() === nameLower) ?? null
    }

    const clientFilter: string | string[] | null = VIRTUAL_CLIENTS[selectedClient]?.filter
      ?? selectedClient

    // All freelancer teams with per-work cost in freelancer_work_entries_v2
    // Freelance Media Production has app login but cost entered per-work by admin (not hourly)
    const NO_LOGIN_TEAMS = [
      'Freelance Media Production',
      'Freelance Video Editing', 'Freelance Videography', 'Freelance RJ Voiceover',
      'Freelance Graphics Designer', 'Freelance Content Writer',
      'Freelance Software Development & Automation', 'Freelance Marketing & Operations',
      'Freelance AI Development & Creative Production',
    ]

    const [
      { data: updatesRaw },
      { data: usersRaw },
      { data: pricingRaw },
      { data: freelancerRaw },
    ] = await Promise.all([
      admin
        .from('daily_updates')
        .select('id, user_id, date, work_entries, learning_hours')
        .eq('company_id', cid)
        .gte('date', dateFrom)
        .lte('date', dateTo)
        .order('date', { ascending: false }),
      admin
        .from('users')
        .select('id, name, employee_id, hourly_rate, monthly_salary, team')
        .eq('company_id', cid),
      admin
        .from('pricing_rates')
        .select('video_type, rate_per_video')
        .eq('company_id', cid),
      admin
        .from('freelancer_work_entries_v2')
        .select('id, date_finished, client_name, title, amount, duration_mins, team, task_description, freelancers(name)')
        .eq('company_id', cid)
        .in('team', NO_LOGIN_TEAMS)
        .gte('date_finished', dateFrom)
        .lte('date_finished', dateTo),
    ])

    const freelancerEntries: FreelancerWorkEntry[] = (freelancerRaw ?? []).map((r: Record<string, unknown>) => ({
      id:              r.id as string,
      date_finished:   r.date_finished as string,
      client_name:     r.client_name as string,
      title:           r.title as string,
      amount:          r.amount as number,
      duration_mins:   r.duration_mins as number | null,
      team:            r.team as string,
      task_description: r.task_description as string | null,
      freelancer_name: (r.freelancers as { name: string } | null)?.name ?? 'Freelancer',
    }))

    deliverables = computeDeliverables(
      (updatesRaw ?? []) as UpdateRow[],
      (usersRaw  ?? []) as MemberUser[],
      (pricingRaw ?? []) as PricingRate[],
      clientFilter,
      dateFrom,
      dateTo,
      freelancerEntries,
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
      dateFrom={dateFrom}
      dateTo={dateTo}
    />
  )
}
