export const revalidate = 60

import { createServerClient } from "@/lib/supabase/server"
import { redirect } from "next/navigation"
import ProfileClient from "./profile-client"

export default async function ProfilePage() {
  const supabase = await createServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect("/login")

  // ── Date helpers ─────────────────────────────────────────────
  const todayDt  = new Date()
  const today    = todayDt.toISOString().split("T")[0]

  // Last 7 days inclusive (today-6 … today)
  const day7Start = new Date(todayDt)
  day7Start.setDate(day7Start.getDate() - 6)
  const sevenDaysAgo = day7Start.toISOString().split("T")[0]

  // This week Mon → today
  const dow = todayDt.getDay() // 0=Sun
  const diffMon = dow === 0 ? -6 : 1 - dow
  const weekMon = new Date(todayDt)
  weekMon.setDate(todayDt.getDate() + diffMon)
  const weekStart = weekMon.toISOString().split("T")[0]

  // ── Types ─────────────────────────────────────────────────────
  type ProfileRow = {
    name: string; employee_id: string; role: string
    email: string | null; phone: string | null
    status: string; created_at: string
    photo_url: string | null
    position: string | null
    blood_group: string | null
    address: string | null
    emergency_contact_name: string | null
    emergency_contact_phone: string | null
  }
  type KYCRow = {
    bank_name: string | null; bank_account: string | null; bank_ifsc: string | null
    aadhaar_number: string | null; pan_number: string | null
    govt_id_url: string | null; aadhaar_back_url: string | null
    pan_front_url: string | null; pan_back_url: string | null
    ration_card_url: string | null; ration_card_url2: string | null
  }
  type UpdateRow  = { date: string; working_hours: number | null; shoot_count: number | null }

  // ── Parallel queries ──────────────────────────────────────────
  const [
    { data: profileRaw },
    { data: allUpdatesRaw },
    { count: totalCompleted },
    { count: totalLeaves },
    { data: kycRaw },
  ] = await Promise.all([
    supabase
      .from("users")
      .select("name, employee_id, role, email, phone, status, created_at, photo_url, position, blood_group, address, emergency_contact_name, emergency_contact_phone")
      .eq("id", user.id)
      .single(),
    supabase
      .from("daily_updates")
      .select("date, working_hours, shoot_count")
      .eq("user_id", user.id)
      .gte("date", sevenDaysAgo)
      .order("date", { ascending: true }),
    supabase
      .from("tasks")
      .select("*", { count: "exact", head: true })
      .eq("assigned_to", user.id)
      .eq("status", "completed"),
    supabase
      .from("leaves")
      .select("*", { count: "exact", head: true })
      .eq("user_id", user.id),
    supabase
      .from("member_kyc")
      .select("bank_name, bank_account, bank_ifsc, aadhaar_number, pan_number, govt_id_url, aadhaar_back_url, pan_front_url, pan_back_url, ration_card_url, ration_card_url2")
      .eq("user_id", user.id)
      .maybeSingle(),
  ])

  const profile    = profileRaw as unknown as ProfileRow | null
  const kyc        = kycRaw as unknown as KYCRow | null
  const allUpdates = (allUpdatesRaw ?? []) as unknown as UpdateRow[]
  // Derive recent activity from the same fetch — sorted desc, capped at 5
  const recentUpdates = [...allUpdates].sort((a, b) => b.date.localeCompare(a.date)).slice(0, 5)

  // ── Derived stats ─────────────────────────────────────────────

  // 7-day chart data: build array for each of last 7 days
  const sevenDayChart = Array.from({ length: 7 }).map((_, i) => {
    const dt = new Date(day7Start)
    dt.setDate(day7Start.getDate() + i)
    const dateStr  = dt.toISOString().split("T")[0]
    const dayLabel = dt.toLocaleDateString("en-US", { weekday: "short" })
    const entry    = allUpdates.find(u => u.date === dateStr)
    return { date: dateStr, label: dayLabel, hours: entry?.working_hours ?? 0, isFuture: dateStr > today }
  })

  // This-week updates (weekStart … today)
  const weekUpdates = allUpdates.filter(u => u.date >= weekStart && u.date <= today)
  const weekHours   = weekUpdates.reduce((s, u) => s + (u.working_hours ?? 0), 0)
  const weekUpdatesDone = weekUpdates.length

  // Days from weekStart to today inclusive
  const weekDayCount = Math.round(
    (todayDt.getTime() - weekMon.getTime()) / 86400000
  ) + 1
  const weekMissed = Math.max(0, weekDayCount - weekUpdatesDone)

  // All-time avg hours/day (from all 7-day window that have hours logged)
  const updatesWithHours = allUpdates.filter(u => u.working_hours != null && u.working_hours > 0)
  const avgHours = updatesWithHours.length > 0
    ? Math.round((updatesWithHours.reduce((s, u) => s + (u.working_hours ?? 0), 0) / updatesWithHours.length) * 10) / 10
    : 0

  const joined = profile?.created_at
    ? new Date(profile.created_at).toLocaleDateString("en-US", { day: "numeric", month: "long", year: "numeric" })
    : "—"

  return (
    <ProfileClient
      profile={profile ? {
        id:          user.id,
        name:        profile.name,
        employee_id: profile.employee_id,
        role:        profile.role,
        email:       profile.email ?? user.email ?? "",
        phone:       profile.phone ?? "",
        status:      profile.status,
        joined,
        photo_url:               profile.photo_url ?? null,
        position:                profile.position ?? null,
        blood_group:             profile.blood_group ?? null,
        address:                 profile.address ?? null,
        emergency_contact_name:  profile.emergency_contact_name ?? null,
        emergency_contact_phone: profile.emergency_contact_phone ?? null,
      } : null}
      kyc={kyc}
      stats={{
        weekHours:    Math.round(weekHours * 10) / 10,
        weekMissed,
        totalCompleted: totalCompleted ?? 0,
        totalLeaves:    totalLeaves ?? 0,
        avgHoursPerDay: avgHours,
      }}
      chartData={sevenDayChart}
      recentUpdates={recentUpdates}
      authEmail={user.email ?? ""}
    />
  )
}
