import { redirect } from "next/navigation"
import { createServerClient } from "@/lib/supabase/server"
import { createClient } from "@supabase/supabase-js"
import { cookies } from "next/headers"
import MemberSidebar from "@/components/member/sidebar"
import { getNotificationCount } from "@/lib/actions/notifications"
import { getYesterdayGateStatus } from "@/lib/actions/attendance"
import MemberGate from "@/components/member/member-gate"

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

  const [{ data: profile }, unreadCount, gate] = await Promise.all([
    admin.from("users").select("name, employee_id, role, must_change_password, photo_url, company_id, can_manage_freelancers, team").eq("id", user.id).single(),
    getNotificationCount(),
    getYesterdayGateStatus(),
  ])

  // Login freelancers on the "Freelance Media Production" team get a trimmed media
  // portal — no Attendance/Content Calendar/Leaves, no clock-in gate.
  const isFreelancerMedia = profile?.team === "Freelance Media Production"

  // Check if this user has any freelancers assigned
  const elevatedRoles = ["ADMIN", "FOUNDER", "CEO", "FREELANCER_MGR"]
  const isElevated = elevatedRoles.includes(profile?.role ?? "")
  let hasFreelancers = isElevated
  if (!isElevated && profile?.company_id) {
    const { count } = await admin
      .from("freelancer_assignments")
      .select("freelancer_id", { count: "exact", head: true })
      .eq("user_id", user.id)
      .eq("company_id", profile.company_id)
    hasFreelancers = (count ?? 0) > 0
  }

  // Admin impersonation — render the member panel EXACTLY as the member sees it:
  // no banner, no gate, no marginTop, no visual difference whatsoever. The admin
  // exits via the normal "Sign Out" button, which detects the impersonation
  // cookie (see logoutAction) and returns to the admin panel.
  if (profile?.role === "ADMIN" && impersonateId) {
    const { data: impProfile } = await admin
      .from("users")
      .select("name, employee_id, photo_url, company_id, team")
      .eq("id", impersonateId)
      .eq("company_id", profile.company_id ?? "")
      .single()

    if (!impProfile) {
      // Invalid impersonation target — clear and redirect
      const cs = await cookies(); cs.delete("gf_impersonate")
      redirect("/admin/team")
    }

    // Check if impersonated user has freelancers assigned
    const { count: impFreelancerCount } = await admin
      .from("freelancer_assignments")
      .select("freelancer_id", { count: "exact", head: true })
      .eq("user_id", impersonateId)
      .eq("company_id", profile.company_id ?? "")
    const impHasFreelancers = (impFreelancerCount ?? 0) > 0

    return (
      <div className="flex min-h-screen" style={{ background: "#EDEEF2" }}>
        <MemberSidebar
          name={impProfile.name}
          employeeId={impProfile.employee_id ?? ""}
          unreadCount={unreadCount}
          photoUrl={impProfile.photo_url ?? null}
          canManageFreelancers={impHasFreelancers}
          isFreelancerMedia={impProfile.team === "Freelance Media Production"}
        />
        <main className="flex-1 md:ml-[64px] lg:ml-[240px] min-h-screen overflow-x-hidden pt-14 md:pt-0 pb-16 md:pb-0">
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
      {!isFreelancerMedia && (
        <MemberGate
          forgotLogout={gate.forgotLogout}
          missingUpdate={gate.missingUpdate}
          yesterdayDate={gate.yesterdayDate}
        />
      )}
      <MemberSidebar
        name={profile?.name ?? "Member"}
        employeeId={profile?.employee_id ?? ""}
        unreadCount={unreadCount}
        photoUrl={profile?.photo_url ?? null}
        canManageFreelancers={hasFreelancers}
        isFreelancerMedia={isFreelancerMedia}
      />
      <main className="flex-1 md:ml-[64px] lg:ml-[240px] min-h-screen overflow-x-hidden pt-14 md:pt-0 pb-16 md:pb-0">
        {children}
      </main>
    </div>
  )
}
