// Fix Sajetha SK (GF003) attendance for Sep 12-13, 2026:
// - Sep 12: she clocked in (09:17 IST) but never clocked out. Close the session at 19:00 IST.
// - Sep 13: she worked in the office 09:00 - 19:00 IST (no break recorded) but never clocked in —
//   no attendance_logs row existed for the date at all. Insert the session.
// Run: npx tsx scripts/fix-sajetha-sep12-13-attendance.ts

import { createClient } from '@supabase/supabase-js'
import * as path from 'path'
import * as fs from 'fs'

const envLines = fs.readFileSync(path.resolve(process.cwd(), '.env.local'), 'utf8').split('\n')
for (const line of envLines) {
  const m = line.match(/^([^#=]+)=(.*)$/)
  if (m) process.env[m[1].trim()] = m[2].trim().replace(/^["']|["']$/g, '')
}

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  { auth: { autoRefreshToken: false, persistSession: false } }
)

// IST -> UTC (IST is UTC+5:30)
const SEP12 = '2026-09-12'
const SEP12_CLOCK_OUT_ISO = new Date(`${SEP12}T19:00:00+05:30`).toISOString()

const SEP13 = '2026-09-13'
const SEP13_CLOCK_IN_ISO  = new Date(`${SEP13}T09:00:00+05:30`).toISOString()
const SEP13_CLOCK_OUT_ISO = new Date(`${SEP13}T19:00:00+05:30`).toISOString()

async function main() {
  const { data: user, error: userErr } = await supabase
    .from('users')
    .select('id, name, employee_id, company_id')
    .eq('employee_id', 'GF003')
    .single()
  if (userErr) throw new Error(userErr.message)
  console.log(`Found: ${user.name} (${user.employee_id}) -> ${user.id}`)

  // ── Sep 12: close the open session ────────────────────────────────────────
  const { data: sep12, error: sep12Err } = await supabase
    .from('attendance_logs')
    .select('id, clock_in, clock_out')
    .eq('user_id', user.id)
    .eq('date', SEP12)
    .maybeSingle()
  if (sep12Err) throw new Error(sep12Err.message)

  if (!sep12?.clock_in) {
    console.log(`${SEP12}: no clock_in on record — expected an open session. Skipping.`)
  } else if (sep12.clock_out) {
    console.log(`${SEP12}: clock_out already set (${sep12.clock_out}) — refusing to overwrite. Skipping.`)
  } else {
    const { error } = await supabase
      .from('attendance_logs')
      .update({ clock_out: SEP12_CLOCK_OUT_ISO, session_paused_at: null })
      .eq('id', sep12.id)
      .is('clock_out', null)
    if (error) throw new Error(error.message)
    console.log(`${SEP12}: set clock_out 19:00 IST on row ${sep12.id} (clock_in ${sep12.clock_in})`)
  }

  // ── Sep 13: insert the missing session ────────────────────────────────────
  const { data: sep13, error: sep13Err } = await supabase
    .from('attendance_logs')
    .select('id, status, clock_in, clock_out')
    .eq('user_id', user.id)
    .eq('date', SEP13)
    .maybeSingle()
  if (sep13Err) throw new Error(sep13Err.message)

  if (sep13?.clock_in || sep13?.clock_out) {
    console.log(`${SEP13}: row already has clock_in=${sep13.clock_in} clock_out=${sep13.clock_out} — refusing to overwrite. Skipping.`)
    return
  }

  const payload = {
    company_id: user.company_id,
    user_id: user.id,
    date: SEP13,
    clock_in: SEP13_CLOCK_IN_ISO,
    clock_out: SEP13_CLOCK_OUT_ISO,
    work_type: 'office',
    status: 'present',
    break_total_mins: 0,
    break_sessions: [],
    paused_seconds: 0,
  }

  if (sep13) {
    const { error } = await supabase.from('attendance_logs').update(payload).eq('id', sep13.id)
    if (error) throw new Error(error.message)
    console.log(`${SEP13}: updated placeholder row ${sep13.id}`)
  } else {
    const { data, error } = await supabase.from('attendance_logs').insert(payload).select('id').single()
    if (error) throw new Error(error.message)
    console.log(`${SEP13}: inserted row ${data.id}`)
  }
  console.log(`${SEP13}: 09:00-19:00 IST, office, present, no break -> 10h working hours`)
}

main().catch(console.error)
