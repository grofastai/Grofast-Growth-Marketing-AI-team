"use client"

import { useActionState, useState, useEffect } from "react"
import Image from "next/image"
import {
  Plus, X, Loader2, Calendar, Clock, Filter,
  CheckCircle2, XCircle, AlertCircle, ChevronDown,
  MoreVertical, Palmtree, Sparkles, CalendarDays,
  TrendingUp, Sun, Smile, Meh, Frown, Heart,
} from "lucide-react"
import { submitLeaveRequest } from "@/lib/actions/leaves"

interface Leave {
  id: string
  from_date: string
  to_date: string
  reason: string
  status: string
  created_at: string
  leave_type?: string
  permission_hours?: number | null
  half_day_period?: string | null
}

type LeaveType = "full_day" | "half_day" | "permission"

// Indian public holidays 2025-2026
const HOLIDAYS = [
  { date: "2026-05-15", name: "Buddha Purnima",      day: "Friday",   emoji: "🪷" },
  { date: "2026-08-15", name: "Independence Day",    day: "Saturday", emoji: "🇮🇳" },
  { date: "2026-10-02", name: "Gandhi Jayanti",      day: "Friday",   emoji: "🕊️" },
  { date: "2026-10-20", name: "Dussehra",            day: "Tuesday",  emoji: "🏹" },
  { date: "2026-11-09", name: "Diwali",              day: "Monday",   emoji: "🪔" },
  { date: "2026-12-25", name: "Christmas",           day: "Friday",   emoji: "🎄" },
]

const STATUS_CFG = {
  pending:  { color: "#F59E0B", bg: "rgba(245,158,11,0.1)",  label: "Pending",  icon: AlertCircle  },
  approved: { color: "#10B981", bg: "rgba(16,185,129,0.1)", label: "Approved", icon: CheckCircle2 },
  rejected: { color: "#de1a1a", bg: "rgba(222,26,26,0.1)",  label: "Rejected", icon: XCircle      },
}

const LEAVE_IMGS: Record<string, string> = {
  full_day:   "☀️",
  half_day:   "🌤️",
  permission: "⏰",
}

function daysBetween(from: string, to: string) {
  return Math.ceil((new Date(to).getTime() - new Date(from).getTime()) / 86400000) + 1
}
function fmt(d: string) {
  return new Date(d).toLocaleDateString("en-US", { day: "numeric", month: "short", year: "numeric" })
}
function fmtShort(d: string) {
  return new Date(d).toLocaleDateString("en-US", { day: "numeric", month: "short" })
}

// ── Countdown Timer ────────────────────────────────────────────────────────────
function Countdown({ targetDate }: { targetDate: string }) {
  const [diff, setDiff] = useState({ d: 0, h: 0, m: 0, s: 0 })

  useEffect(() => {
    function calc() {
      const ms = new Date(targetDate).getTime() - Date.now()
      if (ms <= 0) return setDiff({ d: 0, h: 0, m: 0, s: 0 })
      const d = Math.floor(ms / 86400000)
      const h = Math.floor((ms % 86400000) / 3600000)
      const m = Math.floor((ms % 3600000) / 60000)
      const s = Math.floor((ms % 60000) / 1000)
      setDiff({ d, h, m, s })
    }
    calc()
    const id = setInterval(calc, 1000)
    return () => clearInterval(id)
  }, [targetDate])

  return (
    <div className="flex items-center justify-center gap-3 my-3">
      {[
        { val: diff.d, label: "Days" },
        { val: diff.h, label: "Hours" },
        { val: diff.m, label: "Mins" },
        { val: diff.s, label: "Secs" },
      ].map(({ val, label }) => (
        <div key={label} className="text-center">
          <p className="text-[22px] font-black leading-none tabular-nums" style={{ color: "#de1a1a" }}>
            {String(val).padStart(2, "0")}
          </p>
          <p className="text-[9px] font-semibold mt-0.5" style={{ color: "#9CA3AF" }}>{label}</p>
        </div>
      ))}
    </div>
  )
}

