// Single source of truth for the Tracker's status graph — mirrors the shape of
// lib/shoots/status-transitions.ts. Both the client (drag/drop) and the server action
// (updateContentItemStatus) call into this so a bad drag and a bad direct API call are
// rejected identically.
export type ContentPipelineStatus =
  | 'scripting' | 'voiceover' | 'design' | 'ready_to_edit' | 'edited'
  | 'on_review' | 'branding_ready' | 'ads_ready' | 'posted' | 'cancelled'

export type ContentSource = 'shoot' | 'ads_video' | 'poster'

const TRANSITIONS: Record<ContentPipelineStatus, ContentPipelineStatus[]> = {
  // A script (or its voice-over) can turn out unusable — client pulls the ask, wrong
  // direction — before it ever reaches a shoot or edit, same as footage/a design can.
  scripting: ['voiceover', 'cancelled'],
  // 'scripting' as a target undoes an accidental move into Voice Over before a real
  // recording happened — mirrors the same undo pattern every later stage already has.
  voiceover: ['ready_to_edit', 'scripting', 'cancelled'],
  // Both production paths hand off to an editor's own "Edited" checkpoint before
  // reaching admin review — Cancelled stays reachable from here too, same as it was
  // from Ready to Edit/Design, since nothing has been approved out of review yet.
  design: ['edited', 'cancelled'],
  ready_to_edit: ['edited', 'cancelled'],
  // 'ready_to_edit'/'design' also listed as a target here — an accidental move (or an
  // editor suddenly unable to continue) needs to be undoable back to the stage it came
  // from, whichever that was for this item's source.
  edited: ['on_review', 'cancelled', 'ready_to_edit', 'design'],
  // The review gate branches three ways: approved for organic posting, approved for
  // ads, or rejected outright (with who rejected it recorded separately). 'edited' is
  // also a valid target — undoes an accidental Move before anything downstream happened.
  on_review: ['branding_ready', 'ads_ready', 'cancelled', 'edited'],
  // 'on_review' as a target undoes an accidental branding/ads approval before a post
  // was actually logged against it.
  branding_ready: ['posted', 'on_review'],
  ads_ready: ['posted', 'on_review'],
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
