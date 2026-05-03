# Remove n8n — Direct WhatsApp via Vercel Cron

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Remove n8n entirely — WhatsApp messages sent directly via Meta Cloud API, cron jobs run on Vercel.

**Architecture:** A new `lib/whatsapp.ts` owns all Meta API logic and a TEMPLATE_MAP. `lib/notifications/send.ts` is rewritten to delegate to it. The two cron endpoints call `sendWhatsAppTemplate` directly. Vercel Cron replaces n8n schedule triggers.

**Tech Stack:** Next.js 15 App Router, Vercel Cron, Meta WhatsApp Cloud API v19.0, Vitest, TypeScript strict mode, pnpm

---

## File Map

| Action | File | Responsibility |
|---|---|---|
| Create | `lib/whatsapp.ts` | `formatPhone`, `sendWhatsAppTemplate`, `TEMPLATE_MAP`, `sendNotificationViaTemplate` |
| Create | `vitest.config.ts` | Vitest config with `@/` alias |
| Create | `vercel.json` | Cron schedules (2 jobs) |
| Rewrite | `lib/notifications/send.ts` | Thin wrapper — delegates to `lib/whatsapp.ts` |
| Rewrite | `app/api/send-daily-reminder/route.ts` | Dual auth, CRON_COMPANY_ID fallback, direct WhatsApp send |
| Rewrite | `app/api/send-missed-alert/route.ts` | Same as above |
| Modify | `lib/actions/team.ts` | Remove n8n fallback block (lines 69–92) |
| Modify | `.env.local.example` | Remove N8N vars, add CRON_SECRET + CRON_COMPANY_ID |
| Delete | `app/api/webhooks/notify/route.ts` | No longer needed |
| Delete | `n8n-workflows/` directory | No longer needed |

---

## Task 1: Install Vitest and configure path alias

**Files:**
- Create: `vitest.config.ts`
- Modify: `package.json` (add test script + vitest devDep)

- [ ] **Step 1: Install Vitest**

```bash
pnpm add -D vitest @vitest/coverage-v8
```

- [ ] **Step 2: Create vitest.config.ts**

```typescript
import { defineConfig } from 'vitest/config'
import { resolve } from 'path'

export default defineConfig({
  test: {
    environment: 'node',
  },
  resolve: {
    alias: {
      '@': resolve(__dirname, '.'),
    },
  },
})
```

- [ ] **Step 3: Add test scripts to package.json**

In `package.json`, inside `"scripts"`, add:

```json
"test": "vitest run",
"test:watch": "vitest"
```

- [ ] **Step 4: Verify Vitest works**

Run:
```bash
pnpm test
```
Expected: `No test files found` (no failures, just empty run)

- [ ] **Step 5: Commit**

```bash
git add vitest.config.ts package.json pnpm-lock.yaml
git commit -m "chore: add vitest test runner"
```

---

## Task 2: Create lib/whatsapp.ts

**Files:**
- Create: `lib/whatsapp.ts`
- Create: `lib/whatsapp.test.ts`

- [ ] **Step 1: Write failing tests for formatPhone**

Create `lib/whatsapp.test.ts`:

```typescript
import { describe, it, expect } from 'vitest'
import { formatPhone } from './whatsapp'

describe('formatPhone', () => {
  it('prepends 91 to 10-digit number', () => {
    expect(formatPhone('9876543210')).toBe('919876543210')
  })

  it('replaces leading 0 on 11-digit number', () => {
    expect(formatPhone('09876543210')).toBe('919876543210')
  })

  it('strips non-digit characters', () => {
    expect(formatPhone('+91 98765-43210')).toBe('919876543210')
  })

  it('leaves already-prefixed numbers unchanged', () => {
    expect(formatPhone('919876543210')).toBe('919876543210')
  })
})
```

- [ ] **Step 2: Run tests — expect FAIL**

```bash
pnpm test lib/whatsapp.test.ts
```
Expected: FAIL — `formatPhone` not defined

- [ ] **Step 3: Create lib/whatsapp.ts**

```typescript
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
```

- [ ] **Step 4: Add TEMPLATE_MAP tests — replace lib/whatsapp.test.ts with full content**

Replace `lib/whatsapp.test.ts` entirely:

