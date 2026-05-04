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
    .select("company_id")
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
    <div className="p-6 md:p-8 max-w-[760px]">
      <div className="mb-7">
        <h1 className="gradient-heading text-[30px] font-black leading-tight"
          style={{ fontFamily: "var(--font-jakarta)" }}>
          Daily Update
        </h1>
        <p className="text-sm mt-1" style={{ color: "#9CA3AF" }}>{dateStr}</p>
      </div>

      {existing ? (
        <div className="rounded-xl p-8 flex flex-col items-center gap-5 text-center"
          style={{ background: "rgba(220,38,38,0.04)", border: "1px solid rgba(220,38,38,0.2)" }}>
          <div className="w-14 h-14 rounded-full flex items-center justify-center"
            style={{ background: "rgba(220,38,38,0.1)" }}>
            <CheckCircle2 size={28} style={{ color: "#DC2626" }} />
          </div>
          <div>
            <h2 className="text-[18px] font-black mb-1"
              style={{ fontFamily: "var(--font-jakarta)", color: "#DC2626" }}>
              Update submitted
            </h2>
            <p className="text-[13px]" style={{ color: "#6B7280" }}>
              You&apos;ve already submitted your daily update for today.
            </p>
          </div>
          <div className="grid grid-cols-3 gap-3 w-full max-w-sm">
            {[
              { label: "Work Hours",    value: existing.working_hours != null ? `${existing.working_hours}h` : "—" },
              { label: "Work Entries",  value: entryCount },
              { label: "Learning",      value: existing.learning_hours ? `${existing.learning_hours}h` : "—" },
            ].map((item) => (
              <div key={item.label} className="rounded-lg p-3" style={{ background: "#F9FAFB", border: "1px solid #F0F0F0" }}>
                <p className="text-[9px] uppercase tracking-[0.18em] font-bold mb-1"
                  style={{ color: "#9CA3AF" }}>{item.label}</p>
                <p className="text-[13px] font-bold capitalize" style={{ color: "#111827" }}>{item.value}</p>
              </div>
            ))}
          </div>
        </div>
      ) : (
        <Suspense fallback={
          <div className="flex items-center justify-center py-16">
            <Loader2 size={20} className="animate-spin" style={{ color: "#DC2626" }} />
          </div>
        }>
          <DailyUpdateForm projects={projects} />
        </Suspense>
      )}
    </div>
  )
}
