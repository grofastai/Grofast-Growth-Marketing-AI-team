"use client"

import { useState, useMemo, useTransition } from "react"
import { useRouter } from "next/navigation"
import {
  IndianRupee, Plus, Trash2, Pencil,
  Car, Megaphone, Monitor, Building2,
  Receipt, Layers, CheckCircle2, AlertCircle, Wallet,
} from "lucide-react"
import { PageHero } from "@/components/admin/PageHero"
import { FlatCard } from "@/components/ui/FlatCard"
import { SegmentedControl } from "@/components/ui/SegmentedControl"
import { DrawerPanel } from "@/components/ui/DrawerPanel"
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

// ── Client Expense Modal ──────────────────────────────────────────────────────

function ClientExpenseModalBody({ clients, selectedMonth, editing, onClose }: {
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
            <input type="date" max="2099-12-31" value={date} onChange={e => setDate(e.target.value)}
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
  )
}

// ── Common Expense Modal ──────────────────────────────────────────────────────

function CommonExpenseModalBody({ selectedMonth, overheadDivisor, editing, onClose }: {
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
  )
}

// ── Travel Table Modal ────────────────────────────────────────────────────────

function TravelTableModalBody({ shoots, savedTravel }: {
  shoots: ShootRow[]
  savedTravel: Record<string, number>
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
    <div>
      {totalEntered > 0 && (
        <p className="text-[12px] mb-3" style={{ color: "#6B7280" }}>
          Total entered: <strong style={{ color: "#3B82F6" }}>₹{Math.round(totalEntered).toLocaleString("en-IN")}</strong>
        </p>
      )}
      <div>
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
  const [openSection, setOpenSection]  = useState<"summary" | "direct" | "common" | null>("summary")

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

  // Cumulative client-direct spend by day this month — real data (client_expenses
  // has per-day dates; common_expenses only has a month, so it can't be charted
  // day-by-day and is left out of this trend line).
  const dailyTrend = useMemo(() => {
    const byDay: Record<number, number> = {}
    for (const e of clientExpenses) {
      const day = new Date(e.date + "T00:00:00").getDate()
      byDay[day] = (byDay[day] ?? 0) + e.amount
    }
    const daysInMonth = new Date(yr, mo, 0).getDate()
    let running = 0
    const points: number[] = []
    for (let d = 1; d <= daysInMonth; d++) {
      running += byDay[d] ?? 0
      points.push(running)
    }
    return points
  }, [clientExpenses, yr, mo])

  const chartW = 300, chartH = 60
  const chartMax = Math.max(...dailyTrend, 1)
  const stepX = dailyTrend.length > 1 ? chartW / (dailyTrend.length - 1) : chartW
  const linePoints = dailyTrend.map((v, i) => `${(i * stepX).toFixed(1)},${(chartH - (v / chartMax) * chartH).toFixed(1)}`).join(" ")
  const areaPoints = `0,${chartH} ${linePoints} ${chartW},${chartH}`

  return (
    <div className="min-h-screen" style={{
      background: "radial-gradient(circle at 15% 10%, rgba(222,26,26,0.05), transparent 45%), radial-gradient(circle at 90% 85%, rgba(99,102,241,0.05), transparent 45%), #FAFAFA",
    }}>
      <div className="p-4 md:p-6 xl:p-8 max-w-[1300px] mx-auto space-y-6">

        {/* Header */}
        <PageHero
          eyebrowIcon={<Wallet size={14} style={{ color: "#FFD700" }} />}
          title="Expenses"
          subtitle="Track client direct, common shared & overhead costs"
          rightSlot={
            <div className="flex items-center gap-2 px-4 py-2 rounded-xl" style={{ background: "rgba(255,255,255,0.12)" }}>
              <button onClick={() => goMonth(-1)} className="w-7 h-7 rounded-lg flex items-center justify-center text-white font-bold text-lg hover:bg-white/10 transition-colors">‹</button>
              <span className="text-[14px] font-black text-white px-2">{MONTHS_SHORT[mo - 1]} {yr}</span>
              <button onClick={() => goMonth(1)} className="w-7 h-7 rounded-lg flex items-center justify-center text-white font-bold text-lg hover:bg-white/10 transition-colors">›</button>
            </div>
          }
        />

        {/* Summary strip: total + category chips */}
        <FlatCard className="p-5">
          <p className="text-[11px] font-bold uppercase tracking-wider" style={{ color: "#9CA3AF" }}>Total · {MONTHS_SHORT[mo - 1]} {yr}</p>
          <p className="text-[30px] font-black leading-none" style={{ fontFamily: "var(--font-jakarta)", color: "#DE1A1A", fontVariantNumeric: "tabular-nums" }}>{fmtRupee(grandTotal)}</p>
          <div className="flex flex-wrap gap-2 mt-3">
            <span style={{ background: "rgba(59,130,246,0.1)", color: "#3B82F6", fontSize: 11, fontWeight: 800, padding: "5px 12px", borderRadius: 8, border: "1px solid rgba(59,130,246,0.2)" }}>🔵 Client Direct {fmtRupee(totalClientDirect)}</span>
            <span style={{ background: "rgba(139,92,246,0.1)", color: "#8B5CF6", fontSize: 11, fontWeight: 800, padding: "5px 12px", borderRadius: 8, border: "1px solid rgba(139,92,246,0.2)" }}>🟣 Common {fmtRupee(totalCommon)}</span>
            <span style={{ background: "rgba(16,185,129,0.1)", color: "#10B981", fontSize: 11, fontWeight: 800, padding: "5px 12px", borderRadius: 8, border: "1px solid rgba(16,185,129,0.2)" }}>🟢 Per Client {fmtRupee(perClientOverhead)}</span>
          </div>
        </FlatCard>

        {/* Spend trend: cumulative client-direct spend across the month */}
        <FlatCard className="p-5">
          <div className="flex items-center justify-between mb-3">
            <span className="text-[12px] font-bold" style={{ color: "#111111" }}>Client Direct — cumulative spend this month</span>
            <span className="text-[10px]" style={{ color: "#9CA3AF" }}>{MONTHS_SHORT[mo - 1]} {yr}</span>
          </div>
          <svg viewBox={`0 0 ${chartW} ${chartH}`} width="100%" height="80" preserveAspectRatio="none">
            <defs>
              <linearGradient id="expenseTrendFill" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="#DE1A1A" stopOpacity="0.16" />
                <stop offset="100%" stopColor="#DE1A1A" stopOpacity="0" />
              </linearGradient>
            </defs>
            <polygon points={areaPoints} fill="url(#expenseTrendFill)" />
            <polyline points={linePoints} fill="none" stroke="#DE1A1A" strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" />
          </svg>
        </FlatCard>

        {/* Single Add Expense trigger */}
        <button onClick={() => setModal("travel")}
          className="flex items-center justify-center gap-2.5 py-4 px-6 rounded-2xl font-black text-[13px] tracking-widest text-white transition-all"
          style={{
            background: "linear-gradient(135deg,#DE1A1A,#991111)",
            boxShadow: "0 6px 0 rgba(222,26,26,0.4), 0 8px 20px rgba(222,26,26,0.4)",
            letterSpacing: "0.08em",
            width: "100%",
          }}
        >
          <Plus size={16} />
          ADD EXPENSE
        </button>

        {/* Expense Lists */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-5 items-start">

          {/* Client Direct */}
          <FlatCard className="overflow-hidden flex flex-col">
            <button onClick={() => setOpenSection(s => s === "direct" ? null : "direct")}
              className="flex items-center justify-center gap-2.5 px-5 py-3 w-full relative">
              <Receipt size={14} style={{ color: "#3B82F6" }} />
              <h2 className="text-[12px] font-black uppercase tracking-wider" style={{ color: "#111111" }}>Client Direct</h2>
              <span style={{ position: "absolute", right: 16, color: "#9CA3AF", transform: openSection === "direct" ? "rotate(180deg)" : "none", transition: "transform 0.15s" }}>▾</span>
            </button>
            {openSection === "direct" && (<>
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
                        <p className="text-[12px] font-bold break-words" style={{ color: "#111111" }}>{e.client_name}</p>
                        <span className="text-[9px] px-1.5 py-0.5 rounded font-black capitalize flex-shrink-0"
                          style={{ background: TYPE_BG[e.type] ?? TYPE_BG.other, color: TYPE_COLOR[e.type] ?? TYPE_COLOR.other }}>{e.type}</span>
                      </div>
                      {(e.shoot_title || e.notes) && (
                        <p className="text-[10px] break-words" style={{ color: "#9CA3AF" }}>
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
              <div className="grid flex-shrink-0 px-4 py-3 mt-auto"
                style={{ gridTemplateColumns: "56px 28px 1fr 84px 48px", borderTop: "2px solid #F0F0F2", background: "#F8F9FB" }}>
                <div /><div /><div className="text-[11px] font-black text-right pr-2" style={{ color: "#9CA3AF", alignSelf: "center" }}>Total</div>
                <span className="text-[14px] font-black text-right" style={{ color: "#3B82F6", fontFamily: "var(--font-jakarta)" }}>{fmtRupee(totalClientDirect)}</span>
                <div />
              </div>
            )}
            </>)}
          </FlatCard>

          {/* Common / Shared */}
          <FlatCard className="overflow-hidden flex flex-col">
            <button onClick={() => setOpenSection(s => s === "common" ? null : "common")}
              className="flex items-center justify-center gap-2.5 px-5 py-3 w-full relative">
              <Layers size={14} style={{ color: "#8B5CF6" }} />
              <h2 className="text-[12px] font-black uppercase tracking-wider" style={{ color: "#111111" }}>Common / Shared</h2>
              <span style={{ position: "absolute", right: 16, color: "#9CA3AF", transform: openSection === "common" ? "rotate(180deg)" : "none", transition: "transform 0.15s" }}>▾</span>
            </button>
            {openSection === "common" && (<>
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
                        <p className="text-[12px] font-bold break-words" style={{ color: "#111111" }}>{e.name}</p>
                        <p className="text-[10px] break-words" style={{ color: "#9CA3AF" }}>
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
              <div className="grid flex-shrink-0 px-4 py-3 mt-auto"
                style={{ gridTemplateColumns: "28px 1fr 84px 48px", borderTop: "2px solid #F0F0F2", background: "#F8F9FB" }}>
                <div /><div className="text-[11px] font-black text-right pr-2" style={{ color: "#9CA3AF", alignSelf: "center" }}>Total</div>
                <span className="text-[14px] font-black text-right" style={{ color: "#8B5CF6", fontFamily: "var(--font-jakarta)" }}>{fmtRupee(totalCommon)}</span>
                <div />
              </div>
            )}
            </>)}
          </FlatCard>
        </div>

        {/* Cost Summary — per-client cards, open by default */}
        <FlatCard>
          <button onClick={() => setOpenSection(s => s === "summary" ? null : "summary")}
            className="w-full flex items-center justify-between px-6 py-4">
            <div className="flex items-center gap-2">
              <IndianRupee size={15} style={{ color: "#DE1A1A" }} />
              <span className="text-[13px] font-black uppercase tracking-wider" style={{ color: "#DE1A1A" }}>Client & Brand Cost Summary</span>
            </div>
            <span style={{ color: "#9CA3AF", transform: openSection === "summary" ? "rotate(180deg)" : "none", transition: "transform 0.15s" }}>▾</span>
          </button>
          {openSection === "summary" && (
            <div className="px-5 pb-5 grid grid-cols-1 sm:grid-cols-2 gap-3">
              {clientSummaryRows.map(row => (
                <FlatCard key={row.name} className="p-4" style={{ background: "#FAFAFA" }}>
                  <p className="text-[13px] font-bold mb-2" style={{ color: "#111111" }}>{row.name}</p>
                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <p className="text-[9px] font-bold uppercase tracking-wider" style={{ color: "#9CA3AF" }}>Employee</p>
                      <p className="text-[13px] font-black" style={{ color: row.empCost > 0 ? "#059669" : "#6B7280", fontVariantNumeric: "tabular-nums" }}>{fmtRupee(row.empCost)}</p>
                    </div>
                    <div>
                      <p className="text-[9px] font-bold uppercase tracking-wider" style={{ color: "#9CA3AF" }}>Direct</p>
                      <p className="text-[13px] font-black" style={{ color: row.direct > 0 ? "#6366F1" : "#6B7280", fontVariantNumeric: "tabular-nums" }}>{fmtRupee(row.direct)}</p>
                    </div>
                    <div>
                      <p className="text-[9px] font-bold uppercase tracking-wider" style={{ color: "#9CA3AF" }}>Common</p>
                      <p className="text-[13px] font-black" style={{ color: "#8B5CF6", fontVariantNumeric: "tabular-nums" }}>{fmtRupee(row.overhead)}</p>
                    </div>
                    <div>
                      <p className="text-[9px] font-bold uppercase tracking-wider" style={{ color: "#9CA3AF" }}>Total</p>
                      <p className="text-[15px] font-black" style={{ color: "#DE1A1A", fontVariantNumeric: "tabular-nums" }}>{fmtRupee(row.total)}</p>
                    </div>
                  </div>
                </FlatCard>
              ))}
              <FlatCard className="p-4 sm:col-span-2" style={{ background: "#F5F5F5" }}>
                <div className="flex items-center justify-between">
                  <span className="text-[12px] font-black uppercase tracking-wider" style={{ color: "#374151" }}>Total — all clients</span>
                  <span className="text-[16px] font-black" style={{ color: "#DE1A1A", fontVariantNumeric: "tabular-nums" }}>{fmtRupee(clientSummaryRows.reduce((s, r) => s + r.total, 0))}</span>
                </div>
              </FlatCard>
            </div>
          )}
        </FlatCard>

      </div>

      {/* Add Expense drawer */}
      <DrawerPanel
        open={modal !== null}
        onClose={() => { setModal(null); setEditClient(null); setEditCommon(null) }}
        widthClassName="w-full max-w-2xl"
        header={
          <SegmentedControl
            value={modal ?? "travel"}
            onChange={(v) => { setModal(v); setEditClient(null); setEditCommon(null) }}
            options={[
              { value: "travel", label: "Travel", icon: <Car size={13} /> },
              { value: "client", label: "Client", icon: <Megaphone size={13} /> },
              { value: "common", label: "Common", icon: <Building2 size={13} /> },
            ]}
          />
        }
      >
        {modal === "travel" && (
          <TravelTableModalBody shoots={shootRows} savedTravel={savedTravel} />
        )}
        {modal === "client" && (
          <ClientExpenseModalBody
            clients={clientNames}
            selectedMonth={selectedMonth}
            editing={editingClient ?? undefined}
            onClose={() => { setModal(null); setEditClient(null) }}
          />
        )}
        {modal === "common" && (
          <CommonExpenseModalBody
            selectedMonth={selectedMonth}
            overheadDivisor={overheadDivisor}
            editing={editingCommon ?? undefined}
            onClose={() => { setModal(null); setEditCommon(null) }}
          />
        )}
      </DrawerPanel>
    </div>
  )
}
