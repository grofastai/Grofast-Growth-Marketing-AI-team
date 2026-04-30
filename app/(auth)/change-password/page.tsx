import { redirect } from 'next/navigation'
import { createServerClient } from '@/lib/supabase/server'
import { createClient } from '@supabase/supabase-js'
import { ChangePasswordForm } from './form'

function adminSupabase() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  )
}

export default async function ChangePasswordPage() {
  const supabase = await createServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const admin = adminSupabase()
  const { data: profile } = await admin
    .from('users')
    .select('role, must_change_password')
    .eq('id', user.id)
    .single()

  // Already changed password — send to their dashboard
  if (!profile?.must_change_password) {
    redirect(profile?.role === 'MEMBER' ? '/member/dashboard' : '/admin/dashboard')
  }

  return (
    <div className="min-h-screen flex items-center justify-center px-6" style={{ background: '#0D0D0D' }}>
      <div className="w-full max-w-[380px]">

        <div className="flex items-center gap-2.5 mb-10">
          <div className="w-9 h-9 rounded-lg flex items-center justify-center" style={{ background: '#A3E635' }}>
            <span className="font-black text-[15px]" style={{ color: '#0D0D0D', fontFamily: 'var(--font-jakarta)' }}>G</span>
          </div>
          <span className="text-[16px] font-black tracking-wide" style={{ color: '#FFFFFF', fontFamily: 'var(--font-jakarta)' }}>GROFAST</span>
        </div>

        <div className="mb-8">
          <h2 className="text-[26px] font-black leading-tight mb-2"
            style={{ color: '#FFFFFF', fontFamily: 'var(--font-jakarta)' }}>
            Set your password
          </h2>
          <p className="text-[13px]" style={{ color: 'rgba(255,255,255,0.38)' }}>
            Your account requires a new password before continuing.
          </p>
        </div>

        <ChangePasswordForm />
      </div>
    </div>
  )
}
