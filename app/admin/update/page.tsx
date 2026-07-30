export const revalidate = 30 // was force-fresh — safe to cache: every write to this page already calls revalidatePath() (2026-07-30)

import { createServerClient } from "@/lib/supabase/server"
import { createClient } from "@supabase/supabase-js"
import { redirect } from "next/navigation"
import { Suspense } from "react"
import DailyUpdateForm from "@/app/member/update/daily-update-form"
import { Loader2 } from "lucide-react"
import { todayIST } from "@/lib/utils/ist-date"

function adminSupabase() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  )
}

export default async function AdminUpdatePage() {
  const supabase = await createServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect("/login")

  type Project = { id: string; business_name: string }

  const admin = adminSupabase()
  const today = todayIST()

  const { data: profile } = await admin
    .from("users")
    .select("company_id, team, name")
    .eq("id", user.id)
    .single()

  const companyId = profile?.company_id ?? ""

  const [{ data: projectsRaw }, { data: supabaseClientsRaw }, { data: existingUpdate }, { data: pastUpdates }] = await Promise.all([
    admin
      .from("projects")
      .select("id, business_name")
      .eq("company_id", companyId)
      .eq("status", "active")
      .order("business_name"),
    admin
      .from("clients")
      .select("name")
      .eq("company_id", companyId)
      .eq("status", "active")
      .order("name"),
    admin
      .from("daily_updates")
      .select("id, date, working_hours, shoot_count, editing_count, learning_hours, active_tab, work_entries, learning_topic, learning_notes")
      .eq("user_id", user.id)
      .eq("date", today)
      .maybeSingle(),
    admin
      .from("daily_updates")
      .select("id, date, working_hours, learning_hours, shoot_count, editing_count, shoot_time_hours, editing_time_hours, work_entries, active_tab, learning_topic")
      .eq("user_id", user.id)
      .neq("date", today)
      .order("date", { ascending: false })
      .limit(30),
  ])

  const projects = (projectsRaw ?? []) as unknown as Project[]
  const clientNames = (supabaseClientsRaw ?? []).map((c: { name: string }) => c.name)

  return (
    <Suspense fallback={
      <div className="flex items-center justify-center py-16">
        <Loader2 size={20} className="animate-spin" style={{ color: "#de1a1a" }} />
      </div>
    }>
      <DailyUpdateForm
        projects={projects}
        sheetClientNames={clientNames}
        team={profile?.team ?? null}
        userName={(profile as { name?: string } | null)?.name ?? ""}
        existingUpdate={existingUpdate ?? null}
        pastUpdates={pastUpdates ?? []}
      />
    </Suspense>
  )
}
