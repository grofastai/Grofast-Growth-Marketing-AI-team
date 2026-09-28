export const revalidate = 0

import { getCurrentUser } from "@/lib/supabase/server"
import { createClient } from "@supabase/supabase-js"
import { redirect } from "next/navigation"
import { todayIST } from "@/lib/utils/ist-date"
import { coveredIntervalsFromLeaves, computeDayPunctuality, type LeaveForPunctuality } from "@/lib/utils/punctuality"
import PunctualityClient, { type MemberPunctuality, type DayRow } from "./punctuality-client"

function adminSupabase() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  )
}

export default async function PunctualityPage({
  searchParams,
}: {
  searchParams: Promise<{ date?: string; from?: string; to?: string }>
}) {
  const params = await searchParams
  const user = await getCurrentUser()
  if (!user) redirect("/login")

  const admin = adminSupabase()
  const today = todayIST()
  const from = params.from ?? params.date ?? today
  const to   = params.to   ?? params.from ?? params.date ?? today

  const { data: profile } = await admin.from("users").select("company_id").eq("id", user.id).single()
  const companyId = profile?.company_id ?? ""

  const [{ data: members }, { data: logs }, { data: leaves }] = await Promise.all([
    admin.from("users")
      .select("id, name, employee_id")
      .eq("company_id", companyId)
      .eq("role", "MEMBER")
      .eq("status", "active")
      .eq("is_management", false)
      .eq("is_freelancer_login", false)
      .order("name"),
    admin.from("attendance_logs")
      .select("user_id, date, status, clock_in, clock_out")
      .eq("company_id", companyId)
      .gte("date", from)
      .lte("date", to),
    admin.from("leaves")
      .select("user_id, from_date, to_date, leave_type, half_day_from_time, half_day_to_time, half_day_period, permission_time, permission_end_time, permission_hours")
      .eq("company_id", companyId)
      .eq("status", "approved")
      .lte("from_date", to)
      .gte("to_date", from),
  ])

  type Log = { user_id: string; date: string; status: string; clock_in: string | null; clock_out: string | null }
  type Leave = LeaveForPunctuality & { user_id: string; from_date: string; to_date: string }

  const logsByUser = new Map<string, Log[]>()
  for (const l of (logs ?? []) as Log[]) {
    if (!logsByUser.has(l.user_id)) logsByUser.set(l.user_id, [])
    logsByUser.get(l.user_id)!.push(l)
  }

  const leavesByUser = new Map<string, Leave[]>()
  for (const l of (leaves ?? []) as Leave[]) {
    if (!leavesByUser.has(l.user_id)) leavesByUser.set(l.user_id, [])
    leavesByUser.get(l.user_id)!.push(l)
  }

  const memberReports: MemberPunctuality[] = (members ?? []).map(m => {
    const userLogs = logsByUser.get(m.id) ?? []
    const userLeaves = leavesByUser.get(m.id) ?? []
    const days: DayRow[] = []
    let lateDays = 0, lateMinutes = 0, earlyDays = 0, earlyMinutes = 0, daysWithData = 0

    for (const log of userLogs) {
      if (log.status === "leave") continue
      if (!log.clock_in && !log.clock_out) continue
      daysWithData++

      const dayLeaves = userLeaves.filter(l => l.from_date <= log.date && log.date <= l.to_date)
      const covered = coveredIntervalsFromLeaves(dayLeaves)
      const result = computeDayPunctuality(log.clock_in, log.clock_out, covered)

      if (result.lateRanges.length > 0 || result.earlyRanges.length > 0) {
        days.push({
          date: log.date,
          clockIn: log.clock_in,
          clockOut: log.clock_out,
          lateRanges: result.lateRanges.map(r => r.label),
          earlyRanges: result.earlyRanges.map(r => r.label),
        })
        if (result.lateRanges.length > 0) { lateDays++; lateMinutes += result.lateMinutes }
        if (result.earlyRanges.length > 0) { earlyDays++; earlyMinutes += result.earlyMinutes }
      }
    }

    days.sort((a, b) => a.date.localeCompare(b.date))

    return {
      id: m.id,
      name: m.name,
      employeeId: m.employee_id,
      daysWithData,
      lateDays, lateMinutes,
      earlyDays, earlyMinutes,
      days,
    }
  })

  return <PunctualityClient from={from} to={to} members={memberReports} />
}
