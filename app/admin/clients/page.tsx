export const dynamic = 'force-dynamic'

import { createServerClient } from '@/lib/supabase/server'
import { createClient } from '@supabase/supabase-js'
import { redirect } from 'next/navigation'
import {
  computeDeliverables,
  type MemberUser,
  type PricingRate,
  type UpdateRow,
  type DeliverableResult,
  type FreelancerWorkEntry,
  type CollabConfirmationRow,
} from '@/lib/clients-deliverables'
import ClientsUnifiedClient from './clients-unified-client'
import { todayIST } from '@/lib/utils/ist-date'

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
  package_name: string | null
  status: string
  contact_name: string | null
  period: string | null
  phone: string | null
  email: string | null
  is_internal: boolean
  serviceIds: string[]
  serviceNames: string[]
}

export type ServiceOption = { id: string; name: string }

function lastDayOfMonth(year: number, month: number): string {
  return new Date(year, month, 0).toISOString().split('T')[0]
}

export default async function ClientsUnifiedPage({
  searchParams,
}: {
  searchParams: Promise<{ client?: string; mode?: string; period?: string; from?: string; to?: string }>
}) {
  const { client: selectedClient, mode: rawMode, period: rawPeriod, from: rawFrom, to: rawTo } = await searchParams

  const todayStr = todayIST()
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

  // ── Fetch client list — the database is the only source of truth now, no more
  // Google Sheet dependency. Internal Brands are real rows (is_internal = true),
  // not hardcoded — rename, add, or remove them the same way as any client.
  const [{ data: dbRows }, { data: serviceOptionsRaw }] = await Promise.all([
    admin
      .from('clients')
      .select('id, name, industry, location, package_name, status, contact_name, period, phone, email, is_internal, client_services(service_option_id, service_options(name))')
      .eq('company_id', cid)
      .order('name'),
    admin
      .from('service_options')
      .select('id, name')
      .eq('company_id', cid)
      .order('name'),
  ])

  const serviceOptions: ServiceOption[] = serviceOptionsRaw ?? []

  type DbRow = {
    id: string; name: string; industry: string | null; location: string | null
    package_name: string | null; status: string; contact_name: string | null
    period: string | null; phone: string | null; email: string | null; is_internal: boolean
    client_services: { service_option_id: string; service_options: { name: string } | { name: string }[] | null }[] | null
  }

  const allRows: ClientRow[] = ((dbRows ?? []) as DbRow[]).map(r => {
    const services = r.client_services ?? []
    return {
      id: r.id, name: r.name, industry: r.industry, location: r.location,
      package_name: r.package_name, status: r.status, contact_name: r.contact_name,
      period: r.period, phone: r.phone, email: r.email, is_internal: r.is_internal,
      serviceIds: services.map(s => s.service_option_id),
      serviceNames: services.flatMap(s => {
        const opt = s.service_options
        if (!opt) return []
        return Array.isArray(opt) ? opt.map(o => o.name) : [opt.name]
      }),
    }
  })
  const activeClients: ClientRow[] = allRows.filter(c => c.status === 'active')
  const pastClients:   ClientRow[] = allRows.filter(c => c.status !== 'active')

  // ── Virtual aggregate clients ─────────────────────────────────────────────
  const regularActive = activeClients.filter(c => !c.is_internal)
  const internalBrands = activeClients.filter(c => c.is_internal)

  const virtualRow = (id: string, name: string, industry: string, location: string, status: string): ClientRow => ({
    id, name, industry, location, package_name: null, status, contact_name: null,
    period: null, phone: null, email: null, is_internal: false, serviceIds: [], serviceNames: [],
  })

  const VIRTUAL_CLIENTS: Record<string, { row: ClientRow; filter: string[] | null; isInternal: boolean }> = {
    '__all_active__': {
      row: virtualRow('__all_active__', 'All Active Clients', '__virtual__', `${regularActive.length} clients`, 'active'),
      filter: regularActive.map(c => c.name),
      isInternal: false,
    },
    '__all_past__': {
      row: virtualRow('__all_past__', 'All Past Clients', '__virtual__', `${pastClients.length} clients`, 'past'),
      filter: pastClients.map(c => c.name),
      isInternal: false,
    },
    '__internal__': {
      row: virtualRow('__internal__', 'All Internal Brands', '__virtual_internal__', `${internalBrands.length} brands`, 'active'),
      // "Internal" is the generic client_name fallback saved by Technical/Other entries
      // with no specific client picked — must match here too, or that work silently
      // never shows up in this view at all.
      filter: [...internalBrands.map(c => c.name), 'Internal'],
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
      { data: salaryHistoryRaw },
      { data: collabRaw },
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
      admin
        .from('salary_history')
        .select('user_id, monthly_salary, effective_from')
        .eq('company_id', cid),
      // Confirmed collaboration credits — these hours live only here, not in the
      // collaborator's own work_entries, and must be added on top of the submitter's
      // entry so a client's cost reflects everyone who actually worked on it.
      admin
        .from('collaboration_confirmations')
        .select('collaborator_id, date, confirmed_hours, entry_snapshot')
        .eq('company_id', cid)
        .in('status', ['confirmed', 'edited_confirmed'])
        .gte('date', dateFrom)
        .lte('date', dateTo),
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
      salaryHistoryRaw ?? [],
      (collabRaw ?? []) as CollabConfirmationRow[],
    )
  }

  return (
    <ClientsUnifiedClient
      activeClients={activeClients}
      pastClients={pastClients}
      serviceOptions={serviceOptions}
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
