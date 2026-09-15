import { createServerClient as createSSRClient } from '@supabase/ssr'
import { cookies } from 'next/headers'
import { cache } from 'react'
import type { Database } from './types'

export async function createServerClient() {
  const cookieStore = await cookies()

  return createSSRClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll()
        },
        setAll(cookiesToSet) {
          try {
            cookiesToSet.forEach(({ name, value, options }) =>
              cookieStore.set(name, value, options)
            )
          } catch {
            // Ignored in Server Components — middleware handles cookie writes
          }
        },
      },
    }
  )
}

// auth.getUser() is a live network round-trip to Supabase Auth (unlike getSession(),
// which only decodes the JWT locally). Layout + page both need the verified user on
// every render, so cache() collapses repeat calls within one request into one call.
//
// Every render-time path should come through here — not call supabase.auth.getUser()
// itself. A member page load used to hit Supabase Auth four times (layout, page, and two
// helpers the layout awaits), and the two helper calls ran AFTER the layout's own call had
// already resolved, so each was a pure extra round trip. Security is unchanged: this is
// still the authoritative getUser(), just asked once per request.
//
// Outside a render (a Server Action invoked by POST) React's cache() doesn't memoize and
// simply calls through, so action behaviour is identical too.
export const getCurrentUserResult = cache(async () => {
  const supabase = await createServerClient()
  const { data: { user }, error } = await supabase.auth.getUser()
  return { user, error }
})

export const getCurrentUser = cache(async () => (await getCurrentUserResult()).user)
