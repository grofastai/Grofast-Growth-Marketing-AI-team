import { createServerClient } from "@/lib/supabase/server"
import { redirect } from "next/navigation"
import { Suspense } from "react"
import DailyUpdateForm from "./daily-update-form"
import { CheckCircle2, Loader2 } from "lucide-react"

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

  const [{ data: existingRaw }, { data: projectsRaw }] = await Promise.all([
    supabase
      .from("daily_updates")
      .select("working_hours, learning_hours, shoot_count, work_entries")
      .eq("user_id", user.id)
      .eq("date", today)
      .maybeSingle(),
    supabase
      .from("projects")
      .select("id, business_name")
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
        <h1 className="text-[30px] font-black leading-tight"
          style={{ fontFamily: "var(--font-jakarta)", color: "#FFFFFF" }}>
          Daily Update
        </h1>
        <p className="text-sm mt-1" style={{ color: "rgba(255,255,255,0.35)" }}>{dateStr}</p>
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
            <p className="text-[13px]" style={{ color: "rgba(255,255,255,0.35)" }}>
              You&apos;ve already submitted your daily update for today.
            </p>
          </div>
          <div className="grid grid-cols-3 gap-3 w-full max-w-sm">
            {[
              { label: "Work Hours",    value: existing.working_hours != null ? `${existing.working_hours}h` : "—" },
              { label: "Work Entries",  value: entryCount },
              { label: "Learning",      value: existing.learning_hours ? `${existing.learning_hours}h` : "—" },
            ].map((item) => (
              <div key={item.label} className="rounded-lg p-3" style={{ background: "#262626" }}>
                <p className="text-[9px] uppercase tracking-[0.18em] font-bold mb-1"
                  style={{ color: "rgba(255,255,255,0.3)" }}>{item.label}</p>
                <p className="text-[13px] font-bold capitalize" style={{ color: "#FFFFFF" }}>{item.value}</p>
              </div>
            ))}
          </div>
        </div>
      ) : (
        <Suspense fallback={
          <div className="flex items-center justify-center py-16">
            <Loader2 size={20} className="animate-spin" style={{ color: "rgba(255,255,255,0.3)" }} />
          </div>
        }>
          <DailyUpdateForm projects={projects} />
        </Suspense>
      )}
    </div>
  )
}
