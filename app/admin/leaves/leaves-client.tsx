"use client"

import Image from "next/image"
import { useRouter, usePathname } from "next/navigation"
import { useState, useTransition } from "react"
import { CheckCircle2, XCircle, Loader2, CalendarDays, Clock, Users, XOctagon, Paperclip } from "lucide-react"
import { updateLeaveStatus } from "@/lib/actions/leaves"

interface Leave {
  id: string
  from_date: string
  to_date: string
  reason: string
  status: string
  created_at: string
  users: { id: string; name: string; employee_id: string; phone: string | null; gender?: string } | null
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
}

// ── Helpers ────────────────────────────────────────────────────────────────────

const STATUS_TABS = [
  { key: "pending",  label: "Pending",  color: "#F59E0B" },
  { key: "approved", label: "Approved", color: "#10B981" },
  { key: "rejected", label: "Rejected", color: "#EF4444" },
  { key: "all",      label: "All",      color: "#6B7280" },
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
  "Vacation Leave": { bg: "#FEF9EC", color: "#D97706", border: "#FDE68A" },
  "Sick Leave":     { bg: "#FFF0F0", color: "#EF4444", border: "#FECACA" },
  "Casual Leave":   { bg: "#EFF6FF", color: "#3B82F6", border: "#BFDBFE" },
  "Work From Home": { bg: "#F0FDF4", color: "#10B981", border: "#A7F3D0" },
}

