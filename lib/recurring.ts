export type RecurringInterval = 'daily' | 'weekly' | 'monthly'

export function isRecurringInterval(value: string): value is RecurringInterval {
  return value === 'daily' || value === 'weekly' || value === 'monthly'
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
