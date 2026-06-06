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
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) {
    if (pathname === '/login') return supabaseResponse
    return NextResponse.redirect(new URL('/login', request.url))
  }

  if (pathname === '/login' || pathname === '/') {
    // Session is confirmed valid — decode role from the (now-fresh) token
    const { data: { session } } = await supabase.auth.getSession()
    let role: string | null = null
    try {
      role = JSON.parse(atob(session!.access_token.split('.')[1])).role ?? null
    } catch { /* ignore malformed token */ }
    const dest = (role === 'ADMIN' || role === 'FOUNDER' || role === 'CEO') ? '/admin/dashboard'
      : role === 'FREELANCER_MGR' ? '/freelancer/dashboard'
      : '/member/dashboard'
    return NextResponse.redirect(new URL(dest, request.url))
  }

  return supabaseResponse
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)'],
}
