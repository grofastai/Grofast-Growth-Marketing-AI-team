export const revalidate = 0

import { createServerClient } from '@/lib/supabase/server'
import { createClient } from '@supabase/supabase-js'
import { redirect } from 'next/navigation'
import { Suspense } from 'react'
import { Loader2 } from 'lucide-react'
import ActivityUpdateForm from './activity-update-form'
import { getWorkLogsForDate, type Activity } from '@/lib/actions/work-logs'

function adminSupabase() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  )
}

export default async function UpdatePage() {
  const supabase = await createServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const admin = adminSupabase()
  const today = new Date().toISOString().split('T')[0]

  const { data: profile } = await admin
    .from('users')
    .select('company_id, name, monthly_salary, hourly_rate')
    .eq('id', user.id)
    .single()

  if (!profile) redirect('/login')
  const cid = profile.company_id

  const [
    { data: activitiesRaw },
    { data: clientsRaw },
    todayData,
  ] = await Promise.all([
    admin
      .from('activities')
      .select('id, name, team_category, unit_type, emoji, sort_order')
      .eq('company_id', cid)
      .eq('is_active', true)
      .order('sort_order'),
    admin
      .from('clients')
      .select('name')
      .eq('company_id', cid)
      .eq('status', 'active')
      .order('name'),
    getWorkLogsForDate(today),
  ])

  const activities = (activitiesRaw ?? []) as Activity[]
  const clientNames = (clientsRaw ?? []).map((c: { name: string }) => c.name)

  const hourlyRate = profile.monthly_salary && profile.monthly_salary > 0
    ? Math.round((profile.monthly_salary as number) / 25 / 9)
    : ((profile.hourly_rate as number) ?? 0)

  return (
    <Suspense fallback={
      <div className="flex items-center justify-center py-16">
        <Loader2 size={20} className="animate-spin" style={{ color: '#de1a1a' }} />
      </div>
    }>
      <ActivityUpdateForm
        activities={activities}
        clientNames={clientNames}
        today={today}
        userName={(profile.name as string) ?? 'Member'}
        hourlyRate={hourlyRate}
        existingLogs={todayData.logs}
        existingPosts={todayData.posts}
      />
    </Suspense>
  )
}
