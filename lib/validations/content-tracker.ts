import { z } from 'zod'

export const CONTENT_STATUSES = ['shot', 'editing', 'edited', 'ready', 'posted'] as const
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
  // Backfill path: skip Shot -> Editing -> Edited and record it as already
  // posted in one step, instead of forcing a drag through every stage.
  posted_platforms: z.array(z.enum(PLATFORMS)).optional(),
  posted_date:      z.string().optional(),
})
export type CreateContentItemInput = z.infer<typeof createContentItemSchema>

export const updateContentItemSchema = z.object({
  client_name:  z.string().min(1, 'Client is required'),
  title:        z.string().min(1, 'Title is required'),
  content_type: z.enum(CONTENT_TYPES),
  shot_date:    z.string().optional(),
  notes:        z.string().optional(),
})
export type UpdateContentItemInput = z.infer<typeof updateContentItemSchema>

export const addContentPostSchema = z.object({
  content_item_id: z.string().uuid(),
  platform:        z.enum(PLATFORMS),
  posted_date:     z.string().min(1, 'Posted date is required'),
  post_link:       z.string().optional(),
  // Who actually posted it — defaults to the current user if not supplied.
  posted_by:       z.string().uuid().optional(),
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

export const updateAdSchema = z.object({
  ad_id:           z.string().uuid(),
  client_name:     z.string().min(1, 'Client is required'),
  ad_name:         z.string().min(1, 'Ad name is required'),
  platform:        z.string().min(1),
  launch_date:     z.string().optional(),
  targeting_type:  z.enum(TARGETING_TYPES).optional(),
  targeting_notes: z.string().optional(),
})
export type UpdateAdInput = z.infer<typeof updateAdSchema>

export const addAdRevisionSchema = z.object({
  ad_id:                 z.string().uuid(),
  notes:                 z.string().min(1, 'Revision notes are required'),
  hook_count_after:      z.number().int().min(0).optional(),
  targeting_type_after:  z.enum(TARGETING_TYPES).optional(),
})
export type AddAdRevisionInput = z.infer<typeof addAdRevisionSchema>

// Sending an edited item back for corrections — what needs fixing, and who's fixing it.
export const requestCorrectionSchema = z.object({
  content_item_id: z.string().uuid(),
  notes:           z.string().min(1, 'Describe what needs fixing'),
  assigned_to:     z.string().uuid().optional(),
})
export type RequestCorrectionInput = z.infer<typeof requestCorrectionSchema>

// Moving an item to "Ready to Post" schedules it: which platforms, which day, what time.
export const markReadyToPostSchema = z.object({
  content_item_id:     z.string().uuid(),
  ready_platforms:     z.array(z.enum(PLATFORMS)).min(1, 'Pick at least one platform'),
  scheduled_post_date: z.string().min(1, 'Posting date is required'),
  scheduled_post_time: z.string().optional(),
})
export type MarkReadyToPostInput = z.infer<typeof markReadyToPostSchema>

export const addAdPerformanceEntrySchema = z.object({
  ad_id:       z.string().uuid(),
  entry_date:  z.string().min(1, 'Date is required'),
  spend:       z.number().min(0),
  impressions: z.number().int().min(0),
  reach:       z.number().int().min(0),
  clicks:      z.number().int().min(0),
  ctr:         z.number().min(0),
  results:     z.number().int().min(0),
  note:        z.string().optional(),
})
export type AddAdPerformanceEntryInput = z.infer<typeof addAdPerformanceEntrySchema>
