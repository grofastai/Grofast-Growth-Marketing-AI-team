"use client"

import { useRouter, usePathname } from "next/navigation"
import { Users, FileText } from "lucide-react"

type PayrollRow = {
  id: string; name: string; employee_id: string; team: string | null
  employment_type: string
  presentDays: number; absentDays: number; totalHours: number; otHours: number
  basePay: number; deduction: number; otPay: number; netPay: number
  monthly_salary: number | null; hourly_rate: number | null
}

function fmt(n: number) {
  return `₹${n.toLocaleString("en-IN", { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`
}

export default function PayrollClient({
  rows, month, workDays,
}: {
  rows: PayrollRow[]
  month: string
  workDays: number
}) {
  const router   = useRouter()
  const pathname = usePathname()

  const totalNet = rows.reduce((s, r) => s + r.netPay, 0)
  const totalOT  = rows.reduce((s, r) => s + r.otPay, 0)
  const totalDed = rows.reduce((s, r) => s + r.deduction, 0)

  const [year, mon] = month.split("-").map(Number)
  const monthName   = new Date(year, mon - 1).toLocaleString("en-IN", { month: "long", year: "numeric" })

  function changeMonth(delta: number) {
    const d = new Date(year, mon - 1 + delta)
    const m = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`
    router.push(`${pathname}?month=${m}`)
  }

  return (
    <div className="p-8 max-w-[1200px]">
      {/* Header */}
      <div className="flex items-start justify-between mb-6">
        <div>
          <h1 className="gradient-heading text-[30px] font-black leading-tight" style={{ fontFamily: "var(--font-jakarta)" }}>
            Payroll
          </h1>
          <p className="text-sm mt-1" style={{ color: "#83858c" }}>Monthly salary breakdown for your team</p>
        </div>
        {/* Month picker */}
        <div className="flex items-center gap-2">
          <button onClick={() => changeMonth(-1)}
            className="w-9 h-9 rounded-xl flex items-center justify-center text-[16px] transition-all"
            style={{ background: "#FFFFFF", border: "1px solid #E5E7EB", color: "#6B7280" }}>‹</button>
          <div className="px-4 py-2 rounded-xl text-[13px] font-semibold"
            style={{ background: "#FFFFFF", border: "1px solid #E5E7EB", color: "#111111", minWidth: "140px", textAlign: "center" }}>
            {monthName}
          </div>
          <button onClick={() => changeMonth(1)}
            className="w-9 h-9 rounded-xl flex items-center justify-center text-[16px] transition-all"
            style={{ background: "#FFFFFF", border: "1px solid #E5E7EB", color: "#6B7280" }}>›</button>
        </div>
      </div>

      {/* Summary chips */}
      <div className="flex flex-wrap gap-3 mb-6">
        {[
          { label: "Total Payroll",   value: fmt(totalNet), color: "#de1a1a", bg: "rgba(222,26,26,0.06)", border: "rgba(222,26,26,0.15)" },
          { label: "Total OT Pay",    value: fmt(totalOT),  color: "#EA580C", bg: "rgba(234,88,12,0.06)", border: "rgba(234,88,12,0.15)" },
          { label: "Total Deductions",value: fmt(totalDed), color: "#F59E0B", bg: "rgba(245,158,11,0.06)", border: "rgba(245,158,11,0.15)" },
          { label: "Working Days",    value: `${workDays} days`, color: "#6B7280", bg: "#FFFFFF", border: "#E5E7EB" },
          { label: "Members",         value: rows.length,   color: "#6B7280", bg: "#FFFFFF", border: "#E5E7EB" },
        ].map(s => (
          <div key={s.label} className="flex items-center gap-2 px-4 py-2.5 rounded-xl"
            style={{ background: s.bg, border: `1px solid ${s.border}` }}>
            <span className="text-[17px] font-black" style={{ fontFamily: "var(--font-jakarta)", color: s.color }}>{s.value}</span>
            <span className="text-[11px]" style={{ color: "#83858c" }}>{s.label}</span>
          </div>
        ))}
      </div>

      {/* Table */}
      <div className="rounded-xl overflow-hidden" style={{ background: "#FFFFFF", border: "1px solid #F0F0F0" }}>
        <table className="w-full">
          <thead>
            <tr style={{ background: "rgba(0,0,0,0.02)", borderBottom: "1px solid #E5E7EB" }}>
              {["Employee", "Type", "Present", "Absent", "Hours", "OT", "Base Pay", "Deduction", "OT Pay", "Net Pay", "Slip"].map(h => (
                <th key={h} className="text-left px-4 py-3 text-[10px] font-bold uppercase tracking-[0.15em]"
                  style={{ color: "#83858c" }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((r, i) => (
              <tr key={r.id}
                style={{ borderBottom: i < rows.length - 1 ? "1px solid #F9F9F9" : "none" }}
                onMouseEnter={e => (e.currentTarget as HTMLElement).style.background = "rgba(0,0,0,0.01)"}
                onMouseLeave={e => (e.currentTarget as HTMLElement).style.background = "transparent"}>
                <td className="px-4 py-3.5">
                  <p className="text-[13px] font-semibold" style={{ color: "#111111" }}>{r.name}</p>
                  <p className="text-[10px]" style={{ color: "#83858c" }}>#{r.employee_id}</p>
                </td>
                <td className="px-4 py-3.5">
                  <span className="text-[11px] font-semibold px-2 py-0.5 rounded-full capitalize"
                    style={{ background: "rgba(0,0,0,0.04)", color: "#6B7280" }}>
                    {r.employment_type.replace("_", " ")}
                  </span>
                </td>
                <td className="px-4 py-3.5">
                  <span className="text-[13px] font-semibold" style={{ color: "#16A34A" }}>{r.presentDays}</span>
                </td>
                <td className="px-4 py-3.5">
                  <span className="text-[13px] font-semibold" style={{ color: r.absentDays > 0 ? "#de1a1a" : "#D1D5DB" }}>
                    {r.absentDays}
                  </span>
                </td>
                <td className="px-4 py-3.5">
                  <span className="text-[13px]" style={{ color: "#374151" }}>{r.totalHours}h</span>
                </td>
                <td className="px-4 py-3.5">
                  <span className="text-[13px] font-semibold" style={{ color: r.otHours > 0 ? "#EA580C" : "#D1D5DB" }}>
                    {r.otHours > 0 ? `${r.otHours}h` : "—"}
                  </span>
                </td>
                <td className="px-4 py-3.5">
                  <span className="text-[13px]" style={{ color: "#374151" }}>
                    {r.basePay > 0 ? fmt(r.basePay) : "—"}
                  </span>
                </td>
                <td className="px-4 py-3.5">
                  <span className="text-[13px]" style={{ color: r.deduction > 0 ? "#F59E0B" : "#D1D5DB" }}>
                    {r.deduction > 0 ? `-${fmt(r.deduction)}` : "—"}
                  </span>
                </td>
                <td className="px-4 py-3.5">
                  <span className="text-[13px]" style={{ color: r.otPay > 0 ? "#EA580C" : "#D1D5DB" }}>
                    {r.otPay > 0 ? `+${fmt(r.otPay)}` : "—"}
                  </span>
                </td>
                <td className="px-4 py-3.5">
                  <span className="text-[14px] font-black" style={{ fontFamily: "var(--font-jakarta)", color: r.netPay > 0 ? "#de1a1a" : "#83858c" }}>
                    {r.netPay > 0 ? fmt(r.netPay) : "—"}
                  </span>
                </td>
                <td className="px-4 py-3.5">
                  <a
                    href={`/api/payslip?userId=${r.id}&month=${month}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="w-8 h-8 rounded-lg flex items-center justify-center transition-all"
                    style={{ background: "rgba(222,26,26,0.06)", border: "1px solid rgba(222,26,26,0.12)" }}
                    title="Download Salary Slip"
                  >
                    <FileText size={13} style={{ color: "#de1a1a" }} />
                  </a>
                </td>
              </tr>
            ))}

            {/* Totals row */}
            <tr style={{ borderTop: "2px solid #E5E7EB", background: "rgba(222,26,26,0.02)" }}>
              <td className="px-4 py-3" colSpan={7}>
                <span className="text-[12px] font-bold uppercase tracking-wider" style={{ color: "#83858c" }}>Total</span>
              </td>
              <td className="px-4 py-3">
                <span className="text-[13px] font-bold" style={{ color: "#374151" }}>
                  {fmt(rows.reduce((s, r) => s + r.basePay, 0))}
                </span>
              </td>
              <td className="px-4 py-3">
                <span className="text-[13px] font-bold" style={{ color: "#F59E0B" }}>
                  {totalDed > 0 ? `-${fmt(totalDed)}` : "—"}
                </span>
              </td>
              <td className="px-4 py-3">
                <span className="text-[13px] font-bold" style={{ color: "#EA580C" }}>
                  {totalOT > 0 ? `+${fmt(totalOT)}` : "—"}
                </span>
              </td>
              <td className="px-4 py-3">
                <span className="text-[16px] font-black" style={{ fontFamily: "var(--font-jakarta)", color: "#de1a1a" }}>
                  {fmt(totalNet)}
                </span>
              </td>
            </tr>
          </tbody>
        </table>
      </div>

      {rows.length === 0 && (
        <div className="text-center py-16" style={{ color: "#D1D5DB" }}>
          <Users size={32} className="mx-auto mb-3" />
          <p className="text-[13px]">No active members found</p>
        </div>
      )}
    </div>
  )
}
