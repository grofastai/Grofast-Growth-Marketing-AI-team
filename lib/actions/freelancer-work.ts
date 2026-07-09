"use server"

import { createServerClient } from "@/lib/supabase/server"
import { createClient } from "@supabase/supabase-js"
import { revalidatePath } from "next/cache"
import type { FreelancerTeam, WorkEntry } from "@/app/member/freelancers/freelancers-member-client"

function adminClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  )
}

// Admin can always manage freelancer work entries. Anyone else must be an
// assigned freelancer manager for at least one freelancer (any freelancer —
// being assigned to one grants management of all no-login freelancers, not
// just that specific one; that's a deliberate simplification, not a bug).
async function canManageFreelancers(admin: ReturnType<typeof adminClient>, userId: string, companyId: string): Promise<boolean> {
  const { data: profile } = await admin.from("users").select("role").eq("id", userId).single()
  if (profile?.role === "ADMIN" || profile?.role === "FOUNDER" || profile?.role === "CEO") return true
  const { count } = await admin
    .from("freelancer_assignments")
    .select("freelancer_id", { count: "exact", head: true })
    .eq("user_id", userId)
    .eq("company_id", companyId)
  return (count ?? 0) > 0
}

type WorkEntryPayload = {
  date_given: string | null
  date_finished?: string        // per-entry override; falls back to input.date_finished
  client_name: string
  title: string
  amount: number
  drive_link: string | null
  notes: string | null
  duration_mins: number | null
  language: string | null
  task_description: string | null
  payment_status?: "unpaid" | "paid"
}

export async function saveFreelancerWorkEntry(input: {
  freelancer_id: string
  team: FreelancerTeam
  date_finished: string
  entries: WorkEntryPayload[]
}): Promise<{ success: boolean; error?: string; entries?: WorkEntry[] }> {
  const supabase = await createServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { success: false, error: "Not authenticated" }

  const admin = adminClient()
  const { data: profile } = await admin
    .from("users")
    .select("company_id")
    .eq("id", user.id)
    .single()
  if (!profile?.company_id) return { success: false, error: "Profile not found" }
  if (!(await canManageFreelancers(admin, user.id, profile.company_id))) {
    return { success: false, error: "Not authorized to manage freelancer work entries" }
  }

  const rows = input.entries.map(e => ({
    company_id:       profile.company_id,
    freelancer_id:    input.freelancer_id,
    team:             input.team,
    date_finished:    e.date_finished ?? input.date_finished,
    date_given:       e.date_given,
    client_name:      e.client_name,
    title:            e.title,
    amount:           e.amount,
    drive_link:       e.drive_link,
    notes:            e.notes,
    duration_mins:    e.duration_mins,
    language:         e.language,
    task_description: e.task_description,
    payment_status:   e.payment_status ?? "unpaid",
  }))

  const { data, error } = await admin
    .from("freelancer_work_entries_v2")
    .insert(rows)
    .select()

  if (error) return { success: false, error: error.message }

  revalidatePath("/member/freelancers")
  revalidatePath("/admin/freelancers")
  return { success: true, entries: (data ?? []) as WorkEntry[] }
}

export async function deleteFreelancerWorkEntry(entryId: string): Promise<{ success: boolean; error?: string }> {
  const supabase = await createServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { success: false, error: "Not authenticated" }
  const admin = adminClient()
  const { data: profile } = await admin.from("users").select("company_id").eq("id", user.id).single()
  if (!profile?.company_id) return { success: false, error: "Profile not found" }
  if (!(await canManageFreelancers(admin, user.id, profile.company_id))) {
    return { success: false, error: "Not authorized to manage freelancer work entries" }
  }
  const { error } = await admin.from("freelancer_work_entries_v2").delete().eq("id", entryId)
  if (error) return { success: false, error: error.message }
  revalidatePath("/member/freelancers")
  revalidatePath("/admin/freelancers")
  return { success: true }
}

export async function toggleFreelancerPaymentStatus(
  entryId: string,
  newStatus: "paid" | "unpaid"
): Promise<{ success: boolean; error?: string }> {
  const supabase = await createServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { success: false, error: "Not authenticated" }

  const admin = adminClient()
  const { data: profile } = await admin.from("users").select("company_id").eq("id", user.id).single()
  if (!profile?.company_id) return { success: false, error: "Profile not found" }
  if (!(await canManageFreelancers(admin, user.id, profile.company_id))) {
    return { success: false, error: "Not authorized to manage freelancer work entries" }
  }
  const { error } = await admin
    .from("freelancer_work_entries_v2")
    .update({ payment_status: newStatus })
    .eq("id", entryId)

  if (error) return { success: false, error: error.message }
  revalidatePath("/member/freelancers")
  revalidatePath("/admin/freelancers")
  return { success: true }
}

export async function updateFreelancerWorkEntry(
  entryId: string,
  payload: WorkEntryPayload & { date_finished: string }
): Promise<{ success: boolean; error?: string }> {
  const supabase = await createServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { success: false, error: "Not authenticated" }

  const admin = adminClient()
  const { data: profile } = await admin.from("users").select("company_id").eq("id", user.id).single()
  if (!profile?.company_id) return { success: false, error: "Profile not found" }
  if (!(await canManageFreelancers(admin, user.id, profile.company_id))) {
    return { success: false, error: "Not authorized to manage freelancer work entries" }
  }
  const { error } = await admin
    .from("freelancer_work_entries_v2")
    .update({
      date_finished:    payload.date_finished,
      date_given:       payload.date_given,
      client_name:      payload.client_name,
      title:            payload.title,
      amount:           payload.amount,
      drive_link:       payload.drive_link,
      notes:            payload.notes,
      duration_mins:    payload.duration_mins,
      language:         payload.language,
      task_description: payload.task_description,
      payment_status:   payload.payment_status ?? "unpaid",
    })
    .eq("id", entryId)

  if (error) return { success: false, error: error.message }
  revalidatePath("/member/freelancers")
  revalidatePath("/admin/freelancers")
  return { success: true }
}

export async function getFreelancerWorkEntries(companyId: string, freelancerIds: string[]): Promise<WorkEntry[]> {
  if (freelancerIds.length === 0) return []
  const admin = adminClient()
  const { data } = await admin
    .from("freelancer_work_entries_v2")
    .select("*")
    .eq("company_id", companyId)
    .in("freelancer_id", freelancerIds)
    .order("date_finished", { ascending: false })
  return (data ?? []) as WorkEntry[]
}
