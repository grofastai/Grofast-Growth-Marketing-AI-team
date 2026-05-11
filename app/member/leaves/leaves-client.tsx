"use client"

import { useActionState, useState, useEffect } from "react"
import Image from "next/image"
import {
  Plus, X, Loader2, Calendar,
  CheckCircle2, XCircle, AlertCircle, ChevronDown,
  MoreVertical, Palmtree, Sparkles, CalendarDays, ArrowUpRight,
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

const HOLIDAYS = [
  { date: "2026-05-15", name: "Buddha Purnima",   day: "Friday",   emoji: "🪷" },
  { date: "2026-08-15", name: "Independence Day", day: "Saturday", emoji: "🇮🇳" },
  { date: "2026-10-02", name: "Gandhi Jayanti",   day: "Friday",   emoji: "🕊️" },
  { date: "2026-10-20", name: "Dussehra",         day: "Tuesday",  emoji: "🏹" },
  { date: "2026-11-09", name: "Diwali",           day: "Monday",   emoji: "🪔" },
  { date: "2026-12-25", name: "Christmas",        day: "Friday",   emoji: "🎄" },
]

const STATUS_CFG = {
  pending:  { color: "#F59E0B", bg: "rgba(245,158,11,0.1)",  label: "Pending",  icon: AlertCircle  },
  approved: { color: "#10B981", bg: "rgba(16,185,129,0.1)", label: "Approved", icon: CheckCircle2 },
  rejected: { color: "#EF4444", bg: "rgba(239,68,68,0.1)",  label: "Rejected", icon: XCircle      },
}

const LEAVE_EMOJI: Record<string, string> = {
  full_day: "☀️", half_day: "🌤️", permission: "⏰",
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
      setDiff({
        d: Math.floor(ms / 86400000),
        h: Math.floor((ms % 86400000) / 3600000),
        m: Math.floor((ms % 3600000) / 60000),
        s: Math.floor((ms % 60000) / 1000),
      })
    }
    calc()
    const id = setInterval(calc, 1000)
    return () => clearInterval(id)
  }, [targetDate])

  return (
    <div className="flex items-center justify-center gap-2 mt-3 mb-2">
      {[
        { val: diff.d, label: "Days" },
        { val: diff.h, label: "Hrs" },
        { val: diff.m, label: "Min" },
        { val: diff.s, label: "Sec" },
      ].map(({ val, label }) => (
        <div key={label} className="flex flex-col items-center">
          <div className="flex items-center justify-center rounded-xl tabular-nums"
            style={{
              width: 44, height: 38,
              background: "rgba(222,26,26,0.07)",
              border: "1px solid rgba(222,26,26,0.14)",
            }}>
            <span className="text-[17px] font-black" style={{ color: "#DE1A1A" }}>
              {String(val).padStart(2, "0")}
            </span>
          </div>
          <span className="text-[9px] font-semibold mt-1" style={{ color: "#9CA3AF" }}>{label}</span>
        </div>
      ))}
    </div>
  )
}

// ── Mood Tracker ───────────────────────────────────────────────────────────────
function MoodTracker() {
  const [mood, setMood] = useState<number | null>(null)
  const moods = [
    { icon: "😢", label: "Sad",   val: 1 },
    { icon: "😕", label: "Meh",   val: 2 },
    { icon: "😐", label: "Okay",  val: 3 },
    { icon: "😊", label: "Good",  val: 4 },
    { icon: "😄", label: "Great", val: 5 },
  ]
  const messages = ["", "Hope things look up soon 💙", "Things will get better!", "Hang in there!", "Keep the energy! ✨", "You're on fire! 🔥"]
  return (
    <div>
      <p className="text-[12px] mb-3" style={{ color: "#6B7280" }}>How are you feeling today?</p>
      <div className="flex justify-between px-1">
        {moods.map(m => (
          <button key={m.val} onClick={() => setMood(m.val)}
            className="flex flex-col items-center gap-1 transition-all">
            <span className="text-[22px] leading-none transition-all duration-200"
              style={{
                transform: mood === m.val ? "scale(1.3)" : "scale(1)",
                filter: mood !== null && mood !== m.val ? "grayscale(0.7) opacity(0.4)" : "none",
              }}>
              {m.icon}
            </span>
            <span className="text-[9px] font-semibold transition-colors"
              style={{ color: mood === m.val ? "#DE1A1A" : "#C4C9D4" }}>
              {m.label}
            </span>
          </button>
        ))}
      </div>
      {mood && (
        <p className="text-[11px] text-center mt-3 font-semibold py-2 rounded-xl"
          style={{ color: "#DE1A1A", background: "rgba(222,26,26,0.06)", border: "1px solid rgba(222,26,26,0.1)" }}>
          {messages[mood]}
        </p>
      )}
    </div>
  )
}

