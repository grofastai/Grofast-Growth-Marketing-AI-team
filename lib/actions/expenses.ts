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

export async function submitExpense(input: {
  amount: number
  category: string
  description: string
  date: string
  notes?: string
}): Promise<{ success: boolean; error?: string }> {
  if (!input.amount || input.amount <= 0) return { success: false, error: 'Amount must be greater than 0' }
  if (!input.category)    return { success: false, error: 'Category is required' }
  if (!input.description) return { success: false, error: 'Description is required' }
  if (!input.date)        return { success: false, error: 'Date is required' }

  const supabase = await createServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { success: false, error: 'Not authenticated' }

  const admin = adminSupabase()
  const { data: profile } = await admin.from('users').select('company_id').eq('id', user.id).single()
  if (!profile?.company_id) return { success: false, error: 'Profile not found' }

  const { error } = await admin.from('expense_claims').insert({
    company_id:  profile.company_id,
    user_id:     user.id,
    amount:      input.amount,
    category:    input.category,
    description: input.description,
    date:        input.date,
    notes:       input.notes ?? null,
    status:      'pending',
  })

  if (error) return { success: false, error: error.message }

  revalidatePath('/member/expenses')
  revalidatePath('/admin/expenses')
  return { success: true }
}

export async function reviewExpense(
  id: string,
  status: 'approved' | 'rejected',
  reviewNotes?: string
): Promise<{ success: boolean; error?: string }> {
  const supabase = await createServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { success: false, error: 'Not authenticated' }

  const admin = adminSupabase()
  const { error } = await admin
    .from('expense_claims')
    .update({
      status,
      review_notes: reviewNotes ?? null,
      reviewed_by:  user.id,
      reviewed_at:  new Date().toISOString(),
    })
    .eq('id', id)

  if (error) return { success: false, error: error.message }

  revalidatePath('/admin/expenses')
  revalidatePath('/member/expenses')
  return { success: true }
}
