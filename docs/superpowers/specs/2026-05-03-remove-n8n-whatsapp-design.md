# Remove n8n — Direct WhatsApp via Vercel Cron

**Date:** 2026-05-03
**Status:** Approved

## Goal

Replace n8n entirely. WhatsApp messages are sent directly via the Meta Cloud API from Next.js. Scheduled jobs run as Vercel Cron. No external workflow tool required.

---

## Active Templates

Only two approved templates exist today:

| Template name | Trigger | Recipients | Params |
|---|---|---|---|
| `grofast_daily_reminder` | 9:30 AM IST daily | Members who haven't submitted yet | `{{1}}` name, `{{2}}` date |
| `grofast_missed_update` | 9:00 PM IST daily | Members who never submitted | `{{1}}` name, `{{2}}` date |

All other notification events (leave, daily_update.submitted, hours.underperformance) have no approved template. They are skipped silently with a warning log. Adding a template later requires one line in `TEMPLATE_MAP`.

---

## Architecture

```
Vercel Cron (9:30 AM UTC+5:30)
  → GET /api/send-daily-reminder
  → queries Supabase for pending members
  → calls sendWhatsAppTemplate() for each
  → Meta WhatsApp Cloud API

Vercel Cron (9:00 PM UTC+5:30)
  → GET /api/send-missed-alert
  → queries Supabase for missed members
  → calls sendWhatsAppTemplate() for each
  → Meta WhatsApp Cloud API

Server Action (leaves.ts, daily-updates.ts)
  → sendNotification(payload)          [unchanged call site]
  → lib/notifications/send.ts          [rewritten — no HTTP to n8n]
  → TEMPLATE_MAP lookup
  → if template exists: sendWhatsAppTemplate()
  → if no template: log + skip
```

---

## Files Changed

### New

| File | Purpose |
|---|---|
| `lib/whatsapp.ts` | Core Meta API caller, phone formatter, `TEMPLATE_MAP` |
| `vercel.json` | Cron schedules (2 jobs) |

### Modified

| File | Change |
|---|---|
| `lib/notifications/send.ts` | Rewrite — call `lib/whatsapp.ts` instead of posting to n8n |
| `app/api/send-daily-reminder/route.ts` | Add direct WhatsApp sending + dual auth (CRON_SECRET + x-webhook-secret) + CRON_COMPANY_ID fallback |
| `app/api/send-missed-alert/route.ts` | Same as above |
| `lib/actions/team.ts` | Remove n8n fallback block (lines 70–92 in current file) |
| `.env.local.example` | Remove N8N_WEBHOOK_URL + N8N_WEBHOOK_SECRET, add CRON_SECRET + CRON_COMPANY_ID |

### Deleted

| File | Reason |
|---|---|
| `app/api/webhooks/notify/route.ts` | Only existed to forward events to n8n |
| `n8n-workflows/` directory | No longer needed |

---

## lib/whatsapp.ts — Spec

```typescript
// Phone normaliser — strips non-digits, prepends 91 for Indian numbers
formatPhone(raw: string): string

// Calls POST https://graph.facebook.com/v19.0/{META_PHONE_NUMBER_ID}/messages
// Returns true on success, false on failure (never throws)
sendWhatsAppTemplate(phone: string, templateName: string, params: string[]): Promise<boolean>

// Maps each NotificationEvent to a WhatsApp template + param builder
// Events with no template entry are skipped silently
const TEMPLATE_MAP: Partial<Record<NotificationEvent, {
  name: string
  buildParams: (payload: NotificationPayload) => string[]
  resolvePhone: (payload: NotificationPayload) => string | null
}>>

// Current entries:
//   daily_update.missing → grofast_missed_update → [employee_name, date]
// All others → no entry → skip
```

---

## lib/notifications/send.ts — Spec

```typescript
export async function sendNotification(payload: NotificationPayload): Promise<void>
  1. Look up payload.event in TEMPLATE_MAP
  2. If not found: console.warn('[notify] no template for {event}, skipping') → return
  3. Resolve phone via resolvePhone(payload)
  4. If no phone: console.warn('[notify] no phone for {event}, skipping') → return
  5. Call sendWhatsAppTemplate(phone, name, buildParams(payload))
```

No HTTP to n8n. No env var for n8n. Call sites in `leaves.ts` and `daily-updates.ts` are unchanged.

---

## Cron Endpoint Auth — Spec

Both `/api/send-daily-reminder` and `/api/send-missed-alert` accept two auth methods:

1. **Vercel Cron** — `Authorization: Bearer ${CRON_SECRET}` header (Vercel injects automatically)
2. **Manual/external** — `x-webhook-secret: ${INTERNAL_WEBHOOK_SECRET}` header (existing pattern)

Either header is sufficient. If neither matches → 401.

Company ID resolution order:
1. `?company_id=` query param (existing callers)
2. `CRON_COMPANY_ID` env var (Vercel cron — no query param possible)
3. Missing both → 400

---

## vercel.json — Spec

```json
{
  "crons": [
    { "path": "/api/send-daily-reminder", "schedule": "0 4 * * *" },
    { "path": "/api/send-missed-alert",   "schedule": "30 15 * * *" }
  ]
}
```

Schedules are UTC. Vercel Cron is available on all plans (Hobby included, 2 jobs/day free).

---

## Environment Variables

### Remove
- `N8N_WEBHOOK_URL`
- `N8N_WEBHOOK_SECRET`

### Add
| Var | Value | Notes |
|---|---|---|
| `CRON_SECRET` | random 32-char hex | Vercel auto-creates this in dashboard; copy to `.env.local` for local testing |
| `CRON_COMPANY_ID` | your company UUID | From Supabase `companies` table |

### Unchanged
- `META_WHATSAPP_TOKEN`
- `META_PHONE_NUMBER_ID`
- `INTERNAL_WEBHOOK_SECRET` (kept for manual triggers)

---

## What Is Not Changed

- `lib/notifications/types.ts` — types are correct, no changes needed
- `lib/actions/leaves.ts` — call site unchanged
- `lib/actions/daily-updates.ts` — call site unchanged
- `app/api/alerts/route.ts` — still used for admin dashboard widget
- `app/api/weekly-report/route.ts` — kept as-is (no template, cron not added)

---

## Out of Scope

- Weekly report WhatsApp message — no template, not wired to cron
- Leave / daily_update.submitted / hours.underperformance WhatsApp — no template
- Multi-company cron support — single `CRON_COMPANY_ID` is sufficient for current scale
