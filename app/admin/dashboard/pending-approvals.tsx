"use client"

import { useState, useTransition } from "react"
import { useRouter } from "next/navigation"
import { CalendarCheck, CheckCircle2, Loader2, Check, X, ArrowRight } from "lucide-react"
import Link from "next/link"
import { updateLeaveStatus } from "@/lib/actions/leaves"

type LeaveRow = {
  id: string
  from_date: string
  to_date: string
  reason: string
  users: { name: string; employee_id: string } | null
}

export default function PendingApprovalsCard({ leaves: initialLeaves }: { leaves: LeaveRow[] }) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()
  const [processingId, setProcessingId] = useState<string | null>(null)
  const [leaves, setLeaves] = useState(initialLeaves)

  function handleAction(leaveId: string, status: "approved" | "rejected") {
    setProcessingId(leaveId)
    // Optimistically remove from list immediately
    setLeaves(prev => prev.filter(l => l.id !== leaveId))
    startTransition(async () => {
      await updateLeaveStatus(leaveId, status)
      setProcessingId(null)
      router.refresh()
    })
  }

  const fmt = (d: string) =>
    new Date(d).toLocaleDateString("en-IN", { day: "numeric", month: "short" })

  return (
    <div className="rounded-2xl p-5 h-full" style={{ background: "#FFFFFF", border: "1px solid #E5E7EB", boxShadow: "0 1px 2px rgba(0,0,0,0.04), 0 4px 12px rgba(0,0,0,0.04)" }}>
      <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
        <div className="flex items-center gap-2">
          <div className="w-7 h-7 rounded-lg flex items-center justify-center" style={{ background: "rgba(222,26,26,0.1)" }}>
            <CalendarCheck size={14} style={{ color: "#de1a1a" }} />
          </div>
          <h3 className="text-[14px] font-bold" style={{ color: "#111827" }}>Pending Approvals</h3>
          {leaves.length > 0 && (
            <span className="text-[11px] font-semibold px-2 py-0.5 rounded-full"
              style={{ background: "rgba(222,26,26,0.1)", color: "#de1a1a" }}>
              {leaves.length}
            </span>
          )}
        </div>
        <Link href="/admin/leaves" className="text-[12px] font-semibold flex items-center gap-1 transition-opacity hover:opacity-70"
          style={{ color: "#de1a1a" }}>
          Manage <ArrowRight size={12} />
        </Link>
      </div>

      {leaves.length === 0 ? (
        <div className="flex flex-col items-center py-10 gap-2">
          <CheckCircle2 size={28} style={{ color: "#E5E7EB" }} />
          <p className="text-[13px]" style={{ color: "#1E3A5F" }}>No pending leave requests</p>
        </div>
      ) : (
        <div className="space-y-2">
          {leaves.map((leave) => {
            const member = Array.isArray(leave.users) ? leave.users[0] : leave.users
            const isProcessing = processingId === leave.id && isPending
            const shortReason = leave.reason.length > 45
              ? leave.reason.slice(0, 45) + "…"
              : leave.reason

            return (
              <div key={leave.id}
                className="p-3 rounded-xl"
                style={{ background: "#F9FAFB", border: "1px solid #F3F4F6" }}>
                <div className="flex items-center gap-3">
                  <div className="w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0 text-[11px] font-bold"
                    style={{ background: "rgba(222,26,26,0.1)", color: "#de1a1a" }}>
                    {(member?.name ?? "?")[0].toUpperCase()}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-[13px] font-semibold leading-tight" style={{ color: "#111827" }}>
                      {member?.name ?? "—"}
                      <span className="ml-1.5 text-[11px] font-medium" style={{ color: "#1E3A5F" }}>
                        #{member?.employee_id}
                      </span>
                    </p>
                    <p className="text-[11px] mt-0.5 truncate" style={{ color: "#1E3A5F" }}>
                      {fmt(leave.from_date)} → {fmt(leave.to_date)} · {shortReason}
                    </p>
                  </div>
                </div>
                <div className="flex items-center justify-end gap-1.5 mt-2.5">
                  <button
                    onClick={() => handleAction(leave.id, "approved")}
                    disabled={isPending}
                    className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-[11px] font-bold disabled:opacity-50 transition-all hover:scale-[1.02]"
                    style={{ background: "rgba(22,163,74,0.1)", color: "#16A34A", border: "1px solid rgba(22,163,74,0.25)" }}>
                    {isProcessing ? <Loader2 size={10} className="animate-spin" /> : <Check size={10} />}
                    Approve
                  </button>
                  <button
                    onClick={() => handleAction(leave.id, "rejected")}
                    disabled={isPending}
                    className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-[11px] font-bold disabled:opacity-50 transition-all hover:scale-[1.02]"
                    style={{ background: "rgba(222,26,26,0.07)", color: "#de1a1a", border: "1px solid rgba(222,26,26,0.2)" }}>
                    {isProcessing ? <Loader2 size={10} className="animate-spin" /> : <X size={10} />}
                    Reject
                  </button>
                </div>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
