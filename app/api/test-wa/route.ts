import { NextRequest, NextResponse } from 'next/server'

export async function POST(req: NextRequest) {
  const { phone } = await req.json()

  const token    = process.env.META_WHATSAPP_TOKEN
  const phoneId  = process.env.META_PHONE_NUMBER_ID
  const template = process.env.WHATSAPP_ONBOARDING_TEMPLATE ?? 'grofast_member_welcome'

  if (!token || !phoneId) {
    return NextResponse.json({ error: 'META_WHATSAPP_TOKEN or META_PHONE_NUMBER_ID not set' })
  }

  let cleanPhone = String(phone).replace(/\D/g, '')
  if (cleanPhone.length === 10) cleanPhone = '91' + cleanPhone

  const body = {
    messaging_product: 'whatsapp',
    to: cleanPhone,
    type: 'template',
    template: {
      name: template,
      language: { code: 'en' },
      components: [
        {
          type: 'body',
          parameters: [
            { type: 'text', text: 'Test User' },
            { type: 'text', text: 'EMP001' },
            { type: 'text', text: 'test@example.com' },
            { type: 'text', text: 'Test@123' },
            { type: 'text', text: 'Media Team' },
            { type: 'text', text: 'https://grofast.vercel.app/login' },
          ],
        },
      ],
    },
  }

  const res = await fetch(`https://graph.facebook.com/v19.0/${phoneId}/messages`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: JSON.stringify(body),
  })

  const json = await res.json()
  return NextResponse.json({ status: res.status, body: json, sentTo: cleanPhone, template })
}
