export const revalidate = 0

import { createServerClient } from "@/lib/supabase/server"
import { createClient } from "@supabase/supabase-js"
import { redirect } from "next/navigation"
import ExpensesClient from "./expenses-client"

function adminClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  )
}

export default async function AdminExpensesPage() {
  const supabase = await createServerClient()
  const { data: { user } } = await supabase.auth.getUser()
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

  const now = new Date()
  const yearStart = `${now.getFullYear()}-01-01`
  const yearEnd   = `${now.getFullYear()}-12-31`

  const [
    { data: updatesRaw },
    { data: usersRaw },
    { data: expensesRaw },
    { data: pricingRaw },
    { data: overridesRaw },
    { data: contentPostsRaw },
  ] = await Promise.all([
    admin
      .from("daily_updates")
      .select("id, user_id, date, work_entries, shoot_count, editing_count, shoot_time_hours, editing_time_hours, working_hours")
      .eq("company_id", cid)
      .order("date", { ascending: false }),
    admin
      .from("users")
      .select("id, name, employee_id, hourly_rate, monthly_salary")
      .eq("company_id", cid),
    admin
      .from("expense_claims")
      .select("*, users(name, employee_id)")
      .eq("company_id", cid)
      .order("created_at", { ascending: false }),
    admin
      .from("pricing_rates")
      .select("video_type, rate_per_video")
      .eq("company_id", cid)
      .order("video_type"),
    admin
      .from("video_cost_overrides")
      .select("video_uid, manual_cost")
      .eq("company_id", cid),
    admin
      .from("content_posts")
      .select("client_name, content_type, scheduled_date")
      .eq("company_id", cid)
      .eq("status", "posted")
      .gte("scheduled_date", yearStart)
      .lte("scheduled_date", yearEnd),
  ])

  return (
    <ExpensesClient
      updates={updatesRaw ?? []}
      users={usersRaw ?? []}
      expenses={expensesRaw ?? []}
      pricingRates={pricingRaw ?? []}
      costOverrides={overridesRaw ?? []}
      contentPosts={contentPostsRaw ?? []}
    />
  )
}
