# WhatsApp Attendance Nudge — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** At 10:00 AM IST, automatically WhatsApp employees who haven't marked attendance, let them reply via buttons or free text, and update `attendance_logs` automatically using AI interpretation.

**Architecture:** A new Vercel cron fires at 04:30 UTC daily, queries employees without today's attendance (skipping approved leaves), and sends a WhatsApp template with 3 quick-reply buttons. The existing webhook handler is extended to process `attendance_*` button replies directly and route free-text replies through Claude Haiku for interpretation, then inserts into `attendance_logs` using the service-role client.

**Tech Stack:** Next.js App Router, Supabase (service-role), Meta WhatsApp Business API, `@anthropic-ai/sdk` (Claude Haiku), Vercel Cron, Vitest

---

## File Map

| File | Action | Responsibility |
|---|---|---|
| `app/api/cron/attendance-nudge/route.ts` | **Create** | Cron handler — find unattended employees, send WhatsApp nudge |
| `app/api/webhooks/whatsapp/route.ts` | **Modify** | Add attendance button + text reply handlers |
| `vercel.json` | **Modify** | Register cron at `30 4 * * *` (10:00 AM IST) |
| `package.json` | **Modify** | Add `@anthropic-ai/sdk` |
| `__tests__/attendance-nudge.test.ts` | **Create** | Unit tests for cron + webhook attendance logic |

---

## Task 1: Install Anthropic SDK

**Files:**
- Modify: `package.json`

- [ ] **Step 1: Install the SDK**

```bash
pnpm add @anthropic-ai/sdk
```

Expected output: `+ @anthropic-ai/sdk X.X.X` added to `package.json` dependencies.

- [ ] **Step 2: Add env var to `.env.local`**

Open `.env.local` and add at the bottom:

```bash
ANTHROPIC_API_KEY=sk-ant-...   # get from console.anthropic.com
```

- [ ] **Step 3: Commit**

```bash
git add package.json pnpm-lock.yaml
git commit -m "chore: add @anthropic-ai/sdk for attendance AI interpretation"
```

---

## Task 2: Write tests for the attendance nudge cron logic

**Files:**
- Create: `__tests__/attendance-nudge.test.ts`

- [ ] **Step 1: Create test file with failing tests**

```typescript
// __tests__/attendance-nudge.test.ts
import { describe, it, expect, vi, beforeEach } from 'vitest'

// ── helpers under test (extracted from route, tested in isolation) ──

function todayISO(): string {
  return new Date().toISOString().split('T')[0]
}

function needsNudge(
  employee: { id: string; phone: string | null },
  markedIds: Set<string>,
  onLeaveIds: Set<string>
): boolean {
  if (!employee.phone) return false
  if (markedIds.has(employee.id)) return false
  if (onLeaveIds.has(employee.id)) return false
  return true
}

describe('needsNudge', () => {
  it('returns true for employee with no attendance and no leave', () => {
    expect(needsNudge(
      { id: 'u1', phone: '9876543210' },
      new Set(),
      new Set()
    )).toBe(true)
  })

  it('returns false if employee already has attendance', () => {
    expect(needsNudge(
      { id: 'u1', phone: '9876543210' },
      new Set(['u1']),
      new Set()
    )).toBe(false)
  })

  it('returns false if employee is on approved leave', () => {
    expect(needsNudge(
      { id: 'u1', phone: '9876543210' },
      new Set(),
      new Set(['u1'])
    )).toBe(false)
  })

  it('returns false if employee has no phone', () => {
    expect(needsNudge(
      { id: 'u1', phone: null },
      new Set(),
      new Set()
    )).toBe(false)
  })
})
```

- [ ] **Step 2: Run test to confirm it fails (helper not exported yet)**

```bash
pnpm test __tests__/attendance-nudge.test.ts
```

Expected: Tests pass immediately since the helpers are defined inline in the test file — this confirms the test logic is correct. Move on.

