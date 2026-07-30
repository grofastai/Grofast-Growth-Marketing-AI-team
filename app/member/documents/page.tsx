export const revalidate = 0

import { createServerClient } from "@/lib/supabase/server"
import { createClient } from "@supabase/supabase-js"
import { cookies } from "next/headers"
import { redirect } from "next/navigation"
import MemberDocumentsClient, { type MemberDoc } from "./documents-client"
import type { KYCDocField } from "@/lib/actions/profile"

function adminSupabase() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  )
}

export default async function MemberDocumentsPage() {
  const supabase = await createServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect("/login")
  const cookieStore = await cookies()
  const impersonateId = cookieStore.get("gf_impersonate")?.value
  const effectiveUserId = impersonateId ?? user.id
  // When impersonating, read through the service-role client (RLS would otherwise
  // return zero rows since the session is still the admin's), scoped to effectiveUserId.
  const db = impersonateId ? adminSupabase() : supabase

  type KYCRow = {
    govt_id_type: string | null; govt_id_url: string | null; aadhaar_back_url: string | null
    pan_front_url: string | null; pan_back_url: string | null
    ration_card_url: string | null; ration_card_url2: string | null
    signature_url: string | null
  }

  const [{ data: raw }, { data: kycRaw }] = await Promise.all([
    db
      .from("documents")
      .select("id, name, file_url, file_type, file_size, doc_type, created_at")
      .eq("user_id", effectiveUserId)
      .order("created_at", { ascending: false })
      .limit(50),
    db
      .from("member_kyc")
      .select("govt_id_type, govt_id_url, aadhaar_back_url, pan_front_url, pan_back_url, ration_card_url, ration_card_url2, signature_url")
      .eq("user_id", effectiveUserId)
      .maybeSingle(),
  ])
  const kyc = kycRaw as KYCRow | null

  const kycFields: Array<{ url: string | null; name: string; docType: string; field: KYCDocField }> = kyc ? [
    { url: kyc.govt_id_url, name: kyc.govt_id_type ? `${kyc.govt_id_type} (Front)` : "Government ID", docType: "ID Proof", field: "govt_id_url" },
    { url: kyc.aadhaar_back_url, name: "Aadhaar Back", docType: "ID Proof", field: "aadhaar_back_url" },
    { url: kyc.pan_front_url, name: "PAN Card Front", docType: "ID Proof", field: "pan_front_url" },
    { url: kyc.pan_back_url, name: "PAN Card Back", docType: "ID Proof", field: "pan_back_url" },
    { url: kyc.ration_card_url, name: "Ration Card", docType: "ID Proof", field: "ration_card_url" },
    { url: kyc.ration_card_url2, name: "Ration Card (Page 2)", docType: "ID Proof", field: "ration_card_url2" },
    { url: kyc.signature_url, name: "Signature", docType: "Signature", field: "signature_url" },
  ] : []

  const kycDocs: MemberDoc[] = kycFields
    .filter(f => !!f.url)
    .map((f, i) => ({
      id: `kyc__${i}`,
      name: f.name,
      file_url: f.url!,
      file_type: null,
      file_size: null,
      doc_type: f.docType,
      created_at: new Date(0).toISOString(),
      kycField: f.field,
    }))

  const docs: MemberDoc[] = [...kycDocs, ...((raw ?? []) as MemberDoc[])]

  return (
    <div className="p-4 md:p-6 xl:p-8 max-w-[1000px]">
      <div className="mb-7">
        <h1 className="gradient-heading text-[30px] font-black leading-tight"
          style={{ fontFamily: "var(--font-jakarta)" }}>My Documents</h1>
        <p className="text-sm mt-1" style={{ color: "#6B7280" }}>
          Documents shared by your admin, plus the KYC files you&apos;ve submitted
        </p>
      </div>
      <MemberDocumentsClient docs={docs} />
    </div>
  )
}
