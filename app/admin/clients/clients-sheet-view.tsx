"use client"

import { useState, useMemo } from "react"
import { Search, ExternalLink, ChevronDown } from "lucide-react"
import type { SheetClient } from "@/lib/google/sheets"

function statusColor(s: string): { bg: string; color: string; border: string } {
  const v = s.toLowerCase()
  if (v.includes("active"))   return { bg: "rgba(22,163,74,0.1)",   color: "#16A34A", border: "rgba(22,163,74,0.25)" }
  if (v.includes("inactive") || v.includes("closed") || v.includes("stop"))
                               return { bg: "rgba(107,114,128,0.1)", color: "#6B7280", border: "rgba(107,114,128,0.25)" }
  if (v.includes("hold") || v.includes("pause"))
                               return { bg: "rgba(245,158,11,0.1)", color: "#D97706", border: "rgba(245,158,11,0.25)" }
  if (v.includes("new") || v.includes("prospect"))
                               return { bg: "rgba(220,38,38,0.1)",  color: "#DC2626", border: "rgba(220,38,38,0.25)" }
  return { bg: "rgba(107,114,128,0.08)", color: "#6B7280", border: "rgba(107,114,128,0.2)" }
}

function paymentColor(s: string): { bg: string; color: string } {
  const v = s.toLowerCase()
  if (v.includes("paid") || v.includes("complete")) return { bg: "rgba(22,163,74,0.1)",  color: "#16A34A" }
  if (v.includes("partial"))                         return { bg: "rgba(245,158,11,0.1)", color: "#D97706" }
  if (v.includes("pending") || v.includes("due"))    return { bg: "rgba(220,38,38,0.1)",  color: "#DC2626" }
  return { bg: "rgba(107,114,128,0.08)", color: "#6B7280" }
}

function Badge({ text, style }: { text: string; style?: React.CSSProperties }) {
  if (!text) return null
  return (
    <span className="inline-block px-2 py-0.5 rounded-full text-[10px] font-bold whitespace-nowrap" style={style}>
      {text}
    </span>
  )
}

