// Pure agenda/calendar maths for the Tracker's Schedule tab. Kept out of the components
// and unit-tested for the same reason lib/media-tracker/overview.ts is: date arithmetic
// (overdue, Today/Tomorrow, month-grid boundaries) is exactly where off-by-one bugs
// silently misreport what's due. All date math here uses local-time Date construction
// (no `Z` suffix, no `.toISOString()`) — matching how the rest of the tracker already
// treats YYYY-MM-DD strings (see `daysAgo`/`fmtDate` in media-tracker-client.tsx) — so a
// browser in any timezone doesn't shift dates by a day via UTC conversion.

export type ScheduleEntry = {
  id: string
  date: string // YYYY-MM-DD
  time: string | null // HH:mm, 24h, null = no time set
  title: string
  client: string
  accent: string
  overdue: boolean
  actions: { label: string; onClick: () => void; danger?: boolean }[]
}

export type ScheduleGroup = {
  heading: string // "Overdue" | "Today" | "Tomorrow" | "Thu, Jul 30"
  entries: ScheduleEntry[]
}

export type CalendarDay = {
  date: string // YYYY-MM-DD
  inCurrentMonth: boolean
  isToday: boolean
  entries: ScheduleEntry[]
}

function toDateString(d: Date): string {
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

function addDays(date: string, days: number): string {
  const d = new Date(date + 'T00:00:00')
  d.setDate(d.getDate() + days)
  return toDateString(d)
}

function compareEntries(a: ScheduleEntry, b: ScheduleEntry): number {
  if (a.date !== b.date) return a.date < b.date ? -1 : 1
  if (a.time === b.time) return 0
  if (a.time === null) return -1
  if (b.time === null) return 1
  return a.time < b.time ? -1 : 1
}

function formatHeadingDate(date: string): string {
  return new Date(date + 'T00:00:00').toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })
}

// Overdue entries (date < today, however old) are pulled into their own group above
// Today, regardless of how many different past dates they span — once something's
// late, which day it was due stops being the useful distinction. Everything from today
// forward gets one group per date, in order.
export function groupSchedule(entries: ScheduleEntry[], today: string): ScheduleGroup[] {
  const tomorrow = addDays(today, 1)
  const overdue = entries.filter(e => e.date < today).sort(compareEntries)
  const upcoming = entries.filter(e => e.date >= today).sort(compareEntries)

  const groups: ScheduleGroup[] = []
  if (overdue.length > 0) groups.push({ heading: 'Overdue', entries: overdue })

  let currentDate: string | null = null
  for (const item of upcoming) {
    if (item.date !== currentDate) {
      currentDate = item.date
      const heading = item.date === today ? 'Today' : item.date === tomorrow ? 'Tomorrow' : formatHeadingDate(item.date)
      groups.push({ heading, entries: [] })
    }
    groups[groups.length - 1].entries.push(item)
  }
  return groups
}

// Builds a 42-cell (6-week) grid starting on the Sunday on/before the 1st of `month`
// (1-12), so the grid always shows complete weeks, with a few leading/trailing days
// from adjacent months included (inCurrentMonth: false).
export function buildMonthGrid(year: number, month: number, entries: ScheduleEntry[], today: string): CalendarDay[] {
  const firstOfMonth = new Date(year, month - 1, 1)
  const startOffset = firstOfMonth.getDay() // 0 (Sun) - 6 (Sat)

  const byDate = new Map<string, ScheduleEntry[]>()
  for (const item of entries) {
    const list = byDate.get(item.date)
    if (list) list.push(item)
    else byDate.set(item.date, [item])
  }

  const days: CalendarDay[] = []
  for (let i = 0; i < 42; i++) {
    const d = new Date(year, month - 1, 1 - startOffset + i)
    const date = toDateString(d)
    days.push({
      date,
      inCurrentMonth: d.getMonth() === month - 1,
      isToday: date === today,
      entries: (byDate.get(date) ?? []).sort(compareEntries),
    })
  }
  return days
}
