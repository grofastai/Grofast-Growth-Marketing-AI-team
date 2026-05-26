"use client"

import { useState, useMemo, useTransition } from "react"
import { useRouter } from "next/navigation"
import Image from "next/image"
import {
  Video, Camera, Clock, IndianRupee, ChevronDown,
  Users, TrendingUp, TrendingDown, CheckCircle2, XCircle,
  Receipt, BarChart3, Loader2, Settings, Plus, Trash2,
  Pencil, RotateCcw, ArrowUpRight, Sparkles,
} from "lucide-react"
import { reviewExpense } from "@/lib/actions/expenses"
import {
  upsertPricingRate, deletePricingRate,
  updateEmployeeRate, upsertVideoCostOverride, clearVideoCostOverride,
} from "@/lib/actions/pricing"

// ── Types ─────────────────────────────────────────────────────────────────────

type EditingVideo = {
  id?: string
  video_name?: string
  client_name?: string
  duration?: string
  video_type?: string
  time_taken?: number
  revisions?: number
  date_given?: string
  date_finished?: string
}

type WorkEntry = {
  id?: string
  client_name?: string
  task_type?: "shoot" | "edit" | "upload" | "other"
  title?: string
  start_time?: string
  end_time?: string
  duration_hours?: number
  editing_videos?: EditingVideo[]
}

type UpdateRow = {
  id: string
  user_id: string
  date: string
  work_entries: WorkEntry[] | null
  shoot_count: number
  editing_count: number
  shoot_time_hours: number | null
  editing_time_hours: number | null
  working_hours: number | null
}

type MemberUser = {
  id: string
  name: string
  employee_id: string
  hourly_rate: number | null
  monthly_salary: number | null
}

type PricingRate = {
  video_type: string
  rate_per_video: number
}

type CostOverride = {
  video_uid: string
  manual_cost: number
}

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

// ── Helpers ───────────────────────────────────────────────────────────────────

function fmtDate(s: string | null | undefined) {
  if (!s) return "—"
  return new Date(s + "T12:00:00").toLocaleDateString("en-IN", {
    day: "numeric", month: "short", year: "numeric",
  })
}

function ini(name: string) {
  return name.split(" ").map(n => n[0] ?? "").join("").slice(0, 2).toUpperCase() || "?"
}

function fmtRupee(n: number) {
  return `₹${Math.round(n).toLocaleString("en-IN")}`
}

function derivePerHour(u: MemberUser): number {
  if (u.monthly_salary && u.monthly_salary > 0) return u.monthly_salary / 25 / 9
  return u.hourly_rate ?? 0
}

function getVideoTypeColor(type: string) {
  const map: Record<string, string> = {
    "Reel": "#E53935", "Short": "#F97316", "Long Form": "#3B82F6",
    "Story": "#A855F7", "Ad": "#F59E0B", "Video": "#16A34A",
  }
  return map[type] ?? "#6B7280"
}

const STATUS_STYLE = {
  pending:  { label: "Pending",  color: "#F59E0B", bg: "rgba(245,158,11,0.1)"  },
  approved: { label: "Approved", color: "#16A34A", bg: "rgba(22,163,74,0.1)"   },
  rejected: { label: "Rejected", color: "#de1a1a", bg: "rgba(222,26,26,0.1)"   },
}

const CATEGORY_COLORS: Record<string, string> = {
  "Marketing": "#E53935",
  "Shoots":    "#F97316",
  "Salaries":  "#8B5CF6",
  "Travel":    "#3B82F6",
  "Tools":     "#10B981",
  "Food":      "#F59E0B",
  "Other":     "#6B7280",
}

// ── Inline number editor ──────────────────────────────────────────────────────

function InlineEdit({
  value, prefix = "₹", suffix = "", placeholder = "0",
  onSave, dim = false,
}: {
  value: number; prefix?: string; suffix?: string; placeholder?: string
  onSave: (v: number) => void; dim?: boolean
}) {
  const [editing, setEditing] = useState(false)
  const [local, setLocal]     = useState("")

  if (editing) {
    return (
      <span className="inline-flex items-center gap-1">
        {prefix && <span className="text-[11px]" style={{ color: "#9CA3AF" }}>{prefix}</span>}
        <input
          autoFocus type="number" value={local}
          onChange={e => setLocal(e.target.value)}
          onBlur={() => { onSave(parseFloat(local) || 0); setEditing(false) }}
          onKeyDown={e => { if (e.key === "Enter") { onSave(parseFloat(local) || 0); setEditing(false) } if (e.key === "Escape") setEditing(false) }}
          className="w-20 text-[12px] px-2 py-0.5 rounded text-center"
          style={{ background: "#F9FAFB", border: "1px solid #de1a1a", color: "#111111", outline: "none" }}
        />
        {suffix && <span className="text-[11px]" style={{ color: "#9CA3AF" }}>{suffix}</span>}
      </span>
    )
  }
  return (
    <button onClick={() => { setLocal(value > 0 ? String(value) : ""); setEditing(true) }}
      className="inline-flex items-center gap-1 group" title="Click to edit">
      <span className="text-[12px] font-semibold" style={{ color: dim ? "#9CA3AF" : "#111111" }}>
        {value > 0 ? `${prefix}${value.toLocaleString("en-IN")}${suffix}` : `${prefix}—${suffix}`}
      </span>
      <Pencil size={9} className="opacity-0 group-hover:opacity-60 transition-opacity" style={{ color: "#6B7280" }} />
    </button>
  )
}

// ── Pricing settings panel ────────────────────────────────────────────────────

