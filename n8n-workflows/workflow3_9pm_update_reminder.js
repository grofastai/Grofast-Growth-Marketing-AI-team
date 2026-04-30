/**
 * WORKFLOW 3 — 9:00 PM Daily Update Reminder
 * Trigger: Schedule (9:00 PM, Mon–Sat)
 *
 * Node order in n8n:
 *  1. Schedule Trigger
 *  2. HTTP Request  → "Get Users"
 *  3. HTTP Request  → "Get Today Att Logs"   (attendance_logs for today)
 *  4. HTTP Request  → "Get Today Updates"    (daily_updates for today)
 *  5. THIS Code Node → "Build Reminders"
 *  6. Loop Over Items
 *  7. IF node       → type = 'no_update' OR type = 'low_hours'
 *  8. WhatsApp node A (no_update message)
 *  9. WhatsApp node B (low_hours message)
 *
 * HTTP — Get Today Updates URL:
 *   {{ $vars.SUPABASE_URL }}/rest/v1/daily_updates
 *   ?date=eq.{{ $now.format('yyyy-MM-dd') }}
 *   &select=user_id,working_hours
 *
 * WhatsApp node — To field (both):
 *   {{ $json.phone }}
 *
 * WhatsApp node A message:
 *   {{ $json.message }}
 *
 * WhatsApp node B message:
 *   {{ $json.message }}
 */

const REQUIRED_HOURS = 9

// ── Pull data ───────────────────────────────────────────────────
const users       = $('Get Users').first().json
const attLogs     = $('Get Today Att Logs').first().json
const dayUpdates  = $('Get Today Updates').first().json

// ── Build lookup sets ────────────────────────────────────────────
const clockedInToday = new Set(attLogs.map(l => l.user_id))

const updatesMap = {}
for (const upd of dayUpdates) {
  updatesMap[upd.user_id] = upd
}

// ── Classify members ─────────────────────────────────────────────
const output = []

for (const member of users) {
  if (member.role === 'ADMIN' || !member.phone) continue

  const wasPresent = clockedInToday.has(member.id)
  const update     = updatesMap[member.id]
  const firstName  = member.name.split(' ')[0]

  if (wasPresent && !update) {
    // Group A: clocked in but never submitted update
    output.push({
      json: {
        name:    member.name,
        phone:   member.phone,
        type:    'no_update',
        message: `📋 Hey ${firstName}, your daily update is pending.\n\n` +
                 `Minimum required: ${REQUIRED_HOURS} hours/day\n\n` +
                 `Please submit before midnight.\n` +
                 `👉 grofastteam.vercel.app/member/update`,
      }
    })
  } else if (update && update.working_hours != null && update.working_hours < REQUIRED_HOURS) {
    // Group B: submitted but below 9 hours
    const shortfall = Math.round((REQUIRED_HOURS - update.working_hours) * 10) / 10
    output.push({
      json: {
        name:       member.name,
        phone:      member.phone,
        type:       'low_hours',
        hours:      update.working_hours,
        shortfall,
        message: `⚠️ Hey ${firstName}, you logged ${update.working_hours}h today.\n\n` +
                 `Required : ${REQUIRED_HOURS} hours/day\n` +
                 `Shortfall: ${shortfall} hours\n\n` +
                 `If you worked more, please update your report.\n` +
                 `👉 grofastteam.vercel.app/member/update`,
      }
    })
  }
  // Group C (hours >= 9 and update submitted) — no message needed
}

return output
