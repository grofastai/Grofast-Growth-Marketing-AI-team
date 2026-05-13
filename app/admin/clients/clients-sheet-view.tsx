"use client"

import { useState, useMemo } from "react"
import Image from "next/image"
import {
  Search, Plus, MoreHorizontal, CheckCircle2, TrendingUp,
  ChevronDown, Sparkles,
} from "lucide-react"
import type { SheetClient } from "@/lib/google/sheets"

// ── Design tokens ─────────────────────────────────────────────────────────────
const INDUSTRY_PAL: Record<string, { bg: string; text: string; border: string; dot: string }> = {
  "Food & Restaurant":  { bg: "#FFF7ED", text: "#C2410C", border: "#FED7AA", dot: "#F97316" },
  "Education":          { bg: "#EFF6FF", text: "#1D4ED8", border: "#BFDBFE", dot: "#3B82F6" },
  "NGO":                { bg: "#F0FDF4", text: "#15803D", border: "#BBF7D0", dot: "#22C55E" },
  "Health & Beauty":    { bg: "#FDF4FF", text: "#A21CAF", border: "#F0ABFC", dot: "#D946EF" },
  "Textile":            { bg: "#F0F9FF", text: "#0369A1", border: "#BAE6FD", dot: "#0EA5E9" },
  "Real Estate":        { bg: "#FFFBEB", text: "#B45309", border: "#FDE68A", dot: "#F59E0B" },
}
const DEFAULT_PAL = { bg: "#F3F4F6", text: "#374151", border: "#E5E7EB", dot: "#6B7280" }
function pal(industry: string) { return INDUSTRY_PAL[industry] ?? DEFAULT_PAL }

