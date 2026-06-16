// Run with: npx tsx scripts/check-learning-entries.ts
import { createClient } from '@supabase/supabase-js'
import * as path from 'path'
import * as fs from 'fs'

// Load .env.local manually
const envPath = path.resolve(process.cwd(), '.env.local')
const envLines = fs.readFileSync(envPath, 'utf8').split('\n')
for (const line of envLines) {
  const m = line.match(/^([^#=]+)=(.*)$/)
  if (m) process.env[m[1].trim()] = m[2].trim().replace(/^["']|["']$/g, '')
}

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  { auth: { autoRefreshToken: false, persistSession: false } }
)

async function main() {
  const { data, error } = await supabase
    .from('daily_updates')
    .select('id, user_id, date, learning_topic, learning_hours, learning_start_time, learning_end_time')
    .not('learning_topic', 'is', null)
    .order('date', { ascending: false })

  if (error) { console.error('DB error:', error); process.exit(1) }

  const all = data ?? []
  const missingTiming = all.filter(r => !r.learning_start_time || !r.learning_end_time)
  const hasTiming     = all.filter(r =>  r.learning_start_time &&  r.learning_end_time)

  console.log(`\nTotal old-format learning entries: ${all.length}`)
  console.log(`  ✅ Have timing (start+end): ${hasTiming.length}`)
  console.log(`  ❌ Missing timing:          ${missingTiming.length}`)

  if (missingTiming.length > 0) {
    const userIds = [...new Set(missingTiming.map(r => r.user_id))]
    const { data: users } = await supabase
      .from('users')
      .select('id, name, employee_id')
      .in('id', userIds)
    const userMap = new Map((users ?? []).map(u => [u.id, u]))

    console.log('\n--- Entries missing timing ---')
    for (const r of missingTiming) {
      const u = userMap.get(r.user_id)
      console.log(`  ${r.date} | ${u?.employee_id ?? '?'} - ${u?.name ?? '?'} | topic: ${r.learning_topic} | hours: ${r.learning_hours}`)
    }
  } else {
    console.log('\n✅ All old learning entries have timing — safe to migrate!')
  }
}

main()
