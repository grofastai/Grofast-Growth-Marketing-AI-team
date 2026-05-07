import { createServerClient } from '@/lib/supabase/server'
import AdminShootsClient from './shoots-client'

export const revalidate = 30

export default async function AdminShootsPage() {
  const supabase = await createServerClient()

  const { data: shoots } = await supabase
    .from('shoots')
    .select('*, creator:users!created_by(name)')
    .order('start_time', { ascending: false })

  return <AdminShootsClient shoots={shoots ?? []} />
}
