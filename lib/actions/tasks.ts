'use server'

import { createServerClient } from '@/lib/supabase/server'
import { createClient } from '@supabase/supabase-js'
import { revalidatePath } from 'next/cache'
import { z } from 'zod'
import { insertNotification, insertManyNotifications } from './notifications'
import { sendWhatsAppTemplate, formatPhone } from '@/lib/whatsapp'
import { computeNextRun, isRecurringInterval } from '@/lib/recurring'

function adminSupabase() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  )
}

const taskSchema = z.object({
  title: z.string().min(1, 'Title required'),
  description: z.string().optional(),
  project_id: z.string().uuid().optional().nullable(),
  priority: z.enum(['low', 'medium', 'high']).default('medium'),
  due_date: z.string().optional().nullable(),
})

export async function createTask(
  _prev: { error: string } | { success: true } | null,
  formData: FormData
): Promise<{ error: string } | { success: true }> {
  const clientName = (formData.get('client_name') as string)?.trim() || null
  const rawDescription = (formData.get('description') as string) || undefined
  const raw = {
    title: formData.get('title') as string,
    description: clientName
      ? (rawDescription ? `Client: ${clientName}\n${rawDescription}` : `Client: ${clientName}`)
      : rawDescription,
    project_id: (formData.get('project_id') as string) || null,
    priority: (formData.get('priority') as string) || 'medium',
    due_date: (formData.get('due_date') as string) || null,
  }

  const parsed = taskSchema.safeParse(raw)
  if (!parsed.success) return { error: parsed.error.issues[0].message }

  // Support multiple assigned_to values (one task per member)
  const assignedToList = (formData.getAll('assigned_to') as string[]).filter(v => v && v.trim())

  const supabase = await createServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'Not authenticated' }

  const admin = adminSupabase()
  const { data: profile } = await admin.from('users').select('company_id').eq('id', user.id).single()
  if (!profile?.company_id) return { error: 'Profile not found — contact support' }

  const managerNote = (formData.get('manager_note') as string)?.trim() || null
  let adminChecklist: object[] = []
  try { adminChecklist = JSON.parse((formData.get('checklist_json') as string) || '[]') } catch { adminChecklist = [] }

  const base = {
    company_id: profile.company_id,
    title: parsed.data.title,
    description: parsed.data.description || null,
    project_id: parsed.data.project_id || null,
    priority: parsed.data.priority,
    due_date: parsed.data.due_date || null,
    status: 'todo' as const,
    created_by: user.id,
    manager_note: managerNote,
    checklist: adminChecklist,
  }

  if (assignedToList.length === 0) {
    const { error } = await admin.from('tasks').insert({ ...base, assigned_to: null })
    if (error) return { error: error.message }
  } else {
    const rows = assignedToList.map(id => ({ ...base, assigned_to: id }))
    const { data: insertedTasks, error } = await admin.from('tasks').insert(rows).select('id, assigned_to')
    if (error) return { error: error.message }
    // Notify each assignee (skip self-assignment)
    const othersAssigned = assignedToList.filter(id => id !== user.id)
    if (othersAssigned.length > 0) {
      const { data: creator } = await admin.from('users').select('name').eq('id', user.id).single()
      const { data: assignees } = await admin.from('users').select('id, name, phone').in('id', othersAssigned)
      await insertManyNotifications(othersAssigned.map(id => ({
        companyId: profile.company_id,
        userId: id,
        type: 'task_assigned',
        title: `${creator?.name ?? 'Admin'} assigned you a task`,
        body: parsed.data.title,
        link: '/member/tasks',
      })))
      // WhatsApp blast with "Got it" ack button — fire and forget
      if (assignees?.length && insertedTasks?.length) {
        const dueStr = parsed.data.due_date ?? 'No due date'
        ;(async () => {
          await Promise.all(
            assignees
              .filter((u: { phone?: string | null }) => u.phone)
              .map((u: { id: string; name: string; phone: string }) => {
                const taskRow = insertedTasks.find((t: { assigned_to: string }) => t.assigned_to === u.id)
                return sendWhatsAppTemplate(
                  formatPhone(u.phone),
                  'grofast_task_assigned',
                  [u.name, creator?.name ?? 'Admin', parsed.data.title, dueStr],
                  taskRow ? [{ index: 0, payload: `ack:${taskRow.id}` }] : undefined
                )
              })
          )
        })().catch(console.error)
      }
    }
  }

  revalidatePath('/admin/goals')
  revalidatePath('/member/tasks')
  return { success: true }
}

