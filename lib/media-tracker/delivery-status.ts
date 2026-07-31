// Company-wide and per-client Branding roll-ups for the Overview Dashboard's Monthly
// Progress ring and Client Delivery Status table. Kept out of lib/media-tracker/overview.ts
// because these operate on the full ContentItem/ClientTarget shape (client_name, posts,
// posted_branding) rather than that module's narrower, content-agnostic OverviewItem —
// same reasoning that keeps pipeline-transitions.ts and schedule.ts as separate modules.

// Structural, minimal input types — the real ContentItem/ClientTarget (in
// media-tracker-client.tsx) are supersets and assign to these without conversion,
// mirroring the pattern used by lib/media-tracker/overview.ts's OverviewItem.
export type DeliveryItem = {
  id: string
  client_name: string
  content_type: 'video' | 'poster'
  status: 'scripting' | 'voiceover' | 'design' | 'ready_to_edit' | 'edited'
    | 'on_review' | 'branding_ready' | 'ads_ready' | 'posted' | 'cancelled'
  posted_branding: boolean
  posts: { posted_date: string; platform: string }[]
}
export type DeliveryClientTarget = {
  client_name: string
  kind: 'branding' | 'ads'
  content_type: 'video' | 'poster'
  month: string // 'YYYY-MM'
  target: number
}

export type DeliveryStatus = 'on_track' | 'behind' | 'completed'

export type MonthlyRollup = { target: number; completed: number; remaining: number; completionPct: number }
export type ClientDeliveryRow = {
  client: string
  target: number
  published: number
  editing: number
  readyToPublish: number
  remaining: number
  completionPct: number
  status: DeliveryStatus
}

function daysInMonth(month: string): number {
  const [y, m] = month.split('-').map(Number)
  return new Date(y, m, 0).getDate()
}

// How far into `month` `today` is, as a 0-100 percentage. A month entirely before today's
// month is fully elapsed (100); a month entirely after is not yet started (0) — so viewing
// a past or future month never produces a nonsensical "behind" reading.
export function monthElapsedPct(today: string, month: string): number {
  const todayMonth = today.slice(0, 7)
  if (todayMonth > month) return 100
  if (todayMonth < month) return 0
  const dayOfMonth = Number(today.slice(8, 10))
  return (dayOfMonth / daysInMonth(month)) * 100
}

// Completed once Published >= Target (and Target > 0). Otherwise On Track when completion%
// keeps pace with the % of the month elapsed so far; Behind when it trails. A zero target
// reads as On Track with nothing published (nothing owed yet) or Completed once anything
// has been published against it (there was nothing to fall behind on).
export function paceStatus(completionPct: number, elapsedPct: number, target: number, published: number): DeliveryStatus {
  if (target === 0) return published > 0 ? 'completed' : 'on_track'
  if (published >= target) return 'completed'
  return completionPct >= elapsedPct ? 'on_track' : 'behind'
}

function completionPctOf(published: number, target: number): number {
  if (target === 0) return published > 0 ? 100 : 0
  return (published / target) * 100
}

// Was this branding item published (to any organic platform) within `month`?
function publishedInMonth(item: DeliveryItem, month: string): boolean {
  if (!item.posted_branding) return false
  return item.posts.some(p => p.posted_date.slice(0, 7) === month)
}

// contentType narrows to just 'video' or 'poster' (targets and items alike); omitted or
// undefined combines both, matching the Client Delivery Status table's default view.
export function computeMonthlyBrandingRollup(
  items: DeliveryItem[], clientTargets: DeliveryClientTarget[], month: string,
  contentType?: 'video' | 'poster',
): MonthlyRollup {
  const scopedItems = contentType ? items.filter(i => i.content_type === contentType) : items
  const scopedTargets = contentType ? clientTargets.filter(t => t.content_type === contentType) : clientTargets
  const target = scopedTargets
    .filter(t => t.kind === 'branding' && t.month === month)
    .reduce((sum, t) => sum + t.target, 0)
  const completed = scopedItems.filter(i => i.status !== 'cancelled' && publishedInMonth(i, month)).length
  const remaining = Math.max(target - completed, 0)
  return { target, completed, remaining, completionPct: completionPctOf(completed, target) }
}

export function computeClientDeliveryStatus(
  items: DeliveryItem[], clientTargets: DeliveryClientTarget[], month: string, today: string,
  contentType?: 'video' | 'poster',
): ClientDeliveryRow[] {
  const scopedItems = contentType ? items.filter(i => i.content_type === contentType) : items
  const scopedTargets = contentType ? clientTargets.filter(t => t.content_type === contentType) : clientTargets

  const clients = new Set<string>()
  for (const i of scopedItems) if (i.status !== 'cancelled') clients.add(i.client_name)
  for (const t of scopedTargets) if (t.kind === 'branding' && t.month === month) clients.add(t.client_name)

  const elapsedPct = monthElapsedPct(today, month)

  return Array.from(clients).map(client => {
    const clientItems = scopedItems.filter(i => i.client_name === client && i.status !== 'cancelled')
    const target = scopedTargets
      .filter(t => t.client_name === client && t.kind === 'branding' && t.month === month)
      .reduce((sum, t) => sum + t.target, 0)
    const published = clientItems.filter(i => publishedInMonth(i, month)).length
    const editing = clientItems.filter(i => i.status === 'ready_to_edit' || i.status === 'edited').length
    const readyToPublish = clientItems.filter(i => i.status === 'branding_ready').length
    const remaining = Math.max(target - published, 0)
    const completionPct = completionPctOf(published, target)
    return {
      client, target, published, editing, readyToPublish, remaining, completionPct,
      status: paceStatus(completionPct, elapsedPct, target, published),
    }
  }).sort((a, b) => a.client.localeCompare(b.client))
}
