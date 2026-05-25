import { NextRequest, NextResponse } from "next/server"
import { createServerClient } from "@/lib/supabase/server"
import { createClient } from "@supabase/supabase-js"
import { uploadLimiter } from "@/lib/ratelimit"

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

  if (uploadLimiter) {
    const { success } = await uploadLimiter.limit(user.id)
    if (!success) return NextResponse.json({ error: "Too many uploads. Try again in a few minutes." }, { status: 429 })
  }

  const formData = await req.formData()
  const file = formData.get("file") as File | null
  if (!file) return NextResponse.json({ error: "No file provided" }, { status: 400 })

  const folder = (formData.get("folder") as string | null) ?? "photos"
  const ext    = file.name.split(".").pop() ?? "jpg"
  const path   = `${folder}/${user.id}/${Date.now()}.${ext}`
  const buf  = Buffer.from(await file.arrayBuffer())

  const admin = adminSupabase()
  const { error } = await admin.storage.from("documents").upload(path, buf, {
    contentType: file.type,
    upsert: true,
  })

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  const { data: { publicUrl } } = admin.storage.from("documents").getPublicUrl(path)
  return NextResponse.json({ url: publicUrl })
}
