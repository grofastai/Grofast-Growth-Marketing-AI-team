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
  passport_photo_url?: string | null
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
  revalidatePath('/admin/dashboard')
  revalidatePath('/admin', 'layout')
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
  signature_url?: string | null
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
  revalidatePath('/member/documents')
  revalidatePath('/admin/documents')
  return { success: true }
}

export async function uploadProfessionalPhoto(formData: FormData): Promise<{ success?: boolean; url?: string; error?: string }> {
  const supabase = await createServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'Unauthorized' }

  const file = formData.get('file') as File | null
  if (!file) return { error: 'No file provided' }
  if (file.size > 3 * 1024 * 1024) return { error: 'File too large (max 3MB)' }

  const admin = adminSupabase()
  const { data: prof } = await admin.from('users').select('company_id').eq('id', user.id).single()
  if (!prof) return { error: 'Not found' }

  const ext = file.name.split('.').pop()?.toLowerCase() ?? 'jpg'
  const path = `${prof.company_id}/${user.id}.${ext}`
  const buf = Buffer.from(await file.arrayBuffer())

  const { error: upErr } = await admin.storage
    .from('passport-photos')
    .upload(path, buf, { contentType: file.type, upsert: true })
  if (upErr) return { error: upErr.message }

  const { data: { publicUrl } } = admin.storage.from('passport-photos').getPublicUrl(path)
  await admin.from('users').update({ passport_photo_url: publicUrl }).eq('id', user.id)
  revalidatePath('/member/profile')
  return { success: true, url: publicUrl }
}

export type KYCDocField = 'govt_id_url' | 'aadhaar_back_url' | 'pan_front_url' | 'pan_back_url' | 'ration_card_url' | 'ration_card_url2' | 'signature_url'

export async function deleteKYCDocument(
  field: KYCDocField
): Promise<{ success: boolean; error?: string }> {
  const supabase = await createServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { success: false, error: 'Unauthorized' }

  const admin = adminSupabase()

  const { data: kyc } = await admin
    .from('member_kyc')
    .select(field)
    .eq('user_id', user.id)
    .maybeSingle()

  const url = (kyc?.[field as keyof typeof kyc] as unknown) as string | null
  if (url) {
    const marker = '/documents/'
    const idx = url.indexOf(marker)
    if (idx !== -1) {
      const storagePath = url.slice(idx + marker.length)
      await admin.storage.from('documents').remove([storagePath])
    }
  }

  const { error } = await admin
    .from('member_kyc')
    .update({ [field]: null })
    .eq('user_id', user.id)

  if (error) return { success: false, error: error.message }
  revalidatePath('/member/profile')
  revalidatePath('/member/documents')
  revalidatePath('/admin/documents')
  return { success: true }
}

export async function getMyPayslipHistory(): Promise<
  { month: string; is_paid: boolean; paid_at: string | null }[]
> {
  const supabase = await createServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return []

  const admin = adminSupabase()
  const { data } = await admin
    .from('payroll_runs')
    .select('month, is_paid, paid_at')
    .eq('user_id', user.id)
    .order('month', { ascending: false })
    .limit(12)

  return (data ?? []) as { month: string; is_paid: boolean; paid_at: string | null }[]
}
