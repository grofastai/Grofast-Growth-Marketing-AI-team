'use server'

import { createServerClient } from '@/lib/supabase/server'
import { createClient } from '@supabase/supabase-js'
import { cookies } from 'next/headers'
import { revalidatePath } from 'next/cache'
import { sendNotification } from '@/lib/notifications/send'
import { insertNotification, insertManyNotifications } from './notifications'
import { formatLeaveDetail } from '@/lib/leave-approval-effects'
import { sumLeaveDays, overtimeHoursByMonth } from '@/lib/utils/leave-balance'
import { HALF_DAY_THRESHOLD_HOURS } from '@/lib/utils/attendance-stats'
import { toISTTimeString } from '@/lib/utils/ist-date'
import {
  planWorkDayAttendance,
  PLACEHOLDER_CLOCK_IN_UTC,
  PLACEHOLDER_CLOCK_OUT_UTC,
} from '@/lib/wfh-shoot-attendance'
import { z } from 'zod'

function createAdminClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  )
}

function timeToMinutes(t: string): number {
  const [h, m] = t.split(':').map(Number)
  return h * 60 + m
}
function rangesOverlap(aStart: number, aEnd: number, bStart: number, bEnd: number): boolean {
  return aStart < bEnd && bStart < aEnd
}

const leaveSchema = z.object({
  leave_type:          z.enum(['full_day', 'half_day', 'permission', 'wfh', 'shoot_day']).default('full_day'),
  from_date:           z.string().min(1, 'Date required'),
  to_date:             z.string().min(1, 'End date required'),
  half_day_period:     z.enum(['morning', 'afternoon']).optional(),
  half_day_from_time:  z.string().optional(),
  half_day_to_time:    z.string().optional(),
  permission_hours:    z.coerce.number().min(0.1).max(12).optional(),
  permission_time:     z.string().optional(),
  permission_end_time: z.string().optional(),
  // Structured Permission reason — Late Login / Early Logoff cover the two common cases
  // without typing; "other" still requires the freeform reason text below.
  permission_reason_type: z.enum(['late_login', 'early_logoff', 'other']).optional(),
  reason:              z.string().min(3, 'Please provide a reason'),
}).superRefine((data, ctx) => {
  if (data.leave_type === 'half_day') {
    if (!data.half_day_from_time) ctx.addIssue({ code: 'custom', path: ['half_day_from_time'], message: 'From time is required for half day leave' })
    if (!data.half_day_to_time)   ctx.addIssue({ code: 'custom', path: ['half_day_to_time'],   message: 'To time is required for half day leave' })
    // A "half day" must always cost exactly HALF_DAY_THRESHOLD_HOURS (4.5h) — otherwise
    // someone could apply "half day" for 1h off (barely an absence) or 8h off (basically
    // a full day) and still only get charged the flat 0.5-day rate. Shared with
    // lib/utils/attendance-stats.ts so the leave request itself and the present-day/
    // payroll classification can never disagree on what "half day" means.
    if (data.half_day_from_time && data.half_day_to_time) {
      let mins = timeToMinutes(data.half_day_to_time) - timeToMinutes(data.half_day_from_time)
      if (mins <= 0) mins += 1440
      const requiredMins = HALF_DAY_THRESHOLD_HOURS * 60
      if (mins !== requiredMins) {
        ctx.addIssue({
          code: 'custom', path: ['half_day_to_time'],
          message: `Half day leave must be exactly ${HALF_DAY_THRESHOLD_HOURS}h (this is ${(mins / 60).toFixed(1)}h)`,
        })
      }
    }
  }
  if (data.leave_type === 'permission') {
    if (!data.permission_time)     ctx.addIssue({ code: 'custom', path: ['permission_time'],     message: 'Leave From time is required for permission' })
    if (!data.permission_end_time) ctx.addIssue({ code: 'custom', path: ['permission_end_time'], message: 'Return By time is required for permission' })
    if (!data.permission_reason_type) ctx.addIssue({ code: 'custom', path: ['permission_reason_type'], message: 'Select a reason' })
  }
})

type LeaveKind = 'full_day' | 'half_day' | 'permission' | 'wfh' | 'shoot_day'
type LeaveTimeFields = {
  leave_type?: string | null
  half_day_from_time?: string | null
  half_day_to_time?: string | null
  permission_time?: string | null
  permission_end_time?: string | null
}

// Two families: Full Day/Half Day/Permission are real absence (not working at all).
// WFH/Shoot Day are work arrangements (still working, just not from the office) —
// confirmed by the product owner these are NOT the same as an absence, and can
// legitimately combine with each other or with a Half Day/Permission on the same
// date (e.g. half-day WFH editing in the morning, then a shoot in the afternoon;
// or a Shoot Day with a short Permission carved out of it for something personal).
//
// Rules (confirmed 2026-07-23):
//  - Full Day blocks everything else that date, and is blocked by everything else.
//  - Two Half Days the same date block each other — apply as Full Day instead.
//  - Half Day vs Permission, and Permission vs Permission, only conflict if their
//    actual time windows overlap — not just because they're the same date.
//  - WFH/Shoot Day never block Half Day or Permission, and never block each other
//    UNLESS it's an exact duplicate (two WFH, or two Shoot Day, same date).
// WFH/Shoot Day are deliberately whole-day flags with no time-of-day field —
// confirmed by the product owner, not something to add.
function typesConflict(newType: LeaveKind, existingType: LeaveKind): 'always' | 'time-overlap-only' | 'never' {
  if (newType === 'full_day' || existingType === 'full_day') return 'always'
  if (newType === existingType && (newType === 'half_day' || newType === 'wfh' || newType === 'shoot_day')) return 'always'
  if ((newType === 'half_day' && existingType === 'permission') || (newType === 'permission' && existingType === 'half_day')) return 'time-overlap-only'
  if (newType === 'permission' && existingType === 'permission') return 'time-overlap-only'
  return 'never'
}

function getLeaveTimeWindow(l: LeaveTimeFields): [string, string] | null {
  if (l.leave_type === 'half_day' && l.half_day_from_time && l.half_day_to_time) return [l.half_day_from_time, l.half_day_to_time]
  if (l.leave_type === 'permission' && l.permission_time && l.permission_end_time) return [l.permission_time, l.permission_end_time]
  return null
}

function timeRangesOverlap(a: [string, string], b: [string, string]): boolean {
  const toMins = (t: string) => { const [h, m] = t.split(':').map(Number); return h * 60 + m }
  let [aStart, aEnd] = [toMins(a[0]), toMins(a[1])]
  let [bStart, bEnd] = [toMins(b[0]), toMins(b[1])]
  if (aEnd <= aStart) aEnd += 1440
  if (bEnd <= bStart) bEnd += 1440
  return Math.min(aEnd, bEnd) - Math.max(aStart, bStart) > 0
}

function parseCompanyId(accessToken: string): string | null {
  try {
    const payload = accessToken.split('.')[1]
    const claims = JSON.parse(atob(payload))
    return claims.company_id ?? null
  } catch {
    return null
  }
}

