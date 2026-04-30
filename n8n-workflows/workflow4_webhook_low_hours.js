/**
 * WORKFLOW 4 — Instant Low Hours Alert (Webhook)
 * Trigger: Webhook (called by Next.js app when hours < 9)
 *
 * Node order in n8n:
 *  1. Webhook node        → "Receive Low Hours"  (POST)
 *  2. THIS Code Node      → "Format Alert"
 *  3. WhatsApp Business   → send to admin
 *
 * Webhook node config:
 *   Method          : POST
 *   Response Mode   : Immediately
 *   Path            : /grofast/low-hours   (or any path you choose)
 *
 * The Next.js app sends this JSON body:
 * {
 *   event:           'hours.underperformance',
 *   employee_name:   'Rajan Kumar',
 *   employee_id:     'GF003',
 *   date:            '2026-04-30',
 *   working_hours:   6.5,
 *   expected_hours:  9,
 *   admin_phone:     '91XXXXXXXXXX'
 * }
 *
 * WhatsApp node config:
 *   To     : {{ $json.adminPhone }}
 *   Message: {{ $json.message }}
 */

// ── Read webhook body ────────────────────────────────────────────
const body = $input.first().json

const {
  employee_name,
  employee_id,
  date,
  working_hours,
  expected_hours,
  admin_phone,
} = body

if (!admin_phone) {
  throw new Error('admin_phone missing in webhook payload')
}

const shortfall  = Math.round((expected_hours - working_hours) * 10) / 10
const dateDisplay = new Date(date).toLocaleDateString('en-IN', {
  day: 'numeric', month: 'short', year: 'numeric'
})

const message =
  `⚠️ Low Hours Alert\n\n` +
  `${employee_name} (${employee_id}) submitted today:\n` +
  `📅 Date     : ${dateDisplay}\n` +
  `⏱ Worked   : ${working_hours}h\n` +
  `🎯 Required : ${expected_hours}h\n` +
  `📉 Shortfall: ${shortfall}h\n\n` +
  `— GroFast System`

return [{ json: { adminPhone: admin_phone, message } }]
