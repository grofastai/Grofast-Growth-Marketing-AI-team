// Fix Raghul V (GF011) Aug 12, 2026: the day was approved as WFH but should be a
// FULL DAY LEAVE (reason: Function). Converts the leave type, clears the stray
// clock-in, and drops any empty daily_update so the 🌴 leave card shows in history.
// Mirrors what updateLeaveStatus() does for a full_day approval (lib/actions/leaves.ts).
// Run: npx tsx scripts/fix-raghul-aug12-leave.ts

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

const EMPLOYEE_ID = 'GF011'
const DATE        = '2026-08-12'
const REASON      = 'Function'

async function main() {
  const { data: user, error: userErr } = await supabase
    .from('users')
    .select('id, name, employee_id, company_id')
    .eq('employee_id', EMPLOYEE_ID)
    .maybeSingle()
  if (userErr) throw new Error(userErr.message)
  if (!user) throw new Error(`${EMPLOYEE_ID} not found`)
  console.log(`Found: ${user.name} (${user.employee_id}) → ${user.id}`)

  // ── leave: wfh → full_day, approved ──────────────────────────────────────
  console.log(`\n── leaves for ${DATE} ──`)
  const { data: leaves } = await supabase
    .from('leaves')
    .select('id, leave_type, status, reason')
    .eq('user_id', user.id)
    .eq('from_date', DATE)

  const approved = (leaves ?? []).filter(l => l.status === 'approved')
  if (approved.length > 1) throw new Error(`Expected 1 approved leave, found ${approved.length} — aborting`)

  if (approved.length === 1) {
    const l = approved[0]
    console.log(`  Approved leave: id=${l.id} | type=${l.leave_type} | reason="${l.reason}"`)
    const { error } = await supabase
      .from('leaves')
      .update({
        leave_type:         'full_day',
        status:             'approved',
        to_date:            DATE,
        reason:             REASON,
        // full_day carries none of the slot fields — clear anything left from wfh/half_day
        permission_hours:      null,
        permission_time:       null,
        permission_end_time:   null,
        permission_reason_type: null,
        half_day_period:       null,
        half_day_from_time:    null,
        half_day_to_time:      null,
      })
      .eq('id', l.id)
    if (error) throw new Error(`leave update failed: ${error.message}`)
    console.log('  ✅ Leave converted to approved full_day')
  } else {
    const { error } = await supabase.from('leaves').insert({
      company_id: user.company_id,
      user_id:    user.id,
      leave_type: 'full_day',
      from_date:  DATE,
      to_date:    DATE,
      reason:     REASON,
      status:     'approved',
    })
    if (error) throw new Error(`leave insert failed: ${error.message}`)
    console.log('  ✅ Approved full_day leave inserted')
  }

  // ── attendance_log: clear the clock-in, mark the day as leave ────────────
  console.log(`\n── attendance_logs for ${DATE} ──`)
  const { data: attLog } = await supabase
    .from('attendance_logs')
    .select('id, status, clock_in, clock_out, work_type')
    .eq('user_id', user.id)
    .eq('date', DATE)
    .maybeSingle()

  if (!attLog) {
    const { error } = await supabase.from('attendance_logs').insert({
      company_id: user.company_id,
      user_id:    user.id,
      date:       DATE,
      status:     'leave',
    })
    if (error) throw new Error(`attendance insert failed: ${error.message}`)
    console.log('  ✅ attendance_log inserted with status=leave')
  } else {
    console.log(`  Found: clock_in=${attLog.clock_in} | clock_out=${attLog.clock_out} | work_type=${attLog.work_type} | status=${attLog.status}`)
    const { error } = await supabase
      .from('attendance_logs')
      .update({
        status: 'leave', clock_in: null, clock_out: null, work_type: null,
        break_in: null, break_out: null, break_total_mins: 0, break_sessions: [],
        paused_seconds: 0, session_paused_at: null,
      })
      .eq('id', attLog.id)
    if (error) throw new Error(`attendance update failed: ${error.message}`)
    console.log('  ✅ Login removed — attendance_log set to status=leave')
  }

  // ── daily_update: delete if it holds no real work ────────────────────────
  console.log(`\n── daily_updates for ${DATE} ──`)
  const { data: du } = await supabase
    .from('daily_updates')
    .select('id, work_entries')
    .eq('user_id', user.id)
    .eq('date', DATE)
    .maybeSingle()

  if (!du) {
    console.log('  None — nothing to clean up')
  } else {
    const entries = Array.isArray(du.work_entries)
      ? (du.work_entries as { task_type?: string; title?: string }[]).filter(e => e.task_type !== 'break')
      : []
    if (entries.length > 0) {
      console.log(`  ⚠️  Has ${entries.length} real work entries — leaving it alone:`)
      entries.forEach(e => console.log(`     [${e.task_type}] "${e.title}"`))
    } else {
      const { error } = await supabase.from('daily_updates').delete().eq('id', du.id)
      if (error) throw new Error(`daily_update delete failed: ${error.message}`)
      console.log('  ✅ Deleted empty daily_update')
    }
  }

  // ── verify ───────────────────────────────────────────────────────────────
  console.log('\n── final state ──')
  const { data: finalLeaves } = await supabase
    .from('leaves').select('id, leave_type, status, reason')
    .eq('user_id', user.id).eq('from_date', DATE)
  console.log('  leaves:', JSON.stringify(finalLeaves))
  const { data: finalAtt } = await supabase
    .from('attendance_logs').select('status, clock_in, clock_out, work_type')
    .eq('user_id', user.id).eq('date', DATE)
  console.log('  attendance_logs:', JSON.stringify(finalAtt))

  console.log('\nDone.')
}

main().catch(e => { console.error(e); process.exit(1) })
