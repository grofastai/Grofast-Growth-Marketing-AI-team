import "server-only"
import { createServerClient } from "@/lib/supabase/server"
import { createClient } from "@supabase/supabase-js"
import { cookies } from "next/headers"
import { redirect } from "next/navigation"

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

  const cookieStore = await cookies()
  const impersonateId = cookieStore.get("gf_impersonate")?.value
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
