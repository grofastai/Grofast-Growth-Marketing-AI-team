export const revalidate = 0

import { createServerClient } from "@/lib/supabase/server"
import { createClient } from "@supabase/supabase-js"
import { redirect } from "next/navigation"
import PayrollClient from "./payroll-client"

export default async function PayrollPage({
  searchParams,
}: {
  searchParams: Promise<{ month?: string }>
}) {
  const params  = await searchParams
  const supabase = await createServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect("/login")

  const now     = new Date()
  const month   = params.month ?? `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`
  const [year, mon] = month.split("-").map(Number)
  const monthStart  = `${month}-01`
  const monthEnd    = `${month}-${new Date(year, mon, 0).getDate()}`

  const admin = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  )

  const { data: profile } = await admin.from("users").select("company_id").eq("id", user.id).single()
  if (!profile) redirect("/login")

  const [
    { data: membersRaw },
    { data: updatesRaw },
    { data: logsRaw },
    { data: runsRaw },
  ] = await Promise.all([
    admin
      .from("users")
      .select("id, name, employee_id, team, employment_type, monthly_salary, hourly_rate, paid_leave_days")
      .eq("company_id", profile.company_id)
      .eq("status", "active")
      .is("deleted_at", null)
      .order("name"),
    admin
      .from("daily_updates")
      .select("user_id, working_hours")
      .eq("company_id", profile.company_id)
      .gte("date", monthStart)
      .lte("date", monthEnd),
    admin
      .from("attendance_logs")
      .select("user_id, date, clock_in, clock_out, status")
      .eq("company_id", profile.company_id)
      .gte("date", monthStart)
      .lte("date", monthEnd),
    admin
      .from("payroll_runs")
      .select("user_id, bonus, advance, incentive, is_paid, paid_at")
      .eq("company_id", profile.company_id)
      .eq("month", month),
  ])

  function workingDaysInMonth(y: number, m: number) {
    let count = 0
    const days = new Date(y, m, 0).getDate()
    for (let d = 1; d <= days; d++) {
      const day = new Date(y, m - 1, d).getDay()
      if (day !== 0 && day !== 6) count++
    }
    return count
  }

  const workDays = workingDaysInMonth(year, mon)

  type UpdateRow = { user_id: string; working_hours: number | null }
  const updates = (updatesRaw ?? []) as UpdateRow[]

  type LogRow = { user_id: string; date: string; clock_in: string | null; clock_out: string | null; status: string | null }
  const logs = (logsRaw ?? []) as LogRow[]

  type RunRow = { user_id: string; bonus: number; advance: number; incentive: number; is_paid: boolean; paid_at: string | null }
  const runs = (runsRaw ?? []) as RunRow[]
  const runsMap = new Map(runs.map(r => [r.user_id, r]))

  type MemberRow = {
    id: string; name: string; employee_id: string; team: string | null
    employment_type: string | null; monthly_salary: number | null; hourly_rate: number | null
    paid_leave_days: number | null
  }
  const members = (membersRaw ?? []) as MemberRow[]

  const SALARY_BASIS = 30

  const rows = members.map(m => {
    const myLogs    = logs.filter(l => l.user_id === m.id)
    const myUpdates = updates.filter(u => u.user_id === m.id)
    const presentDays     = myLogs.filter(l => l.clock_in !== null || l.status === "present").length
    const rawAbsent       = Math.max(workDays - presentDays, 0)
    const paidLeaveDays   = m.paid_leave_days ?? 0
    const deductibleAbsent = Math.max(rawAbsent - paidLeaveDays, 0)
    const totalHours  = myUpdates.reduce((s, u) => s + (u.working_hours ?? 0), 0)
    const otHours     = Math.round(myUpdates.reduce((s, u) => {
      const h = u.working_hours ?? 0; return h > 9.5 ? s + (h - 9.5) : s
    }, 0) * 10) / 10

    let basePay = 0, deduction = 0, otPay = 0, netPay = 0

    if ((m.employment_type ?? "regular") === "regular" && m.monthly_salary) {
      const dailyRate = m.monthly_salary / SALARY_BASIS
      basePay   = m.monthly_salary
      deduction = Math.round(deductibleAbsent * dailyRate * 100) / 100
      otPay     = Math.round(otHours * (dailyRate / 9.5) * 100) / 100
      netPay    = Math.round((basePay - deduction + otPay) * 100) / 100
    } else if (m.hourly_rate) {
      basePay = Math.round(totalHours * m.hourly_rate * 100) / 100
      netPay  = basePay
    }

    const run = runsMap.get(m.id)
    const bonus     = run?.bonus     ?? 0
    const advance   = run?.advance   ?? 0
    const incentive = run?.incentive ?? 0
    const finalNetPay = Math.round((netPay + bonus + incentive - advance) * 100) / 100

    return {
      id: m.id, name: m.name, employee_id: m.employee_id, team: m.team,
      employment_type: m.employment_type ?? "regular",
      presentDays, absentDays: rawAbsent, paidLeaveDays, deductibleAbsent,
      totalHours, otHours,
      basePay, deduction, otPay, netPay,
      bonus, advance, incentive, finalNetPay,
      isPaid: run?.is_paid ?? false,
      paidAt: run?.paid_at ?? null,
      monthly_salary: m.monthly_salary, hourly_rate: m.hourly_rate,
    }
  })

  return <PayrollClient rows={rows} month={month} workDays={workDays} />
}
