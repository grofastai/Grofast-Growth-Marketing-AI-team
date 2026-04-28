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

  const clockedInNow = (members ?? []).filter((m) => { const l = logMap.get(m.id); return l?.clock_in && !l?.clock_out }).length
  const clockedOut   = (members ?? []).filter((m) => { const l = logMap.get(m.id); return l?.clock_in && l?.clock_out }).length
  const notClocked   = (members ?? []).filter((m) => !logMap.has(m.id)).length

  return (
    <div className="p-8 max-w-[1200px]">
      {/* Header */}
      <div className="flex items-start justify-between mb-6">
        <div>
          <h1 className="text-[30px] leading-tight font-black" style={{ fontFamily: "var(--font-jakarta)", color: "#FFFFFF" }}>
            Attendance
          </h1>
          <p className="text-sm mt-1" style={{ color: "rgba(255,255,255,0.35)" }}>{todayDisplay}</p>
        </div>
      </div>

      {/* Summary chips */}
      <div className="grid grid-cols-3 gap-3 mb-5">
        {[
          { label: "Clocked In Now",  value: clockedInNow, icon: LogIn,  lime: true },
          { label: "Clocked Out",     value: clockedOut,   icon: LogOut, lime: false },
          { label: "Not Clocked In",  value: notClocked,   icon: Users,  lime: false },
        ].map((s) => {
          const Icon = s.icon
          return (
            <div key={s.label} className="rounded-xl p-5 flex items-center gap-4"
              style={{
                background: "#262626",
                border: s.lime ? "1px solid rgba(163,230,53,0.2)" : "1px solid #2A2A2A",
              }}>
              <div className="w-10 h-10 rounded-lg flex items-center justify-center"
                style={{ background: s.lime ? "rgba(163,230,53,0.08)" : "rgba(255,255,255,0.04)" }}>
                <Icon size={17} style={{ color: s.lime ? "#A3E635" : "rgba(255,255,255,0.35)" }} />
              </div>
              <div>
                <p className="text-[32px] font-black leading-none" style={{ fontFamily: "var(--font-jakarta)", color: s.lime ? "#A3E635" : "#FFFFFF" }}>
                  {s.value}
                </p>
                <p className="text-[11px] font-medium mt-1" style={{ color: "rgba(255,255,255,0.35)" }}>{s.label}</p>
              </div>
            </div>
          )
        })}
      </div>

      {/* Member table */}
      <div className="rounded-xl overflow-hidden" style={{ background: "#262626", border: "1px solid #2A2A2A" }}>
        <div className="px-5 py-4" style={{ borderBottom: "1px solid #2A2A2A" }}>
          <div className="flex items-center gap-2">
            <Clock size={14} style={{ color: "#A3E635" }} />
            <h3 className="text-[13px] font-bold" style={{ color: "#FFFFFF" }}>Team Attendance — Today</h3>
          </div>
        </div>

        {!members || members.length === 0 ? (
          <div className="flex flex-col items-center py-16 gap-2">
            <Users size={32} style={{ color: "#2A2A2A" }} />
            <p className="text-[13px]" style={{ color: "rgba(255,255,255,0.2)" }}>No team members found</p>
          </div>
        ) : (
          <div>
            {(members ?? []).map((m) => {
              const log = logMap.get(m.id)
              const isIn  = !!(log?.clock_in && !log?.clock_out)
              const isDone = !!(log?.clock_in && log?.clock_out)
              const dur = calcDuration(log?.clock_in ?? null, log?.clock_out ?? null)

              let statusLabel = "Not clocked in"
              let statusLime = false
              if (isIn)   { statusLabel = "Working";  statusLime = true }
              if (isDone) { statusLabel = "Done" }

              return (
                <div key={m.id} className="flex items-center gap-4 px-5 py-3.5"
                  style={{ borderBottom: "1px solid rgba(255,255,255,0.04)" }}>
                  <div className="w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0"
                    style={{ background: "rgba(163,230,53,0.08)" }}>
                    <span className="text-[11px] font-bold" style={{ color: "#A3E635" }}>{m.name[0]}</span>
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-[13px] font-semibold" style={{ color: "#FFFFFF" }}>{m.name}</p>
                    <p className="text-[11px]" style={{ color: "rgba(255,255,255,0.3)" }}>#{m.employee_id}</p>
                  </div>
                  <div className="flex items-center gap-6 text-right">
                    <div>
                      <p className="text-[9px] uppercase tracking-wider font-bold mb-0.5" style={{ color: "rgba(255,255,255,0.2)" }}>Clock In</p>
                      <p className="text-[13px] font-semibold" style={{ color: "#FFFFFF" }}>{fmtTime(log?.clock_in ?? null)}</p>
                    </div>
                    <div>
                      <p className="text-[9px] uppercase tracking-wider font-bold mb-0.5" style={{ color: "rgba(255,255,255,0.2)" }}>Clock Out</p>
                      <p className="text-[13px] font-semibold" style={{ color: "#FFFFFF" }}>{fmtTime(log?.clock_out ?? null)}</p>
                    </div>
                    {dur && (
                      <div>
                        <p className="text-[9px] uppercase tracking-wider font-bold mb-0.5" style={{ color: "rgba(255,255,255,0.2)" }}>Duration</p>
                        <p className="text-[13px] font-semibold" style={{ color: "#FFFFFF" }}>{dur}</p>
                      </div>
                    )}
                    <span className="text-[10px] font-bold px-2.5 py-1 rounded-full min-w-[90px] text-center"
                      style={statusLime
                        ? { background: "rgba(163,230,53,0.1)", color: "#A3E635" }
                        : { background: "rgba(255,255,255,0.05)", color: "rgba(255,255,255,0.4)" }
                      }>
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
