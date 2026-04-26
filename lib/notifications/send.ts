import type { NotificationPayload } from './types'

const N8N_WEBHOOK_URL = process.env.N8N_WEBHOOK_URL!
const N8N_WEBHOOK_SECRET = process.env.N8N_WEBHOOK_SECRET!

export async function sendNotification(payload: NotificationPayload): Promise<void> {
  if (!N8N_WEBHOOK_URL) {
    console.warn('[notify] N8N_WEBHOOK_URL not set — skipping notification')
    return
  }

  const res = await fetch(N8N_WEBHOOK_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-webhook-secret': N8N_WEBHOOK_SECRET ?? '',
    },
    body: JSON.stringify(payload),
  })

  if (!res.ok) {
    const text = await res.text()
    console.error(`[notify] n8n webhook failed ${res.status}: ${text}`)
  }
}
