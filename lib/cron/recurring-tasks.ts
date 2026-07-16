import type { SupabaseClient } from '@supabase/supabase-js'
import { computeNextRun, isRecurringInterval } from '@/lib/recurring'
import { insertNotification } from '@/lib/actions/notifications'
import { sendWhatsAppTemplate, formatPhone } from '@/lib/whatsapp'
import { todayIST } from '@/lib/utils/ist-date'

// Clones every task whose recurring_next_run has arrived into a new "todo" task,
// carrying the schedule forward, and retires the row that just spawned it.
// Invoked by the recurring-tasks cron (fires 3x/day — see route.ts for why) and
// available for manual/testing invocation via the same route. Safe to call
// repeatedly: only rows still recurring_active=true match, so a task already
// cloned earlier that day is silently skipped on a later run.
export async function runRecurringTasksJob(admin: SupabaseClient): Promise<{ created: number; due: number }> {
  const today = todayIST()

  const { data: dueTasks, error: fetchError } = await admin
    .from('tasks')
    .select('id, company_id, title, description, priority, assigned_to, created_by, project_id, category, expected_time, expected_deliverable, checklist, attachments, approval_required, manager_note, recurring_task, recurring_next_run, recurring_until')
    .eq('recurring_active', true)
    .lte('recurring_next_run', today)

  if (fetchError) {
    console.error('[recurring-tasks] fetch failed:', fetchError.message)
    return { created: 0, due: 0 }
  }

  let created = 0
  for (const task of dueTasks ?? []) {
    if (!isRecurringInterval(task.recurring_task) || !task.recurring_next_run) continue

    const resetChecklist = Array.isArray(task.checklist)
      ? (task.checklist as Array<{ text: string; done: boolean }>).map(item => ({ text: item.text, done: false }))
      : []

    // This clone continues the chain only if another occurrence still fits
    // before recurring_until. Null until = no boundary (pre-existing chains
    // created before that column existed keep their old unlimited behavior).
    const followingRun = computeNextRun(task.recurring_next_run, task.recurring_task)
    const chainContinues = !task.recurring_until || followingRun <= task.recurring_until

    const { data: nextTask, error: insertError } = await admin.from('tasks').insert({
      company_id:           task.company_id,
      title:                task.title,
      description:          task.description,
      priority:             task.priority,
      due_date:             task.recurring_next_run,
      status:               'todo',
      created_by:           task.created_by,
      assigned_to:          task.assigned_to,
      project_id:           task.project_id,
      category:             task.category,
      expected_time:        task.expected_time,
      expected_deliverable: task.expected_deliverable,
      checklist:            resetChecklist,
      attachments:          task.attachments ?? [],
      approval_required:    task.approval_required,
      manager_note:         task.manager_note,
      recurring_task:       task.recurring_task,
      recurring_active:     chainContinues,
      recurring_next_run:   chainContinues ? followingRun : null,
      recurring_until:      task.recurring_until,
    }).select('id').single()

    if (insertError) {
      console.error(`[recurring-tasks] failed to clone task ${task.id}:`, insertError.message)
      continue
    }

    await admin.from('tasks').update({ recurring_active: false }).eq('id', task.id)
    created++

    if (task.assigned_to && task.assigned_to !== task.created_by) {
      const [{ data: creator }, { data: assignee }] = await Promise.all([
        admin.from('users').select('name').eq('id', task.created_by).single(),
        admin.from('users').select('name, phone').eq('id', task.assigned_to).single(),
      ])
      await insertNotification({
        companyId: task.company_id,
        userId: task.assigned_to,
        type: 'task_assigned',
        title: `New ${task.recurring_task} task: ${task.title}`,
        body: task.title,
        link: '/member/tasks',
      }).catch(console.error)
      if (assignee?.phone) {
        sendWhatsAppTemplate(
          formatPhone(assignee.phone),
          'grofast_task_assigned',
          [assignee.name, creator?.name ?? 'Admin', task.title, task.recurring_next_run],
          nextTask ? [{ index: 0, payload: `ack:${nextTask.id}` }] : undefined
        ).catch(console.error)
      }
    }
  }

  console.log(`[recurring-tasks] created ${created} of ${dueTasks?.length ?? 0} due occurrences`)
  return { created, due: dueTasks?.length ?? 0 }
}
