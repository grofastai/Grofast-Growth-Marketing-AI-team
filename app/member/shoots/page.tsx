export const revalidate = 60

import { createServerClient } from "@/lib/supabase/server"
import { redirect } from "next/navigation"
import { Camera, Clock, Users, CalendarDays } from "lucide-react"

type WorkEntry = {
  task_type: "shoot" | "edit"
  title: string
  client_name: string
  duration_hours: number
  notes: string
}

type UpdateRow = {
  id: string
  date: string
  work_entries: WorkEntry[] | null
}

type ShootEntry = WorkEntry & { date: string }

type ClientStat = {
  client_name: string
  count: number
  hours: number
  lastDate: string
}

function formatDate(d: string) {
  return new Date(d + "T12:00:00").toLocaleDateString("en-IN", {
    weekday: "short", day: "numeric", month: "short", year: "numeric",
  })
}

function monthLabel(d: string) {
  return new Date(d + "T12:00:00").toLocaleDateString("en-IN", { month: "long", year: "numeric" })
}

export default async function ShootsPage() {
  const supabase = await createServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect("/login")

  const { data: raw } = await supabase
    .from("daily_updates")
    .select("id, date, work_entries")
    .eq("user_id", user.id)
    .order("date", { ascending: false })

  const updates = (raw ?? []) as unknown as UpdateRow[]

  // Flatten all shoot entries
  const allShoots: ShootEntry[] = []
  for (const u of updates) {
    const entries = Array.isArray(u.work_entries) ? u.work_entries : []
    for (const e of entries) {
      if (e.task_type === "shoot") allShoots.push({ ...e, date: u.date })
    }
  }

  const totalShoots = allShoots.length
  const totalHours  = Math.round(allShoots.reduce((s, e) => s + (e.duration_hours ?? 0), 0) * 10) / 10
  const uniqueClients = new Set(allShoots.map(s => s.client_name).filter(Boolean)).size

  // Per-client aggregates
  const clientMap: Record<string, ClientStat> = {}
  for (const s of allShoots) {
    const key = s.client_name || s.title || "Unknown"
    if (!clientMap[key]) clientMap[key] = { client_name: key, count: 0, hours: 0, lastDate: s.date }
    clientMap[key].count++
    clientMap[key].hours = Math.round((clientMap[key].hours + (s.duration_hours ?? 0)) * 10) / 10
    if (s.date > clientMap[key].lastDate) clientMap[key].lastDate = s.date
  }
  const clientStats = Object.values(clientMap).sort((a, b) => b.count - a.count)

  // Group shoots by month
  const grouped: Record<string, ShootEntry[]> = {}
  for (const s of allShoots) {
    const key = monthLabel(s.date)
    if (!grouped[key]) grouped[key] = []
    grouped[key].push(s)
  }

  return (
    <div className="p-6 md:p-8 max-w-[860px]">
      {/* Header */}
      <div className="mb-7">
        <h1 className="gradient-heading text-[30px] font-black leading-tight"
          style={{ fontFamily: "var(--font-jakarta)" }}>
          Shoot Log
        </h1>
        <p className="text-sm mt-1" style={{ color: "#6B7280" }}>
          All your shoot sessions logged from daily updates
        </p>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-3 gap-3 mb-6">
        {[
          { label: "Total Shoots",       value: totalShoots,                            icon: Camera, color: "#F59E0B" },
          { label: "Shoot Hours",        value: totalHours > 0 ? `${totalHours}h` : "—", icon: Clock,  color: "#de1a1a" },
          { label: "Clients Shot For",   value: uniqueClients,                          icon: Users,  color: "#6366F1" },
        ].map(s => {
          const Icon = s.icon
          return (
            <div key={s.label} className="rounded-xl p-4 flex flex-col"
              style={{ background: "#FFFFFF", border: "1px solid #E5E7EB" }}>
              <div className="flex items-center gap-2 mb-2">
                <Icon size={13} style={{ color: s.color }} />
                <p className="text-[10px] uppercase tracking-[0.15em] font-bold" style={{ color: "#6B7280" }}>
                  {s.label}
                </p>
              </div>
              <p className="text-[28px] font-black leading-none"
                style={{ fontFamily: "var(--font-jakarta)", color: s.color }}>
                {s.value}
              </p>
            </div>
          )
        })}
      </div>

      {allShoots.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-24 rounded-2xl"
          style={{ background: "rgba(0,0,0,0.02)", border: "1px solid #E5E7EB" }}>
          <Camera size={36} style={{ color: "#E5E7EB" }} className="mb-3" />
          <p className="text-[14px] font-semibold" style={{ color: "#6B7280" }}>No shoots logged yet</p>
          <p className="text-[12px] mt-1" style={{ color: "#D1D5DB" }}>
            Add shoot entries in your daily update to see them here.
          </p>
        </div>
      ) : (
        <div className="space-y-6">

          {/* Client Breakdown */}
          <div className="rounded-xl p-5" style={{ background: "#FFFFFF", border: "1px solid #E5E7EB" }}>
            <div className="flex items-center gap-2 mb-4">
              <Users size={13} style={{ color: "#F59E0B" }} />
              <h3 className="text-[13px] font-bold" style={{ color: "#111111" }}>Client Breakdown</h3>
            </div>
            <div className="space-y-3">
              {clientStats.map((c, i) => {
                const pct = totalShoots > 0 ? Math.round((c.count / totalShoots) * 100) : 0
                return (
                  <div key={c.client_name}>
                    <div className="flex items-center justify-between mb-1.5">
                      <div className="flex items-center gap-2.5">
                        <span className="text-[11px] font-bold w-5 text-center tabular-nums"
                          style={{ color: "#D1D5DB" }}>{i + 1}</span>
                        <p className="text-[13px] font-semibold" style={{ color: "#111111" }}>{c.client_name}</p>
                        <span className="text-[10px]" style={{ color: "#D1D5DB" }}>
                          last {formatDate(c.lastDate).split(",")[0]}
                        </span>
                      </div>
                      <div className="flex items-center gap-3">
                        {c.hours > 0 && (
                          <span className="text-[11px] font-medium" style={{ color: "#6B7280" }}>{c.hours}h</span>
                        )}
                        <span className="text-[12px] font-bold px-2 py-0.5 rounded-full"
                          style={{ background: "rgba(245,158,11,0.1)", color: "#F59E0B" }}>
                          {c.count} shoot{c.count !== 1 ? "s" : ""}
                        </span>
                      </div>
                    </div>
                    <div className="h-1.5 rounded-full overflow-hidden" style={{ background: "#F9FAFB" }}>
                      <div className="h-full rounded-full"
                        style={{ width: `${pct}%`, background: "linear-gradient(90deg, #F59E0B, #FBBF24)" }} />
                    </div>
                  </div>
                )
              })}
            </div>
          </div>

          {/* Timeline by month */}
          <div className="space-y-8">
            {Object.entries(grouped).map(([month, shoots]) => {
              const monthHrs = Math.round(shoots.reduce((s, e) => s + (e.duration_hours ?? 0), 0) * 10) / 10
              return (
                <div key={month}>
                  <div className="flex items-center gap-3 mb-4">
                    <CalendarDays size={13} style={{ color: "#F59E0B" }} />
                    <p className="text-[11px] font-bold uppercase tracking-[0.2em]"
                      style={{ color: "#6B7280" }}>{month}</p>
                    <div className="flex-1 h-px" style={{ background: "#E5E7EB" }} />
                    {monthHrs > 0 && (
                      <span className="text-[11px] font-semibold px-2 py-0.5 rounded-full"
                        style={{ background: "rgba(245,158,11,0.08)", color: "#F59E0B" }}>
                        {monthHrs}h
                      </span>
                    )}
                    <span className="text-[11px] font-semibold px-2 py-0.5 rounded-full"
                      style={{ background: "rgba(245,158,11,0.08)", color: "#F59E0B" }}>
                      {shoots.length} shoot{shoots.length !== 1 ? "s" : ""}
                    </span>
                  </div>

                  <div className="relative pl-6">
                    <div className="absolute left-[7px] top-2 bottom-2 w-px"
                      style={{ background: "#E5E7EB" }} />
                    <div className="space-y-3">
                      {shoots.map((s, i) => (
                        <div key={i} className="relative">
                          <div className="absolute -left-6 top-3.5 w-2.5 h-2.5 rounded-full border-2 border-white"
                            style={{ background: "#F59E0B", boxShadow: "0 0 0 3px rgba(245,158,11,0.15)" }} />
                          <div className="rounded-xl p-4 flex items-start gap-3"
                            style={{ background: "#FFFFFF", border: "1px solid rgba(245,158,11,0.12)" }}>
                            <Camera size={14} className="flex-shrink-0 mt-0.5" style={{ color: "#F59E0B" }} />
                            <div className="flex-1 min-w-0">
                              <div className="flex items-start justify-between gap-2">
                                <p className="text-[13px] font-bold" style={{ color: "#111111" }}>
                                  {s.client_name || s.title || "Unnamed shoot"}
                                </p>
                                {s.duration_hours > 0 && (
                                  <span className="text-[12px] font-bold flex-shrink-0"
                                    style={{ color: "#F59E0B" }}>{s.duration_hours}h</span>
                                )}
                              </div>
                              <p className="text-[11px] mt-0.5" style={{ color: "#6B7280" }}>{formatDate(s.date)}</p>
                              {s.notes && (
                                <p className="text-[11px] mt-2 line-clamp-2 leading-relaxed"
                                  style={{ color: "#6B7280" }}>{s.notes}</p>
                              )}
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              )
            })}
          </div>

        </div>
      )}
    </div>
  )
}
