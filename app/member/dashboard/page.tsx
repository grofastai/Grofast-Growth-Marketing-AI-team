import { createServerClient } from "@/lib/supabase/server"
import { ClipboardList, Target, CalendarOff, Megaphone, CheckCircle2 } from "lucide-react"
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

  const PRIORITY_STYLE: Record<string, { color: string; bg: string }> = {
    low:    { color: "rgba(255,255,255,0.4)",  bg: "rgba(255,255,255,0.04)" },
    medium: { color: "#F59E0B",                bg: "rgba(245,158,11,0.08)" },
    high:   { color: "#A3E635",                bg: "rgba(163,230,53,0.08)" },
  }

  return (
    <div className="p-8 max-w-[1200px]">
      {/* Header */}
      <div className="flex items-start justify-between mb-7">
        <div>
          <h1 className="text-[30px] leading-tight font-black" style={{ fontFamily: "var(--font-jakarta)", color: "#FFFFFF" }}>
            {greeting}, {profile?.name?.split(" ")[0] ?? "there"}
          </h1>
          <p className="text-sm mt-1" style={{ color: "rgba(255,255,255,0.35)" }}>{dateStr}</p>
        </div>
        <div className="text-right mt-1">
          <p className="text-[9px] uppercase tracking-[0.2em] font-bold mb-1" style={{ color: "rgba(255,255,255,0.2)" }}>Employee ID</p>
          <p className="text-[15px] font-black" style={{ fontFamily: "var(--font-jakarta)", color: "#A3E635" }}>#{profile?.employee_id}</p>
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
      <div className="rounded-xl p-5 mb-5" style={{
        background: "#262626",
        border: todayUpdate ? "1px solid rgba(163,230,53,0.2)" : "1px solid #2A2A2A",
      }}>
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-lg flex items-center justify-center"
              style={{ background: todayUpdate ? "rgba(163,230,53,0.08)" : "rgba(255,255,255,0.04)" }}>
              {todayUpdate
                ? <CheckCircle2 size={18} style={{ color: "#A3E635" }} />
                : <ClipboardList size={18} style={{ color: "rgba(255,255,255,0.35)" }} />
              }
            </div>
            <div>
              <p className="text-[14px] font-bold" style={{ color: "#FFFFFF" }}>
                {todayUpdate ? "Daily update submitted ✓" : "Daily update not submitted yet"}
              </p>
              {todayUpdate ? (
                <div className="flex items-center gap-3 mt-0.5">
                  <span className="text-[11px] font-semibold px-2 py-0.5 rounded-full"
                    style={{ background: "rgba(163,230,53,0.1)", color: "#A3E635" }}>
                    {todayUpdate.attendance_status}
                  </span>
                  {todayUpdate.working_hours && <span className="text-[11px]" style={{ color: "rgba(255,255,255,0.38)" }}>{todayUpdate.working_hours}h work</span>}
                </div>
              ) : (
                <p className="text-[12px] mt-0.5" style={{ color: "rgba(255,255,255,0.28)" }}>Submit your daily update to track your progress.</p>
              )}
            </div>
          </div>
          {!todayUpdate && (
            <Link href="/member/update"
              className="px-5 py-2.5 rounded-lg text-[13px] font-bold transition-all"
              style={{ background: "#A3E635", color: "#0D0D0D" }}>
              Submit Update
            </Link>
          )}
        </div>
      </div>

      {/* Quick stats */}
      <div className="grid grid-cols-3 gap-3 mb-5">
        {[
          { label: "Active Tasks",   value: myTasksCount ?? 0,          icon: Target,     href: "/member/tasks" },
          { label: "Pending Leaves", value: pendingLeavesCount ?? 0,    icon: CalendarOff, href: "/member/leaves" },
          { label: "Announcements",  value: announcements?.length ?? 0, icon: Megaphone,  href: "/member/announcements" },
        ].map((stat) => {
          const Icon = stat.icon
          return (
            <Link key={stat.label} href={stat.href}
              className="rounded-xl p-5 flex items-center gap-4 transition-all hover:-translate-y-0.5"
              style={{ background: "#262626", border: "1px solid #2A2A2A" }}>
              <div className="w-9 h-9 rounded-lg flex items-center justify-center" style={{ background: "rgba(163,230,53,0.08)" }}>
                <Icon size={16} style={{ color: "#A3E635" }} />
              </div>
              <div>
                <p className="text-[30px] font-black leading-none" style={{ fontFamily: "var(--font-jakarta)", color: "#A3E635" }}>{stat.value}</p>
                <p className="text-[11px] font-medium mt-1" style={{ color: "rgba(255,255,255,0.38)" }}>{stat.label}</p>
              </div>
            </Link>
          )
        })}
      </div>

      {/* My Tasks + Announcements */}
      <div className="grid grid-cols-2 gap-4">
        {/* My Tasks */}
        <div className="rounded-xl p-5" style={{ background: "#262626", border: "1px solid #2A2A2A" }}>
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-2">
              <Target size={14} style={{ color: "#A3E635" }} />
              <h3 className="text-[13px] font-bold" style={{ color: "#FFFFFF" }}>My Tasks</h3>
            </div>
            <Link href="/member/tasks" className="text-[12px] font-semibold" style={{ color: "#A3E635" }}>View all →</Link>
          </div>
          {!myTasks || myTasks.length === 0 ? (
            <div className="flex flex-col items-center py-8 gap-2">
              <Target size={26} style={{ color: "#2A2A2A" }} />
              <p className="text-[13px]" style={{ color: "rgba(255,255,255,0.2)" }}>No active tasks</p>
            </div>
          ) : (
            <div className="space-y-1.5">
              {myTasks.map((task) => {
                const pr = PRIORITY_STYLE[task.priority] ?? PRIORITY_STYLE.medium
                return (
                  <div key={task.id} className="flex items-center gap-3 px-3 py-2.5 rounded-lg"
                    style={{ background: "rgba(255,255,255,0.03)" }}>
                    <div className="w-1.5 h-1.5 rounded-full flex-shrink-0" style={{ background: pr.color }} />
                    <p className="flex-1 text-[13px] truncate" style={{ color: "#FFFFFF" }}>{task.title}</p>
                    {task.due_date && <span className="text-[11px] flex-shrink-0" style={{ color: "rgba(255,255,255,0.28)" }}>{task.due_date}</span>}
                    <span className="text-[10px] font-bold px-1.5 py-0.5 rounded flex-shrink-0"
                      style={{ background: pr.bg, color: pr.color }}>
                      {task.priority.toUpperCase()}
                    </span>
                  </div>
                )
              })}
            </div>
          )}
        </div>

        {/* Latest Announcements */}
        <div className="rounded-xl p-5" style={{ background: "#262626", border: "1px solid #2A2A2A" }}>
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-2">
              <Megaphone size={14} style={{ color: "#A3E635" }} />
              <h3 className="text-[13px] font-bold" style={{ color: "#FFFFFF" }}>Announcements</h3>
            </div>
            <Link href="/member/announcements" className="text-[12px] font-semibold" style={{ color: "#A3E635" }}>View all →</Link>
          </div>
          {!announcements || announcements.length === 0 ? (
            <div className="flex flex-col items-center py-8 gap-2">
              <Megaphone size={26} style={{ color: "#2A2A2A" }} />
              <p className="text-[13px]" style={{ color: "rgba(255,255,255,0.2)" }}>No announcements</p>
            </div>
          ) : (
            <div className="space-y-1.5">
              {announcements.map((ann) => (
                <div key={ann.id} className="px-3 py-2.5 rounded-lg" style={{ background: "rgba(255,255,255,0.03)" }}>
                  <div className="flex items-center gap-2 mb-0.5">
                    {ann.pinned && (
                      <span className="text-[10px] font-bold" style={{ color: "#A3E635" }}>PIN</span>
                    )}
                    <p className="text-[13px] font-semibold truncate" style={{ color: "#FFFFFF" }}>{ann.title}</p>
                  </div>
                  <p className="text-[12px] truncate" style={{ color: "rgba(255,255,255,0.3)" }}>{ann.message}</p>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
