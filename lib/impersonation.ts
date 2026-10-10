import { createClient } from '@supabase/supabase-js'
import { cookies } from 'next/headers'

export const IMPERSONATE_COOKIE = 'gf_impersonate'

function adminSupabase() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  )
}

// Decides whether the gf_impersonate cookie may be honored. Kept pure so the rules
// are testable on their own — see impersonation.test.ts.
//
// The cookie is httpOnly, but httpOnly only stops JavaScript from READING it: anyone
// can still set it by hand in DevTools or with curl. So its presence proves nothing,
// and every caller must run it through here before using it as a user id.
export function resolveImpersonationTarget(args: {
  selfId: string
  selfRole: string | null | undefined
  selfCompanyId: string | null | undefined
  cookieValue: string | null | undefined
  targetCompanyId: string | null | undefined
}): string | null {
  const { selfId, selfRole, selfCompanyId, cookieValue, targetCompanyId } = args
  if (!cookieValue) return null
  if (cookieValue === selfId) return null
  if (selfRole !== 'ADMIN') return null
  if (!selfCompanyId) return null
  if (!targetCompanyId || targetCompanyId !== selfCompanyId) return null
  return cookieValue
}

// Returns the member id an ADMIN is currently impersonating, or null when there is no
// valid impersonation. Pass the logged-in user's own id (pages already have it from
// getUser(), so this avoids a second auth round-trip).
//
// Returns null — never throws — so a caller can always fall back to `?? user.id`.
export async function getValidImpersonationId(selfId: string): Promise<string | null> {
  const cookieValue = (await cookies()).get(IMPERSONATE_COOKIE)?.value
  // No cookie is the overwhelmingly common case; skip both queries entirely.
  if (!cookieValue || cookieValue === selfId) return null

  const admin = adminSupabase()
  const { data: self } = await admin
    .from('users').select('role, company_id').eq('id', selfId).maybeSingle()
  if (self?.role !== 'ADMIN') return null

  const { data: target } = await admin
    .from('users').select('company_id').eq('id', cookieValue).maybeSingle()

  return resolveImpersonationTarget({
    selfId,
    selfRole: self?.role as string | null | undefined,
    selfCompanyId: self?.company_id as string | null | undefined,
    cookieValue,
    targetCompanyId: target?.company_id as string | null | undefined,
  })
}
