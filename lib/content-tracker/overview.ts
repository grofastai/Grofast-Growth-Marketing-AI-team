// Pure summary maths for the Tracker's Overview tab. Kept out of the component and
// unit-tested because the date arithmetic (overdue / this week / days-stuck) is exactly
// where off-by-one bugs silently misreport the state of the board.

export type OverviewStatus =
  | 'scripting' | 'voiceover' | 'design' | 'ready_to_edit'
  | 'editing' | 'edited' | 'on_review' | 'ready_to_post' | 'posted' | 'cancelled'
export type OverviewShootStatus = 'scheduled' | 'completed' | 'cancelled'
export type OverviewAdStatus = 'active' | 'testing' | 'paused' | 'stopped'

// Structural, minimal input types — the client component's richer ContentItem / Shoot / Ad
// are supersets and assign to these without conversion.
export type OverviewItem = {
  id: string
  content_type: 'video' | 'poster'
  status: OverviewStatus
  source: 'shoot' | 'ads_video' | 'poster'
  shot_date: string | null
  voiceover_date: string | null
  created_at: string
  scheduled_post_date: string | null
  corrections: { correction_date: string }[]
}
export type OverviewShoot = { id: string; status: OverviewShootStatus; start_time: string; created_at: string }
export type OverviewAd = { id: string; status: OverviewAdStatus; created_at: string }

export type OverviewDateRange = { from: string; to: string } // YYYY-MM-DD, inclusive

export type OverviewInput = {
  items: OverviewItem[]
  shoots: OverviewShoot[]
  ads: OverviewAd[]
  today: string // YYYY-MM-DD
  // Scopes the stage-count blocks (videos/posters/shoots/ads) to items created in this
  // window. Posting and attention stay unfiltered — those are about right-now urgency,
  // not a reporting window, so a past date range shouldn't hide an overdue post.
  range?: OverviewDateRange | null
}

export type StageCounts = Record<OverviewStatus, number>
export type PostingCounts = { dueToday: number; dueThisWeek: number; overdue: number }
export type ShootCounts = Record<OverviewShootStatus, number>
export type AdCounts = Record<OverviewAdStatus, number>

export type AttentionKind = 'overdue' | 'stuck-editing' | 'shoots-today' | 'repeat-corrections' | 'awaiting-review' | 'in-scripting'
export type AttentionTarget = { mode: 'video' | 'poster' | 'ads'; tab: 'shoots' | 'adsvideo' | 'pipeline' | 'log' | null }
export type AttentionItem = {
  kind: AttentionKind
  count: number
  label: string
  target: AttentionTarget
}

export type Overview = {
  videos: StageCounts
  posters: StageCounts
  shoots: ShootCounts
  ads: AdCounts
  posting: PostingCounts
  attention: AttentionItem[]
}

export const STUCK_EDITING_DAYS = 7
export const REPEAT_CORRECTION_THRESHOLD = 2

// All dates are YYYY-MM-DD strings, so plain string compare is a correct date compare and
// avoids timezone drift entirely. Only day-offset maths needs a Date.
function addDays(date: string, days: number): string {
  const d = new Date(date + 'T00:00:00Z')
  d.setUTCDate(d.getUTCDate() + days)
  return d.toISOString().split('T')[0]
}

function daysBetween(from: string, to: string): number {
  const a = new Date(from + 'T00:00:00Z').getTime()
  const b = new Date(to + 'T00:00:00Z').getTime()
  return Math.round((b - a) / 86400000)
}

function emptyStages(): StageCounts {
  return {
    scripting: 0, voiceover: 0, design: 0, ready_to_edit: 0,
    editing: 0, edited: 0, on_review: 0, ready_to_post: 0, posted: 0, cancelled: 0,
  }
}

function countStages(items: OverviewItem[], type: 'video' | 'poster'): StageCounts {
  const counts = emptyStages()
  for (const i of items) {
    if (i.content_type === type) counts[i.status]++
  }
  return counts
}

// When did this item most recently ENTER its current editing state? Takes the LATEST of
// every date that could mark that moment: shot_date (shoot origin), voiceover_date (ads-video
// origin), created_at (fallback for either), and any correction bounce. An item bounced back
// for a correction has an old shot_date but has only just re-entered Editing — using
// shot_date alone would wrongly flag it as stalled the moment someone returns it.
function editingSince(item: OverviewItem): string | null {
  const dates = [item.shot_date, item.voiceover_date, item.created_at.slice(0, 10), ...item.corrections.map(c => c.correction_date)]
    .filter((d): d is string => !!d)
  if (dates.length === 0) return null
  return dates.sort()[dates.length - 1]
}

