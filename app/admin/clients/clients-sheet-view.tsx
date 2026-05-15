"use client"

import { useState, useMemo, useRef, useEffect } from "react"
import Image from "next/image"
import {
  Search, Plus, MoreHorizontal,
  ChevronDown, Sparkles, X,
} from "lucide-react"
import type { SheetClient } from "@/lib/google/sheets"
import type { WorkSummary } from "./page"

function getWorkTypeCfg(wt: string): { label: string; color: string; bg: string; emoji: string } {
  const t = wt.toLowerCase()
  if (t.includes("video"))   return { label: "Videos",      color: "#E53935", bg: "rgba(229,57,53,0.08)",   emoji: "🎬" }
  if (t.includes("audio"))   return { label: "Audio",        color: "#8B5CF6", bg: "rgba(139,92,246,0.08)",  emoji: "🎵" }
  if (t.includes("script"))  return { label: "Scripts",      color: "#16A34A", bg: "rgba(22,163,74,0.08)",   emoji: "📝" }
  if (t.includes("design"))  return { label: "Design",       color: "#3B82F6", bg: "rgba(59,130,246,0.08)",  emoji: "🎨" }
  if (t.includes("social"))  return { label: "Social Media", color: "#0EA5E9", bg: "rgba(14,165,233,0.08)",  emoji: "📱" }
  if (t.includes("photo"))   return { label: "Photography",  color: "#F97316", bg: "rgba(249,115,22,0.08)",  emoji: "📸" }
  if (t.includes("ad") || t.includes("campaign")) return { label: "Ads", color: "#F59E0B", bg: "rgba(245,158,11,0.08)", emoji: "📊" }
  if (t.includes("edit"))    return { label: "Editing",      color: "#A855F7", bg: "rgba(168,85,247,0.08)",  emoji: "✂️" }
  if (t.includes("content")) return { label: "Content",      color: "#10B981", bg: "rgba(16,185,129,0.08)",  emoji: "📄" }
  const label = wt.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase())
  return { label, color: "#6B7280", bg: "rgba(107,114,128,0.08)", emoji: "💼" }
}

// ── Palette ───────────────────────────────────────────────────────────────────
const IND_PAL: Record<string, { bg: string; text: string; border: string; dot: string; spark: string }> = {
  "Food & Restaurant":  { bg: "#FFF7ED", text: "#C2410C", border: "#FED7AA", dot: "#F97316", spark: "#EF4444" },
  "Education":          { bg: "#EFF6FF", text: "#1D4ED8", border: "#BFDBFE", dot: "#3B82F6", spark: "#3B82F6" },
  "NGO":                { bg: "#F0FDF4", text: "#15803D", border: "#BBF7D0", dot: "#22C55E", spark: "#22C55E" },
  "Health & Beauty":    { bg: "#FDF4FF", text: "#A21CAF", border: "#F0ABFC", dot: "#D946EF", spark: "#A855F7" },
  "Textile":            { bg: "#F5F3FF", text: "#6D28D9", border: "#DDD6FE", dot: "#8B5CF6", spark: "#8B5CF6" },
  "Real Estate":        { bg: "#FFFBEB", text: "#B45309", border: "#FDE68A", dot: "#F59E0B", spark: "#F59E0B" },
}
const DEF_PAL = { bg: "#F3F4F6", text: "#374151", border: "#E5E7EB", dot: "#6B7280", spark: "#6B7280" }
function getPal(ind: string) { return IND_PAL[ind] ?? DEF_PAL }

// ── Helpers ───────────────────────────────────────────────────────────────────
function ini(name: string) {
  return name.split(" ").map(n => n[0] ?? "").join("").slice(0, 2).toUpperCase() || "??"
}
function parseAmt(s: string) {
  const n = parseFloat(s.replace(/[^\d.]/g, ""))
  return isNaN(n) ? 0 : n
}
function fmtRevenue(c: SheetClient): string {
  const v = parseAmt(c.current_month) || parseAmt(c.received)
  if (v >= 1000) return `₹${(v / 1000).toFixed(0)},000 /mo`
  return v > 0 ? `₹${v}/mo` : c.package_name ? `${c.package_name}` : "—"
}
function healthScore(c: SheetClient) {
  const ps = c.payment_status.toLowerCase()
  if (ps.includes("paid"))    return 92
  if (ps.includes("partial")) return 65
  if (ps.includes("pending")) return 38
  return 75
}
function healthCfg(score: number) {
  if (score >= 80) return { label: "Excellent", color: "#16A34A", bg: "rgba(22,163,74,0.09)" }
  if (score >= 60) return { label: "Good",      color: "#D97706", bg: "rgba(217,119,6,0.09)" }
  return              { label: "At Risk",       color: "#DC2626", bg: "rgba(220,38,38,0.09)" }
}
const isActive = (c: SheetClient) => c.client_status.toLowerCase().includes("active") || c.client_status.toLowerCase().includes("current")


