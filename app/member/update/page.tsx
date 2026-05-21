import { createServerClient } from "@/lib/supabase/server"
import { createClient } from "@supabase/supabase-js"
import { redirect } from "next/navigation"
import { Suspense } from "react"
import DailyUpdateForm from "./daily-update-form"
import { Loader2 } from "lucide-react"
import { fetchSheetClients, stripFinancialFields } from "@/lib/google/sheets"

function adminSupabase() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  )
}

export default async function UpdatePage() {
  const supabase = await createServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect("/login")

  type Project = { id: string; business_name: string }

  const admin = adminSupabase()
  const today = new Date().toISOString().split("T")[0]

  const { data: profile } = await admin
    .from("users")
    .select("company_id, team, name")
    .eq("id", user.id)
    .single()

  const { data: projectsRaw } = await admin
    .from("projects")
    .select("id, business_name")
    .eq("company_id", profile?.company_id ?? "")
    .eq("status", "active")
    .order("business_name")

  const { data: existingUpdate } = await admin
    .from("daily_updates")
    .select("id, date, working_hours, shoot_count, editing_count, learning_hours, active_tab")
    .eq("user_id", user.id)
    .eq("date", today)
    .maybeSingle()

  const projects = (projectsRaw ?? []) as unknown as Project[]

  const sheetId  = process.env.GOOGLE_CLIENTS_SHEET_ID
  const sheetGid = process.env.GOOGLE_CLIENTS_SHEET_GID
  const sheetClients = sheetId
    ? await fetchSheetClients(sheetId, sheetGid).catch(() => [])
    : []
  const sheetClientNames = stripFinancialFields(sheetClients)
    .map(c => (c.company_name || c.customer_name).trim())
    .filter(Boolean)

  return (
    <Suspense fallback={
      <div className="flex items-center justify-center py-16">
        <Loader2 size={20} className="animate-spin" style={{ color: "#de1a1a" }} />
      </div>
    }>
      <DailyUpdateForm
        projects={projects}
        sheetClientNames={sheetClientNames}
        team={profile?.team ?? null}
        userName={(profile as { name?: string } | null)?.name ?? ""}
        existingUpdate={existingUpdate ?? null}
      />
    </Suspense>
  )
}
