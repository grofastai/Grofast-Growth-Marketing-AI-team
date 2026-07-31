// Pure summary maths for the Tracker's Overview tab. Kept out of the component and
// unit-tested because the date arithmetic (overdue / this week / days-stuck) is exactly
// where off-by-one bugs silently misreport the state of the board.

export type OverviewStatus =
  | 'scripting' | 'voiceover' | 'design' | 'ready_to_edit' | 'edited'
  | 'on_review' | 'branding_ready' | 'ads_ready' | 'posted' | 'cancelled'
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
  corrections: { correction_date: string }[]
  // Added for computeTodayAndAllTime (Overview Dashboard redesign, Phase 1).
  posts: { posted_date: string; platform: string }[]
  posted_ads: boolean
  scheduled_post_date: string | null
  // Added for computeContentPipeline (Overview Dashboard redesign, Phase 1 follow-up).
  posted_branding: boolean
}
export type OverviewShoot = {
  id: string
  status: OverviewShootStatus
  start_time: string
  created_at: string
  // Added for computeContentPipeline — identifies a shoot spun off an Ads Video item,
  // mirroring shootLinkedItemIds in media-tracker-client.tsx.
  source_content_item_id: string | null
}
export type OverviewAd = {
  id: string
  status: OverviewAdStatus
  created_at: string
  // Added for computeTodayAndAllTime (Overview Dashboard redesign, Phase 1).
  launch_date: string | null
}

export type OverviewDateRange = { from: string; to: string } // YYYY-MM-DD, inclusive

export type OverviewInput = {
  items: OverviewItem[]
  shoots: OverviewShoot[]
  ads: OverviewAd[]
  today: string // YYYY-MM-DD
  // Scopes the stage-count blocks (videos/posters/shoots/ads) to items created in this
  // window. Posting and attention stay unfiltered — those are about right-now urgency,
  // not a reporting window, so a past date range shouldn't hide a waiting-to-post item.
  range?: OverviewDateRange | null
}

export type StageCounts = Record<OverviewStatus, number>
// The lane is decided at On Review now, not by a scheduled date — so "posting" is just
// how many are sitting in each Ready lane, waiting for someone to actually post them.
export type PostingCounts = { brandingWaiting: number; adsWaiting: number }
export type ShootCounts = Record<OverviewShootStatus, number>
export type AdCounts = Record<OverviewAdStatus, number>

export type AttentionKind = 'branding-waiting' | 'ads-waiting' | 'stuck-editing' | 'shoots-today' | 'repeat-corrections' | 'awaiting-review' | 'in-scripting'
export type AttentionTarget = { mode: 'video' | 'poster' | 'ads'; tab: 'shoots' | 'adsvideo' | 'pipeline' | 'log' | 'adlog' | null }
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

function daysBetween(from: string, to: string): number {
  const a = new Date(from + 'T00:00:00Z').getTime()
  const b = new Date(to + 'T00:00:00Z').getTime()
  return Math.round((b - a) / 86400000)
}

function emptyStages(): StageCounts {
  return {
    scripting: 0, voiceover: 0, design: 0, ready_to_edit: 0, edited: 0,
    on_review: 0, branding_ready: 0, ads_ready: 0, posted: 0, cancelled: 0,
  }
}

function countStages(items: OverviewItem[], type: 'video' | 'poster'): StageCounts {
  const counts = emptyStages()
  for (const i of items) {
    if (i.content_type === type) counts[i.status]++
  }
  return counts
}

