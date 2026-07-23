export const revalidate = 30

import { createServerClient } from '@/lib/supabase/server'
import { createClient } from '@supabase/supabase-js'
import { redirect } from 'next/navigation'
import TeamClient from './team-client'

export default async function TeamPage({
  searchParams,
}: {
  searchParams: Promise<{ search?: string }>
}) {
  const { search: initialSearch } = await searchParams
  const supabase = await createServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const admin = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  )

  const { data: profile } = await admin
    .from('users')
    .select('company_id')
    .eq('id', user.id)
    .single()

  if (!profile) redirect('/login')

  const [
    { data: members, error: membersError },
    { data: pastMembers },
    { data: freelancersData },
    { data: pastFreelancersData },
    { data: assignmentRows },
    { data: workEntryDates },
    { data: teamsData },
    { data: positionsData },
    { data: userPositionRows },
    { data: freelancerPositionRows },
  ] = await Promise.all([
    admin
      .from('users')
      .select('id, name, employee_id, role, email, phone, status, team, position, created_at, employment_type, monthly_salary, hourly_rate, paid_leave_days, deleted_at, date_of_birth, joined_at, gender, passport_photo_url, drive_folder_id, is_support_handler, work_layout, is_management, is_freelancer_login, enabled_blocks, media_tracker_roles')
      .eq('company_id', profile.company_id)
      .neq('role', 'FREELANCER')
      .is('deleted_at', null)
      .order('created_at', { ascending: true }),
    admin
      .from('users')
      .select('id, name, employee_id, role, email, phone, status, team, position, created_at, employment_type, monthly_salary, hourly_rate, paid_leave_days, deleted_at, date_of_birth, joined_at, gender, passport_photo_url, drive_folder_id')
      .eq('company_id', profile.company_id)
      .not('deleted_at', 'is', null)
      .order('deleted_at', { ascending: false }),
    admin
      .from('freelancers')
      .select('id, name, type, team, phone, upi_id, rating, status, cost_per_minute, cost_per_video, cost_per_hour, voice_type, editing_software, created_at, gender, title')
      .eq('company_id', profile.company_id)
      .eq('status', 'active')
      .order('name'),
    admin
      .from('freelancers')
      .select('id, name, type, team, phone, upi_id, rating, status, cost_per_minute, cost_per_video, cost_per_hour, voice_type, editing_software, created_at, gender, title')
      .eq('company_id', profile.company_id)
      .eq('status', 'inactive')
      .order('name'),
    admin
      .from('freelancer_assignments')
      .select('user_id')
      .eq('company_id', profile.company_id),
    // No-login freelancers' "Joined" date should reflect when they actually started
    // work, not when their record was created in the system — those two drifted
    // apart badly (all bulk-added on the same day, weeks after they'd really begun).
    // Deriving it from their earliest logged work entry means it's always correct,
    // for existing freelancers and any future one, with nothing to remember to fill in.
    admin
      .from('freelancer_work_entries_v2')
      .select('freelancer_id, date_finished')
      .eq('company_id', profile.company_id)
      .order('date_finished', { ascending: true }),
    admin
      .from('teams')
      .select('id, name, scope, template_key, color, emoji, is_active, is_locked')
      .eq('company_id', profile.company_id)
      .order('sort_order')
      .order('name'),
    admin
      .from('positions')
      .select('id, name, is_active')
      .eq('company_id', profile.company_id)
      .order('sort_order')
      .order('name'),
    admin
      .from('user_positions')
      .select('user_id, position_id')
      .eq('company_id', profile.company_id),
    admin
      .from('freelancer_positions')
      .select('freelancer_id, position_id')
      .eq('company_id', profile.company_id),
  ])

  if (membersError) {
    console.error('[TeamPage] members query failed:', membersError.message)
  }

  const assignedManagerIds = [
    ...new Set((assignmentRows ?? []).map((r: { user_id: string }) => r.user_id))
  ]

  const firstWorkDateByFreelancer = new Map<string, string>()
  for (const row of (workEntryDates ?? []) as { freelancer_id: string; date_finished: string }[]) {
    if (!firstWorkDateByFreelancer.has(row.freelancer_id)) {
      firstWorkDateByFreelancer.set(row.freelancer_id, row.date_finished)
    }
  }
  const withFirstWorkDate = <T extends { id: string }>(rows: T[] | null) =>
    (rows ?? []).map(f => ({ ...f, first_work_date: firstWorkDateByFreelancer.get(f.id) ?? null }))

  const positionIdsByUser: Record<string, string[]> = {}
  for (const row of (userPositionRows ?? []) as { user_id: string; position_id: string }[]) {
    (positionIdsByUser[row.user_id] ??= []).push(row.position_id)
  }
  const positionIdsByFreelancer: Record<string, string[]> = {}
  for (const row of (freelancerPositionRows ?? []) as { freelancer_id: string; position_id: string }[]) {
    (positionIdsByFreelancer[row.freelancer_id] ??= []).push(row.position_id)
  }

  return (
    <TeamClient
      members={members ?? []}
      pastMembers={pastMembers ?? []}
      freelancers={withFirstWorkDate(freelancersData)}
      pastFreelancers={withFirstWorkDate(pastFreelancersData)}
      initialSearch={initialSearch ?? ""}
      assignedManagerIds={assignedManagerIds}
      teams={teamsData ?? []}
      positions={positionsData ?? []}
      positionIdsByUser={positionIdsByUser}
      positionIdsByFreelancer={positionIdsByFreelancer}
    />
  )
}
