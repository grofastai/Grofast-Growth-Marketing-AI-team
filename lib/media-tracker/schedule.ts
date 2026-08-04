// Pure agenda/calendar maths for the Tracker's Schedule tab. Kept out of the components
// and unit-tested for the same reason lib/media-tracker/overview.ts is: date arithmetic
// (overdue, Today/Tomorrow, month-grid boundaries) is exactly where off-by-one bugs
// silently misreport what's due. All date math here uses local-time Date construction
// (no `Z` suffix, no `.toISOString()`) — matching how the rest of the tracker already
// treats YYYY-MM-DD strings (see `daysAgo`/`fmtDate` in media-tracker-client.tsx) — so a
// browser in any timezone doesn't shift dates by a day via UTC conversion.

// Structural, minimal input for computeUpcomingSchedule below — the real ContentItem
// (in media-tracker-client.tsx) is a superset and assigns to this without conversion,
// mirroring the pattern lib/media-tracker/overview.ts's OverviewItem already uses.
export type UpcomingScheduleInput = {
  id: string
  client_name: string
  title: string
  content_type: 'video' | 'poster'
  status: 'scripting' | 'voiceover' | 'design' | 'ready_to_edit' | 'edited'
    | 'on_review' | 'branding_ready' | 'ads_ready' | 'posted' | 'cancelled'
  scheduled_post_date: string | null
  scheduled_post_time: string | null
  priority: 'low' | 'medium' | 'high' | 'urgent' | null
}
export type UpcomingScheduleItem = {
  id: string
  date: string
  time: string | null
  title: string
  client: string
  contentType: 'video' | 'poster'
  destination: 'branding' | 'ads'
  priority: 'low' | 'medium' | 'high' | 'urgent' | null
  overdue: boolean
}

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

// What the schedule badge on a Branding/Ads Ready Kanban card should say about its
// posting date. Pure and unit-tested here for the same reason the rest of this file is:
// "is this late?" is a date comparison, and getting it wrong on a card means the board
// quietly stops flagging work that's already slipped.
//
// 'none' is the normal state straight after approval, not an edge case: reaching
// Branding/Ads Ready sets no date, and one only arrives when someone uses the Schedule
// button. That's also exactly what keeps an unscheduled item off the Schedule tab.
export type ScheduleBadgeState = 'none' | 'overdue' | 'today' | 'upcoming'

export function scheduleBadgeState(scheduledDate: string | null | undefined, today: string): ScheduleBadgeState {
  if (!scheduledDate) return 'none'
  if (scheduledDate < today) return 'overdue'
  if (scheduledDate === today) return 'today'
  return 'upcoming'
}

// A compact, read-only preview of what's coming up — same "branding_ready/ads_ready with
// a scheduled_post_date" criteria the Schedule tab itself uses (see scheduledContentItems
// in media-tracker-client.tsx), for the Overview Dashboard's Upcoming Schedule section.
// Unlike ScheduleEntry, this carries no actions (Mark Posted/Reschedule) — the Overview
// links out to the Schedule tab for those instead of duplicating them inline.
export function computeUpcomingSchedule(items: UpcomingScheduleInput[], today: string, limit: number): UpcomingScheduleItem[] {
  return items
    .filter((i): i is UpcomingScheduleInput & { scheduled_post_date: string } =>
      (i.status === 'branding_ready' || i.status === 'ads_ready') && !!i.scheduled_post_date
    )
    .map(i => ({
      id: i.id,
      date: i.scheduled_post_date,
      time: i.scheduled_post_time,
      title: i.title,
      client: i.client_name,
      contentType: i.content_type,
      destination: (i.status === 'ads_ready' ? 'ads' : 'branding') as 'ads' | 'branding',
      priority: i.priority,
      overdue: i.scheduled_post_date < today,
    }))
    .sort((a, b) => {
      if (a.date !== b.date) return a.date < b.date ? -1 : 1
      if (a.time === b.time) return 0
      if (a.time === null) return -1
      if (b.time === null) return 1
      return a.time < b.time ? -1 : 1
    })
    .slice(0, limit)
}
