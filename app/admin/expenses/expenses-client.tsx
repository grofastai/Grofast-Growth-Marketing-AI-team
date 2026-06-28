"use client"

import { useState, useMemo, useTransition } from "react"
import { useRouter } from "next/navigation"
import {
  IndianRupee, Plus, Trash2, X, Pencil,
  Car, Megaphone, Monitor, MoreHorizontal, Building2,
  Receipt, Layers, CheckCircle2, AlertCircle,
} from "lucide-react"
import {
  upsertTravelCost,
  addClientExpense,
  updateClientExpense,
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
  if (n === 0) return "₹0"
  return `₹${Math.round(n).toLocaleString("en-IN")}`
}

const TYPE_ICON: Record<string, React.ReactNode> = {
  travel:   <Car size={13} />,
  ad:       <Megaphone size={13} />,
  software: <Monitor size={13} />,
  other:    <Receipt size={13} />,
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
const INTERNAL_BRAND_NAMES = new Set(["GROFAST DIGITAL", "GROFAST AI", "KARTHICK BRANDS"])

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

function ClientExpenseModal({ clients, selectedMonth, editing, onClose }: {
  clients: string[]
  selectedMonth: string
  editing?: ClientExpense
  onClose: () => void
}) {
  const [clientName, setClientName] = useState(editing?.client_name ?? clients[0] ?? "")
  const [type, setType]             = useState<"ad" | "software" | "other">((editing?.type as "ad" | "software" | "other") ?? "ad")
  const [date, setDate]             = useState(editing?.date ?? selectedMonth + "-01")
  const [amount, setAmount]         = useState(editing ? String(editing.amount) : "")
  const [notes, setNotes]           = useState(editing?.notes ?? "")
  const [isPending, start]          = useTransition()
  const [done, setDone]             = useState(false)
  const router                      = useRouter()

  function save() {
    const amt = parseFloat(amount)
    if (!clientName || isNaN(amt) || amt <= 0) return
    start(async () => {
      if (editing) {
        await updateClientExpense(editing.id, { clientName, date, type, amount: amt, notes: notes || undefined })
      } else {
        await addClientExpense({ clientName, date, type, amount: amt, notes: notes || undefined })
      }
      router.refresh()
      setDone(true)
      setTimeout(() => { setDone(false); if (!editing) { setAmount(""); setNotes("") } }, 1400)
      if (editing) setTimeout(onClose, 1400)
    })
  }

  return (
    <Modal title={editing ? "Edit Client Expense" : "Add Client Expense"} onClose={onClose}>
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

function CommonExpenseModal({ selectedMonth, overheadDivisor, editing, onClose }: {
  selectedMonth: string
  overheadDivisor: number
  editing?: CommonExpense
  onClose: () => void
}) {
  const [name, setName]     = useState(editing?.name ?? "")
  const [amount, setAmount] = useState(editing ? String(editing.amount) : "")
  const [notes, setNotes]   = useState(editing?.notes ?? "")
  const [isPending, start]  = useTransition()
  const [done, setDone]     = useState(false)
  const router               = useRouter()

  const amt = parseFloat(amount) || 0
  const previewShare = amt > 0 && overheadDivisor > 0 ? amt / overheadDivisor : 0

  function save() {
    if (!name.trim() || amt <= 0) return
    start(async () => {
      await upsertCommonExpense({ id: editing?.id, name: name.trim(), type: "other", month: selectedMonth, amount: amt, notes: notes || undefined })
      router.refresh()
      setDone(true)
      setTimeout(() => { setDone(false); if (!editing) { setName(""); setAmount(""); setNotes("") } }, 1400)
      if (editing) setTimeout(onClose, 1400)
    })
  }

  return (
    <Modal title={editing ? "Edit Common Expense" : "Add Common Expense"} onClose={onClose}>
      <div className="space-y-4">
        <div>
          <label className="text-[11px] font-bold uppercase tracking-wider" style={{ color: "#6B7280" }}>Expense Name</label>
          <input type="text" value={name} onChange={e => setName(e.target.value)}
            placeholder="e.g. Office Rent, Adobe CC"
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
  updates, users, clientExpenses, commonExpenses, activeClients, selectedMonth, employeeCostByClient,
}: {
  updates: UpdateRow[]
  users: MemberUser[]
  clientExpenses: ClientExpense[]
  commonExpenses: CommonExpense[]
  activeClients: ActiveClient[]
  selectedMonth: string
  employeeCostByClient: Record<string, number>
}) {
  const router = useRouter()
  const [modal, setModal]             = useState<"travel" | "client" | "common" | null>(null)
  const [editingClient, setEditClient] = useState<ClientExpense | null>(null)
  const [editingCommon, setEditCommon] = useState<CommonExpense | null>(null)
  const [isPending, start]             = useTransition()

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
        if (INTERNAL_BRAND_NAMES.has((e.client_name ?? "").toUpperCase())) continue
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

  const clientSummaryRows = useMemo(() => {
    const directMap: Record<string, number> = {}
    for (const e of clientExpenses) {
      directMap[e.client_name] = (directMap[e.client_name] ?? 0) + e.amount
    }
    const allNames = new Set<string>()
    for (const name of Object.keys(employeeCostByClient)) allNames.add(name)
    for (const c of activeClients) if (c.name) allNames.add(c.name)
    for (const n of Object.keys(directMap)) allNames.add(n)
    return Array.from(allNames).map(name => {
      const empCost = employeeCostByClient[name] ?? 0
      const direct  = directMap[name] ?? 0
      return {
        name,
        empCost,
        direct,
        overhead: perClientOverhead,
        total: direct + perClientOverhead + empCost,
      }
    }).sort((a, b) => b.total - a.total)
  }, [clientExpenses, activeClients, perClientOverhead, employeeCostByClient])


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
          <h1 className="text-[28px] font-black" style={{ fontFamily: "var(--font-jakarta)", color: "#FFFFFF" }}>Expenses</h1>
          <div className="flex items-center gap-2 px-4 py-2 rounded-xl" style={{ background: "rgba(255,255,255,0.12)" }}>
            <button onClick={() => goMonth(-1)} className="w-7 h-7 rounded-lg flex items-center justify-center text-white font-bold text-lg hover:bg-white/10 transition-colors">‹</button>
            <span className="text-[14px] font-black text-white px-2">{MONTHS_SHORT[mo - 1]} {yr}</span>
            <button onClick={() => goMonth(1)} className="w-7 h-7 rounded-lg flex items-center justify-center text-white font-bold text-lg hover:bg-white/10 transition-colors">›</button>
          </div>
        </div>

        {/* 4 Summary Cards */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          {[
            { label: "Total Expenses",   value: fmtRupee(grandTotal),        color: "#de1a1a", bg: "rgba(222,26,26,0.06)",  icon: <IndianRupee size={15} style={{ color: "#de1a1a" }} /> },
            { label: "Client Direct",    value: fmtRupee(totalClientDirect), color: "#3B82F6", bg: "rgba(59,130,246,0.06)", icon: <Receipt size={15} style={{ color: "#3B82F6" }} /> },
            { label: "Common Shared",    value: fmtRupee(totalCommon),       color: "#8B5CF6", bg: "rgba(139,92,246,0.06)", icon: <Layers size={15} style={{ color: "#8B5CF6" }} /> },
            { label: "Per Client/Brand", value: fmtRupee(perClientOverhead), color: "#10B981", bg: "rgba(16,185,129,0.06)", icon: <Building2 size={15} style={{ color: "#10B981" }} /> },
          ].map(k => (
            <div key={k.label} className="rounded-2xl py-5 px-4 flex flex-col items-center justify-center text-center gap-2"
              style={{ background: "#FFFFFF", border: `1.5px solid ${k.color}20`, boxShadow: "0 2px 12px rgba(0,0,0,0.04)", minHeight: "120px" }}>
              <div className="flex items-center gap-1.5">
                <div className="w-6 h-6 rounded-lg flex items-center justify-center" style={{ background: k.bg }}>{k.icon}</div>
                <p className="text-[11px] font-black uppercase tracking-wider" style={{ color: "#6B7280" }}>{k.label}</p>
              </div>
              <p className="text-[24px] font-black leading-none" style={{ fontFamily: "var(--font-jakarta)", color: k.color }}>{k.value}</p>
              {"sub" in k && k.sub && <p className="text-[10px] font-semibold" style={{ color: "#9CA3AF" }}>{k.sub}</p>}
            </div>
          ))}
        </div>

        {/* 3 Action Buttons */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          {[
            { key: "travel", label: "ADD TRAVEL COST",     icon: <Car size={16} />,      color: "#3B82F6", shadow: "rgba(59,130,246,0.4)",   grad: "linear-gradient(135deg,#3B82F6,#1D4ED8)" },
            { key: "client", label: "ADD CLIENT EXPENSE",  icon: <Megaphone size={16} />, color: "#DE1A1A", shadow: "rgba(222,26,26,0.4)",    grad: "linear-gradient(135deg,#DE1A1A,#991111)" },
            { key: "common", label: "ADD COMMON EXPENSE",  icon: <Building2 size={16} />, color: "#8B5CF6", shadow: "rgba(139,92,246,0.4)",   grad: "linear-gradient(135deg,#8B5CF6,#6D28D9)" },
          ].map(b => (
            <button key={b.key} onClick={() => setModal(b.key as "travel" | "client" | "common")}
              className="flex items-center justify-center gap-2.5 py-4 px-6 rounded-2xl font-black text-[13px] tracking-widest text-white transition-all active:translate-y-[3px]"
              style={{
                background: b.grad,
                boxShadow: `0 6px 0 ${b.shadow}, 0 8px 20px ${b.shadow}`,
                letterSpacing: "0.08em",
              }}
              onMouseEnter={e => (e.currentTarget.style.transform = "translateY(-2px)")}
              onMouseLeave={e => (e.currentTarget.style.transform = "translateY(0)")}
              onMouseDown={e => (e.currentTarget.style.transform = "translateY(4px)")}
              onMouseUp={e => (e.currentTarget.style.transform = "translateY(-2px)")}
            >
              {b.icon}
              {b.label}
            </button>
          ))}
        </div>

        {/* Expense Lists */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-5 items-start">

          {/* Client Direct */}
          <div className="rounded-2xl overflow-hidden flex flex-col" style={{ background: "#FFFFFF", border: "1px solid #E5E7EB", minHeight: "200px" }}>
            <div className="flex items-center gap-2.5 px-5 py-3.5 flex-shrink-0" style={{ borderBottom: "1px solid #F0F0F2", background: "#FAFAFA" }}>
              <Receipt size={14} style={{ color: "#3B82F6" }} />
              <h2 className="text-[12px] font-black uppercase tracking-wider" style={{ color: "#3B82F6" }}>Client Direct</h2>
            </div>
            {clientExpenses.length > 0 && (
              <div className="grid flex-shrink-0 px-4 py-2" style={{ gridTemplateColumns: "56px 28px 1fr 84px 48px", background: "#F8F9FB", borderBottom: "1px solid #F0F0F2" }}>
                <div className="text-[10px] font-black uppercase tracking-wider" style={{ color: "#3B82F6" }}>Date</div>
                <div />
                <div className="text-[10px] font-black uppercase tracking-wider" style={{ color: "#3B82F6" }}>Client</div>
                <div className="text-[10px] font-black uppercase tracking-wider text-right" style={{ color: "#3B82F6" }}>Amount</div>
                <div />
              </div>
            )}
            <div className="overflow-y-auto" style={{ maxHeight: "360px" }}>
              {clientExpenses.length === 0 ? (
                <div className="flex flex-col items-center py-12">
                  <AlertCircle size={28} style={{ color: "#E5E7EB" }} className="mb-2" />
                  <p className="text-[13px]" style={{ color: "#9CA3AF" }}>No client expenses this month</p>
                </div>
              ) : (
                clientExpenses.map((e, i) => (
                  <div key={e.id} className="grid items-center gap-2 px-4 py-2.5"
                    style={{ gridTemplateColumns: "56px 28px 1fr 84px 48px", borderBottom: "1px solid #F3F4F6", background: i % 2 === 0 ? "#FFFFFF" : "#FAFCFF" }}>
                    <span className="text-[10px] font-bold" style={{ color: "#9CA3AF" }}>{fmtDate(e.date)}</span>
                    <div className="w-6 h-6 rounded-md flex items-center justify-center flex-shrink-0"
                      style={{ background: TYPE_BG[e.type] ?? TYPE_BG.other, color: TYPE_COLOR[e.type] ?? TYPE_COLOR.other }}>
                      {TYPE_ICON[e.type] ?? TYPE_ICON.other}
                    </div>
                    <div className="min-w-0">
                      <div className="flex items-center gap-1.5 flex-wrap">
                        <p className="text-[12px] font-bold truncate" style={{ color: "#111111" }}>{e.client_name}</p>
                        <span className="text-[9px] px-1.5 py-0.5 rounded font-black capitalize flex-shrink-0"
                          style={{ background: TYPE_BG[e.type] ?? TYPE_BG.other, color: TYPE_COLOR[e.type] ?? TYPE_COLOR.other }}>{e.type}</span>
                      </div>
                      {(e.shoot_title || e.notes) && (
                        <p className="text-[10px] truncate" style={{ color: "#9CA3AF" }}>
                          {e.shoot_title ? e.shoot_title : ""}{e.notes ? (e.shoot_title ? ` · ${e.notes}` : e.notes) : ""}
                        </p>
                      )}
                    </div>
                    <span className="text-[12px] font-black text-right" style={{ fontFamily: "var(--font-jakarta)", color: "#111111" }}>
                      ₹{Math.round(e.amount).toLocaleString("en-IN")}
                    </span>
                    <div className="flex items-center justify-end gap-1.5">
                      <button onClick={() => { setEditClient(e); setModal("client") }} className="opacity-40 hover:opacity-90 transition-opacity">
                        <Pencil size={12} style={{ color: "#6B7280" }} />
                      </button>
                      <button onClick={() => handleDeleteClient(e.id)} disabled={isPending} className="opacity-30 hover:opacity-80 transition-opacity">
                        <Trash2 size={12} style={{ color: "#DC2626" }} />
                      </button>
                    </div>
                  </div>
                ))
              )}
            </div>
            {clientExpenses.length > 0 && (
              <div className="flex items-center justify-end px-5 py-3 flex-shrink-0 mt-auto"
                style={{ borderTop: "2px solid #F0F0F2", background: "#F8F9FB" }}>
                <span className="text-[14px] font-black" style={{ color: "#3B82F6", fontFamily: "var(--font-jakarta)" }}>{fmtRupee(totalClientDirect)}</span>
              </div>
            )}
          </div>

          {/* Common / Shared */}
          <div className="rounded-2xl overflow-hidden flex flex-col" style={{ background: "#FFFFFF", border: "1px solid #E5E7EB", minHeight: "200px" }}>
            <div className="flex items-center gap-2.5 px-5 py-3.5 flex-shrink-0" style={{ borderBottom: "1px solid #F0F0F2", background: "#FAFAFA" }}>
              <Layers size={14} style={{ color: "#8B5CF6" }} />
              <h2 className="text-[12px] font-black uppercase tracking-wider" style={{ color: "#8B5CF6" }}>Common / Shared</h2>
            </div>
            {commonExpenses.length > 0 && (
              <div className="grid flex-shrink-0 px-4 py-2" style={{ gridTemplateColumns: "28px 1fr 84px 48px", background: "#F8F9FB", borderBottom: "1px solid #F0F0F2" }}>
                <div />
                <div className="text-[10px] font-black uppercase tracking-wider" style={{ color: "#8B5CF6" }}>Name</div>
                <div className="text-[10px] font-black uppercase tracking-wider text-right" style={{ color: "#8B5CF6" }}>Amount</div>
                <div />
              </div>
            )}
            {/* Scrollable body */}
            <div className="overflow-y-auto" style={{ maxHeight: "360px" }}>
              {commonExpenses.length === 0 ? (
                <div className="flex flex-col items-center py-12">
                  <AlertCircle size={28} style={{ color: "#E5E7EB" }} className="mb-2" />
                  <p className="text-[13px]" style={{ color: "#9CA3AF" }}>No common expenses this month</p>
                </div>
              ) : (
                commonExpenses.map((e, i) => {
                  const share = overheadDivisor > 0 ? e.amount / overheadDivisor : 0
                  return (
                    <div key={e.id} className="grid items-center gap-2 px-4 py-2.5"
                      style={{ gridTemplateColumns: "28px 1fr 84px 48px", borderBottom: "1px solid #F3F4F6", background: i % 2 === 0 ? "#FFFFFF" : "#FDFAFF" }}>
                      <div className="w-6 h-6 rounded-md flex items-center justify-center flex-shrink-0"
                        style={{ background: "rgba(139,92,246,0.08)", color: "#8B5CF6" }}>
                        <Layers size={12} />
                      </div>
                      <div className="min-w-0">
                        <p className="text-[12px] font-bold truncate" style={{ color: "#111111" }}>{e.name}</p>
                        <p className="text-[10px] truncate" style={{ color: "#9CA3AF" }}>
                          {e.notes ? `${e.notes} · ` : ""}{share > 0 ? `${fmtRupee(share)}/client` : ""}
                        </p>
                      </div>
                      <span className="text-[12px] font-black text-right" style={{ fontFamily: "var(--font-jakarta)", color: "#111111" }}>
                        ₹{Math.round(e.amount).toLocaleString("en-IN")}
                      </span>
                      <div className="flex items-center justify-end gap-1.5">
                        <button onClick={() => { setEditCommon(e); setModal("common") }}
                          className="opacity-40 hover:opacity-90 transition-opacity">
                          <Pencil size={12} style={{ color: "#6B7280" }} />
                        </button>
                        <button onClick={() => handleDeleteCommon(e.id)} disabled={isPending}
                          className="opacity-30 hover:opacity-80 transition-opacity">
                          <Trash2 size={12} style={{ color: "#DC2626" }} />
                        </button>
                      </div>
                    </div>
                  )
                })
              )}
            </div>
            {commonExpenses.length > 0 && (
              <div className="flex items-center justify-end px-5 py-3 flex-shrink-0 mt-auto"
                style={{ borderTop: "2px solid #F0F0F2", background: "#F8F9FB" }}>
                <span className="text-[14px] font-black" style={{ color: "#8B5CF6", fontFamily: "var(--font-jakarta)" }}>{fmtRupee(totalCommon)}</span>
              </div>
            )}
          </div>
        </div>

        {/* Per-Client Summary Table */}
        <div className="rounded-2xl overflow-hidden" style={{ background: "#FFFFFF", border: "1px solid #F0F0F2", boxShadow: "0 2px 12px rgba(0,0,0,0.05)" }}>
          <div className="flex items-center gap-2 px-6 py-4" style={{ borderBottom: "1px solid #F3F4F6" }}>
            <IndianRupee size={15} style={{ color: "#DE1A1A" }} />
            <span className="text-[13px] font-black uppercase tracking-wider" style={{ color: "#DE1A1A" }}>Client & Brand Cost Summary</span>
          </div>
          <div className="overflow-x-auto">
            <table style={{ minWidth: 500 }} className="w-full">
              <thead>
                <tr style={{ background: "#FAFAFA", borderBottom: "1px solid #F0F0F2" }}>
                  <th className="px-6 py-3 text-left text-[11px] font-bold uppercase tracking-wider" style={{ color: "#9CA3AF" }}>Client / Brand</th>
                  <th className="px-4 py-3 text-right text-[11px] font-bold uppercase tracking-wider" style={{ color: "#059669" }}>Employee Cost</th>
                  <th className="px-4 py-3 text-right text-[11px] font-bold uppercase tracking-wider" style={{ color: "#6366F1" }}>Direct Exp</th>
                  <th className="px-4 py-3 text-right text-[11px] font-bold uppercase tracking-wider" style={{ color: "#8B5CF6" }}>Common Share</th>
                  <th className="px-6 py-3 text-right text-[11px] font-bold uppercase tracking-wider" style={{ color: "#DE1A1A" }}>Total</th>
                </tr>
              </thead>
              <tbody>
                {clientSummaryRows.map((row, i) => (
                  <tr key={row.name} style={{ borderBottom: i < clientSummaryRows.length - 1 ? "1px solid #F9FAFB" : "none" }}
                    className="hover:bg-gray-50/60 transition-colors">
                    <td className="px-6 py-3">
                      <span className="text-[13px] font-bold" style={{ color: "#111111" }}>{row.name}</span>
                    </td>
                    <td className="px-4 py-3 text-right text-[13px] font-semibold" style={{ color: row.empCost > 0 ? "#059669" : "#9CA3AF" }}>
                      {row.empCost > 0 ? fmtRupee(row.empCost) : "₹0"}
                    </td>
                    <td className="px-4 py-3 text-right text-[13px] font-semibold" style={{ color: row.direct > 0 ? "#6366F1" : "#9CA3AF" }}>
                      {row.direct > 0 ? fmtRupee(row.direct) : "₹0"}
                    </td>
                    <td className="px-4 py-3 text-right text-[13px] font-semibold" style={{ color: "#8B5CF6" }}>
                      {fmtRupee(row.overhead)}
                    </td>
                    <td className="px-6 py-3 text-right">
                      <span className="text-[14px] font-black" style={{ color: "#DE1A1A" }}>{fmtRupee(row.total)}</span>
                    </td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr style={{ background: "#FAFAFA", borderTop: "2px solid #F0F0F2" }}>
                  <td className="px-6 py-3 text-[12px] font-black uppercase tracking-wider" style={{ color: "#374151" }}>TOTAL</td>
                  <td className="px-4 py-3 text-right text-[13px] font-black" style={{ color: "#059669" }}>{fmtRupee(clientSummaryRows.reduce((s, r) => s + r.empCost, 0))}</td>
                  <td className="px-4 py-3 text-right text-[13px] font-black" style={{ color: "#6366F1" }}>{fmtRupee(totalClientDirect)}</td>
                  <td className="px-4 py-3 text-right text-[13px] font-black" style={{ color: "#8B5CF6" }}>{fmtRupee(totalCommon)}</td>
                  <td className="px-6 py-3 text-right text-[15px] font-black" style={{ color: "#DE1A1A" }}>{fmtRupee(clientSummaryRows.reduce((s, r) => s + r.total, 0))}</td>
                </tr>
              </tfoot>
            </table>
          </div>
        </div>

      </div>

      {/* Modals */}
      {modal === "travel" && (
        <TravelTableModal shoots={shootRows} savedTravel={savedTravel} onClose={() => setModal(null)} />
      )}
      {modal === "client" && (
        <ClientExpenseModal
          clients={clientNames}
          selectedMonth={selectedMonth}
          editing={editingClient ?? undefined}
          onClose={() => { setModal(null); setEditClient(null) }}
        />
      )}
      {modal === "common" && (
        <CommonExpenseModal
          selectedMonth={selectedMonth}
          overheadDivisor={overheadDivisor}
          editing={editingCommon ?? undefined}
          onClose={() => { setModal(null); setEditCommon(null) }}
        />
      )}
    </div>
  )
}
