import { createServerClient } from "@/lib/supabase/server"
import { createClient } from "@supabase/supabase-js"
import { redirect } from "next/navigation"
import { Suspense } from "react"
import DailyUpdateForm from "./daily-update-form"
import { CheckCircle2, Loader2 } from "lucide-react"

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

  const today = new Date().toISOString().split("T")[0]

  type ExistingUpdate = {
    active_tab:     string | null
    working_hours:  number | null
    learning_hours: number | null
    shoot_count:    number | null
    work_entries:   unknown[]
  }

  type Project = { id: string; business_name: string }

  // Fetch user's company_id first so we can query projects with service role
  const admin = adminSupabase()
  const { data: profile } = await admin
    .from("users")
    .select("company_id, team")
    .eq("id", user.id)
    .single()

  const [{ data: existingRaw }, { data: projectsRaw }] = await Promise.all([
    supabase
      .from("daily_updates")
      .select("working_hours, learning_hours, shoot_count, work_entries")
      .eq("user_id", user.id)
      .eq("date", today)
      .maybeSingle(),
    // Use service role so members can see all company projects regardless of RLS
    admin
      .from("projects")
      .select("id, business_name")
      .eq("company_id", profile?.company_id ?? "")
      .eq("status", "active")
      .order("business_name"),
  ])

  const existing = existingRaw as unknown as ExistingUpdate | null
  const projects = (projectsRaw ?? []) as unknown as Project[]

  const dateStr = new Date().toLocaleDateString("en-US", {
    weekday: "long", day: "numeric", month: "long", year: "numeric",
  })

  const entryCount = Array.isArray(existing?.work_entries) ? existing.work_entries.length : 0

  return (
    <div className="p-6 md:p-8 max-w-[1100px]">
      <div className="mb-7">
        <h1 className="gradient-heading text-[30px] font-black leading-tight"
          style={{ fontFamily: "var(--font-jakarta)" }}>
          Daily Update
        </h1>
        <p className="text-sm mt-1" style={{ color: "#6B7280" }}>{dateStr}</p>
      </div>

      {/* Already-submitted summary — shown above the form so they can log more work */}
      {existing && (
        <div className="rounded-xl px-5 py-4 mb-6 flex items-center gap-4"
          style={{ background: "rgba(222,26,26,0.04)", border: "1px solid rgba(222,26,26,0.18)" }}>
          <div className="w-9 h-9 rounded-full flex-shrink-0 flex items-center justify-center"
            style={{ background: "rgba(222,26,26,0.1)" }}>
            <CheckCircle2 size={18} style={{ color: "#de1a1a" }} />
          </div>
          <div className="flex-1">
            <p className="text-[13px] font-bold" style={{ color: "#de1a1a" }}>Update submitted today</p>
            <p className="text-[11px] mt-0.5" style={{ color: "#6B7280" }}>
              {existing.working_hours != null ? `${existing.working_hours}h work` : ""}
              {existing.working_hours != null && existing.learning_hours ? " · " : ""}
              {existing.learning_hours ? `${existing.learning_hours}h learning` : ""}
              {entryCount > 0 ? ` · ${entryCount} entr${entryCount === 1 ? "y" : "ies"}` : ""}
            </p>
          </div>
          <p className="text-[11px] font-semibold" style={{ color: "#6B7280" }}>Add more below ↓</p>
        </div>
      )}

      <Suspense fallback={
        <div className="flex items-center justify-center py-16">
          <Loader2 size={20} className="animate-spin" style={{ color: "#de1a1a" }} />
        </div>
      }>
        <DailyUpdateForm projects={projects} team={profile?.team ?? null} />
      </Suspense>
    </div>
  )
}
