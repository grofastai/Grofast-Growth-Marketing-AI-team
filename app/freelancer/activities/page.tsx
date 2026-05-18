import { redirect } from "next/navigation"
import { createServerClient } from "@/lib/supabase/server"
import { createClient } from "@supabase/supabase-js"
import ActivitiesClient from "./activities-client"

function adminSupabase() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  )
}

export default async function FreelancerActivitiesPage() {
  const supabase = await createServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect("/login")

  const admin = adminSupabase()
  const { data: profile } = await admin
    .from("users")
    .select("company_id")
    .eq("id", user.id)
    .single()

  if (!profile?.company_id) redirect("/login")

  const { data: updates } = await admin
    .from("freelancer_updates")
    .select(`
      id, date, work_type, client_name,
      shoot_title, shoot_duration, video_uploaded,
      video_name, video_type, time_taken, revisions,
      script_name, vo_duration,
      cost, payment_status, paid_date, deadline,
      freelancer:users!freelancer_id(name, employee_id, specialty),
      submitter:users!submitted_by(name),
      created_at
    `)
    .eq("company_id", profile.company_id)
    .order("date", { ascending: false })
    .order("created_at", { ascending: false })
    .limit(200)

  // Supabase returns joined rows as arrays; normalise to single objects
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const normalised = (updates ?? []).map((u: any) => ({
    ...u,
    freelancer: Array.isArray(u.freelancer) ? (u.freelancer[0] ?? null) : u.freelancer,
    submitter:  Array.isArray(u.submitter)  ? (u.submitter[0]  ?? null) : u.submitter,
  }))

  return (
    <div className="p-6 lg:p-8">
      <div className="mb-8">
        <h1 style={{ fontSize: 24, fontWeight: 800, color: "#1A202C", margin: 0 }}>Activities</h1>
        <p style={{ fontSize: 14, color: "#718096", marginTop: 4 }}>All freelancer work updates</p>
      </div>
      <ActivitiesClient updates={normalised} />
    </div>
  )
}
