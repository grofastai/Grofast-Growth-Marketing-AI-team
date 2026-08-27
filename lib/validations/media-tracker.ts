import { z } from 'zod'

export const CONTENT_STATUSES = [
  'scripting', 'voiceover', 'design', 'ready_to_edit',
  'on_review', 'branding_ready', 'ads_ready', 'posted', 'cancelled',
] as const
export const CANCELLED_BY_OPTIONS = ['client', 'us'] as const
export const CONTENT_TYPES    = ['video', 'poster'] as const
export const CONTENT_SOURCES  = ['shoot', 'ads_video', 'poster'] as const
// "ads" is a valid posting destination, not just a script's intended use — an Ads
// Video can be scheduled/posted straight to Ads with no organic platform attached.
export const PLATFORMS        = ['instagram', 'youtube', 'facebook', 'linkedin', 'gmb', 'twitter', 'ads', 'meta_ads', 'google_ads', 'other'] as const
export const USE_FOR_OPTIONS  = ['ads', 'instagram', 'youtube', 'facebook', 'linkedin', 'gmb', 'twitter', 'meta_ads', 'google_ads', 'other'] as const
export const PRIORITY_LEVELS  = ['low', 'medium', 'high', 'urgent'] as const
export const TARGETING_TYPES  = ['broad', 'interest', 'lookalike', 'retargeting'] as const
export const AD_STATUSES      = ['active', 'paused', 'testing', 'stopped'] as const
export const SHOOT_TYPES      = ['ads_shoot', 'branding_shoot'] as const

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
  // Who edited/designed it — asked at backfill time same as the normal Edited -> On
  // Review move, instead of silently defaulting to whoever's filling out the form.
  edited_by:            z.string().uuid().optional(),
  // Who actually posted it — same reasoning as edited_by, asked instead of silently
  // crediting whoever's filling out the backfill form.
  posted_by:            z.string().uuid().optional(),
  // Where the edited file lives. Backfilled items skip the Edited -> On Review move
  // where this is normally captured, so it has to be askable here or the Drive link
  // is lost for every item logged as already posted.
  edited_drive_link:    z.string().optional(),
  // Only meaningful when posted_platforms includes 'other'.
  other_platform_label: z.string().optional(),
})
export type CreateContentItemInput = z.infer<typeof createContentItemSchema>

export const updateContentItemSchema = z.object({
  client_name:  z.string().min(1, 'Client is required'),
  title:        z.string().min(1, 'Title is required'),
  content_type: z.enum(CONTENT_TYPES),
  shot_date:    z.string().optional(),
  notes:        z.string().optional(),
  // Who shot it — editable after the fact, and now multi-person (a shoot's crew is
  // rarely just one person). Empty array clears it; undefined means "not sent this time".
  shot_by:      z.array(z.string().uuid()).optional(),
  // Reassigning who/when edited it — only meaningful once the item has reached On Review or
  // later (that's when it was first asked, at the Ready to Edit -> On Review move).
  edited_by:    z.string().uuid().optional(),
  edited_date:  z.string().optional(),
  // The edit's actual home — correctable after the fact if the file moved or a
  // correction round changed which file is final.
  edited_drive_link: z.string().optional(),
  // Only meaningful once the item is actually cancelled — correctable if the wrong
  // party was picked in the moment.
  cancelled_by: z.enum(CANCELLED_BY_OPTIONS).optional(),
  // Schedule/intent fields — editable here independent of stage. Saving these does NOT
  // move the item to "ready_to_post"; that transition stays owned by markReadyToPost.
  ready_platforms:     z.array(z.enum(PLATFORMS)).optional(),
  scheduled_post_date: z.string().optional(),
  scheduled_post_time: z.string().optional(),
})
export type UpdateContentItemInput = z.infer<typeof updateContentItemSchema>

