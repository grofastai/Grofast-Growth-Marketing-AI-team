"use server"

import { createServerClient } from "@/lib/supabase/server"
import { createClient } from "@supabase/supabase-js"
import { revalidatePath } from "next/cache"

function adminClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  )
}

async function getCompanyId(): Promise<string | null> {
  const supabase = await createServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return null
  const admin = adminClient()
  const { data } = await admin
    .from("users")
    .select("company_id")
    .eq("id", user.id)
    .single()
  return data?.company_id ?? null
}

export type FreelancerType = "voice_over" | "video_editor" | "video_shooter" | "other"

export type FreelancerInput = {
  name: string
  type: FreelancerType
  phone?: string
  availability_notes?: string
  rating?: number
  status?: "active" | "inactive"
  // VO
  language?: string
  voice_type?: string
  cost_per_minute?: number | null
  // Editor
  editing_software?: string[]
  video_types_offered?: string[]
  cost_per_video?: number | null
  // Shooter
  availability_schedule?: string
  cost_per_hour?: number | null
}

export type WorkEntryInput = {
  freelancer_id: string
  entry_type: "voice_over" | "video_edit" | "video_shoot"
  client_name?: string
  title?: string
  date?: string
  status?: string
  payment_status?: string
  notes?: string
  // VO
  audio_duration_minutes?: number | null
  // Edit
  date_given?: string
  date_finished?: string
  video_type?: string
  video_duration?: string
  time_taken_hours?: number | null
  drive_updated?: boolean
  revision_count?: number
  // Shoot
  start_time?: string
  end_time?: string
  travel_hours?: number | null
}

export async function createFreelancer(input: FreelancerInput): Promise<{ success: boolean; error?: string }> {
  const companyId = await getCompanyId()
  if (!companyId) return { success: false, error: "Not authenticated" }

  const admin = adminClient()
  const { error } = await admin.from("freelancers").insert({
    company_id: companyId,
    name: input.name,
    type: input.type,
    phone: input.phone || null,
    availability_notes: input.availability_notes || null,
    rating: input.rating ?? 0,
    status: "active",
    language: input.language || null,
    voice_type: input.voice_type || null,
    cost_per_minute: input.cost_per_minute || null,
    editing_software: input.editing_software ?? [],
    video_types_offered: input.video_types_offered ?? [],
    cost_per_video: input.cost_per_video || null,
    availability_schedule: input.availability_schedule || null,
    cost_per_hour: input.cost_per_hour || null,
  })

  if (error) return { success: false, error: error.message }
  revalidatePath("/admin/freelancers")
  return { success: true }
}

export async function updateFreelancer(id: string, input: FreelancerInput): Promise<{ success: boolean; error?: string }> {
  const companyId = await getCompanyId()
  if (!companyId) return { success: false, error: "Not authenticated" }

  const admin = adminClient()
  const { error } = await admin.from("freelancers").update({
    name: input.name,
    type: input.type,
    phone: input.phone || null,
    availability_notes: input.availability_notes || null,
    rating: input.rating ?? 0,
    status: input.status ?? "active",
    language: input.language || null,
    voice_type: input.voice_type || null,
    cost_per_minute: input.cost_per_minute || null,
    editing_software: input.editing_software ?? [],
    video_types_offered: input.video_types_offered ?? [],
    cost_per_video: input.cost_per_video || null,
    availability_schedule: input.availability_schedule || null,
    cost_per_hour: input.cost_per_hour || null,
  }).eq("id", id).eq("company_id", companyId)

  if (error) return { success: false, error: error.message }
  revalidatePath("/admin/freelancers")
  return { success: true }
}

export async function deleteFreelancer(id: string): Promise<{ success: boolean; error?: string }> {
  const companyId = await getCompanyId()
  if (!companyId) return { success: false, error: "Not authenticated" }

  const admin = adminClient()
  const { error } = await admin.from("freelancers").delete().eq("id", id).eq("company_id", companyId)

  if (error) return { success: false, error: error.message }
  revalidatePath("/admin/freelancers")
  return { success: true }
}

