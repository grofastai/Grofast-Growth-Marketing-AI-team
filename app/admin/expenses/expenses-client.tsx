"use client"

import { useState, useMemo, useTransition } from "react"
import { useRouter } from "next/navigation"
import {
  IndianRupee, Plus, Trash2, X,
  Car, Megaphone, Monitor, MoreHorizontal, Building2,
  Receipt, Layers, CheckCircle2, AlertCircle,
} from "lucide-react"
import {
  upsertTravelCost,
  addClientExpense,
  deleteClientExpense,
  upsertCommonExpense,
  deleteCommonExpense,
} from "@/lib/actions/client-expenses"

// ── Types ─────────────────────────────────────────────────────────────────────

type WorkEntry = {
  task_type?: string
  title?: string
  client_name?: string
  duration_hours?: number
}

type UpdateRow = {
  id: string
  user_id: string
  date: string
  work_entries: WorkEntry[] | null
}

type MemberUser = {
  id: string
  name: string
  employee_id: string
}

type ClientExpense = {
  id: string
  client_name: string
  date: string
  type: string
  amount: number
  notes: string | null
  shoot_title: string | null
}

type CommonExpense = {
  id: string
  name: string
  type: string
  month: string
  amount: number
  notes: string | null
}

type ActiveClient = {
  name: string
}

type ContentPostRow = {
  client_name: string
  content_type: string
  scheduled_date: string
}

type ShootRow = {
  key: string
  date: string
  clientName: string
  title: string
  memberName: string
  durationHrs: number
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function fmtDate(s: string) {
  return new Date(s + "T12:00:00").toLocaleDateString("en-IN", {
    day: "numeric", month: "short",
  })
}

function fmtRupee(n: number) {
  if (n === 0) return "—"
  return `₹${Math.round(n).toLocaleString("en-IN")}`
}

const TYPE_ICON: Record<string, React.ReactNode> = {
  travel:   <Car size={13} />,
  ad:       <Megaphone size={13} />,
  software: <Monitor size={13} />,
  other:    <MoreHorizontal size={13} />,
  rent:     <Building2 size={13} />,
}

const TYPE_COLOR: Record<string, string> = {
  travel:   "#3B82F6",
  ad:       "#F59E0B",
  software: "#8B5CF6",
  other:    "#6B7280",
  rent:     "#10B981",
}

const TYPE_BG: Record<string, string> = {
  travel:   "rgba(59,130,246,0.08)",
  ad:       "rgba(245,158,11,0.08)",
  software: "rgba(139,92,246,0.08)",
  other:    "rgba(107,114,128,0.08)",
  rent:     "rgba(16,185,129,0.08)",
}

const MONTHS_SHORT = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"]
const INTERNAL_BRANDS = 3

// ── Modal wrapper ─────────────────────────────────────────────────────────────

function Modal({ title, onClose, children }: {
  title: string
  onClose: () => void
  children: React.ReactNode
}) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4"
      style={{ background: "rgba(0,0,0,0.45)" }}
      onClick={e => { if (e.target === e.currentTarget) onClose() }}>
      <div className="w-full max-w-md rounded-2xl overflow-hidden"
        style={{ background: "#FFFFFF", boxShadow: "0 20px 60px rgba(0,0,0,0.2)" }}>
        <div className="flex items-center justify-between px-6 py-4" style={{ borderBottom: "1px solid #F3F4F6" }}>
          <h2 className="text-[15px] font-black" style={{ color: "#111111" }}>{title}</h2>
          <button onClick={onClose} className="w-8 h-8 rounded-lg flex items-center justify-center hover:bg-gray-100 transition-colors">
            <X size={16} style={{ color: "#6B7280" }} />
          </button>
        </div>
        <div className="p-6">{children}</div>
      </div>
    </div>
  )
}

// ── Client Expense Modal ──────────────────────────────────────────────────────

