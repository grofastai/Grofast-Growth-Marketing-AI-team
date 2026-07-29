// Backfill fix: syncMemberDocumentsNow used to name 4 of the 7 KYC document slots
// differently from what documents-client.tsx displays as the card name ("Aadhaar
// Front" vs "Government ID"/"{type} (Front)", "PAN Front" vs "PAN Card Front",
// "PAN Back" vs "PAN Card Back", "Ration Card (2)" vs "Ration Card (Page 2)"). That
// mismatch is now fixed at the source (both sides use kycDocFields() from
// lib/utils/kyc-documents.ts), but any member_documents row synced BEFORE that fix
// still has the old name — so the per-document "Uploaded to Drive" badge and the
// Sync to Drive button's count silently don't recognize those rows as synced.
//
// This renames those existing rows in place to the corrected name. It does NOT
// touch the actual file in Google Drive (no re-upload, no duplicate) — only the
// name column used for the "already synced" lookup.
//
// Run (dry run, no writes):  npx tsx scripts/fix-kyc-doc-names.ts
// Run (apply writes):        npx tsx scripts/fix-kyc-doc-names.ts --apply

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

const OLD_NAMES = ['Aadhaar Front', 'PAN Front', 'PAN Back', 'Ration Card (2)']

async function main() {
  console.log(APPLY ? '=== APPLY MODE — writes will be made ===' : '=== DRY RUN — no writes will be made ===\n')

  const { data: rows, error } = await supabase
    .from('member_documents')
    .select('id, user_id, name')
    .in('name', OLD_NAMES)

  if (error) throw new Error(error.message)
  if (!rows || rows.length === 0) { console.log('No affected rows found — nothing to fix.'); return }

  console.log(`Found ${rows.length} row(s) with an old sync-target name.\n`)

  const userIds = Array.from(new Set(rows.map(r => r.user_id as string)))
  const { data: kycRows, error: kycErr } = await supabase
    .from('member_kyc')
    .select('user_id, govt_id_type')
    .in('user_id', userIds)
  if (kycErr) throw new Error(kycErr.message)
  const kycByUser = new Map((kycRows ?? []).map(k => [k.user_id as string, k.govt_id_type as string | null]))

  // Existing names per user, so a rename never collides with an already-correct row.
  const { data: existingRows, error: existingErr } = await supabase
    .from('member_documents')
    .select('user_id, name')
    .in('user_id', userIds)
  if (existingErr) throw new Error(existingErr.message)
  const existingNamesByUser = new Map<string, Set<string>>()
  for (const r of existingRows ?? []) {
    const set = existingNamesByUser.get(r.user_id as string) ?? new Set<string>()
    set.add(r.name as string)
    existingNamesByUser.set(r.user_id as string, set)
  }

  function newNameFor(userId: string, oldName: string): string | null {
    if (oldName === 'Aadhaar Front') {
      const govtIdType = kycByUser.get(userId)
      return govtIdType ? `${govtIdType} (Front)` : 'Government ID'
    }
    if (oldName === 'PAN Front') return 'PAN Card Front'
    if (oldName === 'PAN Back') return 'PAN Card Back'
    if (oldName === 'Ration Card (2)') return 'Ration Card (Page 2)'
    return null
  }

  let renamed = 0, skippedCollision = 0, skippedNoChange = 0

  for (const row of rows) {
    const userId = row.user_id as string
    const oldName = row.name as string
    const newName = newNameFor(userId, oldName)
    if (!newName || newName === oldName) { skippedNoChange++; continue }

    const existing = existingNamesByUser.get(userId) ?? new Set()
    if (existing.has(newName)) {
      console.log(`  ⚠ SKIP (collision): user ${userId} already has a row named "${newName}" — leaving "${oldName}" (id ${row.id}) alone.`)
      skippedCollision++
      continue
    }

    console.log(`  user ${userId}: "${oldName}" -> "${newName}" (id ${row.id})`)
    if (APPLY) {
      const { error: updErr } = await supabase.from('member_documents').update({ name: newName }).eq('id', row.id)
      if (updErr) { console.log(`    ❌ update failed: ${updErr.message}`); continue }
    }
    renamed++
  }

  console.log(`\n${renamed} row(s) ${APPLY ? 'renamed' : 'would be renamed'}.`)
  if (skippedCollision > 0) console.log(`${skippedCollision} row(s) skipped due to a name collision — check those manually.`)
  if (skippedNoChange > 0) console.log(`${skippedNoChange} row(s) skipped (no name change needed).`)
  if (!APPLY) console.log('Dry run only — re-run with --apply to write these changes.')
}

main().catch(console.error)
