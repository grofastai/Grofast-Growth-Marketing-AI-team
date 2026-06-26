import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

// ONE-TIME FIX ROUTE — delete after use
// Fixes:  "PN CONSTRCUTION" → "PN CONSTRUCTION"
//         duplicate SWEGAS BEAUTY entries removed, work_entries updated

function adminDb() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  )
}

export async function GET() {
  const admin = adminDb()
  const log: string[] = []

  // ── 1. Fix "PN CONSTRCUTION" → "PN CONSTRUCTION" in clients ──
  const { error: e1, count: c1 } = await admin
    .from('clients')
    .update({ name: 'PN CONSTRUCTION' })
    .eq('name', 'PN CONSTRCUTION')
  if (e1) log.push(`clients PN fix error: ${e1.message}`)
  else log.push(`clients: renamed PN CONSTRCUTION → PN CONSTRUCTION (${c1 ?? 0} rows)`)

  // ── 2. Delete duplicate SWEGAS entries (keep SWEGASS BEAUTY PARLOUR) ──
  const { data: swegas } = await admin
    .from('clients')
    .select('id, name')
    .ilike('name', '%swegas%')
    .neq('name', 'SWEGASS BEAUTY PARLOUR')

  if (swegas && swegas.length > 0) {
    const ids = swegas.map((r: { id: string }) => r.id)
    const names = swegas.map((r: { name: string }) => r.name).join(', ')
    const { error: e2 } = await admin.from('clients').delete().in('id', ids)
    if (e2) log.push(`clients SWEGAS delete error: ${e2.message}`)
    else log.push(`clients: deleted duplicate(s): ${names}`)
  } else {
    log.push('clients: no duplicate SWEGAS entries found')
  }

  // ── 3. Fix work_entries: "PN CONSTRCUTION" → "PN CONSTRUCTION" ──
  const { data: pnRows } = await admin
    .from('daily_updates')
    .select('id, work_entries')
    .like('work_entries::text', '%PN CONSTRCUTION%')

  let pnFixed = 0
  if (pnRows) {
    for (const row of pnRows) {
      if (!Array.isArray(row.work_entries)) continue
      const updated = (row.work_entries as Record<string, unknown>[]).map(e =>
        (e.client_name as string) === 'PN CONSTRCUTION'
          ? { ...e, client_name: 'PN CONSTRUCTION' }
          : e
      )
      await admin.from('daily_updates').update({ work_entries: updated }).eq('id', row.id)
      pnFixed++
    }
  }
  log.push(`daily_updates: fixed PN CONSTRCUTION in ${pnFixed} record(s)`)

  // ── 4. Fix work_entries: wrong SWEGAS variants → SWEGASS BEAUTY PARLOUR ──
  const { data: swRows } = await admin
    .from('daily_updates')
    .select('id, work_entries')
    .ilike('work_entries::text', '%swegas%')

  let swFixed = 0
  if (swRows) {
    for (const row of swRows) {
      if (!Array.isArray(row.work_entries)) continue
      let changed = false
      const updated = (row.work_entries as Record<string, unknown>[]).map(e => {
        const cn = (e.client_name as string) ?? ''
        if (cn.toLowerCase().includes('swegas') && cn !== 'SWEGASS BEAUTY PARLOUR') {
          changed = true
          return { ...e, client_name: 'SWEGASS BEAUTY PARLOUR' }
        }
        return e
      })
      if (changed) {
        await admin.from('daily_updates').update({ work_entries: updated }).eq('id', row.id)
        swFixed++
      }
    }
  }
  log.push(`daily_updates: fixed SWEGAS variant in ${swFixed} record(s)`)

  return NextResponse.json({ ok: true, log })
}
