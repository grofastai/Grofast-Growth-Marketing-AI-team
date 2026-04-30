/**
 * WORKFLOW 1 — 9:30 AM Member Alert
 * Trigger: Schedule (9:30 AM, Mon–Sat)
 *
 * Node order in n8n:
 *  1. Schedule Trigger
 *  2. HTTP Request  → "Get Users"
 *  3. HTTP Request  → "Get Today Logs"
 *  4. HTTP Request  → "Get Month Logs"
 *  5. THIS Code Node → "Build Member Alerts"
 *  6. Loop Over Items
 *  7. WhatsApp Business → send to each member
 *
 * HTTP Request node config (same headers for all 3):
 *   Method : GET
 *   Headers: apikey = {{ $vars.SUPABASE_SERVICE_ROLE_KEY }}
 *            Authorization = Bearer {{ $vars.SUPABASE_SERVICE_ROLE_KEY }}
 *
 * URLs:
 *  Get Users:
 *    {{ $vars.SUPABASE_URL }}/rest/v1/users
 *    ?company_id=eq.{{ $vars.COMPANY_ID }}&status=eq.active
 *    &select=id,name,employee_id,phone,role
 *
 *  Get Today Logs:
 *    {{ $vars.SUPABASE_URL }}/rest/v1/attendance_logs
 *    ?date=eq.{{ $now.format('yyyy-MM-dd') }}&select=user_id,clock_in
 *
 *  Get Month Logs:
 *    {{ $vars.SUPABASE_URL }}/rest/v1/attendance_logs
 *    ?date=gte.{{ $now.format('yyyy-MM') }}-01
 *    &date=lte.{{ $now.format('yyyy-MM-dd') }}
 *    &select=user_id,clock_in
 */

const LATE_CUTOFF = '09:30'   // HH:MM 24h
const MAX_PASSES  = 5
const REQUIRED_HOURS = 9

// ── Pull data from upstream nodes ──────────────────────────────
const users      = $('Get Users').first().json          // array
const todayLogs  = $('Get Today Logs').first().json     // array
const monthLogs  = $('Get Month Logs').first().json     // array

// ── Who clocked in today ────────────────────────────────────────
const loggedInToday = new Set(todayLogs.map(l => l.user_id))

// ── Count late logins this month per user ───────────────────────
const lateThisMonth = {}
for (const log of monthLogs) {
  if (!log.clock_in) continue
  // clock_in is a timestamptz string, e.g. "2026-04-30T09:45:00+05:30"
  const dt       = new Date(log.clock_in)
  const hh       = dt.getHours().toString().padStart(2, '0')
  const mm       = dt.getMinutes().toString().padStart(2, '0')
  const timeHHMM = `${hh}:${mm}`
  if (timeHHMM > LATE_CUTOFF) {
    lateThisMonth[log.user_id] = (lateThisMonth[log.user_id] || 0) + 1
  }
}

// ── Members only, with phone, not yet logged in ─────────────────
const missing = users.filter(u =>
  u.role !== 'ADMIN' &&
  u.phone &&
  !loggedInToday.has(u.id)
)

// ── Build output (one item per member for the Loop node) ────────
return missing.map(member => {
  const lateCount  = lateThisMonth[member.id] || 0
  const passesLeft = Math.max(0, MAX_PASSES - lateCount)
  const allUsed    = passesLeft === 0

  const message = allUsed
    ? `🚨 Hey ${member.name.split(' ')[0]}, you haven't clocked in yet.\n\n` +
      `⚠️ You've used all ${MAX_PASSES} late passes this month.\n\n` +
      `Please log in immediately or apply for leave.\n` +
      `👉 grofastteam.vercel.app/member/attendance`
    : `⏰ Hey ${member.name.split(' ')[0]}, you haven't clocked in yet.\n\n` +
      `Late passes remaining: ${passesLeft} of ${MAX_PASSES} this month\n\n` +
      `Please clock in as soon as possible.\n` +
      `👉 grofastteam.vercel.app/member/attendance`

  return {
    json: {
      name:        member.name,
      phone:       member.phone,      // used by WhatsApp node
      employee_id: member.employee_id,
      lateCount,
      passesLeft,
      allUsed,
      message,                        // used by WhatsApp node
    }
  }
})
