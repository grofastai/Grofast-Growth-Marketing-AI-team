// Verifies that a real logged-in member can actually read their OWN rows.
//
// Why this exists: migration 011 added `OR user_id = auth.uid()` to the
// attendance_logs policy, but it was never applied to production. Nobody noticed,
// because every page that still worked was reading through the service-role client,
// which bypasses RLS entirely. Members silently saw "No record" for every day of the
// week while their attendance sat in the table the whole time.
//
// A migration file in the repo proves nothing about the live database. This checks the
// live database, the same way the app does: with a real user session.
//
// Read-only. Signs out with scope 'local' so it never touches the member's own sessions.
//
//   pnpm check:rls
//
import { readFileSync } from 'fs'
import { createClient } from '@supabase/supabase-js'

// Tables the member UI reads through the logged-in user's session (RLS applies).
// If a member owns rows here but cannot see them, the app shows blank screens.
const TABLES = [
  'attendance_logs',
  'daily_updates',
  'leaves',
  'notifications',
  'notes',
]

function loadEnv() {
  const out = {}
  for (const line of readFileSync('.env.local', 'utf8').split('\n')) {
    const i = line.indexOf('=')
    if (i < 0 || line.trim().startsWith('#')) continue
    out[line.slice(0, i).trim()] = line.slice(i + 1).trim()
  }
  return out
}

const env = loadEnv()
const URL = env.NEXT_PUBLIC_SUPABASE_URL
const ANON = env.NEXT_PUBLIC_SUPABASE_ANON_KEY
const SERVICE = env.SUPABASE_SERVICE_ROLE_KEY
if (!URL || !ANON || !SERVICE) {
  console.error('Missing Supabase env vars in .env.local')
  process.exit(2)
}

const admin = createClient(URL, SERVICE, { auth: { persistSession: false } })

// Pick the active member with the most attendance rows — the account most likely to
// own rows in every table, so a blocked policy shows up as a real mismatch.
const { data: members } = await admin
  .from('users').select('id, name, email').eq('role', 'MEMBER').eq('status', 'active')

let subject = null
for (const m of members ?? []) {
  if (!m.email) continue
  const { count } = await admin
    .from('attendance_logs').select('id', { count: 'exact', head: true }).eq('user_id', m.id)
  if (count && (!subject || count > subject.count)) subject = { ...m, count }
}
if (!subject) {
  console.error('No active member with attendance rows — cannot verify RLS.')
  process.exit(2)
}

const { data: link, error: linkErr } =
  await admin.auth.admin.generateLink({ type: 'magiclink', email: subject.email })
if (linkErr) {
  console.error('Could not mint a test session:', linkErr.message)
  process.exit(2)
}

const asUser = createClient(URL, ANON, { auth: { persistSession: false } })
const { error: otpErr } = await asUser.auth.verifyOtp({
  token_hash: link.properties.hashed_token, type: 'magiclink',
})
if (otpErr) {
  console.error('Could not establish a test session:', otpErr.message)
  process.exit(2)
}

console.log(`Checking RLS as: ${subject.name}\n`)
console.log('table                owns    can read   result')

let failures = 0
for (const table of TABLES) {
  const { count: owned, error: e1 } = await admin
    .from(table).select('*', { count: 'exact', head: true }).eq('user_id', subject.id)
  if (e1) { console.log(`${table.padEnd(20)} — skipped (${e1.message})`); continue }
  if (!owned) { console.log(`${table.padEnd(20)} 0       —          skipped (owns nothing)`); continue }

  const { count: seen, error: e2 } = await asUser
    .from(table).select('*', { count: 'exact', head: true }).eq('user_id', subject.id)
  const visible = e2 ? 0 : (seen ?? 0)
  const ok = visible >= owned
  if (!ok) failures++
  console.log(
    `${table.padEnd(20)} ${String(owned).padEnd(7)} ${String(visible).padEnd(10)} ${ok ? 'ok' : 'BLOCKED BY RLS'}`
  )
}

// scope 'local' ends only this script's session — a global sign-out would log the
// member out of the app on their own devices.
await asUser.auth.signOut({ scope: 'local' })

if (failures > 0) {
  console.error(
    `\n${failures} table(s) hide a member's own rows.\n` +
    `The live policy is out of sync with supabase/migrations — members will see blank\n` +
    `screens wherever the page reads through the user session instead of service-role.\n` +
    `Compare the live policy against supabase/migrations and re-apply the missing one.`
  )
  process.exit(1)
}
console.log('\nAll checked tables readable by their owner.')
