import { createServerClient } from '@/lib/supabase/server'
import { createClient } from '@supabase/supabase-js'
import { NextRequest, NextResponse } from 'next/server'

function adminSupabase() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  )
}

export async function POST(request: NextRequest) {
  const supabase = await createServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return new NextResponse('Unauthorized', { status: 401 })

  const subscription = await request.json()
  if (!subscription?.endpoint) return new NextResponse('Invalid subscription', { status: 400 })

  const admin = adminSupabase()
  const { data: profile } = await admin.from('users').select('company_id').eq('id', user.id).single()
  if (!profile) return new NextResponse('Not found', { status: 404 })

  await admin.from('push_subscriptions').upsert({
    user_id: user.id,
    company_id: profile.company_id,
    endpoint: subscription.endpoint,
    p256dh: subscription.keys?.p256dh ?? '',
    auth: subscription.keys?.auth ?? '',
    updated_at: new Date().toISOString(),
  }, { onConflict: 'user_id' })

  return new NextResponse('OK')
}

export async function DELETE(request: NextRequest) {
  const supabase = await createServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return new NextResponse('Unauthorized', { status: 401 })

  const admin = adminSupabase()
  await admin.from('push_subscriptions').delete().eq('user_id', user.id)

  return new NextResponse('OK')
}
