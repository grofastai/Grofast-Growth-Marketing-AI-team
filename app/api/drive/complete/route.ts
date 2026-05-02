import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@/lib/supabase/server'
import { makeFilePublic } from '@/lib/google/drive'

export async function POST(req: NextRequest) {
  try {
    const supabase = await createServerClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const { fileId } = await req.json()
    if (!fileId) return NextResponse.json({ error: 'fileId is required' }, { status: 400 })

    const driveLink = await makeFilePublic(fileId)
    return NextResponse.json({ driveLink })
  } catch (err: unknown) {
    console.error('[drive/complete]', err)
    const message = err instanceof Error ? err.message : 'Drive error'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
