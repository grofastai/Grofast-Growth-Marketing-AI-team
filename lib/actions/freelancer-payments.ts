'use server'

import { createServerClient } from '@/lib/supabase/server'
import { createClient } from '@supabase/supabase-js'
import { revalidatePath } from 'next/cache'
import { logFreelancerActivity } from './freelancer-activity'

function createAdminClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  )
}

export async function addFreelancerPayment(
  formData: FormData
): Promise<{ success: boolean; error?: string }> {
  const supabase = await createServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { success: false, error: 'Not authenticated' }

  const admin = createAdminClient()

  const { data: actor } = await admin
    .from('users').select('company_id, name, role').eq('id', user.id).single()
  if (!actor) return { success: false, error: 'User not found' }

  const freelancerId    = formData.get('freelancer_id') as string
  const amount          = parseFloat(formData.get('amount') as string)
  const paymentMethod   = formData.get('payment_method') as string
  const referenceNumber = (formData.get('reference_number') as string) || null
  const notes           = (formData.get('notes') as string) || null
  const paidDate        = formData.get('paid_date') as string

  if (!freelancerId || isNaN(amount) || amount <= 0) {
    return { success: false, error: 'Invalid payment data' }
  }

  const { error } = await admin.from('freelancer_payments').insert({
    company_id:       actor.company_id,
    freelancer_id:    freelancerId,
    amount,
    payment_method:   paymentMethod,
    reference_number: referenceNumber,
    notes,
    paid_date:        paidDate,
    paid_by:          user.id,
  })

  if (error) return { success: false, error: error.message }

  await logFreelancerActivity({
    companyId:    actor.company_id,
    freelancerId,
    action:       `Payment added: ₹${amount.toLocaleString('en-IN')} via ${paymentMethod}`,
    actorId:      user.id,
    actorName:    actor.name,
    remarks:      referenceNumber ? `Ref: ${referenceNumber}` : undefined,
  })

  revalidatePath(`/admin/freelancers/${freelancerId}`)
  revalidatePath('/admin/freelancers')
  return { success: true }
}

export async function deleteFreelancerPayment(
  paymentId: string,
  freelancerId: string
): Promise<{ success: boolean; error?: string }> {
  const supabase = await createServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { success: false, error: 'Not authenticated' }

  const admin = createAdminClient()

  const { data: actor } = await admin
    .from('users').select('company_id, name, role').eq('id', user.id).single()
  if (actor?.role !== 'ADMIN') return { success: false, error: 'Admin only' }

  const { data: payment } = await admin
    .from('freelancer_payments').select('amount, payment_method').eq('id', paymentId).single()

  const { error } = await admin.from('freelancer_payments').delete().eq('id', paymentId)
  if (error) return { success: false, error: error.message }

  await logFreelancerActivity({
    companyId:    actor.company_id,
    freelancerId,
    action:       `Payment deleted: ₹${payment?.amount} (${payment?.payment_method})`,
    actorId:      user.id,
    actorName:    actor.name,
  })

  revalidatePath(`/admin/freelancers/${freelancerId}`)
  revalidatePath('/admin/freelancers')
  return { success: true }
}
