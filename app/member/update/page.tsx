import { createServerClient } from "@/lib/supabase/server"
import { redirect } from "next/navigation"
import DailyUpdateForm from "./daily-update-form"

export default async function UpdatePage() {
  const supabase = await createServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect("/login")

  const today = new Date().toISOString().split("T")[0]
  const { data: existing } = await supabase
    .from("daily_updates")
    .select("*")
    .eq("user_id", user.id)
    .eq("date", today)
    .single()

  return (
    <div className="p-8 max-w-[700px]">
      <div className="mb-6">
        <h1 className="text-[32px] leading-tight" style={{ fontFamily: "var(--font-jakarta)", fontWeight: 800, color: "#E6EDF3" }}>
          Daily Update
        </h1>
        <p className="text-sm mt-1 font-sans" style={{ color: "#6B7280" }}>
          {new Date().toLocaleDateString("en-US", { weekday: "long", day: "numeric", month: "long" })}
        </p>
      </div>

      {existing ? (
        <div className="rounded-2xl p-8 flex flex-col items-center gap-4 text-center"
          style={{ background: "rgba(16,185,129,0.06)", border: "1px solid rgba(16,185,129,0.2)" }}>
          <div className="text-4xl">✅</div>
          <div>
            <h2 className="text-[18px] font-bold font-sans mb-1" style={{ color: "#10B981" }}>Update submitted!</h2>
            <p className="text-[13px] font-sans" style={{ color: "#6B7280" }}>You've already submitted your daily update for today.</p>
          </div>
          <div className="grid grid-cols-3 gap-3 mt-2 w-full max-w-sm">
            {[
              { label: "Status", value: existing.attendance_status },
              { label: "Work Hours", value: existing.working_hours != null ? `${existing.working_hours}h` : "—" },
              { label: "Learning", value: `${existing.learning_hours}h` },
            ].map((item) => (
              <div key={item.label} className="rounded-xl p-3" style={{ background: "rgba(255,255,255,0.04)" }}>
                <p className="text-[10px] uppercase tracking-wider font-sans mb-1" style={{ color: "#6B7280" }}>{item.label}</p>
                <p className="text-[14px] font-bold font-sans capitalize" style={{ color: "#E6EDF3" }}>{item.value}</p>
              </div>
            ))}
          </div>
        </div>
      ) : (
        <DailyUpdateForm />
      )}
    </div>
  )
}
