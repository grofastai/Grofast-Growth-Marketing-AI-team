import { getHubNotes, getFolders } from '@/lib/actions/notes'
import { createServerClient } from '@/lib/supabase/server'
import { createClient } from '@supabase/supabase-js'
import { redirect } from 'next/navigation'
import NotesHub from '@/components/notes/notes-hub'

export const dynamic = 'force-dynamic'

function adminSupabase() {
  return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } })
}

export default async function MemberNotesPage() {
  const supabase = await createServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')
  const admin = adminSupabase()
  const { data: profile } = await admin.from('users').select('company_id, role').eq('id', user.id).single()
  const [notes, folders, members] = await Promise.all([
    getHubNotes(), getFolders(),
    profile?.company_id
      ? admin.from('users').select('id, name, employee_id').eq('company_id', profile.company_id).eq('status', 'active').eq('role', 'MEMBER').order('name')
      : Promise.resolve({ data: [] as { id: string; name: string; employee_id: string }[] }),
  ])
  return <NotesHub initialNotes={notes} folders={folders}
    teamMembers={(members.data ?? []) as { id: string; name: string; employee_id: string }[]}
    viewer={{ id: user.id, role: (profile?.role as 'ADMIN' | 'MEMBER') ?? 'MEMBER' }} />
}
