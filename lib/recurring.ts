export type RecurringInterval = 'daily' | 'weekly' | 'monthly'

export function isRecurringInterval(value: string): value is RecurringInterval {
  return value === 'daily' || value === 'weekly' || value === 'monthly'
}

// Returns fromDateStr itself if its weekday already matches, otherwise the
// next date on/after it whose weekday matches. weekday: 0=Sunday..6=Saturday
// (JS Date convention) — used to turn a "Repeats on Thursday" picker into a
// concrete starting date; every +7-day step after that naturally lands on
// the same weekday, so no separate weekday column is needed.
export function nextWeekdayOnOrAfter(fromDateStr: string, weekday: number): string {
  const [y, m, d] = fromDateStr.split('-').map(Number)
  const base = new Date(Date.UTC(y, m - 1, d))
  const diff = (weekday - base.getUTCDay() + 7) % 7
  return new Date(Date.UTC(y, m - 1, d + diff)).toISOString().slice(0, 10)
}

export type RecurringScheduleResult =
  | { ok: true; dueDate: string; until: string }
  | { ok: false; error: string }

// Resolves the anchor due date + until boundary for a recurring task from
// form input. todayStr must be the server's current date (YYYY-MM-DD) —
// only used to resolve a weekly task's starting weekday.
export function resolveRecurringSchedule(
  interval: RecurringInterval,
  formDueDate: string | null,
  formUntil: string | null,
  formWeekday: string | null,
  todayStr: string
): RecurringScheduleResult {
  let dueDate = formDueDate
  if (interval === 'weekly') {
    const weekday = formWeekday ? parseInt(formWeekday, 10) : NaN
    if (Number.isNaN(weekday) || weekday < 0 || weekday > 6) {
      return { ok: false, error: 'Pick a day of the week for a weekly task' }
    }
    dueDate = nextWeekdayOnOrAfter(todayStr, weekday)
  }
  if (!dueDate)  return { ok: false, error: 'Start date is required for a recurring task' }
  if (!formUntil) return { ok: false, error: 'Until date is required for a recurring task' }
  if (formUntil < dueDate) return { ok: false, error: 'Until date must be on or after the start date' }
  return { ok: true, dueDate, until: formUntil }
}

// Computes the next occurrence date (YYYY-MM-DD) for a recurring task, given the
// date it's currently anchored to. Monthly clamps to the last day of the target
// month when the anchor day doesn't exist there (e.g. 31st -> Feb 28/29).
export function computeNextRun(fromDateStr: string, interval: RecurringInterval): string {
  const [y, m, d] = fromDateStr.split('-').map(Number)

  if (interval === 'daily') {
    return new Date(Date.UTC(y, m - 1, d + 1)).toISOString().slice(0, 10)
  }
  if (interval === 'weekly') {
    return new Date(Date.UTC(y, m - 1, d + 7)).toISOString().slice(0, 10)
  }

  const targetMonthIndex = m - 1 + 1 // 0-based next month
  const lastDayOfTargetMonth = new Date(Date.UTC(y, targetMonthIndex + 1, 0)).getUTCDate()
  const clampedDay = Math.min(d, lastDayOfTargetMonth)
  return new Date(Date.UTC(y, targetMonthIndex, clampedDay)).toISOString().slice(0, 10)
}
