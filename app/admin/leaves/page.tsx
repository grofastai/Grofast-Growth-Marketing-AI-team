export const revalidate = 30

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
  const today = new Date().toISOString().split("T")[0]

  let query = supabase
    .from("leaves")
    .select("*, users(id, name, employee_id, phone, gender)")
    .order("created_at", { ascending: false })

  if (statusFilter !== "all") {
    query = query.eq("status", statusFilter as "pending" | "approved" | "rejected")
  }

  const [
    { data: leaves },
    { data: upcoming },
    { count: memberCount },
    { count: onLeaveCount },
  ] = await Promise.all([
    query,
    supabase
      .from("leaves")
      .select("*, users(id, name, employee_id, gender)")
      .in("status", ["pending", "approved"])
      .gte("from_date", today)
      .order("from_date")
      .limit(4),
    supabase
      .from("users")
      .select("*", { count: "exact", head: true })
      .eq("role", "MEMBER"),
    supabase
      .from("leaves")
      .select("*", { count: "exact", head: true })
      .eq("status", "approved")
      .lte("from_date", today)
      .gte("to_date", today),
  ])

  const total = memberCount ?? 1
  const onLeave = onLeaveCount ?? 0
  const availabilityPct = Math.min(100, Math.max(0, Math.round(((total - onLeave) / total) * 100)))

  return (
    <LeavesClient
      leaves={leaves ?? []}
      statusFilter={statusFilter}
      upcomingLeaves={upcoming ?? []}
      availabilityPct={availabilityPct}
    />
  )
}
