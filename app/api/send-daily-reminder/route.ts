export const dynamic = 'force-dynamic'
export const revalidate = 0

import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

function adminSupabase() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  )
}

function formatPhone(raw: string): string {
  const digits = raw.replace(/\D/g, '')
  if (digits.length === 10) return '91' + digits
  if (digits.startsWith('0') && digits.length === 11) return '91' + digits.slice(1)
  return digits
}

async function sendWhatsAppTemplate(
  phone: string,
  templateName: string,
  params: string[]
): Promise<boolean> {
  const token = process.env.META_WHATSAPP_TOKEN
  const phoneId = process.env.META_PHONE_NUMBER_ID
  if (!token || !phoneId) return false

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
    console.error(`[send-daily-reminder] Meta API error for ${phone}:`, json)
    return false
  }
  return true
}

// n8n calls this at ~4–5 PM via cron.
// Sends grofast_daily_reminder to all active members who haven't submitted today.
// Required: x-webhook-secret header + ?company_id=UUID query param.
export async function GET(request: NextRequest) {
  const secret = request.headers.get('x-webhook-secret')
  if (!secret || secret !== process.env.INTERNAL_WEBHOOK_SECRET) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const companyId = request.nextUrl.searchParams.get('company_id')
  if (!companyId || !UUID_RE.test(companyId)) {
    return NextResponse.json({ error: 'Valid company_id UUID is required' }, { status: 400 })
  }

  const admin = adminSupabase()
  const today = new Date().toISOString().split('T')[0]
  const dateLabel = new Date().toLocaleDateString('en-IN', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  })

  const [{ data: members }, { data: todayUpdates }] = await Promise.all([
    admin
      .from('users')
      .select('id, name, phone')
      .eq('company_id', companyId)
      .eq('role', 'MEMBER')
      .eq('status', 'active'),
    admin
      .from('daily_updates')
      .select('user_id')
      .eq('company_id', companyId)
      .eq('date', today),
  ])

  const submittedIds = new Set((todayUpdates ?? []).map((u: any) => u.user_id))
  const pending = (members ?? []).filter((m: any) => !submittedIds.has(m.id) && m.phone)

  let sent = 0
  let failed = 0
  const failedNames: string[] = []

  await Promise.all(
    pending.map(async (m: any) => {
      const phone = formatPhone(m.phone)
      const ok = await sendWhatsAppTemplate(phone, 'grofast_daily_reminder', [m.name, dateLabel])
      if (ok) {
        sent++
      } else {
        failed++
        failedNames.push(m.name)
      }
    })
  )

  return NextResponse.json({
    date: today,
    pendingCount: pending.length,
    sent,
    failed,
    failedNames,
    sentAt: new Date().toISOString(),
  })
}
