export const dynamic = "force-dynamic"

import { createServerClient } from "@/lib/supabase/server"
import { createClient } from "@supabase/supabase-js"
import { redirect } from "next/navigation"
import LeavesClient from "./leaves-client"

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
  searchParams: Promise<{ status?: string; type?: string }>
}) {
  const params = await searchParams
  const supabase = await createServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect("/login")

  const statusFilter = params.status ?? "pending"
  const typeFilter = params.type ?? "all_types"
  const PERMISSION_TYPES = ["wfh", "shoot_day"]
  const LEAVE_TYPES = ["full_day", "half_day", "permission"]
  const today = new Date().toISOString().split("T")[0]
  const tomorrow = new Date(Date.now() + 86400000).toISOString().split("T")[0]

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

  if (statusFilter !== "all") {
    leavesQuery = leavesQuery.eq("status", statusFilter)
  }

  if (typeFilter === "permission") {
    leavesQuery = leavesQuery.in("leave_type", PERMISSION_TYPES)
  } else if (typeFilter === "leave") {
    leavesQuery = leavesQuery.in("leave_type", LEAVE_TYPES)
  }

  const [
    { data: leaves },
    { data: upcoming },
    { count: memberCount },
    { count: onLeaveCount },
    { data: onLeaveTodayRaw },
    { count: pendingCount },
    { count: approvedCount },
    { count: rejectedCount },
    { data: companyLeaves },
    { count: fullDayCount },
    { count: wfhCount },
    { count: shootCount },
    { count: halfDayCount },
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
      .eq("role", "MEMBER"),
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
      .select("from_date, to_date, users(id, name)")
      .eq("company_id", cid)
      .eq("status", "approved")
      .in("leave_type", ["full_day", "half_day"])
      .lte("from_date", today)
      .gte("to_date", today),
    admin.from("leaves").select("*", { count: "exact", head: true }).eq("company_id", cid).eq("status", "pending"),
    admin.from("leaves").select("*", { count: "exact", head: true }).eq("company_id", cid).eq("status", "approved"),
    admin.from("leaves").select("*", { count: "exact", head: true }).eq("company_id", cid).eq("status", "rejected"),
    admin.from("company_leaves").select("id, date, name").eq("company_id", cid).order("date"),
    admin.from("leaves").select("*", { count: "exact", head: true }).eq("company_id", cid).eq("leave_type", "full_day"),
    admin.from("leaves").select("*", { count: "exact", head: true }).eq("company_id", cid).eq("leave_type", "wfh"),
    admin.from("leaves").select("*", { count: "exact", head: true }).eq("company_id", cid).eq("leave_type", "shoot_day"),
    admin.from("leaves").select("*", { count: "exact", head: true }).eq("company_id", cid).eq("leave_type", "half_day"),
  ])

  const total = Math.max(1, memberCount ?? 0)
  const onLeave = onLeaveCount ?? 0
  const availabilityPct = Math.min(100, Math.max(0, Math.round(((total - onLeave) / total) * 100)))

  const onLeaveToday = (onLeaveTodayRaw ?? []).map((l: any) => {
    const u = Array.isArray(l.users) ? l.users[0] : l.users
    return { name: (u?.name ?? "?") as string }
  })

  return (
    <LeavesClient
      leaves={leaves ?? []}
      statusFilter={statusFilter}
      typeFilter={typeFilter}
      upcomingLeaves={upcoming ?? []}
      availabilityPct={availabilityPct}
      onLeaveToday={onLeaveToday}
      pendingCount={pendingCount ?? 0}
      approvedCount={approvedCount ?? 0}
      rejectedCount={rejectedCount ?? 0}
      companyLeaves={(companyLeaves ?? []) as { id: string; date: string; name: string }[]}
      fullDayCount={fullDayCount ?? 0}
      wfhCount={wfhCount ?? 0}
      shootCount={shootCount ?? 0}
      halfDayCount={halfDayCount ?? 0}
    />
  )
}
