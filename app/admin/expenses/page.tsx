export const revalidate = 0

import { createServerClient } from "@/lib/supabase/server"
import { createClient } from "@supabase/supabase-js"
import { redirect } from "next/navigation"
import ExpensesClient from "./expenses-client"

function adminClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  )
}

export default async function AdminExpensesPage({
  searchParams,
}: {
  searchParams: Promise<{ month?: string }>
}) {
  const supabase = await createServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect("/login")

  const admin = adminClient()
  const { data: profile } = await admin
    .from("users")
    .select("company_id, role")
    .eq("id", user.id)
    .single()
  if (!profile) redirect("/login")
  if (profile.role !== "ADMIN") redirect("/member/dashboard")

  const cid = profile.company_id

  const params = await searchParams
  const now = new Date()
  const monthParam = params.month ?? `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`
  const [yr, mo] = monthParam.split("-").map(Number)
  const monthStart = `${yr}-${String(mo).padStart(2, "0")}-01`
  const monthEnd   = new Date(yr, mo, 0).toISOString().split("T")[0]

  const [
    { data: updatesRaw },
    { data: usersRaw },
    { data: clientExpensesRaw },
    { data: commonExpensesRaw },
    { data: activeClientsRaw },
  ] = await Promise.all([
    admin
      .from("daily_updates")
      .select("id, user_id, date, work_entries")
      .eq("company_id", cid)
      .gte("date", monthStart)
      .lte("date", monthEnd)
      .order("date", { ascending: false }),
    admin
      .from("users")
      .select("id, name, employee_id")
      .eq("company_id", cid)
      .eq("status", "active"),
    admin
      .from("client_expenses")
      .select("*")
      .eq("company_id", cid)
      .gte("date", monthStart)
      .lte("date", monthEnd)
      .order("date", { ascending: false }),
    admin
      .from("common_expenses")
      .select("*")
      .eq("company_id", cid)
      .eq("month", monthParam)
      .order("created_at", { ascending: false }),
    admin
      .from("clients")
      .select("name")
      .eq("company_id", cid)
      .eq("status", "active"),
  ])

  return (
    <ExpensesClient
      updates={updatesRaw ?? []}
      users={usersRaw ?? []}
      clientExpenses={clientExpensesRaw ?? []}
      commonExpenses={commonExpensesRaw ?? []}
      activeClients={activeClientsRaw ?? []}
      selectedMonth={monthParam}
    />
  )
}
