// Single source of truth for the Tracker's status graph — mirrors the shape of
// lib/shoots/status-transitions.ts. Both the client (drag/drop) and the server action
// (updateContentItemStatus) call into this so a bad drag and a bad direct API call are
// rejected identically.
export type ContentPipelineStatus =
  | 'scripting' | 'voiceover' | 'design' | 'ready_to_edit'
  | 'on_review' | 'branding_ready' | 'ads_ready' | 'posted' | 'cancelled'

export type ContentSource = 'shoot' | 'ads_video' | 'poster'

const TRANSITIONS: Record<ContentPipelineStatus, ContentPipelineStatus[]> = {
  // A script (or its voice-over) can turn out unusable — client pulls the ask, wrong
  // direction — before it ever reaches a shoot or edit, same as footage/a design can.
  scripting: ['voiceover', 'cancelled'],
  voiceover: ['ready_to_edit', 'cancelled'],
  // "Who edited this?" is asked right at this transition — there's no separate Edited
  // stage to stop at first.
  design: ['on_review', 'cancelled'],
  ready_to_edit: ['on_review', 'cancelled'],
  // Footage or a design can turn out unusable (bad take, client pulls the ask) before
  // it's actually finished — Cancelled is reachable from here rather than requiring
  // deletion.
  // The review gate branches three ways: approved for organic posting, approved for
  // ads, or rejected outright (with who rejected it recorded separately).
  on_review: ['branding_ready', 'ads_ready', 'cancelled'],
  branding_ready: ['posted'],
  ads_ready: ['posted'],
  posted: [],
  cancelled: [],
}

export function isValidPipelineTransition(from: ContentPipelineStatus, to: ContentPipelineStatus): boolean {
  return TRANSITIONS[from].includes(to)
}

const ENTRY_STATUS: Record<ContentSource, ContentPipelineStatus> = {
  shoot: 'ready_to_edit',
  ads_video: 'scripting',
  poster: 'design',
}

export function entryStatusForSource(source: ContentSource): ContentPipelineStatus {
  return ENTRY_STATUS[source]
}

// scripting/voiceover exist only for the ads-video front half; design only for posters.
// Every other stage is shared and reachable regardless of where the item came from.
const SOURCE_ONLY_STATUS: Partial<Record<ContentPipelineStatus, ContentSource>> = {
  scripting: 'ads_video',
  voiceover: 'ads_video',
  design: 'poster',
}

export function isStatusAllowedForSource(status: ContentPipelineStatus, source: ContentSource): boolean {
  const restriction = SOURCE_ONLY_STATUS[status]
  return restriction === undefined || restriction === source
}
