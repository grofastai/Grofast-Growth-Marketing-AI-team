// Backfill fix: entries tagged with a collaborator via the History page's edit-entry
// flow (before the 2026-07-03 fix to updatePastDailyUpdate / addEntryToDate) never
// synced the parent daily_updates.participant_ids column or created a
// collaboration_confirmations row — so the collaborator's History page and admin's
// Activities page never saw them. This scans every daily_updates row, recomputes what
// participant_ids + collaboration_confirmations SHOULD be from the entries themselves,
// and fixes any that drifted.
//
// Run (dry run, no writes):  npx tsx scripts/backfill-collab-participant-ids.ts
// Run (apply writes):        npx tsx scripts/backfill-collab-participant-ids.ts --apply

import { createClient } from '@supabase/supabase-js'
import * as path from 'path'
import * as fs from 'fs'

const envLines = fs.readFileSync(path.resolve(process.cwd(), '.env.local'), 'utf8').split('\n')
for (const line of envLines) {
  const m = line.match(/^([^#=]+)=(.*)$/)
  if (m) process.env[m[1].trim()] = m[2].trim().replace(/^["']|["']$/g, '')
}

const APPLY = process.argv.includes('--apply')

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  { auth: { autoRefreshToken: false, persistSession: false } }
)

type DailyUpdateRow = {
  id: string
  company_id: string
  user_id: string
  date: string
  work_entries: Record<string, unknown>[] | null
  participant_ids: string[] | null
}

async function main() {
  console.log(APPLY ? '=== APPLY MODE — writes will be made ===' : '=== DRY RUN — no writes will be made ===\n')

  const { data: rows, error } = await supabase
    .from('daily_updates')
    .select('id, company_id, user_id, date, work_entries, participant_ids')
    .not('work_entries', 'is', null)

  if (error) throw new Error(error.message)
  if (!rows) { console.log('No rows found.'); return }

  console.log(`Scanning ${rows.length} daily_updates rows...\n`)

  let participantIdsFixed = 0
  let confirmationsCreated = 0
  let rowsTouched = 0

  for (const row of rows as DailyUpdateRow[]) {
    const entries = Array.isArray(row.work_entries) ? row.work_entries : []
    if (entries.length === 0) continue

    const existingParticipants = row.participant_ids ?? []
    const entryParticipants = entries
      .flatMap(e => (e as Record<string, unknown>).participant_ids as string[] ?? [])
      .filter(Boolean)
    const mergedParticipants = Array.from(new Set([...existingParticipants, ...entryParticipants]))

    const participantIdsDrifted =
      mergedParticipants.length !== existingParticipants.length ||
      mergedParticipants.some(id => !existingParticipants.includes(id))

    // Entries tagging someone other than the submitter — these need a
    // collaboration_confirmations row each, same logic as syncCollaborationConfirmations()
    const tagged = entries.filter(e => {
      const pids = (e as Record<string, unknown>).participant_ids as string[] | undefined
      return Array.isArray(pids) && pids.some(pid => pid !== row.user_id)
    })

    const missingConfirmations: { entryId: string; collaboratorId: string; entry: Record<string, unknown> }[] = []
    for (const e of tagged) {
      const entryId = (e as Record<string, unknown>).id as string | undefined
      if (!entryId) continue // same skip-if-no-id behavior as the live sync function
      const collaborators = (((e as Record<string, unknown>).participant_ids as string[]) || [])
        .filter(pid => pid !== row.user_id)
      for (const collaboratorId of collaborators) {
        const { data: existingConf } = await supabase
          .from('collaboration_confirmations')
          .select('id')
          .eq('daily_update_id', row.id)
          .eq('entry_id', entryId)
          .eq('collaborator_id', collaboratorId)
          .maybeSingle()
        if (!existingConf) missingConfirmations.push({ entryId, collaboratorId, entry: e as Record<string, unknown> })
      }
    }

    if (!participantIdsDrifted && missingConfirmations.length === 0) continue

    rowsTouched++
    console.log(`Row ${row.id} (user ${row.user_id}, date ${row.date}):`)
    if (participantIdsDrifted) {
      console.log(`  participant_ids: [${existingParticipants.join(', ')}] -> [${mergedParticipants.join(', ')}]`)
    }
    for (const mc of missingConfirmations) {
      console.log(`  missing collaboration_confirmations: entry "${mc.entry.title}" -> collaborator ${mc.collaboratorId}`)
    }

    if (APPLY) {
      if (participantIdsDrifted) {
        const { error: updErr } = await supabase
          .from('daily_updates')
          .update({ participant_ids: mergedParticipants })
          .eq('id', row.id)
        if (updErr) console.log(`  ❌ participant_ids update failed: ${updErr.message}`)
        else participantIdsFixed++
      }
      for (const mc of missingConfirmations) {
        const e = mc.entry
        const { error: insErr } = await supabase.from('collaboration_confirmations').upsert({
          company_id:               row.company_id,
          daily_update_id:          row.id,
          entry_id:                 mc.entryId,
          submitter_id:             row.user_id,
          collaborator_id:          mc.collaboratorId,
          date:                     row.date,
          status:                   'pending',
          original_start_time:      (e.start_time as string) || null,
          original_end_time:        (e.end_time as string) || null,
          original_duration_hours:  (e.duration_hours as number) || null,
          entry_snapshot: {
            title:       e.title,
            task_type:   e.task_type,
            client_name: e.client_name,
          },
        }, {
          onConflict:       'daily_update_id,entry_id,collaborator_id',
          ignoreDuplicates: true,
        })
        if (insErr) console.log(`  ❌ collaboration_confirmations insert failed: ${insErr.message}`)
        else confirmationsCreated++
      }
    }
  }

  console.log(`\n${rowsTouched} row(s) affected.`)
  if (APPLY) {
    console.log(`participant_ids fixed on ${participantIdsFixed} row(s).`)
    console.log(`${confirmationsCreated} collaboration_confirmations row(s) created (as 'pending' — collaborators must confirm to have hours counted).`)
  } else {
    console.log('Dry run only — re-run with --apply to write these changes.')
  }
}

main().catch(console.error)
