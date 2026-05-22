"use client"

import { useState } from "react"
import { useRouter, usePathname } from "next/navigation"
import { Activity, Clock, Camera, BookOpen, Filter, AlertTriangle, UserX, Target, ChevronDown, ChevronUp, Edit2, MapPin, Link2, Video } from "lucide-react"

type WorkEntry = Record<string, unknown>

interface Update {
  id: string
  date: string
  attendance_status: string
  work_type: string | null
  working_hours: number | null
  learning_hours: number
  learning_topic: string | null
  learning_notes: string | null
  shoot_count: number
  editing_count: number | null
  active_tab: string | null
  notes: string | null
  task_id: string | null
  work_entries: WorkEntry[] | null
  users: { id: string; name: string; employee_id: string; role: string } | null
  tasks: { title: string } | null
  tasks_completed: number
  tasks_total: number
}

interface Member { id: string; name: string; employee_id: string }

const ATTENDANCE_STYLE: Record<string, { bg: string; color: string; label: string }> = {
  present: { bg: "rgba(222,26,26,0.1)",  color: "#de1a1a", label: "Present" },
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

function fmtHours(h: unknown): string {
  const n = Number(h)
  if (!n) return "—"
  const hrs = Math.floor(n)
  const mins = Math.round((n - hrs) * 60)
  if (hrs && mins) return `${hrs}h ${mins}m`
  if (hrs) return `${hrs}h`
  return `${mins}m`
}

function clientLabel(entry: WorkEntry): string {
  const ct = entry._client_type as string | undefined
  const brand = entry._brand as string | undefined
  const custom = entry._custom_client as string | undefined
  const client = entry.client as string | undefined
  if (ct === "Promotion" && brand) return `📣 ${brand}`
  if (ct === "__custom__" && custom) return `✏️ ${custom}`
  return client || "—"
}

function WorkEntriesDetail({ entries, activeTab, learningTopic, learningNotes, learningHours }: {
  entries: WorkEntry[] | null
  activeTab: string | null
  learningTopic: string | null
  learningNotes: string | null
  learningHours: number
}) {
  if (!entries?.length && activeTab !== "learning") return (
    <p className="text-[12px] italic" style={{ color: "#9CA3AF" }}>No detailed entries recorded.</p>
  )

  if (activeTab === "learning") {
    return (
      <div className="rounded-lg p-3" style={{ background: "rgba(99,102,241,0.05)", border: "1px solid rgba(99,102,241,0.15)" }}>
        <div className="flex items-center gap-2 mb-1">
          <BookOpen size={12} style={{ color: "#6366F1" }} />
          <span className="text-[12px] font-bold" style={{ color: "#6366F1" }}>Learning</span>
          <span className="text-[11px]" style={{ color: "#6B7280" }}>{fmtHours(learningHours)}</span>
        </div>
        {learningTopic && <p className="text-[12px] font-semibold" style={{ color: "#111111" }}>{learningTopic}</p>}
        {learningNotes && <p className="text-[12px] mt-1" style={{ color: "#6B7280" }}>{learningNotes}</p>}
      </div>
    )
  }

  const shoots = entries?.filter(e => e.task_type === "shoot") ?? []
  const edits  = entries?.filter(e => e.task_type === "edit") ?? []
  const works  = entries?.filter(e => e.task_type === "work") ?? []

  return (
    <div className="space-y-3">
      {/* Time blocks */}
      {works.length > 0 && (
        <div>
          <p className="text-[10px] font-bold uppercase tracking-wider mb-2" style={{ color: "#9CA3AF" }}>Work Log</p>
          <div className="space-y-1.5">
            {works.map((e, i) => (
              <div key={i} className="flex items-start gap-3 px-3 py-2 rounded-lg" style={{ background: "rgba(0,0,0,0.02)", border: "1px solid #F3F4F6" }}>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-[12px] font-semibold truncate" style={{ color: "#111111" }}>{String(e.title || "—")}</span>
                    {!!(e.client) && <span className="text-[11px] px-2 py-0.5 rounded-full" style={{ background: "rgba(222,26,26,0.06)", color: "#de1a1a" }}>{String(e.client)}</span>}
                    {!!(e.start_time || e.end_time) && (
                      <span className="text-[11px]" style={{ color: "#9CA3AF" }}>{String(e.start_time ?? "")} – {String(e.end_time ?? "")}</span>
                    )}
                    <span className="text-[11px] font-bold ml-auto" style={{ color: "#374151" }}>{fmtHours(e.duration_hours)}</span>
                  </div>
                  {!!(e.notes) && <p className="text-[11px] mt-0.5 truncate" style={{ color: "#9CA3AF" }}>{String(e.notes)}</p>}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Shoots */}
      {shoots.length > 0 && (
        <div>
          <p className="text-[10px] font-bold uppercase tracking-wider mb-2" style={{ color: "#9CA3AF" }}>Shoots ({shoots.length})</p>
          <div className="space-y-2">
            {shoots.map((e, i) => (
              <div key={i} className="px-3 py-2.5 rounded-lg" style={{ background: "rgba(222,26,26,0.02)", border: "1px solid rgba(222,26,26,0.08)" }}>
                <div className="flex items-start gap-2 flex-wrap">
                  <Camera size={11} style={{ color: "#de1a1a", marginTop: 2, flexShrink: 0 }} />
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-[12px] font-semibold" style={{ color: "#111111" }}>{String(e.title || "—")}</span>
                      <span className="text-[11px] px-2 py-0.5 rounded-full" style={{ background: "rgba(222,26,26,0.06)", color: "#de1a1a" }}>{clientLabel(e)}</span>
                      <span className="text-[11px] font-bold ml-auto" style={{ color: "#374151" }}>{fmtHours(e.duration_hours)}</span>
                    </div>
                    <div className="flex flex-wrap gap-x-3 gap-y-0.5 mt-1">
                      {!!(e._location) && (
                        <span className="flex items-center gap-1 text-[11px]" style={{ color: "#6B7280" }}>
                          <MapPin size={9} /> {String(e._location)}
                        </span>
                      )}
                      {!!(e.video_link) && (
                        <a href={String(e.video_link)} target="_blank" rel="noreferrer"
                          className="flex items-center gap-1 text-[11px]" style={{ color: "#de1a1a" }}>
                          <Link2 size={9} /> Drive Link
                        </a>
                      )}
                      {!!(e._travel_hours) && Number(e._travel_hours) > 0 && (
                        <span className="text-[11px]" style={{ color: "#9CA3AF" }}>Travel: {fmtHours(e._travel_hours)}</span>
                      )}
                    </div>
                    {!!(e.notes) && <p className="text-[11px] mt-0.5" style={{ color: "#9CA3AF" }}>{String(e.notes)}</p>}
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Edits */}
      {edits.length > 0 && (
        <div>
          <p className="text-[10px] font-bold uppercase tracking-wider mb-2" style={{ color: "#9CA3AF" }}>Editing ({edits.length})</p>
          <div className="space-y-1.5">
            {edits.map((e, i) => (
              <div key={i} className="px-3 py-2.5 rounded-lg" style={{ background: "rgba(99,102,241,0.02)", border: "1px solid rgba(99,102,241,0.08)" }}>
                <div className="flex items-center gap-2 flex-wrap">
                  <Edit2 size={11} style={{ color: "#6366F1", flexShrink: 0 }} />
                  <span className="text-[12px] font-semibold" style={{ color: "#111111" }}>{String(e.title || "—")}</span>
                  <span className="text-[11px] px-2 py-0.5 rounded-full" style={{ background: "rgba(99,102,241,0.06)", color: "#6366F1" }}>{clientLabel(e)}</span>
                  {!!(e.video_type) && <span className="text-[11px]" style={{ color: "#9CA3AF" }}>{String(e.video_type)}</span>}
                  <span className="text-[11px] font-bold ml-auto" style={{ color: "#374151" }}>{fmtHours(e.duration_hours)}</span>
                </div>
                <div className="flex flex-wrap gap-x-3 mt-1">
                  {!!(e.video_duration) && <span className="text-[11px]" style={{ color: "#9CA3AF" }}>Duration: {String(e.video_duration)}</span>}
                  {!!(e.revisions) && Number(e.revisions) > 0 && <span className="text-[11px]" style={{ color: "#9CA3AF" }}>Revisions: {String(e.revisions)}</span>}
                  {!!(e.video_link) && (
                    <a href={String(e.video_link)} target="_blank" rel="noreferrer"
                      className="flex items-center gap-1 text-[11px]" style={{ color: "#6366F1" }}>
                      <Video size={9} /> Video Link
                    </a>
                  )}
                </div>
                {!!(e.notes) && <p className="text-[11px] mt-0.5" style={{ color: "#9CA3AF" }}>{String(e.notes)}</p>}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
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
  const [expandedId, setExpandedId] = useState<string | null>(null)

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
    <div className="p-4 md:p-6 xl:p-8 max-w-[1400px]">
      {/* Header */}
      <div className="mb-6">
        <h1 className="gradient-heading text-[30px] font-black leading-tight" style={{ fontFamily: "var(--font-jakarta)" }}>
          Activities
        </h1>
        <p className="text-sm mt-1" style={{ color: "#6B7280" }}>Daily updates from all team members.</p>
      </div>

      {/* Summary chips */}
      <div className="flex flex-wrap gap-2 md:gap-3 mb-5 md:mb-6">
        {[
          { label: "Updates",    value: updates.length,          color: "#111111",  bg: "#FFFFFF", border: "#E5E7EB" },
          { label: "Present",    value: presentCount,            color: "#de1a1a",  bg: "rgba(222,26,26,0.06)",  border: "rgba(222,26,26,0.15)" },
          { label: "Absent",     value: absentCount,             color: "#FF6B57",  bg: "rgba(255,107,87,0.06)",  border: "rgba(255,107,87,0.15)" },
          { label: "Total Hours",value: `${totalHours.toFixed(1)}h`, color: "#F59E0B", bg: "rgba(245,158,11,0.06)", border: "rgba(245,158,11,0.15)" },
          { label: "Not Updated",value: notUpdated.length,        color: notUpdated.length > 0 ? "#FF6B57" : "#6B7280", bg: notUpdated.length > 0 ? "rgba(255,107,87,0.06)" : "#FFFFFF", border: notUpdated.length > 0 ? "rgba(255,107,87,0.15)" : "#E5E7EB" },
        ].map((chip) => (
          <div key={chip.label} className="flex items-center gap-2 px-4 py-2 rounded-lg"
            style={{ background: chip.bg, border: `1px solid ${chip.border}` }}>
            <span className="text-[15px] font-black" style={{ fontFamily: "var(--font-jakarta)", color: chip.color }}>{chip.value}</span>
            <span className="text-[11px] font-medium" style={{ color: "#6B7280" }}>{chip.label}</span>
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
      <div className="flex flex-wrap gap-3 mb-6">
        <div className="flex items-center gap-2 px-3 py-2 rounded-lg flex-shrink-0"
          style={{ background: "#FFFFFF", border: "1px solid #E5E7EB", boxShadow: "0 1px 2px rgba(0,0,0,0.04)" }}>
          <Filter size={12} style={{ color: "#6B7280" }} />
          <input type="date" value={dateFilter}
            onChange={(e) => navigate(e.target.value, memberFilter)}
            className="bg-transparent text-[13px] outline-none"
            style={{ color: "#111111", colorScheme: "light" }} />
        </div>
        <select value={memberFilter} onChange={(e) => navigate(dateFilter, e.target.value)}
          className="px-3 py-2 rounded-lg text-[13px] outline-none flex-1 min-w-[160px]"
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
          <p className="text-[14px] font-semibold" style={{ color: "#6B7280" }}>No updates for this date</p>
          <p className="text-[12px] mt-1" style={{ color: "rgba(0,0,0,0.08)" }}>Team members haven&apos;t submitted yet.</p>
        </div>
      ) : (
        <div className="space-y-2">
          {updates.map((u) => {
            const sc = ATTENDANCE_STYLE[u.attendance_status] ?? ATTENDANCE_STYLE.present
            const wt = u.work_type ? WORK_TYPE[u.work_type] : null
            const user = Array.isArray(u.users) ? u.users[0] : u.users
            const isExpanded = expandedId === u.id
            const hasEntries = (u.work_entries?.length ?? 0) > 0 || u.active_tab === "learning"
            const tasksCompleted = u.tasks_completed ?? 0
            const tasksTotal = u.tasks_total ?? 0

            // Break down work_entries into work vs media
            const entries = u.work_entries ?? []
            const workEntries  = entries.filter(e => e.task_type === "work")
            const shootEntries = entries.filter(e => e.task_type === "shoot")
            const editEntries  = entries.filter(e => e.task_type === "edit")
            const workHrs  = Math.round(workEntries.reduce((s, e) => s + (Number(e.duration_hours) || 0), 0) * 10) / 10
            const shootHrs = Math.round(shootEntries.reduce((s, e) => s + (Number(e.duration_hours) || 0), 0) * 10) / 10
            const editHrs  = Math.round(editEntries.reduce((s, e) => s + (Number(e.duration_hours) || 0), 0) * 10) / 10
            const mediaHrs = Math.round((shootHrs + editHrs) * 10) / 10
            const hasMedia = shootEntries.length > 0 || editEntries.length > 0

            return (
              <div key={u.id} className="rounded-xl overflow-hidden"
                style={{ background: "#FFFFFF", border: "1px solid #E5E7EB" }}>
                {/* Summary row */}
                <div className="p-4 md:p-5">
                  <div className="flex items-start gap-3 md:gap-4">
                    {/* Avatar */}
                    <div className="w-10 h-10 rounded-full flex items-center justify-center flex-shrink-0"
                      style={{ background: "rgba(222,26,26,0.08)", border: "1px solid rgba(222,26,26,0.15)" }}>
                      <span className="text-[11px] font-bold" style={{ fontFamily: "var(--font-jakarta)", color: "#de1a1a" }}>
                        {user?.name ? getInitials(user.name) : "?"}
                      </span>
                    </div>

                    {/* Info */}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center flex-wrap gap-2 mb-2">
                        <p className="text-[14px] font-bold" style={{ color: "#111111" }}>{user?.name ?? "Unknown"}</p>
                        <span className="text-[11px]" style={{ color: "#6B7280" }}>#{user?.employee_id}</span>
                        <span className="text-[11px] font-bold px-2 py-0.5 rounded-full"
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

                      {/* Stats row */}
                      <div className="flex flex-wrap gap-2 mb-2">
                        {/* Working */}
                        {workEntries.length > 0 && (
                          <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg"
                            style={{ background: "rgba(0,0,0,0.03)", border: "1px solid #F0F1F5" }}>
                            <Clock size={11} style={{ color: "#6B7280" }} />
                            <span className="text-[11px] font-semibold" style={{ color: "#374151" }}>
                              Working
                            </span>
                            <span className="text-[11px] font-bold" style={{ color: "#111827" }}>{fmtHours(workHrs)}</span>
                          </div>
                        )}
                        {/* Media */}
                        {hasMedia && (
                          <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg"
                            style={{ background: "rgba(222,26,26,0.04)", border: "1px solid rgba(222,26,26,0.12)" }}>
                            <Camera size={11} style={{ color: "#de1a1a" }} />
                            <span className="text-[11px] font-semibold" style={{ color: "#de1a1a" }}>Media</span>
                            <span className="text-[11px] font-bold" style={{ color: "#de1a1a" }}>{fmtHours(mediaHrs)}</span>
                            <span className="text-[10px]" style={{ color: "rgba(222,26,26,0.6)" }}>
                              {shootEntries.length > 0 ? `${shootEntries.length} shoot${shootEntries.length > 1 ? "s" : ""}` : ""}
                              {shootEntries.length > 0 && editEntries.length > 0 ? " · " : ""}
                              {editEntries.length > 0 ? `${editEntries.length} edit${editEntries.length > 1 ? "s" : ""}` : ""}
                            </span>
                          </div>
                        )}
                        {/* Fallback total if no entries breakdown */}
                        {workEntries.length === 0 && !hasMedia && u.working_hours != null && (
                          <div className="flex items-center gap-1.5">
                            <Clock size={11} style={{ color: "#D1D5DB" }} />
                            <span className="text-[12px]" style={{ color: "#6B7280" }}>{u.working_hours}h work</span>
                          </div>
                        )}
                        {/* Learning */}
                        {(u.learning_hours ?? 0) > 0 && (
                          <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg"
                            style={{ background: "rgba(99,102,241,0.05)", border: "1px solid rgba(99,102,241,0.15)" }}>
                            <BookOpen size={11} style={{ color: "#6366F1" }} />
                            <span className="text-[11px] font-semibold" style={{ color: "#6366F1" }}>Learning</span>
                            <span className="text-[11px] font-bold" style={{ color: "#6366F1" }}>{fmtHours(u.learning_hours)}</span>
                          </div>
                        )}
                        {/* Tasks */}
                        {tasksTotal > 0 && (
                          <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg"
                            style={{
                              background: tasksCompleted === tasksTotal ? "rgba(34,197,94,0.06)" : "rgba(245,158,11,0.06)",
                              border: `1px solid ${tasksCompleted === tasksTotal ? "rgba(34,197,94,0.2)" : "rgba(245,158,11,0.2)"}`,
                            }}>
                            <Target size={11} style={{ color: tasksCompleted === tasksTotal ? "#22C55E" : "#F59E0B" }} />
                            <span className="text-[11px] font-semibold"
                              style={{ color: tasksCompleted === tasksTotal ? "#22C55E" : "#F59E0B" }}>
                              Tasks
                            </span>
                            <span className="text-[11px] font-bold"
                              style={{ color: tasksCompleted === tasksTotal ? "#22C55E" : "#F59E0B" }}>
                              {tasksCompleted}/{tasksTotal}
                            </span>
                          </div>
                        )}
                      </div>

                      {u.notes && (
                        <p className="text-[12px] px-3 py-2 rounded-lg mb-2" style={{ background: "rgba(0,0,0,0.02)", color: "#6B7280" }}>
                          {u.notes}
                        </p>
                      )}

                      {/* Learning inline preview */}
                      {u.active_tab === "learning" && u.learning_topic && (
                        <div className="flex items-center gap-2 px-3 py-1.5 rounded-lg mb-1"
                          style={{ background: "rgba(99,102,241,0.05)", border: "1px solid rgba(99,102,241,0.12)" }}>
                          <BookOpen size={11} style={{ color: "#6366F1", flexShrink: 0 }} />
                          <span className="text-[12px] font-semibold truncate" style={{ color: "#6366F1" }}>{u.learning_topic}</span>
                        </div>
                      )}
                    </div>

                    {/* Expand toggle */}
                    {hasEntries && (
                      <button
                        onClick={() => setExpandedId(isExpanded ? null : u.id)}
                        className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[11px] font-semibold flex-shrink-0 transition-colors"
                        style={{
                          background: isExpanded ? "rgba(222,26,26,0.08)" : "rgba(0,0,0,0.04)",
                          color: isExpanded ? "#de1a1a" : "#6B7280",
                          border: `1px solid ${isExpanded ? "rgba(222,26,26,0.15)" : "#E5E7EB"}`,
                        }}>
                        {isExpanded ? <ChevronUp size={12} /> : <ChevronDown size={12} />}
                        {isExpanded ? "Hide" : "Details"}
                      </button>
                    )}
                  </div>
                </div>

                {/* Expanded work entries */}
                {isExpanded && hasEntries && (
                  <div className="px-4 pb-4 md:px-5 md:pb-5 pt-0 border-t"
                    style={{ borderColor: "#F3F4F6" }}>
                    <div className="pt-4">
                      <WorkEntriesDetail
                        entries={u.work_entries}
                        activeTab={u.active_tab}
                        learningTopic={u.learning_topic}
                        learningNotes={u.learning_notes}
                        learningHours={u.learning_hours}
                      />
                    </div>
                  </div>
                )}
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
