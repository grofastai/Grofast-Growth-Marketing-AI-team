// Single source of truth for the Tracker's status graph — mirrors the shape of
// lib/shoots/status-transitions.ts. Both the client (drag/drop) and the server action
// (updateContentItemStatus) call into this so a bad drag and a bad direct API call are
// rejected identically.
export type ContentPipelineStatus =
  | 'scripting' | 'voiceover' | 'design' | 'ready_to_edit'
  | 'editing' | 'edited' | 'on_review' | 'ready_to_post' | 'posted' | 'cancelled'

export type ContentSource = 'shoot' | 'ads_video' | 'poster'

const TRANSITIONS: Record<ContentPipelineStatus, ContentPipelineStatus[]> = {
  scripting: ['voiceover'],
  voiceover: ['ready_to_edit'],
  design: ['editing'],
  // A shoot can produce footage that never gets edited (unusable take, client pulls the
  // ask) — Cancelled is reachable straight from Ready to Edit rather than requiring it
  // to be deleted outright.
  ready_to_edit: ['editing', 'cancelled'],
  editing: ['edited'],
  edited: ['on_review'],
  // The review gate: approve moves it on, a correction sends it back to the editor.
  on_review: ['ready_to_post', 'editing'],
  ready_to_post: ['posted'],
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
