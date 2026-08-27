export const revalidate = 0

import { createServerClient } from "@/lib/supabase/server"
import { createClient } from "@supabase/supabase-js"
import { getValidImpersonationId } from "@/lib/impersonation"
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
  const impersonateId = await getValidImpersonationId(user.id)
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