// Shared by submitLeaveRequest (new request) and updateLeaveRequest (editing a still-
// pending one) — both must check the SAME monthly cap, otherwise editing a pending
// request is a silent backdoor around the limit a fresh submission would have hit.
// excludeLeaveId lets an edit compare against every OTHER leave that month without
// double-counting the very row being edited. Permission hours now count toward this
// cap too (converted via sumLeaveDays/permissionHoursToDays) — previously excluded
// entirely, so a month of small permissions never showed as "used" anywhere.
async function checkMonthlyLeaveLimit(
  adminCl: ReturnType<typeof createAdminClient>,
  userId: string,
  leaveType: string,
  fromDate: string,
  toDate: string,
  excludeLeaveId?: string,
  permissionHours?: number
): Promise<string | null> {
  // Permission is a record of something that already happened (a late login or
  // early logoff), not a discretionary day-off request like Full Day/Half Day/WFH
  // — blocking it doesn't stop the absence, it just stops it from being logged
  // accurately. Its hours still convert to day-equivalents and deduct from the
  // displayed leave balance elsewhere (sumLeaveDays callers in leaves pages);
  // only the submission-blocking cap is skipped here (2026-07-31 fix).
  if (leaveType === 'permission') return null
  const currentMonth = fromDate.slice(0, 7)
  const monthStart = `${currentMonth}-01`
  const monthEnd = `${currentMonth}-31`
  let query = adminCl
    .from('leaves')
    .select('from_date, to_date, leave_type, permission_hours')
    .eq('user_id', userId)
    .gte('from_date', monthStart)
    .lte('from_date', monthEnd)
    .in('status', ['approved', 'pending'])
  if (excludeLeaveId) query = query.neq('id', excludeLeaveId)
  const { data: monthLeaves } = await query

  // Same-month overtime (work logged before 09:30 or at/after 19:00) nets
  // against Permission hours before they convert into day-equivalents — see
  // sumLeaveDays' overtimeByMonth param. Someone who made up the time with
  // real overtime that month shouldn't hit the cap the same as someone who
  // didn't.
  const { data: monthUpdates } = await adminCl
    .from('daily_updates')
    .select('date, work_entries')
    .eq('user_id', userId)
    .gte('date', monthStart)
    .lte('date', monthEnd)
  const overtimeByMonth = overtimeHoursByMonth((monthUpdates ?? []) as { date: string; work_entries: { task_type?: string | null; start_time?: string | null; duration_hours?: number | string | null }[] | null }[])

  // Combined into ONE sumLeaveDays call, not summed separately then added — the
  // permission-hours conversion isn't linear (3h alone + 2h alone both round to
  // 0 days, but 5h combined crosses the 4.75h threshold = 0.5 days), so existing
  // rows and this new request must accumulate together before the one conversion.
  const newRow = { leave_type: leaveType, from_date: fromDate, to_date: toDate, permission_hours: permissionHours ?? null }
  const combinedDays = sumLeaveDays([...((monthLeaves ?? []) as { leave_type: string | null; from_date: string; to_date: string; permission_hours: number | string | null }[]), newRow], monthStart, monthEnd, overtimeByMonth)
  if (combinedDays > 5) return 'Monthly leave limit reached (5/5). Apply as Exceptional Leave if urgent.'
  return null
}

// Permission has a hard 1h–4h window (confirmed 2026-07-29): under 1h isn't worth a
// separate absence record, and over 4h needs the same Exceptional/admin-approval path
// as hitting the monthly Full Day/Half Day cap — previously nothing enforced either
// bound server-side (only a dismissible >4h client popup existed, easily bypassed).
const PERMISSION_MIN_MINS = 60
const PERMISSION_MAX_MINS = 240
function permissionHoursCapError(leaveType: string, permissionTime?: string, permissionEndTime?: string): string | null {
  if (leaveType !== 'permission' || !permissionTime || !permissionEndTime) return null
  const [fh, fm] = permissionTime.split(':').map(Number)
  const [th, tm] = permissionEndTime.split(':').map(Number)
  const diffMins = (th * 60 + tm) - (fh * 60 + fm)
  if (diffMins < PERMISSION_MIN_MINS) return 'Permission must be at least 1 hour.'
  if (diffMins > PERMISSION_MAX_MINS) return 'Permission cannot exceed 4 hours. Please apply as Half Day Leave instead.'
  return null
}

export async function submitLeaveRequest(
  _prev: { error: string } | { success: true } | null,
  formData: FormData
): Promise<{ error: string } | { success: true }> {
  const leaveType = (formData.get('leave_type') as string) || 'full_day'

  const raw = {
    leave_type:          leaveType,
    from_date:           formData.get('from_date') as string,
    to_date:             (leaveType === 'full_day' || leaveType === 'wfh') ? (formData.get('to_date') as string) : (formData.get('from_date') as string),
    half_day_period:     formData.get('half_day_period') || undefined,
    half_day_from_time:  (formData.get('half_day_from_time') as string) || undefined,
    half_day_to_time:    (formData.get('half_day_to_time') as string) || undefined,
    permission_hours:    formData.get('permission_hours') ? Number(formData.get('permission_hours')) : undefined,
    permission_time:     (formData.get('permission_time') as string) || undefined,
    permission_end_time: (formData.get('permission_end_time') as string) || undefined,
    permission_reason_type: (formData.get('permission_reason_type') as string) || undefined,
    reason:              formData.get('reason') as string,
  }

  const parsed = leaveSchema.safeParse(raw)
  if (!parsed.success) {
    return { error: parsed.error.issues[0].message }
  }

  const todayIST = new Date().toLocaleString('en-CA', { timeZone: 'Asia/Kolkata' }).split(',')[0]
  if (parsed.data.from_date < todayIST) {
    return { error: 'Cannot apply leave for past dates. You can apply for today or future dates only.' }
  }

  const supabase = await createServerClient()
  const { data: { session } } = await supabase.auth.getSession()
  if (!session) return { error: 'Not authenticated' }

  const adminCl = createAdminClient()

  // Resolve effective user — admin impersonation support
  let effectiveUserId = session.user.id
  const { data: selfProfile } = await adminCl.from('users').select('role, company_id').eq('id', session.user.id).single()
  if (selfProfile?.role === 'ADMIN') {
    const impersonateId = (await cookies()).get('gf_impersonate')?.value
    if (impersonateId && impersonateId !== session.user.id) {
      const { data: target } = await adminCl.from('users').select('company_id').eq('id', impersonateId).single()
      if (target?.company_id && target.company_id === selfProfile.company_id) {
        effectiveUserId = impersonateId
      }
    }
  }

  let company_id = selfProfile?.role === 'ADMIN' && effectiveUserId !== session.user.id
    ? (await adminCl.from('users').select('company_id').eq('id', effectiveUserId).single()).data?.company_id ?? null
    : parseCompanyId(session.access_token)
  if (!company_id) {
    const { data: u } = await adminCl.from('users').select('company_id').eq('id', effectiveUserId).single()
    company_id = u?.company_id ?? null
  }
  if (!company_id) return { error: 'Could not resolve company. Please sign out and sign in again.' }

  const { data: profile } = await adminCl
    .from('users')
    .select('name, employee_id')
    .eq('id', effectiveUserId)
    .single()

  // Permission over 4 hours is a hard block, always — not even Exceptional bypasses
  // this. There's no such thing as an "exceptional 5-hour permission"; anything that
  // long has to go through Half Day Leave instead (which has its own, separate
  // Exceptional path if the monthly cap is the actual blocker).
  const permCapError = permissionHoursCapError(parsed.data.leave_type, parsed.data.permission_time, parsed.data.permission_end_time)
  if (permCapError) return { error: permCapError }

  // Monthly limit check — Full Day, Half Day, AND cumulative Permission hours
  // (converted to day-equivalents) all count toward this cap now. Counts THIS
  // request's own days on top of what's already on file — not just whether the
  // existing total alone has already hit the cap.
  const isExceptional = formData.get('is_exceptional') === 'true'
  if (!isExceptional) {
    const limitError = await checkMonthlyLeaveLimit(
      adminCl, effectiveUserId, parsed.data.leave_type, parsed.data.from_date, parsed.data.to_date,
      undefined, parsed.data.permission_hours
    )
    if (limitError) return { error: limitError }
  }

  const { data: overlapping } = await adminCl
    .from('leaves')
    .select('id, leave_type, half_day_from_time, half_day_to_time, permission_time, permission_end_time')
    .eq('user_id', effectiveUserId)
    .lte('from_date', parsed.data.to_date)
    .gte('to_date', parsed.data.from_date)
    .not('status', 'eq', 'rejected')

  // Exceptional bypasses this too — e.g. someone who already has a Shoot Day logged
  // but genuinely needs a Half Day leave on the same date (came in late, missed the
  // morning) has no other way through; admin reviews and decides either way.
  if (overlapping && overlapping.length > 0 && !isExceptional) {
    const newWindow = getLeaveTimeWindow({
      leave_type: parsed.data.leave_type,
      half_day_from_time: parsed.data.half_day_from_time,
      half_day_to_time: parsed.data.half_day_to_time,
      permission_time: parsed.data.permission_time,
      permission_end_time: parsed.data.permission_end_time,
    })
    const blocking = overlapping.filter(l => {
      const conflict = typesConflict(parsed.data.leave_type as LeaveKind, (l.leave_type ?? 'full_day') as LeaveKind)
      if (conflict === 'never') return false
      if (conflict === 'always') return true
      const existingWindow = getLeaveTimeWindow(l as LeaveTimeFields)
      if (!newWindow || !existingWindow) return true // missing a time somehow — be safe, block
      return timeRangesOverlap(newWindow, existingWindow)
    })
    if (blocking.length > 0) {
      // WFH is a work arrangement, not an absence — point to the actual fix
      // (withdraw that WFH date first) instead of a dead-end message. Only
      // reachable now via Full Day (the only type that blocks WFH at all).
      if (blocking.every(l => l.leave_type === 'wfh')) {
        return { error: 'That date is part of an approved WFH request. Withdraw WFH for that date on the Leaves page, then re-apply.' }
      }
      return { error: (parsed.data.leave_type === 'permission' || parsed.data.leave_type === 'half_day')
        ? 'That time overlaps with an existing leave request on that date.'
        : 'You already have a leave request for those dates.' }
    }
  }

  const { data: inserted, error: insertError } = await (adminCl.from('leaves') as any).insert({
    company_id,
    user_id:             effectiveUserId,
    from_date:           parsed.data.from_date,
    to_date:             parsed.data.to_date,
    reason:              isExceptional ? `[EXCEPTIONAL] ${parsed.data.reason}` : parsed.data.reason,
    leave_type:          parsed.data.leave_type,
    permission_hours:    parsed.data.permission_hours ?? null,
    permission_time:     parsed.data.permission_time ?? null,
    permission_end_time: parsed.data.permission_end_time ?? null,
    permission_reason_type: parsed.data.permission_reason_type ?? null,
    half_day_period:     (parsed.data.half_day_period ?? null),
    half_day_from_time:  parsed.data.half_day_from_time ?? null,
    half_day_to_time:    parsed.data.half_day_to_time ?? null,
  }).select('id').single()

  if (insertError) return { error: insertError.message }

  // Route to the matching WhatsApp template per request type
  const submitEvent = parsed.data.leave_type === 'wfh'
    ? 'wfh.submitted' as const
    : parsed.data.leave_type === 'shoot_day'
    ? 'shoot.submitted' as const
    : 'leave.submitted' as const

  if (profile && inserted?.id) {
    const adminClient = createAdminClient()
    const { data: adminUsers } = await adminClient
      .from('users')
      .select('id, phone')
      .eq('company_id', company_id)
      .eq('role', 'ADMIN')

    // SMS to first admin
    const adminWithPhone = adminUsers?.find(a => a.phone)
    if (adminWithPhone?.phone) {
      sendNotification({
        event:         submitEvent,
        leave_id:      inserted.id,
        employee_name: profile.name,
        employee_id:   profile.employee_id,
        from_date:     parsed.data.from_date,
        to_date:       parsed.data.to_date,
        reason:        parsed.data.reason,
        admin_phone:   adminWithPhone.phone,
      }).catch(console.error)
    }

    // Bell notification to all admins
    if (adminUsers?.length) {
      const leaveLabel = parsed.data.leave_type === 'full_day'
        ? `${parsed.data.from_date} → ${parsed.data.to_date}`
        : parsed.data.leave_type === 'half_day' ? `Half-day on ${parsed.data.from_date}`
        : parsed.data.leave_type === 'wfh' ? `WFH on ${parsed.data.from_date}`
        : parsed.data.leave_type === 'shoot_day' ? `Shoot Day on ${parsed.data.from_date}`
        : `Permission on ${parsed.data.from_date}`
      const requestNoun = parsed.data.leave_type === 'wfh' ? 'requested Work From Home'
        : parsed.data.leave_type === 'shoot_day' ? 'requested a Shoot Day'
        : 'applied for leave'
      await insertManyNotifications(adminUsers.map(a => ({
        companyId: company_id,
        userId: a.id,
        type: 'leave_submitted',
        title: `${profile.name} ${requestNoun}`,
        body: leaveLabel,
        link: '/admin/leaves',
      })))
    }
  }

  revalidatePath('/member/leaves')
  revalidatePath('/member/dashboard')
  revalidatePath('/admin/leaves')
  return { success: true }
}

