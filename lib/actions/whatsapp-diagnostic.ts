'use server'

import { createServerClient } from '@/lib/supabase/server'
import { createClient } from '@supabase/supabase-js'
import { formatPhone } from '@/lib/whatsapp'

function adminSupabase() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  )
}

export interface WhatsAppDiagnosticResult {
  envVars: {
    tokenSet: boolean
    phoneIdSet: boolean
    cronSecretSet: boolean
    cronCompanyIdSet: boolean
    internalSecretSet: boolean
    templateLang: string
  }
  metaApi: {
    ok: boolean
    displayPhone?: string
    error?: string
    httpStatus?: number
  }
  members: {
    total: number
    withPhone: number
    withoutPhone: number
    sample: Array<{ name: string; phone: string | null; formatted?: string }>
  }
  templates: {
    dailyReminder: string
    missedUpdate: string
    adminSummary: string
    lang: string
  }
  cronSchedule: {
    morningReminder: string
    eveningAlert: string
  }
}

export async function runWhatsAppDiagnostic(): Promise<WhatsAppDiagnosticResult> {
  const supabase = await createServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) throw new Error('Not authenticated')

  const admin = adminSupabase()
  const { data: profile } = await admin
    .from('users')
    .select('role, company_id')
    .eq('id', user.id)
    .single()

  if (profile?.role !== 'ADMIN') throw new Error('Admin access required')

  // ── 1. Env var check ─────────────────────────────────────────────────────
  const token = process.env.META_WHATSAPP_TOKEN ?? ''
  const phoneId = process.env.META_PHONE_NUMBER_ID ?? ''
  const cronSecret = process.env.CRON_SECRET ?? ''
  const cronCompanyId = process.env.CRON_COMPANY_ID ?? ''
  const internalSecret = process.env.INTERNAL_WEBHOOK_SECRET ?? ''
  const templateLang = process.env.WHATSAPP_TEMPLATE_LANG ?? 'en'

  // ── 2. Meta API check — verify token + phone ID ───────────────────────────
  let metaResult: WhatsAppDiagnosticResult['metaApi'] = { ok: false, error: 'Env vars not set' }
  if (token && phoneId) {
    try {
      const res = await fetch(
        `https://graph.facebook.com/v19.0/${phoneId}?fields=display_phone_number,verified_name`,
        { headers: { Authorization: `Bearer ${token}` }, cache: 'no-store' }
      )
      const json = await res.json() as Record<string, unknown>
      if (res.ok) {
        metaResult = {
          ok: true,
          displayPhone: `${json.display_phone_number} (${json.verified_name})`,
        }
      } else {
        const errObj = (json.error ?? json) as Record<string, unknown>
        metaResult = {
          ok: false,
          httpStatus: res.status,
          error: `${errObj.message ?? JSON.stringify(errObj)} (code ${errObj.code ?? '?'})`,
        }
      }
    } catch (e) {
      metaResult = { ok: false, error: String(e) }
    }
  }

  // ── 3. Members summary ────────────────────────────────────────────────────
  const { data: members } = await admin
    .from('users')
    .select('name, phone, status')
    .eq('company_id', profile.company_id)
    .eq('status', 'active')

  const total = members?.length ?? 0
  const withPhone = members?.filter(m => m.phone?.trim()).length ?? 0

  const sample = (members ?? []).slice(0, 5).map(m => ({
    name: m.name as string,
    phone: m.phone as string | null,
    formatted: m.phone ? formatPhone(m.phone) : undefined,
  }))

  return {
    envVars: {
      tokenSet: !!token,
      phoneIdSet: !!phoneId,
      cronSecretSet: !!cronSecret,
      cronCompanyIdSet: !!cronCompanyId,
      internalSecretSet: !!internalSecret,
      templateLang,
    },
    metaApi: metaResult,
    members: { total, withPhone, withoutPhone: total - withPhone, sample },
    templates: {
      dailyReminder: 'grofast_daily_reminder',
      missedUpdate: 'grofast_missed_update',
      adminSummary: 'grofast_admin_missed_summary',
      lang: templateLang,
    },
    cronSchedule: {
      morningReminder: '9:30 AM IST (0 4 * * * UTC)',
      eveningAlert: '9:00 PM IST (30 15 * * * UTC)',
    },
  }
}

export async function sendTestWhatsApp(toPhone: string): Promise<{ ok: boolean; detail: string }> {
  const supabase = await createServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { ok: false, detail: 'Not authenticated' }

  const admin = adminSupabase()
  const { data: profile } = await admin
    .from('users')
    .select('role, name')
    .eq('id', user.id)
    .single()

  if (profile?.role !== 'ADMIN') return { ok: false, detail: 'Admin access required' }

  const token = process.env.META_WHATSAPP_TOKEN
  const phoneId = process.env.META_PHONE_NUMBER_ID
  const lang = process.env.WHATSAPP_TEMPLATE_LANG ?? 'en'

  if (!token || !phoneId) return { ok: false, detail: 'META_WHATSAPP_TOKEN or META_PHONE_NUMBER_ID not set' }

  const formatted = formatPhone(toPhone)
  const today = new Date().toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })

  try {
    const res = await fetch(`https://graph.facebook.com/v19.0/${phoneId}/messages`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({
        messaging_product: 'whatsapp',
        to: formatted,
        type: 'template',
        template: {
          name: 'grofast_daily_reminder',
          language: { code: lang },
          components: [{
            type: 'body',
            parameters: [
              { type: 'text', text: profile.name ?? 'Admin' },
            ],
          }],
        },
      }),
    })
    const json = await res.json() as Record<string, unknown>
    if (res.ok) {
      const msgId = (json.messages as Array<{ id: string }>)?.[0]?.id
      return { ok: true, detail: `Sent ✓ Message ID: ${msgId}` }
    }
    const err = (json.error ?? json) as Record<string, unknown>
    return { ok: false, detail: `Meta error ${err.code}: ${err.message}` }
  } catch (e) {
    return { ok: false, detail: String(e) }
  }
}

export async function triggerManualReminder(type: 'morning' | 'evening'): Promise<{ ok: boolean; detail: string }> {
  const supabase = await createServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { ok: false, detail: 'Not authenticated' }

  const admin = adminSupabase()
  const { data: profile } = await admin
    .from('users')
    .select('role, company_id')
    .eq('id', user.id)
    .single()

  if (profile?.role !== 'ADMIN') return { ok: false, detail: 'Admin access required' }

  const secret = process.env.INTERNAL_WEBHOOK_SECRET
  if (!secret) return { ok: false, detail: 'INTERNAL_WEBHOOK_SECRET not set' }

  const companyId = profile.company_id
  const path = type === 'morning' ? 'send-daily-reminder' : 'send-missed-alert'
  const baseUrl = process.env.NEXT_PUBLIC_APP_URL ?? process.env.VERCEL_URL
    ? `https://${process.env.VERCEL_URL}`
    : 'https://grofastteam.vercel.app'

  try {
    const res = await fetch(`${baseUrl}/api/${path}?company_id=${companyId}`, {
      headers: { 'x-webhook-secret': secret },
      cache: 'no-store',
    })
    const json = await res.json() as Record<string, unknown>
    if (res.ok) {
      return {
        ok: true,
        detail: `Done — sent: ${json.sent}, failed: ${json.failed}, pending: ${json.pendingCount ?? json.missedCount}`,
      }
    }
    return { ok: false, detail: `HTTP ${res.status}: ${JSON.stringify(json)}` }
  } catch (e) {
    return { ok: false, detail: String(e) }
  }
}
