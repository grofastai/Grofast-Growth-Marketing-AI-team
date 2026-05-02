"use client"

import { useRouter, usePathname } from "next/navigation"
import { Activity, Clock, Camera, BookOpen, Filter, AlertTriangle, UserX, Target } from "lucide-react"

interface Update {
  id: string
  date: string
  attendance_status: string
  work_type: string | null
  working_hours: number | null
  learning_hours: number
  shoot_count: number
  notes: string | null
  task_id: string | null
  users: { id: string; name: string; employee_id: string; role: string } | null
  tasks: { title: string } | null
}

interface Member { id: string; name: string; employee_id: string }

const ATTENDANCE_STYLE: Record<string, { bg: string; color: string; label: string }> = {
  present: { bg: "rgba(220,38,38,0.1)",  color: "#DC2626", label: "Present" },
  absent:  { bg: "rgba(255,107,87,0.1)",  color: "#FF6B57", label: "Absent" },
  holiday: { bg: "rgba(245,158,11,0.1)",  color: "#F59E0B", label: "Holiday" },
  outside: { bg: "rgba(0,0,0,0.05)", color: "#4B5563", label: "Outside" },
}

const WORK_TYPE: Record<string, string> = { office: "Office", outside: "Outside", wfh: "WFH" }

function getInitials(name: string) {
  return name.split(" ").map((n) => n[0]).join("").slice(0, 2).toUpperCase()
}

function ControlFlag({ hours, attendance }: { hours: number | null; attendance: string }) {
  if (attendance !== "present") return null
  if (hours == null) return (
    <span className="text-[10px] font-bold px-2 py-0.5 rounded-full"
      style={{ background: "rgba(255,107,87,0.1)", color: "#FF6B57" }}>
      No hours logged
    </span>
  )
  if (hours < 6) return (
    <span className="flex items-center gap-1 text-[10px] font-bold px-2 py-0.5 rounded-full"
      style={{ background: "rgba(245,158,11,0.1)", color: "#F59E0B" }}>
      <AlertTriangle size={9} /> Low ({hours}h)
    </span>
  )
  return null
}

