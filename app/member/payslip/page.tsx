export const revalidate = 0

import { getValidImpersonationId } from "@/lib/impersonation"
import { redirect } from "next/navigation"
import { createServerClient } from "@/lib/supabase/server"
import { createClient } from "@supabase/supabase-js"
import PayslipClient from "./payslip-client"

function adminSupabase() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  )
}

export default async function MemberPayslipPage() {
  const supabase = await createServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect("/login")
  const impersonateId = await getValidImpersonationId(user.id)
  const effectiveUserId = impersonateId ?? user.id

  const admin = adminSupabase()

  const { data: profile } = await admin
    .from("users")
    .select("name, employee_id, monthly_salary, employment_type, team, company_id")
    .eq("id", effectiveUserId)
    .single()
  if (!profile) redirect("/login")

  // Build last 12 months list
  const now = new Date()
  const months: string[] = []
  for (let i = 0; i < 12; i++) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1)
    months.push(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`)
  }

  // Fetch payroll runs for those months
  const { data: runs } = await admin
    .from("payroll_runs")
    .select("month, is_paid, paid_at, bonus, advance, incentive")
    .eq("user_id", effectiveUserId)
    .in("month", months)

  const runsMap = new Map((runs ?? []).map(r => [r.month, r]))

  const monthData = months.map(m => {
    const [y, mo] = m.split("-").map(Number)
    const label = new Date(y, mo - 1).toLocaleString("en-IN", { month: "long", year: "numeric" })
    const run   = runsMap.get(m)
    return {
      month: m,
      label,
      isPaid:  run?.is_paid  ?? false,
      paidAt:  run?.paid_at  ?? null,
      bonus:   run?.bonus    ?? 0,
      advance: run?.advance  ?? 0,
      incentive: run?.incentive ?? 0,
    }
  })

  return (
    <PayslipClient
      userId={effectiveUserId}
      months={monthData}
      profile={{
        name:            profile.name,
        employee_id:     profile.employee_id,
        monthly_salary:  profile.monthly_salary,
        employment_type: profile.employment_type,
        team:            profile.team,
      }}
    />
  )
}