function ClientExpenseModal({ clients, selectedMonth, onClose }: {
  clients: string[]
  selectedMonth: string
  onClose: () => void
}) {
  const [clientName, setClientName] = useState(clients[0] ?? "")
  const [type, setType]             = useState<"ad" | "software" | "other">("ad")
  const [date, setDate]             = useState(selectedMonth + "-01")
  const [amount, setAmount]         = useState("")
  const [notes, setNotes]           = useState("")
  const [isPending, start]          = useTransition()
  const [done, setDone]             = useState(false)
  const router                      = useRouter()

  function save() {
    const amt = parseFloat(amount)
    if (!clientName || isNaN(amt) || amt <= 0) return
    start(async () => {
      await addClientExpense({ clientName, date, type, amount: amt, notes: notes || undefined })
      router.refresh()
      setDone(true)
      setTimeout(() => { setDone(false); setAmount(""); setNotes("") }, 1400)
    })
  }

  return (
    <Modal title="Add Client Expense" onClose={onClose}>
      <div className="space-y-4">
        <div>
          <label className="text-[11px] font-bold uppercase tracking-wider" style={{ color: "#6B7280" }}>Client</label>
          <select value={clientName} onChange={e => setClientName(e.target.value)}
            className="mt-1 w-full rounded-xl px-3 py-2.5 text-[13px] outline-none"
            style={{ background: "#F9FAFB", border: "1px solid #E5E7EB", color: "#111111" }}>
            {clients.map(c => <option key={c} value={c}>{c}</option>)}
          </select>
        </div>
        <div className="grid grid-cols-3 gap-2">
          {(["ad", "software", "other"] as const).map(t => (
            <button key={t} onClick={() => setType(t)}
              className="flex flex-col items-center gap-1.5 py-3 rounded-xl text-[11px] font-bold capitalize transition-all"
              style={{
                background: type === t ? TYPE_BG[t] : "#F9FAFB",
                border: `1.5px solid ${type === t ? TYPE_COLOR[t] : "#E5E7EB"}`,
                color: type === t ? TYPE_COLOR[t] : "#6B7280",
              }}>
              {TYPE_ICON[t]}
              {t}
            </button>
          ))}
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="text-[11px] font-bold uppercase tracking-wider" style={{ color: "#6B7280" }}>Date</label>
            <input type="date" value={date} onChange={e => setDate(e.target.value)}
              className="mt-1 w-full rounded-xl px-3 py-2.5 text-[13px] outline-none"
              style={{ background: "#F9FAFB", border: "1px solid #E5E7EB", color: "#111111" }} />
          </div>
          <div>
            <label className="text-[11px] font-bold uppercase tracking-wider" style={{ color: "#6B7280" }}>Amount (₹)</label>
            <input type="number" value={amount} onChange={e => setAmount(e.target.value)}
              placeholder="0" min="0"
              className="mt-1 w-full rounded-xl px-3 py-2.5 text-[13px] outline-none"
              style={{ background: "#F9FAFB", border: "1px solid #E5E7EB", color: "#111111" }} />
          </div>
        </div>
        <div>
          <label className="text-[11px] font-bold uppercase tracking-wider" style={{ color: "#6B7280" }}>Notes (optional)</label>
          <input type="text" value={notes} onChange={e => setNotes(e.target.value)}
            placeholder="e.g. Facebook Ads Jun 2026"
            className="mt-1 w-full rounded-xl px-3 py-2.5 text-[13px] outline-none"
            style={{ background: "#F9FAFB", border: "1px solid #E5E7EB", color: "#111111" }} />
        </div>
        <button onClick={save} disabled={isPending}
          className="w-full py-3 rounded-xl text-[13px] font-bold flex items-center justify-center gap-2 transition-all disabled:opacity-60"
          style={{ background: done ? "rgba(22,163,74,0.1)" : "rgba(222,26,26,0.08)", color: done ? "#16A34A" : "#de1a1a", border: `1.5px solid ${done ? "rgba(22,163,74,0.2)" : "rgba(222,26,26,0.15)"}` }}>
          {done ? <><CheckCircle2 size={14} /> Saved!</> : isPending ? "Saving…" : <><Plus size={14} /> Add Expense</>}
        </button>
      </div>
    </Modal>
  )
}

// ── Common Expense Modal ──────────────────────────────────────────────────────

