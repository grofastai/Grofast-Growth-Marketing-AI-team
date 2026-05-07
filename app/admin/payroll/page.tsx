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

  const [{ data: membersRaw }, { data: updatesRaw }, { data: logsRaw }] = await Promise.all([
    admin
      .from("users")
      .select("id, name, employee_id, team, employment_type, monthly_salary, hourly_rate")
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
  ])

  // Working days in month (Mon–Fri)
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

  type MemberRow = {
    id: string; name: string; employee_id: string; team: string | null
    employment_type: string | null; monthly_salary: number | null; hourly_rate: number | null
  }
  const members = (membersRaw ?? []) as MemberRow[]

  const rows = members.map(m => {
    const myLogs    = logs.filter(l => l.user_id === m.id)
    const myUpdates = updates.filter(u => u.user_id === m.id)
    const presentDays = myLogs.filter(l => l.clock_in !== null || l.status === "present").length
    const absentDays  = Math.max(workDays - presentDays, 0)
    const totalHours  = myUpdates.reduce((s, u) => s + (u.working_hours ?? 0), 0)
    const otHours     = Math.round(myUpdates.reduce((s, u) => {
      const h = u.working_hours ?? 0; return h > 9 ? s + (h - 9) : s
    }, 0) * 10) / 10

    let basePay = 0, deduction = 0, otPay = 0, netPay = 0

    if ((m.employment_type ?? "regular") === "regular" && m.monthly_salary) {
      const dailyRate = m.monthly_salary / workDays
      basePay   = m.monthly_salary
      deduction = Math.round(absentDays * dailyRate * 100) / 100
      otPay     = Math.round(otHours * (dailyRate / 9) * 100) / 100
      netPay    = Math.round((basePay - deduction + otPay) * 100) / 100
    } else if (m.hourly_rate) {
      basePay = Math.round(totalHours * m.hourly_rate * 100) / 100
      otPay   = 0
      netPay  = basePay
    }

    return {
      id: m.id, name: m.name, employee_id: m.employee_id, team: m.team,
      employment_type: m.employment_type ?? "regular",
      presentDays, absentDays, totalHours, otHours,
      basePay, deduction, otPay, netPay,
      monthly_salary: m.monthly_salary, hourly_rate: m.hourly_rate,
    }
  })

  return <PayrollClient rows={rows} month={month} workDays={workDays} />
}
