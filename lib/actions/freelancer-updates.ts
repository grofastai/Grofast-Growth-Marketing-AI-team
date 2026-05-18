'use server'

import { createServerClient } from '@/lib/supabase/server'
import { createClient } from '@supabase/supabase-js'
import { revalidatePath } from 'next/cache'
import { z } from 'zod'

function adminSupabase() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  )
}

const shootingSchema = z.object({
  work_type: z.literal('shooting'),
  shoot_title: z.string().min(1, 'Title required'),
  shoot_duration: z.number().positive('Duration must be positive'),
  shoot_notes: z.string().optional(),
  video_uploaded: z.boolean().default(false),
})

const editingSchema = z.object({
  work_type: z.literal('editing'),
  video_name: z.string().min(1, 'Video name required'),
  video_type: z.string().min(1, 'Video type required'),
  time_taken: z.number().positive('Time taken must be positive'),
  drive_link: z.string().url('Enter a valid drive link').optional().or(z.literal('')),
  revisions: z.number().int().min(0).default(0),
  edit_notes: z.string().optional(),
})

const voiceOverSchema = z.object({
  work_type: z.literal('voice_over'),
  script_name: z.string().min(1, 'Script name required'),
  vo_duration: z.string().min(1, 'Duration required'),
  vo_notes: z.string().optional(),
})

const baseSchema = z.object({
  freelancer_id:  z.string().uuid('Select a freelancer'),
  client_id:      z.string().uuid('Select a client').optional().nullable(),
  client_name:    z.string().min(1, 'Client name required'),
  date:           z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Invalid date'),
  cost:           z.number().nonnegative().optional().nullable(),
  deadline:       z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional().nullable(),
  payment_status: z.enum(['unpaid', 'paid']).default('unpaid'),
})

export type FreelancerUpdateInput =
  (z.infer<typeof baseSchema> & z.infer<typeof shootingSchema>) |
  (z.infer<typeof baseSchema> & z.infer<typeof editingSchema>) |
  (z.infer<typeof baseSchema> & z.infer<typeof voiceOverSchema>)

export async function submitFreelancerUpdate(
  input: FreelancerUpdateInput
): Promise<{ success: boolean; error?: string }> {
  const supabase = await createServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { success: false, error: 'Not authenticated' }

  const admin = adminSupabase()
  const { data: profile } = await admin
    .from('users')
    .select('company_id, role')
    .eq('id', user.id)
    .single()

  if (!profile?.company_id) return { success: false, error: 'Profile not found' }
  if (profile.role !== 'FREELANCER_MGR' && profile.role !== 'ADMIN') {
    return { success: false, error: 'Not authorized' }
  }

  const base = baseSchema.safeParse(input)
  if (!base.success) return { success: false, error: base.error.issues[0].message }

  let typePayload: Record<string, unknown> = {}

  if (input.work_type === 'shooting') {
    const parsed = shootingSchema.safeParse(input)
    if (!parsed.success) return { success: false, error: parsed.error.issues[0].message }
    typePayload = {
      shoot_title:    parsed.data.shoot_title,
      shoot_duration: parsed.data.shoot_duration,
      shoot_notes:    parsed.data.shoot_notes ?? null,
      video_uploaded: parsed.data.video_uploaded,
    }
  } else if (input.work_type === 'editing') {
    const parsed = editingSchema.safeParse(input)
    if (!parsed.success) return { success: false, error: parsed.error.issues[0].message }
    typePayload = {
      video_name: parsed.data.video_name,
      video_type: parsed.data.video_type,
      time_taken: parsed.data.time_taken,
      drive_link: parsed.data.drive_link || null,
      revisions:  parsed.data.revisions,
      edit_notes: parsed.data.edit_notes ?? null,
    }
  } else if (input.work_type === 'voice_over') {
    const parsed = voiceOverSchema.safeParse(input)
    if (!parsed.success) return { success: false, error: parsed.error.issues[0].message }
    typePayload = {
      script_name: parsed.data.script_name,
      vo_duration: parsed.data.vo_duration,
      vo_notes:    parsed.data.vo_notes ?? null,
    }
  }

  const { error } = await admin.from('freelancer_updates').insert({
    company_id:     profile.company_id,
    freelancer_id:  base.data.freelancer_id,
    submitted_by:   user.id,
    client_id:      base.data.client_id ?? null,
    client_name:    base.data.client_name,
    date:           base.data.date,
    work_type:      input.work_type,
    cost:           base.data.cost ?? null,
    deadline:       base.data.deadline ?? null,
    payment_status: base.data.payment_status,
    paid_date:      base.data.payment_status === 'paid' ? base.data.date : null,
    ...typePayload,
  })

  if (error) return { success: false, error: error.message }

  revalidatePath('/freelancer/activities')
  revalidatePath('/freelancer/dashboard')
  return { success: true }
}

export async function markAsPaid(updateId: string): Promise<{ success: boolean; error?: string }> {
  const supabase = await createServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { success: false, error: 'Not authenticated' }

  const admin = adminSupabase()
  const { data: profile } = await admin
    .from('users')
    .select('company_id, role')
    .eq('id', user.id)
    .single()

  if (!profile?.company_id) return { success: false, error: 'Profile not found' }
  if (profile.role !== 'FREELANCER_MGR' && profile.role !== 'ADMIN') {
    return { success: false, error: 'Not authorized' }
  }

  const today = new Date().toISOString().split('T')[0]
  const { error } = await admin
    .from('freelancer_updates')
    .update({ payment_status: 'paid', paid_date: today })
    .eq('id', updateId)
    .eq('company_id', profile.company_id)

  if (error) return { success: false, error: error.message }

  revalidatePath('/freelancer/activities')
  return { success: true }
}

export async function getFreelancers(companyId: string) {
  const admin = adminSupabase()
  const { data } = await admin
    .from('users')
    .select('id, name, employee_id')
    .eq('company_id', companyId)
    .eq('role', 'FREELANCER')
    .eq('status', 'active')
    .order('name')
  return data ?? []
}

export async function getFreelancerUpdates(companyId: string, filters?: {
  freelancer_id?: string
  date_from?: string
  date_to?: string
}) {
  const admin = adminSupabase()
  let query = admin
    .from('freelancer_updates')
    .select(`
      *,
      freelancer:users!freelancer_id(name, employee_id),
      submitter:users!submitted_by(name)
    `)
    .eq('company_id', companyId)
    .order('date', { ascending: false })
    .order('created_at', { ascending: false })

  if (filters?.freelancer_id) query = query.eq('freelancer_id', filters.freelancer_id)
  if (filters?.date_from)     query = query.gte('date', filters.date_from)
  if (filters?.date_to)       query = query.lte('date', filters.date_to)

  const { data } = await query.limit(100)
  return data ?? []
}
