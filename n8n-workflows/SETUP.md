# n8n Workflows Setup Guide

## Step 1 — Store these in n8n Variables
Settings → Variables → Create:

| Variable Name              | Value                          |
|---------------------------|--------------------------------|
| SUPABASE_URL              | https://xxxx.supabase.co       |
| SUPABASE_SERVICE_ROLE_KEY | your-service-role-key          |
| COMPANY_ID                | your-company-uuid-from-db      |

---

## Step 2 — HTTP Request Headers (used in WF1, WF2, WF3)

Add these to every Supabase HTTP Request node:
| Header        | Value                                       |
|--------------|---------------------------------------------|
| apikey        | {{ $vars.SUPABASE_SERVICE_ROLE_KEY }}       |
| Authorization | Bearer {{ $vars.SUPABASE_SERVICE_ROLE_KEY }}|

---

## Step 3 — HTTP Request URLs (WF1, WF2, WF3)

### Get Users
```
GET {{ $vars.SUPABASE_URL }}/rest/v1/users
    ?company_id=eq.{{ $vars.COMPANY_ID }}
    &status=eq.active
    &select=id,name,employee_id,phone,role
```

### Get Today Attendance Logs
```
GET {{ $vars.SUPABASE_URL }}/rest/v1/attendance_logs
    ?date=eq.{{ $now.format('yyyy-MM-dd') }}
    &select=user_id,clock_in
```

### Get This Month Attendance Logs
```
GET {{ $vars.SUPABASE_URL }}/rest/v1/attendance_logs
    ?date=gte.{{ $now.startOf('month').format('yyyy-MM-dd') }}
    &date=lte.{{ $now.format('yyyy-MM-dd') }}
    &select=user_id,clock_in
```

### Get Today Daily Updates (WF3 only)
```
GET {{ $vars.SUPABASE_URL }}/rest/v1/daily_updates
    ?date=eq.{{ $now.format('yyyy-MM-dd') }}
    &select=user_id,working_hours
```

---

## Step 4 — Schedule Triggers

| Workflow | Cron (UTC)      | IST Time           |
|---------|-----------------|--------------------|
| WF1     | 0 4 * * 1-6     | 9:30 AM Mon–Sat    |
| WF2     | 30 4 * * 1-6    | 10:00 AM Mon–Sat   |
| WF3     | 30 15 * * 1-6   | 9:00 PM Mon–Sat    |
| WF5     | 30 3 * * 1      | 9:00 AM Monday     |

> IST = UTC+5:30 | India uses UTC+5:30 year-round (no DST)

---

## Step 5 — WF4 Webhook URL (Event Router)

WF4 receives ALL real-time events from the app — leave requests, leave decisions, low hours alerts, and daily update notifications. One webhook handles all of them via IF routing.

After creating the Webhook node in n8n, copy its URL and add it to Vercel environment variables:

```
N8N_WEBHOOK_URL=https://your-n8n-instance.app/webhook/grofast/events
N8N_WEBHOOK_SECRET=some-random-secret-string
INTERNAL_WEBHOOK_SECRET=same-secret-or-different-one
```

The app sends `x-webhook-secret` header with every POST. The n8n Webhook node does not validate this by default — your n8n instance should be behind auth or a private URL. If you want header auth in n8n: open the Webhook node → Authentication → Header Auth → set name `x-webhook-secret` and value matching `N8N_WEBHOOK_SECRET`.

---

## Step 6 — WF5 Config Node (Weekly Report)

Open the Config node in WF5 and fill in:

| Field                    | Value                                      |
|-------------------------|--------------------------------------------|
| APP_URL                 | https://grofastteam.vercel.app             |
| INTERNAL_WEBHOOK_SECRET | same value as your Vercel env var          |
| COMPANY_ID              | your-company-uuid-from-db                  |
| ADMIN_PHONE             | 91XXXXXXXXXX (WhatsApp number with country code) |

Also add to Vercel environment variables:
```
APP_BASE_URL=https://grofastteam.vercel.app
```

---

## Step 7 — WhatsApp Business Node Config

For all workflows:
- Credential  : your connected WhatsApp Business account
- Resource     : Message
- Operation    : Send
- To           : {{ $json.phone }} (or {{ $json.adminPhone }} where noted)
- Message Type : Text
- Text Body    : {{ $json.message }}

---

## Final Workflow Structures

### WF1 (9:30 AM Member Alert) — sends to each member not clocked in
```
Schedule Trigger → Config → Get Users → Get Today Logs → Get Month Logs
→ Build Member Alerts (Code) → Loop Over Items → WhatsApp
```

### WF2 (10:00 AM Admin Report) — sends one message to admin
```
Schedule Trigger → Config → Get Users → Get Today Logs → Get Month Logs
→ Build Admin Report (Code) → WhatsApp Admin
```

### WF3 (9:00 PM Update Reminder) — sends to members with missing/low-hours update
```
Schedule Trigger → Config → Get Users → Get Today Att Logs → Get Today Updates
→ Build Reminders (Code) → Loop Over Items → Check Type (IF)
  → [no_update] WhatsApp No Update
  → [low_hours]  WhatsApp Low Hours
```

### WF4 (Real-time Event Router) — webhook, fires instantly from the app
```
Webhook (POST /grofast/events)
→ IF leave.submitted
    [True]  → Format Leave Submitted → WA Admin
    [False] → IF leave.approved OR leave.rejected
                [True]  → Format Leave Status → WA Employee
                [False] → IF hours.underperformance
                            [True]  → Format Hours Alert → WA Admin
                            [False] → IF daily_update.submitted
                                        [True]  → Format Daily Update → WA Admin
```

### WF5 (Monday 9 AM Weekly Report) — sends one message to admin
```
Schedule Trigger → Config → GET /api/weekly-report
→ Format Weekly Report (Code) → WhatsApp Admin
```

---

## Events handled by WF4

| Event                    | Trigger                              | Recipient |
|-------------------------|--------------------------------------|-----------|
| `leave.submitted`        | Member applies for leave             | Admin     |
| `leave.approved`         | Admin approves leave                 | Employee  |
| `leave.rejected`         | Admin rejects leave                  | Employee  |
| `hours.underperformance` | Member submits daily update < 9h     | Admin     |
| `daily_update.submitted` | Member submits daily update >= 9h    | Admin     |
