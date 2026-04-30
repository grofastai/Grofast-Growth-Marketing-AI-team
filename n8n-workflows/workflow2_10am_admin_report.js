/**
 * WORKFLOW 2 — 10:00 AM Admin Login Report
 * Trigger: Schedule (10:00 AM, Mon–Sat)
 *
 * Node order in n8n:
 *  1. Schedule Trigger
 *  2. HTTP Request  → "Get Users"        (same URL as Workflow 1)
 *  3. HTTP Request  → "Get Today Logs"   (same URL as Workflow 1)
 *  4. HTTP Request  → "Get Month Logs"   (same URL as Workflow 1)
 *  5. THIS Code Node → "Build Admin Report"
 *  6. WhatsApp Business → send one message to admin
 *
 * WhatsApp node config:
 *   To     : {{ $json.adminPhone }}
 *   Message: {{ $json.message }}
 */

const LATE_CUTOFF    = '09:30'
const MAX_PASSES     = 5
const IST_OFFSET_MS  = 5.5 * 60 * 60 * 1000  // UTC+5:30

// ── Pull data ───────────────────────────────────────────────────
const users     = $('Get Users').first().json
const todayLogs = $('Get Today Logs').first().json
const monthLogs = $('Get Month Logs').first().json

// ── Admin phone ─────────────────────────────────────────────────
const adminUser = users.find(u => u.role === 'ADMIN')
const adminPhone = adminUser?.phone

// ── Today's date string ─────────────────────────────────────────
const nowIST  = new Date(Date.now() + IST_OFFSET_MS)
const dateStr = nowIST.toLocaleDateString('en-IN', {
  day: 'numeric', month: 'short', year: 'numeric'
})

// ── Map user_id → clock_in ──────────────────────────────────────
const loginMap = {}
for (const log of todayLogs) {
  if (log.clock_in) loginMap[log.user_id] = log.clock_in
}

// ── Count late logins this month ────────────────────────────────
const lateThisMonth = {}
for (const log of monthLogs) {
  if (!log.clock_in) continue
  const dt   = new Date(log.clock_in)
  const hhmm = `${String(dt.getHours()).padStart(2,'0')}:${String(dt.getMinutes()).padStart(2,'0')}`
  if (hhmm > LATE_CUTOFF) {
    lateThisMonth[log.user_id] = (lateThisMonth[log.user_id] || 0) + 1
  }
}

// ── Classify every member ───────────────────────────────────────
const members  = users.filter(u => u.role !== 'ADMIN')
const onTime   = []
const late     = []
const absent   = []

for (const m of members) {
  const clockInRaw = loginMap[m.id]
  const lateCount  = lateThisMonth[m.id] || 0
  const passesLeft = Math.max(0, MAX_PASSES - lateCount)

  if (!clockInRaw) {
    absent.push({ name: m.name, employee_id: m.employee_id, passesLeft })
  } else {
    const dt    = new Date(clockInRaw)
    const hhmm  = `${String(dt.getHours()).padStart(2,'0')}:${String(dt.getMinutes()).padStart(2,'0')}`
    // 12-hour display
    const timeDisplay = dt.toLocaleTimeString('en-IN', {
      hour: '2-digit', minute: '2-digit', hour12: true, timeZone: 'Asia/Kolkata'
    })

    if (hhmm <= LATE_CUTOFF) {
      onTime.push({ name: m.name, time: timeDisplay })
    } else {
      late.push({ name: m.name, time: timeDisplay, lateCount, passesLeft })
    }
  }
}

// ── Format message ──────────────────────────────────────────────
function pad(str, len) {
  return str.length >= len ? str : str + ' '.repeat(len - str.length)
}

let msg = `📊 Login Report — ${dateStr}, 10:00 AM\n\n`

if (onTime.length > 0) {
  msg += `✅ On Time (${onTime.length}):\n`
  for (const m of onTime) {
    msg += `• ${pad(m.name, 18)}— ${m.time}\n`
  }
  msg += '\n'
}

if (late.length > 0) {
  msg += `🕐 Late — pass used (${late.length}):\n`
  for (const m of late) {
    const warn = m.passesLeft === 0 ? ' ⚠️ ALL USED' : ''
    msg += `• ${pad(m.name, 18)}— ${m.time}  (${m.lateCount}/${MAX_PASSES} used${warn})\n`
  }
  msg += '\n'
}

if (absent.length > 0) {
  msg += `❌ Not Logged In (${absent.length}):\n`
  for (const m of absent) {
    msg += `• ${pad(m.name, 18)}${m.passesLeft} passes left\n`
  }
  msg += '\n'
}

if (onTime.length === 0 && late.length === 0 && absent.length === 0) {
  msg += `No active members found.\n`
}

msg += `— GroFast System`

return [{ json: { adminPhone, message: msg } }]
