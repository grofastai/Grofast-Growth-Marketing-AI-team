import { createClient } from '@supabase/supabase-js'

export interface AlertSummary {
  notUpdatedCount: number
  notUpdatedNames: string[]   // first 3 names for display
  overdueTaskCount: number
  overdueProjectCount: number
  total: number
}

function adminSupabase() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  )
}

export async function getAlerts(companyId: string): Promise<AlertSummary> {
  const admin = adminSupabase()
  const today = new Date().toISOString().split('T')[0]

  const [
    { data: members },
    { data: todayUpdates },
    { data: overdueTasks },
    { data: overdueProjects },
    { data: todayFullLeaves },
  ] = await Promise.all([
    admin
      .from('users')
      .select('id, name')
      .eq('company_id', companyId)
      .eq('role', 'MEMBER')
      .eq('status', 'active'),
    admin
      .from('daily_updates')
      .select('user_id')
      .eq('company_id', companyId)
      .eq('date', today),
    admin
      .from('tasks')
      .select('id')
      .eq('company_id', companyId)
      .neq('status', 'completed')
      .not('due_date', 'is', null)
      .lt('due_date', today),
    admin
      .from('projects')
      .select('id')
      .eq('company_id', companyId)
      .eq('status', 'active')
      .not('deadline', 'is', null)
      .lt('deadline', today),
    // Only exclude full_day/half_day leave — WFH and shoot_day still need to submit
    admin
      .from('leaves')
      .select('user_id')
      .eq('company_id', companyId)
      .eq('status', 'approved')
      .in('leave_type', ['full_day', 'half_day'])
      .lte('from_date', today)
      .gte('to_date', today),
  ])

  const submittedIds  = new Set((todayUpdates    ?? []).map((u: any) => u.user_id))
  const onLeaveIds    = new Set((todayFullLeaves ?? []).map((l: any) => l.user_id))
  const notUpdated = (members ?? []).filter((m: any) => !submittedIds.has(m.id) && !onLeaveIds.has(m.id))

  const overdueTaskCount = (overdueTasks ?? []).length
  const overdueProjectCount = (overdueProjects ?? []).length

  return {
    notUpdatedCount: notUpdated.length,
    notUpdatedNames: notUpdated.slice(0, 3).map((m: any) => m.name as string),
    overdueTaskCount,
    overdueProjectCount,
    total: notUpdated.length + overdueTaskCount + overdueProjectCount,
  }
}
