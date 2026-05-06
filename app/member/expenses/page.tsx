export const revalidate = 0

import { createServerClient } from "@/lib/supabase/server"
import { redirect } from "next/navigation"
import MemberExpensesClient from "./expenses-client"

export default async function MemberExpensesPage() {
  const supabase = await createServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect("/login")

  const { data: raw } = await supabase
    .from("expense_claims")
    .select("id, amount, category, description, date, status, notes, review_notes, created_at")
    .eq("user_id", user.id)
    .order("created_at", { ascending: false })

  return <MemberExpensesClient expenses={raw ?? []} />
}
