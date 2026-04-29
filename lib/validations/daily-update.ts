import { z } from 'zod'

export const shootEntrySchema = z.object({
  client_name: z.string().min(1, 'Client name required'),
  shoot_type: z.string().min(1, 'Shoot type required'),
  video_count: z.number().int().min(1),
  notes: z.string().optional(),
})

export const editingEntrySchema = z.object({
  client_name: z.string().min(1, 'Client name required'),
  editing_hours: z.number().min(0.5).max(24),
  folder_link: z.string().url('Must be a valid URL').optional().or(z.literal('')),
})

export const dailyUpdateSchema = z
  .object({
    attendance_status: z.enum(['present', 'absent', 'holiday', 'outside']),
    work_type: z.enum(['office', 'outside', 'wfh']).optional(),
    working_hours: z.number().min(0).max(24).optional(),
    learning_hours: z.number().min(0).max(24).default(0),
    shoot_count: z.number().int().min(0).default(0),
    notes: z.string().optional(),
    task_id: z.string().uuid().optional().nullable(),
    shoot_entries: z.array(shootEntrySchema).optional().default([]),
    editing_entries: z.array(editingEntrySchema).optional().default([]),
  })
  .superRefine((val, ctx) => {
    if (val.attendance_status === 'present' && !val.work_type) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'Work type required when present',
        path: ['work_type'],
      })
    }
  })

export type DailyUpdateInput = z.infer<typeof dailyUpdateSchema>
export type ShootEntryInput = z.infer<typeof shootEntrySchema>
export type EditingEntryInput = z.infer<typeof editingEntrySchema>
