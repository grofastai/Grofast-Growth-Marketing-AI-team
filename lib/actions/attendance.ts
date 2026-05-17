'use server'

import { createServerClient } from '@/lib/supabase/server'
import { createClient } from '@supabase/supabase-js'
import { revalidatePath } from 'next/cache'
import { sendNotification } from '@/lib/notifications/send'

// 10:00 AM IST = 04:30 UTC. Returns true if clock-in is after 10:00 AM IST.
function isLateArrival(isoUtc: string): boolean {
  const d = new Date(isoUtc)
  const istMs = d.getTime() + 5.5 * 60 * 60 * 1000
  const ist = new Date(istMs)
  const h = ist.getUTCHours()
  const m = ist.getUTCMinutes()
  return h > 10 || (h === 10 && m > 0)
}

function formatISTTime(isoUtc: string): string {
  return new Date(isoUtc).toLocaleTimeString('en-IN', {
    hour: '2-digit', minute: '2-digit', hour12: true, timeZone: 'Asia/Kolkata',
  })
}

function adminSupabase() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  )
}

async function getUserContext(): Promise<{ userId: string; companyId: string } | { error: string }> {
  const supabase = await createServerClient()
  const { data: { user }, error: authError } = await supabase.auth.getUser()
  if (!user) return { error: authError ? `Auth error: ${authError.message}` : 'No session — please log in again' }

  // Try users table first (service-role query)
  const admin = adminSupabase()
  const { data, error: dbError } = await admin.from('users').select('company_id').eq('id', user.id).single()
  if (data?.company_id) return { userId: user.id, companyId: data.company_id as string }

  if (dbError && dbError.code !== 'PGRST116') {
    // PGRST116 = row not found; any other error means DB/key issue
    return { error: `Database error: ${dbError.message}` }
  }

  // Fallback: decode company_id from JWT claims (set by Supabase Edge Function hook)
  try {
    const { data: { session } } = await supabase.auth.getSession()
    if (session?.access_token) {
      const payload = JSON.parse(atob(session.access_token.split('.')[1]))
      if (payload?.company_id) return { userId: user.id, companyId: payload.company_id as string }
    }
  } catch {}

  return { error: 'Account not linked to a company — contact your admin to re-create your account' }
}

export async function clockIn(workType: 'wfh' | 'office'): Promise<{ success: boolean; error?: string }> {
  const ctxResult = await getUserContext()
  if ('error' in ctxResult) return { success: false, error: ctxResult.error }
  const ctx = ctxResult

  const today = new Date().toISOString().split('T')[0]
  const admin = adminSupabase()

  const { data: existing } = await admin
    .from('attendance_logs')
    .select('id')
    .eq('company_id', ctx.companyId)
    .eq('user_id', ctx.userId)
    .eq('date', today)
    .single()

  if (existing) return { success: false, error: 'Already logged attendance today' }

  const clockInTime = new Date().toISOString()

  const { error } = await admin.from('attendance_logs').insert({
    company_id: ctx.companyId,
    user_id: ctx.userId,
    date: today,
    clock_in: clockInTime,
    work_type: workType,
    status: 'present',
  })

  if (error) return { success: false, error: error.message }

  if (isLateArrival(clockInTime)) {
    ;(async () => {
      const [{ data: profile }, { data: adminRow }] = await Promise.all([
        admin.from('users').select('name, employee_id').eq('id', ctx.userId).single(),
        admin.from('users').select('phone').eq('company_id', ctx.companyId).eq('role', 'ADMIN').limit(1).single(),
      ])
      if (profile && adminRow?.phone) {
        await sendNotification({
          event:         'attendance.late',
          employee_name: profile.name,
          employee_id:   profile.employee_id,
          clock_in_time: formatISTTime(clockInTime),
          admin_phone:   adminRow.phone,
        })
      }
    })().catch(console.error)
  }

  revalidatePath('/member/dashboard')
  revalidatePath('/admin/attendance')
  return { success: true }
}

