// Fix Naveena Jun 6, 2026: add approved full_day leave and clear daily_update so history shows Leave
// Run: npx tsx scripts/fix-naveena-jun6-leave.ts

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

const DATE = '2026-06-06'

async function main() {
  const { data: users, error: userErr } = await supabase
    .from('users')
    .select('id, name, employee_id, company_id')
    .eq('employee_id', 'GF012')
    .limit(1)
  if (userErr) throw new Error(userErr.message)
  if (!users?.length) throw new Error('Naveena (GF012) not found')
  const user = users[0]
  console.log(`Found: ${user.name} (${user.employee_id}) → ${user.id}`)

  // ── Check daily_update for Jun 6 ─────────────────────────────────────────
  console.log(`\n── daily_update for ${DATE} ──`)
  const { data: du } = await supabase
    .from('daily_updates')
    .select('id, attendance_status, work_entries')
    .eq('user_id', user.id)
    .eq('date', DATE)
    .maybeSingle()

  if (!du) {
    console.log('  No daily_update for Jun 6 — nothing to delete')
  } else {
    const entries = Array.isArray(du.work_entries) ? du.work_entries : []
    console.log(`  Found: id=${du.id} | status=${du.attendance_status} | entries=${entries.length}`)
    if (entries.length > 0) {
      console.log('  ⚠️  Has work entries — skipping delete:')
      entries.forEach((e: Record<string, unknown>) => console.log(`     [${e.task_type}] "${e.title}"`))
    } else {
      const { error } = await supabase.from('daily_updates').delete().eq('id', du.id)
      if (error) console.log(`  ❌ Delete failed: ${error.message}`)
      else console.log('  ✅ Deleted empty daily_update')
    }
  }

  // ── Insert / approve leave for Jun 6 ─────────────────────────────────────
  console.log(`\n── leave for ${DATE} ──`)
  const { data: existingLeave } = await supabase
    .from('leaves')
    .select('id, status')
    .eq('user_id', user.id)
    .eq('from_date', DATE)
    .maybeSingle()

  if (existingLeave) {
    console.log(`  Leave already exists (status=${existingLeave.status}) — updating to approved`)
    const { error } = await supabase.from('leaves').update({ status: 'approved' }).eq('id', existingLeave.id)
    if (error) console.log(`  ❌ Update failed: ${error.message}`)
    else console.log('  ✅ Leave approved')
  } else {
    const { error } = await supabase.from('leaves').insert({
      company_id: user.company_id,
      user_id:    user.id,
      leave_type: 'full_day',
      from_date:  DATE,
      to_date:    DATE,
      reason:     'Casual Leave',
      status:     'approved',
    })
    if (error) console.log(`  ❌ Insert failed: ${error.message}`)
    else console.log('  ✅ Approved full_day leave inserted for Jun 6')
  }

  // ── Update attendance_log so it doesn't force "Present" ──────────────────
  console.log(`\n── attendance_log for ${DATE} ──`)
  const { data: attLog } = await supabase
    .from('attendance_logs')
    .select('id, status, clock_in, clock_out')
    .eq('user_id', user.id)
    .eq('date', DATE)
    .maybeSingle()

  if (!attLog) {
    console.log('  No attendance_log for Jun 6 — nothing to update')
  } else {
    console.log(`  Found: clock_in=${attLog.clock_in} | clock_out=${attLog.clock_out} | status=${attLog.status}`)
    const { error } = await supabase
      .from('attendance_logs')
      .update({ status: 'on_leave' })
      .eq('id', attLog.id)
    if (error) console.log(`  ❌ Update failed: ${error.message}`)
    else console.log('  ✅ attendance_log status set to on_leave')
  }

  console.log('\nDone. Refresh history page to see the leave card.')
}

main().catch(console.error)
