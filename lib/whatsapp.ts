import type { NotificationEvent, NotificationPayload, MissingUpdatePayload, LeaveSubmittedPayload, LeaveStatusPayload } from '@/lib/notifications/types'

export function formatPhone(raw: string): string {
  const digits = raw.replace(/\D/g, '')
  if (digits.length === 10) return '91' + digits
  if (digits.startsWith('0') && digits.length === 11) return '91' + digits.slice(1)
  return digits
}

interface ButtonParam {
  index: number
  payload: string
}

// Meta's delivery funnel, in order. `accepted` is ours (the /messages call returned 200);
// the rest arrive asynchronously on the `statuses` webhook. `failed` outranks everything
// because a message that was reported sent can still be dropped afterwards.
const DELIVERY_STATUS_RANK: Record<string, number> = {
  accepted: 0, sent: 1, delivered: 2, read: 3, failed: 4,
}

// Meta replays and reorders status events — a `sent` can land after `delivered`. Only ever
// move a row forward, so a late duplicate can't overwrite the real outcome.
export function shouldUpgradeDeliveryStatus(current: string | null, next: string): boolean {
  const nextRank = DELIVERY_STATUS_RANK[next]
  if (nextRank === undefined) return false
  const currentRank = current === null ? -1 : DELIVERY_STATUS_RANK[current] ?? -1
  return nextRank > currentRank
}

// Meta error codes that mean the TEMPLATE is broken, not the delivery: the name does
// not exist, it is not approved, or it exists under a different language than the one
// we send (WHATSAPP_TEMPLATE_LANG, default 'en'). These never fix themselves — every
// future run fails identically — so they must be reported loudly rather than counted
// as "not sent" alongside a blocked recipient or a frequency cap.
//   132000 param count mismatch     132001 template does not exist in this language
//   132005 template text too long   132007 template format/param error
//   132012 param format mismatch    132015 template is paused
//   133010 template not approved
const TEMPLATE_CONFIG_ERROR_CODES = new Set([132000, 132001, 132005, 132007, 132012, 132015, 133010])

/** True when `error` (as returned on WhatsAppSendResult) is a template misconfiguration
 *  that will recur on every send until somebody changes the template in Meta. */
export function isTemplateConfigError(error: string | null): boolean {
  if (!error) return false
  const code = Number(error.split(':')[0].trim())
  return Number.isFinite(code) && TEMPLATE_CONFIG_ERROR_CODES.has(code)
}

export interface WhatsAppSendResult {
  /** Meta ACCEPTED the send (HTTP 2xx). This is NOT proof of delivery — see messageId. */
  ok: boolean
  /** Meta's wamid. Store it as notifications.provider_ref so the delivery-status
   *  webhook can later flip that row to delivered/read/failed. */
  messageId: string | null
  /** Meta's rejection reason (code + message) when ok is false. */
  error: string | null
  /** The send failed because the template itself is misconfigured in Meta. Retrying
   *  will not help; a human has to fix the template. */
  configError?: boolean
}

