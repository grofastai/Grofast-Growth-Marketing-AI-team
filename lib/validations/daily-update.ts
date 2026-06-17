import { z } from 'zod'

// ── Per-video editing log row ──────────────────────────────────
export const editingVideoSchema = z.object({
  id:             z.string(),
  date_given:     z.string().optional().default(''),
  date_finished:  z.string().optional().default(''),
  video_name:     z.string().default(''),
  client_id:      z.string().nullable().optional(),
  client_name:    z.string().default(''),
  duration:       z.string().optional().default(''),   // final video length e.g. "0:30"
  video_type:     z.string().default(''),
  time_taken:     z.number().min(0).default(0),        // editing hours
  drive_updated:  z.boolean().default(false),
  drive_link:     z.string().optional().default(''),
  revisions:      z.number().int().min(0).default(0),
})

// ── Work entry (one time block per client/task) ────────────────
export const workEntrySchema = z.object({
  id:              z.string(),
  client_id:       z.string().nullable().optional(),
  client_name:     z.string().min(1, 'Client name required'),
  task_type:       z.enum(['shoot', 'edit', 'upload', 'other', 'break', 'learning']),
  title:           z.string().min(1, 'Entry title required'),
  start_time:      z.string().optional().default(''),
  end_time:        z.string().optional().default(''),
  duration_hours:  z.number().min(0),
  notes:           z.string().optional(),
  // Shoot-specific
  video_uploaded:  z.boolean().nullable().optional(),
  screenshot_url:  z.string().optional(),
  petrol_expense:  z.number().min(0).optional(),
  other_expense:   z.number().min(0).optional(),
  travel_time:     z.string().optional(),
  // Edit-specific
  video_link:      z.string().optional(),
  editing_videos:  z.array(editingVideoSchema).optional().default([]),
  // Multi-client split
  is_multi_client:  z.boolean().optional(),
  client_names:     z.array(z.string()).optional(),
  participant_ids:  z.array(z.string()).optional(),
}).passthrough()

// ── Main schema ────────────────────────────────────────────────
export const dailyUpdateSchema = z
  .object({
    active_tab:   z.enum(['working', 'media', 'learning', 'break']),
    date:         z.string().optional(),

    work_entries:       z.array(workEntrySchema).optional().default([]),
    links:              z.array(z.string()).optional().default([]),
    shoot_count:        z.number().int().min(0).default(0),
    editing_count:      z.number().int().min(0).default(0),
    shoot_time_hours:   z.number().min(0).optional(),
    editing_time_hours: z.number().min(0).optional(),

    learning_topic:      z.string().optional(),
    learning_hours:      z.number().min(0).max(24).default(0),
    learning_notes:      z.string().optional(),
    learning_start_time: z.string().optional(),
    learning_end_time:   z.string().optional(),

    participant_ids: z.array(z.string().uuid()).optional().default([]),

  })
  .superRefine((val, ctx) => {
    const nonBreakEntries = val.work_entries.filter(e => e.task_type !== 'break')
    if ((val.active_tab === 'working' || val.active_tab === 'media') && nonBreakEntries.length === 0) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'Add at least one work entry', path: ['work_entries'] })
    }
    if (val.active_tab === 'learning') {
      const hasLearningEntries = val.work_entries.some(e => e.task_type === 'learning')
      if (!hasLearningEntries) {
        if (!val.learning_topic?.trim()) {
          ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'Learning topic is required', path: ['learning_topic'] })
        }
        if (!val.learning_hours || val.learning_hours <= 0) {
          ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'Time spent is required', path: ['learning_hours'] })
        }
      }
    }
  })

export type DailyUpdateInput  = z.infer<typeof dailyUpdateSchema>
export type WorkEntryInput    = z.infer<typeof workEntrySchema>
export type EditingVideo      = z.infer<typeof editingVideoSchema>

// Keep old types exported so admin code that imports them doesn't break
export type ShootEntryInput   = { client_name: string; shoot_type: string; video_count: number; notes?: string }
export type EditingEntryInput = { client_name: string; editing_hours: number; folder_link?: string }
