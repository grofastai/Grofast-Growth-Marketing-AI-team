import { createClient } from '@supabase/supabase-js'
import { NextRequest, NextResponse } from 'next/server'
import { fetchSheetClients } from '@/lib/google/sheets'

function adminSupabase() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  )
}

function isAuthorized(req: NextRequest): boolean {
  const secret = process.env.CRON_SECRET
  return !!secret && req.headers.get('authorization') === `Bearer ${secret}`
}

// Runs daily at midnight IST.
// Fetches Active + Past clients from Google Sheets and upserts into Supabase
// clients table so all pages always read fresh data from Supabase.
export async function GET(req: NextRequest) {
  if (!isAuthorized(req)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const sheetId  = process.env.GOOGLE_CLIENTS_SHEET_ID
  const activeGid = process.env.GOOGLE_CLIENTS_SHEET_GID
  const pastGid   = process.env.GOOGLE_PAST_CLIENTS_SHEET_GID

  if (!sheetId) {
    return NextResponse.json({ error: 'GOOGLE_CLIENTS_SHEET_ID not set' }, { status: 500 })
  }

  const admin = adminSupabase()

  // Fetch both tabs in parallel
  const [rawActive, rawPast] = await Promise.all([
    fetchSheetClients(sheetId, activeGid).catch(() => []),
    pastGid ? fetchSheetClients(sheetId, pastGid).catch(() => []) : Promise.resolve([]),
  ])

  const toClientRow = (c: (typeof rawActive)[0], status: 'active' | 'past') => ({
    name:         (c.company_name || c.customer_name).trim(),
    contact_name: c.customer_name.trim() || null,
    industry:     c.industry     || null,
    location:     c.place        || null,
    service:      c.service      || null,
    package_name: c.package_name || null,
    status,
    updated_at:   new Date().toISOString(),
  })

  const activeRows = rawActive
    .filter(c => (c.company_name || c.customer_name).trim())
    .map(c => toClientRow(c, 'active'))

  const pastRows = rawPast
    .filter(c => (c.company_name || c.customer_name).trim())
    .map(c => toClientRow(c, 'past'))

  if (!activeRows.length && !pastRows.length) {
    return NextResponse.json({ message: 'No clients found in sheet', active: 0, past: 0 })
  }

  // Get all company IDs to sync into (in practice GroFast has one company)
  const { data: companies, error: companyErr } = await admin.from('companies').select('id')
  if (companyErr || !companies?.length) {
    return NextResponse.json({ error: companyErr?.message ?? 'No companies found' }, { status: 500 })
  }

  let upserted = 0
  for (const company of companies) {
    const rows = [
      ...activeRows.map(r => ({ ...r, company_id: company.id })),
      ...pastRows.map(r => ({ ...r, company_id: company.id })),
    ]
    const { error } = await admin.from('clients').upsert(rows, {
      onConflict: 'company_id,name',
      ignoreDuplicates: false,
    })
    if (!error) upserted += rows.length
  }

  return NextResponse.json({
    active:    activeRows.length,
    past:      pastRows.length,
    companies: companies.length,
    upserted,
  })
}