// ── Mood Tracker ───────────────────────────────────────────────────────────────
function MoodTracker() {
  const [mood, setMood] = useState<number | null>(null)
  const moods = [
    { icon: "😢", label: "Sad",     val: 1 },
    { icon: "😕", label: "Meh",     val: 2 },
    { icon: "😐", label: "Okay",    val: 3 },
    { icon: "😊", label: "Good",    val: 4 },
    { icon: "😄", label: "Great",   val: 5 },
  ]
  return (
    <div>
      <p className="text-[11px] mb-2.5" style={{ color: "#6B7280" }}>How are you feeling today?</p>
      <div className="flex items-center justify-between">
        {moods.map(m => (
          <button key={m.val} onClick={() => setMood(m.val)}
            className="flex flex-col items-center gap-0.5 transition-all"
            title={m.label}>
            <span className="text-[22px] leading-none transition-transform"
              style={{ transform: mood === m.val ? "scale(1.35)" : "scale(1)", filter: mood !== null && mood !== m.val ? "grayscale(0.6) opacity(0.5)" : "none" }}>
              {m.icon}
            </span>
          </button>
        ))}
      </div>
      {mood && (
        <p className="text-[10px] text-center mt-2 font-semibold" style={{ color: "#de1a1a" }}>
          {["", "Hope you feel better soon 💙", "Things will look up!", "Hang in there!", "Keep it up!", "You're crushing it! 🔥"][mood]}
        </p>
      )}
    </div>
  )
}

// ── Work-Life Balance Ring ─────────────────────────────────────────────────────
function BalanceRing({ pct }: { pct: number }) {
  const r = 28, circ = 2 * Math.PI * r
  const color = pct >= 70 ? "#10B981" : pct >= 50 ? "#F59E0B" : "#de1a1a"
  return (
    <div className="flex flex-col items-center">
      <div className="relative" style={{ width: 72, height: 72 }}>
        <svg viewBox="0 0 72 72" style={{ width: 72, height: 72, transform: "rotate(-90deg)" }}>
          <circle cx={36} cy={36} r={r} fill="none" stroke="#F3F4F6" strokeWidth={7} />
          <circle cx={36} cy={36} r={r} fill="none" stroke={color} strokeWidth={7}
            strokeDasharray={`${(pct / 100) * circ} ${circ}`}
            strokeLinecap="round" style={{ transition: "stroke-dasharray 1s ease" }} />
        </svg>
        <div className="absolute inset-0 flex items-center justify-center">
          <span className="text-[13px] font-black" style={{ color }}>{pct}%</span>
        </div>
      </div>
      <p className="text-[10px] font-semibold mt-1" style={{ color: "#6B7280" }}>
        {pct >= 70 ? "Balanced" : pct >= 50 ? "Moderate" : "Needs rest"}
      </p>
    </div>
  )
}

