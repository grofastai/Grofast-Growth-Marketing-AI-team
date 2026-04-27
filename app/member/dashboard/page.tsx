import { createServerClient } from "@/lib/supabase/server"
import { ClipboardList, Target, CalendarOff, Megaphone, CheckCircle2, Clock } from "lucide-react"
import Link from "next/link"

export default async function MemberDashboardPage() {
  const supabase = await createServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return null

  const today = new Date().toISOString().split("T")[0]

  type ProfileRow = { name: string; employee_id: string; role: string }
  type UpdateRow = { attendance_status: string; work_type: string | null; working_hours: number | null; learning_hours: number }
  type AnnRow = { id: string; title: string; message: string; pinned: boolean; created_at: string }
  type TaskRow = { id: string; title: string; status: string; priority: string; due_date: string | null }

  const [
    { data: profileRaw },
    { data: todayUpdateRaw },
    { count: myTasksCount },
    { count: pendingLeavesCount },
    { data: announcementsRaw },
    { data: myTasksRaw },
  ] = await Promise.all([
    supabase.from("users").select("name, employee_id, role").eq("id", user.id).single(),
    supabase.from("daily_updates").select("attendance_status, work_type, working_hours, learning_hours").eq("user_id", user.id).eq("date", today).maybeSingle(),
    supabase.from("tasks").select("*", { count: "exact", head: true }).eq("assigned_to", user.id).neq("status", "completed"),
    supabase.from("leaves").select("*", { count: "exact", head: true }).eq("user_id", user.id).eq("status", "pending"),
    supabase.from("announcements").select("id, title, message, pinned, created_at").order("pinned", { ascending: false }).order("created_at", { ascending: false }).limit(3),
    supabase.from("tasks").select("id, title, status, priority, due_date").eq("assigned_to", user.id).neq("status", "completed").order("due_date", { ascending: true }).limit(5),
  ])

  const profile = profileRaw as unknown as ProfileRow | null
  const todayUpdate = todayUpdateRaw as unknown as UpdateRow | null
  const announcements = (announcementsRaw ?? []) as unknown as AnnRow[]
  const myTasks = (myTasksRaw ?? []) as unknown as TaskRow[]

  const now = new Date()
  const hour = now.getHours()
  const greeting = hour < 12 ? "Good morning" : hour < 18 ? "Good afternoon" : "Good evening"
  const dateStr = now.toLocaleDateString("en-US", { weekday: "long", day: "numeric", month: "long", year: "numeric" })

  const PRIORITY_COLORS = {
    low: { color: "#6B7280", bg: "rgba(107,114,128,0.1)" },
    medium: { color: "#F59E0B", bg: "rgba(245,158,11,0.1)" },
    high: { color: "#FF6B57", bg: "rgba(255,107,87,0.1)" },
  }

  const ATTENDANCE_COLORS: Record<string, { color: string; bg: string; label: string }> = {
    present: { color: "#10B981", bg: "rgba(16,185,129,0.1)", label: "Present" },
    absent: { color: "#FF6B57", bg: "rgba(255,107,87,0.1)", label: "Absent" },
    holiday: { color: "#F59E0B", bg: "rgba(245,158,11,0.1)", label: "Holiday" },
    outside: { color: "#6D5DF6", bg: "rgba(109,93,246,0.1)", label: "Outside" },
  }

  return (
    <div className="p-8 max-w-[1200px]">
      {/* Header */}
      <div className="flex items-start justify-between mb-8">
        <div>
          <h1 className="text-[32px] leading-tight" style={{ fontFamily: "var(--font-jakarta)", fontWeight: 800, color: "#E6EDF3" }}>
            {greeting}, {profile?.name?.split(" ")[0] ?? "there"} 👋
          </h1>
          <p className="text-sm mt-1 font-sans" style={{ color: "#6B7280" }}>{dateStr}</p>
        </div>
        <div className="text-right mt-1">
          <p className="text-[10px] uppercase tracking-widest font-sans mb-0.5" style={{ color: "#6B7280" }}>Employee ID</p>
          <p className="text-[15px]" style={{ fontFamily: "var(--font-jakarta)", fontWeight: 700, color: "#E6EDF3" }}>#{profile?.employee_id}</p>
        </div>
      </div>

      {/* Today's Update Status */}
      <div className="rounded-2xl p-5 mb-6" style={{
        background: todayUpdate ? "rgba(16,185,129,0.06)" : "rgba(255,107,87,0.06)",
        border: todayUpdate ? "1px solid rgba(16,185,129,0.2)" : "1px solid rgba(255,107,87,0.2)",
      }}>
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl flex items-center justify-center"
              style={{ background: todayUpdate ? "rgba(16,185,129,0.12)" : "rgba(255,107,87,0.12)" }}>
              {todayUpdate ? <CheckCircle2 size={20} style={{ color: "#10B981" }} /> : <ClipboardList size={20} style={{ color: "#FF6B57" }} />}
            </div>
            <div>
              <p className="text-[14px] font-bold font-sans" style={{ color: "#E6EDF3" }}>
                {todayUpdate ? "Daily update submitted ✓" : "Daily update not submitted yet"}
              </p>
              {todayUpdate ? (
                <div className="flex items-center gap-3 mt-0.5">
                  {(() => {
                    const sc = ATTENDANCE_COLORS[todayUpdate.attendance_status] ?? ATTENDANCE_COLORS.present
                    return <span className="text-[12px] font-semibold font-sans px-2 py-0.5 rounded-full" style={{ background: sc.bg, color: sc.color }}>{sc.label}</span>
                  })()}
                  {todayUpdate.working_hours && <span className="text-[12px] font-sans" style={{ color: "#6B7280" }}>{todayUpdate.working_hours}h work</span>}
                  {todayUpdate.learning_hours > 0 && <span className="text-[12px] font-sans" style={{ color: "#6B7280" }}>{todayUpdate.learning_hours}h learning</span>}
                </div>
              ) : (
                <p className="text-[12px] font-sans mt-0.5" style={{ color: "#6B7280" }}>Submit your daily update to track your progress.</p>
              )}
            </div>
          </div>
          {!todayUpdate && (
            <Link href="/member/update"
              className="px-5 py-2.5 rounded-xl text-[13px] font-semibold font-sans text-white"
              style={{ background: "linear-gradient(135deg, #FF6B57, #E85A45)", boxShadow: "0 4px 16px rgba(255,107,87,0.3)" }}>
              Submit Update
            </Link>
          )}
        </div>
      </div>

      {/* Quick stats */}
      <div className="grid grid-cols-3 gap-4 mb-6">
        {[
          { label: "Active Tasks", value: myTasksCount ?? 0, color: "#6D5DF6", bg: "rgba(109,93,246,0.08)", border: "rgba(109,93,246,0.15)", icon: Target, href: "/member/tasks" },
          { label: "Pending Leaves", value: pendingLeavesCount ?? 0, color: "#F59E0B", bg: "rgba(245,158,11,0.08)", border: "rgba(245,158,11,0.15)", icon: CalendarOff, href: "/member/leaves" },
          { label: "Announcements", value: announcements?.length ?? 0, color: "#FF6B57", bg: "rgba(255,107,87,0.08)", border: "rgba(255,107,87,0.15)", icon: Megaphone, href: "/member/announcements" },
        ].map((stat) => {
          const Icon = stat.icon
          return (
            <Link key={stat.label} href={stat.href} className="rounded-2xl p-5 flex items-center gap-4 transition-all hover:-translate-y-0.5"
              style={{ background: stat.bg, border: `1px solid ${stat.border}` }}>
              <div className="w-10 h-10 rounded-xl flex items-center justify-center" style={{ background: "rgba(255,255,255,0.06)" }}>
                <Icon size={18} style={{ color: stat.color }} />
              </div>
              <div>
                <p className="text-[28px] font-black leading-none" style={{ fontFamily: "var(--font-jakarta)", color: "#E6EDF3" }}>{stat.value}</p>
                <p className="text-[12px] font-semibold font-sans mt-0.5" style={{ color: stat.color }}>{stat.label}</p>
              </div>
            </Link>
          )
        })}
      </div>

      {/* My Tasks + Announcements */}
      <div className="grid grid-cols-2 gap-4">
        {/* My Tasks */}
        <div className="rounded-2xl p-5" style={{ background: "rgba(255,255,255,0.02)", border: "1px solid rgba(255,255,255,0.06)" }}>
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-2">
              <Target size={15} style={{ color: "#6D5DF6" }} />
              <h3 className="text-[14px] font-bold font-sans" style={{ color: "#E6EDF3" }}>My Tasks</h3>
            </div>
            <Link href="/member/tasks" className="text-[12px] font-sans" style={{ color: "#6D5DF6" }}>View all →</Link>
          </div>
          {!myTasks || myTasks.length === 0 ? (
            <div className="flex flex-col items-center py-8 gap-2">
              <Target size={28} style={{ color: "rgba(255,255,255,0.1)" }} />
              <p className="text-[13px] font-sans" style={{ color: "#6B7280" }}>No active tasks</p>
            </div>
          ) : (
            <div className="space-y-2">
              {myTasks.map((task) => {
                const pr = PRIORITY_COLORS[task.priority as keyof typeof PRIORITY_COLORS] ?? PRIORITY_COLORS.medium
                return (
                  <div key={task.id} className="flex items-center gap-3 px-3 py-2.5 rounded-xl" style={{ background: "rgba(255,255,255,0.02)" }}>
                    <div className="w-1.5 h-1.5 rounded-full flex-shrink-0" style={{ background: pr.color }} />
                    <p className="flex-1 text-[13px] font-sans truncate" style={{ color: "#E6EDF3" }}>{task.title}</p>
                    {task.due_date && <span className="text-[11px] font-sans flex-shrink-0" style={{ color: "#6B7280" }}>{task.due_date}</span>}
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
        <div className="rounded-2xl p-5" style={{ background: "rgba(255,255,255,0.02)", border: "1px solid rgba(255,255,255,0.06)" }}>
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-2">
              <Megaphone size={15} style={{ color: "#FF6B57" }} />
              <h3 className="text-[14px] font-bold font-sans" style={{ color: "#E6EDF3" }}>Announcements</h3>
            </div>
            <Link href="/member/announcements" className="text-[12px] font-sans" style={{ color: "#6D5DF6" }}>View all →</Link>
          </div>
          {!announcements || announcements.length === 0 ? (
            <div className="flex flex-col items-center py-8 gap-2">
              <Megaphone size={28} style={{ color: "rgba(255,255,255,0.1)" }} />
              <p className="text-[13px] font-sans" style={{ color: "#6B7280" }}>No announcements</p>
            </div>
          ) : (
            <div className="space-y-2">
              {announcements.map((ann) => (
                <div key={ann.id} className="px-3 py-2.5 rounded-xl" style={{ background: "rgba(255,255,255,0.02)" }}>
                  <div className="flex items-center gap-2 mb-0.5">
                    {ann.pinned && <span className="text-[10px] font-semibold" style={{ color: "#6D5DF6" }}>📌</span>}
                    <p className="text-[13px] font-semibold font-sans truncate" style={{ color: "#E6EDF3" }}>{ann.title}</p>
                  </div>
                  <p className="text-[12px] font-sans truncate" style={{ color: "#6B7280" }}>{ann.message}</p>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