// ── Work-Life Balance Ring ─────────────────────────────────────────────────────
function BalanceRing({ pct }: { pct: number }) {
  const r = 28, circ = 2 * Math.PI * r
  const color = pct >= 70 ? "#10B981" : pct >= 50 ? "#F59E0B" : "#DE1A1A"
  return (
    <div className="flex flex-col items-center flex-shrink-0">
      <div className="relative" style={{ width: 70, height: 70 }}>
        <svg viewBox="0 0 70 70" style={{ width: 70, height: 70, transform: "rotate(-90deg)" }}>
          <circle cx={35} cy={35} r={r} fill="none" stroke="#F0F1F5" strokeWidth={7} />
          <circle cx={35} cy={35} r={r} fill="none" stroke={color} strokeWidth={7}
            strokeDasharray={`${(pct / 100) * circ} ${circ}`}
            strokeLinecap="round" style={{ transition: "stroke-dasharray 1s ease" }} />
        </svg>
        <div className="absolute inset-0 flex items-center justify-center">
          <span className="text-[13px] font-black" style={{ color }}>{pct}%</span>
        </div>
      </div>
      <p className="text-[10px] font-semibold mt-1.5" style={{ color: "#9CA3AF" }}>
        {pct >= 70 ? "Balanced" : pct >= 50 ? "Moderate" : "Needs rest"}
      </p>
    </div>
  )
}

