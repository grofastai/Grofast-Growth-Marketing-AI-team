# Chat Support — Design Spec
**Date:** 2026-05-23  
**Status:** Approved  

---

## Overview

Replace the existing form-based support page with a WhatsApp-style per-topic conversation UI. Each support category (Technical, Payroll, HR, etc.) becomes its own chat thread. Members and admins exchange messages as chat bubbles in real time via Supabase subscriptions. No new database tables required.

---

## Data Layer

### Existing tables (unchanged schema)
- `support_tickets` — one row per conversation thread (title, category, description, status, priority, user_id, company_id)
- `support_responses` — one row per message in a thread (ticket_id, responder_id, responder_name, message, created_at)

### Changes to existing queries

**`getTickets`** in `lib/actions/support.ts`:
- Add `responder_id` to the `support_responses` sub-select so clients can distinguish member vs admin bubbles.

**`addResponse`** in `lib/actions/support.ts`:
- Already supports both member and admin callers — no role restriction. No changes needed.
- Member sending a follow-up message reuses this action directly.

### New: `getOrCreateThread(category)`
A server action called when a member taps a category card:
- Queries `support_tickets` for the **most recent non-closed** (`status IN ('open', 'in_progress')`) ticket in that category for the current user.
- If multiple exist (edge case), takes the most recently updated one.
- If found: returns the existing ticket with all responses.
- If not found (or all are closed): returns `null` so the client shows the empty state. Ticket is created on first message send.
- If all previous tickets are closed and member sends a new message, a fresh ticket is created (new thread).

### `createTicket` update
When a member sends their first message in an empty category thread, `createTicket` is called with:
- `title` = category name (e.g. "Technical Issues")
- `category` = category key
- `description` = the message text
- `priority` = `'normal'`

Then `addResponse` is NOT called separately — the description IS the first message (rendered as the first bubble).

---

## Member Support Page (`app/member/support/`)

### View 1 — Category Grid (default)

Six category cards in a 2-column grid matching the admin categories:

| Key | Label |
|---|---|
| technical | Technical Issues |
| payroll | Payroll Requests |
| leave | Attendance Corrections |
| general | Client Support |
| hr | HR Helpdesk |
| other | Escalated Issues |

Each card shows:
- Category icon image + label + accent color
- **Unread dot** (red) if the latest message in that thread has `responder_id !== currentUserId` (i.e. admin replied last)
- Status chip if a thread exists (Open / In Progress / Resolved)
- Greyed "No active thread" if no ticket exists for that category

### View 2 — Chat Thread (when card is tapped)

**Header:**
- Back arrow → returns to category grid
- Category name
- Status chip (Open / In Progress / Resolved / Closed) — read-only for member

**Message list (scrollable, reverse-chronological with newest at bottom):**
- First item: the ticket's `description` field rendered as the member's first bubble
- Subsequent items: `support_responses` ordered by `created_at` ascending
- **Member bubble** (responder_id === currentUserId): right-aligned, brand red background (`#DE1A1A`), white text, rounded corners (full right, partial left)
- **Admin bubble** (responder_id !== currentUserId): left-aligned, light gray background (`#F3F4F6`), dark text, rounded corners (full left, partial right)
- Sender name shown above admin bubbles only
- Timestamp shown below each bubble (HH:MM format)
- Auto-scroll to bottom on load and on new message

**Empty state (no ticket yet):**
- Illustration + "No conversation yet" text
- "Send your first message to start" subtext
- Input bar still shown — first send creates the ticket

**Bottom input bar (fixed):**
- Text input: "Type a message…"
- Send button (red circle with arrow icon)
- Disabled while sending (spinner)

**Real-time:**
- On mount: subscribe to `support_responses` with `ticket_id=eq.{ticketId}` via `createBrowserClient()`
- `INSERT` event → append new message to local state (no full refetch)
- Unsubscribe on unmount

---

## Admin Support Page (`app/admin/support/`)

### Ticket list (unchanged)
Keep existing layout — list/grid of tickets with status, priority, category filters.

### Ticket detail panel — Chat bubbles

When an admin opens a ticket, replace the current plain textarea reply with:

**Message list:**
- Same bubble logic as member side but flipped:
  - Member bubbles: left-aligned, gray
  - Admin bubbles (responder_id === currentAdminId): right-aligned, brand red
- Shows ticket `description` as first bubble (member, left)
- All `support_responses` below in chronological order

**Status control:**
- Dropdown in the ticket detail header: Open → In Progress → Resolved → Closed
- Calls existing `updateTicketStatus` server action

**Bottom input bar:**
- Same design as member input bar
- Send calls `addResponse` with the ticket_id

**Real-time:**
- Subscribe to `support_responses` for the currently open ticket
- New member messages appear instantly

---

## Real-time Architecture

```
Supabase Realtime
  └─ Table: support_responses
       └─ Filter: ticket_id=eq.{ticketId}
            └─ Event: INSERT
                 └─ Append to local messages state (no refetch)
```

Use `createBrowserClient()` (already in `lib/supabase/client.ts`). One subscription per open chat thread, cleaned up on unmount or thread change.

---

## Notifications (unchanged)

Existing `addResponse` already sends notifications:
- Admin replies → member gets notified via `/member/support`
- Member replies → all admins get notified via `/admin/support`

No changes needed.

---

## Files to Change

| File | Change |
|---|---|
| `lib/actions/support.ts` | Add `responder_id` to responses select; add `getOrCreateThread` action |
| `app/member/support/support-client.tsx` | Full rewrite — category grid + chat thread UI + real-time |
| `app/member/support/page.tsx` | Pass `currentUserId` to client |
| `app/admin/support/support-client.tsx` | Replace reply textarea with chat bubble UI + real-time |
| `app/admin/support/page.tsx` | Pass `currentUserId` to client |

---

## Out of Scope

- File/image attachments in chat
- Read receipts
- Typing indicators
- Push notifications (beyond existing in-app notifications)
- AI auto-responses
