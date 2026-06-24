import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { sendWhatsAppTemplate, formatPhone } from '@/lib/whatsapp'
import { autoInsertLeaveHistory } from '@/lib/leave-approval-effects'

// GET — Meta webhook verification handshake
export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url)
  const mode      = searchParams.get('hub.mode')
  const token     = searchParams.get('hub.verify_token')
  const challenge = searchParams.get('hub.challenge')

  if (mode === 'subscribe' && token === process.env.META_WHATSAPP_VERIFY_TOKEN) {
    return new NextResponse(challenge, { status: 200 })
  }
  return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
}

// POST — incoming messages / button replies from Meta
export async function POST(req: NextRequest) {
  let body: unknown
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'Bad request' }, { status: 400 })
  }

  // Meta expects a 200 quickly — process async
  processWebhook(body).catch(console.error)
  return NextResponse.json({ status: 'ok' })
}

interface MetaWebhookBody {
  object?: string
  entry?: Array<{
    changes?: Array<{
      value?: {
        messages?: Array<{
          from?: string
          type?: string
          text?: { body?: string }
          interactive?: {
            type?: string
            button_reply?: {
              id?: string
              title?: string
            }
          }
        }>
      }
    }>
  }>
}

async function processWebhook(body: unknown) {
  const wb = body as MetaWebhookBody
  if (wb.object !== 'whatsapp_business_account') return

  for (const entry of wb.entry ?? []) {
    for (const change of entry.changes ?? []) {
      for (const message of change.value?.messages ?? []) {
        if (message.type === 'text' && message.text?.body && message.from) {
          await handleAttendanceTextReply(message.from, message.text.body)
          continue
        }

        if (message.type !== 'interactive') continue
        if (message.interactive?.type !== 'button_reply') continue

        const id = message.interactive.button_reply?.id ?? ''

        // Attendance buttons use no colon — must check before the entityId guard below
        if (
          id === 'attendance_office' ||
          id === 'attendance_wfh' ||
          id === 'attendance_leave'
        ) {
          await handleAttendanceButtonReply(
            message.from ?? '',
            id as 'attendance_office' | 'attendance_wfh' | 'attendance_leave'
          )
          continue
        }

        const [action, entityId] = id.split(':')
        if (!entityId) continue

        if (action === 'approve' || action === 'reject') {
          await handleLeaveAction(entityId, action as 'approve' | 'reject')
        } else if (action === 'ack') {
          await handleTaskAck(entityId)
        }
      }
    }
  }
}

async function handleTaskAck(taskId: string) {
  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )
  const { error } = await supabase
    .from('tasks')
    .update({ acknowledged_at: new Date().toISOString() })
    .eq('id', taskId)
    .is('acknowledged_at', null)

  if (error) {
    console.error('[whatsapp-webhook] task ack error:', error)
  } else {
    console.log(`[whatsapp-webhook] task ${taskId} acknowledged`)
  }
}

