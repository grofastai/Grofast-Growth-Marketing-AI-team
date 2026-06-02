'use server'

import { createClient } from '@supabase/supabase-js'

function adminSupabase() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  )
}

interface AddFreelancerInput {
  name: string
  phone?: string
  specialty?: string
  company_id: string
  // VO rate card
  vo_number?: number
  vo_price_per_min?: number
  vo_free_time?: number
  vo_total_price?: number
  vo_pending?: number
  vo_top_rank?: boolean
  vo_video1_name?: string
  vo_video1_pay?: 'paid' | 'unpaid'
  vo_video2_name?: string
  vo_video2_pay?: 'paid' | 'unpaid'
  vo_video3_name?: string
  vo_video3_pay?: 'paid' | 'unpaid'
  vo_video4_name?: string
  vo_video4_pay?: 'paid' | 'unpaid'
}

interface FreelancerRow {
  id: string
  name: string
  employee_id: string
  phone: string | null
  specialty: string | null
  status: string
  created_at: string
  vo_number: number | null
  vo_price_per_min: number | null
  vo_free_time: number | null
  vo_total_price: number | null
  vo_pending: number | null
  vo_top_rank: boolean | null
  vo_video1_name: string | null
  vo_video1_pay: string | null
  vo_video2_name: string | null
  vo_video2_pay: string | null
  vo_video3_name: string | null
  vo_video3_pay: string | null
  vo_video4_name: string | null
  vo_video4_pay: string | null
}

export async function addFreelancer(input: AddFreelancerInput): Promise<{
  success: boolean
  error?: string
  freelancer?: FreelancerRow
}> {
  if (!input.name.trim()) return { success: false, error: "Name is required" }

  const admin = adminSupabase()

  const { data: company } = await admin
    .from("companies")
    .select("slug")
    .eq("id", input.company_id)
    .single()

  if (!company?.slug) return { success: false, error: "Company not found" }

  // Auto-generate next FL### employee ID
  const { data: existing } = await admin
    .from("users")
    .select("employee_id")
    .eq("company_id", input.company_id)
    .eq("role", "FREELANCER")

  const nums = (existing ?? [])
    .map(u => { const m = u.employee_id.match(/^FL(\d+)$/i); return m ? parseInt(m[1]) : 0 })
    .filter(n => n > 0)
  const next = nums.length > 0 ? Math.max(...nums) + 1 : 1
  const employee_id = `FL${String(next).padStart(3, "0")}`

  const email = `${employee_id.toLowerCase()}@${company.slug}.internal`
  const password = crypto.randomUUID() + crypto.randomUUID()

  const { data: authData, error: authError } = await admin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    user_metadata: { name: input.name },
  })

  if (authError || !authData.user) {
    return { success: false, error: authError?.message ?? "Failed to create account" }
  }

  const { data: newUser, error: dbError } = await admin
    .from("users")
    .insert({
      id:               authData.user.id,
      company_id:       input.company_id,
      employee_id,
      name:             input.name,
      email,
      phone:            input.phone?.trim() || null,
      specialty:        input.specialty?.trim() || null,
      role:             "FREELANCER",
      status:           "active",
      vo_number:        input.vo_number ?? null,
      vo_price_per_min: input.vo_price_per_min ?? null,
      vo_free_time:     input.vo_free_time ?? 0,
      vo_total_price:   input.vo_total_price ?? null,
      vo_pending:       input.vo_pending ?? 0,
      vo_top_rank:      input.vo_top_rank ?? false,
      vo_video1_name:   input.vo_video1_name || null,
      vo_video1_pay:    input.vo_video1_name ? (input.vo_video1_pay ?? 'unpaid') : null,
      vo_video2_name:   input.vo_video2_name || null,
      vo_video2_pay:    input.vo_video2_name ? (input.vo_video2_pay ?? 'unpaid') : null,
      vo_video3_name:   input.vo_video3_name || null,
      vo_video3_pay:    input.vo_video3_name ? (input.vo_video3_pay ?? 'unpaid') : null,
      vo_video4_name:   input.vo_video4_name || null,
      vo_video4_pay:    input.vo_video4_name ? (input.vo_video4_pay ?? 'unpaid') : null,
    })
    .select("id, name, employee_id, phone, specialty, status, created_at, vo_number, vo_price_per_min, vo_free_time, vo_total_price, vo_pending, vo_top_rank, vo_video1_name, vo_video1_pay, vo_video2_name, vo_video2_pay, vo_video3_name, vo_video3_pay, vo_video4_name, vo_video4_pay")
    .single()

  if (dbError) {
    await admin.auth.admin.deleteUser(authData.user.id)
    return { success: false, error: dbError.message }
  }

  return { success: true, freelancer: newUser as FreelancerRow }
}
