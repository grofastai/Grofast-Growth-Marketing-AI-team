import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { sendWhatsAppTemplate, formatPhone } from '@/lib/whatsapp'

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
        if (message.type !== 'interactive') continue
        if (message.interactive?.type !== 'button_reply') continue

        const id = message.interactive.button_reply?.id ?? ''
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
    from_date: string
    to_date: string
    status: string
    users: { name: string; phone: string | null } | null
  }

  const { data: leaveRaw, error: fetchErr } = await supabase
    .from('leaves')
    .select('from_date, to_date, status, users(name, phone)')
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

  // Notify employee
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
