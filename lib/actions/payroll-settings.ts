"use server"

import { createServerClient } from "@/lib/supabase/server"
import { createClient }       from "@supabase/supabase-js"
import { revalidatePath }     from "next/cache"
import { PAYROLL_SETTINGS_DEFAULTS, type PayrollSettings } from "@/lib/payroll-settings-defaults"

function adminSupabase() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  )
}

// Server-side read helper — safe to call from any admin payroll page/route.
// Always returns a complete settings object; falls back field-by-field to
// PAYROLL_SETTINGS_DEFAULTS if no row exists or a column is null.
export async function getPayrollSettings(companyId: string): Promise<PayrollSettings> {
  const admin = adminSupabase()
  const { data } = await admin
    .from("payroll_settings")
    .select("ot_threshold_hrs, half_day_threshold_hrs, salary_basis_days, basic_pct, hra_pct, travel_pct, medical_pct")
    .eq("company_id", companyId)
    .maybeSingle()

  return {
    ot_threshold_hrs:       data?.ot_threshold_hrs       ?? PAYROLL_SETTINGS_DEFAULTS.ot_threshold_hrs,
    half_day_threshold_hrs: data?.half_day_threshold_hrs ?? PAYROLL_SETTINGS_DEFAULTS.half_day_threshold_hrs,
    salary_basis_days:      data?.salary_basis_days      ?? PAYROLL_SETTINGS_DEFAULTS.salary_basis_days,
    basic_pct:               data?.basic_pct               ?? PAYROLL_SETTINGS_DEFAULTS.basic_pct,
    hra_pct:                 data?.hra_pct                 ?? PAYROLL_SETTINGS_DEFAULTS.hra_pct,
    travel_pct:              data?.travel_pct              ?? PAYROLL_SETTINGS_DEFAULTS.travel_pct,
    medical_pct:             data?.medical_pct             ?? PAYROLL_SETTINGS_DEFAULTS.medical_pct,
  }
}

async function getAdminContext() {
  const supabase = await createServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) throw new Error("Not authenticated")

  const admin = adminSupabase()
  const { data: profile } = await admin
    .from("users")
    .select("id, company_id, role")
    .eq("id", user.id)
    .single()

  if (!profile || profile.role !== "ADMIN") throw new Error("Forbidden")
  return { adminId: user.id as string, companyId: profile.company_id as string }
}

export async function savePayrollSettings(input: PayrollSettings): Promise<{ success: boolean; error?: string }> {
  const { adminId, companyId } = await getAdminContext()
  const admin = adminSupabase()

  const { error } = await admin
    .from("payroll_settings")
    .upsert({
      company_id: companyId,
      ...input,
      updated_at: new Date().toISOString(),
      updated_by: adminId,
    }, { onConflict: "company_id" })

  if (error) return { success: false, error: error.message }

  revalidatePath("/admin/payroll")
  return { success: true }
}
