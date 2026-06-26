import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

// ONE-TIME FIX ROUTE — delete after use
// Fixes:  "PN CONSTRCUTION" → "PN CONSTRUCTION" (wherever it lives)
//         duplicate SWEGAS BEAUTY entries removed + work_entries updated

function adminDb() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  )
}

const CORRECT_PN = 'PN CONSTRUCTION'

function isWrongPn(name: string | null | undefined): boolean {
  if (!name) return false
  const u = name.toUpperCase()
  return u.includes('PN') && u.includes('CONST') && name !== CORRECT_PN
}

export async function GET() {
  const admin = adminDb()
  const log: string[] = []

  // ── 1. clients table ──────────────────────────────────────────
  const { data: allClients } = await admin
    .from('clients')
    .select('id, name')
    .ilike('name', '%pn%')

  log.push(`clients PN search: ${JSON.stringify(allClients?.map((r: {name:string}) => r.name) ?? [])}`)

  for (const c of (allClients ?? []) as {id:string; name:string}[]) {
    if (isWrongPn(c.name)) {
      const { error } = await admin.from('clients').update({ name: CORRECT_PN }).eq('id', c.id)
      log.push(error ? `clients error: ${error.message}` : `clients: "${c.name}" → "${CORRECT_PN}"`)
    }
  }

  // ── 2. Remove duplicate SWEGAS entries ──────────────────────
  const { data: swegas } = await admin
    .from('clients')
    .select('id, name')
    .ilike('name', '%swegas%')
    .neq('name', 'SWEGASS BEAUTY PARLOUR')

  if (swegas && swegas.length > 0) {
    const ids = swegas.map((r: {id:string}) => r.id)
    const names = swegas.map((r: {name:string}) => r.name).join(', ')
    const { error } = await admin.from('clients').delete().in('id', ids)
    log.push(error ? `swegas delete error: ${error.message}` : `clients: deleted "${names}"`)
  } else {
    log.push('clients: no duplicate SWEGAS found')
  }

  // ── 3. projects table — business_name ──────────────────────
  const { data: projBiz } = await admin
    .from('projects')
    .select('id, business_name')
    .ilike('business_name', '%pn%')

  log.push(`projects.business_name PN search: ${JSON.stringify(projBiz?.map((r: {business_name:string}) => r.business_name) ?? [])}`)

  for (const p of (projBiz ?? []) as {id:string; business_name:string}[]) {
    if (isWrongPn(p.business_name)) {
      const { error } = await admin.from('projects').update({ business_name: CORRECT_PN }).eq('id', p.id)
      log.push(error ? `projects biz error: ${error.message}` : `projects: business_name "${p.business_name}" → "${CORRECT_PN}"`)
    }
  }

  // ── 4. projects table — client_name ────────────────────────
  const { data: projCli } = await admin
    .from('projects')
    .select('id, client_name')
    .ilike('client_name', '%pn%')

  log.push(`projects.client_name PN search: ${JSON.stringify(projCli?.map((r: {client_name:string}) => r.client_name) ?? [])}`)

  for (const p of (projCli ?? []) as {id:string; client_name:string}[]) {
    if (isWrongPn(p.client_name)) {
      const { error } = await admin.from('projects').update({ client_name: CORRECT_PN }).eq('id', p.id)
      log.push(error ? `projects cli error: ${error.message}` : `projects: client_name "${p.client_name}" → "${CORRECT_PN}"`)
    }
  }

  // ── 5. daily_updates work_entries — fix wrong PN spelling ──
  const { data: duRows } = await admin
    .from('daily_updates')
    .select('id, work_entries')
    .ilike('work_entries::text', '%pn%')

  let pnFixed = 0
  for (const row of (duRows ?? [])) {
    if (!Array.isArray(row.work_entries)) continue
    let changed = false
    const updated = (row.work_entries as Record<string, unknown>[]).map(e => {
      if (isWrongPn(e.client_name as string)) {
        changed = true
        return { ...e, client_name: CORRECT_PN }
      }
      return e
    })
    if (changed) {
      await admin.from('daily_updates').update({ work_entries: updated }).eq('id', row.id)
      pnFixed++
    }
  }
  log.push(`daily_updates: fixed PN in ${pnFixed} record(s)`)

  // ── 6. daily_updates work_entries — fix wrong SWEGAS spelling ──
  const { data: swRows } = await admin
    .from('daily_updates')
    .select('id, work_entries')
    .ilike('work_entries::text', '%swegas%')

  let swFixed = 0
  for (const row of (swRows ?? [])) {
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
  log.push(`daily_updates: fixed SWEGAS in ${swFixed} record(s)`)

  return NextResponse.json({ ok: true, log })
}
