"use client"

import { useState } from "react"
import FlMediaClient from "./fl-media-client"
import FreelancersMemberClient from "@/app/member/freelancers/freelancers-member-client"
import type { Freelancer, WorkEntry } from "@/app/member/freelancers/freelancers-member-client"
import type { FlMediaMember, FlMediaEntry } from "./fl-media-client"

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
  const [tab, setTab] = useState<"media" | "freelancers">("media")

  const tabs = [
    { id: "media" as const, label: "Freelance Media Production", count: flMembers.length },
    { id: "freelancers" as const, label: "Freelancers", count: freelancers.length },
  ]

  return (
    <>
      {/* Tab bar */}
      <div style={{ display: "flex", gap: 0 }}>
        {tabs.map(t => (
          <button
            key={t.id}
            onClick={() => setTab(t.id)}
            style={{
              padding: "8px 18px",
              fontSize: 12,
              fontWeight: tab === t.id ? 800 : 600,
              color: tab === t.id ? "#DE1A1A" : "#6B7280",
              background: "transparent",
              border: "none",
              borderBottom: `2px solid ${tab === t.id ? "#DE1A1A" : "transparent"}`,
              cursor: "pointer",
              display: "flex",
              alignItems: "center",
              gap: 6,
            }}
          >
            {t.label}
            <span style={{ fontSize: 10, background: tab === t.id ? "rgba(222,26,26,0.1)" : "#F3F4F6", color: tab === t.id ? "#DE1A1A" : "#9CA3AF", borderRadius: 99, padding: "1px 6px", fontWeight: 700 }}>{t.count}</span>
          </button>
        ))}
      </div>

      {/* Tab content */}
      <div style={{ marginTop: -1 }}>
        {tab === "media" ? (
          <FlMediaClient members={flMembers} entries={flEntries} />
        ) : (
          <FreelancersMemberClient
            freelancers={freelancers}
            workEntries={workEntries}
            clientNames={clientNames}
            pastClientNames={pastClientNames}
          />
        )}
      </div>
    </>
  )
}
