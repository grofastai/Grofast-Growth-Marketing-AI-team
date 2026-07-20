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

export async function sendWhatsAppTemplate(
  phone: string,
  templateName: string,
  params: string[],
  buttons?: ButtonParam[]
): Promise<boolean> {
  const token = process.env.META_WHATSAPP_TOKEN
  const phoneId = process.env.META_PHONE_NUMBER_ID
  if (!token || !phoneId) {
    console.warn('[whatsapp] META_WHATSAPP_TOKEN or META_PHONE_NUMBER_ID not set — skipping')
    return false
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

    if (!res.ok) {
      const json = await res.json().catch(() => ({}))
      console.error(`[whatsapp] Meta API error for ${phone}:`, json)
      return false
    }
    return true
  } catch (err) {
    console.error('[whatsapp] fetch failed:', err)
    return false
  }
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