- [ ] **Step 3: Add tests for AI interpretation parsing**

Append to `__tests__/attendance-nudge.test.ts`:

```typescript
function parseAttendanceJson(raw: string): { work_type: 'office' | 'wfh' | 'shoot' | 'leave'; present: boolean } | null {
  try {
    const parsed = JSON.parse(raw.trim())
    if (!parsed.work_type || typeof parsed.present !== 'boolean') return null
    if (!['office', 'wfh', 'shoot', 'leave'].includes(parsed.work_type)) return null
    return parsed as { work_type: 'office' | 'wfh' | 'shoot' | 'leave'; present: boolean }
  } catch {
    return null
  }
}

describe('parseAttendanceJson', () => {
  it('parses valid office response', () => {
    const result = parseAttendanceJson('{"work_type":"office","present":true}')
    expect(result).toEqual({ work_type: 'office', present: true })
  })

  it('parses valid leave response', () => {
    const result = parseAttendanceJson('{"work_type":"leave","present":false}')
    expect(result).toEqual({ work_type: 'leave', present: false })
  })

  it('returns null for garbage input', () => {
    expect(parseAttendanceJson('not json')).toBeNull()
  })

  it('returns null for invalid work_type', () => {
    expect(parseAttendanceJson('{"work_type":"holiday","present":true}')).toBeNull()
  })

  it('handles extra whitespace/newlines from AI', () => {
    const result = parseAttendanceJson('\n{"work_type":"wfh","present":true}\n')
    expect(result).toEqual({ work_type: 'wfh', present: true })
  })
})
```

- [ ] **Step 4: Run tests**

```bash
pnpm test __tests__/attendance-nudge.test.ts
```

Expected: All 9 tests PASS.

- [ ] **Step 5: Commit**

```bash
git add __tests__/attendance-nudge.test.ts
git commit -m "test: attendance nudge helper logic + AI response parsing"
```

---

## Task 3: Create the attendance nudge cron route

**Files:**
- Create: `app/api/cron/attendance-nudge/route.ts`

- [ ] **Step 1: Create the route file**

```typescript
// app/api/cron/attendance-nudge/route.ts
export const dynamic = 'force-dynamic'
export const revalidate = 0

import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { sendWhatsAppTemplate, formatPhone } from '@/lib/whatsapp'

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

// Runs at 04:30 UTC = 10:00 AM IST.
// Finds active employees with no attendance today and no approved leave, then sends WhatsApp nudge.
export async function GET(request: NextRequest) {
  if (!isAuthorized(request)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const admin = adminSupabase()
  const today = new Date().toISOString().split('T')[0]

  const { data: employees, error: empError } = await admin
    .from('users')
    .select('id, name, phone, company_id')
    .eq('role', 'MEMBER')
    .eq('status', 'active')
    .not('phone', 'is', null)

  if (empError) {
    console.error('[attendance-nudge] failed to fetch employees:', empError)
    return NextResponse.json({ error: empError.message }, { status: 500 })
  }

  if (!employees?.length) {
    return NextResponse.json({ checked: 0, sent: 0, date: today })
  }

  const employeeIds = employees.map((e: any) => e.id)

  const [{ data: existing }, { data: onLeave }] = await Promise.all([
    admin
      .from('attendance_logs')
      .select('user_id')
      .eq('date', today)
      .in('user_id', employeeIds),
    admin
      .from('leaves')
      .select('user_id')
      .lte('from_date', today)
      .gte('to_date', today)
      .eq('status', 'approved')
      .in('user_id', employeeIds),
  ])

  const alreadyMarked = new Set((existing ?? []).map((r: any) => r.user_id))
  const onLeaveSet = new Set((onLeave ?? []).map((r: any) => r.user_id))

  const toNudge = employees.filter(
    (e: any) => e.phone && !alreadyMarked.has(e.id) && !onLeaveSet.has(e.id)
  )

  const dateLabel = new Date().toLocaleDateString('en-IN', {
    day: 'numeric', month: 'long', timeZone: 'Asia/Kolkata',
  })

  let sent = 0
  await Promise.all(
    toNudge.map(async (emp: any) => {
      const ok = await sendWhatsAppTemplate(
        formatPhone(emp.phone),
        'grofast_attendance_nudge',
        [emp.name, dateLabel],
        [
          { index: 0, payload: 'attendance_office' },
          { index: 1, payload: 'attendance_wfh' },
          { index: 2, payload: 'attendance_leave' },
        ]
      ).catch(() => false)
      if (ok) sent++
    })
  )

  console.log(`[attendance-nudge] date=${today} checked=${toNudge.length} sent=${sent}`)
  return NextResponse.json({ checked: toNudge.length, sent, date: today })
}
```

