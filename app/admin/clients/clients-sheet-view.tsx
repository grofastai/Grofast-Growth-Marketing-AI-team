"use client"

import { useState, useMemo } from "react"
import Image from "next/image"
import {
  Search, Plus, MoreHorizontal, CheckCircle2, TrendingUp,
  ChevronDown, Sparkles, Bell, SlidersHorizontal,
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

// ── Sparkline paths (150×30 viewbox) ─────────────────────────────────────────
const SPARKS = [
  "M0,24 C25,20 40,10 60,13 S90,6 110,9 S135,4 150,6",
  "M0,20 C20,22 40,14 58,17 S88,12 112,14 S138,10 150,11",
  "M0,18 C22,22 38,16 56,20 S82,18 106,20 S132,18 150,19",
  "M0,22 C18,20 36,24 54,22 S82,24 106,22 S130,24 150,22",
  "M0,20 C24,22 38,18 58,20 S88,22 110,20 S136,22 150,20",
  "M0,18 C22,20 40,14 56,16 S86,10 110,12 S136,8 150,10",
  "M0,22 C20,18 38,22 56,18 S84,14 108,16 S132,12 150,14",
  "M0,20 C18,16 36,20 54,16 S80,12 104,14 S130,10 150,12",
]

// ── Mini SVG Charts ───────────────────────────────────────────────────────────
function ClientSparkline({ color, idx }: { color: string; idx: number }) {
  const d = SPARKS[idx % SPARKS.length]
  return (
    <svg viewBox="0 0 150 30" width="100%" height="30" style={{ display: "block" }}>
      <defs>
        <linearGradient id={`sg${idx}`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={color} stopOpacity="0.2" />
          <stop offset="100%" stopColor={color} stopOpacity="0" />
        </linearGradient>
      </defs>
      <path d={`${d} L150,30 L0,30 Z`} fill={`url(#sg${idx})`} />
      <path d={d} fill="none" stroke={color} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}

function RevSparkline({ color }: { color: string }) {
  return (
    <svg viewBox="0 0 200 50" width="100%" height="50" style={{ display: "block" }}>
      <defs>
        <linearGradient id="rsg" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={color} stopOpacity="0.25" />
          <stop offset="100%" stopColor={color} stopOpacity="0" />
        </linearGradient>
      </defs>
      <polygon points="0,45 0,35 30,28 55,32 80,20 110,24 140,12 170,16 200,5 200,45"
        fill="url(#rsg)" />
      <polyline points="0,35 30,28 55,32 80,20 110,24 140,12 170,16 200,5"
        fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
      <text x="2"  y="48" fontSize="8" fill="#9CA3AF">May 1</text>
      <text x="84" y="48" fontSize="8" fill="#9CA3AF" textAnchor="middle">May 15</text>
      <text x="198" y="48" fontSize="8" fill="#9CA3AF" textAnchor="end">May 31</text>
    </svg>
  )
}

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
      {/* Sparkline */}
      <div style={{ paddingBottom: 4, opacity: 0.85 }}>
        <ClientSparkline color={isSelected ? "#DE1A1A" : p.spark} idx={idx} />
      </div>
    </button>
  )
}

// ── Activity data ─────────────────────────────────────────────────────────────
interface Act { av: string; avBg: string; avCol: string; title: string; detail: string; time: string; dot: string; icon?: string }
function buildActs(c: SheetClient): Act[] {
  return [
    { av: "SK", avBg: "#FEE2E2", avCol: "#DE1A1A", title: "Sanjay K updated campaign",  detail: "Summer Offer Campaign",           time: "2m ago",          dot: "#22C55E" },
    { av: "₹",  avBg: "#F0FDF4", avCol: "#16A34A", title: "New payment received",        detail: `${c.received || "₹15,000"} from ${c.company_name || "client"}`, time: "30m ago", dot: "#22C55E" },
    { av: "MM", avBg: "#EDE9FE", avCol: "#7C3AED", title: "Manju M uploaded a file",     detail: "Menu Design Final.pdf",           time: "1h ago",          dot: "#7C3AED" },
    { av: "✓",  avBg: "#F0FDF4", avCol: "#16A34A", title: "Campaign approved",           detail: "New Menu Launch",                 time: "2h ago",          dot: "#22C55E" },
    { av: "📅", avBg: "#EFF6FF", avCol: "#1D4ED8", title: "Meeting scheduled",           detail: `Strategy Call with ${c.customer_name || "client"}`, time: "Tomorrow, 11:00 AM", dot: "#3B82F6" },
    { av: "VR", avBg: "#FFF3E0", avCol: "#F97316", title: "Vignesh R commented",         detail: "on Promo Video",                  time: "3h ago",          dot: "#F97316" },
    { av: "🧾", avBg: "#FFFBEB", avCol: "#B45309", title: "Invoice sent",                detail: `#INV-2026-${c.sno || "0456"}`,   time: "5h ago",          dot: "#F59E0B" },
    { av: "MM", avBg: "#EDE9FE", avCol: "#7C3AED", title: "Manju M uploaded a file",     detail: "Banner Design V2.png",            time: "1d ago",          dot: "#9CA3AF" },
  ]
}

// ── Overview Tab ──────────────────────────────────────────────────────────────
function OverviewTab({ c, workSummary }: { c: SheetClient; workSummary?: WorkSummary }) {
  const received = parseAmt(c.received) || 180000
  const pending  = parseAmt(c.pending)
  const total    = received + pending
  const pct      = total > 0 ? Math.round((received / total) * 100) : 68

  const card: React.CSSProperties = {
    background: "#FFFFFF", borderRadius: 20, border: "1px solid #F0F1F5",
    padding: "18px 20px", boxShadow: "0 2px 12px rgba(0,0,0,0.05)",
  }

  const deliverables = [
    { name: "Brand Strategy Document",    done: true,  pct: 100, color: "#22C55E" },
    { name: "Social Media Creatives (10)",done: false, pct: 80,  color: "#3B82F6" },
    { name: "Promo Video (30 sec)",       done: false, pct: 60,  color: "#F59E0B" },
    { name: "Menu Design",                done: false, pct: 40,  color: "#A855F7" },
  ]
  return (
    <div style={{ padding: "18px 22px 40px", display: "flex", flexDirection: "column", gap: 16 }}>

      {/* Row 1: Revenue | Progress | Pipeline */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-[14px]">

        {/* Revenue */}
        <div style={card}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 10 }}>
            <p style={{ fontSize: 10, fontWeight: 700, color: "#9CA3AF", margin: 0, textTransform: "uppercase", letterSpacing: "0.1em" }}>Total Revenue</p>
            <MoreHorizontal size={14} style={{ color: "#D1D5DB" }} />
          </div>
          <p style={{ fontSize: 28, fontWeight: 900, color: "#111827", margin: "0 0 3px", fontFamily: "var(--font-jakarta)" }}>
            ₹{received.toLocaleString("en-IN")}
          </p>
          <p style={{ fontSize: 11, color: "#22C55E", margin: "0 0 10px", fontWeight: 600, display: "flex", alignItems: "center", gap: 4 }}>
            <TrendingUp size={11} /> +24.5% vs last 30 days
          </p>
          <RevSparkline color="#22C55E" />
        </div>

        {/* Campaign Progress */}
        <div style={card}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 6 }}>
            <p style={{ fontSize: 10, fontWeight: 700, color: "#9CA3AF", margin: 0, textTransform: "uppercase", letterSpacing: "0.1em" }}>Campaign Progress</p>
            <MoreHorizontal size={14} style={{ color: "#D1D5DB" }} />
          </div>
          <div style={{ display: "flex", justifyContent: "center", margin: "2px 0 8px" }}>
            <DonutChart pct={pct} color="#DE1A1A" />
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 5 }}>
            {[{ l: "Completed", n: 12, c: "#22C55E" }, { l: "In Progress", n: 5, c: "#F59E0B" }, { l: "Pending", n: 3, c: "#9CA3AF" }].map(r => (
              <div key={r.l} style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                <span style={{ display: "flex", alignItems: "center", gap: 5, fontSize: 10, color: "#6B7280" }}>
                  <span style={{ width: 6, height: 6, borderRadius: "50%", background: r.c, display: "inline-block" }} />{r.l}
                </span>
                <span style={{ fontSize: 10, fontWeight: 700, color: "#374151" }}>{r.n}</span>
              </div>
            ))}
          </div>
        </div>

        {/* Content Pipeline */}
        <div style={card}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 12 }}>
            <p style={{ fontSize: 10, fontWeight: 700, color: "#9CA3AF", margin: 0, textTransform: "uppercase", letterSpacing: "0.1em" }}>Content Pipeline</p>
            <MoreHorizontal size={14} style={{ color: "#D1D5DB" }} />
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 8 }}>
            {[
              { label: "Ideas",       count: 3, color: "#3B82F6", items: ["Summer Offer", "New Menu Launch"] },
              { label: "In Progress", count: 5, color: "#F59E0B", items: ["Promo Video", "Social Media Ads"] },
              { label: "Review",      count: 2, color: "#A855F7", items: ["Poster Design", "Menu Brochure"] },
            ].map(col => (
              <div key={col.label}>
                <div style={{ display: "flex", alignItems: "center", gap: 3, marginBottom: 7 }}>
                  <span style={{ width: 7, height: 7, borderRadius: 2, background: col.color, flexShrink: 0 }} />
                  <span style={{ fontSize: 8, fontWeight: 700, color: col.color, textTransform: "uppercase", letterSpacing: "0.04em" }}>{col.label}</span>
                  <span style={{ fontSize: 8, color: "#9CA3AF", marginLeft: "auto" }}>{col.count}</span>
                </div>
                <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                  {col.items.map(item => (
                    <div key={item} style={{ background: "#F9FAFB", borderRadius: 6, padding: "4px 6px",
                      fontSize: 9, color: "#374151", fontWeight: 600, border: "1px solid #F3F4F6",
                      overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                      {item}
                    </div>
                  ))}
                  <span style={{ fontSize: 9, color: "#9CA3AF" }}>+ {col.count - col.items.length} more</span>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Deliverables Tracker */}
      <div style={card}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 16 }}>
          <p style={{ fontSize: 10, fontWeight: 700, color: "#9CA3AF", margin: 0, textTransform: "uppercase", letterSpacing: "0.1em" }}>Deliverables Tracker</p>
          <MoreHorizontal size={14} style={{ color: "#D1D5DB" }} />
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: 13 }}>
          {deliverables.map((d, i) => (
            <div key={i}>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 5 }}>
                <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                  <CheckCircle2 size={12} style={{ color: d.done ? "#22C55E" : "#E5E7EB", flexShrink: 0 }} />
                  <span style={{ fontSize: 11, fontWeight: 600, color: "#374151" }}>{d.name}</span>
                </div>
                {d.done
                  ? <span style={{ fontSize: 9, fontWeight: 700, color: "#22C55E", background: "rgba(34,197,94,0.1)", padding: "2px 7px", borderRadius: 5 }}>Completed</span>
                  : <span style={{ fontSize: 10, fontWeight: 600, color: "#6B7280" }}>{d.pct}%</span>
                }
              </div>
              <div style={{ height: 4, borderRadius: 2, background: "#F3F4F6", overflow: "hidden" }}>
                <div style={{ height: "100%", borderRadius: 2, width: `${d.pct}%`, background: d.color, transition: "width 0.5s ease" }} />
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Row 3: Work Done (real data from Supabase) */}
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
  const [listTab, setListTab]     = useState<"active" | "past">("active")
  const [selected, setSelected]   = useState<SheetClient | null>(activeClients[0] ?? pastClients[0] ?? null)
  const [search, setSearch]       = useState("")
  const [contentTab, setContentTab] = useState("overview")

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
  const acts   = sel ? buildActs(sel) : []

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

        {/* Right: Buttons + icons */}
        <div style={{ display: "flex", alignItems: "center", gap: 10, flexShrink: 0, flexWrap: "wrap" }}>
          <button style={{ display: "flex", alignItems: "center", gap: 6, padding: "8px 14px", borderRadius: 10,
            background: "#F0FDF4", border: "1px solid #BBF7D0", color: "#16A34A",
            fontSize: 12, fontWeight: 700, cursor: "pointer" }}>
            <span style={{ fontSize: 14 }}>📊</span> Import Sheets
          </button>
          <button style={{ display: "flex", alignItems: "center", gap: 6, padding: "8px 16px", borderRadius: 10,
            background: "#DE1A1A", border: "none", color: "#FFFFFF",
            fontSize: 12, fontWeight: 700, cursor: "pointer",
            boxShadow: "0 4px 14px rgba(222,26,26,0.35)" }}>
            <Plus size={14} /> Add Client
          </button>
          <div style={{ position: "relative", cursor: "pointer" }}>
            <Bell size={20} style={{ color: "#374151" }} />
            <span style={{ position: "absolute", top: -6, right: -6, width: 16, height: 16,
              background: "#DE1A1A", borderRadius: "50%", fontSize: 8, fontWeight: 900,
              color: "#FFF", display: "flex", alignItems: "center", justifyContent: "center",
              border: "2px solid #FFF" }}>8</span>
          </div>
          <div style={{ width: 34, height: 34, borderRadius: "50%", background: "linear-gradient(135deg,#FEE2E2,#FCA5A5)",
            display: "flex", alignItems: "center", justifyContent: "center",
            fontSize: 11, fontWeight: 900, color: "#DE1A1A", border: "2px solid #FFF",
            boxShadow: "0 2px 8px rgba(0,0,0,0.1)", cursor: "pointer" }}>
            SK
          </div>
        </div>
      </div>

      {/* ══ MAIN 3-PANEL ═════════════════════════════════════════════════════ */}
      <div className="flex flex-col lg:flex-row" style={{ flex: 1, overflow: "hidden" }}>

        {/* ── LEFT PANEL ─────────────────────────────────────────────────── */}
        <div className="w-full lg:w-[280px] lg:flex-shrink-0 flex flex-col overflow-hidden lg:max-h-none max-h-[40vh]"
          style={{ background: "#FFFFFF", borderRight: "1px solid #EEEEF2",
          boxShadow: "2px 0 10px rgba(0,0,0,0.04)" }}>

          {/* Search + filter */}
          <div style={{ padding: "14px 14px 10px", borderBottom: "1px solid #F0F1F5" }}>
            <div style={{ position: "relative" }}>
              <Search size={12} style={{ position: "absolute", left: 10, top: "50%", transform: "translateY(-50%)", color: "#9CA3AF" }} />
              <input value={search} onChange={e => setSearch(e.target.value)}
                placeholder="Search clients…"
                style={{ width: "100%", boxSizing: "border-box", paddingLeft: 30, paddingRight: 36, paddingTop: 8, paddingBottom: 8,
                  borderRadius: 10, border: "1.5px solid #F0F1F5", fontSize: 11, color: "#111827",
                  background: "#F9FAFB", outline: "none" }} />
              <button style={{ position: "absolute", right: 8, top: "50%", transform: "translateY(-50%)",
                background: "none", border: "none", cursor: "pointer", padding: 2 }}>
                <SlidersHorizontal size={13} style={{ color: "#9CA3AF" }} />
              </button>
            </div>
          </div>

          {/* Active / Past tabs */}
          <div style={{ display: "flex", padding: "8px 12px 6px", gap: 4, borderBottom: "1px solid #F0F1F5" }}>
            {(["active", "past"] as const).map(t => (
              <button key={t} onClick={() => { setListTab(t); setSearch("") }}
                style={{ flex: 1, padding: "6px 0", borderRadius: 8, fontSize: 11, fontWeight: 700,
                  border: "none", cursor: "pointer", transition: "all 0.15s",
                  background: listTab === t ? "#DE1A1A" : "#F3F4F6",
                  color: listTab === t ? "#FFFFFF" : "#6B7280",
                  boxShadow: listTab === t ? "0 2px 8px rgba(222,26,26,0.3)" : "none" }}>
                {t === "active" ? `Active · ${activeClients.length}` : `Past · ${pastClients.length}`}
              </button>
            ))}
          </div>

          {/* Client list */}
          <div style={{ flex: 1, overflowY: "auto", padding: "10px 12px", display: "flex", flexDirection: "column", gap: 8 }}>
            {filtered.length === 0
              ? <p style={{ fontSize: 12, color: "#9CA3AF", textAlign: "center", paddingTop: 40 }}>No clients found</p>
              : filtered.map((c, i) => (
                <ClientCard key={i} c={c} idx={i}
                  isSelected={!!sel && sel.company_name === c.company_name && sel.customer_name === c.customer_name}
                  onClick={() => { setSelected(c); setContentTab("overview") }} />
              ))
            }
          </div>

          {/* Add client footer */}
          <div style={{ padding: "10px 14px", borderTop: "1px solid #F0F1F5" }}>
            <button style={{ width: "100%", padding: "10px 0", borderRadius: 12,
              border: "1.5px dashed #E5E7EB", background: "transparent", cursor: "pointer",
              fontSize: 11, fontWeight: 700, color: "#9CA3AF",
              display: "flex", alignItems: "center", justifyContent: "center", gap: 6 }}>
              <Plus size={12} /> Add New Client
            </button>
          </div>
        </div>

        {/* ── CENTER PANEL ───────────────────────────────────────────────── */}
        <div style={{ flex: 1, overflowY: "auto", display: "flex", flexDirection: "column", minWidth: 0 }}>
          {!sel ? (
            <div style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center" }}>
              <p style={{ fontSize: 14, color: "#9CA3AF" }}>Select a client to view details</p>
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
                    { icon: "⏱", text: `Client Since ${sel.period || "10 Months"}` },
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
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 px-4 md:px-[22px] pt-[14px]">
              {[
                { label: "Monthly Package",  value: sel.current_month || "₹15,000", sub: sel.package_name || "Standard",      emoji: "💜", bg: "rgba(139,92,246,0.07)", border: "rgba(139,92,246,0.2)" },
                { label: "Assigned Manager", value: "Sanjay K",                      sub: "Project Manager",                   emoji: "👤", bg: "rgba(59,130,246,0.07)",  border: "rgba(59,130,246,0.2)" },
                { label: "Industry",         value: sel.industry || "—",             sub: sel.service || "Digital Marketing",  emoji: "🏢", bg: selPal.bg,                border: selPal.border },
                { label: "Campaign Health",  value: selHl.label,                     sub: sel.payment_status || "On Track",    emoji: "⚡", bg: selHl.bg,                border: "transparent" },
              ].map((card, i) => (
                <div key={i} style={{ background: "#FFFFFF", borderRadius: 14, border: "1px solid #F0F1F5",
                  padding: "12px 14px", boxShadow: "0 2px 8px rgba(0,0,0,0.04)",
                  display: "flex", alignItems: "center", gap: 10 }}>
                  <div style={{ width: 36, height: 36, borderRadius: 11, background: card.bg,
                    border: `1.5px solid ${card.border}`, display: "flex", alignItems: "center",
                    justifyContent: "center", fontSize: 17, flexShrink: 0 }}>
                    {card.emoji}
                  </div>
                  <div style={{ minWidth: 0, flex: 1 }}>
                    <p style={{ fontSize: 8, fontWeight: 700, color: "#9CA3AF", margin: "0 0 2px",
                      textTransform: "uppercase", letterSpacing: "0.1em" }}>{card.label}</p>
                    <p style={{ fontSize: 13, fontWeight: 800, color: "#111827", margin: "0 0 1px",
                      fontFamily: "var(--font-jakarta)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                      {card.value}
                    </p>
                    <p style={{ fontSize: 10, color: "#9CA3AF", margin: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{card.sub}</p>
                  </div>
                  <MoreHorizontal size={13} style={{ color: "#E5E7EB", flexShrink: 0 }} />
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

        {/* ── RIGHT PANEL ────────────────────────────────────────────────── */}
        <div className="hidden lg:flex flex-col lg:w-[258px] lg:flex-shrink-0 overflow-y-auto"
          style={{ background: "#FFFFFF", borderLeft: "1px solid #EEEEF2",
          boxShadow: "-2px 0 10px rgba(0,0,0,0.04)" }}>

          <div style={{ padding: "18px 16px 12px", borderBottom: "1px solid #F0F1F5",
            display: "flex", alignItems: "center", justifyContent: "space-between" }}>
            <p style={{ fontSize: 14, fontWeight: 800, color: "#111827", margin: 0, fontFamily: "var(--font-jakarta)" }}>
              Activity Feed
            </p>
            <button style={{ fontSize: 11, fontWeight: 700, color: "#DE1A1A", background: "none", border: "none", cursor: "pointer" }}>
              View all
            </button>
          </div>

          <div style={{ flex: 1, padding: "14px 16px", display: "flex", flexDirection: "column", gap: 14 }}>
            {acts.map((item, i) => (
              <div key={i} style={{ display: "flex", gap: 10, alignItems: "flex-start" }}>
                <div style={{ width: 30, height: 30, borderRadius: 10, background: item.avBg, flexShrink: 0,
                  display: "flex", alignItems: "center", justifyContent: "center",
                  fontSize: 9, fontWeight: 900, color: item.avCol }}>
                  {item.av}
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 4, marginBottom: 1 }}>
                    <p style={{ fontSize: 11, fontWeight: 700, color: "#111827", margin: 0,
                      overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", flex: 1 }}>
                      {item.title}
                    </p>
                    <span style={{ width: 6, height: 6, borderRadius: "50%", background: item.dot, flexShrink: 0 }} />
                  </div>
                  <p style={{ fontSize: 10, color: "#6B7280", margin: "0 0 2px",
                    overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                    {item.detail}
                  </p>
                  <p style={{ fontSize: 9, color: "#D1D5DB", margin: 0 }}>{item.time}</p>
                </div>
              </div>
            ))}
          </div>

          <div style={{ padding: "12px 16px", borderTop: "1px solid #F0F1F5" }}>
            <button style={{ width: "100%", padding: "10px 0", borderRadius: 12,
              border: "1.5px solid rgba(222,26,26,0.25)", background: "rgba(222,26,26,0.04)",
              cursor: "pointer", fontSize: 11, fontWeight: 700, color: "#DE1A1A" }}>
              View All Activity
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