// A 200 from Meta only means "queued for delivery" — the message can still be dropped
// afterwards (marketing frequency caps, blocked recipient, number not on WhatsApp) and
// Meta reports that asynchronously via the `statuses` webhook, never in this response.
// Callers that need to know whether a message actually landed must persist `messageId`
// so app/api/webhooks/whatsapp can match the status event back to the send.
export async function sendWhatsAppTemplateDetailed(
  phone: string,
  templateName: string,
  params: string[],
  buttons?: ButtonParam[]
): Promise<WhatsAppSendResult> {
  const token = process.env.META_WHATSAPP_TOKEN
  const phoneId = process.env.META_PHONE_NUMBER_ID
  if (!token || !phoneId) {
    console.warn('[whatsapp] META_WHATSAPP_TOKEN or META_PHONE_NUMBER_ID not set — skipping')
    return { ok: false, messageId: null, error: 'meta credentials not configured' }
  }

  const components: object[] = [
    {
      type: 'body',
      parameters: params.map(text => ({ type: 'text', text })),
    },
  ]

  if (buttons?.length) {
    for (const btn of buttons) {
      components.push({
        type: 'button',
        sub_type: 'quick_reply',
        index: String(btn.index),
        parameters: [{ type: 'payload', payload: btn.payload }],
      })
    }
  }

  try {
    const res = await fetch(`https://graph.facebook.com/v19.0/${phoneId}/messages`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({
        messaging_product: 'whatsapp',
        to: phone,
        type: 'template',
        template: {
          name: templateName,
          language: { code: process.env.WHATSAPP_TEMPLATE_LANG ?? 'en' },
          components,
        },
      }),
    })

    const json = await res.json().catch(() => ({} as Record<string, unknown>))

    if (!res.ok) {
      const e = (json as { error?: { code?: number; message?: string } }).error
      const error = e ? `${e.code ?? '?'}: ${e.message ?? ''}` : `http ${res.status}`
      const configError = isTemplateConfigError(error)
      if (configError) {
        // Its own log line, and its own error group in the Vercel dashboard. A broken
        // template silently skipped the admin morning report for 12 days because this
        // was indistinguishable from an ordinary undeliverable message.
        console.error(
          `[whatsapp] TEMPLATE MISCONFIGURED — template="${templateName}" ` +
          `language="${process.env.WHATSAPP_TEMPLATE_LANG ?? 'en'}" reason="${error}". ` +
          `Every send of this template will keep failing until it is fixed in Meta.`
        )
      } else {
        console.error(`[whatsapp] Meta API error for ${phone} (${templateName}):`, json)
      }
      return { ok: false, messageId: null, error, configError }
    }

    const messageId =
      (json as { messages?: Array<{ id?: string }> }).messages?.[0]?.id ?? null
    return { ok: true, messageId, error: null }
  } catch (err) {
    console.error('[whatsapp] fetch failed:', err)
    return { ok: false, messageId: null, error: err instanceof Error ? err.message : 'fetch failed' }
  }
}

// Boolean-only wrapper — the 15+ existing call sites only branch on success.
export async function sendWhatsAppTemplate(
  phone: string,
  templateName: string,
  params: string[],
  buttons?: ButtonParam[]
): Promise<boolean> {
  const { ok } = await sendWhatsAppTemplateDetailed(phone, templateName, params, buttons)
  return ok
}

interface TemplateEntry {
  name: string
  resolvePhone: (payload: NotificationPayload) => string | null
  buildParams: (payload: NotificationPayload) => string[]
  buildButtons?: (payload: NotificationPayload) => ButtonParam[]
}

