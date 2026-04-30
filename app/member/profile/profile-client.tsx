"use client"

import { useState, useTransition } from "react"
import { useRouter } from "next/navigation"
import {
  Mail, Phone, Briefcase, Calendar, Shield,
  Edit2, Check, X, Loader2, LogOut, KeyRound,
  TrendingUp, Clock, Target, AlertCircle, Zap,
} from "lucide-react"
import { updateOwnProfile } from "@/lib/actions/team"
import { logoutAction } from "@/lib/actions/auth"

interface ProfileData {
  id:          string
  name:        string
  employee_id: string
  role:        string
  email:       string
  phone:       string
  status:      string
  joined:      string
}

interface Stats {
  weekHours:      number
  weekMissed:     number
  totalCompleted: number
  totalLeaves:    number
  avgHoursPerDay: number
}

interface ChartDay {
  date:     string
  label:    string
  hours:    number
  isFuture: boolean
}

interface RecentUpdate {
  date:          string
  working_hours: number | null
  shoot_count:   number | null
}

const IS: React.CSSProperties = {
  background: "#1A1A1A", border: "1px solid #2E2E2E", color: "#FFFFFF",
  borderRadius: "10px", padding: "10px 14px", fontSize: "13px",
  outline: "none", width: "100%",
}

function relativeDate(dateStr: string): string {
  const today = new Date().toISOString().split("T")[0]
  if (dateStr === today) return "Today"
  const yesterday = new Date(); yesterday.setDate(yesterday.getDate() - 1)
  if (dateStr === yesterday.toISOString().split("T")[0]) return "Yesterday"
  return new Date(dateStr).toLocaleDateString("en-US", { weekday: "short", day: "numeric", month: "short" })
}

// ── Simple 7-day bar chart (CSS-only) ────────────────────────
function WeekChart({ data }: { data: ChartDay[] }) {
  const maxH = Math.max(...data.map(d => d.hours), 1)
  const today = new Date().toISOString().split("T")[0]

  return (
    <div>
      <p className="text-[10px] uppercase tracking-[0.18em] font-bold mb-3"
        style={{ color: "rgba(255,255,255,0.25)" }}>Last 7 Days</p>
      <div className="flex items-end gap-2 h-20">
        {data.map((day) => {
          const pct = maxH > 0 ? (day.hours / maxH) * 100 : 0
          const isToday = day.date === today
          const hasHours = day.hours > 0
          return (
            <div key={day.date} className="flex-1 flex flex-col items-center gap-1">
              <div className="relative w-full group">
                {hasHours && (
                  <div className="absolute -top-5 left-1/2 -translate-x-1/2 opacity-0 group-hover:opacity-100 transition-opacity z-10">
                    <span className="text-[10px] font-bold whitespace-nowrap px-1.5 py-0.5 rounded"
                      style={{ background: "#333", color: "#A3E635" }}>{day.hours}h</span>
                  </div>
                )}
                <div className="w-full rounded-t-sm" style={{
                  height: 64,
                  display: "flex",
                  alignItems: "flex-end",
                }}>
                  <div className="w-full rounded-sm transition-all" style={{
                    height: `${Math.max(pct, day.isFuture ? 0 : 3)}%`,
                    minHeight: !day.isFuture && hasHours ? 4 : 0,
                    background: day.isFuture
                      ? "transparent"
                      : isToday
                      ? "#A3E635"
                      : hasHours
                      ? "rgba(163,230,53,0.4)"
                      : "rgba(255,255,255,0.06)",
                    border: day.isFuture ? "none" : "none",
                  }} />
                </div>
              </div>
              <span className="text-[10px] font-medium" style={{
                color: isToday ? "#A3E635" : "rgba(255,255,255,0.3)",
              }}>{day.label}</span>
            </div>
          )
        })}
      </div>
    </div>
  )
}

