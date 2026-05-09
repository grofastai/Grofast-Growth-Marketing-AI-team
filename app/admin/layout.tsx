import { redirect } from "next/navigation"
import { createServerClient } from "@/lib/supabase/server"
import { createClient } from "@supabase/supabase-js"
import Sidebar from "@/components/admin/sidebar"

function adminSupabase() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  )
}

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const supabase = await createServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect("/login")

  const admin = adminSupabase()
  const { data: profile } = await admin
    .from("users")
    .select("role, must_change_password")
    .eq("id", user.id)
    .single()

  if (profile?.role !== "ADMIN") redirect("/member/dashboard")
  if (profile?.must_change_password) redirect("/change-password")

  return (
    <div className="flex min-h-screen" style={{ background: "#EDEEF2" }}>
      <Sidebar />
      <main className="flex-1 md:ml-[64px] lg:ml-[240px] min-h-screen overflow-x-hidden pt-14 md:pt-0 pb-16 md:pb-0">
        {children}
      </main>
    </div>
  )
}
