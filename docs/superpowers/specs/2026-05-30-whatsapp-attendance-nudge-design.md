# WhatsApp Attendance Nudge — Design Spec
**Date:** 2026-05-30  
**Status:** Approved

## Context

Employees frequently forget to mark attendance in the app. Instead of requiring them to open the app, the system proactively sends a WhatsApp message at 10:00 AM IST to anyone who hasn't clocked in. The employee replies (tap a button or type freely), and the system automatically updates `attendance_logs` — no app interaction needed.

---

## System Flow

```
[10:00 AM IST — Vercel Cron]
    ↓
/api/cron/attendance-nudge
  → Query all active employees (status='active') across all companies
  → Skip employees who already have attendance_logs record for today
  → Skip employees who have an approved leave for today
  → For remaining: send WhatsApp template "grofast_attendance_nudge"
    ↓
[Employee WhatsApp]
  "Hi Rahul, you haven't marked your attendance yet today (30 May).
   What's your work status?"
   [In Office]  [Work from Home]  [On Leave]
    ↓ (tap button OR type a reply)
    ↓
/api/webhooks/whatsapp (existing route, new handler added)
  → Button tap?   → attendance_office/wfh/shoot → clockIn(work_type); attendance_leave → markAbsent()
  → Typed text?   → Claude Haiku API → JSON { work_type, present }
  → Already clocked in? → reply "Already marked ✅, no action needed"
  → Unrecognizable? → reply with error + resend button options
  → Insert into attendance_logs (service role, bypass JWT)
  → Send WhatsApp confirmation: "Got it! Marked as [status] ✅"
```

---

## WhatsApp Template

**Template name:** `grofast_attendance_nudge`  
**Category:** UTILITY  
**Language:** en

```
Hi {{1}}, you haven't marked your attendance yet today ({{2}}).
What's your work status?
```

**Buttons (quick reply):**
| Button label | button_id |
|---|---|
| In Office | `attendance_office` |
| Work from Home | `attendance_wfh` |
| On Leave | `attendance_leave` |

> One-time setup: Create and submit for approval in Meta Business Manager. Typical approval: ~1 hour.
> Add to `TEMPLATE_MAP` in `lib/whatsapp.ts` once approved.

---

## AI Interpretation (Claude Haiku)

Used only when employee types free text instead of tapping a button.

**Model:** `claude-haiku-4-5-20251001`  
**Prompt:**
```
The employee replied to an attendance check-in request: "{reply}"
Determine their work status.
Return JSON only, no explanation: { "work_type": "office" | "wfh" | "shoot" | "leave", "present": true | false }
```

**Examples handled:**
- "office aa gaya" → `{ work_type: "office", present: true }`
- "ghar se kaam karunga" → `{ work_type: "wfh", present: true }`
- "chutti hai" → `{ work_type: "leave", present: false }` → triggers `markAbsent()`
- "shoot pe hoon" → `{ work_type: "shoot", present: true }`

> When `present: false` (or `work_type: "leave"`): call `markAbsent()` — do NOT insert a clock_in.  
> When `present: true`: call `clockIn(work_type)` with the resolved work_type.

---

## Files to Create / Modify

### New
- `app/api/cron/attendance-nudge/route.ts` — cron handler

### Modified
- `app/api/webhooks/whatsapp/route.ts` — add `handleAttendanceReply()`
- `lib/whatsapp.ts` — add `grofast_attendance_nudge` to TEMPLATE_MAP
- `vercel.json` — add cron entry `{ path: "/api/cron/attendance-nudge", schedule: "30 4 * * *" }`
- `package.json` — add `@anthropic-ai/sdk`

### No new DB tables needed
`attendance_logs` already has:
- `(company_id, user_id, date)` unique constraint — prevents duplicate inserts
- `work_type`: `'office' | 'wfh' | 'shoot'`
- `clock_in`: timestamp — set to time of WhatsApp reply
- `status`: derived from presence

---

## Edge Case Handling

| Scenario | Behaviour |
|---|---|
| Employee clocked in before 10 AM | Cron skips — no message sent |
| Employee has approved leave today | Cron skips — checks `leaves` table |
| Employee taps button but already clocked in | Webhook detects existing record → replies "Already marked ✅" |
| Employee types unrecognizable text | Claude returns null → reply "Didn't understand. Tap a button:" + re-send options |
| Two nudges sent (retry / duplicate webhook) | `attendance_logs` unique constraint blocks double insert |
| Employee has no phone number on file | Cron skips that employee silently |

---

## New Environment Variable

```bash
ANTHROPIC_API_KEY=   # Server-only — for Claude Haiku AI interpretation
```

---

## Verification

1. **Cron test** — hit `/api/cron/attendance-nudge` manually with `Authorization: Bearer {CRON_SECRET}`. Confirm WhatsApp messages delivered to employees without today's attendance.
2. **Button reply** — tap "In Office" from the WhatsApp message. Confirm `attendance_logs` row created with `work_type='office'` and `clock_in` timestamp. Confirm confirmation message received.
3. **Free text reply** — type "ghar se kaam karunga". Confirm `work_type='wfh'` inserted. Confirm Claude interpreted correctly.
4. **Already clocked in** — trigger webhook for an employee who already has a record today. Confirm "Already marked ✅" reply and no duplicate insert.
5. **Approved leave skip** — employee with approved leave for today should not receive a nudge.
6. **Admin view** — open admin attendance page and confirm the auto-marked entries appear correctly.
