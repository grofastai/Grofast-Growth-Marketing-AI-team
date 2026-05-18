export const revalidate = 60

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

  const [{ data: profileRaw }, { data: kycRaw }] = await Promise.all([
    admin.from("users")
      .select("name, employee_id, role, email, phone, status, created_at, photo_url, position, team, blood_group, address, emergency_contact_name, emergency_contact_phone, company_id")
      .eq("id", user.id)
      .single(),
    admin.from("member_kyc")
      .select("bank_name, bank_account, bank_ifsc, aadhaar_number, pan_number, govt_id_url, aadhaar_back_url, pan_front_url, pan_back_url, ration_card_url, ration_card_url2")
      .eq("user_id", user.id)
      .maybeSingle(),
  ])

  const companyId = (profileRaw as any)?.company_id ?? ""
  const [{ count: teamCount }, { count: pendingLeaves }] = await Promise.all([
    admin.from("users")
      .select("*", { count: "exact", head: true })
      .eq("company_id", companyId)
      .neq("role", "ADMIN")
      .is("deleted_at", null),
    admin.from("leaves")
      .select("*", { count: "exact", head: true })
      .eq("company_id", companyId)
      .eq("status", "pending"),
  ])

  type ProfileRow = {
    name: string; employee_id: string; role: string
    email: string | null; phone: string | null; status: string
    created_at: string; photo_url: string | null; position: string | null; team: string | null
    blood_group: string | null; address: string | null
    emergency_contact_name: string | null; emergency_contact_phone: string | null
  }
  type KYCRow = {
    bank_name: string | null; bank_account: string | null; bank_ifsc: string | null
    aadhaar_number: string | null; pan_number: string | null
    govt_id_url: string | null; aadhaar_back_url: string | null
    pan_front_url: string | null; pan_back_url: string | null
    ration_card_url: string | null; ration_card_url2: string | null
  }

  const profile = profileRaw as unknown as ProfileRow | null
  const kyc     = kycRaw as unknown as KYCRow | null

  const joined = profile?.created_at
    ? new Date(profile.created_at).toLocaleDateString("en-US", { day: "numeric", month: "long", year: "numeric" })
    : "—"

  return (
    <AdminProfileClient
      profile={profile ? {
        id:          user.id,
        name:        profile.name,
        employee_id: profile.employee_id,
        role:        profile.role,
        email:       profile.email ?? user.email ?? "",
        phone:       profile.phone ?? "",
        status:      profile.status,
        joined,
        photo_url:               profile.photo_url ?? null,
        position:                profile.position ?? null,
        team:                    profile.team ?? null,
        blood_group:             profile.blood_group ?? null,
        address:                 profile.address ?? null,
        emergency_contact_name:  profile.emergency_contact_name ?? null,
        emergency_contact_phone: profile.emergency_contact_phone ?? null,
      } : null}
      kyc={kyc}
      stats={{ teamCount: teamCount ?? 0, pendingLeaves: pendingLeaves ?? 0 }}
      authEmail={user.email ?? ""}
    />
  )
}
