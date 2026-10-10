// WFH and Shoot Day are work arrangements, not absences — an approved one must always
// leave a real attendance_logs row behind. When it doesn't, findLastWorkingDayIssues()
// sees a day with no attendance row and no leave placeholder, reads it as AWOL, and
// throws the un-dismissable "Contact Admin" gate at the member the next morning.
//
// That is exactly what happened to GF010 (Punithrajan) on 2026-08-25: he submitted a
// shoot day at 6pm, worked 10:00–19:00 and filed five work entries, but the admin
// approved the request the following morning. The approval only auto-clocked-in when
// the leave's start date happened to equal the *approval* day, so approving one day
// late wrote nothing and locked him out. (Same silent hole on 2026-08-19.)
//
// This planner decides, per day of an approved WFH/Shoot request, what the approval
// should write. Pure so the date reasoning is testable without a database.

export type WorkDayAttendanceMode =
  // Clock in from the moment the member submitted the request — the attendance-page
  // "I'm on a shoot today" flow. Clock-out is left open; they close it themselves.
  | 'apply_time'
  // The day is already over, so there is no live session to open. Write the standard
  // 9:30 AM – 7:00 PM IST shift, matching what adminApplyLeaveOnBehalf backfills.
  | 'placeholder'

export type WorkDayAttendancePlan = { date: string; mode: WorkDayAttendanceMode }

// 9:30 AM IST and 7:00 PM IST, expressed as UTC time-of-day for a `${date} ${time}`
// timestamp literal.
export const PLACEHOLDER_CLOCK_IN_UTC  = '04:00:00+00'
export const PLACEHOLDER_CLOCK_OUT_UTC = '13:30:00+00'

// All dates are IST calendar dates (YYYY-MM-DD), which compare correctly as strings.
export function planWorkDayAttendance(
  fromDate: string,
  toDate: string,
  createdDate: string, // day the member submitted the request
  today: string        // day the admin is approving it
): WorkDayAttendancePlan[] {
  const plans: WorkDayAttendancePlan[] = []
  const cursor = new Date(fromDate + 'T12:00:00')
  const end = new Date(toDate + 'T12:00:00')

  while (cursor <= end) {
    const date = cursor.toISOString().split('T')[0]
    cursor.setDate(cursor.getDate() + 1)

    // Still ahead of us — the member will clock in on the day itself.
    if (date > today) break

    if (date < today) { plans.push({ date, mode: 'placeholder' }); continue }

    // Today. Only the same-day request flow has a meaningful apply time to clock in
    // from; a request filed in advance is left alone so the member clocks in at their
    // real start time.
    if (fromDate === today && createdDate === today) plans.push({ date, mode: 'apply_time' })
  }

  return plans
}
