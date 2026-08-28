import { describe, it, expect, vi, beforeEach } from 'vitest'
import { isTemplateConfigError } from './whatsapp'

const sendDetailed = vi.fn()
vi.mock('./whatsapp', async (importOriginal) => ({
  ...(await importOriginal<typeof import('./whatsapp')>()),
  sendWhatsAppTemplateDetailed: (...a: unknown[]) => sendDetailed(...a),
}))

const { createWhatsAppRun } = await import('./cron-whatsapp')

const ok = { ok: true, messageId: 'wamid.1', error: null }
// The exact shape lib/whatsapp.ts returns for the error that broke the morning report.
const templateMissing = {
  ok: false,
  messageId: null,
  error: '132001: (#132001) Template name does not exist in the translation',
  configError: true,
}
const undeliverable = {
  ok: false, messageId: null,
  error: '131026: Message undeliverable', configError: false,
}

beforeEach(() => sendDetailed.mockReset())

describe('isTemplateConfigError', () => {
  it('flags the template-does-not-exist code that broke the morning report', () => {
    expect(isTemplateConfigError('132001: (#132001) Template name does not exist')).toBe(true)
  })

  it('flags an unapproved template', () => {
    expect(isTemplateConfigError('133010: Template not approved')).toBe(true)
  })

  it('does not flag a per-recipient delivery failure', () => {
    expect(isTemplateConfigError('131026: Message undeliverable')).toBe(false)
    expect(isTemplateConfigError('131049: frequency cap')).toBe(false)
  })

  it('handles null and unparseable errors', () => {
    expect(isTemplateConfigError(null)).toBe(false)
    expect(isTemplateConfigError('http 500')).toBe(false)
  })
})

describe('createWhatsAppRun', () => {
  it('returns 200 when every send succeeds', async () => {
    sendDetailed.mockResolvedValue(ok)
    const run = createWhatsAppRun()
    await run.send('9199', 'grofast_x', [])
    const res = run.respond({ sent: 1 })
    expect(res.status).toBe(200)
  })

  // The regression: a missing template used to return 200 with sent:0, so Vercel
  // showed a healthy cron while the admin received nothing for 12 days.
  it('fails the run and names the template when the template is misconfigured', async () => {
    sendDetailed.mockResolvedValue(templateMissing)
    const run = createWhatsAppRun()
    const sent = await run.send('9199', 'grofast_admin_morning_report', [])

    expect(sent).toBe(false)
    const res = run.respond({ whatsappSent: false })
    expect(res.status).toBe(500)
    const body = await res.json()
    expect(body.brokenTemplates).toEqual(['grofast_admin_morning_report'])
    expect(body.hint).toContain('Meta')
  })

  it('does NOT fail the run for ordinary undeliverable recipients', async () => {
    sendDetailed.mockResolvedValue(undeliverable)
    const run = createWhatsAppRun()
    await run.send('9199', 'grofast_attendance_nudge', [])
    await run.send('9188', 'grofast_attendance_nudge', [])

    const res = run.respond({ sent: 0 })
    expect(res.status).toBe(200)
    expect(run.failed).toBe(2)
    expect(run.brokenTemplates).toEqual([])
  })

  it('reports each broken template once across many recipients', async () => {
    sendDetailed.mockResolvedValue(templateMissing)
    const run = createWhatsAppRun()
    for (const p of ['91', '92', '93']) await run.send(p, 'grofast_holiday_reminder', [])
    expect(run.brokenTemplates).toEqual(['grofast_holiday_reminder'])
  })

  it('accepts results recorded from a direct Detailed call', async () => {
    const run = createWhatsAppRun()
    run.record('grofast_holiday_reminder', templateMissing)
    expect(run.respond({}).status).toBe(500)
  })
})
