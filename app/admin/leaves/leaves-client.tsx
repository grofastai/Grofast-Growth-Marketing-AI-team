"use client"

import Image from "next/image"
import { useRouter, usePathname } from "next/navigation"
import { useState, useTransition } from "react"
import { CheckCircle2, XCircle, Loader2, CalendarDays, MoreHorizontal, Plus, Shield, Eye, Paperclip } from "lucide-react"
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

const BOY_IMGS  = ["/brand/task-assign/boy1.png","/brand/task-assign/boy2.png","/brand/task-assign/boy3.png","/brand/task-assign/boy4.png","/brand/task-assign/boy5.png"]
const GIRL_IMGS = ["/brand/task-assign/girl1.png","/brand/task-assign/girl2.png","/brand/task-assign/girl3.png","/brand/task-assign/girl4.png"]

function getAvatar(name: string, gender: string | undefined, idx: number) {
  const g = gender?.toLowerCase()
  if (g === "female" || g === "f") return GIRL_IMGS[idx % GIRL_IMGS.length]
  if (g === "male"   || g === "m") return BOY_IMGS[idx % BOY_IMGS.length]
  return idx % 2 === 0 ? BOY_IMGS[idx % BOY_IMGS.length] : GIRL_IMGS[idx % GIRL_IMGS.length]
}

// ── Donut Chart ────────────────────────────────────────────────────────────────

