export const dynamic = 'force-dynamic'
export const revalidate = 0

import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { uploadFileToBackupFolder } from '@/lib/google/drive'
import { todayIST } from '@/lib/utils/ist-date'

function adminSupabase() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  )
}

// PostgREST caps every response at 1000 rows, so a single select('*') silently
// truncates once a table grows past that. Page through until a short page comes back.
const PAGE_SIZE = 1000
async function selectAll(
  admin: ReturnType<typeof adminSupabase>,
  table: string,
  columns: string,
  orderBy: string,
): Promise<{ data: Record<string, unknown>[]; error: { message: string } | null }> {
  const rows: Record<string, unknown>[] = []
  for (let from = 0; ; from += PAGE_SIZE) {
    const { data, error } = await admin
      .from(table)
      .select(columns)
      .order(orderBy, { ascending: true })
      .order('id', { ascending: true })
      .range(from, from + PAGE_SIZE - 1)
    if (error) return { data: rows, error }
    rows.push(...((data ?? []) as unknown as Record<string, unknown>[]))
    if (!data || data.length < PAGE_SIZE) return { data: rows, error: null }
  }
}

function isAuthorized(req: NextRequest): boolean {
  const secret = process.env.CRON_SECRET
  return !!secret && req.headers.get('authorization') === `Bearer ${secret}`
}

// Runs every Sunday at 9 AM IST (3:30 AM UTC).
// Dumps daily_updates, attendance_logs, leaves, and users to Google Drive
// under <root>/Backups/<year>/<date>_db-backup.json
export async function GET(req: NextRequest) {
  if (!isAuthorized(req)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const admin = adminSupabase()
  const today = todayIST()
  const year = today.slice(0, 4)

  const [
    { data: daily_updates,   error: e1 },
    { data: attendance_logs, error: e2 },
    { data: leaves,          error: e3 },
    { data: users,           error: e4 },
  ] = await Promise.all([
    selectAll(admin, 'daily_updates', '*', 'date'),
    selectAll(admin, 'attendance_logs', '*', 'date'),
    selectAll(admin, 'leaves', '*', 'created_at'),
    // Exclude sensitive auth fields — keep only operational columns
    selectAll(admin, 'users', 'id, name, employee_id, role, team, status, email, company_id', 'name'),
  ])

  const fetchError = e1 || e2 || e3 || e4
  if (fetchError) {
    console.error('[db-backup] FAILED reading tables:', fetchError.message)
    return NextResponse.json({ error: fetchError.message }, { status: 500 })
  }

  const rowCounts = {
    daily_updates:   daily_updates?.length   ?? 0,
    attendance_logs: attendance_logs?.length ?? 0,
    leaves:          leaves?.length          ?? 0,
    users:           users?.length           ?? 0,
  }

  const payload = {
    backup_date:  today,
    generated_at: new Date().toISOString(),
    row_counts:   rowCounts,
    tables: {
      users:           users           ?? [],
      daily_updates:   daily_updates   ?? [],
      attendance_logs: attendance_logs ?? [],
      leaves:          leaves          ?? [],
    },
  }

  const fileName = `${today}_db-backup.json`
  let fileId: string
  try {
    fileId = await uploadFileToBackupFolder(year, fileName, JSON.stringify(payload, null, 2))
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    console.error('[db-backup] FAILED uploading to Drive:', message)
    return NextResponse.json({ error: message, row_counts: rowCounts }, { status: 500 })
  }

  console.log(`[db-backup] ${fileName} uploaded`, rowCounts)
  return NextResponse.json({ success: true, file: fileName, drive_file_id: fileId, row_counts: rowCounts })
}