export default function ActivitiesClient({
  updates,
  members,
  dateFilter,
  memberFilter,
}: {
  updates: Update[]
  members: Member[]
  dateFilter: string
  memberFilter: string
}) {
  const router = useRouter()
  const pathname = usePathname()

  function navigate(date: string, member: string) {
    const params = new URLSearchParams()
    if (date) params.set("date", date)
    if (member) params.set("member", member)
    router.push(`${pathname}?${params.toString()}`)
  }

  const submittedIds = new Set(updates.map((u) => {
    const user = Array.isArray(u.users) ? u.users[0] : u.users
    return user?.id
  }))
  const notUpdated = memberFilter ? [] : members.filter((m) => !submittedIds.has(m.id))

  const presentCount = updates.filter((u) => u.attendance_status === "present").length
  const absentCount  = updates.filter((u) => u.attendance_status === "absent").length
  const totalHours   = updates.reduce((sum, u) => sum + (u.working_hours ?? 0), 0)
  const lowHoursCount = updates.filter((u) => u.attendance_status === "present" && (u.working_hours ?? 0) < 6).length

  return (
    <div className="p-8 max-w-[1200px]">
      {/* Header */}
      <div className="mb-6">
        <h1 className="gradient-heading text-[30px] font-black leading-tight" style={{ fontFamily: "var(--font-jakarta)" }}>
          Activities
        </h1>
        <p className="text-sm mt-1" style={{ color: "#9CA3AF" }}>Daily updates from all team members.</p>
      </div>

      {/* Summary chips */}
      <div className="flex flex-wrap gap-3 mb-6">
        {[
          { label: "Updates",    value: updates.length,          color: "#111111",  bg: "#FFFFFF", border: "#E5E7EB" },
          { label: "Present",    value: presentCount,            color: "#DC2626",  bg: "rgba(220,38,38,0.06)",  border: "rgba(220,38,38,0.15)" },
          { label: "Absent",     value: absentCount,             color: "#FF6B57",  bg: "rgba(255,107,87,0.06)",  border: "rgba(255,107,87,0.15)" },
          { label: "Total Hours",value: `${totalHours.toFixed(1)}h`, color: "#F59E0B", bg: "rgba(245,158,11,0.06)", border: "rgba(245,158,11,0.15)" },
          { label: "Not Updated",value: notUpdated.length,        color: notUpdated.length > 0 ? "#FF6B57" : "#9CA3AF", bg: notUpdated.length > 0 ? "rgba(255,107,87,0.06)" : "#FFFFFF", border: notUpdated.length > 0 ? "rgba(255,107,87,0.15)" : "#E5E7EB" },
        ].map((chip) => (
          <div key={chip.label} className="flex items-center gap-2 px-4 py-2 rounded-lg"
            style={{ background: chip.bg, border: `1px solid ${chip.border}` }}>
            <span className="text-[15px] font-black" style={{ fontFamily: "var(--font-jakarta)", color: chip.color }}>{chip.value}</span>
            <span className="text-[11px] font-medium" style={{ color: "#9CA3AF" }}>{chip.label}</span>
          </div>
        ))}
        {lowHoursCount > 0 && (
          <div className="flex items-center gap-2 px-4 py-2 rounded-lg"
            style={{ background: "rgba(245,158,11,0.06)", border: "1px solid rgba(245,158,11,0.15)" }}>
            <AlertTriangle size={13} style={{ color: "#F59E0B" }} />
            <span className="text-[11px] font-bold" style={{ color: "#F59E0B" }}>{lowHoursCount} low productivity</span>
          </div>
        )}
      </div>

      {/* Filters */}
      <div className="flex gap-3 mb-6">
        <div className="flex items-center gap-2 px-3 py-2 rounded-lg"
          style={{ background: "#FFFFFF", border: "1px solid #E5E7EB", boxShadow: "0 1px 2px rgba(0,0,0,0.04)" }}>
          <Filter size={12} style={{ color: "#9CA3AF" }} />
          <input type="date" value={dateFilter}
            onChange={(e) => navigate(e.target.value, memberFilter)}
            className="bg-transparent text-[13px] outline-none"
            style={{ color: "#111111", colorScheme: "light" }} />
        </div>
        <select value={memberFilter} onChange={(e) => navigate(dateFilter, e.target.value)}
          className="px-3 py-2 rounded-lg text-[13px] outline-none"
          style={{ background: "#FFFFFF", border: "1px solid #E5E7EB", color: "#111111", boxShadow: "0 1px 2px rgba(0,0,0,0.04)" }}>
          <option value="">All Members</option>
          {members.map((m) => (
            <option key={m.id} value={m.id}>{m.name} ({m.employee_id})</option>
          ))}
        </select>
      </div>

      {/* Not updated members */}
      {notUpdated.length > 0 && (
        <div className="rounded-xl p-4 mb-5" style={{ background: "rgba(255,107,87,0.04)", border: "1px solid rgba(255,107,87,0.15)" }}>
          <div className="flex items-center gap-2 mb-3">
            <UserX size={13} style={{ color: "#FF6B57" }} />
            <span className="text-[12px] font-bold uppercase tracking-wider" style={{ color: "#FF6B57" }}>
              Not Updated ({notUpdated.length})
            </span>
          </div>
          <div className="flex flex-wrap gap-2">
            {notUpdated.map((m) => (
              <span key={m.id} className="text-[12px] font-semibold px-3 py-1 rounded-full"
                style={{ background: "rgba(255,107,87,0.1)", color: "#FF6B57" }}>
                {m.name} <span style={{ opacity: 0.6 }}>#{m.employee_id}</span>
              </span>
            ))}
          </div>
        </div>
      )}

      {/* Updates list */}
      {updates.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-24 rounded-xl"
          style={{ background: "#FFFFFF", border: "1px solid #2A2A2A" }}>
          <Activity size={36} style={{ color: "rgba(0,0,0,0.06)" }} className="mb-3" />
          <p className="text-[14px] font-semibold" style={{ color: "#9CA3AF" }}>No updates for this date</p>
          <p className="text-[12px] mt-1" style={{ color: "rgba(0,0,0,0.08)" }}>Team members haven't submitted yet.</p>
        </div>
      ) : (
        <div className="space-y-2">
          {updates.map((u) => {
            const sc = ATTENDANCE_STYLE[u.attendance_status] ?? ATTENDANCE_STYLE.present
            const wt = u.work_type ? WORK_TYPE[u.work_type] : null
            const user = Array.isArray(u.users) ? u.users[0] : u.users
            const task = Array.isArray(u.tasks) ? u.tasks[0] : u.tasks

            return (
              <div key={u.id} className="rounded-xl p-5"
                style={{ background: "#FFFFFF", border: "1px solid #2A2A2A" }}>
                <div className="flex items-start gap-4">
                  {/* Avatar */}
                  <div className="w-10 h-10 rounded-full flex items-center justify-center flex-shrink-0"
                    style={{ background: "rgba(220,38,38,0.08)", border: "1px solid rgba(220,38,38,0.15)" }}>
                    <span className="text-[11px] font-bold" style={{ fontFamily: "var(--font-jakarta)", color: "#DC2626" }}>
                      {user?.name ? getInitials(user.name) : "?"}
                    </span>
                  </div>

                  {/* Info */}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center flex-wrap gap-2 mb-2">
                      <p className="text-[14px] font-bold" style={{ color: "#111111" }}>{user?.name ?? "Unknown"}</p>
                      <span className="text-[11px]" style={{ color: "#9CA3AF" }}>#{user?.employee_id}</span>
                      <span className="text-[11px] font-bold px-2 py-0.5 rounded-full ml-auto"
                        style={{ background: sc.bg, color: sc.color }}>
                        {sc.label}
                      </span>
                      {wt && (
                        <span className="text-[11px] font-semibold px-2 py-0.5 rounded-full"
                          style={{ background: "rgba(0,0,0,0.04)", color: "#6B7280" }}>
                          {wt}
                        </span>
                      )}
                      <ControlFlag hours={u.working_hours} attendance={u.attendance_status} />
                    </div>

                    {/* Stats */}
                    <div className="flex flex-wrap gap-4 mb-2">
                      <div className="flex items-center gap-1.5">
                        <Clock size={11} style={{ color: "#D1D5DB" }} />
                        <span className="text-[12px]" style={{ color: "#6B7280" }}>
                          {u.working_hours != null ? `${u.working_hours}h work` : "—"}
                        </span>
                      </div>
                      <div className="flex items-center gap-1.5">
                        <BookOpen size={11} style={{ color: "#D1D5DB" }} />
                        <span className="text-[12px]" style={{ color: "#6B7280" }}>{u.learning_hours}h learning</span>
                      </div>
                      {u.shoot_count > 0 && (
                        <div className="flex items-center gap-1.5">
                          <Camera size={11} style={{ color: "#D1D5DB" }} />
                          <span className="text-[12px]" style={{ color: "#6B7280" }}>{u.shoot_count} shoots</span>
                        </div>
                      )}
                    </div>

                    {/* Task link */}
                    {task && (
                      <div className="flex items-center gap-1.5 mb-2">
                        <Target size={11} style={{ color: "#DC2626" }} />
                        <span className="text-[12px] font-semibold" style={{ color: "rgba(220,38,38,0.8)" }}>{task.title}</span>
                      </div>
                    )}

                    {u.notes && (
                      <p className="text-[12px] px-3 py-2 rounded-lg" style={{ background: "rgba(0,0,0,0.02)", color: "#6B7280" }}>
                        {u.notes}
                      </p>
                    )}
                  </div>
                </div>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
