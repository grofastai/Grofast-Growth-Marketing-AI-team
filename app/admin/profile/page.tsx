import { redirect } from "next/navigation"
import { createServerClient } from "@/lib/supabase/server"
import { createClient } from "@supabase/supabase-js"
import AdminProfileClient from "./profile-client"

function adminSupabase() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  )
}

export default async function AdminProfilePage() {
  const supabase = await createServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect("/login")

  const admin = adminSupabase()
  const { data: profile } = await admin
    .from("users")
    .select("name, employee_id, email, photo_url, role")
    .eq("id", user.id)
    .single()

  return (
    <AdminProfileClient
      name={profile?.name ?? "Admin"}
      employeeId={profile?.employee_id ?? ""}
      email={profile?.email ?? ""}
      photoUrl={profile?.photo_url ?? null}
    />
  )
}
