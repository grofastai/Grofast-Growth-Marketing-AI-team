// Run dry-run first:  npx tsx scripts/migrate-learning-entries.ts --dry-run
// Then run for real:  npx tsx scripts/migrate-learning-entries.ts
import { createClient } from '@supabase/supabase-js'
import * as path from 'path'
import * as fs from 'fs'

const DRY_RUN = process.argv.includes('--dry-run')

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

function parseTopic(topic: string): { clientName: string; title: string } {
  const m = topic.match(/^\[([^\]]+)\]\s*(.*)$/)
  if (m) return { clientName: m[1].trim(), title: m[2].trim() || m[1].trim() }
  return { clientName: 'GROFAST DIGITAL', title: topic.trim() }
}

function calcHours(start: string, end: string): number {
  const [sh, sm] = start.split(':').map(Number)
  const [eh, em] = end.split(':').map(Number)
  return Math.max(0, ((eh * 60 + em) - (sh * 60 + sm)) / 60)
}

async function main() {
  console.log(DRY_RUN ? '\n🔍 DRY RUN — no changes will be made\n' : '\n🚀 LIVE RUN — writing to DB\n')

  const { data, error } = await supabase
    .from('daily_updates')
    .select('id, date, learning_topic, learning_hours, learning_notes, learning_start_time, learning_end_time, work_entries')
    .not('learning_topic', 'is', null)
    .order('date', { ascending: false })

  if (error) { console.error('DB error:', error.message); process.exit(1) }

  const rows = data ?? []
  console.log(`Found ${rows.length} old-format learning entries\n`)

  let migrated = 0
  let skipped  = 0
  let failed   = 0

  for (const row of rows) {
    const existing = (row.work_entries as Record<string, unknown>[] | null) ?? []

    // Safety: skip if already has a learning work_entry (no duplicates)
    if (existing.some(e => e.task_type === 'learning')) {
      console.log(`  ⏭  SKIP  ${row.date} — already has learning in work_entries`)
      skipped++
      continue
    }

    const { clientName, title } = parseTopic(row.learning_topic!)
    const start    = row.learning_start_time ?? ''
    const end      = row.learning_end_time   ?? ''
    const hours    = start && end ? calcHours(start, end) : (row.learning_hours ?? 0)

    const newEntry = {
      client_name:    clientName,
      task_type:      'learning',
      title:          `[${clientName}] ${title}`,
      start_time:     start,
      end_time:       end,
      duration_hours: hours,
      notes:          row.learning_notes ?? '',
    }

    // Existing entries stay untouched — new learning entry is appended at the end
    const updatedWorkEntries = [...existing, newEntry]

    console.log(`  ${DRY_RUN ? '🔍' : '✅'} ${row.date} | [${clientName}] ${title} | ${hours.toFixed(1)}h | ${start}–${end}`)
    console.log(`     existing work_entries: ${existing.length} → after: ${updatedWorkEntries.length}`)

    if (!DRY_RUN) {
      const { error: err } = await supabase
        .from('daily_updates')
        .update({
          work_entries:        updatedWorkEntries,
          // Clear old learning fields — data is now in work_entries
          learning_topic:      null,
          learning_notes:      null,
          learning_hours:      0,      // NOT NULL column, set to 0
          learning_start_time: null,
          learning_end_time:   null,
        })
        .eq('id', row.id)

      if (err) {
        console.error(`     ❌ ERROR: ${err.message}`)
        failed++
        continue
      }
    }

    migrated++
  }

  console.log(`\n${'─'.repeat(50)}`)
  console.log(`Total : ${rows.length}`)
  console.log(`Migrated : ${migrated}`)
  console.log(`Skipped (already done) : ${skipped}`)
  if (!DRY_RUN) console.log(`Failed  : ${failed}`)
  if (DRY_RUN) console.log('\nRun without --dry-run to apply changes.')
}

main()
