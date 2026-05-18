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

  const [{ data: members }, { data: documents }, { data: kycRecords }] = await Promise.all([
    admin
      .from("users")
      .select("id, name, employee_id, role, email, phone, status, team, employment_type, created_at, blood_group, address, emergency_contact_name, emergency_contact_phone, photo_url")
      .eq("company_id", profile.company_id)
      .eq("status", "active")
      .is("deleted_at", null)
      .order("name"),
    admin
      .from("documents")
      .select("id, name, file_url, file_type, file_size, doc_type, created_at, user_id, users!documents_user_id_fkey(name, employee_id)")
      .eq("company_id", profile.company_id)
      .order("created_at", { ascending: false }),
    admin
      .from("member_kyc")
      .select("user_id, bank_name, bank_account, bank_ifsc, govt_id_type, govt_id_url, ration_card_url")
      .in("user_id",
        (await admin.from("users").select("id").eq("company_id", profile.company_id)).data?.map(u => u.id) ?? []
      ),
  ])

  return (
    <DocumentsClient
      members={members ?? []}
      documents={documents ?? []}
      kycRecords={kycRecords ?? []}
      companyId={profile.company_id}
    />
  )
}
