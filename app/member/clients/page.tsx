export const revalidate = 60

import { createServerClient } from "@/lib/supabase/server"
import { redirect } from "next/navigation"
import { fetchSheetClients, stripFinancialFields, type SheetClient } from "@/lib/google/sheets"

function ini(name: string) {
  return name.split(" ").map(n => n[0] ?? "").join("").slice(0, 2).toUpperCase() || "??"
}

const STATUS_STYLE: Record<string, { bg: string; color: string; label: string }> = {
  active:   { bg: "rgba(22,163,74,0.1)",   color: "#16A34A", label: "Active"   },
  past:     { bg: "rgba(107,114,128,0.1)", color: "#6B7280", label: "Past"     },
  inactive: { bg: "rgba(107,114,128,0.1)", color: "#6B7280", label: "Inactive" },
}
function statusStyle(c: SheetClient, isPast: boolean) {
  if (isPast) return STATUS_STYLE.past
  const s = c.client_status.toLowerCase()
  if (s.includes("active") || s.includes("current")) return STATUS_STYLE.active
  return STATUS_STYLE.inactive
}

export default async function MemberClientsPage() {
  const supabase = await createServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect("/login")

  const sheetId  = process.env.GOOGLE_CLIENTS_SHEET_ID
  const sheetGid = process.env.GOOGLE_CLIENTS_SHEET_GID
  const pastGid  = process.env.GOOGLE_PAST_CLIENTS_SHEET_GID

  if (!sheetId) {
    return (
      <div style={{ display: "flex", alignItems: "center", justifyContent: "center", minHeight: "60vh", flexDirection: "column", gap: 12 }}>
        <div style={{ fontSize: 40 }}>📋</div>
        <p style={{ fontSize: 16, fontWeight: 700, color: "#374151" }}>Client data not configured</p>
        <p style={{ fontSize: 13, color: "#9CA3AF" }}>Contact your admin to set up the client sheet.</p>
      </div>
    )
  }

  const [rawActive, rawPast] = await Promise.all([
    fetchSheetClients(sheetId, sheetGid).catch(() => []),
    pastGid ? fetchSheetClients(sheetId, pastGid).catch(() => []) : Promise.resolve([]),
  ])

  const activeClients = stripFinancialFields(rawActive)
  const pastClients   = stripFinancialFields(rawPast)
  const total = activeClients.length + pastClients.length

  return (
    <div style={{ padding: "24px 20px", maxWidth: 900, margin: "0 auto" }}>

      {/* Header */}
      <div style={{ marginBottom: 24 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 4 }}>
          <h1 style={{ fontSize: 22, fontWeight: 900, color: "#111827", margin: 0, fontFamily: "var(--font-jakarta)" }}>
            Clients
          </h1>
          <span style={{ fontSize: 11, fontWeight: 700, background: "rgba(222,26,26,0.1)", color: "#DE1A1A",
            padding: "2px 10px", borderRadius: 8, border: "1px solid rgba(222,26,26,0.2)" }}>
            {total}
          </span>
        </div>
        <p style={{ fontSize: 13, color: "#9CA3AF", margin: 0 }}>All clients your team is working with</p>
      </div>

      {/* Active clients */}
      {activeClients.length > 0 && (
        <section style={{ marginBottom: 32 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 14 }}>
            <span style={{ width: 8, height: 8, borderRadius: "50%", background: "#22C55E", flexShrink: 0 }} />
            <p style={{ fontSize: 12, fontWeight: 800, color: "#374151", margin: 0, textTransform: "uppercase", letterSpacing: "0.08em" }}>
              Active · {activeClients.length}
            </p>
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            {activeClients.map((c, i) => <ClientRow key={i} c={c} isPast={false} />)}
          </div>
        </section>
      )}

      {/* Past clients */}
      {pastClients.length > 0 && (
        <section>
          <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 14 }}>
            <span style={{ width: 8, height: 8, borderRadius: "50%", background: "#9CA3AF", flexShrink: 0 }} />
            <p style={{ fontSize: 12, fontWeight: 800, color: "#374151", margin: 0, textTransform: "uppercase", letterSpacing: "0.08em" }}>
              Past · {pastClients.length}
            </p>
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            {pastClients.map((c, i) => <ClientRow key={i} c={c} isPast={true} />)}
          </div>
        </section>
      )}

      {total === 0 && (
        <div style={{ textAlign: "center", padding: "60px 0" }}>
          <div style={{ fontSize: 40, marginBottom: 12 }}>👥</div>
          <p style={{ fontSize: 15, fontWeight: 700, color: "#374151", margin: "0 0 4px" }}>No clients yet</p>
          <p style={{ fontSize: 13, color: "#9CA3AF", margin: 0 }}>Client data will appear here once configured.</p>
        </div>
      )}
    </div>
  )
}

function ClientRow({ c, isPast }: { c: SheetClient; isPast: boolean }) {
  const st = statusStyle(c, isPast)
  const name = c.company_name || c.customer_name

  return (
    <div style={{
      display: "flex", alignItems: "center", gap: 14,
      background: "#FFFFFF", borderRadius: 14, padding: "14px 18px",
      border: "1px solid #F0F1F5", boxShadow: "0 1px 4px rgba(0,0,0,0.04)",
    }}>
      {/* Avatar */}
      <div style={{
        width: 42, height: 42, borderRadius: 13, flexShrink: 0,
        background: isPast ? "#F3F4F6" : "rgba(222,26,26,0.1)",
        color: isPast ? "#9CA3AF" : "#DE1A1A",
        display: "flex", alignItems: "center", justifyContent: "center",
        fontSize: 13, fontWeight: 900, fontFamily: "var(--font-jakarta)",
      }}>
        {ini(name)}
      </div>

      {/* Info */}
      <div style={{ flex: 1, minWidth: 0 }}>
        <p style={{ fontSize: 14, fontWeight: 800, color: "#111827", margin: "0 0 3px",
          overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
          fontFamily: "var(--font-jakarta)" }}>
          {name}
        </p>
        <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
          {c.industry && (
            <span style={{ fontSize: 11, color: "#6B7280" }}>{c.industry}</span>
          )}
          {c.place && (
            <>
              <span style={{ fontSize: 11, color: "#D1D5DB" }}>·</span>
              <span style={{ fontSize: 11, color: "#6B7280" }}>📍 {c.place}</span>
            </>
          )}
          {c.service && (
            <>
              <span style={{ fontSize: 11, color: "#D1D5DB" }}>·</span>
              <span style={{ fontSize: 11, color: "#6B7280" }}>{c.service}</span>
            </>
          )}
        </div>
      </div>

      {/* Right: package + status */}
      <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", gap: 6, flexShrink: 0 }}>
        {c.package_name && (
          <span style={{ fontSize: 11, fontWeight: 700, color: "#6366F1",
            background: "rgba(99,102,241,0.08)", padding: "2px 9px", borderRadius: 6 }}>
            {c.package_name}
          </span>
        )}
        <span style={{ fontSize: 10, fontWeight: 700, padding: "2px 8px", borderRadius: 5,
          background: st.bg, color: st.color }}>
          {st.label}
        </span>
      </div>
    </div>
  )
}
