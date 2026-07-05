# Support Chat — Delete Own Message + Image Pen/Marker Tool

**Date:** 2026-07-05
**Scope:** Member support chat (`app/member/support/support-client.tsx`) and admin support chat (`app/admin/support/support-client.tsx`), plus the shared thread UI (`components/support/thread-ui.tsx`) and the support server actions (`lib/actions/support.ts`).

## Problem

In the support chat, a sent message (text or image) cannot be removed, and there is no way to mark up an image before sending to point at the problem area. Users want:

1. A **delete** option on their own sent messages/images.
2. A **pen/marker** tool to draw on an image before it is sent.

## Existing structure (grounding)

- Chat messages are rows in `support_responses`: `{ id, ticket_id, responder_id, responder_name, message, created_at }`.
- Images are **embedded in the `message` text** as `[img]<publicUrl>` (optionally `text\n[img]<url>`). Parsed by `bodyParts()` in `components/support/thread-ui.tsx`.
- Image files live in the Supabase Storage bucket `support-attachments`, uploaded client-side at path `${ticketId}/${Date.now()}.${ext}`.
- Both member and admin clients render messages via the shared `Bubble` component and subscribe to realtime `INSERT`s on `support_responses` filtered by `ticket_id`.
- The first message of a ticket is the ticket's own `description` (a `support_tickets` row) — **out of scope** for delete (tickets already have Close Ticket).

## Feature 1 — Delete own message (hard delete)

**Rule (confirmed):** each person can delete only messages **they** sent (`responder_id === currentUserId`). Deleted for everyone. Hard delete — the row disappears; no "message deleted" placeholder, no schema change.

### Server action — `lib/actions/support.ts`

```
deleteResponse(response_id: string): Promise<{ success: boolean; error?: string }>
```

- Load the caller's profile (`getProfile()`), reject if not authenticated.
- Fetch the target response (`id, responder_id, message, ticket_id`) via the admin client.
- **Authorization:** reject unless `response.responder_id === profile.id`. (Own-messages-only applies to admins too.)
- **Storage cleanup:** if `message` contains `[img]`, parse the URL, extract the storage path (the segment after `/support-attachments/`), and `storage.from('support-attachments').remove([path])`. Best-effort — a storage failure does not block the row delete.
- Delete the `support_responses` row by `id`.
- `cacheDel` the affected ticket cache keys (`tickets:ADMIN:${company_id}`, `tickets:MEMBER:${ticket.user_id}`) — look up the ticket's `user_id`/`company_id` like `addResponse` does.
- `revalidatePath('/member/support')` and `('/admin/support')`.
- Do **not** send a notification.

### UI — shared `Bubble` (or its call sites)

- Show a small **trash icon** on the caller's own bubbles only. Visible on hover (desktop) and always visible (mobile — touch has no hover). Touch target ≥ 44px via padding/hitbox even if the glyph is small.
- Click → lightweight confirm ("Delete this message?") → call `deleteResponse` inside a transition; on success remove it from local state immediately (optimistic) and `router.refresh()`.
- `Bubble` needs to know "is this mine" — pass `isOwn` (already effectively known by side/alignment) and an `onDelete` callback. Keep `Bubble` presentational: it renders the button and calls `onDelete(response.id)`; the page owns the server call + state.

### Realtime — handle DELETE

Both clients currently subscribe to `INSERT` only. Add a `DELETE` handler on the same channel so the other party sees the message vanish without a manual refresh:

- On `postgres_changes` `DELETE` for `support_responses` (filter `ticket_id=eq.${id}`), remove the row (`payload.old.id`) from the merged message state (`live` + base). Because the merged list dedupes by `id` and reads from both `active.support_responses` and `live`, deletion needs to filter both — simplest: keep a `deletedIds` set and exclude it in the `messages` memo, then `router.refresh()` reconciles the base list.
- Supabase realtime DELETE only includes the primary key by default unless the table's replica identity is FULL. `ticket_id` may therefore be absent on the DELETE payload; if so, subscribe without the `ticket_id` filter for DELETE (channel is per-ticket already) or match by `payload.old.id` against currently-rendered ids. Implementation plan should verify replica identity and pick the working variant.

## Feature 2 — Image pen/marker tool (before sending)

**Rule (confirmed):** available **before sending** only (on the attached-but-not-yet-sent image), on both sides. Not on already-received images.

### Shared component — `components/support/ImageAnnotator.tsx`

A self-contained full-screen (modal) canvas editor. No new npm dependencies — plain `<canvas>` + Pointer Events.

Props:
```
{ src: string;                       // object URL of the picked image
  onCancel: () => void;
  onDone: (file: File) => void; }    // returns the flattened marked-up image as a File
```

Behavior:
- Draws the source image onto a canvas sized to the image's natural dimensions (capped to a sane max, e.g. 1600px longest edge, to bound memory/upload size), scaled to fit the viewport for display.
- Freehand drawing with Pointer Events (works for mouse **and** touch — `touch-action: none` on the canvas to prevent scroll-while-drawing).
- Toolbar: **pen color** (3 swatches — red default, plus e.g. yellow, black), **Undo** (pop last stroke; strokes stored as point arrays and re-rendered), **Clear** (remove all strokes), **Cancel**, **Done**.
- Stroke width fixed (e.g. 4px at natural resolution) — keep it simple.
- **Done** re-renders image + strokes to the canvas at natural resolution and `canvas.toBlob(...)` → wrap in a `File` (`marked-${originalName}.png`) → `onDone(file)`.

### Wiring into each client

- In the reply composer preview (where `replyPreview` + `removeReplyImage` already exist), add a **✏️ Mark** button next to the existing remove button.
- Clicking Mark opens `ImageAnnotator` with `src={replyPreview}`.
- `onDone(file)`: replace `replyFile` with the new file and `replyPreview` with a fresh object URL of it (revoke the old URL). Close the editor. Sending then uploads the marked-up file via the existing `sendReply` path — **no change to upload/send logic**.
- `onCancel`: just close.
- The pre-send compose modal (new ticket, `pickFile` at line ~382) also has an attachment; adding Mark there is optional — **include it** for consistency since it is the same pattern, but keep it a thin reuse of the same component.

## Responsiveness (per standing rule)

- Delete affordance: hover on desktop, always-visible on mobile; ≥44px hit area.
- Annotator modal: full-screen on mobile, centered large on desktop; toolbar buttons ≥44px; canvas uses `touch-action: none`; image fits within viewport with `max-width/height: 100%`. No horizontal scroll.
- Apply identically to member and admin clients (same shared components).

## Out of scope / YAGNI

- No "message deleted" tombstone / edit history (hard delete only).
- No shapes/text/arrows/eraser in the annotator — freehand pen only.
- No annotating already-sent images.
- No admin-override delete of others' messages.

## Testing

- `deleteResponse` authorization: sender can delete; non-sender (incl. admin on a member's message) is rejected.
- `deleteResponse` removes the storage object when the message had an image; succeeds even if storage removal fails.
- Deleting reflects on the other side via realtime DELETE (or refresh fallback).
- Annotator returns a valid image File that uploads and renders in the thread.
- Touch drawing works (no scroll interference); Undo/Clear behave.
- Member and admin sides both have both features; layouts hold at 320px and desktop.
