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

export async function ensureMemberDriveFolder(userId: string): Promise<string | null> {
  const admin = adminClient()
  const { data: user } = await admin.from("users").select("name, drive_folder_id").eq("id", userId).single()
  if (!user) return null

  if (user.drive_folder_id) return user.drive_folder_id as string

  const folderId = await getOrCreateMemberFolder(user.name)
  await admin.from("users").update({ drive_folder_id: folderId }).eq("id", userId)
  return folderId
}