export async function createWorkEntry(input: WorkEntryInput): Promise<{ success: boolean; error?: string }> {
  const companyId = await getCompanyId()
  if (!companyId) return { success: false, error: "Not authenticated" }

  const admin = adminClient()

  const { data: freelancer } = await admin
    .from("freelancers")
    .select("cost_per_minute, cost_per_video, cost_per_hour")
    .eq("id", input.freelancer_id)
    .single()

  // Auto-calculate amount + working_hours
  let amount: number | null = null
  let working_hours: number | null = null

  if (input.entry_type === "voice_over" && input.audio_duration_minutes && freelancer?.cost_per_minute) {
    amount = Math.round(input.audio_duration_minutes * (freelancer.cost_per_minute as number) * 100) / 100
  } else if (input.entry_type === "video_edit" && freelancer?.cost_per_video) {
    amount = freelancer.cost_per_video as number
  } else if (input.entry_type === "video_shoot" && input.start_time && input.end_time && freelancer?.cost_per_hour) {
    const [sh, sm] = input.start_time.split(":").map(Number)
    const [eh, em] = input.end_time.split(":").map(Number)
    working_hours = Math.round(((eh * 60 + em) - (sh * 60 + sm)) / 60 * 100) / 100
    amount = Math.round(working_hours * (freelancer.cost_per_hour as number) * 100) / 100
  }

  const { error } = await admin.from("freelancer_work_entries").insert({
    company_id: companyId,
    freelancer_id: input.freelancer_id,
    entry_type: input.entry_type,
    client_name: input.client_name || null,
    title: input.title || null,
    date: input.date || new Date().toISOString().split("T")[0],
    status: input.status || "pending",
    payment_status: input.payment_status || "unpaid",
    paid_at: input.payment_status === "paid" ? new Date().toISOString() : null,
    notes: input.notes || null,
    amount,
    audio_duration_minutes: input.audio_duration_minutes || null,
    cost_per_minute_snapshot: freelancer?.cost_per_minute || null,
    date_given: input.date_given || null,
    date_finished: input.date_finished || null,
    video_type: input.video_type || null,
    video_duration: input.video_duration || null,
    time_taken_hours: input.time_taken_hours || null,
    drive_updated: input.drive_updated ?? false,
    revision_count: input.revision_count ?? 0,
    cost_per_video_snapshot: freelancer?.cost_per_video || null,
    start_time: input.start_time || null,
    end_time: input.end_time || null,
    travel_hours: input.travel_hours || 0,
    working_hours,
    cost_per_hour_snapshot: freelancer?.cost_per_hour || null,
  })

  if (error) return { success: false, error: error.message }
  revalidatePath("/admin/freelancers")
  return { success: true }
}

export async function updateWorkEntryStatus(id: string, status: string): Promise<{ success: boolean; error?: string }> {
  const companyId = await getCompanyId()
  if (!companyId) return { success: false, error: "Not authenticated" }

  const admin = adminClient()
  const { error } = await admin.from("freelancer_work_entries")
    .update({ status })
    .eq("id", id).eq("company_id", companyId)

  if (error) return { success: false, error: error.message }
  revalidatePath("/admin/freelancers")
  return { success: true }
}

export async function markWorkEntryPaid(id: string, paid: boolean): Promise<{ success: boolean; error?: string }> {
  const companyId = await getCompanyId()
  if (!companyId) return { success: false, error: "Not authenticated" }

  const admin = adminClient()
  const { error } = await admin.from("freelancer_work_entries")
    .update({
      payment_status: paid ? "paid" : "unpaid",
      paid_at: paid ? new Date().toISOString() : null,
    })
    .eq("id", id).eq("company_id", companyId)

  if (error) return { success: false, error: error.message }
  revalidatePath("/admin/freelancers")
  return { success: true }
}

export async function deleteWorkEntry(id: string): Promise<{ success: boolean; error?: string }> {
  const companyId = await getCompanyId()
  if (!companyId) return { success: false, error: "Not authenticated" }

  const admin = adminClient()
  const { error } = await admin.from("freelancer_work_entries")
    .delete().eq("id", id).eq("company_id", companyId)

  if (error) return { success: false, error: error.message }
  revalidatePath("/admin/freelancers")
  return { success: true }
}
