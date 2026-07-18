export const revalidate = 0

import { createServerClient } from "@/lib/supabase/server"
import { createClient } from "@supabase/supabase-js"
import Image from "next/image"
import Link from "next/link"
import {
  Users,
  ArrowRight, Clock, TrendingUp, CheckCircle2, XCircle,
  AlertCircle, Sparkles, UserCheck, BarChart3,
} from "lucide-react"
import AttendanceDateNav from "./attendance-date-nav"
import { AttendanceDonut, WeeklyTrendChart } from "./attendance-charts"
import ClearAttendanceBtn from "./clear-attendance-btn"
import { todayIST } from "@/lib/utils/ist-date"

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

export default async function AttendancePage({
  searchParams,
}: {
  searchParams: Promise<{ date?: string }>
}) {
  const params       = await searchParams
  const today        = todayIST()
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

  const weekDates = Array.from({ length: 7 }, (_, i) => {
    const d = new Date(); d.setDate(d.getDate() - (6 - i))
    return d.toISOString().split("T")[0]
  })
  const weekStart = weekDates[0]
  const lateThreshold = `${selectedDate}T04:30:00.000Z`

  const [{ data: members }, { data: logs }, { data: lateLogs }, { data: weeklyRaw }, { data: dayPermissions }, { data: fullDayLeaves }] = await Promise.all([
    admin.from("users").select("id, name, employee_id")
      .eq("company_id", cid).eq("role", "MEMBER").eq("status", "active")
      .eq("is_management", false).eq("is_freelancer_login", false).order("name"),
    admin.from("attendance_logs")
      .select("user_id, clock_in, clock_out, status, break_total_mins")
      .eq("company_id", cid).eq("date", selectedDate),
    admin.from("attendance_logs")
      .select("user_id, clock_in")
      .eq("company_id", cid).eq("date", selectedDate)
      .not("clock_in", "is", null).gt("clock_in", lateThreshold).order("clock_in"),
    admin.from("attendance_logs")
      .select("date, user_id").eq("company_id", cid)
      .gte("date", weekStart).lte("date", today).not("clock_in", "is", null),
    admin.from("leaves")
      .select("user_id, permission_hours")
      .eq("company_id", cid)
      .eq("leave_type", "permission")
      .eq("status", "approved")
      .eq("from_date", selectedDate),
    admin.from("leaves")
      .select("user_id")
      .eq("company_id", cid)
      .not("leave_type", "in", '("permission","wfh","shoot_day")')
      .eq("status", "approved")
      .lte("from_date", selectedDate)
      .gte("to_date", selectedDate),
  ])

  type Log     = { user_id: string; clock_in: string | null; clock_out: string | null; status: string; break_total_mins: number | null }
  type LateLog = { user_id: string; clock_in: string }

  const logMap = new Map<string, Log>()
  for (const l of (logs ?? []) as Log[]) logMap.set(l.user_id, l)

  // Approved permissions for the selected date — sum hours per user
  const permHoursMap = new Map<string, number>()
  for (const p of (dayPermissions ?? []) as { user_id: string; permission_hours: number | null }[]) {
    permHoursMap.set(p.user_id, (permHoursMap.get(p.user_id) ?? 0) + (p.permission_hours ?? 1))
  }

  // Approved full-day leaves for the selected date
  const onLeaveSet = new Set<string>((fullDayLeaves ?? []).map((l: { user_id: string }) => l.user_id))

  function calcDurationNet(clockIn: string | null, clockOut: string | null, userId: string, breakTotalMins: number | null) {
    if (!clockIn) return null
    const end  = clockOut ? new Date(clockOut) : new Date()
    const raw  = (end.getTime() - new Date(clockIn).getTime()) / 60000
    const perm = (permHoursMap.get(userId) ?? 0) * 60
    const net  = Math.max(0, raw - (breakTotalMins ?? 0) - perm)
    if (net < 60) return `${Math.round(net)}m`
    return `${Math.floor(net / 60)}h ${Math.round(net % 60)}m`
  }

  const memberMap    = new Map((members ?? []).map(m => [m.id, m]))
  const lateEntries  = (lateLogs ?? [] as LateLog[]).map(l => ({ ...l, member: memberMap.get(l.user_id) })).filter(l => l.member)
  const totalMembers = (members ?? []).length
  const presentCount = (members ?? []).filter(m => { const l = logMap.get(m.id); return l?.clock_in || l?.status === "present" }).length
  const absentCount  = (members ?? []).filter(m => {
    const log = logMap.get(m.id)
    const hasLeaveLog = log?.status === "leave" && !log?.clock_in
    const hasApprovedLeave = !log && onLeaveSet.has(m.id)
    return hasLeaveLog || hasApprovedLeave
  }).length
  const notLogged    = (members ?? []).filter(m => !logMap.has(m.id)).length

  const weekCountMap: Record<string, number> = {}
  for (const row of (weeklyRaw ?? [])) weekCountMap[(row as { date: string }).date] = (weekCountMap[(row as { date: string }).date] ?? 0) + 1
  const weeklyData = weekDates.map(date => ({
    day: new Date(date + "T12:00:00").toLocaleDateString("en-US", { weekday: "short" }),
    count: weekCountMap[date] ?? 0,
  }))

  const displayDate = new Date(selectedDate + "T12:00:00Z").toLocaleDateString("en-IN", {
    weekday: "long", day: "numeric", month: "long", year: "numeric",
  })

  const presentPct = totalMembers > 0 ? Math.round((presentCount / totalMembers) * 100) : 0
  const absentPct  = totalMembers > 0 ? Math.round((absentCount  / totalMembers) * 100) : 0
  const notLogPct  = totalMembers > 0 ? Math.round((notLogged    / totalMembers) * 100) : 0

  const statCards: Array<{
    label: string; value: number; img: string
    numColor: string; accent: string; accentBg: string
    pct: number; sub: string; icon: React.ReactNode
    /** Optional override when a card's artwork reads larger than the others at the shared size. */
    imgClass?: string
  }> = [
    {
      label: "Present Today", value: presentCount,
      img: "/brand/attendance-admin.png",
      numColor: "#10B981", accent: "#10B981", accentBg: "rgba(16,185,129,0.08)",
      pct: presentPct, sub: `${presentPct}% attendance rate`,
      icon: <UserCheck size={16} style={{ color: "#10B981" }} />,
    },
    {
      label: "On Leave Today", value: absentCount,
      img: "/brand/absent-girl.png",
      numColor: "#de1a1a", accent: "#de1a1a", accentBg: "rgba(222,26,26,0.06)",
      pct: absentPct, sub: `${absentPct}% on leave`,
      icon: <XCircle size={16} style={{ color: "#de1a1a" }} />,
    },
    {
      label: "Not Logged In", value: notLogged,
      img: "/brand/team-admin.png",
      numColor: "#F59E0B", accent: "#F59E0B", accentBg: "rgba(245,158,11,0.08)",
      pct: notLogPct, sub: `${notLogPct}% pending`,
      icon: <AlertCircle size={16} style={{ color: "#F59E0B" }} />,
      // This character is drawn larger within its canvas than the other three, so at the
      // shared width it reads oversized and crowds the count. Give it a smaller box.
      imgClass: "w-[62px] sm:w-[52px] md:w-[74px] lg:w-[90px]",
    },
    {
      label: "Total Members", value: totalMembers,
      img: "/brand/team-group.png",
      numColor: "#6366F1", accent: "#6366F1", accentBg: "rgba(99,102,241,0.08)",
      pct: 100, sub: "Active team size",
      icon: <Users size={16} style={{ color: "#6366F1" }} />,
    },
  ]

  return (
    <div style={{ background: "linear-gradient(160deg,#F8F9FF 0%,#F5F6FA 100%)", minHeight: "100vh" }} className="px-4 py-6 md:px-7 pb-14">

      {/* ── HERO HEADER ─────────────────────────────────────────────────────── */}
      <div style={{
        borderRadius: 24, marginBottom: 22, overflow: "hidden",
        background: "linear-gradient(135deg, #de1a1a 0%, #991B1B 50%, #7F1D1D 100%)",
        boxShadow: "0 8px 32px rgba(222,26,26,0.35)",
        position: "relative",
      }}>
        {/* Decorative circles */}
        <div style={{ position: "absolute", top: -40, right: -40, width: 200, height: 200, borderRadius: "50%", background: "rgba(255,255,255,0.06)" }} />
        <div style={{ position: "absolute", bottom: -30, right: 200, width: 120, height: 120, borderRadius: "50%", background: "rgba(255,255,255,0.04)" }} />
        <div style={{ position: "absolute", top: 10, right: 360, width: 60, height: 60, borderRadius: "50%", background: "rgba(255,255,255,0.06)" }} />

        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between" style={{ padding: "20px 20px 22px", gap: 16, position: "relative", zIndex: 1 }}>
          {/* Left */}
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 8 }}>
              <div style={{ background: "rgba(255,255,255,0.2)", borderRadius: 10, padding: "6px 8px", display: "flex", alignItems: "center" }}>
                <Sparkles size={16} style={{ color: "#FFD700" }} />
              </div>
              <span style={{ fontSize: 11, fontWeight: 700, color: "rgba(255,255,255,0.7)", textTransform: "uppercase", letterSpacing: "0.15em" }}>Admin Dashboard</span>
            </div>
            <h1 style={{ fontSize: 32, fontWeight: 900, color: "#FFFFFF", margin: "0 0 4px", fontFamily: "var(--font-jakarta)", lineHeight: 1 }}>
              Attendance
            </h1>
            <p style={{ fontSize: 13, color: "rgba(255,255,255,0.65)", margin: 0 }}>{displayDate}</p>
            {/* Mini stat chips */}
            <div style={{ display: "flex", gap: 8, marginTop: 14, overflowX: "auto", flexWrap: "nowrap" }}>
              {[
                { icon: <CheckCircle2 size={12} />, label: `${presentCount} Present` },
                { icon: <Clock size={12} />, label: `${lateEntries.length} Late` },
                { icon: <Users size={12} />, label: `${totalMembers} Total` },
              ].map(s => (
                <div key={s.label} style={{ display: "flex", alignItems: "center", gap: 5, background: "rgba(255,255,255,0.15)", borderRadius: 20, padding: "4px 10px", flexShrink: 0 }}>
                  <span style={{ color: "rgba(255,255,255,0.8)" }}>{s.icon}</span>
                  <span style={{ fontSize: 11, fontWeight: 700, color: "#FFFFFF", whiteSpace: "nowrap" }}>{s.label}</span>
                </div>
              ))}
            </div>
          </div>

          {/* Right: date nav + illustration */}
          <div className="flex items-center gap-3 mt-3 sm:mt-0" style={{ flexShrink: 0 }}>
            <div style={{ background: "rgba(255,255,255,0.12)", border: "1px solid rgba(255,255,255,0.2)", borderRadius: 14, padding: "4px 6px" }}>
              <AttendanceDateNav selectedDate={selectedDate} today={today} />
            </div>
            {/* Illustration — in-flow flex item (not absolutely positioned) so it never overlaps the date nav or text; stacks in the same order on every breakpoint */}
            <div style={{ position: "relative", width: "clamp(44px,12vw,88px)", height: "clamp(66px,18vw,132px)", flexShrink: 0, filter: "drop-shadow(0 6px 14px rgba(0,0,0,0.3))" }}>
              <Image src="/brand/attendance-admin-hero.png" alt="" fill style={{ objectFit: "contain" }} />
            </div>
          </div>
        </div>
      </div>

      {/* ── STAT CARDS ──────────────────────────────────────────────────────── */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-5" style={{ marginBottom: 22 }}>
        {statCards.map(s => (
          <div key={s.label} style={{
            background: "#FFFFFF", borderRadius: 20,
            border: `1.5px solid ${s.accent}55`,
            padding: "clamp(12px,3vw,20px) clamp(12px,3vw,20px) 14px",
            boxShadow: `0 4px 20px ${s.accent}18`,
            position: "relative", overflow: "hidden",
          }}>
            {/* Soft bg circle */}
            <div style={{ position: "absolute", top: -20, right: -20, width: 90, height: 90, borderRadius: "50%", background: s.accentBg }} />
            {/* Character image — width keyed to breakpoints (not vw) since each card is only ~45% of viewport width on the mobile 2-col grid; vw-based sizing made the image proportionally oversized for its card */}
            <div className={s.imgClass ?? "w-[72px] sm:w-[64px] md:w-[90px] lg:w-[110px]"} style={{ position: "absolute", top: 0, bottom: 0, right: 0, pointerEvents: "none" }}>
              <Image src={s.img} alt={s.label} fill style={{ objectFit: "contain", objectPosition: "right center" }} />
            </div>
            {/* Text column — right padding matches the image width above (plus a small gap) so the label/number can never run under it, and minWidth:0 lets the label wrap instead of overflowing the card */}
            <div className="pr-[80px] sm:pr-[72px] md:pr-[98px] lg:pr-[118px]" style={{ position: "relative" }}>
              <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 10, minWidth: 0 }}>
                <div style={{ width: 30, height: 30, borderRadius: 9, background: s.accentBg, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                  {s.icon}
                </div>
                <p style={{ fontSize: 11, color: "#0F4C4C", fontWeight: 700, margin: 0, textTransform: "uppercase", letterSpacing: "0.07em", minWidth: 0 }}>{s.label}</p>
              </div>
              <p style={{ fontSize: "clamp(34px,9vw,56px)", fontWeight: 900, color: s.numColor, margin: "0 0 2px", lineHeight: 1, fontFamily: "var(--font-jakarta)" }}>{s.value}</p>
            </div>
            {/* Progress bar */}
            <div style={{ marginTop: 20, height: 4, background: "#F3F4F6", borderRadius: 4, overflow: "hidden", position: "relative" }}>
              <div style={{ height: "100%", width: `${s.pct}%`, background: `linear-gradient(90deg, ${s.accent}, ${s.accent}99)`, borderRadius: 4 }} />
            </div>
            <p style={{ fontSize: 10, color: s.numColor, fontWeight: 700, margin: "5px 0 0" }}>{s.sub}</p>
          </div>
        ))}
      </div>

      {/* ── MAIN 2-COL LAYOUT ───────────────────────────────────────────────── */}
      <div className="grid grid-cols-1 lg:grid-cols-[1fr_320px] gap-4 mb-5" style={{ marginBottom: 20 }}>

        {/* ── LEFT: Attendance Table ───────────────────────────────────────── */}
        <div style={{ background: "#FFFFFF", borderRadius: 22, border: "1px solid #EBEDF2", boxShadow: "0 4px 20px rgba(0,0,0,0.06)", overflow: "hidden", display: "flex", flexDirection: "column" }}>
          {/* Table header strip */}
          <div style={{ height: 4, background: "linear-gradient(90deg, #de1a1a, #991B1B)" }} />
          <div style={{ padding: "18px 22px 14px", borderBottom: "1px solid #F3F4F6", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
            <div>
              <h2 style={{ fontSize: 15, fontWeight: 900, color: "#111827", margin: 0, fontFamily: "var(--font-jakarta)" }}>
                Team Attendance
              </h2>
              <p style={{ fontSize: 11, color: "#0F4C4C", margin: "3px 0 0", fontWeight: 600 }}>
                {isToday ? "Today" : displayDate}
              </p>
            </div>
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <span style={{ fontSize: 12, fontWeight: 700, padding: "4px 14px", borderRadius: 20, background: "rgba(16,185,129,0.1)", color: "#10B981" }}>
                {presentCount}/{totalMembers} Present
              </span>
            </div>
          </div>

          {/* Scrollable table wrapper */}
          <div className="overflow-x-auto">
            <div style={{ minWidth: 640 }}>
              {/* Column headers */}
              <div style={{ display: "grid", gridTemplateColumns: "1fr 110px 110px 90px 110px 40px", padding: "10px 22px", borderBottom: "1px solid #F5F5F5", background: "#FAFAFA" }}>
                {["EMPLOYEE", "CLOCK IN", "CLOCK OUT", "DURATION", "STATUS", ""].map(h => (
                  <span key={h} style={{ fontSize: 10, fontWeight: 800, color: "#0F4C4C", letterSpacing: "0.1em" }}>{h}</span>
                ))}
              </div>

              {/* Rows */}
              <div style={{ flex: 1 }}>
                {!members || members.length === 0 ? (
                  <div style={{ display: "flex", flexDirection: "column", alignItems: "center", padding: "56px 0", gap: 10 }}>
                    <div style={{ width: 56, height: 56, borderRadius: 18, background: "#F3F4F6", display: "flex", alignItems: "center", justifyContent: "center" }}>
                      <Users size={24} style={{ color: "#0F4C4C" }} />
                    </div>
                    <p style={{ fontSize: 13, color: "#0F4C4C", margin: 0, fontWeight: 600 }}>No team members found</p>
                  </div>
                ) : (
                  (members ?? []).map((m, i) => {
                    const log       = logMap.get(m.id)
                    const isAbsent  = log?.status === "leave" && !log?.clock_in
                    const isWorking = !!(log?.clock_in && !log?.clock_out)
                    const isDone    = !!(log?.clock_in && log?.clock_out)
                    const dur       = calcDurationNet(log?.clock_in ?? null, log?.clock_out ?? null, m.id, log?.break_total_mins ?? null)

                    const isOnLeave = !log && onLeaveSet.has(m.id)
                    let statusLabel = "Not Logged"; let statusColor = "#9CA3AF"; let statusBg = "#F3F4F6"; let statusDot = "#D1D5DB"
                    if (isAbsent || isOnLeave) { statusLabel = "On Leave"; statusColor = "#DE1A1A"; statusBg = "rgba(222,26,26,0.08)"; statusDot = "#DE1A1A" }
                    if (isWorking) { statusLabel = "Working"; statusColor = "#10B981"; statusBg = "rgba(16,185,129,0.09)"; statusDot = "#10B981" }
                    if (isDone)    { statusLabel = "Done";    statusColor = "#6366F1"; statusBg = "rgba(99,102,241,0.09)"; statusDot = "#6366F1" }

                    const initials = m.name.split(" ").map((n: string) => n[0]).join("").slice(0, 2).toUpperCase()
                    const avatarColors = ["#de1a1a","#6366F1","#10B981","#F59E0B","#8B5CF6","#06B6D4"]
                    const avatarColor = avatarColors[i % avatarColors.length]

                    const hasLog = !!(log?.clock_in || log?.status === "leave")
                    return (
                      <div key={m.id} style={{
                        display: "grid", gridTemplateColumns: "1fr 110px 110px 90px 110px 40px",
                        padding: "13px 22px", borderBottom: "1px solid #F9FAFB", alignItems: "center",
                        background: i % 2 === 0 ? "#FFFFFF" : "#FDFCFC",
                        transition: "background 0.15s",
                      }}>
                        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                          <div style={{ width: 36, height: 36, borderRadius: 12, background: `${avatarColor}18`, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0, border: `1.5px solid ${avatarColor}30` }}>
                            <span style={{ fontSize: 13, fontWeight: 900, color: avatarColor }}>{initials}</span>
                          </div>
                          <div>
                            <p style={{ fontSize: 13, fontWeight: 700, color: "#111827", margin: 0 }}>{m.name}</p>
                            <p style={{ fontSize: 10, color: "#C4C4C4", margin: 0, fontWeight: 600 }}>#{m.employee_id}</p>
                          </div>
                        </div>
                        <div style={{ display: "flex", alignItems: "center", gap: 5 }}>
                          {log?.clock_in && <span style={{ width: 6, height: 6, borderRadius: "50%", background: "#10B981", flexShrink: 0 }} />}
                          <span style={{ fontSize: 12, fontWeight: 600, color: log?.clock_in ? "#111827" : "#0F4C4C" }}>{fmtTime(log?.clock_in ?? null)}</span>
                        </div>
                        <span style={{ fontSize: 12, fontWeight: 600, color: log?.clock_out ? "#111827" : "#0F4C4C" }}>{fmtTime(log?.clock_out ?? null)}</span>
                        <span style={{ fontSize: 12, fontWeight: 700, color: dur ? "#0F4C4C" : "#0F4C4C" }}>{dur ?? "—"}</span>
                        <span style={{ display: "inline-flex", alignItems: "center", gap: 5, fontSize: 11, fontWeight: 800, padding: "5px 12px", borderRadius: 10, background: statusBg, color: statusColor }}>
                          <span style={{ width: 6, height: 6, borderRadius: "50%", background: statusDot, flexShrink: 0 }} />
                          {statusLabel}
                        </span>
                        <div>
                          {hasLog && (
                            <ClearAttendanceBtn userId={m.id} userName={m.name} date={selectedDate} />
                          )}
                        </div>
                      </div>
                    )
                  })
                )}
              </div>
            </div>
          </div>

          {/* Footer */}
          <div style={{ padding: "14px 22px", borderTop: "1px solid #F3F4F6", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
            <span style={{ fontSize: 11, color: "#0F4C4C" }}>{(members ?? []).length} employees total</span>
            <Link href="/admin/activities" style={{ fontSize: 12, fontWeight: 800, color: "#de1a1a", textDecoration: "none", display: "inline-flex", alignItems: "center", gap: 5, padding: "7px 16px", borderRadius: 10, background: "rgba(222,26,26,0.07)" }}>
              Full Report <ArrowRight size={13} />
            </Link>
          </div>
        </div>

        {/* ── RIGHT SIDEBAR ────────────────────────────────────────────────── */}
        <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>

          {/* Attendance Overview */}
          <div style={{ background: "#FFFFFF", borderRadius: 22, border: "1px solid #EBEDF2", boxShadow: "0 4px 20px rgba(0,0,0,0.06)", overflow: "hidden" }}>
            <div style={{ height: 4, background: "linear-gradient(90deg, #6366F1, #8B5CF6)" }} />
            <div style={{ padding: "18px 20px" }}>
              <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 16 }}>
                <div style={{ width: 30, height: 30, borderRadius: 9, background: "rgba(99,102,241,0.1)", display: "flex", alignItems: "center", justifyContent: "center" }}>
                  <TrendingUp size={14} style={{ color: "#6366F1" }} />
                </div>
                <h3 style={{ fontSize: 14, fontWeight: 900, color: "#111827", margin: 0 }}>Attendance Overview</h3>
              </div>
              <AttendanceDonut present={presentCount} notLogged={notLogged} absent={absentCount} total={totalMembers} />
            </div>
          </div>

          {/* Weekly Trend */}
          <div style={{ background: "#FFFFFF", borderRadius: 22, border: "1px solid #EBEDF2", boxShadow: "0 4px 20px rgba(0,0,0,0.06)", overflow: "hidden" }}>
            <div style={{ height: 4, background: "linear-gradient(90deg, #10B981, #06B6D4)" }} />
            <div style={{ padding: "18px 20px" }}>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 14 }}>
                <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                  <div style={{ width: 30, height: 30, borderRadius: 9, background: "rgba(16,185,129,0.1)", display: "flex", alignItems: "center", justifyContent: "center" }}>
                    <BarChart3 size={14} style={{ color: "#10B981" }} />
                  </div>
                  <h3 style={{ fontSize: 14, fontWeight: 900, color: "#111827", margin: 0 }}>Weekly Trend</h3>
                </div>
                <span style={{ fontSize: 10, fontWeight: 700, color: "#10B981", background: "rgba(16,185,129,0.1)", border: "1px solid rgba(16,185,129,0.2)", borderRadius: 8, padding: "3px 10px" }}>This Week</span>
              </div>
              <WeeklyTrendChart data={weeklyData} />
            </div>
          </div>
        </div>
      </div>

      {/* ── LATE ARRIVALS BANNER ────────────────────────────────────────────── */}
      <div style={{
        borderRadius: 22, overflow: "hidden",
        background: "#FFFFFF", border: "1px solid #EBEDF2",
        boxShadow: "0 4px 20px rgba(0,0,0,0.06)",
      }}>
        <div style={{ height: 4, background: "linear-gradient(90deg, #F59E0B, #EF4444)" }} />
        <div style={{ padding: "18px 22px 14px", borderBottom: lateEntries.length > 0 ? "1px solid #F3F4F6" : "none", display: "flex", alignItems: "center", gap: 10 }}>
          <div style={{ width: 32, height: 32, borderRadius: 10, background: "rgba(245,158,11,0.1)", display: "flex", alignItems: "center", justifyContent: "center" }}>
            <Clock size={15} style={{ color: "#F59E0B" }} />
          </div>
          <h3 style={{ fontSize: 15, fontWeight: 900, color: "#111827", margin: 0, fontFamily: "var(--font-jakarta)" }}>Late Arrivals</h3>
          <span style={{
            fontSize: 12, fontWeight: 800, padding: "2px 10px", borderRadius: 20,
            background: lateEntries.length > 0 ? "rgba(222,26,26,0.1)" : "rgba(16,185,129,0.1)",
            color: lateEntries.length > 0 ? "#de1a1a" : "#10B981",
          }}>{lateEntries.length}</span>
          <span style={{ fontSize: 11, color: "#0F4C4C", fontWeight: 600 }}>after 10:00 AM</span>
        </div>

        {lateEntries.length === 0 ? (
          <div style={{ display: "flex", alignItems: "center", gap: 24, padding: "24px 28px" }}>
            <div style={{ position: "relative", width: 120, height: 120, flexShrink: 0 }}>
              <Image src="/brand/no-time.png" alt="On time" fill style={{ objectFit: "contain" }} />
            </div>
            <div>
              <p style={{ fontSize: 18, fontWeight: 900, color: "#111827", margin: "0 0 6px", fontFamily: "var(--font-jakarta)" }}>All on time today! 🎉</p>
              <p style={{ fontSize: 13, color: "#0F4C4C", margin: 0 }}>No one clocked in after 10:00 AM — great team discipline!</p>
              <div style={{ display: "inline-flex", alignItems: "center", gap: 6, marginTop: 10, background: "rgba(16,185,129,0.1)", borderRadius: 20, padding: "5px 14px" }}>
                <CheckCircle2 size={13} style={{ color: "#10B981" }} />
                <span style={{ fontSize: 11, fontWeight: 700, color: "#10B981" }}>Perfect Punctuality</span>
              </div>
            </div>
          </div>
        ) : (
          <div>
            {lateEntries.map((entry, i) => {
              const clockInIST = new Date(entry.clock_in).toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit", hour12: true, timeZone: "Asia/Kolkata" })
              const lateByMs   = new Date(entry.clock_in).getTime() - new Date(lateThreshold).getTime()
              const lateByMins = Math.floor(lateByMs / 60000)
              const lateStr    = lateByMins >= 60 ? `${Math.floor(lateByMins / 60)}h ${lateByMins % 60}m late` : `${lateByMins}m late`
              return (
                <div key={entry.user_id} style={{
                  display: "flex", alignItems: "center", gap: 14, padding: "14px 22px",
                  borderBottom: "1px solid #F9FAFB",
                  background: i % 2 === 0 ? "#FFFFFF" : "#FFFDF9",
                }}>
                  <div style={{ width: 38, height: 38, borderRadius: 12, background: "rgba(245,158,11,0.12)", display: "flex", alignItems: "center", justifyContent: "center", border: "1.5px solid rgba(245,158,11,0.25)", flexShrink: 0 }}>
                    <span style={{ fontSize: 13, fontWeight: 900, color: "#D97706" }}>{entry.member!.name[0]}</span>
                  </div>
                  <div style={{ flex: 1 }}>
                    <p style={{ fontSize: 13, fontWeight: 700, color: "#111827", margin: 0 }}>{entry.member!.name}</p>
                    <p style={{ fontSize: 10, color: "#C4C4C4", margin: 0, fontWeight: 600 }}>#{entry.member!.employee_id}</p>
                  </div>
                  <div style={{ display: "flex", alignItems: "center", gap: 6, background: "#F9FAFB", border: "1px solid #E5E7EB", borderRadius: 10, padding: "5px 12px" }}>
                    <Clock size={11} style={{ color: "#0F4C4C" }} />
                    <span style={{ fontSize: 12, fontWeight: 700, color: "#0F4C4C" }}>{clockInIST}</span>
                  </div>
                  <span style={{ fontSize: 11, fontWeight: 800, padding: "5px 12px", borderRadius: 10, background: "rgba(245,158,11,0.1)", color: "#D97706", border: "1px solid rgba(245,158,11,0.2)" }}>{lateStr}</span>
                </div>
              )
            })}
          </div>
        )}
      </div>

    </div>
  )
}
