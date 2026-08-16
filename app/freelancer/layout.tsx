import { redirect } from "next/navigation"
import { getCurrentUser } from "@/lib/supabase/server"
import { createClient } from "@supabase/supabase-js"
import FreelancerSidebar from "@/components/freelancer/sidebar"

function adminSupabase() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  )
}

export default async function FreelancerLayout({ children }: { children: React.ReactNode }) {
  const user = await getCurrentUser()
  if (!user) redirect("/login")

  const admin = adminSupabase()
  const { data: profile } = await admin
    .from("users")
    .select("role, company_id, name, photo_url")
    .eq("id", user.id)
    .single()

  if (profile?.role !== "FREELANCER_MGR") redirect("/login")

  return (
    <div className="flex min-h-screen" style={{ background: "#EDEEF2" }}>
      <FreelancerSidebar
        managerName={profile?.name ?? "Manager"}
        photoUrl={profile?.photo_url ?? null}
      />
      <main className="flex-1 md:ml-[64px] lg:ml-[240px] min-h-screen overflow-x-hidden pt-14 md:pt-0 pb-16 md:pb-0">
        {children}
      </main>
    </div>
  )
}
