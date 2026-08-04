import { SupabaseClient } from '@supabase/supabase-js'

type AdminClient = SupabaseClient<any, 'public', any>

export type LeaveForApproval = {
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

function fmtTimeStr(t?: string | null): string | null {
  if (!t) return null
  const [h, m] = t.split(':').map(Number)
  const period = h >= 12 ? 'PM' : 'AM'
  const h12 = h % 12 === 0 ? 12 : h % 12
  return `${h12}:${String(m).padStart(2, '0')} ${period}`
}

// Mirrors the detail line shown on the admin Leaves page (app/admin/leaves/leaves-client.tsx
// fmtTimeStr usage) so the WhatsApp approval message matches what admin sees in the app —
// permission and half_day previously sent no time at all (GF-whatsapp-templates incident).
export function formatLeaveDetail(leave: LeaveForApproval): string {
  const type = leave.leave_type ?? 'full_day'

  if (type === 'permission') {
    const from = fmtTimeStr(leave.permission_time)
    const to = fmtTimeStr(leave.permission_end_time)
    if (from && to) return `Permission · ${from}–${to}`
    if (from) return `Permission · ${from}`
    return 'Permission'
  }

  if (type === 'half_day') {
    const from = fmtTimeStr(leave.half_day_from_time)
    const to = fmtTimeStr(leave.half_day_to_time)
    if (from && to) return `Half Day · ${from}–${to}`
    return 'Half Day'
  }

  if (type === 'wfh') return 'Work From Home'
  if (type === 'shoot_day') return 'Shoot Day'
  return 'Full Day Leave'
}

async function upsertWorkEntry(
  admin: AdminClient,
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

export async function autoInsertLeaveHistory(admin: AdminClient, leave: LeaveForApproval) {
  const type = leave.leave_type ?? 'full_day'

  if (type === 'permission') {
    const startTime = leave.permission_time ?? null
    if (!startTime) return

    let endTime = leave.permission_end_time ?? null
    if (!endTime && leave.permission_hours) {
      const [fh, fm] = startTime.split(':').map(Number)
      const totalMins = fh * 60 + fm + Math.round(leave.permission_hours * 60)
      endTime = `${String(Math.floor(totalMins / 60)).padStart(2, '0')}:${String(totalMins % 60).padStart(2, '0')}`
    }
    if (!endTime) return

    const [fh, fm] = startTime.split(':').map(Number)
    const [th, tm] = endTime.split(':').map(Number)
    const diffMins = (th * 60 + tm) - (fh * 60 + fm)
    if (diffMins <= 0) return

    await upsertWorkEntry(admin, leave.company_id, leave.user_id, leave.from_date, {
      task_type: 'break',
      title: 'Permission Leave',
      client_name: leave.reason ?? 'Permission',
      duration_hours: Math.round((diffMins / 60) * 10) / 10,
      notes: leave.reason ?? '',
      start_time: startTime,
      end_time: endTime,
      _is_leave: true,
    })

  } else if (type === 'half_day') {
    const startTime = leave.half_day_from_time ?? null
    const endTime = leave.half_day_to_time ?? null
    if (!startTime || !endTime) return

    const [fh, fm] = startTime.split(':').map(Number)
    const [th, tm] = endTime.split(':').map(Number)
    const diffMins = (th * 60 + tm) - (fh * 60 + fm)
    if (diffMins <= 0) return

    await upsertWorkEntry(admin, leave.company_id, leave.user_id, leave.from_date, {
      task_type: 'break',
      title: 'Half Day Leave',
      client_name: leave.reason ?? 'Half Day',
      duration_hours: Math.round((diffMins / 60) * 10) / 10,
      notes: leave.reason ?? '',
      start_time: startTime,
      end_time: endTime,
      _is_leave: true,
    })

  } else {
    const start = new Date(leave.from_date)
    const end = new Date(leave.to_date)
    for (const d = new Date(start); d <= end; d.setDate(d.getDate() + 1)) {
      const date = d.toISOString().split('T')[0]
      await upsertWorkEntry(admin, leave.company_id, leave.user_id, date, {
        task_type: 'break',
        title: '🌴 Full Day Leave',
        client_name: leave.reason ?? 'Approved Leave',
        duration_hours: 0,
        notes: leave.reason ?? '',
        start_time: null,
        end_time: null,
      }, 'absent')
    }
  }
}