// ── Helpers ───────────────────────────────────────────────────────────────────
function initials(name: string) {
  return name.split(" ").map(n => n[0] ?? "").join("").slice(0, 2).toUpperCase() || "??"
}
function parseAmt(s: string) {
  const n = parseFloat(s.replace(/[^\d.]/g, ""))
  return isNaN(n) ? 0 : n
}
function fmtAmt(n: number) {
  if (n >= 100000) return `₹${(n / 100000).toFixed(1)}L`
  if (n >= 1000)   return `₹${(n / 1000).toFixed(0)}K`
  return n > 0 ? `₹${n}` : "—"
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

// ── SVG Micro-charts ──────────────────────────────────────────────────────────
function Sparkline({ color }: { color: string }) {
  return (
    <svg viewBox="0 0 140 46" width="100%" height="46" style={{ overflow: "visible" }}>
      <defs>
        <linearGradient id="sg" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={color} stopOpacity="0.25" />
          <stop offset="100%" stopColor={color} stopOpacity="0" />
        </linearGradient>
      </defs>
      <polygon points="0,42 0,36 20,28 40,32 60,18 80,22 100,10 120,14 140,4 140,42"
        fill="url(#sg)" />
      <polyline points="0,36 20,28 40,32 60,18 80,22 100,10 120,14 140,4"
        fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
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
        transform={`rotate(-90 ${cx} ${cy})`}
        style={{ transition: "stroke-dasharray 0.6s ease" }} />
      <text x={cx} y={cy - 5} textAnchor="middle" fontSize={size * 0.18}
        fontWeight="900" fill="#111827">{pct}%</text>
      <text x={cx} y={cy + 11} textAnchor="middle" fontSize={size * 0.09} fill="#9CA3AF">Complete</text>
    </svg>
  )
}

function MiniDonut({ pct, color }: { pct: number; color: string }) {
  const r = 22, cx = 30, cy = 30, circ = 2 * Math.PI * r
  const filled = (pct / 100) * circ
  return (
    <svg viewBox="0 0 60 60" width="54" height="54">
      <circle cx={cx} cy={cy} r={r} fill="none" stroke="#F3F4F6" strokeWidth="7" />
      <circle cx={cx} cy={cy} r={r} fill="none" stroke={color} strokeWidth="7"
        strokeDasharray={`${filled} ${circ}`} strokeLinecap="round"
        transform={`rotate(-90 ${cx} ${cy})`} />
      <text x={cx} y={cy} textAnchor="middle" dominantBaseline="middle"
        fontSize="12" fontWeight="900" fill="#111827">{pct}%</text>
    </svg>
  )
}

// ── Left panel – client pill ───────────────────────────────────────────────────
function ClientPill({
  c, isSelected, onClick,
}: { c: SheetClient; isSelected: boolean; onClick: () => void }) {
  const p    = pal(c.industry)
  const hp   = healthScore(c)
  const hl   = healthCfg(hp)
  const ini  = initials(c.company_name || c.customer_name)
  const rev  = parseAmt(c.received)
  const live = c.client_status.toLowerCase().includes("active")

  return (
    <button onClick={onClick} style={{
      display: "flex", alignItems: "center", gap: 10, width: "100%",
      padding: "10px 12px", borderRadius: 14, border: "1.5px solid",
      cursor: "pointer", textAlign: "left", transition: "all 0.18s",
      borderColor: isSelected ? "#DE1A1A" : "#F0F1F5",
      background: isSelected
        ? "linear-gradient(135deg,#FFF1F1 0%,#FFF8F8 100%)"
        : "#FFFFFF",
      boxShadow: isSelected
        ? "0 4px 16px rgba(222,26,26,0.12)"
        : "0 1px 4px rgba(0,0,0,0.04)",
    }}>
      {/* Avatar */}
      <div style={{
        width: 38, height: 38, borderRadius: 12, flexShrink: 0,
        display: "flex", alignItems: "center", justifyContent: "center",
        background: isSelected ? "#DE1A1A" : p.dot + "22",
        color: isSelected ? "#FFF" : p.dot,
        fontSize: 12, fontWeight: 900, fontFamily: "var(--font-jakarta)",
        border: `1.5px solid ${isSelected ? "#DE1A1A" : p.border}`,
      }}>{ini}</div>

      {/* Text */}
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 2 }}>
          <p style={{ fontSize: 12, fontWeight: 800, color: isSelected ? "#DE1A1A" : "#111827",
            fontFamily: "var(--font-jakarta)", margin: 0,
            overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", maxWidth: 128 }}>
            {c.company_name || c.customer_name}
          </p>
          <span style={{ width: 7, height: 7, borderRadius: "50%", flexShrink: 0,
            background: live ? "#22C55E" : "#D1D5DB",
            boxShadow: live ? "0 0 5px rgba(34,197,94,0.5)" : "none" }} />
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 5 }}>
          <span style={{ fontSize: 9, fontWeight: 700, padding: "2px 6px", borderRadius: 5,
            background: isSelected ? "rgba(222,26,26,0.12)" : p.bg,
            color: isSelected ? "#B91C1C" : p.text }}>
            {c.industry || "General"}
          </span>
          {rev > 0 && (
            <span style={{ fontSize: 9, color: isSelected ? "#B91C1C" : "#9CA3AF", fontWeight: 600 }}>
              {fmtAmt(rev)}
            </span>
          )}
        </div>
        {/* Mini progress bar */}
        <div style={{ height: 2, borderRadius: 2, background: "#F0F1F5", marginTop: 5, overflow: "hidden" }}>
          <div style={{ height: "100%", borderRadius: 2, width: `${hp}%`,
            background: isSelected ? "#DE1A1A" : hl.color, transition: "width 0.5s ease" }} />
        </div>
      </div>
    </button>
  )
}

// ── Activity feed helper ───────────────────────────────────────────────────────
interface Act { av: string; avBg: string; avCol: string; title: string; detail: string; time: string; dot: string }
function buildActs(c: SheetClient): Act[] {
  const items: Act[] = [
    { av: "SK", avBg: "#FEE2E2", avCol: "#DE1A1A", title: "Updated campaign",      detail: "Summer Offer Campaign",      time: "2m ago",            dot: "#22C55E" },
    { av: "SK", avBg: "#FEE2E2", avCol: "#DE1A1A", title: "New payment received",  detail: c.received || "₹15,000",     time: "30m ago",           dot: "#22C55E" },
    { av: "MM", avBg: "#EDE9FE", avCol: "#7C3AED", title: "Uploaded a file",       detail: "Menu Design Final.pdf",      time: "1h ago",            dot: "#7C3AED" },
    { av: "VR", avBg: "#FFF3E0", avCol: "#F97316", title: "Campaign approved",     detail: "New Menu Launch",            time: "2h ago",            dot: "#22C55E" },
    { av: "AD", avBg: "#F0FDF4", avCol: "#16A34A", title: "Meeting scheduled",     detail: "Strategy Call with client",  time: "Tomorrow, 11 AM",   dot: "#3B82F6" },
    { av: "VR", avBg: "#FFF3E0", avCol: "#F97316", title: "Commented on",          detail: "Promo Video",               time: "3h ago",            dot: "#F97316" },
    { av: "MM", avBg: "#EDE9FE", avCol: "#7C3AED", title: "Invoice sent",          detail: `#INV-2026-${c.sno || "001"}`, time: "5h ago",          dot: "#F59E0B" },
    { av: "SK", avBg: "#FEE2E2", avCol: "#DE1A1A", title: "Uploaded a file",       detail: "Banner Design V2.png",       time: "1d ago",            dot: "#9CA3AF" },
  ]
  if (c.payment_status) {
    items.splice(1, 0, { av: "SK", avBg: "#F0FDF4", avCol: "#16A34A", title: "Payment status", detail: c.payment_status, time: "Today", dot: "#16A34A" })
  }
  return items.slice(0, 8)
}

