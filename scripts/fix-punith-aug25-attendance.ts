// Backfill Punithrajan (GF010) Aug 25, 2026: his Shoot Day request for that date was
// submitted at 6pm on Aug 25 and approved by the admin on Aug 26. Because the approval
// only auto-clocked-in when the leave's start date equalled the *approval* day, that
// one-day delay wrote no attendance_logs row at all — so on Aug 26 the member gate read
// Aug 25 as "no login and no leave" and locked him out behind "Contact Admin", even
// though he had filed five work entries for the day.
//
// The code hole is fixed in lib/wfh-shoot-attendance.ts + updateLeaveStatus(); this
// script repairs the one day already on the floor. Times come from his own filed
// entries: 10:00 edit → 19:00 edit, with a 16:30–17:00 gap = 8.5h working hours.
// Run: npx tsx scripts/fix-punith-aug25-attendance.ts

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

const DATE = '2026-08-25'
// IST -> UTC (IST is UTC+5:30)
const CLOCK_IN_ISO  = new Date(`${DATE}T10:00:00+05:30`).toISOString()
const CLOCK_OUT_ISO = new Date(`${DATE}T19:00:00+05:30`).toISOString()
const BREAK_SESSIONS = [{ label: 'Break', start: '16:30', end: '17:00', duration_mins: 30 }]
const BREAK_TOTAL_MINS = 30

async function main() {
  const { data: user, error: userErr } = await supabase
    .from('users')
    .select('id, name, employee_id, company_id')
    .eq('employee_id', 'GF010')
    .single()
  if (userErr) throw new Error(userErr.message)
  console.log(`Found: ${user.name.trim()} (${user.employee_id}) -> ${user.id}`)

  // Sanity check: only repair a day the approved shoot request actually covers.
  const { data: leave, error: leaveErr } = await supabase
    .from('leaves')
    .select('id, leave_type, status')
    .eq('user_id', user.id)
    .eq('from_date', DATE)
    .eq('leave_type', 'shoot_day')
    .eq('status', 'approved')
    .maybeSingle()
  if (leaveErr) throw new Error(leaveErr.message)
  if (!leave) {
    console.log(`No approved shoot_day leave on ${DATE} — nothing to repair. Aborting.`)
    return
  }

  const { data: existing, error: attErr } = await supabase
    .from('attendance_logs')
    .select('id, status, clock_in, clock_out')
    .eq('user_id', user.id)
    .eq('date', DATE)
    .maybeSingle()
  if (attErr) throw new Error(attErr.message)

  if (existing?.clock_in || existing?.clock_out) {
    console.log(`Row already has clock_in=${existing.clock_in} clock_out=${existing.clock_out} — refusing to overwrite. Aborting.`)
    return
  }

  const payload = {
    company_id: user.company_id,
    user_id: user.id,
    date: DATE,
    clock_in: CLOCK_IN_ISO,
    clock_out: CLOCK_OUT_ISO,
    work_type: 'shoot',
    status: 'present',
    break_total_mins: BREAK_TOTAL_MINS,
    break_sessions: BREAK_SESSIONS,
    paused_seconds: 0,
  }

  if (existing) {
    const { error } = await supabase.from('attendance_logs').update(payload).eq('id', existing.id)
    if (error) throw new Error(error.message)
    console.log(`Updated placeholder row ${existing.id}`)
  } else {
    const { data, error } = await supabase.from('attendance_logs').insert(payload).select('id').single()
    if (error) throw new Error(error.message)
    console.log(`Inserted row ${data.id}`)
  }
  console.log(`${DATE}: 10:00-19:00 IST, shoot, present, 30 min break -> 8.5h working hours`)
}

main().catch(console.error)
