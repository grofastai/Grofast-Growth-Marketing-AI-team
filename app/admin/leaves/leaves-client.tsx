"use client"

import Image from "next/image"
import { useRouter, usePathname } from "next/navigation"
import { useState, useTransition } from "react"
import { CheckCircle2, XCircle, Loader2, CalendarDays, Clock, Users, XOctagon, Paperclip, Plus, Trash2, Pencil, X } from "lucide-react"
import { updateLeaveStatus } from "@/lib/actions/leaves"
import { addCompanyLeave, updateCompanyLeave, deleteCompanyLeave } from "@/lib/actions/company-leaves"

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
  users: { id: string; name: string; employee_id: string; phone: string | null; gender?: string } | null
}

interface CompanyLeave {
  id: string
  date: string
  name: string
}

interface LeavesClientProps {
  leaves: Leave[]
  statusFilter: string
  upcomingLeaves: Leave[]
  availabilityPct: number
  onLeaveToday: { name: string }[]
  pendingCount: number
  approvedCount: number
  rejectedCount: number
  companyLeaves: CompanyLeave[]
  fullDayCount: number
  wfhCount: number
  shootCount: number
  halfDayCount: number
}

// ── Helpers ────────────────────────────────────────────────────────────────────

const STATUS_TABS = [
  { key: "pending",  label: "Pending",  color: "#F59E0B" },
  { key: "approved", label: "Approved", color: "#10B981" },
  { key: "rejected", label: "Rejected", color: "#EF4444" },
  { key: "all",      label: "All",      color: "#6B7280" },
  { key: "holidays", label: "🏢 Holidays", color: "#1E40AF" },
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

// ── Donut Chart (text inside SVG for perfect centering) ────────────────────────
function AvailabilityDonut({ pct, size = 160 }: { pct: number; size?: number }) {
  const cx = size / 2, cy = size / 2
  const r = size * 0.34
  const circ = 2 * Math.PI * r
  const sw = size * 0.1
  const onTrack = (pct / 100) * circ
  const offTrack = circ - onTrack

  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
      <defs>
        <linearGradient id="availGrad" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stopColor="#FF6B6B" />
          <stop offset="100%" stopColor="#FACC15" />
        </linearGradient>
      </defs>
      <circle cx={cx} cy={cy} r={r} fill="none" stroke="rgba(255,255,255,0.15)" strokeWidth={sw} />
      <circle cx={cx} cy={cy} r={r} fill="none" stroke="url(#availGrad)" strokeWidth={sw}
        strokeDasharray={`${onTrack} ${offTrack}`} strokeLinecap="round"
        transform={`rotate(-90 ${cx} ${cy})`}
        style={{ transition: "stroke-dasharray 0.6s", filter: "drop-shadow(0 2px 8px rgba(255,100,100,0.5))" }} />
      <text x={cx} y={cy - size * 0.08} textAnchor="middle" dominantBaseline="middle"
        fontSize={size * 0.2} fontWeight="900" fill="#FFFFFF">{pct}%</text>
      <text x={cx} y={cy + size * 0.08} textAnchor="middle" dominantBaseline="middle"
        fontSize={size * 0.075} fill="rgba(255,255,255,0.7)">Team</text>
      <text x={cx} y={cy + size * 0.19} textAnchor="middle" dominantBaseline="middle"
        fontSize={size * 0.075} fill="rgba(255,255,255,0.7)">Available</text>
    </svg>
  )
}

