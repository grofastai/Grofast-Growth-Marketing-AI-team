// Clears old learning_* fields from rows where data is already in work_entries
// Run: npx tsx scripts/clear-old-learning-fields.ts
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

async function main() {
  const { data } = await supabase
    .from('daily_updates')
    .select('id, date, learning_topic')
    .not('learning_topic', 'is', null)

  const rows = data ?? []
  console.log(`\nRows still with old learning fields: ${rows.length}`)

  for (const r of rows) {
    const { error } = await supabase
      .from('daily_updates')
      .update({ learning_topic: null, learning_notes: null, learning_hours: 0, learning_start_time: null, learning_end_time: null })
      .eq('id', r.id)
    console.log(error ? `  ❌ ERROR ${r.date}: ${error.message}` : `  ✅ Cleared: ${r.date} | ${r.learning_topic}`)
  }
  console.log('\nDone.')
}

main()
