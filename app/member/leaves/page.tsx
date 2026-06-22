export const revalidate = 30

import { createServerClient } from "@/lib/supabase/server"
import { createClient } from "@supabase/supabase-js"
import { cookies } from "next/headers"
import { redirect } from "next/navigation"
import MemberLeavesClient from "./leaves-client"

function adminSupabase() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  )
}

export default async function MemberLeavesPage() {
  const supabase = await createServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect("/login")
  const cookieStore = await cookies()
  const impersonateId = cookieStore.get("gf_impersonate")?.value
  const effectiveUserId = impersonateId ?? user.id

  const admin = adminSupabase()

  const yearStart = `${new Date().getFullYear()}-01-01`

  const { data: profileData } = await admin
    .from("users")
    .select("name, paid_leave_days, company_id, team")
    .eq("id", effectiveUserId)
    .single()

  const companyId = profileData?.company_id ?? ""

  const [leavesResult, usedResult, absentResult, companyLeavesResult] = await Promise.all([
    supabase
      .from("leaves")
      .select("*")
      .eq("user_id", effectiveUserId)
      .order("created_at", { ascending: false })
      .limit(50),
    admin
      .from("leaves")
      .select("from_date, to_date, leave_type")
      .eq("user_id", effectiveUserId)
      .eq("status", "approved")
      .gte("from_date", yearStart),
    admin
      .from("attendance_logs")
      .select("id, date")
      .eq("user_id", effectiveUserId)
      .in("status", ["absent", "leave"])
      .gte("date", yearStart)
      .order("date", { ascending: false }),
    companyId
      ? admin.from("company_leaves").select("id, date, name").eq("company_id", companyId).order("date")
      : Promise.resolve({ data: [] }),
  ])

  const leaves        = leavesResult.data ?? []
  const name          = (profileData?.name ?? "").split(" ")[0] || "there"
  const paidLeaveDays = profileData?.paid_leave_days ?? 0
  const isMedia       = (profileData as { team?: string | null } | null)?.team === "Media Team"
  const absentDays    = (absentResult.data ?? []) as { id: string; date: string }[]
  const companyLeaves = (companyLeavesResult.data ?? []) as { id: string; date: string; name: string }[]

  // Calculate used days: full_day = exact days, half_day = 0.5, permission/wfh/shoot_day = 0, absent = 1
  const leaveUsedDays = (usedResult.data ?? []).reduce((sum, l) => {
    if (l.leave_type === "permission" || l.leave_type === "wfh" || l.leave_type === "shoot_day") return sum
    if (l.leave_type === "half_day") return sum + 0.5
    const days = Math.ceil((new Date(l.to_date).getTime() - new Date(l.from_date).getTime()) / 86400000) + 1
    return sum + days
  }, 0)
  const usedDays = leaveUsedDays + absentDays.length

  return (
    <MemberLeavesClient
      leaves={leaves}
      userName={name}
      paidLeaveDays={paidLeaveDays}
      usedLeaveDays={usedDays}
      absentDays={absentDays}
      companyLeaves={companyLeaves}
      isMedia={isMedia}
    />
  )
}
