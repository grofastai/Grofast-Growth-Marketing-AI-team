'use server'

import { createServerClient } from '@/lib/supabase/server'
import { createClient } from '@supabase/supabase-js'
import { revalidatePath } from 'next/cache'
import { sendNotification } from '@/lib/notifications/send'
import { insertManyNotifications } from './notifications'

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

// Mirrors calcNetWorkHours in history-client — net work hours from work_entries
function calcNetWorkHoursFromEntries(entries: { task_type: string; start_time?: string | null; end_time?: string | null; duration_hours?: number; _travel_hours?: number | null }[]): number {
  function toMins(t: string) { const [h, m] = t.split(':').map(Number); return h * 60 + m }
  const workEntries  = entries.filter(e => e.task_type !== 'break' && e.task_type !== 'learning')
  const breakEntries = entries.filter(e => e.task_type === 'break')
  const workIntervals = workEntries
    .filter(e => e.start_time && e.end_time)
    .map(e => ({ start: toMins(e.start_time!), end: toMins(e.end_time!) }))
    .filter(i => i.end > i.start)
    .sort((a, b) => a.start - b.start)
  let merged: { start: number; end: number }[] = []
  if (workIntervals.length > 0) {
    let cs = workIntervals[0].start, ce = workIntervals[0].end
    for (let i = 1; i < workIntervals.length; i++) {
      if (workIntervals[i].start < ce) { ce = Math.max(ce, workIntervals[i].end) }
      else { merged.push({ start: cs, end: ce }); cs = workIntervals[i].start; ce = workIntervals[i].end }
    }
    merged.push({ start: cs, end: ce })
  }
  const breakIntervals = breakEntries
    .filter(e => e.start_time && e.end_time)
    .map(e => ({ start: toMins(e.start_time!), end: toMins(e.end_time!) }))
    .filter(i => i.end > i.start)
  for (const brk of breakIntervals) {
    const next: { start: number; end: number }[] = []
    for (const w of merged) {
      if (brk.end <= w.start || brk.start >= w.end) { next.push(w) }
      else {
        if (brk.start > w.start) next.push({ start: w.start, end: brk.start })
        if (brk.end < w.end)   next.push({ start: brk.end,  end: w.end   })
      }
    }
    merged = next
  }
  const timedMins = merged.reduce((s, i) => s + (i.end - i.start), 0)
  const travelH   = workEntries.filter(e => e.task_type === 'shoot').reduce((s, e) => s + (e._travel_hours ?? 0), 0)
  const untimedH  = workEntries.filter(e => !e.start_time || !e.end_time).reduce((s, e) => s + (e.duration_hours ?? 0), 0)
  return Math.round((timedMins / 60 + travelH + untimedH) * 10) / 10
}