export default function ProfileClient({
  profile, stats, chartData, recentUpdates, authEmail,
}: {
  profile:       ProfileData | null
  stats:         Stats
  chartData:     ChartDay[]
  recentUpdates: RecentUpdate[]
  authEmail:     string
}) {
  const router = useRouter()
  const [editing, setEditing] = useState(false)
  const [editName, setEditName]   = useState(profile?.name ?? "")
  const [editPhone, setEditPhone] = useState(profile?.phone ?? "")
  const [editError, setEditError] = useState<string | null>(null)
  const [savePending, startSave]  = useTransition()
  const [logoutPending, startLogout] = useTransition()

  const initial = profile?.name?.charAt(0)?.toUpperCase() ?? authEmail?.charAt(0)?.toUpperCase() ?? "?"

  function handleSave() {
    setEditError(null)
    startSave(async () => {
      const res = await updateOwnProfile({ name: editName, phone: editPhone })
      if (res.success) { setEditing(false); router.refresh() }
      else setEditError(res.error ?? "Failed to save")
    })
  }

  function handleLogout() {
    startLogout(async () => { await logoutAction() })
  }

  return (
    <div className="p-6 md:p-8 max-w-[1100px]">
      <style>{`.pf-in::placeholder{color:rgba(255,255,255,0.18);} .pf-in:focus{border-color:rgba(163,230,53,0.4)!important;}`}</style>

      {/* ── Page title ── */}
      <div className="mb-6">
        <h1 className="text-[30px] font-black leading-tight"
          style={{ fontFamily: "var(--font-jakarta)", color: "#FFFFFF" }}>My Profile</h1>
        <p className="text-[13px] mt-1" style={{ color: "rgba(255,255,255,0.35)" }}>
          Your identity, performance, and account settings.
        </p>
      </div>

      {/* ── 2-column grid ── */}
      <div className="grid grid-cols-1 lg:grid-cols-[1fr_340px] gap-5">

        {/* ── LEFT COLUMN ── */}
        <div className="space-y-4">

          {/* Profile header card */}
          <div className="rounded-2xl p-5" style={{ background: "#1E1E1E", border: "1px solid #2A2A2A" }}>
            <div className="flex items-start gap-4">
              {/* Avatar */}
              <div className="w-16 h-16 rounded-2xl flex items-center justify-center flex-shrink-0 font-black text-[26px]"
                style={{
                  background: "linear-gradient(135deg, rgba(163,230,53,0.2), rgba(163,230,53,0.06))",
                  border: "2px solid rgba(163,230,53,0.3)",
                  fontFamily: "var(--font-jakarta)",
                  color: "#A3E635",
                }}>
                {initial}
              </div>

              {/* Name + role */}
              <div className="flex-1 min-w-0">
                {editing ? (
                  <div className="space-y-2">
                    <input className="pf-in text-[15px] font-bold" style={IS}
                      value={editName} onChange={(e) => setEditName(e.target.value)}
                      placeholder="Full name" />
                    <input className="pf-in" style={IS}
                      value={editPhone} onChange={(e) => setEditPhone(e.target.value)}
                      placeholder="Phone number" />
                    {editError && <p className="text-[12px]" style={{ color: "#FF6B57" }}>{editError}</p>}
                    <div className="flex gap-2">
                      <button onClick={handleSave} disabled={savePending}
                        className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[12px] font-bold"
                        style={{ background: "rgba(163,230,53,0.1)", color: "#A3E635", border: "1px solid rgba(163,230,53,0.2)" }}>
                        {savePending ? <Loader2 size={11} className="animate-spin" /> : <Check size={11} />}
                        Save
                      </button>
                      <button onClick={() => { setEditing(false); setEditName(profile?.name ?? ""); setEditPhone(profile?.phone ?? "") }}
                        className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[12px] font-bold"
                        style={{ background: "rgba(255,255,255,0.04)", color: "rgba(255,255,255,0.5)", border: "1px solid #333" }}>
                        <X size={11} /> Cancel
                      </button>
                    </div>
                  </div>
                ) : (
                  <div className="flex items-start justify-between">
                    <div>
                      <h2 className="text-[20px] font-black" style={{ fontFamily: "var(--font-jakarta)", color: "#FFFFFF" }}>
                        {profile?.name ?? authEmail.split("@")[0]}
                      </h2>
                      <div className="flex items-center gap-2 mt-1 flex-wrap">
                        <span className="text-[11px] font-bold px-2.5 py-0.5 rounded-full"
                          style={{ background: "rgba(163,230,53,0.1)", color: "#A3E635" }}>
                          {profile?.role ?? "MEMBER"}
                        </span>
                        <span className="text-[11px] font-semibold px-2.5 py-0.5 rounded-full"
                          style={{ background: "rgba(109,93,246,0.1)", color: "#9D8DF4" }}>
                          #{profile?.employee_id ?? "—"}
                        </span>
                        <span className="text-[11px] font-semibold px-2.5 py-0.5 rounded-full"
                          style={{
                            background: profile?.status === "active" ? "rgba(16,185,129,0.1)" : "rgba(255,107,87,0.1)",
                            color: profile?.status === "active" ? "#10B981" : "#FF6B57",
                          }}>
                          {profile?.status ?? "active"}
                        </span>
                      </div>
                    </div>
                    <button onClick={() => setEditing(true)}
                      className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[12px] font-bold flex-shrink-0"
                      style={{ background: "rgba(255,255,255,0.04)", color: "rgba(255,255,255,0.5)", border: "1px solid #333" }}>
                      <Edit2 size={11} /> Edit
                    </button>
                  </div>
                )}
              </div>
            </div>

            {/* Avg + total stats inline */}
            {!editing && (
              <div className="grid grid-cols-2 gap-3 mt-4 pt-4" style={{ borderTop: "1px solid #2A2A2A" }}>
                <div className="flex items-center gap-2.5">
                  <div className="w-8 h-8 rounded-lg flex items-center justify-center"
                    style={{ background: "rgba(163,230,53,0.08)" }}>
                    <Zap size={13} style={{ color: "#A3E635" }} />
                  </div>
                  <div>
                    <p className="text-[16px] font-black leading-none" style={{ color: "#FFFFFF" }}>
                      {stats.avgHoursPerDay > 0 ? `${stats.avgHoursPerDay}h` : "—"}
                    </p>
                    <p className="text-[10px]" style={{ color: "rgba(255,255,255,0.3)" }}>Avg hours/day</p>
                  </div>
                </div>
                <div className="flex items-center gap-2.5">
                  <div className="w-8 h-8 rounded-lg flex items-center justify-center"
                    style={{ background: "rgba(163,230,53,0.08)" }}>
                    <Target size={13} style={{ color: "#A3E635" }} />
                  </div>
                  <div>
                    <p className="text-[16px] font-black leading-none" style={{ color: "#FFFFFF" }}>
                      {stats.totalCompleted}
                    </p>
                    <p className="text-[10px]" style={{ color: "rgba(255,255,255,0.3)" }}>Tasks completed</p>
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* Account Details */}
          <div className="rounded-2xl p-5" style={{ background: "#1E1E1E", border: "1px solid #2A2A2A" }}>
            <p className="text-[10px] uppercase tracking-[0.18em] font-bold mb-4"
              style={{ color: "rgba(255,255,255,0.25)" }}>Account Details</p>
            <div className="space-y-2">
              {[
                { icon: Mail,      label: "Email",       value: profile?.email || authEmail },
                { icon: Phone,     label: "Phone",       value: profile?.phone || "—" },
                { icon: Briefcase, label: "Employee ID", value: `#${profile?.employee_id ?? "—"}` },
                { icon: Shield,    label: "Role",        value: profile?.role ?? "MEMBER" },
                { icon: Calendar,  label: "Joined",      value: profile?.joined ?? "—" },
              ].map(({ icon: Icon, label, value }) => (
                <div key={label} className="flex items-center gap-3 px-3 py-2.5 rounded-xl"
                  style={{ background: "rgba(255,255,255,0.02)" }}>
                  <div className="w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0"
                    style={{ background: "rgba(255,255,255,0.04)" }}>
                    <Icon size={13} style={{ color: "rgba(255,255,255,0.4)" }} />
                  </div>
                  <div className="flex-1">
                    <p className="text-[10px] uppercase tracking-wider" style={{ color: "rgba(255,255,255,0.3)" }}>{label}</p>
                    <p className="text-[13px] font-semibold capitalize" style={{ color: "#FFFFFF" }}>{value}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Account Actions */}
          <div className="rounded-2xl p-5" style={{ background: "#1E1E1E", border: "1px solid #2A2A2A" }}>
            <p className="text-[10px] uppercase tracking-[0.18em] font-bold mb-4"
              style={{ color: "rgba(255,255,255,0.25)" }}>Account Actions</p>
            <div className="space-y-2">
              <button onClick={() => router.push("/change-password")}
                className="w-full flex items-center gap-3 px-4 py-3 rounded-xl text-left transition-all"
                style={{ background: "rgba(109,93,246,0.06)", border: "1px solid rgba(109,93,246,0.15)" }}>
                <KeyRound size={15} style={{ color: "#9D8DF4" }} />
                <span className="text-[13px] font-semibold" style={{ color: "#9D8DF4" }}>Change Password</span>
              </button>
              <button onClick={handleLogout} disabled={logoutPending}
                className="w-full flex items-center gap-3 px-4 py-3 rounded-xl text-left transition-all"
                style={{ background: "rgba(255,107,87,0.06)", border: "1px solid rgba(255,107,87,0.15)" }}>
                {logoutPending
                  ? <Loader2 size={15} className="animate-spin" style={{ color: "#FF6B57" }} />
                  : <LogOut size={15} style={{ color: "#FF6B57" }} />
                }
                <span className="text-[13px] font-semibold" style={{ color: "#FF6B57" }}>
                  {logoutPending ? "Signing out…" : "Sign Out"}
                </span>
              </button>
            </div>
          </div>

        </div>

        {/* ── RIGHT COLUMN ── */}
        <div className="space-y-4">

          {/* This week summary */}
          <div className="rounded-2xl p-5" style={{ background: "#1E1E1E", border: "1px solid #2A2A2A" }}>
            <p className="text-[10px] uppercase tracking-[0.18em] font-bold mb-4"
              style={{ color: "rgba(255,255,255,0.25)" }}>This Week</p>
            <div className="space-y-3">
              {[
                {
                  icon: Clock, label: "Hours Worked", value: stats.weekHours > 0 ? `${stats.weekHours}h` : "—",
                  color: "#A3E635", bg: "rgba(163,230,53,0.08)",
                },
                {
                  icon: Target, label: "Tasks Completed", value: stats.totalCompleted,
                  color: "#A3E635", bg: "rgba(163,230,53,0.08)",
                },
                {
                  icon: AlertCircle, label: "Missed Updates", value: stats.weekMissed,
                  color: stats.weekMissed > 0 ? "#F59E0B" : "#10B981",
                  bg: stats.weekMissed > 0 ? "rgba(245,158,11,0.08)" : "rgba(16,185,129,0.08)",
                },
                {
                  icon: TrendingUp, label: "Leave Requests", value: stats.totalLeaves,
                  color: "rgba(255,255,255,0.55)", bg: "rgba(255,255,255,0.04)",
                },
              ].map(({ icon: Icon, label, value, color, bg }) => (
                <div key={label} className="flex items-center gap-3">
                  <div className="w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0"
                    style={{ background: bg }}>
                    <Icon size={13} style={{ color }} />
                  </div>
                  <div className="flex-1">
                    <p className="text-[11px]" style={{ color: "rgba(255,255,255,0.35)" }}>{label}</p>
                  </div>
                  <p className="text-[16px] font-black" style={{ fontFamily: "var(--font-jakarta)", color }}>{value}</p>
                </div>
              ))}
            </div>
          </div>

          {/* 7-day bar chart */}
          <div className="rounded-2xl p-5" style={{ background: "#1E1E1E", border: "1px solid #2A2A2A" }}>
            <WeekChart data={chartData} />
          </div>

          {/* Recent Activity */}
          <div className="rounded-2xl p-5" style={{ background: "#1E1E1E", border: "1px solid #2A2A2A" }}>
            <p className="text-[10px] uppercase tracking-[0.18em] font-bold mb-4"
              style={{ color: "rgba(255,255,255,0.25)" }}>Recent Activity</p>
            {recentUpdates.length === 0 ? (
              <p className="text-[13px] text-center py-4" style={{ color: "rgba(255,255,255,0.2)" }}>
                No updates yet
              </p>
            ) : (
              <div className="space-y-2.5">
                {recentUpdates.map((upd) => (
                  <div key={upd.date} className="flex items-start gap-3">
                    <div className="w-1.5 h-1.5 rounded-full mt-1.5 flex-shrink-0"
                      style={{ background: "#A3E635" }} />
                    <div className="flex-1">
                      <p className="text-[12px] font-semibold" style={{ color: "#FFFFFF" }}>
                        {relativeDate(upd.date)}
                      </p>
                      <p className="text-[11px]" style={{ color: "rgba(255,255,255,0.35)" }}>
                        {upd.working_hours != null ? `${upd.working_hours}h worked` : "Update submitted"}
                        {upd.shoot_count && upd.shoot_count > 0 ? ` · ${upd.shoot_count} shoot${upd.shoot_count !== 1 ? "s" : ""}` : ""}
                      </p>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

        </div>
      </div>
    </div>
  )
}
