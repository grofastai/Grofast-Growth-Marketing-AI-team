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
// Neither is a break entry on its own — logging a single "Lunch Break" and nothing
// else is a real, repeated pattern (GF009: 2026-07-02, -07, -14) for dodging this
// check without reporting any actual work.
// hasCollabCredit: a confirmed collaboration_confirmations row for this date — being
// credited as a helper on someone else's shoot is real recorded work even though it
// never touches this member's own work_entries. Without this, a member whose entire
// day was covered by a collab credit (plus leave for the rest) gets wrongly flagged
// as having filed nothing.
export function hasFiledUpdate(
  update: { work_entries?: unknown; learning_hours?: number | string | null } | null | undefined,
  hasCollabCredit = false
): boolean {
  if (hasCollabCredit) return true
  if (!update) return false
  const entries = Array.isArray(update.work_entries) ? update.work_entries : []
  if (entries.some(e => {
    if (!e) return false
    const row = e as { _is_leave?: boolean; task_type?: string }
    return row._is_leave !== true && row.task_type !== 'break'
  })) return true
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
  leaveDates: Set<string>,
  collabDates: Set<string> = new Set()
): string | null {
  for (const date of workedDates) {
    if (leaveDates.has(date)) continue
    if (!hasFiledUpdate(updatesByDate.get(date), collabDates.has(date))) return date
  }
  return null
}

// A day with zero entries is unfiled no matter how it got there — never submitted, or
// submitted and then emptied out by an edit/delete/move on the History page. Scanning
// back (rather than only checking yesterday) means emptying an older day re-locks the
// member until they refill it, instead of that day being silently forgiven.
//
// Approved leave does NOT exempt a date here. A half-day leave only excuses its own
// slot — if attendance still shows the member present (they worked the rest of the
// day) or shows an unclaimed half_day placeholder (they never came back in for the
// half they still owed), both still need a real entry. Only a day marked 'leave'
// (full day off) or 'absent' is genuinely nothing to file, and those are excluded by
// the status filter below rather than by checking the leaves table.
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
    .in('status', ['present', 'half_day'])
    .lt('date', today)
    .gte('date', fromDate)
    .order('date', { ascending: false })

  const workedDates = (workedLogs ?? []).map(l => l.date as string)
  if (workedDates.length === 0) return null

  const { data: updates } = await admin
    .from('daily_updates')
    .select('date, work_entries, learning_hours')
    .eq('company_id', companyId)
    .eq('user_id', userId)
    .in('date', workedDates)

  const updatesByDate = new Map<string, GateUpdateRow>(
    (updates ?? []).map(u => [u.date as string, u as GateUpdateRow])
  )

  const { data: collabRows } = await admin
    .from('collaboration_confirmations')
    .select('date')
    .eq('company_id', companyId)
    .eq('collaborator_id', userId)
    .in('status', ['confirmed', 'edited_confirmed'])
    .in('date', workedDates)
  const collabDates = new Set((collabRows ?? []).map(r => r.date as string))

  return pickUnfiledDate(workedDates, updatesByDate, new Set(), collabDates)
}

export function formatGateDate(date: string): string {
  return new Date(date + 'T12:00:00').toLocaleDateString('en-IN', {
    day: 'numeric', month: 'long', timeZone: 'Asia/Kolkata',
  })
}
