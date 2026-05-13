"use client"

import Image from "next/image"
import { useRouter, usePathname } from "next/navigation"
import { useState, useTransition } from "react"
import { CheckCircle2, XCircle, Loader2, CalendarDays, MoreHorizontal, Plus, Shield, Eye } from "lucide-react"
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
}

// ── Helpers ────────────────────────────────────────────────────────────────────

const STATUS_TABS = [
  { key: "pending",  label: "Pending" },
  { key: "approved", label: "Approved" },
  { key: "rejected", label: "Rejected" },
  { key: "all",      label: "All" },
]

function daysBetween(from: string, to: string) {
  return Math.max(1, Math.ceil((new Date(to).getTime() - new Date(from).getTime()) / 86400000) + 1)
}

function fmtDate(d: string) {
  return new Date(d).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" })
}

function fmtRange(from: string, to: string) {
  if (from === to) return fmtDate(from)
  const f = new Date(from).toLocaleDateString("en-IN", { day: "numeric", month: "short" })
  return `${f} – ${fmtDate(to)}`
}

function getLeaveType(reason: string) {
  const r = reason.toLowerCase()
  if (r.includes("sick") || r.includes("fever") || r.includes("ill") || r.includes("hospital") || r.includes("cold") || r.includes("medical"))
    return "Sick Leave"
  if (r.includes("vacation") || r.includes("trip") || r.includes("travel") || r.includes("holiday") || r.includes("tour") || r.includes("goa"))
    return "Vacation Leave"
  if (r.includes("work from home") || r.includes("remote") || r.includes("wfh") || r.includes("internet"))
    return "Work From Home"
  return "Casual Leave"
}

const LEAVE_TYPE_STYLES: Record<string, { bg: string; color: string }> = {
  "Vacation Leave": { bg: "#FEF3C7", color: "#D97706" },
  "Sick Leave":     { bg: "#FEE2E2", color: "#EF4444" },
  "Casual Leave":   { bg: "#DBEAFE", color: "#3B82F6" },
  "Work From Home": { bg: "#D1FAE5", color: "#10B981" },
}

const LEAVE_TYPE_EMOJIS: Record<string, string> = {
  "Vacation Leave": "🏖️",
  "Sick Leave":     "❤️",
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

const BOY_IMGS  = ["/brand/task-assign/boy1.png", "/brand/task-assign/boy2.png", "/brand/task-assign/boy3.png", "/brand/task-assign/boy4.png"]
const GIRL_IMGS = ["/brand/task-assign/girl1.png","/brand/task-assign/girl2.png","/brand/task-assign/girl3.png","/brand/task-assign/girl4.png"]

function avatarImg(name: string, gender: string | undefined, idx: number) {
  const g = gender?.toLowerCase()
  if (g === "female" || g === "f") return GIRL_IMGS[idx % GIRL_IMGS.length]
  if (g === "male"   || g === "m") return BOY_IMGS[idx % BOY_IMGS.length]
  return idx % 2 === 0 ? BOY_IMGS[idx % BOY_IMGS.length] : GIRL_IMGS[idx % GIRL_IMGS.length]
}

// ── SVG Components ─────────────────────────────────────────────────────────────

function ThreeColorDonut({ avail, size = 130 }: { avail: number; size?: number }) {
  const r = size * 0.35
  const circ = 2 * Math.PI * r
  const remaining = 100 - avail
  const gLen = (avail / 100) * circ
  const yLen = (remaining * 0.55 / 100) * circ
  const rLen = (remaining * 0.45 / 100) * circ
  const sw = size * 0.1

  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
      <circle cx={size/2} cy={size/2} r={r} fill="none" stroke="#F3F4F6" strokeWidth={sw} />
      <circle cx={size/2} cy={size/2} r={r} fill="none" stroke="#EF4444" strokeWidth={sw}
        strokeDasharray={`${rLen} ${circ}`}
        strokeDashoffset={-(gLen + yLen)}
        transform={`rotate(-90 ${size/2} ${size/2})`} />
      <circle cx={size/2} cy={size/2} r={r} fill="none" stroke="#F59E0B" strokeWidth={sw}
        strokeDasharray={`${yLen} ${circ}`}
        strokeDashoffset={-gLen}
        transform={`rotate(-90 ${size/2} ${size/2})`} />
      <circle cx={size/2} cy={size/2} r={r} fill="none" stroke="#10B981" strokeWidth={sw}
        strokeDasharray={`${gLen} ${circ}`}
        transform={`rotate(-90 ${size/2} ${size/2})`} />
    </svg>
  )
}

