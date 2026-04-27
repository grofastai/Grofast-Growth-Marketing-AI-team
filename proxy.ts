import { createServerClient } from '@supabase/ssr'
import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'

function parseJwtClaims(accessToken: string): Record<string, string> {
  try {
    const payload = accessToken.split('.')[1]
    return JSON.parse(atob(payload))
  } catch {
    return {}
  }
}

export async function proxy(request: NextRequest) {
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
          cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value))
          supabaseResponse = NextResponse.next({ request })
          cookiesToSet.forEach(({ name, value, options }) =>
            supabaseResponse.cookies.set(name, value, options)
          )
        },
      },
    }
  )

  const {
    data: { session },
  } = await supabase.auth.getSession()

  const pathname = request.nextUrl.pathname

  // Public routes
  if (pathname.startsWith('/api/')) return supabaseResponse

  if (!session) {
    if (pathname === '/login') return supabaseResponse
    return NextResponse.redirect(new URL('/login', request.url))
  }

  const claims = parseJwtClaims(session.access_token)
  const role = claims.role as string | undefined

  // Redirect logged-in users away from login
  if (pathname === '/login' || pathname === '/') {
    const dest = role === 'ADMIN' ? '/admin/dashboard' : '/member/dashboard'
    return NextResponse.redirect(new URL(dest, request.url))
  }

  if (pathname.startsWith('/admin') && role !== 'ADMIN') {
    return NextResponse.redirect(new URL('/member/dashboard', request.url))
  }

  if (pathname.startsWith('/member') && role !== 'MEMBER') {
    return NextResponse.redirect(new URL('/admin/dashboard', request.url))
  }

  return supabaseResponse
}

export const config = {
  matcher: [
    '/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)',
  ],
}
