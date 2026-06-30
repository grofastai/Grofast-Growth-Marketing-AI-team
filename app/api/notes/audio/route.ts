import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@/lib/supabase/server'
import { createClient } from '@supabase/supabase-js'

function adminSupabase() {
  return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } })
}

export async function POST(req: NextRequest) {
  const supabase = await createServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const admin = adminSupabase()
  const { data: profile } = await admin.from('users').select('company_id').eq('id', user.id).single()
  if (!profile?.company_id) return NextResponse.json({ error: 'No company' }, { status: 403 })

  const form = await req.formData()
  const file = form.get('file') as File | null
  const noteId = form.get('noteId') as string
  if (!file || !noteId) return NextResponse.json({ error: 'Missing fields' }, { status: 400 })
  if (file.size > 10 * 1024 * 1024) return NextResponse.json({ error: 'Audio too large (max 10MB)' }, { status: 400 })

  const path = `note-audio/${profile.company_id}/${noteId}/${Date.now()}.webm`
  const buffer = Buffer.from(await file.arrayBuffer())
  const { error: upErr } = await admin.storage.from('documents').upload(path, buffer, { contentType: file.type || 'audio/webm', upsert: false })
  if (upErr) return NextResponse.json({ error: upErr.message }, { status: 500 })
  const { data: { publicUrl } } = admin.storage.from('documents').getPublicUrl(path)
  return NextResponse.json({ url: publicUrl })
}