export async function createMemberTask(
  _prev: { error: string } | { success: true } | null,
  formData: FormData
): Promise<{ error: string } | { success: true }> {
  const rawPromoName = (formData.get('promotion_name') as string)?.trim() || null
  const shopName     = (formData.get('shop_name') as string)?.trim() || null
  const promotionName = rawPromoName
    ? shopName ? `${rawPromoName} — ${shopName}` : rawPromoName
    : null

  const raw = {
    title:       formData.get('title') as string,
    description: (formData.get('task_brief') as string) || undefined,
    priority:    (formData.get('priority') as string) || 'medium',
    due_date:    (formData.get('due_date') as string) || null,
    assigned_to: (formData.get('assigned_to') as string) || null,
    project_id:  (formData.get('project_id') as string) || null,
  }

  const parsed = z.object({
    title:       z.string().min(1, 'Title required'),
    description: z.string().optional(),
    priority:    z.enum(['low','medium','high']).default('medium'),
    due_date:    z.string().optional().nullable(),
    assigned_to: z.string().uuid().optional().nullable(),
    project_id:  z.string().uuid().optional().nullable(),
  }).safeParse(raw)

  if (!parsed.success) return { error: parsed.error.issues[0].message }

  // Rich fields
  const category             = (formData.get('category') as string) || null
  const expectedTime         = (formData.get('expected_time') as string)?.trim() || null
  const expectedDeliverable  = (formData.get('expected_deliverable') as string)?.trim() || null
  const approvalRequired     = formData.get('approval_required') === 'true'
  const recurringTaskRaw     = (formData.get('recurring_task') as string) || 'none'
  const recurringTask        = isRecurringInterval(recurringTaskRaw) ? recurringTaskRaw : 'none'

  if (recurringTask !== 'none' && !parsed.data.due_date) {
    return { error: 'Due date is required for a recurring task' }
  }
  let checklist: object[] = []
  let attachments: string[] = []
  try { checklist  = JSON.parse((formData.get('checklist_json')   as string) || '[]') } catch { checklist = [] }
  try { attachments = JSON.parse((formData.get('attachments_json') as string) || '[]') } catch { attachments = [] }

  const supabase = await createServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'Not authenticated' }

  const admin = adminSupabase()
  const { data: profile } = await admin.from('users').select('company_id').eq('id', user.id).single()
  if (!profile?.company_id) return { error: 'Profile not found' }

  // If a promotion name was provided, auto-create a quick project
  let finalProjectId: string | null = parsed.data.project_id || null
  if (promotionName) {
    const { data: proj } = await admin.from('projects').insert({
      company_id:   profile.company_id,
      business_name: promotionName,
      client_name:  '__member_quick__',
      status:       'active',
      progress_pct: 0,
    }).select('id').single()
    if (proj) finalProjectId = proj.id
  }

  const { data: insertedTask, error } = await admin.from('tasks').insert({
    company_id:           profile.company_id,
    title:                parsed.data.title,
    description:          parsed.data.description || null,
    priority:             parsed.data.priority,
    due_date:             parsed.data.due_date || null,
    status:               'todo',
    created_by:           user.id,
    assigned_to:          parsed.data.assigned_to || user.id,
    project_id:           finalProjectId,
    category,
    expected_time:        expectedTime,
    expected_deliverable: expectedDeliverable,
    checklist,
    attachments,
    approval_required:    approvalRequired,
    recurring_task:       recurringTask,
    recurring_active:     recurringTask !== 'none',
    recurring_next_run:   recurringTask !== 'none' ? computeNextRun(parsed.data.due_date!, recurringTask) : null,
  }).select('id').single()

  if (error) return { error: error.message }

  // Notify assignee when task is assigned to someone else
  const finalAssignee = parsed.data.assigned_to || user.id
  if (finalAssignee !== user.id) {
    const [{ data: creator }, { data: assignee }] = await Promise.all([
      admin.from('users').select('name').eq('id', user.id).single(),
      admin.from('users').select('name, phone').eq('id', finalAssignee).single(),
    ])
    await insertNotification({
      companyId: profile.company_id,
      userId: finalAssignee,
      type: 'task_assigned',
      title: `${creator?.name ?? 'Someone'} assigned you a task`,
      body: parsed.data.title,
      link: '/member/tasks',
    })
    // WhatsApp notification with ack button — fire and forget
    if (assignee?.phone) {
      const dueStr = parsed.data.due_date ?? 'No due date'
      sendWhatsAppTemplate(
        formatPhone(assignee.phone),
        'grofast_task_assigned',
        [assignee.name, creator?.name ?? 'Admin', parsed.data.title, dueStr],
        insertedTask ? [{ index: 0, payload: `ack:${insertedTask.id}` }] : undefined
      ).catch(console.error)
    }
  }

  revalidatePath('/member/tasks')
  return { success: true }
}