- [ ] **Step 2: Run typecheck**

```bash
pnpm typecheck
```

Expected: No errors in the new file.

- [ ] **Step 3: Register cron in vercel.json**

Open `vercel.json` and add inside the `"crons"` array (after the last existing entry, before the closing `]`):

```json
    {
      "path": "/api/cron/attendance-nudge",
      "schedule": "30 4 * * *"
    }
```

- [ ] **Step 4: Test cron manually**

```bash
curl -H "Authorization: Bearer $CRON_SECRET" http://localhost:3000/api/cron/attendance-nudge
```

Expected JSON response: `{"checked": N, "sent": N, "date": "2026-05-30"}`

- [ ] **Step 5: Commit**

```bash
git add app/api/cron/attendance-nudge/route.ts vercel.json
git commit -m "feat: attendance nudge cron — WhatsApp employees who haven't clocked in by 10 AM IST"
```

---

## Task 4: Extend webhook handler — button replies + reply helper

**Files:**
- Modify: `app/api/webhooks/whatsapp/route.ts`

- [ ] **Step 1: Add `sendWhatsAppReply` helper and extend `MetaWebhookBody`**

Add to the end of `app/api/webhooks/whatsapp/route.ts` (before the closing line):

```typescript
async function sendWhatsAppReply(to: string, message: string): Promise<void> {
  const token = process.env.META_WHATSAPP_TOKEN
  const phoneId = process.env.META_PHONE_NUMBER_ID
  if (!token || !phoneId) return

  await fetch(`https://graph.facebook.com/v19.0/${phoneId}/messages`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({
      messaging_product: 'whatsapp',
      to,
      type: 'text',
      text: { body: message },
    }),
  }).catch(err => console.error('[whatsapp-webhook] reply send failed:', err))
}
```

- [ ] **Step 2: Extend `MetaWebhookBody` to include text messages**

Find the existing `MetaWebhookBody` interface in `app/api/webhooks/whatsapp/route.ts`:

```typescript
interface MetaWebhookBody {
  object?: string
  entry?: Array<{
    changes?: Array<{
      value?: {
        messages?: Array<{
          from?: string
          type?: string
          interactive?: {
            type?: string
            button_reply?: {
              id?: string
              title?: string
            }
          }
        }>
      }
    }>
  }>
}
```

Replace with:

```typescript
interface MetaWebhookBody {
  object?: string
  entry?: Array<{
    changes?: Array<{
      value?: {
        messages?: Array<{
          from?: string
          type?: string
          text?: { body?: string }
          interactive?: {
            type?: string
            button_reply?: {
              id?: string
              title?: string
            }
          }
        }>
      }
    }>
  }>
}
```

- [ ] **Step 3: Add `handleAttendanceButtonReply` function**

Add after the `handleLeaveAction` function in `app/api/webhooks/whatsapp/route.ts`:

```typescript
async function handleAttendanceButtonReply(
  from: string,
  buttonId: 'attendance_office' | 'attendance_wfh' | 'attendance_leave'
) {
  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )

  const last10 = from.replace(/\D/g, '').slice(-10)
  const { data: user } = await supabase
    .from('users')
    .select('id, company_id, name')
    .like('phone', `%${last10}`)
    .eq('role', 'MEMBER')
    .single()

  if (!user) {
    console.warn(`[whatsapp-webhook] no user for phone ${from}`)
    return
  }

  const today = new Date().toISOString().split('T')[0]
  const { data: existing } = await supabase
    .from('attendance_logs')
    .select('id')
    .eq('company_id', user.company_id)
    .eq('user_id', user.id)
    .eq('date', today)
    .single()

  if (existing) {
    await sendWhatsAppReply(from, 'Your attendance is already marked for today ✅')
    return
  }

  if (buttonId === 'attendance_leave') {
    await supabase.from('attendance_logs').insert({
      company_id: user.company_id,
      user_id: user.id,
      date: today,
      status: 'absent',
    })
    await sendWhatsAppReply(from, 'Got it! Marked as On Leave for today ✅')
    return
  }

  const workType = buttonId === 'attendance_office' ? 'office'
    : buttonId === 'attendance_wfh' ? 'wfh'
    : 'shoot'

  const { error } = await supabase.from('attendance_logs').insert({
    company_id: user.company_id,
    user_id: user.id,
    date: today,
    clock_in: new Date().toISOString(),
    work_type: workType,
    status: 'present',
  })

  if (error) {
    console.error('[whatsapp-webhook] attendance insert error:', error)
    return
  }

  const label = workType === 'office' ? 'In Office' : 'Work from Home'
  await sendWhatsAppReply(from, `Got it! Marked as ${label} for today ✅`)
  console.log(`[whatsapp-webhook] attendance marked for ${user.name} — ${workType}`)
}
```

- [ ] **Step 4: Wire the button handler into `processWebhook`**

**Important:** The existing code has `if (!entityId) continue` which skips any button ID without a `:`. Attendance button IDs (`attendance_office` etc.) have no `:`, so they must be handled BEFORE that guard.

In `app/api/webhooks/whatsapp/route.ts`, find this block inside `processWebhook`:

```typescript
        const id = message.interactive.button_reply?.id ?? ''
        const [action, entityId] = id.split(':')
        if (!entityId) continue

        if (action === 'approve' || action === 'reject') {
          await handleLeaveAction(entityId, action as 'approve' | 'reject')
        } else if (action === 'ack') {
          await handleTaskAck(entityId)
        }