```typescript
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { formatPhone, TEMPLATE_MAP, sendNotificationViaTemplate } from './whatsapp'
import type { MissingUpdatePayload } from '@/lib/notifications/types'

describe('formatPhone', () => {
  it('prepends 91 to 10-digit number', () => {
    expect(formatPhone('9876543210')).toBe('919876543210')
  })

  it('replaces leading 0 on 11-digit number', () => {
    expect(formatPhone('09876543210')).toBe('919876543210')
  })

  it('strips non-digit characters', () => {
    expect(formatPhone('+91 98765-43210')).toBe('919876543210')
  })

  it('leaves already-prefixed numbers unchanged', () => {
    expect(formatPhone('919876543210')).toBe('919876543210')
  })
})

describe('TEMPLATE_MAP', () => {
  it('has an entry for daily_update.missing', () => {
    expect(TEMPLATE_MAP['daily_update.missing']).toBeDefined()
    expect(TEMPLATE_MAP['daily_update.missing']!.name).toBe('grofast_missed_update')
  })

  it('has no entry for leave.submitted', () => {
    expect(TEMPLATE_MAP['leave.submitted']).toBeUndefined()
  })

  it('resolves phone from MissingUpdatePayload', () => {
    const payload: MissingUpdatePayload = {
      event: 'daily_update.missing',
      employee_name: 'Ravi',
      employee_phone: '9876543210',
      date: '2026-05-03',
    }
    expect(TEMPLATE_MAP['daily_update.missing']!.resolvePhone(payload)).toBe('9876543210')
  })

  it('builds params from MissingUpdatePayload', () => {
    const payload: MissingUpdatePayload = {
      event: 'daily_update.missing',
      employee_name: 'Ravi',
      employee_phone: '9876543210',
      date: '2026-05-03',
    }
    expect(TEMPLATE_MAP['daily_update.missing']!.buildParams(payload)).toEqual(['Ravi', '2026-05-03'])
  })
})

describe('sendNotificationViaTemplate', () => {
  beforeEach(() => {
    vi.restoreAllMocks()
  })

  it('skips and warns when no template exists for event', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    await sendNotificationViaTemplate({
      event: 'leave.submitted',
      employee_name: 'Ravi',
      employee_id: 'EMP001',
      from_date: '2026-05-10',
      to_date: '2026-05-12',
      reason: 'vacation',
      admin_phone: '9876543210',
    })
    expect(warn).toHaveBeenCalledWith(expect.stringContaining('no template for "leave.submitted"'))
  })

  it('skips and warns when phone is missing', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    await sendNotificationViaTemplate({
      event: 'daily_update.missing',
      employee_name: 'Ravi',
      employee_phone: '',
      date: '2026-05-03',
    })
    expect(warn).toHaveBeenCalledWith(expect.stringContaining('no phone for "daily_update.missing"'))
  })
})
```

- [ ] **Step 5: Run tests — expect PASS**

```bash
pnpm test lib/whatsapp.test.ts
```
Expected: All tests PASS

- [ ] **Step 6: Typecheck**

```bash
pnpm typecheck
```
Expected: No errors

- [ ] **Step 7: Commit**

```bash
git add lib/whatsapp.ts lib/whatsapp.test.ts vitest.config.ts
git commit -m "feat: add lib/whatsapp.ts with formatPhone, sendWhatsAppTemplate, TEMPLATE_MAP"
```

---

## Task 3: Rewrite lib/notifications/send.ts

**Files:**
- Modify: `lib/notifications/send.ts`

- [ ] **Step 1: Replace the file contents**

Full new content of `lib/notifications/send.ts`:

```typescript
import { sendNotificationViaTemplate } from '@/lib/whatsapp'
import type { NotificationPayload } from './types'

export async function sendNotification(payload: NotificationPayload): Promise<void> {
  await sendNotificationViaTemplate(payload)
}
```

- [ ] **Step 2: Typecheck**

```bash
pnpm typecheck
```
Expected: No errors. `leaves.ts` and `daily-updates.ts` call sites are unchanged — they still import `sendNotification` from `@/lib/notifications/send`, which still exists.

- [ ] **Step 3: Commit**

