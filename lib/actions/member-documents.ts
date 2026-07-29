"use server"

import { createClient } from "@supabase/supabase-js"
import { getOrCreateMemberFolder, uploadMemberDocument } from "@/lib/google/drive"

function adminClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  )
}

export async function uploadMemberDoc(formData: FormData) {
  const userId = formData.get("user_id") as string
  const companyId = formData.get("company_id") as string
  const file = formData.get("file") as File
  if (!userId || !companyId || !file) return { error: "Missing fields" }

  const admin = adminClient()

  // Get member name for folder
  const { data: user } = await admin.from("users").select("name, drive_folder_id").eq("id", userId).single()
  if (!user) return { error: "User not found" }

  // Get or create Drive folder for this member
  let folderId = user.drive_folder_id as string | null
  if (!folderId) {
    folderId = await getOrCreateMemberFolder(user.name)
    await admin.from("users").update({ drive_folder_id: folderId }).eq("id", userId)
  }

  // Upload file to Drive
  const arrayBuffer = await file.arrayBuffer()
  const buffer = Buffer.from(arrayBuffer)
  const { fileId, webViewLink } = await uploadMemberDocument(folderId, file.name, file.type, buffer)

  // Save to member_documents table
  const { error } = await admin.from("member_documents").insert({
    company_id: companyId,
    user_id: userId,
    name: file.name,
    file_type: file.type,
    drive_file_id: fileId,
    drive_url: webViewLink,
  })

  if (error) return { error: error.message }
  return { success: true }
}

export async function deleteMemberDoc(docId: string) {
  const admin = adminClient()
  const { error } = await admin.from("member_documents").delete().eq("id", docId)
  if (error) return { error: error.message }
  return { success: true }
}

function pathFromPublicUrl(url: string): string | null {
  const m = url.match(/\/object\/public\/documents\/(.+)$/)
  return m ? decodeURIComponent(m[1]) : null
}

// Manual "Sync to Drive" — backfills anything uploaded before Drive sync existed (or
// that failed and somehow fell out of the retry queue) by re-downloading each file from
// Supabase Storage and pushing it through the same uploadMemberDoc path new uploads use.
// Skips anything whose name already has a member_documents row, so re-clicking never
// creates duplicate copies in Drive.
export async function syncMemberDocumentsNow(userId: string): Promise<{ success: boolean; error?: string; synced?: number; skipped?: number; failed?: number }> {
  // Wrapped in try/catch rather than letting anything throw across the Server Action
  // boundary — Next.js strips thrown-error messages in production builds, so an
  // unhandled exception here would reach the client as a generic, undiagnosable
  // message. Returning {success:false, error} as data keeps the real reason visible.
  try {
    const admin = adminClient()
    const { data: user } = await admin.from("users").select("company_id").eq("id", userId).single()
    if (!user) return { success: false, error: "User not found" }

    const [{ data: alreadyDriveSynced }, { data: docRows }, { data: kyc }] = await Promise.all([
      admin.from("member_documents").select("name").eq("user_id", userId),
      admin.from("documents").select("name, file_url, file_type").eq("user_id", userId),
      admin.from("member_kyc").select("govt_id_url, aadhaar_back_url, pan_front_url, pan_back_url, ration_card_url, ration_card_url2, signature_url").eq("user_id", userId).maybeSingle(),
    ])

    const alreadySynced = new Set((alreadyDriveSynced ?? []).map(d => d.name as string))

    const kycTargets: { name: string; url: string | null }[] = kyc ? [
      { name: "Aadhaar Front",      url: kyc.govt_id_url },
      { name: "Aadhaar Back",       url: kyc.aadhaar_back_url },
      { name: "PAN Front",          url: kyc.pan_front_url },
      { name: "PAN Back",           url: kyc.pan_back_url },
      { name: "Ration Card",        url: kyc.ration_card_url },
      { name: "Ration Card (2)",    url: kyc.ration_card_url2 },
      { name: "Signature",          url: kyc.signature_url },
    ] : []

    const targets = [
      ...(docRows ?? []).map(d => ({ name: d.name as string, url: d.file_url as string, type: (d.file_type as string | null) ?? "application/octet-stream" })),
      ...kycTargets.filter((f): f is { name: string; url: string } => !!f.url).map(f => ({ ...f, type: "image/jpeg" })),
    ]

    let synced = 0, skipped = 0, failed = 0
    for (const t of targets) {
      if (alreadySynced.has(t.name)) { skipped++; continue }
      const path = pathFromPublicUrl(t.url)
      if (!path) { failed++; continue }
      try {
        const { data: blob, error: dlErr } = await admin.storage.from("documents").download(path)
        if (dlErr || !blob) throw new Error(dlErr?.message ?? "download failed")
        const file = new File([blob], t.name, { type: t.type })
        const form = new FormData()
        form.append("user_id", userId)
        form.append("company_id", user.company_id)
        form.append("file", file)
        const result = await uploadMemberDoc(form)
        if (result && "error" in result && result.error) throw new Error(result.error)
        synced++
      } catch (err) {
        // Logged per-file so a failed sync is diagnosable from Vercel function logs
        // instead of only showing up as an opaque count on the client.
        console.error(`[syncMemberDocumentsNow] failed syncing "${t.name}" for user ${userId}:`, err)
        failed++
      }
    }

    return { success: true, synced, skipped, failed }
  } catch (err) {
    console.error(`[syncMemberDocumentsNow] failed for user ${userId}:`, err)
    return { success: false, error: err instanceof Error ? err.message : "Sync failed" }
  }
}

export async function ensureMemberDriveFolder(userId: string): Promise<string | null> {
  const admin = adminClient()
  const { data: user } = await admin.from("users").select("name, drive_folder_id").eq("id", userId).single()
  if (!user) return null

  if (user.drive_folder_id) return user.drive_folder_id as string

  const folderId = await getOrCreateMemberFolder(user.name)
  await admin.from("users").update({ drive_folder_id: folderId }).eq("id", userId)
  return folderId
}
