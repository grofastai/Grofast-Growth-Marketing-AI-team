import { createServerClient } from "@/lib/supabase/server"
import { Users, FolderOpen, Target, CalendarCheck, TrendingUp, Clock, CheckCircle2 } from "lucide-react"
import Link from "next/link"

type UpdateRow = {
  attendance_status: string
  work_type: string | null
  working_hours: number | null
  users: { name: string; employee_id: string } | null
}

type LeaveRow = {
  from_date: string
  to_date: string
  users: { name: string; employee_id: string } | null
}

export default async function DashboardPage() {
  const supabase = await createServerClient()
  const today = new Date().toISOString().split("T")[0]

  const [
    { count: presentToday },
    { count: activeTasks },
    { count: activeProjects },
    { count: pendingLeaves },
    { data: recentUpdatesRaw },
    { data: recentLeavesRaw },
  ] = await Promise.all([
    supabase.from("daily_updates").select("*", { count: "exact", head: true }).eq("date", today).eq("attendance_status", "present"),
    supabase.from("tasks").select("*", { count: "exact", head: true }).neq("status", "completed"),
    supabase.from("projects").select("*", { count: "exact", head: true }).eq("status", "active"),
    supabase.from("leaves").select("*", { count: "exact", head: true }).eq("status", "pending"),
    supabase.from("daily_updates").select("attendance_status, work_type, working_hours, users(name, employee_id)").eq("date", today).order("created_at", { ascending: false }).limit(5),
    supabase.from("leaves").select("from_date, to_date, reason, status, users(name, employee_id)").eq("status", "pending").order("created_at", { ascending: false }).limit(5),
  ])

  const recentUpdates = (recentUpdatesRaw ?? []) as unknown as UpdateRow[]
  const recentLeaves = (recentLeavesRaw ?? []) as unknown as LeaveRow[]

  const now = new Date()
  const hour = now.getHours()
  const greeting = hour < 12 ? "Good morning" : hour < 18 ? "Good afternoon" : "Good evening"
  const dateStr = now.toLocaleDateString("en-US", { weekday: "long", day: "numeric", month: "long", year: "numeric" })

  const metrics = [
    { label: "Present Today", value: presentToday ?? 0, icon: Users, color: "#10B981", bg: "rgba(16,185,129,0.08)", border: "rgba(16,185,129,0.15)" },
    { label: "Active Tasks", value: activeTasks ?? 0, icon: Target, color: "#6D5DF6", bg: "rgba(109,93,246,0.08)", border: "rgba(109,93,246,0.15)" },
    { label: "Active Projects", value: activeProjects ?? 0, icon: FolderOpen, color: "#F59E0B", bg: "rgba(245,158,11,0.08)", border: "rgba(245,158,11,0.15)" },
    { label: "Pending Leaves", value: pendingLeaves ?? 0, icon: CalendarCheck, color: "#FF6B57", bg: "rgba(255,107,87,0.08)", border: "rgba(255,107,87,0.15)" },
  ]

  const statusColors: Record<string, { bg: string; text: string; label: string }> = {
    present: { bg: "rgba(16,185,129,0.12)", text: "#10B981", label: "Present" },
    absent: { bg: "rgba(255,107,87,0.12)", text: "#FF6B57", label: "Absent" },
    holiday: { bg: "rgba(245,158,11,0.12)", text: "#F59E0B", label: "Holiday" },
    outside: { bg: "rgba(109,93,246,0.12)", text: "#6D5DF6", label: "Outside" },
  }

  return (
    <div className="p-8 max-w-[1400px]">
      {/* Header */}
      <div className="flex items-start justify-between mb-8">
        <div>
          <h1 className="text-[32px] leading-tight" style={{ fontFamily: "var(--font-jakarta)", fontWeight: 800, color: "#E6EDF3" }}>
            {greeting} 👋
          </h1>
          <p className="text-sm mt-1 font-sans" style={{ color: "#6B7280" }}>{dateStr}</p>
        </div>
        <div className="flex gap-3 mt-2">
          <Link href="/admin/team" className="px-4 py-2 rounded-xl text-[13px] font-semibold font-sans" style={{ background: "rgba(109,93,246,0.12)", border: "1px solid rgba(109,93,246,0.2)", color: "#6D5DF6" }}>
            + Add Member
          </Link>
          <Link href="/admin/announcements" className="px-4 py-2 rounded-xl text-[13px] font-semibold font-sans text-white" style={{ background: "linear-gradient(135deg, #FF6B57, #E85A45)", boxShadow: "0 4px 16px rgba(255,107,87,0.25)" }}>
            Post Announcement
          </Link>
        </div>
      </div>

      {/* Metrics */}
      <div className="grid grid-cols-4 gap-4 mb-6">
        {metrics.map((m) => {
          const Icon = m.icon
          return (
            <div key={m.label} className="rounded-2xl p-5 transition-all duration-200 hover:-translate-y-0.5 cursor-default"
              style={{ background: m.bg, border: `1px solid ${m.border}`, backdropFilter: "blur(10px)" }}>
              <div className="flex items-start justify-between mb-4">
                <div className="w-10 h-10 rounded-xl flex items-center justify-center" style={{ background: "rgba(255,255,255,0.06)" }}>
                  <Icon size={18} style={{ color: m.color }} />
                </div>
                <TrendingUp size={14} style={{ color: m.color, opacity: 0.5 }} />
              </div>
              <p className="text-[36px] leading-none font-black" style={{ fontFamily: "var(--font-jakarta)", color: "#E6EDF3" }}>
                {m.value}
              </p>
              <p className="text-[13px] font-semibold font-sans mt-1.5" style={{ color: "#E6EDF3" }}>{m.label}</p>
            </div>
          )
        })}
      </div>

      {/* Bottom two panels */}
      <div className="grid grid-cols-2 gap-4">
        {/* Today's Activity */}
        <div className="rounded-2xl p-5" style={{ background: "rgba(255,255,255,0.02)", border: "1px solid rgba(255,255,255,0.06)" }}>
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-2">
              <Clock size={15} style={{ color: "#6D5DF6" }} />
              <h3 className="text-[14px] font-bold font-sans" style={{ color: "#E6EDF3" }}>Today's Updates</h3>
            </div>
            <Link href="/admin/activities" className="text-[12px] font-sans" style={{ color: "#6D5DF6" }}>View all →</Link>
          </div>
          {recentUpdates.length === 0 ? (
            <div className="flex flex-col items-center py-8 gap-2">
              <Clock size={28} style={{ color: "rgba(255,255,255,0.1)" }} />
              <p className="text-[13px] font-sans" style={{ color: "#6B7280" }}>No updates submitted yet today</p>
            </div>
          ) : (
            <div className="space-y-2">
              {recentUpdates.map((u, i) => {
                const user = Array.isArray(u.users) ? u.users[0] : u.users
                const sc = statusColors[u.attendance_status] ?? statusColors.present
                return (
                  <div key={i} className="flex items-center gap-3 px-3 py-2.5 rounded-xl" style={{ background: "rgba(255,255,255,0.02)" }}>
                    <div className="w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0" style={{ background: "rgba(109,93,246,0.12)" }}>
                      <span className="text-[11px] font-bold" style={{ color: "#6D5DF6" }}>{(user?.name ?? "?")[0]}</span>
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-[13px] font-semibold font-sans truncate" style={{ color: "#E6EDF3" }}>{user?.name ?? "—"}</p>
                      <p className="text-[11px] font-sans" style={{ color: "#6B7280" }}>{u.working_hours != null ? `${u.working_hours}h` : "—"} · {u.work_type ?? "—"}</p>
                    </div>
                    <span className="text-[11px] font-semibold font-sans px-2 py-0.5 rounded-full" style={{ background: sc.bg, color: sc.text }}>{sc.label}</span>
                  </div>
                )
              })}
            </div>
          )}
        </div>

        {/* Pending Leaves */}
        <div className="rounded-2xl p-5" style={{ background: "rgba(255,255,255,0.02)", border: "1px solid rgba(255,255,255,0.06)" }}>
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-2">
              <CalendarCheck size={15} style={{ color: "#FF6B57" }} />
              <h3 className="text-[14px] font-bold font-sans" style={{ color: "#E6EDF3" }}>Pending Leaves</h3>
            </div>
            <Link href="/admin/leaves" className="text-[12px] font-sans" style={{ color: "#6D5DF6" }}>Manage →</Link>
          </div>
          {recentLeaves.length === 0 ? (
            <div className="flex flex-col items-center py-8 gap-2">
              <CheckCircle2 size={28} style={{ color: "rgba(255,255,255,0.1)" }} />
              <p className="text-[13px] font-sans" style={{ color: "#6B7280" }}>No pending leave requests</p>
            </div>
          ) : (
            <div className="space-y-2">
              {recentLeaves.map((l, i) => {
                const user = Array.isArray(l.users) ? l.users[0] : l.users
                return (
                  <div key={i} className="flex items-center gap-3 px-3 py-2.5 rounded-xl" style={{ background: "rgba(255,255,255,0.02)" }}>
                    <div className="w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0" style={{ background: "rgba(255,107,87,0.1)" }}>
                      <span className="text-[11px] font-bold" style={{ color: "#FF6B57" }}>{(user?.name ?? "?")[0]}</span>
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-[13px] font-semibold font-sans truncate" style={{ color: "#E6EDF3" }}>{user?.name ?? "—"}</p>
                      <p className="text-[11px] font-sans truncate" style={{ color: "#6B7280" }}>{l.from_date} → {l.to_date}</p>
                    </div>
                    <span className="text-[11px] font-semibold font-sans px-2 py-0.5 rounded-full" style={{ background: "rgba(245,158,11,0.12)", color: "#F59E0B" }}>Pending</span>
                  </div>
                )
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
