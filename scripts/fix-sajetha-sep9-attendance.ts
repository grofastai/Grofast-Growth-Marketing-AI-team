// Backfill Sajetha SK (GF003) Sep 9, 2026: she worked in the office 09:25 - 18:20 IST
// with a 14:30-15:00 lunch break, but never clocked in — no attendance_logs row existed
// for the date at all. Insert the session so her attendance/payroll reflects the day.
// Run: npx tsx scripts/fix-sajetha-sep9-attendance.ts

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

const DATE = '2026-09-09'
// IST -> UTC (IST is UTC+5:30)
const CLOCK_IN_ISO  = new Date(`${DATE}T09:25:00+05:30`).toISOString()
const CLOCK_OUT_ISO = new Date(`${DATE}T18:20:00+05:30`).toISOString()
const BREAK_SESSIONS = [{ label: 'Lunch Break', start: '14:30', end: '15:00', duration_mins: 30 }]
const BREAK_TOTAL_MINS = 30

async function main() {
  const { data: user, error: userErr } = await supabase
    .from('users')
    .select('id, name, employee_id, company_id')
    .eq('employee_id', 'GF003')
    .single()
  if (userErr) throw new Error(userErr.message)
  console.log(`Found: ${user.name} (${user.employee_id}) -> ${user.id}`)

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
    work_type: 'office',
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
  console.log(`${DATE}: 09:25-18:20 IST, office, present, 30 min lunch break -> 8.42h working hours`)
}

main().catch(console.error)
