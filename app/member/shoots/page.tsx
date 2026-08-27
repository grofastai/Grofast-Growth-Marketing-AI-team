import { createServerClient } from '@/lib/supabase/server'
import { createClient } from "@supabase/supabase-js"
import { getValidImpersonationId } from "@/lib/impersonation"
import { redirect } from 'next/navigation'
import MemberShootsClient from './shoots-client'

export const revalidate = 30

function adminSupabase() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  )
}

export default async function MemberShootsPage() {
  const supabase = await createServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const impersonateId = await getValidImpersonationId(user.id)
  const effectiveUserId = impersonateId ?? user.id
  // When impersonating, read through the service-role client (RLS would otherwise
  // return zero rows since the session is still the admin's), scoped to effectiveUserId.
  const db = impersonateId ? adminSupabase() : supabase

  const { data: shoots } = await db
    .from('shoots')
    .select('*')
    .eq("created_by", effectiveUserId)
    .order('start_time', { ascending: false })

  return <MemberShootsClient shoots={shoots ?? []} />
}
