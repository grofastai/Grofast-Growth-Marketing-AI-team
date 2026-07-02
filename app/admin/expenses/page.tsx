export const revalidate = 0

import { createServerClient } from "@/lib/supabase/server"
import { createClient } from "@supabase/supabase-js"
import { redirect } from "next/navigation"
import ExpensesClient from "./expenses-client"
import {
  computeDeliverables,
  type UpdateRow,
  type MemberUser,
  type PricingRate,
  type FreelancerWorkEntry,
} from "@/lib/clients-deliverables"

function adminClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  )
}

const INTERNAL_BRAND_NAMES = ["GROFAST DIGITAL", "GROFAST AI", "KARTHICK BRANDS"]

const NO_LOGIN_TEAMS = [
  "Freelance Media Production",
  "Freelance Video Editing", "Freelance Videography", "Freelance RJ Voiceover",
  "Freelance Graphics Designer", "Freelance Content Writer",
  "Freelance Software Development & Automation", "Freelance Marketing & Operations",
  "Freelance AI Development & Creative Production",
]

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
    { data: pricingRaw },
    { data: freelancerRaw },
  ] = await Promise.all([
    admin
      .from("daily_updates")
      .select("id, user_id, date, work_entries, learning_hours")
      .eq("company_id", cid)
      .gte("date", monthStart)
      .lte("date", monthEnd)
      .order("date", { ascending: false }),
    admin
      .from("users")
      .select("id, name, employee_id, hourly_rate, monthly_salary, team")
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
    admin
      .from("pricing_rates")
      .select("video_type, rate_per_video")
      .eq("company_id", cid),
    admin
      .from("freelancer_work_entries_v2")
      .select("id, date_finished, client_name, title, amount, duration_mins, team, task_description, freelancers(name)")
      .eq("company_id", cid)
      .in("team", NO_LOGIN_TEAMS)
      .gte("date_finished", monthStart)
      .lte("date_finished", monthEnd),
  ])

  const freelancerEntries: FreelancerWorkEntry[] = (freelancerRaw ?? []).map((r: Record<string, unknown>) => ({
    id:               r.id as string,
    date_finished:    r.date_finished as string,
    client_name:      r.client_name as string,
    title:            r.title as string,
    amount:           r.amount as number,
    duration_mins:    r.duration_mins as number | null,
    team:             r.team as string,
    task_description: r.task_description as string | null,
    freelancer_name:  (r.freelancers as { name: string } | null)?.name ?? "Freelancer",
  }))

  // Compute per-client employee cost using the same logic as the Clients page
  const allClientNames = [
    ...INTERNAL_BRAND_NAMES,
    ...((activeClientsRaw ?? []).map((c: { name: string }) => c.name).filter(n => !INTERNAL_BRAND_NAMES.includes(n))),
  ]

  const employeeCostByClient: Record<string, number> = {}
  for (const clientName of allClientNames) {
    const result = computeDeliverables(
      (updatesRaw ?? []) as UpdateRow[],
      (usersRaw  ?? []) as MemberUser[],
      (pricingRaw ?? []) as PricingRate[],
      clientName,
      monthStart,
      monthEnd,
      freelancerEntries,
    )
    employeeCostByClient[clientName] = result.totalCost
  }

  return (
    <ExpensesClient
      updates={updatesRaw ?? []}
      users={usersRaw ?? []}
      clientExpenses={clientExpensesRaw ?? []}
      commonExpenses={commonExpensesRaw ?? []}
      activeClients={activeClientsRaw ?? []}
      selectedMonth={monthParam}
      employeeCostByClient={employeeCostByClient}
    />
  )
}
