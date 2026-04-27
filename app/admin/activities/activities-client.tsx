"use client"

import { useRouter, usePathname } from "next/navigation"
import { Activity, Clock, Camera, BookOpen, Filter } from "lucide-react"

interface Update {
  id: string
  date: string
  attendance_status: string
  work_type: string | null
  working_hours: number | null
  learning_hours: number
  shoot_count: number
  notes: string | null
  users: { id: string; name: string; employee_id: string; role: string } | null
}

interface Member {
  id: string
  name: string
  employee_id: string
}

const STATUS = {
  present: { bg: "rgba(16,185,129,0.12)", text: "#10B981", label: "Present" },
  absent: { bg: "rgba(255,107,87,0.12)", text: "#FF6B57", label: "Absent" },
  holiday: { bg: "rgba(245,158,11,0.12)", text: "#F59E0B", label: "Holiday" },
  outside: { bg: "rgba(109,93,246,0.12)", text: "#6D5DF6", label: "Outside" },
}

const WORK_TYPE = {
  office: "Office",
  outside: "Outside",
  wfh: "WFH",
}

function getInitials(name: string) {
  return name.split(" ").map((n) => n[0]).join("").slice(0, 2).toUpperCase()
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

  const presentCount = updates.filter((u) => u.attendance_status === "present").length
  const absentCount = updates.filter((u) => u.attendance_status === "absent").length
  const totalHours = updates.reduce((sum, u) => sum + (u.working_hours ?? 0), 0)

  return (
    <div className="p-8 max-w-[1400px]">
      {/* Header */}
      <div className="flex items-start justify-between mb-6">
        <div>
          <h1 className="text-[32px] leading-tight" style={{ fontFamily: "var(--font-jakarta)", fontWeight: 800, color: "#E6EDF3" }}>
            Activities
          </h1>
          <p className="text-sm mt-1 font-sans" style={{ color: "#6B7280" }}>Daily updates from all team members.</p>
        </div>
      </div>

      {/* Summary chips */}
      <div className="flex gap-3 mb-6">
        {[
          { label: "Updates", value: updates.length, color: "#6D5DF6", bg: "rgba(109,93,246,0.1)" },
          { label: "Present", value: presentCount, color: "#10B981", bg: "rgba(16,185,129,0.1)" },
          { label: "Absent", value: absentCount, color: "#FF6B57", bg: "rgba(255,107,87,0.1)" },
          { label: "Total Hours", value: `${totalHours.toFixed(1)}h`, color: "#F59E0B", bg: "rgba(245,158,11,0.1)" },
        ].map((chip) => (
          <div key={chip.label} className="flex items-center gap-2 px-4 py-2 rounded-xl" style={{ background: chip.bg }}>
            <span className="text-[14px] font-bold font-sans" style={{ color: chip.color }}>{chip.value}</span>
            <span className="text-[12px] font-sans" style={{ color: chip.color, opacity: 0.7 }}>{chip.label}</span>
          </div>
        ))}
      </div>

      {/* Filters */}
      <div className="flex gap-3 mb-6">
        <div className="flex items-center gap-2 px-3 py-2 rounded-xl" style={{ background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.08)" }}>
          <Filter size={13} style={{ color: "#6B7280" }} />
          <input
            type="date"
            value={dateFilter}
            onChange={(e) => navigate(e.target.value, memberFilter)}
            className="bg-transparent text-[13px] font-sans outline-none"
            style={{ color: "#E6EDF3", colorScheme: "dark" }}
          />
        </div>
        <select
          value={memberFilter}
          onChange={(e) => navigate(dateFilter, e.target.value)}
          className="px-3 py-2 rounded-xl text-[13px] font-sans outline-none"
          style={{ background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.08)", color: "#E6EDF3", colorScheme: "dark" }}
        >
          <option value="">All Members</option>
          {members.map((m) => (
            <option key={m.id} value={m.id}>{m.name} ({m.employee_id})</option>
          ))}
        </select>
      </div>

      {/* List */}
      {updates.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-24 rounded-2xl" style={{ background: "rgba(255,255,255,0.02)", border: "1px solid rgba(255,255,255,0.06)" }}>
          <Activity size={40} style={{ color: "rgba(255,255,255,0.1)" }} className="mb-3" />
          <p className="text-[14px] font-semibold font-sans" style={{ color: "#6B7280" }}>No updates for this date</p>
          <p className="text-[12px] font-sans mt-1" style={{ color: "#4B5563" }}>Team members haven't submitted their daily update yet.</p>
        </div>
      ) : (
        <div className="space-y-3">
          {updates.map((u) => {
            const sc = STATUS[u.attendance_status as keyof typeof STATUS] ?? STATUS.present
            const wt = u.work_type ? WORK_TYPE[u.work_type as keyof typeof WORK_TYPE] : null
            const user = Array.isArray(u.users) ? u.users[0] : u.users
            return (
              <div key={u.id} className="rounded-2xl p-5" style={{ background: "rgba(255,255,255,0.02)", border: "1px solid rgba(255,255,255,0.06)" }}>
                <div className="flex items-start gap-4">
                  {/* Avatar */}
                  <div className="w-10 h-10 rounded-full flex items-center justify-center flex-shrink-0" style={{ background: "rgba(109,93,246,0.12)", border: "1.5px solid rgba(109,93,246,0.2)" }}>
                    <span className="text-[12px] font-bold" style={{ fontFamily: "var(--font-jakarta)", color: "#6D5DF6" }}>
                      {user?.name ? getInitials(user.name) : "?"}
                    </span>
                  </div>

                  {/* Info */}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-2">
                      <p className="text-[14px] font-bold font-sans" style={{ color: "#E6EDF3" }}>{user?.name ?? "Unknown"}</p>
                      <span className="text-[11px] font-sans" style={{ color: "#6B7280" }}>#{user?.employee_id}</span>
                      <span className="text-[11px] font-semibold px-2 py-0.5 rounded-full ml-auto" style={{ background: sc.bg, color: sc.text }}>{sc.label}</span>
                      {wt && (
                        <span className="text-[11px] font-semibold px-2 py-0.5 rounded-full" style={{ background: "rgba(255,255,255,0.05)", color: "#9CA3AF" }}>{wt}</span>
                      )}
                    </div>

                    {/* Stats row */}
                    <div className="flex gap-4 mb-2">
                      <div className="flex items-center gap-1.5">
                        <Clock size={12} style={{ color: "#6B7280" }} />
                        <span className="text-[12px] font-sans" style={{ color: "#9CA3AF" }}>
                          {u.working_hours != null ? `${u.working_hours}h work` : "—"}
                        </span>
                      </div>
                      <div className="flex items-center gap-1.5">
                        <BookOpen size={12} style={{ color: "#6B7280" }} />
                        <span className="text-[12px] font-sans" style={{ color: "#9CA3AF" }}>{u.learning_hours}h learning</span>
                      </div>
                      {u.shoot_count > 0 && (
                        <div className="flex items-center gap-1.5">
                          <Camera size={12} style={{ color: "#6B7280" }} />
                          <span className="text-[12px] font-sans" style={{ color: "#9CA3AF" }}>{u.shoot_count} shoots</span>
                        </div>
                      )}
                    </div>

                    {u.notes && (
                      <p className="text-[12px] font-sans px-3 py-2 rounded-lg" style={{ background: "rgba(255,255,255,0.03)", color: "#9CA3AF" }}>
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
