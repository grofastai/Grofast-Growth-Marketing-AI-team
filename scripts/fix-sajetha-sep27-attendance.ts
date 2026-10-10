// Backfill Sajetha SK (GF003) Sep 27, 2026: office 08:30 - 19:00 IST.
// No break recorded here; if she later files a daily update with a break entry,
// daily-updates.ts syncs break_sessions/break_total_mins onto this row automatically.
// Run: npx tsx scripts/fix-sajetha-sep27-attendance.ts

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

const DATE = '2026-09-27'

async function main() {
  const { data: user, error: userErr } = await supabase
    .from('users')
    .select('id, name, employee_id, company_id')
    .eq('employee_id', 'GF003')
    .single()
  if (userErr) throw new Error(userErr.message)
  console.log(`Found: ${user.name} (${user.employee_id}) -> ${user.id}`)

  // IST -> UTC (IST is UTC+5:30)
  const CLOCK_IN_ISO  = new Date(`${DATE}T08:30:00+05:30`).toISOString()
  const CLOCK_OUT_ISO = new Date(`${DATE}T19:00:00+05:30`).toISOString()

  const { data: existing, error: attErr } = await supabase
    .from('attendance_logs')
    .select('id, status, clock_in, clock_out')
    .eq('user_id', user.id)
    .eq('date', DATE)
    .maybeSingle()
  if (attErr) throw new Error(attErr.message)

  if (existing?.clock_in || existing?.clock_out) {
    console.log(`  Row already has clock_in=${existing.clock_in} clock_out=${existing.clock_out} — refusing to overwrite. Skipping.`)
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
    break_total_mins: 0,
    break_sessions: [],
    paused_seconds: 0,
  }

  if (existing) {
    const { error } = await supabase.from('attendance_logs').update(payload).eq('id', existing.id)
    if (error) throw new Error(error.message)
    console.log(`  Updated placeholder row ${existing.id}`)
  } else {
    const { data, error } = await supabase.from('attendance_logs').insert(payload).select('id').single()
    if (error) throw new Error(error.message)
    console.log(`  Inserted row ${data.id}`)
  }
  console.log(`  08:30-19:00 IST, office, present, no break -> 10.5h working hours`)
}

main().catch(console.error)
