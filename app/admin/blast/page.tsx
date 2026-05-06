export const revalidate = 60

import { createServerClient } from "@/lib/supabase/server"
import { createClient } from "@supabase/supabase-js"
import { redirect } from "next/navigation"
import BlastClient from "./blast-client"

export default async function BlastPage() {
  const supabase = await createServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect("/login")

  const admin = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  )

  const { data: profile } = await admin
    .from("users").select("company_id").eq("id", user.id).single()
  if (!profile) redirect("/login")

  const { data: members } = await admin
    .from("users")
    .select("id, name, employee_id, phone")
    .eq("company_id", profile.company_id)
    .eq("status", "active")
    .is("deleted_at", null)
    .order("name")

  return <BlastClient members={members ?? []} />
}
