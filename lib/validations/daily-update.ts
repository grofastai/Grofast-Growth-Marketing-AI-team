import { z } from 'zod'

// ── Work entry (one time block per client/task) ────────────────
export const workEntrySchema = z.object({
  id:            z.string(),
  client_id:     z.string().nullable().optional(),
  client_name:   z.string().min(1, 'Client name required'),
  task_type:     z.enum(['shoot', 'edit', 'upload', 'other']),
  title:         z.string().min(1, 'Entry title required'),
  start_time:    z.string().regex(/^\d{2}:\d{2}$/, 'Use HH:MM format'),
  end_time:      z.string().regex(/^\d{2}:\d{2}$/, 'Use HH:MM format'),
  duration_hours: z.number().min(0),
  notes:         z.string().optional(),
})

// ── Main schema ────────────────────────────────────────────────
export const dailyUpdateSchema = z
  .object({
    // Which top-level tab was active
    active_tab:   z.enum(['working', 'learning']),

    // Working tab
    work_entries: z.array(workEntrySchema).optional().default([]),
    links:        z.array(z.string()).optional().default([]),
    // Media-team extras
    shoot_count:       z.number().int().min(0).default(0),
    editing_count:     z.number().int().min(0).default(0),
    shoot_time_hours:  z.number().min(0).optional(),
    editing_time_hours: z.number().min(0).optional(),

    // Learning tab
    learning_topic: z.string().optional(),
    learning_hours: z.number().min(0).max(24).default(0),
    learning_notes: z.string().optional(),
  })
  .superRefine((val, ctx) => {
    if (val.active_tab === 'working' && val.work_entries.length === 0) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'Add at least one work entry',
        path: ['work_entries'],
      })
    }
    if (val.active_tab === 'learning') {
      if (!val.learning_topic?.trim()) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: 'Learning topic is required',
          path: ['learning_topic'],
        })
      }
      if (!val.learning_hours || val.learning_hours <= 0) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: 'Time spent is required',
          path: ['learning_hours'],
        })
      }
    }
  })

export type DailyUpdateInput  = z.infer<typeof dailyUpdateSchema>
export type WorkEntryInput    = z.infer<typeof workEntrySchema>

// Keep old types exported so admin code that imports them doesn't break
export type ShootEntryInput   = { client_name: string; shoot_type: string; video_count: number; notes?: string }
export type EditingEntryInput = { client_name: string; editing_hours: number; folder_link?: string }