function DonutChart({ pct, color, size = 112 }: { pct: number; color: string; size?: number }) {
  const r = size * 0.39, cx = size / 2, cy = size / 2
  const circ = 2 * Math.PI * r
  const filled = (Math.min(pct, 100) / 100) * circ
  return (
    <svg viewBox={`0 0 ${size} ${size}`} width={size} height={size}>
      <circle cx={cx} cy={cy} r={r} fill="none" stroke="#F3F4F6" strokeWidth={size * 0.12} />
      <circle cx={cx} cy={cy} r={r} fill="none" stroke={color} strokeWidth={size * 0.12}
        strokeDasharray={`${filled} ${circ}`} strokeLinecap="round"
        transform={`rotate(-90 ${cx} ${cy})`} style={{ transition: "stroke-dasharray 0.6s" }} />
      <text x={cx} y={cy - 5} textAnchor="middle" fontSize={size * 0.18} fontWeight="900" fill="#111827">{pct}%</text>
      <text x={cx} y={cy + 11} textAnchor="middle" fontSize={size * 0.09} fill="#9CA3AF">Complete</text>
    </svg>
  )
}

function HealthDonut({ pct, color }: { pct: number; color: string }) {
  const r = 22, cx = 30, cy = 30, circ = 2 * Math.PI * r
  const filled = (pct / 100) * circ
  return (
    <svg viewBox="0 0 60 60" width="52" height="52">
      <circle cx={cx} cy={cy} r={r} fill="none" stroke="#F3F4F6" strokeWidth="7" />
      <circle cx={cx} cy={cy} r={r} fill="none" stroke={color} strokeWidth="7"
        strokeDasharray={`${filled} ${circ}`} strokeLinecap="round"
        transform={`rotate(-90 ${cx} ${cy})`} />
      <text x={cx} y={cy} textAnchor="middle" dominantBaseline="middle"
        fontSize="12" fontWeight="900" fill="#111827">{pct}%</text>
    </svg>
  )
}

// ── Left panel client card ────────────────────────────────────────────────────
function ClientCard({ c, isSelected, onClick, idx }: {
  c: SheetClient; isSelected: boolean; onClick: () => void; idx: number
}) {
  const p    = getPal(c.industry)
  const live = isActive(c)
  const rev  = fmtRevenue(c)

  return (
    <button onClick={onClick} style={{
      display: "block", width: "100%", textAlign: "left", cursor: "pointer",
      background: isSelected ? "rgba(222,26,26,0.03)" : "#FFFFFF",
      border: "1px solid",
      borderColor: isSelected ? "rgba(222,26,26,0.2)" : "#F0F1F5",
      borderLeft: isSelected ? "3px solid #DE1A1A" : "3px solid transparent",
      borderRadius: 14, overflow: "hidden", transition: "all 0.18s",
      boxShadow: isSelected ? "0 2px 12px rgba(222,26,26,0.08)" : "0 1px 4px rgba(0,0,0,0.04)",
    }}>
      {/* Top section */}
      <div style={{ padding: "12px 14px 8px", display: "flex", alignItems: "flex-start", gap: 10 }}>
        {/* Logo */}
        <div style={{
          width: 40, height: 40, borderRadius: 12, flexShrink: 0,
          background: isSelected ? "#DE1A1A" : p.dot + "22",
          color: isSelected ? "#FFF" : p.dot,
          display: "flex", alignItems: "center", justifyContent: "center",
          fontSize: 13, fontWeight: 900, fontFamily: "var(--font-jakarta)",
          border: `1.5px solid ${isSelected ? "#DE1A1A" : p.border}`,
        }}>
          {ini(c.company_name || c.customer_name)}
        </div>
        {/* Info */}
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 4 }}>
            <p style={{ fontSize: 13, fontWeight: 800, color: isSelected ? "#DE1A1A" : "#111827",
              fontFamily: "var(--font-jakarta)", margin: 0, lineHeight: 1.3,
              overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", maxWidth: 120 }}>
              {c.company_name || c.customer_name}
            </p>
            <span style={{
              fontSize: 9, fontWeight: 700, padding: "2px 7px", borderRadius: 5, flexShrink: 0,
              background: live ? "rgba(22,163,74,0.1)" : "rgba(107,114,128,0.1)",
              color: live ? "#16A34A" : "#6B7280",
            }}>
              {live ? "Active" : "Inactive"}
            </span>
          </div>
          <p style={{ fontSize: 10, color: "#9CA3AF", margin: "2px 0 4px" }}>{c.industry || "General"}</p>
          <p style={{ fontSize: 11, fontWeight: 700, color: isSelected ? "#B91C1C" : "#374151", margin: 0 }}>
            {rev}
          </p>
        </div>
      </div>
    </button>
  )
}


