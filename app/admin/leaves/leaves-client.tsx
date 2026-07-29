"use client"

import Image from "next/image"
import { useRouter, usePathname } from "next/navigation"
import { useState, useTransition } from "react"
import { CheckCircle2, XCircle, Loader2, CalendarDays, Clock, Users, UserCheck, Home, XOctagon, Paperclip, Plus, Trash2, Pencil, X, AlertTriangle, ChevronLeft, ChevronRight, ChevronDown, ListFilter } from "lucide-react"
import { updateLeaveStatus, adminApplyLeaveOnBehalf, adminUpdateLeaveRequest } from "@/lib/actions/leaves"
import { addCompanyLeave, updateCompanyLeave, deleteCompanyLeave } from "@/lib/actions/company-leaves"
import { todayIST } from "@/lib/utils/ist-date"
import { HALF_DAY_THRESHOLD_HOURS } from "@/lib/utils/attendance-stats"

interface Leave {
  id: string
  from_date: string
  to_date: string
  reason: string
  status: string
  created_at: string
  leave_type?: string | null
  permission_hours?: number | null
  permission_time?: string | null
  permission_end_time?: string | null
  half_day_period?: string | null
  half_day_from_time?: string | null
  half_day_to_time?: string | null
  users: { id: string; name: string; employee_id: string; phone: string | null; gender?: string } | null
}

function fmtTimeStr(t?: string | null) {
  if (!t) return null
  const [h, m] = t.split(":").map(Number)
  const period = h >= 12 ? "PM" : "AM"
  const h12 = h % 12 === 0 ? 12 : h % 12
  return `${h12}:${String(m).padStart(2, "0")} ${period}`
}

interface CompanyLeave {
  id: string
  date: string
  name: string
}

interface LeavesClientProps {
  leaves: Leave[]
  mode: string
  upcomingLeaves: Leave[]
  availabilityPct: number
  availableCount: number
  onLeaveCountToday: number
  awayCountToday: number
  onLeaveToday: { name: string }[]
  pendingCount: number
  companyLeaves: CompanyLeave[]
  members: { id: string; name: string; employee_id: string; team: string | null }[]
}

// ── Helpers ────────────────────────────────────────────────────────────────────

// Single combined filter: Leaves/Permission by type, Pending/Approved/Rejected by status,
// All = every leave, Holidays = the holiday-management view.
const MODE_OPTIONS = [
  { value: "pending",    label: "Pending" },
  { value: "leaves",     label: "Leaves" },
  { value: "permission", label: "Permission" },
  { value: "approved",   label: "Approved" },
  { value: "rejected",   label: "Rejected" },
  { value: "all",        label: "All" },
]

function daysBetween(from: string, to: string) {
  return Math.max(1, Math.ceil((new Date(to).getTime() - new Date(from).getTime()) / 86400000) + 1)
}

function fmtRange(from: string, to: string) {
  const opts: Intl.DateTimeFormatOptions = { day: "numeric", month: "short", year: "numeric" }
  if (from === to) return new Date(from).toLocaleDateString("en-IN", opts)
  const f = new Date(from).toLocaleDateString("en-IN", { day: "numeric", month: "short" })
  return `${f} – ${new Date(to).toLocaleDateString("en-IN", opts)}`
}

function fmtShort(d: string) {
  return new Date(d).toLocaleDateString("en-IN", { day: "numeric", month: "short" })
}

function getLeaveType(reason: string) {
  const r = reason.toLowerCase()
  if (r.includes("sick") || r.includes("fever") || r.includes("ill") || r.includes("hospital") || r.includes("cold") || r.includes("medical")) return "Sick Leave"
  if (r.includes("vacation") || r.includes("trip") || r.includes("travel") || r.includes("holiday") || r.includes("tour") || r.includes("goa")) return "Vacation Leave"
  if (r.includes("work from home") || r.includes("remote") || r.includes("wfh") || r.includes("internet")) return "Work From Home"
  return "Casual Leave"
}

function getVacationTitle(reason: string, type: string) {
  const r = reason.toLowerCase()
  if (r.includes("goa")) return "Goa Trip"
  if (r.includes("family")) return "Family Vacation"
  if (r.includes("trip") || r.includes("travel") || r.includes("vacation") || r.includes("holiday")) return "Vacation Trip"
  return type
}

const LEAVE_STYLES: Record<string, { bg: string; color: string; border: string }> = {
  "Vacation Leave":  { bg: "#FEF9EC", color: "#D97706", border: "#FDE68A" },
  "Sick Leave":      { bg: "#FFF0F0", color: "#EF4444", border: "#FECACA" },
  "Casual Leave":    { bg: "#EFF6FF", color: "#3B82F6", border: "#BFDBFE" },
  "Work From Home":  { bg: "#F0FDF4", color: "#10B981", border: "#A7F3D0" },
  "Shoot Day":       { bg: "#FEF9EC", color: "#D97706", border: "#FDE68A" },
  "Permission":      { bg: "#F5F3FF", color: "#7C3AED", border: "#DDD6FE" },
  "Half Day Leave":  { bg: "rgba(99,102,241,0.10)", color: "#6366F1", border: "#C7D2FE" },
}

const LEAVE_EMOJIS: Record<string, string> = {
  "Vacation Leave":  "🏖️",
  "Sick Leave":      "🏥",
  "Casual Leave":    "💼",
  "Work From Home":  "🏠",
  "Shoot Day":       "📷",
  "Permission":      "⏰",
  "Half Day Leave":  "🌤️",
}

const AVATAR_COLORS = ["#DE1A1A","#F59E0B","#10B981","#3B82F6","#8B5CF6","#F97316","#EC4899"]
function avatarBg(name: string) {
  let h = 0; for (const c of name) h = (h * 31 + c.charCodeAt(0)) % AVATAR_COLORS.length
  return AVATAR_COLORS[h]
}
function initials(name: string) {
  return name.split(" ").map((n) => n[0]).join("").slice(0, 2).toUpperCase()
}

const BOY_IMGS  = ["/brand/task-assign/boy1.png","/brand/task-assign/boy2.png","/brand/task-assign/boy3.png","/brand/task-assign/boy4.png","/brand/task-assign/boy5.png"]
const GIRL_IMGS = ["/brand/task-assign/girl1.png","/brand/task-assign/girl2.png","/brand/task-assign/girl3.png","/brand/task-assign/girl4.png"]

function getAvatar(name: string, gender: string | undefined, idx: number) {
  const g = gender?.toLowerCase()
  if (g === "female" || g === "f") return GIRL_IMGS[idx % GIRL_IMGS.length]
  if (g === "male"   || g === "m") return BOY_IMGS[idx % BOY_IMGS.length]
  return idx % 2 === 0 ? BOY_IMGS[idx % BOY_IMGS.length] : GIRL_IMGS[idx % GIRL_IMGS.length]
}

