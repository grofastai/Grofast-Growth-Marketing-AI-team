'use server'

import { createClient } from '@supabase/supabase-js'
import { createServerClient } from '@/lib/supabase/server'
import { revalidatePath } from 'next/cache'

function adminSupabase() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  )
}

export type SimpleEntryInput = {
  title: string
  clients: string[]
  progress: number
  notes: string
}

export async function submitSimpleUpdate(
  date: string,
  entries: SimpleEntryInput[],
  participantIds: string[] = [],
): Promise<{ success: boolean; error?: string }> {
  const supabase = await createServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { success: false, error: 'Not authenticated' }

  const admin = adminSupabase()
  const { data: profile } = await admin
    .from('users')
    .select('company_id')
    .eq('id', user.id)
    .single()
  if (!profile?.company_id) return { success: false, error: 'Profile not found' }

  const cid = profile.company_id
  const workEntries = entries.map(e => ({
    task_type: 'work',
    title: e.title,
    client: e.clients[0] ?? null,
    clients: e.clients,
    progress: e.progress,
    notes: e.notes || null,
  }))

  // Preserve auto-inserted leave entries (_is_leave: true)
  const { data: existing } = await admin
    .from('daily_updates')
    .select('work_entries')
    .eq('user_id', user.id)
    .eq('date', date)
    .maybeSingle()
  const leaveEntries = (Array.isArray(existing?.work_entries) ? existing.work_entries as Record<string, unknown>[] : [])
    .filter(e => e._is_leave === true)
  const finalEntries = [...workEntries, ...leaveEntries]

  const { error } = await admin
    .from('daily_updates')
    .upsert(
      {
        company_id: cid,
        user_id: user.id,
        date,
        attendance_status: 'present',
        work_entries: finalEntries,
        participant_ids: participantIds,
        working_hours: null,
      },
      { onConflict: 'user_id,date' }
    )

  if (error) return { success: false, error: error.message }

  revalidatePath('/member/update')
  revalidatePath('/admin/activities')
  return { success: true }
}
