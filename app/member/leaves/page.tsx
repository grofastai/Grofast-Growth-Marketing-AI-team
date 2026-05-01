export const revalidate = 30

import { createServerClient } from "@/lib/supabase/server"
import { redirect } from "next/navigation"
import MemberLeavesClient from "./leaves-client"

export default async function MemberLeavesPage() {
  const supabase = await createServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect("/login")

  const { data: leaves } = await supabase
    .from("leaves")
    .select("*")
    .eq("user_id", user.id)
    .order("created_at", { ascending: false })

  return <MemberLeavesClient leaves={leaves ?? []} />
}