export async function markAbsent(): Promise<{ success: boolean; error?: string }> {
  const ctxResult = await getUserContext()
  if ('error' in ctxResult) return { success: false, error: ctxResult.error }
  const ctx = ctxResult

  const today = new Date().toISOString().split('T')[0]
  const admin = adminSupabase()

  const { data: existing } = await admin
    .from('attendance_logs')
    .select('id')
    .eq('company_id', ctx.companyId)
    .eq('user_id', ctx.userId)
    .eq('date', today)
    .single()

  if (existing) return { success: false, error: 'Already logged attendance today' }

  const { error } = await admin.from('attendance_logs').insert({
    company_id: ctx.companyId,
    user_id: ctx.userId,
    date: today,
    status: 'absent',
  })

  if (error) return { success: false, error: error.message }
  revalidatePath('/member/dashboard')
  revalidatePath('/admin/attendance')
  return { success: true }
}

export async function clockOut(): Promise<{ success: boolean; error?: string }> {
  const ctxResult = await getUserContext()
  if ('error' in ctxResult) return { success: false, error: ctxResult.error }
  const ctx = ctxResult

  const today = new Date().toISOString().split('T')[0]
  const admin = adminSupabase()

  const { error } = await admin
    .from('attendance_logs')
    .update({ clock_out: new Date().toISOString() })
    .eq('company_id', ctx.companyId)
    .eq('user_id', ctx.userId)
    .eq('date', today)
    .is('clock_out', null)

  if (error) return { success: false, error: error.message }
  revalidatePath('/member/dashboard')
  revalidatePath('/admin/attendance')
  return { success: true }
}

export async function breakIn(): Promise<{ success: boolean; error?: string }> {
  const ctxResult = await getUserContext()
  if ('error' in ctxResult) return { success: false, error: ctxResult.error }
  const ctx = ctxResult

  const today = new Date().toISOString().split('T')[0]
  const admin = adminSupabase()

  const { data: log } = await admin
    .from('attendance_logs')
    .select('id, clock_in, break_in')
    .eq('company_id', ctx.companyId)
    .eq('user_id', ctx.userId)
    .eq('date', today)
    .maybeSingle()

  if (!log?.clock_in) return { success: false, error: 'Clock in first before starting a break.' }
  if (log.break_in)   return { success: false, error: 'Break already started today.' }

  const { error } = await admin
    .from('attendance_logs')
    .update({ break_in: new Date().toISOString() })
    .eq('id', log.id)

  if (error) return { success: false, error: error.message }
  revalidatePath('/member/attendance')
  return { success: true }
}

export async function breakOut(): Promise<{ success: boolean; error?: string }> {
  const ctxResult = await getUserContext()
  if ('error' in ctxResult) return { success: false, error: ctxResult.error }
  const ctx = ctxResult

  const today = new Date().toISOString().split('T')[0]
  const admin = adminSupabase()

  const { data: log } = await admin
    .from('attendance_logs')
    .select('id, break_in, break_out')
    .eq('company_id', ctx.companyId)
    .eq('user_id', ctx.userId)
    .eq('date', today)
    .maybeSingle()

  if (!log?.break_in)  return { success: false, error: 'No break started yet.' }
  if (log.break_out)   return { success: false, error: 'Break already ended today.' }

  const { error } = await admin
    .from('attendance_logs')
    .update({ break_out: new Date().toISOString() })
    .eq('id', log.id)

  if (error) return { success: false, error: error.message }
  revalidatePath('/member/attendance')
  return { success: true }
}

export async function getAttendanceByDate(date: string): Promise<{
  success: boolean
  log: { clock_in: string | null; clock_out: string | null; work_type: string | null; status: string } | null
  error?: string
}> {
  const ctxResult = await getUserContext()
  if ('error' in ctxResult) return { success: false, log: null, error: ctxResult.error }
  const ctx = ctxResult

  const admin = adminSupabase()
  const { data, error } = await admin
    .from('attendance_logs')
    .select('clock_in, clock_out, work_type, status')
    .eq('company_id', ctx.companyId)
    .eq('user_id', ctx.userId)
    .eq('date', date)
    .maybeSingle()

  if (error) return { success: false, log: null, error: error.message }
  return { success: true, log: data }
}