function PricingPanel({
  rates, users, onUpsertRate, onDeleteRate, onUpdateEmployeeRate,
}: {
  rates: PricingRate[]; users: MemberUser[]
  onUpsertRate: (type: string, rate: number) => void
  onDeleteRate: (type: string) => void
  onUpdateEmployeeRate: (userId: string, rate: number) => void
}) {
  const [open, setOpen]       = useState(false)
  const [newType, setNewType] = useState("")
  const [newRate, setNewRate] = useState("")

  function addRate() {
    const t = newType.trim(); const r = parseFloat(newRate)
    if (!t || isNaN(r) || r < 0) return
    onUpsertRate(t, r); setNewType(""); setNewRate("")
  }

  return (
    <div className="rounded-2xl overflow-hidden" style={{ background: "#F9FAFB", border: "1px solid #E5E7EB" }}>
      <button onClick={() => setOpen(p => !p)} className="w-full flex items-center gap-2.5 px-5 py-3.5 text-left">
        <Settings size={13} style={{ color: "#6B7280" }} />
        <span className="text-[13px] font-bold" style={{ color: "#374151" }}>Pricing Settings</span>
        <span className="text-[11px] ml-2" style={{ color: "#9CA3AF" }}>
          {rates.length} video types · {users.filter(u => (u.hourly_rate ?? 0) > 0).length} team rates set
        </span>
        <ChevronDown size={13} className={`ml-auto transition-transform duration-200 ${open ? "rotate-180" : ""}`} style={{ color: "#9CA3AF" }} />
      </button>
      {open && (
        <div className="px-5 pb-5 grid md:grid-cols-2 gap-6 border-t" style={{ borderColor: "#E5E7EB" }}>
          <div className="pt-4">
            <p className="text-[10px] font-bold uppercase tracking-[0.15em] mb-3" style={{ color: "#6B7280" }}>
              Video Type Rate Card <span className="normal-case font-normal">(fixed ₹ per video)</span>
            </p>
            <div className="space-y-1.5">
              {rates.map(r => (
                <div key={r.video_type} className="flex items-center gap-3 px-3 py-2 rounded-xl"
                  style={{ background: "#FFFFFF", border: "1px solid #E5E7EB" }}>
                  <span className="flex-1 text-[12px] font-semibold" style={{ color: "#374151" }}>{r.video_type}</span>
                  <InlineEdit value={r.rate_per_video} onSave={val => onUpsertRate(r.video_type, val)} />
                  <button onClick={() => onDeleteRate(r.video_type)} className="opacity-30 hover:opacity-80 transition-opacity">
                    <Trash2 size={12} style={{ color: "#DC2626" }} />
                  </button>
                </div>
              ))}
              {rates.length === 0 && <p className="text-[12px] py-2" style={{ color: "#9CA3AF" }}>No rates set yet</p>}
            </div>
            <div className="flex gap-2 mt-3">
              <input placeholder="Type (e.g. Reel)" value={newType} onChange={e => setNewType(e.target.value)}
                onKeyDown={e => e.key === "Enter" && addRate()}
                className="flex-1 rounded-xl px-3 py-2 text-[12px]"
                style={{ background: "#FFFFFF", border: "1px solid #E5E7EB", color: "#111111", outline: "none" }} />
              <input placeholder="₹ rate" type="number" value={newRate} onChange={e => setNewRate(e.target.value)}
                onKeyDown={e => e.key === "Enter" && addRate()}
                className="w-24 rounded-xl px-3 py-2 text-[12px]"
                style={{ background: "#FFFFFF", border: "1px solid #E5E7EB", color: "#111111", outline: "none" }} />
              <button onClick={addRate} className="flex items-center gap-1 px-3 py-2 rounded-xl text-[12px] font-bold"
                style={{ background: "rgba(222,26,26,0.08)", color: "#de1a1a", border: "1px solid rgba(222,26,26,0.15)" }}>
                <Plus size={12} /> Add
              </button>
            </div>
          </div>
          <div className="pt-4">
            <p className="text-[10px] font-bold uppercase tracking-[0.15em] mb-3" style={{ color: "#6B7280" }}>
              Team Member Rates <span className="normal-case font-normal">(₹ per hour)</span>
            </p>
            <div className="space-y-1.5">
              {users.map(u => (
                <div key={u.id} className="flex items-center gap-3 px-3 py-2 rounded-xl"
                  style={{ background: "#FFFFFF", border: "1px solid #E5E7EB" }}>
                  <div className="w-6 h-6 rounded-full flex items-center justify-center flex-shrink-0 text-[9px] font-bold"
                    style={{ background: "rgba(222,26,26,0.08)", color: "#de1a1a" }}>
                    {ini(u.name)}
                  </div>
                  <span className="flex-1 text-[12px] font-medium truncate" style={{ color: "#374151" }}>{u.name}</span>
                  <InlineEdit value={u.hourly_rate ?? 0} suffix="/hr" dim={!u.hourly_rate}
                    onSave={val => onUpdateEmployeeRate(u.id, val)} />
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

// ── Video cost calculation ─────────────────────────────────────────────────────

function calcVideoCost(
  video: EditingVideo, editorUserId: string,
  rateMap: Record<string, number>, userHourlyMap: Record<string, number>,
  overrideMap: Record<string, number>,
): { cost: number; isOverride: boolean; breakdown: string } {
  const uid = video.id ?? ""
  if (uid && overrideMap[uid] != null) return { cost: overrideMap[uid], isOverride: true, breakdown: "Manual override" }
  const typeRate   = rateMap[(video.video_type ?? "").toLowerCase()] ?? 0
  const hourlyRate = userHourlyMap[editorUserId] ?? 0
  const hours      = video.time_taken ?? 0
  const laborCost  = hourlyRate * hours
  const total      = typeRate + laborCost
  const parts: string[] = []
  if (typeRate > 0)   parts.push(`${fmtRupee(typeRate)} (type)`)
  if (laborCost > 0)  parts.push(`${fmtRupee(laborCost)} (${hours}h × ${fmtRupee(hourlyRate)}/hr)`)
  return { cost: total, isOverride: false, breakdown: parts.length > 0 ? parts.join(" + ") : "No rates set" }
}

// ── Donut Chart ───────────────────────────────────────────────────────────────

function DonutChart({ segments, total }: {
  segments: { name: string; amount: number; color: string }[]
  total: number
}) {
  const r = 54, cx = 80, cy = 80
  const circ = 2 * Math.PI * r
  let cum = 0
  return (
    <svg viewBox="0 0 160 160" className="w-full max-w-[140px]" style={{ display: "block" }}>
      <circle cx={cx} cy={cy} r={r} fill="none" stroke="#F3F4F6" strokeWidth={22} />
      {segments.map((seg) => {
        const pct = total > 0 ? seg.amount / total : 0
        const dash = `${pct * circ} ${circ}`
        const offset = -(cum * circ)
        cum += pct
        return (
          <circle key={seg.name} cx={cx} cy={cy} r={r}
            fill="none" stroke={seg.color} strokeWidth={22}
            strokeDasharray={dash} strokeDashoffset={offset}
            strokeLinecap="butt"
            style={{ transform: "rotate(-90deg)", transformOrigin: "80px 80px" }}
          />
        )
      })}
      <text x={cx} y={cy - 5} textAnchor="middle"
        style={{ fontSize: 13, fontWeight: 800, fill: "#111111", fontFamily: "var(--font-jakarta)" }}>
        {total > 0 ? `₹${Math.round(total / 1000)}K` : "₹0"}
      </text>
      <text x={cx} y={cy + 10} textAnchor="middle" style={{ fontSize: 9, fill: "#6B7280" }}>Total</text>
    </svg>
  )
}

// ── Main Component ────────────────────────────────────────────────────────────

const OWN_BRANDS = ["Masala Unlimit", "Kutty Karthi Vlog", "GroFast Digital", "A2Z Automobile", "Kaka Mutta"]

export default function ExpensesClient({
  updates, users, expenses, pricingRates, costOverrides,
}: {
  updates: UpdateRow[]
  users: MemberUser[]
  expenses: Expense[]
  pricingRates: PricingRate[]
  costOverrides: CostOverride[]
}) {
  const [tab, setTab]           = useState<"analytics" | "claims" | "profit" | "team" | "per_client">("analytics")
  const [clientName, setClient] = useState("")
  const [dateFrom, setFrom]     = useState("")
  const [dateTo, setTo]         = useState("")
  const [chargedAmt, setCharged]= useState("")

  const [localRates, setLocalRates]    = useState<PricingRate[]>(pricingRates)
  const [localUsers, setLocalUsers]    = useState<MemberUser[]>(users)
  const [localOverrides, setOverrides] = useState<Record<string, number>>(() => {
    const m: Record<string, number> = {}
    for (const o of costOverrides) m[o.video_uid] = o.manual_cost
    return m
  })

  const [editingOverride, setEditingOverride] = useState<string | null>(null)
  const [overrideInput, setOverrideInput]     = useState("")
  const [claimsTab, setClaimsTab] = useState<"pending" | "all">("pending")
  const [reviewId, setReviewId]   = useState<string | null>(null)
  const [reviewNote, setNote]     = useState("")
  const [isPending, start]        = useTransition()
  const router                    = useRouter()

  // ── Derived maps ──────────────────────────────────────────────────────────
  const userMap = useMemo(() => {
    const m: Record<string, MemberUser> = {}
    for (const u of localUsers) m[u.id] = u
    return m
  }, [localUsers])

  const rateMap = useMemo(() => {
    const m: Record<string, number> = {}
    for (const r of localRates) m[r.video_type.toLowerCase()] = r.rate_per_video
    return m
  }, [localRates])

  const hourlyMap = useMemo(() => {
    const m: Record<string, number> = {}
    for (const u of localUsers) { const r = derivePerHour(u); if (r > 0) m[u.id] = r }
    return m
  }, [localUsers])

  const allClients = useMemo(() => {
    const names = new Set<string>()
    for (const u of updates) for (const e of u.work_entries ?? []) {
      const cn = (e.client_name ?? "").trim()
      if (cn) names.add(cn)
    }
    return Array.from(names).sort()
  }, [updates])

  // ── Per-client employee cost breakdown (salary-derived) ───────────────────
  const perClientCosts = useMemo(() => {
    const userM = new Map(localUsers.map(u => [u.id, u]))
    const map: Record<string, Record<string, { name: string; hours: number; cost: number }>> = {}

    for (const row of updates) {
      const user = userM.get(row.user_id)
      if (!user) continue
      const perHour = derivePerHour(user)

      for (const entry of (row.work_entries ?? [])) {
        const addCost = (client: string, hours: number) => {
          if (!map[client]) map[client] = {}
          if (!map[client][user.id]) map[client][user.id] = { name: user.name, hours: 0, cost: 0 }
          map[client][user.id].hours += hours
          map[client][user.id].cost  += hours * perHour
        }

        if (entry.task_type === "edit" || entry.task_type === "shoot") {
          const client = (entry.client_name ?? "").trim() || "Unknown"
          addCost(client, entry.duration_hours ?? 0)
        }

        if (entry.task_type === "other") {
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          const clientNames: string[] = (entry as any).client_names ?? []
          if (clientNames.length > 0) {
            const splitHrs = (entry.duration_hours ?? 0) / clientNames.length
            for (const client of clientNames) addCost(client.trim() || "Unknown", splitHrs)
          } else {
            const client = (entry.client_name ?? "").trim() || "Unknown"
            addCost(client, entry.duration_hours ?? 0)
          }
        }
      }
    }
    return map
  }, [updates, localUsers])

  // ── Per-client summary (all clients) ──────────────────────────────────────
  const perClientData = useMemo(() => {
    const map: Record<string, {
      totalHours: number; videoCount: number; shootCount: number
      workCost: number; employees: Set<string>; days: Set<string>
    }> = {}
    for (const u of updates) {
      for (const entry of u.work_entries ?? []) {
        const cn = (entry.client_name ?? "").trim()
        if (!cn) continue
        if (!map[cn]) map[cn] = { totalHours: 0, videoCount: 0, shootCount: 0, workCost: 0, employees: new Set(), days: new Set() }
        const d = map[cn]
        const hrs = entry.duration_hours ?? 0
        d.totalHours += hrs
        d.employees.add(u.user_id)
        d.days.add(u.date)
        if (entry.task_type === "edit") {
          for (const v of entry.editing_videos ?? []) {
            d.videoCount++
            const { cost } = calcVideoCost(v, u.user_id, rateMap, hourlyMap, localOverrides)
            d.workCost += cost
          }
        } else if (entry.task_type === "shoot") {
          d.shootCount++
          d.workCost += (hourlyMap[u.user_id] ?? 0) * hrs
        } else if (entry.task_type === "other" || entry.task_type === "upload" || !entry.task_type) {
          d.workCost += (hourlyMap[u.user_id] ?? 0) * hrs
        }
      }
    }
    return Object.entries(map).map(([name, data]) => ({
      name,
      totalHours: data.totalHours,
      videoCount: data.videoCount,
      shootCount: data.shootCount,
      workCost: data.workCost,
      employeeCount: data.employees.size,
      employeeIds: Array.from(data.employees),
      activeDays: data.days.size,
    })).sort((a, b) => b.workCost - a.workCost)
  }, [updates, rateMap, hourlyMap, localOverrides])

  // ── Global KPIs ───────────────────────────────────────────────────────────
  const globalWorkCost      = useMemo(() => perClientData.reduce((s, c) => s + c.workCost, 0), [perClientData])
  const globalHours         = useMemo(() => perClientData.reduce((s, c) => s + c.totalHours, 0), [perClientData])
  const totalExpenseClaims  = useMemo(() => expenses.reduce((s, e) => s + e.amount, 0), [expenses])
  const approvedExpenses    = useMemo(() => expenses.filter(e => e.status === "approved").reduce((s, e) => s + e.amount, 0), [expenses])

  // ── Expense distribution by category ──────────────────────────────────────
  const expensesByCategory = useMemo(() => {
    const map: Record<string, number> = {}
    for (const e of expenses) {
      const cat = e.category || "Other"
      map[cat] = (map[cat] ?? 0) + e.amount
    }
    return Object.entries(map).map(([name, amount]) => ({
      name, amount, color: CATEGORY_COLORS[name] ?? "#6B7280",
    })).sort((a, b) => b.amount - a.amount)
  }, [expenses])

  // ── Pricing actions ───────────────────────────────────────────────────────
  function handleUpsertRate(videoType: string, rate: number) {
    setLocalRates(prev => {
      const exists = prev.find(r => r.video_type.toLowerCase() === videoType.toLowerCase())
      if (exists) return prev.map(r => r.video_type.toLowerCase() === videoType.toLowerCase() ? { ...r, rate_per_video: rate } : r)
      return [...prev, { video_type: videoType, rate_per_video: rate }]
    })
    upsertPricingRate(videoType, rate)
  }
  function handleDeleteRate(videoType: string) {
    setLocalRates(prev => prev.filter(r => r.video_type !== videoType))
    deletePricingRate(videoType)
  }
  function handleUpdateEmployeeRate(userId: string, rate: number) {
    setLocalUsers(prev => prev.map(u => u.id === userId ? { ...u, hourly_rate: rate } : u))
    updateEmployeeRate(userId, rate)
  }
  function handleSetOverride(videoUid: string, cost: number) {
    setOverrides(prev => ({ ...prev, [videoUid]: cost }))
    upsertVideoCostOverride(videoUid, cost)
    setEditingOverride(null)
  }
  function handleClearOverride(videoUid: string) {
    setOverrides(prev => { const n = { ...prev }; delete n[videoUid]; return n })
    clearVideoCostOverride(videoUid)
  }

  // ── Matched work entries (for profitability tab) ───────────────────────────
  const matchedEntries = useMemo(() => {
    if (!clientName) return []
    const result: { updateId: string; userId: string; date: string; entry: WorkEntry }[] = []
    for (const u of updates) {
      if (dateFrom && u.date < dateFrom) continue
      if (dateTo   && u.date > dateTo)   continue
      for (const entry of u.work_entries ?? []) {
        if ((entry.client_name ?? "").trim().toLowerCase() === clientName.toLowerCase()) {
          result.push({ updateId: u.id, userId: u.user_id, date: u.date, entry })
        }
      }
    }
    return result.sort((a, b) => b.date.localeCompare(a.date))
  }, [updates, clientName, dateFrom, dateTo])

  // ── Analytics (for profitability tab) ─────────────────────────────────────
  const analytics = useMemo(() => {
    if (!matchedEntries.length) return null
    type EmpData = { name: string; employeeId: string; userId: string; videoCount: number; shootCount: number; editHours: number; shootHours: number; otherHours: number; totalHours: number; dates: Set<string> }
    const empMap: Record<string, EmpData> = {}
    const shootSessions: { date: string; userId: string; title: string; duration: number; startTime: string; endTime: string }[] = []
    const editedVideos: { date: string; userId: string; video: EditingVideo }[] = []
    const otherEntries: { date: string; userId: string; duration: number; title: string }[] = []
    let totalShootHours = 0, totalEditHours = 0, totalOtherHours = 0, totalVideos = 0, totalShoots = 0

    for (const { date, userId, entry } of matchedEntries) {
      const user = userMap[userId]
      if (user && !empMap[userId]) empMap[userId] = { name: user.name, employeeId: user.employee_id, userId, videoCount: 0, shootCount: 0, editHours: 0, shootHours: 0, otherHours: 0, totalHours: 0, dates: new Set() }
      const emp = empMap[userId]
      const hrs = entry.duration_hours ?? 0
      if (emp) { emp.totalHours += hrs; emp.dates.add(date) }
      if (entry.task_type === "shoot") {
        shootSessions.push({ date, userId, title: entry.title ?? "Shoot", duration: hrs, startTime: entry.start_time ?? "", endTime: entry.end_time ?? "" })
        totalShootHours += hrs; totalShoots++
        if (emp) { emp.shootHours += hrs; emp.shootCount++ }
      } else if (entry.task_type === "edit") {
        for (const v of entry.editing_videos ?? []) { editedVideos.push({ date, userId, video: v }); totalVideos++; if (emp) emp.videoCount++ }
        totalEditHours += hrs
        if (emp) emp.editHours += hrs
      } else if (entry.task_type === "other" || entry.task_type === "upload" || !entry.task_type) {
        otherEntries.push({ date, userId, duration: hrs, title: entry.title ?? "Work" })
        totalOtherHours += hrs
        if (emp) emp.otherHours += hrs
      }
    }
    const employees = Object.values(empMap).sort((a, b) => b.totalHours - a.totalHours)
    const activeDays = new Set(matchedEntries.map(e => e.date)).size
    return {
      totalVideos, totalShoots, totalShootHours, totalEditHours, totalOtherHours,
      totalHours: totalShootHours + totalEditHours + totalOtherHours, activeDays, employees, otherEntries,
      shootSessions: shootSessions.sort((a, b) => b.date.localeCompare(a.date)),
      editedVideos: editedVideos.sort((a, b) => (b.video.date_finished ?? b.date).localeCompare(a.video.date_finished ?? a.date)),
    }
  }, [matchedEntries, userMap])

  const totalWorkCost = useMemo(() => {
    if (!analytics) return 0
    let total = 0
    for (const { userId, video } of analytics.editedVideos) { const { cost } = calcVideoCost(video, userId, rateMap, hourlyMap, localOverrides); total += cost }
    for (const s of analytics.shootSessions) total += (hourlyMap[s.userId] ?? 0) * s.duration
    for (const o of analytics.otherEntries) total += (hourlyMap[o.userId] ?? 0) * o.duration
    return total
  }, [analytics, rateMap, hourlyMap, localOverrides])

  const profitAnalysis = useMemo(() => {
    const charged = parseFloat(chargedAmt.replace(/[^\d.]/g, "")) || 0
    if (!charged || !totalWorkCost) return null
    const profit = charged - totalWorkCost
    const margin = totalWorkCost > 0 ? (profit / totalWorkCost) * 100 : 0
    return { charged, workCost: totalWorkCost, profit, margin }
  }, [chargedAmt, totalWorkCost])

  // ── Expense claims ────────────────────────────────────────────────────────
  const pendingClaims = expenses.filter(e => e.status === "pending")
  const shownClaims   = claimsTab === "pending" ? pendingClaims : expenses
  const totalPending  = pendingClaims.reduce((s, e) => s + e.amount, 0)

  function approveClaim(id: string) { start(async () => { await reviewExpense(id, "approved"); router.refresh() }) }
  function rejectClaim(id: string) {
    start(async () => { await reviewExpense(id, "rejected", reviewNote || undefined); setReviewId(null); setNote(""); router.refresh() })
  }

  // ── Render ────────────────────────────────────────────────────────────────
  const kpis = [
    { label: "Total Work Cost", value: globalWorkCost > 0 ? fmtRupee(globalWorkCost) : "₹0", sub: "all clients", color: "#E53935", bg: "rgba(229,57,53,0.06)", icon: <IndianRupee size={16} style={{ color: "#E53935" }} /> },
    { label: "Expense Claims",  value: fmtRupee(totalExpenseClaims), sub: `${pendingClaims.length} pending`, color: "#F59E0B", bg: "rgba(245,158,11,0.06)", icon: <Receipt size={16} style={{ color: "#F59E0B" }} /> },
    { label: "Active Clients",  value: String(allClients.length), sub: "from daily updates", color: "#8B5CF6", bg: "rgba(139,92,246,0.06)", icon: <Users size={16} style={{ color: "#8B5CF6" }} /> },
    { label: "Total Hours",     value: `${Math.round(globalHours)}h`, sub: "across all work", color: "#16A34A", bg: "rgba(22,163,74,0.06)", icon: <Clock size={16} style={{ color: "#16A34A" }} /> },
  ]

  const TABS = [
    { id: "analytics"  as const, label: "Client Analytics" },
    { id: "claims"     as const, label: `Expense Claims${pendingClaims.length > 0 ? ` (${pendingClaims.length})` : ""}` },
    { id: "profit"     as const, label: "Profitability" },
    { id: "team"       as const, label: "Team Costing" },
    { id: "per_client" as const, label: "Per Client Cost" },
  ]

  return (
    <div className="min-h-screen" style={{ background: "#F8F9FB" }}>
      <div className="p-4 md:p-6 xl:p-8 max-w-[1400px] mx-auto space-y-6">

        {/* ── Header ─────────────────────────────────────────────────────── */}
        <div className="flex items-start justify-between gap-4 flex-wrap" style={{
          background: "linear-gradient(135deg, #DE1A1A 0%, #8B1212 55%, #1A0808 100%)",
          borderRadius: 20, padding: "22px 24px",
          boxShadow: "0 8px 32px rgba(180,0,0,0.35)",
          position: "relative", overflow: "hidden",
        }}>
          <div style={{ position: "absolute", top: -30, right: 80, width: 150, height: 150, borderRadius: "50%", background: "rgba(255,255,255,0.05)", pointerEvents: "none" }} />
          <div style={{ position: "relative", zIndex: 1 }}>
            <h1 className="text-[32px] font-black leading-tight" style={{ fontFamily: "var(--font-jakarta)", color: "#FFFFFF" }}>
              Analytics &amp; Expenses
            </h1>
            <p className="text-sm mt-1" style={{ color: "rgba(255,255,255,0.72)" }}>
              Per-client cost breakdown, profitability, and expense claim review
            </p>
          </div>
          <div className="flex items-center gap-2 flex-wrap">
            <div className="relative">
              <select className="appearance-none pl-3 pr-8 py-2 rounded-xl text-[13px] font-semibold"
                style={{ background: "#FFFFFF", border: "1px solid #E5E7EB", color: "#374151", outline: "none" }}>
                <option>This Month</option>
                <option>Last Month</option>
                <option>All Time</option>
              </select>
              <ChevronDown size={13} className="absolute right-2.5 top-1/2 -translate-y-1/2 pointer-events-none" style={{ color: "#9CA3AF" }} />
            </div>
            <div className="relative">
              <select className="appearance-none pl-3 pr-8 py-2 rounded-xl text-[13px] font-semibold"
                style={{ background: "#FFFFFF", border: "1px solid #E5E7EB", color: "#374151", outline: "none" }}>
                <option>All Clients</option>
                {allClients.map(c => <option key={c}>{c}</option>)}
              </select>
              <ChevronDown size={13} className="absolute right-2.5 top-1/2 -translate-y-1/2 pointer-events-none" style={{ color: "#9CA3AF" }} />
            </div>
          </div>
        </div>

        {/* ── Hero: illustration + KPI cards ─────────────────────────────── */}
        <div className="grid grid-cols-1 lg:grid-cols-[45%_1fr] gap-5">
          {/* Pixar illustration */}
          <div className="relative rounded-3xl overflow-hidden flex items-end justify-center"
            style={{ minHeight: 260, background: "linear-gradient(135deg, #DE1A1A 0%, #8B1212 55%, #1A0808 100%)", boxShadow: "0 8px 40px rgba(180,0,0,0.45)" }}>
            <div style={{ position: "absolute", top: -40, right: -30, width: 180, height: 180, borderRadius: "50%", background: "rgba(255,255,255,0.06)", pointerEvents: "none" }} />
            <div style={{ position: "absolute", bottom: -30, left: 30, width: 140, height: 140, borderRadius: "50%", background: "rgba(255,255,255,0.04)", pointerEvents: "none" }} />
            <Image
              src="/brand/expenses-hero.png"
              alt="Analytics illustration"
              width={460}
              height={340}
              className="relative z-10 object-contain object-bottom w-full"
              style={{ maxHeight: 300 }}
              priority
            />
          </div>

          {/* KPI 2×2 grid */}
          <div className="grid grid-cols-2 gap-4">
            {kpis.map(k => (
              <div key={k.label} className="rounded-2xl p-5 flex flex-col justify-between"
                style={{ background: k.bg, border: `1.5px solid ${k.color}22`, boxShadow: "0 2px 12px rgba(0,0,0,0.04)" }}>
                <div className="flex items-center justify-between mb-3">
                  <div className="w-9 h-9 rounded-xl flex items-center justify-center"
                    style={{ background: `${k.color}15` }}>
                    {k.icon}
                  </div>
                  <ArrowUpRight size={14} style={{ color: k.color, opacity: 0.5 }} />
                </div>
                <div>
                  <p className="text-[26px] font-black leading-none mb-1"
                    style={{ fontFamily: "var(--font-jakarta)", color: k.color }}>
                    {k.value}
                  </p>
                  <p className="text-[12px] font-semibold" style={{ color: "#374151" }}>{k.label}</p>
                  <p className="text-[11px] mt-0.5" style={{ color: "#9CA3AF" }}>{k.sub}</p>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* ── Tab bar ────────────────────────────────────────────────────── */}
        <div className="overflow-x-auto -mx-4 md:mx-0 px-4 md:px-0">
          <div className="flex gap-1 p-1 rounded-2xl w-fit min-w-max"
            style={{ background: "#F3F4F6", border: "1px solid #E5E7EB" }}>
            {TABS.map(t => (
              <button key={t.id} onClick={() => setTab(t.id)}
                className="px-5 py-2 rounded-xl text-[13px] font-semibold transition-all whitespace-nowrap"
                style={tab === t.id
                  ? { background: "#FFFFFF", color: "#111111", boxShadow: "0 2px 8px rgba(0,0,0,0.10)" }
                  : { color: "#6B7280" }}>
                {t.label}
              </button>
            ))}
          </div>
        </div>

        {/* ══════════════ CLIENT ANALYTICS TAB ══════════════ */}
        {tab === "analytics" && (
          <div className="space-y-6">

            {/* Client cards — split into Our Brands + Clients */}
            {perClientData.length === 0 ? (
              <div className="flex flex-col items-center py-24 rounded-2xl"
                style={{ background: "rgba(0,0,0,0.02)", border: "1px dashed #E5E7EB" }}>
                <BarChart3 size={40} className="mb-3" style={{ color: "#E5E7EB" }} />
                <p className="text-[14px] font-semibold" style={{ color: "#9CA3AF" }}>No client data yet</p>
                <p className="text-[12px] mt-1" style={{ color: "#D1D5DB" }}>Team members submit daily updates to populate this view</p>
              </div>
            ) : (() => {
              const ownBrandSet = new Set(OWN_BRANDS.map(b => b.toLowerCase()))
              const ownBrands   = perClientData.filter(c => ownBrandSet.has(c.name.toLowerCase()))
              const clients     = perClientData.filter(c => !ownBrandSet.has(c.name.toLowerCase()))

              const statusOptions = [
                { label: "Top",        color: "#E53935", bg: "rgba(229,57,53,0.1)"   },
                { label: "High Volume",color: "#8B5CF6", bg: "rgba(139,92,246,0.1)"  },
                { label: "Growing",    color: "#F97316", bg: "rgba(249,115,22,0.1)"  },
                { label: "Active",     color: "#16A34A", bg: "rgba(22,163,74,0.1)"   },
              ]

              const renderCards = (list: typeof perClientData, accentColor: string) =>
                list.map((client, idx) => {
                  const status = statusOptions[Math.min(idx, statusOptions.length - 1)]
                  const maxCost = list[0]?.workCost ?? 1
                  const barPct  = Math.max(8, Math.round((client.workCost / maxCost) * 100))
                  return (
                    <div key={client.name} className="rounded-2xl p-5 flex flex-col gap-4"
                      style={{ background: "#FFFFFF", border: "1px solid #E5E7EB", boxShadow: "0 2px 16px rgba(0,0,0,0.05)" }}>
                      <div className="flex items-start justify-between gap-2">
                        <div>
                          <p className="text-[15px] font-black leading-tight" style={{ fontFamily: "var(--font-jakarta)", color: "#111111" }}>
                            {client.name}
                          </p>
                          <p className="text-[11px] mt-0.5" style={{ color: "#9CA3AF" }}>
                            {client.activeDays} active days · {client.employeeCount} members
                          </p>
                        </div>
                        <span className="text-[10px] font-bold px-2.5 py-1 rounded-full flex-shrink-0"
                          style={{ background: status.bg, color: status.color }}>
                          {status.label}
                        </span>
                      </div>

                      <div className="grid grid-cols-3 gap-2">
                        {[
                          { label: "Videos", value: client.videoCount || "—", color: "#E53935" },
                          { label: "Shoots", value: client.shootCount || "—", color: "#F97316" },
                          { label: "Hours",  value: `${client.totalHours.toFixed(0)}h`, color: "#8B5CF6" },
                        ].map(s => (
                          <div key={s.label} className="text-center rounded-xl py-2.5" style={{ background: "#F9FAFB" }}>
                            <p className="text-[17px] font-black" style={{ fontFamily: "var(--font-jakarta)", color: s.color }}>{s.value}</p>
                            <p className="text-[10px]" style={{ color: "#9CA3AF" }}>{s.label}</p>
                          </div>
                        ))}
                      </div>

                      <div>
                        <div className="flex items-center justify-between mb-1.5">
                          <span className="text-[11px] font-semibold" style={{ color: "#6B7280" }}>Work Cost</span>
                          <span className="text-[14px] font-black" style={{ fontFamily: "var(--font-jakarta)", color: client.workCost > 0 ? "#111111" : "#D1D5DB" }}>
                            {client.workCost > 0 ? fmtRupee(client.workCost) : "No rates set"}
                          </span>
                        </div>
                        <div className="h-1.5 rounded-full" style={{ background: "#F3F4F6" }}>
                          <div className="h-full rounded-full transition-all duration-500"
                            style={{ width: `${barPct}%`, background: accentColor }} />
                        </div>
                      </div>

                      <div className="flex items-center justify-between">
                        <div className="flex -space-x-2">
                          {client.employeeIds.slice(0, 4).map(uid => (
                            <div key={uid} className="w-7 h-7 rounded-full flex items-center justify-center text-[9px] font-bold ring-2 ring-white"
                              style={{ background: "rgba(222,26,26,0.1)", color: "#de1a1a" }}>
                              {ini(userMap[uid]?.name ?? "?")}
                            </div>
                          ))}
                          {client.employeeIds.length > 4 && (
                            <div className="w-7 h-7 rounded-full flex items-center justify-center text-[9px] font-bold ring-2 ring-white"
                              style={{ background: "#F3F4F6", color: "#6B7280" }}>
                              +{client.employeeIds.length - 4}
                            </div>
                          )}
                        </div>
                        <button
                          onClick={() => { setClient(client.name); setTab("profit") }}
                          className="flex items-center gap-1 px-3 py-1.5 rounded-xl text-[12px] font-bold transition-all hover:opacity-80"
                          style={{ background: "rgba(222,26,26,0.08)", color: "#de1a1a", border: "1px solid rgba(222,26,26,0.15)" }}>
                          View Details <ArrowUpRight size={11} />
                        </button>
                      </div>
                    </div>
                  )
                })

              return (
                <div className="space-y-6">
                  {/* Our Brands */}
                  {ownBrands.length > 0 && (
                    <div>
                      <div className="flex items-center gap-2 mb-3">
                        <div className="w-1 h-4 rounded-full" style={{ background: "#de1a1a" }} />
                        <h3 className="text-[12px] font-black uppercase tracking-[0.15em]" style={{ color: "#de1a1a" }}>Our Brands</h3>
                        <span className="text-[11px] font-medium" style={{ color: "#9CA3AF" }}>({ownBrands.length})</span>
                      </div>
                      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
                        {renderCards(ownBrands, "#de1a1a")}
                      </div>
                    </div>
                  )}

                  {/* Client Brands */}
                  {clients.length > 0 && (
                    <div>
                      <div className="flex items-center gap-2 mb-3">
                        <div className="w-1 h-4 rounded-full" style={{ background: "#6366F1" }} />
                        <h3 className="text-[12px] font-black uppercase tracking-[0.15em]" style={{ color: "#6366F1" }}>Clients</h3>
                        <span className="text-[11px] font-medium" style={{ color: "#9CA3AF" }}>({clients.length})</span>
                      </div>
                      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
                        {renderCards(clients, "#6366F1")}
                      </div>
                    </div>
                  )}
                </div>
              )
            })()}

            {/* Bottom row: Recent Expenses + Donut + Team overview + AI insight */}
            <div className="grid grid-cols-1 lg:grid-cols-[1.6fr_1fr] gap-5">

              {/* Recent Expense Transactions */}
              <div className="rounded-2xl overflow-hidden"
                style={{ background: "#FFFFFF", border: "1px solid #E5E7EB", boxShadow: "0 2px 16px rgba(0,0,0,0.04)" }}>
                <div className="flex items-center gap-2.5 px-5 py-4" style={{ borderBottom: "1px solid #F3F4F6" }}>
                  <Receipt size={14} style={{ color: "#de1a1a" }} />
                  <h2 className="text-[13px] font-black uppercase tracking-wider" style={{ fontFamily: "var(--font-jakarta)", color: "#111111" }}>
                    Recent Expense Transactions
                  </h2>
                  <span className="ml-auto text-[11px] font-bold px-2 py-0.5 rounded-full"
                    style={{ background: "rgba(0,0,0,0.04)", color: "#6B7280" }}>
                    {expenses.length} total
                  </span>
                </div>
                {expenses.length === 0 ? (
                  <div className="flex flex-col items-center py-12">
                    <Receipt size={28} style={{ color: "#E5E7EB" }} className="mb-2" />
                    <p className="text-[13px]" style={{ color: "#9CA3AF" }}>No expense claims yet</p>
                  </div>
                ) : (
                  <>
                    {/* Table header */}
                    <div className="hidden md:grid px-5 py-2.5 text-[10px] font-bold uppercase tracking-wider"
                      style={{ gridTemplateColumns: "90px 1fr 110px 90px 90px 80px", color: "#9CA3AF", borderBottom: "1px solid #F3F4F6" }}>
                      {["Date", "Description", "Employee", "Category", "Amount", "Status"].map(h => <span key={h}>{h}</span>)}
                    </div>
                    <div>
                      {expenses.slice(0, 5).map((e, i) => {
                        const user = Array.isArray(e.users) ? e.users[0] : e.users
                        const st = STATUS_STYLE[e.status] ?? STATUS_STYLE.pending
                        const catColor = CATEGORY_COLORS[e.category] ?? "#6B7280"
                        return (
                          <div key={e.id} className="px-5 py-3.5"
                            style={{ borderBottom: i < Math.min(expenses.length, 5) - 1 ? "1px solid #F9FAFB" : "none" }}>
                            {/* Mobile */}
                            <div className="flex items-center justify-between gap-3 md:hidden">
                              <div>
                                <p className="text-[13px] font-semibold" style={{ color: "#111111" }}>{e.description}</p>
                                <p className="text-[11px]" style={{ color: "#9CA3AF" }}>{user?.name} · {e.category} · {fmtDate(e.date)}</p>
                              </div>
                              <div className="text-right flex-shrink-0">
                                <p className="text-[13px] font-bold" style={{ color: "#111111" }}>₹{e.amount.toLocaleString("en-IN")}</p>
                                <span className="text-[10px] font-bold px-1.5 py-0.5 rounded-full"
                                  style={{ background: st.bg, color: st.color }}>{st.label}</span>
                              </div>
                            </div>
                            {/* Desktop */}
                            <div className="hidden md:grid gap-3 items-center"
                              style={{ gridTemplateColumns: "90px 1fr 110px 90px 90px 80px" }}>
                              <span className="text-[12px]" style={{ color: "#9CA3AF" }}>{fmtDate(e.date)}</span>
                              <span className="text-[13px] font-semibold truncate" style={{ color: "#111111" }}>{e.description}</span>
                              <div className="flex items-center gap-1.5 min-w-0">
                                <div className="w-5 h-5 rounded-full flex items-center justify-center flex-shrink-0 text-[8px] font-bold"
                                  style={{ background: "rgba(222,26,26,0.08)", color: "#de1a1a" }}>
                                  {user?.name ? ini(user.name) : "?"}
                                </div>
                                <span className="text-[11px] truncate" style={{ color: "#374151" }}>{user?.name ?? "—"}</span>
                              </div>
                              <span className="text-[11px] font-semibold px-2 py-0.5 rounded-full w-fit"
                                style={{ background: `${catColor}15`, color: catColor }}>
                                {e.category}
                              </span>
                              <span className="text-[13px] font-bold" style={{ color: "#111111" }}>
                                ₹{e.amount.toLocaleString("en-IN")}
                              </span>
                              <span className="text-[10px] font-bold px-2 py-0.5 rounded-full w-fit"
                                style={{ background: st.bg, color: st.color }}>{st.label}</span>
                            </div>
                          </div>
                        )
                      })}
                    </div>
                    {expenses.length > 5 && (
                      <div className="px-5 py-3 flex items-center justify-between"
                        style={{ borderTop: "1px solid #F3F4F6", background: "#FAFAFA" }}>
                        <span className="text-[11px]" style={{ color: "#9CA3AF" }}>Showing 5 of {expenses.length}</span>
                        <button onClick={() => setTab("claims")}
                          className="text-[12px] font-bold flex items-center gap-1"
                          style={{ color: "#de1a1a" }}>
                          View all <ArrowUpRight size={11} />
                        </button>
                      </div>
                    )}
                  </>
                )}
              </div>

              {/* Right panel */}
              <div className="space-y-4">

                {/* Expense Distribution donut */}
                <div className="rounded-2xl p-5"
                  style={{ background: "#FFFFFF", border: "1px solid #E5E7EB", boxShadow: "0 2px 16px rgba(0,0,0,0.04)" }}>
                  <p className="text-[13px] font-black uppercase tracking-wider mb-4"
                    style={{ fontFamily: "var(--font-jakarta)", color: "#111111" }}>
                    Expense Distribution
                  </p>
                  {expensesByCategory.length === 0 ? (
                    <p className="text-[12px] py-4 text-center" style={{ color: "#9CA3AF" }}>No expense data</p>
                  ) : (
                    <div className="flex items-center gap-4">
                      <DonutChart segments={expensesByCategory} total={totalExpenseClaims} />
                      <div className="flex-1 space-y-2">
                        {expensesByCategory.slice(0, 5).map(seg => (
                          <div key={seg.name} className="flex items-center justify-between gap-2">
                            <div className="flex items-center gap-1.5 min-w-0">
                              <div className="w-2.5 h-2.5 rounded-full flex-shrink-0" style={{ background: seg.color }} />
                              <span className="text-[11px] truncate" style={{ color: "#374151" }}>{seg.name}</span>
                            </div>
                            <span className="text-[11px] font-bold flex-shrink-0" style={{ color: "#111111" }}>
                              ₹{Math.round(seg.amount / 1000)}K
                            </span>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>

                {/* Team Cost Overview */}
                <div className="rounded-2xl p-5"
                  style={{ background: "#FFFFFF", border: "1px solid #E5E7EB", boxShadow: "0 2px 16px rgba(0,0,0,0.04)" }}>
                  <p className="text-[13px] font-black uppercase tracking-wider mb-4"
                    style={{ fontFamily: "var(--font-jakarta)", color: "#111111" }}>
                    Team Cost Overview
                  </p>
                  {localUsers.filter(u => u.employee_id).length === 0 ? (
                    <p className="text-[12px] py-2 text-center" style={{ color: "#9CA3AF" }}>No team members</p>
                  ) : (
                    <div className="space-y-3">
                      {localUsers.filter(u => u.employee_id).slice(0, 5).map(u => {
                        const rate = u.hourly_rate ?? 0
                        const maxRate = Math.max(...localUsers.map(x => x.hourly_rate ?? 0), 1)
                        const pct = Math.max(8, Math.round((rate / maxRate) * 100))
                        return (
                          <div key={u.id}>
                            <div className="flex items-center justify-between mb-1">
                              <div className="flex items-center gap-2">
                                <div className="w-6 h-6 rounded-full flex items-center justify-center text-[9px] font-bold"
                                  style={{ background: "rgba(222,26,26,0.08)", color: "#de1a1a" }}>
                                  {ini(u.name)}
                                </div>
                                <span className="text-[12px] font-semibold truncate max-w-[90px]" style={{ color: "#374151" }}>{u.name}</span>
                              </div>
                              <span className="text-[12px] font-bold" style={{ color: rate > 0 ? "#111111" : "#D1D5DB" }}>
                                {rate > 0 ? `₹${rate}/hr` : "—"}
                              </span>
                            </div>
                            <div className="h-1 rounded-full" style={{ background: "#F3F4F6" }}>
                              <div className="h-full rounded-full" style={{ width: `${pct}%`, background: "#de1a1a", opacity: rate > 0 ? 1 : 0.2 }} />
                            </div>
                          </div>
                        )
                      })}
                    </div>
                  )}
                </div>

                {/* AI Finance Insight */}
                <div className="rounded-2xl p-5"
                  style={{ background: "linear-gradient(135deg, #1A1A2E 0%, #16213E 100%)", border: "1px solid rgba(255,255,255,0.08)" }}>
                  <div className="flex items-center gap-2 mb-3">
                    <div className="w-7 h-7 rounded-lg flex items-center justify-center"
                      style={{ background: "rgba(139,92,246,0.3)" }}>
                      <Sparkles size={13} style={{ color: "#C4B5FD" }} />
                    </div>
                    <p className="text-[12px] font-bold" style={{ color: "#E5E7EB" }}>AI Finance Insight</p>
                  </div>
                  <p className="text-[12px] leading-relaxed" style={{ color: "#9CA3AF" }}>
                    {perClientData.length > 0
                      ? `${perClientData[0]?.name ?? "Top client"} is your highest-cost client this period${globalWorkCost > 0 ? `, accounting for ${Math.round(((perClientData[0]?.workCost ?? 0) / globalWorkCost) * 100)}% of total work cost` : ""}. ${pendingClaims.length > 0 ? `${pendingClaims.length} expense claim${pendingClaims.length > 1 ? "s" : ""} await your review.` : "All expense claims are reviewed."}`
                      : "No work entries recorded yet. Encourage your team to submit daily updates to see cost analytics here."}
                  </p>
                  {approvedExpenses > 0 && (
                    <div className="mt-3 pt-3" style={{ borderTop: "1px solid rgba(255,255,255,0.08)" }}>
                      <p className="text-[10px] font-bold uppercase tracking-wider mb-1" style={{ color: "#4B5563" }}>Approved This Period</p>
                      <p className="text-[18px] font-black" style={{ fontFamily: "var(--font-jakarta)", color: "#16A34A" }}>
                        {fmtRupee(approvedExpenses)}
                      </p>
                    </div>
                  )}
                </div>

              </div>
            </div>
          </div>
        )}

        {/* ══════════════ EXPENSE CLAIMS TAB ══════════════ */}
        {tab === "claims" && (
          <div className="space-y-5">
            {/* Summary pills */}
            <div className="flex flex-wrap gap-2">
              {[
                { label: "Pending Review",  value: pendingClaims.length,                       color: "#F59E0B", bg: "rgba(245,158,11,0.06)", border: "rgba(245,158,11,0.15)" },
                { label: "Pending Amount",  value: `₹${totalPending.toLocaleString("en-IN")}`, color: "#F59E0B", bg: "rgba(245,158,11,0.06)", border: "rgba(245,158,11,0.15)" },
                { label: "Approved Total",  value: fmtRupee(approvedExpenses),                 color: "#16A34A", bg: "rgba(22,163,74,0.06)",  border: "rgba(22,163,74,0.15)"  },
                { label: "All Claims",      value: expenses.length,                             color: "#111111", bg: "#FFFFFF",               border: "#E5E7EB"               },
              ].map(s => (
                <div key={s.label} className="flex items-center gap-3 px-4 py-2.5 rounded-xl"
                  style={{ background: s.bg, border: `1px solid ${s.border}` }}>
                  <span className="text-[17px] font-black" style={{ fontFamily: "var(--font-jakarta)", color: s.color }}>{s.value}</span>
                  <span className="text-[11px]" style={{ color: "#6B7280" }}>{s.label}</span>
                </div>
              ))}
            </div>

            {/* Sub-tabs */}
            <div className="flex gap-1 p-1 rounded-xl w-fit" style={{ background: "#F9FAFB", border: "1px solid #E5E7EB" }}>
              {([["pending", `Pending (${pendingClaims.length})`], ["all", "All Claims"]] as const).map(([v, label]) => (
                <button key={v} onClick={() => setClaimsTab(v)}
                  className="px-4 py-2 rounded-lg text-[13px] font-semibold transition-all"
                  style={claimsTab === v
                    ? { background: "#FFFFFF", color: "#111111", boxShadow: "0 1px 3px rgba(0,0,0,0.08)" }
                    : { color: "#6B7280" }}>
                  {label}
                </button>
              ))}
            </div>

            {shownClaims.length === 0 ? (
              <div className="flex flex-col items-center py-20 rounded-2xl" style={{ background: "rgba(0,0,0,0.02)", border: "1px solid #E5E7EB" }}>
                <Receipt size={32} style={{ color: "#E5E7EB" }} className="mb-3" />
                <p className="text-[13px] font-semibold" style={{ color: "#6B7280" }}>
                  {claimsTab === "pending" ? "No pending claims" : "No claims found"}
                </p>
              </div>
            ) : (
              <div className="space-y-2">
                {shownClaims.map(e => {
                  const user = Array.isArray(e.users) ? e.users[0] : e.users
                  const st   = STATUS_STYLE[e.status] ?? STATUS_STYLE.pending
                  return (
                    <div key={e.id} className="rounded-2xl p-5"
                      style={{ background: "#FFFFFF", border: "1px solid #E5E7EB", boxShadow: "0 1px 8px rgba(0,0,0,0.04)" }}>
                      <div className="flex items-start gap-4">
                        <div className="w-10 h-10 rounded-full flex items-center justify-center flex-shrink-0 text-[11px] font-bold"
                          style={{ background: "rgba(222,26,26,0.08)", color: "#de1a1a" }}>
                          {user?.name ? ini(user.name) : "?"}
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-start justify-between gap-4">
                            <div>
                              <div className="flex items-center gap-2">
                                <p className="text-[14px] font-bold" style={{ color: "#111111" }}>{user?.name ?? "Unknown"}</p>
                                <span className="text-[11px]" style={{ color: "#6B7280" }}>#{user?.employee_id}</span>
                              </div>
                              <p className="text-[12px] mt-0.5" style={{ color: "#6B7280" }}>{e.description} · {e.category} · {fmtDate(e.date)}</p>
                              {e.notes && <p className="text-[12px] mt-1" style={{ color: "#6B7280" }}>{e.notes}</p>}
                              {e.review_notes && <p className="text-[12px] mt-1.5 italic" style={{ color: "#6B7280" }}>Note: {e.review_notes}</p>}
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
                              <button onClick={() => approveClaim(e.id)} disabled={isPending}
                                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[12px] font-bold disabled:opacity-50"
                                style={{ background: "rgba(22,163,74,0.1)", color: "#16A34A", border: "1px solid rgba(22,163,74,0.2)" }}>
                                <CheckCircle2 size={12} /> Approve
                              </button>
                              {reviewId === e.id ? (
                                <div className="flex items-center gap-2 flex-1">
                                  <input placeholder="Rejection note (optional)" value={reviewNote}
                                    onChange={ev => setNote(ev.target.value)}
                                    className="flex-1 text-[12px] px-3 py-1.5 rounded-lg outline-none"
                                    style={{ background: "#F9FAFB", border: "1px solid #E5E7EB", color: "#111111" }} />
                                  <button onClick={() => rejectClaim(e.id)} disabled={isPending}
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
        )}

        {/* ══════════════ PROFITABILITY TAB ══════════════ */}
        {tab === "profit" && (
          <div className="space-y-5">
            {/* Config row */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 p-4 rounded-2xl"
              style={{ background: "#F9FAFB", border: "1px solid #E5E7EB" }}>
              <div>
                <label className="block text-[10px] font-bold uppercase tracking-[0.15em] mb-1.5" style={{ color: "#6B7280" }}>Client</label>
                <div className="relative">
                  <select value={clientName} onChange={e => setClient(e.target.value)}
                    className="w-full appearance-none rounded-xl px-3 py-2.5 text-[13px] font-semibold pr-8"
                    style={{ background: "#FFFFFF", border: "1px solid #E5E7EB", color: "#111111", outline: "none" }}>
                    <option value="">Choose client…</option>
                    {allClients.map(n => <option key={n} value={n}>{n}</option>)}
                  </select>
                  <ChevronDown size={13} className="absolute right-2.5 top-1/2 -translate-y-1/2 pointer-events-none" style={{ color: "#6B7280" }} />
                </div>
              </div>
              <div>
                <label className="block text-[10px] font-bold uppercase tracking-[0.15em] mb-1.5" style={{ color: "#6B7280" }}>From</label>
                <input type="date" value={dateFrom} onChange={e => setFrom(e.target.value)}
                  className="w-full rounded-xl px-3 py-2.5 text-[13px]"
                  style={{ background: "#FFFFFF", border: "1px solid #E5E7EB", color: "#111111", outline: "none", colorScheme: "light" }} />
              </div>
              <div>
                <label className="block text-[10px] font-bold uppercase tracking-[0.15em] mb-1.5" style={{ color: "#6B7280" }}>To</label>
                <input type="date" value={dateTo} onChange={e => setTo(e.target.value)}
                  className="w-full rounded-xl px-3 py-2.5 text-[13px]"
                  style={{ background: "#FFFFFF", border: "1px solid #E5E7EB", color: "#111111", outline: "none", colorScheme: "light" }} />
              </div>
              <div>
                <label className="block text-[10px] font-bold uppercase tracking-[0.15em] mb-1.5" style={{ color: "#6B7280" }}>Charged (₹)</label>
                <input type="text" placeholder="e.g. 25000" value={chargedAmt} onChange={e => setCharged(e.target.value)}
                  className="w-full rounded-xl px-3 py-2.5 text-[13px] font-semibold"
                  style={{ background: "#FFFFFF", border: "1px solid #E5E7EB", color: "#111111", outline: "none" }} />
              </div>
            </div>

            {!clientName && (
              <div className="flex flex-col items-center py-24 rounded-2xl" style={{ background: "rgba(0,0,0,0.02)", border: "1px dashed #E5E7EB" }}>
                <BarChart3 size={40} className="mb-3" style={{ color: "#E5E7EB" }} />
                <p className="text-[14px] font-semibold" style={{ color: "#9CA3AF" }}>Select a client to see profitability</p>
                <p className="text-[12px] mt-1" style={{ color: "#D1D5DB" }}>Per-video costs, profit/loss, team contribution</p>
              </div>
            )}
            {clientName && !analytics && (
              <div className="flex flex-col items-center py-24 rounded-2xl" style={{ background: "rgba(0,0,0,0.02)", border: "1px dashed #E5E7EB" }}>
                <BarChart3 size={40} className="mb-3" style={{ color: "#E5E7EB" }} />
                <p className="text-[14px] font-semibold" style={{ color: "#9CA3AF" }}>No work logged for {clientName}</p>
              </div>
            )}

            {clientName && analytics && (
              <>
                {/* Summary cards */}
                <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-6 gap-3">
                  {[
                    { emoji: "🎬", label: "Videos Edited",  value: analytics.totalVideos,                         color: "#E53935", bg: "rgba(229,57,53,0.07)",   border: "rgba(229,57,53,0.18)"   },
                    { emoji: "📸", label: "Shoot Sessions", value: analytics.totalShoots,                         color: "#F97316", bg: "rgba(249,115,22,0.07)",  border: "rgba(249,115,22,0.18)"  },
                    { emoji: "⏱️", label: "Editing Hours",  value: `${analytics.totalEditHours.toFixed(1)}h`,     color: "#8B5CF6", bg: "rgba(139,92,246,0.07)", border: "rgba(139,92,246,0.18)" },
                    { emoji: "🎥", label: "Shoot Hours",    value: `${analytics.totalShootHours.toFixed(1)}h`,    color: "#F59E0B", bg: "rgba(245,158,11,0.07)", border: "rgba(245,158,11,0.18)" },
                    { emoji: "🛠️", label: "Work Hours",     value: `${analytics.totalOtherHours.toFixed(1)}h`,    color: "#0EA5E9", bg: "rgba(14,165,233,0.07)", border: "rgba(14,165,233,0.18)" },
                    { emoji: "💰", label: "Work Cost",      value: totalWorkCost > 0 ? fmtRupee(totalWorkCost) : "—", color: "#16A34A", bg: "rgba(22,163,74,0.07)", border: "rgba(22,163,74,0.18)" },
                  ].map(s => (
                    <div key={s.label} className="rounded-xl p-4 text-center" style={{ background: s.bg, border: `1px solid ${s.border}` }}>
                      <div className="text-2xl mb-1.5">{s.emoji}</div>
                      <div className="text-[22px] font-black leading-none mb-1" style={{ fontFamily: "var(--font-jakarta)", color: s.color }}>{s.value}</div>
                      <div className="text-[11px] font-medium" style={{ color: "#374151" }}>{s.label}</div>
                    </div>
                  ))}
                </div>

                {/* Profit/Loss */}
                {profitAnalysis ? (
                  <div className="rounded-2xl p-5" style={{
                    background: profitAnalysis.profit >= 0 ? "rgba(22,163,74,0.04)" : "rgba(220,38,38,0.04)",
                    border: `1px solid ${profitAnalysis.profit >= 0 ? "rgba(22,163,74,0.18)" : "rgba(220,38,38,0.18)"}`,
                  }}>
                    <div className="flex items-center gap-2.5 mb-5">
                      {profitAnalysis.profit >= 0
                        ? <TrendingUp size={15} style={{ color: "#16A34A" }} />
                        : <TrendingDown size={15} style={{ color: "#DC2626" }} />}
                      <span className="text-[13px] font-black uppercase tracking-wider"
                        style={{ fontFamily: "var(--font-jakarta)", color: profitAnalysis.profit >= 0 ? "#16A34A" : "#DC2626" }}>
                        {profitAnalysis.profit >= 0 ? "Worth It — Profitable" : "Below Cost — Needs Review"}
                      </span>
                    </div>
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-6">
                      {[
                        { label: "Charged",   value: fmtRupee(profitAnalysis.charged),  color: "#111111", sub: null },
                        { label: "Work Cost", value: fmtRupee(profitAnalysis.workCost), color: "#111111", sub: "auto-calculated" },
                        { label: profitAnalysis.profit >= 0 ? "Profit" : "Loss",
                          value: `${profitAnalysis.profit >= 0 ? "+" : ""}${fmtRupee(profitAnalysis.profit)}`,
                          color: profitAnalysis.profit >= 0 ? "#16A34A" : "#DC2626", sub: null },
                        { label: "Margin",
                          value: `${profitAnalysis.margin >= 0 ? "+" : ""}${profitAnalysis.margin.toFixed(1)}%`,
                          color: profitAnalysis.margin >= 0 ? "#16A34A" : "#DC2626", sub: null },
                      ].map(s => (
                        <div key={s.label}>
                          <p className="text-[10px] font-bold uppercase tracking-wider mb-1" style={{ color: "#6B7280" }}>{s.label}</p>
                          <p className="text-[22px] font-black" style={{ fontFamily: "var(--font-jakarta)", color: s.color }}>{s.value}</p>
                          {s.sub && <p className="text-[10px] mt-0.5" style={{ color: "#9CA3AF" }}>{s.sub}</p>}
                        </div>
                      ))}
                    </div>
                  </div>
                ) : (
                  <div className="rounded-2xl p-4 flex items-center gap-3" style={{ background: "rgba(0,0,0,0.02)", border: "1px dashed #E5E7EB" }}>
                    <IndianRupee size={15} style={{ color: "#D1D5DB" }} />
                    <p className="text-[13px]" style={{ color: "#9CA3AF" }}>
                      {totalWorkCost > 0
                        ? `Work cost: ${fmtRupee(totalWorkCost)} — enter the charged amount above to see profit/loss`
                        : "Set up pricing rates in Team Costing, then enter the charged amount to see profit/loss"}
                    </p>
                  </div>
                )}

                {/* Per-video breakdown */}
                {analytics.editedVideos.length > 0 && (
                  <div className="rounded-2xl overflow-hidden" style={{ background: "#FFFFFF", border: "1px solid #E5E7EB" }}>
                    <div className="flex items-center gap-2.5 px-5 py-4" style={{ borderBottom: "1px solid #F3F4F6" }}>
                      <Video size={14} style={{ color: "#de1a1a" }} />
                      <h2 className="text-[13px] font-black uppercase tracking-wider" style={{ fontFamily: "var(--font-jakarta)", color: "#111111" }}>
                        Per-Video Cost Breakdown
                      </h2>
                      <span className="ml-auto text-[11px] font-bold px-2 py-0.5 rounded-full" style={{ background: "rgba(0,0,0,0.04)", color: "#6B7280" }}>
                        {analytics.editedVideos.length} videos
                      </span>
                    </div>
                    <div className="overflow-x-auto">
                    <div style={{ minWidth: 700 }}>
                    <div className="hidden md:grid gap-3 px-5 py-2.5 text-[10px] font-bold uppercase tracking-wider"
                      style={{ gridTemplateColumns: "1fr 100px 100px 80px 70px 120px 130px", color: "#9CA3AF", borderBottom: "1px solid #F3F4F6" }}>
                      {["Video Name", "Type", "Date Given", "Edit Time", "Revisions", "Done By", "Cost"].map(h => <span key={h}>{h}</span>)}
                    </div>
                    <div>
                      {analytics.editedVideos.map(({ date: _d, userId, video }, i) => {
                        const user = userMap[userId]
                        const typeColor = getVideoTypeColor(video.video_type ?? "")
                        const { cost, isOverride, breakdown } = calcVideoCost(video, userId, rateMap, hourlyMap, localOverrides)
                        const uid = video.id ?? ""
                        const isEditingThis = editingOverride === uid
                        return (
                          <div key={`${i}-${uid || i}`} className="px-5 py-3.5"
                            style={{ borderBottom: i < analytics.editedVideos.length - 1 ? "1px solid #F9FAFB" : "none" }}>
                            <div className="flex items-start justify-between gap-3 md:hidden">
                              <div>
                                <p className="text-[13px] font-semibold" style={{ color: "#111111" }}>{video.video_name || "Untitled"}</p>
                                <p className="text-[11px] mt-0.5" style={{ color: "#6B7280" }}>
                                  {video.video_type} · {video.time_taken ?? 0}h · {video.revisions ?? 0} rev{user ? ` · ${user.name}` : ""}
                                </p>
                              </div>
                              <span className="text-[13px] font-bold flex-shrink-0" style={{ color: isOverride ? "#3B82F6" : "#374151" }}>
                                {cost > 0 ? fmtRupee(cost) : "—"}
                              </span>
                            </div>
                            <div className="hidden md:grid gap-3 items-center"
                              style={{ gridTemplateColumns: "1fr 100px 100px 80px 70px 120px 130px" }}>
                              <span className="text-[13px] font-semibold truncate" style={{ color: "#111111" }}>{video.video_name || "Untitled"}</span>
                              <div>
                                {video.video_type
                                  ? <span className="text-[11px] font-bold px-2.5 py-0.5 rounded-full" style={{ background: `${typeColor}18`, color: typeColor }}>{video.video_type}</span>
                                  : <span style={{ color: "#D1D5DB" }}>—</span>}
                              </div>
                              <span className="text-[12px]" style={{ color: "#6B7280" }}>{fmtDate(video.date_given)}</span>
                              <div className="flex items-center gap-1">
                                <Clock size={11} style={{ color: "#8B5CF6" }} />
                                <span className="text-[12px] font-semibold" style={{ color: "#8B5CF6" }}>{video.time_taken ?? "—"}h</span>
                              </div>
                              <span className="text-[13px] font-bold text-center" style={{ color: (video.revisions ?? 0) > 2 ? "#DC2626" : "#374151" }}>
                                {video.revisions ?? 0}
                              </span>
                              <div className="flex items-center gap-2 min-w-0">
                                {user ? (
                                  <>
                                    <div className="w-6 h-6 rounded-full flex items-center justify-center flex-shrink-0 text-[9px] font-bold"
                                      style={{ background: "rgba(222,26,26,0.08)", color: "#de1a1a" }}>
                                      {ini(user.name)}
                                    </div>
                                    <span className="text-[11px] truncate" style={{ color: "#374151" }}>{user.name}</span>
                                  </>
                                ) : <span style={{ color: "#D1D5DB" }}>—</span>}
                              </div>
                              <div className="flex items-center gap-1.5">
                                {isEditingThis ? (
                                  <span className="inline-flex items-center gap-1">
                                    <span className="text-[11px]" style={{ color: "#9CA3AF" }}>₹</span>
                                    <input autoFocus type="number" value={overrideInput}
                                      onChange={e => setOverrideInput(e.target.value)}
                                      onBlur={() => { if (overrideInput && uid) handleSetOverride(uid, parseFloat(overrideInput)); else setEditingOverride(null) }}
                                      onKeyDown={e => {
                                        if (e.key === "Enter" && overrideInput && uid) handleSetOverride(uid, parseFloat(overrideInput))
                                        if (e.key === "Escape") setEditingOverride(null)
                                      }}
                                      className="w-20 text-[12px] px-2 py-0.5 rounded text-center"
                                      style={{ background: "#F9FAFB", border: "1px solid #3B82F6", color: "#111111", outline: "none" }} />
                                  </span>
                                ) : (
                                  <>
                                    <span className="text-[13px] font-bold"
                                      style={{ color: isOverride ? "#3B82F6" : cost > 0 ? "#374151" : "#D1D5DB" }}
                                      title={breakdown}>
                                      {cost > 0 ? fmtRupee(cost) : "—"}
                                    </span>
                                    {isOverride && (
                                      <button onClick={() => uid && handleClearOverride(uid)} title="Reset to auto">
                                        <RotateCcw size={10} style={{ color: "#9CA3AF" }} className="hover:text-red-500" />
                                      </button>
                                    )}
                                    {uid && (
                                      <button onClick={() => { setEditingOverride(uid); setOverrideInput(cost > 0 ? String(Math.round(cost)) : "") }}
                                        title={isOverride ? "Edit override" : "Override cost"}
                                        className="opacity-30 hover:opacity-80 transition-opacity">
                                        <Pencil size={10} style={{ color: "#6B7280" }} />
                                      </button>
                                    )}
                                  </>
                                )}
                              </div>
                            </div>
                          </div>
                        )
                      })}
                    </div>
                    {totalWorkCost > 0 && (
                      <div className="flex items-center justify-between px-5 py-3"
                        style={{ borderTop: "1px solid #F3F4F6", background: "#FAFAFA" }}>
                        <span className="text-[11px] font-bold uppercase tracking-wider" style={{ color: "#9CA3AF" }}>Total Videos Cost</span>
                        <span className="text-[15px] font-black" style={{ fontFamily: "var(--font-jakarta)", color: "#111111" }}>
                          {fmtRupee(analytics.editedVideos.reduce((sum, { userId, video }) => {
                            const { cost } = calcVideoCost(video, userId, rateMap, hourlyMap, localOverrides)
                            return sum + cost
                          }, 0))}
                        </span>
                      </div>
                    )}
                    </div>{/* end minWidth wrapper */}
                    </div>{/* end overflow-x-auto */}
                  </div>
                )}

                {/* Shoot sessions */}
                {analytics.shootSessions.length > 0 && (
                  <div className="rounded-2xl overflow-hidden" style={{ background: "#FFFFFF", border: "1px solid #E5E7EB" }}>
                    <div className="flex items-center gap-2.5 px-5 py-4" style={{ borderBottom: "1px solid #F3F4F6" }}>
                      <Camera size={14} style={{ color: "#de1a1a" }} />
                      <h2 className="text-[13px] font-black uppercase tracking-wider" style={{ fontFamily: "var(--font-jakarta)", color: "#111111" }}>
                        Shoot Sessions
                      </h2>
                      <span className="ml-auto text-[11px] font-bold px-2 py-0.5 rounded-full" style={{ background: "rgba(0,0,0,0.04)", color: "#6B7280" }}>
                        {analytics.shootSessions.length} shoots · {analytics.totalShootHours.toFixed(0)}h
                      </span>
                    </div>
                    <div className="overflow-x-auto">
                    <div style={{ minWidth: 660 }}>
                    <div className="hidden md:grid gap-3 px-5 py-2.5 text-[10px] font-bold uppercase tracking-wider"
                      style={{ gridTemplateColumns: "110px 1fr 130px 70px 120px 100px", color: "#9CA3AF", borderBottom: "1px solid #F3F4F6" }}>
                      {["Date", "Title", "Time Slot", "Hours", "Employee", "Cost"].map(h => <span key={h}>{h}</span>)}
                    </div>
                    <div>
                      {analytics.shootSessions.map((s, i) => {
                        const user = userMap[s.userId]
                        const shootCost = (hourlyMap[s.userId] ?? 0) * s.duration
                        return (
                          <div key={i} className="grid gap-3 px-5 py-3.5 items-center"
                            style={{ gridTemplateColumns: "110px 1fr 130px 70px 120px 100px", borderBottom: i < analytics.shootSessions.length - 1 ? "1px solid #F9FAFB" : "none" }}>
                            <span className="text-[12px]" style={{ color: "#6B7280" }}>{fmtDate(s.date)}</span>
                            <span className="text-[13px] font-semibold truncate" style={{ color: "#111111" }}>{s.title}</span>
                            <span className="text-[12px]" style={{ color: "#9CA3AF" }}>
                              {s.startTime && s.endTime ? `${s.startTime} – ${s.endTime}` : "—"}
                            </span>
                            <div className="flex items-center gap-1">
                              <Camera size={11} style={{ color: "#F97316" }} />
                              <span className="text-[12px] font-bold" style={{ color: "#F97316" }}>{s.duration}h</span>
                            </div>
                            <div className="flex items-center gap-2 min-w-0">
                              {user ? (
                                <>
                                  <div className="w-6 h-6 rounded-full flex items-center justify-center flex-shrink-0 text-[9px] font-bold"
                                    style={{ background: "rgba(222,26,26,0.08)", color: "#de1a1a" }}>
                                    {ini(user.name)}
                                  </div>
                                  <span className="text-[11px] truncate" style={{ color: "#374151" }}>{user.name}</span>
                                </>
                              ) : <span style={{ color: "#D1D5DB" }}>—</span>}
                            </div>
                            <span className="text-[13px] font-bold" style={{ color: shootCost > 0 ? "#374151" : "#D1D5DB" }}>
                              {shootCost > 0 ? fmtRupee(shootCost) : "—"}
                            </span>
                          </div>
                        )
                      })}
                    </div>
                    </div>{/* end minWidth wrapper */}
                    </div>{/* end overflow-x-auto */}
                  </div>
                )}

                {/* Team contribution */}
                <div className="rounded-2xl overflow-hidden" style={{ background: "#FFFFFF", border: "1px solid #E5E7EB" }}>
                  <div className="flex items-center gap-2.5 px-5 py-4" style={{ borderBottom: "1px solid #F3F4F6" }}>
                    <Users size={14} style={{ color: "#de1a1a" }} />
                    <h2 className="text-[13px] font-black uppercase tracking-wider" style={{ fontFamily: "var(--font-jakarta)", color: "#111111" }}>Team Contribution</h2>
                  </div>
                  <div className="overflow-x-auto">
                  <div style={{ minWidth: 560 }}>
                  <div className="hidden md:grid gap-3 px-5 py-2.5 text-[10px] font-bold uppercase tracking-wider"
                    style={{ gridTemplateColumns: "1fr 60px 60px 60px 70px 70px 70px 90px", color: "#9CA3AF", borderBottom: "1px solid #F3F4F6" }}>
                    {["Employee", "Days", "Videos", "Shoots", "Edit Hrs", "Shoot Hrs", "Work Hrs", "Cost"].map(h => (
                      <span key={h} className={h !== "Employee" ? "text-center" : ""}>{h}</span>
                    ))}
                  </div>
                  <div>
                    {analytics.employees.map((emp, i) => {
                      const empCost = (hourlyMap[emp.userId] ?? 0) * emp.totalHours
                      return (
                        <div key={emp.employeeId} className="grid gap-3 px-5 py-3.5 items-center"
                          style={{ gridTemplateColumns: "1fr 60px 60px 60px 70px 70px 70px 90px", borderBottom: i < analytics.employees.length - 1 ? "1px solid #F9FAFB" : "none" }}>
                          <div className="flex items-center gap-3 min-w-0">
                            <div className="w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0 text-[10px] font-bold"
                              style={{ background: "rgba(222,26,26,0.08)", color: "#de1a1a" }}>
                              {ini(emp.name)}
                            </div>
                            <div className="min-w-0">
                              <p className="text-[13px] font-semibold truncate" style={{ color: "#111111" }}>{emp.name}</p>
                              <p className="text-[10px]" style={{ color: "#9CA3AF" }}>
                                #{emp.employeeId}{hourlyMap[emp.userId] ? ` · ₹${hourlyMap[emp.userId].toFixed(0)}/hr` : " · no rate set"}
                              </p>
                            </div>
                          </div>
                          <span className="text-center text-[13px] font-bold" style={{ color: "#374151" }}>{emp.dates.size}</span>
                          <span className="text-center text-[13px] font-bold" style={{ color: emp.videoCount > 0 ? "#E53935" : "#D1D5DB" }}>{emp.videoCount || "—"}</span>
                          <span className="text-center text-[13px] font-bold" style={{ color: emp.shootCount > 0 ? "#F97316" : "#D1D5DB" }}>{emp.shootCount || "—"}</span>
                          <span className="text-center text-[13px] font-bold" style={{ color: emp.editHours > 0 ? "#8B5CF6" : "#D1D5DB" }}>
                            {emp.editHours > 0 ? `${emp.editHours.toFixed(1)}h` : "—"}
                          </span>
                          <span className="text-center text-[13px] font-bold" style={{ color: emp.shootHours > 0 ? "#F97316" : "#D1D5DB" }}>
                            {emp.shootHours > 0 ? `${emp.shootHours.toFixed(1)}h` : "—"}
                          </span>
                          <span className="text-center text-[13px] font-bold" style={{ color: emp.otherHours > 0 ? "#0EA5E9" : "#D1D5DB" }}>
                            {emp.otherHours > 0 ? `${emp.otherHours.toFixed(1)}h` : "—"}
                          </span>
                          <span className="text-center text-[13px] font-bold" style={{ color: empCost > 0 ? "#16A34A" : "#D1D5DB" }}>
                            {empCost > 0 ? fmtRupee(empCost) : "—"}
                          </span>
                        </div>
                      )
                    })}
                  </div>
                  </div>{/* end minWidth wrapper */}
                  </div>{/* end overflow-x-auto */}
                </div>
              </>
            )}
          </div>
        )}

        {/* ══════════════ TEAM COSTING TAB ══════════════ */}
        {tab === "team" && (
          <div className="space-y-5">
            <PricingPanel
              rates={localRates}
              users={localUsers.filter(u => u.employee_id)}
              onUpsertRate={handleUpsertRate}
              onDeleteRate={handleDeleteRate}
              onUpdateEmployeeRate={handleUpdateEmployeeRate}
            />
            {/* Team hourly rates overview */}
            <div className="rounded-2xl overflow-hidden" style={{ background: "#FFFFFF", border: "1px solid #E5E7EB" }}>
              <div className="flex items-center gap-2.5 px-5 py-4" style={{ borderBottom: "1px solid #F3F4F6" }}>
                <Users size={14} style={{ color: "#de1a1a" }} />
                <h2 className="text-[13px] font-black uppercase tracking-wider" style={{ fontFamily: "var(--font-jakarta)", color: "#111111" }}>Team Hourly Rates</h2>
              </div>
              <div className="divide-y" style={{ borderColor: "#F9FAFB" }}>
                {localUsers.filter(u => u.employee_id).map(u => {
                  const rate = u.hourly_rate ?? 0
                  const maxRate = Math.max(...localUsers.map(x => x.hourly_rate ?? 0), 1)
                  const pct = Math.max(4, Math.round((rate / maxRate) * 100))
                  return (
                    <div key={u.id} className="px-5 py-4 flex items-center gap-4">
                      <div className="w-9 h-9 rounded-full flex items-center justify-center flex-shrink-0 text-[11px] font-bold"
                        style={{ background: "rgba(222,26,26,0.08)", color: "#de1a1a" }}>
                        {ini(u.name)}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center justify-between mb-1.5">
                          <div>
                            <p className="text-[13px] font-semibold" style={{ color: "#111111" }}>{u.name}</p>
                            <p className="text-[11px]" style={{ color: "#9CA3AF" }}>#{u.employee_id}</p>
                          </div>
                          <span className="text-[14px] font-black flex-shrink-0" style={{ fontFamily: "var(--font-jakarta)", color: rate > 0 ? "#de1a1a" : "#D1D5DB" }}>
                            {rate > 0 ? `₹${rate}/hr` : "Not set"}
                          </span>
                        </div>
                        <div className="h-1.5 rounded-full" style={{ background: "#F3F4F6" }}>
                          <div className="h-full rounded-full transition-all" style={{ width: `${pct}%`, background: rate > 0 ? "#de1a1a" : "#E5E7EB" }} />
                        </div>
                      </div>
                    </div>
                  )
                })}
                {localUsers.filter(u => u.employee_id).length === 0 && (
                  <div className="px-5 py-10 text-center">
                    <p className="text-[13px]" style={{ color: "#9CA3AF" }}>No team members found</p>
                  </div>
                )}
              </div>
            </div>
          </div>
        )}

        {/* ══════════════ PER CLIENT COST TAB ══════════════ */}
        {tab === "per_client" && (
          <div className="space-y-4">
            <div className="rounded-2xl p-5" style={{ background: "#FFFFFF", border: "1px solid #EBEDF2" }}>
              <p className="text-[13px] font-semibold mb-1" style={{ color: "#374151" }}>
                Employee cost per client — derived from <strong>monthly salary ÷ 25 days ÷ 9 hrs</strong>
              </p>
              <p className="text-[11px]" style={{ color: "#9CA3AF" }}>
                Edit entries, shoot hours, and multi-client ops tasks are all included.
              </p>
            </div>
            {Object.entries(perClientCosts)
              .sort((a, b) => {
                const ta = Object.values(a[1]).reduce((s, v) => s + v.cost, 0)
                const tb = Object.values(b[1]).reduce((s, v) => s + v.cost, 0)
                return tb - ta
              })
              .map(([client, employees]) => {
                const total = Object.values(employees).reduce((s, v) => s + v.cost, 0)
                return (
                  <div key={client} className="rounded-2xl p-5"
                    style={{ background: "#FFFFFF", border: "1px solid #EBEDF2", boxShadow: "0 2px 8px rgba(0,0,0,0.04)" }}>
                    <div className="flex items-center justify-between mb-4">
                      <div>
                        <p className="text-[15px] font-bold" style={{ color: "#111111" }}>{client}</p>
                        <p className="text-[11px]" style={{ color: "#9CA3AF" }}>{Object.keys(employees).length} team member{Object.keys(employees).length !== 1 ? "s" : ""}</p>
                      </div>
                      <span className="text-[18px] font-black" style={{ color: "#de1a1a", fontFamily: "var(--font-jakarta)" }}>
                        {fmtRupee(total)}
                      </span>
                    </div>
                    <div className="space-y-2">
                      {Object.values(employees)
                        .sort((a, b) => b.cost - a.cost)
                        .map(emp => {
                          const hrRate = emp.hours > 0 ? emp.cost / emp.hours : 0
                          return (
                            <div key={emp.name} className="flex items-center justify-between py-2 px-3 rounded-xl"
                              style={{ background: "#F9FAFB" }}>
                              <span className="text-[13px] font-semibold" style={{ color: "#374151" }}>{emp.name}</span>
                              <span className="text-[12px]" style={{ color: "#6B7280" }}>
                                {emp.hours.toFixed(1)}h × {fmtRupee(hrRate)}/h = <strong style={{ color: "#111111" }}>{fmtRupee(emp.cost)}</strong>
                              </span>
                            </div>
                          )
                        })}
                    </div>
                  </div>
                )
              })}
            {Object.keys(perClientCosts).length === 0 && (
              <div className="py-20 text-center rounded-2xl" style={{ background: "#FFFFFF", border: "1px solid #EBEDF2" }}>
                <p className="text-[14px] font-semibold" style={{ color: "#9CA3AF" }}>No client work data yet</p>
                <p className="text-[12px] mt-1" style={{ color: "#D1D5DB" }}>Work entries will appear here once team members log updates</p>
              </div>
            )}
          </div>
        )}

      </div>
    </div>
  )
}
