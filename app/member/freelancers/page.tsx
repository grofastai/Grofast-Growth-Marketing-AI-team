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
    .select("company_id")
    .eq("id", effectiveUserId)
    .single()

  if (!profile?.company_id) redirect("/login")
  const cid = profile.company_id

  // Get freelancers assigned to this member
  const { data: assignmentRows } = await admin
    .from("freelancer_assignments")
    .select("freelancer_id")
    .eq("user_id", effectiveUserId)
    .eq("company_id", cid)

  const assignedIds = (assignmentRows ?? []).map((r: { freelancer_id: string }) => r.freelancer_id)

  if (assignedIds.length === 0) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center gap-4 p-8"
        style={{ background: "#F5F6FA" }}>
        <div style={{ width: 64, height: 64, borderRadius: 20, background: "rgba(222,26,26,0.07)", display: "flex", alignItems: "center", justifyContent: "center" }}>
          <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="#DE1A1A" strokeWidth="1.5"><circle cx="12" cy="8" r="4"/><path d="M4 20c0-4 3.6-7 8-7s8 3 8 7"/></svg>
        </div>
        <div style={{ textAlign: "center" }}>
          <p style={{ fontSize: 18, fontWeight: 800, color: "#111827" }}>No freelancers assigned</p>
          <p style={{ fontSize: 13, color: "#6B7280", marginTop: 6 }}>Ask your admin to assign freelancers to you.</p>
        </div>
      </div>
    )
  }

  const [freelancersResult, workEntriesResult, clientsResult] = await Promise.all([
    admin.from("freelancers").select("*").eq("company_id", cid).in("id", assignedIds).order("name"),
    admin.from("freelancer_work_entries").select("*").eq("company_id", cid).in("freelancer_id", assignedIds).order("date", { ascending: false }),
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
