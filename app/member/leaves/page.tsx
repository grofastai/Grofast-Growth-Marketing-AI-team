export const revalidate = 30

import { createServerClient } from "@/lib/supabase/server"
import { createClient } from "@supabase/supabase-js"
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

  const admin = adminSupabase()

  const [leavesResult, profileResult] = await Promise.all([
    supabase
      .from("leaves")
      .select("*")
      .eq("user_id", user.id)
      .order("created_at", { ascending: false })
      .limit(50),
    admin
      .from("users")
      .select("name")
      .eq("id", user.id)
      .single(),
  ])

  const leaves  = leavesResult.data ?? []
  const name    = (profileResult.data?.name ?? "").split(" ")[0] || "there"

  return <MemberLeavesClient leaves={leaves} userName={name} />
}