// ── Leave Card ─────────────────────────────────────────────────────────────────
function LeaveCard({ leave, idx, isPending, actionId, onApprove, onReject }: {
  leave: Leave; idx: number
  isPending: boolean; actionId: string | null
  onApprove: (id: string) => void; onReject: (id: string) => void
}) {
  const user = Array.isArray(leave.users) ? leave.users[0] : leave.users
  const name = user?.name ?? "Unknown"
  const isPerm       = leave.leave_type === "permission"
  const isHalfDay    = leave.leave_type === "half_day"
  const isExceptional = leave.reason?.startsWith("[EXCEPTIONAL]")
  const displayReason = isExceptional ? leave.reason.replace(/^\[EXCEPTIONAL\]\s*/, "") : leave.reason
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
      {/* Top: avatar + name + status badge */}
      <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
        <div style={{ width: 42, height: 42, borderRadius: "50%", overflow: "hidden", flexShrink: 0, position: "relative", border: "2px solid #F3F4F6" }}>
          <Image src={getAvatar(name, user?.gender, idx)} alt={name} fill style={{ objectFit: "cover" }} />
        </div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <p style={{ fontSize: 13, fontWeight: 700, color: "#111827", margin: 0, fontFamily: "var(--font-jakarta)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{name}</p>
          <p style={{ fontSize: 11, color: "#9CA3AF", margin: "1px 0 0" }}>{user?.employee_id ?? "—"}</p>
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
            <p style={{ fontSize: 10, color: "#B45309", margin: 0 }}>Monthly limit exceeded — needs special approval</p>
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
        <span style={{ fontSize: 11, fontWeight: 700, color: "#374151", background: "#F9FAFB", padding: "3px 10px", borderRadius: 8 }}>
          {isPerm ? `${leave.permission_hours ?? 1}h${leave.permission_time ? ` · ${leave.permission_time}` : ""}` : isHalfDay ? "Half Day" : `${days} day${days !== 1 ? "s" : ""}`}
        </span>
      </div>

      {/* Date range */}
      <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
        <CalendarDays size={13} style={{ color: "#9CA3AF", flexShrink: 0 }} />
        <span style={{ fontSize: 12, color: "#374151", fontWeight: 500 }}>{fmtRange(leave.from_date, leave.to_date)}</span>
      </div>

      {/* Reason */}
      <div style={{ display: "flex", alignItems: "flex-start", gap: 6 }}>
        <Paperclip size={12} style={{ color: "#9CA3AF", flexShrink: 0, marginTop: 2 }} />
        <p style={{
          fontSize: 12, color: "#6B7280", margin: 0, lineHeight: 1.45,
          display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical", overflow: "hidden",
        } as React.CSSProperties}>
          {displayReason}
        </p>
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
  leaves, statusFilter, upcomingLeaves, availabilityPct, onLeaveToday,
  pendingCount, approvedCount, rejectedCount, companyLeaves,
  fullDayCount, wfhCount, shootCount, halfDayCount,
}: LeavesClientProps) {
  const router   = useRouter()
  const pathname = usePathname()
  const [isPending, startTransition] = useTransition()
  const [actionId, setActionId] = useState<string | null>(null)
  const [actionError, setActionError] = useState<string | null>(null)

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

  function navigate(s: string) { router.push(`${pathname}?status=${s}`) }
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
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between" style={{
        background: gradBg, borderRadius: 22, padding: "20px 20px", marginBottom: 22,
        boxShadow: "0 10px 40px rgba(180,0,0,0.38)", position: "relative", overflow: "hidden", gap: 16,
      }}>
        <div style={{ position: "absolute", top: -50, right: 80, width: 200, height: 200, borderRadius: "50%", background: "rgba(255,255,255,0.06)", pointerEvents: "none" }} />
        <div style={{ position: "absolute", bottom: -40, left: -20, width: 160, height: 160, borderRadius: "50%", background: "rgba(255,255,255,0.04)", pointerEvents: "none" }} />
        <div style={{ position: "relative", zIndex: 1 }}>
          <div style={{ display: "inline-flex", alignItems: "center", gap: 6, background: "rgba(255,255,255,0.15)", border: "1px solid rgba(255,255,255,0.22)", borderRadius: 20, padding: "5px 14px", marginBottom: 10 }}>
            <span style={{ fontSize: 13 }}>⭐</span>
            <span style={{ fontSize: 12, fontWeight: 700, color: "#FFF" }}>Leave Management</span>
          </div>
          <h1 style={{ fontSize: 24, fontWeight: 900, color: "#FFFFFF", fontFamily: "var(--font-jakarta)", margin: "0 0 4px" }}>Leave Requests</h1>
          <p style={{ fontSize: 13, color: "rgba(255,255,255,0.72)", margin: 0 }}>Review and manage team leave applications</p>
        </div>
        {/* 6 KPI boxes in 3×2 grid */}
        <div className="grid grid-cols-3 lg:grid-cols-6 w-fit mx-auto lg:mx-0" style={{ gap: 8, position: "relative", zIndex: 1 }}>
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

          {/* Status tabs */}
          <div style={{ display: "flex", gap: 6, overflowX: "auto", paddingBottom: 2 }}>
            {STATUS_TABS.map((tab) => {
              const active = statusFilter === tab.key
              return (
                <button key={tab.key} onClick={() => navigate(tab.key)} style={{
                  padding: "8px 22px", borderRadius: 24, fontSize: 12, fontWeight: 700, cursor: "pointer",
                  whiteSpace: "nowrap", transition: "all 0.15s", border: "none",
                  background: active ? gradBg : "#FFFFFF",
                  color: active ? "#FFFFFF" : "#6B7280",
                  boxShadow: active ? "0 4px 16px rgba(180,0,0,0.35)" : "0 1px 4px rgba(0,0,0,0.06)",
                }}>
                  {tab.label}
                </button>
              )
            })}
          </div>

          {/* ── Holidays Tab UI ─────────────────────────────────────────── */}
          {statusFilter === "holidays" && (
            <div style={{ display:"flex", flexDirection:"column", gap:14 }}>
              {/* Add holiday form */}
              <div style={{ background:"#FFFFFF", borderRadius:18, border:"1px solid #EBEDF2", padding:"20px 22px", boxShadow:"0 2px 10px rgba(0,0,0,0.05)" }}>
                <p style={{ fontSize:13, fontWeight:800, color:"#111827", margin:"0 0 14px", fontFamily:"var(--font-jakarta)" }}>Add Company Holiday</p>
                <div style={{ display:"flex", gap:10, flexWrap:"wrap", alignItems:"flex-end" }}>
                  <div style={{ display:"flex", flexDirection:"column", gap:5, flex:"0 0 160px" }}>
                    <label style={{ fontSize:10, fontWeight:700, color:"#9CA3AF", textTransform:"uppercase", letterSpacing:"0.08em" }}>Date</label>
                    <input type="date" value={holidayDate} onChange={e => setHolidayDate(e.target.value)}
                      style={{ fontSize:13, fontWeight:600, color:"#111827", background:"#F9FAFB", border:"1.5px solid #EBEDF2", borderRadius:10, padding:"9px 12px", outline:"none", cursor:"pointer" }} />
                  </div>
                  <div style={{ display:"flex", flexDirection:"column", gap:5, flex:1, minWidth:160 }}>
                    <label style={{ fontSize:10, fontWeight:700, color:"#9CA3AF", textTransform:"uppercase", letterSpacing:"0.08em" }}>Holiday Name</label>
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
                {holidayError && <p style={{ fontSize:12, color:"#EF4444", fontWeight:600, margin:"10px 0 0" }}>{holidayError}</p>}
              </div>

              {/* Holiday list */}
              <div style={{ background:"#FFFFFF", borderRadius:18, border:"1px solid #EBEDF2", overflow:"hidden", boxShadow:"0 2px 10px rgba(0,0,0,0.05)" }}>
                <div style={{ padding:"14px 20px", borderBottom:"1px solid #F0F1F5", display:"flex", alignItems:"center", gap:8 }}>
                  <span style={{ fontSize:16 }}>🏢</span>
                  <span style={{ fontSize:13, fontWeight:800, color:"#111827" }}>Company Holidays ({companyLeaves.length})</span>
                </div>
                {companyLeaves.length === 0 ? (
                  <div style={{ padding:"40px 24px", textAlign:"center" }}>
                    <p style={{ fontSize:14, color:"#9CA3AF", margin:0 }}>No holidays added yet.</p>
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
                              <input type="date" value={editHolidayDate} onChange={e => setEditHolidayDate(e.target.value)}
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
                                <X size={12} style={{ color:"#6B7280" }} />
                              </button>
                            </div>
                            {editHolidayError && <p style={{ fontSize:11, color:"#EF4444", fontWeight:600, margin:"6px 0 0" }}>{editHolidayError}</p>}
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
                            <p style={{ fontSize:11, color:"#9CA3AF", margin:"2px 0 0" }}>{dayName} · {dateFmt}</p>
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
          {statusFilter !== "holidays" && onLeaveToday.length > 0 && (
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
          {statusFilter !== "holidays" && (leaves.length === 0 ? (
            <div style={{
              background: gradBg, borderRadius: 18, padding: "60px 24px", textAlign: "center",
              position: "relative", overflow: "hidden", boxShadow: "0 8px 32px rgba(180,0,0,0.3)",
            }}>
              <div style={{ position: "absolute", top: -30, right: -20, width: 150, height: 150, borderRadius: "50%", background: "rgba(255,255,255,0.06)", pointerEvents: "none" }} />
              <div style={{ position: "relative", width: 200, height: 160, margin: "0 auto 20px" }}>
                <Image src="/brand/leave/vacation-hero.png" alt="" fill style={{ objectFit: "contain" }} />
              </div>
              <p style={{ fontSize: 16, fontWeight: 700, color: "#FFFFFF", margin: "0 0 6px", fontFamily: "var(--font-jakarta)" }}>
                No {statusFilter === "all" ? "" : statusFilter} leave requests
              </p>
              <p style={{ fontSize: 13, color: "rgba(255,255,255,0.7)", margin: 0 }}>Your team is fully available today.</p>
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-3.5">
              {leaves.map((leave, i) => (
                <LeaveCard
                  key={leave.id} leave={leave} idx={i}
                  isPending={isPending} actionId={actionId}
                  onApprove={handleApprove} onReject={handleReject}
                />
              ))}
            </div>
          ))}
        </div>

        {/* ── Right Sidebar ─────────────────────────────────────────────────── */}
        <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>

          {/* Availability */}
          <div style={{
            background: gradBg, borderRadius: 18, padding: "20px",
            boxShadow: "0 8px 28px rgba(180,0,0,0.35)",
            position: "relative", overflow: "hidden",
          }}>
            <div style={{ position: "absolute", top: -30, right: -20, width: 130, height: 130, borderRadius: "50%", background: "rgba(255,255,255,0.06)", pointerEvents: "none" }} />
            <div style={{ position: "relative", zIndex: 1 }}>
              <p style={{ fontSize: 13, fontWeight: 800, color: "#FFFFFF", margin: "0 0 16px", fontFamily: "var(--font-jakarta)" }}>Team Availability</p>
              <div style={{ display: "flex", justifyContent: "center", marginBottom: 16 }}>
                <AvailabilityDonut pct={availabilityPct} size={160} />
              </div>
              {onLeaveToday.length > 0 && (
                <div style={{ background: "rgba(255,255,255,0.12)", borderRadius: 10, padding: "10px 12px", border: "1px solid rgba(255,255,255,0.18)" }}>
                  <p style={{ fontSize: 11, fontWeight: 700, color: "#FACC15", margin: "0 0 6px" }}>{onLeaveToday.length} on leave today</p>
                  <div style={{ display: "flex", flexWrap: "wrap", gap: 4 }}>
                    {onLeaveToday.map((m, i) => (
                      <span key={i} style={{ fontSize: 10, color: "#FFFFFF", background: "rgba(255,255,255,0.15)", padding: "2px 8px", borderRadius: 20, border: "1px solid rgba(255,255,255,0.2)" }}>
                        {m.name.split(" ")[0]}
                      </span>
                    ))}
                  </div>
                </div>
              )}
            </div>
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
    </div>
  )
}
