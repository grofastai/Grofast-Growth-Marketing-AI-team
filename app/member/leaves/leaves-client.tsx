"use client"

import { useActionState, useState } from "react"
import { CalendarOff, Plus, X, Loader2, Calendar } from "lucide-react"
import { submitLeaveRequest } from "@/lib/actions/leaves"

interface Leave {
  id: string
  from_date: string
  to_date: string
  reason: string
  status: string
  created_at: string
}

const STATUS_COLORS = {
  pending: { color: "#F59E0B", bg: "rgba(245,158,11,0.12)", label: "Pending" },
  approved: { color: "#10B981", bg: "rgba(16,185,129,0.12)", label: "Approved" },
  rejected: { color: "#FF6B57", bg: "rgba(255,107,87,0.12)", label: "Rejected" },
}

function daysBetween(from: string, to: string) {
  return Math.ceil((new Date(to).getTime() - new Date(from).getTime()) / 86400000) + 1
}

function formatDate(d: string) {
  return new Date(d).toLocaleDateString("en-US", { day: "numeric", month: "short", year: "numeric" })
}

export default function MemberLeavesClient({ leaves }: { leaves: Leave[] }) {
  const [showForm, setShowForm] = useState(false)
  const [state, action, formPending] = useActionState(submitLeaveRequest, null)

  if (state && 'success' in state && state.success && showForm) {
    setShowForm(false)
  }

  return (
    <div className="p-8 max-w-[1100px]">
      <div className="flex items-start justify-between mb-6">
        <div>
          <h1 className="text-[32px] leading-tight" style={{ fontFamily: "var(--font-jakarta)", fontWeight: 800, color: "#FFFFFF" }}>
            Leave Requests
          </h1>
          <p className="text-sm mt-1 font-sans" style={{ color: "rgba(255,255,255,0.55)" }}>Apply for leave and track your requests.</p>
        </div>
        <button onClick={() => setShowForm(true)}
          className="flex items-center gap-2 px-4 py-2.5 rounded-xl text-[13px] font-semibold font-sans text-white"
          style={{ background: "linear-gradient(135deg, #FF6B57, #E85A45)", boxShadow: "0 4px 16px rgba(255,107,87,0.25)" }}>
          <Plus size={15} /> Apply Leave
        </button>
      </div>

      {/* Apply Leave Modal */}
      {showForm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center" style={{ background: "rgba(0,0,0,0.7)", backdropFilter: "blur(4px)" }}>
          <div className="w-full max-w-md rounded-2xl p-6" style={{ background: "#111827", border: "1px solid rgba(255,255,255,0.08)" }}>
            <div className="flex items-center justify-between mb-5">
              <h2 className="text-[18px] font-bold" style={{ fontFamily: "var(--font-jakarta)", color: "#FFFFFF" }}>Apply for Leave</h2>
              <button onClick={() => setShowForm(false)}><X size={18} style={{ color: "rgba(255,255,255,0.55)" }} /></button>
            </div>
            <form action={action} className="space-y-4">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-[12px] font-semibold uppercase tracking-wider font-sans mb-1.5 block" style={{ color: "rgba(255,255,255,0.55)" }}>From Date *</label>
                  <input name="from_date" type="date" required
                    className="w-full px-3 py-2.5 rounded-xl text-[13px] font-sans outline-none"
                    style={{ background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.08)", color: "#FFFFFF", colorScheme: "dark" }} />
                </div>
                <div>
                  <label className="text-[12px] font-semibold uppercase tracking-wider font-sans mb-1.5 block" style={{ color: "rgba(255,255,255,0.55)" }}>To Date *</label>
                  <input name="to_date" type="date" required
                    className="w-full px-3 py-2.5 rounded-xl text-[13px] font-sans outline-none"
                    style={{ background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.08)", color: "#FFFFFF", colorScheme: "dark" }} />
                </div>
              </div>
              <div>
                <label className="text-[12px] font-semibold uppercase tracking-wider font-sans mb-1.5 block" style={{ color: "rgba(255,255,255,0.55)" }}>Reason *</label>
                <textarea name="reason" required rows={3} placeholder="Explain the reason for your leave..."
                  className="w-full px-3 py-2.5 rounded-xl text-[13px] font-sans outline-none resize-none"
                  style={{ background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.08)", color: "#FFFFFF" }} />
              </div>

              {state && 'error' in state && state.error && (
                <p className="text-[12px] font-sans" style={{ color: "#FF6B57" }}>{state.error}</p>
              )}

              <div className="flex gap-3 pt-2">
                <button type="button" onClick={() => setShowForm(false)}
                  className="flex-1 py-2.5 rounded-xl text-[13px] font-semibold font-sans"
                  style={{ background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.08)", color: "rgba(255,255,255,0.6)" }}>
                  Cancel
                </button>
                <button type="submit" disabled={formPending}
                  className="flex-1 py-2.5 rounded-xl text-[13px] font-semibold font-sans text-white flex items-center justify-center gap-2"
                  style={{ background: "linear-gradient(135deg, #FF6B57, #E85A45)" }}>
                  {formPending && <Loader2 size={14} className="animate-spin" />}
                  Submit Request
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Leave List */}
      {leaves.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-24 rounded-2xl"
          style={{ background: "rgba(255,255,255,0.02)", border: "1px solid rgba(255,255,255,0.06)" }}>
          <CalendarOff size={40} style={{ color: "rgba(255,255,255,0.1)" }} className="mb-3" />
          <p className="text-[14px] font-semibold font-sans" style={{ color: "rgba(255,255,255,0.55)" }}>No leave requests</p>
          <p className="text-[12px] font-sans mt-1" style={{ color: "rgba(255,255,255,0.38)" }}>Apply for leave using the button above.</p>
        </div>
      ) : (
        <div className="space-y-3">
          {leaves.map((leave) => {
            const sc = STATUS_COLORS[leave.status as keyof typeof STATUS_COLORS] ?? STATUS_COLORS.pending
            const days = daysBetween(leave.from_date, leave.to_date)
            return (
              <div key={leave.id} className="rounded-2xl p-5 flex items-center gap-4"
                style={{ background: "rgba(255,255,255,0.02)", border: "1px solid rgba(255,255,255,0.06)" }}>
                <div className="w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0"
                  style={{ background: sc.bg }}>
                  <Calendar size={18} style={{ color: sc.color }} />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-0.5">
                    <p className="text-[14px] font-bold font-sans" style={{ color: "#FFFFFF" }}>
                      {formatDate(leave.from_date)} — {formatDate(leave.to_date)}
                    </p>
                    <span className="text-[11px] font-semibold px-2 py-0.5 rounded-full" style={{ background: "rgba(109,93,246,0.1)", color: "#6D5DF6" }}>
                      {days}d
                    </span>
                  </div>
                  <p className="text-[12px] font-sans truncate" style={{ color: "rgba(255,255,255,0.55)" }}>{leave.reason}</p>
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
