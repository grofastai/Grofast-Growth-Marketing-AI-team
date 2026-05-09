export const revalidate = 30

import { createServerClient } from '@/lib/supabase/server'
import { createClient } from '@supabase/supabase-js'
import { redirect } from 'next/navigation'
import TeamClient from './team-client'

export default async function TeamPage() {
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

  const [{ data: members, error: membersError }, { data: pastMembers }] = await Promise.all([
    admin
      .from('users')
      .select('id, name, employee_id, role, email, phone, status, team, position, created_at, employment_type, monthly_salary, hourly_rate, paid_leave_days, deleted_at, date_of_birth, joined_at')
      .eq('company_id', profile.company_id)
      .is('deleted_at', null)
      .order('created_at', { ascending: true }),
    admin
      .from('users')
      .select('id, name, employee_id, role, email, phone, status, team, position, created_at, employment_type, monthly_salary, hourly_rate, paid_leave_days, deleted_at, date_of_birth, joined_at')
      .eq('company_id', profile.company_id)
      .not('deleted_at', 'is', null)
      .order('deleted_at', { ascending: false }),
  ])

  if (membersError) {
    console.error('[TeamPage] members query failed:', membersError.message)
  }

  return <TeamClient members={members ?? []} pastMembers={pastMembers ?? []} />
}
