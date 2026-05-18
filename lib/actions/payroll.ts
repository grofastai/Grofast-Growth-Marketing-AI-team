"use server"

import { createServerClient } from "@/lib/supabase/server"
import { createClient }       from "@supabase/supabase-js"
import { revalidatePath }     from "next/cache"

function adminSupabase() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  )
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

export async function markEmployeePaid(userId: string, month: string) {
  const { adminId, companyId } = await getAdminContext()
  const admin = adminSupabase()

  const { error } = await admin
    .from("payroll_runs")
    .upsert({
      company_id: companyId,
      user_id:    userId,
      month,
      is_paid:    true,
      paid_at:    new Date().toISOString(),
      paid_by:    adminId,
      updated_at: new Date().toISOString(),
    }, { onConflict: "user_id,month" })

  if (error) throw new Error(error.message)
  revalidatePath("/admin/payroll")
}

export async function markEmployeeUnpaid(userId: string, month: string) {
  const { companyId } = await getAdminContext()
  const admin = adminSupabase()

  const { error } = await admin
    .from("payroll_runs")
    .upsert({
      company_id: companyId,
      user_id:    userId,
      month,
      is_paid:    false,
      paid_at:    null,
      paid_by:    null,
      updated_at: new Date().toISOString(),
    }, { onConflict: "user_id,month" })

  if (error) throw new Error(error.message)
  revalidatePath("/admin/payroll")
}

export async function runPayroll(month: string, userIds: string[]) {
  const { adminId, companyId } = await getAdminContext()
  const admin = adminSupabase()
  const now = new Date().toISOString()

  const records = userIds.map(userId => ({
    company_id: companyId,
    user_id:    userId,
    month,
    is_paid:    true,
    paid_at:    now,
    paid_by:    adminId,
    updated_at: now,
  }))

  const { error } = await admin
    .from("payroll_runs")
    .upsert(records, { onConflict: "user_id,month" })

  if (error) throw new Error(error.message)
  revalidatePath("/admin/payroll")
}

export async function saveBonusAdvance(
  userId: string,
  month: string,
  bonus: number,
  advance: number,
  incentive: number,
) {
  const { companyId } = await getAdminContext()
  const admin = adminSupabase()

  const { error } = await admin
    .from("payroll_runs")
    .upsert({
      company_id: companyId,
      user_id:    userId,
      month,
      bonus,
      advance,
      incentive,
      updated_at: new Date().toISOString(),
    }, { onConflict: "user_id,month" })

  if (error) throw new Error(error.message)
  revalidatePath("/admin/payroll")
}
