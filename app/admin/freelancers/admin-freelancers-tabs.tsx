"use client"

import { useState, useMemo } from "react"
import { Sparkles, Users, Briefcase, FileText } from "lucide-react"
import FlMediaClient from "./fl-media-client"
import FreelancersMemberClient from "@/app/member/freelancers/freelancers-member-client"
import type { Freelancer, WorkEntry } from "@/app/member/freelancers/freelancers-member-client"
import type { FlMediaMember, FlMediaEntry } from "./fl-media-client"

// ── Helpers ───────────────────────────────────────────────────────────────────

function getInitials(name: string) {
  return name.split(" ").map(n => n[0]).join("").slice(0, 2).toUpperCase()
}
function fmt(n: number) {
  return `₹${n.toLocaleString("en-IN", { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`
}

const TEAM_COLOR: Record<string, string> = {
  "Freelance RJ Voiceover":            "#A855F7",
  "Freelance Graphics Designer":        "#F97316",
  "Freelance Content Writer":           "#14B8A6",
  "Freelance Software Development & Automation": "#6366F1",
  "Freelance Marketing & Operations":   "#10B981",
  "Freelance AI Development & Creative Production": "#8B5CF6",
  "Freelance Video Editing":            "#6366F1",
  "Freelance Videography":              "#0EA5E9",
}
const TEAM_EMOJI: Record<string, string> = {
  "Freelance RJ Voiceover":            "🎙️",
  "Freelance Graphics Designer":        "🎨",
  "Freelance Content Writer":           "✍️",
  "Freelance Software Development & Automation": "💻",
  "Freelance Marketing & Operations":   "📊",
  "Freelance AI Development & Creative Production": "🖥️",
  "Freelance Video Editing":            "🎬",
  "Freelance Videography":              "📹",
}
const TEAM_SHORT: Record<string, string> = {
  "Freelance RJ Voiceover":            "RJ Voiceover",
  "Freelance Graphics Designer":        "Graphics",
  "Freelance Content Writer":           "Content",
  "Freelance Software Development & Automation": "SW Dev & Auto",
  "Freelance Marketing & Operations":   "Marketing",
  "Freelance AI Development & Creative Production": "AI & Creative",
  "Freelance Video Editing":            "Video Editing",
  "Freelance Videography":              "Videography",
}

// ── Main unified component ────────────────────────────────────────────────────

