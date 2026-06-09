import { redirect } from "next/navigation"
import { createServerClient } from "@/lib/supabase/server"
import { createClient } from "@supabase/supabase-js"
import { cookies } from "next/headers"
import MemberSidebar from "@/components/member/sidebar"
import ImpersonationBanner from "@/components/member/impersonation-banner"
import { getNotificationCount } from "@/lib/actions/notifications"

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
  const cookieStore = await cookies()
  const impersonateId = cookieStore.get("gf_impersonate")?.value

  const [{ data: profile }, unreadCount] = await Promise.all([
    admin.from("users").select("name, employee_id, role, must_change_password, photo_url, company_id, can_manage_freelancers").eq("id", user.id).single(),
    getNotificationCount(),
  ])

  // Admin impersonation — allowed through member layout
  if (profile?.role === "ADMIN" && impersonateId) {
    const { data: impProfile } = await admin
      .from("users")
      .select("name, employee_id, photo_url, company_id")
      .eq("id", impersonateId)
      .eq("company_id", profile.company_id ?? "")
      .single()

    if (!impProfile) {
      // Invalid impersonation target — clear and redirect
      const cs = await cookies(); cs.delete("gf_impersonate")
      redirect("/admin/team")
    }

    // Check if impersonated user can manage freelancers
    const { data: impUserProfile } = await admin
      .from("users")
      .select("can_manage_freelancers")
      .eq("id", impersonateId)
      .single()

    return (
      <div className="flex min-h-screen" style={{ background: "#EDEEF2" }}>
        <ImpersonationBanner memberName={impProfile.name} />
        <MemberSidebar
          name={impProfile.name}
          employeeId={impProfile.employee_id ?? ""}
          unreadCount={unreadCount}
          photoUrl={impProfile.photo_url ?? null}
          canManageFreelancers={impUserProfile?.can_manage_freelancers ?? false}
        />
        <main className="flex-1 md:ml-[64px] lg:ml-[240px] min-h-screen overflow-x-hidden pt-14 md:pt-0 pb-16 md:pb-0" style={{ marginTop: 38 }}>
          {children}
        </main>
      </div>
    )
  }

  // FOUNDER and CEO get dual access — they can use both admin and member panels
  if (profile?.role === "ADMIN")          redirect("/admin/dashboard")
  if (profile?.role === "FREELANCER_MGR") redirect("/freelancer/dashboard")
  // FOUNDER/CEO fall through and access member panel normally
  if (profile?.must_change_password) redirect("/change-password")

  return (
    <div className="flex min-h-screen" style={{ background: "#EDEEF2" }}>
      <MemberSidebar
        name={profile?.name ?? "Member"}
        employeeId={profile?.employee_id ?? ""}
        unreadCount={unreadCount}
        photoUrl={profile?.photo_url ?? null}
        canManageFreelancers={profile?.can_manage_freelancers ?? false}
      />
      <main className="flex-1 md:ml-[64px] lg:ml-[240px] min-h-screen overflow-x-hidden pt-14 md:pt-0 pb-16 md:pb-0">
        {children}
      </main>
    </div>
  )
}