async function handleLeaveAction(leaveId: string, action: 'approve' | 'reject') {
  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )

  type LeaveRow = {
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
    status: string
    users: { name: string; phone: string | null } | null
  }

  const { data: leaveRaw, error: fetchErr } = await supabase
    .from('leaves')
    .select('company_id, user_id, from_date, to_date, leave_type, reason, created_at, permission_time, permission_end_time, permission_hours, half_day_from_time, half_day_to_time, half_day_period, status, users(name, phone)')
    .eq('id', leaveId)
    .single()

  if (fetchErr || !leaveRaw) {
    console.error('[whatsapp-webhook] leave not found:', leaveId, fetchErr)
    return
  }

  const leave = leaveRaw as unknown as LeaveRow

  // Only act on pending leaves
  if (leave.status !== 'pending') {
    console.warn(`[whatsapp-webhook] leave ${leaveId} already ${leave.status} — ignoring`)
    return
  }

  const status = action === 'approve' ? 'approved' : 'rejected'
  const { error: updateErr } = await supabase
    .from('leaves')
    .update({ status })
    .eq('id', leaveId)

  if (updateErr) {
    console.error('[whatsapp-webhook] update error:', updateErr)
    return
  }

  console.log(`[whatsapp-webhook] leave ${leaveId} ${status}`)

  // WFH / Shoot Day → mark PRESENT with the right work_type (never absent).
  // Auto clock-in only for same-day single-day requests (from the attendance button).
  if (status === 'approved' && (leave.leave_type === 'wfh' || leave.leave_type === 'shoot_day')) {
    const todayIst = new Date().toLocaleString('en-CA', { timeZone: 'Asia/Kolkata' }).split(',')[0]
    if (leave.from_date === todayIst && leave.to_date === todayIst) {
      const { data: existing } = await supabase
        .from('attendance_logs')
        .select('id, clock_in')
        .eq('company_id', leave.company_id)
        .eq('user_id', leave.user_id)
        .eq('date', todayIst)
        .maybeSingle()
      const appliedHourIst = parseInt(
        new Date(leave.created_at).toLocaleString('en-US', { timeZone: 'Asia/Kolkata', hour: '2-digit', hour12: false })
      )
      // Before 9 AM → shift start 9:30 AM IST (= 04:00 UTC); after 9 AM → actual apply time
      const clockInTime = appliedHourIst < 9
        ? new Date(todayIst + 'T04:00:00.000Z').toISOString()
        : leave.created_at
      const workType = leave.leave_type === 'shoot_day' ? 'shoot' : 'wfh'
      if (!existing) {
        await supabase.from('attendance_logs').insert({
          company_id: leave.company_id,
          user_id:    leave.user_id,
          date:       todayIst,
          clock_in:   clockInTime,
          work_type:  workType,
          status:     'present',
        })
      } else if (!existing.clock_in) {
        await supabase.from('attendance_logs').update({
          clock_in:  clockInTime,
          work_type: workType,
          status:    'present',
        }).eq('id', existing.id)
      }
    }

  // Auto-update attendance + history when approved (skip permission — employee is still present)
  } else if (status === 'approved' && leave.leave_type !== 'permission') {
    const curr = new Date(leave.from_date + 'T12:00:00')
    const end  = new Date(leave.to_date   + 'T12:00:00')
    while (curr <= end) {
      const dateStr = curr.toISOString().split('T')[0]
      const { data: existing } = await supabase
        .from('attendance_logs')
        .select('id')
        .eq('company_id', leave.company_id)
        .eq('user_id', leave.user_id)
        .eq('date', dateStr)
        .maybeSingle()
      if (!existing) {
        const attStatus = leave.leave_type === 'half_day' ? 'half_day' : 'leave'
        supabase.from('attendance_logs').insert({
          company_id: leave.company_id,
          user_id:    leave.user_id,
          date:       dateStr,
          status:     attStatus,
        }).then(({ error: e }) => { if (e) console.error('[whatsapp-webhook] attendance insert:', e.message) })
      }
      curr.setDate(curr.getDate() + 1)
    }
    autoInsertLeaveHistory(supabase, leave).catch(e =>
      console.error('[whatsapp-webhook] leave history insert failed:', e)
    )
  }

  // In-app bell notification to member
  const leaveLabel = leave.leave_type === 'permission' ? 'Permission'
    : leave.leave_type === 'half_day' ? 'Half Day Leave'
    : leave.leave_type === 'wfh' ? 'Work From Home'
    : leave.leave_type === 'shoot_day' ? 'Shoot Day'
    : 'Full Day Leave'
  supabase.from('notifications').insert({
    company_id: leave.company_id,
    user_id:    leave.user_id,
    type:       'leave_status',
    title:      status === 'approved' ? `${leaveLabel} Approved` : `${leaveLabel} Rejected`,
    body:       `Your ${leaveLabel.toLowerCase()} request has been ${status}.`,
    link:       '/member/leaves',
  }).then(({ error: e }) => { if (e) console.error('[whatsapp-webhook] notification insert:', e.message) })

  // WhatsApp message to employee
  const employeePhone = leave.users?.phone
  const employeeName  = leave.users?.name ?? 'Employee'
  if (employeePhone) {
    const templateName = status === 'approved' ? 'grofast_leave_approved' : 'grofast_leave_rejected'
    await sendWhatsAppTemplate(
      formatPhone(employeePhone),
      templateName,
      [employeeName, leave.from_date, leave.to_date]
    )
  }
}

async function handleAttendanceButtonReply(
  from: string,
  buttonId: 'attendance_office' | 'attendance_wfh' | 'attendance_leave'
) {
  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )

  const last10 = from.replace(/\D/g, '').slice(-10)
  const { data: user, error: lookupErr } = await supabase
    .from('users')
    .select('id, company_id, name')
    .like('phone', `%${last10}`)
    .eq('role', 'MEMBER')
    .maybeSingle()

  if (lookupErr || !user) {
    console.warn(`[whatsapp-webhook] no unique user for phone ${from}`, lookupErr?.message ?? '')
    return
  }

  const today = new Date().toISOString().split('T')[0]
  const { data: existingRows } = await supabase
    .from('attendance_logs')
    .select('id')
    .eq('company_id', user.company_id)
    .eq('user_id', user.id)
    .eq('date', today)

  if (existingRows && existingRows.length > 0) {
    await sendWhatsAppReply(from, 'Your attendance is already marked for today ✅')
    return
  }

  if (buttonId === 'attendance_leave') {
    const { error: leaveErr } = await supabase.from('attendance_logs').insert({
      company_id: user.company_id,
      user_id: user.id,
      date: today,
      status: 'leave',
    })
    if (leaveErr) {
      console.error('[whatsapp-webhook] attendance insert error:', leaveErr)
      return
    }
    await sendWhatsAppReply(from, 'Got it! Marked as On Leave for today ✅')
    return
  }

  const workType = buttonId === 'attendance_office' ? 'office'
    : buttonId === 'attendance_wfh' ? 'wfh'
    : 'shoot'

  const { error } = await supabase.from('attendance_logs').insert({
    company_id: user.company_id,
    user_id: user.id,
    date: today,
    clock_in: new Date().toISOString(),
    work_type: workType,
    status: 'present',
  })

  if (error) {
    console.error('[whatsapp-webhook] attendance insert error:', error)
    return
  }

  const label = workType === 'office' ? 'In Office' : 'Work from Home'
  await sendWhatsAppReply(from, `Got it! Marked as ${label} for today ✅`)
  console.log(`[whatsapp-webhook] attendance marked for ${user.name} — ${workType}`)
}


