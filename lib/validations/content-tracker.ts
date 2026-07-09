import { z } from 'zod'

export const CONTENT_STATUSES = ['shot', 'editing', 'edited', 'posted'] as const
export const CONTENT_TYPES    = ['video', 'poster'] as const
export const PLATFORMS        = ['instagram', 'youtube', 'facebook', 'linkedin', 'gmb'] as const
export const TARGETING_TYPES  = ['broad', 'interest', 'lookalike', 'retargeting'] as const
export const AD_STATUSES      = ['active', 'paused', 'testing', 'stopped'] as const

export const createContentItemSchema = z.object({
  client_name:  z.string().min(1, 'Client is required'),
  title:        z.string().min(1, 'Title is required'),
  content_type: z.enum(CONTENT_TYPES).default('video'),
  shot_date:    z.string().optional(),
  notes:        z.string().optional(),
})
export type CreateContentItemInput = z.infer<typeof createContentItemSchema>

export const addContentPostSchema = z.object({
  content_item_id: z.string().uuid(),
  platform:        z.enum(PLATFORMS),
  posted_date:     z.string().min(1, 'Posted date is required'),
  post_link:       z.string().optional(),
})
export type AddContentPostInput = z.infer<typeof addContentPostSchema>

export const createAdSchema = z.object({
  client_name:     z.string().min(1, 'Client is required'),
  ad_name:         z.string().min(1, 'Ad name is required'),
  platform:        z.string().min(1).default('meta'),
  launch_date:     z.string().optional(),
  hook_count:      z.number().int().min(0).default(0),
  targeting_type:  z.enum(TARGETING_TYPES).optional(),
  targeting_notes: z.string().optional(),
})
export type CreateAdInput = z.infer<typeof createAdSchema>

export const addAdRevisionSchema = z.object({
  ad_id:                 z.string().uuid(),
  notes:                 z.string().min(1, 'Revision notes are required'),
  hook_count_after:      z.number().int().min(0).optional(),
  targeting_type_after:  z.enum(TARGETING_TYPES).optional(),
})
export type AddAdRevisionInput = z.infer<typeof addAdRevisionSchema>
