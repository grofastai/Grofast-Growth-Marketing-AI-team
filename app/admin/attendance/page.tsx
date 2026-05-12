export const revalidate = 0

import { createServerClient } from "@/lib/supabase/server"
import { createClient } from "@supabase/supabase-js"
import Image from "next/image"
import Link from "next/link"
import {
  CalendarDays, Users, FileBarChart, ClipboardList,
  ArrowRight, Bell, Search, ChevronLeft, ChevronRight,
} from "lucide-react"
import AttendanceDateNav from "./attendance-date-nav"
import { AttendanceDonut, WeeklyTrendChart } from "./attendance-charts"

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
  const end  = clockOut ? new Date(clockOut) : new Date()
  const mins = Math.floor((end.getTime() - new Date(clockIn).getTime()) / 60000)
  if (mins < 60) return `${mins}m`
  return `${Math.floor(mins / 60)}h ${mins % 60}m`
}

const CARD: React.CSSProperties = {
  background: "#FFFFFF",
  borderRadius: 16,
  border: "1px solid #E5E7EB",
  boxShadow: "0 1px 3px rgba(0,0,0,0.05), 0 4px 12px rgba(0,0,0,0.04)",
}

export default async function AttendancePage({
  searchParams,
}: {
  searchParams: Promise<{ date?: string }>
}) {
  const params       = await searchParams
  const today        = new Date().toISOString().split("T")[0]
  const selectedDate = params.date ?? today
  const isToday      = selectedDate === today

  const supabase = await createServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return null

  const admin = adminSupabase()
  const { data: profile } = await admin
    .from("users").select("company_id, name").eq("id", user.id).single()
  if (!profile) return null
  const cid = profile.company_id as string

  // Weekly trend dates (last 7 days)
  const weekDates = Array.from({ length: 7 }, (_, i) => {
    const d = new Date()
    d.setDate(d.getDate() - (6 - i))
    return d.toISOString().split("T")[0]
  })
  const weekStart = weekDates[0]

  const lateThreshold = `${selectedDate}T04:30:00.000Z`

  const [{ data: members }, { data: logs }, { data: lateLogs }, { data: weeklyRaw }] = await Promise.all([
    admin.from("users").select("id, name, employee_id")
      .eq("company_id", cid).eq("role", "MEMBER").eq("status", "active").order("name"),
    admin.from("attendance_logs")
      .select("user_id, clock_in, clock_out, status")
      .eq("company_id", cid).eq("date", selectedDate),
    admin.from("attendance_logs")
      .select("user_id, clock_in")
      .eq("company_id", cid).eq("date", selectedDate)
      .not("clock_in", "is", null).gt("clock_in", lateThreshold).order("clock_in"),
    admin.from("attendance_logs")
      .select("date, user_id").eq("company_id", cid)
      .gte("date", weekStart).lte("date", today).not("clock_in", "is", null),
  ])

  type Log     = { user_id: string; clock_in: string | null; clock_out: string | null; status: string }
  type LateLog = { user_id: string; clock_in: string }

  const logMap = new Map<string, Log>()
  for (const l of (logs ?? []) as Log[]) logMap.set(l.user_id, l)

  const memberMap    = new Map((members ?? []).map(m => [m.id, m]))
  const lateEntries  = (lateLogs ?? [] as LateLog[]).map(l => ({ ...l, member: memberMap.get(l.user_id) })).filter(l => l.member)
  const totalMembers = (members ?? []).length
  const presentCount = (members ?? []).filter(m => { const l = logMap.get(m.id); return l?.clock_in || l?.status === "present" }).length
  const absentCount  = (members ?? []).filter(m => logMap.get(m.id)?.status === "absent" && !logMap.get(m.id)?.clock_in).length
  const notLogged    = (members ?? []).filter(m => !logMap.has(m.id)).length

  // Weekly trend
  const weekCountMap: Record<string, number> = {}
  for (const row of (weeklyRaw ?? [])) weekCountMap[(row as { date: string }).date] = (weekCountMap[(row as { date: string }).date] ?? 0) + 1
  const weeklyData = weekDates.map(date => ({
    day: new Date(date + "T12:00:00").toLocaleDateString("en-US", { weekday: "short" }),
    count: weekCountMap[date] ?? 0,
  }))

  const now      = new Date()
  const hour     = now.getHours()
  const greeting = hour < 12 ? "Good morning" : hour < 18 ? "Good afternoon" : "Good evening"
  const adminName = profile?.name ?? "Admin"
  const firstName = adminName.split(" ")[0]

  const displayDate = new Date(selectedDate + "T12:00:00Z").toLocaleDateString("en-IN", {
    day: "numeric", month: "long", year: "numeric",
  })

  const presentPct = totalMembers > 0 ? Math.round((presentCount / totalMembers) * 100) : 0
  const absentPct  = totalMembers > 0 ? Math.round((absentCount  / totalMembers) * 100) : 0
  const notLogPct  = totalMembers > 0 ? Math.round((notLogged    / totalMembers) * 100) : 0

  const statCards = [
    {
      label: "Present Today", value: presentCount,
      img: "/brand/attendance-admin.png",
      bg: "#FFF1F2", border: "rgba(222,26,26,0.15)",
      accent: "#DE1A1A", trendColor: "#16A34A",
      sub: `${presentPct}% of team`, subUp: true,
    },
    {
      label: "Absent Today", value: absentCount,
      img: "/brand/absent-girl.png",
      bg: "#F0FFF4", border: "rgba(22,163,74,0.15)",
      accent: "#16A34A", trendColor: absentPct === 0 ? "#16A34A" : "#DE1A1A",
      sub: `${absentPct}% of team`, subUp: false,
    },
    {
      label: "Not Logged In", value: notLogged,
      img: "/brand/team-admin.png",
      bg: "#FFFBEB", border: "rgba(217,119,6,0.15)",
      accent: "#D97706", trendColor: notLogPct === 0 ? "#16A34A" : "#D97706",
      sub: `${notLogPct}% of team`, subUp: false,
    },
    {
      label: "Total Members", value: totalMembers,
      img: "/brand/team-group.png",
      bg: "#F5F3FF", border: "rgba(124,58,237,0.15)",
      accent: "#7C3AED", trendColor: "#7C3AED",
      sub: "Team Size", subUp: null,
    },
  ]

  const quickActions = [
    { label: "Mark Attendance",    href: "/admin/attendance",  icon: CalendarDays, color: "#16A34A", bg: "rgba(22,163,74,0.08)"   },
    { label: "Request Leave",      href: "/admin/leaves",      icon: ClipboardList, color: "#D97706", bg: "rgba(217,119,6,0.08)"  },
    { label: "Attendance Report",  href: "/admin/reports",     icon: FileBarChart,  color: "#7C3AED", bg: "rgba(124,58,237,0.08)" },
    { label: "Team Overview",      href: "/admin/team",        icon: Users,         color: "#0EA5E9", bg: "rgba(14,165,233,0.08)" },
  ]

  return (
    <div style={{ background: "#F5F6FA", minHeight: "100vh" }} className="p-4 lg:p-6 space-y-4">

      {/* ── Page Header ─────────────────────────────────── */}
      <div style={{ ...CARD, padding: "16px 22px", display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: 12 }}>
        <div>
          <h1 style={{ fontSize: 20, fontWeight: 900, color: "#111827", margin: 0 }}>
            {greeting}, <span style={{ color: "#DE1A1A" }}>{firstName}!</span> 👋
          </h1>
          <p style={{ fontSize: 12, color: "#6B7280", margin: "3px 0 0" }}>Here&apos;s what&apos;s happening with your team today.</p>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
          <AttendanceDateNav selectedDate={selectedDate} today={today} />
          <div style={{ position: "relative", width: 34, height: 34, borderRadius: 10, background: "#F9FAFB", border: "1px solid #E5E7EB", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
            <Bell size={14} style={{ color: "#6B7280" }} />
          </div>
          <div style={{ width: 34, height: 34, borderRadius: 10, background: "rgba(222,26,26,0.1)", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
            <span style={{ fontSize: 13, fontWeight: 800, color: "#DE1A1A" }}>{(adminName[0] ?? "A").toUpperCase()}</span>
          </div>
        </div>
      </div>

      {/* ── 4 Stat Cards ────────────────────────────────── */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        {statCards.map(s => (
          <div key={s.label} style={{ borderRadius: 18, border: `1px solid ${s.border}`, background: s.bg, padding: "20px 18px 20px 22px", overflow: "hidden", position: "relative", minHeight: 175, boxShadow: "0 1px 4px rgba(0,0,0,0.05)", display: "flex", alignItems: "flex-start" }}>
            {/* Character illustration — large, right side */}
            <div style={{ position: "absolute", right: 0, bottom: 0, width: 210, height: 185, pointerEvents: "none" }}>
              <Image src={s.img} alt={s.label} fill style={{ objectFit: "contain", objectPosition: "right bottom" }} />
            </div>
            {/* Text content — left ~55% so it never overlaps character */}
            <div style={{ position: "relative", zIndex: 1, maxWidth: "52%" }}>
              <div style={{ width: 36, height: 36, borderRadius: 10, background: `${s.accent}1A`, display: "flex", alignItems: "center", justifyContent: "center", marginBottom: 12 }}>
                <CalendarDays size={16} style={{ color: s.accent }} />
              </div>
              <p style={{ fontSize: 12, color: "#6B7280", fontWeight: 600, margin: "0 0 4px" }}>{s.label}</p>
              <p style={{ fontSize: 40, fontWeight: 900, color: "#111827", margin: "0 0 6px", lineHeight: 1, fontFamily: "var(--font-jakarta)" }}>{s.value}</p>
              <div style={{ display: "flex", alignItems: "center", gap: 3 }}>
                {s.subUp !== null && <span style={{ fontSize: 11, fontWeight: 800, color: s.trendColor }}>{s.subUp ? "↑" : "↓"}</span>}
                {s.subUp === null  && <Users size={10} style={{ color: s.trendColor }} />}
                <span style={{ fontSize: 11, fontWeight: 600, color: s.trendColor }}>{s.sub}</span>
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* ── Main 2-col Layout ────────────────────────────── */}
      <div className="grid grid-cols-1 lg:grid-cols-[1fr_340px] gap-4 items-start">

        {/* ── Left: Attendance Table ───────────────────── */}
        <div style={{ ...CARD, overflow: "hidden" }}>
          <div style={{ padding: "16px 20px", borderBottom: "1px solid #F3F4F6", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
            <h2 style={{ fontSize: 14, fontWeight: 800, color: "#111827", margin: 0 }}>
              Team Attendance — {isToday ? "Today" : displayDate}
            </h2>
            <span style={{ fontSize: 11, color: "#6B7280" }}>{displayDate}</span>
          </div>

          {/* Column headers */}
          <div style={{ display: "grid", gridTemplateColumns: "1fr 110px 110px 90px 100px", gap: 0, padding: "10px 20px", borderBottom: "1px solid #F3F4F6" }}>
            {["EMPLOYEE", "CLOCK IN", "CLOCK OUT", "DURATION", "STATUS"].map(h => (
              <span key={h} style={{ fontSize: 10, fontWeight: 700, color: "#9CA3AF", letterSpacing: "0.06em" }}>{h}</span>
            ))}
          </div>

          {/* Rows */}
          {!members || members.length === 0 ? (
            <div style={{ display: "flex", flexDirection: "column", alignItems: "center", padding: "48px 0", gap: 8 }}>
              <Users size={28} style={{ color: "#E5E7EB" }} />
              <p style={{ fontSize: 13, color: "#6B7280", margin: 0 }}>No team members found</p>
            </div>
          ) : (
            <div>
              {(members ?? []).map(m => {
                const log       = logMap.get(m.id)
                const isAbsent  = log?.status === "absent" && !log?.clock_in
                const isWorking = !!(log?.clock_in && !log?.clock_out)
                const isDone    = !!(log?.clock_in && log?.clock_out)
                const dur       = calcDuration(log?.clock_in ?? null, log?.clock_out ?? null)

                let statusLabel = "Not logged"; let statusColor = "#6B7280"; let statusBg = "rgba(0,0,0,0.05)"
                if (isAbsent)  { statusLabel = "Absent";  statusColor = "#DE1A1A"; statusBg = "rgba(222,26,26,0.08)" }
                if (isWorking) { statusLabel = "Working"; statusColor = "#16A34A"; statusBg = "rgba(22,163,74,0.08)" }
                if (isDone)    { statusLabel = "Done";    statusColor = "#2563EB"; statusBg = "rgba(37,99,235,0.08)" }

                return (
                  <div key={m.id} style={{ display: "grid", gridTemplateColumns: "1fr 110px 110px 90px 100px", gap: 0, padding: "12px 20px", borderBottom: "1px solid #F9FAFB", alignItems: "center" }}>
                    {/* Employee */}
                    <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                      <div style={{ width: 34, height: 34, borderRadius: 10, background: "rgba(222,26,26,0.08)", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                        <span style={{ fontSize: 12, fontWeight: 800, color: "#DE1A1A" }}>{m.name[0].toUpperCase()}</span>
                      </div>
                      <div>
                        <p style={{ fontSize: 13, fontWeight: 700, color: "#111827", margin: 0 }}>{m.name}</p>
                        <p style={{ fontSize: 11, color: "#9CA3AF", margin: 0 }}>#{m.employee_id}</p>
                      </div>
                    </div>
                    {/* Clock In */}
                    <div style={{ display: "flex", alignItems: "center", gap: 5 }}>
                      {log?.clock_in && <span style={{ width: 6, height: 6, borderRadius: "50%", background: "#16A34A", flexShrink: 0 }} />}
                      <span style={{ fontSize: 12, fontWeight: 600, color: "#374151" }}>{fmtTime(log?.clock_in ?? null)}</span>
                    </div>
                    {/* Clock Out */}
                    <span style={{ fontSize: 12, fontWeight: 600, color: "#374151" }}>{fmtTime(log?.clock_out ?? null)}</span>
                    {/* Duration */}
                    <span style={{ fontSize: 12, fontWeight: 600, color: "#374151" }}>{dur ?? "—"}</span>
                    {/* Status */}
                    <span style={{ fontSize: 11, fontWeight: 700, padding: "4px 10px", borderRadius: 8, background: statusBg, color: statusColor, display: "inline-block", textAlign: "center" }}>
                      {statusLabel}
                    </span>
                  </div>
                )
              })}
            </div>
          )}

          {/* Footer link */}
          <div style={{ padding: "14px 20px", borderTop: "1px solid #F3F4F6", textAlign: "center" }}>
            <Link href="/admin/reports" style={{ fontSize: 13, fontWeight: 700, color: "#DE1A1A", textDecoration: "none", display: "inline-flex", alignItems: "center", gap: 5 }}>
              View full attendance log <ArrowRight size={13} />
            </Link>
          </div>
        </div>

        {/* ── Right: Overview + Trend + Quick Actions ──── */}
        <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>

          {/* Attendance Overview */}
          <div style={{ ...CARD, padding: 20 }}>
            <h3 style={{ fontSize: 14, fontWeight: 800, color: "#111827", margin: "0 0 16px" }}>Attendance Overview</h3>
            <AttendanceDonut present={presentCount} notLogged={notLogged} absent={absentCount} total={totalMembers} />
          </div>

          {/* Weekly Trend */}
          <div style={{ ...CARD, padding: 20 }}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 14 }}>
              <h3 style={{ fontSize: 14, fontWeight: 800, color: "#111827", margin: 0 }}>Weekly Trend</h3>
              <span style={{ fontSize: 11, fontWeight: 600, color: "#6B7280", background: "#F9FAFB", border: "1px solid #E5E7EB", borderRadius: 8, padding: "3px 10px" }}>This Week</span>
            </div>
            <WeeklyTrendChart data={weeklyData} />
          </div>

          {/* Quick Actions */}
          <div style={{ ...CARD, padding: 20 }}>
            <h3 style={{ fontSize: 14, fontWeight: 800, color: "#111827", margin: "0 0 14px" }}>Quick Actions</h3>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
              {quickActions.map(a => {
                const Icon = a.icon
                return (
                  <Link key={a.label} href={a.href}
                    style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 6, padding: "14px 8px", borderRadius: 12, background: a.bg, textDecoration: "none" }}
                    className="hover:opacity-80 transition-opacity">
                    <Icon size={18} style={{ color: a.color }} />
                    <span style={{ fontSize: 10, fontWeight: 700, color: a.color, textAlign: "center", lineHeight: 1.3 }}>{a.label}</span>
                  </Link>
                )
              })}
            </div>
          </div>
        </div>
      </div>

      {/* ── Late Arrivals Banner ─────────────────────────── */}
      <div style={{ borderRadius: 16, overflow: "hidden", border: "1px solid rgba(222,26,26,0.15)", boxShadow: "0 1px 3px rgba(0,0,0,0.04)" }}>
        <div style={{ background: "#FFF1F2", padding: "16px 20px", display: "flex", alignItems: "center", gap: 6, borderBottom: lateEntries.length > 0 ? "1px solid rgba(222,26,26,0.1)" : "none" }}>
          <h3 style={{ fontSize: 14, fontWeight: 800, color: "#111827", margin: 0 }}>Late Arrivals</h3>
          <span style={{ fontSize: 12, fontWeight: 800, color: lateEntries.length > 0 ? "#DE1A1A" : "#16A34A", background: lateEntries.length > 0 ? "rgba(222,26,26,0.12)" : "rgba(22,163,74,0.1)", padding: "1px 8px", borderRadius: 99 }}>
            {lateEntries.length}
          </span>
          <span style={{ fontSize: 11, color: "#6B7280", marginLeft: 4 }}>After 10:00 AM</span>
        </div>

        {lateEntries.length === 0 ? (
          <div style={{ background: "#FFF1F2", display: "flex", alignItems: "center", gap: 20, padding: "16px 24px" }}>
            <div style={{ position: "relative", width: 130, height: 130, flexShrink: 0 }}>
              <Image src="/brand/no-time.png" alt="On time" fill style={{ objectFit: "contain" }} />
            </div>
            <div>
              <p style={{ fontSize: 16, fontWeight: 800, color: "#111827", margin: "0 0 4px" }}>All on time today! 🎉</p>
              <p style={{ fontSize: 12, color: "#6B7280", margin: 0 }}>No one clocked in after 10:00 AM</p>
            </div>
          </div>
        ) : (
          <div style={{ background: "#FFFFFF" }}>
            {lateEntries.map(entry => {
              const clockInIST = new Date(entry.clock_in).toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit", hour12: true, timeZone: "Asia/Kolkata" })
              const lateByMs   = new Date(entry.clock_in).getTime() - new Date(lateThreshold).getTime()
              const lateByMins = Math.floor(lateByMs / 60000)
              const lateStr    = lateByMins >= 60 ? `${Math.floor(lateByMins / 60)}h ${lateByMins % 60}m late` : `${lateByMins}m late`
              return (
                <div key={entry.user_id} style={{ display: "flex", alignItems: "center", gap: 14, padding: "12px 20px", borderBottom: "1px solid #F9FAFB" }}>
                  <div style={{ width: 34, height: 34, borderRadius: "50%", background: "rgba(245,158,11,0.1)", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                    <span style={{ fontSize: 12, fontWeight: 800, color: "#D97706" }}>{entry.member!.name[0]}</span>
                  </div>
                  <div style={{ flex: 1 }}>
                    <p style={{ fontSize: 13, fontWeight: 700, color: "#111827", margin: 0 }}>{entry.member!.name}</p>
                    <p style={{ fontSize: 11, color: "#9CA3AF", margin: 0 }}>#{entry.member!.employee_id}</p>
                  </div>
                  <span style={{ fontSize: 12, fontWeight: 600, color: "#374151" }}>{clockInIST}</span>
                  <span style={{ fontSize: 11, fontWeight: 700, padding: "3px 10px", borderRadius: 8, background: "rgba(245,158,11,0.1)", color: "#D97706" }}>{lateStr}</span>
                </div>
              )
            })}
          </div>
        )}
      </div>

    </div>
  )
}
