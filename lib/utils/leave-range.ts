// Hard cap on how many calendar days a single leave/WFH/shoot request may span.
//
// Approving a leave rewrites attendance_logs for every day in its range (full day wipes
// any real clock-in on those days). On 2026-10-31 a birthday leave typed as
// 2025-10-25 → 2026-10-25 (wrong year) was approved and erased 147 days of a member's
// real attendance. Anything longer than a month has to be split into separate requests.
export const MAX_LEAVE_RANGE_DAYS = 31

// Inclusive day count between two YYYY-MM-DD dates (same date = 1).
export function leaveRangeDays(fromDate: string, toDate: string): number {
  const from = Date.parse(fromDate + 'T00:00:00Z')
  const to = Date.parse(toDate + 'T00:00:00Z')
  return Math.round((to - from) / 86_400_000) + 1
}

// null when the range is fine, otherwise the user-facing reason it's refused.
export function leaveRangeError(fromDate: string, toDate: string): string | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(fromDate) || !/^\d{4}-\d{2}-\d{2}$/.test(toDate)) return 'Invalid date'
  const days = leaveRangeDays(fromDate, toDate)
  if (Number.isNaN(days)) return 'Invalid date'
  if (days < 1) return 'From date must be on or before To date'
  if (days > MAX_LEAVE_RANGE_DAYS) {
    return `This request covers ${days} days (${fromDate} to ${toDate}). A single request can be at most ${MAX_LEAVE_RANGE_DAYS} days. Check the year, or split it into separate requests.`
  }
  return null
}
