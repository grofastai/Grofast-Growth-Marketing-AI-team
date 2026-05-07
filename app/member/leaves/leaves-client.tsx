"use client"

import { useActionState, useState } from "react"
import { CalendarOff, Plus, X, Loader2, Calendar, Clock } from "lucide-react"
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

const STATUS_COLORS = {
  pending:  { color: "#F59E0B", bg: "rgba(245,158,11,0.12)",   label: "Pending"  },
  approved: { color: "#10B981", bg: "rgba(16,185,129,0.12)",  label: "Approved" },
  rejected: { color: "#de1a1a", bg: "rgba(255,107,87,0.12)",  label: "Rejected" },
}

const LEAVE_TYPE_LABELS: Record<string, string> = {
  full_day:   "Full Day",
  half_day:   "Half Day",
  permission: "Permission",
}

function daysBetween(from: string, to: string) {
  return Math.ceil((new Date(to).getTime() - new Date(from).getTime()) / 86400000) + 1
}

function formatDate(d: string) {
  return new Date(d).toLocaleDateString("en-US", { day: "numeric", month: "short", year: "numeric" })
}

const FIELD: React.CSSProperties = {
  background: "rgba(255,255,255,0.06)",
  border: "1px solid rgba(255,255,255,0.1)",
  color: "#111111",
  borderRadius: "10px",
  padding: "10px 14px",
  fontSize: "13px",
  outline: "none",
  width: "100%",
}

