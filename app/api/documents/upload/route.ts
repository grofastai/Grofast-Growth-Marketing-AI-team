import { NextRequest, NextResponse } from "next/server"
import { createServerClient } from "@/lib/supabase/server"
import { createClient } from "@supabase/supabase-js"
import { syncDocumentOrQueueRetry } from "@/lib/google/document-sync"

function adminSupabase() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  )
}

export async function POST(req: NextRequest) {
  const supabase = await createServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const admin = adminSupabase()
  const { data: profile } = await admin.from("users").select("company_id, role").eq("id", user.id).single()
  if (!profile || profile.role !== "ADMIN") return NextResponse.json({ error: "Forbidden" }, { status: 403 })

  const form     = await req.formData()
  const file     = form.get("file") as File | null
  const userId   = form.get("userId") as string
  const docName  = form.get("name") as string
  const docType  = form.get("docType") as string

  if (!file || !userId || !docName) return NextResponse.json({ error: "Missing fields" }, { status: 400 })

  const ext      = file.name.split(".").pop() ?? "bin"
  const path     = `${profile.company_id}/${userId}/${Date.now()}.${ext}`
  const buffer   = Buffer.from(await file.arrayBuffer())

  const { error: upErr } = await admin.storage
    .from("documents")
    .upload(path, buffer, { contentType: file.type, upsert: false })

  if (upErr) return NextResponse.json({ error: upErr.message }, { status: 500 })

  const { data: { publicUrl } } = admin.storage.from("documents").getPublicUrl(path)

  const { error: dbErr } = await admin.from("documents").insert({
    company_id:  profile.company_id,
    user_id:     userId,
    uploaded_by: user.id,
    name:        docName,
    file_url:    publicUrl,
    file_type:   file.type,
    file_size:   file.size,
    doc_type:    docType,
  })

  if (dbErr) return NextResponse.json({ error: dbErr.message }, { status: 500 })

  // Best-effort Drive sync — must never fail the upload the admin already
  // completed successfully in Supabase Storage above.
  try {
    await syncDocumentOrQueueRetry({ userId, companyId: profile.company_id, file, storagePath: path })
  } catch (syncErr) {
    console.error("[documents/upload] Drive sync threw unexpectedly:", syncErr)
  }

  return NextResponse.json({ success: true, url: publicUrl })
}
