'use server'

import { createServerClient } from '@/lib/supabase/server'
import { createClient } from '@supabase/supabase-js'
import { revalidatePath } from 'next/cache'
import { insertNotification } from '@/lib/actions/notifications'

function adminSupabase() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  )
}

export type TaskComment = {
  id: string
  comment: string
  created_at: string
  user_id: string
  user: { name: string; employee_id: string }
}

export async function getTaskComments(taskId: string): Promise<TaskComment[]> {
  const supabase = await createServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return []

  const admin = adminSupabase()
  const { data: profile } = await admin.from('users').select('company_id').eq('id', user.id).single()
  if (!profile?.company_id) return []

  const { data: comments } = await admin
    .from('task_comments')
    .select('id, comment, created_at, user_id')
    .eq('task_id', taskId)
    .eq('company_id', profile.company_id)
    .order('created_at', { ascending: true })

  if (!comments?.length) return []

  const userIds = [...new Set(comments.map(c => c.user_id))]
  const { data: users } = await admin
    .from('users')
    .select('id, name, employee_id')
    .in('id', userIds)

  const userMap = Object.fromEntries((users ?? []).map(u => [u.id, u]))

  return comments.map(c => ({
    id: c.id,
    comment: c.comment,
    created_at: c.created_at,
    user_id: c.user_id,
    user: userMap[c.user_id] ?? { name: 'Unknown', employee_id: '' },
  }))
}

export async function addTaskComment(
  taskId: string,
  comment: string
): Promise<{ success: boolean; error?: string }> {
  if (!comment.trim()) return { success: false, error: 'Comment cannot be empty' }
  if (comment.length > 1000) return { success: false, error: 'Comment too long (max 1000 chars)' }

  const supabase = await createServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { success: false, error: 'Not authenticated' }

  const admin = adminSupabase()
  const { data: profile } = await admin.from('users').select('company_id').eq('id', user.id).single()
  if (!profile?.company_id) return { success: false, error: 'Profile not found' }

  const { error } = await admin.from('task_comments').insert({
    task_id:    taskId,
    user_id:    user.id,
    company_id: profile.company_id,
    comment:    comment.trim(),
  })

  if (error) return { success: false, error: error.message }

  // Notify the task assignee if someone else commented
  const { data: task } = await admin
    .from('tasks')
    .select('assigned_to, title, company_id')
    .eq('id', taskId)
    .single()

  if (task?.assigned_to && task.assigned_to !== user.id) {
    const { data: commenter } = await admin
      .from('users')
      .select('name')
      .eq('id', user.id)
      .single()

    await insertNotification({
      companyId: task.company_id,
      userId:    task.assigned_to,
      type:      'task_comment',
      title:     `${commenter?.name ?? 'Someone'} commented on your task`,
      body:      task.title,
      link:      '/member/tasks',
    })
  }

  revalidatePath('/member/tasks')
  revalidatePath('/admin/goals')
  return { success: true }
}
