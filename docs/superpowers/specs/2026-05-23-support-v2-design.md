# Support Page V2 — Professional Redesign Spec
**Date:** 2026-05-23  
**Status:** Approved

---

## Overview

Redesign the member and admin support pages into a professional ticket-based system where members raise structured tickets from a predefined problem list, can open a chat on any ticket, and can close their own tickets. Admins can initiate or continue chat on any ticket and close it from their side too.

---

## Member Support Flow

### Screen 1 — Home (My Tickets + Raise Ticket button)

**Layout:**
- Header: "Support" title + subtitle "Get help from the Media & Tech team"
- Prominent **"+ Raise a Ticket"** button (brand red)
- Below: list of the member's existing tickets (all statuses)

**Ticket card (per ticket):**
- Category emoji + category label (left)
- Status chip: Open / In Progress / Resolved / Closed (right)
- Problem title (the selected problem text or custom "Other" text)
- Last updated time
- Two action buttons:
  - **"Open Chat"** (red, outlined) — opens the chat thread for this ticket
  - **"Close Ticket"** (gray, outlined) — shows confirmation dialog ("Are you sure you want to close this ticket? You won't be able to send further messages."), then sets status to `closed`
- If ticket is already `closed` or `resolved`: show status only, no action buttons

---

### Screen 2 — Raise a Ticket (category picker + problem list)

**Step 1 — Pick a category** (6 cards, 2-column grid):
- Technical Issues ⚙️
- Payroll Requests 💰
- Attendance Corrections 📅
- Client Support 🤝
- HR Helpdesk 👥
- Escalated Issues 🚨

**Step 2 — Pick a problem** (after selecting category, slide in the problem list):

| Category | Problem options |
|---|---|
| Technical | "App not loading", "Login issues", "Feature not working", "Slow performance", "Other" |
| Payroll | "Salary not received", "Wrong amount calculated", "Deduction issue", "Payslip missing", "Other" |
| Attendance | "Attendance marked wrong", "Leave not reflected", "Overtime not counted", "Other" |
| Client Support | "Client complaint", "Project update needed", "Delivery issue", "Other" |
| HR | "Leave not approved", "Policy question", "Onboarding issue", "Other" |
| Escalated | "Urgent unresolved issue", "Manager escalation", "Other" |

**"Other" option:**
- Tapping "Other" expands an inline text area: "Describe your problem…"
- Character limit: 300

**Step 3 — Submit:**
- "Raise Ticket" button (red, full width) — disabled if "Other" is selected but custom text is empty
- On success: navigate back to My Tickets (Screen 1), new ticket appears at top with status "Open"
- Server action: `createTicket({ title: selectedProblem, category, description: selectedProblem === 'Other' ? customText : selectedProblem, priority: 'normal' })`

---

### Screen 3 — Chat Thread

Same WhatsApp-style bubble UI from V1:
- Header: back arrow + problem title + status chip
- Message bubbles (member right/red, admin left/gray)
- Real-time via Supabase subscription
- Fixed bottom input bar
- **"Close Ticket"** button in header (only if status is `open` or `in_progress`) → confirmation dialog → sets status to `closed`

---

## Admin Support Flow

### Existing ticket list (unchanged layout)

Each ticket card/row gains two new buttons:
- **"Open Chat"** (if `support_responses.length > 0`: label "Continue Chat", else "Start Chat") → opens chat panel/modal
- **"Close Ticket"** → sets status to `closed`

### Chat panel

Same bubble UI. No layout change from V1 — just the button label logic above.

---

## Data Layer

### New server action: `closeTicket(ticket_id)`

```typescript
export async function closeTicket(ticket_id: string): Promise<{ success: boolean; error?: string }>
```

- Checks auth via `getProfile()`
- Members can only close their own tickets (`user_id = profile.id`)
- Admins can close any ticket in their company
- Updates `status = 'closed'` and `updated_at = now()`
- Calls `revalidatePath` on both support paths

### Existing actions (unchanged)
- `createTicket` — used for ticket creation (no changes needed)
- `addResponse` — used for chat messages (no changes needed)
- `updateTicketStatus` — admin-only, already exists (used internally by `closeTicket` for admins)

---

## Files to Change

| File | Change |
|---|---|
| `lib/actions/support.ts` | Add `closeTicket` server action |
| `app/member/support/support-client.tsx` | Full rewrite — Home screen + Raise Ticket flow + Chat view |
| `app/admin/support/support-client.tsx` | Add "Start/Continue Chat" + "Close Ticket" buttons to ticket cards |

---

## Out of Scope

- Email/push notifications on ticket close
- Member cannot reopen a closed ticket (admin can via `updateTicketStatus`)
- File attachments
- Ticket priority selection by member (always `normal`)