function AvailabilityDonut({ pct, size = 140 }: { pct: number; size?: number }) {
  const r = size * 0.34
  const circ = 2 * Math.PI * r
  const rem = 100 - pct
  const gLen = (pct / 100) * circ
  const yLen = (rem * 0.6 / 100) * circ
  const rLen = (rem * 0.4 / 100) * circ
  const sw = size * 0.1

  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} style={{ filter: "drop-shadow(0 4px 12px rgba(16,185,129,0.15))" }}>
      <circle cx={size/2} cy={size/2} r={r} fill="none" stroke="#F0FDF4" strokeWidth={sw} />
      <circle cx={size/2} cy={size/2} r={r} fill="none" stroke="#FCA5A5" strokeWidth={sw}
        strokeDasharray={`${rLen} ${circ}`} strokeDashoffset={-(gLen + yLen)}
        transform={`rotate(-90 ${size/2} ${size/2})`} strokeLinecap="round" />
      <circle cx={size/2} cy={size/2} r={r} fill="none" stroke="#FCD34D" strokeWidth={sw}
        strokeDasharray={`${yLen} ${circ}`} strokeDashoffset={-gLen}
        transform={`rotate(-90 ${size/2} ${size/2})`} strokeLinecap="round" />
      <circle cx={size/2} cy={size/2} r={r} fill="none" stroke="#10B981" strokeWidth={sw}
        strokeDasharray={`${gLen} ${circ}`}
        transform={`rotate(-90 ${size/2} ${size/2})`} strokeLinecap="round" />
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

  const statusStyle = {
    pending:  { bg: "#FFFBEB", color: "#D97706", border: "#FDE68A" },
    approved: { bg: "#F0FDF4", color: "#059669", border: "#A7F3D0" },
    rejected: { bg: "#FFF5F5", color: "#EF4444", border: "#FECACA" },
  }[leave.status] ?? { bg: "#FFFBEB", color: "#D97706", border: "#FDE68A" }

  return (
    <div style={{
      background: "#FFFFFF", borderRadius: 18, border: "1px solid #F3F4F6",
      padding: "18px 16px 16px", display: "flex", flexDirection: "column", gap: 10,
      boxShadow: "0 2px 12px rgba(0,0,0,0.04)", transition: "box-shadow 0.2s",
    }}>
      {/* Avatar + Name + Menu */}
      <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
        <div style={{ width: 46, height: 46, borderRadius: "50%", overflow: "hidden", flexShrink: 0, position: "relative", border: "2.5px solid #F3F4F6", boxShadow: "0 2px 8px rgba(0,0,0,0.08)" }}>
          <Image src={getAvatar(name, user?.gender, idx)} alt={name} fill style={{ objectFit: "cover" }} />
        </div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <p style={{ fontSize: 14, fontWeight: 700, color: "#111827", margin: 0, fontFamily: "var(--font-jakarta)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{name}</p>
          <p style={{ fontSize: 11, color: "#9CA3AF", margin: "1px 0 0", fontWeight: 400 }}>Team Member</p>
        </div>
        <button style={{ padding: 4, background: "none", border: "none", cursor: "pointer", color: "#D1D5DB", borderRadius: 6 }}>
          <MoreHorizontal size={15} />
        </button>
      </div>

      {/* Leave Type Badge */}
      <span style={{
        alignSelf: "flex-start", fontSize: 11, fontWeight: 600, borderRadius: 20,
        padding: "3px 11px", border: `1px solid ${typeStyle.border}`,
        background: typeStyle.bg, color: typeStyle.color,
      }}>
        {leaveType}
      </span>

      {/* Date */}
      <div style={{ display: "flex", alignItems: "center", gap: 7 }}>
        <CalendarDays size={12} style={{ color: "#9CA3AF", flexShrink: 0 }} />
        <p style={{ fontSize: 12, color: "#374151", margin: 0, fontWeight: 500 }}>{fmtRange(leave.from_date, leave.to_date)}</p>
      </div>

      {/* Reason */}
      <div style={{ display: "flex", alignItems: "flex-start", gap: 7 }}>
        <Paperclip size={12} style={{ color: "#9CA3AF", flexShrink: 0, marginTop: 1 }} />
        <p style={{ fontSize: 12, color: "#6B7280", margin: 0, lineHeight: 1.4, display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical", overflow: "hidden" } as React.CSSProperties}>
          {leave.reason}
        </p>
      </div>

      {/* Status Badge */}
      <span style={{
        alignSelf: "flex-start", fontSize: 11, fontWeight: 600, borderRadius: 20,
        padding: "3px 11px", border: `1px solid ${statusStyle.border}`,
        background: statusStyle.bg, color: statusStyle.color,
      }}>
        {leave.status.charAt(0).toUpperCase() + leave.status.slice(1)}
      </span>

      {/* Actions */}
      <div style={{ display: "flex", alignItems: "center", gap: 6, paddingTop: 4, borderTop: "1px solid #F9FAFB" }}>
        {leave.status === "pending" ? (
          <>
            <button onClick={() => onApprove(leave.id)} disabled={isPending} style={{
              flex: 1, display: "flex", alignItems: "center", justifyContent: "center", gap: 3,
              fontSize: 11, fontWeight: 600, color: "#10B981",
              background: "none", border: "none", padding: "5px 0", cursor: "pointer",
            }}>
              {isLoading && actionId === leave.id + "approved" ? <Loader2 size={10} style={{ animation: "spin 1s linear infinite" }} /> : <CheckCircle2 size={11} />}
              Approve
            </button>
            <div style={{ width: 1, height: 14, background: "#F3F4F6" }} />
            <button onClick={() => onReject(leave.id)} disabled={isPending} style={{
              flex: 1, display: "flex", alignItems: "center", justifyContent: "center", gap: 3,
              fontSize: 11, fontWeight: 600, color: "#EF4444",
              background: "none", border: "none", padding: "5px 0", cursor: "pointer",
            }}>
              {isLoading && actionId === leave.id + "rejected" ? <Loader2 size={10} style={{ animation: "spin 1s linear infinite" }} /> : <XCircle size={11} />}
              Reject
            </button>
            <div style={{ width: 1, height: 14, background: "#F3F4F6" }} />
            <button style={{
              flex: 1, display: "flex", alignItems: "center", justifyContent: "center", gap: 3,
              fontSize: 11, fontWeight: 600, color: "#6B7280",
              background: "none", border: "none", padding: "5px 0", cursor: "pointer",
            }}>
              <Eye size={11} /> View Details
            </button>
          </>
        ) : (
          <button style={{
            flex: 1, display: "flex", alignItems: "center", justifyContent: "center", gap: 4,
            fontSize: 11, fontWeight: 600, color: "#6B7280",
            background: "none", border: "none", padding: "5px 0", cursor: "pointer",
          }}>
            <Eye size={11} /> View Details
          </button>
        )}
      </div>
    </div>
  )
}

// ── Main ───────────────────────────────────────────────────────────────────────

export default function LeavesClient({ leaves, statusFilter, upcomingLeaves, availabilityPct }: LeavesClientProps) {
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

  // Sidebar upcoming: prefer upcoming leaves, fall back to current list
  const vacationItems = upcomingLeaves.length > 0 ? upcomingLeaves : leaves.slice(0, 4)

  return (
    <div style={{ display: "flex", gap: 20, padding: "28px 24px 40px", background: "#F9FAFB", minHeight: "100vh" }}>

      {/* ── Main Column ──────────────────────────────────────────────────────── */}
      <div style={{ flex: 1, minWidth: 0, display: "flex", flexDirection: "column", gap: 18 }}>

        {/* Header */}
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <div>
            <h1 style={{ fontSize: 28, fontWeight: 800, color: "#111827", fontFamily: "var(--font-jakarta)", margin: 0 }}>Leave Requests</h1>
            <p style={{ fontSize: 13, color: "#6B7280", margin: "4px 0 0" }}>Review and manage team leave requests.</p>
          </div>
          <button style={{
            display: "flex", alignItems: "center", gap: 7,
            background: "#DE1A1A", color: "#FFF", border: "none", borderRadius: 12,
            padding: "11px 22px", fontSize: 13, fontWeight: 700, cursor: "pointer",
            boxShadow: "0 4px 16px rgba(222,26,26,0.25)", fontFamily: "var(--font-jakarta)",
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
                padding: "8px 22px", borderRadius: 24, fontSize: 13, fontWeight: 600, cursor: "pointer",
                background: active ? "#F97316" : "#FFFFFF",
                color: active ? "#FFF" : "#6B7280",
                border: active ? "2px solid #F97316" : "1.5px solid #E5E7EB",
                boxShadow: active ? "0 4px 12px rgba(249,115,22,0.25)" : "none",
                transition: "all 0.15s", fontFamily: "var(--font-jakarta)",
              }}>
                {tab.label}
              </button>
            )
          })}
        </div>

        {/* Hero Banner */}
        <div style={{ borderRadius: 20, overflow: "hidden", position: "relative", height: 320, background: "#FFF8F0", boxShadow: "0 4px 24px rgba(0,0,0,0.06)", border: "1px solid #FEE8D0" }}>
          {/* Full illustration */}
          <div style={{ position: "absolute", left: 0, top: 0, width: "65%", height: "100%" }}>
            <Image src="/brand/leave/vacation-hero.png" alt="Vacation" fill style={{ objectFit: "cover", objectPosition: "left center" }} />
          </div>
          {/* Gradient */}
          <div style={{ position: "absolute", inset: 0, background: "linear-gradient(to right, transparent 38%, rgba(255,248,240,0.88) 56%, #FFF8F0 70%)" }} />
          {/* Content */}
          <div style={{
            position: "absolute", right: 0, top: 0, width: "40%", height: "100%",
            display: "flex", flexDirection: "column", alignItems: "flex-start", justifyContent: "center",
            padding: "36px 36px 36px 12px",
          }}>
            {leaves.length === 0 ? (
              <>
                <div style={{ width: 52, height: 52, background: "rgba(222,26,26,0.08)", borderRadius: 14, display: "flex", alignItems: "center", justifyContent: "center", marginBottom: 16, border: "1px solid rgba(222,26,26,0.12)" }}>
                  <CalendarDays size={24} style={{ color: "#DE1A1A" }} />
                </div>
                <p style={{ fontSize: 24, fontWeight: 800, color: "#111827", margin: 0, fontFamily: "var(--font-jakarta)", lineHeight: 1.25 }}>
                  No {statusFilter === "all" ? "" : statusFilter} leave<br />requests
                </p>
                <p style={{ fontSize: 13, color: "#6B7280", margin: "10px 0 24px", lineHeight: 1.5 }}>
                  Your team is fully available today.
                </p>
                <button style={{
                  display: "flex", alignItems: "center", gap: 8,
                  background: "#DE1A1A", color: "#FFF", border: "none", borderRadius: 12,
                  padding: "12px 24px", fontSize: 13, fontWeight: 600, cursor: "pointer",
                  boxShadow: "0 4px 16px rgba(222,26,26,0.28)",
                }}>
                  <Shield size={14} /> Manage Leave Policies
                </button>
              </>
            ) : (
              <>
                <div style={{ width: 52, height: 52, background: "#FEF3C7", borderRadius: 14, display: "flex", alignItems: "center", justifyContent: "center", marginBottom: 16 }}>
                  <CalendarDays size={24} style={{ color: "#D97706" }} />
                </div>
                <p style={{ fontSize: 22, fontWeight: 800, color: "#111827", margin: 0, fontFamily: "var(--font-jakarta)", lineHeight: 1.25 }}>
                  {leaves.length} leave {leaves.length === 1 ? "request" : "requests"} to review
                </p>
                <p style={{ fontSize: 13, color: "#6B7280", margin: "8px 0 0" }}>
                  Take action on pending requests below.
                </p>
              </>
            )}
          </div>
        </div>

        {/* Leave Cards Grid */}
        {leaves.length > 0 && (
          <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 14 }}>
            {leaves.map((leave, i) => (
              <LeaveCard
                key={leave.id} leave={leave} idx={i}
                isPending={isPending} actionId={actionId}
                onApprove={handleApprove} onReject={handleReject}
              />
            ))}
          </div>
        )}

        {/* Bottom Wellness Banner */}
        <div style={{ borderRadius: 20, overflow: "hidden", position: "relative", minHeight: 180, background: "linear-gradient(135deg, #FFF5E0 0%, #FDEBD0 40%, #FAD8A0 100%)", border: "1px solid #FDE8C0", boxShadow: "0 4px 24px rgba(0,0,0,0.05)" }}>
          {/* Boy image left */}
          <div style={{ position: "absolute", left: 0, top: 0, width: "38%", height: "100%" }}>
            <Image src="/brand/leave/relaxed-boy.png" alt="Wellness" fill style={{ objectFit: "cover", objectPosition: "center top" }} />
          </div>
          {/* Gradient blend */}
          <div style={{ position: "absolute", inset: 0, background: "linear-gradient(to right, transparent 28%, rgba(253,235,208,0.8) 50%, #FDEBD0 65%)" }} />
          {/* Content */}
          <div style={{
            position: "absolute", right: 0, top: 0, width: "64%", height: "100%",
            display: "flex", flexDirection: "column", justifyContent: "center",
            padding: "28px 40px",
          }}>
            <p style={{ fontSize: 22, fontWeight: 800, color: "#111827", margin: 0, fontFamily: "var(--font-jakarta)" }}>
              Happy teams work better 🌴
            </p>
            <p style={{ fontSize: 13, color: "#6B7280", margin: "6px 0 20px", lineHeight: 1.5 }}>
              Encourage healthy work-life balance for better productivity.
            </p>
            <button style={{
              display: "inline-flex", alignItems: "center", gap: 8, alignSelf: "flex-start",
              background: "#DE1A1A", color: "#FFF", border: "none", borderRadius: 12,
              padding: "11px 24px", fontSize: 13, fontWeight: 600, cursor: "pointer",
              boxShadow: "0 4px 14px rgba(222,26,26,0.28)",
            }}>
              View Team Wellness →
            </button>
          </div>
        </div>

      </div>

      {/* ── Right Sidebar ─────────────────────────────────────────────────────── */}
      <div style={{ width: 272, flexShrink: 0, display: "flex", flexDirection: "column", gap: 14 }}>

        {/* Leave Overview */}
        <div style={{ background: "#FFF", borderRadius: 18, border: "1px solid #F3F4F6", padding: "20px", boxShadow: "0 2px 12px rgba(0,0,0,0.04)" }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 16 }}>
            <span style={{ fontSize: 14, fontWeight: 700, color: "#111827", fontFamily: "var(--font-jakarta)" }}>Leave Overview</span>
            <MoreHorizontal size={16} style={{ color: "#D1D5DB", cursor: "pointer" }} />
          </div>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "center", position: "relative", marginBottom: 14 }}>
            <AvailabilityDonut pct={availabilityPct} size={140} />
            <div style={{ position: "absolute", textAlign: "center", lineHeight: 1.2 }}>
              <p style={{ fontSize: 28, fontWeight: 800, color: "#111827", margin: 0, fontFamily: "var(--font-jakarta)" }}>{availabilityPct}%</p>
              <p style={{ fontSize: 10, color: "#6B7280", margin: "3px 0 0" }}>Team<br />Availability</p>
            </div>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 5, justifyContent: "center", background: "#F0FDF4", borderRadius: 20, padding: "5px 14px" }}>
            <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="#10B981" strokeWidth="2.5" strokeLinecap="round"><polyline points="18 15 12 9 6 15"/></svg>
            <span style={{ fontSize: 11, color: "#10B981", fontWeight: 600 }}>8% vs last month</span>
          </div>
        </div>

        {/* Upcoming Vacations */}
        <div style={{ background: "#FFF", borderRadius: 18, border: "1px solid #F3F4F6", padding: "20px", boxShadow: "0 2px 12px rgba(0,0,0,0.04)" }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 16 }}>
            <span style={{ fontSize: 14, fontWeight: 700, color: "#111827", fontFamily: "var(--font-jakarta)" }}>Upcoming Vacations</span>
            <MoreHorizontal size={16} style={{ color: "#D1D5DB", cursor: "pointer" }} />
          </div>
          {vacationItems.length === 0 ? (
            <p style={{ fontSize: 12, color: "#9CA3AF", textAlign: "center", padding: "10px 0" }}>No upcoming vacations</p>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
              {vacationItems.map((leave, i) => {
                const u = Array.isArray(leave.users) ? leave.users[0] : leave.users
                const name = u?.name ?? "Unknown"
                const type = getLeaveType(leave.reason)
                const title = getVacationTitle(leave.reason, type)
                const emoji = LEAVE_EMOJIS[type]
                return (
                  <div key={leave.id} style={{ display: "flex", alignItems: "center", gap: 10 }}>
                    <div style={{ width: 36, height: 36, borderRadius: "50%", overflow: "hidden", flexShrink: 0, position: "relative", border: "2px solid #F3F4F6" }}>
                      <Image src={getAvatar(name, u?.gender, i)} alt={name} fill style={{ objectFit: "cover" }} />
                    </div>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <p style={{ fontSize: 13, fontWeight: 600, color: "#111827", margin: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{title}</p>
                      <p style={{ fontSize: 11, color: "#9CA3AF", margin: "2px 0 0" }}>{fmtShort(leave.from_date)} – {fmtShort(leave.to_date)}</p>
                    </div>
                    <span style={{ fontSize: 20, flexShrink: 0 }}>{emoji}</span>
                  </div>
                )
              })}
            </div>
          )}
        </div>

        {/* Team Wellness */}
        <div style={{ background: "#FFF", borderRadius: 18, border: "1px solid #F3F4F6", padding: "20px", boxShadow: "0 2px 12px rgba(0,0,0,0.04)" }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 14 }}>
            <span style={{ fontSize: 14, fontWeight: 700, color: "#111827", fontFamily: "var(--font-jakarta)" }}>Team Wellness</span>
            <MoreHorizontal size={16} style={{ color: "#D1D5DB", cursor: "pointer" }} />
          </div>
          {/* Wellness boy + score */}
          <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 16 }}>
            <div style={{ width: 88, height: 88, borderRadius: 14, overflow: "hidden", flexShrink: 0, position: "relative", boxShadow: "0 4px 12px rgba(0,0,0,0.08)" }}>
              <Image src="/brand/leave/wellness-boy.png" alt="Wellness" fill style={{ objectFit: "cover" }} />
            </div>
            <div>
              <p style={{ fontSize: 30, fontWeight: 800, color: "#10B981", margin: 0, fontFamily: "var(--font-jakarta)", lineHeight: 1 }}>
                4.6<span style={{ fontSize: 14, color: "#9CA3AF", fontWeight: 500 }}>/5</span>
              </p>
              <p style={{ fontSize: 12, color: "#374151", margin: "4px 0 0", fontWeight: 600 }}>Great Balance</p>
              <div style={{ display: "flex", alignItems: "center", gap: 4, marginTop: 5, background: "#F0FDF4", borderRadius: 20, padding: "3px 10px" }}>
                <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="#10B981" strokeWidth="2.5" strokeLinecap="round"><polyline points="18 15 12 9 6 15"/></svg>
                <span style={{ fontSize: 11, color: "#10B981", fontWeight: 600 }}>6% vs last month</span>
              </div>
            </div>
          </div>
          {/* Mood slider */}
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <span style={{ fontSize: 20 }}>😟</span>
            <div style={{ flex: 1, height: 8, borderRadius: 8, position: "relative", background: "linear-gradient(to right, #FEE2E2, #FEF3C7 40%, #D1FAE5)" }}>
              <div style={{
                position: "absolute", top: "50%", left: "88%",
                transform: "translate(-50%, -50%)",
                width: 18, height: 18, borderRadius: "50%",
                background: "#10B981", border: "3px solid #FFF",
                boxShadow: "0 0 0 2px #10B981, 0 2px 8px rgba(16,185,129,0.4)",
              }} />
            </div>
            <span style={{ fontSize: 20 }}>😊</span>
          </div>
        </div>

      </div>
    </div>
  )
}
