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

// Scheduled 3x/day in vercel.json (00:00, 02:00, 10:00 IST) — a single Hobby-plan
// cron tick is best-effort and can silently not fire at all (observed: the
// 2026-07-13->14 midnight run never happened, no deploy or error explains it, and
// every other night that week fired fine). With one shot a day that leaves
// completed recurring tasks stuck for up to 24h with no successor in To Do.
// runRecurringTasksJob only touches rows still recurring_active=true, so a repeat
// run the same day is a no-op for anything already cloned — safe to fire 3x.
export async function GET(req: Request) {
  const authHeader = req.headers.get('authorization')
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const result = await runRecurringTasksJob(adminSupabase())
  return NextResponse.json(result)
}
