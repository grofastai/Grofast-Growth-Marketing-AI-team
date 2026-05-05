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

    const { storagePath } = await req.json()
    if (!storagePath) return NextResponse.json({ error: 'storagePath is required' }, { status: 400 })

    const admin = adminSupabase()
    const { data } = admin.storage.from('media-uploads').getPublicUrl(storagePath)

    return NextResponse.json({ driveLink: data.publicUrl })
  } catch (err: unknown) {
    console.error('[upload/complete]', err)
    const message = err instanceof Error ? err.message : 'Upload error'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
