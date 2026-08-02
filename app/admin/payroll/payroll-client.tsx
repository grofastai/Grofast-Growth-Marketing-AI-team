"use client"

import { useState, useTransition } from "react"
import Image from "next/image"
import { useRouter, usePathname } from "next/navigation"
import { ChevronDown, ChevronUp, FileText, BarChart3, CheckCircle2, Clock, Zap } from "lucide-react"
import {
  markEmployeePaid,
  markEmployeeUnpaid,
  runPayroll,
  saveBonusAdvance,
} from "@/lib/actions/payroll"
import { savePayrollSettings } from "@/lib/actions/payroll-settings"
import type { PayrollSettings } from "@/lib/payroll-settings-defaults"
import { useToast } from "@/components/ui/useToast"
import { PageHero } from "@/components/admin/PageHero"
import type { TeamRow } from "@/lib/actions/teams"
import { hexToRgba } from "@/lib/utils/team-colors"
import { inWords } from "@/lib/utils/in-words"

type PayrollRow = {
  id: string; name: string; employee_id: string; team: string | null
  passport_photo_url: string | null; created_at: string | null
  bank_name: string | null; bank_account: string | null; bank_ifsc: string | null
  employment_type: string
  presentDays: number; halfDays: number; absentDays: number; leaveDays: number
  missingUpdates: number; missingUpdateDates: string[]; deductibleDays: number
  totalHours: number; otHours: number; collabHours: number
  basic: number; hra: number; travelAllowance: number; medicalAllowance: number; otherAllowance: number
  basePay: number; deduction: number; otPay: number; netPay: number
  bonus: number; advance: number; incentive: number; finalNetPay: number
  isPaid: boolean; paidAt: string | null
  monthly_salary: number | null; hourly_rate: number | null
  effectiveWorkDays: number
  // Hours-based formula preview — 212.5 target hours minus permission/half-day/leave
  // hours = required hours, compared against hours actually logged. Separate from the
  // day-based numbers above; not used for Mark Paid / finalNetPay.
  hoursPreview: {
    targetHours: number; permissionHours: number; halfDayHours: number; leaveHours: number
    requiredHours: number; actualHours: number; shortfallHours: number
    deduction: number; netPay: number | null
  }
}

function fmt(n: number) {
  return `₹${n.toLocaleString("en-IN", { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`
}
function fmtK(n: number) {
  if (n >= 100000) return `₹${(n / 100000).toFixed(2)}L`
  if (n >= 1000) return `₹${(n / 1000).toFixed(0)}K`
  return `₹${n}`
}
function getInitials(name: string) {
  return (name || "").split(" ").map((n) => n[0]).join("").slice(0, 2).toUpperCase()
}
// ── Salary Health Donut ─────────────────────────────────────────────────────
function SalaryHealthDonut({ pct }: { pct: number }) {
  const r = 54, cx = 72, cy = 72
  const circ = 2 * Math.PI * r
  const filled = (pct / 100) * circ
  return (
    <svg width={144} height={144} viewBox="0 0 144 144" style={{ display: "block", margin: "0 auto" }}>
      <defs>
        <linearGradient id="shGrad" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stopColor="#16A34A" />
          <stop offset="100%" stopColor="#4ADE80" />
        </linearGradient>
      </defs>
      <circle cx={cx} cy={cy} r={r} fill="none" stroke="#F0FDF4" strokeWidth={15} />
      <circle cx={cx} cy={cy} r={r} fill="none" stroke="url(#shGrad)" strokeWidth={15}
        strokeDasharray={`${filled} ${circ - filled}`} strokeLinecap="round"
        transform={`rotate(-90 ${cx} ${cy})`}
        style={{ filter: "drop-shadow(0 2px 10px rgba(22,163,74,0.4))" }} />
      <circle cx={72} cy={18} r={4} fill="#E5E7EB" />
      <circle cx={126} cy={72} r={4} fill="#E5E7EB" />
      <circle cx={72} cy={126} r={4} fill="#E5E7EB" />
      <circle cx={18} cy={72} r={4} fill="#E5E7EB" />
      <text x={cx} y={cy - 10} textAnchor="middle" fontSize={26} fontWeight={900} fill="#111">{pct}%</text>
      <text x={cx} y={cy + 10} textAnchor="middle" fontSize={10} fill="#1E3A5F">Salary</text>
      <text x={cx} y={cy + 23} textAnchor="middle" fontSize={10} fill="#1E3A5F">Processed</text>
    </svg>
  )
}