// ── Main Component ─────────────────────────────────────────────────────────────
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

  const usedDays = approved
    .filter(l => (l.leave_type ?? "full_day") === "full_day")
    .reduce((s, l) => s + daysBetween(l.from_date, l.to_date), 0)
  const balance    = Math.max(0, 24 - usedDays)
  const balancePct = Math.round((balance / 24) * 100)

  const today       = new Date().toISOString().split("T")[0]
  const nextHoliday = HOLIDAYS.find(h => h.date >= today)
  const wlbScore    = Math.min(100, Math.max(30, Math.round(72 - (pendingL.length * 3) + (approved.length * 2))))

  const filteredLeaves = leaves.filter(l => filterStatus === "all" || l.status === filterStatus)
  const visibleLeaves  = showMore ? filteredLeaves : filteredLeaves.slice(0, 5)

  const FIELD: React.CSSProperties = {
    background: "#F9FAFB", border: "1.5px solid #E8EAED",
    color: "#111827", borderRadius: "12px",
    padding: "11px 14px", fontSize: "13px",
    outline: "none", width: "100%",
    transition: "border-color 0.15s",
  }

  const CARD: React.CSSProperties = {
    background: "#FFFFFF",
    borderRadius: "20px",
    border: "1px solid #EBEDF2",
    boxShadow: "0 1px 3px rgba(0,0,0,0.04), 0 4px 16px rgba(0,0,0,0.04)",
  }

  return (
    <div style={{ background: "#F4F5F8", minHeight: "100vh", display: "flex" }}>

      {/* ════ MAIN CONTENT ════════════════════════════════════════════════════ */}
      <div className="flex-1 min-w-0 overflow-auto" style={{ padding: "24px 24px 32px" }}>

        {/* ── Hero Banner ─────────────────────────────────────────────────── */}
        <div className="relative overflow-hidden mb-6 flex items-stretch"
          style={{
            background: "linear-gradient(135deg, #FFFCF5 0%, #FFF6E8 50%, #FFF9F0 100%)",
            borderRadius: "24px",
            border: "1px solid #F0E6D0",
            boxShadow: "0 2px 8px rgba(222,180,100,0.08), 0 8px 32px rgba(222,180,100,0.06)",
            minHeight: 210,
          }}>

          {/* Subtle dot pattern */}
          <div className="absolute inset-0 pointer-events-none" style={{
            backgroundImage: "radial-gradient(circle, rgba(222,26,26,0.04) 1px, transparent 1px)",
            backgroundSize: "24px 24px",
          }} />

          {/* Left content */}
          <div className="relative z-10 flex-1 flex flex-col justify-center"
            style={{ padding: "36px 40px" }}>
            <div className="flex items-center gap-2 mb-3">
              <span className="text-[11px] font-bold px-3 py-1 rounded-full"
                style={{ background: "rgba(222,26,26,0.1)", color: "#DE1A1A", letterSpacing: "0.04em" }}>
                Leave Management
              </span>
            </div>
            <p className="text-[13px] font-semibold mb-1.5" style={{ color: "#9CA3AF" }}>
              Hello, {userName}! 👋
            </p>
            <h1 className="font-black leading-tight mb-3"
              style={{
                fontSize: "clamp(28px, 3vw, 40px)",
                fontFamily: "var(--font-jakarta)",
                color: "#0A0A0B",
                letterSpacing: "-0.02em",
              }}>
              Leave{" "}
              <span className="gradient-heading">Requests</span>
            </h1>
            <p className="text-[13px] mb-5 max-w-xs" style={{ color: "#6B7280", lineHeight: 1.6 }}>
              Apply for leave and track all your requests in one beautifully organized place.
            </p>
            <button onClick={() => setShowForm(true)}
              className="self-start flex items-center gap-2 text-white font-bold transition-all hover:opacity-90 active:scale-95"
              style={{
                background: "#DE1A1A",
                boxShadow: "0 4px 14px rgba(222,26,26,0.35), 0 1px 3px rgba(222,26,26,0.2)",
                borderRadius: "14px",
                padding: "12px 24px",
                fontSize: "13px",
              }}>
              <Plus size={14} strokeWidth={2.5} /> Apply Leave
            </button>
          </div>

          {/* Right illustration — framed container, explicit dimensions */}
          <div className="hidden sm:flex items-end justify-center flex-shrink-0 relative z-10"
            style={{ width: 280, paddingBottom: 0, paddingRight: 16, paddingTop: 16 }}>
            <Image
              src="/brand/leave-hero.png"
              alt="Leave requests illustration"
              width={250}
              height={200}
              style={{ objectFit: "contain", objectPosition: "bottom center", display: "block" }}
              priority
            />
          </div>
        </div>

        {/* ── Stats Grid ──────────────────────────────────────────────────── */}
        <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-6 gap-3 mb-6">
          {[
            { label: "Total",     val: leaves.length,   color: "#6366F1", bg: "rgba(99,102,241,0.08)",  icon: "📋", accent: "#6366F1" },
            { label: "Pending",   val: pendingL.length, color: "#F59E0B", bg: "rgba(245,158,11,0.08)",  icon: "⏳", accent: "#F59E0B" },
            { label: "Approved",  val: approved.length, color: "#10B981", bg: "rgba(16,185,129,0.08)",  icon: "✅", accent: "#10B981" },
            { label: "Rejected",  val: rejected.length, color: "#EF4444", bg: "rgba(239,68,68,0.08)",   icon: "❌", accent: "#EF4444" },
            { label: "Days Left", val: balance,         color: "#0EA5E9", bg: "rgba(14,165,233,0.08)",  icon: "🏖️", accent: "#0EA5E9" },
            { label: "Holidays",  val: HOLIDAYS.filter(h => h.date >= today).length, color: "#8B5CF6", bg: "rgba(139,92,246,0.08)", icon: "🎉", accent: "#8B5CF6" },
          ].map(s => (
            <div key={s.label} className="flex flex-col"
              style={{ ...CARD, padding: "18px 16px", position: "relative", overflow: "hidden" }}>
              {/* Colored top accent bar */}
              <div className="absolute top-0 left-0 right-0 h-0.5 rounded-t-[20px]"
                style={{ background: s.color, opacity: 0.6 }} />

              <div className="flex items-center justify-between mb-3">
                <span className="text-[20px] leading-none">{s.icon}</span>
                {s.label === "Days Left" && (
                  <span className="text-[9px] font-black px-1.5 py-0.5 rounded-full"
                    style={{ background: s.bg, color: s.color }}>
                    {balancePct}%
                  </span>
                )}
              </div>
              <p className="font-black leading-none mb-1.5"
                style={{ color: s.color, fontSize: "clamp(22px,2.5vw,28px)", fontFamily: "var(--font-jakarta)" }}>
                {s.val}
              </p>
              <p className="text-[10px] font-semibold" style={{ color: "#9CA3AF" }}>{s.label}</p>

              {s.label === "Days Left" && (
                <div className="mt-2.5 h-[3px] rounded-full overflow-hidden" style={{ background: "#EEF0F5" }}>
                  <div className="h-full rounded-full" style={{ width: `${balancePct}%`, background: "#0EA5E9", transition: "width 0.6s ease" }} />
                </div>
              )}
            </div>
          ))}
        </div>

        {/* ── Leave Timeline ──────────────────────────────────────────────── */}
        <div style={{ ...CARD, padding: "24px" }}>

          {/* Header row */}
          <div className="flex flex-wrap items-center justify-between gap-3 mb-6">
            <div className="flex items-center gap-3">
              <div className="flex items-center justify-center rounded-2xl"
                style={{ width: 36, height: 36, background: "rgba(222,26,26,0.08)" }}>
                <CalendarDays size={16} style={{ color: "#DE1A1A" }} />
              </div>
              <div>
                <h2 className="text-[15px] font-black" style={{ color: "#0A0A0B" }}>Your Leave Timeline</h2>
                <p className="text-[11px]" style={{ color: "#9CA3AF" }}>{filteredLeaves.length} request{filteredLeaves.length !== 1 ? "s" : ""}</p>
              </div>
            </div>

            {/* Filter pills */}
            <div className="flex items-center gap-1.5 overflow-x-auto pb-0.5" style={{ scrollbarWidth: "none" }}>
              {["all", "pending", "approved", "rejected"].map(s => (
                <button key={s} onClick={() => setFilter(s)}
                  className="flex-shrink-0 capitalize font-semibold transition-all"
                  style={{
                    padding: "6px 14px", borderRadius: "20px", fontSize: "11px",
                    ...(filterStatus === s
                      ? { background: "#DE1A1A", color: "#FFF", boxShadow: "0 2px 8px rgba(222,26,26,0.3)" }
                      : { background: "#F0F1F5", color: "#6B7280" }
                    ),
                  }}>
                  {s === "all" ? "All Status" : s}
                </button>
              ))}
            </div>
          </div>

          {/* Empty state */}
          {filteredLeaves.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-20 rounded-2xl"
              style={{ background: "#FAFBFC", border: "2px dashed #E8EAED" }}>
              <span className="text-[48px] mb-4">🏖️</span>
              <p className="text-[15px] font-black mb-1" style={{ color: "#374151" }}>No leave requests</p>
              <p className="text-[12px]" style={{ color: "#9CA3AF" }}>Apply for leave using the button above.</p>
            </div>
          ) : (
            <div className="space-y-3">
              {visibleLeaves.map((leave) => {
                const sc    = STATUS_CFG[leave.status as keyof typeof STATUS_CFG] ?? STATUS_CFG.pending
                const type  = leave.leave_type ?? "full_day"
                const isPerm  = type === "permission"
                const isHalf  = type === "half_day"
                const days    = (!isPerm && !isHalf) ? daysBetween(leave.from_date, leave.to_date) : null
                const dateObj = new Date(leave.from_date)
                const StatusIcon = sc.icon

                return (
                  <div key={leave.id} className="flex items-stretch gap-3 group">

                    {/* Date badge */}
                    <div className="hidden md:flex flex-col items-center justify-center rounded-2xl flex-shrink-0"
                      style={{
                        width: 54, minHeight: 62,
                        background: `${sc.color}10`,
                        border: `1px solid ${sc.color}20`,
                      }}>
                      <span className="text-[8px] font-black tracking-widest uppercase" style={{ color: sc.color }}>
                        {dateObj.toLocaleDateString("en-US", { month: "short" })}
                      </span>
                      <span className="text-[22px] font-black leading-none" style={{ color: sc.color }}>
                        {dateObj.getDate()}
                      </span>
                      <span className="text-[8px] font-semibold" style={{ color: "#9CA3AF" }}>
                        {dateObj.toLocaleDateString("en-US", { weekday: "short" })}
                      </span>
                    </div>

                    {/* Card */}
                    <div className="flex-1 rounded-2xl p-4 transition-all duration-200 group-hover:shadow-md"
                      style={{
                        background: "#FAFBFC",
                        border: "1px solid #EBEDF2",
                        transform: "translateY(0)",
                      }}
                      onMouseEnter={e => (e.currentTarget.style.transform = "translateY(-1px)")}
                      onMouseLeave={e => (e.currentTarget.style.transform = "translateY(0)")}>

                      <div className="flex flex-wrap items-start justify-between gap-2">
                        <div className="flex-1 min-w-0">
                          {/* Type row */}
                          <div className="flex flex-wrap items-center gap-1.5 mb-1.5">
                            <span className="text-[16px] leading-none">{LEAVE_EMOJI[type] ?? "📅"}</span>
                            <span className="text-[13px] font-black" style={{ color: "#0A0A0B" }}>
                              {type === "full_day" ? "Full Day Leave" : type === "half_day" ? "Half Day Leave" : "Permission"}
                            </span>
                            {(type === "full_day" && days) && (
                              <span className="text-[9px] font-bold px-2 py-0.5 rounded-full"
                                style={{ background: "rgba(99,102,241,0.1)", color: "#6366F1" }}>
                                {days} Day{days > 1 ? "s" : ""}
                              </span>
                            )}
                            {type === "half_day" && leave.half_day_period && (
                              <span className="text-[9px] font-bold px-2 py-0.5 rounded-full capitalize"
                                style={{ background: "rgba(99,102,241,0.1)", color: "#6366F1" }}>
                                {leave.half_day_period}
                              </span>
                            )}
                            {type === "permission" && leave.permission_hours && (
                              <span className="text-[9px] font-bold px-2 py-0.5 rounded-full"
                                style={{ background: "rgba(99,102,241,0.1)", color: "#6366F1" }}>
                                {leave.permission_hours}h
                              </span>
                            )}
                          </div>

                          {/* Reason */}
                          <p className="text-[12px] font-medium truncate mb-2" style={{ color: "#6B7280", maxWidth: 380 }}>
                            {leave.reason}
                          </p>

                          {/* Meta */}
                          <div className="flex flex-wrap items-center gap-2 text-[10px]" style={{ color: "#9CA3AF" }}>
                            <span className="flex items-center gap-1">
                              <Calendar size={9} />
                              {isHalf || isPerm
                                ? fmt(leave.from_date)
                                : `${fmtShort(leave.from_date)} — ${fmtShort(leave.to_date)}`
                              }
                            </span>
                            <span style={{ color: "#D1D5DB" }}>·</span>
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
                          <button className="opacity-0 group-hover:opacity-50 transition-opacity rounded-lg p-1 hover:bg-gray-100">
                            <MoreVertical size={14} style={{ color: "#9CA3AF" }} />
                          </button>
                        </div>
                      </div>
                    </div>
                  </div>
                )
              })}

              {filteredLeaves.length > 5 && (
                <button onClick={() => setShowMore(s => !s)}
                  className="w-full flex items-center justify-center gap-2 font-semibold transition-all hover:bg-gray-50"
                  style={{
                    padding: "12px 0", borderRadius: "14px", fontSize: "12px",
                    background: "#F9FAFB", border: "1px solid #E8EAED", color: "#6B7280",
                  }}>
                  {showMore ? "Show Less" : `Show ${filteredLeaves.length - 5} More`}
                  <ChevronDown size={13} style={{ transform: showMore ? "rotate(180deg)" : "none", transition: "transform 0.2s" }} />
                </button>
              )}
            </div>
          )}
        </div>

        {/* ── Bottom Row ──────────────────────────────────────────────────── */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mt-4">

          {/* Promo card — vacation boy */}
          <div className="relative overflow-hidden"
            style={{
              borderRadius: "20px",
              background: "linear-gradient(135deg, #FFF8EE 0%, #FFF4E0 100%)",
              border: "1px solid #F0E4C8",
              minHeight: 160,
            }}>
            {/* Vacation boy — CSS bg, always contained */}
            <div className="absolute inset-0" style={{
              backgroundImage: "url('/brand/vacation-boy.png')",
              backgroundRepeat: "no-repeat",
              backgroundPosition: "right bottom",
              backgroundSize: "155px auto",
            }} />
            <div className="relative z-10" style={{ padding: "28px 28px", maxWidth: "calc(100% - 140px)" }}>
              <div className="flex items-center gap-1.5 mb-2">
                <Palmtree size={13} style={{ color: "#F59E0B" }} />
                <span className="text-[10px] font-bold" style={{ color: "#F59E0B", letterSpacing: "0.06em" }}>VACATION MODE</span>
              </div>
              <p className="font-black leading-snug mb-1.5"
                style={{ fontSize: "17px", color: "#0A0A0B", fontFamily: "var(--font-jakarta)" }}>
                Work hard,<br />travel harder! ✈️
              </p>
              <p className="text-[11px] mb-4" style={{ color: "#78716C", lineHeight: 1.5 }}>
                You&apos;ve earned your break. Take time off and recharge!
              </p>
              <button onClick={() => setShowForm(true)}
                className="flex items-center gap-1.5 font-bold text-white transition-all hover:opacity-90 active:scale-95"
                style={{
                  background: "#DE1A1A",
                  boxShadow: "0 4px 12px rgba(222,26,26,0.3)",
                  borderRadius: "12px",
                  padding: "9px 18px",
                  fontSize: "11px",
                }}>
                <Palmtree size={11} /> Plan My Vacation
              </button>
            </div>
          </div>

          {/* Smart Leave Suggestions */}
          <div style={{ ...CARD, padding: "24px" }}>
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-2">
                <Sparkles size={14} style={{ color: "#F59E0B" }} />
                <h3 className="text-[14px] font-black" style={{ color: "#0A0A0B" }}>Smart Suggestions</h3>
              </div>
              <span className="text-[10px] font-bold px-2 py-0.5 rounded-full"
                style={{ background: "rgba(245,158,11,0.1)", color: "#F59E0B" }}>✨ AI</span>
            </div>
            <div className="grid grid-cols-3 gap-2.5">
              {[
                { icon: "📅", title: "Long Weekend", sub: "May 15–17 · 3-day break" },
                { icon: "⏰", title: "Plan Ahead",   sub: "Apply early for better planning" },
                { icon: "🤖", title: "AI Planner",   sub: "Let AI plan your perfect vacation" },
              ].map(s => (
                <div key={s.title}
                  className="rounded-2xl p-3 text-center cursor-pointer transition-all hover:shadow-md hover:-translate-y-0.5"
                  style={{ background: "#F8F9FC", border: "1px solid #EBEDF2" }}>
                  <span className="text-[22px] leading-none block mb-2">{s.icon}</span>
                  <p className="text-[10px] font-black leading-tight mb-1" style={{ color: "#0A0A0B" }}>{s.title}</p>
                  <p className="text-[9px] leading-snug" style={{ color: "#9CA3AF" }}>{s.sub}</p>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* ════ RIGHT SIDEBAR ═══════════════════════════════════════════════════ */}
      <div className="hidden xl:flex flex-col flex-shrink-0 gap-4 overflow-y-auto"
        style={{
          width: 300,
          padding: "24px 20px 32px",
          borderLeft: "1px solid #EBEDF2",
          background: "#F8F9FC",
          position: "sticky",
          top: 0,
          maxHeight: "100vh",
          scrollbarWidth: "none",
        }}>

        {/* ── Next Vacation Awaits ───────────────────────────────────────── */}
        <div className="overflow-hidden" style={{ ...CARD, borderRadius: "20px" }}>
          {/* Beach scene — CSS background, fully contained */}
          <div style={{
            height: 130,
            backgroundImage: "url('/brand/vacation-beach.png')",
            backgroundSize: "cover",
            backgroundPosition: "center center",
            position: "relative",
          }}>
            {/* Gradient fade to white at bottom */}
            <div style={{
              position: "absolute", inset: 0,
              background: "linear-gradient(to top, #FFFFFF 0%, rgba(255,255,255,0.5) 50%, transparent 100%)",
            }} />
            {/* Badge overlay */}
            <div style={{ position: "absolute", top: 12, left: 12 }}>
              <span className="text-[9px] font-black px-2 py-1 rounded-full"
                style={{ background: "rgba(255,255,255,0.9)", color: "#DE1A1A", backdropFilter: "blur(4px)" }}>
                🌴 NEXT BREAK
              </span>
            </div>
          </div>
          <div style={{ padding: "4px 16px 20px" }}>
            <p className="text-[14px] font-black mb-0.5" style={{ color: "#0A0A0B" }}>
              Next Vacation Awaits!
            </p>
            {nextHoliday && (
              <p className="text-[11px] mb-1" style={{ color: "#9CA3AF" }}>
                {nextHoliday.emoji} {nextHoliday.name} · {nextHoliday.day}
              </p>
            )}
            {nextHoliday && <Countdown targetDate={nextHoliday.date} />}
            <p className="text-[10px] text-center font-medium" style={{ color: "#C4C9D4" }}>
              Your next break is closer than you think!
            </p>
          </div>
        </div>

        {/* ── Upcoming Holidays ─────────────────────────────────────────── */}
        <div style={{ ...CARD, padding: "20px" }}>
          <div className="flex items-center justify-between mb-4">
            <p className="text-[14px] font-black" style={{ color: "#0A0A0B" }}>Upcoming Holidays</p>
            <button className="flex items-center gap-0.5 text-[10px] font-bold transition-opacity hover:opacity-70"
              style={{ color: "#DE1A1A" }}>
              View All <ArrowUpRight size={10} />
            </button>
          </div>
          <div className="space-y-3">
            {HOLIDAYS.filter(h => h.date >= today).slice(0, 4).map(h => {
              const d   = new Date(h.date)
              const mon = d.toLocaleDateString("en-US", { month: "short" }).toUpperCase()
              const day = d.getDate()
              return (
                <div key={h.date} className="flex items-center gap-3">
                  <div className="flex flex-col items-center justify-center rounded-2xl flex-shrink-0"
                    style={{ width: 42, height: 42, background: "rgba(222,26,26,0.07)", border: "1px solid rgba(222,26,26,0.1)" }}>
                    <span className="text-[7px] font-black tracking-widest" style={{ color: "#DE1A1A" }}>{mon}</span>
                    <span className="text-[16px] font-black leading-none" style={{ color: "#DE1A1A" }}>{day}</span>
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-[12px] font-bold truncate" style={{ color: "#0A0A0B" }}>
                      {h.emoji} {h.name}
                    </p>
                    <p className="text-[10px]" style={{ color: "#9CA3AF" }}>{h.day}</p>
                  </div>
                </div>
              )
            })}
          </div>
        </div>

        {/* ── Mood Tracker ──────────────────────────────────────────────── */}
        <div style={{ ...CARD, padding: "20px" }}>
          <p className="text-[14px] font-black mb-4" style={{ color: "#0A0A0B" }}>Mood Tracker</p>
          <MoodTracker />
        </div>

        {/* ── Work-Life Balance ─────────────────────────────────────────── */}
        <div style={{ ...CARD, padding: "20px" }}>
          <p className="text-[14px] font-black mb-0.5" style={{ color: "#0A0A0B" }}>Work-Life Balance</p>
          <p className="text-[11px] mb-4" style={{ color: "#9CA3AF" }}>This Month</p>
          <div className="flex items-center gap-4">
            <BalanceRing pct={wlbScore} />
            <div className="flex-1 space-y-2.5">
              {[
                { label: "Work time",  pct: Math.min(90, 100 - wlbScore + 30), color: "#DE1A1A" },
                { label: "Leave days", pct: Math.min(100, balancePct),          color: "#10B981" },
                { label: "Focus",      pct: wlbScore,                           color: "#6366F1" },
              ].map(r => (
                <div key={r.label}>
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-[10px] font-semibold" style={{ color: "#6B7280" }}>{r.label}</span>
                    <span className="text-[10px] font-bold" style={{ color: r.color }}>{r.pct}%</span>
                  </div>
                  <div className="h-[3px] rounded-full overflow-hidden" style={{ background: "#EEF0F5" }}>
                    <div className="h-full rounded-full transition-all duration-700"
                      style={{ width: `${r.pct}%`, background: r.color }} />
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>

      </div>

      {/* ── Apply Leave Modal ─────────────────────────────────────────────────── */}
      {showForm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4"
          style={{ background: "rgba(10,10,11,0.65)", backdropFilter: "blur(8px)" }}>
          <div className="w-full max-w-[420px] overflow-hidden"
            style={{
              background: "#FFFFFF",
              borderRadius: "24px",
              boxShadow: "0 24px 80px rgba(0,0,0,0.25), 0 8px 24px rgba(0,0,0,0.1)",
            }}>

            {/* Modal header */}
            <div className="flex items-center justify-between"
              style={{
                padding: "20px 24px",
                background: "linear-gradient(135deg, #DE1A1A 0%, #991B1B 100%)",
                borderBottom: "1px solid rgba(255,255,255,0.08)",
              }}>
              <div>
                <p className="text-[16px] font-black text-white">Apply for Leave</p>
                <p className="text-[11px]" style={{ color: "rgba(255,255,255,0.6)" }}>Fill in the details below</p>
              </div>
              <button onClick={() => { setShowForm(false); setLeaveType("full_day"); setHalfPeriod("morning") }}
                className="flex items-center justify-center rounded-full transition-colors hover:bg-white/20"
                style={{ width: 32, height: 32 }}>
                <X size={16} className="text-white" />
              </button>
            </div>

            <div style={{ padding: "24px" }}>
              <form action={action} className="space-y-4">
                <input type="hidden" name="leave_type" value={leaveType} />
                {leaveType === "half_day" && <input type="hidden" name="half_day_period" value={halfPeriod} />}

                {/* Leave type */}
                <div>
                  <label className="block text-[10px] font-bold uppercase tracking-[0.14em] mb-2"
                    style={{ color: "#374151" }}>Leave Type *</label>
                  <div className="grid grid-cols-3 gap-2">
                    {([
                      { key: "full_day",   label: "Full Day",   emoji: "☀️" },
                      { key: "half_day",   label: "Half Day",   emoji: "🌤️" },
                      { key: "permission", label: "Permission", emoji: "⏰" },
                    ] as { key: LeaveType; label: string; emoji: string }[]).map(({ key, label, emoji }) => (
                      <button key={key} type="button" onClick={() => setLeaveType(key)}
                        className="flex flex-col items-center gap-1.5 py-3 text-[12px] font-bold transition-all"
                        style={{
                          borderRadius: "14px",
                          ...(leaveType === key
                            ? { background: "#DE1A1A", color: "#FFFFFF", boxShadow: "0 4px 12px rgba(222,26,26,0.35)" }
                            : { background: "#F6F7FA", color: "#6B7280", border: "1px solid #EBEDF2" }
                          ),
                        }}>
                        <span className="text-[20px]">{emoji}</span>
                        {label}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Date fields */}
                {leaveType === "full_day" && (
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="block text-[10px] font-bold uppercase tracking-[0.14em] mb-1.5" style={{ color: "#374151" }}>From *</label>
                      <input name="from_date" type="date" required style={FIELD} />
                    </div>
                    <div>
                      <label className="block text-[10px] font-bold uppercase tracking-[0.14em] mb-1.5" style={{ color: "#374151" }}>To *</label>
                      <input name="to_date" type="date" required style={FIELD} />
                    </div>
                  </div>
                )}
                {leaveType === "half_day" && (
                  <>
                    <div>
                      <label className="block text-[10px] font-bold uppercase tracking-[0.14em] mb-1.5" style={{ color: "#374151" }}>Date *</label>
                      <input name="from_date" type="date" required style={FIELD} />
                    </div>
                    <div>
                      <label className="block text-[10px] font-bold uppercase tracking-[0.14em] mb-2" style={{ color: "#374151" }}>Which Half? *</label>
                      <div className="grid grid-cols-2 gap-2">
                        {(["morning", "afternoon"] as const).map(p => (
                          <button key={p} type="button" onClick={() => setHalfPeriod(p)}
                            className="py-2.5 font-bold capitalize transition-all"
                            style={{
                              borderRadius: "12px", fontSize: "12px",
                              ...(halfPeriod === p
                                ? { background: "#DE1A1A", color: "#FFF" }
                                : { background: "#F6F7FA", color: "#6B7280", border: "1px solid #EBEDF2" }
                              ),
                            }}>{p}</button>
                        ))}
                      </div>
                    </div>
                  </>
                )}
                {leaveType === "permission" && (
                  <>
                    <div>
                      <label className="block text-[10px] font-bold uppercase tracking-[0.14em] mb-1.5" style={{ color: "#374151" }}>Date *</label>
                      <input name="from_date" type="date" required style={FIELD} />
                    </div>
                    <div>
                      <label className="block text-[10px] font-bold uppercase tracking-[0.14em] mb-1.5" style={{ color: "#374151" }}>Hours *</label>
                      <input name="permission_hours" type="number" min="0.5" max="8" step="0.5" required
                        placeholder="e.g. 2" style={FIELD} />
                    </div>
                  </>
                )}

                <div>
                  <label className="block text-[10px] font-bold uppercase tracking-[0.14em] mb-1.5" style={{ color: "#374151" }}>Reason *</label>
                  <textarea name="reason" required rows={3} placeholder="Explain the reason…"
                    className="resize-none" style={FIELD} />
                </div>

                {state && "error" in state && state.error && (
                  <p className="text-[12px] font-semibold py-2 px-3 rounded-xl"
                    style={{ color: "#DE1A1A", background: "rgba(222,26,26,0.07)" }}>
                    {state.error}
                  </p>
                )}

                <div className="flex gap-3 pt-1">
                  <button type="button"
                    onClick={() => { setShowForm(false); setLeaveType("full_day"); setHalfPeriod("morning") }}
                    className="flex-1 font-semibold transition-colors hover:bg-gray-50"
                    style={{
                      padding: "12px 0", borderRadius: "14px", fontSize: "13px",
                      background: "#F6F7FA", color: "#6B7280", border: "1px solid #EBEDF2",
                    }}>
                    Cancel
                  </button>
                  <button type="submit" disabled={pending}
                    className="flex-1 font-bold flex items-center justify-center gap-2 text-white transition-all hover:opacity-90"
                    style={{
                      padding: "12px 0", borderRadius: "14px", fontSize: "13px",
                      background: "linear-gradient(135deg, #DE1A1A, #991B1B)",
                      boxShadow: "0 4px 12px rgba(222,26,26,0.3)",
                      opacity: pending ? 0.7 : 1,
                    }}>
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
