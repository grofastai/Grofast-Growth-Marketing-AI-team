'use server'

import { createClient } from '@supabase/supabase-js'

function adminClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  )
}

export async function logFreelancerActivity({
  companyId,
  freelancerId,
  action,
  actorId,
  actorName,
  remarks,
}: {
  companyId: string
  freelancerId: string
  action: string
  actorId?: string
  actorName?: string
  remarks?: string
}) {
  const admin = adminClient()
  await admin.from('freelancer_activity_logs').insert({
    company_id:    companyId,
    freelancer_id: freelancerId,
    action,
    actor_id:   actorId ?? null,
    actor_name: actorName ?? null,
    remarks:    remarks ?? null,
  })
}