export const TEMPLATE_MAP: Partial<Record<NotificationEvent, TemplateEntry>> = {
  'daily_update.missing': {
    name: 'grofast_missed_update_v2',
    resolvePhone: (p) => (p as MissingUpdatePayload).employee_phone ?? null,
    buildParams: (p) => {
      const mp = p as MissingUpdatePayload
      return [mp.employee_name, mp.date]
    },
  },

  'leave.submitted': {
    name: 'grofast_leave_request_v2',
    resolvePhone: (p) => (p as LeaveSubmittedPayload).admin_phone ?? null,
    buildParams: (p) => {
      const lp = p as LeaveSubmittedPayload
      return [lp.employee_name, lp.from_date, lp.to_date, lp.reason]
    },
    buildButtons: (p) => {
      const lp = p as LeaveSubmittedPayload
      return [
        { index: 0, payload: `approve:${lp.leave_id}` },
        { index: 1, payload: `reject:${lp.leave_id}` },
      ]
    },
  },

  'wfh.submitted': {
    name: 'grofast_wfh_request_v2',
    resolvePhone: (p) => (p as LeaveSubmittedPayload).admin_phone ?? null,
    buildParams: (p) => {
      const lp = p as LeaveSubmittedPayload
      return [lp.employee_name, lp.from_date, lp.to_date, lp.reason]
    },
    buildButtons: (p) => {
      const lp = p as LeaveSubmittedPayload
      return [
        { index: 0, payload: `approve:${lp.leave_id}` },
        { index: 1, payload: `reject:${lp.leave_id}` },
      ]
    },
  },

  'shoot.submitted': {
    name: 'grofast_shoot_request_v2',
    resolvePhone: (p) => (p as LeaveSubmittedPayload).admin_phone ?? null,
    buildParams: (p) => {
      const lp = p as LeaveSubmittedPayload
      return [lp.employee_name, lp.from_date, lp.to_date, lp.reason]
    },
    buildButtons: (p) => {
      const lp = p as LeaveSubmittedPayload
      return [
        { index: 0, payload: `approve:${lp.leave_id}` },
        { index: 1, payload: `reject:${lp.leave_id}` },
      ]
    },
  },

  'leave.approved': {
    name: 'grofast_leave_approved_v2',
    resolvePhone: (p) => (p as LeaveStatusPayload).employee_phone ?? null,
    buildParams: (p) => {
      const lp = p as LeaveStatusPayload
      return [lp.employee_name, lp.from_date, lp.to_date, lp.detail]
    },
  },

  'leave.rejected': {
    name: 'grofast_leave_rejected_v2',
    resolvePhone: (p) => (p as LeaveStatusPayload).employee_phone ?? null,
    buildParams: (p) => {
      const lp = p as LeaveStatusPayload
      return [lp.employee_name, lp.from_date, lp.to_date, lp.detail]
    },
  },

  'half_day.approved': {
    name: 'grofast_half_day_approved',
    resolvePhone: (p) => (p as LeaveStatusPayload).employee_phone ?? null,
    buildParams: (p) => {
      const lp = p as LeaveStatusPayload
      return [lp.employee_name, lp.from_date, lp.detail]
    },
  },

  'half_day.rejected': {
    name: 'grofast_half_day_rejected',
    resolvePhone: (p) => (p as LeaveStatusPayload).employee_phone ?? null,
    buildParams: (p) => {
      const lp = p as LeaveStatusPayload
      return [lp.employee_name, lp.from_date, lp.detail]
    },
  },

  'wfh.approved': {
    name: 'grofast_wfh_approved',
    resolvePhone: (p) => (p as LeaveStatusPayload).employee_phone ?? null,
    buildParams: (p) => {
      const lp = p as LeaveStatusPayload
      return [lp.employee_name, lp.from_date, lp.to_date]
    },
  },

  'wfh.rejected': {
    name: 'grofast_wfh_rejected',
    resolvePhone: (p) => (p as LeaveStatusPayload).employee_phone ?? null,
    buildParams: (p) => {
      const lp = p as LeaveStatusPayload
      return [lp.employee_name, lp.from_date, lp.to_date]
    },
  },

  'shoot.approved': {
    name: 'grofast_shoot_approved',
    resolvePhone: (p) => (p as LeaveStatusPayload).employee_phone ?? null,
    buildParams: (p) => {
      const lp = p as LeaveStatusPayload
      return [lp.employee_name, lp.from_date, lp.to_date]
    },
  },

  'shoot.rejected': {
    name: 'grofast_shoot_rejected',
    resolvePhone: (p) => (p as LeaveStatusPayload).employee_phone ?? null,
    buildParams: (p) => {
      const lp = p as LeaveStatusPayload
      return [lp.employee_name, lp.from_date, lp.to_date]
    },
  },

  // 'attendance.late' and 'hours.underperformance' intentionally have no entry —
  // grofast_late_arrival_v2 / grofast_underperformance were removed by request
  // (not one of the 4 asks). sendNotificationViaTemplate no-ops for events with
  // no TEMPLATE_MAP entry, so the in-app bell notification still fires normally;
  // only the WhatsApp send is skipped. Re-add here (and recreate the Meta
  // template) if these are wanted again later.
}

export async function sendNotificationViaTemplate(payload: NotificationPayload): Promise<void> {
  const entry = TEMPLATE_MAP[payload.event]
  if (!entry) {
    console.warn(`[whatsapp] no template for "${payload.event}" — skipping`)
    return
  }
  const rawPhone = entry.resolvePhone(payload)
  if (!rawPhone) {
    console.warn(`[whatsapp] no phone for "${payload.event}" — skipping`)
    return
  }
  const buttons = entry.buildButtons?.(payload)
  await sendWhatsAppTemplate(formatPhone(rawPhone), entry.name, entry.buildParams(payload), buttons)
}