function CommonExpenseModal({ selectedMonth, overheadDivisor, onClose }: {
  selectedMonth: string
  overheadDivisor: number
  onClose: () => void
}) {
  const [name, setName]     = useState("")
  const [type, setType]     = useState<"rent" | "software" | "other">("rent")
  const [amount, setAmount] = useState("")
  const [notes, setNotes]   = useState("")
  const [isPending, start]  = useTransition()
  const [done, setDone]     = useState(false)
  const router               = useRouter()

  const amt = parseFloat(amount) || 0
  const previewShare = amt > 0 && overheadDivisor > 0 ? amt / overheadDivisor : 0

  function save() {
    if (!name.trim() || amt <= 0) return
    start(async () => {
      await upsertCommonExpense({ name: name.trim(), type, month: selectedMonth, amount: amt, notes: notes || undefined })
      router.refresh()
      setDone(true)
      setTimeout(() => { setDone(false); setName(""); setAmount(""); setNotes("") }, 1400)
    })
  }

  return (
    <Modal title="Add Common Expense" onClose={onClose}>
      <div className="space-y-4">
        <div>
          <label className="text-[11px] font-bold uppercase tracking-wider" style={{ color: "#6B7280" }}>Expense Name</label>
          <input type="text" value={name} onChange={e => setName(e.target.value)}
            placeholder="e.g. Office Rent, Adobe CC"
            className="mt-1 w-full rounded-xl px-3 py-2.5 text-[13px] outline-none"
            style={{ background: "#F9FAFB", border: "1px solid #E5E7EB", color: "#111111" }} />
        </div>
        <div className="grid grid-cols-3 gap-2">
          {(["rent", "software", "other"] as const).map(t => (
            <button key={t} onClick={() => setType(t)}
              className="flex flex-col items-center gap-1.5 py-3 rounded-xl text-[11px] font-bold capitalize transition-all"
              style={{
                background: type === t ? TYPE_BG[t] : "#F9FAFB",
                border: `1.5px solid ${type === t ? TYPE_COLOR[t] : "#E5E7EB"}`,
                color: type === t ? TYPE_COLOR[t] : "#6B7280",
              }}>
              {TYPE_ICON[t]}
              {t}
            </button>
          ))}
        </div>
        <div>
          <label className="text-[11px] font-bold uppercase tracking-wider" style={{ color: "#6B7280" }}>Amount (₹)</label>
          <input type="number" value={amount} onChange={e => setAmount(e.target.value)}
            placeholder="0" min="0"
            className="mt-1 w-full rounded-xl px-3 py-2.5 text-[13px] outline-none"
            style={{ background: "#F9FAFB", border: "1px solid #E5E7EB", color: "#111111" }} />
        </div>
        {previewShare > 0 && (
          <div className="flex items-center gap-2 px-3 py-2.5 rounded-xl"
            style={{ background: "rgba(16,185,129,0.06)", border: "1px solid rgba(16,185,129,0.15)" }}>
            <Layers size={13} style={{ color: "#10B981" }} />
            <span className="text-[12px]" style={{ color: "#374151" }}>
              Per client share: <strong style={{ color: "#10B981" }}>{fmtRupee(previewShare)}</strong>
              <span style={{ color: "#9CA3AF" }}> ÷ {overheadDivisor}</span>
            </span>
          </div>
        )}
        <div>
          <label className="text-[11px] font-bold uppercase tracking-wider" style={{ color: "#6B7280" }}>Notes (optional)</label>
          <input type="text" value={notes} onChange={e => setNotes(e.target.value)}
            placeholder="e.g. Annual subscription"
            className="mt-1 w-full rounded-xl px-3 py-2.5 text-[13px] outline-none"
            style={{ background: "#F9FAFB", border: "1px solid #E5E7EB", color: "#111111" }} />
        </div>
        <button onClick={save} disabled={isPending}
          className="w-full py-3 rounded-xl text-[13px] font-bold flex items-center justify-center gap-2 transition-all disabled:opacity-60"
          style={{ background: done ? "rgba(22,163,74,0.1)" : "rgba(222,26,26,0.08)", color: done ? "#16A34A" : "#de1a1a", border: `1.5px solid ${done ? "rgba(22,163,74,0.2)" : "rgba(222,26,26,0.15)"}` }}>
          {done ? <><CheckCircle2 size={14} /> Saved!</> : isPending ? "Saving…" : <><Plus size={14} /> Add Expense</>}
        </button>
      </div>
    </Modal>
  )
}

// ── Travel Table Modal ────────────────────────────────────────────────────────