```bash
git add lib/notifications/send.ts
git commit -m "refactor: send.ts delegates to lib/whatsapp — removes n8n HTTP call"
```

---

## Task 4: Rewrite /api/send-daily-reminder/route.ts

**Files:**
- Rewrite: `app/api/send-daily-reminder/route.ts`
- Create: `app/api/send-daily-reminder/route.test.ts`

- [ ] **Step 1: Write failing auth tests**

Create `app/api/send-daily-reminder/route.test.ts`:

```typescript
import { describe, it, expect } from 'vitest'
import { GET } from './route'
import { NextRequest } from 'next/server'

function makeRequest(opts: { authHeader?: string; webhookSecret?: string; companyId?: string } = {}) {
  const url = new URL(`http://localhost/api/send-daily-reminder${opts.companyId ? `?company_id=${opts.companyId}` : ''}`)
  const headers = new Headers()
  if (opts.authHeader) headers.set('authorization', opts.authHeader)
  if (opts.webhookSecret) headers.set('x-webhook-secret', opts.webhookSecret)
  return new NextRequest(url, { headers })
}

describe('GET /api/send-daily-reminder', () => {
  it('returns 401 with no auth', async () => {
    const res = await GET(makeRequest())
    expect(res.status).toBe(401)
  })

  it('returns 401 with wrong cron secret', async () => {
    process.env.CRON_SECRET = 'correct'
    const res = await GET(makeRequest({ authHeader: 'Bearer wrong' }))
    expect(res.status).toBe(401)
    delete process.env.CRON_SECRET
  })

  it('returns 400 when no company_id and no CRON_COMPANY_ID env', async () => {
    process.env.CRON_SECRET = 'test-secret'
    process.env.INTERNAL_WEBHOOK_SECRET = 'test-secret'
    delete process.env.CRON_COMPANY_ID
    const res = await GET(makeRequest({ authHeader: 'Bearer test-secret' }))
    expect(res.status).toBe(400)
    delete process.env.CRON_SECRET
    delete process.env.INTERNAL_WEBHOOK_SECRET
  })
})
```

- [ ] **Step 2: Run tests — expect FAIL**

```bash
pnpm test app/api/send-daily-reminder/route.test.ts
```
Expected: FAIL — import fails because route is not yet rewritten

- [ ] **Step 3: Rewrite app/api/send-daily-reminder/route.ts**

```typescript
export const dynamic = 'force-dynamic'
export const revalidate = 0

import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { sendWhatsAppTemplate, formatPhone } from '@/lib/whatsapp'

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

function adminSupabase() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  )
}

function isAuthorized(request: NextRequest): boolean {
  const cronSecret = process.env.CRON_SECRET
  const webhookSecret = process.env.INTERNAL_WEBHOOK_SECRET
  const authHeader = request.headers.get('authorization')
  if (cronSecret && authHeader === `Bearer ${cronSecret}`) return true
  const webhookHeader = request.headers.get('x-webhook-secret')
  if (webhookSecret && webhookHeader === webhookSecret) return true
  return false
}

function getCompanyId(request: NextRequest): string | null {
  const fromParam = request.nextUrl.searchParams.get('company_id')
  if (fromParam && UUID_RE.test(fromParam)) return fromParam
  const fromEnv = process.env.CRON_COMPANY_ID
  if (fromEnv && UUID_RE.test(fromEnv)) return fromEnv
  return null
}

