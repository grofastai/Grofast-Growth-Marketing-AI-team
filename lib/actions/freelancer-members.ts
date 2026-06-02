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
}

interface FreelancerRow {
  id: string
  name: string
  employee_id: string
  email: string | null
  phone: string | null
  specialty: string | null
  status: string
  created_at: string
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
      id:          authData.user.id,
      company_id:  input.company_id,
      employee_id,
      name:        input.name,
      email,
      phone:       input.phone?.trim() || null,
      specialty:   input.specialty?.trim() || null,
      role:        "FREELANCER",
      status:      "active",
    })
    .select("id, name, employee_id, email, phone, specialty, status, created_at")
    .single()

  if (dbError) {
    await admin.auth.admin.deleteUser(authData.user.id)
    return { success: false, error: dbError.message }
  }

  return { success: true, freelancer: newUser as FreelancerRow }
}
