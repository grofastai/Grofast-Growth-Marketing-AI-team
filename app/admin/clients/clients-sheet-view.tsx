"use client"

import { useState, useMemo } from "react"
import { Search, ChevronDown } from "lucide-react"
import type { SheetClient } from "@/lib/google/sheets"

export default function ClientsSheetView({
  clients,
}: {
  clients: SheetClient[]
}) {
  const [search, setSearch]             = useState("")
  const [industryFilter, setIndustry]   = useState("")
  const [placeFilter, setPlace]         = useState("")

  const industries = useMemo(() =>
    [...new Set(clients.map(c => c.industry).filter(Boolean))].sort(), [clients])
  const places = useMemo(() =>
    [...new Set(clients.map(c => c.place).filter(Boolean))].sort(), [clients])

  const filtered = useMemo(() => {
    const q = search.toLowerCase()
    return clients.filter(c => {
      if (industryFilter && c.industry !== industryFilter) return false
      if (placeFilter && c.place !== placeFilter) return false
      if (!q) return true
      return (
        c.company_name.toLowerCase().includes(q) ||
        c.customer_name.toLowerCase().includes(q) ||
        c.place.toLowerCase().includes(q) ||
        c.industry.toLowerCase().includes(q) ||
        c.service.toLowerCase().includes(q)
      )
    })
  }, [clients, search, industryFilter, placeFilter])

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
        <span className="text-[13px] font-semibold px-3 py-1.5 rounded-xl"
          style={{ background: "rgba(220,38,38,0.08)", color: "#DC2626" }}>
          {clients.length} clients
        </span>
      </div>

      {/* Filters */}
      <div className="flex items-center gap-3 flex-wrap mb-5">
        <div className="relative flex-1 min-w-[200px] max-w-[280px]">
          <Search size={13} className="absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none"
            style={{ color: "#9CA3AF" }} />
          <input value={search} onChange={e => setSearch(e.target.value)}
            placeholder="Search name, company, service…"
            className="w-full pl-9 pr-4 py-2.5 rounded-xl text-[13px] outline-none"
            style={{ background: "#FFFFFF", border: "1px solid #F0F0F0", boxShadow: "0 1px 3px rgba(0,0,0,0.06)", color: "#111827" }} />
        </div>

        {industries.length > 0 && (
          <div className="relative">
            <select value={industryFilter} onChange={e => setIndustry(e.target.value)} style={selectStyle}>
              <option value="">All Industries</option>
              {industries.map(s => <option key={s} value={s}>{s}</option>)}
            </select>
            <ChevronDown size={11} className="absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none"
              style={{ color: "#9CA3AF" }} />
          </div>
        )}

        {places.length > 0 && (
          <div className="relative">
            <select value={placeFilter} onChange={e => setPlace(e.target.value)} style={selectStyle}>
              <option value="">All Places</option>
              {places.map(s => <option key={s} value={s}>{s}</option>)}
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
                {["#", "Company Name", "Customer Name", "Service", "Industry", "Place", "Period", "Onboarded"].map(h => (
                  <th key={h}
                    className="text-left px-5 py-3.5 text-[10px] font-bold uppercase tracking-[0.12em] whitespace-nowrap"
                    style={{ color: "#9CA3AF", background: "#FAFAFA" }}>
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {filtered.length === 0 ? (
                <tr>
                  <td colSpan={8} className="text-center py-16 text-[13px]" style={{ color: "#9CA3AF" }}>
                    No clients match your filter
                  </td>
                </tr>
              ) : (
                filtered.map((c, i) => (
                  <tr key={i}
                    className="transition-colors hover:bg-gray-50"
                    style={{ borderBottom: i < filtered.length - 1 ? "1px solid #F9FAFB" : "none" }}>
                    <td className="px-5 py-3.5 text-[12px]" style={{ color: "#9CA3AF" }}>
                      {c.sno || i + 1}
                    </td>
                    <td className="px-5 py-3.5">
                      <p className="text-[13px] font-bold" style={{ color: "#111827" }}>
                        {c.company_name || "—"}
                      </p>
                    </td>
                    <td className="px-5 py-3.5 text-[13px]" style={{ color: "#374151" }}>
                      {c.customer_name || "—"}
                    </td>
                    <td className="px-5 py-3.5 text-[12px]" style={{ color: "#374151" }}>
                      {c.service || "—"}
                    </td>
                    <td className="px-5 py-3.5 text-[12px]" style={{ color: "#374151" }}>
                      {c.industry || "—"}
                    </td>
                    <td className="px-5 py-3.5 text-[12px]" style={{ color: "#374151" }}>
                      {c.place || "—"}
                    </td>
                    <td className="px-5 py-3.5 text-[12px] whitespace-nowrap" style={{ color: "#374151" }}>
                      {c.period || "—"}
                    </td>
                    <td className="px-5 py-3.5 text-[12px] whitespace-nowrap" style={{ color: "#6B7280" }}>
                      {c.onboarded_month || "—"}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}