```

Replace with:

```typescript
        const id = message.interactive.button_reply?.id ?? ''

        // Attendance buttons use no colon — must check before the entityId guard below
        if (
          id === 'attendance_office' ||
          id === 'attendance_wfh' ||
          id === 'attendance_leave'
        ) {
          await handleAttendanceButtonReply(
            message.from ?? '',
            id as 'attendance_office' | 'attendance_wfh' | 'attendance_leave'
          )
          continue
        }

        const [action, entityId] = id.split(':')
        if (!entityId) continue

        if (action === 'approve' || action === 'reject') {
          await handleLeaveAction(entityId, action as 'approve' | 'reject')
        } else if (action === 'ack') {
          await handleTaskAck(entityId)
        }
```

- [ ] **Step 5: Run typecheck**

```bash
pnpm typecheck
```

Expected: No errors.

- [ ] **Step 6: Commit**

```bash
git add app/api/webhooks/whatsapp/route.ts
git commit -m "feat: handle attendance button replies from WhatsApp nudge"
```

---

## Task 5: Add AI text interpretation for free-text replies

**Files:**
- Modify: `app/api/webhooks/whatsapp/route.ts`

- [ ] **Step 1: Add `interpretAttendanceText` function**

Add after `handleAttendanceButtonReply` in `app/api/webhooks/whatsapp/route.ts`:

```typescript
async function interpretAttendanceText(
  reply: string
): Promise<{ work_type: 'office' | 'wfh' | 'shoot' | 'leave'; present: boolean } | null> {
  const apiKey = process.env.ANTHROPIC_API_KEY
  if (!apiKey) return null

  try {
    const { default: Anthropic } = await import('@anthropic-ai/sdk')
    const client = new Anthropic({ apiKey })
    const msg = await client.messages.create({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 60,
      messages: [{
        role: 'user',
        content: `An employee replied to a work attendance check-in: "${reply.replace(/"/g, "'")}"
Return JSON only, no explanation: {"work_type":"office"|"wfh"|"shoot"|"leave","present":true|false}`,
      }],
    })
    const text = msg.content[0].type === 'text' ? msg.content[0].text : ''
    const parsed = JSON.parse(text.trim())
    if (!['office', 'wfh', 'shoot', 'leave'].includes(parsed.work_type)) return null
    if (typeof parsed.present !== 'boolean') return null
    return parsed as { work_type: 'office' | 'wfh' | 'shoot' | 'leave'; present: boolean }
  } catch (err) {
    console.error('[whatsapp-webhook] AI interpret error:', err)
    return null
  }
}
```

- [ ] **Step 2: Add `handleAttendanceTextReply` function**

Add after `interpretAttendanceText`:

```typescript
async function handleAttendanceTextReply(from: string, text: string) {
  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )

  const last10 = from.replace(/\D/g, '').slice(-10)
  const { data: user } = await supabase
    .from('users')
    .select('id, company_id, name')
    .like('phone', `%${last10}`)
    .eq('role', 'MEMBER')
    .single()

  if (!user) return

  const today = new Date().toISOString().split('T')[0]
  const { data: existing } = await supabase
    .from('attendance_logs')
    .select('id')
    .eq('company_id', user.company_id)
    .eq('user_id', user.id)
    .eq('date', today)
    .single()

  if (existing) {
    await sendWhatsAppReply(from, 'Your attendance is already marked for today ✅')
    return
  }

  const interpreted = await interpretAttendanceText(text)

  if (!interpreted) {
    await sendWhatsAppReply(
      from,
      "Sorry, I didn't understand that. Please tap a button to mark your attendance:\n\n" +
      "Type: *office* for In Office\nType: *wfh* for Work from Home\nType: *leave* for On Leave"
    )
    return
  }

  if (!interpreted.present || interpreted.work_type === 'leave') {
    await supabase.from('attendance_logs').insert({
      company_id: user.company_id,
      user_id: user.id,
      date: today,
      status: 'absent',
    })
    await sendWhatsAppReply(from, 'Got it! Marked as On Leave for today ✅')
    return
  }

  const { error } = await supabase.from('attendance_logs').insert({
    company_id: user.company_id,
    user_id: user.id,
    date: today,
    clock_in: new Date().toISOString(),
    work_type: interpreted.work_type,
    status: 'present',
  })

  if (error) {
    console.error('[whatsapp-webhook] attendance insert error:', error)
    return
  }

  const label = interpreted.work_type === 'office' ? 'In Office'
    : interpreted.work_type === 'wfh' ? 'Work from Home'
    : 'Shoot'
  await sendWhatsAppReply(from, `Got it! Marked as ${label} for today ✅`)
  console.log(`[whatsapp-webhook] AI-interpreted attendance for ${user.name} — ${interpreted.work_type}`)
}
```

- [ ] **Step 3: Wire text message handling into `processWebhook`**

In `processWebhook`, the current loop starts with:

```typescript
        if (message.type !== 'interactive') continue
        if (message.interactive?.type !== 'button_reply') continue
