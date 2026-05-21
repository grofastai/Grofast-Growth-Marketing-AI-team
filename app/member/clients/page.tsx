export const revalidate = 60

import { createServerClient } from "@/lib/supabase/server"
import { redirect } from "next/navigation"
import ClientsSheetView from "@/app/admin/clients/clients-sheet-view"
import { fetchSheetClients, stripFinancialFields } from "@/lib/google/sheets"

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

  // Financial fields are always stripped — members never see payment data
  const activeClients = stripFinancialFields(rawActive)
  const pastClients   = stripFinancialFields(rawPast)

  return <ClientsSheetView activeClients={activeClients} pastClients={pastClients} />
}
