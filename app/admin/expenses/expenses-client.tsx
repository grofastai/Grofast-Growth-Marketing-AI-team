"use client"

import { useState, useMemo, useTransition } from "react"
import { useRouter } from "next/navigation"
import Image from "next/image"
import {
  Clock, IndianRupee, ChevronDown, Users,
  TrendingUp, TrendingDown, CheckCircle2, XCircle,
  Receipt, Loader2, Settings, Plus, Trash2,
  Pencil, ArrowUpRight,
} from "lucide-react"
import { reviewExpense } from "@/lib/actions/expenses"
import {
  upsertPricingRate, deletePricingRate,
  updateEmployeeRate,
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

type ContentPostRow = {
  client_name: string
  content_type: string
  scheduled_date: string
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
              Team Member Rates <span className="normal-case font-normal">(₹ per hour — derived from salary)</span>
            </p>
            <div className="space-y-1.5">
              {users.map(u => {
                const derived = derivePerHour(u)
                const fromSalary = !!(u.monthly_salary && u.monthly_salary > 0)
                return (
                  <div key={u.id} className="flex items-center gap-3 px-3 py-2 rounded-xl"
                    style={{ background: "#FFFFFF", border: "1px solid #E5E7EB" }}>
                    <div className="w-6 h-6 rounded-full flex items-center justify-center flex-shrink-0 text-[9px] font-bold"
                      style={{ background: "rgba(222,26,26,0.08)", color: "#de1a1a" }}>
                      {ini(u.name)}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-[12px] font-medium truncate" style={{ color: "#374151" }}>{u.name}</p>
                      {fromSalary && (
                        <p className="text-[10px]" style={{ color: "#9CA3AF" }}>
                          ₹{u.monthly_salary?.toLocaleString("en-IN")}/mo ÷ 25d ÷ 9h
                        </p>
                      )}
                    </div>
                    {fromSalary ? (
                      <span className="text-[12px] font-semibold" style={{ color: "#111111" }}>
                        ₹{Math.round(derived)}/hr
                      </span>
                    ) : (
                      <InlineEdit value={u.hourly_rate ?? 0} suffix="/hr" dim={!u.hourly_rate}
                        onSave={val => onUpdateEmployeeRate(u.id, val)} />
                    )}
                  </div>
                )
              })}
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
  updates, users, expenses, pricingRates, costOverrides, contentPosts,
}: {
  updates: UpdateRow[]
  users: MemberUser[]
  expenses: Expense[]
  pricingRates: PricingRate[]
  costOverrides: CostOverride[]
  contentPosts: ContentPostRow[]
}) {
  const [tab, setTab] = useState<"claims" | "team">("claims")

  const [localRates, setLocalRates]    = useState<PricingRate[]>(pricingRates)
  const [localUsers, setLocalUsers]    = useState<MemberUser[]>(users)
  const [localOverrides, setOverrides] = useState<Record<string, number>>(() => {
    const m: Record<string, number> = {}
    for (const o of costOverrides) m[o.video_uid] = o.manual_cost
    return m
  })

  const [claimsTab, setClaimsTab] = useState<"pending" | "all">("pending")
  const [reviewId, setReviewId]   = useState<string | null>(null)
  const [reviewNote, setNote]     = useState("")
  const [isPending, start]        = useTransition()
  const router                    = useRouter()

  const MONTHS_SHORT = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec']
  const [contentMonth, setContentMonth] = useState(new Date().getMonth())

  const contentCounts = useMemo(() => {
    const TYPE_MAP: Record<string, string> = {
      video: 'Videos', reel: 'Reels', post: 'Posters', story: 'Stories',
    }
    const filtered = contentPosts.filter(p => {
      const m = new Date(p.scheduled_date + 'T12:00:00').getMonth()
      return m === contentMonth
    })
    const map: Record<string, Record<string, number>> = {}
    for (const p of filtered) {
      const client = p.client_name || 'Unknown'
      const type   = TYPE_MAP[p.content_type] ?? 'Other'
      if (!map[client]) map[client] = {}
      map[client][type] = (map[client][type] ?? 0) + 1
    }
    return Object.entries(map)
      .map(([client, counts]) => ({
        client,
        videos:  counts['Videos']  ?? 0,
        reels:   counts['Reels']   ?? 0,
        posters: counts['Posters'] ?? 0,
        stories: counts['Stories'] ?? 0,
        other:   counts['Other']   ?? 0,
        total:   Object.values(counts).reduce((a, b) => a + b, 0),
      }))
      .sort((a, b) => b.total - a.total)
  }, [contentPosts, contentMonth])

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

  // ── Global KPIs ───────────────────────────────────────────────────────────
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
    { label: "Expense Claims",  value: fmtRupee(totalExpenseClaims), sub: `${pendingClaims.length} pending`, color: "#F59E0B", bg: "rgba(245,158,11,0.06)", icon: <Receipt size={16} style={{ color: "#F59E0B" }} /> },
    { label: "Approved",        value: fmtRupee(approvedExpenses),   sub: "approved claims",                 color: "#16A34A", bg: "rgba(22,163,74,0.06)",   icon: <CheckCircle2 size={16} style={{ color: "#16A34A" }} /> },
  ]

  const TABS = [
    { id: "claims" as const, label: `Expense Claims${pendingClaims.length > 0 ? ` (${pendingClaims.length})` : ""}` },
    { id: "team"   as const, label: "Team Costing" },
  ]

  return (
    <div className="min-h-screen" style={{ background: "#F8F9FB" }}>
      <div className="p-4 md:p-6 xl:p-8 max-w-[1400px] mx-auto space-y-6">

        {/* ── Content Posted This Month ───────────────────────────────────── */}
        <div className="rounded-2xl p-5" style={{ background: "#FFFFFF", border: "1px solid #E5E7EB", boxShadow: "0 1px 8px rgba(0,0,0,0.04)" }}>
          <div className="flex items-center justify-between flex-wrap gap-3 mb-4">
            <h2 className="text-[15px] font-black" style={{ color: "#111111", margin: 0 }}>Content Posted</h2>
            <div className="flex flex-wrap gap-1.5">
              {MONTHS_SHORT.map((m, i) => (
                <button key={m} onClick={() => setContentMonth(i)}
                  style={{ padding: "4px 12px", borderRadius: 20, fontSize: 11, fontWeight: 700, cursor: "pointer", border: `1.5px solid ${contentMonth === i ? "#de1a1a" : "#E5E7EB"}`, background: contentMonth === i ? "rgba(222,26,26,0.08)" : "#F9FAFB", color: contentMonth === i ? "#de1a1a" : "#6B7280" }}>
                  {m}
                </button>
              ))}
            </div>
          </div>
          {contentCounts.length === 0 ? (
            <p className="text-[13px] text-center py-6" style={{ color: "#9CA3AF" }}>
              No posts marked as posted for {MONTHS_SHORT[contentMonth]}.
            </p>
          ) : (
            <div style={{ overflowX: "auto" }}>
              <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
                <thead>
                  <tr style={{ background: "#F9FAFB" }}>
                    {["Client", "Videos", "Reels", "Posters", "Stories", "Other", "Total"].map(h => (
                      <th key={h} style={{ padding: "8px 12px", textAlign: h === "Client" ? "left" : "center", fontSize: 11, fontWeight: 700, color: "#6B7280", textTransform: "uppercase", letterSpacing: "0.06em", borderBottom: "1px solid #E5E7EB" }}>{h}</th>
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
          )}
        </div>

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
              Expenses
            </h1>
            <p className="text-sm mt-1" style={{ color: "rgba(255,255,255,0.72)" }}>
              Expense claims review and team costing
            </p>
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
                  const rate = derivePerHour(u)
                  const fromSalary = !!(u.monthly_salary && u.monthly_salary > 0)
                  const maxRate = Math.max(...localUsers.map(x => derivePerHour(x)), 1)
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
                            <p className="text-[11px]" style={{ color: "#9CA3AF" }}>
                              #{u.employee_id}{fromSalary ? ` · from ₹${u.monthly_salary?.toLocaleString("en-IN")}/mo` : ""}
                            </p>
                          </div>
                          <span className="text-[14px] font-black flex-shrink-0" style={{ fontFamily: "var(--font-jakarta)", color: rate > 0 ? "#de1a1a" : "#D1D5DB" }}>
                            {rate > 0 ? `₹${Math.round(rate)}/hr` : "Not set"}
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

      </div>
    </div>
  )
}
