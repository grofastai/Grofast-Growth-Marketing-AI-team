"use client"

import { useState, useMemo, useTransition } from "react"
import { useRouter } from "next/navigation"
import {
  Video, Camera, Clock, IndianRupee, ChevronDown,
  Users, TrendingUp, TrendingDown, CheckCircle2, XCircle,
  Receipt, BarChart3, Loader2,
} from "lucide-react"
import { reviewExpense } from "@/lib/actions/expenses"

// ── Types ─────────────────────────────────────────────────────────────────────

type EditingVideo = {
  id?: string
  video_name?: string
  client_name?: string
  duration?: string
  video_type?: string
  time_taken?: number
  drive_updated?: boolean
  drive_link?: string
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
  notes?: string
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

// ── Main Component ────────────────────────────────────────────────────────────

export default function ExpensesClient({
  updates, users, expenses,
}: {
  updates: UpdateRow[]
  users: MemberUser[]
  expenses: Expense[]
}) {
  const [tab, setTab]           = useState<"analytics" | "claims">("analytics")
  const [clientName, setClient] = useState("")
  const [dateFrom, setFrom]     = useState("")
  const [dateTo, setTo]         = useState("")
  const [chargedAmt, setCharged]= useState("")
  const [hourlyRate, setRate]   = useState("500")

  // Expense claims state
  const [claimsTab, setClaimsTab] = useState<"pending" | "all">("pending")
  const [reviewId, setReviewId]   = useState<string | null>(null)
  const [reviewNote, setNote]     = useState("")
  const [isPending, start]        = useTransition()
  const router                    = useRouter()

  // ── User map ──────────────────────────────────────────────────────────────
  const userMap = useMemo(() => {
    const m: Record<string, MemberUser> = {}
    for (const u of users) m[u.id] = u
    return m
  }, [users])

  // ── All unique client names from work_entries ──────────────────────────────
  const allClients = useMemo(() => {
    const names = new Set<string>()
    for (const u of updates) {
      for (const e of u.work_entries ?? []) {
        const cn = (e.client_name ?? "").trim()
        if (cn) names.add(cn)
      }
    }
    return Array.from(names).sort()
  }, [updates])

  // ── Work entries matching selected client + date range ────────────────────
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

  // ── Analytics derived from matched entries ─────────────────────────────────
  const analytics = useMemo(() => {
    if (!matchedEntries.length) return null

    type EmpData = {
      name: string; employeeId: string
      videoCount: number; shootCount: number
      editHours: number; shootHours: number; totalHours: number
      dates: Set<string>
    }

    const empMap: Record<string, EmpData> = {}

    const shootSessions: {
      date: string; userId: string; title: string
      duration: number; startTime: string; endTime: string
    }[] = []

    const editedVideos: { date: string; userId: string; video: EditingVideo }[] = []

    let totalShootHours = 0
    let totalEditHours  = 0
    let totalVideos     = 0
    let totalShoots     = 0

    for (const { date, userId, entry } of matchedEntries) {
      const user = userMap[userId]
      if (user && !empMap[userId]) {
        empMap[userId] = {
          name: user.name, employeeId: user.employee_id,
          videoCount: 0, shootCount: 0,
          editHours: 0, shootHours: 0, totalHours: 0,
          dates: new Set(),
        }
      }
      const emp = empMap[userId]
      const hrs = entry.duration_hours ?? 0
      if (emp) { emp.totalHours += hrs; emp.dates.add(date) }

      if (entry.task_type === "shoot") {
        shootSessions.push({
          date, userId,
          title:     entry.title ?? "Shoot",
          duration:  hrs,
          startTime: entry.start_time ?? "",
          endTime:   entry.end_time   ?? "",
        })
        totalShootHours += hrs
        totalShoots++
        if (emp) { emp.shootHours += hrs; emp.shootCount++ }

      } else if (entry.task_type === "edit") {
        const videos = entry.editing_videos ?? []
        for (const v of videos) {
          editedVideos.push({ date, userId, video: v })
          totalVideos++
          if (emp) emp.videoCount++
        }
        totalEditHours += hrs
        if (emp) emp.editHours += hrs
      }
    }

    const employees = Object.values(empMap).sort((a, b) => b.totalHours - a.totalHours)
    const activeDays = new Set(matchedEntries.map(e => e.date)).size

    return {
      totalVideos, totalShoots, totalShootHours, totalEditHours,
      totalHours: totalShootHours + totalEditHours,
      activeDays, employees,
      shootSessions: shootSessions.sort((a, b) => b.date.localeCompare(a.date)),
      editedVideos:  editedVideos.sort((a, b) =>
        (b.video.date_finished ?? b.date).localeCompare(a.video.date_finished ?? a.date)),
    }
  }, [matchedEntries, userMap])

  // ── Cost analysis ─────────────────────────────────────────────────────────
  const cost = useMemo(() => {
    if (!analytics) return null
    const rate    = parseFloat(hourlyRate) || 0
    const charged = parseFloat(chargedAmt.replace(/[^\d.]/g, "")) || 0
    if (!charged || !rate) return null
    const workValue = analytics.totalHours * rate
    const profit    = charged - workValue
    const margin    = workValue > 0 ? (profit / workValue) * 100 : 0
    return { charged, workValue, profit, margin }
  }, [analytics, chargedAmt, hourlyRate])

  // ── Expense claims helpers ────────────────────────────────────────────────
  const pendingClaims  = expenses.filter(e => e.status === "pending")
  const shownClaims    = claimsTab === "pending" ? pendingClaims : expenses
  const totalPending   = pendingClaims.reduce((s, e) => s + e.amount, 0)
  const totalApproved  = expenses.filter(e => e.status === "approved").reduce((s, e) => s + e.amount, 0)

  function approveClaim(id: string) {
    start(async () => { await reviewExpense(id, "approved"); router.refresh() })
  }
  function rejectClaim(id: string) {
    start(async () => {
      await reviewExpense(id, "rejected", reviewNote || undefined)
      setReviewId(null); setNote(""); router.refresh()
    })
  }

  // ── Section header helper ─────────────────────────────────────────────────
  function SectionHead({ icon: Icon, title, badge }: { icon: React.ElementType; title: string; badge?: string | number }) {
    return (
      <div className="flex items-center gap-2.5 px-5 py-4" style={{ borderBottom: "1px solid #F3F4F6" }}>
        <Icon size={14} style={{ color: "#de1a1a" }} />
        <h2 className="text-[13px] font-black uppercase tracking-wider"
          style={{ fontFamily: "var(--font-jakarta)", color: "#111111" }}>{title}</h2>
        {badge != null && (
          <span className="ml-auto text-[11px] font-bold px-2 py-0.5 rounded-full"
            style={{ background: "rgba(0,0,0,0.04)", color: "#6B7280" }}>{badge}</span>
        )}
      </div>
    )
  }

  // ── Render ────────────────────────────────────────────────────────────────
  return (
    <div className="p-4 md:p-6 xl:p-8 max-w-[1400px]">

      {/* Header */}
      <div className="mb-6">
        <h1 className="gradient-heading text-[30px] font-black leading-tight"
          style={{ fontFamily: "var(--font-jakarta)" }}>
          Analytics & Expenses
        </h1>
        <p className="text-sm mt-1" style={{ color: "#6B7280" }}>
          Per-client work breakdown, cost analysis, and expense claim review
        </p>
      </div>

      {/* Top-level tabs */}
      <div className="flex gap-1 p-1 rounded-xl mb-6 w-fit"
        style={{ background: "#F9FAFB", border: "1px solid #E5E7EB" }}>
        {([
          ["analytics", "Client Analytics"],
          ["claims",    `Expense Claims${pendingClaims.length > 0 ? ` (${pendingClaims.length})` : ""}`],
        ] as const).map(([v, label]) => (
          <button key={v} onClick={() => setTab(v)}
            className="px-5 py-2 rounded-lg text-[13px] font-semibold transition-all"
            style={tab === v
              ? { background: "#FFFFFF", color: "#111111", boxShadow: "0 1px 3px rgba(0,0,0,0.08)" }
              : { color: "#6B7280" }}>
            {label}
          </button>
        ))}
      </div>

      {/* ══════════════════════════════════════════════════════════════════
          CLIENT ANALYTICS TAB
      ══════════════════════════════════════════════════════════════════ */}
      {tab === "analytics" && (
        <div className="space-y-5">

          {/* Config row */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 p-4 rounded-2xl"
            style={{ background: "#F9FAFB", border: "1px solid #E5E7EB" }}>

            {/* Client selector */}
            <div>
              <label className="block text-[10px] font-bold uppercase tracking-[0.15em] mb-1.5"
                style={{ color: "#6B7280" }}>Client</label>
              <div className="relative">
                <select value={clientName} onChange={e => setClient(e.target.value)}
                  className="w-full appearance-none rounded-xl px-3 py-2.5 text-[13px] font-semibold pr-8"
                  style={{ background: "#FFFFFF", border: "1px solid #E5E7EB", color: "#111111", outline: "none" }}>
                  <option value="">Choose client…</option>
                  {allClients.map(n => <option key={n} value={n}>{n}</option>)}
                </select>
                <ChevronDown size={13} className="absolute right-2.5 top-1/2 -translate-y-1/2 pointer-events-none"
                  style={{ color: "#6B7280" }} />
              </div>
            </div>

            {/* Date from */}
            <div>
              <label className="block text-[10px] font-bold uppercase tracking-[0.15em] mb-1.5"
                style={{ color: "#6B7280" }}>From</label>
              <input type="date" value={dateFrom} onChange={e => setFrom(e.target.value)}
                className="w-full rounded-xl px-3 py-2.5 text-[13px]"
                style={{ background: "#FFFFFF", border: "1px solid #E5E7EB", color: "#111111", outline: "none", colorScheme: "light" }} />
            </div>

            {/* Date to */}
            <div>
              <label className="block text-[10px] font-bold uppercase tracking-[0.15em] mb-1.5"
                style={{ color: "#6B7280" }}>To</label>
              <input type="date" value={dateTo} onChange={e => setTo(e.target.value)}
                className="w-full rounded-xl px-3 py-2.5 text-[13px]"
                style={{ background: "#FFFFFF", border: "1px solid #E5E7EB", color: "#111111", outline: "none", colorScheme: "light" }} />
            </div>

            {/* Charged amount */}
            <div>
              <label className="block text-[10px] font-bold uppercase tracking-[0.15em] mb-1.5"
                style={{ color: "#6B7280" }}>Charged (₹)</label>
              <input type="text" placeholder="e.g. 25000" value={chargedAmt}
                onChange={e => setCharged(e.target.value)}
                className="w-full rounded-xl px-3 py-2.5 text-[13px] font-semibold"
                style={{ background: "#FFFFFF", border: "1px solid #E5E7EB", color: "#111111", outline: "none" }} />
            </div>
          </div>

          {/* Empty — no client selected */}
          {!clientName && (
            <div className="flex flex-col items-center py-24 rounded-2xl"
              style={{ background: "rgba(0,0,0,0.02)", border: "1px dashed #E5E7EB" }}>
              <BarChart3 size={40} className="mb-3" style={{ color: "#E5E7EB" }} />
              <p className="text-[14px] font-semibold" style={{ color: "#9CA3AF" }}>Select a client to see analytics</p>
              <p className="text-[12px] mt-1" style={{ color: "#D1D5DB" }}>
                Work breakdown, per-video details, team contribution, cost analysis
              </p>
            </div>
          )}

          {/* Empty — client selected but no data */}
          {clientName && !analytics && (
            <div className="flex flex-col items-center py-24 rounded-2xl"
              style={{ background: "rgba(0,0,0,0.02)", border: "1px dashed #E5E7EB" }}>
              <BarChart3 size={40} className="mb-3" style={{ color: "#E5E7EB" }} />
              <p className="text-[14px] font-semibold" style={{ color: "#9CA3AF" }}>
                No work logged for {clientName}
              </p>
              <p className="text-[12px] mt-1" style={{ color: "#D1D5DB" }}>
                Work appears here when team members submit daily updates for this client
              </p>
            </div>
          )}

          {/* ── Analytics content ─────────────────────────────────────────── */}
          {clientName && analytics && (
            <>
              {/* Summary cards */}
              <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-5 gap-3">
                {[
                  { emoji: "🎬", label: "Videos Edited",  value: analytics.totalVideos,                     color: "#E53935", bg: "rgba(229,57,53,0.07)",   border: "rgba(229,57,53,0.18)"   },
                  { emoji: "📸", label: "Shoot Sessions", value: analytics.totalShoots,                     color: "#F97316", bg: "rgba(249,115,22,0.07)",  border: "rgba(249,115,22,0.18)"  },
                  { emoji: "⏱️", label: "Editing Hours",  value: `${analytics.totalEditHours.toFixed(0)}h`, color: "#8B5CF6", bg: "rgba(139,92,246,0.07)", border: "rgba(139,92,246,0.18)" },
                  { emoji: "🎥", label: "Shoot Hours",    value: `${analytics.totalShootHours.toFixed(0)}h`,color: "#F59E0B", bg: "rgba(245,158,11,0.07)", border: "rgba(245,158,11,0.18)" },
                  { emoji: "📅", label: "Active Days",    value: analytics.activeDays,                      color: "#3B82F6", bg: "rgba(59,130,246,0.07)",  border: "rgba(59,130,246,0.18)"  },
                ].map(s => (
                  <div key={s.label} className="rounded-xl p-4 text-center"
                    style={{ background: s.bg, border: `1px solid ${s.border}` }}>
                    <div className="text-2xl mb-1.5">{s.emoji}</div>
                    <div className="text-[26px] font-black leading-none mb-1"
                      style={{ fontFamily: "var(--font-jakarta)", color: s.color }}>{s.value}</div>
                    <div className="text-[11px] font-medium" style={{ color: "#374151" }}>{s.label}</div>
                  </div>
                ))}
              </div>

              {/* Cost analysis */}
              {cost ? (
                <div className="rounded-2xl p-5"
                  style={{
                    background: cost.profit >= 0 ? "rgba(22,163,74,0.04)" : "rgba(220,38,38,0.04)",
                    border: `1px solid ${cost.profit >= 0 ? "rgba(22,163,74,0.18)" : "rgba(220,38,38,0.18)"}`,
                  }}>
                  <div className="flex items-center gap-2.5 mb-5">
                    {cost.profit >= 0
                      ? <TrendingUp size={15} style={{ color: "#16A34A" }} />
                      : <TrendingDown size={15} style={{ color: "#DC2626" }} />}
                    <span className="text-[13px] font-black uppercase tracking-wider"
                      style={{ fontFamily: "var(--font-jakarta)", color: cost.profit >= 0 ? "#16A34A" : "#DC2626" }}>
                      {cost.profit >= 0 ? "Worth It — Profitable" : "Below Cost — Needs Review"}
                    </span>
                  </div>
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-6">
                    <div>
                      <p className="text-[10px] font-bold uppercase tracking-wider mb-1" style={{ color: "#6B7280" }}>Charged</p>
                      <p className="text-[22px] font-black" style={{ fontFamily: "var(--font-jakarta)", color: "#111111" }}>
                        ₹{cost.charged.toLocaleString("en-IN")}
                      </p>
                    </div>
                    <div>
                      <p className="text-[10px] font-bold uppercase tracking-wider mb-1" style={{ color: "#6B7280" }}>Work Cost</p>
                      <p className="text-[22px] font-black" style={{ fontFamily: "var(--font-jakarta)", color: "#111111" }}>
                        ₹{Math.round(cost.workValue).toLocaleString("en-IN")}
                      </p>
                      <p className="text-[10px] mt-0.5" style={{ color: "#9CA3AF" }}>
                        {analytics.totalHours.toFixed(0)}h × ₹{hourlyRate}/hr
                      </p>
                    </div>
                    <div>
                      <p className="text-[10px] font-bold uppercase tracking-wider mb-1" style={{ color: "#6B7280" }}>
                        {cost.profit >= 0 ? "Profit" : "Loss"}
                      </p>
                      <p className="text-[22px] font-black"
                        style={{ fontFamily: "var(--font-jakarta)", color: cost.profit >= 0 ? "#16A34A" : "#DC2626" }}>
                        {cost.profit >= 0 ? "+" : ""}₹{Math.abs(Math.round(cost.profit)).toLocaleString("en-IN")}
                      </p>
                    </div>
                    <div>
                      <p className="text-[10px] font-bold uppercase tracking-wider mb-1" style={{ color: "#6B7280" }}>Margin</p>
                      <p className="text-[22px] font-black"
                        style={{ fontFamily: "var(--font-jakarta)", color: cost.margin >= 0 ? "#16A34A" : "#DC2626" }}>
                        {cost.margin >= 0 ? "+" : ""}{cost.margin.toFixed(1)}%
                      </p>
                      <div className="flex items-center gap-1.5 mt-1">
                        <span className="text-[10px]" style={{ color: "#9CA3AF" }}>Rate:</span>
                        <input type="number" value={hourlyRate} onChange={e => setRate(e.target.value)}
                          className="w-14 rounded px-1.5 py-0.5 text-[11px] font-bold text-center"
                          style={{ background: "#F9FAFB", border: "1px solid #E5E7EB", color: "#111111", outline: "none" }} />
                        <span className="text-[10px]" style={{ color: "#9CA3AF" }}>₹/hr</span>
                      </div>
                    </div>
                  </div>
                </div>
              ) : (
                <div className="rounded-2xl p-4 flex items-center gap-3"
                  style={{ background: "rgba(0,0,0,0.02)", border: "1px dashed #E5E7EB" }}>
                  <IndianRupee size={15} style={{ color: "#D1D5DB" }} />
                  <p className="text-[13px]" style={{ color: "#9CA3AF" }}>
                    Enter the charged amount above to see profit / loss analysis
                  </p>
                </div>
              )}

              {/* Per-video breakdown */}
              {analytics.editedVideos.length > 0 && (
                <div className="rounded-2xl overflow-hidden" style={{ background: "#FFFFFF", border: "1px solid #E5E7EB" }}>
                  <SectionHead icon={Video} title="Per-Video Breakdown"
                    badge={`${analytics.editedVideos.length} videos`} />

                  {/* Desktop header */}
                  <div className="hidden md:grid gap-3 px-5 py-2.5 text-[10px] font-bold uppercase tracking-wider"
                    style={{
                      gridTemplateColumns: "1fr 110px 105px 90px 90px 70px 130px",
                      color: "#9CA3AF", borderBottom: "1px solid #F3F4F6",
                    }}>
                    {["Video Name", "Type", "Date Given", "Finished", "Edit Time", "Revisions", "Done By"].map(h => (
                      <span key={h}>{h}</span>
                    ))}
                  </div>

                  <div>
                    {analytics.editedVideos.map(({ date, userId, video }, i) => {
                      const user = userMap[userId]
                      const typeColor = getVideoTypeColor(video.video_type ?? "")
                      const rate  = parseFloat(hourlyRate) || 0
                      const vcost = rate * (video.time_taken ?? 0)
                      return (
                        <div key={`${i}-${video.id ?? i}`}
                          className="px-5 py-3.5"
                          style={{ borderBottom: i < analytics.editedVideos.length - 1 ? "1px solid #F9FAFB" : "none" }}>

                          {/* Mobile */}
                          <div className="flex items-start justify-between gap-3 md:hidden">
                            <div>
                              <p className="text-[13px] font-semibold" style={{ color: "#111111" }}>
                                {video.video_name || "Untitled"}
                              </p>
                              <p className="text-[11px] mt-0.5" style={{ color: "#6B7280" }}>
                                {video.video_type} · {video.time_taken ?? 0}h · {video.revisions ?? 0} rev
                                {user ? ` · ${user.name}` : ""}
                              </p>
                            </div>
                            {vcost > 0 && (
                              <span className="text-[12px] font-bold flex-shrink-0" style={{ color: "#374151" }}>
                                ₹{Math.round(vcost).toLocaleString("en-IN")}
                              </span>
                            )}
                          </div>

                          {/* Desktop */}
                          <div className="hidden md:grid gap-3 items-center"
                            style={{ gridTemplateColumns: "1fr 110px 105px 90px 90px 70px 130px" }}>
                            <div className="min-w-0">
                              <p className="text-[13px] font-semibold truncate" style={{ color: "#111111" }}>
                                {video.video_name || "Untitled"}
                              </p>
                              {vcost > 0 && (
                                <p className="text-[10px]" style={{ color: "#9CA3AF" }}>
                                  cost ≈ ₹{Math.round(vcost).toLocaleString("en-IN")}
                                </p>
                              )}
                            </div>
                            <div>
                              {video.video_type
                                ? <span className="text-[11px] font-bold px-2.5 py-0.5 rounded-full"
                                    style={{ background: `${typeColor}18`, color: typeColor }}>
                                    {video.video_type}
                                  </span>
                                : <span style={{ color: "#D1D5DB" }}>—</span>}
                            </div>
                            <span className="text-[12px]" style={{ color: "#6B7280" }}>
                              {fmtDate(video.date_given)}
                            </span>
                            <span className="text-[12px]" style={{ color: "#6B7280" }}>
                              {fmtDate(video.date_finished)}
                            </span>
                            <div className="flex items-center gap-1">
                              <Clock size={11} style={{ color: "#8B5CF6" }} />
                              <span className="text-[12px] font-semibold" style={{ color: "#8B5CF6" }}>
                                {video.time_taken ?? "—"}h
                              </span>
                            </div>
                            <span className="text-[13px] font-bold text-center"
                              style={{ color: (video.revisions ?? 0) > 2 ? "#DC2626" : "#374151" }}>
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
                          </div>
                        </div>
                      )
                    })}
                  </div>
                </div>
              )}

              {/* Shoot sessions */}
              {analytics.shootSessions.length > 0 && (
                <div className="rounded-2xl overflow-hidden" style={{ background: "#FFFFFF", border: "1px solid #E5E7EB" }}>
                  <SectionHead icon={Camera} title="Shoot Sessions"
                    badge={`${analytics.shootSessions.length} shoots · ${analytics.totalShootHours.toFixed(0)}h`} />

                  <div className="hidden md:grid gap-3 px-5 py-2.5 text-[10px] font-bold uppercase tracking-wider"
                    style={{ gridTemplateColumns: "110px 1fr 130px 80px 130px", color: "#9CA3AF", borderBottom: "1px solid #F3F4F6" }}>
                    {["Date", "Title", "Time Slot", "Hours", "Employee"].map(h => <span key={h}>{h}</span>)}
                  </div>

                  <div>
                    {analytics.shootSessions.map((s, i) => {
                      const user = userMap[s.userId]
                      return (
                        <div key={i}
                          className="grid gap-3 px-5 py-3.5 items-center"
                          style={{
                            gridTemplateColumns: "110px 1fr 130px 80px 130px",
                            borderBottom: i < analytics.shootSessions.length - 1 ? "1px solid #F9FAFB" : "none",
                          }}>
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
                        </div>
                      )
                    })}
                  </div>
                </div>
              )}

              {/* Team breakdown */}
              <div className="rounded-2xl overflow-hidden" style={{ background: "#FFFFFF", border: "1px solid #E5E7EB" }}>
                <SectionHead icon={Users} title="Team Contribution" badge={`${analytics.employees.length} members`} />

                <div className="hidden md:grid gap-3 px-5 py-2.5 text-[10px] font-bold uppercase tracking-wider"
                  style={{
                    gridTemplateColumns: "1fr 70px 80px 80px 90px 90px 80px",
                    color: "#9CA3AF", borderBottom: "1px solid #F3F4F6",
                  }}>
                  {["Employee", "Days", "Videos", "Shoots", "Edit Hrs", "Shoot Hrs", "Total"].map(h => (
                    <span key={h} className={h !== "Employee" ? "text-center" : ""}>{h}</span>
                  ))}
                </div>

                {analytics.employees.length === 0 ? (
                  <div className="flex items-center justify-center py-12">
                    <p className="text-[13px]" style={{ color: "#9CA3AF" }}>No team data</p>
                  </div>
                ) : (
                  <div>
                    {analytics.employees.map((emp, i) => (
                      <div key={emp.employeeId}
                        className="grid gap-3 px-5 py-3.5 items-center"
                        style={{
                          gridTemplateColumns: "1fr 70px 80px 80px 90px 90px 80px",
                          borderBottom: i < analytics.employees.length - 1 ? "1px solid #F9FAFB" : "none",
                        }}>
                        <div className="flex items-center gap-3 min-w-0">
                          <div className="w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0 text-[10px] font-bold"
                            style={{ background: "rgba(222,26,26,0.08)", color: "#de1a1a" }}>
                            {ini(emp.name)}
                          </div>
                          <div className="min-w-0">
                            <p className="text-[13px] font-semibold truncate" style={{ color: "#111111" }}>{emp.name}</p>
                            <p className="text-[10px]" style={{ color: "#9CA3AF" }}>#{emp.employeeId}</p>
                          </div>
                        </div>
                        <span className="text-center text-[13px] font-bold" style={{ color: "#374151" }}>{emp.dates.size}</span>
                        <span className="text-center text-[13px] font-bold" style={{ color: emp.videoCount > 0 ? "#E53935" : "#D1D5DB" }}>
                          {emp.videoCount || "—"}
                        </span>
                        <span className="text-center text-[13px] font-bold" style={{ color: emp.shootCount > 0 ? "#F97316" : "#D1D5DB" }}>
                          {emp.shootCount || "—"}
                        </span>
                        <span className="text-center text-[13px] font-bold" style={{ color: emp.editHours > 0 ? "#8B5CF6" : "#D1D5DB" }}>
                          {emp.editHours > 0 ? `${emp.editHours.toFixed(0)}h` : "—"}
                        </span>
                        <span className="text-center text-[13px] font-bold" style={{ color: emp.shootHours > 0 ? "#F97316" : "#D1D5DB" }}>
                          {emp.shootHours > 0 ? `${emp.shootHours.toFixed(0)}h` : "—"}
                        </span>
                        <span className="text-center text-[13px] font-bold" style={{ color: "#F59E0B" }}>
                          {emp.totalHours.toFixed(0)}h
                        </span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </>
          )}
        </div>
      )}

      {/* ══════════════════════════════════════════════════════════════════
          EXPENSE CLAIMS TAB
      ══════════════════════════════════════════════════════════════════ */}
      {tab === "claims" && (
        <div>
          {/* Stats row */}
          <div className="flex flex-wrap gap-2 md:gap-3 mb-5">
            {[
              { label: "Pending Review",  value: pendingClaims.length,                              color: "#F59E0B", bg: "rgba(245,158,11,0.06)", border: "rgba(245,158,11,0.15)" },
              { label: "Pending Amount",  value: `₹${totalPending.toLocaleString("en-IN")}`,       color: "#F59E0B", bg: "rgba(245,158,11,0.06)", border: "rgba(245,158,11,0.15)" },
              { label: "Approved Total",  value: `₹${totalApproved.toLocaleString("en-IN")}`,      color: "#16A34A", bg: "rgba(22,163,74,0.06)",  border: "rgba(22,163,74,0.15)"  },
              { label: "All Claims",      value: expenses.length,                                   color: "#111111", bg: "#FFFFFF",               border: "#E5E7EB"               },
            ].map(s => (
              <div key={s.label} className="flex items-center gap-3 px-4 py-2.5 rounded-xl"
                style={{ background: s.bg, border: `1px solid ${s.border}` }}>
                <span className="text-[17px] font-black"
                  style={{ fontFamily: "var(--font-jakarta)", color: s.color }}>{s.value}</span>
                <span className="text-[11px]" style={{ color: "#6B7280" }}>{s.label}</span>
              </div>
            ))}
          </div>

          {/* Sub-tabs */}
          <div className="flex gap-1 p-1 rounded-xl mb-5 w-fit"
            style={{ background: "#F9FAFB", border: "1px solid #E5E7EB" }}>
            {([
              ["pending", `Pending (${pendingClaims.length})`],
              ["all",     "All Claims"],
            ] as const).map(([v, label]) => (
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
            <div className="flex flex-col items-center py-20 rounded-2xl"
              style={{ background: "rgba(0,0,0,0.02)", border: "1px solid #E5E7EB" }}>
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
                  <div key={e.id} className="rounded-xl p-5"
                    style={{ background: "#FFFFFF", border: "1px solid #E5E7EB" }}>
                    <div className="flex items-start gap-4">
                      <div className="w-10 h-10 rounded-full flex items-center justify-center flex-shrink-0 text-[11px] font-bold"
                        style={{ background: "rgba(222,26,26,0.08)", color: "#de1a1a" }}>
                        {user?.name ? ini(user.name) : "?"}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-start justify-between gap-4">
                          <div>
                            <div className="flex items-center gap-2">
                              <p className="text-[14px] font-bold" style={{ color: "#111111" }}>
                                {user?.name ?? "Unknown"}
                              </p>
                              <span className="text-[11px]" style={{ color: "#6B7280" }}>
                                #{user?.employee_id}
                              </span>
                            </div>
                            <p className="text-[12px] mt-0.5" style={{ color: "#6B7280" }}>
                              {e.description} · {e.category} · {fmtDate(e.date)}
                            </p>
                            {e.notes && (
                              <p className="text-[12px] mt-1" style={{ color: "#6B7280" }}>{e.notes}</p>
                            )}
                            {e.review_notes && (
                              <p className="text-[12px] mt-1.5 italic" style={{ color: "#6B7280" }}>
                                Note: {e.review_notes}
                              </p>
                            )}
                          </div>
                          <div className="text-right flex-shrink-0">
                            <p className="text-[18px] font-black"
                              style={{ fontFamily: "var(--font-jakarta)", color: "#111111" }}>
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
                                <input placeholder="Rejection note (optional)"
                                  value={reviewNote} onChange={ev => setNote(ev.target.value)}
                                  className="flex-1 text-[12px] px-3 py-1.5 rounded-lg outline-none"
                                  style={{ background: "#F9FAFB", border: "1px solid #E5E7EB", color: "#111111" }} />
                                <button onClick={() => rejectClaim(e.id)} disabled={isPending}
                                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[12px] font-bold"
                                  style={{ background: "rgba(222,26,26,0.1)", color: "#de1a1a", border: "1px solid rgba(222,26,26,0.2)" }}>
                                  {isPending ? <Loader2 size={11} className="animate-spin" /> : <XCircle size={12} />}
                                  Confirm
                                </button>
                                <button onClick={() => setReviewId(null)} className="text-[12px]"
                                  style={{ color: "#6B7280" }}>Cancel</button>
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
    </div>
  )
}