async function interpretAttendanceText(
  reply: string
): Promise<{ work_type: 'office' | 'wfh' | 'shoot' | 'leave'; present: boolean } | null> {
  const apiKey = process.env.ANTHROPIC_API_KEY
  if (!apiKey) return null

  try {
    const { default: Anthropic } = await import('@anthropic-ai/sdk')
    const client = new Anthropic({ apiKey })
    const msg = await client.messages.create({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 60,
      messages: [{
        role: 'user',
        content: `An employee replied to a work attendance check-in: "${reply.replace(/"/g, "'")}"
Return JSON only, no explanation: {"work_type":"office"|"wfh"|"shoot"|"leave","present":true|false}`,
      }],
    })
    const text = msg.content[0].type === 'text' ? msg.content[0].text : ''
    const parsed = JSON.parse(text.trim())
    if (!['office', 'wfh', 'shoot', 'leave'].includes(parsed.work_type)) return null
    if (typeof parsed.present !== 'boolean') return null
    return parsed as { work_type: 'office' | 'wfh' | 'shoot' | 'leave'; present: boolean }
  } catch (err) {
    console.error('[whatsapp-webhook] AI interpret error:', err)
    return null
  }
}

async function handleAttendanceTextReply(from: string, text: string) {
  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )

  const last10 = from.replace(/\D/g, '').slice(-10)
  const { data: user } = await supabase
    .from('users')
    .select('id, company_id, name')
    .like('phone', `%${last10}`)
    .eq('role', 'MEMBER')
    .maybeSingle()

  if (!user) return

  const today = new Date().toISOString().split('T')[0]
  const { data: existingRows } = await supabase
    .from('attendance_logs')
    .select('id')
    .eq('company_id', user.company_id)
    .eq('user_id', user.id)
    .eq('date', today)

  if (existingRows && existingRows.length > 0) {
    await sendWhatsAppReply(from, 'Your attendance is already marked for today ✅')
    return
  }

  const interpreted = await interpretAttendanceText(text)

  if (!interpreted) {
    await sendWhatsAppReply(
      from,
      "Sorry, I didn't understand that. Please tap a button to mark your attendance:\n\nType: *office* for In Office\nType: *wfh* for Work from Home\nType: *leave* for On Leave"
    )
    return
  }

  if (!interpreted.present || interpreted.work_type === 'leave') {
    await supabase.from('attendance_logs').insert({
      company_id: user.company_id,
      user_id: user.id,
      date: today,
      status: 'leave',
    })
    await sendWhatsAppReply(from, 'Got it! Marked as On Leave for today ✅')
    return
  }

  const { error } = await supabase.from('attendance_logs').insert({
    company_id: user.company_id,
    user_id: user.id,
    date: today,
    clock_in: new Date().toISOString(),
    work_type: interpreted.work_type,
    status: 'present',
  })

  if (error) {
    console.error('[whatsapp-webhook] attendance insert error:', error)
    return
  }

  const label = interpreted.work_type === 'office' ? 'In Office'
    : interpreted.work_type === 'wfh' ? 'Work from Home'
    : 'Shoot'
  await sendWhatsAppReply(from, `Got it! Marked as ${label} for today ✅`)
  console.log(`[whatsapp-webhook] AI-interpreted attendance for ${user.name} — ${interpreted.work_type}`)
}

async function sendWhatsAppReply(to: string, message: string): Promise<void> {
  const token = process.env.META_WHATSAPP_TOKEN
  const phoneId = process.env.META_PHONE_NUMBER_ID
  if (!token || !phoneId) return

  await fetch(`https://graph.facebook.com/v19.0/${phoneId}/messages`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({
      messaging_product: 'whatsapp',
      to,
      type: 'text',
      text: { body: message },
    }),
  }).catch(err => console.error('[whatsapp-webhook] reply send failed:', err))
}
