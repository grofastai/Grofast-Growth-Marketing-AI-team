import { createServerClient } from '@/lib/supabase/server'
import { createClient } from '@supabase/supabase-js'
import { redirect } from 'next/navigation'
import ProjectsClient from './projects-client'

export default async function ProjectsPage() {
  const supabase = await createServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const admin = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  )

  const { data: profile } = await admin
    .from('users')
    .select('company_id')
    .eq('id', user.id)
    .single()

  if (!profile) redirect('/login')

  const { data: projects } = await admin
    .from('projects')
    .select('id, business_name, client_name, location, service_type, status, deadline, progress_pct, created_at')
    .eq('company_id', profile.company_id)
    .order('created_at', { ascending: false })

  return <ProjectsClient projects={projects ?? []} />
}
