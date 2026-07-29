export type KycDocSource = {
  govt_id_type?: string | null
  govt_id_url: string | null
  aadhaar_back_url: string | null
  pan_front_url: string | null
  pan_back_url: string | null
  ration_card_url: string | null
  ration_card_url2: string | null
  signature_url: string | null
}

export type KycDocField = { name: string; url: string | null; docType: string }

// Single source of truth for the 7 KYC document slots' display names — used both to
// render them as document cards (documents-client.tsx) and as Drive sync targets
// (syncMemberDocumentsNow in member-documents.ts). Keeping one function means a
// card's displayed name can never drift from what member_documents.name records as
// already-synced — a mismatch there silently re-uploads (duplicates) the file in
// Drive on every "Sync to Drive" click, since the dedup check is name equality.
export function kycDocFields(k: KycDocSource): KycDocField[] {
  return [
    { url: k.govt_id_url,      name: k.govt_id_type ? `${k.govt_id_type} (Front)` : "Government ID", docType: "Govt ID Proof" },
    { url: k.aadhaar_back_url, name: "Aadhaar Back",           docType: "Govt ID Proof" },
    { url: k.pan_front_url,    name: "PAN Card Front",         docType: "Govt ID Proof" },
    { url: k.pan_back_url,     name: "PAN Card Back",          docType: "Govt ID Proof" },
    { url: k.ration_card_url,  name: "Ration Card",            docType: "Ration Card" },
    { url: k.ration_card_url2, name: "Ration Card (Page 2)",   docType: "Ration Card" },
    { url: k.signature_url,    name: "Signature",              docType: "Signature" },
  ]
}
