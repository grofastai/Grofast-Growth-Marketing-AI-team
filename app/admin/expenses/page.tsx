export const revalidate = 0

import { getCurrentUser } from "@/lib/supabase/server"
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
import { hourlyRateOnDate } from "@/lib/salary"
import { calcNetWorkHours } from "@/lib/utils/work-hours"

// Same monthly target used by Team Insights' Team Utilization widget — kept identical
// so the two pages can never quietly disagree on what "a full month" means.
const MONTHLY_TARGET_HRS = 25 * 8.5 // 212.5h

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
  const user = await getCurrentUser()
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
  const currentMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`
  // "all" = All Time: no date window, every month's data rolled up together.
  const isAll = params.month === "all"
  const monthParam = isAll ? "all" : (params.month ?? currentMonth)
  const [yr, mo] = (isAll ? currentMonth : monthParam).split("-").map(Number)
  const monthStart = isAll ? "2000-01-01" : `${yr}-${String(mo).padStart(2, "0")}-01`
  const monthEnd   = isAll ? "9999-12-31" : new Date(yr, mo, 0).toISOString().split("T")[0]

  // Supabase caps a single response at 1000 rows — All Time easily exceeds that, so every
  // date-ranged query is paged through to the end instead of silently truncating.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  async function fetchAll(build: () => any): Promise<{ data: any[] }> {
    const PAGE = 1000
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const rows: any[] = []
    for (let from = 0; ; from += PAGE) {
      const { data } = await build().range(from, from + PAGE - 1)
      rows.push(...(data ?? []))
      if (!data || data.length < PAGE) break
    }
    return { data: rows }
  }

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
    fetchAll(() => admin
      .from("daily_updates")
      .select("id, user_id, date, work_entries, learning_hours")
      .eq("company_id", cid)
      .gte("date", monthStart)
      .lte("date", monthEnd)
      .order("date", { ascending: false })
      .order("id")),
    admin
      .from("users")
      .select("id, name, employee_id, hourly_rate, monthly_salary, team, is_management, employment_type, role")
      .eq("company_id", cid)
      .eq("status", "active"),
    fetchAll(() => admin
      .from("client_expenses")
      .select("*")
      .eq("company_id", cid)
      .gte("date", monthStart)
      .lte("date", monthEnd)
      .order("date", { ascending: false })
      .order("id")),
    fetchAll(() => {
      const q = admin.from("common_expenses").select("*").eq("company_id", cid)
      return (isAll ? q : q.eq("month", monthParam)).order("created_at", { ascending: false }).order("id")
    }),
    admin
      .from("clients")
      .select("id, name, status, is_internal, created_at")
      .eq("company_id", cid),
    fetchAll(() => {
      const q = admin.from("client_common_expense_participation").select("client_id, included, month").eq("company_id", cid)
      return (isAll ? q : q.eq("month", monthParam)).order("client_id").order("month")
    }),
    admin
      .from("pricing_rates")
      .select("video_type, rate_per_video")
      .eq("company_id", cid),
    fetchAll(() => admin
      .from("freelancer_work_entries_v2")
      .select("id, date_finished, client_name, title, amount, duration_mins, team, task_description, freelancers(name)")
      .eq("company_id", cid)
      .in("team", NO_LOGIN_TEAMS)
      .gte("date_finished", monthStart)
      .lte("date_finished", monthEnd)
      .order("id")),
    admin
      .from("salary_history")
      .select("user_id, monthly_salary, effective_from")
      .eq("company_id", cid),
    // Confirmed collaboration credits — see lib/clients-deliverables.ts for why
    // these must be added on top of the submitter's own entry.
    fetchAll(() => admin
      .from("collaboration_confirmations")
      .select("collaborator_id, date, confirmed_hours, entry_snapshot")
      .eq("company_id", cid)
      .in("status", ["confirmed", "edited_confirmed"])
      .gte("date", monthStart)
      .lte("date", monthEnd)
      .order("id")),
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

  type ClientRow = { id: string; name: string; status: string; is_internal: boolean; created_at: string | null }
  const allClients = (allClientsRaw ?? []) as ClientRow[]

  // ── Default "shares common cost?" for a month with no saved tick ────────────────────────
  // Used to be the client's status TODAY — so moving a client Past → Active (or adding a new
  // brand) silently ticked them ON for every earlier month, each needing a manual untick.
  // Now: was the client Active at any point in THAT month (client_status_history), AND did they
  // exist yet (created, or already had work/expenses, by that month's end). A saved tick
  // always wins over this — see the callers.
  const { data: statusHistRaw } = await admin
    .from("client_status_history")
    .select("client_id, status, effective_from")
    .eq("company_id", cid)
  const statusRowsByClient = new Map<string, { status: string; effective_from: string }[]>()
  for (const r of (statusHistRaw ?? []) as { client_id: string; status: string; effective_from: string }[]) {
    if (!statusRowsByClient.has(r.client_id)) statusRowsByClient.set(r.client_id, [])
    statusRowsByClient.get(r.client_id)!.push(r)
  }
  for (const rows of statusRowsByClient.values()) rows.sort((a, b) => (a.effective_from < b.effective_from ? -1 : 1))

  // Earliest day each client name shows up in real work or expenses within the loaded range.
  const normName = (n: string) => n.trim().replace(/\s+/g, " ").toUpperCase()
  const firstSeen = new Map<string, string>()
  const markSeen = (name: string | null | undefined, date: string) => {
    if (!name) return
    const k = normName(name)
    const cur = firstSeen.get(k)
    if (!cur || date < cur) firstSeen.set(k, date)
  }
  for (const u of (updatesRaw ?? []) as { date: string; work_entries?: { client_name?: string; client_names?: string[] }[] | null }[]) {
    for (const e of u.work_entries ?? []) {
      markSeen(e.client_name, u.date)
      for (const n of e.client_names ?? []) markSeen(n, u.date)
    }
  }
  for (const e of (clientExpensesRaw ?? []) as { client_name: string; date: string }[]) markSeen(e.client_name, e.date)

  const activeInMonth = (c: ClientRow, ym: string): boolean => {
    const rows = statusRowsByClient.get(c.id)
    if (!rows?.length) return c.status === "active"
    const start = `${ym}-01`, end = `${ym}-31`
    let atStart: { status: string; effective_from: string } | null = null
    for (const r of rows) if (r.effective_from <= start) atStart = r
    const base = atStart ?? rows[0] // before tracking began → earliest known status
    if (base.status === "active") return true
    return rows.some(r => r.effective_from > start && r.effective_from <= end && r.status === "active")
  }
  const existedByMonth = (c: ClientRow, ym: string): boolean => {
    const end = `${ym}-31`
    if (c.created_at && c.created_at.slice(0, 10) <= end) return true
    const seen = firstSeen.get(normName(c.name))
    return !!seen && seen <= end
  }
  const defaultIncluded = (c: ClientRow, ym: string) => existedByMonth(c, ym) && activeInMonth(c, ym)
  const nonInternalClients = allClients.filter(c => !c.is_internal)
  const activeClients = nonInternalClients.filter(c => c.status === "active")

  // Real labor/direct cost is a fact — compute it for every client with actual logged
  // work this month, active or not. Whether they also SHARE this month's common/overhead
  // cost is a separate, deliberate admin decision (see participation below) — a past
  // client's real hours must never silently show ₹0 just because they're not active.
  // Internal brands come from the DB flag too, not just the 3 hardcoded names — a newly
  // added internal brand (e.g. Tarika Elite) would otherwise have its work cost dropped.
  const allClientNames = Array.from(new Set([
    ...INTERNAL_BRAND_NAMES,
    ...allClients.filter(c => c.is_internal).map(c => c.name),
    ...nonInternalClients.map(c => c.name),
  ]))

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

  // "Productivity Gap" cost — same wastedCost formula as Team Insights' Team Utilization
  // widget (untracked hours × hourly rate against a fixed 212.5h/month target), but
  // company-wide (not per-client) since idle time isn't attributable to any one client.
  // Deliberately excludes management (is_management) and freelancers (employment_type
  // !== 'regular') — those two never appear in the Team Utilization table either, since
  // management's real value isn't hour-logged the same way regular staff's is.
  type GapWorkEntry = { task_type?: string; start_time?: string; end_time?: string; duration_hours?: number }
  const gapEligibleUsers = ((usersRaw ?? []) as (MemberUser & { is_management?: boolean; employment_type?: string; role?: string })[])
    .filter(u => u.role === "MEMBER" && u.is_management !== true && u.employment_type === "regular")
  // Tracked hours per user per month. All Time sums the same per-month gap for every month
  // from each person's first logged month through now, so a recent joiner is never charged
  // for months before they started.
  const gapEligibleIds = new Set(gapEligibleUsers.map(u => u.id))
  const gapHours: Record<string, Record<string, number>> = {}
  const addGapHours = (userId: string, ym: string, hrs: number) => {
    ;(gapHours[userId] ??= {})[ym] = (gapHours[userId][ym] ?? 0) + hrs
  }
  for (const row of (updatesRaw ?? []) as UpdateRow[]) {
    if (row.date < monthStart || row.date > monthEnd) continue
    if (!gapEligibleIds.has(row.user_id)) continue
    const entries = (row.work_entries ?? []) as GapWorkEntry[]
    addGapHours(row.user_id, row.date.slice(0, 7), calcNetWorkHours(entries as Parameters<typeof calcNetWorkHours>[0]))
  }
  for (const c of (collabRaw ?? []) as CollabConfirmationRow[]) {
    if (c.date < monthStart || c.date > monthEnd) continue
    if (!gapEligibleIds.has(c.collaborator_id)) continue
    addGapHours(c.collaborator_id, c.date.slice(0, 7), c.confirmed_hours ?? 0)
  }
  const monthsBetween = (fromYm: string, toYm: string) => {
    const out: string[] = []
    let [y, m] = fromYm.split("-").map(Number)
    const [ty, tm] = toYm.split("-").map(Number)
    while (y < ty || (y === ty && m <= tm)) {
      out.push(`${y}-${String(m).padStart(2, "0")}`)
      if (++m > 12) { m = 1; y++ }
    }
    return out
  }
  let productivityGapCost = 0
  for (const u of gapEligibleUsers) {
    const months = isAll
      ? (Object.keys(gapHours[u.id] ?? {}).sort()[0] ? monthsBetween(Object.keys(gapHours[u.id]).sort()[0], currentMonth) : [])
      : [monthParam]
    for (const ym of months) {
      const tracked = gapHours[u.id]?.[ym] ?? 0
      const untracked = Math.max(0, MONTHLY_TARGET_HRS - tracked)
      productivityGapCost += untracked * hourlyRateOnDate(u, `${ym}-01`, salaryHistoryRaw ?? [])
    }
  }

  // All Time common-cost split: each month's common total is divided across that month's
  // own included clients (explicit checklist choice, else active-by-default — same rule as
  // the single-month view), then summed per client across every month.
  const overheadByClient: Record<string, number> = {}
  let allTimePerClient = 0
  if (isAll) {
    const partByMonth = new Map<string, Map<string, boolean>>()
    for (const r of (statusHistoryRaw ?? []) as { client_id: string; included: boolean; month: string }[]) {
      if (!partByMonth.has(r.month)) partByMonth.set(r.month, new Map())
      partByMonth.get(r.month)!.set(r.client_id, r.included)
    }
    const commonTotalByMonth: Record<string, number> = {}
    for (const e of (commonExpensesRaw ?? []) as { month: string; amount: number }[]) {
      commonTotalByMonth[e.month] = (commonTotalByMonth[e.month] ?? 0) + e.amount
    }
    for (const [ym, total] of Object.entries(commonTotalByMonth)) {
      const part = partByMonth.get(ym)
      const included = allClients.filter(c => part?.has(c.id) ? part.get(c.id)! : defaultIncluded(c, ym))
      if (included.length === 0) continue
      const share = total / included.length
      allTimePerClient += share
      for (const c of included) overheadByClient[c.name] = (overheadByClient[c.name] ?? 0) + share
    }
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
    .filter(c => defaultIncluded(c, monthParam) || (employeeCostByClient[c.name] ?? 0) > 0 || directExpenseNames.has(c.name))
  const commonParticipation = [...internalClients, ...relevantClients].map(c => ({
    id: c.id,
    name: c.name,
    status: c.status,
    isInternal: c.is_internal,
    included: participationMap.has(c.id) ? participationMap.get(c.id)! : defaultIncluded(c, monthParam),
  }))

  return (
    <ExpensesClient
      updates={updatesRaw ?? []}
      users={usersRaw ?? []}
      clientExpenses={clientExpensesRaw ?? []}
      commonExpenses={commonExpensesRaw ?? []}
      activeClients={activeClients.map(c => ({ name: c.name }))}
      commonParticipation={isAll ? [] : commonParticipation}
      productivityGapCost={productivityGapCost}
      selectedMonth={monthParam}
      employeeCostByClient={employeeCostByClient}
      allTimeOverhead={isAll ? { byClient: overheadByClient, perClient: allTimePerClient } : null}
    />
  )
}