// ── Overview Tab ──────────────────────────────────────────────────────────────
function OverviewTab({ c }: { c: SheetClient }) {
  const received = parseAmt(c.received) || 180000
  const pending  = parseAmt(c.pending)
  const total    = received + pending
  const pct      = total > 0 ? Math.round((received / total) * 100) : 68

  const timeline = [
    { date: `19 May, 2026`, label: "Strategy Call",   detail: "Discussed Q2 campaign strategy", color: "#3B82F6" },
    { date: `02 May, 2026`, label: "Content Review",  detail: "Reviewed content drafts",         color: "#8B5CF6" },
    { date: c.onboarded_month || "Jan 2025", label: "Onboarding Call", detail: "Initial discovery & requirements", color: "#F97316" },
  ]
  const deliverables = [
    { name: "Brand Strategy Document", done: true,  pct: 100, color: "#22C55E" },
    { name: "Social Media Creatives (10)", done: false, pct: 80, color: "#3B82F6" },
    { name: "Promo Video (30 sec)",    done: false, pct: 60,  color: "#F59E0B" },
    { name: "Menu Design",             done: false, pct: 40,  color: "#A855F7" },
  ]
  const campaigns = [
    { name: "Summer Offer Campaign", type: "Social Media",   status: "In Progress", sc: "#F59E0B", sb: "rgba(245,158,11,0.1)",  pct: 75,  budget: "₹25,000", due: "10 Jun 2026", mgr: "Sanjay K" },
    { name: "New Menu Launch",       type: "Video Campaign", status: "Review",      sc: "#8B5CF6", sb: "rgba(139,92,246,0.1)",  pct: 60,  budget: "₹18,000", due: "25 May 2026", mgr: "Manju M"  },
    { name: "Brand Awareness Ads",   type: "Paid Ads",       status: "Completed",   sc: "#22C55E", sb: "rgba(34,197,94,0.1)",   pct: 100, budget: "₹20,000", due: "01 Apr 2026", mgr: "Vignesh R"},
  ]

  const card: React.CSSProperties = {
    background: "#FFFFFF", borderRadius: 20, border: "1px solid #F0F1F5",
    padding: "18px 20px", boxShadow: "0 2px 12px rgba(0,0,0,0.05)",
  }

  return (
    <div style={{ padding: "20px 24px 40px", display: "flex", flexDirection: "column", gap: 18 }}>

      {/* Row 1 — Revenue | Campaign Progress | Content Pipeline */}
      <div style={{ display: "grid", gridTemplateColumns: "1.1fr 1fr 1fr", gap: 16 }}>

        {/* Revenue */}
        <div style={card}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 12 }}>
            <p style={{ fontSize: 10, fontWeight: 700, color: "#9CA3AF", margin: 0, textTransform: "uppercase", letterSpacing: "0.1em" }}>Total Revenue</p>
            <MoreHorizontal size={14} style={{ color: "#D1D5DB" }} />
          </div>
          <p style={{ fontSize: 30, fontWeight: 900, color: "#111827", margin: "0 0 3px", fontFamily: "var(--font-jakarta)" }}>
            ₹{received.toLocaleString("en-IN")}
          </p>
          <p style={{ fontSize: 11, color: "#22C55E", margin: "0 0 12px", display: "flex", alignItems: "center", gap: 4, fontWeight: 600 }}>
            <TrendingUp size={11} /> +24.5% vs last 30 days
          </p>
          <Sparkline color="#22C55E" />
        </div>

        {/* Campaign Progress */}
        <div style={card}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 8 }}>
            <p style={{ fontSize: 10, fontWeight: 700, color: "#9CA3AF", margin: 0, textTransform: "uppercase", letterSpacing: "0.1em" }}>Campaign Progress</p>
            <MoreHorizontal size={14} style={{ color: "#D1D5DB" }} />
          </div>
          <div style={{ display: "flex", justifyContent: "center", margin: "2px 0 8px" }}>
            <DonutChart pct={pct} color="#DE1A1A" />
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 5 }}>
            {[{ label: "Completed", n: 12, color: "#22C55E" }, { label: "In Progress", n: 5, color: "#F59E0B" }, { label: "Pending", n: 3, color: "#9CA3AF" }].map(r => (
              <div key={r.label} style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                <span style={{ display: "flex", alignItems: "center", gap: 5, fontSize: 10, color: "#6B7280" }}>
                  <span style={{ width: 6, height: 6, borderRadius: "50%", background: r.color, display: "inline-block" }} />
                  {r.label}
                </span>
                <span style={{ fontSize: 10, fontWeight: 700, color: "#374151" }}>{r.n}</span>
              </div>
            ))}
          </div>
        </div>

        {/* Content Pipeline */}
        <div style={card}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 14 }}>
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
                <div style={{ display: "flex", alignItems: "center", gap: 3, marginBottom: 8 }}>
                  <span style={{ width: 7, height: 7, borderRadius: 2, background: col.color, flexShrink: 0 }} />
                  <span style={{ fontSize: 8, fontWeight: 700, color: col.color, textTransform: "uppercase", letterSpacing: "0.05em" }}>{col.label}</span>
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
                  <div style={{ fontSize: 9, color: "#9CA3AF", fontWeight: 600 }}>+ {col.count - col.items.length} more</div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Row 2 — Timeline | Deliverables */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>

        {/* Meeting Timeline */}
        <div style={card}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 16 }}>
            <p style={{ fontSize: 10, fontWeight: 700, color: "#9CA3AF", margin: 0, textTransform: "uppercase", letterSpacing: "0.1em" }}>Meeting Timeline</p>
            <MoreHorizontal size={14} style={{ color: "#D1D5DB" }} />
          </div>
          <div style={{ display: "flex", flexDirection: "column" }}>
            {timeline.map((item, i) => (
              <div key={i} style={{ display: "flex", gap: 12, paddingBottom: i < timeline.length - 1 ? 16 : 0 }}>
                <div style={{ display: "flex", flexDirection: "column", alignItems: "center" }}>
                  <div style={{ width: 10, height: 10, borderRadius: "50%", background: item.color, flexShrink: 0, marginTop: 3 }} />
                  {i < timeline.length - 1 && <div style={{ width: 2, flex: 1, background: "#F0F1F5", marginTop: 4 }} />}
                </div>
                <div>
                  <p style={{ fontSize: 10, color: "#9CA3AF", margin: "0 0 2px" }}>{item.date}</p>
                  <p style={{ fontSize: 12, fontWeight: 700, color: "#111827", margin: "0 0 2px" }}>{item.label}</p>
                  <p style={{ fontSize: 10, color: "#6B7280", margin: 0 }}>{item.detail}</p>
                </div>
              </div>
            ))}
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
      </div>

      {/* Row 3 — Campaigns table */}
      <div style={card}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 16 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <p style={{ fontSize: 14, fontWeight: 800, color: "#111827", margin: 0, fontFamily: "var(--font-jakarta)" }}>All Campaigns</p>
            <span style={{ fontSize: 10, fontWeight: 700, background: "rgba(222,26,26,0.09)", color: "#DE1A1A", padding: "2px 8px", borderRadius: 6 }}>12</span>
          </div>
          <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
            <div style={{ position: "relative" }}>
              <Search size={11} style={{ position: "absolute", left: 8, top: "50%", transform: "translateY(-50%)", color: "#9CA3AF" }} />
              <input placeholder="Search campaigns…"
                style={{ paddingLeft: 24, paddingRight: 10, paddingTop: 5, paddingBottom: 5,
                  fontSize: 10, borderRadius: 8, border: "1px solid #F0F1F5",
                  background: "#F9FAFB", color: "#374151", outline: "none" }} />
            </div>
            {["All Status", "All Types", "Sort: Newest"].map(f => (
              <div key={f} style={{ position: "relative" }}>
                <select style={{ fontSize: 10, background: "#F9FAFB", border: "1px solid #F0F1F5",
                  borderRadius: 8, padding: "5px 20px 5px 8px", color: "#6B7280",
                  appearance: "none", cursor: "pointer" }}>
                  <option>{f}</option>
                </select>
                <ChevronDown size={9} style={{ position: "absolute", right: 5, top: "50%", transform: "translateY(-50%)", color: "#9CA3AF", pointerEvents: "none" }} />
              </div>
            ))}
          </div>
        </div>
        {/* Header row */}
        <div style={{ display: "grid", gridTemplateColumns: "2fr 1.2fr 1fr 1fr 1fr 1fr 1fr", gap: 8,
          padding: "7px 12px", background: "#F9FAFB", borderRadius: 10, marginBottom: 6 }}>
          {["Campaign Name", "Type", "Status", "Progress", "Budget", "Due Date", "Manager"].map(h => (
            <span key={h} style={{ fontSize: 9, fontWeight: 700, color: "#9CA3AF", textTransform: "uppercase", letterSpacing: "0.07em" }}>{h}</span>
          ))}
        </div>
        {campaigns.map((row, i) => (
          <div key={i}
            style={{ display: "grid", gridTemplateColumns: "2fr 1.2fr 1fr 1fr 1fr 1fr 1fr", gap: 8,
              padding: "10px 12px", borderRadius: 10, alignItems: "center", transition: "background 0.15s" }}
            onMouseEnter={e => (e.currentTarget.style.background = "#F9FAFB")}
            onMouseLeave={e => (e.currentTarget.style.background = "transparent")}>
            <div style={{ display: "flex", alignItems: "center", gap: 7 }}>
              <span style={{ width: 6, height: 6, borderRadius: "50%", background: row.sc, flexShrink: 0 }} />
              <span style={{ fontSize: 12, fontWeight: 700, color: "#111827" }}>{row.name}</span>
            </div>
            <span style={{ fontSize: 11, color: "#6B7280" }}>{row.type}</span>
            <span style={{ fontSize: 10, fontWeight: 700, color: row.sc, background: row.sb,
              padding: "3px 8px", borderRadius: 6, width: "fit-content" }}>{row.status}</span>
            <div>
              <div style={{ height: 4, borderRadius: 2, background: "#F3F4F6", overflow: "hidden", marginBottom: 2 }}>
                <div style={{ height: "100%", borderRadius: 2, width: `${row.pct}%`, background: row.sc }} />
              </div>
              <span style={{ fontSize: 9, color: "#9CA3AF" }}>{row.pct}%</span>
            </div>
            <span style={{ fontSize: 11, fontWeight: 600, color: "#374151" }}>{row.budget}</span>
            <span style={{ fontSize: 11, color: "#6B7280" }}>{row.due}</span>
            <div style={{ display: "flex", alignItems: "center", gap: 5 }}>
              <div style={{ width: 20, height: 20, borderRadius: 6, background: "#FEE2E2",
                display: "flex", alignItems: "center", justifyContent: "center",
                fontSize: 8, fontWeight: 900, color: "#DE1A1A" }}>
                {initials(row.mgr)}
              </div>
              <span style={{ fontSize: 11, color: "#374151", fontWeight: 600 }}>{row.mgr}</span>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}

// ═══════════════════════════════════════════════════════════════════════════════
export default function ClientsSheetView({
  activeClients, pastClients,
}: { activeClients: SheetClient[]; pastClients: SheetClient[] }) {
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

  const TABS = ["Overview", "Campaigns", "Payments", "Meetings", "Deliverables", "Notes", "Files"]

  const sel = selected
  const selPal  = sel ? pal(sel.industry) : DEFAULT_PAL
  const selHp   = sel ? healthScore(sel)  : 75
  const selHl   = healthCfg(selHp)
  const activity = sel ? buildActs(sel)   : []

  return (
    <div style={{ display: "flex", height: "100vh", overflow: "hidden", background: "#F8F9FB" }}>

      {/* ══ LEFT PANEL ═══════════════════════════════════════════════════════ */}
      <div style={{ width: 282, flexShrink: 0, background: "#FFFFFF",
        borderRight: "1px solid #EEEEF2", display: "flex", flexDirection: "column",
        overflow: "hidden", boxShadow: "2px 0 12px rgba(0,0,0,0.04)" }}>

        {/* Panel header */}
        <div style={{ padding: "20px 16px 14px", borderBottom: "1px solid #F0F1F5" }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 12 }}>
            <div>
              <h1 style={{ fontSize: 18, fontWeight: 900, color: "#111827",
                fontFamily: "var(--font-jakarta)", margin: "0 0 1px" }}>Clients</h1>
              <p style={{ fontSize: 10, color: "#9CA3AF", margin: 0 }}>
                {activeClients.length + pastClients.length} Total
              </p>
            </div>
            <div style={{ display: "flex", gap: 6 }}>
              <button style={{ width: 30, height: 30, borderRadius: 9, background: "#F3F4F6",
                border: "none", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center" }}>
                <Sparkles size={13} style={{ color: "#6B7280" }} />
              </button>
              <button style={{ width: 30, height: 30, borderRadius: 9, background: "#DE1A1A",
                border: "none", cursor: "pointer", display: "flex", alignItems: "center",
                justifyContent: "center", boxShadow: "0 3px 10px rgba(222,26,26,0.35)" }}>
                <Plus size={14} style={{ color: "#FFF" }} />
              </button>
            </div>
          </div>
          {/* Search */}
          <div style={{ position: "relative" }}>
            <Search size={12} style={{ position: "absolute", left: 10, top: "50%",
              transform: "translateY(-50%)", color: "#9CA3AF" }} />
            <input value={search} onChange={e => setSearch(e.target.value)}
              placeholder="Search clients…"
              style={{ width: "100%", boxSizing: "border-box", paddingLeft: 30, paddingRight: 12,
                paddingTop: 8, paddingBottom: 8, borderRadius: 10, border: "1.5px solid #F0F1F5",
                fontSize: 11, color: "#111827", background: "#F9FAFB", outline: "none" }} />
          </div>
        </div>

        {/* Active / Past tabs */}
        <div style={{ display: "flex", padding: "10px 12px 8px", gap: 4, borderBottom: "1px solid #F0F1F5" }}>
          {(["active", "past"] as const).map(t => (
            <button key={t} onClick={() => { setListTab(t); setSearch("") }}
              style={{ flex: 1, padding: "7px 0", borderRadius: 8, fontSize: 11, fontWeight: 700,
                border: "none", cursor: "pointer", transition: "all 0.15s",
                background: listTab === t ? "#DE1A1A" : "#F3F4F6",
                color: listTab === t ? "#FFFFFF" : "#6B7280",
                boxShadow: listTab === t ? "0 2px 8px rgba(222,26,26,0.3)" : "none" }}>
              {t === "active" ? `Active · ${activeClients.length}` : `Past · ${pastClients.length}`}
            </button>
          ))}
        </div>

        {/* Client list */}
        <div style={{ flex: 1, overflowY: "auto", padding: "10px 12px",
          display: "flex", flexDirection: "column", gap: 6 }}>
          {filtered.length === 0
            ? <p style={{ fontSize: 12, color: "#9CA3AF", textAlign: "center", paddingTop: 40 }}>No clients found</p>
            : filtered.map((c, i) => (
              <ClientPill key={i} c={c}
                isSelected={!!sel && sel.company_name === c.company_name && sel.customer_name === c.customer_name}
                onClick={() => { setSelected(c); setContentTab("overview") }} />
            ))
          }
        </div>

        {/* Footer */}
        <div style={{ padding: "12px 16px", borderTop: "1px solid #F0F1F5" }}>
          <button style={{ width: "100%", padding: "10px 0", borderRadius: 12,
            border: "1.5px dashed #E5E7EB", background: "transparent", cursor: "pointer",
            fontSize: 11, fontWeight: 700, color: "#9CA3AF",
            display: "flex", alignItems: "center", justifyContent: "center", gap: 6 }}>
            <Plus size={12} /> Add New Client
          </button>
        </div>
      </div>

      {/* ══ CENTER PANEL ═════════════════════════════════════════════════════ */}
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
            {/* Gradient overlays */}
            <div style={{ position: "absolute", inset: 0,
              background: "linear-gradient(to right, rgba(0,0,0,0.55) 0%, rgba(0,0,0,0.1) 55%, transparent 100%)" }} />
            <div style={{ position: "absolute", inset: 0,
              background: "linear-gradient(to bottom, transparent 30%, rgba(248,249,251,1) 100%)" }} />

            {/* Client identity */}
            <div style={{ position: "absolute", bottom: 20, left: 24 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 10 }}>
                <div style={{ width: 48, height: 48, borderRadius: 16, background: "#DE1A1A",
                  display: "flex", alignItems: "center", justifyContent: "center",
                  fontSize: 17, fontWeight: 900, color: "#FFF", fontFamily: "var(--font-jakarta)",
                  border: "2.5px solid rgba(255,255,255,0.35)", boxShadow: "0 4px 16px rgba(222,26,26,0.4)" }}>
                  {initials(sel.company_name || sel.customer_name)}
                </div>
                <div>
                  <h2 style={{ fontSize: 22, fontWeight: 900, color: "#FFFFFF", margin: "0 0 5px",
                    fontFamily: "var(--font-jakarta)", textShadow: "0 2px 10px rgba(0,0,0,0.3)" }}>
                    {sel.company_name || sel.customer_name}
                  </h2>
                  <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                    <span style={{ fontSize: 10, fontWeight: 700, background: "rgba(22,163,74,0.85)",
                      color: "#FFF", padding: "3px 9px", borderRadius: 6, backdropFilter: "blur(8px)" }}>
                      {sel.client_status || "Active"}
                    </span>
                    <span style={{ fontSize: 11, color: "rgba(255,255,255,0.75)" }}>{sel.industry}</span>
                  </div>
                </div>
              </div>
              <div style={{ display: "flex", gap: 16, flexWrap: "wrap" }}>
                {[
                  { icon: "📍", text: sel.place || "Tamil Nadu" },
                  { icon: "📅", text: `Joined ${sel.onboarded_month || "Jan 2025"}` },
                  { icon: "⏱", text: `Client Since ${sel.period || "10 Months"}` },
                ].map((item, i) => (
                  <span key={i} style={{ fontSize: 11, color: "rgba(255,255,255,0.85)",
                    display: "flex", alignItems: "center", gap: 4 }}>
                    {item.icon} {item.text}
                  </span>
                ))}
              </div>
            </div>

            {/* Relationship Health card (floating top-right) */}
            <div style={{ position: "absolute", top: 16, right: 16,
              background: "rgba(255,255,255,0.94)", backdropFilter: "blur(16px)",
              borderRadius: 18, padding: "14px 16px", border: "1px solid rgba(255,255,255,0.7)",
              boxShadow: "0 8px 32px rgba(0,0,0,0.12), 0 0 0 1px rgba(0,0,0,0.04)",
              minWidth: 190 }}>
              <p style={{ fontSize: 9, fontWeight: 700, color: "#9CA3AF", margin: "0 0 10px",
                textTransform: "uppercase", letterSpacing: "0.1em" }}>Relationship Health</p>
              <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 10 }}>
                <MiniDonut pct={selHp} color={selHl.color} />
                <div>
                  <p style={{ fontSize: 20, fontWeight: 900, color: "#111827", margin: "0 0 2px",
                    fontFamily: "var(--font-jakarta)" }}>{selHp}%</p>
                  <p style={{ fontSize: 11, fontWeight: 700, color: selHl.color, margin: 0 }}>{selHl.label}</p>
                </div>
              </div>
              <div style={{ display: "flex", flexDirection: "column", gap: 3 }}>
                <p style={{ fontSize: 10, color: "#6B7280", margin: 0 }}>❤️ Strong partnership</p>
                <p style={{ fontSize: 10, color: "#6B7280", margin: 0 }}>📈 Long term potential</p>
              </div>
            </div>
          </div>

          {/* Info cards row */}
          <div style={{ display: "grid", gridTemplateColumns: "repeat(4,1fr)", gap: 12, padding: "16px 24px 0" }}>
            {[
              { label: "Monthly Package", value: sel.current_month || "₹15,000", sub: sel.package_name || "Standard", emoji: "💜", bg: "rgba(139,92,246,0.07)", border: "rgba(139,92,246,0.2)" },
              { label: "Assigned Manager", value: "Sanjay K", sub: "Project Manager", emoji: "👤", bg: "rgba(59,130,246,0.07)", border: "rgba(59,130,246,0.2)" },
              { label: "Industry", value: sel.industry || "—", sub: sel.service || "Digital Marketing", emoji: "🏢", bg: selPal.bg, border: selPal.border },
              { label: "Campaign Health", value: selHl.label, sub: sel.payment_status || "On Track", emoji: "⚡", bg: selHl.bg, border: "transparent" },
            ].map((card, i) => (
              <div key={i} style={{ background: "#FFFFFF", borderRadius: 16, border: "1px solid #F0F1F5",
                padding: "13px 14px", boxShadow: "0 2px 8px rgba(0,0,0,0.04)",
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
                    fontFamily: "var(--font-jakarta)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{card.value}</p>
                  <p style={{ fontSize: 10, color: "#9CA3AF", margin: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{card.sub}</p>
                </div>
                <MoreHorizontal size={13} style={{ color: "#E5E7EB", flexShrink: 0 }} />
              </div>
            ))}
          </div>

          {/* Content tabs */}
          <div style={{ display: "flex", gap: 4, padding: "16px 24px 0", overflowX: "auto" }}>
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

          {/* Tab content */}
          {contentTab === "overview" && <OverviewTab c={sel} />}
          {contentTab !== "overview" && (
            <div style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center", padding: "60px 24px" }}>
              <div style={{ textAlign: "center" }}>
                <div style={{ fontSize: 32, marginBottom: 12 }}>🚧</div>
                <p style={{ fontSize: 14, fontWeight: 700, color: "#9CA3AF", margin: 0 }}>
                  {contentTab.charAt(0).toUpperCase() + contentTab.slice(1)} section coming soon
                </p>
              </div>
            </div>
          )}
        </>)}
      </div>

      {/* ══ RIGHT PANEL ══════════════════════════════════════════════════════ */}
      <div style={{ width: 258, flexShrink: 0, background: "#FFFFFF",
        borderLeft: "1px solid #EEEEF2", overflowY: "auto",
        display: "flex", flexDirection: "column",
        boxShadow: "-2px 0 12px rgba(0,0,0,0.04)" }}>

        {/* Header */}
        <div style={{ padding: "20px 16px 14px", borderBottom: "1px solid #F0F1F5",
          display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <p style={{ fontSize: 14, fontWeight: 800, color: "#111827", margin: 0,
            fontFamily: "var(--font-jakarta)" }}>Activity Feed</p>
          <button style={{ fontSize: 11, fontWeight: 700, color: "#DE1A1A",
            background: "none", border: "none", cursor: "pointer" }}>View all</button>
        </div>

        {/* Activity list */}
        <div style={{ flex: 1, padding: "14px 16px", display: "flex", flexDirection: "column", gap: 14 }}>
          {activity.map((item, i) => (
            <div key={i} style={{ display: "flex", gap: 10, alignItems: "flex-start" }}>
              <div style={{ width: 30, height: 30, borderRadius: 10, background: item.avBg,
                display: "flex", alignItems: "center", justifyContent: "center",
                fontSize: 9, fontWeight: 900, color: item.avCol, flexShrink: 0 }}>
                {item.av}
              </div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ display: "flex", alignItems: "center", gap: 4, marginBottom: 1 }}>
                  <p style={{ fontSize: 11, fontWeight: 700, color: "#111827", margin: 0,
                    overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", flex: 1 }}>
                    {item.title}
                  </p>
                  <span style={{ width: 6, height: 6, borderRadius: "50%",
                    background: item.dot, flexShrink: 0 }} />
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

        {/* Footer CTA */}
        <div style={{ padding: "12px 16px", borderTop: "1px solid #F0F1F5" }}>
          <button style={{ width: "100%", padding: "10px 0", borderRadius: 12,
            border: "1.5px solid rgba(222,26,26,0.25)", background: "rgba(222,26,26,0.04)",
            cursor: "pointer", fontSize: 11, fontWeight: 700, color: "#DE1A1A", transition: "all 0.15s" }}>
            View All Activity
          </button>
        </div>
      </div>
    </div>
  )
}
