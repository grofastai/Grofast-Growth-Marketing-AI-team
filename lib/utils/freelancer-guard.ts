import "server-only"
import { createServerClient } from "@/lib/supabase/server"
import { createClient } from "@supabase/supabase-js"
import { redirect } from "next/navigation"
import { getValidImpersonationId } from "@/lib/impersonation"

function adminSupabase() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  )
}

// Login freelancers on the "Freelance Media Production" team get a trimmed media
// portal with no Attendance / Content Calendar / Leaves. This guard blocks direct
// URL access to those pages by redirecting them to the dashboard.
export async function blockFreelancerMedia() {
  const supabase = await createServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return

  // Validated, not read raw: an unchecked cookie let a freelancer point this guard at
  // a non-freelancer's row and walk straight into the pages it exists to block.
  const impersonateId = await getValidImpersonationId(user.id)
  const effectiveUserId = impersonateId ?? user.id

  const admin = adminSupabase()
  const { data } = await admin
    .from("users")
    .select("team")
    .eq("id", effectiveUserId)
    .single()

  if (data?.team === "Freelance Media Production") {
    redirect("/member/dashboard")
  }
}