// Submits a Half Day (exactly HALF_DAY_THRESHOLD_HOURS) + Permission (1h-4h) as ONE
// combined request that lands as two separate `leaves` rows — the guided version of
// what used to require an employee to know the exact split themselves and submit it
// as two unrelated requests (real gap: every historical case of this was entered
// wrong — 3h to 6h "half days" instead of the fixed 4h45m — because nothing walked
// anyone through it). The two portions must be back-to-back with no gap and no
// overlap; the client computes that split, this just re-validates it never trusts
// the client's arithmetic for the actual leave-balance-affecting write.
export async function submitSplitLeaveRequest(
  _prev: { error: string } | { success: true } | null,
  formData: FormData
): Promise<{ error: string } | { success: true }> {
  const from_date           = formData.get('from_date') as string
  const half_day_from_time  = formData.get('half_day_from_time') as string
  const half_day_to_time    = formData.get('half_day_to_time') as string
  const permission_time     = formData.get('permission_time') as string
  const permission_end_time = formData.get('permission_end_time') as string
  const reason              = formData.get('reason') as string
  const isExceptional       = formData.get('is_exceptional') === 'true'

  if (!from_date) return { error: 'Date required' }
  if (!half_day_from_time || !half_day_to_time) return { error: 'Half day time is required' }
  if (!permission_time || !permission_end_time) return { error: 'Permission time is required' }
  if (!reason || reason.trim().length < 3) return { error: 'Please provide a reason' }

  let halfMins = timeToMinutes(half_day_to_time) - timeToMinutes(half_day_from_time)
  if (halfMins <= 0) halfMins += 1440
  const requiredHalfMins = HALF_DAY_THRESHOLD_HOURS * 60
  if (halfMins !== requiredHalfMins) {
    return { error: `Half day portion must be exactly ${HALF_DAY_THRESHOLD_HOURS}h (this is ${(halfMins / 60).toFixed(1)}h)` }
  }
  const permCapError = permissionHoursCapError('permission', permission_time, permission_end_time)
  if (permCapError) return { error: permCapError }
  const permMins = timeToMinutes(permission_end_time) - timeToMinutes(permission_time)
  const permHours = Math.round((permMins / 60) * 10) / 10

  // The two portions must touch with zero gap and zero overlap — either order.
  const touching = permission_end_time === half_day_from_time || half_day_to_time === permission_time
  if (!touching) return { error: 'Half Day and Permission portions must be back-to-back with no gap.' }

  const todayIST = new Date().toLocaleString('en-CA', { timeZone: 'Asia/Kolkata' }).split(',')[0]
  if (from_date < todayIST) return { error: 'Cannot apply leave for past dates. You can apply for today or future dates only.' }

  const supabase = await createServerClient()
  const { data: { session } } = await supabase.auth.getSession()
  if (!session) return { error: 'Not authenticated' }

  const adminCl = createAdminClient()
  let effectiveUserId = session.user.id
  const { data: selfProfile } = await adminCl.from('users').select('role, company_id').eq('id', session.user.id).single()
  if (selfProfile?.role === 'ADMIN') {
    const impersonateId = (await cookies()).get('gf_impersonate')?.value
    if (impersonateId && impersonateId !== session.user.id) {
      const { data: target } = await adminCl.from('users').select('company_id').eq('id', impersonateId).single()
      if (target?.company_id && target.company_id === selfProfile.company_id) effectiveUserId = impersonateId
    }
  }
  let company_id = selfProfile?.role === 'ADMIN' && effectiveUserId !== session.user.id
    ? (await adminCl.from('users').select('company_id').eq('id', effectiveUserId).single()).data?.company_id ?? null
    : parseCompanyId(session.access_token)
  if (!company_id) {
    const { data: u } = await adminCl.from('users').select('company_id').eq('id', effectiveUserId).single()
    company_id = u?.company_id ?? null
  }
  if (!company_id) return { error: 'Could not resolve company. Please sign out and sign in again.' }

  const { data: profile } = await adminCl.from('users').select('name, employee_id').eq('id', effectiveUserId).single()

  // Monthly-cap check — only the Half Day's 0.5 day counts toward the block;
  // the Permission portion never blocks submission (same rule as everywhere
  // else — see checkMonthlyLeaveLimit, 2026-07-31 fix). Prior real Permission
  // hours already logged this month still count via monthLeaves below, since
  // those already-accumulated hours genuinely consumed leave balance — only
  // THIS request's own permission portion is exempt from tipping it over.
  if (!isExceptional) {
    const currentMonth = from_date.slice(0, 7)
    const monthStart = `${currentMonth}-01`
    const monthEnd = `${currentMonth}-31`
    const { data: monthLeaves } = await adminCl
      .from('leaves')
      .select('from_date, to_date, leave_type, permission_hours')
      .eq('user_id', effectiveUserId)
      .gte('from_date', monthStart)
      .lte('from_date', monthEnd)
      .in('status', ['approved', 'pending'])
    const { data: monthUpdates } = await adminCl
      .from('daily_updates')
      .select('date, work_entries')
      .eq('user_id', effectiveUserId)
      .gte('date', monthStart)
      .lte('date', monthEnd)
    const overtimeByMonth = overtimeHoursByMonth((monthUpdates ?? []) as { date: string; work_entries: { task_type?: string | null; start_time?: string | null; duration_hours?: number | string | null }[] | null }[])
    const combinedDays = sumLeaveDays([
      ...((monthLeaves ?? []) as { leave_type: string | null; from_date: string; to_date: string; permission_hours: number | string | null }[]),
      { leave_type: 'half_day', from_date, to_date: from_date, permission_hours: null },
    ], monthStart, monthEnd, overtimeByMonth)
    if (combinedDays > 5) return { error: 'Monthly leave limit reached (5/5). Apply as Exceptional Leave if urgent.' }
  }

  // Overlap check against OTHER existing leaves that date — not against each other
  // (they're deliberately adjacent, which timeRangesOverlap already treats as non-
  // overlapping at a shared boundary).
  const { data: overlapping } = await adminCl
    .from('leaves')
    .select('id, leave_type, half_day_from_time, half_day_to_time, permission_time, permission_end_time')
    .eq('user_id', effectiveUserId)
    .lte('from_date', from_date)
    .gte('to_date', from_date)
    .not('status', 'eq', 'rejected')

  if (overlapping && overlapping.length > 0 && !isExceptional) {
    const windows: [string, string][] = [[half_day_from_time, half_day_to_time], [permission_time, permission_end_time]]
    const blocking = overlapping.filter(l => {
      const halfConflict = typesConflict('half_day', (l.leave_type ?? 'full_day') as LeaveKind)
      const permConflict  = typesConflict('permission', (l.leave_type ?? 'full_day') as LeaveKind)
      const existingWindow = getLeaveTimeWindow(l as LeaveTimeFields)
      return windows.some((w, i) => {
        const conflict = i === 0 ? halfConflict : permConflict
        if (conflict === 'never') return false
        if (conflict === 'always') return true
        if (!existingWindow) return true
        return timeRangesOverlap(w, existingWindow)
      })
    })
    if (blocking.length > 0) {
      if (blocking.every(l => l.leave_type === 'wfh')) {
        return { error: 'That date is part of an approved WFH request. Withdraw WFH for that date on the Leaves page, then re-apply.' }
      }
      return { error: 'That time overlaps with an existing leave request on that date.' }
    }
  }

  const finalReason = isExceptional ? `[EXCEPTIONAL] ${reason}` : reason
  const { data: insertedHalf, error: halfError } = await (adminCl.from('leaves') as any).insert({
    company_id, user_id: effectiveUserId, from_date, to_date: from_date, reason: finalReason,
    leave_type: 'half_day', half_day_from_time, half_day_to_time,
  }).select('id').single()
  if (halfError) return { error: halfError.message }

  const { error: permError } = await (adminCl.from('leaves') as any).insert({
    company_id, user_id: effectiveUserId, from_date, to_date: from_date, reason: finalReason,
    leave_type: 'permission', permission_time, permission_end_time, permission_hours: permHours,
  })
  if (permError) return { error: permError.message }

  if (profile) {
    const { data: adminUsers } = await adminCl.from('users').select('id, phone').eq('company_id', company_id).eq('role', 'ADMIN')
    const adminWithPhone = adminUsers?.find(a => a.phone)
    if (adminWithPhone?.phone) {
      sendNotification({
        event: 'leave.submitted', leave_id: insertedHalf?.id ?? '', employee_name: profile.name, employee_id: profile.employee_id,
        from_date, to_date: from_date, reason, admin_phone: adminWithPhone.phone,
      }).catch(console.error)
    }
    if (adminUsers?.length) {
      await insertManyNotifications(adminUsers.map(a => ({
        companyId: company_id!, userId: a.id, type: 'leave_submitted',
        title: `${profile.name} applied for leave`,
        body: `Half Day + Permission on ${from_date}`,
        link: '/admin/leaves',
      })))
    }
  }

  revalidatePath('/member/leaves')
  revalidatePath('/member/dashboard')
  revalidatePath('/admin/leaves')
  return { success: true }
}

