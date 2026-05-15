"use client"

import { useState } from "react"
import Image from "next/image"
import { useRouter, usePathname } from "next/navigation"
import { ChevronDown, ChevronUp, FileText } from "lucide-react"

type PayrollRow = {
  id: string; name: string; employee_id: string; team: string | null
  employment_type: string
  presentDays: number; absentDays: number; paidLeaveDays: number; deductibleAbsent: number
  totalHours: number; otHours: number
  basePay: number; deduction: number; otPay: number; netPay: number
  monthly_salary: number | null; hourly_rate: number | null
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
  return name.split(" ").map((n) => n[0]).join("").slice(0, 2).toUpperCase()
}

// ── Attendance Ring SVG ─────────────────────────────────────────────────────
function AttendanceRing({ pct, size = 60 }: { pct: number; size?: number }) {
  const r = size * 0.38, cx = size / 2, cy = size / 2
  const circ = 2 * Math.PI * r
  const filled = (Math.min(pct, 100) / 100) * circ
  const color = pct >= 80 ? "#16A34A" : pct >= 60 ? "#F59E0B" : "#E53935"
  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
      <circle cx={cx} cy={cy} r={r} fill="none" stroke="#F0F0F0" strokeWidth={size * 0.11} />
      <circle cx={cx} cy={cy} r={r} fill="none" stroke={color} strokeWidth={size * 0.11}
        strokeDasharray={`${filled} ${circ - filled}`} strokeLinecap="round"
        transform={`rotate(-90 ${cx} ${cy})`} />
      <text x={cx} y={cy + 1} textAnchor="middle" dominantBaseline="middle"
        fontSize={size * 0.21} fontWeight="900" fill="#111">{pct}%</text>
    </svg>
  )
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
      <text x={cx} y={cy + 10} textAnchor="middle" fontSize={10} fill="#9CA3AF">Salary</text>
      <text x={cx} y={cy + 23} textAnchor="middle" fontSize={10} fill="#9CA3AF">Processed</text>
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

// ── Mini Attendance Calendar ────────────────────────────────────────────────
function MiniCalendar({
  year, mon, presentDays, absentDays, paidLeaveDays,
}: { year: number; mon: number; presentDays: number; absentDays: number; paidLeaveDays: number }) {
  const daysInMonth = new Date(year, mon, 0).getDate()
  const firstDayOfWeek = new Date(year, mon - 1, 1).getDay()
  const startOffset = (firstDayOfWeek + 6) % 7 // Mon-first offset

  let workCount = 0
  const dayList: { num: number; status: "present" | "absent" | "leave" | "weekend" }[] = []
  for (let d = 1; d <= daysInMonth; d++) {
    const dow = new Date(year, mon - 1, d).getDay()
    const isWknd = dow === 0 || dow === 6
    if (isWknd) {
      dayList.push({ num: d, status: "weekend" })
    } else {
      workCount++
      if (workCount <= presentDays) dayList.push({ num: d, status: "present" })
      else if (workCount <= presentDays + paidLeaveDays) dayList.push({ num: d, status: "leave" })
      else dayList.push({ num: d, status: "absent" })
    }
  }

  const cells: ({ num: number; status: "present" | "absent" | "leave" | "weekend" } | null)[] = [
    ...Array(startOffset).fill(null),
    ...dayList,
  ]
  while (cells.length % 7 !== 0) cells.push(null)
  const weeks: typeof cells[] = []
  for (let i = 0; i < cells.length; i += 7) weeks.push(cells.slice(i, i + 7))

  const DAYS = ["M", "T", "W", "T", "F", "S", "S"]
  const clr = {
    present: { bg: "#DCFCE7", color: "#15803D" },
    absent:  { bg: "#FEE2E2", color: "#DC2626" },
    leave:   { bg: "#FEF3C7", color: "#D97706" },
    weekend: { bg: "#F3F4F6", color: "#9CA3AF" },
  }

  return (
    <div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(7, 1fr)", gap: 2, marginBottom: 4 }}>
        {DAYS.map((d, i) => (
          <div key={i} style={{ textAlign: "center", fontSize: 9, fontWeight: 700, color: "#9CA3AF" }}>{d}</div>
        ))}
      </div>
      {weeks.map((week, wi) => (
        <div key={wi} style={{ display: "grid", gridTemplateColumns: "repeat(7, 1fr)", gap: 2, marginBottom: 2 }}>
          {week.map((cell, di) => {
            if (!cell) return <div key={di} />
            const c = clr[cell.status]
            return (
              <div key={di} style={{ borderRadius: 5, padding: "3px 0", textAlign: "center", background: c.bg, fontSize: 9, fontWeight: 700, color: c.color }}>
                {cell.num}
              </div>
            )
          })}
        </div>
      ))}
      <div style={{ display: "flex", gap: 8, marginTop: 8, flexWrap: "wrap" }}>
        {[
          { color: "#15803D", label: `Present ${presentDays}` },
          { color: "#DC2626", label: `Absent ${absentDays}` },
          { color: "#D97706", label: `Leave ${paidLeaveDays}` },
          { color: "#9CA3AF", label: "Weekly Off 4" },
        ].map((item) => (
          <div key={item.label} style={{ display: "flex", alignItems: "center", gap: 4 }}>
            <span style={{ width: 7, height: 7, borderRadius: "50%", background: item.color, display: "inline-block" }} />
            <span style={{ fontSize: 9, color: "#6B7280" }}>{item.label}</span>
          </div>
        ))}
      </div>
    </div>
  )
}

