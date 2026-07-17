import { z } from 'zod'

export const CONTENT_STATUSES = [
  'scripting', 'voiceover', 'design', 'ready_to_edit',
  'edited', 'on_review', 'ready_to_post', 'posted', 'cancelled',
] as const
export const CONTENT_TYPES    = ['video', 'poster'] as const
export const CONTENT_SOURCES  = ['shoot', 'ads_video', 'poster'] as const
// "ads" is a valid posting destination, not just a script's intended use — an Ads
// Video can be scheduled/posted straight to Ads with no organic platform attached.
export const PLATFORMS        = ['instagram', 'youtube', 'facebook', 'linkedin', 'gmb', 'ads'] as const
export const USE_FOR_OPTIONS  = ['ads', 'instagram', 'youtube', 'facebook', 'linkedin', 'gmb'] as const
export const PRIORITY_LEVELS  = ['low', 'medium', 'high', 'urgent'] as const
export const TARGETING_TYPES  = ['broad', 'interest', 'lookalike', 'retargeting'] as const
export const AD_STATUSES      = ['active', 'paused', 'testing', 'stopped'] as const

export const createContentItemSchema = z.object({
  client_name:  z.string().min(1, 'Client is required'),
  title:        z.string().min(1, 'Title is required'),
  content_type: z.enum(CONTENT_TYPES).default('video'),
  shot_date:    z.string().optional(),
  notes:        z.string().optional(),
  // Backfill path: skip Shot -> Edited and record it as already posted in one
  // step, instead of forcing a drag through every stage.
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
  // Schedule/intent fields — editable here independent of stage. Saving these does NOT
  // move the item to "ready_to_post"; that transition stays owned by markReadyToPost.
  ready_platforms:     z.array(z.enum(PLATFORMS)).optional(),
  scheduled_post_date: z.string().optional(),
  scheduled_post_time: z.string().optional(),
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

// Scripting is where an Ads Video starts — no shoot, no shot_date.
export const createAdsVideoScriptSchema = z.object({
  client_name: z.string().min(1, 'Client is required'),
  title:       z.string().min(1, 'Title is required'),
  hook_count:  z.number().int().min(0).default(0),
  use_for:     z.array(z.enum(USE_FOR_OPTIONS)).min(1, 'Pick at least one'),
  priority:    z.enum(PRIORITY_LEVELS).default('medium'),
  notes:       z.string().optional(),
})
export type CreateAdsVideoScriptInput = z.infer<typeof createAdsVideoScriptSchema>

// Assigning the recorded voice-over — who, and when. Moves the item to "voiceover".
export const recordVoiceOverSchema = z.object({
  content_item_id: z.string().uuid(),
  voiceover_by:    z.string().uuid(),
  voiceover_date:  z.string().min(1, 'Date is required'),
})
export type RecordVoiceOverInput = z.infer<typeof recordVoiceOverSchema>

// Editing an Ads Video's scripting details — same field set as creation, minus status.
// Deliberately separate from updateContentItemSchema (which has shot_date, meaningless
// for an ads-video item) rather than bolting these fields on there.
export const updateAdsVideoScriptSchema = z.object({
  content_item_id: z.string().uuid(),
  client_name:     z.string().min(1, 'Client is required'),
  title:           z.string().min(1, 'Title is required'),
  hook_count:      z.number().int().min(0).default(0),
  use_for:         z.array(z.enum(USE_FOR_OPTIONS)).min(1, 'Pick at least one'),
  priority:        z.enum(PRIORITY_LEVELS).default('medium'),
  notes:           z.string().optional(),
})
export type UpdateAdsVideoScriptInput = z.infer<typeof updateAdsVideoScriptSchema>

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
