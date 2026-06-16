export const revalidate = 0

import { createServerClient } from "@/lib/supabase/server"
import { createClient } from "@supabase/supabase-js"
import { redirect } from "next/navigation"
import FreelancersClient from "./freelancers-client"

function adminSupabase() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  )
}

export default async function FreelancersPage() {
  const supabase = await createServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect("/login")

  const admin = adminSupabase()

  const { data: profile } = await admin
    .from("users")
    .select("company_id, role")
    .eq("id", user.id)
    .single()

  if (!profile?.company_id) redirect("/login")
  const cid = profile.company_id

  const [freelancersResult, workEntriesResult, clientsResult, teamResult, assignmentsResult] = await Promise.all([
    admin.from("freelancers").select("*").eq("company_id", cid).order("name"),
    admin.from("freelancer_work_entries").select("*").eq("company_id", cid).order("date", { ascending: false }),
    admin.from("clients").select("name").eq("company_id", cid).order("name"),
    admin.from("users").select("id, name, employee_id").eq("company_id", cid).eq("role", "MEMBER").eq("status", "active").order("name"),
    admin.from("freelancer_assignments").select("freelancer_id, user_id").eq("company_id", cid),
  ])

  const freelancers = (freelancersResult.data ?? []) as Freelancer[]
  const workEntries = (workEntriesResult.data ?? []) as WorkEntry[]
  const clientNames = (clientsResult.data ?? []).map((c: { name: string }) => c.name).filter(Boolean)
  const teamMembers = (teamResult.data ?? []) as { id: string; name: string; employee_id: string }[]

  const assignments: Record<string, string[]> = {}
  for (const row of (assignmentsResult.data ?? [])) {
    if (!assignments[row.freelancer_id]) assignments[row.freelancer_id] = []
    assignments[row.freelancer_id].push(row.user_id)
  }

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
      teamMembers={teamMembers}
      assignments={assignments}
    />
  )
}

// ── Shared types (also used by client) ──────────────────────────────────────

export type FreelancerType = "voice_over" | "video_editor" | "video_shooter" | "other"

export type Freelancer = {
  id: string
  company_id: string
  name: string
  type: FreelancerType
  phone: string | null
  upi_id: string | null
  gender: string | null
  title: string | null
  availability_notes: string | null
  rating: number
  status: "active" | "inactive"
  language: string | null
  voice_type: string | null
  cost_per_minute: number | null
  editing_software: string[]
  video_types_offered: string[]
  cost_per_video: number | null
  availability_schedule: string | null
  cost_per_hour: number | null
  created_at: string
}

export type WorkEntry = {
  id: string
  company_id: string
  freelancer_id: string
  entry_type: "voice_over" | "video_edit" | "video_shoot"
  client_name: string | null
  title: string | null
  date: string
  status: string
  payment_status: string
  paid_at: string | null
  amount: number | null
  notes: string | null
  audio_duration_minutes: number | null
  cost_per_minute_snapshot: number | null
  date_given: string | null
  date_finished: string | null
  video_type: string | null
  video_duration: string | null
  time_taken_hours: number | null
  drive_updated: boolean
  revision_count: number
  cost_per_video_snapshot: number | null
  start_time: string | null
  end_time: string | null
  travel_hours: number | null
  working_hours: number | null
  cost_per_hour_snapshot: number | null
  created_at: string
}

export type FreelancerStats = {
  total: number
  voiceOver: number
  videoEditor: number
  videoShooter: number
  other: number
  totalWorks: number
  completedWorks: number
  totalCost: number
  paidAmount: number
  pendingAmount: number
}
