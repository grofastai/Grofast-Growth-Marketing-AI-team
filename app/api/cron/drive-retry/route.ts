export const dynamic = 'force-dynamic'
export const revalidate = 0

import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { uploadMemberDoc } from '@/lib/actions/member-documents'
import { nextRetryState } from '@/lib/google/document-sync'

function adminSupabase() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  )
}

function isAuthorized(request: NextRequest): boolean {
  const cronSecret = process.env.CRON_SECRET
  const authHeader = request.headers.get('authorization')
  return !!cronSecret && authHeader === `Bearer ${cronSecret}`
}

// Runs once daily at 7:00 PM IST (see vercel.json). Retries every pending
// drive_sync_queue row by re-downloading the file from Supabase Storage
// and re-attempting the Drive upload. Gives up (status='failed') after
// MAX_DRIVE_RETRY_ATTEMPTS failed days.
export async function GET(request: NextRequest) {
  if (!isAuthorized(request)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const admin = adminSupabase()

  const { data: queued, error } = await admin
    .from('drive_sync_queue')
    .select('id, company_id, user_id, name, storage_path, mime_type, attempts')
    .eq('status', 'pending')

  if (error) {
    console.error('[drive-retry] failed to fetch queue:', error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  let retried = 0
  let succeeded = 0
  let gaveUp = 0

  for (const row of queued ?? []) {
    retried++
    try {
      const { data: blob, error: dlErr } = await admin.storage.from('documents').download(row.storage_path)
      if (dlErr || !blob) throw new Error(dlErr?.message ?? 'download returned no data')

      const file = new File([blob], row.name, { type: row.mime_type })
      const form = new FormData()
      form.append('user_id', row.user_id)
      form.append('company_id', row.company_id)
      form.append('file', file)

      const result = await uploadMemberDoc(form)
      if (result && 'error' in result && result.error) throw new Error(result.error)

      await admin.from('drive_sync_queue').delete().eq('id', row.id)
      succeeded++
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err)
      console.error(`[drive-retry] retry failed for queue row ${row.id}:`, message)
      const next = nextRetryState(row.attempts)
      await admin.from('drive_sync_queue').update({
        attempts: next.attempts,
        status: next.status,
        last_error: message,
        last_attempt_at: new Date().toISOString(),
      }).eq('id', row.id)
      if (next.status === 'failed') gaveUp++
    }
  }

  console.log(`[drive-retry] retried=${retried} succeeded=${succeeded} gave-up=${gaveUp}`)
  return NextResponse.json({ retried, succeeded, gaveUp })
}
