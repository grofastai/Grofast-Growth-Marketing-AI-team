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

  // ── 1a. Check clients table for any wrong "PN CONST..." spelling ──
  const { data: pnClients } = await admin
    .from('clients')
    .select('id, name')
    .ilike('name', '%pn%')

  log.push(`clients: all PN-containing names = ${JSON.stringify(pnClients?.map((r: {name:string}) => r.name) ?? [])}`)

  if (pnClients) {
    for (const c of pnClients as {id:string; name:string}[]) {
      if (c.name !== 'PN CONSTRUCTION') {
        const { error: e1 } = await admin.from('clients').update({ name: 'PN CONSTRUCTION' }).eq('id', c.id)
        if (e1) log.push(`clients PN fix error: ${e1.message}`)
        else log.push(`clients: renamed "${c.name}" → PN CONSTRUCTION`)
      }
    }
  }

  // ── 1b. Check projects table (business_name + client_name) ──
  const { data: pnProjects } = await admin
    .from('projects')
    .select('id, business_name, client_name')
    .or('business_name.ilike.%pn const%,client_name.ilike.%pn const%')

  log.push(`projects: found PN variants = ${JSON.stringify(pnProjects?.map((r: {business_name:string; client_name:string}) => ({ b: r.business_name, c: r.client_name })) ?? [])}`)

  if (pnProjects) {
    for (const p of pnProjects as {id:string; business_name:string; client_name:string}[]) {
      const patch: Record<string, string> = {}
      if (p.business_name && p.business_name !== 'PN CONSTRUCTION' && p.business_name.toLowerCase().includes('pn const')) patch.business_name = 'PN CONSTRUCTION'
      if (p.client_name   && p.client_name   !== 'PN CONSTRUCTION' && p.client_name.toLowerCase().includes('pn const'))   patch.client_name   = 'PN CONSTRUCTION'
      if (Object.keys(patch).length > 0) {
        const { error: ep } = await admin.from('projects').update(patch).eq('id', p.id)
        if (ep) log.push(`projects PN fix error: ${ep.message}`)
        else log.push(`projects: fixed row ${p.id} → ${JSON.stringify(patch)}`)
      }
    }
  }

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

  // ── 3. Fix work_entries: any "PN CONST..." variant → "PN CONSTRUCTION" ──
  const { data: pnRows } = await admin
    .from('daily_updates')
    .select('id, work_entries')
    .ilike('work_entries::text', '%pn%')

  let pnFixed = 0
  if (pnRows) {
    for (const row of pnRows) {
      if (!Array.isArray(row.work_entries)) continue
      let changed = false
      const updated = (row.work_entries as Record<string, unknown>[]).map(e => {
        const cn = ((e.client_name as string) ?? '').toLowerCase()
        if (cn.includes('pn const') && (e.client_name as string) !== 'PN CONSTRUCTION') {
          changed = true
          return { ...e, client_name: 'PN CONSTRUCTION' }
        }
        return e
      })
      if (changed) {
        await admin.from('daily_updates').update({ work_entries: updated }).eq('id', row.id)
        pnFixed++
      }
    }
  }
  log.push(`daily_updates: fixed PN CONST variant in ${pnFixed} record(s)`)

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
