export const revalidate = 0

import { createServerClient } from "@/lib/supabase/server"
import { createClient } from "@supabase/supabase-js"
import { Clock, LogIn, LogOut, Users } from "lucide-react"

function adminSupabase() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  )
}

function fmtTime(iso: string | null) {
  if (!iso) return "—"
  return new Date(iso).toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit", hour12: true })
}

function calcDuration(clockIn: string | null, clockOut: string | null) {
  if (!clockIn) return null
  const end = clockOut ? new Date(clockOut) : new Date()
  const mins = Math.floor((end.getTime() - new Date(clockIn).getTime()) / 60000)
  if (mins < 60) return `${mins}m`
  return `${Math.floor(mins / 60)}h ${mins % 60}m`
}

export default async function AttendancePage() {
  const supabase = await createServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return null

  const admin = adminSupabase()
  const { data: profile } = await admin.from("users").select("company_id").eq("id", user.id).single()
  if (!profile) return null

  const today = new Date().toISOString().split("T")[0]
  const todayDisplay = new Date().toLocaleDateString("en-US", { weekday: "long", day: "numeric", month: "long", year: "numeric" })

  const [{ data: members }, { data: logs }] = await Promise.all([
    admin.from("users").select("id, name, employee_id").eq("company_id", profile.company_id).eq("role", "MEMBER").order("name"),
    admin.from("attendance_logs").select("user_id, clock_in, clock_out").eq("company_id", profile.company_id).eq("date", today),
  ])

  type Log = { user_id: string; clock_in: string | null; clock_out: string | null }
  const logMap = new Map<string, Log>()
  for (const l of (logs ?? []) as Log[]) logMap.set(l.user_id, l)

  const clockedInNow = (members ?? []).filter((m) => {
    const l = logMap.get(m.id)
    return l?.clock_in && !l?.clock_out
  }).length
  const clockedOut = (members ?? []).filter((m) => {
    const l = logMap.get(m.id)
    return l?.clock_in && l?.clock_out
  }).length
  const notClocked = (members ?? []).filter((m) => !logMap.has(m.id)).length

  return (
    <div className="p-8 max-w-[1200px]">
      {/* Header */}
      <div className="flex items-start justify-between mb-6">
        <div>
          <h1 className="text-[32px] leading-tight" style={{ fontFamily: "var(--font-jakarta)", fontWeight: 800, color: "#E6EDF3" }}>
            Attendance
          </h1>
          <p className="text-sm mt-1 font-sans" style={{ color: "#6B7280" }}>{todayDisplay}</p>
        </div>
      </div>

      {/* Summary chips */}
      <div className="grid grid-cols-3 gap-4 mb-6">
        {[
          { label: "Clocked In Now", value: clockedInNow, color: "#10B981", bg: "rgba(16,185,129,0.08)", border: "rgba(16,185,129,0.15)", icon: LogIn },
          { label: "Clocked Out", value: clockedOut, color: "#6D5DF6", bg: "rgba(109,93,246,0.08)", border: "rgba(109,93,246,0.15)", icon: LogOut },
          { label: "Not Clocked In", value: notClocked, color: "#F59E0B", bg: "rgba(245,158,11,0.08)", border: "rgba(245,158,11,0.15)", icon: Users },
        ].map((s) => {
          const Icon = s.icon
          return (
            <div key={s.label} className="rounded-2xl p-5 flex items-center gap-4"
              style={{ background: s.bg, border: `1px solid ${s.border}` }}>
              <div className="w-10 h-10 rounded-xl flex items-center justify-center" style={{ background: "rgba(255,255,255,0.06)" }}>
                <Icon size={18} style={{ color: s.color }} />
              </div>
              <div>
                <p className="text-[28px] font-black leading-none" style={{ fontFamily: "var(--font-jakarta)", color: "#E6EDF3" }}>{s.value}</p>
                <p className="text-[12px] font-sans mt-0.5" style={{ color: "#6B7280" }}>{s.label}</p>
              </div>
            </div>
          )
        })}
      </div>

      {/* Member table */}
      <div className="rounded-2xl overflow-hidden" style={{ background: "rgba(255,255,255,0.02)", border: "1px solid rgba(255,255,255,0.06)" }}>
        <div className="px-5 py-4" style={{ borderBottom: "1px solid rgba(255,255,255,0.06)" }}>
          <div className="flex items-center gap-2">
            <Clock size={15} style={{ color: "#6D5DF6" }} />
            <h3 className="text-[14px] font-bold font-sans" style={{ color: "#E6EDF3" }}>Team Attendance — Today</h3>
          </div>
        </div>

        {!members || members.length === 0 ? (
          <div className="flex flex-col items-center py-16 gap-2">
            <Users size={36} style={{ color: "rgba(255,255,255,0.1)" }} />
            <p className="text-[13px] font-sans" style={{ color: "#6B7280" }}>No team members found</p>
          </div>
        ) : (
          <div className="divide-y" style={{ borderColor: "rgba(255,255,255,0.04)" }}>
            {(members ?? []).map((m) => {
              const log = logMap.get(m.id)
              const isIn = !!(log?.clock_in && !log?.clock_out)
              const isDone = !!(log?.clock_in && log?.clock_out)
              const dur = calcDuration(log?.clock_in ?? null, log?.clock_out ?? null)

              let statusColor = "#6B7280"
              let statusBg = "rgba(107,114,128,0.1)"
              let statusLabel = "Not clocked in"
              if (isIn) { statusColor = "#10B981"; statusBg = "rgba(16,185,129,0.1)"; statusLabel = "Clocked in" }
              if (isDone) { statusColor = "#6D5DF6"; statusBg = "rgba(109,93,246,0.1)"; statusLabel = "Done" }

              return (
                <div key={m.id} className="flex items-center gap-4 px-5 py-3.5">
                  <div className="w-9 h-9 rounded-full flex items-center justify-center flex-shrink-0"
                    style={{ background: "rgba(109,93,246,0.12)" }}>
                    <span className="text-[12px] font-bold" style={{ color: "#6D5DF6" }}>{m.name[0]}</span>
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-[13px] font-semibold font-sans" style={{ color: "#E6EDF3" }}>{m.name}</p>
                    <p className="text-[11px] font-sans" style={{ color: "#6B7280" }}>#{m.employee_id}</p>
                  </div>
                  <div className="flex items-center gap-6 text-right">
                    <div>
                      <p className="text-[10px] uppercase tracking-wider font-sans mb-0.5" style={{ color: "#6B7280" }}>Clock In</p>
                      <p className="text-[13px] font-semibold font-sans" style={{ color: "#E6EDF3" }}>
                        {fmtTime(log?.clock_in ?? null)}
                      </p>
                    </div>
                    <div>
                      <p className="text-[10px] uppercase tracking-wider font-sans mb-0.5" style={{ color: "#6B7280" }}>Clock Out</p>
                      <p className="text-[13px] font-semibold font-sans" style={{ color: "#E6EDF3" }}>
                        {fmtTime(log?.clock_out ?? null)}
                      </p>
                    </div>
                    {dur && (
                      <div>
                        <p className="text-[10px] uppercase tracking-wider font-sans mb-0.5" style={{ color: "#6B7280" }}>Duration</p>
                        <p className="text-[13px] font-semibold font-sans" style={{ color: "#E6EDF3" }}>{dur}</p>
                      </div>
                    )}
                    <span className="text-[11px] font-semibold font-sans px-2.5 py-1 rounded-full min-w-[100px] text-center"
                      style={{ background: statusBg, color: statusColor }}>
                      {statusLabel}
                    </span>
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </div>
    </div>
  )
}