// ── Team badge colours ──────────────────────────────────────────────────────
const TEAM_CLR: Record<string, { bg: string; color: string }> = {
  "Design Team":      { bg: "#EFF6FF", color: "#3B82F6" },
  "Marketing Team":   { bg: "#F0FDF4", color: "#16A34A" },
  "Sales Team":       { bg: "#FFF7ED", color: "#EA580C" },
  "Tech Team":        { bg: "#FAF5FF", color: "#9333EA" },
  "Technology & Operation": { bg: "#FAF5FF", color: "#9333EA" },
  "Operations Team":  { bg: "#FFF1F2", color: "#E11D48" },
}
const DEF_TEAM = { bg: "#F3F4F6", color: "#6B7280" }

// ── Expandable Employee Card ────────────────────────────────────────────────
function EmployeeCard({
  r, month, year, mon, workDays, isExpanded, onToggle,
}: {
  r: PayrollRow; month: string; year: number; mon: number; workDays: number
  isExpanded: boolean; onToggle: () => void
}) {
  const attendPct = workDays > 0 ? Math.round((r.presentDays / workDays) * 100) : 0
  const tClr = TEAM_CLR[r.team ?? ""] ?? DEF_TEAM

  return (
    <div style={{
      background: "#FFFFFF",
      borderRadius: 22,
      border: isExpanded ? "1.5px solid rgba(229,57,53,0.3)" : "1.5px solid #EBEBEB",
      boxShadow: isExpanded
        ? "0 8px 32px rgba(229,57,53,0.10), 0 2px 8px rgba(0,0,0,0.04)"
        : "0 2px 10px rgba(0,0,0,0.05)",
      overflow: "hidden",
      transition: "all 0.2s ease",
    }}>
      {/* ── Card header row ── */}
      <div style={{ padding: "16px 22px", display: "flex", alignItems: "center", gap: 18, flexWrap: "wrap" }}>

        {/* Avatar */}
        <div style={{
          width: 52, height: 52, borderRadius: "50%", flexShrink: 0,
          background: "linear-gradient(135deg, #E53935, #B71C1C)",
          display: "flex", alignItems: "center", justifyContent: "center",
          fontSize: 18, fontWeight: 900, color: "#fff",
          fontFamily: "var(--font-jakarta)",
          boxShadow: "0 4px 14px rgba(229,57,53,0.3)",
        }}>
          {getInitials(r.name)}
        </div>

        {/* Name + ID + badge */}
        <div style={{ minWidth: 150 }}>
          <div style={{ fontSize: 15, fontWeight: 800, color: "#111", fontFamily: "var(--font-jakarta)", marginBottom: 2 }}>
            {r.name}
          </div>
          <div style={{ fontSize: 11, color: "#9CA3AF", marginBottom: 5 }}>#{r.employee_id}</div>
          {r.team && (
            <span style={{ fontSize: 10, fontWeight: 700, padding: "3px 10px", borderRadius: 20, background: tClr.bg, color: tClr.color }}>
              {r.team}
            </span>
          )}
        </div>

        {/* Attendance donut */}
        <div style={{ flexShrink: 0, textAlign: "center" }}>
          <AttendanceRing pct={attendPct} size={54} />
          <div style={{ fontSize: 9, color: "#9CA3AF", marginTop: 2, fontWeight: 500 }}>Attendance</div>
        </div>

        {/* Salary chips */}
        <div style={{ flex: 1, display: "flex", gap: 8, justifyContent: "center", flexWrap: "wrap" }}>
          {[
            { label: "Base Salary", value: r.basePay > 0 ? fmt(r.basePay) : "—", color: "#111" },
            { label: "Deductions", value: r.deduction > 0 ? `-${fmt(r.deduction)}` : "—", color: "#DC2626" },
            { label: "OT Hours", value: `${r.otHours}h`, color: "#F97316" },
            { label: "Net Pay", value: r.netPay > 0 ? fmt(r.netPay) : "—", color: "#16A34A" },
          ].map((chip) => (
            <div key={chip.label} style={{
              textAlign: "center", padding: "8px 14px", borderRadius: 12,
              background: "#F9FAFB", border: "1px solid #F0F0F0", minWidth: 80,
            }}>
              <div style={{ fontSize: 10, color: "#9CA3AF", marginBottom: 3, fontWeight: 500 }}>{chip.label}</div>
              <div style={{ fontSize: 14, fontWeight: 900, color: chip.color, fontFamily: "var(--font-jakarta)" }}>{chip.value}</div>
            </div>
          ))}
        </div>

        {/* Actions */}
        <div style={{ display: "flex", alignItems: "center", gap: 8, flexShrink: 0 }}>
          <button
            onClick={onToggle}
            style={{
              padding: "8px 16px", borderRadius: 10, fontSize: 12, fontWeight: 700, cursor: "pointer",
              background: isExpanded ? "rgba(229,57,53,0.08)" : "#F9FAFB",
              color: isExpanded ? "#E53935" : "#374151",
              border: `1.5px solid ${isExpanded ? "rgba(229,57,53,0.25)" : "#E5E7EB"}`,
            }}
          >
            View Breakdown
          </button>
          <button
            onClick={onToggle}
            style={{ width: 34, height: 34, borderRadius: 9, display: "flex", alignItems: "center", justifyContent: "center", background: "#F9FAFB", border: "1.5px solid #E5E7EB", cursor: "pointer" }}
          >
            {isExpanded
              ? <ChevronUp size={15} style={{ color: "#6B7280" }} />
              : <ChevronDown size={15} style={{ color: "#6B7280" }} />}
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
        </div>
      </div>

      {/* ── Expanded panel ── */}
      {isExpanded && (
        <div className="grid grid-cols-1 md:grid-cols-3" style={{ borderTop: "1.5px solid #F5F5F5" }}>

          {/* LEFT: Payroll Breakdown bars */}
          <div style={{ padding: "22px 24px", borderRight: "1px solid #F5F5F5" }}>
            <div style={{ fontSize: 10, fontWeight: 800, color: "#9CA3AF", textTransform: "uppercase", letterSpacing: "0.13em", marginBottom: 18 }}>
              Payroll Breakdown
            </div>
            {[
              { label: "Base Salary", amount: r.basePay,    pct: 100,  color: "#16A34A" },
              { label: "OT Earnings", amount: r.otPay,      pct: r.basePay > 0 ? Math.min((r.otPay / r.basePay) * 100, 100) : 0,  color: "#F97316" },
              { label: "Bonus",       amount: 0,            pct: 0,    color: "#A855F7" },
              { label: "Deductions",  amount: -r.deduction, pct: r.basePay > 0 ? Math.min((r.deduction / r.basePay) * 100, 100) : 0, color: "#DC2626" },
              { label: "Tax (TDS)",   amount: -Math.round(r.deduction * 0.4), pct: r.basePay > 0 ? Math.min((r.deduction * 0.4 / r.basePay) * 100, 100) : 0, color: "#F43F5E" },
            ].map((item) => (
              <div key={item.label} style={{ marginBottom: 14 }}>
                <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 5 }}>
                  <span style={{ fontSize: 12, color: "#6B7280" }}>{item.label}</span>
                  <span style={{ fontSize: 12, fontWeight: 700, color: item.amount < 0 ? "#DC2626" : "#111" }}>
                    {item.amount === 0 ? "—" : item.amount < 0 ? `-${fmt(Math.abs(item.amount))}` : fmt(item.amount)}
                  </span>
                </div>
                <div style={{ height: 7, borderRadius: 4, background: "#F3F4F6" }}>
                  <div style={{ height: "100%", borderRadius: 4, width: `${item.pct}%`, background: item.color }} />
                </div>
              </div>
            ))}
            <div style={{ marginTop: 18, paddingTop: 14, borderTop: "1.5px solid #F0F0F0", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <span style={{ fontSize: 13, fontWeight: 700, color: "#111" }}>Net Pay</span>
              <span style={{ fontSize: 20, fontWeight: 900, color: "#16A34A", fontFamily: "var(--font-jakarta)" }}>{fmt(r.netPay)}</span>
            </div>
          </div>

          {/* CENTER: Attendance Calendar */}
          <div style={{ padding: "22px 24px", borderRight: "1px solid #F5F5F5" }}>
            <div style={{ fontSize: 10, fontWeight: 800, color: "#9CA3AF", textTransform: "uppercase", letterSpacing: "0.13em", marginBottom: 18 }}>
              {new Date(year, mon - 1).toLocaleString("en-IN", { month: "long", year: "numeric" })} Attendance
            </div>
            <MiniCalendar
              year={year} mon={mon}
              presentDays={r.presentDays}
              absentDays={r.absentDays}
              paidLeaveDays={r.paidLeaveDays}
            />
          </div>

          {/* RIGHT: Payroll Assistance image */}
          <div style={{ position: "relative", minHeight: 280, background: "linear-gradient(135deg, #FFF8F0, #FFF3E8)" }}>
            <Image
              src="/brand/payroll/payroll-assist.png"
              alt="Payroll Assistance"
              fill
              style={{ objectFit: "cover", objectPosition: "center" }}
            />
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
}: {
  rows: PayrollRow[]
  month: string
  workDays: number
}) {
  const router   = useRouter()
  const pathname = usePathname()
  const [expandedId, setExpandedId] = useState<string | null>(null)

  const [year, mon] = month.split("-").map(Number)
  const monthName   = new Date(year, mon - 1).toLocaleString("en-IN", { month: "long", year: "numeric" })
  const monthShort  = new Date(year, mon - 1).toLocaleString("en-IN", { month: "short" })

  const totalNet  = rows.reduce((s, r) => s + r.netPay,     0)
  const totalOT   = rows.reduce((s, r) => s + r.otPay,      0)
  const totalDed  = rows.reduce((s, r) => s + r.deduction,  0)
  const totalBase = rows.reduce((s, r) => s + r.basePay,    0)

  const configuredCount = rows.filter((r) => r.basePay > 0).length
  const processedPct    = rows.length > 0 ? Math.round((configuredCount / rows.length) * 100) : 0
  const pendingCount    = rows.filter((r) => r.basePay === 0).length

  const today      = new Date()
  const monthEnd   = new Date(year, mon, 0)
  const daysLeft   = Math.max(0, Math.ceil((monthEnd.getTime() - today.getTime()) / 86400000))

  function changeMonth(delta: number) {
    const d = new Date(year, mon - 1 + delta)
    const m = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`
    router.push(`${pathname}?month=${m}`)
  }

  const SUMMARY = [
    { label: "Total Payroll",    value: fmtK(totalNet),   sub: `${rows.filter(r => r.net > 0).length} paid`,   color: "#E53935", bg: "#FFF5F5", idx: 0 },
    { label: "Total OT Pay",     value: fmtK(totalOT),    sub: `${rows.filter(r => r.ot > 0).length} with OT`, color: "#F97316", bg: "#FFF7ED", idx: 1 },
    { label: "Total Deductions", value: fmtK(totalDed),   sub: `${rows.filter(r => r.deductions > 0).length} deducted`, color: "#8B5CF6", bg: "#FAF5FF", idx: 2 },
    { label: "Team Members",     value: `${rows.length}`, sub: `${monthName}`,                                  color: "#3B82F6", bg: "#EFF6FF", idx: 3 },
  ]

  return (
    <div style={{ padding: "20px 24px", maxWidth: 1400, margin: "0 auto" }}>

      {/* ── Page header ── */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 20, flexWrap: "wrap", gap: 12 }}>
        <div>
          <h1 style={{ fontSize: 30, fontWeight: 900, color: "#111", margin: 0, fontFamily: "var(--font-jakarta)" }}>Payroll</h1>
          <p style={{ fontSize: 13, color: "#9CA3AF", margin: "4px 0 0" }}>Monthly salary breakdown for your team</p>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "9px 16px", borderRadius: 12, background: "#fff", border: "1.5px solid #E5E7EB" }}>
            <span style={{ fontSize: 14 }}>📅</span>
            <span style={{ fontSize: 13, fontWeight: 600, color: "#111" }}>{monthName}</span>
            <button onClick={() => changeMonth(-1)} style={{ background: "none", border: "none", cursor: "pointer", color: "#9CA3AF", fontSize: 18, lineHeight: 1, padding: "0 2px" }}>‹</button>
            <button onClick={() => changeMonth(1)}  style={{ background: "none", border: "none", cursor: "pointer", color: "#9CA3AF", fontSize: 18, lineHeight: 1, padding: "0 2px" }}>›</button>
          </div>
          <button style={{
            display: "flex", alignItems: "center", gap: 8,
            padding: "10px 22px", borderRadius: 12,
            background: "linear-gradient(135deg, #E53935, #B71C1C)",
            color: "#fff", border: "none", cursor: "pointer",
            fontSize: 13, fontWeight: 700,
            boxShadow: "0 4px 18px rgba(229,57,53,0.35)",
          }}>
            ▶ Run Payroll
          </button>
        </div>
      </div>

      {/* ── 2-col layout ── */}
      <div className="grid grid-cols-1 lg:grid-cols-[1fr_284px] gap-5">

        {/* ════ LEFT: Main content ════ */}
        <div style={{ display: "flex", flexDirection: "column", gap: 18 }}>

          {/* Hero Banner */}
          <div className="grid grid-cols-1 md:grid-cols-[55%_45%]" style={{
            borderRadius: 22, overflow: "hidden",
            background: "linear-gradient(135deg, #FFF8F5, #FFF3EE)",
            border: "1.5px solid #FFE0D0", minHeight: 210,
          }}>
            <div style={{ position: "relative", minHeight: 210 }}>
              <Image
                src="/brand/payroll/hero-finance.png"
                alt="Payroll Hero"
                fill
                style={{ objectFit: "cover", objectPosition: "center top" }}
              />
            </div>
            <div className="grid grid-cols-2" style={{ padding: "18px 20px", gap: 12, alignContent: "start" }}>
              {[
                { label: "Salary Processed", value: `${processedPct}%`,    sub: fmt(totalBase > 0 ? totalNet : 0), icon: "💰", color: "#16A34A" },
                { label: "Pending Salaries", value: `${pendingCount}`,      sub: "Not configured",                  icon: "⏳", color: "#F97316" },
                { label: "OT & Bonus",       value: fmtK(totalOT),          sub: "+12% this month",                 icon: "🎁", color: "#8B5CF6" },
                { label: "Employee Count",   value: `${rows.length}`,       sub: "+2 this month",                   icon: "👥", color: "#3B82F6" },
              ].map((s) => (
                <div key={s.label} style={{
                  background: "rgba(255,255,255,0.88)", backdropFilter: "blur(12px)",
                  borderRadius: 16, padding: "13px 14px",
                  border: "1px solid rgba(255,255,255,0.8)",
                  boxShadow: "0 2px 14px rgba(0,0,0,0.05)",
                }}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 5 }}>
                    <span style={{ fontSize: 10, color: "#9CA3AF", fontWeight: 600 }}>{s.label}</span>
                    <span style={{ fontSize: 20 }}>{s.icon}</span>
                  </div>
                  <div style={{ fontSize: 24, fontWeight: 900, color: s.color, fontFamily: "var(--font-jakarta)", lineHeight: 1, marginBottom: 4 }}>{s.value}</div>
                  <div style={{ fontSize: 10, color: "#9CA3AF" }}>{s.sub}</div>
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
                <div style={{ fontSize: 10, fontWeight: 700, color: "#9CA3AF", textTransform: "uppercase", letterSpacing: "0.1em", marginBottom: 8 }}>
                  {card.label}
                </div>
                <div style={{ fontSize: 22, fontWeight: 900, color: card.color, fontFamily: "var(--font-jakarta)", lineHeight: 1, marginBottom: 4 }}>
                  {card.value}
                </div>
                <div style={{ fontSize: 10, color: "#9CA3AF", marginBottom: 8 }}>{card.sub}</div>
                <MiniSparkline color={card.color} idx={card.idx} />
              </div>
            ))}
          </div>

          {/* Employee Payroll Cards */}
          <div>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
              <h2 style={{ fontSize: 17, fontWeight: 800, color: "#111", margin: 0, fontFamily: "var(--font-jakarta)" }}>
                Employee Payroll
              </h2>
              <span style={{ fontSize: 12, color: "#9CA3AF" }}>{rows.length} member{rows.length !== 1 ? "s" : ""}</span>
            </div>

            {rows.length === 0 ? (
              <div style={{ textAlign: "center", padding: "56px 0", borderRadius: 22, background: "#FAFAFA", border: "1.5px solid #E5E7EB" }}>
                <div style={{ fontSize: 40, marginBottom: 12 }}>👥</div>
                <p style={{ fontSize: 14, fontWeight: 600, color: "#6B7280", margin: 0 }}>No active members found</p>
                <p style={{ fontSize: 12, color: "#9CA3AF", marginTop: 4 }}>Add team members to process payroll</p>
              </div>
            ) : (
              <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                {rows.map((r) => (
                  <EmployeeCard
                    key={r.id}
                    r={r}
                    month={month}
                    year={year}
                    mon={mon}
                    workDays={workDays}
                    isExpanded={expandedId === r.id}
                    onToggle={() => setExpandedId(expandedId === r.id ? null : r.id)}
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
            <p style={{ fontSize: 11, color: "#9CA3AF", margin: "0 0 16px" }}>Payroll processing status</p>
            <SalaryHealthDonut pct={processedPct} />
            <p style={{ fontSize: 11, color: "#16A34A", fontWeight: 700, textAlign: "center", margin: "12px 0 0" }}>
              ↑ 12% vs last month
            </p>
          </div>

          {/* Finance Reminder */}
          <div style={{ borderRadius: 20, background: "#fff", border: "1.5px solid #EBEBEB", padding: "16px", boxShadow: "0 2px 12px rgba(0,0,0,0.04)" }}>
            <h3 style={{ fontSize: 13, fontWeight: 800, color: "#111", margin: "0 0 12px", fontFamily: "var(--font-jakarta)" }}>Finance Reminder</h3>
            <div style={{ position: "relative", height: 130, borderRadius: 14, overflow: "hidden", background: "linear-gradient(135deg, #FFF8F0, #FFF3E8)", marginBottom: 14 }}>
              <Image src="/brand/payroll/finance-boy.png" alt="Finance" fill style={{ objectFit: "contain", objectPosition: "center" }} />
            </div>
            <div style={{ textAlign: "center" }}>
              <p style={{ fontSize: 13, fontWeight: 700, color: "#111", margin: "0 0 2px" }}>Payroll closes in</p>
              <p style={{ fontSize: 26, fontWeight: 900, color: "#E53935", fontFamily: "var(--font-jakarta)", margin: "0 0 4px", lineHeight: 1.1 }}>
                {daysLeft} days 🚀
              </p>
              <p style={{ fontSize: 11, color: "#9CA3AF", margin: "0 0 14px" }}>Complete the payroll to avoid delays.</p>
              <button style={{
                width: "100%", padding: "11px", borderRadius: 12,
                background: "linear-gradient(135deg, #E53935, #B71C1C)",
                color: "#fff", border: "none", fontSize: 13, fontWeight: 700, cursor: "pointer",
                boxShadow: "0 4px 16px rgba(229,57,53,0.3)",
              }}>
                Process Payroll
              </button>
            </div>
          </div>

          {/* Upcoming Payouts */}
          <div style={{ borderRadius: 20, background: "#fff", border: "1.5px solid #EBEBEB", padding: "18px 20px", boxShadow: "0 2px 12px rgba(0,0,0,0.04)" }}>
            <h3 style={{ fontSize: 13, fontWeight: 800, color: "#111", margin: "0 0 14px", fontFamily: "var(--font-jakarta)" }}>Upcoming Payouts</h3>
            {[
              { icon: "📅", label: "Salary Payout",  date: `31 ${monthShort} ${year}`, color: "#3B82F6" },
              { icon: "🎁", label: "Bonus Payout",    date: `05 June ${year}`,          color: "#8B5CF6" },
              { icon: "📊", label: "Reimbursement",   date: `07 June ${year}`,          color: "#F97316" },
            ].map((item, i) => (
              <div key={i} style={{
                display: "flex", alignItems: "center", gap: 12,
                paddingBottom: i < 2 ? 12 : 0, marginBottom: i < 2 ? 12 : 0,
                borderBottom: i < 2 ? "1px solid #F5F5F5" : "none",
              }}>
                <div style={{ width: 38, height: 38, borderRadius: 11, background: `${item.color}12`, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 18, flexShrink: 0, border: `1px solid ${item.color}20` }}>
                  {item.icon}
                </div>
                <div>
                  <div style={{ fontSize: 12, fontWeight: 700, color: "#111" }}>{item.label}</div>
                  <div style={{ fontSize: 10, color: "#9CA3AF" }}>{item.date}</div>
                </div>
              </div>
            ))}
            <button style={{ width: "100%", marginTop: 14, padding: "9px", borderRadius: 10, background: "#F9FAFB", border: "1.5px solid #E5E7EB", color: "#374151", fontSize: 12, fontWeight: 600, cursor: "pointer" }}>
              View Calendar
            </button>
          </div>

          {/* Quick Actions */}
          <div style={{ borderRadius: 20, background: "#fff", border: "1.5px solid #EBEBEB", padding: "18px 20px", boxShadow: "0 2px 12px rgba(0,0,0,0.04)" }}>
            <h3 style={{ fontSize: 13, fontWeight: 800, color: "#111", margin: "0 0 14px", fontFamily: "var(--font-jakarta)" }}>Quick Actions</h3>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
              {[
                { emoji: "📄", label: "Generate Payslip" },
                { emoji: "📋", label: "Bulk Update" },
                { emoji: "⚙️", label: "Payroll Settings" },
                { emoji: "📊", label: "Reports" },
              ].map((action) => (
                <button key={action.label} style={{
                  padding: "12px 8px", borderRadius: 14, background: "#F9FAFB",
                  border: "1.5px solid #EBEBEB", cursor: "pointer",
                  display: "flex", flexDirection: "column", alignItems: "center", gap: 7,
                  transition: "all 0.15s",
                }}>
                  <span style={{ fontSize: 22 }}>{action.emoji}</span>
                  <span style={{ fontSize: 10, fontWeight: 600, color: "#374151", textAlign: "center" }}>{action.label}</span>
                </button>
              ))}
            </div>
          </div>

        </div>
      </div>
    </div>
  )
}