export async function deleteQuickProject(id: string): Promise<{ success: boolean; error?: string }> {
  const supabase = await createServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { success: false, error: 'Not authenticated' }

  const admin = adminSupabase()
  const [{ data: proj }, { data: profile }] = await Promise.all([
    admin.from('projects').select('client_name, company_id').eq('id', id).single(),
    admin.from('users').select('company_id').eq('id', user.id).single(),
  ])

  if (!proj || proj.client_name !== '__member_quick__') return { success: false, error: 'Cannot delete this project' }
  if (!profile || proj.company_id !== profile.company_id) return { success: false, error: 'Unauthorized' }

  const { error } = await admin.from('projects').delete().eq('id', id)
  if (error) return { success: false, error: error.message }

  revalidatePath('/member/tasks')
  return { success: true }
}

export async function updateManagerNote(
  taskId: string,
  note: string
): Promise<{ success: boolean; error?: string }> {
  const supabase = await createServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { success: false, error: 'Not authenticated' }

  const admin = adminSupabase()
  const { data: profile } = await admin.from('users').select('role').eq('id', user.id).single()
  if (profile?.role !== 'ADMIN') return { success: false, error: 'Only admins can add manager notes' }

  const { error } = await admin.from('tasks').update({ manager_note: note }).eq('id', taskId)
  if (error) return { success: false, error: error.message }

  revalidatePath('/admin/goals')
  revalidatePath('/member/tasks')
  return { success: true }
}

export async function updateTaskStatus(
  taskId: string,
  status: 'todo' | 'in_progress' | 'review' | 'completed'
): Promise<{ success: boolean; error?: string }> {
  const supabase = await createServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { success: false, error: 'Not authenticated' }

  const admin = adminSupabase()
  const dbUpdates: Record<string, unknown> = { status }
  if (status === 'completed') dbUpdates.completed_at = new Date().toISOString()
  if (status !== 'completed') dbUpdates.completed_at = null

  // Fetch task before updating so we can notify creator
  const { data: task } = await admin.from('tasks').select('title, company_id, created_by').eq('id', taskId).single()

  const { error } = await admin.from('tasks').update(dbUpdates).eq('id', taskId)
  if (error) return { success: false, error: error.message }

  // Notify creator when task is sent for review or completed (skip self-assigned)
  if ((status === 'review' || status === 'completed') && task?.created_by && task.created_by !== user.id) {
    const { data: mover } = await admin.from('users').select('name').eq('id', user.id).single()
    insertNotification({
      companyId: task.company_id,
      userId: task.created_by,
      type: status === 'review' ? 'task_review' : 'task_completed',
      title: status === 'review'
        ? `${mover?.name ?? 'Someone'} sent a task for review`
        : `${mover?.name ?? 'Someone'} completed a task`,
      body: task.title,
      link: '/member/tasks',
    }).catch(console.error)
  }

  revalidatePath('/admin/goals')
  revalidatePath('/member/tasks')
  return { success: true }
}

