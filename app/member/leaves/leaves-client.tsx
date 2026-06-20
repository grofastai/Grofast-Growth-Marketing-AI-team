"use client"

import { useActionState, useState, useEffect, useTransition, useRef } from "react"
import { useRouter } from "next/navigation"
import Link from "next/link"
import Image from "next/image"
import {
  Plus, X, Loader2, Calendar, CheckCircle2, XCircle,
  ChevronDown, MoreVertical, Palmtree, CalendarDays,
  Bell, Clock, SlidersHorizontal, Trash2, Pencil, AlertTriangle,
} from "lucide-react"
import { submitLeaveRequest, deleteLeaveRequest, updateLeaveRequest } from "@/lib/actions/leaves"

interface Leave {
  id: string; from_date: string; to_date: string; reason: string; status: string
  created_at: string; leave_type?: string; permission_hours?: number | null; permission_time?: string | null; half_day_period?: string | null; half_day_from_time?: string | null
}
type LeaveType = "full_day" | "half_day" | "permission"

interface CompanyLeave {
  id: string
  date: string
  name: string
}

const STATUS_CFG = {
  pending:  { color: "#F59E0B", bg: "rgba(245,158,11,0.12)",   label: "Pending",  icon: Clock        },
  approved: { color: "#10B981", bg: "rgba(16,185,129,0.12)",   label: "Approved", icon: CheckCircle2 },
  rejected: { color: "#EF4444", bg: "rgba(239,68,68,0.12)",    label: "Rejected", icon: XCircle      },
  absent:   { color: "#6B7280", bg: "rgba(107,114,128,0.12)",  label: "On Leave", icon: XCircle      },
}

const TYPE_ILLUSTRATION: Record<string, { emoji: string; bg: string }> = {
  half_day:   { emoji: "🌤️", bg: "rgba(251,191,36,0.12)"   },
  full_day:   { emoji: "🌴", bg: "rgba(16,185,129,0.12)"   },
  permission: { emoji: "⏰", bg: "rgba(99,102,241,0.12)"   },
  absent:     { emoji: "🏠", bg: "rgba(107,114,128,0.1)"   },
}

function daysBetween(from: string, to: string) {
  return Math.ceil((new Date(to).getTime() - new Date(from).getTime()) / 86400000) + 1
}

function canWithdraw(leave: Leave): boolean {
  // Get current IST time
  const now = new Date()
  const istNow = new Date(now.getTime() + 5.5 * 3600000 + now.getTimezoneOffset() * 60000)
  const istTodayStr = `${istNow.getUTCFullYear()}-${String(istNow.getUTCMonth()+1).padStart(2,'0')}-${String(istNow.getUTCDate()).padStart(2,'0')}`
  const istMins = istNow.getUTCHours() * 60 + istNow.getUTCMinutes()

  // Past leave (ended before today) — never allow withdraw
  if (leave.to_date < istTodayStr) return false

  // Future leave (starts after today) — always allow withdraw
  if (leave.from_date > istTodayStr) return true

  // Leave starts today — time-based cutoff
  if (leave.from_date === istTodayStr) {
    if (leave.leave_type === "permission" && leave.permission_time) {
      const [h, m] = leave.permission_time.split(":").map(Number)
      return istMins < (h * 60 + m - 5)
    }
    if (leave.leave_type === "half_day") {
      const fromTime = leave.half_day_from_time ?? leave.permission_time ?? "09:30"
      const [h, m] = fromTime.split(":").map(Number)
      return istMins < (h * 60 + m - 5)
    }
    if (leave.leave_type === "full_day") {
      return istMins < (9 * 60 + 25)
    }
  }

  // Multi-day full_day leave already started (from_date < today) — no withdraw
  return false
}
function fmtShort(d: string) {
  return new Date(d).toLocaleDateString("en-US", { day: "numeric", month: "short" })
}
function fmtFull(d: string) {
  return new Date(d).toLocaleDateString("en-US", { day: "numeric", month: "short", year: "numeric", weekday: "short" })
}