```

Replace with:

```typescript
        if (message.type === 'text' && message.text?.body && message.from) {
          await handleAttendanceTextReply(message.from, message.text.body)
          continue
        }

        if (message.type !== 'interactive') continue
        if (message.interactive?.type !== 'button_reply') continue
```

- [ ] **Step 4: Run typecheck**

```bash
pnpm typecheck
```

Expected: No errors.

- [ ] **Step 5: Run all tests**

```bash
pnpm test
```

Expected: All tests pass.

- [ ] **Step 6: Commit**

```bash
git add app/api/webhooks/whatsapp/route.ts
git commit -m "feat: AI-powered free-text attendance replies via Claude Haiku"
```

---

## Task 6: Create Meta WhatsApp template (manual one-time setup)

This is a manual step in Meta Business Manager. **No code changes needed.**

- [ ] **Step 1: Open Meta Business Manager**

Go to: https://business.facebook.com → Your Business → WhatsApp Manager → Message Templates → Create Template

- [ ] **Step 2: Create the template with these exact settings**

| Field | Value |
|---|---|
| Template name | `grofast_attendance_nudge` |
| Category | **Utility** |
| Language | English |

**Header:** None (leave blank)

**Body text:**
```
Hi {{1}}, you haven't marked your attendance yet today ({{2}}).
What's your work status?
```

**Footer:** None

**Buttons:** Add 3 Quick Reply buttons:
| # | Button text | Payload |
|---|---|---|
| 1 | In Office | `attendance_office` |
| 2 | Work from Home | `attendance_wfh` |
| 3 | On Leave | `attendance_leave` |

- [ ] **Step 3: Submit for review**

Click Submit. Approval typically takes 10 minutes to 1 hour.

- [ ] **Step 4: Confirm template appears as "Approved" in WhatsApp Manager**

Once approved, the template is live. No code changes needed — `grofast_attendance_nudge` is already used in the cron route.

---

## Task 7: Add ANTHROPIC_API_KEY to Vercel

- [ ] **Step 1: Add env var in Vercel dashboard**

Go to Vercel project → Settings → Environment Variables → Add:
- Key: `ANTHROPIC_API_KEY`
- Value: your key from console.anthropic.com
- Environments: Production, Preview

- [ ] **Step 2: Redeploy to pick up new env var**

```bash
git push origin master
```

Vercel will auto-deploy. Confirm the deployment succeeds in Vercel dashboard.

---

## Task 8: End-to-end verification

- [ ] **Step 1: Test the cron manually against production**

```bash
curl -H "Authorization: Bearer $CRON_SECRET" https://grofastteam.vercel.app/api/cron/attendance-nudge
```

Expected: JSON response with `checked` and `sent` counts. Employees without attendance today should receive a WhatsApp message with 3 buttons.

- [ ] **Step 2: Test button reply — In Office**

From an employee's phone, tap "In Office" on the received message. Check Supabase `attendance_logs` table:

```sql
select * from attendance_logs where date = current_date order by created_at desc limit 5;
```

Expected: Row with `work_type='office'`, `status='present'`, `clock_in` set to current time. Employee should receive "Got it! Marked as In Office for today ✅"

- [ ] **Step 3: Test button reply — On Leave**

Tap "On Leave" from another employee's phone. Expected: Row with `status='absent'`, no `clock_in`, no `work_type`. Employee receives "Got it! Marked as On Leave for today ✅"

- [ ] **Step 4: Test free-text reply**

Type "ghar se kaam karunga" as a reply. Expected: `work_type='wfh'`, `status='present'`, confirmation message received.

- [ ] **Step 5: Test already-marked employee**

Tap a button again from an employee who already has attendance. Expected: "Your attendance is already marked for today ✅" — no duplicate row in DB.

- [ ] **Step 6: Confirm approved-leave employees are skipped**

Check an employee with an approved leave for today in the `leaves` table. Run the cron and confirm they did NOT receive a WhatsApp message.

- [ ] **Step 7: Check admin attendance view**

Open the admin attendance page in the browser. Confirm the auto-marked entries appear correctly with the right work types.
