export const revalidate = 0

import { createServerClient } from "@/lib/supabase/server"
import { createClient } from "@supabase/supabase-js"
import { redirect, notFound } from "next/navigation"
import FreelancerProfileClient from "./profile-client"

function adminSupabase() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  )
}

export default async function FreelancerProfilePage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params

  const supabase = await createServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect("/login")

  const admin = adminSupabase()

  const { data: profile } = await admin
    .from("users")
    .select("company_id, name, role")
    .eq("id", user.id)
    .single()

  if (!profile?.company_id) redirect("/login")
  const cid = profile.company_id

  const [
    { data: freelancer },
    { data: workEntries },
    { data: payments },
    { data: activityLogs },
  ] = await Promise.all([
    admin.from("freelancers").select("*").eq("id", id).eq("company_id", cid).single(),
    admin.from("freelancer_work_entries")
      .select("*")
      .eq("freelancer_id", id)
      .eq("company_id", cid)
      .order("date", { ascending: false }),
    admin.from("freelancer_payments")
      .select("*")
      .eq("freelancer_id", id)
      .eq("company_id", cid)
      .order("paid_date", { ascending: false }),
    admin.from("freelancer_activity_logs")
      .select("*")
      .eq("freelancer_id", id)
      .eq("company_id", cid)
      .order("created_at", { ascending: false })
      .limit(50),
  ])

  if (!freelancer) notFound()

  const now        = new Date()
  const monthStart = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-01`

  const approvedEntries = (workEntries ?? []).filter((e: { approval_status: string }) => e.approval_status === "approved")
  const totalEarned     = approvedEntries.reduce((s: number, e: { amount?: number }) => s + (e.amount ?? 0), 0)
  const thisMonthEarned = approvedEntries
    .filter((e: { date?: string }) => (e.date ?? "") >= monthStart)
    .reduce((s: number, e: { amount?: number }) => s + (e.amount ?? 0), 0)
  const totalPaid     = (payments ?? []).reduce((s: number, p: { amount?: number }) => s + (p.amount ?? 0), 0)
  const thisMonthPaid = (payments ?? [])
    .filter((p: { paid_date?: string }) => (p.paid_date ?? "") >= monthStart)
    .reduce((s: number, p: { amount?: number }) => s + (p.amount ?? 0), 0)
  const pendingBalance = totalEarned - totalPaid

  return (
    <FreelancerProfileClient
      freelancer={freelancer}
      workEntries={workEntries ?? []}
      payments={payments ?? []}
      activityLogs={activityLogs ?? []}
      currentUserId={user.id}
      currentUserName={profile.name}
      currentUserRole={profile.role}
      stats={{
        pendingBalance,
        thisMonthEarned,
        totalEarned,
        thisMonthPaid,
        totalWorks: approvedEntries.length,
      }}
    />
  )
}
