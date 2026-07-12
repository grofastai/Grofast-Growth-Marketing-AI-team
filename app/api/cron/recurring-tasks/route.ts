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

// Scheduled at 18:30 UTC (00:00 IST) in vercel.json — Hobby plan crons fire
// anywhere within their scheduled hour, so expect this to run sometime
// between 00:00–00:59 IST, not necessarily exactly midnight.
export async function GET(req: Request) {
  const authHeader = req.headers.get('authorization')
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const result = await runRecurringTasksJob(adminSupabase())
  return NextResponse.json(result)
}
