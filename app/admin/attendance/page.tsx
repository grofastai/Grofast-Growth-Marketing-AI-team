export const revalidate = 0

import { createServerClient } from "@/lib/supabase/server"
import { createClient } from "@supabase/supabase-js"
import { Clock, LogIn, LogOut, Users, AlertTriangle } from "lucide-react"
import AttendanceDateNav from "./attendance-date-nav"

function adminSupabase() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  )
}

function fmtTime(iso: string | null) {
  if (!iso) return "—"
  return new Date(iso).toLocaleTimeString("en-IN", {
    hour: "2-digit", minute: "2-digit", hour12: true, timeZone: "Asia/Kolkata",
  })
}

function calcDuration(clockIn: string | null, clockOut: string | null) {
  if (!clockIn) return null
  const end = clockOut ? new Date(clockOut) : new Date()
  const mins = Math.floor((end.getTime() - new Date(clockIn).getTime()) / 60000)
  if (mins < 60) return `${mins}m`
  return `${Math.floor(mins / 60)}h ${mins % 60}m`
}


export default async function AttendancePage({
  searchParams,
}: {
  searchParams: Promise<{ date?: string }>
}) {
  const params = await searchParams
  const today  = new Date().toISOString().split("T")[0]
  const selectedDate = params.date ?? today
  const isToday = selectedDate === today

  const supabase = await createServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return null

  const admin = adminSupabase()
  const { data: profile } = await admin.from("users").select("company_id").eq("id", user.id).single()
  if (!profile) return null

  // 10:00 AM IST = 04:30 AM UTC
  const lateThreshold = `${selectedDate}T04:30:00.000Z`

  const [{ data: members }, { data: logs }, { data: lateLogs }] = await Promise.all([
    admin.from("users").select("id, name, employee_id").eq("company_id", profile.company_id).eq("role", "MEMBER").order("name"),
    admin.from("attendance_logs")
      .select("user_id, clock_in, clock_out, status")
      .eq("company_id", profile.company_id)
      .eq("date", selectedDate),
    admin.from("attendance_logs")
      .select("user_id, clock_in")
      .eq("company_id", profile.company_id)
      .eq("date", selectedDate)
      .not("clock_in", "is", null)
      .gt("clock_in", lateThreshold)
      .order("clock_in"),
  ])

  type Log = { user_id: string; clock_in: string | null; clock_out: string | null; status: string }
  const logMap = new Map<string, Log>()
  for (const l of (logs ?? []) as Log[]) logMap.set(l.user_id, l)

  type LateLog = { user_id: string; clock_in: string }
  const memberMap = new Map((members ?? []).map(m => [m.id, m]))
  const lateEntries = (lateLogs ?? [] as LateLog[]).map((l) => ({
    ...l,
    member: memberMap.get(l.user_id),
  })).filter(l => l.member)

  const presentCount = (members ?? []).filter((m) => {
    const l = logMap.get(m.id)
    return l?.status === "present" || l?.clock_in
  }).length
  const absentCount  = (members ?? []).filter((m) => logMap.get(m.id)?.status === "absent").length
  const notLogged    = (members ?? []).filter((m) => !logMap.has(m.id)).length

  const displayDate = new Date(selectedDate + "T12:00:00Z").toLocaleDateString("en-US", {
    weekday: "long", day: "numeric", month: "long", year: "numeric",
  })

  return (
    <div className="p-8 max-w-[1200px]">
      {/* Header */}
      <div className="flex items-start justify-between mb-6">
        <div>
          <h1 className="gradient-heading text-[30px] leading-tight font-black" style={{ fontFamily: "var(--font-jakarta)" }}>
            Attendance
          </h1>
          <p className="text-sm mt-1" style={{ color: "#83858c" }}>{displayDate}</p>
        </div>

        <AttendanceDateNav selectedDate={selectedDate} today={today} />
      </div>

      {/* Summary chips */}
      <div className="grid grid-cols-3 gap-3 mb-5">
        {[
          { label: "Present",       value: presentCount, icon: LogIn,  highlight: true },
          { label: "Absent",        value: absentCount,  icon: LogOut, highlight: false },
          { label: "Not Logged",    value: notLogged,    icon: Users,  highlight: false },
        ].map((s) => {
          const Icon = s.icon
          return (
            <div key={s.label} className="rounded-xl p-5 flex items-center gap-4"
              style={{
                background: "#FFFFFF",
                border: s.highlight ? "1px solid rgba(222,26,26,0.2)" : "1px solid #F0F0F0",
                boxShadow: "0 1px 3px rgba(0,0,0,0.06)",
              }}>
              <div className="w-10 h-10 rounded-lg flex items-center justify-center"
                style={{ background: s.highlight ? "rgba(222,26,26,0.08)" : "rgba(0,0,0,0.03)" }}>
                <Icon size={17} style={{ color: s.highlight ? "#de1a1a" : "#83858c" }} />
              </div>
              <div>
                <p className="text-[32px] font-black leading-none" style={{ fontFamily: "var(--font-jakarta)", color: s.highlight ? "#de1a1a" : "#111827" }}>
                  {s.value}
                </p>
                <p className="text-[11px] font-medium mt-1" style={{ color: "#83858c" }}>{s.label}</p>
              </div>
            </div>
          )
        })}
      </div>

      {/* Member table */}
      <div className="rounded-xl overflow-hidden" style={{ background: "#FFFFFF", border: "1px solid #F0F0F0", boxShadow: "0 1px 3px rgba(0,0,0,0.06)" }}>
        <div className="px-5 py-4" style={{ borderBottom: "1px solid #F0F0F0" }}>
          <div className="flex items-center gap-2">
            <Clock size={14} style={{ color: "#de1a1a" }} />
            <h3 className="text-[13px] font-bold" style={{ color: "#111827" }}>
              Team Attendance — {isToday ? "Today" : displayDate}
            </h3>
          </div>
        </div>

        {!members || members.length === 0 ? (
          <div className="flex flex-col items-center py-16 gap-2">
            <Users size={32} style={{ color: "#E5E7EB" }} />
            <p className="text-[13px]" style={{ color: "#83858c" }}>No team members found</p>
          </div>
        ) : (
          <div>
            {(members ?? []).map((m) => {
              const log = logMap.get(m.id)
              const isPresent = !!(log?.clock_in) || log?.status === "present"
              const isAbsent  = log?.status === "absent" && !log?.clock_in
              const isDone    = !!(log?.clock_in && log?.clock_out)
              const isWorking = !!(log?.clock_in && !log?.clock_out)
              const dur = calcDuration(log?.clock_in ?? null, log?.clock_out ?? null)

              let statusLabel = "Not logged"
              let statusColor = "#83858c"
              let statusBg    = "rgba(0,0,0,0.04)"
              if (isAbsent)  { statusLabel = "Absent";  statusColor = "#de1a1a"; statusBg = "rgba(222,26,26,0.08)" }
              if (isWorking) { statusLabel = "Working"; statusColor = "#16A34A"; statusBg = "rgba(22,163,74,0.1)" }
              if (isDone)    { statusLabel = "Done";    statusColor = "#2563EB"; statusBg = "rgba(37,99,235,0.08)" }

              return (
                <div key={m.id} className="flex items-center gap-4 px-5 py-3.5"
                  style={{ borderBottom: "1px solid #F9FAFB" }}>
                  <div className="w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0"
                    style={{ background: "rgba(222,26,26,0.08)" }}>
                    <span className="text-[11px] font-bold" style={{ color: "#de1a1a" }}>{m.name[0]}</span>
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-[13px] font-semibold" style={{ color: "#111827" }}>{m.name}</p>
                    <p className="text-[11px]" style={{ color: "#83858c" }}>#{m.employee_id}</p>
                  </div>
                  <div className="flex items-center gap-6 text-right">
                    <div>
                      <p className="text-[9px] uppercase tracking-wider font-bold mb-0.5" style={{ color: "#D1D5DB" }}>Clock In</p>
                      <p className="text-[13px] font-semibold" style={{ color: "#111827" }}>{fmtTime(log?.clock_in ?? null)}</p>
                    </div>
                    <div>
                      <p className="text-[9px] uppercase tracking-wider font-bold mb-0.5" style={{ color: "#D1D5DB" }}>Clock Out</p>
                      <p className="text-[13px] font-semibold" style={{ color: "#111827" }}>{fmtTime(log?.clock_out ?? null)}</p>
                    </div>
                    {dur && (
                      <div>
                        <p className="text-[9px] uppercase tracking-wider font-bold mb-0.5" style={{ color: "#D1D5DB" }}>Duration</p>
                        <p className="text-[13px] font-semibold" style={{ color: "#111827" }}>{dur}</p>
                      </div>
                    )}
                    <span className="text-[10px] font-bold px-2.5 py-1 rounded-full min-w-[80px] text-center"
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

      {/* Late Arrivals */}
      <div className="mt-5 rounded-xl overflow-hidden" style={{ background: "#FFFFFF", border: "1px solid #F0F0F0", boxShadow: "0 1px 3px rgba(0,0,0,0.06)" }}>
        <div className="px-5 py-4 flex items-center justify-between" style={{ borderBottom: "1px solid #F0F0F0" }}>
          <div className="flex items-center gap-2">
            <AlertTriangle size={14} style={{ color: "#F59E0B" }} />
            <h3 className="text-[13px] font-bold" style={{ color: "#111827" }}>Late Arrivals</h3>
            <span className="text-[10px] font-bold px-2 py-0.5 rounded-full ml-1"
              style={{ background: lateEntries.length > 0 ? "rgba(245,158,11,0.12)" : "rgba(0,0,0,0.04)", color: lateEntries.length > 0 ? "#F59E0B" : "#83858c" }}>
              {lateEntries.length}
            </span>
          </div>
          <span className="text-[11px]" style={{ color: "#83858c" }}>After 10:00 AM</span>
        </div>

        {lateEntries.length === 0 ? (
          <div className="flex flex-col items-center py-10 gap-1">
            <p className="text-[13px] font-semibold" style={{ color: "#10B981" }}>All on time 🎉</p>
            <p className="text-[11px]" style={{ color: "#83858c" }}>No one clocked in after 10:00 AM</p>
          </div>
        ) : (
          <div>
            {lateEntries.map((entry) => {
              const clockInIST = new Date(entry.clock_in).toLocaleTimeString("en-IN", {
                hour: "2-digit", minute: "2-digit", hour12: true, timeZone: "Asia/Kolkata",
              })
              const lateByMs   = new Date(entry.clock_in).getTime() - new Date(lateThreshold).getTime()
              const lateByMins = Math.floor(lateByMs / 60000)
              const lateStr    = lateByMins >= 60
                ? `${Math.floor(lateByMins / 60)}h ${lateByMins % 60}m late`
                : `${lateByMins}m late`

              return (
                <div key={entry.user_id} className="flex items-center gap-4 px-5 py-3.5"
                  style={{ borderBottom: "1px solid #F9FAFB" }}>
                  <div className="w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0"
                    style={{ background: "rgba(245,158,11,0.1)" }}>
                    <span className="text-[11px] font-bold" style={{ color: "#F59E0B" }}>
                      {entry.member!.name[0]}
                    </span>
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-[13px] font-semibold" style={{ color: "#111827" }}>{entry.member!.name}</p>
                    <p className="text-[11px]" style={{ color: "#83858c" }}>#{entry.member!.employee_id}</p>
                  </div>
                  <div className="flex items-center gap-4 text-right">
                    <div>
                      <p className="text-[9px] uppercase tracking-wider font-bold mb-0.5" style={{ color: "#D1D5DB" }}>Clock In</p>
                      <p className="text-[13px] font-bold" style={{ color: "#111827" }}>{clockInIST}</p>
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
