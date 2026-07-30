export const revalidate = 30 // was force-fresh — safe to cache: every write to this page already calls revalidatePath() (2026-07-30)

import { createServerClient } from "@/lib/supabase/server"
import { createClient } from "@supabase/supabase-js"
import { cookies } from "next/headers"
import { redirect } from "next/navigation"
import MemberExpensesClient from "./expenses-client"

function adminSupabase() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  )
}

export default async function MemberExpensesPage() {
  const supabase = await createServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect("/login")
  const cookieStore = await cookies()
  const impersonateId = cookieStore.get("gf_impersonate")?.value
  const effectiveUserId = impersonateId ?? user.id
  // When impersonating, read through the service-role client (RLS would otherwise
  // return zero rows since the session is still the admin's), scoped to effectiveUserId.
  const db = impersonateId ? adminSupabase() : supabase

  const { data: raw } = await db
    .from("expense_claims")
    .select("id, amount, category, description, date, status, notes, review_notes, created_at")
    .eq("user_id", effectiveUserId)
    .order("created_at", { ascending: false })

  return <MemberExpensesClient expenses={raw ?? []} />
}
