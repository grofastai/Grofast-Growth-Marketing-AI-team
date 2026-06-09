'use server'

import { createServerClient } from '@/lib/supabase/server'
import { createClient } from '@supabase/supabase-js'
import { revalidatePath } from 'next/cache'
import { sendNotification } from '@/lib/notifications/send'
import { insertManyNotifications } from './notifications'

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

export async function clockIn(workType: 'wfh' | 'office' | 'shoot'): Promise<{ success: boolean; error?: string }> {
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
      const [{ data: profile }, { data: adminUsers }] = await Promise.all([
        admin.from('users').select('name, employee_id').eq('id', ctx.userId).single(),
        admin.from('users').select('id, phone').eq('company_id', ctx.companyId).eq('role', 'ADMIN'),
      ])
      if (!profile) return
      const adminWithPhone = adminUsers?.find((a: any) => a.phone)
      if (adminWithPhone?.phone) {
        await sendNotification({
          event:         'attendance.late',
          employee_name: profile.name,
          employee_id:   profile.employee_id,
          clock_in_time: formatISTTime(clockInTime),
          admin_phone:   adminWithPhone.phone,
        })
      }
      if (adminUsers?.length) {
        await insertManyNotifications(adminUsers.map((a: any) => ({
          companyId: ctx.companyId,
          userId: a.id,
          type: 'attendance_late',
          title: `${profile.name} clocked in late`,
          body: `Arrived at ${formatISTTime(clockInTime)}`,
          link: '/admin/attendance',
        })))
      }
    })().catch(console.error)
  }

  if (workType === 'wfh') {
    ;(async () => {
      const [{ data: profile }, { data: adminUsers }] = await Promise.all([
        admin.from('users').select('name').eq('id', ctx.userId).single(),
        admin.from('users').select('id').eq('company_id', ctx.companyId).eq('role', 'ADMIN'),
      ])
      if (!profile || !adminUsers?.length) return
      await insertManyNotifications(adminUsers.map((a: any) => ({
        companyId: ctx.companyId,
        userId: a.id,
        type: 'wfh_started',
        title: `${profile.name} is working from home`,
        body: today,
        link: '/admin/attendance',
      })))
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
  revalidatePath('/member/attendance')
  revalidatePath('/admin/attendance')
  return { success: true }
}

export async function clockOut(): Promise<{ success: boolean; error?: string }> {
  const ctxResult = await getUserContext()
  if ('error' in ctxResult) return { success: false, error: ctxResult.error }
  const ctx = ctxResult

  const today = new Date().toISOString().split('T')[0]
  const admin = adminSupabase()

  const { data: log } = await admin
    .from('attendance_logs')
    .select('id')
    .eq('company_id', ctx.companyId)
    .eq('user_id', ctx.userId)
    .eq('date', today)
    .eq('status', 'present')
    .is('clock_out', null)
    .maybeSingle()

  if (!log) return { success: false, error: 'No active attendance record found for today.' }

  const { error } = await admin
    .from('attendance_logs')
    .update({ clock_out: new Date().toISOString() })
    .eq('id', log.id)

  if (error) return { success: false, error: error.message }
  revalidatePath('/member/attendance')
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
    .select('id, clock_in, break_in, break_sessions')
    .eq('company_id', ctx.companyId)
    .eq('user_id', ctx.userId)
    .eq('date', today)
    .maybeSingle()

  if (!log?.clock_in) return { success: false, error: 'Clock in first before starting a break.' }
  if (log.break_in)   return { success: false, error: 'Break already in progress.' }

  const breakInTime = new Date().toISOString()
  const sessions = Array.isArray(log.break_sessions) ? log.break_sessions : []

  const { error } = await admin
    .from('attendance_logs')
    .update({
      break_in: breakInTime,
      break_sessions: [...sessions, { in: breakInTime, out: null, mins: null }],
    })
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
    .select('id, break_in, break_out, break_total_mins, break_sessions')
    .eq('company_id', ctx.companyId)
    .eq('user_id', ctx.userId)
    .eq('date', today)
    .maybeSingle()

  if (!log?.break_in) return { success: false, error: 'No break started yet.' }
  if (log.break_out)  return { success: false, error: 'Break already ended.' }

  const breakOutTime = new Date().toISOString()
  const breakMins    = Math.max(Math.round((Date.now() - new Date(log.break_in).getTime()) / 60000), 1)
  const newTotal     = (log.break_total_mins ?? 0) + breakMins

  const sessions = Array.isArray(log.break_sessions) ? [...log.break_sessions] : []
  if (sessions.length > 0) {
    const last = sessions[sessions.length - 1]
    if (last.out === null) {
      sessions[sessions.length - 1] = { ...last, out: breakOutTime, mins: breakMins }
    }
  } else {
    sessions.push({ in: log.break_in, out: breakOutTime, mins: breakMins })
  }

  const { error } = await admin
    .from('attendance_logs')
    .update({ break_in: null, break_out: null, break_total_mins: newTotal, break_sessions: sessions })
    .eq('id', log.id)

  if (error) return { success: false, error: error.message }
  revalidatePath('/member/attendance')
  return { success: true }
}

export async function manualClockOut(date: string, time: string): Promise<{ success: boolean; error?: string }> {
  const ctxResult = await getUserContext()
  if ('error' in ctxResult) return { success: false, error: ctxResult.error }
  const ctx = ctxResult

  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return { success: false, error: 'Invalid date.' }
  if (!/^\d{2}:\d{2}$/.test(time))        return { success: false, error: 'Invalid time format.' }

  const admin = adminSupabase()

  const { data: log } = await admin
    .from('attendance_logs')
    .select('id, clock_in, clock_out')
    .eq('company_id', ctx.companyId)
    .eq('user_id', ctx.userId)
    .eq('date', date)
    .eq('status', 'present')
    .maybeSingle()

  if (!log)          return { success: false, error: 'No attendance record found for this date.' }
  if (!log.clock_in) return { success: false, error: 'No clock-in recorded for this date.' }
  if (log.clock_out) return { success: false, error: 'Logout time already recorded for this date.' }

  // Convert user-entered IST time to UTC ISO string
  const [hh, mm] = time.split(':').map(Number)
  const [yy, mo, dd] = date.split('-').map(Number)
  const clockOutISO = new Date(Date.UTC(yy, mo - 1, dd, hh, mm) - 5.5 * 60 * 60 * 1000).toISOString()

  if (new Date(clockOutISO) <= new Date(log.clock_in)) {
    return { success: false, error: 'Logout time must be after your login time.' }
  }

  const { error } = await admin
    .from('attendance_logs')
    .update({ clock_out: clockOutISO })
    .eq('id', log.id)

  if (error) return { success: false, error: error.message }
  revalidatePath('/member/attendance')
  revalidatePath('/admin/attendance')
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

export async function resumeAttendance(date: string): Promise<{ success: boolean; error?: string }> {
  const ctxResult = await getUserContext()
  if ('error' in ctxResult) return { success: false, error: ctxResult.error }
  const ctx = ctxResult

  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return { success: false, error: 'Invalid date.' }

  const today = new Date().toISOString().split('T')[0]
  if (date !== today) return { success: false, error: 'Can only resume attendance for today.' }

  const admin = adminSupabase()

  const { data: log } = await admin
    .from('attendance_logs')
    .select('id, clock_out, paused_seconds')
    .eq('company_id', ctx.companyId)
    .eq('user_id', ctx.userId)
    .eq('date', date)
    .eq('status', 'present')
    .maybeSingle()

  if (!log) return { success: false, error: 'No attendance record found for today.' }
  if (!log.clock_out) return { success: false, error: 'Already clocked in — not clocked out yet.' }

  // Add the gap between clock_out and now to paused_seconds so the live timer
  // doesn't count the idle window between logout and the overtime resume click.
  // Clamp to 0 to guard against edited clock_out timestamps that are in the future.
  const gapSeconds = Math.max(0, Math.floor((Date.now() - new Date(log.clock_out).getTime()) / 1000))
  const newPausedSeconds = Math.max(0, ((log.paused_seconds as number) ?? 0) + gapSeconds)

  const { error } = await admin
    .from('attendance_logs')
    .update({ clock_out: null, paused_seconds: newPausedSeconds })
    .eq('id', log.id)

  if (error) return { success: false, error: error.message }
  revalidatePath('/member/attendance')
  revalidatePath('/admin/attendance')
  return { success: true }
}

export async function getAttendanceRange(startDate: string, endDate: string): Promise<{
  success: boolean
  logs: Array<{ id: string; date: string; clock_in: string | null; clock_out: string | null; break_total_mins: number; break_in: string | null; break_out: string | null; work_type: string | null; status: string; learning_hours: number }>
  error?: string
}> {
  const ctxResult = await getUserContext()
  if ('error' in ctxResult) return { success: false, logs: [], error: ctxResult.error }
  const ctx = ctxResult

  const admin = adminSupabase()
  const [attResult, learnResult] = await Promise.all([
    admin
      .from('attendance_logs')
      .select('id, date, clock_in, clock_out, break_total_mins, break_in, break_out, work_type, status')
      .eq('company_id', ctx.companyId)
      .eq('user_id', ctx.userId)
      .gte('date', startDate)
      .lte('date', endDate)
      .order('date', { ascending: false }),
    admin
      .from('daily_updates')
      .select('date, learning_hours')
      .eq('company_id', ctx.companyId)
      .eq('user_id', ctx.userId)
      .gte('date', startDate)
      .lte('date', endDate),
  ])

  if (attResult.error) return { success: false, logs: [], error: attResult.error.message }

  const learnByDate: Record<string, number> = {}
  for (const r of (learnResult.data ?? [])) {
    learnByDate[r.date] = (learnByDate[r.date] ?? 0) + (r.learning_hours ?? 0)
  }

  const logs = (attResult.data ?? []).map(l => ({
    ...l,
    break_in: l.break_in ?? null,
    break_out: l.break_out ?? null,
    learning_hours: learnByDate[l.date] ?? 0,
  }))
  return { success: true, logs }
}

export async function editAttendanceTimes(
  date: string, clockIn: string, clockOut: string,
  breakIn?: string, breakOut?: string
): Promise<{ success: boolean; error?: string }> {
  const ctxResult = await getUserContext()
  if ('error' in ctxResult) return { success: false, error: ctxResult.error }
  const ctx = ctxResult

  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return { success: false, error: 'Invalid date.' }
  if (!/^\d{2}:\d{2}$/.test(clockIn))     return { success: false, error: 'Invalid login time (HH:MM).' }
  if (clockOut && !/^\d{2}:\d{2}$/.test(clockOut)) return { success: false, error: 'Invalid logout time (HH:MM).' }
  if (breakIn  && !/^\d{2}:\d{2}$/.test(breakIn))  return { success: false, error: 'Invalid break-in time (HH:MM).' }
  if (breakOut && !/^\d{2}:\d{2}$/.test(breakOut)) return { success: false, error: 'Invalid break-out time (HH:MM).' }

  const admin = adminSupabase()
  const { data: log } = await admin
    .from('attendance_logs')
    .select('id')
    .eq('company_id', ctx.companyId)
    .eq('user_id', ctx.userId)
    .eq('date', date)
    .eq('status', 'present')
    .maybeSingle()

  if (!log) return { success: false, error: 'No attendance record found for this date.' }

  const [yy, mo, dd] = date.split('-').map(Number)
  const toISO = (t: string) => {
    const [hh, mm] = t.split(':').map(Number)
    return new Date(Date.UTC(yy, mo - 1, dd, hh, mm) - 5.5 * 60 * 60 * 1000).toISOString()
  }
  const clockInISO  = toISO(clockIn)
  const clockOutISO = clockOut ? toISO(clockOut) : null

  if (clockOutISO && new Date(clockOutISO) <= new Date(clockInISO)) {
    return { success: false, error: 'Logout time must be after login time.' }
  }

  const updates: Record<string, string | null | number> = { clock_in: clockInISO }
  if (clockOut) updates.clock_out = clockOutISO
  if (breakIn)  updates.break_in  = toISO(breakIn)
  if (breakOut) updates.break_out = toISO(breakOut)
  // Recalculate break_total_mins if both provided
  if (breakIn && breakOut) {
    const [bih, bim] = breakIn.split(':').map(Number)
    const [boh, bom] = breakOut.split(':').map(Number)
    const mins = (boh * 60 + bom) - (bih * 60 + bim)
    if (mins > 0) updates.break_total_mins = mins
  }

  const { error } = await admin.from('attendance_logs').update(updates).eq('id', log.id)
  if (error) return { success: false, error: error.message }
  revalidatePath('/member/attendance')
  revalidatePath('/admin/attendance')
  return { success: true }
}
