'use server'

import { createServerClient } from '@/lib/supabase/server'
import { createClient } from '@supabase/supabase-js'

function adminSupabase() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  )
}

export type BlastResult = {
  userId: string
  name: string
  phone: string | null
  status: 'sent' | 'failed' | 'no_phone'
  error?: string
}

export async function sendWhatsAppBlast(input: {
  memberIds: string[]
  message: string
}): Promise<{ success: boolean; results: BlastResult[]; error?: string }> {
  if (!input.message.trim())      return { success: false, results: [], error: 'Message is required' }
  if (!input.memberIds.length)    return { success: false, results: [], error: 'Select at least one recipient' }
  if (input.message.length > 1000) return { success: false, results: [], error: 'Message too long (max 1000 chars)' }

  const supabase = await createServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { success: false, results: [], error: 'Not authenticated' }

  const metaToken   = process.env.META_WHATSAPP_TOKEN
  const metaPhoneId = process.env.META_PHONE_NUMBER_ID
  if (!metaToken || !metaPhoneId) return { success: false, results: [], error: 'WhatsApp credentials not configured' }

  const templateName = process.env.WHATSAPP_BLAST_TEMPLATE ?? 'grofast_team_blast'

  const admin = adminSupabase()

  const { data: adminProfile } = await admin
    .from('users').select('company_id').eq('id', user.id).single()
  const company_id = adminProfile?.company_id ?? null

  const { data: members } = await admin
    .from('users')
    .select('id, name, phone')
    .in('id', input.memberIds)

  if (!members?.length) return { success: false, results: [], error: 'No members found' }

  const results: BlastResult[] = []

  for (const m of members) {
    if (!m.phone) {
      results.push({ userId: m.id, name: m.name, phone: null, status: 'no_phone' })
      continue
    }

    let cleanPhone = m.phone.replace(/\D/g, '')
    if (cleanPhone.length === 10) cleanPhone = '91' + cleanPhone
    else if (cleanPhone.startsWith('0') && cleanPhone.length === 11) cleanPhone = '91' + cleanPhone.slice(1)

    let status: 'sent' | 'failed' = 'sent'
    let providerRef: string | null = null
    let errorMsg: string | undefined

    try {
      const res = await fetch(
        `https://graph.facebook.com/v19.0/${metaPhoneId}/messages`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${metaToken}`,
          },
          body: JSON.stringify({
            messaging_product: 'whatsapp',
            to: cleanPhone,
            type: 'template',
            template: {
              name: templateName,
              language: { code: process.env.WHATSAPP_TEMPLATE_LANG ?? 'en' },
              components: [
                { type: 'body', parameters: [{ type: 'text', text: input.message }] },
              ],
            },
          }),
        }
      )
      const json = await res.json().catch(() => ({}))
      if (!res.ok) {
        status = 'failed'
        errorMsg = (json?.error?.message as string | undefined) ?? 'API error'
      } else {
        providerRef = (json?.messages?.[0]?.id as string | undefined) ?? null
      }
    } catch (err) {
      status = 'failed'
      errorMsg = String(err)
    }

    if (company_id) {
      try {
        await admin.from('notifications').insert({
          company_id,
          user_id: m.id,
          type: 'whatsapp_blast',
          status,
          phone: cleanPhone,
          provider_ref: providerRef,
        })
      } catch { /* non-fatal */ }
    }

    results.push({ userId: m.id, name: m.name, phone: cleanPhone, status, error: errorMsg })
  }

  return { success: true, results }
}
