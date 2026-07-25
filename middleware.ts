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

  // Use getUser() — validates the token against Supabase (refreshes if needed).
  // getSession() only reads the cookie and can return a stale/expired session,
  // causing a redirect loop: middleware → dashboard → layout rejects → /login → repeat.
  // Wrapped in try/catch: a stale/invalid refresh token or a transient network blip
  // talking to Supabase throws here (AuthApiError / AuthRetryableFetchError) instead of
  // returning an error field — left unguarded, that crashes the whole middleware function
  // on every navigation, which browsers show as a bare "page couldn't load" failure.
  let user = null
  try {
    ({ data: { user } } = await supabase.auth.getUser())
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