function TravelTableModal({ shoots, savedTravel, onClose }: {
  shoots: ShootRow[]
  savedTravel: Record<string, number>
  onClose: () => void
}) {
  const [localAmounts, setLocal] = useState<Record<string, string>>(() => {
    const m: Record<string, string> = {}
    for (const [k, v] of Object.entries(savedTravel)) {
      if (v > 0) m[k] = String(v)
    }
    return m
  })
  const [saving, setSaving] = useState<string | null>(null)
  const [saved, setSaved]   = useState<Record<string, boolean>>({})
  const router               = useRouter()

  async function saveRow(row: ShootRow) {
    const amt = parseFloat(localAmounts[row.key] ?? "") || 0
    setSaving(row.key)
    await upsertTravelCost(row.clientName, row.date, row.title, amt)
    setSaving(null)
    setSaved(p => ({ ...p, [row.key]: true }))
    setTimeout(() => setSaved(p => ({ ...p, [row.key]: false })), 1500)
    router.refresh()
  }

  const totalEntered = Object.values(localAmounts).reduce((s, v) => s + (parseFloat(v) || 0), 0)

  return (
    <div className="fixed inset-0 z-50 flex items-end md:items-center justify-center p-0 md:p-4"
      style={{ background: "rgba(0,0,0,0.45)" }}
      onClick={e => { if (e.target === e.currentTarget) onClose() }}>
      <div className="w-full md:max-w-3xl rounded-t-3xl md:rounded-2xl overflow-hidden flex flex-col"
        style={{ background: "#FFFFFF", boxShadow: "0 20px 60px rgba(0,0,0,0.2)", maxHeight: "90vh" }}>
        {/* header */}
        <div className="flex items-center justify-between px-6 py-4 flex-shrink-0" style={{ borderBottom: "1px solid #F3F4F6" }}>
          <div>
            <h2 className="text-[15px] font-black" style={{ color: "#111111" }}>Travel Costs — Shoots</h2>
            {totalEntered > 0 && (
              <p className="text-[12px] mt-0.5" style={{ color: "#6B7280" }}>
                Total entered: <strong style={{ color: "#3B82F6" }}>₹{Math.round(totalEntered).toLocaleString("en-IN")}</strong>
              </p>
            )}
          </div>
          <button onClick={onClose} className="w-8 h-8 rounded-lg flex items-center justify-center hover:bg-gray-100 transition-colors">
            <X size={16} style={{ color: "#6B7280" }} />
          </button>
        </div>
        {/* table */}
        <div className="overflow-y-auto flex-1">
          {shoots.length === 0 ? (
            <div className="flex flex-col items-center py-16">
              <Car size={32} style={{ color: "#E5E7EB" }} className="mb-3" />
              <p className="text-[13px]" style={{ color: "#9CA3AF" }}>No shoots logged this month</p>
            </div>
          ) : (
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
              <thead style={{ position: "sticky", top: 0, background: "#F9FAFB", zIndex: 1 }}>
                <tr>
                  {["Date", "Client", "Shoot Title", "Member", "Hrs", "Travel ₹", ""].map(h => (
                    <th key={h} style={{ padding: "10px 14px", textAlign: h === "Travel ₹" || h === "" ? "center" : "left", fontSize: 10, fontWeight: 700, color: "#6B7280", textTransform: "uppercase", letterSpacing: "0.06em", borderBottom: "1px solid #E5E7EB", whiteSpace: "nowrap" }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {shoots.map((row, i) => {
                  const isSaving = saving === row.key
                  const isSaved  = saved[row.key]
                  const hasVal   = parseFloat(localAmounts[row.key] ?? "") > 0
                  return (
                    <tr key={row.key} style={{ background: i % 2 === 0 ? "#FFFFFF" : "#FAFAFA" }}>
                      <td style={{ padding: "10px 14px", color: "#6B7280", borderBottom: "1px solid #F3F4F6", whiteSpace: "nowrap" }}>{fmtDate(row.date)}</td>
                      <td style={{ padding: "10px 14px", fontWeight: 600, color: "#111111", borderBottom: "1px solid #F3F4F6", maxWidth: 120, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{row.clientName}</td>
                      <td style={{ padding: "10px 14px", color: "#374151", borderBottom: "1px solid #F3F4F6", maxWidth: 160, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{row.title || "—"}</td>
                      <td style={{ padding: "10px 14px", color: "#6B7280", borderBottom: "1px solid #F3F4F6", whiteSpace: "nowrap" }}>{row.memberName}</td>
                      <td style={{ padding: "10px 14px", textAlign: "center", color: "#374151", borderBottom: "1px solid #F3F4F6" }}>{row.durationHrs > 0 ? `${row.durationHrs}h` : "—"}</td>
                      <td style={{ padding: "8px 14px", borderBottom: "1px solid #F3F4F6" }}>
                        <input
                          type="number" min="0"
                          value={localAmounts[row.key] ?? ""}
                          onChange={e => setLocal(p => ({ ...p, [row.key]: e.target.value }))}
                          placeholder="0"
                          className="w-24 rounded-lg px-3 py-1.5 text-[13px] text-center outline-none"
                          style={{ background: hasVal ? "rgba(59,130,246,0.06)" : "#F9FAFB", border: `1px solid ${hasVal ? "rgba(59,130,246,0.3)" : "#E5E7EB"}`, color: "#111111", display: "block", margin: "0 auto" }}
                        />
                      </td>
                      <td style={{ padding: "8px 14px", textAlign: "center", borderBottom: "1px solid #F3F4F6" }}>
                        <button onClick={() => saveRow(row)} disabled={isSaving}
                          className="px-3 py-1.5 rounded-lg text-[11px] font-bold transition-all disabled:opacity-50"
                          style={{ background: isSaved ? "rgba(22,163,74,0.1)" : "rgba(59,130,246,0.08)", color: isSaved ? "#16A34A" : "#3B82F6", border: `1px solid ${isSaved ? "rgba(22,163,74,0.2)" : "rgba(59,130,246,0.2)"}`, whiteSpace: "nowrap" }}>
                          {isSaving ? "…" : isSaved ? "✓" : "Save"}
                        </button>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          )}
        </div>
      </div>
    </div>
  )
}

// ── Main Component ────────────────────────────────────────────────────────────

export default function ExpensesClient({
  updates, users, clientExpenses, commonExpenses, activeClients, contentPosts, selectedMonth,
}: {
  updates: UpdateRow[]
  users: MemberUser[]
  clientExpenses: ClientExpense[]
  commonExpenses: CommonExpense[]
  activeClients: ActiveClient[]
  contentPosts: ContentPostRow[]
  selectedMonth: string
}) {
  const router = useRouter()
  const [modal, setModal] = useState<"travel" | "client" | "common" | null>(null)
  const [isPending, start] = useTransition()

  const [yr, mo] = selectedMonth.split("-").map(Number)

  function goMonth(delta: number) {
    let nm = mo + delta; let ny = yr
    if (nm < 1)  { nm = 12; ny-- }
    if (nm > 12) { nm = 1;  ny++ }
    router.push(`/admin/expenses?month=${ny}-${String(nm).padStart(2, "0")}`)
  }

  const overheadDivisor = activeClients.length + INTERNAL_BRANDS

  const userMap = useMemo(() => {
    const m: Record<string, string> = {}
    for (const u of users) m[u.id] = u.name
    return m
  }, [users])

  const shootRows = useMemo<ShootRow[]>(() => {
    const rows: ShootRow[] = []
    for (const u of updates) {
      if (!Array.isArray(u.work_entries)) continue
      for (const e of u.work_entries as WorkEntry[]) {
        if (e.task_type !== "shoot") continue
        rows.push({
          key: `${u.date}__${u.user_id}__${e.client_name ?? ""}__${e.title ?? ""}`,
          date: u.date,
          clientName: e.client_name ?? "Unknown",
          title: e.title ?? "",
          memberName: userMap[u.user_id] ?? "—",
          durationHrs: e.duration_hours ?? 0,
        })
      }
    }
    return rows.sort((a, b) => (a.date < b.date ? 1 : -1))
  }, [updates, userMap])

  const savedTravel = useMemo(() => {
    const m: Record<string, number> = {}
    for (const e of clientExpenses) {
      if (e.type !== "travel") continue
      const row = shootRows.find(
        r => r.date === e.date && r.clientName === e.client_name &&
          (r.title === e.shoot_title || (!r.title && !e.shoot_title))
      )
      if (row) m[row.key] = e.amount
    }
    return m
  }, [clientExpenses, shootRows])

  const clientNames = useMemo(() => {
    const set = new Set<string>()
    for (const c of activeClients) if (c.name) set.add(c.name)
    for (const e of clientExpenses) set.add(e.client_name)
    return Array.from(set).sort()
  }, [activeClients, clientExpenses])

  const totalClientDirect = useMemo(() => clientExpenses.reduce((s, e) => s + e.amount, 0), [clientExpenses])
  const totalCommon       = useMemo(() => commonExpenses.reduce((s, e) => s + e.amount, 0), [commonExpenses])
  const perClientOverhead = overheadDivisor > 0 ? totalCommon / overheadDivisor : 0
  const grandTotal        = totalClientDirect + totalCommon

  const contentCounts = useMemo(() => {
    const TYPE_MAP: Record<string, string> = {
      video: "Videos", reel: "Reels", post: "Posters", story: "Stories",
    }
    const map: Record<string, Record<string, number>> = {}
    for (const p of contentPosts) {
      const client = p.client_name || "Unknown"
      const type   = TYPE_MAP[p.content_type] ?? "Other"
      if (!map[client]) map[client] = {}
      map[client][type] = (map[client][type] ?? 0) + 1
    }
    return Object.entries(map).map(([client, counts]) => ({
      client,
      videos:  counts["Videos"]  ?? 0,
      reels:   counts["Reels"]   ?? 0,
      posters: counts["Posters"] ?? 0,
      stories: counts["Stories"] ?? 0,
      other:   counts["Other"]   ?? 0,
      total:   Object.values(counts).reduce((a, b) => a + b, 0),
    })).sort((a, b) => b.total - a.total)
  }, [contentPosts])

  function handleDeleteClient(id: string) {
    start(async () => { await deleteClientExpense(id); router.refresh() })
  }
  function handleDeleteCommon(id: string) {
    start(async () => { await deleteCommonExpense(id); router.refresh() })
  }

  return (
    <div className="min-h-screen" style={{ background: "#F8F9FB" }}>
      <div className="p-4 md:p-6 xl:p-8 max-w-[1300px] mx-auto space-y-6">

        {/* Header */}
        <div className="flex items-center justify-between gap-4 flex-wrap"
          style={{ background: "linear-gradient(135deg, #DE1A1A 0%, #8B1212 55%, #1A0808 100%)", borderRadius: 20, padding: "22px 24px", boxShadow: "0 8px 32px rgba(180,0,0,0.35)" }}>
          <div>
            <h1 className="text-[28px] font-black" style={{ fontFamily: "var(--font-jakarta)", color: "#FFFFFF" }}>Expenses</h1>
            <p className="text-sm mt-0.5" style={{ color: "rgba(255,255,255,0.7)" }}>Client direct + common overhead</p>
          </div>
          <div className="flex items-center gap-2 px-4 py-2 rounded-xl" style={{ background: "rgba(255,255,255,0.12)" }}>
            <button onClick={() => goMonth(-1)} className="w-7 h-7 rounded-lg flex items-center justify-center text-white font-bold text-lg hover:bg-white/10 transition-colors">‹</button>
            <span className="text-[14px] font-black text-white px-2">{MONTHS_SHORT[mo - 1]} {yr}</span>
            <button onClick={() => goMonth(1)} className="w-7 h-7 rounded-lg flex items-center justify-center text-white font-bold text-lg hover:bg-white/10 transition-colors">›</button>
          </div>
        </div>

        {/* 4 Summary Cards */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          {[
            { label: "Total Expenses",   value: fmtRupee(grandTotal),        color: "#de1a1a", bg: "rgba(222,26,26,0.06)",   icon: <IndianRupee size={16} style={{ color: "#de1a1a" }} /> },
            { label: "Client Direct",    value: fmtRupee(totalClientDirect), color: "#3B82F6", bg: "rgba(59,130,246,0.06)",  icon: <Receipt size={16} style={{ color: "#3B82F6" }} /> },
            { label: "Common Shared",    value: fmtRupee(totalCommon),       color: "#8B5CF6", bg: "rgba(139,92,246,0.06)",  icon: <Layers size={16} style={{ color: "#8B5CF6" }} /> },
            { label: "Per Client/Brand", value: fmtRupee(perClientOverhead), color: "#10B981", bg: "rgba(16,185,129,0.06)",  icon: <Building2 size={16} style={{ color: "#10B981" }} />, sub: `÷ ${overheadDivisor} (${activeClients.length} clients + 3 brands)` },
          ].map(k => (
            <div key={k.label} className="rounded-2xl p-5 flex flex-col justify-between"
              style={{ background: "#FFFFFF", border: `1.5px solid ${k.color}20`, boxShadow: "0 2px 12px rgba(0,0,0,0.04)" }}>
              <div className="w-9 h-9 rounded-xl flex items-center justify-center mb-3" style={{ background: k.bg }}>
                {k.icon}
              </div>
              <div>
                <p className="text-[22px] font-black leading-none mb-1" style={{ fontFamily: "var(--font-jakarta)", color: k.color }}>{k.value}</p>
                <p className="text-[12px] font-semibold" style={{ color: "#374151" }}>{k.label}</p>
                {"sub" in k && k.sub && <p className="text-[10px] mt-0.5" style={{ color: "#9CA3AF" }}>{k.sub}</p>}
              </div>
            </div>
          ))}
        </div>

        {/* Content Posted */}
        {contentCounts.length > 0 && (
          <div className="rounded-2xl overflow-hidden" style={{ background: "#FFFFFF", border: "1px solid #E5E7EB" }}>
            <div className="px-5 py-4" style={{ borderBottom: "1px solid #F3F4F6" }}>
              <h2 className="text-[13px] font-black uppercase tracking-wider" style={{ color: "#111111" }}>
                Content Posted — {MONTHS_SHORT[mo - 1]} {yr}
              </h2>
            </div>
            <div style={{ overflowX: "auto" }}>
              <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
                <thead>
                  <tr style={{ background: "#F9FAFB" }}>
                    {["Client", "Videos", "Reels", "Posters", "Stories", "Other", "Total"].map(h => (
                      <th key={h} style={{ padding: "8px 12px", textAlign: h === "Client" ? "left" : "center", fontSize: 10, fontWeight: 700, color: "#6B7280", textTransform: "uppercase", letterSpacing: "0.06em", borderBottom: "1px solid #E5E7EB" }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {contentCounts.map((row, i) => (
                    <tr key={row.client} style={{ background: i % 2 === 0 ? "#FFFFFF" : "#FAFAFA" }}>
                      <td style={{ padding: "10px 12px", fontWeight: 600, color: "#111111", borderBottom: "1px solid #F3F4F6" }}>{row.client}</td>
                      {[row.videos, row.reels, row.posters, row.stories, row.other].map((v, j) => (
                        <td key={j} style={{ padding: "10px 12px", textAlign: "center", color: v > 0 ? "#111111" : "#D1D5DB", fontWeight: v > 0 ? 700 : 400, borderBottom: "1px solid #F3F4F6" }}>{v > 0 ? v : "—"}</td>
                      ))}
                      <td style={{ padding: "10px 12px", textAlign: "center", fontWeight: 800, color: "#de1a1a", borderBottom: "1px solid #F3F4F6" }}>{row.total}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* 3 Action Buttons */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          <button onClick={() => setModal("travel")}
            className="flex items-center gap-3 px-5 py-4 rounded-2xl transition-all hover:shadow-md text-left"
            style={{ background: "#FFFFFF", border: "1.5px solid rgba(59,130,246,0.25)" }}>
            <div className="w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0" style={{ background: "rgba(59,130,246,0.08)" }}>
              <Car size={18} style={{ color: "#3B82F6" }} />
            </div>
            <div>
              <p className="text-[13px] font-black" style={{ color: "#111111" }}>Travel Costs</p>
              <p className="text-[11px]" style={{ color: "#6B7280" }}>Petrol / travel per shoot</p>
            </div>
          </button>
          <button onClick={() => setModal("client")}
            className="flex items-center gap-3 px-5 py-4 rounded-2xl transition-all hover:shadow-md text-left"
            style={{ background: "#FFFFFF", border: "1.5px solid rgba(222,26,26,0.2)" }}>
            <div className="w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0" style={{ background: "rgba(222,26,26,0.06)" }}>
              <Megaphone size={18} style={{ color: "#de1a1a" }} />
            </div>
            <div>
              <p className="text-[13px] font-black" style={{ color: "#111111" }}>Client Expense</p>
              <p className="text-[11px]" style={{ color: "#6B7280" }}>Ad spend · software · other</p>
            </div>
          </button>
          <button onClick={() => setModal("common")}
            className="flex items-center gap-3 px-5 py-4 rounded-2xl transition-all hover:shadow-md text-left"
            style={{ background: "#FFFFFF", border: "1.5px solid rgba(139,92,246,0.2)" }}>
            <div className="w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0" style={{ background: "rgba(139,92,246,0.06)" }}>
              <Building2 size={18} style={{ color: "#8B5CF6" }} />
            </div>
            <div>
              <p className="text-[13px] font-black" style={{ color: "#111111" }}>Common Expense</p>
              <p className="text-[11px]" style={{ color: "#6B7280" }}>Rent · shared software — split by clients</p>
            </div>
          </button>
        </div>

        {/* Expense Lists */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">

          {/* Client Direct */}
          <div className="rounded-2xl overflow-hidden" style={{ background: "#FFFFFF", border: "1px solid #E5E7EB" }}>
            <div className="flex items-center gap-2.5 px-5 py-4" style={{ borderBottom: "1px solid #F3F4F6" }}>
              <Receipt size={14} style={{ color: "#3B82F6" }} />
              <h2 className="text-[13px] font-black uppercase tracking-wider" style={{ color: "#111111" }}>Client Direct</h2>
              <span className="ml-auto text-[13px] font-black" style={{ color: "#3B82F6", fontFamily: "var(--font-jakarta)" }}>{fmtRupee(totalClientDirect)}</span>
            </div>
            {clientExpenses.length === 0 ? (
              <div className="flex flex-col items-center py-12">
                <AlertCircle size={28} style={{ color: "#E5E7EB" }} className="mb-2" />
                <p className="text-[13px]" style={{ color: "#9CA3AF" }}>No client expenses this month</p>
              </div>
            ) : (
              <div className="divide-y" style={{ borderColor: "#F3F4F6" }}>
                {clientExpenses.map(e => (
                  <div key={e.id} className="flex items-center gap-3 px-5 py-3.5">
                    <div className="w-7 h-7 rounded-lg flex items-center justify-center flex-shrink-0"
                      style={{ background: TYPE_BG[e.type] ?? TYPE_BG.other, color: TYPE_COLOR[e.type] ?? TYPE_COLOR.other }}>
                      {TYPE_ICON[e.type] ?? TYPE_ICON.other}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <p className="text-[12px] font-semibold truncate" style={{ color: "#111111" }}>{e.client_name}</p>
                        <span className="text-[10px] px-1.5 py-0.5 rounded-md font-bold capitalize flex-shrink-0"
                          style={{ background: TYPE_BG[e.type] ?? TYPE_BG.other, color: TYPE_COLOR[e.type] ?? TYPE_COLOR.other }}>{e.type}</span>
                      </div>
                      <p className="text-[11px]" style={{ color: "#9CA3AF" }}>
                        {fmtDate(e.date)}{e.shoot_title ? ` · ${e.shoot_title}` : ""}{e.notes ? ` · ${e.notes}` : ""}
                      </p>
                    </div>
                    <span className="text-[13px] font-black flex-shrink-0" style={{ fontFamily: "var(--font-jakarta)", color: "#111111" }}>
                      ₹{Math.round(e.amount).toLocaleString("en-IN")}
                    </span>
                    <button onClick={() => handleDeleteClient(e.id)} disabled={isPending}
                      className="opacity-30 hover:opacity-80 transition-opacity flex-shrink-0">
                      <Trash2 size={13} style={{ color: "#DC2626" }} />
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Common / Shared */}
          <div className="rounded-2xl overflow-hidden" style={{ background: "#FFFFFF", border: "1px solid #E5E7EB" }}>
            <div className="flex items-center gap-2.5 px-5 py-4" style={{ borderBottom: "1px solid #F3F4F6" }}>
              <Layers size={14} style={{ color: "#8B5CF6" }} />
              <h2 className="text-[13px] font-black uppercase tracking-wider" style={{ color: "#111111" }}>Common / Shared</h2>
              <span className="ml-auto text-[13px] font-black" style={{ color: "#8B5CF6", fontFamily: "var(--font-jakarta)" }}>{fmtRupee(totalCommon)}</span>
            </div>
            {commonExpenses.length === 0 ? (
              <div className="flex flex-col items-center py-12">
                <AlertCircle size={28} style={{ color: "#E5E7EB" }} className="mb-2" />
                <p className="text-[13px]" style={{ color: "#9CA3AF" }}>No common expenses this month</p>
              </div>
            ) : (
              <div className="divide-y" style={{ borderColor: "#F3F4F6" }}>
                {commonExpenses.map(e => {
                  const share = overheadDivisor > 0 ? e.amount / overheadDivisor : 0
                  return (
                    <div key={e.id} className="flex items-center gap-3 px-5 py-3.5">
                      <div className="w-7 h-7 rounded-lg flex items-center justify-center flex-shrink-0"
                        style={{ background: TYPE_BG[e.type] ?? TYPE_BG.other, color: TYPE_COLOR[e.type] ?? TYPE_COLOR.other }}>
                        {TYPE_ICON[e.type] ?? TYPE_ICON.other}
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-[12px] font-semibold truncate" style={{ color: "#111111" }}>{e.name}</p>
                        <p className="text-[11px]" style={{ color: "#9CA3AF" }}>
                          <span className="capitalize">{e.type}</span>
                          {e.notes ? ` · ${e.notes}` : ""}
                          {share > 0 ? ` · ${fmtRupee(share)}/client` : ""}
                        </p>
                      </div>
                      <span className="text-[13px] font-black flex-shrink-0" style={{ fontFamily: "var(--font-jakarta)", color: "#111111" }}>
                        ₹{Math.round(e.amount).toLocaleString("en-IN")}
                      </span>
                      <button onClick={() => handleDeleteCommon(e.id)} disabled={isPending}
                        className="opacity-30 hover:opacity-80 transition-opacity flex-shrink-0">
                        <Trash2 size={13} style={{ color: "#DC2626" }} />
                      </button>
                    </div>
                  )
                })}
              </div>
            )}
          </div>
        </div>


      </div>

      {/* Modals */}
      {modal === "travel" && (
        <TravelTableModal shoots={shootRows} savedTravel={savedTravel} onClose={() => setModal(null)} />
      )}
      {modal === "client" && (
        <ClientExpenseModal clients={clientNames} selectedMonth={selectedMonth} onClose={() => setModal(null)} />
      )}
      {modal === "common" && (
        <CommonExpenseModal selectedMonth={selectedMonth} overheadDivisor={overheadDivisor} onClose={() => setModal(null)} />
      )}
    </div>
  )
}
