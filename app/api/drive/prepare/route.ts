import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@/lib/supabase/server'
import { createClient } from '@supabase/supabase-js'

function adminSupabase() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  )
}

export async function POST(req: NextRequest) {
  try {
    const supabase = await createServerClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const { clientName, fileName, mimeType, fileSize } = await req.json()
    if (!clientName || !fileName || !mimeType || !fileSize) {
      return NextResponse.json({ error: 'clientName, fileName, mimeType, fileSize are required' }, { status: 400 })
    }

    const now = new Date()
    const year = now.getFullYear().toString()
    const month = now.toLocaleString('en-US', { month: 'long' })
    const storagePath = `${year}/${month}/${clientName}/${Date.now()}_${fileName}`

    const admin = adminSupabase()
    const { data, error } = await admin.storage
      .from('media-uploads')
      .createSignedUploadUrl(storagePath)

    if (error) throw new Error(error.message)

    return NextResponse.json({ uploadUrl: data.signedUrl, storagePath })
  } catch (err: unknown) {
    console.error('[upload/prepare]', err)
    const message = err instanceof Error ? err.message : 'Upload error'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
