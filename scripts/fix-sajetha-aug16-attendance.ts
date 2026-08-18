// Fix Sajetha SK (GF003) Aug 16, 2026: she had an approved half-day leave for the
// morning (09:30-14:15), came back and worked 2:15 PM - 7:00 PM in the office, but
// forgot to clock in. The half-day leave auto-created a placeholder attendance_logs
// row (status=half_day, no clock_in/out) that was never upgraded — fill in her real
// session times and flip it to present.
// Run: npx tsx scripts/fix-sajetha-aug16-attendance.ts

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

const DATE = '2026-08-16'
// IST -> UTC (IST is UTC+5:30)
const CLOCK_IN_ISO  = new Date(`${DATE}T14:15:00+05:30`).toISOString()
const CLOCK_OUT_ISO = new Date(`${DATE}T19:00:00+05:30`).toISOString()

async function main() {
  const { data: users, error: userErr } = await supabase
    .from('users')
    .select('id, name, employee_id, company_id')
    .eq('employee_id', 'GF003')
    .limit(1)
  if (userErr) throw new Error(userErr.message)
  if (!users?.length) throw new Error('Sajetha (GF003) not found')
  const user = users[0]
  console.log(`Found: ${user.name} (${user.employee_id}) -> ${user.id}`)

  const { data: attLog, error: attErr } = await supabase
    .from('attendance_logs')
    .select('id, status, clock_in, clock_out')
    .eq('user_id', user.id)
    .eq('date', DATE)
    .maybeSingle()
  if (attErr) throw new Error(attErr.message)
  if (!attLog) throw new Error(`No attendance_logs row for ${DATE} — expected the half_day placeholder`)

  console.log(`Existing row: status=${attLog.status} clock_in=${attLog.clock_in} clock_out=${attLog.clock_out}`)
  if (attLog.clock_in || attLog.clock_out) {
    console.log('Row already has clock_in/clock_out set — refusing to overwrite. Aborting.')
    return
  }

  const { error } = await supabase
    .from('attendance_logs')
    .update({
      clock_in: CLOCK_IN_ISO,
      clock_out: CLOCK_OUT_ISO,
      work_type: 'office',
      status: 'present',
    })
    .eq('id', attLog.id)

  if (error) {
    console.log(`Update failed: ${error.message}`)
    return
  }
  console.log(`Updated: clock_in=${CLOCK_IN_ISO} clock_out=${CLOCK_OUT_ISO} status=present work_type=office`)
}

main().catch(console.error)