export async function deleteLeaveRequest(
  leaveId: string
): Promise<{ success: boolean; error?: string }> {
  const supabase = await createServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { success: false, error: 'Not authenticated' }

  const { data: leave } = await supabase
    .from('leaves')
    .select('user_id, status, leave_type, from_date, to_date, company_id')
    .eq('id', leaveId)
    .single()

  if (!leave) return { success: false, error: 'Leave not found' }
  if (leave.user_id !== user.id) return { success: false, error: 'Not authorized' }

  // Delete the leave record
  const { error } = await supabase.from('leaves').delete().eq('id', leaveId)
  if (error) return { success: false, error: error.message }

  // If it was approved, also clean up attendance_logs and daily_updates
  if (leave.status === 'approved') {
    const admin = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!,
      { auth: { autoRefreshToken: false, persistSession: false } }
    )
    // Build all dates in the leave range
    const dates: string[] = []
    const cur = new Date(leave.from_date + 'T12:00:00')
    const end = new Date(leave.to_date   + 'T12:00:00')
    while (cur <= end) { dates.push(cur.toISOString().split('T')[0]); cur.setDate(cur.getDate() + 1) }

    for (const date of dates) {
      // Remove absent attendance_log (no clock_in) inserted when leave was approved
      await admin.from('attendance_logs')
        .delete()
        .eq('user_id', leave.user_id)
        .eq('company_id', leave.company_id)
        .eq('date', date)
        .is('clock_in', null)

      // Remove daily_updates row if it was the auto-inserted leave entry (attendance_status = absent)
      const { data: du } = await admin.from('daily_updates')
        .select('id, work_entries')
        .eq('user_id', leave.user_id)
        .eq('company_id', leave.company_id)
        .eq('date', date)
        .single()

      if (du) {
        const entries: { title?: string }[] = Array.isArray(du.work_entries) ? du.work_entries : []
        const leaveEntryIdx = entries.findIndex(e =>
          e.title?.includes('Full Day Leave') ||
          e.title?.includes('Permission') ||
          e.title?.includes('Half Day Leave')
        )
        if (leaveEntryIdx !== -1) {
          const remaining = entries.filter((_, i) => i !== leaveEntryIdx)
          if (remaining.length === 0) {
            await admin.from('daily_updates').delete().eq('id', du.id)
          } else {
            await admin.from('daily_updates').update({ work_entries: remaining }).eq('id', du.id)
          }
        }
      }
    }
  }

  revalidatePath('/member/leaves')
  revalidatePath('/member/dashboard')
  revalidatePath('/admin/leaves')
  revalidatePath('/member/history')
  return { success: true }
}

