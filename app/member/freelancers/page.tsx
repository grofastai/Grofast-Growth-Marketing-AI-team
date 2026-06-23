export const revalidate = 0

import { createServerClient } from "@/lib/supabase/server"
import { createClient } from "@supabase/supabase-js"
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

  const admin = adminSupabase()

  const { data: profile } = await admin
    .from("users")
    .select("company_id")
    .eq("id", user.id)
    .single()

  if (!profile?.company_id) redirect("/login")
  const cid = profile.company_id

  const [freelancersResult, workEntriesResult, activeClientsResult, pastClientsResult] = await Promise.all([
    admin.from("freelancers").select("id, name, team, phone, rating, status, created_at")
      .eq("company_id", cid).not("team", "is", null).order("name"),
    admin.from("freelancer_work_entries_v2").select("*")
      .eq("company_id", cid).order("date_finished", { ascending: false }),
    admin.from("clients").select("name").eq("company_id", cid).eq("status", "active").order("name"),
    admin.from("clients").select("name").eq("company_id", cid).eq("status", "past").order("name"),
  ])

  const freelancers = (freelancersResult.data ?? []) as Freelancer[]
  const workEntries = (workEntriesResult.data ?? []) as WorkEntry[]

  const clientNames     = (activeClientsResult.data ?? []).map((c: { name: string }) => c.name).filter(Boolean)
  const pastClientNames = (pastClientsResult.data ?? []).map((c: { name: string }) => c.name).filter(Boolean)

  return (
    <FreelancersMemberClient
      freelancers={freelancers}
      workEntries={workEntries}
      clientNames={clientNames}
      pastClientNames={pastClientNames}
    />
  )
}