// Vercel Cron calls this at 9:30 AM IST (0 4 * * * UTC).
// Also callable manually with x-webhook-secret + ?company_id=UUID.
// Sends grofast_daily_reminder to active members who haven't submitted today.
export async function GET(request: NextRequest) {
  if (!isAuthorized(request)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const companyId = getCompanyId(request)
  if (!companyId) {
    return NextResponse.json(
      { error: 'company_id required — provide ?company_id=UUID or set CRON_COMPANY_ID env var' },
      { status: 400 }
    )
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
      const ok = await sendWhatsAppTemplate(formatPhone(m.phone), 'grofast_daily_reminder', [m.name, dateLabel])
      if (ok) sent++
      else { failed++; failedNames.push(m.name) }
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
```

- [ ] **Step 4: Run tests — expect PASS**

```bash
pnpm test app/api/send-daily-reminder/route.test.ts
```
Expected: All 3 auth tests PASS

- [ ] **Step 5: Commit**

```bash
git add app/api/send-daily-reminder/route.ts app/api/send-daily-reminder/route.test.ts
git commit -m "feat: send-daily-reminder sends grofast_daily_reminder directly via Meta API"
```

---

## Task 5: Rewrite /api/send-missed-alert/route.ts

**Files:**
- Rewrite: `app/api/send-missed-alert/route.ts`
- Create: `app/api/send-missed-alert/route.test.ts`

- [ ] **Step 1: Write failing auth tests**

Create `app/api/send-missed-alert/route.test.ts`:

```typescript
import { describe, it, expect } from 'vitest'
import { GET } from './route'
import { NextRequest } from 'next/server'

function makeRequest(opts: { authHeader?: string; webhookSecret?: string; companyId?: string } = {}) {
  const url = new URL(`http://localhost/api/send-missed-alert${opts.companyId ? `?company_id=${opts.companyId}` : ''}`)
  const headers = new Headers()
  if (opts.authHeader) headers.set('authorization', opts.authHeader)
  if (opts.webhookSecret) headers.set('x-webhook-secret', opts.webhookSecret)
  return new NextRequest(url, { headers })
}

describe('GET /api/send-missed-alert', () => {
  it('returns 401 with no auth', async () => {
    const res = await GET(makeRequest())
    expect(res.status).toBe(401)
  })

  it('returns 401 with wrong cron secret', async () => {
    process.env.CRON_SECRET = 'correct'
    const res = await GET(makeRequest({ authHeader: 'Bearer wrong' }))
    expect(res.status).toBe(401)
    delete process.env.CRON_SECRET
  })

  it('returns 400 when no company_id and no CRON_COMPANY_ID env', async () => {
    process.env.CRON_SECRET = 'test-secret'
    process.env.INTERNAL_WEBHOOK_SECRET = 'test-secret'
    delete process.env.CRON_COMPANY_ID
    const res = await GET(makeRequest({ authHeader: 'Bearer test-secret' }))
    expect(res.status).toBe(400)
    delete process.env.CRON_SECRET
    delete process.env.INTERNAL_WEBHOOK_SECRET
  })
})
```

- [ ] **Step 2: Run tests — expect FAIL**

```bash
pnpm test app/api/send-missed-alert/route.test.ts
```
Expected: FAIL — route not yet rewritten

- [ ] **Step 3: Rewrite app/api/send-missed-alert/route.ts**

```typescript
export const dynamic = 'force-dynamic'
export const revalidate = 0

import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { sendWhatsAppTemplate, formatPhone } from '@/lib/whatsapp'

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

function adminSupabase() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  )
}

function isAuthorized(request: NextRequest): boolean {
  const cronSecret = process.env.CRON_SECRET
  const webhookSecret = process.env.INTERNAL_WEBHOOK_SECRET
  const authHeader = request.headers.get('authorization')
  if (cronSecret && authHeader === `Bearer ${cronSecret}`) return true
  const webhookHeader = request.headers.get('x-webhook-secret')
  if (webhookSecret && webhookHeader === webhookSecret) return true
  return false
}

function getCompanyId(request: NextRequest): string | null {
  const fromParam = request.nextUrl.searchParams.get('company_id')
  if (fromParam && UUID_RE.test(fromParam)) return fromParam
  const fromEnv = process.env.CRON_COMPANY_ID
  if (fromEnv && UUID_RE.test(fromEnv)) return fromEnv
  return null
}

// Vercel Cron calls this at 9:00 PM IST (30 15 * * * UTC).
// Also callable manually with x-webhook-secret + ?company_id=UUID.
// Sends grofast_missed_update to active members who never submitted today.
export async function GET(request: NextRequest) {
  if (!isAuthorized(request)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const companyId = getCompanyId(request)
  if (!companyId) {
    return NextResponse.json(
      { error: 'company_id required — provide ?company_id=UUID or set CRON_COMPANY_ID env var' },
      { status: 400 }
    )
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
  const missed = (members ?? []).filter((m: any) => !submittedIds.has(m.id) && m.phone)

  let sent = 0
  let failed = 0
  const failedNames: string[] = []

  await Promise.all(
    missed.map(async (m: any) => {
      const ok = await sendWhatsAppTemplate(formatPhone(m.phone), 'grofast_missed_update', [m.name, dateLabel])
      if (ok) sent++
      else { failed++; failedNames.push(m.name) }
    })
  )

  return NextResponse.json({
    date: today,
    missedCount: missed.length,
    sent,
    failed,
    failedNames,
    sentAt: new Date().toISOString(),
  })
}
```

- [ ] **Step 4: Run tests — expect PASS**

```bash
pnpm test app/api/send-missed-alert/route.test.ts
```
Expected: All 3 auth tests PASS

- [ ] **Step 5: Commit**

```bash
git add app/api/send-missed-alert/route.ts app/api/send-missed-alert/route.test.ts
git commit -m "feat: send-missed-alert sends grofast_missed_update directly via Meta API"
```

---

## Task 6: Create vercel.json with cron schedules

**Files:**
- Create: `vercel.json`

- [ ] **Step 1: Create vercel.json**

```json
{
  "crons": [
    {
      "path": "/api/send-daily-reminder",
      "schedule": "0 4 * * *"
    },
    {
      "path": "/api/send-missed-alert",
      "schedule": "30 15 * * *"
    }
  ]
}
```

Schedules are in UTC. `0 4 * * *` = 9:30 AM IST. `30 15 * * *` = 9:00 PM IST.

- [ ] **Step 2: Commit**

```bash
git add vercel.json
git commit -m "chore: add Vercel Cron schedules for daily reminder and missed alert"
```

---

## Task 7: Remove n8n fallback from lib/actions/team.ts

**Files:**
- Modify: `lib/actions/team.ts`

- [ ] **Step 1: Delete the n8n fallback block**

In `lib/actions/team.ts`, the `notifyWhatsApp` function has a fallback at lines 69–92:

```typescript
    } else {
      // Fallback: forward to n8n webhook
      const url = process.env.N8N_WEBHOOK_URL
      if (!url) return

      const res = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(process.env.N8N_WEBHOOK_SECRET
            ? { 'x-webhook-secret': process.env.N8N_WEBHOOK_SECRET }
            : {}),
        },
        body: JSON.stringify(payload),
      })
      if (!res.ok) {
        status = 'failed'
      } else {
        try {
          const json = await res.json()
          providerRef = json?.executionId ?? json?.id ?? null
        } catch { /* response body not required */ }
      }
    }
