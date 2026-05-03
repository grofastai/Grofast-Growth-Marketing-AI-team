import type { NotificationEvent, NotificationPayload, MissingUpdatePayload } from '@/lib/notifications/types'

export function formatPhone(raw: string): string {
  const digits = raw.replace(/\D/g, '')
  if (digits.length === 10) return '91' + digits
  if (digits.startsWith('0') && digits.length === 11) return '91' + digits.slice(1)
  return digits
}

export async function sendWhatsAppTemplate(
  phone: string,
  templateName: string,
  params: string[]
): Promise<boolean> {
  const token = process.env.META_WHATSAPP_TOKEN
  const phoneId = process.env.META_PHONE_NUMBER_ID
  if (!token || !phoneId) {
    console.warn('[whatsapp] META_WHATSAPP_TOKEN or META_PHONE_NUMBER_ID not set — skipping')
    return false
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
          language: { code: 'en' },
          components: [
            {
              type: 'body',
              parameters: params.map(text => ({ type: 'text', text })),
            },
          ],
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
}

export const TEMPLATE_MAP: Partial<Record<NotificationEvent, TemplateEntry>> = {
  'daily_update.missing': {
    name: 'grofast_missed_update',
    resolvePhone: (p) => (p as MissingUpdatePayload).employee_phone ?? null,
    buildParams: (p) => {
      const mp = p as MissingUpdatePayload
      return [mp.employee_name, mp.date]
    },
  },
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
  await sendWhatsAppTemplate(formatPhone(rawPhone), entry.name, entry.buildParams(payload))
}
