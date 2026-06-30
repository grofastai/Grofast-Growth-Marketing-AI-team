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
  ] = await Promise.all([
    admin
      .from('users')
      .select('id, name, employee_id, role, email, phone, status, team, position, created_at, employment_type, monthly_salary, hourly_rate, paid_leave_days, deleted_at, date_of_birth, joined_at, gender, passport_photo_url, drive_folder_id, is_support_handler, work_layout, is_management, is_freelancer_login')
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
  ])

  if (membersError) {
    console.error('[TeamPage] members query failed:', membersError.message)
  }

  const assignedManagerIds = [
    ...new Set((assignmentRows ?? []).map((r: { user_id: string }) => r.user_id))
  ]

  return (
    <TeamClient
      members={members ?? []}
      pastMembers={pastMembers ?? []}
      freelancers={freelancersData ?? []}
      pastFreelancers={pastFreelancersData ?? []}
      initialSearch={initialSearch ?? ""}
      assignedManagerIds={assignedManagerIds}
    />
  )
}
