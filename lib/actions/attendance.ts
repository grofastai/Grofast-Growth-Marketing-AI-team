'use server'

import { createServerClient } from '@/lib/supabase/server'
import { createClient } from '@supabase/supabase-js'
import { cookies } from 'next/headers'
import { revalidatePath } from 'next/cache'
import { sendNotification } from '@/lib/notifications/send'
import { insertManyNotifications } from './notifications'
import { calcNetWorkHours } from '@/lib/utils/work-hours'
import { findUnresolvedLogoutDate, formatGateDate, hasFiledUpdate } from '@/lib/attendance-gate'

// 9:30 AM IST = 04:00 UTC. Returns true if clock-in is after 9:30 AM IST.
function isLateArrival(isoUtc: string): boolean {
  const d = new Date(isoUtc)
  const istMs = d.getTime() + 5.5 * 60 * 60 * 1000
  const ist = new Date(istMs)
  const h = ist.getUTCHours()
  const m = ist.getUTCMinutes()
  return h > 9 || (h === 9 && m >= 30)
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
  const { data, error: dbError } = await admin.from('users').select('role, company_id').eq('id', user.id).single()
  if (data?.company_id) {
    // Admin impersonation — when an admin has an active impersonation cookie, act
    // as the target member (reads + writes) so the member panel reflects their
    // data. Only honored for ADMINs and same-company targets (the cookie is
    // set server-side by startImpersonation, which already enforces this).
    if (data.role === 'ADMIN') {
      const impersonateId = (await cookies()).get('gf_impersonate')?.value
      if (impersonateId && impersonateId !== user.id) {
        const { data: target } = await admin.from('users').select('company_id').eq('id', impersonateId).single()
        if (target?.company_id && target.company_id === data.company_id) {
          return { userId: impersonateId, companyId: target.company_id as string }
        }
      }
    }
    return { userId: user.id, companyId: data.company_id as string }
  }

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
    .select('id, clock_in, status')
    .eq('company_id', ctx.companyId)
    .eq('user_id', ctx.userId)
    .eq('date', today)
    .maybeSingle()

  // Approving a leave auto-inserts a placeholder attendance_logs row (see
  // lib/actions/leaves.ts) so the day shows correctly on Attendance/History.
  // For half_day that placeholder only covers the leave's own hours — once
  // that window has passed the member can still clock in for the rest of the
  // day, so we upgrade the placeholder in place instead of blocking. Any other
  // existing row (a real clock-in, or a full_day/absent placeholder) still
  // blocks a second clock-in for today.
  const halfDayPlaceholder = existing?.status === 'half_day' && !existing.clock_in ? existing : null
  if (existing && !halfDayPlaceholder) return { success: false, error: 'Already logged attendance today' }

  // Logout is mandatory — refuse to clock in while an earlier day's session is
  // still open, even if the client-side gate was bypassed or never loaded.
  const unresolvedDate = await findUnresolvedLogoutDate(admin, ctx.companyId, ctx.userId, today)
  if (unresolvedDate) {
    return { success: false, error: `You forgot to clock out on ${formatGateDate(unresolvedDate)}. Fix your logout time on the Attendance page before clocking in today.` }
  }

  // Block clock-in if on approved full-day leave
  const { data: approvedLeave } = await admin
    .from('leaves')
    .select('id')
    .eq('company_id', ctx.companyId)
    .eq('user_id', ctx.userId)
    .eq('status', 'approved')
    .eq('leave_type', 'full_day')
    .lte('from_date', today)
    .gte('to_date', today)
    .maybeSingle()

  if (approvedLeave) {
    return { success: false, error: 'You are on approved leave today. Clock-in is not allowed.' }
  }

  // Block clock-in if the last real working day still has an open (unfinished) session,
  // or is missing its Daily Update — regardless of how many days back that day is, and
  // regardless of any leave/blank days sitting in between (see findLastWorkingDayIssues).
  const issues = await findLastWorkingDayIssues(ctx)
  if (issues.forgotLogout) {
    return { success: false, error: `You never logged out on ${issues.forgotLogoutDate} — fix that day's logout time on the Attendance page before logging in again.` }
  }
  if (issues.missingUpdate) {
    return { success: false, error: `You haven't submitted your Daily Update for ${issues.missingUpdateDate} — submit it before logging in again.` }
  }

  const clockInTime = new Date().toISOString()

  // A same-day unique constraint exists on (company_id, user_id, date), so a half-day
  // placeholder row must be updated in place rather than inserted alongside.
  const { error } = halfDayPlaceholder
    ? await admin.from('attendance_logs').update({
        clock_in: clockInTime,
        work_type: workType,
        status: 'present',
      }).eq('id', halfDayPlaceholder.id)
    : await admin.from('attendance_logs').insert({
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
      // Skip late alert if member has an approved permission for today
      const { data: todayPermission } = await admin
        .from('leaves')
        .select('id')
        .eq('company_id', ctx.companyId)
        .eq('user_id', ctx.userId)
        .eq('status', 'approved')
        .eq('leave_type', 'permission')
        .eq('from_date', today)
        .maybeSingle()

      if (todayPermission) return

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
    status: 'leave',
  })

  if (error) return { success: false, error: error.message }
  revalidatePath('/member/dashboard')
  revalidatePath('/member/attendance')
  revalidatePath('/admin/attendance')
  return { success: true }
}