export async function deleteTask(id: string): Promise<{ success: boolean; error?: string }> {
  const supabase = await createServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { success: false, error: 'Not authenticated' }

  const admin = adminSupabase()
  const [{ data: profile }, { data: task }] = await Promise.all([
    admin.from('users').select('role').eq('id', user.id).single(),
    admin.from('tasks').select('created_by').eq('id', id).single(),
  ])

  const isAdmin   = profile?.role === 'ADMIN'
  const isCreator = task?.created_by === user.id
  if (!isAdmin && !isCreator) return { success: false, error: 'Only the task creator or an admin can delete this task' }

  const { error } = await admin.from('tasks').delete().eq('id', id)
  if (error) return { success: false, error: error.message }

  revalidatePath('/admin/goals')
  revalidatePath('/member/tasks')
  return { success: true }
}

export async function stopRecurringTask(id: string): Promise<{ success: boolean; error?: string }> {
  const supabase = await createServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { success: false, error: 'Not authenticated' }

  const admin = adminSupabase()
  const { data: task } = await admin.from('tasks').select('created_by, recurring_active').eq('id', id).single()
  if (!task) return { success: false, error: 'Task not found' }
  if (task.created_by !== user.id) return { success: false, error: 'Only the person who assigned this task can stop its recurrence' }
  if (!task.recurring_active) return { success: true }

  const { error } = await admin.from('tasks').update({ recurring_active: false }).eq('id', id)
  if (error) return { success: false, error: error.message }

  revalidatePath('/admin/goals')
  revalidatePath('/member/tasks')
  return { success: true }
}

export async function updateTaskChecklist(
  taskId: string,
  checklist: Array<{ text: string; done: boolean }>
): Promise<{ success: boolean; error?: string }> {
  const supabase = await createServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { success: false, error: 'Not authenticated' }

  const admin = adminSupabase()
  const { error } = await admin.from('tasks').update({ checklist }).eq('id', taskId)
  if (error) return { success: false, error: error.message }

  revalidatePath('/member/tasks')
  return { success: true }
}

export async function updateTask(
  id: string,
  updates: { title?: string; description?: string; priority?: 'low' | 'medium' | 'high'; due_date?: string | null; assigned_to?: string | null; attachments?: { type: 'link' | 'file'; url: string; name: string }[] }
): Promise<{ success: boolean; error?: string }> {
  const supabase = await createServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { success: false, error: 'Not authenticated' }

  const admin = adminSupabase()

  // If reassigning, notify the new assignee (before updating so we can check old value)
  if (updates.assigned_to && updates.assigned_to !== user.id) {
    const { data: task } = await admin.from('tasks').select('title, company_id, assigned_to, due_date').eq('id', id).single()
    if (task && task.assigned_to !== updates.assigned_to) {
      const [{ data: updater }, { data: assignee }] = await Promise.all([
        admin.from('users').select('name').eq('id', user.id).single(),
        admin.from('users').select('name, phone').eq('id', updates.assigned_to).single(),
      ])
      const taskTitle = updates.title ?? task.title
      insertNotification({
        companyId: task.company_id,
        userId: updates.assigned_to,
        type: 'task_assigned',
        title: `${updater?.name ?? 'Someone'} assigned you a task`,
        body: taskTitle,
        link: '/member/tasks',
      }).catch(console.error)
      // WhatsApp notification with ack button — fire and forget
      if (assignee?.phone) {
        const dueStr = (updates.due_date ?? task.due_date) ?? 'No due date'
        sendWhatsAppTemplate(
          formatPhone(assignee.phone),
          'grofast_task_assigned',
          [assignee.name, updater?.name ?? 'Admin', taskTitle, dueStr],
          [{ index: 0, payload: `ack:${id}` }]
        ).catch(console.error)
      }
    }
  }

  const { error } = await admin.from('tasks').update(updates).eq('id', id)
  if (error) return { success: false, error: error.message }

  revalidatePath('/admin/goals')
  revalidatePath('/member/tasks')
  return { success: true }
}

export async function getTaskAttachments(
  taskId: string
): Promise<{ type: 'link' | 'file'; url: string; name: string }[]> {
  const supabase = await createServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return []
  const admin = adminSupabase()
  const { data } = await admin
    .from('tasks')
    .select('attachments')
    .eq('id', taskId)
    .single()
  if (!data?.attachments) return []
  return (data.attachments as { type: 'link' | 'file'; url: string; name?: string }[])
    .map(a => ({ type: a.type ?? 'link', url: a.url ?? '', name: a.name ?? a.url ?? '' }))
}
