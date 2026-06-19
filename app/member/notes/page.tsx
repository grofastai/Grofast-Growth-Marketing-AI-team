import { getNotes } from '@/lib/actions/notes'
import { createServerClient } from '@/lib/supabase/server'
import { createClient } from '@supabase/supabase-js'
import { redirect } from 'next/navigation'
import NotesClient from './notes-client'

export const dynamic = 'force-dynamic'

function adminSupabase() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  )
}

export default async function NotesPage({
  searchParams,
}: {
  searchParams: Promise<{ archived?: string }>
}) {
  const params = await searchParams
  const archived = params.archived === '1'

  const supabase = await createServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const admin = adminSupabase()
  const { data: profile } = await admin
    .from('users')
    .select('company_id')
    .eq('id', user.id)
    .single()

  const [notes, membersResult] = await Promise.all([
    getNotes(archived),
    profile?.company_id
      ? admin.from('users')
          .select('id, name, employee_id')
          .eq('company_id', profile.company_id)
          .eq('status', 'active')
          .order('name')
      : Promise.resolve({ data: [] }),
  ])

  const teamMembers = (membersResult.data ?? []) as { id: string; name: string; employee_id: string }[]

  return (
    <NotesClient
      initialNotes={notes}
      showArchived={archived}
      teamMembers={teamMembers}
      currentUserId={user.id}
    />
  )
}
