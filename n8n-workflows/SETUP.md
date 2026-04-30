# n8n Workflows Setup Guide

## Step 1 — Store these in n8n Variables
Settings → Variables → Create:

| Variable Name              | Value                          |
|---------------------------|--------------------------------|
| SUPABASE_URL              | https://xxxx.supabase.co       |
| SUPABASE_SERVICE_ROLE_KEY | your-service-role-key          |
| COMPANY_ID                | your-company-uuid-from-db      |

---

## Step 2 — HTTP Request Headers (used in ALL workflows)

Add these to every HTTP Request node:
| Header        | Value                                       |
|--------------|---------------------------------------------|
| apikey        | {{ $vars.SUPABASE_SERVICE_ROLE_KEY }}       |
| Authorization | Bearer {{ $vars.SUPABASE_SERVICE_ROLE_KEY }}|

---

## Step 3 — HTTP Request URLs

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

### Get Today Daily Updates (Workflow 3 only)
```
GET {{ $vars.SUPABASE_URL }}/rest/v1/daily_updates
    ?date=eq.{{ $now.format('yyyy-MM-dd') }}
    &select=user_id,working_hours
```

---

## Step 4 — Schedule Triggers

| Workflow | Cron Expression | Human Time       |
|---------|----------------|------------------|
| WF 1    | 0 9 30 * * 1-6  | 9:30 AM Mon–Sat  |
| WF 2    | 0 10 0 * * 1-6  | 10:00 AM Mon–Sat |
| WF 3    | 0 21 0 * * 1-6  | 9:00 PM Mon–Sat  |

> n8n cron uses UTC. India (IST) = UTC+5:30
> 9:30 AM IST  = 4:00 AM UTC  → cron: 0 4 * * 1-6
> 10:00 AM IST = 4:30 AM UTC  → cron: 30 4 * * 1-6
> 9:00 PM IST  = 3:30 PM UTC  → cron: 30 15 * * 1-6

---

## Step 5 — Workflow 4 Webhook URL

After creating the Webhook node in n8n, copy its URL.
Add it to your Vercel environment variables:

```
N8N_WEBHOOK_URL=https://your-n8n-instance.app/webhook/grofast/low-hours
```

---

## Step 6 — WhatsApp Business Node Config

For all workflows:
- Credential  : your connected WhatsApp Business account
- Resource     : Message
- Operation    : Send
- To           : {{ $json.phone }} (or {{ $json.adminPhone }} for admin messages)
- Message Type : Text
- Text Body    : {{ $json.message }}

---

## Final Workflow Structures

### WF1 (9:30 AM Member Alert)
Schedule Trigger
→ Get Users (HTTP)
→ Get Today Logs (HTTP)
→ Get Month Logs (HTTP)
→ Build Member Alerts (Code — workflow1 file)
→ Loop Over Items
→ WhatsApp Business

### WF2 (10:00 AM Admin Report)
Schedule Trigger
→ Get Users (HTTP)
→ Get Today Logs (HTTP)
→ Get Month Logs (HTTP)
→ Build Admin Report (Code — workflow2 file)
→ WhatsApp Business

### WF3 (9:00 PM Update Reminder)
Schedule Trigger
→ Get Users (HTTP)
→ Get Today Att Logs (HTTP)
→ Get Today Updates (HTTP)
→ Build Reminders (Code — workflow3 file)
→ Loop Over Items
→ WhatsApp Business

### WF4 (Instant Low Hours — Webhook)
Webhook Trigger (POST)
→ Format Alert (Code — workflow4 file)
→ WhatsApp Business
