export const revalidate = 60

import { createServerClient } from "@/lib/supabase/server"
import { redirect } from "next/navigation"
import { ClipboardList, Clock, BookOpen, Camera, Film, CalendarDays } from "lucide-react"

type WorkEntry = {
  id: string
  task_type: "shoot" | "edit"
  title: string
  client_name: string
  duration_hours: number
  notes: string
}

type UpdateRow = {
  id: string
  date: string
  attendance_status: string
  work_type: string | null
  working_hours: number | null
  learning_hours: number | null
  shoot_count: number | null
  work_entries: WorkEntry[] | null
  created_at: string
}

const STATUS_STYLE: Record<string, { label: string; color: string; bg: string }> = {
  present: { label: "Present",  color: "#16A34A", bg: "rgba(22,163,74,0.1)"  },
  absent:  { label: "Absent",   color: "#DC2626", bg: "rgba(220,38,38,0.1)"  },
  holiday: { label: "Holiday",  color: "#9CA3AF", bg: "rgba(0,0,0,0.05)"     },
  wfh:     { label: "WFH",      color: "#6366F1", bg: "rgba(99,102,241,0.1)" },
}

function formatDate(d: string) {
  return new Date(d + "T12:00:00").toLocaleDateString("en-IN", {
    weekday: "short", day: "numeric", month: "short", year: "numeric",
  })
}

function monthLabel(d: string) {
  return new Date(d + "T12:00:00").toLocaleDateString("en-IN", { month: "long", year: "numeric" })
}

