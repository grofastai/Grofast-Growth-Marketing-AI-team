export const revalidate = 0

import { createServerClient } from "@/lib/supabase/server"
import { createClient } from "@supabase/supabase-js"
import { Clock, LogIn, LogOut, Users, AlertTriangle } from "lucide-react"

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

  // 10:00 AM IST = 04:30 AM UTC
  const lateThreshold = `${today}T04:30:00.000Z`

  const [{ data: members }, { data: logs }, { data: lateLogs }] = await Promise.all([
    admin.from("users").select("id, name, employee_id").eq("company_id", profile.company_id).eq("role", "MEMBER").order("name"),
    admin.from("attendance_logs").select("user_id, clock_in, clock_out").eq("company_id", profile.company_id).eq("date", today),
    admin.from("attendance_logs")
      .select("user_id, clock_in")
      .eq("company_id", profile.company_id)
      .eq("date", today)
      .not("clock_in", "is", null)
      .gt("clock_in", lateThreshold)
      .order("clock_in"),
  ])

  type Log = { user_id: string; clock_in: string | null; clock_out: string | null }
  const logMap = new Map<string, Log>()
  for (const l of (logs ?? []) as Log[]) logMap.set(l.user_id, l)

  type LateLog = { user_id: string; clock_in: string }
  const memberMap = new Map((members ?? []).map(m => [m.id, m]))
  const lateEntries = (lateLogs ?? [] as LateLog[]).map((l) => ({
    ...l,
    member: memberMap.get(l.user_id),
  })).filter(l => l.member)

  const clockedInNow = (members ?? []).filter((m) => { const l = logMap.get(m.id); return l?.clock_in && !l?.clock_out }).length
  const clockedOut   = (members ?? []).filter((m) => { const l = logMap.get(m.id); return l?.clock_in && l?.clock_out }).length
  const notClocked   = (members ?? []).filter((m) => !logMap.has(m.id)).length

  return (
    <div className="p-8 max-w-[1200px]">
      {/* Header */}
      <div className="flex items-start justify-between mb-6">
        <div>
          <h1 className="gradient-heading text-[30px] leading-tight font-black" style={{ fontFamily: "var(--font-jakarta)" }}>
            Attendance
          </h1>
          <p className="text-sm mt-1" style={{ color: "#9CA3AF" }}>{todayDisplay}</p>
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
                background: "#FFFFFF",
                border: s.lime ? "1px solid rgba(220,38,38,0.2)" : "1px solid #2A2A2A",
              }}>
              <div className="w-10 h-10 rounded-lg flex items-center justify-center"
                style={{ background: s.lime ? "rgba(220,38,38,0.08)" : "rgba(0,0,0,0.03)" }}>
                <Icon size={17} style={{ color: s.lime ? "#DC2626" : "#9CA3AF" }} />
              </div>
              <div>
                <p className="text-[32px] font-black leading-none" style={{ fontFamily: "var(--font-jakarta)", color: s.lime ? "#DC2626" : "#FFFFFF" }}>
                  {s.value}
                </p>
                <p className="text-[11px] font-medium mt-1" style={{ color: "#9CA3AF" }}>{s.label}</p>
              </div>
            </div>
          )
        })}
      </div>

      {/* Member table */}
      <div className="rounded-xl overflow-hidden" style={{ background: "#FFFFFF", border: "1px solid #2A2A2A" }}>
        <div className="px-5 py-4" style={{ borderBottom: "1px solid #2A2A2A" }}>
          <div className="flex items-center gap-2">
            <Clock size={14} style={{ color: "#DC2626" }} />
            <h3 className="text-[13px] font-bold" style={{ color: "#111111" }}>Team Attendance — Today</h3>
          </div>
        </div>

        {!members || members.length === 0 ? (
          <div className="flex flex-col items-center py-16 gap-2">
            <Users size={32} style={{ color: "#E5E7EB" }} />
            <p className="text-[13px]" style={{ color: "rgba(0,0,0,0.1)" }}>No team members found</p>
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
                    style={{ background: "rgba(220,38,38,0.08)" }}>
                    <span className="text-[11px] font-bold" style={{ color: "#DC2626" }}>{m.name[0]}</span>
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-[13px] font-semibold" style={{ color: "#111111" }}>{m.name}</p>
                    <p className="text-[11px]" style={{ color: "#9CA3AF" }}>#{m.employee_id}</p>
                  </div>
                  <div className="flex items-center gap-6 text-right">
                    <div>
                      <p className="text-[9px] uppercase tracking-wider font-bold mb-0.5" style={{ color: "rgba(0,0,0,0.1)" }}>Clock In</p>
                      <p className="text-[13px] font-semibold" style={{ color: "#111111" }}>{fmtTime(log?.clock_in ?? null)}</p>
                    </div>
                    <div>
                      <p className="text-[9px] uppercase tracking-wider font-bold mb-0.5" style={{ color: "rgba(0,0,0,0.1)" }}>Clock Out</p>
                      <p className="text-[13px] font-semibold" style={{ color: "#111111" }}>{fmtTime(log?.clock_out ?? null)}</p>
                    </div>
                    {dur && (
                      <div>
                        <p className="text-[9px] uppercase tracking-wider font-bold mb-0.5" style={{ color: "rgba(0,0,0,0.1)" }}>Duration</p>
                        <p className="text-[13px] font-semibold" style={{ color: "#111111" }}>{dur}</p>
                      </div>
                    )}
                    <span className="text-[10px] font-bold px-2.5 py-1 rounded-full min-w-[90px] text-center"
                      style={statusLime
                        ? { background: "rgba(220,38,38,0.1)", color: "#DC2626" }
                        : { background: "rgba(0,0,0,0.04)", color: "#9CA3AF" }
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

      {/* ── Late Arrivals ── */}
      <div className="mt-5 rounded-xl overflow-hidden" style={{ background: "#FFFFFF", border: "1px solid #2A2A2A" }}>
        <div className="px-5 py-4 flex items-center justify-between" style={{ borderBottom: "1px solid #2A2A2A" }}>
          <div className="flex items-center gap-2">
            <AlertTriangle size={14} style={{ color: "#F59E0B" }} />
            <h3 className="text-[13px] font-bold" style={{ color: "#111111" }}>Late Arrivals Today</h3>
            <span className="text-[10px] font-bold px-2 py-0.5 rounded-full ml-1"
              style={{ background: lateEntries.length > 0 ? "rgba(245,158,11,0.12)" : "rgba(0,0,0,0.04)", color: lateEntries.length > 0 ? "#F59E0B" : "#9CA3AF" }}>
              {lateEntries.length}
            </span>
          </div>
          <span className="text-[11px]" style={{ color: "#9CA3AF" }}>After 10:00 AM</span>
        </div>

        {lateEntries.length === 0 ? (
          <div className="flex flex-col items-center py-10 gap-1">
            <p className="text-[13px] font-semibold" style={{ color: "#10B981" }}>All on time today 🎉</p>
            <p className="text-[11px]" style={{ color: "#9CA3AF" }}>No one clocked in after 10:00 AM</p>
          </div>
        ) : (
          <div>
            {lateEntries.map((entry) => {
              const clockInIST = new Date(entry.clock_in).toLocaleTimeString("en-IN", {
                hour: "2-digit", minute: "2-digit", hour12: true, timeZone: "Asia/Kolkata",
              })
              const lateByMs = new Date(entry.clock_in).getTime() - new Date(`${today}T04:30:00.000Z`).getTime()
              const lateByMins = Math.floor(lateByMs / 60000)
              const lateStr = lateByMins >= 60
                ? `${Math.floor(lateByMins / 60)}h ${lateByMins % 60}m late`
                : `${lateByMins}m late`

              return (
                <div key={entry.user_id} className="flex items-center gap-4 px-5 py-3.5"
                  style={{ borderBottom: "1px solid rgba(255,255,255,0.04)" }}>
                  <div className="w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0"
                    style={{ background: "rgba(245,158,11,0.1)" }}>
                    <span className="text-[11px] font-bold" style={{ color: "#F59E0B" }}>
                      {entry.member!.name[0]}
                    </span>
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-[13px] font-semibold" style={{ color: "#111111" }}>{entry.member!.name}</p>
                    <p className="text-[11px]" style={{ color: "#9CA3AF" }}>#{entry.member!.employee_id}</p>
                  </div>
                  <div className="flex items-center gap-4 text-right">
                    <div>
                      <p className="text-[9px] uppercase tracking-wider font-bold mb-0.5" style={{ color: "rgba(0,0,0,0.1)" }}>Clock In</p>
                      <p className="text-[13px] font-bold" style={{ color: "#111111" }}>{clockInIST}</p>
                    </div>
                    <span className="text-[11px] font-bold px-3 py-1 rounded-lg"
                      style={{ background: "rgba(245,158,11,0.1)", color: "#F59E0B" }}>
                      {lateStr}
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