// Changing only when an approved item is due to go out, from the Branding/Ads Ready card
// itself. Deliberately NOT updateContentItemSchema: that one is a whole-record update and
// nulls scheduled_post_time/ready_platforms when they aren't resent, which a one-field
// reschedule must never do.
export const rescheduleContentItemSchema = z.object({
  content_item_id:     z.string().uuid(),
  scheduled_post_date: z.string().min(1, 'Posting date is required'),
})
export type RescheduleContentItemInput = z.infer<typeof rescheduleContentItemSchema>

// Correcting a logged post after the fact — who actually posted it, or when it actually
// went out — without touching the platform itself (that's add/remove, not edit).
export const updateContentPostSchema = z.object({
  id:               z.string().uuid(),
  content_item_id:  z.string().uuid(),
  posted_by:        z.string().uuid().optional(),
  posted_date:      z.string().min(1, 'Posted date is required'),
})
export type UpdateContentPostInput = z.infer<typeof updateContentPostSchema>

export const addContentPostSchema = z.object({
  content_item_id: z.string().uuid(),
  platform:        z.enum(PLATFORMS),
  posted_date:     z.string().min(1, 'Posted date is required'),
  post_link:       z.string().optional(),
  // Who actually posted it — defaults to the current user if not supplied.
  posted_by:       z.string().uuid().optional(),
  // Ads Completed only — when the ad actually started running, separate from posted_date
  // (when it was logged).
  ad_run_date:     z.string().optional(),
  // Ticked independently of platform choice — flags the underlying content item as used
  // for promotion, one-way (never unset here).
  is_promotion:    z.boolean().optional(),
  // Only meaningful when platform is 'other' — which platform it actually was.
  other_platform_label: z.string().optional(),
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
  use_for:     z.array(z.enum(USE_FOR_OPTIONS)).default([]),
  shoot_type:  z.enum(SHOOT_TYPES).optional(),
  scripted_by: z.string().uuid('Pick who scripted this'),
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
  use_for:         z.array(z.enum(USE_FOR_OPTIONS)).default([]),
  shoot_type:      z.enum(SHOOT_TYPES).optional(),
  scripted_by:     z.string().uuid('Pick who scripted this'),
  notes:           z.string().optional(),
})
export type UpdateAdsVideoScriptInput = z.infer<typeof updateAdsVideoScriptSchema>

// Editing a Voice Over assignment after the fact — the artist became unavailable, or the
// date was wrong. Deliberately NOT a pipeline transition (item is already at "voiceover"),
// just an in-place correction — see updateVoiceOver.
export const updateVoiceOverSchema = z.object({
  content_item_id: z.string().uuid(),
  voiceover_by:    z.string().uuid(),
  voiceover_date:  z.string().min(1, 'Date is required'),
})
export type UpdateVoiceOverInput = z.infer<typeof updateVoiceOverSchema>

// Spinning a real shoot off an Ads Video item that's still in Scripting — e.g. the client
// wants to speak the script on camera instead of using a recorded voice-over.
export const moveScriptToShootSchema = z.object({
  content_item_id: z.string().uuid(),
  shoot_type:       z.enum(SHOOT_TYPES).optional(),
  shot_date:        z.string().min(1, 'Shot date is required'),
  shot_time_from:   z.string().min(1, 'From time is required'),
  shot_time_to:     z.string().min(1, 'To time is required'),
  notes:            z.string().optional(),
})
export type MoveScriptToShootInput = z.infer<typeof moveScriptToShootSchema>

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

export const setClientMonthlyTargetSchema = z.object({
  client_name:  z.string().min(1),
  kind:         z.enum(['branding', 'ads']),
  content_type: z.enum(CONTENT_TYPES),
  month:        z.string().regex(/^\d{4}-\d{2}$/, 'Month must be YYYY-MM'),
  target:       z.number().int().min(0),
})
export type SetClientMonthlyTargetInput = z.infer<typeof setClientMonthlyTargetSchema>