export default async function HistoryPage() {
  const supabase = await createServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect("/login")

  const { data: raw } = await supabase
    .from("daily_updates")
    .select("id, date, attendance_status, work_type, working_hours, learning_hours, shoot_count, work_entries, created_at")
    .eq("user_id", user.id)
    .order("date", { ascending: false })
    .limit(90)

  const updates = (raw ?? []) as unknown as UpdateRow[]

  // Group by month
  const grouped: Record<string, UpdateRow[]> = {}
  for (const u of updates) {
    const key = monthLabel(u.date)
    if (!grouped[key]) grouped[key] = []
    grouped[key].push(u)
  }

  return (
    <div className="p-6 md:p-8 max-w-[860px]">
      {/* Header */}
      <div className="mb-7">
        <h1 className="gradient-heading text-[30px] font-black leading-tight"
          style={{ fontFamily: "var(--font-jakarta)" }}>
          Update History
        </h1>
        <p className="text-sm mt-1" style={{ color: "#9CA3AF" }}>
          Your daily work logs — last 90 days
        </p>
      </div>

      {updates.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-24 rounded-2xl"
          style={{ background: "rgba(0,0,0,0.02)", border: "1px solid #F0F0F0" }}>
          <ClipboardList size={36} style={{ color: "#E5E7EB" }} className="mb-3" />
          <p className="text-[14px] font-semibold" style={{ color: "#9CA3AF" }}>No updates yet</p>
          <p className="text-[12px] mt-1" style={{ color: "#D1D5DB" }}>Submit your first daily update to see history here.</p>
        </div>
      ) : (
        <div className="space-y-8">
          {Object.entries(grouped).map(([month, rows]) => (
            <div key={month}>
              {/* Month header */}
              <div className="flex items-center gap-3 mb-4">
                <CalendarDays size={13} style={{ color: "#DC2626" }} />
                <p className="text-[11px] font-bold uppercase tracking-[0.2em]"
                  style={{ color: "#9CA3AF" }}>{month}</p>
                <div className="flex-1 h-px" style={{ background: "#F0F0F0" }} />
                <span className="text-[11px] font-semibold px-2 py-0.5 rounded-full"
                  style={{ background: "rgba(220,38,38,0.08)", color: "#DC2626" }}>
                  {rows.length} day{rows.length !== 1 ? "s" : ""}
                </span>
              </div>

              {/* Timeline */}
              <div className="relative pl-6">
                {/* Vertical line */}
                <div className="absolute left-[7px] top-2 bottom-2 w-px"
                  style={{ background: "#F0F0F0" }} />

                <div className="space-y-4">
                  {rows.map((u) => {
                    const st = STATUS_STYLE[u.attendance_status] ?? STATUS_STYLE.present
                    const entries = Array.isArray(u.work_entries) ? u.work_entries : []
                    const shoots  = entries.filter(e => e.task_type === "shoot")
                    const edits   = entries.filter(e => e.task_type === "edit")

                    return (
                      <div key={u.id} className="relative">
                        {/* Timeline dot */}
                        <div className="absolute -left-6 top-4 w-3 h-3 rounded-full border-2 border-white"
                          style={{ background: st.color, boxShadow: `0 0 0 3px ${st.bg}` }} />

                        <div className="rounded-xl p-4"
                          style={{ background: "#FFFFFF", border: "1px solid #F0F0F0" }}>

                          {/* Top row */}
                          <div className="flex items-start justify-between gap-3 mb-3">
                            <div>
                              <p className="text-[13px] font-bold" style={{ color: "#111111" }}>
                                {formatDate(u.date)}
                              </p>
                              {u.work_type && (
                                <p className="text-[11px] mt-0.5 capitalize" style={{ color: "#9CA3AF" }}>
                                  {u.work_type === "wfh" ? "Work from Home" : "Office"}
                                </p>
                              )}
                            </div>
                            <span className="text-[11px] font-semibold px-2.5 py-1 rounded-full flex-shrink-0"
                              style={{ background: st.bg, color: st.color }}>
                              {st.label}
                            </span>
                          </div>

                          {/* Stats row */}
                          {(u.working_hours || u.learning_hours || u.shoot_count) && (
                            <div className="flex items-center gap-4 mb-3 flex-wrap">
                              {u.working_hours != null && u.working_hours > 0 && (
                                <div className="flex items-center gap-1.5">
                                  <Clock size={12} style={{ color: "#DC2626" }} />
                                  <span className="text-[12px] font-semibold" style={{ color: "#374151" }}>
                                    {u.working_hours}h worked
                                  </span>
                                </div>
                              )}
                              {u.learning_hours != null && u.learning_hours > 0 && (
                                <div className="flex items-center gap-1.5">
                                  <BookOpen size={12} style={{ color: "#6366F1" }} />
                                  <span className="text-[12px] font-semibold" style={{ color: "#374151" }}>
                                    {u.learning_hours}h learning
                                  </span>
                                </div>
                              )}
                              {u.shoot_count != null && u.shoot_count > 0 && (
                                <div className="flex items-center gap-1.5">
                                  <Camera size={12} style={{ color: "#F59E0B" }} />
                                  <span className="text-[12px] font-semibold" style={{ color: "#374151" }}>
                                    {u.shoot_count} shoot{u.shoot_count !== 1 ? "s" : ""}
                                  </span>
                                </div>
                              )}
                            </div>
                          )}

                          {/* Work entries */}
                          {entries.length > 0 && (
                            <div className="space-y-1.5">
                              {shoots.length > 0 && (
                                <div>
                                  <p className="text-[10px] font-bold uppercase tracking-[0.15em] mb-1.5"
                                    style={{ color: "#F59E0B" }}>
                                    <Camera size={9} className="inline mr-1" />Shoots
                                  </p>
                                  {shoots.map((e, i) => (
                                    <div key={i} className="flex items-start gap-2 px-3 py-2 rounded-lg"
                                      style={{ background: "rgba(245,158,11,0.05)", border: "1px solid rgba(245,158,11,0.12)" }}>
                                      <div className="flex-1 min-w-0">
                                        <p className="text-[12px] font-semibold truncate" style={{ color: "#111111" }}>
                                          {e.client_name || e.title}
                                        </p>
                                        {e.notes && (
                                          <p className="text-[11px] mt-0.5 line-clamp-2" style={{ color: "#9CA3AF" }}>{e.notes}</p>
                                        )}
                                      </div>
                                      {e.duration_hours > 0 && (
                                        <span className="text-[11px] font-semibold flex-shrink-0" style={{ color: "#F59E0B" }}>
                                          {e.duration_hours}h
                                        </span>
                                      )}
                                    </div>
                                  ))}
                                </div>
                              )}

                              {edits.length > 0 && (
                                <div>
                                  <p className="text-[10px] font-bold uppercase tracking-[0.15em] mb-1.5"
                                    style={{ color: "#6366F1" }}>
                                    <Film size={9} className="inline mr-1" />Editing
                                  </p>
                                  {edits.map((e, i) => (
                                    <div key={i} className="flex items-start gap-2 px-3 py-2 rounded-lg"
                                      style={{ background: "rgba(99,102,241,0.05)", border: "1px solid rgba(99,102,241,0.12)" }}>
                                      <div className="flex-1 min-w-0">
                                        <p className="text-[12px] font-semibold truncate" style={{ color: "#111111" }}>
                                          {e.client_name || e.title}
                                        </p>
                                        {e.notes && (
                                          <p className="text-[11px] mt-0.5 line-clamp-2" style={{ color: "#9CA3AF" }}>{e.notes}</p>
                                        )}
                                      </div>
                                      {e.duration_hours > 0 && (
                                        <span className="text-[11px] font-semibold flex-shrink-0" style={{ color: "#6366F1" }}>
                                          {e.duration_hours}h
                                        </span>
                                      )}
                                    </div>
                                  ))}
                                </div>
                              )}
                            </div>
                          )}

                          {entries.length === 0 && u.attendance_status === "present" && (
                            <p className="text-[12px]" style={{ color: "#D1D5DB" }}>No work entries logged.</p>
                          )}
                        </div>
                      </div>
                    )
                  })}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
