import { describe, it, expect, vi, beforeEach } from 'vitest'
import { NextRequest } from 'next/server'

const getSession = vi.fn()

vi.mock('@supabase/ssr', () => ({
  createServerClient: () => ({ auth: { getSession } }),
}))

// eslint-disable-next-line @typescript-eslint/no-require-imports
const { middleware } = await import('./middleware')

const req = (path: string) =>
  new NextRequest(new URL(path, 'https://team.grofastdigital.com'))

const tokenWithRole = (role: string) =>
  `x.${Buffer.from(JSON.stringify({ role })).toString('base64')}.y`

beforeEach(() => {
  getSession.mockReset()
  process.env.NEXT_PUBLIC_SUPABASE_URL = 'https://example.supabase.co'
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = 'anon'
})

describe('middleware auth gate', () => {
  it('redirects to /login when there is genuinely no session', async () => {
    getSession.mockResolvedValue({ data: { session: null } })
    const res = await middleware(req('/member/attendance'))
    expect(res.status).toBe(307)
    expect(res.headers.get('location')).toContain('/login')
  })

  it('lets an authenticated member through', async () => {
    getSession.mockResolvedValue({
      data: { session: { user: { id: 'u1' }, access_token: tokenWithRole('MEMBER') } },
    })
    const res = await middleware(req('/member/attendance'))
    expect(res.status).toBe(200)
    expect(res.headers.get('location')).toBeNull()
  })

  // Regression: the 25s MIDDLEWARE_INVOCATION_TIMEOUT 504s on /member/*.
  // A hanging token refresh must not hold the request open, and must not be
  // treated as "signed out" — the route layouts re-check with getUser().
  it('falls through without hanging when the auth call never resolves', async () => {
    getSession.mockReturnValue(new Promise(() => {}))
    const started = Date.now()
    const res = await middleware(req('/member/attendance'))
    const elapsed = Date.now() - started

    expect(elapsed).toBeLessThan(10_000)
    expect(res.status).toBe(200)
    expect(res.headers.get('location')).toBeNull()
  }, 20_000)

  it('does not bounce a user to /login when the auth call rejects', async () => {
    getSession.mockRejectedValue(new Error('fetch failed'))
    const res = await middleware(req('/member/attendance'))
    expect(res.status).toBe(307)
    expect(res.headers.get('location')).toContain('/login')
  })

  it('routes / to the dashboard matching the token role', async () => {
    getSession.mockResolvedValue({
      data: { session: { user: { id: 'u1' }, access_token: tokenWithRole('ADMIN') } },
    })
    const res = await middleware(req('/'))
    expect(res.headers.get('location')).toContain('/admin/dashboard')
  })

  it('does not touch /api/ routes', async () => {
    const res = await middleware(req('/api/cron/note-reminders'))
    expect(res.status).toBe(200)
    expect(getSession).not.toHaveBeenCalled()
  })
})
