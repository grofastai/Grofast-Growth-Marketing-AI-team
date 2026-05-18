import { createClient } from '@supabase/supabase-js'
import { NextRequest, NextResponse } from 'next/server'

function adminSupabase() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  )
}

export async function GET(request: NextRequest) {
  const auth = request.headers.get('authorization')
  if (auth !== `Bearer ${process.env.CRON_SECRET}`) {
    return new NextResponse('Unauthorized', { status: 401 })
  }

  const admin = adminSupabase()

  // Get today MM-DD in IST
  const istDate = new Date(new Date().toLocaleString('en-US', { timeZone: 'Asia/Kolkata' }))
  const mm = String(istDate.getMonth() + 1).padStart(2, '0')
  const dd = String(istDate.getDate()).padStart(2, '0')

  // Fetch all active members with date_of_birth
  const { data: members } = await admin
    .from('users')
    .select('id, name, phone, company_id')
    .eq('status', 'active')
    .is('deleted_at', null)
    .not('date_of_birth', 'is', null)

  if (!members?.length) return NextResponse.json({ sent: 0 })

  // Filter by today's month-day
  const { data: birthdayMembers } = await admin
    .from('users')
    .select('id, name, phone, company_id')
    .eq('status', 'active')
    .is('deleted_at', null)
    .like('date_of_birth', `%-${mm}-${dd}`)

  if (!birthdayMembers?.length) return NextResponse.json({ sent: 0, message: 'No birthdays today' })

  const waUrl = `https://graph.facebook.com/v19.0/${process.env.META_PHONE_NUMBER_ID}/messages`
  const token = process.env.META_WHATSAPP_TOKEN
  const template = process.env.WHATSAPP_BIRTHDAY_TEMPLATE ?? 'grofast_birthday'

  let sent = 0
  for (const member of birthdayMembers) {
    if (!member.phone || !token) continue

    const phone = member.phone.replace(/\D/g, '')
    const normalized = phone.length === 10 ? `91${phone}` : phone

    const firstName = member.name.split(' ')[0]

    try {
      const res = await fetch(waUrl, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          messaging_product: 'whatsapp',
          to: normalized,
          type: 'template',
          template: {
            name: template,
            language: { code: 'en' },
            components: [{
              type: 'body',
              parameters: [{ type: 'text', text: firstName }],
            }],
          },
        }),
      })
      if (res.ok) sent++
    } catch {
      // Non-fatal — continue to next member
    }

    // Also log to notifications table
    try {
      await admin.from('notifications').insert({
        company_id: member.company_id,
        user_id: member.id,
        type: 'birthday_wish',
        message: `Happy Birthday ${member.name}!`,
        sent_at: new Date().toISOString(),
      })
    } catch { /* non-fatal */ }
  }

  return NextResponse.json({ sent, total: birthdayMembers.length })
}
