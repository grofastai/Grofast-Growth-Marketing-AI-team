import type { SupabaseClient } from '@supabase/supabase-js'

// Logout is mandatory: returns the date of the most recent unresolved clock-in
// before `today` (present status, clock_in set, clock_out null, and not covered
// by an approved leave for that date), or null if there's nothing to fix.
// Shared by the member web app (clockIn, getYesterdayGateStatus) and the
// WhatsApp webhook, which both insert attendance_logs rows independently.
export async function findUnresolvedLogoutDate(
  admin: SupabaseClient<any>,
  companyId: string,
  userId: string,
  today: string
): Promise<string | null> {
  const { data: openLog } = await admin
    .from('attendance_logs')
    .select('date')
    .eq('company_id', companyId)
    .eq('user_id', userId)
    .eq('status', 'present')
    .not('clock_in', 'is', null)
    .is('clock_out', null)
    .lt('date', today)
    .order('date', { ascending: false })
    .limit(1)
    .maybeSingle()

  if (!openLog) return null

  const { data: leaveOnOpenDate } = await admin
    .from('leaves')
    .select('id')
    .eq('company_id', companyId)
    .eq('user_id', userId)
    .eq('status', 'approved')
    .lte('from_date', openLog.date)
    .gte('to_date', openLog.date)
    .maybeSingle()

  return leaveOnOpenDate ? null : openLog.date
}

// A daily_updates row existing is NOT the same as the update being filed. The row can
// survive with zero entries: deleting the last entry on the History page — or moving it
// to another date — rewrites work_entries to [] and leaves the row standing. An
// existence-only check read that empty shell as "submitted" and waved the member
// through the next morning (GF009, 2026-07-13). Auto-inserted leave markers
// (_is_leave) aren't work the member reported, so they don't satisfy it either.
export function hasFiledUpdate(
  update: { work_entries?: unknown; learning_hours?: number | string | null } | null | undefined
): boolean {
  if (!update) return false
  const entries = Array.isArray(update.work_entries) ? update.work_entries : []
  if (entries.some(e => e && (e as { _is_leave?: boolean })._is_leave !== true)) return true
  return Number(update.learning_hours ?? 0) > 0
}

export type GateUpdateRow = { work_entries?: unknown; learning_hours?: number | string | null }

// How far back the update gate will chase an unfiled day. Days older than this are
// written off rather than locking someone out over ancient history.
export const UPDATE_LOOKBACK_DAYS = 60

// Picks the most recent worked day that still has no real update. Pure so it can be
// tested directly; findUnfiledUpdateDate below does the querying and calls this.
// `workedDates` must be newest-first and contain only days the member actually
// clocked in for.
export function pickUnfiledDate(
  workedDates: string[],
  updatesByDate: Map<string, GateUpdateRow>,
  leaveDates: Set<string>
): string | null {
  for (const date of workedDates) {
    if (leaveDates.has(date)) continue
    if (!hasFiledUpdate(updatesByDate.get(date))) return date
  }
  return null
}

// A day with zero entries is unfiled no matter how it got there — never submitted, or
// submitted and then emptied out by an edit/delete/move on the History page. Scanning
// back (rather than only checking yesterday) means emptying an older day re-locks the
// member until they refill it, instead of that day being silently forgiven.
export async function findUnfiledUpdateDate(
  admin: SupabaseClient<any>,
  companyId: string,
  userId: string,
  today: string
): Promise<string | null> {
  const from = new Date(today + 'T12:00:00')
  from.setDate(from.getDate() - UPDATE_LOOKBACK_DAYS)
  const fromDate = from.toISOString().split('T')[0]

  const { data: workedLogs } = await admin
    .from('attendance_logs')
    .select('date')
    .eq('company_id', companyId)
    .eq('user_id', userId)
    .eq('status', 'present')
    .not('clock_in', 'is', null)
    .lt('date', today)
    .gte('date', fromDate)
    .order('date', { ascending: false })

  const workedDates = (workedLogs ?? []).map(l => l.date as string)
  if (workedDates.length === 0) return null

  const [{ data: updates }, { data: leaves }] = await Promise.all([
    admin
      .from('daily_updates')
      .select('date, work_entries, learning_hours')
      .eq('company_id', companyId)
      .eq('user_id', userId)
      .in('date', workedDates),
    admin
      .from('leaves')
      .select('from_date, to_date')
      .eq('company_id', companyId)
      .eq('user_id', userId)
      .eq('status', 'approved')
      .gte('to_date', workedDates[workedDates.length - 1])
      .lte('from_date', workedDates[0]),
  ])

  const updatesByDate = new Map<string, GateUpdateRow>(
    (updates ?? []).map(u => [u.date as string, u as GateUpdateRow])
  )
  const leaveDates = new Set<string>()
  for (const lv of leaves ?? []) {
    for (const date of workedDates) {
      if (date >= (lv.from_date as string) && date <= (lv.to_date as string)) leaveDates.add(date)
    }
  }

  return pickUnfiledDate(workedDates, updatesByDate, leaveDates)
}

export function formatGateDate(date: string): string {
  return new Date(date + 'T12:00:00').toLocaleDateString('en-IN', {
    day: 'numeric', month: 'long', timeZone: 'Asia/Kolkata',
  })
}
