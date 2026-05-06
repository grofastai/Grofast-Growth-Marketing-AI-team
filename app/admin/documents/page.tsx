export const revalidate = 0

import { createServerClient } from "@/lib/supabase/server"
import { createClient } from "@supabase/supabase-js"
import { redirect } from "next/navigation"
import DocumentsClient from "./documents-client"

export default async function AdminDocumentsPage() {
  const supabase = await createServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect("/login")

  const admin = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  )

  const { data: profile } = await admin.from("users").select("company_id").eq("id", user.id).single()
  if (!profile) redirect("/login")

  const [{ data: members }, { data: documents }] = await Promise.all([
    admin
      .from("users")
      .select("id, name, employee_id")
      .eq("company_id", profile.company_id)
      .eq("status", "active")
      .is("deleted_at", null)
      .order("name"),
    admin
      .from("documents")
      .select("id, name, file_url, file_type, file_size, doc_type, created_at, user_id, users(name, employee_id)")
      .eq("company_id", profile.company_id)
      .order("created_at", { ascending: false }),
  ])

  return (
    <DocumentsClient
      members={members ?? []}
      documents={documents ?? []}
      companyId={profile.company_id}
    />
  )
}