export async function updateLeaveRequest(
  leaveId: string,
  formData: FormData
): Promise<{ error: string } | { success: true }> {
  const leaveType = (formData.get('leave_type') as string) || 'full_day'

  const raw = {
    leave_type:          leaveType,
    from_date:           formData.get('from_date') as string,
    to_date:             (leaveType === 'full_day' || leaveType === 'wfh') ? (formData.get('to_date') as string) : (formData.get('from_date') as string),
    half_day_period:     formData.get('half_day_period') || undefined,
    half_day_from_time:  (formData.get('half_day_from_time') as string) || undefined,
    half_day_to_time:    (formData.get('half_day_to_time') as string) || undefined,
    permission_hours:    formData.get('permission_hours') ? Number(formData.get('permission_hours')) : undefined,
    permission_time:     (formData.get('permission_time') as string) || undefined,
    permission_end_time: (formData.get('permission_end_time') as string) || undefined,
    permission_reason_type: (formData.get('permission_reason_type') as string) || undefined,
    reason:              formData.get('reason') as string,
  }

  const parsed = leaveSchema.safeParse(raw)
  if (!parsed.success) return { error: parsed.error.issues[0].message }

  const todayIST = new Date().toLocaleString('en-CA', { timeZone: 'Asia/Kolkata' }).split(',')[0]
  if (parsed.data.from_date < todayIST) {
    return { error: 'Cannot apply leave for past dates. You can apply for today or future dates only.' }
  }

  const supabase = await createServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'Not authenticated' }

  // Verify ownership and pending status
  const { data: existing } = await supabase
    .from('leaves')
    .select('user_id, status')
    .eq('id', leaveId)
    .single()

  if (!existing) return { error: 'Leave request not found' }
  if (existing.user_id !== user.id) return { error: 'Not authorized' }
  if (existing.status !== 'pending') return { error: 'Can only edit pending requests' }

  // Same hard cap as a fresh submission — always, no Exceptional bypass.
  const permCapError = permissionHoursCapError(parsed.data.leave_type, parsed.data.permission_time, parsed.data.permission_end_time)
  if (permCapError) return { error: permCapError }

  // Same monthly cap AND same collision rules as a fresh submission — otherwise
  // editing a still-pending request (e.g. stretching a 1-day request to 3 days,
  // or changing its time to now overlap something) is a silent backdoor around
  // checks a brand-new submission would have been blocked by.
  const isExceptional = formData.get('is_exceptional') === 'true'
  const adminCl = createAdminClient()
  if (!isExceptional) {
    const limitError = await checkMonthlyLeaveLimit(
      adminCl, user.id, parsed.data.leave_type, parsed.data.from_date, parsed.data.to_date, leaveId, parsed.data.permission_hours
    )
    if (limitError) return { error: limitError }

    const { data: overlapping } = await adminCl
      .from('leaves')
      .select('id, leave_type, half_day_from_time, half_day_to_time, permission_time, permission_end_time')
      .eq('user_id', user.id)
      .lte('from_date', parsed.data.to_date)
      .gte('to_date', parsed.data.from_date)
      .not('status', 'eq', 'rejected')
      .neq('id', leaveId)

    if (overlapping && overlapping.length > 0) {
      const newWindow = getLeaveTimeWindow({
        leave_type: parsed.data.leave_type,
        half_day_from_time: parsed.data.half_day_from_time,
        half_day_to_time: parsed.data.half_day_to_time,
        permission_time: parsed.data.permission_time,
        permission_end_time: parsed.data.permission_end_time,
      })
      const blocking = overlapping.filter(l => {
        const conflict = typesConflict(parsed.data.leave_type as LeaveKind, (l.leave_type ?? 'full_day') as LeaveKind)
        if (conflict === 'never') return false
        if (conflict === 'always') return true
        const existingWindow = getLeaveTimeWindow(l as LeaveTimeFields)
        if (!newWindow || !existingWindow) return true
        return timeRangesOverlap(newWindow, existingWindow)
      })
      if (blocking.length > 0) {
        return { error: (parsed.data.leave_type === 'permission' || parsed.data.leave_type === 'half_day')
          ? 'That time overlaps with an existing leave request on that date.'
          : 'You already have a leave request for those dates.' }
      }
    }
  }

  const { error } = await (supabase.from('leaves') as any)
    .update({
      from_date:           parsed.data.from_date,
      to_date:             parsed.data.to_date,
      reason:              parsed.data.reason,
      leave_type:          parsed.data.leave_type,
      permission_hours:    parsed.data.permission_hours ?? null,
      permission_time:     parsed.data.permission_time ?? null,
      permission_end_time: parsed.data.permission_end_time ?? null,
      permission_reason_type: parsed.data.permission_reason_type ?? null,
      half_day_period:     parsed.data.half_day_period ?? null,
      half_day_from_time:  parsed.data.half_day_from_time ?? null,
      half_day_to_time:    parsed.data.half_day_to_time ?? null,
    })
    .eq('id', leaveId)

  if (error) return { error: error.message }

  revalidatePath('/member/leaves')
  revalidatePath('/admin/leaves')
  return { success: true }
}

// Frees up a single day inside an approved WFH request (e.g. to apply a real
// Leave instead for that one day) while keeping the rest of the range as WFH.
// Handles all three positions: the first day (shrink front), the last day
// (shrink tail), or a day in the middle (split into two WFH requests around it).
// WFH has no attendance_logs/daily_updates side effects for pre-planned
// multi-day requests (only same-day auto-clock-in does, handled elsewhere),
// so adjusting dates here is safe with no extra cleanup needed.
export async function withdrawWfhForDate(
  leaveId: string,
  targetDate: string
): Promise<{ success: boolean; error?: string }> {
  const supabase = await createServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { success: false, error: 'Not authenticated' }

  const { data: leaveRaw } = await supabase
    .from('leaves')
    .select('user_id, status, leave_type, from_date, to_date, company_id, reason')
    .eq('id', leaveId)
    .single()
  const leave = leaveRaw as {
    user_id: string; status: string; leave_type: string | null
    from_date: string; to_date: string; company_id: string; reason: string | null
  } | null

  if (!leave) return { success: false, error: 'Leave not found' }
  if (leave.user_id !== user.id) return { success: false, error: 'Not authorized' }
  if (leave.leave_type !== 'wfh') return { success: false, error: 'This action is only for Work From Home requests' }
  if (leave.status !== 'approved') return { success: false, error: 'Only approved requests can be withdrawn' }
  if (targetDate < leave.from_date || targetDate > leave.to_date) return { success: false, error: 'Chosen date is outside the WFH range' }

  // Single-day WFH — nothing left to keep, remove the whole request
  if (leave.from_date === leave.to_date) {
    return deleteLeaveRequest(leaveId)
  }

  const shiftDay = (d: string, delta: number) => {
    const x = new Date(d + 'T12:00:00')
    x.setDate(x.getDate() + delta)
    return x.toISOString().split('T')[0]
  }

  if (targetDate === leave.from_date) {
    // First day — shrink the front, keep (targetDate+1 .. to_date)
    const { error } = await (supabase.from('leaves') as any)
      .update({ from_date: shiftDay(targetDate, 1) })
      .eq('id', leaveId)
    if (error) return { success: false, error: error.message }

  } else if (targetDate === leave.to_date) {
    // Last day — shrink the tail, keep (from_date .. targetDate-1)
    const { error } = await (supabase.from('leaves') as any)
      .update({ to_date: shiftDay(targetDate, -1) })
      .eq('id', leaveId)
    if (error) return { success: false, error: error.message }

  } else {
    // Middle day — split into two WFH requests around it
    const { error: updErr } = await (supabase.from('leaves') as any)
      .update({ to_date: shiftDay(targetDate, -1) })
      .eq('id', leaveId)
    if (updErr) return { success: false, error: updErr.message }

    const { error: insErr } = await (supabase.from('leaves') as any).insert({
      company_id: leave.company_id,
      user_id:    leave.user_id,
      leave_type: 'wfh',
      status:     'approved',
      from_date:  shiftDay(targetDate, 1),
      to_date:    leave.to_date,
      reason:     leave.reason,
    })
    if (insErr) return { success: false, error: insErr.message }
  }

  revalidatePath('/member/leaves')
  revalidatePath('/member/dashboard')
  revalidatePath('/admin/leaves')
  return { success: true }
}

