import { describe, it, expect } from 'vitest'
import { GET } from './route'
import { NextRequest } from 'next/server'

function makeRequest(opts: { authHeader?: string; webhookSecret?: string; companyId?: string } = {}) {
  const url = new URL(`http://localhost/api/send-missed-alert${opts.companyId ? `?company_id=${opts.companyId}` : ''}`)
  const headers = new Headers()
  if (opts.authHeader) headers.set('authorization', opts.authHeader)
  if (opts.webhookSecret) headers.set('x-webhook-secret', opts.webhookSecret)
  return new NextRequest(url, { headers })
}

describe('GET /api/send-missed-alert', () => {
  it('returns 401 with no auth', async () => {
    const res = await GET(makeRequest())
    expect(res.status).toBe(401)
  })

  it('returns 401 with wrong cron secret', async () => {
    process.env.CRON_SECRET = 'correct'
    const res = await GET(makeRequest({ authHeader: 'Bearer wrong' }))
    expect(res.status).toBe(401)
    delete process.env.CRON_SECRET
  })

  it('returns 400 when no company_id and no CRON_COMPANY_ID env', async () => {
    process.env.CRON_SECRET = 'test-secret'
    process.env.INTERNAL_WEBHOOK_SECRET = 'test-secret'
    delete process.env.CRON_COMPANY_ID
    const res = await GET(makeRequest({ authHeader: 'Bearer test-secret' }))
    expect(res.status).toBe(400)
    delete process.env.CRON_SECRET
    delete process.env.INTERNAL_WEBHOOK_SECRET
  })
})