export default function ClientsSheetView({
  clients,
  sheetUrl,
}: {
  clients: SheetClient[]
  sheetUrl: string | null
}) {
  const [search, setSearch]               = useState("")
  const [statusFilter, setStatusFilter]   = useState("")
  const [stageFilter, setStageFilter]     = useState("")
  const [payFilter, setPayFilter]         = useState("")

  const statuses = useMemo(() =>
    [...new Set(clients.map(c => c.client_status).filter(Boolean))].sort(), [clients])
  const stages = useMemo(() =>
    [...new Set(clients.map(c => c.client_stage).filter(Boolean))].sort(), [clients])
  const payStatuses = useMemo(() =>
    [...new Set(clients.map(c => c.payment_status).filter(Boolean))].sort(), [clients])

  const filtered = useMemo(() => {
    const q = search.toLowerCase()
    return clients.filter(c => {
      if (statusFilter && c.client_status !== statusFilter) return false
      if (stageFilter && c.client_stage !== stageFilter) return false
      if (payFilter && c.payment_status !== payFilter) return false
      if (!q) return true
      return (
        c.company_name.toLowerCase().includes(q) ||
        c.customer_name.toLowerCase().includes(q) ||
        c.place.toLowerCase().includes(q) ||
        c.industry.toLowerCase().includes(q) ||
        c.service.toLowerCase().includes(q) ||
        c.package_name.toLowerCase().includes(q)
      )
    })
  }, [clients, search, statusFilter, stageFilter, payFilter])

  const stats = {
    total:   clients.length,
    active:  clients.filter(c => c.client_status.toLowerCase().includes("active")).length,
    pending: clients.filter(c => c.payment_status.toLowerCase().includes("pending") || c.payment_status.toLowerCase().includes("due")).length,
    paid:    clients.filter(c => c.payment_status.toLowerCase().includes("paid")).length,
  }

  const selectStyle: React.CSSProperties = {
    appearance: "none" as const,
    background: "#FFFFFF",
    border: "1px solid #F0F0F0",
    boxShadow: "0 1px 3px rgba(0,0,0,0.06)",
    borderRadius: "12px",
    padding: "9px 32px 9px 12px",
    fontSize: "12px",
    color: "#374151",
    outline: "none",
  }

  return (
    <div className="p-8 max-w-[1400px]">

      {/* Header */}
      <div className="flex items-start justify-between mb-6">
        <div>
          <h1 className="gradient-heading text-[28px] font-black leading-tight"
            style={{ fontFamily: "var(--font-jakarta)" }}>Clients</h1>
          <p className="text-sm mt-1" style={{ color: "rgba(17,24,39,0.4)" }}>
            Synced from Google Sheets — edit the sheet to update.
          </p>
        </div>
        {sheetUrl && (
          <a href={sheetUrl} target="_blank" rel="noopener noreferrer"
            className="flex items-center gap-2 px-4 py-2.5 rounded-xl text-[13px] font-bold transition-all hover:opacity-80"
            style={{ background: "#F0FDF4", border: "1px solid rgba(22,163,74,0.3)", color: "#16A34A" }}>
            <ExternalLink size={13} /> Open Sheet
          </a>
        )}
      </div>

      {/* Stats */}
      <div className="grid grid-cols-4 gap-3 mb-6">
        {[
          { label: "Total Clients", value: stats.total,   color: "#DC2626", bg: "rgba(220,38,38,0.08)",  border: "rgba(220,38,38,0.15)" },
          { label: "Active",        value: stats.active,  color: "#16A34A", bg: "rgba(22,163,74,0.08)",  border: "rgba(22,163,74,0.15)" },
          { label: "Payment Pending", value: stats.pending, color: "#D97706", bg: "rgba(245,158,11,0.08)", border: "rgba(245,158,11,0.15)" },
          { label: "Paid",          value: stats.paid,    color: "#16A34A", bg: "rgba(22,163,74,0.06)",  border: "rgba(22,163,74,0.12)" },
        ].map(({ label, value, color, bg, border }) => (
          <div key={label} className="rounded-2xl p-5"
            style={{ background: "#FFFFFF", border: `1px solid ${border}` }}>
            <p className="text-[28px] font-black leading-none mb-1"
              style={{ fontFamily: "var(--font-jakarta)", color }}>{value}</p>
            <p className="text-[11px] font-medium" style={{ color: "#6B7280" }}>{label}</p>
          </div>
        ))}
      </div>

      {/* Filters */}
      <div className="flex items-center gap-3 flex-wrap mb-5">
        <div className="relative flex-1 min-w-[200px] max-w-[260px]">
          <Search size={13} className="absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none"
            style={{ color: "#9CA3AF" }} />
          <input value={search} onChange={e => setSearch(e.target.value)}
            placeholder="Search client, company, industry…"
            className="w-full pl-9 pr-4 py-2.5 rounded-xl text-[13px] outline-none"
            style={{ background: "#FFFFFF", border: "1px solid #F0F0F0", boxShadow: "0 1px 3px rgba(0,0,0,0.06)", color: "#111827" }} />
        </div>

        {statuses.length > 0 && (
          <div className="relative">
            <select value={statusFilter} onChange={e => setStatusFilter(e.target.value)} style={selectStyle}>
              <option value="">All Status</option>
              {statuses.map(s => <option key={s} value={s}>{s}</option>)}
            </select>
            <ChevronDown size={11} className="absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none"
              style={{ color: "#9CA3AF" }} />
          </div>
        )}

        {stages.length > 0 && (
          <div className="relative">
            <select value={stageFilter} onChange={e => setStageFilter(e.target.value)} style={selectStyle}>
              <option value="">All Stages</option>
              {stages.map(s => <option key={s} value={s}>{s}</option>)}
            </select>
            <ChevronDown size={11} className="absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none"
              style={{ color: "#9CA3AF" }} />
          </div>
        )}

        {payStatuses.length > 0 && (
          <div className="relative">
            <select value={payFilter} onChange={e => setPayFilter(e.target.value)} style={selectStyle}>
              <option value="">All Payment</option>
              {payStatuses.map(s => <option key={s} value={s}>{s}</option>)}
            </select>
            <ChevronDown size={11} className="absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none"
              style={{ color: "#9CA3AF" }} />
          </div>
        )}

        <span className="ml-auto text-[12px]" style={{ color: "#9CA3AF" }}>
          {filtered.length} of {clients.length}
        </span>
      </div>

      {/* Table */}
      <div className="rounded-2xl overflow-hidden"
        style={{ background: "#FFFFFF", border: "1px solid #F0F0F0", boxShadow: "0 1px 3px rgba(0,0,0,0.06), 0 4px 16px rgba(0,0,0,0.04)" }}>
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr style={{ borderBottom: "1px solid #F3F4F6" }}>
                {["#", "Company", "Customer", "Status", "Stage", "Service", "Package", "Period", "Due Date",
                  "Payment", "Current", "Pending", "Place", "Industry"].map(h => (
                  <th key={h}
                    className="text-left px-4 py-3 text-[10px] font-bold uppercase tracking-[0.12em] whitespace-nowrap"
                    style={{ color: "#9CA3AF", background: "#FAFAFA" }}>
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {filtered.length === 0 ? (
                <tr>
                  <td colSpan={14} className="text-center py-16 text-[13px]" style={{ color: "#9CA3AF" }}>
                    No clients match your filter
                  </td>
                </tr>
              ) : (
                filtered.map((c, i) => {
                  const sc = statusColor(c.client_status)
                  const pc = paymentColor(c.payment_status)
                  return (
                    <tr key={i}
                      className="transition-colors hover:bg-gray-50"
                      style={{ borderBottom: i < filtered.length - 1 ? "1px solid #F9FAFB" : "none" }}>
                      <td className="px-4 py-3 text-[12px]" style={{ color: "#9CA3AF" }}>{c.sno || i + 1}</td>
                      <td className="px-4 py-3">
                        <p className="text-[13px] font-bold whitespace-nowrap" style={{ color: "#111827" }}>
                          {c.company_name || "—"}
                        </p>
                        {c.onboarded_month && (
                          <p className="text-[10px] mt-0.5" style={{ color: "#9CA3AF" }}>
                            Since {c.onboarded_month}
                          </p>
                        )}
                      </td>
                      <td className="px-4 py-3">
                        <p className="text-[12px] whitespace-nowrap" style={{ color: "#374151" }}>{c.customer_name || "—"}</p>
                        {c.mob_no && (
                          <p className="text-[10px] mt-0.5" style={{ color: "#9CA3AF" }}>{c.mob_no}</p>
                        )}
                      </td>
                      <td className="px-4 py-3">
                        {c.client_status ? (
                          <Badge text={c.client_status}
                            style={{ background: sc.bg, color: sc.color, border: `1px solid ${sc.border}` }} />
                        ) : <span style={{ color: "#D1D5DB" }}>—</span>}
                      </td>
                      <td className="px-4 py-3">
                        {c.client_stage ? (
                          <Badge text={c.client_stage}
                            style={{ background: "rgba(220,38,38,0.08)", color: "#B91C1C", border: "1px solid rgba(220,38,38,0.15)" }} />
                        ) : <span style={{ color: "#D1D5DB" }}>—</span>}
                      </td>
                      <td className="px-4 py-3 text-[12px]" style={{ color: "#374151" }}>
                        {c.service || "—"}
                      </td>
                      <td className="px-4 py-3 text-[12px] whitespace-nowrap" style={{ color: "#374151" }}>
                        {c.package_name || "—"}
                      </td>
                      <td className="px-4 py-3 text-[12px] whitespace-nowrap" style={{ color: "#374151" }}>
                        {c.period || "—"}
                      </td>
                      <td className="px-4 py-3 text-[12px] whitespace-nowrap" style={{ color: "#374151" }}>
                        {c.due_date || "—"}
                      </td>
                      <td className="px-4 py-3">
                        {c.payment_status ? (
                          <Badge text={c.payment_status}
                            style={{ background: pc.bg, color: pc.color }} />
                        ) : <span style={{ color: "#D1D5DB" }}>—</span>}
                      </td>
                      <td className="px-4 py-3 text-[12px] font-semibold whitespace-nowrap" style={{ color: "#111827" }}>
                        {c.current_month || "—"}
                      </td>
                      <td className="px-4 py-3 text-[12px] font-semibold whitespace-nowrap"
                        style={{ color: c.pending ? "#DC2626" : "#111827" }}>
                        {c.pending || "—"}
                      </td>
                      <td className="px-4 py-3 text-[12px]" style={{ color: "#374151" }}>
                        {c.place || "—"}
                      </td>
                      <td className="px-4 py-3 text-[12px]" style={{ color: "#374151" }}>
                        {c.industry || "—"}
                      </td>
                    </tr>
                  )
                })
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}
