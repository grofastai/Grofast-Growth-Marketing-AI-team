import { redirect } from "next/navigation"
import { createServerClient } from "@/lib/supabase/server"

export default async function Home() {
  const supabase = await createServerClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) redirect("/login")
  redirect("/admin/dashboard")
}
