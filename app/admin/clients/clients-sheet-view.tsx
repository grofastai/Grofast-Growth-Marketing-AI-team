"use client"

import { useState, useMemo } from "react"
import { Search, ChevronDown, Users, UserCheck, UserX, Building2 } from "lucide-react"
import type { SheetClient } from "@/lib/google/sheets"

function StatusBadge({ text, type }: { text: string; type: "active" | "past" }) {
  if (!text) return null
  const styles = type === "active"
    ? { background: "rgba(22,163,74,0.12)", color: "#15803D", border: "1px solid rgba(22,163,74,0.25)" }
    : { background: "rgba(107,114,128,0.1)", color: "#6B7280", border: "1px solid rgba(107,114,128,0.2)" }
  return (
    <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[10px] font-bold" style={styles}>
      <span className="w-1.5 h-1.5 rounded-full inline-block"
        style={{ background: type === "active" ? "#16A34A" : "#9CA3AF" }} />
      {text}
    </span>
  )
}

function ClientTable({
  clients,
  type,
  search,
  industryFilter,
  placeFilter,
}: {
  clients: SheetClient[]
  type: "active" | "past"
  search: string
  industryFilter: string
  placeFilter: string
}) {
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

  if (filtered.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-20"
        style={{ background: "#FFFFFF", borderRadius: "0 0 16px 16px", border: "1px solid #F0F0F0", borderTop: "none" }}>
        <Building2 size={32} style={{ color: "#E5E7EB" }} className="mb-3" />
        <p className="text-[13px] font-semibold" style={{ color: "#9CA3AF" }}>No clients match your filter</p>
      </div>
    )
  }

  return (
    <div style={{ background: "#FFFFFF", borderRadius: "0 0 16px 16px", border: "1px solid #F0F0F0", borderTop: "none", overflow: "hidden" }}>
      <div className="overflow-x-auto">
        <table className="w-full">
          <thead>
            <tr style={{ background: "#F8F9FA", borderBottom: "1px solid #F0F0F0" }}>
              {["#", "Company", "Customer", "Service", "Period", "Place", "Industry", "Onboarded"].map(h => (
                <th key={h} className="text-left px-5 py-3 text-[10px] font-bold uppercase tracking-[0.14em] whitespace-nowrap"
                  style={{ color: "#9CA3AF" }}>
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {filtered.map((c, i) => (
              <tr key={i}
                className="group transition-colors hover:bg-[#FAFAFA]"
                style={{ borderBottom: i < filtered.length - 1 ? "1px solid #F5F5F5" : "none" }}>
                <td className="px-5 py-4">
                  <span className="text-[11px] font-bold w-6 h-6 rounded-lg flex items-center justify-center"
                    style={{ background: type === "active" ? "rgba(220,38,38,0.07)" : "rgba(107,114,128,0.07)",
                      color: type === "active" ? "#DC2626" : "#9CA3AF" }}>
                    {c.sno || i + 1}
                  </span>
                </td>
                <td className="px-5 py-4">
                  <p className="text-[13px] font-bold leading-tight" style={{ color: "#111827" }}>
                    {c.company_name || "—"}
                  </p>
                </td>
                <td className="px-5 py-4">
                  <p className="text-[12px]" style={{ color: "#374151" }}>{c.customer_name || "—"}</p>
                </td>
                <td className="px-5 py-4">
                  <p className="text-[12px]" style={{ color: "#374151" }}>{c.service || "—"}</p>
                </td>
                <td className="px-5 py-4 whitespace-nowrap">
                  <span className="text-[11px] font-semibold px-2.5 py-1 rounded-lg"
                    style={{ background: "#F3F4F6", color: "#374151" }}>
                    {c.period || "—"}
                  </span>
                </td>
                <td className="px-5 py-4 text-[12px]" style={{ color: "#6B7280" }}>
                  {c.place || "—"}
                </td>
                <td className="px-5 py-4 text-[12px]" style={{ color: "#6B7280" }}>
                  {c.industry || "—"}
                </td>
                <td className="px-5 py-4 text-[12px]" style={{ color: "#9CA3AF" }}>
                  {c.onboarded_month || "—"}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="px-5 py-3 flex items-center justify-between"
        style={{ borderTop: "1px solid #F5F5F5", background: "#FAFAFA" }}>
        <p className="text-[11px]" style={{ color: "#9CA3AF" }}>
          Showing <span className="font-bold" style={{ color: "#374151" }}>{filtered.length}</span> of {clients.length} clients
        </p>
      </div>
    </div>
  )
}

export default function ClientsSheetView({
  activeClients,
  pastClients,
}: {
  activeClients: SheetClient[]
  pastClients: SheetClient[]
}) {
  const [tab, setTab]                   = useState<"active" | "past">("active")
  const [search, setSearch]             = useState("")
  const [industryFilter, setIndustry]   = useState("")
  const [placeFilter, setPlace]         = useState("")

  const allClients = tab === "active" ? activeClients : pastClients

  const industries = useMemo(() =>
    [...new Set(allClients.map(c => c.industry).filter(Boolean))].sort(), [allClients])
  const places = useMemo(() =>
    [...new Set(allClients.map(c => c.place).filter(Boolean))].sort(), [allClients])

  const selectStyle: React.CSSProperties = {
    appearance: "none" as const,
    background: "#FFFFFF",
    border: "1px solid #EBEBEB",
    borderRadius: "10px",
    padding: "8px 30px 8px 12px",
    fontSize: "12px",
    color: "#374151",
    outline: "none",
    boxShadow: "0 1px 2px rgba(0,0,0,0.04)",
  }

  const onTabChange = (t: "active" | "past") => {
    setTab(t)
    setSearch("")
    setIndustry("")
    setPlace("")
  }

  return (
    <div className="p-8 max-w-[1400px]">

      {/* Header */}
      <div className="mb-7">
        <h1 className="gradient-heading text-[30px] font-black leading-tight"
          style={{ fontFamily: "var(--font-jakarta)" }}>Clients</h1>
        <p className="text-sm mt-1" style={{ color: "#9CA3AF" }}>
          Synced from Google Sheets · updates every 60 seconds
        </p>
      </div>

      {/* Stat cards */}
      <div className="grid grid-cols-3 gap-4 mb-7">
        <div className="rounded-2xl p-5 flex items-center gap-4"
          style={{ background: "#FFFFFF", border: "1px solid #F0F0F0", boxShadow: "0 1px 3px rgba(0,0,0,0.05), 0 4px 12px rgba(0,0,0,0.03)" }}>
          <div className="w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0"
            style={{ background: "rgba(220,38,38,0.08)" }}>
            <Users size={16} style={{ color: "#DC2626" }} />
          </div>
          <div>
            <p className="text-[26px] font-black leading-none"
              style={{ fontFamily: "var(--font-jakarta)", color: "#111827" }}>
              {activeClients.length + pastClients.length}
            </p>
            <p className="text-[11px] font-medium mt-0.5" style={{ color: "#9CA3AF" }}>Total Clients</p>
          </div>
        </div>
        <div className="rounded-2xl p-5 flex items-center gap-4"
          style={{ background: "#FFFFFF", border: "1px solid rgba(22,163,74,0.2)", boxShadow: "0 1px 3px rgba(0,0,0,0.05), 0 4px 12px rgba(0,0,0,0.03)" }}>
          <div className="w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0"
            style={{ background: "rgba(22,163,74,0.08)" }}>
            <UserCheck size={16} style={{ color: "#16A34A" }} />
          </div>
          <div>
            <p className="text-[26px] font-black leading-none"
              style={{ fontFamily: "var(--font-jakarta)", color: "#16A34A" }}>
              {activeClients.length}
            </p>
            <p className="text-[11px] font-medium mt-0.5" style={{ color: "#9CA3AF" }}>Active Clients</p>
          </div>
        </div>
        <div className="rounded-2xl p-5 flex items-center gap-4"
          style={{ background: "#FFFFFF", border: "1px solid #F0F0F0", boxShadow: "0 1px 3px rgba(0,0,0,0.05), 0 4px 12px rgba(0,0,0,0.03)" }}>
          <div className="w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0"
            style={{ background: "rgba(107,114,128,0.08)" }}>
            <UserX size={16} style={{ color: "#6B7280" }} />
          </div>
          <div>
            <p className="text-[26px] font-black leading-none"
              style={{ fontFamily: "var(--font-jakarta)", color: "#374151" }}>
              {pastClients.length}
            </p>
            <p className="text-[11px] font-medium mt-0.5" style={{ color: "#9CA3AF" }}>Past Clients</p>
          </div>
        </div>
      </div>

      {/* Tab + Filters row */}
      <div className="flex items-center gap-3 flex-wrap mb-0">
        {/* Tab switcher */}
        <div className="flex items-center p-1 rounded-xl gap-1"
          style={{ background: "#F3F4F6", border: "1px solid #E5E7EB" }}>
          <button onClick={() => onTabChange("active")}
            className="px-4 py-2 rounded-lg text-[12px] font-bold transition-all flex items-center gap-1.5"
            style={tab === "active"
              ? { background: "#FFFFFF", color: "#DC2626", boxShadow: "0 1px 4px rgba(0,0,0,0.1)" }
              : { color: "#6B7280" }}>
            <span className="w-2 h-2 rounded-full" style={{ background: tab === "active" ? "#16A34A" : "#D1D5DB" }} />
            Active ({activeClients.length})
          </button>
          <button onClick={() => onTabChange("past")}
            className="px-4 py-2 rounded-lg text-[12px] font-bold transition-all flex items-center gap-1.5"
            style={tab === "past"
              ? { background: "#FFFFFF", color: "#374151", boxShadow: "0 1px 4px rgba(0,0,0,0.1)" }
              : { color: "#6B7280" }}>
            <span className="w-2 h-2 rounded-full" style={{ background: tab === "past" ? "#9CA3AF" : "#D1D5DB" }} />
            Past ({pastClients.length})
          </button>
        </div>

        {/* Search */}
        <div className="relative flex-1 min-w-[200px] max-w-[260px]">
          <Search size={13} className="absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none"
            style={{ color: "#9CA3AF" }} />
          <input value={search} onChange={e => setSearch(e.target.value)}
            placeholder="Search name, company, service…"
            className="w-full pl-9 pr-4 py-2 rounded-xl text-[12px] outline-none"
            style={{ background: "#FFFFFF", border: "1px solid #EBEBEB", boxShadow: "0 1px 2px rgba(0,0,0,0.04)", color: "#111827" }} />
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
      </div>

      {/* Divider connecting tabs to table */}
      <div className="mt-3">
        <ClientTable
          clients={allClients}
          type={tab}
          search={search}
          industryFilter={industryFilter}
          placeFilter={placeFilter}
        />
      </div>
    </div>
  )
}