export default function AdminFreelancersTabs({
  flMembers,
  flEntries,
  freelancers,
  workEntries,
  clientNames,
  pastClientNames,
}: {
  flMembers: FlMediaMember[]
  flEntries: FlMediaEntry[]
  freelancers: Freelancer[]
  workEntries: WorkEntry[]
  clientNames: string[]
  pastClientNames: string[]
}) {
  const [selected, setSelected] = useState<{ type: "media" | "fl"; id: string } | null>(null)
  const [mobileShowRight, setMobileShowRight] = useState(false)

  const flMediaTotals = useMemo(() => {
    const map: Record<string, number> = {}
    for (const e of flEntries) {
      if (e.price != null) map[e.user_id] = (map[e.user_id] ?? 0) + e.price
    }
    return map
  }, [flEntries])

  const flTotals = useMemo(() => {
    const map: Record<string, number> = {}
    for (const e of workEntries) {
      map[e.freelancer_id] = (map[e.freelancer_id] ?? 0) + (e.amount ?? 0)
    }
    return map
  }, [workEntries])

  const activeFreelancers = useMemo(() => freelancers.filter(f => f.status === "active"), [freelancers])
  const totalCount = flMembers.length + activeFreelancers.length

  const loginMemberEntries = useMemo(() => flEntries.map(e => ({
    id: e.entry_id,
    user_id: e.user_id,
    user_name: e.user_name,
    date: e.date,
    title: e.title,
    client_name: e.client_name,
    price: e.price ?? null,
  })), [flEntries])

  return (
    <div style={{ height: "100vh", display: "flex", flexDirection: "column", overflow: "hidden", background: "#F8F9FB" }}>

      {/* ── Hero header ──────────────────────────────────────────────────────── */}
      <div style={{ flexShrink: 0, margin: "14px 14px 0", borderRadius: 18, overflow: "hidden", background: "linear-gradient(135deg, #de1a1a 0%, #991B1B 50%, #7F1D1D 100%)", boxShadow: "0 6px 24px rgba(222,26,26,0.3)", position: "relative" }}>
        <div style={{ position: "absolute", top: -30, right: -30, width: 140, height: 140, borderRadius: "50%", background: "rgba(255,255,255,0.06)", pointerEvents: "none" }} />
        <div style={{ position: "absolute", bottom: -20, right: 140, width: 90, height: 90, borderRadius: "50%", background: "rgba(255,255,255,0.04)", pointerEvents: "none" }} />
        <div style={{ padding: "14px 16px", display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, position: "relative", zIndex: 1 }}>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 7, marginBottom: 4 }}>
              <div style={{ background: "rgba(255,255,255,0.2)", borderRadius: 7, padding: "3px 5px", display: "flex", alignItems: "center" }}>
                <Sparkles size={12} style={{ color: "#FFD700" }} />
              </div>
              <span style={{ fontSize: 9, fontWeight: 700, color: "rgba(255,255,255,0.7)", textTransform: "uppercase", letterSpacing: "0.15em" }}>Admin Dashboard</span>
            </div>
            <h1 style={{ fontSize: "clamp(18px,5vw,28px)", fontWeight: 900, color: "#FFFFFF", margin: "0 0 2px", lineHeight: 1.1 }}>Freelancers</h1>
            <div style={{ display: "flex", gap: 6, marginTop: 6, flexWrap: "wrap" }}>
              {([
                { icon: <Users size={9} />, label: `${activeFreelancers.length} Freelancers` },
                { icon: <Briefcase size={9} />, label: `${workEntries.length} Entries` },
                { icon: <FileText size={9} />, label: `${flMembers.length} Media` },
              ] as const).map(s => (
                <div key={s.label} style={{ display: "flex", alignItems: "center", gap: 4, background: "rgba(255,255,255,0.15)", borderRadius: 14, padding: "2px 8px" }}>
                  <span style={{ color: "rgba(255,255,255,0.8)" }}>{s.icon}</span>
                  <span style={{ fontSize: 9, fontWeight: 700, color: "#FFFFFF" }}>{s.label}</span>
                </div>
              ))}
            </div>
          </div>
          <div style={{ width: 34, height: 34, borderRadius: 10, background: "rgba(255,255,255,0.2)", border: "2px solid rgba(255,255,255,0.3)", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
            <Briefcase size={15} style={{ color: "#FFFFFF" }} />
          </div>
        </div>
      </div>

      {/* ── Two-panel body ───────────────────────────────────────────────────── */}
      <div className="flex flex-col md:flex-row" style={{ flex: 1, minHeight: 0, overflow: "hidden", background: "#fff", marginTop: 10, borderTop: "1px solid #F0F1F5" }}>

        {/* ── Unified left panel ─────────────────────────────────────────────── */}
        <div className={(selected || mobileShowRight) ? "hidden md:flex md:flex-col md:w-[220px]" : "flex flex-col w-full md:w-[220px]"}
          style={{ flexShrink: 0, borderRight: "1px solid #F0F1F5", background: "#FAFAFA", overflowY: "auto" }}>

          <button onClick={() => { setSelected(null); setMobileShowRight(true) }} style={{ width: "100%", padding: "10px 14px 6px", display: "flex", alignItems: "center", justifyContent: "space-between", background: !selected ? "rgba(99,102,241,0.06)" : "transparent", border: "none", borderLeft: `3px solid ${!selected ? "#6366F1" : "transparent"}`, cursor: "pointer", textAlign: "left" }}>
            <span style={{ fontSize: 9, fontWeight: 700, color: !selected ? "#6366F1" : "#9CA3AF", textTransform: "uppercase", letterSpacing: "0.1em" }}>All Members</span>
            <span style={{ fontSize: 10, fontWeight: 700, color: "#9CA3AF", background: "#F0F0F5", borderRadius: 99, padding: "1px 7px" }}>{totalCount}</span>
          </button>

        {/* FL Media Production members (login-based) */}
        {flMembers.length > 0 && (
          <>
            <div style={{ padding: "4px 14px 2px", fontSize: 8, fontWeight: 700, color: "#DE1A1A", textTransform: "uppercase", letterSpacing: "0.1em", opacity: 0.7 }}>
              Login Members
            </div>
            {flMembers.map(m => {
              const isActive = selected?.type === "media" && selected.id === m.id
              const total = flMediaTotals[m.id] ?? 0
              return (
                <button key={m.id} onClick={() => setSelected(s => s?.id === m.id ? null : { type: "media", id: m.id })}
                  style={{ width: "100%", display: "flex", alignItems: "center", gap: 10, padding: "9px 14px", background: isActive ? "rgba(222,26,26,0.07)" : "transparent", border: "none", borderLeft: `3px solid ${isActive ? "#DE1A1A" : "transparent"}`, cursor: "pointer", textAlign: "left", transition: "all 0.15s" }}>
                  <div style={{ width: 34, height: 34, borderRadius: "50%", flexShrink: 0, background: isActive ? "#DE1A1A" : "#F3F4F6", border: `1.5px solid ${isActive ? "transparent" : "#E5E7EB"}`, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 11, fontWeight: 900, color: isActive ? "#fff" : "#374151", boxShadow: isActive ? "0 4px 10px rgba(222,26,26,0.3)" : "none" }}>
                    {getInitials(m.name)}
                  </div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <p style={{ fontSize: 12, fontWeight: 700, color: "#111", margin: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{m.name}</p>
                    <div style={{ display: "flex", alignItems: "center", gap: 4, marginTop: 2 }}>
                      <span style={{ fontSize: 9, fontWeight: 800, color: "#DE1A1A", background: "rgba(222,26,26,0.08)", padding: "1px 5px", borderRadius: 4, letterSpacing: "0.04em" }}>LOGIN</span>
                      {total > 0 && <span style={{ fontSize: 10, fontWeight: 700, color: "#22C55E" }}>{fmt(total)}</span>}
                    </div>
                  </div>
                </button>
              )
            })}
            <div style={{ margin: "6px 14px", borderTop: "1px solid #E5E7EB" }} />
          </>
        )}

        {/* Regular freelancers */}
        {activeFreelancers.length > 0 && (
          <>
            <div style={{ padding: "2px 14px 2px", fontSize: 8, fontWeight: 700, color: "#6B7280", textTransform: "uppercase", letterSpacing: "0.1em", opacity: 0.7 }}>
              Freelancers
            </div>
            {activeFreelancers.map(f => {
              const isActive = selected?.type === "fl" && selected.id === f.id
              const total = flTotals[f.id] ?? 0
              const color = TEAM_COLOR[f.team] ?? "#6B7280"
              const emoji = TEAM_EMOJI[f.team] ?? "👤"
              const short = TEAM_SHORT[f.team] ?? f.team
              return (
                <button key={f.id} onClick={() => setSelected(s => s?.id === f.id ? null : { type: "fl", id: f.id })}
                  style={{ width: "100%", display: "flex", alignItems: "center", gap: 10, padding: "9px 14px", background: isActive ? `${color}12` : "transparent", border: "none", borderLeft: `3px solid ${isActive ? color : "transparent"}`, cursor: "pointer", textAlign: "left", transition: "all 0.15s" }}>
                  <div style={{ width: 34, height: 34, borderRadius: "50%", flexShrink: 0, background: isActive ? `linear-gradient(135deg, ${color}, ${color}CC)` : `${color}15`, border: `1.5px solid ${isActive ? "transparent" : `${color}30`}`, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 11, fontWeight: 900, color: isActive ? "#fff" : color, boxShadow: isActive ? `0 4px 10px ${color}40` : "none" }}>
                    {getInitials(f.name)}
                  </div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <p style={{ fontSize: 12, fontWeight: 700, color: "#111", margin: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{f.name}</p>
                    <p style={{ fontSize: 10, margin: "1px 0 0", fontWeight: 600, color }}>
                      {emoji} {short}
                      {total > 0 && <span style={{ marginLeft: 4, color: "#22C55E", fontWeight: 700 }}>{fmt(total)}</span>}
                    </p>
                  </div>
                </button>
              )
            })}
          </>
        )}

          {totalCount === 0 && (
            <div style={{ padding: 20, textAlign: "center", fontSize: 12, color: "#9CA3AF" }}>No members yet</div>
          )}
        </div>

        {/* ── Right panel ────────────────────────────────────────────────────── */}
        <div className={(!selected && !mobileShowRight) ? "hidden md:flex md:flex-col" : "flex flex-col"}
          style={{ flex: 1, minHeight: 0, overflow: "hidden" }}>

          {/* Back button — mobile only */}
          {(selected || mobileShowRight) && (
            <button className="md:hidden flex items-center gap-2 px-4 py-3 text-[13px] font-bold text-gray-600 border-b border-gray-100 bg-white"
              onClick={() => { setSelected(null); setMobileShowRight(false) }}>
              ← Back to All Members
            </button>
          )}

          {/* FL Media Production member → price-entry table */}
          {selected?.type === "media" && (
            <FlMediaClient
              key={selected.id}
              members={flMembers}
              entries={flEntries}
              hideLeftPanel
              forceMemberId={selected.id}
            />
          )}

          {/* Combined view (default) OR individual freelancer */}
          {selected?.type !== "media" && (
            <FreelancersMemberClient
              key={selected?.id ?? "combined"}
              freelancers={freelancers}
              workEntries={workEntries}
              clientNames={clientNames}
              pastClientNames={pastClientNames}
              hideLeftPanel
              initialSelectedId={selected?.id}
              isEmbedded
              loginMemberEntries={loginMemberEntries}
            />
          )}
        </div>
      </div>
    </div>
  )
}