function inRange(createdAt: string, range: OverviewDateRange | null | undefined): boolean {
  if (!range) return true
  const d = createdAt.slice(0, 10)
  return d >= range.from && d <= range.to
}

export function computeOverview({ items, shoots, ads, today, range }: OverviewInput): Overview {
  const weekEnd = addDays(today, 6)

  const readyWithDate = items.filter(
    (i): i is OverviewItem & { scheduled_post_date: string } =>
      i.status === 'ready_to_post' && !!i.scheduled_post_date
  )

  const posting: PostingCounts = {
    overdue: readyWithDate.filter(i => i.scheduled_post_date < today).length,
    dueToday: readyWithDate.filter(i => i.scheduled_post_date === today).length,
    // Superset that INCLUDES today, not a remainder — "this week" reads naturally as
    // "everything coming up", so today's items belong in both buckets.
    dueThisWeek: readyWithDate.filter(
      i => i.scheduled_post_date >= today && i.scheduled_post_date <= weekEnd
    ).length,
  }

  // Stage-count blocks only — scoped to the selected creation-date window, unlike
  // posting/attention below which always reflect the live, unfiltered board.
  const itemsInRange = items.filter(i => inRange(i.created_at, range))
  const shootsInRange = shoots.filter(s => inRange(s.created_at, range))
  const adsInRange = ads.filter(a => inRange(a.created_at, range))

  const shootCounts: ShootCounts = { scheduled: 0, completed: 0, cancelled: 0 }
  for (const s of shootsInRange) shootCounts[s.status]++

  const adCounts: AdCounts = { active: 0, testing: 0, paused: 0, stopped: 0 }
  for (const a of adsInRange) adCounts[a.status]++

  const stuckEditing = items.filter(i => {
    if (i.status !== 'editing') return false
    const since = editingSince(i)
    return since !== null && daysBetween(since, today) >= STUCK_EDITING_DAYS
  }).length

  const shootsToday = shoots.filter(
    s => s.status === 'scheduled' && s.start_time.split('T')[0] === today
  ).length

  const repeatCorrections = items.filter(
    i => i.corrections.length >= REPEAT_CORRECTION_THRESHOLD
  ).length

  const awaitingReview = items.filter(i => i.status === 'on_review').length
  const inScripting = items.filter(i => i.status === 'scripting' || i.status === 'voiceover').length

  // Most actionable first. Zero-count entries are omitted entirely rather than shown as
  // "0 overdue" — a clean board should look clean.
  const candidates: AttentionItem[] = [
    {
      kind: 'overdue',
      count: posting.overdue,
      label: `${posting.overdue} post${posting.overdue === 1 ? '' : 's'} overdue`,
      target: { mode: 'video', tab: 'log' },
    },
    {
      kind: 'awaiting-review',
      count: awaitingReview,
      label: `${awaitingReview} item${awaitingReview === 1 ? '' : 's'} awaiting review`,
      target: { mode: 'video', tab: 'pipeline' },
    },
    {
      kind: 'stuck-editing',
      count: stuckEditing,
      label: `${stuckEditing} item${stuckEditing === 1 ? '' : 's'} stuck in Editing ${STUCK_EDITING_DAYS}+ days`,
      target: { mode: 'video', tab: 'pipeline' },
    },
    {
      kind: 'repeat-corrections',
      count: repeatCorrections,
      label: `${repeatCorrections} item${repeatCorrections === 1 ? '' : 's'} bounced back ${REPEAT_CORRECTION_THRESHOLD}+ times`,
      target: { mode: 'video', tab: 'pipeline' },
    },
    {
      kind: 'in-scripting',
      count: inScripting,
      label: `${inScripting} ads video${inScripting === 1 ? '' : 's'} in scripting/VO`,
      target: { mode: 'video', tab: 'adsvideo' },
    },
    {
      kind: 'shoots-today',
      count: shootsToday,
      label: `${shootsToday} shoot${shootsToday === 1 ? '' : 's'} scheduled today`,
      target: { mode: 'video', tab: 'shoots' },
    },
  ]

  return {
    videos: countStages(itemsInRange, 'video'),
    posters: countStages(itemsInRange, 'poster'),
    shoots: shootCounts,
    ads: adCounts,
    posting,
    attention: candidates.filter(c => c.count > 0),
  }
}
