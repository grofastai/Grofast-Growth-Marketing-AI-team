import { NextRequest, NextResponse } from 'next/server'
import type { NotificationPayload } from '@/lib/notifications/types'

const N8N_WEBHOOK_URL = process.env.N8N_WEBHOOK_URL!
const N8N_WEBHOOK_SECRET = process.env.N8N_WEBHOOK_SECRET!

// This endpoint is called by Supabase DB webhooks or internal server actions
// to forward structured events to n8n for WhatsApp delivery.
export async function POST(req: NextRequest) {
  // Verify internal secret so only our app can call this route
  const secret = req.headers.get('x-internal-secret')
  if (secret !== process.env.INTERNAL_WEBHOOK_SECRET) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  let payload: NotificationPayload
  try {
    payload = await req.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
  }

  if (!N8N_WEBHOOK_URL) {
    return NextResponse.json({ ok: true, note: 'n8n not configured' })
  }

  const n8nRes = await fetch(N8N_WEBHOOK_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-webhook-secret': N8N_WEBHOOK_SECRET ?? '',
    },
    body: JSON.stringify(payload),
  })

  if (!n8nRes.ok) {
    const text = await n8nRes.text()
    console.error(`[notify] n8n responded ${n8nRes.status}: ${text}`)
    return NextResponse.json({ error: 'n8n error', detail: text }, { status: 502 })
  }

  return NextResponse.json({ ok: true })
}
