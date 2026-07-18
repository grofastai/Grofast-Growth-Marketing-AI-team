"use client"

import { useState, useMemo, useTransition } from "react"
import { useRouter } from "next/navigation"
import Image from "next/image"
import {
  IndianRupee, Plus, Trash2, Pencil,
  Car, Megaphone, Monitor, Building2,
  Receipt, Layers, CheckCircle2, AlertCircle,
  ChevronRight, Search, MoreVertical, TrendingUp, Users,
} from "lucide-react"
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
import { setCommonExpenseParticipation } from "@/lib/actions/clients"
import { todayIST } from "@/lib/utils/ist-date"

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

type CommonParticipant = {
  id: string
  name: string
  status: string
  isInternal: boolean
  included: boolean
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

function getInitials(name: string) {
  return name.split(" ").map(w => w[0]).filter(Boolean).slice(0, 2).join("").toUpperCase()
}

const AVATAR_COLORS = ["#DE1A1A", "#3B82F6", "#8B5CF6", "#10B981", "#F59E0B", "#EC4899", "#6366F1"]
function avatarColor(name: string) {
  let hash = 0
  for (let i = 0; i < name.length; i++) hash = (hash * 31 + name.charCodeAt(i)) >>> 0
  return AVATAR_COLORS[hash % AVATAR_COLORS.length]
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
  other:    "#6B1D3A",
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
          <label className="text-[11px] font-bold uppercase tracking-wider" style={{ color: "#6B1D3A" }}>Client</label>
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
                color: type === t ? TYPE_COLOR[t] : "#6B1D3A",
              }}>
              {TYPE_ICON[t]}
              {t}
            </button>
          ))}
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="text-[11px] font-bold uppercase tracking-wider" style={{ color: "#6B1D3A" }}>Date</label>
            <input type="date" min="2025-01-01" max={todayIST()} value={date} onChange={e => setDate(e.target.value)}
              className="mt-1 w-full rounded-xl px-3 py-2.5 text-[13px] outline-none"
              style={{ background: "#F9FAFB", border: "1px solid #E5E7EB", color: "#111111" }} />
          </div>
          <div>
            <label className="text-[11px] font-bold uppercase tracking-wider" style={{ color: "#6B1D3A" }}>Amount (₹)</label>
            <input type="number" value={amount} onChange={e => setAmount(e.target.value)}
              placeholder="0" min="0"
              className="mt-1 w-full rounded-xl px-3 py-2.5 text-[13px] outline-none"
              style={{ background: "#F9FAFB", border: "1px solid #E5E7EB", color: "#111111" }} />
          </div>
        </div>
        <div>
          <label className="text-[11px] font-bold uppercase tracking-wider" style={{ color: "#6B1D3A" }}>Notes (optional)</label>
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
          <label className="text-[11px] font-bold uppercase tracking-wider" style={{ color: "#6B1D3A" }}>Expense Name</label>
          <input type="text" value={name} onChange={e => setName(e.target.value)}
            placeholder="e.g. Office Rent, Adobe CC"
            className="mt-1 w-full rounded-xl px-3 py-2.5 text-[13px] outline-none"
            style={{ background: "#F9FAFB", border: "1px solid #E5E7EB", color: "#111111" }} />
        </div>
        <div>
          <label className="text-[11px] font-bold uppercase tracking-wider" style={{ color: "#6B1D3A" }}>Amount (₹)</label>
          <input type="number" value={amount} onChange={e => setAmount(e.target.value)}
            placeholder="0" min="0"
            className="mt-1 w-full rounded-xl px-3 py-2.5 text-[13px] outline-none"
            style={{ background: "#F9FAFB", border: "1px solid #E5E7EB", color: "#111111" }} />
        </div>
        {previewShare > 0 && (
          <div className="flex items-center gap-2 px-3 py-2.5 rounded-xl"
            style={{ background: "rgba(16,185,129,0.06)", border: "1px solid rgba(16,185,129,0.15)" }}>
            <Layers size={13} style={{ color: "#10B981" }} />
            <span className="text-[12px]" style={{ color: "#6B1D3A" }}>
              Per client share: <strong style={{ color: "#10B981" }}>{fmtRupee(previewShare)}</strong>
              <span style={{ color: "#6B1D3A" }}> ÷ {overheadDivisor}</span>
            </span>
          </div>
        )}
        <div>
          <label className="text-[11px] font-bold uppercase tracking-wider" style={{ color: "#6B1D3A" }}>Notes (optional)</label>
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

// ── Travel Tab ────────────────────────────────────────────────────────────────

