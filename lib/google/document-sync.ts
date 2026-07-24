import { createClient } from "@supabase/supabase-js"
import { uploadMemberDoc } from "@/lib/actions/member-documents"

function adminSupabase() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  )
}

export const MAX_DRIVE_RETRY_ATTEMPTS = 5

/** Pure: decides the next queue row state after a failed sync/retry attempt. */
export function nextRetryState(attempts: number): { attempts: number; status: "pending" | "failed" } {
  const nextAttempts = attempts + 1
  return {
    attempts: nextAttempts,
    status: nextAttempts >= MAX_DRIVE_RETRY_ATTEMPTS ? "failed" : "pending",
  }
}

/** Records a failed Drive sync so the daily cron will retry it. Never throws. */
export async function queueDriveRetry(params: {
  companyId: string
  userId: string
  name: string
  storagePath: string
  mimeType: string
}): Promise<void> {
  const admin = adminSupabase()
  const { error } = await admin.from("drive_sync_queue").insert({
    company_id: params.companyId,
    user_id: params.userId,
    name: params.name,
    storage_path: params.storagePath,
    mime_type: params.mimeType,
  })
  if (error) console.error("[drive-sync] failed to queue retry:", error)
}

/**
 * Best-effort: uploads `file` to the member's Google Drive folder via the
 * existing uploadMemberDoc action. Never throws — on any failure it queues
 * a drive_sync_queue row for the daily retry cron instead.
 */
export async function syncDocumentOrQueueRetry(params: {
  userId: string
  companyId: string
  file: File
  storagePath: string
}): Promise<void> {
  const { userId, companyId, file, storagePath } = params
  try {
    const form = new FormData()
    form.append("user_id", userId)
    form.append("company_id", companyId)
    form.append("file", file)
    const result = await uploadMemberDoc(form)
    if (result && "error" in result && result.error) throw new Error(result.error)
  } catch (err) {
    console.error("[drive-sync] sync failed, queuing for retry:", err)
    await queueDriveRetry({ companyId, userId, name: file.name, storagePath, mimeType: file.type })
  }
}
