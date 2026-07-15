# AI Content Ideas — Design

Source: client follow-up on the "Content Ideas" Quick Action button in the Admin
Content Calendar, which previously did nothing (`action: () => {}`). Approved via
brainstorming — **not yet implemented**, saved here for a later development pass.

## Problem

The "Content Ideas" (AI Suggestions) Quick Action on `app/admin/content-calendar`
has never had a real implementation. The client wants a working AI-assisted content
idea generator, but flagged that generic suggestions are useless without knowing
which client/niche the ideas are for.

## Scope

Admin Content Calendar only. The Member Content Calendar's Quick Actions block
(`app/member/content-calendar/content-calendar-client.tsx`) has a different set of
buttons (Create Post / View All / Mark Uploaded / Calendar) with no "Content Ideas"
entry — out of scope, no change there.

## Design

**Trigger:** Clicking "Content Ideas" opens a small modal containing a text input
(placeholder: "What kind of ideas do you need? e.g. Instagram reels for a fitness
studio launch") and a "Generate" button. No client picker, no pre-filled context —
the client explicitly rejected requiring a client selection first in favor of typing
a free-text brief each time.

**Generation:** On submit, a new Server Action generates ideas by calling Claude,
following the exact pattern already established in this codebase at
`app/api/webhooks/whatsapp/route.ts:344-371` (`interpretAttendanceText`):
- Model: `claude-haiku-4-5-20251001` (same as the existing WhatsApp integration —
  don't introduce a different model or provider)
- Dynamic import: `const { default: Anthropic } = await import('@anthropic-ai/sdk')`
- `new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })`
- Prompt asks for **8 short one-line content idea titles** based on the user's typed
  brief, and instructs the model to return JSON only:
  `{"ideas": ["...", "...", ...]}` (8 strings)
- Parse the response the same way the WhatsApp handler does
  (`msg.content[0].type === 'text'` then `JSON.parse`)

**Display:** Ideas render as a plain list inside the modal — read-only, no
"use this idea" action, no platform/content-type/reasoning metadata attached to
each idea (client explicitly chose the simpler option over a richer card format).
A "Generate More" button re-submits the same brief to get a fresh batch of 8
without the user retyping it.

**Error handling:** If `ANTHROPIC_API_KEY` is unset or the API call throws, the
Server Action returns a `{ success: false, error: "..." }` shape (matching this
codebase's established Server Action error-return convention — see
`lib/actions/content-calendar.ts`'s existing `createContentPost` etc.). The modal
shows a friendly inline message ("Content ideas aren't available right now")
instead of crashing — mirrors the `if (!apiKey) return null` fallback already used
in `interpretAttendanceText`.

**Persistence:** None. Ideas are ephemeral per-generation — no new database table
or column. Closing the modal discards them.

**Prerequisite before this can actually work in production:** `ANTHROPIC_API_KEY`
is not currently set in `.env.local` (only present in `.env.local.example`, per
investigation during brainstorming). The client needs to add a real key before this
feature will generate anything — until then it should fail gracefully with the
friendly error message above, not silently do nothing the way the old stub button did.

## Out of scope (explicitly deferred, not part of this spec)

- Client-context-aware suggestions (picking a client and using their stored
  `industry`/`service` fields, or their recent post history, as AI context) — the
  client considered this and explicitly chose the simpler free-text-brief flow
  instead for this iteration.
- Turning a generated idea directly into a scheduled post ("use this idea" →
  pre-fill Create Post form) — explicitly declined in favor of read-only display.
- Rate limiting / per-user generation caps — not requested; this is an internal
  tool for a small team, not public-facing.
