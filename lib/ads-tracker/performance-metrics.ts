export type AdPerformanceEntry = {
  id: string
  ad_id: string
  entry_date: string
  spend: number
  impressions: number
  reach: number
  clicks: number
  ctr: number
  results: number
  note: string | null
}

export function cpc(entry: Pick<AdPerformanceEntry, 'spend' | 'clicks'>): number | null {
  return entry.clicks > 0 ? entry.spend / entry.clicks : null
}

export function cpm(entry: Pick<AdPerformanceEntry, 'spend' | 'impressions'>): number | null {
  return entry.impressions > 0 ? (entry.spend / entry.impressions) * 1000 : null
}

export function frequency(entry: Pick<AdPerformanceEntry, 'impressions' | 'reach'>): number | null {
  return entry.reach > 0 ? entry.impressions / entry.reach : null
}

export function costPerResult(entry: Pick<AdPerformanceEntry, 'spend' | 'results'>): number | null {
  return entry.results > 0 ? entry.spend / entry.results : null
}

// Most recent by entry_date. Ties keep whichever came first in the input array
// (Array.prototype.sort is stable), which matches entries already being fetched
// ordered by entry_date descending from the database.
export function latestEntry(entries: AdPerformanceEntry[]): AdPerformanceEntry | null {
  if (entries.length === 0) return null
  return [...entries].sort((a, b) => b.entry_date.localeCompare(a.entry_date))[0]
}

export const UNDERPERFORMING_CTR_THRESHOLD = 1.0

// An ad with zero entries is never flagged — being new isn't the same as lagging.
export function isUnderperforming(entries: AdPerformanceEntry[]): boolean {
  const latest = latestEntry(entries)
  return latest !== null && latest.ctr < UNDERPERFORMING_CTR_THRESHOLD
}
