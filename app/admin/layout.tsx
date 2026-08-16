import { redirect } from "next/navigation"
import { getCurrentUser } from "@/lib/supabase/server"
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
  const user = await getCurrentUser()
  if (!user) redirect("/login")

  const admin = adminSupabase()
  const [{ data: profile }, { count: pendingLeaves }, { count: unreadNotifs }] = await Promise.all([
    admin.from("users").select("role, must_change_password, company_id, name, photo_url").eq("id", user.id).single(),
    admin.from("leaves").select("*", { count: "exact", head: true }).eq("status", "pending"),
    admin.from("notifications").select("*", { count: "exact", head: true }).eq("user_id", user.id).eq("read", false),
  ])

  const isAdminLevel = ["ADMIN", "FOUNDER", "CEO"].includes(profile?.role ?? "")
  if (!isAdminLevel) redirect(profile?.role === "FREELANCER_MGR" ? "/freelancer/dashboard" : "/member/dashboard")
  if (profile?.must_change_password) redirect("/change-password")

  return (
    <div className="flex min-h-screen" style={{ background: "#EDEEF2" }}>
      <Sidebar
        pendingLeaves={pendingLeaves ?? 0}
        adminName={profile?.name ?? "Admin"}
        photoUrl={profile?.photo_url ?? null}
        notifCount={unreadNotifs ?? 0}
      />
      <main className="flex-1 md:ml-[64px] lg:ml-[240px] min-h-screen overflow-x-hidden pt-14 md:pt-0 pb-16 md:pb-0">
        {children}
      </main>
    </div>
  )
}
