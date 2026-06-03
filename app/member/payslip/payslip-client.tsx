"use client"

import { useState } from "react"
import { FileText, Download, CheckCircle2, Clock, ChevronRight, Banknote, Calendar, User, Briefcase } from "lucide-react"

interface MonthRow {
  month: string
  label: string
  isPaid: boolean
  paidAt: string | null
  bonus: number
  advance: number
  incentive: number
}

interface Profile {
  name: string
  employee_id: string
  monthly_salary: number | null
  employment_type: string | null
  team: string | null
}

function fmt(n: number) {
  return `₹${n.toLocaleString("en-IN", { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`
}
function fmtDate(iso: string) {
  return new Date(iso).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" })
}

export default function PayslipClient({ userId, months, profile }: {
  userId: string
  months: MonthRow[]
  profile: Profile
}) {
  const [opening, setOpening] = useState<string | null>(null)

  function openPayslip(month: string) {
    setOpening(month)
    window.open(`/api/payslip?userId=${userId}&month=${month}`, "_blank")
    setTimeout(() => setOpening(null), 1500)
  }

  const paidMonths   = months.filter(m => m.isPaid)
  const latestPaid   = paidMonths[0] ?? null
  const totalCredited = paidMonths.reduce((s, m) => s + (profile.monthly_salary ?? 0) + m.bonus + m.incentive - m.advance, 0)

  return (
    <div style={{ background: "#F5F6FA", minHeight: "100vh", padding: "0 0 40px" }}>

      {/* ── Hero Header ── */}
      <div style={{
        background: "linear-gradient(135deg, #DE1A1A 0%, #8B1212 55%, #1A0808 100%)",
        padding: "28px 24px 32px",
        position: "relative", overflow: "hidden",
      }}>
        <div style={{ position: "absolute", top: -40, right: -40, width: 180, height: 180, borderRadius: "50%", background: "rgba(255,255,255,0.05)", pointerEvents: "none" }} />
        <div style={{ position: "absolute", bottom: -30, left: 60, width: 120, height: 120, borderRadius: "50%", background: "rgba(255,255,255,0.04)", pointerEvents: "none" }} />

        <div style={{ position: "relative", zIndex: 1 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 20 }}>
            <div style={{ width: 48, height: 48, borderRadius: 14, background: "rgba(255,255,255,0.15)", display: "flex", alignItems: "center", justifyContent: "center", border: "1px solid rgba(255,255,255,0.2)" }}>
              <FileText size={22} style={{ color: "#FFFFFF" }} />
            </div>
            <div>
              <h1 style={{ fontSize: 24, fontWeight: 900, color: "#FFFFFF", margin: 0, fontFamily: "var(--font-jakarta)" }}>My Payslips</h1>
              <p style={{ fontSize: 12, color: "rgba(255,255,255,0.6)", margin: 0 }}>View & download your salary slips</p>
            </div>
          </div>

          {/* Profile strip */}
          <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
            {[
              { icon: User,      text: profile.name },
              { icon: Briefcase, text: `#${profile.employee_id}` },
              { icon: Banknote,  text: profile.monthly_salary ? fmt(profile.monthly_salary) + " / month" : "Hourly" },
              { icon: Calendar,  text: profile.team ?? "GroFast" },
            ].map((item, i) => {
              const Icon = item.icon
              return (
                <div key={i} style={{ display: "flex", alignItems: "center", gap: 6, padding: "6px 12px", borderRadius: 99, background: "rgba(255,255,255,0.12)", border: "1px solid rgba(255,255,255,0.18)" }}>
                  <Icon size={11} style={{ color: "rgba(255,255,255,0.7)" }} />
                  <span style={{ fontSize: 11, fontWeight: 600, color: "#FFFFFF" }}>{item.text}</span>
                </div>
              )
            })}
          </div>
        </div>
      </div>

      <div style={{ padding: "20px 16px 0", maxWidth: 640, margin: "0 auto" }}>

        {/* ── Summary cards ── */}
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginBottom: 20 }}>
          <div style={{ background: "#FFFFFF", borderRadius: 18, padding: "18px 18px", border: "1px solid #E8E9EF", boxShadow: "0 2px 12px rgba(0,0,0,0.05)" }}>
            <p style={{ fontSize: 10, fontWeight: 700, color: "#9CA3AF", textTransform: "uppercase", letterSpacing: "0.1em", margin: "0 0 6px" }}>Payslips Available</p>
            <p style={{ fontSize: 30, fontWeight: 900, color: "#DE1A1A", margin: 0, fontFamily: "var(--font-jakarta)" }}>{paidMonths.length}</p>
            <p style={{ fontSize: 11, color: "#6B7280", margin: "4px 0 0" }}>of last 12 months</p>
          </div>
          <div style={{ background: "#FFFFFF", borderRadius: 18, padding: "18px 18px", border: "1px solid #E8E9EF", boxShadow: "0 2px 12px rgba(0,0,0,0.05)" }}>
            <p style={{ fontSize: 10, fontWeight: 700, color: "#9CA3AF", textTransform: "uppercase", letterSpacing: "0.1em", margin: "0 0 6px" }}>Total Credited</p>
            <p style={{ fontSize: 22, fontWeight: 900, color: "#16A34A", margin: 0, fontFamily: "var(--font-jakarta)" }}>{totalCredited > 0 ? fmt(totalCredited) : "—"}</p>
            <p style={{ fontSize: 11, color: "#6B7280", margin: "4px 0 0" }}>last {paidMonths.length} months</p>
          </div>
        </div>

        {/* ── Latest payslip CTA ── */}
        {latestPaid && (
          <div style={{
            background: "linear-gradient(135deg, #F0FDF4, #DCFCE7)",
            border: "1.5px solid #86EFAC",
            borderRadius: 18, padding: "18px 20px", marginBottom: 20,
            display: "flex", alignItems: "center", gap: 14,
          }}>
            <div style={{ width: 44, height: 44, borderRadius: 12, background: "#DCFCE7", border: "1.5px solid #86EFAC", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
              <CheckCircle2 size={22} style={{ color: "#16A34A" }} />
            </div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <p style={{ fontSize: 13, fontWeight: 800, color: "#111111", margin: 0 }}>Latest — {latestPaid.label}</p>
              <p style={{ fontSize: 11, color: "#16A34A", margin: "2px 0 0", fontWeight: 600 }}>
                Salary credited {latestPaid.paidAt ? fmtDate(latestPaid.paidAt) : "✓"}
              </p>
            </div>
            <button
              onClick={() => openPayslip(latestPaid.month)}
              disabled={opening === latestPaid.month}
              style={{
                display: "flex", alignItems: "center", gap: 6,
                padding: "10px 18px", borderRadius: 12,
                background: "#16A34A", color: "#FFFFFF",
                border: "none", cursor: "pointer", fontSize: 12, fontWeight: 800,
                boxShadow: "0 4px 14px rgba(22,163,74,0.35)", flexShrink: 0,
                opacity: opening === latestPaid.month ? 0.7 : 1,
              }}
            >
              <Download size={13} />
              {opening === latestPaid.month ? "Opening…" : "View"}
            </button>
          </div>
        )}

        {/* ── Month list ── */}
        <div style={{ background: "#FFFFFF", borderRadius: 20, border: "1px solid #E8E9EF", overflow: "hidden", boxShadow: "0 2px 12px rgba(0,0,0,0.05)" }}>
          <div style={{ padding: "16px 20px", borderBottom: "1px solid #F3F4F6" }}>
            <p style={{ fontSize: 14, fontWeight: 800, color: "#111111", margin: 0 }}>All Payslips</p>
          </div>

          {months.map((m, i) => (
            <div key={m.month} style={{
              display: "flex", alignItems: "center", gap: 14, padding: "14px 20px",
              borderBottom: i < months.length - 1 ? "1px solid #F9FAFB" : "none",
              background: m.isPaid && i === 0 ? "rgba(22,163,74,0.02)" : "transparent",
            }}>
              {/* Month icon */}
              <div style={{
                width: 42, height: 42, borderRadius: 12, flexShrink: 0,
                display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center",
                background: m.isPaid ? "rgba(22,163,74,0.08)" : "rgba(0,0,0,0.04)",
                border: `1.5px solid ${m.isPaid ? "rgba(22,163,74,0.2)" : "#E8E9EF"}`,
              }}>
                <span style={{ fontSize: 13, fontWeight: 900, color: m.isPaid ? "#16A34A" : "#9CA3AF", lineHeight: 1 }}>
                  {m.month.split("-")[1]}
                </span>
                <span style={{ fontSize: 8, fontWeight: 700, color: m.isPaid ? "#16A34A" : "#9CA3AF", textTransform: "uppercase" }}>
                  {new Date(parseInt(m.month.split("-")[0]), parseInt(m.month.split("-")[1]) - 1).toLocaleString("en-IN", { month: "short" })}
                </span>
              </div>

              {/* Info */}
              <div style={{ flex: 1, minWidth: 0 }}>
                <p style={{ fontSize: 13, fontWeight: 700, color: "#111111", margin: 0 }}>{m.label}</p>
                <p style={{ fontSize: 11, margin: "2px 0 0", color: m.isPaid ? "#16A34A" : "#9CA3AF", fontWeight: 600 }}>
                  {m.isPaid
                    ? `Credited${m.paidAt ? ` · ${fmtDate(m.paidAt)}` : ""}`
                    : "Not processed yet"}
                </p>
              </div>

              {/* Adjustments badges */}
              {m.isPaid && (m.bonus > 0 || m.incentive > 0 || m.advance > 0) && (
                <div style={{ display: "flex", gap: 4, flexShrink: 0 }}>
                  {m.bonus > 0     && <span style={{ fontSize: 9, fontWeight: 800, padding: "2px 7px", borderRadius: 99, background: "rgba(99,102,241,0.1)", color: "#6366F1" }}>+Bonus</span>}
                  {m.incentive > 0 && <span style={{ fontSize: 9, fontWeight: 800, padding: "2px 7px", borderRadius: 99, background: "rgba(16,185,129,0.1)", color: "#10B981" }}>+Incentive</span>}
                  {m.advance > 0   && <span style={{ fontSize: 9, fontWeight: 800, padding: "2px 7px", borderRadius: 99, background: "rgba(239,68,68,0.1)", color: "#EF4444" }}>-Advance</span>}
                </div>
              )}

              {/* Action */}
              {m.isPaid ? (
                <button
                  onClick={() => openPayslip(m.month)}
                  disabled={opening === m.month}
                  style={{
                    display: "flex", alignItems: "center", gap: 5,
                    padding: "8px 14px", borderRadius: 10,
                    background: opening === m.month ? "#E5E7EB" : "#DE1A1A",
                    color: opening === m.month ? "#9CA3AF" : "#FFFFFF",
                    border: "none", cursor: opening === m.month ? "default" : "pointer",
                    fontSize: 11, fontWeight: 700, flexShrink: 0,
                    boxShadow: opening === m.month ? "none" : "0 3px 10px rgba(222,26,26,0.3)",
                  }}
                >
                  <Download size={11} />
                  {opening === m.month ? "…" : "View"}
                </button>
              ) : (
                <div style={{ display: "flex", alignItems: "center", gap: 4, padding: "6px 12px", borderRadius: 10, background: "rgba(0,0,0,0.04)", flexShrink: 0 }}>
                  <Clock size={11} style={{ color: "#9CA3AF" }} />
                  <span style={{ fontSize: 11, fontWeight: 600, color: "#9CA3AF" }}>Pending</span>
                </div>
              )}
            </div>
          ))}
        </div>

        {/* Footer note */}
        <p style={{ fontSize: 11, color: "#9CA3AF", textAlign: "center", marginTop: 16, lineHeight: 1.6 }}>
          Payslips open in a new tab. Use your browser&apos;s print/save to download as PDF.
        </p>
      </div>
    </div>
  )
}
