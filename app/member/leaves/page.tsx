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

  const [leavesResult, profileResult, usedResult] = await Promise.all([
    supabase
      .from("leaves")
      .select("*")
      .eq("user_id", effectiveUserId)
      .order("created_at", { ascending: false })
      .limit(50),
    admin
      .from("users")
      .select("name, paid_leave_days")
      .eq("id", effectiveUserId)
      .single(),
    admin
      .from("leaves")
      .select("from_date, to_date, leave_type")
      .eq("user_id", effectiveUserId)
      .eq("status", "approved")
      .gte("from_date", yearStart),
  ])

  const leaves       = leavesResult.data ?? []
  const name         = (profileResult.data?.name ?? "").split(" ")[0] || "there"
  const paidLeaveDays = profileResult.data?.paid_leave_days ?? 0

  // Calculate used days: full_day = exact days, half_day = 0.5, permission = 0
  const usedDays = (usedResult.data ?? []).reduce((sum, l) => {
    if (l.leave_type === "permission") return sum
    if (l.leave_type === "half_day") return sum + 0.5
    const days = Math.ceil((new Date(l.to_date).getTime() - new Date(l.from_date).getTime()) / 86400000) + 1
    return sum + days
  }, 0)

  return (
    <MemberLeavesClient
      leaves={leaves}
      userName={name}
      paidLeaveDays={paidLeaveDays}
      usedLeaveDays={usedDays}
    />
  )
}
