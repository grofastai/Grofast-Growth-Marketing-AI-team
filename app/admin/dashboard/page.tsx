export const revalidate = 60

import { createServerClient } from "@/lib/supabase/server"
import { Users, FolderOpen, Target, CalendarCheck, Clock, CheckCircle2 } from "lucide-react"
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
    { count: activeClients },
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
    { label: "Present Today",  value: presentToday ?? 0,  icon: Users },
    { label: "Active Tasks",   value: activeTasks ?? 0,   icon: Target },
    { label: "Active Clients", value: activeClients ?? 0, icon: FolderOpen },
    { label: "Pending Leaves", value: pendingLeaves ?? 0, icon: CalendarCheck },
  ]

  return (
    <div className="p-8 max-w-[1400px]">
      {/* Header */}
      <div className="flex items-start justify-between mb-8">
        <div>
          <h1 className="text-[30px] leading-tight font-black" style={{ fontFamily: "var(--font-jakarta)", color: "#FFFFFF" }}>
            {greeting}
          </h1>
          <p className="text-sm mt-1" style={{ color: "rgba(255,255,255,0.35)" }}>{dateStr}</p>
        </div>
        <div className="flex gap-3 mt-1">
          <Link href="/admin/team"
            className="px-4 py-2 rounded-lg text-[13px] font-semibold transition-all"
            style={{ background: "#262626", border: "1px solid #2A2A2A", color: "rgba(255,255,255,0.6)" }}>
            + Add Member
          </Link>
          <Link href="/admin/announcements"
            className="px-4 py-2 rounded-lg text-[13px] font-bold transition-all"
            style={{ background: "#A3E635", color: "#0D0D0D" }}>
            Post Announcement
          </Link>
        </div>
      </div>

      {/* Metrics */}
      <div className="grid grid-cols-4 gap-3 mb-5">
        {metrics.map((m) => {
          const Icon = m.icon
          return (
            <div key={m.label}
              className="rounded-xl p-5 transition-all duration-200 hover:-translate-y-0.5 cursor-default"
              style={{ background: "#262626", border: "1px solid #2A2A2A" }}>
              <div className="w-9 h-9 rounded-lg flex items-center justify-center mb-4"
                style={{ background: "rgba(163,230,53,0.08)" }}>
                <Icon size={16} style={{ color: "#A3E635" }} />
              </div>
              <p className="text-[38px] leading-none font-black" style={{ fontFamily: "var(--font-jakarta)", color: "#A3E635" }}>
                {m.value}
              </p>
              <p className="text-[12px] font-medium mt-1.5" style={{ color: "rgba(255,255,255,0.38)" }}>{m.label}</p>
            </div>
          )
        })}
      </div>

      {/* Bottom two panels */}
      <div className="grid grid-cols-2 gap-4">
        {/* Today's Activity */}
        <div className="rounded-xl p-5" style={{ background: "#262626", border: "1px solid #2A2A2A" }}>
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-2">
              <Clock size={14} style={{ color: "#A3E635" }} />
              <h3 className="text-[13px] font-bold" style={{ color: "#FFFFFF" }}>Today's Updates</h3>
            </div>
            <Link href="/admin/activities" className="text-[12px] font-semibold" style={{ color: "#A3E635" }}>View all →</Link>
          </div>
          {recentUpdates.length === 0 ? (
            <div className="flex flex-col items-center py-8 gap-2">
              <Clock size={26} style={{ color: "#2A2A2A" }} />
              <p className="text-[13px]" style={{ color: "rgba(255,255,255,0.2)" }}>No updates submitted yet today</p>
            </div>
          ) : (
            <div className="space-y-1.5">
              {recentUpdates.map((u, i) => {
                const user = Array.isArray(u.users) ? u.users[0] : u.users
                const isPresent = u.attendance_status === "present"
                return (
                  <div key={i} className="flex items-center gap-3 px-3 py-2.5 rounded-lg"
                    style={{ background: "rgba(255,255,255,0.03)" }}>
                    <div className="w-7 h-7 rounded-full flex items-center justify-center flex-shrink-0"
                      style={{ background: "rgba(163,230,53,0.08)" }}>
                      <span className="text-[10px] font-bold" style={{ color: "#A3E635" }}>{(user?.name ?? "?")[0]}</span>
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-[13px] font-semibold truncate" style={{ color: "#FFFFFF" }}>{user?.name ?? "—"}</p>
                      <p className="text-[11px]" style={{ color: "rgba(255,255,255,0.3)" }}>{u.working_hours != null ? `${u.working_hours}h` : "—"} · {u.work_type ?? "—"}</p>
                    </div>
                    <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full"
                      style={isPresent
                        ? { background: "rgba(163,230,53,0.1)", color: "#A3E635" }
                        : { background: "rgba(255,255,255,0.06)", color: "rgba(255,255,255,0.5)" }
                      }>
                      {u.attendance_status}
                    </span>
                  </div>
                )
              })}
            </div>
          )}
        </div>

        {/* Pending Leaves */}
        <div className="rounded-xl p-5" style={{ background: "#262626", border: "1px solid #2A2A2A" }}>
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-2">
              <CalendarCheck size={14} style={{ color: "#A3E635" }} />
              <h3 className="text-[13px] font-bold" style={{ color: "#FFFFFF" }}>Pending Leaves</h3>
            </div>
            <Link href="/admin/leaves" className="text-[12px] font-semibold" style={{ color: "#A3E635" }}>Manage →</Link>
          </div>
          {recentLeaves.length === 0 ? (
            <div className="flex flex-col items-center py-8 gap-2">
              <CheckCircle2 size={26} style={{ color: "#2A2A2A" }} />
              <p className="text-[13px]" style={{ color: "rgba(255,255,255,0.2)" }}>No pending leave requests</p>
            </div>
          ) : (
            <div className="space-y-1.5">
              {recentLeaves.map((l, i) => {
                const user = Array.isArray(l.users) ? l.users[0] : l.users
                return (
                  <div key={i} className="flex items-center gap-3 px-3 py-2.5 rounded-lg"
                    style={{ background: "rgba(255,255,255,0.03)" }}>
                    <div className="w-7 h-7 rounded-full flex items-center justify-center flex-shrink-0"
                      style={{ background: "rgba(163,230,53,0.08)" }}>
                      <span className="text-[10px] font-bold" style={{ color: "#A3E635" }}>{(user?.name ?? "?")[0]}</span>
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-[13px] font-semibold truncate" style={{ color: "#FFFFFF" }}>{user?.name ?? "—"}</p>
                      <p className="text-[11px] truncate" style={{ color: "rgba(255,255,255,0.3)" }}>{l.from_date} → {l.to_date}</p>
                    </div>
                    <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full"
                      style={{ background: "rgba(245,158,11,0.1)", color: "#F59E0B" }}>
                      Pending
                    </span>
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
