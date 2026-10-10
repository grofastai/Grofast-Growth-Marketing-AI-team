import { NextResponse } from 'next/server'
import { sendWhatsAppTemplateDetailed, type WhatsAppSendResult } from '@/lib/whatsapp'

/**
 * Tracks the WhatsApp sends a cron run makes so the run can fail when a template is
 * broken.
 *
 * Why this exists: every cron used to call sendWhatsAppTemplate(), ignore the boolean,
 * and return 200. When grofast_admin_morning_report stopped existing in Meta the cron
 * kept reporting a successful run for 12 days while the admin simply received nothing.
 * Vercel showed a green cron; the only trace was a console line nobody reads.
 *
 * A misconfigured template is a permanent, human-fixable fault, so it fails the run
 * (500) and names the template. Ordinary delivery failures — blocked recipient, no
 * WhatsApp account, frequency cap — are per-person and transient, so they are counted
 * and reported in the body but do not fail the run.
 */
export interface WhatsAppRun {
  /** Send, recording the outcome. Returns whether Meta accepted the message. */
  send(phone: string, template: string, params: string[],
       buttons?: { index: number; payload: string }[]): Promise<boolean>
  /** Record a send made elsewhere (routes that call the detailed API directly). */
  record(template: string, result: WhatsAppSendResult): void
  /** Templates Meta rejected as misconfigured this run. */
  readonly brokenTemplates: string[]
  readonly sent: number
  readonly failed: number
  /** Cron's JSON response — 500 when a template is broken, so the run is marked failed. */
  respond(body: Record<string, unknown>): NextResponse
}

export function createWhatsAppRun(): WhatsAppRun {
  const broken = new Set<string>()
  let sent = 0
  let failed = 0

  const record = (template: string, result: WhatsAppSendResult) => {
    if (result.ok) { sent++; return }
    failed++
    if (result.configError) broken.add(template)
  }

  return {
    record,
    async send(phone, template, params, buttons) {
      const result = await sendWhatsAppTemplateDetailed(phone, template, params, buttons)
      record(template, result)
      return result.ok
    },
    get brokenTemplates() { return [...broken] },
    get sent() { return sent },
    get failed() { return failed },
    respond(body) {
      const brokenTemplates = [...broken]
      if (brokenTemplates.length > 0) {
        return NextResponse.json(
          {
            ...body,
            error: 'whatsapp template misconfigured',
            brokenTemplates,
            hint: 'Template is missing, unapproved, or defined under a different language '
                + `than WHATSAPP_TEMPLATE_LANG (${process.env.WHATSAPP_TEMPLATE_LANG ?? 'en'}). `
                + 'Fix it in Meta > WhatsApp Manager > Message Templates.',
          },
          { status: 500 }
        )
      }
      return NextResponse.json(body)
    },
  }
}
