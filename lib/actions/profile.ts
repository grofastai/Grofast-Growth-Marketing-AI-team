'use server'

import { createServerClient } from '@/lib/supabase/server'
import { createClient } from '@supabase/supabase-js'
import { revalidatePath } from 'next/cache'

function adminSupabase() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  )
}

export async function updatePersonalDetails(data: {
  photo_url?: string | null
  blood_group?: string | null
  address?: string | null
  emergency_contact_name?: string | null
  emergency_contact_phone?: string | null
}) {
  const supabase = await createServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'Unauthorized' }

  const admin = adminSupabase()
  const { error } = await admin.from('users').update({
    ...data,
  }).eq('id', user.id)

  if (error) return { error: error.message }
  revalidatePath('/member/profile')
  revalidatePath('/member/dashboard')
  return { success: true }
}

export async function updateKYC(data: {
  bank_name?: string | null
  bank_account?: string | null
  bank_ifsc?: string | null
  aadhaar_number?: string | null
  pan_number?: string | null
  govt_id_url?: string | null
  aadhaar_back_url?: string | null
  pan_front_url?: string | null
  pan_back_url?: string | null
  ration_card_url?: string | null
  ration_card_url2?: string | null
}) {
  const supabase = await createServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'Unauthorized' }

  const admin = adminSupabase()
  const { data: profile } = await admin.from('users').select('company_id').eq('id', user.id).single()
  if (!profile) return { error: 'Not found' }

  const { error } = await admin.from('member_kyc').upsert({
    user_id: user.id,
    company_id: profile.company_id,
    ...data,
    updated_at: new Date().toISOString(),
  }, { onConflict: 'user_id' })

  if (error) return { error: error.message }
  revalidatePath('/member/profile')
  revalidatePath('/member/dashboard')
  return { success: true }
}
