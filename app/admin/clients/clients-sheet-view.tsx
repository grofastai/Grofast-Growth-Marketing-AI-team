"use client"

import { useState, useMemo } from "react"
import { Search, ChevronDown, MapPin, Calendar, User, Briefcase } from "lucide-react"
import type { SheetClient } from "@/lib/google/sheets"

const INDUSTRY_COLORS: Record<string, { bg: string; color: string }> = {
  default: { bg: "rgba(222,26,26,0.08)", color: "#B91C1C" },
}

function getIndustryStyle(industry: string) {
  return INDUSTRY_COLORS[industry] ?? INDUSTRY_COLORS.default
}

function ClientCard({ c, type }: { c: SheetClient; type: "active" | "past" }) {
  const isActive = type === "active"
  const accentColor = isActive ? "#de1a1a" : "#6B7280"
  const ind = getIndustryStyle(c.industry)

  return (
    <div
      className="rounded-2xl flex flex-col transition-all hover:-translate-y-0.5"
      style={{
        background: "#FFFFFF",
        border: "1px solid #E5E7EB",
        boxShadow: "0 1px 4px rgba(0,0,0,0.05), 0 4px 16px rgba(0,0,0,0.04)",
        overflow: "hidden",
      }}
    >
      {/* Accent top bar */}
      <div style={{ height: "3px", background: isActive
        ? "linear-gradient(90deg, #de1a1a 0%, #F87171 100%)"
        : "linear-gradient(90deg, #6B7280 0%, #D1D5DB 100%)" }} />

      <div className="p-5 flex flex-col gap-3 flex-1">

        {/* Status + serial */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-1.5">
            <span className="w-2 h-2 rounded-full flex-shrink-0"
              style={{ background: accentColor }} />
            <span className="text-[10px] font-bold uppercase tracking-[0.14em]"
              style={{ color: accentColor }}>
              {isActive ? "Active" : "Past"}
            </span>
          </div>
          {c.sno && (
            <span className="text-[10px] font-bold px-2 py-0.5 rounded-full"
              style={{ background: "#F3F4F6", color: "#6B7280" }}>
              #{c.sno}
            </span>
          )}
        </div>

        {/* Company name */}
        <div>
          <h3 className="text-[15px] font-black leading-tight"
            style={{ fontFamily: "var(--font-jakarta)", color: "#111827" }}>
            {c.company_name || "—"}
          </h3>
          {c.customer_name && (
            <div className="flex items-center gap-1.5 mt-1">
              <User size={10} style={{ color: "#6B7280" }} />
              <p className="text-[12px]" style={{ color: "#6B7280" }}>{c.customer_name}</p>
            </div>
          )}
        </div>

        {/* Pills */}
        <div className="flex flex-wrap gap-1.5">
          {c.service && (
            <span className="text-[10px] font-semibold px-2.5 py-1 rounded-full"
              style={{ background: "rgba(222,26,26,0.07)", color: "#B91C1C" }}>
              {c.service}
            </span>
          )}
          {c.industry && (
            <span className="text-[10px] font-semibold px-2.5 py-1 rounded-full"
              style={{ background: ind.bg, color: ind.color, border: "1px solid rgba(0,0,0,0.05)" }}>
              {c.industry}
            </span>
          )}
        </div>

        {/* Divider */}
        <div style={{ height: "1px", background: "#F5F5F5" }} />

        {/* Footer info */}
        <div className="flex flex-col gap-1.5">
          {c.period && (
            <div className="flex items-center gap-2">
              <Briefcase size={10} style={{ color: "#6B7280" }} />
              <span className="text-[11px] font-semibold" style={{ color: "#374151" }}>{c.period}</span>
            </div>
          )}
          {c.place && (
            <div className="flex items-center gap-2">
              <MapPin size={10} style={{ color: "#6B7280" }} />
              <span className="text-[11px]" style={{ color: "#6B7280" }}>{c.place}</span>
            </div>
          )}
          {c.onboarded_month && (
            <div className="flex items-center gap-2">
              <Calendar size={10} style={{ color: "#6B7280" }} />
              <span className="text-[11px]" style={{ color: "#6B7280" }}>Since {c.onboarded_month}</span>
            </div>
          )}
        </div>

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
  const [tab, setTab]                 = useState<"active" | "past">("active")
  const [search, setSearch]           = useState("")
  const [industryFilter, setIndustry] = useState("")
  const [placeFilter, setPlace]       = useState("")

  const allClients = tab === "active" ? activeClients : pastClients

  const industries = useMemo(() =>
    [...new Set(allClients.map(c => c.industry).filter(Boolean))].sort(), [allClients])
  const places = useMemo(() =>
    [...new Set(allClients.map(c => c.place).filter(Boolean))].sort(), [allClients])

  const filtered = useMemo(() => {
    const q = search.toLowerCase()
    return allClients.filter(c => {
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
  }, [allClients, search, industryFilter, placeFilter])

  const onTabChange = (t: "active" | "past") => {
    setTab(t); setSearch(""); setIndustry(""); setPlace("")
  }

  const selectStyle: React.CSSProperties = {
    appearance: "none" as const,
    background: "#FFFFFF",
    border: "1px solid #EBEBEB",
    borderRadius: "10px",
    padding: "8px 30px 8px 12px",
    fontSize: "12px",
    color: "#374151",
    outline: "none",
  }

  return (
    <div className="p-6 md:p-8 max-w-[1400px]">

      {/* Header */}
      <div className="mb-6">
        <h1 className="gradient-heading text-[30px] font-black leading-tight"
          style={{ fontFamily: "var(--font-jakarta)" }}>Clients</h1>
        <p className="text-sm mt-1" style={{ color: "#6B7280" }}>
          Synced from Google Sheets · auto-updates every 60 s
        </p>
      </div>

      {/* Summary strip */}
      <div className="flex items-stretch gap-3 mb-6 flex-wrap">
        {[
          {
            label: "Total", value: activeClients.length + pastClients.length,
            accent: "#111827", dim: "#F3F4F6",
          },
          {
            label: "Active", value: activeClients.length,
            accent: "#16A34A", dim: "rgba(22,163,74,0.08)",
          },
          {
            label: "Past", value: pastClients.length,
            accent: "#6B7280", dim: "rgba(107,114,128,0.08)",
          },
        ].map(s => (
          <div key={s.label}
            className="flex items-center gap-3 px-5 py-3.5 rounded-2xl flex-1 min-w-[120px]"
            style={{ background: "#FFFFFF", border: "1px solid #E5E7EB",
              boxShadow: "0 1px 3px rgba(0,0,0,0.04)" }}>
            <div className="w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0"
              style={{ background: s.dim }}>
              <span className="text-[13px] font-black" style={{ color: s.accent }}>
                {s.value}
              </span>
            </div>
            <span className="text-[12px] font-semibold" style={{ color: "#6B7280" }}>{s.label}</span>
          </div>
        ))}
      </div>

      {/* Controls */}
      <div className="flex items-center gap-3 flex-wrap mb-6">
        {/* Tab pills */}
        <div className="flex p-1 rounded-xl gap-0.5"
          style={{ background: "#F3F4F6", border: "1px solid #E5E7EB" }}>
          <button onClick={() => onTabChange("active")}
            className="px-4 py-2 rounded-lg text-[12px] font-bold transition-all"
            style={tab === "active"
              ? { background: "#FFFFFF", color: "#de1a1a", boxShadow: "0 1px 4px rgba(0,0,0,0.1)" }
              : { color: "#6B7280" }}>
            Active · {activeClients.length}
          </button>
          <button onClick={() => onTabChange("past")}
            className="px-4 py-2 rounded-lg text-[12px] font-bold transition-all"
            style={tab === "past"
              ? { background: "#FFFFFF", color: "#374151", boxShadow: "0 1px 4px rgba(0,0,0,0.1)" }
              : { color: "#6B7280" }}>
            Past · {pastClients.length}
          </button>
        </div>

        {/* Search */}
        <div className="relative flex-1 min-w-[180px] max-w-[260px]">
          <Search size={13} className="absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none"
            style={{ color: "#6B7280" }} />
          <input value={search} onChange={e => setSearch(e.target.value)}
            placeholder="Search…"
            className="w-full pl-9 pr-4 py-2 rounded-xl text-[12px] outline-none"
            style={{ background: "#FFFFFF", border: "1px solid #EBEBEB", color: "#111827" }} />
        </div>

        {industries.length > 0 && (
          <div className="relative">
            <select value={industryFilter} onChange={e => setIndustry(e.target.value)} style={selectStyle}>
              <option value="">All Industries</option>
              {industries.map(s => <option key={s} value={s}>{s}</option>)}
            </select>
            <ChevronDown size={11} className="absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none"
              style={{ color: "#6B7280" }} />
          </div>
        )}

        {places.length > 0 && (
          <div className="relative">
            <select value={placeFilter} onChange={e => setPlace(e.target.value)} style={selectStyle}>
              <option value="">All Places</option>
              {places.map(s => <option key={s} value={s}>{s}</option>)}
            </select>
            <ChevronDown size={11} className="absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none"
              style={{ color: "#6B7280" }} />
          </div>
        )}

        <span className="ml-auto text-[11px] font-medium" style={{ color: "#6B7280" }}>
          {filtered.length} of {allClients.length}
        </span>
      </div>

      {/* Cards grid */}
      {filtered.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-24 rounded-2xl"
          style={{ background: "#FFFFFF", border: "1px solid #E5E7EB" }}>
          <Search size={32} style={{ color: "#E5E7EB" }} className="mb-3" />
          <p className="text-[13px] font-semibold" style={{ color: "#6B7280" }}>No clients match your filter</p>
        </div>
      ) : (
        <div className="grid gap-4"
          style={{ gridTemplateColumns: "repeat(auto-fill, minmax(260px, 1fr))" }}>
          {filtered.map((c, i) => (
            <ClientCard key={i} c={c} type={tab} />
          ))}
        </div>
      )}
    </div>
  )
}