async function autoInsertLeaveHistory(
  admin: ReturnType<typeof createAdminClient>,
  leave: {
    company_id: string
    user_id: string
    from_date: string
    to_date: string
    leave_type: string | null
    reason: string | null
    permission_time: string | null
    permission_end_time: string | null
    permission_hours: number | null
    half_day_from_time: string | null
    half_day_to_time: string | null
    half_day_period: string | null
  }
) {
  const type = leave.leave_type ?? 'full_day'

  if (type === 'permission') {
    // Insert break entry with exact times on the leave date
    const startTime = leave.permission_time ?? null
    if (!startTime) return

    // Use explicit end time if stored, otherwise fall back to start + hours
    let endTime = leave.permission_end_time ?? null
    if (!endTime && leave.permission_hours) {
      const [fh, fm] = startTime.split(':').map(Number)
      const totalMins = fh * 60 + fm + Math.round((leave.permission_hours) * 60)
      endTime = `${String(Math.floor(totalMins / 60)).padStart(2, '0')}:${String(totalMins % 60).padStart(2, '0')}`
    }
    if (!endTime) return

    const [fh, fm] = startTime.split(':').map(Number)
    const [th, tm] = endTime.split(':').map(Number)
    const diffMins = (th * 60 + tm) - (fh * 60 + fm)
    if (diffMins <= 0) return

    const entry = {
      task_type: 'break',
      title: 'Permission Leave',
      client_name: leave.reason ?? 'Permission',
      duration_hours: Math.round((diffMins / 60) * 10) / 10,
      notes: leave.reason ?? '',
      start_time: startTime,
      end_time: endTime,
      _is_leave: true,
    }
    await upsertWorkEntry(admin, leave.company_id, leave.user_id, leave.from_date, entry)

  } else if (type === 'half_day') {
    const startTime = leave.half_day_from_time ?? null
    const endTime   = leave.half_day_to_time ?? null
    if (!startTime || !endTime) return

    const [fh, fm] = startTime.split(':').map(Number)
    const [th, tm] = endTime.split(':').map(Number)
    const diffMins = (th * 60 + tm) - (fh * 60 + fm)
    if (diffMins <= 0) return

    const entry = {
      task_type: 'break',
      title: 'Half Day Leave',
      client_name: leave.reason ?? 'Half Day',
      duration_hours: Math.round((diffMins / 60) * 10) / 10,
      notes: leave.reason ?? '',
      start_time: startTime,
      end_time: endTime,
      _is_leave: true,
    }
    await upsertWorkEntry(admin, leave.company_id, leave.user_id, leave.from_date, entry)

  } else if (type === 'full_day') {
    // Insert one on_leave record per day in the range
    const start = new Date(leave.from_date)
    const end   = new Date(leave.to_date)
    const dates: string[] = []
    for (const d = new Date(start); d <= end; d.setDate(d.getDate() + 1)) {
      dates.push(d.toISOString().split('T')[0])
    }
    for (const date of dates) {
      const entry = {
        task_type: 'break',
        title: '🌴 Full Day Leave',
        client_name: leave.reason ?? 'Approved Leave',
        duration_hours: 0,
        notes: leave.reason ?? '',
        start_time: null,
        end_time: null,
      }
      await upsertWorkEntry(admin, leave.company_id, leave.user_id, date, entry, 'absent')
    }
  }
}

async function upsertWorkEntry(
  admin: ReturnType<typeof createAdminClient>,
  companyId: string,
  userId: string,
  date: string,
  entry: Record<string, unknown>,
  attendanceStatus = 'present'
) {
  const { data: existing } = await admin
    .from('daily_updates')
    .select('id, work_entries')
    .eq('company_id', companyId)
    .eq('user_id', userId)
    .eq('date', date)
    .maybeSingle()

  if (existing) {
    const currentEntries = Array.isArray(existing.work_entries) ? existing.work_entries : []
    await admin
      .from('daily_updates')
      .update({ work_entries: [...currentEntries, entry] })
      .eq('id', existing.id)
  } else {
    await admin.from('daily_updates').insert({
      company_id: companyId,
      user_id: userId,
      date,
      attendance_status: attendanceStatus,
      work_type: 'office',
      work_entries: [entry],
    })
  }
}

export async function updateLeaveStatus(
  leaveId: string,
  status: 'approved' | 'rejected'
): Promise<{ success: boolean; error?: string }> {
  // Verify caller is authenticated + is ADMIN
  const supabase = await createServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { success: false, error: 'Not authenticated' }

  const { data: adminUser } = await supabase
    .from('users')
    .select('role')
    .eq('id', user.id)
    .single()
  if (adminUser?.role !== 'ADMIN') return { success: false, error: 'Admin only' }

  // Use service-role client so RLS doesn't block the update
  const admin = createAdminClient()

  type LeaveWithUser = {
    company_id: string
    user_id: string
    from_date: string
    to_date: string
    leave_type: string | null
    reason: string | null
    created_at: string
    permission_time: string | null
    permission_end_time: string | null
    permission_hours: number | null
    half_day_from_time: string | null
    half_day_to_time: string | null
    half_day_period: string | null
    users: { name: string; phone: string | null } | null
  }

  const { data: leaveRaw } = await admin
    .from('leaves')
    .select('company_id, user_id, from_date, to_date, leave_type, reason, created_at, permission_time, permission_end_time, permission_hours, half_day_from_time, half_day_to_time, half_day_period, users(name, phone)')
    .eq('id', leaveId)
    .single()

  const leave = leaveRaw as LeaveWithUser | null

  const { error } = await admin
    .from('leaves')
    .update({ status })
    .eq('id', leaveId)

  if (error) return { success: false, error: error.message }

  // Auto-update attendance when approved
  // Skip permission (still present), wfh and shoot_day (handled separately below)
  if (status === 'approved' && leave && leave.leave_type !== 'permission' && leave.leave_type !== 'wfh' && leave.leave_type !== 'shoot_day') {
    const curr = new Date(leave.from_date + 'T12:00:00')
    const end  = new Date(leave.to_date   + 'T12:00:00')
    while (curr <= end) {
      const dateStr = curr.toISOString().split('T')[0]
      const { data: existing } = await admin
        .from('attendance_logs')
        .select('id, status')
        .eq('company_id', leave.company_id)
        .eq('user_id', leave.user_id)
        .eq('date', dateStr)
        .maybeSingle()
      if (!existing) {
        const attStatus = leave.leave_type === 'half_day' ? 'half_day' : 'leave'
        const { error: attErr } = await admin.from('attendance_logs').insert({
          company_id: leave.company_id,
          user_id:    leave.user_id,
          date:       dateStr,
          status:     attStatus,
        })
        if (attErr) console.error('[leave approval] attendance insert:', attErr.message)
      } else if (leave.leave_type === 'full_day' && existing.status !== 'leave') {
        // A full-day leave always wins over a stray same-day clock-in (e.g. clocked in,
        // had an emergency, applied for leave right after — GF013/Rubashree incident:
        // her attendance row stayed status='present' with no Daily Update filed, and
        // the "Daily Update Missing" gate blocked her even though the leave for that
        // date was approved). half_day is intentionally left alone here — it only
        // excuses its own slot, the member still owes the rest of the day.
        const { error: attErr } = await admin.from('attendance_logs').update({
          status: 'leave', clock_in: null, clock_out: null, work_type: null,
          break_in: null, break_out: null, break_total_mins: 0, break_sessions: [],
          paused_seconds: 0, session_paused_at: null,
        }).eq('id', existing.id)
        if (attErr) console.error('[leave approval] attendance override:', attErr.message)
      }
      // For full_day leave: delete any empty daily_update row so the 🌴 leave card shows in history
      if (leave.leave_type === 'full_day') {
        const { data: du } = await admin
          .from('daily_updates')
          .select('id, work_entries')
          .eq('company_id', leave.company_id)
          .eq('user_id', leave.user_id)
          .eq('date', dateStr)
          .maybeSingle()
        if (du) {
          const entries = Array.isArray(du.work_entries) ? (du.work_entries as { task_type?: string }[]).filter(e => e.task_type !== 'break') : []
          if (entries.length === 0) {
            const { error: delErr } = await admin.from('daily_updates').delete().eq('id', du.id)
            if (delErr) console.error('[leave approval] daily_update cleanup:', delErr.message)
          }
        }
      }
      curr.setDate(curr.getDate() + 1)
    }

  // WFH/Shoot Day is work, not an absence, so an approval must always leave a real
  // attendance row behind — see lib/wfh-shoot-attendance.ts for why (GF010, 2026-08-25).
  // Same-day request  → clock in from the moment they applied, clock-out left open.
  // Day already past  → 9:30 AM–7:00 PM IST placeholder; there is no live session left
  //                     to open, and writing nothing hands them the "Contact Admin" gate.
  // Future day        → nothing; they clock in themselves on the day.
  } else if (status === 'approved' && leave && (leave.leave_type === 'wfh' || leave.leave_type === 'shoot_day')) {
    const todayIst = new Date().toLocaleString('en-CA', { timeZone: 'Asia/Kolkata' }).split(',')[0]
    const createdIst = new Date(leave.created_at).toLocaleString('en-CA', { timeZone: 'Asia/Kolkata' }).split(',')[0]
    const workType = leave.leave_type === 'shoot_day' ? 'shoot' : 'wfh'

    for (const plan of planWorkDayAttendance(leave.from_date, leave.to_date, createdIst, todayIst)) {
      // Always use the actual apply time — shoots and WFH can legitimately start at 6 AM, 7 AM, etc.
      const times = plan.mode === 'apply_time'
        ? { clock_in: leave.created_at }
        : {
            clock_in:  `${plan.date} ${PLACEHOLDER_CLOCK_IN_UTC}`,
            clock_out: `${plan.date} ${PLACEHOLDER_CLOCK_OUT_UTC}`,
          }

      const { data: existing } = await admin
        .from('attendance_logs')
        .select('id, clock_in')
        .eq('company_id', leave.company_id)
        .eq('user_id', leave.user_id)
        .eq('date', plan.date)
        .maybeSingle()

      if (!existing) {
        // No record yet — plain insert (avoids onConflict key mismatch issues)
        const { error: attErr } = await admin.from('attendance_logs').insert({
          company_id: leave.company_id,
          user_id:    leave.user_id,
          date:       plan.date,
          work_type:  workType,
          status:     'present',
          ...times,
        })
        if (attErr) console.error('[wfh/shoot approval] attendance insert:', attErr.message)
      } else if (!existing.clock_in) {
        // Record exists but no clock_in yet — fill it in. A row that already has a
        // clock_in is the member's own real session and is never overwritten.
        const { error: attErr } = await admin.from('attendance_logs').update({
          work_type: workType,
          status:    'present',
          ...times,
        }).eq('id', existing.id)
        if (attErr) console.error('[wfh/shoot approval] attendance update:', attErr.message)
      }
    }
    // Auto-insert history entry
    try {
      await autoInsertLeaveHistory(admin, leave)
    } catch (e) {
      console.error('Failed to auto-insert leave history:', e)
    }
  }

  if (leave && leave.users?.phone) {
    const leaveType = leave.leave_type ?? 'full_day'
    const approvedEvent = leaveType === 'wfh' ? 'wfh.approved' : leaveType === 'shoot_day' ? 'shoot.approved' : leaveType === 'half_day' ? 'half_day.approved' : 'leave.approved'
    const rejectedEvent = leaveType === 'wfh' ? 'wfh.rejected' : leaveType === 'shoot_day' ? 'shoot.rejected' : leaveType === 'half_day' ? 'half_day.rejected' : 'leave.rejected'
    sendNotification({
      event:          status === 'approved' ? approvedEvent : rejectedEvent,
      employee_name:  leave.users.name,
      employee_phone: leave.users.phone,
      from_date:      leave.from_date,
      to_date:        leave.to_date,
      status,
      detail:         formatLeaveDetail(leave),
    }).catch(console.error)
  }

  if (leave) {
    const leaveLabel = leave.leave_type === 'permission' ? 'Permission' : leave.leave_type === 'half_day' ? 'Half Day Leave' : leave.leave_type === 'wfh' ? 'Work From Home' : leave.leave_type === 'shoot_day' ? 'Shoot Day' : 'Full Day Leave'
    insertNotification({
      companyId: leave.company_id,
      userId: leave.user_id,
      type: 'leave_status',
      title: status === 'approved' ? `${leaveLabel} Approved` : `${leaveLabel} Rejected`,
      body: `Your ${leaveLabel.toLowerCase()} request has been ${status}.`,
      link: '/member/leaves',
    }).catch(console.error)
  }

  revalidatePath('/admin/leaves')
  revalidatePath('/member/leaves')
  revalidatePath('/member/dashboard')
  revalidatePath('/member/history')
  revalidatePath('/admin/activities')
  return { success: true }
}

