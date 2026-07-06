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

// Not scheduled directly (vercel.json's crons array is at its 100-item cap) —
// this job actually runs piggybacked on the cleanup-tasks cron. Kept here for
// manual/testing invocation with the same CRON_SECRET auth.
export async function GET(req: Request) {
  const authHeader = req.headers.get('authorization')
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const result = await runRecurringTasksJob(adminSupabase())
  return NextResponse.json(result)
}
