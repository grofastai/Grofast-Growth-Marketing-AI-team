export const revalidate = 0

import { createServerClient } from "@/lib/supabase/server"
import { createClient } from "@supabase/supabase-js"
import { redirect } from "next/navigation"
import AdminsClient from "./admins-client"

function adminSupabase() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  )
}

export default async function AdminsPage() {
  const supabase = await createServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect("/login")

  const admin = adminSupabase()
  const { data: profile } = await admin
    .from("users")
    .select("company_id, role")
    .eq("id", user.id)
    .single()

  if (!profile || !["ADMIN", "FOUNDER", "CEO"].includes(profile.role)) {
    redirect("/admin/dashboard")
  }

  const { data: adminsRaw } = await admin
    .from("users")
    .select("id, name, email, employee_id, role, status, created_at, passport_photo_url")
    .eq("company_id", profile.company_id)
    .in("role", ["ADMIN", "FOUNDER", "CEO"])
    .order("created_at", { ascending: true })

  const admins = (adminsRaw ?? []) as Array<{
    id: string
    name: string
    email: string | null
    employee_id: string
    role: string
    status: string
    created_at: string
    passport_photo_url: string | null
  }>

  return <AdminsClient admins={admins} currentUserId={user.id} />
}
