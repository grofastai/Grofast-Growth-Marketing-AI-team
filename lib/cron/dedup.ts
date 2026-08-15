import type { SupabaseClient } from '@supabase/supabase-js'
import { todayIST } from '@/lib/utils/ist-date'

// Vercel Hobby cron has up to ~59min imprecision, so a single "fires at exactly
// 9:40 AM" entry can't be trusted — these time-sensitive nudges instead run as
// several cron entries across a short window (see vercel.json). That means the
// same route can fire 3-4x for the same person before they resolve the thing
// being nudged about, so every such route must dedupe against a same-day marker
// instead of assuming "one firing = one send".
function todayStartUtc(): string {
  return new Date(todayIST() + 'T00:00:00+05:30').toISOString()
}

export async function filterAlreadyNotifiedToday(
  admin: SupabaseClient, type: string, userIds: string[]
): Promise<Set<string>> {
  if (!userIds.length) return new Set()
  const { data } = await admin
    .from('notifications')
    .select('user_id')
    .eq('type', type)
    .gte('created_at', todayStartUtc())
    .in('user_id', userIds)
  return new Set((data ?? []).map((r: { user_id: string }) => r.user_id))
}

export interface NotifiedRow {
  userId: string
  companyId: string
  // Meta's wamid. When supplied, the row is also written with status='accepted' and the
  // recipient phone, so app/api/webhooks/whatsapp can match Meta's async delivery-status
  // events back to this send and flip it to delivered/read/failed. Without it a silently
  // dropped message is indistinguishable from a delivered one.
  providerRef?: string | null
  phone?: string | null
}

// Takes {userId, companyId} pairs (not a single shared companyId) — attendance-nudge
// and logout-nudge query MEMBER users across every company in one unscoped pass, so
// there's no single company_id to attach to the whole batch.
export async function markNotifiedToday(
  admin: SupabaseClient, type: string, rows: NotifiedRow[]
): Promise<void> {
  if (!rows.length) return
  const { error } = await admin.from('notifications').insert(
    rows.map(({ userId, companyId, providerRef, phone }) => ({
      company_id: companyId,
      user_id: userId,
      type,
      ...(providerRef ? { provider_ref: providerRef, status: 'accepted' } : {}),
      ...(phone ? { phone } : {}),
    }))
  )
  if (error) console.error(`[cron-dedup] failed to mark ${type}:`, error.message)
}