// ── Mini Sparkline ─────────────────────────────────────────────────────────────
function Sparkline({ color, trend = "up" }: { color: string; trend?: "up" | "flat" | "down" }) {
  const d = {
    up:   "M2,20 C14,16 24,12 34,9 C44,6 54,3 62,1",
    flat: "M2,12 C14,11 24,14 34,11 C44,9  54,13 62,11",
    down: "M2,2  C14,5  24,9  34,13 C44,17 54,20 62,22",
  }[trend]
  return (
    <svg width="64" height="24" viewBox="0 0 64 24" fill="none">
      <path d={d} stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}

// ── Countdown ─────────────────────────────────────────────────────────────────
function Countdown({ targetDate }: { targetDate: string }) {
  const [diff, setDiff] = useState({ d: 0, h: 0, m: 0, s: 0 })
  useEffect(() => {
    function calc() {
      const ms = new Date(targetDate).getTime() - Date.now()
      if (ms <= 0) return setDiff({ d: 0, h: 0, m: 0, s: 0 })
      setDiff({ d: Math.floor(ms / 86400000), h: Math.floor((ms % 86400000) / 3600000), m: Math.floor((ms % 3600000) / 60000), s: Math.floor((ms % 60000) / 1000) })
    }
    calc(); const id = setInterval(calc, 1000); return () => clearInterval(id)
  }, [targetDate])

  return (
    <div style={{ display: "flex", gap: 5, justifyContent: "center", margin: "8px 0 6px" }}>
      {[{ v: diff.d, l: "Days" }, { v: diff.h, l: "Hours" }, { v: diff.m, l: "Mins" }, { v: diff.s, l: "Secs" }].map(({ v, l }) => (
        <div key={l} style={{ textAlign: "center" }}>
          <div style={{ width: 42, height: 38, borderRadius: 9, background: "#DE1A1A", display: "flex", alignItems: "center", justifyContent: "center", boxShadow: "0 3px 10px rgba(222,26,26,0.4)" }}>
            <span style={{ fontSize: 16, fontWeight: 900, color: "#fff", fontVariantNumeric: "tabular-nums" }}>{String(v).padStart(2, "0")}</span>
          </div>
          <span style={{ fontSize: 8, fontWeight: 600, color: "#9CA3AF", display: "block", marginTop: 3 }}>{l}</span>
        </div>
      ))}
    </div>
  )
}

// ── Mood Tracker ──────────────────────────────────────────────────────────────
function MoodTracker() {
  const [mood, setMood] = useState<number | null>(null)
  const moods = [{ e: "😢", v: 1 }, { e: "😕", v: 2 }, { e: "😐", v: 3 }, { e: "😊", v: 4 }, { e: "😄", v: 5 }]
  return (
    <div>
      <p style={{ fontSize: 10, color: "#9CA3AF", marginBottom: 8 }}>How are you feeling today?</p>
      <div style={{ display: "flex", justifyContent: "space-between" }}>
        {moods.map(m => (
          <button key={m.v} onClick={() => setMood(m.v)} style={{ background: "none", border: "none", cursor: "pointer", fontSize: 18, lineHeight: 1, transition: "transform 0.2s", transform: mood === m.v ? "scale(1.3)" : "scale(1)", filter: mood !== null && mood !== m.v ? "grayscale(0.7) opacity(0.45)" : "none" }}>
            {m.e}
          </button>
        ))}
      </div>
      {mood !== null && (
        <p style={{ fontSize: 10, textAlign: "center", marginTop: 8, color: "#DE1A1A", fontWeight: 700 }}>
          {["", "Hope things improve! 💙", "It'll get better!", "Hang in there!", "Keep it up! ✨", "You're crushing it! 🔥"][mood]}
        </p>
      )}
    </div>
  )
}

// ── Balance Ring ──────────────────────────────────────────────────────────────
function BalanceRing({ pct }: { pct: number }) {
  const r = 30, circ = 2 * Math.PI * r
  const color = pct >= 70 ? "#10B981" : pct >= 50 ? "#F59E0B" : "#EF4444"
  const label = pct >= 70 ? "Balanced" : pct >= 50 ? "Moderate" : "Low"
  return (
    <div style={{ display: "flex", flexDirection: "column", alignItems: "center" }}>
      <div style={{ position: "relative", width: 72, height: 72 }}>
        <svg viewBox="0 0 72 72" width={72} height={72} style={{ transform: "rotate(-90deg)" }}>
          <circle cx={36} cy={36} r={r} fill="none" stroke="#F0F1F5" strokeWidth={8} />
          <circle cx={36} cy={36} r={r} fill="none" stroke={color} strokeWidth={8}
            strokeDasharray={`${(pct / 100) * circ} ${circ}`} strokeLinecap="round"
            style={{ transition: "stroke-dasharray 1s ease" }} />
        </svg>
        <div style={{ position: "absolute", inset: 0, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center" }}>
          <span style={{ fontSize: 14, fontWeight: 900, color }}>{pct}%</span>
        </div>
      </div>
      <span style={{ fontSize: 9, fontWeight: 700, color: "#9CA3AF", marginTop: 3 }}>{label}</span>
    </div>
  )
}

// ═══════════════════════════════════════════════════════════════════════════════
export default function MemberLeavesClient({ leaves: initialLeaves, userName, paidLeaveDays = 0, usedLeaveDays = 0, absentDays = [], companyLeaves = [] }: { leaves: Leave[]; userName: string; paidLeaveDays?: number; usedLeaveDays?: number; absentDays?: { id: string; date: string }[]; companyLeaves?: CompanyLeave[] }) {
  const router = useRouter()
  const [leaves, setLeaves]         = useState(initialLeaves)
  useEffect(() => { setLeaves(initialLeaves) }, [initialLeaves])

  // Merge absent days from attendance_logs — skip dates already covered by a leave record
  const absentEntries: Leave[] = absentDays
    .filter(a => !leaves.some(l => a.date >= l.from_date && a.date <= l.to_date))
    .map(a => ({
      id: `absent-${a.id}`,
      from_date: a.date,
      to_date: a.date,
      reason: "Marked as on leave",
      status: "absent",
      created_at: a.date,
      leave_type: "absent",
    }))
  const allEntries = [...leaves, ...absentEntries].sort((a, b) => b.from_date.localeCompare(a.from_date))
  const [showForm, setShowForm]         = useState(false)
  const [leaveType, setLeaveType]       = useState<LeaveType>("full_day")
  const [halfPeriod, setHalfPeriod]     = useState<"morning" | "afternoon">("morning")
  const [permFrom, setPermFrom]         = useState("")
  const [permTo, setPermTo]             = useState("")
  const [halfFrom, setHalfFrom]         = useState("")
  const [halfTo, setHalfTo]             = useState("")
  const [filterStatus, setFilter]   = useState("all")
  const [filterOpen, setFilterOpen] = useState(false)
  const [showMore, setShowMore]     = useState(false)
  const [menuOpenId, setMenuOpenId] = useState<string | null>(null)
  const [deleteId, setDeleteId]     = useState<string | null>(null)
  const [editingLeave, setEditingLeave] = useState<Leave | null>(null)
  const [deleting, startDelete]     = useTransition()
  const [editing, startEdit]        = useTransition()
  const [editError, setEditError]   = useState<string | null>(null)
  const [newFormError, setNewFormError] = useState<string | null>(null)
  const [dateError, setDateError]       = useState<string | null>(null)
  const [state, action, pending]    = useActionState(submitLeaveRequest, null)
  const menuRef = useRef<HTMLDivElement>(null)

  // Close dropdown on outside click
  useEffect(() => {
    function handler(e: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) setMenuOpenId(null)
    }
    document.addEventListener("mousedown", handler)
    return () => document.removeEventListener("mousedown", handler)
  }, [])

  // Sync form fields when editing an existing leave
  useEffect(() => {
    if (editingLeave) {
      setLeaveType((editingLeave.leave_type ?? "full_day") as LeaveType)
      if (editingLeave.half_day_period === "afternoon") setHalfPeriod("afternoon")
      else setHalfPeriod("morning")
      if (editingLeave.leave_type === "permission") {
        setPermFrom(editingLeave.permission_time ?? "")
        setPermTo((editingLeave as any).permission_end_time ?? "")
      }
      if (editingLeave.leave_type === "half_day") {
        setHalfFrom((editingLeave as any).half_day_from_time ?? "")
        setHalfTo((editingLeave as any).half_day_to_time ?? "")
      }
    }
  }, [editingLeave])

  if (state && "success" in state && state.success && showForm && !editingLeave) {
    setShowForm(false); setEditingLeave(null); setNewFormError(null); router.refresh()
  }

  function checkDuplicateDate(e: React.FormEvent<HTMLFormElement>) {
    setNewFormError(null)
    const fd = new FormData(e.currentTarget)
    const fromDate = fd.get("from_date") as string || ""
    const toDate   = (fd.get("to_date") as string) || fromDate
    if (!fromDate) return // let HTML5 required handle it

    // Block if any date in range is a company holiday
    const holidaySet = new Set(companyLeaves.map(h => h.date))
    const cur = new Date(fromDate + "T12:00:00")
    const end = new Date(toDate   + "T12:00:00")
    while (cur <= end) {
      const ds = cur.toISOString().split("T")[0]
      if (holidaySet.has(ds)) {
        const hName = companyLeaves.find(h => h.date === ds)?.name ?? "a company holiday"
        e.preventDefault()
        setNewFormError(`${ds} is already a company holiday (${hName}). You cannot apply leave on a holiday.`)
        return
      }
      cur.setDate(cur.getDate() + 1)
    }

    const conflict = leaves.some(l => !(toDate < l.from_date || fromDate > l.to_date))
    if (conflict) {
      e.preventDefault()
      setNewFormError("You already have a leave request on this date. Only one leave per date is allowed.")
    }
  }

  const today = new Date().toISOString().split("T")[0]

  function isExpired(leave: Leave) {
    return leave.status === "pending" && leave.to_date < today
  }

  const approved = allEntries.filter(l => l.status === "approved")
  // Only show pending leaves where the start date is today or in the future
  const pendingL = allEntries.filter(l => l.status === "pending" && l.from_date >= today)
  const rejected = allEntries.filter(l => l.status === "rejected")
  const absentCount = allEntries.filter(l => l.status === "absent").length

  const MONTHLY_LIMIT = 5
  const currentMonth  = today.slice(0, 7) // "YYYY-MM"
  const monthlyUsed   = approved
    .filter(l => l.from_date.startsWith(currentMonth))
    .reduce((s, l) => {
      const type = l.leave_type ?? "full_day"
      if (type === "full_day") return s + daysBetween(l.from_date, l.to_date)
      if (type === "half_day") return s + 0.5
      return s
    }, 0)
  const monthlyBalance  = Math.max(0, MONTHLY_LIMIT - monthlyUsed)
  const balancePct      = Math.round((monthlyBalance / MONTHLY_LIMIT) * 100)
  const nextHoliday = companyLeaves.find(h => h.date >= today) ?? null
  const wlbScore    = Math.min(100, Math.max(30, Math.round(72 - pendingL.length * 3 + approved.length * 2)))

  function handleDelete(id: string) {
    startDelete(async () => {
      const res = await deleteLeaveRequest(id)
      if (res.success) {
        setLeaves(prev => prev.filter(l => l.id !== id))
        setDeleteId(null)
      }
    })
  }

  const filteredLeaves = allEntries.filter(l => filterStatus === "all" || l.status === filterStatus)
  const visibleLeaves  = showMore ? filteredLeaves : filteredLeaves.slice(0, 5)

  const FIELD: React.CSSProperties = { background: "#F9FAFB", border: "1.5px solid #E8EAED", color: "#111827", borderRadius: "12px", padding: "11px 14px", fontSize: "13px", outline: "none", width: "100%" }

  return (
    <div style={{ display: "flex", background: "#F5F6FA", minHeight: "100vh" }}>

      {/* ════ MAIN CONTENT ═══════════════════════════════════════════════════ */}
      <div style={{ flex: 1, minWidth: 0, overflow: "auto" }}>

        {/* ── Hero ─────────────────────────────────────────────────────────── */}
        <div style={{
          background: "#FFFFFF",
          position: "relative", overflow: "hidden", height: "clamp(160px,35vw,260px)",
          boxShadow: "0 4px 24px rgba(0,0,0,0.08)",
          borderBottom: "1px solid #EBEDF2",
        }}>
          {/* Red radial glow — top left */}
          <div style={{ position: "absolute", top: -70, left: -70, width: 300, height: 300, borderRadius: "50%", background: "radial-gradient(circle, rgba(222,26,26,0.12) 0%, transparent 70%)", pointerEvents: "none" }} />
          {/* Blue radial glow — top right */}
          <div style={{ position: "absolute", top: -60, right: -60, width: 280, height: 280, borderRadius: "50%", background: "radial-gradient(circle, rgba(99,102,241,0.12) 0%, transparent 70%)", pointerEvents: "none" }} />
          {/* Subtle bottom fade */}
          <div style={{ position: "absolute", bottom: 0, left: 0, right: 0, height: 70, background: "linear-gradient(to top, rgba(248,249,252,0.7), transparent)", pointerEvents: "none" }} />

          {/* Left: text */}
          <div style={{ position: "absolute", left: 32, top: 26, zIndex: 2 }}>
            {/* Badge — red gradient */}
            <div style={{ display: "inline-flex", alignItems: "center", gap: 6, background: "linear-gradient(135deg, #DE1A1A 0%, #8B1212 100%)", borderRadius: 20, padding: "5px 14px", marginBottom: 14, boxShadow: "0 4px 14px rgba(222,26,26,0.3)" }}>
              <span style={{ fontSize: 13 }}>⭐</span>
              <span style={{ fontSize: 12, fontWeight: 700, color: "#FFFFFF" }}>Leave Management</span>
            </div>
            <p style={{ fontSize: 12, color: "#6B7280", fontWeight: 600, margin: "0 0 6px" }}>Hello, {userName}! 👋</p>
            <h1 style={{ fontSize: "clamp(26px,3vw,40px)", fontWeight: 900, letterSpacing: "-0.025em", lineHeight: 1.05, fontFamily: "var(--font-jakarta)", margin: "0 0 10px", color: "#111111" }}>
              Leave{" "}
              <span style={{ color: "#DE1A1A" }}>
                Requests
              </span>
            </h1>
            <p style={{ fontSize: 13, color: "#6B7280", margin: 0, lineHeight: 1.65, maxWidth: 260 }}>
              Apply for leave and track your requests<br />in one beautiful place.
            </p>
          </div>

          {/* Center: large illustration — anchored bottom */}
          <div style={{ position: "absolute", left: "50%", transform: "translateX(-46%)", bottom: 0, zIndex: 1 }}>
            <Image src="/brand/leave-hero.png" alt="" width={500} height={260}
              style={{ objectFit: "contain", objectPosition: "bottom center", display: "block" }} priority />
          </div>

          {/* Apply Leave CTA — desktop only (top-right corner) */}
          <div className="hidden md:flex" style={{ position: "absolute", right: 28, top: 20, zIndex: 3, flexDirection: "column", alignItems: "flex-end", gap: 18 }}>
            <button onClick={() => setShowForm(true)}
              style={{ display: "flex", alignItems: "center", gap: 8, padding: "13px 28px", borderRadius: 14, background: "linear-gradient(135deg, #DE1A1A 0%, #8B1212 100%)", color: "#FFFFFF", fontSize: 14, fontWeight: 800, border: "none", cursor: "pointer", boxShadow: "0 6px 24px rgba(222,26,26,0.35)", whiteSpace: "nowrap" }}>
              <Plus size={16} strokeWidth={2.5} /> Apply Leave
            </button>
          </div>
        </div>

        {/* Mobile Apply Leave button — shown only on mobile, below hero */}
        <div className="md:hidden px-4 pt-4 pb-2">
          <button onClick={() => setShowForm(true)}
            style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 8, width: "100%", padding: "14px", borderRadius: 14, background: "linear-gradient(135deg, #DE1A1A 0%, #8B1212 100%)", color: "#FFFFFF", fontSize: 15, fontWeight: 800, border: "none", cursor: "pointer", boxShadow: "0 4px 16px rgba(222,26,26,0.35)" }}>
            <Plus size={18} strokeWidth={2.5} /> Apply Leave
          </button>
        </div>

        <div className="px-4 md:px-8 py-6">

          {/* ── Stats Cards ──────────────────────────────────────────────── */}
          <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-6 gap-3 mb-6">
            {[
              { label: "Total Leaves\nThis Year",       val: allEntries.length,  color: "#EF4444", bg: "rgba(239,68,68,0.1)",   icon: "📋", trend: "up"   as const, sub: "↑ 10% from last year",   subColor: "#10B981" },
              { label: "Pending\nRequests",             val: pendingL.length, color: "#F59E0B", bg: "rgba(245,158,11,0.1)",  icon: "⏳", trend: "flat" as const, sub: "— Same as last week",     subColor: "#9CA3AF" },
              { label: "Approved\nLeaves",              val: approved.length, color: "#10B981", bg: "rgba(16,185,129,0.1)",  icon: "✅", trend: "up"   as const, sub: "↑ 22% from last week",   subColor: "#10B981" },
              { label: "Leave\nDays",                    val: absentCount,     color: "#8B5CF6", bg: "rgba(139,92,246,0.1)", icon: "🏠", trend: "flat" as const, sub: "— Same as last week",     subColor: "#9CA3AF" },
              { label: "Annual Leave\nRemaining",          val: Math.max(0, paidLeaveDays - usedLeaveDays), color: "#0EA5E9", bg: "rgba(14,165,233,0.1)", icon: "🏖️", trend: null, sub: null, subColor: "" },
              { label: "Upcoming\nHolidays",            val: companyLeaves.filter(h => h.date >= today).length, color: "#EC4899", bg: "rgba(236,72,153,0.1)", icon: "🎁", trend: null, sub: null, subColor: "" },
            ].map((s, i) => (
              <div key={i} style={{ background: "#fff", borderRadius: 18, padding: "18px 16px 14px", border: "1px solid #EBEDF2", boxShadow: "0 1px 4px rgba(0,0,0,0.04), 0 4px 16px rgba(0,0,0,0.04)", display: "flex", flexDirection: "column", gap: 0, position: "relative", overflow: "hidden" }}>
                {/* Icon badge */}
                <div style={{ width: 38, height: 38, borderRadius: 11, background: s.bg, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 18, marginBottom: 12 }}>
                  {s.icon}
                </div>
                {/* Number */}
                <p style={{ fontSize: "clamp(22px,2vw,30px)", fontWeight: 900, color: s.color, lineHeight: 1, marginBottom: 4, fontFamily: "var(--font-jakarta)" }}>{s.val}</p>
                {/* Label */}
                <p style={{ fontSize: 10, fontWeight: 600, color: "#9CA3AF", lineHeight: 1.4, whiteSpace: "pre-line", marginBottom: 10 }}>{s.label}</p>

                {/* Bottom: sparkline or progress */}
                {s.trend ? (
                  <div style={{ display: "flex", alignItems: "flex-end", justifyContent: "space-between", marginTop: "auto" }}>
                    <p style={{ fontSize: 9, color: s.subColor, fontWeight: 600 }}>{s.sub}</p>
                    <Sparkline color={s.color} trend={s.trend} />
                  </div>
                ) : s.label.includes("Annual Leave") ? (
                  <div>
                    <div style={{ height: 4, borderRadius: 99, background: "#EEF0F5", marginBottom: 8, overflow: "hidden" }}>
                      <div style={{ height: "100%", width: paidLeaveDays > 0 ? `${Math.min(100, Math.round((usedLeaveDays / paidLeaveDays) * 100))}%` : "0%", background: "#0EA5E9", borderRadius: 99 }} />
                    </div>
                    <p style={{ fontSize: 10, color: "#0EA5E9", fontWeight: 700 }}>{usedLeaveDays} of {paidLeaveDays} days used</p>
                  </div>
                ) : null}
              </div>
            ))}
          </div>

          {/* ── Leave Timeline ───────────────────────────────────────────── */}
          <div style={{ background: "#fff", borderRadius: 20, border: "1px solid #EBEDF2", boxShadow: "0 1px 4px rgba(0,0,0,0.04),0 4px 16px rgba(0,0,0,0.04)", padding: "24px", marginBottom: 20 }}>

            {/* Header */}
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 24 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                <div style={{ width: 36, height: 36, borderRadius: 10, background: "rgba(222,26,26,0.08)", display: "flex", alignItems: "center", justifyContent: "center" }}>
                  <CalendarDays size={16} style={{ color: "#DE1A1A" }} />
                </div>
                <div>
                  <h2 style={{ fontSize: 15, fontWeight: 900, color: "#0A0A0B", margin: 0 }}>Your Leave Timeline</h2>
                  <p style={{ fontSize: 11, color: "#9CA3AF", margin: 0 }}>{filteredLeaves.length} request{filteredLeaves.length !== 1 ? "s" : ""}</p>
                </div>
              </div>

              {/* Filters */}
              <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                {/* Dropdown */}
                <div style={{ position: "relative" }}>
                  <button onClick={() => setFilterOpen(o => !o)}
                    style={{ display: "flex", alignItems: "center", gap: 6, padding: "8px 14px", borderRadius: 10, background: "#F5F6FA", border: "1px solid #EBEDF2", fontSize: 12, fontWeight: 600, color: "#374151", cursor: "pointer" }}>
                    {filterStatus === "all" ? "All Status" : filterStatus}
                    <ChevronDown size={13} style={{ transform: filterOpen ? "rotate(180deg)" : "none", transition: "transform 0.2s" }} />
                  </button>
                  {filterOpen && (
                    <div style={{ position: "absolute", top: "calc(100% + 6px)", right: 0, background: "#fff", borderRadius: 12, border: "1px solid #EBEDF2", boxShadow: "0 8px 24px rgba(0,0,0,0.12)", zIndex: 20, minWidth: 140, overflow: "hidden" }}>
                      {["all", "pending", "approved", "rejected", "absent"].map(s => ( // "absent" = system-marked leave days
                        <button key={s} onClick={() => { setFilter(s); setFilterOpen(false) }}
                          style={{ display: "block", width: "100%", textAlign: "left", padding: "10px 14px", fontSize: 12, fontWeight: 600, color: filterStatus === s ? "#DE1A1A" : "#374151", background: filterStatus === s ? "rgba(222,26,26,0.05)" : "none", border: "none", cursor: "pointer", textTransform: "capitalize" }}>
                          {s === "all" ? "All Status" : s}
                        </button>
                      ))}
                    </div>
                  )}
                </div>
                <button style={{ width: 36, height: 36, borderRadius: 10, background: "#F5F6FA", border: "1px solid #EBEDF2", display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer" }}>
                  <SlidersHorizontal size={14} style={{ color: "#6B7280" }} />
                </button>
                <button style={{ width: 36, height: 36, borderRadius: 10, background: "#F5F6FA", border: "1px solid #EBEDF2", display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer" }}>
                  <Calendar size={14} style={{ color: "#6B7280" }} />
                </button>
              </div>
            </div>

            {/* Timeline entries */}
            {filteredLeaves.length === 0 ? (
              <div style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", padding: "64px 0", background: "#FAFBFC", borderRadius: 16, border: "2px dashed #E8EAED" }}>
                <span style={{ fontSize: 48, marginBottom: 12 }}>🏖️</span>
                <p style={{ fontSize: 15, fontWeight: 800, color: "#374151", margin: "0 0 4px" }}>No leave requests</p>
                <p style={{ fontSize: 12, color: "#9CA3AF", margin: 0 }}>Apply for leave using the button above.</p>
              </div>
            ) : (
              <div style={{ position: "relative" }}>
                {/* Vertical timeline line */}
                <div style={{ position: "absolute", left: 9, top: 16, bottom: 16, width: 2, background: "linear-gradient(to bottom, #DE1A1A30, #10B98130, #EF444430)", borderRadius: 99, zIndex: 0 }} />

                <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
                  {visibleLeaves.map((leave, idx) => {
                    const sc    = STATUS_CFG[leave.status as keyof typeof STATUS_CFG] ?? STATUS_CFG.pending
                    const type  = leave.leave_type ?? "full_day"
                    const illus = TYPE_ILLUSTRATION[type] ?? TYPE_ILLUSTRATION.full_day
                    const isPerm  = type === "permission"
                    const isHalf  = type === "half_day"
                    const days    = (!isPerm && !isHalf) ? daysBetween(leave.from_date, leave.to_date) : null
                    const dateObj = new Date(leave.from_date)
                    const mon     = dateObj.toLocaleDateString("en-US", { month: "short" }).toUpperCase()
                    const day     = dateObj.getDate()
                    const yr      = dateObj.getFullYear()
                    const wd      = dateObj.toLocaleDateString("en-US", { weekday: "short" })
                    const StatusIcon = sc.icon
                    const typeName = type === "full_day" ? "Full Day Leave" : type === "half_day" ? "Half Day Leave" : type === "permission" ? "Permission" : type === "absent" ? "On Leave" : "Full Day Leave"
                    const badgeText = type === "full_day" ? "Full Day" : type === "half_day" ? `Half Day · ${leave.half_day_period ?? "morning"}` : type === "permission" ? `${leave.permission_hours ?? 1}h${leave.permission_time ? ` · ${leave.permission_time}` : ""}` : type === "absent" ? "Leave" : "Full Day"
                    const badgeBg   = type === "full_day" ? "rgba(16,185,129,0.12)" : type === "half_day" ? "rgba(99,102,241,0.12)" : type === "absent" ? "rgba(107,114,128,0.12)" : "rgba(245,158,11,0.12)"
                    const badgeCol  = type === "full_day" ? "#10B981" : type === "half_day" ? "#6366F1" : type === "absent" ? "#6B7280" : "#F59E0B"
                    const duration  = isPerm ? `${leave.permission_hours}h session` : isHalf ? "1 Session" : `${days} Day${days && days > 1 ? "s" : ""}`

                    return (
                      <div key={leave.id} style={{ display: "flex", alignItems: "stretch", gap: 12, position: "relative", zIndex: 1 }}>
                        {/* Timeline dot */}
                        <div style={{ display: "flex", flexDirection: "column", alignItems: "center", flexShrink: 0, paddingTop: 14, width: 20 }}>
                          <div style={{ width: 14, height: 14, borderRadius: "50%", background: sc.color, border: "3px solid #fff", boxShadow: `0 0 0 3px ${sc.color}30`, flexShrink: 0 }} />
                        </div>

                        {/* Date badge */}
                        <div style={{ width: 72, flexShrink: 0, borderRadius: 14, border: `1.5px solid ${sc.color}25`, background: `${sc.color}08`, padding: "10px 0", textAlign: "center", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 1 }}>
                          <span style={{ fontSize: 8, fontWeight: 900, color: sc.color, letterSpacing: "0.1em" }}>{mon}</span>
                          <span style={{ fontSize: 26, fontWeight: 900, color: sc.color, lineHeight: 1 }}>{day}</span>
                          <span style={{ fontSize: 9, color: "#9CA3AF", fontWeight: 600 }}>{yr}</span>
                          <span style={{ fontSize: 8, color: "#9CA3AF" }}>{wd} · {isHalf ? (leave.half_day_period ?? "Morning") : isPerm ? "Session" : type === "absent" ? "Leave" : "Full Day"}</span>
                        </div>

                        {/* Card */}
                        <div style={{ flex: 1, background: "#FAFBFC", borderRadius: 16, border: "1px solid #EBEDF2", padding: "14px 16px", display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, boxShadow: "0 1px 3px rgba(0,0,0,0.04)" }}>
                          {/* Left info */}
                          <div style={{ flex: 1, minWidth: 0 }}>
                            <div style={{ display: "flex", alignItems: "center", flexWrap: "wrap", gap: 8, marginBottom: 6 }}>
                              <span style={{ fontSize: 14, fontWeight: 900, color: "#0A0A0B" }}>{typeName}</span>
                              <span style={{ fontSize: 10, fontWeight: 700, padding: "3px 9px", borderRadius: 99, background: badgeBg, color: badgeCol }}>{badgeText}</span>
                            </div>
                            <p style={{ fontSize: 12, color: "#6B7280", margin: "0 0 5px", display: "flex", alignItems: "center", gap: 5 }}>
                              <span style={{ fontSize: 13 }}>⭐</span> {leave.reason}
                            </p>
                            <p style={{ fontSize: 11, color: "#9CA3AF", margin: 0, display: "flex", alignItems: "center", gap: 5 }}>
                              <span style={{ width: 6, height: 6, borderRadius: "50%", background: sc.color, display: "inline-block", flexShrink: 0 }} />
                              {isHalf || isPerm ? fmtFull(leave.from_date) : `${fmtShort(leave.from_date)} — ${fmtShort(leave.to_date)}`} · {duration}
                            </p>
                            {leave.status === "rejected" && (
                              <p style={{ fontSize: 10, color: "#9CA3AF", margin: "4px 0 0", fontStyle: "italic" }}>Reviewed by HR Team</p>
                            )}
                          </div>

                          {/* 3D illustration */}
                          <div style={{ width: 68, height: 68, borderRadius: 18, background: illus.bg, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 34, flexShrink: 0 }}>
                            {illus.emoji}
                          </div>

                          {/* Status + menu */}
                          <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", gap: 8, flexShrink: 0 }}>
                            {isExpired(leave) ? (
                              <span style={{ display: "inline-flex", alignItems: "center", gap: 4, padding: "6px 12px", borderRadius: 20, background: "rgba(107,114,128,0.1)", fontSize: 11, fontWeight: 700, color: "#6B7280" }}>
                                Expired
                              </span>
                            ) : (
                              <span style={{ display: "flex", alignItems: "center", gap: 5, padding: "6px 12px", borderRadius: 20, background: sc.bg, color: sc.color, fontSize: 11, fontWeight: 700 }}>
                                <StatusIcon size={11} /> {sc.label}
                              </span>
                            )}
                            {leave.status === "approved" && (
                              <div style={{ display: "flex" }}>
                                {["#6366F1", "#10B981", "#F59E0B"].map((c, i) => (
                                  <div key={i} style={{ width: 22, height: 22, borderRadius: "50%", background: c, border: "2px solid #fff", marginLeft: i > 0 ? -6 : 0, fontSize: 9, display: "flex", alignItems: "center", justifyContent: "center", color: "#fff", fontWeight: 800 }}>
                                    {["A", "B", "C"][i]}
                                  </div>
                                ))}
                                <div style={{ width: 22, height: 22, borderRadius: "50%", background: "#F3F4F6", border: "2px solid #fff", marginLeft: -6, fontSize: 8, display: "flex", alignItems: "center", justifyContent: "center", color: "#6B7280", fontWeight: 700 }}>+2</div>
                              </div>
                            )}
                            {leave.status === "approved" && (
                              <p style={{ fontSize: 9, color: "#9CA3AF", margin: 0 }}>Requested on {fmtShort(leave.created_at)}</p>
                            )}
                            {/* Actions: pending → Edit + Cancel; approved → Withdraw; absent/rejected → nothing */}
                            {leave.status === "absent" || leave.status === "rejected" ? null : leave.status === "pending" ? (
                              <div style={{ display: "flex", flexDirection: "column", gap: 6, alignItems: "flex-end" }}>
                                <button
                                  onClick={() => { setEditingLeave(leave); setShowForm(true) }}
                                  style={{ display: "flex", alignItems: "center", gap: 5, padding: "5px 11px", borderRadius: 8, background: "rgba(99,102,241,0.08)", border: "1px solid rgba(99,102,241,0.2)", fontSize: 11, fontWeight: 700, color: "#6366F1", cursor: "pointer" }}>
                                  <Pencil size={11} /> Edit
                                </button>
                                <button
                                  onClick={() => setDeleteId(leave.id)}
                                  style={{ display: "flex", alignItems: "center", gap: 5, padding: "5px 11px", borderRadius: 8, background: "rgba(239,68,68,0.07)", border: "1px solid rgba(239,68,68,0.18)", fontSize: 11, fontWeight: 700, color: "#EF4444", cursor: "pointer" }}>
                                  <X size={11} /> Cancel
                                </button>
                              </div>
                            ) : leave.status === "approved" && canWithdraw(leave) ? (
                              <button onClick={() => setDeleteId(leave.id)}
                                style={{ display: "flex", alignItems: "center", gap: 5, padding: "5px 11px", borderRadius: 8, background: "rgba(239,68,68,0.07)", border: "1px solid rgba(239,68,68,0.18)", fontSize: 11, fontWeight: 700, color: "#EF4444", cursor: "pointer" }}>
                                <X size={11} /> Withdraw
                              </button>
                            ) : null}
                          </div>
                        </div>
                      </div>
                    )
                  })}
                </div>

                {filteredLeaves.length > 5 && (
                  <div style={{ display: "flex", justifyContent: "center", marginTop: 20 }}>
                    <button onClick={() => setShowMore(s => !s)}
                      style={{ display: "flex", alignItems: "center", gap: 6, padding: "10px 24px", borderRadius: 20, background: "#F5F6FA", border: "1px solid #EBEDF2", fontSize: 12, fontWeight: 600, color: "#6B7280", cursor: "pointer" }}>
                      {showMore ? "Show Less" : `Load More`}
                      <ChevronDown size={12} style={{ transform: showMore ? "rotate(180deg)" : "none", transition: "transform 0.2s" }} />
                    </button>
                  </div>
                )}
              </div>
            )}
          </div>

          {/* ── Company Holidays ─────────────────────────────────────────── */}
          {companyLeaves.length > 0 && (
            <div style={{ background:"#FFFFFF", borderRadius:20, border:"1px solid #EBEDF2", overflow:"hidden", boxShadow:"0 2px 10px rgba(0,0,0,0.05)" }}>
              <div style={{ padding:"16px 20px", borderBottom:"1px solid #F0F1F5", background:"linear-gradient(135deg,rgba(30,64,175,0.06) 0%,rgba(30,64,175,0.02) 100%)", display:"flex", alignItems:"center", gap:10 }}>
                <div style={{ width:34, height:34, borderRadius:10, background:"rgba(30,64,175,0.1)", display:"flex", alignItems:"center", justifyContent:"center", fontSize:16, flexShrink:0 }}>🏢</div>
                <div>
                  <p style={{ fontSize:13, fontWeight:800, color:"#111827", margin:0 }}>Company Holidays 2026</p>
                  <p style={{ fontSize:10, color:"#9CA3AF", margin:0 }}>{companyLeaves.length} holidays this year</p>
                </div>
              </div>
              <div style={{ display:"flex", flexDirection:"column" }}>
                {companyLeaves.map((h, i) => {
                  const d = new Date(h.date + "T12:00:00")
                  const dayName   = d.toLocaleDateString("en-IN", { weekday:"short" })
                  const dateFmt   = d.toLocaleDateString("en-IN", { day:"numeric", month:"short", year:"numeric" })
                  const isPast    = h.date < today
                  const isToday2  = h.date === today
                  return (
                    <div key={h.id} style={{ display:"flex", alignItems:"center", gap:12, padding:"11px 20px", borderBottom: i < companyLeaves.length - 1 ? "1px solid #F5F6FA" : "none", opacity: isPast ? 0.5 : 1 }}>
                      <div style={{ width:40, height:40, borderRadius:10, background: isToday2 ? "rgba(30,64,175,0.15)" : isPast ? "#F3F4F6" : "rgba(30,64,175,0.08)", display:"flex", flexDirection:"column", alignItems:"center", justifyContent:"center", flexShrink:0 }}>
                        <span style={{ fontSize:13, fontWeight:900, color: isPast ? "#9CA3AF" : "#1E40AF", lineHeight:1 }}>{d.getDate()}</span>
                        <span style={{ fontSize:7, fontWeight:700, color: isPast ? "#9CA3AF" : "#1E40AF", textTransform:"uppercase" }}>{d.toLocaleDateString("en-IN",{month:"short"})}</span>
                      </div>
                      <div style={{ flex:1, minWidth:0 }}>
                        <p style={{ fontSize:12, fontWeight:700, color:"#111827", margin:0 }}>{h.name}</p>
                        <p style={{ fontSize:10, color:"#9CA3AF", margin:"2px 0 0" }}>{dayName} · {dateFmt}</p>
                      </div>
                      {isToday2 && <span style={{ fontSize:10, fontWeight:700, color:"#1E40AF", background:"rgba(30,64,175,0.1)", padding:"2px 8px", borderRadius:99, flexShrink:0 }}>Today</span>}
                      {!isPast && !isToday2 && <span style={{ fontSize:10, fontWeight:700, color:"#6B7280", background:"#F3F4F6", padding:"2px 8px", borderRadius:99, flexShrink:0 }}>Upcoming</span>}
                      {isPast && <span style={{ fontSize:10, color:"#9CA3AF", flexShrink:0 }}>Done</span>}
                    </div>
                  )
                })}
              </div>
            </div>
          )}

          {/* ── Bottom Banner — hidden on mobile ─────────────────────────── */}
          <div style={{ position: "relative", borderRadius: 24, overflow: "hidden", background: "linear-gradient(135deg,#FFF8EE 0%,#FFEFD0 55%,#FFF4E0 100%)", border: "1px solid #F0E4C8", minHeight: 300 }} className="hidden md:flex flex-col md:flex-row">

            {/* Left content */}
            <div style={{ position: "relative", zIndex: 2 }} className="flex flex-col p-6 md:p-8 flex-1">

              {/* Badge */}
              <div style={{ marginBottom: 16 }}>
                <span style={{ display: "inline-flex", alignItems: "center", gap: 6, padding: "5px 14px", borderRadius: 99, background: "rgba(222,26,26,0.07)", border: "1.5px solid rgba(222,26,26,0.18)", fontSize: 12, fontWeight: 700, color: "#DE1A1A" }}>
                  ✈️ Time to Recharge
                </span>
              </div>

              {/* Two-line heading */}
              <div style={{ marginBottom: 10 }}>
                <p style={{ fontSize: "clamp(26px,2.8vw,36px)", fontWeight: 900, color: "#0A0A0B", lineHeight: 1.15, margin: "0 0 2px", fontFamily: "var(--font-jakarta)" }}>
                  Work hard,
                </p>
                <p style={{ fontSize: "clamp(26px,2.8vw,36px)", fontWeight: 900, color: "#DE1A1A", lineHeight: 1.15, margin: 0, fontFamily: "var(--font-jakarta)" }}>
                  travel harder! ✈️ <span style={{ fontSize: "0.6em" }}>✨</span>
                </p>
              </div>

              {/* Subtitle */}
              <p style={{ fontSize: 13, color: "#78716C", margin: "0 0 22px", lineHeight: 1.7 }}>
                You&apos;ve earned your break.<br />Take time off and recharge!
              </p>

              {/* Pill button */}
              <div style={{ marginBottom: 28 }}>
                <button onClick={() => setShowForm(true)}
                  style={{ display: "inline-flex", alignItems: "center", gap: 8, padding: "13px 30px", borderRadius: 99, background: "#DE1A1A", color: "#fff", fontSize: 14, fontWeight: 700, border: "none", cursor: "pointer", boxShadow: "0 6px 22px rgba(222,26,26,0.42)" }}>
                  <Palmtree size={16} /> Plan My Vacation →
                </button>
              </div>

              {/* Feature items */}
              <div style={{ display: "flex", gap: 24, flexWrap: "wrap", marginTop: "auto" }}>
                {[
                  { icon: "🌴", title: "Relax & Unwind",       sub: "Take a well-deserved break",      iconBg: "rgba(34,197,94,0.12)", iconBorder: "rgba(34,197,94,0.2)" },
                  { icon: "📷", title: "Explore New Places",    sub: "Create unforgettable memories",   iconBg: "rgba(99,102,241,0.1)",  iconBorder: "rgba(99,102,241,0.18)" },
                  { icon: "⚡", title: "Come Back Stronger",    sub: "Recharge and stay productive",    iconBg: "rgba(245,158,11,0.12)", iconBorder: "rgba(245,158,11,0.2)"  },
                ].map(f => (
                  <div key={f.title} style={{ display: "flex", alignItems: "center", gap: 9 }}>
                    <div style={{ width: 34, height: 34, borderRadius: 10, background: f.iconBg, border: `1px solid ${f.iconBorder}`, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 15, flexShrink: 0 }}>
                      {f.icon}
                    </div>
                    <div>
                      <p style={{ fontSize: 11, fontWeight: 800, color: "#0A0A0B", margin: 0, lineHeight: 1.3 }}>{f.title}</p>
                      <p style={{ fontSize: 10, color: "#9CA3AF", margin: 0 }}>{f.sub}</p>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Right: vacation image — full height, edge to edge */}
            <div style={{ position: "relative", minHeight: 220 }} className="flex-1 md:flex-none md:w-[44%]">
              <div style={{ position: "absolute", inset: 0, backgroundImage: "url('/brand/vacation-boy.png')", backgroundRepeat: "no-repeat", backgroundPosition: "center center", backgroundSize: "cover" }} />
              {/* Blend left edge into cream background */}
              <div style={{ position: "absolute", inset: 0, background: "linear-gradient(to right, #FFEFD0 0%, rgba(255,239,208,0.6) 18%, transparent 42%)", zIndex: 1, pointerEvents: "none" }} />
            </div>
          </div>
        </div>
      </div>

      {/* ── Delete Confirm Modal ─────────────────────────────────────────────── */}
      {deleteId && (
        <div style={{ position: "fixed", inset: 0, zIndex: 60, display: "flex", alignItems: "center", justifyContent: "center", padding: 16, background: "rgba(10,10,11,0.65)", backdropFilter: "blur(8px)" }}>
          <div style={{ width: "100%", maxWidth: 380, background: "#fff", borderRadius: 22, padding: 28, boxShadow: "0 24px 80px rgba(0,0,0,0.25)" }}>
            <div style={{ width: 52, height: 52, borderRadius: 16, background: "rgba(239,68,68,0.1)", display: "flex", alignItems: "center", justifyContent: "center", marginBottom: 16 }}>
              <AlertTriangle size={24} style={{ color: "#EF4444" }} />
            </div>
            {(() => {
              const deletingLeave = leaves.find(l => l.id === deleteId)
              const isApproved = deletingLeave?.status === "approved"
              return (<>
                <p style={{ fontSize: 16, fontWeight: 900, color: "#0A0A0B", margin: "0 0 8px" }}>{isApproved ? "Withdraw Approved Leave?" : "Cancel Leave Request?"}</p>
                <p style={{ fontSize: 13, color: "#6B7280", margin: "0 0 24px", lineHeight: 1.6 }}>
                  {isApproved
                    ? "This will withdraw your approved leave and remove it from your attendance and history. This cannot be undone."
                    : "This will permanently remove your pending leave request. This action cannot be undone."}
                </p>
                <div style={{ display: "flex", gap: 10 }}>
                  <button onClick={() => setDeleteId(null)} style={{ flex: 1, padding: "11px 0", borderRadius: 12, fontSize: 13, fontWeight: 600, background: "#F6F7FA", color: "#6B7280", border: "1px solid #EBEDF2", cursor: "pointer" }}>Cancel</button>
                  <button onClick={() => handleDelete(deleteId)} disabled={deleting}
                    style={{ flex: 1, padding: "11px 0", borderRadius: 12, fontSize: 13, fontWeight: 700, background: "#EF4444", color: "#fff", border: "none", cursor: "pointer", opacity: deleting ? 0.7 : 1, display: "flex", alignItems: "center", justifyContent: "center", gap: 6 }}>
                    {deleting ? <Loader2 size={13} className="animate-spin" /> : <X size={13} />}
                    {isApproved ? "Withdraw Leave" : "Cancel Request"}
                  </button>
                </div>
              </>)
            })()}
          </div>
        </div>
      )}

      {/* ── Modal ────────────────────────────────────────────────────────────── */}
      {showForm && (
        <div style={{ position: "fixed", inset: 0, zIndex: 50, display: "flex", alignItems: "center", justifyContent: "center", padding: 16, background: "rgba(10,10,11,0.65)", backdropFilter: "blur(8px)" }}>
          <div style={{ width: "100%", maxWidth: 420, background: "#fff", borderRadius: 24, overflow: "hidden", boxShadow: "0 24px 80px rgba(0,0,0,0.25)" }}>
            {/* Header */}
            <div style={{ padding: "20px 24px", background: "linear-gradient(135deg,#DE1A1A,#991B1B)", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
              <div>
                <p style={{ fontSize: 16, fontWeight: 900, color: "#fff", margin: "0 0 2px" }}>{editingLeave ? "Edit Leave Request" : "Apply for Leave"}</p>
                <p style={{ fontSize: 11, color: "rgba(255,255,255,0.6)", margin: 0 }}>Fill in the details below</p>
              </div>
              <button onClick={() => { setShowForm(false); setEditingLeave(null); setLeaveType("full_day"); setHalfPeriod("morning"); setPermFrom(""); setPermTo(""); setHalfFrom(""); setHalfTo(""); setEditError(null) }}
                style={{ width: 32, height: 32, borderRadius: "50%", background: "rgba(255,255,255,0.15)", border: "none", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center" }}>
                <X size={16} color="#fff" />
              </button>
            </div>

            <div style={{ padding: 24 }}>
              <form
                action={editingLeave ? undefined : action}
                onSubmit={editingLeave ? (e) => {
                  e.preventDefault()
                  const fd = new FormData(e.currentTarget)
                  const id = editingLeave.id
                  setEditError(null)
                  startEdit(async () => {
                    const res = await updateLeaveRequest(id, fd)
                    if ("error" in res) { setEditError(res.error); return }
                    setLeaves(prev => prev.map(l => l.id === id ? {
                      ...l,
                      leave_type: (fd.get("leave_type") as string) || l.leave_type,
                      from_date: (fd.get("from_date") as string) || l.from_date,
                      to_date: (fd.get("to_date") as string) || (fd.get("from_date") as string) || l.to_date,
                      reason: (fd.get("reason") as string) || l.reason,
                      half_day_period: fd.get("half_day_period") as string | null ?? l.half_day_period,
                      permission_hours: fd.get("permission_hours") ? Number(fd.get("permission_hours")) : l.permission_hours,
                      permission_time: (fd.get("permission_time") as string) || l.permission_time,
                      ...(fd.get("permission_end_time") ? { permission_end_time: fd.get("permission_end_time") as string } : {}),
                      ...(fd.get("half_day_from_time") ? { half_day_from_time: fd.get("half_day_from_time") as string } : {}),
                      ...(fd.get("half_day_to_time") ? { half_day_to_time: fd.get("half_day_to_time") as string } : {}),
                    } : l))
                    setShowForm(false)
                    setEditingLeave(null)
                    setLeaveType("full_day")
                    setHalfPeriod("morning")
                    setPermFrom(""); setPermTo("")
                    setHalfFrom(""); setHalfTo("")
                  })
                } : checkDuplicateDate}
                style={{ display: "flex", flexDirection: "column", gap: 16 }}>
                <input type="hidden" name="leave_type" value={leaveType} />
                {leaveType === "half_day" && <input type="hidden" name="half_day_period" value={halfPeriod} />}

                <div>
                  <label style={{ display: "block", fontSize: 10, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.14em", color: "#374151", marginBottom: 8 }}>Leave Type *</label>
                  <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 8 }}>
                    {([
                      { key: "full_day", label: "Full Day", emoji: "☀️" },
                      { key: "half_day", label: "Half Day", emoji: "🌤️" },
                      { key: "permission", label: "Permission", emoji: "⏰" },
                    ] as { key: LeaveType; label: string; emoji: string }[]).map(({ key, label, emoji }) => (
                      <button key={key} type="button" onClick={() => setLeaveType(key)}
                        style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 6, padding: "12px 0", borderRadius: 14, fontSize: 12, fontWeight: 700, border: "none", cursor: "pointer", ...(leaveType === key ? { background: "#DE1A1A", color: "#fff", boxShadow: "0 4px 12px rgba(222,26,26,0.35)" } : { background: "#F6F7FA", color: "#6B7280" }) }}>
                        <span style={{ fontSize: 20 }}>{emoji}</span>{label}
                      </button>
                    ))}
                  </div>
                </div>

                {leaveType === "full_day" && (
                  <div>
                    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
                      <div><label style={{ display: "block", fontSize: 10, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.14em", color: "#374151", marginBottom: 6 }}>From *</label><input name="from_date" type="date" required style={FIELD} defaultValue={editingLeave?.from_date ?? ""} min={editingLeave ? undefined : today} onInvalid={e => { e.preventDefault(); setDateError("Leave requests must be for a future date.") }} onChange={() => setDateError(null)} /></div>
                      <div><label style={{ display: "block", fontSize: 10, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.14em", color: "#374151", marginBottom: 6 }}>To *</label><input name="to_date" type="date" required style={FIELD} defaultValue={editingLeave?.to_date ?? ""} min={editingLeave ? undefined : today} onInvalid={e => { e.preventDefault(); setDateError("Leave requests must be for a future date.") }} onChange={() => setDateError(null)} /></div>
                    </div>
                    {dateError && <p style={{ fontSize: 11, color: "#DE1A1A", margin: "4px 0 0" }}>{dateError}</p>}
                  </div>
                )}
                {leaveType === "half_day" && (
                  <>
                    <input type="hidden" name="half_day_from_time" value={halfFrom} />
                    <input type="hidden" name="half_day_to_time" value={halfTo} />
                    <div><label style={{ display: "block", fontSize: 10, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.14em", color: "#374151", marginBottom: 6 }}>Date *</label><input name="from_date" type="date" required style={FIELD} defaultValue={editingLeave?.from_date ?? ""} min={editingLeave ? undefined : today} onInvalid={e => { e.preventDefault(); setDateError("Leave requests must be for a future date.") }} onChange={() => setDateError(null)} />
                    {dateError && <p style={{ fontSize: 11, color: "#DE1A1A", margin: "4px 0 0" }}>{dateError}</p>}</div>
                    <div>
                      <label style={{ display: "block", fontSize: 10, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.14em", color: "#374151", marginBottom: 8 }}>Time Period *</label>
                      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
                        <div>
                          <label style={{ display: "block", fontSize: 10, color: "#9CA3AF", marginBottom: 5 }}>From</label>
                          <input type="time" required style={FIELD} value={halfFrom} onChange={e => setHalfFrom(e.target.value)} />
                        </div>
                        <div>
                          <label style={{ display: "block", fontSize: 10, color: "#9CA3AF", marginBottom: 5 }}>To</label>
                          <input type="time" required style={FIELD} value={halfTo} onChange={e => setHalfTo(e.target.value)} />
                        </div>
                      </div>
                      {halfFrom && halfTo && (() => {
                        const [fh, fm] = halfFrom.split(":").map(Number)
                        const [th, tm] = halfTo.split(":").map(Number)
                        const diff = (th * 60 + tm) - (fh * 60 + fm)
                        if (diff <= 0) return <p style={{ fontSize: 11, color: "#EF4444", margin: "4px 0 0", fontWeight: 600 }}>To time must be after From time</p>
                        const hrs = Math.floor(diff / 60), mins = diff % 60
                        return <p style={{ fontSize: 11, color: "#6366F1", margin: "6px 0 0", fontWeight: 600 }}>Duration: {hrs > 0 ? `${hrs}h ` : ""}{mins > 0 ? `${mins}m` : ""}</p>
                      })()}
                    </div>
                  </>
                )}
                {leaveType === "permission" && (
                  <>
                    <input type="hidden" name="permission_time" value={permFrom} />
                    <input type="hidden" name="permission_end_time" value={permTo} />
                    <input type="hidden" name="permission_hours" value={
                      permFrom && permTo ? (() => {
                        const [fh, fm] = permFrom.split(":").map(Number)
                        const [th, tm] = permTo.split(":").map(Number)
                        const diff = (th * 60 + tm) - (fh * 60 + fm)
                        return diff > 0 ? String(Math.round((diff / 60) * 10) / 10) : "1"
                      })() : "1"
                    } />
                    <div><label style={{ display: "block", fontSize: 10, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.14em", color: "#374151", marginBottom: 6 }}>Date *</label><input name="from_date" type="date" required style={FIELD} defaultValue={editingLeave?.from_date ?? ""} onInvalid={e => { e.preventDefault(); setDateError("Please select a valid date.") }} onChange={() => setDateError(null)} />
                    {dateError && <p style={{ fontSize: 11, color: "#DE1A1A", margin: "4px 0 0" }}>{dateError}</p>}</div>
                    <div>
                      <label style={{ display: "block", fontSize: 10, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.14em", color: "#374151", marginBottom: 8 }}>Permission Time *</label>
                      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
                        <div>
                          <label style={{ display: "block", fontSize: 10, color: "#9CA3AF", marginBottom: 5 }}>Leave From</label>
                          <input type="time" required style={FIELD} value={permFrom} onChange={e => setPermFrom(e.target.value)} />
                        </div>
                        <div>
                          <label style={{ display: "block", fontSize: 10, color: "#9CA3AF", marginBottom: 5 }}>Return By</label>
                          <input type="time" required style={FIELD} value={permTo} onChange={e => setPermTo(e.target.value)} />
                        </div>
                      </div>
                      {permFrom && permTo && (() => {
                        const [fh, fm] = permFrom.split(":").map(Number)
                        const [th, tm] = permTo.split(":").map(Number)
                        const diff = (th * 60 + tm) - (fh * 60 + fm)
                        if (diff <= 0) return <p style={{ fontSize: 11, color: "#EF4444", margin: "4px 0 0", fontWeight: 600 }}>Return time must be after leave time</p>
                        const hrs = Math.floor(diff / 60), mins = diff % 60
                        return <p style={{ fontSize: 11, color: "#6366F1", margin: "6px 0 0", fontWeight: 600 }}>Duration: {hrs > 0 ? `${hrs}h ` : ""}{mins > 0 ? `${mins}m` : ""}</p>
                      })()}
                    </div>
                  </>
                )}
                <div>
                  <label style={{ display: "block", fontSize: 10, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.14em", color: "#374151", marginBottom: 6 }}>Reason *</label>
                  <textarea name="reason" required rows={3} placeholder="Explain the reason…" className="resize-none" style={FIELD} defaultValue={editingLeave?.reason ?? ""} />
                </div>

                {(state && "error" in state && state.error) && (
                  <p style={{ fontSize: 12, fontWeight: 600, color: "#DE1A1A", background: "rgba(222,26,26,0.07)", padding: "8px 12px", borderRadius: 10, margin: 0 }}>{state.error}</p>
                )}
                {newFormError && (
                  <p style={{ fontSize: 12, fontWeight: 600, color: "#DE1A1A", background: "rgba(222,26,26,0.07)", padding: "8px 12px", borderRadius: 10, margin: 0 }}>⚠️ {newFormError}</p>
                )}
                {editError && (
                  <p style={{ fontSize: 12, fontWeight: 600, color: "#DE1A1A", background: "rgba(222,26,26,0.07)", padding: "8px 12px", borderRadius: 10, margin: 0 }}>{editError}</p>
                )}

                <div style={{ display: "flex", gap: 10 }}>
                  <button type="button" onClick={() => { setShowForm(false); setEditingLeave(null); setLeaveType("full_day"); setHalfPeriod("morning"); setPermFrom(""); setPermTo(""); setHalfFrom(""); setHalfTo(""); setEditError(null) }}
                    style={{ flex: 1, padding: "12px 0", borderRadius: 14, fontSize: 13, fontWeight: 600, background: "#F6F7FA", color: "#6B7280", border: "1px solid #EBEDF2", cursor: "pointer" }}>Cancel</button>
                  <button type="submit" disabled={pending || editing}
                    style={{ flex: 1, padding: "12px 0", borderRadius: 14, fontSize: 13, fontWeight: 700, background: "linear-gradient(135deg,#DE1A1A,#991B1B)", color: "#fff", border: "none", cursor: "pointer", opacity: (pending || editing) ? 0.7 : 1, display: "flex", alignItems: "center", justifyContent: "center", gap: 6, boxShadow: "0 4px 12px rgba(222,26,26,0.3)" }}>
                    {(pending || editing) && <Loader2 size={13} className="animate-spin" />} {editingLeave ? "Update Request" : "Submit Request"}
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
