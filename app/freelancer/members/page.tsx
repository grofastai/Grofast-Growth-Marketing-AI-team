import { redirect } from "next/navigation"
import { createServerClient } from "@/lib/supabase/server"
import { createClient } from "@supabase/supabase-js"
import FreelancerMembersClient from "./members-client"

function adminSupabase() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  )
}

export default async function FreelancerMembersPage() {
  const supabase = await createServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect("/login")

  const admin = adminSupabase()
  const { data: profile } = await admin
    .from("users")
    .select("company_id, role")
    .eq("id", user.id)
    .single()

  if (!profile?.company_id) redirect("/login")

  const { data: freelancers } = await admin
    .from("users")
    .select("id, name, employee_id, email, phone, status, created_at")
    .eq("company_id", profile.company_id)
    .eq("role", "FREELANCER")
    .order("name")

  return (
    <div className="p-6 lg:p-8">
      <div className="mb-8">
        <h1 style={{ fontSize: 24, fontWeight: 800, color: "#1A202C", margin: 0 }}>Freelancers</h1>
        <p style={{ fontSize: 14, color: "#718096", marginTop: 4 }}>Manage your freelancer team</p>
      </div>
      <FreelancerMembersClient
        freelancers={freelancers ?? []}
        companyId={profile.company_id}
      />
    </div>
  )
}