export default function MemberLeavesClient({ leaves }: { leaves: Leave[] }) {
  const [showForm, setShowForm]       = useState(false)
  const [leaveType, setLeaveType]     = useState<LeaveType>("full_day")
  const [halfPeriod, setHalfPeriod]   = useState<"morning" | "afternoon">("morning")
  const [state, action, formPending]  = useActionState(submitLeaveRequest, null)

  if (state && "success" in state && state.success && showForm) {
    setShowForm(false)
  }

  function handleClose() {
    setShowForm(false)
    setLeaveType("full_day")
    setHalfPeriod("morning")
  }

  return (
    <div className="p-8 max-w-[1100px]">
      <div className="flex items-start justify-between mb-6">
        <div>
          <h1 className="gradient-heading text-[32px] leading-tight"
            style={{ fontFamily: "var(--font-jakarta)", fontWeight: 800 }}>
            Leave Requests
          </h1>
          <p className="text-sm mt-1 font-sans" style={{ color: "#6B7280" }}>
            Apply for leave and track your requests.
          </p>
        </div>
        <button onClick={() => setShowForm(true)}
          className="flex items-center gap-2 px-4 py-2.5 rounded-xl text-[13px] font-semibold font-sans text-white"
          style={{ background: "linear-gradient(135deg, #de1a1a, #E85A45)", boxShadow: "0 4px 16px rgba(255,107,87,0.25)" }}>
          <Plus size={15} /> Apply Leave
        </button>
      </div>

      {/* ── Modal ── */}
      {showForm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center"
          style={{ background: "rgba(0,0,0,0.7)", backdropFilter: "blur(4px)" }}>
          <div className="w-full max-w-md rounded-2xl p-6"
            style={{ background: "#111827", border: "1px solid rgba(255,255,255,0.08)" }}>

            <div className="flex items-center justify-between mb-5">
              <h2 className="text-[18px] font-bold" style={{ color: "#FFFFFF" }}>Apply for Leave</h2>
              <button onClick={handleClose}><X size={18} style={{ color: "#6B7280" }} /></button>
            </div>

            <form action={action} className="space-y-4">
              {/* Hidden leave type */}
              <input type="hidden" name="leave_type" value={leaveType} />
              {leaveType === "half_day" && (
                <input type="hidden" name="half_day_period" value={halfPeriod} />
              )}

              {/* Leave Type Selector */}
              <div>
                <label className="text-[11px] font-bold uppercase tracking-[0.16em] mb-2 block"
                  style={{ color: "#6B7280" }}>Leave Type *</label>
                <div className="grid grid-cols-3 gap-2">
                  {([
                    { key: "full_day",   label: "Full Day",    icon: Calendar },
                    { key: "half_day",   label: "Half Day",    icon: Calendar },
                    { key: "permission", label: "Permission",  icon: Clock    },
                  ] as { key: LeaveType; label: string; icon: React.ElementType }[]).map(({ key, label, icon: Icon }) => (
                    <button
                      key={key}
                      type="button"
                      onClick={() => setLeaveType(key)}
                      className="flex flex-col items-center gap-1.5 py-3 rounded-xl text-[12px] font-bold transition-all"
                      style={leaveType === key
                        ? { background: "#de1a1a", color: "#FFFFFF", border: "2px solid #de1a1a" }
                        : { background: "rgba(255,255,255,0.06)", color: "#83858c", border: "1px solid rgba(255,255,255,0.1)" }
                      }>
                      <Icon size={15} />
                      {label}
                    </button>
                  ))}
                </div>
              </div>

              {/* Date fields */}
              {leaveType === "full_day" && (
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="text-[11px] font-bold uppercase tracking-[0.16em] mb-1.5 block"
                      style={{ color: "#6B7280" }}>From Date *</label>
                    <input name="from_date" type="date" required style={FIELD} />
                  </div>
                  <div>
                    <label className="text-[11px] font-bold uppercase tracking-[0.16em] mb-1.5 block"
                      style={{ color: "#6B7280" }}>To Date *</label>
                    <input name="to_date" type="date" required style={FIELD} />
                  </div>
                </div>
              )}

              {leaveType === "half_day" && (
                <>
                  <div>
                    <label className="text-[11px] font-bold uppercase tracking-[0.16em] mb-1.5 block"
                      style={{ color: "#6B7280" }}>Date *</label>
                    <input name="from_date" type="date" required style={FIELD} />
                  </div>
                  <div>
                    <label className="text-[11px] font-bold uppercase tracking-[0.16em] mb-2 block"
                      style={{ color: "#6B7280" }}>Which Half? *</label>
                    <div className="grid grid-cols-2 gap-2">
                      {(["morning", "afternoon"] as const).map((p) => (
                        <button key={p} type="button" onClick={() => setHalfPeriod(p)}
                          className="py-2.5 rounded-xl text-[12px] font-bold capitalize transition-all"
                          style={halfPeriod === p
                            ? { background: "#de1a1a", color: "#FFFFFF" }
                            : { background: "rgba(255,255,255,0.06)", color: "#83858c", border: "1px solid rgba(255,255,255,0.1)" }
                          }>
                          {p}
                        </button>
                      ))}
                    </div>
                  </div>
                </>
              )}

              {leaveType === "permission" && (
                <>
                  <div>
                    <label className="text-[11px] font-bold uppercase tracking-[0.16em] mb-1.5 block"
                      style={{ color: "#6B7280" }}>Date *</label>
                    <input name="from_date" type="date" required style={FIELD} />
                  </div>
                  <div>
                    <label className="text-[11px] font-bold uppercase tracking-[0.16em] mb-1.5 block"
                      style={{ color: "#6B7280" }}>Permission Hours *</label>
                    <input name="permission_hours" type="number" min="0.5" max="8" step="0.5" required
                      placeholder="e.g. 2" style={FIELD} />
                    <p className="text-[11px] mt-1" style={{ color: "#6B7280" }}>
                      Enter number of hours (0.5 – 8 hrs)
                    </p>
                  </div>
                </>
              )}

              {/* Reason */}
              <div>
                <label className="text-[11px] font-bold uppercase tracking-[0.16em] mb-1.5 block"
                  style={{ color: "#6B7280" }}>Reason *</label>
                <textarea name="reason" required rows={3}
                  placeholder="Explain the reason…"
                  className="resize-none"
                  style={FIELD} />
              </div>

              {state && "error" in state && state.error && (
                <p className="text-[12px] font-sans" style={{ color: "#de1a1a" }}>{state.error}</p>
              )}

              <div className="flex gap-3 pt-1">
                <button type="button" onClick={handleClose}
                  className="flex-1 py-2.5 rounded-xl text-[13px] font-semibold"
                  style={{ background: "rgba(255,255,255,0.06)", color: "#83858c", border: "1px solid rgba(255,255,255,0.1)" }}>
                  Cancel
                </button>
                <button type="submit" disabled={formPending}
                  className="flex-1 py-2.5 rounded-xl text-[13px] font-semibold text-white flex items-center justify-center gap-2"
                  style={{ background: "linear-gradient(135deg, #de1a1a, #E85A45)" }}>
                  {formPending && <Loader2 size={14} className="animate-spin" />}
                  Submit Request
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ── Leave List ── */}
      {leaves.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-24 rounded-2xl"
          style={{ background: "#F9FAFB", border: "1px solid #F0F0F0" }}>
          <CalendarOff size={40} style={{ color: "rgba(0,0,0,0.06)" }} className="mb-3" />
          <p className="text-[14px] font-semibold font-sans" style={{ color: "#6B7280" }}>No leave requests</p>
          <p className="text-[12px] font-sans mt-1" style={{ color: "#83858c" }}>Apply for leave using the button above.</p>
        </div>
      ) : (
        <div className="space-y-3">
          {leaves.map((leave) => {
            const sc   = STATUS_COLORS[leave.status as keyof typeof STATUS_COLORS] ?? STATUS_COLORS.pending
            const type = leave.leave_type ?? "full_day"
            const isPermission = type === "permission"
            const isHalfDay    = type === "half_day"
            const days = isPermission || isHalfDay ? null : daysBetween(leave.from_date, leave.to_date)

            return (
              <div key={leave.id} className="rounded-2xl p-5 flex items-center gap-4"
                style={{ background: "#F9FAFB", border: "1px solid #F0F0F0" }}>
                <div className="w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0"
                  style={{ background: sc.bg }}>
                  {isPermission
                    ? <Clock size={18} style={{ color: sc.color }} />
                    : <Calendar size={18} style={{ color: sc.color }} />
                  }
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap mb-0.5">
                    <p className="text-[14px] font-bold font-sans" style={{ color: "#111111" }}>
                      {isPermission
                        ? formatDate(leave.from_date)
                        : `${formatDate(leave.from_date)}${!isHalfDay ? ` — ${formatDate(leave.to_date)}` : ""}`
                      }
                    </p>
                    {/* Type badge */}
                    <span className="text-[10px] font-bold px-2 py-0.5 rounded-full"
                      style={{ background: "rgba(99,102,241,0.1)", color: "#6366F1" }}>
                      {LEAVE_TYPE_LABELS[type] ?? type}
                      {isHalfDay && leave.half_day_period ? ` – ${leave.half_day_period}` : ""}
                      {isPermission && leave.permission_hours ? ` – ${leave.permission_hours}h` : ""}
                    </span>
                    {days && (
                      <span className="text-[11px] font-semibold px-2 py-0.5 rounded-full"
                        style={{ background: "rgba(222,26,26,0.1)", color: "#de1a1a" }}>
                        {days}d
                      </span>
                    )}
                  </div>
                  <p className="text-[12px] font-sans truncate" style={{ color: "#6B7280" }}>{leave.reason}</p>
                </div>
                <span className="text-[12px] font-semibold font-sans px-3 py-1.5 rounded-lg flex-shrink-0"
                  style={{ background: sc.bg, color: sc.color }}>
                  {sc.label}
                </span>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
