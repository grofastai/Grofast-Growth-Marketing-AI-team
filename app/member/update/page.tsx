import { createServerClient } from "@/lib/supabase/server"
import { redirect } from "next/navigation"
import DailyUpdateForm from "./daily-update-form"
import { CheckCircle2 } from "lucide-react"

export default async function UpdatePage() {
  const supabase = await createServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect("/login")

  const today = new Date().toISOString().split("T")[0]

  const [{ data: existing }, { data: myTasks }] = await Promise.all([
    supabase.from("daily_updates").select("attendance_status, working_hours, learning_hours, shoot_count, tasks(title)").eq("user_id", user.id).eq("date", today).maybeSingle(),
    supabase.from("tasks").select("id, title, status").eq("assigned_to", user.id).neq("status", "completed").order("status"),
  ])

  const dateStr = new Date().toLocaleDateString("en-US", { weekday: "long", day: "numeric", month: "long", year: "numeric" })

  return (
    <div className="p-8 max-w-[700px]">
      <div className="mb-7">
        <h1 className="text-[30px] font-black leading-tight" style={{ fontFamily: "var(--font-jakarta)", color: "#FFFFFF" }}>
          Daily Update
        </h1>
        <p className="text-sm mt-1" style={{ color: "rgba(255,255,255,0.35)" }}>{dateStr}</p>
      </div>

      {existing ? (
        <div className="rounded-xl p-8 flex flex-col items-center gap-5 text-center"
          style={{ background: "rgba(163,230,53,0.04)", border: "1px solid rgba(163,230,53,0.2)" }}>
          <div className="w-14 h-14 rounded-full flex items-center justify-center"
            style={{ background: "rgba(163,230,53,0.1)" }}>
            <CheckCircle2 size={28} style={{ color: "#A3E635" }} />
          </div>
          <div>
            <h2 className="text-[18px] font-black mb-1" style={{ fontFamily: "var(--font-jakarta)", color: "#A3E635" }}>
              Update submitted
            </h2>
            <p className="text-[13px]" style={{ color: "rgba(255,255,255,0.35)" }}>
              You've already submitted your daily update for today.
            </p>
          </div>
          <div className="grid grid-cols-3 gap-3 w-full max-w-sm">
            {[
              { label: "Attendance", value: existing.attendance_status },
              { label: "Work Hours", value: existing.working_hours != null ? `${existing.working_hours}h` : "—" },
              { label: "Learning", value: `${existing.learning_hours ?? 0}h` },
            ].map((item) => (
              <div key={item.label} className="rounded-lg p-3" style={{ background: "#262626" }}>
                <p className="text-[9px] uppercase tracking-[0.18em] font-bold mb-1" style={{ color: "rgba(255,255,255,0.3)" }}>{item.label}</p>
                <p className="text-[13px] font-bold capitalize" style={{ color: "#FFFFFF" }}>{item.value}</p>
              </div>
            ))}
          </div>
        </div>
      ) : (
        <DailyUpdateForm tasks={myTasks ?? []} />
      )}
    </div>
  )
}