// ── Overview Tab ──────────────────────────────────────────────────────────────
function OverviewTab({ c, workSummary }: { c: SheetClient; workSummary?: WorkSummary }) {
  const received = parseAmt(c.received)
  const pending  = parseAmt(c.pending)
  const total    = received + pending
  const pct      = total > 0 ? Math.round((received / total) * 100) : 0

  const card: React.CSSProperties = {
    background: "#FFFFFF", borderRadius: 20, border: "1px solid #F0F1F5",
    padding: "18px 20px", boxShadow: "0 2px 12px rgba(0,0,0,0.05)",
  }

  return (
    <div style={{ padding: "18px 22px 40px", display: "flex", flexDirection: "column", gap: 16 }}>

      {/* Revenue + Payment Status */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-[14px]">

        {/* Revenue */}
        <div style={card}>
          <p style={{ fontSize: 10, fontWeight: 700, color: "#9CA3AF", margin: "0 0 10px", textTransform: "uppercase", letterSpacing: "0.1em" }}>Revenue</p>
          <div className="flex items-end gap-6 flex-wrap">
            {received > 0 && (
              <div>
                <p style={{ fontSize: 10, color: "#9CA3AF", margin: "0 0 2px" }}>Received</p>
                <p style={{ fontSize: 26, fontWeight: 900, color: "#16A34A", margin: 0, fontFamily: "var(--font-jakarta)" }}>
                  ₹{received.toLocaleString("en-IN")}
                </p>
              </div>
            )}
            {pending > 0 && (
              <div>
                <p style={{ fontSize: 10, color: "#9CA3AF", margin: "0 0 2px" }}>Pending</p>
                <p style={{ fontSize: 26, fontWeight: 900, color: "#DC2626", margin: 0, fontFamily: "var(--font-jakarta)" }}>
                  ₹{pending.toLocaleString("en-IN")}
                </p>
              </div>
            )}
            {received === 0 && pending === 0 && (
              <p style={{ fontSize: 13, color: "#9CA3AF", margin: 0 }}>No payment data</p>
            )}
          </div>
          {total > 0 && (
            <div style={{ marginTop: 14 }}>
              <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 5 }}>
                <span style={{ fontSize: 10, color: "#9CA3AF" }}>Collection rate</span>
                <span style={{ fontSize: 10, fontWeight: 700, color: "#16A34A" }}>{pct}%</span>
              </div>
              <div style={{ height: 5, borderRadius: 3, background: "#F3F4F6", overflow: "hidden" }}>
                <div style={{ height: "100%", width: `${pct}%`, background: "linear-gradient(90deg,#16A34A,#22C55E)", borderRadius: 3 }} />
              </div>
            </div>
          )}
        </div>

        {/* Package + Payment Status */}
        <div style={card}>
          <p style={{ fontSize: 10, fontWeight: 700, color: "#9CA3AF", margin: "0 0 14px", textTransform: "uppercase", letterSpacing: "0.1em" }}>Package Details</p>

          {/* Key rows */}
          <div style={{ display: "flex", flexDirection: "column", gap: 10, marginBottom: c.service ? 16 : 0 }}>
            {[
              { label: "Package",        value: c.package_name || "—" },
              { label: "Monthly Value",  value: c.current_month ? `₹${c.current_month}` : "—" },
              { label: "Payment Status", value: c.payment_status || "—" },
            ].map(row => (
              <div key={row.label} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12 }}>
                <span style={{ fontSize: 11, color: "#9CA3AF", flexShrink: 0 }}>{row.label}</span>
                <span style={{ fontSize: 12, fontWeight: 700, color: "#111827" }}>{row.value}</span>
              </div>
            ))}
          </div>

          {/* Services as chips */}
          {c.service && (
            <>
              <p style={{ fontSize: 9, fontWeight: 700, color: "#9CA3AF", margin: "0 0 8px", textTransform: "uppercase", letterSpacing: "0.08em" }}>Services</p>
              <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
                {c.service.split(",").map(s => s.trim()).filter(Boolean).map((svc, i) => (
                  <span key={i} style={{
                    fontSize: 10, fontWeight: 600, padding: "4px 10px", borderRadius: 7,
                    background: "rgba(222,26,26,0.06)", color: "#DE1A1A",
                    border: "1px solid rgba(222,26,26,0.15)",
                  }}>
                    {svc}
                  </span>
                ))}
              </div>
            </>
          )}
        </div>
      </div>

      {/* Work Done (real data from Supabase) */}
      {workSummary && (Object.keys(workSummary.workTypes).length > 0 || workSummary.shoots > 0 || workSummary.hours > 0) && (
        <div style={card}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 16 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <p style={{ fontSize: 14, fontWeight: 800, color: "#111827", margin: 0, fontFamily: "var(--font-jakarta)" }}>
                Work Done for This Client
              </p>
              <span style={{ fontSize: 10, fontWeight: 700, background: "rgba(22,163,74,0.09)", color: "#16A34A", padding: "2px 8px", borderRadius: 6 }}>
                Live Data
              </span>
            </div>
            <span style={{ fontSize: 10, color: "#9CA3AF" }}>
              {workSummary.days} active days · {workSummary.hours.toFixed(0)}h total
            </span>
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(110px, 1fr))", gap: 10 }}>
            {/* Shoots */}
            {workSummary.shoots > 0 && (
              <div style={{ borderRadius: 14, padding: "14px 12px", textAlign: "center", background: "rgba(249,115,22,0.07)", border: "1px solid rgba(249,115,22,0.18)" }}>
                <div style={{ fontSize: 22, marginBottom: 4 }}>📸</div>
                <div style={{ fontSize: 28, fontWeight: 900, color: "#F97316", lineHeight: 1, fontFamily: "var(--font-jakarta)" }}>{workSummary.shoots}</div>
                <div style={{ fontSize: 10, color: "#9CA3AF", marginTop: 4, fontWeight: 500 }}>Shoots</div>
              </div>
            )}
            {/* Work types */}
            {Object.entries(workSummary.workTypes)
              .sort((a, b) => b[1] - a[1])
              .map(([type, count]) => {
                const cfg = getWorkTypeCfg(type)
                return (
                  <div key={type} style={{ borderRadius: 14, padding: "14px 12px", textAlign: "center", background: cfg.bg, border: `1px solid ${cfg.color}30` }}>
                    <div style={{ fontSize: 22, marginBottom: 4 }}>{cfg.emoji}</div>
                    <div style={{ fontSize: 28, fontWeight: 900, color: cfg.color, lineHeight: 1, fontFamily: "var(--font-jakarta)" }}>{count}</div>
                    <div style={{ fontSize: 10, color: "#9CA3AF", marginTop: 4, fontWeight: 500 }}>{cfg.label}</div>
                  </div>
                )
              })}
            {/* Total hours */}
            <div style={{ borderRadius: 14, padding: "14px 12px", textAlign: "center", background: "rgba(245,158,11,0.07)", border: "1px solid rgba(245,158,11,0.18)" }}>
              <div style={{ fontSize: 22, marginBottom: 4 }}>⏱️</div>
              <div style={{ fontSize: 28, fontWeight: 900, color: "#F59E0B", lineHeight: 1, fontFamily: "var(--font-jakarta)" }}>{workSummary.hours.toFixed(0)}h</div>
              <div style={{ fontSize: 10, color: "#9CA3AF", marginTop: 4, fontWeight: 500 }}>Hours Logged</div>
            </div>
            {/* Active days */}
            <div style={{ borderRadius: 14, padding: "14px 12px", textAlign: "center", background: "rgba(59,130,246,0.07)", border: "1px solid rgba(59,130,246,0.18)" }}>
              <div style={{ fontSize: 22, marginBottom: 4 }}>📅</div>
              <div style={{ fontSize: 28, fontWeight: 900, color: "#3B82F6", lineHeight: 1, fontFamily: "var(--font-jakarta)" }}>{workSummary.days}</div>
              <div style={{ fontSize: 10, color: "#9CA3AF", marginTop: 4, fontWeight: 500 }}>Active Days</div>
            </div>
          </div>
          {Object.keys(workSummary.workTypes).length === 0 && (
            <p style={{ fontSize: 11, color: "#9CA3AF", marginTop: 8 }}>
              Work types not yet logged. Members set work type in their daily update.
            </p>
          )}
        </div>
      )}

    </div>
  )
}