// ── Main ──────────────────────────────────────────────────────────────────────
export default function MemberLeavesClient({
  leaves, userName,
}: {
  leaves: Leave[]
  userName: string
}) {
  const [showForm, setShowForm]     = useState(false)
  const [leaveType, setLeaveType]   = useState<LeaveType>("full_day")
  const [halfPeriod, setHalfPeriod] = useState<"morning" | "afternoon">("morning")
  const [filterStatus, setFilter]   = useState("all")
  const [showMore, setShowMore]     = useState(false)
  const [state, action, pending]    = useActionState(submitLeaveRequest, null)

  if (state && "success" in state && state.success && showForm) setShowForm(false)

  const approved  = leaves.filter(l => l.status === "approved")
  const pendingL  = leaves.filter(l => l.status === "pending")
  const rejected  = leaves.filter(l => l.status === "rejected")

  // Leave balance: assume 24 days/year, subtract approved full-day usage
  const usedDays = approved
    .filter(l => (l.leave_type ?? "full_day") === "full_day")
    .reduce((s, l) => s + daysBetween(l.from_date, l.to_date), 0)
  const balance = Math.max(0, 24 - usedDays)
  const balancePct = Math.round((balance / 24) * 100)

  // Next upcoming holiday
  const today = new Date().toISOString().split("T")[0]
  const nextHoliday = HOLIDAYS.find(h => h.date >= today)

  // Work-life balance score based on leave usage
  const wlbScore = Math.min(100, Math.max(30, Math.round(72 - (pendingL.length * 3) + (approved.length * 2))))

  // Filtered + limited list
  const filteredLeaves = leaves
    .filter(l => filterStatus === "all" || l.status === filterStatus)
  const visibleLeaves = showMore ? filteredLeaves : filteredLeaves.slice(0, 5)

  const FIELD: React.CSSProperties = {
    background: "#F9FAFB", border: "1px solid #E5E7EB",
    color: "#111111", borderRadius: "10px",
    padding: "10px 14px", fontSize: "13px",
    outline: "none", width: "100%",
  }

  return (
    <div className="flex" style={{ background: "#F8F9FB", minHeight: "100vh" }}>
      <div className="flex-1 min-w-0 overflow-auto p-4 md:p-5 xl:p-6">

        {/* ── Hero Banner ── */}
        <div className="relative rounded-3xl overflow-hidden mb-6"
          style={{ background: "linear-gradient(135deg, #FFF7ED 0%, #FEF3C7 50%, #F0FDF4 100%)", minHeight: 160 }}>
          <div className="p-6 md:p-8 max-w-[520px]">
            <p className="text-[13px] font-semibold mb-1" style={{ color: "#6B7280" }}>
              Hello, {userName}! 👋
            </p>
            <h1 className="text-[32px] md:text-[40px] font-black leading-tight mb-2"
              style={{ fontFamily: "var(--font-jakarta)", color: "#111111" }}>
              Leave{" "}
              <span className="gradient-heading">Requests</span>
            </h1>
            <p className="text-[13px] mb-4" style={{ color: "#6B7280" }}>
              Apply for leave and track your requests in one beautiful place.
            </p>
            <button onClick={() => setShowForm(true)}
              className="flex items-center gap-2 px-6 py-3 rounded-2xl text-[13px] font-bold text-white transition-all hover:opacity-90 active:scale-95"
              style={{ background: "#de1a1a", boxShadow: "0 6px 20px rgba(222,26,26,0.35)" }}>
              <Plus size={15} /> Apply Leave
            </button>
          </div>
          {/* Hero image */}
          <div className="absolute right-0 bottom-0 hidden sm:block" style={{ width: 280, height: 160 }}>
            <Image src="/brand/leave-hero.png" alt="" fill style={{ objectFit: "contain", objectPosition: "right bottom" }} />
          </div>
        </div>

        {/* ── Stats strip ── */}
        <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-6 gap-3 mb-6">
          {[
            { label: "Total This Year", val: leaves.length,   color: "#6366F1", bg: "rgba(99,102,241,0.08)",  icon: "📋" },
            { label: "Pending",         val: pendingL.length, color: "#F59E0B", bg: "rgba(245,158,11,0.08)",  icon: "⏳" },
            { label: "Approved",        val: approved.length, color: "#10B981", bg: "rgba(16,185,129,0.08)",  icon: "✅" },
            { label: "Rejected",        val: rejected.length, color: "#de1a1a", bg: "rgba(222,26,26,0.08)",   icon: "❌" },
            { label: "Days Left",       val: balance,         color: "#0EA5E9", bg: "rgba(14,165,233,0.08)",  icon: "🏖️" },
            { label: "Holidays",        val: HOLIDAYS.filter(h => h.date >= today).length, color: "#8B5CF6", bg: "rgba(139,92,246,0.08)", icon: "🎉" },
          ].map(s => (
            <div key={s.label} className="rounded-2xl p-4"
              style={{ background: "#FFFFFF", boxShadow: "0 2px 12px rgba(0,0,0,0.05)", border: "1px solid #F3F4F6" }}>
              <div className="flex items-center justify-between mb-2">
                <span className="text-[18px] leading-none">{s.icon}</span>
                <span className="text-[10px] font-bold px-1.5 py-0.5 rounded-full"
                  style={{ background: s.bg, color: s.color }}>
                  {s.label === "Days Left" ? `${Math.round((balance / 24) * 100)}%` : ""}
                </span>
              </div>
              <p className="text-[28px] font-black leading-none mb-1"
                style={{ color: s.color, fontFamily: "var(--font-jakarta)" }}>{s.val}</p>
              <p className="text-[10px] font-semibold" style={{ color: "#9CA3AF" }}>{s.label}</p>
              {s.label === "Days Left" && (
                <div className="mt-2 h-1 rounded-full overflow-hidden" style={{ background: "#F3F4F6" }}>
                  <div className="h-full rounded-full transition-all"
                    style={{ width: `${balancePct}%`, background: "#0EA5E9" }} />
                </div>
              )}
            </div>
          ))}
        </div>

        {/* ── Timeline section ── */}
        <div className="rounded-2xl p-5"
          style={{ background: "#FFFFFF", boxShadow: "0 2px 16px rgba(0,0,0,0.06)" }}>

          {/* Header */}
          <div className="flex flex-wrap items-center justify-between gap-3 mb-5">
            <div className="flex items-center gap-2">
              <div className="w-8 h-8 rounded-xl flex items-center justify-center"
                style={{ background: "rgba(222,26,26,0.1)" }}>
                <CalendarDays size={15} style={{ color: "#de1a1a" }} />
              </div>
              <h2 className="text-[16px] font-black" style={{ color: "#111111" }}>Your Leave Timeline</h2>
            </div>
            {/* Status filter */}
            <div className="flex gap-1.5 overflow-x-auto pb-1" style={{ scrollbarWidth: "none" }}>
              {["all", "pending", "approved", "rejected"].map(s => (
                <button key={s} onClick={() => setFilter(s)}
                  className="flex-shrink-0 px-3 py-1.5 rounded-xl text-[11px] font-semibold capitalize transition-all"
                  style={filterStatus === s
                    ? { background: "#de1a1a", color: "#FFF", boxShadow: "0 3px 8px rgba(222,26,26,0.25)" }
                    : { background: "#F3F4F6", color: "#6B7280" }
                  }>
                  {s === "all" ? "All Status" : s}
                </button>
              ))}
            </div>
          </div>

          {/* List */}
          {filteredLeaves.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-16 rounded-2xl"
              style={{ border: "2px dashed #E5E7EB" }}>
              <span className="text-[40px] mb-3">🏖️</span>
              <p className="text-[14px] font-bold" style={{ color: "#374151" }}>No leave requests found</p>
              <p className="text-[12px] mt-1" style={{ color: "#9CA3AF" }}>Apply for leave using the button above.</p>
            </div>
          ) : (
            <div className="relative">
              {/* Timeline line */}
              <div className="absolute left-[52px] top-4 bottom-4 w-0.5 hidden md:block"
                style={{ background: "linear-gradient(to bottom, #de1a1a20, #E5E7EB, #de1a1a20)" }} />

              <div className="space-y-3">
                {visibleLeaves.map((leave, idx) => {
                  const sc   = STATUS_CFG[leave.status as keyof typeof STATUS_CFG] ?? STATUS_CFG.pending
                  const type = leave.leave_type ?? "full_day"
                  const isPermission = type === "permission"
                  const isHalfDay    = type === "half_day"
                  const days = (!isPermission && !isHalfDay) ? daysBetween(leave.from_date, leave.to_date) : null
                  const dateObj = new Date(leave.from_date)
                  const monthLabel = dateObj.toLocaleDateString("en-US", { month: "short" }).toUpperCase()
                  const dayNum     = dateObj.getDate()
                  const StatusIcon = sc.icon

                  return (
                    <div key={leave.id} className="flex items-start gap-3 md:gap-4 group">
                      {/* Date badge */}
                      <div className="hidden md:flex flex-col items-center justify-center rounded-2xl flex-shrink-0 text-center"
                        style={{
                          width: 56, minHeight: 64, padding: "8px 0",
                          background: `${sc.color}12`,
                          border: `1px solid ${sc.color}25`,
                        }}>
                        <span className="text-[9px] font-black tracking-wider" style={{ color: sc.color }}>{monthLabel}</span>
                        <span className="text-[22px] font-black leading-none" style={{ color: sc.color }}>{dayNum}</span>
                        <span className="text-[9px] font-semibold" style={{ color: "#9CA3AF" }}>
                          {dateObj.toLocaleDateString("en-US", { weekday: "short" })}
                        </span>
                      </div>

                      {/* Card */}
                      <div className="flex-1 rounded-2xl p-4 transition-all group-hover:shadow-md"
                        style={{ background: "#FAFAFA", border: "1px solid #F3F4F6" }}>
                        <div className="flex flex-wrap items-start justify-between gap-2">
                          <div className="flex-1 min-w-0">
                            <div className="flex flex-wrap items-center gap-1.5 mb-1">
                              {/* Leave type badge */}
                              <span className="text-[18px] leading-none">{LEAVE_IMGS[type] ?? "📅"}</span>
                              <span className="text-[13px] font-black" style={{ color: "#111111" }}>
                                {type === "full_day" ? "Full Day Leave" : type === "half_day" ? "Half Day Leave" : "Permission"}
                              </span>
                              <span className="text-[9px] font-bold px-1.5 py-0.5 rounded-full"
                                style={{ background: "rgba(99,102,241,0.1)", color: "#6366F1" }}>
                                {type === "half_day" && leave.half_day_period ? `${leave.half_day_period}` : ""}
                                {type === "permission" && leave.permission_hours ? `${leave.permission_hours}h` : ""}
                                {type === "full_day" && days ? `${days} Day${days > 1 ? "s" : ""}` : ""}
                              </span>
                            </div>
                            <p className="text-[11px] font-medium truncate mb-2" style={{ color: "#6B7280" }}>
                              ✦ {leave.reason}
                            </p>
                            <div className="flex flex-wrap items-center gap-3 text-[10px]" style={{ color: "#9CA3AF" }}>
                              <span className="flex items-center gap-1">
                                <Calendar size={9} />
                                {isHalfDay || isPermission
                                  ? fmt(leave.from_date)
                                  : `${fmtShort(leave.from_date)} — ${fmtShort(leave.to_date)}`
                                }
                              </span>
                              <span>·</span>
                              <span>Requested {fmtShort(leave.created_at)}</span>
                            </div>
                          </div>

                          {/* Status + menu */}
                          <div className="flex items-center gap-2 flex-shrink-0">
                            <span className="flex items-center gap-1.5 text-[11px] font-bold px-2.5 py-1.5 rounded-xl"
                              style={{ background: sc.bg, color: sc.color }}>
                              <StatusIcon size={11} />
                              {sc.label}
                            </span>
                            <button className="opacity-0 group-hover:opacity-60 transition-opacity">
                              <MoreVertical size={14} style={{ color: "#9CA3AF" }} />
                            </button>
                          </div>
                        </div>
                      </div>
                    </div>
                  )
                })}
              </div>

              {filteredLeaves.length > 5 && (
                <button onClick={() => setShowMore(s => !s)}
                  className="w-full mt-4 flex items-center justify-center gap-2 py-3 rounded-2xl text-[12px] font-semibold transition-all hover:bg-gray-100"
                  style={{ background: "#F9FAFB", border: "1px solid #E5E7EB", color: "#6B7280" }}>
                  {showMore ? "Show Less" : `Load More (${filteredLeaves.length - 5} more)`}
                  <ChevronDown size={13} style={{ transform: showMore ? "rotate(180deg)" : "none", transition: "transform 0.2s" }} />
                </button>
              )}
            </div>
          )}
        </div>

        {/* ── Bottom motivational row ── */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mt-4">

          {/* Work hard, travel harder */}
          <div className="relative rounded-2xl overflow-hidden p-5"
            style={{ background: "linear-gradient(135deg, #FFF7ED, #FEF9C3)", minHeight: 140 }}>
            <div className="relative z-10 max-w-[200px]">
              <p className="text-[16px] font-black leading-tight mb-1" style={{ color: "#111111" }}>
                Work hard,<br />travel harder! ✈️
              </p>
              <p className="text-[11px] mb-3" style={{ color: "#6B7280" }}>
                You&apos;ve earned your break. Take time off and recharge!
              </p>
              <button onClick={() => setShowForm(true)}
                className="flex items-center gap-1.5 px-4 py-2 rounded-xl text-[11px] font-bold text-white transition-all hover:opacity-90"
                style={{ background: "#de1a1a", boxShadow: "0 4px 12px rgba(222,26,26,0.3)" }}>
                <Palmtree size={12} /> Plan My Vacation
              </button>
            </div>
            <div className="absolute right-0 bottom-0" style={{ width: 160, height: 140 }}>
              <Image src="/brand/vacation-boy.png" alt="" fill style={{ objectFit: "contain", objectPosition: "right bottom" }} />
            </div>
          </div>

          {/* Smart Leave Suggestions */}
          <div className="rounded-2xl p-5"
            style={{ background: "#FFFFFF", boxShadow: "0 2px 16px rgba(0,0,0,0.06)" }}>
            <div className="flex items-center gap-2 mb-3">
              <Sparkles size={14} style={{ color: "#F59E0B" }} />
              <h3 className="text-[13px] font-black" style={{ color: "#111111" }}>Smart Leave Suggestions ✨</h3>
            </div>
            <div className="grid grid-cols-3 gap-2">
              {[
                { icon: "📅", title: "Long Weekend!", sub: "May 15–17 · 3 days break" },
                { icon: "⏰", title: "Plan Ahead",    sub: "Apply leaves early for better planning" },
                { icon: "🤖", title: "Need Help?",    sub: "Let AI plan your perfect vacation" },
              ].map(s => (
                <div key={s.title} className="rounded-xl p-3 text-center cursor-pointer transition-all hover:shadow-md"
                  style={{ background: "#F9FAFB", border: "1px solid #F3F4F6" }}>
                  <span className="text-[20px] leading-none block mb-1.5">{s.icon}</span>
                  <p className="text-[10px] font-bold leading-tight mb-0.5" style={{ color: "#111111" }}>{s.title}</p>
                  <p className="text-[9px] leading-tight" style={{ color: "#9CA3AF" }}>{s.sub}</p>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* ═══ RIGHT SIDEBAR ════════════════════════════════════════════════════ */}
      <div className="hidden xl:flex flex-col w-[280px] flex-shrink-0 gap-4 p-4 overflow-y-auto"
        style={{ borderLeft: "1px solid #E8E9EF", background: "#FAFAFA", position: "sticky", top: 0, maxHeight: "100vh" }}>

        {/* Next Vacation Awaits */}
        <div className="rounded-2xl overflow-hidden"
          style={{ background: "#FFFFFF", boxShadow: "0 2px 12px rgba(0,0,0,0.06)" }}>
          <div className="relative h-[110px]">
            <Image src="/brand/vacation-beach.png" alt="" fill style={{ objectFit: "cover" }} />
            <div className="absolute inset-0" style={{ background: "linear-gradient(to top, rgba(255,255,255,0.9), transparent)" }} />
          </div>
          <div className="px-4 pb-4 pt-2">
            <p className="text-[13px] font-black" style={{ color: "#111111" }}>Next Vacation Awaits! 🌴</p>
            {nextHoliday && <Countdown targetDate={nextHoliday.date} />}
            <p className="text-[10px] text-center" style={{ color: "#9CA3AF" }}>
              Your next break is closer than you think!
            </p>
          </div>
        </div>

        {/* Upcoming Holidays */}
        <div className="rounded-2xl p-4"
          style={{ background: "#FFFFFF", boxShadow: "0 2px 12px rgba(0,0,0,0.06)" }}>
          <div className="flex items-center justify-between mb-3">
            <p className="text-[13px] font-black" style={{ color: "#111111" }}>Upcoming Holidays</p>
            <button className="text-[10px] font-bold" style={{ color: "#de1a1a" }}>View All</button>
          </div>
          <div className="space-y-2.5">
            {HOLIDAYS.filter(h => h.date >= today).slice(0, 4).map(h => {
              const d = new Date(h.date)
              const mon = d.toLocaleDateString("en-US", { month: "short" }).toUpperCase()
              const day = d.getDate()
              return (
                <div key={h.date} className="flex items-center gap-3">
                  <div className="flex flex-col items-center justify-center rounded-xl flex-shrink-0"
                    style={{ width: 40, height: 40, background: "rgba(222,26,26,0.08)" }}>
                    <span className="text-[8px] font-black" style={{ color: "#de1a1a" }}>{mon}</span>
                    <span className="text-[15px] font-black leading-none" style={{ color: "#de1a1a" }}>{day}</span>
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-[12px] font-bold truncate" style={{ color: "#111111" }}>
                      {h.emoji} {h.name}
                    </p>
                    <p className="text-[10px]" style={{ color: "#9CA3AF" }}>{h.day}</p>
                  </div>
                </div>
              )
            })}
          </div>
        </div>

        {/* Mood Tracker */}
        <div className="rounded-2xl p-4"
          style={{ background: "#FFFFFF", boxShadow: "0 2px 12px rgba(0,0,0,0.06)" }}>
          <p className="text-[13px] font-black mb-3" style={{ color: "#111111" }}>Mood Tracker</p>
          <MoodTracker />
        </div>

        {/* Work-Life Balance */}
        <div className="rounded-2xl p-4"
          style={{ background: "#FFFFFF", boxShadow: "0 2px 12px rgba(0,0,0,0.06)" }}>
          <p className="text-[13px] font-black mb-1" style={{ color: "#111111" }}>Work-Life Balance</p>
          <p className="text-[10px] mb-3" style={{ color: "#9CA3AF" }}>This Month</p>
          <div className="flex items-center gap-4">
            <BalanceRing pct={wlbScore} />
            <div className="flex-1 space-y-2">
              {[
                { label: "Work time",  pct: Math.min(90, 100 - wlbScore + 30), color: "#de1a1a" },
                { label: "Leave days", pct: Math.min(100, balancePct),          color: "#10B981" },
                { label: "Focus",      pct: wlbScore,                           color: "#6366F1" },
              ].map(r => (
                <div key={r.label}>
                  <div className="flex items-center justify-between mb-0.5">
                    <span className="text-[9px] font-semibold" style={{ color: "#6B7280" }}>{r.label}</span>
                    <span className="text-[9px] font-bold" style={{ color: r.color }}>{r.pct}%</span>
                  </div>
                  <div className="h-1 rounded-full overflow-hidden" style={{ background: "#F3F4F6" }}>
                    <div className="h-full rounded-full" style={{ width: `${r.pct}%`, background: r.color }} />
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>

      </div>

      {/* ── Apply Leave Modal ── */}
      {showForm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4"
          style={{ background: "rgba(0,0,0,0.6)", backdropFilter: "blur(6px)" }}>
          <div className="w-full max-w-md rounded-2xl overflow-hidden"
            style={{ background: "#FFFFFF", boxShadow: "0 20px 60px rgba(0,0,0,0.2)" }}>

            {/* Modal header */}
            <div className="px-6 py-4 flex items-center justify-between"
              style={{ background: "linear-gradient(135deg, #de1a1a, #991B1B)", borderBottom: "1px solid rgba(255,255,255,0.1)" }}>
              <div>
                <p className="text-[16px] font-black text-white">Apply for Leave</p>
                <p className="text-[11px] text-white/70">Fill in the details below</p>
              </div>
              <button onClick={() => { setShowForm(false); setLeaveType("full_day"); setHalfPeriod("morning") }}
                className="w-8 h-8 rounded-full flex items-center justify-center transition-colors hover:bg-white/20">
                <X size={16} className="text-white" />
              </button>
            </div>

            <div className="p-6">
              <form action={action} className="space-y-4">
                <input type="hidden" name="leave_type" value={leaveType} />
                {leaveType === "half_day" && <input type="hidden" name="half_day_period" value={halfPeriod} />}

                {/* Leave type */}
                <div>
                  <label className="block text-[10px] font-bold uppercase tracking-[0.16em] mb-2"
                    style={{ color: "#374151" }}>Leave Type *</label>
                  <div className="grid grid-cols-3 gap-2">
                    {([
                      { key: "full_day",   label: "Full Day",   emoji: "☀️" },
                      { key: "half_day",   label: "Half Day",   emoji: "🌤️" },
                      { key: "permission", label: "Permission", emoji: "⏰" },
                    ] as { key: LeaveType; label: string; emoji: string }[]).map(({ key, label, emoji }) => (
                      <button key={key} type="button" onClick={() => setLeaveType(key)}
                        className="flex flex-col items-center gap-1.5 py-3 rounded-xl text-[12px] font-bold transition-all"
                        style={leaveType === key
                          ? { background: "#de1a1a", color: "#FFFFFF", boxShadow: "0 4px 12px rgba(222,26,26,0.3)" }
                          : { background: "#F9FAFB", color: "#6B7280", border: "1px solid #E5E7EB" }
                        }>
                        <span className="text-[18px]">{emoji}</span>
                        {label}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Date fields */}
                {leaveType === "full_day" && (
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="block text-[10px] font-bold uppercase tracking-[0.16em] mb-1.5" style={{ color: "#374151" }}>From *</label>
                      <input name="from_date" type="date" required style={FIELD} />
                    </div>
                    <div>
                      <label className="block text-[10px] font-bold uppercase tracking-[0.16em] mb-1.5" style={{ color: "#374151" }}>To *</label>
                      <input name="to_date" type="date" required style={FIELD} />
                    </div>
                  </div>
                )}
                {leaveType === "half_day" && (
                  <>
                    <div>
                      <label className="block text-[10px] font-bold uppercase tracking-[0.16em] mb-1.5" style={{ color: "#374151" }}>Date *</label>
                      <input name="from_date" type="date" required style={FIELD} />
                    </div>
                    <div>
                      <label className="block text-[10px] font-bold uppercase tracking-[0.16em] mb-2" style={{ color: "#374151" }}>Which Half? *</label>
                      <div className="grid grid-cols-2 gap-2">
                        {(["morning", "afternoon"] as const).map(p => (
                          <button key={p} type="button" onClick={() => setHalfPeriod(p)}
                            className="py-2.5 rounded-xl text-[12px] font-bold capitalize transition-all"
                            style={halfPeriod === p
                              ? { background: "#de1a1a", color: "#FFF" }
                              : { background: "#F9FAFB", color: "#6B7280", border: "1px solid #E5E7EB" }
                            }>{p}</button>
                        ))}
                      </div>
                    </div>
                  </>
                )}
                {leaveType === "permission" && (
                  <>
                    <div>
                      <label className="block text-[10px] font-bold uppercase tracking-[0.16em] mb-1.5" style={{ color: "#374151" }}>Date *</label>
                      <input name="from_date" type="date" required style={FIELD} />
                    </div>
                    <div>
                      <label className="block text-[10px] font-bold uppercase tracking-[0.16em] mb-1.5" style={{ color: "#374151" }}>Hours *</label>
                      <input name="permission_hours" type="number" min="0.5" max="8" step="0.5" required
                        placeholder="e.g. 2" style={FIELD} />
                    </div>
                  </>
                )}

                <div>
                  <label className="block text-[10px] font-bold uppercase tracking-[0.16em] mb-1.5" style={{ color: "#374151" }}>Reason *</label>
                  <textarea name="reason" required rows={3} placeholder="Explain the reason…"
                    className="resize-none" style={FIELD} />
                </div>

                {state && "error" in state && state.error && (
                  <p className="text-[12px] font-medium" style={{ color: "#de1a1a" }}>{state.error}</p>
                )}

                <div className="flex gap-3 pt-1">
                  <button type="button" onClick={() => { setShowForm(false); setLeaveType("full_day"); setHalfPeriod("morning") }}
                    className="flex-1 py-2.5 rounded-xl text-[13px] font-semibold transition-colors hover:bg-gray-50"
                    style={{ background: "#F3F4F6", color: "#6B7280", border: "1px solid #E5E7EB" }}>
                    Cancel
                  </button>
                  <button type="submit" disabled={pending}
                    className="flex-1 py-2.5 rounded-xl text-[13px] font-bold flex items-center justify-center gap-2 text-white transition-all hover:opacity-90"
                    style={{ background: "linear-gradient(135deg, #de1a1a, #991B1B)", opacity: pending ? 0.7 : 1 }}>
                    {pending && <Loader2 size={13} className="animate-spin" />}
                    Submit Request
                  </button>
                </div>
              </form>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
