"use client"

import { useState, useTransition } from "react"
import { useRouter } from "next/navigation"
import { reviewExpense } from "@/lib/actions/expenses"
import { Receipt, CheckCircle2, XCircle, Clock, IndianRupee, Loader2, Filter } from "lucide-react"

type Expense = {
  id: string
  amount: number
  category: string
  description: string
  date: string
  status: "pending" | "approved" | "rejected"
  notes: string | null
  review_notes: string | null
  created_at: string
  users: { name: string; employee_id: string } | null
}

const STATUS_STYLE: Record<string, { label: string; color: string; bg: string }> = {
  pending:  { label: "Pending",  color: "#F59E0B", bg: "rgba(245,158,11,0.1)"  },
  approved: { label: "Approved", color: "#16A34A", bg: "rgba(22,163,74,0.1)"   },
  rejected: { label: "Rejected", color: "#de1a1a", bg: "rgba(222,26,26,0.1)"   },
}

function formatDate(s: string) {
  return new Date(s + "T12:00:00").toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" })
}

export default function ExpensesClient({ expenses }: { expenses: Expense[] }) {
  const [tab, setTab]            = useState<"pending" | "all">("pending")
  const [reviewId, setReviewId]  = useState<string | null>(null)
  const [reviewNote, setNote]    = useState("")
  const [isPending, start]       = useTransition()
  const router                   = useRouter()

  const pending  = expenses.filter(e => e.status === "pending")
  const shown    = tab === "pending" ? pending : expenses

  const totalPending  = pending.reduce((s, e) => s + e.amount, 0)
  const totalApproved = expenses.filter(e => e.status === "approved").reduce((s, e) => s + e.amount, 0)

  function approve(id: string) {
    start(async () => { await reviewExpense(id, "approved"); router.refresh() })
  }

  function reject(id: string) {
    start(async () => { await reviewExpense(id, "rejected", reviewNote || undefined); setReviewId(null); setNote(""); router.refresh() })
  }

  return (
    <div className="p-4 md:p-6 xl:p-8 max-w-[1200px]">
      <div className="mb-6">
        <h1 className="gradient-heading text-[30px] font-black leading-tight" style={{ fontFamily: "var(--font-jakarta)" }}>
          Expense Claims
        </h1>
        <p className="text-sm mt-1" style={{ color: "#6B7280" }}>Review and approve team expense submissions</p>
      </div>

      {/* Stats */}
      <div className="flex flex-wrap gap-2 md:gap-3 mb-5 md:mb-6">
        {[
          { label: "Pending Review", value: pending.length, color: "#F59E0B", bg: "rgba(245,158,11,0.06)", border: "rgba(245,158,11,0.15)" },
          { label: "Pending Amount", value: `₹${totalPending.toLocaleString("en-IN")}`, color: "#F59E0B", bg: "rgba(245,158,11,0.06)", border: "rgba(245,158,11,0.15)" },
          { label: "Approved Total", value: `₹${totalApproved.toLocaleString("en-IN")}`, color: "#16A34A", bg: "rgba(22,163,74,0.06)", border: "rgba(22,163,74,0.15)" },
          { label: "All Claims", value: expenses.length, color: "#111111", bg: "#FFFFFF", border: "#E5E7EB" },
        ].map(s => (
          <div key={s.label} className="flex items-center gap-3 px-4 py-2.5 rounded-xl"
            style={{ background: s.bg, border: `1px solid ${s.border}` }}>
            <span className="text-[17px] font-black" style={{ fontFamily: "var(--font-jakarta)", color: s.color }}>{s.value}</span>
            <span className="text-[11px]" style={{ color: "#6B7280" }}>{s.label}</span>
          </div>
        ))}
      </div>

      {/* Tabs */}
      <div className="flex gap-1 p-1 rounded-xl mb-5 w-fit"
        style={{ background: "#F9FAFB", border: "1px solid #E5E7EB" }}>
        {([["pending", `Pending (${pending.length})`], ["all", "All Claims"]] as const).map(([v, label]) => (
          <button key={v} onClick={() => setTab(v)}
            className="px-4 py-2 rounded-lg text-[13px] font-semibold transition-all"
            style={tab === v
              ? { background: "#FFFFFF", color: "#111111", boxShadow: "0 1px 3px rgba(0,0,0,0.08)" }
              : { color: "#6B7280" }}>
            {label}
          </button>
        ))}
      </div>

      {shown.length === 0 ? (
        <div className="flex flex-col items-center py-20 rounded-2xl"
          style={{ background: "rgba(0,0,0,0.02)", border: "1px solid #E5E7EB" }}>
          <Receipt size={32} style={{ color: "#E5E7EB" }} className="mb-3" />
          <p className="text-[13px] font-semibold" style={{ color: "#6B7280" }}>
            {tab === "pending" ? "No pending claims" : "No claims found"}
          </p>
        </div>
      ) : (
        <div className="space-y-2">
          {shown.map(e => {
            const user = Array.isArray(e.users) ? e.users[0] : e.users
            const st   = STATUS_STYLE[e.status] ?? STATUS_STYLE.pending
            return (
              <div key={e.id} className="rounded-xl p-5"
                style={{ background: "#FFFFFF", border: "1px solid #E5E7EB" }}>
                <div className="flex items-start gap-4">
                  <div className="w-10 h-10 rounded-full flex items-center justify-center flex-shrink-0 text-[11px] font-bold"
                    style={{ background: "rgba(222,26,26,0.08)", color: "#de1a1a" }}>
                    {user?.name?.split(" ").map((n: string) => n[0]).join("").slice(0, 2).toUpperCase() ?? "?"}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-start justify-between gap-4">
                      <div>
                        <div className="flex items-center gap-2">
                          <p className="text-[14px] font-bold" style={{ color: "#111111" }}>{user?.name ?? "Unknown"}</p>
                          <span className="text-[11px]" style={{ color: "#6B7280" }}>#{user?.employee_id}</span>
                        </div>
                        <p className="text-[12px] mt-0.5" style={{ color: "#6B7280" }}>
                          {e.description} · <span style={{ color: "#6B7280" }}>{e.category}</span> · {formatDate(e.date)}
                        </p>
                        {e.notes && <p className="text-[12px] mt-1" style={{ color: "#6B7280" }}>{e.notes}</p>}
                        {e.review_notes && (
                          <p className="text-[12px] mt-1.5 italic" style={{ color: "#6B7280" }}>
                            Note: {e.review_notes}
                          </p>
                        )}
                      </div>
                      <div className="text-right flex-shrink-0">
                        <p className="text-[18px] font-black" style={{ fontFamily: "var(--font-jakarta)", color: "#111111" }}>
                          ₹{e.amount.toLocaleString("en-IN")}
                        </p>
                        <span className="text-[10px] font-bold px-2 py-0.5 rounded-full"
                          style={{ background: st.bg, color: st.color }}>{st.label}</span>
                      </div>
                    </div>

                    {e.status === "pending" && (
                      <div className="flex items-center gap-2 mt-3">
                        <button onClick={() => approve(e.id)} disabled={isPending}
                          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[12px] font-bold transition-all disabled:opacity-50"
                          style={{ background: "rgba(22,163,74,0.1)", color: "#16A34A", border: "1px solid rgba(22,163,74,0.2)" }}>
                          <CheckCircle2 size={12} /> Approve
                        </button>
                        {reviewId === e.id ? (
                          <div className="flex items-center gap-2 flex-1">
                            <input placeholder="Rejection note (optional)…"
                              value={reviewNote} onChange={ev => setNote(ev.target.value)}
                              className="flex-1 text-[12px] px-3 py-1.5 rounded-lg outline-none"
                              style={{ background: "#F9FAFB", border: "1px solid #E5E7EB", color: "#111111" }} />
                            <button onClick={() => reject(e.id)} disabled={isPending}
                              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[12px] font-bold"
                              style={{ background: "rgba(222,26,26,0.1)", color: "#de1a1a", border: "1px solid rgba(222,26,26,0.2)" }}>
                              {isPending ? <Loader2 size={11} className="animate-spin" /> : <XCircle size={12} />} Confirm
                            </button>
                            <button onClick={() => setReviewId(null)} className="text-[12px]" style={{ color: "#6B7280" }}>Cancel</button>
                          </div>
                        ) : (
                          <button onClick={() => setReviewId(e.id)}
                            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[12px] font-bold"
                            style={{ background: "rgba(222,26,26,0.06)", color: "#de1a1a", border: "1px solid rgba(222,26,26,0.15)" }}>
                            <XCircle size={12} /> Reject
                          </button>
                        )}
                      </div>
                    )}
                  </div>
                </div>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
