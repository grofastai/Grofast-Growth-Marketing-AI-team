"use client"

import { useState, useTransition } from "react"
import { useRouter } from "next/navigation"
import { submitExpense } from "@/lib/actions/expenses"
import { Receipt, Plus, CheckCircle2, Clock, XCircle, Loader2, X, IndianRupee } from "lucide-react"

const CATEGORIES = ["Travel", "Food", "Equipment", "Software", "Office Supplies", "Other"]

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
}

const STATUS_STYLE: Record<string, { label: string; color: string; bg: string; icon: typeof Clock }> = {
  pending:  { label: "Pending",  color: "#F59E0B", bg: "rgba(245,158,11,0.1)",  icon: Clock         },
  approved: { label: "Approved", color: "#16A34A", bg: "rgba(22,163,74,0.1)",   icon: CheckCircle2  },
  rejected: { label: "Rejected", color: "#de1a1a", bg: "rgba(222,26,26,0.1)",   icon: XCircle       },
}

const FIELD: React.CSSProperties = {
  background: "#F9FAFB", border: "1px solid #E5E7EB",
  color: "#111111", width: "100%", borderRadius: "10px",
  padding: "10px 13px", fontSize: "13px", outline: "none", fontFamily: "inherit",
}

function formatDate(s: string) {
  return new Date(s + "T12:00:00").toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" })
}