const LEAVE_EMOJIS: Record<string, string> = {
  "Vacation Leave": "🏖️",
  "Sick Leave":     "🏥",
  "Casual Leave":   "💼",
  "Work From Home": "🏠",
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
  const color = pct >= 80 ? "#10B981" : pct >= 60 ? "#F59E0B" : "#EF4444"

  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
      {/* Track */}
      <circle cx={cx} cy={cy} r={r} fill="none" stroke="#F3F4F6" strokeWidth={sw} />
      {/* Fill */}
      <circle cx={cx} cy={cy} r={r} fill="none" stroke={color} strokeWidth={sw}
        strokeDasharray={`${onTrack} ${offTrack}`} strokeLinecap="round"
        transform={`rotate(-90 ${cx} ${cy})`} style={{ transition: "stroke-dasharray 0.6s" }} />
      {/* Percentage */}
      <text x={cx} y={cy - size * 0.04} textAnchor="middle" dominantBaseline="middle"
        fontSize={size * 0.2} fontWeight="900" fill="#111827">{pct}%</text>
      {/* Label */}
      <text x={cx} y={cy + size * 0.15} textAnchor="middle" dominantBaseline="middle"
        fontSize={size * 0.09} fill="#9CA3AF">Team Available</text>
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
  const leaveType = getLeaveType(leave.reason)
  const typeStyle = LEAVE_STYLES[leaveType]
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

      {/* Leave type + days */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <span style={{
          fontSize: 11, fontWeight: 600, borderRadius: 8, padding: "3px 10px",
          background: typeStyle.bg, color: typeStyle.color, border: `1px solid ${typeStyle.border}`,
        }}>
          {LEAVE_EMOJIS[leaveType]} {leaveType}
        </span>
        <span style={{ fontSize: 11, fontWeight: 700, color: "#374151", background: "#F9FAFB", padding: "3px 10px", borderRadius: 8 }}>
          {days} day{days !== 1 ? "s" : ""}
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
          {leave.reason}
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
  pendingCount, approvedCount, rejectedCount,
}: LeavesClientProps) {
  const router   = useRouter()
  const pathname = usePathname()
  const [isPending, startTransition] = useTransition()
  const [actionId, setActionId] = useState<string | null>(null)

  function navigate(s: string) { router.push(`${pathname}?status=${s}`) }
  function handleApprove(id: string) {
    setActionId(id + "approved")
    startTransition(async () => { await updateLeaveStatus(id, "approved"); setActionId(null) })
  }
  function handleReject(id: string) {
    setActionId(id + "rejected")
    startTransition(async () => { await updateLeaveStatus(id, "rejected"); setActionId(null) })
  }

  const vacationItems = upcomingLeaves.length > 0 ? upcomingLeaves : []
  const donutColor = availabilityPct >= 80 ? "#10B981" : availabilityPct >= 60 ? "#F59E0B" : "#EF4444"

  return (
    <div style={{ padding: "24px 24px 40px", background: "#F8F9FB", minHeight: "100vh" }}>

      {/* ── Header ────────────────────────────────────────────────────────── */}
      <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", flexWrap: "wrap", gap: 12, marginBottom: 22 }}>
        <div>
          <h1 style={{ fontSize: 26, fontWeight: 900, color: "#111827", fontFamily: "var(--font-jakarta)", margin: 0 }}>Leave Requests</h1>
          <p style={{ fontSize: 13, color: "#9CA3AF", margin: "3px 0 0" }}>Review and manage team leave applications</p>
        </div>
      </div>

      {/* ── 4 Stat Cards ──────────────────────────────────────────────────── */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-5">
        {[
          { label: "Pending",       value: pendingCount,   icon: Clock,         iconBg: "rgba(245,158,11,0.12)",  iconColor: "#F59E0B", valueColor: "#F59E0B" },
          { label: "Approved",      value: approvedCount,  icon: CheckCircle2,  iconBg: "rgba(16,185,129,0.12)",  iconColor: "#10B981", valueColor: "#10B981" },
          { label: "Rejected",      value: rejectedCount,  icon: XOctagon,      iconBg: "rgba(239,68,68,0.1)",    iconColor: "#EF4444", valueColor: "#EF4444" },
          { label: "On Leave Today",value: onLeaveToday.length, icon: Users,    iconBg: "rgba(99,102,241,0.1)",   iconColor: "#6366F1", valueColor: "#6366F1" },
        ].map((s) => {
          const Icon = s.icon
          return (
            <div key={s.label} style={{ background: "#FFFFFF", borderRadius: 16, padding: "16px 18px", border: "1px solid #F0F1F5", boxShadow: "0 2px 10px rgba(0,0,0,0.04)" }}>
              <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 12 }}>
                <div style={{ width: 36, height: 36, borderRadius: 10, background: s.iconBg, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                  <Icon size={16} style={{ color: s.iconColor }} />
                </div>
                <p style={{ fontSize: 11, fontWeight: 700, color: "#9CA3AF", margin: 0, textTransform: "uppercase", letterSpacing: "0.06em" }}>{s.label}</p>
              </div>
              <p style={{ fontSize: 32, fontWeight: 900, color: s.valueColor, margin: 0, fontFamily: "var(--font-jakarta)", lineHeight: 1 }}>{s.value}</p>
            </div>
          )
        })}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-[1fr_260px] gap-5">

        {/* ── Main Column ─────────────────────────────────────────────────── */}
        <div style={{ minWidth: 0, display: "flex", flexDirection: "column", gap: 14 }}>

          {/* Status tabs */}
          <div style={{ display: "flex", gap: 6, overflowX: "auto", paddingBottom: 2 }}>
            {STATUS_TABS.map((tab) => {
              const active = statusFilter === tab.key
              return (
                <button key={tab.key} onClick={() => navigate(tab.key)} style={{
                  padding: "8px 20px", borderRadius: 24, fontSize: 12, fontWeight: 700, cursor: "pointer",
                  whiteSpace: "nowrap", transition: "all 0.15s", border: "none",
                  background: active ? tab.color : "#FFFFFF",
                  color: active ? "#FFFFFF" : "#6B7280",
                  boxShadow: active ? `0 4px 12px ${tab.color}40` : "0 1px 4px rgba(0,0,0,0.06)",
                }}>
                  {tab.label}
                </button>
              )
            })}
          </div>

          {/* On Leave Today strip */}
          {onLeaveToday.length > 0 && (
            <div style={{ background: "#FFFFFF", borderRadius: 14, border: "1px solid #F0F1F5", padding: "12px 16px", display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
              <CalendarDays size={14} style={{ color: "#EF4444", flexShrink: 0 }} />
              <p style={{ fontSize: 12, fontWeight: 700, color: "#111827", margin: 0, whiteSpace: "nowrap" }}>On Leave Today:</p>
              <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                {onLeaveToday.map((m, i) => (
                  <div key={i} style={{ display: "flex", alignItems: "center", gap: 6, background: "#F9FAFB", borderRadius: 20, padding: "4px 10px 4px 4px", border: "1px solid #F0F1F5" }}>
                    <div style={{ width: 24, height: 24, borderRadius: "50%", background: AVATAR_COLORS[i % AVATAR_COLORS.length], display: "flex", alignItems: "center", justifyContent: "center" }}>
                      <span style={{ fontSize: 9, fontWeight: 800, color: "#FFF" }}>{initials(m.name)}</span>
                    </div>
                    <span style={{ fontSize: 11, fontWeight: 600, color: "#374151" }}>{m.name.split(" ")[0]}</span>
                  </div>
                ))}
              </div>
              <span style={{ fontSize: 11, color: "#9CA3AF", marginLeft: "auto" }}>{availabilityPct}% available</span>
            </div>
          )}

          {/* Leave Cards */}
          {leaves.length === 0 ? (
            <div style={{ background: "#FFFFFF", borderRadius: 18, border: "1px solid #F0F1F5", padding: "60px 24px", textAlign: "center", position: "relative" }}>
              <div style={{ position: "absolute", top: 16, right: 16, width: 44, height: 44, borderRadius: 12, background: "rgba(222,26,26,0.1)", display: "flex", alignItems: "center", justifyContent: "center" }}>
                <CalendarDays size={20} style={{ color: "#DE1A1A" }} />
              </div>
              <div style={{ position: "relative", width: 200, height: 160, margin: "0 auto 20px" }}>
                <Image src="/brand/leave/vacation-hero.png" alt="" fill style={{ objectFit: "contain" }} />
              </div>
              <p style={{ fontSize: 16, fontWeight: 700, color: "#111827", margin: "0 0 6px", fontFamily: "var(--font-jakarta)" }}>
                No {statusFilter === "all" ? "" : statusFilter} leave requests
              </p>
              <p style={{ fontSize: 13, color: "#9CA3AF", margin: 0 }}>Your team is fully available today.</p>
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
          )}
        </div>

        {/* ── Right Sidebar ─────────────────────────────────────────────────── */}
        <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>

          {/* Availability */}
          <div style={{ background: "#FFFFFF", borderRadius: 18, border: "1px solid #F0F1F5", padding: "20px", boxShadow: "0 2px 10px rgba(0,0,0,0.04)" }}>
            <p style={{ fontSize: 13, fontWeight: 700, color: "#111827", margin: "0 0 16px", fontFamily: "var(--font-jakarta)" }}>Team Availability</p>
            <div style={{ display: "flex", justifyContent: "center", marginBottom: 16 }}>
              <AvailabilityDonut pct={availabilityPct} size={160} />
            </div>
            {onLeaveToday.length > 0 && (
              <div style={{ background: "rgba(239,68,68,0.05)", borderRadius: 10, padding: "10px 12px", border: "1px solid rgba(239,68,68,0.1)" }}>
                <p style={{ fontSize: 11, fontWeight: 700, color: "#EF4444", margin: "0 0 6px" }}>{onLeaveToday.length} on leave today</p>
                <div style={{ display: "flex", flexWrap: "wrap", gap: 4 }}>
                  {onLeaveToday.map((m, i) => (
                    <span key={i} style={{ fontSize: 10, color: "#6B7280", background: "#F9FAFB", padding: "2px 8px", borderRadius: 20, border: "1px solid #F0F1F5" }}>
                      {m.name.split(" ")[0]}
                    </span>
                  ))}
                </div>
              </div>
            )}
          </div>

          {/* Upcoming Leaves */}
          {vacationItems.length > 0 && (
            <div style={{ background: "#FFFFFF", borderRadius: 18, border: "1px solid #F0F1F5", padding: "20px", boxShadow: "0 2px 10px rgba(0,0,0,0.04)" }}>
              <p style={{ fontSize: 13, fontWeight: 700, color: "#111827", margin: "0 0 14px", fontFamily: "var(--font-jakarta)" }}>Upcoming Leaves</p>
              <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                {vacationItems.map((leave, i) => {
                  const u = Array.isArray(leave.users) ? leave.users[0] : leave.users
                  const name = u?.name ?? "Unknown"
                  const type = getLeaveType(leave.reason)
                  const emoji = LEAVE_EMOJIS[type]
                  return (
                    <div key={leave.id} style={{ display: "flex", alignItems: "center", gap: 10 }}>
                      <div style={{ width: 34, height: 34, borderRadius: "50%", overflow: "hidden", flexShrink: 0, position: "relative", border: "2px solid #F3F4F6" }}>
                        <Image src={getAvatar(name, u?.gender, i)} alt={name} fill style={{ objectFit: "cover" }} />
                      </div>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <p style={{ fontSize: 12, fontWeight: 600, color: "#111827", margin: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{name}</p>
                        <p style={{ fontSize: 11, color: "#9CA3AF", margin: "2px 0 0" }}>{fmtShort(leave.from_date)} – {fmtShort(leave.to_date)}</p>
                      </div>
                      <span style={{ fontSize: 18, flexShrink: 0 }}>{emoji}</span>
                    </div>
                  )
                })}
              </div>
            </div>
          )}

        </div>
      </div>
    </div>
  )
}
