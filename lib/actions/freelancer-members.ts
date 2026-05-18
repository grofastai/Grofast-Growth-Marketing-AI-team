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
  employee_id: string
  phone?: string
  specialty?: string
  password: string
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
  if (!input.name.trim())        return { success: false, error: "Name is required" }
  if (!input.employee_id.trim()) return { success: false, error: "Employee ID is required" }
  if (input.password.length < 6) return { success: false, error: "Password must be at least 6 characters" }

  const admin = adminSupabase()

  // Get the company slug
  const { data: company } = await admin
    .from("companies")
    .select("slug")
    .eq("id", input.company_id)
    .single()

  if (!company?.slug) return { success: false, error: "Company not found" }

  const email = `${input.employee_id.toLowerCase()}@${company.slug}.internal`

  // Check for duplicate employee_id in this company
  const { data: existing } = await admin
    .from("users")
    .select("id")
    .eq("company_id", input.company_id)
    .eq("employee_id", input.employee_id)
    .maybeSingle()

  if (existing) return { success: false, error: "Employee ID already exists" }

  // Create auth user
  const { data: authData, error: authError } = await admin.auth.admin.createUser({
    email,
    password: input.password,
    email_confirm: true,
    user_metadata: { name: input.name },
  })

  if (authError || !authData.user) {
    return { success: false, error: authError?.message ?? "Failed to create account" }
  }

  // Insert into users table
  const { data: newUser, error: dbError } = await admin
    .from("users")
    .insert({
      id:          authData.user.id,
      company_id:  input.company_id,
      employee_id: input.employee_id,
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
    // Clean up the auth user if DB insert failed
    await admin.auth.admin.deleteUser(authData.user.id)
    return { success: false, error: dbError.message }
  }

  return { success: true, freelancer: newUser as FreelancerRow }
}
