import { createServerClient } from '@supabase/ssr'
import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'

export async function middleware(request: NextRequest) {
  let supabaseResponse = NextResponse.next({ request })

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
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

  // Perf fix (2026-07-30): getSession() reads/decodes the JWT from the cookie
  // locally — no network round trip to Supabase — unlike getUser(), which was
  // making a live API call on nearly every click/navigation in the app. This
  // is safe specifically because app/admin/layout.tsx, app/member/layout.tsx,
  // and app/freelancer/layout.tsx EACH already run their own authoritative
  // getUser() check server-side and redirect if it fails — that's the real
  // security boundary, unchanged by this. The known tradeoff (previously why
  // getUser() was chosen here): a genuinely stale/expired session can pass this
  // fast local check and get one extra redirect hop (dashboard → layout rejects
  // → /login) instead of going straight to /login — a minor one-time UX blip
  // for that rare case, not a security gap and not something that affects
  // every-click latency the way the network call did.
  // Wrapped in try/catch: a malformed cookie or a transient issue reading it
  // throws here instead of returning an error field — left unguarded, that
  // crashes the whole middleware function on every navigation, which browsers
  // show as a bare "page couldn't load" failure.
  let user = null
  try {
    const { data: { session } } = await supabase.auth.getSession()
    user = session?.user ?? null
  } catch {
    user = null
  }

  if (!user) {
    if (pathname === '/login') return supabaseResponse
    return NextResponse.redirect(new URL('/login', request.url))
  }

  if (pathname === '/login' || pathname === '/') {
    // Session is confirmed valid — decode role from the (now-fresh) token
    let role: string | null = null
    try {
      const { data: { session } } = await supabase.auth.getSession()
      role = JSON.parse(atob(session!.access_token.split('.')[1])).role ?? null
    } catch { /* ignore malformed token or transient session-fetch failure */ }
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
  matcher: ['/((?!_next/static|_next/image|favicon.ico|manifest\\.webmanifest|sw\\.js|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico)$).*)'],
}