// ═══════════════════════════════════════════════════════════════════════════════
export default function ClientsSheetView({
  activeClients, pastClients, clientWorkMap = {},
}: { activeClients: SheetClient[]; pastClients: SheetClient[]; clientWorkMap?: Record<string, WorkSummary> }) {
  const [listTab, setListTab]       = useState<"active" | "past">("active")
  const [selected, setSelected]     = useState<SheetClient | null>(activeClients[0] ?? pastClients[0] ?? null)
  const [search, setSearch]         = useState("")
  const [dropOpen, setDropOpen]     = useState(false)
  const [contentTab, setContentTab] = useState("overview")
  const dropRef = useRef<HTMLDivElement>(null)

  // Close dropdown on outside click
  useEffect(() => {
    function handle(e: MouseEvent) {
      if (dropRef.current && !dropRef.current.contains(e.target as Node)) {
        setDropOpen(false)
        setSearch("")
      }
    }
    if (dropOpen) document.addEventListener("mousedown", handle)
    return () => document.removeEventListener("mousedown", handle)
  }, [dropOpen])

  const allClients = listTab === "active" ? activeClients : pastClients
  const filtered = useMemo(() => {
    const q = search.toLowerCase()
    if (!q) return allClients
    return allClients.filter(c =>
      c.company_name.toLowerCase().includes(q) ||
      c.customer_name.toLowerCase().includes(q) ||
      c.industry.toLowerCase().includes(q) ||
      c.place.toLowerCase().includes(q)
    )
  }, [allClients, search])

  const total = activeClients.length + pastClients.length
  const TABS  = ["Overview", "Campaigns", "Payments", "Meetings", "Deliverables", "Notes", "Files"]
  const sel   = selected
  const selPal = sel ? getPal(sel.industry) : DEF_PAL
  const selHp  = sel ? healthScore(sel) : 75
  const selHl  = healthCfg(selHp)

  function pickClient(c: SheetClient) {
    setSelected(c)
    setContentTab("overview")
    setDropOpen(false)
    setSearch("")
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100vh", overflow: "hidden", background: "#F8F9FB" }}>

      {/* ══ PAGE HEADER ══════════════════════════════════════════════════════ */}
      <div style={{ background: "#FFFFFF", borderBottom: "1px solid #EEEEF2", flexShrink: 0,
        padding: "0 16px", minHeight: 68, display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap",
        boxShadow: "0 1px 6px rgba(0,0,0,0.05)" }}>

        {/* Left: Title */}
        <div style={{ flexShrink: 0 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 2 }}>
            <h1 style={{ fontSize: 22, fontWeight: 900, color: "#111827", margin: 0, fontFamily: "var(--font-jakarta)" }}>
              Clients
            </h1>
            <span style={{ fontSize: 11, fontWeight: 700, background: "rgba(222,26,26,0.1)", color: "#DE1A1A",
              padding: "2px 9px", borderRadius: 8, border: "1px solid rgba(222,26,26,0.2)" }}>
              {total} Total
            </span>
          </div>
          <p style={{ fontSize: 11, color: "#9CA3AF", margin: 0 }}>Manage campaigns, relationships, and business growth</p>
        </div>

        {/* Center: AI search */}
        <div style={{ flex: 1, minWidth: 0, display: "flex", justifyContent: "center" }}>
          <div style={{ position: "relative", width: "100%", maxWidth: 380 }}>
            <Sparkles size={13} style={{ position: "absolute", left: 14, top: "50%", transform: "translateY(-50%)", color: "#DE1A1A" }} />
            <input placeholder="Search or ask anything..."
              style={{ width: "100%", boxSizing: "border-box", paddingLeft: 34, paddingRight: 56, paddingTop: 10, paddingBottom: 10,
                borderRadius: 12, border: "1.5px solid #EEEEF2", fontSize: 12, color: "#374151",
                background: "#F9FAFB", outline: "none", boxShadow: "0 2px 8px rgba(0,0,0,0.04)" }} />
            <span style={{ position: "absolute", right: 12, top: "50%", transform: "translateY(-50%)",
              fontSize: 10, fontWeight: 600, color: "#9CA3AF", background: "#EEEEF2",
              padding: "2px 6px", borderRadius: 5 }}>⌘ K</span>
          </div>
        </div>

        {/* Right: Buttons */}
        <div style={{ display: "flex", alignItems: "center", gap: 10, flexShrink: 0 }}>
          <button style={{ display: "flex", alignItems: "center", gap: 6, padding: "8px 16px", borderRadius: 10,
            background: "#DE1A1A", border: "none", color: "#FFFFFF",
            fontSize: 12, fontWeight: 700, cursor: "pointer",
            boxShadow: "0 4px 14px rgba(222,26,26,0.35)" }}>
            <Plus size={14} /> Add Client
          </button>
        </div>
      </div>

      {/* ══ CLIENT SELECTOR DROPDOWN BAR ═════════════════════════════════════ */}
      <div style={{ background: "#FFFFFF", borderBottom: "1px solid #EEEEF2", padding: "12px 20px",
        display: "flex", alignItems: "center", gap: 12, flexShrink: 0, flexWrap: "wrap",
        boxShadow: "0 1px 4px rgba(0,0,0,0.04)" }}>

        {/* Active / Past pills */}
        <div style={{ display: "flex", gap: 4, flexShrink: 0 }}>
          {(["active", "past"] as const).map(t => (
            <button key={t} onClick={() => { setListTab(t); setSelected(t === "active" ? activeClients[0] ?? null : pastClients[0] ?? null); setDropOpen(false) }}
              style={{ padding: "6px 14px", borderRadius: 8, fontSize: 11, fontWeight: 700,
                border: "none", cursor: "pointer", transition: "all 0.15s",
                background: listTab === t ? "#DE1A1A" : "#F3F4F6",
                color: listTab === t ? "#FFFFFF" : "#6B7280",
                boxShadow: listTab === t ? "0 2px 8px rgba(222,26,26,0.3)" : "none" }}>
              {t === "active" ? `Active · ${activeClients.length}` : `Past · ${pastClients.length}`}
            </button>
          ))}
        </div>

        {/* Dropdown trigger */}
        <div ref={dropRef} style={{ position: "relative", flex: 1, maxWidth: 420 }}>
          <button onClick={() => setDropOpen(!dropOpen)} style={{
            width: "100%", display: "flex", alignItems: "center", gap: 10,
            padding: "10px 14px", borderRadius: 12,
            background: dropOpen ? "#FFF5F5" : "#F9FAFB",
            border: `1.5px solid ${dropOpen ? "#DE1A1A" : "#E5E7EB"}`,
            cursor: "pointer", transition: "all 0.15s",
            boxShadow: dropOpen ? "0 0 0 3px rgba(222,26,26,0.08)" : "none",
          }}>
            {sel ? (
              <>
                <div style={{ width: 30, height: 30, borderRadius: 9, background: "#DE1A1A", flexShrink: 0,
                  display: "flex", alignItems: "center", justifyContent: "center",
                  fontSize: 11, fontWeight: 900, color: "#FFF" }}>
                  {ini(sel.company_name || sel.customer_name)}
                </div>
                <div style={{ flex: 1, minWidth: 0, textAlign: "left" }}>
                  <p style={{ fontSize: 13, fontWeight: 800, color: "#111827", margin: 0,
                    overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
                    fontFamily: "var(--font-jakarta)" }}>
                    {sel.company_name || sel.customer_name}
                  </p>
                  <p style={{ fontSize: 10, color: "#9CA3AF", margin: 0 }}>{sel.industry || "General"} · {sel.place || "—"}</p>
                </div>
                <span style={{ fontSize: 9, fontWeight: 700, padding: "2px 8px", borderRadius: 5, flexShrink: 0,
                  background: isActive(sel) ? "rgba(22,163,74,0.1)" : "rgba(107,114,128,0.1)",
                  color: isActive(sel) ? "#16A34A" : "#6B7280" }}>
                  {isActive(sel) ? "Active" : "Inactive"}
                </span>
              </>
            ) : (
              <p style={{ fontSize: 13, color: "#9CA3AF", margin: 0, flex: 1, textAlign: "left" }}>Select a client…</p>
            )}
            <ChevronDown size={15} style={{ color: "#9CA3AF", flexShrink: 0,
              transform: dropOpen ? "rotate(180deg)" : "none", transition: "transform 0.2s" }} />
          </button>

          {/* Dropdown panel */}
          {dropOpen && (
            <div style={{
              position: "absolute", top: "calc(100% + 6px)", left: 0, right: 0, zIndex: 999,
              background: "#FFFFFF", borderRadius: 16, border: "1px solid #E5E7EB",
              boxShadow: "0 8px 32px rgba(0,0,0,0.14), 0 2px 8px rgba(0,0,0,0.06)",
              overflow: "hidden",
            }}>
              {/* Search inside dropdown */}
              <div style={{ padding: "10px 12px", borderBottom: "1px solid #F0F1F5" }}>
                <div style={{ position: "relative" }}>
                  <Search size={12} style={{ position: "absolute", left: 10, top: "50%", transform: "translateY(-50%)", color: "#9CA3AF" }} />
                  <input
                    autoFocus
                    value={search}
                    onChange={e => setSearch(e.target.value)}
                    placeholder="Search clients…"
                    style={{ width: "100%", boxSizing: "border-box", paddingLeft: 30, paddingRight: search ? 30 : 10,
                      paddingTop: 8, paddingBottom: 8, borderRadius: 10,
                      border: "1.5px solid #E5E7EB", fontSize: 12, color: "#111827",
                      background: "#F9FAFB", outline: "none" }}
                  />
                  {search && (
                    <button onClick={() => setSearch("")} style={{ position: "absolute", right: 8, top: "50%",
                      transform: "translateY(-50%)", background: "none", border: "none", cursor: "pointer", padding: 2 }}>
                      <X size={12} style={{ color: "#9CA3AF" }} />
                    </button>
                  )}
                </div>
              </div>

              {/* Client options list */}
              <div style={{ maxHeight: 280, overflowY: "auto" }}>
                {filtered.length === 0 ? (
                  <p style={{ fontSize: 12, color: "#9CA3AF", textAlign: "center", padding: "24px 16px" }}>No clients found</p>
                ) : filtered.map((c, i) => {
                  const p = getPal(c.industry)
                  const live = isActive(c)
                  const isSel = !!sel && sel.company_name === c.company_name && sel.customer_name === c.customer_name
                  return (
                    <button key={i} onClick={() => pickClient(c)} style={{
                      width: "100%", display: "flex", alignItems: "center", gap: 10,
                      padding: "10px 14px", background: isSel ? "rgba(222,26,26,0.04)" : "transparent",
                      border: "none", borderLeft: isSel ? "3px solid #DE1A1A" : "3px solid transparent",
                      cursor: "pointer", textAlign: "left", transition: "background 0.12s",
                    }}>
                      <div style={{ width: 34, height: 34, borderRadius: 10, flexShrink: 0,
                        background: isSel ? "#DE1A1A" : p.dot + "22",
                        color: isSel ? "#FFF" : p.dot,
                        display: "flex", alignItems: "center", justifyContent: "center",
                        fontSize: 11, fontWeight: 900, fontFamily: "var(--font-jakarta)" }}>
                        {ini(c.company_name || c.customer_name)}
                      </div>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <p style={{ fontSize: 13, fontWeight: 700, color: isSel ? "#DE1A1A" : "#111827",
                          margin: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
                          fontFamily: "var(--font-jakarta)" }}>
                          {c.company_name || c.customer_name}
                        </p>
                        <p style={{ fontSize: 10, color: "#9CA3AF", margin: 0 }}>{c.industry || "General"} · {c.place || "—"}</p>
                      </div>
                      <span style={{ fontSize: 9, fontWeight: 700, padding: "2px 7px", borderRadius: 5, flexShrink: 0,
                        background: live ? "rgba(22,163,74,0.1)" : "rgba(107,114,128,0.1)",
                        color: live ? "#16A34A" : "#6B7280" }}>
                        {live ? "Active" : "Inactive"}
                      </span>
                    </button>
                  )
                })}
              </div>

              {/* Add new client footer */}
              <div style={{ padding: "8px 12px", borderTop: "1px solid #F0F1F5" }}>
                <button style={{ width: "100%", padding: "8px 0", borderRadius: 10,
                  border: "1.5px dashed #E5E7EB", background: "transparent", cursor: "pointer",
                  fontSize: 11, fontWeight: 700, color: "#9CA3AF",
                  display: "flex", alignItems: "center", justifyContent: "center", gap: 6 }}>
                  <Plus size={12} /> Add New Client
                </button>
              </div>
            </div>
          )}
        </div>

        {/* Count badge */}
        {sel && (
          <span style={{ fontSize: 11, color: "#9CA3AF", flexShrink: 0, display: "flex", alignItems: "center", gap: 4 }}>
            {filtered.length} of {allClients.length} shown
          </span>
        )}
      </div>

      {/* ══ MAIN CONTENT ═════════════════════════════════════════════════════ */}
      <div className="flex flex-col lg:flex-row" style={{ flex: 1, overflow: "hidden" }}>

        {/* ── CENTER PANEL ───────────────────────────────────────────────── */}
        <div style={{ flex: 1, overflowY: "auto", display: "flex", flexDirection: "column", minWidth: 0 }}>
          {!sel ? (
            <div style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center", flexDirection: "column", gap: 10 }}>
              <div style={{ fontSize: 36 }}>👥</div>
              <p style={{ fontSize: 14, color: "#9CA3AF", margin: 0 }}>Select a client from the dropdown above</p>
            </div>
          ) : (<>

            {/* Hero banner */}
            <div style={{ position: "relative", height: 240, flexShrink: 0, overflow: "hidden" }}>
              <Image src="/brand/client-hero.png" alt="" fill
                style={{ objectFit: "cover", objectPosition: "center top" }} />
              {/* Dark left overlay */}
              <div style={{ position: "absolute", inset: 0,
                background: "linear-gradient(to right, rgba(0,0,0,0.68) 0%, rgba(0,0,0,0.25) 50%, transparent 100%)" }} />
              {/* Dark bottom scrim for text */}
              <div style={{ position: "absolute", bottom: 0, left: 0, right: 0, height: "60%",
                background: "linear-gradient(to top, rgba(0,0,0,0.5) 0%, transparent 100%)" }} />
              {/* White fade at very bottom */}
              <div style={{ position: "absolute", inset: 0,
                background: "linear-gradient(to bottom, transparent 58%, rgba(248,249,251,1) 100%)" }} />

              {/* Client identity */}
              <div style={{ position: "absolute", bottom: 20, left: 22 }}>
                <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 10 }}>
                  <div style={{ width: 48, height: 48, borderRadius: 16, background: "#DE1A1A",
                    display: "flex", alignItems: "center", justifyContent: "center",
                    fontSize: 17, fontWeight: 900, color: "#FFF", fontFamily: "var(--font-jakarta)",
                    border: "2.5px solid rgba(255,255,255,0.4)",
                    boxShadow: "0 4px 16px rgba(222,26,26,0.45)" }}>
                    {ini(sel.company_name || sel.customer_name)}
                  </div>
                  <div>
                    <h2 style={{ fontSize: 22, fontWeight: 900, color: "#FFFFFF", margin: "0 0 5px",
                      fontFamily: "var(--font-jakarta)", textShadow: "0 2px 8px rgba(0,0,0,0.4)" }}>
                      {(sel.company_name || sel.customer_name).toUpperCase()}
                    </h2>
                    <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                      <span style={{ fontSize: 10, fontWeight: 700,
                        background: isActive(sel) ? "rgba(22,163,74,0.9)" : "rgba(107,114,128,0.8)",
                        color: "#FFF", padding: "3px 10px", borderRadius: 6, backdropFilter: "blur(8px)" }}>
                        {(sel.client_status || "Active").toUpperCase()}
                      </span>
                      <span style={{ fontSize: 11, color: "rgba(255,255,255,0.9)", fontWeight: 600,
                        textShadow: "0 1px 4px rgba(0,0,0,0.5)" }}>
                        {sel.industry || sel.service}
                      </span>
                    </div>
                  </div>
                </div>
                <div style={{ display: "flex", gap: 18, flexWrap: "wrap" }}>
                  {[
                    { icon: "📍", text: sel.place || "Tamil Nadu" },
                    { icon: "📅", text: `Joined ${sel.onboarded_month || "Jan 2025"}` },
                    ...(sel.period ? [{ icon: "⏱", text: `Since ${sel.period}` }] : []),
                  ].map((item, i) => (
                    <span key={i} style={{ fontSize: 11, color: "#FFFFFF", fontWeight: 600,
                      display: "flex", alignItems: "center", gap: 4,
                      textShadow: "0 1px 5px rgba(0,0,0,0.6)" }}>
                      {item.icon} {item.text}
                    </span>
                  ))}
                </div>
              </div>

              {/* Relationship Health card */}
              <div style={{ position: "absolute", top: 14, right: 14,
                background: "rgba(255,255,255,0.95)", backdropFilter: "blur(16px)",
                borderRadius: 18, padding: "14px 18px",
                border: "1px solid rgba(255,255,255,0.8)",
                boxShadow: "0 8px 32px rgba(0,0,0,0.14), 0 0 0 1px rgba(0,0,0,0.04)",
                minWidth: 195 }}>
                <p style={{ fontSize: 9, fontWeight: 700, color: "#9CA3AF", margin: "0 0 10px",
                  textTransform: "uppercase", letterSpacing: "0.12em" }}>Relationship Health</p>
                <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 10 }}>
                  <HealthDonut pct={selHp} color={selHl.color} />
                  <div>
                    <p style={{ fontSize: 22, fontWeight: 900, color: "#111827", margin: "0 0 2px",
                      fontFamily: "var(--font-jakarta)" }}>{selHp}%</p>
                    <p style={{ fontSize: 12, fontWeight: 700, color: selHl.color, margin: 0 }}>{selHl.label}</p>
                  </div>
                </div>
                <div style={{ display: "flex", flexDirection: "column", gap: 3 }}>
                  <p style={{ fontSize: 10, color: "#6B7280", margin: 0 }}>❤️ Strong partnership</p>
                  <p style={{ fontSize: 10, color: "#6B7280", margin: 0 }}>📈 Long term potential</p>
                </div>
              </div>
            </div>

            {/* Info cards row */}
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 px-4 md:px-[22px] pt-[14px]">
              {[
                { label: "Monthly Package",  value: sel.current_month ? `₹${sel.current_month}` : sel.package_name || "—", sub: sel.package_name || "",  emoji: "💜", bg: "rgba(139,92,246,0.07)", border: "rgba(139,92,246,0.2)" },
                { label: "Payment Status",   value: sel.payment_status || "—",                    sub: sel.received ? `Received: ₹${sel.received}` : "No payment yet", emoji: "💳", bg: "rgba(22,163,74,0.07)", border: "rgba(22,163,74,0.2)" },
                { label: "Industry",         value: sel.industry || "—",                           sub: "",                 emoji: "🏢", bg: selPal.bg, border: selPal.border },
                { label: "Client Since",     value: sel.onboarded_month || "—",                    sub: sel.period || "",   emoji: "📅", bg: "rgba(59,130,246,0.07)", border: "rgba(59,130,246,0.2)" },
              ].map((card, i) => (
                <div key={i} style={{ background: "#FFFFFF", borderRadius: 14, border: "1px solid #F0F1F5",
                  padding: "14px 16px", boxShadow: "0 2px 8px rgba(0,0,0,0.04)",
                  display: "flex", alignItems: "flex-start", gap: 12 }}>
                  <div style={{ width: 38, height: 38, borderRadius: 11, background: card.bg,
                    border: `1.5px solid ${card.border}`, display: "flex", alignItems: "center",
                    justifyContent: "center", fontSize: 18, flexShrink: 0, marginTop: 2 }}>
                    {card.emoji}
                  </div>
                  <div style={{ minWidth: 0, flex: 1 }}>
                    <p style={{ fontSize: 9, fontWeight: 700, color: "#9CA3AF", margin: "0 0 4px",
                      textTransform: "uppercase", letterSpacing: "0.08em" }}>{card.label}</p>
                    <p style={{ fontSize: 14, fontWeight: 800, color: "#111827", margin: "0 0 3px",
                      fontFamily: "var(--font-jakarta)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                      {card.value}
                    </p>
                    {card.sub && (
                      <p style={{ fontSize: 10, color: "#9CA3AF", margin: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                        {card.sub}
                      </p>
                    )}
                  </div>
                </div>
              ))}
            </div>

            {/* Tabs */}
            <div style={{ display: "flex", gap: 4, padding: "14px 22px 0", overflowX: "auto" }}>
              {TABS.map(t => (
                <button key={t} onClick={() => setContentTab(t.toLowerCase())}
                  style={{ padding: "8px 16px", borderRadius: 10, fontSize: 12, fontWeight: 700,
                    border: "none", cursor: "pointer", whiteSpace: "nowrap", transition: "all 0.15s",
                    background: contentTab === t.toLowerCase() ? "#DE1A1A" : "rgba(0,0,0,0.04)",
                    color: contentTab === t.toLowerCase() ? "#FFFFFF" : "#6B7280",
                    boxShadow: contentTab === t.toLowerCase() ? "0 4px 14px rgba(222,26,26,0.3)" : "none" }}>
                  {t}
                </button>
              ))}
            </div>

            {/* Content */}
            {contentTab === "overview" && (
              <OverviewTab
                c={sel}
                workSummary={
                  clientWorkMap[(sel.company_name || sel.customer_name).toLowerCase()] ??
                  clientWorkMap[sel.customer_name?.toLowerCase() ?? ""] ??
                  clientWorkMap[sel.company_name?.toLowerCase() ?? ""]
                }
              />
            )}
            {contentTab !== "overview" && (
              <div style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center", padding: "60px 24px" }}>
                <div style={{ textAlign: "center" }}>
                  <div style={{ fontSize: 32, marginBottom: 12 }}>🚧</div>
                  <p style={{ fontSize: 14, fontWeight: 700, color: "#9CA3AF", margin: 0 }}>
                    {contentTab.charAt(0).toUpperCase() + contentTab.slice(1)} coming soon
                  </p>
                </div>
              </div>
            )}
          </>)}
        </div>

      </div>
    </div>
  )
}
