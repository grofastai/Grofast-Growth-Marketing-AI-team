'use server'

import { createServerClient } from '@/lib/supabase/server'
import { createClient } from '@supabase/supabase-js'
import { revalidatePath } from 'next/cache'
import { z } from 'zod'

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
  const raw = {
    title: formData.get('title') as string,
    description: (formData.get('description') as string) || undefined,
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

  const base = {
    company_id: profile.company_id,
    title: parsed.data.title,
    description: parsed.data.description || null,
    project_id: parsed.data.project_id || null,
    priority: parsed.data.priority,
    due_date: parsed.data.due_date || null,
    status: 'todo' as const,
    created_by: user.id,
  }

  if (assignedToList.length === 0) {
    const { error } = await admin.from('tasks').insert({ ...base, assigned_to: null })
    if (error) return { error: error.message }
  } else {
    const rows = assignedToList.map(id => ({ ...base, assigned_to: id }))
    const { error } = await admin.from('tasks').insert(rows)
    if (error) return { error: error.message }
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
    description: (formData.get('description') as string) || undefined,
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

  const { error } = await admin.from('tasks').insert({
    company_id:  profile.company_id,
    title:       parsed.data.title,
    description: parsed.data.description || null,
    priority:    parsed.data.priority,
    due_date:    parsed.data.due_date || null,
    status:      'todo',
    created_by:  user.id,
    assigned_to: parsed.data.assigned_to || user.id,
    project_id:  finalProjectId,
  })

  if (error) return { error: error.message }

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

export async function updateTaskStatus(
  taskId: string,
  status: 'todo' | 'in_progress' | 'completed'
): Promise<{ success: boolean; error?: string }> {
  const supabase = await createServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { success: false, error: 'Not authenticated' }

  const admin = adminSupabase()
  const updates: Record<string, unknown> = { status }
  if (status === 'completed') updates.completed_at = new Date().toISOString()
  if (status !== 'completed') updates.completed_at = null
  const { error } = await admin.from('tasks').update(updates).eq('id', taskId)
  if (error) return { success: false, error: error.message }

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

export async function updateTask(
  id: string,
  updates: { title?: string; description?: string; priority?: 'low' | 'medium' | 'high'; due_date?: string | null; assigned_to?: string | null }
): Promise<{ success: boolean; error?: string }> {
  const supabase = await createServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { success: false, error: 'Not authenticated' }

  const admin = adminSupabase()
  const { error } = await admin.from('tasks').update(updates).eq('id', id)
  if (error) return { success: false, error: error.message }

  revalidatePath('/admin/goals')
  revalidatePath('/member/tasks')
  return { success: true }
}
