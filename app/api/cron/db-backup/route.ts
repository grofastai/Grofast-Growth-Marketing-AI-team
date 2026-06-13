import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { uploadFileToBackupFolder } from '@/lib/google/drive'

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

// Runs every Sunday at 9 AM IST (3:30 AM UTC).
// Dumps daily_updates, attendance_logs, leaves, and users to Google Drive
// under <root>/Backups/<year>/<date>_db-backup.json
export async function GET(req: NextRequest) {
  if (!isAuthorized(req)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const admin = adminSupabase()
  const today = new Date().toISOString().split('T')[0]
  const year = today.slice(0, 4)

  const [
    { data: daily_updates,   error: e1 },
    { data: attendance_logs, error: e2 },
    { data: leaves,          error: e3 },
    { data: users,           error: e4 },
  ] = await Promise.all([
    admin.from('daily_updates').select('*').order('date', { ascending: true }),
    admin.from('attendance_logs').select('*').order('date', { ascending: true }),
    admin.from('leaves').select('*').order('created_at', { ascending: true }),
    // Exclude sensitive auth fields — keep only operational columns
    admin.from('users').select('id, name, employee_id, role, team, status, email, company_id').order('name'),
  ])

  const fetchError = e1 || e2 || e3 || e4
  if (fetchError) {
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
  const fileId = await uploadFileToBackupFolder(year, fileName, JSON.stringify(payload, null, 2))

  return NextResponse.json({ success: true, file: fileName, drive_file_id: fileId, row_counts: rowCounts })
}
