import { createServerClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import MemberShootsClient from './shoots-client'

export const revalidate = 30

export default async function MemberShootsPage() {
  const supabase = await createServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: shoots } = await supabase
    .from('shoots')
    .select('*')
    .eq('created_by', user.id)
    .order('start_time', { ascending: false })

  return <MemberShootsClient shoots={shoots ?? []} />
}
