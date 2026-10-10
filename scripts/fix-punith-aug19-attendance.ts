// Backfill Punithrajan (GF010) Aug 19, 2026 — the same hole that hit him on Aug 25:
// his Shoot Day request for Aug 19 was submitted at 11:37pm that night and approved the
// next day, so the approval's start-date check never fired and no attendance_logs row
// was written at all. Unlike Aug 25 this one stopped blocking his login once Aug 20
// broke the streak, but the day was still missing from his attendance and payroll.
//
// The code hole is fixed in lib/wfh-shoot-attendance.ts + updateLeaveStatus(); this
// script repairs the day already on the floor.
//
// Times confirmed by admin: clocked in 10:00, out 22:00 IST. The two gaps in his own
// filed entries (14:00–15:00 and 18:00–19:00) are logged as breaks, so the 12h span
// nets out to 10h working hours — matching the 10h of entries he actually filed:
//   10:00-13:00 shoot · 13:00-14:00 edit · 15:00-17:00 edit · 17:00-18:00 shoot · 19:00-22:00 shoot
// Run: npx tsx scripts/fix-punith-aug19-attendance.ts

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

const DATE = '2026-08-19'
// IST -> UTC (IST is UTC+5:30)
const CLOCK_IN_ISO  = new Date(`${DATE}T10:00:00+05:30`).toISOString()
const CLOCK_OUT_ISO = new Date(`${DATE}T22:00:00+05:30`).toISOString()
const BREAK_SESSIONS = [
  { label: 'Break', start: '14:00', end: '15:00', duration_mins: 60 },
  { label: 'Break', start: '18:00', end: '19:00', duration_mins: 60 },
]
const BREAK_TOTAL_MINS = 120

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
  console.log(`${DATE}: 10:00-22:00 IST, shoot, present, 120 min break -> 10h working hours`)
}

main().catch(console.error)