// ── Leave Card ─────────────────────────────────────────────────────────────────

function LeaveCard({
  leave, idx, isPending, actionId, onApprove, onReject,
}: {
  leave: Leave; idx: number
  isPending: boolean; actionId: string | null
  onApprove: (id: string) => void; onReject: (id: string) => void
}) {
  const user = Array.isArray(leave.users) ? leave.users[0] : leave.users
  const name = user?.name ?? "Unknown"
  const leaveType = getLeaveType(leave.reason)
  const typeStyle = LEAVE_TYPE_STYLES[leaveType]
  const days = daysBetween(leave.from_date, leave.to_date)
  const isLoading = actionId?.startsWith(leave.id)

  const statusColors: Record<string, { bg: string; color: string }> = {
    pending:  { bg: "#FEF3C7", color: "#D97706" },
    approved: { bg: "#D1FAE5", color: "#059669" },
    rejected: { bg: "#FEE2E2", color: "#EF4444" },
  }
  const statusStyle = statusColors[leave.status] ?? statusColors.pending

  return (
    <div style={{
      background: "#FFF", borderRadius: 16, border: "1px solid #F3F4F6",
      padding: "18px", display: "flex", flexDirection: "column", gap: 12,
    }}>
      {/* Top row: avatar + name + menu */}
      <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
        <div style={{ width: 44, height: 44, borderRadius: "50%", overflow: "hidden", flexShrink: 0, position: "relative", border: "2px solid #F3F4F6" }}>
          <Image src={avatarImg(name, user?.gender, idx)} alt={name} fill style={{ objectFit: "cover" }} />
        </div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <p style={{ fontSize: 14, fontWeight: 700, color: "#111827", margin: 0, fontFamily: "var(--font-jakarta)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{name}</p>
          <p style={{ fontSize: 11, color: "#9CA3AF", margin: "1px 0 0" }}>Team Member</p>
        </div>
        <button style={{ padding: 4, background: "none", border: "none", cursor: "pointer", color: "#9CA3AF" }}>
          <MoreHorizontal size={16} />
        </button>
      </div>

      {/* Leave type badge */}
      <div style={{ display: "inline-flex" }}>
        <span style={{
          fontSize: 11, fontWeight: 600, borderRadius: 20,
          padding: "3px 12px",
          background: typeStyle.bg, color: typeStyle.color,
        }}>
          {leaveType}
        </span>
      </div>

      {/* Date range */}
      <div style={{ display: "flex", alignItems: "flex-start", gap: 7 }}>
        <CalendarDays size={13} style={{ color: "#9CA3AF", flexShrink: 0, marginTop: 1 }} />
        <div>
          <p style={{ fontSize: 12, fontWeight: 500, color: "#374151", margin: 0 }}>{fmtRange(leave.from_date, leave.to_date)}</p>
          <p style={{ fontSize: 11, color: "#9CA3AF", margin: "1px 0 0" }}>{days} day{days !== 1 ? "s" : ""}</p>
        </div>
      </div>

      {/* Reason */}
      <div style={{ display: "flex", alignItems: "flex-start", gap: 7 }}>
        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="#9CA3AF" strokeWidth="2" strokeLinecap="round" style={{ flexShrink: 0, marginTop: 1 }}>
          <path d="M21.44 11.05l-9.19 9.19a6 6 0 01-8.49-8.49l9.19-9.19a4 4 0 015.66 5.66l-9.2 9.19a2 2 0 01-2.83-2.83l8.49-8.48"/>
        </svg>
        <p style={{ fontSize: 12, color: "#6B7280", margin: 0, lineHeight: 1.4 }}>{leave.reason}</p>
      </div>

      {/* Status badge */}
      <div>
        <span style={{
          fontSize: 11, fontWeight: 600, borderRadius: 20,
          padding: "3px 12px",
          background: statusStyle.bg, color: statusStyle.color,
        }}>
          {leave.status.charAt(0).toUpperCase() + leave.status.slice(1)}
        </span>
      </div>

      {/* Actions */}
      {leave.status === "pending" ? (
        <div style={{ display: "flex", gap: 6, marginTop: 2 }}>
          <button
            onClick={() => onApprove(leave.id)}
            disabled={isPending}
            style={{
              flex: 1, display: "flex", alignItems: "center", justifyContent: "center", gap: 4,
              fontSize: 11, fontWeight: 600, color: "#10B981",
              background: "#F0FDF4", border: "1px solid #D1FAE5", borderRadius: 8,
              padding: "7px 0", cursor: "pointer",
            }}>
            {isLoading && actionId === leave.id + "approved"
              ? <Loader2 size={11} style={{ animation: "spin 1s linear infinite" }} />
              : <CheckCircle2 size={11} />}
            Approve
          </button>
          <button
            onClick={() => onReject(leave.id)}
            disabled={isPending}
            style={{
              flex: 1, display: "flex", alignItems: "center", justifyContent: "center", gap: 4,
              fontSize: 11, fontWeight: 600, color: "#EF4444",
              background: "#FFF5F5", border: "1px solid #FEE2E2", borderRadius: 8,
              padding: "7px 0", cursor: "pointer",
            }}>
            {isLoading && actionId === leave.id + "rejected"
              ? <Loader2 size={11} style={{ animation: "spin 1s linear infinite" }} />
              : <XCircle size={11} />}
            Reject
          </button>
          <button style={{
            flex: 1, display: "flex", alignItems: "center", justifyContent: "center", gap: 4,
            fontSize: 11, fontWeight: 600, color: "#374151",
            background: "#F9FAFB", border: "1px solid #F3F4F6", borderRadius: 8,
            padding: "7px 0", cursor: "pointer",
          }}>
            <Eye size={11} /> View Details
          </button>
        </div>
      ) : (
        <div style={{ display: "flex", gap: 6 }}>
          <button style={{
            flex: 1, display: "flex", alignItems: "center", justifyContent: "center", gap: 4,
            fontSize: 11, fontWeight: 600, color: "#374151",
            background: "#F9FAFB", border: "1px solid #F3F4F6", borderRadius: 8,
            padding: "7px 0", cursor: "pointer",
          }}>
            <Eye size={11} /> View Details
          </button>
        </div>
      )}
    </div>
  )
}

// ── Main Component ─────────────────────────────────────────────────────────────

export default function LeavesClient({
  leaves, statusFilter, upcomingLeaves, availabilityPct,
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

  return (
    <div style={{ display: "flex", gap: 20, padding: "28px 28px 40px", background: "#F8F9FB", minHeight: "100vh" }}>

      {/* ── Main Column ──────────────────────────────────────────────────────── */}
      <div style={{ flex: 1, minWidth: 0, display: "flex", flexDirection: "column", gap: 20 }}>

        {/* Header */}
        <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between" }}>
          <div>
            <h1 style={{ fontSize: 28, fontWeight: 800, color: "#111827", fontFamily: "var(--font-jakarta)", margin: 0, lineHeight: 1.2 }}>
              Leave Requests
            </h1>
            <p style={{ fontSize: 13, color: "#6B7280", margin: "4px 0 0" }}>
              Review and manage team leave requests.
            </p>
          </div>
          <button style={{
            display: "flex", alignItems: "center", gap: 6,
            background: "#DE1A1A", color: "#FFF", border: "none", borderRadius: 10,
            padding: "11px 20px", fontSize: 13, fontWeight: 700, cursor: "pointer",
            fontFamily: "var(--font-jakarta)",
          }}>
            <Plus size={15} /> New Leave Policy
          </button>
        </div>

        {/* Tabs */}
        <div style={{ display: "flex", gap: 8 }}>
          {STATUS_TABS.map((tab) => {
            const active = statusFilter === tab.key
            return (
              <button key={tab.key} onClick={() => navigate(tab.key)} style={{
                padding: "8px 20px", borderRadius: 20, fontSize: 13, fontWeight: 600,
                cursor: "pointer", transition: "all 0.15s",
                background: active ? "#F97316" : "#FFF",
                color: active ? "#FFF" : "#6B7280",
                border: active ? "none" : "1px solid #E5E7EB",
                fontFamily: "var(--font-jakarta)",
              }}>
                {tab.label}
              </button>
            )
          })}
        </div>

        {/* Hero Banner */}
        <div style={{ borderRadius: 20, overflow: "hidden", position: "relative", minHeight: 300, background: "#FFF8F0" }}>
          {/* Illustration */}
          <div style={{ position: "absolute", left: 0, top: 0, width: "58%", height: "100%" }}>
            <Image src="/brand/leave/vacation-hero.png" alt="Vacation" fill style={{ objectFit: "cover", objectPosition: "center" }} />
          </div>
          {/* Gradient overlay */}
          <div style={{
            position: "absolute", inset: 0,
            background: "linear-gradient(to right, transparent 35%, rgba(255,248,240,0.9) 60%, #FFF8F0 75%)",
          }} />
          {/* Content */}
          <div style={{
            position: "absolute", right: 0, top: 0, width: "45%", height: "100%",
            display: "flex", flexDirection: "column", alignItems: "flex-start", justifyContent: "center",
            padding: "32px 40px 32px 20px",
          }}>
            {leaves.length === 0 ? (
              <>
                <div style={{ width: 48, height: 48, background: "#FFF5F5", borderRadius: 12, display: "flex", alignItems: "center", justifyContent: "center", marginBottom: 16 }}>
                  <CalendarDays size={22} style={{ color: "#DE1A1A" }} />
                </div>
                <p style={{ fontSize: 22, fontWeight: 800, color: "#111827", margin: 0, fontFamily: "var(--font-jakarta)", lineHeight: 1.3 }}>
                  No {statusFilter === "all" ? "" : statusFilter} leave requests
                </p>
                <p style={{ fontSize: 13, color: "#6B7280", margin: "8px 0 24px" }}>
                  Your team is fully available today.
                </p>
                <button style={{
                  display: "flex", alignItems: "center", gap: 8,
                  background: "#DE1A1A", color: "#FFF", border: "none", borderRadius: 10,
                  padding: "12px 24px", fontSize: 13, fontWeight: 600, cursor: "pointer",
                }}>
                  <Shield size={14} /> Manage Leave Policies
                </button>
              </>
            ) : (
              <>
                <div style={{ width: 48, height: 48, background: "#FEF3C7", borderRadius: 12, display: "flex", alignItems: "center", justifyContent: "center", marginBottom: 16 }}>
                  <CalendarDays size={22} style={{ color: "#D97706" }} />
                </div>
                <p style={{ fontSize: 22, fontWeight: 800, color: "#111827", margin: 0, fontFamily: "var(--font-jakarta)", lineHeight: 1.3 }}>
                  {leaves.length} leave {leaves.length === 1 ? "request" : "requests"} to review
                </p>
                <p style={{ fontSize: 13, color: "#6B7280", margin: "8px 0 0" }}>
                  Review and take action on pending requests below.
                </p>
              </>
            )}
          </div>
        </div>

        {/* Leave Cards Grid */}
        {leaves.length > 0 && (
          <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 16 }}>
            {leaves.map((leave, i) => (
              <LeaveCard
                key={leave.id}
                leave={leave}
                idx={i}
                isPending={isPending}
                actionId={actionId}
                onApprove={handleApprove}
                onReject={handleReject}
              />
            ))}
          </div>
        )}

        {/* Bottom Wellness Banner */}
        <div style={{ borderRadius: 20, overflow: "hidden", position: "relative", minHeight: 160, background: "#FFF5EC" }}>
          <div style={{ position: "absolute", left: 0, top: 0, width: "40%", height: "100%" }}>
            <Image src="/brand/leave/relaxed-boy.png" alt="Wellness" fill style={{ objectFit: "cover", objectPosition: "center top" }} />
          </div>
          <div style={{
            position: "absolute", inset: 0,
            background: "linear-gradient(to right, transparent 30%, rgba(255,245,236,0.85) 55%, #FFF5EC 70%)",
          }} />
          <div style={{
            position: "absolute", right: 0, top: 0, width: "62%", height: "100%",
            display: "flex", flexDirection: "column", justifyContent: "center",
            padding: "28px 40px",
          }}>
            <p style={{ fontSize: 22, fontWeight: 800, color: "#111827", margin: 0, fontFamily: "var(--font-jakarta)" }}>
              Happy teams work better 🌴
            </p>
            <p style={{ fontSize: 13, color: "#6B7280", margin: "6px 0 20px" }}>
              Encourage healthy work-life balance for better productivity.
            </p>
            <button style={{
              display: "inline-flex", alignItems: "center", gap: 8,
              background: "#DE1A1A", color: "#FFF", border: "none", borderRadius: 10,
              padding: "11px 22px", fontSize: 13, fontWeight: 600, cursor: "pointer",
              alignSelf: "flex-start",
            }}>
              View Team Wellness →
            </button>
          </div>
        </div>

      </div>

      {/* ── Right Sidebar ─────────────────────────────────────────────────────── */}
      <div style={{ width: 270, flexShrink: 0, display: "flex", flexDirection: "column", gap: 16 }}>

        {/* Leave Overview */}
        <div style={{ background: "#FFF", borderRadius: 16, border: "1px solid #F3F4F6", padding: "20px" }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 18 }}>
            <span style={{ fontSize: 14, fontWeight: 700, color: "#111827" }}>Leave Overview</span>
            <MoreHorizontal size={16} style={{ color: "#9CA3AF", cursor: "pointer" }} />
          </div>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "center", position: "relative", marginBottom: 14 }}>
            <ThreeColorDonut avail={availabilityPct} size={130} />
            <div style={{ position: "absolute", textAlign: "center" }}>
              <p style={{ fontSize: 26, fontWeight: 800, color: "#111827", margin: 0, fontFamily: "var(--font-jakarta)" }}>
                {availabilityPct}%
              </p>
              <p style={{ fontSize: 10, color: "#6B7280", margin: 0 }}>Team<br />Availability</p>
            </div>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 4, justifyContent: "center" }}>
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#10B981" strokeWidth="2.5" strokeLinecap="round">
              <polyline points="18 15 12 9 6 15"/>
            </svg>
            <span style={{ fontSize: 12, color: "#10B981", fontWeight: 600 }}>8% vs last month</span>
          </div>
        </div>

        {/* Upcoming Vacations */}
        {upcomingLeaves.length > 0 && (
          <div style={{ background: "#FFF", borderRadius: 16, border: "1px solid #F3F4F6", padding: "20px" }}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 16 }}>
              <span style={{ fontSize: 14, fontWeight: 700, color: "#111827" }}>Upcoming Vacations</span>
              <MoreHorizontal size={16} style={{ color: "#9CA3AF", cursor: "pointer" }} />
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
              {upcomingLeaves.map((leave, i) => {
                const user = Array.isArray(leave.users) ? leave.users[0] : leave.users
                const name = user?.name ?? "Unknown"
                const type = getLeaveType(leave.reason)
                const emoji = LEAVE_TYPE_EMOJIS[type]
                const bg = avatarBg(name)
                return (
                  <div key={leave.id} style={{ display: "flex", alignItems: "center", gap: 10 }}>
                    <div style={{ width: 34, height: 34, borderRadius: "50%", overflow: "hidden", flexShrink: 0, position: "relative" }}>
                      <Image src={avatarImg(name, user?.gender, i)} alt={name} fill style={{ objectFit: "cover" }} />
                    </div>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <p style={{ fontSize: 13, fontWeight: 600, color: "#111827", margin: 0 }}>{name.split(" ")[0]}&apos;s {type.split(" ")[0]}</p>
                      <p style={{ fontSize: 11, color: "#9CA3AF", margin: "2px 0 0" }}>
                        {new Date(leave.from_date).toLocaleDateString("en-IN", { day: "numeric", month: "short" })} – {new Date(leave.to_date).toLocaleDateString("en-IN", { day: "numeric", month: "short" })}
                      </p>
                    </div>
                    <span style={{ fontSize: 18 }}>{emoji}</span>
                  </div>
                )
              })}
            </div>
          </div>
        )}

        {/* Team Wellness */}
        <div style={{ background: "#FFF", borderRadius: 16, border: "1px solid #F3F4F6", padding: "20px" }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 14 }}>
            <span style={{ fontSize: 14, fontWeight: 700, color: "#111827" }}>Team Wellness</span>
            <MoreHorizontal size={16} style={{ color: "#9CA3AF", cursor: "pointer" }} />
          </div>
          {/* Boy image + score */}
          <div style={{ display: "flex", alignItems: "center", gap: 14, marginBottom: 16 }}>
            <div style={{ width: 80, height: 80, borderRadius: 12, overflow: "hidden", flexShrink: 0, position: "relative" }}>
              <Image src="/brand/leave/wellness-boy.png" alt="Wellness" fill style={{ objectFit: "cover" }} />
            </div>
            <div>
              <p style={{ fontSize: 28, fontWeight: 800, color: "#10B981", margin: 0, fontFamily: "var(--font-jakarta)" }}>4.6<span style={{ fontSize: 14, color: "#9CA3AF", fontWeight: 500 }}>/5</span></p>
              <p style={{ fontSize: 12, color: "#374151", margin: "2px 0 0", fontWeight: 500 }}>Great Balance</p>
              <div style={{ display: "flex", alignItems: "center", gap: 4, marginTop: 4 }}>
                <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="#10B981" strokeWidth="2.5" strokeLinecap="round">
                  <polyline points="18 15 12 9 6 15"/>
                </svg>
                <span style={{ fontSize: 11, color: "#10B981", fontWeight: 600 }}>6% vs last month</span>
              </div>
            </div>
          </div>
          {/* Mood slider */}
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <span style={{ fontSize: 18 }}>😟</span>
            <div style={{ flex: 1, height: 8, borderRadius: 4, position: "relative", background: "linear-gradient(to right, #FEE2E2, #FEF3C7, #D1FAE5)" }}>
              <div style={{
                position: "absolute", top: "50%", transform: "translate(-50%, -50%)",
                left: "88%",
                width: 16, height: 16, borderRadius: "50%", background: "#10B981",
                border: "3px solid #FFF", boxShadow: "0 0 0 2px #10B981",
              }} />
            </div>
            <span style={{ fontSize: 18 }}>😊</span>
          </div>
        </div>

      </div>
    </div>
  )
}
