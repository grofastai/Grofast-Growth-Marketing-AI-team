import { redirect } from "next/navigation"
import { getCurrentUser } from "@/lib/supabase/server"
import { createClient } from "@supabase/supabase-js"
import { cookies } from "next/headers"
import MemberSidebar from "@/components/member/sidebar"
import { getNotificationCount } from "@/lib/actions/notifications"
import { getYesterdayGateStatus } from "@/lib/actions/attendance"
import { stopImpersonation } from "@/lib/actions/impersonate"
import MemberGate from "@/components/member/member-gate"

function adminSupabase() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  )
}

export default async function MemberLayout({ children }: { children: React.ReactNode }) {
  const user = await getCurrentUser()
  if (!user) redirect("/login")

  const admin = adminSupabase()
  const cookieStore = await cookies()
  const impersonateId = cookieStore.get("gf_impersonate")?.value

  const [{ data: profile }, unreadCount, gate] = await Promise.all([
    admin.from("users").select("name, employee_id, role, must_change_password, photo_url, company_id, can_manage_freelancers, team, is_management").eq("id", user.id).single(),
    getNotificationCount(),
    getYesterdayGateStatus(),
  ])

  // Login freelancers on the "Freelance Media Production" team get a trimmed media
  // portal — no Attendance/Content Calendar/Leaves, no clock-in gate.
  const isFreelancerMedia = profile?.team === "Freelance Media Production"
  const isManagement = profile?.is_management === true

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

  // Admin impersonation — render the member panel as the member sees it, plus a
  // slim "Back to Admin" bar pinned at the top so the admin can return with one
  // click (it also clarifies whose account is being viewed).
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
          {/* Admin impersonation bar — sticky at the top of the member view */}
          <form
            action={stopImpersonation}
            className="sticky top-0 z-50 flex items-center justify-between gap-3 px-4 py-2.5"
            style={{ background: "linear-gradient(135deg, #DE1A1A 0%, #8B1212 100%)", boxShadow: "0 2px 10px rgba(0,0,0,0.18)" }}
          >
            <span style={{ fontSize: 12.5, fontWeight: 700, color: "#FFFFFF", display: "flex", alignItems: "center", gap: 7, minWidth: 0 }}>
              <span style={{ fontSize: 14 }}>👁</span>
              <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                Viewing as <strong>{impProfile.name}</strong>
                {impProfile.employee_id ? ` · ${impProfile.employee_id}` : ""}
              </span>
            </span>
            <button
              type="submit"
              style={{ flexShrink: 0, display: "inline-flex", alignItems: "center", gap: 6, padding: "6px 14px", borderRadius: 10, background: "#FFFFFF", color: "#B91212", fontSize: 12.5, fontWeight: 800, border: "none", cursor: "pointer", whiteSpace: "nowrap" }}
            >
              ← Back to Admin
            </button>
          </form>
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
      {!isFreelancerMedia && !isManagement && (
        <MemberGate
          forgotLogout={gate.forgotLogout}
          forgotLogoutDate={gate.forgotLogoutDate}
          missingUpdate={gate.missingUpdate}
          missingUpdateDate={gate.missingUpdateDate}
          noLeave={gate.noLeave}
          noLeaveDate={gate.noLeaveDate}
          noLeaveDateLatest={gate.noLeaveDateLatest}
          noLeaveCount={gate.noLeaveCount}
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