export async function getAttendanceRange(startDate: string, endDate: string): Promise<{
  success: boolean
  logs: Array<{ id: string; date: string; clock_in: string | null; clock_out: string | null; break_total_mins: number; break_in: string | null; break_out: string | null; work_type: string | null; status: string; learning_hours: number; worked_hours: number; entries_break_hours: number }>
  leaveDates: string[]
  error?: string
}> {
  const ctxResult = await getUserContext()
  if ('error' in ctxResult) return { success: false, logs: [], leaveDates: [], error: ctxResult.error }
  const ctx = ctxResult

  const admin = adminSupabase()
  const [attResult, updatesResult, leavesResult] = await Promise.all([
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
  ])

  if (attResult.error) return { success: false, logs: [], leaveDates: [], error: attResult.error.message }

  const workedByDate: Record<string, number> = {}
  const learnByDate: Record<string, number>  = {}
  const breakByDate:  Record<string, number>  = {}

  for (const r of (updatesResult.data ?? [])) {
    const entries = (Array.isArray(r.work_entries) ? r.work_entries : []) as { task_type: string; start_time?: string | null; end_time?: string | null; duration_hours?: number; _travel_hours?: number | null }[]
    // Learning: prefer from learning entries, fallback to stored learning_hours
    const learnFromEntries = entries.filter(e => e.task_type === 'learning').reduce((s, e) => s + (e.duration_hours ?? 0), 0)
    const learnH = learnFromEntries > 0 ? learnFromEntries : (r.learning_hours ?? 0)
    learnByDate[r.date] = learnH
    // Worked: net work from entries; fallback to stored working_hours when no entries
    const netWorkH = entries.length > 0 ? calcNetWorkHoursFromEntries(entries) : (r.working_hours ?? 0)
    workedByDate[r.date] = netWorkH + learnH
    // Break: sum of break entries' duration_hours
    breakByDate[r.date] = entries.filter(e => e.task_type === 'break').reduce((s, e) => s + (e.duration_hours ?? 0), 0)
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
  const leaveDates: string[] = []
  for (const lv of (leavesResult.data ?? [])) {
    if (lv.leave_type === 'permission') continue // permission doesn't make full day absent
    const cur = new Date(lv.from_date + 'T12:00:00')
    const end = new Date(lv.to_date + 'T12:00:00')
    while (cur <= end) {
      leaveDates.push(cur.toISOString().split('T')[0])
      cur.setDate(cur.getDate() + 1)
    }
  }

  return { success: true, logs, leaveDates }
}

export async function getYesterdayGateStatus(): Promise<{
  forgotLogout: boolean
  missingUpdate: boolean
  yesterdayDate: string
}> {
  const ctxResult = await getUserContext()
  const fallback = { forgotLogout: false, missingUpdate: false, yesterdayDate: '' }
  if ('error' in ctxResult) return fallback

  const ctx = ctxResult
  const yd = new Date()
  yd.setDate(yd.getDate() - 1)
  const yesterday = yd.toISOString().split('T')[0]

  const admin = adminSupabase()
  const [{ data: attLog }, { data: update }, { data: leave }] = await Promise.all([
    admin.from('attendance_logs')
      .select('clock_in, clock_out, status')
      .eq('user_id', ctx.userId)
      .eq('company_id', ctx.companyId)
      .eq('date', yesterday)
      .maybeSingle(),
    admin.from('daily_updates')
      .select('id')
      .eq('user_id', ctx.userId)
      .eq('company_id', ctx.companyId)
      .eq('date', yesterday)
      .maybeSingle(),
    admin.from('leaves')
      .select('id')
      .eq('user_id', ctx.userId)
      .eq('company_id', ctx.companyId)
      .eq('status', 'approved')
      .lte('from_date', yesterday)
      .gte('to_date', yesterday)
      .maybeSingle(),
  ])

  // Skip checks if on approved leave or marked on leave yesterday
  if (leave) return fallback
  if (attLog?.status === 'leave' || attLog?.status === 'absent') return fallback

  const hadClockIn = attLog?.status === 'present' && !!attLog?.clock_in
  const forgotLogout = hadClockIn && !attLog?.clock_out
  // All days (including weekends) are working days — no weekday exemption
  const missingUpdate = !update && (hadClockIn || !attLog)

  return { forgotLogout, missingUpdate, yesterdayDate: yesterday }
}

export async function getTodayCoverageReport(): Promise<{
  clockIn: string | null
  clockOut: string | null
  shiftMinutes: number
  totalWorkMinutes: number
  gapMinutes: number
  entries: Array<{ task_type: string; title: string; client_name: string; duration_hours: number }>
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

  const rawEntries = Array.isArray(update?.work_entries) ? update!.work_entries as Array<{ task_type: string; title: string; client_name: string; duration_hours: number }> : []
  const entries = rawEntries.filter((e) => e.task_type !== 'break')
  const learnH = update?.learning_hours ?? 0
  const totalWorkMinutes = Math.round(entries.reduce((s, e) => s + (e.duration_hours ?? 0), 0) * 60 + learnH * 60)
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