// ── Mini Sparkline ──────────────────────────────────────────────────────────
const SPARK = [
  "M0,18 C10,14 22,8 36,11 S58,5 74,7 S92,3 100,4",
  "M0,16 C12,18 24,11 38,14 S60,8 76,10 S94,6 100,7",
  "M0,20 C10,16 22,14 36,17 S58,13 74,15 S92,12 100,13",
  "M0,14 C12,12 24,16 38,13 S60,9 76,11 S94,7 100,9",
]
function MiniSparkline({ color, idx }: { color: string; idx: number }) {
  const d = SPARK[idx % SPARK.length]
  return (
    <svg viewBox="0 0 100 22" width="100%" height={28} style={{ display: "block" }}>
      <defs>
        <linearGradient id={`sp${idx}`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={color} stopOpacity={0.22} />
          <stop offset="100%" stopColor={color} stopOpacity={0} />
        </linearGradient>
      </defs>
      <path d={`${d} L100,22 L0,22 Z`} fill={`url(#sp${idx})`} />
      <path d={d} fill="none" stroke={color} strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}

// ── Team badge colours ──────────────────────────────────────────────────────
const TEAM_CLR: Record<string, { bg: string; color: string }> = {
  "Media Production Team":             { bg: "#FFF1F2", color: "#EC4899" },
  "Creative Studio":                   { bg: "#FFFBEB", color: "#F59E0B" },
  "Software Development & Automation":  { bg: "#EEF2FF", color: "#6366F1" },
  "Performance Marketing & Operations":{ bg: "#F0FDF4", color: "#10B981" },
  "AI Development & Creative Production": { bg: "#F5F3FF", color: "#8B5CF6" },
  "Freelance Media Production":        { bg: "#FFF1F2", color: "#EC4899" },
  "Freelance Video Editing":           { bg: "#EEF2FF", color: "#6366F1" },
  "Freelance Videography":             { bg: "#FFF1F2", color: "#EF4444" },
  "Freelance RJ Voiceover":            { bg: "#F5F3FF", color: "#A855F7" },
  "Freelance Graphics Designer":       { bg: "#FFF7ED", color: "#F97316" },
  "Freelance Content Writer":          { bg: "#F0FDFA", color: "#14B8A6" },
  "Freelance Software Development & Automation": { bg: "#EEF2FF", color: "#6366F1" },
  "Freelance Marketing & Operations":  { bg: "#F0FDF4", color: "#10B981" },
  "Freelance AI Development & Creative Production": { bg: "#F5F3FF", color: "#8B5CF6" },
  "Media Team":                        { bg: "#FFF1F2", color: "#EC4899" },
  "Media & Technology Team":           { bg: "#F5F3FF", color: "#8B5CF6" },
  "Technology & Operation Team":       { bg: "#F0FDF4", color: "#10B981" },
  "Creative Team":                     { bg: "#FFFBEB", color: "#F59E0B" },
}
const DEF_TEAM = { bg: "#F3F4F6", color: "#6B7280" }

// DB-first: a renamed or brand-new team gets its real color instead of falling
// straight to grey. Falls back to the hardcoded map for legacy data with no
// matching teams row.
function resolveTeamClr(team: string | null, teams: TeamRow[]): { bg: string; color: string } {
  const row = teams.find(t => t.name === team)
  if (row?.color) return { bg: hexToRgba(row.color, 0.1), color: row.color }
  return TEAM_CLR[team ?? ""] ?? DEF_TEAM
}

// ── Payslip-style Report card ───────────────────────────────────────────────
// Ported verbatim (CSS + markup) from the payslip design that shipped before
// the 2026-07-31 "minimal Infosys-style" redesign — the user wants the
// Reports feature to keep looking exactly like that older design. Driven
// entirely by PayrollRow (already computed, on screen) instead of the old
// route's own DB queries, so it can't drift from what Payroll displays.
function buildReportEmployeeCard(r: PayrollRow, opts: { year: number; mon: number; monthName: string; payDateStr: string; generatedTs: string }) {
  const { year, mon, monthName, payDateStr, generatedTs } = opts
  const payslipId = `GSPL/${year}/${String(mon).padStart(2, "0")}/${r.employee_id}`
  const initials = getInitials(r.name)
  const isRegular = r.employment_type === "regular" && !!r.monthly_salary

  const basic           = isRegular ? r.basic : r.basePay
  const hra              = isRegular ? r.hra : 0
  const travelAllowance  = isRegular ? r.travelAllowance : 0
  const medicalAllowance = isRegular ? r.medicalAllowance : 0
  const otherAllowance   = isRegular ? r.otherAllowance : 0

  const totalEarnings   = r.basePay + r.otPay + r.bonus + r.incentive
  const totalDeductions = r.deduction + r.advance
  const presentDaysShow = r.presentDays + r.halfDays * 0.5
  const workDaysForRow  = r.effectiveWorkDays

  const joiningDateFmt = r.created_at
    ? new Date(r.created_at).toLocaleDateString("en-IN", { day: "numeric", month: "long", year: "numeric" })
    : "—"

  const ic = (color: string) => ({
    person:   `<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="${color}" stroke-width="2.2" stroke-linecap="round"><circle cx="12" cy="8" r="4"/><path d="M4 20c0-4 3.6-7 8-7s8 3 8 7"/></svg>`,
    building: `<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="${color}" stroke-width="2.2" stroke-linecap="round"><path d="M6 22V4a2 2 0 0 1 2-2h8a2 2 0 0 1 2 2v18M2 22h20M10 6h.01M14 6h.01M10 10h.01M14 10h.01M10 14h.01M14 14h.01"/></svg>`,
    calendar: `<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="${color}" stroke-width="2.2" stroke-linecap="round"><rect x="3" y="4" width="18" height="18" rx="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg>`,
    card:     `<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="${color}" stroke-width="2.2" stroke-linecap="round"><rect x="2" y="5" width="20" height="14" rx="2"/><line x1="2" y1="10" x2="22" y2="10"/></svg>`,
    bank:     `<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="${color}" stroke-width="2.2" stroke-linecap="round"><line x1="3" y1="22" x2="21" y2="22"/><path d="M12 2L3 8h18L12 2z"/><line x1="5" y1="8" x2="5" y2="22"/><line x1="10" y1="8" x2="10" y2="22"/><line x1="14" y1="8" x2="14" y2="22"/><line x1="19" y1="8" x2="19" y2="22"/></svg>`,
    hash:     `<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="${color}" stroke-width="2.2" stroke-linecap="round"><line x1="4" y1="9" x2="20" y2="9"/><line x1="4" y1="15" x2="20" y2="15"/><line x1="10" y1="3" x2="8" y2="21"/><line x1="16" y1="3" x2="14" y2="21"/></svg>`,
    phone:    `<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="${color}" stroke-width="2" stroke-linecap="round"><path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07A19.5 19.5 0 0 1 4.69 12a19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 3.6 1.2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L7.91 8.9a16 16 0 0 0 6.09 6.09l.91-.91a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 21.73 16.92z"/></svg>`,
    mail:     `<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="${color}" stroke-width="2" stroke-linecap="round"><rect x="2" y="4" width="20" height="16" rx="2"/><polyline points="22,4 12,13 2,4"/></svg>`,
    globe:    `<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="${color}" stroke-width="2" stroke-linecap="round"><circle cx="12" cy="12" r="10"/><line x1="2" y1="12" x2="22" y2="12"/><path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"/></svg>`,
  })
  const R = ic("#DC2626")

  const pieColors = ["#22C55E", "#F43F5E", "#3B82F6", "#F97316", "#A855F7"]
  const pieItems = [
    { label: "Basic Salary",      val: basic },
    { label: "HRA",               val: hra },
    { label: "Travel Allowance",  val: travelAllowance },
    { label: "Medical Allowance", val: medicalAllowance },
    { label: "Other Allowance",   val: otherAllowance },
  ].filter(it => it.val > 0)
  const grossBase = basic + hra + travelAllowance + medicalAllowance + otherAllowance
  const pieR = 54, pieCx = 70, pieCy = 70, pieCirc = 2 * Math.PI * pieR
  let pieAcc = 0
  const donutSegs = grossBase > 0 ? pieItems.map((it, idx) => {
    const pct = it.val / grossBase
    const dash = pct * pieCirc
    const off = -(pieAcc * pieCirc)
    pieAcc += pct
    return `<circle cx="${pieCx}" cy="${pieCy}" r="${pieR}" fill="none" stroke="${pieColors[idx]}" stroke-width="20" stroke-dasharray="${dash.toFixed(1)} ${(pieCirc - dash).toFixed(1)}" stroke-dashoffset="${off.toFixed(1)}" style="transform:rotate(-90deg);transform-origin:${pieCx}px ${pieCy}px"/>`
  }).join("") : ""
  const donutSvg = `<svg viewBox="0 0 140 140" width="140" height="140"><circle cx="${pieCx}" cy="${pieCy}" r="${pieR}" fill="none" stroke="#F3F4F6" stroke-width="20"/>${donutSegs}<text x="${pieCx}" y="${pieCy - 6}" text-anchor="middle" font-size="10" font-weight="800" fill="#111" font-family="Inter,sans-serif">${fmt(grossBase)}</text><text x="${pieCx}" y="${pieCy + 8}" text-anchor="middle" font-size="8" fill="#9CA3AF" font-family="Inter,sans-serif">Gross Salary</text></svg>`

  const spDotRed    = `<svg viewBox="0 0 120 28" width="120" height="28"><path d="M0,22 Q10,20 20,18 T40,14 T60,12 T80,10 T100,8 T120,6" fill="none" stroke="#FCA5A5" stroke-width="1.5" stroke-dasharray="3 3" stroke-linecap="round"/></svg>`
  const spDotGreen  = `<svg viewBox="0 0 120 28" width="120" height="28"><path d="M0,22 Q10,20 20,18 T40,14 T60,10 T80,8 T100,6 T120,4" fill="none" stroke="#86EFAC" stroke-width="1.5" stroke-dasharray="3 3" stroke-linecap="round"/></svg>`
  const spDotOrange = `<svg viewBox="0 0 120 28" width="120" height="28"><path d="M0,14 Q10,13 20,14 T40,12 T60,11 T80,12 T100,10 T120,9" fill="none" stroke="#FED7AA" stroke-width="1.5" stroke-dasharray="3 3" stroke-linecap="round"/></svg>`

  const qrUrl = `https://api.qrserver.com/v1/create-qr-code/?size=90x90&data=${encodeURIComponent(payslipId)}&bgcolor=FFFFFF&color=111827`

  return `
  <div class="page">

    <!-- HEADER -->
    <div class="hdr">
      <div>
        <div style="display:flex;align-items:center;gap:12px;margin-bottom:10px">
          <div class="co-logo">GF</div>
          <div>
            <div class="co-name">GROFAST</div>
            <div class="co-sub">Group Of Companies</div>
          </div>
        </div>
        <div class="co-addr">
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#9CA3AF" stroke-width="2" stroke-linecap="round" style="margin-top:1px;flex-shrink:0"><path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"/><circle cx="12" cy="10" r="3"/></svg>
          <span>4-188D, Poomalai Nagar, Kaveripattinam,<br/>Chowttahalli, Tamil Nadu 635112</span>
        </div>
        <div class="contact-row">
          <span class="contact-item">${R.phone} 9159124541 | 6382905922</span>
          <span class="contact-item">${R.mail} grofastdigital@gmail.com</span>
          <span class="contact-item">${R.globe} www.grofastdigital.com</span>
        </div>
      </div>
      <div>
        <div class="slip-badge">
          <div class="slip-month">${monthName}</div>
          <div class="slip-title">PAYSLIP</div>
          <div class="slip-doc"><svg width="38" height="38" viewBox="0 0 24 24" fill="none" stroke="#fff" stroke-width="1.5"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/></svg></div>
        </div>
        <div class="slip-id-row"><span style="font-size:11px;color:#6B7280">Payslip ID: </span><span style="font-size:11px;font-weight:700;color:#374151">${payslipId}</span></div>
      </div>
    </div>

    <div class="hdivider"></div>

    <!-- EMPLOYEE CARD -->
    <div class="emp-card">
      <div class="emp-watermark">GF</div>
      <div class="emp-photo">
        ${r.passport_photo_url
          ? `<img src="${r.passport_photo_url}" alt="${r.name}"/>`
          : `<div class="emp-photo-init">${initials}</div>`}
      </div>
      <div class="emp-info">
        <div class="emp-left">
          <div class="emp-name">${r.name}</div>
          <div class="emp-badge">Team Member</div>
          <div class="emp-field"><div class="emp-lbl">${R.person} Employee ID</div><div class="emp-val">${r.employee_id}</div></div>
          <div class="emp-field"><div class="emp-lbl">${R.building} Department</div><div class="emp-val">${r.team ?? "—"}</div></div>
          <div class="emp-field"><div class="emp-lbl">${R.person} Designation</div><div class="emp-val">${r.team ? "Team Member" : "Employee"}</div></div>
        </div>
        <div class="emp-right">
          <div class="emp-field"><div class="emp-lbl">${R.calendar} Joining Date</div><div class="emp-val">${joiningDateFmt}</div></div>
          <div class="emp-field"><div class="emp-lbl">${R.bank} Bank Name</div><div class="emp-val">${r.bank_name ?? "—"}</div></div>
          <div class="emp-field"><div class="emp-lbl">${R.card} Account Number</div><div class="emp-val">${r.bank_account ? `XXXX XXXX ${r.bank_account.slice(-4)}` : "—"}</div></div>
          <div class="emp-field"><div class="emp-lbl">${R.hash} IFSC Code</div><div class="emp-val">${r.bank_ifsc ?? "—"}</div></div>
        </div>
      </div>
    </div>

    <!-- NET SALARY -->
    <div class="net-banner">
      <div class="net-left">
        <div class="net-label">Net Salary</div>
        <div class="net-amount">${fmt(r.finalNetPay)}</div>
        <div class="net-words">Rupees ${inWords(Math.round(r.finalNetPay))} Only</div>
      </div>
      <div class="net-divider"></div>
      <div class="net-right">
        <div class="net-cal-icon"><svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#16A34A" stroke-width="2" stroke-linecap="round"><rect x="3" y="4" width="18" height="18" rx="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg></div>
        <div class="net-paid-lbl">Salary Paid On</div>
        <div class="net-paid-date">${payDateStr}</div>
        <div class="net-method"><svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="20 6 9 17 4 12"/></svg> via Bank Transfer</div>
      </div>
    </div>

    <!-- KPI CARDS -->
    <div class="kpi-row">
      <div class="kpi-card">
        <div class="kpi-top"><div class="kpi-icon kpi-ico-red"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#DC2626" stroke-width="2" stroke-linecap="round"><path d="M21 12V7H5a2 2 0 0 1 0-4h14v4"/><path d="M3 5v14a2 2 0 0 0 2 2h16v-5"/><path d="M18 12a2 2 0 0 0 0 4h4v-4Z"/></svg></div><div class="kpi-lbl">Gross Salary</div></div>
        <div class="kpi-val kpi-red">${fmt(totalEarnings)}</div>${spDotRed}
      </div>
      <div class="kpi-card">
        <div class="kpi-top"><div class="kpi-icon kpi-ico-red"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#DC2626" stroke-width="2" stroke-linecap="round"><circle cx="12" cy="12" r="10"/><polyline points="8 12 12 16 16 12"/><line x1="12" y1="8" x2="12" y2="16"/></svg></div><div class="kpi-lbl">Leave Deduction</div></div>
        <div class="kpi-val kpi-red">${r.deduction > 0 ? fmt(r.deduction) : "₹ 0"}</div>${spDotRed}
      </div>
      <div class="kpi-card">
        <div class="kpi-top"><div class="kpi-icon kpi-ico-green"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#16A34A" stroke-width="2" stroke-linecap="round"><rect x="3" y="4" width="18" height="18" rx="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/><polyline points="9 15 11 17 15 13"/></svg></div><div class="kpi-lbl">Paid Days</div></div>
        <div class="kpi-val kpi-dark">${presentDaysShow} / ${workDaysForRow}</div>${spDotGreen}
      </div>
      <div class="kpi-card">
        <div class="kpi-top"><div class="kpi-icon kpi-ico-orange"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#F97316" stroke-width="2" stroke-linecap="round"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg></div><div class="kpi-lbl">Overtime Hours</div></div>
        <div class="kpi-val kpi-orange">${r.otHours} hrs</div>${spDotOrange}
      </div>
    </div>

    <!-- EARNINGS / DEDUCTIONS / BREAKDOWN -->
    <div class="tri-grid">
      <div class="ed-card">
        <div class="ed-hdr ed-hdr-green"><div class="ed-ico ed-ico-green"><svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="#15803D" stroke-width="2" stroke-linecap="round"><path d="M12 2v20M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6"/></svg></div><span class="ed-title ed-title-green">Earnings</span><span style="margin-left:auto;font-size:9px;color:#9CA3AF;font-weight:600">Amount (₹)</span></div>
        ${isRegular ? `
        <div class="ed-row"><span class="ed-row-name">Basic Salary</span><span class="ed-row-amt">${Math.round(basic).toLocaleString("en-IN")}</span></div>
        <div class="ed-row"><span class="ed-row-name">HRA</span><span class="ed-row-amt">${Math.round(hra).toLocaleString("en-IN")}</span></div>
        <div class="ed-row"><span class="ed-row-name">Travel Allowance</span><span class="ed-row-amt">${Math.round(travelAllowance).toLocaleString("en-IN")}</span></div>
        <div class="ed-row"><span class="ed-row-name">Medical Allowance</span><span class="ed-row-amt">${Math.round(medicalAllowance).toLocaleString("en-IN")}</span></div>
        ${otherAllowance > 0 ? `<div class="ed-row"><span class="ed-row-name">Other Allowance</span><span class="ed-row-amt">${Math.round(otherAllowance).toLocaleString("en-IN")}</span></div>` : ""}
        ${r.otPay > 0 ? `<div class="ed-row"><span class="ed-row-name">Overtime Pay (${r.otHours}h)</span><span class="ed-row-amt">${Math.round(r.otPay).toLocaleString("en-IN")}</span></div>` : ""}
        ${r.bonus > 0 ? `<div class="ed-row"><span class="ed-row-name">Bonus</span><span class="ed-row-amt">${Math.round(r.bonus).toLocaleString("en-IN")}</span></div>` : ""}
        ${r.incentive > 0 ? `<div class="ed-row"><span class="ed-row-name">Incentive</span><span class="ed-row-amt">${Math.round(r.incentive).toLocaleString("en-IN")}</span></div>` : ""}
        ` : `<div class="ed-row"><span class="ed-row-name">Hours Worked (${r.totalHours}h)</span><span class="ed-row-amt">${Math.round(r.basePay).toLocaleString("en-IN")}</span></div>`}
        <div class="ed-total ed-total-green"><span>Total Earnings</span><span>${fmt(totalEarnings)}</span></div>
      </div>
      <div class="ed-card">
        <div class="ed-hdr ed-hdr-red"><div class="ed-ico ed-ico-red"><svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="#991B1B" stroke-width="2" stroke-linecap="round"><circle cx="12" cy="12" r="10"/><line x1="8" y1="12" x2="16" y2="12"/></svg></div><span class="ed-title ed-title-red">Deductions</span><span style="margin-left:auto;font-size:9px;color:#9CA3AF;font-weight:600">Amount (₹)</span></div>
        ${r.deduction > 0 ? `<div class="ed-row"><span class="ed-row-name">Leave Deduction (${r.leaveDays} day${r.leaveDays !== 1 ? "s" : ""})</span><span class="ed-row-amt">${Math.round(r.deduction).toLocaleString("en-IN")}</span></div>` : `<div class="ed-row"><span class="ed-row-name" style="color:#9CA3AF">No deductions this month</span><span class="ed-row-amt" style="color:#9CA3AF">—</span></div>`}
        ${r.advance > 0 ? `<div class="ed-row"><span class="ed-row-name">Advance Recovery</span><span class="ed-row-amt">${Math.round(r.advance).toLocaleString("en-IN")}</span></div>` : ""}
        <div class="ed-total ed-total-red"><span>Total Deductions</span><span>${fmt(totalDeductions)}</span></div>
      </div>
      <div class="breakdown-card">
        <div class="breakdown-hdr">Salary Breakdown</div>
        <div class="breakdown-body">
          ${donutSvg}
          <div class="pie-legend">
            ${pieItems.map((it, idx) => `<div class="pie-row"><div class="pie-dot" style="background:${pieColors[idx]}"></div><span class="pie-name">${it.label}</span><span class="pie-pct">${grossBase > 0 ? ((it.val / grossBase) * 100).toFixed(1) : "0"}%</span></div>`).join("")}
          </div>
        </div>
      </div>
    </div>

    <!-- ATTENDANCE / PAYMENT / SECURE -->
    <div class="bot-grid">
      <div class="bot-card">
        <div class="bot-hdr"><div class="bot-hdr-ico"><svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="#1D4ED8" stroke-width="2" stroke-linecap="round"><rect x="3" y="4" width="18" height="18" rx="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg></div><span class="bot-hdr-title">Attendance Summary</span></div>
        <div class="bot-row"><div class="bot-lbl-wrap"><div class="bot-ico"><svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#3B82F6" stroke-width="2"><rect x="3" y="4" width="18" height="18" rx="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg></div><span class="bot-lbl">Total Working Days</span></div><span class="bot-val">${workDaysForRow}</span></div>
        <div class="bot-row"><div class="bot-lbl-wrap"><div class="bot-ico"><svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#16A34A" stroke-width="2.5"><polyline points="20 6 9 17 4 12"/></svg></div><span class="bot-lbl">Present Days</span></div><span class="bot-val">${presentDaysShow}</span></div>
        <div class="bot-row"><div class="bot-lbl-wrap"><div class="bot-ico"><svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#F97316" stroke-width="2"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/></svg></div><span class="bot-lbl">Leave Days</span></div><span class="bot-val">${r.leaveDays}</span></div>
        <div class="bot-row"><div class="bot-lbl-wrap"><div class="bot-ico"><svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#DC2626" stroke-width="2"><circle cx="12" cy="12" r="10"/><line x1="9" y1="9" x2="15" y2="15"/><line x1="15" y1="9" x2="9" y2="15"/></svg></div><span class="bot-lbl">Absent Days</span></div><span class="bot-val">${r.absentDays}</span></div>
        <div class="bot-row"><div class="bot-lbl-wrap"><div class="bot-ico"><svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#F97316" stroke-width="2"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg></div><span class="bot-lbl">Overtime Hours</span></div><span class="bot-val">${r.otHours} hrs</span></div>
      </div>
      <div class="bot-card">
        <div class="bot-hdr"><div class="bot-hdr-ico"><svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="#1D4ED8" stroke-width="2"><line x1="3" y1="22" x2="21" y2="22"/><path d="M12 2L3 8h18L12 2z"/><line x1="5" y1="8" x2="5" y2="22"/><line x1="10" y1="8" x2="10" y2="22"/><line x1="14" y1="8" x2="14" y2="22"/><line x1="19" y1="8" x2="19" y2="22"/></svg></div><span class="bot-hdr-title">Payment Details</span></div>
        <div class="bot-row"><div class="bot-lbl-wrap"><span class="bot-lbl">Payment Date</span></div><span class="bot-val">${payDateStr}</span></div>
        <div class="bot-row"><div class="bot-lbl-wrap"><span class="bot-lbl">Payment Method</span></div><span class="bot-val" style="color:#16A34A">Bank Transfer</span></div>
        <div class="bot-row"><div class="bot-lbl-wrap"><span class="bot-lbl">Bank Name</span></div><span class="bot-val">${r.bank_name ?? "—"}</span></div>
        <div class="bot-row"><div class="bot-lbl-wrap"><span class="bot-lbl">Account Number</span></div><span class="bot-val">${r.bank_account ? `XXXX XXXX ${r.bank_account.slice(-4)}` : "—"}</span></div>
        <div class="bot-row"><div class="bot-lbl-wrap"><span class="bot-lbl">Transaction ID</span></div><span class="bot-val" style="font-size:10px">${payslipId.replace(/\//g, "")}TXN</span></div>
      </div>
      <div class="secure-card">
        <div class="secure-icon"><svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#2563EB" stroke-width="2" stroke-linecap="round"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/></svg></div>
        <div class="secure-title">100% Secure Payslip</div>
        <div class="secure-desc">This payslip is system generated and digitally verified.</div>
        <div class="qr-wrap">
          <img src="${qrUrl}" width="90" height="90" style="border-radius:8px;border:1px solid #E5E7EB" alt="QR"/>
          <div class="qr-label">Scan to verify<br/>this payslip</div>
        </div>
      </div>
    </div>

    <!-- FOOTER -->
    <div class="footer">
      <div class="footer-disc">
        <div class="footer-shield"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#DC2626" stroke-width="2" stroke-linecap="round"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/></svg></div>
        <div class="footer-disc-text">This is a computer-generated payslip.<br/>No physical signature is required.<br/><span style="color:#D1D5DB">Generated on ${generatedTs}</span></div>
      </div>
      <div class="sig">
        <div class="sig-name">GroFast</div>
        <div class="sig-line"></div>
        <div class="sig-role">Authorised Signatory</div>
        <div class="sig-co">Grofast Group Of Companies</div>
        <div class="sig-check"><svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="20 6 9 17 4 12"/></svg> Verified</div>
      </div>
      <div class="sig">
        <div class="sig-name">${r.name.split(" ")[0]}</div>
        <div class="sig-line"></div>
        <div class="sig-role">Employee Signature</div>
        <div class="sig-co">${r.employee_id}</div>
        <div class="sig-check"><svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="20 6 9 17 4 12"/></svg> ${r.name}</div>
      </div>
    </div>

  </div>`
}

// ── Expandable Employee Card ────────────────────────────────────────────────
function EmployeeCard({
  r, month, isExpanded, onToggle, onDownloadReport,
  selectMode = false, selected = false, onToggleSelect, teams = [],
}: {
  r: PayrollRow; month: string
  isExpanded: boolean; onToggle: () => void; onDownloadReport: () => void
  selectMode?: boolean; selected?: boolean; onToggleSelect?: () => void
  teams?: TeamRow[]
}) {
  const [isPending, startTransition] = useTransition()
  const [savingBonus, setSavingBonus] = useState(false)
  // Bonus/Advance are no longer editable here — carried through unchanged on save so
  // a historical value (set before this panel was simplified) is never wiped out.
  const [bonus]     = useState(r.bonus)
  const [advance]   = useState(r.advance)
  const [incentive, setIncentive] = useState(r.incentive)
  const [otAmount, setOtAmount]   = useState(r.otPay)

  const localFinalNetPay = Math.round((r.netPay + otAmount + bonus + incentive - advance) * 100) / 100
  const tClr = resolveTeamClr(r.team, teams)

  function handleTogglePaid() {
    startTransition(async () => {
      if (r.isPaid) {
        await markEmployeeUnpaid(r.id, month)
      } else {
        await markEmployeePaid(r.id, month, localFinalNetPay)
      }
    })
  }

  async function handleSaveBonus() {
    setSavingBonus(true)
    try {
      await saveBonusAdvance(r.id, month, bonus, advance, incentive, otAmount)
    } finally {
      setSavingBonus(false)
    }
  }

  return (
    <div style={{
      background: "#FFFFFF",
      borderRadius: 22,
      border: r.isPaid
        ? "1.5px solid rgba(22,163,74,0.35)"
        : isExpanded
          ? "1.5px solid rgba(229,57,53,0.3)"
          : "1.5px solid #EBEBEB",
      boxShadow: r.isPaid
        ? "0 4px 18px rgba(22,163,74,0.10)"
        : isExpanded
          ? "0 8px 32px rgba(229,57,53,0.10), 0 2px 8px rgba(0,0,0,0.04)"
          : "0 2px 10px rgba(0,0,0,0.05)",
      overflow: "hidden",
      transition: "all 0.2s ease",
    }}>
      {/* ── Card header row ── */}
      <div style={{ padding: "16px 22px", display: "flex", alignItems: "center", gap: 18, flexWrap: "wrap" }}>

        {/* Select checkbox — only in Bulk Update select mode */}
        {selectMode && (
          <input type="checkbox" checked={selected} onChange={onToggleSelect}
            style={{ width: 20, height: 20, flexShrink: 0, cursor: "pointer", accentColor: "#E53935" }} />
        )}

        {/* Avatar */}
        <div style={{
          width: 52, height: 52, borderRadius: "50%", flexShrink: 0, overflow: "hidden",
          background: r.isPaid
            ? "linear-gradient(135deg, #16A34A, #15803D)"
            : "linear-gradient(135deg, #E53935, #B71C1C)",
          display: "flex", alignItems: "center", justifyContent: "center",
          fontSize: 18, fontWeight: 900, color: "#fff",
          fontFamily: "var(--font-jakarta)",
          boxShadow: r.isPaid
            ? "0 4px 14px rgba(22,163,74,0.3)"
            : "0 4px 14px rgba(229,57,53,0.3)",
        }}>
          {r.passport_photo_url ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={r.passport_photo_url} alt={r.name} style={{ width: "100%", height: "100%", objectFit: "cover" }} />
          ) : (
            getInitials(r.name)
          )}
        </div>

        {/* Name + ID + badge */}
        <div style={{ minWidth: 140 }}>
          <div style={{ fontSize: 15, fontWeight: 800, color: "#111", fontFamily: "var(--font-jakarta)", marginBottom: 2 }}>
            {r.name}
          </div>
          <div style={{ fontSize: 11, color: "#1E3A5F", marginBottom: 5 }}>#{r.employee_id}</div>
          <div style={{ display: "flex", gap: 5, flexWrap: "wrap" }}>
            {r.team && (
              <span style={{ fontSize: 10, fontWeight: 700, padding: "3px 10px", borderRadius: 20, background: tClr.bg, color: tClr.color }}>
                {r.team}
              </span>
            )}
          </div>
        </div>

        {/* Salary chips */}
        <div style={{ flex: 1, display: "flex", gap: 8, justifyContent: "center", flexWrap: "wrap" }}>
          {[
            { label: "Base Salary",    value: r.basePay > 0 ? fmt(r.basePay) : "—",                  color: "#111" },
            { label: "Deductions",     value: r.deduction > 0 ? `-${fmt(r.deduction)}` : "—",         color: "#DC2626" },
          ].map((chip) => (
            <div key={chip.label} style={{
              textAlign: "center", padding: "8px 14px", borderRadius: 12,
              background: "#F9FAFB", border: "1px solid #F0F0F0", minWidth: 80,
            }}>
              <div style={{ fontSize: 10, color: "#1E3A5F", marginBottom: 3, fontWeight: 600 }}>{chip.label}</div>
              <div style={{ fontSize: 14, fontWeight: 900, color: chip.color, fontFamily: "var(--font-jakarta)" }}>{chip.value}</div>
            </div>
          ))}
        </div>

        {/* Actions */}
        <div style={{ display: "flex", alignItems: "center", gap: 8, flexShrink: 0 }}>
          {/* Mark Paid / Undo */}
          <button
            onClick={handleTogglePaid}
            disabled={isPending}
            style={{
              padding: "8px 16px", borderRadius: 10, fontSize: 12, fontWeight: 700, cursor: isPending ? "not-allowed" : "pointer",
              background: r.isPaid ? "#FFF1F2" : "linear-gradient(135deg, #16A34A, #15803D)",
              color: r.isPaid ? "#DC2626" : "#fff",
              border: r.isPaid ? "1.5px solid #FECDD3" : "none",
              opacity: isPending ? 0.6 : 1,
              boxShadow: r.isPaid ? "none" : "0 4px 12px rgba(22,163,74,0.3)",
            }}
          >
            {isPending ? "..." : r.isPaid ? "Undo Paid" : "✓ Mark Paid"}
          </button>
          <button
            onClick={onToggle}
            style={{ width: 34, height: 34, borderRadius: 9, display: "flex", alignItems: "center", justifyContent: "center", background: "#F9FAFB", border: "1.5px solid #E5E7EB", cursor: "pointer" }}
          >
            {isExpanded
              ? <ChevronUp size={15} style={{ color: "#1E3A5F" }} />
              : <ChevronDown size={15} style={{ color: "#1E3A5F" }} />}
          </button>
          <a
            href={`/api/payslip?userId=${r.id}&month=${month}`}
            target="_blank"
            rel="noopener noreferrer"
            style={{ width: 34, height: 34, borderRadius: 9, display: "flex", alignItems: "center", justifyContent: "center", background: "rgba(229,57,53,0.07)", border: "1.5px solid rgba(229,57,53,0.15)", textDecoration: "none" }}
            title="Download Payslip"
          >
            <FileText size={13} style={{ color: "#E53935" }} />
          </a>
          <button
            type="button"
            onClick={onDownloadReport}
            style={{ width: 34, height: 34, borderRadius: 9, display: "flex", alignItems: "center", justifyContent: "center", background: "rgba(79,70,229,0.07)", border: "1.5px solid rgba(79,70,229,0.15)", cursor: "pointer" }}
            title="Download Report"
          >
            <BarChart3 size={13} style={{ color: "#4F46E5" }} />
          </button>
        </div>
      </div>

      {/* ── Expanded panel — "The Math" (read-only, live) connected to "Admin Sets" (editable) ── */}
      {isExpanded && (
        <div className="flex flex-col md:flex-row" style={{ borderTop: "1.5px solid #F5F5F5", padding: "22px 24px", alignItems: "stretch", gap: 14 }}>

          <div style={{ flex: "1.3 1 260px", background: "#fff", border: "1.5px solid #F0F0F0", borderRadius: 16, padding: "18px 20px" }}>
            <div style={{ fontSize: 10, fontWeight: 800, color: "#1E3A5F", textTransform: "uppercase", letterSpacing: "0.13em", marginBottom: 14 }}>
              The Math
            </div>
            {[
              { label: "Base Salary", amount: r.basePay,    color: "#111" },
              { label: "Deductions",  amount: -r.deduction, color: "#DC2626" },
              { label: "OT",          amount: otAmount,     color: "#F97316" },
              { label: "Incentive",   amount: incentive,    color: "#16A34A" },
            ].map((item) => (
              <div key={item.label} style={{ display: "flex", justifyContent: "space-between", padding: "8px 0", borderBottom: "1px solid #F5F5F5" }}>
                <span style={{ fontSize: 13, color: "#1E3A5F" }}>{item.label}</span>
                <span style={{ fontSize: 13, fontWeight: 700, color: item.amount < 0 ? "#DC2626" : item.amount === 0 ? "#1E3A5F" : item.color }}>
                  {item.amount === 0 ? "—" : item.amount < 0 ? `-${fmt(Math.abs(item.amount))}` : fmt(item.amount)}
                </span>
              </div>
            ))}
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", paddingTop: 14, marginTop: 4 }}>
              <span style={{ fontSize: 14, fontWeight: 800, color: "#111" }}>Net Pay</span>
              <span style={{ fontSize: 20, fontWeight: 900, color: localFinalNetPay < 0 ? "#DC2626" : "#16A34A", fontFamily: "var(--font-jakarta)" }}>{fmt(localFinalNetPay)}</span>
            </div>
          </div>

          <div style={{ display: "flex", alignItems: "center", justifyContent: "center", fontSize: 24, fontWeight: 300, color: "#D1D5DB" }}>
            =
          </div>

          <div style={{ flex: "1 1 220px", background: "#FAFAFA", border: "1.5px solid #F0F0F0", borderRadius: 16, padding: "18px 20px" }}>
            <div style={{ fontSize: 10, fontWeight: 800, color: "#1E3A5F", textTransform: "uppercase", letterSpacing: "0.13em", marginBottom: 14 }}>
              Admin Sets
            </div>

            {/* OT input — admin decides the amount, never auto-calculated from hours */}
            <div style={{ marginBottom: 12 }}>
              <label style={{ fontSize: 11, fontWeight: 700, color: "#1E3A5F", display: "block", marginBottom: 6 }}>
                OT (₹)
              </label>
              <input
                type="number"
                min={0}
                value={otAmount}
                onChange={e => setOtAmount(Math.max(0, Number(e.target.value)))}
                style={{
                  width: "100%", padding: "9px 12px", borderRadius: 10, border: "1.5px solid #E5E7EB",
                  fontSize: 14, fontWeight: 700, color: "#F97316", background: "#fff", outline: "none",
                }}
                placeholder="0"
              />
            </div>

            {/* Incentive input */}
            <div style={{ marginBottom: 16 }}>
              <label style={{ fontSize: 11, fontWeight: 700, color: "#1E3A5F", display: "block", marginBottom: 6 }}>
                Incentive (₹)
              </label>
              <input
                type="number"
                min={0}
                value={incentive}
                onChange={e => setIncentive(Math.max(0, Number(e.target.value)))}
                style={{
                  width: "100%", padding: "9px 12px", borderRadius: 10, border: "1.5px solid #E5E7EB",
                  fontSize: 14, fontWeight: 700, color: "#16A34A", background: "#fff", outline: "none",
                }}
                placeholder="0"
              />
            </div>

            <button
              onClick={handleSaveBonus}
              disabled={savingBonus}
              style={{
                width: "100%", padding: "10px", borderRadius: 12,
                background: savingBonus ? "#E5E7EB" : "linear-gradient(135deg, #6366F1, #4F46E5)",
                color: savingBonus ? "#1E3A5F" : "#fff",
                border: "none", fontSize: 13, fontWeight: 700, cursor: savingBonus ? "not-allowed" : "pointer",
                boxShadow: savingBonus ? "none" : "0 4px 14px rgba(99,102,241,0.35)",
              }}
            >
              {savingBonus ? "Saving…" : "Save Adjustments"}
            </button>
          </div>
        </div>
      )}

      {/* ── Hours-Based Formula (Preview) — NOT used for Mark Paid, informational only ── */}
      {isExpanded && (
        <div style={{ borderTop: "1.5px solid #F5F5F5", padding: "18px 24px", background: "#FAFAFF" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 12 }}>
            <span style={{ fontSize: 10, fontWeight: 800, color: "#4F46E5", textTransform: "uppercase", letterSpacing: "0.13em" }}>
              Hours-Based Formula — Preview
            </span>
            <span style={{ fontSize: 9, fontWeight: 700, padding: "2px 8px", borderRadius: 20, background: "#EEF2FF", color: "#4F46E5" }}>
              Not used for actual pay yet
            </span>
          </div>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            {[
              { label: "Total Present Day",     value: `${r.presentDays}` },
              { label: "Total Permission Hours", value: `${r.hoursPreview.permissionHours}h` },
              { label: "Total Leave Day",       value: `${r.leaveDays}` },
              { label: "Total Half Day",        value: `${r.halfDays}` },
            ].map(chip => (
              <div key={chip.label} style={{ textAlign: "center", padding: "6px 12px", borderRadius: 10, background: "#fff", border: "1px solid #E5E7EB", minWidth: 72 }}>
                <div style={{ fontSize: 9, color: "#6366F1", marginBottom: 2, fontWeight: 600 }}>{chip.label}</div>
                <div style={{ fontSize: 12, fontWeight: 800, color: "#111" }}>{chip.value}</div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}

// ═══════════════════════════════════════════════════════════════════════════════
// MAIN COMPONENT
// ═══════════════════════════════════════════════════════════════════════════════
export default function PayrollClient({
  rows, month, workDays,
  pendingCollabCount, pendingLeaveCount, pendingUpdateCount,
  payrollSettings, teams = [],
}: {
  rows: PayrollRow[]
  month: string
  workDays: number
  pendingCollabCount: number
  pendingLeaveCount: number
  pendingUpdateCount: number
  payrollSettings: PayrollSettings
  teams?: TeamRow[]
}) {
  const router   = useRouter()
  const pathname = usePathname()
  const { toastEl, showToast } = useToast()
  const [expandedId, setExpandedId] = useState<string | null>(null)
  const [isRunning, startRunTransition] = useTransition()
  const [showConfirm, setShowConfirm] = useState(false)
  const [showMissingDetail, setShowMissingDetail] = useState(false)

  // Bulk Update — select-multiple-then-mark-paid. Fully separate from the
  // existing Run Payroll flow above (different state, different confirm
  // modal) so it can't interfere with that flow.
  const [selectMode, setSelectMode] = useState(false)
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())
  const [showBulkConfirm, setShowBulkConfirm] = useState(false)
  const [isBulkRunning, startBulkTransition] = useTransition()

  // Payroll Settings — separate modal + form state, saves via
  // savePayrollSettings unchanged. Opening the modal seeds the form from
  // payrollSettings (the values page.tsx already fetched and used to
  // compute the rows currently on screen).
  const [showSettings, setShowSettings] = useState(false)
  const [settingsForm, setSettingsForm] = useState<PayrollSettings>(payrollSettings)
  const [isSavingSettings, setIsSavingSettings] = useState(false)

  const [year, mon] = month.split("-").map(Number)
  const monthName   = new Date(year, mon - 1).toLocaleString("en-IN", { month: "long", year: "numeric" })

  const totalFinal  = rows.reduce((s, r) => s + r.finalNetPay, 0)
  const totalOT     = rows.reduce((s, r) => s + r.otPay,       0)
  const totalDed    = rows.reduce((s, r) => s + r.deduction,   0)

  const paidCount       = rows.filter(r => r.isPaid).length
  const unpaidRows      = rows.filter(r => !r.isPaid && r.basePay > 0)
  const configuredCount = rows.filter(r => r.basePay > 0).length
  const processedPct    = configuredCount > 0 ? Math.round((paidCount / configuredCount) * 100) : 0
  const pendingCount    = rows.filter(r => r.basePay === 0).length

  const today    = new Date()
  const payDate  = new Date(year, mon, 5)
  const daysLeft = Math.max(0, Math.ceil((payDate.getTime() - today.getTime()) / 86400000))
  const payMonthName = payDate.toLocaleString("en-IN", { month: "long", year: "numeric" })
  // Next upcoming salary date: 5th of next month from today
  const todayDay = today.getDate()
  const nextSalaryDate = todayDay < 5
    ? new Date(today.getFullYear(), today.getMonth(), 5)
    : new Date(today.getFullYear(), today.getMonth() + 1, 5)
  const nextSalaryDaysLeft = Math.max(0, Math.ceil((nextSalaryDate.getTime() - today.setHours(0,0,0,0)) / 86400000))
  const nextSalaryLabel = nextSalaryDate.toLocaleDateString("en-IN", { day: "numeric", month: "long", year: "numeric" })

  function changeMonth(delta: number) {
    const d = new Date(year, mon - 1 + delta)
    const m = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`
    router.push(`${pathname}?month=${m}`)
  }

  function handleRunPayroll() {
    if (unpaidRows.length === 0) return
    setShowConfirm(true)
  }

  function confirmRunPayroll() {
    setShowConfirm(false)
    startRunTransition(async () => {
      const netPayMap = Object.fromEntries(unpaidRows.map(r => [r.id, r.finalNetPay]))
      await runPayroll(month, unpaidRows.map(r => r.id), netPayMap)
    })
  }

  // Opens each employee's existing, unmodified payslip URL in its own tab —
  // reuses /api/payslip exactly as the per-row download button already does,
  // just for every configured employee in one click instead of one at a time.
  function handleBulkPayslip() {
    const configured = rows.filter(r => r.basePay > 0)
    if (configured.length === 0) {
      showToast("No employees with payroll configured for this month yet.", "error")
      return
    }
    showToast(`Opening ${configured.length} payslip${configured.length > 1 ? "s" : ""} — allow pop-ups if your browser blocks them.`, "info")
    configured.forEach((r, i) => {
      setTimeout(() => {
        window.open(`/api/payslip?userId=${r.id}&month=${month}`, "_blank", "noopener,noreferrer")
      }, i * 400)
    })
  }

  // Bulk Update — toggle select mode; picking employees then confirming
  // reuses the existing runPayroll(month, ids, netPayMap) action unchanged,
  // just scoped to whichever ids the admin picked instead of "all unpaid".
  function handleToggleSelectMode() {
    setSelectMode(v => !v)
    setSelectedIds(new Set())
  }
  function toggleSelectId(id: string) {
    setSelectedIds(prev => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id); else next.add(id)
      return next
    })
  }
  function handleBulkMarkPaid() {
    if (selectedIds.size === 0) {
      showToast("Select at least one employee first.", "error")
      return
    }
    setShowBulkConfirm(true)
  }
  function confirmBulkMarkPaid() {
    setShowBulkConfirm(false)
    const selectedRows = rows.filter(r => selectedIds.has(r.id) && !r.isPaid)
    startBulkTransition(async () => {
      const netPayMap = Object.fromEntries(selectedRows.map(r => [r.id, r.finalNetPay]))
      await runPayroll(month, selectedRows.map(r => r.id), netPayMap)
      setSelectMode(false)
      setSelectedIds(new Set())
    })
  }

  function handleOpenSettings() {
    setSettingsForm(payrollSettings)
    setShowSettings(true)
  }
  async function handleSaveSettings() {
    setIsSavingSettings(true)
    try {
      const res = await savePayrollSettings(settingsForm)
      if (res.success) {
        showToast("Payroll settings saved. Recalculating with the new values…", "success")
        setShowSettings(false)
        router.refresh()
      } else {
        showToast(res.error ?? "Could not save settings", "error")
      }
    } finally {
      setIsSavingSettings(false)
    }
  }

  // Builds a payslip-style printable report entirely client-side from the rows
  // already computed and on screen — no new API route, no re-running any
  // salary calculation, so it can't drift from what's actually displayed.
  // Renders the full payslip-style card (buildReportEmployeeCard) once per
  // employee, stacked for the whole-team report.
  function handleGenerateReport(scopeRows: PayrollRow[] = rows) {
    if (scopeRows.length === 0) {
      showToast("No payroll rows to report for this month.", "error")
      return
    }
    // No "noopener" here — unlike the payslip's window.open (which just navigates
    // to a URL), this one needs script access to `win` to document.write the
    // report into it. "noopener" makes window.open() return null even though the
    // tab still opens, which is exactly the silent-blank-tab bug this fixes.
    const win = window.open("", "_blank")
    if (!win) {
      showToast("Pop-up blocked — allow pop-ups to view the report.", "error")
      return
    }

    // Everything below runs after the tab is already open — if it throws, the tab
    // would otherwise sit there permanently blank with zero indication anything
    // went wrong. Catch it, write the real error into that same tab, and toast on
    // this page too, so a bad row's data shows up as a visible message instead of
    // a silent dead end.
    try {
      buildAndWriteReport(win)
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err)
      win.document.write(`<pre style="padding:24px;color:#DC2626;font-family:monospace;white-space:pre-wrap">Report failed to generate:\n\n${message}</pre>`)
      win.document.close()
      showToast(`Report failed to generate: ${message}`, "error")
    }

    function buildAndWriteReport(win: Window) {
      const payDateStr  = new Date(year, mon, 5).toLocaleDateString("en-IN", { day: "numeric", month: "long", year: "numeric" })
      const generatedTs = new Date().toLocaleDateString("en-IN", { day: "numeric", month: "long", year: "numeric", hour: "2-digit", minute: "2-digit" })
      const reportTitle = scopeRows.length === 1
        ? `Payroll Report — ${scopeRows[0].name} — ${monthName}`
        : `Payroll Report — ${monthName}`
      const topbarText = scopeRows.length === 1
        ? `${scopeRows[0].name} &nbsp;·&nbsp; ${monthName} &nbsp;·&nbsp; Report`
        : `${scopeRows.length} Employees &nbsp;·&nbsp; ${monthName} &nbsp;·&nbsp; Report`

      const cardsHtml = scopeRows
        .map(r => buildReportEmployeeCard(r, { year, mon, monthName, payDateStr, generatedTs }))
        .join("")

      win.document.write(`<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8"/>
<meta name="viewport" content="width=device-width,initial-scale=1"/>
<title>${reportTitle}</title>
<link rel="preconnect" href="https://fonts.googleapis.com"/>
<link href="https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700;800;900&family=Dancing+Script:wght@600;700&display=swap" rel="stylesheet"/>
<style>
*{margin:0;padding:0;box-sizing:border-box}
body{font-family:'Inter',system-ui,sans-serif;background:#F3F4F6;color:#111827;-webkit-print-color-adjust:exact;print-color-adjust:exact;font-size:13px}
.topbar{background:#111;padding:10px 24px;display:flex;align-items:center;gap:12px;position:sticky;top:0;z-index:100}
.topbar-dot{width:7px;height:7px;border-radius:50%;background:#DC2626;flex-shrink:0}
.topbar-text{font-size:12px;color:#9CA3AF;font-weight:500;flex:1}
.dl-btn{background:#DC2626;color:#fff;border:none;padding:7px 18px;border-radius:8px;font-size:12px;font-weight:700;cursor:pointer;display:flex;align-items:center;gap:6px;box-shadow:0 3px 10px rgba(220,38,38,0.4)}
.page{max-width:860px;margin:20px auto 40px;background:#fff;border-radius:16px;border:1px solid #E5E7EB;box-shadow:0 4px 24px rgba(0,0,0,0.08);overflow:hidden}
.hdr{display:flex;justify-content:space-between;align-items:flex-start;padding:24px 28px 20px;gap:16px}
.co-logo{width:48px;height:48px;border-radius:12px;background:linear-gradient(135deg, #DE1A1A 0%, #8B1212 55%, #1A0808 100%);display:flex;align-items:center;justify-content:center;font-size:17px;font-weight:900;color:#fff;flex-shrink:0;box-shadow:0 4px 12px rgba(220,38,38,0.3)}
.co-name{font-size:20px;font-weight:900;color:#111;letter-spacing:0.01em;line-height:1.1}
.co-sub{font-size:11px;font-weight:700;color:#DC2626;text-transform:uppercase;letter-spacing:0.06em;margin-top:2px}
.co-addr{font-size:10.5px;color:#9CA3AF;margin-top:6px;line-height:1.7;display:flex;align-items:flex-start;gap:5px}
.contact-row{display:flex;gap:16px;flex-wrap:wrap;margin-top:8px}
.contact-item{display:flex;align-items:center;gap:5px;font-size:11px;color:#6B7280;font-weight:500}
.slip-badge{background:linear-gradient(135deg, #DE1A1A 0%, #8B1212 55%, #1A0808 100%);border-radius:14px;padding:16px 22px;min-width:190px;box-shadow:0 4px 16px rgba(220,38,38,0.35);position:relative;overflow:hidden;flex-shrink:0}
.slip-badge::before{content:'';position:absolute;top:-20px;right:-20px;width:80px;height:80px;border-radius:50%;background:rgba(255,255,255,0.08)}
.slip-month{font-size:11px;font-weight:600;color:rgba(255,255,255,0.75);letter-spacing:0.12em;text-transform:uppercase;margin-bottom:4px}
.slip-title{font-size:28px;font-weight:900;color:#fff;letter-spacing:0.1em;line-height:1}
.slip-doc{position:absolute;right:16px;top:50%;transform:translateY(-50%);opacity:0.25}
.slip-id-row{margin-top:8px;padding:0 28px}
.hdivider{height:1px;background:#F3F4F6;margin:0 28px}
.emp-card{margin:20px 28px;background:#F8F9FC;border:1.5px solid #E5E7EB;border-radius:14px;padding:22px 24px;display:flex;gap:22px;align-items:flex-start;position:relative;overflow:hidden}
.emp-watermark{position:absolute;right:-10px;bottom:-20px;font-size:120px;font-weight:900;color:rgba(0,0,0,0.04);letter-spacing:-0.06em;line-height:1;pointer-events:none}
.emp-photo{width:90px;height:90px;border-radius:50%;overflow:hidden;flex-shrink:0;border:3px solid #E5E7EB;background:#F3F4F6;display:flex;align-items:center;justify-content:center;box-shadow:0 2px 12px rgba(0,0,0,0.1)}
.emp-photo img{width:100%;height:100%;object-fit:cover;object-position:top center}
.emp-photo-init{width:100%;height:100%;background:linear-gradient(135deg, #DE1A1A 0%, #8B1212 55%, #1A0808 100%);display:flex;align-items:center;justify-content:center;font-size:30px;font-weight:900;color:#fff}
.emp-info{flex:1;display:flex;gap:32px}
.emp-left{flex:1}
.emp-name{font-size:20px;font-weight:800;color:#111;margin-bottom:6px}
.emp-badge{display:inline-block;background:#DCFCE7;color:#15803D;font-size:10px;font-weight:700;padding:3px 10px;border-radius:99px;letter-spacing:0.04em;margin-bottom:14px}
.emp-field{margin-bottom:10px}
.emp-lbl{display:flex;align-items:center;gap:5px;font-size:10px;color:#9CA3AF;font-weight:500;margin-bottom:2px}
.emp-val{font-size:13px;font-weight:700;color:#111}
.emp-right{min-width:200px}
.net-banner{margin:0 28px 20px;background:#F0FDF4;border:1.5px solid #DCFCE7;border-radius:14px;padding:20px 26px;display:flex;align-items:center}
.net-left{flex:1}
.net-label{font-size:10px;font-weight:800;color:#16A34A;text-transform:uppercase;letter-spacing:0.14em;display:flex;align-items:center;gap:6px;margin-bottom:6px}
.net-label::before{content:'';width:7px;height:7px;border-radius:50%;background:#16A34A;flex-shrink:0}
.net-amount{font-size:38px;font-weight:900;color:#111;letter-spacing:-0.03em;line-height:1;margin-bottom:6px}
.net-words{font-size:11.5px;color:#6B7280;line-height:1.5;max-width:260px}
.net-divider{width:1px;background:#D1FAE5;align-self:stretch;margin:0 24px;flex-shrink:0}
.net-right{display:flex;flex-direction:column;align-items:center;gap:8px;flex-shrink:0}
.net-cal-icon{width:44px;height:44px;border-radius:50%;background:#DCFCE7;border:2px solid #A7F3D0;display:flex;align-items:center;justify-content:center}
.net-paid-lbl{font-size:10px;color:#6B7280;font-weight:500;text-align:center}
.net-paid-date{font-size:14px;font-weight:800;color:#111;text-align:center}
.net-method{display:inline-flex;align-items:center;gap:5px;background:#DCFCE7;color:#15803D;font-size:11px;font-weight:700;padding:4px 12px;border-radius:99px;border:1px solid #A7F3D0}
.kpi-row{display:grid;grid-template-columns:repeat(4,1fr);gap:12px;margin:0 28px 20px}
.kpi-card{border:1.5px solid #E5E7EB;border-radius:12px;padding:14px 16px 10px;background:#fff;box-shadow:0 1px 4px rgba(0,0,0,0.04);overflow:hidden}
.kpi-top{display:flex;align-items:center;gap:10px;margin-bottom:10px}
.kpi-icon{width:36px;height:36px;border-radius:50%;display:flex;align-items:center;justify-content:center;flex-shrink:0}
.kpi-lbl{font-size:9.5px;font-weight:700;color:#374151;text-transform:uppercase;letter-spacing:0.08em;line-height:1.3}
.kpi-val{font-size:19px;font-weight:900;margin-bottom:8px;letter-spacing:-0.02em}
.kpi-red{color:#DC2626}.kpi-green{color:#16A34A}.kpi-dark{color:#111}.kpi-orange{color:#F97316}
.kpi-ico-red{background:#FEF2F2}.kpi-ico-green{background:#F0FDF4}.kpi-ico-orange{background:#FFF7ED}
.tri-grid{display:grid;grid-template-columns:1fr 1fr 1fr;gap:12px;margin:0 28px 20px}
.ed-card{border:1.5px solid #E5E7EB;border-radius:12px;overflow:hidden;box-shadow:0 1px 4px rgba(0,0,0,0.04);display:flex;flex-direction:column}
.ed-hdr{display:flex;align-items:center;gap:8px;padding:11px 14px;border-bottom:1px solid #E5E7EB}
.ed-hdr-green{background:#F0FDF4}.ed-hdr-red{background:#FFF5F5}
.ed-ico{width:26px;height:26px;border-radius:7px;display:flex;align-items:center;justify-content:center}
.ed-ico-green{background:#DCFCE7}.ed-ico-red{background:#FEE2E2}
.ed-title{font-size:10px;font-weight:800;letter-spacing:0.12em;text-transform:uppercase}
.ed-title-green{color:#15803D}.ed-title-red{color:#991B1B}
.ed-row{display:flex;justify-content:space-between;align-items:center;padding:8px 14px;border-bottom:1px solid #F9FAFB;font-size:12px}
.ed-row:last-of-type{border-bottom:none}
.ed-row-name{color:#374151}.ed-row-amt{font-weight:600;color:#111}
.ed-total{display:flex;justify-content:space-between;padding:10px 14px;font-size:12px;font-weight:800;border-top:2px solid #E5E7EB;margin-top:auto}
.ed-total-green{background:#F0FDF4;color:#15803D}.ed-total-red{background:#FFF5F5;color:#991B1B}
.breakdown-card{border:1.5px solid #E5E7EB;border-radius:12px;overflow:hidden;box-shadow:0 1px 4px rgba(0,0,0,0.04)}
.breakdown-hdr{padding:11px 14px;border-bottom:1px solid #E5E7EB;font-size:10px;font-weight:800;letter-spacing:0.12em;text-transform:uppercase;color:#374151;background:#FAFAFA}
.breakdown-body{padding:14px;display:flex;flex-direction:column;align-items:center;gap:10px}
.pie-legend{width:100%;display:flex;flex-direction:column;gap:5px}
.pie-row{display:flex;align-items:center;justify-content:space-between;gap:6px}
.pie-dot{width:9px;height:9px;border-radius:50%;flex-shrink:0}
.pie-name{font-size:10.5px;color:#374151;flex:1}
.pie-pct{font-size:10.5px;font-weight:700;color:#111}
.bot-grid{display:grid;grid-template-columns:1fr 1fr 1fr;gap:12px;margin:0 28px 20px}
.bot-card{border:1.5px solid #E5E7EB;border-radius:12px;overflow:hidden;box-shadow:0 1px 4px rgba(0,0,0,0.04)}
.bot-hdr{display:flex;align-items:center;gap:8px;padding:11px 14px;border-bottom:1px solid #E5E7EB;background:#EFF6FF}
.bot-hdr-ico{width:24px;height:24px;border-radius:7px;background:#DBEAFE;display:flex;align-items:center;justify-content:center}
.bot-hdr-title{font-size:10px;font-weight:800;letter-spacing:0.12em;text-transform:uppercase;color:#1D4ED8}
.bot-row{display:flex;justify-content:space-between;align-items:center;padding:9px 14px;border-bottom:1px solid #F9FAFB}
.bot-row:last-child{border-bottom:none}
.bot-lbl-wrap{display:flex;align-items:center;gap:8px}
.bot-ico{width:22px;height:22px;border-radius:6px;background:#EFF6FF;display:flex;align-items:center;justify-content:center;flex-shrink:0}
.bot-lbl{font-size:11.5px;color:#374151}
.bot-val{font-size:11.5px;font-weight:700;color:#111}
.secure-card{border:1.5px solid #E5E7EB;border-radius:12px;padding:16px;box-shadow:0 1px 4px rgba(0,0,0,0.04);display:flex;flex-direction:column;align-items:center;gap:12px;background:#fff}
.secure-icon{width:42px;height:42px;border-radius:50%;background:#EFF6FF;display:flex;align-items:center;justify-content:center}
.secure-title{font-size:12px;font-weight:800;color:#111;text-align:center}
.secure-desc{font-size:10.5px;color:#6B7280;text-align:center;line-height:1.6}
.qr-wrap{display:flex;flex-direction:column;align-items:center;gap:5px}
.qr-label{font-size:10px;color:#9CA3AF;text-align:center;line-height:1.5}
.footer{display:grid;grid-template-columns:1.4fr 1fr 1fr;gap:20px;padding:18px 28px;border-top:1px solid #F3F4F6;align-items:center}
.footer-disc{display:flex;align-items:flex-start;gap:10px}
.footer-shield{width:32px;height:32px;border-radius:50%;background:#FEF2F2;display:flex;align-items:center;justify-content:center;flex-shrink:0}
.footer-disc-text{font-size:10px;color:#9CA3AF;line-height:1.8}
.sig{text-align:center}
.sig-name{font-family:'Dancing Script',cursive;font-size:22px;color:#374151;margin-bottom:5px;line-height:1}
.sig-line{height:1px;background:#D1D5DB;margin-bottom:6px}
.sig-role{font-size:11px;font-weight:700;color:#374151}
.sig-co{font-size:10px;color:#9CA3AF;margin-top:2px}
.sig-check{display:inline-flex;align-items:center;gap:4px;margin-top:5px;background:#F0FDF4;color:#16A34A;font-size:10px;font-weight:700;padding:3px 10px;border-radius:99px;border:1px solid #DCFCE7}
@media print{body{background:#fff}.topbar{display:none}.page{margin:0;max-width:100%;box-shadow:none;border-radius:0;border:none}.page:not(:last-child){page-break-after:always}}
</style>
</head>
<body>
<div class="topbar">
  <div class="topbar-dot"></div>
  <span class="topbar-text">${topbarText}</span>
  <button class="dl-btn" id="dl-btn" onclick="downloadPDF()">
    <svg id="dl-icon" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>
    <span id="dl-label">Download / Print</span>
  </button>
</div>
${cardsHtml}
<script>
function downloadPDF(){
  window.print();
}
</script>
</body>
</html>`)
      win.document.close()
    }
  }

  const SUMMARY = [
    { label: "Total Payroll",    value: fmtK(totalFinal), sub: `${paidCount} of ${rows.length} paid`,    color: "#E53935", bg: "#FFF5F5", idx: 0 },
    { label: "Total OT Pay",     value: fmtK(totalOT),    sub: `${rows.filter(r => r.otPay > 0).length} with OT`,   color: "#F97316", bg: "#FFF7ED", idx: 1 },
    { label: "Total Deductions", value: fmtK(totalDed),   sub: `${rows.filter(r => r.deduction > 0).length} deducted`, color: "#8B5CF6", bg: "#FAF5FF", idx: 2 },
    { label: "Team Members",     value: `${rows.length}`, sub: `${monthName}`,                            color: "#3B82F6", bg: "#EFF6FF", idx: 3 },
  ]

  const hasPreCheckIssues = pendingCollabCount > 0 || pendingLeaveCount > 0 || pendingUpdateCount > 0

  return (
    <div style={{ padding: "20px 24px", maxWidth: 1400, margin: "0 auto" }}>
      {toastEl}

      {/* ── Pre-Payroll Checklist Banner ── */}
      {hasPreCheckIssues && (
        <div style={{
          marginBottom: 16, padding: "14px 20px",
          borderRadius: 16, background: "#FFFBEB",
          border: "1.5px solid #FDE68A",
          display: "flex", alignItems: "flex-start", gap: 14,
        }}>
          <span style={{ fontSize: 22, flexShrink: 0 }}>⚠️</span>
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: 13, fontWeight: 800, color: "#92400E", marginBottom: 6 }}>
              Pre-Payroll Checklist — Resolve before running payroll
            </div>
            <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
              {pendingCollabCount > 0 && (
                <span style={{ fontSize: 11, fontWeight: 700, padding: "4px 12px", borderRadius: 20, background: "#FEF3C7", color: "#92400E" }}>
                  🤝 {pendingCollabCount} collab confirmation{pendingCollabCount > 1 ? "s" : ""} pending
                </span>
              )}
              {pendingLeaveCount > 0 && (
                <span style={{ fontSize: 11, fontWeight: 700, padding: "4px 12px", borderRadius: 20, background: "#FEF3C7", color: "#92400E" }}>
                  🏖 {pendingLeaveCount} leave request{pendingLeaveCount > 1 ? "s" : ""} pending
                </span>
              )}
              {pendingUpdateCount > 0 && (
                <button onClick={() => setShowMissingDetail(v => !v)}
                  style={{ fontSize: 11, fontWeight: 700, padding: "4px 12px", borderRadius: 20, background: "#FEF3C7", color: "#92400E", border: "none", cursor: "pointer" }}>
                  📝 {pendingUpdateCount} member{pendingUpdateCount > 1 ? "s" : ""} with missing work updates {showMissingDetail ? "▲" : "▼"}
                </button>
              )}
            </div>
            {showMissingDetail && pendingUpdateCount > 0 && (
              <div style={{ marginTop: 10, display: "flex", flexDirection: "column", gap: 6 }}>
                {rows.filter(r => r.missingUpdateDates.length > 0).map(r => (
                  <div key={r.id} style={{ fontSize: 11, color: "#78350F" }}>
                    <strong>{r.name}</strong> — {r.missingUpdateDates.map(d => new Date(d + "T12:00:00").toLocaleDateString("en-IN", { day: "numeric", month: "short" })).join(", ")}
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {/* ── Confirm Run Payroll Modal ── */}
      {showConfirm && (
        <div style={{
          position: "fixed", inset: 0, background: "rgba(0,0,0,0.5)", zIndex: 1000,
          display: "flex", alignItems: "center", justifyContent: "center", padding: 24,
        }}>
          <div style={{ background: "#fff", borderRadius: 22, padding: "32px 36px", maxWidth: 420, width: "100%", boxShadow: "0 20px 60px rgba(0,0,0,0.3)" }}>
            <div style={{ fontSize: 36, textAlign: "center", marginBottom: 16 }}>💰</div>
            <h2 style={{ fontSize: 20, fontWeight: 900, color: "#111", textAlign: "center", margin: "0 0 8px", fontFamily: "var(--font-jakarta)" }}>
              Run Payroll
            </h2>
            <p style={{ fontSize: 13, color: "#1E3A5F", textAlign: "center", margin: "0 0 20px", lineHeight: 1.6 }}>
              Mark <strong>{unpaidRows.length} employee{unpaidRows.length !== 1 ? "s" : ""}</strong> as paid for <strong>{monthName}</strong>?<br />
              Total payout: <strong style={{ color: "#16A34A" }}>{fmt(unpaidRows.reduce((s, r) => s + r.finalNetPay, 0))}</strong>
            </p>
            <div style={{ display: "flex", gap: 10 }}>
              <button
                onClick={() => setShowConfirm(false)}
                style={{ flex: 1, padding: "12px", borderRadius: 12, border: "1.5px solid #E5E7EB", background: "#F9FAFB", fontSize: 13, fontWeight: 700, color: "#1E3A5F", cursor: "pointer" }}
              >
                Cancel
              </button>
              <button
                onClick={confirmRunPayroll}
                style={{ flex: 1, padding: "12px", borderRadius: 12, border: "none", background: "linear-gradient(135deg, #16A34A, #15803D)", fontSize: 13, fontWeight: 700, color: "#fff", cursor: "pointer", boxShadow: "0 4px 16px rgba(22,163,74,0.35)" }}
              >
                Confirm &amp; Pay All
              </button>
            </div>
          </div>
        </div>
      )}

      {showBulkConfirm && (() => {
        const selectedRows = rows.filter(r => selectedIds.has(r.id) && !r.isPaid)
        return (
          <div style={{
            position: "fixed", inset: 0, background: "rgba(0,0,0,0.5)", zIndex: 1000,
            display: "flex", alignItems: "center", justifyContent: "center", padding: 24,
          }}>
            <div style={{ background: "#fff", borderRadius: 22, padding: "32px 36px", maxWidth: 420, width: "100%", boxShadow: "0 20px 60px rgba(0,0,0,0.3)" }}>
              <div style={{ fontSize: 36, textAlign: "center", marginBottom: 16 }}>✅</div>
              <h2 style={{ fontSize: 20, fontWeight: 900, color: "#111", textAlign: "center", margin: "0 0 8px", fontFamily: "var(--font-jakarta)" }}>
                Mark Selected as Paid
              </h2>
              <p style={{ fontSize: 13, color: "#1E3A5F", textAlign: "center", margin: "0 0 20px", lineHeight: 1.6 }}>
                Mark <strong>{selectedRows.length} employee{selectedRows.length !== 1 ? "s" : ""}</strong> as paid for <strong>{monthName}</strong>?<br />
                Total payout: <strong style={{ color: "#16A34A" }}>{fmt(selectedRows.reduce((s, r) => s + r.finalNetPay, 0))}</strong>
              </p>
              <div style={{ display: "flex", gap: 10 }}>
                <button
                  onClick={() => setShowBulkConfirm(false)}
                  style={{ flex: 1, padding: "12px", borderRadius: 12, border: "1.5px solid #E5E7EB", background: "#F9FAFB", fontSize: 13, fontWeight: 700, color: "#1E3A5F", cursor: "pointer" }}
                >
                  Cancel
                </button>
                <button
                  onClick={confirmBulkMarkPaid}
                  style={{ flex: 1, padding: "12px", borderRadius: 12, border: "none", background: "linear-gradient(135deg, #16A34A, #15803D)", fontSize: 13, fontWeight: 700, color: "#fff", cursor: "pointer", boxShadow: "0 4px 16px rgba(22,163,74,0.35)" }}
                >
                  Confirm &amp; Mark Paid
                </button>
              </div>
            </div>
          </div>
        )
      })()}

      {showSettings && (
        <div style={{
          position: "fixed", inset: 0, background: "rgba(0,0,0,0.5)", zIndex: 1000,
          display: "flex", alignItems: "center", justifyContent: "center", padding: 24,
        }}>
          <div style={{ background: "#fff", borderRadius: 22, padding: "28px 32px", maxWidth: 480, width: "100%", maxHeight: "90vh", overflowY: "auto", boxShadow: "0 20px 60px rgba(0,0,0,0.3)" }}>
            <h2 style={{ fontSize: 18, fontWeight: 900, color: "#111", margin: "0 0 4px", fontFamily: "var(--font-jakarta)" }}>
              Payroll Settings
            </h2>
            <p style={{ fontSize: 12, color: "#1E3A5F", margin: "0 0 20px" }}>
              Changes apply from the next calculation onward — past paid months are not recalculated.
            </p>

            <p style={{ fontSize: 11, fontWeight: 800, color: "#1E3A5F", textTransform: "uppercase", letterSpacing: "0.05em", margin: "0 0 8px" }}>Attendance Rules</p>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, marginBottom: 18 }}>
              {([
                ["half_day_threshold_hrs", "Half-Day Threshold (hrs)"],
                ["salary_basis_days", "Salary Basis (days/month)"],
              ] as const).map(([key, label]) => (
                <label key={key} style={{ display: "block" }}>
                  <span style={{ fontSize: 11, fontWeight: 600, color: "#1E3A5F", display: "block", marginBottom: 4 }}>{label}</span>
                  <input type="number" step="0.1" value={settingsForm[key]}
                    onChange={e => setSettingsForm(prev => ({ ...prev, [key]: Number(e.target.value) }))}
                    style={{ width: "100%", padding: "9px 10px", borderRadius: 10, border: "1.5px solid #E5E7EB", fontSize: 13 }} />
                </label>
              ))}
            </div>

            <p style={{ fontSize: 11, fontWeight: 800, color: "#1E3A5F", textTransform: "uppercase", letterSpacing: "0.05em", margin: "0 0 8px" }}>Salary Breakdown (payslip only)</p>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, marginBottom: 6 }}>
              {([
                ["basic_pct", "Basic (% of gross)"],
                ["hra_pct", "HRA (% of basic)"],
                ["travel_pct", "Travel (% of gross)"],
                ["medical_pct", "Medical (% of gross)"],
              ] as const).map(([key, label]) => (
                <label key={key} style={{ display: "block" }}>
                  <span style={{ fontSize: 11, fontWeight: 600, color: "#1E3A5F", display: "block", marginBottom: 4 }}>{label}</span>
                  <input type="number" step="0.5" value={settingsForm[key]}
                    onChange={e => setSettingsForm(prev => ({ ...prev, [key]: Number(e.target.value) }))}
                    style={{ width: "100%", padding: "9px 10px", borderRadius: 10, border: "1.5px solid #E5E7EB", fontSize: 13 }} />
                </label>
              ))}
            </div>
            <p style={{ fontSize: 11, color: "#1E3A5F", margin: "0 0 20px" }}>
              Whatever remains of gross salary after Basic + Travel + Medical is deducted shows on the payslip as &quot;Other Allowance&quot;.
            </p>

            <div style={{ display: "flex", gap: 10 }}>
              <button
                onClick={() => setShowSettings(false)}
                style={{ flex: 1, padding: "12px", borderRadius: 12, border: "1.5px solid #E5E7EB", background: "#F9FAFB", fontSize: 13, fontWeight: 700, color: "#1E3A5F", cursor: "pointer" }}
              >
                Cancel
              </button>
              <button
                onClick={handleSaveSettings}
                disabled={isSavingSettings}
                style={{ flex: 1, padding: "12px", borderRadius: 12, border: "none", background: "linear-gradient(135deg, #16A34A, #15803D)", fontSize: 13, fontWeight: 700, color: "#fff", cursor: isSavingSettings ? "wait" : "pointer", boxShadow: "0 4px 16px rgba(22,163,74,0.35)" }}
              >
                {isSavingSettings ? "Saving…" : "Save Settings"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Page header ── */}
      <div style={{
        marginBottom: 20,
      }}>
        <PageHero
          title="Payroll"
          subtitle="Monthly salary breakdown for your team"
          actions={
            <>
              <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "9px 16px", borderRadius: 12, background: "#fff", border: "1.5px solid #E5E7EB" }}>
                <span style={{ fontSize: 14 }}>📅</span>
                <span style={{ fontSize: 13, fontWeight: 600, color: "#111" }}>{monthName}</span>
                <button onClick={() => changeMonth(-1)} style={{ background: "none", border: "none", cursor: "pointer", color: "#1E3A5F", fontSize: 18, lineHeight: 1, padding: "0 2px" }}>‹</button>
                <button onClick={() => changeMonth(1)}  style={{ background: "none", border: "none", cursor: "pointer", color: "#1E3A5F", fontSize: 18, lineHeight: 1, padding: "0 2px" }}>›</button>
              </div>
              <button
                onClick={handleRunPayroll}
                disabled={isRunning || unpaidRows.length === 0}
                style={{
                  display: "flex", alignItems: "center", gap: 8,
                  padding: "10px 22px", borderRadius: 12,
                  background: unpaidRows.length === 0
                    ? "rgba(255,255,255,0.15)"
                    : "linear-gradient(135deg, #16A34A, #15803D)",
                  color: "#fff", border: "none", cursor: unpaidRows.length === 0 ? "default" : "pointer",
                  fontSize: 13, fontWeight: 700,
                  boxShadow: unpaidRows.length === 0 ? "none" : "0 4px 18px rgba(22,163,74,0.45)",
                  opacity: isRunning ? 0.7 : 1,
                }}
              >
                {isRunning
                  ? "Processing…"
                  : unpaidRows.length === 0
                    ? <><CheckCircle2 size={14} /> All Paid</>
                    : <><Zap size={14} /> Run Payroll ({unpaidRows.length})</>}
              </button>
            </>
          }
        />
      </div>

      {/* ── 2-col layout ── */}
      <div className="grid grid-cols-1 lg:grid-cols-[1fr_284px] gap-5">

        {/* ════ LEFT: Main content ════ */}
        <div style={{ display: "flex", flexDirection: "column", gap: 18 }}>

          {/* Hero Banner */}
          <div className="grid grid-cols-1 md:grid-cols-[55%_45%]" style={{
            borderRadius: 22, overflow: "hidden",
            background: "linear-gradient(135deg, #DE1A1A 0%, #8B1212 55%, #1A0808 100%)",
            boxShadow: "0 8px 40px rgba(180,0,0,0.4)", minHeight: 210,
            position: "relative",
          }}>
            <div style={{ position: "absolute", top: -40, left: -30, width: 200, height: 200, borderRadius: "50%", background: "rgba(255,255,255,0.05)", pointerEvents: "none" }} />
            <div style={{ position: "relative", minHeight: 210, zIndex: 1 }}>
              <Image
                src="/brand/payroll/hero-finance.png"
                alt="Payroll Hero"
                fill
                style={{ objectFit: "cover", objectPosition: "center top", opacity: 0.85 }}
              />
            </div>
            <div className="grid grid-cols-2" style={{ padding: "18px 20px", gap: 12, alignContent: "start", position: "relative", zIndex: 1 }}>
              {[
                { label: "Salary Processed", value: `${processedPct}%`,    sub: fmt(totalFinal > 0 ? totalFinal : 0), icon: "💰", color: "#6EE7B7" },
                { label: "Paid This Month",  value: `${paidCount}`,         sub: "Employees paid",                    icon: "✅", color: "#6EE7B7" },
                { label: "OT & Bonus",       value: fmtK(totalOT),          sub: "Overtime pay",                      icon: "🎁", color: "#C4B5FD" },
                { label: "Pending Salaries", value: `${unpaidRows.length}`, sub: "Not yet paid",                      icon: "⏳", color: "#FACC15" },
              ].map((s) => (
                <div key={s.label} style={{
                  background: "rgba(255,255,255,0.12)", backdropFilter: "blur(12px)",
                  borderRadius: 16, padding: "13px 14px",
                  border: "1px solid rgba(255,255,255,0.2)",
                }}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 5 }}>
                    <span style={{ fontSize: 10, color: "rgba(255,255,255,0.75)", fontWeight: 600 }}>{s.label}</span>
                    <span style={{ fontSize: 20 }}>{s.icon}</span>
                  </div>
                  <div style={{ fontSize: 24, fontWeight: 900, color: s.color, fontFamily: "var(--font-jakarta)", lineHeight: 1, marginBottom: 4 }}>{s.value}</div>
                  <div style={{ fontSize: 10, color: "rgba(255,255,255,0.6)" }}>{s.sub}</div>
                </div>
              ))}
            </div>
          </div>

          {/* 4 Summary Cards */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-4">
            {SUMMARY.map((card) => (
              <div key={card.label} style={{
                borderRadius: 18, background: card.bg,
                border: `1.5px solid ${card.color}25`,
                padding: "17px 18px",
                boxShadow: "0 2px 12px rgba(0,0,0,0.04)",
              }}>
                <div style={{ fontSize: 10, fontWeight: 700, color: "#1E3A5F", textTransform: "uppercase", letterSpacing: "0.1em", marginBottom: 8 }}>
                  {card.label}
                </div>
                <div style={{ fontSize: 22, fontWeight: 900, color: card.color, fontFamily: "var(--font-jakarta)", lineHeight: 1, marginBottom: 4 }}>
                  {card.value}
                </div>
                <div style={{ fontSize: 10, color: "#1E3A5F", marginBottom: 8 }}>{card.sub}</div>
                <MiniSparkline color={card.color} idx={card.idx} />
              </div>
            ))}
          </div>

          {/* ── Salary Date Banner ── */}
          <div style={{
            display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: 12,
            padding: "14px 20px", borderRadius: 16,
            background: nextSalaryDaysLeft <= 2
              ? "linear-gradient(135deg, #FEF3C7, #FDE68A)"
              : "linear-gradient(135deg, #F0FDF4, #DCFCE7)",
            border: nextSalaryDaysLeft <= 2 ? "1.5px solid #FCD34D" : "1.5px solid #86EFAC",
          }}>
            <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
              <div style={{
                width: 40, height: 40, borderRadius: 12, flexShrink: 0, display: "flex", alignItems: "center", justifyContent: "center",
                background: nextSalaryDaysLeft <= 2 ? "#FDE68A" : "#DCFCE7",
                border: nextSalaryDaysLeft <= 2 ? "1.5px solid #FCD34D" : "1.5px solid #86EFAC",
              }}>
                <FileText size={18} style={{ color: nextSalaryDaysLeft <= 2 ? "#D97706" : "#16A34A" }} />
              </div>
              <div>
                <p style={{ fontSize: 13, fontWeight: 800, color: "#111111", margin: 0 }}>
                  Next Salary Date — <span style={{ color: nextSalaryDaysLeft <= 2 ? "#D97706" : "#16A34A" }}>5th of every month</span>
                </p>
                <p style={{ fontSize: 11, color: "#1E3A5F", margin: 0 }}>
                  Upcoming: {nextSalaryLabel}
                </p>
              </div>
            </div>
            <div style={{
              display: "flex", alignItems: "center", gap: 8, padding: "8px 16px", borderRadius: 99,
              background: nextSalaryDaysLeft <= 2 ? "#FCD34D" : "#22C55E",
              color: nextSalaryDaysLeft <= 2 ? "#78350F" : "#fff",
            }}>
              <Clock size={13} />
              <span style={{ fontSize: 12, fontWeight: 800 }}>
                {nextSalaryDaysLeft === 0 ? "Due today!" : nextSalaryDaysLeft === 1 ? "Due tomorrow!" : `${nextSalaryDaysLeft} days left`}
              </span>
            </div>
          </div>

          {/* Employee Payroll Cards */}
          <div>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12, flexWrap: "wrap", gap: 10 }}>
              <h2 style={{ fontSize: 17, fontWeight: 800, color: "#111", margin: 0, fontFamily: "var(--font-jakarta)" }}>
                Employee Payroll
              </h2>
              {selectMode ? (
                <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                  <span style={{ fontSize: 12, fontWeight: 700, color: "#1E3A5F" }}>{selectedIds.size} selected</span>
                  <button onClick={handleBulkMarkPaid} disabled={selectedIds.size === 0 || isBulkRunning} style={{
                    padding: "7px 16px", borderRadius: 10, border: "none",
                    background: selectedIds.size === 0 ? "#E5E7EB" : "linear-gradient(135deg, #16A34A, #15803D)",
                    color: selectedIds.size === 0 ? "#1E3A5F" : "#fff",
                    fontSize: 12, fontWeight: 700, cursor: selectedIds.size === 0 ? "not-allowed" : "pointer",
                  }}>
                    {isBulkRunning ? "Marking…" : "Mark Selected as Paid"}
                  </button>
                </div>
              ) : (
                <span style={{ fontSize: 12, color: "#1E3A5F" }}>
                  {paidCount} paid · {unpaidRows.length} pending
                </span>
              )}
            </div>

            {rows.length === 0 ? (
              <div style={{ textAlign: "center", padding: "56px 0", borderRadius: 22, background: "#FAFAFA", border: "1.5px solid #E5E7EB" }}>
                <div style={{ fontSize: 40, marginBottom: 12 }}>👥</div>
                <p style={{ fontSize: 14, fontWeight: 600, color: "#1E3A5F", margin: 0 }}>No active members found</p>
                <p style={{ fontSize: 12, color: "#1E3A5F", marginTop: 4 }}>Add team members to process payroll</p>
              </div>
            ) : (
              <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                {rows.map((r) => (
                  <EmployeeCard
                    key={r.id}
                    r={r}
                    month={month}
                    isExpanded={expandedId === r.id}
                    onToggle={() => setExpandedId(expandedId === r.id ? null : r.id)}
                    onDownloadReport={() => handleGenerateReport([r])}
                    selectMode={selectMode}
                    selected={selectedIds.has(r.id)}
                    onToggleSelect={() => toggleSelectId(r.id)}
                    teams={teams}
                  />
                ))}
              </div>
            )}
          </div>

        </div>

        {/* ════ RIGHT: Sidebar ════ */}
        <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>

          {/* Salary Health */}
          <div style={{ borderRadius: 20, background: "#fff", border: "1.5px solid #EBEBEB", padding: "20px", boxShadow: "0 2px 12px rgba(0,0,0,0.04)" }}>
            <h3 style={{ fontSize: 14, fontWeight: 800, color: "#111", margin: "0 0 2px", fontFamily: "var(--font-jakarta)" }}>Salary Health</h3>
            <p style={{ fontSize: 11, color: "#1E3A5F", margin: "0 0 16px" }}>Payroll processing status</p>
            <SalaryHealthDonut pct={processedPct} />
            <p style={{ fontSize: 11, color: processedPct === 100 ? "#16A34A" : "#F59E0B", fontWeight: 700, textAlign: "center", margin: "12px 0 0" }}>
              {processedPct === 100 ? "✓ All employees paid" : `${paidCount} of ${configuredCount} paid`}
            </p>
          </div>

          {/* Finance Reminder */}
          <div style={{ borderRadius: 20, background: "#fff", border: "1.5px solid #EBEBEB", padding: "16px", boxShadow: "0 2px 12px rgba(0,0,0,0.04)" }}>
            <h3 style={{ fontSize: 13, fontWeight: 800, color: "#111", margin: "0 0 12px", fontFamily: "var(--font-jakarta)" }}>Finance Reminder</h3>
            <div style={{ position: "relative", height: 130, borderRadius: 14, overflow: "hidden", background: "linear-gradient(135deg, #FFF8F0, #FFF3E8)", marginBottom: 14 }}>
              <Image src="/brand/payroll/finance-boy.png" alt="Finance" fill style={{ objectFit: "contain", objectPosition: "center" }} />
            </div>
            <div style={{ textAlign: "center" }}>
              <p style={{ fontSize: 13, fontWeight: 700, color: "#111", margin: "0 0 2px" }}>Salary payout in</p>
              <p style={{ fontSize: 26, fontWeight: 900, color: "#E53935", fontFamily: "var(--font-jakarta)", margin: "0 0 4px", lineHeight: 1.1 }}>
                {daysLeft} days 🚀
              </p>
              <p style={{ fontSize: 11, color: "#1E3A5F", margin: "0 0 14px" }}>Due 3rd {payMonthName} · Process before then.</p>
              <button
                onClick={handleRunPayroll}
                disabled={isRunning || unpaidRows.length === 0}
                style={{
                  width: "100%", padding: "11px", borderRadius: 12,
                  background: unpaidRows.length === 0
                    ? "#F0FDF4"
                    : "linear-gradient(135deg, #E53935, #B71C1C)",
                  color: unpaidRows.length === 0 ? "#16A34A" : "#fff",
                  border: unpaidRows.length === 0 ? "1.5px solid #BBF7D0" : "none",
                  fontSize: 13, fontWeight: 700, cursor: unpaidRows.length === 0 ? "default" : "pointer",
                  boxShadow: unpaidRows.length === 0 ? "none" : "0 4px 16px rgba(229,57,53,0.3)",
                }}
              >
                {unpaidRows.length === 0 ? "✓ All Paid" : "Process Payroll"}
              </button>
            </div>
          </div>

          {/* Quick Actions */}
          <div style={{ borderRadius: 20, background: "#fff", border: "1.5px solid #EBEBEB", padding: "18px 20px", boxShadow: "0 2px 12px rgba(0,0,0,0.04)" }}>
            <h3 style={{ fontSize: 13, fontWeight: 800, color: "#111", margin: "0 0 14px", fontFamily: "var(--font-jakarta)" }}>Quick Actions</h3>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
              {[
                { emoji: "📄", label: "Generate Payslip", action: handleBulkPayslip, active: false },
                { emoji: "📋", label: selectMode ? "Cancel Select" : "Bulk Update", action: handleToggleSelectMode, active: selectMode },
                { emoji: "⚙️", label: "Payroll Settings", action: handleOpenSettings, active: false },
                { emoji: "📊", label: "Reports", action: () => handleGenerateReport(), active: false },
              ].map((action) => (
                <button key={action.label} onClick={action.action} style={{
                  padding: "12px 8px", borderRadius: 14,
                  background: action.active ? "rgba(229,57,53,0.08)" : "#F9FAFB",
                  border: action.active ? "1.5px solid rgba(229,57,53,0.3)" : "1.5px solid #EBEBEB",
                  cursor: "pointer",
                  display: "flex", flexDirection: "column", alignItems: "center", gap: 7,
                }}>
                  <span style={{ fontSize: 22 }}>{action.emoji}</span>
                  <span style={{ fontSize: 10, fontWeight: 600, color: action.active ? "#E53935" : "#1E3A5F", textAlign: "center" }}>{action.label}</span>
                </button>
              ))}
            </div>
          </div>

        </div>
      </div>
    </div>
  )
}