// ── Leave Card ─────────────────────────────────────────────────────────────────
function LeaveCard({ leave, idx, isPending, actionId, onApprove, onReject, onSelectMember, onEdit }: {
  leave: Leave; idx: number
  isPending: boolean; actionId: string | null
  onApprove: (id: string) => void; onReject: (id: string) => void
  onSelectMember: (id: string) => void
  onEdit: (leave: Leave) => void
}) {
  const user = Array.isArray(leave.users) ? leave.users[0] : leave.users
  const name = user?.name ?? "Unknown"
  const isPerm       = leave.leave_type === "permission"
  const isHalfDay    = leave.leave_type === "half_day"
  const isExceptional = leave.reason?.startsWith("[EXCEPTIONAL]")
  const displayReason = isExceptional ? leave.reason.replace(/^\[EXCEPTIONAL\]\s*/, "") : leave.reason
  // WFH / Shoot Day are work arrangements, not leave — they have no monthly cap
  // (sumLeaveDays skips them entirely), so the only way one of these becomes
  // Exceptional is via the date-collision bypass, never the 5-day limit.
  // Permission's Exceptional bypass button is also collision-only (the monthly-
  // limit block only gates full_day/half_day). Only those two can genuinely be
  // "monthly limit exceeded" — everything else must say why it's actually flagged.
  const exceptionalReasonText = (leave.leave_type === "full_day" || leave.leave_type === "half_day")
    ? "Monthly limit exceeded — needs special approval"
    : "Conflicts with an existing request on that date — needs special approval"
  const leaveType = isPerm ? "Permission"
    : isHalfDay ? "Half Day Leave"
    : leave.leave_type === "wfh" ? "Work From Home"
    : leave.leave_type === "shoot_day" ? "Shoot Day"
    : getLeaveType(leave.reason)
  const typeStyle = LEAVE_STYLES[leaveType] ?? LEAVE_STYLES["Casual Leave"]
  const isLoading = actionId?.startsWith(leave.id)
  const days = daysBetween(leave.from_date, leave.to_date)

  const statusStyle = {
    pending:  { bg: "#FFFBEB", color: "#D97706", border: "#FDE68A", label: "Pending" },
    approved: { bg: "#F0FDF4", color: "#059669", border: "#A7F3D0", label: "Approved" },
    rejected: { bg: "#FFF5F5", color: "#EF4444", border: "#FECACA", label: "Rejected" },
  }[leave.status] ?? { bg: "#FFFBEB", color: "#D97706", border: "#FDE68A", label: "Pending" }

  return (
    <div style={{
      background: "#FFFFFF", borderRadius: 16, border: "1px solid #F0F1F5",
      padding: "16px", display: "flex", flexDirection: "column", gap: 12,
      boxShadow: "0 1px 8px rgba(0,0,0,0.04)",
    }}>
      {/* Top: avatar + name + status badge — click name/avatar to filter to just this member */}
      <div
        onClick={() => user?.id && onSelectMember(user.id)}
        title={user?.id ? `Show only ${name}'s leaves` : undefined}
        style={{ display: "flex", alignItems: "center", gap: 10, cursor: user?.id ? "pointer" : "default" }}
      >
        <div style={{ width: 42, height: 42, borderRadius: "50%", overflow: "hidden", flexShrink: 0, position: "relative", border: "2px solid #F3F4F6" }}>
          <Image src={getAvatar(name, user?.gender, idx)} alt={name} fill style={{ objectFit: "cover" }} />
        </div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <p style={{ fontSize: 13, fontWeight: 700, color: "#111827", margin: 0, fontFamily: "var(--font-jakarta)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{name}</p>
          <p style={{ fontSize: 11, color: "#37474F", margin: "1px 0 0" }}>{user?.employee_id ?? "—"}</p>
        </div>
        <span style={{
          fontSize: 10, fontWeight: 700, padding: "3px 9px", borderRadius: 20, flexShrink: 0,
          background: statusStyle.bg, color: statusStyle.color, border: `1px solid ${statusStyle.border}`,
        }}>{statusStyle.label}</span>
      </div>

      {/* Divider */}
      <div style={{ height: 1, background: "#F3F4F6" }} />

      {/* Exceptional leave banner */}
      {isExceptional && (
        <div style={{ display: "flex", alignItems: "center", gap: 8, background: "rgba(245,158,11,0.1)", border: "1.5px solid rgba(245,158,11,0.35)", borderRadius: 10, padding: "8px 12px" }}>
          <span style={{ fontSize: 16, flexShrink: 0 }}>⚠️</span>
          <div>
            <p style={{ fontSize: 11, fontWeight: 800, color: "#92400E", margin: 0 }}>Exceptional Leave</p>
            <p style={{ fontSize: 10, color: "#B45309", margin: 0 }}>{exceptionalReasonText}</p>
          </div>
        </div>
      )}

      {/* Leave type + duration */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <span style={{
          fontSize: 11, fontWeight: 600, borderRadius: 8, padding: "3px 10px",
          background: typeStyle.bg, color: typeStyle.color, border: `1px solid ${typeStyle.border}`,
        }}>
          {LEAVE_EMOJIS[leaveType] ?? "📋"} {leaveType}
        </span>
        <span style={{ fontSize: 11, fontWeight: 700, color: "#37474F", background: "#F9FAFB", padding: "3px 10px", borderRadius: 8 }}>
          {isPerm
            ? `${leave.permission_hours ?? 1}h${leave.permission_time && leave.permission_end_time ? ` · ${fmtTimeStr(leave.permission_time)}–${fmtTimeStr(leave.permission_end_time)}` : leave.permission_time ? ` · ${fmtTimeStr(leave.permission_time)}` : ""}`
            : isHalfDay
            ? `Half Day${leave.half_day_period ? ` (${leave.half_day_period})` : ""}${leave.half_day_from_time && leave.half_day_to_time ? ` · ${fmtTimeStr(leave.half_day_from_time)}–${fmtTimeStr(leave.half_day_to_time)}` : ""}`
            : `${days} day${days !== 1 ? "s" : ""}`}
        </span>
      </div>

      {/* Date range */}
      <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
        <CalendarDays size={13} style={{ color: "#37474F", flexShrink: 0 }} />
        <span style={{ fontSize: 12, color: "#37474F", fontWeight: 600 }}>{fmtRange(leave.from_date, leave.to_date)}</span>
      </div>

      {/* Reason */}
      <div style={{ display: "flex", alignItems: "flex-start", gap: 6 }}>
        <Paperclip size={12} style={{ color: "#37474F", flexShrink: 0, marginTop: 2 }} />
        <p style={{
          fontSize: 12, color: "#37474F", margin: 0, lineHeight: 1.45,
          display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical", overflow: "hidden",
        } as React.CSSProperties}>
          {displayReason}
        </p>
      </div>

      {/* Edit — always available regardless of status, so a mistake (wrong leave
          type, wrong time) can be corrected even after approval, not just while
          still pending. */}
      <div style={{ display: "flex", gap: 6, paddingTop: 4, borderTop: "1px solid #F9FAFB" }}>
        <button onClick={() => onEdit(leave)} style={{
          flex: 1, display: "flex", alignItems: "center", justifyContent: "center", gap: 5,
          fontSize: 12, fontWeight: 700, color: "#374151",
          background: "#F6F7FA", border: "1px solid #EBEDF2", borderRadius: 10,
          padding: "8px 0", cursor: "pointer",
        }}>
          <Pencil size={12} /> Edit
        </button>
      </div>

      {/* Actions */}
      {leave.status === "pending" && (
        <div style={{ display: "flex", gap: 6, paddingTop: 4, borderTop: "1px solid #F9FAFB" }}>
          <button onClick={() => onApprove(leave.id)} disabled={isPending} style={{
            flex: 1, display: "flex", alignItems: "center", justifyContent: "center", gap: 5,
            fontSize: 12, fontWeight: 700, color: "#FFFFFF",
            background: "#10B981", border: "none", borderRadius: 10,
            padding: "8px 0", cursor: "pointer",
            boxShadow: "0 2px 8px rgba(16,185,129,0.25)",
          }}>
            {isLoading && actionId === leave.id + "approved"
              ? <Loader2 size={12} style={{ animation: "spin 1s linear infinite" }} />
              : <CheckCircle2 size={13} />}
            Approve
          </button>
          <button onClick={() => onReject(leave.id)} disabled={isPending} style={{
            flex: 1, display: "flex", alignItems: "center", justifyContent: "center", gap: 5,
            fontSize: 12, fontWeight: 700, color: "#FFFFFF",
            background: "#EF4444", border: "none", borderRadius: 10,
            padding: "8px 0", cursor: "pointer",
            boxShadow: "0 2px 8px rgba(239,68,68,0.25)",
          }}>
            {isLoading && actionId === leave.id + "rejected"
              ? <Loader2 size={12} style={{ animation: "spin 1s linear infinite" }} />
              : <XCircle size={13} />}
            Reject
          </button>
        </div>
      )}
    </div>
  )
}

// ── Main ───────────────────────────────────────────────────────────────────────
export default function LeavesClient({
  leaves, mode, upcomingLeaves, availabilityPct,
  availableCount, onLeaveCountToday, awayCountToday, onLeaveToday,
  pendingCount, companyLeaves, members,
}: LeavesClientProps) {
  const router   = useRouter()
  const pathname = usePathname()
  const [isPending, startTransition] = useTransition()

  // Client-side date filter (default All Time so the approval queue never hides
  // pending requests from other months). Month picker + custom range available.
  const [dateMode, setDateMode]     = useState<"all" | "month" | "custom">("all")
  const [filterMonth, setFilterMonth] = useState(() => todayIST().slice(0, 7))
  const [rangeFrom, setRangeFrom]   = useState("")
  const [rangeTo, setRangeTo]       = useState("")
  const shiftMonth = (ym: string, delta: number) => {
    const [y, m] = ym.split("-").map(Number)
    const d = new Date(y, m - 1 + delta, 1)
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`
  }
  const monthLabel = (ym: string) => {
    const [y, m] = ym.split("-").map(Number)
    return new Date(y, m - 1, 1).toLocaleDateString("en-US", { month: "short", year: "numeric" })
  }
  const dateFilteredLeaves = leaves.filter(l => {
    if (dateMode === "all") return true
    if (dateMode === "month") return (l.from_date ?? "").startsWith(filterMonth)
    if (!rangeFrom && !rangeTo) return true
    if (rangeFrom && l.from_date < rangeFrom) return false
    if (rangeTo   && l.from_date > rangeTo)   return false
    return true
  })

  // Member filter — "" = every member. Set by the dropdown below or by clicking
  // a name/avatar on a leave card, so picking one member shows only their dates.
  const [memberFilter, setMemberFilter] = useState<string>("")
  const sortedMembers = [...members].sort((a, b) => a.name.localeCompare(b.name))
  const selectedMember = members.find(m => m.id === memberFilter) ?? null
  const visibleLeaves = memberFilter
    ? dateFilteredLeaves.filter(l => {
        const u = Array.isArray(l.users) ? l.users[0] : l.users
        return u?.id === memberFilter
      })
    : dateFilteredLeaves

  // Header KPI breakdown of whatever's actually on screen right now — reacts to
  // the mode filter (server-scoped into `leaves`), the date filter, and the
  // member filter above.
  const fullDayCount  = visibleLeaves.filter(l => l.leave_type === "full_day").length
  const wfhCount      = visibleLeaves.filter(l => l.leave_type === "wfh").length
  const shootCount    = visibleLeaves.filter(l => l.leave_type === "shoot_day").length
  const halfDayCount  = visibleLeaves.filter(l => l.leave_type === "half_day").length
  const approvedCount = visibleLeaves.filter(l => l.status === "approved").length
  const rejectedCount = visibleLeaves.filter(l => l.status === "rejected").length
  const [actionId, setActionId] = useState<string | null>(null)
  const [actionError, setActionError] = useState<string | null>(null)

  // Apply Team Leave — admin applying leave/permission/WFH/shoot-day directly on a
  // member's behalf, including past dates, auto-approved (no separate pending step,
  // since applying it here IS the approval).
  const [showApplyModal, setShowApplyModal]     = useState(false)
  const [applyUserId, setApplyUserId]           = useState("")
  const [applyLeaveType, setApplyLeaveType]     = useState<"full_day" | "half_day" | "permission" | "wfh" | "shoot_day">("full_day")
  const [applyFromDate, setApplyFromDate]       = useState("")
  const [applyToDate, setApplyToDate]           = useState("")
  const [applyHalfPeriod, setApplyHalfPeriod]   = useState<"morning" | "afternoon">("morning")
  const [applyHalfFrom, setApplyHalfFrom]       = useState("")
  const [applyHalfTo, setApplyHalfTo]           = useState("")
  const [applyPermFrom, setApplyPermFrom]       = useState("")
  const [applyPermTo, setApplyPermTo]           = useState("")
  const [applyReason, setApplyReason]           = useState("")
  const [applyPending, setApplyPending]         = useState(false)
  const [applyError, setApplyError]             = useState<string | null>(null)

  function resetApplyForm() {
    setApplyUserId(""); setApplyLeaveType("full_day"); setApplyFromDate(""); setApplyToDate("")
    setApplyHalfPeriod("morning"); setApplyHalfFrom(""); setApplyHalfTo("")
    setApplyPermFrom(""); setApplyPermTo(""); setApplyReason(""); setApplyError(null)
  }

  async function submitApplyLeave() {
    setApplyError(null)
    if (!applyUserId) { setApplyError("Select an employee."); return }
    if (!applyFromDate) { setApplyError("Select a date."); return }
    if (!applyReason.trim()) { setApplyError("Enter a reason."); return }
    const isSingleDay = applyLeaveType === "half_day" || applyLeaveType === "permission" || applyLeaveType === "shoot_day"
    const toDate = isSingleDay ? applyFromDate : (applyToDate || applyFromDate)
    if (applyLeaveType === "half_day" && (!applyHalfFrom || !applyHalfTo)) { setApplyError("Set half day From/To time."); return }
    if (applyLeaveType === "half_day" && applyHalfFrom && applyHalfTo) {
      const [fh, fm] = applyHalfFrom.split(":").map(Number)
      const [th, tm] = applyHalfTo.split(":").map(Number)
      const diff = (th * 60 + tm) - (fh * 60 + fm)
      if (diff !== HALF_DAY_THRESHOLD_HOURS * 60) { setApplyError(`Half day leave must be exactly ${HALF_DAY_THRESHOLD_HOURS}h.`); return }
    }
    if (applyLeaveType === "permission" && (!applyPermFrom || !applyPermTo)) { setApplyError("Set permission time."); return }

    setApplyPending(true)
    const permHours = applyPermFrom && applyPermTo ? (() => {
      const [fh, fm] = applyPermFrom.split(":").map(Number)
      const [th, tm] = applyPermTo.split(":").map(Number)
      const diff = (th * 60 + tm) - (fh * 60 + fm)
      return diff > 0 ? Math.round((diff / 60) * 10) / 10 : 1
    })() : 1

    const result = await adminApplyLeaveOnBehalf({
      userId: applyUserId,
      leaveType: applyLeaveType,
      fromDate: applyFromDate,
      toDate,
      reason: applyReason.trim(),
      halfDayPeriod: applyHalfPeriod,
      halfDayFromTime: applyHalfFrom,
      halfDayToTime: applyHalfTo,
      permissionTime: applyPermFrom,
      permissionEndTime: applyPermTo,
      permissionHours: permHours,
    })
    setApplyPending(false)
    if (!result.success) { setApplyError(result.error ?? "Failed to apply leave."); return }
    setShowApplyModal(false)
    resetApplyForm()
    router.refresh()
  }

  // Edit Leave — admin correcting an existing request's type/date/time/reason,
  // regardless of its status (pending, approved, even rejected). Same field shape
  // as Apply Team Leave above, just pre-filled from the record being edited instead
  // of blank, and with an explicit override for the monthly-limit check since a
  // correction can occasionally need to bypass it (e.g. reclassifying already
  // shifts day-equivalents around within the same month).
  const [editLeaveFor, setEditLeaveFor]         = useState<Leave | null>(null)
  const [editLeaveType, setEditLeaveType]       = useState<"full_day" | "half_day" | "permission" | "wfh" | "shoot_day">("full_day")
  const [editFromDate, setEditFromDate]         = useState("")
  const [editToDate, setEditToDate]             = useState("")
  const [editHalfPeriod, setEditHalfPeriod]     = useState<"morning" | "afternoon">("morning")
  const [editHalfFrom, setEditHalfFrom]         = useState("")
  const [editHalfTo, setEditHalfTo]             = useState("")
  const [editPermFrom, setEditPermFrom]         = useState("")
  const [editPermTo, setEditPermTo]             = useState("")
  const [editReason, setEditReason]             = useState("")
  const [editOverrideLimit, setEditOverrideLimit] = useState(false)
  const [editPending, setEditPending]           = useState(false)
  const [editError, setEditError]               = useState<string | null>(null)

  function openEditLeave(leave: Leave) {
    setEditLeaveFor(leave)
    setEditLeaveType((leave.leave_type as typeof editLeaveType) ?? "full_day")
    setEditFromDate(leave.from_date)
    setEditToDate(leave.to_date)
    setEditHalfPeriod(leave.half_day_period === "afternoon" ? "afternoon" : "morning")
    setEditHalfFrom(leave.half_day_from_time ?? "")
    setEditHalfTo(leave.half_day_to_time ?? "")
    setEditPermFrom(leave.permission_time ?? "")
    setEditPermTo(leave.permission_end_time ?? "")
    setEditReason(leave.reason ?? "")
    setEditOverrideLimit(false)
    setEditError(null)
  }

  function closeEditLeave() {
    setEditLeaveFor(null)
  }

  async function submitEditLeave() {
    if (!editLeaveFor) return
    setEditError(null)
    if (!editFromDate) { setEditError("Select a date."); return }
    if (!editReason.trim()) { setEditError("Enter a reason."); return }
    const isSingleDay = editLeaveType === "half_day" || editLeaveType === "permission" || editLeaveType === "shoot_day"
    const toDate = isSingleDay ? editFromDate : (editToDate || editFromDate)
    if (editLeaveType === "half_day" && (!editHalfFrom || !editHalfTo)) { setEditError("Set half day From/To time."); return }
    if (editLeaveType === "half_day" && editHalfFrom && editHalfTo) {
      const [fh, fm] = editHalfFrom.split(":").map(Number)
      const [th, tm] = editHalfTo.split(":").map(Number)
      const diff = (th * 60 + tm) - (fh * 60 + fm)
      if (diff !== HALF_DAY_THRESHOLD_HOURS * 60) { setEditError(`Half day leave must be exactly ${HALF_DAY_THRESHOLD_HOURS}h.`); return }
    }
    if (editLeaveType === "permission" && (!editPermFrom || !editPermTo)) { setEditError("Set permission time."); return }

    setEditPending(true)
    const permHours = editPermFrom && editPermTo ? (() => {
      const [fh, fm] = editPermFrom.split(":").map(Number)
      const [th, tm] = editPermTo.split(":").map(Number)
      const diff = (th * 60 + tm) - (fh * 60 + fm)
      return diff > 0 ? Math.round((diff / 60) * 10) / 10 : 1
    })() : 1

    const result = await adminUpdateLeaveRequest({
      leaveId: editLeaveFor.id,
      leaveType: editLeaveType,
      fromDate: editFromDate,
      toDate,
      reason: editReason.trim(),
      halfDayPeriod: editHalfPeriod,
      halfDayFromTime: editHalfFrom,
      halfDayToTime: editHalfTo,
      permissionTime: editPermFrom,
      permissionEndTime: editPermTo,
      permissionHours: permHours,
      isExceptional: editOverrideLimit,
    })
    setEditPending(false)
    if ("error" in result) { setEditError(result.error); return }
    closeEditLeave()
    router.refresh()
  }

  // Holiday management state
  const [holidayDate, setHolidayDate] = useState("")
  const [holidayName, setHolidayName] = useState("")
  const [holidayAdding, setHolidayAdding] = useState(false)
  const [holidayError, setHolidayError] = useState<string | null>(null)
  const [deletingHolidayId, setDeletingHolidayId] = useState<string | null>(null)
  const [editingHolidayId, setEditingHolidayId]   = useState<string | null>(null)
  const [editHolidayDate, setEditHolidayDate]     = useState("")
  const [editHolidayName, setEditHolidayName]     = useState("")
  const [savingHolidayId, setSavingHolidayId]     = useState<string | null>(null)
  const [editHolidayError, setEditHolidayError]   = useState<string | null>(null)

  function startEditHoliday(h: CompanyLeave) {
    setEditingHolidayId(h.id)
    setEditHolidayDate(h.date)
    setEditHolidayName(h.name)
    setEditHolidayError(null)
  }

  async function handleSaveHoliday(id: string) {
    if (!editHolidayDate || !editHolidayName.trim()) { setEditHolidayError("Enter both date and name."); return }
    setSavingHolidayId(id)
    setEditHolidayError(null)
    const res = await updateCompanyLeave(id, editHolidayDate, editHolidayName.trim())
    setSavingHolidayId(null)
    if (res.success) { setEditingHolidayId(null); router.refresh() }
    else setEditHolidayError(res.error ?? "Failed to save")
  }

  async function handleAddHoliday() {
    if (!holidayDate || !holidayName.trim()) { setHolidayError("Enter both date and holiday name."); return }
    setHolidayAdding(true); setHolidayError(null)
    const res = await addCompanyLeave(holidayDate, holidayName.trim())
    setHolidayAdding(false)
    if (res.success) { setHolidayDate(""); setHolidayName(""); router.refresh() }
    else setHolidayError(res.error ?? "Failed to add")
  }

  async function handleDeleteHoliday(id: string) {
    setDeletingHolidayId(id)
    await deleteCompanyLeave(id)
    setDeletingHolidayId(null)
    router.refresh()
  }

  function navigateMode(next: string) {
    const params = new URLSearchParams()
    params.set("mode", next)
    router.push(`${pathname}?${params.toString()}`)
  }
  function handleApprove(id: string) {
    setActionId(id + "approved")
    setActionError(null)
    startTransition(async () => {
      const result = await updateLeaveStatus(id, "approved")
      setActionId(null)
      if (result.success) { router.refresh() } else { setActionError(result.error ?? "Failed to approve") }
    })
  }
  function handleReject(id: string) {
    setActionId(id + "rejected")
    setActionError(null)
    startTransition(async () => {
      const result = await updateLeaveStatus(id, "rejected")
      setActionId(null)
      if (result.success) { router.refresh() } else { setActionError(result.error ?? "Failed to reject") }
    })
  }

  const vacationItems = upcomingLeaves.length > 0 ? upcomingLeaves : []
  const donutColor = availabilityPct >= 80 ? "#10B981" : availabilityPct >= 60 ? "#F59E0B" : "#EF4444"
  const totalTeamCount = availableCount + onLeaveCountToday + awayCountToday
  const availabilityStatus = availabilityPct >= 90
    ? { label: "All Good!", color: "#10B981", bg: "#ECFDF5" }
    : availabilityPct >= 70
    ? { label: "Mostly Available", color: "#F59E0B", bg: "#FEF9EC" }
    : { label: "Needs Attention", color: "#EF4444", bg: "#FEF2F2" }
  const pct = (n: number) => totalTeamCount > 0 ? Math.round((n / totalTeamCount) * 100) : 0

  const gradBg = "linear-gradient(135deg, #DE1A1A 0%, #8B1212 55%, #1A0808 100%)"

  return (
    <div style={{ padding: "24px 24px 40px", background: "#F8F9FB", minHeight: "100vh" }}>

      {/* ── Action error toast ────────────────────────────────────────────── */}
      {actionError && (
        <div onClick={() => setActionError(null)} style={{ position: "fixed", top: 20, right: 20, zIndex: 9999, background: "#FEE2E2", border: "1px solid #FECACA", borderRadius: 12, padding: "12px 18px", fontSize: 13, fontWeight: 600, color: "#B91C1C", cursor: "pointer", boxShadow: "0 4px 16px rgba(0,0,0,0.1)" }}>
          ✕ {actionError}
        </div>
      )}

      {/* ── Header Banner ─────────────────────────────────────────────────── */}
      <div className="flex flex-col sm:grid sm:grid-cols-[1fr_auto] sm:items-center" style={{
        background: gradBg, borderRadius: 22, padding: "22px 20px", marginBottom: 22,
        boxShadow: "0 10px 40px rgba(180,0,0,0.38)", position: "relative", overflow: "hidden", gap: 14,
      }}>
        <div style={{ position: "absolute", top: -50, right: 80, width: 200, height: 200, borderRadius: "50%", background: "rgba(255,255,255,0.06)", pointerEvents: "none" }} />
        <div style={{ position: "absolute", bottom: -40, left: -20, width: 160, height: 160, borderRadius: "50%", background: "rgba(255,255,255,0.04)", pointerEvents: "none" }} />
        {/* Text — relative wrapper so the illustration can pin to its top-right corner with no separate row/gap; right padding reserves the illustration's width so the title/badge wrap onto a new line instead of running under it */}
        <div style={{ position: "relative", zIndex: 1, minWidth: 0, paddingRight: "calc(clamp(64px,9vw,96px) + 14px)" }}>
          <div style={{ display: "inline-flex", alignItems: "center", gap: 6, background: "rgba(255,255,255,0.15)", border: "1px solid rgba(255,255,255,0.22)", borderRadius: 20, padding: "5px 14px", marginBottom: 10 }}>
            <span style={{ fontSize: 13 }}>⭐</span>
            <span style={{ fontSize: 12, fontWeight: 700, color: "#FFF" }}>Leave Management</span>
          </div>
          <h1 style={{ fontSize: 24, fontWeight: 900, color: "#FFFFFF", fontFamily: "var(--font-jakarta)", margin: "0 0 4px" }}>Leave Requests</h1>
          <p style={{ fontSize: 13, color: "rgba(255,255,255,0.72)", margin: 0 }}>Review and manage team leave applications</p>

          {/* Illustration — pinned to the top-right corner of the text block instead of its own centered row, so it stays small and doesn't inflate the banner's height; the white background of the source photo is faded out with a mask so it blends into the banner instead of showing as a hard rectangle */}
          <div style={{
            position: "absolute", top: 0, right: 0, width: "clamp(64px,9vw,96px)", height: "clamp(64px,8.5vw,92px)",
            WebkitMaskImage: "radial-gradient(ellipse at center, black 55%, transparent 100%)",
            maskImage: "radial-gradient(ellipse at center, black 55%, transparent 100%)",
            pointerEvents: "none",
          }}>
            <Image src="/brand/leave/leave-request-hero.png" alt="" fill style={{ objectFit: "contain" }} />
          </div>
        </div>

        {/* 6 KPI boxes in 3×2 grid */}
        <div className="grid grid-cols-3 lg:grid-cols-6 mx-auto sm:mx-0" style={{ gap: 8, position: "relative", zIndex: 1, width: "100%", maxWidth: 420 }}>
          {[
            { label: "Full Day",  value: fullDayCount,  color: "#FCA5A5" },
            { label: "WFH",       value: wfhCount,       color: "#6EE7B7" },
            { label: "Shoot",     value: shootCount,     color: "#93C5FD" },
            { label: "Half Day",  value: halfDayCount,   color: "#FDE68A" },
            { label: "Approved",  value: approvedCount,  color: "#6EE7B7" },
            { label: "Rejected",  value: rejectedCount,  color: "#FCA5A5" },
          ].map(s => (
            <div key={s.label} style={{ textAlign: "center", background: "rgba(255,255,255,0.12)", border: "1px solid rgba(255,255,255,0.2)", borderRadius: 12, padding: "8px 10px" }}>
              <div style={{ fontSize: 20, fontWeight: 900, color: s.color, fontFamily: "var(--font-jakarta)", lineHeight: 1 }}>{s.value}</div>
              <div style={{ fontSize: 9, color: "rgba(255,255,255,0.72)", fontWeight: 600, marginTop: 3, whiteSpace: "nowrap" }}>{s.label}</div>
            </div>
          ))}
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-[1fr_268px] gap-5">

        {/* ── Main Column ─────────────────────────────────────────────────── */}
        <div style={{ minWidth: 0, display: "flex", flexDirection: "column", gap: 14 }}>

          {/* Single filter dropdown + Holidays toggle + date filter */}
          <div style={{ display: "flex", gap: 6, overflowX: "auto", paddingBottom: 2, alignItems: "center", flexWrap: "wrap" }}>
            <div style={{ position: "relative", flexShrink: 0 }}>
              <select
                value={mode === "holidays" ? "pending" : mode}
                onChange={e => navigateMode(e.target.value)}
                aria-label="Filter leaves"
                style={{
                  padding: "8px 30px 8px 14px", borderRadius: 24, fontSize: 12, fontWeight: 700, cursor: "pointer",
                  whiteSpace: "nowrap", outline: "none", border: "none", appearance: "none", WebkitAppearance: "none",
                  background: mode !== "all" && mode !== "holidays" ? gradBg : "#FFFFFF",
                  color: mode !== "all" && mode !== "holidays" ? "#FFFFFF" : "#37474F",
                  boxShadow: mode !== "all" && mode !== "holidays" ? "0 4px 16px rgba(180,0,0,0.35)" : "0 1px 4px rgba(0,0,0,0.06)",
                }}>
                {MODE_OPTIONS.map(o => (
                  <option key={o.value} value={o.value} style={{ background: "#FFFFFF", color: "#37474F" }}>{o.label}</option>
                ))}
              </select>
              <ChevronDown size={14} strokeWidth={2.5}
                style={{
                  position: "absolute", right: 10, top: "50%", transform: "translateY(-50%)", pointerEvents: "none",
                  color: mode !== "all" && mode !== "holidays" ? "#FFFFFF" : "#37474F",
                }} />
            </div>

            <button onClick={() => navigateMode("holidays")} style={{
              padding: "8px 18px", borderRadius: 24, fontSize: 12, fontWeight: 700, cursor: "pointer",
              whiteSpace: "nowrap", border: "none", flexShrink: 0,
              background: mode === "holidays" ? gradBg : "#FFFFFF",
              color: mode === "holidays" ? "#FFFFFF" : "#37474F",
              boxShadow: mode === "holidays" ? "0 4px 16px rgba(180,0,0,0.35)" : "0 1px 4px rgba(0,0,0,0.06)",
            }}>
              🏢 Holidays
            </button>

            {mode !== "holidays" && (
              <>
                <div style={{ position: "relative", flexShrink: 0 }}>
                  <ListFilter size={12} strokeWidth={2.5}
                    style={{ position: "absolute", left: 12, top: "50%", transform: "translateY(-50%)", pointerEvents: "none", color: "#37474F" }} />
                  <select
                    value={dateMode}
                    onChange={e => setDateMode(e.target.value as typeof dateMode)}
                    aria-label="Date filter"
                    style={{
                      padding: "8px 26px 8px 30px", borderRadius: 24, fontSize: 12, fontWeight: 700, cursor: "pointer",
                      whiteSpace: "nowrap", outline: "none", border: "1px solid #EBEDF2", appearance: "none", WebkitAppearance: "none",
                      background: "#FFFFFF", color: "#37474F", boxShadow: "0 1px 4px rgba(0,0,0,0.06)",
                    }}>
                    <option value="all">All Time</option>
                    <option value="month">Monthly</option>
                    <option value="custom">Custom Range</option>
                  </select>
                  <ChevronDown size={13} strokeWidth={2.5}
                    style={{ position: "absolute", right: 9, top: "50%", transform: "translateY(-50%)", pointerEvents: "none", color: "#37474F" }} />
                </div>

                <div style={{ position: "relative", flexShrink: 0 }}>
                  <Users size={12} strokeWidth={2.5}
                    style={{ position: "absolute", left: 12, top: "50%", transform: "translateY(-50%)", pointerEvents: "none", color: memberFilter ? "#FFFFFF" : "#37474F" }} />
                  <select
                    value={memberFilter}
                    onChange={e => setMemberFilter(e.target.value)}
                    aria-label="Filter by member"
                    style={{
                      padding: "8px 26px 8px 30px", borderRadius: 24, fontSize: 12, fontWeight: 700, cursor: "pointer",
                      whiteSpace: "nowrap", outline: "none", border: memberFilter ? "none" : "1px solid #EBEDF2",
                      appearance: "none", WebkitAppearance: "none", maxWidth: 160,
                      background: memberFilter ? gradBg : "#FFFFFF",
                      color: memberFilter ? "#FFFFFF" : "#37474F",
                      boxShadow: memberFilter ? "0 4px 16px rgba(180,0,0,0.35)" : "0 1px 4px rgba(0,0,0,0.06)",
                    }}>
                    <option value="" style={{ background: "#FFFFFF", color: "#37474F" }}>All Members</option>
                    {sortedMembers.map(m => (
                      <option key={m.id} value={m.id} style={{ background: "#FFFFFF", color: "#37474F" }}>{m.name}</option>
                    ))}
                  </select>
                  <ChevronDown size={13} strokeWidth={2.5}
                    style={{ position: "absolute", right: 9, top: "50%", transform: "translateY(-50%)", pointerEvents: "none", color: memberFilter ? "#FFFFFF" : "#37474F" }} />
                </div>
                {selectedMember && (
                  <button onClick={() => setMemberFilter("")} aria-label="Clear member filter" style={{
                    display: "flex", alignItems: "center", gap: 4, padding: "6px 10px", borderRadius: 20, flexShrink: 0,
                    border: "1px solid #EBEDF2", background: "#FFFFFF", fontSize: 11, fontWeight: 700, color: "#37474F", cursor: "pointer",
                  }}>
                    {selectedMember.name.split(" ")[0]} <X size={11} strokeWidth={2.5} />
                  </button>
                )}
                {dateMode === "month" && (
                  <div style={{ display: "flex", alignItems: "center", gap: 2, background: "#FFFFFF", borderRadius: 24, padding: "2px 6px", flexShrink: 0, boxShadow: "0 1px 4px rgba(0,0,0,0.06)" }}>
                    <button onClick={() => setFilterMonth(m => shiftMonth(m, -1))} aria-label="Previous month" style={{ width: 30, height: 30, border: "none", background: "transparent", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", borderRadius: 8 }}><ChevronLeft size={15} color="#37474F" /></button>
                    <span style={{ fontSize: 12, fontWeight: 700, color: "#37474F", minWidth: 82, textAlign: "center", whiteSpace: "nowrap" }}>{monthLabel(filterMonth)}</span>
                    <button onClick={() => setFilterMonth(m => shiftMonth(m, 1))} aria-label="Next month" style={{ width: 30, height: 30, border: "none", background: "transparent", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", borderRadius: 8 }}><ChevronRight size={15} color="#37474F" /></button>
                  </div>
                )}
                {dateMode === "custom" && (
                  <div style={{ display: "flex", alignItems: "center", gap: 6, flexShrink: 0 }}>
                    <input type="date" min="2025-01-01" value={rangeFrom} onChange={e => setRangeFrom(e.target.value)} aria-label="From date"
                      style={{ padding: "7px 10px", borderRadius: 12, background: "#FFFFFF", border: "1px solid #EBEDF2", fontSize: 12, fontWeight: 600, color: "#37474F", outline: "none", minHeight: 38 }} />
                    <span style={{ fontSize: 12, color: "#37474F" }}>–</span>
                    <input type="date" min={rangeFrom || "2025-01-01"} value={rangeTo} onChange={e => setRangeTo(e.target.value)} aria-label="To date"
                      style={{ padding: "7px 10px", borderRadius: 12, background: "#FFFFFF", border: "1px solid #EBEDF2", fontSize: 12, fontWeight: 600, color: "#37474F", outline: "none", minHeight: 38 }} />
                  </div>
                )}
              </>
            )}

            <button onClick={() => setShowApplyModal(true)} style={{
              padding: "8px 18px", borderRadius: 24, fontSize: 12, fontWeight: 700, cursor: "pointer",
              whiteSpace: "nowrap", border: "none", flexShrink: 0, marginLeft: "auto",
              background: "linear-gradient(135deg,#DE1A1A,#991B1B)", color: "#FFFFFF",
              boxShadow: "0 4px 16px rgba(180,0,0,0.3)", display: "flex", alignItems: "center", gap: 6,
            }}>
              <Plus size={13} strokeWidth={2.5} /> Apply Team Leave
            </button>
          </div>

          {/* ── Holidays Tab UI ─────────────────────────────────────────── */}
          {mode === "holidays" && (
            <div style={{ display:"flex", flexDirection:"column", gap:14 }}>
              {/* Add holiday form */}
              <div style={{ background:"#FFFFFF", borderRadius:18, border:"1px solid #EBEDF2", padding:"20px 22px", boxShadow:"0 2px 10px rgba(0,0,0,0.05)" }}>
                <p style={{ fontSize:13, fontWeight:800, color:"#111827", margin:"0 0 14px", fontFamily:"var(--font-jakarta)" }}>Add Company Holiday</p>
                <div style={{ display:"flex", gap:10, flexWrap:"wrap", alignItems:"flex-end" }}>
                  <div style={{ display:"flex", flexDirection:"column", gap:5, flex:"0 0 160px" }}>
                    <label style={{ fontSize:10, fontWeight:700, color:"#37474F", textTransform:"uppercase", letterSpacing:"0.08em" }}>Date</label>
                    <input type="date" min="2025-01-01" max="2099-12-31" value={holidayDate} onChange={e => setHolidayDate(e.target.value)}
                      style={{ fontSize:13, fontWeight:600, color:"#111827", background:"#F9FAFB", border:"1.5px solid #EBEDF2", borderRadius:10, padding:"9px 12px", outline:"none", cursor:"pointer" }} />
                  </div>
                  <div style={{ display:"flex", flexDirection:"column", gap:5, flex:1, minWidth:160 }}>
                    <label style={{ fontSize:10, fontWeight:700, color:"#37474F", textTransform:"uppercase", letterSpacing:"0.08em" }}>Holiday Name</label>
                    <input type="text" value={holidayName} onChange={e => setHolidayName(e.target.value)}
                      placeholder="e.g. Pongal, Diwali…"
                      onKeyDown={e => e.key === "Enter" && handleAddHoliday()}
                      style={{ fontSize:13, fontWeight:600, color:"#111827", background:"#F9FAFB", border:"1.5px solid #EBEDF2", borderRadius:10, padding:"9px 12px", outline:"none" }} />
                  </div>
                  <button onClick={handleAddHoliday} disabled={holidayAdding}
                    style={{ display:"flex", alignItems:"center", gap:6, padding:"10px 20px", borderRadius:10, border:"none", background:"#1E40AF", color:"#FFFFFF", fontSize:12, fontWeight:700, cursor:holidayAdding?"not-allowed":"pointer", opacity:holidayAdding?0.7:1, whiteSpace:"nowrap" }}>
                    {holidayAdding ? <Loader2 size={13} style={{ animation:"spin 1s linear infinite" }} /> : <Plus size={13} />}
                    Add Holiday
                  </button>
                </div>
                {holidayError && (
                  <div style={{ display: "flex", alignItems: "flex-start", gap: 8, background: "#FEF2F2", border: "1px solid #FECACA", borderRadius: 10, padding: "10px 14px", marginTop: 10 }}>
                    <AlertTriangle size={13} color="#EF4444" style={{ flexShrink: 0, marginTop: 1 }} />
                    <span style={{ fontSize: 12, fontWeight: 600, color: "#DC2626", lineHeight: 1.4 }}>{holidayError}</span>
                  </div>
                )}
              </div>

              {/* Holiday list */}
              <div style={{ background:"#FFFFFF", borderRadius:18, border:"1px solid #EBEDF2", overflow:"hidden", boxShadow:"0 2px 10px rgba(0,0,0,0.05)" }}>
                <div style={{ padding:"14px 20px", borderBottom:"1px solid #F0F1F5", display:"flex", alignItems:"center", gap:8 }}>
                  <span style={{ fontSize:16 }}>🏢</span>
                  <span style={{ fontSize:13, fontWeight:800, color:"#111827" }}>Company Holidays ({companyLeaves.length})</span>
                </div>
                {companyLeaves.length === 0 ? (
                  <div style={{ padding:"40px 24px", textAlign:"center" }}>
                    <p style={{ fontSize:14, color:"#37474F", margin:0 }}>No holidays added yet.</p>
                  </div>
                ) : (
                  <div>
                    {companyLeaves.map((h, i) => {
                      const isEditing = editingHolidayId === h.id
                      const d = new Date((isEditing ? editHolidayDate || h.date : h.date) + "T12:00:00")
                      const dayName = new Date(h.date + "T12:00:00").toLocaleDateString("en-IN", { weekday:"long" })
                      const dateFmt = new Date(h.date + "T12:00:00").toLocaleDateString("en-IN", { day:"numeric", month:"long", year:"numeric" })
                      const borderStyle = i < companyLeaves.length - 1 ? "1px solid #F5F6FA" : "none"
                      if (isEditing) {
                        return (
                          <div key={h.id} style={{ padding:"12px 20px", borderBottom: borderStyle, background:"rgba(30,64,175,0.03)" }}>
                            <div style={{ display:"flex", gap:10, alignItems:"center", flexWrap:"wrap" }}>
                              <input type="date" min="2025-01-01" max="2099-12-31" value={editHolidayDate} onChange={e => setEditHolidayDate(e.target.value)}
                                style={{ fontSize:12, fontWeight:600, color:"#111827", background:"#F9FAFB", border:"1.5px solid #BFDBFE", borderRadius:8, padding:"7px 10px", outline:"none", flex:"0 0 148px" }} />
                              <input type="text" value={editHolidayName} onChange={e => setEditHolidayName(e.target.value)}
                                onKeyDown={e => e.key === "Enter" && handleSaveHoliday(h.id)}
                                style={{ fontSize:12, fontWeight:600, color:"#111827", background:"#F9FAFB", border:"1.5px solid #BFDBFE", borderRadius:8, padding:"7px 10px", outline:"none", flex:1, minWidth:100 }} />
                              <button onClick={() => handleSaveHoliday(h.id)} disabled={savingHolidayId === h.id}
                                style={{ padding:"7px 14px", borderRadius:8, background:"#1E40AF", color:"#fff", fontSize:11, fontWeight:700, border:"none", cursor:"pointer", display:"flex", alignItems:"center", gap:5, flexShrink:0 }}>
                                {savingHolidayId === h.id ? <Loader2 size={11} style={{ animation:"spin 1s linear infinite" }} /> : null}
                                Save
                              </button>
                              <button onClick={() => setEditingHolidayId(null)}
                                style={{ width:28, height:28, borderRadius:8, background:"#F3F4F6", border:"none", cursor:"pointer", display:"flex", alignItems:"center", justifyContent:"center", flexShrink:0 }}>
                                <X size={12} style={{ color:"#37474F" }} />
                              </button>
                            </div>
                            {editHolidayError && (
                              <div style={{ display: "flex", alignItems: "flex-start", gap: 8, background: "#FEF2F2", border: "1px solid #FECACA", borderRadius: 10, padding: "8px 12px", marginTop: 6 }}>
                                <AlertTriangle size={12} color="#EF4444" style={{ flexShrink: 0, marginTop: 1 }} />
                                <span style={{ fontSize: 11, fontWeight: 600, color: "#DC2626", lineHeight: 1.4 }}>{editHolidayError}</span>
                              </div>
                            )}
                          </div>
                        )
                      }
                      return (
                        <div key={h.id} style={{ display:"flex", alignItems:"center", gap:12, padding:"12px 20px", borderBottom: borderStyle }}>
                          <div style={{ width:42, height:42, borderRadius:12, background:"rgba(30,64,175,0.08)", display:"flex", flexDirection:"column", alignItems:"center", justifyContent:"center", flexShrink:0 }}>
                            <span style={{ fontSize:14, fontWeight:900, color:"#1E40AF", lineHeight:1 }}>{d.getDate()}</span>
                            <span style={{ fontSize:8, fontWeight:700, color:"#1E40AF", textTransform:"uppercase" }}>{d.toLocaleDateString("en-IN", { month:"short" })}</span>
                          </div>
                          <div style={{ flex:1, minWidth:0 }}>
                            <p style={{ fontSize:13, fontWeight:700, color:"#111827", margin:0 }}>{h.name}</p>
                            <p style={{ fontSize:11, color:"#37474F", margin:"2px 0 0" }}>{dayName} · {dateFmt}</p>
                          </div>
                          <button onClick={() => startEditHoliday(h)}
                            style={{ width:30, height:30, borderRadius:8, background:"rgba(30,64,175,0.08)", border:"none", cursor:"pointer", display:"flex", alignItems:"center", justifyContent:"center", flexShrink:0 }}>
                            <Pencil size={12} style={{ color:"#1E40AF" }} />
                          </button>
                          <button onClick={() => handleDeleteHoliday(h.id)} disabled={deletingHolidayId === h.id}
                            style={{ width:30, height:30, borderRadius:8, background:"rgba(239,68,68,0.08)", border:"none", cursor:"pointer", display:"flex", alignItems:"center", justifyContent:"center", flexShrink:0 }}>
                            {deletingHolidayId === h.id ? <Loader2 size={12} style={{ color:"#EF4444", animation:"spin 1s linear infinite" }} /> : <Trash2 size={12} style={{ color:"#EF4444" }} />}
                          </button>
                        </div>
                      )
                    })}
                  </div>
                )}
              </div>
            </div>
          )}

          {/* On Leave Today strip */}
          {mode !== "holidays" && onLeaveToday.length > 0 && (
            <div style={{
              background: gradBg, borderRadius: 14, padding: "12px 16px",
              display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap",
              boxShadow: "0 4px 16px rgba(180,0,0,0.25)",
            }}>
              <CalendarDays size={14} style={{ color: "#FACC15", flexShrink: 0 }} />
              <p style={{ fontSize: 12, fontWeight: 700, color: "#FFFFFF", margin: 0, whiteSpace: "nowrap" }}>On Leave Today:</p>
              <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                {onLeaveToday.map((m, i) => (
                  <div key={i} style={{ display: "flex", alignItems: "center", gap: 6, background: "rgba(255,255,255,0.15)", borderRadius: 20, padding: "4px 10px 4px 4px", border: "1px solid rgba(255,255,255,0.2)" }}>
                    <div style={{ width: 24, height: 24, borderRadius: "50%", background: AVATAR_COLORS[i % AVATAR_COLORS.length], display: "flex", alignItems: "center", justifyContent: "center" }}>
                      <span style={{ fontSize: 9, fontWeight: 800, color: "#FFF" }}>{initials(m.name)}</span>
                    </div>
                    <span style={{ fontSize: 11, fontWeight: 600, color: "#FFFFFF" }}>{m.name.split(" ")[0]}</span>
                  </div>
                ))}
              </div>
              <span style={{ fontSize: 11, color: "rgba(255,255,255,0.75)", marginLeft: "auto" }}>{availabilityPct}% available</span>
            </div>
          )}

          {/* Leave Cards */}
          {mode !== "holidays" && (visibleLeaves.length === 0 ? (
            <div style={{
              background: "#FFFFFF", borderRadius: 18, padding: "60px 24px", textAlign: "center",
              border: "1px solid #F0F0F5", boxShadow: "0 4px 20px rgba(0,0,0,0.05)",
            }}>
              <div style={{ position: "relative", width: 280, height: 220, margin: "0 auto 20px", maxWidth: "100%" }}>
                <Image src="/brand/leave/vacation-hero.png" alt="" fill style={{ objectFit: "contain" }} />
              </div>
              <p style={{ fontSize: 16, fontWeight: 700, color: "#111827", margin: "0 0 6px", fontFamily: "var(--font-jakarta)" }}>
                {selectedMember ? `No leave requests for ${selectedMember.name}` : "No leave requests match this filter"}
              </p>
              <p style={{ fontSize: 13, color: "#37474F", margin: 0 }}>Your team is fully available today.</p>
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-3.5">
              {visibleLeaves.map((leave, i) => (
                <LeaveCard
                  key={leave.id} leave={leave} idx={i}
                  isPending={isPending} actionId={actionId}
                  onApprove={handleApprove} onReject={handleReject}
                  onSelectMember={setMemberFilter}
                  onEdit={openEditLeave}
                />
              ))}
            </div>
          ))}
        </div>

        {/* ── Right Sidebar ─────────────────────────────────────────────────── */}
        <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>

          {/* Availability */}
          <div style={{
            background: "#FFFFFF", borderRadius: 18, padding: "20px",
            border: "1px solid #F0F0F5", boxShadow: "0 4px 20px rgba(0,0,0,0.05)",
          }}>
            <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 10, marginBottom: 18, flexWrap: "wrap" }}>
              <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                <div style={{ width: 44, height: 44, borderRadius: 14, background: `${donutColor}15`, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                  <Users size={20} style={{ color: donutColor }} />
                </div>
                <div>
                  <p style={{ fontSize: 14, fontWeight: 900, color: "#111827", margin: 0, fontFamily: "var(--font-jakarta)" }}>Team Availability</p>
                  <p style={{ fontSize: 11, color: "#37474F", margin: "2px 0 0" }}>Real-time team status overview</p>
                </div>
              </div>
              <div style={{ textAlign: "right" }}>
                <p style={{ fontSize: 26, fontWeight: 900, color: donutColor, margin: 0, lineHeight: 1, fontFamily: "var(--font-jakarta)" }}>{availabilityPct}%</p>
                <p style={{ fontSize: 11, color: donutColor, fontWeight: 700, margin: "3px 0 0" }}>Available</p>
              </div>
            </div>

            <div style={{ height: 12, background: "#F3F4F6", borderRadius: 99, overflow: "hidden", marginBottom: 14 }}>
              <div style={{ height: "100%", width: `${availabilityPct}%`, background: donutColor, borderRadius: 99, transition: "width 0.6s" }} />
            </div>

            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 18, flexWrap: "wrap", gap: 8 }}>
              <p style={{ fontSize: 13, margin: 0 }}>
                <span style={{ fontWeight: 900, color: donutColor, fontFamily: "var(--font-jakarta)" }}>{availableCount} / {totalTeamCount}</span>
                <span style={{ color: "#37474F", marginLeft: 6 }}>Members Available</span>
              </p>
              <span style={{ display: "inline-flex", alignItems: "center", gap: 6, fontSize: 11, fontWeight: 700, color: availabilityStatus.color, background: availabilityStatus.bg, padding: "5px 12px", borderRadius: 99 }}>
                <span style={{ width: 6, height: 6, borderRadius: "50%", background: availabilityStatus.color }} />
                {availabilityStatus.label}
              </span>
            </div>

            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", position: "relative" }}>
              <div style={{ position: "absolute", left: "33.33%", top: 4, bottom: 4, width: 1, background: "#F0F0F5" }} />
              <div style={{ position: "absolute", left: "66.66%", top: 4, bottom: 4, width: 1, background: "#F0F0F5" }} />
              {[
                { Icon: UserCheck, value: availableCount, label: "Available", color: "#10B981", bg: "rgba(16,185,129,0.1)" },
                { Icon: CalendarDays, value: onLeaveCountToday, label: "On Leave", color: "#D97706", bg: "rgba(217,119,6,0.1)" },
                { Icon: Home, value: awayCountToday, label: "Remote", color: "#6366F1", bg: "rgba(99,102,241,0.1)" },
              ].map(s => (
                <div key={s.label} style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 8, padding: "0 8px" }}>
                  <div style={{ width: 44, height: 44, borderRadius: 12, background: s.bg, display: "flex", alignItems: "center", justifyContent: "center" }}>
                    <s.Icon size={20} style={{ color: s.color }} />
                  </div>
                  <p style={{ fontSize: 20, fontWeight: 900, color: s.color, margin: 0, fontFamily: "var(--font-jakarta)" }}>{s.value}</p>
                  <p style={{ fontSize: 11, fontWeight: 700, color: "#111827", margin: 0, textAlign: "center" }}>{s.label}</p>
                  <p style={{ fontSize: 10, color: "#37474F", margin: 0 }}>{pct(s.value)}%</p>
                </div>
              ))}
            </div>

            {onLeaveToday.length > 0 && (
              <div style={{ marginTop: 18, background: "#FEF9EC", borderRadius: 10, padding: "10px 12px", border: "1px solid #FDE68A" }}>
                <p style={{ fontSize: 11, fontWeight: 700, color: "#D97706", margin: "0 0 6px" }}>{onLeaveToday.length} on leave today</p>
                <div style={{ display: "flex", flexWrap: "wrap", gap: 4 }}>
                  {onLeaveToday.map((m, i) => (
                    <span key={i} style={{ fontSize: 10, color: "#92400E", background: "#FFFFFF", padding: "2px 8px", borderRadius: 20, border: "1px solid #FDE68A" }}>
                      {m.name.split(" ")[0]}
                    </span>
                  ))}
                </div>
              </div>
            )}
          </div>

          {/* Upcoming Leaves */}
          {vacationItems.length > 0 && (
            <div style={{
              background: gradBg, borderRadius: 18, padding: "20px",
              boxShadow: "0 8px 28px rgba(180,0,0,0.3)",
              position: "relative", overflow: "hidden",
            }}>
              <div style={{ position: "absolute", bottom: -20, left: -10, width: 100, height: 100, borderRadius: "50%", background: "rgba(255,255,255,0.05)", pointerEvents: "none" }} />
              <div style={{ position: "relative", zIndex: 1 }}>
                <p style={{ fontSize: 13, fontWeight: 800, color: "#FFFFFF", margin: "0 0 14px", fontFamily: "var(--font-jakarta)" }}>Upcoming Leaves</p>
                <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                  {vacationItems.map((leave, i) => {
                    const u = Array.isArray(leave.users) ? leave.users[0] : leave.users
                    const name = u?.name ?? "Unknown"
                    const type = getLeaveType(leave.reason)
                    const emoji = LEAVE_EMOJIS[type]
                    return (
                      <div key={leave.id} style={{ display: "flex", alignItems: "center", gap: 10, background: "rgba(255,255,255,0.1)", borderRadius: 12, padding: "8px 10px", border: "1px solid rgba(255,255,255,0.15)" }}>
                        <div style={{ width: 34, height: 34, borderRadius: "50%", overflow: "hidden", flexShrink: 0, position: "relative", border: "2px solid rgba(255,255,255,0.3)" }}>
                          <Image src={getAvatar(name, u?.gender, i)} alt={name} fill style={{ objectFit: "cover" }} />
                        </div>
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <p style={{ fontSize: 12, fontWeight: 700, color: "#FFFFFF", margin: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{name}</p>
                          <p style={{ fontSize: 11, color: "rgba(255,255,255,0.65)", margin: "2px 0 0" }}>{fmtShort(leave.from_date)} – {fmtShort(leave.to_date)}</p>
                        </div>
                        <span style={{ fontSize: 20, flexShrink: 0 }}>{emoji}</span>
                      </div>
                    )
                  })}
                </div>
              </div>
            </div>
          )}

        </div>
      </div>

      {/* ── Apply Team Leave modal ──────────────────────────────────────── */}
      {showApplyModal && (
        <div onClick={() => { setShowApplyModal(false); resetApplyForm() }} style={{ position: "fixed", inset: 0, zIndex: 9999, background: "rgba(17,24,39,0.55)", display: "flex", alignItems: "center", justifyContent: "center", padding: 16 }}>
          <div onClick={e => e.stopPropagation()} style={{ background: "#fff", borderRadius: 20, padding: "22px 22px 20px", width: "100%", maxWidth: 440, maxHeight: "92vh", overflowY: "auto", boxShadow: "0 24px 60px rgba(0,0,0,0.3)" }}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 16 }}>
              <div>
                <p style={{ fontSize: 15, fontWeight: 900, color: "#111827", margin: 0, fontFamily: "var(--font-jakarta)" }}>Apply Team Leave</p>
                <p style={{ fontSize: 11, color: "#6B7280", margin: "2px 0 0" }}>Applies as admin — auto-approved immediately, past dates allowed.</p>
              </div>
              <button onClick={() => { setShowApplyModal(false); resetApplyForm() }} style={{ width: 30, height: 30, borderRadius: 8, border: "none", background: "#F3F4F6", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                <X size={15} color="#6B7280" />
              </button>
            </div>

            <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
              <div>
                <label style={{ display: "block", fontSize: 10, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.14em", color: "#374151", marginBottom: 6 }}>Employee *</label>
                <select value={applyUserId} onChange={e => setApplyUserId(e.target.value)}
                  style={{ width: "100%", padding: "10px 12px", borderRadius: 12, border: "1px solid #EBEDF2", background: "#F9FAFB", fontSize: 13, color: "#111827", outline: "none" }}>
                  <option value="">Select employee…</option>
                  {members.map(m => <option key={m.id} value={m.id}>{m.name} ({m.employee_id})</option>)}
                </select>
              </div>

              <div>
                <label style={{ display: "block", fontSize: 10, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.14em", color: "#374151", marginBottom: 8 }}>Leave Type *</label>
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 8 }}>
                  {([
                    { key: "full_day",   label: "Full Day",   emoji: "☀️" },
                    { key: "half_day",   label: "Half Day",   emoji: "🌤️" },
                    { key: "permission", label: "Permission", emoji: "⏰" },
                    { key: "wfh",        label: "WFH",         emoji: "🏠" },
                    { key: "shoot_day",  label: "Shoot Day",  emoji: "📷" },
                  ] as { key: typeof applyLeaveType; label: string; emoji: string }[]).map(({ key, label, emoji }) => (
                    <button key={key} type="button" onClick={() => setApplyLeaveType(key)}
                      style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 4, padding: "10px 0", borderRadius: 12, fontSize: 11, fontWeight: 700, border: "none", cursor: "pointer", ...(applyLeaveType === key ? { background: "#DE1A1A", color: "#fff" } : { background: "#F6F7FA", color: "#6B7280" }) }}>
                      <span style={{ fontSize: 17 }}>{emoji}</span>{label}
                    </button>
                  ))}
                </div>
              </div>

              {(applyLeaveType === "full_day") && (
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
                  <div><label style={{ display: "block", fontSize: 10, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.14em", color: "#374151", marginBottom: 6 }}>From *</label>
                    <input type="date" min="2025-01-01" value={applyFromDate} onChange={e => setApplyFromDate(e.target.value)} style={{ width: "100%", padding: "10px 12px", borderRadius: 12, border: "1px solid #EBEDF2", background: "#F9FAFB", fontSize: 13, color: "#111827", outline: "none", boxSizing: "border-box" }} /></div>
                  <div><label style={{ display: "block", fontSize: 10, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.14em", color: "#374151", marginBottom: 6 }}>To *</label>
                    <input type="date" min={applyFromDate || "2025-01-01"} value={applyToDate} onChange={e => setApplyToDate(e.target.value)} style={{ width: "100%", padding: "10px 12px", borderRadius: 12, border: "1px solid #EBEDF2", background: "#F9FAFB", fontSize: 13, color: "#111827", outline: "none", boxSizing: "border-box" }} /></div>
                </div>
              )}

              {(applyLeaveType === "half_day" || applyLeaveType === "permission" || applyLeaveType === "shoot_day" || applyLeaveType === "wfh") && (
                <div style={applyLeaveType === "wfh" ? { display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 } : {}}>
                  <div><label style={{ display: "block", fontSize: 10, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.14em", color: "#374151", marginBottom: 6 }}>{applyLeaveType === "wfh" ? "From *" : "Date *"}</label>
                    <input type="date" min="2025-01-01" value={applyFromDate} onChange={e => setApplyFromDate(e.target.value)} style={{ width: "100%", padding: "10px 12px", borderRadius: 12, border: "1px solid #EBEDF2", background: "#F9FAFB", fontSize: 13, color: "#111827", outline: "none", boxSizing: "border-box" }} /></div>
                  {applyLeaveType === "wfh" && (
                    <div><label style={{ display: "block", fontSize: 10, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.14em", color: "#374151", marginBottom: 6 }}>To *</label>
                      <input type="date" min={applyFromDate || "2025-01-01"} value={applyToDate} onChange={e => setApplyToDate(e.target.value)} style={{ width: "100%", padding: "10px 12px", borderRadius: 12, border: "1px solid #EBEDF2", background: "#F9FAFB", fontSize: 13, color: "#111827", outline: "none", boxSizing: "border-box" }} /></div>
                  )}
                </div>
              )}

              {applyLeaveType === "half_day" && (
                <>
                  <div>
                    <label style={{ display: "block", fontSize: 10, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.14em", color: "#374151", marginBottom: 8 }}>Period</label>
                    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
                      {(["morning", "afternoon"] as const).map(p => (
                        <button key={p} type="button" onClick={() => setApplyHalfPeriod(p)}
                          style={{ padding: "8px 0", borderRadius: 10, fontSize: 12, fontWeight: 700, border: "none", cursor: "pointer", textTransform: "capitalize", ...(applyHalfPeriod === p ? { background: "#DE1A1A", color: "#fff" } : { background: "#F6F7FA", color: "#6B7280" }) }}>
                          {p}
                        </button>
                      ))}
                    </div>
                  </div>
                  <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
                    <div><label style={{ display: "block", fontSize: 10, color: "#9CA3AF", marginBottom: 5 }}>From</label>
                      <input type="time" value={applyHalfFrom} onChange={e => setApplyHalfFrom(e.target.value)} style={{ width: "100%", padding: "10px 12px", borderRadius: 12, border: "1px solid #EBEDF2", background: "#F9FAFB", fontSize: 13, color: "#111827", outline: "none", boxSizing: "border-box" }} /></div>
                    <div><label style={{ display: "block", fontSize: 10, color: "#9CA3AF", marginBottom: 5 }}>To</label>
                      <input type="time" value={applyHalfTo} onChange={e => setApplyHalfTo(e.target.value)} style={{ width: "100%", padding: "10px 12px", borderRadius: 12, border: "1px solid #EBEDF2", background: "#F9FAFB", fontSize: 13, color: "#111827", outline: "none", boxSizing: "border-box" }} /></div>
                  </div>
                  {applyHalfFrom && applyHalfTo && (() => {
                    const [fh, fm] = applyHalfFrom.split(":").map(Number)
                    const [th, tm] = applyHalfTo.split(":").map(Number)
                    const diff = (th * 60 + tm) - (fh * 60 + fm)
                    if (diff <= 0) return <p style={{ fontSize: 11, color: "#EF4444", margin: "8px 0 0", fontWeight: 600 }}>To time must be after From time</p>
                    const hrs = Math.floor(diff / 60), mins = diff % 60
                    const requiredMins = HALF_DAY_THRESHOLD_HOURS * 60
                    const isValid = diff === requiredMins
                    return (
                      <p style={{ fontSize: 11, color: isValid ? "#6366F1" : "#EF4444", margin: "8px 0 0", fontWeight: 600 }}>
                        Duration: {hrs > 0 ? `${hrs}h ` : ""}{mins > 0 ? `${mins}m` : ""}
                        {!isValid && ` — half day must be exactly ${HALF_DAY_THRESHOLD_HOURS}h`}
                      </p>
                    )
                  })()}
                </>
              )}

              {applyLeaveType === "permission" && (
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
                  <div><label style={{ display: "block", fontSize: 10, color: "#9CA3AF", marginBottom: 5 }}>Leave From</label>
                    <input type="time" value={applyPermFrom} onChange={e => setApplyPermFrom(e.target.value)} style={{ width: "100%", padding: "10px 12px", borderRadius: 12, border: "1px solid #EBEDF2", background: "#F9FAFB", fontSize: 13, color: "#111827", outline: "none", boxSizing: "border-box" }} /></div>
                  <div><label style={{ display: "block", fontSize: 10, color: "#9CA3AF", marginBottom: 5 }}>Return By</label>
                    <input type="time" value={applyPermTo} onChange={e => setApplyPermTo(e.target.value)} style={{ width: "100%", padding: "10px 12px", borderRadius: 12, border: "1px solid #EBEDF2", background: "#F9FAFB", fontSize: 13, color: "#111827", outline: "none", boxSizing: "border-box" }} /></div>
                </div>
              )}

              <div>
                <label style={{ display: "block", fontSize: 10, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.14em", color: "#374151", marginBottom: 6 }}>Reason *</label>
                <textarea value={applyReason} onChange={e => setApplyReason(e.target.value)} rows={2} placeholder="Explain the reason…"
                  style={{ width: "100%", padding: "10px 12px", borderRadius: 12, border: "1px solid #EBEDF2", background: "#F9FAFB", fontSize: 13, color: "#111827", outline: "none", resize: "none", boxSizing: "border-box" }} />
              </div>

              {applyError && (
                <p style={{ fontSize: 12, fontWeight: 600, color: "#DE1A1A", background: "rgba(222,26,26,0.07)", padding: "8px 12px", borderRadius: 10, margin: 0 }}>⚠️ {applyError}</p>
              )}

              <div style={{ display: "flex", gap: 10 }}>
                <button type="button" onClick={() => { setShowApplyModal(false); resetApplyForm() }}
                  style={{ flex: 1, padding: "12px 0", borderRadius: 14, fontSize: 13, fontWeight: 600, background: "#F6F7FA", color: "#6B7280", border: "1px solid #EBEDF2", cursor: "pointer" }}>Cancel</button>
                <button type="button" disabled={applyPending} onClick={submitApplyLeave}
                  style={{ flex: 1, padding: "12px 0", borderRadius: 14, fontSize: 13, fontWeight: 700, background: "linear-gradient(135deg,#DE1A1A,#991B1B)", color: "#fff", border: "none", cursor: "pointer", opacity: applyPending ? 0.7 : 1, display: "flex", alignItems: "center", justifyContent: "center", gap: 6 }}>
                  {applyPending && <Loader2 size={13} className="animate-spin" />} Apply & Approve
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ── Edit Leave modal ─────────────────────────────────────────────── */}
      {editLeaveFor && (
        <div onClick={closeEditLeave} style={{ position: "fixed", inset: 0, zIndex: 9999, background: "rgba(17,24,39,0.55)", display: "flex", alignItems: "center", justifyContent: "center", padding: 16 }}>
          <div onClick={e => e.stopPropagation()} style={{ background: "#fff", borderRadius: 20, padding: "22px 22px 20px", width: "100%", maxWidth: 440, maxHeight: "92vh", overflowY: "auto", boxShadow: "0 24px 60px rgba(0,0,0,0.3)" }}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 16 }}>
              <div>
                <p style={{ fontSize: 15, fontWeight: 900, color: "#111827", margin: 0, fontFamily: "var(--font-jakarta)" }}>Edit Leave</p>
                <p style={{ fontSize: 11, color: "#6B7280", margin: "2px 0 0" }}>
                  {(Array.isArray(editLeaveFor.users) ? editLeaveFor.users[0] : editLeaveFor.users)?.name ?? "Unknown"} — corrects the record regardless of its current status.
                </p>
              </div>
              <button onClick={closeEditLeave} style={{ width: 30, height: 30, borderRadius: 8, border: "none", background: "#F3F4F6", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                <X size={15} color="#6B7280" />
              </button>
            </div>

            <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
              <div>
                <label style={{ display: "block", fontSize: 10, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.14em", color: "#374151", marginBottom: 8 }}>Leave Type *</label>
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 8 }}>
                  {([
                    { key: "full_day",   label: "Full Day",   emoji: "☀️" },
                    { key: "half_day",   label: "Half Day",   emoji: "🌤️" },
                    { key: "permission", label: "Permission", emoji: "⏰" },
                    { key: "wfh",        label: "WFH",         emoji: "🏠" },
                    { key: "shoot_day",  label: "Shoot Day",  emoji: "📷" },
                  ] as { key: typeof editLeaveType; label: string; emoji: string }[]).map(({ key, label, emoji }) => (
                    <button key={key} type="button" onClick={() => setEditLeaveType(key)}
                      style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 4, padding: "10px 0", borderRadius: 12, fontSize: 11, fontWeight: 700, border: "none", cursor: "pointer", ...(editLeaveType === key ? { background: "#DE1A1A", color: "#fff" } : { background: "#F6F7FA", color: "#6B7280" }) }}>
                      <span style={{ fontSize: 17 }}>{emoji}</span>{label}
                    </button>
                  ))}
                </div>
              </div>

              {(editLeaveType === "full_day") && (
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
                  <div><label style={{ display: "block", fontSize: 10, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.14em", color: "#374151", marginBottom: 6 }}>From *</label>
                    <input type="date" min="2025-01-01" value={editFromDate} onChange={e => setEditFromDate(e.target.value)} style={{ width: "100%", padding: "10px 12px", borderRadius: 12, border: "1px solid #EBEDF2", background: "#F9FAFB", fontSize: 13, color: "#111827", outline: "none", boxSizing: "border-box" }} /></div>
                  <div><label style={{ display: "block", fontSize: 10, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.14em", color: "#374151", marginBottom: 6 }}>To *</label>
                    <input type="date" min={editFromDate || "2025-01-01"} value={editToDate} onChange={e => setEditToDate(e.target.value)} style={{ width: "100%", padding: "10px 12px", borderRadius: 12, border: "1px solid #EBEDF2", background: "#F9FAFB", fontSize: 13, color: "#111827", outline: "none", boxSizing: "border-box" }} /></div>
                </div>
              )}

              {(editLeaveType === "half_day" || editLeaveType === "permission" || editLeaveType === "shoot_day" || editLeaveType === "wfh") && (
                <div style={editLeaveType === "wfh" ? { display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 } : {}}>
                  <div><label style={{ display: "block", fontSize: 10, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.14em", color: "#374151", marginBottom: 6 }}>{editLeaveType === "wfh" ? "From *" : "Date *"}</label>
                    <input type="date" min="2025-01-01" value={editFromDate} onChange={e => setEditFromDate(e.target.value)} style={{ width: "100%", padding: "10px 12px", borderRadius: 12, border: "1px solid #EBEDF2", background: "#F9FAFB", fontSize: 13, color: "#111827", outline: "none", boxSizing: "border-box" }} /></div>
                  {editLeaveType === "wfh" && (
                    <div><label style={{ display: "block", fontSize: 10, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.14em", color: "#374151", marginBottom: 6 }}>To *</label>
                      <input type="date" min={editFromDate || "2025-01-01"} value={editToDate} onChange={e => setEditToDate(e.target.value)} style={{ width: "100%", padding: "10px 12px", borderRadius: 12, border: "1px solid #EBEDF2", background: "#F9FAFB", fontSize: 13, color: "#111827", outline: "none", boxSizing: "border-box" }} /></div>
                  )}
                </div>
              )}

              {editLeaveType === "half_day" && (
                <>
                  <div>
                    <label style={{ display: "block", fontSize: 10, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.14em", color: "#374151", marginBottom: 8 }}>Period</label>
                    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
                      {(["morning", "afternoon"] as const).map(p => (
                        <button key={p} type="button" onClick={() => setEditHalfPeriod(p)}
                          style={{ padding: "8px 0", borderRadius: 10, fontSize: 12, fontWeight: 700, border: "none", cursor: "pointer", textTransform: "capitalize", ...(editHalfPeriod === p ? { background: "#DE1A1A", color: "#fff" } : { background: "#F6F7FA", color: "#6B7280" }) }}>
                          {p}
                        </button>
                      ))}
                    </div>
                  </div>
                  <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
                    <div><label style={{ display: "block", fontSize: 10, color: "#9CA3AF", marginBottom: 5 }}>From</label>
                      <input type="time" value={editHalfFrom} onChange={e => setEditHalfFrom(e.target.value)} style={{ width: "100%", padding: "10px 12px", borderRadius: 12, border: "1px solid #EBEDF2", background: "#F9FAFB", fontSize: 13, color: "#111827", outline: "none", boxSizing: "border-box" }} /></div>
                    <div><label style={{ display: "block", fontSize: 10, color: "#9CA3AF", marginBottom: 5 }}>To</label>
                      <input type="time" value={editHalfTo} onChange={e => setEditHalfTo(e.target.value)} style={{ width: "100%", padding: "10px 12px", borderRadius: 12, border: "1px solid #EBEDF2", background: "#F9FAFB", fontSize: 13, color: "#111827", outline: "none", boxSizing: "border-box" }} /></div>
                  </div>
                  {editHalfFrom && editHalfTo && (() => {
                    const [fh, fm] = editHalfFrom.split(":").map(Number)
                    const [th, tm] = editHalfTo.split(":").map(Number)
                    const diff = (th * 60 + tm) - (fh * 60 + fm)
                    if (diff <= 0) return <p style={{ fontSize: 11, color: "#EF4444", margin: "8px 0 0", fontWeight: 600 }}>To time must be after From time</p>
                    const hrs = Math.floor(diff / 60), mins = diff % 60
                    const requiredMins = HALF_DAY_THRESHOLD_HOURS * 60
                    const isValid = diff === requiredMins
                    return (
                      <p style={{ fontSize: 11, color: isValid ? "#6366F1" : "#EF4444", margin: "8px 0 0", fontWeight: 600 }}>
                        Duration: {hrs > 0 ? `${hrs}h ` : ""}{mins > 0 ? `${mins}m` : ""}
                        {!isValid && ` — half day must be exactly ${HALF_DAY_THRESHOLD_HOURS}h`}
                      </p>
                    )
                  })()}
                </>
              )}

              {editLeaveType === "permission" && (
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
                  <div><label style={{ display: "block", fontSize: 10, color: "#9CA3AF", marginBottom: 5 }}>Leave From</label>
                    <input type="time" value={editPermFrom} onChange={e => setEditPermFrom(e.target.value)} style={{ width: "100%", padding: "10px 12px", borderRadius: 12, border: "1px solid #EBEDF2", background: "#F9FAFB", fontSize: 13, color: "#111827", outline: "none", boxSizing: "border-box" }} /></div>
                  <div><label style={{ display: "block", fontSize: 10, color: "#9CA3AF", marginBottom: 5 }}>Return By</label>
                    <input type="time" value={editPermTo} onChange={e => setEditPermTo(e.target.value)} style={{ width: "100%", padding: "10px 12px", borderRadius: 12, border: "1px solid #EBEDF2", background: "#F9FAFB", fontSize: 13, color: "#111827", outline: "none", boxSizing: "border-box" }} /></div>
                </div>
              )}

              <div>
                <label style={{ display: "block", fontSize: 10, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.14em", color: "#374151", marginBottom: 6 }}>Reason *</label>
                <textarea value={editReason} onChange={e => setEditReason(e.target.value)} rows={2} placeholder="Explain the reason…"
                  style={{ width: "100%", padding: "10px 12px", borderRadius: 12, border: "1px solid #EBEDF2", background: "#F9FAFB", fontSize: 13, color: "#111827", outline: "none", resize: "none", boxSizing: "border-box" }} />
              </div>

              {(editLeaveType === "full_day" || editLeaveType === "half_day") && (
                <label style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 12, color: "#6B7280", cursor: "pointer" }}>
                  <input type="checkbox" checked={editOverrideLimit} onChange={e => setEditOverrideLimit(e.target.checked)} />
                  Override monthly limit / date-overlap check
                </label>
              )}

              {editError && (
                <p style={{ fontSize: 12, fontWeight: 600, color: "#DE1A1A", background: "rgba(222,26,26,0.07)", padding: "8px 12px", borderRadius: 10, margin: 0 }}>⚠️ {editError}</p>
              )}

              <div style={{ display: "flex", gap: 10 }}>
                <button type="button" onClick={closeEditLeave}
                  style={{ flex: 1, padding: "12px 0", borderRadius: 14, fontSize: 13, fontWeight: 600, background: "#F6F7FA", color: "#6B7280", border: "1px solid #EBEDF2", cursor: "pointer" }}>Cancel</button>
                <button type="button" disabled={editPending} onClick={submitEditLeave}
                  style={{ flex: 1, padding: "12px 0", borderRadius: 14, fontSize: 13, fontWeight: 700, background: "linear-gradient(135deg,#DE1A1A,#991B1B)", color: "#fff", border: "none", cursor: "pointer", opacity: editPending ? 0.7 : 1, display: "flex", alignItems: "center", justifyContent: "center", gap: 6 }}>
                  {editPending && <Loader2 size={13} className="animate-spin" />} Save Changes
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