```

Remove that entire `else` block. The condition that wraps it (`if (metaToken && metaPhoneId)`) becomes an unconditional block — remove the `if` wrapper too, keeping only the direct Meta API call body.

After the edit, the `notifyWhatsApp` function's try block should look like:

```typescript
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
          to: payload.phone,
          type: 'template',
          template: {
            name: templateName,
            language: { code: 'en' },
            components: [
              {
                type: 'body',
                parameters: [
                  { type: 'text', text: payload.name },
                  { type: 'text', text: payload.employee_id },
                  { type: 'text', text: payload.email },
                  { type: 'text', text: payload.password },
                  { type: 'text', text: payload.team || 'Team' },
                  { type: 'text', text: payload.loginLink },
                ],
              },
            ],
          },
        }),
      }
    )
    const json = await res.json().catch(() => ({}))
    if (!res.ok) {
      status = 'failed'
      console.error('[notifyWhatsApp] Meta API error:', json)
    } else {
      providerRef = json?.messages?.[0]?.id ?? null
    }
  } catch (err) {
    status = 'failed'
    console.error('[notifyWhatsApp] fetch failed:', err)
  }
```

Also remove the `metaToken` and `metaPhoneId` guard — they are always required now. Add a guard at the top of the function body instead:

```typescript
  const metaToken   = process.env.META_WHATSAPP_TOKEN
  const metaPhoneId = process.env.META_PHONE_NUMBER_ID
  if (!metaToken || !metaPhoneId) {
    console.warn('[notifyWhatsApp] META credentials not set — skipping onboarding WhatsApp')
    return
  }
