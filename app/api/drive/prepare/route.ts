import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@/lib/supabase/server'
import { getOrCreateClientFolder, initResumableUpload } from '@/lib/google/drive'

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
    const year = now.getFullYear().toString()                              // "2026"
    const month = now.toLocaleString('en-US', { month: 'long' })          // "May"

    const folderId = await getOrCreateClientFolder(year, month, clientName)
    const uploadUrl = await initResumableUpload(folderId, fileName, mimeType, fileSize)

    return NextResponse.json({ uploadUrl })
  } catch (err: unknown) {
    console.error('[drive/prepare]', err)
    const message = err instanceof Error ? err.message : 'Drive error'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
