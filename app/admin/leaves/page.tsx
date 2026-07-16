export const dynamic = "force-dynamic"

import { createServerClient } from "@/lib/supabase/server"
import { createClient } from "@supabase/supabase-js"
import { redirect } from "next/navigation"
import LeavesClient from "./leaves-client"
import { todayIST, toISTDateString } from "@/lib/utils/ist-date"

function adminClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  )
}

export default async function LeavesPage({
  searchParams,
}: {
  searchParams: Promise<{ mode?: string; status?: string; type?: string }>
}) {
  const params = await searchParams
  const supabase = await createServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect("/login")

  // Single combined filter mode: pending/approved/rejected filter by STATUS,
  // leaves/permission filter by TYPE, all = everything, holidays = holidays view.
  const mode = params.mode ?? "pending"
  const LEAVE_TYPES = ["full_day", "half_day", "permission"]   // "Leaves" bucket
  const PERMISSION_TYPES = ["wfh", "shoot_day"]                 // "Permission" bucket
  const today = todayIST()
  const tomorrow = toISTDateString(Date.now() + 86400000)

  const admin = adminClient()

  const { data: profile } = await admin
    .from("users")
    .select("company_id, role")
    .eq("id", user.id)
    .single()

  if (!profile) redirect("/login")
  if (profile.role !== "ADMIN") redirect("/member/dashboard")

  const cid = profile.company_id

  let leavesQuery = admin
    .from("leaves")
    .select("*, users(id, name, employee_id, phone, gender)")
    .eq("company_id", cid)
    .order("from_date", { ascending: false })

  if (mode === "pending" || mode === "approved" || mode === "rejected") {
    leavesQuery = leavesQuery.eq("status", mode)
  } else if (mode === "leaves") {
    leavesQuery = leavesQuery.in("leave_type", LEAVE_TYPES)
  } else if (mode === "permission") {
    leavesQuery = leavesQuery.in("leave_type", PERMISSION_TYPES)
  }
  // mode === "all" or "holidays" → no status/type filter (date filtering happens client-side)

  const [
    { data: leaves },
    { data: upcoming },
    { count: memberCount },
    { count: onLeaveCount },
    { count: awayTodayCount },
    { data: onLeaveTodayRaw },
    { count: pendingCount },
    { data: companyLeaves },
  ] = await Promise.all([
    leavesQuery,
    admin
      .from("leaves")
      .select("*, users(id, name, employee_id, gender)")
      .eq("company_id", cid)
      .in("status", ["pending", "approved"])
      .neq("leave_type", "permission")
      .gte("from_date", tomorrow)
      .order("from_date")
      .limit(4),
    admin
      .from("users")
      .select("*", { count: "exact", head: true })
      .eq("company_id", cid)
      .eq("role", "MEMBER")
      .eq("status", "active")
      .eq("is_management", false)
      .eq("is_freelancer_login", false),
    admin
      .from("leaves")
      .select("*", { count: "exact", head: true })
      .eq("company_id", cid)
      .eq("status", "approved")
      .in("leave_type", ["full_day", "half_day"])
      .lte("from_date", today)
      .gte("to_date", today),
    admin
      .from("leaves")
      .select("*", { count: "exact", head: true })
      .eq("company_id", cid)
      .eq("status", "approved")
      .in("leave_type", ["wfh", "shoot_day"])
      .lte("from_date", today)
      .gte("to_date", today),
    admin
      .from("leaves")
      .select("from_date, to_date, users(id, name)")
      .eq("company_id", cid)
      .eq("status", "approved")
      .in("leave_type", ["full_day", "half_day"])
      .lte("from_date", today)
      .gte("to_date", today),
    admin.from("leaves").select("*", { count: "exact", head: true }).eq("company_id", cid).eq("status", "pending"),
    admin.from("company_leaves").select("id, date, name").eq("company_id", cid).order("date"),
  ])

  const total = Math.max(1, memberCount ?? 0)
  const onLeave = onLeaveCount ?? 0
  const away = awayTodayCount ?? 0
  const available = Math.max(0, total - onLeave - away)
  const availabilityPct = Math.min(100, Math.max(0, Math.round((available / total) * 100)))

  const onLeaveToday = (onLeaveTodayRaw ?? []).map((l: any) => {
    const u = Array.isArray(l.users) ? l.users[0] : l.users
    return { name: (u?.name ?? "?") as string }
  })

  return (
    <LeavesClient
      leaves={leaves ?? []}
      mode={mode}
      upcomingLeaves={upcoming ?? []}
      availabilityPct={availabilityPct}
      availableCount={available}
      onLeaveCountToday={onLeave}
      awayCountToday={away}
      onLeaveToday={onLeaveToday}
      pendingCount={pendingCount ?? 0}
      companyLeaves={(companyLeaves ?? []) as { id: string; date: string; name: string }[]}
    />
  )
}