export default function MemberExpensesClient({ expenses }: { expenses: Expense[] }) {
  const [showForm, setShowForm]  = useState(false)
  const [form, setForm]          = useState({
    amount: "", category: "", description: "",
    date: new Date().toISOString().split("T")[0], notes: "",
  })
  const [error, setError]        = useState("")
  const [isPending, start]       = useTransition()
  const router                   = useRouter()

  const set = (f: string) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) =>
    setForm(p => ({ ...p, [f]: e.target.value }))

  function handleSubmit() {
    setError("")
    start(async () => {
      const res = await submitExpense({
        amount: parseFloat(form.amount), category: form.category,
        description: form.description, date: form.date,
        notes: form.notes || undefined,
      })
      if (res.success) {
        setShowForm(false)
        setForm({ amount: "", category: "", description: "", date: new Date().toISOString().split("T")[0], notes: "" })
        router.refresh()
      } else {
        setError(res.error ?? "Failed to submit")
      }
    })
  }

  const total     = expenses.reduce((s, e) => s + e.amount, 0)
  const pending   = expenses.filter(e => e.status === "pending").length
  const approved  = expenses.filter(e => e.status === "approved")
  const approvedTotal = approved.reduce((s, e) => s + e.amount, 0)

  return (
    <div className="p-4 md:p-6 xl:p-8 max-w-[1400px]">
      {/* Header */}
      <div className="flex items-start justify-between mb-7">
        <div>
          <h1 className="gradient-heading text-[30px] font-black leading-tight" style={{ fontFamily: "var(--font-jakarta)" }}>
            Expense Claims
          </h1>
          <p className="text-sm mt-1" style={{ color: "#6B7280" }}>Submit and track your expense reimbursements</p>
        </div>
        <button onClick={() => setShowForm(true)}
          className="flex items-center gap-2 px-4 py-2.5 rounded-xl text-[13px] font-bold"
          style={{ background: "linear-gradient(135deg, #de1a1a, #7F1D1D)", color: "#FFFFFF" }}>
          <Plus size={14} /> New Claim
        </button>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3 mb-6">
        {[
          { label: "Total Claims",    value: expenses.length,                              color: "#111111" },
          { label: "Pending Review",  value: pending,                                      color: "#F59E0B" },
          { label: "Approved Amount", value: `₹${approvedTotal.toLocaleString("en-IN")}`, color: "#16A34A" },
        ].map(s => (
          <div key={s.label} className="rounded-xl p-4" style={{ background: "#FFFFFF", border: "1px solid #E5E7EB" }}>
            <p className="text-[22px] font-black leading-none mb-1"
              style={{ fontFamily: "var(--font-jakarta)", color: s.color }}>{s.value}</p>
            <p className="text-[11px] font-medium" style={{ color: "#6B7280" }}>{s.label}</p>
          </div>
        ))}
      </div>

      {/* List */}
      {expenses.length === 0 ? (
        <div className="flex flex-col items-center py-20 rounded-2xl"
          style={{ background: "rgba(0,0,0,0.02)", border: "1px solid #E5E7EB" }}>
          <Receipt size={32} style={{ color: "#E5E7EB" }} className="mb-3" />
          <p className="text-[13px] font-semibold" style={{ color: "#6B7280" }}>No claims yet</p>
          <p className="text-[12px] mt-1" style={{ color: "#D1D5DB" }}>Submit your first expense claim above.</p>
        </div>
      ) : (
        <div className="space-y-2">
          {expenses.map(e => {
            const st = STATUS_STYLE[e.status] ?? STATUS_STYLE.pending
            const Icon = st.icon
            return (
              <div key={e.id} className="rounded-xl px-5 py-4"
                style={{ background: "#FFFFFF", border: "1px solid #E5E7EB" }}>
                <div className="flex items-start gap-4">
                  <div className="w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0"
                    style={{ background: "rgba(222,26,26,0.06)" }}>
                    <IndianRupee size={16} style={{ color: "#de1a1a" }} />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <p className="text-[14px] font-bold" style={{ color: "#111111" }}>{e.description}</p>
                        <p className="text-[11px] mt-0.5" style={{ color: "#6B7280" }}>
                          {e.category} · {formatDate(e.date)}
                        </p>
                      </div>
                      <div className="text-right flex-shrink-0">
                        <p className="text-[16px] font-black" style={{ fontFamily: "var(--font-jakarta)", color: "#111111" }}>
                          ₹{e.amount.toLocaleString("en-IN")}
                        </p>
                        <span className="inline-flex items-center gap-1 text-[10px] font-bold px-2 py-0.5 rounded-full mt-1"
                          style={{ background: st.bg, color: st.color }}>
                          <Icon size={9} />
                          {st.label}
                        </span>
                      </div>
                    </div>
                    {e.review_notes && (
                      <p className="text-[12px] mt-2 px-3 py-2 rounded-lg"
                        style={{ background: e.status === "rejected" ? "rgba(222,26,26,0.04)" : "rgba(22,163,74,0.04)", color: "#6B7280" }}>
                        <strong style={{ color: e.status === "rejected" ? "#de1a1a" : "#16A34A" }}>Admin note: </strong>
                        {e.review_notes}
                      </p>
                    )}
                  </div>
                </div>
              </div>
            )
          })}
        </div>
      )}

      {/* Submit modal */}
      {showForm && (
        <>
          <div className="fixed inset-0 z-40" style={{ background: "rgba(0,0,0,0.6)", backdropFilter: "blur(4px)" }}
            onClick={() => setShowForm(false)} />
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
            <div className="w-full max-w-[440px] rounded-2xl shadow-2xl"
              style={{ background: "#FFFFFF", border: "1px solid rgba(222,26,26,0.15)" }}>
              <div className="px-6 py-5 flex items-center justify-between" style={{ borderBottom: "1px solid #E5E7EB" }}>
                <h2 className="text-[16px] font-bold" style={{ color: "#111111" }}>New Expense Claim</h2>
                <button onClick={() => setShowForm(false)} className="w-8 h-8 rounded-full flex items-center justify-center"
                  style={{ border: "1px solid #E5E7EB" }}>
                  <X size={14} style={{ color: "#6B7280" }} />
                </button>
              </div>
              <div className="px-6 py-5 space-y-4">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label className="block text-[10px] font-bold uppercase tracking-[0.15em] mb-1.5" style={{ color: "#6B7280" }}>Amount (₹) *</label>
                    <input type="number" min="0" step="0.01" placeholder="500" style={FIELD}
                      value={form.amount} onChange={set("amount")} />
                  </div>
                  <div>
                    <label className="block text-[10px] font-bold uppercase tracking-[0.15em] mb-1.5" style={{ color: "#6B7280" }}>Date *</label>
                    <input type="date" max="2099-12-31" style={{ ...FIELD, colorScheme: "light" }}
                      value={form.date} onChange={set("date")} />
                  </div>
                </div>
                <div>
                  <label className="block text-[10px] font-bold uppercase tracking-[0.15em] mb-1.5" style={{ color: "#6B7280" }}>Category *</label>
                  <select style={{ ...FIELD, appearance: "none" }} value={form.category} onChange={set("category")}>
                    <option value="">Select category…</option>
                    {CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}
                  </select>
                </div>
                <div>
                  <label className="block text-[10px] font-bold uppercase tracking-[0.15em] mb-1.5" style={{ color: "#6B7280" }}>Description *</label>
                  <input placeholder="What was this expense for?" style={FIELD}
                    value={form.description} onChange={set("description")} />
                </div>
                <div>
                  <label className="block text-[10px] font-bold uppercase tracking-[0.15em] mb-1.5" style={{ color: "#6B7280" }}>Notes (optional)</label>
                  <textarea rows={2} placeholder="Additional details…" style={{ ...FIELD, resize: "none" }}
                    value={form.notes} onChange={set("notes")} />
                </div>
                {error && (
                  <p className="text-[12px] px-3 py-2 rounded-lg"
                    style={{ background: "rgba(222,26,26,0.06)", color: "#de1a1a" }}>{error}</p>
                )}
              </div>
              <div className="px-6 pb-5 flex gap-3">
                <button onClick={() => setShowForm(false)}
                  className="flex-1 py-2.5 rounded-xl text-[13px] font-semibold"
                  style={{ background: "#F9FAFB", color: "#6B7280", border: "1px solid #E5E7EB" }}>
                  Cancel
                </button>
                <button onClick={handleSubmit} disabled={isPending}
                  className="flex-1 py-2.5 rounded-xl text-[13px] font-bold flex items-center justify-center gap-2 disabled:opacity-60"
                  style={{ background: "linear-gradient(135deg, #de1a1a, #7F1D1D)", color: "#FFFFFF" }}>
                  {isPending && <Loader2 size={13} className="animate-spin" />}
                  Submit Claim
                </button>
              </div>
            </div>
          </div>
        </>
      )}
    </div>
  )
}