export async function markPastAbsent(date: string): Promise<{ success: boolean; error?: string }> {
  const ctxResult = await getUserContext()
  if ('error' in ctxResult) return { success: false, error: ctxResult.error }
  const ctx = ctxResult

  const today = new Date().toISOString().split('T')[0]
  if (date > today) return { success: false, error: 'Cannot mark future dates as on leave' }

  const admin = adminSupabase()
  const { data: existing } = await admin
    .from('attendance_logs')
    .select('id')
    .eq('company_id', ctx.companyId)
    .eq('user_id', ctx.userId)
    .eq('date', date)
    .maybeSingle()

  if (existing) return { success: false, error: 'Attendance already logged for this date' }

  const { error } = await admin.from('attendance_logs').insert({
    company_id: ctx.companyId,
    user_id: ctx.userId,
    date,
    status: 'leave',
  })

  if (error) return { success: false, error: error.message }
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
    .select('id, clock_in')
    .eq('company_id', ctx.companyId)
    .eq('user_id', ctx.userId)
    .eq('date', today)
    .eq('status', 'present')
    .is('clock_out', null)
    .maybeSingle()

  if (!log) return { success: false, error: 'No active attendance record found for today.' }

  // Past 18 hours is treated as a definite forgotten logout, not a real work span —
  // refuse the live logout and require a manual time correction instead.
  if (log.clock_in) {
    const gapHours = (Date.now() - new Date(log.clock_in).getTime()) / 3600000
    if (gapHours > 18) {
      return { success: false, error: `It's been over ${Math.round(gapHours)} hours since you logged in — that's too long for a live logout. Please use "Fix My Time" to enter your real logout time instead.` }
    }
  }

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

  const fixGapHours = (new Date(clockOutISO).getTime() - new Date(log.clock_in).getTime()) / 3600000
  if (fixGapHours > 18) {
    return { success: false, error: `That's a ${Math.round(fixGapHours)}-hour gap — no real work day runs that long. Please double-check the time, or ask your admin to correct this if it genuinely spans more than one day.` }
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
    .select('id, clock_in, clock_out, paused_seconds, break_total_mins')
    .eq('company_id', ctx.companyId)
    .eq('user_id', ctx.userId)
    .eq('date', date)
    .eq('status', 'present')
    .maybeSingle()

  if (!log) return { success: false, error: 'No attendance record found for today.' }
  if (!log.clock_out) return { success: false, error: 'Already clocked in — not clocked out yet.' }

  // Add the gap between clock_out and now to paused_seconds so the live timer
  // doesn't count the idle window between logout and the continue click.
  const gapSeconds = Math.max(0, Math.floor((Date.now() - new Date(log.clock_out).getTime()) / 1000))
  const existingPaused = Math.max(0, (log.paused_seconds as number) ?? 0)
  const newPausedSeconds = existingPaused + gapSeconds

  // If break_total_mins somehow exceeds the session span (corrupted data),
  // reset it to 0 so the live timer doesn't show 0 after resuming.
  const spanMins = log.clock_in
    ? Math.floor((new Date(log.clock_out).getTime() - new Date(log.clock_in).getTime()) / 60000)
    : 0
  const updates: Record<string, unknown> = { clock_out: null, paused_seconds: newPausedSeconds }
  if ((log.break_total_mins ?? 0) > spanMins) updates.break_total_mins = 0

  const { error } = await admin
    .from('attendance_logs')
    .update(updates)
    .eq('id', log.id)

  if (error) return { success: false, error: error.message }
  revalidatePath('/member/attendance')
  revalidatePath('/admin/attendance')
  return { success: true }
}


export async function getAttendanceRange(startDate: string, endDate: string): Promise<{
  success: boolean
  logs: Array<{ id: string; date: string; clock_in: string | null; clock_out: string | null; break_total_mins: number; break_in: string | null; break_out: string | null; work_type: string | null; status: string; learning_hours: number; worked_hours: number; entries_break_hours: number }>
  leaveDates: string[]
  holidayDates: { date: string; name: string }[]
  error?: string
}> {
  const ctxResult = await getUserContext()
  if ('error' in ctxResult) return { success: false, logs: [], leaveDates: [], holidayDates: [], error: ctxResult.error }

  const ctx = ctxResult

  const admin = adminSupabase()
  const [attResult, updatesResult, leavesResult, holidaysResult, collabResult] = await Promise.all([
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
      .select('date, working_hours, learning_hours, work_entries')
      .eq('company_id', ctx.companyId)
      .eq('user_id', ctx.userId)
      .gte('date', startDate)
      .lte('date', endDate),
    admin
      .from('leaves')
      .select('from_date, to_date, leave_type')
      .eq('company_id', ctx.companyId)
      .eq('user_id', ctx.userId)
      .eq('status', 'approved')
      .lte('from_date', endDate)
      .gte('to_date', startDate),
    admin
      .from('company_leaves')
      .select('date, name')
      .eq('company_id', ctx.companyId)
      .gte('date', startDate)
      .lte('date', endDate),
    admin
      .from('collaboration_confirmations')
      .select('date, confirmed_hours')
      .eq('collaborator_id', ctx.userId)
      .in('status', ['confirmed', 'edited_confirmed'])
      .gte('date', startDate)
      .lte('date', endDate),
  ])

  if (attResult.error) return { success: false, logs: [], leaveDates: [], holidayDates: [], error: attResult.error.message }

  const workedByDate: Record<string, number> = {}
  const learnByDate: Record<string, number>  = {}
  const breakByDate:  Record<string, number>  = {}

  for (const r of (updatesResult.data ?? [])) {
    const entries = (Array.isArray(r.work_entries) ? r.work_entries : []) as { task_type: string; start_time?: string | null; end_time?: string | null; duration_hours?: number; _travel_hours?: number | null }[]
    // Learning hours for display (badge only — NOT added to worked, calcNetWorkHours already includes it)
    const learnFromEntries = entries.filter(e => e.task_type === 'learning').reduce((s, e) => s + (e.duration_hours ?? 0), 0)
    const learnH = entries.length > 0 ? learnFromEntries : (r.learning_hours ?? 0)
    learnByDate[r.date] = learnH
    // Worked: calcNetWorkHours includes all non-break entries (work + learning).
    // Only add learning separately when falling back to stored fields (no entries).
    workedByDate[r.date] = entries.length > 0
      ? calcNetWorkHours(entries)
      : (r.working_hours ?? 0) + (r.learning_hours ?? 0)
    // Break: sum of break entries' duration_hours
    breakByDate[r.date] = entries.filter(e => e.task_type === 'break').reduce((s, e) => s + (e.duration_hours ?? 0), 0)
  }

  // Add confirmed collab hours per day to worked totals
  for (const c of (collabResult.data ?? []) as { date: string; confirmed_hours: number | null }[]) {
    if (c.confirmed_hours && c.confirmed_hours > 0)
      workedByDate[c.date] = (workedByDate[c.date] ?? 0) + c.confirmed_hours
  }

  const logs = (attResult.data ?? []).map(l => ({
    ...l,
    break_in: l.break_in ?? null,
    break_out: l.break_out ?? null,
    learning_hours:      learnByDate[l.date]  ?? 0,
    worked_hours:        workedByDate[l.date]  ?? 0,
    entries_break_hours: breakByDate[l.date]   ?? 0,
  }))

  // Expand approved leave date ranges into individual date strings
  // Only full_day and half_day count as absent/leave days in the attendance table.
  // permission = still present; wfh/shoot_day = working (different mode, not absent)
  const leaveDates: string[] = []
  for (const lv of (leavesResult.data ?? [])) {
    if (lv.leave_type === 'permission' || lv.leave_type === 'wfh' || lv.leave_type === 'shoot_day') continue
    const cur = new Date(lv.from_date + 'T12:00:00')
    const end = new Date(lv.to_date + 'T12:00:00')
    while (cur <= end) {
      leaveDates.push(cur.toISOString().split('T')[0])
      cur.setDate(cur.getDate() + 1)
    }
  }

  const holidayDates = (holidaysResult.data ?? []) as { date: string; name: string }[]

  return { success: true, logs, leaveDates, holidayDates }
}

// Walks backward from yesterday looking for the actual most recent working day with
// an issue — not just literally "yesterday". A day covered by an approved leave (of
// ANY type) or marked leave/absent is excused and skipped for BOTH checks, so a leave
// day sitting between today and an old broken day can no longer hide that broken day
// (e.g. forgot to log out Friday, approved leave Saturday, opens app Sunday — this
// must still catch Friday, not stop at Saturday and call it clean).
// Bounded by MAX_LOOKBACK_DAYS and the user's own join date, so a brand-new hire's
// pre-employment history is never scanned or flagged.
const MAX_LOOKBACK_DAYS = 14

export async function findLastWorkingDayIssues(ctx: { userId: string; companyId: string }): Promise<{
  forgotLogout: boolean
  forgotLogoutDate: string
  missingUpdate: boolean
  missingUpdateDate: string
  missingUpdateHadClockIn: boolean
}> {
  const admin = adminSupabase()

  const { data: profile } = await admin.from('users').select('joined_at').eq('id', ctx.userId).single()
  const joinedAt = (profile as { joined_at?: string | null } | null)?.joined_at ?? ''

  let forgotLogoutDate = ''
  let missingUpdateDate = ''
  let missingUpdateHadClockIn = false
  let forgotLogoutSettled = false
  let missingUpdateSettled = false

  const cursor = new Date()
  for (let i = 0; i < MAX_LOOKBACK_DAYS; i++) {
    cursor.setDate(cursor.getDate() - 1)
    const dateStr = cursor.toISOString().split('T')[0]
    if (joinedAt && dateStr < joinedAt) break // don't scan before they joined

    const [{ data: attLog }, { data: update }, { data: leave }, { data: holiday }] = await Promise.all([
      admin.from('attendance_logs')
        .select('clock_in, clock_out, status')
        .eq('user_id', ctx.userId).eq('company_id', ctx.companyId).eq('date', dateStr).maybeSingle(),
      admin.from('daily_updates')
        .select('work_entries, learning_hours')
        .eq('user_id', ctx.userId).eq('company_id', ctx.companyId).eq('date', dateStr).maybeSingle(),
      admin.from('leaves')
        .select('id')
        .eq('user_id', ctx.userId).eq('company_id', ctx.companyId).eq('status', 'approved')
        .lte('from_date', dateStr).gte('to_date', dateStr).maybeSingle(),
      admin.from('company_leaves')
        .select('id')
        .eq('company_id', ctx.companyId).eq('date', dateStr).maybeSingle(),
    ])

    const excused = !!leave || !!holiday || attLog?.status === 'leave' || attLog?.status === 'absent'
    if (excused) continue // leave/holiday day — skip entirely, keep walking back for BOTH checks

    const hadClockIn = attLog?.status === 'present' && !!attLog?.clock_in

    if (!forgotLogoutSettled) {
      if (hadClockIn && !attLog?.clock_out) { forgotLogoutDate = dateStr; forgotLogoutSettled = true }
      else if (hadClockIn && attLog?.clock_out) { forgotLogoutSettled = true } // properly closed — stop checking further back
      // no clock-in at all: nothing to check on this day, keep walking back
    }

    if (!missingUpdateSettled) {
      // A row existing isn't enough — it can survive with zero real entries (see
      // hasFiledUpdate). Only a real update stops the walkback; an empty shell keeps it going.
      if (hasFiledUpdate(update)) { missingUpdateSettled = true }
      else if (hadClockIn || !attLog) {
        missingUpdateDate = dateStr; missingUpdateHadClockIn = hadClockIn; missingUpdateSettled = true
      }
      // attLog exists but isn't present/no-clock-in (shouldn't happen here since excused days are skipped above)
    }

    if (forgotLogoutSettled && missingUpdateSettled) break
  }

  return {
    forgotLogout: !!forgotLogoutDate,
    forgotLogoutDate,
    missingUpdate: !!missingUpdateDate,
    missingUpdateDate,
    missingUpdateHadClockIn,
  }
}

export async function getYesterdayGateStatus(): Promise<{
  forgotLogout: boolean
  forgotLogoutDate: string
  missingUpdate: boolean
  missingUpdateDate: string
}> {
  const ctxResult = await getUserContext()
  const fallback = { forgotLogout: false, forgotLogoutDate: '', missingUpdate: false, missingUpdateDate: '' }
  if ('error' in ctxResult) return fallback
  // Walks back past leave/blank days to the real last working day for BOTH checks (the
  // Karkil incident fix), and — since findLastWorkingDayIssues now uses hasFiledUpdate
  // internally — treats a zero-entry daily_updates row as unfiled too (the GF009 fix).
  return findLastWorkingDayIssues(ctxResult)
}

export async function getTodayCoverageReport(): Promise<{
  clockIn: string | null
  clockOut: string | null
  shiftMinutes: number
  totalWorkMinutes: number
  gapMinutes: number
  entries: Array<{ task_type: string; start_time?: string | null; end_time?: string | null; duration_hours: number; _travel_hours?: number | null }>
}> {
  const ctxResult = await getUserContext()
  const empty = { clockIn: null, clockOut: null, shiftMinutes: 0, totalWorkMinutes: 0, gapMinutes: 0, entries: [] }
  if ('error' in ctxResult) return empty

  const ctx = ctxResult
  const today = new Date().toISOString().split('T')[0]
  const admin = adminSupabase()

  const [{ data: log }, { data: update }] = await Promise.all([
    admin.from('attendance_logs')
      .select('clock_in, clock_out, break_total_mins')
      .eq('user_id', ctx.userId)
      .eq('company_id', ctx.companyId)
      .eq('date', today)
      .maybeSingle(),
    admin.from('daily_updates')
      .select('work_entries, learning_hours')
      .eq('user_id', ctx.userId)
      .eq('company_id', ctx.companyId)
      .eq('date', today)
      .maybeSingle(),
  ])

  if (!log?.clock_in || !log?.clock_out) return empty

  const shiftMs = new Date(log.clock_out).getTime() - new Date(log.clock_in).getTime()
  const breakMs = (log.break_total_mins ?? 0) * 60 * 1000
  const shiftMinutes = Math.max(0, Math.round((shiftMs - breakMs) / 60000))

  const rawEntries = Array.isArray(update?.work_entries) ? update!.work_entries as Array<{ task_type: string; start_time?: string | null; end_time?: string | null; duration_hours: number; _travel_hours?: number | null }> : []
  // calcNetWorkHours includes learning (task_type !== 'break'). Use it directly to avoid double-counting.
  const totalWorkH = rawEntries.length > 0
    ? calcNetWorkHours(rawEntries)
    : (update?.learning_hours ?? 0)
  const totalWorkMinutes = Math.round(totalWorkH * 60)
  const gapMinutes = Math.max(0, shiftMinutes - totalWorkMinutes)

  return {
    clockIn: log.clock_in,
    clockOut: log.clock_out,
    shiftMinutes,
    totalWorkMinutes,
    gapMinutes,
    entries: rawEntries.filter(e => e.task_type !== 'break'),
  }
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
    .select('id, break_total_mins')
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

  if (clockOutISO) {
    const editGapHours = (new Date(clockOutISO).getTime() - new Date(clockInISO).getTime()) / 3600000
    if (editGapHours > 18) {
      return { success: false, error: `That's a ${Math.round(editGapHours)}-hour gap — no real work day runs that long. Please double-check the times, or ask your admin to correct this if it genuinely spans more than one day.` }
    }
  }

  const updates: Record<string, string | null | number> = { clock_in: clockInISO }
  if (clockOut) updates.clock_out = clockOutISO
  if (breakIn)  updates.break_in  = toISO(breakIn)
  if (breakOut) updates.break_out = toISO(breakOut)
  // Recalculate break_total_mins from explicit break times, or cap existing to new span
  if (breakIn && breakOut) {
    const [bih, bim] = breakIn.split(':').map(Number)
    const [boh, bom] = breakOut.split(':').map(Number)
    const mins = (boh * 60 + bom) - (bih * 60 + bim)
    if (mins > 0) updates.break_total_mins = mins
  } else if (clockOutISO) {
    // Cap stored break_total_mins to the new span so editing clock times can't leave
    // an impossible state where break > span.
    const spanMins = Math.floor((new Date(clockOutISO).getTime() - new Date(clockInISO).getTime()) / 60000)
    const existing = log.break_total_mins ?? 0
    if (existing > spanMins) updates.break_total_mins = 0
  }

  const { error } = await admin.from('attendance_logs').update(updates).eq('id', log.id)
  if (error) return { success: false, error: error.message }
  revalidatePath('/member/attendance')
  revalidatePath('/admin/attendance')
  return { success: true }
}

// Admin-only: delete an attendance log record (clears incorrect clock-in)
export async function adminDeleteAttendanceLog(
  userId: string,
  date: string
): Promise<{ success: boolean; error?: string }> {
  const supabase = await createServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { success: false, error: 'Not authenticated' }

  const admin = adminSupabase()
  const { data: adminUser } = await admin
    .from('users').select('role, company_id').eq('id', user.id).single()
  if (adminUser?.role !== 'ADMIN') return { success: false, error: 'Admin only' }

  const { error } = await admin
    .from('attendance_logs')
    .delete()
    .eq('company_id', adminUser.company_id)
    .eq('user_id', userId)
    .eq('date', date)

  if (error) return { success: false, error: error.message }

  revalidatePath('/admin/attendance')
  revalidatePath('/member/attendance')
  revalidatePath('/member/dashboard')
  return { success: true }
}