function TravelTab({ shoots, savedTravel }: {
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
    <FlatCard className="overflow-hidden">
      <div className="flex items-center justify-between gap-2 px-6 py-4" style={{ borderBottom: "1px solid #EDEDED" }}>
        <div className="flex items-center gap-2">
          <Car size={15} style={{ color: "#3B82F6" }} />
          <span className="text-[13px] font-black uppercase tracking-wider" style={{ color: "#3B82F6" }}>Travel</span>
        </div>
        {totalEntered > 0 && (
          <span className="text-[12px]" style={{ color: "#6B1D3A" }}>
            Total entered: <strong style={{ color: "#3B82F6" }}>₹{Math.round(totalEntered).toLocaleString("en-IN")}</strong>
          </span>
        )}
      </div>
      {shoots.length === 0 ? (
        <div className="flex flex-col items-center py-16">
          <Car size={32} style={{ color: "#E5E7EB" }} className="mb-3" />
          <p className="text-[13px]" style={{ color: "#6B1D3A" }}>No shoots logged this month</p>
        </div>
      ) : (
        <div className="overflow-x-auto">
          <table style={{ minWidth: 720 }} className="w-full">
            <thead>
              <tr style={{ background: "#FAFAFA", borderBottom: "1px solid #EDEDED" }}>
                <th className="px-6 py-3 text-left text-[10px] font-bold uppercase tracking-wider whitespace-nowrap" style={{ color: "#6B1D3A" }}>Date</th>
                <th className="px-4 py-3 text-left text-[10px] font-bold uppercase tracking-wider whitespace-nowrap" style={{ color: "#111111" }}>Client</th>
                <th className="px-4 py-3 text-left text-[10px] font-bold uppercase tracking-wider whitespace-nowrap" style={{ color: "#800080" }}>Shoot Title</th>
                <th className="px-4 py-3 text-left text-[10px] font-bold uppercase tracking-wider whitespace-nowrap" style={{ color: "#003b49" }}>Member</th>
                <th className="px-4 py-3 text-center text-[10px] font-bold uppercase tracking-wider whitespace-nowrap" style={{ color: "#1d4289" }}>Hrs</th>
                <th className="px-4 py-3 text-right text-[10px] font-bold uppercase tracking-wider whitespace-nowrap" style={{ color: "#3B82F6" }}>Travel ₹</th>
                <th className="px-6 py-3 text-right text-[10px] font-bold uppercase tracking-wider whitespace-nowrap" style={{ color: "#111111" }}>Action</th>
              </tr>
            </thead>
            <tbody>
              {shoots.map((row, i) => {
                const isSaving = saving === row.key
                const isSaved  = saved[row.key]
                const hasVal   = parseFloat(localAmounts[row.key] ?? "") > 0
                return (
                  <tr key={row.key} style={{ borderBottom: i < shoots.length - 1 ? "1px solid #F5F5F5" : "none" }}>
                    <td className="px-6 py-3 whitespace-nowrap text-[12px] font-bold uppercase" style={{ color: "#6B1D3A" }}>{fmtDate(row.date)}</td>
                    <td className="px-4 py-3 text-[12px] font-bold whitespace-nowrap" style={{ color: "#111111", maxWidth: 120, overflow: "hidden", textOverflow: "ellipsis" }}>{row.clientName}</td>
                    <td className="px-4 py-3 text-[12px] font-semibold uppercase whitespace-nowrap" style={{ color: "#800080", maxWidth: 160, overflow: "hidden", textOverflow: "ellipsis" }}>{row.title || "—"}</td>
                    <td className="px-4 py-3 text-[12px] font-semibold uppercase whitespace-nowrap" style={{ color: "#003b49" }}>{row.memberName}</td>
                    <td className="px-4 py-3 text-[12px] font-semibold text-center" style={{ color: "#1d4289" }}>{row.durationHrs > 0 ? `${row.durationHrs}h` : "—"}</td>
                    <td className="px-4 py-3">
                      <input
                        type="number" min="0"
                        value={localAmounts[row.key] ?? ""}
                        onChange={e => setLocal(p => ({ ...p, [row.key]: e.target.value }))}
                        placeholder="0"
                        className="w-24 rounded-lg px-3 py-1.5 text-[13px] text-right outline-none"
                        style={{ background: hasVal ? "rgba(59,130,246,0.06)" : "#F9FAFB", border: `1px solid ${hasVal ? "rgba(59,130,246,0.3)" : "#E5E7EB"}`, color: "#111111", display: "block", marginLeft: "auto" }}
                      />
                    </td>
                    <td className="px-6 py-3 text-right">
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
        </div>
      )}
    </FlatCard>
  )
}

// ── Main Component ────────────────────────────────────────────────────────────

export default function ExpensesClient({
  updates, users, clientExpenses, commonExpenses, activeClients, commonParticipation, selectedMonth, employeeCostByClient,
}: {
  updates: UpdateRow[]
  users: MemberUser[]
  clientExpenses: ClientExpense[]
  commonExpenses: CommonExpense[]
  activeClients: ActiveClient[]
  commonParticipation: CommonParticipant[]
  selectedMonth: string
  employeeCostByClient: Record<string, number>
}) {
  const router = useRouter()
  const [modal, setModal]             = useState<"client" | "common" | null>(null)
  const [editingClient, setEditClient] = useState<ClientExpense | null>(null)
  const [editingCommon, setEditCommon] = useState<CommonExpense | null>(null)
  const [isPending, start]             = useTransition()
  const [activeTab, setActiveTab]      = useState<"summary" | "direct" | "common" | "travel">("summary")
  const [showParticipation, setShowParticipation] = useState(false)
  const [clientFilter, setClientFilter] = useState("all")
  const [search, setSearch]            = useState("")
  const [viewDetailsClient, setViewDetailsClient] = useState<string | null>(null)

  const [yr, mo] = selectedMonth.split("-").map(Number)

  function goMonth(delta: number) {
    let nm = mo + delta; let ny = yr
    if (nm < 1)  { nm = 12; ny-- }
    if (nm > 12) { nm = 1;  ny++ }
    router.push(`/admin/expenses?month=${ny}-${String(nm).padStart(2, "0")}`)
  }

  // Who actually shares this month's common cost — the admin's explicit checklist
  // choice (see the Common tab), not an inferred active/past status or date range.
  // Internal Brands are now real checklist entries too (see commonParticipation), so
  // they're counted here once via the checklist — no separate hardcoded addition.
  const includedNames = new Set(commonParticipation.filter(c => c.included).map(c => c.name))
  const overheadDivisor = includedNames.size

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
      // Only clients checked in the Common tab's list share this month's overhead —
      // a client with real employee/direct cost but not checked still shows their real
      // cost, just with zero common share, instead of being forced into the split.
      const overhead = includedNames.has(name) ? perClientOverhead : 0
      return {
        name,
        empCost,
        direct,
        overhead,
        total: direct + overhead + empCost,
      }
    })
      // A client with zero employee cost, zero direct cost, and zero common share had
      // nothing happen this month at all — showing them is pure clutter, not signal.
      // Every real past client (any actual work or expense that month) still shows.
      .filter(r => r.total > 0)
      .sort((a, b) => b.total - a.total)
  }, [clientExpenses, activeClients, perClientOverhead, employeeCostByClient, includedNames])

  const activeClientNames = useMemo(() => new Set(activeClients.map(c => c.name)), [activeClients])

  const filteredSummaryRows = useMemo(() => {
    return clientSummaryRows
      .filter(r => clientFilter === "all" || r.name === clientFilter)
      .filter(r => !search.trim() || r.name.toLowerCase().includes(search.trim().toLowerCase()))
  }, [clientSummaryRows, clientFilter, search])

  const viewDetailsRow = useMemo(
    () => clientSummaryRows.find(r => r.name === viewDetailsClient) ?? null,
    [clientSummaryRows, viewDetailsClient]
  )
  const viewDetailsEntries = useMemo(
    () => clientExpenses.filter(e => e.client_name === viewDetailsClient),
    [clientExpenses, viewDetailsClient]
  )

  function handleDeleteClient(id: string) {
    start(async () => { await deleteClientExpense(id); router.refresh() })
  }
  function handleDeleteCommon(id: string) {
    start(async () => { await deleteCommonExpense(id); router.refresh() })
  }
  function handleToggleParticipation(clientId: string, included: boolean) {
    start(async () => { await setCommonExpenseParticipation(clientId, selectedMonth, included); router.refresh() })
  }

  const pctOfTotal = (v: number) => grandTotal > 0 ? Math.round((v / grandTotal) * 100) : 0

  return (
    <div className="min-h-screen" style={{ background: "#F8F9FB" }}>
      <div className="p-4 md:p-6 xl:p-8 max-w-[1300px] mx-auto space-y-5">

        {/* Header — red gradient hero, matching every other page in the app */}
        <div className="p-6 md:p-8" style={{
          position: "relative", overflow: "hidden", borderRadius: 20,
          background: "linear-gradient(135deg, #DE1A1A 0%, #8B1212 55%, #1A0808 100%)",
          boxShadow: "0 8px 32px rgba(180,0,0,0.35)",
        }}>
          <div style={{ position: "absolute", top: -50, right: -30, width: 200, height: 200, borderRadius: "50%", background: "rgba(255,255,255,0.05)", pointerEvents: "none" }} />
          <div style={{ position: "absolute", bottom: -40, left: 60, width: 150, height: 150, borderRadius: "50%", background: "rgba(255,255,255,0.04)", pointerEvents: "none" }} />

          <div className="flex items-start justify-between gap-4 pr-[130px] md:pr-[200px] xl:pr-[260px]" style={{ position: "relative", zIndex: 2 }}>
            <div style={{ maxWidth: "60%" }}>
              <div className="flex items-center gap-1.5 mb-2" style={{ fontSize: 12, color: "rgba(255,255,255,0.6)", fontWeight: 600 }}>
                <span>Admin Dashboard</span>
                <ChevronRight size={12} />
                <span style={{ color: "#fff", fontWeight: 700 }}>Expenses</span>
              </div>
              <h1 className="text-[28px] md:text-[34px] font-black" style={{ color: "#fff", fontFamily: "var(--font-jakarta)", margin: 0, lineHeight: 1.1 }}>Expenses</h1>
              <p className="text-[13px] mt-1" style={{ color: "rgba(255,255,255,0.7)" }}>Track client direct, common shared & overhead costs</p>
            </div>
            <div className="flex items-center gap-1 px-3 py-2 rounded-xl flex-shrink-0" style={{ background: "rgba(0,0,0,0.2)", border: "1px solid rgba(255,255,255,0.2)" }}>
              <button onClick={() => goMonth(-1)} className="w-6 h-6 rounded-lg flex items-center justify-center font-bold text-[15px]" style={{ color: "#fff" }}>‹</button>
              <span className="text-[13px] font-black px-1" style={{ color: "#fff" }}>{MONTHS_SHORT[mo - 1]} {yr}</span>
              <button onClick={() => goMonth(1)} className="w-6 h-6 rounded-lg flex items-center justify-center font-bold text-[15px]" style={{ color: "#fff" }}>›</button>
            </div>
          </div>
          {/* Illustration — anchored to the bottom-right of the reserved gutter (the same width the text row's padding leaves empty), so it can never overlap the text/pill row; sized off its own container (not vw, which scales off the full viewport and blew it up past the card's clipped edge) */}
          <div className="flex w-[130px] md:w-[200px] xl:w-[260px] items-end justify-end" style={{ position: "absolute", right: 0, top: 0, bottom: 0, zIndex: 1, pointerEvents: "none" }}>
            <Image src="/brand/expenses/expenses-hero-boy.png" alt="" width={500} height={500}
              style={{ width: "100%", height: "auto", display: "block" }} priority />
          </div>
        </div>

        {/* Summary strip: total + 3 category stat cards — highlighted card mirrors the active tab below */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          {(() => {
            const isTravelActive = activeTab === "travel"
            return (
              <div
                role="button" tabIndex={0}
                onClick={() => setActiveTab("travel")}
                className="rounded-2xl p-5 text-left transition-all"
                style={{
                  background: isTravelActive ? "linear-gradient(135deg,#DE1A1A,#991111)" : "#FFFFFF",
                  border: isTravelActive ? "none" : "1px solid #EDEDED",
                  position: "relative", overflow: "hidden", cursor: "pointer",
                  boxShadow: isTravelActive ? "0 10px 24px rgba(153,17,17,0.35)" : "none",
                  transform: isTravelActive ? "translateY(-2px)" : "none",
                }}>
                {isTravelActive && (
                  <div style={{ position: "absolute", top: -30, right: -30, width: 110, height: 110, borderRadius: "50%", background: "rgba(255,255,255,0.08)" }} />
                )}
                <p className="text-[11px] font-bold uppercase tracking-wider" style={{ color: isTravelActive ? "rgba(255,255,255,0.75)" : "#6B1D3A", position: "relative" }}>Total Expenses</p>
                <p className="text-[28px] font-black leading-none mt-2" style={{ fontFamily: "var(--font-jakarta)", color: isTravelActive ? "#fff" : "#DE1A1A", fontVariantNumeric: "tabular-nums", position: "relative" }}>{fmtRupee(grandTotal)}</p>
                <p className="text-[11px] mt-3" style={{ color: isTravelActive ? "rgba(255,255,255,0.7)" : "#6B1D3A", position: "relative" }}>{MONTHS_SHORT[mo - 1]} {yr}</p>
              </div>
            )
          })()}
          {([
            { key: "direct" as const, label: "Client Direct", value: totalClientDirect, color: "#3B82F6", dark: "#1D4ED8", icon: <Receipt size={15} /> },
            { key: "common" as const, label: "Common / Shared", value: totalCommon, color: "#8B5CF6", dark: "#6D28D9", icon: <Layers size={15} /> },
            { key: "summary" as const, label: "Per Client", value: perClientOverhead, color: "#10B981", dark: "#047857", icon: <TrendingUp size={15} /> },
          ] as const).map(s => {
            const isActive = activeTab === s.key
            return (
              <FlatCard key={s.label} className="p-5 transition-all" onClick={() => setActiveTab(s.key)}
                style={{
                  position: "relative", overflow: "hidden",
                  border: isActive ? "none" : "1px solid #EDEDED",
                  background: isActive ? `linear-gradient(135deg,${s.color},${s.dark})` : "#FFFFFF",
                  boxShadow: isActive ? `0 10px 24px ${s.color}40` : "none",
                  transform: isActive ? "translateY(-2px)" : "none",
                }}>
                {isActive && (
                  <div style={{ position: "absolute", top: -30, right: -30, width: 110, height: 110, borderRadius: "50%", background: "rgba(255,255,255,0.08)" }} />
                )}
                <div className="flex items-center gap-2 mb-2" style={{ position: "relative" }}>
                  <div className="w-8 h-8 rounded-lg flex items-center justify-center" style={{ background: isActive ? "rgba(255,255,255,0.18)" : `${s.color}15`, color: isActive ? "#fff" : s.color }}>{s.icon}</div>
                  <p className="text-[12px] font-bold" style={{ color: isActive ? "rgba(255,255,255,0.85)" : "#6B1D3A" }}>{s.label}</p>
                </div>
                <p className="text-[22px] font-black leading-none" style={{ fontFamily: "var(--font-jakarta)", color: isActive ? "#fff" : s.color, fontVariantNumeric: "tabular-nums", position: "relative" }}>{fmtRupee(s.value)}</p>
                <p className="text-[10px] mt-1" style={{ color: isActive ? "rgba(255,255,255,0.7)" : "#6B1D3A", position: "relative" }}>{pctOfTotal(s.value)}% of total</p>
                <div style={{ height: 4, borderRadius: 2, background: isActive ? "rgba(255,255,255,0.25)" : "#F0F0F0", marginTop: 8, overflow: "hidden", position: "relative" }}>
                  <div style={{ height: "100%", width: `${pctOfTotal(s.value)}%`, background: isActive ? "#fff" : s.color, borderRadius: 2 }} />
                </div>
              </FlatCard>
            )
          })}
        </div>

        {/* Promo/tip card + Add Expense */}
        <div className="flex flex-col md:flex-row items-stretch gap-2 sm:gap-3">
          <FlatCard className="p-3 sm:p-5 flex-1 flex items-center gap-3 sm:gap-4">
            <div className="w-11 h-11 sm:w-16 sm:h-16" style={{ borderRadius: 14, overflow: "hidden", flexShrink: 0, position: "relative" }}>
              <Image src="/brand/expenses/expenses-tip-boy.png" alt="" fill style={{ objectFit: "cover" }} />
            </div>
            <div>
              <p className="text-[12px] sm:text-[13px] font-black flex items-center gap-1.5" style={{ color: "#111111" }}><TrendingUp size={14} style={{ color: "#DE1A1A" }} /> Smart Expense Tracking</p>
              <p className="text-[11px] sm:text-[12px] mt-1" style={{ color: "#6B1D3A" }}>Monitor all your client wise expenses in one place. Analyse, compare and optimise your business spending.</p>
            </div>
          </FlatCard>
          <div className="flex items-center gap-2 flex-shrink-0">
            <button className="w-10 h-10 sm:w-11 sm:h-11 rounded-xl flex items-center justify-center flex-shrink-0" style={{ background: "#fff", border: "1px solid #EDEDED", color: "#DE1A1A" }}>
              <TrendingUp size={16} />
            </button>
            <button onClick={() => setModal("client")}
              className="flex items-center justify-center gap-2 py-2.5 px-5 sm:py-3 sm:px-6 rounded-xl font-bold text-[13px] text-white whitespace-nowrap"
              style={{ background: "linear-gradient(135deg,#DE1A1A,#991111)" }}
            >
              <Plus size={16} /> Add Expense
            </button>
          </div>
        </div>

        {/* Tabs + client filter + search */}
        <div className="flex flex-col md:flex-row md:items-center gap-3">
          <div className="flex gap-2 flex-1">
            {([
              { key: "direct" as const, label: "Client Direct", icon: <Receipt size={13} /> },
              { key: "common" as const, label: "Common / Shared", icon: <Layers size={13} /> },
              { key: "summary" as const, label: "Per Client", icon: <IndianRupee size={13} /> },
              { key: "travel" as const, label: "Travel", icon: <Car size={13} /> },
            ]).map(t => (
              <button key={t.key} onClick={() => setActiveTab(t.key)}
                className="flex items-center gap-1.5 px-4 py-2.5 rounded-xl text-[12px] font-bold transition-all"
                style={{
                  background: activeTab === t.key ? "linear-gradient(135deg,#DE1A1A,#991111)" : "#fff",
                  color: activeTab === t.key ? "#fff" : "#6B1D3A",
                  border: activeTab === t.key ? "none" : "1px solid #EDEDED",
                }}>
                {t.icon} {t.label}
              </button>
            ))}
          </div>
          {activeTab === "summary" && (
            <div className="flex items-center gap-2">
              <select value={clientFilter} onChange={e => setClientFilter(e.target.value)}
                className="px-3 py-2.5 rounded-xl text-[12px] font-semibold outline-none"
                style={{ background: "#fff", border: "1px solid #EDEDED", color: "#6B1D3A" }}>
                <option value="all">All Clients</option>
                {clientSummaryRows.map(r => <option key={r.name} value={r.name}>{r.name}</option>)}
              </select>
              <div className="relative">
                <Search size={13} style={{ position: "absolute", left: 10, top: "50%", transform: "translateY(-50%)", color: "#6B1D3A" }} />
                <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search client..."
                  className="pl-8 pr-3 py-2.5 rounded-xl text-[12px] outline-none"
                  style={{ background: "#fff", border: "1px solid #EDEDED", color: "#111111", width: 160 }} />
              </div>
            </div>
          )}
        </div>

        {/* Tab content */}
        {activeTab === "direct" && (
          <FlatCard className="overflow-hidden">
            <div className="flex items-center justify-between gap-2 px-6 py-4" style={{ borderBottom: "1px solid #EDEDED" }}>
              <div className="flex items-center gap-2">
                <Receipt size={15} style={{ color: "#3B82F6" }} />
                <span className="text-[13px] font-black uppercase tracking-wider" style={{ color: "#3B82F6" }}>Client Direct</span>
              </div>
            </div>
            {clientExpenses.length === 0 ? (
              <div className="flex flex-col items-center py-12">
                <AlertCircle size={28} style={{ color: "#E5E7EB" }} className="mb-2" />
                <p className="text-[13px]" style={{ color: "#6B1D3A" }}>No client expenses this month</p>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table style={{ minWidth: 720 }} className="w-full">
                  <thead>
                    <tr style={{ background: "#FAFAFA", borderBottom: "1px solid #EDEDED" }}>
                      <th className="px-6 py-3 text-left text-[10px] font-bold uppercase tracking-wider whitespace-nowrap" style={{ color: "#6B1D3A" }}>Date</th>
                      <th className="px-4 py-3 text-left text-[10px] font-bold uppercase tracking-wider whitespace-nowrap" style={{ color: "#111111" }}>Client</th>
                      <th className="px-4 py-3 text-left text-[10px] font-bold uppercase tracking-wider whitespace-nowrap" style={{ color: "#003b49" }}>Type</th>
                      <th className="px-4 py-3 text-left text-[10px] font-bold uppercase tracking-wider whitespace-nowrap" style={{ color: "#800080" }}>Details</th>
                      <th className="px-4 py-3 text-right text-[10px] font-bold uppercase tracking-wider whitespace-nowrap" style={{ color: "#111111" }}>Amount</th>
                      <th className="px-6 py-3 text-right text-[10px] font-bold uppercase tracking-wider whitespace-nowrap" style={{ color: "#111111" }}>Action</th>
                    </tr>
                  </thead>
                  <tbody>
                    {clientExpenses.map((e, i) => (
                      <tr key={e.id} style={{ borderBottom: i < clientExpenses.length - 1 ? "1px solid #F5F5F5" : "none" }}>
                        <td className="px-6 py-3 text-[12px] font-bold uppercase whitespace-nowrap" style={{ color: "#6B1D3A" }}>{fmtDate(e.date)}</td>
                        <td className="px-4 py-3 text-[12px] font-bold whitespace-nowrap" style={{ color: "#111111" }}>{e.client_name}</td>
                        <td className="px-4 py-3 whitespace-nowrap">
                          {e.type !== "other" ? (
                            <span className="text-[10px] font-bold px-2 py-0.5 rounded uppercase"
                              style={{ background: TYPE_BG[e.type] ?? TYPE_BG.other, color: TYPE_COLOR[e.type] ?? TYPE_COLOR.other }}>{e.type}</span>
                          ) : (
                            <span style={{ color: "#003b49" }}>—</span>
                          )}
                        </td>
                        <td className="px-4 py-3 text-[12px] font-semibold uppercase" style={{ color: "#800080" }}>
                          {e.shoot_title ? e.shoot_title : ""}{e.notes ? (e.shoot_title ? ` · ${e.notes}` : e.notes) : (!e.shoot_title ? "—" : "")}
                        </td>
                        <td className="px-4 py-3 text-right text-[13px] font-black whitespace-nowrap" style={{ color: "#111111", fontFamily: "var(--font-jakarta)" }}>
                          ₹{Math.round(e.amount).toLocaleString("en-IN")}
                        </td>
                        <td className="px-6 py-3">
                          <div className="flex items-center justify-end gap-2">
                            <button onClick={() => { setEditClient(e); setModal("client") }} className="opacity-40 hover:opacity-90 transition-opacity">
                              <Pencil size={13} style={{ color: "#6B1D3A" }} />
                            </button>
                            <button onClick={() => handleDeleteClient(e.id)} disabled={isPending} className="opacity-30 hover:opacity-80 transition-opacity">
                              <Trash2 size={13} style={{ color: "#DC2626" }} />
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                  <tfoot>
                    <tr style={{ background: "#FAFAFA", borderTop: "2px solid #EDEDED" }}>
                      <td colSpan={4} className="px-6 py-3 text-[11px] font-black uppercase tracking-wider" style={{ color: "#6B1D3A" }}>Total</td>
                      <td className="px-4 py-3 text-right text-[13px] font-black" style={{ color: "#3B82F6" }}>{fmtRupee(totalClientDirect)}</td>
                      <td />
                    </tr>
                  </tfoot>
                </table>
              </div>
            )}
          </FlatCard>
        )}

        {/* Common / Shared */}
        {activeTab === "common" && (
          <FlatCard className="overflow-hidden">
            <div className="flex items-center justify-between gap-2 px-6 py-4" style={{ borderBottom: "1px solid #EDEDED" }}>
              <div className="flex items-center gap-2">
                <Layers size={15} style={{ color: "#8B5CF6" }} />
                <span className="text-[13px] font-black uppercase tracking-wider" style={{ color: "#8B5CF6" }}>Common / Shared</span>
              </div>
              <button onClick={() => setShowParticipation(true)}
                className="flex items-center gap-2 transition-all duration-100 active:translate-y-[3px] shadow-[0_4px_0_#6D28D9] active:shadow-[0_0px_0_#6D28D9] hover:brightness-105"
                style={{
                  border: "none", cursor: "pointer", flexShrink: 0,
                  background: "linear-gradient(180deg, #A78BFA 0%, #8B5CF6 100%)",
                  padding: "10px 14px", borderRadius: 12,
                }}>
                <Users size={14} style={{ color: "#fff" }} strokeWidth={2.5} />
                <span className="text-[11px] font-black uppercase tracking-wide whitespace-nowrap" style={{ color: "#fff" }}>
                  Pick Common Clients
                </span>
                <span className="text-[11px] font-black px-2 py-0.5 rounded-full whitespace-nowrap" style={{ color: "#fff", background: "rgba(255,255,255,0.25)" }}>
                  {includedNames.size}/{commonParticipation.length}
                </span>
              </button>
            </div>
            {commonExpenses.length === 0 ? (
              <div className="flex flex-col items-center py-12">
                <AlertCircle size={28} style={{ color: "#E5E7EB" }} className="mb-2" />
                <p className="text-[13px]" style={{ color: "#6B1D3A" }}>No common expenses this month</p>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table style={{ minWidth: 640 }} className="w-full">
                  <thead>
                    <tr style={{ background: "#FAFAFA", borderBottom: "1px solid #EDEDED" }}>
                      <th className="px-6 py-3 text-left text-[10px] font-bold uppercase tracking-wider whitespace-nowrap" style={{ color: "#111111" }}>Name</th>
                      <th className="px-4 py-3 text-left text-[10px] font-bold uppercase tracking-wider whitespace-nowrap" style={{ color: "#800080" }}>Notes</th>
                      <th className="px-4 py-3 text-right text-[10px] font-bold uppercase tracking-wider whitespace-nowrap" style={{ color: "#8B5CF6" }}>Per Client</th>
                      <th className="px-4 py-3 text-right text-[10px] font-bold uppercase tracking-wider whitespace-nowrap" style={{ color: "#111111" }}>Amount</th>
                      <th className="px-6 py-3 text-right text-[10px] font-bold uppercase tracking-wider whitespace-nowrap" style={{ color: "#111111" }}>Action</th>
                    </tr>
                  </thead>
                  <tbody>
                    {commonExpenses.map((e, i) => {
                      const share = overheadDivisor > 0 ? e.amount / overheadDivisor : 0
                      return (
                        <tr key={e.id} style={{ borderBottom: i < commonExpenses.length - 1 ? "1px solid #F5F5F5" : "none" }}>
                          <td className="px-6 py-3 text-[12px] font-bold whitespace-nowrap" style={{ color: "#111111" }}>{e.name}</td>
                          <td className="px-4 py-3 text-[12px] font-semibold" style={{ color: "#800080" }}>{e.notes || "—"}</td>
                          <td className="px-4 py-3 text-right text-[12px] font-semibold whitespace-nowrap" style={{ color: share > 0 ? "#8B5CF6" : "#111111" }}>
                            {share > 0 ? fmtRupee(share) : "—"}
                          </td>
                          <td className="px-4 py-3 text-right text-[13px] font-black whitespace-nowrap" style={{ color: "#111111", fontFamily: "var(--font-jakarta)" }}>
                            ₹{Math.round(e.amount).toLocaleString("en-IN")}
                          </td>
                          <td className="px-6 py-3">
                            <div className="flex items-center justify-end gap-2">
                              <button onClick={() => { setEditCommon(e); setModal("common") }}
                                className="opacity-40 hover:opacity-90 transition-opacity">
                                <Pencil size={13} style={{ color: "#6B1D3A" }} />
                              </button>
                              <button onClick={() => handleDeleteCommon(e.id)} disabled={isPending}
                                className="opacity-30 hover:opacity-80 transition-opacity">
                                <Trash2 size={13} style={{ color: "#DC2626" }} />
                              </button>
                            </div>
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                  <tfoot>
                    <tr style={{ background: "#FAFAFA", borderTop: "2px solid #EDEDED" }}>
                      <td colSpan={3} className="px-6 py-3 text-[11px] font-black uppercase tracking-wider" style={{ color: "#6B1D3A" }}>Total</td>
                      <td className="px-4 py-3 text-right text-[13px] font-black" style={{ color: "#8B5CF6" }}>{fmtRupee(totalCommon)}</td>
                      <td />
                    </tr>
                  </tfoot>
                </table>
              </div>
            )}
          </FlatCard>
        )}

        {/* Travel */}
        {activeTab === "travel" && (
          <TravelTab shoots={shootRows} savedTravel={savedTravel} />
        )}

        {/* Client & Brand Cost Summary — table */}
        {activeTab === "summary" && (
          <FlatCard className="overflow-hidden">
            <div className="flex items-center gap-2 px-6 py-4" style={{ borderBottom: "1px solid #EDEDED" }}>
              <IndianRupee size={15} style={{ color: "#DE1A1A" }} />
              <span className="text-[13px] font-black uppercase tracking-wider" style={{ color: "#DE1A1A" }}>Client & Brand Cost Summary</span>
            </div>
            <div className="overflow-x-auto">
              <table style={{ minWidth: 640 }} className="w-full">
                <thead>
                  <tr style={{ background: "#FAFAFA", borderBottom: "1px solid #EDEDED" }}>
                    <th className="px-6 py-3 text-left text-[10px] font-bold uppercase tracking-wider whitespace-nowrap" style={{ color: "#6B1D3A" }}>Client / Brand</th>
                    <th className="px-4 py-3 text-right text-[10px] font-bold uppercase tracking-wider whitespace-nowrap" style={{ color: "#059669" }}>Employee</th>
                    <th className="px-4 py-3 text-right text-[10px] font-bold uppercase tracking-wider whitespace-nowrap" style={{ color: "#6366F1" }}>Direct</th>
                    <th className="px-4 py-3 text-right text-[10px] font-bold uppercase tracking-wider whitespace-nowrap" style={{ color: "#8B5CF6" }}>Common</th>
                    <th className="px-4 py-3 text-right text-[10px] font-bold uppercase tracking-wider whitespace-nowrap" style={{ color: "#DE1A1A" }}>Total</th>
                    <th className="px-6 py-3 text-right text-[10px] font-bold uppercase tracking-wider whitespace-nowrap" style={{ color: "#6B1D3A" }}>Action</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredSummaryRows.length === 0 ? (
                    <tr><td colSpan={6} className="px-6 py-10 text-center text-[13px]" style={{ color: "#6B1D3A" }}>No clients match this filter</td></tr>
                  ) : filteredSummaryRows.map((row, i) => {
                    const color = avatarColor(row.name)
                    const isActive = activeClientNames.has(row.name) || INTERNAL_BRAND_NAMES.has(row.name.toUpperCase())
                    return (
                      <tr key={row.name} style={{ borderBottom: i < filteredSummaryRows.length - 1 ? "1px solid #F5F5F5" : "none" }}>
                        <td className="px-6 py-3">
                          <div className="flex items-center gap-2.5">
                            <div className="rounded-full flex items-center justify-center flex-shrink-0" style={{ width: 32, height: 32, background: `${color}18`, color, fontSize: 11, fontWeight: 900 }}>{getInitials(row.name)}</div>
                            <div>
                              <div className="flex items-center gap-2">
                                <span className="text-[13px] font-bold break-words" style={{ color: "#111111" }}>{row.name}</span>
                                {isActive && <span className="text-[9px] font-bold px-2 py-0.5 rounded-full" style={{ background: "rgba(16,185,129,0.1)", color: "#10B981" }}>Active</span>}
                              </div>
                            </div>
                          </div>
                        </td>
                        <td className="px-4 py-3 text-right">
                          <div className="text-[13px] font-black" style={{ color: row.empCost > 0 ? "#059669" : "#6B1D3A", fontVariantNumeric: "tabular-nums" }}>{fmtRupee(row.empCost)}</div>
                        </td>
                        <td className="px-4 py-3 text-right">
                          <div className="text-[13px] font-black" style={{ color: row.direct > 0 ? "#6366F1" : "#6B1D3A", fontVariantNumeric: "tabular-nums" }}>{fmtRupee(row.direct)}</div>
                        </td>
                        <td className="px-4 py-3 text-right">
                          <div className="text-[13px] font-black" style={{ color: "#8B5CF6", fontVariantNumeric: "tabular-nums" }}>{fmtRupee(row.overhead)}</div>
                        </td>
                        <td className="px-4 py-3 text-right">
                          <div className="text-[14px] font-black" style={{ color: "#DE1A1A", fontVariantNumeric: "tabular-nums" }}>{fmtRupee(row.total)}</div>
                        </td>
                        <td className="px-6 py-3">
                          <div className="flex items-center justify-end gap-2">
                            <button onClick={() => setViewDetailsClient(row.name)}
                              className="text-[11px] font-bold px-3 py-1.5 rounded-lg whitespace-nowrap"
                              style={{ background: "rgba(222,26,26,0.06)", color: "#DE1A1A", border: "1px solid rgba(222,26,26,0.15)" }}>
                              View Details
                            </button>
                            <button className="w-7 h-7 rounded-lg flex items-center justify-center flex-shrink-0" style={{ color: "#6B1D3A" }}>
                              <MoreVertical size={14} />
                            </button>
                          </div>
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
                <tfoot>
                  <tr style={{ background: "#FAFAFA", borderTop: "2px solid #EDEDED" }}>
                    <td className="px-6 py-3 text-[11px] font-black uppercase tracking-wider" style={{ color: "#6B1D3A" }}>Total</td>
                    <td className="px-4 py-3 text-right text-[12px] font-black" style={{ color: "#059669" }}>{fmtRupee(filteredSummaryRows.reduce((s, r) => s + r.empCost, 0))}</td>
                    <td className="px-4 py-3 text-right text-[12px] font-black" style={{ color: "#6366F1" }}>{fmtRupee(filteredSummaryRows.reduce((s, r) => s + r.direct, 0))}</td>
                    <td className="px-4 py-3 text-right text-[12px] font-black" style={{ color: "#8B5CF6" }}>{fmtRupee(filteredSummaryRows.reduce((s, r) => s + r.overhead, 0))}</td>
                    <td className="px-4 py-3 text-right text-[13px] font-black" style={{ color: "#DE1A1A" }}>{fmtRupee(filteredSummaryRows.reduce((s, r) => s + r.total, 0))}</td>
                    <td />
                  </tr>
                </tfoot>
              </table>
            </div>
          </FlatCard>
        )}

      </div>

      {/* Add Expense drawer */}
      <DrawerPanel
        open={modal !== null}
        onClose={() => { setModal(null); setEditClient(null); setEditCommon(null) }}
        header={
          <SegmentedControl
            value={modal ?? "client"}
            onChange={(v) => { setModal(v); setEditClient(null); setEditCommon(null) }}
            options={[
              { value: "client", label: "Client", icon: <Megaphone size={13} /> },
              { value: "common", label: "Common", icon: <Building2 size={13} /> },
            ]}
          />
        }
      >
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

      {/* Common-cost participation — toggle list, internal brands pinned first */}
      <DrawerPanel
        open={showParticipation}
        onClose={() => setShowParticipation(false)}
        header={
          <div className="flex items-center gap-2">
            <span className="text-[14px] font-black" style={{ color: "#111111" }}>Common Cost Sharing</span>
            <span className="text-[11px] font-black px-2 py-0.5 rounded-full" style={{ color: "#8B5CF6", background: "rgba(139,92,246,0.1)" }}>
              {includedNames.size}/{commonParticipation.length}
            </span>
          </div>
        }
      >
        <div className="space-y-1">
          {commonParticipation.length === 0 ? (
            <p className="text-[12px]" style={{ color: "#6B1D3A" }}>No clients yet.</p>
          ) : commonParticipation.map((c, i) => {
            const prevWasInternal = i > 0 && commonParticipation[i - 1].isInternal
            const showDivider = c.isInternal ? i === 0 : (i === 0 || (prevWasInternal && !c.isInternal))
            return (
              <div key={c.id}>
                {showDivider && (
                  <p className="text-[9px] font-black uppercase tracking-wider px-1 pt-2 pb-1.5" style={{ color: "#9CA3AF" }}>
                    {c.isInternal ? "Internal Brands" : "Clients"}
                  </p>
                )}
                <div className="flex items-center gap-3 px-3 py-2.5 rounded-xl" style={{ background: c.included ? "rgba(139,92,246,0.05)" : "transparent" }}>
                  <span className="flex-1 text-[13px] font-bold truncate" style={{ color: "#111111" }}>{c.name}</span>
                  <span className="text-[9px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full flex-shrink-0"
                    style={{ color: c.status === "active" ? "#0F9D64" : "#7F1D2B", background: c.status === "active" ? "rgba(15,157,100,0.1)" : "rgba(127,29,43,0.1)" }}>
                    {c.status}
                  </span>
                  {/* Toggle switch */}
                  <button
                    onClick={() => handleToggleParticipation(c.id, !c.included)}
                    disabled={isPending}
                    aria-pressed={c.included}
                    style={{
                      width: 38, height: 22, borderRadius: 999, flexShrink: 0, position: "relative",
                      background: c.included ? "#8B5CF6" : "#E5E7EB",
                      border: "none", cursor: isPending ? "not-allowed" : "pointer", transition: "background 0.15s",
                    }}
                  >
                    <span style={{
                      position: "absolute", top: 2, left: c.included ? 18 : 2,
                      width: 18, height: 18, borderRadius: "50%", background: "#fff",
                      boxShadow: "0 1px 3px rgba(0,0,0,0.3)", transition: "left 0.15s",
                    }} />
                  </button>
                </div>
              </div>
            )
          })}
        </div>
      </DrawerPanel>

      {/* Client details drawer */}
      <DrawerPanel
        open={viewDetailsClient !== null}
        onClose={() => setViewDetailsClient(null)}
        header={<span className="text-[14px] font-black" style={{ color: "#111111" }}>{viewDetailsClient}</span>}
      >
        {viewDetailsRow && (
          <div className="space-y-5">
            <div className="grid grid-cols-2 gap-3">
              <FlatCard className="p-3">
                <p className="text-[9px] font-bold uppercase tracking-wider" style={{ color: "#6B1D3A" }}>Employee</p>
                <p className="text-[15px] font-black" style={{ color: "#059669", fontVariantNumeric: "tabular-nums" }}>{fmtRupee(viewDetailsRow.empCost)}</p>
              </FlatCard>
              <FlatCard className="p-3">
                <p className="text-[9px] font-bold uppercase tracking-wider" style={{ color: "#6B1D3A" }}>Direct</p>
                <p className="text-[15px] font-black" style={{ color: "#6366F1", fontVariantNumeric: "tabular-nums" }}>{fmtRupee(viewDetailsRow.direct)}</p>
              </FlatCard>
              <FlatCard className="p-3">
                <p className="text-[9px] font-bold uppercase tracking-wider" style={{ color: "#6B1D3A" }}>Common</p>
                <p className="text-[15px] font-black" style={{ color: "#8B5CF6", fontVariantNumeric: "tabular-nums" }}>{fmtRupee(viewDetailsRow.overhead)}</p>
              </FlatCard>
              <FlatCard className="p-3">
                <p className="text-[9px] font-bold uppercase tracking-wider" style={{ color: "#6B1D3A" }}>Total</p>
                <p className="text-[15px] font-black" style={{ color: "#DE1A1A", fontVariantNumeric: "tabular-nums" }}>{fmtRupee(viewDetailsRow.total)}</p>
              </FlatCard>
            </div>
            <div>
              <p className="text-[11px] font-black uppercase tracking-wider mb-2" style={{ color: "#6B1D3A" }}>Direct expense entries this month</p>
              {viewDetailsEntries.length === 0 ? (
                <p className="text-[12px]" style={{ color: "#6B1D3A" }}>No direct expenses logged for this client.</p>
              ) : (
                <div className="space-y-2">
                  {viewDetailsEntries.map(e => (
                    <FlatCard key={e.id} className="p-3 flex items-center justify-between">
                      <div>
                        <p className="text-[12px] font-bold uppercase" style={{ color: "#111111" }}>{e.type}</p>
                        <p className="text-[10px] font-semibold uppercase" style={{ color: "#6B1D3A" }}>{fmtDate(e.date)}{e.notes ? ` · ${e.notes}` : ""}</p>
                      </div>
                      <span className="text-[13px] font-black" style={{ color: "#111111", fontVariantNumeric: "tabular-nums" }}>{fmtRupee(e.amount)}</span>
                    </FlatCard>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}
      </DrawerPanel>
    </div>
  )
}
