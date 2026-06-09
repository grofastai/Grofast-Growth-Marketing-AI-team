export const revalidate = 0

import { createServerClient } from "@/lib/supabase/server"
import { createClient } from "@supabase/supabase-js"
import { cookies } from "next/headers"
import { redirect } from "next/navigation"
import FreelancersClient from "@/app/admin/freelancers/freelancers-client"
import type { Freelancer, WorkEntry, FreelancerStats } from "@/app/admin/freelancers/page"

function adminSupabase() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  )
}

export default async function MemberFreelancersPage() {
  const supabase = await createServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect("/login")

  const cookieStore = await cookies()
  const impersonateId = cookieStore.get("gf_impersonate")?.value
  const effectiveUserId = impersonateId ?? user.id

  const admin = adminSupabase()

  const { data: profile } = await admin
    .from("users")
    .select("company_id, can_manage_freelancers")
    .eq("id", effectiveUserId)
    .single()

  if (!profile?.company_id) redirect("/login")
  if (!profile?.can_manage_freelancers) redirect("/member/dashboard")

  const cid = profile.company_id

  const [freelancersResult, workEntriesResult, clientsResult] = await Promise.all([
    admin.from("freelancers").select("*").eq("company_id", cid).order("name"),
    admin.from("freelancer_work_entries").select("*").eq("company_id", cid).order("date", { ascending: false }),
    admin.from("clients").select("name").eq("company_id", cid).order("name"),
  ])

  const freelancers = (freelancersResult.data ?? []) as Freelancer[]
  const workEntries = (workEntriesResult.data ?? []) as WorkEntry[]
  const clientNames = (clientsResult.data ?? []).map((c: { name: string }) => c.name).filter(Boolean)

  const stats: FreelancerStats = {
    total: freelancers.length,
    voiceOver: freelancers.filter(f => f.type === "voice_over").length,
    videoEditor: freelancers.filter(f => f.type === "video_editor").length,
    videoShooter: freelancers.filter(f => f.type === "video_shooter").length,
    other: freelancers.filter(f => f.type === "other").length,
    totalWorks: workEntries.length,
    completedWorks: workEntries.filter(e => e.status === "completed").length,
    totalCost: workEntries.reduce((s, e) => s + (e.amount ?? 0), 0),
    paidAmount: workEntries.filter(e => e.payment_status === "paid").reduce((s, e) => s + (e.amount ?? 0), 0),
    pendingAmount: workEntries
      .filter(e => e.payment_status === "unpaid" && e.status === "completed")
      .reduce((s, e) => s + (e.amount ?? 0), 0),
  }

  return (
    <FreelancersClient
      freelancers={freelancers}
      workEntries={workEntries}
      clientNames={clientNames}
      stats={stats}
    />
  )
}
