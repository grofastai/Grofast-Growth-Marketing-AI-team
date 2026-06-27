"use client"

import { useState, useMemo } from "react"
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
  "Freelance Development & Automation": "#6366F1",
  "Freelance Marketing & Operations":   "#10B981",
  "Freelance IT Technology & Media":    "#8B5CF6",
  "Freelance Video Editing":            "#6366F1",
  "Freelance Videography":              "#0EA5E9",
}
const TEAM_EMOJI: Record<string, string> = {
  "Freelance RJ Voiceover":            "🎙️",
  "Freelance Graphics Designer":        "🎨",
  "Freelance Content Writer":           "✍️",
  "Freelance Development & Automation": "💻",
  "Freelance Marketing & Operations":   "📊",
  "Freelance IT Technology & Media":    "🖥️",
  "Freelance Video Editing":            "🎬",
  "Freelance Videography":              "📹",
}
const TEAM_SHORT: Record<string, string> = {
  "Freelance RJ Voiceover":            "RJ Voiceover",
  "Freelance Graphics Designer":        "Graphics",
  "Freelance Content Writer":           "Content",
  "Freelance Development & Automation": "Dev & Auto",
  "Freelance Marketing & Operations":   "Marketing",
  "Freelance IT Technology & Media":    "IT & Media",
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

  const loginMembersTotal = useMemo(() =>
    Object.values(flMediaTotals).reduce((s, v) => s + v, 0),
    [flMediaTotals]
  )

  return (
    <div style={{ display: "flex", height: "calc(100vh - 80px)", marginTop: -1, borderTop: "1px solid #F0F1F5" }}>

      {/* ── Unified left panel ───────────────────────────────────────────────── */}
      <div style={{ width: 220, flexShrink: 0, borderRight: "1px solid #F0F1F5", background: "#FAFAFA", overflowY: "auto", display: "flex", flexDirection: "column" }}>

        <div style={{ padding: "10px 14px 6px", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <span style={{ fontSize: 9, fontWeight: 700, color: "#9CA3AF", textTransform: "uppercase", letterSpacing: "0.1em" }}>All Members</span>
          <span style={{ fontSize: 10, fontWeight: 700, color: "#9CA3AF", background: "#F0F0F5", borderRadius: 99, padding: "1px 7px" }}>{totalCount}</span>
        </div>

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
                <button key={m.id} onClick={() => setSelected({ type: "media", id: m.id })}
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
                <button key={f.id} onClick={() => setSelected({ type: "fl", id: f.id })}
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

      {/* ── Right panel ──────────────────────────────────────────────────────── */}
      <div style={{ flex: 1, overflow: "hidden", height: "100%" }}>

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
            loginMembersCount={flMembers.length}
            loginMembersTotal={loginMembersTotal}
          />
        )}
      </div>
    </div>
  )
}