// When did this item most recently ENTER its current pre-review state (Ready to Edit /
// Design)? Takes the LATEST of every date that could mark that moment: shot_date (shoot
// origin), voiceover_date (ads-video origin), created_at (fallback for either), and any
// correction bounce. An item bounced back for a correction has an old shot_date but has
// only just re-entered rework — using shot_date alone would wrongly flag it as stalled
// the moment someone returns it.
function enteredStageSince(item: OverviewItem): string | null {
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
  const posting: PostingCounts = {
    brandingWaiting: items.filter(i => i.status === 'branding_ready').length,
    adsWaiting: items.filter(i => i.status === 'ads_ready').length,
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
    if (i.status !== 'ready_to_edit' && i.status !== 'design') return false
    const since = enteredStageSince(i)
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
  // "0 waiting" — a clean board should look clean.
  const candidates: AttentionItem[] = [
    {
      kind: 'branding-waiting',
      count: posting.brandingWaiting,
      label: `${posting.brandingWaiting} video${posting.brandingWaiting === 1 ? '' : 's'} waiting to post as Branding`,
      target: { mode: 'video', tab: 'log' },
    },
    {
      kind: 'ads-waiting',
      count: posting.adsWaiting,
      label: `${posting.adsWaiting} video${posting.adsWaiting === 1 ? '' : 's'} waiting to post as Ads`,
      target: { mode: 'video', tab: 'adlog' },
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
      label: `${stuckEditing} item${stuckEditing === 1 ? '' : 's'} not edited in ${STUCK_EDITING_DAYS}+ days`,
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

// Mirrors ADS_PLATFORM_SET in media-tracker-client.tsx — kept as a small local copy
// rather than importing from the client component, matching the precedent already set
// by that constant's own comment ("Mirrors ADS_PLATFORMS in lib/actions/media-tracker.ts").
const ADS_PLATFORMS = new Set(['ads', 'meta_ads', 'google_ads'])

export type TodayAndAllTime = {
  shootsToday: number
  editingReviewsToday: number
  brandingPostsToday: number
  adsToday: number
  postedAllTime: number
  usedInAdsAllTime: number
  overdueBrandingCount: number
  adsInTestingCount: number
}

// Powers the Overview Dashboard's rail ("Today's Operations") and main-column flow line
// ("How Work Moves"). Kept separate from computeOverview() (rather than folded into its
// return type) so that function's existing return shape and tests stay untouched.
export function computeTodayAndAllTime({ items, shoots, ads, today }: OverviewInput): TodayAndAllTime {
  const shootsToday = shoots.filter(
    s => s.status === 'scheduled' && s.start_time.slice(0, 10) === today
  ).length

  const editingReviewsToday = items.filter(i => i.status === 'on_review').length

  const brandingPostsToday = items.filter(i =>
    i.posts.some(p => p.posted_date === today && !ADS_PLATFORMS.has(p.platform))
  ).length

  const adsToday = ads.filter(a => a.launch_date === today).length

  const postedAllTime = items.filter(i => i.status === 'posted').length

  const usedInAdsAllTime = items.filter(i => i.posted_ads).length

  const overdueBrandingCount = items.filter(
    i => i.status === 'branding_ready' && !!i.scheduled_post_date && i.scheduled_post_date < today
  ).length

  const adsInTestingCount = ads.filter(a => a.status === 'testing').length

  return {
    shootsToday, editingReviewsToday, brandingPostsToday, adsToday,
    postedAllTime, usedInAdsAllTime, overdueBrandingCount, adsInTestingCount,
  }
}

// Mirrors VIDEO_PIPELINE_ORDER / POSTER_PIPELINE_ORDER in media-tracker-client.tsx, minus
// 'cancelled' — every status a live (not yet posted, not cancelled) item can sit in.
const VIDEO_WIP_STATUSES = new Set<OverviewStatus>(['ready_to_edit', 'edited', 'on_review', 'branding_ready', 'ads_ready'])
const POSTER_WIP_STATUSES = new Set<OverviewStatus>(['design', 'edited', 'on_review', 'branding_ready', 'ads_ready'])

export type ContentPipeline = {
  video: { shoots: number; adsVideo: number; wip: number; brandingAllTime: number; adsAllTime: number }
  poster: { wip: number; brandingAllTime: number; adsAllTime: number }
}

// Mirrors the Video/Poster tabs' own nav-section badge counts exactly (see navSections in
// media-tracker-client.tsx), so the Overview Dashboard's "Content Pipeline" section always
// agrees with the numbers on those tabs rather than showing a different, simplified total.
export function computeContentPipeline({ items, shoots }: Pick<OverviewInput, 'items' | 'shoots'>): ContentPipeline {
  const shootLinkedItemIds = new Set(
    shoots.filter(s => s.source_content_item_id).map(s => s.source_content_item_id as string)
  )

  const adsVideo = items.filter(i =>
    i.content_type === 'video' && i.source === 'ads_video'
    && (i.status === 'voiceover' || (i.status === 'scripting' && !shootLinkedItemIds.has(i.id)))
  ).length

  return {
    video: {
      shoots: shoots.filter(s => s.status === 'scheduled').length,
      adsVideo,
      wip: items.filter(i => i.content_type === 'video' && VIDEO_WIP_STATUSES.has(i.status)).length,
      brandingAllTime: items.filter(i => i.content_type === 'video' && i.posted_branding).length,
      adsAllTime: items.filter(i => i.content_type === 'video' && i.posted_ads).length,
    },
    poster: {
      wip: items.filter(i => i.content_type === 'poster' && POSTER_WIP_STATUSES.has(i.status)).length,
      brandingAllTime: items.filter(i => i.content_type === 'poster' && i.posted_branding).length,
      adsAllTime: items.filter(i => i.content_type === 'poster' && i.posted_ads).length,
    },
  }
}
