"use client"

import { useRouter, usePathname } from "next/navigation"
import { useState, useTransition } from "react"
import { CalendarOff, CheckCircle2, XCircle, Clock, Loader2, Calendar } from "lucide-react"
import { updateLeaveStatus } from "@/lib/actions/leaves"

interface Leave {
  id: string
  from_date: string
  to_date: string
  reason: string
  status: string
  created_at: string
  users: { id: string; name: string; employee_id: string; phone: string | null } | null
}

const STATUS_TABS = [
  { key: "pending", label: "Pending", color: "#F59E0B", bg: "rgba(245,158,11,0.12)" },
  { key: "approved", label: "Approved", color: "#10B981", bg: "rgba(16,185,129,0.12)" },
  { key: "rejected", label: "Rejected", color: "#FF6B57", bg: "rgba(255,107,87,0.12)" },
  { key: "all", label: "All", color: "#6D5DF6", bg: "rgba(109,93,246,0.12)" },
]

function daysBetween(from: string, to: string) {
  const d1 = new Date(from), d2 = new Date(to)
  return Math.ceil((d2.getTime() - d1.getTime()) / 86400000) + 1
}

function formatDate(d: string) {
  return new Date(d).toLocaleDateString("en-US", { day: "numeric", month: "short" })
}

export default function LeavesClient({ leaves, statusFilter }: { leaves: Leave[]; statusFilter: string }) {
  const router = useRouter()
  const pathname = usePathname()
  const [isPending, startTransition] = useTransition()
  const [actionId, setActionId] = useState<string | null>(null)

  function navigate(status: string) {
    router.push(`${pathname}?status=${status}`)
  }

  async function handleAction(id: string, action: "approved" | "rejected") {
    setActionId(id + action)
    startTransition(async () => {
      await updateLeaveStatus(id, action)
      setActionId(null)
    })
  }

  const currentTab = STATUS_TABS.find((t) => t.key === statusFilter) ?? STATUS_TABS[0]

  return (
    <div className="p-8 max-w-[1400px]">
      <div className="mb-6">
        <h1 className="text-[32px] leading-tight" style={{ fontFamily: "var(--font-jakarta)", fontWeight: 800, color: "#E6EDF3" }}>
          Leave Requests
        </h1>
        <p className="text-sm mt-1 font-sans" style={{ color: "#6B7280" }}>Review and manage team leave requests.</p>
      </div>

      {/* Tabs */}
      <div className="flex gap-2 mb-6">
        {STATUS_TABS.map((tab) => (
          <button
            key={tab.key}
            onClick={() => navigate(tab.key)}
            className="px-4 py-2 rounded-xl text-[13px] font-semibold font-sans transition-all"
            style={statusFilter === tab.key
              ? { background: tab.bg, color: tab.color, border: `1px solid ${tab.color}30` }
              : { background: "rgba(255,255,255,0.03)", color: "#6B7280", border: "1px solid rgba(255,255,255,0.06)" }
            }
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* List */}
      {leaves.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-24 rounded-2xl" style={{ background: "rgba(255,255,255,0.02)", border: "1px solid rgba(255,255,255,0.06)" }}>
          <CalendarOff size={40} style={{ color: "rgba(255,255,255,0.1)" }} className="mb-3" />
          <p className="text-[14px] font-semibold font-sans" style={{ color: "#6B7280" }}>
            No {statusFilter === "all" ? "" : statusFilter} leave requests
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {leaves.map((leave) => {
            const user = Array.isArray(leave.users) ? leave.users[0] : leave.users
            const days = daysBetween(leave.from_date, leave.to_date)
            const isLoading = actionId?.startsWith(leave.id)

            return (
              <div key={leave.id} className="rounded-2xl p-5 flex items-center gap-4"
                style={{ background: "rgba(255,255,255,0.02)", border: "1px solid rgba(255,255,255,0.06)" }}>

                {/* Avatar */}
                <div className="w-10 h-10 rounded-full flex items-center justify-center flex-shrink-0"
                  style={{ background: "rgba(109,93,246,0.12)", border: "1.5px solid rgba(109,93,246,0.2)" }}>
                  <span className="text-[12px] font-bold" style={{ color: "#6D5DF6" }}>
                    {(user?.name ?? "?")[0].toUpperCase()}
                  </span>
                </div>

                {/* Info */}
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-0.5">
                    <p className="text-[14px] font-bold font-sans" style={{ color: "#E6EDF3" }}>{user?.name ?? "Unknown"}</p>
                    <span className="text-[11px] font-sans" style={{ color: "#6B7280" }}>#{user?.employee_id}</span>
                  </div>
                  <div className="flex items-center gap-2 text-[12px] font-sans" style={{ color: "#9CA3AF" }}>
                    <Calendar size={12} style={{ color: "#6B7280" }} />
                    <span>{formatDate(leave.from_date)} — {formatDate(leave.to_date)}</span>
                    <span className="px-2 py-0.5 rounded-full text-[11px] font-semibold" style={{ background: "rgba(109,93,246,0.1)", color: "#6D5DF6" }}>{days}d</span>
                  </div>
                  <p className="text-[12px] font-sans mt-1 truncate" style={{ color: "#6B7280" }}>{leave.reason}</p>
                </div>

                {/* Status / Actions */}
                <div className="flex items-center gap-2 flex-shrink-0">
                  {leave.status === "pending" ? (
                    <>
                      <button
                        onClick={() => handleAction(leave.id, "approved")}
                        disabled={isPending}
                        className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[12px] font-semibold font-sans transition-all"
                        style={{ background: "rgba(16,185,129,0.12)", color: "#10B981", border: "1px solid rgba(16,185,129,0.2)" }}
                      >
                        {isLoading && actionId === leave.id + "approved" ? <Loader2 size={12} className="animate-spin" /> : <CheckCircle2 size={12} />}
                        Approve
                      </button>
                      <button
                        onClick={() => handleAction(leave.id, "rejected")}
                        disabled={isPending}
                        className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[12px] font-semibold font-sans transition-all"
                        style={{ background: "rgba(255,107,87,0.12)", color: "#FF6B57", border: "1px solid rgba(255,107,87,0.2)" }}
                      >
                        {isLoading && actionId === leave.id + "rejected" ? <Loader2 size={12} className="animate-spin" /> : <XCircle size={12} />}
                        Reject
                      </button>
                    </>
                  ) : (
                    <span className="px-3 py-1.5 rounded-lg text-[12px] font-semibold font-sans"
                      style={leave.status === "approved"
                        ? { background: "rgba(16,185,129,0.12)", color: "#10B981" }
                        : { background: "rgba(255,107,87,0.12)", color: "#FF6B57" }
                      }>
                      {leave.status === "approved" ? "✓ Approved" : "✗ Rejected"}
                    </span>
                  )}
                </div>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
