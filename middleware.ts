import { createServerClient } from '@supabase/ssr'
import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'
import type { Session } from '@supabase/supabase-js'

// Vercel stops middleware that hasn't responded within 25s and serves a bare
// 504 (MIDDLEWARE_INVOCATION_TIMEOUT). Every network call made in here has to
// finish well inside that, with margin — see the getSession() block below for
// why it makes a network call at all.
const AUTH_BUDGET_MS = 3000

const TIMED_OUT = Symbol('auth-timed-out')

export async function middleware(request: NextRequest) {
  let supabaseResponse = NextResponse.next({ request })

  // One deadline shared by every Supabase call this invocation makes. It has to
  // be shared rather than per-request: auth-js retries a failed token refresh
  // with exponential backoff for up to AUTO_REFRESH_TICK_DURATION_MS (30s), so a
  // per-attempt timeout just gets multiplied by the retry loop and still sails
  // past the 25s ceiling. A shared signal makes every retry after the deadline
  // fail instantly instead of re-dialling.
  const deadline = AbortSignal.timeout(AUTH_BUDGET_MS)
  const budgetedFetch: typeof fetch = (input, init) =>
    fetch(input, { ...init, signal: init?.signal ?? deadline })

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      global: { fetch: budgetedFetch },
      cookies: {
        getAll() {
          return request.cookies.getAll()
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) =>
            request.cookies.set(name, value)
          )
          supabaseResponse = NextResponse.next({ request })
          cookiesToSet.forEach(({ name, value, options }) =>
            supabaseResponse.cookies.set(name, value, options)
          )
        },
      },
    }
  )

  const { pathname } = request.nextUrl

  if (pathname.startsWith('/api/')) return supabaseResponse

  // getSession() decodes the JWT from the cookie locally in the common case — no
  // network — which is why it's used here instead of getUser(), which called out
  // to Supabase on nearly every click. But it is NOT always local: once the
  // access token is within EXPIRY_MARGIN_MS (90s) of expiring, it refreshes the
  // token over the network, and middleware is the only place that can persist
  // the rotated cookie, so that refresh has to stay here.
  //
  // The refresh is what produced the 504s: unbounded retries, no fetch timeout.
  // budgetedFetch caps the individual calls; this race is the hard backstop that
  // caps the whole operation, including auth-js's internal backoff sleeps.
  //
  // Security is unaffected either way: app/admin/layout.tsx, app/member/layout.tsx
  // and app/freelancer/layout.tsx each run their own authoritative getUser() and
  // redirect if it fails. That's the real boundary; this is a fast pre-filter.
  const result = await Promise.race([
    supabase.auth
      .getSession()
      .then((r) => r.data.session ?? null)
      .catch(() => null),
    new Promise<typeof TIMED_OUT>((resolve) =>
      setTimeout(() => resolve(TIMED_OUT), AUTH_BUDGET_MS + 500)
    ),
  ])

  // Supabase auth was unreachable — deliberately fall through instead of
  // redirecting to /login. A timed-out refresh says nothing about whether the
  // user is signed in, and bouncing them to /login logs a valid member out over
  // a transient network blip. The layouts above decide; they run in a Node
  // function with a 300s budget, so they can afford to wait where we can't.
  if (result === TIMED_OUT) return supabaseResponse

  const session: Session | null = result

  if (!session) {
    if (pathname === '/login') return supabaseResponse
    return NextResponse.redirect(new URL('/login', request.url))
  }

  if (pathname === '/login' || pathname === '/') {
    // Decode the role straight off the token we already hold — calling
    // getSession() a second time here risked a second refresh round trip.
    let role: string | null = null
    try {
      role = JSON.parse(atob(session.access_token.split('.')[1])).role ?? null
    } catch { /* malformed token — fall back to the member dashboard */ }
    const dest = (role === 'ADMIN' || role === 'FOUNDER' || role === 'CEO') ? '/admin/dashboard'
      : role === 'FREELANCER_MGR' ? '/freelancer/dashboard'
      : '/member/dashboard'
    return NextResponse.redirect(new URL(dest, request.url))
  }

  return supabaseResponse
}

export const config = {
  // manifest.webmanifest and sw.js are fetched without auth cookies — letting
  // middleware intercept them redirects to /login and breaks PWA install + SW.
  matcher: ['/((?!_next/static|_next/image|favicon.ico|manifest\.webmanifest|sw\.js|.*\.(?:svg|png|jpg|jpeg|gif|webp|ico)$).*)'],
}
