export const revalidate = 0

import { createServerClient } from "@/lib/supabase/server"
import { createClient } from "@supabase/supabase-js"
import { cookies } from "next/headers"
import { redirect } from "next/navigation"
import FreelancersMemberClient from "./freelancers-member-client"
import type { Freelancer, WorkEntry } from "./freelancers-member-client"

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
    .select("company_id, role")
    .eq("id", effectiveUserId)
    .single()

  if (!profile?.company_id) redirect("/login")
  const cid = profile.company_id

  const isElevated = ["ADMIN", "FOUNDER", "CEO", "FREELANCER_MGR"].includes(profile.role ?? "")

  // Get assigned freelancer IDs for non-elevated members
  let assignedIds: string[] = []
  if (!isElevated) {
    const { data: rows } = await admin
      .from("freelancer_assignments")
      .select("freelancer_id")
      .eq("user_id", effectiveUserId)
      .eq("company_id", cid)
    assignedIds = (rows ?? []).map((r: { freelancer_id: string }) => r.freelancer_id)
  }

  // Fetch freelancers from new system (team-based, no-login)
  const flQuery = isElevated
    ? admin.from("freelancers").select("id, name, team, phone, rating, status, created_at").eq("company_id", cid).not("team", "is", null).order("name")
    : assignedIds.length > 0
      ? admin.from("freelancers").select("id, name, team, phone, rating, status, created_at").eq("company_id", cid).not("team", "is", null).in("id", assignedIds).order("name")
      : null

  const [freelancersResult, workEntriesResult, clientsResult] = await Promise.all([
    flQuery ? flQuery : Promise.resolve({ data: [] }),
    isElevated
      ? admin.from("freelancer_work_entries_v2").select("*").eq("company_id", cid).order("date_finished", { ascending: false })
      : assignedIds.length > 0
        ? admin.from("freelancer_work_entries_v2").select("*").eq("company_id", cid).in("freelancer_id", assignedIds).order("date_finished", { ascending: false })
        : Promise.resolve({ data: [] }),
    admin.from("clients").select("name, status").eq("company_id", cid).order("name"),
  ])

  const freelancers = (freelancersResult.data ?? []) as Freelancer[]
  const workEntries = (workEntriesResult.data ?? []) as WorkEntry[]

  const INTERNAL = new Set(["GROFAST DIGITAL", "KARTHICK BRANDS", "GROFAST AI"])
  const allClients = (clientsResult.data ?? []) as { name: string; status: string }[]
  const clientNames = allClients
    .filter(c => c.status === "active" && !INTERNAL.has(c.name))
    .map(c => c.name)
    .filter(Boolean)

  return (
    <FreelancersMemberClient
      freelancers={freelancers}
      workEntries={workEntries}
      clientNames={clientNames}
    />
  )
}
