import { createServerClient } from "@/lib/supabase/server"
import { ClipboardList, Target, CalendarOff, Megaphone, CheckCircle2, Clock } from "lucide-react"
import Link from "next/link"
import ClockWidget from "@/components/member/clock-widget"

export default async function MemberDashboardPage() {
  const supabase = await createServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return null

  const today = new Date().toISOString().split("T")[0]

  type ProfileRow = { name: string; employee_id: string; role: string }
  type UpdateRow = { attendance_status: string; work_type: string | null; working_hours: number | null; learning_hours: number }
  type AnnRow = { id: string; title: string; message: string; pinned: boolean; created_at: string }
  type TaskRow = { id: string; title: string; status: string; priority: string; due_date: string | null }
  type AttLog = { clock_in: string | null; clock_out: string | null }

  const [
    { data: profileRaw },
    { data: todayUpdateRaw },
    { count: myTasksCount },
    { count: pendingLeavesCount },
    { data: announcementsRaw },
    { data: myTasksRaw },
    { data: clockLogRaw },
  ] = await Promise.all([
    supabase.from("users").select("name, employee_id, role").eq("id", user.id).single(),
    supabase.from("daily_updates").select("attendance_status, work_type, working_hours, learning_hours").eq("user_id", user.id).eq("date", today).maybeSingle(),
    supabase.from("tasks").select("*", { count: "exact", head: true }).eq("assigned_to", user.id).neq("status", "completed"),
    supabase.from("leaves").select("*", { count: "exact", head: true }).eq("user_id", user.id).eq("status", "pending"),
    supabase.from("announcements").select("id, title, message, pinned, created_at").order("pinned", { ascending: false }).order("created_at", { ascending: false }).limit(3),
    supabase.from("tasks").select("id, title, status, priority, due_date").eq("assigned_to", user.id).neq("status", "completed").order("due_date", { ascending: true }).limit(5),
    supabase.from("attendance_logs").select("clock_in, clock_out").eq("user_id", user.id).eq("date", today).maybeSingle(),
  ])

  const profile = profileRaw as unknown as ProfileRow | null
  const todayUpdate = todayUpdateRaw as unknown as UpdateRow | null
  const announcements = (announcementsRaw ?? []) as unknown as AnnRow[]
  const myTasks = (myTasksRaw ?? []) as unknown as TaskRow[]
  const clockLog = clockLogRaw as unknown as AttLog | null

  const now = new Date()
  const hour = now.getHours()
  const greeting = hour < 12 ? "Good morning" : hour < 18 ? "Good afternoon" : "Good evening"
  const dateStr = now.toLocaleDateString("en-US", { weekday: "long", day: "numeric", month: "long", year: "numeric" })

  const PRIORITY_COLORS = {
    low:    { color: "#6B6B8E", bg: "rgba(107,107,142,0.1)" },
    medium: { color: "#D97706", bg: "rgba(217,119,6,0.1)" },
    high:   { color: "#FF5A35", bg: "rgba(255,90,53,0.1)" },
  }

  const ATTENDANCE_COLORS: Record<string, { color: string; bg: string; label: string }> = {
    present: { color: "#059669", bg: "rgba(5,150,105,0.1)",    label: "Present" },
    absent:  { color: "#DC2626", bg: "rgba(220,38,38,0.1)",    label: "Absent" },
    holiday: { color: "#D97706", bg: "rgba(217,119,6,0.1)",    label: "Holiday" },
    outside: { color: "#5B4FD4", bg: "rgba(91,79,212,0.1)",    label: "Outside" },
  }

  return (
    <div className="p-8 max-w-[1200px]">
      {/* Header */}
      <div className="flex items-start justify-between mb-8">
        <div>
          <h1 className="text-[32px] leading-tight" style={{ fontFamily: "var(--font-jakarta)", fontWeight: 800, color: "#0C0A1E" }}>
            {greeting}, {profile?.name?.split(" ")[0] ?? "there"} 👋
          </h1>
          <p className="text-sm mt-1 font-sans" style={{ color: "#6B6B8E" }}>{dateStr}</p>
        </div>
        <div className="text-right mt-1">
          <p className="text-[10px] uppercase tracking-widest font-sans mb-0.5" style={{ color: "#9898B8" }}>Employee ID</p>
          <p className="text-[15px]" style={{ fontFamily: "var(--font-jakarta)", fontWeight: 700, color: "#0C0A1E" }}>#{profile?.employee_id}</p>
        </div>
      </div>

      {/* Clock In / Out */}
      <div className="mb-4">
        <ClockWidget
          clockInTime={clockLog?.clock_in ?? null}
          clockOutTime={clockLog?.clock_out ?? null}
        />
      </div>

      {/* Today's Update Status */}
      <div className="rounded-2xl p-5 mb-6" style={{
        background: "#FFFFFF",
        border: todayUpdate ? "1px solid rgba(16,185,129,0.25)" : "1px solid rgba(255,90,53,0.25)",
        boxShadow: todayUpdate ? "0 2px 12px rgba(16,185,129,0.08)" : "0 2px 12px rgba(255,90,53,0.08)",
      }}>
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl flex items-center justify-center"
              style={{ background: todayUpdate ? "rgba(16,185,129,0.1)" : "rgba(255,90,53,0.1)" }}>
              {todayUpdate
                ? <CheckCircle2 size={20} style={{ color: "#10B981" }} />
                : <ClipboardList size={20} style={{ color: "#FF5A35" }} />
              }
            </div>
            <div>
              <p className="text-[14px] font-bold font-sans" style={{ color: "#0C0A1E" }}>
                {todayUpdate ? "Daily update submitted ✓" : "Daily update not submitted yet"}
              </p>
              {todayUpdate ? (
                <div className="flex items-center gap-3 mt-0.5">
                  {(() => {
                    const sc = ATTENDANCE_COLORS[todayUpdate.attendance_status] ?? ATTENDANCE_COLORS.present
                    return <span className="text-[12px] font-semibold font-sans px-2 py-0.5 rounded-full" style={{ background: sc.bg, color: sc.color }}>{sc.label}</span>
                  })()}
                  {todayUpdate.working_hours && <span className="text-[12px] font-sans" style={{ color: "#6B6B8E" }}>{todayUpdate.working_hours}h work</span>}
                  {todayUpdate.learning_hours > 0 && <span className="text-[12px] font-sans" style={{ color: "#6B6B8E" }}>{todayUpdate.learning_hours}h learning</span>}
                </div>
              ) : (
                <p className="text-[12px] font-sans mt-0.5" style={{ color: "#9898B8" }}>Submit your daily update to track your progress.</p>
              )}
            </div>
          </div>
          {!todayUpdate && (
            <Link href="/member/update"
              className="px-5 py-2.5 rounded-xl text-[13px] font-semibold font-sans text-white"
              style={{ background: "linear-gradient(135deg, #6D5DF6, #9B8FFF)", boxShadow: "0 4px 16px rgba(109,93,246,0.3)" }}>
              Submit Update
            </Link>
          )}
        </div>
      </div>

      {/* Quick stats */}
      <div className="grid grid-cols-3 gap-4 mb-6">
        {[
          { label: "Active Tasks",     value: myTasksCount ?? 0,      color: "#6D5DF6", bg: "rgba(109,93,246,0.08)", border: "rgba(109,93,246,0.18)", icon: Target,     href: "/member/tasks" },
          { label: "Pending Leaves",   value: pendingLeavesCount ?? 0, color: "#D97706", bg: "rgba(217,119,6,0.08)", border: "rgba(217,119,6,0.18)",  icon: CalendarOff, href: "/member/leaves" },
          { label: "Announcements",    value: announcements?.length ?? 0, color: "#FF5A35", bg: "rgba(255,90,53,0.08)", border: "rgba(255,90,53,0.18)", icon: Megaphone,  href: "/member/announcements" },
        ].map((stat) => {
          const Icon = stat.icon
          return (
            <Link key={stat.label} href={stat.href}
              className="rounded-2xl p-5 flex items-center gap-4 transition-all hover:-translate-y-0.5"
              style={{ background: "#FFFFFF", border: `1px solid ${stat.border}`, boxShadow: `0 2px 12px ${stat.bg}` }}>
              <div className="w-10 h-10 rounded-xl flex items-center justify-center" style={{ background: stat.bg }}>
                <Icon size={18} style={{ color: stat.color }} />
              </div>
              <div>
                <p className="text-[28px] font-black leading-none" style={{ fontFamily: "var(--font-jakarta)", color: "#0C0A1E" }}>{stat.value}</p>
                <p className="text-[12px] font-semibold font-sans mt-0.5" style={{ color: stat.color }}>{stat.label}</p>
              </div>
            </Link>
          )
        })}
      </div>

      {/* My Tasks + Announcements */}
      <div className="grid grid-cols-2 gap-4">
        {/* My Tasks */}
        <div className="rounded-2xl p-5" style={{ background: "#FFFFFF", border: "1px solid #E4E5F0", boxShadow: "0 1px 8px rgba(12,10,30,0.05)" }}>
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-2">
              <Target size={15} style={{ color: "#6D5DF6" }} />
              <h3 className="text-[14px] font-bold font-sans" style={{ color: "#0C0A1E" }}>My Tasks</h3>
            </div>
            <Link href="/member/tasks" className="text-[12px] font-semibold font-sans" style={{ color: "#6D5DF6" }}>View all →</Link>
          </div>
          {!myTasks || myTasks.length === 0 ? (
            <div className="flex flex-col items-center py-8 gap-2">
              <Target size={28} style={{ color: "#E4E5F0" }} />
              <p className="text-[13px] font-sans" style={{ color: "#9898B8" }}>No active tasks</p>
            </div>
          ) : (
            <div className="space-y-2">
              {myTasks.map((task) => {
                const pr = PRIORITY_COLORS[task.priority as keyof typeof PRIORITY_COLORS] ?? PRIORITY_COLORS.medium
                return (
                  <div key={task.id} className="flex items-center gap-3 px-3 py-2.5 rounded-xl" style={{ background: "#F4F5FB" }}>
                    <div className="w-1.5 h-1.5 rounded-full flex-shrink-0" style={{ background: pr.color }} />
                    <p className="flex-1 text-[13px] font-sans truncate" style={{ color: "#0C0A1E" }}>{task.title}</p>
                    {task.due_date && <span className="text-[11px] font-sans flex-shrink-0" style={{ color: "#9898B8" }}>{task.due_date}</span>}
                    <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded flex-shrink-0" style={{ background: pr.bg, color: pr.color }}>
                      {task.priority.toUpperCase()}
                    </span>
                  </div>
                )
              })}
            </div>
          )}
        </div>

        {/* Latest Announcements */}
        <div className="rounded-2xl p-5" style={{ background: "#FFFFFF", border: "1px solid #E4E5F0", boxShadow: "0 1px 8px rgba(12,10,30,0.05)" }}>
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-2">
              <Megaphone size={15} style={{ color: "#FF5A35" }} />
              <h3 className="text-[14px] font-bold font-sans" style={{ color: "#0C0A1E" }}>Announcements</h3>
            </div>
            <Link href="/member/announcements" className="text-[12px] font-semibold font-sans" style={{ color: "#6D5DF6" }}>View all →</Link>
          </div>
          {!announcements || announcements.length === 0 ? (
            <div className="flex flex-col items-center py-8 gap-2">
              <Megaphone size={28} style={{ color: "#E4E5F0" }} />
              <p className="text-[13px] font-sans" style={{ color: "#9898B8" }}>No announcements</p>
            </div>
          ) : (
            <div className="space-y-2">
              {announcements.map((ann) => (
                <div key={ann.id} className="px-3 py-2.5 rounded-xl" style={{ background: "#F4F5FB" }}>
                  <div className="flex items-center gap-2 mb-0.5">
                    {ann.pinned && <span className="text-[10px] font-semibold" style={{ color: "#6D5DF6" }}>📌</span>}
                    <p className="text-[13px] font-semibold font-sans truncate" style={{ color: "#0C0A1E" }}>{ann.title}</p>
                  </div>
                  <p className="text-[12px] font-sans truncate" style={{ color: "#9898B8" }}>{ann.message}</p>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