```

- [ ] **Step 2: Typecheck**

```bash
pnpm typecheck
```
Expected: No errors

- [ ] **Step 3: Commit**

```bash
git add lib/actions/team.ts
git commit -m "refactor: remove n8n fallback from notifyWhatsApp — Meta API only"
```

---

## Task 8: Update .env.local.example

**Files:**
- Modify: `.env.local.example`

- [ ] **Step 1: Replace the n8n section and add new vars**

Remove this block entirely (lines 17–22):

```
# ============================================================
# n8n WHATSAPP WEBHOOK
# After creating the n8n workflow, paste the webhook URL here.
# Get it from: n8n → your workflow → Webhook node → copy URL
# ============================================================
N8N_WEBHOOK_URL=https://YOUR_N8N_INSTANCE/
N8N_WEBHOOK_SECRET=CHOOSE_A_RANDOM_SECRET_STRING
```

Replace the `INTERNAL_WEBHOOK_SECRET` comment (lines 24–29) with:

```
# ============================================================
# VERCEL CRON AUTH
# CRON_SECRET: Vercel auto-generates this — copy from Vercel dashboard → Settings → Environment Variables
# CRON_COMPANY_ID: Your company UUID from Supabase companies table
# ============================================================
CRON_SECRET=COPY_FROM_VERCEL_DASHBOARD
CRON_COMPANY_ID=YOUR_COMPANY_UUID

# ============================================================
# INTERNAL WEBHOOK SECRET
# Used to manually trigger cron endpoints (e.g. for testing)
# Generate with: openssl rand -hex 32
# ============================================================
INTERNAL_WEBHOOK_SECRET=CHOOSE_A_RANDOM_SECRET_STRING
```

Also update the comment on the META section (line 40) — remove "bypasses n8n":

```
# ============================================================
# META WHATSAPP CLOUD API
# Get from: Meta Business Suite → WhatsApp → API Setup
# ============================================================
```

- [ ] **Step 2: Commit**

```bash
git add .env.local.example
git commit -m "chore: update .env.local.example — replace n8n vars with CRON_SECRET + CRON_COMPANY_ID"
```

---

## Task 9: Delete dead files

**Files:**
- Delete: `app/api/webhooks/notify/route.ts`
- Delete: `n8n-workflows/` directory

- [ ] **Step 1: Delete the notify route**

```bash
git rm app/api/webhooks/notify/route.ts
```

- [ ] **Step 2: Delete n8n-workflows directory**

```bash
git rm -r n8n-workflows/
```

- [ ] **Step 3: Commit**

```bash
git commit -m "chore: delete app/api/webhooks/notify and n8n-workflows — no longer needed"
```

---

## Task 10: Run full test suite + typecheck + push

- [ ] **Step 1: Run all tests**

```bash
pnpm test
```
Expected: All tests PASS — formatPhone (4), TEMPLATE_MAP (4), sendNotificationViaTemplate (2), auth tests for both cron endpoints (6) = 16 total

- [ ] **Step 2: Typecheck**

```bash
pnpm typecheck
```
Expected: No errors

- [ ] **Step 3: Push**

```bash
git push
```

- [ ] **Step 4: Add env vars in Vercel dashboard**

In Vercel → Project → Settings → Environment Variables, add:
- `CRON_SECRET` — Vercel may have auto-created this; if not, generate with `openssl rand -hex 32`
- `CRON_COMPANY_ID` — your company UUID from Supabase `companies` table

Vercel will automatically use `CRON_SECRET` to authenticate cron job calls to your endpoints.

- [ ] **Step 5: Verify cron is registered**

After deploy, go to Vercel → Project → Cron Jobs tab. You should see:
- `/api/send-daily-reminder` — `0 4 * * *`
- `/api/send-missed-alert` — `30 15 * * *`

- [ ] **Step 6: Manual smoke test**

Trigger each endpoint manually with curl to confirm it returns 200:

```bash
curl -H "x-webhook-secret: YOUR_INTERNAL_WEBHOOK_SECRET" \
  "https://your-app.vercel.app/api/send-daily-reminder?company_id=YOUR_COMPANY_UUID"
```

Expected response:
```json
{ "date": "2026-05-03", "pendingCount": 3, "sent": 3, "failed": 0, "failedNames": [], "sentAt": "..." }
```
