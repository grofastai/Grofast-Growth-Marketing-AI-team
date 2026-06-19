"use server"

import { createServerClient } from "@/lib/supabase/server"
import { createClient } from "@supabase/supabase-js"
import { revalidatePath } from "next/cache"

function adminSupabase() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  )
}

async function getAdminContext(): Promise<{ companyId: string } | { error: string }> {
  const supabase = await createServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: "Not authenticated" }
  const admin = adminSupabase()
  const { data: profile } = await admin.from("users").select("role, company_id").eq("id", user.id).single()
  if (profile?.role !== "ADMIN") return { error: "Admin only" }
  return { companyId: profile.company_id as string }
}

export async function assignFreelancerManager(targetUserId: string | null): Promise<{ success: boolean; error?: string }> {
  const ctx = await getAdminContext()
  if ("error" in ctx) return { success: false, error: ctx.error }
  const admin = adminSupabase()

  const { error: clearErr } = await admin
    .from("users")
    .update({ can_manage_freelancers: false })
    .eq("company_id", ctx.companyId)
  if (clearErr) return { success: false, error: clearErr.message }

  if (targetUserId) {
    const { error: setErr } = await admin
      .from("users")
      .update({ can_manage_freelancers: true })
      .eq("id", targetUserId)
      .eq("company_id", ctx.companyId)
    if (setErr) return { success: false, error: setErr.message }
  }

  revalidatePath("/admin/freelancers")
  return { success: true }
}

export async function addManagerToAllFreelancers(userId: string): Promise<{ success: boolean; error?: string }> {
  const ctx = await getAdminContext()
  if ("error" in ctx) return { success: false, error: ctx.error }
  const admin = adminSupabase()

  const { data: allFreelancers } = await admin
    .from("freelancers")
    .select("id")
    .eq("company_id", ctx.companyId)

  if (!allFreelancers?.length) return { success: true }

  const rows = allFreelancers.map((f: { id: string }) => ({
    company_id: ctx.companyId,
    freelancer_id: f.id,
    user_id: userId,
  }))

  const { error } = await admin
    .from("freelancer_assignments")
    .upsert(rows, { onConflict: "freelancer_id,user_id", ignoreDuplicates: true })

  if (error) return { success: false, error: error.message }

  revalidatePath("/admin/team")
  revalidatePath("/member/freelancers")
  return { success: true }
}

export async function removeManagerFromAllFreelancers(userId: string): Promise<{ success: boolean; error?: string }> {
  const ctx = await getAdminContext()
  if ("error" in ctx) return { success: false, error: ctx.error }
  const admin = adminSupabase()

  const { error } = await admin
    .from("freelancer_assignments")
    .delete()
    .eq("company_id", ctx.companyId)
    .eq("user_id", userId)

  if (error) return { success: false, error: error.message }

  revalidatePath("/admin/team")
  revalidatePath("/member/freelancers")
  return { success: true }
}