// Admin applying leave/permission/WFH/shoot-day directly on a member's behalf — for a day
// that already happened and nobody applied for or logged in on, which otherwise permanently
// locks that member's account with no self-service way out (see attendance-gate.ts). The
// member-facing form (submitLeaveRequest) refuses any past date on purpose; this is the
// deliberate admin-only escape hatch, so it allows past dates and skips the pending step —
// applying it here IS the approval, there's no separate person to confirm it.
export async function adminApplyLeaveOnBehalf(input: {
  userId: string
  leaveType: 'full_day' | 'half_day' | 'permission' | 'wfh' | 'shoot_day'
  fromDate: string
  toDate: string
  reason: string
  halfDayPeriod?: string
  halfDayFromTime?: string
  halfDayToTime?: string
  permissionTime?: string
  permissionEndTime?: string
  permissionHours?: number
  permissionReasonType?: 'late_login' | 'early_logoff' | 'other'
}): Promise<{ success: boolean; error?: string }> {
  const supabase = await createServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { success: false, error: 'Not authenticated' }

  const admin = createAdminClient()
  const { data: adminUser } = await admin.from('users').select('role').eq('id', user.id).single()
  if (adminUser?.role !== 'ADMIN') return { success: false, error: 'Admin only' }

  const parsed = leaveSchema.safeParse({
    leave_type:          input.leaveType,
    from_date:            input.fromDate,
    to_date:              input.toDate,
    half_day_period:      input.halfDayPeriod,
    half_day_from_time:   input.halfDayFromTime,
    half_day_to_time:     input.halfDayToTime,
    permission_hours:     input.permissionHours,
    permission_time:      input.permissionTime,
    permission_end_time:  input.permissionEndTime,
    permission_reason_type: input.permissionReasonType,
    reason:               input.reason,
  })
  if (!parsed.success) return { success: false, error: parsed.error.issues[0].message }
  if (parsed.data.from_date > parsed.data.to_date) return { success: false, error: 'From date must be before To date' }

  const { data: target } = await admin.from('users').select('company_id, name').eq('id', input.userId).single()
  if (!target) return { success: false, error: 'Employee not found' }

  // Every calendar day in the range, inclusive
  const datesInRange: string[] = []
  {
    const cur = new Date(parsed.data.from_date + 'T12:00:00')
    const end = new Date(parsed.data.to_date   + 'T12:00:00')
    while (cur <= end) { datesInRange.push(cur.toISOString().split('T')[0]); cur.setDate(cur.getDate() + 1) }
  }

  // Safety check: refuse if the member already has real attendance/work that actually
  // overlaps the leave being applied — this exists to backfill a genuinely empty gap,
  // never to quietly overwrite something that actually happened. Full Day/WFH/Shoot Day
  // cover the entire day, so any presence at all that day is a conflict. Half Day and
  // Permission only cover part of the day by design (work half, leave half) — those only
  // conflict if the real attendance/work actually overlaps the specific time window
  // requested, not just because something was logged elsewhere that same day.
  const requestedWindow: [number, number] | null =
    parsed.data.leave_type === 'half_day' && parsed.data.half_day_from_time && parsed.data.half_day_to_time
      ? [timeToMinutes(parsed.data.half_day_from_time), timeToMinutes(parsed.data.half_day_to_time)]
      : parsed.data.leave_type === 'permission' && parsed.data.permission_time && parsed.data.permission_end_time
      ? [timeToMinutes(parsed.data.permission_time), timeToMinutes(parsed.data.permission_end_time)]
      : null

  const [{ data: attRows }, { data: updateRows }] = await Promise.all([
    admin.from('attendance_logs').select('date, clock_in, clock_out')
      .eq('company_id', target.company_id).eq('user_id', input.userId).in('date', datesInRange),
    admin.from('daily_updates').select('date, work_entries')
      .eq('company_id', target.company_id).eq('user_id', input.userId).in('date', datesInRange),
  ])

  let conflictDates: string[]
  if (!requestedWindow) {
    const loginDates = new Set(
      (attRows ?? []).filter(a => a.clock_in).map(a => a.date as string)
    )
    const workDates = new Set(
      (updateRows ?? []).filter(u => {
        const entries = Array.isArray(u.work_entries) ? u.work_entries as { task_type?: string; _is_leave?: boolean }[] : []
        return entries.some(e => e.task_type !== 'break' && !e._is_leave)
      }).map(u => u.date as string)
    )
    conflictDates = datesInRange.filter(d => loginDates.has(d) || workDates.has(d))
  } else {
    const [winStart, winEnd] = requestedWindow
    const attByDate = new Map((attRows ?? []).map(a => [a.date as string, a]))
    const workByDate = new Map((updateRows ?? []).map(u => [u.date as string, u]))
    conflictDates = datesInRange.filter(d => {
      const att = attByDate.get(d)
      if (att?.clock_in) {
        const start = timeToMinutes(toISTTimeString(att.clock_in as string))
        // No clock_out yet (still clocked in / forgot to clock out) — treat as open-ended
        // through end of day rather than guessing, so it stays conservative.
        const end = att.clock_out ? timeToMinutes(toISTTimeString(att.clock_out as string)) : 24 * 60
        if (rangesOverlap(start, end, winStart, winEnd)) return true
      }
      const upd = workByDate.get(d)
      const entries = Array.isArray(upd?.work_entries)
        ? upd!.work_entries as { task_type?: string; _is_leave?: boolean; start_time?: string; end_time?: string }[]
        : []
      return entries.some(e => {
        if (e.task_type === 'break' || e._is_leave) return false
        // Can't tell when it happened — stay conservative and treat it as a conflict.
        if (!e.start_time || !e.end_time) return true
        return rangesOverlap(timeToMinutes(e.start_time), timeToMinutes(e.end_time), winStart, winEnd)
      })
    })
  }
  if (conflictDates.length) {
    return { success: false, error: `${target.name} already has a login or work logged on ${conflictDates.join(', ')} — cannot apply leave over an existing day.` }
  }

  const { data: inserted, error: insertError } = await admin.from('leaves').insert({
    company_id:           target.company_id,
    user_id:              input.userId,
    from_date:            parsed.data.from_date,
    to_date:              parsed.data.to_date,
    reason:               parsed.data.reason,
    leave_type:           parsed.data.leave_type,
    permission_hours:     parsed.data.permission_hours ?? null,
    permission_time:      parsed.data.permission_time ?? null,
    permission_end_time:  parsed.data.permission_end_time ?? null,
    permission_reason_type: parsed.data.permission_reason_type ?? null,
    half_day_period:      parsed.data.half_day_period ?? null,
    half_day_from_time:   parsed.data.half_day_from_time ?? null,
    half_day_to_time:     parsed.data.half_day_to_time ?? null,
    status:               'pending',
  }).select('id').single()
  if (insertError || !inserted) return { success: false, error: insertError?.message ?? 'Failed to create leave' }

  // Reuses the exact same approval side effects (attendance placeholder, notifications,
  // WFH/shoot auto-clock-in) as a normal admin Approve click — this is what was missed
  // when a leave got inserted by hand straight into the table.
  const approveResult = await updateLeaveStatus(inserted.id, 'approved')
  if (!approveResult.success) return approveResult

  // updateLeaveStatus above already writes today's and every past day's attendance row
  // (see planWorkDayAttendance), so those days no-op out of the loop below on the
  // `existing.clock_in` guard. What it deliberately leaves alone is a FUTURE day — a
  // member is expected to clock in themselves when it arrives. An admin applying on a
  // member's behalf is different: they're recording an arrangement the member won't be
  // prompted about, so give those days the same plain present/9:30–7:00 placeholder.
  if (parsed.data.leave_type === 'wfh' || parsed.data.leave_type === 'shoot_day') {
    const workType = parsed.data.leave_type === 'shoot_day' ? 'shoot' : 'wfh'
    for (const d of datesInRange) {
      const { data: existing } = await admin.from('attendance_logs').select('id, clock_in')
        .eq('company_id', target.company_id).eq('user_id', input.userId).eq('date', d).maybeSingle()
      if (!existing) {
        await admin.from('attendance_logs').insert({
          company_id: target.company_id, user_id: input.userId, date: d,
          status: 'present', work_type: workType,
          clock_in:  `${d} 04:00:00+00`, // 9:30 AM IST
          clock_out: `${d} 13:30:00+00`, // 7:00 PM IST
        })
      } else if (!existing.clock_in) {
        await admin.from('attendance_logs').update({
          status: 'present', work_type: workType,
          clock_in:  `${d} 04:00:00+00`,
          clock_out: `${d} 13:30:00+00`,
        }).eq('id', existing.id)
      }
    }
  }

  revalidatePath('/admin/leaves')
  revalidatePath('/member/leaves')
  revalidatePath('/member/dashboard')
  revalidatePath('/member/history')
  return { success: true }
}

