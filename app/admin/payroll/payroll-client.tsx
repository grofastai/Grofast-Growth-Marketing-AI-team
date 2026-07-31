"use client"

import { useState, useTransition } from "react"
import Image from "next/image"
import { useRouter, usePathname } from "next/navigation"
import { ChevronDown, ChevronUp, FileText, CheckCircle2, Clock, Zap } from "lucide-react"
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

type PayrollRow = {
  id: string; name: string; employee_id: string; team: string | null
  passport_photo_url: string | null
  employment_type: string
  presentDays: number; halfDays: number; absentDays: number; leaveDays: number
  missingUpdates: number; missingUpdateDates: string[]; deductibleDays: number
  totalHours: number; otHours: number; collabHours: number
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
  return name.split(" ").map((n) => n[0]).join("").slice(0, 2).toUpperCase()
}
function fmtDate(iso: string) {
  return new Date(iso).toLocaleDateString("en-IN", { day: "numeric", month: "short" })
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

// ── Mini Attendance Calendar ────────────────────────────────────────────────
function MiniCalendar({
  year, mon, presentDays, halfDays, absentDays, leaveDays,
}: { year: number; mon: number; presentDays: number; halfDays: number; absentDays: number; leaveDays: number }) {
  const daysInMonth = new Date(year, mon, 0).getDate()
  const firstDayOfWeek = new Date(year, mon - 1, 1).getDay()
  const startOffset = (firstDayOfWeek + 6) % 7

  let workCount = 0
  const dayList: { num: number; status: "present" | "half" | "absent" | "leave" | "weekend" }[] = []
  for (let d = 1; d <= daysInMonth; d++) {
    const dow = new Date(year, mon - 1, d).getDay()
    const isWknd = dow === 0 || dow === 6
    if (isWknd) {
      dayList.push({ num: d, status: "weekend" })
    } else {
      workCount++
      if (workCount <= presentDays) dayList.push({ num: d, status: "present" })
      else if (workCount <= presentDays + halfDays) dayList.push({ num: d, status: "half" })
      else if (workCount <= presentDays + halfDays + leaveDays) dayList.push({ num: d, status: "leave" })
      else dayList.push({ num: d, status: "absent" })
    }
  }

  const cells: ({ num: number; status: "present" | "half" | "absent" | "leave" | "weekend" } | null)[] = [
    ...Array(startOffset).fill(null),
    ...dayList,
  ]
  while (cells.length % 7 !== 0) cells.push(null)
  const weeks: typeof cells[] = []
  for (let i = 0; i < cells.length; i += 7) weeks.push(cells.slice(i, i + 7))

  const DAYS = ["M", "T", "W", "T", "F", "S", "S"]
  const clr = {
    present: { bg: "#DCFCE7", color: "#15803D" },
    half:    { bg: "#FEF9C3", color: "#CA8A04" },
    absent:  { bg: "#FEE2E2", color: "#DC2626" },
    leave:   { bg: "#E0F2FE", color: "#0369A1" },
    weekend: { bg: "#F3F4F6", color: "#9CA3AF" },
  }

  return (
    <div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(7, 1fr)", gap: 2, marginBottom: 4 }}>
        {DAYS.map((d, i) => (
          <div key={i} style={{ textAlign: "center", fontSize: 9, fontWeight: 700, color: "#1E3A5F" }}>{d}</div>
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
          { color: "#15803D", label: `Full ${presentDays}d` },
          { color: "#CA8A04", label: `Half ${halfDays}d` },
          { color: "#DC2626", label: `Absent ${absentDays}d` },
          { color: "#0369A1", label: `Leave ${leaveDays}d` },
        ].map((item) => (
          <div key={item.label} style={{ display: "flex", alignItems: "center", gap: 4 }}>
            <span style={{ width: 7, height: 7, borderRadius: "50%", background: item.color, display: "inline-block" }} />
            <span style={{ fontSize: 9, color: "#1E3A5F" }}>{item.label}</span>
          </div>
        ))}
      </div>
    </div>
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

// ── Expandable Employee Card ────────────────────────────────────────────────
function EmployeeCard({
  r, month, year, mon, workDays, isExpanded, onToggle,
  selectMode = false, selected = false, onToggleSelect, teams = [],
}: {
  r: PayrollRow; month: string; year: number; mon: number; workDays: number
  isExpanded: boolean; onToggle: () => void
  selectMode?: boolean; selected?: boolean; onToggleSelect?: () => void
  teams?: TeamRow[]
}) {
  const [isPending, startTransition] = useTransition()
  const [savingBonus, setSavingBonus] = useState(false)
  const [bonus, setBonus]         = useState(r.bonus)
  const [advance, setAdvance]     = useState(r.advance)
  const [incentive, setIncentive] = useState(r.incentive)

  const localFinalNetPay = Math.round((r.netPay + bonus + incentive - advance) * 100) / 100
  const effectiveDays = r.effectiveWorkDays > 0 ? r.effectiveWorkDays : workDays
  const attendPct = effectiveDays > 0
    ? Math.round(((r.presentDays + r.halfDays * 0.5 + r.leaveDays) / effectiveDays) * 100)
    : 0
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
      await saveBonusAdvance(r.id, month, bonus, advance, incentive)
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
          width: 52, height: 52, borderRadius: "50%", flexShrink: 0,
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
          {getInitials(r.name)}
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
            {/* Paid status badge */}
            {r.isPaid ? (
              <span style={{ fontSize: 10, fontWeight: 700, padding: "3px 10px", borderRadius: 20, background: "#F0FDF4", color: "#16A34A", display: "flex", alignItems: "center", gap: 3 }}>
                <CheckCircle2 size={9} /> Paid {r.paidAt ? fmtDate(r.paidAt) : ""}
              </span>
            ) : (
              <span style={{ fontSize: 10, fontWeight: 700, padding: "3px 10px", borderRadius: 20, background: "#FFF7ED", color: "#EA580C", display: "flex", alignItems: "center", gap: 3 }}>
                <Clock size={9} /> Pending
              </span>
            )}
            {/* Missing work update warning */}
            {r.missingUpdates > 0 && (
              <span style={{ fontSize: 10, fontWeight: 700, padding: "3px 10px", borderRadius: 20, background: "#FEF9C3", color: "#92400E", display: "flex", alignItems: "center", gap: 3 }}>
                ⚠ {r.missingUpdates} Missing Update{r.missingUpdates > 1 ? "s" : ""}
              </span>
            )}
          </div>
        </div>

        {/* Attendance donut */}
        <div style={{ flexShrink: 0, textAlign: "center" }}>
          <AttendanceRing pct={attendPct} size={54} />
          <div style={{ fontSize: 9, color: "#1E3A5F", marginTop: 2, fontWeight: 600 }}>Attendance</div>
        </div>

        {/* Salary chips */}
        <div style={{ flex: 1, display: "flex", gap: 8, justifyContent: "center", flexWrap: "wrap" }}>
          {[
            { label: "Base Salary",    value: r.basePay > 0 ? fmt(r.basePay) : "—",                  color: "#111" },
            { label: "Deductions",     value: r.deduction > 0 ? `-${fmt(r.deduction)}` : "—",         color: "#DC2626" },
            { label: "Half Days",      value: r.halfDays > 0 ? `${r.halfDays}d` : "—",                color: "#CA8A04" },
            { label: "OT Pay",         value: r.otPay > 0 ? fmt(r.otPay) : "—",                       color: "#F97316" },
            // Always show the real figure, including zero/negative — a negative Net Pay
            // (deductions exceeding base pay) is exactly the case an admin most needs to
            // see, not one to hide behind a blank dash.
            { label: "Net Pay",        value: r.basePay > 0 ? fmt(localFinalNetPay) : "—",             color: localFinalNetPay < 0 ? "#DC2626" : "#16A34A" },
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
        </div>
      </div>

      {/* ── Expanded panel ── */}
      {isExpanded && (
        <div className="grid grid-cols-1 md:grid-cols-3" style={{ borderTop: "1.5px solid #F5F5F5" }}>

          {/* LEFT: Payroll Breakdown bars */}
          <div style={{ padding: "22px 24px", borderRight: "1px solid #F5F5F5" }}>
            <div style={{ fontSize: 10, fontWeight: 800, color: "#1E3A5F", textTransform: "uppercase", letterSpacing: "0.13em", marginBottom: 18 }}>
              Payroll Breakdown
            </div>
            {[
              { label: "Base Salary",    amount: r.basePay,    pct: 100,  color: "#16A34A" },
              { label: "OT Earnings",    amount: r.otPay,      pct: r.basePay > 0 ? Math.min((r.otPay / r.basePay) * 100, 100) : 0, color: "#F97316" },
              { label: "Bonus",          amount: bonus,         pct: r.basePay > 0 ? Math.min((bonus / r.basePay) * 100, 100) : 0, color: "#A855F7" },
              { label: "Advance",        amount: -advance,      pct: r.basePay > 0 ? Math.min((advance / r.basePay) * 100, 100) : 0, color: "#F43F5E" },
              { label: `Absent Deduction (${r.absentDays}d full + ${r.halfDays}d half)`, amount: -r.deduction, pct: r.basePay > 0 ? Math.min((r.deduction / r.basePay) * 100, 100) : 0, color: "#DC2626" },
            ].map((item) => (
              <div key={item.label} style={{ marginBottom: 14 }}>
                <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 5 }}>
                  <span style={{ fontSize: 12, color: "#1E3A5F" }}>{item.label}</span>
                  <span style={{ fontSize: 12, fontWeight: 700, color: item.amount < 0 ? "#DC2626" : item.amount === 0 ? "#1E3A5F" : "#111" }}>
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
              <span style={{ fontSize: 20, fontWeight: 900, color: localFinalNetPay < 0 ? "#DC2626" : "#16A34A", fontFamily: "var(--font-jakarta)" }}>{fmt(localFinalNetPay)}</span>
            </div>
          </div>

          {/* CENTER: Attendance Calendar */}
          <div style={{ padding: "22px 24px", borderRight: "1px solid #F5F5F5" }}>
            <div style={{ fontSize: 10, fontWeight: 800, color: "#1E3A5F", textTransform: "uppercase", letterSpacing: "0.13em", marginBottom: 18 }}>
              {new Date(year, mon - 1).toLocaleString("en-IN", { month: "long", year: "numeric" })} Attendance
            </div>
            <MiniCalendar
              year={year} mon={mon}
              presentDays={r.presentDays}
              halfDays={r.halfDays}
              absentDays={r.absentDays}
              leaveDays={r.leaveDays}
            />
          </div>

          {/* RIGHT: Bonus & Adjustments */}
          <div style={{ padding: "22px 24px", background: "#FAFAFA" }}>
            <div style={{ fontSize: 10, fontWeight: 800, color: "#1E3A5F", textTransform: "uppercase", letterSpacing: "0.13em", marginBottom: 18 }}>
              Bonus &amp; Adjustments
            </div>

            {/* Bonus input */}
            <div style={{ marginBottom: 14 }}>
              <label style={{ fontSize: 11, fontWeight: 700, color: "#1E3A5F", display: "block", marginBottom: 6 }}>
                Bonus (₹)
              </label>
              <input
                type="number"
                min={0}
                value={bonus}
                onChange={e => setBonus(Math.max(0, Number(e.target.value)))}
                style={{
                  width: "100%", padding: "9px 12px", borderRadius: 10, border: "1.5px solid #E5E7EB",
                  fontSize: 14, fontWeight: 700, color: "#A855F7", background: "#fff", outline: "none",
                }}
                placeholder="0"
              />
            </div>

            {/* Incentive input */}
            <div style={{ marginBottom: 14 }}>
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

            {/* Advance / Recovery input */}
            <div style={{ marginBottom: 18 }}>
              <label style={{ fontSize: 11, fontWeight: 700, color: "#1E3A5F", display: "block", marginBottom: 6 }}>
                Advance Recovery (₹)
              </label>
              <input
                type="number"
                min={0}
                value={advance}
                onChange={e => setAdvance(Math.max(0, Number(e.target.value)))}
                style={{
                  width: "100%", padding: "9px 12px", borderRadius: 10, border: "1.5px solid #E5E7EB",
                  fontSize: 14, fontWeight: 700, color: "#DC2626", background: "#fff", outline: "none",
                }}
                placeholder="0"
              />
            </div>

            {/* Adjusted net pay preview */}
            <div style={{
              padding: "12px 14px", borderRadius: 12,
              background: localFinalNetPay < 0 ? "linear-gradient(135deg, #FEF2F2, #FEE2E2)" : "linear-gradient(135deg, #F0FDF4, #DCFCE7)",
              border: localFinalNetPay < 0 ? "1.5px solid #FECACA" : "1.5px solid #BBF7D0", marginBottom: 14,
            }}>
              <div style={{ fontSize: 10, color: localFinalNetPay < 0 ? "#B91C1C" : "#15803D", fontWeight: 700, marginBottom: 4 }}>ADJUSTED NET PAY</div>
              <div style={{ fontSize: 22, fontWeight: 900, color: localFinalNetPay < 0 ? "#DC2626" : "#16A34A", fontFamily: "var(--font-jakarta)" }}>
                {fmt(localFinalNetPay)}
              </div>
              {(bonus > 0 || incentive > 0 || advance > 0) && (
                <div style={{ fontSize: 10, color: "#1E3A5F", marginTop: 4 }}>
                  {fmt(r.netPay)}
                  {bonus > 0     ? ` + ${fmt(bonus)} bonus`     : ""}
                  {incentive > 0 ? ` + ${fmt(incentive)} incentive` : ""}
                  {advance > 0   ? ` − ${fmt(advance)} advance`  : ""}
                </div>
              )}
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
              { label: "Target",     value: `${r.hoursPreview.targetHours}h` },
              { label: "Permission", value: `${r.hoursPreview.permissionHours}h` },
              { label: "Half Day",   value: `${r.hoursPreview.halfDayHours}h` },
              { label: "Leave",      value: `${r.hoursPreview.leaveHours}h` },
              { label: "Required",   value: `${r.hoursPreview.requiredHours}h` },
              { label: "Actual",     value: `${r.hoursPreview.actualHours}h` },
              { label: "Shortfall",  value: `${r.hoursPreview.shortfallHours}h` },
              { label: "Deduction",  value: fmt(r.hoursPreview.deduction) },
              { label: "Net Pay (preview)", value: r.hoursPreview.netPay === null ? "—" : fmt(r.hoursPreview.netPay) },
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
  const totalBase   = rows.reduce((s, r) => s + r.basePay,     0)

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

  // Builds a printable summary report entirely client-side from the rows
  // already computed and on screen — no new API route, no re-running any
  // salary calculation, so it can't drift from what's actually displayed.
  // One card per employee (profile photo, attendance, hours, pay), not a
  // flat table — reuses the same figures already shown when an admin
  // expands that employee's row on this page.
  function handleGenerateReport() {
    if (rows.length === 0) {
      showToast("No payroll rows to report for this month.", "error")
      return
    }
    const win = window.open("", "_blank", "noopener,noreferrer")
    if (!win) {
      showToast("Pop-up blocked — allow pop-ups to view the report.", "error")
      return
    }

    function statRow(label: string, value: string, colorClass = "") {
      return `<div class="stat"><span class="stat-lbl">${label}</span><span class="stat-val ${colorClass}">${value}</span></div>`
    }

    const employeeCards = rows.map(r => {
      const photo = r.passport_photo_url
        ? `<img src="${r.passport_photo_url}" alt="${r.name}"/>`
        : `<span>${getInitials(r.name)}</span>`
      const meta = r.team ? `#${r.employee_id} · ${r.team}` : `#${r.employee_id}`
      return `
      <div class="emp-card">
        <div class="emp-hdr">
          <div class="emp-photo">${photo}</div>
          <div class="emp-id">
            <div class="emp-name">${r.name}</div>
            <div class="emp-meta">${meta}</div>
          </div>
          <span class="status-pill ${r.isPaid ? "paid" : "pending"}">${r.isPaid ? "Paid" : "Pending"}</span>
        </div>
        <div class="stat-groups">
          <div class="stat-group">
            <div class="stat-group-title">Attendance</div>
            <div class="stat-grid">
              ${statRow("Present Days", String(r.presentDays), "green")}
              ${statRow("Half Days", String(r.halfDays), "amber")}
              ${statRow("Absent Days", String(r.absentDays), "red")}
              ${statRow("Leave Days", String(r.leaveDays), "blue")}
              ${statRow("Working Days", String(r.effectiveWorkDays))}
            </div>
          </div>
          <div class="stat-group">
            <div class="stat-group-title">Hours</div>
            <div class="stat-grid">
              ${statRow("Total Hours", `${r.totalHours}h`)}
              ${statRow("OT Hours", `${r.otHours}h`, "amber")}
              ${statRow("Permission", `${r.hoursPreview.permissionHours}h`)}
              ${statRow("Required", `${r.hoursPreview.requiredHours}h`)}
              ${statRow("Actual", `${r.hoursPreview.actualHours}h`)}
              ${statRow("Shortfall", `${r.hoursPreview.shortfallHours}h`, r.hoursPreview.shortfallHours > 0 ? "red" : "")}
            </div>
          </div>
          <div class="stat-group">
            <div class="stat-group-title">Pay</div>
            <div class="stat-grid">
              ${statRow("Base Pay", fmt(r.basePay))}
              ${statRow("Deduction", r.deduction > 0 ? `-${fmt(r.deduction)}` : "—", r.deduction > 0 ? "red" : "")}
              ${statRow("OT Pay", r.otPay > 0 ? fmt(r.otPay) : "—", r.otPay > 0 ? "green" : "")}
              ${statRow("Bonus", r.bonus > 0 ? fmt(r.bonus) : "—", r.bonus > 0 ? "green" : "")}
              ${statRow("Advance", r.advance > 0 ? `-${fmt(r.advance)}` : "—", r.advance > 0 ? "red" : "")}
            </div>
            <div class="stat net">
              <span class="stat-lbl">Net Pay</span><span class="stat-val bold">${fmt(r.finalNetPay)}</span>
            </div>
          </div>
        </div>
      </div>`
    }).join("")

    win.document.write(`<!DOCTYPE html><html><head><title>Payroll Report — ${monthName}</title>
      <style>
        *{box-sizing:border-box}
        body{font-family:Arial,sans-serif;padding:24px;color:#111;background:#F3F4F6;margin:0}
        h1{font-size:20px;margin:0 0 4px}
        p.sub{color:#374151;margin:0 0 20px;font-size:13px}
        .totals{display:flex;flex-wrap:wrap;gap:16px;margin-bottom:24px}
        .totals div{background:#fff;border:1px solid #E5E7EB;border-radius:10px;padding:12px 16px;flex:1 1 160px}
        .totals span.lbl{display:block;font-size:11px;color:#6B7280;margin-bottom:4px}
        .totals strong{display:block;font-size:18px}
        .cards{display:flex;flex-direction:column;gap:14px}
        .emp-card{background:#fff;border:1px solid #E5E7EB;border-radius:14px;overflow:hidden;break-inside:avoid;page-break-inside:avoid}
        .emp-hdr{display:flex;align-items:center;gap:12px;padding:14px 18px;border-bottom:1px solid #F3F4F6}
        .emp-photo{width:44px;height:44px;border-radius:50%;overflow:hidden;flex-shrink:0;background:#DE1A1A;display:flex;align-items:center;justify-content:center;color:#fff;font-weight:800;font-size:14px}
        .emp-photo img{width:100%;height:100%;object-fit:cover}
        .emp-id{flex:1;min-width:0}
        .emp-name{font-size:14px;font-weight:800;color:#111}
        .emp-meta{font-size:11px;color:#6B7280;margin-top:1px}
        .status-pill{font-size:11px;font-weight:700;padding:3px 10px;border-radius:99px;flex-shrink:0}
        .status-pill.paid{background:#F0FDF4;color:#16A34A}
        .status-pill.pending{background:#FFF7ED;color:#EA580C}
        .stat-groups{display:grid;grid-template-columns:1fr 1fr 1fr}
        .stat-group{padding:12px 18px;border-left:1px solid #F3F4F6}
        .stat-group:first-child{border-left:none}
        .stat-group-title{font-size:10px;font-weight:700;color:#9CA3AF;text-transform:uppercase;letter-spacing:0.05em;margin-bottom:8px}
        .stat-grid{display:flex;flex-direction:column;gap:5px}
        .stat{display:flex;justify-content:space-between;font-size:12px}
        .stat-lbl{color:#374151}
        .stat-val{font-weight:700;color:#111}
        .stat-val.green{color:#16A34A}
        .stat-val.amber{color:#D97706}
        .stat-val.red{color:#DC2626}
        .stat-val.blue{color:#2563EB}
        .stat.net{border-top:1px solid #F3F4F6;margin:6px 18px 0;padding-top:6px}
        .stat-val.bold{font-size:14px}
        @media print{ body{padding:0;background:#fff} }
        @media (max-width:900px){
          .stat-groups{grid-template-columns:1fr}
          .stat-group{border-left:none;border-top:1px solid #F3F4F6}
          .stat-group:first-child{border-top:none}
        }
      </style></head>
      <body>
        <h1>Payroll Report — ${monthName}</h1>
        <p class="sub">${rows.length} employees · ${paidCount} paid · Generated ${new Date().toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" })}</p>
        <div class="totals">
          <div><span class="lbl">Total Base Pay</span><strong>${fmt(totalBase)}</strong></div>
          <div><span class="lbl">Total OT Pay</span><strong>${fmt(totalOT)}</strong></div>
          <div><span class="lbl">Total Deductions</span><strong>${fmt(totalDed)}</strong></div>
          <div><span class="lbl">Total Net Payroll</span><strong>${fmt(totalFinal)}</strong></div>
        </div>
        <div class="cards">${employeeCards}</div>
      </body></html>`)
    win.document.close()
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
                ["ot_threshold_hrs", "OT Threshold (hrs/day)"],
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
                    year={year}
                    mon={mon}
                    workDays={workDays}
                    isExpanded={expandedId === r.id}
                    onToggle={() => setExpandedId(expandedId === r.id ? null : r.id)}
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
                { emoji: "📊", label: "Reports", action: handleGenerateReport, active: false },
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
