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

export async function saveDocumentRecord(input: {
  userId: string
  name: string
  fileUrl: string
  fileType?: string
  fileSize?: number
  docType: string
}): Promise<{ success: boolean; error?: string }> {
  const supabase = await createServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { success: false, error: 'Not authenticated' }

  const admin = adminSupabase()
  const { data: profile } = await admin.from('users').select('company_id').eq('id', user.id).single()
  if (!profile?.company_id) return { success: false, error: 'Profile not found' }

  const { error } = await admin.from('documents').insert({
    company_id:  profile.company_id,
    user_id:     input.userId,
    name:        input.name,
    file_url:    input.fileUrl,
    file_type:   input.fileType ?? null,
    file_size:   input.fileSize ?? null,
    doc_type:    input.docType,
    uploaded_by: user.id,
  })

  if (error) return { success: false, error: error.message }

  revalidatePath('/admin/documents')
  revalidatePath('/member/documents')
  return { success: true }
}

export async function deleteDocument(id: string): Promise<{ success: boolean; error?: string }> {
  const supabase = await createServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { success: false, error: 'Not authenticated' }

  const admin = adminSupabase()
  const { error } = await admin.from('documents').delete().eq('id', id)
  if (error) return { success: false, error: error.message }

  revalidatePath('/admin/documents')
  revalidatePath('/member/documents')
  return { success: true }
}

export async function verifyMemberKYC(userId: string): Promise<{ success: boolean; error?: string }> {
  const supabase = await createServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { success: false, error: 'Not authenticated' }

  const admin = adminSupabase()
  const { data: existing } = await admin.from('member_kyc').select('user_id').eq('user_id', userId).maybeSingle()
  if (!existing) return { success: false, error: 'No KYC documents uploaded yet' }

  const { error } = await admin.from('member_kyc').update({
    kyc_verified: true,
    kyc_verified_at: new Date().toISOString(),
    kyc_verified_by: user.id,
  }).eq('user_id', userId)

  if (error) return { success: false, error: error.message }

  revalidatePath('/admin/documents')
  revalidatePath('/member/profile')
  return { success: true }
}
