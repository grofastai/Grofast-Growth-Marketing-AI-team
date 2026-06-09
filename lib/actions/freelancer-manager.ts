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

export async function assignFreelancerManager(targetUserId: string | null): Promise<{ success: boolean; error?: string }> {
  const supabase = await createServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { success: false, error: "Not authenticated" }

  const admin = adminSupabase()
  const { data: profile } = await admin.from("users").select("role, company_id").eq("id", user.id).single()
  if (profile?.role !== "ADMIN") return { success: false, error: "Admin only" }

  const cid = profile.company_id

  // Clear all existing managers in this company
  const { error: clearErr } = await admin
    .from("users")
    .update({ can_manage_freelancers: false })
    .eq("company_id", cid)

  if (clearErr) return { success: false, error: clearErr.message }

  // Set the new manager if provided
  if (targetUserId) {
    const { error: setErr } = await admin
      .from("users")
      .update({ can_manage_freelancers: true })
      .eq("id", targetUserId)
      .eq("company_id", cid)
    if (setErr) return { success: false, error: setErr.message }
  }

  revalidatePath("/admin/freelancers")
  return { success: true }
}