// Called directly from the attendance page when employee clicks WFH/Shoot button
export async function submitWfhAttendanceRequest(
  leaveType: 'wfh' | 'shoot_day',
  reason: string
): Promise<{ success: boolean; error?: string; created_at?: string }> {
  const supabase = await createServerClient()
  const { data: { session } } = await supabase.auth.getSession()
  if (!session) return { success: false, error: 'Not authenticated' }

  let company_id = parseCompanyId(session.access_token)
  if (!company_id) {
    const { data: u } = await supabase.from('users').select('company_id').eq('id', session.user.id).single()
    company_id = u?.company_id ?? null
  }
  if (!company_id) return { success: false, error: 'Could not resolve company' }

  const todayIst = new Date().toLocaleString('en-CA', { timeZone: 'Asia/Kolkata' }).split(',')[0]

  const { data: profile } = await supabase
    .from('users')
    .select('name, employee_id')
    .eq('id', session.user.id)
    .single()

  // Same type-conflict rules as submitLeaveRequest (see typesConflict): Full Day
  // blocks WFH/Shoot Day, an exact duplicate (WFH-vs-WFH or Shoot-vs-Shoot) blocks,
  // but Half Day/Permission never block WFH/Shoot Day — those are work
  // arrangements, not absences, so legitimate combos (half-day WFH then a shoot,
  // a Shoot Day with a personal Permission carved out) go through unblocked.
  // Previously this only checked for an existing wfh/shoot_day row, so someone
  // with an approved Full Day leave could still submit Shoot Day here with zero
  // collision check (real incident — confirmed via direct DB query).
  const { data: existingRows } = await (supabase.from('leaves') as any)
    .select('id, leave_type')
    .eq('user_id', session.user.id)
    .eq('from_date', todayIst)
    .not('status', 'eq', 'rejected')
  const existingBlocker = ((existingRows ?? []) as { id: string; leave_type: string }[])
    .find(l => typesConflict(leaveType, (l.leave_type ?? 'full_day') as LeaveKind) === 'always')
  if (existingBlocker) {
    const label = existingBlocker.leave_type === 'wfh' ? 'WFH'
      : existingBlocker.leave_type === 'shoot_day' ? 'Shoot Day'
      : existingBlocker.leave_type === 'half_day' ? 'Half Day'
      : 'Full Day'
    return { success: false, error: `You already have a ${label} request for today.` }
  }

  const { data: inserted, error: insertError } = await (supabase.from('leaves') as any).insert({
    company_id,
    user_id:    session.user.id,
    leave_type: leaveType,
    from_date:  todayIst,
    to_date:    todayIst,
    reason:     reason.trim() || (leaveType === 'shoot_day' ? 'Shoot day' : 'Work from home'),
    status:     'pending',
  }).select('created_at').single()

  if (insertError) return { success: false, error: insertError.message }

  // Notify admin
  const adminClient = createAdminClient()
  const { data: adminUsers } = await adminClient
    .from('users')
    .select('id, phone')
    .eq('company_id', company_id)
    .eq('role', 'ADMIN')

  const adminWithPhone = adminUsers?.find(a => a.phone)
  if (adminWithPhone?.phone) {
    sendNotification({
      event:         leaveType === 'shoot_day' ? 'shoot.submitted' : 'wfh.submitted',
      leave_id:      inserted?.id,
      employee_name: profile?.name ?? '',
      employee_id:   profile?.employee_id ?? '',
      from_date:     todayIst,
      to_date:       todayIst,
      reason:        reason.trim(),
      admin_phone:   adminWithPhone.phone,
    }).catch(console.error)
  }

  const leaveLabel = leaveType === 'shoot_day' ? 'Shoot Day' : 'WFH'
  if (adminUsers?.length) {
    insertManyNotifications(adminUsers.map(a => ({
      companyId: company_id!,
      userId:    a.id,
      type:      'leave_submitted',
      title:     `${profile?.name ?? 'Employee'} requested ${leaveLabel} today`,
      body:      reason.trim() || leaveLabel,
      link:      '/admin/leaves',
    }))).catch(console.error)
  }

  revalidatePath('/member/attendance')
  revalidatePath('/admin/leaves')
  return { success: true, created_at: inserted?.created_at }
}
