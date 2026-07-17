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
  type CollabConfirmationRow,
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
    { data: allClientsRaw },
    { data: statusHistoryRaw },
    { data: pricingRaw },
    { data: freelancerRaw },
    { data: salaryHistoryRaw },
    { data: collabRaw },
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
      .select("id, name, status, is_internal")
      .eq("company_id", cid),
    admin
      .from("client_common_expense_participation")
      .select("client_id, included")
      .eq("company_id", cid)
      .eq("month", monthParam),
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
    admin
      .from("salary_history")
      .select("user_id, monthly_salary, effective_from")
      .eq("company_id", cid),
    // Confirmed collaboration credits — see lib/clients-deliverables.ts for why
    // these must be added on top of the submitter's own entry.
    admin
      .from("collaboration_confirmations")
      .select("collaborator_id, date, confirmed_hours, entry_snapshot")
      .eq("company_id", cid)
      .in("status", ["confirmed", "edited_confirmed"])
      .gte("date", monthStart)
      .lte("date", monthEnd),
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

  type ClientRow = { id: string; name: string; status: string; is_internal: boolean }
  const allClients = (allClientsRaw ?? []) as ClientRow[]
  const nonInternalClients = allClients.filter(c => !c.is_internal)
  const activeClients = nonInternalClients.filter(c => c.status === "active")

  // Real labor/direct cost is a fact — compute it for every client with actual logged
  // work this month, active or not. Whether they also SHARE this month's common/overhead
  // cost is a separate, deliberate admin decision (see participation below) — a past
  // client's real hours must never silently show ₹0 just because they're not active.
  const allClientNames = [...INTERNAL_BRAND_NAMES, ...nonInternalClients.map(c => c.name)]

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
      salaryHistoryRaw ?? [],
      (collabRaw ?? []) as CollabConfirmationRow[],
    )
    employeeCostByClient[clientName] = result.totalCost
  }

  const directExpenseNames = new Set(
    ((clientExpensesRaw ?? []) as { client_name: string }[]).map(e => e.client_name)
  )

  // Common-cost checklist — only clients actually relevant to THIS month: currently
  // active (always shown, so you can opt one out), or a past client with real employee/
  // direct cost this specific month (something to actually decide about). A past client
  // with zero activity this month has nothing to decide — it must not clutter a list
  // that has to stay usable whether there are 50 clients or 5,000.
  const participationMap = new Map<string, boolean>(
    ((statusHistoryRaw ?? []) as { client_id: string; included: boolean }[])
      .map(r => [r.client_id, r.included])
  )
  // Internal Brands are always shown as an option — they're few and always relevant,
  // no need to filter them by monthly activity — but whether each one actually shares
  // common cost is still the admin's explicit call, same as any real client, not
  // auto-excluded. Pinned first in the list since they're a fixed, known set.
  const internalClients = allClients.filter(c => c.is_internal)
  const relevantClients = nonInternalClients
    .filter(c => c.status === "active" || (employeeCostByClient[c.name] ?? 0) > 0 || directExpenseNames.has(c.name))
  const commonParticipation = [...internalClients, ...relevantClients].map(c => ({
    id: c.id,
    name: c.name,
    status: c.status,
    isInternal: c.is_internal,
    included: participationMap.has(c.id) ? participationMap.get(c.id)! : c.status === "active",
  }))

  return (
    <ExpensesClient
      updates={updatesRaw ?? []}
      users={usersRaw ?? []}
      clientExpenses={clientExpensesRaw ?? []}
      commonExpenses={commonExpensesRaw ?? []}
      activeClients={activeClients.map(c => ({ name: c.name }))}
      commonParticipation={commonParticipation}
      selectedMonth={monthParam}
      employeeCostByClient={employeeCostByClient}
    />
  )
}
