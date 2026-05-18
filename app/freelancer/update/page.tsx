import { redirect } from "next/navigation"
import { createServerClient } from "@/lib/supabase/server"
import { createClient } from "@supabase/supabase-js"
import FreelancerUpdateForm from "./freelancer-update-form"

function adminSupabase() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  )
}

export default async function FreelancerUpdatePage() {
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

  const [{ data: freelancers }, { data: clients }] = await Promise.all([
    admin
      .from("users")
      .select("id, name, employee_id")
      .eq("company_id", profile.company_id)
      .eq("role", "FREELANCER")
      .eq("status", "active")
      .order("name"),
    admin
      .from("projects")
      .select("id, business_name, client_name")
      .eq("company_id", profile.company_id)
      .eq("status", "active")
      .order("client_name"),
  ])

  return (
    <div className="p-6 lg:p-8 max-w-3xl mx-auto">
      <div className="mb-8">
        <h1 style={{ fontSize: 24, fontWeight: 800, color: "#1A202C", margin: 0 }}>Log Update</h1>
        <p style={{ fontSize: 14, color: "#718096", marginTop: 4 }}>Record work done by a freelancer</p>
      </div>

      <div style={{ background: "#FFFFFF", borderRadius: 16, padding: "28px", border: "1px solid #E2E8F0", boxShadow: "0 1px 3px rgba(0,0,0,0.06)" }}>
        <FreelancerUpdateForm
          freelancers={freelancers ?? []}
          clients={clients ?? []}
          companyId={profile.company_id}
        />
      </div>
    </div>
  )
}
