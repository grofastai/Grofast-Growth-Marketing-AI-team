import { redirect } from "next/navigation"
import { createServerClient } from "@/lib/supabase/server"
import { createClient } from "@supabase/supabase-js"
import MemberSidebar from "@/components/member/sidebar"

function adminSupabase() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  )
}

export default async function MemberLayout({ children }: { children: React.ReactNode }) {
  const supabase = await createServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect("/login")

  const admin = adminSupabase()
  const { data: profile } = await admin
    .from("users")
    .select("name, employee_id, role")
    .eq("id", user.id)
    .single()

  if (profile?.role === "ADMIN") redirect("/admin/dashboard")

  return (
    <div className="flex min-h-screen bg-bg">
      <MemberSidebar name={profile?.name ?? "Member"} employeeId={profile?.employee_id ?? ""} />
      <main className="flex-1 ml-[240px] min-h-screen overflow-x-hidden">
        {children}
      </main>
    </div>
  )
}
