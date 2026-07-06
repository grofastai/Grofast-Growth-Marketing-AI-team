import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { runRecurringTasksJob } from '@/lib/cron/recurring-tasks'

export const runtime = 'nodejs'

function adminSupabase() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  )
}

export async function GET(req: Request) {
  const authHeader = req.headers.get('authorization')
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const cutoff = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString()

  const admin = adminSupabase()
  const { error, count } = await admin
    .from('tasks')
    .delete({ count: 'exact' })
    .eq('status', 'completed')
    .lt('completed_at', cutoff)

  if (error) {
    console.error('[cleanup-tasks] delete failed:', error.message)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  console.log(`[cleanup-tasks] deleted ${count} tasks completed before ${cutoff}`)

  const recurring = await runRecurringTasksJob(admin)

  return NextResponse.json({ deleted: count, cutoff, recurring })
}
