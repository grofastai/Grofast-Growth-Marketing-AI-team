import { createServerClient } from "@/lib/supabase/server"
import LeavesClient from "./leaves-client"

export default async function LeavesPage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string }>
}) {
  const params = await searchParams
  const supabase = await createServerClient()
  const statusFilter = params.status ?? "pending"

  let query = supabase
    .from("leaves")
    .select("*, users(id, name, employee_id, phone)")
    .order("created_at", { ascending: false })

  if (statusFilter !== "all") {
    const s = statusFilter as "pending" | "approved" | "rejected"
    query = query.eq("status", s)
  }

  const { data: leaves } = await query

  return <LeavesClient leaves={leaves ?? []} statusFilter={statusFilter} />
}
